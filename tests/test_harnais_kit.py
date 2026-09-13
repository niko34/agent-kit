"""Tests du harnais lui-même (feature-006, lot 1) — pas du script `update_kit.sh`.

Quatre familles de cas :
- H2 : auto-contrôle de chaque primitive de mise en scène non encore
  consommée par un cas de `test_update_kit.py` — sa post-condition git
  observable. Le harnais ne connaît AUCUNE garde du script testé : ces
  primitives se contentent de mettre en scène, jamais de vérifier.
- H3 : le harnais exécute toujours `REPO_ROOT/tools/update_kit.sh`, jamais
  une copie présente dans le faux projet.
- H4 : après un sous-process confiné (y compris sous `GIT_DIR` pointé sur le
  dépôt réel), l'empreinte du dépôt réel est strictement inchangée — sur un
  chemin en lecture seule (refus) ET sur un chemin qui écrit réellement.
- `affirmer_seule_garde` refuse une clé de garde inconnue.
"""

from __future__ import annotations

import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from harnais_kit import (
    DEBUT_RECAPITULATIF,
    MARQUEURS_DE_GARDE,
    REPO_ROOT,
    SCRIPT,
    TIMEOUT_SECONDES,
    VARIABLES_GIT_A_NEUTRALISER,
    _git,
    affirmer_seule_garde,
    empreinte_depot,
    fabriquer_kit_et_projet,
)

# Anti-récursion pour H4 : sans cette sentinelle, le sous-process lancé par
# le cas de confinement pourrait relancer le même cas, qui relancerait un
# sous-process, etc. — fork infini sur le poste et sur les deux runners de
# CI. Posée dans l'environnement du fils, elle fait sauter (`skipTest`)
# n'importe quel cas de confinement qui la verrait.
SENTINELLE_SOUS_TEST = "HARNAIS_KIT_SOUS_TEST"

# Les sous-process H4 lancent un interpréteur Python complet qui fabrique à
# son tour des dépôts jetables : plus large que TIMEOUT_SECONDES du harnais,
# mais toujours borné — un script qui pend ne doit jamais pendre la suite.
TIMEOUT_SOUS_PROCESSUS = 60


class PrimitivesHarnaisTest(unittest.TestCase):
    """H2 : auto-contrôle des quatre primitives non consommées par ce lot
    (`salir_arbre` est déjà exercée par G1/G2 de `test_update_kit.py`)."""

    def setUp(self) -> None:
        self.contexte = fabriquer_kit_et_projet()
        self.addCleanup(self.contexte.fermer)

    def test_ecrire_kit_paths_pose_le_fichier_a_la_racine_du_projet(self) -> None:
        self.contexte.ecrire_kit_paths(
            ["tools/update_kit.sh", "# commentaire ignoré", "GUIDE.md"]
        )

        fichier = self.contexte.projet / ".kit-paths"
        self.assertTrue(fichier.exists())
        contenu = fichier.read_text(encoding="utf-8")
        self.assertIn("tools/update_kit.sh\n", contenu)
        self.assertIn("GUIDE.md\n", contenu)

    def test_installer_github_cree_le_dossier_et_le_faux_script_sync(self) -> None:
        self.contexte.installer_github(avec_sync=True)

        self.assertTrue((self.contexte.projet / ".github").is_dir())
        self.assertTrue(
            (self.contexte.projet / "tools" / "sync_copilot_agents.py").exists()
        )

    def test_installer_github_sans_sync_omet_le_faux_script(self) -> None:
        self.contexte.installer_github(avec_sync=False)

        self.assertTrue((self.contexte.projet / ".github").is_dir())
        self.assertFalse(
            (self.contexte.projet / "tools" / "sync_copilot_agents.py").exists()
        )

    def test_rendre_non_inscriptible_retire_les_bits_d_ecriture(self) -> None:
        self.contexte.committer_dans_projet("proteger.txt", "contenu\n")

        self.contexte.rendre_non_inscriptible("proteger.txt")

        mode = (self.contexte.projet / "proteger.txt").stat().st_mode
        self.assertFalse(mode & stat.S_IWUSR)
        self.assertFalse(mode & stat.S_IWGRP)
        self.assertFalse(mode & stat.S_IWOTH)

    def test_poser_skip_worktree_est_visible_dans_ls_files_v(self) -> None:
        self.contexte.committer_dans_projet("suivi.txt", "contenu\n")

        self.contexte.poser_skip_worktree("suivi.txt")

        resultat = _git(
            ["ls-files", "-v", "--", "suivi.txt"], self.contexte.projet, self.contexte.env
        )
        self.assertTrue(resultat.stdout.startswith("S "), resultat.stdout)

    def test_poser_skip_worktree_assume_unchanged_est_visible_dans_ls_files_v(
        self,
    ) -> None:
        self.contexte.committer_dans_projet("suivi2.txt", "contenu\n")

        self.contexte.poser_skip_worktree("suivi2.txt", assume_unchanged=True)

        resultat = _git(
            ["ls-files", "-v", "--", "suivi2.txt"], self.contexte.projet, self.contexte.env
        )
        self.assertTrue(resultat.stdout.startswith("h "), resultat.stdout)


