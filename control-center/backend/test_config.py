#!/usr/bin/env python3
"""Tests du chargement de configuration.

    python3 control-center/backend/test_config.py

Deux propriétés comptent ici, et elles tirent dans des sens opposés :

1. **L'outil démarre toujours.** Fichier absent, TOML cassé, section vide : il
   part sur les défauts. Un projet instancié depuis le template n'a peut-être
   rien à déclarer, et ce n'est pas une erreur.

2. **La liste des commandes est FERMÉE.** C'est la seule chose qui empêchera une
   chaîne venue du réseau d'atteindre un shell. Elle doit refuser tout ce qui
   n'est pas exactement une liste d'arguments déclarée.
"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C  # noqa: E402
import events as E  # noqa: E402
import server as SRV  # noqa: E402
import redaction_commande as RC  # noqa: E402

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


def ecrire(dossier, contenu):
    chemin = os.path.join(dossier, "c.toml")
    with open(chemin, "w", encoding="utf-8") as fichier:
        fichier.write(contenu)
    return chemin


def main():
    with tempfile.TemporaryDirectory() as tmp:
        # --- démarrage sans configuration -----------------------------------
        c = C.charger(chemin=os.path.join(tmp, "absent.toml"), racine_projet=tmp)
        check("test_fichier_absent_donne_les_defauts",
              c["_fichier_lu"] is False and len(c.colonnes()) == 3)
        check("test_defaut_ecoute_uniquement_en_local",
              c.section("serveur")["hote"] == "127.0.0.1",
              "ouvrir au réseau doit être une décision explicite du projet, "
              "jamais un héritage silencieux du défaut")
        check("test_defaut_aucune_commande_autorisee",
              c.section("commandes") == {} and c.commande("tests") is None,
              "sans déclaration, RIEN n'est lançable")

        c = C.charger(chemin=ecrire(tmp, "ceci n'est pas du toml ["), racine_projet=tmp)
        check("test_toml_casse_ne_bloque_pas_le_demarrage",
              c["_fichier_lu"] is False and len(c.colonnes()) == 3,
              "un fichier cassé doit dégrader vers les défauts, pas empêcher de démarrer")

        # --- fusion : la surcharge COMPLÈTE, elle n'efface pas ---------------
        c = C.charger(chemin=ecrire(tmp, "[serveur]\nport = 9000\n"), racine_projet=tmp)
        check("test_surcharge_partielle_conserve_le_reste",
              c.section("serveur")["port"] == 9000
              and c.section("serveur")["hote"] == "127.0.0.1",
              "déclarer un seul réglage ne doit pas effacer les autres de sa section")

        c = C.charger(chemin=ecrire(tmp, '[specs.vocabulaire]\ngelee = "done"\n'),
                      racine_projet=tmp)
        voc = c.section("specs")["vocabulaire"]
        check("test_vocabulaire_ajoute_sans_effacer",
              voc.get("gelee") == "done" and voc.get("todo") == "todo",
              "un projet ajoute son vocabulaire propre, il ne repart pas de zéro")

        # --- liste FERMÉE des commandes -------------------------------------
        c = C.charger(chemin=ecrire(tmp, '''[commandes]
tests = ["pio", "test", "-e", "native"]
mauvais_type = "rm -rf /"
vide = []
melange = ["ls", 42]
'''), racine_projet=tmp)
        check("test_commande_declaree_rendue_en_argv",
              c.commande("tests") == ["pio", "test", "-e", "native"])
        check("test_commande_inconnue_refusee", c.commande("nimporte_quoi") is None,
              "une clé inconnue ne doit RIEN rendre : c'est ce qui ferme la liste")
        check("test_commande_en_chaine_refusee", c.commande("mauvais_type") is None,
              "une chaîne serait une ligne de commande — exactement ce qu'on interdit")
        check("test_commande_vide_refusee", c.commande("vide") is None)
        check("test_commande_aux_elements_non_textuels_refusee",
              c.commande("melange") is None)
        check("test_argv_rendu_est_une_copie",
              (lambda a: (a.append("rm"), c.commande("tests") == ["pio", "test", "-e", "native"])[1])(
                  c.commande("tests")),
              "modifier l'argv rendu ne doit pas contaminer la configuration")

        check("test_tetes_de_commande_font_le_pont_avec_le_journal",
              c.tetes_de_commande() == {"pio test"},
              "le journal ne connaît que des têtes à deux jetons ; la config des "
              "argv. Sans traduction, ce sont deux notions sans lien ; obtenu %r"
              % c.tetes_de_commande())

        # --- colonnes --------------------------------------------------------
        c = C.charger(chemin=ecrire(tmp, '''[[specs.colonnes]]
repertoire = "backlog"
libelle = "Idées"

[[specs.colonnes]]
repertoire = "wip"
'''), racine_projet=tmp)
        check("test_colonnes_du_projet_remplacent_les_defauts",
              [r for r, _, _ in c.colonnes()] == ["backlog", "wip"],
              "une LISTE se remplace, elle ne fusionne pas — sinon on hériterait "
              "de colonnes d'un autre projet")
        check("test_repertoire_sert_de_classe_par_defaut",
              [cl for _, cl, _ in c.colonnes()] == ["backlog", "wip"],
              "il n'existe qu'un seul système de noms : la colonne EST le répertoire")
        check("test_libelle_retombe_sur_le_repertoire",
              [l for _, _, l in c.colonnes()] == ["Idées", "wip"],
              "sans libellé, afficher le répertoire est vrai ; inventer serait faux")

        c = C.charger(chemin=ecrire(tmp, '[[specs.colonnes]]\nlibelle = "sans repertoire"\n'),
                      racine_projet=tmp)
        check("test_colonne_sans_repertoire_ignoree", c.colonnes() == [])

        # --- E11 : bornage des workflows (bug-004), défensif ------------------
        c = C.charger(chemin=os.path.join(tmp, "absent3.toml"), racine_projet=tmp)
        check("test_E11_workflows_absent_donne_agents_ouvrants_vide",
              c.agents_ouvrants() == [],
              "sans [workflows], le module events.py ne doit connaître aucun nom "
              "d'agent")
        check("test_E11_workflows_absent_donne_affiches_par_defaut",
              c.workflows_affiches() == 20)

        c = C.charger(chemin=ecrire(tmp, '''[workflows]
agents_ouvrants = [42, ""]
affiches = -3
'''), racine_projet=tmp)
        check("test_E11_agents_ouvrants_malformes_rejetes_sans_exception",
              c.agents_ouvrants() == [],
              "un nombre et une chaîne vide ne sont pas des agent_type valides ; "
              "obtenu %r" % c.agents_ouvrants())
        check("test_E11_affiches_hors_bornes_retombe_sur_le_defaut",
              c.workflows_affiches() == 20,
              "-3 ne doit pas atteindre `workflows[-n:]` ; obtenu %r"
              % c.workflows_affiches())

        c = C.charger(chemin=ecrire(tmp, '[workflows]\naffiches = "dix"\n'),
                      racine_projet=tmp)
        check("test_E11_affiches_type_invalide_retombe_sur_le_defaut",
              c.workflows_affiches() == 20,
              "une chaîne n'est pas un entier ; obtenu %r" % c.workflows_affiches())

        # --- bug-013 : `seuil_abandon_minutes`, borné [60, 10080] --------------
        c = C.charger(chemin=os.path.join(tmp, "absent5.toml"), racine_projet=tmp)
        check("test_seuil_abandon_absent_donne_120",
              c.seuil_abandon_minutes() == 120,
              "obtenu %r" % c.seuil_abandon_minutes())

        c = C.charger(chemin=ecrire(tmp, '[workflows]\nseuil_abandon_minutes = 180\n'),
                      racine_projet=tmp)
        check("test_seuil_abandon_valeur_declaree_respectee",
              c.seuil_abandon_minutes() == 180,
              "obtenu %r" % c.seuil_abandon_minutes())

        c = C.charger(chemin=ecrire(tmp, '[workflows]\nseuil_abandon_minutes = 59\n'),
                      racine_projet=tmp)
        check("test_seuil_abandon_sous_la_borne_basse_retombe_sur_le_defaut",
              c.seuil_abandon_minutes() == 120,
              "59 < 60 min ne doit pas atteindre reconstruire() ; obtenu %r"
              % c.seuil_abandon_minutes())

        c = C.charger(chemin=ecrire(tmp, '[workflows]\nseuil_abandon_minutes = 60\n'),
                      racine_projet=tmp)
        check("test_seuil_abandon_borne_basse_incluse",
              c.seuil_abandon_minutes() == 60,
              "60 est la borne basse ADMISE ; obtenu %r" % c.seuil_abandon_minutes())

        c = C.charger(chemin=ecrire(tmp, '[workflows]\nseuil_abandon_minutes = 10081\n'),
                      racine_projet=tmp)
        check("test_seuil_abandon_au_dessus_de_la_borne_haute_retombe_sur_le_defaut",
              c.seuil_abandon_minutes() == 120,
              "10081 min > 1 semaine ; obtenu %r" % c.seuil_abandon_minutes())

        c = C.charger(chemin=ecrire(tmp, '[workflows]\nseuil_abandon_minutes = 10080\n'),
                      racine_projet=tmp)
        check("test_seuil_abandon_borne_haute_incluse",
              c.seuil_abandon_minutes() == 10080,
              "10080 (1 semaine) est la borne haute ADMISE ; obtenu %r"
              % c.seuil_abandon_minutes())

        c = C.charger(chemin=ecrire(tmp, '[workflows]\nseuil_abandon_minutes = "long"\n'),
                      racine_projet=tmp)
        check("test_seuil_abandon_type_invalide_retombe_sur_le_defaut",
              c.seuil_abandon_minutes() == 120,
              "une chaîne n'est pas un nombre ; obtenu %r" % c.seuil_abandon_minutes())

        c = C.charger(chemin=ecrire(tmp, '[workflows]\nseuil_abandon_minutes = true\n'),
                      racine_projet=tmp)
        check("test_seuil_abandon_booleen_retombe_sur_le_defaut",
              c.seuil_abandon_minutes() == 120,
              "un booléen est un `int` en Python — piège explicitement écarté, "
              "comme pour `workflows_affiches()` ; obtenu %r" % c.seuil_abandon_minutes())

        # --- audit (rôle AUDIT, post bug-013) : `nan`/`inf`/`-inf` sont des
        # littéraux TOML valides. Une comparaison avec `nan` est TOUJOURS
        # fausse : sans contrôle de finitude explicite, `nan` traverserait la
        # borne [60, 10080] sans jamais la déclencher, et la requalification
        # de `events.py` (`minutes > seuil`) ne se produirait plus JAMAIS —
        # la garde de bug-013 resterait déclarée, mais inatteignable.
        for toml, nom in (
            ('[workflows]\nseuil_abandon_minutes = nan\n', "test_seuil_abandon_nan_retombe_sur_le_defaut"),
            ('[workflows]\nseuil_abandon_minutes = inf\n', "test_seuil_abandon_inf_retombe_sur_le_defaut"),
            ('[workflows]\nseuil_abandon_minutes = -inf\n', "test_seuil_abandon_moins_inf_retombe_sur_le_defaut"),
        ):
            c = C.charger(chemin=ecrire(tmp, toml), racine_projet=tmp)
            check(nom, c.seuil_abandon_minutes() == 120,
                  "une valeur non finie ne compare jamais vrai avec les bornes ; "
                  "obtenu %r" % c.seuil_abandon_minutes())

        # --- le test qui compte : un seuil `nan` déclaré en configuration ne
        # doit PAS désarmer la garde de bug-013. `Config.seuil_abandon_minutes()`
        # doit rendre le défaut (120), qu'`events.reconstruire()` peut alors
        # comparer normalement — l'agent mort depuis longtemps reste
        # requalifié `sans_cloture`. Sans le contrôle de finitude, ce test
        # échoue car `nan` remonterait tel quel jusqu'à `events.py`.
        c = C.charger(chemin=ecrire(tmp, '[workflows]\nseuil_abandon_minutes = nan\n'),
                      racine_projet=tmp)
        seuil_resolu = c.seuil_abandon_minutes()
        import datetime as _dt

        def _st(iso):
            return _dt.datetime.strptime(iso, "%Y-%m-%dT%H:%M:%S.%fZ").utctimetuple()

        # agent mort depuis SIX ANS (2020 -> "maintenant" fixé en 2026) : le cas
        # le plus extrême possible, pour qu'aucune marge d'arrondi ne masque un
        # défaut de comparaison.
        evenement = {"ts": "2020-01-01T00:00:00.000Z", "hook_event_name": "SubagentStart",
                     "session_id": "s1", "agent_type": "test-engineer", "agent_id": "a1",
                     "runtime": "claude-code"}
        workflows = E.reconstruire([evenement], maintenant=_st("2026-01-01T00:00:00.000Z"),
                                    seuil_abandon_minutes=seuil_resolu)
        w = workflows[0]
        check("test_seuil_nan_la_garde_bug013_reste_atteignable",
              w["passages"][0]["etat"] == E.ETAT_SANS_CLOTURE,
              "avec seuil_abandon_minutes=nan déclaré, le défaut résolu (%r) "
              "doit encore requalifier un agent mort depuis SIX ANS ; obtenu %r"
              % (seuil_resolu, w["passages"][0]["etat"]))

        # --- feature-007 lot 1 : les accesseurs des trois garde-fous, ENFIN lus --
        c = C.charger(chemin=os.path.join(tmp, "absent4.toml"), racine_projet=tmp)
        check("test_fichier_jeton_absent_rend_none",
              c.fichier_jeton() is None,
              "sans déclaration, aucun autre module ne doit pouvoir croire "
              "qu'un jeton existe")
        check("test_budget_max_usd_defaut", c.budget_max_usd() == 5.0)
        check("test_ecrivains_simultanes_defaut", c.ecrivains_simultanes() == 1)

        c = C.charger(chemin=ecrire(tmp, '[serveur]\nfichier_jeton = "/hors/depot/.token"\n'),
                      racine_projet=tmp)
        check("test_fichier_jeton_absolu_rendu_tel_quel",
              c.fichier_jeton() == "/hors/depot/.token")

        c = C.charger(chemin=ecrire(tmp, '[serveur]\nfichier_jeton = ".token"\n'),
                      racine_projet=tmp)
        check("test_fichier_jeton_relatif_resolu_contre_la_racine_projet",
              c.fichier_jeton() == os.path.join(tmp, ".token"),
              "un chemin relatif doit se résoudre contre `racine_projet`, "
              "jamais rester relatif au répertoire d'où le serveur a été lancé")

        c = C.charger(chemin=ecrire(tmp, '[serveur]\nfichier_jeton = ""\n'),
                      racine_projet=tmp)
        check("test_fichier_jeton_chaine_vide_rend_none", c.fichier_jeton() is None)

        # --- budget_max_usd : borné strictement positif -------------------------
        c = C.charger(chemin=ecrire(tmp, "[garde_fous]\nbudget_max_usd = 2.5\n"),
                      racine_projet=tmp)
        check("test_budget_max_usd_declare_rendu", c.budget_max_usd() == 2.5)

        for toml, nom in (
            ("[garde_fous]\nbudget_max_usd = 0\n", "test_budget_zero_retombe_sur_le_defaut"),
            ("[garde_fous]\nbudget_max_usd = -3\n", "test_budget_negatif_retombe_sur_le_defaut"),
            ('[garde_fous]\nbudget_max_usd = "cinq"\n', "test_budget_type_invalide_retombe_sur_le_defaut"),
            ("[garde_fous]\nbudget_max_usd = true\n", "test_budget_booleen_retombe_sur_le_defaut"),
        ):
            c = C.charger(chemin=ecrire(tmp, toml), racine_projet=tmp)
            check(nom, c.budget_max_usd() == 5.0,
                  "un plafond à 0 ou négatif interdirait tout lancement SANS "
                  "le dire clairement ; obtenu %r" % c.budget_max_usd())

        # --- audit (rôle AUDIT, post bug-013) : `budget_max_usd` n'a AUCUNE
        # borne haute ; `inf <= 0` est faux comme `nan <= 0`, donc les deux
        # traverseraient la seule comparaison existante et seraient transmis
        # tels quels à `--max-budget-usd`.
        for toml, nom in (
            ('[garde_fous]\nbudget_max_usd = nan\n', "test_budget_nan_retombe_sur_le_defaut"),
            ('[garde_fous]\nbudget_max_usd = inf\n', "test_budget_inf_retombe_sur_le_defaut"),
            ('[garde_fous]\nbudget_max_usd = -inf\n', "test_budget_moins_inf_retombe_sur_le_defaut"),
        ):
            c = C.charger(chemin=ecrire(tmp, toml), racine_projet=tmp)
            check(nom, c.budget_max_usd() == 5.0,
                  "une valeur non finie ne doit jamais atteindre "
                  "--max-budget-usd ; obtenu %r" % c.budget_max_usd())

        # --- ecrivains_simultanes : borné entier >= 1 ---------------------------
        c = C.charger(chemin=ecrire(tmp, "[garde_fous]\necrivains_simultanes = 3\n"),
                      racine_projet=tmp)
        check("test_ecrivains_simultanes_declare_rendu", c.ecrivains_simultanes() == 3)

        for toml, nom in (
            ("[garde_fous]\necrivains_simultanes = 0\n", "test_ecrivains_zero_retombe_sur_le_defaut"),
            ("[garde_fous]\necrivains_simultanes = -1\n", "test_ecrivains_negatif_retombe_sur_le_defaut"),
            ('[garde_fous]\necrivains_simultanes = "un"\n', "test_ecrivains_type_invalide_retombe_sur_le_defaut"),
            ("[garde_fous]\necrivains_simultanes = 1.5\n", "test_ecrivains_flottant_retombe_sur_le_defaut"),
        ):
            c = C.charger(chemin=ecrire(tmp, toml), racine_projet=tmp)
            check(nom, c.ecrivains_simultanes() == 1)

        # --- budget_transmissible : critère DÉCLARATIF de la condition P1 n°7 --
        c = C.charger(chemin=ecrire(tmp, '''[commandes]
tests = ["pio", "test", "-e", "native"]
deja_borne = ["pio", "test", "--max-budget-usd", "1"]

[garde_fous]
commandes_avec_budget = ["tests", "deja_borne", "inconnue"]
'''), racine_projet=tmp)
        check("test_budget_transmissible_pour_une_commande_declaree",
              c.budget_transmissible("tests") is True)
        check("test_budget_non_transmissible_sans_declaration",
              c.budget_transmissible("cle_absente_de_commandes") is False,
              "une clé absente de [commandes] ne doit jamais transmettre le "
              "plafond")

        c_sans_liste = C.charger(chemin=ecrire(tmp, '[commandes]\nbuild = ["make"]\n'),
                                  racine_projet=tmp)
        check("test_budget_non_transmissible_pour_commande_non_listee",
              c_sans_liste.budget_transmissible("build") is False,
              "une clé valide dans [commandes] mais absente de "
              "commandes_avec_budget doit rester refusée : le défaut sûr est "
              "de ne rien ajouter en silence")

        check("test_budget_transmissible_refuse_si_argv_contient_deja_le_drapeau",
              c.budget_transmissible("deja_borne") is False,
              "--max-budget-usd déjà présent dans l'argv : l'ajouter le "
              "dupliquerait, refusé même si la clé est listée")
        check("test_budget_transmissible_refuse_pour_cle_inconnue_meme_listee",
              c.budget_transmissible("inconnue") is False,
              "'inconnue' figure dans commandes_avec_budget mais n'existe pas "
              "dans [commandes] : commande() rend None, donc refus")

        c = C.charger(chemin=os.path.join(tmp, "absent5.toml"), racine_projet=tmp)
        check("test_budget_transmissible_sans_configuration_est_faux",
              c.budget_transmissible("nimporte_quoi") is False)

        # --- feature-022 (GATE P1 re-passage, D1) : `entree()` -------------------
        # Forme HISTORIQUE (liste directe) : `entree()` rend TOUJOURS "aucune",
        # jamais autre chose — c'est le défaut sûr, identique à avant ce lot.
        c_liste = C.charger(chemin=ecrire(tmp, '[commandes]\ndemo = ["ls", "-l"]\n'),
                            racine_projet=tmp)
        check("test_entree_forme_liste_vaut_aucune",
              c_liste.entree("demo") == "aucune")
        check("test_entree_cle_absente_vaut_aucune",
              c_liste.entree("nexiste_pas") == "aucune")

        # Forme TABLE, `entree` DÉCLARÉ : seule façon d'obtenir "json-lines".
        c_table = C.charger(chemin=ecrire(tmp, '''[commandes.chat]
argv = ["claude", "-p", "--output-format", "stream-json"]
entree = "json-lines"

[commandes.silencieux]
argv = ["claude", "-p"]
'''), racine_projet=tmp)
        check("test_entree_table_json_lines_rendue",
              c_table.entree("chat") == "json-lines")
        check("test_commande_table_argv_resolu",
              c_table.commande("chat") == ["claude", "-p", "--output-format", "stream-json"],
              "obtenu %r" % c_table.commande("chat"))
        check("test_entree_table_sans_champ_entree_vaut_aucune",
              c_table.entree("silencieux") == "aucune",
              "une table SANS `entree` doit retomber sur le défaut sûr, "
              "PAS sur une absence de commande")
        check("test_commande_table_silencieuse_argv_resolu",
              c_table.commande("silencieux") == ["claude", "-p"])

        # Mutation exigée (brief) : `entree` forcé à `"json-lines"` doit faire
        # mourir un test « une commande sans déclaration reçoit `"aucune"` » —
        # c'est exactement `test_entree_cle_absente_vaut_aucune` ci-dessus et
        # celui-ci, sur une valeur explicitement invalide.
        c_invalide = C.charger(chemin=ecrire(tmp, '''[commandes.casse]
argv = ["ls"]
entree = "texte-brut"
'''), racine_projet=tmp)
        check("test_entree_valeur_invalide_retombe_sur_aucune",
              c_invalide.entree("casse") == "aucune",
              "seuls 'aucune' et 'json-lines' sont acceptés, tout le reste "
              "doit retomber sur le défaut SÛR")

        # Table sans `argv` valide : pas une commande, `commande()` rend None,
        # exactement comme une clé absente.
        c_table_cassee = C.charger(
            chemin=ecrire(tmp, '[commandes.vide]\nentree = "json-lines"\n'),
            racine_projet=tmp)
        check("test_commande_table_sans_argv_rend_none",
              c_table_cassee.commande("vide") is None)
        check("test_entree_table_sans_argv_reste_lisible",
              c_table_cassee.entree("vide") == "json-lines",
              "`entree` reste ce qui est DÉCLARÉ ; c'est `commande()` "
              "(None) qui empêche tout lancement, ailleurs dans server.py")

        # --- feature-022 (GATE P1 re-passage, S3.13) : `permissions_autorisees` -
        c_permissions = C.charger(chemin=ecrire(tmp, '''[commandes]
neutre = ["claude", "-p"]
contournement = ["claude", "-p", "--dangerously-skip-permissions"]
contournement_allow = ["claude", "-p", "--allow-dangerously-skip-permissions"]
mode_bypass = ["claude", "-p", "--permission-mode=bypassPermissions"]

[garde_fous]
commandes_sans_permissions = ["contournement"]
'''), racine_projet=tmp)
        check("test_permissions_autorisees_sans_drapeau_sensible",
              c_permissions.permissions_autorisees("neutre") is True,
              "une commande qui ne porte AUCUN drapeau sensible n'a besoin "
              "de figurer dans aucune liste")
        check("test_permissions_autorisees_drapeau_liste",
              c_permissions.permissions_autorisees("contournement") is True)
        check("test_permissions_refusees_drapeau_absent_de_la_liste",
              c_permissions.permissions_autorisees("contournement_allow") is False,
              "liste FERMÉE, VIDE par défaut : une clé absente REFUSE, même "
              "si une AUTRE clé y figure")
        check("test_permissions_refusees_bypass_par_sous_chaine",
              c_permissions.permissions_autorisees("mode_bypass") is False,
              "'bypassPermissions' cherché comme SOUS-CHAÎNE d'un token, pas "
              "seulement comme token exact")
        check("test_permissions_autorisees_cle_inconnue_est_vraie",
              c_permissions.permissions_autorisees("n_existe_pas") is True,
              "rien à autoriser : le 404 de clé inconnue prime, ailleurs")

        c_sans_garde_fou = C.charger(
            chemin=ecrire(tmp, '[commandes]\nx = ["claude", "-p", '
                               '"--dangerously-skip-permissions"]\n'),
            racine_projet=tmp)
        check("test_permissions_defaut_vide_refuse",
              c_sans_garde_fou.permissions_autorisees("x") is False,
              "commandes_sans_permissions est VIDE par défaut : le serveur "
              "ne desserre jamais rien tout seul")

        # --- accord des DEUX écrivains (bug-014, condition 5 du GATE P1) ----
        # `config.tetes_de_commande()` (via C.RC) et `server._lancer()` (via
        # SRV.RC) doivent appeler la MÊME fonction sur `" ".join(argv)` — sinon
        # les deux côtés de `tete in suivies` (events.py) divergent, et une
        # commande journalisée par l'un ne correspond plus à ce que l'autre
        # attend en filtre.
        check("test_config_et_server_partagent_le_meme_module_de_redaction",
              C.RC is SRV.RC,
              "deux copies de la même règle ont déjà dérivé trois fois "
              "(bug-012, bug-014) : il ne doit rester qu'UN module")
        argv_sensible = ["env", "POOL_PASSWORD=x", "./ota.sh"]
        tete_config = C.RC.command_head(" ".join(argv_sensible))
        tete_server = SRV.RC.command_head(" ".join(argv_sensible))
        check("test_accord_config_server_sur_argv_sensible",
              tete_config == tete_server == "env",
              "config a rendu %r, server a rendu %r (attendu 'env' des deux "
              "côtés)" % (tete_config, tete_server))

        # --- commande_pour_spec_id : placeholder DÉCLARÉ, ÉLÉMENT UNIQUE de
        # l'argv (feature-025, GATE P1 S1.3 — `ADR-0005` amendé, pas révoqué)
        c_spec = C.charger(chemin=ecrire(tmp, '''[commandes]
avec_emplacement = ["claude", "-p", "{spec_id}", "--truc"]
sans_emplacement = ["claude", "-p"]
deux_emplacements = ["echo", "{spec_id}", "{spec_id}"]
'''), racine_projet=tmp)
        argv, erreur = c_spec.commande_pour_spec_id("avec_emplacement", "feature-025-x")
        check("test_commande_pour_spec_id_substitue_un_element_unique",
              erreur is None and argv == ["claude", "-p", "feature-025-x", "--truc"],
              "obtenu argv=%r erreur=%r" % (argv, erreur))
        # ⚠️ La CHAÎNE substituée ne doit JAMAIS être découpée en tokens : un
        # `spec_id` contenant un espace doit rester UN SEUL élément de l'argv.
        argv_espace, _ = c_spec.commande_pour_spec_id("avec_emplacement", "avec espace")
        check("test_commande_pour_spec_id_jamais_de_decoupage",
              argv_espace == ["claude", "-p", "avec espace", "--truc"]
              and len(argv_espace) == 4,
              "obtenu %r (4 éléments attendus, pas 5)" % argv_espace)

        argv_none, erreur = c_spec.commande_pour_spec_id("sans_emplacement", "feature-025-x")
        check("test_commande_pour_spec_id_sans_placeholder_400",
              argv_none is None and erreur == (400, "commande sans emplacement déclaré pour spec_id"),
              "obtenu %r" % (erreur,))

        argv_double, erreur = c_spec.commande_pour_spec_id("deux_emplacements", "feature-025-x")
        check("test_commande_pour_spec_id_deux_placeholders_400",
              argv_double is None and erreur[0] == 400, "obtenu %r" % (erreur,))

        argv_inconnue, erreur = c_spec.commande_pour_spec_id("cle_inexistante", "feature-025-x")
        check("test_commande_pour_spec_id_cle_inconnue_404",
              argv_inconnue is None and erreur == (404, "clé de commande inconnue"))

        # --- feature-023 (GATE P1 S5.1/S5.6) : réglages de lecture des transcripts
        c_defaut = C.charger(chemin=os.path.join(tmp, "absent6.toml"), racine_projet=tmp)
        check("test_transcripts_racine_surcharge_absente_par_defaut",
              c_defaut.transcripts_racine_surcharge() is None)
        check("test_transcripts_budget_secondes_defaut", c_defaut.transcripts_budget_secondes() == 1.0)
        check("test_transcripts_budget_octets_defaut", c_defaut.transcripts_budget_octets() == 20_000_000)

        c_racine_absolue = C.charger(
            chemin=ecrire(tmp, '[transcripts]\nracine = "/tmp/racine-declaree"\n'),
            racine_projet=tmp)
        check("test_transcripts_racine_surcharge_absolue_rendue",
              c_racine_absolue.transcripts_racine_surcharge() == "/tmp/racine-declaree")

        c_racine_relative = C.charger(
            chemin=ecrire(tmp, '[transcripts]\nracine = "relatif/sous-repertoire"\n'),
            racine_projet=tmp)
        check("test_transcripts_racine_surcharge_relative_ignoree",
              c_racine_relative.transcripts_racine_surcharge() is None,
              "une racine relative ne peut pas remplacer un calcul de "
              "confinement absolu — obtenu %r"
              % c_racine_relative.transcripts_racine_surcharge())

        for toml, nom in (
            ('[transcripts]\nracine = ""\n', "test_transcripts_racine_vide_ignoree"),
            ('[transcripts]\nracine = 42\n', "test_transcripts_racine_type_invalide_ignoree"),
        ):
            c = C.charger(chemin=ecrire(tmp, toml), racine_projet=tmp)
            check(nom, c.transcripts_racine_surcharge() is None)

        # `0` est une valeur VALIDE pour les deux budgets (S5.6 : « budget 0
        # → champ partiel »), distincte d'une valeur absente ou invalide.
        c_budget_zero = C.charger(
            chemin=ecrire(tmp, "[transcripts]\nbudget_secondes = 0\nbudget_octets = 0\n"),
            racine_projet=tmp)
        check("test_transcripts_budget_secondes_zero_est_valide",
              c_budget_zero.transcripts_budget_secondes() == 0.0)
        check("test_transcripts_budget_octets_zero_est_valide",
              c_budget_zero.transcripts_budget_octets() == 0)

        for toml, nom in (
            ("[transcripts]\nbudget_secondes = -1\n", "test_transcripts_budget_secondes_negatif_retombe"),
            ('[transcripts]\nbudget_secondes = "vite"\n', "test_transcripts_budget_secondes_type_invalide_retombe"),
            ("[transcripts]\nbudget_secondes = true\n", "test_transcripts_budget_secondes_booleen_retombe"),
            ("[transcripts]\nbudget_secondes = nan\n", "test_transcripts_budget_secondes_nan_retombe"),
            ("[transcripts]\nbudget_secondes = inf\n", "test_transcripts_budget_secondes_inf_retombe"),
        ):
            c = C.charger(chemin=ecrire(tmp, toml), racine_projet=tmp)
            check(nom, c.transcripts_budget_secondes() == 1.0)

        for toml, nom in (
            ("[transcripts]\nbudget_octets = -1\n", "test_transcripts_budget_octets_negatif_retombe"),
            ('[transcripts]\nbudget_octets = "beaucoup"\n', "test_transcripts_budget_octets_type_invalide_retombe"),
            ("[transcripts]\nbudget_octets = true\n", "test_transcripts_budget_octets_booleen_retombe"),
            ("[transcripts]\nbudget_octets = 1.5\n", "test_transcripts_budget_octets_flottant_retombe"),
        ):
            c = C.charger(chemin=ecrire(tmp, toml), racine_projet=tmp)
            check(nom, c.transcripts_budget_octets() == 20_000_000)

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for echec in _echecs:
        print("  - %s" % echec)
    return 1 if _echecs else 0


if __name__ == "__main__":
    # ⚠️ `check()` évalue sa condition AVANT l'appel : une exception levée par le
    # code testé tue le script au lieu de compter un échec, et le résumé ne
    # s'imprime jamais. Un compte qui s'interrompt sans le dire est un compte
    # faux — constaté en validant par mutation, où trois mutants sur six ne
    # produisaient plus aucune sortie du tout.
    #
    # Le filet ci-dessous garantit qu'un résumé sort toujours et que le code de
    # retour reste non nul. Il ne remplace pas les tests : il empêche un échec
    # de se déguiser en silence.
    # ⚠️ `sys.exit()` est APPELÉ HORS du try : il lève SystemExit, que le filet
    # attraperait sinon — une suite verte affichait alors « INTERROMPU » et
    # sortait en code 1. Le filet transformait un succès en échec apparent.
    try:
        _code = main()
    except Exception as erreur:
        print("\n%d cas atteints, INTERROMPU par %s : %s"
              % (_tests, type(erreur).__name__, erreur))
        print("  (le compte ci-dessus est un MINORANT : les cas suivants "
              "n'ont pas été joués)")
        _code = 1
    sys.exit(_code)
