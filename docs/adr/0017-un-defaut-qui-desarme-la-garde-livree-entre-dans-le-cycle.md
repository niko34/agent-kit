# ADR-0017 — Un défaut qui rend inatteignable la garde livrée entre dans le cycle qui la livre

## Statut

Accepté

## Date

2026-09-13

## Contexte

`CLAUDE.md` impose **une spec à la fois**, et l'`orchestrator` en tire une règle
appliquée mécaniquement depuis le début du chantier : tout constat hors périmètre
est **reporté** dans sa propre spec, *« jamais absorbé »*. Cette règle est ce qui
rend les cycles fermables — sans elle, chaque audit rouvre le cycle qu'il conclut.

Elle a produit un défaut de fond, établi par exécution le 2026-09-13.

`bug-008` (un nom contenant un guillemet ou un retour-ligne reste **cité** par
git malgré `core.quotepath=off`) est connu, ouvert et documenté comme
« résiduel **préexistant** » depuis le cycle `bug-003`. Il a été reporté trois
fois de suite, correctement au regard de la règle : il ne relevait du périmètre
d'aucun des cycles qui l'ont croisé.

Or il ne se contente pas de coexister avec les gardes de cette famille : il les
**neutralise**. Relevé brut, kit contenant `.claude/agents/a"b.md`, projet
contenant à cette place un **répertoire suivi** abritant un fichier **ignoré** :

```
$ git -c core.quotepath=off ls-tree -r --name-only HEAD
".claude/agents/a\"b.md"            ← cité MALGRÉ quotepath=off

$ ./tools/update_kit.sh --dry-run
  À CRÉER (1)
       ".claude/agents/a\"b.md"

$ ./tools/update_kit.sh ; echo $?
0
        → répertoire détruit, fichier ignoré DISPARU
```

Le chemin est classé **« À CRÉER »**, parce que `[ ! -e "$f" ]` teste un nom qui
n'existe pas sur le disque. Il **court-circuite avant** la branche où vit la
garde de `bug-006`, et avant celle que `bug-009` allait y ajouter.

La garde n'est donc pas *contournée* : elle est **inatteignable**. Livrer
`bug-009` seul revenait à livrer une protection dont on savait déjà qu'elle ne
s'appliquerait pas à toute une classe de noms — et à l'annoncer comme acquise,
au CHANGELOG et dans une spec close.

Deux faits aggravants, propres à ce projet :

1. **Une protection annoncée qui ne s'applique pas est pire que son absence** :
   elle clôt l'enquête. `bug-006` a livré l'affirmation « ce cas est déjà bloqué
   par la garde de `bug-001` » — fausse, et il a fallu le cycle `bug-009` entier
   pour la réfuter.
2. **Les cinq chemins de destruction de `update_kit.sh` ont tous été trouvés par
   un rôle qui exécute** (AUDIT, debug), **aucun par la revue qui lit**.

## Décision

Trois décisions, prises ensemble.

### 1. Critère d'absorption

Le report reste le **défaut** pour tout constat hors périmètre. Une seule
exception, non négociable :

> **Un défaut qui désarme ou rend inatteignable la garde que le cycle livre se
> traite dans ce cycle, avant elle.** Il n'est pas reportable.

Le critère est **mécanique**, pas prudentiel : il ne demande pas si le défaut est
« lié » ou « important », mais si la garde qu'on s'apprête à livrer **reste
atteignable** en sa présence. La réponse s'établit **par exécution**.

Un cycle peut ainsi porter **plusieurs specs dans `doing/`**, avec une **seule**
phase de test, de revue et de documentation. C'est une exception écrite à la
règle « une spec à la fois », pas une entorse tacite.

Les défauts qui ne désarment rien restent **reportés, nommément**.

### 2. Une garde se conçoit et se relit par son *atteignabilité*

`architect` dit, pour toute garde qu'il conçoit : par où on l'atteint, quel cas
voisin ne doit **pas** la déclencher, et si un défaut ouvert la rend
inatteignable.

`code-reviewer` ne l'approuve qu'après avoir **exécuté** un cas qui doit la
déclencher **et** un cas voisin qui ne doit pas — et après avoir remonté le
chemin jusqu'à elle. Une garde livrée **morte** est une issue **bloquante**.

`security-reviewer` ne classe **jamais** « à reporter » un constat
d'inatteignabilité.

### 3. Une affirmation sur le comportement existant s'établit par exécution

Pour `architect` et `code-reviewer`, comme c'était déjà le cas pour `debugger` et
`security-reviewer` : une affirmation du type « ce cas est déjà traité »,
« cette branche n'est jamais atteinte », « l'outil se comporte ainsi » se
vérifie par exécution, ou s'écrit **« hypothèse non vérifiée »**.

Une hypothèse annoncée comme telle est recevable. Une affirmation fausse
présentée comme un fait est la faute la plus coûteuse mesurée sur ce projet :
**quatre fois** un auteur a eu raison sur la conclusion et tort sur la cause.

## Alternatives écartées

- **Ne rien changer, reporter comme avant.** Écartée par le relevé ci-dessus :
  elle conduit à livrer des gardes mortes et à les annoncer comme acquises. Le
  coût n'est pas un cycle de plus, c'est une **fausse assurance**.
- **Absorber tout constat trouvé en cycle.** Écartée : aucun cycle ne fermerait
  jamais, puisque chaque audit en trouve. C'est précisément ce que la règle de
  report protège, et elle reste le défaut.
- **Juger « au cas par cas » si un constat est assez lié.** Écartée : c'est le
  régime qui a produit le défaut. Trois reports successifs de `bug-008` étaient
  chacun défendable ; c'est leur cumul qui ne l'était pas. Le critère devait
  devenir **vérifiable par exécution**, pas rester une appréciation.
- **Fusionner les specs de la famille en une seule.** Écartée : `done/` encode
  l'histoire du projet cycle par cycle, et ADR-0012 fait dépendre la diagonale
  de mutation de la séparation des gardes. Un cycle peut porter plusieurs specs
  **sans** que les specs fusionnent.

## Conséquences

- `CLAUDE.md` porte l'exception à « une spec à la fois ».
- `architect`, `code-reviewer`, `orchestrator`, `security-reviewer` et
  `test-engineer` sont modifiés en conséquence ; les profils Copilot de
  `.github/agents/` sont régénérés depuis eux.
- Le premier cycle sous ce régime traite **`bug-008` puis `bug-009` ensemble**.
- `check_specs.sh` continue d'interdire une même spec dans deux dossiers. Il
  n'interdit pas — et ne doit pas interdire — **deux specs distinctes** dans
  `doing/`.

## Ce que cet ADR ne ferme pas

- Il ne dit pas **combien** de specs un cycle peut porter. Le critère est
  qualitatif et borné par l'atteignabilité ; si un cycle devait en absorber
  trois ou plus, c'est le découpage du chantier qu'il faudrait revoir, pas le
  critère qu'il faudrait étirer.
- Il ne rend pas la revue capable de trouver ce que l'audit trouve. Il lui
  impose d'exécuter les gardes qu'elle approuve — c'est moins que chercher, et
  c'est ce qui manquait.
- `bug-005` (caractère invisible non affiché) et `bug-007` (blocage muet)
  restent **hors** de ce régime : ils ne désarment aucune garde.
