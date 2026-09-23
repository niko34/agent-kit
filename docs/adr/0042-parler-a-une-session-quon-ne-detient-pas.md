# ADR-0042 — Parler à une session qu'on ne détient pas, en tapant dans son pty

## Statut

Accepté

## Date

2026-09-23

## Contexte

Le panneau de conversation du centre de contrôle affichait « Hors ligne » en
permanence : il attendait un lancement du cockpit déclarant
`entree = "json-lines"` (`ADR-0040`, canal de `feature-022`), et aucune
commande réelle du projet ne déclare cette entrée — seules `demo` et `lent`,
deux commandes d'exemple, sont configurées.

L'humain a tranché autrement, mot pour mot :

> « La conversation Claude doit se comporter comme notre conversation,
> connecté à la session remote. »

La session visée **existe déjà** : PID mesuré, `claude --remote-control
kit-lxc --resume <id>`, fille d'un serveur tmux dédié
(`claude-remote-kit.service`, `Restart=on-failure`, `ADR-0036`), déjà
authentifiée, déjà pilotée depuis un autre terminal (téléphone, `tmux
attach`). Ce n'est pas une variante du canal existant, c'est une **autre
porte** : parler à un processus **qu'on ne détient pas**, plutôt qu'ouvrir un
processus **qu'on détient**.

### Le fait qui décide de tout le reste

Mesuré le 2026-09-22, `ls -l /proc/<pid>/fd/0` : le `stdin` de la session
visée est **`/dev/pts/5`, un pseudo-terminal détenu par tmux** — pas un tube
que le serveur du cockpit tient lui-même.

## Pourquoi le canal de `feature-022` ne peut pas servir ici

`feature-022` écrit une ligne JSON sur le `stdin` d'un `Popen` que le serveur
détient (`os.write(fd)`, après vérification que le tube est vide). Ce
mécanisme est correct, gardé, testé — et **structurellement inapplicable**
sur la session remote : aucun descripteur du serveur ne pointe sur son
`stdin`, qui est un pty détenu par un autre processus (tmux). Il n'existe
aucune version durcie du canal `json-lines` qui atteindrait cette session :
la nature du descripteur, pas la rigueur de l'implémentation, ferme cette
porte.

**`feature-022` n'est pas remplacée.** Elle reste la bonne porte pour une
commande **lancée par le cockpit** qui accepte `--input-format
stream-json`. Les deux canaux coexistent, gardés séparément, et ne
partagent qu'une fonction de validation de texte non durcie pour l'un au
profit de l'autre (voir §3).

## Décision

### 1. La session se déclare en configuration, jamais par requête

`[session]` (`socket_tmux`, `nom`, `repertoire_transcripts`) est lue depuis
`control-center.toml` (`config.session_config()`), jamais depuis un champ de
requête : si le porteur du jeton pouvait le choisir, il choisirait dans quel
terminal il tape. Absente ou incomplète (l'un des trois réglages manque),
`session_config()` rend `None` et `/api/conversation` retombe **sans
changement** sur le canal `feature-022`.

### 2. Un seul module lance `tmux`, et il garantit six propriétés par construction

`control-center/backend/session_tmux.py` : argv en **liste**, jamais
`shell=True` ; `-S <socket>` **toujours explicite**, jamais dérivé de
l'environnement hérité (`TMUX`, `TMUX_TMPDIR`, `TMUX_PANE` — le couplage
accidentel mesuré sur le serveur en cours, qui ne trouvait le socket que
parce qu'il avait hérité ces variables de la session qui l'a lancé) ;
timeout sur chaque appel ; `stderr` de `tmux` jamais renvoyé à l'appelant ;
ciblage **exact** (`=<nom>:`, jamais `<nom>` nu — `-t <nom>` résout par
préfixe, mesuré, et ferait mentir le `destinataire` affiché) ; `session_id`
confiné à `[0-9a-fA-F-]{1,64}` sur ses deux voies de résolution avant tout
`os.path.join`.

### 3. Lire : le transcript, filtré positivement, jamais entier

