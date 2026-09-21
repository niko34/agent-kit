# ADR-0032 — L'identité colorée des agents disparaît du diagramme ; la couleur y devient exclusivement sémantique

## Statut

Accepté

## Date

2026-09-20

## Contexte

`ADR-0022` avait doté chaque type d'agent d'une identité de couleur propre
(`--a-<rôle>` / `--f-<rôle>`), engendrée par une méthode catégorielle (clarté et
intensité constantes, seule la teinte varie), séparée des jetons sémantiques
(`--accent`, `--actif`, `--alerte`, `--echec`) par un plancher perceptuel ΔE ≥ 0,10.
`DESIGN-SYSTEM.md` §2 et §8 en tiraient une règle de précédence (« l'identité prend
le texte et le sigle, l'état prend le contour et la forme »), avec une exception
nommée sur le contour du cercle en cours (`feature-020`).

La maquette Material 3 fournie par l'utilisateur (`control-center/maquettes/2026-09-20-maquette-materiel-3.html`)
n'emploie **aucune** couleur d'identité par agent. Son disque d'agent (voir
`ADR-0031`) n'a que des états (`state-pending`, `state-active`, `state-done`, plus
`.parallel` pour le travail concurrent), chacun colorié par une variable d'état
unique (`--state-color`), jamais par le rôle de l'agent. Le sigle au centre du
disque (`SR`, `FE`, `T`, `SEC`…) reste **textuel**, sans couleur de fond dédiée à
l'identité.

## Décision

### 1. `ADR-0022 §1`, `§2`, `§3` sont RÉVOQUÉS

Ce qu'ils fixaient — la méthode de génération d'une palette catégorielle (§1, clarté
et intensité constantes, teinte seule variable), la saturation du cercle des teintes
à 35° de pas minimal (§2, huit rôles, deux angles restants), la règle de repli
`--a-neutre`/`--f-neutre` pour un type d'agent sans teinte assignée (§3) — n'ont plus
d'objet : il n'existe plus de palette catégorielle par agent à engendrer, saturer ou
compléter par un repli. Les tableaux de teintes de `DESIGN-SYSTEM.md` §2 (huit rôles,
angles H) sont retirés.

### 2. La couleur redevient exclusivement sémantique

Ce qui reste, et ce qui gouverne désormais tout le diagramme : les jetons
sémantiques de la maquette (`--primary`, `--teal`, `--coral`, `--amber`,
`--danger`, chacun avec sa variante `-soft`) portent un état — actif, parallèle,
reprise/question bloquante, avertissement, échec — jamais une identité de rôle. Le
tableau de bord entier communique le rôle d'un agent par le **texte** (sigle, nom),
jamais plus par une teinte qui lui serait propre.

### 3. La règle de précédence identité/état et son exception nommée sont RÉVOQUÉES

`DESIGN-SYSTEM.md` §8 posait : « l'identité prend le texte et le sigle, l'état prend
le contour et la forme », avec une exception nommée par `feature-020` sur le contour
du cercle en cours (couleur d'identité au lieu d'une couleur sémantique). Cette règle
et son exception n'ont plus d'objet dès lors qu'il n'existe plus de couleur
d'identité à faire cohabiter avec une couleur d'état sur un même élément — il n'y a
plus qu'une seule famille de couleur à gérer.

### 4. Le plancher ΔE ≥ 0,10 devient SANS OBJET, et non FAUX

