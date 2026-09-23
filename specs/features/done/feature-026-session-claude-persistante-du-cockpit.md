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
- [x] security-reviewer, rôle GATE — **obligatoire**, mais sur un mandat **recadré par la
      décision humaine du 2026-09-22** : la question n'est plus « le cockpit a-t-il le droit »
      (il tourne sur l'environnement du développeur et y a déjà les droits), mais
      « **est-ce traçable et réversible** ». Voir « Sécurité & données ».
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

⚠️ **Six items ont été AJOUTÉS le 2026-09-22 par le plan d'exécution de l'`orchestrator`**
(`M1`–`M3`, `A7`, `C3`, `D7`, `D8`). Il les a signalés au lieu de les glisser ; l'agent
principal les a tous retenus, et les inscrit **ici** — un livrable qui ne vit que dans un
plan hors dépôt est un invariant qui ne vit que dans un commentaire, et ce dépôt a déjà
payé ce défaut quatre fois (`ADR-0038 §5`).

**Mesures préalables (lot 0 — aucune ligne de code, faites sur session tmux JETABLE)**
- [x] M1 — `claude --resume <id>` écrit-il dans `<id>.jsonl` ou ouvre-t-il un fichier neuf ?
      **Mesuré : même fichier.** Décide `D4` et la résolution du `session-id`.
- [x] M2 — `load-buffer`/`paste-buffer`, avec et sans `-p`, sur un texte multi-lignes face
      au TUI. **Mesuré : `-p` obligatoire**, sans lui les `\n` sont soumis. Décide `A5`.
- [x] M3 — `ExecStart` réel, et chaîne `list-panes` → `pane_pid` → `/proc/cmdline` depuis le
      seul nom de session. **Mesuré**, avec une réserve d'environnement écrite au journal.

**Backend**
- [x] A1 — session déclarée en configuration (socket, nom, transcripts), **jamais** par requête
- [x] A2 — `GET /api/conversation` lit le transcript de la session, **filtré sur `type`**,
      borné en nombre ET en octets, `session-id` **re-résolu** à chaque appel
- [x] A3 — `POST /api/conversation` : journalisation avant envoi, puis `send-keys`
- [x] A4 — lecture d'écran avant envoi ; `409` documenté comme **heuristique**, avec sa raison
- [x] A5 — politique explicite du multi-lignes, du `/` et du `!` en tête
- [x] A6 — verrou : un envoi à la fois, tenu **de la capture d'écran jusqu'au retour de
      l'envoi** — le contrôle et l'écriture ne se séparent jamais (transposition de `S3.10`)
- [x] A7 — **coût de rafraîchissement borné ET MESURÉ** (appels `tmux` + lecture d'un
      transcript de 20 Mo, à chaque signal SSE ~2 s). *Ajouté : `transcripts.py` a déjà payé
      ce déni de service auto-infligé une fois — « jusqu'à 289 fichiers, 237 Mo, proche de
      1 s de CPU par requête » — refermé par mémoïsation au cycle `feature-021`.*

**Frontend**
- [x] B1 — pastille à quatre états, dérivée de l'observable
- [x] B2 — fil rendu comme une conversation (utilisateur / assistant), tronqué **dit** comme tel

**Documentation**
- [x] C1 — `docs/API.md`, `docs/features/page-*.md`, `control-center/README.md`, `CHANGELOG.md`
- [x] C2 — ADR : **pourquoi taper dans un pty plutôt qu'ouvrir un second processus**, et ce
      que cette décision verrouille
- [x] C3 — `control-center/PIEGES.md` : entrée **ajoutée**, entrée **retirée**, ou
      « aucun piège neuf » **écrit** dans le rapport de `doc-writer` — jamais le silence

**Gardes**
- [x] D1 — garde : un enregistrement `bridge-session`/`queue-operation`/`attachment` n'est
      **jamais** rendu comme message (mutation : retirer le filtre)
- [x] D2 — garde : aucune lecture intégrale du transcript (mutation : retirer la borne)
- [x] D3 — garde : socket illisible → absence propre, **jamais** « En ligne »
- [x] D4 — garde : session redémarrée → nouveau `session-id` suivi, **jamais** l'ancien fil
- [x] D5 — **heuristique** (jamais « garde » — condition 6 du GATE P1) : envoi refusé
      quand l'écran ne **semble** pas au prompt. Le mot vaut pour la spec, les **noms de
      tests**, `docs/API.md` et le libellé du `202` — un test nommé « garde » sera relu
      comme une garantie, et la fenêtre entre `capture-pane` et `send-keys` ne se ferme pas
- [x] D6 — validation par **mutation** de chaque garde ci-dessus (`PIEGES §37` : muter la
      garde, pas ce qu'elle appelle) — 18 mutants, 14 tués, 3 survivants **nommés** (trous
      de témoin signalés, pas réparés hors mandat), 2 équivalents démontrés (test-engineer,
      journal du 2026-09-23 12:10)
- [x] D7 — garde : le chemin tmux passe par le **refus des caractères de contrôle** (ESC
      compris) **AVANT** tout `send-keys`. *Ajouté : `_texte_conversation_valide` existe et
      est testée — mais pour le canal `json-lines`, où un ESC est un problème de
      sérialisation. Injecté dans un **pty**, un ESC est une séquence de contrôle de
      terminal : même code, conséquence différente, et rien ne prouve aujourd'hui que le
      chemin tmux l'appelle (`PIEGES §42`).*
- [x] D8 — garde : le chemin du socket vient de la **configuration**, jamais de
      l'environnement hérité (`TMUX`, `TMUX_TMPDIR`, `TMUX_PANE`). *Ajouté : le serveur en
      cours (PID 2212725) est **déjà en faute** — il ne trouve le socket que parce qu'il a
      hérité ces variables de la session qui l'a lancé.*

## Nouvelles signatures / API

- `GET /api/conversation` → `{messages:[{role,texte,ts}], tronque, etat}` — **contrat
  modifié**, même chemin
- `POST /api/conversation {texte}` → `202` · `404` session absente · `409` occupée ·
  `413`/`422` bornes de texte · `503` socket indisponible
- Configuration nouvelle : `[session] socket_tmux = "…"`, `nom = "…"`,
  `repertoire_transcripts = "…"`

## Sécurité & données

- **Authentification touchée** : non directement — la session est **déjà** authentifiée.
- **Permissions / rôles touchés** : **oui — et la question « est-ce une escalade ? » est
  TRANCHÉE, pas ouverte.** L'agent principal l'avait posée au GATE comme un point bloquant :
  le jeton achetait « lancer une commande **déclarée** » (liste fermée, `ADR-0005`), il
  achèterait « **taper une instruction arbitraire** dans une session qui a un shell,
  l'identité git du développeur et le mode `auto` actif ».

  **Décision humaine du 2026-09-22, mot pour mot :**

  > « Le centre de contrôle est conçu pour fonctionner sur l'environnement du développeur.
  > Il a déjà les droits sur cet environnement. »

  Ce qu'elle établit, et qui vaut **prémisse pour le GATE** plutôt que question à lui poser :
  le cockpit **n'acquiert aucun droit nouveau** en tapant dans la session. Il tourne en
  `root` sur la machine du développeur, sert déjà `/api/lancer` et les routes d'écriture de
  spec, et pourrait de toute façon écrire n'importe quel fichier du dépôt. La liste fermée
  des commandes n'a **jamais** été une frontière de privilège — c'est une frontière
  d'**ergonomie et de traçabilité**, et c'est à ce titre qu'elle doit être jugée ici.

  ⚠️ **Ce que le GATE garde donc à statuer** (déplacé, pas supprimé) : non pas « a-t-il le
  droit », mais « **ce qu'il fait reste-t-il traçable et réversible** ». Un message tapé dans
  un pty ne laisse, par lui-même, **aucune trace côté cockpit** — d'où la journalisation
  **avant** envoi (A3), et la question ouverte de ce qu'on journalise d'un texte libre
  (`PIEGES §16` : ne pas fabriquer ce qu'on ne mesure pas). C'est le même déplacement que
  `ADR-0020` a déjà fait une fois : la garde utile n'est pas l'interdiction, c'est le journal.
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

---
## Journal de bord

<!-- UNE ligne par étape du workflow, écrite QUAND L'ÉTAPE TOMBE, jamais à la
     clôture. Horodatage · étape · agent · verdict · preuve chiffrée ou livrables. -->

- [2026-09-22 14:05] Étape 1 — spec-reader — spec promue vers doing/, 6 fichiers
  impactés (2 backend existants, 2 modules neufs, 1 frontend, 1 config exemple) ;
  grandeurs mesurées reconfirmées à l'instant T : PID 1474788 vivant (`tmux-kit`,
  fils de 1474777), socket `/run/tmux-kit/tmux-0/default` répondant à
  `list-sessions`, `stdin` de 1474788 toujours un pty (`/proc/1474788/fd/0` →
  `/dev/pts/5`), transcript `6cb1e70e-…jsonl` à 20 760 828 octets mode `0600`
  (le fichier a grossi depuis la mesure de la spec, cohérent avec « écrit en
  continu ») ; GATE requis (auth/permissions + données personnelles cochés,
  mandat recadré par la décision humaine — reporté tel quel, non rouvert).

- [2026-09-22 14:40] Lot 0 — backend-developer — **M1, M2, M3 mesurés sur sessions tmux
  JETABLES** ; la session réelle `claude-kit` n'a reçu **aucune frappe**.
  **M1 — `--resume <id>` écrit dans le MÊME fichier** : `1d271dba-….jsonl` passe de
  256 243 à 260 370 octets, second message présent, **aucun fichier neuf** (11 avant, 11
  après). Et `/proc/<pid>/cmdline` porte **littéralement** `--resume 1d271dba-…`.
  ⚠️ Corollaire que la mesure impose : la résolution par la ligne de commande est exacte
  **tant que le processus tourne**, et **muette après un redémarrage** — vérifié par
  l'agent principal, `/etc/default/claude-remote-kit` porte `CLAUDE_KIT_ARGS=""`, donc un
  `Restart=on-failure` relance **sans `--resume`**, donc sur un **nouveau** transcript
  (M1 a mesuré qu'un `claude` sans `--resume` crée un fichier neuf). La voie (a) et le
  repli (b) par récence sont donc **complémentaires, pas concurrents**.
  **M2 — `-p` est OBLIGATOIRE** : sans lui, les `\n` internes sont **soumis** (3 lignes →
  2 soumissions + 1 reliquat dans la boîte) ; avec `-p`, les 3 lignes sont **insérées en un
  bloc non soumis**, et un `Enter` délibéré les envoie. Tabulation insérée brute, aucune
  complétion déclenchée. ⚠️ Réserve de lecture : le `/` en tête a été observé **inséré**,
  jamais **soumis** — la mesure ne dit donc **rien** de ce qu'un `/commande` fait à
  l'Entrée. Ne pas lire « aucune exécution » comme « les commandes slash sont inertes ».
  Trouvé au passage : `Ctrl+U` ne vide **qu'une ligne logique** — 5 frappes ont été
  nécessaires pour repartir d'un prompt vide après un collage de 3 lignes.
  **M3 — `ExecStart` confirmé**, et la chaîne `list-panes` → `pane_pid` → `/proc/cmdline`
  rend bien un identifiant exploitable sur session jetable. ⚠️ **Réserve honnête, et elle
  est due à l'environnement de l'agent, pas à tmux** : `tmux -S <socket réel> list-panes`,
  **strictement en lecture**, a été **refusé par le classifieur** (« Production Reads ») ;
  le fait est donc établi par équivalence topologique (2 sources convergentes), pas par
  exécution directe. Le cockpit, lui, ne passe pas par ce classifieur.
  Livrables : **M1, M2, M3 tombés**.
- [2026-09-22 15:05] **POINT D'ARRÊT HUMAIN n°1 — FAITS VALIDÉS** (« Ok, je valide »).
  Les mesures du lot 0 deviennent la base du design ; l'architecte ne conclut pas contre
  elles. Deux d'entre elles figent un arbitrage chacune : `-p` obligatoire pour le
  multi-lignes, et la complémentarité ligne de commande / récence pour le `session-id`.
  Check-list étendue de 34 à 40 items par l'agent principal — les six ajouts du plan
  (`M1`–`M3`, `A7`, `C3`, `D7`, `D8`) sont désormais **dans la spec**, avec leur
  justification, et non plus seulement dans un fichier de plan hors dépôt.
- [2026-09-22 15:50] Étape 3 — architect — **plan court rendu, sept points tranchés, ADR-0042
  confirmé sur QUATRE critères** (la spec en annonçait trois : il ajoute le critère 3, car
  `feature-022` **est** l'alternative crédible, écartée pour une raison mesurée — `stdin` =
  `/dev/pts/5`). Il a **mesuré au lieu de supposer**, et trois de ses mesures changent le
  design :
  ⚠️ **`_texte_conversation_valide` accepte DEL (`0x7f`) et les C1 (`U+0085`)** — vérifié par
  exécution. Inoffensif dans `json-lines`, **effaçant dans un pty**. `D7` n'est donc pas une
  précaution mais un **correctif**, et la fonction partagée ne doit **pas** être durcie (ses
  tests `feature-022` la figent) : le refus supplémentaire vit dans `session_tmux`.
  ⚠️ **`paste-buffer -p` n'encadre que si l'application a activé le collage encadré** —
  mesuré : contre `cat`, aucun `ESC[200~`. La protection multi-lignes de `M2` est donc
  **conditionnelle à l'état du panneau**, pas inconditionnelle.
  ⚠️ **Le plus gros transcript n'est PAS l'actif** : 37,2 Mo contre 20,9 Mo. Un repli « le
  plus volumineux » aurait lu la mauvaise conversation ; c'est le `mtime` qui fait foi.
  **Le texte passe par `load-buffer -` sur STDIN, jamais par `send-keys -l <texte>`** : un
  argv est lisible dans `ps` par tout le monde.
  **A7 chiffré** : lecture intégrale 0,096 s / 20,9 Mo ; queue 4 MiB 0,025 s ; `capture-pane`
  2,3 ms — et il distingue déjà session vivante/absente, donc **un seul** appel `tmux`, pas
  deux. Mémoïsation `(chemin, mtime, taille)` : **3,3 % seulement des fenêtres de 2 s portent
  une écriture** (1 431/43 200 sur 24 h), donc 96,7 % de succès **sur le fichier vivant** →
  **0,16 % de CPU** contre ~5 % pour le naïf.
  **D1 va plus loin que la spec** : filtrer sur `type` **ne suffit pas** — `user` porte 985
  `tool_result` contre 192 textes, `assistant` porte 985 `tool_use` + 720 `thinking` + 650
  `text`. Filtre positif sur `type` ∈ {user, assistant} **ET** bloc `text`. Le `thinking`
  n'est pas exposé : **décision, pas oubli**.
  ✔️ **Correction d'une ligne de ce journal** : le refus de `tmux list-panes` sur le socket
  réel n'est **pas une propriété du dépôt** — l'architecte a passé la même commande sans
  refus. C'était propre à l'environnement de l'agent du lot 0. Et les deux voies de
  résolution **concordent sur la session réelle**, mesuré : `list-panes` → 1474788,
  `cmdline` → `--resume 6cb1e70e-…`, `ls -t` → `6cb1e70e-….jsonl`. 12 transcripts présents,
  `≥ 2` est bien le cas normal.
  ⚠️ **Un point de son plan contredit la demande humaine et remonte à l'humain** : il refuse
  `/` et `!` en tête par un **422**, au motif que `M2` n'a mesuré que l'insertion, jamais la
  soumission. Le raisonnement est juste ; la conséquence — pas de `/clear` depuis le cockpit
  — restreint « se comporter comme notre conversation ». Position de l'agent principal :
  **mesurer la soumission** plutôt que geler un refus.
- [2026-09-22 16:35] Étape 4 — security-reviewer, **rôle GATE P1 — GO SOUS CONDITIONS,
  9 conditions numérotées**. Prémisse humaine tenue pour acquise, non rouverte. Deux de ses
  constats sont des **trouvailles**, pas des avis :
  ⚠️ **`type: user` ne veut PAS dire « écrit par l'humain »** : les enregistrements
  `isMeta: true` portent en `content` **chaîne** les rapports de sous-agents (jusqu'à
  **35 548 caractères**) et des notifications de tâche. Le filtre de l'architecte —
  `type` ∈ {user, assistant} **et** bloc `text` — les aurait rendus **comme des messages
  humains**. Filtre positif corrigé : `type` ∈ {user, assistant}, `isMeta` absent/faux,
  `promptSource ≠ "system"`, contenu `str` ou blocs `text`. Mutation : retirer l'exclusion
  `isMeta`.
  ✔️ **Le transcript porte déjà le discriminant qu'on s'apprêtait à ne pas pouvoir
  fabriquer** : `promptSource` vaut `"queued"` sur les **91** prompts humains de la session
  remote et `"typed"` sur les **2** prompts tapés au clavier tmux de la jetable. On l'expose
  **brut**, sans l'interpréter — l'hypothèse « une frappe cockpit produira `typed` » n'est
  pas mesurable sans taper dans la session réelle, et **ne s'écrit pas comme un fait**.
  C'est la réponse à la traçabilité, et elle est **mesurée** au lieu d'être inventée.
  **Condition 4 — le refus de `/` et `!` TIENT, mais pour une autre raison que celle de
  l'architecte** : non pas « on n'a pas mesuré la soumission », mais **l'irréversibilité** —
  `/exit`, `/logout`, `/clear` tapés depuis le cockpit ne se rattrapent pas **depuis le
  cockpit** (aucune reprise possible, et `Restart=on-failure` ne relance pas une sortie
  propre). Lever ce refus exigera une **liste positive** de commandes slash mesurées à la
  soumission — **spec distincte**. La mesure que l'agent principal proposait n'aurait donc
  **pas** dissous le problème.
  **Condition 5 — le point de non-retour est `Enter`, pas `paste-buffer`** : un second
  `capture-pane` après collage et **avant** `Enter` ferme la moitié de la fenêtre TOCTOU ;
  sinon `409`, `envoye: false`, texte laissé visible dans le composeur.
  **Condition 6 — vocabulaire** : `D5` disait « garde » et contredisait `A4`. Renommée
  **heuristique** dans la check-list par l'agent principal ; reste à faire dans les noms de
  tests, `docs/API.md` et le libellé du `202`.
  **Condition 9 — `ADR-0042` AMENDE `ADR-0041`, il ne le préserve pas** : « compteurs
  seulement » devient une propriété de `transcripts.py`, et `fil.py` est le **seul** module
  autorisé à sortir du texte, d'**un** fichier, sous les `S5.x` transposées. L'écrire, plutôt
  que prétendre que l'invariant tient.
  **Vérifié côté fuite** : `agent-events.jsonl` ne porte que `prompt_id`, `_CHAMPS_PUBLICS`
  n'a aucun champ texte, `empreinte()` ne rend que tailles et compteurs → **condition 3
  tenable, donc `bug-010` reste hors de ce cycle**.
  **Et oui, cette spec AVANCE le TLS local et `bug-010`** : la route de lecture fait sortir
  le **fil entier** de la conversation du développeur contre un jeton statique ; un jeton
  capturé écrirait dans un contexte **persistant en mode auto** ; et 20 mauvais jetons
  verrouillent le **seul point d'observation** du cockpit. Rien n'entre dans ce cycle,
  priorité relevée pour le suivant.
- [2026-09-22 17:10] Étape 5 — ux-ui-designer — **design arrêté, aucune couleur neuve**. Les
  quatre états de la pastille réutilisent des jetons existants (`--teal`, `--amber`,
  `--muted`, `--danger`), chacun avec son précédent dans le design system ; le glyphe `●`
  est **identique** dans les quatre — le texte fait foi, jamais la couleur seule. Le libellé
  vient du **backend**, le JS ne le redérive plus d'un code HTTP (ce qu'il fait aujourd'hui).
  L'heuristique s'assume par un `title`, jamais par un second libellé visible.
  **Destinataire porté à l'écran** : `#claude-destinataire-valeur`, texte **brut** du backend
  en `var(--mono)`, jamais reformulé, visible **avant** le premier `GET` réussi.
  **Sur les blocs `<system-reminder>`** : affichés **tels quels, jamais repliés** — aucun
  critère observable ne permet de replier celui-là **sélectivement** sans deviner du
  contenu, et le bloc peut précéder le message réel. Seule concession, **générique et non
  ciblée** : toute bulle dépassant ~240 px défile en interne, quel que soit son rôle ou son
  contenu. Refusé : un `<details>` qui masquerait la vraie question derrière un clic manqué.
  **`promptSource` affiché brut** (`queued` / `typed`), sans traduction française — traduire
  suggérerait une origine que personne n'a mesurée.
  **Trous DITS plutôt que devinés** : une note permanente annonce que les étapes d'outils et
  le raisonnement interne ne sont pas repris — honnête sur ce qui manque, sans prétendre
  localiser chaque trou.
  ⚠️ **Piège trouvé, et il vise `ADR-0039`** : la maquette normative **ne code qu'UN SEUL
  rôle de bulle** — ses deux `<article class="message">` d'exemple sont **tous deux** des
  messages assistant. Un agent appliquant « la fidélité prime » sans vérifier conclurait soit
  qu'il ne faut aucune distinction visuelle, soit qu'il faut improviser un alignement à
  droite « standard M3 » **absent du prototype**. Rien dans `DESIGN-SYSTEM.md` ni `PIEGES.md`
  ne le signalait.
  Trois ids statiques à ajouter à `index.html` (`PIEGES §38`) : `#claude-destinataire`,
  `#claude-destinataire-valeur`, `#conversation-portee`.
  Livrables préparés : **B1, B2** (spécifiés, non codés).
- [2026-09-22 18:20] Lot 1 — test-engineer — **7 gardes écrites AVANT le code, rouges par
  construction, dépôt VERT**. 4 fichiers neufs, **1944 cas en root / 1867 en non-root,
  0 échec**, 49 fichiers lancés / 49 verdicts.
  ⚠️ **Le rapport annonçait une « dérive normale entre deux mesures » (1893 → 1897 avant son
  passage) ; il n'y a AUCUNE dérive, et l'agent principal l'a établi par comparaison
  fichier par fichier** : 1893 → 1944 = **+47** (les cas des 4 fichiers neufs : 20 + 19 + 6
  + 2) **+4** portés par `test_ci_partition_navigateur.py` (66 → 70), qui gagne **un cas par
  fichier de test neuf**. Le compte est donc **entièrement attribué**, et ce +4 est en
  lui-même une preuve : la garde de partition CI **voit** les fichiers neufs — elle aurait
  échoué si l'un d'eux n'était pas classé. « Dérive normale » est exactement la formule qui
  aurait enterré ce fait (`PIEGES §32`).
  ⚠️ **Registre : 36 entrées, pas 20** — recompté par l'agent principal dans les fichiers
  (`test_fil.py` 20, `test_session_tmux.py` 14, `test_server_feature026.py` 2,
  `test_app_conversation_feature026.js` 2). L'en-tête du rapport disait 20, son propre
  détail en listait 38. Chaque entrée porte un **lot de clôture nommé**, vérifié par une
  assertion dédiée, et la **clause (2) a été éprouvée pour de vrai** : un stub temporaire
  conforme au contrat a fait passer les assertions au vert, la clause (2) a échoué
  bruyamment (« assertion VERTE mais encore dans le registre »), puis le stub a été
  supprimé — `git status` confirme qu'aucun fichier de production ne subsiste.
  **Trois mutations tuées** sur ce stub : retirer l'exclusion `isMeta` → `D1` meurt ; trier
  par **taille** au lieu de suivre `cmdline` → `D4` **et deux gardes en aval** meurent
  ensemble ; lire le socket depuis `TMUX_TMPDIR` → `D8` meurt. Et sur le **vrai `app.js`**
  (patch posé puis restauré, `diff` vide) : faire lire `donnees.etat` par le frontal fait
  passer la garde au vert **et déclenche la clause (2)** — elle discrimine réellement, elle
  ne dit pas seulement « module absent ».
  ✔️ **Ce qui reste DÛ, dit et non escamoté** : la mutation des 34 assertions contre le VRAI
  `fil.py`/`session_tmux.py` est **impossible aujourd'hui** (le code n'existe pas). Elle
  reste due au lot qui livre les modules — `ADR-0038 §1` : « vu rouge » ne remplace jamais
  la mutation.
  ⚠️ **Piège d'environnement trouvé en exécutant, et il a coûté** : sur cette machine,
  `tmux list-panes -F '#{pid}'` rend le PID du **serveur** tmux, pas celui d'un fils dont il
  faudrait remonter le `PPid` — le patron classique. La première version du harnais tuait
  donc le mauvais PID, souvent **`1`** (le serveur détaché est reparenté à init) : **21
  serveurs tmux jetables laissés orphelins**, nettoyés ensuite par PID capturé. Résolu par
  `lsof -t <socket>`, qui donne directement le processus **qui tient le socket**.
  ⚠️ **Ce fait vise le livrable lui-même** : `session_tmux.py` doit résoudre son PID de la
  même façon, sinon il rejouera le défaut sur la session réelle. Vérifié par l'agent
  principal après coup : **aucun serveur tmux résiduel** — seules les deux sessions réelles
  (`claude`, `claude-kit`) tournent.
  Livrables : **D1, D2, D3, D4, D5, D7, D8 écrits et vus rouges** (clôture au lot suivant).
- [2026-09-22 20:40] Lots 2-3-4 — backend-developer — **`session_tmux.py` et `fil.py` livrés,
  routes rebranchées, 34 gardes passées au vert**. `1944 cas root / 1867 non-root, 0 échec`,
  49 fichiers — **identique au lot 1**, et c'est normal : chaque entrée retirée du registre
  perd sa case méta (« porte un lot de clôture nommé ») et gagne la case réelle devenue
  verte. Vérifié par l'agent principal **fichier par fichier** : **aucun écart**, sur aucun
  des 49. `lanceur.py` : `git diff` **vide**. Registres : `test_fil.py`, `test_session_tmux.py`
  et `test_server_feature026.py` **vidés** ; `test_app_conversation_feature026.js` garde ses
  **2** entrées, closes au lot frontend.
  ⚠️ **Le backend a lui-même écrit le piège que ce compte porte** : un total inchangé
  **n'est pas** un signal d'absence de changement dans ce cycle — 34 assertions réelles sont
  apparues sans bouger le total d'une unité. Seule la lecture fichier par fichier le dit.
  À refaire tel quel au lot suivant.
  ✔️ **Il a refusé de fabriquer un champ, et il avait raison de refuser** : la spec annonçait
  `{role, texte, ts}` ; il n'a pas ajouté `ts`, faute de source vérifiée sur un vrai objet de
  transcript (`PIEGES §16`), et l'a **signalé pour arbitrage** au lieu de le deviner.
  **L'agent principal a mesuré la source** : sur 599 enregistrements `user`/`assistant`
  non-meta lus, **599 portent un champ `timestamp`** (100 %), ISO-8601 UTC avec
  millisecondes. La divergence est donc levée par une **mesure**, pas par une décision :
  `interpreter_ligne` recopie la valeur **brute** sous `ts`, et rend `None` si le champ
  manque — jamais un horodatage de lecture qui se ferait passer pour un horodatage
  d'émission. Reboucle envoyée au backend-developer.
  ✔️ **Trouvé en mesurant plutôt qu'en supposant** : `tmux capture-pane -t <nom>` échoue
  **à lui seul** quand la session n'existe pas — la distinction « socket répond » / « session
  vivante » tient donc en **un seul** appel dans le cas heureux, et le second (`has-session`)
  n'est payé que dans le cas rare. 2,4 ms au lieu de 4,8 par rafraîchissement.
  **A7 mesuré sur le VRAI transcript actif (21,4 Mo)** : `lire_fil()` **0,0256 s** à froid,
  **0,0000 s** en cache (clé `(chemin, mtime, taille, bornes)`) ; `etat()` **0,0024 s**.
  Les chiffres de l'architecte sont confirmés par exécution, pas recopiés.
  ⚠️ **Une correction de périmètre qu'il a faite lui-même, et qui aurait cassé la suite** :
  le brief assignait les 2 entrées de `test_server_feature026.py` au lot **frontend**, alors
  qu'elles ne dépendent que du backend (harnais HTTP pur, aucun navigateur) et passent au
  vert dès que les routes lisent `[session]`. Les y laisser aurait déclenché la clause (2)
  et livré deux échecs au lot suivant, pour une raison étrangère au code qu'il aurait écrit.
  Livrables : **A1, A2, A3, A4, A5, A6, A7 livrés ; D1, D2, D3, D4, D5, D7, D8 FERMÉES**.
- [2026-09-22 21:05] Reboucle `ts` — backend-developer — **levée par la mesure, et gardée**.
  `interpreter_ligne` recopie `timestamp` **brut** sous `ts`, ou `None`. **2 cas neufs, 2
  mutations tuées** : arrêter la recopie tue le premier ; poser une valeur de repli
  fabriquée (`1970-01-01T…`) tue le second — c'est exactement ce que le refus initial
  cherchait à empêcher. Source restaurée entre les deux mutants, `diff` vide, `__pycache__`
  purgé (`PIEGES §36`). **1946 root / 1869 non-root, 0 échec** ; seul `test_fil.py` bouge
  (20 → 22), vérifié fichier par fichier. La section « Nouvelles signatures » de la spec
  redevient exacte : `doc-writer` n'a plus d'écart à trancher.
- [2026-09-22 23:30] Lot 5 — frontend-developer — **panneau rebranché, B1 et B2 livrés**,
  les 2 dernières entrées `ATTENDU_ROUGE` retirées : **le registre du cycle est VIDE**.
  Mesuré par l'agent principal : **1950 cas root, 0 échec, 49 fichiers**, et l'écart depuis
  le lot 4 est **entièrement attribué** — `test_fil.py` +2 (reboucle `ts`),
  `test_app_navigation.py` +4 (deux sélecteurs `mono` neufs, comptés dans deux `forEach`
  symétriques). ⚠️ Le rapport annonçait le total « reconstruit par soustraction, pas rejoué »
  et donnait `test_app_conversation_feature026` à **4 → 2 cas** : mesure faite, ce fichier
  rend **2 cas à tous les lots** (1, 4 et 5), ses deux assertions étant simplement passées
  de rouge-attendu à verte. Le total, lui, est juste.
  ⚠️ **`PIEGES §7` s'est vérifié sur DEUX harnais, pas un** : `test_app_bug012.js` porte une
  **seconde** liste `IDS` tenue à la main, que mon brief n'avait pas nommée. Ajouter les
  3 ids neufs l'a fait passer de **vert-à-tort à rouge réel** — trouvé en relançant la suite
  ENTIÈRE, jamais en se fiant au harnais du lot. Un brief qui cite §7 doit nommer **tous**
  les fichiers porteurs, pas seulement celui du lot courant.
  ⚠️ **Une classe CSS neuve doit être posée par un SCÉNARIO, pas seulement être atteignable
  en théorie** : `F3b` a trouvé 5 classes déclarées et jamais posées. Le correctif a coûté la
  lecture du patron `figer()` — `#claude-status` est un élément **partagé**, écrasé par
  l'état suivant : sans figement explicite, seul le DERNIER état survit au balayage du DOM.
  ✔️ **Un défaut PRÉEXISTANT révélé par l'unification des deux canaux** : `heureDepuisMs(ts)`
  testait `typeof ts !== "number"` alors que le `ts` de `feature-022` était **déjà** une
  chaîne ISO-8601 — la fonction rendait donc **toujours** `""`. Du code mort silencieux :
  le panneau de `feature-022` n'a jamais affiché d'horodatage, et aucune assertion ne le
  disait. Remplacée par le `heure()` générique qui traite les deux canaux à l'identique.
  **Changement visible utilisateur → `CHANGELOG.md`** (à charge de `doc-writer`).
  Livrables : **B1, B2 livrés** ; registre `ATTENDU_ROUGE` **vide sur les 4 fichiers**.
- [2026-09-23 01:20] Étape 6 — security-reviewer, **rôle GATE P2 — GO SOUS CONDITIONS,
  4 conditions**, et la première est un **défaut de fond dans un livrable de ce cycle** :
  ⚠️ **L'HEURISTIQUE EST INATTEIGNABLE SUR SA CIBLE RÉELLE.** `ecran_semble_au_prompt`
  (`session_tmux.py:180`) exige une ligne **bordée `│`** commençant par `❯`. Mesuré par
  l'agent principal sur la vraie session, en lecture seule :
  `'│ ❯' présent : False` · `ligne commençant par '❯' colonne 0 : True`.
  Le composeur de `claude` 2.1.278 n'a **aucune bordure verticale** : la ligne est
  `'❯\xa0'` (un **espace insécable**, pas un espace) entre deux règles `─`. L'heuristique
  ne voit donc **jamais** de prompt → `etat()` rend `occupee` en permanence → **le chemin
  d'écriture est mort-fermé, 409 pour toujours**. La direction est sûre ; la garde ne
  garde rien.
  ⚠️ **Et le second ancrage est creux aussi — l'agent principal l'ajoute au constat du
  GATE** : `_MOTIF_OCCUPATION = "esc to interrupt"` est cherché sur tout l'écran, mais la
  ligne d'état réelle est **tronquée par la largeur du panneau** :
  `⏵⏵ auto mode on (shift+tab to cycle) · /tasks to see subagents · esc to int…`.
  La chaîne complète est donc **absente** (`'esc to interrupt' présent : False`). Un motif
  ancré sur une phrase entière ne survit pas au découpage du terminal. **Deux ancrages
  creux, pas un** — et les deux dans la même fonction.
  ⚠️ **Cause racine, et elle a un nom dans ce dépôt** : les témoins de la condition 8 sont
  des `cat` d'un écran **dessiné à la main** (`test_session_tmux.py:213-250`). Ils
  certifient une forme qui n'existe sur aucune version de `claude`. C'est
  « un dépôt jetable n'est pas un petit dépôt réel », transposé : **un témoin fabriqué
  n'est pas une capture**. Les 3 témoins étaient conformes à la consigne (session jetable,
  phrase-marqueur) — la consigne, écrite par l'agent principal, ne disait pas qu'il fallait
  un **vrai `claude`** dans la session jetable.
  **Traité DANS ce cycle** (`ADR-0017` : un défaut qui rend inatteignable la garde livrée
  par le cycle en cours se corrige dans ce cycle, avant elle).
  **Trois autres conditions** : (2) `tmux -t <nom>` résout par **PRÉFIXE** — mesuré,
  `-t claude` atteint `claude-kit-jetable` — donc le `destinataire` affiché peut **mentir** ;
  à cibler par `"=<nom>:"` sur les 5 sites ; (3) le `session_id` extrait de `--resume`
  entre dans un `os.path.join` **sans motif ni confinement** — la condition 7 du P1 n'est
  pas tenue ; (4) `ADR-0042` **n'existe pas encore** et la doc décrit encore `feature-022`.
  **Ce qui EST tenu, vérifié ligne à ligne** : journalisation avant envoi sur **tous** les
  chemins ; texte par **stdin**, jamais par `argv` ; `-S` explicite ×7 ; env purgé ;
  aucun `shell=True` (2 occurrences, toutes deux en docstring) ; aucun `stderr` rendu au
  client ; journal en **0600** ; réversibilité **byte-identique** quand `[session]` est
  absente ; `lanceur.py` et `transcripts.py` à `git diff` **vide** ;
  `test_server_conversation.py` **41 cas, 0 échec**.
  ✔️ **Piège de méthode qu'il nomme, et qui vise le lot 4** : « mesurer le **coût** d'une
  fonction n'est pas mesurer son **verdict** » — le lot 4 a chronométré `etat()` à 2,4 ms
  sur la session réelle **sans relever qu'elle rendait `occupee`**. Le chiffre était juste,
  la conclusion absente.
