# ADR-0015 — `.kit-paths` a une grammaire, et c'est un contrat public

## Statut

Accepté

## Date

2026-09-13

## Contexte

ADR-0008 fait de `.kit-paths` une liste **inclusive** : un projet y déclare ce
qu'il accepte de recevoir du kit, et cette décision est structurante (elle
protège un projet ayant divergé de ses agents, cas mesuré à 50-88 %). Mais
ADR-0008 fixe la **sémantique** de la liste, jamais sa **syntaxe** : le
parsing d'origine (`sed 's/#.*//' | grep -v '^[[:space:]]*$'` puis
`for chemin in $CHEMINS`) n'avait jamais été pensé comme une grammaire — c'était
un pipeline de commodité, découvert défaillant par l'audit sécurité :

- un `.kit-paths` enregistré en **CRLF** (un éditeur Windows suffit) perdait
  **tout** son périmètre déclaré, le `\r` terminal survivant au pipeline
  `sed | grep` ;
- un chemin contenant une **espace** était découpé en plusieurs mots par le
  word-splitting par défaut du shell, et le chemin réel disparaissait sans
  être nommé ;
- un chemin déclaré mais **absent du kit** était avalé sans un mot ;
- un `.kit-paths` contenant un glob (`*`) était expansé par le shell contre le
  répertoire **du projet** (le `cd` vers la racine projet a lieu avant la
  boucle qui lit `$CHEMINS`), jamais contre l'arbre du kit — un projet
  déclarant `.claude/agents/*` ne recevait donc jamais un fichier ajouté côté
  kit, seulement ce qu'il possédait déjà. ADR-0008 s'en trouvait vidé de son
  sens : la liste ne déclarait plus ce que son auteur croyait déclarer.

`.kit-paths` est écrit à la main par des projets tiers, pas généré par un
outil du kit. Une fois qu'un comportement de parsing est observable, des
fichiers réels s'appuient dessus — c'est un **contrat public**, au même titre
qu'un format de fichier ou un contrat d'API, même s'il ne franchit jamais un
réseau.

## Décision

`.kit-paths` a désormais une **grammaire explicite, ligne à ligne** :
lecture par `while IFS= read -r ligne || [ -n "$ligne" ]`, jamais par un
pipeline `sed | grep` ni par un découpage de mots du shell. Pour chaque
ligne, dans l'ordre : retrait d'**un** `\r` terminal, coupure du commentaire
(tout ce qui suit un `#`), trim des espaces/tabulations de tête et de queue
(`[[:blank:]]`), puis la ligne est ignorée si elle est devenue vide. Les
chemins retenus alimentent un **tableau indexé** (`declares`, puis
`presents`) — plus aucune expansion non quotée d'une liste de chemins.

Cet ADR **complète ADR-0008 sans le rouvrir** : ADR-0008 reste l'autorité sur
le *pourquoi* (liste inclusive, défaut penchant vers « rien reçu par
erreur ») ; celui-ci fixe le *comment* on écrit une ligne valide.

**Le compromis central, à ne pas enterrer** : supporter les espaces
*intérieures* d'un chemin impose de **trimer explicitement** celles de tête
et de queue — l'ancien découpage par mots les mangeait gratuitement, sans
qu'on ait eu à le décider. Conséquence directe et assumée : un chemin déclaré
ne peut plus **commencer ni finir par une espace**, ni contenir un `#` (qui
ouvre toujours un commentaire) ou un retour à la ligne. C'est le prix des
espaces intérieures, et c'est un **rétrécissement** de ce que la grammaire
accepte, payé pour un **élargissement** ailleurs (un chemin réel ne commence
ni ne finit normalement par une espace ; le compromis a donc été jugé
favorable, mais il reste un choix, pas une évidence).

Un glob (`*`, `?`, `[...]`) dans `.kit-paths` est désormais **littéral** :
s'il ne correspond à aucun chemin exact côté kit, il est traité — et nommé —
comme n'importe quel chemin déclaré absent.

## Alternatives considérées

