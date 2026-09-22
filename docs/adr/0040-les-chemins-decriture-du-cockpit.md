# ADR-0040 — Les chemins d'écriture du cockpit : lancer, modifier et supprimer une spec, converser avec un agent en cours

## Statut

Accepté

## Date

2026-09-22

## Contexte

La réouverture de périmètre du 2026-09-22 (`ADR-0039`) fait entrer dans le
cockpit trois surfaces qui **écrivent** depuis une page servie sur le réseau
local, ce que `_ROUTES_ECRITURE` ne portait pas jusque-là :

- **S1** — `POST /api/spec/lancer` : lancer un cycle **pour une spec
  désignée** (`feature-025`).
- **S2** — `POST /api/spec/modifier` et `POST /api/spec/supprimer` : éditer
  et supprimer une spec existante (`feature-025`), dont la seconde est **la
  seule route destructive** du cockpit.
- **S3** — `GET`/`POST /api/conversation` : envoyer du texte à un agent en
  cours d'exécution et lire le fil des messages déjà envoyés
  (`feature-022`).

`security-reviewer`, rôle GATE, a examiné ces trois surfaces en **P1** (sur
le design, avant tout code — Règle absolue n°1). Premier verdict, par
surface : `POST /api/spec/lancer` **GO sous 8 conditions** ; `modifier`/
`supprimer` **GO sous 12** ; **conversation NO GO tel quel**. Le point que le
GATE a jugé décisif n'est pas ce refus initial :

> `PUT` + `lancer` donnent **déjà, à eux deux**, la capacité d'instruire
> arbitrairement un agent qui a un shell et l'identité git du développeur.
> S3 n'ajoute aucune classe de capacité nouvelle — refuser la conversation
> ne réduirait pas le risque.

Ce constat déplace le plafond de ce qu'un jeton achète, tel qu'`ADR-0020
§2` le décrivait à l'origine (« une barrière de rattachement ») : depuis ce
cycle, un jeton porteur achète des **instructions arbitraires à un processus
qui a un shell et l'identité git du développeur**, pas seulement l'accès à
deux commandes déclarées sous plafond de dépense.

### L'hypothèse de segment de confiance, reconfirmée mot pour mot

Ce déplacement du plafond n'est défendable que sous l'hypothèse déjà posée
par `ADR-0020` (note du 2026-09-15). Interrogé à nouveau avant de trancher
S3, l'utilisateur l'a confirmée dans les mêmes termes :

> « Il n'y a que moi sur le réseau. Le port n'est pas redirigé vers
> l'extérieur. Mon mot de passe wifi n'est pas partagé. On augmentera la
> sécurité plus tard. »

Exposition mesurée et présentée avant cette confirmation : `eth0
192.168.1.55/24`, écoute sur `0.0.0.0:8788`, `ThreadingHTTPServer`
**sans `wrap_socket`** — donc un jeton porteur statique transite **en
clair** à chaque requête, depuis toute machine du segment. **Cette
hypothèse est la condition d'existence de toute la surface décrite par cet
ADR.** Elle bascule le verdict en **NO GO global** si le segment cesse
d'être de confiance ou si le jeton est partagé — pas seulement celui de
S3. Durcissements différés et listés par le GATE, hors périmètre de ce
cycle : terminaison TLS locale, `var/` en `0600`, rétention des
conversations, `bug-010` (freinage global, lecture anonyme non bornée).

## Décision

### §1. `POST /api/spec/lancer` — lancer un cycle pour une spec désignée

