# Bug — un fichier ignoré occupant la place d'un répertoire gelé est supprimé

- **Type** : bug (format minimal `specs/modele.md`)
- **Version cible** : 0.7.0
- **Créée** : 2026-09-13 (constat de `security-reviewer` en rôle AUDIT pendant
  le cycle `bug-003`, classé **grave**, établi par exécution sur dépôts
  jetables)
- **Domaine** : outillage — `tools/update_kit.sh`. Ni auth, ni données
  personnelles. **Mais** : suppression de fichier dans le dépôt d'un tiers.
- **Spec liée** : `bug-001` (garde des non suivis), `bug-003` (garde des bits
  git) — **même famille, troisième chemin**

## Agents requis

- [x] debugger
- [ ] **security-reviewer, rôle GATE** — non coché : aucun des cinq
      déclencheurs. **Rôle AUDIT recommandé** — c'est lui qui a trouvé ce
      constat, et il touche à ce que le script peut détruire chez un tiers
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

Un **fichier régulier** occupant l'emplacement d'un **répertoire gelé** du kit,
et **ignoré par `.gitignore`**, est classé « À CRÉER » dans l'aperçu, puis
**supprimé** par `git checkout` lors de la synchronisation.

```
(relevé à produire : l'audit a établi le mécanisme par expérience — cas S2b de
son rapport — sans conserver la sortie. PREMIÈRE TÂCHE DU CYCLE : reproduire et
coller ici l'état de départ, la commande, la sortie et le contenu final.)
```

**Scénario de reproduction** : dans un projet consommateur, créer un **fichier**
nommé `.claude/skills/db-migrations` — là où le kit a un **répertoire** —, le
faire ignorer par `.gitignore`, puis lancer `./tools/update_kit.sh`.

⚠️ **Variante non ignorée** : l'audit note qu'un fichier **non** ignoré au même
emplacement est sauvé, mais **uniquement par la garde d'arbre de travail sale**
— pas par une garde qui aurait compris la situation. C'est un sauvetage
accidentel, à établir et à documenter comme tel.

## Cause racine

Hypothèse issue de l'audit, **à confirmer par exécution** : le script teste
l'existence par `[ -e "$f" ]` sur les **fichiers** listés côté kit
(`git ls-tree -r`), qui énumère des **fichiers**, jamais des répertoires. Un
fichier régulier occupant la place d'un répertoire n'est donc jamais comparé à
quoi que ce soit : les fichiers que le kit place *sous* ce chemin sont absents
du projet, donc classés « à créer », et `git checkout` doit alors supprimer
l'obstacle pour créer le répertoire.

C'est le **troisième chemin de la même famille** :

| Chemin | Spec | État |
|---|---|---|
| fichier **non suivi** divergent | `bug-001` | garde livrée |
| fichier **suivi** à bit `skip-worktree` | `bug-003` | garde livrée |
| fichier **ignoré** à la place d'un répertoire | **celui-ci** | ouvert |

## Correctif attendu

1. **Détecter** qu'un chemin gelé attendu comme répertoire est occupé par un
   fichier régulier dans le projet.
2. **Refuser la synchronisation** si ce fichier n'est pas récupérable — ignoré
   ou non suivi, donc absent de l'index. Même contrat que les gardes de
   `bug-001` et `bug-003` : **avant** tout `git checkout`, jamais au fil de
   l'eau, **inactive en `--dry-run`**.
3. **Le signaler dans l'aperçu**, dans sa propre catégorie : « À CRÉER » est
   faux, puisqu'il y aura une suppression.
4. **Ne pas bloquer** si le fichier est suivi et propre — il est alors
   récupérable par `git checkout`, comme n'importe quel fichier suivi.
5. Le message nomme l'obstacle et les issues : le déplacer, le committer, ou
   exclure le chemin via `.kit-paths`.

⚠️ **Fragment de message disjoint** : `MARQUEURS_DE_GARDE` porte déjà
`SANS RETOUR POSSIBLE` (`ecrasement`) et `MODIFICATION LOCALE INVISIBLE`
(`bit_gele`). Le fragment neuf ne doit être sous-chaîne d'aucun autre, ni en
contenir un — sinon `affirmer_seule_garde` verra deux gardes parler.

## Critères d'acceptation

- [ ] Dans le scénario de reproduction, la synchronisation refuse et le fichier
      est intact
- [ ] Le cas **non ignoré** est couvert : soit la garde tire, soit le sauvetage
      accidentel par l'arbre sale est **documenté comme tel**
- [ ] Un fichier **suivi et propre** au même emplacement ne bloque pas
- [ ] La garde reste **inactive en `--dry-run`** — la régresser réintroduirait
      le défaut 1 de `feature-005`
- [ ] L'aperçu ne classe plus ce cas en « À CRÉER »
- [ ] Aucun chemin sensible touché
- [ ] Suite verte, avec un test de non-régression **vu échouer sur le code
      d'avant le fix**
- [ ] Matrice de mutation **diagonale** (ADR-0012), marqueur déclaré
- [ ] Lint propre (`shellcheck`), pas de warning nouveau

## Hors périmètre

- Les gardes de `bug-001` et `bug-003` : livrées, intactes
- Le cas inverse — un **répertoire** occupant la place d'un fichier gelé — à
  instruire, et à traiter ici **seulement** si la reproduction montre qu'il est
  du même mécanisme
- Les noms cités par `core.quotepath` — traités par `bug-003`, voir ADR-0013
