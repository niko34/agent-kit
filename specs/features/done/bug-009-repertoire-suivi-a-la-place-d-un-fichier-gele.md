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

## ⚠️ Traité conjointement avec `bug-008` (décision du 2026-09-13)

Établi par exécution : un composant de chemin **du kit** contenant un guillemet
sort **cité** de `ls-tree` malgré `core.quotepath=off`. Le chemin est alors
classé **« À CRÉER »** — il court-circuite sur `[ ! -e "$f" ]`, qui teste un nom
qui n'existe pas sur le disque — et il n'atteint donc **jamais** la branche où
vivrait la garde de ce cycle. Le répertoire suivi est détruit, son contenu
ignoré avec, **sortie 0**.

La garde de `bug-009` n'est pas *contournée* par `bug-008` : elle est rendue
**inatteignable**. `bug-008` est donc traité **dans ce cycle**, et **avant**,
selon le critère : *un défaut qui désarme la garde en cours de livraison se
traite dans le cycle qui la livre*. Voir le relevé complet dans
`specs/features/doing/bug-008-noms-cites-par-git-malgre-quotepath.md`.

## Symptôme observé

Un **répertoire suivi** occupant la place d'un **fichier gelé** est **supprimé
entièrement** par la synchronisation, avec tout ce qu'il contient — y compris
les fichiers **ignorés**, donc irrécupérables. Le script sort en **0**.

**Relevé établi par exécution le 2026-09-13**, sur dépôts jetables (kit + projet
consommateur, environnement git confiné). `GUIDE.md/` contient `notes.md`
**suivi** et `secret.local` **ignoré** (`.gitignore` : `GUIDE.md/secret.local`).

```
########## AVANT ##########
GUIDE.md est un : directory
  contient : notes.md
  contient : secret.local
ls-files --error-unmatch GUIDE.md : RÉUSSIT (classé suivi)
ls-files --others GUIDE.md        : [GUIDE.md/secret.local ]
git status                        : []

########## APERÇU ##########
→ Ce que la synchronisation va faire :

  À METTRE À JOUR (1)
       GUIDE.md

  IDENTIQUES : 1 fichiers déjà alignés (non listés)

ℹ️  --dry-run : aucune modification appliquée.
   Relance sans --dry-run pour récupérer ces fichiers.

########## SYNCHRONISATION RÉELLE ##########
code de sortie : 0

########## APRÈS ##########
GUIDE.md est un : regular file
secret.local    : DISPARU
notes.md        : disparu (récupérable : suivi)
```

Trois faits à retenir de ce relevé :

- **`git status` est vide** — l'arbre est *propre*. Aucune garde raisonnant sur
  l'état global de l'arbre ne peut voir ce cas : il faut juger **par fichier**
  (ADR-0013, décision 1).
- **`ls-files --error-unmatch` et `ls-files --others` se contredisent** sur le
  même chemin : le premier le dit « suivi », le second liste un contenu
  irrécupérable dedans. C'est ce désaccord qui est le discriminant.
- **Sortie 0** — rien, dans le code de retour ni dans l'aperçu, ne distingue
  cette destruction d'une mise à jour ordinaire.

**Scénario de reproduction** : dans un projet consommateur, créer un
**répertoire** `GUIDE.md/` — là où le kit a un **fichier** — contenant un
`notes.md` **suivi** et un `secret.local` **ignoré**. Lancer
`./tools/update_kit.sh`.

Observé par l'audit : l'aperçu annonce « À METTRE À JOUR `GUIDE.md` », puis le
répertoire entier disparaît, `secret.local` avec lui, **sortie 0**.

### Variantes voisines — où tombe chaque cas AUJOURD'HUI (établi par exécution)

Six dépôts jetables, même kit, `GUIDE.md` variant seul :

