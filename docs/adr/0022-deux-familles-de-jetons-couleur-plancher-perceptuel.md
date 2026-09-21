# ADR-0022 — Deux familles de jetons de couleur, séparées par un plancher perceptuel

## Statut

Accepté (§1, §2, §3 révoqués par [ADR-0032](0032-l-identite-coloree-des-agents-disparait-du-diagramme.md) — l'identité colorée par agent disparaît ; §5 devient sans objet, non révoqué, tant qu'aucune identité colorée n'existe — voir ADR-0032 §4 ; partiellement révoqué en outre par [ADR-0033](0033-le-theme-sombre-est-supprime.md) — le thème sombre disparaît, rendant sans objet toute clause « dans les deux thèmes »)

## Date

2026-09-15

## Contexte

`feature-015` dote le centre de contrôle d'une **identité de couleur par
agent** (jetons `--a-<rôle>` / `--f-<rôle>`) et d'un **second thème clair**,
à côté des jetons **sémantiques** déjà en place (`--accent`, `--actif`,
`--alerte`, `--echec`), qui portent une gravité — une décision qui demande
attention — et non une identité.

Le sujet de cet ADR n'est pas seulement « comment engendrer une palette de
couleurs par agent ». C'est **deux familles de jetons dont la nature diffère,
et la règle qui les tient séparées** : une palette catégorielle (les agents)
n'a ni ordre ni grandeur ; une palette de gravité (les jetons sémantiques) en
a une. Confondre les deux méthodes de construction, pendant ce cycle, a
produit une collision réelle — pas seulement théorique — détaillée plus bas.

## Décision

### 1. La méthode d'une palette catégorielle : clarté et intensité constantes

Une palette **catégorielle** — une couleur par agent, sans ordre ni
grandeur — se construit en OKLCH à **clarté (L) et intensité (C) constantes**
à l'intérieur d'un thème ; seule la teinte (H) varie d'un rôle à l'autre.
Toute autre méthode produit une palette où certains agents crient et d'autres
chuchotent, ce qui laisse croire à une hiérarchie qui n'existe pas.

Mesuré sur ce projet : assombrir mécaniquement les couleurs du thème sombre
pour obtenir le thème clair (sans reconstruire à L/C constants) donnait un
écart d'intensité perçue de **0,165** entre l'agent le plus coloré et le
moins coloré. La reconstruction à L et C constants ramène cet écart à
**0,035**.

### 2. La saturation du cercle des teintes : deux angles libres, plus aucun après

Avec la règle de génération — un nouvel angle de teinte à **au moins 35°**
de tous les angles déjà attribués —, il ne restait, une fois les six premiers
rôles posés, **exactement deux** angles libres sur le cercle : **220°** et
**336°**, attribués respectivement à `backend-developer` et `doc-writer`.

**Conséquence verrouillée (critère 4)** : un neuvième rôle teinté est
**impossible** sans rouvrir la méthode elle-même (élargir la palette au-delà
d'OKLCH sRGB-mappé, resserrer l'écart minimal, ou accepter deux teintes plus
proches que 35°). Ce n'est pas une limite provisoire à repousser au prochain
agent : c'est une propriété du cercle à 35° de pas minimal, à documenter
avant qu'un futur cycle ne la découvre en butant dessus.

### 3. La règle de repli : `--a-neutre` / `--f-neutre`, jamais une teinte recyclée

Tout rôle sans teinte assignée — un type d'agent absent du tableau des
identités — reçoit le jeton neutre, **achromatique** (chroma nul). L'ensemble
des types d'agents est **ouvert** : 11 agents déclarés dans `.claude/agents/`,
12 types distincts relevés dans le journal d'événements du centre de
contrôle, et `claude-code-guide` qui n'existe que dans le second — un type
vu en usage réel, jamais déclaré comme agent du dépôt.

Le neutre n'est **jamais** une teinte d'agent recyclée : recycler ferait
porter à un rôle sans identité la couleur d'un rôle qui en a une, ce qui
romprait la propriété « deux rôles n'ont jamais la même couleur ». Le neutre
**dit** l'absence d'identité ; il n'en emprunte pas une.

### 4. Les jetons sémantiques ne sont pas une palette catégorielle

Les jetons sémantiques (`--accent`, `--actif`, `--alerte`, `--echec`)
portent une **gravité**, donc un **ordre** — « ceci demande une action »,
« ceci diverge », « ceci a échoué » — ce qu'une palette catégorielle exclut
par construction (« sans ordre ni grandeur »). Leur appliquer la méthode du
§1 (L et C constants, catégorielle) a été essayé puis mesuré, pendant ce
cycle, comme **non conforme** :

- les quatre jetons ainsi engendrés convergeaient à **moins de 6°** d'une
  teinte d'agent (`--accent` à 0,2° de `debugger`, `--actif` à 0,4° de
  `security-reviewer`, `--alerte` à 6,0° de `debugger`, `--echec` à 0,4° de
  `code-reviewer`) ;
