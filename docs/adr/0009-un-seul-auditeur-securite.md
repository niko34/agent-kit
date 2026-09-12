# ADR-0009 — Un seul auditeur de sécurité, cumulant gate et audit

## Statut

Accepté

## Date

2026-09-12

## Contexte

L'équipe portait deux agents de sécurité aux périmètres obligatoires
recouvrants : `security-auditor` (gate bloquant, deux passages — P1 sur le
design, P2 sur le diff — avec verdict contraignant GO / GO SOUS CONDITIONS /
NO GO) et `security-reviewer` (audit holistique de toute la surface
d'attaque, sans se limiter à un diff). Constat empirique dans le projet
d'origine : un chantier entier — un serveur HTTP destiné à écouter au-delà de
`localhost` et à lancer Claude Code — s'est déroulé **sans qu'aucun des deux
agents de sécurité ne soit invoqué**.

## Décision

`security-auditor` fusionne dans `security-reviewer`, qui cumule désormais
les deux rôles et annonce toujours lequel il joue :

- rôle **GATE** — périmètre déclaré, deux passages (P1 design, P2 diff),
  verdict contraignant ; un NO GO empêche la livraison ; **un GO en P1 ne
  vaut jamais GO en P2** (une garde correcte sur le papier peut être mal
  placée dans le code — c'est justement le type de défaut que l'agent existe
  pour trouver).
- rôle **AUDIT** — sans diff ni spec de référence, la surface d'attaque
  entière.

Le verdict porte sur le lot livré ; la hiérarchie Grave / Acceptable /
Cosmétique porte sur chaque constat individuel. Un lot peut recevoir GO avec
des constats cosmétiques, jamais avec un constat grave.

Propagation : 60 occurrences dans 17 fichiers. Les passages qui
**opposaient** les deux agents (tableaux à deux lignes dans `CLAUDE.md`,
`GUIDE.md`, `README.md`) ont été réécrits en une ligne plutôt que renommés
mécaniquement, pour éviter des phrases absurdes du type « security-reviewer,
là où security-reviewer ne voit qu'un diff ». Le décompte affiché de l'équipe
passe de 12 à 11 agents. Le CHANGELOG n'est pas réécrit : une entrée passée
décrivant `security-reviewer` comme « complémentaire du gate
`security-auditor` » reste telle quelle, vraie à sa date ; une entrée neuve
décrit la fusion.

## Alternatives considérées

- **Garder les deux agents, en clarifiant leurs périmètres respectifs pour
  réduire le recouvrement** : écarté — le constat n'est pas que les
  périmètres étaient mal définis sur le papier, mais que **deux invocations
  obligatoires sur un même périmètre produisent soit le double de coût
  (les deux sont réellement invoquées), soit l'ambiguïté** (chacun suppose
  que l'autre couvre le cas) — et l'ambiguïté s'est traduite, dans les
  faits, par le fait qu'aucune des deux n'a été invoquée sur un chantier
  entier touchant à l'exposition réseau.

## Conséquences

### Positives

- Une seule invocation obligatoire à retenir par les autres agents et par
  `CLAUDE.md`/`GUIDE.md`, ce qui réduit le risque qu'aucune ne soit
  déclenchée par ambiguïté sur « qui couvre ce cas ».
- La distinction GATE/AUDIT reste explicite dans les sorties de l'agent :
  rien n'est perdu du contenu des deux rôles précédents.
- L'équipe déclarée se réduit réellement (12 → 11), ce qui reflète la
  fusion plutôt que de la maquiller.

### Négatives

- **Un seul agent porte désormais toute la charge de la sécurité** : s'il
  est mal invoqué ou saute une étape, il n'y a plus de second regard
  indépendant pour rattraper l'omission — le bénéfice de deux paires d'yeux
  distinctes disparaît avec la fusion.
- L'historique (CHANGELOG, specs closes antérieures) continue de mentionner
  deux agents séparés : quiconque lit une entrée ancienne sans lire cet ADR
  peut croire que la séparation est toujours d'actualité.
