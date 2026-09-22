#!/usr/bin/env python3
"""Tests unitaires de `gestion_spec.py` — résolution confinée, éligibilité
par colonne, conformité du nom (feature-025, GATE P1 S1.2-S1.4).

    python3 control-center/backend/test_gestion_spec.py

Les scénarios de bout en bout (HTTP, compare-and-write concurrent,
suppression + retour arrière EXÉCUTÉ, git non suivi/modifié) vivent dans
`test_server_feature025.py` — ce fichier-ci couvre ce que l'HTTP n'exerce pas
directement : la DOUBLE garde de confinement de `resoudre_spec()` (mutée
séparément de `vcs.chemin_sur()` qu'elle appelle — `PIEGES §37`), et
`role_colonne()` sur des configurations à un nombre de colonnes variable.
"""

import os
import shutil
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C  # noqa: E402
import gestion_spec as GS  # noqa: E402
import vcs as V  # noqa: E402

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


def _depot_jetable(colonnes=("todo", "doing", "done")):
    tmp = tempfile.mkdtemp(prefix="cc-test-gestion-spec-")
    for colonne in colonnes:
        os.makedirs(os.path.join(tmp, "specs", "features", colonne), exist_ok=True)
    config = C.charger(chemin=os.path.join(tmp, "n-existe-pas.toml"), racine_projet=tmp)
    return tmp, config


def _ecrire(config, colonne, spec_id, contenu="# x\n"):
    chemin = os.path.join(config["_racine_projet"], "specs", "features", colonne,
                          spec_id + ".md")
    with open(chemin, "w", encoding="utf-8") as fichier:
        fichier.write(contenu)
    return chemin


