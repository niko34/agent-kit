# ADR-0018 — `bug-008` se ferme par refus nommé, et la partition de fidélité de type se referme sur la feuille répertoire suivi

## Statut

Accepté

## Date

2026-09-13

## Contexte

Premier cycle mené sous [ADR-0017](0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md) : `bug-008` (un nom de fichier cité par git malgré `core.quotepath=off`) désarmait la garde que `bug-009` (un répertoire **suivi** occupant la place d'un fichier gelé) allait livrer — le chemin cité se classe « à créer » via `[ ! -e "$f" ]`, et court-circuite avant toute branche où vivraient les gardes de `bug-006` et `bug-009`. Les deux specs ont donc été traitées **dans le même cycle**, `bug-008` d'abord.

Trois décisions de conception, plus deux constats de destruction trouvés par l'audit **après** le plan de l'architecte, sur des cas que le plan ne couvrait pas encore.

## Décision

### 1. La partition de fidélité de type se referme

La garde de fidélité de type (`bug-006`) porte sur les **ancêtres** d'un chemin gelé. **Quatre** gardes se partagent désormais l'ensemble des cas :

- **ancêtres** (obstacle de type quelconque) → `bug-006` ;
- **feuille non suivie** → `bug-001` (garde d'écrasement, non-suivi divergent) ;
- **feuille répertoire suivi** → `bug-009` (garde neuve, ce cycle).

[ADR-0016](0016-fidelite-de-type-des-chemins-geles.md) reste **immuable et non réécrit** : il interdisait d'étendre *sa* garde (ancêtres) à la feuille — mesuré à l'époque : dix tests préexistants meurent par chevauchement. `0018` ajoute une garde **distincte** (`repertoire_en_travers`) sur un terrain que `bug-001` ne peut **structurellement** pas atteindre, puisqu'un répertoire non suivi ou vide échoue à `git ls-files --error-unmatch` et ne peut jamais entrer dans la branche « suivi » où vit la garde neuve. La diagonale de mutation d'ADR-0012 est préservée, vérifiée par mutation.

### 2. `bug-008` se ferme par refus nommé, pas par dé-citation ni lecture NUL

Le discriminant retenu, `case "$f" in '"'*`, est **exact** et non heuristique : un nom brut ne peut jamais commencer par un guillemet double, puisque la seule présence d'un tel caractère force git à citer le nom entier. Git cite un nom sous ce discriminant dans **quatre** classes de caractères, vérifiées par exécution — guillemet, retour à la ligne, **tabulation**, **antislash** — pas seulement les deux annoncées par la spec d'origine. Les noms **accentués** (non-ASCII) restent bruts sous `quotepath=off` : non-régression de `bug-003` confirmée.

Les deux issues alternatives ont été écartées **par exécution**, pas par préférence :

- **Dé-citer nous-mêmes le nom** aggrave le défaut plutôt que de le fermer. Les listes internes du script (`a_creer`, `a_maj`, `non_suivis_perte`…) sont des chaînes jointes par retours à la ligne, comptées par `grep -c .` et dédoublonnées par `sort -u`. Un nom dé-cité qui contiendrait lui-même un retour à la ligne se scinderait en **deux entrées fantômes** dans chaque liste, chaque compteur et chaque garde — cette issue exigerait la suivante pour être sûre.
- **Lecture délimitée par NUL** (`ls-tree -z` + `read -d ''` + substitution de processus) est correcte par construction, mais la boucle des orphelins utilise `comm -23`, qui devrait alors passer en `-z` : GNU `comm` porte `--zero-terminated`, **BSD `comm` (macOS, cible bash 3.2 déclarée du script) ne le porte pas — hypothèse non vérifiée, faute de macOS**. Refuser un défaut réel au prix d'une portabilité non établie a été jugé pire que le refus nommé.

Un chemin dont le nom sort cité fait donc échouer la synchronisation réelle avec un message qui nomme les quatre classes et propose deux issues (renommer, exclure via `.kit-paths`) — jamais classé « à créer », jamais écrasé en silence.

### 3. L'écart de grain détection/écriture est constaté, assumé, non fermé

La détection de chaque garde de cette famille est **par fichier** (ADR-0013, décision 1). L'écriture, elle, se fait `git checkout "$DISTANT/$BRANCHE" -- "${presents[@]}"` où `presents` contient les **racines déclarées** (`.claude/agents`, `tools/`…), pas les listes classées fichier par fichier. Les gardes de cette famille ne protègent donc pas un fichier isolé : elles **autorisent ou refusent la synchronisation entière**.

> **Correction d'une affirmation erronée du plan initial, établie par exécution.** Le plan affirmait qu'une détection manquée « laisse passer tout le sous-arbre de la racine ». **C'est faux.** `git checkout <ref> -- <racine>` n'écrit que les chemins qui existent réellement sous `<racine>` dans la référence `<ref>` — pas un `remove_subtree` aveugle de la racine entière. Une détection manquée détruit **ce chemin et ses ancêtres non-répertoires en travers**, pas la racine dans son ensemble. La formulation précédente est réfutée ici, pas réécrite ailleurs : voir ADR-0017, décision 3 (une affirmation sur un comportement s'établit par exécution ou porte « hypothèse non vérifiée »).

Cet écart de grain reste ouvert : ce n'est pas ce cycle qui le ferme.

### 4. Deux chemins de destruction trouvés par l'audit après le plan

Non reportables sous ADR-0017 : ils rendaient la garde livrée par ce cycle inatteignable sur leurs classes respectives.

- **Un fichier gelé par bit, situé après un voisin propre dans l'ordre alphabétique, échappait à la détection.** La première version de la détection de contenu perdu dans `repertoires_travers` ne lisait que la **première** entrée de `git ls-files -v -- "$f" | head -n1` — l'ordre alphabétique décidait donc arbitrairement si le fichier gelé divergent était vu. Corrigé : **toutes** les entrées sont désormais examinées.
- **Un sous-module git en travers d'un fichier gelé détruisait tout l'historique du dépôt embarqué**, avec une sortie 0 — le défaut le plus grave de toute la famille. `git status` et `git ls-files --others` sont vides sur ce cas (le sous-arbre du sous-module n'est pas indexé par le superprojet) : sans détection dédiée, il tombait dans la même case que le répertoire suivi ordinaire, et `git checkout` faisait disparaître son `.git`. Marqueur **distinct** `sous_module` — le remède (sauvegarder ou désinitialiser le sous-module) n'a rien à voir avec « committer du contenu non suivi ».

### Ce que cet ADR ne ferme pas

- `bug-005` (caractère invisible non affiché dans les messages) reste hors régime : il ne désarme aucune garde.
- `bug-007` (blocage muet sur un chemin épinglé non divergent) reste hors régime pour la même raison. L'audit de ce cycle y a reporté un cas neuf : un **FIFO** qui fait bloquer `git hash-object` **indéfiniment** — pas seulement un échec, un blocage.
- `feature-013` reçoit un constat neuf : un **sous-module** occupant la place d'un **répertoire** attendu par le kit (pas d'un fichier — cas symétrique et distinct de la décision 4 ci-dessus) ne détruit rien de connu, mais les fichiers du kit sont alors écrits **dans** le worktree du sous-module, et son gitlink (mode `160000`) peut devenir une entrée `100644` ordinaire aux yeux du projet — aperçu muet sur ce point.
- `feature-014` (état laissé par un `checkout` partiellement échoué) reste également ouvert.
- **Non vérifié, à défaut d'environnement** : BSD `comm` (macOS), une locale non-C, un système de fichiers insensible à la casse.

## Alternatives considérées

Voir décision 2 pour les deux alternatives à `bug-008` (dé-citation, lecture NUL), écartées par exécution et non par préférence.

- **Étendre la garde d'ADR-0016 (ancêtres) à la feuille**, plutôt qu'une quatrième garde distincte : écarté, déjà tranché par ADR-0016 lui-même (dix tests morts par mutation) ; le rouvrir ici aurait été une régression du cycle précédent.
- **Fusionner `bug-008` et `bug-009` en une seule garde/un seul marqueur** : écarté — les deux mécanismes sont indépendants (citation du nom vs. type de la feuille), et un marqueur partagé aurait cassé l'anti-chevauchement d'ADR-0012 en rendant la matrice de mutation non diagonale.

## Conséquences

### Positives

- Un nom de fichier contenant un guillemet, un retour à la ligne, une tabulation ou un antislash ne peut plus être écrasé en silence : la synchronisation refuse nommément, avant toute classification en aval.
- Un répertoire **suivi** contenant du contenu irrécupérable, occupant la place d'un fichier gelé, ne peut plus être détruit en silence — quel que soit l'endroit, dans l'arborescence, où se trouve ce contenu (correction du piège `head -n1`).
- Un sous-module en travers d'un fichier gelé ne peut plus perdre son historique embarqué en silence, sortie 0.
- La partition **ancêtres / feuille non suivie / feuille répertoire suivi /
  feuille sous-module** est vérifiée sans chevauchement par mutation. Le
  sous-module vit dans la branche « feuille répertoire suivi » — il y est
  atteint par le même `git ls-files --error-unmatch` réussi — mais il porte sa
  **propre garde** et son **propre marqueur** (`sous_module`), parce que la
  perte (l'historique d'un dépôt entier) et le remède (sauvegarder ou
  désinitialiser, jamais « committer le contenu non suivi ») n'ont rien de
  commun avec ceux d'un répertoire ordinaire.
- **Complète pour les cas connus, pas close par principe.** Deux des quatre
  gardes ont été ajoutées *pendant* ce cycle, sur constat d'audit — après que
  le plan eut déclaré la partition refermée. Ce qui est verrouillé ici, c'est
  **la forme** de la partition (par où l'on atteint chaque garde), pas la
  certitude qu'aucun cinquième terrain n'existe.

### Négatives

- **Une synchronisation qui réussissait peut désormais refuser**, sur une classe de noms plus large qu'annoncé au départ (quatre caractères, pas deux) : un projet portant un tel nom sous un chemin gelé ne pourra plus synchroniser sans renommer ou exclure via `.kit-paths`.
- L'écart de grain détection/écriture (décision 3) reste ouvert : chaque garde de cette famille protège moins que ce que sa formulation isolée pourrait laisser croire, puisqu'elle statue sur toute une racine déclarée.
- Trois classes de terrain restent non couvertes et documentées comme telles : `bug-007` (FIFO bloquant), `feature-013` (sous-module en travers d'un répertoire attendu), `feature-014` (échec partiel).

### Ce que ça verrouille

Toute garde future de cette famille doit déclarer explicitement si elle porte sur un ancêtre ou sur la feuille, et vérifier par mutation qu'elle ne chevauche aucune garde existante — la partition ancêtres/feuille-non-suivie/feuille-répertoire-suivi ne doit pas être rouverte sans un ADR qui la supersède.

## Références

- `tools/update_kit.sh` — détection de nom cité (« NOM CITÉ PAR GIT », `bug-008`), détection de répertoire en travers (« RÉPERTOIRE EN TRAVERS », `bug-009`), détection de sous-module en travers (« SOUS-MODULE EN TRAVERS »), variables `noms_cites`, `repertoires_travers`, `sous_modules`.
- `tests/harnais_kit.py` — `MARQUEURS_DE_GARDE` : clés `nom_cite`, `repertoire_en_travers`, `sous_module`.
- `tests/test_update_kit.py` — classes `NomsCitesTest`, `RepertoireEnTraversTest`, `RepertoireEnTraversTousLesEtatsTest` (cas C1, contenu perdant après un voisin propre dans l'ordre alphabétique), `SousModuleEnTraversTest` (cas C2).
- `specs/features/doing/bug-008-noms-cites-par-git-malgre-quotepath.md`,
  `specs/features/doing/bug-009-repertoire-suivi-a-la-place-d-un-fichier-gele.md` — specs de ce cycle, relevés bruts.
- [ADR-0016](0016-fidelite-de-type-des-chemins-geles.md), [ADR-0017](0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md) — complétés, non modifiés.
