#!/usr/bin/env python3
"""Tests de la fabrication et de l'écriture de spec (feature-008).

    python3 control-center/backend/test_redaction_spec.py

Tout tourne dans un DÉPÔT JETABLE (`tempfile.TemporaryDirectory`) : ce module
ÉCRIT réellement des fichiers, jamais dans le vrai `specs/features/todo/`.
Les templates utilisés sont des COPIES des vrais templates du projet
(`specs/features/_template.md`, `specs/modele.md`) : la structure exacte de
ces fichiers (position de `## Description`, absence de champ `ID` dans
`modele.md`…) est ce que ce module exploite, une copie inventée ne le
prouverait pas.

VALIDATION PAR MUTATION (CLAUDE.md, étape 6) — voir la table en bas de
fichier.
"""

import os
import shutil
import sys
import tempfile
import threading

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C  # noqa: E402
import redaction_spec as RS  # noqa: E402
import specs as S  # noqa: E402

_RACINE_REELLE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_TEMPLATE_FEATURE_REEL = os.path.join(_RACINE_REELLE, "specs", "features", "_template.md")
_TEMPLATE_MINIMAL_REEL = os.path.join(_RACINE_REELLE, "specs", "modele.md")

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


def _depot_jetable():
    """Construit un dépôt jetable avec les VRAIS templates copiés dedans, et
    les trois colonnes de specs créées. Rend `(tmp, config, chemin_verrou)`.

    `chemin_verrou` est TOUJOURS À L'INTÉRIEUR du dépôt jetable (PIEGES.md
    §1) : `ecrire_sous_verrou`/`ecrire_spec` retombent sinon sur le verrou
    RÉEL du dépôt (`_CHEMIN_VERROU`, dérivé de `__file__`) et y écriraient
    `var/numerotation.lock` — mesuré par l'auditeur (GATE P2, hygiène 1).
    """
    tmp = tempfile.mkdtemp(prefix="cc-test-redaction-")
    for colonne in ("todo", "doing", "done"):
        os.makedirs(os.path.join(tmp, "specs", "features", colonne), exist_ok=True)
    shutil.copy(_TEMPLATE_FEATURE_REEL, os.path.join(tmp, "specs", "features", "_template.md"))
    shutil.copy(_TEMPLATE_MINIMAL_REEL, os.path.join(tmp, "specs", "modele.md"))
    config = C.charger(chemin=os.path.join(tmp, "n-existe-pas.toml"), racine_projet=tmp)
    chemin_verrou = os.path.join(tmp, "var", "numerotation.lock")
    return tmp, config, chemin_verrou