- en thème clair, l'écrêtage de gamut faisait converger `--accent` et
  l'identité de `debugger` sur le **même hexadécimal** — trois couples au
  total identiques ou à un bit près sur 255 entre les deux familles.

Les jetons sémantiques sont donc régénérés sur leur **propre axe**, distinct
de la méthode catégorielle, et tenus au plancher de séparation du §5.

### 5. Le plancher de séparation : ΔE OKLab ≥ 0,10, après mappage de gamut

Entre **tout** jeton de gravité et **tout** jeton d'identité, dans les
**deux** thèmes, l'écart perceptuel ΔE (espace OKLab) doit être **≥ 0,10** —
calculé sur les couleurs **effectivement peintes**, c'est-à-dire **après**
le mappage de gamut réellement appliqué (§6), jamais sur les paramètres
nominaux avant mappage. Un écart mesuré avant mappage peut se refermer une
fois le gamut mordu ; c'est exactement ce qui s'est produit pour `--accent`
et `debugger` au §4.

### 6. La méthode de mappage de gamut : réduire l'intensité, ne jamais écrêter canal par canal

Quand une combinaison (L, C, H) tombe hors du gamut sRGB affichable, la
correction réduit **l'intensité (C)**, à **clarté et teinte conservées**.
Elle n'écrête **jamais** canal par canal (R, G ou B individuellement plafonné
à ses bornes).

L'écrêtage canal par canal **déplace la clarté** perçue, ce qui casse la
constante d'une palette catégorielle exactement là où le gamut mord — la
zone la plus susceptible d'accueillir une collision, pas la moins. Cette
confusion entre les deux méthodes de mappage a coûté un aller-retour dans ce
cycle : la table de référence du §2 de `docs/DESIGN-SYSTEM.md` supposait un
écrêtage canal par canal, l'implémentation appliquait une réduction de
chroma — les deux méthodes divergent dès qu'un jeton déborde le gamut, ce qui
a fait passer un écart réel de 0,0995 (sous le plancher de 0,10) pour
conforme tant qu'il était calculé sur la mauvaise hypothèse de mappage.

### 7. La marge de conception : ΔL ≥ 0,12 sur les valeurs nominales

Le plancher dur du §5 (0,10) porte sur les valeurs **effectives**, après
arrondi en hexadécimal 8 bits. La conception vise **0,12** sur les
paramètres **nominaux**, avant cet arrondi.

Motif mesuré : la dérive d'arrondi sur 8 bits atteint **0,0016** au pire cas
sur les jetons livrés. La marge de 0,02 (entre 0,12 nominal et 0,10 effectif)
vaut **treize fois** cette dérive — large sous tout scénario, y compris une
dérive combinée défavorable sur deux jetons à la fois.

**Une règle satisfaite exactement à sa borne est décidée par l'arrondi, pas
par la conception.** C'est arrivé une fois dans ce cycle : un écart mesuré à
**0,0995** pour un seuil dur de 0,10 — sous la borne à cause, précisément, de
la confusion de mappage du §6, pas d'un défaut de marge. La marge de
conception existe pour qu'un tel cas ne se reproduise plus une fois la bonne
méthode de mappage appliquée partout.

## Alternatives considérées

- **Assombrissement mécanique du thème sombre pour obtenir le thème clair**,
  sans reconstruction à L/C constants. Écartée : écart d'intensité perçue de
  0,165 entre agents (§1), contre 0,035 une fois reconstruit — l'écart
  donnait l'illusion d'une hiérarchie entre agents qui n'existe pas.
- **Appliquer la méthode catégorielle (L/C constants) aux jetons
  sémantiques**, pour une seule méthode de génération dans toute la feuille.
  Écartée (§4) : les jetons sémantiques portent une gravité, donc un ordre,
  incompatible avec une méthode « sans ordre ni grandeur » ; mesurée non
  conforme (quatre jetons à moins de 6° d'une teinte d'agent, un couple au
  même hexadécimal).
- **Plancher de séparation « ΔL ≥ 0,08 OU ΔC ≥ 0,03 »**, proposée comme
  alternative plus permissive au plancher ΔE unique du §5. Écartée et
  **mesurée** : sa branche intensité (ΔC) vaut **0,019** sur le couple
  litigieux, soit **plus serré** qu'un couple par ailleurs relevé comme
  collision réelle (0,028) — la règle aurait laissé passer une confusion
  qu'elle prétendait détecter. Elle évitait l'identité stricte entre deux
  jetons, pas la confusion perceptuelle que le plancher ΔE vise réellement.
  Sans ce chiffre consigné ici, cette règle sera reproposée comme si elle
  n'avait jamais été jugée.
