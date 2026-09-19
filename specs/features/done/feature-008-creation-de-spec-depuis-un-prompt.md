## Métadonnées
- **ID** : feature-008
- **Slug** : creation-de-spec-depuis-un-prompt
- **Type** : feature
- **Statut** : doing
- **Priorité** : normale
- **Version cible** : 0.7.0
- **Dernière mise à jour** : 2026-09-12
- **Spec(s) liée(s)** : feature-007 (dont les garde-fous conditionnent toute
  écriture), feature-002 (le Kanban qui affichera la spec créée)

> **Étape E** du centre de contrôle. Dépend de feature-007 : cette spec écrit
> des fichiers dans le dépôt, et n'a donc de sens qu'une fois le jeton,
> l'écrivain unique et le plafond de dépense devenus du code (ADR-0004).

## Domaines touchés
- [x] API REST (endpoints, contrats, codes d'erreur) — une route d'écriture
      de plus, sous les garde-fous de feature-007
- [x] Frontend (écrans, composants, appels API) — la saisie du besoin et la
      relecture avant écriture
- [ ] BDD / migrations
- [x] Auth / permissions → **passage obligatoire par `security-reviewer` (rôle GATE)** —
      écriture de fichiers dans le dépôt, déclenchée depuis le navigateur
- [x] Données personnelles → **passage obligatoire par `security-reviewer` (rôle GATE)** —
      le texte saisi est libre : il peut contenir un identifiant, un extrait
      de journal de production, un secret collé par inadvertance
- [ ] Intégrations externes
- [ ] Tâches de fond

## Agents requis
- [x] spec-reader
- [x] architect
- [x] security-reviewer, rôle GATE — P1 sur le design, P2 sur le diff
- [x] ux-ui-designer — un formulaire qui produit un fichier versionné n'est
      pas un champ de recherche
- [x] backend-developer
- [x] frontend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Description
Permettre de décrire un besoin en texte libre depuis le tableau de bord et
d'en obtenir une spec au format du kit, déposée dans `specs/features/todo/`
après relecture humaine explicite. L'outil prépare le fichier ; il ne le
valide jamais seul.

## Contexte
Le kit impose que tout travail parte d'une spec, et fournit pour cela deux
templates — `_template.md` (riche, lu par l'`orchestrator` pour construire le
plan) et `modele.md` (minimal). Le coût d'entrée reste celui d'un fichier à
créer, nommer et remplir à la main, au moment précis où l'on a une idée et pas
encore de discipline. La conséquence observable est connue : les étapes A à C
du centre de contrôle ont été menées **sans aucune spec**, et les six specs de
`done/` ont dû être écrites rétroactivement.

Un formulaire qui produit un brouillon conforme au template abaisse ce coût.
Il ne remplace ni `spec-reader` ni la relecture : une spec générée sans
relecture serait une spec fausse portant la forme d'une vraie, ce qui est pire
qu'une absence de spec.

## Comportement attendu

### Ce que l'outil produit
- Un fichier dans `specs/features/todo/`, nommé `feature-NNN-<slug>.md` ou
  `bug-NNN-<slug>.md`, **NNN calculé** à partir des specs existantes des trois
  répertoires du cycle — jamais réutilisé, même après suppression.
- Le contenu suit le template correspondant, blocs obligatoires présents. Les
  blocs que le texte saisi ne permet pas de remplir restent marqués
  `[remplir]` : un blanc visible vaut mieux qu'une invention plausible.
- Le choix du template suit la règle d'escalade du kit : un besoin qui
  mentionne auth, permissions, données personnelles, paiements ou migration
  destructive **bascule d'office sur le template complet**, pour que
  `security-reviewer` (rôle GATE) soit déclenché.

### Relecture obligatoire avant écriture
- Le brouillon est **affiché intégralement** et modifiable dans l'interface
  avant toute écriture sur disque.
- Deux actions distinctes : « régénérer » et « écrire ». Aucune écriture
  implicite, aucun enregistrement automatique.
- Le fichier écrit n'est **jamais** committé par l'outil. Le kit interdit
  déjà tout commit sans demande explicite de l'utilisateur.

### Ce que l'outil ne fait jamais
- Il n'écrit que dans `specs/features/todo/`. Aucun autre chemin, jamais —
  ni `doing/`, ni `done/`, ni ailleurs dans le dépôt.
- Il n'écrase jamais un fichier existant : un nom déjà pris est une erreur,
  pas une fusion.
- Il ne déplace aucune spec entre répertoires : la promotion appartient à
  `spec-reader` et à la session principale (ADR-0003 — le répertoire fait foi).

### Cas limites
- Deux créations simultanées réclamant le même NNN : le numéro doit être
  attribué de façon atomique, ou la seconde écriture refusée — jamais deux
  specs au même numéro, que `check_specs.sh` signale déjà comme ambiguïté.
- Texte saisi très long, ou vide : borné, avec un message explicite.
- Slug produisant un nom de fichier dangereux (`../`, séparateurs, caractères
  non ASCII) : normalisé par **liste blanche de caractères**, comme l'est déjà
  la validation des références git en étape B.
- `specs/features/todo/` absent du projet : l'outil le dit, il ne le crée pas
  en silence (`installer.py` n'invente déjà rien qui ne soit sur le disque).
- Le texte saisi contient un secret : voir « Sécurité & données ».

## Comportement actuel
Aucune création de spec depuis l'interface. Le tableau de bord affiche les
specs découvertes sur le disque et ne peut rien écrire : `Handler` n'a aucune
méthode d'écriture (ADR-0004). Une spec se crée aujourd'hui en copiant le
template à la main.

## Contraintes techniques
- Bibliothèque standard Python uniquement (ADR-0006)
- Toute écriture passe par les garde-fous de feature-007 — jeton, écrivain
  unique, plafond de dépense s'il y a appel à un modèle
- Le template est lu **depuis le projet** (`specs/features/_template.md`),
  jamais recopié dans le code du centre de contrôle : un projet qui
  personnalise son template doit voir sa version utilisée
- Aucun chemin construit depuis la requête : le répertoire cible est calculé
  depuis la configuration, le nom de fichier normalisé par liste blanche

## Fichiers potentiellement concernés
- `control-center/backend/server.py` — la route d'écriture
- `control-center/backend/redaction_spec.py` — [nouveau] fabrication du
  brouillon, numérotation, normalisation du slug
- `control-center/backend/specs.py` — calcul du prochain NNN depuis l'existant
- `control-center/web/*` — saisie, relecture, écriture
- `control-center/README.md` — étape E
- `docs/API.md`, `CHANGELOG.md`

## Livrables — check-list
- [x] A1 — Numérotation NNN atomique, jamais réutilisée, tirée des trois répertoires
- [x] A2 — Normalisation du slug par liste blanche de caractères
- [x] A3 — Brouillon conforme au template **du projet**, blocs non déduits
      laissés `[remplir]`
- [x] A4 — Règle d'escalade appliquée : sujet sensible → template complet
- [x] A5 — Écriture confinée à `specs/features/todo/`, jamais d'écrasement
- [x] B1 — Saisie, relecture intégrale, modification, deux actions distinctes
- [x] C1 — `control-center/README.md`, `docs/API.md`, `CHANGELOG.md`
- [x] D1 — Cas validés par mutation, dont la normalisation du slug et le confinement

## Nouvelles signatures / API
- `POST /api/spec/brouillon` — produit un brouillon, n'écrit rien
- `POST /api/spec/ecrire` — écrit le brouillon relu dans `todo/`
- Codes d'erreur : `401` jeton, `409` nom déjà pris, `422` saisie invalide ou
  vide, `507` répertoire cible absent. À confirmer par `architect`.

## Sécurité & données
- Authentification touchée : oui — hérite du jeton de feature-007, n'en crée
  pas d'autre
- Permissions / rôles touchés : oui — porteur du jeton = peut écrire une spec
- Données personnelles collectées ou traitées : **oui** — le texte saisi est
  libre et finit dans un fichier **versionné**, donc potentiellement poussé.
  Le kit a déjà une règle voisine pour la mémoire de projet : « aucun secret
  ne va dans ce dossier, il est versionné ». La même mise en garde doit être
  visible **au moment de la saisie**, pas dans une documentation annexe.
- Migration destructive : non applicable
- Nouvelle exposition publique : non — la route est sous jeton
- Risque identifié : **écriture de fichiers dans le dépôt depuis le réseau**.
  Atténuations : répertoire cible unique et calculé, nom normalisé par liste
  blanche, refus d'écrasement, relecture humaine obligatoire, aucun commit.
- **Au moins un « oui » → `security-reviewer` (rôle GATE) coché**

**Confirmation agents (spec-reader, à la promotion)** : la section ci-dessus
coche deux « oui » (auth/permissions ET données personnelles) →
`security-reviewer` rôle GATE est **requis**, P1 sur le design avant tout
code, P2 sur le diff réel (déjà coché en « Agents requis »). La spec crée un
écran de saisie et de relecture qui produit un fichier versionné dans le
dépôt : `ux-ui-designer` est **requis avant** `frontend-developer` (déjà
coché en « Agents requis »). Les deux gates sont donc actifs, pas seulement
cochés.

## Grandeurs mesurées

<!-- Ajoutée à la promotion par spec-reader : la spec affirmait des nombres
     sans les avoir mesurés dans le dépôt réel. -->

- **Répertoires du cycle** : 3 (`todo`, `doing`, `done`), lus depuis
  `control-center/backend/config.py` (bloc `colonnes`, lignes 46-48) —
  commande : `grep -n '"repertoire":' control-center/backend/config.py`.
- **`feature-NNN` et `bug-NNN` sont deux séries indépendantes** : confirmé —
  `bug-014-redaction-des-secrets-laisse-passer-les-minuscules.md` et
  `feature-014-apercu-effets-de-bord-echecs.md` coexistent dans le dépôt. Le
  numéro n'est donc jamais partagé entre les deux préfixes ; la numérotation
  de cette feature doit balayer chaque série séparément.
- **Prochain numéro libre par série** (commande :
  `ls specs/features/{todo,doing,done}/ | grep -oE '^(feature|bug)-[0-9]+' | sort -u`) :
  - `feature-` : série complète de 001 à 020, sans trou → prochain = **021**
  - `bug-` : série complète de 001 à 017, sans trou → prochain = **018**
- **Routes d'écriture avant ce lot** : **2** —
  `_ROUTES_ECRITURE = ("/api/lancer", "/api/interrompre")`
  (`control-center/backend/server.py:146`). Ce lot en ajoute **deux** :
  `/api/spec/brouillon` et `/api/spec/ecrire`. Total après ce lot :
  **4** routes.

  > **Addendum daté 2026-09-19** — la rédaction initiale de ce bloc disait
  > « une seule route ajoutée, total 3 », en réservant `_ROUTES_ECRITURE`
  > aux routes qui écrivent réellement. C'est **faux** : `_ROUTES_ECRITURE`
  > n'est pas une liste sémantique mais la **table de routage de `do_POST`**,
  > qui rend `404` à tout chemin absent d'elle, avant toute autre garde
  > (`server.py:891`). Hors liste, `/api/spec/brouillon` aurait été livré
  > inatteignable. Dans ce module, « route d'écriture » ne veut pas dire
  > « route qui écrit » mais « chemin que `do_POST` accepte de router ».
- **Baseline de tests avant ce lot** : **1627 cas, 0 échec, sur 21 fichiers
  `test_*.py`** (mesurée le 2026-09-19 ; `find control-center -type f -name
  'test_*.py' | wc -l` → 21, reconfirmé à la promotion).

## ADR attendu ?
- **Confirmé** : oui — [ADR-0027](../../../docs/adr/0027-le-centre-de-controle-ecrit-des-specs-il-n-en-valide-aucune.md)
- **Critère(s) retenus** : 1, 2, 3, 4 (architect, étape 2)
- **Sujet** : « Le centre de contrôle écrit des specs, il n'en valide
  aucune » — la frontière entre ce que l'outil écrit dans le dépôt et ce qui
  reste la main de l'humain, l'absence d'appel de modèle, le verrou court
  dédié (plutôt que celui de `feature-007`), la table des bornes de corps
  par route, et l'arbitrage central du cycle (le contenu relu est écrit
  verbatim, jamais régénéré).

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- `POST /api/spec/brouillon`, `POST /api/spec/ecrire`

### Écrans / flux UI concernés
- Écran de saisie d'un besoin, relecture du brouillon, écriture dans `todo/`

### Schéma BDD / migrations
- Aucun

### Documentation à produire / mettre à jour

#### Docs vivantes
- `control-center/README.md` — étape E

#### Docs transverses
- `docs/API.md` — les deux routes
- `CHANGELOG.md` — entrée sous 0.7.0

#### Docs immuables
- `docs/adr/NNNN-*.md` — si l'ADR pressenti est confirmé

## Critères d'acceptation
- [x] Un besoin saisi produit un fichier conforme au template **du projet**
- [x] Aucun bloc n'est rempli par invention : ce qui n'est pas déduit reste
      `[remplir]`
- [x] Un besoin mentionnant auth / permissions / données personnelles /
      paiement / migration produit le **template complet**, jamais le minimal
- [x] Aucune écriture n'a lieu sans action explicite après relecture
- [x] Un slug hostile (`../`, séparateurs) ne produit aucun fichier hors de
      `specs/features/todo/`
- [x] Deux créations simultanées ne produisent jamais deux specs au même numéro
- [x] `./tools/check_specs.sh` reste vert après une création
- [x] Suite de tests complète verte, zéro régression
- [x] Lint propre, pas de warning nouveau
- [x] Comportement nominal testé manuellement selon le plan ci-dessous

## Plan de test manuel
1. **Nominal** : saisir un besoin simple, relire, écrire, voir la spec
   apparaître dans la colonne « À faire » du Kanban.
2. **Escalade** : saisir un besoin mentionnant l'authentification — vérifier
   que le template complet est choisi et `security-reviewer` coché.
3. **Slug hostile** : saisir un titre contenant `../../etc/` — vérifier
   qu'aucun fichier n'apparaît hors du répertoire cible.
4. **Collision** : écrire deux brouillons de suite sans recharger la page —
   vérifier deux numéros distincts.
5. **Refus** : écrire un brouillon dont le nom existe déjà — erreur explicite,
   fichier existant intact.

> **Résultat mesuré (2026-09-19)** — scénarios 1 à 4 : ✅. Scénario 5 : **non
> reproductible en boîte noire**, et c'est une propriété du design, pas un
> manque. La numérotation `max+1` sous verrou rend la collision structurellement
> impossible — pré-créer le fichier cible ne fait qu'avancer le numéro (25 pris
> → 26 attribué, fichier intact). Le vrai `409` n'est atteignable que par une
> fenêtre TOCTOU, couverte par `test_T12_ecrire_collision_409` (HTTP réel,
> `numeros_pris` monkeypatché) et tuée par la mutation `O_EXCL` → `O_CREAT`.
> La garde existe et est gardée ; elle est vérifiée par un test interne plutôt
> que par une reproduction externe.

