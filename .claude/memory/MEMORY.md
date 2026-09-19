# Mémoire du projet agent-kit

## Où l'on est

- [Les deux dépôts, leurs tableaux de bord, leurs sessions](ou-vivent-les-deux-depots.md) — le kit est la source, le firmware un consommateur ; ne jamais éditer `control-center/` côté projet
- [Rétro-documentation + file de travail, poussées](ce-qui-attend-un-commit.md) — 9 ADR + 6 specs rétroactives + 7 specs de la file, au 2026-09-12 au soir

## Préférences utilisateur

- ⭐ [Le push exige un feu vert séparé](push-exige-un-feu-vert-separe.md) — règle enfreinte une fois, signalée
- [Stager `.claude/settings.json` est refusé](stager-settings-json-est-refuse.md) — le refus porte sur TOUTE la commande, pas sur le seul fichier

## Pièges récurrents

- ⭐ [Trois comportements du runtime non documentés](pieges-du-runtime-sur-les-sous-agents.md) — `SubagentStop` sans nom ni ouverture, `SessionEnd` qui ne tue pas la session
- ⭐ [Une justification ne vaut que réfutée](une-justification-ne-vaut-que-refutee.md) — 3 fois en une session : raison sur la conclusion, tort sur la cause
- ⭐ [Un correctif tardif doit rouvrir les tests](un-correctif-tardif-doit-rouvrir-les-tests.md) — suite verte ≠ correctif couvert ; vérifier que le COMPTE augmente
- ⭐ [Le défaut se trouve en exécutant, pas en relisant](le-defaut-se-trouve-en-executant.md) — bilan d'une journée : la mutation et le lancement ont tout trouvé, la relecture rien
- ⭐ [Un faux secret « sûr » peut être le mauvais faux secret](un-faux-secret-sur-peut-etre-le-mauvais.md) — écarté par une garde EN AMONT de celle qu'il vise ; 4 tests inertes, trouvés par mutation
- ⭐ [Un oracle exhaustif prouve la conformité, pas l'absence](un-oracle-exhaustif-prouve-la-conformite.md) — 1 082 400 commandes énumérées, et deux clauses absolvaient les résidus assumés

## Chantiers ouverts

- ⭐ [Centre de contrôle : état et pièges](centre-de-controle-etat-et-pieges.md) — `SessionEnd` ne se déclenche jamais, donc la prémisse de `bug-002` est à réétablir

- [`update_kit.sh` : 71 tests](dette-update-kit-sans-tests.md) — 11 défauts corrigés ; `feature-013` et `014` restants
- ⭐ [Ce que l'audit a laissé ouvert](chantiers-ouverts-apres-bug-001.md) — 3 constats graves, 1 corrigé, 2 en specs (`bug-003`, `feature-011`)
- [Étapes D et E livrées ; `_ROUTES_ECRITURE` porte 4 chemins](etape-d-garde-fous-declares-non-appliques.md) — « route d'écriture » y veut dire « chemin que `do_POST` route », jamais « route qui écrit »
- ⭐ [Cycle feature-008 : muter la garde, pas ce qu'elle appelle](cycle-feature-008-ce-qu-il-a-appris.md) — 10 mutants « tués » et 3 gardes sans filet, dont le confinement
- [Une garde se livre atteignable](une-garde-se-livre-atteignable.md) — un défaut qui la rend inatteignable entre dans le cycle qui la livre (ADR-0017).
- [Un dépôt jetable n'est pas un petit dépôt réel](un-depot-jetable-n-est-pas-un-petit-depot-reel.md) — tout ce qui dépend d'un volume y est invisible par construction
- [Une mesure en aveugle exige de retirer l'information](une-mesure-en-aveugle-exige-de-retirer-l-information.md) — l'omettre du brief ne suffit pas si elle est dans le dépôt
