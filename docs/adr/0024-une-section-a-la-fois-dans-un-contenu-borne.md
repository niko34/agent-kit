# ADR-0024 — Une section à la fois, dans un contenu borné

## Statut

Accepté

## Date

2026-09-15

## Contexte

`docs/DESIGN-SYSTEM.md` fixe, depuis le 2026-09-14, les surfaces (§3) et la
typographie (§4) du centre de contrôle. Personne ne les avait appliquées à
l'écran existant : mesuré en tête de `feature-019`, la feuille comptait
**31** usages de la pile à chasse fixe contre **2** de la pile sans-serif, et
**5** usages d'une quatrième surface (`--surface-2`) que le §3 disait pourtant
limiter à trois niveaux « jamais plus ».

L'écran lui-même ne ressemblait plus aux maquettes qui avaient fondé le
design system : barre supérieure, colonne latérale ne portant que deux blocs,
et six autres blocs empilés dans une seule colonne centrale, sans hiérarchie
de titres ni largeur bornée. Les cycles précédents (`feature-015` : jetons et
thèmes ; `feature-016` : liste des cycles en accordéon) avaient travaillé
**à l'intérieur** de cette mise en page héritée — la corriger n'était le
périmètre d'aucun des deux.

L'utilisateur a tranché la structure le 2026-09-15 : une colonne de
navigation étroite, plus une page centrée n'affichant qu'une section à la
fois — la structure de l'outil qui a servi de référence visuelle au design
system.

## Décision

### 1. Colonne de navigation étroite, contenu borné, une section à la fois

`control-center/web/index.html:94-107` porte `<nav class="nav-sections"
role="tablist">`, une liste fermée de six boutons (`role="tab"`) qui **ne
contient aucun contenu** — elle sélectionne une section, elle ne l'affiche
pas. `control-center/web/app.css:397-421` la fixe à 200 px, collante sous la
barre, et distincte du contenu par un filet (`border-right`), jamais un
aplat.

Le contenu (`.contenu > .section`, `app.css:427-428`) est borné à 880 px et
centré. Chaque section s'ouvre sur un fil d'Ariane (`.fil-ariane`) et un
titre (`<h1 class="section-titre">`, focusable), et une seule section n'est
jamais masquée : `hidden` est posé **statiquement** dans le HTML servi pour
toutes les sections sauf la section par défaut, et c'est le **seul**
mécanisme de masquage (`app.css:431-449`, `.section[hidden] { display:
none }`, commenté en détail — un défaut de spécificité CSS qui contournait
cette garde a été trouvé et corrigé en revue avant livraison).

**Ce que cela contraint pour tout écran futur** : un nouveau bloc n'a que
deux places possibles — rejoindre une des six sections existantes, ou en
ouvrir une septième derrière un nouvel onglet de la colonne. L'empilement
libre dans une colonne centrale, tel qu'il existait avant ce cycle, cesse
d'être une option ; la colonne de navigation reste par construction sans
contenu propre.

### 2. Alternatives écartées

- **L'empilement actuel** (six blocs les uns sous les autres, toujours tous
  visibles). Écartée : c'est l'état qui a motivé ce cycle — aucune hiérarchie
  de lecture, largeur non bornée, densité uniforme du premier au dernier
  bloc.
