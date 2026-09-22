# ADR-0041 — Lecture hors racine : compteurs seulement

## Statut

Accepté

## Date

2026-09-22

## Contexte

La réouverture de périmètre du 2026-09-22 (`ADR-0039`) confirme une
décision antérieure du 2026-09-20 : le centre du disque affiche la somme
`input_tokens + output_tokens` de chaque passage d'agent (`ADR-0038 §5`).
Cette donnée n'existe nulle part dans ce que le serveur écrit lui-même —
elle vit dans les transcripts de conversation que `claude` écrit sous
`~/.claude/projects/<projet encodé>/<session>/subagents/agent-<id>.jsonl`,
**hors de la racine du dépôt**, hors de tout ce que ce serveur a jamais eu
besoin de lire jusqu'ici.

**Ce modèle de menace est distinct de celui d'`ADR-0040`, et les deux ne se
fusionnent pas.** `ADR-0040` porte sur des routes qui **écrivent** —
lancent un processus, modifient ou suppriment un fichier du dépôt,
transmettent du texte à un agent. Le mécanisme décrit ici ne fait jamais
rien de tout cela : c'est une **lecture seule**, mais d'une catégorie de
fichiers que rien, avant ce cycle, ne demandait au serveur d'ouvrir — des
transcripts de conversation complets, qui peuvent contenir le texte échangé
avec l'agent, potentiellement des secrets recopiés dans un message ou une
sortie d'outil. Le risque n'est pas « un jeton achète des instructions
arbitraires » (`ADR-0040`), c'est « une route de lecture peut faire sortir
du texte qu'elle ne devrait jamais transporter ».

`security-reviewer`, rôle GATE, a rendu **GO sous 7 conditions** (`S5.1` à
`S5.7`) sur cette surface. Le nombre de conditions relevées par le GATE
lui-même a été révisé une fois pendant le processus : sa première lecture
comptait deux clés non entières dans `usage` ; la mesure sur un transcript
réel en a trouvé **sept** — `cache_creation`, `inference_geo`, `iterations`,
`output_tokens_details`, `server_tool_use`, `service_tier`, `speed`.
« Recopier `usage` » aurait fait sortir du texte.

## Décision

### Finalité — ce que ce module a le droit de calculer, et rien d'autre

`control-center/backend/transcripts.py` lit des fichiers hors racine pour
en extraire **deux compteurs entiers par `agent_id`** — `input_tokens` et
`output_tokens` — et rien d'autre. Il n'existe **aucun** chemin de ce
module vers un message, un extrait de texte, un nom de fichier lu par
l'agent, ou une des sept clés non entières listées ci-dessus.

### §S5.1 — Racine confinée au projet courant

La racine de lecture se calcule **depuis l'environnement et la
configuration seulement** (`transcripts.racine()`), **jamais** depuis une
donnée de requête : `$CLAUDE_CONFIG_DIR` (ou `~/.claude` par défaut) suivi
de `/projects/<racine du projet, `/` → `-`>` — `~/.claude/projects/-root-
agent-kit` pour ce dépôt, **jamais** `~/.claude/projects/` tout entier
(mesuré : 271 fichiers pour ce seul projet, contre 488 sous le répertoire
parent). Une surcharge de projet (`[transcripts].racine`) est acceptée
**uniquement** si elle est un chemin **absolu** — une valeur relative
retombe sur le calcul par défaut plutôt que d'être à moitié acceptée.

### §S5.2 — Un seul nom de fichier possible

Un `agent_id` doit matcher `^[0-9a-f]{1,32}$` **avant** d'entrer dans un
chemin ; le chemin résultant repasse par `vcs.chemin_sur()` — la même garde
que le confinement git de `ADR-0040`. Un `agent_id` forgé (`../../x`) ne
matche jamais le motif hexadécimal et n'ouvre donc rien hors de la racine
calculée.

**Piège trouvé en exécutant, consigné dans `PIEGES §59`** : un préfixe
placé devant un identifiant annule le témoin de traversée classique.
`agent-../../etc/passwd.jsonl` reste confiné, parce que le fragment
`agent-..` n'est **littéralement** pas deux points — seul un séparateur
intercalé entre le préfixe et `..` réintroduirait un composant de remontée
pur. Un test de confinement bâti sur le témoin habituel (chercher `..`
comme sous-chaîne du nom final) reste donc vert **même quand la garde
entière est retirée** : ce module teste le confinement sur le chemin
**résolu par `os.path`**, jamais sur une inspection textuelle du nom
assemblé.

### §S5.3 — Filtre positif, typé

