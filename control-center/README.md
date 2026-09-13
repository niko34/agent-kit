# Centre de contrôle du développement piloté par agents

> **Ce répertoire fait partie du template `agent-kit`.** Il arrive dans les
> projets par `tools/update_kit.sh`, en chemin **conditionnel** : seuls ceux qui
> l'ont déjà installé le reçoivent. La première installation est assistée par
> [`installer.py`](installer.py). Il n'existe pas d'autre script de
> synchronisation — voir [ADR-0010](../docs/adr/0010-un-seul-script-de-synchronisation.md).
>
> Les chiffres cités plus bas — 167 specs, 22 divergences, 108 appels d'outils
> sur 110 — ont été relevés dans `esp32-pool-controller`, le projet où l'outil a
> été construit et éprouvé. Ils ne décrivent pas nécessairement le vôtre : ils
> expliquent **pourquoi** la conception est ce qu'elle est. Une mesure datée vaut
> mieux qu'une affirmation générale.
>
> **Ce qui ne voyage pas** : `control-center.toml`, la configuration du projet,
> et `var/`, son journal. Le modèle à copier est
> [`control-center.example.toml`](control-center.example.toml).

Interface web d'observation et de pilotage des workflows Claude Code. Elle vit à
côté de Claude Code, elle ne le remplace pas : **l'orchestration reste dans
`CLAUDE.md` et les agents**, et le terminal continue de fonctionner
indépendamment.

Ce répertoire est conçu pour être **déplacé d'un bloc** vers le template
d'agents. Rien de spécifique à ce projet n'entre dans le code : ce qui varie
d'un dépôt à l'autre vit dans [`control-center.toml`](control-center.toml).

## Installation dans un projet

```bash
python3 control-center/installer.py            # examine et propose
python3 control-center/installer.py --ecrire   # écrit control-center.toml
```

L'assistant **découvre** ce qu'il peut lire du projet — répertoires de specs
réellement présents, répertoire d'agents, commandes de test devinées d'après les
fichiers de build — et en tire un `control-center.toml` pré-rempli. Il n'invente
rien : une colonne `doing/` absente du disque n'apparaît pas dans la
configuration.

Deux choses qu'il ne fait **pas**, délibérément :

**Il n'écrase jamais un `control-center.toml` existant.** Une configuration en
place a été relue par quelqu'un ; la regénérer effacerait ce travail.

**Il n'écrit jamais dans `.claude/settings.json`.** C'est le fichier le plus
personnalisé d'un projet — permissions, refus, garde-fous choisis un par un. Un
script qui y écrit finit un jour par écraser une décision. L'assistant **affiche**
le bloc de hooks à coller, et s'arrête là.

> ⚠️ **Sans ces hooks, le journal reste vide** et le tableau de bord n'affiche
> rien. C'est l'étape manuelle, et la seule.

Ensuite, `tools/update_kit.sh` maintient le centre de contrôle à jour depuis le
kit. Il y figure en chemin **conditionnel** : un projet qui ne l'a pas installé
ne le reçoit jamais.

## État d'avancement

| Étape | Objet | État |
|---|---|---|
| **A** | Hooks + journal d'événements | ✅ livré, validé par mutation |
| **B** | Specs, événements, configuration, git | ✅ livré, validé par mutation |
| **C** | Tableau de bord en lecture seule | ✅ livré · apparence non vérifiée |
| D | Lancement d'un workflow | à faire |
| E | Création d'une spec depuis un prompt | à faire |
| F | Discussion par spec | à faire |
| G | Scénario complet avec échec réel | à faire |

L'analyse préalable complète (workflow observé, agents détectés, cycle de vie
mesuré, limites du runtime) est publiée à part ; les décisions qu'elle a figées
sont reprises ci-dessous.

## Étape A — l'instrumentation

Un seul script, [`hooks/record-event.py`](hooks/record-event.py), branché sur
neuf événements dans `.claude/settings.json`. Il écrit une ligne JSON par
événement dans `var/agent-events.jsonl`.

**Aucun prompt d'agent n'est modifié.** C'était la contrainte : les agents
restent propres, l'instrumentation vient du runtime.

### Pourquoi le graphe est plat

Les hooks `SubagentStart` / `SubagentStop` portent `agent_type`, `agent_id` et
`session_id`, mais **aucun identifiant de l'appel parent**. Ce serait bloquant
s'il y avait de l'imbrication — or aucun agent de ce dépôt n'a l'outil `Task`
dans son frontmatter, donc aucun ne peut déléguer.

Une session ne peut donc jamais imbriquer deux passages d'agent : le
reconstruire un segment est un tri chronologique, pas une résolution d'arbre.

