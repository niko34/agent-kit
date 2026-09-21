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

*Amendé par `feature-021` — voir
[ADR-0030](adr/0030-material-design-3-ecrit-a-la-main-devient-le-systeme-visuel.md).*

Material Design 3 / Material 3 Expressive, densité adaptée au bureau. Typographie
fine, principalement en graisses 400 et 500, sans titres énormes. La hiérarchie se
construit par les surfaces tonales, l'espace et une élévation discrète — plus par
des bordures épaisses (voir §3, révoqué). La couleur reste un **signal**, jamais une
décoration gratuite ; ce qu'elle signale a changé : depuis
[ADR-0032](adr/0032-l-identite-coloree-des-agents-disparait-du-diagramme.md), elle
ne porte plus l'identité d'un agent, seulement un état. Une animation reste toujours
rattachée à un changement d'état (l'enchaînement d'un passage, l'ouverture d'une
bottom sheet) — jamais un effet ajouté pour lui-même : ce principe ne change pas,
seul son vocabulaire s'élargit.

Trois conséquences qui s'appliquent partout :

- **Zéro ressource distante.** La CSP du serveur n'autorise que `'self'` : pas de
  police Google, pas de CDN, pas d'icône téléchargée. Les piles de polices sont
  celles du système. Voir ADR-0006.
- **Zéro dépendance.** Pas de préprocesseur, pas de framework CSS. Les jetons
  sont des variables CSS natives.
- **Pas de graphique par bibliothèque.** Les visualisations sont du SVG écrit à
  la main, engendré depuis les données.

---

## 2. Une seule palette, exclusivement sémantique

*Réécrit par `feature-021`.*

### Un seul thème — le thème sombre est supprimé

Voir [ADR-0033](adr/0033-le-theme-sombre-est-supprime.md). Le centre de contrôle
propose désormais un thème **clair** unique, aligné sur la maquette Material 3
fournie par l'utilisateur (`color-scheme: light`, aucun `data-theme`). Ce n'est pas
une préférence de conception : aucune référence de conception fournie ne montre de
variante sombre, et en fabriquer une aurait été l'inverse de l'adoption fidèle
demandée. Ce que ça emporte, mesuré : `theme.js` (75 lignes), `test_app_theme.js`
(1 046 lignes), `test_app_theme_navigateur.py` (515 lignes), 5 règles
`data-theme`/`prefers-color-scheme` dans `app.css`, 34 occurrences dans `app.js`,
tous retirés. Voir §7, sans objet.

### L'identité colorée par agent est retirée

Voir [ADR-0032](adr/0032-l-identite-coloree-des-agents-disparait-du-diagramme.md).
Le centre de contrôle n'engendre plus de palette catégorielle par rôle d'agent : la
maquette Material 3 fournie ne colore aucun disque d'agent par son identité, elle
distingue les rôles par le **texte** (sigle, nom) seul. La méthode de génération
catégorielle (clarté et intensité constantes, teinte seule variable), le tableau des
huit teintes par rôle et la règle de saturation à 35° d'écart minimal — tout cela est
retiré de ce document. Il reste **documenté et immédiatement réutilisable**, sans
réinvention, si une identité colorée redevient nécessaire un jour : voir
[ADR-0022](adr/0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md) §1-§3
(révoqués, pas supprimés) et [ADR-0032](adr/0032-l-identite-coloree-des-agents-disparait-du-diagramme.md)
§4 (pourquoi le plancher perceptuel est *sans objet*, et non *faux*).

### Les jetons sémantiques, seule famille restante

La couleur ne porte plus qu'une **gravité** — ce qu'un état signale (actif,
parallèle, reprise ou question bloquante, avertissement, échec) — jamais une
identité de rôle. Les jetons sont ceux du prototype Material 3
(`--primary`/`--primary-soft`/`--primary-ink`, `--teal`/`--teal-soft`,
`--coral`/`--coral-soft`, `--amber`/`--amber-soft`, `--danger`/`--danger-soft`),
engendrés sur leur propre axe, sans contrainte de séparation vis-à-vis d'une
palette catégorielle qui n'existe plus (le plancher ΔE ≥ 0,10 d'`ADR-0022` §5 est
*sans objet*, pas faux — voir ci-dessus).

