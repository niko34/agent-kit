"""Non-régression sur l'aperçu de `tools/update_kit.sh` (bug-001).

Le harnais exécute réellement `update_kit.sh` : chaque cas fabrique un dépôt
« kit » et un dépôt « projet » jetables sous `tempfile.TemporaryDirectory`,
confinés (config git globale et système neutralisées, identité locale au
dépôt jetable, aucun réseau — le distant `kit` est un chemin de fichier
local). Ce confinement est un invariant, pas une précaution : un cas mal
confiné ferait tourner une synchronisation réelle sur ce dépôt-ci.
"""

from __future__ import annotations

import os
import subprocess
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "tools" / "update_kit.sh"

DEBUT_RECAPITULATIF = "→ Ce que la synchronisation va faire :"
MARQUEURS_DE_PIED_DE_PAGE = ("ℹ️", "✅", "❌")


# Variables qui redirigent git lui-même vers un AUTRE dépôt que celui sur
# lequel `git init` vient d'être exécuté. Neutraliser seulement la config
# globale/système ne suffit pas : si l'une de ces variables est déjà présente
# dans l'environnement du process qui lance la suite (ex. un hook git), TOUTES
# les commandes git du harnais — et le script testé lui-même — s'exécutent
# sur le dépôt qu'elle désigne. Reproduit et vérifié : lancer la suite avec
# `GIT_DIR=<dépôt réel>/.git` faisait écrire `user.name`/`user.email`, ajoutait
# un remote « kit » et COMMITTAIT `GUIDE.md` dans le dépôt réel du kit.
VARIABLES_GIT_A_NEUTRALISER = (
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_COMMON_DIR",
    "GIT_CEILING_DIRECTORIES",
)


def _environnement_git_confine(config_globale_vide: Path) -> dict:
    """Neutralise toute config git globale/système ET tout aiguillage git.

    Le confinement est un invariant du harnais, pas une précaution : ce
    module exécute réellement `git` et `update_kit.sh`. Un cas mal confiné
    agirait sur le dépôt réel du poste qui lance la suite.
    """
    env = dict(os.environ)
    env["GIT_CONFIG_GLOBAL"] = str(config_globale_vide)
    env["GIT_CONFIG_NOSYSTEM"] = "1"
    env.pop("GIT_CONFIG_SYSTEM", None)
    for variable in VARIABLES_GIT_A_NEUTRALISER:
        env.pop(variable, None)
    return env


def _git(args: list[str], cwd: Path, env: dict) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args],
        cwd=cwd,
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )


class KitEtProjetJetables:
    """Un dépôt « kit » et un dépôt « projet », tous deux jetables et confinés."""

    def __init__(self) -> None:
        self.temporaire = tempfile.TemporaryDirectory()
        racine = Path(self.temporaire.name)
        self.kit = racine / "kit"
        self.projet = racine / "projet"
        self.kit.mkdir()
        self.projet.mkdir()

        config_globale_vide = racine / "gitconfig-global-vide"
        config_globale_vide.write_text("", encoding="utf-8")
        self.env = _environnement_git_confine(config_globale_vide)

        for depot in (self.kit, self.projet):
            _git(["init", "--quiet", "-b", "main"], depot, self.env)
            _git(["config", "user.email", "jetable@example.test"], depot, self.env)
            _git(["config", "user.name", "Dépôt jetable"], depot, self.env)

        # Distant local (chemin de fichier) : aucun réseau n'est jamais sollicité.
        _git(["remote", "add", "kit", str(self.kit)], self.projet, self.env)

    def committer_dans_kit(self, chemin: str, contenu: str) -> None:
        cible = self.kit / chemin
        cible.parent.mkdir(parents=True, exist_ok=True)
        cible.write_text(contenu, encoding="utf-8")
        _git(["add", "--", chemin], self.kit, self.env)
        _git(["commit", "--quiet", "-m", f"ajoute {chemin}"], self.kit, self.env)

    def committer_dans_projet(self, chemin: str, contenu: str) -> None:
        """Committe un fichier dans le faux projet — arbre propre garanti.

        Utilisé pour que `git status --porcelain` (garde d'arbre sale
        préexistante, l.160) ne voie plus rien à signaler : sans cela, elle
        se déclenche AVANT la garde d'écrasement neuve et masque tout défaut
        de cette dernière — un mutant qui la détruit ne serait alors jamais
        vu, la mauvaise garde ayant déjà fait échouer la synchronisation.
        """
        cible = self.projet / chemin
        cible.parent.mkdir(parents=True, exist_ok=True)
        cible.write_text(contenu, encoding="utf-8")
        _git(["add", "--", chemin], self.projet, self.env)
        _git(["commit", "--quiet", "-m", f"ajoute {chemin}"], self.projet, self.env)

    def executer_update_kit(self, *args: str) -> subprocess.CompletedProcess:
        return subprocess.run(
            [str(SCRIPT), *args],
            cwd=self.projet,
            env=self.env,
            capture_output=True,
            text=True,
        )

    def fermer(self) -> None:
        self.temporaire.cleanup()


def fabriquer_kit_et_projet() -> KitEtProjetJetables:
    return KitEtProjetJetables()


