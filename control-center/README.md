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

> **Avant de travailler sur ce module** : [`PIEGES.md`](PIEGES.md) recense les
> contraintes opérationnelles et les faux-semblants **mesurés** — port occupé,
> clone jetable, conventions de test, harnais qui prouvent moins qu'ils n'en ont
> l'air. Chaque entrée y a été payée une fois.

## Le modèle de déploiement (ADR-0020), à lire avant tout le reste

⚠️ **Hypothèse non écrite avant le 2026-09-15, désormais explicite** : le
segment réseau entre le navigateur et le serveur est supposé **de
confiance**. Le jeton est un secret statique, présenté en clair dans
`Authorization: Bearer` ; `server.py` ne fait tourner aucun TLS. Un tiers en
écoute passive sur ce segment obtient exactement les droits du propriétaire.
Si l'hypothèse ne tient pas, la terminaison TLS revient à un intermédiaire
**local** (reverse proxy sur la même machine ou le même conteneur), avec
`fichier_jeton` déclaré — voir la note du 2026-09-15 en pied d'
[ADR-0020](../docs/adr/0020-un-centre-de-controle-appartient-a-un-developpeur.md).

> Un centre de contrôle **appartient à un développeur** et pilote une session
> Claude liée à **son** compte. Où il tourne — portable, conteneur, machine
> distante — est un choix de déploiement, jamais un changement de nature.
>
> - Écoute sur `127.0.0.1` (ou `localhost`/`::1`) → le **jeton est
>   facultatif** : qui atteint le port a déjà un shell sur la machine, lecture
>   ET écriture fonctionnent sans secret.
> - Écoute au-delà → le **jeton est obligatoire, lecture comprise**. C'est lui
>   qui rattache « qui frappe à la porte » à « celui à qui ce serveur
>   appartient ».
> - ⚠️ **Tout intermédiaire local** — reverse proxy, TLS, `socat`,
>   userland-proxy Docker — fait arriver les requêtes du réseau en
>   `127.0.0.1` : la détection ne les voit pas. **Dans ce cas, configurez un
>   jeton** ; un jeton *configuré* reste vérifié même en local, et c'est ce
>   qui vous protège.
>
> Détail complet, alternatives écartées et conséquences :
> [ADR-0020](../docs/adr/0020-un-centre-de-controle-appartient-a-un-developpeur.md).

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
| **D** | Lancement d'un workflow | ✅ livré, validé par mutation |
| **E** | Création d'une spec depuis un prompt | ✅ livré, validé par mutation |
| F | Discussion par spec (`feature-009`) — persistante, versionnée dans git | à faire |
| G | Scénario complet avec échec réel | à faire |
| **H** | Actions du backlog : lancer, modifier, supprimer une spec (`feature-025`) | ✅ livré, GATE P1 puis P2 sur le diff |
| **I** | Conversation permanente avec l'agent en cours (`feature-022`) — éphémère, distincte de F, voir [ADR-0040](../docs/adr/0040-les-chemins-decriture-du-cockpit.md) §5 | ✅ livré, GATE P1 (refusé puis redessiné) puis P2 |
| **J** | Tokens par passage d'agent, lus hors racine du dépôt (`feature-023`) | ✅ livré, GATE P1 |

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

> ⚠️ **Un troisième état de passage, additif : `sans_cloture`.** Un passage
> sans `SubagentStop` — agent tué par le runtime, session interrompue — restait
> affiché « en cours » indéfiniment (`bug-013`, relevé par l'utilisateur, 22 h
> après les faits, sur son propre tableau de bord). `reconstruire()`
> requalifie désormais un passage ouvert sans **aucun** événement rattaché
> depuis `[workflows] seuil_abandon_minutes` minutes (défaut **120**, borné
> `[60, 10080]`) en `sans_cloture` — un troisième état, additif à
> `termine`/`en_cours`, qui ne porte aucun verdict sur le travail. **Pourquoi
> 120, et pas la durée maximale mesurée (24 min, 36 retenues en borne de
> test)** : le seuil ne protège pas contre un cycle long, il protège contre un
> **silence légitime** à l'intérieur d'un passage vivant — un `architect` a
> émis un seul appel d'outil en 127 secondes. Accuser à tort un agent vivant
> coûte plus cher qu'afficher trop longtemps un agent mort : on relancerait un
> travail déjà en cours. Voir
> [ADR-0021](../docs/adr/0021-etat-sans-cloture-additif-et-seuil-declare.md).

### Ce que le collecteur ne fait jamais

1. **Il ne fait jamais échouer une session.** Il sort toujours en code 0. Un
   hook qui sort en code 2 *annule* l'action observée ; un journal incomplet est
   un désagrément, une session cassée est une panne.
2. **Il ne recopie jamais de contenu volumineux.** Ni `tool_result`, ni diff, ni
   sortie de test — ceux-ci sont référencés par chemin.
3. **Il ne recopie jamais de secret.** Voir ci-dessous.
4. **Il ne connaît rien du projet.** Aucun nom d'agent, aucune commande, aucun
   chemin de spec en dur.

### La rédaction, et ce que le code fait maintenant (`bug-014`)

Le collecteur reçoit **toute** commande shell exécutée par Claude Code. Ce dépôt
en exécute qui portent le mot de passe de l'appareil, et `ota_update.sh`
documente lui-même `POOL_PASSWORD=… ./ota_update.sh` comme un usage normal.

`bug-014` a fermé une classe entière que l'ancienne garde ne fermait pas : un
mot de passe **entièrement en minuscules** (une passphrase, un mot du
dictionnaire) est lexicalement indiscernable d'une sous-commande légitime
(`git status`, `npm run`, `docker ps`) — aucune forme sur le second jeton seul
ne peut le distinguer. La règle est désormais **unique**, portée par un module
partagé ([`hooks/redaction_commande.py`](hooks/redaction_commande.py),
`command_head()`), appelé à la fois par le hook et par
`backend/config.py`/`backend/server.py` (`_lancer()`) — les deux écrivains ne
peuvent plus diverger.

Le second jeton n'est retenu que sous **trois formes** :

