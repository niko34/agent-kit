"""Harnais partagé pour les tests de `tools/update_kit.sh`.

Ce module est le seul endroit où l'on FABRIQUE, CONFINE, EXÉCUTE et OBSERVE :
il fabrique deux dépôts git jetables (un faux kit, un faux projet avec un
distant `kit` local), les confine contre toute fuite vers le dépôt réel, lance
`REPO_ROOT/tools/update_kit.sh` dedans, et expose de quoi observer le
résultat. Il ne connaît **aucune** garde du script testé : les messages
attendus (`MARQUEURS_DE_GARDE`) vivent ici parce que `affirmer_seule_garde` en
a besoin pour l'anti-chevauchement, pas parce que le harnais « sait » ce que
le script doit faire.

Extrait de `tests/test_update_kit.py` (bug-001) sans changer le comportement
des cas existants ; enrichi pour feature-006 (lot 1).
"""

from __future__ import annotations

import hashlib
import os
import stat
import subprocess
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = REPO_ROOT / "tools" / "update_kit.sh"

DEBUT_RECAPITULATIF = "→ Ce que la synchronisation va faire :"
MARQUEURS_DE_PIED_DE_PAGE = ("ℹ️", "✅", "❌")

# Aucun sous-process du harnais ne doit pouvoir pendre indéfiniment : un
# script qui bloque bloquerait la suite ET le runner de CI avec elle.
TIMEOUT_SECONDES = 30

# Message exploitable pour l'absence de `git` dans le PATH — cas limite
# documenté par feature-006, converti UNE SEULE FOIS ici (voir `_git` et
# `empreinte_depot`), pas dans chaque cas qui appelle l'un ou l'autre.
_MESSAGE_GIT_INTROUVABLE = (
    "git est introuvable dans le PATH : le harnais ne peut fabriquer aucun "
    "dépôt jetable ni exécuter update_kit.sh. Installe git ou corrige le "
    "PATH transmis à la suite de tests."
)


# Variables qui redirigent git lui-même vers un AUTRE dépôt, une AUTRE config,
# ou lui font exécuter du code (hooks) en dehors de tout dépôt jetable.
# Neutraliser seulement la config globale/système ne suffit pas : si l'une de
# ces variables est déjà présente dans l'environnement du process qui lance
# la suite (ex. un hook git, un `git -c ...`), TOUTES les commandes git du
# harnais — et le script testé lui-même — s'exécutent sous son influence.
#
# Les 7 premières : reproduit et vérifié — lancer la suite avec
# `GIT_DIR=<dépôt réel>/.git` faisait écrire `user.name`/`user.email`, ajoutait
# un remote « kit » et COMMITTAIT `GUIDE.md` dans le dépôt réel du kit.
#
# Les 4 suivantes (`GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`,
# `GIT_TEMPLATE_DIR`, `GIT_EXEC_PATH`) : ajoutées après le premier passage de
# l'audit sécurité de feature-006, qui a reproduit — par exécution sur clone
# jetable, pas par lecture — trois canaux distincts contournant le
# confinement malgré les 7 premières variables neutralisées :
#   - `GIT_CONFIG_PARAMETERS` injectant `core.hooksPath` → hook `pre-commit`
#     EXÉCUTÉ dans les dépôts jetables (confirmé : sans neutralisation, un
#     hook posé par ce canal s'exécute réellement au premier commit du
#     harnais) ;
#   - `GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_<n>` / `GIT_CONFIG_VALUE_<n>`
#     (famille indexée dynamiquement, jamais un nombre fixe de noms —
#     neutralisée ci-dessous par préfixe, pas par nom exact) injectant
#     `core.fsmonitor` → commande lancée à CHAQUE `git status` ;
#   - `GIT_TEMPLATE_DIR` : hooks recopiés par `git init`, exécutés au commit ;
#   - `GIT_EXEC_PATH` : résolution de `git-upload-pack`, sollicité par le
#     `git fetch` du script lui-même.
#
# Les 2 dernières (`GIT_CONFIG`, `GIT_TEST_FSMONITOR`) : ajoutées après le
# SECOND passage de l'audit, toujours reproduit par exécution :
#   - `GIT_CONFIG` : honorée par `git config` dès qu'aucun `--file`/`--local`
#     n'est passé — exactement ce que fait le harnais pour `user.email` et
#     `user.name`. Confirmé : `[user] email=…/name=…` finit dans le fichier
#     DÉCOY désigné par cette variable, et `.git/config` du dépôt jetable
#     reste sans section `[user]`. Pointée sur le `.git/config` d'un vrai
#     dépôt, c'est EXACTEMENT le dégât de l'incident de confinement de
#     feature-006 — par un chemin différent de celui déjà bouché.
#   - `GIT_TEST_FSMONITOR` : malgré son nom, exécute réellement un binaire à
#     CHAQUE `git status` — y compris celui du script testé. Même classe que
#     `core.fsmonitor` (canal `GIT_CONFIG_COUNT`), mais un canal distinct,
#     jamais bouché par celui-là.
VARIABLES_GIT_A_NEUTRALISER = (
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_COMMON_DIR",
    "GIT_CEILING_DIRECTORIES",
    "GIT_CONFIG_PARAMETERS",
    "GIT_CONFIG_COUNT",
    "GIT_TEMPLATE_DIR",
    "GIT_EXEC_PATH",
    "GIT_CONFIG",
    "GIT_TEST_FSMONITOR",
)