`control-center/backend/fil.py` lit le transcript **principal** de la
session (`<session-id>.jsonl`), jamais les transcripts de sous-agent
(`transcripts.py`, `ADR-0041`, dont le module et la racine de lecture
restent inchangés). `interpreter_ligne()` ne rend un message que si `type`
∈ {`user`, `assistant`} **et** `isMeta` n'est pas vrai **et** `promptSource`
n'est pas `"system"` **et** le contenu porte du texte (`str` direct ou bloc
`text`) — un filtre **positif**, jamais une liste négative de types à
exclure : mesuré, un enregistrement `type: user, isMeta: true` porte le
rapport d'un sous-agent (jusqu'à 35 548 caractères), et l'aurait rendu
comme un message humain sans la clause `isMeta`.

`lire_fil()` ne lit jamais le fichier entier (queue bornée en octets, ligne
bornée en taille, messages bornés en nombre et en caractères), et mémoïse
**une seule entrée par chemin** — jamais par tuple `(chemin, mtime,
taille)`, qui accumulerait sans jamais s'invalider sur un transcript actif
(voir §5).

### 4. Écrire : `load-buffer`/`paste-buffer -p`/`Enter`, jamais `send-keys -l <texte>`

Le texte transite par **stdin** (`load-buffer -b <tampon> -`), jamais par
l'argv de `send-keys -l` — un argv est lisible dans `ps` par tout le monde
sur la machine. `paste-buffer -p` colle en un bloc non soumis (mesuré :
sans `-p`, les retours à la ligne internes sont soumis un par un). Un
verrou par nom de session (`threading.Lock`) est tenu de la capture d'écran
jusqu'au retour de l'envoi — le contrôle et l'écriture ne se séparent
jamais.

### 5. Ce qui a changé de sens en cours de GATE : « occupée » n'est pas un refus

La première heuristique (`ecran_semble_au_prompt`) refusait tout envoi
pendant que la session semblait travailler. Mesuré sur une session jetable
réelle, **en train de travailler** (spinner et motif d'occupation
confirmés à l'écran) : un texte tapé par ce chemin mécanique est **accepté
et mis en file** par `claude` lui-même (`promptSource: "queued"` sur le
transcript, contre `"typed"` pour le même chemin hors occupation), traité
dans l'ordre une fois la tâche en cours terminée. Rien n'est perdu, rien
n'est corrompu.

L'heuristique ne teste donc plus l'occupation : elle refuse seulement quand
**aucun compositeur n'est identifiable** (dialogue de permission, écran de
confiance, liste de tâches — un collage y est silencieusement ignoré, mais
l'`Enter` séparé qui suivrait ne le serait pas, d'où un refus **en amont**
du collage) ou quand **un brouillon est déjà présent** (mesuré : un collage
par-dessus se concatène à l'octet près, sans séparateur, corrompant les
deux messages). L'occupation reste **affichée** (`ecran_indique_occupation`,
purement informationnelle) mais ne gouverne plus le `409`.

