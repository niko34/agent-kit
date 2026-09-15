## Métadonnées
- **ID** : feature-015
- **Slug** : socle-de-theme-et-identite-des-agents
- **Type** : feature
- **Statut** : done
- **Priorité** : haute
- **Version cible** : 0.9.0
- **Dernière mise à jour** : 2026-09-15
- **Spec(s) liée(s)** : feature-016 (accordéon) et feature-017 (diagramme) en dépendent

## Domaines touchés
- [x] Frontend (écrans, composants, appels API)

## Agents requis
- [x] spec-reader
- [x] architect
- [x] ux-ui-designer — le design system existe, il s'agit de **vérifier la conformité**, pas de re-arbitrer
- [x] frontend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Description

Doter le centre de contrôle d'une **identité de couleur par agent** et d'un
**second thème clair**, commandés par une bascule à trois positions.

## Contexte

`docs/DESIGN-SYSTEM.md` décrit la cible ; `control-center/web/app.css` décrit
l'existant, et les deux divergent sur deux points :

- la feuille actuelle porte des jetons **sémantiques** — `--accent`, `--actif`,
  `--alerte`, `--echec` — et **aucune couleur par agent** ; un `debugger` et un
  `test-engineer` s'affichent aujourd'hui de la même façon ;
- il n'existe **qu'un thème sombre**, avec `color-scheme: dark` figé.

Cette spec est le **socle** : tant qu'elle n'est pas livrée, l'accordéon
(feature-016) et le diagramme (feature-017) n'ont pas de couleurs à consommer.

La propriété à préserver — elle est déjà vraie — est que **chaque couleur
n'apparaît qu'une fois**, dans le bloc `:root`. Treize littéraux, treize
variables, aucun hexadécimal ailleurs dans la feuille.

## Comportement attendu

1. **Six identités d'agent** exposées en jetons (`--a-<rôle>` pour le trait, le
   sigle et les graduations ; `--f-<rôle>` pour le remplissage), engendrées par
   la méthode du §2 du design system : teinte fixée par rôle, clarté et
   intensité constantes à l'intérieur d'un thème.
2. **Deux thèmes** partageant exactement les mêmes teintes ; seules la clarté et
   l'intensité changent. Les jetons sémantiques existants (`--accent`, `--actif`,
   `--alerte`, `--echec`) sont conservés et déclinés dans les deux thèmes.
3. **Trois positions de thème** — clair, système, sombre — dans une commande en
   haut à droite. **« Système » est le défaut.**
4. La position **« système » annonce sa résolution** : son icône suit le thème
   auquel elle aboutit à cet instant, et son libellé accessible le nomme —
   « Suivre le système (actuellement sombre) ».
5. Le choix **persiste** entre deux ouvertures, et il est **appliqué avant le
   premier rendu**.
6. En position « système », un changement de préférence de l'OS **pendant que la
   page est ouverte** est suivi sans rechargement.

### Cas limites

- `localStorage` indisponible ou en échec (fenêtre privée, données bloquées) :
  la page s'affiche correctement, en position « système », sans exception.
- Une valeur inconnue stockée sous la clé du thème : traitée comme « système »,
  et la clé est nettoyée.
- `prefers-reduced-motion` : la bascule ne produit aucune transition animée.
- L'OS n'exprime aucune préférence : « système » vaut clair.

## Comportement actuel

Thème sombre unique, figé par `color-scheme: dark`. Aucune commande de thème.
Aucune couleur portant l'identité d'un agent.

## Contraintes techniques

- **Zéro dépendance, zéro ressource distante** : la CSP du serveur n'autorise que
  `'self'`. Variables CSS natives, aucun préprocesseur. Voir ADR-0006.
- Les trois déclarations de jetons sont **obligatoires** : `:root` nu,
  `@media (prefers-color-scheme: dark)` protégé par
  `:root:not([data-theme="clair"])`, et `:root[data-theme="sombre"]`. Sans la
  troisième, un choix explicite ne gagne pas contre la préférence système.