Les méthodes suivantes, posées par `ADR-0022`, restent valables pour tout jeton
sémantique futur (elles ne dépendaient pas de l'existence d'une identité par
agent) :

- **Méthode de mappage de gamut** : réduire l'**intensité**, à clarté et
  teinte conservées ; jamais un écrêtage canal par canal, qui déplacerait la
  clarté perçue.
- **Marge de conception** : viser une marge chiffrée au-dessus de tout seuil dur
  (par exemple ΔL ≥ 0,12 nominal pour un plancher perceptuel à 0,10, ou le
  contraste nominal ≥ 4,65 du §8) — jamais une valeur conçue exactement à son
  seuil.

### Contrastes tenus

| | Thème clair (M3) |
|---|---|
| Texte courant contre le fond | à remesurer contre la palette M3 — voir [ADR-0033](adr/0033-le-theme-sombre-est-supprime.md) |

Le minimum absolu reste **4,5:1** pour tout texte et **3:1** pour un trait porteur
de sens (marge de conception : nominal ≥ 4,65, voir §8). Les valeurs mesurées pour
l'ancienne palette à deux thèmes ne se reportent pas automatiquement : la matrice
complète (garde F5 de `feature-021`) doit être établie contre les jetons du
prototype Material 3, jamais présumée héritée.

---

## 3. Surfaces — RÉVOQUÉ, remplacé par les surfaces tonales M3

*Révoqué en bloc par `feature-021` — voir
[ADR-0030](adr/0030-material-design-3-ecrit-a-la-main-devient-le-systeme-visuel.md).
Section conservée à titre d'archive : elle décrivait la règle en vigueur de
`feature-019` (2026-09-15) à `feature-021` (2026-09-20).*

L'ancienne règle fixait trois niveaux structurels (`--fond`, `--surface`,
`--creux`), un écart volontairement faible entre eux, et réservait un quatrième
jeton (`--surface-2`) à une teinte d'interaction, **jamais** un aplat de repos.

La maquette Material 3 fournie par l'utilisateur emploie **cinq** surfaces
tonales (`--bg`, `--surface`, `--surface-low`, `--surface-high`,
`--surface-highest`) utilisées **en aplat de repos** partout — bande de résumé,
colonnes du kanban, panneau de conversation, cartes de fonctionnalité — sans
qu'aucun filet ne les délimite. Adopter la maquette fidèlement exige de suivre
cet usage : la règle « jamais un aplat de repos » est donc **révoquée**, avec
elle [ADR-0024 §4](adr/0024-une-section-a-la-fois-dans-un-contenu-borne.md), qui
la portait.

**Ce qui remplace cette section** : les surfaces tonales du prototype
(`control-center/maquettes/2026-09-20-maquette-materiel-3.html`, bloc `:root`)
font foi. Aucune table de correspondance n'est recopiée ici pour ne pas
dupliquer les valeurs — elles vivent à un seul endroit, `app.css`, une fois le
cycle d'implémentation livré.

---

## 4. Typographie

*Appliqué par `feature-019` — voir
[ADR-0024](adr/0024-une-section-a-la-fois-dans-un-contenu-borne.md). Entrée du
cycle : **31** usages de la pile à chasse fixe contre **2** de la pile
sans-serif. Sortie : **16** contre **18**, mesuré par
`grep -c 'var(--mono)' / 'var(--sans)'` sur `app.css` — chaque usage résiduel
de `--mono` porte un identifiant technique (chemin, sigle, code).*

*Amendé par `feature-021` — voir
[ADR-0030](adr/0030-material-design-3-ecrit-a-la-main-devient-le-systeme-visuel.md) :
l'échelle se resserre sur les graisses **400 et 500**, sans titres énormes,
alignée sur la maquette Material 3. La pile système reste seule autorisée —
confirmé, pas contredit, par `ADR-0006`.*