`usage` porte des chaînes et des dicts imbriqués. **Seules** `input_tokens`
et `output_tokens` sortent, et seulement si leur valeur est un `int` — pas
un `bool`, sous-type d'`int` en Python, explicitement exclu par
`isinstance(valeur, int) and not isinstance(valeur, bool)`. Un test vérifie
**récursivement** qu'aucune valeur de type chaîne ne sort du module, avec
un témoin planté à la fois dans un message et dans `usage.service_tier`.

### §S5.4/§S5.7 — Absence propre, jamais un zéro

Un `agent_id` sans transcript lisible (introuvable, hors racine, permission
refusée — le serveur peut tourner en root et lire un fichier `0600`) est
**absent** de `par_agent`. Ce n'est **jamais**
`{"input_tokens": 0, "output_tokens": 0}` : un zéro affiché se lirait comme
« ce passage n'a rien consommé », une affirmation fausse sur un passage
dont on ne sait simplement rien. Cette règle — jamais un zéro là où on ne
sait pas — est appliquée pour la **troisième fois** dans ce cycle, après
l'anneau d'activité (`ADR-0031 §5`) et la barre de progression du backlog
(`ADR-0039 §5`).

### §S5.5 — Lecture seule, vérifiée par introspection

Aucune écriture, aucune suppression, aucun renommage : vérifié par
introspection AST du module dans `test_transcripts.py`, pas seulement
affirmé en commentaire. Aucun sous-processus non plus : la racine se
calcule depuis l'environnement et une règle d'encodage, jamais en
interrogeant le binaire `claude`.

**Alternative écartée, et pourquoi** : `claude auth status` rend un JSON
portant `projectsDirectory`, qui suit `CLAUDE_CONFIG_DIR` — une source
possible pour §S5.1. Écartée pour quatre raisons : (1) la règle d'encodage
satisfait déjà la condition du GATE au mot près, sans dérivation
supplémentaire ; (2) `feature-026` (todo, non implémentée), qui a mesuré ce
comportement, n'est pas construite — coupler ce module, déjà sous
conditions GATE, à un mécanisme futur non stabilisé (multi-compte,
`CLAUDE_CONFIG_DIR` par service) l'exposerait à une sémantique qui peut
changer sans qu'il le sache ; (3) un sous-processus est une classe de
risque que ce lot n'a pas besoin d'ouvrir, alors que le GATE relève déjà
ailleurs (`ADR-0040`) qu'un `Popen` mal gardé élève le plafond de ce qu'un
jeton achète ; (4) le budget par instantané (§S5.6) est plus dur à borner
et à tester sur un sous-processus (latence, échec, blocage) que sur un
`os.environ.get` pur.

### §S5.6 — Budget par instantané, temps et octets

`/api/etat` est rappelé à **chaque** signal SSE. Sans plafond, il relirait
jusqu'à 270 Mo de transcripts par appel — un déni de service
auto-infligé. Deux budgets bornent chaque lecture (`[transcripts]` dans
`control-center.toml`, défauts `budget_secondes = 1.0`,
`budget_octets = 20_000_000`) :

- un budget de **temps**, vérifié entre chaque `agent_id` traité ;
- un budget d'**octets**, cumulé sur l'ensemble des fichiers lus dans un
  même appel, et à l'intérieur d'un même fichier (chaque ligne lue par
  `readline` bornée en taille — `_TAILLE_LIGNE_MAX`, 2 000 000 octets — pour
  qu'une ligne anormalement longue ne charge jamais un objet partiel en
  mémoire).

Au premier dépassement, la lecture s'arrête et `partiel` devient vrai —
annoncé au frontend, **jamais caché**. `0` est une valeur **valide** pour
les deux budgets (dégrade immédiatement, `partiel = true`, réponse en moins
d'une seconde), distincte d'une valeur absente ou du mauvais type, qui
retombent sur le défaut plutôt que d'être silencieusement acceptées.

L'ordre de parcours des `agent_id` est **déterministe** (trié), pas
dépendant de l'ordre de fourniture par l'appelant — un ensemble Python n'en
garantit aucun — pour que la dégradation sous budget touche toujours les
mêmes identifiants en premier, à budget égal, reproductible en test.

### Ce qui borne l'entrée : la liste vient de ce qu'`/api/etat` affiche réellement

`server.py` ne laisse jamais ce module choisir lui-même quels `agent_id`
lire : `Etat.etat()` calcule d'abord `workflows_affiches` (les seuls
workflows envoyés au tableau de bord, bornés par
`config.workflows_affiches()`), en extrait les `agent_id` des passages
**réellement affichés**, et **seulement alors** appelle
`T.lire_tokens_par_passage(config, agent_ids_affiches)`. Le module ne
parcourt **jamais** `subagents/` de sa propre initiative — c'est ce qui
rend « compteurs seulement » vérifiable : un `agent_id` qui n'a jamais été
demandé par l'appelant n'est jamais ouvert.

### Le trou de couverture trouvé en le signalant honnêtement

