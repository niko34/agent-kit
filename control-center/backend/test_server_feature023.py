#!/usr/bin/env python3
"""Tests HTTP de bout en bout de `tokens_par_passage` (feature-023, GATE P1
S5) — le champ additif de `/api/etat`, ET la preuve que rien de plus n'en
sort.

    python3 control-center/backend/test_server_feature023.py

## Ce que ce fichier prouve, que `test_transcripts.py` ne peut pas prouver seul

`test_transcripts.py` prouve que le MODULE ne rend jamais de texte. Ce
fichier prouve que la CHAÎNE COMPLÈTE — journal réel, `Etat.instantane()`,
sérialisation JSON, réponse HTTP — ne le fait pas non plus : un filtre
correct dans `transcripts.py` pourrait être contourné plus haut (un champ
additionné à la main dans `server.py`, par exemple). C'est l'assertion que le
GATE P1 nomme explicitement : « absent de la sortie du module ET du JSON
entier de `/api/etat` ».

Réutilise `test_server_ecriture.Groupe` (même clone jetable de
`control-center/` entier, `PIEGES.md` §1) : `transcripts.py` fait partie du
clone, donc de ce qui est réellement exercé.
"""

import json
import os
import sys

_ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _ICI)
import test_server_ecriture as TSE  # noqa: E402

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


requete = TSE.requete


def _ev(ts, nom, **extra):
    base = {"ts": ts, "hook_event_name": nom, "session_id": "s1", "runtime": "claude-code"}
    base.update(extra)
    return base


def _T(seconde):
    return "2026-09-22T10:%02d:%02d.000Z" % (seconde // 60, seconde % 60)


def _ecrire_journal(chemin, evenements):
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    with open(chemin, "w", encoding="utf-8") as fichier:
        for evenement in evenements:
            fichier.write(json.dumps(evenement) + "\n")


def _ecrire_transcript(racine, agent_id, lignes):
    chemin = os.path.join(racine, "subagents", "agent-%s.jsonl" % agent_id)
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    with open(chemin, "w", encoding="utf-8") as fichier:
        for ligne in lignes:
            fichier.write(json.dumps(ligne) + "\n")
    return chemin


def main():
    agent_id = "a1b2c3d4e5f6a1b2"
    temoin = "TEMOIN-FUITE-feature023-9f3"

    groupe = TSE.Groupe(commandes={}, declarer_jeton=False)
    try:
        racine_transcripts = os.path.join(groupe._tmp, "transcripts-hors-projet")
        os.makedirs(racine_transcripts, exist_ok=True)
        # `Config` est un `dict` ordinaire : muter la section APRÈS
        # construction du `Groupe` produit le MÊME effet qu'une ligne
        # `[transcripts]` dans le TOML — `Etat` détient une référence au
        # MÊME objet, jamais une copie.
        groupe.config["transcripts"] = {"racine": racine_transcripts}

        _ecrire_transcript(racine_transcripts, agent_id, [
            {"type": "assistant", "message": {
                "role": "assistant",
                "content": [{"type": "text", "text": "note privée : %s" % temoin}],
                "usage": {
                    "input_tokens": 4, "output_tokens": 6,
                    "service_tier": temoin,
                    "cache_creation": {"detail": temoin},
                },
            }},
        ])

        _ecrire_journal(groupe.serveur.etat.journal, [
            _ev(_T(0), "SessionStart"),
            _ev(_T(1), "SubagentStart", agent_type="test-engineer", agent_id=agent_id),
            _ev(_T(3), "PostToolUse", tool="Bash", command_head="pio test"),
            _ev(_T(5), "SubagentStop", agent_type="", agent_id=agent_id),
            _ev(_T(6), "SessionEnd"),
        ])

        code, corps = requete(groupe.port, "GET", "/api/etat", entetes={}, corps=b"")
        check("test_etat_200", code == 200, "obtenu %d : %s" % (code, corps[:200]))

        # --- S5.3/S5.4, au niveau du JSON ENTIER, pas du seul module --------
        check("test_temoin_absent_du_corps_http_brut", temoin not in corps,
              "le témoin de fuite est sorti jusqu'à la réponse HTTP")

        etat = json.loads(corps)
        tokens = etat.get("tokens_par_passage")
        check("test_champ_tokens_par_passage_present", isinstance(tokens, dict),
              "obtenu %r" % tokens)
        check("test_tokens_par_passage_partiel_faux", tokens.get("partiel") is False)
        check("test_tokens_par_passage_compteurs_exacts",
              tokens.get("par_agent", {}).get(agent_id) == {"input_tokens": 4, "output_tokens": 6},
              "obtenu %r" % tokens.get("par_agent"))

        # Recherche récursive de TOUTE chaîne suspecte dans le JSON entier —
        # pas seulement le sous-objet `tokens_par_passage` : une fuite
        # pourrait apparaître n'importe où si un champ additionnait `usage`
        # brut par erreur ailleurs dans `instantane()`.
        check("test_temoin_absent_du_json_entier_serialise",
              temoin not in json.dumps(etat), "le témoin est sorti du JSON entier")

        # --- workflow affiché : le passage existe bien, agent_id cohérent ---
        workflows = etat.get("workflows", [])
        agent_ids_vus = {p.get("agent_id") for w in workflows for p in w.get("passages", [])}
        check("test_agent_id_du_passage_correspond_au_transcript",
              agent_id in agent_ids_vus, "obtenu %r" % agent_ids_vus)
    finally:
        groupe.fermer()

    # === S5.4 — racine misconfigurée : dégradation propre, jamais un 500 ====
    groupe2 = TSE.Groupe(commandes={}, declarer_jeton=False)
    try:
        groupe2.config["transcripts"] = {"racine": "/nexiste/jamais/sur/cette/machine"}
        _ecrire_journal(groupe2.serveur.etat.journal, [
            _ev(_T(0), "SessionStart"),
            _ev(_T(1), "SubagentStart", agent_type="test-engineer", agent_id=agent_id),
            _ev(_T(5), "SubagentStop", agent_type="", agent_id=agent_id),
            _ev(_T(6), "SessionEnd"),
        ])
        code2, corps2 = requete(groupe2.port, "GET", "/api/etat", entetes={}, corps=b"")
        check("test_racine_misconfiguree_reste_200", code2 == 200)
        etat2 = json.loads(corps2)
        check("test_racine_misconfiguree_champ_present_mais_vide",
              etat2.get("tokens_par_passage") == {"partiel": False, "par_agent": {}},
              "obtenu %r" % etat2.get("tokens_par_passage"))
        check("test_racine_misconfiguree_aucun_chemin_dans_la_reponse",
              "/nexiste/jamais" not in corps2)
    finally:
        groupe2.fermer()

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for echec in _echecs:
        print("  - %s" % echec)
    return 1 if _echecs else 0


if __name__ == "__main__":
    try:
        _code = main()
    except Exception as erreur:
        print("\n%d cas atteints, INTERROMPU par %s : %s"
              % (_tests, type(erreur).__name__, erreur))
        print("  (le compte ci-dessus est un MINORANT)")
        _code = 1
    sys.exit(_code)
