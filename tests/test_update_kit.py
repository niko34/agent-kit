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


class GardeGelesPerteTest(unittest.TestCase):
    """bug-003 : un fichier SUIVI mais gelé par `skip-worktree` ou
    `assume-unchanged`, dont le contenu local diverge de `HEAD:$f`, échappe à
    `git status --porcelain` — c'est tout l'objet de ces bits — et donc aux
    deux gardes préexistantes (arbre sale, non-suivis). La classification
    neuve (`geles_perte`) et la garde qui l'exploite sont la seule chose qui
    voit passer ce cas.

    Mise en scène commune : `committer_dans_projet()` d'abord (le fichier
    doit être SUIVI pour que `poser_skip_worktree` s'applique et pour que
    `git status --porcelain` reste vide une fois le bit posé), puis
    réécriture du contenu SANS committer, puis pose du bit.
    """

    def setUp(self) -> None:
        self.contexte = fabriquer_kit_et_projet()
        self.addCleanup(self.contexte.fermer)
        self.contexte.committer_dans_kit("GUIDE.md", "contenu du kit\n")

    def _geler_avec_divergence(self, *, assume_unchanged: bool) -> str:
        """Committe GUIDE.md dans le projet (identique au kit), réécrit son
        contenu localement SANS committer, puis pose le bit demandé. Renvoie
        le contenu local, pour vérification bit à bit après coup."""
        self.contexte.committer_dans_projet("GUIDE.md", "contenu du kit\n")
        guide = self.contexte.projet / "GUIDE.md"
        contenu_local = "MON TRAVAIL LOCAL, JAMAIS COMMITE, IRREMPLACABLE\n"
        guide.write_text(contenu_local, encoding="utf-8")
        self.contexte.poser_skip_worktree("GUIDE.md", assume_unchanged=assume_unchanged)
        return contenu_local

    def _lettre_ls_files_v(self) -> str:
        etat = _git(
            ["ls-files", "-v", "--", "GUIDE.md"], self.contexte.projet, self.contexte.env
        ).stdout
        return etat[:1]

    # ── T2 — skip-worktree, contenu divergent ───────────────────────────────

    def test_T2_skip_worktree_divergent_synchro_reelle_refuse(self) -> None:
        contenu_local = self._geler_avec_divergence(assume_unchanged=False)
        arrange = _git(["status", "--porcelain"], self.contexte.projet, self.contexte.env)
        assert arrange.stdout == "", "arrange cassé : le bit skip-worktree doit vider status"

        resultat = self.contexte.executer_update_kit()

        affirmer_seule_garde(self, resultat, "bit_gele")
        self.assertNotEqual(0, resultat.returncode)
        guide = self.contexte.projet / "GUIDE.md"
        self.assertEqual(contenu_local, guide.read_text(encoding="utf-8"))
        self.assertEqual("S", self._lettre_ls_files_v())

    # ── T3 — assume-unchanged, même contrat ─────────────────────────────────

    def test_T3_assume_unchanged_divergent_synchro_reelle_refuse(self) -> None:
        contenu_local = self._geler_avec_divergence(assume_unchanged=True)

        resultat = self.contexte.executer_update_kit()

        affirmer_seule_garde(self, resultat, "bit_gele")
        self.assertNotEqual(0, resultat.returncode)
        guide = self.contexte.projet / "GUIDE.md"
        self.assertEqual(contenu_local, guide.read_text(encoding="utf-8"))
        self.assertEqual("h", self._lettre_ls_files_v())

    # ── Correctif post-livraison n°2 : la règle couvre « S, ou toute lettre
    # minuscule », pas seulement `h`. `h` est le SEUL état de base minuscule
    # que T3 exerce (cached + assume-unchanged) : ce cas pose assume-unchanged
    # PAR-DESSUS un skip-worktree déjà posé — l'état de base bascule de `S`
    # (majuscule) à `s` (minuscule, vérifié par exécution ci-dessous), un
    # état RÉELLEMENT différent de `h`. Sans ce cas, une mutation qui revient
    # à `case "$etat" in S|h)` (au lieu de `S` ou `[a-z]`) ne serait vue par
    # aucun test, T3 se contentant de `h`.
    #
    # États de base NON couverts, et pourquoi (essayés, pas seulement
    # supposés — voir le rapport de test) :
    #   - `m` (assume-unchanged sur un fichier en conflit non résolu) :
    #     `git update-index --assume-unchanged` refuse avec
    #     `fatal: Unable to mark file` — l'état est créé (fusion en conflit
    #     réelle, testée), seule la pose du bit est impossible.
    #   - `r`/`c` (removed/changed) : aucune opération d'un utilisateur normal
    #     ne les produit avec git 2.47.3. Une divergence de contenu seule
    #     laisse la lettre à `H`/`h` (`git ls-files -v` ne regarde que les
    #     drapeaux d'index, jamais le contenu du fichier de travail) ; un
    #     `git rm` (avec ou sans `--cached`) retire l'entrée de l'index —
    #     `git ls-files -v` ne rend alors plus rien pour ce chemin, le
    #     fichier n'étant plus suivi. Aucune manipulation testée ne produit
    #     ces deux lettres : limite déclarée, pas supposée.

    def test_assume_unchanged_sur_etat_de_base_non_cache_est_detecte(self) -> None:
        self.contexte.committer_dans_projet("GUIDE.md", "contenu du kit\n")
        guide = self.contexte.projet / "GUIDE.md"
        contenu_local = "MON TRAVAIL LOCAL, JAMAIS COMMITE, IRREMPLACABLE\n"
        guide.write_text(contenu_local, encoding="utf-8")
        self.contexte.poser_skip_worktree("GUIDE.md")
        self.contexte.poser_skip_worktree("GUIDE.md", assume_unchanged=True)
        etat_arrange = self._lettre_ls_files_v()
        assert etat_arrange == "s", (
            f"arrange cassé : état de base attendu 's' (skip-worktree + "
            f"assume-unchanged), obtenu {etat_arrange!r}"
        )

        resultat = self.contexte.executer_update_kit()

        affirmer_seule_garde(self, resultat, "bit_gele")
        self.assertNotEqual(0, resultat.returncode)
        self.assertEqual(contenu_local, guide.read_text(encoding="utf-8"))

    # ── Correctif post-livraison n°3 : le message nomme littéralement la
    # commande de déblocage — un utilisateur qui a posé le bit il y a six
    # mois ne la retrouvera pas seul.

    def test_message_garde_nomme_la_commande_no_skip_worktree(self) -> None:
        self._geler_avec_divergence(assume_unchanged=False)

        resultat = self.contexte.executer_update_kit()

        affirmer_seule_garde(self, resultat, "bit_gele")
        self.assertIn("--no-skip-worktree", resultat.stdout + resultat.stderr)

    # ── T4 — --dry-run reste inactif, seule assertion qui voit revenir le
    # défaut 1 de feature-005 (refuser de PRÉVISUALISER) ────────────────────

    def test_T4_dry_run_code_zero_aucune_garde_recapitule(self) -> None:
        self._geler_avec_divergence(assume_unchanged=False)

        resultat = self.contexte.executer_update_kit("--dry-run")

        affirmer_seule_garde(self, resultat, None)
        self.assertEqual(0, resultat.returncode)
        sortie = resultat.stdout + resultat.stderr
        self.assertIn("GUIDE.md", sortie)
        self.assertIn("GELÉS PAR UN BIT GIT", sortie)

    # ── T5 — bit posé, contenu identique au kit : aucune garde ──────────────

    def test_T5_bit_pose_contenu_identique_synchro_sans_garde(self) -> None:
        self.contexte.committer_dans_projet("GUIDE.md", "contenu du kit\n")
        self.contexte.poser_skip_worktree("GUIDE.md")

        resultat = self.contexte.executer_update_kit()

        affirmer_seule_garde(self, resultat, "deja_aligne")
        self.assertEqual(0, resultat.returncode)

    # ── Cas (a) du commentaire de classification, avec bit posé ET
    # divergence de HEAD : le contenu local diverge de ce qui est committé,
    # mais coïncide avec le kit actuel — appliquer la synchro ne changerait
    # RIEN, donc « aucun risque » prime sur le bit, même s'il est posé et
    # divergent de HEAD. Sans ce cas, une mutation qui vérifie le bit AVANT
    # l'identité au kit (au lieu d'après) bloquerait ce fichier à tort sans
    # qu'aucun test ne le remarque.

    def test_bit_pose_divergent_de_head_mais_identique_au_kit_ne_bloque_pas(
        self,
    ) -> None:
        # setUp a déjà committé "contenu du kit\n" côté kit.
        self.contexte.committer_dans_projet("GUIDE.md", "ancien contenu committé\n")
        guide = self.contexte.projet / "GUIDE.md"
        # Réécrit SANS committer : coïncide avec le kit, diverge de HEAD.
        guide.write_text("contenu du kit\n", encoding="utf-8")
        self.contexte.poser_skip_worktree("GUIDE.md")

        resultat = self.contexte.executer_update_kit()

        # Identique au kit → compte dans `identiques`, tous les autres
        # tiroirs de classification restent vides → court-circuit
        # « déjà aligné », comme le cas T5 (mais ici via une divergence de
        # HEAD masquée par une coïncidence de contenu, pas via un commit).
        affirmer_seule_garde(self, resultat, "deja_aligne")
        self.assertEqual(0, resultat.returncode)
        self.assertEqual("contenu du kit\n", guide.read_text(encoding="utf-8"))

    # ── Cas (c) du commentaire de classification : bit posé, mais AUCUNE
    # divergence locale par rapport à HEAD — seul le kit a évolué depuis. Ce
    # n'est pas une modification invisible, c'est une mise à jour normale : la
    # synchro ne doit PAS bloquer. Sans ce cas, une mutation qui confond
    # « diverge de HEAD » et « diverge du kit » (ou qui échange les deux
    # hashs comparés) ne serait vue par aucun test.

    def test_bit_pose_sans_divergence_locale_reste_a_mettre_a_jour(self) -> None:
        self.contexte.committer_dans_kit("GUIDE.md", "V2 du kit\n")
        self.contexte.committer_dans_projet("GUIDE.md", "V1 ancien, jamais mis à jour\n")
        self.contexte.poser_skip_worktree("GUIDE.md")

        resultat = self.contexte.executer_update_kit()

        affirmer_seule_garde(self, resultat, None)
        self.assertEqual(0, resultat.returncode)
        guide = self.contexte.projet / "GUIDE.md"
        self.assertEqual("V2 du kit\n", guide.read_text(encoding="utf-8"))
        # Correctif n°4 (revue post-livraison) : rien n'est perdu (contenu
        # local == HEAD), mais `git checkout` efface le bit gelé — annoncé,
        # jamais en silence — et le bit doit RÉELLEMENT disparaître ensuite.
        sortie = resultat.stdout + resultat.stderr
        self.assertIn("SERA EFFACÉ SANS AVERTISSEMENT", sortie)
        etat_apres = self._lettre_ls_files_v()
        self.assertEqual("H", etat_apres)

    # ── T8 — parité --dry-run / réel, verrouille le choix du per-fichier ────
    # sur la détection globale écartée (voir commentaire de classification
    # dans update_kit.sh) : dans CE scénario précis, `git status --porcelain`
    # reste VIDE (tout l'effet du bit posé) alors que le contenu diverge
    # réellement de HEAD. Une détection fondée sur un état global de l'arbre
    # ne verrait ici RIEN à signaler — exactement le bug d'origine. Deux
    # contextes indépendants, comme le cas bug-001 équivalent : la synchro
    # réelle n'a pas le droit de retoucher le dépôt qui a servi à --dry-run.

    def test_T8_recapitulatif_dry_run_identique_a_l_execution_reelle(self) -> None:
        self._geler_avec_divergence(assume_unchanged=False)
        apercu = self.contexte.executer_update_kit("--dry-run")

        contexte_reel = fabriquer_kit_et_projet()
        self.addCleanup(contexte_reel.fermer)
        contexte_reel.committer_dans_kit("GUIDE.md", "contenu du kit\n")
        contexte_reel.committer_dans_projet("GUIDE.md", "contenu du kit\n")
        (contexte_reel.projet / "GUIDE.md").write_text(
            "MON TRAVAIL LOCAL, JAMAIS COMMITE, IRREMPLACABLE\n", encoding="utf-8"
        )
        contexte_reel.poser_skip_worktree("GUIDE.md")
        reel = contexte_reel.executer_update_kit()

        bloc_simulation = extraire_recapitulatif(apercu.stdout)
        bloc_reel = extraire_recapitulatif(reel.stdout)

        self.assertTrue(bloc_simulation, "bloc récapitulatif introuvable en --dry-run")
        self.assertEqual(bloc_simulation, bloc_reel)

    # ── Cas limite signalé par l'architecte : fichier indexé, jamais commité,
    # bit posé quand même → `HEAD:$f` échoue, chaîne vide, considéré
    # divergent → geles_perte. Conservateur et voulu (voir commentaire du
    # script). Testé en `--dry-run` seulement : un fichier ADDED-mais-non-
    # committé reste visible de `git status --porcelain` (« A  ») MÊME avec
    # skip-worktree posé — vérifié par exécution — donc la garde d'arbre sale
    # préexistante (l.160) tire la première en réel et rend le cas
    # inatteignable par ce chemin ; seul `--dry-run` (qui bypasse cette garde)
    # atteint la classification neuve pour ce fichier précis.

    def test_fichier_indexe_jamais_commite_bit_pose_apparait_en_dry_run(self) -> None:
        # Un commit préalable (sur un AUTRE fichier) pour que HEAD existe :
        # sans lui, `git rev-parse HEAD:$f` échoue parce que HEAD lui-même
        # est absent, pas parce que le chemin y est absent — un faux positif
        # pour ce cas précis.
        self.contexte.committer_dans_projet("autre-fichier.txt", "peu importe\n")
        nouveau = self.contexte.projet / "GUIDE.md"
        nouveau.write_text("jamais commité, juste indexé\n", encoding="utf-8")
        _git(["add", "--", "GUIDE.md"], self.contexte.projet, self.contexte.env)
        self.contexte.poser_skip_worktree("GUIDE.md")

        resultat = self.contexte.executer_update_kit("--dry-run")

        affirmer_seule_garde(self, resultat, None)
        self.assertEqual(0, resultat.returncode)
        sortie = resultat.stdout + resultat.stderr
        self.assertIn("GUIDE.md", sortie)
        self.assertIn("GELÉS PAR UN BIT GIT", sortie)
        self.assertEqual(
            "jamais commité, juste indexé\n", nouveau.read_text(encoding="utf-8")
        )


