# Design system — centre de contrôle

Ce document tient les **règles et leurs motifs**. Il ne tient pas les valeurs.

Les valeurs vivent à un seul endroit, `control-center/web/app.css`, dans le bloc
`:root` : chaque couleur y apparaît **une fois** et nulle part ailleurs dans la
feuille. C'est déjà le cas aujourd'hui — treize littéraux, treize variables — et
c'est la propriété à préserver. Un document qui recopierait les hexadécimaux
deviendrait faux au premier ajustement ; celui-ci cite des **noms de jetons** et
la **méthode** qui les engendre.

> Public visé : l'agent `ux-ui-designer`, qui doit arbitrer sans réinventer, et
> `frontend-developer`, qui implémente sans ré-arbitrer.

---

## 1. Parti pris

Outil de développeur, pas tableau de bord d'entreprise. Forte densité, peu de
couleur, aucune animation décorative. La couleur est un **signal**, pas une
décoration : elle sert l'identité d'un agent, un état qui demande une décision,
ou rien.

Trois conséquences qui s'appliquent partout :

- **Zéro ressource distante.** La CSP du serveur n'autorise que `'self'` : pas de
  police Google, pas de CDN, pas d'icône téléchargée. Les piles de polices sont
  celles du système. Voir ADR-0006.
- **Zéro dépendance.** Pas de préprocesseur, pas de framework CSS. Les jetons
  sont des variables CSS natives.
- **Pas de graphique par bibliothèque.** Les visualisations sont du SVG écrit à
  la main, engendré depuis les données.

---

## 2. Deux thèmes, une seule palette

Le centre de contrôle propose un thème **clair** et un thème **sombre**. Ce ne
sont pas deux designs : ce sont **deux clartés d'une même palette**. Les teintes
— l'angle de couleur — sont identiques dans les deux. `debugger` est ambre dans
les deux thèmes ; seule sa clarté change.

C'est ce qui rend les deux thèmes tenables : la maintenance porte sur un jeu de
variables, pas sur un second système.

### La méthode qui engendre la palette

Une palette **catégorielle** — une couleur par agent, sans ordre ni grandeur —
se construit à **clarté et intensité constantes**, en ne faisant varier que la
teinte. Toute autre méthode produit une palette où certains agents crient et
d'autres chuchotent, ce qui laisse croire à une hiérarchie qui n'existe pas.

Mesuré sur ce projet : en assombrissant mécaniquement les couleurs du thème
sombre pour le thème clair, l'écart d'intensité perçue entre le plus coloré et
le moins coloré atteignait **0,165**. En reconstruisant à clarté et intensité
constantes, il tombe à **0,035** — près de cinq fois plus homogène.

Paramètres de génération, en OKLCH :

| Rôle | Teinte (H) |
|---|---|
| `spec-reader` | 264° |
| `debugger` | 80° |
| `test-engineer` | 300° |
| `frontend-developer` | 130° |
| `code-reviewer` | 31° |
| `security-reviewer` | 177° |
| `backend-developer` | 220° |
| `doc-writer` | 336° |

| Usage | Thème sombre | Thème clair |
|---|---|---|
| Trait, sigle, graduations | L 0,75 · C 0,13 | L 0,415 · C 0,152 |
| Remplissage du cercle | L 0,22 mêlé au fond | L 0,885 · C 0,082 |

Quatre teintes — `debugger` (80°), `frontend-developer` (130°),
`security-reviewer` (177°) et `backend-developer` (220°) — n'atteignent pas
l'intensité visée pour le trait, le sigle et les graduations dans le thème
clair : l'écran ne sait pas les afficher plus vives à cette clarté. C'est une
limite de gamut, pas un réglage à corriger.

**Pour ajouter un agent** : choisir un angle de teinte à au moins 35° de tous
les autres, puis appliquer les L et C du tableau. Ne jamais choisir une couleur
à l'œil, et ne jamais reprendre un hexadécimal trouvé ailleurs.

Avec ces huit rôles, la règle des 35° a **saturé** le cercle : `backend-developer`
(220°) et `doc-writer` (336°) occupaient les deux seuls angles encore libres à
au moins 35° de tous les autres. **Un neuvième rôle teinté est aujourd'hui
impossible** sans rouvrir la méthode elle-même (voir
[ADR-0022](adr/0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md)).

