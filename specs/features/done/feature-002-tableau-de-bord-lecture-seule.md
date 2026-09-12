## Métadonnées
- **ID** : feature-002
- **Slug** : tableau-de-bord-lecture-seule
- **Type** : feature
- **Statut** : done (étape C du centre de contrôle ; étapes D à G explicitement non livrées)
- **Priorité** : haute
- **Version cible** : 0.5.0 (commit `a84bc10`)
- **Dernière mise à jour** : 2026-09-12
- **Spec(s) liée(s)** : feature-001 (journal et lecteurs, consommés ici)

> Spec rétroactive, écrite depuis le commit `a84bc10` et
> `control-center/backend/server.py`. Le tableau de bord et les lecteurs de
> feature-001 sont livrés dans le **même commit** ; cette spec isole la partie
> serveur HTTP + interface, comme le fait déjà `control-center/README.md`
> (« Étape C »).

## Domaines touchés
- [x] API REST (endpoints, contrats, codes d'erreur) — `GET /api/etat`,
      `GET /api/spec`, `GET /api/diff`, `GET /api/flux`, fichiers statiques
- [x] Frontend (écrans, composants, appels API) — SPA vanilla JS Kanban /
      agents / timeline
- [ ] BDD / migrations
- [ ] Auth / permissions — délibérément absent, voir ADR-0004
- [x] Données personnelles — `transcript_path` du journal pointe hors du
      dépôt vers la conversation complète ; filtré avant de sortir du serveur
- [ ] Intégrations externes
- [ ] Tâches de fond

## Agents requis
- [x] spec-reader
- [x] architect — a posé le principe « aucune route d'écriture » avant toute
      autre décision (ADR-0004)
- [x] security-reviewer, rôle GATE — serveur HTTP destiné à écouter au-delà
      de localhost
- [ ] ux-ui-designer
- [x] backend-developer — `server.py`
- [x] frontend-developer — `web/index.html`, `app.js`, `app.css`
- [x] test-engineer — 30 cas, dont un par introspection de classe
- [x] code-reviewer
- [x] doc-writer

## Description
Interface web d'observation des workflows Claude Code : tableau Kanban des
specs (colonne dérivée du répertoire, cf. feature-001), liste des agents
détectés, timeline des passages reconstruits depuis le journal d'événements,
mise à jour en direct par un flux SSE. **Aucune route d'écriture** : le
serveur ne peut ni lancer, ni écrire, ni dépenser quoi que ce soit.

## Contexte
Le journal d'événements et les lecteurs (feature-001) produisaient une
matière exploitable mais sans façade : il fallait lire du JSON à la main pour
savoir ce qui s'était passé. Le tableau de bord rend ce même contenu lisible,
sans ajouter aucune capacité d'action — un choix délibéré et daté : les
garde-fous d'un futur pilotage (jeton, écrivain unique, plafond de dépense)
existent déjà en configuration (`control-center.toml`) mais ne sont
**appliqués par aucun code**, et les laisser inertes n'est acceptable que
parce qu'aucune route ne peut en avoir besoin pour l'instant.

## Comportement livré

### La garantie est structurelle, pas réglementaire
`Handler` (sous-classe de `BaseHTTPRequestHandler`) ne définit **ni
`do_POST`, ni `do_PUT`, ni `do_DELETE`**. Ce n'est pas une route désactivée
par une option : ces méthodes n'existent pas dans la classe, donc
`http.server` répond **501 Not Implemented** de lui-même à toute tentative.
Deux tests le verrouillent : un par requête HTTP réelle, un par
**introspection de la classe** — si une route d'écriture est ajoutée un jour,
le second échoue même si le comportement observé en HTTP restait masqué par
ailleurs.

### Endpoints livrés (tous `GET`)
- `GET /api/etat` — état agrégé (specs, agents, workflows reconstruits)
- `GET /api/spec` — contenu d'une spec, identifiant validé contre la liste
  des specs réellement découvertes (aucun chemin construit depuis la requête)
- `GET /api/diff` — diff git, via `vcs.chemin_sur()` (liens symboliques
  résolus, sortie du dépôt refusée)
- `GET /api/flux` — SSE : envoie l'événement `maj` (un signal, pas l'état) ;
  le navigateur redemande alors `/api/etat`. L'empreinte de changement
  **exclut l'horodatage**, sans quoi l'interface se rafraîchirait en boucle.
- fichiers statiques de `web/` — liste **fermée**, calculée au démarrage ;
  l'extension du fichier tranche (`.html`, `.css`, `.js`, `.svg`), pas
  l'existence sur disque

### `transcript_path` : filtrage explicite, pas un oubli
Ce champ du journal pointe **hors du dépôt**, vers le fichier de conversation
complet. Une liste blanche **positive** de champs sert les événements au
navigateur (`_evenement_public()`) : un champ neuf apparu dans le journal ne
sort pas tant qu'il n'y est pas ajouté explicitement.

### Interface
SPA vanilla JS (`web/index.html`, `web/app.js`, `web/app.css`) : Kanban des
specs, liste des agents, timeline des workflows reconstruits. Pas de
framework, pas de dépendance de build.

## Comportement actuel (avant ce travail)
Aucun serveur, aucune interface : la seule façon de connaître l'état d'un
cycle était de lire les fichiers de specs et le journal brut.

## Contraintes techniques
- Bibliothèque standard Python uniquement (`http.server`), aucune dépendance
  d'exécution (ADR-0006, partagé avec feature-001)
