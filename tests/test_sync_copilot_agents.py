from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools"))

import sync_copilot_agents as sync


class SyncCopilotAgentsTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        (self.root / ".claude/agents").mkdir(parents=True)

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write_agent(
        self,
        name: str = "debugger",
        tools: str = "Read, Write, Edit, Bash, Grep, Glob",
        body: str = "Tu analyses la cause racine.",
    ) -> Path:
        source = self.root / ".claude/agents" / f"{name}.md"
        source.write_text(
            "---\n"
            f"name: {name}\n"
            "description: Agent de diagnostic.\n"
            f"tools: {tools}\n"
            "---\n\n"
            f"{body}\n",
            encoding="utf-8",
        )
        return source

    def test_convertit_les_outils_et_preserve_le_corps(self) -> None:
        self.write_agent()

        result = sync.write_sync(self.root)

        target = self.root / ".github/agents/debugger.agent.md"
        generated = target.read_text(encoding="utf-8")
        self.assertTrue(result.changed)
        self.assertIn("name: \"debugger\"", generated)
        self.assertIn("  - read\n", generated)
        self.assertIn("  - edit\n", generated)
        self.assertIn("  - execute\n", generated)
        self.assertIn("  - search\n", generated)
        self.assertEqual(generated.count("  - edit\n"), 1)
        self.assertIn("Tu analyses la cause racine.", generated)

    def ecrire_agent_avec_cle(self, cle: str, valeur: str) -> Path:
        """Un agent portant une clé de frontmatter supplémentaire."""
        source = self.root / ".claude/agents/debugger.md"
        source.write_text(
            "---\n"
            "name: debugger\n"
            "description: Agent de diagnostic.\n"
            "tools: Read, Grep\n"
            f"{cle}: {valeur}\n"
            "---\n\n"
            "Tu analyses la cause racine.\n",
            encoding="utf-8",
        )
        return source

    def test_la_cle_model_est_ignoree_sans_erreur(self) -> None:
        """`model` est propre au runtime Claude : Copilot choisit le sien.

        La recopier produirait dans le profil une valeur que rien ne lit et qui
        mentirait au lecteur.
        """
        self.ecrire_agent_avec_cle("model", "opus")

        sync.write_sync(self.root)

        genere = (self.root / ".github/agents/debugger.agent.md").read_text(
            encoding="utf-8"
        )
        self.assertNotIn("opus", genere)
        self.assertNotIn("model", genere)
        self.assertIn('name: "debugger"', genere)

    def test_une_cle_vraiment_inconnue_reste_refusee(self) -> None:
        """La garde du refus en bloc ne doit PAS avoir été affaiblie.

        `model` a été ajouté à IGNORED_KEYS, et non à SUPPORTED_KEYS,
        précisément pour que « non convertie » reste une erreur. Sans ce cas,
        rien ne distinguerait une exception délibérée d'un trou dans la garde.
        """
        self.ecrire_agent_avec_cle("couleur", "bleu")

        with self.assertRaises(sync.ConversionError) as contexte:
            sync.write_sync(self.root)
        self.assertIn("couleur", str(contexte.exception))

    def test_check_detecte_un_profil_perime(self) -> None:
        self.write_agent()
        sync.write_sync(self.root)
        target = self.root / ".github/agents/debugger.agent.md"
        target.write_text(target.read_text(encoding="utf-8") + "modifié\n", encoding="utf-8")

        result = sync.check_sync(self.root)

        self.assertEqual(
            result.issues,
            ("profil périmé: .github/agents/debugger.agent.md",),
        )

    def test_refuse_un_outil_inconnu(self) -> None:
        self.write_agent(tools="Read, OutilInconnu")

        with self.assertRaisesRegex(sync.ConversionError, "sans équivalent Copilot"):
            sync.build_expected(self.root)

    def test_refuse_d_ecraser_un_agent_manuel(self) -> None:
        self.write_agent()
        target = self.root / ".github/agents/debugger.agent.md"
        target.parent.mkdir(parents=True)
        target.write_text("profil manuel\n", encoding="utf-8")

        with self.assertRaisesRegex(sync.ConversionError, "refus d'écraser"):
            sync.write_sync(self.root)
        self.assertEqual(target.read_text(encoding="utf-8"), "profil manuel\n")

    def test_supprime_seulement_les_profils_generes_orphelins(self) -> None:
        self.write_agent()
        sync.write_sync(self.root)
        target_dir = self.root / ".github/agents"
        orphan = target_dir / "ancien.agent.md"
        orphan.write_text(
            f"---\n---\n<!-- {sync.GENERATOR_SIGNATURE} from ancien.md; do not edit. -->\n",
            encoding="utf-8",
        )
        manual = target_dir / "manuel.agent.md"
        manual.write_text("profil manuel\n", encoding="utf-8")

        result = sync.write_sync(self.root)

        self.assertFalse(orphan.exists())
        self.assertTrue(manual.exists())
        self.assertIn("supprimé: .github/agents/ancien.agent.md", result.changed)

    def test_accepte_une_liste_yaml_d_outils(self) -> None:
        source = self.root / ".claude/agents/architect.md"
        source.write_text(
            "---\n"
            "name: architect\n"
            "description: Prépare le plan.\n"
            "tools:\n"
            "  - Read\n"
            "  - Grep\n"
            "  - Task\n"
            "---\n\n"
            "Prépare un plan puis rends-le à l'agent principal.\n",
            encoding="utf-8",
        )

        profile = sync.parse_agent(source)

        self.assertEqual(profile.tools, ("read", "search", "agent"))

    def test_adapte_claude_code_dans_la_description_copilot(self) -> None:
        source = self.root / ".claude/agents/orchestrator.md"
        source.write_text(
            "---\n"
            "name: orchestrator\n"
            "description: L'agent principal Claude Code exécute le plan.\n"
            "tools: Read, Bash\n"
            "---\n\n"
            "Prépare le plan.\n",
            encoding="utf-8",
        )

        profile = sync.parse_agent(source)
        generated = sync.render_copilot_profile(profile, self.root)

        self.assertIn("L'agent principal GitHub Copilot exécute le plan.", generated)


if __name__ == "__main__":
    unittest.main()
