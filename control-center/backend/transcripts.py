#!/usr/bin/env python3
"""Compteurs de tokens par passage d'agent — lecture HORS de la racine du
dépôt, sous `~/.claude/projects/…` (feature-023, GATE P1 S5).

## Le franchissement, et ce qui le borne

Chaque sous-agent laisse un transcript complet de sa conversation sous
`~/.claude/projects/<projet encodé>/<session>/subagents/agent-<id>.jsonl` —
en dehors du dépôt, jamais écrit par ce serveur. Ce module lit CES fichiers
pour en extraire deux compteurs par `agent_id`, et RIEN d'autre : aucun
message, aucun chemin, aucun extrait de texte n'en sort (S5.3/S5.4).

Quatre garanties, chacune vérifiée par un test dédié plutôt qu'affirmée :

- **S5.1 — racine confinée au projet courant.** Calculée depuis
  l'environnement et la configuration SEULEMENT (`racine()` ci-dessous),
  jamais depuis une donnée de requête. `~/.claude/projects/-root-agent-kit`
  pour ce dépôt, PAS `~/.claude/projects/` tout entier (271 fichiers contre
  488, feature-023 fait 5).
- **S5.2 — un seul nom de fichier possible.** `agent_id` doit matcher
  `^[0-9a-f]{1,32}$` AVANT d'entrer dans un chemin, et le chemin résultant
  repasse par `vcs.chemin_sur()` (même garde que le confinement git) : un
  `agent_id` forgé (`../../x`) n'ouvre jamais rien hors de `racine()`.
- **S5.3 — filtre POSITIF, typé.** `usage` porte des chaînes et des dicts
  imbriqués (`cache_creation`, `inference_geo`, `iterations`,
  `output_tokens_details`, `server_tool_use`, `service_tier`, `speed` —
  mesuré sur un vrai transcript) : SEULES `input_tokens` et `output_tokens`
  sortent, et seulement si leur valeur est un `int` (pas un `bool`, sous-type
  d'`int` en Python). Recopier `usage` ferait sortir du texte.
- **S5.6 — budget par instantané.** Temps ET octets, tous deux bornés ; au
  premier dépassement, la lecture s'arrête et `partiel` devient vrai. Sans
  cette borne, `/api/etat` — rappelé à chaque signal SSE — relirait jusqu'à
  270 Mo par appel : un déni de service auto-infligé.

## Ce que ce module ne fait JAMAIS

Aucune écriture, aucune suppression, aucun renommage : `S5.5` (vérifié par
introspection AST dans `test_transcripts.py`). Aucun sous-processus non plus
— la racine se calcule depuis l'environnement (`CLAUDE_CONFIG_DIR`, `HOME`)
et une règle d'encodage, jamais en interrogeant le binaire `claude`. Voir
« Pourquoi la règle d'encodage plutôt que `claude auth status` » plus bas.

## Absence propre, jamais un zéro

Un `agent_id` sans transcript lisible (introuvable, hors racine, permission
refusée — S5.7, le serveur tourne en root ici et lit du `0600`) est ABSENT de
`par_agent`. Ce n'est jamais `{"input_tokens": 0, "output_tokens": 0}` : un
zéro affiché se lirait comme « ce passage n'a rien consommé », une
affirmation fausse sur un passage dont on ne sait simplement rien.

## Pourquoi la règle d'encodage plutôt que `claude auth status`

`feature-026` (todo, non implémentée) a mesuré que `claude auth status` rend
un JSON portant `projectsDirectory`, qui suit `CLAUDE_CONFIG_DIR`. Lire ce
champ était une option pour S5.1. Elle est ÉCARTÉE ici :

1. **C'est exactement la condition écrite par le GATE** (S5.1 : « racine de
   lecture calculée depuis l'environnement/config SEULEMENT :
   `~/.claude/projects/<encodage de racine>` ») — la règle d'encodage la
   satisfait au mot près, sans dérivation.
2. **`feature-026` n'est pas construite.** S'appuyer ici sur un mécanisme
   encore en `todo/` couplerait ce lot, déjà sous conditions GATE, à un
   comportement futur non stabilisé (multi-compte, `CLAUDE_CONFIG_DIR` par
   service) qui peut changer la sémantique de `projectsDirectory` sans que
   ce module le sache.
3. **Un sous-processus est une classe de risque que ce lot n'a pas besoin
   d'ouvrir.** Le GATE P1 relève déjà, sur les LOTS voisins (S1/S3), qu'un
   `Popen` mal gardé élève le plafond de ce qu'un jeton achète ; introduire
   un appel externe dans le SEUL module de ce cycle qui doit rester
   lecture-seule brouillerait cette frontière sans bénéfice mesuré ici.
4. **Le budget (S5.6) est per-instantané** : un sous-processus (latence,
   échec, blocage) est plus dur à borner et à tester qu'un `os.environ.get`
   pur. La consigne du brief (« si tu l'utilises, borne-le et dis quand il
   est appelé ») signale elle-même le coût — ce module l'évite entièrement.

`CLAUDE_CONFIG_DIR` reste lu ici, mais comme variable d'ENVIRONNEMENT
(`os.environ.get`), jamais via un appel au binaire.
"""

