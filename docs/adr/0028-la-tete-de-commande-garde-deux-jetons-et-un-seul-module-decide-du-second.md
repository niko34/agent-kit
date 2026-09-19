# ADR-0028 — La tête de commande garde deux jetons, et un seul module décide du second

## Statut

Accepté

## Date

2026-09-19

## Contexte

`bug-014` : la garde de rédaction du collecteur d'événements
(`hooks/record-event.py`, `_command_head()`) laissait fuir un mot de passe
**entièrement en minuscules** — une passphrase, un mot du dictionnaire — dans
le champ public `command_head`, journalisé en 0644 et servi au navigateur
(`_CHAMPS_PUBLICS`, `server.py`). C'est le **troisième** passage sur cette
même fonction (après un premier défaut trouvé sur le tout premier événement
réel, et `bug-012`) : les deux précédents fermaient l'exemple cité, jamais la
classe — un chiffre ou une majuscule dans le faux secret de test suffisait à
« prouver » la fermeture, sans qu'aucun test n'exerce la forme entièrement
minuscule qui donne son titre au bug.

Un mot de passe en minuscules est **lexicalement indiscernable** d'une
sous-commande légitime (`git status`, `npm run`, `docker ps`) : aucun motif
sur la seule forme du second jeton ne peut fermer la classe sans perdre soit
de la sécurité, soit de l'observabilité.

Deux options étaient proposées par la spec, une troisième a émergé en
conception :

- **Option A (littérale)** — second jeton limité à une option d'**une seule
  lettre** (`^-[A-Za-z]$`), et mot nu retenu seulement derrière une liste
  fermée de programmes à sous-commande.
- **Option B** — ne journaliser que le **premier** jeton, partout.
- **Option A′ (retenue)** — second jeton accepté sous trois formes bornées
  (option courte 1-2 lettres, option longue, mot nu derrière un programme à
  sous-commande connu), les deux écrivains (`record-event.py` et
  `backend/server.py`/`config.py`) appelant désormais la **même** fonction.

## Décision

**Variante A′.** Second jeton accepté si et seulement si :

1. option courte : `-` + 1 ou 2 lettres (`-e`, `-rn`, `-la`) ;
2. option longue : `--` + lettres/tirets (`--json`, `--max-budget-usd`) ;
3. mot nu en minuscules, **sans chiffre**, et le premier jeton de la commande
   figure dans une liste fermée de programmes à sous-commande (`git`, `gh`,
   `pio`, `npm`, `docker`, `pip`) — liste mesurée contre les journaux réels du
   kit et du firmware, pas devinée.

Portée par un module neuf et unique, `hooks/redaction_commande.py`
(`command_head()`), importé sous enveloppe par le hook et appelé directement
par `backend/config.py`/`backend/server.py`.

### Motif du refus d'A littérale

Coût mesuré sur l'instantané figé du cycle (13 356 lignes, 7 909 têtes,
365 formes distinctes) :

| variante | occurrences perdues | % |
|---|---|---|
| **A′ (retenue)** | **776** (719 mots nus + 57 options ≥3 lettres) | **9,81 %** |
| A littérale (`^-[A-Za-z]$`) | 1 019 | 12,9 % |
| B (premier jeton seul) | 4 655 | 58,9 % |

A littérale coûte 1 019 occurrences pour ne fermer aucune forme
supplémentaire que A′ ne ferme déjà : elle détruit en plus des grappes de
drapeaux légitimes largement utilisées (`grep -rn`, `ls -la`, `rm -rf`,
`find -iname`, `ss -ltnp`…) sans gain de sécurité mesurable, la borne à une
seule lettre n'apportant rien contre la classe visée (une valeur collée d'un
seul caractère reste le résidu assumé d'A′ également).

### Motif du refus d'Option B — mesuré, pas supposé

B ne se contente pas de perdre de l'information : sur la configuration réelle
du projet, `config.tetes_de_commande() == {'python3 -c'}`, et le journal
réel porte **44** événements `command_head == "python3 -c"`. Sous B
(`tetes == {'python3'}`), le compte ne tombe **pas à zéro** — il monte à
**371**, dont 327 sont des `python3 script.py` ad hoc jamais lancés via une
commande configurée. **Sur-comptage d'un facteur 8,4** : B ne se contente pas
de perdre 58,9 % de l'information (4 655 occurrences), elle transforme une
clé étroite et fiable en machine à faux positifs — plus grave qu'une remise
à zéro, qui au moins se serait vue.

