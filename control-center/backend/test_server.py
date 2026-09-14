#!/usr/bin/env python3
"""Tests du serveur — étape C, lecture seule.

    python3 control-center/backend/test_server.py

Lance un vrai serveur sur un port éphémère et l'interroge par HTTP. Les cas qui
comptent ne sont pas les routes qui marchent, ce sont celles qui doivent
**refuser** : c'est la seule chose qui protégera le dépôt quand l'interface
écoutera au-delà de `localhost`.

La propriété centrale de cette étape est structurelle : `Handler` n'a pas de
`do_POST`. Un test le vérifie par HTTP (501) ET par introspection — si quelqu'un
ajoute une route d'écriture, le second échoue même si le premier est contourné.
"""

import json
import os
import sys
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C  # noqa: E402
import server as SRV  # noqa: E402

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


_sautes = []


def saute(nom, raison):
    """Un cas non joué est DÉCLARÉ, jamais absent du décompte."""
    global _tests
    _tests += 1
    _sautes.append(nom)
    print("  sauté  %s — %s" % (nom, raison))


def appeler(base, chemin, methode="GET"):
    """Rend (code, corps). Une erreur HTTP est une réponse, pas une exception."""
    requete = urllib.request.Request(base + chemin, method=methode)
    try:
        with urllib.request.urlopen(requete, timeout=10) as reponse:
            return reponse.status, reponse.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as erreur:
        return erreur.code, erreur.read().decode("utf-8", "replace")
    except Exception as erreur:  # connexion refusée, etc.
        return 0, str(erreur)


