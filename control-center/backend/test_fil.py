#!/usr/bin/env python3
"""Gardes D1/D2 pour `fil.py` (feature-026, écrites AVANT le module,
`ADR-0038` — « gardes avant code, registre ATTENDU_ROUGE »).

    python3 control-center/backend/test_fil.py

## Ce que ce fichier garde

`fil.py` n'existe pas encore (livrable A2 du backend-developer). Ce module
sera le SEUL, avec `session_tmux.py`, autorisé à faire sortir du texte brut
d'UN fichier (condition 9 du GATE P1, `ADR-0042` amende `ADR-0041`) : le
transcript PRINCIPAL de la session remote (`<session-id>.jsonl`), pas les
sous-agents de `transcripts.py`/feature-023.

Contrat attendu par cette garde (nommé ici pour que la garde soit
exécutable dès que le module existe — pas une invention d'architecture,
une reprise littérale des décisions déjà actées par l'architecte et le
GATE P1 dans le journal de bord de la spec) :

- `fil.interpreter_ligne(objet)` — PURE, prend un `dict` déjà `json.loads()`
  (une ligne du transcript) et rend soit `None` (à ignorer), soit
  `{"role": "user"|"assistant", "texte": str, "prompt_source": <brut ou None>,
  "ts": <brut ou None>}` (`ts` : voir « Cas TS_* » plus bas, ajouté après la
  clôture du lot 3). Filtre POSITIF (D1, CONDITION 1 DU GATE) :
    1. `type` doit être `"user"` ou `"assistant"` — tout le reste (
       `bridge-session`, `queue-operation`, `attachment`, `system`, `mode`,
       `atis-latch`, ou tout type inconnu) → `None`.
    2. `isMeta` vrai → `None`, MÊME SI `type` est `user`/`assistant` (les
       rapports de sous-agents, jusqu'à 35 548 caractères mesurés, voyagent
       dans des enregistrements `type: user, isMeta: true`).
    3. `promptSource == "system"` → `None`.
    4. Le contenu doit porter du texte : `message.content` en `str` directe,
       OU au moins un bloc `{"type": "text", "text": …}` dans une liste de
       blocs — un message qui ne porte que `tool_result`/`tool_use`/
       `thinking` rend `None` (l'architecte : `thinking` n'est PAS exposé,
       décision, pas oubli).
  Le `prompt_source` exposé est la valeur BRUTE de `promptSource` (`"queued"`,
  `"typed"`, ou `None` si absent) — jamais interprétée (le GATE : l'hypothèse
  « une frappe cockpit produit `typed` » n'est pas mesurable sans taper dans
  la session réelle).

## Cas `TS_*` — AJOUTÉS après la clôture du lot 3 (backend-developer)

Contrat NEUF, pas une réécriture de D1/D2 : le coordinateur a mesuré que le
champ `timestamp` est présent sur 599/599 enregistrements `user`/`assistant`
non-`isMeta` du transcript actif (ISO-8601 UTC, millisecondes). `fil.py`
recopie donc cette valeur BRUTE sous la clé `"ts"` — aucune conversion,
aucun fuseau, aucun formatage — et rend `"ts": None` si `timestamp` est
absent, jamais une valeur inventée (même discipline que `prompt_source`).
Ces deux cas ne vivent PAS dans `ATTENDU_ROUGE` : `fil.py` existe déjà
quand ils sont écrits, ce sont des assertions vertes dès leur premier run,
pas des gardes posées avant le code.

- `fil.lire_fil(chemin, max_messages=40, max_octets=4*1024*1024,
  taille_ligne_max=2*1024*1024, max_caracteres_message=4096)` — lecture
  BORNÉE (D2) : jamais plus de `max_octets` lus au total, jamais plus de
  `max_messages` messages interprétés rendus, jamais une ligne de plus de
  `taille_ligne_max` chargée entière, un message individuel tronqué à
  `max_caracteres_message` caractères. Rend
  `(messages, tronque, octets_lus)` — `octets_lus` existe pour que CETTE
  garde puisse épingler la borne plutôt que la supposer tenue (la déduire
  d'un temps d'exécution ne prouverait rien).

## Discipline ATTENDU_ROUGE (`ADR-0038 §2`)

Chaque assertion encore fausse aujourd'hui (module absent) est enregistrée
avec son lot de clôture. `check_rouge()` absorbe un échec du registre en
LOG seulement (pas compté comme échec de suite) ; il échoue BRUYAMMENT si
une entrée du registre se met à passer sans avoir été retirée (clause 2),
ou si une entrée n'a pas de lot de clôture nommé.

## Mutation (D6) — état à cette passe

`fil.py` n'existe pas : aucune mutation n'est possible sur un module qui
n'a pas de code. `ADR-0038 §1` le dit explicitement : « vu rouge » ne
remplace jamais la mutation, elle reste DUE — y compris pour une garde
écrite avant le code. Ce fichier ne prétend donc PAS avoir mutation-testé
`interpreter_ligne`/`lire_fil` : c'est un chantier ouvert, à solder au lot
qui livre `fil.py` (voir le rapport de cette passe).
"""

