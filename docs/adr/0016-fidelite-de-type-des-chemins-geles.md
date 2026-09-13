# ADR-0016 — La garde de fidélité de type ne porte que sur les ancêtres du chemin, jamais sur sa feuille

## Statut

Accepté

## Date

2026-09-13

## Contexte

`bug-006` a établi qu'un chemin gelé que le kit place **sous** un répertoire
(ex. `.claude/skills/db-migrations/SKILL.md`) pouvait être détruit quand l'un
de ses composants intermédiaires — `.claude/skills/db-migrations` — est, dans
le projet, un **fichier régulier** au lieu d'un répertoire. `[ ! -e "$f" ]`
teste alors le chemin complet de la feuille, qui n'existe évidemment pas sous
un fichier : le kit classait ce cas « à créer », et `git checkout` supprimait
l'obstacle pour créer le répertoire attendu. Relevé réel : sortie 0, contenu
ignoré et donc irrécupérable.

Trois faits, établis par exécution, ont borné la conception :

1. **Ne rien faire et laisser `git checkout` échouer seul ne fonctionne pas.**
   `git checkout` ne connaît pas l'intention « ce chemin doit être un
   répertoire » — il réussit, sortie 0, en remplaçant l'obstacle.
2. **Un traitement en dur du seul cas superficiel (obstacle à la racine
   déclarée) laisse filer le cas profond.** Un fichier ignoré à
   `.claude/agents/sous`, alors que le kit y place un répertoire contenant
   `profil.md`, est détruit par le même mécanisme et n'est protégé par
   aucune vérification limitée aux racines de `.kit-paths`.
3. **Étendre l'invariant à la feuille elle-même casse une garde livrée.**
   `code-reviewer` a muté le code pour inclure la feuille dans le test de
   type : **dix tests préexistants meurent**, tous relevant de la garde de
   `bug-001` (fichier non suivi divergent). La feuille est déjà couverte par
   cette garde-là ; l'y ajouter fait parler **deux gardes sur la même
   exécution**, brisant la diagonale de mutation qu'ADR-0012 impose entre
   tests livrés et code qu'ils protègent.

## Décision

**La garde de fidélité de type (bug-006) porte exclusivement sur les
ANCÊTRES d'un chemin gelé — jamais sur sa feuille.** Pour chaque chemin `$f`
que le kit va écrire, tous les composants de préfixe de `$f` (chemin exclu)
sont examinés, en bash pur, sans appel git : un composant qui est un fichier
régulier (`[ -f ]`) est un obstacle.

Un obstacle **non récupérable** — non suivi (ignoré ou non), ou suivi mais
dont le contenu diverge de `HEAD` — fait échouer la synchronisation réelle
avant tout `git checkout`, en **troisième garde** de la même famille que
`bug-001` et `bug-003`, inactive en `--dry-run` et signalée dans l'aperçu
sous une catégorie dédiée (`obstacles_type`), jamais « à créer ». Un obstacle
suivi et identique à `HEAD` ne bloque rien : comportement d'aujourd'hui
conservé.

La frontière ancêtres/feuille est donc une **règle de conception du script**,
pas un détail d'implémentation : toute garde future touchant à la structure
des chemins gelés doit s'y conformer.

## Alternatives considérées

- **Laisser `git checkout` échouer seul sur l'obstacle** : écarté, réfuté par
  exécution — il n'échoue pas, il réussit (sortie 0) et remplace le fichier
  par le répertoire attendu.
- **Traiter le cas en dur, limité aux racines déclarées de `.kit-paths`** :
  écarté — un obstacle profond (sous une racine légitimement déclarée)
  passerait au travers, puisque rien n'examinerait les composants
  intermédiaires non déclarés séparément.
- **Un invariant unique couvrant ancêtres ET feuille** : écarté, réfuté par
  mutation — `code-reviewer` a vérifié qu'inclure la feuille dans le test de
  type fait mourir dix tests préexistants de la garde de `bug-001`. Ce n'est
  pas un argument théorique : deux gardes parleraient sur la même exécution,
  et la diagonale de mutation d'ADR-0012 serait rompue sur des tests déjà
  livrés.

## Conséquences

### Positives