# Préfixes de la famille indexée dynamiquement `GIT_CONFIG_KEY_<n>` /
# `GIT_CONFIG_VALUE_<n>` : `n` peut valoir n'importe quel entier hérité via
# `GIT_CONFIG_COUNT`, donc aucune liste de noms exacts ne les couvrirait tous.
_PREFIXES_GIT_CONFIG_INDEXE = ("GIT_CONFIG_KEY_", "GIT_CONFIG_VALUE_")


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
    # ⚠️ ÉQUIVALENCE DE MUTATION DÉCLARÉE (revue de code, feature-006) :
    # retirer cette boucle ne fait mourir aucun test. Ce n'est PAS un trou —
    # sans `GIT_CONFIG_COUNT` (neutralisé juste au-dessus, dans la boucle sur
    # `VARIABLES_GIT_A_NEUTRALISER`), git ignore purement et simplement tout
    # `GIT_CONFIG_KEY_<n>`/`GIT_CONFIG_VALUE_<n>` résiduel : sans compteur,
    # ils sont INERTES. Cette boucle ne protège donc qu'un scénario que la
    # précédente a déjà neutralisé — elle reste une redondance défensive
    # volontaire (si `GIT_CONFIG_COUNT` était un jour retiré de la liste par
    # erreur, ELLE seule empêcherait encore l'injection), pas une garantie
    # testée séparément. Ne la compte jamais comme « tuée » par un mutant :
    # aucun test de ce fichier n'est censé mourir si on la retire.
    for cle in list(env):
        if cle.startswith(_PREFIXES_GIT_CONFIG_INDEXE):
            env.pop(cle, None)
    return env


def _git(args: list[str], cwd: Path, env: dict) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(
            ["git", *args],
            cwd=cwd,
            env=env,
            check=True,
            capture_output=True,
            text=True,
            timeout=TIMEOUT_SECONDES,
        )
    except FileNotFoundError as exc:
        raise RuntimeError(_MESSAGE_GIT_INTROUVABLE) from exc


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
            timeout=TIMEOUT_SECONDES,
        )

    # ── H2 — primitives de mise en scène pour ce lot et les suivants ────────
    # Signatures gelées (feature-006) : feature-012, feature-013, feature-014
    # et bug-003 en dépendent. Le harnais ne connaît AUCUNE garde du script :
    # ces méthodes mettent seulement le dépôt jetable dans un état donné.

    def ecrire_kit_paths(self, lignes: list[str]) -> None:
        """Écrit `.kit-paths` à la racine du faux projet, un chemin par ligne."""
        contenu = "".join(f"{ligne}\n" for ligne in lignes)
        (self.projet / ".kit-paths").write_text(contenu, encoding="utf-8")

    def installer_github(self, avec_sync: bool = True) -> None:
        """Crée un `.github/` dans le faux projet.

        `avec_sync=True` y ajoute aussi un faux `tools/sync_copilot_agents.py`
        (jamais exécuté par le harnais lui-même — seul `update_kit.sh` du kit
        réel peut l'invoquer, en sous-process, une fois lancé).
        """
        (self.projet / ".github").mkdir(exist_ok=True)
        if avec_sync:
            outils = self.projet / "tools"
            outils.mkdir(exist_ok=True)
            (outils / "sync_copilot_agents.py").write_text(
                "#!/usr/bin/env python3\n"
                "import sys\n"
                "\n"
                "sys.exit(0)\n",
                encoding="utf-8",
            )

    def salir_arbre(self, chemin: str = "travail-en-cours.txt") -> None:
        """Modifie l'arbre de travail du faux projet sans rien committer :
        `git status --porcelain` cesse d'être vide."""
        cible = self.projet / chemin
        cible.parent.mkdir(parents=True, exist_ok=True)
        cible.write_text("modification non committée\n", encoding="utf-8")

    def rendre_non_inscriptible(self, chemin: str) -> None:
        """Retire les bits d'écriture d'un fichier existant du faux projet."""
        cible = self.projet / chemin
        mode_actuel = cible.stat().st_mode
        cible.chmod(mode_actuel & ~stat.S_IWUSR & ~stat.S_IWGRP & ~stat.S_IWOTH)

    def poser_skip_worktree(self, chemin: str, assume_unchanged: bool = False) -> None:
        """Pose `skip-worktree` (ou `assume-unchanged`) sur un fichier SUIVI
        du faux projet."""
        drapeau = "--assume-unchanged" if assume_unchanged else "--skip-worktree"
        _git(["update-index", drapeau, "--", chemin], self.projet, self.env)

    def fermer(self) -> None:
        self.temporaire.cleanup()