Deux reboucles de mesure ont précédé cette version : la première heuristique
ancrait sur une bordure verticale que `claude` 2.1.278 ne dessine jamais
(§ voir `PIEGES §63`, « un témoin fabriqué n'est pas une capture ») ; la
deuxième confondait occupation et clavier indisponible.

### 6. Le point de non-retour est `Enter`, pas le collage

Un second `capture-pane` a lieu après le collage et avant `Enter` — il
vérifie que le compositeur est **toujours identifiable** (pas qu'il est
vide : il porte désormais le texte collé). Si un dialogue s'est interposé
entre-temps, `Enter` n'est **pas** envoyé, le texte reste visible dans le
composeur, et `delete-buffer` est appelé dans tous les cas (`finally`).

### 7. `ADR-0042` amende `ADR-0041`, il ne le préserve pas

« Compteurs seulement » (`ADR-0041`) était présenté comme un invariant du
centre de contrôle tout entier. Il devient une propriété de
`transcripts.py` **seul**. `fil.py` est, avec `transcripts.py`, l'un des
**deux** modules du centre de contrôle autorisés à faire sortir du texte
brut d'un fichier de transcript — sous les conditions transposées du modèle
de menace d'`ADR-0041` (racine confinée, filtre positif, absence propre
plutôt qu'un zéro, budget par instantané) plutôt que sous ses conclusions
littérales.

## Conditions du GATE, et ce qu'elles ont changé au design

Rôle GATE, P1 : **GO sous 9 conditions**. Deux d'entre elles sont des
trouvailles qui ont changé la conception, pas de simples réserves :

- **Condition 1** — `type: user` ne veut pas dire « écrit par l'humain » :
  voir §3 (`isMeta`).
- **Condition 3** — `stderr` de `tmux` n'est jamais renvoyé au client.
- **Condition 4** — traçabilité : le champ `promptSource` (`"queued"` /
  `"typed"`) est exposé **brut**, sans être interprété comme preuve
  d'origine — l'hypothèse « une frappe cockpit produit `typed` » n'était
  pas mesurable sans écrire dans la session réelle, et n'a pas été présentée
  comme un fait tant qu'elle ne l'a pas été (elle l'a été ensuite, en
  service : voir `specs/features/doing/feature-026-…md`, journal du
  2026-09-23 10:40).
- **Condition 5** — le point de non-retour est `Enter` (§6).
- **Condition 6** — le mot « heuristique », jamais « garde », pour
  `ecran_semble_au_prompt` : dans la spec, les noms de tests, `docs/API.md`
  (relayé par `control-center/README.md`) et le libellé du `202`/`409`.
- **Condition 9** — `ADR-0042` amende `ADR-0041` (§7).

Rôle GATE, P2 (sur le diff réel) : **GO sous 4 conditions**, dont la
première est le défaut de fond du §5 (l'heuristique de P1 était
inatteignable sur sa cible réelle) et la troisième un défaut de confinement
(`session_id` sans motif ni borne dans un `os.path.join`) — les deux corrigés
avant merge, voir Références.

## Ce que journalise le cockpit — la traçabilité déplacée, pas l'interdiction

Le jeton du centre de contrôle achetait jusqu'ici « lancer une commande
**déclarée** » (liste fermée, `ADR-0005`). Il achète désormais, sur cette
surface, « **taper une instruction arbitraire** dans une session qui a un
shell, l'identité git du développeur et le mode `auto` actif ». Décision
humaine du 2026-09-22, tenue pour prémisse du GATE plutôt que rouverte par
lui :

> « Le centre de contrôle est conçu pour fonctionner sur l'environnement du
> développeur. Il a déjà les droits sur cet environnement. »

La liste fermée des commandes n'a jamais été une frontière de privilège —
une frontière d'ergonomie et de traçabilité. C'est donc là que porte la
garantie : chaque message tapé par le cockpit est **journalisé avant
l'envoi**, avec son `destinataire` explicite (deux interlocuteurs possibles
— la session tmux ou, sur l'ancien canal, un lancement du cockpit — et le
transcript seul ne permet pas de distinguer un message tapé par le cockpit
d'un message venu du téléphone). Même déplacement que celui déjà fait par
`ADR-0020` : la garde utile n'est pas l'interdiction, c'est le journal.

## Alternatives considérées

- **Ouvrir un second processus `claude` sous OAuth**, avec son
  authentification propre affichée à l'écran (version initiale de la spec,
  écartée par la décision humaine du 2026-09-22). Ses mesures restent
  vraies et non refaites (voir la spec, section « Écarté par la
  réécriture ») : elle redeviendra la bonne porte le jour où un **second
  compte** sera nécessaire — pas avant.
- **Fusionner les deux canaux de conversation** (`feature-022` et
  `feature-026`) en un seul mécanisme. Écartée : ils n'ont ni le même
  destinataire (un `Popen` détenu contre un pty étranger), ni le même
  modèle de menace (protocole structuré contre frappe dans un terminal
  interactif) — les fusionner masquerait la nature radicalement différente
  de leurs garanties.
- **Durcir `server._texte_conversation_valide`** pour refuser DEL et les
  caractères C1, au lieu d'une fonction dédiée. Écartée : cette fonction est
  figée par les tests de `feature-022`, où DEL/C1 sont inoffensifs pour un
  canal `json-lines` — les refuser en plus aurait changé un contrat déjà
  gardé pour un canal qui n'en a pas besoin. `session_tmux.texte_valide_pty`
  est une fonction neuve, appelée en **plus** de la première sur le seul
  chemin tmux.
- **Ancrer l'heuristique de « prompt prêt » sur l'occupation affichée**
  (première version). Écartée par la mesure du §5 : elle refusait un envoi
  parfaitement accepté par `claude`, fermant le chemin d'écriture en
  permanence sur la session réelle.

## Conséquences

### Positives

- Le panneau de conversation reflète la session que l'humain pilote
  réellement, sans lancer de second processus ni dupliquer l'authentification.
- La mise en file par `claude` lui-même rend le chemin d'écriture utilisable
  y compris pendant que l'agent travaille — ce que la première heuristique
  interdisait par erreur.