class NomsAccentuesTest(unittest.TestCase):
    """Correctif post-livraison n°1 (BLOQUANT) : `core.quotepath`, actif par
    défaut, cite les octets non-ASCII (`révision.md` → `"r\\303\\251vision.md"`).
    Sans `-c core.quotepath=off` sur les appels `git ls-tree`/`git ls-files`
    qui alimentent des chemins disque, `[ ! -e "$f" ]` cherchait un fichier
    qui n'existait pas SOUS CETTE FORME, le classait « à créer », et
    `git checkout` l'écrasait — un nom accentué suffisait à contourner TOUTES
    les gardes de bug-001 et bug-003, dans un kit francophone.

    `.claude/agents` est déjà un chemin gelé par défaut (pas besoin de
    `.kit-paths`) : y placer le fichier accentué suffit à le faire entrer
    dans `presents` sans toucher à la configuration.
    """

    def setUp(self) -> None:
        self.contexte = fabriquer_kit_et_projet()
        self.addCleanup(self.contexte.fermer)

    def test_nom_accentue_suivi_gele_divergent_synchro_refuse(self) -> None:
        chemin = ".claude/agents/révision.md"
        self.contexte.committer_dans_kit(chemin, "contenu du kit\n")
        self.contexte.committer_dans_projet(chemin, "contenu du kit\n")
        fichier = self.contexte.projet / chemin
        contenu_local = "TRAVAIL LOCAL ACCENTUÉ, JAMAIS COMMITÉ\n"
        fichier.write_text(contenu_local, encoding="utf-8")
        self.contexte.poser_skip_worktree(chemin)

        resultat = self.contexte.executer_update_kit()

        affirmer_seule_garde(self, resultat, "bit_gele")
        self.assertNotEqual(0, resultat.returncode)
        self.assertEqual(contenu_local, fichier.read_text(encoding="utf-8"))
        etat = _git(["ls-files", "-v", "--", chemin], self.contexte.projet, self.contexte.env).stdout
        self.assertEqual("S", etat[:1])

    def test_nom_accentue_dry_run_apparait_geles_jamais_a_creer(self) -> None:
        chemin = ".claude/agents/révision.md"
        self.contexte.committer_dans_kit(chemin, "contenu du kit\n")
        self.contexte.committer_dans_projet(chemin, "contenu du kit\n")
        fichier = self.contexte.projet / chemin
        fichier.write_text("TRAVAIL LOCAL ACCENTUÉ, JAMAIS COMMITÉ\n", encoding="utf-8")
        self.contexte.poser_skip_worktree(chemin)

        resultat = self.contexte.executer_update_kit("--dry-run")

        affirmer_seule_garde(self, resultat, None)
        self.assertEqual(0, resultat.returncode)
        sortie = resultat.stdout + resultat.stderr
        self.assertIn("révision.md", sortie)
        self.assertIn("GELÉS PAR UN BIT GIT", sortie)
        self.assertNotIn("À CRÉER", sortie)
        self.assertNotIn("303", sortie)  # aucune trace d'échappement octal

    def test_nom_accentue_orphelin_liste_correctement(self) -> None:
        dossier = ".claude/agents"
        # architect.md diverge (kit v2 / projet v1) : évite le court-circuit
        # « déjà aligné », qui sortirait AVANT le checkout et la détection
        # d'orphelins — celle-ci ne tourne qu'après un checkout réel.
        self.contexte.committer_dans_kit(f"{dossier}/architect.md", "kit v2\n")
        self.contexte.committer_dans_projet(f"{dossier}/architect.md", "kit v1\n")
        orphelin = f"{dossier}/ancienne-révision.md"
        self.contexte.committer_dans_projet(orphelin, "obsolète, retiré du kit\n")

        resultat = self.contexte.executer_update_kit()

        affirmer_seule_garde(self, resultat, None)
        self.assertEqual(0, resultat.returncode)
        sortie = resultat.stdout + resultat.stderr
        self.assertIn("CONSERVÉS", sortie)
        self.assertIn(orphelin, sortie)
        self.assertNotIn("303", sortie)  # aucune trace d'échappement octal
        self.assertEqual(
            "kit v2\n",
            (self.contexte.projet / f"{dossier}/architect.md").read_text(encoding="utf-8"),
        )


if __name__ == "__main__":
    unittest.main()
