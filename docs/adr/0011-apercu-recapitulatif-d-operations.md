# ADR-0011 — L'aperçu d'`update_kit` est un récapitulatif d'opérations, pas un diff de deux arbres

## Statut

Accepté

## Date

2026-09-12

## Contexte

L'aperçu affiché par `tools/update_kit.sh` reposait sur
`git diff --stat "$DISTANT/$BRANCHE" -- $fichiers_du_kit` : une comparaison
entre la référence du kit et l'arbre de travail **suivi** du projet. `git
diff` ne voit que ce que git suit — un fichier présent dans le kit et absent
de l'index du projet y apparaissait donc comme une **suppression**
(`deletions(-)`), alors que l'opération réelle, `git checkout
"$DISTANT/$BRANCHE" -- $presents`, allait l'**écrire**.

Deux gardes échouaient en même temps sur le cas d'un fichier **présent mais
non suivi** (typiquement ignoré par `.gitignore`) : l'aperçu annonçait
l'inverse de ce qui allait se produire, et la garde d'arbre de travail propre
(`git status --porcelain`) est aveugle aux fichiers ignorés — rien ne
signalait qu'un contenu local, jamais commité et donc jamais récupérable,
allait être écrasé sans retour possible (bug-001).

Le défaut n'était pas dans la mise en forme du `git diff`, mais dans le choix
de son **sens** : un diff d'arbres répond à « qu'est-ce qui diffère ? », pas à
« qu'est-ce que ce script va faire ? ». Les deux questions coïncident pour un
fichier suivi et divergent exactement pour celui qui ne l'est pas — le cas où
l'écart de conséquence est le plus grave.

## Décision

**L'aperçu d'`update_kit.sh` décrit les opérations que la synchronisation va
réellement effectuer, jamais un diff entre deux arbres.** Chaque chemin gelé
est classé, indépendamment des autres, dans l'une de quatre issues :

1. **à créer** — absent du projet ;
2. **non suivi, contenu divergent** — présent mais ignoré par git, hash
   différent de celui du kit : la synchronisation réelle **refuse** de
   l'écraser (voir la garde d'écrasement ci-dessous, conséquence directe de
   cette décision) ;
3. **non suivi, déjà identique** — présent, ignoré par git, hash identique :
   sera indexé, rien à perdre ;
4. **à mettre à jour** ou **identique** — présent et suivi, selon que le hash
   diffère ou non de celui du kit.

La classification est calculée une seule fois par fichier, à un seul endroit
du script, et cette même valeur alimente à la fois le texte affiché à
l'utilisateur et la garde d'écrasement : les deux ne peuvent plus se
contredire, contrairement à deux calculs séparés qui pourraient un jour
diverger. Le récapitulatif est produit par un site d'appel unique, commun à
`--dry-run` et à l'exécution réelle : seul le pied de page distingue les deux.

## Alternatives considérées

- **Réinterpréter `git diff --numstat`** : écarté. Ça reste un diff entre
  deux arbres, dont il faudrait inverser le sens à la main pour chaque ligne
  affichée — et les fichiers non suivis restent invisibles pour `git diff`,
  quelle que soit la forme de sortie choisie. Le défaut racine n'est pas
  résolu, seulement redécoré.
- **Comparer `git ls-tree` (référence du kit) à `git ls-files` (index du
  projet)** : écarté. `git ls-files` est aveugle aux fichiers non suivis par
  construction — c'est exactement le cas le plus grave que ce correctif doit
  couvrir. Cette alternative aurait laissé filer bug-001 tel quel.
- **Sauvegarde `.bak` automatique avant écrasement, au lieu d'une garde qui
  bloque** : écarté. Ça fabrique un fichier que personne n'a demandé dans le
  dépôt d'un tiers, et ça déplace la décision (écraser ou non) du côté du
  script plutôt que de la laisser à l'humain qui lit l'aperçu — alors que
  c'est précisément cette lecture qui doit rester la seule soupape.

## Conséquences

### Positives

- Un fichier destiné à être créé n'apparaît plus jamais comme une
  suppression : l'aperçu répond à « que va-t-il se passer ? », pas à « qu'est-ce
  qui diffère ? ».
- Le cas le plus dangereux — un non-suivi divergent, irrécupérable après
  écrasement — est signalé dans l'aperçu **et** bloqué à l'exécution réelle,
  par la même donnée.
- `--dry-run` et l'exécution réelle ne peuvent plus afficher un récapitulatif
  différent : un seul site d'appel les alimente tous les deux.

### Négatives

- La classification exécute deux commandes git par fichier gelé (mesuré :
  0,13 s pour 23 fichiers, linéaire avec le nombre de chemins) — négligeable
  aujourd'hui, à surveiller si la liste des chemins gelés grossissait
  fortement.
- Un écart qui ne porte **que sur le bit exécutable** est classé
  « identique » : `git hash-object` ne hash que le contenu, jamais le mode du
  fichier.
- `git hash-object` applique les filtres `clean` déclarés par
  `.gitattributes`, alors que `git checkout` applique les filtres `smudge`
  symétriques : un `core.autocrlf` agressif peut faire apparaître un « à
  mettre à jour » qui ne correspond à aucun écart une fois les filtres
  appliqués.
- La garde d'écrasement (conséquence directe de cette décision, pas un ADR
  séparé) fait désormais **échouer** des synchronisations qui réussissaient
  silencieusement auparavant, en écrasant un non-suivi divergent. C'est le
  compromis assumé : un échec explicite plutôt qu'une perte silencieuse.

### Ce que ça verrouille

Toute catégorie de chemin ajoutée plus tard à `update_kit.sh` (un cinquième
état, un nouveau type de chemin conditionnel) devra passer par la même
fonction de classification et produire l'un des états déjà nommés — les tests
de non-régression de feature-006 s'appuient sur ce vocabulaire de sortie
(« à créer », « non suivi », « à mettre à jour », « identique »). Réintroduire
un `git diff` d'arbres dans ce chemin de code, même partiellement, romprait
cette règle : « l'aperçu décrit des opérations, pas un état ».