Route distincte de `/api/lancer` (qui ne connaît qu'une **clé**) : celle-ci
accepte `{cle, spec_id}`. `spec_id` ne construit **jamais** un chemin —
`gestion_spec.eligible_au_lancement()` le résout par **égalité stricte**
contre les specs réellement découvertes par `specs.lister_depuis_config()`,
confiné deux fois (`vcs.chemin_sur()` puis égalité exacte du chemin
attendu). Seule la **première colonne** (position, jamais un nom codé en
dur — `ADR-0003`) est éligible ; `doing/`/`done/` reçoivent `409`.

`cle` reste choisie dans `[commandes]`, exactement le régime d'`ADR-0005` ;
`spec_id` y entre comme un **élément unique de l'`argv`**, par substitution
d'un placeholder **déclaré** — le littéral `"{spec_id}"`, présent exactement
une fois dans l'`argv` d'une commande pour qu'elle soit éligible à cette
route (`config.commande_pour_spec_id()`, `control-center/backend/config.py:257`).
Une commande sans cet emplacement, ou en portant plus d'un, rend `400` :
elle n'est simplement pas prévue pour être ciblée. **`ADR-0005` est amendé
sur ce point, pas révoqué** : la garantie centrale — l'interface choisit
une clé, jamais une ligne de commande — tient intacte ; seule la
composition de l'`argv` autour de cette clé gagne un second degré de
liberté, lui-même déclaré et fermé.

Toute la résolution (éligibilité, `argv`, budget transmissible, permissions
autorisées) précède **tout** appel à `Ecriture.lancer()`, donc tout
`Popen` — c'est le seul cas où le GATE exige explicitement zéro effet en
cas d'erreur.

### §2. `POST /api/spec/modifier` et `POST /api/spec/supprimer`

**Modifier** procède par **compare-and-write atomique** : le corps porte
`{spec_id, empreinte, contenu}`, où `empreinte` doit être le SHA-256 rendu
par le dernier `GET /api/spec?id=…` (ce `GET` gagne ce champ dans ce même
lot). Sous un verrou court, le fichier est relu, l'empreinte comparée, et
l'écriture n'a lieu **que** si elle concorde — sinon `409`, fichier
intact. L'écriture passe par un fichier temporaire du même répertoire puis
`os.replace()` : jamais de contenu partiel visible d'un lecteur concurrent.

**Supprimer** est **la seule route destructive** du cockpit, et la Règle
absolue n°4 (jamais de suppression sans plan de retour arrière écrit) s'y
applique au pied de la lettre :

- une confirmation **nommant exactement** la spec (`confirmation_nom`) est
  exigée avant tout effet ;
- **le plan de retour arrière défendable a dû être corrigé pendant le GATE
  P1, avant tout code** : `POST /api/spec/ecrire` (`ADR-0027`) ne commite
  **jamais**, donc toute spec créée depuis le cockpit reste **non suivie**
  par git tant qu'un commit humain ne l'a pas indexée. `git rm` y échoue
  (`rc 128`, mesuré) ; sur une spec suivie mais modifiée localement ou dans
  l'index, il échoue aussi (`rc 1`, mesuré). Un plan fondé sur `git rm` +
  une référence était donc **inapplicable** précisément sur les specs que
  le cockpit produit lui-même — et un repli sur `unlink()` aurait perdu le
  contenu sans retour possible, ce que la Règle absolue n°4 interdit.
  **Condition retenue** : `supprimer()` **refuse (409)** toute spec non
  suivie ou modifiée par git, en le disant, plutôt que de choisir entre un
  retour arrière impraticable et une perte silencieuse ;
- sur une spec suivie et propre, la réponse porte le plan de retour arrière
  **exécutable tel quel** (`git checkout <sha HEAD> -- <chemin>`) — ce
  serveur ne l'exécute **jamais** lui-même, c'est un plan écrit, pas un
  geste automatique de plus ;
- la seule colonne éligible à la suppression est la **première** ; la
  dernière (`done`) est immuable, toute colonne intermédiaire (`doing`) est
  modifiable mais jamais supprimable — même logique de position, pas de nom
  codé en dur, qu'`ADR-0003` impose déjà à la lecture ;
- fail-closed sur le rôle : `role != "premiere"` refuse, plutôt qu'une
  énumération des rôles interdits qui s'ouvrirait par un cas de plus.

**Deux défauts trouvés par le GATE P2, sur le diff réel du lot 9, et
corrigés avant merge** — les trois ont le même patron : *la garde est
juste, sa preuve porte du mauvais côté* :

1. **Une garde vivante seulement pour le dernier écrivain.**
   `lancement_courant()` ne rendait que le dernier lancement actif ; avec
   deux écrivains simultanés, modifier une spec pendant qu'un agent y
   travaille rendait `200`, fichier écrasé. Corrigé :
   `lancements_actifs()` — **tous** les lancements en cours, jamais un
   seul.
2. **Un oracle qui s'accorde avec lui-même.** Un test comparait deux champs
   de la **même** réponse ; un mutant altérant les deux à l'identique
   survivait. Corrigé : `racine_projet not in corps` vérifié sur **chaque**
   réponse (2xx comme 4xx), pas une comparaison interne.
3. **La garde de confinement n'avait jamais vu son cas réel.** Cherchée côté
   `spec_id` forgé — qui ne l'atteint jamais, la résolution par égalité
   stricte l'arrête avant. Le cas réel est **côté disque** : un lien
   symbolique planté dans `todo/`, listé comme une spec, dont
   `chemin_sur()` doit refuser la résolution hors colonne. Trois liens
   réels l'éprouvent désormais (hors `specs/`, vers `doing/`, hors dépôt) :
   `404` et cible intacte dans les trois cas.

**Piège trouvé en exécutant, sans rapport avec le GATE, consigné pour ne
pas être reperdu** : `git rm` supprime **en cascade** tout répertoire
parent devenu vide. Retirer la dernière spec d'un projet ferait disparaître
`todo/`, `features/` **et** `specs/` ; le retour arrière recrée le chemin,
mais entre les deux le cockpit lirait un dépôt sans arbre de specs. Aucun
test antérieur ne le voyait, chaque groupe de test gardant d'autres specs.

### §3. `GET`/`POST /api/conversation` — le canal S3, redessiné puis autorisé

Le premier passage GATE a refusé S3 telle que conçue. Renvoyée à
`architect` pour trois décisions (protocole d'entrée, canal de réponse,
sémantique du `202`), la conception redessinée est repassée en GATE et
obtenue **GO sous conditions**, treize conditions numérotées (`S3.1` à
`S3.13`) devenues autant d'assertions dans
`control-center/backend/test_server_conversation.py` et
`test_lanceur.py`. Parmi elles, celles qui déterminent la forme du
mécanisme :

- **Protocole d'entrée déclaré, jamais un champ de requête** (`S3.1`) :
  `entree` (`"aucune"` par défaut, ou `"json-lines"`) est un attribut de
  `[commandes.cle]` dans `control-center.toml` — un porteur du jeton ne
  peut donc jamais ouvrir un canal sur une commande qui ne le déclare pas
  dans la configuration.
- **Capacité du tube posée après coup, jamais devinée** (`S3.10`/`D3`) :
  `F_SETPIPE_SZ` est posé sur `stdin.fileno()` **après** `Popen`, mesuré à
  262 144 octets vus côté fils. Un `n != len(ligne)` sur l'écriture rend le
  canal **corrompu en permanence** — `503` sur tout envoi suivant, jamais
  une tentative de reprise sur un tube dans un état inconnu.
- **Enveloppe pire cas dérivée du sérialiseur réel, jamais recopiée**
  (`S3.11`) : 98 317 octets mesurés avec `ensure_ascii=True` — un écart de
  3,0× avait été observé selon ce seul drapeau lors du GATE, ce qui a
  disqualifié toute borne recopiée d'un rapport plutôt que recalculée.
- **`202` signifie « tube vidé, message écrit entier »**, jamais « traité »
  (`D3`) : le traitement effectif se constate ailleurs, sur `/api/lancement`
  rejoué avec `--replay-user-messages`.
- **Journalisation avant écriture, jamais l'inverse** (`S3.4`) : un message
  envoyé mais non journalisé serait perdu du fil persistant sans que
  l'agent ne l'ait pourtant jamais reçu autrement.
- **Bornes en trois temps, dans cet ordre exact** : forme du corps (`400`)
  → taille en **caractères** (`413`, avant toute écriture, journal compris)
  → caractères de contrôle interdits (`422`) → destinataire (`404` si
  aucun lancement `json-lines` actif) → journalisation (`500` si
  impossible) → écriture sur le canal (`503` si occupé/corrompu/
  indisponible) → `202`.
- **Liste fermée des drapeaux de contournement de permission** (`S3.13`,
  même garde que `/api/spec/lancer` §1) : le serveur ne touche jamais aux
  drapeaux, l'`argv` vient exclusivement de `[commandes]` ; une commande
  qui en porte un n'est lançable que si sa clé figure dans
  `[garde_fous].commandes_sans_permissions`, **vide par défaut** — sinon
  `503` avant tout `Popen`. Le choix reste entièrement à l'humain, dans sa
  configuration ; **rien dans ce cycle ne desserre quoi que ce soit** par
  défaut.

**Le substrat de stockage des messages** : un fichier `json-lines` par
lancement, `var/conversations/<pid>.jsonl` — sous `var/`, donc **non
versionné**, à la différence des specs elles-mêmes. `GET /api/conversation`
ne rend jamais que les messages **utilisateur** persistés sur ce fichier ;
les réponses de l'agent restent dans le tampon circulaire de
`/api/lancement`, jamais recopiées ici. Ce choix de substrat est justifié
au §4.

**Piège trouvé en exécutant, corrigeant une affirmation faite trop tôt en
GATE** : un durcissement de session (`claude --restricted`, `--bare`)
répond « Not logged in » avec `rc=0` et un JSON valide — le durcissement
retire les fichiers de réglages où vivent les identifiants. Un harnais qui
vérifie « le processus a répondu » serait vert à tort ; la garde exige un
message `assistant` à contenu non vide et l'absence du motif de connexion.
Vaut aussi pour toute future commande de cycle : un lancement « réussi »
sans agent connecté consommerait le verrou d'écrivain et journaliserait une
fin propre pour un cycle qui n'a rien fait.

### §4. `_ROUTES_ECRITURE` — `ADR-0019` amendé, pas révoqué

`_ROUTES_ECRITURE` passe de 4 à 8 entrées : `/api/lancer`,
`/api/interrompre`, `/api/spec/brouillon`, `/api/spec/ecrire` (héritées),
plus `/api/spec/lancer`, `/api/spec/modifier`, `/api/spec/supprimer`,
`/api/conversation` (ce cycle). **Aucun verbe `do_*` neuf** : le test
d'introspection d'`ADR-0019` — l'ensemble des `do_*` de `Handler` vaut
exactement `{"do_GET", "do_POST"}`, et l'ensemble des routes réellement
routées par `do_POST` vaut exactement `_ROUTES_ECRITURE` — continue de
s'appliquer sans modification de sa forme, seulement de sa liste. C'est
exactement le régime qu'`ADR-0019` avait conçu pour absorber une route
d'écriture future : la garantie structurelle ne change pas, la table
fermée s'allonge.

### §5. Ce que la ligne de statut d'`ADR-0020` précise, et pourquoi

`ADR-0020 §3` (« Ce qui reste, et ce qui tombe ») pose : « Les specs sont
partagées par git, les centres de contrôle ne le sont pas. Une discussion
rangée dans le stockage local d'un serveur serait différente chez chaque
développeur. Pour avoir un sens, elle doit vivre **dans le dépôt**. » Cette
phrase visait explicitement `feature-009` — la discussion **par spec**,
persistante, destinée à être relue par un autre développeur qui clone le
même dépôt.

**Le canal `S3` de ce cycle n'est pas cette discussion-là.** C'est un
échange **éphémère**, attaché au cycle de vie d'**un lancement** (un
fichier par `pid`, sous `var/`, jamais indexé par git), dont la fonction
est de piloter un agent en cours d'exécution sur **cette** machine, pas de
transmettre une décision à un autre développeur. Le stocker hors du dépôt
ne contredit donc pas `ADR-0020 §3` : la contrainte « vit dans git »
s'attache à ce qui doit être **partagé entre développeurs** ; un canal de
pilotage local, dont la portée s'éteint avec le lancement qu'il accompagne,
n'a jamais eu cette prétention.