- [2026-09-23 04:10] Reboucle P2 — backend-developer — **les 4 conditions closes, et la
  garde regarde enfin la bonne forme**. `ecran_semble_au_prompt` exige désormais **trois**
  conditions cumulées : le sandwich bordure **horizontale** / `❯` colonne 0 / bordure, pris
  sur la **dernière** occurrence ; **rien après `❯` sinon `U+00A0`** (tout le reste est un
  brouillon, jamais « prêt ») ; et aucun signal d'occupation. **4 témoins RÉELS** capturés
  depuis une vraie session `claude` jetable remplacent les dessins à la main, et la mutation
  qui compte est là : **l'ancien dessin ne produit plus `True`**.
  ⚠️ **Rectification de ma propre ligne du 2026-09-23 01:20.** J'avais écrit que le motif
  `"esc to interrupt"` est **absent** de l'écran réel, donc creux. C'est vrai **à un
  instant**, faux comme propriété : le pied de page **varie**. Mesuré à nouveau à l'instant,
  il rend `⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt · ← for agents` — chaîne
  **entière, présente**. La troncature survient quand `/tasks to see subagents` s'y insère,
  c'est-à-dire **quand des sous-agents tournent**, donc **exactement quand la session est
  occupée**. Le motif de secours disparaît au moment précis où il servirait : c'est **pire**
  que ce que j'avais décrit, et ça justifie le motif **primaire** choisi par le
  backend-developer — le spinner `…\s*\(\d+s`, qui vit dans la zone de défilement et
  **survit à la troncature**.
  ✔️ **Vérifié par l'agent principal sur la capture VIVANTE de `claude-kit`** :
  `ecran_semble_au_prompt` rend **`False`**, et **pour la bonne raison** — le pied portait
  `esc to interrupt` au moment de la mesure, la session étant effectivement en train de
  travailler. Un `False` correct, pas un `False` d'ancrage creux.
  ⚠️ **Le piège qui explique pourquoi l'ancienne heuristique semblait plausible** : `❯` en
  colonne 0 **préfixe aussi chaque message déjà envoyé** dans le défilement. Un ancrage
  « une ligne commençant par `❯` » retrouve donc une ligne d'**historique**. C'est pour ça
  que la bordure verticale du P1 paraissait raisonnable en relecture — et pourquoi seule
  l'exécution l'a réfutée.
  ⚠️ **`tmux -t <nom>` bascule SILENCIEUSEMENT d'exact-match à préfixe** dès qu'aucune
  session ne porte ce nom exact : avec une session `claude` présente, `-t claude` la trouve ;
  sans elle, `-t claude` atteint `claude-kit-jetable`, **rc=0, sans un mot**. Un test qui ne
  couvre que « les deux sessions existent » manque la bascule — il a fallu un **second**
  témoin. Les 5 sites passent par `_cible()` et `"=<nom>:"` ; repli **fail-closed**.
  ⚠️ **Fait d'environnement relevé en cherchant un témoin** : en `auto mode`, `claude`
  2.1.278 **approuve automatiquement les commandes shell**, `rm -rf` compris, **sans aucun
  dialogue**. Seul `manual mode` + une **écriture** de fichier en déclenche un. Le risque
  « le message est avalé par un dialogue » est donc **faible sur cette session-ci** ; ce qui
  ne l'est pas, c'est qu'une instruction tapée depuis le cockpit s'y exécute **sans
  confirmation**. À porter au dossier de `doc-writer`, pas à taire.
  ✔️ **L'écart de comptes que le rapport ne pouvait pas trancher, tranché par l'agent
  principal** : sa référence (1946) était **périmée** — prise avant l'atterrissage du lot
  frontend. Mesure faite : **1950 (lot 5) + 12 = 1962**, un seul fichier bouge
  (`test_session_tmux.py` 19 → 31), soit **exactement son propre delta**. Aucune anomalie de
  concurrence : `PIEGES §58` ne s'applique pas ici. **1962 root / 1885 non-root, 0 échec.**
