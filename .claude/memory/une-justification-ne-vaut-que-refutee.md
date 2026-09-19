---
name: une-justification-ne-vaut-que-refutee
description: "Trois fois en une session, une justification écrite avec soin s'est révélée fausse quand quelqu'un l'a éprouvée"
metadata:
  type: feedback
---

**Une justification n'a de valeur que si quelqu'un a essayé de la réfuter.**

**Why** : trois occurrences le 2026-09-13, toujours le même schéma — **l'auteur
avait raison sur la conclusion et tort sur la cause** :

1. `feature-006` — `GIT_EXEC_PATH` déclarée « non éprouvable » avec argument.
   La revue a écrit le cas décoy en dix minutes : il marche.
2. `feature-012` — dérogation à ADR-0012 motivée par « une clé ferait tomber
   TOUS les `affirmer_seule_garde(..., None)` ». Faux : seuls les cas **neufs**
   tombent. Le vrai motif était ailleurs (le cas du glob déclenche **deux**
   marqueurs).
3. `feature-012` — « le bloc de dédoublonnage est du code mort », conclu d'une
   suite restée verte après suppression. Faux : la **boucle des orphelins**
   itère sur `presents` sans passer par git. Il a fallu **construire le cas
   discriminant** pour le voir.

C'est difficile à repérer parce que **rien ne cloche dans le résultat** — seul
le raisonnement est faux. Et un raisonnement faux qui donne la bonne réponse
aujourd'hui donne la mauvaise dès que le contexte bouge.

**How to apply** : quand un agent déclare une impossibilité, une équivalence ou
une dérogation, demander à un **autre** agent de tenter de la réfuter **par
exécution**. Ne jamais l'accepter sur la seule qualité de l'argument. Corollaire
vérifié le 2026-09-13 : quand l'environnement ne permet pas d'éprouver,
**fabriquer l'environnement** — `security-reviewer` a compilé bash 4.3.0 pour
tester un piège non reproductible sous le bash local.

Voir [[le-defaut-se-trouve-en-executant]] et
[[un-correctif-tardif-doit-rouvrir-les-tests]].