def main():
    # --- normaliser_slug : liste blanche, jamais un retrait ciblé ------------
    check("test_slug_translitere_les_accents",
          RS.normaliser_slug("Café à Noël") == "cafe-a-noel")
    check("test_slug_remontee_de_repertoire",
          RS.normaliser_slug("../../../etc/passwd") == "etc-passwd")
    check("test_slug_chemin_absolu", RS.normaliser_slug("/etc/passwd") == "etc-passwd")
    check("test_slug_nul_et_controle",
          RS.normaliser_slug("\x00abc\ndef") == "abc-def")
    check("test_slug_uniquement_ponctuation_est_vide", RS.normaliser_slug("...") == "")
    check("test_slug_vide_est_invalide", not RS.slug_valide(""))
    check("test_slug_borne_a_60", len(RS.normaliser_slug("a" * 500)) <= 60)
    long_slug = RS.normaliser_slug("a" * 500)
    check("test_slug_borne_reste_valide_apres_troncature", RS.slug_valide(long_slug))
    check("test_slug_non_chaine_est_vide", RS.normaliser_slug(None) == "")
    check("test_slug_valide_positif", RS.slug_valide("un-slug-normal"))
    check("test_slug_invalide_underscore", not RS.slug_valide("un_slug"))
    check("test_slug_invalide_tiret_double", not RS.slug_valide("un--slug"))
    check("test_slug_invalide_majuscule", not RS.slug_valide("Un-Slug"))

    # --- escalade FAIL-CLOSED : richesse INDÉPENDANTE du genre ---------------
    check("test_richesse_complet_par_defaut_sans_derogation",
          RS.choisir_richesse(False, "titre anodin", "texte anodin") == "complet")
    check("test_richesse_minimal_si_derogation_et_rien_de_sensible",
          RS.choisir_richesse(True, "titre anodin", "texte anodin") == "minimal")
    check("test_richesse_derogation_annulee_par_mot_cle_dans_le_texte",
          RS.choisir_richesse(True, "titre anodin", "revoir l'authentification") == "complet")
    check("test_richesse_derogation_annulee_par_mot_cle_dans_le_titre",
          RS.choisir_richesse(True, "gestion des paiements", "texte anodin") == "complet")
    check("test_escalade_detecte_donnees_personnelles",
          RS.escalade_necessaire("titre", "des données personnelles sont concernées"))
    check("test_escalade_ne_declare_rien_a_tort",
          not RS.escalade_necessaire("titre anodin", "texte anodin"))

    # --- fabrication : template complet -----------------------------------------
    tmp, config, chemin_verrou = _depot_jetable()
    try:
        chemin_complet = config.chemin_template("complet")
        check("test_chemin_template_complet_resolu", chemin_complet is not None
              and os.path.isfile(chemin_complet))
        contenu, substitutions, slug = RS.fabriquer(
            "feature", "Un besoin de démonstration",
            "Texte saisi par l'utilisateur.\nDeuxième ligne.", chemin_complet)
        check("test_fabriquer_rend_un_contenu", contenu is not None)
        check("test_fabriquer_slug_calcule", slug == "un-besoin-de-demonstration")
        check("test_fabriquer_six_substitutions_template_complet",
              set(substitutions) == {"slug", "type", "statut", "maj", "titre", "texte"},
              "obtenu %r" % substitutions)
        check("test_fabriquer_type_pose", "- **Type** : feature" in contenu)
        check("test_fabriquer_slug_pose",
              "- **Slug** : un-besoin-de-demonstration" in contenu)
        check("test_fabriquer_id_reste_litteral_au_brouillon",
              "- **ID** : feature-NNN" in contenu,
              "le numéro n'est attribué qu'à l'écriture, jamais au brouillon")
        check("test_fabriquer_texte_recopie_verbatim",
              "Texte saisi par l'utilisateur.\nDeuxième ligne." in contenu)
        check("test_fabriquer_priorite_non_touchee",
              "- **Priorité** : basse | normale | haute | critique" in contenu,
              "un champ non déduit du texte doit garder son placeholder natif")

        # --- LA garde du plan : le texte saisi tombe HORS de la fenêtre de
        # 60 lignes lues par `specs._extraire_champs` (GATE P1, piège 3,
        # traité pour le template complet par le décalage de `_poser_titre`).
        lignes = contenu.split("\n")
        index_description = next(i for i, l in enumerate(lignes) if l.strip() == "## Description")
        check("test_description_hors_fenetre_lignes_entete_60",
              index_description + 1 >= 60,
              "« ## Description » est à la ligne %d (index base 0) : le texte "
              "saisi juste après retomberait DANS la fenêtre de 60 lignes"
              % index_description)

        # Preuve de bout en bout : une ligne de métadonnée FORGÉE dans le
        # texte saisi n'est PAS lue comme un vrai champ par `specs.py`.
        contenu_hostile, _, _ = RS.fabriquer(
            "feature", "Titre normal",
            "Texte.\n- **Priorité** : critique (injection)", chemin_complet)
        chemin_fichier = os.path.join(tmp, "_sonde.md")
        with open(chemin_fichier, "w", encoding="utf-8") as f:
            f.write(contenu_hostile)
        lu = S.lire_spec(chemin_fichier, "todo",
                          vocabulaire=config.section("specs").get("vocabulaire", {}),
                          lignes_entete=config.section("specs").get("lignes_entete", 60))
        check("test_injection_priorite_sans_effet_template_complet",
              lu["priorite"] == "basse | normale | haute | critique",
              "obtenu %r : le texte saisi a pollué un champ de métadonnées" % lu["priorite"])
        os.remove(chemin_fichier)

        # --- fabrication : template minimal --------------------------------
        chemin_minimal = config.chemin_template("minimal")
        contenu_min, substitutions_min, slug_min = RS.fabriquer(
            "bug", "Symptôme observé bizarre", "Le service répond 500.", chemin_minimal)
        check("test_fabriquer_template_minimal_type_bug",
              "- **Type** : bug" in contenu_min)
        check("test_fabriquer_template_minimal_pas_de_champ_slug",
              "slug" not in substitutions_min,
              "specs/modele.md n'a pas de champ Slug : rien à substituer")
        check("test_fabriquer_template_minimal_texte_sous_symptome",
              "Le service répond 500." in contenu_min)
        check("test_fabriquer_template_minimal_titre_remplace_placeholder",
              "# Symptôme observé bizarre" in contenu_min)

        # --- appliquer_numero -------------------------------------------------
        avec_numero, applique = RS.appliquer_numero(contenu, "feature", 21)
        check("test_appliquer_numero_remplace_id",
              "- **ID** : feature-021" in avec_numero and applique)
        avec_numero_min, applique_min = RS.appliquer_numero(contenu_min, "bug", 5)
        check("test_appliquer_numero_absent_pour_modele_minimal",
              not applique_min,
              "specs/modele.md n'a AUCUN champ ID : rien à réconcilier")

        # --- revue de code (feature-008) : un `- **ID** :` FORGÉ avant
        # `## Métadonnées` ne doit JAMAIS recevoir le numéro — seul celui
        # DANS le bloc `## Métadonnées` compte, par STRUCTURE, jamais par la
        # première occurrence rencontrée dans le document.
        contenu_id_forge = (
            "```\n- **ID** : feature-FORGE\n```\n\n"
            "## Métadonnées\n- **ID** : feature-NNN\n- **Slug** : x\n\n"
            "## Description\n\nrien\n")
        avec_numero_forge, applique_forge = RS.appliquer_numero(
            contenu_id_forge, "feature", 42)
        check("test_appliquer_numero_ignore_id_forge_avant_metadonnees",
              applique_forge
              and "- **ID** : feature-FORGE" in avec_numero_forge
              and "- **ID** : feature-042" in avec_numero_forge,
              "obtenu %r" % avec_numero_forge)

        # --- aucune ligne ID DU TOUT (pas de section « ## Métadonnées ») :
        # rien ne doit se passer, jamais une exception ni une invention.
        contenu_sans_id = "## Description\n\nAucune métadonnée ici.\n"
        avec_numero_sans_id, applique_sans_id = RS.appliquer_numero(
            contenu_sans_id, "feature", 7)
        check("test_appliquer_numero_sans_section_metadonnees_ne_leve_pas",
              not applique_sans_id and avec_numero_sans_id == contenu_sans_id,
              "obtenu applique=%r contenu=%r" % (applique_sans_id, avec_numero_sans_id))

        # --- numeros_pris : séries indépendantes -----------------------------
        with open(os.path.join(tmp, "specs", "features", "todo", "feature-005-x.md"), "w") as f:
            f.write("x")
        with open(os.path.join(tmp, "specs", "features", "doing", "feature-014-y.md"), "w") as f:
            f.write("x")
        with open(os.path.join(tmp, "specs", "features", "done", "bug-014-z.md"), "w") as f:
            f.write("x")
        with open(os.path.join(tmp, "specs", "features", "todo", "README.md"), "w") as f:
            f.write("pas une spec")
        with open(os.path.join(tmp, "specs", "features", "todo", "feature-abc-invalide.md"), "w") as f:
            f.write("pas conforme")
        colonnes = config.colonnes()
        pris = S.numeros_pris(os.path.join(tmp, "specs", "features"), colonnes)
        check("test_numeros_pris_deux_series_independantes",
              pris["feature"] == {5, 14} and pris["bug"] == {14},
              "obtenu %r" % pris)
        check("test_numeros_pris_ignore_fichier_non_conforme",
              21 not in pris["feature"] and "abc" not in str(pris),
              "un nom non conforme ne doit jamais planter ni polluer le compte")
        check("test_prochain_numero_max_plus_un",
              S.prochain_numero(pris, "feature") == 15)
        check("test_prochain_numero_serie_vide_demarre_a_1",
              S.prochain_numero(pris, "refactor") == 1)
        check("test_prochain_numero_bug",
              S.prochain_numero(pris, "bug") == 15)

        # --- écriture nominale, sous verrou -----------------------------------
        contenu_final, substitutions_final, slug_final = RS.fabriquer(
            "feature", "Écriture bout en bout", "Un texte complet.", chemin_complet)
        resultat, erreur = RS.ecrire_sous_verrou(
            config, "feature", slug_final, contenu_final, substitutions_final,
            chemin_verrou=chemin_verrou)
        check("test_ecriture_nominale_reussit", erreur is None, "erreur : %r" % (erreur,))
        check("test_ecriture_nominale_numero_correct",
              resultat is not None and resultat["numero"] == 15,
              "obtenu %r" % resultat)
        check("test_ecriture_nominale_chemin_confine",
              resultat is not None
              and resultat["chemin"] == "specs/features/todo/feature-015-ecriture-bout-en-bout.md")
        check("test_ecriture_nominale_substitutions_finales_incluent_id",
              resultat is not None and "id" in resultat["substitutions_finales"])
        chemin_ecrit = os.path.join(tmp, resultat["chemin"])
        check("test_ecriture_nominale_fichier_present", os.path.isfile(chemin_ecrit))
        with open(chemin_ecrit, encoding="utf-8") as f:
            check("test_ecriture_nominale_id_reconciliee",
                  "- **ID** : feature-015" in f.read())

        # --- collision : numéro déjà pris (TOCTOU) ---------------------------
        chemin_collision = os.path.join(
            tmp, "specs", "features", "todo", "feature-020-collision-toctou.md")
        with open(chemin_collision, "w", encoding="utf-8") as f:
            f.write("déjà présent")
        ancien = S.numeros_pris
        S.numeros_pris = lambda racine, colonnes: {"feature": {19}, "bug": set()}
        try:
            resultat_col, erreur_col = RS.ecrire_sous_verrou(
                config, "feature", "collision-toctou", "contenu", [],
                chemin_verrou=chemin_verrou)
        finally:
            S.numeros_pris = ancien
        check("test_collision_rend_409", erreur_col == (409, "un fichier porte déjà ce nom"),
              "obtenu %r" % (erreur_col,))
        with open(chemin_collision, encoding="utf-8") as f:
            check("test_collision_fichier_existant_intact", f.read() == "déjà présent")
        os.remove(chemin_collision)

        # --- répertoire cible absent -> 500, jamais de création --------------
        shutil.rmtree(os.path.join(tmp, "specs", "features", "todo"))
        resultat_abs, erreur_abs = RS.ecrire_sous_verrou(
            config, "feature", "peu-importe", "contenu", [], chemin_verrou=chemin_verrou)
        check("test_repertoire_absent_rend_500", erreur_abs == (500, "répertoire cible absent"))
        check("test_repertoire_absent_n_est_pas_recree",
              not os.path.isdir(os.path.join(tmp, "specs", "features", "todo")))

        # --- confinement (GATE P1, condition 2) : `todo` SYMLINKÉ hors du
        # dépôt jetable -> 500, RIEN écrit à l'extérieur. Reboucle revue :
        # cette garde (`if relatif is None or relatif != attendu:`) n'était
        # vérifiée par AUCUN test — seulement à la main par l'auditeur
        # (GATE P2). Un `todo/` symlinké fait résoudre `chemin_absolu` HORS
        # de `racine_projet` une fois passé par `os.path.realpath` dans
        # `vcs.chemin_sur()`, donc `relatif` vaut `None` : la garde doit
        # refuser AVANT tout `os.open`. Neutraliser cette garde (`if False:`)
        # laisserait `os.open` suivre le lien et écrire réellement hors du
        # dépôt — c'est exactement ce que ce test doit détecter.
        externe = tempfile.mkdtemp(prefix="cc-hors-depot-")
        try:
            os.symlink(externe, os.path.join(tmp, "specs", "features", "todo"))
            resultat_symlink, erreur_symlink = RS.ecrire_sous_verrou(
                config, "feature", "confinement-symlink", "contenu", [],
                chemin_verrou=chemin_verrou)
            check("test_confinement_todo_symlinke_hors_depot_rend_500",
                  erreur_symlink == (500, "chemin de destination non conforme"),
                  "obtenu %r" % (erreur_symlink,))
            check("test_confinement_todo_symlinke_rien_ecrit_a_l_exterieur",
                  os.listdir(externe) == [],
                  "un fichier a été créé HORS du dépôt jetable : %r"
                  % os.listdir(externe))
        finally:
            os.remove(os.path.join(tmp, "specs", "features", "todo"))
            shutil.rmtree(externe, ignore_errors=True)
        os.makedirs(os.path.join(tmp, "specs", "features", "todo"), exist_ok=True)

        # --- slug invalide direct (ceinture par-dessus les bretelles) --------
        os.makedirs(os.path.join(tmp, "specs", "features", "todo"), exist_ok=True)
        resultat_slug, erreur_slug = RS.ecrire_sous_verrou(
            config, "feature", "", "contenu", [], chemin_verrou=chemin_verrou)
        check("test_slug_vide_rejete_a_l_ecriture", erreur_slug == (422, "slug invalide"))

        # --- validation d'entrée : {type, titre, texte} ----------------------
        check("test_valider_type_invalide",
              RS.valider_entrees("refactor", "t", "t")
              == (422, "type invalide : « feature » ou « bug » attendu"))
        check("test_valider_titre_vide", RS.valider_entrees("feature", "", "t")[0] == 422)
        check("test_valider_titre_espaces_seuls", RS.valider_entrees("feature", "   ", "t")[0] == 422)
        check("test_valider_texte_vide", RS.valider_entrees("feature", "t", "")[0] == 422)
        check("test_valider_titre_trop_long", RS.valider_entrees("feature", "a" * 201, "t")[0] == 422)
        check("test_valider_texte_trop_long",
              RS.valider_entrees("feature", "t", "a" * 20_001)[0] == 422)
        check("test_valider_entrees_nominal_accepte",
              RS.valider_entrees("feature", "titre", "texte") is None)

        # --- preparer_brouillon : genre CLIENT, richesse INDÉPENDANTE --------
        res_b, err_b = RS.preparer_brouillon(
            config, "feature", "Ajouter un export CSV", "Détails ici.", False)
        check("test_preparer_brouillon_nominal_reussit", err_b is None)
        check("test_preparer_brouillon_genre_repris_du_client",
              res_b is not None and res_b["genre"] == "feature")
        check("test_preparer_brouillon_slug_derive_du_titre",
              res_b is not None and res_b["slug"] == "ajouter-un-export-csv",
              "obtenu %r" % (res_b and res_b["slug"]))

        res_bug, err_bug = RS.preparer_brouillon(
            config, "bug", "Un bug simple ici", "texte", True)
        check("test_preparer_brouillon_bug_derogation_honoree_template_minimal",
              err_bug is None and "## Symptôme observé" in res_bug["contenu"])

        # Un « bug » qui mentionne un mot-clé sensible reste GENRE bug (le
        # champ vient du client, jamais réécrit) mais reçoit le template
        # COMPLET : genre et richesse sont deux décisions INDÉPENDANTES.
        res_annule, err_annule = RS.preparer_brouillon(
            config, "bug", "Revoir les permissions d'accès", "texte", True)
        check("test_preparer_brouillon_richesse_annulee_par_mot_cle_genre_inchange",
              err_annule is None and res_annule["genre"] == "bug"
              and "## Symptôme observé" not in res_annule["contenu"],
              "un mot-clé sensible doit annuler la richesse minimale, jamais le genre")

        res_vide, err_vide = RS.preparer_brouillon(config, "feature", "titre", "", False)
        check("test_preparer_brouillon_texte_vide_422", err_vide == (422, "texte manquant ou vide"))

        # --- garde `slug_valide` de `preparer_brouillon` (ligne 377) : AUCUN
        # test ne l'atteignait avant ce lot — trouvé en auditant les gardes
        # une par une après la reboucle sur le confinement (revue). Un titre
        # ne contenant AUCUN caractère exploitable (ponctuation seule) normalise
        # en slug vide : la garde doit refuser, jamais écrire un
        # `nom_fichier_prevu` avec un slug vide.
        res_titre_vide, err_titre_vide = RS.preparer_brouillon(
            config, "feature", "...", "texte quelconque", False)
        check("test_preparer_brouillon_titre_sans_caractere_exploitable_422",
              err_titre_vide == (422, "titre invalide : aucun caractère "
                                  "exploitable après normalisation"),
              "obtenu %r" % (err_titre_vide,))

        # --- ecrire_spec : écrit `contenu` VERBATIM (reboucle étape 5a) -----
        res_e, err_e = RS.ecrire_spec(
            config, "feature", "Écriture spec bout en bout",
            "## Métadonnées\n- **ID** : feature-NNN\n\nUn contenu quelconque.",
            chemin_verrou=chemin_verrou)
        check("test_ecrire_spec_nominal_reussit", err_e is None, "erreur : %r" % (err_e,))
        check("test_ecrire_spec_rend_id_chemin_numero",
              res_e is not None and set(res_e) >= {"id", "chemin", "numero", "substitutions_finales"})

        # --- LE défaut de la reboucle 5a : une correction humaine dans le
        # brouillon relu doit survivre à l'écriture, verbatim -------------
        res_brouillon, _ = RS.preparer_brouillon(
            config, "feature", "Besoin avec relecture humaine",
            "Un besoin quelconque à préciser.", False)
        contenu_corrige = res_brouillon["contenu"].replace(
            "[remplir : X.Y.Z] ou `N/A` si référence", "CORRECTION HUMAINE", 1)
        check("test_setup_correction_bien_presente_dans_le_brouillon_corrige",
              "CORRECTION HUMAINE" in contenu_corrige)
        res_ecrit, err_ecrit = RS.ecrire_spec(
            config, "feature", "Besoin avec relecture humaine", contenu_corrige,
            chemin_verrou=chemin_verrou)
        check("test_ecrire_spec_reussit_avec_correction_humaine", err_ecrit is None)
        with open(os.path.join(tmp, res_ecrit["chemin"]), encoding="utf-8") as f:
            contenu_fichier = f.read()
        check("test_ecrire_spec_correction_humaine_survit_verbatim_a_l_ecriture",
              "CORRECTION HUMAINE" in contenu_fichier,
              "la correction relue par l'humain a été jetée à l'écriture")
        # --- garde ÉPINGLÉE (pas seulement une sous-chaîne, PIEGES.md §27 et
        # la leçon de mutation de ce lot) : un `ecrire_spec` qui RÉGÉNÉRERAIT
        # `contenu_corrige` en le réinjectant comme `texte` dans un template
        # FRAIS laisserait "CORRECTION HUMAINE" présent (imbriqué dans la
        # nouvelle section « Description »), donc la sous-chaîne ci-dessus ne
        # le détecterait jamais — mesuré : ce mutant survit au test
        # précédent. Seule une égalité OCTET POUR OCTET avec le contenu
        # RELU (ID réconcilié, rien d'autre) prouve le verbatim.
        attendu_verbatim, _ = RS.appliquer_numero(
            contenu_corrige, "feature", res_ecrit["numero"])
        check("test_ecrire_spec_correction_humaine_fichier_egal_octet_pour_octet",
              contenu_fichier == attendu_verbatim,
              "le fichier écrit diverge du contenu relu (ID réconcilié) : "
              "une régénération imbriquée resterait invisible à un simple "
              "test de sous-chaîne")

        # --- contenu absent / vide / trop volumineux : 422 EXPLICITE, jamais
        # un repli silencieux sur une régénération --------------------------
        _, err_contenu_absent = RS.ecrire_spec(
            config, "feature", "x", None, chemin_verrou=chemin_verrou)
        check("test_ecrire_spec_contenu_absent_422", err_contenu_absent[0] == 422)
        _, err_contenu_vide = RS.ecrire_spec(
            config, "feature", "x", "   ", chemin_verrou=chemin_verrou)
        check("test_ecrire_spec_contenu_vide_422", err_contenu_vide[0] == 422)
        _, err_contenu_enorme = RS.ecrire_spec(
            config, "feature", "x", "a" * 70_000, chemin_verrou=chemin_verrou)
        check("test_ecrire_spec_contenu_trop_volumineux_422", err_contenu_enorme[0] == 422)

        _, err_genre_invalide = RS.ecrire_spec(
            config, "refactor", "x", "y", chemin_verrou=chemin_verrou)
        check("test_ecrire_spec_genre_invalide_422", err_genre_invalide[0] == 422)

        # --- garde `slug_valide` de `ecrire_spec` (ligne 554) : AUCUN test ne
        # l'atteignait avant ce lot (même famille de trou que la garde de
        # confinement reboucle revue) — un titre sans caractère exploitable
        # doit être refusé AVANT toute écriture, jamais un fichier au slug vide.
        res_titre_vide_e, err_titre_vide_e = RS.ecrire_spec(
            config, "feature", "...", "contenu quelconque", chemin_verrou=chemin_verrou)
        check("test_ecrire_spec_titre_sans_caractere_exploitable_422",
              err_titre_vide_e == (422, "titre invalide : aucun caractère "
                                    "exploitable après normalisation"),
              "obtenu %r" % (err_titre_vide_e,))
        check("test_ecrire_spec_titre_sans_caractere_exploitable_rien_ecrit",
              res_titre_vide_e is None)

        # --- GATE P2, condition 1 : substitut isolé — encoder AVANT d'ouvrir,
        # écriture tout-ou-rien, numéro JAMAIS consommé sans spec -----------
        pris_avant_surrogate = S.numeros_pris(
            os.path.join(tmp, "specs", "features"), config.colonnes())
        numero_attendu = S.prochain_numero(pris_avant_surrogate, "feature")
        avant_todo = set(os.listdir(os.path.join(tmp, "specs", "features", "todo")))
        res_surrogate, err_surrogate = RS.ecrire_spec(
            config, "feature", "Titre normal pour substitut isolé", "\ud800",
            chemin_verrou=chemin_verrou)
        check("test_surrogate_rend_422_jamais_500", err_surrogate is not None
              and err_surrogate[0] == 422, "obtenu %r" % (err_surrogate,))
        apres_todo = set(os.listdir(os.path.join(tmp, "specs", "features", "todo")))
        check("test_surrogate_aucun_fichier_cree", avant_todo == apres_todo,
              "un fichier vide a été laissé sur disque : %r" % (apres_todo - avant_todo))
        pris_apres_surrogate = S.numeros_pris(
            os.path.join(tmp, "specs", "features"), config.colonnes())
        check("test_surrogate_numero_non_consomme",
              S.prochain_numero(pris_apres_surrogate, "feature") == numero_attendu,
              "le numéro %d a été brûlé sans qu'aucune spec n'existe" % numero_attendu)
        # Preuve positive : l'écriture SUIVANTE obtient bien CE numéro.
        res_apres_surrogate, err_apres_surrogate = RS.ecrire_spec(
            config, "feature", "Écriture normale après échec d'encodage",
            "contenu normal", chemin_verrou=chemin_verrou)
        check("test_surrogate_numero_reellement_reattribue",
              err_apres_surrogate is None
              and res_apres_surrogate["numero"] == numero_attendu,
              "obtenu %r (attendu numero=%d)" % (res_apres_surrogate, numero_attendu))

        # Titre HOSTILE (remontée de répertoire) : le slug qui en dérive est
        # re-normalisé, jamais un champ distinct hérité de confiance — SEUL
        # le titre gouverne le chemin, jamais le contenu.
        res_hostile, err_hostile = RS.ecrire_spec(
            config, "feature", "../../../etc/passwd", "contenu quelconque",
            chemin_verrou=chemin_verrou)
        check("test_ecrire_spec_titre_hostile_slug_renormalise_reussit", err_hostile is None)
        check("test_ecrire_spec_titre_hostile_chemin_sans_remontee",
              res_hostile is not None and ".." not in res_hostile["chemin"]
              and "/etc/" not in res_hostile["chemin"],
              "obtenu %r" % (res_hostile and res_hostile["chemin"]))

        # --- contenu HOSTILE (remontée de répertoire dans le CORPS du texte,
        # pas dans le titre) : le chemin ne doit JAMAIS en dépendre ----------
        res_contenu_hostile, err_contenu_hostile = RS.ecrire_spec(
            config, "feature", "Besoin anodin pour contenu hostile",
            "Corps du texte : ../../../etc/passwd et /etc/shadow",
            chemin_verrou=chemin_verrou)
        check("test_ecrire_spec_contenu_hostile_reussit", err_contenu_hostile is None)
        check("test_ecrire_spec_contenu_hostile_chemin_confine_a_todo",
              res_contenu_hostile is not None
              and res_contenu_hostile["chemin"].startswith("specs/features/todo/")
              and ".." not in res_contenu_hostile["chemin"],
              "obtenu %r" % (res_contenu_hostile and res_contenu_hostile["chemin"]))
        with open(os.path.join(tmp, res_contenu_hostile["chemin"]), encoding="utf-8") as f:
            check("test_ecrire_spec_contenu_hostile_ecrit_verbatim",
                  "/etc/passwd" in f.read(),
                  "le contenu (texte libre, pas un chemin) doit être écrit tel quel")

        # --- concurrence réelle : deux écritures simultanées, un seul numéro ---
        # Threads réellement concurrents (pas un test séquentiel qui ne
        # prouverait rien sur le flock — même leçon que `verrou.py`).
        resultats = []
        erreurs = []
        verrou_liste = threading.Lock()
        barriere = threading.Barrier(2)

        def _ecrire_concurrent(suffixe):
            barriere.wait()
            c, subs, s = RS.fabriquer("feature", "Concurrence %s" % suffixe,
                                       "texte", chemin_complet)
            r, e = RS.ecrire_sous_verrou(config, "feature", s, c, subs,
                                         chemin_verrou=chemin_verrou)
            with verrou_liste:
                resultats.append(r)
                erreurs.append(e)

        fils = [threading.Thread(target=_ecrire_concurrent, args=(str(i),)) for i in range(2)]
        for f in fils:
            f.start()
        for f in fils:
            f.join()
        check("test_concurrence_deux_ecritures_reussissent",
              all(e is None for e in erreurs), "erreurs : %r" % erreurs)
        numeros = sorted(r["numero"] for r in resultats if r)
        check("test_concurrence_numeros_distincts",
              len(numeros) == len(set(numeros)) == 2,
              "numéros obtenus : %r" % numeros)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for echec in _echecs:
        print("  - %s" % echec)
    return 1 if _echecs else 0


