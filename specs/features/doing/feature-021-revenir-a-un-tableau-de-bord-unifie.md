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
- [ ] F1 — garde de **table des jetons** : noms et valeurs hex, égalité stricte avec le prototype
- [ ] F2 — garde de **table des durées** : animations et transitions, durée, délai, courbe
- [ ] F3 — garde de **parité des classes**, dans les deux sens
- [ ] F4 — garde de **contrat d'accessibilité** : `id`, `role`, `aria-*`, comptes de `<dialog>`
- [ ] F5 — garde de **contrastes** : matrice jeton × surface complète, seuil 4,65 texte / 3,0 trait

### Implémentation
- [ ] F6 — système visuel M3 : `:root`, surfaces tonales, élévations, typographie, focus 3 px, cibles 48 px
- [ ] F7 — structure mono-écran ; **0** `role="tab"` de navigation
- [ ] F8 — graphe d'agents : disques, anneau d'activité, 12 graduations, 3 pastilles, durée
- [ ] F9 — animations d'enchaînement, aux durées et courbes exactes
- [ ] F10 — kanban 3 colonnes **lues depuis `/api/etat.colonnes`**, défilement vertical commun
- [ ] F11 — bottom sheet de détail d'un passage, qui **dit ce que le chiffre compte**
- [ ] F12 — cas limites non traités par la maquette : dépôt vide, serveur injoignable, écriture désactivée, bornage déclaré
- [ ] F13 — thème sombre retiré : `theme.js`, tests et règles CSS associés
- [ ] F14 — `prefers-reduced-motion` : animations continues supprimées, état final compréhensible

### Tests et docs
- [ ] D1 — suites JS réécrites ; ⚠️ la liste `IDS` de `test_app_bug012.js` gagne tout identifiant neuf (`PIEGES §7`, sinon vert à tort)
- [ ] D2 — tests neufs validés **par mutation**
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