| Usage | Taille | Graisse |
|---|---|---|
| Titre de page | 27 px | 700 |
| Titre de section | 18 px | 600 |
| Texte courant, table | 13,5–15 px | 400 |
| Étiquette secondaire | 11–12,5 px | 400 |
| Chiffre mis en avant (durée) | 12,5–17 px | 300–400 |
| Chronomètre vedette du mono-écran | 56 px | 300 |

- Pile **système** uniquement (`--sans`, `--mono`). Aucune police distante.
- **Chiffres à chasse fixe** (`font-variant-numeric: tabular-nums`) partout où
  des nombres se lisent en colonne — tables, socles du diagramme, propriétés.
  Sans cela, deux durées superposées ne s'alignent pas et ne se comparent plus.
- Le **monospace** est réservé aux identifiants techniques : chemins, sigles,
  codes. Pas aux libellés d'interface.
- **Extension assumée du haut de l'échelle** (`feature-021`, 2026-09-19) : le
  chronomètre vedette du mono-écran affiche sa durée à **56 px**, graisse
  300 — bien au-delà des 17 px qui plafonnaient jusqu'ici le « chiffre mis en
  avant ». Ce n'est pas une omission du tableau ci-dessus : c'est une
  extension déclarée de l'échelle pour un signal unique et central, pas un
  précédent pour banaliser de grands corps ailleurs à l'écran.

---

## 5. Le diagramme de déroulé

C'est le composant le plus spécifique du centre de contrôle. Sa grammaire est
fixée ; ne pas la changer sans ADR.

⚠️ **Cette section décrit le code actuellement en production.** Le disque d'agent
(diamètre, graduations, liseré des fichiers) va changer : `feature-021` a déjà
statué sur une nouvelle grammaire, alignée sur la maquette Material 3, qui révoque
[ADR-0025](adr/0025-grammaire-du-diagramme-de-deroule.md) §1-§3 et
[ADR-0026](adr/0026-trois-echelles-du-diagramme-alignees-sur-la-maquette.md) en
entier — voir [ADR-0031](adr/0031-la-grammaire-du-disque-d-agent-change.md), qui
nomme aussi les pertes (appels d'outils, granularité des fichiers, échec, « sans
clôture », agent principal, heure de départ). Cette section sera réécrite au
cycle d'implémentation de `feature-021`, une fois le disque livré ; d'ici là, elle
reste exacte pour le code servi. La séparation géométrie/rendu ci-dessous (et
`ADR-0025 §4`) reste en vigueur, écart assumé à la maquette.

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

> **Rectification (2026-09-20)** : la phrase ci-dessous était vraie du journal
> d'événements (`agent-events.jsonl`), et **reste vraie de lui** — il ne porte
> toujours aucun jeton. Elle est **fausse comme affirmation générale** : les
> jetons **sont** mesurables, ailleurs. Mesuré le 2026-09-20 : **225** transcripts
> par sous-agent (`~/.claude/projects/<projet>/<session>/subagents/agent-<id>.jsonl`),
> appariement `agent_id` ↔ nom de fichier exact sur **225/225**, et **223 des 223
> passages dessinés** (ceux qui portent un `agent_type`) trouvent leur transcript —
> **100 %** de couverture. Le chiffre retenu est `input_tokens + output_tokens`
> (écart 205× entre passages) plutôt qu'un total incluant le cache, qui pèse 241×
> l'ensemble et écraserait toute lecture. **Le principe reste entier** : on
> n'affiche jamais un chiffre qu'on ne sait pas mesurer — c'est le *fait* « les
> jetons ne sont mesurables nulle part » qui était faux, pas le principe. La
> lecture de ces transcripts franchit la racine du projet et expose des
> conversations entières (secrets, données personnelles) : elle exige un GATE
> `security-reviewer` avant tout accès, voir `feature-023`. Voir
> [ADR-0031](adr/0031-la-grammaire-du-disque-d-agent-change.md).