| Variante | `--error-unmatch` | `--others` | `--others --exclude-standard` | Garde qui parle |
|---|---|---|---|---|
| **V1** répertoire suivi, contient un ignoré | **réussit** | `GUIDE.md/secret.local` | **vide** ⚠️ | aucune — « À METTRE À JOUR » |
| **V2** répertoire suivi, tout suivi et propre | réussit | vide | vide | aucune (correct) |
| **V3** répertoire **non suivi** (terrain d'`O6`) | **échoue** | `GUIDE.md/libre.md` | idem | `bug-001` (`ecrasement`) |
| **V4** répertoire **vide** | échoue | vide | vide | `bug-001` (`ecrasement`) |
| **V5** suivi, fichier suivi **modifié** | réussit | vide | vide | arbre de travail sale (en réel) |
| **V6** **lien symbolique** suivi | réussit | `000a5636…` (hash !) | vide | aucune — récupérable par git |

Trois conséquences pour le correctif :

1. **`--exclude-standard` est un piège, pas une hygiène.** Sur V1 il rend la sortie
   **vide** : il masque précisément le seul fichier irrécupérable. L'ajouter
   annulerait la garde en silence. À interdire explicitement et à **muter**.
2. **La non-régression d'`O6` est structurelle.** V3 et V4 **échouent** à
   `--error-unmatch` ; une branche placée *après* un `--error-unmatch` réussi ne
   peut pas les atteindre. Ce n'est pas une précaution, c'est une impossibilité —
   et c'est ce qui doit être écrit, plutôt qu'une promesse de vigilance.
3. **V5 et V6 ne sont pas des trous**, mais rien ne les nomme : V5 est arrêté en
   réel par la garde d'arbre sale (vérifié), V6 est intégralement récupérable
   (`hash-object` réussit sur un lien symbolique — il hache la cible comme blob).
   À **décider et écrire** (voir B3), pas à subir.

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

- [x] Dans le scénario de reproduction, la synchronisation **refuse** et le
      répertoire est intact, `secret.local` compris
      (`RepertoireEnTraversTest`)
- [x] Un répertoire dont **tout** le contenu est suivi et propre ne bloque pas
      (non-régression vérifiée)
- [x] L'aperçu ne classe plus ce cas en « À METTRE À JOUR » — catégorie
      dédiée « RÉPERTOIRES EN TRAVERS »
- [x] **`O6` de `bug-006` reste vert et tue toujours son mutant** — la variante
      non suivie ne change pas de garde (vérifié : `GardeObstacleTypeTest`
      toujours au vert, 6/6)
- [x] La garde reste **inactive en `--dry-run`**
- [x] Aucun chemin sensible touché
- [x] Suite verte, avec un test de non-régression **vu échouer sur le code
      d'avant le fix** — et un correctif ultérieur (C1, `head -n1` →
      parcours complet des entrées) vu échouer à son tour avant fix
- [x] Matrice de mutation **diagonale** (ADR-0012), fragment déclaré —
      marqueurs `repertoire_en_travers` et `sous_module` disjoints des douze
      autres, vérifiés dans les deux sens
- [x] Lint propre (`shellcheck`), pas de warning nouveau

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

---
# Notes d'implémentation

## Plan (architect) — cycle conjoint `bug-008` puis `bug-009`

**Approche** : refuser nommément tout nom sorti **cité** par git (avant toute
classification), puis ajouter une quatrième garde de la famille sur la **feuille
répertoire suivi**, à l'intérieur de la branche « suivi ».

**Étapes**
1. `update_kit.sh` l. ~415-418 : init `noms_cites=""`, puis en **tête** de boucle,
   avant le bloc `bug-006` : `case "$f" in '"'*) noms_cites+=…; continue ;; esac`
2. l. ~563 : ajouter `[ -z "$noms_cites" ]` **et** `[ -z "$repertoires_travers" ]`
   au court-circuit « déjà aligné » — sans quoi les deux gardes sont livrées mortes
3. Récapitulatif : deux catégories dédiées, jamais « À CRÉER » ni « À METTRE À JOUR »
4. l. ~509, **après** le `continue` du non-suivi et **avant** le premier
   `hash_local=` : `[ -d "$f" ] && [ ! -L "$f" ]` puis
   `git ls-files --others -- "$f"` non vide → `repertoires_travers`, `continue`
5. Gardes après la sortie `--dry-run`, avant `checkout` : `noms_cites` **en premier**
6. `harnais_kit.py` : deux entrées neuves dans `MARQUEURS_DE_GARDE`
7. `test_update_kit.py` : `NomsCitesTest` et `RepertoireEnTraversTest`
8. `docs/adr/0018-…` (3 décisions) + `CHANGELOG.md`

**Issue retenue pour `bug-008` : le refus nommé (issue 3).** Les deux autres sont
écartées **par exécution**, pas par préférence :

- *Dé-citer nous-mêmes* — **aggrave**. Les listes (`a_creer`, `a_maj`,
  `non_suivis_perte`…) sont des chaînes **jointes par retours-ligne**, comptées
  par `grep -c .` et dédoublonnées par `sort -u`. Un nom dé-cité contenant un
  retour-ligne se scinde en **deux entrées fantômes** dans chaque liste, chaque
  compteur et chaque garde. L'issue 1 exigerait donc l'issue 2 pour être sûre.
