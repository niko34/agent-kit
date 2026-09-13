# ADR-0013 — La détection des fichiers gelés se fait par fichier, jamais sur un état global de l'arbre, et les noms sortis de git sont dé-cités avant réutilisation comme chemins disque

## Statut

Accepté

## Date

2026-09-13

## Contexte

`bug-003` a établi qu'un fichier **suivi** mais marqué `skip-worktree` (ou
`assume-unchanged`), dont le contenu local diverge de `HEAD`, était écrasé
sans qu'aucune des gardes issues de `bug-001`/ADR-0011 ne le voie :
`git status --porcelain` ignore ces bits par construction, et la garde
d'écrasement de `bug-001` ne regarde que les fichiers non suivis. Le dégât
est total — `git checkout` écrase le contenu **et** efface le bit, sans
laisser aucune trace de l'intention de l'utilisateur.

Deux questions de conception se sont posées en cours de cycle, l'une prévue
par la spec, l'autre découverte par l'audit pendant l'implémentation.

**Comment détecter la divergence ?** La spec proposait de tester « hash
local ≠ `HEAD:$f` **alors que** `git status --porcelain` est propre » — un
test qui mêle une comparaison par fichier à un état global de l'arbre.

**Un quatrième chemin de destruction** : `git ls-tree --name-only` cite les
octets non-ASCII quand `core.quotepath` est actif (réglage par défaut de
git). Un fichier `révision.md` sort sous la forme littérale
`"r\303\251vision.md"`. Le test `[ ! -e "$f" ]` de la classification
cherchait alors un fichier qui n'existait pas **sous cette forme précise**,
le classait « à créer », et `git checkout` l'écrasait — silencieusement, bit
compris pour un fichier gelé divergent. **Toutes les gardes de bug-001 et
bug-003 étaient contournées par le nom seul**, dans un kit dont la langue de
travail est le français. Établi et refermé par exécution, pas par lecture.

## Décision

**Décision 1 — toute garde se décide par fichier, jamais sur un état global
de l'arbre.** La classification compare, pour chaque chemin gelé pris
isolément : le hash local à celui du kit (identique ?), puis, s'il diverge,
la lettre rendue par `git ls-files -v` (bit posé ?), puis, si oui, le hash
local à `HEAD:$f` (perte réelle ?). Aucune étape ne consulte
`git status --porcelain` ni aucun autre indicateur portant sur l'arbre dans
son ensemble.

**Décision 2 — tout nom sorti de git et réutilisé comme chemin disque doit
être dé-cité.** Les trois appels du script qui produisent des noms
réinjectés comme chemins (`git ls-tree` pour la liste des fichiers du kit,
`git ls-tree`/`git ls-files` pour la détection des orphelins) portent
désormais `-c core.quotepath=off`. C'est une contrainte permanente pour tout
futur appel à `ls-tree`/`ls-files` dans ce script : un nom qui en sort et
sert de chemin disque doit être dé-cité, sans exception.