> ⚠️ Ne pas lire cette impossibilité comme une « limitation runtime » : la
> profondeur d'imbrication par défaut est de trois niveaux. Ce qui ferme la
> délégation ici, c'est la liste `tools` des agents — une décision de
> configuration, révocable. La conséquence est la même, la cause ne l'est pas,
> et elle rouvre une option qu'on pourrait croire fermée. Le référentiel
> (`CLAUDE.md`, `GUIDE.md`) portait la formulation fausse ; corrigée le
> 2026-09-12, voir [ADR-0002](../docs/adr/0002-graphe-execution-plat.md).

> ⚠️ **« Un workflow » n'est plus « une session ».** ADR-0002 posait qu'un
> workflow observable est une session entière partageant un `session_id` —
> cette hypothèse a été **réfutée à l'usage** (`bug-004`) : quatre cycles de
> spec complets, 45 passages d'agents sur quinze heures, menés dans une seule
> session et affichés jusqu'ici comme un seul workflow. Un workflow est
> désormais un **segment** d'une session, borné par un agent ouvrant déclaré
> en configuration (`[workflows] agents_ouvrants`) — la session entière par
> défaut, ou en l'absence de ce marqueur. Voir la note additive datée du
> 2026-09-13 sur [ADR-0002](../docs/adr/0002-graphe-execution-plat.md) et
> [ADR-0014](../docs/adr/0014-bornage-des-cycles-par-marqueur-declare.md), qui
> le supersède sur ce seul point. Le graphe reste plat : ADR-0002 n'est pas
> remis en cause sur l'absence de `Task` et le tri chronologique.

### Ce que le collecteur ne fait jamais

1. **Il ne fait jamais échouer une session.** Il sort toujours en code 0. Un
   hook qui sort en code 2 *annule* l'action observée ; un journal incomplet est
   un désagrément, une session cassée est une panne.
2. **Il ne recopie jamais de contenu volumineux.** Ni `tool_result`, ni diff, ni
   sortie de test — ceux-ci sont référencés par chemin.
3. **Il ne recopie jamais de secret.** Voir ci-dessous.
4. **Il ne connaît rien du projet.** Aucun nom d'agent, aucune commande, aucun
   chemin de spec en dur.

### La redaction, et pourquoi elle a deux gardes

Le collecteur reçoit **toute** commande shell exécutée par Claude Code. Ce dépôt
en exécute qui portent le mot de passe de l'appareil, et `ota_update.sh`
documente lui-même `POOL_PASSWORD=… ./ota_update.sh` comme un usage normal.

On ne conserve donc que les **deux premiers jetons sûrs** :

| Commande | Journalisé |
|---|---|
| `pio test -e native` | `pio test` |
| `git commit -F /tmp/msg.txt` | `git commit` |
| `POOL_PASSWORD=secret ./ota_update.sh firmware` | `./ota_update.sh firmware` |
| `curl -u admin:secret http://…` | `curl -u` |

Deux règles, et il faut les deux :

- tout jeton contenant `=` ou `:` est **écarté**, jamais tronqué — `POOL_PASSWORD=sec`
  reste un préfixe de secret ;
- tout jeton de plus de 24 caractères est écarté : c'est une donnée ou un chemin,
  pas un nom de programme.

Le premier défaut a été trouvé sur le **premier événement réel** produit par le
collecteur, avant toute mise en service. Le second a été trouvé par mutation :
avec un faux secret trop long, retirer entièrement le filtre `=`/`:` ne tuait
aucun test — le plafond de longueur sauvait la mise à sa place, et un mot de
passe **court** aurait fui. Le faux secret des tests est court depuis.

## Étape B — la lecture des specs

[`backend/specs.py`](backend/specs.py) ne fait que LIRE. Il ne déplace aucune
spec, n'en écrit aucune, ne corrige rien : le cycle de vie appartient aux agents
et à l'humain.

### La colonne vient du répertoire, jamais du champ « Statut »

Mesuré sur les 167 specs : le champ existe dans 165 fichiers mais en **texte
libre** — plus de vingt formes, parfois une phrase sur plusieurs lignes — et il
**contredit le répertoire 22 fois**. `tools/check_specs.sh` avait déjà tranché :
« ce champ est en texte libre dans le dépôt et son analyse produirait des faux
positifs ». Le répertoire, lui, est vérifié mécaniquement en CI.

Le statut reste **affiché tel quel**. Une classification grossière existe, au
seul usage de la détection de divergence, et elle obéit à trois règles :

1. **Une divergence n'est affirmée que si la classe est connue.** Deux specs ont
   un statut illisible ; l'outil se tait sur elles. « Je ne sais pas lire ce
   statut » n'est pas « ils se contredisent ».
2. **Le premier champ de l'en-tête gagne.** Certaines specs redéfinissent un
   second « Statut » dans leurs notes, qui contredit le premier.
