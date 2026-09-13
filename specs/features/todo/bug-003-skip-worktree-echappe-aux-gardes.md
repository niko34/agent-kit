# Bug — un fichier marqué `skip-worktree` est écrasé sans qu'aucune garde ne le voie

- **Type** : bug (format minimal `specs/modele.md`)
- **Version cible** : 0.6.0
- **Créée** : 2026-09-12 (trouvé par `security-reviewer` en rôle AUDIT, pendant le
  cycle de bug-001 ; établi par expérience sur dépôts jetables, pas par lecture)
- **Domaine** : outillage — `tools/update_kit.sh`. Ni auth, ni données
  personnelles. **Mais** : destruction silencieuse de travail non committé dans
  le dépôt d'un projet tiers.
- **Spec liée** : bug-001 (même défaut, autre bit — la garde livrée là ne couvre
  pas ce cas), feature-006 (harnais de test)

## Agents requis

- [x] debugger
- [ ] **security-reviewer, rôle GATE** — non coché : aucun chemin sensible au
      sens des déclencheurs (auth, permissions, données personnelles,
      migration). Le constat vient néanmoins de son rôle AUDIT, et un
      repassage en AUDIT après correctif est souhaitable
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

Un fichier suivi par git mais marqué `git update-index --skip-worktree` (ou
`--assume-unchanged`) est **écrasé par la synchronisation**, alors que son
contenu local n'a jamais été committé. Aucune des trois gardes du script ne le
voit passer.

```
(relevé à produire : l'AUDIT a établi le mécanisme par expérience sur dépôts
jetables, sans conserver la sortie. PREMIÈRE TÂCHE DU CYCLE : reproduire et
coller ici la sortie réelle — état de départ, commande, résultat.)
```

**Scénario de reproduction** : dans un projet consommateur, prendre un chemin
gelé du kit, le modifier localement sans committer, puis
`git update-index --skip-worktree <chemin>`. Lancer `./tools/update_kit.sh`.
La synchronisation s'exécute et le contenu local disparaît.

## Cause racine

Les trois gardes du script regardent chacune ailleurs :

1. **Garde d'arbre de travail sale** (`tools/update_kit.sh:160`) — repose sur
   `git status --porcelain`, qui **ignore délibérément** les fichiers marqués
   `skip-worktree` / `assume-unchanged`. C'est tout l'objet de ces bits.
2. **Garde d'écrasement des non suivis** (livrée par bug-001) — ne regarde que
   les fichiers **non suivis**. Or ceux-ci sont suivis : ils lui échappent.
3. **Classification de l'aperçu** (livrée par bug-001) — compare
   `git hash-object` du fichier local au blob du kit. Le hash diverge, donc le
   fichier est classé « à mettre à jour » : la sortie est honnête, mais elle
   ne signale pas que le contenu local n'est **récupérable par aucun
   `git checkout`**, n'ayant jamais été committé.

C'est exactement le défaut de bug-001 — du travail irremplaçable détruit par
une garde qui regarde le mauvais bit — sur un autre chemin. bug-001 a bouché le
trou « non suivi » ; celui-ci reste ouvert.

## Correctif attendu

1. Dans la classification (`tools/update_kit.sh`, boucle de classification
   livrée par bug-001), comparer aussi le hash local à `HEAD:$f`. Si les deux
   diffèrent alors que `git status --porcelain` est propre, le fichier porte
   une modification locale invisible : le classer dans une catégorie propre et
   le traiter comme le cas « non suivi divergent ».
2. La garde d'écrasement refuse la synchronisation dans ce cas, avec le même
   contrat que celle de bug-001 : **avant** tout `git checkout`, jamais au fil
   de l'eau, **inactive en `--dry-run`**, message nommant les issues manuelles
   (committer, déplacer le fichier, retirer le bit `skip-worktree`, ou exclure
   le chemin via `.kit-paths`).
3. Le message doit nommer le bit en cause : un utilisateur qui a posé
   `skip-worktree` il y a six mois ne fera pas le lien tout seul.

> **Note (feature-006, lot 1, harnais livré)** : `tests/harnais_kit.py` est
> disponible, avec la primitive `poser_skip_worktree()` (et sa variante
> `assume_unchanged`), `MARQUEURS_DE_GARDE` et `affirmer_seule_garde()`. La
> **garde** correspondante reste entièrement à la charge de ce bug (voir
> « Notes pour agent » de feature-006). ADR-0012 impose que le test de
> non-régression ajouté ici déclare sa propre clé dans `MARQUEURS_DE_GARDE`
> et démontre, par mutation, qu'aucune autre garde ne peut le faire échouer.

## Critères d'acceptation

- [ ] Dans le scénario de reproduction, la synchronisation refuse de
      s'exécuter et le contenu local est intact
- [ ] Le cas `--assume-unchanged` est couvert au même titre que `skip-worktree`
- [ ] La garde reste **inactive en `--dry-run`** — la régresser serait
      réintroduire le défaut 1 de feature-005
- [ ] Un fichier `skip-worktree` **identique** au kit ne déclenche aucune garde
- [ ] Aucun chemin sensible (auth, permissions, données personnelles) touché
- [ ] Suite de tests verte, avec un test de non-régression couvrant ce bug
- [ ] Le test de non-régression a été **vu échouer sur le code d'avant le
      fix** — sinon il ne protège rien
- [ ] La mutation « neutraliser la comparaison à `HEAD:$f` » tue ce test
- [ ] Lint propre (`shellcheck`), pas de warning nouveau

## Hors périmètre

- La garde des fichiers **non suivis** : déjà livrée par bug-001
- Tout drapeau `--force` / `--adopt` / sauvegarde `.bak` : nouvelle surface
  publique, décision produit distincte
- La régénération Copilot qui exécute du code non relu — voir
  `feature-011-passerelle-copilot-execute-du-code-non-relu.md`
