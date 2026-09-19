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

import datetime
import inspect
import json
import os
import sys
import tempfile
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
    # ⚠️ bug-012 (T0) : NE JAMAIS lire le `control-center.toml` RÉEL de ce
    # dépôt ici. `C.charger()` sans argument le ferait — et sur le poste d'un
    # développeur qui a réellement déclaré un `[serveur].fichier_jeton`
    # (l'usage même que `feature-007`/`bug-012` visent), le jeton se recharge
    # ACTIF à chaque appel (`Etat.jeton()`), et la garde de lecture ajoutée par
    # bug-012 (`_autorisation_lecture`, appelée dès que `jeton.actif()` est
    # vrai, MÊME en boucle locale — condition 5 du GATE) renvoie alors 401 à
    # `GET /api/etat` sans `Authorization`. Mesuré PAR EXÉCUTION : 5 tests
    # tombaient ainsi sur le dépôt réel de l'utilisateur, verts sur un clone
    # git neuf (`control-center.toml` gitignoré, donc absent) — deux mesures
    # exactes, sur deux environnements différents. Une suite qui passe ou
    # échoue selon la configuration LOCALE du poste ne prouve rien, et masque
    # le défaut exactement chez qui se sert de la fonctionnalité (la CI, elle,
    # ne le verrait jamais). On force donc ici un fichier de config qui
    # N'EXISTE PAS (`chemin_config_isole`, jamais créé) : `C.charger()` rend
    # alors les DÉFAUTS purs (§ config.py, `_DEFAUTS` : aucun `fichier_jeton`,
    # jeton inactif), quel que soit ce que ce poste a déclaré par ailleurs —
    # exactement le comportement que ce fichier vérifiait avant que
    # `bug-012` ne rende le jeton pertinent en lecture. `racine_projet` reste
    # le VRAI dépôt : specs, agents et git restent ceux du projet, seule la
    # section `[serveur]` (et tout le reste de la config déclarée) est
    # neutralisée.
    racine_reelle = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(SRV.__file__))))
    dossier_isole = tempfile.mkdtemp(prefix="cc-test-server-config-")
    chemin_config_isole = os.path.join(dossier_isole, "n-existe-jamais.toml")
    config = C.charger(chemin=chemin_config_isole, racine_projet=racine_reelle)
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
        #    est EXACTEMENT l'ensemble ci-dessous (feature-008 : ADR-0027 y
        #    ajoute `/api/spec/brouillon` et `/api/spec/ecrire` — la première
        #    n'écrit rien mais doit rester dans cette liste pour être
        #    ATTEIGNABLE, `do_POST` n'en routant aucun chemin absent d'ici) :
        #    y ajouter une route sans la déclarer ici (ou l'inverse) fait
        #    échouer ce test.
        methodes_do = {n for n in dir(SRV.Handler) if n.startswith("do_")}
        check("test_do_methodes_limitees_a_get_et_post",
              methodes_do == {"do_GET", "do_POST"},
              "trouvées : %r" % sorted(methodes_do))
        check("test_routes_ecriture_fermees",
              set(SRV._ROUTES_ECRITURE) == {"/api/lancer", "/api/interrompre",
                                             "/api/spec/brouillon", "/api/spec/ecrire"},
              "trouvées : %r" % sorted(SRV._ROUTES_ECRITURE))

        # --- routes de lecture ----------------------------------------------
        code, corps = appeler(base, "/api/etat")
        check("test_etat_repond", code == 200)
        etat = json.loads(corps) if code == 200 else {}
        # Corrigé (bug-012, ADR-0020, correctif 2) : cette config isolée ne
        # déclare aucun `fichier_jeton`, et la requête arrive par la boucle
        # locale (`127.0.0.1`) — sous ADR-0020, l'écriture y RÉUSSIT sans
        # secret (même règle que `do_POST`), donc `ecriture_active` doit
        # l'annoncer. Avant ce correctif, ce champ restait lié à la seule
        # présence d'un jeton CONFIGURÉ (A6b), plus à la capacité du
        # demandeur — cette assertion valait alors `False` à tort.
        check("test_etat_annonce_ecriture_active_local_sans_jeton",
              etat.get("ecriture_active") is True,
              "obtenu %r" % etat.get("ecriture_active"))
        check("test_etat_annonce_ecriture_raison_vide_local_sans_jeton",
              not etat.get("ecriture_raison"),
              "obtenu %r" % etat.get("ecriture_raison"))
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

        # --- E10 (feature-015) : atteignabilité de `theme.js` ----------------
        # Un fichier neuf dans `web/` doit être RAMASSÉ par `_fichiers_servables()`
        # au démarrage réel du serveur, pas seulement lisible en `file://` — sinon
        # la garde CSP/amorçage-synchrone documentée par la spec est une garde
        # livrée mais inatteignable (404 en HTTP alors que le CSS reste 200).
        # Mesuré sur la VRAIE racine web (`serveur.servables` déjà calculé plus
        # haut par `_fichiers_servables()` sur le dépôt réel, pas un `faux_web`).
        check("test_theme_js_dans_servables", "theme.js" in serveur.servables,
              "clés trouvées : %r" % sorted(serveur.servables))
        code, _ = appeler(base, "/theme.js")
        check("test_theme_js_servi", code == 200, "obtenu %d" % code)

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
        with tempfile.TemporaryDirectory() as faux_web:
            for nom, contenu in (("ok.css", "body{}"),
                                 ("secrets.env", "JETON=valeur"),
                                 ("notes.txt", "interne"),
                                 # Revue finale, bug-012 : `web/test_app_bug012.js`
                                 # est un harnais, pas un livrable — une extension
                                 # `.js` autorisée ne doit pas suffire à le rendre
                                 # servable, distant compris, sans jeton.
                                 ("test_app_bug012.js", "// harnais, pas un livrable")):
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
                check("test_fichier_test_absent_des_servables",
                      "test_app_bug012.js" not in serveur.servables,
                      "un harnais de test figure dans la liste servable")
                code, _ = appeler(base, "/test_app_bug012.js")
                check("test_fichier_test_refuse_en_http", code >= 400,
                      "obtenu %d : un `test_*` ne doit jamais être servi" % code)
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

        # ⚠️ bug-013 : `instantane()` requalifie désormais un passage ouvert
        # `sans_cloture` contre l'horloge RÉELLE (`time.gmtime()`, jamais
        # figée dans ce test). Une date codée en dur finirait, avec le temps,
        # par dépasser le seuil d'abandon et faire ce test — c'est
        # exactement le défaut que bug-013 corrige, pas un artefact à
        # contourner. Les horodatages sont donc relatifs à MAINTENANT.
        _base_e12 = datetime.datetime.now(datetime.timezone.utc)

        def _t(seconde):
            instant = _base_e12 + datetime.timedelta(seconds=seconde)
            return instant.strftime("%Y-%m-%dT%H:%M:%S.000Z")

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

        # --- bug-013 : `instantane()` ne compte pas un agent `sans_cloture` ---
        # comme actif — c'est la garde qui manquait quand un agent tué par le
        # runtime restait affiché « en cours » indéfiniment.
        with tempfile.TemporaryDirectory() as tmp_b013:
            journal_b013 = os.path.join(tmp_b013, "j.jsonl")
            recent = datetime.datetime.now(datetime.timezone.utc)

            def _ts(dt):
                return dt.strftime("%Y-%m-%dT%H:%M:%S.000Z")

            with open(journal_b013, "w", encoding="utf-8") as f:
                for e in [
                    _ev("2020-01-01T00:00:00.000Z", "SubagentStart",
                        agent_type="debugger", agent_id="mort1"),
                    # jamais fermé, dernière activité en l'an 2020 : abandonné
                    _ev(_ts(recent), "SubagentStart",
                        agent_type="test-engineer", agent_id="vivant1"),
                    # jamais fermé non plus, mais actif À L'INSTANT
                ]:
                    f.write(json.dumps(e) + "\n")

            toml_b013 = os.path.join(tmp_b013, "c.toml")
            with open(toml_b013, "w", encoding="utf-8") as f:
                # Seuil MINIMAL autorisé (60 min, borné par config.py) : l'agent
                # de 2020 est abandonné depuis bien plus longtemps que ça, quel
                # que soit le moment où ce test tourne.
                f.write('[workflows]\nseuil_abandon_minutes = 60\n')
            config_b013 = C.charger(chemin=toml_b013, racine_projet=racine_reelle)

            etat_b013 = SRV.Etat(config_b013)
            etat_b013.journal = journal_b013
            donnees_b013 = etat_b013.instantane()
            par_nom_b013 = {a["nom"]: a for a in donnees_b013["agents"]}

            check("test_B013_agent_sans_cloture_n_est_plus_actif",
                  par_nom_b013.get("debugger", {}).get("actif_sur") is None,
                  "un passage `sans_cloture` ne doit plus apparaître comme actif ; "
                  "obtenu %r" % par_nom_b013.get("debugger", {}).get("actif_sur"))
            check("test_B013_agent_recent_reste_actif",
                  par_nom_b013.get("test-engineer", {}).get("actif_sur") is not None,
                  "un passage réellement récent doit rester actif ; obtenu %r"
                  % par_nom_b013.get("test-engineer", {}).get("actif_sur"))

        # --- `_raison_publique` ne laisse jamais fuir le chemin du jeton -----
        # Couverture RÉTABLIE (revue finale, bug-012) : le test équivalent
        # vivait dans `test_server_ecriture.py` (`test_T7_…_ne_contient_pas_
        # de_chemin`), sur un `GET /api/etat` sans authentification. Ce chemin
        # HTTP n'existe plus pour cette assertion : depuis le correctif 1 de
        # ce même cycle, la lecture et l'écriture partagent EXACTEMENT la même
        # garde, donc tout `/api/etat` qui répond 200 a déjà `ecriture_active`
        # vrai et `ecriture_raison` vide — il n'y a plus de 200 anonyme sur
        # lequel observer un motif non vide. La garantie visée (masquer le
        # chemin) reste réelle, portée par `_raison_publique` seule : on la
        # vérifie donc directement sur la fonction, avec un refus qui
        # EMBARQUE le chemin (`jeton.py` : « vide », « absent ou illisible »,
        # « n'est pas un fichier régulier », « situé DANS le dépôt » le
        # font), pour que retirer le `.replace()` de masquage fasse
        # réellement échouer ce test.
        class _ConfigJetonFactice:
            def __init__(self, chemin):
                self._chemin = chemin

            def fichier_jeton(self):
                return self._chemin

        chemin_sensible = "/home/quelquun/secrets/.jeton-centre-de-controle"
        jeton_invalide = SRV.J.Jeton(
            refus="fichier_jeton vide (%s)" % chemin_sensible)
        config_jeton_factice = _ConfigJetonFactice(chemin_sensible)
        raison = SRV._raison_publique(jeton_invalide, config_jeton_factice)
        check("test_raison_publique_motif_nomme", bool(raison), "obtenu %r" % raison)
        check("test_raison_publique_ne_contient_pas_le_chemin",
              chemin_sensible not in (raison or ""),
              "le chemin du jeton fuit dans la raison publique : %r" % raison)
        check("test_raison_publique_porte_le_masque",
              "<chemin masqué>" in (raison or ""),
              "obtenu %r" % raison)

        jeton_actif_factice = SRV.J.Jeton(valeur=b"x" * 20)
        check("test_raison_publique_none_si_jeton_actif",
              SRV._raison_publique(jeton_actif_factice, config_jeton_factice) is None,
              "un jeton ACTIF ne doit exposer aucune raison")

        # --- l'empreinte ne bouge pas toute seule ----------------------------
        # Sans cela l'interface se rafraîchirait en boucle : l'instantané
        # contient un horodatage, l'empreinte ne doit surtout pas le contenir.
        premiere = serveur.etat.empreinte()
        deuxieme = serveur.etat.empreinte()
        check("test_empreinte_stable_sans_changement", premiere == deuxieme,
              "une empreinte instable rafraîchirait l'interface en permanence")

        # --- le message de démarrage vide le tampon ---------------------------
        # Relevé en usage réel : lancé par `nohup … > fichier`, le serveur
        # paraissait MUET — le banner restait dans le tampon de stdout, tandis
        # que les logs de requêtes (stderr, non tamponné) s'affichaient. Or
        # `serve_forever()` ne rend jamais la main : sans vidage explicite, la
        # ligne « écoute » n'apparaît qu'à l'ARRÊT du processus. C'est
        # précisément la ligne dont le README dit qu'elle FAIT FOI sur l'adresse
        # et le port.
        #
        # ⚠️ Test STRUCTUREL et non fonctionnel, décision assumée : la version
        # fonctionnelle (lancer un vrai serveur, stdout redirigé, relire le
        # fichier) a été écrite, et elle ÉCHOUE dès qu'un tableau de bord tourne
        # déjà — le port de `control-center.toml` est alors pris, le fils meurt
        # avant d'imprimer quoi que ce soit. Un test qui dépend de l'absence de
        # serveur sur la machine est un test qu'on finit par désactiver. On
        # épingle donc la structure, comme pour la course du verrou (T9).
        # ⚠️ On vise l'APPEL `serveur.serve_forever()`, pas le mot
        # « serve_forever » : il apparaît deux fois dans `demarrer()`, et la
        # première occurrence est dans un commentaire, AVANT le vidage. Chercher
        # le mot faisait échouer ce test sur du code correct — la version courte
        # testait un cas fréquent au lieu de la règle.
        source_demarrer = inspect.getsource(SRV.demarrer)
        pos_flush = source_demarrer.find("sys.stdout.flush()")
        pos_boucle = source_demarrer.find("serveur.serve_forever()")
        check("test_banner_demarrage_vide_le_tampon",
              pos_flush != -1 and pos_boucle != -1 and pos_flush < pos_boucle,
              "`demarrer()` doit vider stdout AVANT serve_forever(), qui ne rend "
              "jamais la main ; sinon le banner reste invisible sous redirection")

    finally:
        serveur.shutdown()
        serveur.server_close()
        import shutil
        shutil.rmtree(dossier_isole, ignore_errors=True)

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