3. **Un champ trouvé hors de l'en-tête est ignoré**, même absent plus haut.

Ces deux dernières gardes sont distinctes et chacune a son test : avec un seul
cas, elles étaient mutuellement redondantes et aucun mutant ne mourait.

### Le seul choix éditorial, et comment le défaire

`GELÉE` est rangé en **clos** : `done/` archive les décisions de ne pas faire, et
`feature-123` y porte `GELÉE — pas abandonnée`. Le choix vit dans
`control-center.toml`, pas dans le code, parce qu'il n'est vrai que de ce dépôt.

**Effet mesuré**, et non supposé : avec les deux lignes, `feature-123` est classée
« done » — 22 divergences, 2 statuts illisibles. Sans elles, elle devient
**indéterminée** — 22 divergences, 3 illisibles. Les retirer ne fait donc pas
réapparaître une divergence : cela fait **taire** l'outil sur cette spec.

J'avais d'abord écrit l'inverse. La règle « une divergence n'est affirmée que si
la classe est connue » prime sur le vocabulaire, et le décompte de 23 d'une
analyse antérieure venait d'une comparaison littérale — qui tient tout statut
non reconnu pour divergent. Ce module ne fait pas cela, délibérément.

### Quand une spec n'a pas de titre

78 specs sur 167 n'ont aucun titre `#`. L'outil affiche alors leur
**identifiant**, jamais un titre fabriqué : un identifiant vrai vaut mieux qu'un
libellé plausible.

## La configuration, et ce qui n'y est pas

[`control-center.toml`](control-center.toml) porte **uniquement ce qu'aucune
inspection ne donne** : l'ordre et le libellé des colonnes, le vocabulaire des
statuts, les fichiers à ignorer, les commandes lançables, les bornes de sûreté.
La liste des agents, celle des specs et les fichiers modifiés sont **découverts**.

Trois propriétés de [`backend/config.py`](backend/config.py) :

- **L'outil démarre toujours.** Fichier absent, TOML cassé, section vide : il
  part sur les défauts. Un projet issu du template n'a peut-être rien à déclarer.
- **Le défaut n'écoute qu'en local.** Ouvrir au réseau est une décision explicite
  du projet, jamais un héritage silencieux.
- **Le défaut n'autorise aucune commande.** Sans déclaration, rien n'est lançable.

⚠️ Ce fichier a existé pendant trois commits **sans que personne ne le lise** :
commenté, versionné, entièrement décoratif. C'est la pire forme de dette — une
configuration qui a l'air d'être en service alors qu'elle ne pilote rien.

## Étape B — la lecture de git

[`backend/vcs.py`](backend/vcs.py) ne fait que **lire** : aucun `add`, aucun
`commit`, aucun `checkout`. Le dépôt appartient à l'humain et aux agents.

Deux invariants portent la sûreté, et ils seront exploitables dès que le serveur
répondra au navigateur :

- **Aucun shell, jamais.** Tout part en `argv`, avec `shell=False`. Un nom de
  fichier ne peut pas contenir une commande. Et `--` sépare systématiquement les
  options des chemins : sans lui, un fichier réellement nommé `--stat` serait lu
  par git comme une option — un test le vérifie sur un vrai dépôt.
- **Aucun chemin hors du dépôt.** `chemin_sur()` est le point de passage unique
  et résout les liens symboliques des deux côtés : un lien pointant dehors est
  **refusé, jamais suivi**.

Une référence de commit est validée par **liste blanche de caractères** avant
d'atteindre git : `--help`, `-n`, `a/b`, `; rm -rf /`, `$(whoami)` sont tous
refusés.

Un diff tronqué est **annoncé comme tel**. Un diff coupé en silence se lit comme
un diff complet, et c'est un mensonge sur l'état du code.

## Étape C — le tableau de bord

```bash
python3 control-center/backend/server.py      # puis http://<hôte>:8787
```

### La garantie est structurelle, pas réglementaire

**`Handler` n'a pas de `do_POST`.** Ni `do_PUT`, ni `do_DELETE`. Ce ne sont pas
des routes désactivées par une option : les méthodes n'existent pas, donc
`http.server` répond **501** de lui-même. Aucun clic ne peut rien lancer, rien
écrire, rien dépenser.

Deux tests le verrouillent : un par HTTP, et un par **introspection de la
classe** — si une route d'écriture est ajoutée un jour, le second échoue même si
le comportement HTTP est masqué par ailleurs. C'est là que les garde-fous de
l'étape D devront exister d'abord.

### Trois familles de chemins, trois validations

Aucune arithmétique de chemin n'est improvisée :