**Décision 3 — on teste la règle, pas ses cas fréquents.** Deux fois dans ce
seul cycle, une énumération de cas a laissé filer des cas que la règle
couvrait pourtant : `case "$etat" in S|h)` aurait laissé passer `m`, `r`,
`c` (autres lettres minuscules d'`assume-unchanged`) ; `[a-z]` aurait laissé
passer des majuscules sous une locale de collation non-C, alors que
`[[:lower:]]` encode la règle elle-même (« toute minuscule ») indépendamment
de l'environnement.

## Alternatives considérées

- **Test global proposé par la spec** (« hash ≠ `HEAD:$f` alors que
  `git status --porcelain` est propre ») : écarté. Ce test est vrai en mode
  réel (la garde d'arbre sale préexistante sort avant, sur un arbre
  effectivement sale) mais **faux en `--dry-run` sur un arbre par ailleurs
  sale** : le même fichier gelé divergent changerait de catégorie selon le
  mode d'exécution. L'aperçu cesserait d'être identique à ce que fait
  réellement le script — exactement ce qu'ADR-0011 interdit. Vérifié par le
  test `test_T8_recapitulatif_dry_run_identique_a_l_execution_reelle`
  (`tests/test_update_kit.py`), qui verrouille la parité `--dry-run` / réel
  pour ce cas précis.
- **`git ls-tree -z` pour éviter la citation sans désactiver
  `core.quotepath`** : écarté. Ça force une lecture des noms délimitée par
  NUL, incompatible avec la boucle `while IFS= read -r … <<<` existante
  (séparée par retours à la ligne) sans réécriture du plan de lecture ; et
  bash ne peut de toute façon pas conserver un octet NUL dans une variable
  de substitution de commande — le nom serait tronqué en silence, un défaut
  pire que celui corrigé.
- **`[a-z]` pour détecter la minuscule** : écarté après vérification —
  intestable dans ce conteneur (seule la locale C y est installée), mais
  documenté comme piège : sous une locale de collation différente, la plage
  peut inclure des majuscules qui signifient tout autre chose ici (`H`, `C`).

## Conséquences

### Positives

- Un fichier gelé divergent est détecté et bloqué indépendamment du mode
  d'exécution et de l'état du reste de l'arbre.
- Un nom de fichier accentué (ou plus largement non-ASCII) ne peut plus
  désarmer aucune garde de classification.
- La règle de détection de `assume-unchanged` couvre tous les états de base
  documentés par `git ls-files -v`, pas seulement ceux observés en pratique.

### Négatives

- **Une synchronisation qui réussissait peut désormais échouer.** Un projet
  qui fige légitimement un fichier de configuration local sous un chemin
  gelé, avec un contenu jamais committé, verra sa synchronisation refusée là
  où elle passait en silence auparavant — et perdait le contenu local sans
  un mot.
- La détection par fichier coûte deux appels git supplémentaires
  (`git ls-files -v`, `git rev-parse HEAD:$f`), mais seulement sur les
  fichiers dont le hash diverge déjà de celui du kit — négligeable au regard
  du volume de chemins gelés du kit.
- `[[:lower:]]` n'est **pas testable** dans ce conteneur : seule la locale C
  y est installée. La justification écrite dans le commentaire du script et
  ci-dessus tient lieu de garde-fou en l'absence de vérification mécanique.

### Ce que ça verrouille

- Toute garde future portant sur `tools/update_kit.sh` (`feature-012`,
  `feature-013`, `feature-014`) doit se décider par fichier, jamais en
  consultant un état global de l'arbre — sous peine de rouvrir la divergence
  `--dry-run` / réel qu'ADR-0011 interdit.
- Tout appel futur à `git ls-tree`/`git ls-files` dans ce script dont la
  sortie est réutilisée comme chemin disque doit porter
  `-c core.quotepath=off`.
- Le vocabulaire de classification (« identique », « gelé perdant », « à
  mettre à jour, bit effacé ») s'ajoute à celui verrouillé par ADR-0011 :
  toute catégorie future doit s'y raccorder.

Cet ADR **complète** ADR-0011 (qui reste `Accepté`, non supersédé) sur le
terrain qu'il ne couvrait pas — les fichiers suivis mais gelés — et l'étend
sur la question, orthogonale, de la citation des noms de fichiers.

## Références

- `tools/update_kit.sh` — commentaire de classification (issue n°5,
  « geles_perte ») et garde d'écrasement correspondante.
- `tests/test_update_kit.py` — classe `GardeGelesPerteTest` (T2, T3, T4, T5,
  T8, cas de base assume-unchanged, cas indexé-jamais-committé) et classe
  `NomsAccentuesTest`.
- `docs/adr/0011-apercu-recapitulatif-d-operations.md` — le vocabulaire de
  classification et l'exigence de parité `--dry-run` / réel que cet ADR
  complète.
- `specs/features/doing/bug-003-skip-worktree-echappe-aux-gardes.md` —
  spec d'origine et relevés d'exécution.