### Jetons sémantiques : une autre famille, un plancher qui les sépare

Les jetons sémantiques (`--accent`, `--actif`, `--alerte`, `--echec`) portent
une **gravité**, donc un ordre — ce que la méthode catégorielle ci-dessus
exclut par construction (« sans ordre ni grandeur »). Ils ne suivent **pas**
le tableau L/C de cette section ; ils sont engendrés sur leur propre axe.

Quatre règles, détaillées avec leurs chiffres dans
[ADR-0022](adr/0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md),
tiennent les deux familles séparées :

- **Plancher de séparation** : écart perceptuel ΔE (OKLab) **≥ 0,10** entre
  tout jeton sémantique et tout jeton d'identité, dans les deux thèmes,
  calculé sur les couleurs **effectivement peintes** — après mappage de
  gamut, jamais sur les paramètres nominaux.
- **Repli achromatique** : un type d'agent sans teinte assignée (l'ensemble
  des types est ouvert) reçoit `--a-neutre` / `--f-neutre`, jamais une teinte
  d'agent recyclée.
- **Méthode de mappage de gamut** : réduire l'**intensité**, à clarté et
  teinte conservées ; jamais un écrêtage canal par canal, qui déplace la
  clarté et casse la constante de la palette catégorielle.
- **Marge de conception** : viser ΔL ≥ 0,12 sur les paramètres nominaux,
  pour tenir le plancher dur de 0,10 une fois l'arrondi hexadécimal appliqué.

### Contrastes tenus

| | Thème sombre | Thème clair |
|---|---|---|
| Couleur d'agent contre son fond | 7,8:1 en moyenne | 8,0:1 en moyenne |
| Sigle contre son propre remplissage | ≥ 4,4:1 | ≥ 5,3:1 |
| Texte courant contre le fond | ≥ 9:1 | ≥ 10:1 |

Le minimum absolu est **4,5:1** pour tout texte et **3:1** pour un trait
porteur de sens. Une couleur qui n'y arrive pas ne rentre pas dans la palette.

---

## 3. Surfaces

*Appliqué par `feature-019` (colonne de navigation, contenu borné) — voir
[ADR-0024](adr/0024-une-section-a-la-fois-dans-un-contenu-borne.md).*

Trois niveaux **structurels**, jamais plus, dans les deux thèmes :

| Jeton | Rôle |
|---|---|
| `--fond` | la page |
| `--surface` | un panneau, une carte, une ligne dépliée |
| `--creux` | la zone du diagramme, une bande de temps mort |

L'écart entre deux niveaux est **volontairement faible** — de l'ordre de 1,1:1.
Ce n'est pas le fond qui délimite un bloc, c'est son **filet** (`--trait`). Un
bloc qui aurait besoin d'un aplat plus marqué pour se distinguer est un bloc mal
placé.

