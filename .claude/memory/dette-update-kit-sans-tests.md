---
name: dette-update-kit-sans-tests
description: "update_kit.sh : 71 tests, 11 défauts corrigés ; lots feature-013 et 014 restants"
metadata:
  type: project
---

`tools/update_kit.sh` est **le composant le plus dangereux du kit** : il écrase
des fichiers suivis dans les dépôts des projets. Il n'a **aucune suite de tests**.

Ses **quatre défauts ont tous été trouvés en le lançant**, jamais en le relisant,
le 2026-09-12 lors de sa première installation dans un vrai projet :

1. `--dry-run` exigeait un arbre propre — alors qu'il n'écrit rien ;
2. `.kit-paths` ne gouvernait pas les chemins **conditionnels** : l'aperçu
   annonçait le remplacement d'un fichier de CI portant un contrôle de sécurité
   absent du kit ;
3. l'aperçu affichait des fichiers **protégés** comme sur le point d'être
   modifiés — or c'est sur cet aperçu qu'on décide ;
4. la régénération des profils Copilot se déclenchait sur la seule présence de
   `.github/`, et échouait **après avoir tout écrit correctement**.

Un cinquième, cosmétique, reste ouvert : l'aperçu présente les fichiers **non
suivis** comme des suppressions (`git diff` ne les voit pas), alors qu'ils seront
ajoutés.

**Spec écrite le 2026-09-12** : `specs/features/todo/feature-006-tests-de-update-kit.md`
— harnais fabriquant de vrais dépôts git jetables, 17 garanties à couvrir, un
cas par garantie (deux gardes dans un même cas se masquent mutuellement).
Le cinquième défaut a sa propre spec, `bug-001`, qui **dépend** de feature-006 :
sans harnais, le critère « test vu échouer avant le fix » est inatteignable.

## Mise à jour du 2026-09-12 — bug-001 clos (`189ad9f`)

Le script a enfin des tests : `tests/test_update_kit.py`, 4 cas, ajouté aux
`CHEMINS` pour descendre avec le script. **feature-006 reste entière** (17
garanties, cas limites, jobs CI GitHub et GitLab).

Le 5e défaut, classé cosmétique, ne l'était pas : il **détruisait du travail
irremplaçable en silence** (fichier ignoré par `.gitignore`, écrasé sans
avertissement, garde d'arbre propre aveugle aux fichiers ignorés).

Trois défauts trouvés pendant le cycle, aucun par relecture — encore :
- **mutation** → un test passait pour la mauvaise raison (deux gardes se
  recouvraient dans un même cas, `.gitignore` non committé dans `setUp`) ;
- **revue** → le harnais écrivait dans le VRAI dépôt (`GIT_DIR` non neutralisé) ;
- **audit** → `--dry_run` mal orthographié déclenchait une synchro RÉELLE.

Deux constats graves reportés : [[chantiers-ouverts-apres-bug-001]].

## Mise à jour du 2026-09-13 — bug-003 clos (`a9d615d`)

55 tests. Septième défaut corrigé, et le pire de la série : **`git ls-tree`
cite les noms non-ASCII sous `core.quotepath`**. Un `révision.md` sortait en
`"r\303\251vision.md"`, échouait au test d'existence, était classé « À CRÉER »
et se faisait écraser — **toutes les gardes contournées par le nom seul**, sur
un kit francophone.

Quatre agents avaient validé le cycle avant que l'AUDIT ne le trouve. Aucun
n'avait mis d'accent dans un nom de fichier.

**Deux règles à retenir, codifiées dans ADR-0013** :
- toute garde se décide **par fichier**, jamais sur un état global de l'arbre
  (un test global est vrai en réel et faux en `--dry-run`) ;
- on teste la **règle**, pas ses cas fréquents — deux fois en un cycle une
  énumération a manqué ce que la règle couvrait (`S`/`h` au lieu de « toute
  minuscule », puis `[a-z]` au lieu de `[[:lower:]]`).

## Mise à jour du 2026-09-13 — feature-012 close (`a9fa22d`)

**71 tests**, `shellcheck` à **zéro** (le `SC2086` préexistant a disparu par
construction). Onze défauts corrigés au total sur ce script.

`.kit-paths` a désormais une **grammaire** (ADR-0015). Quatre défauts fermés :
CRLF perdait tout le périmètre, un chemin avec espace était découpé, un chemin
déclaré absent était avalé, et le **glob `*` était expansé contre le projet** —
donc un `.claude/agents/*` ne recevait jamais un fichier ajouté par le kit.

⚠️ **Deux changements pour les consommateurs** : un `*` devient littéral (donc
signalé absent), et un chemin ne peut plus commencer ni finir par une espace ni
contenir un `#` — le prix des espaces intérieures.

**Reste** : `feature-013` (garanties 3, 4, 8, 9) et `feature-014` (10 à 13),
plus `bug-005` (le message ne montre pas un caractère invisible).