## Notes pour agent
- Le danger principal n'est pas technique mais documentaire : une spec
  **générée et non relue** a la forme d'une spec vraie. Le kit tient à
  l'honnêteté documentaire (« un diagnostic qui s'avère faux reste dans la
  spec, corrigé par un addendum daté ») ; une génération qui invente des
  contraintes ou des critères d'acceptation plausibles empoisonne cette
  discipline à la racine. D'où les `[remplir]` laissés visibles.
- La numérotation doit balayer `todo/`, `doing/` **et** `done/` :
  `check_specs.sh` signale déjà, sans bloquer, un même numéro porté par deux
  slugs — une référence `feature-042` dans un commit ou un ADR devient alors
  ambiguë.
- Rien n'oblige à faire appel à un modèle pour produire le brouillon. Si c'est
  le choix retenu, le plafond de dépense de feature-007 s'applique, et le
  texte saisi sort alors du poste : à dire explicitement dans l'interface.

## Hors périmètre
- La promotion `todo/ → doing/` : elle appartient à `spec-reader`
- Le lancement du cycle sur la spec créée : c'est feature-007
- La discussion attachée à une spec : c'est feature-009
- La modification d'une spec existante depuis l'interface

---
## Journal de bord

<!-- UNE ligne par étape du workflow, écrite QUAND L'ÉTAPE TOMBE, jamais à la
     clôture. Horodatage · étape · agent · verdict · preuve chiffrée ou livrables. -->