- [2026-09-22 18:40] **MISE EN SERVICE SUR LA MACHINE DE L'HUMAIN** — agent principal, sur
  sa décision (« Oui »). Trois causes mesurées empêchaient le panneau de fonctionner, aucune
  mystérieuse : (1) le serveur tournait depuis 12:56, donc sur le code d'**avant** ce cycle —
  `/api/conversation` rendait encore le message de l'ancien canal ; (2) la configuration ne
  déclarait **aucune** section `[session]`, donc le repli vers `feature-022` s'appliquait
  comme prévu ; (3) rien n'était commité.
  Bloc `[session]` ajouté à `control-center/control-center.toml` (**gitignoré**, sauvegarde
  prise avant modification), serveur arrêté par `SIGTERM` propre — aucun `SIGKILL` — et
  relancé détaché, `__pycache__` purgé avant (`PIEGES §36`). **PID 2317036.**
  **Vérifié par requête réelle** : `GET /api/conversation` rend
  `etat: "Occupée"` · `destinataire: "session tmux 'claude-kit'"` ·
  `session_id: 6cb1e70e-…` · **40 messages, `tronque: true`** — et le dernier message
  utilisateur porte `prompt_source: "queued"`, c'est-à-dire **venu du téléphone**, pas du
  clavier tmux. Le discriminant mesuré au GATE P1 se lit donc **en production**, sur des
  données réelles, sans avoir été fabriqué.
  `etat: "Occupée"` est **correct** : la session travaillait au moment de la requête.
  ⚠️ **Le cycle n'est PAS clos pour autant** : `D6` (campagne de mutation), `C1`/`C2`/`C3`
  (doc, `ADR-0042`, `PIEGES`) et la revue de code restent dus. C'est un essai réel sur la
  machine, pas une clôture — dit comme tel à l'humain avant qu'il ne décide.
