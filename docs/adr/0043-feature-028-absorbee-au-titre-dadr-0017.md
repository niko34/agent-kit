# ADR-0043 — `feature-028` absorbée dans le cycle de `feature-026`, au titre d'`ADR-0017`

## Statut

Accepté

## Date

2026-09-23

## Contexte

`CLAUDE.md` pose la règle « une spec à la fois », et `ADR-0017` en fixe la
**seule** exception : un défaut qui rend inatteignable la garde que le cycle
en cours s'apprête à livrer se traite **dans ce cycle**, avant elle — pas
reporté, pas jugé « au cas par cas », mais établi **par exécution**. Le
critère est mécanique : la garde que le cycle livre reste-t-elle atteignable
en présence du défaut ?

Le cycle de `feature-026` (le cockpit parle à la session Claude remote)
touchait à sa clôture le 2026-09-23 quand l'humain a signalé, depuis son
usage réel du cockpit :

> « Tous les cadres sous celui des spécifications ne me semblent pas
> utiles. […] La popup pour ajouter une spécification rétrécit en hauteur
> lorsque le clavier de mon iPad est affiché […] jusqu'à devenir
> inutilisable. »

Vérification faite dans `index.html` : la section « U1 — ce qui disparaît
pour de bon » de `feature-021` (spec **déjà close**) porte un verdict écrit
par section, et **un seul sur six avait été appliqué** (`.table-passages`
seul ; `agents`, `systeme`, `fichiers`, `evenements` restaient tous
**visibles**, `#compteur-prompt` aussi).

### Ce que ce constat dit d'une clôture antérieure

`feature-021` a été close par l'agent principal avec la case
`F7 — structure mono-écran ; 0 role="tab"` cochée : la garde vérifiait
**la lettre** (aucun `role="tab"` dans le DOM — vrai) et **jamais la chose**
(l'ancien tableau de bord a disparu — faux). La dette a donc traversé une
revue de code, une campagne de mutation et une clôture complète, parce
qu'aucune des trois ne mesurait l'énoncé réel de `U1`.

## Pourquoi c'est le critère d'`ADR-0017`, pas une simple opportunité

Le cycle de `feature-026` s'apprêtait à clore un cockpit livré « mono-écran,
fidèle à la maquette Material 3 ». Cette garde — livrée par `feature-021`,
jamais rouverte depuis — n'était **atteignable** que sur le papier : sept
cadres hérités restaient visibles sous le panneau des spécifications, et le
`+` (bouton d'ajout) ouvrait une boîte qui ne créait rien. Clore
`feature-026` sans traiter ce constat revenait à **annoncer** un mono-écran
fidèle tout en sachant qu'il ne l'était pas — exactement la situation
qu'`ADR-0017` a été écrit pour ne plus laisser passer (`bug-008`/`bug-009`,
puis `bug-017`/`bug-019`, déjà absorbés par ce même critère dans des cycles
antérieurs).

`feature-028` (« le cockpit tient sur un iPad — et n'affiche plus ce qu'il a
remplacé ») existait déjà, prête, décrivant précisément cette dette. Décision
humaine : « Absorbe, absorbe. »

## Décision

`feature-028` est absorbée dans le cycle de `feature-026`, au titre d'
`ADR-0017`. Le cycle porte **deux specs** dans `doing/` en simultané, avec
**une seule** phase de test, de revue de code et de documentation pour les
deux — pas deux passages distincts.

Conséquence directe sur le contenu de `feature-028` : son livrable `A1`
cesse d'être un arbitrage à rendre (« retirer / replier / conserver » les
sept sections) pour devenir l'**application d'une décision déjà écrite**
par `U1` de `feature-021`. La spec gagne `A1bis` — une garde de
non-régression, absente jusqu'ici, qui vérifie **par exécution** que chaque
élément qu'`U1` déclare supprimé est effectivement absent du DOM servi.
C'est cette garde-là qui manquait à `feature-021`, et son absence est ce qui
a laissé la dette invisible pendant un cycle entier.

## Alternatives considérées

- **Reporter le constat dans une spec distincte, hors de ce cycle.**
  Écartée : c'est le régime par défaut, et c'est précisément ce qu'`ADR-0017`
  interdit quand le défaut rend inatteignable la garde que le cycle en cours
  livre. Clore `feature-026` en l'état aurait annoncé un mono-écran fidèle
  en sachant déjà que non.
