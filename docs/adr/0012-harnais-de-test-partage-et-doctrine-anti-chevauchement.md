# ADR-0012 — Un harnais de test partagé, et la doctrine anti-chevauchement

## Statut

Accepté

## Date

2026-09-13

## Contexte

`tools/update_kit.sh` est le composant le plus dangereux du kit : le seul qui
écrase des fichiers suivis dans le dépôt de quelqu'un d'autre. Sur `bug-001`,
un test de non-régression passait **pour la mauvaise raison** : un
`.gitignore` non committé faisait déclencher la garde d'arbre sale **avant**
la garde qu'on croyait tester, dans un même cas. Casser la seconde garde ne
faisait donc mourir aucun test — le défaut n'a été trouvé qu'en revue, après
coup, jamais par la suite de tests elle-même.

`feature-006` (lot 1) couvre cinq gardes d'usage de ce script, qui se
recouvrent **structurellement** : deux d'entre elles (1 et 2) sont la même
garde vue sous deux angles, et trois autres (14, 15, 16) sortent toutes avant
la classification des fichiers. C'est exactement la configuration qui a
produit le défaut de `bug-001` — le chevauchement n'est pas accidentel ici,
il est inhérent à la forme du script.

## Décision

Trois éléments, ensemble :

a. **Un harnais partagé unique** (`tests/harnais_kit.py`), seul endroit du
   dépôt où l'on fabrique deux dépôts git jetables, les confine contre toute
   fuite vers le dépôt réel, exécute `tools/update_kit.sh`, et observe le
   résultat. Aucun autre fichier de test ne refait ce travail.

b. **`MARQUEURS_DE_GARDE` + `affirmer_seule_garde()`** : un dictionnaire de
   fragments littéraux relevés dans le script (jamais inventés), et une
   fonction qui vérifie que le marqueur attendu est présent **et que tous
   les autres en sont absents**. Un cas qui échouerait pour la mauvaise
   raison — comme sur `bug-001` — échoue désormais lui aussi, mais pour la
   bonne : une garde inattendue qui a parlé fait échouer l'assertion.

c. **Le contrôle de clôture est une matrice de mutation qui doit être
   diagonale** : pour N cas et N gardes visées, chaque mutant qui neutralise
   une garde ne doit tuer QUE le cas qui la vise. Toute case hors diagonale
   (un mutant qui tue un cas qu'il ne visait pas, ou qu'aucun cas ne tue) est
   un chevauchement prouvé, pas une supposition.

**Contrainte imposée aux lots suivants** : `feature-012`, `feature-013`,
`feature-014` et `bug-003` — quatre specs non encore écrites au moment de
cette décision — devront déclarer leur propre clé dans `MARQUEURS_DE_GARDE`
et produire une matrice diagonale pour leurs cas neufs. Ce n'est pas une
recommandation : c'est une obligation qui verrouille la forme des lots
futurs avant qu'ils ne soient écrits.

## Alternatives considérées

- **Un dépôt jetable façonné par garde, sans assertion croisée.** C'est le
  dispositif exact de `bug-001` : chaque cas croyait isoler la garde qu'il
  testait, et rien ne détectait la dérive quand une autre garde tirait la
  première. Écarté parce que c'est la cause du défaut, pas une variante
  acceptable de la solution.

- **Extraire les gardes de `update_kit.sh` en fonctions shell testables
  unitairement.** Isolation parfaite en apparence — chaque garde deviendrait
  directement appelable et vérifiable seule. Écarté : cela réécrit le script
  pour arranger les tests, ce que la spec interdit sauf exception écrite
  (voir S1, ADR non concerné ici), et surtout cela supprime la seule chose
  qui a jamais trouvé des défauts sur ce script — l'exécution de bout en
  bout, dans un vrai dépôt git, avec un vrai `git status`.

- **Écrire les primitives au fil de l'eau, dans chaque lot qui en a
  besoin.** Écarté : cela rouvrirait le confinement — la surface la plus
  sensible du dispositif — à quatre reprises, une par lot, avec un risque de
  divergence à chaque réouverture. Un harnais unique, écrit une fois et
  gelé, ferme cette surface après un seul examen approfondi plutôt que
  quatre partiels.

