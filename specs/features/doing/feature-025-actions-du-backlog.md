# Actions du backlog : lancer, modifier, supprimer

## Métadonnées
- **ID** : feature-025
- **Slug** : actions-du-backlog
- **Type** : feature
- **Statut** : doing — **absorbée dans le cycle `feature-021`** (lots 9-10), réouverture de périmètre
- **Priorité** : normale
- **Version cible** : N/A
- **Dernière mise à jour** : 2026-09-20
- **Spec(s) liée(s)** : `feature-021` (le kanban qui les porte), `feature-007`
  (pilotage et garde-fous), `feature-005` (synchronisation sélective)

## Grandeurs mesurées
- `routes d'écriture dans la table FERMÉE` = **4** — `/api/lancer`, `/api/interrompre`,
  `/api/spec/brouillon`, `/api/spec/ecrire`
- `ce que transporte `/api/lancer`` = **une clé**, choisie dans une **liste fermée**
  (`ADR-0005`), jamais un identifiant libre
- `routes de suppression` = **0** · `routes d'édition d'une spec existante` = **0**
- `champs exposés par `specs.py`` = `id`, `titre`, `colonne`, `statut_texte`,
  `statut_classe`, `priorite`, `type`, `maj`, `divergence`, `illisible`
- `champs manquants pour les cartes de la maquette` = **2** — l'**agent responsable** et
  la **progression**

## Domaines touchés
- [x] API REST — **des routes mutatrices et destructives**
- [x] Frontend
- [ ] BDD / migrations
- [x] Auth / permissions → **GATE obligatoire**
- [ ] Données personnelles
- [ ] Intégrations externes
- [ ] Tâches de fond

## Agents requis
- [x] spec-reader · [x] architect · [x] **security-reviewer, rôle GATE (P1, P2)**
- [ ] ux-ui-designer — le menu est spécifié par la maquette
- [x] backend-developer · [x] frontend-developer
- [x] test-engineer · [x] code-reviewer · [x] doc-writer

## Absorption dans le cycle `feature-021` (2026-09-22)

Cette spec n'est pas traitée seule. L'humain a rouvert le périmètre de
`feature-021` le 2026-09-22 : « Rien ne justifie de livrer un livrable qui
couvre une petite partie de ce que j'ai demandé. Fais ce qu'il faut pour
mettre en œuvre la maquette. » La maquette Material 3 **entière** revient au
périmètre du cycle, y compris les éléments que le découpage du 2026-09-20
avait différés vers cette spec.

⚠️ Le motif est **distinct** de celui de `bug-017` : ce n'est **pas**
`ADR-0017` (une spec qui désarme ou rend inatteignable une garde livrée par le
cycle en cours). Aucune garde livrée par `feature-021` n'est désarmée par
l'absence de cette spec. Le motif est une réouverture de périmètre décidée
par l'humain parce que le livrable initial ne couvrait qu'une fraction de sa
demande. Les deux précédents ne se confondent pas.

Conséquence de forme : le cycle porte désormais **cinq specs dans `doing/`**
(`feature-021`, `bug-017`, `feature-022`, `feature-023`, `feature-025`), avec
une **seule** phase de test, de revue et de documentation. **Le journal de
bord de référence est celui de `feature-021`** — c'est là que les verdicts
GATE (P1/P2) et les livrables de cette spec sont consignés au fil des étapes,
pas ici. Cette spec reçoit uniquement, à la clôture, ses notes
d'implémentation avant son déplacement vers `done/`.

Cette spec porte les **lots 9 et 10** du plan du cycle 2 (backend puis frontend).

### Éléments du prototype qui lui reviennent

Dérivés de `control-center/web/test_conformite_partition_donnees.js`
(table F0, entrées de lot `9-10`) — **71 éléments uniques**
(32 identifiants + 44 classes, 5 noms partagés entre les deux ensembles :
`add-item-dialog`, `add-item-form`, `context-menu`, `feature-dialog`,
`feature-kind`) :