import json
import os
import sys
import tempfile

_ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _ICI)

try:
    import fil as FIL  # noqa: E402
except ImportError:
    FIL = None

_echecs = []
_tests = 0


def check(nom, condition, detail=""):
    global _tests
    _tests += 1
    if condition:
        print("  ok     %s" % nom)
    else:
        _echecs.append(nom)
        print("  ECHEC  %s%s" % (nom, (" : " + detail) if detail else ""))


# ATTENDU_ROUGE — une entrée par assertion encore fausse, avec son lot de
# clôture et sa date. `fil.py` est un livrable neuf du backend-developer :
# TOUTES les assertions comportementales sont rouges tant qu'il n'existe pas.
ATTENDU_ROUGE = {
    # Toutes les entrées D1/D2 ont fermé au lot 3 (backend-developer, A2) :
    # `fil.py` existe et les 20 assertions comportementales sont vertes
    # (voir le rapport de cette passe). Registre vidé plutôt que supprimé —
    # même discipline que `test_session_tmux.py`.
}


def check_rouge(nom, condition, detail=""):
    """Comme `check()`, mais une entrée `ATTENDU_ROUGE` absorbe un échec
    ATTENDU en LOG seulement (pas compté). Échoue bruyamment si la condition
    devient vraie alors que l'entrée est encore dans le registre (clause 2)."""
    global _tests
    entree = ATTENDU_ROUGE.get(nom)
    if condition:
        if entree is not None:
            _tests += 1
            _echecs.append(nom + "_ATTENDU_ROUGE_PASSE_SANS_ETRE_RETIRE")
            print("  ECHEC  %s : assertion VERTE mais l'entrée est encore dans "
                  "ATTENDU_ROUGE (clause 2) — la retirer" % nom)
        else:
            check(nom, True)
    else:
        if entree is not None:
            print("  (ATTENDU_ROUGE) %s : %s — clôture %s"
                  % (nom, detail, entree["lot_de_cloture"]))
        else:
            check(nom, False, detail)


# ---------------------------------------------------------------------------
# Témoins D1 — SYNTHÉTIQUES, construits par ce test, jamais extraits d'un
# transcript réel (même discipline que D5 : « un caviardage ne se vérifie
# pas »). Les proportions mesurées (journal, lot 0/GATE P1 : user 1147,
# assistant 2293, attachment 1238, queue-operation 554, system 378,
# bridge-session 376, mode 375, atis-latch 375, sur 10 000 lignes) motivent
# le CHOIX des types couverts, elles ne sont pas rejouées ici en volume.
# ---------------------------------------------------------------------------

_TEMOINS_TYPES_EXCLUS = {
    "D1_bridge_session_jamais_message": {"type": "bridge-session", "socket": "x"},
    "D1_queue_operation_jamais_message": {"type": "queue-operation", "op": "enqueue"},
    "D1_attachment_jamais_message": {"type": "attachment", "path": "/tmp/x.png"},
    "D1_system_jamais_message": {"type": "system", "subtype": "init"},
    "D1_mode_jamais_message": {"type": "mode", "mode": "auto"},
    "D1_atis_latch_jamais_message": {"type": "atis-latch", "latched": True},
    # C1 (reboucle GATE, validation par mutation) : TOUS les témoins
    # ci-dessus n'ont pas de `message` — le garde-fou de FORME
    # (`not isinstance(message, dict)`) masque celui de TYPE : neutraliser
    # le filtre `type not in (...)` ne tuait aucun test, puisque le
    # garde-fou de forme rendait `None` de toute façon. CE témoin PORTE un
    # `message.content` texte valide : seul le filtre de TYPE peut encore
    # le faire échouer.
    "C1_system_avec_message_valide_jamais_message": {
        "type": "system",
        "message": {"role": "user", "content": "ne doit jamais sortir : type=system"},
    },
}

_TEMOIN_USER_SIMPLE = {
    "type": "user", "promptSource": "typed",
    "message": {"role": "user", "content": "Bonjour depuis le cockpit"},
}