## Conséquences

### Positives

- Un test qui passait pour la mauvaise raison sur `bug-001` échouerait
  désormais, mécaniquement, sans dépendre d'une relecture attentive.
- Les quatre lots restants héritent du confinement et des primitives sans
  avoir à les rouvrir ni à les réinventer.
- La preuve du non-chevauchement (la matrice diagonale) est un artefact
  reproductible, pas une affirmation dans une revue.

### Négatives

- **Les messages du script deviennent un contrat de test.** Une
  reformulation cosmétique d'un message d'erreur dans `update_kit.sh` (par
  exemple pour améliorer sa lisibilité) casse des cas de test qui n'ont
  pourtant rien à voir avec le comportement qu'elle décrit.
- **Le harnais descend désormais chez les consommateurs** : il fait partie
  des `CHEMINS` synchronisés par `update_kit.sh` (voir S1), et sera donc
  exécuté par la CI de tout projet qui l'a reçu — un poids et une surface
  d'exécution supplémentaires qui ne sont plus internes au kit.
- **Une équivalence de mutation est déclarée et doit le rester** : la boucle
  de préfixes `GIT_CONFIG_KEY_*` / `GIT_CONFIG_VALUE_*` dans
  `_environnement_git_confine` est inerte tant que `GIT_CONFIG_COUNT` reste
  neutralisé juste au-dessus — si `GIT_CONFIG_COUNT` était un jour retiré de
  `VARIABLES_GIT_A_NEUTRALISER` par erreur, cette déclaration cesserait
  d'être vraie sans qu'aucun test ne le signale par lui-même en dehors du
  garde-fou explicite prévu à cet effet.
- **`GIT_CEILING_DIRECTORIES` reste la seule variable de
  `VARIABLES_GIT_A_NEUTRALISER` non éprouvée par un décoy** dans
  `tests/test_harnais_kit.py` : sa justification (aucune commande du
  harnais ne s'exécute avec un `cwd` hors d'un dépôt déjà initialisé) est
  écrite, mais reste, par nature, moins mécaniquement vérifiée que les
  autres.

- **La liste de confinement est défensive, jamais exhaustive — et on ne peut
  pas prouver qu'elle l'est.** Son histoire le montre : réputée complète à
  neuf entrées, elle est passée à onze après qu'un audit eut trouvé trois
  canaux d'un coup, puis à treize après qu'un second en eut trouvé deux de
  plus — dont `GIT_CONFIG`, qui reproduisait **exactement** le dégât de
  l'incident du 2026-09-12 par un autre chemin que celui qu'on venait de
  boucher. Chaque passage a été décidé par le **rendement observé**, pas par
  une preuve de complétude : la recherche s'est arrêtée quand les canaux
  trouvés ont cessé d'appartenir à des familles neuves. Quiconque ajoute une
  entrée plus tard ne corrige donc pas un oubli — il continue un travail qui
  n'a pas de fin démontrable. Le garde-fou qui exige un décoy ou une
  justification écrite par variable est ce qui empêche cette liste de
  redevenir décorative.

### Ce que ça verrouille

- La forme des cas de test des quatre lots restants (`feature-012`,
  `feature-013`, `feature-014`, `bug-003`) : chacun doit déclarer sa clé
  dans `MARQUEURS_DE_GARDE` et produire une matrice diagonale.
- `tests/harnais_kit.py` comme unique point de fabrication/confinement/
  exécution/observation pour toute la suite `update_kit.sh` — un nouveau
  besoin de mise en scène s'ajoute au harnais, il ne se recrée pas ailleurs.

## Références

- `tests/harnais_kit.py` — `MARQUEURS_DE_GARDE` (l. 307-316) et
  `affirmer_seule_garde()` (l. 319-350).
- `tests/test_update_kit.py` — classe `GardesUsageTest`, cas G1/G2/G14/G15/G16.
- `tests/test_harnais_kit.py` — classe `VariablesGitANeutraliserTest`, un
  décoy par variable de confinement.
- `specs/features/doing/feature-006-tests-de-update-kit.md` — items D1/D2.
