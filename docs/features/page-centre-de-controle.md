# Page — Centre de contrôle

Tableau de bord web fourni avec le kit (`control-center/web/`), qui observe et
pilote les workflows d'agents. Une seule page, découpée en **sections**
atteintes depuis une colonne de navigation — jamais tout affiché à la fois.
Voir `control-center/README.md` pour le modèle de déploiement et
`docs/DESIGN-SYSTEM.md` pour les règles visuelles et leur méthode.

## Structure de la page

Depuis `feature-019` (voir
[ADR-0024](../adr/0024-une-section-a-la-fois-dans-un-contenu-borne.md)), la
page remplace l'ancien empilement à colonne latérale par une colonne de
navigation étroite et une **section à la fois**, dans un contenu borné et
centré.

### La colonne de navigation

Une colonne fixe (200 px, collante sous la barre supérieure) liste **six
sections** ; elle **navigue**, elle ne contient aucun contenu propre. C'est un
motif ARIA `tablist` (`role="tablist"` sur la colonne, `role="tab"` sur
chaque entrée, `role="tabpanel"` sur chaque section) : un seul arrêt de
tabulation, l'élément actif porte `aria-selected="true"`.

Les six sections, et les **huit blocs** qu'elles regroupent (aucun perdu
depuis l'ancien affichage) :

| Section | Bloc(s) |
|---|---|
| Agents | Agents |
| Système | Système |
| Développer | Que souhaitez-vous développer ? · Spécifications · Pilotage |
| Cycles | Cycles (la liste en accordéon, voir plus bas) |
| Fichiers | Fichiers touchés |
| Événements | Derniers événements |

« Développer » est la seule section à porter plusieurs blocs (trois) ; les
cinq autres en portent chacune un seul.

### Contenu borné, fil d'Ariane, titre

Chaque section ouvre sur un fil d'Ariane (« Centre de contrôle ») et un titre
de niveau `<h1>`, focusable. Le contenu est borné à 880 px et centré — jamais
la pleine largeur de l'écran, quelle que soit la taille de la fenêtre.

**Une seule section est visible à la fois.** L'attribut `hidden` est posé
**statiquement** dans le HTML servi sur toutes les sections sauf celle par
défaut (« Agents ») : c'est le seul mécanisme de masquage, avant même que le
script ne s'exécute — la page n'affiche jamais les six sections d'un coup, y
compris sans JavaScript ou avant son exécution.

### États vides par section

Chaque section affiche son propre état vide quand elle n'a rien à montrer —
par exemple « aucun agent découvert », « aucun cycle observé pour l'instant »,
« journal vide — aucun événement observé pour l'instant ». Aucune section
n'affiche un espace muet en l'absence de données.

### Navigation au clavier

La colonne suit le motif `tablist` standard : `Tab` entre une seule fois dans
le groupe, les flèches (haut/bas ou gauche/droite selon la disposition)
parcourent les six entrées, et sélectionner une entrée déplace le focus sur
le titre de la section ouverte (focusable, `tabindex="-1"`) — c'est ce titre
que les lecteurs d'écran annoncent, pas un simple changement d'état visuel.

### Repli en écran étroit

En dessous de 600 px de large, la colonne de navigation passe en **bande
horizontale défilante** sous l'en-tête — mêmes boutons, même ordre, sans
tiroir ni menu escamotable (ce qui aurait ajouté un état ouvert/fermé et une
gestion de focus supplémentaires). Aucune section ne devient inatteignable à
cette largeur.

## Commande de thème

Un contrôle à trois positions, en haut à droite de la barre (`role="radiogroup"`,
navigation aux flèches, un seul arrêt de tabulation) :

- **Clair**
- **Système** — position par défaut
- **Sombre**

Le choix explicite pose `data-theme="clair"` ou `data-theme="sombre"` sur
`<html>` ; la position « système » ne pose rien et suit
`prefers-color-scheme`.

### « Système » annonce sa résolution

