## Métadonnées
- **ID** : feature-020
- **Slug** : conformite-du-diagramme-a-la-maquette
- **Type** : feature
- **Statut** : done
- **Priorité** : haute
- **Version cible** : 0.11.1
- **Dernière mise à jour** : 2026-09-19
- **Spec(s) liée(s)** : prolonge feature-017 (close) ; donne lieu à ADR-0026, qui
  remplace quatre points d'ADR-0025 §1 ; absorbe deux défauts trouvés en analyse
  (liseré invisible, sigle « ?? »)

## Domaines touchés
- [x] Frontend (écrans, composants, appels API)

## Agents requis
- [x] spec-reader
- [x] ux-ui-designer — **AVANT architect** : sept arbitrages conditionnent le contrat géométrique
- [x] architect
- [x] frontend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Description

Rendre le diagramme de déroulé **conforme à la maquette de référence**
(`control-center/maquettes/2026-09-15-diagramme-reference.html`), arbitrer les
points où celle-ci contredit une décision écrite, et corriger deux défauts
trouvés en chemin.

## Contexte

Troisième itération sur la même demande. L'utilisateur a formulé l'exigence
ainsi : **« Je veux la même chose que la maquette, pas une adaptation. »** Les
deux itérations précédentes ont procédé par retouches successives jugées à
l'œil — d'où la reprise, et d'où l'exigence centrale de ce cycle : **faire de
« identique » une mesure, pas un jugement** (livrable E1).

Deux des écarts actuels sont des **régressions introduites pendant la revue de
feature-017** : le rebranchement de `traitsCercle()` (cercles en tirets et en
pointillés, absents de la maquette) et le passage du sigle à `--texte-faible`.
Elles ont été demandées par `code-reviewer` raisonnant depuis la spec
`feature-017` §7, sans confrontation à la maquette. Le conflit spec ↔ maquette
n'avait jamais été tranché : ce cycle le tranche.

### Faux ami à ne pas reproduire

Dans la maquette, `a.f` est le **nombre de fichiers écrits**, pas un échec
(colonne « Fichiers », l. 244-247). La maquette n'encode donc **aucun état** :
ni échec, ni agent sans clôture. L'appliquer à la lettre ne retire pas une
redondance — ça retire les deux signaux.

## Décisions prises (utilisateur, 2026-09-15) — à ne pas rouvrir

- **D1 = F-2 — « nominal identique, signal en plus si anormal ».** Un agent
  terminé sans échec est pixel pour pixel celui de la maquette : contour plein
  sur le jeton équivalent à `bd2`, sigle en couleur d'identité, aucun
  pointillé. Seuls l'**échec** (croix + contour `--alerte`) et l'état **sans
  clôture** (pointillé) ajoutent un signal que la maquette ne connaît pas.
  **L'agent principal quitte les tirets** — il est présent dans presque tout
  cycle, donc trop fréquent pour être une exception ; il se distingue par son
  fond et par un sigle dédié.
- **D2/D3/D5 = la maquette prime partout.** Les trois points où `ADR-0025 §1`
  contredit la maquette sont alignés **sur la maquette**, et un ADR neuf
  remplace `ADR-0025 §1` sur ces paragraphes : nombre de graduations, formule
  du rayon, encodage du liseré des fichiers.
- **D8 = format des durées aligné sur la maquette, diagramme ET table des
  passages.** Décidé après coup, sur écart trouvé par `test-engineer` en
  capture headless : le kit écrivait `1 min 7 s`, la maquette écrit
  `1 min 07` (secondes sur deux chiffres, sans suffixe) et `8 s` au lieu de
  `8.2 s`. **Élargissement assumé du périmètre** : la table des passages était
  déclarée hors champ ci-dessous, l'utilisateur a tranché « aligner partout »
  pour ne pas laisser deux écritures de la même grandeur dans le même écran.

### Trois écarts à la maquette introduits délibérément, sur mesure

La maquette est la référence **dans le domaine qu'elle couvre**. Trois fois,
une mesure sur données réelles a montré qu'elle n'y suffisait pas. Ces écarts
sont nommés, pas subis :

| Point | Maquette | Retenu | Mesure qui le motive |
|---|---|---|---|
| Pastille d'attente | `rect` 54×18 | **86×18**, texte borné à 12 caractères | `"attente 4m"` mesuré à **58,61 px** dans la police réellement résolue : la maquette déborde sa propre boîte |
| Rayon | `11 + 0,80·√s`, sans plafond | idem, **plafonné à 56 px** | Le journal réel porte un segment de **33 186 s** → 156,7 px de rayon, soit 313 px de diamètre. Le plafond mord à 3 164 s ; le plus long sous-agent réel (2 560 s) n'est jamais écrêté |
| Durées ≥ 1 h | aucune branche « heures » (la plus longue vignette fait 66 min) | format maquette sous 60 min, **forme en heures au-dessus** | `dur()` écrirait `553 min 06` pour le segment de 33 186 s. `app.js` porte déjà le principe inverse dans le commentaire de `dureeDepuisIso` : « un segment mort depuis des heures s'exprime en heures, jamais en minutes à quatre chiffres » |

