<!--
Template MINIMAL pour bug simple ou refactor ponctuel.
Copier ce fichier dans specs/features/todo/ sous le nom :
    bug-NNN-<slug>.md   ou   refactor-NNN-<slug>.md
Si le bug touche l'auth, les permissions, les données personnelles ou une migration
destructive : basculer sur specs/features/_template.md (déclenche security-reviewer, rôle GATE).
Supprimer ce bloc commentaire.
-->

# Bug — <titre : symptôme visible en une phrase>

- **Type** : bug | refactor (format minimal `specs/modele.md`)
- **Statut** : todo
- **Version cible** : [X.Y.Z]
- **Créée** : [YYYY-MM-DD] ([comment le bug a été détecté : rapport utilisateur, monitoring, tests…])
- **Domaine** : [API / Frontend / BDD / tâche de fond — préciser si auth ou données personnelles touchées]
- **Spec liée** : [feature-NNN d'origine, ADR de contexte, ou « aucune »]

## Agents requis

<!--
Même vocabulaire que le template feature, pour que l'orchestrator ait quelque chose à
lire ici aussi. La règle d'escalade doit être VISIBLE, pas seulement commentée :
si `security-reviewer` (rôle GATE) est coché, ce format ne suffit plus — basculer sur
specs/features/_template.md.
-->
- [x] debugger (si bug) ou architect (si refactor)
- [ ] **security-reviewer, rôle GATE** — si coché : **basculer sur le template feature complet**
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

<!--
Décrire ce qui se passe, avec les PREUVES. Un symptôme sans preuve n'est pas exploitable :
- extrait de logs serveur (horodaté)
- réponse HTTP réelle (statut + corps)
- stack trace complète
- capture ou mesure (temps de réponse, requête SQL, résultat en base)
-->

```
[coller ici : logs serveur / stack trace / réponse HTTP brute]
```

[Décrire le scénario de reproduction : quelle action, quel utilisateur/rôle, quelle fréquence.]

## Cause racine

<!--
La chaîne causale complète, fichiers et lignes à l'appui : pas « ça plante dans X »
mais « X fait Y parce que Z, donc W ». Si la cause n'est pas encore établie,
l'écrire honnêtement : « hypothèse : … , à confirmer par … ».
-->
[remplir]

## Correctif attendu

<!--
Le comportement cible, numéroté si plusieurs volets (fix backend, fix UI, garde-fou
défensif…). Décrire le QUOI ; laisser les choix d'implémentation ouverts avec la
mention « architect tranche » si pertinent.
-->
1. [remplir]
2. [remplir]

## Critères d'acceptation

- [ ] [le symptôme ne se reproduit plus dans le scénario de reproduction ci-dessus]
- [ ] [réponse HTTP / comportement attendu à la place : préciser statut et corps]
- [ ] Aucun chemin sensible (auth, permissions, données personnelles) touché — sinon basculer sur le template feature
- [ ] Suite de tests verte (+ test de non-régression ajouté couvrant ce bug)
- [ ] Le test de non-régression a été **vu échouer sur le code d'avant le fix** — sinon
      il ne protège rien
- [ ] Lint propre, pas de warning nouveau

## Hors périmètre

- [remplir : ce que ce fix ne corrige PAS, pour éviter le scope creep]
