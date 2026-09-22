# Le cockpit parle à la session Remote Control, pas à un processus qu'il lance

## Métadonnées

- **ID** : feature-026
- **Slug** : session-claude-persistante-du-cockpit *(conservé : renommer le fichier
  créerait un numéro à deux slugs, que `check_specs.sh` signale — le TITRE, lui, a changé
  le 2026-09-22, voir « Réécriture »)*
- **Type** : feature
- **Statut** : todo
- **Priorité** : normale
- **Version cible** : [à fixer par l'agent qui reprend cette spec]
- **Dernière mise à jour** : 2026-09-22 (réécriture complète — cible changée)
- **Spec(s) liée(s)** : `feature-022` (canal `json-lines` — **ne convient pas ici**, voir
  « Pourquoi le canal de `feature-022` ne peut pas servir »), `feature-023` (lecture des
  transcripts — **fournit la moitié lecture de cette spec**), `ADR-0020` (segment de
  confiance), `ADR-0005` (le réseau fournit une clé, la configuration fournit la forme),
  `ADR-0040` (chemins d'écriture du cockpit)

## Réécriture du 2026-09-22 — ce que la demande humaine a changé

La version précédente de cette spec faisait **lancer par le cockpit** son propre processus
`claude`, avec son authentification OAuth affichée à l'écran. L'humain a tranché autrement :

> « La conversation Claude doit se comporter comme notre conversation, connecté à la session
> remote. »

Ce n'est pas une variante, c'est une **autre porte**. La session visée **existe déjà**, elle
est **déjà authentifiée**, elle est **déjà persistante**, et c'est celle que l'humain pilote
depuis son téléphone. Le cockpit ne doit pas en ouvrir une seconde : il doit **parler à
celle-là**. Tout le volet OAuth est donc écarté — conservé plus bas, sans perdre ses mesures,
parce qu'il redeviendra la bonne porte le jour où l'on voudra un **second compte**.

Second arbitrage humain, le même jour : **le budget n'est pas un sujet** — l'abonnement est
au forfait. `--max-budget-usd` et `[garde_fous].commandes_avec_budget` ne gardent plus rien
d'utile sur ce chemin, et de toute façon **rien n'est lancé** : ils ne s'appliquent qu'à
`/api/lancer`.

## Grandeurs mesurées

Toutes relevées le **2026-09-22** sur ce conteneur, `claude` **2.1.278**.

**La session visée, telle qu'elle tourne :**

- PID **1474788**, `claude --remote-control kit-lxc --resume 6cb1e70e-…`, démarrée le
  **2026-09-21 06:19**, fille du serveur tmux **1474777**
  (`tmux new-session -d -s claude-kit -c /root/agent-kit`).
- Unité `claude-remote-kit.service` : `Type=oneshot` + `RemainAfterExit=yes`,
  `RuntimeDirectory=tmux-kit` (mode **0700**), `Environment=TMUX_TMPDIR=/run/tmux-kit`,
  `Restart=on-failure`, `MemoryHigh=1800M`/`MemoryMax=2400M`,
  `ExecStop=tmux kill-session -t claude-kit`.
- Socket tmux réel : **`/run/tmux-kit/tmux-0/default`**.
- ⚠️ **Son `stdin` est `/dev/pts/5` — un pseudo-terminal, pas un tube.** Mesuré par
  `ls -l /proc/1474788/fd/0`. C'est le fait qui décide de toute la spec.

**Ce qui marche, prouvé par exécution :**

- `tmux send-keys -l` puis `Enter`, sur une **session jetable** montée pour l'essai (jamais
  sur la session réelle) : le processus interactif a reçu
  `Bonjour depuis le cockpit — accents é à ü, "guillemets" et $VAR`, **à l'octet près**,
  sans interprétation shell.
- `tmux capture-pane -p` rend l'écran courant **sans rien y écrire** : on y lit le prompt
  `❯` et la ligne d'état (`auto mode on … esc to interrupt`). Un état « prêt à recevoir »
  est donc **observable**, pas seulement supposé.

**Le fil, côté lecture :**

- Transcript `/root/.claude/projects/-root-agent-kit/<session-id>.jsonl` : **20,4 Mo**,
  mode **0600**, écrit en continu (dernière écriture pendant la mesure).
- Sur les 10 000 dernières lignes : `assistant/assistant` **2293**, `user/user` **1147**,
  puis `attachment` 1238, `queue-operation` 554, `system` 378, `bridge-session` 376,
  `mode` 375, `atis-latch` 375. **Un lecteur naïf qui ne filtre pas sur `type` lira des
  enregistrements du pont Remote Control comme s'ils étaient des messages.**
- Le nom du fichier **est** le `session-id` ; le plus récemment modifié est la conversation
  active (déjà écrit dans la mémoire de projet, revérifié ici).

**Un couplage accidentel, à ne pas laisser en l'état :**

- Le serveur du cockpit relancé le 2026-09-22 à 12:56 **a hérité `TMUX`, `TMUX_TMPDIR` et
  `TMUX_PANE`** de la session qui l'a lancé — il trouve donc le socket « par accident ».
  Démarré par systemd (l'unité qui reste à écrire), il n'aurait **aucune** de ces variables.
  Le chemin du socket doit être une **donnée de configuration**, jamais un héritage.

## Domaines touchés

- [x] API REST (endpoints, contrats, codes d'erreur)
- [x] Frontend (écrans, composants, appels API)
- [ ] BDD / migrations — **sans objet**, aucune base dans ce module
- [x] Auth / permissions → **passage obligatoire par `security-reviewer` (rôle GATE)**
- [x] Données personnelles → **passage obligatoire par `security-reviewer` (rôle GATE)** :
      le fil d'une conversation réelle est du texte libre, potentiellement sensible
- [ ] Intégrations externes
- [ ] Tâches de fond — **plus aucune** : le cockpit ne détient plus de processus de longue
      durée, c'est tout l'intérêt de cette réécriture

## Agents requis

- [x] orchestrator
- [x] spec-reader
- [x] architect
- [x] security-reviewer, rôle GATE — **obligatoire, et plus lourd qu'avant** : le porteur du
      jeton peut désormais **taper dans une session qui a un shell et l'identité git du
      développeur**. Voir « Sécurité & données ».
- [x] ux-ui-designer — le panneau de conversation change de sémantique
- [x] backend-developer
- [x] frontend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Description

Le panneau de conversation du cockpit affiche aujourd'hui **« Hors ligne »**, et il a raison :
il attend un lancement dont la commande déclare `entree = "json-lines"`, et la configuration
réelle n'en déclare **aucun** (`demo` et `lent` sont sous la forme historique, donc
`entree = "aucune"`).

Cette spec le rebranche sur la **vraie** session : celle que l'humain pilote déjà.

1. **Lire** le fil depuis le **transcript** de la session, filtré sur les messages
   utilisateur et assistant.
2. **Écrire** en **tapant dans le terminal** de la session, par `tmux send-keys`.
3. **Dire l'état** à partir de ce qui est observable : session tmux vivante, panneau au
   prompt, ou occupé.

## Pourquoi le canal de `feature-022` ne peut pas servir

`feature-022` écrit une ligne JSON sur le **`stdin` d'un `Popen` que le serveur détient**
(`os.write(fd)`, après `FIONREAD` pour vérifier que le tube est vide). Ce mécanisme est
correct, gardé, testé — et **structurellement inapplicable ici** : le `stdin` de la session
visée est un **pty détenu par tmux**, pas un tube détenu par le cockpit. Aucun descripteur
du serveur ne pointe dessus.

⚠️ **`feature-022` n'est pas à supprimer** : elle reste la bonne porte pour une commande
**lancée par le cockpit** qui accepte `--input-format stream-json`. Les deux chemins
coexistent et ne doivent pas être fusionnés : ils n'ont ni le même destinataire, ni le même
modèle de menace.

## Comportement attendu

**Déclarer la session en configuration** (`ADR-0005`) : nom de session tmux, chemin du
socket, et répertoire de transcripts. Jamais un champ de requête — sinon le porteur du jeton
choisit **dans quel terminal il tape**.

**Lire le fil.** `GET /api/conversation` rend les messages `user` et `assistant` du
transcript de la session déclarée, **bornés** (nombre et octets, patron de `feature-023`),
les plus récents d'abord ; `type` inconnu → **ignoré**, jamais rendu comme message.

**Écrire un message.** `POST /api/conversation {texte}` :

1. la session tmux existe (sinon `404`) ;
2. l'écran est lu (`capture-pane`) et le panneau doit être **au prompt** — pas sur un
   dialogue, pas en cours de réponse (sinon `409`, avec la raison) ;
3. le texte est journalisé **avant** l'envoi (patron déjà livré par `feature-022`, S3.4) ;
4. `tmux send-keys -l <texte>` puis `Enter` ;
5. `202` — « tapé », jamais « traité ».

**Dire l'état.** La pastille `#claude-status` cesse de dépendre d'un lancement :
**En ligne** (session vivante, prompt), **Occupée** (réponse en cours), **Hors ligne**
(session absente), **Injoignable** (socket illisible).

### Cas limites

- Session tmux absente, tuée, ou redémarrée par `Restart=on-failure` — **le `session-id`
  change**, donc le transcript aussi : la spec doit **re-résoudre** le fichier, jamais le
  mémoriser.
- Panneau occupé par une **demande de permission** ou une confirmation destructive.
- Texte multi-lignes, texte commençant par `/` ou `!`, texte vide, texte très long.
- Transcript de 20 Mo : aucune lecture intégrale, jamais.
- Deux envois concurrents.
- Socket `/run/tmux-kit/` en **0700** : le cockpit doit tourner sous le même compte, sinon
  **absence propre**, jamais un état supposé.

## Comportement actuel

Panneau « Hors ligne » en permanence. `lancement_conversation()` rend `None` faute de
commande déclarant `entree = "json-lines"`, `GET /api/conversation` rend `404`, et le
frontal affiche « Aucun agent en cours n'accepte de message ». Aucun défaut : l'état est
exact, c'est la cible qui était fausse.

## Contraintes techniques

⚠️ **Taper dans un terminal n'est pas un protocole.** C'est le risque central de cette spec,
et il ne se supprime pas — il se **borne et se déclare**. Une frappe envoyée pendant qu'un
dialogue est à l'écran est **consommée par ce dialogue** : un message qui commence par
« oui » peut répondre à une confirmation destructive. D'où la lecture d'écran **avant**
envoi (point 2), qui est une **heuristique**, pas une garantie — et qui doit être écrite
comme telle, testée sur des captures réelles, et **jamais** présentée comme une garde.

⚠️ **Le multi-lignes se soumet tout seul.** Un `\n` dans `send-keys -l` vaut Entrée. Un texte
multi-lignes doit passer par un **tampon** (`load-buffer` + `paste-buffer`) ou être refusé —
tranché par l'`architect`, jamais découvert en production.

⚠️ **`/` et `!` en tête de ligne sont interprétés par le TUI** (commande, bang shell). Le
comportement voulu se décide dans la spec ; « on verra » n'est pas une réponse.

⚠️ **Le chemin du socket est une configuration, pas un héritage.** Mesuré : le serveur
courant ne le trouve que parce qu'il a hérité `TMUX_TMPDIR` de la session. Sous systemd, il
n'aura rien.

⚠️ **Le transcript est en 0600 et hors du dépôt.** `V.chemin_sur()` ne s'applique pas à un
chemin hors racine : c'est le modèle de menace d'`ADR-0041`, pas celui d'`ADR-0040`.

## Fichiers potentiellement concernés

- `control-center/backend/config.py` — déclaration de la session (socket, nom, transcripts)
- `control-center/backend/transcripts.py` — lecture bornée, déjà mémoïsée (`feature-023`)
- `control-center/backend/server.py` — `_conversation_lire` / `_conversation_envoyer`
  rebranchés
- `control-center/backend/lanceur.py` — **inchangé** : plus aucun processus détenu
- `control-center/web/app.js` — `actualiserConversation`, `appliquerEtatComposer`, pastille
- `control-center/control-center.example.toml`

## Livrables — check-list

- [ ] A1 — session déclarée en configuration (socket, nom, transcripts), **jamais** par requête
- [ ] A2 — `GET /api/conversation` lit le transcript de la session, **filtré sur `type`**,
      borné en nombre ET en octets, `session-id` **re-résolu** à chaque appel
- [ ] A3 — `POST /api/conversation` : journalisation avant envoi, puis `send-keys`
- [ ] A4 — lecture d'écran avant envoi ; `409` documenté comme **heuristique**, avec sa raison
- [ ] A5 — politique explicite du multi-lignes, du `/` et du `!` en tête
- [ ] A6 — verrou : un envoi à la fois
- [ ] B1 — pastille à quatre états, dérivée de l'observable
- [ ] B2 — fil rendu comme une conversation (utilisateur / assistant), tronqué **dit** comme tel
- [ ] C1 — `docs/API.md`, `docs/features/page-*.md`, `control-center/README.md`, `CHANGELOG.md`
- [ ] C2 — ADR : **pourquoi taper dans un pty plutôt qu'ouvrir un second processus**, et ce
      que cette décision verrouille
- [ ] D1 — garde : un enregistrement `bridge-session`/`queue-operation`/`attachment` n'est
      **jamais** rendu comme message (mutation : retirer le filtre)
- [ ] D2 — garde : aucune lecture intégrale du transcript (mutation : retirer la borne)
- [ ] D3 — garde : socket illisible → absence propre, **jamais** « En ligne »
- [ ] D4 — garde : session redémarrée → nouveau `session-id` suivi, **jamais** l'ancien fil
- [ ] D5 — garde : envoi refusé quand l'écran n'est pas au prompt
- [ ] D6 — validation par **mutation** de chaque garde ci-dessus

## Nouvelles signatures / API

- `GET /api/conversation` → `{messages:[{role,texte,ts}], tronque, etat}` — **contrat
  modifié**, même chemin
- `POST /api/conversation {texte}` → `202` · `404` session absente · `409` occupée ·
  `413`/`422` bornes de texte · `503` socket indisponible
- Configuration nouvelle : `[session] socket_tmux = "…"`, `nom = "…"`,
  `repertoire_transcripts = "…"`

## Sécurité & données

- **Authentification touchée** : non directement — la session est **déjà** authentifiée.
- **Permissions / rôles touchés** : **oui, et c'est une escalade**. Le jeton du cockpit
  achetait « lancer une commande **déclarée** » ; il achèterait désormais « **taper une
  instruction arbitraire** dans une session qui a un shell, l'identité git du développeur, et
  le mode `auto` actif ». La liste fermée des commandes (`ADR-0005`) **cesse de borner** ce
  qu'un porteur du jeton peut faire faire à l'agent. ⚠️ **Le GATE doit statuer sur ce point
  précis avant toute ligne de code.**
- **Données personnelles** : **oui** — le fil d'une conversation réelle, rendu par une route
  HTTP en clair sur le réseau local. Finalité : afficher au propriétaire du centre la
  conversation qu'il mène déjà.
- **Migration destructive** : non.
- **Nouvelle exposition publique** : non — mêmes routes, mêmes gardes d'entrée.
- **Risque identifié** : l'hypothèse de segment de confiance d'`ADR-0020`, confirmée par
  l'humain le 2026-09-22 (« il n'y a que moi sur le réseau, le port n'est pas redirigé, le
  mot de passe wifi n'est pas partagé, on augmentera la sécurité plus tard »), **porte
  désormais une escalade de capacité, pas seulement une commodité**. ⚠️ Le GATE doit dire si
  cette spec **avance** la terminaison TLS locale et le durcissement du jeton (`bug-010`),
  déjà en tête de sa liste.

## ADR attendu ?

- **Probable** : **oui**
- **Critère(s) candidat(s)** : **1, 2, 4**
- **Sujet pressenti** : parler à une session **qu'on ne détient pas**, en tapant dans son
  pty, plutôt qu'ouvrir un processus qu'on détient — avec les pertes nommées (pas de
  protocole, pas d'accusé de traitement, heuristique d'état) et ce que ça verrouille
  (le cockpit devient dépendant de tmux et du format de transcript).

## Ce que cette spec ne fait pas

- Elle **ne rend pas** la session redémarrable depuis le cockpit : `/resume` n'existe pas en
  Remote Control, une conversation ne se reprend **qu'au lancement du service**.
- Elle ne gère **aucun compte** : la session visée est déjà authentifiée.
- Elle ne recopie pas les réponses de l'agent ailleurs : elle les **lit** là où elles sont.
- Elle ne remplace pas `feature-022` pour les commandes lancées par le cockpit.

## Écarté par la réécriture — et pourquoi c'est conservé

Le volet **OAuth depuis le cockpit** (compte déclaré, `CLAUDE_CONFIG_DIR`, `auth login`,
URL capturée, code collé) redevient pertinent le jour où l'on voudra une **seconde** session
sous un **autre compte**. Ses mesures du 2026-09-22 restent vraies et ne sont pas à refaire :

- `CLAUDE_CONFIG_DIR` **existe dans le binaire et agit**, mais est **absente de `--help`**.
- Identité dans `~/.claude/.credentials.json`, **0600**, une par répertoire de configuration.
- `claude auth login` n'a **aucun drapeau de jeton** ; seule voie non interactive :
  `ANTHROPIC_API_KEY` — **facturation Console, pas l'abonnement**.
- L'URL d'autorisation est **imprimée sur stdout**, encadrée de séquences **`OSC-8`** : un
  `grep -oE "https://[^ ]+"` la rend **doublée**.
- `redirect_uri` = `https://platform.claude.com/oauth/code/callback` — **aucun port à
  exposer**.
- PKCE impose que **le même processus** reste vivant entre l'URL et le code.
- `--restricted` et `--bare` sont **interdits** (`PIEGES §56`) : ils répondent
  « Not logged in » avec `rc=0`.

À rouvrir en spec distincte le jour où le besoin existe ; ne pas le rejouer ici.