**La ligne de statut d'`ADR-0020` précise donc ce point plutôt que de le
remplacer** : `feature-009` reste seule à devoir vivre dans git ; ce que
`S3` fait ici ne rouvre ni ne contredit cette exigence, il en délimite le
périmètre.

## Alternatives considérées

- **Refuser S3 définitivement.** Écartée par le GATE lui-même : `PUT` et
  `lancer` donnent déjà, à eux deux, la capacité d'instruire arbitrairement
  un agent avec un shell et l'identité git du développeur — refuser la
  conversation ne réduit le risque d'aucune classe.
- **`503` (« tube plein ») comme réponse à un `stdin` saturé.** Écartée
  par le GATE lui-même en re-passage : juste sur l'exigence, fausse sur le
  moyen — une écriture partielle produit une ligne JSON tronquée qui tue le
  lecteur (`rc=1`), la garde aurait fabriqué la panne qu'elle prétendait
  prévenir. Remplacée par la capacité posée après `Popen` (§3) et le canal
  qui se déclare corrompu plutôt que de tenter une reprise.
- **Reconstruire le contenu de retour arrière plutôt que refuser.**
  Écartée : un `unlink()` de repli perdrait le contenu sans retour possible,
  contre la Règle absolue n°4 ; le refus nommé (`409`) est la seule réponse
  qui ne perd rien.
