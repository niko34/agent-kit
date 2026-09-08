---
description: Publie une release (tag, artefacts de build, notes, GitHub) sans rien committer
argument-hint: [vX.Y.Z] [résumé des changements]
allowed-tools: Bash(git status:*), Bash(git fetch:*), Bash(git rev-parse:*), Bash(git rev-list:*), Bash(git tag:*), Bash(git push:*), Bash(git log:*), Bash(gh auth status:*), Bash(gh release create:*), Bash(gh release view:*), Bash(npm run *), Bash(ls:*), Bash(grep:*), Read
---

<!-- ═══════════════════════════════════════════════════════════════════
  KIT DE DÉMARRAGE — À PERSONNALISER :
  1. Étape 2 : remplacer par la commande de build réelle du projet
  2. Étape 3 : remplacer ou supprimer si le projet ne génère pas de doc
  3. Étape 4 : indiquer où vit le numéro de version (package.json, __init__.py…)
  4. Étape 6 : lister les artefacts réellement à joindre
  5. Ajuster `allowed-tools` en tête aux commandes citées
  Le squelette (pré-vérifications, règle « ne commite rien », gestion d'échec
  après tag) fonctionne tel quel et c'est lui qui porte la valeur.
═══════════════════════════════════════════════════════════════════ -->

Publie une release pour ce projet.

Arguments reçus : `$ARGUMENTS`
(Premier mot = version au format `vX.Y.Z` si fourni ; le reste = résumé des
changements. L'un comme l'autre peuvent être absents.)

## Règle absolue

**Cette commande ne commite RIEN et ne pousse QUE le tag.** Aucun `git add`, aucun
`git commit`, aucun `git push` de branche. Si l'arbre de travail est sale, tu
t'arrêtes et tu le signales — tu ne commites pas pour « débloquer » : c'est à
l'humain de décider quoi faire de ces modifications.

Les artefacts régénérés aux étapes 2 et 3 sont **volontairement ignorés par git** :
ce sont des assets de release, jamais du contenu versionné. Ne t'étonne pas de ne
pas les voir dans `git status`, et ne cherche pas à les ajouter.

## Étapes

### 1. Pré-vérifications — tout échec arrête la commande

- `gh auth status` : si `gh` est absent ou non authentifié, **arrête** avec
  l'indication d'installation (https://cli.github.com) et `gh auth login`.
- `git status --porcelain` : doit être **vide**. Sinon, affiche les fichiers
  concernés et arrête.
- `git fetch` puis compare `HEAD` à `@{u}` : la branche doit être **à jour avec
  origin**, ni en avance ni en retard. Si elle diverge, affiche l'écart
  (`git rev-list --left-right --count @{u}...HEAD`) et arrête.

### 2. Build

    <commande de build du projet>

Si le build échoue, arrête et montre l'erreur.

### 3. Documentation générée (si le projet en produit)

    <commande de génération de la doc>

En cas d'échec, arrête : une release sans documentation à jour n'a pas d'intérêt.

### 4. Version et résumé

Si la version n'est pas dans `$ARGUMENTS`, demande-la. Format **`vX.Y.Z`**.

Vérifie sa cohérence avec le numéro déclaré dans le projet (`<package.json,
pyproject.toml, version.h…>`) : ils doivent correspondre. En cas d'écart,
**signale-le et demande confirmation** plutôt que de choisir toi-même — c'est en
général le signe que le bump a été oublié.

Vérifie que le tag n'existe pas déjà (`git tag -l`). Si oui, arrête.

Si le résumé n'est pas fourni, demande-le. Pour le rédiger, appuie-toi sur
`CHANGELOG.md` (section de cette version) et sur `git log <dernier tag>..HEAD
--oneline`.

Rédige les notes **orientées utilisateur** : ce qui change pour qui s'en sert, pas
la liste des commits. Mentionne les corrections visibles et les changements de
comportement. Langue : celle du projet (cf. `CLAUDE.md`).

### 5. Tag

    git tag -a <version> -m "<résumé court>"
    git push origin <version>

**Uniquement le tag.** Jamais `git push` seul, jamais `--tags`.

### 6. Release GitHub

    gh release create <version> \
      --title "<version> — <titre court>" \
      --notes-file <fichier de notes dans le scratchpad> \
      <artefacts à joindre>

Écris les notes dans un fichier du répertoire scratchpad et utilise
`--notes-file` : les notes multi-lignes passées en `--notes` sur la ligne de
commande sont fragiles (guillemets, accents, retours à la ligne).

Nomme chaque asset avec la version (`app-<version>.tar.gz`, pas `app.tar.gz`) :
un asset au nom générique est indistinguable d'une release à l'autre une fois
téléchargé.

### 7. Fin

Affiche l'**URL de la release** (`gh release view <version> --json url -q .url`)
et un récapitulatif : version, artefacts joints, taille.

## Rappels

- N'invente jamais un numéro de version : demande-le.
- Si une étape échoue **après** la création du tag, dis-le explicitement — un tag
  poussé sans release derrière est un état à corriger à la main :
  `git push --delete origin <version>` puis `git tag -d <version>`.
