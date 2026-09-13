# Bug — un nom contenant un retour-ligne ou un guillemet reste cité par git, et son fichier est écrasé

- **Type** : bug (format minimal `specs/modele.md`)
- **Version cible** : 0.7.0
- **Créée** : 2026-09-13 (résiduel **préexistant** relevé par `code-reviewer`
  pendant le cycle `bug-003`, en marge du correctif `core.quotepath`)
- **Domaine** : outillage — `tools/update_kit.sh`. Ni auth, ni données
  personnelles. **Mais** : écrasement de fichier dans le dépôt d'un tiers.
- **Spec liée** : `bug-003` et **ADR-0013** (le correctif `core.quotepath`, dont
  ce cas est le reliquat), `bug-006` (même famille)

## Agents requis

- [x] debugger
- [ ] **security-reviewer, rôle GATE** — non coché : aucun des cinq
      déclencheurs. **Rôle AUDIT recommandé** : c'est un chemin de destruction
      chez un tiers, et le précédent de cette famille a été trouvé par audit
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## ⚠️ Traité conjointement avec `bug-009` (décision du 2026-09-13)

Ce cycle traite **`bug-008` puis `bug-009` ensemble**, sur décision de
l'utilisateur, en application d'un critère neuf :

> Un défaut découvert pendant un cycle qui **désarme la garde en cours de
> livraison** se traite **dans ce cycle**. Un défaut indépendant garde sa
> propre spec.

Motif établi par exécution (relevé ci-dessous) : un nom cité rend
**inatteignable** la garde que `bug-009` allait livrer, comme celle déjà livrée
par `bug-006`. Livrer `bug-009` seul reviendrait à livrer une protection dont on
sait qu'elle ne s'applique pas.

Ordre imposé : **`bug-008` d'abord** — l'énumération doit être fiable avant
qu'une garde bâtie dessus veuille dire quelque chose — **`bug-009` ensuite**.
Phase de test, revue et documentation **communes aux deux**.

`bug-005` et `bug-007` restent **hors** de ce cycle : ils ne désarment aucune
garde.

Cette décision met **deux specs dans `doing/`**, ce qui plie la règle « une spec
à la fois » de `CLAUDE.md`. Elle doit donc faire l'objet d'un **ADR**, pas d'une
entorse tacite.

## Symptôme observé

`bug-003` a corrigé les noms **non-ASCII** en posant `-c core.quotepath=off` sur
les appels `git ls-tree` / `git ls-files` dont la sortie sert de chemin disque.
Ce correctif est complet pour les accents.

**Mais `core.quotepath=off` ne désactive pas toute citation.** Git cite
**toujours** un nom contenant un **retour à la ligne** ou un **guillemet
double**, quelle que soit cette option. Un tel nom ressort donc entre
guillemets avec ses échappements — `"fichier\navec saut.md"` — échoue au test
d'existence, est classé **« À CRÉER »**, et `git checkout` l'écrase.

C'est **exactement le mécanisme de `bug-003`**, sur le sous-ensemble de noms que
son correctif ne pouvait pas atteindre.