## Comportement attendu

Le tracé reproduit `pose()` (l. 164-181) et `graphe()` (l. 152-215) de la
maquette, à la correspondance de jetons près (la maquette n'a pas la palette du
kit), avec les seuls ajouts décidés en D1.

### Correspondance de jetons — mesurée, à ne pas redériver

| Maquette | Kit | Rôle |
|---|---|---|
| `T.bd` (le plus clair) | `--trait-fin` | anneau guide, contour de pastille |
| `T.bd2` (le plus sombre) | `--trait` | graduations éteintes, contour de cercle inactif, liens |
| `T.t3` | `--texte-faible` | heure, nom d'agent, barre grise du zéro |
| `T.t2` | `--texte-doux` | — |
| `T.tx` | `--texte` | durée (vedette du socle) |
| `T.bloc` / `T.creux` | `--creux` | fond de pastille, barre blanche du zéro |
| `T.cadre` | `--trait` | filet du cadre de groupe parallèle |
| `T.ye` | `var(--a-debugger)` | arc de rebouclage |

## Comportement actuel — table des divergences (A → W)

Vérifiée par l'orchestrateur contre les deux fichiers. **A, B, E, H, U sont des
défauts** ; les autres sont des écarts de conformité.

| # | Maquette | Rendu actuel |
|---|---|---|
| **A** | Un seul `stroke-dasharray` dans tout le fichier (l. 209, l'arc). Contour toujours `a.act ? c : bd2`, plein | `dg-contour-pointille` (`2 3`) / `dg-contour-tirets` (`6 4`) posés par `traitsCercle()` (`app.js:762-772`) — **régression de revue** |
| **B** | Sigle `fill: c`, toujours la couleur d'identité (l. 180) | `traits.couleurTexte` → `--texte-faible` pour le principal (`app.js:770`) — **régression de revue** |
| **C** | `TK = r<22 ? 24 : r<32 ? 36 : 52` (discret) | `floor(2πr/7)` borné `[8,40]` (`diagramme.js:217-225`). À r=56 : **52 attendus, 40 rendus** |
| **D** | Départ **2,4°**, pas `(360−4,8)/TK`, **TK** divisions → trou de 4,8°+pas | Départ **10°**, pas `340/(total−1)` → trou de **20°**. *(Le repère n'est pas en cause : `pointCercle` est équivalent au `-90+…` en cos/sin.)* |
| **E** | guide = `bd` (clair), graduations éteintes = `bd2` (sombre) | **inversé** : guide = `--trait`, éteintes = `--trait-fin` (`app.js:783`, `app.js:798`). Même inversion sur `--texte-doux` là où la maquette met `t3` |
| **F** | N'encode **aucun** état (`a.f` = fichiers, pas échec) | contour `--alerte` + croix, pointillé « sans clôture » → **tranché en D1** |
| **G** | — | Sigle de l'agent principal = « ?? » : `collecterRoles` (`app.js:1181-1188`) ne parcourt pas le segment principal (`AGENT_PRINCIPAL = "(agent principal)"`, `backend/events.py:57`). `sigleAgent()` rendrait « (A » |
| **H** | Disque (l. 174) **puis** anneau des fichiers (l. 176) | Liseré peint **avant** le disque opaque (`app.js:824-841`) → **invisible**. Une des trois grandeurs d'ADR-0025 n'existe à l'écran nulle part |
| **I** | Anneau **1 px fixe**, opacité `0.22+min(f,8)/8*0.45` | épaisseur variable 1,5→6 px, opaque |
| **J** | Longueur `on ? 7 : 3.2` — la graduation **allumée** est longue | `estBorne ? 7 : 3.2` — la **première et la dernière** sont longues (encoche de zéro / cran de plafond) |
| **K** | Agent actif : `stroke: c` (identité) + largeur 1,8 | contour `--trait` ; seul l'anneau change. Heurte §8 (« l'identité ne va jamais sur un contour ») |
| **L** | heure 10,5 `t3` / **durée 12,5 `tx` graissée** / nom 10,5 `t3` — la durée est la vedette | trois lignes à 10 px ; `app.css:732` met `--texte` + `--mono` sur le **nom** |
| **M** | `HH:MM` | `HH:MM:SS` (`app.js:25-29`, `diagramme.js:240-244`) |
| **N** | Deux lignes centrées sur `cy` (`cy−3` / `cy+12`) | trois `tspan` qui **partent** de `cy` et descendent (`app.js:926-938`) |
| **O** | Rect **pleine largeur de créneau**, `rx:9`, **`fill:none`**, + libellé « N agents en parallèle » sur un rect de masquage | rect **autour des seuls cercles**, **sans `rx`**, **rempli `--creux`** (masque le lien), **sans libellé** (`app.js:900-917`). §9 interdit l'aplat là où un filet suffit |
| **P** | bord de **créneau** → bord de créneau, sur un **axe unique** | bord de **cercle**, à la moyenne des `cy` (`app.js:963-966`). La pastille, elle, est calée sur les bords de créneau → **le trait et sa pastille ne partagent pas le repère** |
| **Q** | `attente 4m`, rect **54×18** fixe | `"⏳ " + texteDuree(ms)`, largeur mesurée. L'émoji dépend de la fonte disponible |
| **R** | Sommet à **`y=16` absolu**, couleur **fixe** `T.ye`, **aucune pointe**, libellé à `y=12` | sommet `min(y1,y2) − hauteurArc`, couleur d'identité, **plus une pointe**. *Le sommet absolu doit venir de `disposer()`, jamais d'`app.js` (bug-020)* |
| **S** | Titre « Déroulé » + phrase « l'écart horizontal sert la lisibilité, il ne mesure pas le temps », `radius 6`, **deux voiles de dégradé** latéraux | `radius 2`, pas de titre, pas de voiles (`app.css:704-709`) |
| **T** | 5 entrées en ligne | `<dl>` en grille, **8 entrées**, dont 4 décrivant des motifs de trait |
| **U** | — | **7 classes mortes** (`.dg-anneau-fantome`, `.dg-graduation`, `.dg-graduation.borne`, `.dg-liseret`, `.dg-cercle`, `.dg-croix-echec`, `.dg-anneau-en-cours`, `.dg-sigle`, `app.css:713-725`) ; `.dg-guide` posée mais **jamais déclarée**. Le CSS décrit un rendu qui n'a pas lieu → toute mutation dessus est un faux positif (PIEGES §25) |
| **V** | — | **Contradiction préexistante** : `DESIGN-SYSTEM` §5 dit « pointillé + croix = échec », §8 dit « pointillé = sans clôture », `feature-017` §7 disait un troisième sens. À lever quelle que soit l'issue |
| **W** | `r = 11 + √(durée_s)·0,80` | `[20,56]` plafonné à 20 min (ADR-0025 §1) → **tranché : maquette** |

## Contraintes techniques

- **SVG écrit à la main** (ADR-0006), aucune bibliothèque, aucune dépendance neuve.
- **Toute géométrie vient de `disposer()`** — `pastille.cx` et `hauteurArc`
  (bug-020, bug-021, ADR-0025 §4), et désormais aussi : extrémités réelles des
  liens, axe commun, boîte du cadre et de son libellé, sommet et ancrage du
  libellé d'arc, gabarit de pastille, textes de socle. Chaque champ ajouté doit
  servir **à la fois** la réservation d'espace et le rendu.
- **`diagramme.js` reste pur** : aucun DOM, aucune couleur, aucun style, aucun
  nombre qui ne vienne de `passages[]`.
- **L'arc et son libellé ne sortent jamais du viewBox**, quelle que soit la portée.
- **Aucun hexadécimal hors du `:root` de `app.css`** (§9). Le SVG lit `var(--…)`
  via `.style`, jamais via un attribut de présentation.
- **Un seul tracé pour deux thèmes**, sans règle dupliquée, suivant une bascule
  sans rechargement.
- **Aucun chiffre affiché qui ne soit dans le journal** — en particulier, pas de
  jetons.
- Ne touche ni `construireChaineEtNotes`, ni la table des passages, ni les
  chantiers `feature-019` / `/api/etat` / marge ADR-0024, en revue par ailleurs.

## Fichiers potentiellement concernés

- `control-center/web/diagramme.js` — contrat de sortie élargi
- `control-center/web/app.js` — rendu SVG, légende, collecte des sigles
- `control-center/web/app.css` — classes mortes, piste, voiles
- `control-center/web/index.html` — titre de zone
- `control-center/web/test_app_diagramme.js` + `.py`, `test_app_accordeon.js` + `.py`

## Livrables — check-list

```
[x] D1 — ✅ TRANCHÉ (utilisateur) : F-2, nominal identique + signal réservé à l'anormal
[x] D2 — ✅ TRANCHÉ (utilisateur) : liseré = opacité, anneau 1 px (maquette)
[x] D3 — graduations 24/36/52 ✅ TRANCHÉ (maquette) ; longueur allumée-vs-borne (J)
    ✅ TRANCHÉ EN COURS DE CYCLE : maquette, la notion de borne est supprimée
[x] D4 — identité sur le contour de l'agent en cours (K) — arbitrage §8
    ✅ TRANCHÉ EN COURS DE CYCLE : maquette, exception nommée et datée dans §8
[x] D5 — ✅ TRANCHÉ (utilisateur) : rayon = 11 + 0,80·√(durée_s) (maquette)
[x] D6 — socle, HH:MM, deux lignes en créneau empilé, libellé de pastille (L+M+N+Q)
[x] D7 — ADR NEUF remplaçant ADR-0025 §1 — obligatoire au vu de D2/D3/D5

[x] A1  — diagramme.js : angle des graduations (départ 2,4°, pas (360−4,8)/TK, TK divisions)
[x] A2  — diagramme.js : nombre de graduations 24/36/52 selon le rayon
[x] A3  — diagramme.js : longueur et épaisseur de graduation dans le contrat, selon D3
[x] A4  — diagramme.js : extrémités RÉELLES des liens (bords de créneau) et axe commun
[x] A5  — diagramme.js : boîte du cadre de créneau empilé + boîte du libellé « N agents en parallèle »
[x] A6  — diagramme.js : sommet et ancrage du libellé d'arc, toujours comptés dans la marge haute
[x] A7  — diagramme.js : textes de socle selon D6 (HH:MM, composition) et largeur réservée cohérente
[x] A8  — diagramme.js : libellé et gabarit de pastille selon D6
[x] A9  — diagramme.js : rayon = 11 + 0,80·√(durée_s)
[x] A10 — diagramme.js : en-tête de contrat mis à jour pour chaque champ ajouté

[x] B1  — app.js : contour du cercle nominal plein, sur --trait
[x] B2  — app.js : sigle en couleur d'identité, y compris pour le principal (D1)
[x] B3  — app.js : anneau guide sur --trait-fin, graduations éteintes sur --trait (inversion E)
[x] B4  — app.js : barres du zéro sur --creux et --texte-faible
[x] B5  — app.js : liseré peint APRÈS le disque (défaut H) + encodage par opacité (D2)
[x] B6  — app.js : agent en cours selon D4 (anneau, largeur, durée graissée et colorée)
[x] B7  — app.js : échec / sans clôture / principal selon D1
[x] B8  — app.js : socle 10,5 / 12,5 / 10,5, vedette sur la DURÉE et non sur le nom
[x] B9  — app.js : créneau empilé — deux lignes centrées sur cy, cadre sans aplat, rx, libellé (O, N)
[x] B10 — app.js : liens consommant A4 (bords de créneau, axe commun, pointe conforme)
[x] B11 — app.js : pastille consommant A8
[x] B12 — app.js : arcs consommant A6 (couleur et pointe selon R)
[x] B13 — app.js : sigle de l'agent principal — collecterRoles voit le segment principal (G)
[x] B14 — app.js : légende alignée sur ce qui est RÉELLEMENT dessiné (T)
[x] B15 — app.js/index.html : titre « Déroulé » + phrase d'avertissement (S)

[x] C1 — app.css : 7 classes mortes supprimées ou rebranchées (U)
[x] C2 — app.css : .dg-guide déclarée ; toute constante de trait vit dans la classe
[x] C3 — app.css : piste (radius 6, voiles latéraux) selon S
[x] C4 — app.css : zéro hexadécimal hors :root, deux thèmes sans règle dupliquée

[x] E1 — TEST DE CONFORMITÉ : table de valeurs attendues écrite À LA MAIN depuis la maquette
[x] E2 — Tests de géométrie couvrant A1–A9
[x] E3 — Non-régression : 9 agents sans chevauchement, 18 agents dans le cadre, repli 4+N, arc et libellé dans le viewBox, agent à zéro outil lisible
[x] E4 — Garde sur l'ORDRE DE PEINTURE du liseré (le défaut H doit mourir sous mutation)
[x] E5 — Garde : aucun « ?? » dans un diagramme contenant un segment principal
[x] E6 — Mutations sur les constantes neuves ; compte de tests en hausse vérifié
[x] E7 — Capture headless dans les DEUX thèmes, comparée à la maquette

[x] F1 — Spec close avec notes d'implémentation et verdicts
[x] F2 — ADR neuf remplaçant ADR-0025 §1 (D7)
[x] F3 — DESIGN-SYSTEM.md §5 et §8 mis d'accord — contradiction V levée
[x] F4 — docs/features/page-centre-de-controle.md
[x] F5 — CHANGELOG.md
[x] F6 — control-center/PIEGES.md : entrée ajoutée, retirée, ou « aucun piège neuf » écrit
[x] F7 — Maquette citée depuis la spec ET depuis DESIGN-SYSTEM §5
```

## ADR attendu ?
- **Oui — obligatoire.** D2, D3 et D5 contredisent `ADR-0025 §1`, qui est
  immuable. Un ADR **neuf** le remplace sur ces paragraphes, nomme les
  alternatives écartées et la raison (« la maquette est la référence visuelle
  retenue par le commanditaire »). `ADR-0025` n'est pas réécrit : il porte la
  mention de remplacement.

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- aucun

### Écrans / flux UI concernés
- Le diagramme du détail de cycle, sa légende et le cadre de sa zone

### Schéma BDD / migrations
- aucun

### Documentation à produire / mettre à jour
#### Docs vivantes
- `docs/features/page-centre-de-controle.md`
#### Docs transverses
- `CHANGELOG.md`, `control-center/PIEGES.md`
#### Docs immuables
- ADR neuf remplaçant `ADR-0025 §1`
- `docs/DESIGN-SYSTEM.md` §5 et §8 (contradiction V)

## Critères d'acceptation
- [x] **Le test de conformité E1 existe et passe** : les valeurs attendues sont
      écrites à la main depuis la maquette, jamais dérivées du code sous test
- [x] Un agent terminé sans échec est identique à la maquette : contour plein,
      aucun pointillé, sigle en couleur d'identité
- [x] Le liseré des fichiers est **visible** — et une mutation qui le repeint
      sous le disque **tue** un test
- [x] Aucun sigle « ?? » dans un cycle portant un segment principal
- [x] `--trait` et `--trait-fin` ne sont plus inversés entre guide et graduations
- [x] Le diagramme est correct dans **les deux thèmes** sans code dupliqué
- [x] Aucune classe CSS du diagramme déclarée sans être posée, ni posée sans être déclarée
- [x] Suite complète verte, compte de cas **> 1353**, mutants tués **> 16**,
      aucune mutation survivante non justifiée
- [x] Capture headless des deux thèmes comparée à la maquette ; **les écarts
      restants sont nommés dans la spec**, pas passés sous silence

## Plan de test manuel
1. Déplier un cycle réel à côté de la maquette ouverte : comparer cercle à
   cercle, socle à socle, cadre à cadre.
2. Cycle portant un agent en échec et un agent tué : les deux signaux
   supplémentaires (croix + contour, pointillé) sont présents et lisibles, le
   reste du cercle est identique à la maquette.
3. Cycle portant l'agent principal : son sigle est décidé, jamais « ?? », et son
   cercle n'est plus en tirets.
4. Agent ayant écrit des fichiers : l'anneau intérieur est **visible**, et son
   opacité croît avec le nombre de fichiers.
5. Changer de thème sans recharger : le diagramme suit, aucune couleur figée.
6. Réduire la fenêtre jusqu'au défilement : les voiles latéraux signalent le
   contenu hors champ.

## Notes pour agent

**Toute expérience se fait sur un clone jetable** (`cp -a`, jamais `git clone`),
en clonant `control-center/` **et** `.claude/agents/` — ce dernier à
`<racine>/.claude/agents/` exactement, sinon `test_server.py` produit deux faux
échecs silencieux. Le port 8788 est occupé par le serveur de l'utilisateur : ne
pas le tuer, ne pas le prendre.

**Lire `control-center/PIEGES.md` avant de commencer.** §25 (une mutation
neutralisée par la spécificité CSS est un faux positif) et §30 (un test qui
délègue à la fonction sous test est aveugle à sa propre divergence) sont au cœur
de ce cycle.

**Le risque principal est une 4e itération.** Il ne se traite pas par plus de
soin : il se traite par E1. Tant que « identique » n'est pas une table de
valeurs attendues, le verdict reste un jugement à l'œil. Si E1 est sacrifié en
route, le cycle a échoué même vert.

---
# Notes d'implémentation

> **Cycle interrompu puis repris.** Le cycle a été mené en deux temps : une
> première session, interrompue après les tests E1/E4/E5 et avant la revue, et
> une reprise le 2026-09-19 dans une session neuve, sans mémoire de la
> précédente. L'état réel des 50 livrables a donc été **réétabli par mesure sur
> le dépôt** — lecture des artefacts, exécution de la suite, campagne de
> mutation — et non repris d'un compte rendu. Ce que la reprise a trouvé est
> consigné tel quel ci-dessous, y compris ce que la première session avait
> laissé ouvert sans le dire.

## Plan (architect)

Le plan de la première session n'a pas laissé de trace écrite hors du code ; il
est lisible dans l'en-tête de contrat de `diagramme.js` (l. 19-24) : faire de
`diagramme.js` le seul lieu de calcul — toute position, tout angle, toute
trigonométrie — et de `app.js` un **peintre sans arithmétique**, vérifiable par
`grep` en revue et épinglé par une sonde
(`sondeZeroArithmetiqueDansLesFonctionsDeDiagramme`).

- ADR : **ADR-0026 créé**, remplaçant `ADR-0025 §1` sur quatre paragraphes.

## Validation security-reviewer, rôle GATE

**Sans objet** — périmètre purement frontend (aucun endpoint, aucune donnée
personnelle, aucun secret, aucune migration, aucune règle de permission). Le
bloc « Agents requis » de cette spec ne le liste pas, et `code-reviewer` l'a
confirmé en revue.

## Implémentation

- **Fichiers créés** : `control-center/web/test_app_diagramme_conformite.js`
  + `.py` (livrable E1), `control-center/web/test_app_diagramme_navigateur.py`
  (livrable E7), `docs/adr/0026-trois-echelles-du-diagramme-alignees-sur-la-maquette.md`.
- **Fichiers modifiés** : `control-center/web/diagramme.js` (contrat de sortie
  élargi : graduations, liens, cadres, socles, pastilles, arcs — toute la
  géométrie), `app.js` (rendu SVG, légende, collecte des sigles),
  `app.css` (classes du diagramme, piste, voiles), `test_app_diagramme.js`,
  `test_app_accordeon.js`, `docs/DESIGN-SYSTEM.md`,
  `docs/features/page-centre-de-controle.md`, `docs/adr/0025-*.md` (note
  additive seule), `docs/adr/README.md`, `CHANGELOG.md`,
  `control-center/PIEGES.md`.

### Choix d'implémentation notables

**Les deux « à statuer » de la check-list ont été tranchés — en faveur de la
maquette, les deux fois.**

- **D3 / item J — longueur de graduation.** Retenu : `allumée ? 7 : 3,2` px.
  La notion de « borne » est **supprimée** du calcul : plus d'encoche de zéro
  par la longueur, plus de cran de plafond. `plafondAtteint` survit dans le
  contrat mais **n'a plus aucun rendu visuel** — il ne vit que dans
  l'infobulle. Conséquence assumée et écrite dans l'ADR-0026 : **la saturation
  de l'échelle des appels d'outils n'est plus signalée à l'écran.**
- **D4 / item K — identité sur le contour.** Retenu : l'identité va sur le
  contour **pour le seul état « en cours »**, parce que la maquette le fait.
  C'est une exception à la règle de précédence de `DESIGN-SYSTEM §8`
  (« l'identité prend le texte et le sigle, l'état prend le contour et la
  forme ») : elle est **nommée, datée et motivée** dans §8, pas subie. La règle
  continue de valoir partout ailleurs.

**Où vivent les constantes (arbitrage C1/C2).** Règle posée et écrite en
commentaire : une constante qui ne sert **qu'au trait** (épaisseur, motif,
remplissage) et ne participe à **aucune réservation d'espace** vit dans la
classe CSS ; une constante qui participe à la géométrie ou à la réservation
reste dans `diagramme.js`. Trois constantes sont descendues dans `app.css`
(`.dg-liseret`, `.dg-barre-zero-blanche`, `.dg-barre-zero-grise`) et les champs
correspondants ont quitté le contrat de `disposer()`. Les règles CSS restées
vides ne sont pas des cadavres : les classes sont réellement posées, et le
critère d'acceptation « posé ⇔ déclaré » exige qu'elles soient déclarées — il a
désormais une **garde** (`sondePariteClassesDgPoseesEtDeclarees`) au lieu d'une
affirmation en commentaire.