- [2026-09-19 00:00] Étape 1 — spec-reader — spec promue vers doing/, ~6 fichiers impactés (`server.py`, `specs.py`, `config.py`, module neuf de rédaction, `web/index.html` + `app.js`, suites `test_*.py`) ; baseline 1627 cas/0 échec sur 21 fichiers `test_*.py` ; 2 routes d'écriture avant ce lot, 4 attendues après (correction de l'agent principal : `do_POST` rend 404 à tout chemin hors `_ROUTES_ECRITURE`, `server.py:891` — un `POST /api/spec/brouillon` hors liste serait inatteignable) ; GATE `security-reviewer` et `ux-ui-designer` confirmés requis
- [2026-09-19 14:12] Étape 2 — architect — plan arrêté, **ADR-0027 requis** (critères 1/2/3/4, un seul ADR couvre aussi les décisions 2 et 3). Sept questions tranchées : (1) **aucun appel de modèle** — template du projet recopié octet pour octet, 6 substitutions déterministes, le texte ne quitte pas le poste, plafond de feature-007 sans objet ; (2) **flock court dédié** `var/numerotation.lock`, scan + `O_CREAT|O_EXCL` DANS le verrou — `verrou.py` écarté, donc `bug-011` n'entre PAS dans ce cycle (une seule spec dans `doing/`) ; (3) table `_TAILLES_MAX_CORPS` par route (brouillon 8192, écrire 65536 = 1,93× la plus grande spec du dépôt mesurée à 33 212 o), `/api/lancer` inchangé à 4096 ; (4) `507` **corrigé en `500`** (507 est WebDAV « disque plein », faux ici ; aucun code WebDAV dans ce serveur) ; (5) deux clés de config explicites, aucune arithmétique `racine/..` ; (6) numéro attribué **à l'écriture**, réconciliation `NNN` annoncée et comptée, `modele.md` n'a aucun champ ID (mesuré) ; (7) escalade **FAIL-CLOSED**, mots-clés en escalateur monotone jamais en portail (leçon `bug-014`)
- [2026-09-19 14:38] Étape 3 — security-reviewer (GATE P1, design) — **GO SOUS CONDITIONS**, 8 conditions numérotées : (1) `type` en enum fermé serveur et `slug` re-normalisé à l'écriture depuis des champs JSON dédiés, jamais lus dans le Markdown ni hérités du brouillon — `^[a-z0-9]+(-[a-z0-9]+)*$`, 1–60 car. ; (2) cible `join(racine_projet, specs.racine, "todo")` vérifiée par `vcs.chemin_sur()` ; (3) `os.open(O_WRONLY|O_CREAT|O_EXCL, 0o644)` DANS le flock ; (4) flock en `0o600`, fd fermé en `finally`, `503` après les gardes d'auth ; (5) **rien du texte saisi journalisé** — ni `_ecrire_evenement`, ni stderr, ni query string (`log_message` écrit la ligne de requête des 4xx/5xx dans `serveur.log` 0644), ni `localStorage` ; (6) 413 par route testé AVANT `rfile.read`, `close_connection = True` ; (7) mise en garde RGPD fixe visible avant saisie, finalité dans ADR-0027 ; (8) messages `500` sans chemin. Choix d'écarter `verrou.py` **validé**. Permission binaire **validée** (ADR-0020). **Hypothèse de l'architect mesurée et partiellement réfutée** : « le premier champ gagne » tient pour ID/Statut/Type dans les deux templates, mais `modele.md` n'ayant ni `Priorité` ni `Dernière mise à jour` en en-tête, un texte hostile les fournit depuis la ligne 34 — cosmétique (rendu `textContent`, `check_specs.sh` vert), à couvrir. Piège relevé : `## Description` est ligne 59 du template, le texte recopié tombe DANS la fenêtre `lignes_entete=60`
- [2026-09-19 14:41] Étape 4 — ux-ui-designer — design arrêté, **Option B** (panneau en flux dans `.demande`) contre Option A (modale) : **écartée explicitement parce que `bug-017` est ouvert** — rebâtir un piège de focus sur une action plus grave que l'authentification exposerait le même défaut. Contrainte posée au frontend : aucune surface `role="dialog"`/`.porte` pour ce flux tant que `bug-017` n'est pas corrigé. Machine à états calquée sur `pilotage` (`saisie → brouillon → confirmation-ecriture → ecrit`, `erreur` ne quitte jamais l'état courant). Les `[remplir]` se **comptent** (`aria-live=polite`), ils ne se surlignent pas — pas de coloration de sous-chaîne possible dans un `<textarea>`. Une seule règle CSS neuve (`.note.erreur`), tout le reste réutilise les classes existantes. Annulation de la dérogation par mot-clé sensible rendue **visible**, jamais silencieuse
- [2026-09-19 15:26] Étape 5b — frontend-developer — machine à états `saisie → brouillon → confirmation-ecriture → ecrit` en flux normal (aucun `role="dialog"`, contrainte `bug-017` tenue) ; 3 fichiers modifiés + `test_app_feature008.js` (46 cas) et son pont `.py` ; listes `IDS`/whitelists des 4 harnais existants mises à jour (PIEGES §7/§21) ; **46 cas neufs + 1013 existants verts, 7 mutations ciblées 7 tuées**. Livrables B1a–B1j. **Écart signalé, à trancher** : `/api/spec/ecrire` régénérerait le contenu depuis `{type,titre,texte,minimal}` et ignorerait le Markdown édité — le textarea de relecture serait alors modifiable sans effet
- [2026-09-19 15:44] Étape 5a — backend-developer — `config.py`, `specs.py`, `redaction_spec.py` [neuf], `server.py` (`_ROUTES_ECRITURE` 2→4, table `_TAILLES_MAX_CORPS`), assertion d'introspection de `test_server.py` mise à jour (ensemble EXACT à 4 routes, **pas contournée**) ; tests neufs `test_redaction_spec.py` (72 cas) + section T12 de `test_server_ecriture.py` (28 cas HTTP) ; **598 cas backend, 0 échec**. Livrables A1–A5. Piège 3 **neutralisé par exécution pour le template complet** (`_poser_titre` insère le H1 avant `## Métadonnées`, ce qui repousse `## Description` hors de la fenêtre `lignes_entete=60`) ; reste ouvert et documenté pour `modele.md`
- [2026-09-19 15:52] Étape 5a — agent principal — **DÉFAUT BLOQUANT mesuré par exécution** sur copie jetable : `ecrire_spec(config, genre, titre, texte, minimal_demande)` n'accepte aucun `contenu`, et le Markdown relu **puis corrigé** par l'humain est silencieusement jeté (correction présente dans le brouillon relu : oui ; dans le fichier écrit : non ; 14 `[remplir]` subsistants). Contredit la spec (« brouillon affiché intégralement **et modifiable** avant toute écriture ») et le GATE P1 lui-même, qui écrivait « `/ecrire` écrit ce que l'humain a relu ». La condition 1 de P1 ne contraint que `type` et `slug`, donc le **chemin**, jamais le contenu : sur-application. **Reboucle vers étape 5a**
- [2026-09-19 16:08] Étape 5a bis — backend-developer — correctif livré : `ecrire_spec(config, genre, titre, contenu)` écrit le Markdown relu **verbatim** ; `type`/`titre` restent des champs dédiés re-validés d'où le slug (donc le chemin) est re-dérivé — condition 1 du GATE P1 tenue à la lettre. `valider_ecriture` rend `422` si `contenu` absent/vide/non-`str`/>65536, **sans repli silencieux** sur la régénération. Tests : `test_redaction_spec.py` 81 cas dont `test_ecrire_spec_correction_humaine_survit_verbatim_a_l_ecriture` (**vu échouer sur l'ancien code avant patch**), `test_ecrire_spec_contenu_absent_422`, `test_ecrire_spec_contenu_hostile_chemin_confine_a_todo` ; `test_server_ecriture.py` T12 106 cas (scénario HTTP bout en bout brouillon → correction → écriture → relecture du fichier réel). **606 cas backend, 0 échec.** Vérifié par l'agent principal sur copie jetable : correction présente dans le fichier écrit, chemin `specs/features/todo/feature-021-essai-de-relecture.md`, `- **ID** : feature-021`
- [2026-09-19 16:11] Étape 5b bis — agent principal — **rupture d'intégration mesurée** : `app.js` envoie toujours `{type, titre, texte, minimal}` sans `contenu`, ce qui donnerait `422` à chaque écriture. Reboucle vers frontend-developer, avec retrait des deux notes devenues fausses (« vos modifications ne seront pas persistées ») et des commentaires périmés de `app.js` l.2253-2260 et l.2580-2584
- [2026-09-19 16:24] Étape 5b bis — frontend-developer — `/api/spec/ecrire` envoie `{type, titre, contenu}`, `texte`/`minimal` retirés de cette route ; deux notes devenues fausses retirées, commentaires périmés corrigés ; `422` géré comme le `409`. **Défaut de second ordre trouvé et corrigé en chemin** : `surClicDemanderEcriture` flushe désormais le débounce en lisant `#brouillon-contenu` avant de quitter la phase brouillon — sans quoi une frappe dans les 300 ms précédant le clic était perdue (inoffensif quand le contenu était régénéré, réel maintenant qu'il est écrit verbatim). `test_app_feature008.js` 46 → 52 cas dont `N_regression_contenu_toujours_envoye_et_verbatim` ; 3 mutations tuées
- [2026-09-19 16:27] Intégration — agent principal — suite complète **1796 cas, 0 échec, 23 fichiers** (baseline mesurée à l'ouverture du cycle : 1627 cas / 21 fichiers, soit +169 cas et +2 fichiers)
- [2026-09-19 16:52] Étape 6 — security-reviewer (GATE P2, diff réel) — **GO SOUS CONDITIONS**, 2 conditions. Conditions P1 1–4, 6, 8 **vérifiées par exécution** : 10 titres hostiles (`../../etc/passwd` → `etc-passwd`, NUL, `_`, non-ASCII, emoji seul → `422`), 7 contenus hostiles — chemin **toujours** `specs/features/todo/feature-NNN-<slug>.md` ; symlink externe sur `todo` → `500 chemin non conforme`, rien écrit ; `todo` absent → `500`, non recréé ; `409` forcé : hash **et** mtime identiques ; **8 threads sur barrière → 8× `201`, numéros 35–42 distincts** ; `413` à 65537/8193/4097 **sans lire le corps**, 65536 exact → `201` ; aucun chemin absolu dans un `500` ; anonyme distant → `401`/`404` à corps fixes. Condition 5 **tenue** : chaîne témoin absente de stderr, `var/`, et de toutes les réponses. 4 routes exactes, `do_*` = {GET, POST}, test d'introspection **mis à jour et non contourné**, aucun `git`/`subprocess`/`rename` dans le module. **Condition 1 = DÉFAUT RÉEL** : `os.open(O_EXCL)` précède `encode("utf-8")`, donc un substitut isolé (`"\ud800"`, JSON valide) lève `UnicodeEncodeError` APRÈS création — fichier **vide** laissé dans `todo/` et **numéro brûlé** (mesuré : `feature-034-surrogate.md`). **Condition 2** : ADR-0027 doit écrire que l'escalade fail-closed n'agit qu'au brouillon et que `/ecrire` prend un contenu arbitraire, acceptable parce que le porteur du jeton est déjà l'opérateur complet (ADR-0020) — la garde réelle reste la relecture humaine, jamais le serveur. **Reboucle vers étape 5a**
- [2026-09-19 16:54] Hors lot — signalé par le GATE P2, sans rapport avec feature-008 : `.claude/settings.json` (déjà modifié avant ce cycle) ajoute `Edit`, `Write`, `Bash` à `allow` sans motif. Non touché, **ne doit pas être committé avec ce lot**
- [2026-09-19 17:06] Étape 5a ter — backend-developer — condition 1 du GATE P2 levée : `contenu_final.encode("utf-8")` passe **AVANT** `os.open(O_EXCL)`, `UnicodeEncodeError` → `422` (saisie invalide, pas panne serveur). 4 tests ajoutés dont `test_surrogate_numero_non_consomme` et `test_surrogate_numero_reellement_reattribue` ; **vu échouer sur l'ancien code** (le test interrompait même toute la suite, `UnicodeEncodeError` non rattrapée). Hygiène : `chemin_verrou` rendu injectable, les suites n'écrivent plus dans le `var/` réel (vérifié : plus de `numerotation.lock`) ; cas `409` confirmés passer par monkeypatch de `numeros_pris`, jamais par pré-création absorbée par `max+1`. Vérifié par l'agent principal sur copie jetable : `422 contenu invalide : caractère non encodable en UTF-8`, aucun fichier créé, écriture suivante obtient bien le numéro 21
- [2026-09-19 17:48] Étape 7 — test-engineer — **1804 cas, 0 échec, 23 fichiers** (baseline 1627/21 → +177 cas, +2 fichiers) ; re-mesuré indépendamment par l'agent principal, concordant. **Mutation : 10 mutants / 10 tués**, dont 1 **survivant trouvé puis corrigé** — la régénération du contenu (le défaut central du cycle) **survivait** aux deux tests censés la garder, parce qu'ils cherchaient une **sous-chaîne** : en régénérant, le contenu corrigé était réinjecté dans une section « Description » fraîche, donc la sous-chaîne restait présente. Renforcé par une **égalité octet pour octet** (module + HTTP) → tué. `test_routes_ecriture_fermees` prouvé par exécution : une 5e route non déclarée le fait échouer (47 → 1 échec). Trou comblé : le seul test de concurrence persisté n'utilisait que 2 threads en appel direct ; ajout de `test_T12_concurrence_8_threads_*` (8 threads réels sur `Barrier`, HTTP complet) — sans lui, le mutant « flock retiré » n'était détecté que de façon probabiliste. Lint : aucun linter configuré pour le module, `py_compile` + `node --check` 0 erreur 0 warning. 5 scénarios manuels exécutés : 4 ✅, le 5e (refus sur nom pris) **non reproductible en boîte noire** — la numérotation `max+1` sous verrou évite structurellement la collision ; le vrai `409` n'est atteignable que par fenêtre TOCTOU, couverte par `test_T12_ecrire_collision_409` et tuée par la mutation `O_EXCL`→`O_CREAT`. `check_specs.sh`/`check_doc_links.sh` verts avant (38 specs/83 liens) et après création réelle de 6 specs sur clone jetable (44/83). Dépôt réel vérifié intact : 38 specs, aucun `numerotation.lock`. Livrables D1a–D1h
- [2026-09-19 18:20] Étape 8 — code-reviewer — **REQUEST CHANGES** : 3 points bloquants. (1) `app.js:2410`/`:2530` — le `401` sortait sans remettre `enCoursBrouillon`/`enCoursEcriture` à `false` ni redessiner : panneau bloqué, **le Markdown relu et corrigé n'était récupérable que par un rechargement qui le détruit** — la propriété même que deux reboucles ont payée. (2) `redaction_spec.py:471` — la garde de confinement **survit à la mutation `if False:` sur la suite entière** (1803 cas, 0 échec) : elle fonctionne (vérifiée à la main par le GATE P2) mais **aucun test ne la tient**. (3) `.claude/settings.json`, hors lot, ne doit pas entrer dans le commit. Prises de position : `_ROUTES_ECRITURE` = 4 et test d'introspection **non contourné** (le risque nommé par ADR-0019 n'a pas été pris) ; ordre des gardes intact ; bornes vérifiées à 8193/65537/4097 et aux valeurs exactes, `/api/lancer` toujours à 4096 ; confinement/non-écrasement/atomicité tiennent **par construction** ; 4 contenus hostiles ne déplacent jamais le chemin ; 14 `[remplir]` restants (complet) / 3 (minimal), aucune invention ; témoin absent de stderr/`var/`/réponses. Réserve pour l'ADR : la cible est `colonnes()[0][0]`, « première colonne configurée », pas littéralement `todo`
- [2026-09-19 18:31] Étape 5b ter — frontend-developer — point (1) corrigé aux deux endroits : drapeaux remis à `false` et `rendreRedaction()` **avant** `sur401Lecture()`. **Vu échouer avant patch** (3 échecs : boutons restés `disabled`). Audit PIEGES §22 des autres sorties anticipées : les branches 200/201, 422/409/503/500 et les deux `catch` réinitialisaient déjà leur drapeau — seuls les deux `401` en étaient dispensés. `test401NeBloqueJamaisLesBoutonsNiNePerdLeMarkdown` ajouté (52 → 58 cas)
- [2026-09-19 18:52] Étape 5a quater — backend-developer — points mineurs de revue traités : en-tête de `server.py` corrigé (« étape D, la première route d'écriture » → « étape E : quatre routes »), section « Ce qui a changé depuis l'étape D » ajoutée ; `appliquer_numero` cible désormais le **bloc `## Métadonnées`** via une nouvelle `_plage_section()` (structure Markdown) au lieu de la première ligne `- **ID** :` du document — un ID forgé dans un bloc de code avant les métadonnées ne capte plus le numéro. 2 tests ajoutés
- [2026-09-19 18:58] Étape 7 bis — test-engineer — garde de confinement désormais **tenue par un test** : `todo/` symlinké hors du dépôt jetable, re-mutation `if False:` sur `redaction_spec.py:509` → **93 cas, 2 échecs**, tuée proprement sans bruit. **La démarche systématique a trouvé 2 gardes de plus non couvertes** : `preparer_brouillon:415` et `ecrire_spec:592` (`if not slug_valide(slug)`), toutes deux `if False:` → tuées après ajout de tests. Distinction retenue : muter **la garde** n'est pas muter **ce qu'elle appelle** — inverser `chemin_sur` casse aussi le nominal et meurt pour une mauvaise raison, neutraliser la garde n'ouvre que le cas hostile, que personne ne couvrait. **Risque résiduel écrit** : 4 gardes non auditées (`template introuvable` ×2, `colonnes vide`, `verrou 503` par timeout) — hors périmètre de la reboucle, à traiter ultérieurement. **1817 cas, 0 échec, 23 fichiers**, re-mesuré indépendamment par l'agent principal, concordant
- [2026-09-19 19:02] Intégration — agent principal — vérifié que les éditions **concurrentes** de `backend-developer` et `test-engineer` sur `test_redaction_spec.py` ont fusionné sans écrasement (les 4 tests des deux agents présents), aucun résidu de mutation dans le code (`grep MUTANT` / `if False:` → un seul commentaire explicatif). Dispatcher deux agents en parallèle sur un même fichier de test était une erreur de conduite de ma part ; elle n'a pas coûté de perte, elle a coûté de la flakiness observée par les deux
- [2026-09-19 19:24] Étape 8 bis — code-reviewer — **APPROVED** (réserve non-code : `.claude/settings.json` hors commit). Re-vérifié **par exécution** : après `401`, boutons `disabled=false` et 4 enfants conservés sur les deux branches ; `if False:` sur le confinement → 2 échecs ; les trois `slug_valide` mutés **un par un** → 1 échec chacun, chacun par son propre test ; ID forgé en bloc de code avant `## Métadonnées` ne capte plus le numéro (`feature-666` et `feature-777` intacts, seul le bloc reçoit `feature-021`). 1816 cas dans le clone contre 1817 sur le dépôt — écart PIEGES §32 (`docs/` absent), pas une régression. **Mineur nouveau, non bloquant** : `test_app_feature008.js:178` — le `getElementById` du bac à sable ne connaît que les ids du HTML statique, donc `$("brouillon-contenu")` et `$("bouton-ecrire-spec")` valent toujours `null` : le flush du débounce et le retour de focus **ne sont exercés par aucun test** (corrects en vrai navigateur, à couvrir hors de ce cycle)

---
# Notes d'implémentation

## Plan (architect)
- Aucun appel de modèle : brouillon = template du projet recopié octet pour
  octet, six substitutions déterministes ; plafond de `feature-007` sans objet
- Verrou court dédié (`var/numerotation.lock`, flock), `verrou.py` (écrivain
  unique de `feature-007`) écarté — sa méta `pid_fils`/`starttime` est sans
  objet, son `409` d'orphelin n'est levable par aucun chemin d'interface
  (`bug-011` reste hors cycle)
- Table `_TAILLES_MAX_CORPS` par route : brouillon 8192, écrire 65536 (1,93×
  la plus grande spec du dépôt)
- `507` corrigé en `500` (507 est un code WebDAV, absent de ce serveur)
- Numéro attribué à l'écriture, jamais dans le brouillon ; réconciliation par
  bloc `## Métadonnées`, jamais par position de ligne
- Escalade fail-closed : mots-clés sensibles en escalateur monotone (annulent
  une dérogation, ne l'accordent jamais)
- ADR : ADR-0027 à créer — « Le centre de contrôle écrit des specs, il n'en
  valide aucune »

## Validation security-reviewer, rôle GATE
- **P1 (design)** — Verdict : GO SOUS CONDITIONS
  - 8 conditions (type en enum fermé + slug re-normalisé, confinement par
    `vcs.chemin_sur()`, `O_EXCL` dans le flock, permissions 0600 du verrou,
    aucune trace du texte saisi dans les journaux, 413 avant lecture du
    corps, mise en garde RGPD visible à la saisie, messages 500 sans chemin)
- **P2 (diff)** — Verdict : GO SOUS CONDITIONS puis GO (re-vérifié étape 8 bis)
  - Points vérifiés : auth (jeton, 4 routes exactes), permissions (aucune),
    injections (chemin confiné, aucun `git`/`subprocess`), données
    personnelles (aucune trace en clair), secrets (témoin absent de
    stderr/`var/`/réponses), migration (non applicable)
  - Défaut réel trouvé et corrigé en cours de cycle : `O_EXCL` précédait
    l'encodage UTF-8 du contenu, laissant un fichier vide et un numéro brûlé
    sur une saisie inencodable — corrigé (encodage avant ouverture, `422`)

## Implémentation
- **Fichiers créés** : `control-center/backend/redaction_spec.py`,
  `control-center/backend/test_redaction_spec.py` (93 cas),
  `control-center/web/test_app_feature008.js` (52 cas JS) +
  `control-center/web/test_app_feature008.py` (pont, 58 cas rapportés côté
  Node)
- **Fichiers modifiés** : `control-center/backend/server.py`
  (`_ROUTES_ECRITURE` 2→4, `_TAILLES_MAX_CORPS`, routes `_spec_brouillon`/
  `_spec_ecrire`), `control-center/backend/config.py` (chemins de template),
  `control-center/backend/specs.py` (numérotation), `control-center/web/app.js`
  et `index.html` (machine à états saisie → brouillon → confirmation →
  écriture), `control-center/backend/test_server.py` (assertion
  d'introspection des 4 routes), `control-center/backend/test_server_ecriture.py`
  (section T12, 109 cas)
- **Choix d'implémentation / écarts par rapport au plan** : la première
  version de `ecrire_spec` régénérait le contenu depuis `{titre, texte}` au
  lieu d'écrire le `contenu` relu — défaut trouvé par l'agent principal sur
  copie jetable, corrigé en cours de cycle (voir ADR-0027 §7 et le journal
  de bord, étapes 5a/5a bis) ; `appliquer_numero` restreint désormais sa
  recherche au bloc `## Métadonnées` plutôt qu'à la première ligne `- **ID**
  :` du document, suite à un point de revue de code

## Tests (test-engineer)
- Suite complète : 1817/1817 cas verts, 0 échec, 23 fichiers `test_*.py`
  (baseline avant ce lot : 1627 cas / 21 fichiers)
- Tests ajoutés : ~190 cas nouveaux (backend `test_redaction_spec.py` +
  section T12 de `test_server_ecriture.py`, frontend `test_app_feature008.js`)
  couvrant nominal, escalade, slug hostile, collision, refus d'écrasement,
  concurrence 8 threads, contenu inencodable, confinement (symlink)
- Mutation : 10 mutants posés un par un en fin de cycle, 10 tués ; un
  survivant trouvé en cours de route (régénération du contenu masquée par
  une assertion en sous-chaîne) puis tué par une égalité octet pour octet ;
  trois gardes trouvées non couvertes par la démarche systématique
  (confinement, deux `slug_valide`) puis couvertes
- Lint : aucun linter configuré pour ce module (PIEGES §6) ; `py_compile` +
  `node --check` : 0 erreur, 0 warning

## Revue (code-reviewer)
- **Verdict** : Approved (après une reboucle — REQUEST CHANGES initial, 3
  points)
- **Points relevés** :
  - un `401` en lecture du brouillon laissait les boutons `disabled` et le
    Markdown relu irrécupérable sans rechargement — corrigé
  - la garde de confinement passait une mutation `if False:` sans qu'aucun
    test ne la tienne — corrigé (todo/ symlinké dans le harnais de test)
  - `.claude/settings.json`, hors lot — non touché, signalé pour exclusion
    du commit

## Doc (doc-writer)
- `docs/API.md` — note d'arbitrage ajoutée : les routes du centre de
  contrôle restent documentées dans `control-center/README.md`
- `control-center/README.md` — section « Étape E », état d'avancement et
  section Tests mis à jour (1817 cas / 23 fichiers, mesure directe)
- `CHANGELOG.md` — entrée sous version 0.12.0 (la métadonnée « 0.7.0 » de
  cette spec était périmée : cette version est déjà publiée depuis le
  2026-09-13, avant ce cycle)
- `docs/adr/0027-le-centre-de-controle-ecrit-des-specs-il-n-en-valide-aucune.md`
  — créé, indexé dans `docs/adr/README.md`
- `control-center/PIEGES.md` — 5 entrées ajoutées (routage de
  `_ROUTES_ECRITURE`, clone incomplet pour ce module, mutation en boucle
  shell, `__pycache__` non invalidé, garde neutralisée à tort)

## Statut final
En attente de clôture par l'agent principal (déplacement vers `done/`).
- [2026-09-19 19:58] Étape 9 — doc-writer — `control-center/README.md` (étape E livrée, section dédiée, compte de tests **1817 / 0 échec** re-mesuré par lui-même contre les 471/13 périmés), **ADR-0027 créé** (`0027-le-centre-de-controle-ecrit-des-specs-il-n-en-valide-aucune.md`, critères 1-2-3-4, couvre la frontière, l'absence de modèle, l'exclusion motivée du verrou d'écrivain, la table des bornes, la condition 2 du GATE P2 et la réserve `colonnes()[0][0]`), `docs/adr/README.md` indexé, `PIEGES.md` §1 amendé (le clone jetable doit inclure `_template.md` et `modele.md`) + **6 entrées neuves §34-§39**, aucun retrait justifié. **`docs/API.md` : arbitrage tranché et écrit** — il reste le contrat de l'application hôte ; les routes du centre de contrôle restent dans son README, sans exception créée par ce lot. **Écart de version relevé et corrigé** : la spec visait `0.7.0`, déjà publiée le 2026-09-13 (métadonnée écrite le 2026-09-12, avant les cycles 0.8.0 à 0.11.1) → entrée sous **`0.12.0`**, écart documenté en tête plutôt que tu. Livrable C1
- [2026-09-19 20:04] Clôture — agent principal — vérification finale : **1817 cas, 0 échec, 23 fichiers** ; `check_specs.sh` ✅ 38 specs ; `check_doc_links.sh` ✅ 103 liens ; seules restent décochées les 3 cases « Domaines touchés » sans objet (BDD/migrations, intégrations externes, tâches de fond). Spec promue vers `done/` par `git mv`

## Statut final
✅ Done — 2026-09-19 — non commité (aucune demande de commit de l'utilisateur)