# CONDITION 1 DU GATE — le témoin le plus important de ce fichier : un
# rapport de sous-agent, `type: user`, `isMeta: true`, contenu CHAÎNE long.
_TEMOIN_ISMETA_RAPPORT = {
    "type": "user", "isMeta": True,
    "message": {"role": "user", "content": "RAPPORT SOUS-AGENT — " + ("x" * 200)},
}

_TEMOIN_USER_TOOL_RESULT_SEUL = {
    "type": "user",
    "message": {"role": "user", "content": [
        {"type": "tool_result", "tool_use_id": "abc", "content": "ok"},
    ]},
}

_TEMOIN_USER_PROMPTSOURCE_SYSTEM = {
    "type": "user", "promptSource": "system",
    "message": {"role": "user", "content": "texte injecté par le pont, pas par l'humain"},
}

_TEMOIN_ASSISTANT_TEXTE = {
    "type": "assistant",
    "message": {"role": "assistant", "content": [
        {"type": "text", "text": "Voici la réponse."},
    ]},
}

_TEMOIN_ASSISTANT_TOOL_USE_SEUL = {
    "type": "assistant",
    "message": {"role": "assistant", "content": [
        {"type": "tool_use", "name": "Bash", "input": {"command": "ls"}},
    ]},
}

_TEMOIN_ASSISTANT_THINKING_SEUL = {
    "type": "assistant",
    "message": {"role": "assistant", "content": [
        {"type": "thinking", "thinking": "réflexion interne, jamais exposée"},
    ]},
}

_TEMOIN_ASSISTANT_MIXTE = {
    "type": "assistant",
    "message": {"role": "assistant", "content": [
        {"type": "tool_use", "name": "Bash", "input": {}},
        {"type": "text", "text": "Fait."},
    ]},
}

_TEMOIN_USER_QUEUED = {
    "type": "user", "promptSource": "queued",
    "message": {"role": "user", "content": "message envoyé depuis le téléphone"},
}

# Témoins TS_* — contrat AJOUTÉ après la clôture du lot 3 (voir l'en-tête du
# fichier) : valeur mesurée sur le transcript actif, ISO-8601 UTC avec
# millisecondes, jamais inventée.
_TEMOIN_AVEC_TIMESTAMP = {
    "type": "assistant", "timestamp": "2026-09-22T11:01:10.170Z",
    "message": {"role": "assistant", "content": [
        {"type": "text", "text": "Réponse horodatée."},
    ]},
}

_TEMOIN_SANS_TIMESTAMP = {
    "type": "user",
    "message": {"role": "user", "content": "message sans champ timestamp"},
}


def test_TS_champ_ts():
    if FIL is None:
        check("TS_champ_timestamp_recopie_tel_quel", False, "fil.py absent")
        check("TS_absence_timestamp_rend_None", False, "fil.py absent")
        return

    r = FIL.interpreter_ligne(_TEMOIN_AVEC_TIMESTAMP)
    check("TS_champ_timestamp_recopie_tel_quel",
          r is not None and r.get("ts") == "2026-09-22T11:01:10.170Z",
          "attendu la valeur BRUTE du champ timestamp, obtenu %r" % (r,))

    r = FIL.interpreter_ligne(_TEMOIN_SANS_TIMESTAMP)
    check("TS_absence_timestamp_rend_None",
          r is not None and r.get("ts") is None,
          "un enregistrement sans timestamp doit rendre ts:None, jamais une "
          "valeur inventée — obtenu %r" % (r,))