En ajoutant la liste des lots déjà livrés au registre de partition du
cycle, le jeton du lot 11 (conversation) manquait — dix-sept éléments
n'étaient donc vérifiés par **aucune** garde. En le corrigeant, les gardes
ont rougi : treize étaient déjà couverts ailleurs, trois posés à
l'exécution et couverts par le volet runtime, **un** ne l'était par rien.
La réparation ne se contente pas d'exempter cet élément : `F3b` lit
désormais la liste des exemptions **dans le fichier de `F4a`** et exige que
chaque identifiant exempté soit posé par un scénario réel — déclarer une
exception oblige donc à la couvrir, plutôt que de la faire disparaître d'un
registre sans qu'aucun test ne la voie jamais.

## Alternatives considérées

- **Recopier `usage` tel quel, plutôt qu'un filtre positif typé.** Écartée :
  mesuré sur un transcript réel, `usage` porte sept clés non entières,
  dont des dicts et des chaînes. Une liste **négative** (« tout sauf ces
  clés-là ») serait invalidée par la prochaine clé ajoutée par l'outil qui
  écrit ces fichiers ; un filtre **positif** ne peut jamais faire sortir
  autre chose que ce qu'il nomme explicitement.
- **Interroger `claude auth status` pour dériver la racine de lecture.**
  Écartée, voir §S5.5 — un sous-processus non nécessaire, couplé à un
  mécanisme (`feature-026`) non stabilisé.
- **Afficher `0` pour un passage sans transcript lisible.** Écartée, voir
  §S5.4/§S5.7 — confondrait « rien consommé » et « rien su ».
- **Lire tous les transcripts disponibles, filtrer côté frontend.** Écartée :
  romprait le confinement borné par `agent_ids_affiches` (§ ci-dessus) et
  ouvrirait potentiellement des centaines de fichiers par appel, sans
  rapport avec ce que l'écran affiche réellement.

## Conséquences

### Positives

- La lecture des transcripts est mesurable et testée sous ses propres
  conditions GATE, distinctes de celles des routes d'écriture d'`ADR-0040`.
- Le budget par instantané rend `/api/etat` sûr à rappeler à chaque signal
  SSE, quelle que soit la taille cumulée des transcripts du projet.
- Le filtre positif typé rend la fuite de texte structurellement
  impossible tant que le filtre n'est pas élargi explicitement — pas
  seulement improbable.

### Négatives

- Une lecture peut être **partielle** sous charge (beaucoup de passages
  affichés, gros transcripts) : le chiffre au centre du disque peut alors
  ne représenter qu'une fraction des passages visibles, annoncée par
  `partiel` mais pas immédiatement visible sans lire cette annonce.
- Le confinement dépend d'une règle d'encodage de chemin **reconstruite**
  plutôt que lue depuis l'outil qui fait autorité (`claude auth status`) :
  si cet encodage change un jour côté `claude`, ce module doit être mis à
  jour séparément, sans qu'aucun signal ne le prévienne automatiquement.

### Ce que ça verrouille

- Toute extension future de ce que le disque affiche à partir des
  transcripts (au-delà des deux compteurs) doit revenir devant le GATE :
  le filtre positif typé est une clôture délibérée, pas une limitation
  provisoire à desserrer localement.
- `feature-026`, si elle est un jour construite, ne peut pas devenir
  silencieusement une dépendance de ce module sans rouvrir cet ADR — la
  décision de l'éviter est écrite, pas seulement pratiquée.

## Références

- Code : `control-center/backend/transcripts.py` (module entier,
  docstring détaillant S5.1 à S5.7) ; `control-center/backend/config.py`
  (`transcripts_racine_surcharge`, `transcripts_budget_secondes`,
  `transcripts_budget_octets`) ; `control-center/backend/server.py`
  (`Etat.etat()`, construction de `agent_ids_affiches`, appel de
  `lire_tokens_par_passage`) ; `control-center/backend/vcs.py`
  (`chemin_sur()`, même garde que `ADR-0040`).
- Tests : `control-center/backend/test_transcripts.py`,
  `test_server_feature023.py`, `test_config.py`.
- Specs : `specs/features/doing/feature-023-tokens-par-passage-d-agent.md`.
- `control-center/PIEGES.md` §59 (préfixe devant un identifiant qui annule
  le témoin de traversée classique).
- ADR : `ADR-0038 §5` (le chiffre au centre du disque, ce qu'il affiche et
  ce qu'il dégrade) ; [ADR-0031](0031-la-grammaire-du-disque-d-agent-change.md)
  §5 (l'anneau ne dépend jamais des tokens, donc survit à un budget épuisé
  ou à un refus de cette surface) ; `ADR-0040` (modèle de menace des routes
  d'**écriture**, distinct de celui-ci — ne pas fusionner).