- **Identifiants (32)** : `add-item-dialog`, `add-item-form`, `add-item-intro`,
  `add-item-title`, `cancel-add-item`, `cancel-delete`, `close-add-item`,
  `close-feature`, `context-menu`, `delete-copy`, `delete-dialog`,
  `delete-item`, `delete-title`, `edit-item`, `feature-agent`,
  `feature-criteria`, `feature-dependency`, `feature-description`,
  `feature-dialog`, `feature-done`, `feature-edit`, `feature-kind`,
  `feature-priority`, `feature-status`, `feature-title`, `feature-updated`,
  `item-description`, `item-priority`, `launch-divider`, `menu-launch-cycle`,
  `open-add-item`, `view-details`
- **Classes (44)** : `add-item-actions`, `add-item-body`, `add-item-button`,
  `add-item-dialog`, `add-item-form`, `cancel`, `card-title-button`,
  `confirm`, `context-menu`, `danger`, `dialog-actions`, `feature-chip`,
  `feature-close`, `feature-dialog`, `feature-dialog-actions`,
  `feature-dialog-body`, `feature-dialog-header`, `feature-dialog-heading`,
  `feature-fact`, `feature-facts`, `feature-kind`, `feature-meta`,
  `feature-section`, `field-help`, `field-label`, `form-buttons`,
  `form-field`, `form-grid`, `form-intro`, `full`, `high`, `icon-button`,
  `launch-action`, `menu-divider`, `menu-icon`, `menu-item`, `more-button`,
  `primary`, `required-note`, `secondary`, `submit`, `todo`, `type-option`,
  `type-segment`

⚠️ Rectification du lot 6 (réouverture de périmètre) : la table F0 disait ici
« aucune instance adoptée » sur `icon-button` — c'était FAUX, la classe
n'avait simplement pas encore été relue contre le prototype. Mesuré :
5 instances réelles, dont 2 appartiennent à cette spec (`close-feature`,
`close-add-item`, discriminées par leur classe compagne). `icon-button` est
**partagée** entre les lots 7-8, 9-10 et 11 — voir sa note complète dans la
table F0 ; ne pas la compter deux fois dans un total cumulé entre specs.



Chaque carte du kanban porte un bouton `⋮` ouvrant un menu Material 3 ancré à la carte.
Pour une carte de la première colonne, le menu commence par **« Lancer un cycle »**, puis
un séparateur, puis « Voir les détails » et « Modifier », puis un séparateur et l'action
destructive **« Supprimer »** en couleur d'erreur.

Cliquer le corps d'une carte ouvre un dialogue Material 3 : description, statut, priorité,
agent, critères d'acceptation, dépendance, date de mise à jour.

## Contexte

Le centre de contrôle sait lancer une **commande** choisie dans une liste fermée. Il ne
sait pas lancer **pour une spec donnée**, ni modifier une spec, ni en supprimer une.

## Comportement attendu
- Le menu gère le placement initial du focus, les flèches, Début/Fin, Échap, et **rend le
  focus** à son ouvrant
- « Lancer un cycle » n'apparaît que pour les éléments **éligibles**
- Pas de bouton « Lancer » permanent dans les cartes : il surcharge la lecture
- **La suppression déclenche toujours une confirmation explicite nommant précisément
  l'élément concerné**

### Cas limites
- Deux suppressions simultanées ; suppression d'une spec déjà déplacée
- Suppression d'une spec en cours de cycle (`doing/`) — à interdire ou à confirmer lourdement
- Modification concurrente à une édition hors du cockpit
- Écriture désactivée : les actions mutatrices sont **visiblement inertes**, pas absentes

## Comportement actuel

Aucune de ces actions n'existe. `/api/lancer` ne transporte qu'une clé fermée.

## Contraintes techniques
- ⚠️ **Règle absolue n°4** : jamais de suppression sans **plan de retour arrière écrit**.
  Une spec supprimée est un fichier du dépôt — le retour arrière passe par git, et cela
  doit être **écrit**, pas supposé.
- `ADR-0005` (liste fermée par clé) et `ADR-0019` (table fermée des routes) sont amendés
  au minimum, peut-être révoqués. Transporter un identifiant de spec jusqu'à la commande
  est exactement ce que `ADR-0005` refusait.