### Contrainte n°4 du hook (« il ne connaît rien du projet ») — arbitrée

Une liste de programmes **génériques** (`git`, `npm`, `docker`, `pip`, `gh`,
`pio`) n'est pas une connaissance « du projet » : ces noms sont identiques
dans le template et dans tout projet qui l'instancie. Trois garde-fous
inscrits dans le module et dans l'en-tête du hook :

1. la liste ne contient que des **premiers jetons** (noms de programmes),
   jamais de sous-commandes ;
2. critère d'admission écrit pour toute entrée future : un programme dont le
   second jeton est **toujours** un verbe du programme lui-même, jamais une
   donnée saisie par l'utilisateur ;
3. **défaut sûr** : un programme absent de la liste perd simplement son
   second jeton, il ne fait jamais fuir davantage — une liste incomplète
   coûte de l'observation, jamais de la sécurité.

### D3 — `_lancer()` passe par la même rédaction

`_lancer()` (`server.py`) journalisait `" ".join(argv[:2])` sans passer par
aucune garde. `argv` vient d'une liste de commandes fermée par clé
(`config.commande(cle)`, `ADR-0005`) — rien du réseau ne l'atteint
directement — **mais** `control-center/control-center.toml` **n'est pas
versionné** (`.gitignore`) : c'est un fichier local, jamais relu en revue.
Une entrée locale telle que
`deploiement = ["env", "POOL_PASSWORD=x", "./ota.sh"]` produisait, avant ce
correctif, `command_head = "env POOL_PASSWORD=x"` — écrit en 0644 et servi au
navigateur, exactement la fuite que la garde du hook existe pour empêcher.
**Décision : `_lancer()` passe désormais par `command_head()`, comme le
hook.** Sans cette décision, la garde livrée par ce cycle est inatteignable
sur la moitié de ses écrivains ([ADR-0017](0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md)).
Corollaire vérifié sans effet sur la configuration réelle du projet :
`command_head("python3 -c")` reste `"python3 -c"` — zéro impact sur les
lignes déjà journalisées, zéro changement d'affichage pour l'existant.

### D4 — module unique, import enveloppé, repli fermé

- `record-event.py` porte un tiret dans son nom : non importable comme
  module Python, un fichier tiers est de toute façon nécessaire.
- Le hook importe `redaction_commande` **sous enveloppe**
  (`try/except BaseException`, couvrant l'import lui-même, pas seulement
  `main()`) : un module absent, une syntaxe cassée, une fonction manquante ou
  un fichier illisible font sortir le hook en code 0, la ligne écrite **sans**
  `command_head` — jamais un import qui plante la session.
- Repli d'import : `command_head = lambda _c: None`, **jamais** une seconde
  copie de la règle — une règle qui a déjà dérivé trois fois entre deux
  copies n'en a pas besoin d'une troisième. `None` fait disparaître le
  champ ; un déploiement cassé devient visible plutôt que de fuir en
  silence ; un module manquant ne peut jamais faire fuir *plus*.
- `hooks/` est **ajouté en fin** de `sys.path` (`append`), jamais inséré en
  tête devant `backend/` (déjà en position 0-1 côté `server.py`).
- `backend/config.py`, exécuté seul (diagnostic CLI), porte son propre ajout
  de `sys.path` et importe le module **sans enveloppe** : si `hooks/`
  manque, le serveur ne démarre pas — échec visible côté serveur, pas une
  perte silencieuse côté hook.

## Conséquences

### Positives

- Une seule règle, un seul endroit où elle peut dériver — les deux écrivains
  (`hooks/record-event.py`, `backend/server.py`/`config.py`) ne peuvent plus
  diverger l'un de l'autre.
- Coût d'observation chiffré et borné (9,81 %, 776 occurrences sur
  l'instantané mesuré), très inférieur aux deux alternatives.