Un quatrième jeton, `--surface-2`, est une **teinte d'interaction** — pas un
niveau de repos. Il est réservé au survol et à la sélection d'un élément
**déjà délimité par un filet** (un onglet de navigation, une entrée de liste,
un bouton de bascule) : jamais un aplat de repos. Amendement posé par
`feature-019` — le document disait « trois niveaux, jamais plus » alors que le
code servait déjà ce quatrième jeton depuis avant l'écriture de cette règle.
Sur ses cinq usages mesurés à l'entrée du cycle, trois étaient des aplats de
repos (violation littérale de la règle d'origine) et ont migré vers
`--surface` ; les deux restants étaient déjà des états et sont restés sur
`--surface-2`.

**Le diagramme est sur `--creux` dans les deux thèmes.** C'est ce qui donne son
unité à la zone. Le passer au blanc dans le thème clair efface la frontière
entre le document et la mesure — essayé, rejeté.

Une règle qui a été envisagée puis **abandonnée** : faire du diagramme un
canevas sombre invariant, inséré dans une page claire. Cela fonctionnait, mais
imposait un mélange clair/sombre dans la même page et interdisait d'afficher
plusieurs diagrammes sans zébrer l'écran.

---

## 4. Typographie

*Appliqué par `feature-019` — voir
[ADR-0024](adr/0024-une-section-a-la-fois-dans-un-contenu-borne.md). Entrée du
cycle : **31** usages de la pile à chasse fixe contre **2** de la pile
sans-serif. Sortie : **16** contre **18**, mesuré par
`grep -c 'var(--mono)' / 'var(--sans)'` sur `app.css` — chaque usage résiduel
de `--mono` porte un identifiant technique (chemin, sigle, code).*

| Usage | Taille | Graisse |
|---|---|---|
| Titre de page | 27 px | 700 |
| Titre de section | 18 px | 600 |
| Texte courant, table | 13,5–15 px | 400 |
| Étiquette secondaire | 11–12,5 px | 400 |
| Chiffre mis en avant (durée) | 12,5–17 px | 300–400 |

- Pile **système** uniquement (`--sans`, `--mono`). Aucune police distante.
- **Chiffres à chasse fixe** (`font-variant-numeric: tabular-nums`) partout où
  des nombres se lisent en colonne — tables, socles du diagramme, propriétés.
  Sans cela, deux durées superposées ne s'alignent pas et ne se comparent plus.
- Le **monospace** est réservé aux identifiants techniques : chemins, sigles,
  codes. Pas aux libellés d'interface.

---

## 5. Le diagramme de déroulé

C'est le composant le plus spécifique du centre de contrôle. Sa grammaire est
fixée ; ne pas la changer sans ADR.

### Ce que chaque forme encode

Grammaire alignée sur la maquette de référence par `feature-020`
(`control-center/maquettes/2026-09-15-diagramme-reference.html` — voir
avertissement plus bas) ; les échelles du rayon, des graduations, du liseré
et le rendu du zéro / du plafond sont fixés par
[ADR-0026](adr/0026-trois-echelles-du-diagramme-alignees-sur-la-maquette.md),
qui remplace `ADR-0025 §1` sur ces quatre points.

| Forme | Donnée |
|---|---|
| Diamètre du cercle | durée de l'agent — `11 + 0,80·√(durée_s)`, plafonné à 56 px |
| Graduations autour du cercle | nombre d'appels d'outils — 24, 36 ou 52 graduations selon le rayon (seuils à 22 et 32 px), pas une formule continue |
| Longueur de graduation | **allumée** (7 px) contre **éteinte** (3,2 px) — la longueur distingue l'état de la graduation, plus ses bornes (zéro, plafond) |
| Liseré intérieur | nombre de fichiers écrits, encodé par **opacité** (`0,22 + min(f,8)/8 × 0,45`), à épaisseur constante 1 px |
| Zéro appel d'outil | deux barres superposées en haut du cercle (blanche, puis grise par-dessus) |
| Croix + contour `--alerte` | échec |
| Pointillé sur le contour du cercle | **seul** motif restant sur ce contour — état « sans clôture » ; l'échec ne le porte plus (voir §8, vocabulaire des traits) |

Le plafond de l'échelle et le remplissage à pleine échelle (anciennement
« anneau fantôme », « cran épais ») n'ont **plus de rendu visuel** depuis
`feature-020` : l'information (`plafondAtteint`) reste disponible dans
l'infobulle du cercle (`<title>`), pas dans son tracé — la maquette de
référence ne les dessine pas non plus.

**Les jetons ne sont pas mesurés.** Le journal d'événements ne les contient pas ;
il porte l'horodatage, l'outil, le fichier et l'échec. Toute maquette qui affiche
un nombre de jetons invente une donnée. Les récupérer supposerait de lire les
transcriptions de session — décision à part entière, non prise.

⚠️ La maquette de référence citée ci-dessus (`control-center/maquettes/`)
**n'est pas suivie par git** : le chemin résout en local mais casse sur tout
autre poste ou après un clone. Ce n'est pas un lien de doc vérifiable par
`tools/check_doc_links.sh`.

### Placement

**L'écart horizontal ne mesure pas le temps.** Il sert la lisibilité. Chaque
agent réclame la demi-largeur du plus exigeant entre son cercle avec ses
graduations et le plus long de ses trois libellés. Un gros cercle s'écarte donc
davantage — un petit cercle au nom long aussi.

Une échelle de temps a été essayée puis abandonnée : deux agents séparés de
38 secondes se retrouvaient à 14 pixels l'un de l'autre, et aucune largeur de
zone ne les séparait. Le temps se **lit** sous chaque cercle — heure de départ,
puis durée, puis nom — il ne se mesure plus en distance.