Les positions « clair » et « système » rendent le même écran tant que l'OS est
en clair — deux positions indiscernables à l'usage si rien ne les distingue.
La position « système » affiche donc l'apparence à laquelle elle aboutit à cet
instant : son icône suit le thème résolu, et son libellé accessible le
nomme — « Suivre le système (actuellement sombre) ». Les deux autres positions
gardent un libellé fixe.

### Persistance et premier rendu

Le choix persiste dans `localStorage` (clé `theme`) et son application se fait
**avant le premier rendu** : `control-center/web/theme.js`, chargé de façon
synchrone dans `<head>`, pose l'attribut `data-theme` sur `<html>` dès que le
script s'exécute, avant que le reste de la page ne se peigne. Sans cela, la
page clignoterait dans le mauvais thème le temps que le script principal
s'exécute.

- `localStorage` indisponible ou en échec (fenêtre privée, données bloquées) :
  la page s'affiche correctement, en position « système », sans exception.
- Une valeur inconnue stockée sous la clé `theme` est traitée comme
  « système », et la clé est nettoyée.

### Suivi de l'OS sans rechargement

En position « système », un changement de préférence de l'OS pendant que la
page reste ouverte est suivi en direct (écoute de
`matchMedia("(prefers-color-scheme: dark)")`), sans rechargement. Un choix
explicite (« clair » ou « sombre ») n'est jamais annulé par ce changement —
il gagne dans les deux sens contre la préférence système.

`prefers-reduced-motion` est respecté : la bascule ne produit aucune
transition animée.

## Identité de couleur par agent

Chaque agent affiché sur le diagramme et dans la liste des agents reçoit une
couleur propre, dérivée de son rôle (`--a-<rôle>` pour le trait, le sigle et
les graduations ; `--f-<rôle>` pour le remplissage). Deux rôles n'ont jamais
la même couleur ni le même sigle à deux lettres. La méthode qui engendre ces
couleurs — clarté et intensité constantes, seule la teinte varie — est
documentée dans `docs/DESIGN-SYSTEM.md` (§2) et son verrouillage dans
[ADR-0022](../adr/0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md).

Un rôle sans teinte assignée (type d'agent inconnu du tableau des identités)
reçoit le jeton neutre achromatique (`--a-neutre` / `--f-neutre`) plutôt
qu'une couleur d'agent recyclée : le neutre signale l'absence d'identité, il
n'en emprunte pas une.

Les deux thèmes partagent les mêmes teintes ; seules la clarté et l'intensité
diffèrent, ce qui permet au même diagramme SVG de servir les deux sans
recopier de couleur (il lit les jetons via `var()`).

## Liste des cycles en accordéon

Remplace l'ancien affichage à plat des « workflows observés ». Chaque cycle
(voir [ADR-0014](../adr/0014-bornage-des-cycles-par-marqueur-declare.md) pour
ce que « cycle » désigne) est une **ligne**, le plus récent en tête.

### Ce qu'une ligne porte

- son **état** — `termine`, `en_cours` ou `sans_cloture` (bug-013, additif) ;
- sa **désignation** — l'heure de départ et l'agent ouvrant (`borne_par`), ou
  la mention du bornage quand il n'y en a pas (`session entière`,
  `avant le premier repère`). **Pas un nom de spec** — voir plus bas ;
- le nombre d'agents, la durée totale, l'ancienneté.

### Dépliement exclusif

Un seul détail de cycle est ouvert à la fois. Le plus récent est déplié par
défaut ; en ouvrir un autre referme le précédent — jamais deux détails
visibles ensemble (`docs/DESIGN-SYSTEM.md` §6). Le dépliement est une
préférence d'affichage **locale** à la page, pas un état conservé côté
serveur : un rechargement revient au dernier cycle ouvert par défaut.

### Navigation clavier

Chaque en-tête de ligne est un bouton, atteignable par tabulation, portant
`aria-expanded` et associé à son détail. Déplier, replier et parcourir la
liste entière se font sans souris.

### Le détail d'un cycle

- **Bloc de propriétés** : statut, durée, appels d'outils, fichiers écrits,
  rebouclages, agents simultanés. Les totaux affichés égalent la somme des
  lignes de la table qui suit.