Point à souligner explicitement pour éviter une confusion future : `ADR-0022 §5`
(plancher de séparation perceptuelle entre jetons sémantiques et jetons d'identité)
n'est **pas** invalidé par un défaut de méthode ou une mesure qui l'aurait
contredit — il est **sans objet** parce qu'un seul des deux termes qu'il séparait
existe encore. Si un futur cycle réintroduit une identité colorée par agent (un
retour en arrière explicite, pas une dérive), la règle du plancher ΔE ≥ 0,10, sa
méthode de mappage de gamut (§6) et sa marge de conception (§7, ΔL ≥ 0,12 nominal)
**redeviennent pertinentes telles quelles** — elles ne sont pas à réinventer. Un
futur cycle qui lirait « révoqué » plutôt que « sans objet » croirait ce mécanisme
abrogé et risquerait de le refaire à neuf, moins bien mesuré que la première fois.

## Alternatives considérées

- **Conserver l'identité colorée en parallèle de la maquette**, en la posant sur un
  élément que la maquette ne couvre pas (par exemple un anneau extérieur au disque).
  Écartée : la spec demande une adoption fidèle, et ajouter un signal que la
  maquette ne porte pas irait à l'encontre de l'exigence « la maquette précise, pas
  une interprétation ».
- **Réviser `ADR-0022` par amendement** plutôt que révocation partielle. Écartée :
  les paragraphes §1-§3 ne survivent sous aucune forme utile sans palette
  catégorielle à engendrer — un amendement les aurait laissés comme une méthode
  orpheline, sans rien à décrire.
- **Déclarer `ADR-0022 §5` (plancher ΔE) révoqué, comme §1-§3.** Écartée
  explicitement : le plancher ne devient pas faux, il devient inapplicable faute
  d'un second terme de comparaison — nuance jugée assez importante pour motiver un
  paragraphe dédié (§4 ci-dessus) plutôt qu'une simple ligne de statut.

## Conséquences

### Positives

- Fidélité totale à la maquette sur ce point : aucune couleur d'identité à
  maintenir en cohérence avec un système qui n'en a pas.
- Une seule famille de couleur à faire tenir dans la matrice de contraste (garde F5
  de `feature-021`), au lieu de deux familles séparées par un plancher perceptuel à
  revérifier à chaque ajout.
- La méthode de génération catégorielle et son plancher de séparation restent
  documentés et immédiatement réutilisables si une identité colorée revient un jour
  (§4) — rien n'est perdu, seulement mis en dormance.

### Négatives

- **Perte d'un acquis d'accessibilité** : distinguer un agent d'un autre par sa
  seule couleur n'est plus possible (ce n'était de toute façon pas le canal
  principal — le texte l'était déjà) ; c'est désormais le **texte seul** qui porte
  cette distinction, sans filet de couleur en renfort.
- Le cercle des teintes à 35° de pas, saturé à huit rôles (`ADR-0022 §2`), cesse
  d'être une contrainte vécue — mais elle redevient d'actualité intacte si l'identité
  colorée revient, sans que rien n'ait changé entre-temps sur ce point précis.
- Toute lecture future d'`ADR-0022` sans lire le présent ADR risque de croire la
  palette catégorielle toujours active ; le renvoi croisé (Références) est la seule
  protection contre cette confusion.

### Ce que ça verrouille

- Le diagramme et le disque d'agent n'emploient plus qu'une palette sémantique ;
  toute réintroduction d'une couleur par rôle d'agent est le retour en arrière que
  cet ADR documente, pas une extension anodine.
- Le plancher ΔE ≥ 0,10, sa méthode de mappage de gamut et sa marge de conception
  restent la référence à appliquer **sans réinvention** si une identité colorée
  redevient nécessaire — un futur cycle qui les redériverait de zéro ignorerait ce
  paragraphe.

## Références

- Code (à livrer par `feature-021`, non modifié par cet ADR) :
  `control-center/web/app.css`, `control-center/web/app.js`.
- Maquette : `control-center/maquettes/2026-09-20-maquette-materiel-3.html`,
  classes `.agent-node.state-active`, `.state-active.parallel`, `.legend`.
- ADR : [ADR-0022](0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md)
  (§1-§3 révoqués, §5 sans objet, §6-§7 dormants) ; [ADR-0031](0031-la-grammaire-du-disque-d-agent-change.md)
  (grammaire du disque, sans rapport direct de contenu mais issue du même cycle).
- Design system : `docs/DESIGN-SYSTEM.md` §2 (tableau des teintes retiré), §8
  (règle de précédence et exception nommée révoquées).
- Spec : `specs/features/doing/feature-021-revenir-a-un-tableau-de-bord-unifie.md`
  — étape A du 2026-09-20 (« ADR-0022 révoqué (l'identité colorée disparaît) »).

> **Note (2026-09-21)** : cette décision est écrite mais pas encore
> pleinement appliquée au code. Le lot 2 de `feature-021` (adoption du
> système visuel Material 3, `ADR-0030`) a réécrit `control-center/web/app.css`
> et y a conservé les 19 jetons d'identité par agent (`--a-<rôle>`,
> `--f-<rôle>`, plus `--rebouclage` qui en dépend) dans une **couche
> transitoire explicitement nommée** (voir le commentaire d'en-tête du
> fichier, section « couche transitoire »), gardée par
> `F1_TRANSITOIRE_IDENTITE_AGENT` dans `control-center/web/test_conformite_jetons.js`.
> Ils disparaissent au **lot 4** du même cycle, quand `diagramme.js` et
> `app.js` — les seuls fichiers qui les consomment — seront réécrits à leur
> tour. Jusque-là, le diagramme continue d'afficher une couleur par rôle
> d'agent, sans changement visible sur ce point précis.