def fabriquer_kit_et_projet() -> KitEtProjetJetables:
    return KitEtProjetJetables()


def env_hors_depot(racine: Path) -> dict:
    """Variante de confinement pour la garde « hors dépôt » (G15).

    Le cas exécute le script avec `cwd=racine`. ⚠️ CORRECTIF DE SÉCURITÉ
    (feature-006, trouvé par `code-reviewer` PUIS reproduit indépendamment et
    plus précisément par l'audit) : le plafond doit être posé sur
    `racine.parent`, JAMAIS sur `racine` elle-même.

    Cause exacte, établie par exécution sur clone jetable, pas par lecture :
    **git n'honore une entrée de `GIT_CEILING_DIRECTORIES` que si elle est un
    ANCÊTRE STRICT du `cwd`** — une entrée égale au `cwd` est silencieusement
    ignorée. Avec le plafond posé sur `racine` (= `cwd`), la recherche
    remontait donc l'arborescence sans jamais s'arrêter, et pouvait trouver un
    vrai dépôt englobant si `TMPDIR` est situé sous un dépôt git avec un
    distant `kit` — reproduit : 24 fichiers indexés et `GUIDE.md` écrasé dans
    le dépôt englobant, code de sortie 0. Avec le plafond sur `racine.parent`
    (ancêtre strict de `cwd=racine`), `git rev-parse --show-toplevel` échoue
    bien avec « not a git repository ».

    Ne « corrige » pas cette variable vers la neutralisation habituelle :
    c'est délibéré, et propre à ce seul cas.
    """
    config_globale_vide = racine / "gitconfig-global-vide-hors-depot"
    config_globale_vide.write_text("", encoding="utf-8")
    env = _environnement_git_confine(config_globale_vide)
    env["GIT_CEILING_DIRECTORIES"] = str(racine.parent)
    return env


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


# ── Anti-chevauchement (D2) ──────────────────────────────────────────────────
# Cinq des gardes du script se recouvrent structurellement (voir feature-006) :
# sur bug-001, un `.gitignore` non committé faisait déclencher la garde d'arbre
# sale AVANT celle qu'on croyait tester, et le cas passait pour la mauvaise
# raison — aucun mutant ne mourait. `MARQUEURS_DE_GARDE` et
# `affirmer_seule_garde` sont la réponse mécanique : chaque cas déclare la
# garde qu'il vise, et la suite refuse de passer si une AUTRE garde a parlé.
#
# Fragments littéraux et courts, relevés dans `tools/update_kit.sh` — jamais
# inventés. Signature et clés gelées : feature-012, feature-013, feature-014
# et bug-003 les consomment.
MARQUEURS_DE_GARDE: dict[str, str] = {
    "arbre_sale": "Arbre de travail sale",
    "distant_absent": "Aucun distant nommé",
    "hors_depot": "doit tourner dans un dépôt git",
    "argument": "Argument inconnu",
    "trop_arguments": "Trop d'arguments",
    "aucun_chemin": "Aucun des chemins gelés n'existe",
    "ecrasement": "SANS RETOUR POSSIBLE",
    "deja_aligne": "Rien à récupérer",
    "bit_gele": "MODIFICATION LOCALE INVISIBLE",
    "type_incompatible": "TYPE INCOMPATIBLE",
}