- **Stocker la conversation dans le dépôt, comme les specs.** Écartée,
  voir §5 : la fonction de `S3` est le pilotage local d'un lancement en
  cours, pas une discussion destinée à être partagée entre développeurs.

## Conséquences

### Positives

- Les trois surfaces écrivent désormais sous des conditions **nommées et
  mutation-testées**, pas sous une conception refusée en l'état.
- Le plan de retour arrière de la suppression est vérifié **exécuté** (pas
  seulement rendu) dans `test_server_feature025.py` : l'`argv` rendu par la
  réponse JSON est lancé tel quel, le contenu comparé bit pour bit, `git
  status --porcelain` vide après coup.
- `_ROUTES_ECRITURE` reste une garantie mécanique (introspection), jamais
  une confiance déclarative.

### Négatives

- Le plafond de ce qu'un jeton achète est désormais large : des
  instructions arbitraires à un processus muni d'un shell et de l'identité
  git du développeur. Ce n'est défendable que sous l'hypothèse de segment
  de confiance du Contexte — une hypothèse **révisable**, pas une garantie
  du code.
- Le canal de conversation dépend d'un budget de tube posé après `Popen` ;
  un noyau ou un lecteur qui viderait `stdin` différemment rendrait le
  `503` de tube plein quasiment inatteignable en pratique (limite déclarée
  par le GATE lui-même — vrai côté noyau, pas nécessairement côté
  processus).

