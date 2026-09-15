# ADR-0025 — La grammaire du diagramme de déroulé

## Statut

Accepté

## Date

2026-09-15

## Contexte

`feature-017` remplace la représentation textuelle des enchaînements d'agents
(maillons en ligne, liseré ambre de reprise, bandeau de rebouclage) par un
diagramme : un cercle par agent, relié en séquence, avec empilement vertical
pour les agents simultanés.

Le journal d'événements ne mesure que trois grandeurs par passage d'agent :
sa durée, ses appels d'outils, ses fichiers écrits (`control-center/backend/events.py`,
fonction `reconstruire`). Il ne mesure **pas** de jetons — les récupérer
supposerait de lire les transcriptions de session, décision non prise. Trois
grandeurs mesurées, trois formes disponibles sur un cercle (diamètre,
graduations autour, liseré intérieur) : la correspondance restait à choisir et
à figer, avant que le premier ajout futur ne la redéfinisse par accident.

Deux pistes ont été essayées et mesurées avant d'être écartées (voir
`specs/features/done/feature-017-diagramme-de-deroule-du-cycle.md`, section
« Contexte ») :

- une **échelle de temps réelle** en abscisse : sur un cycle réel, deux agents
  séparés de 38 secondes se retrouvaient à 14 pixels l'un de l'autre, quelle
  que soit la largeur de la zone ;
- une **disposition en deux couloirs** pour les agents simultanés : elle ne
  permettait pas de dire que le cycle avance d'un seul cran, quel que soit le
  nombre d'agents du créneau.

## Décision

### 1. Trois grandeurs mesurées, trois formes du cercle

| Forme | Donnée portée | Échelle |
|---|---|---|
| Diamètre du cercle | durée de l'agent | rayon borné [20, 56] px, plafond à 20 min (`calculerRayon`, `control-center/web/diagramme.js:199`) |
| Graduations autour du cercle | nombre d'appels d'outils | échelle adaptative bornée [8, 40] graduations, plafond nominal à 70 outils, densité qui s'ajuste au rayon pour ne jamais se toucher (`calculerGraduations`, `diagramme.js:210`) |
| Liseré intérieur | nombre de fichiers écrits | épaisseur bornée [1,5, 6] px, plafond à 10 fichiers (`calculerLiseret`, `diagramme.js:220`) |

Chaque forme porte une encoche de zéro, un cran de plafond et un anneau
fantôme donnant la pleine échelle — un agent à zéro appel d'outil reste
visible (cercle sans graduation allumée), et un agent qui dépasse
l'échelle nominale ne casse pas le tracé, il sature.

**Les jetons ne sont pas mesurés** et n'ont donc aucune forme : le journal ne
les porte pas, et en inventer une donnerait un nombre qui n'existe dans
aucune source. Voir `docs/DESIGN-SYSTEM.md` §5.

### 2. L'écart horizontal ne mesure pas le temps

Chaque agent réclame la demi-largeur du plus exigeant entre son cercle avec
ses graduations et le plus long de ses trois libellés (heure, durée, nom) —
jamais une distance proportionnelle à l'écoulement réel. Le temps se **lit**
sous chaque cercle, il ne se mesure plus en pixels. L'attente entre deux
agents, quand elle dépasse deux minutes, s'écrit dans une pastille posée sur
le lien, dont la place est réservée par le même calcul (`disposer()`,
`diagramme.js:270`).

### 3. Les agents simultanés s'empilent verticalement, dans un seul créneau

Un créneau qui porte plusieurs agents dessine un cadre au filet discret,
libellés à droite du cercle (pas en dessous, faute de quoi trois agents
empilés dépasseraient 600 px de haut), et le cycle avance d'un seul cran quel
que soit l'effectif du créneau. Au-delà de quatre agents, la pile se replie
(« +N ») plutôt que de laisser le bloc grandir sans fin.

### 4. Séparation stricte entre le module de géométrie et le rendu SVG

`control-center/web/diagramme.js` est un module **pur** : aucun DOM, aucune
couleur, aucun style — uniquement de l'arithmétique sur les champs déjà
présents dans `passages[]`. `disposer(passages, mesures)` retourne un contrat
de sortie documenté en tête de fichier (créneaux, liens, arcs, avec toute
géométrie déjà calculée : rayon, graduations, pastilles, hauteur d'arc).
`control-center/web/app.js` (`construireDiagramme`, ligne 1070) est le seul
appelant en production ; il transforme cette géométrie en éléments SVG et lit
les jetons de couleur (`var(--a-<rôle>)`) — il n'invente aucune valeur
numérique.

Cette séparation n'est pas seulement une commodité de test (`diagramme.js` se
teste seul, sans bac à sable DOM) : c'est ce qui a permis de trouver, par
mutation, deux défauts où la réservation d'espace et le rendu réel
divergeaient (voir Conséquences).