- `color-scheme` suit le thème résolu, sinon les éléments natifs (barres de
  défilement, champs) restent dans l'ancien registre.
- Le SVG **lit les jetons** (`var(--a-dbg)`), il ne recopie aucune couleur :
  c'est ce qui permet à un seul diagramme de servir les deux thèmes.

## Fichiers potentiellement concernés

- `control-center/web/app.css` — les jetons, les trois déclarations
- `control-center/web/index.html` — la commande de thème, le script d'amorçage
- `control-center/web/app.js` — application, persistance, écoute de `matchMedia`
- `control-center/web/test_app_theme.js` + `test_app_theme.py` — pont Python,
  sur le modèle de `test_app_bug012.js` / `.py`
- `docs/DESIGN-SYSTEM.md` — retirer la mention « décrit la cible » une fois livré

## Livrables — check-list
- [x] A1 — jetons d'identité, dans les deux thèmes (**huit rôles**, pas six —
      voir note d'implémentation ci-dessous)
- [x] A2 — jetons sémantiques existants déclinés dans les deux thèmes
- [x] B1 — commande à trois positions, « système » par défaut et annonçant sa résolution
- [x] C1 — persistance protégée + application avant premier rendu
- [x] D1 — suivi de `matchMedia` en position « système »

### Note d'implémentation (frontend-developer, 2026-09-15)

- **Six rôles → huit.** Le plan d'exécution reçu pour ce cycle couvre
  `backend-developer` (H 220°) et `doc-writer` (H 336°) en plus des six du
  §2 de `docs/DESIGN-SYSTEM.md`. Ce document liste encore SIX teintes :
  `doc-writer` manque au §2 et à la section « Faire évoluer ce système ».
  **`doc-writer` doit mettre à jour le tableau du §2** (ajouter
  `backend-developer` 220° et `doc-writer` 336°, huit rôles au total) et
  retirer la mention « décrit la cible » une fois ce lot revu.
- **Mesure demandée sur les jetons sémantiques en clair** — d'abord obtenue
  en appliquant aux jetons sémantiques la méthode L/C du §2 (catégorielle) :
  les quatre jetons convergeaient à moins de 6° d'une teinte d'agent
  (`--accent` à 0,2° de `debugger`, au point de produire le MÊME
  hexadécimal que `--clair-a-debugger` par écrêtage de gamut ; `--actif` à
  0,4° de `security-reviewer` ; `--alerte` à 6,0° de `debugger` ; `--echec`
  à 0,4° de `code-reviewer`). **Non conforme** au verdict `ux-ui-designer` :
  le §2 s'ouvre sur une palette catégorielle « sans ordre ni grandeur » —
  les jetons sémantiques portent une gravité, donc un ordre, et ne
  relevaient pas de cette méthode. **Arbitré et corrigé** : l'architecte a
  régénéré les quatre jetons sur un axe propre (huit valeurs OKLCH
  distinctes, vérifiées peintes par le navigateur — canvas 2D,
  `getImageData`, aucune écrêtée), tenues à ≥ 0,10 d'écart perceptuel de
  toute teinte d'agent après écrêtage. `--accent` clair est désormais un
  brun profond (`#282012`), pas un laiton : à L ≤ 0,315 l'ambre n'atteint
  pas plus d'intensité en sRGB, et la variante qui gardait le laiton faisait
  tomber le contraste de `.action-ecriture` de 8,1:1 à 5,0:1 — écartée par
  l'utilisateur. Conséquence non corrigée : tous les contrastes sémantiques
  montent (`.action-ecriture` : 14,98:1 clair, 13,75:1 sombre).
