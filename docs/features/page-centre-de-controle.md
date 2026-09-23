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
Le cockpit adopte l'intégralité de la maquette Material 3 fournie par
l'utilisateur (`control-center/maquettes/2026-09-20-maquette-materiel-3.html`,
réouverture de périmètre du 2026-09-22, [ADR-0039](../adr/0039-la-fidelite-a-la-maquette-prime-sur-les-restrictions-anterieures.md)) :
barre supérieure (voir « Barre supérieure »), bande de résumé, zone de
travail avec le graphe d'agents à gauche, kanban pleine largeur en dessous
(voir « Kanban et actions du backlog »), feuille de détail d'un passage
(bottom sheet), et un panneau de conversation permanent avec Claude
(voir « Conversation avec Claude »).

### Sept sections héritées, retirées (`feature-028`, `ADR-0043`)

`feature-021` (lot 3) avait empilé l'intégralité de l'ancien tableau de bord
**sous** le mono-écran, avec un verdict écrit par section dans sa table
« U1 — ce qui disparaît pour de bon » : cinq verdicts sur six n'avaient
**jamais** été appliqués, et la case de clôture qui l'affirmait
(« 0 `role="tab"` ») ne le mesurait pas — voir
[ADR-0043](../adr/0043-feature-028-absorbee-au-titre-dadr-0017.md). La dette
est soldée par `feature-028` : `agents`, `systeme`, `demande`, `pilotage`,
`cycles` (l'accordéon) et `fichiers` **ont disparu du DOM**, chacune avec un
verdict et, quand une information n'avait nulle part où migrer, un retrait
**assumé** plutôt qu'une migration inventée :

- **`agents`** — supprimée entière ; l'identité couleur/sigle par agent
  survit dans la légende du diagramme.
- **`systeme`** — supprimée, **sans migration** (décision humaine explicite,
  au-delà de ce que `U1` demandait) : Dépôt/Fichiers touchés dupliqués dans
  `.repo-strip` ; Divergences dupliquée dans `#compteur-specs` ; Budget
  max/Écrivains et Workflows avaient un second porteur (la note de plafond
  du panneau `pilotage`, la légende de l'accordéon `cycles`) qui a lui-même
  disparu au fil du même cycle — **ces deux informations ne sont plus
  affichées nulle part**. « Configuration : lue/défauts » n'avait aucun
  doublon et disparaît sans autre trace.
- **`demande`** (« Que souhaitez-vous développer ? ») — supprimée **une fois
  seulement** que `#add-item-dialog` (le `+`) a repris sa fonction (voir
  « Kanban et actions du backlog » ci-dessous) : jamais un second chemin.
- **`pilotage`** (panneau générique « Piloter par clé ») — supprimé : la
  configuration réelle ne déclare que `demo`/`lent`, deux commandes
  d'exemple sans usage réel ; le lancement et l'interruption **par carte**
  restent pleinement fonctionnels, ils réutilisent l'état d'exécution
  partagé, pas cette section. ⚠️ Si une commande réelle est un jour déclarée
  dans `[commandes]`, elle n'aura plus aucun point d'accès générique — perte
  sous une **condition d'environnement**, pas sous une décision de
  conception.
- **`cycles`** (l'accordéon) — supprimé, une fois les onglets « Cycle
  actif »/« Historique » câblés (voir « Sélecteur de cycle » plus bas) : les
  propriétés agrégées d'un cycle (outils, fichiers écrits, rebouclages,
  agents simultanés) et la chaîne textuelle des segments **disparaissent
  sans remplaçant**, retrait assumé, même forme que le retrait des diffs.
- **`fichiers`** (« Fichiers touchés ») — supprimée : « la consultation des
  diffs ne va nulle part » (décision humaine). Le compte de fichiers touchés
  reste lisible via `.repo-strip` ; `/api/diff` est **retirée** (aucun
  appelant frontal, Règle absolue n°1).

Une garde de non-régression (`test_app_u1_navigateur.py`) dérive sa liste
d'ids attendus **en parsant la table `U1` dans la spec close elle-même** :
altérer le texte de la décision fait échouer la garde, pour qu'un futur
changement de verdict ne puisse plus laisser la garde derrière lui.

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

## Barre supérieure

Livrée au lot 7 de `feature-021` étendu (réouverture du 2026-09-22). Les
**sept** contrôles du prototype sont repris avec leur markup, leurs classes
et leurs cibles de 48 px — leur exclusion initiale au lot 0 reposait sur
une lecture erronée d'`ADR-0020` (l'ADR ne mentionne ni projet, ni barre, ni
switcher, ni avatar, ni notification ; il interdit les **comptes et rôles
multiples**, pas un sélecteur de projet), corrigée par
[ADR-0039](../adr/0039-la-fidelite-a-la-maquette-prime-sur-les-restrictions-anterieures.md) §2.

- **`#projet`** (`.project-switcher`) — fusionné avec le sélecteur de
  projet du prototype (celui-ci ne le câble nulle part dans son script :
  le reproduire **inerte** est la fidélité, pas un compromis).
  `aria-disabled="true"` (jamais `disabled`, qui sortirait l'élément du
  parcours clavier), motif « un seul projet configuré » écrit en **texte
  visible**, pas seulement dans l'`aria-label`.
- **`#notification-button`**, badge — repris inerte, même motif ;
  **le badge « 3 » de la maquette est retiré** (donnée d'exemple, pas une
  vraie notification) et posé `hidden` en permanence.
- **`#account-button`, avatar, `#user-name`** — affichent l'identité
  **git réelle** du développeur, jamais une fabrication : `vcs.identite()`
  (`control-center/backend/vcs.py`) lit `git config --get user.name`,
  tronqué à 80 caractères, exposé dans `/api/etat.identite`. Jamais
  `user.email`, `getlogin()` ni `$USER`. L'avatar porte des initiales
  dérivées de ce nom réel.

Les contrôles sans autre arbitrage possible (project-switcher,
notifications) reçoivent le même traitement inerte-avec-motif ; aucun n'a
d'effet `:hover`.

### `#cycle-title` — le titre du cycle affiché dans la zone de travail

`#cycle-title` (le `<h1>` de `.cycle-surface`, `aria-labelledby` de la
région principale) n'appartient pas à la barre supérieure mais à la zone de
travail, au-dessus du graphe d'agents. Il affiche **« Cycle #N »**
(`indice_cycle`) quand la spec du cycle n'est pas connue, et le **titre de
la spec** quand le cycle a été lancé depuis le cockpit
(`POST /api/spec/lancer`, voir « Kanban et actions du backlog » ci-dessous)
— jamais le vide, jamais une chaîne vide au premier rendu ni à la fin d'un
cycle. Pour un cycle **observé** (pas lancé depuis le cockpit), le constat
d'[ADR-0023](../adr/0023-un-cycle-observe-ne-porte-pas-de-nom.md) reste
entier : aucune corrélation heuristique, seulement « Cycle #N ». Le cas
« lancé depuis le cockpit » est l'amendement apporté par
[ADR-0039](../adr/0039-la-fidelite-a-la-maquette-prime-sur-les-restrictions-anterieures.md) §3.

## Kanban et actions du backlog

Livré aux lots 9-10 de `feature-021` étendu (`feature-025`, absorbée).
Trois colonnes lues depuis `GET /api/etat.colonnes`
(`[{repertoire, classe, libelle}]`), **jamais** figées à `Todo`/`Doing`/
`Done` — renommer une colonne dans `control-center.toml` suffit à la voir
suivre à l'écran ([ADR-0003](../adr/0003-colonne-spec-depuis-repertoire.md)).
Chaque spec est une carte (`.feature-card`), avec un menu contextuel
(`#context-menu`, `role="menu"`) portant les actions disponibles selon sa
colonne.

### Lancer un cycle pour une spec

`POST /api/spec/lancer {cle, spec_id}` — disponible sur les specs de la
**première** colonne seulement (position, jamais un nom codé en dur). Le
cycle qui en résulte connaît sa spec dès son lancement : `#cycle-title`
l'affiche (voir « Barre supérieure »).

### Modifier une spec

`POST /api/spec/modifier` procède par **compare-and-write atomique** :
l'écran envoie l'`empreinte` (SHA-256) lue au dernier chargement de la
spec ; un écart — édition concurrente, dans le cockpit ou hors de lui — est
refusé (`409`), la carte affiche l'erreur, rien n'est écrasé.

### Supprimer une spec — la seule action destructive

`#delete-dialog` exige une **confirmation nommant exactement la spec** — la
maquette ne montre qu'un Oui/Non, mais la fidélité cède ici devant la
sécurité (Règle absolue n°4), et c'est un écart déclaré. La suppression
échoue (`409`, expliqué) si la spec n'est pas suivie par git ou porte des
modifications non commitées : au delà de ce cas, la réponse porte le plan
de retour arrière **exécutable** (`git checkout <sha> -- <chemin>`), que
l'écran n'exécute jamais lui-même. Voir
[ADR-0040](../adr/0040-les-chemins-decriture-du-cockpit.md) pour le détail
du mécanisme et des conditions de sécurité.

### Interrompre un cycle depuis le menu `⋮` de sa carte (`feature-028`)

Remplace le panneau générique `pilotage` (retiré, voir plus haut) pour ce
seul usage : l'item « Interrompre » du menu contextuel n'apparaît **que**
sur la carte dont la spec est le lancement **courant**
(`data-interrompable`, dérivé d'`etat.lancement_spec_id`). `POST
/api/interrompre {spec_id}` cible désormais **exactement** le lancement
dont le `spec_id` est égal, parmi tous les lancements actifs — jamais le
dernier écrivain basculé, qui pourrait désigner un autre lancement que
celui de la carte cliquée (voir `control-center/README.md`, Étape D).

⚠️ « Demander l'arrêt » depuis la conversation Claude (panneau ci-dessous)
**n'est pas** ce mécanisme : ce sont deux processus distincts, et le texte
tapé dans le pty de la session remote est mis en file, jamais traité comme
une interruption immédiate. Aucun bouton ni libellé « interrompre » n'existe
sur ce chemin.

### `#add-item-dialog` — le `+` crée réellement une spec (`feature-028`)

Câblé sur décision humaine du 2026-09-23 (« la fonction *ajouter un élément*
sert justement à ça ») : il n'était pas un arbitrage à rendre mais une
fonction laissée **inerte** par `feature-021`, qui n'en avait repris que le
markup pour la fidélité structurelle. Il entre dans la **même** machine à
états que la rédaction de spec (`feature-008`/`feature-024`) — un clic
produit un **brouillon seul** (`POST /api/spec/brouillon`), l'écriture
(`POST /api/spec/ecrire`) n'a lieu qu'après **deux gestes explicites** :
relecture du Markdown généré, puis confirmation. Jamais les deux routes
enchaînées automatiquement — c'est cette relecture humaine qui porte la
garantie que le GATE de `feature-008` avait posée, et que ce lot ne
supprime pas silencieusement.

Un champ **titre** a été ajouté au formulaire (absent du prototype) : le
slug, donc le nom de fichier, en dérive — jamais du contenu. `#item-priority`
n'a **aucun** champ serveur correspondant : conservé à l'écran (fidélité au
prototype adopté) mais rendu **réellement `disabled`**, pas seulement
`aria-disabled`, pour qu'aucune valeur choisie n'y soit jetée en silence.
La dérogation « gabarit minimal » (`CLAUDE.md` l'impose pour un bug simple
ou un refactor ponctuel) a un équivalent dans cette boîte
(`#item-derogation-minimale`), indépendant du type choisi.

#### La boîte reste utilisable clavier virtuel affiché

Le rapport initial (« la popup […] rétrécit en hauteur […] jusqu'à devenir
inutilisable ») avait deux causes, pas une seule : le viewport statique
(`100vh`, qui ignore le clavier virtuel sur iOS — corrigé par un repli
`100dvh` sur les quatre puis cinq occurrences du fichier de style, y compris
`.claude-panel` posé entre-temps par `feature-026`) **et** une grille CSS à
quatre enfants directs mais deux rangées seulement déclarées — les deux
enfants non couverts tombaient dans des rangées implicites qui ne se
compriment jamais, écrasant la seule rangée défilante à `0px` et repoussant
les actions hors de la boîte (`document.elementFromPoint` sur le bouton
rendait `null` : inatteignable, pas seulement hors de vue, à 413 px de
viewport mesuré). Les deux enfants errants ont été déplacés à l'intérieur
de la zone défilante plutôt que de complexifier la grille.

### La barre de progression du backlog

`.progress-track` (linéaire, 6 px, sur chaque `.feature-card`) est livrée
**sans aucun pourcentage inventé**. Un ratio de cases cochées dans la spec a
été mesuré puis écarté : **36 %** sur une spec jamais commencée (les cases
du gabarit qui ne sont pas des livrables gonflent le compte) — aussi
trompeur qu'un pourcentage inventé, seulement déguisé en donnée réelle. La
grandeur retenue est **l'état de colonne** de la carte (première /
intermédiaire / dernière), à **trois largeurs fixes** (12 % / 55 % / 100 %),
jamais une division (`PIEGES §16`, motif conservé, exclusion levée par la
réouverture de périmètre — [ADR-0039](../adr/0039-la-fidelite-a-la-maquette-prime-sur-les-restrictions-anterieures.md) §5).
L'élément est décoratif : la colonne porte déjà cette information au
clavier et au lecteur d'écran par son titre, la barre n'en est qu'un
renfort visuel. Un `aria-valuenow` sur cet élément est un défaut : sa présence fait échouer
la garde de conformité dédiée.

## Conversation avec Claude

Livrée au lot 11 de `feature-021` étendu (`feature-022`, absorbée), puis
**rebranchée** sur la session Claude remote persistante par `feature-026` :
`#conversation` n'affiche plus le fil d'un lancement du cockpit, mais celui
de la **vraie** session que l'humain pilote déjà (téléphone, `tmux
attach`). Pourquoi taper dans le pty de cette session plutôt qu'ouvrir un
second processus : [ADR-0042](../adr/0042-parler-a-une-session-quon-ne-detient-pas.md).

### Destinataire affiché, jamais deviné

`#claude-destinataire-valeur` affiche le destinataire **brut** renvoyé par
le backend (`"session tmux '<nom>'"`, ou, si `[session]` n'est pas déclarée,
`"lancement '<cle>' (pid <pid>)"`), visible **avant** le premier
`GET /api/conversation` réussi — un basculement silencieux de destinataire
ferait atterrir un message dans le mauvais terminal. `#conversation-portee`
rappelle en permanence que les étapes d'outils et le raisonnement interne
de Claude ne sont **pas** repris : seuls les messages échangés apparaissent.

### La pastille a trois états, pas quatre

`#claude-status` : **En ligne**, **Hors ligne**, **Injoignable** — un
quatrième état « Occupée » a été conçu puis **retiré** en cours de cycle
(`ux-ui-designer`, reboucle du 2026-09-22) : il ne codait rien que la
maquette normative connaisse, et il servait à **bloquer l'envoi**, ce qui
s'est révélé faux (voir plus bas). L'information « Claude travaille » vit
désormais **dans le fil**, jamais dans le badge : un indicateur d'activité
(région `aria-live` déjà existante) l'affiche, avec le `title`
d'incertitude qui accompagnait autrefois la pastille.

### Écrire pendant que Claude travaille est accepté, pas refusé

Le composeur n'est **jamais** rendu inerte parce que Claude travaille : un
message tapé pendant une réponse en cours est **mis en file** par `claude`
lui-même (mesuré sur le transcript réel : `promptSource: "queued"`) et
traité, dans l'ordre, une fois la tâche en cours terminée — rien n'est
perdu, rien n'est corrompu. Le `409` reste possible, mais **réactif**, sous
deux formes discriminables : un dialogue est détecté (permission, écran de
confiance) — modale `<dialog>` dédiée — ou un brouillon est déjà présent
dans le composeur — note inline. Les deux textes sont explicitement qualifiés
d'**heuristique**, jamais présentés comme une garantie : la fenêtre entre la
lecture de l'écran et l'envoi ne se ferme jamais complètement.

### Ce que le cockpit refuse d'envoyer, et pourquoi

Un texte portant un caractère de contrôle, `DEL` ou un caractère C1 est
refusé (`422`) — effaçant ou perturbateur dans un terminal, même quand il
est inoffensif pour le canal `json-lines` historique. Une ligne commençant
par `/` ou `!` est refusée (`422`, irréversibilité) : `/exit`, `/logout`,
`/clear` tapés depuis le cockpit ne se rattrapent pas depuis lui, et
`/resume` n'existe pas en Remote Control — la session ne se relance qu'au
démarrage du service.

### Persistance et repli

Le fil reste **persistant** (transcript de la session, hors dépôt) : fermer
puis rouvrir l'onglet ne le perd pas, et un bornage en nombre de messages et
en octets (jamais le fichier entier) s'applique à chaque lecture. Le canal
`json-lines` d'un lancement du cockpit (`feature-022`) reste la cible par
défaut quand `[session]` n'est pas déclarée en configuration — comportement
**inchangé** ; voir `control-center/README.md`, Étape I, pour le détail des
deux chemins et de leurs codes d'erreur.

### Hauteur bornée (`feature-026`)

`.claude-panel` se plafonne à `58vh`/`58dvh` (repli déclaré, même convention
que `.kanban-viewport`) : le fil défile **à l'intérieur** du panneau plutôt
que d'étirer toute la page. Le panneau ne suit un message neuf que si
l'utilisateur y était déjà en bas — jamais de saut forcé sur quelqu'un qui a
remonté l'historique.

## Identité d'agent : le texte, plus la couleur

Jusqu'au lot 3 de `feature-021`, chaque agent affiché recevait une couleur
propre dérivée de son rôle (`--a-<rôle>` / `--f-<rôle>`). Le **lot 4**
retire ces 19 jetons (plus `--rebouclage`, qui en dépendait) de
`control-center/web/app.css` : ils ne sont pas déplacés, ils **disparaissent
de toute la feuille**, vérifié par mutation
([ADR-0032](../adr/0032-l-identite-coloree-des-agents-disparait-du-diagramme.md),
note du 2026-09-21). Un agent se reconnaît désormais **uniquement par son
sigle et son nom** — le sigle à deux lettres reste calculé sans collision
(`sigleAgent`/`siglesAgents`, `control-center/web/app.js`), mais il n'a plus
de couleur de fond dédiée. Le sigle « AP » reste réservé à l'agent principal.

La couleur redevient **exclusivement sémantique** : elle porte un état
(actif, terminé, en échec, sans clôture) via un unique jeton `--state-color`
par disque, jamais un rôle. Voir la section « Diagramme du déroulé »
ci-dessous pour le détail des jetons d'état.

## Sélecteur de cycle : « Cycle actif » / « Historique » (`feature-028`)

Remplace l'ancien affichage en **accordéon** des « workflows observés »
(`feature-016`), retiré par `feature-028` avec ses deux informations
**perdues sans remplaçant** (décision humaine assumée, même forme que le
retrait des diffs) : les **propriétés agrégées** d'un cycle (outils,
fichiers écrits, rebouclages, agents simultanés) et la **chaîne textuelle**
des segments. La légende de bornage de l'accordéon (« N sur M cycles
affichés », « N événement(s) sans session associée ») disparaît avec lui et
n'est affichée nulle part ailleurs.