## Tests (test-engineer)

- **Suite complète : 1627 cas, 0 échec**, sur 21 fichiers `test_*.py` découverts
  par la CI (le seuil de la spec était « > 1353 »). Progression sur la reprise :
  1515 → 1567 → 1624 → 1627.
- **Tests ajoutés pendant la reprise** : extrémités réelles des liens et axe
  commun (A4), `rx` du cadre de créneau (A5), seuil de taille du sigle, opacité
  de l'anneau « en cours », cadre sans aplat, épaisseurs de trait lues dans le
  CSS réellement appliqué, format des durées dans la **table des passages**
  (D8), parité « posé ⇔ déclaré » des classes `dg-*`, longueurs des barres du
  zéro, taille de police **calculée** du socle dans Chromium, unité `px`
  obligatoire.
- **Lint** : aucun linter dédié dans ce module ; `node --check` et
  `python3 -m py_compile` propres.
- **Capture headless (E7)** : `test_app_diagramme_navigateur.py`, 37 cas — rend
  réellement le SVG dans Chromium, dans les **deux thèmes**, et mesure la
  couleur composée au canevas (jamais une sérialisation CSS).

### Campagne de mutation — 26 tentées, 26 tuées, 0 survivante

Le critère de la spec était « mutants tués > 16, aucune mutation survivante non
justifiée ».

