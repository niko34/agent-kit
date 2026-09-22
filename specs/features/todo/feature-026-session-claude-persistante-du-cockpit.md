# Une session Claude persistante, authentifiée depuis le cockpit

## Métadonnées

- **ID** : feature-026
- **Slug** : session-claude-persistante-du-cockpit
- **Type** : feature
- **Statut** : todo
- **Priorité** : normale
- **Version cible** : [à fixer par l'agent qui reprend cette spec]
- **Dernière mise à jour** : 2026-09-22
- **Spec(s) liée(s)** : `feature-022` (conversation permanente — fournit le canal `stdin`
  dont cette spec dépend), `feature-023` (tokens par passage — bénéficie de
  `projectsDirectory`), `ADR-0020` (un centre de contrôle appartient à un développeur),
  `ADR-0005` (le réseau fournit une clé, la configuration fournit la forme)

## Grandeurs mesurées

Toutes relevées le **2026-09-22** sur ce conteneur, `claude` **2.1.278**.

- `CLAUDE_CONFIG_DIR` **existe dans le binaire** et **agit** — `strings` le trouve ; un
  appel avec la variable posée sur un répertoire neuf y crée `.claude.json` et `backups`
  au lieu d'écrire sous `~/.claude/`. ⚠️ **Absent de `claude --help`**, qui n'expose que
  `CLAUDE_CODE_SAFE_MODE` et `CLAUDE_CODE_SIMPLE`.
- Fichier d'identité : **`~/.claude/.credentials.json`, mode `0600`** — **un par
  répertoire de configuration**, mesuré par `ls -la`.
- Les deux services existants partagent donc **un seul compte** : `systemctl cat` donne
  `User=root` pour `claude-remote-kit.service` **et** `claude-remote.service`. Ils
  séparent déjà `TMUX_TMPDIR` (`/run/tmux-kit` contre `/run/tmux-pool`) et
  `WorkingDirectory`, **jamais l'identité**.
- `claude auth login` n'a **aucun** drapeau de jeton : `--claudeai`, `--console`,
  `--email` (qui **pré-remplit seulement** la page), `--sso`. La seule voie non
  interactive documentée est `ANTHROPIC_API_KEY` ou `apiKeyHelper` via `--settings` —
  **facturation Console, pas l'abonnement**.
- L'URL d'autorisation est **imprimée sur la sortie standard** et donc capturable.
- `redirect_uri` = **`https://platform.claude.com/oauth/code/callback`** — le retour va
  **chez Anthropic**, jamais sur un `localhost` de la machine.
- Le binaire attend ensuite `Paste code here if prompted >` **sur `stdin`**.
- `claude auth status` rend du **JSON lisible par machine** : `loggedIn`, `authMethod`,
  `apiProvider`, **`projectsDirectory`**.

## Domaines touchés

- [x] API REST (endpoints, contrats, codes d'erreur)
- [x] Frontend (écrans, composants, appels API)
- [ ] BDD / migrations — **sans objet**, aucune base dans ce module
- [x] Auth / permissions → **passage obligatoire par `security-reviewer` (rôle GATE)**
- [x] Données personnelles → **passage obligatoire par `security-reviewer` (rôle GATE)**
- [ ] Intégrations externes
- [x] Tâches de fond — un processus `claude` de longue durée, détenu par le serveur

## Agents requis

- [x] orchestrator
- [x] spec-reader
- [x] architect
- [x] security-reviewer, rôle GATE — **obligatoire** : un code OAuth transite par une page
      servie en clair, et le choix du compte devient une donnée de configuration
- [x] ux-ui-designer — l'écran d'authentification est une surface neuve
- [x] backend-developer
- [x] frontend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Description

Le centre de contrôle sait déjà **lancer des cycles**. Il ne sait pas **avec quel compte**,
et il ne sait pas ouvrir une session Claude de longue durée qu'il réutiliserait ensuite.

Cette spec ajoute trois choses :

1. **Le compte se déclare dans la configuration**, par répertoire de configuration, et le
   backend le pose dans l'environnement du processus qu'il lance.
2. **La première authentification se fait depuis le cockpit** : le backend démarre le flux,
   affiche l'URL, l'humain l'ouvre depuis l'appareil qu'il veut, puis colle le code rendu
   par Anthropic. Le backend le transmet au processus.
3. **La session ainsi ouverte persiste** et devient l'interlocuteur du cockpit.

## Contexte

Le conteneur porte deux dépôts et deux services Remote Control, chacun avec son propre
serveur tmux — mais **les deux tournent en `root`**, donc sur un seul compte. Séparer les
comptes demande aujourd'hui de séparer `$HOME` ou les utilisateurs système, à la main, hors
du cockpit.

⚠️ **Une confusion à ne pas rejouer.** L'agent principal a d'abord objecté qu'une session
permanente **monopoliserait le verrou d'écrivain unique**. C'est faux, et l'humain l'a
corrigé : *une session de conversation n'est pas un cycle.* Elle est l'**interlocuteur qui
lance des cycles**, exactement comme une session interactive le fait aujourd'hui. Elle n'a
aucune raison de prendre le verrou. Le problème n'existait que parce qu'on la rangeait dans
la mauvaise catégorie.

## Comportement attendu

**Déclarer un compte.** La configuration porte, par compte, un répertoire de configuration.
Le backend le pose en `CLAUDE_CONFIG_DIR` dans l'environnement du `Popen`. Le compte
n'est **jamais** un champ de requête — même règle qu'`ADR-0005` pour les commandes : le
réseau fournit une clé, la configuration fournit la forme.

**Constater l'état d'un compte.** Avant tout lancement, le backend interroge
`claude auth status` et lit `loggedIn`. Le cockpit affiche l'état de chaque compte déclaré.

**Authentifier depuis le cockpit.** Si un compte n'est pas connecté, le cockpit propose de
l'authentifier :

1. le backend démarre `claude auth login --claudeai`, `CLAUDE_CONFIG_DIR` posé, en gardant
   le processus vivant ;
2. il extrait l'URL de la sortie et l'affiche en lien ;
3. l'humain l'ouvre depuis n'importe quel appareil — **le retour va chez Anthropic**, donc
   le conteneur n'a **aucun port à exposer et aucune redirection à recevoir** ;
4. l'humain colle le code rendu dans le cockpit ;
5. le backend l'écrit sur le `stdin` du processus ;
6. `claude auth status` confirme, ou l'échec est affiché tel quel.

**Réutiliser la session.** Une fois authentifiée, la session ouverte par le cockpit reste
l'interlocuteur pour les échanges suivants — c'est le canal de `feature-022`.

### Cas limites

- Un compte déclaré dont le répertoire n'existe pas encore.
- Un code collé **faux**, **expiré**, ou **déjà utilisé**.
- L'humain qui abandonne : le processus d'authentification doit **expirer** et être tué,
  jamais rester en attente indéfinie sur `stdin`.
- Deux authentifications lancées en même temps sur le **même** compte.
- Un compte qui se **déconnecte** entre deux cycles (jeton révoqué côté Anthropic).
- `claude auth status` qui échoue ou rend un JSON inattendu — **absence propre, jamais un
  état supposé connecté**.

## Comportement actuel

Le centre de contrôle n'a **aucune notion de compte**. Il lance les commandes déclarées
dans l'environnement du serveur, donc sous le compte de l'utilisateur qui l'a démarré.
L'authentification se fait à la main, dans un terminal, par `claude auth login`.

## Contraintes techniques

⚠️ **`CLAUDE_CONFIG_DIR` n'est pas un contrat documenté.** Elle est dans le binaire et elle
marche — mesuré — mais elle est absente de `--help`. La spec doit dire ce qui se passe le
jour où elle disparaît : **repli sur un `$HOME` distinct**, qui est, lui, un contrat du
système d'exploitation. Une garde doit constater à l'exécution que la variable a bien été
prise en compte, et **échouer si le répertoire attendu n'est pas peuplé** — jamais supposer.

⚠️ **PKCE impose une session longue.** Le `code_challenge` vit **en mémoire du processus**.
Le même `Popen` doit donc rester vivant entre l'affichage de l'URL et la réception du code :
ce n'est pas deux invocations, c'est une session. Le mécanisme est celui de `feature-022`
(`stdin=PIPE`, écriture non bloquante sur tube vide).

⚠️ **L'URL est encadrée de séquences `OSC-8`.** Mesuré : un `grep -oE "https://[^ ]+"` naïf
rend l'URL **doublée** — l'agent principal s'est fait prendre sur sa propre sortie.
L'extraction doit **décoder l'`OSC-8`**, pas filtrer les octets bruts, et une assertion doit
le figer.

⚠️ **`--restricted` et `--bare` sont interdits** (`PIEGES §56`) : ils retirent les fichiers
de réglages, **où vivent les identifiants**, et répondent « Not logged in » avec `rc=0` et
un JSON valide.

## Fichiers potentiellement concernés

- `control-center/backend/config.py` — déclaration des comptes
- `control-center/backend/lanceur.py` — `CLAUDE_CONFIG_DIR` dans l'environnement du `Popen`
- `control-center/backend/server.py` — routes d'authentification
- `control-center/web/` — l'écran d'état des comptes et de saisie du code
- `control-center/control-center.example.toml` — l'exemple et son avertissement

## Livrables — check-list

- [ ] A1 — déclaration des comptes en configuration, **jamais** par requête
- [ ] A2 — `CLAUDE_CONFIG_DIR` posé dans l'environnement du `Popen`, avec repli `$HOME`
      documenté si la variable cesse d'être reconnue
- [ ] A3 — lecture de `claude auth status` (JSON), exposée sans jamais toucher au secret
- [ ] A4 — `POST /api/compte/connexion` : démarre le flux, rend l'URL **décodée de l'`OSC-8`**
- [ ] A5 — `POST /api/compte/code` : écrit le code sur le `stdin` du processus vivant
- [ ] A6 — expiration et mise à mort du processus d'authentification abandonné
- [ ] A7 — verrou : une seule authentification en cours par compte
- [ ] B1 — écran d'état des comptes déclarés (connecté / non connecté / indéterminé)
- [ ] B2 — affichage de l'URL en lien, et champ de saisie du code
- [ ] B3 — états d'erreur : code faux, expiré, déjà utilisé, abandon
- [ ] C1 — `docs/API.md`, `docs/features/page-*.md`, `CHANGELOG.md`
- [ ] C2 — ADR sur le choix du compte comme donnée de configuration, et sur
      `CLAUDE_CONFIG_DIR` comme dépendance non documentée assumée
- [ ] D1 — garde : l'extraction de l'URL survit à l'`OSC-8` (mutation : encadrement retiré)
- [ ] D2 — garde : `CLAUDE_CONFIG_DIR` **constaté effectif**, pas supposé
- [ ] D3 — garde : aucun secret ni code dans les journaux, ni en chaîne de requête
- [ ] D4 — garde : `auth status` illisible → absence propre, **jamais** « connecté »
- [ ] D5 — validation par mutation de chaque garde ci-dessus

## Nouvelles signatures / API

- `GET /api/comptes` → état des comptes déclarés (jamais de secret)
- `POST /api/compte/connexion {compte}` → `202 {url}` · `409` déjà en cours · `503`
- `POST /api/compte/code {compte, code}` → `200` · `404` aucun flux en cours · `422` code
  refusé · `410` flux expiré
- Configuration nouvelle : `[comptes.<nom>] repertoire_config = "…"`

## Sécurité & données

- **Authentification touchée** : **oui** — c'est le sujet même de la spec.
- **Permissions / rôles touchés** : **oui** — le jeton du cockpit achète désormais
  « authentifier un compte » et « lancer sous le compte X ».
- **Données personnelles** : **oui** — un **code OAuth** transite par une page servie en
  **clair** sur le réseau local. Il est à usage unique et de courte durée, mais c'est un
  **identifiant en transit**. Finalité : ouvrir une session pour le propriétaire du centre.
- **Migration destructive** : non.
- **Nouvelle exposition publique** : non — les routes entrent dans la table d'écriture et
  héritent de la chaîne de gardes établie.
- **Risque identifié** : l'hypothèse de segment de confiance d'`ADR-0020`, confirmée par
  l'humain le 2026-09-22 (« il n'y a que moi sur le réseau, le port n'est pas redirigé, le
  mot de passe wifi n'est pas partagé, on augmentera la sécurité plus tard »), **devient
  plus chargée** : elle ne couvre plus seulement des commandes déclarées, mais un code
  d'authentification. ⚠️ **Le GATE doit juger si cette spec seule justifie d'avancer la
  terminaison TLS locale**, déjà en tête de sa liste de durcissements.

## ADR attendu ?

- **Probable** : **oui**
- **Critère(s) candidat(s)** : **1, 2, 3, 4**
- **Sujet pressenti** : le compte comme **donnée de configuration** et non de requête
  (critère 1, même patron qu'`ADR-0005`) ; la dépendance à **`CLAUDE_CONFIG_DIR`, non
  documentée**, avec son repli (critères 2 et 3 — le refus du `$HOME` séparé se trace) ;
  et le **code OAuth transitant par le cockpit** (critère 4, verrouille un chemin
  d'identifiant).

## Ce que cette spec ne fait pas

- Elle **ne rend pas** l'authentification non interactive. Mesuré : `claude auth login`
  n'a aucun drapeau de jeton, et la seule voie non interactive est une clé d'API en
  facturation Console. L'humain ouvre un navigateur **une fois par compte**.
- Elle ne traite pas la **rotation** ni la **révocation** des jetons.
- Elle ne partage pas une session entre deux dépôts : un compte, un répertoire de
  configuration, ses propres transcripts.

## Effet sur les specs en cours

- **`feature-022`** fournit le canal `stdin` dont l'étape 5 dépend. Cette spec **ne le
  duplique pas** : si `feature-022` n'est pas livrée, celle-ci ne part pas.
- **`feature-023`** reconstruit aujourd'hui le chemin des transcripts par une règle
  d'encodage. `claude auth status` rend **`projectsDirectory`** : le lire vaut mieux que le
  déduire. ⚠️ **À signaler au lot 12 du cycle en cours**, qui peut en profiter
  immédiatement.
- **Condition GATE `S3.12`** du cycle `feature-021` : elle exige de prouver qu'un agent est
  authentifié **en fouillant le résultat** après coup. `auth status` permet de le vérifier
  **avant de lancer** — moins cher, et sans consommer le verrou d'écrivain pour un cycle
  qui n'aurait rien produit.