**Le journal d'événements ne porte pas les jetons.** Il contient l'horodatage,
l'outil, le fichier et l'échec — pas les jetons consommés. Toute maquette qui
prétendrait les tirer *de ce journal* inventerait une donnée ; ce n'est plus vrai
d'une maquette qui les tire des transcripts de sous-agent, sous réserve du GATE
ci-dessus.

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

## 6. Bande de sélection des cycles

*Révisé par `feature-021` — voir
[ADR-0029](adr/0029-le-tableau-de-bord-revient-au-mono-ecran.md), qui retire
l'accordéon des cycles livré par `feature-016` et remplace cette section.*

Le cycle le plus récent s'affiche **sans aucun clic** : c'est la lecture par
défaut du mono-écran, cohérente avec l'exigence que l'état du projet se lise
sans interaction. Une bande de sélection en `role="tablist"` permet de
consulter un cycle **antérieur** — c'est le seul usage restant du motif
`tablist`/`tab`/`tabpanel` dans ce document ; la navigation entre sections du
tableau de bord elle-même en a été retirée (voir ADR-0029). Un seul
`tabpanel`, donc un seul diagramme, n'est jamais visible à l'écran à la fois.

La zone du diagramme **défile horizontalement** quand le tracé dépasse la
largeur ; elle ne se comprime pas. Molette seule = la page ; `Maj` + molette ou
glisser = la zone. La zone prend le focus clavier et se parcourt aux flèches.

---

## 7. Bascule de thème — SANS OBJET, le thème sombre est supprimé

*Amendé par `feature-021` — voir
[ADR-0033](adr/0033-le-theme-sombre-est-supprime.md). Section conservée à titre
d'archive : elle décrivait la règle en vigueur de `feature-015` (2026-09-14) à
`feature-021` (2026-09-20).*

Le centre de contrôle n'a plus qu'un thème (§2) : il n'y a plus rien à basculer.
La maquette Material 3 fournie ne dessine aucun contrôle de ce type. Ce qui suit
n'a plus d'objet et n'est pas à reconstruire sans qu'une référence de conception
sombre n'existe.

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
- **Règle de précédence entre les deux familles de jetons — RÉVOQUÉE**, avec
  son exception nommée. Voir
  [ADR-0032](adr/0032-l-identite-coloree-des-agents-disparait-du-diagramme.md).
  La règle posait : « l'identité prend le texte et le sigle, l'état prend le
  contour et la forme » ; elle supposait deux familles de couleur à faire
  cohabiter sur un même élément. Depuis que l'identité colorée par agent
  disparaît du diagramme (§2), il n'existe plus qu'une seule famille — la
  règle de précédence et l'exception nommée qu'avait posée `feature-020`
  (contour du cercle en cours, coloré par l'identité plutôt que par l'état)
  n'ont plus d'objet. Un futur cycle qui réintroduirait une identité colorée
  devrait aussi statuer à nouveau sur une règle de précédence — celle-ci
  n'est pas réactivée automatiquement.

- **Vocabulaire des traits sur le cercle du diagramme**, réduit à un seul
  motif ambigu résolu par `feature-020` : **pointillé** = état « sans
  clôture » (`sans_cloture`, bug-013), et c'est désormais le **seul** motif
  restant sur ce contour — l'agent principal ne porte plus de tirets (il se
  distingue par son fond et son sigle « AP », voir `docs/features/page-centre-de-controle.md`)
  et l'échec ne porte plus de pointillé (il se signale par la croix et le
  contour `--alerte` seuls, voir §5).
- **Vocabulaire des traits ailleurs sur l'écran** (bande de sélection des
  cycles, liste de fichiers — la table des passages qui le portait depuis
  `feature-016` est supprimée par `ADR-0029`, le diagramme de déroulé
  restant la seule représentation des enchaînements) :
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
- ❌ Une couleur choisie à l'œil plutôt qu'engendrée par une méthode écrite (§2)
- ❌ Une ressource distante, quelle qu'elle soit
- ❌ Une bibliothèque de graphiques
- ~~❌ Un aplat de fond pour délimiter un bloc là où un filet suffit~~ —
  **retiré le 2026-09-20** ([ADR-0030](adr/0030-material-design-3-ecrit-a-la-main-devient-le-systeme-visuel.md)) :
  les surfaces tonales M3 (§3, révoqué) sont des aplats délibérés, sans filet.