if __name__ == "__main__":
    try:
        _code = main()
    except Exception as erreur:
        print("\n%d cas atteints, INTERROMPU par %s : %s" % (_tests, type(erreur).__name__, erreur))
        _code = 1
    sys.exit(_code)


# --- table de validation par mutation (CLAUDE.md, étape 6) -------------------
#
# | Mutation                                                     | Test tueur                                    |
# |---------------------------------------------------------------|-----------------------------------------------|
# | `normaliser_slug` ne translittère pas les accents              | test_slug_translitere_les_accents              |
# | `normaliser_slug` ne collapse pas les séparateurs en un tiret  | test_slug_remontee_de_repertoire               |
# | `normaliser_slug` ne borne pas à 60                            | test_slug_borne_a_60                           |
# | `choisir_richesse` accorde la dérogation malgré un mot-clé     | test_richesse_derogation_annulee_par_mot_cle_* |
# | `preparer_brouillon` fait dépendre la richesse du genre         | test_preparer_brouillon_richesse_annulee_par_mot_cle_genre_inchange |
# | `ecrire_spec` fait confiance au titre sans le refabriquer       | test_ecrire_spec_titre_hostile_chemin_sans_remontee |
# | `ecrire_spec` régénère `contenu` au lieu de l'écrire verbatim  | test_ecrire_spec_correction_humaine_survit_verbatim_a_l_ecriture |
# | `valider_ecriture` accepte un `contenu` absent en silence      | test_ecrire_spec_contenu_absent_422            |
# | `ecrire_spec` dérive le chemin depuis `contenu`                | test_ecrire_spec_contenu_hostile_chemin_confine_a_todo |
# | `_poser_titre` n'insère pas avant `## Métadonnées`             | test_description_hors_fenetre_lignes_entete_60 |
# | `numeros_pris` fusionne les deux séries                        | test_numeros_pris_deux_series_independantes    |
# | `prochain_numero` rend le premier trou libre au lieu de max+1  | test_prochain_numero_max_plus_un               |
# | `ecrire_sous_verrou` écrit hors du flock (retire O_EXCL)       | test_collision_rend_409                        |
# | `ecrire_sous_verrou` recrée le répertoire cible absent         | test_repertoire_absent_n_est_pas_recree        |
# | `appliquer_numero` invente un champ ID pour `modele.md`        | test_appliquer_numero_absent_pour_modele_minimal |
# | `appliquer_numero` cherche l'ID hors du bloc `## Métadonnées`  | test_appliquer_numero_ignore_id_forge_avant_metadonnees |
# | `_plage_section` rend une plage pour une entête absente        | test_appliquer_numero_sans_section_metadonnees_ne_leve_pas |