### Ce que ça verrouille

- Toute route d'écriture future doit d'abord entrer dans
  `_ROUTES_ECRITURE`, sous peine de faire échouer le test d'introspection
  — inchangé depuis `ADR-0019`.
- Toute commande future portant un drapeau de contournement de permission
  reste refusée par défaut (`503`) tant que sa clé n'est pas explicitement
  ajoutée à `[garde_fous].commandes_sans_permissions` par l'humain.
- Si le segment réseau cesse d'être de confiance, ou si le jeton est
  partagé, **la totalité des trois surfaces décrites ici bascule en NO GO
  global** — ce n'est pas une condition locale à une route.

## Ce que cet ADR ne ferme pas

- La terminaison TLS locale, la rétention des conversations et `var/` en
  permissions restreintes restent des durcissements différés, listés par le
  GATE, non traités par ce cycle.
- `bug-010` (freinage global des échecs d'authentification, lecture anonyme
  non bornée de `/api/flux`) reste ouvert, son périmètre inchangé par cet
  ADR.

## Références

- Code : `control-center/backend/server.py` (`_ROUTES_ECRITURE`,
  `_spec_lancer`, `_spec_modifier`, `_spec_supprimer`,
  `_conversation_envoyer`, `_conversation_lire`) ;
  `control-center/backend/gestion_spec.py` (résolution, compare-and-write,
  retour arrière) ; `control-center/backend/lanceur.py` (`entree`,
  `F_SETPIPE_SZ`, `envoyer()`) ; `control-center/backend/config.py`
  (`commande_pour_spec_id`, `entree`, `permissions_autorisees`) ;
  `control-center/backend/vcs.py` (confinement des chemins).
- Tests : `control-center/backend/test_server_feature025.py`,
  `test_gestion_spec.py`, `test_server_conversation.py`, `test_lanceur.py`.
- Specs : `specs/features/doing/feature-025-actions-du-backlog.md`,
  `specs/features/doing/feature-022-conversation-permanente-avec-claude.md`.
- ADR : [ADR-0005](0005-commandes-liste-fermee-par-cle.md) (amendé, §1
  ci-dessus) ; [ADR-0019](0019-jeton-comme-unique-barriere-et-table-des-routes-fermee.md)
  (amendé, §4 ci-dessus) ; [ADR-0020](0020-un-centre-de-controle-appartient-a-un-developpeur.md)
  (§3 précisé, pas remplacé — §5 ci-dessus) ; `ADR-0039` (réouverture de
  périmètre qui amène ces trois surfaces) ; `ADR-0041` (lecture des
  transcripts — modèle de menace **distinct**, ne pas fusionner).