`.cycle-tabs` porte deux **modes d'affichage du même** `#cycle-canvas`/
`.detail-sheet` — jamais deux panneaux, jamais `role="tab"` (le mono-écran
de `feature-021` n'est pas rouvert) :

- **`#cycle-tab-actif`** — le cycle en cours, ou le plus récent.
- **`#cycle-tab-historique`** — active `#cycle-indice`, qui devient le
  **sélecteur réel** : un clic avance d'un cycle vers le précédent, boucle
  après le plus ancien. C'est désormais le **seul** endroit du DOM
  permettant de voir un cycle passé.

Le diagramme (voir « Diagramme du déroulé » plus bas) et la feuille de
détail (bottom sheet) restent la seule représentation d'un cycle, actif ou
passé — voir [ADR-0014](../adr/0014-bornage-des-cycles-par-marqueur-declare.md)
pour ce que « cycle » désigne et [ADR-0023](../adr/0023-un-cycle-observe-ne-porte-pas-de-nom.md)
pour ce que `#cycle-title` affiche.

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
  à l'intérieur d'un seul cycle, jamais un cycle lui-même. Le sélecteur de
  cycle de cette page (ci-dessus) ne s'appuie pas sur `segments[]` mais sur
  la liste de workflows rendue par `reconstruire()`.

## Diagramme du déroulé

**Grammaire réécrite au lot 4 de `feature-021`** (`ADR-0031`) : ce qui suit
remplace intégralement l'ancienne grammaire (diamètre fonction de la durée,
graduations comptant les appels d'outils, liseré des fichiers en continu),
révoquée dans son ensemble. Pour le cycle affiché par le sélecteur (« Cycle
actif » ou « Historique », voir plus haut), le diagramme SVG dessine un
**disque par agent**, relié en séquence,
fidèle au bit près au prototype Material 3
(`control-center/maquettes/2026-09-20-maquette-materiel-3.html`). Au-dessus
du disque : le **nom** de l'agent. En dessous : la **durée seule** — l'heure
de départ, affichée jusqu'au lot 3, n'a plus d'emplacement. Le sigle de
l'agent principal est **AP**, jamais « ?? » — même les cycles qui ne
contiennent que lui.

### Ce que le disque encode

- le **diamètre** : fonction de l'**état**, plus de la durée — 52 px non
  lancé, **88 px actif ou terminé** ; deux agents de durées très différentes,
  tous deux actifs, ont le même diamètre ;
- l'**anneau d'activité** (`--progress` sur `.agent-node`, porté par un
  pseudo-élément `::before` dédié — pas le disque entier, qui ferait tourner
  le texte) : éteint au repos (`0deg`), **arc fixe à 270° mis en rotation**
  pendant que l'agent travaille, **complet et stable** à `360deg` une fois
  terminé — trois valeurs **fixes** par classe d'état, jamais une division :
  il ne code jamais une proportion chiffrée (aucun total final connu pour un
  passage en cours, `ADR-0031 §5`). Une garde interdit de le recoupler aux
  tokens du centre ;
- **12 graduations radiales**, fixes, purement décoratives — elles ne
  comptent plus les appels d'outils ;
- **3 pastilles de fichiers**, allumée/éteinte (binaire, plafonné à 3) — un
  passage à 4 fichiers et un passage à 40 fichiers dessinent pareil ;
- le **centre** porte le **sigle** de l'agent et, depuis la réouverture du
  2026-09-22 (`feature-023`, absorbée), la somme `input_tokens +
  output_tokens` du passage **quand elle est connue**. Trois états, jamais
  deux : chiffre connu ; chiffre **absent** (le nœud n'existe pas dans le
  DOM — jamais un `0`, un `—` ni un espace vide) ; relevé **partiel**
  (le budget de lecture des transcripts de sous-agent a coupé avant terme —
  dit explicitement, jamais confondu avec l'absence). La lecture se fait
  hors de la racine du dépôt, confinée et bornée : voir
  [ADR-0041](../adr/0041-lecture-hors-racine-compteurs-seulement.md). Le
  disque reste **dégradable** — il fonctionne sans ce chiffre — et jamais
  *à trous* : rien n'est réservé à sa place.

Les appels d'outils et le compte exact de fichiers restent mesurés dans le
journal ; ils ne sont simplement plus peints sur le disque. Leur affichage
détaillé vit dans la **feuille de détail** (`.detail-sheet`, bottom sheet
Material 3) qu'ouvre un clic sur un disque, livrée au lot 5 — elle dit ce
que le chiffre du centre compte, et ce qu'il ne compte pas (tokens
d'entrée/sortie, pas le cache).

### Trois états, plus trois représentations ajoutées

Le prototype ne connaît que trois états — `state-pending`, `state-active`,
`state-done` — colorés par un unique jeton `--state-color` par disque
(actif = `--primary`, terminé = `--agent-state-done`, non lancé =
`--agent-state-pending`). Quatre représentations que la maquette ne portait
pas ont dû être inventées pour ce cycle, chacune **ajoutée** au disque et non
une variante de ces trois états :

- **l'échec** (`.has-echec`) — l'anneau se recolore en `--danger` **et** un
  drapeau glyphé « ! » se pose en périphérie ; deux moyens redondants,
  jamais la seule couleur ;
- **le « sans clôture »** (`.state-sans-cloture`) — contour pointillé **et**
  drapeau « ⋯ ». Cet état est dérivé du champ `etat === "sans_cloture"` du
  journal, jamais d'une absence de `SessionEnd` observée (`SessionEnd` ne se
  déclenche jamais sur une session longue — voir la mémoire de projet). Un
  passage dont la fin n'a pas été observée **n'est pas un échec** : les deux
  représentations ne se cumulent jamais sur le même disque ;
- **l'agent principal** (`.role-principal`) — anneau pointillé secondaire en
  périphérie (`.role-ring`) et sigle souligné ;
- **le non-chevauchement des libellés** — chaque disque réserve, de chaque
  côté, la moitié du plus exigeant entre son diamètre maximal possible
  (88 px, jamais 52 — un agent qui s'active ne doit jamais chevaucher son
  voisin) et son libellé (nom ou durée) le plus large. Calculé par
  `disposer()`, jamais par la feuille de style.

### Lecture du déroulé

La zone porte le titre « **Déroulé** » et une phrase d'avertissement :
« l'écart horizontal sert la lisibilité, il ne mesure pas le temps ». Le
temps se lit sous chaque disque, il ne se mesure pas en distance.

**Les agents simultanés** (par exemple `code-reviewer` et `security-reviewer`
qui tournent ensemble) occupent un seul créneau et s'empilent verticalement
sur le même axe horizontal, reliés au créneau précédent et au créneau
suivant. **Un rebouclage** (une reprise du même agent) est relié à sa
précédente occurrence par un arc séparé, élevé au-dessus du rang, en trait
pointillé corail animé (`.is-reprise`) — distinct du connecteur séquentiel
(plein pour un lien déjà parcouru, pointillé teal animé pour un lien en train
de se parcourir).

Une légende fixe, au-dessus de la zone, rappelle ce que chaque couleur
signale (actif, travail en parallèle, reprise, non lancé).

### Accessibilité

Chaque disque est un bouton, porteur d'un `aria-label` complet (agent, état,
et le cas échéant « en échec », « sans clôture », « agent principal »). La
zone de défilement prend le focus clavier (`role="group"`) et se parcourt
aux flèches gauche/droite, `Home`/`End`.

