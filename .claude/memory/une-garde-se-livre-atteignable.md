---
name: une-garde-se-livre-atteignable
description: Une garde n'est livrable que si l'on a exécuté le chemin qui y mène ; un défaut ouvert qui la rend inatteignable entre dans le cycle qui la livre.
metadata:
  type: feedback
---

L'utilisateur a relevé, le 2026-09-13 : « j'ai l'impression que chaque fois que
tu travailles sur un bug, tu en crées un autre. Est-ce qu'il ne serait pas
pertinent de corriger le 1er bug et ceux qu'on trouve dans le même cycle ? »

Le constat littéral était faux — aucun correctif n'avait créé de défaut, tous
préexistaient et venaient de la même primitive. Mais l'intuition visait juste :
`bug-008` (noms cités par git) rendait **inatteignable** la garde que `bug-009`
allait livrer, et il avait été reporté trois fois comme « hors périmètre ».
Établi par exécution : un nom cité fait classer le chemin « À CRÉER », ce qui
court-circuite avant la branche où vit la garde. Destruction, sortie 0.

**Why:** une protection annoncée qui ne s'applique pas est pire que son absence —
elle clôt l'enquête. Et la règle « reporter, jamais absorber » de l'orchestrateur,
qui est saine par défaut, produit exactement ce résultat quand le défaut reporté
est en amont de la garde.

**How to apply:** avant de livrer une garde, exécuter un cas qui doit la
déclencher, un cas voisin qui ne doit pas, et remonter le chemin jusqu'à elle. Si
un défaut ouvert du backlog la rend inatteignable, il entre dans le cycle, avant
elle — critère mécanique, vérifié par exécution, pas appréciation de proximité.
Gravé dans ADR-0017 et dans `architect` / `code-reviewer` / `orchestrator` /
`security-reviewer` / `test-engineer`. Voir [[une-justification-ne-vaut-que-refutee]]
et [[un-correctif-tardif-doit-rouvrir-les-tests]].
