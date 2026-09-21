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
(table F0, entrées taguées `differe:feature-025`) — **71 éléments uniques**
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

⚠️ La table F0 note explicitement sur `icon-button` : « aucune instance
adoptée » — nommer la classe ne garantit pas qu'un élément du prototype la
porte réellement ; à vérifier au lot 10, pas à supposer.



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
- [ ] S1 — **GATE P1** : routes mutatrices et destructives sur des fichiers du dépôt
- [ ] A1 — **plan de retour arrière écrit** pour la suppression (Règle absolue n°4)
- [ ] A2 — verdict ADR sur l'amendement d'`ADR-0005` et `ADR-0019`
- [ ] A3 — **définition** de la progression : quelle grandeur, mesurée comment
- [ ] B1 — lancer un cycle pour une spec désignée, chemin confiné
- [ ] B2 — modifier une spec existante
- [ ] B3 — supprimer, avec confirmation serveur **et** retour arrière
- [ ] B4 — agent responsable et progression exposés par `specs.py`
- [ ] F1 — menu `⋮` accessible : focus, flèches, Début/Fin, Échap, restitution
- [ ] F2 — dialogue de détail
- [ ] F3 — confirmation de suppression **nommant l'élément**
- [ ] F4 — actions inertes et visibles quand l'écriture est désactivée
- [ ] S2 — **GATE P2**
- [ ] D1 — tests, dont **mutation** sur le confinement et sur la garde de confirmation
- [ ] C1 — `docs/API.md`, ADR, `CHANGELOG.md`

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
- [ ] Aucune suppression sans confirmation nommant l'élément
- [ ] Une cible hors de la racine du dépôt est **refusée** — vérifié par test de confinement
- [ ] Le retour arrière d'une suppression est **écrit et exécuté au moins une fois**
- [ ] Sans jeton, les trois actions sont inertes et le disent
- [ ] La progression affichée correspond à une grandeur **définie et mesurée**
- [ ] Le menu est entièrement utilisable au clavier
- [ ] Verdicts GATE P1 et P2 écrits
- [ ] Suite verte, mutation sur le confinement et la confirmation

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