- **Table des passages d'agent** : agent, début, durée, outils, fichiers,
  état ; une reprise (rebouclage sur le même agent) est signalée sur la
  ligne concernée. L'identité de couleur par agent (section ci-dessus) s'y
  applique, ainsi que sur les pastilles d'état.

Un cycle en cours se rafraîchit sans se refermer ni perdre la position de
lecture. Un cycle sans agent typé affiche sa ligne normalement ; le détail le
dit plutôt que de disparaître en silence.

### Ce que l'écran n'affiche pas, et pourquoi

- **Aucun nom de spec.** Cette donnée n'existe dans aucun des vingt champs
  produits par la reconstruction d'un cycle (`events.py`, fonction
  `reconstruire`) : une corrélation heuristique par fichiers de spec
  modifiés a été mesurée avant d'être écartée — elle ne désigne un candidat
  unique que dans 2 cas sur 14 cycles réels, et le journal ne contient
  aucune vérité terrain pour la valider. Voir
  [ADR-0023](../adr/0023-un-cycle-observe-ne-porte-pas-de-nom.md).
- **Le nombre de cycles affichés est un réglage, pas une propriété des
  données.** `[workflows] affiches` (défaut **20**, borné `[1, 100]`,
  `Config.workflows_affiches()`) tronque la liste envoyée par le serveur ;
  ce n'est jamais le compte réel de cycles reconstruits depuis le journal.
  Mesuré sur un instantané de 7 713 événements : **3** cycles sans bornage
  déclaré (`agents_ouvrants` vide), **13 à 14** cycles avec la configuration
  réelle du projet, **27** avec deux agents ouvrants déclarés — trois
  réglages, trois comptes différents, sur le même journal
  ([ADR-0014](../adr/0014-bornage-des-cycles-par-marqueur-declare.md)).
- **`segments[]` porte des passages d'agent, pas des cycles.** Le nom du
  champ, hérité de la reconstruction interne, trompe à la lecture : chaque
  entrée de `segments[]` est un passage (l'agent principal ou un sous-agent)
  à l'intérieur d'un seul cycle, jamais un cycle lui-même. La liste en
  accordéon de cette page ne s'appuie pas sur `segments[]` mais sur la liste
  de workflows rendue par `reconstruire()`.

## Diagramme du déroulé

Dans le détail d'un cycle déplié (voir plus haut), un diagramme SVG remplace
les maillons textuels : un cercle par agent, relié en séquence, sous un socle
de trois lignes (heure de départ au format `HH:MM`, durée, nom). La **durée
est la vedette du socle** — elle seule est graissée et en couleur de texte
pleine (`--texte`), l'heure et le nom restent en `--texte-faible`. Un agent
en cours grossit sa durée et la colore de son identité (voir
`docs/DESIGN-SYSTEM.md` §8, exception nommée à la règle de précédence
identité/état). Le sigle de l'agent principal est **AP**, jamais « ?? » —
même les cycles qui ne contiennent que lui.

### Ce que chaque forme du cercle encode

- le **diamètre** : la durée de l'agent (`11 + 0,80·√(durée_s)`, plafonné à
  56 px) ;
- les **graduations** autour du cercle : le nombre d'appels d'outils, en 24,
  36 ou 52 graduations selon le rayon — une graduation allumée est plus
  longue qu'une éteinte, et le zéro appel se marque par deux barres
  superposées ;
- le **liseré intérieur** : le nombre de fichiers écrits, à épaisseur fixe
  (1 px) et **opacité croissante** avec leur nombre — désormais **visible**
  (il était peint sous le disque opaque, un défaut corrigé par `feature-020`).

Aucun nombre de jetons n'est affiché : le journal ne les mesure pas. La
saturation de l'échelle des appels d'outils (agent qui dépasse le nominal)
n'a plus de signe visible dans le tracé — elle reste lisible dans l'infobulle
du cercle. Voir
[ADR-0026](../adr/0026-trois-echelles-du-diagramme-alignees-sur-la-maquette.md)
(qui remplace [ADR-0025](../adr/0025-grammaire-du-diagramme-de-deroule.md) §1
sur le rayon, les graduations, le liseré et le rendu du zéro/plafond) pour la
grammaire complète et les alternatives écartées, et `docs/DESIGN-SYSTEM.md`
§5 pour le détail visuel.