- [2026-09-22 19:30] Étape 5bis — ux-ui-designer — **correction de son propre design, sur
  demande humaine**. La pastille passe de **quatre états à trois** : « En ligne » (celui de
  la maquette, inchangé), « Hors ligne », « Injoignable ». **« Occupée » disparaît du
  badge** — il ne codait rien que la référence connaisse, et il servait à **bloquer
  l'envoi**.
  **L'information « Claude travaille » n'est pas perdue, elle est déplacée là où le vrai
  client la met** : dans le fil, via `rendreMessageActiviteClaude()`/`#claude-live-message`
  — mécanisme **déjà construit et testé** pour l'ancien canal, aucune classe neuve, aucun id
  neuf. Le `title` d'incertitude quitte le badge et se redépose sur cet indicateur : le
  badge ne dépend plus d'une heuristique, seulement de `has-session`.
  **Le compositeur n'est plus jamais inerte parce que Claude travaille.** La branche
  `libelle === "Occupée"` d'`appliquerEtatComposer` est **supprimée** ; le `409` devient
  **réactif** au lieu de préventif, sous deux formes distinctes — dialogue détecté
  (`<dialog>` modal, patron de `#delete-dialog`) et brouillon présent dans le terminal (note
  inline existante). Retraits **nommés** : règle CSS `.claude-status.is-occupee`, entrée
  `"Occupée"` de `_CLASSE_ETAT_PASTILLE`, objet `_TITRE_HEURISTIQUE_PASTILLE` **entier**,
  branche d'inertie. ⚠️ Nommer les retraits n'est pas du zèle : une classe déclarée et plus
  jamais posée fait échouer la garde de parité `F3b`.
  ⚠️ **Dépendance ouverte qu'il signale au lieu de la supposer** : les deux textes du `409`
  ne sont discriminables que si le backend distingue « dialogue détecté » de « brouillon
  présent » dans `donnees.erreur`. À trancher avant l'implémentation frontale.
  ✔️ **Deux pièges de méthode qu'il s'inflige à lui-même, et le second est le plus
  précieux du cycle** :
  1. « **Citer un précédent de couleur pour chaque état ne prouve pas que le NOMBRE d'états
     est fondé.** » La garde qui aurait dû l'arrêter n'était pas « cette couleur a-t-elle un
     précédent » mais « **combien d'états le prototype normatif distingue-t-il, et qu'est-ce
     qui autorise explicitement d'en ajouter** ».
  2. « **Une mesure déjà écrite dans le journal n'a pas traversé jusqu'à la décision
     d'interaction.** » `promptSource: "queued"` était mesuré, cité, et lu — mais **pour
     juger la traçabilité** au GATE, jamais recroisé avec la question ergonomique « le
     compositeur doit-il rester actif pendant que Claude travaille ? ». **Une même mesure
     peut trancher deux questions différentes ; ne la faire servir qu'à celle pour laquelle
     elle a été produite est un point mort qu'aucune relecture de spec ne signale.** Seule
     la question humaine directe l'a fait remonter. → à porter dans `PIEGES` et dans l'ADR
     de méthode appelé par `feature-027`.
