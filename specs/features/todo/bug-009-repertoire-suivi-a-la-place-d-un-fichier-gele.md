# Bug — un répertoire SUIVI à la place d'un fichier gelé est supprimé avec son contenu ignoré

- **Type** : bug (format minimal `specs/modele.md`)
- **Version cible** : 0.7.0
- **Créée** : 2026-09-13 (constat de `security-reviewer` en rôle AUDIT pendant
  le cycle `bug-006`, classé **grave**, **établi par exécution** sur dépôts
  jetables — cas C1 de son rapport)
- **Domaine** : outillage — `tools/update_kit.sh`. Ni auth, ni données
  personnelles. **Mais** : destruction irrécupérable dans le dépôt d'un tiers,
  avec **sortie 0**.
- **Spec liée** : `bug-001`, `bug-003`, `bug-006` — **quatrième chemin de la
  même famille**, et il **réfute une affirmation** de `bug-006`

## Agents requis

- [x] debugger
- [ ] **security-reviewer, rôle GATE** — non coché : aucun des cinq
      déclencheurs. **Rôle AUDIT recommandé** — c'est lui qui a trouvé les
      quatre chemins de cette famille, jamais la revue
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

Un **répertoire suivi** occupant la place d'un **fichier gelé** est **supprimé
entièrement** par la synchronisation, avec tout ce qu'il contient — y compris
les fichiers **ignorés**, donc irrécupérables. Le script sort en **0**.

```
(relevé à produire : l'audit a établi le cas par exécution — C1 — sans conserver
la sortie. PREMIÈRE TÂCHE DU CYCLE : reproduire et coller ici l'état de départ,
la commande, la sortie complète, le code de retour et l'état final.)
```

**Scénario de reproduction** : dans un projet consommateur, créer un
**répertoire** `GUIDE.md/` — là où le kit a un **fichier** — contenant un
`notes.md` **suivi** et un `secret.local` **ignoré**. Lancer
`./tools/update_kit.sh`.

Observé par l'audit : l'aperçu annonce « À METTRE À JOUR `GUIDE.md` », puis le
répertoire entier disparaît, `secret.local` avec lui, **sortie 0**.

## Cause racine

Hypothèse issue de l'audit, **à confirmer par exécution** :

1. `git ls-files --error-unmatch -- GUIDE.md` **réussit** sur un répertoire dès
   qu'il contient au moins un fichier suivi. Le chemin est donc classé comme
   **suivi**.
2. `git hash-object` **échoue** sur un répertoire : le hash local est vide, donc
   différent de celui du kit.
3. Le chemin tombe en **« À METTRE À JOUR »**, catégorie parfaitement inoffensive
   en apparence.
4. `git checkout <tree> -- <chemin>` fait un **`remove_subtree`** sur tout
   répertoire en travers, **sans regarder son contenu**.

⚠️ **Cette découverte réfute une affirmation de `bug-006`.** Ce cycle avait
conclu que le cas inverse — répertoire à la place d'un fichier gelé — était
« déjà bloqué par la garde de `bug-001` ». **C'est vrai uniquement pour un
répertoire NON SUIVI**, où `ls-files --error-unmatch` échoue et fait classer le
chemin en « non suivi divergent ». Le test `O6` de `bug-006` épingle cette
variante-là ; celle-ci lui échappe.

C'est la **même primitive destructrice** que `bug-006` : `remove_subtree`.

## Correctif attendu

1. **À la feuille** du chemin — et non aux ancêtres, contrairement à
   `bug-006` — détecter qu'un chemin gelé attendu comme **fichier** est occupé
   par un **répertoire**.
2. **Bloquer** si ce répertoire contient quoi que ce soit d'irrécupérable :
   `git ls-files --others -- "$f"` non vide (fichiers non suivis ou ignorés).
3. **Ne pas bloquer** si tout son contenu est suivi et propre — il est alors
   entièrement récupérable, comme pour les autres gardes de la famille.
4. **L'aperçu ne doit plus le classer « À METTRE À JOUR »** : c'est une
   suppression, pas une mise à jour.
5. Le message nomme l'obstacle, **ce qui sera perdu**, et les issues.

⚠️ **Fragment disjoint** : `MARQUEURS_DE_GARDE` porte déjà `SANS RETOUR
POSSIBLE`, `MODIFICATION LOCALE INVISIBLE` et `TYPE INCOMPATIBLE`. Le fragment
neuf ne doit être sous-chaîne d'aucun **ni en contenir un** — vérification
mécanique dans les deux sens, le piège a déjà été désamorcé deux fois.

⚠️ **Ne pas casser `O6`** : la variante **non suivie** est protégée aujourd'hui
par la garde de `bug-001`, et `bug-006` l'épingle par un test. Le correctif ne
doit pas déplacer ce cas vers une autre garde — ce serait un hors-diagonale sur
un test livré.

## Critères d'acceptation

- [ ] Dans le scénario de reproduction, la synchronisation **refuse** et le
      répertoire est intact, `secret.local` compris
- [ ] Un répertoire dont **tout** le contenu est suivi et propre ne bloque pas
- [ ] L'aperçu ne classe plus ce cas en « À METTRE À JOUR »
- [ ] **`O6` de `bug-006` reste vert et tue toujours son mutant** — la variante
      non suivie ne change pas de garde
- [ ] La garde reste **inactive en `--dry-run`**
- [ ] Aucun chemin sensible touché
- [ ] Suite verte, avec un test de non-régression **vu échouer sur le code
      d'avant le fix**
- [ ] Matrice de mutation **diagonale** (ADR-0012), fragment déclaré
- [ ] Lint propre (`shellcheck`), pas de warning nouveau

## Notes pour agent

- **Quatrième chemin de la même famille**, et le premier trouvé en **réfutant
  une protection qu'on croyait acquise**. Les trois précédents corrigeaient un
  trou connu ; celui-ci corrige une **croyance**.
- La probabilité est faible — il faut qu'un nom de fichier gelé soit porté par
  un répertoire dans le projet. La conséquence est maximale : suppression
  silencieuse, sortie 0, contenu ignoré irrécupérable.
- L'audit a relevé que ce cas **n'a pas pu être éprouvé sur un échec partiel**
  de `git checkout` : en root sur tmpfs, ni `chmod` ni `chattr +i` ne provoquent
  d'échec d'écriture. L'état laissé par une écriture interrompue reste une
  hypothèse — c'est le terrain de `feature-014`.

## Hors périmètre

- Les gardes de `bug-001`, `bug-003` et `bug-006` : livrées, intactes
- Les noms cités par git — `bug-008`
- Le caractère invisible non montré — `bug-005`
- L'état laissé par un `checkout` partiellement échoué — `feature-014`