class HarnaisExecuteScriptDuKitTest(unittest.TestCase):
    """H3 : invariant — le harnais exécute toujours le script du KIT
    (`REPO_ROOT/tools/update_kit.sh`), jamais une copie du faux projet."""

    def test_script_execute_est_celui_du_depot_reel_pas_celui_du_faux_projet(
        self,
    ) -> None:
        self.assertTrue(
            SCRIPT.is_relative_to(REPO_ROOT), "SCRIPT doit être sous REPO_ROOT"
        )

        contexte = fabriquer_kit_et_projet()
        self.addCleanup(contexte.fermer)
        contexte.committer_dans_kit("GUIDE.md", "contenu du kit\n")

        # Un `update_kit.sh` SABOTÉ, committé dans le faux PROJET (jamais
        # dans le faux kit) : s'il était exécuté à la place du vrai, sa seule
        # sortie serait "SABOTAGE" et aucun récapitulatif réel n'apparaîtrait.
        sabotage = contexte.projet / "tools" / "update_kit.sh"
        sabotage.parent.mkdir(parents=True, exist_ok=True)
        sabotage.write_text(
            "#!/usr/bin/env bash\necho SABOTAGE\nexit 0\n", encoding="utf-8"
        )
        sabotage.chmod(0o755)
        _git(["add", "--", "tools/update_kit.sh"], contexte.projet, contexte.env)
        _git(
            ["commit", "--quiet", "-m", "sabotage"], contexte.projet, contexte.env
        )

        resultat = contexte.executer_update_kit("--dry-run")

        sortie = resultat.stdout + resultat.stderr
        self.assertNotIn("SABOTAGE", sortie)
        self.assertIn(DEBUT_RECAPITULATIF, sortie)