- Défaut réseau : écoute **locale uniquement** ; ouvrir au réseau est une
  décision explicite du projet consommateur, jamais un héritage silencieux
- Défaut commandes : **aucune commande lançable** sans déclaration explicite
  dans `control-center.toml` — préparatoire à l'étape D, non exploité ici
- Trois familles de chemins (statiques, specs, diffs), trois validations
  distinctes, aucune arithmétique de chemin improvisée

## Fichiers concernés
- `control-center/backend/server.py` — serveur HTTP, SSE, routage `GET` seul
- `control-center/backend/test_server.py` — 30 cas (2 sautés : capture
  d'écran headless impossible, la connexion SSE reste ouverte au-delà du
  budget de temps virtuel de Chromium)
- `control-center/web/index.html`, `app.js`, `app.css` — interface
- `control-center/backend/config.py` — bornes de sûreté déclarées (défaut
  local, aucune commande), consommées ici pour l'écoute réseau

## Livrables — check-list
- [x] A1 — `Handler` sans `do_POST`/`do_PUT`/`do_DELETE`, 501 par construction
- [x] A2 — Test d'introspection de classe verrouillant l'absence de route d'écriture
- [x] A3 — `/api/etat`, `/api/spec`, `/api/diff`, `/api/flux` (SSE)
- [x] A4 — Liste fermée de fichiers statiques, calculée au démarrage
- [x] A5 — Filtrage de `transcript_path` par liste blanche positive de champs
- [x] B1 — Interface Kanban / agents / timeline, vanilla JS
- [ ] B2 — Vérification visuelle de l'interface — non faite : capture headless
      impossible (SSE + budget de temps virtuel Chromium), cf. « Ce qui n'est
      pas vérifié »
- [x] D1 — 30 cas de test, dont 2 sautés explicitement

## Sécurité & données
- Authentification touchée : non — **délibérément absente**, parce
  qu'aucune route ne peut écrire (voir ADR-0004)
- Permissions / rôles touchés : non
- Données personnelles collectées ou traitées : oui — `transcript_path`
  existe dans le journal source mais est retiré avant de sortir du serveur
- Migration destructive : non applicable
- Nouvelle exposition publique (endpoint sans auth) : oui, en local par
  défaut — justification : lecture seule structurelle (pas de `do_POST`),
  écoute réseau non activée par défaut
- Risque identifié : un projet qui ouvrirait l'écoute au réseau sans ajouter
  de jeton exposerait en lecture le contenu des specs et des diffs à qui
  atteint le port — acceptable tant qu'aucune donnée sensible ne transite par
  les specs elles-mêmes, à la charge du projet consommateur

## ADR produits
- **ADR-0004** (`docs/adr/0004-centre-controle-sans-route-ecriture.md`) —
  aucune route d'écriture tant que les garde-fous ne sont pas du code
- **ADR-0005** (`docs/adr/0005-commandes-liste-fermee-par-cle.md`) — les
  commandes lançables (préparation de l'étape D) sont une liste fermée par clé
  de configuration, jamais une chaîne venue du réseau
- **ADR-0006** — zéro dépendance d'exécution (partagé avec feature-001)

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- `GET /api/etat`, `GET /api/spec`, `GET /api/diff`, `GET /api/flux` (SSE) — tous en lecture seule

### Écrans / flux UI concernés
- Tableau Kanban des specs, liste des agents détectés, timeline des workflows
  reconstruits, rafraîchie en direct par SSE

### Documentation produite / mise à jour
- `control-center/README.md` — section « Étape C — le tableau de bord »,
  tableau d'avancement des étapes A à G

## Critères d'acceptation
- [x] Aucune requête `POST`/`PUT`/`DELETE` ne peut produire d'effet — vérifié
      par requête HTTP réelle et par introspection de classe
- [x] `transcript_path` n'atteint jamais le navigateur
- [x] Le flux SSE ne renvoie qu'un signal, jamais l'état lui-même
- [x] Suite de tests verte (30 cas, 2 sautés explicitement documentés), zéro régression
- [ ] Comportement nominal testé manuellement selon un plan écrit — non fait,
      voir ci-dessous

## Ce qui n'a pas pu être vérifié
L'**apparence** de l'interface. Une capture headless n'aboutit pas : la page
garde une connexion SSE ouverte, que le budget de temps virtuel de Chromium
ne peut pas faire expirer. Le comportement HTTP est testé ; le rendu visuel
ne l'est pas — état d'avancement affiché tel quel dans
`control-center/README.md` (« ✅ livré · apparence non vérifiée »).

## Notes pour agent
- Les garde-fous de l'étape D (jeton, écrivain unique, plafond de dépense)
  devront devenir du code **avant**, et non après, l'ajout de la première
  route qui écrit — c'est explicitement la condition posée par ADR-0004.
- Le décompte « 108 appels d'outils sur 110 » cité dans le README vient du
  projet d'origine (`esp32-pool-controller`), pas de ce dépôt : à citer pour
  expliquer pourquoi la conception est ce qu'elle est, jamais comme une
  mesure de ce dépôt-ci.

## Hors périmètre
- Étape D — lancement d'un workflow depuis l'interface (non livrée)
- Étape E — création d'une spec depuis un prompt (non livrée)
- Étape F — discussion par spec (non livrée)
- Étape G — scénario complet avec échec réel (non livrée)
- Vérification de rendu visuel automatisée (bloquée par SSE + Chromium headless)