**Relevé établi par exécution le 2026-09-13**, sur dépôts jetables. Cas du
**guillemet**, avec un chemin situé **dans le périmètre du kit** (un premier
essai hors périmètre n'énumérait rien — le filtre `.kit-paths` l'écartait avant
toute classification ; l'essai a été refait) :

```
kit    : .claude/agents/a"b.md            (fichier, contenu « PROFIL DU KIT »)
projet : .claude/agents/a"b.md/           RÉPERTOIRE SUIVI contenant
           notes.md      (suivi)
           secret.local  (IGNORÉ via .gitignore)

$ git -c core.quotepath=off ls-tree -r --name-only HEAD
".claude/agents/a\"b.md"            ← cité MALGRÉ quotepath=off

$ ./tools/update_kit.sh --dry-run
→ Ce que la synchronisation va faire :

  À CRÉER (1)
       ".claude/agents/a\"b.md"

  IDENTIQUES : 1 fichiers déjà alignés (non listés)

$ ./tools/update_kit.sh ; echo $?
0

APRÈS : .claude/agents/a"b.md est un regular file
        secret.local : DISPARU
```

**Confirmation du point de départ** : `code-reviewer` avait raison — `git`
cite ce nom **malgré** `core.quotepath=off`. Ce bug existe.

**Constat neuf, décisif pour le périmètre du cycle** : le chemin est classé
**« À CRÉER »**, pas « À METTRE À JOUR ». Il court-circuite sur `[ ! -e "$f" ]`
— le test porte sur le nom **cité**, qui n'existe pas sur le disque — donc il
n'atteint **jamais** les branches où vivent les gardes de `bug-006` et de
`bug-009`. Un nom cité ne contourne pas ces gardes : il les rend
**inatteignables**.

## Cause racine

Hypothèse à confirmer : `-c core.quotepath=off` ne gouverne que la citation des
octets **non-ASCII**. Les caractères qui casseraient le format de sortie
lui-même — retour à la ligne, guillemet — restent cités **inconditionnellement**,
parce que la sortie de `ls-tree --name-only` est séparée par des retours à la
ligne : un nom qui en contient serait autrement indistinguable de deux noms.

La sortie de `git ls-tree -z` (séparateur NUL) n'a pas ce problème — mais elle a
été écartée par `bug-003` avec un argument à réexaminer : **une variable bash ne
peut pas porter d'octet NUL**, ils y sont supprimés, et les noms se colleraient.
Lire en NUL demanderait `read -d ''` et une substitution de processus, donc une
réécriture des boucles.

## Correctif attendu

`architect` tranche entre trois issues, et **écrit son choix** :

1. **Dé-citer nous-mêmes** le nom retourné par git (interpréter les échappements
   de la citation C) — sûr, mais c'est écrire un parseur, et un parseur
   approximatif rouvrirait le trou.
2. **Passer les boucles concernées en lecture NUL** (`ls-tree -z` + `read -d ''`
   + substitution de processus) — correct par construction, au prix d'une
   réécriture des boucles et d'une contrainte sur bash 3.2 à vérifier.
3. **Refuser nommément** un chemin dont le nom sort cité — le plus simple, et
   conforme à la doctrine du kit : mieux vaut un refus explicite qu'une
   destruction silencieuse. Le message doit alors dire **pourquoi**.

⚠️ **Ce qui est exclu dans les trois cas** : que le fichier soit classé « À
CRÉER » puis écrasé sans un mot. C'est la seule chose que ce bug doit fermer.

⚠️ **Ne pas mutiler les noms légitimes** : le piège d'ADR-0013 vaut ici aussi.
Un correctif qui normaliserait les noms casserait les chemins accentués que
`bug-003` vient de faire fonctionner. Même remarque que pour `bug-005`.

## Critères d'acceptation

- [ ] Dans le scénario de reproduction, **ni** le nom à retour-ligne **ni** le
      nom à guillemet n'est écrasé en silence
- [ ] Les noms **accentués** continuent de fonctionner exactement comme
      aujourd'hui — non-régression du correctif de `bug-003`
- [ ] Si l'issue retenue est le refus, le message dit **pourquoi** le chemin est
      refusé
- [ ] La liste des orphelins est cohérente avec le choix retenu
- [ ] Aucun chemin sensible touché
- [ ] Suite verte, avec des tests de non-régression **vus échouer sur le code
      d'avant le fix**
- [ ] Matrice de mutation **diagonale** (ADR-0012)
- [ ] Lint propre (`shellcheck`), pas de warning nouveau
- [ ] bash 3.2 : ni `declare -A`, ni `mapfile`

## Notes pour agent

- **Probabilité faible, mécanisme réel.** Un nom de fichier contenant un retour
  à la ligne ou un guillemet est improbable dans un kit d'agents. Mais
  `update_kit.sh` tourne dans le dépôt de **quelqu'un d'autre**, dont on ne
  contrôle pas les noms de fichiers — et le coût d'un défaut y est une
  destruction sans retour.
- `code-reviewer` avait relevé, pendant `bug-003`, que **git cite toujours**
  retour-ligne et guillemet « quotepath ou non ». C'est le point de départ à
  vérifier en premier : si c'est faux, ce bug n'existe pas.

## Cas à ajouter — constat de l'audit de `bug-006` (2026-09-13)

⚠️ **La garde livrée par `bug-006` hérite de cet angle mort.** Établi par
exécution : un composant de chemin **du kit** contenant un guillemet sort cité
de `ls-tree` ; le test `[ -f ]` de la garde porte alors sur un **mauvais nom**,
l'obstacle ignoré n'est pas vu, et il est **détruit** — sortie 0.

Ce cas doit être couvert par ce cycle : la garde de `bug-006` ne peut pas être
plus fiable que les noms qu'on lui donne.

## Hors périmètre

- Les noms **non-ASCII** — traités par `bug-003`, ADR-0013 décision 2
- L'affichage du caractère fautif dans un message — `bug-005`
- Le fichier ignoré à la place d'un répertoire gelé — `bug-006`
