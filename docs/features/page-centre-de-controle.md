# Page — Centre de contrôle

Tableau de bord web fourni avec le kit (`control-center/web/`), qui observe et
pilote les workflows d'agents. **Un seul écran** (`feature-021`, lot 3,
[ADR-0029](../adr/0029-le-tableau-de-bord-revient-au-mono-ecran.md)) : tout ce
que la page montre est visible au chargement, empilé, sans clic ni navigation
entre sections. Voir `control-center/README.md` pour le modèle de déploiement
et `docs/DESIGN-SYSTEM.md` pour les règles visuelles et leur méthode.

## Structure de la page

Depuis `feature-021` (lot 3), la page **révoque** le découpage par onglets
introduit par `feature-019` : la colonne de navigation étroite (six
`role="tab"`) et son affichage « une section à la fois » disparaissent.
`index.html` est réécrit en entier pour cela. Ce que la navigation par onglets
apportait est documenté ci-dessous **au passé**, comme trace de ce qui a
changé — voir
[ADR-0024](../adr/0024-une-section-a-la-fois-dans-un-contenu-borne.md)
(§1 et la partie navigation de §2, remplacés par `ADR-0029`) pour la décision
d'origine et [ADR-0029](../adr/0029-le-tableau-de-bord-revient-au-mono-ecran.md)
pour la révocation.

### Ce qui a disparu avec les onglets

- La colonne de navigation fixe (200 px, motif ARIA `tablist`/`tab`/
  `tabpanel`, un seul arrêt de tabulation, roving tabindex aux flèches).
- L'affichage « une section à la fois » : l'attribut `hidden` posé
  statiquement sur cinq des six sections dans le HTML servi.
- Le repli en bande horizontale défilante sous 600 px de large.
- La persistance de la section active entre deux chargements
  (`control-center/web/theme.js`).

`index.html` ne porte plus aucun identifiant `#section-*` ni `#onglet-*` ;
`control-center/web/theme.js` **continue d'être servi** (aucun script inline :
la CSP `default-src 'self'` l'interdit) mais son attribut `data-section` n'a
plus aucun lecteur côté `app.js` — c'est un fichier qui tourne sans effet
observable, conservé tel quel car hors périmètre du lot 3.

### Ce que la page affiche maintenant

Toutes les sections qu'énumérait l'ancien tableau (Agents, Système,
Développer — avec ses trois blocs, Cycles, Fichiers, Événements) sont
**empilées sur une seule page**, chacune un `<section>` distinct, sans
attribut `hidden` statique — la page n'a plus de contenu masqué au chargement.
25 identifiants issus de la maquette Material 3 (`control-center/maquettes/`)
sont posés dans le HTML servi ; leur câblage aux données réelles (le graphe
d'agents, la feuille de détail d'un passage, l'historique des cycles) est le
travail des lots 4 à 6, **non couvert par ce lot** — ce que le lot 3 livre est
la structure statique et l'accessibilité de l'écran, pas encore le rendu
dynamique de ces zones.

### États vides par section

Chaque section continue d'afficher son propre état vide quand elle n'a rien à
montrer — par exemple « aucun agent découvert », « journal vide — aucun
événement observé pour l'instant ». Aucune section n'affiche un espace muet
en l'absence de données.

### Cibles tactiles à 48 px

`.tab-button` et `.small-button` passent de 36 à 48 px de hauteur minimale
(seuil Material 3, posé au lot 2 — `F6`). Le lot 3 ne livre aucune cible sous
ce seuil : la réserve `.nav-onglet` (44 px), propre à l'ancienne navigation,
se ferme en disparaissant avec elle.

### La porte d'authentification rend désormais le reste de la page inerte

Corrigé dans ce même lot (`bug-017`, absorbée au titre d'
[ADR-0017](../adr/0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md)
— le lot réécrit `index.html` de toute façon, et corriger ailleurs aurait
signifié refaire le correctif sur une structure qui n'allait plus exister).

Avant ce correctif, le voile de la porte bloquait la souris mais pas la
tabulation : jusqu'à 6 contrôles restaient atteignables au clavier sous la
modale (section « Développer »), dont le bouton de lancement d'un cycle.
Depuis ce lot :

- `#porte-jeton` reste **enfant direct de `<body>`**, condition déjà établie
  par `feature-019` et préservée ici — c'est ce qui permet à ses **frères**
  (`.bandeau-hote`, le lien d'évitement, `.app-shell`, `.tiroir`) de recevoir
  `inert` à l'ouverture de la porte, et de le perdre à sa fermeture.
- `inert` retire un sous-arbre entier de l'arbre d'accessibilité **et** de
  l'ordre de tabulation — ce qu'aucune des alternatives (`opacity`,
  hors-écran, hauteur nulle) ne fait pour un sous-arbre complet.
- Le focus, à la fermeture, revient à un endroit **nommé** : celui qui
  l'avait avant l'ouverture, mémorisé puis restauré ; à défaut (rien de
  mémorisé, ou élément disparu du DOM entre-temps), le repli se fait sur
  `#main-content` (le lien d'évitement, `tabindex="-1"`) — jamais sur
  `document.body`, qui ne nomme rien.
- La rétention de focus déjà en place (piégeage `Tab` à l'intérieur de la
  porte) reste, en complément : elle ne suffisait pas seule.

Le **comptage** des contrôles atteignables hors modale (0 exigé), critère
d'acceptation chiffré de `bug-017`, est une garde de lot ultérieur ; ce lot
livre le mécanisme structurel qu'elle mesurera.

Depuis `feature-021` (lot 1, [ADR-0033](../adr/0033-le-theme-sombre-est-supprime.md)),
la page n'a plus qu'un **thème unique, clair** : le contrôle à trois positions
(clair / système / sombre) qui figurait en haut à droite de la barre est
retiré, ainsi que la persistance de choix de thème et le suivi de
`prefers-color-scheme` qui l'accompagnaient. Depuis le lot 3 (mono-écran,
ci-dessus), `control-center/web/theme.js` n'a plus aucune responsabilité
observable : il ne pose plus `data-theme`, et la persistance de section
active qu'il assurait depuis `feature-019` n'a plus d'objet, la page n'ayant
plus de section à persister. Le fichier reste servi tel quel (hors périmètre
du lot 3).

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

Le diagramme SVG lit ces jetons via `var()`, sans recopier de couleur en dur.

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
- [ADR-0029](../adr/0029-le-tableau-de-bord-revient-au-mono-ecran.md) — le
  retour au mono-écran, l'amendement d'`ADR-0024 §1`/§2 et le refus de
  `three.js`
- [ADR-0024](../adr/0024-une-section-a-la-fois-dans-un-contenu-borne.md) —
  la décision d'origine (colonne de navigation, une section à la fois,
  révoquée par `ADR-0029 §1`/§2) et l'absorption de `bug-016` (§3, en
  vigueur)
- [ADR-0017](../adr/0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md)
  — le critère d'absorption d'un bug dans le cycle qui livre la garde qu'il
  désarme, appliqué à `bug-017` (porte d'authentification rendue inerte)
- [ADR-0022](../adr/0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md)
  — la décision derrière la séparation des deux familles de jetons
- [ADR-0033](../adr/0033-le-theme-sombre-est-supprime.md) — le thème sombre
  est retiré, la page devient mono-thème
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