- **Des onglets horizontaux** (bande de boutons en haut de page). Écartés :
  ils auraient dupliqué la fonction de la barre supérieure existante et ne
  correspondaient pas à la référence visuelle retenue par l'utilisateur —
  une colonne, pas une bande. Le motif ARIA `tablist`/`tab`/`tabpanel` est
  malgré tout repris pour la sémantique clavier (un seul arrêt de
  tabulation, flèches pour parcourir, `aria-selected` sur l'élément actif) :
  c'est le vocabulaire d'accessibilité le mieux outillé pour « un seul
  panneau actif parmi plusieurs », indépendamment de sa disposition visuelle
  en colonne.
- **La navigation par ancres** (`#section-x` dans l'URL). Écartée : une
  arrivée sur la page **sans fragment** — le cas le plus courant — n'aurait
  désigné aucune section par défaut, laissant un état vide à l'arrivée sans
  logique supplémentaire pour le combler. Le choix retenu (section par
  défaut posée statiquement dans le HTML servi) n'a pas ce trou.

### 3. Absorption de `bug-016`, au titre d'ADR-0017

Ce cycle applique la typographie du §4 du design system, qui **s'appuie** sur
les jetons de texte (`--texte`, `--texte-doux`, `--texte-faible`). Le jeton
`--texte-faible` était mesuré à 3,55:1 sur `--surface-2` en thème sombre et
4,24:1 sur `--fond` — sous le seuil de 4,5:1 que le §8 du design system exige
pour du texte (`bug-016`).

Livrer une hiérarchie typographique appuyée sur un jeton dont on savait déjà
qu'il ne tenait pas son propre critère d'accessibilité revient à annoncer une
règle acquise qui ne l'est pas. C'est exactement le schéma que couvre
[ADR-0017](0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md) :
un défaut qui désarme la garde que le cycle livre entre dans ce cycle, avant
elle. `bug-016` a donc été absorbé, traité dans le même diff, avec une seule
phase de test, de revue et de documentation.

`--texte-faible` et `--texte-doux` sont relevés et mesurés contre les quatre
surfaces (`--fond`, `--surface`, `--surface-2`, `--creux`), dans les deux
thèmes ; le pire cas mesuré après correction (thème sombre, `--texte-faible`
contre `--surface-2`) tient 4,77:1.

### 4. Amendement du §3 du design system

En construisant la colonne de navigation, ce cycle a dû choisir un traitement
pour le survol et la sélection d'un onglet. Reprendre `--surface-2` pour un
**état d'interaction** (survol, sélection) sur un élément déjà délimité par
un filet ne contredit pas l'esprit du §3 — ce n'est pas un niveau de repos
supplémentaire, c'est une teinte réactive au geste.

Or `--surface-2` existait déjà avant ce cycle, avec **5 usages mesurés**, et
le §3 disait « trois niveaux, jamais plus » sans que ce quatrième jeton n'ait
jamais été retiré ni le texte amendé — une divergence entre le document et le
code antérieure à `feature-019`. Sur les cinq, **trois** étaient des aplats
de repos (bandeau, carte, maillon) : la violation littérale du §3. Ils ont
migré vers `--surface`. Les **deux** restants étaient déjà des états
(sélection du bouton de thème, survol d'un cycle) — cohérents avec la lecture
retenue ici.

Le §3 est donc amendé : trois niveaux **structurels**, plus une teinte
d'interaction (`--surface-2`) réservée au survol et à la sélection d'un
élément déjà délimité par un filet, jamais utilisée comme aplat de repos.
Texte complet dans `docs/DESIGN-SYSTEM.md` §3.

### 5. La règle de marge : toute borne numérique se pose avec une marge chiffrée

Une première valeur candidate pour `--texte-faible` (thème sombre),
`#838e97`, donnait un contraste nominal de **4,5039:1** contre `--fond` —
au-dessus du seuil de 4,5:1. Recalculé après arrondi de la valeur sur 8 bits
(l'arrondi que l'écran applique réellement à l'affichage), ce même contraste
retombait à **4,4454:1** : sous le seuil, alors que le calcul nominal le
disait tenu.

Sur la plage de gris concernée, un bit d'arrondi vaut **0,0585 de ratio de
contraste**. Une borne posée à 4,50 exactement se joue donc sur un dixième de
bit — elle est décidée par l'arrondi, pas par la conception. La marge
retenue pour ce cycle est de **2,5 bits**, soit un contraste **nominal ≥
4,65** pour tout jeton de texte visant le seuil dur de 4,5:1. La valeur
finalement retenue pour `--texte-faible` en thème sombre tient 4,77:1
nominal — au-dessus de cette marge, pas seulement du seuil.

Cette règle généralise la marge de conception déjà posée par
[ADR-0022](0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md) §7
pour le plancher perceptuel entre jetons sémantiques et jetons d'identité
(ΔL ≥ 0,12 nominal pour un plancher dur de 0,10) : toute borne numérique de ce
projet — contraste, écart perceptuel, ou toute future mesure — se pose avec
une marge **chiffrée et justifiée**, jamais au ras de sa valeur seuil.

## Alternatives considérées

Voir §2 ci-dessus pour la structure de navigation. Pour la marge du §5, la
seule alternative examinée était de garder le seuil dur (4,5:1) comme cible
de conception directe, sans marge séparée — écartée par la mesure elle-même :
c'est précisément cette pratique qui a laissé passer `#838e97` comme
« conforme » avant l'arrondi.

## Conséquences

### Positives

- Un vocabulaire de navigation unique et fermé (six sections, une colonne qui
  ne porte aucun contenu) — plus d'empilement à hiérarchie ambiguë.
- `bug-016` fermé dans le même cycle que la règle qui en dépendait, au lieu
  d'annoncer une hiérarchie typographique acquise sur un jeton défaillant.
- Le §3 du design system redevient conforme au code qu'il décrit — il ne
  l'était déjà plus avant ce cycle.
- Une règle de marge numérique explicite, réutilisable pour toute future
  borne de contraste ou de seuil du projet.

### Négatives

- Le motif ARIA `tablist` impose une discipline stricte (un seul arrêt de
  tabulation, `aria-selected`, flèches de parcours) que tout ajout de section
  future doit reproduire à l'identique, sous peine de rompre la navigation
  clavier.
- La marge de 2,5 bits (nominal ≥ 4,65 pour un seuil dur de 4,5:1) resserre
  l'espace disponible pour choisir de nouveaux jetons de texte faibles —
  toute palette future doit viser plus haut que le strict minimum
  réglementaire.

### Ce que ça verrouille

- Tout écran futur du centre de contrôle passe par une section de la colonne
  de navigation ; la colonne elle-même reste sans contenu propre.
- `--surface-2` reste réservé à un état d'interaction sur un élément déjà
  délimité par un filet — jamais un aplat de repos. Un futur usage en aplat
  redevient la violation que ce cycle a corrigée.
- Toute borne numérique posée sur ce projet (contraste, écart perceptuel, ou
  toute mesure future comparable) se documente avec sa marge chiffrée, pas
  seulement sa valeur seuil.

## Références

- Code : `control-center/web/index.html:87-215` (colonne de navigation,
  six sections) ; `control-center/web/app.css:397-421` (`.nav-sections`,
  `.nav-onglet`), `:427-449` (`.contenu`, `.section`, garde de masquage
  unique), `:456-467` (repli à 600 px).
- Design system : `docs/DESIGN-SYSTEM.md` §3 (surfaces, amendé), §4
  (typographie), §8 (seuils d'accessibilité).
- ADR : [ADR-0017](0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md)
  (critère d'absorption appliqué à `bug-016`) ; [ADR-0022](0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md)
  §7 (précédent de la marge de conception, généralisé ici).
- Specs : `specs/features/doing/feature-019-langage-visuel-navigation-et-page-centree.md`,
  `specs/features/doing/bug-016-texte-faible-sous-le-seuil-de-contraste.md`
  (absorbée).
