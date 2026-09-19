---
name: chantiers-ouverts-apres-bug-001
description: "Ce que l'audit sécurité du 2026-09-12 a laissé ouvert sur update_kit.sh, et la file de specs qui en découle"
metadata:
  type: project
---

L'audit `security-reviewer` (rôle AUDIT) du cycle bug-001 a sorti **trois
constats graves**, tous établis par expérience sur dépôts jetables. Un seul a
été corrigé dans le cycle ; les deux autres ont leur spec.

| Constat | Sort |
|---|---|
| `--dry_run` mal orthographié déclenchait une synchro RÉELLE | corrigé dans bug-001 |
| fichiers `skip-worktree`/`assume-unchanged` : suivis, invisibles à `porcelain`, hors de portée de la garde neuve | `bug-003` |
| la passerelle Copilot exécute du code fraîchement récupéré AVANT la relecture humaine que le script promet | `feature-011` (GATE sécurité obligatoire) |

**File au 2026-09-12 au soir** — `todo/` : `feature-006` (tests complets
d'`update_kit`), `feature-007` à `010` (étapes D→G du centre de contrôle),
`bug-002` (session vivante affichée close), `bug-003`, `feature-011`.
`doing/` est vide.

Le rôle AUDIT ne se déclenche sur aucun changement : il faut le **provoquer**.
Sur ce cycle, il a trouvé ce qu'aucun des trois relecteurs du diff n'avait vu.
Voir [[le-defaut-se-trouve-en-executant]] et [[dette-update-kit-sans-tests]].
