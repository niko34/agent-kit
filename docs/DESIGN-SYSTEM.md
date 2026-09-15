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

| Usage | Thème sombre | Thème clair |
|---|---|---|
| Trait, sigle, graduations | L 0,75 · C 0,13 | L 0,415 · C 0,152 |
| Remplissage du cercle | L 0,22 mêlé au fond | L 0,885 · C 0,082 |

Deux teintes — l'ambre et le vert d'eau — n'atteignent pas l'intensité visée
dans le thème clair : l'écran ne sait pas les afficher plus vives à cette
clarté. C'est une limite de gamut, pas un réglage à corriger.

**Pour ajouter un agent** : choisir un angle de teinte à au moins 35° de tous
les autres, puis appliquer les L et C du tableau. Ne jamais choisir une couleur
à l'œil, et ne jamais reprendre un hexadécimal trouvé ailleurs.

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

Trois niveaux, jamais plus, dans les deux thèmes :

| Jeton | Rôle |
|---|---|
| `--fond` | la page |
| `--surface` | un panneau, une carte, une ligne dépliée |
| `--creux` | la zone du diagramme, une bande de temps mort |

L'écart entre deux niveaux est **volontairement faible** — de l'ordre de 1,1:1.
Ce n'est pas le fond qui délimite un bloc, c'est son **filet** (`--trait`). Un
bloc qui aurait besoin d'un aplat plus marqué pour se distinguer est un bloc mal
placé.

**Le diagramme est sur `--creux` dans les deux thèmes.** C'est ce qui donne son
unité à la zone. Le passer au blanc dans le thème clair efface la frontière
entre le document et la mesure — essayé, rejeté.

Une règle qui a été envisagée puis **abandonnée** : faire du diagramme un
canevas sombre invariant, inséré dans une page claire. Cela fonctionnait, mais
imposait un mélange clair/sombre dans la même page et interdisait d'afficher
plusieurs diagrammes sans zébrer l'écran.

---

## 4. Typographie

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

| Forme | Donnée |
|---|---|
| Diamètre du cercle | durée de l'agent |
| Graduations autour du cercle | nombre d'appels d'outils, sur une échelle de 70 |
| Liseré intérieur | nombre de fichiers écrits |
| Anneau fantôme en creux | la pleine échelle, pour lire un remplissage en absolu |
| Encoche en haut, cran épais | zéro et plafond de l'échelle |
| Cercle en pointillé + croix | échec — redondant avec la couleur, exprès |

**Les jetons ne sont pas mesurés.** Le journal d'événements ne les contient pas ;
il porte l'horodatage, l'outil, le fichier et l'échec. Toute maquette qui affiche
un nombre de jetons invente une donnée. Les récupérer supposerait de lire les
transcriptions de session — décision à part entière, non prise.

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

Un arc pointillé relie une reprise à **l'occurrence précédente du même agent**,
avec une pointe de direction. Pas à un agent arbitraire.

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
  sens. Vérifié à chaque ajout de couleur, pas à la fin.
- **Aucune information portée par la seule couleur.** Un échec se signale par la
  couleur *et* une croix *et* un cercle en pointillé. Un agent en cours par la
  couleur *et* un anneau supplémentaire *et* une graisse de texte.
- Focus visible sur tout élément atteignable au clavier, y compris la zone qui
  défile.
- `prefers-reduced-motion` respecté : aucune transition supérieure à 150 ms, et
  rien qui bouge en continu.
- Les sigles à deux lettres sont **distincts entre eux** : `spec-reader` = `SP`,
  `security-reviewer` = `SE`. Deux agents ne peuvent pas partager un sigle.

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

## Voir aussi

- [ADR-0006 — zéro dépendance](adr/) et la CSP du serveur
- [ARCHITECTURE.md](ARCHITECTURE.md)
- `control-center/web/app.css` — les valeurs, source unique