- **Écrêtage canal par canal** comme méthode de mappage de gamut, par
  cohérence avec des implémentations CSS courantes. Écartée (§6) : déplace
  la clarté perçue et casse la constante d'une palette catégorielle
  exactement là où le gamut mord — coût déjà payé une fois dans ce cycle
  sous forme d'un écart tombé à 0,0995 le temps que la confusion soit
  identifiée.

## Conséquences

### Positives

- Une palette catégorielle homogène : écart d'intensité perçue entre agents
  ramené de 0,165 à 0,035 (§1).
- Deux familles de jetons dont la nature (catégorielle vs. gravité) ne peut
  plus être confondue silencieusement : un plancher perceptuel mesurable
  (ΔE ≥ 0,10, §5) sépare les deux, calculé sur ce qui est réellement peint.
- Une marge de conception (0,12 nominal pour 0,10 effectif) qui absorbe treize
  fois la dérive d'arrondi connue — une règle qui ne se joue plus à l'arrondi
  près.
- Une méthode de mappage de gamut unique et écrite (réduction d'intensité à
  clarté et teinte conservées), qui évite la classe d'erreur qui a coûté un
  aller-retour dans ce cycle.

### Négatives

- Le cercle de teintes est **saturé** pour les rôles catégoriels avec la
  règle des 35° : 220° et 336° étaient les deux derniers angles libres, un
  neuvième rôle teinté n'entre pas sans rouvrir la méthode (§2).
- Toute future divergence entre la table de référence documentaire et le
  mappage de gamut réellement implémenté redevient possible si l'une des
  deux évolue sans l'autre — la classe de bug du §6 n'est pas structurellement
  interdite, seulement documentée et couverte par test.
- Le plancher ΔE ≥ 0,10 contraint tout futur ajustement des jetons
  sémantiques : un changement de gravité (nouvelle couleur d'alerte, par
  exemple) doit revérifier son écart contre les neuf teintes d'identité, dans
  les deux thèmes.

### Ce que ça verrouille

- **Toute palette catégorielle future** (agents ou toute autre entité « sans
  ordre ni grandeur ») suit la méthode du §1 : L et C constants, H seul
  varie, angles à ≥ 35° d'écart.
- **Aucun neuvième rôle teinté** sans rouvrir explicitement la méthode
  (élargissement du gamut cible, resserrement du pas minimal, ou tolérance
  à moins de 35°) — décision qui appellerait son propre ADR.
- **Le neutre achromatique reste le seul repli** pour un type d'agent sans
  teinte assignée ; aucune teinte d'agent n'est recyclée pour un rôle
  inconnu.
- **Les jetons sémantiques et les jetons d'identité restent deux familles
  distinctes**, jamais engendrées par la même méthode, tenues à ΔE ≥ 0,10
  l'une de l'autre après mappage de gamut réel — dans les deux thèmes, pour
  tout ajout futur des deux côtés.
- **Le mappage de gamut est une réduction d'intensité à clarté et teinte
  conservées**, jamais un écrêtage canal par canal — toute documentation ou
  implémentation future de la génération de palette doit s'y tenir.

## Références

- Code : `control-center/web/app.css` (bloc `:root`, littéraux
  `--clair-*`/`--sombre-*`, commentaires de méthode en tête de fichier).
- Design system : `docs/DESIGN-SYSTEM.md` §2 (méthode de la palette
  catégorielle, tableau des teintes), §8 (règle de précédence
  identité/gravité, posée mais pas encore appliquée — voir `feature-016`).
- Tests : `control-center/web/test_app_theme.js` / `.py` (cas `E3b`/`E3c` —
  écart perceptuel entre familles, dans les deux thèmes ; cas
  `E_conception_*_marge_nominale_0_12` — marge de conception sur valeurs
  nominales ; cas `E_conception_derive_arrondi_sous_controle` — dérive
  d'arrondi mesurée sur 20 jetons), `control-center/web/test_app_theme_navigateur.py`
  (vérification par exécution, Chromium réel, des couleurs réellement
  peintes).
- Specs : `specs/features/doing/feature-015-socle-de-theme-et-identite-des-agents.md`
  (note d'implémentation du 2026-09-15 — mesures d'origine ; notes techniques
  du `test-engineer`, deux passes — bug E3c trouvé puis corrigé, validation
  par mutation).
