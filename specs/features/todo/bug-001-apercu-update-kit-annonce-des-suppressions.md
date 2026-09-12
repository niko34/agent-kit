# Bug — l'aperçu d'`update_kit.sh` annonce comme supprimés des fichiers qu'il va créer

- **Type** : bug (format minimal `specs/modele.md`)
- **Version cible** : 0.6.0
- **Créée** : 2026-09-12 (relevé pendant la première mise en service réelle
  d'`update_kit.sh` dans un projet consommateur ; cinquième défaut de la
  série, les quatre autres ont été corrigés par feature-005)
- **Domaine** : outillage — `tools/update_kit.sh`. Ni auth, ni données
  personnelles touchées. **Mais** le script écrase des fichiers suivis dans le
  dépôt d'un projet tiers, et c'est sur cet aperçu qu'on décide de le lancer.
- **Spec liée** : feature-005 (les quatre défauts corrigés), feature-006 (le
  harnais de test dont le correctif a besoin), ADR-0008

## Agents requis

- [x] debugger
- [ ] **security-reviewer, rôle GATE** — non coché : aucun chemin sensible
      (auth, permissions, données personnelles, migration). L'impact est une
      **mauvaise décision humaine** prise sur un aperçu trompeur, pas une
      faille
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

L'aperçu affiché avant la synchronisation présente en **suppression** des
fichiers que le script va en réalité **créer**. Un utilisateur qui lit
l'aperçu pour décider s'il lance la synchronisation y voit une perte
annoncée là où il y aura un ajout.

```
→ Écarts sur les fichiers gelés :

 .claude/agents/architect.md          | 42 ------------------
 .claude/skills/spec-workflow/SKILL.md| 88 ------------------------
 2 files changed, 130 deletions(-)
```

> **Provenance de ce relevé** : reconstitué à partir du comportement décrit
> dans les notes de la session du 2026-09-12, qui a constaté le défaut sans
> en conserver la sortie exacte. **Première tâche du cycle : le reproduire et
> coller la sortie réelle ici**, en remplacement de ce bloc. Un symptôme sans
> preuve relevée n'est pas exploitable, et le kit ne fabrique pas de preuve.

**Scénario de reproduction (à confirmer)** : dans un projet consommateur où un
chemin gelé du kit n'est pas encore présent — jamais installé, ou présent mais
**non suivi** par git — lancer `./tools/update_kit.sh --dry-run`. Les fichiers
concernés apparaissent en suppression dans le récapitulatif.

## Cause racine

L'aperçu repose sur `git diff --stat "$DISTANT/$BRANCHE" -- $fichiers_du_kit`
(`tools/update_kit.sh:223-225`), qui compare la référence du kit à l'**arbre
de travail suivi** du projet.

`git diff` ne voit que ce que git suit. Un fichier présent dans le kit et
absent de l'index du projet est donc vu comme « présent dans la référence,
absent ici » — c'est-à-dire **une suppression**. Or l'opération réelle est
l'inverse : `git checkout "$DISTANT/$BRANCHE" -- $presents`
(`tools/update_kit.sh:239`) va **écrire** ce fichier dans le projet.

Le sens du diff est donc correct du point de vue de git, et faux du point de
vue de l'utilisateur : il lit un récapitulatif de ce que le script va faire,
pas une comparaison de deux arbres. Les deux coïncident pour les fichiers déjà
suivis, et divergent exactement pour ceux qui ne le sont pas.

C'est le même défaut de nature que le troisième de feature-005 — un aperçu qui
décrit autre chose que l'action à venir — corrigé alors sur le périmètre des
fichiers listés, pas sur le **sens** de ce qui est affiché.

## Correctif attendu

1. L'aperçu distingue explicitement les trois cas, plutôt que de restituer un
   diff brut :
   - **à créer** — présent dans le kit, absent du projet (ou présent mais non
     suivi) ;
   - **à mettre à jour** — présent des deux côtés, contenu différent ;
   - **identique** — non affiché, ou affiché en compte agrégé.
2. Un fichier **non suivi** qui va être écrasé est signalé comme tel : c'est
   le cas le plus dangereux, puisque son contenu actuel n'est récupérable par
   aucun `git checkout` après coup.
3. Le récapitulatif final ne doit jamais employer le mot « suppression » pour
   une opération qui ajoute. `architect` tranche la forme exacte
   (`git diff --numstat` interprété, `git ls-tree` comparé à `git ls-files`,
   ou autre) ; le critère est la lisibilité pour qui décide.

## Critères d'acceptation

- [ ] Dans le scénario de reproduction, aucun fichier destiné à être créé
      n'apparaît comme supprimé
- [ ] Les trois cas (créé / mis à jour / identique) sont distingués dans la
      sortie
- [ ] Un fichier non suivi sur le point d'être écrasé est explicitement
      signalé avant l'écriture
- [ ] `--dry-run` et l'exécution réelle affichent **le même** récapitulatif :
      un aperçu qui diffère de l'action ne sert à rien
- [ ] Aucun chemin sensible (auth, permissions, données personnelles) touché
- [ ] Suite de tests verte, avec un test de non-régression couvrant ce bug
      dans le harnais de feature-006
- [ ] Le test de non-régression a été **vu échouer sur le code d'avant le
      fix** — sinon il ne protège rien
- [ ] Lint propre (`shellcheck`), pas de warning nouveau

## Hors périmètre

- Toute autre évolution d'`update_kit.sh` : ce fix ne corrige que l'aperçu
- La création du harnais de test lui-même — c'est feature-006, dont ce bug
  dépend : sans harnais, le critère « vu échouer avant le fix » n'est pas
  atteignable
- Le comportement de `git checkout` sur un fichier non suivi (il l'écrase) :
  ce fix le **signale**, il ne le change pas