| Commande | Journalisé | Forme admise |
|---|---|---|
| `pio test -e native` | `pio test` | mot nu, `pio` est un programme à sous-commande connu |
| `git commit -F /tmp/msg.txt` | `git commit` | idem |
| `grep -rn motif .` | `grep -rn` | option courte (1-2 lettres) |
| `node --check f.js` | `node --check` | option longue |
| `mysql -psecretword -h db` | `mysql` | rejeté : pas une des trois formes |
| `POOL_PASSWORD=secret ./ota_update.sh firmware` | `./ota_update.sh` | rejeté : `firmware` suit un jeton écarté, aucun passe-droit |
| `curl -u admin:secret http://…` | `curl -u` | option courte, valeur écartée |

La liste fermée des programmes à sous-commande (`git`, `gh`, `pio`, `npm`,
`docker`, `pip`) est **mesurée contre les journaux réels**, jamais devinée ; un
programme absent perd simplement son second jeton, il ne fait jamais fuir plus
(défaut sûr). `sudo`, `env`, `ssh`, `sshpass`, `echo`, `printf`, `cat`, `cd`,
`python3`, `bash`, `sh` en sont explicitement exclus : leur second jeton porte
une donnée, pas un verbe du programme.

Deux résidus restent, **assumés par écrit**, pas fermés :

- une **option longue à valeur collée sans séparateur** (`--passwordx`) —
  forme non standard (`getopt` exige `=`), et la mesure sur les deux journaux
  réels n'y trouve que des options légitimes (`--version`, `--check`,
  `--help`, `--write`) ;
- un **chemin comme premier jeton après un décalage de position**
  (`A=b /etc/shadow` → `/etc/shadow`) — hors de la classe « mot de passe »
  visée par ce bug, comportement déjà présent avant `bug-014`.