### Mouvement réduit (`prefers-reduced-motion`)

Quand l'utilisateur ou le système demande une réduction du mouvement, toutes
les animations et transitions du diagramme sont supprimées — anneau
d'activité, graduations, connecteurs. **L'état final reste compréhensible
sans elles** : un disque actif reste visuellement distinct d'un disque
terminé par sa taille, sa couleur et ses pastilles, pas seulement par son
mouvement.

### Défilement et accès clavier

La zone défile **horizontalement** quand le tracé dépasse la largeur
disponible ; elle ne se comprime jamais. Molette seule = la page ; `Maj` +
molette ou glisser = la zone.

### Séparation géométrie / rendu

`control-center/web/diagramme.js` calcule la géométrie complète (un module
pur, sans DOM ni couleur) ; `control-center/web/app.js`
(`construireDiagramme`, `construireGrapheAgents`, `construireDisqueAgent`) la
transforme en HTML/SVG. Aucune dimension n'est recalculée séparément dans les
deux modules — un même calcul fait autorité sur la géométrie et sur la place
qu'elle réserve (`ADR-0031 §4`, qui maintient `ADR-0025 §4` malgré la
révocation du reste de cet ADR). Voir
[ADR-0031](../adr/0031-la-grammaire-du-disque-d-agent-change.md) pour la
grammaire complète, les cinq pertes nommées et les alternatives écartées, et
[ADR-0032](../adr/0032-l-identite-coloree-des-agents-disparait-du-diagramme.md)
pour la disparition de la couleur d'identité par agent (section
« Identité d'agent » ci-dessus).

