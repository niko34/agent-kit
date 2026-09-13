"""Non-régression sur l'aperçu de `tools/update_kit.sh` (bug-001) et les cinq
gardes d'usage qui décident si le script s'exécute ou refuse (feature-006,
lot 1).

Le harnais partagé (`tests/harnais_kit.py`) exécute réellement
`update_kit.sh` : chaque cas fabrique un dépôt « kit » et un dépôt « projet »
jetables sous `tempfile.TemporaryDirectory`, confinés (config git globale et
système neutralisées, identité locale au dépôt jetable, aucun réseau — le
distant `kit` est un chemin de fichier local). Ce confinement est un
invariant, pas une précaution : un cas mal confiné ferait tourner une
synchronisation réelle sur ce dépôt-ci.
"""

from __future__ import annotations

import subprocess
import tempfile
import unittest
from pathlib import Path

from harnais_kit import (
    affirmer_seule_garde,
    env_hors_depot,
    extraire_recapitulatif,
    fabriquer_kit_et_projet,
)
from harnais_kit import SCRIPT, TIMEOUT_SECONDES, _git  # usage direct, réservé à ce fichier


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


class GardesUsageTest(unittest.TestCase):
    """Les cinq gardes d'usage de feature-006 (lot 1) : celles qui décident si
    le script s'exécute ou refuse, AVANT toute classification de fichiers.

    Ordre de sortie réel du script (documenté ici une fois, valable pour tous
    les cas de cette classe) :
        argument invalide → hors dépôt git → distant `kit` absent →
        arbre de travail sale → fetch → aucun chemin gelé présent côté kit →
        classification → déjà aligné (court-circuit) → garde d'écrasement →
        checkout réel.

    Ces gardes se recouvrent structurellement (1/2 sont la même garde vue sous
    deux angles ; 14/15/16 sortent toutes avant la classification) : chaque
    cas se termine par `affirmer_seule_garde`, qui fait échouer le test si
    une AUTRE garde que celle visée a parlé dans la sortie — la réponse
    mécanique au défaut de bug-001 (un cas qui passait pour la mauvaise
    raison, sans qu'aucun mutant ne meure).
    """

    def setUp(self) -> None:
        self.contexte = fabriquer_kit_et_projet()
        self.addCleanup(self.contexte.fermer)

    # ── G1 / G2 — arbre de travail sale ─────────────────────────────────────
    # Précédée par : argument (aucun ici) → hors dépôt (on est dans un dépôt)
    # → distant absent (le distant `kit` est posé par fabriquer_kit_et_projet).
    # Aucune de ces trois ne peut donc tirer avant la garde d'arbre sale.

    def test_G1_arbre_sale_synchronisation_reelle_refuse(self) -> None:
        """Garantie 1 : arbre sale → la synchronisation réelle refuse, code
        de sortie non nul."""
        self.contexte.committer_dans_kit("GUIDE.md", "contenu du kit\n")
        self.contexte.salir_arbre()

        resultat = self.contexte.executer_update_kit()

        affirmer_seule_garde(self, resultat, "arbre_sale")
        self.assertNotEqual(0, resultat.returncode)

    def test_G2_arbre_sale_dry_run_passe_quand_meme(self) -> None:
        """Garantie 2 : arbre sale → `--dry-run` s'exécute quand même, code 0.

        C'est la seule assertion qui détecte le retour du défaut 1 de
        feature-005 (refuser de PRÉVISUALISER sur un arbre sale) : elle
        affirme le code 0 ET la présence du récapitulatif, jamais un simple
        « ça ne plante pas ».
        """
        self.contexte.committer_dans_kit("GUIDE.md", "contenu du kit\n")
        self.contexte.salir_arbre()

        resultat = self.contexte.executer_update_kit("--dry-run")

        # Aucune garde ne doit avoir parlé : ni "arbre_sale" (--dry-run passe
        # dessus), ni "deja_aligne" (GUIDE.md reste à créer).
        affirmer_seule_garde(self, resultat, None)
        self.assertEqual(0, resultat.returncode)
        sortie = resultat.stdout + resultat.stderr
        self.assertIn("À CRÉER", sortie)
        self.assertIn("GUIDE.md", sortie)

    # ── G14 — aucun distant « kit » ──────────────────────────────────────────
    # Précédée par : argument (aucun) → hors dépôt (on est dans un dépôt).
    # Aucune des deux ne peut tirer. Pré-condition d'arrange : `git status
    # --porcelain` vide (naturellement, puisque retirer un distant ne touche
    # pas l'arbre de travail) — sinon la garde d'arbre sale, qui sort APRÈS
    # celle-ci dans le script, ne serait de toute façon jamais atteinte, mais
    # un fixture cassé doit être visible à l'arrange, pas laissé dans le doute.

    def test_G14_aucun_distant_kit_message_explicite(self) -> None:
        """Garantie 14 : aucun distant `kit` → message explicite, code non nul."""
        _git(["remote", "remove", "kit"], self.contexte.projet, self.contexte.env)
        statut_arrange = _git(
            ["status", "--porcelain"], self.contexte.projet, self.contexte.env
        )
        assert statut_arrange.stdout == "", "arrange cassé : arbre non propre pour G14"

        resultat = self.contexte.executer_update_kit()

        affirmer_seule_garde(self, resultat, "distant_absent")
        self.assertNotEqual(0, resultat.returncode)

    # ── G15 — hors dépôt git ─────────────────────────────────────────────────
    # Précédée par : argument (aucun). Seule garde antérieure possible, elle
    # ne peut pas tirer sans argument. C'est la garde la plus en amont testée
    # ici : rien d'autre n'a eu la chance de s'exprimer.

    def test_G15_hors_depot_git_code_non_nul(self) -> None:
        """Garantie 15 : hors dépôt git → code de sortie non nul.

        `cd "$(git rev-parse --show-toplevel 2>/dev/null)"` seul ne suffisait
        pas : `cd ""` réussit silencieusement en bash, donc la substitution
        vide ne déclenchait jamais le `|| exit 1`. Corrigé dans `update_kit.sh`
        (au-delà de S1, décision assumée — la garantie 15 était du code mort) :
        la racine est désormais capturée puis vérifiée non vide AVANT le `cd`.

        `--dry-run` est utilisé ici — ceinture et bretelles sur le cas le plus
        dangereux du lot : la garde « hors dépôt » se déclenche AVANT le
        branchement de simulation, donc le cas reste valide même en réel, mais
        si le confinement cédait un jour (cf. `env_hors_depot`), rien ne
        s'écrirait.
        """
        with tempfile.TemporaryDirectory() as brut:
            racine = Path(brut)
            env = env_hors_depot(racine)

            # Arrange : vérifie que git ne voit VRAIMENT aucun dépôt à cet
            # endroit, AVANT de lancer le script — un fixture cassé doit
            # mourir ici, pas en assertion finale. Sans cette vérification,
            # un plafond mal posé (égal au `cwd` au lieu d'un ancêtre STRICT,
            # défaut reproduit en revue et par l'audit) laisserait le cas
            # trouver un dépôt englobant en silence.
            verification = subprocess.run(
                ["git", "rev-parse", "--show-toplevel"],
                cwd=racine,
                env=env,
                capture_output=True,
                text=True,
                timeout=TIMEOUT_SECONDES,
            )
            assert verification.returncode != 0 and verification.stdout == "", (
                "arrange cassé pour G15 : git voit un dépôt sous "
                f"{racine} — TMPDIR est-il sous un dépôt git ? "
                f"(sortie {verification.stdout!r}, code {verification.returncode})"
            )

            resultat = subprocess.run(
                [str(SCRIPT), "--dry-run"],
                cwd=racine,
                env=env,
                capture_output=True,
                text=True,
                timeout=TIMEOUT_SECONDES,
            )

        affirmer_seule_garde(self, resultat, "hors_depot")
        self.assertNotEqual(0, resultat.returncode)

    # ── G16 — projet déjà aligné ─────────────────────────────────────────────
    # Précédée par : argument (aucun) → hors dépôt (on est dans un dépôt) →
    # distant absent (présent) → arbre sale (propre, arrangé ci-dessous) →
    # aucun chemin (GUIDE.md est présent côté kit). Aucune ne peut tirer.
    # Pré-condition d'arrange : arbre propre ET rien à créer/mettre à jour —
    # GUIDE.md committé à l'identique des deux côtés.

    def test_G16_projet_deja_aligne_rien_a_recuperer(self) -> None:
        """Garantie 16 : projet déjà aligné → « rien à récupérer », code 0."""
        contenu = "contenu du kit\n"
        self.contexte.committer_dans_kit("GUIDE.md", contenu)
        self.contexte.committer_dans_projet("GUIDE.md", contenu)

        resultat = self.contexte.executer_update_kit()

        affirmer_seule_garde(self, resultat, "deja_aligne")
        self.assertEqual(0, resultat.returncode)


if __name__ == "__main__":
    unittest.main()