def extraire_recapitulatif(sortie: str) -> str:
    """Isole le bloc récapitulatif, commun à `--dry-run` et à l'exécution réelle.

    Le bloc commence à `DEBUT_RECAPITULATIF` et s'arrête au premier marqueur de
    pied de page (« ℹ️ » en simulation, « ✅ »/« ❌ » en réel) : c'est ce
    dernier segment, et lui seul, que le branchement --dry-run / réel est
    autorisé à faire diverger.
    """
    debut = sortie.find(DEBUT_RECAPITULATIF)
    if debut == -1:
        return ""
    reste = sortie[debut:]
    positions = [
        reste.find(marqueur, len(DEBUT_RECAPITULATIF))
        for marqueur in MARQUEURS_DE_PIED_DE_PAGE
    ]
    positions = [p for p in positions if p != -1]
    fin = min(positions) if positions else len(reste)
    return reste[:fin]


class UpdateKitApercuTest(unittest.TestCase):
    """Reproduction et non-régression du bug-001.

    Cas 1 : un chemin gelé absent du projet doit apparaître comme « à créer »,
    jamais comme une suppression.
    Cas 2 : un chemin gelé présent mais ignoré par git (non suivi), au contenu
    local divergent, doit être signalé en aperçu ET protégé à l'exécution
    réelle — le contenu local ne doit pas être écrasé silencieusement.
    Cas 3 : le récapitulatif de `--dry-run` et celui de l'exécution réelle
    sont identiques, jusqu'au pied de page.
    """

    def setUp(self) -> None:
        self.contexte = fabriquer_kit_et_projet()
        self.addCleanup(self.contexte.fermer)
        self.contexte.committer_dans_kit("GUIDE.md", "contenu du kit\n")

    def test_fichier_absent_du_projet_apparait_comme_a_creer(self) -> None:
        resultat = self.contexte.executer_update_kit("--dry-run")

        sortie = resultat.stdout + resultat.stderr
        self.assertIn("À CRÉER", sortie)
        self.assertIn("GUIDE.md", sortie)
        self.assertNotIn("suppression", sortie)
        self.assertNotIn("deletions(-)", sortie)

    def test_fichier_non_suivi_divergent_est_signale_et_protege(self) -> None:
        # `.gitignore` est COMMITÉ avant d'écrire le contenu local divergent :
        # l'arbre doit être propre au sens de `git status --porcelain` quand
        # le script tourne, pour que la garde d'écrasement neuve soit la
        # SEULE chose capable de faire échouer la synchro réelle. Sans ce
        # commit, la garde d'arbre sale préexistante (l.160) voit
        # `.gitignore` non suivi et bloque la première — masquant un défaut
        # de la seconde.
        self.contexte.committer_dans_projet(".gitignore", "GUIDE.md\n")
        guide = self.contexte.projet / "GUIDE.md"
        contenu_local = "MON TRAVAIL LOCAL NON COMMITE, IRREMPLACABLE\n"
        guide.write_text(contenu_local, encoding="utf-8")

        apercu = self.contexte.executer_update_kit("--dry-run")
        sortie_apercu = apercu.stdout + apercu.stderr
        self.assertIn("NON SUIVI", sortie_apercu)
        self.assertIn("GUIDE.md", sortie_apercu)
        # La simulation ne bloque JAMAIS : c'est le défaut que feature-005 a
        # corrigé (refuser de prévisualiser sur un arbre sale). Si la garde
        # d'écrasement neuve était un jour évaluée avant la sortie --dry-run,
        # cette assertion est la seule à s'en apercevoir.
        self.assertEqual(0, apercu.returncode)

        reel = self.contexte.executer_update_kit()

        self.assertNotEqual(0, reel.returncode)
        self.assertEqual(contenu_local, guide.read_text(encoding="utf-8"))

    def test_apercu_dry_run_identique_a_l_execution_reelle(self) -> None:
        apercu = self.contexte.executer_update_kit("--dry-run")

        # Deuxième dépôt jetable indépendant, en tout point identique au
        # premier : l'exécution réelle ne doit pas retoucher le dépôt utilisé
        # pour la simulation.
        contexte_reel = fabriquer_kit_et_projet()
        self.addCleanup(contexte_reel.fermer)
        contexte_reel.committer_dans_kit("GUIDE.md", "contenu du kit\n")
        reel = contexte_reel.executer_update_kit()

        bloc_simulation = extraire_recapitulatif(apercu.stdout)
        bloc_reel = extraire_recapitulatif(reel.stdout)

        self.assertTrue(bloc_simulation, "bloc récapitulatif introuvable en --dry-run")
        self.assertEqual(bloc_simulation, bloc_reel)

    def test_argument_inconnu_est_rejete_sans_synchroniser(self) -> None:
        """Une faute de frappe sur --dry-run ne doit jamais déclencher le réel.

        `--dry_run` (tiret bas au lieu d'un tiret) est un exemple choisi
        parce que visuellement proche de `--dry-run` : c'est exactement le
        genre de coquille que la seule soupape humaine du script doit
        rattraper.
        """
        resultat = self.contexte.executer_update_kit("--dry_run")

        self.assertNotEqual(0, resultat.returncode)
        self.assertNotIn(
            "À CRÉER",
            resultat.stdout + resultat.stderr,
            "un argument invalide ne doit déclencher aucune synchronisation",
        )
        self.assertFalse((self.contexte.projet / "GUIDE.md").exists())


if __name__ == "__main__":
    unittest.main()