## Voir aussi

- `docs/DESIGN-SYSTEM.md` — règles visuelles complètes, méthode de palette,
  grammaire du diagramme, §3 (surfaces), §4 (typographie), §6 (sélecteur de
  cycle)
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
  — la méthode de palette catégorielle par agent, §1-§3 révoqués par
  `ADR-0032`, §5 sans objet, §6-§7 dormants (réutilisables sans réinvention
  si une identité colorée revient)
- [ADR-0033](../adr/0033-le-theme-sombre-est-supprime.md) — le thème sombre
  est retiré, la page devient mono-thème
- [ADR-0023](../adr/0023-un-cycle-observe-ne-porte-pas-de-nom.md) — pourquoi
  un cycle **observé** n'est jamais désigné par un nom de spec (amendé par
  `ADR-0039` §3 pour un cycle lancé depuis le cockpit)
- [ADR-0014](../adr/0014-bornage-des-cycles-par-marqueur-declare.md) — le
  bornage des cycles, et ce que `[workflows] affiches` tronque
- [ADR-0025](../adr/0025-grammaire-du-diagramme-de-deroule.md) — la grammaire
  d'origine du diagramme (cercle fonction de la durée) ; §1-§3 **révoqués**
  par `ADR-0031`, §4 (séparation géométrie/rendu) **maintenu**
