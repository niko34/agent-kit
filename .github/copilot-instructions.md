# Instructions GitHub Copilot

- Lis `CLAUDE.md` avant toute intervention : il reste le contrat de travail commun du
  projet et la source de vérité pour le workflow, les invariants et les critères de
  clôture.
- Les profils dans `.github/agents/` sont générés depuis `.claude/agents/` par
  `tools/sync_copilot_agents.py`. Ne les modifie jamais directement : modifie la source
  Claude, puis relance le convertisseur.
- Dans les instructions partagées, les mentions de « Claude » ou « Claude Code »
  désignent l'agent de développement actif. Une notation
  `Task(subagent_type="nom", prompt="…")` signifie « invoquer le profil personnalisé
  `nom` avec l'outil d'agent Copilot ».
- Pour une demande non triviale, invoque d'abord `orchestrator`. Cet agent prépare le
  plan mais n'invoque personne lui-même ; c'est à l'agent principal Copilot d'exécuter
  ensuite chaque brief dans l'ordre et de respecter les verdicts bloquants.
- Les skills communes sont dans `.claude/skills/`, emplacement reconnu par Copilot.
  Charge la skill indiquée par les agents ou par `CLAUDE.md` avant l'action concernée.
- Avant de terminer, exécute les contrôles du projet, dont
  `python3 tools/sync_copilot_agents.py --check` si une définition d'agent a changé.