def test_D1_filtre_positif():
    for nom, temoin in _TEMOINS_TYPES_EXCLUS.items():
        if FIL is None:
            check_rouge(nom, False, "fil.py absent")
            continue
        check_rouge(nom, FIL.interpreter_ligne(temoin) is None,
                    "attendu None, obtenu %r" % (FIL.interpreter_ligne(temoin),))

    if FIL is None:
        check_rouge("D1_user_texte_simple_garde", False, "fil.py absent")
        check_rouge("D1_isMeta_rapport_sous_agent_jamais_message", False, "fil.py absent")
        check_rouge("D1_user_tool_result_seul_jamais_message", False, "fil.py absent")
        check_rouge("D1_promptSource_system_jamais_message", False, "fil.py absent")
        check_rouge("D1_assistant_texte_garde", False, "fil.py absent")
        check_rouge("D1_assistant_tool_use_seul_jamais_message", False, "fil.py absent")
        check_rouge("D1_assistant_thinking_seul_jamais_message", False, "fil.py absent")
        check_rouge("D1_assistant_mixte_ne_garde_que_le_bloc_text", False, "fil.py absent")
        check_rouge("D1_prompt_source_expose_brut_queued", False, "fil.py absent")
        check_rouge("D1_prompt_source_expose_brut_typed", False, "fil.py absent")
        return

    r = FIL.interpreter_ligne(_TEMOIN_USER_SIMPLE)
    check_rouge("D1_user_texte_simple_garde",
                r is not None and r.get("role") == "user" and r.get("texte") == "Bonjour depuis le cockpit")
    check_rouge("D1_prompt_source_expose_brut_typed",
                r is not None and r.get("prompt_source") == "typed")

    # LE témoin critique du GATE : `isMeta` doit primer sur `type: user`.
    check_rouge("D1_isMeta_rapport_sous_agent_jamais_message",
                FIL.interpreter_ligne(_TEMOIN_ISMETA_RAPPORT) is None,
                "un rapport de sous-agent isMeta:true a été rendu comme un message humain")

    check_rouge("D1_user_tool_result_seul_jamais_message",
                FIL.interpreter_ligne(_TEMOIN_USER_TOOL_RESULT_SEUL) is None)
    check_rouge("D1_promptSource_system_jamais_message",
                FIL.interpreter_ligne(_TEMOIN_USER_PROMPTSOURCE_SYSTEM) is None)

    r = FIL.interpreter_ligne(_TEMOIN_ASSISTANT_TEXTE)
    check_rouge("D1_assistant_texte_garde",
                r is not None and r.get("role") == "assistant" and r.get("texte") == "Voici la réponse.")

    check_rouge("D1_assistant_tool_use_seul_jamais_message",
                FIL.interpreter_ligne(_TEMOIN_ASSISTANT_TOOL_USE_SEUL) is None)
    check_rouge("D1_assistant_thinking_seul_jamais_message",
                FIL.interpreter_ligne(_TEMOIN_ASSISTANT_THINKING_SEUL) is None)

    r = FIL.interpreter_ligne(_TEMOIN_ASSISTANT_MIXTE)
    check_rouge("D1_assistant_mixte_ne_garde_que_le_bloc_text",
                r is not None and r.get("texte") == "Fait." and "Bash" not in r.get("texte", ""))

    r = FIL.interpreter_ligne(_TEMOIN_USER_QUEUED)
    check_rouge("D1_prompt_source_expose_brut_queued",
                r is not None and r.get("prompt_source") == "queued")


def test_D2_lecture_bornee():
    """Fichier synthétique de 12 Mio (>> budget 4 Mio), 400 messages valides
    (>> max_messages 40), UNE ligne de 3 Mio (>> taille_ligne_max 2 Mio,
    doit être ignorée plutôt que chargée entière). `D2_octets_lus_jamais_
    au_dela_du_budget` est le mutant-tueur direct de « retirer la borne »
    (`PIEGES §37`) : un module qui lirait le fichier entier rendrait
    `octets_lus` de l'ordre de 12 Mio, loin au-dessus de 4 Mio."""
    if FIL is None:
        check_rouge("D2_octets_lus_jamais_au_dela_du_budget", False, "fil.py absent")
        check_rouge("D2_messages_jamais_au_dela_de_max_messages", False, "fil.py absent")
        check_rouge("D2_tronque_annonce_quand_coupe", False, "fil.py absent")
        check_rouge("D2_message_individuel_tronque_a_la_borne", False, "fil.py absent")
        return

    with tempfile.TemporaryDirectory() as tmp:
        chemin = os.path.join(tmp, "gros-transcript.jsonl")
        with open(chemin, "w", encoding="utf-8") as f:
            for i in range(400):
                ligne = {"type": "user", "promptSource": "typed",
                         "message": {"role": "user", "content": "message %d " % i + ("x" * 30000)}}
                f.write(json.dumps(ligne, ensure_ascii=False) + "\n")
            # une ligne hostile, trop longue pour être un message légitime
            f.write(json.dumps({"type": "user",
                                 "message": {"role": "user", "content": "y" * 3_100_000}}) + "\n")

        messages, tronque, octets_lus = FIL.lire_fil(
            chemin, max_messages=40, max_octets=4 * 1024 * 1024,
            taille_ligne_max=2 * 1024 * 1024, max_caracteres_message=4096)

        check_rouge("D2_octets_lus_jamais_au_dela_du_budget",
                    octets_lus <= 4 * 1024 * 1024 + 2 * 1024 * 1024,  # marge d'une dernière ligne
                    "obtenu %d octets pour un budget de 4 Mio" % octets_lus)
        check_rouge("D2_messages_jamais_au_dela_de_max_messages",
                    len(messages) <= 40, "obtenu %d messages" % len(messages))
        check_rouge("D2_tronque_annonce_quand_coupe", tronque is True)
        check_rouge("D2_message_individuel_tronque_a_la_borne",
                    all(len(m.get("texte", "")) <= 4096 for m in messages),
                    "un message dépasse 4096 caractères")


