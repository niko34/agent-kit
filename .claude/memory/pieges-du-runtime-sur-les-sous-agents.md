---
name: pieges-du-runtime-sur-les-sous-agents
description: "Trois comportements de Claude Code non documentés, découverts en branchant les hooks — ils commandent la conception"
metadata:
  type: reference
---

Trois comportements **observés sur le terrain**, absents de la documentation, et
qui déterminent la façon dont le centre de contrôle reconstruit un workflow.

**`SubagentStop` ne porte pas le nom de l'agent.** `agent_type` y est vide, là où
`SubagentStart` le porte. Apparier les passages par nom produirait un récit vide
— l'appariement se fait donc par `agent_id`, et un test l'exige.

**`SubagentStop` arrive sans `SubagentStart`.** Le runtime en émet un à chaque
fin de tour de l'agent principal, avec un `agent_id` neuf. Ce ne sont pas des
sous-agents. Ils sont **comptés et affichés** plutôt qu'avalés : un événement
inexpliqué passé sous silence devient un écart invisible entre le journal et le
récit qu'on en tire.

**`SessionEnd` : affirmation CORRIGÉE le 2026-09-13.** Cette note affirmait
qu'il « marque la fin du TOUR, pas la mort de la session », et qu'une session
détachée reste vivante après l'avoir émis. **C'est faux**, et les deux journaux
instrumentés le réfutent :

| Session | `Stop` | `SessionEnd` | État réel |
|---|---|---|---|
| `0a51b0a1` (kit) | 0 | 1 | morte |
| `dc11d595` (kit) | 1 | 1 | morte |
| `602ebd5c` (kit) | 68 | **0** | vivante |
| `12156c3b` (firmware) | 75 | **0** | vivante |

`SessionEnd` **n'est pas émis par tour** (68 et 75 tours, zéro occurrence) et
**marque bien la mort réelle** de la session. Aucune session vivante n'a émis de
`SessionEnd`, donc aucune n'est affichée close à tort.

⚠️ **Ce qui reste non vérifié** : les deux sessions vivantes relevées sont
`kind: "interactive"`. **Aucune donnée n'existe sur le mode détaché
(`claude --bg`)**, qui était le contexte de l'observation d'origine. Ce n'est
donc pas « le bug n'existe pas » mais « il n'est pas reproductible avec ce
qu'on a, et le mécanisme qu'on lui prêtait est faux ». Voir la cause racine
réécrite de `bug-002`.

Conséquence de fond : **le graphe d'exécution est plat**, car aucun agent du kit
n'a l'outil `Task`. Reconstruire un workflow est un tri chronologique sur un
`session_id` commun, pas une résolution d'arbre. Voir `docs/adr/0002`.