- `ADR-0003` : les colonnes viennent de la **configuration**, jamais figées
- Le confinement du chemin (`vcs.chemin_sur()`) s'applique à toute cible
- L'**agent responsable** et la **progression** doivent être **définis** avant d'être
  affichés : un pourcentage inventé est un chiffre non mesuré, que le dépôt s'interdit

## Fichiers potentiellement concernés
- `control-center/backend/server.py` — routes neuves, table `_ROUTES_ECRITURE`
- `control-center/backend/specs.py` — agent responsable, progression
- `control-center/backend/vcs.py` — confinement, retour arrière
- `control-center/web/` — menu, dialogue, confirmation
- `docs/adr/` — au moins un ADR

## Livrables — check-list
- [x] S1 — **GATE P1** : routes mutatrices et destructives sur des fichiers du dépôt
      (**GO sous 8 conditions** pour lancer, **sous 12** pour modifier/supprimer)
- [x] A1 — **plan de retour arrière écrit** pour la suppression (Règle absolue n°4)
      — `git checkout <sha HEAD> -- <chemin>`, exécutable tel quel, jamais
      exécuté par le serveur ; refuse (`409`) toute spec non suivie ou modifiée
      par git plutôt qu'un plan inapplicable (`git rm` rend `rc 128` sur un
      fichier non suivi, mesuré)