def affirmer_seule_garde(test, resultat: subprocess.CompletedProcess, garde: str | None) -> None:
    """Affirme qu'au plus UNE garde du script a parlé dans la sortie.

    `garde` est la clé de `MARQUEURS_DE_GARDE` attendue comme SEULE présente,
    ou `None` si AUCUNE garde ne doit avoir parlé (chemin nominal, ex. G2).
    Un marqueur inattendu présent fait échouer l'assertion — c'est la réponse
    mécanique au défaut de bug-001.

    Lève `ValueError` si `garde` n'est ni `None` ni une clé connue de
    `MARQUEURS_DE_GARDE` : une faute de frappe dans un futur lot (feature-012,
    013, 014, bug-003) désactiverait sinon tout le dispositif en silence — le
    cas passerait sans avoir rien vérifié, exactement le motif d'échec que ce
    lot combat.
    """
    if garde is not None and garde not in MARQUEURS_DE_GARDE:
        raise ValueError(
            f"garde inconnue : {garde!r} — clés valides de MARQUEURS_DE_GARDE : "
            f"{sorted(MARQUEURS_DE_GARDE)} (ou None)"
        )
    sortie = resultat.stdout + resultat.stderr
    for cle, marqueur in MARQUEURS_DE_GARDE.items():
        if cle == garde:
            test.assertIn(
                marqueur, sortie, f"garde attendue absente : {cle!r} ({marqueur!r})"
            )
        else:
            test.assertNotIn(
                marqueur,
                sortie,
                f"garde inattendue présente : {cle!r} ({marqueur!r}) — "
                "chevauchement non anticipé, voir D2 de feature-006",
            )


def empreinte_depot(racine: Path) -> tuple:
    """Empreinte observable d'un dépôt git, lue avec l'environnement AMBIANT.

    Sert à contrôler qu'une exécution confinée n'a rien changé au dépôt réel,
    y compris quand `GIT_DIR` est positionné dans l'environnement du process
    qui lance la suite (H4). Volontairement lue SANS confinement : c'est le
    dépôt réel qu'on observe, pas un dépôt jetable.

    Inclut la config LOCALE (`git config --local --list`) : l'écrasement de
    `user.name`/`user.email` est l'un des dégâts réels de l'incident de
    confinement de feature-006 — une empreinte qui ne les lit pas ne
    l'aurait pas détecté.

    ⚠️ `config_locale` et `distants` sont HACHÉS, jamais renvoyés en clair
    (revue de sécurité, 2e passage) : sur un runner de CI, `checkout` range
    son jeton d'authentification dans `http.extraheader`, qui apparaît donc
    dans `git config --local --list` et dans `git remote -v` (l'URL peut
    aussi porter un jeton). Ce jeton n'apparaissait pas dans le message
    d'échec de H4 — mais seulement grâce à la troncature `maxDiff` de
    `unittest`, par accident, pas par conception. Le hachage garde le même
    pouvoir de détection (deux valeurs différentes hachent différemment)
    sans jamais porter de secret en clair, exactement comme `empreinte_index`
    ci-dessous pour `git ls-files -s`.
    """

    def _sortie(args: list[str]) -> str:
        try:
            return subprocess.run(
                ["git", *args],
                cwd=racine,
                capture_output=True,
                text=True,
                check=True,
                timeout=TIMEOUT_SECONDES,
            ).stdout
        except FileNotFoundError as exc:
            raise RuntimeError(_MESSAGE_GIT_INTROUVABLE) from exc

    def _hachage(sortie: str) -> str:
        return hashlib.sha256(sortie.encode("utf-8")).hexdigest()

    rev = _sortie(["rev-parse", "HEAD"])
    statut = _sortie(["status", "--porcelain"])
    empreinte_distants = _hachage(_sortie(["remote", "-v"]))
    empreinte_config_locale = _hachage(_sortie(["config", "--local", "--list"]))
    empreinte_index = _hachage(_sortie(["ls-files", "-s"]))
    return (rev, statut, empreinte_distants, empreinte_config_locale, empreinte_index)
