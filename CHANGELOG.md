# Changelog — <NOM DU PROJET>

Journal des changements **visibles par les utilisateurs**, version la plus récente en
premier, versions séparées par `---`. Tenu par `doc-writer` à chaque tour qui change
un comportement observable (cf. CLAUDE.md, « Auto-vérification fin de tour »).

<!-- Les entrées ci-dessous documentent le KIT lui-même. Au démarrage d'un projet,
     les remplacer par le journal du projet. -->

## [0.7.0] - 2026-09-13

### Centre de contrôle

- **Le tableau de bord recoupe désormais les cycles au lieu d'en fondre
  plusieurs en un seul workflow.** Jusqu'ici, un workflow était affiché par
  session : une session interactive qui enchaînait plusieurs cycles de spec
  (constaté en pratique — quatre cycles, 45 passages d'agents sur quinze
  heures) les présentait comme un seul récit continu, sans séparation.
  `reconstruire()` accepte désormais `agents_ouvrants`, une liste déclarée en
  configuration (`[workflows] agents_ouvrants`, vide par défaut) : un
  `SubagentStart` dont l'`agent_type` y figure ouvre un nouveau segment.
- **Et dit quand la frontière n'a pas pu être établie**, plutôt que de
  découper au jugé : liste vide, ou aucun agent de la liste rencontré ⇒ le
  workflow reste une session entière (`bornage = session entière`) ; les
  événements antérieurs au premier marqueur rencontré forment un segment à
  part qui n'affirme rien sur son contenu (`bornage = avant le premier
  repère`). Le tableau de bord affiche ce bornage, ainsi que l'indice du cycle
  et l'agent qui l'a ouvert.
- **Ce que ça n'améliore pas, assumé** : un cycle mené sans l'agent ouvrant
  déclaré (typiquement un fix isolé sans `orchestrator`) reste rattaché au
  segment précédent — c'est visible à l'écran, pas masqué. `SessionEnd` ne se
  déclenchant jamais en pratique (0 occurrence relevée sur 1563 événements),
  tous les segments d'une session continuent d'afficher « sans fin observée »,
  y compris ceux manifestement clos — ce défaut appartient à `bug-002`.
- Le nombre de workflows envoyés au tableau de bord n'est plus figé à 10 : il
  est désormais configurable (`[workflows] affiches`, défaut 20, borné
  [1, 100]), pour compenser la fenêtre d'historique plus courte qu'ouvre le
  découpage par segment.

### Outillage

- **`tools/update_kit.sh` : `.kit-paths` a désormais une grammaire ligne à
  ligne, et quatre défauts de parsing sont corrigés.** Établis par exécution
  sur clones jetables (feature-012) :
  - un `.kit-paths` enregistré en **CRLF** (un éditeur Windows suffit)
    perdait **tout** son périmètre déclaré — le `\r` terminal survivait au
    pipeline `sed | grep`, et le script accusait à tort le distant « kit ».
    Un `\r` terminal est désormais retiré ligne à ligne, avant tout le
    reste.
  - un chemin contenant une **espace** était découpé en plusieurs mots par
    le shell et disparaissait **en silence** ; il est désormais traité comme
    un seul chemin (les espaces de tête et de queue restent interdites,
    voir [ADR-0015](docs/adr/0015-grammaire-kit-paths.md)).
  - un chemin déclaré dans `.kit-paths` mais **absent du kit** était avalé
    sans un mot ; il est désormais nommé sur stderr, sans bloquer les autres
    chemins déclarés.
  - ⚠️ **un `.kit-paths` contenant un glob (`*`) change de comportement.**
    Il était auparavant expansé par le shell contre le répertoire **du
    projet** (jamais l'arbre du kit) : un projet déclarant
    `.claude/agents/*` ne recevait donc jamais un fichier ajouté côté kit,
    seulement ce qu'il possédait déjà — ADR-0008 s'en trouvait vidé de son
    sens. Le glob est désormais **littéral** : s'il ne correspond à aucun
    chemin exact côté kit, il est nommé comme un chemin absent. Un
    `.kit-paths` qui utilisait `*` doit être réécrit en chemins explicites.
  - le message « Le distant « kit » pointe-t-il bien sur le kit ? »
    n'apparaît plus sur une cause purement locale (CRLF, espace, glob,
    `.kit-paths` vide ou entièrement commenté) : trois diagnostics distincts
    remplacent le message unique — déclaration vide, aucun chemin déclaré
    trouvé côté kit, ou véritable soupçon de mauvais distant.
  - `presents` est désormais un tableau indexé (plus aucune expansion non
    quotée d'une liste de chemins) ; 55 → 71 tests ; `shellcheck` passe de
    un avertissement à zéro.

### Intégration continue

- **La suite de tests du centre de contrôle est enfin exécutée par une CI**,
  sur GitHub et sur GitLab — elle ne l'était par aucune des deux jusqu'ici.

### Documentation

- `docs/adr/0015-grammaire-kit-paths.md` [nouveau] : `.kit-paths` a une
  grammaire et c'est un contrat public — le compromis du trim explicite (prix
  des espaces intérieures), les alternatives écartées (refus nommé de
  l'espace, expansion du glob côté kit) et ce que ça verrouille.
- `README.md` : la section sur les projets qui n'adoptent pas tout le kit
  décrit désormais la grammaire complète de `.kit-paths`.
- `docs/adr/0014-bornage-des-cycles-par-marqueur-declare.md` [nouveau] :
  pourquoi le bornage est un paramètre déclaré et jamais un nom d'agent en
  dur, les trois refus de découpage au jugé, alternatives écartées
  (corrélation avec `specs.py`/`vcs.py`, événement de bornage explicite).
  Supersède [ADR-0002](docs/adr/0002-graphe-execution-plat.md) sur le seul
  point du bornage.
- `docs/adr/0002-graphe-execution-plat.md` : note additive datée du
  2026-09-13 — l'hypothèse « un workflow est une session » a été réfutée à
  l'usage ; le reste de l'ADR (graphe plat, absence de `Task`) reste valide.
- `control-center/README.md` : section « Pourquoi le graphe est plat »
  corrigée (elle répétait l'hypothèse réfutée), compteurs de tests et lot de
  mutants de la section Tests mis à jour.

## [0.6.0] - 2026-09-12

### Outillage

- **`tools/update_kit.sh` : l'aperçu cesse d'annoncer des suppressions là où
  il va créer des fichiers.** Il reposait sur un `git diff --stat` entre le
  kit et l'arbre suivi du projet ; un chemin gelé absent du projet y
  apparaissait comme `deletions(-)` alors qu'il allait être **créé**.
  L'aperçu distingue désormais quatre issues par fichier : à créer, non suivi
  divergent, non suivi déjà identique, à mettre à jour (les identiques suivis
  sont comptés, non listés). Voir ADR-0011.
- **Nouvelle garde d'écrasement** : un fichier non suivi par git (typiquement
  ignoré par `.gitignore`) dont le contenu diverge de celui du kit fait
  désormais **échouer** la synchronisation réelle avant tout `git checkout`.
  Motif : un tel fichier, jamais commité, n'est récupérable par aucun retour
  arrière une fois écrasé — et la garde d'arbre propre préexistante
  (`git status --porcelain`) ne le voyait pas, puisqu'elle est aveugle aux
  fichiers ignorés. **Ce qui peut surprendre** : une synchronisation qui
  réussissait jusqu'ici en silence peut désormais sortir en erreur — c'est le
  compromis assumé (voir ADR-0011, conséquences négatives).
- **Nouvelle garde d'écrasement, pour les fichiers gelés par un bit git** :
  un fichier **suivi** mais marqué `git update-index --skip-worktree` (ou
  `--assume-unchanged`), dont le contenu local diverge de `HEAD` et n'a
  jamais été committé, fait désormais **échouer** la synchronisation réelle
  avant tout `git checkout`. Motif : ces deux bits rendent `git status
  --porcelain` aveugle par construction — la garde d'arbre propre ne voyait
  rien, et la garde d'écrasement des non-suivis (ci-dessus) ne couvre que
  les fichiers non suivis. Sans cette garde, `git checkout` écrasait le
  contenu **et** effaçait le bit posé, sans laisser aucune trace de
  l'intention de l'utilisateur. **Ce qui peut surprendre** : une
  synchronisation qui passait jusqu'ici en silence peut désormais sortir en
  erreur ; un projet qui fige un fichier avec `skip-worktree` devra lever le
  bit (`git update-index --no-skip-worktree -- <chemin>`), déplacer le
  fichier, ou l'exclure via `.kit-paths` pour débloquer la synchronisation.
  Un fichier gelé **identique** au kit n'est jamais bloqué ; un fichier gelé
  qui n'a rien à perdre (contenu local == `HEAD`) n'est pas bloqué non plus,
  mais un avertissement signale que `git checkout` va effacer le bit sans
  autre forme de procès. Voir ADR-0013.
- **Correctif, le plus grave de ce lot pour tout projet francophone** : un
  nom de fichier accentué (ou plus largement non-ASCII) désarmait
  silencieusement **toutes** les gardes ci-dessus. `git ls-tree` cite par
  défaut (`core.quotepath`) ces octets — `révision.md` sortait sous la forme
  `"r\303\251vision.md"` — et le test d'existence de la classification
  cherchait alors un fichier absent sous cette forme précise, le classait
  « à créer », et `git checkout` l'écrasait sans un mot. Les appels
  concernés portent désormais `-c core.quotepath=off`. Voir ADR-0013.
- **Tout argument différent de `--dry-run` est rejeté**, sortie non nulle.
  Motif, relevé par l'audit sécurité : `./tools/update_kit.sh --dry_run`
  (faute de frappe) déclenchait jusqu'ici une synchronisation **réelle** — la
  seule soupape humaine du script était contournable par une simple coquille.
  **Ce qui peut surprendre** : un argument mal orthographié est désormais
  refusé au lieu d'être silencieusement ignoré.
- `--dry-run` et l'exécution réelle passent par un site d'appel unique du
  récapitulatif : ils ne peuvent plus afficher un texte différent.

### Tests

- `tests/test_update_kit.py` [nouveau] : harnais minimal (dépôts kit/projet
  jetables, confinés, sans réseau) et 4 cas de non-régression sur l'aperçu et
  la garde d'écrasement. Ajouté à `CHEMINS` d'`update_kit.sh` pour se
  synchroniser avec le script qu'il protège.
- **`tests/harnais_kit.py` [nouveau]** (feature-006, lot 1) : le harnais de
  `test_update_kit.py` est extrait en module partagé, confinement étendu à 4
  variables `GIT_*` supplémentaires trouvées par l'audit sécurité
  (`GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`, `GIT_TEMPLATE_DIR`,
  `GIT_EXEC_PATH`), et enrichi de primitives (`.kit-paths`, faux `.github/`,
  arbre sali, fichier non inscriptible, `skip-worktree`) pour les lots
  suivants. `tests/test_harnais_kit.py` [nouveau] : auto-contrôles du
  harnais lui-même, variable de confinement par variable. Voir ADR-0012.
- Cinq gardes d'usage d'`update_kit.sh` couvertes (arbre sale en réel et en
  `--dry-run`, distant `kit` absent, hors dépôt git, projet déjà aligné),
  chacune protégée par `affirmer_seule_garde()` — un cas qui passerait pour
  la mauvaise raison, comme sur bug-001, échoue désormais.
- **`GardeGelesPerteTest` et `NomsAccentuesTest` [nouveaux]** (bug-003) : la
  suite passe de 42 à 55 cas. Couvrent la garde des fichiers gelés
  (`skip-worktree`/`assume-unchanged`), la parité `--dry-run`/réel sur ce
  cas, le fichier gelé identique ou sans perte réelle, et le correctif des
  noms accentués. Matrice de mutation diagonale sur neuf passes, aucun cas
  préexistant tué. Nouvelle clé `bit_gele` dans `MARQUEURS_DE_GARDE`
  (`tests/harnais_kit.py`), conformément à ADR-0012. Voir ADR-0013.
- **Une garde d'`update_kit.sh` qui n'avait jamais fonctionné est réparée** :
  le message « Ce script doit tourner dans un dépôt git » ne pouvait jamais
  s'afficher, `cd ""` réussissant silencieusement en bash quand la
  substitution est vide. Trouvé à l'exécution, pas par relecture.

### Intégration continue

- **Une CI exécute enfin `tests/`** : jusqu'ici, ni les 4 cas de
  `test_update_kit.py` ni les 9 de `test_sync_copilot_agents.py` ne
  tournaient ailleurs qu'à la main, en local. Job distinct, hors du budget
  « une seconde » des trois contrôles d'hygiène existants (voir GUIDE.md).
- **Le contrôle des profils Copilot existe désormais aussi côté GitLab**
  (`.gitlab/ci/hygiene.yml`), en parité avec `.github/workflows/hygiene-specs.yml`.

⚠️ **Action manuelle pour les consommateurs du kit** : un projet dont le
`.kit-paths` liste `tests/test_update_kit.py` explicitement ne recevra **pas**
automatiquement `tests/harnais_kit.py` ni `tests/test_harnais_kit.py`
(`.kit-paths` est une liste inclusive, ADR-0008) — sa suite cassera à
l'import (`ModuleNotFoundError: harnais_kit`). Ajouter les deux fichiers à
son `.kit-paths`.

### Documentation

- `docs/adr/0011-apercu-recapitulatif-d-operations.md` [nouveau] : pourquoi
  l'aperçu décrit des opérations et non un diff d'arbres, alternatives
  écartées (`numstat` réinterprété, `ls-tree`/`ls-files`, sauvegarde `.bak`
  automatique).
- `docs/adr/0012-harnais-de-test-partage-et-doctrine-anti-chevauchement.md`
  [nouveau] : pourquoi un harnais unique et `affirmer_seule_garde()`,
  alternatives écartées (dépôt façonné par garde sans assertion croisée,
  extraction des gardes en fonctions shell, primitives écrites au fil de
  l'eau). Impose aux lots feature-012, feature-013, feature-014 et bug-003
  de déclarer leur marqueur et de produire une matrice diagonale.
- `README.md` : section « Récupérer les évolutions du kit » mise à jour avec
  les quatre issues de l'aperçu et la garde d'écrasement.
- `GUIDE.md` : section sur les contrôles d'hygiène — quatrième contrôle
  (tests), pourquoi il est hors du budget d'une seconde, parité des forges
  sur le contrôle Copilot.
- `specs/features/todo/feature-006-tests-de-update-kit.md` : note sur le
  harnais livré en avance par bug-001.
- `specs/features/todo/feature-012-kit-paths-gouverne-seul.md`,
  `feature-013-geles-personnalises-conditionnels.md`,
  `feature-014-apercu-effets-de-bord-echecs.md`,
  `bug-003-skip-worktree-echappe-aux-gardes.md` : note sur le harnais livré
  et l'obligation ADR-0012 (marqueur de garde déclaré + matrice diagonale).

## [0.5.0] - 2026-09-12

### Équipe d'agents

- **Fusion `security-auditor` + `security-reviewer` → `security-reviewer` unique.**
  Le nouvel agent cumule les deux rôles : **GATE** bloquant sur un périmètre déclaré
  (P1 sur le design, P2 sur le diff, verdict GO / GO SOUS CONDITIONS / NO GO) et
  **AUDIT** holistique de la surface d'attaque, sans diff ni spec. Raison : deux
  « invocation obligatoire » sur le même périmètre produisent soit le double de
  coût, soit l'ambiguïté — et l'ambiguïté, en pratique, veut dire qu'aucune des
  deux n'est appelée. `.claude/agents/security-auditor.md` supprimé.
- Toutes les références au gate dans `CLAUDE.md`, `GUIDE.md`, `README.md`,
  `orchestrator.md`, les templates de spec et les skills `security-checklist` /
  `db-migrations` renommées vers `security-reviewer`, en précisant le rôle (GATE
  ou AUDIT) partout où l'ambiguïté était possible.
- L'équipe passe de 12 à 11 agents.

## [0.4.0] - 2026-09-11

### GitHub Copilot

- `tools/sync_copilot_agents.py` convertit les profils `.claude/agents/*.md` en
  `.github/agents/*.agent.md`, traduit les outils, refuse les collisions avec un profil
  manuel et supprime uniquement ses propres dérivés devenus orphelins.
- Les modes `--write` et `--check` permettent respectivement la génération locale et
  le contrôle déterministe en CI, sans dépendance Python externe.
- `.github/copilot-instructions.md` adapte les références partagées à Claude/`Task`
  aux concepts Copilot et maintient l'orchestration par la session principale.
- La CI vérifie désormais que les 12 profils Copilot versionnés correspondent exactement
  à leurs sources Claude ; sept tests unitaires protègent le convertisseur.
- `tools/update_kit.sh` propage le convertisseur et les instructions communes puis, pour
  les projets ayant conservé `.github/`, régénère les profils localement afin d'inclure
  leurs agents métier sans recopier aveuglément tout le répertoire du kit.

---

## [0.3.0] - 2026-09-08

Le kit devient utilisable sur GitHub **et** GitLab, et cesse d'être un cul-de-sac
une fois recopié dans un projet.

### Deux forges

- `.gitlab/ci/hygiene.yml` : variante GitLab CI des contrôles d'hygiène, à inclure
  depuis un `.gitlab-ci.yml` existant sans le remplacer. Les deux variantes appellent
  les **mêmes scripts** `tools/` — le support bi-forge est quasi gratuit parce que la
  logique n'a jamais vécu dans le YAML.
- `/release` gère les deux forges (`gh` / `glab`), avec la consigne de supprimer la
  variante inutilisée — et la commande entière si la chaîne CI publie déjà les releases.
- `.claude/settings.json` : entrées `glab` en miroir des entrées `gh`.
- `README.md` : étape « Choisir sa forge » dans la procédure de démarrage.

### Propagation kit → projets

- `tools/update_kit.sh` : récupère dans un projet les évolutions du kit, **uniquement
  sur les fichiers gelés**. Refuse un arbre de travail sale, propose `--dry-run`, laisse
  le diff indexé pour relecture.
- `README.md` et `GUIDE.md` documentent qu'un template GitHub ne crée **aucun lien git** :
  rien ne descend, rien ne remonte. D'où les deux catégories de fichiers — **gelés**
  (rapatriables) et **personnalisés** (jamais touchés) — sans lesquelles toute
  synchronisation écraserait le `CLAUDE.md` du projet.
- Rappel explicite : un agent métier vit dans le projet, jamais dans le kit.

---

## [0.2.0] - 2026-09-08

Report des leçons apprises sur le projet d'origine depuis la constitution du kit.

### Positionnement

- Le kit devient **`claude-agent-kit`** : un dépôt de référence qui ne contient que
  l'outillage Claude, recopié dans les projets puis maintenu ici. Le nom précédent
  (`claude-webapp-kit`) désignait une techno alors que ce qui se réutilise est une
  méthode de travail.
- `README.md` : ce qui se copie et ce qui ne se copie pas, et la règle de
  rétro-portage — une leçon apprise sur un projet est perdue pour les suivants si
  personne ne la rapatrie ici.
- `CLAUDE.md` : avertissement en tête pour Claude ouvrant le dépôt du kit lui-même —
  c'est un modèle, pas un projet.

### Équipe d'agents

- Nouvel agent `security-reviewer` : audit **holistique** de la surface d'attaque, sans
  diff ni spec, complémentaire du gate `security-auditor`. Porte la règle « cherche la
  PLACE de la garde dans le cycle de vie, jamais sa seule présence », le modèle de
  menace à quatre attaquants et le rapport hiérarchisé en trois niveaux.
- `test-engineer` : validation obligatoire des tests neufs **par mutation**, avec
  relevé chiffré des mutants tués dans le rapport.
- `orchestrator` : prévoit `security-reviewer` après toute refonte de l'auth, du
  routage ou des permissions.

### Hygiène du dépôt

- `tools/check_specs.sh` : une spec ne vit que dans un seul dossier du cycle
  (bloquant) ; un numéro porté par deux slugs est signalé (avertissement).
- `tools/check_doc_links.sh` : tout lien relatif de la documentation résout.
- `.github/workflows/hygiene-specs.yml` : les deux contrôles sur chaque commit.

### Mémoire et releases

- `.claude/memory/` : mémoire de projet versionnée (index + README expliquant quoi y
  écrire, comment la réactiver sur une autre machine, et l'interdiction des secrets).
- `.claude/commands/release.md` : commande `/release` qui ne commite rien et ne pousse
  que le tag ; section « Fichiers générés et releases » dans `CLAUDE.md`.

### Permissions

- `.claude/settings.json` restructuré : `deny` / `ask` / `allow` explicites, allowlist
  de lecture large pour éviter les demandes de validation à répétition, sorties du
  dépôt (push, PR, release) sur confirmation.

### Specs

- `specs/modele.md` porte un bloc **Agents requis**, pour que la règle d'escalade vers
  le template complet soit lisible par l'orchestrator et pas seulement par un humain.

---

## [0.1.0] - AAAA-MM-JJ

### Backend

- Démarrage du projet avec le kit d'équipe Claude.

### Portail

- —

### Documentation

- Squelettes `docs/API.md`, `docs/ARCHITECTURE.md`, ADR-0001 (format ADR).