- [x] A2 — verdict ADR sur l'amendement d'`ADR-0005` et `ADR-0019` (`ADR-0040`
      §1 et §4 — la garantie centrale de chacun des deux n'est pas révoquée)
- [x] A3 — **définition** de la progression : quelle grandeur, mesurée comment
      — **pas un ratio de cases cochées** (mesuré 36 % sur une spec jamais
      commencée, aussi trompeur qu'un pourcentage inventé), mais **l'état de
      colonne** de la carte (position, pas un nom codé en dur), à trois
      largeurs fixes, décoratif
- [x] B1 — lancer un cycle pour une spec désignée, chemin confiné
      (`POST /api/spec/lancer`, `gestion_spec.eligible_au_lancement()`,
      double confinement)
- [x] B2 — modifier une spec existante (`POST /api/spec/modifier`,
      compare-and-write atomique par empreinte SHA-256)
- [x] B3 — supprimer, avec confirmation serveur **et** retour arrière
      (`POST /api/spec/supprimer`, `confirmation_nom`, `role != "premiere"`
      fail-closed)
- [ ] B4 — agent responsable et progression exposés par `specs.py` —
      **la progression est exposée** (voir A3), **l'agent responsable ne
      l'est pas** : `#feature-agent` existe dans le DOM mais reste
      « Agent · non déterminé par le dépôt » — aucune donnée fiable de ce
      type n'a été identifiée pendant ce cycle, même principe que F2 de
      `feature-022` (ne jamais fabriquer une donnée absente)
- [x] F1 — menu `⋮` accessible : focus, flèches, Début/Fin, Échap, restitution
      (`#context-menu`, `role="menu"`)
- [x] F2 — dialogue de détail (`#feature-dialog`, repris verbatim du prototype)
- [x] F3 — confirmation de suppression **nommant l'élément**
      (`#delete-dialog`, écart déclaré au prototype qui ne montre qu'un
      Oui/Non — la fidélité cède devant la sécurité)
- [x] F4 — actions inertes et visibles quand l'écriture est désactivée
- [x] S2 — **GATE P2** — trois défauts trouvés sur le diff réel et corrigés
      avant merge : une garde vivante pour un seul écrivain
      (`lancement_courant()` → `lancements_actifs()`), un oracle qui
      s'accorde avec lui-même (deux champs de la même réponse comparés),
      une garde de confinement jamais éprouvée sur son cas réel (lien
      symbolique planté dans `todo/`, désormais couvert par trois cas réels)
- [x] D1 — tests, dont **mutation** sur le confinement et sur la garde de confirmation
- [x] C1 — `docs/API.md`, ADR, `CHANGELOG.md`

## Sécurité & données
- **Authentification : OUI** — trois routes d'écriture de plus
- **Permissions : OUI** — une action destructive
- Données personnelles : **non**
- **Migration destructive : OUI, au sens de la Règle absolue n°4** — plan de retour
  arrière **obligatoire et écrit**
- **Risque identifié** : une route de suppression mal confinée efface un fichier
  quelconque du dépôt. C'est le risque le plus sévère de toute la famille de specs.

## ADR attendu ?
- **Probable** : **oui** · Critères **1**, **2**, **4**
- Sujets : l'ouverture de routes mutatrices et destructives ; la définition de la
  progression d'une spec

## Éléments visibles (pour doc-writer)
- Endpoints neufs → `docs/API.md` · Menu, dialogue, confirmation → `docs/features/page-*.md`
- `CHANGELOG.md` · ADR

## Critères d'acceptation
- [x] Aucune suppression sans confirmation nommant l'élément
- [x] Une cible hors de la racine du dépôt est **refusée** — vérifié par test de confinement
      (trois liens symboliques réels plantés dans `todo/`, `404`, cible intacte
      dans les trois — GATE P2)
- [x] Le retour arrière d'une suppression est **écrit et exécuté au moins une fois**
      (`test_server_feature025.py` : l'`argv` rendu par la réponse est lancé
      tel quel, contenu comparé bit pour bit, `git status --porcelain` vide)
- [x] Sans jeton, les trois actions sont inertes et le disent
- [x] La progression affichée correspond à une grandeur **définie et mesurée**
      (l'état de colonne, jamais un ratio de cases cochées — voir A3 ci-dessus)
- [x] Le menu est entièrement utilisable au clavier
- [x] Verdicts GATE P1 et P2 écrits (voir `feature-021`, journal cycle 2,
      Étape C et Étape 6/Lot 9)
- [x] Suite verte, mutation sur le confinement et la confirmation

## Plan de test manuel
1. Lancer un cycle depuis une carte, vérifier que c'est la bonne spec
2. Supprimer une spec, vérifier la confirmation puis le retour arrière
3. Tenter une suppression avec un identifiant forgé pointant hors du dépôt
4. Sans jeton : les trois actions sont inertes
5. Modifier une spec pendant qu'un éditeur externe la modifie aussi
6. Parcourir le menu au clavier seul

## Hors périmètre
- La conversation permanente (`feature-022`) et la rédaction par Claude (`feature-024`)
- Le déplacement d'une spec entre colonnes : c'est le **cycle** qui promeut, pas l'écran

## Notes d'implémentation (lots 9-10 de `feature-021`, cycle 2)

Livré en deux temps : lot 9 (backend, `gestion_spec.py`, GATE P1 puis P2 sur
le diff réel) puis lot 10 (frontend, menu et dialogues repris verbatim du
prototype).

**Écart assumé au prototype, sur la seule route destructive** :
`#delete-dialog` ajoute un champ de saisie du nom exact de la spec, alors
que la maquette ne montre qu'un Oui/Non — la fidélité cède devant la
sécurité (Règle absolue n°4), et c'est écrit dans le code plutôt que
découvert en revue.

**`#add-item-dialog` est présent mais inerte** : reproduit du prototype,
motif affiché, parce que créer une spec depuis le cockpit relève de
`feature-024`, hors périmètre de ce cycle.

**La progression a changé de nature en cours de lot**, et c'est documenté
comme une correction plutôt que subi : la forme envisagée (un ratio de
cases cochées de la spec) a été mesurée avant d'être écartée — 36 % sur une
spec jamais commencée, parce que les cases du gabarit qui ne sont pas des
livrables gonflent le compte. La grandeur retenue est l'**état de colonne**
de la carte, la même position que celle qui déjà gouverne l'éligibilité au
lancement et à la suppression (`role_colonne()`), à trois largeurs fixes —
même patron que l'anneau d'activité du disque. Voir `ADR-0039` §5.

**L'agent responsable n'est pas livré**, et ce n'est pas un oubli :
`#feature-agent` existe dans le DOM (id adopté de la table F0) mais affiche
« Agent · non déterminé par le dépôt » — aucune source fiable de cette
donnée n'a été identifiée pendant ce cycle. Reste ouvert pour une prochaine
spec.

Détail complet des trois surfaces (lancer/modifier/supprimer), des
conditions GATE et des trois défauts trouvés en P2 :
[ADR-0040](../../../docs/adr/0040-les-chemins-decriture-du-cockpit.md) §1-§2.
