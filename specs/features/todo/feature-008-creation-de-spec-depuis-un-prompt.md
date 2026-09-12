## Métadonnées
- **ID** : feature-008
- **Slug** : creation-de-spec-depuis-un-prompt
- **Type** : feature
- **Statut** : todo
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
- [ ] A1 — Numérotation NNN atomique, jamais réutilisée, tirée des trois répertoires
- [ ] A2 — Normalisation du slug par liste blanche de caractères
- [ ] A3 — Brouillon conforme au template **du projet**, blocs non déduits
      laissés `[remplir]`
- [ ] A4 — Règle d'escalade appliquée : sujet sensible → template complet
- [ ] A5 — Écriture confinée à `specs/features/todo/`, jamais d'écrasement
- [ ] B1 — Saisie, relecture intégrale, modification, deux actions distinctes
- [ ] C1 — `control-center/README.md`, `docs/API.md`, `CHANGELOG.md`
- [ ] D1 — Cas validés par mutation, dont la normalisation du slug et le confinement

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

## ADR attendu ?
- **Probable** : oui
- **Critère(s) candidat(s)** : 1, 3
- **Sujet pressenti** : « L'outil écrit des specs, il n'en valide aucune » —
  où passe la frontière entre ce que le centre de contrôle peut écrire dans le
  dépôt et ce qui reste la main de l'humain ou d'un agent. La décision engage
  les étapes F et G, et elle est invisible dans le code une fois prise.

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
- [ ] Un besoin saisi produit un fichier conforme au template **du projet**
- [ ] Aucun bloc n'est rempli par invention : ce qui n'est pas déduit reste
      `[remplir]`
- [ ] Un besoin mentionnant auth / permissions / données personnelles /
      paiement / migration produit le **template complet**, jamais le minimal
- [ ] Aucune écriture n'a lieu sans action explicite après relecture
- [ ] Un slug hostile (`../`, séparateurs) ne produit aucun fichier hors de
      `specs/features/todo/`
- [ ] Deux créations simultanées ne produisent jamais deux specs au même numéro
- [ ] `./tools/check_specs.sh` reste vert après une création
- [ ] Suite de tests complète verte, zéro régression
- [ ] Lint propre, pas de warning nouveau
- [ ] Comportement nominal testé manuellement selon le plan ci-dessous

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