- ❌ Une information portée par la seule couleur
- ❌ Un chiffre affiché qu'on ne sait pas mesurer — **précision datée du
  2026-09-20** : l'interdit était formulé « qui n'est pas dans le journal
  d'événements ». C'est resté vrai *du journal*, mais faux comme règle
  générale : les jetons par sous-agent sont mesurables ailleurs (225
  transcripts, 223/223 passages dessinés couverts — voir §5 et
  [ADR-0031](adr/0031-la-grammaire-du-disque-d-agent-change.md)), sous réserve
  d'un GATE `security-reviewer` parce que la lecture franchit la racine du
  projet et expose des conversations entières. Le principe ne change pas :
  seule sa source autorisée s'élargit, du journal d'événements aux transcripts
  de sous-agent lus sous GATE.
- ❌ `eval`, `new Function`, ou tout `<script>` inline — refusés par la CSP
  réellement servie (`script-src` hérite de `default-src 'self'`, aucun
  `'unsafe-inline'` ni `'unsafe-eval'`), mesuré en HTTP le 2026-09-19
  (`feature-021`)
- ❌ Un Worker ou une image chargés depuis une URL `blob:` — `worker-src` et
  `img-src` les refusent l'un et l'autre, mesuré le même jour

**Ce que la mesure autorise et que ce document ne disait pas** (CSP réelle,
mesurée en HTTP le 2026-09-19, jamais déduite de sa seule lecture —
`feature-021`) : un **Web Worker de même origine**, `OffscreenCanvas`,
**WebGL et WebGL2** sont tous **autorisés** par l'en-tête réellement servi.
Ne pas s'en priver par excès de prudence — c'est l'erreur qu'a failli
commettre ce cycle avant mesure (`control-center/PIEGES.md`). Cela n'ouvre
pas la porte à une bibliothèque de rendu 3D ni à une bibliothèque de
graphiques (interdites ci-dessus) : ces capacités restent à écrire à la
main, sans dépendance, et seulement pour des données qui en ont l'usage.

Une police `.woff2` locale reste **impossible**, mais pas à cause de la
CSP : `_TYPES` (`control-center/backend/server.py`) ne sert que `.html`,
`.css`, `.js`, `.svg` — c'est le serveur qui refuse le fichier, avant même
que la politique de sécurité n'ait à se prononcer.

---

## 10. Faire évoluer ce système