- Défaut sûr à trois niveaux : programme absent de la liste, import du
  module en échec, fichier illisible — aucun de ces cas ne fait fuir plus
  que la version d'avant.

### Négatives

- Deux résidus restent, assumés par écrit et non fermés : une option longue
  à valeur collée sans séparateur (`--passwordx`), et un chemin comme
  premier jeton après un décalage de position (`A=b /etc/shadow`). Voir
  `redaction_commande.py` pour le détail et la mesure qui les borne.
- La liste `_PROGRAMMES_A_SOUS_COMMANDE` demande une revue chaque fois qu'un
  nouveau programme à sous-commande entre dans l'usage courant du projet —
  sans quoi son second jeton est simplement perdu (jamais un risque de
  sécurité, un coût d'observation).

### Ce que ça verrouille

- Le contrat de `command_head()` : deux jetons au plus, le second sous
  exactement trois formes. Toute évolution future de la classe de secrets à
  fermer passe par ce module, pas par une garde locale à l'un des deux
  écrivains.
- `_lancer()` et `tetes_de_commande()` doivent rester d'accord : ils
  appellent la même fonction sur `" ".join(argv)`, et toute divergence future
  romprait `tete in suivies` (`events.py`).

## Réserve du reviewer sur l'oracle de validation — à ne pas sur-déclarer

La revue de code (étape 8bis) a validé le correctif par un **oracle** :
un jeton de sortie n'est légitime que s'il est (1) le vrai premier jeton de
la commande, quelle que soit sa forme, (2) une option, (3) un chemin
(`/`, `./`, `../`), ou (4) un mot nu en position 2 **réelle**, derrière un
programme listé, sans aucun écart avant lui — puis une énumération
**exhaustive** de 1 082 400 commandes (longueur 1 à 4, alphabet de 32
jetons), dont **zéro** produit un jeton hors de cet oracle.

**Cette énumération prouve la conformité règle↔code, pas l'absence de
fuite.** Les clauses (2) et (3) promeuvent en « légitimes » exactement les
deux résidus assumés ci-dessus (`--passwordx`, `/hunterpass` après
décalage) : par construction, aucune énumération bâtie sur cet oracle ne
peut jamais découvrir une sixième forme qui vivrait à l'intérieur des
clauses (2) ou (3) — elle ne fait que confirmer que le code respecte la
règle qu'on lui a donnée, pas que cette règle est complète face à un
attaquant qui la connaît.

La clause (1) — le vrai premier jeton passe **quelle que soit sa forme** —
est la plus ancienne du dispositif et la moins éprouvée par une propriété :
elle est adossée à une **observation passée** (condition 6 du GATE, deux
instantanés figés : 36 + 26 têtes nées de la branche « premier jeton
décalé », toutes des noms de programmes, zéro secret), pas à une garantie
structurelle. Sondée hors de l'alphabet du GATE, la tokenisation shell ne
l'entame pas dans les cas usuels (`git "status"` → `git`, `git -p"secret"` →
`git`, `git $VAR` → `git`, `git ~/x` → `git`) — mais un jeton de sortie
littéralement identique au vrai premier jeton d'une commande
(`"hunterpass" x` → `"hunterpass"`) **traverse**, par construction de la
clause (1). Ce n'est pas un défaut nouveau introduit par ce cycle — le
premier jeton n'a jamais été filtré par aucune version de cette garde — mais
c'est la limite connue à citer avant toute affirmation d'« absence de
fuite ».

## Références

- Spec : `specs/features/doing/bug-014-redaction-des-secrets-laisse-passer-les-minuscules.md`
- Code : `control-center/hooks/redaction_commande.py`, `control-center/hooks/record-event.py`,
  `control-center/backend/config.py` (`tetes_de_commande()`), `control-center/backend/server.py` (`_lancer()`)
- [ADR-0017](0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md) — pourquoi D3 (l'écart `_lancer()`) entre dans ce cycle plutôt que dans une spec séparée
- [ADR-0020](0020-un-centre-de-controle-appartient-a-un-developpeur.md) — le journal en 0644 et son service au navigateur, hors périmètre de ce cycle