class ConfinementDepotReelTest(unittest.TestCase):
    """H4 : la suite ne touche jamais au dépôt qui l'exécute, y compris quand
    `GIT_DIR`/`GIT_WORK_TREE` sont positionnés dans l'environnement."""

    def test_empreinte_du_depot_reel_inchangee_sous_git_dir(self) -> None:
        if os.environ.get(SENTINELLE_SOUS_TEST):
            self.skipTest(
                "sous-process de confinement : ne pas relancer récursivement"
            )
        # `test_update_kit.py` est un chemin GELÉ du kit, mais un consommateur
        # peut l'avoir exclu via `.kit-paths` : ce cas ne doit pas casser sa
        # CI pour autant (revue de sécurité, feature-006 — même défaut que
        # celui corrigé sur la découverte de tests, une couche plus bas ici).
        if not (REPO_ROOT / "tests" / "test_update_kit.py").exists():
            self.skipTest("tests/test_update_kit.py absent (exclu via .kit-paths ?)")

        avant = empreinte_depot(REPO_ROOT)

        env = dict(os.environ)
        env["GIT_DIR"] = str(REPO_ROOT / ".git")
        env["GIT_WORK_TREE"] = str(REPO_ROOT)
        env[SENTINELLE_SOUS_TEST] = "1"

        # Un SEUL cas nommé, jamais une découverte complète : une découverte
        # complète relancerait ce même test, qui relancerait un sous-process,
        # etc. La sentinelle ci-dessus est une deuxième ligne de défense,
        # vérifiée explicitement par le cas suivant.
        resultat = subprocess.run(
            [
                sys.executable,
                "-m",
                "unittest",
                "-v",
                "test_update_kit.GardesUsageTest.test_G1_arbre_sale_synchronisation_reelle_refuse",
            ],
            cwd=REPO_ROOT / "tests",
            env=env,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SOUS_PROCESSUS,
        )

        apres = empreinte_depot(REPO_ROOT)

        self.assertEqual(
            0,
            resultat.returncode,
            f"sous-process en échec :\n{resultat.stdout}\n{resultat.stderr}",
        )
        self.assertEqual(avant, apres)

    def test_empreinte_du_depot_reel_inchangee_sous_git_dir_synchronisation_reelle(
        self,
    ) -> None:
        """H4, chemin d'ÉCRITURE réelle (audit sécurité, feature-006).

        Le cas précédent rejoue G1, qui REFUSE sur arbre sale : le script
        s'arrête avant d'écrire quoi que ce soit, donc le confinement n'y est
        éprouvé que sur un chemin en lecture seule. Ce cas rejoue au contraire
        une synchronisation qui écrit réellement (`git checkout` d'un fichier
        absent du faux projet) — c'est là que la sentinelle et le confinement
        deviennent probants.
        """
        if os.environ.get(SENTINELLE_SOUS_TEST):
            self.skipTest(
                "sous-process de confinement : ne pas relancer récursivement"
            )
        if not (REPO_ROOT / "tests" / "test_update_kit.py").exists():
            self.skipTest("tests/test_update_kit.py absent (exclu via .kit-paths ?)")

        avant = empreinte_depot(REPO_ROOT)

        env = dict(os.environ)
        env["GIT_DIR"] = str(REPO_ROOT / ".git")
        env["GIT_WORK_TREE"] = str(REPO_ROOT)
        env[SENTINELLE_SOUS_TEST] = "1"

        resultat = subprocess.run(
            [
                sys.executable,
                "-m",
                "unittest",
                "-v",
                "test_update_kit.UpdateKitApercuTest."
                "test_apercu_dry_run_identique_a_l_execution_reelle",
            ],
            cwd=REPO_ROOT / "tests",
            env=env,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SOUS_PROCESSUS,
        )

        apres = empreinte_depot(REPO_ROOT)

        self.assertEqual(
            0,
            resultat.returncode,
            f"sous-process en échec :\n{resultat.stdout}\n{resultat.stderr}",
        )
        self.assertEqual(avant, apres)

    def test_sentinelle_provoque_un_skip_immediat(self) -> None:
        """Vérifie EXPLICITEMENT que la sentinelle anti-récursion fonctionne :
        sans elle, un sous-process lancé par le cas de confinement relancerait
        ce même cas, qui relancerait un sous-process, et ainsi de suite — fork
        infini sur le poste et sur les deux runners de CI."""
        env = dict(os.environ)
        env[SENTINELLE_SOUS_TEST] = "1"

        resultat = subprocess.run(
            [
                sys.executable,
                "-m",
                "unittest",
                "-v",
                "test_harnais_kit.ConfinementDepotReelTest."
                "test_empreinte_du_depot_reel_inchangee_sous_git_dir",
            ],
            cwd=REPO_ROOT / "tests",
            env=env,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SOUS_PROCESSUS,
        )

        self.assertEqual(0, resultat.returncode)
        self.assertIn("skipped", resultat.stdout + resultat.stderr)


class AffirmerSeuleGardeTest(unittest.TestCase):
    """`affirmer_seule_garde` doit refuser une clé de garde inconnue (revue de
    code, feature-006) : une faute de frappe dans un futur lot (feature-012,
    013, 014, bug-003) ne doit jamais désactiver silencieusement le
    dispositif anti-chevauchement."""

    def test_leve_value_error_sur_garde_inconnue(self) -> None:
        resultat = subprocess.CompletedProcess(
            args=["peu importe"], returncode=1, stdout="peu importe", stderr=""
        )

        with self.assertRaises(ValueError):
            affirmer_seule_garde(self, resultat, "garde_qui_n_existe_pas")