- Un fichier ignoré ou non suivi occupant la place d'un répertoire gelé,
  superficiel ou profond, n'est plus jamais détruit en silence : la
  synchronisation refuse, avec le chemin de l'obstacle et les trois issues
  (déplacer, committer, exclure via `.kit-paths`).
- La frontière ancêtres/feuille évite tout chevauchement avec la garde de
  `bug-001` : chaque garde reste seule responsable de son terrain, condition
  vérifiée par mutation.
- `--dry-run` continue de décrire fidèlement ce que l'exécution réelle va
  faire (ADR-0011) : la nouvelle catégorie suit la même convention que les
  cinq précédentes.

### Négatives

- **Une synchronisation qui réussissait peut désormais refuser.** Un projet
  dont un fichier ignoré occupe fortuitement l'emplacement d'un répertoire
  gelé verra sa synchronisation bloquée là où elle passait en silence — et
  détruisait ce contenu sans un mot.
- La remontée des préfixes ajoute, par chemin gelé dont un ancêtre est un
  obstacle, un appel `git ls-files` et deux résolutions de hash — coût
  négligeable au volume actuel de chemins gelés, comme pour les gardes
  précédentes (ADR-0011, ADR-0013).

### Ce que ça verrouille

Toute garde future touchant à la structure des chemins gelés doit distinguer
explicitement ancêtres et feuille, et documenter dans laquelle des deux
catégories un cas nouveau tombe — pour ne pas rouvrir le chevauchement que
cet ADR referme.

### Ce que la décision NE ferme PAS

- **La fidélité du nom** (`bug-003`, `bug-008`) reste irréductible tant que
  l'énumération des chemins transite par une chaîne bash : un composant de
  chemin **du kit** contenant un guillemet sort cité de `git ls-tree`, et le
  test `[ -f ]` de cette garde porte alors sur un mauvais nom. Ce n'est pas
  traité ici.
- **Les liens symboliques** ne sont pas couverts : `[ -f ]` suit un lien, ce
  qui est jugé souhaitable (un ancêtre pointant vers un vrai répertoire ne
  doit pas être vu comme un obstacle), mais ce comportement n'est **pas
  testé** par ce cycle.
- **La fenêtre entre le contrôle et le `checkout`** reste ouverte : le script
  n'est pas atomique, rien n'empêche qu'un obstacle apparaisse entre la
  classification et l'exécution de `git checkout`.
- **Le cas inverse** (un répertoire occupant la place d'un fichier gelé) n'est
  pas traité par cette décision : voir `bug-009`, qui réfute l'hypothèse de
  `bug-006` selon laquelle ce cas était déjà couvert par la garde de
  `bug-001` — vrai seulement pour un répertoire non suivi, pas pour un
  répertoire suivi.

Cet ADR **complète** ADR-0011 (vocabulaire de classification) et ADR-0013
(détection par fichier, jamais sur un état global de l'arbre) sur un terrain
qu'ils ne couvraient pas — la fidélité de type des ancêtres — sans en
modifier le corps.

## Références

- `tools/update_kit.sh` — bloc de détection d'obstacle (« DÉTECTION
  D'OBSTACLE DE TYPE (bug-006) ») et garde d'écrasement correspondante
  (« GARDE D'ÉCRASEMENT (obstacle de type, bug-006) », marqueur
  `TYPE INCOMPATIBLE`).
- `tests/test_update_kit.py` — classe `GardeObstacleTypeTest` (O1 : obstacle
  superficiel, O2 : obstacle profond, O3 : non-régression suivi/propre, O4 :
  neutralité `--dry-run`, O5 : parité aperçu/réel, O6 : épinglage du cas
  inverse non suivi, déjà protégé par `bug-001`).
- `specs/features/doing/bug-006-fichier-ignore-a-la-place-d-un-repertoire-gele.md`
  — spec d'origine, relevés d'exécution, réfutation datée sur le cas inverse.
- `specs/features/todo/bug-009-repertoire-suivi-a-la-place-d-un-fichier-gele.md`
  — chemin ouvert par la réfutation de l'audit sur le cas inverse suivi.
- `docs/adr/0011-apercu-recapitulatif-d-operations.md`,
  `docs/adr/0012-harnais-de-test-partage-et-doctrine-anti-chevauchement.md`,
  `docs/adr/0013-detection-par-fichier-et-noms-cites.md` — ADR complétés,
  non modifiés.
