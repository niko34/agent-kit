## Métadonnées
- **ID** : feature-001
- **Slug** : observabilite-des-workflows
- **Type** : feature
- **Statut** : done
- **Priorité** : haute
- **Version cible** : 0.5.0 (portée par le commit `a84bc10`, cf. `CHANGELOG.md`)
- **Dernière mise à jour** : 2026-09-12
- **Spec(s) liée(s)** : feature-002 (tableau de bord, consommateur direct de ce journal)

> Spec rétroactive. Décrit ce qui a été livré par le commit `a84bc10`
> (« feat(control-center): le centre de contrôle rejoint le template, avec son
> instrumentation »), rédigée après coup à partir de ce commit, de
> `control-center/README.md` et des commentaires de code — pas d'un besoin
> exprimé à l'avance.

## Domaines touchés
- [ ] API REST (endpoints, contrats, codes d'erreur)
- [ ] Frontend (écrans, composants, appels API)
- [ ] BDD / migrations
- [ ] Auth / permissions
- [x] Données personnelles (collecte, traitement, effacement) — **passage par `security-reviewer` (rôle GATE)** : le collecteur reçoit la ligne de commande complète de chaque outil `Bash` exécuté par Claude Code, susceptible de porter un secret (mot de passe d'appareil, jeton) ; voir « Sécurité & données »
- [ ] Intégrations externes (API tierces, webhooks, e-mail…)
- [x] Tâches de fond (jobs, cron, files d'attente) — neuf hooks du runtime Claude Code, exécutés dans le chemin critique de chaque session

## Agents requis
- [x] spec-reader
- [x] architect
- [x] security-reviewer, rôle GATE — collecte de commandes shell susceptibles de porter un secret
- [ ] ux-ui-designer
- [x] backend-developer — scripts Python du collecteur et des lecteurs
- [ ] frontend-developer
- [x] test-engineer — validation par mutation obligatoire
- [x] code-reviewer — a trouvé la seconde fuite de secret et le défaut de bufferisation
- [x] doc-writer

## Description
Instrumentation du runtime Claude Code (neuf hooks) qui écrit un journal
d'événements en JSON Lines, et trois lecteurs qui le reconstituent en
workflows exploitables : la lecture des specs (`backend/specs.py`), de la
configuration (`backend/config.py`) et de l'état git (`backend/vcs.py`).
Construit et éprouvé dans `esp32-pool-controller`, puis porté dans le kit pour
que tout projet qui en descend soit observable sans configuration
supplémentaire au-delà du bloc de hooks à coller dans `.claude/settings.json`.

## Contexte
Avant ce travail, rien ne journalisait l'exécution réelle des agents : ni les
passages d'un agent à l'autre, ni les outils qu'ils appelaient, ni les échecs.
Le seul récit disponible était celui, théorique, décrit par `CLAUDE.md`. Le
projet d'origine avait mesuré l'écart entre ce récit et la réalité : sur un
relevé réel, 108 appels d'outils sur 110 n'apparaissaient dans aucune trace —
ils appartenaient à l'agent principal, jamais à un sous-agent, et rien ne les
enregistrait avant que ce défaut soit corrigé (voir plus bas).

## Comportement livré

### Le collecteur (`control-center/hooks/record-event.py`)
- Branché sur **neuf hooks** de `.claude/settings.json` : `SessionStart`,
  `SessionEnd`, `SubagentStart`, `SubagentStop`, `UserPromptSubmit`, `Stop`,
  `Notification`, `PostToolUseFailure`, `PostToolUse` (matcher
  `Bash|Edit|Write|NotebookEdit`).
- Un seul script, une ligne JSON par événement, ajoutée à
  `control-center/var/agent-events.jsonl`.
- **Sort toujours en code 0**, y compris sur exception : un hook qui sort en
  code 2 annule l'action observée côté Claude Code — un journal incomplet est
  préférable à une session cassée.
- Ne recopie jamais de contenu volumineux (`tool_result`, diff, sortie de
  test) : tout est référencé par chemin.
- Horodatage à la **milliseconde** (et non à la seconde) : plusieurs
  événements tombent couramment dans la même seconde, et c'est leur ordre qui
  distingue une boucle de correction d'un enchaînement normal.
- Écriture par un unique appel `os.write()` sur un descripteur ouvert en
  `O_APPEND | O_CREAT`, avec un plafond de ligne de 4096 octets : au-delà,
  l'événement est abandonné plutôt qu'écrit en plusieurs `write()`, ce qui
  romprait l'atomicité et pourrait entrelacer la ligne avec celle d'une autre
  session.

### La redaction des commandes shell
Seuls les **deux premiers jetons sûrs** d'une commande sont conservés (`pio
test -e native` → `pio test`), sous deux règles cumulatives :
- tout jeton contenant `=` ou `:` est **écarté**, jamais tronqué ;
- tout jeton de plus de 24 caractères est écarté ;
- le second jeton, en plus, doit avoir la forme d'une sous-commande en
  minuscules ou d'une option (`-e`, `--json`) — sans quoi `echo hunter2 | sudo
  -S reboot` aurait journalisé `echo hunter2`.

Le champ `description` d'un appel d'outil n'est **jamais** journalisé : c'est
un texte libre rédigé par le modèle, qui recopie volontiers ce que
l'utilisateur a collé (`« Deployer en OTA avec le mot de passe … »`).

### La lecture des specs, de la configuration et de git
- `backend/specs.py` ne fait que lire : la colonne d'une spec vient du
  **répertoire** qui la contient (`todo/doing/done`), jamais du champ
  « Statut », en texte libre et mesuré incohérent avec le répertoire dans 22
  cas sur 165 specs du projet d'origine.
- `backend/config.py` : `control-center.toml` démarre toujours (fichier
  absent, TOML cassé, section vide → défauts), n'écoute qu'en local par
  défaut, n'autorise aucune commande sans déclaration explicite.
- `backend/vcs.py` : lecture seule de git, aucun shell (`shell=False`,
  `argv` uniquement), confinement au dépôt.

### Pourquoi le graphe de workflow est plat
Les hooks `SubagentStart`/`SubagentStop` portent `agent_id`, `agent_type` et
`session_id`, mais **aucun identifiant de l'appel parent**. Ce serait
bloquant s'il y avait de l'imbrication — or aucun agent du dépôt ne porte
l'outil `Task` dans son frontmatter, donc aucun ne peut en invoquer un autre.
Un workflow est donc une session et une suite de sous-agents partageant un
`session_id` ; le reconstruire est un tri chronologique, pas une résolution
d'arbre (ADR-0002).

## Défauts réels trouvés pendant ce travail

1. **Fuite de mot de passe par DEUX chemins distincts.** Le premier défaut a
   été trouvé sur le **premier événement réel** produit par le collecteur,
   avant toute mise en service : une règle « garder les deux premiers
   jetons » aurait recopié tel quel `POOL_PASSWORD=secret ./ota_update.sh
   firmware` — un idiome documenté comme normal par `ota_update.sh`
   lui-même. Corrigé par le filtre `=`/`:`. Un **second chemin** a été trouvé
   ensuite, en revue : `curl -u admin:secret http://…` porte l'identifiant
   inline dans le **second** jeton, pas dans une affectation en tête — le même
   filtre `:` le couvre, mais seulement une fois généralisé aux deux
   positions.
2. **Un test passait pour la mauvaise raison.** Trouvé par mutation : retirer
   entièrement le filtre `=`/`:` ne tuait aucun test tant que le faux secret
   utilisé dans les cas de test dépassait 24 caractères — le plafond de
   longueur masquait la disparition du filtre. Un mot de passe **court**
   aurait fui sans qu'aucun test ne le voie. Le faux secret des tests est
   court depuis.
3. **`SubagentStop` ne porte pas le nom de l'agent, et arrive parfois sans
   `SubagentStart`.** Observé sur le terrain le 2026-09-12, non documenté par
   le runtime : chaque `Stop` de l'agent principal (fin de tour) est suivi
   environ deux secondes plus tard d'un `SubagentStop` portant un `agent_id`
   neuf et un `agent_type` **vide** — ce ne sont pas des sous-agents du
   workflow. Conséquence : l'appariement début/fin doit se faire **par
   `agent_id`**, jamais par nom ni par « le dernier ouvert », sous peine
   d'attribuer la fermeture d'un intrus au vrai passage en cours. Les
   fermetures non appariées sont comptées (`fermetures_orphelines`), jamais
   ignorées en silence.
4. **Le travail de l'agent principal était invisible.** Avant correction, les
   événements survenant hors d'un passage de sous-agent (`SubagentStart`/
   `SubagentStop`) n'étaient rattachés à personne : sur un relevé réel, 112
   appels d'outils de l'agent principal n'apparaissaient dans aucun segment.
   Un second défaut apparenté rattachait, à l'inverse, tout événement au seul
   passage « en cours » même quand aucun ne l'était : 33 appels d'outils ne
   rapportaient alors qu'un seul fichier. Les deux sont couverts par un
   segment explicite `"type": "principal"`, ouvert au premier événement hors
   passage et fermé au `SubagentStart` suivant.
5. **`_MAX_LIGNE` a failli être inatteignable par construction.** Huit champs
   repris à 512 octets chacun faisaient déjà 4096 octets à eux seuls avant
   même les clés JSON ; le plafond a été resserré à 256 octets par champ.
   Trouvé par mutation : retirer le plafond de ligne ne tuait aucun test, ce
   qui a révélé qu'il n'était atteignable que par accident.
6. **Un commentaire invoquait `PIPE_BUF`, à tort.** `PIPE_BUF` régit les
   tubes, pas les fichiers. Ce qui protège réellement l'atomicité de
   l'écriture est le couple « décalage + écriture » d'`O_APPEND`, valable pour
   **un seul** appel `write()` — or `open(...,"a")` de Python est tamponné, et
   une ligne de plus de 8192 octets partait en plusieurs `write()`. Relevé en
   revue de code, pas par un test (un test ne peut pas observer un
   entrelacement de descripteurs).
7. **Régression de portabilité trouvée par le portage lui-même.** Un test de
   `backend/specs.py` affirmait `len(specs) > 0` — une assertion sur le
   *projet* (`esp32-pool-controller` avait des specs), pas sur le code. Les
   répertoires du kit sont vides par nature, et le test échouait sans que rien
   ne soit cassé. Pire : deux cas suivants étaient sautés **en silence**, et
   le total passait de 30 à 28 sans avertissement. Corrigé en déclarant ces cas
   explicitement sautés, avec un compte qui reste stable.

## Comportement actuel (avant ce travail)
Rien n'existait : aucun hook, aucun journal, aucune lecture programmatique
des specs, de la configuration ou de git. Le seul état observable était le
répertoire des specs lui-même et l'historique git, à lire à la main.

## Contraintes techniques
- Bibliothèque standard Python uniquement, aucune dépendance à installer dans
  un projet instancié (ADR-0006).
- Le collecteur ne doit jamais faire échouer une session ni recopier de
  contenu volumineux ou de secret.
- Aucun nom d'agent, chemin de spec ou commande de test en dur dans le
  collecteur : il doit survivre au déménagement vers un projet où les agents
  portent d'autres noms.
- Portable bash 3.2 (macOS) pour les scripts shell associés — pas de
  `declare -A` ni `mapfile`.

## Fichiers concernés
- `control-center/hooks/record-event.py` — le collecteur
- `control-center/hooks/test_record_event.py` — 19 cas
- `control-center/backend/events.py` — reconstruction des workflows depuis le journal
- `control-center/backend/test_events.py` — cas de test de la reconstruction
- `control-center/backend/specs.py` — lecture des specs (colonne = répertoire)
- `control-center/backend/test_specs.py` — 16 cas
- `control-center/backend/config.py` — lecture de `control-center.toml`
- `control-center/backend/test_config.py` — 17 cas
- `control-center/backend/vcs.py` — lecture de git
- `control-center/backend/test_vcs.py` — 26 cas
- `control-center/backend/agents.py` — découverte des agents installés
- `control-center/backend/test_agents.py`
- `.claude/settings.json` — les neuf hooks branchés sur le collecteur
- `control-center/control-center.example.toml` — modèle de configuration

## Livrables — check-list
- [x] A1 — Collecteur d'événements, neuf hooks, sortie toujours en code 0
- [x] A2 — Redaction des commandes shell (deux gardes cumulatives)
- [x] A3 — Reconstruction des workflows par tri chronologique, graphe plat
- [x] A4 — Segment explicite pour l'agent principal (hors passages de sous-agent)
- [x] A5 — Lecture des specs : colonne = répertoire, statut affiché tel quel
- [x] A6 — Lecture de la configuration : défauts sûrs (local seul, aucune commande)
- [x] A7 — Lecture de git en lecture seule, confinement au dépôt
- [x] D1 — 163 cas de test au moment de la livraison, tous validés par mutation

## Sécurité & données
- Authentification touchée : non
- Permissions / rôles touchés : non
- Données personnelles collectées ou traitées : **oui** — la ligne de
  commande de chaque appel `Bash` peut porter un secret (mot de passe
  d'appareil, identifiant inline). Finalité : identifier l'action pour la
  reconstruction du workflow, jamais la rejouer. Traitée par redaction
  systématique (deux premiers jetons sûrs, filtre `=`/`:`, plafond de
  longueur, refus du champ `description` en texte libre).
- Migration destructive : non applicable
- Nouvelle exposition publique : non — le journal (`var/agent-events.jsonl`)
  n'est lu par aucun serveur à ce stade (voir feature-002)
- Risque identifié : fuite de secret par un jeton non couvert par les
  gardes — mitigé mais non prouvé exhaustif ; voir défauts 1 et 2 ci-dessus

## ADR produits
- **ADR-0002** (`docs/adr/0002-graphe-execution-plat.md`) — le graphe
  d'exécution reste plat tant qu'aucun agent ne porte l'outil `Task`
- **ADR-0003** (`docs/adr/0003-colonne-spec-depuis-repertoire.md`) — la
  colonne d'une spec vient du répertoire, jamais du champ « Statut »
- **ADR-0006** (`docs/adr/0006-centre-controle-zero-dependance.md`) — zéro
  dépendance d'exécution (partagé avec feature-002)

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- Aucun (pas de serveur HTTP dans ce lot — voir feature-002)

### Écrans / flux UI concernés
- Aucun

### Documentation produite / mise à jour
- `control-center/README.md` — sections « Étape A » (collecteur) et
  « Étape B » (specs, configuration, git), format d'un événement, décompte des
  cas de test et des mutants tués
- `CHANGELOG.md` — non applicable à ce lot précis (l'entrée `[0.5.0]` du
  dépôt documente la fusion de sécurité, pas ce commit ; `a84bc10` n'a pas
  d'entrée CHANGELOG dédiée — écart constaté, non corrigé ici pour ne pas
  réécrire un historique clos)

## Critères d'acceptation
- [x] Le collecteur ne recopie jamais un secret par les deux chemins connus
      (affectation en tête, identifiant inline)
- [x] `SubagentStop` sans `SubagentStart` correspondant est compté, jamais
      confondu avec un passage réel
- [x] Le travail de l'agent principal apparaît dans le récit reconstruit
- [x] Suite de tests complète verte (163 cas au moment de la livraison), zéro régression
- [x] Chaque défaut de redaction corrigé est tué par mutation, pas seulement par un test qui passe
- [ ] Comportement nominal testé manuellement selon un plan formel — non
      formalisé : la validation s'est faite par relevé d'événements réels en
      conditions d'usage (cf. défauts 1 et 3 ci-dessus), pas par un plan écrit
      à l'avance

## Validation effectuée (à la place du plan de test manuel)
1. Premier événement réel produit par le collecteur, avant mise en service :
   a révélé la fuite par affectation en tête.
2. Mutation du filtre `=`/`:` sur les cas de test existants : a révélé que le
   plafond de longueur masquait sa disparition.
3. Relevé du journal en conditions réelles le 2026-09-12 : a révélé le
   comportement `SubagentStop` sans nom et sans `SubagentStart`.
4. Relevé d'un workflow réel comptant les appels d'outils par segment : a
   révélé les 112 appels de l'agent principal invisibles, puis les 33 appels
   mal attribués une fois le segment principal introduit sans garde d'exclusivité.

## Notes pour agent
- Le journal (`var/`) n'est pas versionné : c'est une trace, pas une source
  de vérité. Les specs et git font foi.
- Un mutant du collecteur est **équivalent** et documenté comme tel : rendre
  une chaîne vide plutôt que `None` quand aucun jeton n'est sûr ne change rien
  pour l'appelant, qui teste la valeur pour sa vérité — ne pas le compter
  comme un trou de couverture.
- Le référentiel attribuait l'absence d'imbrication à une « limitation
  runtime » ; ce n'est pas exact — la cause réelle est l'absence de l'outil
  `Task` dans le frontmatter des agents de ce dépôt, une décision de
  configuration et non une limite technique (la profondeur d'imbrication par
  défaut est de trois niveaux). La formulation fausse a été retirée de
  `CLAUDE.md`, puis de `GUIDE.md` et `control-center/README.md` le
  2026-09-12 ; ADR-0002 fait foi.

## Hors périmètre
- Le tableau de bord qui consomme ce journal (étape C) — voir feature-002
- Le lancement de workflows depuis l'interface (étape D, non livrée)
- La création de spec depuis un prompt (étape E, non livrée)
- La discussion par spec (étape F, non livrée)
- Le scénario de bout en bout avec échec réel (étape G, non livrée)
