# ADR-0002 — Le graphe d'exécution des agents est plat

## Statut

Accepté

## Date

2026-09-12

## Contexte

Le centre de contrôle reconstruit les workflows à partir des événements émis
par les hooks `SubagentStart` / `SubagentStop`. Ces événements portent
`agent_type`, `agent_id` et `session_id`, mais **aucun identifiant d'appel
parent**. Ce serait bloquant si un agent pouvait en invoquer un autre : sans
identifiant de parent, il serait impossible de savoir quel appel a déclenché
quel sous-appel, et l'imbrication redeviendrait indéchiffrable.

Or aucun agent du kit ne déclare l'outil `Task` (vérifié dans
`control-center/backend/agents.py` : le champ `peut_deleguer` vaut
`"Task" in outils`, et il n'est jamais vrai dans ce dépôt). Aucun agent ne peut
donc déléguer à un autre. Un workflow observable est par conséquent **une
session et une suite de sous-agents qui partagent un `session_id`** — jamais un
arbre d'appels.

## Décision

Le centre de contrôle reconstruit les workflows par **tri chronologique** des
événements d'un même `session_id` (voir `control-center/backend/events.py`),
et non par résolution d'un arbre parent/enfant. C'est un choix de conception
délibéré, pas une limitation constatée : le référentiel affirmait à tort une
« limitation runtime » empêchant la délégation entre agents — elle n'existe
pas techniquement, elle est **volontairement absente** de la configuration des
agents.

## Alternatives considérées

- **Donner l'outil `Task` à un ou plusieurs agents pour permettre la
  délégation** : techniquement trivial (ajouter `Task` à la liste d'outils
  déclarés). Écarté parce que l'orchestration centralisée — un agent principal
  qui invoque chaque spécialiste et relit chaque verdict — garde les verdicts
  et les boucles de correction (NO GO, Request changes) visibles au même
  endroit, dans la session principale. Une délégation en cascade les
  disperserait entre plusieurs niveaux d'agents, invisibles les uns aux
  autres.

## Conséquences

### Positives

- Le module `events.py` reste simple : un tri par horodatage, pas une
  résolution d'arbre avec risque de cycles ou de parents orphelins.
- Les verdicts et boucles de correction du workflow restent visibles dans une
  seule session, lisible de bout en bout par un humain.

### Négatives

- **Cette hypothèse est fragile par construction.** Si un jour un agent reçoit
  `Task`, l'imbrication réelle devient invisible pour le centre de contrôle :
  les passages d'agent s'afficheraient à plat, dans un ordre chronologique qui
  ne reflèterait plus la structure d'appel. Le module le signale déjà
  (`imbrication_suspectee`) plutôt que de mentir silencieusement, mais il ne
  corrige rien — un futur ADR serait nécessaire avant d'ajouter `Task` à un
  agent.
