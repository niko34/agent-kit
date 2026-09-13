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

### ⚠️ Correction du relevé ci-dessus — 2026-09-13, établi par exécution

**L'« asymétrie guillemet / retour-ligne » annoncée dans le commit `eccfc51`
est fausse.** Réfutée par `spec-reader`, puis re-vérifiée symétriquement :

| Cas | `git status` avant | Code | Cible | Contenu |
|---|---|---|---|---|
| guillemet, répertoire **suivi** | vide | **0** | fichier régulier | **DISPARU** |
| guillemet, répertoire **non suivi** | `?? .claude/` | 1 | répertoire | intact |
| retour-ligne, répertoire **suivi** | vide | **0** | fichier régulier | **DISPARU** |
| retour-ligne, répertoire **non suivi** | `?? .claude/` | 1 | répertoire | intact |

Les deux caractères se comportent **identiquement**. Ce qui sépare les deux
issues est **suivi / non suivi** : un répertoire non suivi salit l'arbre, et la
**garde d'arbre de travail sale** (l. ~231) coupe **avant** le fetch et avant
toute classification. Le premier relevé comparait deux scénarios qui différaient
sur cette dimension-là, et l'écart a été attribué au caractère.

Aucun mécanisme distinguant guillemet et retour-ligne n'a été trouvé par
exécution. Conséquence de périmètre : **un seul cas à traiter**, pas deux.

### Constat structurel majeur — le `checkout` porte sur les RACINES

Établi en lisant le site d'appel et confirmé par les relevés (`tools/update_kit.sh` l. 726) :

```bash
git checkout "$DISTANT/$BRANCHE" -- "${presents[@]}"
```

`presents` contient les **racines déclarées** (`.claude/agents`, `GUIDE.md`,
`tools/`…), **pas** les listes classées fichier par fichier (`a_creer`,
`a_maj`…). La classification — et donc **toutes** les gardes de la famille —
décide seulement **si** la synchronisation a lieu. Une fois qu'elle a lieu,
c'est le **sous-arbre entier de chaque racine** qui est écrit.

Deux conséquences que l'architecte doit trancher :

1. Une garde qui manque un fichier ne laisse pas passer *ce* fichier : elle
   laisse passer **tout ce qui est en travers sous la racine**. C'est ce qui
   explique la violence du cas cité — le nom cité n'intervient même plus au
   moment du `checkout`.
2. La détection **par fichier** (ADR-0013, décision 1) et l'écriture **par
   racine** ne sont pas sur le même grain. Tant que cet écart existe, chaque
   garde de la famille protège moins que ce que sa formulation laisse croire.

Reporté ici comme **constat de cycle**, pas comme périmètre acquis : c'est à
l'architecte de dire si `bug-008` se corrige sans y toucher, ou si cet écart de
grain doit être fermé d'abord.

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

- [x] Dans le scénario de reproduction, **ni** le nom à retour-ligne **ni** le
      nom à guillemet n'est écrasé en silence (`NomsCitesTest`, quatre classes :
      guillemet, retour-ligne, tabulation, antislash)
- [x] Les noms **accentués** continuent de fonctionner exactement comme
      aujourd'hui — non-régression du correctif de `bug-003`
      (`test_nom_accentue_reste_chemin_nominal_aucune_garde`)
- [x] Si l'issue retenue est le refus, le message dit **pourquoi** le chemin est
      refusé (`NOM CITÉ PAR GIT`, quatre classes nommées, deux issues)
- [x] La liste des orphelins est cohérente avec le choix retenu — le refus
      sort avant le calcul des orphelins, qui n'a donc jamais lieu sur un
      run refusé
- [x] Aucun chemin sensible touché
- [x] Suite verte, avec des tests de non-régression **vus échouer sur le code
      d'avant le fix** (régression documentée dans `NomsCitesTest`)
- [x] Matrice de mutation **diagonale** (ADR-0012) — marqueur `nom_cite`
      disjoint des douze autres, vérifié dans les deux sens
- [x] Lint propre (`shellcheck`), pas de warning nouveau
- [x] bash 3.2 : ni `declare -A`, ni `mapfile`, ni `readarray` — vérifié ;
      `${ligne_interne:0:1}` et `${ligne_interne:2}` sont bash 2.0+

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
