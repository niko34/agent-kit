# Le cockpit tient sur l'écran d'un iPad — et n'affiche plus ce qu'il a remplacé

## Métadonnées

- **ID** : feature-028
- **Slug** : le-cockpit-tient-sur-un-ipad
- **Type** : feature
- **Statut** : todo
- **Priorité** : **haute** — le cockpit est **inutilisable** sur l'appareil depuis lequel
  l'humain s'en sert réellement
- **Version cible** : [à fixer par l'agent qui reprend cette spec]
- **Dernière mise à jour** : 2026-09-22
- **Spec(s) liée(s)** : `feature-021` (a livré le mono-écran M3 **par-dessus** l'ancien
  tableau de bord, jamais à la place — c'est ce que cette spec solde), `feature-024`
  (rédaction de spec par Claude : c'est elle qui détient le vrai chemin d'ajout),
  `ADR-0039` (la fidélité à la maquette prime), `feature-026` (borne la hauteur du seul
  panneau de conversation — **pas** le reste)

## Pourquoi cette spec existe

Trois défauts rapportés par l'humain **depuis son iPad**, le 2026-09-22, en une phrase :

> « Tous les cadres sous celui des spécifications ne me semblent pas utiles. […] La popup
> pour ajouter une spécification rétrécit en hauteur lorsque le clavier de mon iPad est
> affiché, puis elle réduit encore quand je tape quelque chose, jusqu'à devenir
> inutilisable. Parfois elle occupe tout l'écran en hauteur. »

Aucun n'est un détail cosmétique : le premier signifie que **le mono-écran n'a jamais
remplacé ce qu'il devait remplacer**, le second que **la principale surface de saisie est
inutilisable sur l'appareil réel**, et le troisième que le bouton `+` **ouvre une boîte qui
ne crée rien**.

## Grandeurs mesurées

Toutes relevées le **2026-09-22** dans le code servi.

- **Sept sections héritées vivent sous le panneau des specs**, en frères visibles de
  `.backlog`, hors de tout conteneur caché : `titre-agents` (l.392), `titre-systeme`
  (398), `demande` (403), `titre-pilotage` (437), `titre-cycles` (444), `titre-fichiers`
  (453), `titre-evenements` (458).
- ⚠️ **Cinq d'entre elles auraient dû disparaître au cycle `feature-021`**, dont la
  section « U1 — ce qui disparaît pour de bon » porte un verdict écrit par section.
  Mesuré le 2026-09-22 dans `index.html`, **un seul verdict sur six a été appliqué** :

  | Verdict de `U1` | État réel |
  |---|---|
  | `agents` — SUPPRIMÉE entière | **VISIBLE** |
  | `systeme` — « la section n'existe plus » | **VISIBLE** |
  | `cycles` — `.table-passages` SUPPRIMÉE | **appliqué** ✓ |
  | `fichiers` — liste des commits SUPPRIMÉE | **VISIBLE** |
  | `evenements` — SUPPRIMÉE comme panneau permanent | **VISIBLE**, avec son `#timeline` |
  | `developper` — `#compteur-prompt` supprimé | **VISIBLE** |

  ⚠️ **`feature-021` a été CLÔTURÉE dans cet état.** Sa check-list portait
  `F7 — structure mono-écran ; 0 role="tab"` : la garde vérifiait **la lettre** (aucun
  `role="tab"` dans le DOM, vrai) et **jamais la chose** (l'ancien tableau de bord a
  disparu, faux). C'est le même défaut de méthode que `feature-027` documente, et il a
  traversé une clôture complète — revue de code et campagne de mutation comprises.
- **Zéro unité de viewport dynamique** dans `app.css` : `100vh` × 3, `58vh` × 1,
  **aucun** `dvh`, `svh` ni `lvh`. Sur iOS, `100vh` désigne le viewport **large**, celui
  qui **ignore le clavier** : la boîte reste dimensionnée pour l'écran entier pendant que
  la zone visible rétrécit.
- Les deux boîtes concernées : `.feature-dialog` (l.782) et `.add-item-dialog` (l.808),
  toutes deux en `max-height: calc(100vh - 32px)`.
- **La maquette normative porte exactement les mêmes règles** : `100vh` × 3, aucun `dvh`.
  Le cockpit est **fidèle**, la maquette est **incomplète** — elle a été dessinée pour un
  écran de bureau, jamais éprouvée avec un clavier virtuel.
- **Le `+` ouvre une boîte inerte** : `#open-add-item` → `#add-item-dialog`, dont la
  soumission est **INERTE par conception**, écrit en toutes lettres dans `index.html`
  (l.594-599) et dans `app.js` (l.1988-1989) — le markup a été repris du prototype pour la
  fidélité structurelle (`F0` de `feature-021`), et le câblage renvoyé à `feature-024`.
  Le **vrai** chemin d'ajout est le bloc « demande » (`#spec-prompt`, l.415), c'est-à-dire
  l'une des sept sections héritées du premier point.

## Domaines touchés

- [ ] API REST — **sans objet**, aucune route ne change
      ⚠️ **Rectifié à la clôture** : vrai quand la spec a été écrite, **faux du cycle
      réel**. `/api/diff` a été **retirée** (condition C5 du GATE), `/api/interrompre`
      accepte désormais un `{spec_id}` optionnel (condition C3), et le contrat de
      `GET /api/conversation` a changé deux fois (fusion, puis écartement des non-partis).
      La case reste décochée parce qu'elle parle du périmètre **annoncé** ; la note existe
      parce que le cycle, lui, a bien touché l'API.
- [x] Frontend (écrans, composants, mise en page, responsive)
- [ ] BDD / migrations — **sans objet**
- [ ] Auth / permissions — **sans objet**
- [ ] Données personnelles — **sans objet**
- [ ] Intégrations externes · [ ] Tâches de fond

## Agents requis

- [x] orchestrator
- [x] spec-reader
- [x] architect — l'arbitrage « retirer / replier / fusionner » les sept sections engage la
      structure, et `ADR-0031`/`ADR-0039` ont déjà statué sur ce qui disparaît
- [x] ux-ui-designer — **mandat principal**
- [x] frontend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer
- [x] security-reviewer, rôle GATE — **DEVENU OBLIGATOIRE le 2026-09-23** : le `+` est
      câblé, donc une spec s'écrit depuis une boîte, et l'interruption d'un cycle devient
      atteignable depuis deux surfaces neuves. ⚠️ Les routes (`/api/spec/brouillon`,
      `/api/spec/ecrire`, `/api/interrompre`) **existent déjà** et gardent leur chaîne de
      gardes : le GATE juge les **surfaces d'appel**, pas des routes neuves.
- [x] backend-developer — câblage et action d'interruption

## Description

Trois questions, dans cet ordre, parce que la deuxième dépend de la première :

1. **Appliquer `U1` de `feature-021` — la décision est DÉJÀ PRISE, elle n'a pas été
   exécutée.** ⚠️ Ce point a changé de nature le 2026-09-22 : ce n'est **pas** un
   arbitrage à rendre, c'est une **dette** à solder. La section « U1 — ce qui disparaît
   pour de bon » de `feature-021` (spec **close**) porte un verdict écrit par section, et
   **cinq sur six n'ont jamais été appliqués** (mesuré ci-dessous). ⚠️ `demande` et
   `pilotage` **ne sont pas dans `U1`** : elles restent, et `demande` porte le **seul
   chemin fonctionnel** de création de spec.
2. **Les boîtes tiennent-elles avec un clavier virtuel ?** Unités de viewport dynamiques,
   et vérification **sur l'appareil réel**, pas sur un navigateur redimensionné.
3. **Le `+` est CÂBLÉ** (tranché le 2026-09-23). Il n'était pas « à décider » : c'est la
   fonction d'ajout du cockpit, laissée inerte par `F0` de `feature-021` qui n'en reprenait
   que le markup. Un bouton qui ouvre une boîte qui ne crée rien est un mensonge
   d'interface, et il coûte un essai à chaque fois.
4. **L'interruption d'un cycle** se déplace hors de `pilotage` : dans la **conversation
   Claude** et dans le **menu `⋮`** de chaque carte.

## Comportement attendu

**Sur la structure.** Le mono-écran est le livrable de `feature-021` ; ce qui subsiste
sous lui est un reste, pas une décision. Chaque section héritée reçoit **un verdict
écrit** : `retirée` (avec ce qui la remplace), `repliée` (avec le geste qui l'ouvre), ou
`conservée` (avec la raison). Aucune ne reste par défaut.

**Sur la hauteur.** Les boîtes modales se dimensionnent sur le viewport **dynamique**
(`dvh`), avec repli `vh` pour les navigateurs qui l'ignorent, et **jamais** au-delà de ce
qui reste visible quand un clavier virtuel est affiché. Le contenu défile **à
l'intérieur** ; ni les actions, ni le champ en cours de saisie ne sortent de l'écran.

**Sur le `+`.** S'il est câblé, il mène au **même** chemin que le bloc « demande »
(`feature-024`), jamais à un second. S'il est retiré, la fidélité structurelle qu'il
servait (`F0`) est **rouverte explicitement** — on ne retire pas en silence un élément
qu'un ADR a déclaré adopté.

### Cas limites

- Clavier affiché **puis** masqué : la boîte se redimensionne dans les deux sens.
- Rotation de l'appareil clavier ouvert.
- Une section héritée dont le contenu **n'existe nulle part ailleurs** (c'est le cas de
  `demande`) : elle ne peut pas être « retirée » sans transfert.
- Un navigateur sans `dvh` : le repli `vh` doit rester **utilisable**, pas seulement
  syntaxiquement valide.

## Comportement actuel

Le mono-écran M3 s'affiche, puis **sept cadres hérités** le suivent en défilement. Les
boîtes modales se dimensionnent sur un viewport qui ignore le clavier. Le `+` ouvre une
boîte qui valide son formulaire et ne crée rien.

## Contraintes techniques

⚠️ **La maquette ne tranche pas cette spec** : elle porte les **mêmes** `100vh` et ne
connaît ni clavier virtuel, ni sept cadres hérités. `ADR-0039` (« la fidélité prime ») ne
s'applique donc **pas** ici — ce sont des cas que la référence ne couvre pas, et les
inventions doivent être **déclarées** comme telles, au minimum nécessaire.

⚠️ **Se vérifier sur un navigateur redimensionné ne prouve rien** : un clavier virtuel
n'est pas une fenêtre plus petite. La validation exige l'appareil réel — c'est le **plan
de test manuel**, et il est le livrable de vérification principal de cette spec.

⚠️ **`58vh` (l.500) est une quatrième occurrence** à traiter avec les trois autres : une
correction qui n'en couvre que deux laisse un défaut résiduel invisible.

## Fichiers potentiellement concernés

- `control-center/web/app.css` — unités de viewport, hauteurs, mise en page
- `control-center/web/index.html` — les sept sections, le `+` et sa boîte
- `control-center/web/app.js` — câblage du `+` si l'arbitrage le retient
- `docs/features/page-centre-de-controle.md`, `CHANGELOG.md`

## Livrables — check-list

- [x] A1 — **`U1` de `feature-021` appliquée**, verdict par verdict : `agents` supprimée
      entière · `systeme` supprimée (Divergences, Budget max, Écrivains **migrent** en
      pastilles d'un autre panneau) · liste des commits de `fichiers` supprimée ·
      `evenements` supprimée **comme panneau permanent** (sa tranche par passage vit dans
      le tiroir) · `#compteur-prompt` supprimé. `.table-passages` : **déjà fait**, seul
      verdict appliqué en son temps.
      ⚠️ **Réalisé avec un écart assumé sur `systeme`** : décision humaine du 2026-09-23
      (« Supprime système. Je ne souhaite pas que ça aille ailleurs. ») — retrait **sec**,
      sans migration vers un panneau « État du dépôt », au-delà de ce que `U1` demandait.
      Les sept sections sont confirmées **absentes du DOM servi** (journal du 2026-09-23
      09:40).
- [x] A1bis — **garde de non-régression de `U1`** : chaque élément que `U1` déclare
      supprimé est **absent du DOM**, vérifié par exécution. C'est elle qui manquait —
      `F7` de `feature-021` ne vérifiait que « 0 `role="tab"` », soit la lettre et non la
      chose, et c'est pour ça que la dette a traversé une clôture (`test_app_u1_navigateur.py`,
      26 cas, clause miroir dérivée de la table `U1` dans la spec close, 4 mutations tuées)
- [x] A2 — `demande` et `pilotage` **ne sont pas dans `U1`** : conservées **jusqu'à ce que**
      des décisions humaines distinctes (2026-09-23) en tranchent le retrait — via `B3`/`B4`
      pour `demande`, via l'interruption par carte pour `pilotage` (`B5`) — jamais parce que
      `U1` les couvrait
- [x] B1 — unités de viewport **dynamiques** sur les **cinq** occurrences (le brief en
      annonçait quatre puis se contredisait ; `.claude-panel`, posée par `feature-026` après
      la mesure de cette spec, s'y ajoute), avec repli `vh` déclaré (`test_conformite_viewport.js`,
      7 cas, 3 mutations tuées)
- [x] B2 — les boîtes restent utilisables clavier virtuel affiché : actions atteignables,
      champ en cours de saisie visible, défilement interne. Deux causes corrigées, pas une
      seule (`code-reviewer`, revue de code) : les `dvh` **et** une grille CSS à quatre
      enfants mais deux rangées déclarées, qui écrasait la seule rangée défilante à `0px`
- [x] B3 — le `+` est **CÂBLÉ** — tranché par l'humain le 2026-09-23 : « la fonction
      *ajouter un élément* sert justement à ça ». Il mène au **même** chemin que le bloc
      `demande` (`POST /api/spec/brouillon` puis `POST /api/spec/ecrire`), **jamais** à un
      second. ⚠️ Le formulaire du prototype porte déjà `#item-description` et
      `#item-priority` : ce qui manque, c'est le câblage, pas l'écran
- [x] B4 — **`demande` retirée**, une fois `B3` livré et **pas avant** : la retirer
      d'abord supprimerait la seule création de spec du cockpit
- [x] B5 — **`pilotage` retirée**, une fois l'interruption disponible ailleurs. Deux
      chemins demandés par l'humain, non exclusifs : **depuis la conversation Claude**
      (« Pour arrêter un cycle en cours, il devrait être possible de le faire dans la
      conversation Claude ») et **une action dans le menu `⋮` de chaque carte**
      (`/api/interrompre` existe déjà — c'est une action de plus dans un menu livré par
      `feature-025`, pas une route neuve)
- [x] B6 — **garde** : aucune capacité retirée sans remplaçant **atteignable**, vérifié
      par exécution — créer une spec depuis le `+`, interrompre depuis le menu. Mutation :
      neutraliser le câblage doit tuer l'assertion, pas seulement masquer le bouton
- [x] C1 — `docs/features/page-centre-de-controle.md`, `CHANGELOG.md`
- [x] C2 — ADR **si** l'arbitrage retire des éléments qu'`ADR-0031`/`F0` déclaraient
      adoptés (verdict explicite de l'architecte, pas un silence).
      ⚠️ **Écart honnête** : aucune étape distincte « architect » n'a été journalisée sur
      cette spec — les verdicts par section (`demande`, `pilotage`, `cycles`, `fichiers`)
      ont été rendus directement par des décisions humaines explicites, citées mot pour mot
      dans le journal de bord, jamais par un silence. `ADR-0043` documente la décision
      d'absorption et les pertes nommées ; il n'invente pas un passage `architect` qui n'a
      pas eu lieu.
- [x] D1 — garde : **aucune** unité de viewport statique ne subsiste hors d'un repli
      déclaré (mutation : réintroduire un `100vh` nu)
- [x] D2 — garde : la liste des sections de premier niveau sous `<body>` est **dérivée du
      DOM**, jamais récitée, et tout ajout non déclaré échoue (`PIEGES §21`)
- [x] D3 — validation par **mutation** de D1 et D2

## Critères d'acceptation

- [x] Sur l'iPad de l'humain, clavier affiché, la boîte d'ajout reste utilisable —
      **VALIDÉ PAR L'USAGE le 2026-09-23 à 12:49**, et de la façon la plus convaincante
      possible : l'humain s'en est servi pour **écrire une spec réelle**,
      `specs/features/todo/feature-029-amelioration-du-cadre-claude-hauteur-et-gain-de-place.md`
      (8 842 octets), dont la section Description porte **son texte, mot pour mot**. Le
      correctif n'avait été prouvé qu'en Chromium à 413 px ; c'est l'appareil réel qui
      referme le critère, comme la spec l'exigeait.
- [x] Plus aucune section sous le mono-écran sans verdict écrit
- [x] Le `+` ne peut plus ouvrir une boîte qui ne crée rien
- [x] Suite verte root **et** non-root, les deux comptes rendus (1935 cas root / 1852
      non-root, 0 échec, 55 fichiers)
- [x] Chaque garde neuve vue **rouge** puis validée par **mutation**

## Plan de test manuel

**C'est le livrable de vérification principal — il se fait sur l'appareil, pas au bureau.**

1. iPad, orientation portrait : ouvrir la boîte d'ajout, afficher le clavier, taper trois
   lignes. Les actions restent-elles atteignables ? Le champ reste-t-il visible ?
2. Masquer le clavier : la boîte se redimensionne-t-elle dans l'autre sens ?
3. Tourner l'appareil clavier ouvert.
4. Faire défiler la page entière : plus aucun cadre hérité sans verdict.
5. Toucher le `+` : il crée une spec, ou il n'existe plus.

## Hors périmètre

- **La hauteur du panneau de conversation** : traitée dans `feature-026`, qui l'a causée.
- Le **contenu** du fil et son comportement : `feature-027`.
- Toute refonte du mono-écran lui-même : cette spec **solde** `feature-021`, elle ne la
  rouvre pas.

---
## Journal de bord

<!-- Spec ABSORBÉE dans le cycle de `feature-026` le 2026-09-23 (ADR-0017, décision
     humaine « Absorbe, absorbe »). Une seule phase de test / revue / documentation
     pour les deux specs. -->

- [2026-09-23 00:10] **Absorption** — agent principal, sur décision humaine. Le livrable
  `A1` change de nature : ce n'est plus un arbitrage, c'est l'**application d'une dette**
  déjà décidée par `U1` de `feature-021`. Ajout d'`A1bis`, la garde de non-régression qui
  manquait.
- [2026-09-23 02:30] Lot A1 + B1 — frontend-developer — **5 verdicts de `U1` appliqués sur
  6, le sixième BLOQUÉ et signalé**. `2015 cas root / 1936 non-root, 0 échec, 51 fichiers`,
  vérifié par l'agent principal. Constaté sur le DOM **réellement servi** après
  redémarrage : `titre-agents` 0 · `id="agents"` 0 · `titre-evenements` 0 · `#timeline` 0 ·
  `#compteur-prompt` supprimé (il n'en reste qu'un commentaire qui explique le retrait) ·
  **12 occurrences de `dvh`** servies.
  ⚠️ **IL A CORRIGÉ MA PROPRE MESURE, et l'erreur était exactement celle que ce lot devait
  fermer.** J'avais rapporté « `.table-passages` : seul verdict déjà appliqué ✓ ». **Faux** :
  `construireTablePassages` vivait toujours dans `app.js` et était appelée à **chaque**
  rendu de l'accordéon. Mon constat venait d'un `grep` sur `index.html` — une lecture
  **statique**, aveugle à ce qui est construit à l'exécution (`PIEGES §38`). Le vrai compte
  n'était donc pas 1 sur 6, mais **0 sur 6**. J'ai dénoncé le défaut « vérifier la lettre,
  pas la chose » en le commettant dans la mesure même qui le dénonçait.
  **Ce qui a été fait, verdict par verdict** : `agents` section et `rendreAgents` retirées
  (la donnée `actif_sur` reste lue pour le compteur de la bande de résumé — donnée
  conservée, liste retirée) ; `#compteur-prompt` retiré ; `.table-passages` et son repli
  retirés, **avec relocalisation** du message « aucun agent typé n'est apparu dans ce
  cycle », qui aurait disparu en silence ; liste des commits retirée de `fichiers`, la
  liste des fichiers touchés (l'état réel) conservée ; `#timeline` retiré et **remplacé par
  un mécanisme fonctionnel** — un bouton qui filtre les événements du passage sélectionné
  et ouvre le tiroir **existant**, jamais un second panneau.
  ⚠️ **`systeme` BLOQUÉ, et c'est la bonne décision** : `U1` exige que Divergences, Budget
  max et Écrivains **migrent** vers un panneau « État du dépôt » — **qui n'existe pas**.
  Retirer sans destination supprimerait l'information ; inventer une destination sortirait
  du mandat. Section **intégralement conservée**, avec un commentaire dans `index.html` qui
  dit pourquoi. **Arbitrage humain/architecte requis.**
  **`A1bis` livrée** : `test_app_u1_navigateur.py` (26 cas) **dérive** sa liste en parsant
  la table `U1` **dans la spec close**, avec clause miroir — altérer le texte de `U1` fait
  **échouer** la garde, donc le prochain qui change la décision ne peut plus laisser la
  garde derrière. Exécution réelle en Chromium contre le `app.js` servi, à 45 passages.
  **4 mutations tuées.**
  **`D1` livrée** : `test_conformite_viewport.js` (7 cas), parseur CSS par profondeur
  d'accolades — jamais `grep` —, qui exige un repli `Xdvh` **après** toute `Xvh` nue, dans
  la même règle et pour la même propriété. **3 mutations tuées**, dont un témoin à l'ordre
  inversé correctement rejeté.
  ⚠️ **CINQ sites de viewport, pas quatre** : mon brief disait « 4 » puis se contredisait
  deux lignes plus bas. `.app-shell`, `.feature-dialog`, `.add-item-dialog`,
  `.kanban-viewport` **et** `.claude-panel` — ce dernier posé par `feature-026` **après** la
  mesure de `feature-028`. Une lecture qui s'arrête à la première phrase livre 4 sur 5.
  **Tests inversés ou remplacés, jamais supprimés** (`PIEGES §30`) : 12 fichiers touchés,
  chaque assertion retargetée vers le remplaçant réel (`.chaine`/`.maillon`) ou inversée en
  assertion d'**absence**, y compris aux volumes 0/40/41/45/297 passages. Les **trois**
  registres tenus à la main ont tous été revérifiés.
  ⚠️ **Piège d'outillage** : la garde de synchronisation AST exige une copie **octet pour
  octet** d'une fonction partagée — reformuler un simple docstring en écrivant le nouveau
  fichier de garde a suffi à la faire échouer. La parade est de copier-coller, jamais de
  réécrire « en mieux ».
  Livrables : **A1 (5/6), A1bis, B1, D1 livrés** ; `A2` sans objet (conservées) ;
  `systeme` et l'alignement des deux cadres **restent dus**.
- [2026-09-23 03:10] **DÉCISIONS HUMAINES sur les capacités** — et une **rectification de
  l'agent principal**. J'avais présenté le retrait de `demande` comme un choix « garder le
  cadre ou perdre la fonction ». C'était faux : le bouton `+` **est** la fonction d'ajout,
  simplement laissée **inerte** par `F0` de `feature-021`, qui n'en avait repris que le
  markup pour la fidélité structurelle. J'ai traité un **défaut** comme une **décision**.
  > « Pourquoi dis-tu "sans les créer" ? La fonction "ajouter un élément" sert justement à
  > ça. Pour arrêter un cycle en cours, il devrait être possible de le faire dans la
  > conversation Claude. On peut aussi ajouter une action dans le menu de chaque carte de
  > spécification »
  **Tranché** : le `+` est **câblé** vers le chemin existant (`B3`), `demande` est retirée
  **après** (`B4`), et l'interruption passe par **la conversation Claude** et par **une
  action du menu `⋮`** (`B5`) — `/api/interrompre` existe déjà, c'est une action de plus
  dans un menu livré par `feature-025`, pas une route neuve. `B6` ajoute la garde qui
  vérifie **par exécution** qu'aucune capacité n'est retirée sans remplaçant atteignable.
  ⚠️ **Le GATE redevient obligatoire** sur cette spec : je l'avais moi-même conditionné au
  câblage du `+` dans la version initiale. La condition est remplie.
- [2026-09-23 04:20] Lot « retraits » — frontend-developer — **`systeme` retirée ; `cycles`
  et `fichiers` BLOQUÉS, capacité réelle en jeu**. `2019 root / 1940 non-root, 0 échec,
  51 fichiers, 0 muet`, vérifié par l'agent principal.
  **`systeme`** : section, `rendreSysteme()` et les 4 règles CSS retirées. Chaque ligne du
  `<dl>` a été tracée avant retrait : Dépôt/Fichiers touchés → `.repo-strip-texte` ;
  Divergences → `#compteur-specs` ; Budget max/Écrivains → note de plafond du pilotage ;
  Workflows → légende des cycles. ⚠️ **Une seule ligne n'a aucun doublon et est donc
  perdue : « Configuration : lue / défauts »** — signalée plutôt qu'inventée ailleurs, la
  décision humaine étant un retrait **sec**, pas une migration.
  ⚠️ **`cycles` BLOQUÉ — et le motif invalide une prémisse de mon brief.** J'avais écrit
  « vérifie que les onglets du haut couvrent la sélection de cycle ». Mesuré :
  `grep` sur `tab-button`/`cycle-tabs` dans `app.js` → **0 résultat**. Les onglets
  « Cycle actif » / « Historique » / `#cycle-indice` ne sont câblés à **aucun gestionnaire
  d'événement** : ils sont **purement décoratifs**. `choisirCycleAffiche()` ne rend jamais
  que le cycle en cours ou le plus récent. **L'accordéon est donc le SEUL endroit du DOM
  permettant de voir un cycle passé.**
  ⚠️ **`fichiers` BLOQUÉ — capacité que mon brief n'avait pas vue.** J'avais écrit « le
  compte survit, la liste disparaît ». Vrai pour l'information, **faux pour la fonction** :
  chaque ligne porte `ligne.addEventListener("click", () => ouvrirDiff(entree.chemin))`, et
  `ouvrirDiff` **n'a qu'un seul appelant** dans tout `app.js` — vérifié par l'agent
  principal. La liste est donc **l'unique chemin frontal vers `/api/diff`**.
  ✔️ **Deux sections laissées intactes plutôt que retirées à l'aveugle.** C'est le
  comportement voulu : le brief disait « arrête-toi et signale », il s'est arrêté.
  **Garde étendue** : trois checks `DH20260923_*` **distincts** de la dérivation `U1` — avec
  un docstring qui interdit de les confondre, parce que `U1` ne demandait pas ce retrait-là.
  Vue **rouge avant** (3 échecs), verte après. **4 mutations ciblées, toutes tuées**
  (réintroduction de la section, des règles CSS, de la fonction, et appel prématuré de
  `rendreFichiers`), chaque restauration confirmée par `diff -q`.
  ⚠️ **`PIEGES §7` visait CINQ porteurs de plus que les trois que je nommais.** En
  cherchant `systeme` sur tout `control-center/`, il a trouvé cinq fichiers supplémentaires
  et **deux harnais navigateur qui appelaient encore `rendreSysteme(...)`**. L'un est passé
  **MUET** (`ReferenceError`, code de sortie non nul **sans** ligne « N cas ») au premier
  passage — invisible s'il s'était arrêté aux trois fichiers de mon brief. **Seule
  l'exécution de la suite entière l'a révélé.** La liste des porteurs est elle-même une
  énumération tenue à la main (`PIEGES §21`), et la mienne était fausse pour la troisième
  fois de ce cycle.
  ⚠️ **Fait d'interface à retenir** : une UI peut **avoir l'air** fonctionnelle sans l'être.
  Les onglets ont un `<button>`, un `aria-pressed`, tout l'aspect d'un contrôle actif — et
  aucun gestionnaire. Contrairement au `+`, dont l'inertie était **écrite en toutes
  lettres** dans le code, rien ne signalait celle-ci. Seule la recherche explicite d'un
  gestionnaire l'établit.
- [2026-09-23 04:35] **TROIS DÉCISIONS HUMAINES** — « Ok pour câbler les cycles en haut et
  retirer le cadre en bas. Pour la question 2, nul part. 3. Elle disparaît ».
  1. **`cycles`** : les onglets du haut sont **câblés d'abord**, l'accordéon retiré
     **ensuite** — même ordre que pour le `+` : on ne retire jamais avant que le
     remplaçant ne fonctionne.
  2. **`fichiers`** : retirée, et **la consultation des diffs ne va nulle part**. C'est un
     retrait de capacité **assumé et explicite**, pas un oubli. ⚠️ Conséquence à traiter :
     `ouvrirDiff` perd son unique appelant et devient du **code mort** — il se retire avec
     la liste, sinon il reste une fonction que rien n'atteint. Et `/api/diff` se retrouve
     **sans appelant frontal** : à signaler à `doc-writer` et au GATE (une route vivante
     que plus rien n'appelle reste une surface).
  3. **« Configuration : lue / défauts »** : **disparaît**, sans destination. Confirmé.
- [2026-09-23 05:10] Étape GATE — security-reviewer, **P1 sur les quatre surfaces —
  GO SOUS CONDITIONS (6)**. Aucune route neuve, donc aucune classe de capacité neuve :
  **TLS local et `bug-010` restent au même niveau**, ni aggravés ni avancés.
  **C1 — le `+` entre dans la machine `redaction` EXISTANTE, jamais en enchaînant les deux
  POST.** Un clic = `brouillon` **seul** ; `ecrire` n'est atteint qu'**après relecture du
  Markdown** et confirmation. ⚠️ C'est cette relecture humaine qui portait le GATE de
  `feature-008` — l'enchaîner la supprimerait sans que rien ne le dise.
  **C2 — le formulaire du prototype ne suffit pas** : `#item-priority` n'a **aucun champ
  serveur**, et le **slug** (donc le nom de fichier) dérive du **titre**, absent du
  formulaire. Il faut un champ titre, ou dériver le titre et **afficher `nom_fichier_prevu`
  avant écriture**. Le reste est déjà hors de portée du réseau.
  **C3 — l'action « Interrompre » du menu doit cibler la spec de la CARTE.** Mesuré :
  `_interrompre()` **ignore son corps** (la route dispatche avant tout `json.loads`) et tue
  `lancement_courant()`, c'est-à-dire **le dernier index basculé**. Un agent qui ajouterait
  `{spec_id}` côté client sans toucher le serveur verrait un **202** et croirait cibler,
  pendant que le serveur tuerait autre chose. Exigé : `{spec_id}` **optionnel** sur la route
  existante, recherche dans `lancements_actifs()`, `404` sinon ; et l'item n'apparaît que
  sur la carte concernée.
  ⚠️⚠️ **C4 — « interrompre depuis la conversation » N'EST PAS une interruption, et
  l'humain doit le savoir.** Deux raisons établies dans le code : (a) la session
  `claude-kit` et un cycle lancé par le cockpit sont **deux processus distincts** —
  « arrête » tapé dans le pty n'atteint **jamais** le second ; (b) sur la session
  elle-même, le texte est **mis en file** et lu quand l'agent rend la main, et la seule
  vraie interruption (Échap, `0x1B`) est **précisément ce que `texte_valide_pty` refuse**.
  Donc : aucun bouton, aucun libellé « interrompre » pour ce chemin, au conditionnel s'il
  est documenté (« demander l'arrêt »), et **`B6` ne doit pas le compter comme
  remplaçant**.
  **C5 — `/api/diff` se RETIRE**, ne se conserve pas : route de lecture confinée, mais qui
  expose le diff de l'arbre de travail **sans plus aucune justification** — la Règle absolue
  n°1 exige une exposition justifiée. Vérification par exécution : `GET /api/diff` → 404.
  **C6 — `pilotage` porte une capacité de plus que ce qu'on croyait** : le **lancement
  générique par clé** (`POST /api/lancer`), que les cartes **ne remplacent pas** (elles
  n'atteignent que `/api/spec/lancer`, première colonne). La retirer sans le dire, c'est
  la perte silencieuse que `B6` existe pour fermer. **Décision humaine requise.**
  ⚠️ **`B6` jugée insuffisante telle qu'écrite** : « interrompre depuis le menu » doit
  asserter que le lancement **tué porte le `spec_id` de la carte**, pas qu'un POST est
  parti. Mutation à ajouter : substituer le `spec_id` envoyé → l'assertion doit mourir.
- [2026-09-23 06:30] Lots B et A1 — frontend-developer — **« Fichiers touchés » retirée,
  onglets de cycle CÂBLÉS ; l'accordéon reste, bloqué**. `2031 root / 1951 non-root,
  0 échec, 52 fichiers, 0 muet`, vérifié par l'agent principal.
  **B livré** : section, `rendreFichiers` **et** `ouvrirDiff` retirées — vérifié, il n'en
  reste que des **commentaires** qui expliquent le retrait. `/api/diff` se retrouve sans
  appelant frontal ; le GATE a tranché en parallèle : **elle se retire** (condition C5).
  **A1 livré et prouvé par exécution** : les onglets ne sont plus décoratifs. `#cycle-indice`
  devient un vrai sélecteur en mode Historique, la position **persiste** à l'aller-retour.
  16 cas en navigateur réel, avec **trois cycles fabriqués à comptes de segments distincts**
  — pour prouver que **le contenu peint change**, pas seulement l'étiquette. Deux mutations
  ciblées : neutraliser la bascule de mode → **6 échecs** ; neutraliser la persistance →
  **3 échecs**.
  ⚠️ **A2 BLOQUÉ — quatrième arrêt volontaire de ce cycle, et le motif est net** :
  `construireProprietes` (outils, fichiers écrits, rebouclages, agents simultanés) et
  `construireChaineEtNotes` ne sont appelées **que** depuis l'accordéon, vérifié par `grep`.
  Le canevas du haut ne montre **ni** les compteurs agrégés **ni** la chaîne textuelle —
  et pas seulement pour l'historique : **pour le cycle actif lui-même**. Retirer
  l'accordéon perdrait ces deux éléments **sans destination**.
  ⚠️ **La trouvaille la plus utile du lot, et elle vise notre outillage** : sur les six
  registres `IDS` tenus à la main, **un seul exécute réellement une clause miroir** contre
  le `index.html` réel. Les cinq autres sont des **copies inertes**, jamais confrontées au
  DOM. Ajouter les deux ids d'onglets a fait échouer **uniquement** celui-là — utile, mais
  trompeur : « les cinq autres sont verts » ne veut pas dire qu'ils sont synchronisés, ça
  veut dire qu'ils **ne vérifient rien**. ⚠️ L'agent principal a tenté de recouper par
  `grep` : sa mesure ne distingue pas « lit `index.html` » de « assertionne la couverture »,
  elle ne confirme donc ni n'infirme — **à vérifier par un contrôle dédié**, pas à croire
  sur parole ni à rejeter.
  ⚠️ **Staleness trouvée par accident** : `test_app_contrastes_navigateur.py` porte un
  fragment HTML synthétique qui contient **encore** `titre-agents`, `titre-evenements` et
  `#timeline` — disparus du DOM réel depuis le lot A1. Le test reste **vert** parce qu'il
  mesure des contrastes arithmétiques, indifférents à la véracité sémantique du fragment.
  Un test vert sur un monde qui n'existe plus. À traiter en lot d'hygiène.
  ⚠️ **Piège d'outillage confirmé deux fois** : l'empreinte AST de synchronisation inclut
  le **docstring**. Reformuler « en mieux » une fonction copiée suffit à faire échouer la
  garde. La parade est de copier octet pour octet.
- [2026-09-23 07:00] **DEUX DÉCISIONS HUMAINES qui débloquent A2 et `pilotage`.**
  **1B — l'accordéon est retiré, ses deux informations sont PERDUES** : propriétés agrégées
  du cycle (outils, fichiers écrits, rebouclages, agents simultanés) et chaîne textuelle des
  segments. Retrait **assumé**, même forme que pour les diffs — pas une migration, pas un
  oubli.
  **`pilotage` — ma question était mal posée, et sa réponse la corrige** : « Demo ou lent
  n'ont pas de sens ». Exact, et c'est le fait qui tranche : le « lancement générique par
  clé » ne peut lancer **que** ce que `[commandes]` déclare, et cette configuration ne
  déclare que `demo` et `lent`, **deux commandes d'exemple** (`python3 -c "print…"`).
  La capacité que le GATE signalait (condition C6) est donc **vide en pratique** : retirer
  `pilotage` ne coûte rien de réel.
  ⚠️ **À ne pas perdre le jour où ce sera faux** : si une **vraie** commande est un jour
  déclarée dans `[commandes]`, elle n'aura **aucun point d'accès** dans le cockpit. Écrit
  ici plutôt que gardé en tête — c'est une capacité retirée sous une **condition
  d'environnement**, pas sous une décision de conception.
- [2026-09-23 08:15] Lot backend — backend-developer — **C3 et C5 du GATE levées**.
  `2042 root / 1962 non-root, 0 échec, 52 fichiers, 52 verdicts`, mesuré par l'agent
  principal dans les deux régimes.
  **C3** : `POST /api/interrompre` accepte un `{spec_id}` **optionnel** — présent, il
  cherche dans `lancements_actifs()` le lancement dont le `spec_id` est égal et
  n'interrompt **que celui-là** (`404` si aucun, `400` si le type est mauvais) ; absent,
  comportement **inchangé**. Aucune route neuve : seul le dispatch cesse d'ignorer le corps.
  **8 cas neufs** avec `ecrivains_simultanes = 2` et deux lancements réels — interrompre
  `alpha` tue alpha et **laisse beta vivant**. **2 mutations** : `lancements_actifs()` →
  `lancement_courant()` = **3 échecs** ; cible substituée = **4 échecs**.
  **C5** : `/api/diff` **retirée** — branchement, méthode, et `vcs.diff()` avec elle
  (aucun autre appelant). Les témoins de confinement de l'ancienne route sont **retirés
  plutôt que laissés** : ils auraient continué à rendre `>= 400` **par pur hasard** (route
  inconnue) en ne prouvant plus rien — remplacés par une assertion d'**absence**
  (`test_diff_retiree_du_module`) et un `GET /api/diff` → **404** vérifié par exécution.
  Il ne reste dans `server.py` qu'une **mention en commentaire**, vérifiée.
  ⚠️ **Piège trouvé par `pyflakes`, pas par la suite** : un bloc `if __name__ == "__main__"`
  en fin de `vcs.py` — une CLI de debug — appelait encore `diff()` après sa suppression.
  Invisible à un `grep` centré sur les **appelants de production**, et **aucun test
  n'exécute ce bloc**. Le module aurait cassé au premier lancement en ligne de commande
  sans qu'une seule garde ne bronche. À chercher **systématiquement** avant de retirer une
  fonction publique d'un module qui porte un tel bloc.
  ⚠️ **Non-root non mesuré par l'agent** (le répertoire de travail de la session est `0700`,
  `nobody` ne peut pas le traverser) — **mesuré par l'agent principal** à la place :
  1962 cas, 0 échec, 52/52 verdicts.
- [2026-09-23 11:40] Lot A+B+C — frontend-developer — **le `+` crée vraiment, l'interruption
  cible vraiment, deux cadres de moins**. `1900 root / 1819 non-root, 0 échec, 53 fichiers`.
  ⚠️ **Le compte BAISSE de 142, et il est attribué en entier** par l'agent principal :
  `2042 − 153` (`test_app_accordeon.py`, fichier **dédié** à une feature retirée — même
  précédent que `test_app_theme.js` à la clôture du thème sombre) `+ 30` (deux gardes
  neuves) `− 19` (écarts sur les fichiers communs) `= 1900`, **exactement le mesuré**.
  Une baisse de compte n'est acceptable que comme ça : chiffrée, pas justifiée.
  **A** : l'item « Interrompre » n'apparaît **que** sur la carte du lancement courant, et la
  garde prouve que **le corps envoyé porte le `spec_id` de CETTE carte** — pas qu'un appel
  est parti. Deux mutations (condition inversée, `spec_id` figé) tuent. Les constantes de
  hauteur du menu ont été **remesurées** en Chromium, pas devinées.
  **B** : le `+` entre dans la machine `redaction` existante — **un clic = brouillon seul**,
  l'écriture n'a lieu qu'après deux gestes explicites. La garde **compte les appels par
  route** et prouve que `ecrire` reste à **zéro**. Champ titre ajouté (le slug en dérive) ;
  `#item-priority` **conservé mais rendu inerte** plutôt que retiré — retirer un élément
  « adopté » du prototype aurait exigé un verdict « retiré après adoption » que la table de
  partition ne connaît pas.
  **C** : `demande` et l'accordéon retirés **après** vérification de B et A. `feature008`
  (61 cas) **retargeté** vers la nouvelle surface, escalade comprise — transformée en preuve
  d'**absence** de la capacité sur cette surface.
  ⚠️ **`pilotage` NON retiré — cinquième arrêt volontaire, et le motif est solide** :
  l'objet `pilotage`, son sondage et son badge sont **de l'infrastructure partagée** — le
  lancement **et** l'interruption par carte les réutilisent. Retirer la section visible sans
  démêler le générique du partagé casserait ce que ce lot vient de livrer. **Lot dédié
  requis.**
  ⚠️ **Effet de bord signalé plutôt qu'inventé** : la légende de l'accordéon
  (« N sur M cycles affichés », « N événement(s) sans session associée ») disparaît avec
  lui, et ce **bornage n'est affiché nulle part ailleurs**. La décision humaine « 1B » ne
  couvrait que les propriétés agrégées et la chaîne textuelle.
  ⚠️ **Décidé par l'agent, à confirmer** : la dérogation « gabarit minimal » n'a pas
  d'équivalent dans le `+` — créer un « bug simple » produit donc **toujours** le gabarit
  complet. Choix sûr par défaut, mais c'est une capacité perdue.
  ✔️ **Trois pièges de méthode, dont un remarquable** : retirer un scénario de test peut
  faire disparaître la couverture d'une capacité **sans rapport** — le scénario de
  l'accordéon à 45 passages portait, **par coïncidence**, le seul cas qui exerçait
  `.is-reprise`, un connecteur du graphe principal. Sa suppression a fait tomber la garde de
  parité ; reconstitué par un scénario dédié **plutôt que remarqué par chance plus tard**.
  Et : un `let` de portée module **n'est pas** une propriété de `window`, même en navigateur
  réel — un harnais qui l'oublie crée une variable **différente** et diagnostique un faux
  défaut du correctif.
- [2026-09-23 09:40] Lot « pilotage dédié » + dérogation — frontend-developer — **les SEPT
  sections héritées ont disparu**. Constaté sur le HTML servi après redémarrage (PID
  2600652) : `titre-agents` 0 · `titre-systeme` 0 · `titre-demande` 0 · `titre-pilotage` 0 ·
  `titre-cycles` 0 · `titre-fichiers` 0 · `titre-evenements` 0. Le mono-écran de
  `feature-021` remplace enfin ce qu'il devait remplacer — **onze mois de dette soldés**
  au sens propre : la décision datait de la spec close.
  `1910 root / 1828 non-root, 0 échec, 54 fichiers`.
  ⚠️ **L'agent a dit ne PAS pouvoir attribuer son delta** (il n'avait gardé que l'agrégat
  de départ) et l'a **signalé plutôt que d'inventer une précision non mesurée** — bonne
  discipline. **L'agent principal l'a fait** à partir de l'instantané conservé :
  `test_ci_partition_navigateur` +1 · `feature008` +3 · `navigation` −13 · `u1` +10 ·
  fichier neuf +9 = **+10**, soit **1900 → 1910**, exactement le mesuré.
  **A1 — la classification rendue avant tout retrait a produit trois surprises**, et c'est
  précisément pour ça qu'elle était exigée :
  1. ⚠️ **`pilotage.cleChoisie` était la SEULE interface pour choisir la commande du
     lancement PAR CARTE** — `surClicLancerCyclePourSpec` la lit, aucune carte ne porte ce
     choix. Après retrait, l'auto-sélection (`commandes[0]`) devient le **seul** mécanisme.
     Même caveat d'**environnement** écrit en clair : si plusieurs vraies commandes sont un
     jour déclarées, aucune UI ne permettra plus d'en choisir une autre que la première.
  2. ⚠️ **`rendreNotePlafondPilotage` était le DERNIER porteur de « Budget max » et
     « Écrivains »** — leur premier, `systeme`, avait déjà disparu sur décision humaine.
     **Ces deux valeurs ne sont plus affichées nulle part.** Signalé, non migré (hors
     mandat).
  3. `.bloc`/`.bloc h2` sont devenues **orphelines** : les sept sections qu'elles
     habillaient ont toutes disparu au fil du cycle. Retirées.
  **A2 — renommage écarté et JUSTIFIÉ** : renommer `pilotage` (~80 usages, plusieurs
  harnais l'invoquent par ce nom) a été jugé disproportionné face au bénéfice, et la
  décision est **écrite en tête du bloc** — pas un oubli silencieux.
  **A4 — la garde exerce le CHEMIN RÉEL**, pas une façade : `rafraichir()` →
  auto-sélection **sans aucune UI** → vrai clic « Lancer » → vrai clic « Interrompre ».
  Mutation simulant le retrait de l'infrastructure avec le panneau : **4 assertions
  meurent**, dont les deux visées.
  **B — la dérogation « gabarit minimal » est rendue au `+`**, et **indépendante du type**
  (l'ancienne surface dérivait les deux d'une seule case). La preuve d'**absence** écrite au
  lot précédent est **inversée**, pas supprimée (`PIEGES §30`), et elle vérifie le **contenu
  rendu** — pas le seul paramètre envoyé. Motif : `CLAUDE.md` impose le format minimal pour
  un bug simple ; produire toujours le gabarit complet contredisait le dépôt lui-même.
- [2026-09-23 17:30] Étape 9 — doc-writer — **livrables A1/A1bis/A2/B1-B6/C1/C2/D1-D3 et
  critères d'acceptation cochés**, une seule phase de documentation partagée avec
  `feature-026` (`ADR-0043`). `docs/features/page-centre-de-controle.md` réécrit sur les
  sept sections retirées (verdict par verdict), le `+` câblé et sa correction de grille CSS
  (`B2`), l'interruption par carte, et le sélecteur de cycle qui remplace l'accordéon.
  `CHANGELOG.md` : bullets dédiés. `ADR-0043` (absorption au titre d'`ADR-0017`) et
  `ADR-0044` (méthode) créés — `C2` s'appuie sur `ADR-0043` avec un écart **dit** : aucune
  étape distincte « architect » n'a été journalisée sur cette spec, les verdicts par
  section viennent de décisions humaines citées mot pour mot. **Un seul critère
  d'acceptation reste ouvert** : la vérification sur l'iPad réel de l'humain, seule preuve
  que ce critère exige — aucune trace disponible qu'elle a eu lieu après le correctif du
  GATE (`B2`). Clôture (déplacement vers `done/`) laissée à l'agent principal.
- [2026-09-23 18:00] **Étape 10 — CLÔTURE**, autorisée par l'humain. Spec **absorbée**
  (`ADR-0043`), clôturée avec `feature-026` dans une phase unique de test, revue et
  documentation. Le critère d'acceptation qui la bloquait — la vérification sur l'appareil
  réel — a été refermé **par l'usage** : l'humain a écrit `feature-029` depuis son iPad via
  le `+` de cette spec.
  **Livrables** : `U1` de `feature-021` appliquée (les **sept** sections héritées ont
  disparu), `A1bis` (la garde qui **dérive** sa liste de la table `U1` dans la spec close),
  les **cinq** sites de viewport migrés avec repli ordonné, le `+` câblé en deux gestes,
  l'interruption ciblée par carte, la boîte d'ajout utilisable clavier affiché.
  **Ce que le cycle a assumé comme pertes** : la consultation des diffs et `/api/diff`
  elle-même, les propriétés agrégées d'un cycle et la chaîne textuelle des segments, la
  légende de bornage, « Configuration : lue / défauts », « Budget max » et « Écrivains »,
  le lancement générique par clé. **Toutes écrites**, aucune découverte après coup.