import json
import os
import re
import time

import vcs as V

# `^[0-9a-f]{1,32}$` — mesuré sur le journal réel (feature-023 fait 7,
# re-mesuré par le GATE P1 : 17 hexadécimaux, 15 569/15 569 occurrences).
# Un `agent_id` qui ne matche pas n'entre JAMAIS dans un chemin (S5.2).
_RE_AGENT_ID = re.compile(r"^[0-9a-f]{1,32}$")

# Une ligne JSON au-delà de cette taille n'est jamais chargée entière en
# mémoire : `_lire_fichier` la découpe en morceaux bornés par `readline(n)`,
# chacun trop court pour reconstituer un JSON valide — donc ignorée, jamais
# un objet partiel mal interprété.
_TAILLE_LIGNE_MAX = 2_000_000

# Clés RETENUES de `usage`, et seulement si leur valeur est un `int` non
# booléen (S5.3). Toute septième clé mesurée sur un vrai transcript
# (`cache_creation`, `inference_geo`, `iterations`, `output_tokens_details`,
# `server_tool_use`, `service_tier`, `speed`) est un dict, une liste ou une
# chaîne : hors de cette liste, elle ne sort jamais.
_CLES_USAGE = ("input_tokens", "output_tokens")


def racine(config):
    """Racine de lecture des transcripts pour CE projet, ou `None`.

    Calcul, dans l'ordre (S5.1, zéro donnée de requête) :

    1. `[transcripts].racine` du projet, si déclarée en chemin ABSOLU
       (`config.transcripts_racine_surcharge()`) ;
    2. à défaut, `$CLAUDE_CONFIG_DIR` (ou `~/.claude` si la variable est
       absente) `/projects/<racine du projet, `/` -> `-`>` — la même
       convention que celle mesurée sur ce dépôt (`-root-agent-kit`).

    Rend `None` si le répertoire résultant n'existe pas : absence propre
    (S5.4/S5.7), jamais une racine qui n'existe pas ni une exception.
    """
    surcharge = config.transcripts_racine_surcharge()
    if surcharge is not None:
        chemin = surcharge
    else:
        base = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude")
        try:
            projet = os.path.realpath(config["_racine_projet"])
        except (OSError, ValueError, TypeError):
            return None
        encodee = projet.replace(os.sep, "-")
        chemin = os.path.join(base, "projects", encodee)
    try:
        if not os.path.isdir(chemin):
            return None
    except OSError:
        return None
    return chemin


