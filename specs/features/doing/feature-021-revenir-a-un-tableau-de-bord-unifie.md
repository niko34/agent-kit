# Adopter la maquette Material 3 — le cockpit mono-écran

> ⚠️ **Cette spec a changé d'objet le 2026-09-20.** Elle s'appelait « Revenir à un
> tableau de bord unifié » et portait un design à inventer. L'utilisateur a fourni sa
> propre maquette, et la spec porte désormais **son adoption fidèle, côté frontend
> seul**. Tout ce qui exige une donnée neuve ou une route neuve est sorti vers quatre
> specs dédiées (voir « Hors périmètre »). L'historique complet du cycle précédent est
> conservé plus bas, à partir du « Journal de bord » : il explique pourquoi les deux
> maquettes de `control-center/maquettes/2026-09-19-*` sont caduques.

## Métadonnées
- **ID** : feature-021
- **Slug** : revenir-a-un-tableau-de-bord-unifie *(conservé : renommer le fichier
  romprait la continuité du journal et créerait un numéro à deux slugs, que
  `check_specs.sh` signale)*
- **Type** : feature
- **Statut** : doing
- **Priorité** : normale
- **Version cible** : N/A
- **Dernière mise à jour** : 2026-09-20
- **Spec(s) liée(s)** : `feature-015`, `feature-016`, `feature-017`, `feature-019`,
  `feature-020` (dont elle révoque des acquis) ; `bug-017` et `bug-018` (entrent dans
  le cycle au titre d'ADR-0017) ; les quatre specs neuves issues du découpage.

## Grandeurs mesurées

Mesurées le 2026-09-20 sur le prototype `control-center/maquettes/2026-09-20-maquette-materiel-3.html`
(copie normative de `docs/design-references/control-center-animated-prototype.html`).

- `taille du prototype` = **84 267 octets, 1 259 lignes**
- `dépendances externes du prototype` = **0** — `grep -cE '(src|href)="(https?:)?//'` → 0,
  `grep -ic material` → 0. Material 3 y est **écrit à la main**
- `jetons de couleur du prototype` = **22** dans son unique bloc `:root`
- `thèmes supportés par le prototype` = **1** — `color-scheme: light`, aucun `data-theme`
- `onglets `role="tab"` dans le prototype` = **0** ; dans `web/index.html` aujourd'hui = **6**
- `éléments `<dialog>` avec `showModal()`` = **3**
- `passages dessinables avec leurs tokens` = **223 / 223 (100 %)** — voir la section
  « RECTIFICATION » plus bas
- `tokens par passage, input+output` = min **1 070**, médiane **27 660**, max **219 359**,
  écart **205×**
- `poids frontend actuel servi` = **230 680 octets**
- `lignes de tests JS existants` = **7 034**, dont `test_app_theme.js` **1 046** et
  `test_app_theme_navigateur.py` **515**, qui perdent leur objet

## Domaines touchés
- [ ] API REST — **aucun endpoint ne change dans CETTE spec**
- [x] Frontend (écrans, composants, appels API)
- [ ] BDD / migrations
- [ ] Auth / permissions
- [ ] Données personnelles — *sorti vers la spec « tokens »*
- [ ] Intégrations externes — **0 dépendance, `ADR-0006` confirmé**
- [ ] Tâches de fond

## Agents requis
- [x] spec-reader — *fait*
- [x] architect — *fait* (inventaire des contradictions, 37 points)
- [ ] security-reviewer, rôle GATE — **sans objet pour cette spec** : aucune donnée
      nouvelle, aucune route nouvelle, aucun tiers. ⚠️ Obligatoire dans les quatre
      specs sorties du périmètre.
- [x] ux-ui-designer — rôle **réduit** : le design est fourni. Il arbitre les trois
      points où la maquette est muette ou fautive (accessibilité, cas limites,
      colonnes configurables)
- [x] frontend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Description

Adopter la maquette Material 3 de l'utilisateur **précisément, pas par interprétation**.
La référence normative est le **prototype HTML**, pas les illustrations : c'est du code,
donc la conformité se **mesure** au lieu de se juger.

Le centre de contrôle devient un cockpit mono-écran : barre supérieure, bande de résumé,
zone de travail avec le cycle à gauche, kanban pleine largeur en dessous, et une bottom
sheet Material 3 pour le détail d'un passage. Le cycle est représenté par un **graphe
d'agents** dont les disques portent l'information, avec les animations d'enchaînement du
prototype reproduites à l'identique.

## Contexte

Le découpage en 6 onglets venait de `feature-019`, l'accordéon de `feature-016`. Un cycle
entier a été consacré en amont à concevoir un remplacement (deux maquettes produites,
`2026-09-19-mono-ecran` et `2026-09-19-couloir`) avant que l'utilisateur ne fournisse la
sienne, qui les remplace toutes les deux. L'historique de ce cycle est conservé plus bas :
il documente des mesures (CSP, contrastes, coût d'une dépendance 3D) qui restent valides.

## Comportement attendu

### Fidélité, et ce qu'elle veut dire ici

La cible est du code. La conformité se vérifie par comparaison **automatique** entre le
prototype et l'implémentation, sur quatre contrats :

1. **Table des jetons** : les noms ET les valeurs hexadécimales du bloc `:root`, égalité stricte
2. **Table des durées** : toute `animation:` et toute `transition:` (durée, délai, courbe)
3. **Parité des classes** : classes posées par le DOM ↔ classes déclarées dans la feuille, **dans les deux sens**
4. **Contrat d'accessibilité** : `id`, `role`, `aria-*`, comptes de `<dialog>`/`showModal()`

### La structure

Barre supérieure · bande de résumé compacte · zone de travail (cycle à gauche) · kanban
pleine largeur · bottom sheet de détail. Aucun `role="tab"` de navigation : mesure
attendue **0**.

### Le graphe d'agents

Disques porteurs d'information, conformes au prototype :

| partie | porte |
|---|---|
| centre | sigle d'identité **et** `input_tokens + output_tokens` |
| anneau | **l'activité, jamais une progression chiffrée** (décision du 2026-09-20) |
| graduations radiales | **12, fixes** — conformes au prototype, pas au document |
| pastilles internes | fichiers, **plafonnées à 3** — conformes au prototype |
| sous le disque | durée |

Le diamètre dépend de **l'état** (52 px → 88 px), plus de la durée.

### Les animations d'enchaînement

Reproduites à l'identique. Le moment `non lancé → actif` est une permutation de classe qui
déclenche onze transitions décalées :

| t | ce qui bouge | durée | courbe |
|---:|---|---:|---|
| 0 ms | disque 52 → 88 px | **820 ms** | `cubic-bezier(.2, 1.28, .34, 1)` — **dépasse puis revient** |
| 0 ms | nom : `bottom` 33 → 53 px | 820 ms | idem, **en lockstep** |
| 0 ms | durée : `top` 31 → 51 px | 820 ms | idem, **en lockstep** |
| 0 ms | anneau `conic-gradient` vers `--state-color` | 460 ms | `cubic-bezier(.2, 0, 0, 1)` |
| 0 ms | halo `box-shadow` 6 px | 460 ms | idem |
| 0 ms | `.work-orbit` opacité 0 → .82 puis `work-orbit 5.2s` | 420 ms | idem |
| 0 ms | `.work-dot` puis `dot-orbit 4.2s`, `translateX(49px)` | — | — |
| 0 ms | `.tool-ticks i` opacité 0 → .22, 8 des 12 prennent `tick-work` 2,8 s / 3,5 s | 160 ms | idem |
| **260 ms** | `.agent-data` `translateY(5px)` → 0 | 520 ms | spatial |
| **300 ms** | `.agent-data` opacité 0 → 1 | 440 ms | effets |
| **300 ms** | durée opacité 0 → 1 | 420 ms | effets |

Autres mouvements : connexions actives `link-flow 1.8s` (tirets 7 8), reprise `1.7s`
inversée en corail (tirets 4 6).

⚠️ **Trois conditions pour que le geste se reproduise** : les 820 ms portent sur le disque
**et** les deux libellés ensemble, sinon ils décrochent ; le dépassement vient du seul
`cubic-bezier(.2, 1.28, .34, 1)`, l'approximer par `ease-out` supprime le caractère ; les
délais 260/300 ms sont ce qui distingue « le disque grandit **puis** les données
apparaissent » de « tout apparaît en même temps ».

**Règle de mouvement** : un passage actif **ne respire pas** et ne change plus de taille ;
l'état terminé réutilise les mêmes 88 px. Seuls les agents réellement actifs animent.

### Ce que la maquette ne dit pas, et qu'il faut quand même livrer

- **Dépôt vide**, **serveur injoignable**, **écriture désactivée** : le prototype ne les
  traite pas. Comportements à déclarer et à livrer.
- **Bornage des cycles** : `PIEGES §19` — le nombre de cycles est un **réglage**, pas une
  mesure. L'écran doit le dire ; la maquette est muette.
- **Indicateur « vivant »** : à brancher sur `actifs` de `instantane()`, **jamais** sur
  l'absence de fin observée — `SessionEnd` ne part jamais, la garde serait livrée morte.

### Ce qui s'écarte de la maquette, délibérément

| écart | raison |
|---|---|
| Les **colonnes** viennent de `/api/etat.colonnes`, jamais figées à `Todo/Doing/Done` | `ADR-0003`. Figer trois colonnes casse le centre de contrôle chez tout projet du kit qui les renomme |
| Le sigle de spec-reader reste **`SP`**, pas `SR` | Les sigles sont distincts entre eux (`SE` est pris) ; le prototype n'a que 6 agents de démonstration |
| La barre supérieure **perd** sélecteur de projet, notifications, réglages et compte | `ADR-0020` : un centre de contrôle appartient à **un** développeur. Livrer ces quatre contrôles, c'est livrer quatre boutons morts |
| Le cycle **ne porte pas de titre de spec** | `ADR-0023` : la corrélation cycle→spec donne un candidat unique dans **2 cas sur 14**. « Cycle #42 » est légitime (`indice_cycle`), le titre non |
| `disposer()` reste **l'unique autorité de géométrie** | `ADR-0025 §4` : cette séparation a déjà trouvé **deux** défauts par mutation. La maquette ne l'interdit pas, elle ne s'en sert pas |
| Contrastes : seuil **4,65** pour le texte, matrice jeton × surface complète | L'audit fourni mesure 7 couples contre **une** surface ; le prototype en a **cinq**. Trois valeurs tombent sous les seuils |

## Comportement actuel

6 onglets `role="tab"`, une section visible à la fois. Accordéon des cycles, diagramme SVG
conforme à `feature-020`, thème clair/sombre (`feature-015`), contraste corrigé
(`bug-016`). Aucune dépendance externe.

## Contraintes techniques
- **Aucune dépendance** — `ADR-0006` confirmé, Material 3 écrit à la main
- **Aucun `<script>` inline**, aucun `blob:`, aucune ressource distante — CSP mesurée
- Pas d'étape de build : ce qui est servi est ce qui est écrit
- **Thème clair seul** (décision du 2026-09-20) : `theme.js` retiré, `ADR-0022`
  partiellement révoqué, contraste **remesuré** contre la palette M3
- Une police `.woff2` reste impossible : hors de `_TYPES`, côté backend, hors périmètre
- ⚠️ Toute garde de conformité lit le prototype depuis **`control-center/maquettes/`**,
  jamais depuis `docs/` — que le clone jetable ne copie pas (`PIEGES §32`, défaut déjà
  mesuré à 199 cas contre 200)

## Fichiers potentiellement concernés
- `control-center/web/index.html`, `app.css`, `app.js`, `diagramme.js` — refonte
- `control-center/web/theme.js` — **supprimé**
- `control-center/web/test_app_theme.js`, `test_app_theme_navigateur.py` — **supprimés**
- `control-center/web/test_app_*.js` — réécrits sur la nouvelle structure
- `control-center/maquettes/2026-09-20-maquette-materiel-3.html` — référence normative
- `docs/DESIGN-SYSTEM.md`, `docs/adr/0030` à `0035`, `CHANGELOG.md`

## Livrables — check-list

### Conformité mesurable
- [ ] F0 — **partition du prototype** : chaque élément affecté à sa spec
      (`feature-022`, `feature-023`, `feature-025`, ou ce cycle) — il est la
      maquette de **quatre** specs. Sans F0, F3 et F4 n'ont pas de cible
      définissable `[complété par le plan du cycle 2]`
- [ ] F1 — garde de **table des jetons** : noms et valeurs hex, égalité stricte avec le prototype
- [ ] F2 — garde de **table des durées** : animations et transitions, durée, délai, courbe
- [ ] F3a — garde de **parité des classes**, volet statique (DOM initial ↔ feuille de
      style), calculable au **lot 0** `[complété par le plan du cycle 2]`
- [ ] F3b — garde de **parité des classes**, volet runtime (classes posées
      dynamiquement par `app.js` en cours d'exécution), au **lot 5**
      `[complété par le plan du cycle 2]`
- [ ] F4a — garde de **contrat d'accessibilité**, volet statique : `id`, `role`,
      `aria-*` déclarés dans le DOM initial, au **lot 0**
      `[complété par le plan du cycle 2]`
- [ ] F4b — garde de **contrat d'accessibilité**, volet runtime : comptes de
      `<dialog>`/`showModal()` réellement ouverts, focus posé, `aria-*` posés
      dynamiquement, au **lot 5** `[complété par le plan du cycle 2]`
- [ ] F5a — garde de **contrastes**, phase matrice : table des **couples interdits**
      dérivée de la matrice complète jeton × surface, seuil 4,65 texte / 3,0 trait
      — calculable sans code, au **lot 0** (décision du 2026-09-21)
      `[complété par le plan du cycle 2]`
- [ ] F5b — garde de **contrastes**, phase peinte : aucun couple interdit n'est
      **réellement peint** (`getComputedStyle`, le prototype n'utilise aucun
      `oklch`), au **lot 5** `[complété par le plan du cycle 2]`

### Implémentation
- [ ] F6 — système visuel M3 : `:root`, surfaces tonales, élévations, typographie, focus 3 px, cibles 48 px
- [ ] F7 — structure mono-écran ; **0** `role="tab"` de navigation — sortie du lot 3,
      point d'arrêt humain obligatoire (structure = point de non-retour visuel)
- [ ] F8 — graphe d'agents : disques, anneau d'activité, 12 graduations, 3 pastilles, durée
- [ ] F9 — animations d'enchaînement, aux durées et courbes exactes
- [ ] F10 — kanban 3 colonnes **lues depuis `/api/etat.colonnes`**, défilement vertical commun
- [ ] F11 — bottom sheet de détail d'un passage, qui **dit ce que le chiffre compte**
- [ ] F12 — cas limites non traités par la maquette : dépôt vide, serveur injoignable, écriture désactivée, bornage déclaré
- [x] F13 — thème sombre retiré : `theme.js`, tests et règles CSS associés — **lot 1**
      `[livré 2026-09-21, 1 seul bloc :root, trou de garde signalé (voir journal)]`
- [ ] F14 — `prefers-reduced-motion` : animations continues supprimées, état final compréhensible
- [ ] F15 — centre du disque **sans chiffre** : livré *dégradable* (l'anneau et le
      reste du disque fonctionnent sans lui), jamais *à trous* (aucun espace vide
      qui signale un chiffre manquant) — la lecture des tokens est sortie vers
      `feature-023` avec son propre GATE `[complété par le plan du cycle 2]`
- [ ] F16 — les **quatre représentations absentes du prototype** qu'`ADR-0031 §3`
      exige d'inventer : l'échec, le « sans clôture », l'agent principal, et la
      règle de non-chevauchement des libellés — mandat principal d'`ux-ui-designer`
      `[complété par le plan du cycle 2]`
- [ ] F17 — registre `ATTENDU_ROUGE` : témoins délibérément rouges pour F1→F5, qui
      opérationnalisent le critère d'acceptation « une garde jamais vue rouge ne
      prouve rien » en artefact concret plutôt qu'en seule discipline de test —
      ⚠️ **terme reçu du plan, contenu exact non retrouvé ailleurs dans le dépôt** ;
      à confirmer avec l'`orchestrator`/`architect` avant le lot 0
      `[complété par le plan du cycle 2]`
- [ ] F18 — la garde CI de partition (`test_ci_partition_navigateur.py`) continue de
      passer, **vérifié par exécution** (46→44 cas, 0 échec, mesuré le 2026-09-21
      dans un clone jetable), une fois `test_app_theme_navigateur.py` supprimé — sa
      liste est dérivée du marqueur `HARNAIS_NAVIGATEUR`, pas tenue à la main
      (`PIEGES §50`, §54) `[complété par le plan du cycle 2]`

### Tests et docs
- [ ] D1 — suites JS réécrites ; ⚠️ la liste `IDS` de `test_app_bug012.js` gagne tout identifiant neuf (`PIEGES §7`, sinon vert à tort)
- [ ] D2 — tests neufs validés **par mutation**
- [x] D3 — la baisse du compte de cas au **lot 1** est **déclarée légitime** dans le
      journal, pas laissée pour une lecture qui la prendrait pour une régression
      (`PIEGES §32`). ⚠️ **Mesure réelle -406, pas -373** : -373 pour les deux fichiers
      supprimés eux-mêmes (`test_app_theme.js` 317 + `test_app_theme_navigateur.py` 56)
      **+ -33 de couplages réels et d'un effet de bord automatique**, tous nommés et
      expliqués dans le journal du 2026-09-21 (lot 1) — 1981 → 1575, tous verts
- [ ] C1 — `docs/features/page-*.md` et `CHANGELOG.md`

## Sécurité & données
- Authentification : **non** · Permissions : **non** · Données personnelles : **non**
- Migration destructive : **non** · Exposition publique nouvelle : **non**
- **Risque identifié** : aucun pour cette spec. Les quatre specs sorties du périmètre en
  portent chacune un, et chacune a son GATE.

## ADR attendu ?
- **Probable** : **oui**, six — `0030` à `0035`. Ils sont écrits séparément et ne sont pas
  un livrable de cette spec, mais elle ne peut être close sans eux.
- ⚠️ **`ADR-0031` doit NOMMER SES PERTES** : les appels d'outils quittent les graduations,
  l'échelle des fichiers passe de 8 paliers d'opacité à 3 pastilles binaires, l'échec, le
  « sans clôture », l'agent principal et l'heure de départ perdent leur représentation.

## Éléments visibles (pour doc-writer)
### Endpoints REST concernés
- aucun
### Écrans / flux UI concernés
- Le tableau de bord entier
### Documentation à produire / mettre à jour
- `docs/features/page-*.md`, `CHANGELOG.md`, `docs/DESIGN-SYSTEM.md` (§5 et §9 **devenus
  faux** sur les jetons), `docs/adr/0030`→`0035`

## Critères d'acceptation
- [ ] Les cinq gardes F1→F5 sont **vertes**, et chacune a été vue **échouer** sur une
      altération volontaire (une garde jamais vue rouge ne prouve rien)
- [ ] `grep -c 'role="tab"' control-center/web/index.html` → **0**
- [ ] Aucun hexadécimal hors du bloc `:root`
- [ ] Aucune dépendance, aucune ressource distante, aucun `<script>` inline — vérifiés par
      **parseur HTML**, jamais par `grep` (`PIEGES §26`, §27)
- [ ] Les colonnes du kanban proviennent de `/api/etat.colonnes` — vérifié en renommant
      une colonne dans la configuration
- [ ] `prefers-reduced-motion` : aucune animation continue, état final compréhensible
- [ ] Suite complète verte, **zéro régression** — ⚠️ suppose `bug-018` traité, sinon il
      n'existe aucune ligne de base verte à opposer
- [ ] Lint propre

## Plan de test manuel
1. Charger le cockpit sur un dépôt actif : l'état se lit sans aucun clic
2. Lancer un cycle et **regarder l'enchaînement** : le disque grandit une fois, dépasse,
   revient ; les données montent 260-300 ms après ; l'anneau tourne sans afficher de %
3. Forcer `prefers-reduced-motion` : plus d'animation continue, rien d'illisible
4. Renommer une colonne dans `control-center.toml` : le kanban suit
5. Couper le serveur : l'écran dit qu'il ne sait plus
6. Pointer sur un dépôt sans événement : état vide explicite
7. Largeur mobile : les colonnes s'empilent, le défilement imbriqué disparaît

## Notes pour agent
- **Le document et le prototype se contredisent** sur les graduations et les pastilles.
  Décision du 2026-09-20 : **le prototype fait foi**.
- Ne pas « corriger » les segments « sans fin observée » : voulu, documenté (`bug-004`).
- Les suites de ce module sont des **scripts autonomes**, pas du `unittest`.
- Après tout commit sur `server.py`, **relancer le serveur avant de mesurer** (`PIEGES §46`).
- Un test qui lit le prototype depuis `docs/` **se saute en silence** dans le clone.

## Hors périmètre — sorti vers quatre specs dédiées

| spec | sujet | pourquoi elle sort |
|---|---|---|
| **N1** | Panneau de conversation permanent avec Claude | Aucun canal d'entrée n'existe : `lanceur.py` fait un `Popen` **sans stdin réinjectable**. Injecter du texte dans un agent en cours est une surface d'injection → GATE P1 |
| **N2** | Tokens : lecture des transcripts de sous-agent | Lecture **hors racine du projet**, fichiers contenant des conversations entières → GATE P1 |
| **N3** | Rédaction de la spec par Claude | Révoque `ADR-0027` §2 et §1 ; rouvre l'exfiltration du texte saisi et le plafond `budget_max_usd` → GATE P1 |
| **N4** | Actions du backlog : lancer pour une spec, modifier, supprimer | Route **destructive** sur des fichiers du dépôt → GATE P1 + Règle absolue n°4 |

Également hors périmètre : la barre supérieure multi-projets/notifications/compte
(`ADR-0020`), et le contenu du diagramme au-delà de son rendu.

---
## Journal de bord

<!-- UNE ligne par étape du workflow, écrite QUAND L'ÉTAPE TOMBE, jamais à la
     clôture. Horodatage · étape · agent · verdict · preuve chiffrée ou livrables. -->

- [2026-09-19 21:13] Étape 0 — orchestrator — plan rendu : cycle borné à
  A0-A3/S1/U1-U5/C1-C1b, arrêt après `ux-ui-designer`, `security-reviewer` GATE
  confirmé sans objet tant qu'aucune dépendance tierce n'entre dans le périmètre
- [2026-09-19 21:18] Mesure A0 — agent principal — three.js écarté : poids réel
  2 120 885 o (2,02 Mo, facteur 3,4 au-dessus de l'estimation initiale ~600 Ko),
  licence MIT, maintenance active (313 versions, dernière le 2026-09-08) — verdict :
  dépendance non retenue, rendu en Canvas 2D / SVG / CSS
- [2026-09-19 21:24] Étape 1 — spec-reader — spec complète au regard de
  `_template.md`, promue vers `doing/` sans copie (`check_specs.sh` vert,
  40 specs, aucun doublon) ; livrables A2, A3, U5, C1b ajoutés à la check-list
  Cycle 1 sur constat du plan ; A0 et S1 confirmés déjà tombés (A0 mesuré,
  S1 sans objet)
- [2026-09-19 21:33] Étape 2 — architect — A1 : ADR REQUIS (4 critères sur 4),
  ADR-0024 **amendé et non révoqué** (§1 et la partie navigation de §2 remplacés ;
  §3, §4 et §5 restent en vigueur et s'imposent au cycle 2) ; A3 : ADR-0006
  **confirmé**, non amendé, le refus de three.js entrant dans ADR-0029 comme
  alternative écartée ; A2 : CSP **mesurée en HTTP** (clone jetable, port 8801,
  chromium) — Worker même origine AUTORISÉ, ce que la check-list affirmait
  interdit ; WebGL/WebGL2 autorisés ; `eval`, `new Function`, `<script>` inline,
  worker `blob:` et toute ressource distante refusés ; `.woff2` impossible car
  hors de `_TYPES` (le mur est le backend, pas la CSP) ; un fichier neuf est
  servable sous 4 conditions dont la relance du serveur — livrables A1, A2, A3
- [2026-09-19 21:44] Étape 3 — ux-ui-designer — U1 : 6 sections inventoriées, 0 supprimée,
  1 conservée, 1 conservée-éclatée, 4 fusionnées (aucune donnée perdue, le droit
  de suppression accordé n'a pas été exercé) ; U2 : mono-écran à 6 panneaux en
  grille 2 colonnes, ordre DOM = ordre de lecture = ordre de tabulation ; U3 :
  **4** animations, chacune rattachée à une information, 1 effet retiré
  (révélations au défilement, décoratif) — ni WebGL ni Canvas 2D retenus ;
  U4 : 6 cas limites déclarés ; U5 : `inert` sur les frères de `#porte-jeton`,
  la contention de focus restant nécessaire en complément (PIEGES §15) —
  livrables U1, U2, U3, U4, U5. ⚠️ Deux points remontés à l'humain : parti pris
  plus sobre que la demande « effet wahoo », et retour d'un `role="tablist"`
  pour la sélection des cycles antérieurs
- [2026-09-19 21:53] Étape 3bis — ux-ui-designer — second passage sur mandat humain
  (parti pris jugé trop sobre, 0 suppression exercée). U1 révisé : section
  `agents` SUPPRIMÉE en entier, 5 lignes sur 8 de `systeme` supprimées,
  `.table-passages` supprimée (celle que la spec désignait nommément),
  `#compteur-prompt`, note de plafond et liste des commits supprimées,
  `evenements` démotée du permanent vers le tiroir — chaque coupe chiffrée
  avec son coût et qui la regrette. U3 révisé : 3 signatures — champ de
  particules dont la densité est le débit réel d'appels d'outils,
  chronomètre 56 px qui se fige à la fin du cycle ou à la chute du flux,
  matière « puits contre bureau ». WebGL écarté explicitement malgré sa
  disponibilité mesurée (aucune donnée 3D). U2 corrigé aux seuls points
  déplacés : grille de 6 à 5 zones — livrables U1, U2, U3 révisés
- [2026-09-19 22:07] Étape 3ter — frontend-developer — maquette construite :
  `control-center/maquettes/2026-09-19-mono-ecran.html` (42 401 o) +
  `.js` (35 653 o). Vérifié par l'agent principal, pas sur parole : **0**
  script inline avec corps (parseur HTML, pas grep — PIEGES §26/§27), **0**
  URL distante, **0** `type="module"`, `git status control-center/web/` vide
  — le point d'arrêt est tenu. Les 3 signatures sont fonctionnelles ; le champ
  de particules tourne en `requestAnimationFrame` car `file://` bloque les
  Workers, la variante `OffscreenCanvas`+Worker restant au cycle 2 sous HTTP.
  Servie sur le port 8790 pour relecture humaine — livrable U2 matérialisé
- [2026-09-19 22:13] Étape 4 — doc-writer — `docs/adr/0029-le-tableau-de-bord-revient-au-
  mono-ecran.md` créé, portant A1 et A3 dans un seul ADR ; ADR-0024 passé à
  « Accepté (§1 et la partie navigation de §2 remplacés par ADR-0029) », corps
  intact ; **ADR-0006 non touché**, confirmé ; `docs/adr/README.md` réindexé ;
  `DESIGN-SYSTEM.md` amendé §4 (chronomètre 56 px déclaré extension assumée),
  §6 (accordéon → bande de sélection), §8 (table des passages supprimée), §9
  (Worker/OffscreenCanvas/WebGL déclarés autorisés par la CSP mesurée, lib
  graphique toujours interdite, `.woff2` expliqué par `_TYPES`), §10 et
  « Décisions consignées » ; `PIEGES.md` enrichi de §44, §45, §46 — vérifié
  par l'agent principal : `check_doc_links.sh` 116 liens 0 mort,
  `check_specs.sh` 40 specs 0 doublon, `git status control-center/web/` vide,
  aucune reprise de « ~600 Ko » comme un fait (6 occurrences, toutes encadrées
  comme estimation réfutée) — livrables C1, C1b
- [2026-09-19 22:13] **ARRÊT DE CYCLE** — maquette U2 servie sur le port 8790 et soumise à
  validation humaine. La spec **reste dans `doing/`**. Aucune ligne de
  `control-center/web/` écrite, rien commité, rien poussé. Le cycle 2
  (B1-B4, D1, D2, C2) ne démarre que sur feu vert explicite, et devra
  d'abord trancher `bug-018` : la CI est rouge depuis **7** runs consécutifs
  (mesuré le 2026-09-19 : 3 échecs dans `test_jeton.py` sur les modes
  0100/0200/0300, 1 échec sur `::ffff:127.0.0.1`), donc le critère « zéro
  régression » du cycle 2 n'a aucune ligne de base verte à opposer
- [2026-09-19 22:16] **REPRISE DE CYCLE** — agent principal — l'humain a vu la maquette et
  **retire deux verrous**, pas des détails : (1) la règle « aucun effet sans
  fonction » est retirée — impressionner devient un objectif en soi et la charge
  de la preuve s'inverse ; (2) le diagramme est ouvert à un redessin complet,
  ce qui rouvre `ADR-0025` et `ADR-0026` et jette l'acquis de `feature-020` —
  l'humain a été prévenu du coût avant de trancher. ⚠️ **ADR-0029 est désormais
  faux sur sa raison décisive** : il refuse la 3D au motif qu'« une scène 3D
  serait l'effet décoratif que la spec interdit », prémisse retirée. Addendum
  daté à écrire une fois le nouveau design rendu ; le poids mesuré de three.js
  et `ADR-0006` restent valides mais n'étaient pas les arguments décisifs.
  Contrainte substituée au veto levé : un redessin du diagramme doit **nommer
  ses pertes**. U1 et ses 7 suppressions restent validés. Étape 3 relancée.
- [2026-09-19 22:22] Étape 3quater — ux-ui-designer — parti pris **« Le Couloir »** : scène
  WebGL écrite à la main, sprites billboardés, un seul shader — **aucune
  bibliothèque demandée** après évaluation. Verdict diagramme : **refait par
  défaut, conservé en repli** — le rendu SVG de `feature-020` devient le mode
  « Plan », intact au bit près, et sert de repli automatique si WebGL échoue.
  ⚠️ Conséquence : **ADR-0025 et ADR-0026 n'ont PAS à être révoqués**, ils
  restent en vigueur pour le mode Plan — le coût annoncé à l'humain n'est
  finalement pas payé. Pertes nommées et bornées : la taille d'un cercle cesse
  d'être fonction pure de la durée, facteur de recul contraint à **[0,72 ; 1]**
  (≤ 28 % d'écart dû à la position) ; dénombrer les graduations d'un cercle
  lointain devient plus dur, compensé par le survol, le défilement en
  profondeur et la bascule Plan. Contrainte posée par le designer lui-même :
  le flou de profondeur ne touche **jamais** le texte. 10 effets au catalogue,
  chacun avec son repli `reduced-motion` — livrables U2, U3 révisés
- [2026-09-19 22:47] Étape 3quinquies — frontend-developer — seconde maquette :
  `2026-09-19-couloir.html` (50 383 o) + `.js` (55 112 o), scène WebGL écrite
  à la main, un seul programme de shader, sprites en `gl.POINTS`. La première
  maquette reste **octet-identique** (42 401 / 35 653), les deux sont servies
  pour comparaison. Borne de recul [0,72 ; 1] posée **explicitement** en JS
  (`BORNE_RECUL_MIN`) ET dans le shader (`clamp`), jamais laissée émerger de
  la division de perspective. Texte jamais dans le canevas, jamais parallaxé.
  ⚠️ **2 défauts trouvés en EXÉCUTANT, pas en relisant** : (1) une typo
  `graducacionAgente`/`graduacionAgente` levait un `ReferenceError` synchrone
  qui vidait la scène **sans aucune erreur visible** — bascule affichée,
  canevas présent, 0 point dessiné ; (2) `toggleAttribute(nom, true)` pose la
  valeur `""` et non `"vrai"`, donc le sélecteur du repli reduced-motion ne
  matchait jamais et le bouton de démonstration ne produisait rien. Vérifié en
  Chromium : 0 erreur JS, WebGL2 obtenu, 55 points + 4 plaques, bascule
  fonctionnelle dans les deux sens, `git status control-center/web/` vide
  — livrable U2 matérialisé, variante « Le Couloir »
- [2026-09-20 19:34] **REFONDATION** — agent principal — l'utilisateur fournit sa propre
  maquette Material 3 et demande « la maquette précise, pas une
  interprétation ». Les deux maquettes du cycle sont **caduques**. Référence
  normative = `docs/design-references/control-center-animated-prototype.html`
  (code, donc conformité **mesurable**) ; les 12 PNG n'étaient que des
  illustrations — retirés avant tout commit, 18 Mo qui n'entrent jamais dans
  l'historique, 144 Ko conservés. Deux décisions humaines : (1) **les tokens
  seront capturés**, donc le **backend entre dans le périmètre** et le
  **GATE de sécurité redevient obligatoire** — les tokens ne sont dérivables
  que depuis `transcript_path`, c'est-à-dire en lisant des transcripts qui
  contiennent données personnelles et secrets ; (2) **le thème sombre est
  supprimé** au profit de la fidélité — 75 lignes de `theme.js`, 1 046 de
  `test_app_theme.js`, 515 de `test_app_theme_navigateur.py`, 5 règles CSS et
  34 occurrences dans `app.js` à retirer, `ADR-0022` partiellement révoqué,
  le contraste de `bug-016` à remesurer contre la palette M3 claire.
  Mesuré : 0 token sur 14 372 événements. Analyse de découpage en cours.
- [2026-09-20 19:43] Étape A — architect — inventaire des contradictions rendu (37 points
  mesurés contre le **prototype**, pas contre le document). Résultats qui
  commandent la suite : **ADR-0006 CONFIRMÉ sans exception** (M3 écrit à la
  main : 0 lien, 0 script tiers, 0 occurrence du mot « material ») ;
  **ADR-0025 §1-§3 et ADR-0026 en entier RÉVOQUÉS** (le diamètre devient
  fonction de l'état, 52→88 px, plus de la durée) sauf **ADR-0025 §4**
  (séparation géométrie/rendu) recommandé en écart assumé ; **ADR-0022**
  révoqué (l'identité colorée disparaît) ; **ADR-0027 §1 et §2 révoqués**
  si Claude rédige la spec — ce défaut a déjà coûté une reboucle complète
  à `feature-008` (ADR-0027 §7). ⚠️ **Les tokens par sous-agent sont
  IMPOSSIBLES** : 0 ligne `isSidechain` sur 13 680 lignes de transcript, les
  tours de sous-agent n'y sont pas. Le dépôt l'avait écrit d'avance
  (DESIGN-SYSTEM §5 : « toute maquette qui affiche un nombre de jetons invente
  une donnée »). ⚠️ Le dépôt bat l'audit d'accessibilité fourni sur **3**
  points mesurés : turquoise 4,604 < marge 4,65 ; `--line-strong` 2,976 <
  seuil dur 3:1 ; 3 informations portées par la seule couleur (1,370:1).
  6 ADR à écrire (0030 à 0035). 4 blocs exigent backend + GATE P1.
- [2026-09-20 19:43] **DÉCISIONS HUMAINES** — (1) tokens : **mesurer d'abord** si un hook
  peut les capturer (`SubagentStop`), avant tout arbitrage ; (2) en cas de
  divergence document/prototype, **le prototype fait foi** — 12 graduations
  fixes et 3 pastilles plafonnées, donc le disque cesse d'encoder les appels
  d'outils et l'échelle des fichiers passe de 8 paliers à 3, pertes assumées ;
  (3) **`feature-021` garde le frontend** (visuel M3, structure mono-écran,
  kanban, diagramme) et **4 specs neuves** portent la conversation permanente,
  les tokens, la rédaction par Claude et les actions du backlog.
- [2026-09-20 19:47] ⚠️ **RECTIFICATION** — agent principal — la conclusion « tokens par
  sous-agent impossibles » était **FAUSSE** : recherche incomplète, le
  sous-répertoire `subagents/` n'avait pas été regardé. Mesuré : **225**
  transcripts par sous-agent, appariement `agent_id` ↔ nom de fichier exact
  (225/225), et **223 des 223 passages dessinés** (ceux qui portent un
  `agent_type`) ont leur transcript — **100 % de couverture**. Le centre du
  disque et l'anneau redeviennent implémentables ; la contradiction C20
  tombe ; `DESIGN-SYSTEM.md` §5 et §9 n°7 deviennent FAUX et sont à amender.
  Le GATE reste obligatoire : lecture hors racine, transcripts contenant des
  conversations entières. Deux questions de conception ouvertes : quel chiffre
  (sortie seule ou total avec cache, deux ordres de grandeur d'écart) et
  comment l'anneau progresse sans total final connu.
- [2026-09-20 19:53] **DÉCISIONS HUMAINES — disque d'agent** — (1) le centre affiche
  `input + output`, validé par mesure : 205× d'écart entre passages, quartiles
  15 805 / 27 660 / 44 203, alors que `cache_read` pèse 241× le total et
  écraserait la lecture ; réserve écrite : ce chiffre mesure le travail, pas le
  coût, et l'interface doit le dire. (2) L'anneau **ne mesure plus une
  progression** — animation indéterminée en actif, complet et stable en
  terminé, éteint en non lancé. Écart assumé au document de l'utilisateur
  (« progression de l'anneau »), motivé : on n'affiche pas une proportion
  qu'on ne sait pas mesurer. Effet de bord favorable : l'anneau ne dépend plus
  des tokens, donc il survit à un refus du GATE sur la lecture des transcripts.
- [2026-09-20 19:59] Étape B — agent principal — **restructuration**. (5) prototype copié
  en `control-center/maquettes/2026-09-20-maquette-materiel-3.html`, dans le
  périmètre du clone jetable — sans quoi toute garde de conformité se serait
  sautée en silence (`PIEGES §32`). (1) `feature-021` **réécrite autour du
  frontend seul** : titre « Adopter la maquette Material 3 — le cockpit
  mono-écran », 14 livrables F1-F14 + D1, D2, C1, dont **5 gardes de conformité
  mesurables** (jetons, durées, parité des classes, accessibilité, contrastes) ;
  le journal et tout l'historique sont **conservés** sous la nouvelle tête.
  (2) **4 specs neuves** en `todo/` : `feature-022` conversation permanente,
  `feature-023` tokens par passage, `feature-024` rédaction par Claude,
  `feature-025` actions du backlog — chacune avec son GATE et son risque nommé.
  Hygiène : **44 specs**, aucun doublon, 116 liens tous résolus.
  ⚠️ Écart assumé au plan : **aucun ADR n'est écrit pour « Claude rédige la
  spec »** — cette décision n'est pas prise, `feature-024` laisse l'arbitrage
  sur la relecture à l'humain. La graver aujourd'hui inventerait un choix.
- [2026-09-20 20:11] Étape C — doc-writer — **5 ADR créés** : `0030` (M3 écrit à la main,
  `ADR-0006` CONFIRMÉ sans exception), `0031` (grammaire du disque — révoque
  `ADR-0025` §1-§3 et `ADR-0026` **en entier**, **nomme ses pertes**, maintient
  `ADR-0025 §4` en écart assumé, grave l'anneau d'activité sans progression),
  `0032` (l'identité colorée disparaît ; plancher ΔE déclaré **sans objet et
  non faux**), `0033` (thème sombre supprimé), `0034` (références de
  conception). `ADR-0026` passe à `Superseded by ADR-0031` ; `0022`, `0024`,
  `0025` voient leur statut amendé ; `0029` reçoit son addendum daté.
  `DESIGN-SYSTEM.md` §5 et §9 **rectifiés** : la règle est conservée, son
  fondement factuel corrigé et daté — les jetons SONT mesurables.
  Vérifié par l'agent principal : `ADR-0006` et `ADR-0027` **non touchés**,
  167 liens tous résolus, 44 specs sans doublon, `control-center/web/` intact.
  ⚠️ Aucun critère d'acceptation de cette spec n'est cochable : ils portent
  tous sur du code, et aucune ligne n'a été écrite.

---
# Notes d'implémentation

## Plan (architect) — 2026-09-19

**Approche en une ligne** — Le cycle 1 ne touche aucune ligne de
`control-center/web/` : il produit un ADR qui révoque le découpage en onglets et
consigne le refus de la dépendance 3D, aligne le design system sur cette
révocation, et rend la maquette vérifiable contre la politique de sécurité
réellement servie.

### Étapes (≤ 10)

1. `docs/adr/0029-le-tableau-de-bord-revient-au-mono-ecran.md` [nouveau] — **un
   seul** ADR porte A1 (révocation des onglets) **et** A3 (refus de three.js,
   trois alternatives chiffrées). Prochain numéro libre mesuré :
   `ls docs/adr/ | tail -2` → `0028…`, donc **0029**.
2. `docs/adr/0024-une-section-a-la-fois-dans-un-contenu-borne.md` — statut passé
   à `Accepté (§1 et §2 remplacés par ADR-0029)`. **Amendé, pas révoqué en
   bloc** : ses §3 (absorption `bug-016`), §4 (`--surface-2` teinte
   d'interaction) et §5 (marge de conception chiffrée) restent en vigueur et
   n'ont aucun rapport avec la navigation.
3. `docs/adr/README.md` — ligne 0024 amendée, ligne 0029 ajoutée (le README
   porte déjà ce motif : ADR-0025 y est « §1 partiellement remplacé par
   ADR-0026 »).
4. `docs/DESIGN-SYSTEM.md` [C1b] — §6 « Liste des cycles » réécrit (l'accordéon
   disparaît), §9 « Interdits » complété (aucune navigation qui masque du
   contenu ; aucune animation sans information portée), ligne ajoutée au tableau
   « Décisions consignées ». **Avant le cycle 2**, sinon l'implémentation code
   contre un design system qui l'interdit encore.
5. `control-center/maquettes/2026-09-19-mono-ecran.html` [nouveau, U2/U3] —
   autonome, thème clair **et** sombre, aucune ressource distante. Ce dossier
   n'est **pas servi** (`_RACINE_WEB` = `control-center/web`, `server.py:131`) :
   voir la mise en garde d'atteignabilité en A2.
6. U1 — inventaire des sections **lu depuis l'artefact**
   (`grep -c 'data-section=' control-center/web/index.html` → **6**, mesuré le
   2026-09-19 sur `d1838ed`), un verdict conservée / fusionnée / supprimée et
   une justification écrite par section.
7. U4 et U5 — déclarés en prose **dans** la maquette (repli sans animation,
   petit écran, absence de WebGL, dépôt vide, serveur injoignable ; mécanisme
   d'inertie de la porte d'authentification).
8. Aucun fichier sous `control-center/web/` n'est créé ni modifié au cycle 1 :
   le point d'arrêt le dit, et la CSP ne s'éprouve qu'après la validation
   humaine de U2.
9. Cycle 2 (pour mémoire, non exécuté ici) : `index.html` → `app.css` →
   `app.js` → `diagramme.js`, puis réécriture des suites JS.

### Nouvelles signatures / endpoints

- **Aucun endpoint, aucun schéma de réponse, aucune migration.** Le backend est
  hors périmètre (spec, « Hors périmètre »).
- Nouveaux fichiers documentaires : `docs/adr/0029-*.md`,
  `control-center/maquettes/2026-09-19-mono-ecran.html`.

### Données & transactions

- Sans objet : aucun accès BDD, aucune transaction, aucune tâche de fond. Le
  module ne lit que le journal d'événements et `git`, inchangés ici.

### Trade-offs

- **Retenu — un seul ADR pour A1 et A3.** Le refus de three.js est
  l'*alternative écartée* du même arbitrage visuel : les séparer obligerait à
  recopier les mêmes chiffres dans deux documents immuables, et l'un des deux
  vieillirait seul. Contre : l'ADR porte deux sujets, et une recherche sur
  « dépendance » ne le trouve que par son titre.
- **Écarté — deux ADR distincts** (un par verdict) : cohérent avec « un ADR = une
  décision », mais ici les deux décisions ont été prises dans le même geste, sur
  la même mesure.
- **Écarté — amender ADR-0006 pour y consigner le refus** : un ADR est immuable
  une fois accepté (`docs/adr/README.md:11`). ADR-0006 est **confirmé**, il n'est
  pas touché ; c'est ADR-0029 qui cite le cas d'espèce.

---

## A1 — Verdict ADR : la révocation du découpage en onglets

**ADR REQUIS — oui.** Les quatre critères de `CLAUDE.md` sont examinés un par un ;
**trois sont remplis**, et un seul suffit.

| Critère | Rempli ? | Établissement |
|---|---|---|
| 1. Contrainte structurante imposée à d'autres parties | **oui** | ADR-0024 « Ce que cela contraint pour tout écran futur » : un bloc neuf n'avait que deux places — rejoindre une des six sections, ou ouvrir un septième onglet. Révoquer cela rend sa place à l'empilement, donc change la règle de tout écran à venir. |
| 2. Décision invisible dans le code | **oui** | Le code livré dira « un seul écran ». Rien dedans ne dira qu'une colonne de navigation a existé, ni pourquoi elle a été retirée quatre jours après avoir été livrée (`feature-019`, ADR-0024 daté du 2026-09-15). Sans ADR, le prochain cycle qui trouvera l'écran trop dense re-proposera des onglets. |
| 3. Alternatives crédibles dont le pourquoi mérite trace | **oui** | ADR-0024 §2 avait écarté trois options (empilement, onglets horizontaux, navigation par ancres) ; ce cycle réhabilite précisément la première. L'ADR doit dire ce qui a changé — l'usage, pas le raisonnement — sous peine de faire passer la révocation pour un oubli. |
| 4. Verrouillage d'une orientation à long terme | **oui** | Le mono-écran fixe pour la suite que toute information nouvelle se dispute une place visible, au lieu d'ouvrir un tiroir. C'est un budget d'écran fermé, imposé à tous les cycles suivants. |

**Sort d'ADR-0024 : AMENDÉ, pas révoqué.** Seuls son **§1** (colonne de
navigation, contenu borné, une section à la fois) et la partie de son **§2** qui
justifie l'écart de l'empilement sont remplacés. Ses §3 (absorption de
`bug-016`), §4 (`--surface-2` réservé à une teinte d'interaction) et §5 (toute
borne numérique se pose avec une marge chiffrée — **2,5 bits**, nominal ≥ 4,65
pour un seuil dur de 4,5:1) **restent en vigueur** et ne touchent pas à la
navigation.

**Statut à poser** : `Accepté (§1 et §2 remplacés par ADR-0029)`, sur le modèle
déjà employé pour ADR-0025 §1 vis-à-vis d'ADR-0026 (`docs/adr/README.md:55-56`).
Un ADR ne se réécrit pas (`docs/adr/README.md:11`) : seule la ligne de statut
change, et ADR-0029 porte le raisonnement neuf.

**Ce qui reste verrouillé malgré la révocation** — à écrire dans ADR-0029, sinon
le cycle 2 croira le champ libre :
- la règle de marge chiffrée du §5 (elle s'appliquera à tout seuil que le
  nouveau langage visuel introduira : opacité, durée, contraste) ;
- `--surface-2` interdit en aplat de repos (§4) — un mono-écran dense sera
  tenté de délimiter ses blocs par des aplats ; c'est déjà interdit ;
- le motif ARIA `tablist` disparaît **avec** ses obligations clavier, mais
  l'obligation d'accessibilité, elle, ne disparaît pas : ce qui remplace les
  onglets doit rester parcourable au clavier.

---

## A2 — Contraintes CSP applicables à un design sans dépendance

Toutes les lignes ci-dessous sont **mesurées**, jamais déduites de la lecture de
l'en-tête. Protocole (respecte `control-center/PIEGES.md` §1, §2, §5, §10) :
clone jetable `cp -a` (`control-center/` + `.claude/agents/` +
`specs/features/_template.md` + `specs/modele.md`), serveur du clone sur le
**port 8801** (jamais 8788, §2), sondes chargées **en HTTP** (§10 : un harnais
`file://` ne prouve rien), lecture par
`chromium --headless --disable-gpu --no-sandbox --virtual-time-budget --dump-dom`
et par l'événement `securitypolicyviolation`. Serveur arrêté et port rendu après
mesure ; **rien n'a été écrit dans `/root/agent-kit/control-center/`**.

**En-tête réellement servi** (`curl -sD - -o /dev/null http://127.0.0.1:8801/`) :

```
Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

Identique au texte de `control-center/backend/server.py:711-714` cité par la
check-list : **confirmé par mesure**, pas par lecture.

### Ce qui est AUTORISÉ (mesuré)

| Capacité | Mesure | Verdict |
|---|---|---|
| `style=` en attribut | `getComputedStyle(#sa).color` → `rgb(1, 2, 3)` | **autorisé** (`style-src 'unsafe-inline'`) |
| `<style>` dans le document | → `rgb(4, 5, 6)` | **autorisé** |
| `<style>` injecté par JS | → `rgb(7, 8, 9)` | **autorisé** |
| CSSOM (`el.style.x = …`) | → `rgb(10, 11, 12)` | **autorisé** (hors portée CSP) |
| Feuille constructible (`CSSStyleSheet.replaceSync`) | `PRESENT` | **autorisé** |
| Canvas 2D | `getContext("2d")` → `DISPONIBLE` ; `getImageData(1,1,1,1)` → `20,30,40,255` | **autorisé** |
| `canvas.toDataURL()` | rend `data:image/png;…`, 170 octets sur 8×8 | **autorisé** |
| `<img src="data:…">` | `CHARGE` | **autorisé** (`img-src … data:`) |
| `background-image: url("data:…")` | posée, **0 violation** | **autorisé** |
| SVG **inline** | `#si.getBBox()` → `12x9` | **autorisé** |
| SVG **externe même origine** via `<img src="/x.svg">` | `CHARGE` | **autorisé** |
| SVG **externe** via `<use href="/x.svg#c">` | boîte rendue `16x16` (cercle r=8) | **autorisé** |
| `background-image: url("/x.svg")` | résolue en `http://127.0.0.1:8801/sonde_forme.svg` | **autorisé** |
| `requestAnimationFrame` | `PRESENT`, et une frame a réellement tiré (`raf_tick: OUI`) | **autorisé** |
| Animation CSS / WAAPI (`element.animate`) | `CSS.supports("animation","1s linear")` → `OUI` ; `animate` → `PRESENT` | **autorisé** |
| `IntersectionObserver` (révélations au défilement) | `PRESENT` | **autorisé** |
| `matchMedia("(prefers-reduced-motion: reduce)")` | média reconnu | **autorisé** |
| `fetch` même origine | `GET /api/etat` → **200** | **autorisé** (`connect-src 'self'`) |
| **Web Worker même origine** | `new Worker("/sonde_worker.js")` → message reçu : `VIT:worker-vivant`, **0 violation** | **AUTORISÉ** |
| `OffscreenCanvas` | `PRESENT` ; `transferControlToOffscreen()` → `OK` | **autorisé** (hors portée CSP) |
| WebGL / WebGL2 | `DISPONIBLE` / `DISPONIBLE` (Chromium `--disable-gpu`, donc rendu logiciel) | **autorisé** par la CSP |

⚠️ **Correction d'une affirmation de la check-list.** Le libellé du livrable A2
dit « aucun Worker ». **C'est faux, et la mesure le montre** : `script-src`
n'étant pas déclaré, `worker-src` retombe sur `default-src 'self'`, et un worker
servi depuis la même origine démarre et répond. Seul le worker **`blob:`** est
refusé. Un designer qui aurait lu « aucun Worker » se serait interdit un outil
disponible ; c'est exactement la faute que ce projet paie le plus cher.

### Ce qui est INTERDIT (mesuré, avec la directive qui a refusé)

| Tentative | Résultat | Directive qui refuse |
|---|---|---|
| `<script>` inline | `BLOQUE` ; `window.__inline` reste `undefined` | `script-src-elem <- inline` |
| `eval("1+1")` | `BLOQUE:EvalError` | `script-src <- eval` |
| `new Function("return 1")` | `BLOQUE:EvalError` | `script-src <- eval` |
| `new Worker(URL.createObjectURL(blob))` | `ERREUR`, jamais de message | `worker-src <- blob` |
| `<img src="blob:…">` | `REFUSE` | `img-src <- blob` |
| `<img src="https://unpkg.com/favicon.ico">` | `REFUSE` (le réseau est pourtant joignable : `curl … unpkg` → **200**) | `img-src <- https://unpkg.com/favicon.ico` |
| `fetch("https://unpkg.com/three@0.186.0/package.json")` | `BLOQUE:TypeError` | `connect-src <- https://unpkg.com/…` |

**Conséquences directes pour le designer** :
- aucun gestionnaire d'événement en attribut (`onclick="…"`) — c'est du script
  inline ; tout comportement passe par `app.js` ou par du **CSS pur** ;
- aucun moteur de template qui compile (`new Function`) — `EvalError` mesuré ;
- pas de dégradé/motif fabriqué en `blob:` pour être posé en image : passer par
  `toDataURL()` (`data:`, autorisé) ou peindre directement dans le canevas ;
- `frame-ancestors 'none'` : la maquette ne peut pas être démontrée dans une
  `<iframe>` servie par une autre page.

### Polices : la CSP n'est pas le mur, `_TYPES` l'est

`_TYPES` (`server.py:137-142`) ne connaît que **4 extensions** :
`.html`, `.css`, `.js`, `.svg`. Mesuré : `/sonde_police.woff2` → **404 même
après relance**, et `fetch()` depuis la page renvoie bien `404` (donc aucune
violation CSP — la requête part, c'est le serveur qui n'a rien à servir).
**Une police locale embarquée est impossible sans toucher au backend**, qui est
hors périmètre. Le parti pris typographique doit donc tenir sur des **polices
système** (piles `font-family`), ou sur un `data:` en `@font-face` — coûteux et
non mesuré ici, donc **hypothèse non vérifiée** s'il est proposé.

### Un fichier neuf sous `web/` est-il servable ?

`_fichiers_servables()` (`server.py:482-504`) est une **liste fermée calculée au
démarrage** (`demarrer()`, `server.py:1283`). Mesuré sur le clone, mêmes fichiers
avant et après relance du serveur :

| Fichier déposé dans `web/` | Avant relance | Après relance |
|---|---|---|
| `sonde_csp.html` | **404** | **200** |
| `sonde_csp.js` | **404** | **200** |
| `sonde_forme.svg` | **404** | **200** |
| `sonde_worker.js` | **404** | **200** |
| `sonde_police.woff2` | **404** | **404** (extension hors `_TYPES`) |
| `test_sonde_exclue.js` | **404** | **404** (tout nom en `test_` est exclu) |

**Réponse au designer** : oui, il peut proposer un fichier neuf, à **quatre**
conditions cumulatives — (a) posé directement dans `control-center/web/`, (b)
extension parmi `.html`, `.css`, `.js`, `.svg`, (c) nom ne commençant **pas** par
`test_`, (d) **serveur relancé** (`PIEGES.md` §8 : sans relance, le diagnostic
naturel « mon code ne se charge pas » part dans la mauvaise direction).

### ⚠️ Par où l'on atteint la garde CSP — et ce qui la rend inatteignable

La maquette vivra dans `control-center/maquettes/`, qui est **hors de
`_RACINE_WEB`** (`server.py:131`) : elle s'ouvre en `file://`, **où la CSP ne
s'applique pas** (`PIEGES.md` §10). Le précédent est mesuré :
`control-center/maquettes/2026-09-15-diagramme-reference.html` contient **2**
balises `<script>` inline (`grep -c "<script"`) et passe parfaitement en
`file://` — alors que les mêmes lignes recevraient `script-src-elem <- inline`
une fois servies.

Une maquette validée par un humain n'établit donc **rien** sur sa
transposabilité. La contrainte n'est tenue que si le cycle 2 la vérifie à la
livraison. Procédure minimale, déjà exercée ci-dessus : déposer le fichier dans
`web/`, **relancer**, charger en HTTP, lire les `securitypolicyviolation`.
Aucune demande d'assouplissement de la CSP n'est formulée ici — `PIEGES.md` §9
rappelle que ce serait arrêter le cycle et remonter à l'humain.

---

## A3 — Verdict ADR : la dépendance

**ADR-0006 est CONFIRMÉ, pas amendé.** Il n'est **pas touché** : un ADR accepté
est immuable (`docs/adr/README.md:11`), et rien dans ce cycle ne contredit sa
décision — aucune dépendance n'entre, donc il n'y a rien à superséder. Son statut
reste `Accepté`.

**Le refus mérite-t-il son propre ADR ?** **Non — il entre dans ADR-0029 (A1),
en section « alternatives écartées ».** Motif : `DESIGN-SYSTEM.md:405` exige un
ADR *pour introduire* une dépendance ; ici on n'en introduit aucune, donc aucun
ADR n'est **dû** à ce titre. Mais le critère 3 de `CLAUDE.md` (alternatives
crédibles dont le pourquoi mérite d'être documenté) est rempli par le fait que
three.js a été **autorisé puis retiré** : une décision négative qui a changé
d'avis en cours de cycle, sur une mesure, se documente — sinon elle se
re-proposera. Elle appartient au même ADR parce qu'elle est l'alternative
écartée du **même** arbitrage visuel.

**Les trois alternatives pesées, avec leurs chiffres** (mesures du 2026-09-19,
reprises de « Grandeurs mesurées » de cette spec, elles-mêmes issues de A0 — je
ne les ai pas remesurées, cf. consigne) :

| Option | Poids servi | Verdict |
|---|---|---|
| **Vanilla Canvas 2D / SVG / CSS** (retenue) | **0 octet** ajouté ; le tableau de bord entier pèse **230 680 o** | Retenue. Tout ce que la spec demande est mesuré disponible sous CSP (tableau A2) : Canvas 2D, SVG animé, WAAPI, `IntersectionObserver`, `requestAnimationFrame`, worker même origine. |
| **WebGL écrit à la main** | 0 octet ajouté | Écartée. WebGL est **disponible** (mesuré) et autorisé par la CSP, mais il faudrait écrire shaders et repli logiciel à la main, pour des données qui ne sont pas tridimensionnelles ; et la spec exige déjà un repli « machine sans WebGL ». Coût de maintenance sans contrepartie d'information. |
| **three.js 0.186.0 vendu** | **2 120 885 o** servis (`three.module.js` 662 772 + `three.core.js` 1 458 113), **aucun build minifié en 0.186.0** (HTTP 404), **aucune compression** côté serveur → **9,2 ×** le tableau de bord entier | Écartée. |

**L'argument décisif n'est pas le poids, il est la portée.** ADR-0006 rappelle
que `control-center/` est distribué **tel quel** à tout projet instancié depuis
le kit (`tools/update_kit.sh`, chemin conditionnel — ADR-0010) : un poids accepté
ici **voyage partout**, et chaque projet du kit hériterait de 2,02 Mo de source
non minifiée qu'aucun de ses auteurs n'a relue. S'y ajoutent deux raisons
propres à ce cycle :
- **de fond** : rien de ce que ce tableau de bord montre n'est une donnée à trois
  dimensions ; une scène 3D y serait exactement l'effet décoratif que la spec
  interdit (« aucun effet sans fonction ») ;
- **de sécurité** : un script tiers non relu, servi par la **même origine** que
  la page qui détient le jeton d'écriture (`Authorization: Bearer`), peut lire ce
  jeton et s'en servir sur les routes d'écriture. C'est ce qui fondait le GATE
  P1 ; l'abandon de la dépendance referme ce chemin — d'où S1 « sans objet ».

**À rouvrir immédiatement** si un fichier tiers réapparaît dans le périmètre :
`security-reviewer` rôle GATE, et ADR contre ADR-0006 (`DESIGN-SYSTEM.md:405`).

---

## Points d'attention pour la suite du cycle

- **La maquette ne prouve pas la CSP** (§10) — voir A2. Le cycle 2 doit vérifier
  en HTTP, pas en `file://`.
- **`PIEGES.md` §16** : tout chiffre affiché sur l'écran doit venir des données.
  Le journal ne porte **ni compte de jetons ni nom de spec** — une maquette qui
  en montre promet des données inexistantes (deux specs l'ont déjà fait).
- **`PIEGES.md` §19** : le nombre de cycles est un réglage, pas une donnée
  (**3** sans bornage, **13-14** en configuration courante, **27** avec deux
  agents ouvrants) ; le mono-écran doit le dire (ADR-0014).
- **`PIEGES.md` §17** : ~85 % des cycles portent « fin non observée » parce que
  `SessionEnd` ne part jamais sur une session longue. Un indicateur « en cours »
  fondé sur ce champ serait **livré mort**.
- **`PIEGES.md` §15** : dans un mono-écran, « masquer » ne neutralise pas. Seuls
  `hidden`, `display:none`, `visibility:hidden` et `inert` retirent un contrôle
  du parcours clavier — ce qui est la matière même de U5 (`bug-017` : jusqu'à
  **6** contrôles restent atteignables sous la modale). U5 **déclare** le
  mécanisme ; il ne le livre pas.
- **`PIEGES.md` §21** : l'inventaire U1 se lit depuis `index.html`, jamais
  depuis une liste recopiée.
- **`PIEGES.md` §7** : la liste `IDS` de `test_app_bug012.js` est tenue à la
  main ; tout identifiant neuf du cycle 2 doit y être ajouté, sinon la suite
  mesure autre chose **en silence**.

## Tests à prévoir (cycle 2, pour dimensionnement)

- `grep -c 'role="tab"' control-center/web/index.html` → **0** (critère
  d'acceptation déjà écrit ; valeur actuelle mesurée : **6**).
- Garde HTTP (motif de `test_app_navigation_http.py`) : la page servie ne
  contient **aucun** `<script>` inline et ne déclenche aucune
  `securitypolicyviolation` — c'est ce qui rend la contrainte A2 atteignable
  ailleurs que dans une intention.
- `prefers-reduced-motion: reduce` → rendu statique sans perte d'information,
  mesuré sur le style calculé (`PIEGES.md` §24 : jamais sur l'ordre des règles
  dans la feuille).
- Réécriture des **7034** lignes de tests JS (valeur de « Grandeurs mesurées »,
  à remesurer avant le cycle 2) : l'accordéon et la navigation par onglets y
  sont encodés.



---

## Design retenu (ux-ui-designer, second passage du 2026-09-19)

Premier passage refusé par l'humain sur deux points : parti pris trop sobre, et
**zéro suppression exercée** alors que le droit en avait été explicitement accordé.
Ce qui suit est le second passage. U4 et U5 du premier passage restent valides.

### U1 — ce qui disparaît pour de bon

| Section | Verdict | Ce qui est retiré | Coût assumé |
|---|---|---|---|
| `agents` | **SUPPRIMÉE entière** | `ul#agents`, colonne modèle, glyphe peut-écrire, métadonnées du `title=` | Vérifier le modèle d'un agent depuis le navigateur ; la source de vérité reste `.claude/agents/<rôle>.md` dont l'UI n'était qu'une copie. L'identité couleur/sigle survit dans la légende du diagramme, le choix d'agent dans le `<select>` de Piloter |
| `systeme` | **5 lignes sur 8 supprimées** | Dépôt/branche (doublon exact de `#jauge-git`), Configuration en régime nominal (ne réapparaît qu'en alerte si la config tombe sur ses défauts), Commandes déclarées, Workflows (dédoublonné : la légende de bornage du sélecteur de cycles le porte déjà) | La section « Système » n'existe plus ; Divergences, Budget max et Écrivains migrent en pastilles d'un panneau **différent** (État du dépôt) |
| `developper` | **2 blocs supprimés** | `#compteur-prompt` (compte un `textarea` **sans limite déclarée** : il ne prévient d'aucun plafond), note de plafond du pilotage (elle compensait l'onglet « Système » fermé — le mono-écran la rend redondante par construction) | Nul : aucune information perdue |
| `cycles` | **`.table-passages` SUPPRIMÉE** | La table héritée de `feature-016` qui liste en colonnes ce que le diagramme dessine déjà. C'est nommément « l'ancienne représentation des enchaînements » que la Description cite | Les comptes exacts d'appels d'outils et de fichiers ne se lisent plus qu'en survolant un cercle (son `<title>` les porte, accessible au clavier). Regretté par qui compare plusieurs lignes d'un coup d'œil en diagnostic — perte de confort de lecture, pas d'accessibilité |
| `fichiers` | **Liste des commits SUPPRIMÉE** | Les 4 derniers messages de commit : historique VCS rétrospectif, pas un état de cycle | Perte d'un `git log` minimal dans le navigateur — usage détourné de l'outil. La liste des fichiers touchés, elle, est bien un état : conservée |
| `evenements` | **SUPPRIMÉE comme panneau permanent** | Plus aucun flux brut affiché en continu. Activer un cercle du diagramme ouvre la tranche d'événements **de ce passage** dans le tiroir `#tiroir` existant | Plus de fil d'ambiance permanent. Le découpage par passage est fiable : c'est la même computation que la géométrie du diagramme (`disposer(passages, mesures)`), pas la corrélation événement→spec que PIEGES §16 dit non fiable (2 cas sur 14) |

### U2 — structure du mono-écran

`main#tableau` remplace `.mise-en-page` + `.nav-sections` + `.contenu`. **Aucun
`hidden` statique** : les cinq panneaux sont visibles au chargement.

```
grid-template-columns: minmax(0, 1fr) 340px;
grid-template-areas:
  "cycle   piloter"
  "cycle   depot"
  "specs   depot"
  "demande demande";
```

Ordre du DOM = ordre de lecture = ordre de tabulation = ordre en mobile. Sous
1024 px, empilement dans l'ordre DOM : cycle → piloter → specs → depot → demande.
Aucun défilement horizontal de **page** ; seuls le diagramme, le kanban et la bande
de sélection défilent dans leur propre cadre.

Bande de sélection des cycles en `role="tablist"` (accepté par l'humain) : le cycle
le plus récent s'affiche **sans aucun clic**, la sélection ne sert qu'aux cycles
antérieurs. Un seul `tabpanel`, jamais deux diagrammes à l'écran.

### U3 — trois signatures visuelles

**S1 — le pouls du dépôt.** Sous le SVG du diagramme, une couche `<canvas>` anime un
semis de points qui naissent au cercle de l'agent en cours, dérivent dans le sens du
déroulé et s'éteignent en ~4 s. **La densité d'émission EST le débit réel d'appels
d'outils** (un événement = une particule) : une rafale de 40 appels fait un essaim,
un agent qui réfléchit sans appeler d'outil laisse le champ vide. C'est le **rythme**,
que le diagramme n'encode pas — il n'a que le total. Couleur = `--a-<rôle>` de l'agent
émetteur, jeton existant. Cycle clos : le champ se fige sur l'empreinte accumulée,
propre à ce cycle. Cible : `OffscreenCanvas` transféré à un **Worker de même origine**
(mesuré autorisé par A2). Repli sans Worker : même simulation sur le fil principal en
`requestAnimationFrame`. Repli sans `getContext` : le canevas ne se pose pas, le SVG
reste seul — jamais d'écran blanc.

**S2 — le chronomètre vedette.** 56 px, graisse 300, `tabular-nums` — **extension
assumée** de l'échelle §4 qui plafonnait à 17 px ; jeton `--texte`, aucune couleur
neuve. Affiche la durée écoulée, mise à jour à la seconde. **Il s'arrête net** quand
le cycle se termine ou quand le flux SSE tombe, et passe en `--texte-faible` via
`data-fige="vrai"` : c'est l'exigence « ne pas figer un état périmé en le faisant
passer pour frais », portée par la typographie. Repli `reduced-motion` : mise à jour
à la minute, aucune information perdue.

**S3 — le puits et le bureau.** Le panneau Cycle en cours est creusé
(`box-shadow: inset 0 6px 14px var(--ombre)`, fond `--creux`) ; les quatre autres
restent **plats** (`--surface`, filet `--trait`, aucune ombre). La hiérarchie de
lecture devient matérielle, lisible même en vision floue. La pastille d'attente du
§5 reçoit une pulsation (0,6↔1, ~2,4 s) **tant que l'attente est en cours**, et cesse
de battre dès que l'agent suivant démarre.

**WebGL écarté explicitement**, malgré sa disponibilité mesurée : aucune donnée
tridimensionnelle, halo et dégradés radiaux disponibles nativement en Canvas 2D.
Choix délibéré, pas prudence par défaut.

**Effet retiré** : révélation au défilement (`IntersectionObserver`) — rien ne change
d'état à ce moment-là. Réutilisé en revanche comme **optimisation invisible** : mise
en pause de la simulation quand le panneau sort de la fenêtre.


---

## Parti pris retenu — « Le Couloir » (ux-ui-designer, 3ᵉ passage, 2026-09-19)

Rendu après le **retrait des deux verrous** par l'utilisateur : la règle « aucun effet
sans fonction » et l'obligation de reprendre le diagramme tel quel. Remplace le
catalogue du 2ᵉ passage. U1 (les 7 suppressions), U4 et U5 restent ceux des passages
précédents.

### Le diagramme : refait par défaut, conservé en repli

Deux modes, une bascule visible en permanence en tête du panneau 1
(`role="radiogroup"`, motif repris du sélecteur de thème) :

| mode | rendu | statut |
|---|---|---|
| **Profondeur** (défaut) | scène WebGL « Le Couloir » | neuf |
| **Plan** | le rendu SVG de `diagramme.js` | **intact au bit près** |

Le mode Plan est **aussi le repli automatique** si `getContext("webgl2"\|"webgl")`
échoue — et dans ce cas la bascule n'affiche que « Plan », le second bouton étant
**absent** plutôt que grisé : proposer un mode inatteignable est pire qu'un choix
réduit. Un seul des deux enfants est monté à la fois.

⚠️ **`ADR-0025` et `ADR-0026` ne sont donc PAS révoqués** : ils restent en vigueur et
gouvernent le mode Plan. `disposer(passages, mesures)` n'est **pas modifiée** et reste
l'unique autorité de géométrie ; le placement 3D consomme sa sortie.

### Ce qui ne change pas, vrai dans les deux modes

Diamètre = `11 + 0,80·√(durée_s)` plafonné à 56 px · graduations = appels d'outils
(seuils 22/32 px) · liseré = fichiers écrits, opacité `0,22 + min(f,8)/8 × 0,45` ·
croix + contour `--alerte` = échec · pointillé = sans-clôture · rebouclage sans pointe
en `--rebouclage` · agents simultanés empilés · pastille d'attente au-delà de 2 min ·
l'écart reste dicté par l'espace du libellé, jamais par le temps réel.

### Pertes nommées et bornées (mode Profondeur uniquement)

1. **La taille apparente cesse d'être une fonction pure de la durée** : elle devient
   durée × facteur de recul. **Borne : [0,72 ; 1]** — jamais plus de 28 % d'écart dû à
   la seule position dans la séquence. Compensation : la bascule Plan restitue une
   lecture 100 % fidèle à ADR-0026 à tout instant, sans recharger.
2. **Dénombrer les graduations d'un cercle éloigné devient plus difficile.**
   Compensations : le survol/focus porte le nombre exact ; le défilement en profondeur
   ramène n'importe quel passage au premier plan ; la bascule Plan.
3. **Contrainte posée par le designer, non négociable** : le flou de profondeur ne
   s'applique **jamais** au texte — heure, durée, nom restent plaqués face caméra et
   nets, sur une plaque `color-mix(in srgb, var(--creux) 85%, transparent)`. C'est ce
   qui permet d'affirmer que les seuils de contraste (`bug-016`, ADR-0024 §3-5) tiennent
   **sans nouvelle mesure** : le fond du texte est un jeton connu, pas la scène animée.

Rien d'autre n'est renoncé : rebouclage, zéro-appel, agents simultanés sont repris en
**billboards** (quads toujours face caméra), pas en maillages volumiques — précisément
pour que rien ne soit occulté et que le dénombrement reste proche de l'actuel.

### Bibliothèque : évaluée, jugée non nécessaire

Sprites billboardés (quads texturés par un dégradé radial généré dans un `<canvas>` 2D
hors-écran puis uploadé en texture), **un seul programme de shader**, blend additif pour
la lueur, système de particules par points. Aucun maillage éclairé, aucun moteur de
scène. **Aucune demande de dépendance** — `ADR-0006` tient sans exception.

### Catalogue des effets

| Effet | Repli `prefers-reduced-motion` |
|---|---|
| **Le Couloir** — sprites en profondeur, brouillard sur la géométrie jamais sur le texte, liaisons courbes | rendu figé à l'état stable, profondeur conservée, mouvement supprimé |
| **Lueur de l'agent en cours** — halo additif teinté de son identité, respiration 0,7↔1 sur ~2,2 s | halo statique à intensité maximale |
| **Traînée d'étincelles** — particules dérivant vers l'arrière du couloir, extinction ~3 s | aucune particule ; halo statique légèrement élargi |
| **Chronomètre vedette** — 56 px, `tabular-nums`, dégradé `--accent`→`--actif` en `background-clip:text` | mise à jour à la minute ; couleur pleine `--texte` |
| **Gel visible du chronomètre** — s'arrête net et passe en `--texte-faible` à la fin du cycle ou à la perte du flux | identique, sans transition d'entrée |
| **Parallaxe au curseur** — décalage amplifié avec la profondeur, jamais sur le texte | scène centrée fixe |
| **Ouverture en fondu-lumière** — la scène s'allume depuis le centre, ~800 ms | état stable directement |
| **Grain de surface** — bruit `feTurbulence` en `data:`, ~3 % d'opacité, sur les 4 panneaux plats | statique par nature |
| **Lueur de sélection** sur la pastille du cycle affiché | contour renforcé statique |
| **Bascule Profondeur / Plan** | sans rapport avec le mouvement |

La seule règle qui demeure est le **repli sans perte d'information** sous
`prefers-reduced-motion`, tenue effet par effet.

---

## Refondation du 2026-09-20 — la maquette de l'utilisateur remplace le design du cycle

L'utilisateur a fourni sa propre maquette complète (`docs/design-references/`) et demande
qu'elle soit adoptée **« pas juste une interprétation mais la maquette précise »**, en
**Material Design 3**.

### Ce qui devient caduc

Les deux maquettes produites par ce cycle — `control-center/maquettes/2026-09-19-mono-ecran.*`
et `2026-09-19-couloir.*` — sont **remplacées**. Le parti pris « Le Couloir », son champ de
particules WebGL et son chronomètre de 56 px ne sont plus la cible. **U1 (les 7 suppressions)
reste à réexaminer** au regard de la nouvelle structure, qui n'a pas les mêmes panneaux.

### La référence normative est du CODE, pas une image

`docs/design-references/control-center-animated-prototype.html` (1 259 lignes) fait foi :
jetons CSS, structure DOM, classes d'état et durées d'animation y sont exacts. La conformité
se **mesure** au lieu de se juger — ce que `feature-020` avait dû inventer pour le diagramme.
Les 12 PNG étaient des **illustrations** : non versionnés, retirés avant tout commit (18 Mo
qui n'entrent jamais dans l'historique), disponibles dans l'archive d'origine.

### Décisions humaines du 2026-09-20

**1. Les tokens seront CAPTURÉS — le backend entre dans le périmètre.**
Mesuré : **0 token sur 14 372 événements** de `control-center/var/agent-events.jsonl`.
Champs existants : `ts`, `runtime`, `hook_event_name`, `session_id`, `cwd`,
`transcript_path`, `prompt_id`, `permission_mode`, `agent_id`, `tool`, `agent_type`,
`command_head`, `file`, `failed`, `cle`. Le prototype met `token-value` au centre de chaque
disque et un total dans la bande du haut.

⚠️ **Cette décision REND LE GATE DE SÉCURITÉ OBLIGATOIRE.** Les tokens ne sont dérivables que
depuis `transcript_path`, c'est-à-dire en **lisant les transcripts de conversation** — qui
contiennent données personnelles, secrets collés et chemins privés. CLAUDE.md impose
`security-reviewer` (rôle GATE) dès qu'un nouveau chemin mène à ces données. Le GATE avait été
déclaré « sans objet » au cycle 1 ; **il redevient central, en P1 sur le design.**

⚠️ **La ligne « Hors périmètre : toute modification du backend » est CADUQUE.**

**2. Le thème sombre est SUPPRIMÉ — la maquette telle quelle, clair seulement.**
Le prototype est en `color-scheme: light`, sans `data-theme` ni palette sombre. Adopter la
maquette précisément supprime le thème sombre plutôt que d'inventer une palette M3 sombre qui
ne figure dans aucune référence fournie.

Ce que ça emporte, mesuré : `web/theme.js` (**75 lignes**) retiré ; `web/test_app_theme.js`
(**1 046 lignes**) et `web/test_app_theme_navigateur.py` (**515 lignes**) perdent leur objet ;
**5** règles `data-theme`/`prefers-color-scheme` dans `app.css` et **34** occurrences de thème
dans `app.js` à retirer. `ADR-0022` (deux familles de jetons, plancher perceptuel) est
**partiellement révoqué** ; l'acquis de `feature-015` sur le thème est perdu, celui de
`bug-016` sur le contraste doit être **remesuré** contre la palette M3 claire.

### Valeurs d'exemple

Les données du prototype (`68,4k tokens`, `Cycle #42`, `Checkout web`, les cartes `F-027`…)
sont du **remplissage** et ne sont pas des exigences. L'**anatomie** qu'elles habillent, elle,
en est une : centre = identité + tokens, anneau = état/progression, graduations radiales =
appels d'outils, points périphériques = fichiers, durée sous le disque.

### Contrat d'animation relevé dans le prototype

| ce qui bouge | durée |
|---|---|
| connexions actives `link-flow` (tirets 7 8) | **1,8 s** linéaire infini |
| reprise, corail, tirets 4 6, sens inverse | **1,7 s** |
| orbite d'activité `work-orbit` | **5,2 s** |
| marqueur orbital `dot-orbit`, `translateX(49px)` | **4,2 s** |
| graduations `tick-work`, décalage `var(--i) * 120ms` / `95ms` | **2,8 s** / **3,5 s** |
| transitions spatiales | **820 ms**, `cubic-bezier(.2, 1.28, .34, 1)` |
| transitions d'effet | `cubic-bezier(.2, 0, 0, 1)` |
| pas automatique entre étapes | **5 600 ms** |
| rafraîchissement des métriques | **1 500 ms** |

Règle de mouvement du document de décisions : le passage **non lancé → actif** est le moment
expressif principal (le disque grandit **une seule fois**) ; un passage **actif** ne respire
pas et ne change pas de taille ; seuls les agents réellement actifs animent.


---

## ⚠️ RECTIFICATION du 2026-09-20 — les tokens par sous-agent SONT disponibles

**Ce qui était écrit plus haut est faux.** Les entrées de journal du 2026-09-20 affirmant
que « les tokens par sous-agent sont IMPOSSIBLES » et que « 0 ligne `isSidechain` sur
13 680 lignes » le prouvait reposaient sur une **recherche incomplète** : l'agent principal
et l'`architect` avaient cherché dans les transcripts de **session**, jamais dans le
sous-répertoire `subagents/`.

### Ce qui existe réellement, mesuré le 2026-09-20

| grandeur | valeur |
|---|---|
| transcripts par sous-agent (`.../<session>/subagents/agent-<id>.jsonl`) | **225** pour ce projet |
| lignes portant un objet `usage` dans un échantillon de 212 lignes | **98** |
| clés disponibles par ligne | `agentId`, `isSidechain`, `sessionId`, `promptId`, `message.usage`, `timestamp`, `cwd` |
| champs d'usage | `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens` |
| passages `SubagentStop` distincts | **3 305** |
| passages portant un `agent_type` — **ceux que le diagramme dessine** | **223** |
| **couverture des passages dessinés par un transcript** | **223 / 223 = 100 %** |

L'appariement est direct et exact : l'`agent_id` du journal d'événements **est** le nom du
fichier `agent-<id>.jsonl`. Vérifié : 225 transcripts sur 225 trouvent leur `agent_id`.

Les 3 082 passages sans transcript sont ceux **sans `agent_type`** — défaut déjà connu et
figé par un test (`feature-001`, mémoire projet) — et ils ne sont pas dessinés.

### Ce que ça change

- **Le centre du disque et l'anneau de progression redeviennent implémentables.** La
  contradiction C20 de l'inventaire tombe.
- **`DESIGN-SYSTEM.md` §5 (« toute maquette qui affiche un nombre de jetons invente une
  donnée ») et §9 interdit n°7 deviennent FAUX** et doivent être amendés : un compte de
  jetons est désormais mesurable. Le laisser en l'état ferait refuser à un futur cycle une
  donnée qui existe.
- **Le GATE reste OBLIGATOIRE, pour un motif inchangé** : ces fichiers vivent sous
  `/root/.claude/`, **hors de la racine du projet**, et un transcript de sous-agent contient
  l'intégralité de sa conversation — donc potentiellement des secrets et des données
  personnelles. La lecture est plus ciblée qu'un balayage de 213 Mo, elle n'en est pas moins
  un franchissement de la frontière de confinement.

### Deux questions de conception que cette donnée ouvre

1. **Quel chiffre afficher ?** Un exemple mesuré donne `input 204`, `output 46 694`,
   `cache_creation 260 095`, `cache_read 8 223 195`. Le « 12,3k » de la maquette ne dit pas
   lequel. Un total incluant le cache est d'un ordre de grandeur supérieur à la sortie seule.
   À trancher explicitement, sinon le chiffre affiché sera arbitraire.
2. **L'anneau divise par un total final** (`progress = tokens / finalTokens × 315°`).
   Pour un passage **en cours**, ce total final n'existe pas encore. À trancher : borne
   fixe, progression relative au plus gros passage du cycle, ou anneau qui n'encode pas
   les tokens pendant l'exécution.

### Leçon de méthode

Une absence constatée par une recherche est une absence **dans le périmètre de la
recherche**, jamais dans le monde. Le coût ici a été limité — une question posée à la
documentation a suffi à rouvrir le dossier — mais la conclusion « impossible » était déjà
écrite dans le journal et allait fonder un abandon de fonctionnalité.


---

## Décisions humaines du 2026-09-20 sur le disque d'agent

### Le chiffre au centre : `input_tokens + output_tokens`

Décidé par l'utilisateur, **validé par la mesure** sur les 225 transcripts de sous-agent :

| grandeur | valeur |
|---|---|
| minimum | 1 070 |
| médiane | 27 660 |
| maximum | 219 359 |
| écart max/min | **205 ×** |
| quartiles | 15 805 · 27 660 · 44 203 |
| `cache_read` total rapporté à `input+output` | **241 ×** |

Deux raisons, dans l'ordre où elles pèsent :

1. **Le chiffre discrimine** : 205× d'écart entre passages, quartiles bien étalés. Un
   chiffre qui ne sépare pas les agents ne mérite pas le centre du disque.
2. **Inclure le cache le détruirait** : `cache_read` pèse 241 fois `input+output` sur
   l'ensemble. Un total incluant le cache mesurerait la **longueur de la conversation**,
   pas le travail de l'agent, et tous les disques se ressembleraient.

⚠️ **Réserve à écrire dans l'interface** : `input + output` **sous-compte** ce qui est
réellement envoyé au modèle — le cache est du vrai contexte. Ce chiffre mesure le
**travail produit**, pas le coût. La bottom sheet de détail doit dire ce qu'elle compte,
sous peine de retomber sur l'interdit du dépôt : un nombre affiché que personne ne sait
interpréter.

### L'anneau : activité, jamais progression

Le prototype calcule `progress = tokens / finalTokens × 315°`. **Ce total final n'existe
pas** pour un passage en cours. Décision de l'utilisateur : l'anneau **cesse de prétendre
mesurer une avancée** et devient un signal d'activité.

| état | anneau |
|---|---|
| non lancé | éteint, `--line`, 0° |
| **actif** | **animation indéterminée en boucle**, sans pourcentage |
| terminé | **complet et stable**, plus aucun mouvement |

**Écart assumé par rapport au document de l'utilisateur**, qui listait « progression de
l'anneau » parmi les signaux de travail en cours. La raison prime sur la lettre : le dépôt
n'affiche jamais une proportion qu'il ne sait pas mesurer. À tracer dans l'ADR du disque.

Conséquence favorable : cela **supprime la dépendance de l'anneau aux tokens**, donc le
diagramme reste lisible même si la lecture des transcripts est refusée par le GATE ou
indisponible. Le chiffre central dégrade alors sans casser l'anneau.

---

## Cycle 2 — décisions humaines du 2026-09-21 11:17

### 1. Contraste : la fidélité gagne, l'usage se restreint

**Le conflit, mesuré.** Matrice complète 10 jetons d'encre × 5 surfaces tonales du
prototype : **12 couples sur 50** tombent sous le seuil nominal **4,65**
(`ADR-0024 §5`), dont **7** sous le seuil dur 4,5 ; `--line-strong` tombe sous
**3,0** sur 3 surfaces sur 5. L'audit fourni par l'utilisateur en signalait **3** —
il mesurait un jeton contre **une seule** surface. `F1` (égalité stricte des hex) et
`F5` (seuil 4,65) ne peuvent donc pas être vrais en même temps.

**Décidé** : les hex restent **identiques au bit près** (`F1` strict). Une **table
des couples interdits** est dérivée de la matrice, et `F5` vérifie qu'aucun couple
interdit n'est **réellement peint**. C'est le régime Material 3 normal — turquoise,
corail et ambre sont des couleurs d'accent et de pictogramme, pas du texte courant
sur surface tonale haute.

**Conséquence** : `F5` devient **à deux temps** — phase A, la matrice, calculable
sans code ; phase B, les couples effectivement peints, mesurable par
`getComputedStyle` (le prototype n'utilise **aucun** `oklch`, donc `PIEGES §11` ne
mord pas).

⚠️ **Option refusée** : baisser le seuil. `ADR-0024 §5` reste en vigueur, aucun ADR
de 0030 à 0037 ne l'a révoqué, et la marge de 2,5 bits existe précisément parce
qu'un seuil au ras se franchit au premier ajustement.

### 2. Ampleur : un seul cycle, sept lots

**Décidé** : pas de scission en `feature-026`. Trois raisons, dans l'ordre où elles
pèsent :

- Les cinq gardes sont **globales**. `F3` (parité des classes) et `F5` (couples
  peints) n'ont de verdict que sur la feuille et le DOM **entiers** ; scindées,
  elles ne prouvent chacune que leur morceau et la conformité d'ensemble n'est
  jamais mesurée — on retomberait sur le « jugé à l'œil » que cette spec écarte.
- **Livrer `F8` sans `F11`, ce serait livrer les pertes sans leur compensation.**
  `ADR-0031 §3` gage la disparition des appels d'outils et de la granularité des
  fichiers sur leur présence dans la feuille de détail. C'est la logique d'`ADR-0017`
  appliquée à l'information plutôt qu'à la garde.
- Scinder multiplierait les allers-retours de `doing/` et exigerait une ligne de
  base verte entre chaque.

**Ce qui porte le risque, ce sont les lots, pas les specs.** Sept lots, chacun
commitable, vert et journalisé. **Deux points d'arrêt humains obligatoires** :
après le **lot 0** (validation de la partition du prototype) et à la sortie du
**lot 3** (la structure est le point de non-retour visuel).

**Ampleur assumée** : 30 à 36 invocations, ~4 000 lignes de production réécrites,
~7 000 lignes de tests, 21 livrables — trois à cinq fois le plus gros cycle mené
par ce dépôt.

### 3. Livrables neufs identifiés par le plan, à ajouter à la check-list

- **F0** — la **partition du prototype** : il est la maquette de **quatre** specs.
  Les trois `<dialog>`, le menu contextuel et `data-launchable` appartiennent à
  `feature-025` ; le panneau de conversation à `feature-022` ; les tokens à
  `feature-023` ; la barre de progression `70 %` **à aucune donnée** (interdit du
  dépôt). Sans F0, `F3` et `F4` n'ont pas de cible définissable.
- **F15** — le centre du disque **sans chiffre**, livré *dégradable* et non *à
  trous* : la lecture des transcripts est sortie vers `feature-023` avec son GATE.
- **F16** — les **quatre représentations absentes du prototype** et que `ADR-0031 §3`
  exige d'inventer : l'échec, le « sans clôture », l'agent principal, et la règle de
  non-chevauchement des libellés. C'est le mandat principal d'`ux-ui-designer`.
- **F17, F18, D3** — voir le plan d'exécution.

---
## Journal de bord — cycle 2

<!-- Distincte du « Journal de bord » du cycle 1 ci-dessus, qui reste intact.
     UNE ligne par étape du workflow, écrite QUAND L'ÉTAPE TOMBE. -->

- [2026-09-21 11:17] Étape 0 — orchestrator — plan d'exécution rendu : cycle unique
  à **sept lots** (0 gardes statiques, 1 retrait thème sombre, 2 système visuel M3,
  3 structure mono-écran — point d'arrêt humain, 4 graphe d'agents + animations, 5
  gardes runtime + kanban/bottom sheet/cas limites, 6 tests/mutation/docs), livrables
  neufs F0, F15-F18, D3, split F3/F4/F5 en volets a (lot 0) / b (lot 5) ; **5 constats
  mesurés par spec-reader qui confirment ou corrigent le plan** : (1) `F5` à deux
  temps confirmé nécessaire — matrice complète 10 jetons × 5 surfaces : **12/50**
  couples sous 4,65 (dont 7 sous le seuil dur 4,5), contre 3 signalés par l'audit
  fourni qui ne mesurait qu'une surface ; (2) `test_ci_partition_navigateur.py`
  continue de passer après suppression de `test_app_theme_navigateur.py` — mesuré
  dans un clone jetable (`.github/` inclus, sinon 0 cas — `PIEGES §1`) : **46 → 44**
  cas, 0 échec dans les deux cas, la liste est bien dérivée du marqueur
  `HARNAIS_NAVIGATEUR`, pas tenue à la main ; (3) la baisse de compte de cas au lot 1
  est exactement **-373** : `test_app_theme.js` **317** cas (node) et
  `test_app_theme_navigateur.py` **56** cas (chromium), mesurés dans le dépôt réel,
  pas dans le clone (`PIEGES §32`) ; (4) `/api/etat.colonnes` rend
  `[{repertoire, classe, libelle}]` **sans aucune modification backend**, vérifié en
  HTTP réel (`server.py:398-399`, clone jetable, port 8825) — `ADR-0003` tient tel
  quel ; (5) `security-reviewer` rôle GATE **confirmé sans objet en P1** pour ce
  cycle : aucune donnée nouvelle, aucune route nouvelle, aucun tiers — le backend
  n'est touché par aucun des sept lots. ⚠️ F17 (« registre `ATTENDU_ROUGE` ») reçu du
  plan sans définition retrouvée ailleurs dans le dépôt — interprété comme un
  registre de témoins délibérément rouges pour F1→F5, à confirmer avant le lot 0.
- [2026-09-21 11:17] Décisions humaines — cycle 2 — (1) **contraste** : les hex
  restent identiques au bit près (`F1` strict, non renégocié) ; `F5` devient à deux
  temps — la table des couples interdits est dérivée de la matrice, puis vérifiée
  **réellement peinte** ; option « baisser le seuil » refusée, `ADR-0024 §5` reste en
  vigueur. (2) **ampleur** : un seul cycle, **sept lots**, pas de scission en
  `feature-026` — les cinq gardes de conformité ne prouvent qu'entières, et livrer
  `F8` sans `F11` livrerait les pertes d'`ADR-0031 §3` sans leur compensation ; deux
  points d'arrêt humains obligatoires, après le lot 0 et à la sortie du lot 3.
- [2026-09-21 14:32] Lot 0 — frontend-developer — **six artefacts de vérification livrés,
  zéro ligne de production** (`git status` sur `index.html`/`app.css`/`app.js`/`diagramme.js`
  vide, vérifié par l'agent principal). F0 carte de périmètre : **64 id et 135 classes**
  partitionnés en adopté / différé-022 / différé-023 / différé-025 / écarté, dérivés du
  prototype, clause miroir dans les deux sens — 13 cas. F1 : **24 propriétés `:root`**
  (20 hex), **10 occurrences hex hors `:root`, 9 distinctes**, `#000` écarté par contexte
  de propriété (`mask`, pas une couleur peinte) → **8 promouvables, soit les 28 jetons**
  annoncés. F2 : 4 `@keyframes`, 6 `animation:`, 9 `transition:`, 2 `animation-delay:
  calc(…)`, indexés par (sélecteur, propriété) — noms normatifs. F3a : **71 classes
  adoptées** requises. F4a : **25 id adoptés** + l'écart déclaré `#porte-jeton` (porte
  d'authentification, absente du prototype, **déjà verte aujourd'hui** — aucune réécriture
  ne doit la perdre). F5a : **15 encres × 5 surfaces = 75 couples, 24 interdits**, recalculés
  et jamais récités. Les six vertes, rouge quarantiné sous `ATTENDU_ROUGE` avec lot de
  clôture nommé pour chacune. ⚠️ Deux réductions de périmètre **assumées et déclarées** :
  (a) le sens CSS→HTML de la parité interne F3a est **retiré** — appliqué au seul DOM
  statique il rend **96 faux positifs** (classes posées par `app.js` via `classList.add`),
  c'est du ressort de F3b au lot 5 ; (b) un défaut **préexistant hors périmètre** débusqué
  au passage — `class="bloc pilotage"` posée sans règle `.pilotage` déclarée — inscrit au
  registre, clôture lot 3 par disparition à la réécriture.
- [2026-09-21 14:58] Lot 0 — agent principal — **CAMPAGNE DE MUTATION : 6 tués / 7, un
  survivant, REBOUCLE**. Tués : prototype absent → 6/6 rouges ; prototype vidé → 6/6
  rouges (`ATTEIGNABILITE : … est VIDE`) ; `role="tab"` retiré d'`index.html` → la
  **clause 2** de F4a tire et nomme l'entrée (`l'assertion est VERTE mais l'entrée est
  encore dans ATTENDU_ROUGE`) ; id `a11y-announcement` retiré de la table F0 → `1 non
  classé(s) : a11y-announcement` ; `--muted` passé à `#111111` dans le prototype → la
  matrice F5a passe de **24 à 23** couples interdits, **donc dérivée et non récitée**.
  **Survivant — et il produit un faux vert, pas un faux rouge** : `declarationsRoot()`
  fait `regles.find(r => r.selecteur === ":root")`, soit **le premier bloc seulement**,
  quand `app.css` en porte déjà trois occurrences (l. 26, 223, 271). CSS fabriqué sur
  clone = les 24 jetons conformes **puis** `:root { --bg: #ff0000; }` → `ok
  F1_inclusion_stricte_des_24_jetons_root`, `2 cas, 0 echec(s)`, EXIT=0, **alors que le
  navigateur peint `#ff0000` là où le prototype exige `#f7f5fb`**. F1 certifie donc une
  identité au bit près que le rendu contredit ; la direction inverse compte aussi (jetons
  M3 écrits dans un second `:root`, CSS valide → « 23 manquants » à tort, et le réflexe
  serait de déplacer le code pour faire taire la garde). Reboucle : repli de **tous** les
  `:root` de premier niveau dans l'ordre de la cascade (valeur **effective**), assertion
  neuve sur le jeton déclaré deux fois avec des valeurs divergentes, cas de non-régression
  qui fige le défaut, et revue de la même hypothèse « un seul bloc » sur F2/F3a/F4a/F5a.
  ⚠️ **Limite à déclarer, pas un défaut** : tant que toute la table F2 est quarantinée
  (clôture lot 4), une mutation du prototype se propage bien à l'attendu mais **ne peut
  pas rendre F2 rouge** — sa sensibilité n'est démontrable qu'au lot 4.
- [2026-09-21 15:26] Lot 0 — agent principal — **reboucle VÉRIFIÉE, lot 0 CLOS**. Correctif :
  `declarationsRoot` replie **tous** les `:root` de premier niveau dans l'ordre du document,
  dernière déclaration gagnante — la valeur comparée devient la valeur **effective**, celle
  que le navigateur résout ; `reglesCss` porte une `profondeur` pour distinguer un `:root`
  nu d'un `:root` sous `@media`. Périmètre écrit en en-tête : `:root[data-theme=…]`,
  `:root:not(…)` et les `:root` conditionnels restent **hors repli**, avec leur raison.
  Assertion neuve `F1_aucun_jeton_du_prototype_redeclare_avec_valeur_divergente` : un jeton
  posé puis écrasé échoue **même si la valeur effective est bonne** — il dépend de l'ordre
  des blocs, déplacer une règle suffirait à changer le rendu. Le même trou existait dans
  **F4a** (`baliseParId` inspectait la **première** balise, donc un id dupliqué cachait un
  porteur non conforme derrière un conforme) — corrigé, et deux effets de bord dans
  `hexHorsRoot`, qui bornait « après la fin du premier bloc ». Contre-vérifié par l'agent
  principal sur clone neuf, 4 mutations : (R1) 24 jetons conformes + `:root{--bg:#ff0000}`
  → **double rouge**, `--bg : attendu #f7f5fb, obtenu #ff0000` ET `--bg déclaré 2 fois` ;
  (R2) retour au `.find()` → `F1_NONREGRESSION_second_root_ecrasant_est_vu : valeur effective
  lue #f7f5fb` ; (R3) id dupliqué dans `index.html` → `aucun_id_duplique_dans_index_html :
  bandeau-hote x2` ; (R4) `:root` sous `@media` → **non replié**, comme déclaré. **40 cas**
  contre 33 avant reboucle, six gardes vertes, production intacte.
- [2026-09-21 15:31] **POINT D'ARRÊT HUMAIN n°1 — carte de périmètre F0 VALIDÉE**. Partition
  soumise telle quelle et acceptée : **64 id** (25 adopté · 4 `feature-022` · 2 `023` · 32
  `025` · 1 écarté) et **135 classes** (71 adopté · 12 `022` · 1 `023` · 44 `025` · 7
  écartés). Quatre arbitrages explicitement portés à l'arbitrage humain plutôt que signés
  par l'agent : (a) **la moitié du prototype part en `feature-025`** — le cockpit livré sera
  visiblement moins peuplé que la maquette produite ; (b) `progress-track` **écarté**
  (`PIEGES §16`, pourcentage qu'aucune donnée ne mesure) — c'est un retrait, pas un report,
  conforme à la décision du 2026-09-20 « juste une animation quand le sous-agent travaille » ;
  (c) `icon-button` sert **5 éléments dont aucun n'est adopté**, rangée sous `025` **par
  convention** — bucket sans effet sur aucune garde, arbitraire assumé ; (d) barre supérieure
  amputée par `ADR-0020` (`project-switcher`, `notification-*`, `account-button`, `avatar`,
  `user-name`) et `cycle-title` écarté par `ADR-0023`. Le lot 1 peut partir.
- [2026-09-21 16:05] Lot 1 — frontend-developer — **thème sombre retiré, F13 livré, D3
  rectifié**. `test_app_theme.js`, `test_app_theme.py`, `test_app_theme_navigateur.py`
  supprimés (`git rm`) ; `theme.js` **modifié, PAS supprimé** (`git status` dit `M`) — gardé comme fichier (rôle réduit à l'amorçage
  `data-section` de feature-019, dual-rôle avec le thème découvert en lisant le fichier —
  sa suppression totale aurait cassé la persistance de section, hors périmètre de ce lot) ;
  `index.html` perd le `<script src="/theme.js">` remplacé par un commentaire à jour et le
  bloc `.bascule-theme` (3 boutons + 2 icônes) ; `app.js` perd 133 lignes (bascule 3
  positions, `matchMedia`, roving tabindex) ; `app.css` : les 3 blocs `:root` deviennent
  **1** (vérifié `grep -c '^:root' app.css` → 1), `--voile` devient un littéral direct
  (`--clair-voile`), `.bascule-theme`/`.theme-bouton` retirés. **Couplages réels trouvés en
  exécutant, pas en relisant** (3, tous corrigés, aucun neutralisé) : (1) `test_app_bug012.js`
  portait `testBasculeThemeClavierMotifComplet` (10 cas testant le roving tabindex du
  radiogroup de thème) — supprimée avec sa fonction, IDS list nettoyée des id de thème dans
  4 fichiers (`test_app_bug012.js`, `test_app_navigation.js`, `test_app_accordeon.js`,
  `test_app_feature008.js`) ; (2) `test_app_navigation.js` comptait 3 usages de
  `var(--surface-2)` dont un sur `.theme-bouton[aria-checked="true"]` — assertion réécrite à
  2 usages, l'assertion dédiée au bouton de thème retirée ; (3) `test_app_diagramme_navigateur.py`
  (harnais Chromium, HARNAIS_NAVIGATEUR) rendait le diagramme dans **les deux thèmes** et
  vérifiait explicitement que 5 couleurs **changent** entre `data-theme="clair"` et `="sombre"`
  — ces 5 assertions échouaient nécessairement une fois le thème retiré (couleurs identiques
  par construction) ; réécrit en un seul rendu, 37 → 17 cas, 0 échec. Commentaires obsolètes
  purgés dans `index.html`, `app.js`, `test_app_navigation.js`, `test_app_diagramme_navigateur.py`,
  `test_app_navigation_http.py` (références à des fichiers/UI supprimés).
  **Compte total (dépôt réel, hors clone)** : 1981 → **1575**, tous verts — **pas 1608**.
  Écart de **-33** entièrement expliqué : -373 (les deux fichiers supprimés) - 10
  (`test_app_bug012.js`, couplage 1) - 1 (`test_app_navigation.js`, couplage 2) - 20
  (`test_app_diagramme_navigateur.py`, couplage 3) - 2 (`test_ci_partition_navigateur.py`,
  effet de bord automatique de la suppression des 2 fichiers marqués — dérivé, non édité à
  la main). `test_ci_partition_navigateur.py` : **46 → 44** confirmé en clone jetable
  reconstruit depuis `git archive HEAD` (`.github/` inclus) + application du seul diff de ce
  lot, 0 échec des deux côtés — le compte mesuré dans le dépôt réel (52 → 50) diffère de 6
  côté clone à cause des 6 fichiers `test_conformite_*.py` du lot 0, non commités donc absents
  d'un `git archive HEAD` mais présents dans le dépôt réel et dans tout `cp -a` du répertoire
  de travail (PIEGES §32, variante). Les six gardes du lot 0 restent vertes (40 cas, 0 échec),
  aucun `ATTENDU_ROUGE` ne cite un compte périmé. **Deux mutations** : (a) `grep -rni
  "sombre\|data-theme" control-center/web/` → 27 lignes, aucune fonctionnelle (déclarations du
  retrait, adjectif générique « le plus sombre », littéraux WCAG `plus_clair`/`plus_sombre`,
  et la maquette de référence `2026-09-15-diagramme-reference.html` — hors périmètre, non
  touchée, qui porte encore légitimement ses 2 blocs de thème d'origine) ; (b) réintroduction
  de `:root[data-theme="sombre"] { --bg: #000; }` dans `app.css` — **AUCUNE des six gardes du
  lot 0 ne le voit** (0 échec dans les six, byte-identique en sortie hors le compte d'octets
  affiché). Investigation : `test_conformite_lib.js` exclut EXPRÈS `:root[data-theme="…"]` du
  repli de cascade (documenté §"Périmètre déclaré, pas oubli") — le mécanisme de
  redéclaration divergente ne s'applique qu'aux `:root` NUS inconditionnels, vérifié en
  mutant `:root { --surface: #000000; }` à la place, qui lui **est** vu (`F1_aucun_jeton_du_
  prototype_redeclare_avec_valeur_divergente` passe au rouge). ⚠️ **Trou confirmé, pas
  supposé** : le thème sombre peut revenir en silence sous sa syntaxe D'ORIGINE exacte
  (`:root[data-theme="sombre"] {...}`) sans qu'aucune garde actuelle ne le remarque — F1 est
  scopé lot 2 (les deux ECHEC actuels sont déjà en `ATTENDU_ROUGE`) et aucune garde
  n'implémente encore le critère d'acceptation « aucun hexadécimal hors du bloc :root »
  appliqué à `app.css` lui-même (seul le prototype en bénéficie aujourd'hui, comme donnée
  dérivée pour le lot 2). À fermer au lot 2 ou par une garde structurelle dédiée — signalé
  pour ne pas être un acquis silencieux.
- [2026-09-21 16:44] Lot 1 — agent principal — **compte CONTRE-VÉRIFIÉ, et le trou est PLUS
  LARGE que rapporté ; REBOUCLE**. Recompté indépendamment dans le dépôt réel : **1575 cas,
  0 fichier en échec**, `grep -nE '^\s*:root' app.css` → **une seule** occurrence (l. 26),
  et les 7 « sombre » d'`app.css` + les `data-theme` d'`index.html` et `theme.js` sont
  **tous en commentaire**, vérifié ligne à ligne. Décomposition du −406 refaite et exacte
  (373+10+1+20+2). Le lot 1 lui-même est bon. ⚠️ **Mais la conclusion du sous-agent sur la
  mutation (b) est trop favorable d'un cran.** Il conclut que la forme NON conditionnelle
  `:root { … }` « est vue ». Mesuré sur clone neuf, au **code de sortie du fichier** :

      app.css + :root[data-theme="sombre"]{--bg:#000000;…}  →  6 gardes EXIT=0
      app.css + :root { --bg: #000000; }                    →  6 gardes EXIT=0
                                                               F1 : « 7 cas, 0 echec(s) »

  Les deux assertions de F1 qui lisent `app.css` sont **intégralement quarantinées sous
  `ATTENDU_ROUGE` jusqu'au lot 2**, et les cas `F1_NONREGRESSION_*` sont construits **en
  mémoire**, donc verts quel que soit le contenu d'`app.css`. **Aucune réintroduction du
  thème sombre, sous AUCUNE syntaxe, ne fait échouer quoi que ce soit aujourd'hui.** Le lot 1
  livrerait donc « le thème sombre est retiré » avec **zéro garde sur `app.css`** — une
  protection annoncée comme acquise dont on sait déjà qu'elle ne s'applique pas
  (`CLAUDE.md`, exception du cycle ; esprit d'`ADR-0017`). **Refusé de reporter au lot 2** :
  le retrait est le livrable de CE lot, il se garde ici. Reboucle : garde dédiée
  `test_conformite_theme_unique.{js,py}`, **verte dès aujourd'hui** (non quarantinée,
  puisque le retrait est fait), échouant sur (1) tout sélecteur de la famille `:root` autre
  que l'unique `:root` nu déclarant des propriétés personnalisées, `@media` compris,
  (2) plus d'un `:root` nu de premier niveau, (3) `data-theme` réapparu **fonctionnellement**
  — la détection devant distinguer le commentaire du code **sans liste d'exceptions figée**,
  que le premier commentaire neuf rendrait fausse —, (4) tout `@media (prefers-color-scheme:
  dark)`. Preuve exigée : **4 mutations tuantes** (conditionnel, second bloc nu, `dataset.theme`
  en JS, `prefers-color-scheme`) **et 1 contre-mutation qui ne doit PAS tuer** (le mot
  `data-theme` dans un commentaire).
- [2026-09-21 17:02] Lot 1 — frontend-developer — **reboucle livrée** : garde
  `control-center/web/test_conformite_theme_unique.{js,py}`, **10 cas, VERTE sans
  `ATTENDU_ROUGE`** — il n'y a rien à quarantiner, le retrait est fait. Quatre critères :
  (1) aucun sélecteur conditionnel de la famille `:root` ne déclare de jeton, `@media`
  compris — le critère porte la **profondeur**, donc un `:root` nu écrit SOUS `@media`
  (la forme qu'avait le thème sombre avant retrait) tombe aussi ; (2) un seul bloc `:root`
  nu de premier niveau ; (3) `data-theme` absent du **code servi**, la frontière
  code/commentaire tenue **par analyse et non par liste d'exceptions** ; (4) aucun
  `@media (prefers-color-scheme: dark)`. La liste des 5 fichiers servis est dérivée du
  répertoire. Limite déclarée en en-tête : le retrait des commentaires JS suit les chaînes
  mais pas les littéraux d'expression régulière — le sens de l'erreur est **prudent**
  (faux rouge possible, jamais faux vert).
- [2026-09-21 17:09] Lot 1 — agent principal — **REBOUCLE VÉRIFIÉE, lot 1 CLOS**. Cinq
  mutations rejouées par l'agent principal sur clone neuf, sorties relevées :

      (a) :root[data-theme="sombre"]          EXIT=1  `:root[data-theme="sombre"]` (profondeur 0) déclare 1 jeton(s)
                                                   + data_theme_absent_du_code_servi : app.css
      (b) second :root nu                     EXIT=1  un_seul_bloc_root_nu : 2 bloc(s)
      (c) dataset.theme posé dans app.js      EXIT=1  data_theme_absent_du_code_servi : app.js
      (d) @media (prefers-color-scheme: dark) EXIT=1  `:root` (profondeur 1) + aucun_media_prefers_color_scheme
      (e) CONTRE-MUTATION, `data-theme` en commentaire CSS
                                              EXIT=0  « 4 occurrence(s) en COMMENTAIRE (légitimes), 0 dans le CODE »

  Le compte de commentaires passe de **3 à 4** sous (e) : la frontière est **dérivée**, pas
  récitée. **Suite recomptée : 30 fichiers, 1586 cas, 0 en échec.** Le `+1` sur 1585 est
  `test_ci_partition_navigateur.py` (50 → 51) : il dérive un cas par fichier de test
  découvert et vient d'en voir un de plus — **la même dérivation** qui l'avait fait tomber
  de 46 à 44 au retrait des deux fichiers. Compte expliqué, pas arrondi. Les six gardes du
  lot 0 restent vertes. Le thème sombre ne peut plus revenir en silence. **Étape 9 —
  doc-writer lancé sur le tour** (changement visible : le bascule de thème disparaît de
  l'interface).
- [2026-09-21 17:21] Étape 9 — doc-writer — **doc du lot 1 livrée et contre-vérifiée**.
  Trois fichiers : `CHANGELOG.md` (entrée utilisateur « Le thème sombre disparaît du centre
  de contrôle » — décrit ce qui quitte l'écran, pas la liste des fichiers) ;
  `docs/features/page-centre-de-controle.md` (−49/+11 : la section « Commande de thème »,
  44 lignes décrivant les 3 positions, la persistance `localStorage` et le suivi
  `matchMedia`, est retirée ; la phrase « les deux thèmes partagent les mêmes teintes »
  corrigée) ; `docs/adr/0033` (**note additive datée, corps de l'ADR intact**). **Aucun ADR
  neuf** — la décision était déjà actée. L'écart traité par la note : l'ADR annonçait
  `theme.js` « retiré en entier », le lot l'a **modifié** (75 → 57 lignes), `data-section`
  de `feature-019` n'ayant jamais dépendu du thème. Un ADR est immuable sur sa décision,
  pas sur le constat de ce qui a été livré. `./tools/check_doc_links.sh` → **186 lien(s)
  relatif(s), toutes les cibles existent**, relancé par l'agent principal. ⚠️ **Constat
  hors périmètre, à ne pas perdre** : `docs/subsystems/` ne contient qu'un `.gitkeep`,
  alors que `CLAUDE.md` déclare « une fiche par module backend (auth, facturation…) ».
  Dette documentaire réelle, sans rapport avec `feature-021` — à traiter dans une spec
  propre, pas ici.
- [2026-09-21 17:21] **LOT 1 CLOS** — livrables F13 et D3. Suite 1981 → **1586 cas,
  0 échec**. Reste : lots 2 à 6.
- [2026-09-21 17:38] **COMMIT** — agent principal — branche `cycle/feature-021-cockpit-m3`
  créée depuis `main` (`53a21de`), deux commits : `cdde4e6` les six gardes du lot 0 **sans
  une ligne de production** (les trois suppressions du lot 1, déjà indexées par le
  sous-agent, ont dû être **désindexées** pour que la séparation soit réelle et pas
  seulement racontée) et `93ae6b6` le lot 1 complet avec sa doc. Arbre propre, suite
  relancée **depuis l'état commité** : 30 fichiers, 1586 cas, 0 échec. `check_specs.sh` 48
  specs sans doublon, `check_doc_links.sh` 186 liens résolus. **Rien poussé.** Branché
  plutôt que commité sur `main` parce que le lot 3 est le point de non-retour annoncé.
- [2026-09-21 17:44] **DÉCISION DE SÉQUENCEMENT — agent principal** (angle mort du plan).
  Le plan de l'architecte dit « Lot 2 `app.css` (F6) » puis « Lot 3 `index.html` réécrit »,
  et ne dit **rien du sort des 72 propriétés héritées** de l'unique `:root` — mesurées :
  **34** `--clair-*` à valeur brute, **35** sémantiques qui les aliasent, **3** valeurs
  directes. Or les deux entrées `ATTENDU_ROUGE` de F1 portent « clôture lot 2 », donc la
  question ne peut pas être reportée sans faire glisser un registre. Tranché, faute de
  verdict d'architecte, et consigné ici pour être contestable : (1) les **24 jetons du
  prototype entrent au bit près**, `F1_INCLUSION_ROOT_M3` est **retirée** du registre et
  non laissée à verdir — la clause (2) l'exige ; (2) les **8 hex promus reçoivent un nom
  dérivé de leur usage réel** dans le prototype, pas de leur valeur ; (3) la couche
  `--clair-*` brute **disparaît**, les 35 sémantiques pointant directement sur les jetons
  M3 — mécanique, aucune règle existante ne casse, et la suppression au lot 3 devient
  triviale ; (4) les **24 jetons d'identité couleur des agents** (`--a-*`/`--f-*`)
  survivent en **couche transitoire déclarée, clôture lot 4** : `ADR-0032` acte leur
  disparition mais le diagramme qui les consomme n'est refait qu'au lot 4, et les retirer
  ici casserait le diagramme avant son remplaçant ; (5) `F1_JETONS_PROMUS_HORS_ROOT` **se
  scinde** — le volet « 8 hex promus » se ferme réellement, le volet « propriétés
  transitoires » devient une entrée **neuve et distincte** avec son propre lot. ⚠️ Règle
  posée au passage : **repousser le lot de clôture d'une entrée existante pour la faire
  tenir est interdit** ; un changement de lot est une décision écrite avec sa raison,
  jamais un glissement. Deux choses différentes ne partagent pas une entrée — c'est ainsi
  qu'un registre pourrit.
- [2026-09-21 18:26] Lot 2 — frontend-developer — **F6 livré**. Les **24 jetons du prototype
  entrent au bit près** dans l'unique `:root` (contre-vérifié par l'agent principal avec un
  extracteur indépendant : 0 manquant, 0 divergent). **8 hex promus, nommés d'après leur
  usage réel et non leur valeur** : `--agent-state-pending` (#aaa6b0, `--state-color` par
  défaut de `.agent-node` et état *pending*), `--agent-state-done` (#777385),
  `--question-ink` (#4e1d12, encre de `.question` sur `--coral-soft`), `--column-todo-dot`
  (#eea52a), `--column-done-dot` (#3b8f35), `--chip-todo-bg` (#fff0c8), `--chip-todo-ink`
  (#654b00), `--chip-high-ink` (#690005, sur `--danger-soft`). La couche `--clair-*`
  (34 propriétés brutes) **disparaît entièrement** — vérifié, 0 restante ; `:root` passe de
  **72 à 69** propriétés. Relevés du prototype, tous **lus et non estimés**, recoupés
  indépendamment par l'agent principal : focus **3 px solid `--primary`** offset 3 px,
  cibles **48 px** (11 occurrences dans la maquette), typographie à **graisse unique 500**
  (22 occurrences) avec 12 px dominant (19), deux élévations, `line-height` 1.35 (était
  1.45). **Registre, entrée par entrée** : `F1_INCLUSION_ROOT_M3` **RETIRÉE** (fermeture
  réelle, pas verte-mais-présente) ; `F1_JETONS_PROMUS_HORS_ROOT` **RETIRÉE** et scindée ;
  `JETONS_AJOUTES` 0 → 11 ; deux entrées **neuves** `F1_TRANSITOIRE_SEMANTIQUE_CLAIR`
  (clôture **lot 3**, 15 propriétés) et `F1_TRANSITOIRE_IDENTITE_AGENT` (clôture **lot 4**,
  19 propriétés). Aucun lot de clôture existant n'a été repoussé. **Suite : 1586 → 1591,
  0 échec**, la hausse entièrement dans `test_conformite_jetons.js` (7 → 12 cas).
- [2026-09-21 18:41] Lot 2 — agent principal — **VÉRIFIÉ, lot 2 CLOS**. Trois mutations sur
  clone neuf, toutes tuent : (M1) `--teal` altéré d'un bit → `attendu #087e6d, obtenu
  #087e6e` ; (M2) `--column-done-dot` retiré du `:root` → `F1_JETONS_AJOUTES_presents_et_
  conformes : absent d'app.css` ; (M3) trois propriétés transitoires retirées **sans** mise
  à jour du registre → `F1_TRANSITOIRE_IDENTITE_AGENT_liste_sans_entree_perimee :
  --a-debugger, --f-debugger, --rebouclage` — **la clause miroir tient dans les deux sens**,
  c'est elle qui empêchera les listes transitoires de pourrir d'ici les lots 3 et 4.
  ⚠️ **CORRECTION D'UN CHIFFRE QUE J'AVAIS DONNÉ FAUX** : mon brief annonçait « 24 jetons
  d'identité couleur des agents ». Mesure : **19** (9 paires `--a-*`/`--f-*` = 18, plus
  `--rebouclage`). Le sous-agent a signalé l'écart au lieu d'adopter mon chiffre — c'est la
  bonne conduite, et la clôture du lot 4 porte sur 19, pas 24.
  ⚠️ **Deux réserves à ne pas perdre, aucune bloquante** : (a) `.nav-onglet` **reste à
  44 px** au lieu de 48 — `test_app_navigation.js` fige `44px` **littéralement**
  (`E9_nav_onglet_cible_44px_hors_media`, sans comparaison `≥`), et le composant disparaît
  au lot 3 avec son test. Consigné ICI et pas seulement dans un commentaire CSS, **parce
  qu'un commentaire n'est pas une garde** — c'est la thèse même de ce cycle. **F6 est donc
  livré avec une cible sur trois encore à 44 px** ; clôture lot 3. (b) `--trait-fin`,
  `--ombre` et `--voile` passent en `color-mix()`, dont **aucune garde arithmétique ne sait
  calculer la couleur peinte** ; le trou se referme **par construction au lot 5**, F5b
  mesurant `getComputedStyle`, qui résout `color-mix()`. Trouvaille utile du sous-agent au
  passage : l'invariant « `--trait-fin` STRICTEMENT moins contrasté que `--trait` » n'existe
  que dans un commentaire d'`app.css` (l. 587) — jamais dans `PIEGES`, la spec ou le plan —
  et une consolidation qui semblait inoffensive à la lecture cassait `test_app_diagramme_
  navigateur.py` à l'exécution.
- [2026-09-21 18:52] Étape 9 — doc-writer — **doc du lot 2, contre-vérifiée**. Deux
  fichiers seulement, et les abstentions sont justifiées : `CHANGELOG.md` (entrée
  utilisateur — palette, élévations, typographie changent sur toute l'interface, la
  disposition ne bouge pas encore) et `docs/adr/0032` (**note additive datée, corps
  intact**). `ADR-0030` relu et **laissé tel quel** : il ne prétend nulle part
  qu'`app.css` est déjà réécrit. `docs/features/page-centre-de-controle.md` **non
  touchée**, à raison — `diagramme.js` et `app.js` étant intacts, aucune couleur qu'elle
  décrit n'est devenue fausse. `check_doc_links.sh` → **187 liens, tous résolus**.
  ✔️ **Le piège que je guettais n'a pas été commis** : le `CHANGELOG` écrit « les cibles
  tactiles (**boutons d'action, pilotage secondaire**) passent de 44 px à 48 px » — il
  NOMME les composants concernés au lieu d'annoncer un passage général, donc il
  n'affirme pas que `.nav-onglet` a suivi, ce qui serait faux. Et il dit explicitement
  que l'identité de couleur par agent **n'est pas encore retirée**. La note d'`ADR-0032`
  porte le compte exact (**19**), le lot de clôture (**4**) et le nom de la garde qui la
  tient — une note qui se vérifie, pas une intention.
- [2026-09-21 18:52] **LOT 2 CLOS** — livrable F6 (avec la réserve `.nav-onglet` 44 px,
  clôture lot 3). Suite **1591 cas, 0 échec**. Trois lots sur sept. Reste : 3, 4, 5, 6.
  Commité en `d14dee2`.
- [2026-09-21 19:14] **ABSORPTION de `bug-017`** — agent principal — `git mv` de
  `specs/features/todo/` vers `doing/` (**déplacement, jamais copie** — `check_specs.sh`
  revérifié : 48 specs, aucun doublon). Statut passé à `doing`, et une section
  « Absorption dans le cycle » écrite dans la spec du bug. Motif `ADR-0017` : le lot 3
  réécrit `index.html` en entier, **la porte change donc de place dans le document de
  toute façon** ; traiter le défaut ailleurs reviendrait à corriger une structure qui
  n'existera plus à la fin du cycle, puis à refaire le correctif sur la structure neuve.
  Conséquence de forme assumée : le cycle porte **deux specs dans `doing/`** avec une
  **seule** phase de test, de revue et de documentation, et le journal de référence est
  celui-ci. Répartition : **correctif structurel au lot 3** (porte enfant direct de
  `<body>`, `inert` sur ses frères) ; **comptage des contrôles atteignables — le critère
  chiffré — en F4b au lot 5**. Relevé de l'auditeur du 2026-09-15, repris tel quel :
  porte ouverte, **2** contrôles atteignables hors modale en section par défaut, **jusqu'à
  6** en section « Développer », dont le bouton de lancement.
- [2026-09-21 19:16] Lot 3 — **LANCÉ** — frontend-developer. État du registre à l'entrée,
  relevé entrée par entrée : **4 à fermer** (`F4A_ROLE_TAB_RESIDUEL` → 0 `role="tab"`, il
  y en a 6 ; `F4A_IDS_ARIA_MANQUANTS` → les 25 id adoptés ; `F3A_CLASSE_POSEE_SANS_
  DECLARATION_PREEXISTANTE` → `.pilotage` ; `F1_TRANSITOIRE_SEMANTIQUE_CLAIR` → les 15
  jetons sémantiques) et **3 à NE PAS toucher**, qui sont du lot 4
  (`F3A_CLASSES_ADOPTEES_ABSENTES`, car les 71 classes adoptées incluent celles du graphe ;
  `F1_TRANSITOIRE_IDENTITE_AGENT` ; `F2_TABLE_DES_DUREES`). Trois contraintes portées au
  brief : (1) **`#porte-jeton` doit survivre** — écart déclaré de F4a, déjà vert, une
  réécriture qui le perd casse la porte ; (2) retirer les 15 jetons sémantiques veut dire
  **re-pointer** chaque `var(--fond)`/`var(--texte)`/`var(--trait-fin)` sur son jeton M3,
  la règle survivant à l'indirection — avec l'invariant « `--trait-fin` STRICTEMENT moins
  contrasté que `--trait` », qui n'existe **que** dans un commentaire d'`app.css` l. 587 et
  sur lequel le lot 2 s'est déjà fait piéger ; (3) la réserve `.nav-onglet` **se ferme
  ici**, aucune cible sous 48 px dans ce qui est écrit. Mutation exigée : réintroduire un
  `role="tab"`, retirer un id adopté, **et retirer l'`inert` des frères de la porte** — si
  cette troisième n'est vue par rien, le correctif de `bug-017` serait livré sans garde,
  ce qui a déjà été refusé au lot 1 pour le thème sombre.
- [2026-09-21 20:02] Lot 3 — frontend-developer — **F7 + `bug-017` livrés**. `index.html`
  réécrit (215 → 279 lignes), **0** `role="tab"` (6 avant), **25 id adoptés** conformes,
  `#porte-jeton` conservé et passé **enfant direct de `<body>`**, aucune cible sous 48 px
  (`.tab-button`/`.small-button` corrigés 36 → 48). Registre : **4 entrées retirées**
  (`F4A_ROLE_TAB_RESIDUEL`, `F4A_IDS_ARIA_MANQUANTS`, `F3A_CLASSE_POSEE_SANS_DECLARATION_
  PREEXISTANTE`, `F1_TRANSITOIRE_SEMANTIQUE_CLAIR`), **3 intactes** (lot 4). Fichiers neufs
  `test_app_bug017.{js,py}`. **Suite 1591 → 1538, 0 échec, 31 fichiers**, chaque écart
  expliqué : −55 `test_app_navigation.js` (tout le comportement des onglets — roving
  tabindex, flèches, persistance — disparaît avec eux), −12 `test_app_navigation_http.py`,
  +13 la garde neuve de `bug-017`, +1 dérivé sur la partition navigateur. Invariant
  `--trait-fin` < `--trait` préservé par substitution mécanique.
- [2026-09-21 20:28] Lot 3 — agent principal — **REBOUCLE : deux gardes creuses, même
  maladie deux fois** — *une propriété affirmée dans un commentaire, et une garde qui
  vérifie le mécanisme au lieu du résultat*. Le travail de fond est bon et vérifié (suite,
  comptes, 3 entrées du lot 4 intactes, et la neutralisation de
  `fixerInerteAutourDeLaPorte` tue bien 3 cas en nommant les quatre frères).
  **(1) Une quarantaine fermée par DÉMÉNAGEMENT.** `F1_TRANSITOIRE_SEMANTIQUE_CLAIR` a été
  retirée, mais **6 des 15 jetons vivent encore**, l. 661-666 d'`app.css`, redéclarés sur
  `.dg-piste` : `--trait`, `--trait-fin`, `--contour-etat`, `--texte-faible`, `--alerte`,
  `--creux`. **Déclarés nulle part** dans le registre (0 mention). Le rapport l'écrit
  lui-même : « `declarationsRoot()` ne scanne que `:root`, donc F1 reste clos ». La cécité
  est **générale**, mesurée : `.bloc { --texte: #ff0000; --accent: #00ff00; }` ajouté à
  `app.css` → **F1 : 12 cas, 0 echec(s), EXIT=0**, et les six autres gardes vertes aussi.
  Le dépôt porte désormais le précédent « sortir un jeton de `:root` pour échapper à F1 ».
  La **stratégie CSS est légitime** (le diagramme hérité consomme ces jetons en ligne,
  `app.js` l. 799-954, ils doivent vivre jusqu'au lot 4) — c'est le **bilan** qui est faux :
  scission exigée, 9 clos / 6 déclarés à leur sélecteur avec clôture lot 4, et la
  vérification portée sur **toute la feuille** au lieu du seul `:root`.
  **(2) Une garde qui épouse l'implémentation.** `index.html` l. 27 déclare en commentaire
  que `#porte-jeton` doit rester **enfant direct de `<body>`**. Porte enveloppée dans un
  `<div>` → **`test_app_bug017` reste à 13 cas, 0 échec**. Or `fixerInerteAutourDeLaPorte`
  parcourt les **frères** : enveloppée, la porte n'en a plus hors de l'enveloppe, **plus
  rien ne reçoit `inert`**, et toute la page redevient atteignable — le défaut d'origine de
  `bug-017`, revenu, suite verte. Les trois cas passent parce qu'ils vérifient « les frères
  sont inertes », ce qui **mesure le mécanisme et non ce que le bug demande**. Exigé :
  assertion sur `parentElement === body`, et un cas qui **compte les contrôles atteignables
  hors porte** (relevé d'origine : 2, jusqu'à 6) plutôt que de constater la pose d'un
  attribut.
- [2026-09-21 20:51] Lot 3 — **REBOUCLE VÉRIFIÉE, lot 3 CLOS**. Les deux gardes creuses
  sont fermées, et j'ai rejoué moi-même sur clone neuf les deux mutations que j'avais
  trouvées, plus la clause miroir :

      (a) .bloc { --texte:#ff0000; --accent:#00ff00 }
          ECHEC  F1_aucun_jeton_semantique_hors_du_scope_declare :
                 --texte @ `.bloc` | --accent @ `.bloc`                       EXIT=1
      (c) --creux retiré de .dg-piste, registre intact
          ECHEC  F1_TRANSITOIRE_DIAGRAMME_SCOPE_liste_sans_entree_perimee :
                 --creux@.dg-piste                                            EXIT=1
      (d) porte enveloppée (+ un <button> planté dans l'enveloppe)
          ECHEC  A0_porte_est_enfant_direct_de_body : profondeur mesurée 1
          ECHEC  A0_zero_controle_atteignable_hors_porte_quand_ouverte :
                 enveloppe-mutant (3)                                         EXIT=1

  (d) est prise **deux fois indépendamment**, et le bouton planté est bien compté comme
  contrôle atteignable — la garde mesure désormais **ce que `bug-017` demande**, plus la
  pose d'un attribut. Entrée neuve `F1_TRANSITOIRE_DIAGRAMME_SCOPE` (clôture **lot 4**)
  déclarant les 6 survivants **avec leur sélecteur**, et la vérification porte maintenant
  sur **toute la feuille**, toutes profondeurs, `@media` compris.
  **Suite : 1538 → 1543, 0 échec, 31 fichiers.** **Registre final : 4 entrées, TOUTES au
  lot 4** (`F1_TRANSITOIRE_DIAGRAMME_SCOPE`, `F1_TRANSITOIRE_IDENTITE_AGENT`,
  `F2_TABLE_DES_DUREES`, `F3A_CLASSES_ADOPTEES_ABSENTES`) ; les registres de `perimetre`,
  `contrastes`, `theme_unique` **et désormais `a11y`** sont vides.
  ⚠️ **Leçon de forme à retenir pour les lots 4 à 6** : les deux défauts de ce lot étaient
  la **même** maladie — *une propriété affirmée dans un commentaire, et une garde qui
  vérifie le mécanisme au lieu du résultat*. `index.html` l. 27 déclarait la parenté de la
  porte en commentaire ; `app.css` l. 587 déclarait l'invariant `--trait-fin` en
  commentaire, et le lot 2 s'était déjà fait piéger dessus. **Un invariant qui n'existe
  qu'en commentaire sera violé, et la suite restera verte.**
- [2026-09-21 20:54] **POINT D'ARRÊT HUMAIN n°2 — structure mono-écran** — capture du
  rendu réelle (Chromium headless, 1440×1000, fichiers statiques servis sans l'API, donc
  état vide et bandeau « Serveur injoignable » attendu) **envoyée à l'humain pour
  validation**. En attente.
- [2026-09-21 21:03] Étape 9 — doc-writer — **doc du lot 3, contre-vérifiée**. Deux
  fichiers : `CHANGELOG.md` (deux entrées **distinctes** — l'écran unique d'une part, la
  correction d'accessibilité `bug-017` d'autre part, qualifiée comme telle) et
  `docs/features/page-centre-de-controle.md` (section « Structure de la page » réécrite :
  ce qui disparaît — colonne de navigation, motif `tablist`, repli 600 px, persistance de
  section — et ce qui reste, avec le câblage dynamique **explicitement renvoyé aux lots
  4-6 non couverts**). Notes d'implémentation ajoutées à `bug-017`, **sans cocher aucun
  critère** : ceux qui portent sur le **comptage** dépendent de F4b au lot 5, et
  l'abstention est la bonne conduite. **Aucun ADR créé, aucune note additive** :
  `ADR-0029` relu, le lot 3 n'en est qu'une **étape d'exécution planifiée** (`index.html`),
  pas un état achevé ni divergent ; `ADR-0038` est prévu au **lot 6** par le plan, le créer
  ici serait prématuré. `check_doc_links.sh` → **192 liens, tous résolus**.
  ✔️ **Affirmation vérifiée plutôt que crue** : la fiche déclare `ADR-0024 §1`/§2 révoqués
  par `ADR-0029`, §3 restant en vigueur. Contrôlé dans l'ADR — son §2 s'intitule
  littéralement « **Sort d'ADR-0024 : amendé, pas révoqué en bloc** ». La doc ne s'invente
  donc pas une révocation ; elle reprend celle que l'ADR porte, avec la même nuance.
- [2026-09-21 21:19] **POINT D'ARRÊT HUMAIN n°2 — STRUCTURE VALIDÉE**. Capture Chromium
  du rendu réel soumise à l'humain (1440×1000, statiques servis sans l'API, donc état vide
  et bandeau « Serveur injoignable » — attendu et signalé comme tel), avec trois questions
  explicites : densité, hiérarchie (titre sous le segment), et repos de la feuille de
  détail. **Feu vert donné.** Le point de non-retour visuel est franchi ; le lot 4 peut
  poser le graphe par-dessus. ⚠️ Lot 3 **non commité** à ce stade — dernier commit `d14dee2`
  (lot 2).
- [2026-09-21 21:22] Lot 4 — **LANCÉ** — frontend-developer, livrables F8, F9, F14, F15,
  F16. **Les 4 entrées de registre encore ouvertes doivent TOUTES être vidées par ce lot**
  (`F2_TABLE_DES_DUREES`, `F3A_CLASSES_ADOPTEES_ABSENTES`, `F1_TRANSITOIRE_IDENTITE_AGENT`
  19 jetons, `F1_TRANSITOIRE_DIAGRAMME_SCOPE` 6 jetons) — **il n'y a pas de lot 5 pour
  elles**, aucune ne peut être repoussée. Les 25 jetons transitoires meurent pour de bon,
  y compris les **12 chaînes `var(--…)` peintes en ligne** dans `app.js` qui avaient piégé
  le lot 3. Cibles de F2 relevées par l'agent principal dans le prototype et portées au
  brief : **4** `@keyframes` (`work-orbit`, `dot-orbit`, `tick-work`, `link-flow`), **6**
  `animation:`, **9** `transition:`, **2** `animation-delay: calc(…)` (120 ms / 95 ms),
  **1** bloc `prefers-reduced-motion` ; `KEYFRAMES_AJOUTES` **reste vide**, les quatre
  inventions de F16 étant statiques. Noms de F16 imposés depuis `CLASSES_AJOUTEES` déjà
  déclarées au lot 0 : `state-sans-cloture`, `has-echec`, `role-principal`, `agent-flag`,
  `agent-flag--echec`, `agent-flag--sans-cloture`, `role-ring`. Rappels portés au brief :
  `disposer()` **unique autorité de géométrie** (`ADR-0031 §4`) ; `state-sans-cloture`
  existe parce que **`SessionEnd` ne se déclenche jamais** (`PIEGES §17`) — un passage sans
  fin observée **n'est pas un échec** ; la lecture des tokens au centre du disque est
  **sortie vers `feature-023`**, F15 se livre **dégradable et jamais à trous**.
  **Les deux leçons du lot 3 transmises explicitement** : (1) un invariant qui n'existe
  qu'en commentaire sera violé, suite verte — déjà deux fois (`index.html` l. 27,
  `app.css` l. 587) ; (2) une garde qui vérifie le **mécanisme** ne prouve rien, il faut
  assertionner le **résultat observable**. Quatre mutations exigées, dont le retrait du
  bloc `prefers-reduced-motion` — F14 sans garde serait un livrable déclaratif.
- [2026-09-21 21:34] **COMMIT du lot 3** — agent principal — `63324ac`, 17 fichiers,
  +1820/−1595, y compris le `git mv` de `bug-017` vers `doing/` détecté comme renommage.
  Arbre propre après commit. ⚠️ **Manœuvre risquée, à ne pas refaire à l'aveugle** :
  commiter pendant qu'un lot tourne expose à capturer un état **partiel** du lot en cours.
  Ici c'était sûr, et **vérifié avant** plutôt que supposé — `find control-center/web specs
  -newermt "2026-09-21 21:22"` ne remontait **aucun** fichier, le lot 4 étant encore en
  lecture, et `git status` correspondait exactement à l'état lot 3 déjà contrôlé
  (1543 cas). Contrôlé **après** aussi : la liste des 17 fichiers du commit ne contient rien
  du lot 4, et l'arbre est resté vide. **Règle pour la suite : ne commiter pendant un lot
  actif qu'après avoir mesuré qu'il n'a rien écrit, jamais sur la seule impression qu'il
  « est encore en train de lire ».**
- [2026-09-21 22:41] Lot 4 — frontend-developer — **F8, F9, F14, F15, F16 livrés**.
  `diagramme.js` réécrit (nouveau `disposer()`, contrat
  `{largeur, hauteur, axeY, agents[], connecteurs[]}`), `app.js` réécrit (peinture du
  disque, **identité de couleur retirée partout** et pas seulement dans le graphe —
  `ADR-0032`), `app.css` réécrit, `index.html` complété. **Les 4 registres VIDES**, vérifié
  par l'agent principal : `ATTENDU_ROUGE = {}` dans `jetons`, `animations`, `classes` ; les
  **25 jetons transitoires** (19 identité + 6 scopés `.dg-piste`) ont disparu de **toute la
  feuille**, mutation refaite pour s'en assurer — **disparus, pas déplacés**. F2 bit-identique
  au prototype (4 `@keyframes`, 6 `animation:`, 9 `transition:`, 2 `animation-delay:`), la
  clé de jointure étant le nom littéral du sélecteur — l'indentation multi-ligne de
  `.agent-node` a causé un premier échec, corrigé. F15 : `.agent-code` seul au centre,
  `place-content: center` recentre **sans réserver d'espace** — dégradable sans être à
  trous, et `.token-value` n'est **jamais** posé, la branche « avec chiffre » n'étant pas
  écrite (sortie vers `feature-023`). F16 : `has-echec` recolore `--state-color` en
  `--danger` + glyphe « ! » ; `state-sans-cloture` contour pointillé + glyphe « ⋯ » ;
  `role-principal` + `.role-ring` ; non-chevauchement porté par `disposer()`. Mutations
  rejouées par l'agent principal, toutes tuent : bloc `prefers-reduced-motion` retiré →
  `F14_bloc_prefers_reduced_motion_present` meurt ; `has-echec` neutralisé → un cas de
  `test_app_accordeon.py` meurt. **Les gardes écrites sont bonnes.**
- [2026-09-21 22:58] Lot 4 — agent principal — **REBOUCLE : problème d'ÉTENDUE, pas de
  qualité**. Suite 1543 → 1257, mais le chiffre qui compte est ailleurs :

      couverture propre du diagramme
        AVANT  test_app_diagramme 165 + _conformite 51 + _navigateur 17 = 233
        APRÈS  test_app_diagramme  40                                   =  40   (−83 %)

  **Sur le livrable le plus complexe du cycle, dans le lot même qui le livre.** Et il ne
  reste **qu'un seul** harnais navigateur dans tout le dépôt (`test_app_navigation_http.py`,
  qui couvre la navigation) : **plus rien ne mesure ce que le diagramme peint**. Or c'est
  précisément le harnais supprimé qui avait attrapé **en exécutant** deux défauts que la
  relecture n'avait pas vus — la consolidation de `--trait-fin` au lot 2, la casse du rendu
  par retrait des jetons au lot 3. ✔️ **Non contesté** : la suppression de
  `test_app_diagramme_conformite.{js,py}` est légitime, elle vérifiait la table TK de
  l'ancienne maquette, grammaire révoquée. Exigé : (1) un **harnais navigateur sur le
  nouveau diagramme** (capture headless + `getComputedStyle`, marqueur sur une seule ligne
  physique, reprise unique sur `TimeoutExpired`) — **pas du travail jetable, F5b et F4b en
  ont besoin au lot 5** ; (2) le **décompte poste par poste** des 125 + 91 cas perdus,
  chaque groupe rangé dans « réellement disparu avec la grammaire révoquée » ou « **encore
  vrai, et désormais non couvert** » — le second tas est ce qui dit ce que le lot a cessé
  de garder **sans le décider** ; (3) `disposer()`, unique autorité de géométrie, éprouvé
  par des **propriétés adverses** (libellés très longs, nombreux agents, un seul agent,
  largeurs inégales) et non par une assertion ; (4) les 4 représentations de F16 vérifiées
  **à l'exécution** — un échec doit *se voir*, pas seulement poser une classe.
- [2026-09-21 23:47] Lot 4 — **REBOUCLE VÉRIFIÉE, lot 4 CLOS**, et elle a produit **la
  trouvaille la plus importante du cycle**. Harnais navigateur neuf
  `test_app_diagramme_navigateur.py`, **24 cas**, découvert **seul** par la garde de
  partition (50 → 51). Décompte poste par poste des 216 cas perdus, rendu comme demandé :
  ~150 **réellement disparus** avec la grammaire révoquée (socle, bandes de rayon, cadres
  simultanés, structure `dg-*`, liseret, anneau guide, graduations data-dépendantes — les
  12 nouvelles sont fixes et décoratives, `ADR-0031 §2`, changement de conception et non
  perte de couverture) ; **~66 encore vrais et non couverts, RATTRAPÉS** (échec 22, agent
  principal 15, anneau et graduations 11, pastilles 18 — tous **peints**, d'où leur
  disparition avec le harnais et leur retour par lui) ; **1 poste encore non couvert et
  NOMMÉ** : les comptes exacts d'outils et de fichiers, qui relèvent de F11 au lot 5, pas
  d'un trou de garde.
  ⚠️ **Une garde tautologique, la troisième du cycle, que seul le navigateur a vue.**
  `ecart_couvre_la_reserve` comparait l'écart à `demiDroite + demiGauche` — **les valeurs
  que `disposer()` avait elle-même produites**. Formule rétrécie, les deux côtés
  rétrécissent, assertion verte. Son commentaire jurait « pas en recopiant la formule
  interne » : il ne la recopiait pas, **il en consommait la sortie**. Cartographie faite
  par l'agent principal en amputant le coefficient de réservation :

      coeff    0.60  0.50  |  0.42  0.35  |  0.30  0.20
      pur        ok    ok  |    ok    ok  | ÉCHEC ÉCHEC
      navigateur ok    ok  | ÉCHEC ÉCHEC  | ÉCHEC ÉCHEC

  Le navigateur se déclenche **exactement là où le chevauchement réel commence** ; à 0,50
  et 0,60 aucun des deux ne tire, et c'est correct — la garde porte sur la **propriété**,
  pas sur la constante. Remplacée par un **oracle indépendant** (plancher typographique
  `N × taille × 0,42`, très en dessous du coefficient 0,70 du kit, ne dépendant d'aucune
  sortie de `disposer()`), éprouvé sur un agent seul, libellés de 50 caractères, largeurs
  inégales, 30 agents, les 11 noms réels, et **200 tirages pseudo-aléatoires non choisis**,
  plus une contre-épreuve que la borne contraint vraiment — sinon elle serait verte par
  vacuité. **7 mutations, 6 tuent** ; la septième (retrait de la marge de 10 px) survit et
  **ce n'est pas un défaut** : aucun chevauchement réel n'en résulte, vérifié au
  navigateur. Honnêteté notée — le sous-agent l'a dit au lieu de la maquiller.
  **Suite : 1257 → 1290, 0 échec, 30 fichiers. Les 4 registres restent VIDES.**
- [2026-09-21 23:52] **POINT D'ARRÊT HUMAIN n°3 — graphe d'agents** — capture envoyée,
  rendue avec **l'état réel du dépôt** (282 Ko d'`/api/etat` rejoués par un serveur de
  substitution qui répond 204 sur `/api/flux` : le flux SSE restant ouvert, la page
  n'atteignait jamais l'inactivité réseau et Chromium ne rendait jamais la main — d'où le
  bandeau « flux rompu », artefact de la capture et non du code). Neuf disques, sigles,
  pastilles, anneaux pointillés de l'agent principal, deux drapeaux d'échec. En attente.
  ✔️ **Fausse piste écartée en chemin, à ne pas rouvrir** : un `401` sur `127.0.0.1` m'a
  fait soupçonner une régression de la garde d'authentification. Vérifié —
  `_locale('127.0.0.1')` rend bien `True`, et `_autorisation_lecture` s'applique **aussi en
  local dès qu'un `fichier_jeton` est déclaré**, délibérément : c'est le correctif qui
  empêche un jeton en mode 0644 de rouvrir lecture ET écriture derrière un intermédiaire
  local. **Comportement voulu, documenté dans le code. Aucun défaut.**
- [2026-09-22 00:14] Étape 9 — doc-writer — **doc du lot 4 livrée, dont une section que
  le sous-agent voulait ajourner**. `CHANGELOG.md` et `docs/features/page-centre-de-
  controle.md` réécrits sur la grammaire du lot 4 ; `ADR-0031` laissé **intact** à raison
  (le lot exécute exactement ce qu'il prescrit, aucun écart) ; `ADR-0032` reçoit une
  **seconde** note datée — celle du lot 2 annonçait la survie de l'identité couleur
  jusqu'au lot 4, la nouvelle en constate l'application, et **la première n'a pas été
  réécrite** : un ADR s'empile. Le sous-agent a aussi noté, justement, que la garde
  tautologique de `disposer()` est une **nouvelle occurrence de `PIEGES §30`** et non un
  fait neuf — pas d'entrée redondante ajoutée.
  ⚠️ **Renvoyé par l'agent principal** : `docs/DESIGN-SYSTEM.md` §5 était signalé « hors
  périmètre, pour un prochain passage » alors que la section **écrit elle-même son
  déclencheur** — « sera réécrite au cycle d'implémentation de `feature-021`, **une fois
  le disque livré** ». Le disque l'est. Son avertissement « le disque **va** changer »
  parlait au futur d'une chose au passé, et l'ajourner aurait été précisément la dette que
  la règle d'auto-vérification de fin de tour existe pour empêcher — c'est ce tour-ci qui
  l'a rendue fausse. Réécrit : §5 sur la grammaire du lot 4, §8 sur le vocabulaire des
  traits, `ADR-0025`/`0026` marqués révoqués, **séparation géométrie/rendu conservée**
  (`ADR-0025 §4` / `ADR-0031 §4`, que le lot 4 respecte).
- [2026-09-22 00:19] **DÉFAUT D'OUTILLAGE TROUVÉ EN CHEMIN — `bug-023` créé, NON absorbé**.
  En réécrivant `DESIGN-SYSTEM.md`, le sous-agent a cassé un lien Markdown (URL coupée sur
  deux lignes) et l'a remarqué **parce que le compte BAISSAIT alors qu'il ajoutait des
  liens** — 192 → 190. L'agent principal a reproduit le défaut délibérément sur un autre
  lien :

      état sain              ✅ 191 lien(s) relatif(s), toutes les cibles existent.
      un lien coupé en deux  ✅ 190 lien(s) relatif(s), toutes les cibles existent.
      restauré               ✅ 191 lien(s) relatif(s), toutes les cibles existent.

  **`check_doc_links.sh` reste VERT : un lien cassé ne fait pas échouer, il DISPARAÎT du
  compte.** L'outil établit « tout lien reconnu résout », jamais « tout lien voulu est
  reconnu ». C'est le même patron que les trois gardes creuses de ce cycle (`PIEGES §30`),
  appliqué cette fois à l'outillage d'hygiène qui tourne **en CI**. ⚠️ **Non absorbé dans
  `feature-021`** : le défaut ne désarme aucune garde livrée par ce cycle, donc `ADR-0017`
  ne s'applique pas et le cycle ne prend pas une troisième spec. Écrit en
  `specs/features/todo/bug-023-un-lien-casse-disparait-du-compte-au-lieu-d-echouer.md`,
  avec la question ouverte posée à l'architecte (détecter les syntaxes fautives — qui
  reproduirait le défaut par énumération, leçon de `bug-022` — ou surveiller le compte
  dérivé comme un attendu déclaré, à la manière d'`ATTENDU_ROUGE`).
- [2026-09-22 01:30] **RETOUR HUMAIN sur la capture du lot 4 — trois écarts, dont un seul
  est un défaut**. L'humain signale « le graphe n'est clairement pas comme sur la
  maquette », puis « les agents sont tronqués en haut et en bas, et les pointillés du
  cadran n'apparaissent que sur certains ». Prototype rendu dans les mêmes conditions pour
  comparer, puis diagnostic **mesuré** :
  **(1) DÉFAUT RÉEL — écrêtage.** `hauteur = axeY + demiHauteurMax + margeBasPx`, avec
  `margeHautPx = 44`, `margeBasPx = 40`, et `demiHauteurMax = 0` sur nos données (aucun
  créneau parallèle) → **hauteur 84 px pour un disque de 88**. Les marges valent **exactement
  le rayon** : il ne reste rien pour ce qui se dessine HORS du disque — anneau pointillé de
  l'agent principal, halo d'échec, drapeau, `.agent-name` au-dessus, `.agent-duration` en
  dessous. Le disque déborde déjà de 4 px. L'anneau pointillé n'apparaît donc pas « sur
  certains » : il est **coupé pour tous**, et ce qu'on en voit dépend d'où le fragment tombe.
  Prototype pour comparaison : ~77 px au-dessus de l'axe, ~75 px en dessous. **À reboucler
  au lot 4.**
  **(2) PAS UN DÉFAUT — libellés vides faute de donnée.** `app.js` pose bien `.agent-name`
  et `.agent-duration` autour de chaque disque, comme le prototype. Ils sont vides parce que
  **14 `SubagentStop` sur 16 arrivent avec `agent_type: None`**. Conséquence à ne pas
  perdre : la 4ᵉ représentation de F16, le non-chevauchement des libellés — celle dont j'ai
  fait renforcer la garde au lot 4 avec 200 tirages adverses — **s'exerce aujourd'hui sur
  des chaînes vides**.
  **(3) ⚠️ ERREUR DE L'AGENT PRINCIPAL, corrigée.** J'avais écrit que `disposer()` « ne sait
  pas bifurquer ». **Faux** : `construireCreneaux` groupe les passages en créneaux,
  `espacementVerticalPx: 168` les étale verticalement, et les connecteurs sont **déjà des
  courbes de Bézier**, comme le prototype. Notre graphe est droit **parce que nos données le
  sont** — un agent à la fois. J'allais envoyer un lot chercher une capacité qui existe.
- [2026-09-22 01:34] **Question de l'humain : « si le lot 5 tourne, pourquoi je ne vois pas
  d'agent animé ? »** — répondu par mesure sur le journal réel : la capture date de
  **17:39:21 UTC**, le `SubagentStart` du lot 5 de **17:40:20 UTC**. La capture précède
  l'agent de **59 secondes** ; « 0 agent actif » était juste à cet instant. Trouvé en
  chemin, et à ne pas perdre : **3 passages ouverts sans fermeture**, dont deux datant du
  **2026-09-13** et du **2026-09-16** — des zombies vieux d'une semaine. Et sur tout le
  journal (17 508 lignes) : **327 `SubagentStart` contre 4 054 `SubagentStop`**, soit 12 fois
  plus de fermetures que d'ouvertures. La distinction échec / sans-clôture est donc bancale
  **à la racine de la donnée**, pas dans son rendu.
- [2026-09-22 02:05] **Question de l'humain : « et les agents qui ne se mettent pas en
  parallèle, et aucune boucle de retour arrière ? »** — répondu par mesure, et la réponse
  n'est pas celle qu'on croit. ⚠️ **Je corrige d'abord mon propre chiffre** : « 12 fois plus
  de fermetures que d'ouvertures » était trompeur. `events.py` documente que ces
  `SubagentStop` en excès « **ne sont PAS des sous-agents du workflow** » — artefacts de fin
  de tour, déjà écartés côté serveur en `fermetures_orphelines`. Le nombre de passages réels
  suit les **327 ouvertures**, pas les 4 054 fermetures.
  **Rebouclages : la capacité marche, la donnée en regorge, le cycle affiché n'en a pas.**
  `python3 events.py` sur le journal réel rend `reprises : doc-writer 9, frontend-developer
  8, backend-developer 7, code-reviewer 7, architect 5, fork 5, spec-reader 4,
  ux-ui-designer 4, test-engineer 3, orchestrator 2, debugger 2, security-reviewer 2` —
  **douze agents rappelés**. Mais la capture montre **Cycle #2**, dont les sous-agents sont
  `OR, SP, AR, UX, FR`, **tous distincts** : aucune répétition, donc aucun arc à tracer. Le
  rendu est juste ; c'est le cycle affiché qui est pauvre. → **Conséquence d'ergonomie à
  arbitrer** : ouvrir sur un cycle qui a de la matière, sinon la fonction la plus visible du
  graphe ne se voit jamais.
  **Parallélisme : exclu par la MODÉLISATION, ni par le rendu ni par la donnée.**
  `construireCreneaux` groupe par chevauchement temporel réel, mais `events.py` ferme le
  segment de l'agent principal **dès qu'un sous-agent démarre** (commentaire explicite). Or
  dans la réalité ils se chevauchent en permanence — l'humain travaille pendant que l'agent
  tourne. Deux sous-agents simultanés s'afficheraient bien côte à côte ; le cycle les a
  lancés un par un. → **Décision de conception à arbitrer**, pas un correctif.
- [2026-09-22 02:12] Lot 5 — **REBOUCLE VÉRIFIÉE, lot 5 CLOS**. Le rôle de contraste se
  porte désormais **par usage** : table neuve `USAGES_APLAT` (`{sélecteur → {role, motif}}`,
  `INDICATEUR` seuil 3,0 ou `DECOR` exempt avec motif écrit), F5b résolvant chaque élément
  par `el.matches()` — le moteur de sélecteurs qui a réellement peint — et mesurant contre
  **le fond réellement derrière**. `.status-dot`, `.legend i` et `.sheet-handle` passent à
  `--line-strong` (**3,31 sur `--surface`**, mesuré peint). `.column-label i` s'est révélé
  être un **repli jamais peint** (les trois colonnes le surchargent, comme le prototype) —
  déclaré `DECOR` avec ce motif, et la clause miroir le confirme. **12 usages d'aplat
  déclarés, dont 7 que la clause miroir a débusqués** et que personne n'avait regardés.
  Mutations rejouées par l'agent principal :

      (a) .status-dot repeint en --line   ECHEC  1 aplat porteur d'information sous 3.0:1
                                                 1.45 · rgb(215,210,222) sur rgb(255,251,255)
      (c) une BORDURE en --line           EXIT=0, 12 cas — aucune sur-correction

  ⚠️ **Sa propre trouvaille, la plus instructive** : sa première mutation (a) **survivait**,
  parce que la scène ne rendait `.status-dot` qu'à l'état **actif** (teal) — l'état inactif,
  justement peint dans le jeton le plus pâle, n'était **jamais balayé**. La garde ne voyait
  pas la couleur qu'elle juge. Balayage en **deux passes** désormais, la seconde après
  retrait des classes d'état : **196 aplats au lieu de 98, 17 indicateurs au lieu de 11**.
  **Suite : 1319 cas, 0 échec, 33 fichiers. Les 4 registres vides**, vérifié en excluant les
  mentions en commentaire qu'un `grep` naïf compte à tort.
- [2026-09-22 03:40] Lot 4 — **REBOUCLE ÉCRÊTAGE livrée et vérifiée**. Marges
  **44/40 → 72/70**, dérivées **en mesurant le DOM peint dans Chromium**, jamais en lisant
  le CSS du prototype ni en reprenant mes ~77/~75 (qui n'étaient qu'une lecture de
  capture). Source : `.agent-name` à 69,5 px au-dessus du centre, `.agent-duration` à
  67,2 px en dessous, les deux dominant l'anneau de rôle. ⚠️ **Valeur qu'aucune lecture du
  CSS ne donnait** : l'anneau de rôle mesure **±55 px et non ±13** comme le déclare la
  feuille — le `<button>.agent-node` non réinitialisé porte une bordure UA de ~2 px qui
  rétrécit son *padding-box*, donc le bloc conteneur réel de `.role-ring` n'est pas celui
  que le CSS décrit. Garde neuve : 4 cas `F_ecretage_{actif,echec,sans_cloture,principal}`,
  oracle = union des `getBoundingClientRect()` comparée au rect réel de `.graphe-scroll`,
  **jamais recalculée depuis `disposer()`**. Mutation rejouée par l'agent principal (retour
  à 44/40) : les 4 cas meurent en nommant les chiffres — `boîte agent [15.6, 152.4],
  canevas [37.2, 127.2], dépassement haut 21.5 px, bas 25.2 px`. **Suite 1319 → 1323, 0
  échec.**
  ⚠️ **CORRECTION D'UN DIAGNOSTIC QUE J'AVAIS DONNÉ FAUX** : j'avais écrit que les libellés
  étaient **vides faute de donnée**. Ils étaient **écrêtés**. La capture d'après correctif
  montre `orchestrator`, `spec-reader`, `architect`, `ux-ui-designer` et les durées
  (`12 min 15`, `8 min 21`…). Conséquence : la 4ᵉ représentation de F16 — le
  non-chevauchement des libellés, celle dont j'ai fait renforcer la garde avec 200 tirages
  adverses — **ne s'exerçait PAS sur des chaînes vides**. Elle protégeait du réel, rendu
  invisible par l'écrêtage.
- [2026-09-22 03:52] **SECOND ÉCRÊTAGE signalé par l'humain (sur téléphone) : les arcs de
  reprise sont tronqués en haut.** Mesuré : `sommetY = min(y1,y2) − repriseElevationPx =
  28 − 90 = **−62**`, soit 62 px au-dessus du canevas ; la marge nécessaire est
  `rayon + élévation = 134` contre `margeHautPx = 72`.
  ⚠️ **La garde neuve ne pouvait pas le voir, et c'est la formulation de MON brief qui l'a
  exclu** : j'avais exigé que « tout ce qui appartient à un **agent** tienne dans le
  canevas », en énumérant disque, anneau, drapeau, nom, durée. **Un arc de reprise
  n'appartient à aucun agent** — il relie deux passages. Leçon à porter au-delà de ce
  cycle : *une garde ne couvre que ce que son énoncé nomme, et un énoncé qui énumère laisse
  toujours dehors ce qu'il n'a pas listé.* Reboucle : dimensionner le canevas sur **l'union
  de tout ce qui est tracé**, agents ET connecteurs, plutôt que d'ajouter une seconde
  constante qui se refera piéger au prochain élément dessiné hors du disque ; garde étendue
  aux connecteurs sur une scène **portant réellement une reprise** ; contre-épreuve qu'un
  cycle sans reprise ne gagne pas 90 px de vide.
- [2026-09-22 04:38] Lot 4 — **SECONDE REBOUCLE VÉRIFIÉE, écrêtage CLOS**. La hauteur se
  **dérive** désormais de l'union de tout ce qui est tracé :
  `extensionHaut = max(demiHauteurMax + margeHautPx, débordements des arcs)`. Le décalage
  vertical de chaque agent est calculé **avant** l'axe — il ne dépend que du créneau — ce
  qui casse la circularité « l'arc dépend des positions, les positions de la hauteur ».
  ⚠️ **Le sommet retenu est l'extremum ANALYTIQUE de la Bézier, jamais son point de
  contrôle** : contrôles à −62, sommet réellement peint à **−39,5**, soit **22,5 px de vide
  évité**. Pas de pire cas imposé. Garde étendue aux **connecteurs**, sur une scène qui
  **porte réellement une reprise** — aucune n'en portait, donc aucune mesure n'en voyait
  jamais. Épreuves rejouées par l'agent principal :

      hauteur ignorant les arcs   navigateur ÉCHEC 35.5 px   ·   pur ÉCHEC −39.50 px
      cycle SANS reprise          hauteur = 142 = 72+70, aucun vide ajouté
      halo porté à 60 px          ÉCHEC 32.0 px

  Et le message de la garde porte la leçon : « *un arc de reprise culmine au-dessus du plus
  haut disque, il ne peut pas être couvert par une garde qui n'énumère que les parties d'un
  agent* ».
  ⚠️ **Troisième débordement trouvé en cherchant, et il invalidait l'oracle lui-même** :
  `getBoundingClientRect()` n'inclut **ni `box-shadow` ni `outline`**. Or le halo d'échec
  EST un `box-shadow: 0 0 0 6px` (`app.css` l. 633) et le focus un `outline: 3px` avec
  `outline-offset` — l'union était aveugle aux deux. Rectangle du disque désormais gonflé
  de leur extension lue sur le **style calculé**. Limite déclarée : forme simple
  non-`inset`, l'erreur va vers la **sous-estimation**. **Suite : 1323 → 1330, 0 échec, 33
  fichiers. Les 4 registres vides.** Vérification visuelle faite sur un cycle portant
  réellement une reprise (`frontend-developer` rappelé) : arc entier, sommet dans le cadre.
- [2026-09-22 04:55] **COMMIT des lots 4 et 5** — agent principal — `f53a293`, 26 fichiers.
  ⚠️ **Un seul commit pour deux lots, et c'est assumé** : ils ont réécrit les mêmes fichiers
  (`app.js`, `app.css`, `index.html`) et **une reboucle du lot 4 est revenue APRÈS le
  lot 5** (l'écrêtage signalé par l'humain), si bien qu'aucune coupure par fichier ne les
  sépare honnêtement. Découper ici aurait produit deux commits dont aucun ne compile
  l'histoire réelle. Plus `007c299`, la spec `bug-023` **seule**, parce qu'elle n'a rien à
  voir avec ce cycle. Arbre propre, `check_specs.sh` 49 specs sans doublon,
  `check_doc_links.sh` 191 liens résolus, suite **1330 cas 0 échec** depuis l'état commité.
  Six commits sur la branche. **Rien poussé.**
- [2026-09-22 05:40] **DÉCISION HUMAINE — LE PÉRIMÈTRE EST ROUVERT : la maquette ENTIÈRE.**
  Mot pour mot : « Je t'avais autorisé à créer de nouvelles ADR. **Rien ne justifie de
  livrer un livrable qui couvre une petite partie de ce que j'ai demandé.** Fais ce qu'il
  faut pour mettre en œuvre la maquette. » Rappel de l'objectif d'origine du 2026-09-20 :
  « pas juste une interprétation mais **la maquette précise** ».
  ⚠️ **Erreur d'appréciation de l'agent principal, à l'origine de ce retour.** L'humain
  avait autorisé les ADR neufs **dès le premier message** (« Des ADR pourraient contredire
  les choix retenus. Il faudra alors écrire de nouveaux ADR »). J'ai traité `ADR-0020`,
  `ADR-0023` et `PIEGES §16` comme des **contraintes acquises** au lieu de les rouvrir, et
  la carte F0 a différé **88 éléments sur 113** en conséquence. Le point d'arrêt n°1 lui a
  bien soumis les comptes — « la moitié du prototype part en `feature-025` » — mais **un
  tableau de comptes ne montre pas ce que ça fait à l'écran** ; il aurait fallu deux
  rendus côte à côte. Trois lots plus tard, la comparaison visuelle a tout dit d'un coup.
  **Décisions de reprise** : (1) les **7** exclusions d'`ADR-0020`/`ADR-0023`
  (`project-switcher`, `notification-button`, `notification-badge`, `avatar`, `user-name`,
  `account-button`, `cycle-title`) **reviennent** ; (2) `progress-track` revient **sous la
  forme déjà tranchée par l'humain le 2026-09-20** — l'anneau de la maquette animé sur
  l'activité réelle, **sans pourcentage**, parce qu'aucune donnée ne mesure une progression
  et qu'en afficher une serait inventer un chiffre (`PIEGES §16` conserve donc son motif,
  pas son exclusion) ; (3) les **88 éléments** assignés à `feature-022`/`023`/`025`
  rentrent dans le périmètre ; (4) **`security-reviewer` rôle GATE, P1 sur le design avant
  tout code**, sur le panneau de conversation **avec saisie** et les modales qui **lancent,
  modifient et suppriment** des specs — chemins d'écriture depuis une page servie sur le
  réseau local (`hote = 0.0.0.0`). Non négociable (`CLAUDE.md`, Règles absolues), et
  traité **en le faisant passer**, pas en l'évitant.
  ⚠️ **Le trou que cette extension doit fermer** : on a **135 assertions vertes et un écran
  qui ne ressemble pas à la maquette**. Les rayons employés (2/3/4 px) n'existent nulle
  part dans le prototype, et les deux élévations M3 sont déclarées au bit près pour
  **zéro usage** — aucune garde ne vérifiait qu'un jeton est *employé*, seulement qu'il est
  *déclaré*. Il faut un livrable qui porte la **fidélité d'ensemble**, pas 135 propriétés
  locales. `orchestrator` saisi du plan.
- [2026-09-22 05:52] **RAPPEL DE L'HUMAIN : « prends aussi en compte les réponses que j'ai
  déjà apportées »** — et il a raison, **une décision avait été perdue**.
  ⚠️ **TOKENS — rétrécissement non autorisé, à annuler.** Le 2026-09-20, interrogé sur le
  périmètre, l'humain avait **explicitement accepté que le backend entre dans le périmètre
  pour capter les tokens**, et tranché la forme du chiffre : « est-ce que le mieux ne
  serait pas d'**additionner input et output token** ? ». J'ai néanmoins sorti les tokens
  vers `feature-023` et écrit F15 « centre du disque **sans chiffre** ». **Rien
  n'autorisait ce rétrécissement.** `feature-023` est **absorbée** ; la capture côté
  backend rentre dans le plan ; le chiffre est la **somme entrée + sortie**.
  **Anneau de progression, reconfirmé** : « le cercle de progression peut **juste illustrer
  le côté actif du sous-agent** ». Forme de la maquette, animée pendant l'activité, **sans
  pourcentage** — la donnée n'existe pas.
  **Décisions antérieures rappelées à l'`orchestrator` pour qu'il ne les repose pas** : la
  maquette **HTML** fait foi (les PNG n'étaient que des illustrations, supprimés) ; « les
  **données** ne sont que des exemples » — on reproduit la grammaire visuelle, jamais
  « Sécuriser le checkout » ni « Jean Dupont » ; thème **clair seul** ; contraste = hex au
  bit près, **usage** restreint (`ADR-0024 §5` en vigueur) ; « quitte à revoir le diagramme
  **complètement** » ; « laisser le designer **totalement libre** de faire quelque chose
  qui impressionne » ; suppressions réelles exigées.
  ⚠️ **Règle générale posée pour tout le plan** : quand une décision de l'humain et une
  contrainte héritée (ADR, `PIEGES`) se contredisent, **c'est la décision humaine qui
  l'emporte** — il a autorisé les ADR neufs dès son premier message. **Seule exception** :
  si reproduire la maquette obligeait à **afficher une donnée qui n'existe pas**, on garde
  la forme et on la branche sur du réel (cas de l'anneau).
  ⚠️ **Leçon de méthode, valable au-delà de ce cycle** : *quand un arbitrage porte sur du
  visuel, montrer du VISUEL.* Le point d'arrêt n°1 a soumis un tableau de comptes, validé ;
  trois lots plus tard la comparaison des deux rendus a montré ce que les chiffres ne
  disaient pas. Les points d'arrêt du plan étendu porteront des **captures comparées
  prototype/livré**.
- [2026-09-22 06:20] Lot 6 étape 1 — test-engineer — **CAMPAGNE DE MUTATION SUR LES GARDES
  ELLES-MÊMES**. 13 mutants, **11 tués du premier coup, 2 gardes creuses trouvées et
  réparées** (aucune ligne de production touchée) :
  **(1) F5b — une encre inconnue était comptée mais jamais jugée.** `.marque{color:#fefefe}`,
  contraste **1,03:1**, traversait les 12 cas sans échec : une encre non rattachée à un
  jeton était rangée « hors palette » et **jamais assertionnée** — alors que le commentaire
  du fichier promettait « c'est un ÉCHEC EN SOI ». Un invariant écrit en commentaire, une
  fois de plus.
  **(2) F1 — le critère « aucun hexadécimal hors du `:root` » n'était appliqué QU'AU
  PROTOTYPE, jamais à `app.css`.** Un hex neuf traversait les **33 fichiers / 1330 cas**.
  C'était pourtant un critère d'acceptation de la spec, et le journal du lot 1 l'avait
  signalé « à ne pas perdre » — il l'a été pendant cinq lots.
  Réparations contre-vérifiées par l'agent principal : `#123456 @ .mutant-hex (color)` et
  `rgb(254,254,254) sur rgb(255,251,255), contraste 1.02, seuil 4.65`. **Suite : 1347 cas,
  35 fichiers, 0 échec.**
  ⚠️ **Constat à trancher par l'architecte** : `app.css` l. 699 porte `--state-color:
  #aaa6b0`, **valeur recopiée au lieu de `var(--agent-state-pending)`** (l. 88). Passe
  aujourd'hui car la valeur est tracée, mais **divergerait en silence** si le jeton change.
  ⚠️ **Deux gardes non couvertes** : `test_conformite_formes` et
  `test_conformite_ordre_backlog`, créées **pendant** la campagne par le correctif de
  fidélité concurrent. À muter dans une passe dédiée.
  ⚠️ **Variante de `PIEGES §29` à consolider** : un clone `cp -a` pris pendant un WIP
  concurrent peut manquer des **fichiers entiers** créés quelques secondes après la copie —
  §29 ne parle que d'un fichier *muté* capturé, pas d'un fichier *absent*. Découvert en
  comparant la liste des fichiers du clone à celle du dépôt réel, après coup.
- [2026-09-22 06:35] **RETOUR HUMAIN : « l'intérêt d'avoir une maquette html, c'est de
  RÉCUPÉRER DU CODE UTILE »** — signalé sur la feuille de détail (« coin carré au lieu
  d'arrondi, pas d'ombre portée »). C'est le diagnostic de fond des six premiers lots : on
  a **re-dérivé** le design — 24 jetons recopiés au bit près, durées, noms de classes,
  rayons — au lieu de **reprendre les règles CSS du prototype**. Chaque re-dérivation a été
  une occasion de dériver. **Principe porté au plan étendu** : pour tout composant adopté,
  la règle du prototype est **reprise telle quelle** quand le sélecteur existe, adaptée
  seulement là où la structure diffère, avec le motif écrit ; et la garde compare **règle à
  règle**, pas jeton à jeton.
- [2026-09-22 06:41] Reboucle de fidélité — frontend-developer — **livrée**. Rayons et
  élévations repris **par sélecteur identique** au prototype quand il existe
  (`.detail-sheet` → `28px 28px 0 0` + ombre, `.kanban-column` → 16px, `.feature-card` →
  14px, `.summary-band` → 20px…), par **rôle le plus proche** sinon, chaque changement
  commenté avec sélecteur et ligne d'origine. Les deux ombres M3 atterrissent enfin :
  `--shadow-1` sur `.feature-card:hover`, `--shadow-2` sur `.porte-carte`. **Ordre corrigé** :
  le kanban remonte juste sous la feuille de détail, il était enterré sous trois blocs.
  Gardes neuves `test_conformite_formes` (9 cas, dont la **clause miroir qui aurait vu le
  défaut d'origine** : jeton de forme ou d'élévation déclaré et jamais employé) et
  `test_conformite_ordre_backlog` (4 cas). **Suite : 1347 cas, 35 fichiers, 0 échec.**
  ⚠️ **CHIFFRE QUE J'AVAIS DONNÉ FAUX** : j'avais écrit que `2px/3px/4px` « n'existent
  nulle part dans le prototype ». **`3px` y existe** (`.brand-mark i`, l. 109) ; seuls
  `2px` et `4px` sont absents. Le sous-agent l'a vérifié au parseur au lieu de me croire —
  sa première mutation, fondée sur ma phrase, **ne tuait rien**.
  ⚠️ **FAUTE DE MÉTHODE DE L'AGENT PRINCIPAL** : j'ai fait tourner **deux sous-agents en
  parallèle dans le MÊME arbre de travail** (campagne de mutation et reboucle de fidélité).
  Conséquence mesurée : le total de 1347 **mélange leurs deux contributions et n'est pas
  reproductible en isolation**, et un clone `cp -a` pris à 19:51:13 a manqué deux fichiers
  créés à 19:51/19:52. Le plan étendu doit **séquencer** ce qui touche les mêmes fichiers.
- [2026-09-22 06:58] **PLAN ÉTENDU rendu par l'`orchestrator`** (68 Ko, conservé dans les
  résultats d'outil). **Huit lots (6 → 13)**, **4 ADR neufs** — `0038` méthode du cycle,
  `0039` la fidélité prime sur les restrictions antérieures, `0040` les chemins d'écriture,
  `0041` lecture hors racine — et `0005`/`0019`/`0020`/`0023` **amendés en ligne de statut
  seulement, corps intacts** (`docs/adr/README.md:11`). `feature-022`/`023`/`025`
  **absorbées** ; `feature-024` non (aucun élément du prototype ne lui appartient) ;
  **`feature-009` bloque le lot 11** — elle doit trancher où vivent les messages.
  **GATE `security-reviewer` P1 bloquant** sur les lots 9, 11, 12, puis **P2 ×3**.
  **La garde de fidélité d'ensemble, en trois clauses**, dont la dernière manquait :
  couverture (0 `differe:*` dans F0), vocabulaire de forme (inclusion **et** emploi, plus
  l'égalité au bit près du vecteur de forme pour tout sélecteur présent des deux côtés), et
  **ressemblance rendue** — prototype ET cockpit chargés dans **le même Chromium**,
  comparés par ancre (style calculé, géométrie normalisée, ordre vertical) et par signature
  globale. ⚠️ **Ce qui la rend non tautologique : l'attendu n'est pas une table recopiée,
  c'est le prototype CHARGÉ.** Contre-épreuve exigée : changer le **texte** d'une carte doit
  la laisser **verte**, sinon c'est un diff de pixels. Trois points d'arrêt humains, chacun
  avec **deux rendus côte à côte** — jamais un tableau de comptes. Étape A lancée.
- [2026-09-22 07:14] Étape A — spec-reader — **TROIS SPECS ABSORBÉES**. `git mv` de `todo/`
  vers `doing/` pour `feature-022`, `023`, `025` — déplacement, jamais copie ;
  `check_specs.sh` revérifié par l'agent principal : **49 specs, aucun doublon**, et
  `doing/` porte bien **cinq** specs. Statut passé à `doing` dans chacune, avec son lot
  (11, 12, 9-10). Section « Absorption dans le cycle » écrite sur le modèle de `bug-017`,
  et **explicitement distinguée d'`ADR-0017`** : aucune garde livrée n'est désarmée par
  leur absence, le motif est la **réouverture de périmètre par l'humain**. `feature-024` et
  `feature-009` **non touchées**.
  ✔️ **Le point qui transforme une comptabilité en engagement** : les **88 éléments** du
  prototype sont recopiés nominativement dans leur spec cible — **14** dans `feature-022`,
  **3** dans `023`, **71** dans `025` — dérivés de la table F0 par script, pas retapés.
  Le total retombe exactement sur 88, ce qui confirme la lecture.
  ⚠️ **Trois constats mesurés dans le dépôt, remontés à l'architecte** : (a) **collision
  `#prompt`** — `index.html:225` porte déjà `<textarea id="prompt">` (composeur de
  rédaction, `feature-008`) et F0 assigne le même nom au composeur de la conversation,
  alors que `PIEGES` **interdit de renommer** les noms du prototype ; (b)
  **`project-switcher` n'a aucune donnée** — `config.py` a pour défaut `"projet": {"nom":
  "Projet sans nom"}` et aucune liste de projets n'existe ; (c) **`icon-button`** est
  assignée à `feature-025` **sans aucune instance adoptée** — l'implémenter littéralement
  créerait une classe morte, que `PIEGES §33` fait échouer.
  ⚠️ **Risque que le plan n'avait pas nommé** : trancher le stockage des messages pour la
  conversation *live* de `feature-022` sans dire si le choix engage `feature-009` (fils
  attachés au cycle de vie d'une spec) produirait **deux mécanismes de persistance
  divergents** dans le même dépôt. Porté à l'étape B comme arbitrage explicite.
- [2026-09-22 07:18] Étape B — **architect saisi** des quatre arbitrages bloquants : le
  stockage des messages (et s'il engage `feature-009`), la collision `#prompt`, le sort de
  `project-switcher` sans données, et l'amendement d'`ADR-0023` sur `cycle-title`.
### 4. F17 — le registre `ATTENDU_ROUGE`, défini (l'agent principal avait transmis le terme sans sa définition)

**Le problème qu'il résout.** Écrire les cinq gardes au lot 0 et les voir échouer,
c'est cinq gardes rouges commitées pendant cinq lots — ce qui contredit « le dépôt
est vert à la sortie de chaque lot ».

**La forme.** Chaque fichier de garde porte une table `ATTENDU_ROUGE = {…}` : **une
entrée par assertion encore fausse**, avec **le lot qui la ferme** et **la date**.
La garde échoue dans deux cas, et le second est celui qui compte :

1. toute régression **hors** registre ;
2. **toute entrée du registre qui se met à passer sans avoir été retirée**.

C'est la clause (2) qui empêche le registre de devenir une amnistie. Même patron que
`test_ci_partition_navigateur.py` (`ADR-0037 §3`) : trois ensembles qui doivent
coïncider, pas une liste qu'on allonge.

⚠️ Le registre est une **énumération tenue à la main** (`PIEGES §21`) — la clause (2)
est exactement ce qui la rend non périmable.

**Bénéfice non prévu** : le registre **est** l'état d'avancement du cycle, versionné.
C'est la réponse directe à la leçon de `feature-020` — 59 cases à `[ ]` pour une
quarantaine de livrables faits, après une interruption de session.

**Options écartées** : une branche à fenêtre rouge déclarée (perd la trace datée et
rend la reprise aveugle) ; garder les gardes en arbre de travail jusqu'au lot qui les
verdit — **refusée**, c'est l'invitation à ajuster la garde au code, le vice exact
de `bug-022`.

### 5. Deux corrections de fond à ma consigne de séquencement

L'orchestrateur confirme l'ordre, et le corrige sur deux points que j'avais manqués :

- **« Vu rouge » ne tue qu'un cas sur deux.** Il tue la garde qui n'atteint pas son
  artefact ou qui n'assertionne rien. Il ne tue pas **rouge pour la mauvaise
  raison** — une garde qui échoue parce que le prototype est introuvable, ou parce
  que *tout* diffère, est aussi peu informative qu'une garde verte à vide. D'où deux
  exigences par fichier : une **assertion d'atteignabilité bruyante** (artefacts lus,
  non vides, grandeurs **dérivées** et non récitées) et **chaque assertion nomme sa
  raison d'échec attendue**, la sortie rouge du lot 0 étant **recopiée dans le
  journal**.
- **« Vu rouge » ne remplace pas la mutation.** `D2` reste dû, **y compris sur les
  gardes elles-mêmes** (`PIEGES §37` : muter la garde, pas ce qu'elle appelle ;
  `PIEGES §25` : une mutation CSS neutralisée par la spécificité est un faux positif).

**F3 et F5 sont irréductiblement à deux temps**, et leur second temps ne peut pas
être vu rouge avant — il est validé par **mutation**, pas par antériorité.

### 6. Point d'arrêt ajouté entre les lots 4 et 5

Sur remarque de `spec-reader`, et elle est juste : `F15` et `F16` (lot 4) sont le
mandat principal d'`ux-ui-designer` — les **quatre représentations qui n'existent
dans aucune référence**. Les faire relire **avant** que le lot 5 ne bâtisse ses
gardes runtime dessus évite de garder une invention qu'on rejettera ensuite.
Le cycle porte donc **trois** points d'arrêt humains : après le lot 0, à la sortie du
lot 3, et à la sortie du lot 4.

---
# Notes d'implémentation — cycle 2

## Plan (architect) — 2026-09-21

**Approche en une ligne** — Tout ce que le cycle garde se **dérive** du prototype
(`control-center/maquettes/2026-09-20-maquette-materiel-3.html`) par lecture d'artefact,
jamais par recopie ; les noms du prototype sont la clé de jointure de toutes les gardes ;
`bug-017` entre au lot 3 parce que sans lui le registre `ATTENDU_ROUGE` n'a pas de lot de
clôture à opposer à sa clause (2).

### Étapes (≤ 10)

1. **Lot 0 — `control-center/web/test_conformite_jetons.js`** [neuf, F1] : extrait le bloc
   `:root` du prototype par **analyse du texte de la règle**, pas par `grep` (`PIEGES §26`),
   et assertionne l'**inclusion** dans `app.css` au bit près + une liste déclarée
   `JETONS_AJOUTES` pour tout ajout. *(Mesuré : 24 propriétés personnalisées dans `:root`,
   dont **20 hex**, 2 ombres, 2 courbes — `sed -n '8,33p'`. La spec annonçait « 22 jetons de
   couleur » : non reproduit, l'écart est le classement des 2 ombres.)*
2. **Lot 0 — `test_conformite_animations.js`** [neuf, F2] : table des durées **et des noms**.
   Mesuré : **4** `@keyframes` (`work-orbit`, `dot-orbit`, `tick-work`, `link-flow`),
   **6** raccourcis `animation:`, **9** déclarations `transition:`, **2** `animation-delay:
   calc(var(--i) * …)` (120 ms / 95 ms), **1** bloc `@media (prefers-reduced-motion: reduce)`
   à la ligne 640 — `grep -nE '(animation|transition)[-a-z]*\s*:'` → 17 lignes.
3. **Lot 0 — `test_conformite_classes.js`** [neuf, F3a] et `test_conformite_a11y.js`
   [neuf, F4a] : parité DOM statique ↔ feuille, sur un **parseur CSS/HTML**, jamais
   `grep` (`PIEGES §26`, §27 ; mesuré : `grep -oE '\.[a-zA-Z…]'` rend **249** « classes »,
   compte faux car il capture `.2s`, `.textContent`…).
4. **Lot 0 — `test_conformite_contrastes.js`** [neuf, F5a] : matrice **dérivée** (voir §1
   ci-dessous), pas énumérée (`PIEGES §21`).
5. **Lot 0 — chaque fichier de garde** porte `ATTENDU_ROUGE`, une assertion
   d'atteignabilité bruyante, et la raison d'échec nommée par assertion. Point d'arrêt humain.
6. **Lot 1** `theme.js` + 2 suites supprimés (D3 : **-373** cas, repris de l'étape 0, non
   remesuré). **Lot 2** `app.css` (F6). **Lot 3** `index.html` réécrit (F7) **+ `bug-017`**
   (porte enfant direct de `<body>`, `inert` sur ses frères) — point d'arrêt humain.
7. **Lot 4** `diagramme.js` + `app.js` (F8, F9, F15, F16) ; `disposer()` reste l'unique
   autorité de géométrie (`ADR-0031 §4`) — point d'arrêt humain.
8. **Lot 5** volets runtime F3b/F4b/F5b + F10/F11/F12 ; F4b **compte** les contrôles
   atteignables hors modale et exige **0** (critère de `bug-017`).
9. **Lot 6** mutation (`D2`, y compris **sur les gardes elles-mêmes** — `PIEGES §37`, §25),
   docs, `CHANGELOG.md`, ADR-0038.
10. `docs/adr/0038-*.md` : ADR unique du cycle, portant **§ ATTENDU_ROUGE** et
    **§ absorption de `bug-017` au titre d'ADR-0017** (motif de forme : voir point 3).

---

## 1. La table des couples interdits — comment elle se dérive, comment F5b mesure

**Arbitrage humain non rouvert** : hex identiques au bit près, `F5` vérifie qu'aucun couple
interdit n'est **réellement peint**.

### Phase A — dérivation, jamais énumération (`PIEGES §21`)

La table n'est **pas une liste de couples écrite dans un fichier**. C'est une fonction :

```
COUPLES_INTERDITS = { (encre, fond) ∈ JETONS × JETONS |
                        contraste(hex[encre], hex[fond]) < seuil(rôle(encre)) }
```

Les trois entrées se lisent **depuis l'artefact** à chaque exécution :
- `JETONS` et `hex[]` : extraits du bloc `:root` **du prototype**, même extracteur que F1 —
  donc si le prototype change, la table change, et si `app.css` diverge, F1 tombe d'abord.
- `rôle(encre)` : **une seule énumération tenue à la main est tolérable ici**, celle du rôle
  (`texte` / `trait` / `fond`), parce qu'aucun artefact ne la porte. Elle est donc soumise à
  la clause miroir : la garde échoue si un jeton du prototype **n'a pas** de rôle déclaré —
  c'est ce qui la rend non périmable, le même patron que la clause (2) d'`ATTENDU_ROUGE`.
- `seuil` : **4,65** pour `texte` (nominal `ADR-0024 §5`, marge de 2,5 bits au-dessus du seuil
  dur 4,5), **3,0** pour `trait`.

### Ce que j'ai mesuré, et qui ne reproduit pas le chiffre de la spec

Matrice 10 encres × 5 surfaces, calculée sur les hex du prototype (WCAG 2.x relative
luminance, Python, aucun arrondi intermédiaire) :

| grandeur | mesuré 2026-09-21 | annoncé en « Décisions humaines » |
|---|---|---|
| couples sous 4,65, **50 couples bruts** | **21** | — |
| couples sous 4,65, **hors `--line` et `--line-strong`** (8 encres × 5) | **11** | **12** |
| couples sous 4,50, hors les 2 jetons de trait | **7** | **7** ✅ |
| `--line-strong` sous 3,0 | **3 surfaces sur 5** (2,976 · 2,787 · 2,609) | 3 sur 5 ✅ |

⚠️ **Le « 12 sur 50 » n'est pas reproductible** ; je mesure **11** sous la même exclusion qui
reproduit exactement le 7 et le 3/5. Je **ne corrige pas** la décision humaine — elle ne
dépend pas du compte — mais **aucun chiffre de couples interdits ne doit être écrit en dur
nulle part** : c'est précisément pourquoi la phase A est une dérivation. Le compte est une
**sortie** de la garde, pas une entrée.

**Borne au ras, nommée** : `--muted` sur `--surface-highest` vaut **4,5099**. À 4,50 il passe
de 0,0099 ; à 4,65 il est interdit. C'est le cas d'école d'`ADR-0024 §5` — la marge de
2,5 bits est ce qui décide, pas le jeton.

### ⚠️ Défaut trouvé : 9 hexadécimaux vivent **hors** du bloc `:root` du prototype

`awk 'NR>32' … | grep -oE '#[0-9a-fA-F]{3,8}'` → **9 occurrences, 8 valeurs distinctes** :
`#aaa6b0` (×2), `#fff0c8`, `#eea52a`, `#777385`, `#690005`, `#654b00`, `#4e1d12`, `#3b8f35`,
`#000` — plus un `color: white` (ligne 540).

Conséquences, toutes bloquantes pour le lot 0 :
- le critère d'acceptation « **aucun hexadécimal hors du bloc `:root`** » et la fidélité
  au prototype sont **contradictoires en l'état** ;
- ces 8 valeurs **échappent entièrement à F1**, qui ne lit que `:root` ;
- la matrice de F5a est **incomplète** tant qu'elles n'y entrent pas : `#690005` sur
  `--danger-soft` et `#654b00` sur `--amber-soft` sont des couples texte/fond réels.

**Tranché** : les 8 valeurs sont **promues en jetons `:root`** dans `app.css`, inscrites dans
la liste déclarée `JETONS_AJOUTES` avec, pour raison, **le sélecteur et la ligne du prototype
dont elles proviennent**. F1 devient donc une **inclusion stricte au bit près** (les 24
propriétés du prototype existent, identiques) **plus** une liste déclarée pour tout ajout —
pas une égalité d'ensembles, qui serait invalidée par le premier ajout légitime. La matrice
de F5a porte alors sur **28** jetons, pas 20 ; son compte est recalculé par la garde.

### Phase B — « réellement peint », mesuré en HTTP

`PIEGES §11` **ne mord pas** : `grep -c oklch` sur le prototype → **0**. `getComputedStyle`
rend donc des `rgb()` résolus, et le détour par `getImageData` n'est pas nécessaire.

Protocole de `test_app_contrastes_navigateur.py` (lot 5), déclaré `HARNAIS_NAVIGATEUR`
(`ADR-0037`, `PIEGES §50`, §54) :
1. clone jetable `cp -a` incluant `.github/` (`PIEGES §1`), serveur sur un port **> 8800**
   (`PIEGES §2`), **relancé** après dépôt des fichiers (`PIEGES §8`), page chargée en
   **HTTP** — un harnais `file://` ne prouve rien (`PIEGES §10`) ;
2. parcours de **tout nœud portant du texte non vide** : `color` calculée, puis remontée des
   ancêtres jusqu'au premier `background-color` dont l'alpha ≠ 0 — le **fond effectivement
   peint**, jamais la règle qui le déclare (`PIEGES §24`) ;
3. chaque couple `rgb` est **réapparié à ses noms de jetons** via la table `:root` lue au
   runtime ; un couple peint qui ne correspond à **aucun** jeton est un **échec** (c'est ce
   qui attrape un hex codé en dur réintroduit) ;
4. assertion : `COUPLES_INTERDITS ∩ couples_peints = ∅`, et **le compte de nœuds visités est
   assertionné non nul** — sans quoi la garde est verte à vide.
5. Les traits (`border-color`, `stroke`) sont parcourus séparément au seuil 3,0.

**Mutation qui doit la tuer** (`PIEGES §25`, §37) : poser `color: var(--teal)` sur un texte
de `--surface-high` (couple mesuré **4,09**, interdit). Vérifier d'abord la **spécificité**
de la règle mutée, sinon le mutant ne se propage jamais jusqu'au rendu et la revue conclut
à tort.

**Par où on atteint cette garde, et ce qui l'en empêcherait** : elle n'est atteignable qu'en
HTTP sur un serveur **relancé**, et seulement si `app.css` est servi (extension dans
`_TYPES`, nom hors `test_`). Elle serait livrée **morte** si elle lisait le prototype depuis
`docs/` — que le clone ne copie pas (`PIEGES §32`) : elle lit
`control-center/maquettes/2026-09-20-maquette-materiel-3.html`, et **échoue bruyamment** si
le fichier est absent ou vide, au lieu de se sauter.

---

## 2. Verdict ADR — le registre `ATTENDU_ROUGE`

**ADR REQUIS — oui. Quatre critères sur quatre, et un seul suffit.**

| Critère | Rempli ? | Établissement |
|---|---|---|
| 1. Contrainte structurante imposée ailleurs | **oui** | Le registre s'impose à **tout fichier de garde** des 7 lots, et à la règle de sortie de lot (« le dépôt est vert à la sortie de chaque lot ») qu'il **redéfinit** : vert veut désormais dire « aucune régression hors registre **et** aucune entrée périmée ». Tout cycle ultérieur qui écrit une garde avant son code hérite de ce régime. |
| 2. Décision invisible dans le code | **oui** | La table `ATTENDU_ROUGE = {…}` est visible ; ce qui ne l'est pas, c'est que ce régime est **borné à une refonte multi-lots** et n'est pas une licence générale à committer du rouge. Sans ADR, la première lecture d'un `ATTENDU_ROUGE` par un cycle futur en fait un patron d'amnistie — exactement ce que la clause (2) combat. |
| 3. Alternatives crédibles | **oui** | Deux, déjà nommées et écartées par l'humain : une **branche à fenêtre rouge déclarée** (perd la trace datée, rend la reprise aveugle) ; **garder les gardes en arbre de travail** jusqu'au lot qui les verdit — refusée, c'est l'invitation à ajuster la garde au code, le vice mesuré de `bug-022` (`PIEGES §50` : quatre reboucles). |
| 4. Verrouillage long terme | **oui** | Il inverse la charge : la garde se commite **avant** le code qu'elle garde. C'est un engagement de méthode qui survit au cycle, et la réponse directe à la leçon de `feature-020` (59 cases à `[ ]` pour ~40 livrables faits). |

**Forme** : **section d'ADR-0038**, pas un ADR séparé — même geste, même cycle, mêmes
mesures que l'absorption de `bug-017` (voir point 3). Précédent du dépôt :
`ADR-0024 §3`, `ADR-0021`, `ADR-0035`, `ADR-0018` portent tous une décision de régime **en
section** de l'ADR substantiel de leur cycle.

⚠️ **Ce que l'ADR doit graver et qui manque à la définition actuelle** : le registre est
**borné dans le temps**. Une entrée sans **lot de clôture nommé** est un échec de la garde
au même titre qu'une entrée périmée — sinon « le lot qui la ferme » redevient déclaratif.
C'est le point qui rend le verdict 3 ci-dessous mécanique.

---

## 3. `bug-017` — ABSORBÉE, au titre d'ADR-0017

**Verdict : absorbée dans ce cycle, traitée au lot 3, avant la sortie du point d'arrêt
humain.** Le critère d'`ADR-0017` est **mécanique**, pas prudentiel, et il est rempli :

**État mesuré du défaut, aujourd'hui** : `grep -rn "inert" control-center/web/*.{js,html,css}`
(hors `test_`) → **1 seule occurrence**, et c'est un **commentaire** d'`app.js:2216` qui dit
que le défaut *n'est pas corrigé* : « *inerte au clavier) n'est pas corrigé — rebâtir une
modale ici exposerait* ». Aucun mécanisme d'inertie n'existe dans le module.
*(Le chiffre « jusqu'à **6** contrôles atteignables » est repris de `bug-017` — **non
remesuré ici**, il exige un harnais HTTP + Chromium.)*

**Pourquoi ce n'est pas reportable** — l'argument décisif est le registre du point 2 :

1. `F4b` est la garde de contrat d'accessibilité au runtime. Son assertion exacte, imposée
   par `bug-017`, est « **0** contrôle atteignable hors modale ». Avec le défaut ouvert,
   cette assertion est **fausse au lot 5**.
2. Elle doit donc entrer au registre `ATTENDU_ROUGE` — et une entrée du registre exige
   **le lot qui la ferme**. Si `bug-017` est hors cycle, **aucun lot ne la ferme** : l'entrée
   est inexpirable, la clause (2) ne peut jamais se déclencher sur elle, et le registre
   devient l'amnistie qu'il est conçu pour empêcher. La garde n'est pas contournée : elle est
   **désarmée par construction**.
3. Aggravant, structurel : le correctif exige que la porte soit **enfant direct de `<body>`
   et au-dessus de toute section**. Cette structure est décidée au **lot 3**, qui est un
   **point de non-retour visuel** validé par l'humain. La reporter, c'est soit rouvrir
   `index.html` après le point de non-retour, soit livrer une porte à laquelle l'inertie
   n'est plus attachable sans refaire le lot 3.
4. `feature-021` a **déclaré** le mécanisme en `U5` sans le livrer (journal 2026-09-19 21:44).
   Livrer un second cycle qui réécrit le même fichier en laissant U5 déclaré et non livré,
   c'est le cas nominal d'« une protection annoncée qui ne s'applique pas » d'`ADR-0017`.

**`ADR-0017` suffit-il ? — Oui comme règle, non comme trace.** Mesuré : sur les **4**
absorptions déjà pratiquées par ce dépôt (`bug-008`/`bug-009` → `ADR-0018` ;
`bug-016` → `ADR-0024 §3` ; `bug-013` → `ADR-0023`/`ADR-0021` ; `bug-019` → `ADR-0035 §`),
**aucune n'a reçu d'ADR dédié** : chacune est une **section datée de l'ADR substantiel du
cycle**, et `CLAUDE.md` exige seulement que la décision soit « écrite dans un ADR — pas
subie ». Donc : **pas d'ADR pour « un cycle à deux specs »** ; une **section
« Absorption de `bug-017` au titre d'ADR-0017 » dans ADR-0038**, portant les 4 points
ci-dessus et l'état mesuré du défaut.

**Conséquences de procédure** : `git mv specs/features/todo/bug-017-*.md specs/features/doing/`
(déplacement, jamais copie) ; deux specs dans `doing/`, ce que `check_specs.sh`
**n'interdit pas** (`ADR-0017`, Conséquences) ; **une seule** phase de test / revue / doc.
Les critères d'acceptation de `bug-017` s'ajoutent à ceux de `feature-021`, dont
« le focus revient à un endroit **nommé** » et la validation par mutation du mécanisme
d'inertie (retirer `inert` doit tuer le test — `PIEGES §37` : muter **la garde**, pas
`showModal()` qu'elle appelle).

---

## 4. Le contrat de `F2` — les noms du prototype sont normatifs

**Tranché : OUI. L'implémentation reprend les noms de classes ET les noms de `@keyframes`
du prototype, à l'identique.** C'est la décision la plus structurante du lot 0.

**Raison mécanique** : `F2` compare des tables `(nom → durée, délai, courbe)` et `F3` des
ensembles de classes. Deux tables ne se comparent que par une **clé**. Sans identité des
noms, la seule comparaison possible est « le multi-ensemble des durées est le même », qui
est vrai pour n'importe quelle permutation — une garde verte à vide. `F3` dégénère
symétriquement en « le nombre de classes est le même ».

**Ce qui est normatif, mesuré** :
- **4** noms de `@keyframes` : `work-orbit`, `dot-orbit`, `tick-work`, `link-flow` ;
- les noms de classes du sous-arbre du disque : `agent-node`, `agent-wrap`, `agent-face`,
  `agent-code`, `agent-data`, `agent-meta`, `agent-name`, `agent-duration`, `work-orbit`,
  `work-dot`, `tool-ticks`, `file-dots`, et les liens `link-flow`, `link-front`,
  `link-front-sec`, `link-front-tests`, `link-reprise`, `link-sec-front`, `link-spec-front`,
  `link-tests-front` ;
- les **3** classes d'état : `state-pending` (8 occ.), `state-active` (17), `state-done` (7) ;
- les 2 courbes nommées `--spatial` / `--effects`, qui sont déjà des jetons (F1 les couvre).

**Ce que ça impose au `frontend-developer`** — à écrire tel quel dans son brief :
1. **Interdiction de renommer**, y compris pour se conformer au préfixe `dg-` hérité de
   `diagramme.js`. Le préfixe `dg-` disparaît **avec** le diagramme qu'il nommait
   (`ADR-0031 §1` révoque `ADR-0025 §1-§3` et `ADR-0026`). Le contrat `disposer()` maintenu
   par `ADR-0031 §4` continue de **calculer** la géométrie ; il **émet désormais les noms du
   prototype**. C'est un changement de sortie de `disposer()`, à traiter au lot 4, pas une
   liberté de nommage.
2. **Toute classe et tout `@keyframes` en plus** — et il y en aura, `F16` en exige quatre —
   figure dans une **liste déclarée** (`CLASSES_AJOUTEES`, `KEYFRAMES_AJOUTES`) **avec sa
   raison**, exactement comme `JETONS_AJOUTES` pour F1. La garde échoue sur tout nom hors
   prototype **et** hors liste : c'est la clause miroir, encore.
3. **La parité se mesure par parseur, pas par `grep`** (`PIEGES §26`) : mesuré,
   `grep -oE '\.[a-zA-Z…]'` rend **249** « classes » sur le prototype, chiffre faux — il
   capture `.2s`, `.textContent`, `.34`. `F3a` qui utiliserait ce compte serait rouge pour
   la mauvaise raison, ce qu'interdit le point 5 des décisions humaines.
4. **Une règle CSS vide ne protège rien** (`PIEGES §33`) : déclarer `.agent-face{}` pour
   « faire la parité » ne fait échouer aucune mutation. `F3` doit exiger que la classe porte
   **au moins une déclaration**, sinon elle garde une intention.

---

## 5. `F15` — le centre du disque sans jetons

**Rappel du texte qui autorise la dégradation** : `ADR-0031 §5` conclut « *cela supprime la
dépendance de l'anneau aux tokens […] seul le chiffre du centre dégrade alors, pas
l'anneau* ». Livrer le centre sans chiffre n'est donc **pas** un écart à `ADR-0031 §2`,
c'est le cas que son §5 a explicitement prévu. Aucun ADR à rouvrir.

**Contrainte mesurée qui commande la conception** : `0 token sur 14 372 événements` du
journal (repris de la refondation du 2026-09-20, non remesuré). Au lot 4, l'absence n'est
donc **pas un cas limite : c'est le cas nominal, et le seul atteignable**.

**Conception retenue — deux variantes de centre, pas un emplacement vide** :

| | variante livrée par ce cycle | variante livrée par `feature-023` |
|---|---|---|
| contenu | **sigle seul**, centré sur les deux axes du disque | sigle + `input+output` sur deux lignes |
| DOM | le nœud du chiffre **n'existe pas** | le nœud existe |
| sélection | classe déclarée `agent-face--sigle-seul` | classe du prototype |

Trois règles, chacune avec la garde qui la tient :
1. **Jamais de zéro faux** : l'absence de donnée et la valeur zéro sont deux états
   distincts. Le nœud du chiffre étant **absent du DOM** (et non vide, ni `—`, ni `0`),
   aucune lecture ne peut les confondre. `F4b` assertionne l'**absence du nœud**, pas son
   contenu — une assertion sur le texte passerait à tort (`PIEGES §27`).
2. **Jamais de trou** : l'espace du chiffre n'est **pas réservé**. Le centrage est une
   variante de mise en page calculée par `disposer()` (`ADR-0031 §4`), pas un
   `visibility:hidden` — qui laisserait le trou (`PIEGES §15`).
3. **La branche « présence » n'est PAS écrite dans ce cycle.** Elle serait **livrée morte** :
   aucune donnée ne peut l'atteindre avant `feature-023` et son GATE. L'écrire, ce serait
   livrer du code non exercé et une garde verte à vide. Elle appartient à `feature-023`,
   qui porte déjà la migration `agent-face--sigle-seul` → variante à deux lignes.
4. **Le diamètre ne change pas** : 52/88 px selon l'état (`ADR-0031 §2`) — l'absence du
   chiffre ne rétrécit rien, donc rien ne signale visuellement le manque.
5. **La bottom sheet (`F11`) dit ce qui manque et pourquoi**, en une phrase : c'est le
   pendant de la réserve déjà écrite (« ce chiffre mesure le travail, pas le coût »).

**Mutation qui doit tuer la garde** : faire émettre `0` par le centre. Si `F4b` reste verte,
elle n'assertionne pas l'absence mais une chaîne — le défaut de `PIEGES §27`.

---

## 6. `F16` — ce qui contraint les quatre représentations à inventer

Je **ne dessine rien** : c'est le mandat d'`ux-ui-designer`. Voici le cadre, mesuré, à
mettre dans son brief. Les quatre manques sont ceux d'`ADR-0031 §3` : **l'échec**, le
**« sans clôture »**, **l'agent principal**, la **règle de non-chevauchement des libellés**.

### Grammaire disponible (mesurée sur le prototype, rien d'autre n'existe)

- **3** classes d'état seulement : `state-pending`, `state-active`, `state-done` — aucune
  quatrième. Le prototype n'a **jamais eu** à représenter un échec.
- **4** `@keyframes`, **2** courbes (`--spatial`, `--effects`), **1** bloc
  `prefers-reduced-motion` (ligne 640) qui devra couvrir tout mouvement neuf (`F14`).
- Formes occupées et **non disponibles** : le diamètre (état, `ADR-0031 §2`), les **12**
  graduations (fixes, ne dénombrent plus rien), les **3** pastilles (binaires), l'anneau
  (activité, **jamais** une progression — `ADR-0031 §5`), le centre (sigle, cf. point 5),
  le nom au-dessus, la durée en dessous.
- Formes **libres** : le contour du disque, le fond du disque, le halo (`box-shadow`),
  le motif de trait des liaisons, et l'espace **autour** du nom.

### Jetons utilisables sans en ajouter un seul

Mesuré (`grep -o 'var(--X)' | wc -l`) : **`--amber` a 0 usage** dans tout le prototype, alors
qu'il est déclaré — c'est le jeton **libre**, disponible sans rien ajouter.
`--danger` (4 usages) et `--danger-soft` (1) sont déjà pris par la priorité haute, le menu et
le bouton de confirmation ; `--coral` 4 ; `--teal` 11 ; `--line-strong` 2 ; `--primary-ink` 7.

**Règle imposée par `F1`** : tout jeton supplémentaire figure dans `JETONS_AJOUTES` **avec sa
raison**, et ses contrastes entrent automatiquement dans la matrice de `F5a` — un jeton neuf
peut donc **rendre la garde rouge par sa seule déclaration**. C'est voulu.

### Refusé d'avance — à écrire dans le brief, pas à découvrir en revue

1. **Toute information portée par la seule couleur.** Mesuré à l'étape A : 3 informations
   dans ce cas, à **1,370:1** — exactement le contraste de `--line` que je remesure
   (1,37 sur `--bg`). Chaque représentation neuve porte **une seconde dimension** (forme,
   motif, glyphe, texte).
2. **Tout hexadécimal hors `:root`.** Critère d'acceptation déjà écrit ; et le prototype
   lui-même le viole **9 fois** (voir point 1) — ce n'est donc pas une licence héritée.
3. **Tout couple de la table du point 1.** Une croix `--coral` sur `--surface-high` vaut
   **4,32** : interdite avant même d'être dessinée.
4. **Toute réutilisation des graduations pour compter quoi que ce soit** — `ADR-0031 §2`
   les grave fixes ; y remettre les appels d'outils rouvre la révocation.
5. **Tout retour d'une progression sur l'anneau** (`ADR-0031 §5`).
6. **Tout indicateur « sans clôture » dérivé d'une fin non observée.** `PIEGES §17` :
   `SessionEnd` ne part jamais sur une session longue, ~85 % des cycles portent
   « fin non observée » ; une représentation fondée là-dessus serait **livrée morte**. Elle
   se dérive du seuil **additif et déclaré** d'`ADR-0021`, pas de l'absence d'événement.
7. **Toute `@keyframes` neuve sans entrée dans `KEYFRAMES_AJOUTES`** et sans repli
   `prefers-reduced-motion`.
8. **Toute règle CSS vide « pour la parité »** (`PIEGES §33`).

### La quatrième — le non-chevauchement — n'est pas un dessin, c'est un contrat

Elle appartient à `disposer()` (`ADR-0031 §4`), pas à la feuille. Deux pièges **mesurés** la
gouvernent, à citer au `test-engineer` :
- `PIEGES §31` : un attribut de présentation SVG **perd** contre toute règle de classe. La
  garde lit `getComputedStyle`, **jamais** l'attribut posé par le code.
- `PIEGES §30` : la garde **recopie la formule de mesure de texte à la main** ; si elle
  appelle `disposer.texteDuree()`, elle s'accorde avec la fonction sous test quoi qu'il
  arrive et reste verte quand le texte peint diverge.

---

## 7. Verdict ADR global

**ADR REQUIS — oui. Quatre critères sur quatre.** Un **ADR unique**, `ADR-0038`, portant
l'ensemble du cycle 2 ; **prochain numéro libre mesuré** : `ls docs/adr/ | tail -1` →
`0037-un-harnais-navigateur-se-declare-et-ne-tourne-qu-une-fois.md`, donc **0038**.

| Critère | Rempli ? | Établissement |
|---|---|---|
| 1. Contrainte structurante imposée ailleurs | **oui** | Le régime « les noms du prototype sont la clé de jointure » (point 4) et « toute liste se dérive, tout ajout se déclare » s'imposent à `feature-022`, `023`, `025`, qui bâtissent sur **la même** maquette (F0 la partitionne). Un de ces cycles qui renommerait une classe casserait F2/F3 du cockpit. |
| 2. Décision invisible dans le code | **oui** | Trois décisions ne laissent **aucune trace** dans le code livré : que les hex restent identiques **malgré** 11 couples sous 4,65 (le code montre les hex, pas le conflit arbitré) ; que la branche « centre avec chiffre » est **délibérément non écrite** (point 5) ; que le registre est **borné à cette refonte** (point 2). |
| 3. Alternatives crédibles | **oui** | Baisser le seuil à 4,5 (**refusée**, `ADR-0024 §5`) ; scinder en `feature-026` (**refusée**, les gardes ne prouvent qu'entières) ; reporter `bug-017` (**refusée**, point 3) ; garder les gardes hors dépôt jusqu'à leur lot (**refusée**, vice de `bug-022`). Chacune était défendable ; leur refus se justifie par une mesure, pas par un goût. |
| 4. Verrouillage long terme | **oui** | La conformité au prototype devient **mesurée, plus jugée** : tout cycle futur touchant le cockpit doit soit passer les 5 gardes, soit réviser cet ADR. Et la garde se commite désormais **avant** le code qu'elle garde. |

**Sections obligatoires d'`ADR-0038`** :
`§1` la fidélité prime, l'usage se restreint (table dérivée, 9 hex hors `:root` promus) ·
`§2` le registre `ATTENDU_ROUGE`, borné, avec sa clause (2) et le lot de clôture obligatoire ·
`§3` **absorption de `bug-017` au titre d'ADR-0017** ·
`§4` les noms du prototype comme clé de jointure ·
`§5` ce que le cycle **ne livre pas** (branche « centre avec chiffre ») et pourquoi.

**ADR non touchés, confirmés** : `ADR-0006` (0 dépendance), `ADR-0003` (colonnes),
`ADR-0017`, `ADR-0031` (le point 5 est son §5, pas un écart), `ADR-0024 §5` (le seuil 4,65
n'est pas renégocié), `ADR-0037`.

## Points d'attention

- ⚠️ **Le « 12 sur 50 » de la section « Cycle 2 — décisions humaines » n'est pas
  reproductible** : je mesure **11** (et **21** bruts). L'arbitrage humain n'en dépend pas ;
  **aucune garde ne doit citer ce nombre** — il est une sortie, pas une entrée.
- ⚠️ **« 22 jetons de couleur »** (Grandeurs mesurées) n'est pas reproductible non plus :
  **24** propriétés personnalisées dans `:root`, dont **20** hex.
- `PIEGES §7` : tout identifiant neuf entre dans la liste `IDS` de `test_app_bug012.js`,
  sinon la suite mesure autre chose **en silence**.
- `PIEGES §38` : une sonde `vm` ne voit que les ids du HTML **statique**. Les gardes runtime
  (F3b, F4b, F5b) sont des **harnais navigateur**, pas des sondes `vm`.
- `PIEGES §32` : la baisse de **-373** cas au lot 1 est déclarée légitime (D3), et tout
  compte mesuré en clone se compare à `docs/` près.
- `PIEGES §29` : ne pas cloner pendant la campagne de mutation d'un autre agent.

## Tests à prévoir

- F1 : inclusion bit-à-bit des 24 propriétés `:root` + `JETONS_AJOUTES` non vide justifié.
- F2 : 4 `@keyframes`, 6 `animation:`, 9 `transition:`, 2 `animation-delay`, par nom.
- F3a/F3b : parité par parseur, dans les deux sens, règle vide = échec (`PIEGES §33`).
- F4b : **compte** de contrôles atteignables hors modale = **0** (`bug-017`), en HTTP.
- F5a : matrice dérivée, rôle manquant = échec. F5b : couples peints, en HTTP, `rgb` résolus.
- D2 : mutation **des gardes elles-mêmes** (`PIEGES §37`), spécificité vérifiée avant toute
  mutation CSS (`PIEGES §25`), un mutant par invocation (`PIEGES §35`).