def main():
    # --- empreinte : stable, sensible au moindre octet ----------------------
    check("test_empreinte_stable", GS.empreinte("abc") == GS.empreinte("abc"))
    check("test_empreinte_sensible_a_un_octet", GS.empreinte("abc") != GS.empreinte("abd"))
    check("test_empreinte_est_hex_sha256", len(GS.empreinte("")) == 64)

    # --- spec_id_conforme : `_RE_NUMERO` appliqué au nom complet -------------
    check("test_conforme_feature", GS.spec_id_conforme("feature-025-actions-du-backlog"))
    check("test_conforme_bug", GS.spec_id_conforme("bug-007-un-motif"))
    check("test_non_conforme_sans_numero", not GS.spec_id_conforme("notes"))
    check("test_non_conforme_template", not GS.spec_id_conforme("_template"))
    check("test_non_conforme_readme", not GS.spec_id_conforme("README"))
    check("test_non_conforme_vide", not GS.spec_id_conforme(""))

    # --- resoudre_spec : égalité stricte, confinement double -----------------
    tmp, config = _depot_jetable()
    try:
        _ecrire(config, "todo", "feature-001-alpha")
        _ecrire(config, "doing", "feature-002-beta")

        spec, relatif = GS.resoudre_spec(config, "feature-001-alpha")
        check("test_resoudre_trouve_la_spec", spec is not None and spec["id"] == "feature-001-alpha")
        check("test_resoudre_chemin_relatif_attendu",
              relatif == "specs/features/todo/feature-001-alpha.md", "obtenu %r" % relatif)

        spec2, _ = GS.resoudre_spec(config, "feature-002-beta")
        check("test_resoudre_colonne_doing", spec2["colonne"] == "doing")

        for force in ("../../etc/passwd", "feature-999-inexistante", "", None, 42):
            spec_none, relatif_none = GS.resoudre_spec(config, force)
            check("test_resoudre_refuse[%r]" % (force,),
                  spec_none is None and relatif_none is None)

        # --- MUTATION du CONFINEMENT (PIEGES §37 : muter la garde elle-même,
        # pas `vcs.chemin_sur()` qu'elle appelle) : si `resoudre_spec()`
        # faisait confiance à `chemin_sur()` SEUL (sans l'égalité exacte
        # `relatif != attendu`), un `chemin_sur()` qui rendrait un chemin
        # RÉSOLU MAIS DIFFÉRENT de celui attendu passerait à tort.
        original = V.chemin_sur
        try:
            V.chemin_sur = lambda racine, chemin: "specs/features/todo/AUTRE-FICHIER.md"
            spec_mute, relatif_mute = GS.resoudre_spec(config, "feature-001-alpha")
            check("test_confinement_deuxieme_garde_tue_le_mutant",
                  spec_mute is None and relatif_mute is None,
                  "la garde par égalité exacte doit refuser un chemin RÉSOLU mais DIFFÉRENT")
        finally:
            V.chemin_sur = original

        # --- MUTATION : `chemin_sur()` renvoie `None` (lien hors dépôt, etc.)
        try:
            V.chemin_sur = lambda racine, chemin: None
            spec_none2, relatif_none2 = GS.resoudre_spec(config, "feature-001-alpha")
            check("test_confinement_chemin_sur_none_refuse",
                  spec_none2 is None and relatif_none2 is None)
        finally:
            V.chemin_sur = original
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    # --- resoudre_spec : lien symbolique RÉEL planté dans todo/ (GATE P2,
    # lot 9, condition 3) --------------------------------------------------
    #
    # Les MUTATIONS ci-dessus (lambda sur `V.chemin_sur`) ne prouvent que la
    # forme du code, jamais le cas RÉEL : un `spec_id` FORGÉ (`"../../etc/
    # passwd"`) n'atteint JAMAIS la branche `relatif != attendu`, puisque
    # `resoudre_spec()` ne construit un chemin qu'à partir d'un `spec_id`
    # RÉELLEMENT découvert par `S.lister_depuis_config()` — et `listdir()`
    # ne connaît que ce qui existe sur disque. Le cas réel où la SECONDE
    # garde (l'égalité exacte, pas `chemin_sur()` seul) fait la différence
    # est un LIEN SYMBOLIQUE planté dans `todo/` : `os.listdir()` le voit
    # comme une spec (feature-025), et `chemin_sur()` (qui résout les liens
    # via `os.path.realpath`) le suit jusqu'à sa cible — DANS le dépôt, mais
    # PAS là où `resoudre_spec()` l'attend. Sans l'égalité exacte,
    # `modifier()` ferait un `os.replace()` sur ce fichier-là : n'importe
    # quel fichier du dépôt qu'un lien planté dans `todo/` viserait.
    tmp7, config7 = _depot_jetable()
    try:
        dossier_todo = os.path.join(tmp7, "specs", "features", "todo")
        dossier_doing = os.path.join(tmp7, "specs", "features", "doing")

        # Cas 1 : lien vers un fichier RÉEL mais HORS de `specs/` (à la
        # racine du projet) — `chemin_sur()` le résout DANS le dépôt (donc ne
        # rend pas `None`) : SEULE l'égalité exacte l'écarte.
        cible_racine = os.path.join(tmp7, "CIBLE.md")
        with open(cible_racine, "w", encoding="utf-8") as f:
            f.write("# cible hors de specs/\n")
        os.symlink(cible_racine, os.path.join(dossier_todo, "feature-900-lien-racine.md"))

        # Cas 2 : lien RELATIF vers une AUTRE colonne (`doing/`) — même
        # raison : résolu DANS le dépôt, mais pas à l'emplacement attendu.
        cible_doing = os.path.join(dossier_doing, "feature-901-cible-doing.md")
        with open(cible_doing, "w", encoding="utf-8") as f:
            f.write("# cible dans doing/\n")
        os.symlink(os.path.join("..", "doing", "feature-901-cible-doing.md"),
                  os.path.join(dossier_todo, "feature-902-lien-doing.md"))

        # Cas 3 : lien vers un fichier HORS du dépôt entier — `chemin_sur()`
        # rend déjà `None` ici (PREMIÈRE garde). Gardé pour couvrir les
        # trois formes citées par le GATE, et pour documenter que ce cas-là,
        # lui, était DÉJÀ protégé même par la lecture SEULE de `chemin_sur()`.
        os.symlink("/etc/hostname",
                  os.path.join(dossier_todo, "feature-903-lien-hors-depot.md"))

        cas = [
            ("feature-900-lien-racine", cible_racine),
            ("feature-902-lien-doing", cible_doing),
            ("feature-903-lien-hors-depot", "/etc/hostname"),
        ]
        for spec_id, cible in cas:
            avant = open(cible, encoding="utf-8").read()
            spec, relatif = GS.resoudre_spec(config7, spec_id)
            check("test_resoudre_lien_symbolique_reel_refuse[%s]" % spec_id,
                  spec is None and relatif is None,
                  "obtenu spec=%r relatif=%r" % (spec, relatif))
            apres = open(cible, encoding="utf-8").read()
            check("test_resoudre_lien_symbolique_cible_intacte[%s]" % spec_id,
                  avant == apres)

        # Preuve que le mutant `if relatif is None:` SEUL (sans
        # `or relatif != attendu`) laisserait RÉELLEMENT passer les cas 1 et
        # 2 — donc que c'est bien la DEUXIÈME moitié de la garde qui les
        # arrête, pas la première : `chemin_sur()`, appelé seul sur les
        # MÊMES chemins, ne rend PAS `None` pour ces deux cas (il est résolu
        # DANS le dépôt). Sans cette preuve, `test_resoudre_lien_symbolique_
        # reel_refuse` pourrait passer pour une tout autre raison.
        for spec_id, _cible in cas[:2]:  # cas 1 et 2 seulement (résolus DANS le dépôt)
            nom = spec_id + ".md"
            chemin_absolu = os.path.join(dossier_todo, nom)
            check("test_resoudre_lien_symbolique_chemin_sur_seul_ne_suffit_pas[%s]" % spec_id,
                  V.chemin_sur(tmp7, chemin_absolu) is not None,
                  "chemin_sur() rend déjà None ici : ce cas ne prouverait "
                  "rien sur l'égalité exacte, contrairement au cas 3")
    finally:
        shutil.rmtree(tmp7, ignore_errors=True)

    # --- role_colonne : par POSITION, jamais par nom (ADR-0003) --------------
    tmp2, config2 = _depot_jetable()
    try:
        check("test_role_premiere", GS.role_colonne(config2, "todo") == "premiere")
        check("test_role_intermediaire", GS.role_colonne(config2, "doing") == "intermediaire")
        check("test_role_derniere", GS.role_colonne(config2, "done") == "derniere")
        check("test_role_classe_inconnue_none", GS.role_colonne(config2, "nimporte") is None)
    finally:
        shutil.rmtree(tmp2, ignore_errors=True)

    # --- role_colonne sur une configuration à DEUX colonnes seulement --------
    tmp3 = tempfile.mkdtemp(prefix="cc-test-gestion-spec-2col-")
    try:
        for colonne in ("backlog", "archive"):
            os.makedirs(os.path.join(tmp3, "specs", "features", colonne), exist_ok=True)
        chemin_toml = os.path.join(tmp3, "control-center.toml")
        with open(chemin_toml, "w", encoding="utf-8") as fichier:
            fichier.write(
                '[specs]\n'
                'colonnes = [{repertoire = "backlog"}, {repertoire = "archive"}]\n')
        config3 = C.charger(chemin=chemin_toml, racine_projet=tmp3)
        check("test_role_deux_colonnes_premiere", GS.role_colonne(config3, "backlog") == "premiere")
        check("test_role_deux_colonnes_derniere_pas_intermediaire",
              GS.role_colonne(config3, "archive") == "derniere")
    finally:
        shutil.rmtree(tmp3, ignore_errors=True)

    # --- eligible_au_lancement : compose resoudre_spec + conformite + role --
    tmp4, config4 = _depot_jetable()
    try:
        _ecrire(config4, "todo", "feature-010-eligible")
        _ecrire(config4, "doing", "feature-011-en-cours")
        _ecrire(config4, "todo", "notes")  # existe, mais nom non conforme

        spec, erreur = GS.eligible_au_lancement(config4, "feature-010-eligible")
        check("test_eligible_nominal", erreur is None and spec is not None)

        _, erreur = GS.eligible_au_lancement(config4, "feature-999-absente")
        check("test_eligible_inconnue_404", erreur == (404, "spec inconnue"))

        _, erreur = GS.eligible_au_lancement(config4, "notes")
        check("test_eligible_non_conforme_422",
              erreur is not None and erreur[0] == 422, "obtenu %r" % (erreur,))

        _, erreur = GS.eligible_au_lancement(config4, "feature-011-en-cours")
        check("test_eligible_doing_409",
              erreur is not None and erreur[0] == 409, "obtenu %r" % (erreur,))
    finally:
        shutil.rmtree(tmp4, ignore_errors=True)

    # --- modifier() : bornes, immuabilité, en_cours, verrou isolé ------------
    tmp5, config5 = _depot_jetable()
    try:
        chemin = _ecrire(config5, "todo", "feature-020-modifiable", "contenu initial\n")
        chemin_verrou = os.path.join(tmp5, "var", "specs.lock")
        # Isolé du `var/sauvegardes-specs` RÉEL de ce module (jamais le
        # défaut `_CHEMIN_SAUVEGARDES`, qui vit à côté de `server.py`) —
        # sinon chaque exécution de cette suite écrirait dans le `var/` du
        # dépôt sous test, PIEGES.md §1 en filigrane.
        chemin_sauvegardes = os.path.join(tmp5, "var", "sauvegardes-specs")

        # spec inconnue -> 404
        _, erreur = GS.modifier(config5, "feature-999-x", "peu importe", "y",
                                chemin_verrou=chemin_verrou, chemin_sauvegardes=chemin_sauvegardes)
        check("test_modifier_inconnue_404", erreur == (404, "spec inconnue"))

        # empreinte fausse -> 409, fichier intact
        _, erreur = GS.modifier(config5, "feature-020-modifiable", "empreinte-fausse",
                                "nouveau", chemin_verrou=chemin_verrou,
                                chemin_sauvegardes=chemin_sauvegardes)
        check("test_modifier_empreinte_fausse_409",
              erreur is not None and erreur[0] == 409, "obtenu %r" % (erreur,))
        with open(chemin, encoding="utf-8") as fichier:
            check("test_modifier_empreinte_fausse_fichier_intact",
                  fichier.read() == "contenu initial\n")

        # nominal — AUCUN dépôt git ici : `verifier_supprimable()` rend donc
        # `(False, …)` (« non suivie »), et `modifier()` prend une
        # sauvegarde avant d'écraser (AUDIT feature-021, A2) — couvert en
        # détail plus bas ; ici on ne vérifie que le comportement HISTORIQUE
        # (écriture réussie, empreinte rendue).
        empreinte_actuelle = GS.empreinte("contenu initial\n")
        resultat, erreur = GS.modifier(config5, "feature-020-modifiable", empreinte_actuelle,
                                       "contenu final\n", chemin_verrou=chemin_verrou,
                                       chemin_sauvegardes=chemin_sauvegardes)
        check("test_modifier_nominal_ok", erreur is None, "obtenu %r" % (erreur,))
        with open(chemin, encoding="utf-8") as fichier:
            check("test_modifier_nominal_fichier_ecrit", fichier.read() == "contenu final\n")
        check("test_modifier_nominal_empreinte_rendue",
              resultat["empreinte"] == GS.empreinte("contenu final\n"))
        check("test_modifier_nominal_sauvegarde_hors_depot_git",
              bool(resultat.get("sauvegarde")), "obtenu %r" % (resultat,))

        # en_cours=True -> 409, quelle que soit l'empreinte
        _, erreur = GS.modifier(config5, "feature-020-modifiable",
                                GS.empreinte("contenu final\n"), "x",
                                en_cours=True, chemin_verrou=chemin_verrou,
                                chemin_sauvegardes=chemin_sauvegardes)
        check("test_modifier_en_cours_409", erreur == (409, "un lancement est en cours sur cette spec"))

        # colonne `done` immuable
        _ecrire(config5, "done", "feature-021-close", "clos\n")
        _, erreur = GS.modifier(config5, "feature-021-close", GS.empreinte("clos\n"), "x",
                                chemin_verrou=chemin_verrou, chemin_sauvegardes=chemin_sauvegardes)
        check("test_modifier_done_409", erreur is not None and erreur[0] == 409, "obtenu %r" % (erreur,))

        # contenu non encodable -> 422, fichier intact, AUCUNE sauvegarde
        # prise (refusé avant même d'atteindre la précondition git — la
        # sauvegarde ne doit jamais être créée pour une requête qui échoue
        # de toute façon).
        avant_listing = (set(os.listdir(chemin_sauvegardes))
                         if os.path.isdir(chemin_sauvegardes) else set())
        _, erreur = GS.modifier(config5, "feature-020-modifiable",
                                GS.empreinte("contenu final\n"), "\ud800",
                                chemin_verrou=chemin_verrou, chemin_sauvegardes=chemin_sauvegardes)
        check("test_modifier_non_encodable_422",
              erreur is not None and erreur[0] == 422, "obtenu %r" % (erreur,))
        with open(chemin, encoding="utf-8") as fichier:
            check("test_modifier_non_encodable_fichier_intact",
                  fichier.read() == "contenu final\n")
        apres_listing = (set(os.listdir(chemin_sauvegardes))
                         if os.path.isdir(chemin_sauvegardes) else set())
        check("test_modifier_non_encodable_aucune_sauvegarde_inutile",
              apres_listing == avant_listing)

        # --- dépôt git RÉEL, propre : plus de sauvegarde nécessaire ---------
        # `verifier_supprimable()` doit pouvoir rendre `(True, None)` : on
        # COMMIT l'état courant du fichier pour que disque == HEAD.
        subprocess.run(["git", "init", "-q", "-b", "main"], cwd=tmp5, check=True)
        subprocess.run(["git", "config", "user.email", "t@t"], cwd=tmp5, check=True)
        subprocess.run(["git", "config", "user.name", "Test"], cwd=tmp5, check=True)
        subprocess.run(["git", "add", "specs/features/todo/feature-020-modifiable.md"],
                       cwd=tmp5, check=True)
        subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=tmp5, check=True)

        # --- revue de code (feature-021, point mineur) : un `os.replace()` qui
        # échoue (disque plein, permissions...) est traduit en `(None, (500,
        # …))` — JAMAIS une `OSError` qui s'échappe de `modifier()`. Le
        # contrat annoncé (« Rend (resultat, None) ou (None, (code,
        # message)) ») doit tenir sur CE chemin aussi. Le dépôt vient
        # d'être commité PROPRE : `protege` vaut `True`, aucune sauvegarde
        # n'est tentée, donc c'est bien l'`os.replace()` DE LA SPEC — pas
        # celui de la sauvegarde — qui échoue ici.
        _replace_original = GS.os.replace

        def _replace_menteur(_src, _dst):
            raise OSError("disque plein (simulation de test)")

        GS.os.replace = _replace_menteur
        try:
            resultat, erreur = GS.modifier(
                config5, "feature-020-modifiable", GS.empreinte("contenu final\n"),
                "tentative pendant panne disque", chemin_verrou=chemin_verrou,
                chemin_sauvegardes=chemin_sauvegardes)
        finally:
            GS.os.replace = _replace_original
        check("test_modifier_os_replace_echoue_rend_500_sans_lever",
              resultat is None and erreur == (500, "écriture impossible"),
              "obtenu resultat=%r erreur=%r" % (resultat, erreur))
        with open(chemin, encoding="utf-8") as fichier:
            check("test_modifier_os_replace_echoue_fichier_intact",
                  fichier.read() == "contenu final\n")

        # --- AUDIT feature-021 (A2) : sauvegarde AVANT écrasement d'un
        # contenu non commité --------------------------------------------------
        # Le dépôt est PROPRE (commité ci-dessus). On introduit maintenant
        # une modification LOCALE, jamais commitée — exactement le cas
        # « ligne de journal de bord ajoutée en cours de cycle » cité par
        # l'AUDIT.
        with open(chemin, "a", encoding="utf-8") as fichier:
            fichier.write("ligne locale jamais commitee\n")
        contenu_avant_ecrasement = open(chemin, encoding="utf-8").read()
        empreinte_locale = GS.empreinte(contenu_avant_ecrasement)

        resultat, erreur = GS.modifier(
            config5, "feature-020-modifiable", empreinte_locale,
            "contenu remplace par le cockpit\n",
            chemin_verrou=chemin_verrou, chemin_sauvegardes=chemin_sauvegardes)
        check("test_modifier_A2_ecrasement_non_commite_200",
              erreur is None and resultat is not None, "obtenu erreur=%r" % (erreur,))
        check("test_modifier_A2_champ_sauvegarde_present",
              resultat is not None and bool(resultat.get("sauvegarde")),
              "obtenu %r" % (resultat,))
        with open(chemin, encoding="utf-8") as fichier:
            check("test_modifier_A2_fichier_reellement_ecrase",
                  fichier.read() == "contenu remplace par le cockpit\n")

        # La sauvegarde porte EXACTEMENT ce qui vient d'être remplacé — le
        # contenu local jamais commité, que git seul ne peut pas rendre.
        chemin_sauvegarde = os.path.join(chemin_sauvegardes, resultat["sauvegarde"])
        check("test_modifier_A2_sauvegarde_existe", os.path.isfile(chemin_sauvegarde))
        with open(chemin_sauvegarde, encoding="utf-8") as fichier:
            check("test_modifier_A2_sauvegarde_contenu_exact",
                  fichier.read() == contenu_avant_ecrasement)

        # Preuve que git, LUI, ne peut PAS rendre ce contenu — c'est le fait
        # mesuré par l'AUDIT, pas une supposition : seul `HEAD` est
        # atteignable par `git checkout`, et `HEAD` ne porte jamais la
        # ligne locale.
        tete = subprocess.run(
            ["git", "-C", tmp5, "show",
             "HEAD:specs/features/todo/feature-020-modifiable.md"],
            capture_output=True, text=True, check=False)
        check("test_modifier_A2_git_head_ignore_la_ligne_locale",
              "ligne locale jamais commitee" not in (tete.stdout or ""))

        # --- MUTATION (PIEGES §37 : neutraliser la garde ELLE-MÊME) --------
        # Si la précondition de `modifier()` est retirée (ici : la fonction
        # qu'elle appelle rend toujours « propre »), le contenu local
        # jamais commité doit être DÉTRUIT SANS AUCUNE sauvegarde — c'est
        # exactement le symptôme mesuré par l'AUDIT (A2) avant correctif.
        with open(chemin, "a", encoding="utf-8") as fichier:
            fichier.write("deuxieme ligne locale jamais commitee\n")
        contenu_avant_mutation = open(chemin, encoding="utf-8").read()
        empreinte_mutation = GS.empreinte(contenu_avant_mutation)

        avant_fichiers = set(os.listdir(chemin_sauvegardes))
        _verifier_original = V.verifier_supprimable
        V.verifier_supprimable = lambda racine, relatif: (True, None)  # garde neutralisée
        try:
            resultat_m, erreur_m = GS.modifier(
                config5, "feature-020-modifiable", empreinte_mutation,
                "ecrasement sans filet (garde neutralisee)\n",
                chemin_verrou=chemin_verrou, chemin_sauvegardes=chemin_sauvegardes)
        finally:
            V.verifier_supprimable = _verifier_original
        check("test_modifier_MUTATION_garde_neutralisee_ecrit_quand_meme",
              erreur_m is None and resultat_m is not None, "obtenu erreur=%r" % (erreur_m,))
        apres_fichiers = set(os.listdir(chemin_sauvegardes))
        check("test_modifier_MUTATION_aucune_sauvegarde_sans_la_garde",
              apres_fichiers == avant_fichiers,
              "une sauvegarde a été prise malgré la garde neutralisée : %r" %
              (apres_fichiers - avant_fichiers))
        with open(chemin, encoding="utf-8") as fichier:
            check("test_modifier_MUTATION_contenu_local_perdu_sans_filet",
                  "deuxieme ligne locale jamais commitee" not in fichier.read())
    finally:
        shutil.rmtree(tmp5, ignore_errors=True)

    # --- supprimer() : confirmation AVANT tout effet, MUTATION ciblée -------
    tmp6, config6 = _depot_jetable()
    try:
        chemin = _ecrire(config6, "todo", "feature-030-jamais-suivie")
        chemin_verrou = os.path.join(tmp6, "var", "specs.lock")

        _, erreur = GS.supprimer(config6, "feature-030-jamais-suivie", "AUTRE-NOM",
                                 chemin_verrou=chemin_verrou)
        check("test_supprimer_confirmation_discordante_422",
              erreur is not None and erreur[0] == 422, "obtenu %r" % (erreur,))
        check("test_supprimer_confirmation_discordante_fichier_intact", os.path.isfile(chemin))

        # ⚠️ MUTATION (`PIEGES §37`) : neutraliser la garde ELLE-MÊME (pas
        # une fonction qu'elle appelle) — reproduit ici en désactivant la
        # comparaison directement dans le code source, un test qui la
        # laisserait passer prouverait que la garde ne tient à rien.
        # Preuve documentée dans le rapport de cycle (mutation exécutée,
        # revertée) ; ce cas ci-dessus est celui qui doit MOURIR sous cette
        # mutation — c'est la même assertion, cause et effet inversés.

        # Non suivie par git : PAS de dépôt git ici du tout -> 409 (la garde
        # `vcs.verifier_supprimable` échoue dès `ls-files`, hors dépôt).
        _, erreur = GS.supprimer(config6, "feature-030-jamais-suivie",
                                 "feature-030-jamais-suivie", chemin_verrou=chemin_verrou)
        check("test_supprimer_hors_depot_git_409",
              erreur is not None and erreur[0] == 409, "obtenu %r" % (erreur,))
        check("test_supprimer_hors_depot_git_fichier_intact", os.path.isfile(chemin))
    finally:
        shutil.rmtree(tmp6, ignore_errors=True)

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for echec in _echecs:
        print("  - %s" % echec)
    return 1 if _echecs else 0


if __name__ == "__main__":
    try:
        _code = main()
    except Exception as erreur:
        import traceback
        traceback.print_exc()
        print("\n%d cas atteints, INTERROMPU par %s : %s"
              % (_tests, type(erreur).__name__, erreur))
        _code = 1
    sys.exit(_code)