L'attente entre deux agents s'écrit dans une **pastille posée sur le lien**
au-delà de deux minutes, et la place lui est réservée dans le calcul.

### Agents simultanés

Ils occupent **un seul créneau horizontal** et s'empilent **verticalement**, dans
un cadre au filet discret — même fond que le diagramme, jamais d'aplat. Leurs
libellés passent à droite du cercle, pas en dessous, faute de quoi trois agents
empilés dépasseraient six cents pixels de haut.

Le cycle avance d'un cran quel que soit le nombre d'agents du créneau. C'est ce
que la disposition en deux couloirs n'arrivait pas à dire.

**À surveiller** : la hauteur du bloc est dictée par le plus grand groupe.
Au-delà de quatre agents simultanés, replier la pile (« +3 ») plutôt que laisser
le bloc grandir.

### Rebouclage

Un arc pointillé, de **couleur fixe** (`--rebouclage`, alias de
`--a-debugger` quel que soit le thème), relie une reprise à **l'occurrence
précédente du même agent** — pas à un agent arbitraire. Il ne porte **aucune
pointe de direction** (aligné sur la maquette de référence, `feature-020` ;
auparavant l'arc portait une pointe et une couleur d'identité, corrigés ici).

---

## 6. Liste des cycles

Un seul cycle est déplié à la fois. Le dernier cycle est ouvert par défaut. En
choisir un autre referme le précédent — un seul diagramme visible à l'écran,
jamais deux.

La zone du diagramme **défile horizontalement** quand le tracé dépasse la
largeur ; elle ne se comprime pas. Molette seule = la page ; `Maj` + molette ou
glisser = la zone. La zone prend le focus clavier et se parcourt aux flèches.

---

## 7. Bascule de thème

Trois états, pas deux : **clair**, **sombre**, **système**. « Système » est le
défaut et suit `prefers-color-scheme`.

- Le choix explicite pose `data-theme="clair"` ou `data-theme="sombre"` sur
  `<html>` ; « système » ne pose rien.
- Les jetons se définissent donc **trois fois** : sur `:root` nu, sous
  `@media (prefers-color-scheme: dark)` protégé par `:root:not([data-theme="clair"])`,
  et sous `:root[data-theme="sombre"]`. Sans la troisième, la bascule ne gagne
  pas contre la préférence système.
- Le choix persiste dans `localStorage`, et sa lecture se fait **avant le premier
  rendu**, sinon la page clignote dans le mauvais thème.
- `localStorage` peut échouer (fenêtre privée, données bloquées) : toute lecture
  et toute écriture sont protégées, et la page s'affiche correctement sans.
- La commande est en haut à droite, trois positions, une icône par position.

### « Système » doit annoncer où il aboutit

Deux des trois positions donnent **le même écran** la plupart du temps : « clair »
et « système » sont indiscernables tant que l'OS est en clair. Un contrôle dont
deux positions se ressemblent ne s'explique pas tout seul — constaté à l'usage
sur la première maquette.

La position « système » affiche donc **l'apparence à laquelle elle aboutit en ce
moment** : son icône suit le thème résolu, et son libellé accessible le nomme —
« Suivre le système (actuellement sombre) ». Les deux autres positions gardent un
libellé fixe.

Deux solutions ont été écartées : descendre à deux positions, qui rend le
contrôle évident mais fait perdre le suivi automatique jour/nuit — précieux pour
un outil utilisé tard ; et un bouton unique qui cycle, qui rend l'état courant
encore moins lisible.

---

## 8. Accessibilité

- Contraste minimal : **4,5:1** pour le texte, **3:1** pour un trait porteur de
  sens. Vérifié à chaque ajout de couleur, pas à la fin. **Marge de
  conception : viser un contraste nominal ≥ 4,65:1**, pas 4,5:1 pile — un
  bit d'arrondi sur 8 bits vaut jusqu'à 0,0585 de ratio sur la plage
  concernée, et une valeur conçue exactement au seuil peut retomber sous lui
  une fois arrondie (constaté, voir
  [ADR-0024](adr/0024-une-section-a-la-fois-dans-un-contenu-borne.md)).