| Mutant | Cible | Mutation | Résultat |
|---|---|---|---|
| M1 | `app.js` | liseré peint **avant** le disque | Tué |
| M2 | `app.js` | `SIGLES_SPECIAUX = {}` (retour du « ?? ») | Tué |
| M3 | `app.js` | anneau guide sur `--trait` (inversion E) | Tué |
| M4 | `app.js` | sigle du principal en `--texte-faible` | Tué |
| M5 | `diagramme.js` | graduation allumée 7 → 6,9 | Tué |
| M6 | `diagramme.js` | rayon 0,80 → 0,81 | Tué |
| M7 | `diagramme.js` | départ des graduations 2,4° → 0° | Tué |
| M8 | `diagramme.js` | TK 52 → 40 | Tué |
| M10 | `app.css` | épaisseur du liseré 1 px → 6 px | Tué |
| M11 | `diagramme.js` | opacité de base du liseré 0,22 → 0,30 | Tué |
| M12 | `diagramme.js` | `lien.x1` recalculé au lieu de `bordDroit` (défaut P) | Tué |
| M13 | `diagramme.js` | pastille 86 → 54 (la maquette déborde sa boîte) | Tué |
| M14 | `diagramme.js` | durée du socle 12,5 → 10,5 | Tué |
| M15 | `diagramme.js` | `cadre.rx` 9 → 0 | Tué |
| M16 | `app.js` | cadre `fill:none` → `var(--creux)` (l'aplat interdit par §9) | Tué |
| M17 | `diagramme.js` | décalage du guide 4 → 8 | Tué |
| M18 | `diagramme.js` | seuil de taille du sigle `r>26` → `r>99` | Tué |
| M19 | `app.css` | barre grise du zéro 1 px → 3 px | Tué |
| M20 | `diagramme.js` | opacité de l'anneau « en cours » 0,45 → 0,9 | Tué |
| M21 | `app.js` | `duree()` — retour au format « 1 min 7 s » | Tué |
| E6c-a/b/c | `app.css`/`app.js` | classe posée sans déclaration, et l'inverse | Tués (3) |
| G1a | `app.css` | réintroduire `font-size` sur `.dg-socle-*` | Tué |
| G1b | `app.js` | taille de socle posée en **attribut** au lieu de `style` | Tué |
| G2a/b | `diagramme.js` | barres du zéro 8,5 → 9 ; 9,5 → 10 ; permutation | Tués |
| G3 | `app.js` | retrait de l'unité `px` (4 points de pose) | Tué |
| G4 | `app.js` | libellé d'arc reposé en attribut / sans unité | Tué |

## Revue (code-reviewer)

- **Premier verdict : Request changes.** Trois points, tous mesurés, aucun
  visible dans la suite verte :
  1. **`.dg-socle-nom { font-size: 10.5px }` écrasait l'attribut `font-size="11"`
     posé depuis le contrat.** Mesuré dans Chromium : attribut `11`, calculé
     `10,5px` — donc **le texte réservé et le texte peint divergeaient**, sur
     l'item L que ce cycle corrige. Ni E1 (module pur) ni E7 (pas de typo) ne
     pouvaient le voir. → Corrigé : `font-size` retiré de six règles, la taille
     se pose en `style` (qui gagne contre la classe **et** contre l'attribut).
  2. **Barres du zéro 0,5 px trop longues** (`r0−9` / `r0−10` contre `r0−8,5` /
     `r0−9,5` dans la maquette) — aucun test ne les touchait : trou d'E1.
     → Corrigé et gardé.
  3. **Commentaire périmé en tête du bloc diagramme** de `app.js`, qui affirmait
     encore « le CONTOUR porte l'ÉTAT » et le sigle du principal en
     `--texte-faible` : **littéralement la régression que ce cycle retire**, et
     le commentaire qui avait égaré la revue de feature-017. → Réécrit.
- **Second verdict : ✅ Approved.** Les trois points vérifiés par ré-exécution
  des mutants sur clone jetable.
- **Point mineur relevé et corrigé dans la foulée** : le libellé d'arc était la
  dernière taille venue du contrat encore posée en attribut. Corrigé et gardé
  (mutants G4).

## Doc (doc-writer)

- `docs/adr/0026-trois-echelles-du-diagramme-alignees-sur-la-maquette.md` —
  **créé** ; remplace `ADR-0025 §1` sur quatre paragraphes (nombre de
  graduations, formule du rayon, encodage du liseré, disparition du cran de
  plafond et de l'anneau fantôme).
- `docs/adr/0025-grammaire-du-diagramme-de-deroule.md` — **note additive
  seule** : l'ADR n'est pas réécrit, conformément à son immuabilité.
- `docs/adr/README.md` — index.
- `docs/DESIGN-SYSTEM.md` §5 et §8 — **contradiction V levée** (voir ci-dessous)
  et maquette citée depuis §5.
- `docs/features/page-centre-de-controle.md` — socle, sigle « AP », titre
  « Déroulé », voiles, cadre sans aplat, arc sans pointe, renvois vers ADR-0026.
- `CHANGELOG.md` — entrée `0.11.1`.
- `control-center/PIEGES.md` — trois entrées neuves (§31 à §33).

### Contradiction V, levée

`DESIGN-SYSTEM` §5 disait « cercle en pointillé + croix = échec », §8 disait
« pointillé = sans clôture » et « tirets = agent principal ». Le vocabulaire
retenu, sans double sens : **pointillé = « sans clôture », seul motif restant
sur le cercle** ; **croix + contour `--alerte` = échec** ; **identité sur le
contour = « en cours »** (exception nommée) ; **arc pointillé `--rebouclage`,
sans pointe**. L'agent principal a quitté les tirets : il se reconnaît à son
fond `--creux` et à son sigle « AP ».

## Addendum — itération du 2026-09-19 (reprise après interruption)

- **Déclencheur** : session interrompue entre `test-engineer` et
  `code-reviewer`. Reprise dans une session neuve, sans mémoire de la
  précédente.
- **Hypothèse précédente invalidée** : « la suite est verte, donc le cycle est
  près d'être clos ». La suite **était** verte à 1515 cas — et une campagne de
  mutation menée pendant la reprise a laissé **neuf survivants**, dont deux qui
  désarmaient des décisions que l'ADR était sur le point de graver (l'anneau de
  1 px de D2, le format des durées de D8). Graver dans un ADR une règle
  qu'aucun test ne tient, c'est annoncer acquise une garde qui ne l'est pas.
  Deuxième hypothèse invalidée, celle de la spec elle-même : **le risque d'une
  4ᵉ itération ne vivait pas là où elle le craignait.** E1 existait et mordait ;
  c'est E7 qui manquait, et c'est une capture headless qui avait déjà trouvé
  l'écart D8.
- **Ce qui a été fait** : état des 50 livrables réétabli par mesure ; arbitrage
  C1/C2 ; neuf survivants tués puis quatre gardes de plus après la revue ;
  harnais headless du diagramme créé ; documentation écrite de bout en bout
  (elle n'était pas commencée : `grep -rn "feature-020" --include=*.md .` ne
  renvoyait que la spec) ; deux allers-retours de revue.
- **Résultat** : 1515 → **1627 cas, 0 échec** ; **26 mutants tentés, 26 tués,
  0 survivant** ; revue **Approved** ; 7 fichiers de documentation écrits.

### Écarts restants, nommés

Le critère d'acceptation exige que les écarts restants soient **nommés, pas
passés sous silence**. Les voici :

1. **Aucun diff pixel à pixel contre une capture de la maquette.** La maquette
   n'utilise pas les jetons de couleur du kit : un diff d'image comparerait deux
   palettes différentes. Ce qui est vérifié, c'est la **correspondance de
   jetons** déclarée dans cette spec, plus la géométrie, valeur par valeur.
2. **La capture headless ne couvre qu'une fixture** (un créneau simple, un
   créneau empilé, un lien). Les états échec / sans clôture / agent principal et
   l'arc de rebouclage restent couverts par le DOM factice seul, pas par un vrai
   moteur de rendu.
3. **La typographie de la légende et de l'en-tête « Déroulé »** n'est pas
   mesurée en Chromium — seule leur présence structurelle l'est.
4. **Le rendu de l'émoji de la pastille d'attente** dépend de la fonte installée
   sur la machine (déjà relevé en item Q).
5. **`control-center/maquettes/` n'est pas versionné.** La référence visuelle de
   tout ce cycle n'existe que sur un poste. Elle est citée depuis
   `DESIGN-SYSTEM` §5 **en texte entre backticks**, jamais en lien Markdown,
   pour ne pas faire passer `check_doc_links.sh` au vert sur une cible qui
   disparaîtra au premier clone frais. **À arbitrer avec l'utilisateur** : c'est
   le seul point du cycle laissé ouvert.

## Statut final

✅ Done — 2026-09-19 — non commité (arbre de travail portant plusieurs cycles ; commit et push à la main de l'utilisateur)