class VariablesGitANeutraliserTest(unittest.TestCase):
    """Chaque variable de `VARIABLES_GIT_A_NEUTRALISER` est positionnée dans
    l'environnement AMBIANT (celui du process qui lance la suite — pas celui,
    déjà confiné, que le harnais construit), avec une valeur dont l'effet
    serait OBSERVABLE si elle fuitait jusque dans les commandes git du
    harnais. Le critère est mécanique : retirer une variable de
    `VARIABLES_GIT_A_NEUTRALISER` doit faire mourir le cas qui porte son nom
    — chaque variable a son propre cas, jamais une boucle globale, pour que
    l'échec désigne LAQUELLE a cédé.

    Établi par exécution sur clone jetable (jamais sur ce dépôt) : ces
    scénarios injectent réellement des hooks git.

    Une seule variable n'a PAS de cas ici, avec justification plutôt qu'un
    test décoratif :

    - `GIT_CEILING_DIRECTORIES` : chaque commande git du harnais s'exécute
      avec `cwd` déjà À LA RACINE d'un dépôt existant (juste après `git
      init`) — la découverte ne remonte donc jamais l'arborescence, et cette
      variable n'est JAMAIS consultée dans ce flux. C'est exactement la
      configuration inverse de G15 (`env_hors_depot`), le seul endroit du lot
      où elle a un effet observable — et où elle est testée. Jugée solide
      par la revue de code.

    ⚠️ `GIT_EXEC_PATH` avait d'abord été déclarée non éprouvable (même
    raisonnement : « aucune commande du harnais ne sollicite de binaire
    `git-*` externe »). RÉFUTÉ par la revue de code : le harnais lance aussi
    `git fetch` (via `executer_update_kit`, qui exécute le script), et
    `git fetch` invoque bel et bien `git-upload-pack` — résolu via
    `GIT_EXEC_PATH` s'il est positionné. Voir `test_GIT_EXEC_PATH_est_neutralisee`
    ci-dessous. Leçon : une justification d'irréprouvabilité doit résister à
    quelqu'un qui essaie réellement de l'écrire — celle-ci n'a pas résisté.
    """

    def _env_confine_de_base(self, racine: Path) -> dict:
        """Le même confinement de base que `_environnement_git_confine`,
        SANS neutraliser les variables `GIT_*` — c'est justement ce que ce
        cas met à l'épreuve, décoy par décoy."""
        config_globale_vide = racine / "gitconfig-vide-verif"
        config_globale_vide.write_text("", encoding="utf-8")
        env = dict(os.environ)
        env["GIT_CONFIG_GLOBAL"] = str(config_globale_vide)
        env["GIT_CONFIG_NOSYSTEM"] = "1"
        env.pop("GIT_CONFIG_SYSTEM", None)
        return env

    def test_GIT_DIR_est_neutralisee(self) -> None:
        """Fuite : les dépôts jetables committeraient dans un dépôt DÉCOY au
        lieu du leur — c'est le défaut exact de l'incident de confinement de
        feature-006 (`GUIDE.md` committé dans le vrai dépôt du kit)."""
        with tempfile.TemporaryDirectory() as brut:
            racine = Path(brut)
            decoy = racine / "decoy"
            decoy.mkdir()
            env_decoy = self._env_confine_de_base(racine)
            _git(["init", "--quiet", "-b", "main"], decoy, env_decoy)
            _git(["config", "user.email", "decoy@example.test"], decoy, env_decoy)
            _git(["config", "user.name", "Décoy"], decoy, env_decoy)
            (decoy / "d.txt").write_text("d\n", encoding="utf-8")
            _git(["add", "--", "d.txt"], decoy, env_decoy)
            _git(["commit", "--quiet", "-m", "commit initial du décoy"], decoy, env_decoy)
            tete_avant = _git(["rev-parse", "HEAD"], decoy, env_decoy).stdout

            with mock.patch.dict(os.environ, {"GIT_DIR": str(decoy / ".git")}):
                contexte = fabriquer_kit_et_projet()
                self.addCleanup(contexte.fermer)
                contexte.committer_dans_kit("GUIDE.md", "contenu du kit\n")

            tete_apres = _git(["rev-parse", "HEAD"], decoy, env_decoy).stdout
            self.assertEqual(tete_avant, tete_apres, "le décoy n'aurait dû recevoir aucun commit")
            self.assertTrue((contexte.kit / ".git" / "objects").is_dir())

    def test_GIT_WORK_TREE_est_neutralisee(self) -> None:
        """Fuite : `git init` du harnais échoue immédiatement — « GIT_WORK_TREE
        ... not allowed without specifying GIT_DIR » — confirmé par
        exécution. Le cas attend une construction propre, SANS exception ;
        si la variable fuit, `fabriquer_kit_et_projet()` lève."""
        with tempfile.TemporaryDirectory() as brut:
            racine = Path(brut)
            decoy = racine / "decoy-worktree"
            decoy.mkdir()

            with mock.patch.dict(os.environ, {"GIT_WORK_TREE": str(decoy)}):
                contexte = fabriquer_kit_et_projet()
                self.addCleanup(contexte.fermer)
                contexte.committer_dans_kit("GUIDE.md", "contenu du kit\n")

            self.assertEqual(0, len(list(decoy.iterdir())), "le décoy n'aurait dû recevoir aucun fichier")

    def test_GIT_INDEX_FILE_est_neutralisee(self) -> None:
        """Fuite : `git add` écrirait l'index dans un fichier DÉCOY au lieu de
        `.git/index` du dépôt jetable — confirmé par exécution."""
        with tempfile.TemporaryDirectory() as brut:
            racine = Path(brut)
            decoy_index = racine / "decoy-index"

            with mock.patch.dict(os.environ, {"GIT_INDEX_FILE": str(decoy_index)}):
                contexte = fabriquer_kit_et_projet()
                self.addCleanup(contexte.fermer)
                contexte.committer_dans_kit("GUIDE.md", "contenu du kit\n")

            self.assertFalse(decoy_index.exists(), "l'index décoy n'aurait jamais dû être créé")
            self.assertTrue((contexte.kit / ".git" / "index").exists())

    def test_GIT_OBJECT_DIRECTORY_est_neutralisee(self) -> None:
        """Fuite : les objets (blobs/trees/commits) du commit seraient écrits
        dans un répertoire DÉCOY au lieu de `.git/objects` du dépôt jetable —
        confirmé par exécution."""
        with tempfile.TemporaryDirectory() as brut:
            racine = Path(brut)
            decoy_objects = racine / "decoy-objects"
            decoy_objects.mkdir()

            with mock.patch.dict(os.environ, {"GIT_OBJECT_DIRECTORY": str(decoy_objects)}):
                contexte = fabriquer_kit_et_projet()
                self.addCleanup(contexte.fermer)
                contexte.committer_dans_kit("GUIDE.md", "contenu du kit\n")

            self.assertFalse(
                any(decoy_objects.rglob("*")), "le décoy n'aurait dû recevoir aucun objet git"
            )
            self.assertTrue(any((contexte.kit / ".git" / "objects").rglob("*")))

    def test_GIT_ALTERNATE_OBJECT_DIRECTORIES_est_neutralisee(self) -> None:
        """Fuite : le dépôt jetable pourrait lire un objet qui n'existe QUE
        dans un magasin d'objets DÉCOY (`git cat-file -e` réussirait) —
        confirmé par exécution : sans fuite, l'objet est introuvable."""
        with tempfile.TemporaryDirectory() as brut:
            racine = Path(brut)
            source = racine / "source-secrete"
            source.mkdir()
            env_source = self._env_confine_de_base(racine)
            _git(["init", "--quiet", "-b", "main"], source, env_source)
            hash_result = subprocess.run(
                ["git", "hash-object", "-w", "--stdin"],
                cwd=source,
                env=env_source,
                input="SECRET-ALTERNATE\n",
                capture_output=True,
                text=True,
                timeout=TIMEOUT_SECONDES,
                check=True,
            )
            sha_secret = hash_result.stdout.strip()

            with mock.patch.dict(
                os.environ,
                {"GIT_ALTERNATE_OBJECT_DIRECTORIES": str(source / ".git" / "objects")},
            ):
                contexte = fabriquer_kit_et_projet()
                self.addCleanup(contexte.fermer)

                lecture = subprocess.run(
                    ["git", "cat-file", "-e", sha_secret],
                    cwd=contexte.kit,
                    env=contexte.env,
                    capture_output=True,
                    text=True,
                    timeout=TIMEOUT_SECONDES,
                )

            self.assertNotEqual(
                0, lecture.returncode, "l'objet du décoy n'aurait jamais dû être lisible"
            )

    def test_GIT_COMMON_DIR_est_neutralisee(self) -> None:
        """Fuite : `objects`/`config`/`hooks` du dépôt jetable seraient
        redirigés vers un répertoire DÉCOY — confirmé par exécution : le
        décoy se retrouve peuplé, et `.git` du dépôt jetable ne contient plus
        que `HEAD`/`refs`."""
        with tempfile.TemporaryDirectory() as brut:
            racine = Path(brut)
            decoy_common = racine / "decoy-common"
            decoy_common.mkdir()

            with mock.patch.dict(os.environ, {"GIT_COMMON_DIR": str(decoy_common)}):
                contexte = fabriquer_kit_et_projet()
                self.addCleanup(contexte.fermer)

            self.assertFalse(
                (decoy_common / "objects").exists(),
                "le décoy n'aurait jamais dû recevoir la structure commune du dépôt",
            )
            self.assertTrue((contexte.kit / ".git" / "objects").is_dir())

    def test_GIT_CONFIG_PARAMETERS_est_neutralisee(self) -> None:
        """Fuite : `core.hooksPath` injecté par cette variable ferait
        exécuter un hook `pre-commit` DÉCOY au premier commit du harnais —
        reproduit par l'audit sécurité, confirmé par exécution."""
        with tempfile.TemporaryDirectory() as brut:
            racine = Path(brut)
            marqueur = racine / "hook-execute.txt"
            hooks = racine / "decoy-hooks"
            hooks.mkdir()
            hook = hooks / "pre-commit"
            hook.write_text(f'#!/bin/sh\necho "HOOK EXECUTE" > {marqueur}\nexit 0\n', encoding="utf-8")
            hook.chmod(0o755)

            with mock.patch.dict(
                os.environ, {"GIT_CONFIG_PARAMETERS": f"'core.hooksPath={hooks}'"}
            ):
                contexte = fabriquer_kit_et_projet()
                self.addCleanup(contexte.fermer)
                contexte.committer_dans_kit("GUIDE.md", "contenu du kit\n")

            self.assertFalse(marqueur.exists(), "le hook décoy n'aurait jamais dû s'exécuter")

    def test_GIT_CONFIG_COUNT_est_neutralisee(self) -> None:
        """Fuite : `core.fsmonitor` injecté (via `GIT_CONFIG_COUNT` +
        `GIT_CONFIG_KEY_0`/`GIT_CONFIG_VALUE_0`, positionnées ensemble comme
        dans le scénario réel) ferait exécuter un faux moniteur à chaque
        `git status` — reproduit par l'audit, confirmé par exécution.

        Ce cas meurt si `GIT_CONFIG_COUNT` est retiré de
        `VARIABLES_GIT_A_NEUTRALISER` : sans compteur neutralisé, `git`
        tente d'honorer `GIT_CONFIG_KEY_0`/`GIT_CONFIG_VALUE_0` et échoue
        (« missing config key »), ce qui fait échouer la construction. ⚠️ Il
        ne meurt PAS si on retire la boucle de préfixes
        `_PREFIXES_GIT_CONFIG_INDEXE` : sans `GIT_CONFIG_COUNT`, les clés
        indexées résiduelles sont inertes pour git — équivalence de mutation
        déclarée à l'endroit de la boucle, pas ici.
        """
        with tempfile.TemporaryDirectory() as brut:
            racine = Path(brut)
            marqueur = racine / "fsmonitor-execute.txt"
            faux_moniteur = racine / "faux-fsmonitor.sh"
            faux_moniteur.write_text(
                f'#!/bin/sh\necho "FSMONITOR EXECUTE" > {marqueur}\nprintf "\\x02"\n',
                encoding="utf-8",
            )
            faux_moniteur.chmod(0o755)

            with mock.patch.dict(
                os.environ,
                {
                    "GIT_CONFIG_COUNT": "1",
                    "GIT_CONFIG_KEY_0": "core.fsmonitor",
                    "GIT_CONFIG_VALUE_0": str(faux_moniteur),
                },
            ):
                contexte = fabriquer_kit_et_projet()
                self.addCleanup(contexte.fermer)
                _git(["status"], contexte.kit, contexte.env)

            self.assertFalse(
                marqueur.exists(), "le faux moniteur décoy n'aurait jamais dû s'exécuter"
            )

    def test_GIT_TEMPLATE_DIR_est_neutralisee(self) -> None:
        """Fuite : `git init` du harnais copierait les hooks d'un répertoire
        modèle DÉCOY, exécutés au premier commit — confirmé par exécution."""
        with tempfile.TemporaryDirectory() as brut:
            racine = Path(brut)
            marqueur = racine / "template-hook-execute.txt"
            modele = racine / "decoy-template"
            hooks = modele / "hooks"
            hooks.mkdir(parents=True)
            hook = hooks / "pre-commit"
            hook.write_text(
                f'#!/bin/sh\necho "TEMPLATE HOOK EXECUTE" > {marqueur}\nexit 0\n',
                encoding="utf-8",
            )
            hook.chmod(0o755)

            with mock.patch.dict(os.environ, {"GIT_TEMPLATE_DIR": str(modele)}):
                contexte = fabriquer_kit_et_projet()
                self.addCleanup(contexte.fermer)
                contexte.committer_dans_kit("GUIDE.md", "contenu du kit\n")

            self.assertFalse(
                marqueur.exists(), "le hook du modèle décoy n'aurait jamais dû s'exécuter"
            )

    def test_GIT_EXEC_PATH_est_neutralisee(self) -> None:
        """Fuite : `git fetch` — déclenché par le SCRIPT RÉEL, via
        `executer_update_kit`, pas par une commande ad hoc — invoquerait un
        `git-upload-pack` DÉCOY résolu via `GIT_EXEC_PATH`.

        Réfutation d'une justification d'irréprouvabilité initiale
        (« aucune commande du harnais ne sollicite de binaire `git-*`
        externe ») : FAUX, `update_kit.sh` fait un `git fetch`, qui en
        sollicite un. Écrit et confirmé par exécution après que la revue de
        code a montré le défaut du premier raisonnement.
        """
        chemin_exec_reel = subprocess.run(
            ["git", "--exec-path"],
            capture_output=True,
            text=True,
            check=True,
            timeout=TIMEOUT_SECONDES,
        ).stdout.strip()

        with tempfile.TemporaryDirectory() as brut:
            racine = Path(brut)
            marqueur = racine / "exec-path-execute.txt"
            decoy_exec = racine / "decoy-exec-path"
            decoy_exec.mkdir()
            faux_upload_pack = decoy_exec / "git-upload-pack"
            faux_upload_pack.write_text(
                f'#!/bin/sh\necho "EXEC-PATH DECOY EXECUTE" > {marqueur}\n'
                f'exec "{chemin_exec_reel}/git-upload-pack" "$@"\n',
                encoding="utf-8",
            )
            faux_upload_pack.chmod(0o755)

            with mock.patch.dict(os.environ, {"GIT_EXEC_PATH": str(decoy_exec)}):
                contexte = fabriquer_kit_et_projet()
                self.addCleanup(contexte.fermer)
                contexte.committer_dans_kit("GUIDE.md", "contenu du kit\n")
                resultat = contexte.executer_update_kit("--dry-run")

            self.assertEqual(
                0,
                resultat.returncode,
                f"le fetch réel aurait dû réussir (via le vrai git-upload-pack "
                f"ré-exécuté par le décoy) :\n{resultat.stdout}\n{resultat.stderr}",
            )
            self.assertFalse(
                marqueur.exists(), "le git-upload-pack décoy n'aurait jamais dû s'exécuter"
            )

    def test_GIT_CONFIG_est_neutralisee(self) -> None:
        """Fuite : `git config user.email`/`user.name` (l.152-153 du
        constructeur) écriraient dans un fichier DÉCOY au lieu de
        `.git/config` du dépôt jetable — `GIT_CONFIG` est honorée par `git
        config` dès qu'aucun `--file`/`--local` n'est passé, exactement ce
        que fait le harnais. C'est le mécanisme précis de l'incident de
        confinement de feature-006 (`user.name`/`user.email` écrasés),
        atteignable par un chemin distinct de celui déjà bouché (`GIT_DIR`).
        Reproduit sur clone jetable puis confirmé par exécution (2e passage
        de l'audit sécurité)."""
        with tempfile.TemporaryDirectory() as brut:
            racine = Path(brut)
            decoy_config = racine / "decoy-config"

            with mock.patch.dict(os.environ, {"GIT_CONFIG": str(decoy_config)}):
                contexte = fabriquer_kit_et_projet()
                self.addCleanup(contexte.fermer)

            self.assertFalse(
                decoy_config.exists(),
                "le fichier de config décoy n'aurait jamais dû être créé",
            )
            self.assertIn("[user]", (contexte.kit / ".git" / "config").read_text(encoding="utf-8"))

    def test_GIT_TEST_FSMONITOR_est_neutralisee(self) -> None:
        """Fuite : malgré son nom, `GIT_TEST_FSMONITOR` désigne un binaire
        RÉELLEMENT exécuté à CHAQUE `git status` — y compris celui
        qu'`update_kit.sh` lui-même exécute (l.191). Même classe que
        `core.fsmonitor` (canal `GIT_CONFIG_COUNT`/`KEY`/`VALUE`, déjà
        neutralisé), mais un canal distinct qu'aucune autre entrée ne
        bouchait. Reproduit sur clone jetable puis confirmé par exécution
        (2e passage de l'audit sécurité)."""
        with tempfile.TemporaryDirectory() as brut:
            racine = Path(brut)
            marqueur = racine / "fsmonitor-test-execute.txt"
            faux_moniteur = racine / "faux-fsmonitor-test.sh"
            faux_moniteur.write_text(
                f'#!/bin/sh\necho "GIT_TEST_FSMONITOR EXECUTE" > {marqueur}\nprintf "\\x02"\n',
                encoding="utf-8",
            )
            faux_moniteur.chmod(0o755)

            with mock.patch.dict(os.environ, {"GIT_TEST_FSMONITOR": str(faux_moniteur)}):
                contexte = fabriquer_kit_et_projet()
                self.addCleanup(contexte.fermer)
                _git(["status"], contexte.kit, contexte.env)

            self.assertFalse(
                marqueur.exists(), "le faux moniteur décoy n'aurait jamais dû s'exécuter"
            )

    def test_toutes_les_variables_de_la_liste_ont_un_cas_ou_une_justification(
        self,
    ) -> None:
        """Garde-fou du garde-fou : si une variable est ajoutée un jour à
        `VARIABLES_GIT_A_NEUTRALISER` sans lui donner de cas ici (ou une
        justification écrite dans la docstring de cette classe), ce test le
        signale plutôt que de laisser le trou passer inaperçu."""
        couvertes_par_un_cas = {
            "GIT_DIR",
            "GIT_WORK_TREE",
            "GIT_INDEX_FILE",
            "GIT_OBJECT_DIRECTORY",
            "GIT_ALTERNATE_OBJECT_DIRECTORIES",
            "GIT_COMMON_DIR",
            "GIT_CONFIG_PARAMETERS",
            "GIT_CONFIG_COUNT",
            "GIT_TEMPLATE_DIR",
            "GIT_EXEC_PATH",
            "GIT_CONFIG",
            "GIT_TEST_FSMONITOR",
        }
        justifiees_sans_cas = {"GIT_CEILING_DIRECTORIES"}
        self.assertEqual(
            set(VARIABLES_GIT_A_NEUTRALISER),
            couvertes_par_un_cas | justifiees_sans_cas,
        )