| Ressource | Validation |
|---|---|
| fichiers statiques | liste **fermée**, calculée au démarrage depuis `web/` — l'extension tranche, pas l'existence du fichier |
| specs | l'identifiant doit correspondre **exactement** à une spec découverte ; aucun chemin n'est construit depuis la requête |
| diffs | `vcs.chemin_sur()` — liens symboliques résolus, sortie du dépôt refusée |

`transcript_path` figure dans le journal et pointe **hors du dépôt**, vers la
conversation entière. Une **liste blanche positive** de champs l'écarte : un
champ neuf apparu dans le journal ne sort pas tant qu'il n'y est pas ajouté.

### Le flux transporte un signal, pas l'état

Le SSE envoie `maj`, et le navigateur redemande `/api/etat`. Un état poussé et
un état demandé pourraient diverger, et il faudrait alors décider lequel fait
foi. L'empreinte de changement **exclut l'horodatage** — sinon l'interface se
rafraîchirait en boucle.

### Ce qui n'est pas vérifié

L'**apparence**. Une capture headless n'aboutit pas : la page garde une
connexion SSE ouverte, que le budget de temps virtuel de Chromium ne peut pas
faire expirer. Le comportement est testé, le rendu ne l'est pas.

## Tests

```bash
python3 control-center/hooks/test_record_event.py   # 19 cas
python3 control-center/backend/test_specs.py        # 16 cas
python3 control-center/backend/test_events.py       # 54 cas
python3 control-center/backend/test_config.py       # 22 cas
python3 control-center/backend/test_vcs.py          # 26 cas
python3 control-center/backend/test_server.py       # 34 cas
python3 control-center/backend/specs.py             # inventaire réel
python3 control-center/backend/events.py            # workflows reconstruits
```

Sans dépendance, et validés par mutation — une suite qui ne tue aucun mutant ne
prouve rien.

**Collecteur** : casser le filtre `=`/`:` tue quatre tests, retirer le plafond de
longueur en tue un, revenir à un horodatage à la seconde en tue un, retirer le
confinement au dépôt en tue un, sortir en code non nul en tue deux.

**Lecteur de specs** : retirer la lecture en deux mots tue deux tests, faire
affirmer une divergence sur un statut illisible en tue un, laisser le dernier
champ gagner en tue un, retirer la fenêtre d'en-tête en tue un, inclure
`README.md` en tue deux, fabriquer un titre en tue un.

**Bornage en cycles** (`bug-004`, la suite passe de 139 à 171 cas au total,
quatre mutants tués sur ce lot) : neutraliser la recherche d'une fermeture
dans les segments antérieurs à un marqueur fait échouer l'appariement d'un
passage ouvert avant la frontière et clos après (cas E7), et gonfle à tort
`fermetures_orphelines` ; trier les événements avant de les segmenter au lieu
de suivre l'ordre reçu inverse l'indice de cycle attendu (cas E10) ; laisser
un découpage se produire quand `agents_ouvrants` est vide, ou quand aucun
agent de la liste n'est rencontré, fait échouer le refus explicite testé par
E3 et E4.

Un mutant du collecteur est **équivalent** et doit rester documenté comme tel :
rendre une chaîne vide au lieu de `None` quand aucun jeton n'est sûr ne change
rien, parce que l'appelant teste la valeur pour sa vérité. Ce n'est pas un trou
de couverture, et le compter comme tué ferait pourrir le décompte.

## Format d'un événement

```json
{
  "ts": "2026-09-12T13:41:18.535Z",
  "runtime": "claude-code",
  "session_id": "12156c3b-…",
  "hook_event_name": "SubagentStart",
  "agent_type": "test-engineer",
  "agent_id": "a9",
  "cwd": "/root/esp32-pool-controller",
  "transcript_path": "/root/.claude/projects/-root/12156c3b-….jsonl"
}
```

- **`ts` est à la milliseconde.** À la seconde, l'ordre de deux événements
  consécutifs devenait indécidable — or c'est exactement cet ordre qui distingue
  une boucle `tester → debugger → developer` d'un enchaînement normal.
- **`runtime` est inscrit dès le premier événement**, pour que l'ajout d'un autre
  runtime n'oblige pas à relire un journal écrit sans lui.
- **L'absence d'`agent_id` identifie l'agent principal.** Elle n'est jamais
  comblée par une valeur par défaut.
- **`transcript_path` n'est jamais reconstruit par convention.** Il existe deux
  arborescences sous `~/.claude/projects/` — le nom encode le répertoire de
  lancement, pas le dépôt — et une même session peut avoir des fichiers dans les
  deux. On prend le chemin que le hook donne.

## Le journal n'est pas versionné

`var/` est ignoré par git. Le journal est une **trace**, pas une source de
vérité : les specs et git font foi. Le versionner ferait diverger deux récits du
même passé sans qu'aucun ne fasse autorité.