### Lecture du déroulé

La zone porte le titre « **Déroulé** » et une phrase d'avertissement :
« l'écart horizontal sert la lisibilité, il ne mesure pas le temps ». **L'écart
horizontal ne mesure pas le temps** — chaque agent réclame la demi-largeur du
plus exigeant entre son cercle avec ses graduations et le plus long de ses
trois libellés. Le temps se lit sous chaque cercle, il ne se mesure pas en
distance. Une attente de plus de deux minutes entre deux agents s'affiche
dans une pastille posée sur le lien. La piste du diagramme porte des
**voiles latéraux** (dégradé sur fond `--creux`) qui signalent le contenu
caché par le défilement horizontal.

**Les agents simultanés** (par exemple `code-reviewer` et `security-reviewer`
qui tournent ensemble) occupent un seul créneau et s'empilent verticalement,
dans un cadre **sans aplat** (filet seul, coins arrondis) portant le libellé
« N agents en parallèle » ; le cycle avance d'un seul cran quel que soit leur
nombre. Au-delà de quatre agents empilés, la pile se replie (« 4 + N »).

**Un rebouclage** (une reprise du même agent) est relié à sa précédente
occurrence par un arc pointillé de couleur fixe (`--rebouclage`), **sans
pointe de direction**. **Un échec** se signale par deux moyens redondants :
couleur et croix, sur un contour `--alerte` — le pointillé du contour est
désormais **réservé** à l'état « sans clôture », seul motif qu'il porte.

Une légende, sous le diagramme, rappelle ce que chaque forme et chaque trait
encodent.

### Défilement et accès clavier

La zone défile **horizontalement** quand le tracé dépasse la largeur
disponible ; elle ne se comprime jamais. Molette seule = la page ; `Maj` +
molette ou glisser = la zone. La zone prend le focus clavier et se parcourt
aux flèches gauche/droite.

### Séparation géométrie / rendu

`control-center/web/diagramme.js` calcule la géométrie complète (un module
pur, sans DOM ni couleur) ; `control-center/web/app.js`
(`construireDiagramme`) la transforme en SVG et lit les jetons de couleur par
agent (`var(--a-<rôle>)`). Aucune dimension n'est recalculée séparément dans
les deux modules — un même calcul fait autorité sur la géométrie et sur la
place qu'elle réserve. Voir [ADR-0025](../adr/0025-grammaire-du-diagramme-de-deroule.md)
et [ADR-0026](../adr/0026-trois-echelles-du-diagramme-alignees-sur-la-maquette.md).

## Voir aussi

- `docs/DESIGN-SYSTEM.md` — règles visuelles complètes, méthode de palette,
  grammaire du diagramme, §3 (surfaces), §4 (typographie), §6 (liste des
  cycles)
- [ADR-0024](../adr/0024-une-section-a-la-fois-dans-un-contenu-borne.md) —
  la colonne de navigation, une section à la fois, et l'absorption de
  `bug-016`
- [ADR-0022](../adr/0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md)
  — la décision derrière la séparation des deux familles de jetons
- [ADR-0023](../adr/0023-un-cycle-observe-ne-porte-pas-de-nom.md) — pourquoi
  un cycle n'est jamais désigné par un nom de spec
- [ADR-0014](../adr/0014-bornage-des-cycles-par-marqueur-declare.md) — le
  bornage des cycles, et ce que `[workflows] affiches` tronque
- [ADR-0025](../adr/0025-grammaire-du-diagramme-de-deroule.md) — la grammaire
  du diagramme de déroulé, et la séparation entre géométrie et rendu
- [ADR-0026](../adr/0026-trois-echelles-du-diagramme-alignees-sur-la-maquette.md)
  — le rayon, les graduations, le liseré des fichiers et le rendu du zéro /
  du plafond alignés sur la maquette de référence, remplaçant `ADR-0025 §1`
  sur ces quatre points
- `control-center/README.md` — modèle de déploiement, jeton d'accès