class MarqueursDeGardeDisjointsTest(unittest.TestCase):
    """D2 (bug-008/bug-009) : aucun fragment de `MARQUEURS_DE_GARDE` ne doit
    être sous-chaîne d'un AUTRE, dans AUCUN des deux sens — sans quoi
    `affirmer_seule_garde` pourrait laisser passer un chevauchement non
    anticipé sans le voir. Le piège a déjà été désamorcé deux fois À LA MAIN
    (feature-006, puis bug-006/bug-009) ; cette vérification le fait
    désormais MÉCANIQUEMENT, sur TOUTES les paires ORDONNÉES de clés
    distinctes, à chaque ajout futur d'entrée."""

    def test_aucun_fragment_n_est_sous_chaine_d_un_autre(self) -> None:
        cles = sorted(MARQUEURS_DE_GARDE)
        self.assertGreaterEqual(
            len(cles), 2, "au moins deux marqueurs sont nécessaires pour ce test"
        )
        for cle_a in cles:
            for cle_b in cles:
                if cle_a == cle_b:
                    continue
                fragment_a = MARQUEURS_DE_GARDE[cle_a]
                fragment_b = MARQUEURS_DE_GARDE[cle_b]
                self.assertNotIn(
                    fragment_a,
                    fragment_b,
                    f"{cle_a!r} ({fragment_a!r}) est une sous-chaîne de "
                    f"{cle_b!r} ({fragment_b!r}) — chevauchement non anticipé, "
                    "voir D2 de bug-008/bug-009",
                )


if __name__ == "__main__":
    unittest.main()