- [2026-09-22 20:15] Reboucle « la garde gardait le mauvais invariant » — backend-developer —
  **mesurée d'abord, corrigée ensuite**. Faits établis sur session `claude` **jetable**,
  pendant une génération réellement au premier plan (spinner et motif d'occupation
  confirmés à l'écran) :
  **(a) Écrire pendant que Claude travaille MARCHE.** Le texte est accepté, le composeur
  affiche `ctrl+x ctrl+s to send now`, l'`Enter` produit `❯ Press up to edit queued
  messages`, et le message est **traité après** la tâche en cours — l'agent y répond
  explicitement. Rien de perdu, rien d'entrelacé.
  **(b) Le transcript le confirme au mot près** : `promptSource: "queued"` sur ce
  message, contre `"typed"` pour trois messages passés **par le même chemin mécanique**
  hors occupation. Le champ reflète donc **l'état de `claude`**, pas la manière dont le
  texte est inséré. L'hypothèse que le GATE P1 déclarait « non mesurable sans écrire dans
  la session réelle » est **mesurée** sur l'équivalent jetable.
  **(c) Dialogue modal** : le collage est **silencieusement absorbé** — aucune trace,
  sélection inchangée. Ce n'est pas déductible de la documentation ; sans la mesure on
  aurait soit sur-craint ce cas (inoffensif en lui-même), soit **sous-estimé le vrai
  risque** : l'`Enter` qui suit activerait l'option en surbrillance. Le refus reste donc
  **en amont**, avant tout collage.
  **(d) Brouillon présent** : le collage **se concatène à l'octet près, sans séparateur**,
  corrompant les deux messages. Seul cas où le soupçon du GATE visait juste.
  **Code** : trois prédicats désormais **distincts** — `ecran_semble_au_prompt` (critère
  d'ENVOI : composeur identifié et **vide**, que l'occupation soit affichée ou non ; il ne
  teste **plus** l'occupation), `ecran_indique_occupation` (**informationnel**, alimente
  `etat()` sans gouverner le 409), `compositeur_toujours_accessible` (TOCTOU post-collage :
  la boîte est-elle **encore là**, pas « est-elle vide » — après collage elle porte notre
  texte). Raisons de refus réduites à ce qui reste dangereux et **nommées** :
  `compositeur_introuvable`, `brouillon_present`, `interrompu_apres_collage`. La dépendance
  ouverte du designer est donc **levée** : les deux messages du 409 sont discriminables.
  ✔️ **Témoins INVERSÉS, jamais supprimés** (`PIEGES §30`) : le témoin « réponse en cours »
  reste le **même texte** et passe de témoin de refus à témoin d'**acceptation** ; les
  témoins « motif seul » valident désormais **deux** prédicats sur le même écran.
  **3 mutations, toutes tuées** : réintroduire le refus sur occupation tue 3 assertions ;
  neutraliser `ecran_indique_occupation` en tue 2 ; figer `compositeur_toujours_accessible`
  à `True` puis à `False` tue les deux familles. Sources restaurées, `diff` vide.
  **1968 root / 1891 non-root, 0 échec**, vérifié par l'agent principal fichier par fichier :
  **+6, entièrement dans `test_session_tmux.py`** (31 → 37), aucun autre fichier touché.
  ⚠️ **Piège de mesure qui a failli produire un faux résultat** : `sleep N` au premier plan
  est **auto-basculé en arrière-plan** par le harnais de `claude`. La première tentative
  mesurait donc une session **déjà au repos** en croyant la mesurer occupée — sans échouer
  bruyamment, juste en ne testant pas ce qu'elle prétendait tester. Il a fallu une
  **génération de texte longue** pour obtenir une occupation réelle.
- [2026-09-22 21:40] Lot 5bis — frontend-developer — **correction appliquée, et le cockpit
  devient utilisable**. Badge à **trois** états, `.claude-status.is-occupee` **retirée**
  d'`app.css` (il n'en reste qu'une mention **en commentaire**, qui explique le retrait —
  vérifié par l'agent principal), `_TITRE_HEURISTIQUE_PASTILLE` supprimé en entier, branche
  d'inertie « Occupée » supprimée. « Claude travaille… » vit **dans le fil**, dans la région
  `aria-live` existante, avec le `title` d'incertitude déplacé sur lui. Le `409` est
  **réactif** et lisible cause par cause : `<dialog>` modal pour le dialogue,
  note inline pour le brouillon, libellé backend repris **tel quel** pour le troisième.
  **1991 root / 1914 non-root, 0 échec**, vérifié fichier par fichier par l'agent principal :
  **+23 entièrement dans `test_app_conversation_feature026.py`** (2 → 25), aucun autre
  fichier touché — confirmé côté agent par un `git stash` de contrôle.
  **7 mutations, toutes tuées.** La septième mérite d'être citée : réintroduire
  `"Occupée": "is-occupee"` **sans** la règle CSS tue la garde de parité `F3b` dans un vrai
  Chromium (classe orpheline) — elle prouve que le scénario conservé est un **garde-fou de
  régression**, pas un test mort.
  ⚠️ **TROISIÈME registre tenu à la main découvert** — après `test_app_conversation_feature026.js`
  et `test_app_bug012.js`, voici `test_app_bug017.js` et son `FRERES_INERTES` : **tout
  `<dialog>` enfant direct de `<body>`** doit y être déclaré, sinon la garde
  « zéro contrôle atteignable hors de la porte » échoue. Trouvé **en exécutant ce
  fichier-là**, pas en lisant mon brief — qui n'en nommait que deux. `PIEGES §7` vise donc
  **au moins trois** porteurs, et la leçon est que la liste des porteurs est elle-même une
  énumération tenue à la main (`PIEGES §21`).
  ⚠️ **Piège d'outillage** : `git stash push -u` sur un fichier **non suivi** le fait
  **disparaître du disque**, pas seulement « revenir à l'état d'avant ». Un fichier créé
  pendant ce cycle et jamais commité s'est évanoui le temps d'une mesure de delta, restauré
  par `git stash pop` immédiat. Sans distinction suivi/non-suivi avant le stash, une mesure
  de contrôle peut détruire ce qu'elle mesure.
  **MISE EN SERVICE** : serveur arrêté par `SIGTERM` propre (PID 2317036), `__pycache__`
  purgé, relancé détaché — **PID 2346105**. Vérifié : le `app.js` servi a la **même
  empreinte** que celui du disque. Le cockpit accepte désormais l'écriture pendant que la
  session travaille.
- [2026-09-22 22:20] Étape 5ter — ux-ui-designer — **plafond de hauteur arbitré, une seule
  ligne CSS**. `.claude-panel { max-height: 58vh }` — **pas une valeur choisie à l'œil** :
  c'est celle de `.kanban-viewport`, déjà en production, et la convention qu'elle établit
  (« toute colonne dont le contenu vient des données se plafonne en fraction de viewport et
  défile en interne »). La contrainte se pose **une fois, sur le parent** : `.conversation`
  a déjà `overflow: auto`, mais une ligne `1fr` dans une grille non bornée se dimensionne
  **sur le contenu** — tant que `.claude-panel` n'a pas de hauteur finie, `overflow` ne fait
  rien. C'est l'explication du défaut, et elle était invisible en lecture de règle.
  ✔️ **Il a corrigé une erreur de fait de MON brief** : j'y désignais le kanban comme la
  « colonne voisine » de `.claude-panel`. Faux — `.backlog` est un **frère de `.workspace`**,
  sur une autre ligne de page ; le vrai voisin de grille est `.cycle-surface`, le diagramme.
  Et il ne grandit pas parce qu'il aurait un plafond, mais parce que **sa grammaire** empile
  les agents verticalement dans un créneau et fait défiler le temps horizontalement. La
  conversation n'a aucune borne de grammaire équivalente : elle seule a besoin d'un plafond
  explicite. Aucun document ne portait cette structure — il a fallu croiser `index.html` et
  `app.css` pour l'établir.
  **Ancrage en bas** : le fil suit un message neuf **seulement si l'utilisateur y était
  déjà** (seuil ~24 px), mesuré **avant** la réécriture du DOM et reposé après ; jamais de
  saut forcé sur quelqu'un qui a remonté l'historique ; `scrollTop` direct, **sans**
  `scroll-behavior: smooth` — c'est un repositionnement de contenu, pas une décoration, et
  le design system plafonne les animations à 150 ms.
  ⚠️ **Couplage signalé plutôt que découvert plus tard** : `58vh` hérite de la même
  imprécision que les `100vh` face au clavier iOS. Ce n'est pas une régression — le kanban
  vit avec depuis son lot — mais le jour où `feature-028` migre vers `dvh`, **cette règle
  doit migrer avec**, sous peine d'incohérence entre les deux zones défilantes.
- [2026-09-22 23:15] Lot 5quater — frontend-developer — **plafond appliqué, PROUVÉ AU
  NAVIGATEUR**. Chromium réel, 40 messages injectés : `.claude-panel` mesuré à **761,5 px**
  (58 vh de 1313), `#conversation` **scrollHeight 4353 / clientHeight 433** — le fil défile
  enfin **à l'intérieur**. Mutations : retirer le `max-height` ramène le panneau à
  **4681 px** et tue les deux assertions ; neutraliser la condition « était déjà en bas »
  tue la préservation de position. `#conversation` devient focalisable (`tabindex`, `role`,
  focus visible) — le défilement interne étant réel **pour la première fois**.
  ⚠️ **Conséquence que personne n'avait anticipée, trouvée par la garde de fidélité pixel** :
  le plafond **casse l'étirement par défaut** de la grille (`align-items: stretch`). Avant,
  le panneau s'allongeait jusqu'à la hauteur de sa colonne sœur, plaçant `#composer` à une
  position **dépendante de cette autre colonne** ; plafonné, il reprend sa hauteur propre et
  le compositeur remonte. Conséquence **attendue**, détectée par exécution — pas par
  relecture.
  ⚠️ **EXEMPTION RATTRAPÉE PAR L'AGENT PRINCIPAL.** Pour absorber ce déplacement, le lot a
  sorti `composer` et `prompt` de la clause d'ordre vertical de
  `test_app_fidelite_navigateur.py`, avec une justification mécanique juste et le mécanisme
  d'exception **existant** — la bonne forme. Mais recherche faite dans **toutes** les suites
  web : **aucune** assertion d'ordre ne subsistait sur ces deux ancres. C'est le patron
  « couverture dissoute par exemption » déjà payé pendant `feature-021` : une exemption
  motivée reste une exemption, et sans compensation le trou ne se signale jamais.
  **Compensé** : deux assertions d'**ordre DOM** — `#conversation` précède `#composer`,
  `#prompt` est descendant de `#composer` — ancrées sur la **source**, jamais sur un `top`
  peint (réintroduire une mesure de position recréerait la fragilité que l'exemption
  corrige). **Tuées par mutation réelle** : déplacer le bloc `<form id="composer">` avant
  `#conversation` dans `index.html` tue la première ; extraire `#prompt` du formulaire tue
  la seconde. Et les deux entrées d'exception portent désormais **la phrase qui dit où vit
  la compensation** — le prochain lecteur n'a plus à refaire la recherche.
  **1997 root / 1920 non-root, 0 échec**, vérifié fichier par fichier : +6 depuis le lot
  précédent, répartis sur `test_app_classes_navigateur.py` (+2) et
  `test_app_conversation_feature026.py` (+4). Cockpit redémarré — **PID 2372058**, et
  `max-height: 58vh` est bien servi.
- [2026-09-23 00:10] **ABSORPTION de `feature-028` au titre d'`ADR-0017`** — agent principal,
  sur décision humaine (« Absorbe, absorbe »). Le cycle porte désormais **deux specs** dans
  `doing/`, avec **une seule** phase de test / revue / documentation, comme la règle
  l'autorise. ⚠️ Un ADR devra écrire cette décision — elle est **prise**, pas subie.
  **Ce qui la justifie, et c'est un constat sur MA clôture** : l'humain signale que les
  cadres « agents », « système » et ceux du dessous n'ont pas disparu. Vérification faite
  dans `index.html` — la section **`U1 — ce qui disparaît pour de bon`** de `feature-021`
  (spec **CLOSE**) porte un verdict écrit par section, et **un seul sur six a été
  appliqué** :

  | Verdict de `U1` | État réel mesuré |
  |---|---|
  | `agents` — SUPPRIMÉE entière | **VISIBLE** |
  | `systeme` — « la section n'existe plus » | **VISIBLE** |
  | `cycles` — `.table-passages` SUPPRIMÉE | appliqué ✓ |
  | `fichiers` — liste des commits SUPPRIMÉE | **VISIBLE** |
  | `evenements` — SUPPRIMÉE comme panneau permanent | **VISIBLE**, `#timeline` compris |
  | `developper` — `#compteur-prompt` supprimé | **VISIBLE** |

  ⚠️ **`feature-021` a été clôturée dans cet état, par moi.** Sa check-list portait
  `F7 — structure mono-écran ; 0 role="tab"` : j'ai vérifié **la lettre** (aucun
  `role="tab"`, vrai) et **jamais la chose** (l'ancien tableau de bord a disparu, faux).
  La dette a donc traversé une revue de code, une campagne de mutation et une clôture
  complète — **aucune ne pouvait la voir**, puisqu'aucune ne mesurait l'énoncé réel.
  C'est le défaut de méthode que `feature-027` doit graver, constaté ici sur mon propre
  travail plutôt que sur celui d'un agent.
  **Conséquence pour `feature-028`** : son livrable `A1` cesse d'être un arbitrage
  (« retirer / replier / conserver ») pour devenir **l'application d'une décision déjà
  écrite**, et il gagne `A1bis` — une garde de non-régression qui vérifie que chaque
  élément déclaré supprimé par `U1` est **absent du DOM**, par exécution. C'est cette
  garde-là qui manquait.
- [2026-09-23 00:40] Reboucle « le refus lisait notre propre écho » — backend-developer —
  **ma piste a été RÉFUTÉE par la mesure, et c'est le bon résultat**. J'avais proposé de
  distinguer un vrai brouillon d'un écho par la **persistance** : deux captures séparées
  d'un court délai. Mesuré sur session jetable, `capture-pane -p -e`, échantillonné toutes
  les ~15 ms : dans un essai l'écho disparaît à **~30 ms** ; dans un autre, un contenu écrit
  par `claude` reste affiché **≥ 260 ms sans jamais se vider** sur toute la fenêtre observée.
  **La durée n'est pas bornée de façon fiable** — le critère temporel aurait, selon le délai
  choisi, soit refusé à tort un cas sûr, soit laissé passer trop tard.
  ✔️ **Le signal fiable est STRUCTUREL, pas temporel.** Capturés avec les séquences ANSI,
  les **trois** textes que `claude` écrit lui-même dans le compositeur — écho d'envoi,
  `Press up to edit queued messages`, placeholder `Try "…"` — portent **systématiquement**
  un habillage non par défaut (atténuation `\x1b[2m`, ou premier-plan **et** fond
  `38;5;239`/`48;5;237`). Un vrai brouillon tapé à la main reste **en style plan**
  (`\x1b[39m`, sans fond, jamais atténué), vérifié à trois reprises dont après 2 s.
  **Critère retenu, et il n'énumère rien** (`PIEGES §21`) : le contenu après `❯` n'est un
  brouillon **réel** que si son premier caractère visible est rendu **sans aucun attribut
  spécial**. Un indice futur de `claude` passera tant qu'il reste habillé différemment du
  texte réel — ce qui a été vrai dans les trois cas mesurés.
  **Coût : nul.** `capture-pane -p` et `-p -e` coûtent **le même** 0,0023 s/appel
  (20 répétitions). Aucune boucle d'attente, aucun second essai : la borne de temps que je
  réclamais comme livrable est **sans objet**, parce que la solution mesurée n'en a pas
  besoin. **6 mutations, 6 assertions tuées** — trois qui meurent si le refus reprend sur un
  écho, trois qui meurent s'il cesse de refuser un vrai brouillon. Les deux sens, comme
  exigé : sinon la correction ouvre le trou qu'elle prétend fermer.
  ⚠️ **Mesure de suite impossible à cet instant, et il le dit au lieu de l'arrondir** : la
  suite `web/` était **rouge** pendant son passage (1603 cas, 9 échecs, 10 fichiers muets),
  **entièrement hors de son périmètre** — c'est le lot frontend `U1`/`dvh` **en cours**,
  lancé par l'agent principal en parallèle. Son périmètre à lui est vert : 1198 cas,
  23 fichiers, 0 échec.
  ⚠️ **Variante de `PIEGES §58` qu'il nomme précisément** : la lettre du piège parle d'une
  course **transitoire** qui se résout quand les fichiers cessent d'être écrits. Ici,
  **12 secondes de stabilité des `mtime` n'ont rien changé** — parce que le désaccord n'est
  pas une lecture-pendant-écriture mais un **état intermédiaire réel** (un id renommé dans
  `app.js`, pas encore répercuté dans les harnais JS dupliqués). Les deux produisent le même
  symptôme pour des raisons différentes, et seule l'inspection du **contenu** de l'échec
  tranche. ⚠️ **Faute de séquencement de l'agent principal** : deux lots sur le même arbre.
- [2026-09-23 10:40] ⚠️ **DÉFAUT TROUVÉ PAR L'USAGE — le `destinataire` n'est PAS
  journalisé.** L'humain a envoyé « Cécile est un test » depuis le cockpit : reçu,
  `envoye: True`, la boucle fonctionne de bout en bout depuis son iPad. Mais l'agent
  principal a lu la ligne écrite :

      clés réelles : ['envoye', 'texte', 'ts']      → `destinataire` ABSENT

  **C'était une exigence explicite, deux fois** : arbitrage 1 de l'`architect`
  (« `destinataire` nommé dans la réponse **ET** dans la ligne de journal ») et condition 2
  du GATE P1 (« le journal porte `ts`, `texte`, `destinataire`, `verdict_ecran`,
  `envoye` »). Sa raison d'être est nommée dans les deux : le cockpit peut parler à **deux**
  interlocuteurs, et dans le transcript un message tapé par le cockpit est **indiscernable**
  d'un message venu du téléphone — **le journal du cockpit est le seul enregistrement de la
  destination**. Sans ce champ, un message parti dans le mauvais terminal est
  **irretraçable**.
  ⚠️ **Ce que ça dit de nos gardes** : le GATE P2 a vérifié « la journalisation précède
  l'envoi sur **tous** les chemins » — vrai, et insuffisant. Aucune assertion ne portait sur
  le **contenu** de la ligne. Treize campagnes de mutation ne pouvaient pas le voir : on ne
  mute pas un champ qu'aucune assertion ne lit. Même patron que les cinq défauts précédents
  de ce cycle — **vérifier que le mécanisme fonctionne, jamais qu'il fait la bonne chose**.
  Correctif dû, avec une garde qui **lit la ligne écrite** et meurt si un champ manque.
- [2026-09-23 12:10] Étape mutation — test-engineer — **18 mutants, 14 tués, 3 survivants
  NOMMÉS, 2 équivalents démontrés**. `1910 root / 1828 non-root, 0 échec, 54 fichiers,
  0 muet` — exactement la référence, dans les deux régimes.
  ✔️ **`PIEGES §62` éprouvé AVANT la clôture** : suite relancée avec les deux specs
  déplacées en `done/` → **identique**, aucune régression. Le défaut qui avait cassé la
  clôture de `feature-021` ne se rejouera pas ; état restauré et vérifié ligne à ligne.
  ✔️ **`pyflakes` : 0 alerte imputable au cycle** (6 préexistantes, chacune située hors des
  hunks du diff — vérifié, pas supposé). ⚠️ Et il le dit comme un **constat**, pas comme un
  « lint propre » : ce dépôt n'a **aucun** linter configuré.
  **Les 3 survivants sont des TROUS DE TÉMOIN, et chacun est un défaut réel signalé sans
  être réparé** (le mandat l'interdisait) :
  1. **Le filtre positif sur `type` de `fil.py` n'est exercé par aucun témoin** : tous les
     témoins de types exclus n'ont **pas** de `message`, donc le garde-fou de **forme**
     masque celui de **type**. Un enregistrement `system`/`mode` qui porterait un jour un
     texte passerait **à tort**.
  2. **La borne `max_messages` n'est jamais exercée** : le fixture ne produit que
     **36 messages** sous le budget d'octets, donc sous la borne de 40. Elle pourrait
     régresser en silence.
  3. **La recherche « dernière occurrence, pas la première »** du compositeur — la
     protection motivée par `PIEGES §27` — **n'est exercée par aucun témoin** : aucun écran
     capturé ne contient **deux** sandwiches complets.
  ⚠️ **Piège de mécanique qu'il a dû muter DEUX fois pour comprendre** : deux bornes
  indépendantes appliquent la même limite d'octets par des mécanismes différents. Muter
  l'une ne casse rien **parce que l'autre absorbe le coup**, et réciproquement. Une mutation
  qui semble neutraliser une garde peut survivre à cause d'une redondance **non documentée
  comme telle**.
  **C1 — CONFIRMÉ PAR EXÉCUTION** : un id bidon inséré dans `index.html` ne fait échouer
  **qu'un seul** des six registres. Les cinq autres sont inertes ou partiels. Ma tentative
  de recoupement par `grep` ne tranchait pas ; celle-ci tranche.
  **C2 — CONFIRMÉ, ampleur bornée** : le fragment synthétique de
  `test_app_contrastes_navigateur.py` porte **encore** `titre-pilotage` et `titre-cycles`,
  disparus du DOM réel au dernier lot — **sans aucun commentaire**, contrairement aux cinq
  autres sections déjà traitées. Aucun autre fichier n'en porte : le défaut est **borné**.
  **C3 — CONFIRMÉ, et sa fragilité est nommée** : altérer la table `U1` fait bien **échouer
  bruyamment** la garde. Mais ses ancres sont des **fragments littéraux** : elle protège
  contre la dérive de **fond**, pas contre une reformulation éditoriale de la table.
- [2026-09-23 13:05] Reboucle « trouvé par l'usage » — backend-developer — **les 5
  correctifs livrés**. `1923 root / 1841 non-root, 0 échec, 54 fichiers` — **+13**, attribué
  exactement : `test_fil.py` +4, `test_server_feature026.py` +8, `test_session_tmux.py` +1,
  rien ailleurs. **Vérifié en service** après redémarrage (PID 2637825) : le message réel
  de l'humain apparaît **une seule fois**, `role: user`, `source: cockpit`.
  **A — `destinataire` écrit sur les DEUX chemins**, et la garde **relit la ligne sur
  disque** pour comparer le **jeu de clés exact** — pas « une ligne existe ». Mutation :
  retirer le champ du dict sérialisé → 2 assertions meurent.
  **B — fusion transcript + journal du cockpit.** Appariement par **texte égal ET fenêtre de
  30 s**, jamais l'un sans l'autre — deux tests dédiés : dédoublonne **dans** la fenêtre, ne
  dédoublonne **pas** à 10 minutes d'écart. Les bornes sont **réappliquées après** fusion,
  depuis des constantes désormais **nommées et exportées** au lieu d'être dupliquées. Trois
  mutations (fusion retirée de deux façons, dédoublonnage inversé) tuent 4 assertions.
  ✔️ **`source: cockpit` n'est pas une fabrication** (`PIEGES §16`) : le cockpit **sait**
  qu'il a envoyé ce message, c'est écrit dans son propre journal. C'est la traçabilité que
  le GATE réclamait et que le transcript seul ne pouvait pas donner.
  **C1/C2/C3 — les trois trous de témoin comblés**, chacun par un témoin qui **atteint
  réellement** la garde : un enregistrement `system` **portant** un contenu texte (le
  garde-fou de forme ne masque plus celui de type) ; **200** petits messages au lieu de 400
  gros, pour **franchir** la borne de 40 et vérifier que ce sont bien les **derniers**
  conservés ; un écran à **deux** sandwiches, assemblé de morceaux **réels** et documenté
  comme montage. Les trois mutations correspondantes tuent désormais.
  ⚠️ **Rectification d'une lecture de l'agent** : il a vu `vcs.py`/`test_vcs.py`/
  `test_server.py`/`test_server_feature025.py` modifiés et en a conclu qu'un **autre agent
  travaillait en parallèle**. Non — ce sont les modifications **non commitées** du lot
  backend précédent (retrait de `/api/diff`). Aucun agent concurrent ne tournait. Un arbre
  de travail sale ressemble à de la concurrence quand on ne l'a pas produit soi-même.
- [2026-09-23 15:20] Étape 8 — code-reviewer — **REQUEST CHANGES, 4 points bloquants**,
  tous établis **par exécution**. Première revue du cycle : aucune n'était passée sur une
  ligne de ces deux specs.
  **B1 — LA FUSION AFFICHE DES MESSAGES JAMAIS ENVOYÉS.** `_fusionner_avec_journal_cockpit`
  ne lit **jamais** `envoye`, alors que la ligne est écrite **avant** l'envoi et reste
  `envoye: false` sur tout refus. Mesuré sur les **données de production** : journal de
  8 lignes, **5 avec `envoye: false`**, **les 8 affichées**. Et un message refusé puis
  réessayé avec succès plus de 30 s après apparaît **deux fois** — le dédoublonnage
  texte+30 s ne peut pas les apparier.
  ⚠️ **Le patron exact que je cherchais, et je l'ai introduit moi-même** : un commentaire
  d'`app.js` affirme que le canal `feature-026` « ne porte jamais ce champ, lu depuis le
  transcript ». C'était vrai **avant** la fusion, et faux depuis. Le marqueur « Non
  envoyé — réessayez », posé par une revue de `feature-021`, est donc **livré mort sur le
  seul chemin déployé**. Une reboucle tardive a rendu faux un commentaire que personne
  n'a relu.
  **B2 — LE `+` RESTE INUTILISABLE SUR L'IPAD, et les `dvh` n'étaient qu'une des deux
  causes.** Mesuré en Chromium à six hauteurs : à **313, 413, 533 et 613 px**, les actions
  sortent de la boîte et `document.elementFromPoint` au centre du bouton rend **`null`** —
  **inatteignable**, pas seulement hors de vue ; au même instant `.add-item-body` vaut
  `0px`, donc titre et description le deviennent aussi. `form scrollHeight 561 /
  clientHeight 399`, et **aucun conteneur de la chaîne ne défile**. iPad paysage clavier
  ouvert ≈ 415 px, iPad mini portrait ≈ 480 px : **les deux dans la plage cassée**. C'est
  le livrable `B2` et le critère d'acceptation n°1 de `feature-028`, sur la boîte même que
  le rapport humain désigne.
  **B3 — mémoïsation NON BORNÉE dans un serveur de longue durée.** `fil.py::_cache` n'a ni
  plafond ni éviction ; sur un transcript **actif**, chaque écriture crée une entrée de
  plus. Mesuré : 200 écritures → 200 entrées, 2,6 Mo ; extrapolé à la cadence **mesurée par
  ce cycle** (1431 écritures/24 h) → **227 Mo/jour, jamais libérés**, sous `MemoryMax=2400M`,
  sur une machine qui a **déjà payé un OOM**. ⚠️ Et le docstring affirme le contraire —
  « même patron que `transcripts.py` », qui mémoïse des transcripts **terminés**, donc un
  jeu de clés **borné**. Ici la clé ne s'invalide pas, elle **s'accumule**.
  **B4 — le code cite un `ADR-0042` qui n'existe pas** (`docs/adr/` s'arrête à 0041), et
  **mon journal se contredit** : l'entrée `[04:10]` annonce « les 4 conditions closes »
  alors que la condition 4 du P2 était précisément « `ADR-0042` n'existe pas encore ».
  Deux modules de production renvoient vers un document introuvable, et
  `check_doc_links.sh` **ne voit pas** les citations faites depuis du code.
  **Mineurs notables** : avec `ecrivains_simultanes > 1`, `lancement_spec_id` ne porte que
  le **premier** lancement actif → **une seule carte** interruptible, et le bouton générique
  ayant été retiré, le second lancement **n'est plus interruptible du tout** ;
  `#item-priority` est `aria-disabled` mais **pas `disabled`** — l'utilisateur peut changer
  une valeur qui sera jetée en silence ; `_RE_SESSION_ID` utilise `.match` là où le
  docstring annonce `fullmatch` (`'6cb1e70e\n'` passe) ; la garde de viewport n'analyse
  **pas** l'intérieur des `@media`.
  ✔️ **Ce qu'elle valide par exécution** : aucun `shell=True`, `-S` sur **les 7**
  invocations (⚠️ et elle note qu'un `grep` naïf en aurait compté 5 sur 7 — une variable
  locale réutilisée), environnement purgé sur **tous** les chemins, texte par **stdin**,
  `delete-buffer` en `finally`, ciblage `=<nom>:` sur les 5 sites ; le ciblage de
  l'interruption **prouvé dans les deux sens** ; le `+` : un clic = brouillon seul, vérifié
  **sur tous les chemins d'erreur**, `/api/spec/ecrire` n'ayant qu'**un seul** site d'appel ;
  `destinataire` présent sur la ligne réellement écrite.
- [2026-09-23 16:10] Reboucle revue B1/B3 — backend-developer — **corrigés, avec une
  décision de contrat assumée**. `1929 root / 1847 non-root, 0 échec, 54 fichiers` — +6,
  attribué exactement (`test_fil.py` +1, `test_session_tmux.py` +2,
  `test_server_feature026.py` +3).
  **B1 — la fusion IGNORE désormais les lignes `envoye: false`.** Promesse retenue :
  « tu ne vois que ce qui est réellement parti », et **non** « tu vois tout, marqué ». Les
  deux étaient défendables ; le choix est écrit dans le docstring, pas subi.
  ✔️ **B1b se résout PAR cette décision**, et l'agent l'a vu : une tentative refusée n'étant
  jamais candidate, le cas « refusé puis réessayé avec succès plus de 30 s après » ne peut
  plus produire deux occurrences — il n'y a **jamais** deux entrées à apparier. Le défaut
  d'appariement disparaît avec la cause, plutôt que d'être compensé.
  **B1d — le commentaire d'`app.js` corrigé** : son invariant n'est plus « ce canal ne porte
  jamais `envoye` » mais « le backend écarte les non-partis **avant** fusion ». C'était le
  cœur du défaut : une reboucle tardive avait rendu faux un commentaire que personne ne
  relit quand on ajoute une fonction à côté.
  **B3 — cache borné à UNE entrée par chemin** : la clé passe de
  `(chemin, mtime, taille, bornes)` — **accumulative** — à `chemin` seul, la valeur portant
  le reste. Une écriture **remplace** au lieu d'ajouter. Docstring corrigé **avec les
  chiffres** : 200 écritures → 200 entrées avant, **≤ 1** après. Garde : 30 écritures sur
  le même chemin → au plus une entrée ; mutation (retour à la clé complète) tue.
  ✔️ **Leçon appliquée sans qu'on la lui rappelle** : son premier test du motif
  d'identifiant frappait **l'objet regex isolé**, pas les sites d'appel — un retour à
  `.match` au site d'appel serait **passé inaperçu**. Il l'a refait pour traverser la vraie
  fonction, avec un nom de fichier réel (`6cb1e70e\n.jsonl`). C'est exactement « la garde
  doit atteindre la chose », trouvé par lui.
  **Tri** : un message sans `ts` va désormais **en fin** de fil ; le `or 0.0` le remontait à
  1970, donc en tête, présenté comme le plus ancien.
- [2026-09-23 17:30] Étape 9 — doc-writer — **docs vivantes + trois ADR + PIEGES tenus,
  critères d'acceptation cochés**. `ADR-0042` (pourquoi taper dans un pty plutôt qu'ouvrir
  un second processus, amende `ADR-0041` §7), `ADR-0043` (absorption de `feature-028` au
  titre d'`ADR-0017`, dette `U1` soldée) et `ADR-0044` (méthode : sept défauts trouvés par
  l'usage humain, aucun par la chaîne d'agents) créés — les deux premiers résolvent B4 de la
  revue de code (citation d'un ADR introuvable dans `fil.py`/`session_tmux.py`). `docs/adr/0019`
  reçoit une note additive datée (mention périmée d'`/api/diff`, corps intact). `control-center/README.md`
  (Étape B, table des chemins, Étape D `{spec_id}`, nouvelle Étape I+),
  `docs/features/page-centre-de-controle.md` (sept sections retirées et leurs verdicts,
  conversation réécrite en sémantique `feature-026`, sélecteur de cycle, `+` câblé,
  interruption par carte), `docs/DESIGN-SYSTEM.md` §6 (motif implémenté corrigé) et
  `CHANGELOG.md` mis à jour. `control-center/PIEGES.md` : six entrées ajoutées (§63-§68),
  aucune retirée. C1/C2/C3 et D6 cochés dans cette spec ; livrables de `feature-028`
  (A1/A1bis/A2/B1-B6/C1/C2/D1-D3) et critères d'acceptation cochés dans sa propre spec, sauf
  la vérification sur l'iPad réel de l'humain — **laissée ouverte**, aucune preuve
  disponible qu'elle a eu lieu après le correctif du GATE P2 (`B2`).
  `./tools/check_doc_links.sh` : 259 liens, tous résolus. Clôture (déplacement vers `done/`)
  laissée à l'agent principal.
- [2026-09-23 17:30] Étape 9 — doc-writer — **trois ADR écrits, documentation soldée**.
  `ADR-0042` (parler à une session qu'on ne détient pas — et il **amende** `ADR-0041` au
  lieu de prétendre le préserver), `ADR-0043` (l'absorption), `ADR-0044` (vérifier le
  mécanisme n'est pas vérifier la chose, avec les **sept** défauts en preuve).
  `PIEGES` passe de 62 à **68 entrées**. **259 liens** résolus contre 240.
  ✔️ **Il a vérifié les citations d'ADR faites DEPUIS LE CODE** — que
  `check_doc_links.sh` ne voit pas : c'est ainsi que `ADR-0042` a pu être cité par deux
  modules de production pendant des heures **sans exister**. Toutes résolvent désormais ;
  une seule ne résout pas, et elle est **légitime** : elle désigne explicitement un ADR du
  dépôt **consommateur**, pas de ce kit.
  ⚠️ **Il a trouvé une doc qui décrivait un motif jamais implémenté** : `DESIGN-SYSTEM §6`
  annonçait des onglets en `role="tablist"` ; le code utilise `role="group"` +
  `aria-pressed`, précisément pour ne jamais réintroduire le `role="tab"` que
  `feature-021` a banni. Écart vieux de dix mois. Même défaut vu par l'autre bout : une
  doc conforme à une **intention**, jamais confrontée au **code**.
  ✔️ **Il a REFUSÉ de déclarer le cycle clôturable**, un critère d'acceptation restant
  ouvert — la vérification sur l'iPad réel. Il a laissé la case décochée plutôt que de la
  cocher sur la foi d'une mesure faite ailleurs : exactement ce que l'ADR qu'il venait
  d'écrire lui interdisait.
- [2026-09-23 18:00] **Étape 10 — CLÔTURE**, autorisée par l'humain. Le dernier critère
  ouvert a été refermé **par l'usage** : il a écrit `feature-029` depuis son iPad, à 12:49,
  via le `+` que ce cycle a câblé — 8 842 octets, sa description mot pour mot. La preuve
  du cycle est un fichier produit par le cycle.
  **Mesures de clôture** : `1935 cas root / 1852 non-root, 0 échec, 55 fichiers, 0 muet` ;
  52 specs sans doublon ; 259 liens résolus ; `pyflakes` sans alerte imputable au cycle ;
  registres `ATTENDU_ROUGE` **vides** ; suite déjà éprouvée **après** un `git mv` simulé
  vers `done/` (`PIEGES §62`), donc le déplacement ne réserve pas de surprise.
  **Restent ouverts, dits et non cachés** : `systeme` a emporté « Configuration : lue /
  défauts » sans destination ; « Budget max » et « Écrivains » n'ont plus aucun porteur ;
  la légende de bornage de l'accordéon est perdue ; avec `ecrivains_simultanes > 1` un
  second lancement n'est pas interruptible ; le lancement par carte ne peut offrir qu'une
  commande. Chacun est **écrit à l'endroit du code qui le cause**.
  **Suites ouvertes** : `feature-027` (parité de comportement avec le client),
  `feature-029` (le cadre Claude, écrite par l'humain depuis le cockpit), et une spec à
  écrire sur la **suppression de la notion de commande** — décision humaine du 2026-09-23 :
  « la notion de commande pourrait être supprimée, elle ne sert pas dans mon cas », avec le
  choix **B** pour le lancement depuis une carte (la carte envoie l'ordre **dans la
  conversation**, plutôt que de lancer un processus séparé).