Trouvé sur le **premier événement réel** produit par le collecteur, avant
toute mise en service : tout jeton contenant `=` ou `:` est **écarté**, jamais
tronqué (`POOL_PASSWORD=sec` resterait un préfixe de secret). Trouvé par
mutation : tout jeton de plus de 24 caractères est écarté, sinon un mot de
passe **court** collé à une option (`-phunterpass`, un chiffre ou une
majuscule ne suffisant plus à l'écarter depuis `bug-014`) aurait fui.

Voir la docstring de `redaction_commande.py` pour la trace complète des
formes fermées et refusées, et [ADR-0028](../docs/adr/0028-la-tete-de-commande-garde-deux-jetons-et-un-seul-module-decide-du-second.md)
pour l'arbitrage entre les options envisagées.

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

⚠️ Ce module servait aussi `vcs.diff()`, dont un diff tronqué était **annoncé
comme tel** (un diff coupé en silence se lit comme un diff complet, et c'est un
mensonge sur l'état du code) — trace historique de cette étape, **la fonction
et la route qu'elle servait n'existent plus** (`/api/diff`, retirée par
`feature-028`, voir Étape H).

## Étape C — le tableau de bord

```bash
python3 control-center/backend/server.py
```

Le serveur **annonce au démarrage l'adresse et le port sur lesquels il écoute** —
c'est cette ligne qui fait foi, jamais une valeur recopiée ici. Par défaut il
s'agit de `127.0.0.1:8787` (`[serveur]` de `control-center.toml` : `hote` et
`port`), mais tout projet peut les redéfinir, et beaucoup le font.

> ⚠️ Si le tableau de bord « ne répond plus », vérifie **d'abord** que le
> processus tourne et sur quel port, avant de conclure à une panne :
> ```bash
> pgrep -af backend/server.py          # le processus est-il vivant ?
> ss -ltnp | grep python3              # sur quelle adresse:port écoute-t-il ?
> ```
> Une valeur de port lue dans une documentation plutôt que dans la configuration
> du projet est une cause classique de faux diagnostic.

### La garantie était structurelle par absence ; elle l'est désormais par table fermée

**Jusqu'à l'étape D**, `Handler` n'avait pas de `do_POST`. Ni `do_PUT`, ni
`do_DELETE`. Ce n'étaient pas des routes désactivées par une option : les
méthodes n'existaient pas, donc `http.server` répondait **501** de lui-même.

`do_POST` existe désormais (étape D, ci-dessous), et cette absence-là a donc
cessé d'être vraie — c'était l'échéance prévue par
[ADR-0004](../docs/adr/0004-centre-controle-sans-route-ecriture.md) : les trois
garde-fous devaient devenir du code avant, pas après, cette route. Ce qui
remplace la garantie, et pourquoi, est documenté dans
[ADR-0019](../docs/adr/0019-jeton-comme-unique-barriere-et-table-des-routes-fermee.md) :
une liste **fermée** de routes d'écriture (`_ROUTES_ECRITURE`), vérifiée avant
toute autre garde, et un test d'introspection **inversé** — il n'affirme plus
l'absence de méthodes d'écriture, mais que l'ensemble des méthodes `do_*` de
`Handler` vaut exactement `{do_GET, do_POST}` et que l'ensemble des routes
réellement routées par `do_POST` vaut exactement `_ROUTES_ECRITURE`. Ce
nouveau test est **plus large** que celui qu'il remplace : il échoue aussi
bien sur un `do_PUT` ajouté un jour que sur une route glissée dans `do_POST`
sans passer par la liste.

### Trois familles de chemins, trois validations

Aucune arithmétique de chemin n'est improvisée :

| Ressource | Validation |
|---|---|
| fichiers statiques | liste **fermée**, calculée au démarrage depuis `web/` — l'extension tranche, pas l'existence du fichier |
| specs | l'identifiant doit correspondre **exactement** à une spec découverte ; aucun chemin n'est construit depuis la requête |
| transcript de la session Claude remote (étape I, `feature-026`) | `session_id` confiné à `[0-9a-fA-F-]{1,64}` (`session_tmux.py`) **puis** revérifié par `vcs.chemin_sur()` avant tout `os.path.join` (défense en profondeur, ne dépend pas d'une seule des deux couches) |

⚠️ **`diffs` a existé dans cette table** (`vcs.chemin_sur()`, servant
`/api/diff`) et en a été retirée : la route est **supprimée** (voir « Ce qui
peut sortir du serveur » ci-dessus, et l'Étape H).

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

## Étape D — le lancement d'un workflow

La première route d'écriture. Trois garde-fous, déclarés en configuration
depuis l'étape C sans qu'aucun code ne les applique, sont devenus du code
**avant** elle — c'est l'ordre imposé par
[ADR-0004](../docs/adr/0004-centre-controle-sans-route-ecriture.md), et ce qui
la remplace est dans [ADR-0019](../docs/adr/0019-jeton-comme-unique-barriere-et-table-des-routes-fermee.md).

### Garde-fou 1 — le jeton partagé ([`backend/jeton.py`](backend/jeton.py))

Lu depuis le fichier désigné par `[serveur].fichier_jeton`, **hors du
dépôt**. `charger()` ne lève jamais : absent, vide, mal protégé ou illisible
rend un jeton **inactif**, avec un motif nommé — c'est le message affiché au
démarrage du serveur.

⚠️ **Un `fichier_jeton` DÉCLARÉ mais invalide ferme, il n'ouvre pas.** C'est le
principe *fail-closed* : une configuration cassée est précisément le moment où
il faut se méfier. Les routes exigent alors un jeton que personne ne peut
fournir, et le message dit **pourquoi** et **comment sortir**. Ne pas déclarer
de `fichier_jeton` du tout est un choix légitime en local (ADR-0020) ; en
déclarer un qui ne marche pas n'en est pas un.

- Comparaison par `hmac.compare_digest`, jamais par `==` (temps constant).
- Permissions vérifiées au chargement : tout bit groupe ou autre posé
  (masque `0o077`) est refusé, seul le bit propriétaire est toléré — mode
  attendu au plus `0600`.
- Un jeton tient sur une seule ligne, entre 16 et 4096 octets utiles. Un
  retour à la ligne final est retiré (c'est ce que laisse `echo secret >
  fichier`) ; une **espace** à l'intérieur, ou tout octet hors ASCII
  imprimable, est refusé — un jeton non-ASCII redeviendrait une suite
  d'octets différente une fois relu depuis un en-tête HTTP (LATIN-1).
- Le jeton n'apparaît jamais dans un journal, une URL ou un message
  d'erreur : `/api/etat` masque le chemin du fichier dans le motif de refus.

### Garde-fou 2 — l'écrivain unique ([`backend/verrou.py`](backend/verrou.py))

Prise **atomique** par `flock(LOCK_EX | LOCK_NB)` — vérifié par exécution :
huit threads lancés simultanément donnent exactement un verrou pris et sept
refusés, jamais plus d'un. Un refus **nomme** ce qui occupe la place et
depuis quand.

Le noyau libère le verrou quand le serveur meurt, mais **pas** le processus
fils qu'il a lancé. La méta du verrou porte donc `pid_fils` et `starttime`
(champ 22 de `/proc/<pid>/stat`) : avant de reprendre un verrou laissé par un
détenteur disparu, on vérifie que le fils qu'il désignait n'est pas
**toujours vivant** (PID existant, `/proc/<pid>/cmdline` non vide, même
`starttime`). S'il l'est, la reprise est refusée avec le motif « orphelin
vivant, interrompre d'abord ». Une méta illisible est traitée comme un
verrou libre, jamais comme un blocage permanent.

### Garde-fou 3 — le plafond de dépense ([`backend/config.py`](backend/config.py))

`[garde_fous].budget_max_usd` est ajouté à l'`argv` (`--max-budget-usd`), et
seulement pour les clés listées dans `[garde_fous].commandes_avec_budget` —
liste fermée elle aussi : une clé absente de cette liste refuse le
lancement (`503`) plutôt que de le laisser partir sans plafond.

### Le lancement ([`backend/lanceur.py`](backend/lanceur.py))

`POST /api/lancer` reçoit une **clé** de `[commandes]`, jamais une ligne de
commande (ADR-0005). Exécution en `argv`, `shell=False`, `start_new_session=True`
(le fils devient meneur de son propre groupe, distinct de celui du serveur).
La sortie est retenue dans un tampon **circulaire** borné (200 000 octets),
lue par blocs de 64 Kio — jamais par ligne, une commande peut ne jamais
émettre de saut de ligne. La troncature est **annoncée** (`tronque: true`),
jamais silencieuse.

`GET /api/lancement?depuis=<curseur>` rend la suite de la sortie depuis un
curseur opaque — pas de SSE ici : `EventSource` ne pose aucun en-tête, le
jeton serait passé en query string (donc dans les journaux d'accès), et
`log_message` recrache déjà tout `4xx`/`5xx` sur `stderr`, y compris le
`401` qu'un jeton en URL provoquerait à chaque échec. Le curseur rend la
reconnexion après fermeture d'onglet gratuite : le navigateur redemande
depuis son dernier curseur connu.

`POST /api/interrompre` envoie `SIGTERM` au groupe du fils, puis `SIGKILL`
après 5 secondes s'il résiste — même délai à l'arrêt du serveur
(`atexit`/`SIGTERM`/`SIGINT`), pour qu'un fils ne survive jamais seul à un
arrêt ordinaire. Sur un `SIGKILL` du serveur lui-même, rien de tout cela ne
s'exécute : c'est alors la méta du verrou qui détecte l'orphelin au
redémarrage suivant.

`{spec_id}` est **optionnel** dans le corps depuis `feature-028` (menu `⋮`
d'une carte kanban, condition C3 du GATE) : absent, comportement **inchangé**
(interrompt `lancement_courant()`, le dernier lancement basculé) ; présent, la
route cible **exactement** le lancement dont le `spec_id` est égal, parmi
**tous** les lancements actifs (`404` si aucun ne correspond) — jamais
`lancement_courant()` seul, qui ne désignerait que le dernier écrivain basculé
et pourrait donc interrompre un lancement sans rapport avec la carte cliquée.

### Le champ unique qui dit si l'écriture est active

`/api/etat` porte un champ `ecriture_active`, calculé par le **même** test
que celui qui conditionne `do_POST`. L'interface le lit à deux endroits — le
badge d'état et le panneau de pilotage — sans qu'aucun des deux ne refasse sa
propre déduction (ni de la présence de `fichier_jeton`, ni de
`commandes_declarees`). C'est le correctif direct du défaut que ce module
avait déjà nommé « la pire forme de dette » : afficher « Budget max : 5 $ »
et « Écrivains : 1 » sans qu'aucun code ne les applique. Le tableau de bord
affiche désormais « 5 $ · non appliqué (lecture seule) », plus le motif
(`ecriture_raison`), quand l'écriture n'est pas active.

> ⚠️ **Corrigé par `bug-012`** : `ecriture_active` valait `Jeton.actif()` —
> « un jeton est-il configuré ? » — pas « CE demandeur-ci peut-il écrire ? ».
> En local sans jeton, l'écriture fonctionnait déjà et le champ annonçait
> pourtant `false`. Il est désormais calculé **par requête**, sur la même
> base que la garde réelle. Détail dans la section suivante.

### Étape D+ (`bug-012`) — le jeton dépend du déploiement, pas de la route

Sous ADR-0020, le jeton n'est plus attaché au **type de route** (lecture ou
écriture) mais au **déploiement** : `127.0.0.1`/`localhost`/`::1` → jeton
facultatif, lecture et écriture ; au-delà → jeton obligatoire, **lecture
comprise**. Avant ce cycle, `0.0.0.0` démarrait avec un simple avertissement
sur la seule écriture, et `GET /api/etat` répondait `200` à quiconque sur le
réseau local — quatorze champs, toute l'activité de développement, sans
secret.

- **La détection est faite sur l'adresse SOURCE de la requête**
  (`client_address[0]`), jamais sur `[serveur].hote` : `0.0.0.0` sert aussi
  la boucle locale, et une requête qui arrive par elle doit être traitée
  comme locale même si le serveur écoute au-delà.
- **`Host` est validé sur toutes les routes** (littéral IP ou `localhost`,
  jamais une résolution DNS qui pourrait s'intercaler) → `421` sinon.
- **`Origin` / `Sec-Fetch-Site`** sont vérifiés sur les routes d'écriture
  avant le jeton, pour renvoyer un `403` d'origine plutôt qu'un `401` — sans
  jamais laisser une requête cross-site déclencher une écriture.
- **Deux champs distincts sur `/api/etat`, tous deux recalculés à chaque
  appel** :
  - `ecriture_active` — « ce demandeur-ci peut-il écrire ? ».
  - `jeton_requis` — « ce déploiement exige-t-il un jeton pour ce
    demandeur ? », indépendamment du fait que la requête en cours en porte
    un. C'est ce champ que le navigateur utilise pour distinguer « suis-je
    autorisé » de « le flux temps réel peut-il s'authentifier » —
    `EventSource` ne pouvant porter aucun en-tête (`web/app.js`, `modeAuth`).
- **`Content-Security-Policy: frame-ancestors 'none'`** est posé sur `/`.
- **En lecture** (`GET`, `_autorisation_lecture`), le freinage (`429`) ne
  compte **que** les jetons **présents et faux** — une requête distante sans
  jeton du tout ne l'alimente pas, pour ne pas aggraver le périmètre déjà
  connu de `bug-010`.
  ⚠️ **Faux en écriture** (`POST`, `do_POST`) : `enregistrer_echec()` y est
  appelé que le jeton soit absent ou faux (`server.py:924-925`), sans la
  garde `if presente:` que porte la branche de lecture. Établi par exécution
  pendant l'audit de sécurité de `feature-010` : 20 `POST` distants sans
  en-tête, puis une requête depuis `127.0.0.1` munie du jeton valide → `429`,
  aussi bien en lecture qu'en écriture. Le test qui garde cette propriété
  (`test_server_bug012.py:277-297`, cas `T7`) ne couvre que la lecture — un
  cas T7 symétrique côté écriture n'existe pas. **Non corrigé ici** : le
  comportement relève de `bug-010`, déjà ouvert ; cette ligne documentait un
  invariant plus large que ce que le code garantit réellement.

**Ce que ce correctif a mis au jour**, consigné parce que ça ne se relit pas
dans le code : quatre tests de la suite précédente certifiaient l'ancien
modèle (`ecriture_active is False` affirmé juste avant un `POST` qui rendait
`202`) ; plusieurs suites dépendaient silencieusement du `control-center.toml`
local — vertes en CI (fichier gitignoré, donc absent) et rouges chez tout
développeur ayant configuré un jeton, sans jamais le prouver dans les deux
sens.

### Ce que cette étape ne couvre pas, assumé

- Un orphelin est **détecté** (`409` au redémarrage) mais **aucun chemin** de
  l'interface ne le reprend — `/api/interrompre` répond `404` dans ce cas.
  Reporté en `bug-011`.
- Le freinage des échecs d'authentification (`429` au-delà de 20 échecs par
  minute) reste **global**, pas par IP : 20 jetons faux distants privent
  **tout le monde** pendant 60 s, y compris le développeur local muni d'un
  jeton valide — lecture comprise. Périmètre **élargi** par `bug-012` et
  reporté en `bug-010`.
- Le début d'une sortie de plus de 200 000 octets est perdu (tampon
  circulaire) — seule la fin est conservée, la troncature est annoncée.
- La détection d'orphelin par `starttime` suppose `/proc` (Linux) ; elle est
  inopérante, mais sûre (verrou traité comme libre), sur un système qui ne
  l'a pas.
- Détection de mode (`modeAuth`) au rechargement quand le flux échoue pour
  une autre raison que l'authentification ; `int(Content-Length)` et
  `int(depuis)` peu tolérants (`+12`, ` 12 `, `1_2`) ; les traces
  `ConnectionResetError` verbeuses émises quand un navigateur ferme une
  connexion maintenue (bénignes, mais bruyantes) — constats reportés, specs à
  ouvrir.

Le détail des décisions et alternatives écartées (SSE pour la sortie, sort
du processus fils) est dans
[ADR-0019](../docs/adr/0019-jeton-comme-unique-barriere-et-table-des-routes-fermee.md) ;
le modèle de déploiement et le jeton comme barrière de rattachement sont dans
[ADR-0020](../docs/adr/0020-un-centre-de-controle-appartient-a-un-developpeur.md).

## Étape E — la création de spec

Deux routes ([`backend/redaction_spec.py`](backend/redaction_spec.py)),
ajoutées à `_ROUTES_ECRITURE` (désormais quatre chemins) :

- `POST /api/spec/brouillon` — reçoit `{type, titre, texte, minimal}`,
  **n'écrit rien**, rend un brouillon fabriqué depuis le **template du
  projet** (`specs/features/_template.md` ou `specs/modele.md`, jamais une
  copie interne au centre de contrôle).
- `POST /api/spec/ecrire` — reçoit `{type, titre, contenu}` et écrit
  `contenu` **verbatim** dans `specs/features/todo/`, jamais ailleurs.

### Aucun appel de modèle

Le brouillon est le template du projet recopié **octet pour octet**, à
l'exception d'un nombre borné de substitutions déterministes (slug, type,
statut, date, titre H1, texte saisi). Tout ce que le texte ne permet pas de
déduire reste `[remplir]` : un blanc visible vaut mieux qu'une invention
plausible. Le texte saisi ne quitte donc jamais le poste, et le plafond de
dépense de `feature-007` est sans objet ici. Détail et alternative écartée
(un appel de modèle) dans
[ADR-0027](../docs/adr/0027-le-centre-de-controle-ecrit-des-specs-il-n-en-valide-aucune.md).

### Le contenu relu est écrit verbatim, jamais régénéré

`/api/spec/ecrire` écrit exactement le Markdown transmis par le client — la
relecture humaine, corrections comprises. `type` et `titre` restent des
champs JSON dédiés, re-validés et re-dérivés (le slug, donc le chemin, vient
toujours de `titre`, jamais de `contenu`) : le contenu, lui, n'est jamais
interprété pour construire un chemin. Une première version de ce module
régénérait le contenu depuis `{titre, texte}` et jetait silencieusement
toute correction humaine — corrigé en cours de cycle (voir le journal de
`specs/features/done/feature-008-creation-de-spec-depuis-un-prompt.md` et
[ADR-0027](../docs/adr/0027-le-centre-de-controle-ecrit-des-specs-il-n-en-valide-aucune.md)).

### Numérotation et confinement

Le numéro (`NNN`) n'est attribué **qu'à l'écriture**, jamais dans le
brouillon : deux brouillons consécutifs sans rechargement ne se disputent
jamais un numéro qui n'existe pas encore. Il est calculé sous un `flock`
court dédié (`var/numerotation.lock`), tenu seulement le temps de scanner
les trois répertoires du cycle (`todo`, `doing`, `done`) et d'écrire le
fichier — jamais le temps d'une requête réseau — puis attribué par
`os.O_CREAT | os.O_EXCL` **dans** ce même verrou. Ce module n'utilise **pas**
le verrou d'écrivain de `feature-007` (`verrou.py`) : voir
[ADR-0027](../docs/adr/0027-le-centre-de-controle-ecrit-des-specs-il-n-en-valide-aucune.md)
pour le motif.

La cible d'écriture est calculée depuis la configuration seule —
`join(racine_projet, [specs].racine, colonnes()[0][0])`, la **première
colonne configurée** (pas littéralement `todo`) — puis revérifiée par
`vcs.chemin_sur()` avant toute écriture. Le nom de fichier est normalisé par
liste blanche de caractères (`normaliser_slug`) : un titre `../../etc/passwd`
devient `etc-passwd`, sans jamais produire de fichier hors du répertoire
cible.

### Bornes de corps par route

`_TAILLES_MAX_CORPS` fixe une borne par route, distincte du défaut
(4096 octets, inchangé pour `/api/lancer` et `/api/interrompre`) :

| Route | Borne |
|---|---|
| `/api/spec/brouillon` | 8192 octets |
| `/api/spec/ecrire` | 65536 octets — 1,93× la plus grande spec mesurée dans ce dépôt (33 212 octets) |

### Ce que le serveur ne valide jamais sur `/api/spec/ecrire`

L'escalade fail-closed vers le template complet (un mot-clé sensible annule
toujours une dérogation vers le minimal, jamais ne l'accorde) n'agit que sur
le **brouillon**. `/api/spec/ecrire` accepte un `contenu` arbitraire, non
validé contre un gabarit ou les cases GATE : la garde réelle reste la
relecture, par `spec-reader` et par l'humain, jamais le serveur. Voir
[ADR-0027](../docs/adr/0027-le-centre-de-controle-ecrit-des-specs-il-n-en-valide-aucune.md).

## Étape H — les actions du backlog

`feature-025`, absorbée dans le cycle 2 de `feature-021` (lots 9-10) ; GATE
`security-reviewer` P1 sur le design (**GO sous 8 conditions** pour lancer,
**sous 12** pour modifier/supprimer), puis P2 sur le diff réel — trois
défauts trouvés et corrigés avant merge (voir
[ADR-0040](../docs/adr/0040-les-chemins-decriture-du-cockpit.md) §2).
Trois routes neuves ([`backend/gestion_spec.py`](backend/gestion_spec.py)),
ajoutées à `_ROUTES_ECRITURE` :

- `POST /api/spec/lancer {cle, spec_id}` — lance un cycle **pour une spec
  désignée**, distincte de `/api/lancer` qui ne connaît qu'une clé.
  `spec_id` ne construit jamais un chemin : résolu par égalité stricte
  contre les specs réellement découvertes, confiné deux fois. Seule la
  **première colonne** (position, jamais un nom codé en dur — ADR-0003) est
  éligible ; `409` sur les autres. `cle` reste choisie dans `[commandes]`
  (ADR-0005) ; `spec_id` s'insère par substitution d'un placeholder déclaré
  `"{spec_id}"`, présent exactement une fois dans l'`argv` de la commande.
- `POST /api/spec/modifier {spec_id, empreinte, contenu}` — compare-and-write
  atomique : `empreinte` (SHA-256, rendue par `GET /api/spec?id=…`) doit
  concorder avec le contenu relu sous un verrou court, sinon `409`, fichier
  intact.
- `POST /api/spec/supprimer {spec_id, confirmation_nom}` — la **seule**
  route destructive du cockpit. Confirmation nommant exactement la spec ;
  refuse (`409`, motif dit) toute spec non suivie par git ou modifiée
  localement, faute de quoi le plan de retour arrière serait inapplicable
  (`git rm` rend `rc 128` sur un fichier non suivi, mesuré) ; sur une spec
  suivie et propre, la réponse porte le plan **exécutable tel quel**
  (`git checkout <sha HEAD> -- <chemin>`), jamais exécuté par ce serveur
  lui-même (Règle absolue n°4).

`role != "premiere"` refuse en fail-closed sur la suppression, plutôt qu'une
énumération des rôles interdits. Détail complet, les trois défauts trouvés
par le GATE P2 (garde vivante pour un seul écrivain, oracle qui s'accorde
avec lui-même, confinement jamais éprouvé sur un lien symbolique réel) et
leurs correctifs : [ADR-0040](../docs/adr/0040-les-chemins-decriture-du-cockpit.md) §2.

## Étape I — la conversation permanente avec l'agent en cours

`feature-022`, absorbée dans le même cycle (lot 11). Premier passage GATE :
**NO GO tel quel** — pas parce que la capacité ajoutait un risque nouveau
(« `PUT` + `lancer` donnent déjà, à eux deux, la capacité d'instruire
arbitrairement un agent qui a un shell et l'identité git du développeur »),
mais parce que la conception initiale du canal ne tenait pas ses propres
garanties. Redessinée par `architect` (protocole d'entrée, canal de
réponse, sémantique du `202`), elle repasse en GATE et obtient **GO sous
13 conditions** (`S3.1` à `S3.13`).

- `POST /api/conversation {texte}` — écrit un message sur le canal
  `json-lines` du lancement en cours qui l'accepte. Le protocole d'entrée
  (`"aucune"` par défaut, ou `"json-lines"`) est **déclaré dans
  `[commandes.cle]`**, jamais un champ de requête : un porteur du jeton ne
  peut ouvrir un canal que sur une commande qui le déclare dans la
  configuration. Bornes appliquées dans l'ordre : forme du corps (`400`) →
  taille en caractères (`413`, avant toute écriture) → caractères de
  contrôle interdits (`422`) → destinataire (`404` si aucun lancement
  `json-lines` actif) → journalisation (`500` si impossible, **avant**
  l'écriture sur le canal) → écriture (`503` si occupé/corrompu/
  indisponible) → `202` (« tube vidé, message écrit entier », pas
  « traité »).
- `GET /api/conversation` — le fil **persistant** des messages
  **utilisateur** du lancement en cours (`var/conversations/<pid>.jsonl`,
  hors dépôt, non versionné) ; les réponses de l'agent restent dans le
  tampon circulaire de `/api/lancement`, jamais recopiées ici.

La capacité du tube (`F_SETPIPE_SZ`, posée après `Popen`, 262 144 octets
mesurés côté fils) et l'enveloppe pire cas du message (dérivée du
sérialiseur réel, jamais recopiée d'un rapport — 3,0× d'écart mesuré selon
le seul drapeau `ensure_ascii`) sont détaillées dans
[ADR-0040](../docs/adr/0040-les-chemins-decriture-du-cockpit.md) §3, avec
l'hypothèse de segment de confiance dont dépend toute cette surface.

### Étape I+ (`feature-026`) — la session Claude remote persistante remplace la cible par défaut

Ce qui précède décrit le canal **`json-lines`** d'un lancement du cockpit —
**inchangé**, et il reste la bonne porte pour une commande lancée par le
cockpit qui accepte `--input-format stream-json`. Mais aucune commande
réelle du projet ne déclare cette entrée (`demo`/`lent` sont des exemples) :
`GET /api/conversation` rendait donc `404` en permanence, et le panneau
affichait « Hors ligne ».

`feature-026` rebranche les deux routes sur une **autre** cible, décidée par
la configuration (jamais par la requête, `ADR-0005`) : `[session]` (`nom`,
`socket_tmux`, `repertoire_transcripts` — voir `control-center.example.toml`).
**Déclarée**, elle prend le pas sur l'ancien canal — `config.session_config()`
rend `None` dès que l'un des trois réglages manque, et le comportement
`feature-022` ci-dessus reste alors **strictement inchangé**. **Non
déclarée** (le cas par défaut), rien ne change.

Quand elle est déclarée, `session_tmux.py` tape dans le **pty d'une session
tmux persistante** qui tourne déjà, en dehors du cockpit — démarrée par
systemd (`claude-remote-kit.service`, [ADR-0036](../docs/adr/0036-une-session-distante-se-releve-seule-plafonnee-au-pic-mesure.md)),
déjà authentifiée, déjà pilotée depuis un autre terminal. Le pourquoi de ce
choix (parler à un processus qu'on ne détient pas plutôt qu'en ouvrir un
second sous OAuth) et les neuf puis quatre conditions du GATE sont dans
[ADR-0042](../docs/adr/0042-parler-a-une-session-quon-ne-detient-pas.md).

- `GET /api/conversation` (session déclarée) rend `{messages, tronque, etat,
  session_id, session_id_source, session_id_divergence, destinataire}`.
  `etat` ∈ `"En ligne"`, `"Hors ligne"` (`404`), `"Injoignable"` (`503`) —
  **trois** états, pas quatre : `"Occupée"` a été retiré de la pastille en
  cours de cycle (voir plus bas), l'information « Claude travaille » vivant
  désormais dans le fil, jamais dans le badge. Le fil vient de
  [`backend/fil.py`](backend/fil.py) (filtre positif sur `type`, lecture
  bornée en octets/messages/caractères, jamais le fichier entier), **fusionné**
  avec le journal propre du cockpit — un message dont `envoye` vaut `false`
  (refusé) n'entre jamais dans la fusion, pour ne jamais afficher un message
  qui n'est, en réalité, jamais parti.
- `POST /api/conversation {texte}` (session déclarée) tape le texte via
  `load-buffer`/`paste-buffer -p`/`Enter` — jamais par l'argv de
  `send-keys -l`, lisible dans `ps`. Refusé (`422`) si le texte porte un
  caractère de contrôle, DEL, un C1, ou si une ligne commence par `/` ou
  `!` (irréversibilité : `/exit`/`/clear` ne se rattrapent pas depuis le
  cockpit, `/resume` n'existant pas en Remote Control). `409` — toujours
  qualifié d'**heuristique**, jamais d'une garantie — quand aucun compositeur
  n'est identifiable (dialogue, écran de confiance) ou qu'un brouillon y est
  déjà présent ; **pas** quand la session est simplement occupée : mesuré,
  un texte tapé pendant que `claude` travaille est **mis en file** par
  `claude` lui-même, jamais perdu ni corrompu.
- Chaque message tapé par le cockpit est **journalisé avant l'envoi**, avec
  son `destinataire` explicite (`"session tmux '<nom>'"` ou, sur l'ancien
  canal, `"lancement '<cle>' (pid <pid>)"`) : le transcript seul ne permet
  pas de distinguer un message tapé par le cockpit d'un message venu d'un
  autre terminal (téléphone, `tmux attach`).

## Étape J — les tokens par passage d'agent

`feature-023`, absorbée dans le même cycle (lot 12) ; modèle de menace
**distinct** de H et I — une lecture seule, hors racine du dépôt, jamais une
route d'écriture. GATE P1 : **GO sous 7 conditions** (`S5.1` à `S5.7`).

[`backend/transcripts.py`](backend/transcripts.py) lit les transcripts de
sous-agent sous `~/.claude/projects/<projet encodé>/<session>/subagents/
agent-<id>.jsonl` pour en extraire **deux compteurs entiers par
`agent_id`** — `input_tokens`, `output_tokens` — et rien d'autre : ni
message, ni chemin, ni extrait de texte. `usage` porte sept clés non
entières mesurées sur un vrai transcript (`cache_creation`,
`inference_geo`, `iterations`, `output_tokens_details`, `server_tool_use`,
`service_tier`, `speed`) ; un filtre **positif et typé** les exclut toutes.
Racine confinée au projet courant, calculée depuis l'environnement seul ;
`agent_id` validé par motif hexadécimal avant d'entrer dans un chemin,
reconfiné par `vcs.chemin_sur()`. Budget de temps et d'octets par
instantané : au premier dépassement, `partiel` devient vrai plutôt que de
relire jusqu'à 270 Mo à chaque signal SSE. Un `agent_id` sans transcript
lisible est **absent** du résultat, jamais un zéro. Le mécanisme complet,
ses sept conditions et les alternatives écartées (dont l'appel à `claude
auth status`) : [ADR-0041](../docs/adr/0041-lecture-hors-racine-compteurs-seulement.md).

Le chiffre est exposé dans `/api/etat.tokens_par_passage`, additif — le
frontend en tolère l'absence (backend plus ancien) et ne l'utilise jamais
pour piloter l'anneau d'activité du disque, qui reste fonction de l'état
seul.

## Tests

```bash
python3 control-center/hooks/test_record_event.py         # 19 cas
python3 control-center/backend/test_specs.py               # 16 cas
python3 control-center/backend/test_agents.py               # 24 cas
python3 control-center/backend/test_events.py               # 71 cas
python3 control-center/backend/test_config.py               # 61 cas
python3 control-center/backend/test_vcs.py                  # 26 cas
python3 control-center/backend/test_server.py                # 47 cas
python3 control-center/backend/test_jeton.py                 # 62 cas
python3 control-center/backend/test_verrou.py                # 23 cas
python3 control-center/backend/test_lanceur.py               # 33 cas
python3 control-center/backend/test_server_ecriture.py       # 109 cas
python3 control-center/backend/test_server_bug012.py         # 66 cas
python3 control-center/backend/test_redaction_spec.py        # 93 cas — étape E
python3 control-center/backend/test_ci_decouverte.py         # 4 cas — bug-018/019, se saute en non-root (voir plus bas)
python3 control-center/web/test_app_bug012.py            # 53 cas (pont vers le harnais JS)
python3 control-center/web/test_app_accordeon.py         # 236 cas (pont vers le harnais JS)
python3 control-center/web/test_app_navigation.py        # 197 cas (pont vers le harnais JS)
python3 control-center/web/test_app_navigation_http.py   # 25 cas
python3 control-center/web/test_app_theme.py             # 317 cas (pont vers le harnais JS)
python3 control-center/web/test_app_theme_navigateur.py  # 56 cas
python3 control-center/web/test_app_diagramme.py         # 165 cas (pont vers le harnais JS)
python3 control-center/web/test_app_diagramme_conformite.py   # 51 cas
python3 control-center/web/test_app_diagramme_navigateur.py   # 37 cas
python3 control-center/web/test_app_feature008.py        # 58 cas (pont vers le harnais JS) — étape E
python3 control-center/backend/specs.py             # inventaire réel
python3 control-center/backend/events.py            # workflows reconstruits
```

**Lancer la suite sous un utilisateur NON-root** (bug-018 : root lit un
fichier que son mode interdit à tout autre utilisateur — « vert en local,
rouge en CI » est resté invisible sept runs de suite pour cette raison) :

```bash
sudo ./tools/lancer_suite_control_center_non_root.sh
```

Travaille sur un clone jetable, jamais sur l'arbre de travail ; voir
`control-center/PIEGES.md` §43. ⚠️ **Limite connue, pas un échec** : le
script clone `control-center/` et trois chemins déclarés, **jamais
`.gitlab/` ni `.github/`** — `test_ci_decouverte.py`, qui lit les fichiers de
CI des deux forges, s'y **saute donc toujours proprement** (0 cas). C'est
tout l'écart entre le compte mesuré en root et celui mesuré en non-root.

**1887 cas verts au total sur ces vingt-quatre suites en root** (mesure
directe, 2026-09-20 ; **1883** sous un utilisateur non-root, écart de 4 dû à
`test_ci_decouverte.py` ci-dessus ; 1817 cas / 23 fichiers avant `bug-018`,
1627 cas / 21 fichiers avant `feature-008`, 471 cas / 13 suites avant
`feature-020` — les chiffres précédents étaient restés inscrits ici sans
être remesurés, PIEGES §21).

**Le harnais frontend** (`web/test_app_bug012.js`) teste `web/app.js` en
conditions réelles — 39 assertions, zéro dépendance installée (`vm`/`fs`/`path`
de la bibliothèque standard Node, ADR-0006). `web/test_app_bug012.py` est le
**pont** que la CI découvre : `find control-center -name 'test_*.py'` ne
ramasse jamais un `.js` seul. Le pont ne contient aucune assertion, il relaie
la sortie et le code de sortie du harnais — et **se saute proprement** (code
0, message explicite) si `node` est introuvable sur la machine qui exécute
les tests, Node n'étant une dépendance que de ce harnais, jamais du centre de
contrôle lui-même.

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

**Étape D** (`jeton.py`, `verrou.py`, `lanceur.py`, `server.py` — 371 cas
verts au total, 195 avant ce lot) : les mutations trouvées par exécution
sont documentées au plus près du code qu'elles concernent, pas dupliquées
ici — voir en particulier `verrou.py` (course entre huit threads sur la
prise du `flock`, mesurée à un seul verrou pris à chaque fois), `lanceur.py`
(`tuer_immediatement` face à un double `waitpid` qui avalait un `ECHILD` en
inventant un code de retour 0, et la fenêtre de 0,41 ms entre la naissance
du fils et l'assignation du verrou avant `demarrer_lecture()`), et
`jeton.py` (le mutant qui remplacerait `hmac.compare_digest` par `==` est
**équivalent** sur toute sortie observable en test : c'est un temps de
réponse qu'aucune assertion fonctionnelle ne peut faire mourir, documenté
comme tel plutôt que compté comme tué). Deux défauts ont été trouvés en fin
de cycle par cette même discipline d'exécution, pas par relecture : la
garde de permissions du jeton comparait des **nombres** (`permissions >
0o600`) au lieu de masquer des **bits** — un jeton en `0o077` activait
l'écriture — et le thread de lecture démarrait avant l'assignation du
verrou, pouvant laisser un `409` permanent nommant un processus déjà mort.
Les deux sont corrigés dans le code livré par ce lot.

Un mutant du collecteur est **équivalent** et doit rester documenté comme tel :
rendre une chaîne vide au lieu de `None` quand aucun jeton n'est sûr ne change
rien, parce que l'appelant teste la valeur pour sa vérité. Ce n'est pas un trou
de couverture, et le compter comme tué ferait pourrir le décompte.

**`bug-012`** (jeton dépendant du déploiement, la suite passe de 371 à 451
cas, 80 nouveaux dont 39 dans le harnais frontend) — quatre points établis en
cours de cycle, pas par relecture :

1. **Quatre tests hérités certifiaient l'ancien modèle** : écrits quand
   `ecriture_active` valait `Jeton.actif()` (« un jeton est-il configuré ? »),
   ils en étaient devenus les gardiens — l'un affirmait `ecriture_active is
   False` trois lignes avant un `POST` qui rendait `202`. Corrigés pour
   affirmer sur `_peut_ecrire()`, la garde réellement appliquée.
2. **Plusieurs suites dépendaient silencieusement du `control-center.toml`
   local** : vertes en CI (fichier gitignoré, donc absent) et rouges chez tout
   développeur ayant configuré un jeton — vertes exactement là où elles ne
   prouvaient rien.
3. **Le harnais frontend avait été rapporté sans être livré** dans un cycle
   antérieur : 39 assertions exécutées dans un environnement jetable,
   absentes de l'arbre versionné. Il est désormais dans `web/test_app_bug012.js`,
   avec son pont Python, et fait partie des 13 suites découvertes en CI.
4. **`modeAuth` confondait deux questions** — « suis-je autorisé » et « le
   flux temps réel peut-il s'authentifier » — ce qui figeait le tableau de
   bord à chaque rechargement en déploiement distant. Séparé en deux champs
   (`ecriture_active`, `jeton_requis`), voir la section « Étape D+ » ci-dessus.

**`feature-008`** (création de spec depuis un prompt, `redaction_spec.py` +
deux routes de `server.py` — la suite passe de 1627 à 1817 cas sur le dépôt,
21 à 23 fichiers `test_*.py`) : dix mutations posées une par une en fin de
cycle, dix tuées. Deux défauts trouvés par exécution, pas par relecture :

1. **Le contenu relu était régénéré, jamais écrit tel quel** — une première
   version de `ecrire_spec` reconstruisait le Markdown depuis `{titre,
   texte}` au lieu d'écrire le `contenu` transmis par le client, ce qui
   jetait silencieusement toute correction humaine faite dans le textarea
   de relecture. Le défaut a d'abord **survécu** à deux tests qui
   cherchaient une simple sous-chaîne (la correction réapparaissait dans la
   section régénérée, donc la sous-chaîne restait présente) ; il n'a été
   tué qu'après un remplacement par une égalité octet pour octet entre le
   contenu envoyé et le fichier écrit.
2. **`os.open(O_EXCL)` précédait l'encodage UTF-8 du contenu** : un
   substitut isolé (`"\ud800"`, JSON valide) levait `UnicodeEncodeError`
   **après** la création du fichier, laissant un fichier vide sur disque et
   un numéro brûlé. Corrigé en encodant avant l'ouverture ; une saisie
   inencodable rend désormais `422`, sans créer de fichier ni consommer de
   numéro.

Une garde de confinement — le chemin final doit résoudre exactement à
`<specs.racine>/<première colonne>/<nom>` — **survivait** à une mutation
`if False:` sur toute la fonction qui l'applique (1803 cas encore verts) :
elle fonctionnait, vérifiée à la main, mais aucun test ne la tenait. Elle
est désormais couverte en symlinkant `todo/` hors du dépôt jetable. Deux
autres gardes non couvertes ont été trouvées par la même démarche
systématique (`preparer_brouillon`, `ecrire_spec` sur `slug_valide`) et
couvertes de même. Un concours de huit threads réels sur une barrière
(HTTP complet, pas un appel direct à deux threads) confirme huit `201` et
huit numéros distincts.

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