- **Traiter les deux specs comme deux cycles séquentiels malgré tout**,
  sans les absorber formellement. Écartée : la dette touchait directement
  le panneau de conversation que `feature-026` livre (le panneau vit dans la
  même page que les sept cadres, et le plafond de hauteur posé par
  `feature-026` — `.claude-panel { max-height: 58vh }` — devait migrer avec
  les corrections de viewport dynamique de `feature-028`, §D de la spec) :
  les séparer aurait dédoublé la phase de test/revue sur un même diff, sans
  bénéfice.
- **Fusionner les deux specs en un seul fichier.** Écartée, même motif
  qu'`ADR-0017` : `done/` encode l'histoire du projet cycle par cycle,
  chaque spec garde ses propres critères d'acceptation et son propre
  journal de bord ; un cycle peut porter plusieurs specs **sans** qu'elles
  fusionnent.

## Conséquences

### Positives

- La dette de `feature-021` (cinq sections sur six jamais retirées) est
  soldée dans le même mouvement que le cockpit qui les contenait, plutôt que
  de rester documentée comme « à faire » un cycle de plus.
- `A1bis` (garde de non-régression de `U1`, dérivée par parsing de la table
  de la spec **close**, avec clause miroir) empêche qu'un futur changement de
  décision oublie de retirer la garde qui la vérifiait.
- Les corrections de viewport dynamique (`dvh`/`svh` de repli) et le plafond
  de hauteur du panneau de conversation (`feature-026`) sont posés dans la
  même passe, cohérents entre eux dès la livraison plutôt que corrigés l'un
  après l'autre.

### Négatives

- Le coût mesuré : une seule phase de test/revue/documentation a dû couvrir
  deux specs, deux GATE de sécurité distincts (`feature-026` sur l'auth/
  données personnelles ; `feature-028` devenu obligatoire en cours de route
  dès que le `+` a été câblé) et un nombre de reboucles plus élevé qu'un
  cycle simple — le journal de bord des deux specs recense onze arrêts
  volontaires (« BLOQUÉ », décisions humaines demandées) répartis sur les
  deux.
- Deux capacités antérieures disparaissent **sans remplaçant**, assumé
  explicitement plutôt que découvert en silence : la consultation des diffs
  (`/api/diff`, plus aucun appelant frontal) et les propriétés agrégées
  d'un cycle plus la chaîne textuelle des segments (portées par l'accordéon
  « Cycles », retiré).

### Ce que ça verrouille

- Le critère d'`ADR-0017` continue de s'appliquer **mécaniquement** : ce
  n'est pas parce qu'une seconde spec existait déjà, prête, que
  l'absorption a eu lieu — c'est parce que la garde que `feature-026`
  s'apprêtait à livrer (un cockpit mono-écran fidèle) n'était pas
  atteignable sans elle. Un futur cycle ne peut pas invoquer cet ADR comme
  précédent pour absorber une spec **indépendante** de la garde qu'il livre.
- Toute future clôture de spec portant une table de verdicts par section
  (à la manière de `U1`) doit être accompagnée d'une garde d'exécution
  vérifiant chaque verdict, pas seulement d'une case cochée sur un critère
  plus étroit que l'énoncé réel — c'est le constat que `feature-027`
  (méthode) reprend et généralise (voir `ADR-0044`).

## Références

- Decision antérieure : [ADR-0017](0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md)
  — le critère d'absorption, appliqué ici pour la troisième fois documentée
  après `bug-008`/`bug-009` et `bug-017`/`bug-019`.
- Specs : `specs/features/done/feature-021-…md` (section « U1 — ce qui
  disparaît pour de bon », verdicts par section) ;
  `specs/features/doing/feature-028-le-cockpit-tient-sur-un-ipad.md`
  (journal de bord : absorption au 2026-09-23 00:10, décisions humaines
  successives, `A1bis` livrée avec clause miroir).
- Code : `control-center/web/index.html` (commentaires datés marquant
  chaque section retirée et son verdict `U1`) ;
  `control-center/web/test_app_u1_navigateur.py` (garde `A1bis`).
- `ADR-0044` — la méthode tirée de ce cycle : sept défauts trouvés par
  l'usage humain, aucun par la chaîne d'agents, tous derrière une
  vérification qui portait sur le mécanisme plutôt que sur la chose.