- *Lecture NUL* — correcte par construction, mais `comm -23` de la boucle
  orphelins devrait passer en `-z` : GNU `comm` a `--zero-terminated`, **BSD
  `comm` (macOS, cible bash 3.2 déclarée) ne l'a pas — hypothèse non vérifiée**,
  faute de macOS. On refuserait un défaut réel au prix d'une portabilité non
  établie.

**Atteignabilité (ADR-0017)** — `nom_cite` : arbre propre → chemin dans le
périmètre → `ls-tree` le sort cité. Ne doit **pas** se déclencher sur un nom
accentué (sorti brut, vérifié). `repertoire_en_travers` : nom non cité (donc
**après** `bug-008`) → pas d'ancêtre obstacle → `-e` vrai → `--error-unmatch`
**réussit** → `-d` et non `-L` → `--others` non vide.

**Non-régression d'`O6` : par impossibilité, pas par prudence.** Atteindre la
branche neuve **exige** un `--error-unmatch` réussi. Or V3 (répertoire non suivi,
terrain d'`O6`) et V4 (répertoire vide) y **échouent** : ils prennent le
`continue` du bloc non-suivi et finissent en `non_suivis_perte` → garde
`ecrasement`. Ils ne peuvent pas atteindre la garde neuve.

**Verdict ADR : requis — `ADR-0018`, un seul, trois décisions.** Les 4 critères
sont remplis. (1) La **partition de fidélité de type se referme** : ancêtres →
`bug-006` ; feuille **non suivie** → `bug-001` ; feuille **répertoire suivi** →
`bug-009`. ADR-0016 reste **immuable et non réécrit** — il interdisait d'étendre
*sa* garde à la feuille (dix tests morts) ; `0018` ajoute une garde **distincte**
sur un terrain que `bug-001` ne peut structurellement pas atteindre. (2) Le choix
du refus pour `bug-008` tient dans le même ADR : même famille, même cycle. (3)
L'écart de grain détection/écriture est **constaté, assumé, non fermé**.

**Marqueurs** : `nom_cite` → `NOM CITÉ PAR GIT` ; `repertoire_en_travers` →
`RÉPERTOIRE EN TRAVERS`. Disjonction vérifiée mécaniquement dans les deux sens
contre les dix entrées existantes et entre eux.

## Corrections apportées au plan par l'agent principal (2026-09-13, par exécution)

**1. La classe des noms cités est plus large que ne le dit la spec.** Git cite
aussi la **tabulation** et l'**antislash**, pas seulement le guillemet et le
retour-ligne :

```
CITÉ   "d/a\"b.md"   "d/saut\nligne.md"   "d/tab\tnom.md"   "d/anti\\slash.md"
brut   d/simple.md   d/révision.md        d/apostrophe'.md   d/espace nom.md
```

Le discriminant `case "$f" in '"'*` reste **exact** — un nom brut ne peut pas
commencer par `"`, puisqu'un `"` force la citation. Mais le refus portera sur
**quatre** classes de noms. À dire dans le message et le CHANGELOG : ces
projets-là ne pourront plus synchroniser sans renommer ou exclure via
`.kit-paths`. Les **accentués** restent bruts : non-régression de `bug-003`
confirmée.

**2. La ligne « contenu indexé jamais committé » de la convention est fausse.**
L'architecte l'avait honnêtement marquée « hypothèse non vérifiée ». Établi :

```
$ git add GUIDE.md/neuf.md      # indexé, jamais committé
$ git status --porcelain
A  GUIDE.md/neuf.md
$ ./tools/update_kit.sh
❌ Arbre de travail sale — ce script écrase des fichiers suivis.
   A  GUIDE.md/neuf.md
état final : GUIDE.md = directory | neuf.md = intact
```

Ce cas est **déjà** arrêté en réel par la **garde d'arbre de travail sale**, qui
coupe avant le fetch et avant toute classification — `git add` salit l'arbre. La
convention correcte est donc **identique à V5** : rien de spécial à écrire, pas
de blocage conservateur supplémentaire. En `--dry-run`, il apparaît en
`a_maj`, comme V5.

## Convention retenue pour les cas limites de `bug-009`

| Cas | Classement | Motif (établi par exécution) |
|---|---|---|
| Répertoire **vide** | inchangé — `ecrasement` | `--error-unmatch` échoue : la branche neuve est inatteignable |
| Répertoire **non suivi** (`O6`) | inchangé — `ecrasement` | idem |
| Contenu suivi **modifié** (V5) | inchangé — arbre sale en réel, `a_maj` en dry-run | `--others` vide |
| Contenu **indexé jamais committé** | idem V5 | `git add` salit l'arbre — **corrigé**, voir ci-dessus |
| **Lien symbolique** vers fichier ou répertoire (V6) | jamais bloquant, via `[ ! -L "$f" ]` | vers un répertoire : `-d` OUI, `-L` OUI, `hash-object` échoue, `--others` vide |

---

## Statut final

✅ **Done — 2026-09-13.** Premier cycle mené sous **ADR-0017** — et le premier
à porter **deux specs** dans `doing/`.

**Cycle réel** : `orchestrator` → `spec-reader` (qui a réfuté une affirmation de
l'agent principal) → `architect` → `backend-developer` → `test-engineer` →
`code-reviewer` **[Request changes]** → `security-reviewer` rôle **AUDIT**
**[2 chemins de destruction neufs]** → `backend-developer` →
`test-engineer` (**réouverture 1**) → `code-reviewer` **[Request changes]** →
`backend-developer` → `test-engineer` (**réouverture 2**) → `code-reviewer`
**[Approved]** → `doc-writer` → corrections finales → clôture.

**Trois réouvertures de la phase de test**, toutes déclenchées par la clause
d'ADR-0017. Compte de cas : **77 → 100**. `shellcheck` 0 tout du long.

**Quatre défauts trouvés APRÈS le plan initial**, aucun n'était dans le
périmètre déclaré des deux specs, aucun n'aurait été traité sous l'ancien
régime :

| # | Défaut | Trouvé par | Pourquoi non reportable |
|---|---|---|---|
| C1 | Fichier **gelé par bit** dans le répertoire en travers — `ls-files -v \| head -n1` ne voyait que la **première** entrée, l'ordre alphabétique décidait | AUDIT | rendait la garde livrée inatteignable sur sa classe |
| C2 | **Sous-module** en travers — `.git` et **tout l'historique embarqué** détruits, sortie 0 | AUDIT | idem ; perte la plus grave de la famille |
| C3 | Commentaire justifiant `[ ! -L "$f" ]` par une affirmation **fausse** sur `hash-object` | revue | documentaire |
| C4 | Garde `sous_module` **inatteignable** : `\| grep -q` sous `set -o pipefail` → SIGPIPE → pipeline 141 → `if` faux | revue | la garde ne marchait **que sur les petits dépôts** |

**Affirmations réfutées pendant ce cycle**, consignées plutôt qu'effacées :

1. « Asymétrie guillemet / retour-ligne » (agent principal) — **fausse** : les
   deux caractères sont identiques, l'écart venait de suivi/non-suivi.
2. « Une détection manquée laisse passer tout le sous-arbre de la racine »
   (agent principal) — **fausse** : le `checkout` n'écrit que les chemins du
   kit. Réfutée par l'audit, par exécution. `ADR-0018` porte la version juste.
3. « `hash-object` réussit sur un lien symbolique en le traitant comme un blob
   de lien » — **fausse** : il **suit** le lien (hash du contenu de la cible),
   et échoue sur un lien vers répertoire ou cassé.
4. « `git ls-files --others` reste vide même avec un non-suivi dans la cible »
   (`test-engineer`) — juste sur le fond, **imprécise** : c'est vrai parce que
   le lien est **suivi**, pas parce que git ne traverse jamais un lien.
5. « 84 tests verts » (`backend-developer`) — **faux**, sous-ensemble mesuré.

**Leçon de méthode non couverte par ADR-0017**, consignée en mémoire projet :
un **dépôt jetable n'est pas un petit dépôt réel, c'est un dépôt d'une autre
classe**. Tout ce qui dépend d'un **volume** — tampon de tube, `ARG_MAX`, temps
— y est invisible **par construction**. C4 a franchi 99 tests, dix mutations,
une revue et un audit en ne fonctionnant que sur les dépôts fabriqués pour le
tester.

**Verdicts** : `code-reviewer` **Approved sans réserve** (3ᵉ passe) ;
`security-reviewer` rôle **GATE non applicable** (aucun des cinq déclencheurs,
confirmé après lecture du diff entier) ; rôle **AUDIT** : constats traités
ci-dessus, le reste **reporté nommément** vers `bug-005`, `bug-007`,
`feature-013`, `feature-014`.

**Reste ouvert** : `ARG_MAX` sur `git checkout … "${presents[@]}"` avec un
`.kit-paths` très long — **non mesuré**, déclaré comme tel. Portabilité BSD
`comm`, locale non-C, systèmes de fichiers insensibles à la casse : **non
vérifiés**.