- [ADR-0026](../adr/0026-trois-echelles-du-diagramme-alignees-sur-la-maquette.md)
  — le rayon, les graduations et le liseré des fichiers alignés sur
  l'ancienne maquette de référence ; **révoqué en entier** par `ADR-0031`
- [ADR-0031](../adr/0031-la-grammaire-du-disque-d-agent-change.md) — la
  grammaire actuelle du disque Material 3 (lot 4 de `feature-021`), les cinq
  pertes nommées et l'anneau d'activité sans progression chiffrée
- [ADR-0032](../adr/0032-l-identite-coloree-des-agents-disparait-du-diagramme.md)
  — la disparition de l'identité colorée par agent, appliquée au code au
  lot 4 (voir la note du 2026-09-21 dans l'ADR)
- [ADR-0038](../adr/0038-la-methode-du-cycle-2-gardes-avant-code-registre-borne-bug-017-absorbe.md)
  — la méthode du cycle 2 (gardes avant code, registre `ATTENDU_ROUGE`,
  absorption de `bug-017`) et le constat que le chiffre du centre du disque
  est finalement livré (§5)
- [ADR-0039](../adr/0039-la-fidelite-a-la-maquette-prime-sur-les-restrictions-anterieures.md)
  — la réouverture de périmètre du 2026-09-22 : barre supérieure, backlog,
  conversation, et la garde de fidélité d'ensemble
- [ADR-0040](../adr/0040-les-chemins-decriture-du-cockpit.md) — lancer,
  modifier et supprimer une spec, converser avec un agent en cours ; amende
  `ADR-0005` et `ADR-0019`
- [ADR-0041](../adr/0041-lecture-hors-racine-compteurs-seulement.md) —
  lecture des transcripts de sous-agent hors racine, compteurs seulement,
  budget par instantané
- [ADR-0042](../adr/0042-parler-a-une-session-quon-ne-detient-pas.md) — le
  panneau de conversation rebranché sur la session Claude remote
  persistante, pourquoi taper dans son pty plutôt qu'ouvrir un second
  processus, et l'amendement d'`ADR-0041`
- [ADR-0043](../adr/0043-feature-028-absorbee-au-titre-dadr-0017.md) — la
  dette `U1` de `feature-021` (sept sections héritées) soldée par
  `feature-028`, absorbée au titre d'`ADR-0017`
- [ADR-0044](../adr/0044-verifier-le-mecanisme-nest-pas-verifier-la-chose.md)
  — la méthode tirée du cycle `feature-026`/`feature-028` : sept défauts
  trouvés par l'usage humain, aucun par la chaîne d'agents
- `control-center/README.md` — modèle de déploiement, jeton d'accès, et le
  contrat des routes d'écriture (§ Étapes D à J, et l'Étape I+ pour la
  session Claude remote)