- **`--clair-trait` / `--clair-trait-fin`** : aucune valeur n'était donnée
  pour le thème clair dans le plan reçu (seules les quatre surfaces
  `--fond`/`--surface`/`--surface-2`/`--creux` l'étaient). Choisies par
  continuité de méthode (OKLCH, H≈264, C faible) pour un contraste contre
  `--surface` légèrement SUPÉRIEUR à celui du thème sombre (1,69:1 et
  1,46:1 contre 1,32:1 et 1,16:1) — à valider par `ux-ui-designer`.
- **`--f-<rôle>` sombre** : la cellule « L 0,22 mêlé au fond » du §2 ne
  donne pas de chroma. Réutilisé C 0,13 (celui du trait sombre, seule valeur
  disponible pour ce thème) plutôt qu'une valeur inventée — à confirmer.
- Sigles vérifiés SANS collision pour les huit rôles retenus (BA, SE, TE,
  SP, CO, DE, DO, FR) ; la désambiguïsation FNV-1a (§8) est écrite mais
  n'a donc jamais été exercée par un cas réel — `test-engineer` devra la
  couvrir avec des noms synthétiques.
- Vérifié PAR EXÉCUTION (chromium headless, clone jetable
  `cp -a` — jamais `git clone`, port 8799, jamais 8788) : les trois
  déclarations résolvent bien le fond peint (`getComputedStyle` +
  `background-color` réel, pas seulement la règle CSS), dans les deux sens
  (`data-theme="clair"` sous système sombre ⇒ fond clair peint, et
  inversement) ; `--voile` est bien invariant entre les deux thèmes ;
  `theme.js` lit/écrit `localStorage` sous try/catch unique, nettoie une
  valeur inconnue, et ne lève aucune exception quand `localStorage` est
  entièrement absent du contexte (testé en Node ET en navigateur réel via
  profil persistant). `test_app_bug012.js` (41 cas) reste vert après ajout
  du module thème et de l'utilitaire `sigleAgent`/`siglesAgents` à `app.js`.
- **Laissé à `test-engineer`** : suite `test_app_theme.js` + `.py` sur le
  modèle de `test_app_bug012.*` (le piège de l'écrasement par `theme.js`
  est documenté en tête de fichier) ; vérification programmatique des
  contrastes ≥4,5:1 / ≥4:1 depuis les jetons ; couverture de la
  désambiguïsation de sigles au-delà de huit rôles ; test manuel clavier
  (flèches, focus visible) sur la commande à trois positions.

## ADR attendu ?
- **Probable** : oui
- **Critère(s) candidat(s)** : 1, 3
- **Sujet pressenti** : une palette catégorielle se construit à clarté et
  intensité constantes ; les deux thèmes partagent les teintes. Contrainte
  imposée à tout ajout d'agent futur, et deux alternatives mesurées puis
  écartées (assombrissement mécanique, canevas sombre invariant).

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- aucun

### Écrans / flux UI concernés
- Toutes les surfaces du centre de contrôle (repeintes)
- Nouvelle commande de thème en haut à droite

### Schéma BDD / migrations
- aucun

### Documentation à produire / mettre à jour
#### Docs vivantes
- `docs/features/page-centre-de-controle.md` — la commande de thème
- aucun module backend touché

#### Docs transverses
- `README.md` — mention du choix de thème
- `CHANGELOG.md` — entrée 0.9.0

#### Docs immuables
- `docs/adr/NNNN-palette-categorielle-a-clarte-et-intensite-constantes.md`

## Critères d'acceptation
- [x] Un choix explicite gagne contre la préférence système **dans les deux
      sens** : `data-theme="clair"` sous système sombre rend le fond clair, et
      `data-theme="sombre"` sous système clair rend le fond sombre — vérifié sur
      la couleur réellement peinte, pas sur la règle CSS
- [x] Aucun littéral de couleur hors du bloc `:root` de `app.css` — vérifié par
      un test qui lit la feuille
- [x] Les ~~six~~ **huit** couleurs d'agent **et le neutre** atteignent **≥ 4,5:1** contre leur fond, et chaque
      sigle **≥ 4:1** contre son propre remplissage, **dans les deux thèmes** —
      vérifié par un test qui calcule le contraste depuis les jetons
- [x] Deux rôles n'ont jamais la même couleur ni le même sigle
- [x] Avec `localStorage` en échec simulé, la page s'affiche en « système » sans
      exception levée
- [x] Au chargement, aucune image ne montre le mauvais thème avant le bon
- [x] Suite de tests complète verte, zéro régression
- [x] Lint propre, pas de warning nouveau

## Plan de test manuel
1. Ouvrir avec un OS en clair : la page est claire, la position du milieu est
   active, son libellé dit « actuellement clair ».
2. Basculer l'OS en sombre sans recharger : la page suit, le libellé change.
3. Cliquer « sombre », basculer l'OS en clair : la page **reste** sombre.
4. Recharger : le choix est conservé, sans clignotement.
5. Cliquer « système » : la page revient à la préférence de l'OS, et la clé
   stockée disparaît.
6. Naviguer à la commande au clavier seul : focus visible, activation possible,
   libellé annoncé correct.

## Notes pour agent

Les suites du centre de contrôle sont des **scripts autonomes** — `python3
<fichier>`, sortie « N cas, M echec(s) », code 1 si échec. Ce ne sont pas des
`unittest`. Pour la partie JavaScript, suivre le pont existant
`test_app_bug012.js` + `test_app_bug012.py`, qui se saute proprement si `node`
est absent, et veiller à ce que le fichier soit ramassé par la découverte CI
(`find control-center -name 'test_*.py'`).

Le piège mesuré pendant la conception : le script qui applique le thème au
chargement **écrase** un attribut `data-theme` posé à la main. Tout test qui veut
éprouver la règle CSS seule doit neutraliser ce script, sinon il mesure autre
chose et passe pour vert.

## Notes techniques (test-engineer, 2026-09-15 — deux passes)

### Passe 1 — bug trouvé (E3c sombre)

Le critère E3c (bande de clarté sémantique/identité disjointe, ΔL≥0,10)
était **violé en thème sombre** — écart mesuré 0,0995 (`alerte` vs `neutre`),
0,0005 sous le plancher. Signalé, non corrigé par cet agent (hors mandat).
Cause identifiée conjointement avec l'architecte : sa table du §2 supposait
un **écrêtage canal par canal**, l'implémentation fait une **réduction de
chroma à clarté et teinte conservées** — les deux méthodes divergent dès
qu'un jeton déborde le gamut, exactement les quatre teintes en cause.

### Passe 2 — correction confirmée, suite renforcée

Après correction de quatre littéraux (`--sombre-alerte`, `--sombre-echec`,
`--clair-alerte`, `--clair-echec` — `accent`/`actif` inchangés, vérifié) :

- **E3c (calculé depuis les hexadécimaux réels, jamais depuis une table
  recopiée)** : bandes disjointes à **0,1191 en clair, 0,1193 en sombre** —
  confirme indépendamment les chiffres annoncés (0,1191/0,1193). Minimums ΔE
  également confirmés : **0,1257 clair** (`alerte`↔`debugger`), **0,1323
  sombre** (`actif`↔`security-reviewer`) — les deux montent, comme annoncé.
- **Test de conception ajouté** (`E_conception_*_marge_nominale_0_12`) :
  exige 0,12 sur les paramètres NOMINAUX (avant arrondi hexadécimal), pas les
  valeurs effectives — la marge doit tenir par construction, pas par chance
  d'arrondi. Raisonnement de l'architecte (dérive pire cas 0,0015, marge
  retenue 0,02 = 13×) **confirmé indépendamment** par
  `E_conception_derive_arrondi_sous_controle` : dérive nominal/effectif
  mesurée sur 20 jetons, pire cas 0,0016 — même une dérive combinée
  défavorable sur deux jetons à la fois (≤0,0032) reste large sous 0,02.
- **Suites livrées** : `control-center/web/test_app_theme.js` + `.py`
  (**278 cas**), `control-center/web/test_app_theme_navigateur.py` (7 cas,
  Chromium réel), +2 cas dans `control-center/backend/test_server.py` (E10).
  Total centre de contrôle : **527 → 814 cas** (13 → 15 suites). Kit
  (`tests/`) inchangé à 111 cas. **Total global 638 → 925.**
- **Angle mort corrigé, deux fois** (rappel du coordinateur suivi) : une
  assertion de seule DISTINCTION globale laisse deux rôles échanger leurs
  valeurs sans protester — déjà trouvé sur les sigles (mutation #4 ci-dessous),
  vérifié qu'il n'existait pas ailleurs. Comblé pour les couleurs
  d'identité : `backend-developer` (H 220°) et `doc-writer` (H 336°),
  documentés seulement dans la note d'implémentation (pas encore le §2),
  rejoignent le tableau golden (8 rôles teintés sur 9 désormais épinglés
  individuellement) ; `neutre`, seul rôle achromatique, reçoit une garde
  dédiée sur sa chroma quasi nulle. Un échange de couleur entre deux rôles
  quelconques est donc désormais détecté par au moins une assertion nommée.
- **Validation par mutation (E8)** — 8 mutations tentées dans un clone
  jetable (`cp -a`, jamais `git clone`), **8 tuées, 0 survivante** en fin de
  passe (1 survivante intermédiaire, corrigée par renfort — voir #4) :
  1. Retrait du bloc `:root[data-theme="sombre"]` → tué par
     `E1_sombre_explicite_gagne_sous_systeme_clair` (navigateur réel).
  2. Retrait de la garde `:not([data-theme="clair"])` → tué par
     `E1_clair_explicite_gagne_sous_systeme_sombre` (navigateur réel).
  3. Teinte de `debugger` décalée d'1° → tué par
     `E_golden_debugger_trait_clair_teinte`.
  4. `security-reviewer` reçoit codé en dur le sigle `SP` → **d'abord
     SURVIVANT** (distinction globale seule, `spec-reader` dérivait vers
     `SE` sans alerte) ; suite renforcée par deux assertions épinglées sur
     l'exemple du §8 (`E4_spec_reader_sigle_epingle_SP`,
     `E4_security_reviewer_sigle_epingle_SE`) — tué après renfort.
  5. `siglesAgents` perd son `.sort()` → tué par
     `E4_sigles_independants_de_l_ordre_d_arrivee` et un troisième ordre
     mélangé.
  6. `--clair-accent` ramené sur la méthode catégorielle à la teinte de
     `debugger` → tué par `E3b_clair_accent_vs_debugger` (ΔE=0,0394) et
     4 autres cas, dont `E_conception_clair_marge_nominale_0_12`.
  7. Plancher `ecartPerceptuelSuffisant` remplacé par l'ancienne règle
     ΔL≥0,08 OU ΔC≥0,03 → tué par `E3b_regression_nouvelle_regle_le_rejette`.
  8. **Nouvelle** : `--sombre-alerte` ramené à `#f4c398` (l'ancien défaut) →
     tué par `E3c_sombre_bandes_de_clarte_disjointes_ecart_0_10` (écart
     retombe à 0,0995) et, en prime, `E_conception_derive_arrondi_sous_controle`
     (dérive nominal/effectif qui bondit à 0,0196, largement hors contrôle).
  Chaque mutant vérifié syntaxiquement valide (le harnais tourne sans erreur
  d'interprétation, seules des assertions échouent) avant d'être compté
  comme tué ; fichiers d'origine restaurés après chaque mesure (diff vide
  confirmé contre le dépôt réel).
- **Non couvert, justifié** : focus clavier réel (flèches, `:focus-visible`)
  — cas manuel, aucun harnais headless ne simule un focus DOM réel ;
  `prefers-reduced-motion` — règle CSS antérieure à ce cycle, non retouchée.

---

# Clôture — 2026-09-15

## La spec était sous-spécifiée, et c'est le principal enseignement

Elle promettait **six identités d'agent**. Mesuré au démarrage du cycle :
`.claude/agents/` en contient **onze**, et le journal porte **douze** types —
`claude-code-guide` existe à l'usage sans fichier dans le répertoire. L'ensemble
des types est donc **ouvert**, pas fermé.

Ce « six » ne venait d'aucune mesure : il venait des maquettes, qui affichaient
un cycle de neuf passages portés par six rôles. J'ai pris l'échantillon pour
l'ensemble.

Pire : les six teintes du design system avaient été **relevées sur le tableau de
bord existant**, où elles servaient d'états — `--accent` était `--a-debugger` au
bit près. J'ai cru relever des identités d'agent, je relevais des couleurs d'état.

## Ce qui a été livré

- **Huit identités** — les deux angles ajoutés, 220° et 336°, sont les **seuls**
  qui restaient à ≥ 35° de tous les autres. Un neuvième rôle teinté est
  **impossible** sans rouvrir la méthode.
- **Un neutre achromatique** pour tout rôle sans teinte et tout type inconnu.
- **Deux thèmes** partageant les mêmes teintes, trois déclarations de jetons,
  bascule à trois positions, « système » par défaut et annonçant sa résolution.
- **Les jetons sémantiques régénérés sur un axe propre**, séparés des identités
  par un plancher perceptuel ΔE ≥ 0,10 après mappage de gamut.
- Les trois littéraux de couleur qui vivaient hors du bloc de jetons y sont
  rentrés — le critère d'acceptation correspondant **échouait à l'entrée du
  cycle**, sur un fichier que la spec et le design system décrivaient comme
  conforme.

## Quatre allers-retours, une seule cause

| Boucle | Cause racine |
|---|---|
| Collision identité / état | La palette sémantique n'avait **jamais été comparée** à la palette d'identité |
| Bande de clarté à 0,0995 | Une borne posée **exactement** à sa valeur, donc décidée par l'arrondi |
| Table de l'architecte ≠ feuille livrée | Mesure contre **son propre plan**, pas contre l'artefact |
| Mutant survivant (sigle codé en dur) | Assertion **globale** — « tous distincts » — au lieu d'épinglée |

Aucune n'était une faute de code. **Toutes étaient des affirmations numériques
non vérifiées.** La règle du kit « aucune affirmation sur le comportement
existant sans exécution » ne couvre pas les **grandeurs** — c'est le trou que ce
cycle a mis en évidence.

## Deux angles morts trouvés par la mutation

Le sigle codé en dur pour `security-reviewer` n'a d'abord **tué aucun test** :
la suite ne vérifiait que la distinction globale. Deux agents pouvaient échanger
leurs sigles sans que rien ne proteste. L'audit demandé ensuite a trouvé **le
même défaut sur les couleurs**. Huit rôles sur neuf sont désormais épinglés
nommément.

## Décisions de l'utilisateur

- `--accent` en thème clair : **brun profond**, contraste préservé à 14,98:1.
  L'alternative laiton tombait à 4,98:1 — écartée.
- Les quatre couleurs d'**état** du thème sombre pâlissent, conséquence mécanique
  de la séparation des bandes. **Accepté**, en connaissance du changement visible.

## Comptes

| | entrée | sortie |
|---|---|---|
| Centre de contrôle | 13 suites, 527 cas | **15 suites, 824 cas** |
| Kit | 111 tests | 111 tests |
| Mutations | — | **8 tentées, 8 tuées** |

## Verdicts

- `ux-ui-designer` : conforme sous réserves → **non conforme** (collision) →
  règle de précédence posée au §8
- `architect` : plan établi par exécution, plancher proposé **réfuté par ses
  propres mesures**, deux rebouclages
- `test-engineer` : **bloqué** sur un défaut réel laissé rouge, puis vert
- `code-reviewer` : **Approved**, gardes exécutées et atteignabilité prouvée par
  requêtes réelles
- `security-reviewer` rôle GATE : **non requis**, confirmé indépendamment

## Reste ouvert

- `bug-016` — `--texte-faible` sous le seuil, antérieur à ce cycle
- La règle de précédence identité / état est **écrite** mais pas **appliquée** :
  `feature-016` s'en charge
- `sigleAgent` / `siglesAgents` sont livrés sans appelant, pour `feature-016`

## Statut final
✅ Done — 2026-09-15 — commit à renseigner à la validation