def test_C2_max_messages_reellement_depassee():
    """C2 (reboucle GATE, validation par mutation) : le fixture de
    `test_D2_lecture_bornee` ne produit jamais plus de ~36 messages dans la
    fenêtre du budget d'octets — `messages[-max_messages:]` n'est donc
    JAMAIS exercée (`len(messages) <= 40` passe trivialement si
    `len(messages)` ne dépasse jamais 40). Ce témoin utilise des messages
    PETITS (budget largement suffisant) pour que le nombre de messages
    VALIDES dépasse réellement `max_messages` — ici 200 messages pour une
    borne à 40."""
    if FIL is None:
        check("C2_max_messages_reellement_depassee", False, "fil.py absent")
        return
    with tempfile.TemporaryDirectory() as tmp:
        chemin = os.path.join(tmp, "beaucoup-de-petits-messages.jsonl")
        with open(chemin, "w", encoding="utf-8") as f:
            for i in range(200):
                ligne = {"type": "user", "promptSource": "typed",
                         "message": {"role": "user", "content": "message-%03d" % i}}
                f.write(json.dumps(ligne, ensure_ascii=False) + "\n")

        messages, tronque, _octets = FIL.lire_fil(
            chemin, max_messages=40, max_octets=4 * 1024 * 1024,
            taille_ligne_max=2 * 1024 * 1024, max_caracteres_message=4096)

        check("C2_max_messages_reellement_depassee",
              len(messages) == 40, "obtenu %d messages, attendu exactement 40" % len(messages))
        check("C2_tronque_annonce", tronque is True)
        check("C2_les_40_derniers_sont_gardes",
              messages and messages[-1].get("texte") == "message-199"
              and messages[0].get("texte") == "message-160",
              "attendu les 40 plus RÉCENTS (message-160..message-199), obtenu %r..%r"
              % (messages[0].get("texte") if messages else None,
                 messages[-1].get("texte") if messages else None))


def test_B3c_cache_borne_par_ecritures_repetees():
    """B3c (revue de code) : `N` écritures successives sur le MÊME fichier
    (mtime/taille changent à chaque fois, comme un transcript actif) ne
    doivent laisser qu'UNE SEULE entrée dans `_cache` pour ce chemin —
    jamais `N`. Mesuré (rapport) : sans borne, 200 écritures -> 200
    entrées, 2,6 Mo retenus, jamais libérés."""
    if FIL is None:
        check("B3c_cache_borne_par_ecritures_repetees", False, "fil.py absent")
        return
    with tempfile.TemporaryDirectory() as tmp:
        chemin = os.path.join(tmp, "transcript-actif.jsonl")
        avant = len(FIL._cache)
        for i in range(30):
            with open(chemin, "a", encoding="utf-8") as f:
                f.write(json.dumps({"type": "user",
                                     "message": {"role": "user", "content": "m%d" % i}}) + "\n")
            FIL.lire_fil(chemin)
        apres = len(FIL._cache)
        check("B3c_cache_borne_par_ecritures_repetees",
              apres - avant <= 1,
              "obtenu %d entrée(s) nouvelle(s) pour 30 écritures sur le MÊME "
              "chemin, attendu au plus 1" % (apres - avant))


def main():
    print("== test_fil.py — D1/D2 (feature-026) ==")
    if FIL is None:
        print("  (i) fil.py introuvable — livrable A2 du backend-developer, "
              "lot 1. Les assertions ci-dessous sont ATTENDU_ROUGE, pas des "
              "échecs de suite.")
    print("  %d fixtures D1 (%d exclues par le filtre, %d gardées), "
          "2 scénarios D2" % (
              len(_TEMOINS_TYPES_EXCLUS) + 8, len(_TEMOINS_TYPES_EXCLUS) + 4, 4))

    test_D1_filtre_positif()
    test_D2_lecture_bornee()
    test_C2_max_messages_reellement_depassee()
    test_B3c_cache_borne_par_ecritures_repetees()
    test_TS_champ_ts()

    for cle, entree in ATTENDU_ROUGE.items():
        check("ATTENDU_ROUGE_%s_porte_un_lot_de_cloture_nomme" % cle,
              bool(entree.get("lot_de_cloture")))

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for e in _echecs:
        print("  - %s" % e)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