- `--texte-faible` et `--texte-doux` étaient **sous le seuil** en thème
  sombre avant `feature-019` (`bug-016`) : `--texte-faible` ne tenait que
  4,24:1 contre `--fond` et 3,55:1 contre `--surface-2`. Les deux jetons sont
  désormais mesurés contre les **quatre** surfaces (`--fond`, `--surface`,
  `--surface-2`, `--creux`), dans les deux thèmes ; le pire cas retenu
  (thème sombre, `--texte-faible` contre `--surface-2`) tient 4,77:1.
- **Aucune information portée par la seule couleur.** Un échec se signale par la
  couleur *et* une croix *et* un contour `--alerte`. Un agent en cours par la
  couleur (contour, exception nommée ci-dessous) *et* un anneau supplémentaire
  *et* la graisse de la durée sur son socle.
- Focus visible sur tout élément atteignable au clavier, y compris la zone qui
  défile.
- `prefers-reduced-motion` respecté : aucune transition supérieure à 150 ms, et
  rien qui bouge en continu.
- Les sigles à deux lettres sont **distincts entre eux** : `spec-reader` = `SP`,
  `security-reviewer` = `SE`. Deux agents ne peuvent pas partager un sigle.
- **Règle de précédence entre les deux familles de jetons** (posée par
  `ux-ui-designer`) : **l'identité prend le texte et le sigle, l'état prend
  le contour et la forme.** Sur un même élément (une entrée d'accordéon, une
  ligne de liste), la couleur d'agent reste réservée au texte et au sigle
  qui portent son identité ; un état (en cours, échec, divergence) se lit
  dans le contour et la forme — jamais en recolorant le texte d'une couleur
  sémantique par-dessus une couleur d'identité. **Appliquée par
  `feature-016`** dans la liste des cycles en accordéon et sa table des
  passages d'agent.

  **Exception nommée, posée par `feature-020` (2026-09-19)** : sur le
  **cercle du diagramme de déroulé**, l'état « en cours » va à l'encontre de
  cette règle — le contour prend la couleur d'**identité** de l'agent (pas
  une couleur sémantique), assumé parce que la maquette de référence le fait
  ainsi. La règle de précédence continue de valoir **partout ailleurs**
  (accordéon, table des passages, tout élément hors du cercle du diagramme) ;
  seul le contour du cercle en cours y déroge.

- **Vocabulaire des traits sur le cercle du diagramme**, réduit à un seul
  motif ambigu résolu par `feature-020` : **pointillé** = état « sans
  clôture » (`sans_cloture`, bug-013), et c'est désormais le **seul** motif
  restant sur ce contour — l'agent principal ne porte plus de tirets (il se
  distingue par son fond et son sigle « AP », voir `docs/features/page-centre-de-controle.md`)
  et l'échec ne porte plus de pointillé (il se signale par la croix et le
  contour `--alerte` seuls, voir §5).
- **Vocabulaire des traits ailleurs sur l'écran** (accordéon, table des
  passages — inchangé depuis `feature-016`) :
  - **bordure pleine en pointillé** = état « sans clôture » (`sans_cloture`,
    bug-013) ;
  - **bordure pleine en tirets** = rôle « agent principal » (`AGENT_PRINCIPAL`) ;
  - **bordure gauche en tirets** = liseré de rebouclage (reprise du même
    agent).
  Les trois motifs ne se substituent jamais l'un à l'autre : un élément peut
  cumuler un état et un rôle, jamais fusionner leurs traits en un seul motif
  ambigu.

---

## 9. Interdits

- ❌ Un hexadécimal ailleurs que dans le bloc `:root` de `app.css`
- ❌ Une couleur choisie à l'œil plutôt qu'engendrée par la méthode du §2
- ❌ Une ressource distante, quelle qu'elle soit
- ❌ Une bibliothèque de graphiques
- ❌ Un aplat de fond pour délimiter un bloc là où un filet suffit
- ❌ Une information portée par la seule couleur
- ❌ Un chiffre affiché qui n'est pas dans le journal d'événements

---

## 10. Faire évoluer ce système

| Changement | Ce qu'il faut |
|---|---|
| Ajouter un agent, donc une teinte | appliquer le §2, mettre à jour le tableau des teintes |
| Ajuster une clarté ou une intensité | modifier `app.css` et le tableau du §2, dans le même commit |
| Changer ce qu'encode une forme du diagramme | **ADR** — c'est la grammaire de lecture |
| Abandonner un thème, ou en ajouter un | **ADR** |
| Introduire une dépendance ou une ressource distante | **ADR**, contre ADR-0006 |

