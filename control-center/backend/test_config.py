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
