#!/usr/bin/env python3
"""Tests de la reconstruction des workflows.

    python3 control-center/backend/test_events.py

Sans dépendance. Les cas viennent de comportements RÉELLEMENT observés sur le
journal de production, pas d'hypothèses : le runtime émet des `SubagentStop`
sans `SubagentStart`, et il ne met pas le nom de l'agent dans la fermeture.

Le fil conducteur est le même partout : **ne jamais produire un récit plus
affirmatif que les événements**. Un passage sans fermeture est en cours, pas
terminé ; une session sans fin n'est pas active, elle est sans fin observée ;
une durée non mesurable est `None`, jamais 0.
"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import events as E  # noqa: E402

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


def ev(ts, nom, **extra):
    base = {"ts": ts, "hook_event_name": nom, "session_id": "s1", "runtime": "claude-code"}
    base.update(extra)
    return base


def T(seconde, ms=0):
    return "2026-09-12T10:%02d:%02d.%03dZ" % (seconde // 60, seconde % 60, ms)


def un(workflows):
    return workflows[0] if workflows else None


def main():
    # --- cas nominal : un passage complet -----------------------------------
    w = un(E.reconstruire([
        ev(T(0), "SessionStart"),
        ev(T(1), "SubagentStart", agent_type="test-engineer", agent_id="a1"),
        ev(T(3), "PostToolUse", tool="Bash", command_head="pio test", file="src/main.cpp"),
        ev(T(5), "SubagentStop", agent_type="", agent_id="a1"),
        ev(T(6), "SessionEnd"),
    ], ("pio test",)))
    check("test_passage_complet", len(w["passages"]) == 1 and w["passages"][0]["termine"])
    check("test_duree_mesuree", w["passages"][0]["duree_ms"] == 4000,
          "obtenu %r" % w["passages"][0]["duree_ms"])
    check("test_nom_vient_de_l_ouverture", w["passages"][0]["agent"] == "test-engineer",
          "SubagentStop ne porte PAS le nom (agent_type vide en production) : "
          "l'appariement doit se faire par agent_id")
    check("test_session_close_reconnue", w["fin_observee_absente"] is False)
    check("test_commande_suivie_comptee", w["commandes"].get("pio test") == 1)

    # --- fermeture orpheline : OBSERVÉE en production ------------------------
    # Le runtime émet un SubagentStop par fin de tour de l'agent principal, avec
    # un agent_id neuf et un agent_type vide. Il ne doit fermer AUCUN passage.
    w = un(E.reconstruire([
        ev(T(1), "SubagentStart", agent_type="architect", agent_id="a1"),
        ev(T(2), "Stop"),
        ev(T(3), "SubagentStop", agent_type="", agent_id="INTRUS"),
    ]))
    check("test_fermeture_orpheline_comptee", w["fermetures_orphelines"] == 1)
    check("test_fermeture_orpheline_ne_ferme_pas_le_passage_en_cours",
          w["passages"][0]["termine"] is False and w["passages"][0]["duree_ms"] is None,
          "une fermeture étrangère ne doit pas clore le vrai passage")

    # --- passage jamais fermé -----------------------------------------------
    w = un(E.reconstruire([ev(T(1), "SubagentStart", agent_type="doc-writer", agent_id="a1")]))
    check("test_passage_sans_fermeture_reste_en_cours",
          w["passages"][0]["termine"] is False and w["passages"][0]["duree_ms"] is None,
          "on n'invente ni durée ni verdict")
    check("test_session_sans_fin_n_est_pas_close", w["fin_observee_absente"] is True)

    # --- le travail de l'AGENT PRINCIPAL ne disparaît pas --------------------
    # Défaut relevé en revue : 33 appels d'outils ne rapportaient qu'un fichier,
    # parce que tout ce qui tombait hors d'un passage était jeté.
    w = un(E.reconstruire([
        ev(T(1), "PostToolUse", tool="Write", file="a.py"),
        ev(T(2), "PostToolUse", tool="Write", file="b.py"),
        ev(T(3), "SubagentStart", agent_type="test-engineer", agent_id="a1"),
        ev(T(4), "PostToolUse", tool="Write", file="c.py"),
        ev(T(5), "SubagentStop", agent_id="a1"),
        ev(T(6), "PostToolUse", tool="Write", file="d.py"),
    ]))
    check("test_travail_de_l_agent_principal_conserve",
          w["fichiers"] == ["a.py", "b.py", "c.py", "d.py"],
          "obtenu %r" % w["fichiers"])
    check("test_le_passage_ne_retient_que_ses_propres_fichiers",
          w["passages"][0]["fichiers"] == ["c.py"],
          "obtenu %r" % w["passages"][0]["fichiers"])

    # --- l'agent principal EXISTE dans la chaîne ----------------------------
    # Sans segment principal, la chaîne racontait un workflow plus creux qu'il
    # n'est : sur un relevé réel, 108 des 110 appels d'outils appartenaient à
    # l'agent principal et n'apparaissaient NULLE PART.
    w = un(E.reconstruire([
        ev(T(1), "PostToolUse", tool="Write", file="a.py"),
        ev(T(2), "PostToolUse", tool="Bash", command_head="pio test"),
        ev(T(3), "SubagentStart", agent_type="test-engineer", agent_id="a1"),
        ev(T(4), "PostToolUse", tool="Write", file="c.py"),
        ev(T(5), "SubagentStop", agent_id="a1"),
        ev(T(6), "PostToolUse", tool="Edit", file="d.py"),
    ]))
    types = [s["type"] for s in w["segments"]]
    check("test_chaine_alterne_principal_et_sous_agent",
          types == ["principal", "sousagent", "principal"],
          "obtenu %r" % types)
    check("test_segment_principal_compte_ses_outils",
          w["segments"][0]["outils"] == 2 and w["segments"][2]["outils"] == 1,
          "obtenu %r" % [s.get("outils") for s in w["segments"]])
    # feature-016 (item J) : jusqu'ici SEUL le segment principal comptait ses
    # outils — sans ce compteur sur le sous-agent, la table des passages
    # (feature-016) n'a aucune donnée « outils » à afficher.
    check("test_segment_sousagent_compte_aussi_ses_outils",
          w["segments"][1]["outils"] == 1,
          "obtenu %r" % w["segments"][1].get("outils"))
    check("test_segment_principal_porte_ses_fichiers",
          w["segments"][0]["fichiers"] == ["a.py"]
          and w["segments"][2]["fichiers"] == ["d.py"],
          "obtenu %r" % [s["fichiers"] for s in w["segments"]])
    check("test_le_sous_agent_ne_recupere_pas_le_travail_du_principal",
          w["segments"][1]["fichiers"] == ["c.py"])
    check("test_passages_ne_contient_que_les_sous_agents",
          [p["agent"] for p in w["passages"]] == ["test-engineer"],
          "`passages` doit rester inchangé pour les appelants qui ne "
          "s'intéressent qu'aux sous-agents")

    w = un(E.reconstruire([
        ev(T(1), "SubagentStart", agent_type="architect", agent_id="a1"),
        ev(T(2), "PostToolUse", tool="Read"),
        ev(T(3), "SubagentStop", agent_id="a1"),
    ]))
    check("test_aucun_segment_principal_si_rien_hors_sous_agent",
          [s["type"] for s in w["segments"]] == ["sousagent"],
          "un segment principal vide ne doit pas être inventé ; obtenu %r"
          % [s["type"] for s in w["segments"]])

    w = un(E.reconstruire([
        ev(T(1), "PostToolUseFailure", tool="Bash"),
        ev(T(2), "SubagentStart", agent_type="debugger", agent_id="a1"),
        ev(T(3), "PostToolUseFailure", tool="Bash"),
        ev(T(4), "SubagentStop", agent_id="a1"),
    ]))
    check("test_echec_du_principal_attribue_au_principal",
          w["segments"][0]["echecs"] == 1 and w["segments"][1]["echecs"] == 1,
          "obtenu %r" % [s["echecs"] for s in w["segments"]])

    # --- reprises : la trace observable d'une boucle de correction ----------
    w = un(E.reconstruire([
        ev(T(1), "SubagentStart", agent_type="test-engineer", agent_id="a1"),
        ev(T(2), "PostToolUseFailure"),
        ev(T(3), "SubagentStop", agent_id="a1"),
        ev(T(4), "SubagentStart", agent_type="debugger", agent_id="a2"),
        ev(T(5), "SubagentStop", agent_id="a2"),
        ev(T(6), "SubagentStart", agent_type="test-engineer", agent_id="a3"),
        ev(T(7), "SubagentStop", agent_id="a3"),
    ]))
    check("test_reprise_detectee", w["reprises"] == {"test-engineer": 2},
          "obtenu %r" % w["reprises"])
    check("test_echec_attribue_au_bon_passage",
          w["echecs"] == 1 and w["passages"][0]["echecs"] == 1)

    # --- feature-016 (item J) : compteur d'outils d'un passage ---------------
    w = un(E.reconstruire([
        ev(T(1), "SubagentStart", agent_type="test-engineer", agent_id="a1"),
        ev(T(2), "PostToolUse", tool="Bash", command_head="pio test"),
        ev(T(3), "PostToolUse", tool="Read"),
        ev(T(4), "PostToolUseFailure", tool="Bash"),
        ev(T(5), "SubagentStop", agent_id="a1"),
    ], ("pio test",)))
    check("test_passage_compte_trois_outils_echec_inclus",
          w["passages"][0]["outils"] == 3,
          "obtenu %r" % w["passages"][0]["outils"])

    w = un(E.reconstruire([
        ev(T(1), "SubagentStart", agent_type="doc-writer", agent_id="a1"),
        ev(T(2), "PostToolUseFailure"),  # échec SANS `tool` : ne compte pas
        ev(T(3), "SubagentStop", agent_id="a1"),
    ]))
    check("test_passage_sans_outil_reste_a_zero",
          w["passages"][0]["outils"] == 0,
          "obtenu %r" % w["passages"][0]["outils"])

    # --- deux sessions entrelacées ------------------------------------------
    a = ev(T(1), "SubagentStart", agent_type="architect", agent_id="a1")
    b = dict(ev(T(2), "SubagentStart", agent_type="debugger", agent_id="b1"), session_id="s2")
    c = ev(T(3), "SubagentStop", agent_id="a1")
    workflows = E.reconstruire([a, b, c])
    check("test_deux_sessions_separees", len(workflows) == 2)
    par_session = {w["session_id"]: w for w in workflows}
    check("test_entrelacement_n_attribue_pas_de_travers",
          par_session["s1"]["passages"][0]["termine"] is True
          and par_session["s2"]["passages"][0]["termine"] is False,
          "la fermeture de s1 ne doit pas clore le passage de s2")

    # --- agent_id réutilisé --------------------------------------------------
    w = un(E.reconstruire([
        ev(T(1), "SubagentStart", agent_type="architect", agent_id="MEME"),
        ev(T(2), "SubagentStop", agent_id="MEME"),
        ev(T(3), "SubagentStart", agent_type="doc-writer", agent_id="MEME"),
        ev(T(4), "SubagentStop", agent_id="MEME"),
    ]))
    check("test_agent_id_reutilise_ferme_le_bon_passage",
          all(p["termine"] for p in w["passages"])
          and w["passages"][0]["duree_ms"] == 1000 and w["passages"][1]["duree_ms"] == 1000,
          "un identifiant réutilisé ne doit pas rouvrir ni refermer un passage clos")

    # --- horloge qui recule --------------------------------------------------
    w = un(E.reconstruire([
        ev(T(5), "SubagentStart", agent_type="architect", agent_id="a1"),
        ev(T(1), "SubagentStop", agent_id="a1"),
    ]))
    check("test_horloge_qui_recule_ferme_bien_le_passage",
          w["passages"][0]["termine"] is True and w["fermetures_orphelines"] == 0,
          "l'appariement par agent_id fonctionne quel que soit l'ordre reçu")
    # ⚠️ `reconstruire()` NE TRIE PAS : elle consomme l'ordre reçu (seul
    # `lire_journal()` trie). La fermeture est donc bien appariée à son
    # ouverture, et la durée calculée est NÉGATIVE — c'est précisément le cas que
    # le garde-fou doit ramener à None.
    #
    # Mon premier commentaire ici affirmait l'inverse (« le tri remet la
    # fermeture avant l'ouverture, elle devient orpheline »). Il était faux, et
    # vérifié seulement après coup : le passage ressort `termine=True` avec
    # `duree_ms=None`, pas orphelin.
    check("test_horloge_qui_recule_ne_produit_pas_de_duree_negative",
          all(p["duree_ms"] is None or p["duree_ms"] >= 0 for p in w["passages"]),
          "une durée négative s'afficherait comme un fait")

    # --- imbrication : signalée, pas maquillée -------------------------------
    w = un(E.reconstruire([
        ev(T(1), "SubagentStart", agent_type="architect", agent_id="a1"),
        ev(T(2), "SubagentStart", agent_type="debugger", agent_id="a2"),
    ]))
    check("test_imbrication_signalee", w["imbrication_suspectee"] is True,
          "deux ouvertures sans fermeture intercalée rendent le récit incertain")

    # --- bornage en cycles (bug-004) -----------------------------------------
    # Un `SubagentStart` dont l'`agent_type` figure dans `agents_ouvrants` clôt le
    # segment courant s'il a déjà reçu un événement, et en ouvre un neuf. Trois
    # refus explicites sont testés à part : liste vide, marqueur absent, et le
    # traitement des événements antérieurs au premier marqueur.

    # E1 — LE test de non-régression exigé par la spec : deux cycles marqués
    # dans une seule session doivent produire deux workflows, pas un seul.
    workflows = E.reconstruire([
        ev(T(1), "SubagentStart", agent_type="orchestrator", agent_id="a1"),
        ev(T(2), "SubagentStop", agent_id="a1"),
        ev(T(3), "SubagentStart", agent_type="test-engineer", agent_id="a2"),
        ev(T(4), "SubagentStop", agent_id="a2"),
        ev(T(5), "SubagentStart", agent_type="orchestrator", agent_id="a3"),
        ev(T(6), "SubagentStop", agent_id="a3"),
    ], agents_ouvrants=("orchestrator",))
    check("test_E1_deux_cycles_marques_donnent_deux_workflows", len(workflows) == 2,
          "obtenu %d" % len(workflows))
    check("test_E1_workflow_id_distincts_et_indexes",
          [w["workflow_id"] for w in workflows] == ["s1#0", "s1#1"],
          "obtenu %r" % [w["workflow_id"] for w in workflows])

    # E2 — un seul cycle marqué ne doit pas se découper au passage : aucun
    # second marqueur, donc aucun second segment.
    workflows = E.reconstruire([
        ev(T(1), "SubagentStart", agent_type="orchestrator", agent_id="a1"),
        ev(T(2), "SubagentStop", agent_id="a1"),
        ev(T(3), "SubagentStart", agent_type="test-engineer", agent_id="a2"),
        ev(T(4), "SubagentStop", agent_id="a2"),
    ], agents_ouvrants=("orchestrator",))
    check("test_E2_un_seul_cycle_un_seul_workflow", len(workflows) == 1)
    check("test_E2_bornage_marqueur", workflows[0]["bornage"] == E.BORNAGE_MARQUEUR)

    # E3 — `agents_ouvrants` vide : aucun découpage, quel que soit le contenu.
    workflows = E.reconstruire([
        ev(T(1), "SubagentStart", agent_type="orchestrator", agent_id="a1"),
        ev(T(2), "SubagentStop", agent_id="a1"),
        ev(T(3), "SubagentStart", agent_type="orchestrator", agent_id="a2"),
        ev(T(4), "SubagentStop", agent_id="a2"),
    ])  # agents_ouvrants par défaut : ()
    check("test_E3_agents_ouvrants_vide_un_seul_workflow", len(workflows) == 1)
    check("test_E3_bornage_session_entiere", workflows[0]["bornage"] == E.BORNAGE_SESSION,
          "obtenu %r" % workflows[0]["bornage"])

    # E4 — un bornage configuré mais jamais rencontré ne découpe pas non plus.
    # On ne découpe jamais au jugé.
    workflows = E.reconstruire([
        ev(T(1), "SubagentStart", agent_type="test-engineer", agent_id="a1"),
        ev(T(2), "SubagentStop", agent_id="a1"),
    ], agents_ouvrants=("orchestrator",))
    check("test_E4_marqueur_configure_mais_absent_un_seul_workflow", len(workflows) == 1)
    check("test_E4_marqueur_configure_mais_absent_bornage_session_entiere",
          workflows[0]["bornage"] == E.BORNAGE_SESSION)

    # E5 — événements antérieurs au premier marqueur : un workflow à part qui
    # n'affirme rien sur son contenu.
    workflows = E.reconstruire([
        ev(T(1), "PostToolUse", tool="Write", file="a.py"),
        ev(T(2), "SubagentStart", agent_type="orchestrator", agent_id="a1"),
        ev(T(3), "SubagentStop", agent_id="a1"),
    ], agents_ouvrants=("orchestrator",))
    check("test_E5_avant_premier_marqueur_forme_un_workflow_a_part", len(workflows) == 2)
    check("test_E5_bornage_distinct",
          workflows[0]["bornage"] == E.BORNAGE_PREFIXE
          and workflows[1]["bornage"] == E.BORNAGE_MARQUEUR)
    check("test_E5_avant_premier_marqueur_n_affirme_rien",
          workflows[0]["borne_par"] is None and workflows[1]["borne_par"] == "orchestrator")

    # E6 — un segment `{"type": "principal"}` reste rattaché au cycle où il a
    # réellement eu lieu, avant comme après le marqueur.
    workflows = E.reconstruire([
        ev(T(1), "PostToolUse", tool="Write", file="a.py"),
        ev(T(2), "SubagentStart", agent_type="orchestrator", agent_id="a1"),
        ev(T(3), "SubagentStop", agent_id="a1"),
        ev(T(4), "PostToolUse", tool="Write", file="b.py"),
    ], agents_ouvrants=("orchestrator",))
    check("test_E6_segment_principal_avant_marqueur_dans_le_bon_cycle",
          workflows[0]["segments"][0]["type"] == "principal"
          and workflows[0]["segments"][0]["fichiers"] == ["a.py"])
    check("test_E6_segment_principal_apres_marqueur_dans_le_bon_cycle",
          workflows[1]["segments"][-1]["type"] == "principal"
          and workflows[1]["segments"][-1]["fichiers"] == ["b.py"])

    # E7 — ⚠️ fermeture à cheval sur une frontière : un agent ouvert AVANT un
    # marqueur et fermé APRÈS doit être apparié correctement, et
    # `fermetures_orphelines` doit rester à 0 des deux côtés. Sans la recherche
    # dans les segments antérieurs, ce compteur gonflerait faussement.
    workflows = E.reconstruire([
        ev(T(1), "SubagentStart", agent_type="architect", agent_id="a1"),
        ev(T(2), "SubagentStart", agent_type="orchestrator", agent_id="a2"),
        ev(T(4), "SubagentStop", agent_id="a1"),
        ev(T(5), "SubagentStop", agent_id="a2"),
    ], agents_ouvrants=("orchestrator",))
    check("test_E7_fermeture_a_cheval_deux_segments", len(workflows) == 2)
    check("test_E7_fermeture_a_cheval_appariee_au_bon_passage",
          workflows[0]["passages"][0]["termine"] is True
          and workflows[0]["passages"][0]["duree_ms"] == 3000,
          "obtenu %r" % workflows[0]["passages"][0])
    check("test_E7_fermeture_a_cheval_pas_de_fermeture_orpheline",
          workflows[0]["fermetures_orphelines"] == 0 and workflows[1]["fermetures_orphelines"] == 0,
          "obtenu %r" % [w["fermetures_orphelines"] for w in workflows])

    # E8 — deux sessions entrelacées, CHACUNE avec ses propres marqueurs :
    # jamais de mélange. Étend test_deux_sessions_separees et
    # test_entrelacement_n_attribue_pas_de_travers ci-dessus, ne les remplace pas.
    a = ev(T(1), "SubagentStart", agent_type="orchestrator", agent_id="a1")
    b = dict(ev(T(2), "SubagentStart", agent_type="orchestrator", agent_id="b1"), session_id="s2")
    c = ev(T(3), "SubagentStop", agent_id="a1")
    d = dict(ev(T(4), "SubagentStop", agent_id="b1"), session_id="s2")
    e = ev(T(5), "SubagentStart", agent_type="orchestrator", agent_id="a2")
    f = ev(T(6), "SubagentStop", agent_id="a2")
    workflows = E.reconstruire([a, b, c, d, e, f], agents_ouvrants=("orchestrator",))
    check("test_E8_deux_sessions_marquees_total_trois_workflows", len(workflows) == 3,
          "obtenu %d" % len(workflows))
    par_session = {}
    for w in workflows:
        par_session.setdefault(w["session_id"], []).append(w)
    check("test_E8_session_s1_a_deux_cycles", len(par_session.get("s1", [])) == 2)
    check("test_E8_session_s2_a_un_seul_cycle", len(par_session.get("s2", [])) == 1)
    check("test_E8_entrelacement_ne_melange_pas_les_passages",
          all(p["agent_id"] == "b1" for w in par_session["s2"] for p in w["passages"])
          and all(p["agent_id"] in ("a1", "a2") for w in par_session["s1"] for p in w["passages"]),
          "un passage de s2 s'est retrouvé rattaché à s1, ou l'inverse")

    # E9 — `workflow_id` est stable entre deux appels sur les mêmes événements.
    evenements_stables = [
        ev(T(1), "SubagentStart", agent_type="orchestrator", agent_id="a1"),
        ev(T(2), "SubagentStop", agent_id="a1"),
    ]
    w1 = E.reconstruire(evenements_stables, agents_ouvrants=("orchestrator",))
    w2 = E.reconstruire(evenements_stables, agents_ouvrants=("orchestrator",))
    check("test_E9_workflow_id_stable_entre_deux_appels",
          [w["workflow_id"] for w in w1] == [w["workflow_id"] for w in w2])

    # E10 — `reconstruire()` ne trie TOUJOURS PAS, y compris pour le bornage en
    # cycles : le segment est ouvert dans l'ordre où l'événement est REÇU, pas
    # dans l'ordre chronologique de son horodatage.
    workflows = E.reconstruire([
        ev(T(10), "SubagentStart", agent_type="orchestrator", agent_id="a1"),
        ev(T(1), "SubagentStart", agent_type="orchestrator", agent_id="a2"),
    ], agents_ouvrants=("orchestrator",))
    par_indice = {w["indice_cycle"]: w for w in workflows}
    check("test_E10_segmentation_suit_l_ordre_recu_pas_l_horodatage",
          par_indice[0]["debut"] == T(10) and par_indice[1]["debut"] == T(1),
          "le premier événement REÇU (ts=%s) doit ouvrir l'indice 0, même s'il "
          "est postérieur au second (ts=%s) ; obtenu indice0=%s indice1=%s"
          % (T(10), T(1), par_indice[0]["debut"], par_indice[1]["debut"]))

    # E13 — comportement INCHANGÉ à figer : un `SubagentStop` sans `agent_type`
    # (333 occurrences relevées en production) continue de tomber en fermeture
    # orpheline, DANS LE SEGMENT où il arrive — même avec un bornage actif.
    workflows = E.reconstruire([
        ev(T(1), "SubagentStart", agent_type="orchestrator", agent_id="a1"),
        ev(T(2), "SubagentStop", agent_type="", agent_id="INTRUS1"),
        ev(T(3), "SubagentStop", agent_id="a1"),
        ev(T(4), "SubagentStart", agent_type="orchestrator", agent_id="a2"),
        ev(T(5), "SubagentStop", agent_type="", agent_id="INTRUS2"),
        ev(T(6), "SubagentStop", agent_id="a2"),
    ], agents_ouvrants=("orchestrator",))
    check("test_E13_fermetures_orphelines_figees_par_segment_avec_bornage_actif",
          workflows[0]["fermetures_orphelines"] == 1 and workflows[1]["fermetures_orphelines"] == 1,
          "obtenu %r" % [w["fermetures_orphelines"] for w in workflows])

    # --- lecture du journal ---------------------------------------------------
    with tempfile.TemporaryDirectory() as tmp:
        chemin = os.path.join(tmp, "j.jsonl")
        with open(chemin, "w", encoding="utf-8") as f:
            f.write('{"ts":"%s","hook_event_name":"Stop","session_id":"s1"}\n' % T(2))
            f.write('pas du json\n')
            f.write('\n')
            f.write('{"sans_ts":true}\n')
            f.write('{"ts":"%s","hook_event_name":"Stop","session_id":"s1"}' % T(1))  # sans \n
        lus = E.lire_journal(chemin)
        check("test_lignes_illisibles_ignorees_sans_perdre_le_reste", len(lus) == 2,
              "une ligne tronquée par un arrêt brutal ne doit pas rendre tout le "
              "journal inexploitable ; obtenu %d" % len(lus))
        check("test_journal_trie_chronologiquement", lus[0]["ts"] < lus[1]["ts"])

    check("test_journal_absent_rend_une_liste_vide",
          E.lire_journal("/chemin/qui/n/existe/pas.jsonl") == [])
    check("test_journal_vide_ne_produit_aucun_workflow", E.reconstruire([]) == [])
    check("test_evenement_sans_session_ignore",
          E.reconstruire([{"ts": T(1), "hook_event_name": "Stop"}]) == [],
          "sans session_id, un événement n'appartient à aucun workflow")

    # =========================================================================
    # bug-013 — un agent tué par le runtime ne reste plus « en cours » pour
    # toujours : troisième état `etat` (`termine` / `en_cours` / `sans_cloture`),
    # gouverné par `maintenant` et `seuil_abandon_minutes`, tous deux fournis
    # par l'appelant — jamais lus en interne (ADR-0014).
    # =========================================================================

    def TM(minutes_totales, ms=0):
        """Horodatage ISO, en minutes écoulées depuis 2026-09-12T10:00:00Z —
        évite le piège de `T()` (secondes) qui déborde l'heure au-delà de
        59 min : bug-013 a besoin de fenêtres de plusieurs dizaines de
        minutes, parfois de plusieurs jours (seuil muté à 10**6 min)."""
        import datetime
        base = datetime.datetime(2026, 9, 12, 10, 0, 0)
        instant = base + datetime.timedelta(minutes=minutes_totales, milliseconds=ms)
        return instant.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

    def _struct_time(ts_iso):
        """`time.struct_time` UTC à partir d'un horodatage ISO quelconque."""
        import datetime
        return datetime.datetime.strptime(ts_iso, "%Y-%m-%dT%H:%M:%S.%fZ").utctimetuple()

    def MAINTENANT(minutes_totales):
        """`time.struct_time` UTC correspondant à `TM(minutes_totales)` —
        c'est l'horloge que `reconstruire()` reçoit en paramètre, jamais
        lue via `time.time()`/`time.gmtime()` en interne."""
        return _struct_time(TM(minutes_totales))

    # B1 — un passage ouvert depuis plus longtemps que le seuil, mais dont la
    # DERNIÈRE ACTIVITÉ (pas l'ouverture) reste fraîche, n'est JAMAIS
    # requalifié : la borne porte sur l'activité observée, pas sur l'âge de
    # l'ouverture (c'est le risque symétrique que bug-013 refuse : accuser un
    # agent vivant, comme l'`architect` mesuré à 127 s entre deux outils).
    w = un(E.reconstruire([
        ev(TM(0), "SubagentStart", agent_type="test-engineer", agent_id="a1"),
        ev(TM(35), "PostToolUse", tool="Write", file="a.py"),
        # aucune fermeture : le passage reste ouvert
    ], maintenant=MAINTENANT(40), seuil_abandon_minutes=36))
    check("test_B1_actif_recent_reste_en_cours_malgre_ouverture_ancienne",
          w["passages"][0]["etat"] == E.ETAT_EN_COURS,
          "obtenu %r (40 min depuis l'ouverture > seuil 36, mais seulement "
          "5 min depuis la dernière activité)" % w["passages"][0]["etat"])

    # B1b — le cas décisif (relevé par exécution, faux positif désigné par
    # l'architecte comme le risque le plus coûteux) : la SEULE activité
    # récente est un `PostToolUse` NU — sans `file`, sans échec, sans commande
    # suivie (Read, Grep, réflexion...). C'est la forme d'événement la plus
    # fréquente du journal réel (3806 sur 5926) ; elle DOIT rafraîchir
    # `derniere_activite` au même titre que les trois autres.
    w = un(E.reconstruire([
        ev(TM(0), "SubagentStart", agent_type="architect", agent_id="a1"),
        ev(TM(35), "PostToolUse", tool="Read"),
        # aucune fermeture : le passage reste ouvert
    ], maintenant=MAINTENANT(40), seuil_abandon_minutes=36))
    check("test_B1b_posttooluse_nu_sans_file_reste_en_cours",
          w["passages"][0]["etat"] == E.ETAT_EN_COURS,
          "obtenu %r (un PostToolUse sans `file` et sans échec doit compter "
          "comme activité observée)" % w["passages"][0]["etat"])

    # B2 — le cas RÉEL relevé par l'utilisateur : `test-engineer`, jamais
    # fermé, 22 h plus tard sur le tableau de bord.
    w = un(E.reconstruire([
        ev("2026-09-13T19:11:54.581Z", "SubagentStart",
           agent_type="test-engineer", agent_id="afa8010143f22bb24"),
    ], maintenant=_struct_time("2026-09-14T17:11:54.581Z"), seuil_abandon_minutes=120))
    check("test_B2_cas_reel_test_engineer_afa8010143f22bb24_sans_cloture",
          w["passages"][0]["etat"] == E.ETAT_SANS_CLOTURE,
          "obtenu %r" % w["passages"][0]["etat"])

    # B3 — `maintenant=None` : la garde reste PROUVABLEMENT inerte, quel que
    # soit le seuil fourni. C'est le comportement par défaut de `reconstruire()`
    # (rétrocompatibilité) qu'aucun appelant existant ne doit voir changer.
    w = un(E.reconstruire([
        ev(TM(0), "SubagentStart", agent_type="test-engineer", agent_id="a1"),
    ], seuil_abandon_minutes=1))  # maintenant=None (défaut) malgré un seuil ridicule
    check("test_B3_maintenant_none_desarme_la_garde",
          w["passages"][0]["etat"] == E.ETAT_EN_COURS,
          "obtenu %r — aucun sans_cloture ne doit apparaître sans horloge fournie"
          % w["passages"][0]["etat"])

    # B4 — le seuil, muté dans les deux sens (exigé par les critères
    # d'acceptation de bug-013). 10 min d'inactivité, mesurées deux fois :
    #   - seuil RACCOURCI à 5 min : le passage (pourtant vivant) est accusé.
    #   - seuil ALLONGÉ à 10**6 min : l'abandonné reste ouvert indéfiniment.
    evenements_b4 = [ev(TM(0), "SubagentStart", agent_type="test-engineer", agent_id="a1")]
    w_court = un(E.reconstruire(evenements_b4, maintenant=MAINTENANT(10), seuil_abandon_minutes=5))
    check("test_B4_seuil_raccourci_accuse_le_vivant",
          w_court["passages"][0]["etat"] == E.ETAT_SANS_CLOTURE,
          "obtenu %r" % w_court["passages"][0]["etat"])
    w_long = un(E.reconstruire(evenements_b4, maintenant=MAINTENANT(10), seuil_abandon_minutes=10**6))
    check("test_B4_seuil_allonge_laisse_l_abandonne_ouvert",
          w_long["passages"][0]["etat"] == E.ETAT_EN_COURS,
          "obtenu %r" % w_long["passages"][0]["etat"])

    # B5 — imbrication : le verdict dépend de l'ÉTAT FINAL du passage
    # antérieur, jamais de la seule présence d'une seconde ouverture.
    # (a) le premier passage ferme TARDIVEMENT : pas une imbrication.
    w = un(E.reconstruire([
        ev(T(1), "SubagentStart", agent_type="architect", agent_id="a1"),
        ev(T(2), "SubagentStart", agent_type="debugger", agent_id="a2"),
        ev(T(3), "SubagentStop", agent_id="a1"),
        ev(T(4), "SubagentStop", agent_id="a2"),
    ]))
    check("test_B5a_fermeture_tardive_n_est_pas_une_imbrication",
          w["imbrication_suspectee"] is False,
          "le passage antérieur a fini par se fermer : ce n'est pas une "
          "imbrication, juste un récit tardif")

    # (b) le premier passage ne ferme JAMAIS et reste `en_cours` : imbrication.
    w = un(E.reconstruire([
        ev(T(1), "SubagentStart", agent_type="architect", agent_id="a1"),
        ev(T(2), "SubagentStart", agent_type="debugger", agent_id="a2"),
        ev(T(3), "SubagentStop", agent_id="a2"),
    ]))
    check("test_B5b_premiere_ouverture_jamais_fermee_et_en_cours_est_une_imbrication",
          w["imbrication_suspectee"] is True)

    # (c) le premier passage ne ferme jamais mais est `sans_cloture` : ce
    # n'est plus une imbrication, c'est une fin sans annonce déjà expliquée.
    w = un(E.reconstruire([
        ev(TM(0), "SubagentStart", agent_type="architect", agent_id="a1"),
        ev(TM(1), "SubagentStart", agent_type="debugger", agent_id="a2"),
        ev(TM(2), "SubagentStop", agent_id="a2"),
    ], maintenant=MAINTENANT(1000), seuil_abandon_minutes=120))
    check("test_B5c_premiere_ouverture_sans_cloture_n_est_plus_une_imbrication",
          w["imbrication_suspectee"] is False,
          "obtenu imbrication_suspectee=%r, etat[0]=%r"
          % (w["imbrication_suspectee"], w["passages"][0]["etat"]))

    # B7 — la borne au seuil exact : le code compare `minutes > seuil`, donc
    # STRICTEMENT au-delà. Pile au seuil, c'est encore `ETAT_EN_COURS` — c'est
    # une décision (documentée ici, pas un hasard d'écriture) : la mutation
    # `>` -> `>=` doit faire échouer ce cas précis.
    evenements_b7 = [ev(TM(0), "SubagentStart", agent_type="test-engineer", agent_id="a1")]
    w_pile = un(E.reconstruire(evenements_b7, maintenant=MAINTENANT(36), seuil_abandon_minutes=36))
    check("test_B7a_pile_au_seuil_reste_en_cours",
          w_pile["passages"][0]["etat"] == E.ETAT_EN_COURS,
          "obtenu %r — 36 min d'inactivité pour un seuil de 36 : `>` ne "
          "déclenche PAS à l'égalité (décision testée, pas hasard)"
          % w_pile["passages"][0]["etat"])
    w_juste_apres = un(E.reconstruire(evenements_b7, maintenant=MAINTENANT(37), seuil_abandon_minutes=36))
    check("test_B7b_une_minute_au_dela_du_seuil_devient_sans_cloture",
          w_juste_apres["passages"][0]["etat"] == E.ETAT_SANS_CLOTURE,
          "obtenu %r" % w_juste_apres["passages"][0]["etat"])

    # B8 — `maintenant` fourni SANS seuil déclaré : la garde reste inerte,
    # au lieu de lever une `TypeError` sur `minutes > None`. La clause
    # `seuil_abandon_minutes is None` protège ce chemin précis (aucun test
    # existant ne le sollicitait : `maintenant` était None chaque fois que
    # le seuil manquait).
    w = un(E.reconstruire([
        ev(TM(0), "SubagentStart", agent_type="test-engineer", agent_id="a1"),
    ], maintenant=MAINTENANT(9999)))  # seuil_abandon_minutes=None (défaut)
    check("test_B8_maintenant_fourni_sans_seuil_ne_leve_pas_et_reste_en_cours",
          w["passages"][0]["etat"] == E.ETAT_EN_COURS,
          "obtenu %r — sans seuil déclaré, `minutes > seuil_abandon_minutes` "
          "ne doit jamais s'évaluer" % w["passages"][0]["etat"])

    # B6 — `evenements_hors_session` : les événements `LancementDemande` /
    # `LancementTermine` (pas de `session_id` connu au moment de l'écriture,
    # cf. `server.py`) sont COMPTÉS, jamais absorbés dans une session
    # fabriquée pour l'occasion.
    resultat = E.reconstruire([
        {"ts": T(1), "hook_event_name": "LancementDemande"},
        {"ts": T(2), "hook_event_name": "LancementTermine"},
        ev(T(3), "SubagentStart", agent_type="architect", agent_id="a1"),
    ])
    check("test_B6_evenements_hors_session_comptes",
          resultat.evenements_hors_session == 2,
          "obtenu %r" % resultat.evenements_hors_session)
    check("test_B6_evenement_hors_session_n_a_pas_fabrique_de_workflow",
          len(resultat) == 1,
          "seul l'événement AVEC session_id doit produire un workflow")

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for echec in _echecs:
        print("  - %s" % echec)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