| Changement | Ce qu'il faut |
|---|---|
| Réintroduire une identité colorée par agent | **ADR** — révoque [ADR-0032](adr/0032-l-identite-coloree-des-agents-disparait-du-diagramme.md), réutilise la méthode dormante d'[ADR-0022](adr/0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md) §1-§3 et §6-§7 |
| Ajuster une clarté ou une intensité sémantique | modifier `app.css`, dans le même commit que ce document |
| Changer ce qu'encode une forme du diagramme ou du disque d'agent | **ADR** — c'est la grammaire de lecture |
| Réintroduire un thème sombre | **ADR** — révoque [ADR-0033](adr/0033-le-theme-sombre-est-supprime.md), exige une référence de conception réelle |
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
| 2026-09-19 | Mono-écran adopté par feature-021 ([ADR-0029](adr/0029-le-tableau-de-bord-revient-au-mono-ecran.md)) : §1 et la partie navigation de §2 d'ADR-0024 remplacés — navigation par onglets retirée, accordéon des cycles remplacé par la bande de sélection du §6, `role="tablist"` conservé pour les seuls cycles antérieurs ; table des passages d'agent supprimée, le diagramme de déroulé devenant seule représentation des enchaînements (§8) ; `three.js` autorisé puis écarté après mesure (2,02 Mo réels contre une estimation de ~600 Ko, ADR-0006 confirmé) ; §9 complété par la CSP mesurée en HTTP : Web Worker de même origine, `OffscreenCanvas`, WebGL et WebGL2 autorisés, `.woff2` bloqué par `_TYPES` et non par la CSP ; §4 étendu par le chronomètre vedette à 56 px |
| 2026-09-20 | L'utilisateur fournit sa propre maquette Material 3 ; `feature-021` change d'objet (adoption fidèle, frontend seul). Cinq ADR neufs : [ADR-0030](adr/0030-material-design-3-ecrit-a-la-main-devient-le-systeme-visuel.md) — M3 écrit à la main, `ADR-0006` confirmé sans exception, §1/§4/§9 amendés, §3 et `ADR-0024 §4` révoqués (surfaces tonales en aplat de repos) ; [ADR-0031](adr/0031-la-grammaire-du-disque-d-agent-change.md) — nouvelle grammaire du disque d'agent, `ADR-0025 §1-§3` et `ADR-0026` révoqués, `ADR-0025 §4` maintenu en écart assumé, pertes nommées (appels d'outils, échelle des fichiers, échec, sans-clôture, agent principal, heure de départ), anneau d'activité sans progression chiffrée ; [ADR-0032](adr/0032-l-identite-coloree-des-agents-disparait-du-diagramme.md) — identité colorée par agent retirée, `ADR-0022 §1-§3` révoqués, §5 *sans objet* (pas faux), règle de précédence identité/état et son exception nommée révoquées (§8) ; [ADR-0033](adr/0033-le-theme-sombre-est-supprime.md) — thème sombre supprimé, `theme.js` et ses tests retirés, contraste à remesurer contre la palette M3 ; [ADR-0034](adr/0034-ce-que-le-depot-garde-des-references-de-conception.md) — le prototype HTML fait foi, les 12 PNG (18 Mo) ne sont pas versionnés, le prototype vit sous `control-center/maquettes/` pour rester lisible par le clone jetable. Deux règles corrigées, pas jetées : §5 et l'interdit n°7 du §9 affirmaient que les jetons ne sont mesurables nulle part — c'était vrai du seul journal d'événements, faux comme fait général (225 transcripts de sous-agent, 223/223 passages dessinés couverts), sous réserve d'un GATE de sécurité sur ces fichiers hors racine du projet (voir `feature-023`) |

## Voir aussi

- [ADR-0006 — zéro dépendance](adr/) et la CSP du serveur
- [ADR-0022 — deux familles de jetons de couleur, séparées par un plancher perceptuel](adr/0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md) (§1-§3 révoqués par ADR-0032, §5 sans objet)
- [ADR-0024 — une section à la fois, dans un contenu borné](adr/0024-une-section-a-la-fois-dans-un-contenu-borne.md) (§4 révoqué par ADR-0030)
- [ADR-0025 — la grammaire du diagramme de déroulé](adr/0025-grammaire-du-diagramme-de-deroule.md) (§1-§3 révoqués par ADR-0031, §4 maintenu)
- [ADR-0026 — trois échelles du diagramme alignées sur la maquette de référence](adr/0026-trois-echelles-du-diagramme-alignees-sur-la-maquette.md) (superseded by ADR-0031)
- [ADR-0029 — le tableau de bord revient au mono-écran, et pourquoi three.js est écarté](adr/0029-le-tableau-de-bord-revient-au-mono-ecran.md)
- [ADR-0030 — Material Design 3, écrit à la main, devient le système visuel](adr/0030-material-design-3-ecrit-a-la-main-devient-le-systeme-visuel.md)
- [ADR-0031 — la grammaire du disque d'agent change](adr/0031-la-grammaire-du-disque-d-agent-change.md)
- [ADR-0032 — l'identité colorée des agents disparaît du diagramme](adr/0032-l-identite-coloree-des-agents-disparait-du-diagramme.md)
- [ADR-0033 — le thème sombre est supprimé](adr/0033-le-theme-sombre-est-supprime.md)
- [ADR-0034 — ce que le dépôt garde des références de conception](adr/0034-ce-que-le-depot-garde-des-references-de-conception.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [features/page-centre-de-controle.md](features/page-centre-de-controle.md) — la commande de thème côté écran
- `control-center/web/app.css` — les valeurs, source unique