def main():
    config = C.charger()
    serveur = ThreadingHTTPServer(("127.0.0.1", 0), SRV.Handler)
    serveur.daemon_threads = True
    serveur.etat = SRV.Etat(config)
    serveur.servables = SRV._fichiers_servables()
    base = "http://127.0.0.1:%d" % serveur.server_address[1]
    fil = threading.Thread(target=serveur.serve_forever, daemon=True)
    fil.start()

    try:
        # --- ce qui reste hors de portée, structurellement -------------------
        # `do_PUT`/`do_DELETE`/`do_PATCH` n'existent toujours pas : ces
        # méthodes restent refusées par `http.server` lui-même (501).
        for methode in ("PUT", "DELETE", "PATCH"):
            code, _ = appeler(base, "/api/etat", methode)
            check("test_%s_refuse" % methode.lower(), code == 501,
                  "toute méthode sans do_* doit être refusée ; obtenu %d" % code)

        # `do_POST` EXISTE depuis l'étape D, mais ne route que les chemins de
        # `_ROUTES_ECRITURE` : un POST sur une route de lecture est une route
        # INCONNUE pour do_POST, donc 404 — et sans aucun effet (aucun verrou
        # pris, aucun processus créé, puisque ce chemin est écarté avant tout
        # le reste de `do_POST`).
        code, _ = appeler(base, "/api/etat", "POST")
        check("test_post_sur_route_non_ecriture_refuse", code == 404,
              "un POST hors de _ROUTES_ECRITURE doit être une route inconnue, "
              "sans effet ; obtenu %d" % code)

        # Vérification STRUCTURELLE, remplaçant celle d'ADR-0004 (qui exigeait
        # l'ABSENCE de toute méthode d'écriture) : ADR-0004 est rempli, cette
        # étape écrit désormais. La garantie qui la remplace est double —
        # POSITIVE et FERMÉE, plutôt que négative :
        # 1. l'ensemble des méthodes `do_*` du Handler ne contient RIEN de
        #    plus que GET et POST : ajouter un `do_PUT` un jour ferait échouer
        #    ce test, même si son comportement HTTP était par ailleurs masqué ;
        # 2. l'ensemble des routes d'écriture réellement routées par `do_POST`
        #    est EXACTEMENT `{"/api/lancer", "/api/interrompre"}` : y ajouter
        #    une route sans la déclarer ici (ou l'inverse) fait échouer ce test.
        methodes_do = {n for n in dir(SRV.Handler) if n.startswith("do_")}
        check("test_do_methodes_limitees_a_get_et_post",
              methodes_do == {"do_GET", "do_POST"},
              "trouvées : %r" % sorted(methodes_do))
        check("test_routes_ecriture_fermees",
              set(SRV._ROUTES_ECRITURE) == {"/api/lancer", "/api/interrompre"},
              "trouvées : %r" % sorted(SRV._ROUTES_ECRITURE))

        # --- routes de lecture ----------------------------------------------
        code, corps = appeler(base, "/api/etat")
        check("test_etat_repond", code == 200)
        etat = json.loads(corps) if code == 200 else {}
        # Ce dépôt (`control-center.toml`) ne déclare aucun `fichier_jeton` :
        # l'écriture doit donc être annoncée INACTIVE, par le même test que
        # celui qui gouverne `do_POST` (A6b) — plus de champ codé en dur.
        check("test_etat_annonce_ecriture_inactive", etat.get("ecriture_active") is False)
        # ⚠️ On vérifie le TYPE, pas le nombre. Affirmer `> 0` serait une
        # assertion sur le PROJET, pas sur le code : un dépôt neuf issu du
        # template n'a aucune spec, et c'est normal. Constaté en portant le
        # centre de contrôle dans le template, dont les répertoires de specs sont
        # vides — le test échouait alors que rien n'était cassé.
        check("test_etat_porte_une_liste_de_specs", isinstance(etat.get("specs"), list))
        check("test_etat_porte_une_liste_d_agents", isinstance(etat.get("agents"), list))

        # --- AUCUN champ sensible ne sort -----------------------------------
        for interdit in ("transcript_path", "/root/.claude", ".credentials",
                         "permission_mode", "prompt_id"):
            check("test_aucune_fuite_de_%s" % interdit.strip("/.").replace("/", "_"),
                  interdit not in corps,
                  "le journal contient ce champ ; la liste blanche de "
                  "`_evenement_public` doit l'écarter")

        code, _ = appeler(base, "/")
        check("test_page_servie", code == 200)
        code, _ = appeler(base, "/app.css")
        check("test_css_servi", code == 200)

        # --- ce qui doit refuser --------------------------------------------
        refus = [
            ("/api/spec?id=../../../etc/passwd", "spec par remontée"),
            ("/api/spec?id=", "spec sans identifiant"),
            ("/api/spec?id=nexiste-pas", "spec inconnue"),
            ("/api/diff?chemin=../../etc/passwd", "diff par remontée"),
            ("/api/diff?chemin=/etc/passwd", "diff par chemin absolu"),
            ("/server.py", "source du serveur"),
            ("/../backend/server.py", "remontée dans le statique"),
            ("/api/inconnu", "route inconnue"),
        ]
        for chemin, libelle in refus:
            code, _ = appeler(base, chemin)
            check("test_refus_%s" % libelle.replace(" ", "_"), code >= 400,
                  "%s a répondu %d au lieu d'un refus" % (chemin, code))

        # --- une spec réelle se lit ------------------------------------------
        # ⚠️ Ces deux cas dépendent du contenu du dépôt. Ils étaient SAUTÉS EN
        # SILENCE quand il n'y avait aucune spec : le total passait de 30 à 28
        # sans que rien ne le dise. Un compteur qui change sans explication est
        # un compteur faux. On les déclare donc explicitement sautés.
        specs = etat.get("specs", [])
        if specs:
            code, corps = appeler(base, "/api/spec?id=" + specs[0]["id"])
            check("test_spec_reelle_lisible", code == 200 and "contenu" in json.loads(corps))
            check("test_spec_rend_son_statut_brut",
                  "statut_texte" in json.loads(corps),
                  "le statut doit être rendu TEL QUEL, jamais réécrit")
        else:
            saute("test_spec_reelle_lisible", "aucune spec dans ce dépôt")
            saute("test_spec_rend_son_statut_brut", "aucune spec dans ce dépôt")

        # --- la liste FERMÉE des fichiers statiques --------------------------
        # ⚠️ Ce cas ne va pas de soi. Les refus testés plus haut (`/server.py`)
        # passaient pour une AUTRE raison : le fichier n'existe pas dans `web/`.
        # La contribution propre de la liste fermée est d'écarter un fichier
        # PRÉSENT mais d'extension non prévue — une note, un fichier
        # d'environnement, une sauvegarde. Sans ce cas, le mutant qui supprime la
        # liste survivait.
        import tempfile
        with tempfile.TemporaryDirectory() as faux_web:
            for nom, contenu in (("ok.css", "body{}"),
                                 ("secrets.env", "JETON=valeur"),
                                 ("notes.txt", "interne")):
                with open(os.path.join(faux_web, nom), "w", encoding="utf-8") as f:
                    f.write(contenu)
            ancienne_racine, anciens = SRV._RACINE_WEB, serveur.servables
            SRV._RACINE_WEB = faux_web
            serveur.servables = SRV._fichiers_servables()
            try:
                code, _ = appeler(base, "/ok.css")
                check("test_extension_autorisee_servie", code == 200)
                for nom in ("secrets.env", "notes.txt"):
                    code, corps = appeler(base, "/" + nom)
                    check("test_extension_non_prevue_refusee_%s" % nom.split(".")[-1],
                          code >= 400,
                          "%s présent dans web/ a été servi (%d) : la liste des "
                          "extensions doit trancher, pas l'existence du fichier"
                          % (nom, code))
            finally:
                SRV._RACINE_WEB = ancienne_racine
                serveur.servables = anciens

        # --- E12 : `actifs` (bug-004) restreint au dernier segment -----------
        # Session avec deux cycles marqués : un agent laissé ouvert dans le
        # PREMIER segment (fermeture perdue) ne doit jamais ressusciter comme
        # actif ; seul un passage ouvert dans le DERNIER segment compte.

        def _ev(ts, nom, **extra):
            base = {"ts": ts, "hook_event_name": nom, "session_id": "s-actif",
                    "runtime": "claude-code"}
            base.update(extra)
            return base

        def _t(seconde):
            return "2026-09-13T10:%02d:%02d.000Z" % (seconde // 60, seconde % 60)

        with tempfile.TemporaryDirectory() as tmp_e12:
            journal_e12 = os.path.join(tmp_e12, "j.jsonl")
            with open(journal_e12, "w", encoding="utf-8") as f:
                for e in [
                    _ev(_t(1), "SubagentStart", agent_type="orchestrator", agent_id="a1"),
                    _ev(_t(2), "SubagentStop", agent_id="a1"),
                    _ev(_t(3), "SubagentStart", agent_type="debugger", agent_id="d1"),
                    # d1 n'est JAMAIS fermé : sa fermeture est perdue, dans le
                    # premier segment (indice 0).
                    _ev(_t(4), "SubagentStart", agent_type="orchestrator", agent_id="a2"),
                    _ev(_t(5), "SubagentStop", agent_id="a2"),
                    _ev(_t(6), "SubagentStart", agent_type="test-engineer", agent_id="e1"),
                    # e1 reste ouvert dans le DERNIER segment (indice 1) : lui
                    # doit apparaître actif.
                ]:
                    f.write(json.dumps(e) + "\n")

            toml_e12 = os.path.join(tmp_e12, "c.toml")
            with open(toml_e12, "w", encoding="utf-8") as f:
                f.write('[workflows]\nagents_ouvrants = ["orchestrator"]\naffiches = 20\n')
            # racine_projet = le dépôt réel : ses `.claude/agents/` déclarent
            # bien `debugger` et `test-engineer`, sans qu'il faille en fabriquer
            # de faux ici.
            racine_reelle = os.path.dirname(
                os.path.dirname(os.path.dirname(os.path.abspath(SRV.__file__))))
            config_e12 = C.charger(chemin=toml_e12, racine_projet=racine_reelle)

            etat_e12 = SRV.Etat(config_e12)
            etat_e12.journal = journal_e12
            donnees_e12 = etat_e12.instantane()
            par_nom = {a["nom"]: a for a in donnees_e12["agents"]}

            check("test_E12_actif_ignore_le_segment_anterieur",
                  par_nom.get("debugger", {}).get("actif_sur") is None,
                  "un passage ouvert dans un segment clos par un marqueur "
                  "ultérieur ne doit pas ressusciter comme actif ; obtenu %r"
                  % par_nom.get("debugger", {}).get("actif_sur"))
            check("test_E12_actif_pointe_le_workflow_id_du_dernier_segment",
                  par_nom.get("test-engineer", {}).get("actif_sur") == "s-actif#1",
                  "obtenu %r" % par_nom.get("test-engineer", {}).get("actif_sur"))

            # --- `len(workflows) <= affiches` ---------------------------------
            toml_borne = os.path.join(tmp_e12, "borne.toml")
            with open(toml_borne, "w", encoding="utf-8") as f:
                f.write('[workflows]\nagents_ouvrants = ["orchestrator"]\naffiches = 1\n')
            config_borne = C.charger(chemin=toml_borne, racine_projet=racine_reelle)
            etat_borne = SRV.Etat(config_borne)
            etat_borne.journal = journal_e12
            donnees_borne = etat_borne.instantane()
            check("test_E12_len_workflows_borne_par_affiches",
                  len(donnees_borne["workflows"]) <= config_borne.workflows_affiches(),
                  "obtenu %d workflow(s) pour affiches=%d"
                  % (len(donnees_borne["workflows"]), config_borne.workflows_affiches()))
            check("test_E12_affiches_1_tronque_bien_a_un_seul",
                  len(donnees_borne["workflows"]) == 1,
                  "la session compte 2 cycles ; obtenu %d" % len(donnees_borne["workflows"]))

        # --- l'empreinte ne bouge pas toute seule ----------------------------
        # Sans cela l'interface se rafraîchirait en boucle : l'instantané
        # contient un horodatage, l'empreinte ne doit surtout pas le contenir.
        premiere = serveur.etat.empreinte()
        deuxieme = serveur.etat.empreinte()
        check("test_empreinte_stable_sans_changement", premiere == deuxieme,
              "une empreinte instable rafraîchirait l'interface en permanence")

    finally:
        serveur.shutdown()
        serveur.server_close()

    print("\n%d cas, %d echec(s)%s"
          % (_tests, len(_echecs),
             (", %d sauté(s)" % len(_sautes)) if _sautes else ""))
    for echec in _echecs:
        print("  - %s" % echec)
    return 1 if _echecs else 0


if __name__ == "__main__":
    try:
        _code = main()
    except Exception as erreur:
        print("\n%d cas atteints, INTERROMPU par %s : %s"
              % (_tests, type(erreur).__name__, erreur))
        _code = 1
    sys.exit(_code)