---

## Décisions consignées

| Date | Décision |
|---|---|
| 2026-09-14 | Deux thèmes partageant les mêmes teintes ; la clarté seule distingue |
| 2026-09-14 | Palette catégorielle engendrée à clarté et intensité constantes |
| 2026-09-14 | Canevas sombre invariant dans une page claire : **rejeté** |
| 2026-09-15 | L'écart horizontal du diagramme ne mesure plus le temps |
| 2026-09-15 | Agents simultanés empilés verticalement dans un créneau unique |
| 2026-09-15 | Le diagramme est sur `--creux`, jamais sur un fond qui lui est propre |
| 2026-09-15 | Trois positions de thème, dont « système » qui annonce sa résolution |
| 2026-09-15 | Huit rôles teintés : `backend-developer` (220°) et `doc-writer` (336°) ajoutés au tableau des teintes du §2, dernier angle libre à ≥ 35° saturé |
| 2026-09-15 | Jetons sémantiques régénérés sur un axe propre, séparés de la palette d'identité par un plancher perceptuel ΔE ≥ 0,10 après mappage de gamut ([ADR-0022](adr/0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md)) |
| 2026-09-15 | Règle de précédence identité/état posée pour feature-016 : l'identité prend le texte et le sigle, l'état prend le contour et la forme |
| 2026-09-15 | Règle de précédence identité/état **appliquée** par feature-016 (liste des cycles en accordéon) ; vocabulaire des traits fixé pour lever une ambiguïté trouvée en cours de cycle (pointillé = sans clôture, tirets pleins = agent principal, tirets en liseré gauche = rebouclage) |
| 2026-09-15 | §3 et §4 **appliqués** par feature-019 : colonne de navigation, contenu borné, une section à la fois ; typographie du §4 ramenée de 31 usages de chasse fixe contre 2 de sans-serif à 16 contre 18 ; §3 amendé (`--surface-2` devient une teinte d'interaction, plus un niveau de repos) ; `--texte-faible` et `--texte-doux` relevés au-dessus du seuil du §8, dans les deux thèmes, contre les quatre surfaces (absorption de bug-016) ; règle de marge de conception généralisée aux seuils de contraste ([ADR-0024](adr/0024-une-section-a-la-fois-dans-un-contenu-borne.md)) |
| 2026-09-15 | §5 **appliqué et verrouillé** par feature-017 (`control-center/web/diagramme.js` + `app.js`) : grammaire figée par [ADR-0025](adr/0025-grammaire-du-diagramme-de-deroule.md) — trois formes du cercle pour les trois grandeurs mesurées, géométrie et rendu séparés dans deux modules distincts |
| 2026-09-19 | §5 et §8 **mis en conformité avec la maquette de référence** par feature-020 : rayon, graduations et liseré des fichiers réalignés ([ADR-0026](adr/0026-trois-echelles-du-diagramme-alignees-sur-la-maquette.md), qui remplace `ADR-0025 §1` sur ces trois points) ; le pointillé du contour du cercle redevient le seul motif de l'état « sans clôture » (l'échec ne le porte plus) ; l'agent principal quitte les tirets et porte le sigle « AP » ; l'identité sur le contour de l'agent en cours est actée comme exception nommée à la règle de précédence identité/état |

## Voir aussi

- [ADR-0006 — zéro dépendance](adr/) et la CSP du serveur
- [ADR-0022 — deux familles de jetons de couleur, séparées par un plancher perceptuel](adr/0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md)
- [ADR-0024 — une section à la fois, dans un contenu borné](adr/0024-une-section-a-la-fois-dans-un-contenu-borne.md)
- [ADR-0025 — la grammaire du diagramme de déroulé](adr/0025-grammaire-du-diagramme-de-deroule.md)
- [ADR-0026 — trois échelles du diagramme alignées sur la maquette de référence](adr/0026-trois-echelles-du-diagramme-alignees-sur-la-maquette.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [features/page-centre-de-controle.md](features/page-centre-de-controle.md) — la commande de thème côté écran
- `control-center/web/app.css` — les valeurs, source unique