def _lire_fichier(chemin, budget_octets, taille_ligne_max=None):
    """Lit UN transcript en flux, ligne par ligne, borné en octets.

    Rend `(entree, sortie, octets_lus, partiel)`, ou `None` si le fichier est
    introuvable, illisible (permission refusée — S5.7) ou pas un fichier
    régulier : absence propre, l'appelant n'ajoute alors RIEN pour cet
    `agent_id`, jamais un zéro.

    Chaque `readline(taille_ligne_max + 1)` borne la quantité de mémoire
    utilisée pour UNE ligne, quelle que soit sa longueur réelle sur disque —
    une ligne plus longue que la borne est lue par morceaux, chacun trop
    court pour former un JSON valide, donc silencieusement ignorée (elle ne
    correspond à aucun message réel : un message légitime tient largement
    sous 2 Mo). Le journal peut grandir PENDANT la lecture (`PIEGES §4`) :
    cette fonction ne relit jamais depuis le début, elle avance jusqu'à ce
    qu'un `readline` rende une chaîne vide ou que le budget soit atteint.
    """
    if taille_ligne_max is None:
        # Lu au moment de l'APPEL, jamais figé comme défaut d'argument : un
        # test peut abaisser `_TAILLE_LIGNE_MAX` pour exercer la borne sans
        # fabriquer une ligne de 2 Mo (même patron que `V._MAX_COMMITS`).
        taille_ligne_max = _TAILLE_LIGNE_MAX
    entree = 0
    sortie = 0
    octets_lus = 0
    partiel = False
    try:
        with open(chemin, "r", encoding="utf-8", errors="replace") as fichier:
            while True:
                if octets_lus >= budget_octets:
                    partiel = True
                    break
                ligne = fichier.readline(taille_ligne_max + 1)
                if not ligne:
                    break
                octets_lus += len(ligne.encode("utf-8", "replace"))
                if len(ligne) > taille_ligne_max:
                    continue  # morceau d'une ligne trop longue : ignoré
                ligne = ligne.strip()
                if not ligne:
                    continue
                try:
                    objet = json.loads(ligne)
                except (json.JSONDecodeError, ValueError):
                    continue  # ligne invalide : ignorée, la lecture continue
                if not isinstance(objet, dict):
                    continue
                message = objet.get("message")
                if not isinstance(message, dict):
                    continue
                usage = message.get("usage")
                if not isinstance(usage, dict):
                    continue
                valeur = usage.get("input_tokens")
                if isinstance(valeur, int) and not isinstance(valeur, bool):
                    entree += valeur
                valeur = usage.get("output_tokens")
                if isinstance(valeur, int) and not isinstance(valeur, bool):
                    sortie += valeur
    except (OSError, UnicodeError):
        return None
    return entree, sortie, octets_lus, partiel


def lire_tokens_par_passage(config, agent_ids):
    """Compteurs de tokens des passages désignés par `agent_ids`.

    `agent_ids` vient de l'appelant (`server.py` : les `agent_id` des
    passages qu'`/api/etat` affiche RÉELLEMENT) — ce module ne parcourt
    jamais `subagents/` de sa propre initiative. C'est ce qui rend
    « compteurs seulement » vérifiable : un `agent_id` qui n'a jamais été
    demandé n'est jamais ouvert.

    Rend `{"partiel": bool, "par_agent": {agent_id: {"input_tokens": int,
    "output_tokens": int}}}`. `partiel` devient vrai dès qu'un budget (temps
    OU octets, S5.6) a coupé la lecture avant son terme naturel — le champ
    l'annonce, il ne le cache jamais.
    """
    racine_lue = racine(config)
    if racine_lue is None:
        return {"partiel": False, "par_agent": {}}

    budget_secondes = config.transcripts_budget_secondes()
    budget_octets = config.transcripts_budget_octets()

    resultat = {}
    octets_lus_total = 0
    partiel = False
    debut = time.monotonic()

    # Ordre déterministe : la dégradation sous budget touche toujours les
    # mêmes `agent_id` en premier à budget égal, reproductible en test —
    # elle ne dépend jamais de l'ordre de fourniture par l'appelant (un
    # ensemble Python n'en garantit aucun).
    for agent_id in sorted({a for a in agent_ids if a}):
        if not isinstance(agent_id, str) or not _RE_AGENT_ID.match(agent_id):
            continue  # S5.2 : jamais construit à partir d'un identifiant hostile
        if time.monotonic() - debut >= budget_secondes:
            partiel = True
            break
        if octets_lus_total >= budget_octets:
            partiel = True
            break
        relatif = V.chemin_sur(racine_lue, os.path.join("subagents", "agent-%s.jsonl" % agent_id))
        if relatif is None:
            continue  # hors racine (réalisé impossible ici vu le regex, filet quand même)
        chemin = os.path.join(racine_lue, relatif)
        lecture = _lire_fichier(chemin, budget_octets - octets_lus_total)
        if lecture is None:
            continue  # absence propre (S5.7) : introuvable ou illisible
        entree, sortie, octets_lus, partiel_fichier = lecture
        octets_lus_total += octets_lus
        if partiel_fichier:
            partiel = True
        if entree or sortie:
            resultat[agent_id] = {"input_tokens": entree, "output_tokens": sortie}

    return {"partiel": partiel, "par_agent": resultat}