## Alternatives considérées

- **Échelle de temps réelle en abscisse** — écartée : illisible dès que deux
  agents sont proches en durée mais éloignés en position dans un cycle qui
  s'étale sur plusieurs minutes ; aucune largeur de zone ne les aurait
  séparés lisiblement.
- **Deux couloirs pour les agents simultanés** (un couloir par agent en
  parallèle plutôt qu'un empilement dans un créneau unique) — écartée : ne
  permettait pas d'exprimer que le cycle avance d'un seul cran indépendamment
  du nombre d'agents en parallèle, et aurait dupliqué la largeur réservée par
  agent au lieu de la partager dans un même créneau.

## Conséquences

### Positives

- Une grammaire fermée et documentée (`docs/DESIGN-SYSTEM.md` §5) : tout
  ajout futur au diagramme se confronte à une correspondance déjà écrite
  entre forme et donnée, au lieu de la réinventer implicitement.
- Lisibilité tenue sur un spectre large de durées et de démographies d'outils
  (un `test-engineer` qui relance 80 fois la suite et un
  `backend-developer` qui écrit 53 fichiers en 235 appels restent
  distinguables sans faire exploser le tracé).
- La simultanéité, fréquente sur un cycle réel (`code-reviewer` et
  `security-reviewer` en parallèle, un `debugger` qui redémarre avant la fin
  du premier), se lit sans donner l'illusion d'une séquence qui n'a pas eu
  lieu.

### Négatives

- Deux fonctions indépendantes formatent la durée d'un agent : `texteDuree()`
  dans `diagramme.js` (utilisée pour dimensionner l'espace réservé au
  libellé) et `duree()` dans `app.js` (utilisée pour peindre le texte réel,
  `app.js:900-901`). Elles doivent rester d'accord sur chaque branche
  (durée mesurée, en cours, invalide) : une divergence entre les deux ne
  casse rien visuellement de façon évidente, elle fait déborder un libellé
  sur son voisin. Une garde de non-chevauchement reconstruit donc le texte
  peint avec la formule d'`app.js` recopiée à la main, jamais en délégant à
  `disposer.texteDuree` (`control-center/web/test_app_diagramme.js:112-123`,
  voir Pièges du module).
- La réservation d'espace (pastille d'attente, hauteur d'arc de rebouclage)
  et le rendu SVG doivent rester calculés par la **même** fonction
  (`disposer()`), jamais recalculés séparément dans `app.js` : deux défauts
  mesurés pendant ce cycle (pastille recouvrant le libellé voisin, arc
  dépassant du cadre) venaient exactement de cette duplication.

### Ce que ça verrouille

- Toute modification de ce que porte une forme du cercle (diamètre,
  graduations, liseré) — par exemple substituer une autre grandeur, ou en
  ajouter une quatrième — révise cet ADR, pas seulement le code.
- L'écart horizontal reste gouverné par la lisibilité (taille de cercle,
  longueur de libellé), jamais par une horloge : toute demande future
  d'« échelle de temps » sur ce diagramme rejoue un essai déjà mené et
  mesuré défaillant.
- La géométrie d'un agent (position, taille, espace réservé) ne se calcule
  qu'une fois, dans `diagramme.js` ; `app.js` ne recalcule jamais une
  dimension déjà produite par `disposer()`.

## Références

- Code : `control-center/web/diagramme.js` (module pur, contrat de sortie
  documenté en tête de fichier, `MESURES_DEFAUT` ligne 68, `disposer()` ligne
  270) ; `control-center/web/app.js:1070` (`construireDiagramme`, seul
  appelant en production), `:871` (`construireSoclesCreneau`), `:935`
  (`construireLiensDiagramme`), `:981` (`construireArcsDiagramme`).
- Tests : `control-center/web/test_app_diagramme.js` (garde de
  non-chevauchement par reconstruction indépendante des boîtes peintes,
  `texteDureeAppJs` ligne 120) ; `control-center/web/test_app_accordeon.js`
  (gardes côté intégration : `diagramme.js` non chargé, pastille/arc/hauteur
  reconstruits sans déléguer à `disposer`).
- Design system : `docs/DESIGN-SYSTEM.md` §5 (grammaire résumée, tableau des
  formes), §6 (défilement de la zone, un seul cycle déplié).
- Spec : `specs/features/done/feature-017-diagramme-de-deroule-du-cycle.md`.
- Pièges du module : `control-center/PIEGES.md`, entrées sur la
  reconstruction indépendante d'un test qui délègue à la fonction sous test.
