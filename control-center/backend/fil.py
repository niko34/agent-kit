#!/usr/bin/env python3
"""Lecture du fil de la session Claude remote (feature-026, A2).

Un des DEUX seuls modules du centre de contrôle autorisés à faire sortir du
texte brut d'UN fichier de transcript (condition 9 du GATE P1, `ADR-0042`
amende `ADR-0041` — « compteurs seulement » devient une propriété de
`transcripts.py`, pas de ce module). `fil.py` lit le transcript PRINCIPAL
de la session remote (`<session-id>.jsonl`), jamais les sous-agents de
`transcripts.py`/`feature-023`. Il APPELLE `transcripts.racine(config)` côté
appelant plutôt que de redériver une racine — voir `server.py`.

## Filtre POSITIF (D1, condition 1 du GATE)

`interpreter_ligne()` ne rend un message que si TOUS ces critères tiennent :

1. `type` ∈ {`"user"`, `"assistant"`} — tout le reste (`bridge-session`,
   `queue-operation`, `attachment`, `system`, `mode`, `atis-latch`, ou tout
   type inconnu) → `None`.
2. `isMeta` n'est PAS vrai — MÊME SI `type` est `user`/`assistant` : les
   rapports de sous-agents (jusqu'à 35 548 caractères mesurés) voyagent
   dans des enregistrements `type: user, isMeta: true`, et seraient sinon
   rendus comme des messages humains.
3. `promptSource` n'est PAS `"system"` (texte injecté par le pont, pas par
   l'humain).
4. Le contenu porte du texte : `message.content` en `str` directe, OU au
   moins un bloc `{"type": "text", …}` dans une liste — un message qui ne
   porte que `tool_result`/`tool_use`/`thinking` rend `None`. `thinking`
   n'est délibérément jamais exposé.

`prompt_source` est exposé BRUT (`"queued"`, `"typed"`, ou `None`), jamais
interprété : l'hypothèse « une frappe cockpit produit `typed` » n'est pas
mesurable sans taper dans la session réelle (GATE P1).

## Lecture bornée (D2) — et mémoïsée (A7)

`lire_fil()` ne lit JAMAIS le fichier entier : elle prend la QUEUE bornée
par `max_octets`, en ignore la première ligne (probablement partielle), et
borne chaque ligne individuelle à `taille_ligne_max` (une ligne plus longue
est un candidat hostile, jamais un message légitime — ignorée, jamais
chargée entière). Un message interprété est tronqué à
`max_caracteres_message` caractères ; au-delà de `max_messages`, seuls les
plus RÉCENTS sont gardés.

⚠️ Reboucle GATE (revue de code) — le docstring affirmait à tort « même
patron que `transcripts.py` (…) la clé s'invalide elle-même » : FAUX ici.
`transcripts.py` mémoïse des transcripts TERMINÉS (jeu de clés borné par le
nombre de fichiers) ; ce module lit un transcript ACTIF, dont `mtime`/
`taille` changent à CHAQUE écriture — la clé ne s'invalide pas, elle
S'ACCUMULE. Mesuré : 200 écritures simulées -> 200 entrées, 2,6 Mo retenus,
jamais libérés ; à la cadence mesurée de ce cycle (1431 fenêtres
d'écriture/24 h), ~227 Mo/jour non bornés — sous un service à
`MemoryMax=2400M`, après un dépôt qui a déjà payé un OOM.

**Correctif (B3a)** : UNE SEULE entrée PAR CHEMIN, jamais par tuple complet
— une écriture qui change `mtime`/`taille` REMPLACE l'entrée existante du
même `chemin`, elle n'en ajoute jamais une seconde. `len(_cache)` est donc
borné par le nombre de fichiers DISTINCTS jamais demandés — pour ce module,
un seul transcript actif à la fois en pratique. La fraîcheur reste garantie
de la même façon : une entrée ne sert que si `(mtime, taille, bornes)`
correspond EXACTEMENT à l'appel courant, sinon elle est recalculée et
REMPLACÉE (pas cumulée). Mesuré (voir le rapport de cette passe) : la
fenêtre entre deux signaux SSE (~2 s) ne porte une écriture que dans une
minorité de cas, donc la mémoïsation évite l'immense majorité des lectures
redondantes, SANS accumulation.
"""

import json
import os
import threading

_verrou_cache = threading.Lock()
_cache = {}