- **Refuser nommément un chemin avec espace**, plutôt que le supporter :
  réversible, et un temps envisagé. Écarté parce qu'il laissait le glob
  entier à traiter séparément, laissait vivre le `SC2086` (shellcheck) sur
  l'itération non quotée, et créait une contrainte **permanente** sur des
  `.kit-paths` déjà écrits par des projets tiers — pour un gain de
  simplicité d'implémentation, pas un gain pour l'utilisateur du contrat.
- **Expansion du glob côté kit** (lister l'arbre du kit via `git ls-tree` et
  faire correspondre le motif à ce niveau) : écarté pour deux raisons.
  D'abord technique — ça introduit un appel `ls-tree` supplémentaire, porteur
  du piège `core.quotepath` (ADR-0013) tout juste corrigé dans le lot voisin
  de ce même chantier. Ensuite, et surtout, de principe : ça ferait décider
  au **kit** le contenu d'une liste dont ADR-0008 dit explicitement qu'elle
  est la déclaration du **projet** — glob compris. C'est ADR-0008 pris à
  l'envers : le glob resterait littéral parce que c'est le projet qui écrit
  `.kit-paths`, pas le kit qui l'interprète à sa place.

## Conséquences

### Positives

- Un `.kit-paths` en CRLF produit exactement le même périmètre qu'en LF.
- Un chemin contenant une espace intérieure n'est plus jamais perdu en
  silence.
- Un chemin déclaré mais absent du kit est nommé sur stderr, sans bloquer la
  synchronisation des autres chemins déclarés.
- Un `.kit-paths` vide ou entièrement commenté, et le cas où aucun chemin
  déclaré n'existe côté kit, produisent chacun un message dédié — plus jamais
  confondus avec le soupçon « mauvais distant ».

### Négatives

- **Un `.kit-paths` utilisant `*` aujourd'hui change de sens.** Un projet qui
  s'appuyait (à tort, mais silencieusement) sur l'expansion locale du glob
  contre son propre répertoire verra désormais ce glob traité comme un
  chemin littéral absent — la synchronisation échoue avec un message nommé
  au lieu de synchroniser ce que le glob avait ramassé localement.
- Un chemin de bord (espace de tête/queue, `#`, retour à la ligne) cesse
  d'être acceptable dans une déclaration — un cas marginal en pratique, mais
  une régression pour qui en dépendait.
- **La grammaire devient un contrat qu'on ne peut plus élargir sans casser** :
  une espace supportée aujourd'hui ne se reprend plus sans repasser par un
  nouvel ADR qui documente la rupture. Toute évolution future de la syntaxe
  de `.kit-paths` doit être évaluée à cette aune.

### Ce que ça verrouille

- La lecture de `.kit-paths` (et de toute liste de chemins similaire future
  dans ce script) se fait ligne à ligne, jamais par un pipeline `sed|grep` ni
  par un découpage de mots du shell.
- Un glob dans `.kit-paths` reste littéral : aucune expansion, ni côté projet
  ni côté kit, sans repasser par un ADR qui statue sur ce changement de sens.
- Toute évolution de la grammaire (accepter un caractère aujourd'hui refusé,
  par exemple) est un **rétrécissement ou un élargissement du contrat
  public** : elle se documente ici (note additive datée) ou dans un ADR qui
  supersède celui-ci, jamais silencieusement dans le script seul.

## Références

- `tools/update_kit.sh` — bloc « GRAMMAIRE DE .kit-paths (feature-012) »,
  lecture ligne à ligne et boucle de classification sur `presents` (tableau
  indexé).
- `tests/test_update_kit.py` — classe `KitPathsGrammaireTest` (garanties 5,
  6, 7, 17 ; cas CRLF, espace, glob, diagnostics distincts).
- `docs/adr/0008-kit-paths-liste-inclusive.md` — sémantique inclusive de la
  liste, non rouverte par cet ADR.
- `docs/adr/0013-detection-par-fichier-et-noms-cites.md` — piège
  `core.quotepath`, écarté ici comme argument contre l'expansion du glob
  côté kit.
- `specs/features/doing/feature-012-kit-paths-gouverne-seul.md` — relevés
  d'exécution des six cas (A1) et arbitrage du glob par `architect`.