- La traçabilité (journal avant envoi, `destinataire` explicite,
  `promptSource` brut) répond à la question déplacée du GATE sans avoir
  besoin d'une frontière de privilège nouvelle.

### Négatives

- **Aucun protocole, aucun accusé de traitement.** `202` signifie « tapé »,
  jamais « traité » : rien ne confirme que le texte a été lu par l'agent
  au-delà de son apparition dans le transcript au tour suivant.
- **L'heuristique de prompt reste une heuristique**, pas une garantie : la
  fenêtre entre `capture-pane` et `send-keys`/`Enter` ne se ferme jamais
  complètement, seulement le second `capture-pane` (§6) en réduit la
  moitié.
- **`/` et `!` en tête de ligne restent refusés** (`422`) : ce n'est pas un
  détail temporaire, c'est l'irréversibilité de commandes comme `/exit`,
  `/logout`, `/clear` depuis un canal qui ne sait pas reprendre une session
  arrêtée (`/resume` indisponible en Remote Control, `ADR-0036`). Lever ce
  refus exige une liste positive de commandes slash mesurées à la
  soumission — hors de ce cycle.
- **« Demander l'arrêt » depuis la conversation n'est pas une interruption**
  d'un cycle lancé par le cockpit : ce sont deux processus distincts, et le
  texte tapé dans le pty est mis en file, jamais traité comme une
  interruption immédiate (Échap) — ce que `texte_valide_pty` refuse
  justement de laisser passer. Documenté au conditionnel, jamais comme un
  bouton d'arrêt (`feature-028`, condition C4 du GATE).

### Ce que ça verrouille

- Le centre de contrôle devient dépendant de **tmux** (présence du binaire,
  format de ses sous-commandes) et du **format de transcript** de `claude`
  pour cette surface — un changement de l'un ou l'autre casse le module
  silencieusement tant qu'aucun test ne le détecte, précisément le risque
  que `PIEGES §63` a rendu concret une première fois.
- Toute évolution qui ferait sortir davantage que les messages `user`/
  `assistant` filtrés (par exemple le raisonnement interne, les appels
  d'outils) doit revenir devant le GATE : le filtre positif est une clôture
  délibérée, pas une limitation provisoire à desserrer localement — même
  posture que `ADR-0041`.
- Une seconde session, sous un second compte, redemandera le volet OAuth
  écarté ici (voir la spec) — ce n'est pas une extension de ce module, c'est
  une porte différente.

## Références

- Code : `control-center/backend/session_tmux.py` (module entier,
  docstring détaillant le contrat) ; `control-center/backend/fil.py`
  (`interpreter_ligne`, `lire_fil`) ; `control-center/backend/config.py`
  (`session_socket_tmux`, `session_nom`, `session_repertoire_transcripts`,
  `session_config`) ; `control-center/backend/server.py`
  (`_conversation_envoyer`, `_conversation_lire`) ; `control-center.example.toml`
  (`[session]`, commentée et vide par défaut).
- Tests : `control-center/backend/test_session_tmux.py`,
  `control-center/backend/test_fil.py`,
  `control-center/backend/test_server_feature026.py`,
  `control-center/web/test_app_conversation_feature026.py`/`.js`.
- Specs : `specs/features/doing/feature-026-session-claude-persistante-du-cockpit.md`
  (journal de bord complet : mesures du lot 0, sept points tranchés par
  l'architecte, GATE P1 neuf conditions, GATE P2 quatre conditions, défaut
  trouvé en service le 2026-09-23 10:40).
- `control-center/PIEGES.md` §63 (témoin fabriqué), §64 (une mesure, deux
  questions), §68 (bornes redondantes).
- ADR : [ADR-0041](0041-lecture-hors-racine-compteurs-seulement.md) —
  amendé par celui-ci (§7) ; [ADR-0040](0040-les-chemins-decriture-du-cockpit.md)
  — modèle de menace du canal `feature-022`, non remplacé ; [ADR-0036](0036-une-session-distante-se-releve-seule-plafonnee-au-pic-mesure.md)
  — la session remote elle-même, son unité systemd et pourquoi `/resume`
  n'est disponible qu'au démarrage du service ; [ADR-0005](0005-commandes-liste-fermee-par-cle.md)
  — la liste fermée de commandes que cette surface ne remplace pas.