def interpreter_ligne(objet):
    """`dict` déjà `json.loads()` (une ligne du transcript) -> `None` ou
    `{"role": "user"|"assistant", "texte": str, "prompt_source": str|None,
    "ts": str|None}`. PURE : aucune E/S.

    `ts` — mesuré après coup (rapport de cette passe, sur demande du
    coordinateur) : le champ `timestamp` du transcript est présent sur
    599/599 enregistrements `user`/`assistant` non-`isMeta` du transcript
    actif, en ISO-8601 UTC avec millisecondes (`"2026-09-22T11:01:10.170Z"`).
    Recopié TEL QUEL, sans conversion ni fuseau ni formatage — le frontal
    fait l'affichage. `None` si le champ est absent : jamais un horodatage
    de LECTURE qui se ferait passer pour un horodatage d'ÉMISSION (même
    discipline que `prompt_source`, exposé brut, jamais fabriqué)."""
    if not isinstance(objet, dict):
        return None
    type_ = objet.get("type")
    if type_ not in ("user", "assistant"):
        return None
    if objet.get("isMeta"):
        return None
    if objet.get("promptSource") == "system":
        return None

    message = objet.get("message")
    if not isinstance(message, dict):
        return None
    content = message.get("content")

    texte = None
    if isinstance(content, str):
        texte = content
    elif isinstance(content, list):
        morceaux = [bloc.get("text") for bloc in content
                    if isinstance(bloc, dict) and bloc.get("type") == "text"
                    and isinstance(bloc.get("text"), str)]
        if morceaux:
            texte = "".join(morceaux)

    if not texte:
        return None

    return {"role": type_, "texte": texte, "prompt_source": objet.get("promptSource"),
            "ts": objet.get("timestamp")}


def _lire_fil_sans_cache(chemin, max_messages, max_octets, taille_ligne_max, max_caracteres_message):
    try:
        taille = os.path.getsize(chemin)
    except OSError:
        return [], False, 0

    messages = []
    octets_lus = 0
    tronque = False

    try:
        with open(chemin, "rb") as fichier:
            if taille > max_octets:
                tronque = True
                fichier.seek(taille - max_octets)
                # Ligne de tête probablement partielle : écartée, comme
                # `server._lire_conversation`/`transcripts._lire_fichier` —
                # bornée pour ne jamais charger un fragment de ligne géant.
                fichier.readline(taille_ligne_max + 1)

            while True:
                if octets_lus >= max_octets:
                    tronque = True
                    break
                brut = fichier.readline(taille_ligne_max + 1)
                if not brut:
                    break
                octets_lus += len(brut)
                if len(brut) > taille_ligne_max:
                    continue  # ligne trop longue : jamais chargée entière
                try:
                    ligne = brut.decode("utf-8", errors="replace").strip()
                except UnicodeError:
                    continue
                if not ligne:
                    continue
                try:
                    objet = json.loads(ligne)
                except (json.JSONDecodeError, ValueError):
                    continue  # ligne invalide (ou fragment d'une ligne coupée)
                interprete = interpreter_ligne(objet)
                if interprete is None:
                    continue
                texte = interprete.get("texte", "")
                if len(texte) > max_caracteres_message:
                    interprete = dict(interprete, texte=texte[:max_caracteres_message])
                    tronque = True
                messages.append(interprete)
    except OSError:
        return [], False, 0

    if len(messages) > max_messages:
        tronque = True
        messages = messages[-max_messages:]  # les plus RÉCENTS (fin du fichier)

    return messages, tronque, octets_lus


# Bornes par défaut de `lire_fil` — nommées (B2, feature-026 reboucle GATE)
# pour que `server.py` puisse les RÉUTILISER lors de la fusion avec le
# journal propre du cockpit, plutôt que de dupliquer `40`/`4 Mio` en dur :
# la fusion ne doit jamais contourner ces bornes.
MAX_MESSAGES_DEFAUT = 40
MAX_OCTETS_DEFAUT = 4 * 1024 * 1024


def lire_fil(chemin, max_messages=MAX_MESSAGES_DEFAUT, max_octets=MAX_OCTETS_DEFAUT,
             taille_ligne_max=2 * 1024 * 1024, max_caracteres_message=4096):
    """Rend `(messages, tronque, octets_lus)` — lecture BORNÉE (D2, jamais
    plus de `max_octets` lus, jamais une ligne de plus de `taille_ligne_max`
    chargée entière, jamais plus de `max_messages` messages rendus, chaque
    message tronqué à `max_caracteres_message` caractères) et MÉMOÏSÉE (A7),
    UNE SEULE entrée PAR CHEMIN (B3a — `len(_cache)` reste borné par le
    nombre de fichiers distincts jamais demandés, jamais par le nombre
    d'écritures)."""
    try:
        info = os.stat(chemin)
    except OSError:
        return [], False, 0

    cle_valeurs = (info.st_mtime, info.st_size,
                   max_messages, max_octets, taille_ligne_max, max_caracteres_message)
    with _verrou_cache:
        entree = _cache.get(chemin)
        if entree is not None and entree[0] == cle_valeurs:
            return entree[1]

    resultat = _lire_fil_sans_cache(chemin, max_messages, max_octets,
                                     taille_ligne_max, max_caracteres_message)
    with _verrou_cache:
        # REMPLACE l'entrée existante de CE chemin, ne s'accumule jamais.
        _cache[chemin] = (cle_valeurs, resultat)
    return resultat
