---
description: Publie une release (tag, artefacts de build, notes) sur GitHub ou GitLab, sans rien committer
argument-hint: [vX.Y.Z] [résumé des changements]
allowed-tools: Bash(git status:*), Bash(git fetch:*), Bash(git rev-parse:*), Bash(git rev-list:*), Bash(git tag:*), Bash(git push:*), Bash(git log:*), Bash(gh auth status:*), Bash(gh release create:*), Bash(gh release view:*), Bash(glab auth status:*), Bash(glab release create:*), Bash(glab release view:*), Bash(npm run *), Bash(ls:*), Bash(grep:*), Read
---

<!-- ═══════════════════════════════════════════════════════════════════
  KIT DE DÉMARRAGE — À PERSONNALISER :
  1. CHOISIR LA FORGE : les étapes 1, 6 et 7 proposent deux variantes,
     GitHub (`gh`) et GitLab (`glab`). SUPPRIMER celle qui ne sert pas —
     laisser les deux rend la commande ambiguë à l'exécution.
  2. Étape 2 : remplacer par la commande de build réelle du projet
  3. Étape 3 : remplacer ou supprimer si le projet ne génère pas de doc
  4. Étape 4 : indiquer où vit le numéro de version (package.json, __init__.py…)
  5. Étape 6 : lister les artefacts réellement à joindre
  6. Ajuster `allowed-tools` en tête : retirer les entrées de la forge écartée

  ⚠️ SI LA FORGE PUBLIE DÉJÀ LES RELEASES (chaîne CI/CD en place qui construit
  et déploie sur tag), SUPPRIMER CETTE COMMANDE plutôt que de la faire coexister
  avec le pipeline. Deux mécanismes de publication qui s'ignorent produisent des
  releases incohérentes, et personne ne sait plus laquelle fait foi.

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

- **Forge GitHub** — `gh auth status` : si `gh` est absent ou non authentifié,
  **arrête** avec l'indication d'installation (https://cli.github.com) et
  `gh auth login`.
- **Forge GitLab** — `glab auth status` : si `glab` est absent ou non
  authentifié, **arrête** avec l'indication d'installation
  (https://gitlab.com/gitlab-org/cli) et `glab auth login`. Sur une instance
  auto-hébergée, l'authentification vise cette instance, pas gitlab.com.
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

### 6. Publication de la release

**Forge GitHub :**

    gh release create <version> \
      --title "<version> — <titre court>" \
      --notes-file <fichier de notes dans le scratchpad> \
      <artefacts à joindre>

**Forge GitLab :**

    glab release create <version> \
      --name "<version> — <titre court>" \
      --notes-file <fichier de notes dans le scratchpad> \
      <artefacts à joindre>

Sur GitLab, les fichiers volumineux passent mal en pièces jointes de release :
au-delà de quelques mégaoctets, préférer un artefact de job publié par le
pipeline et **lier son URL** dans les notes plutôt que de l'attacher.

Écris les notes dans un fichier du répertoire scratchpad et utilise
`--notes-file` : les notes multi-lignes passées en `--notes` sur la ligne de
commande sont fragiles (guillemets, accents, retours à la ligne).

Nomme chaque asset avec la version (`app-<version>.tar.gz`, pas `app.tar.gz`) :
un asset au nom générique est indistinguable d'une release à l'autre une fois
téléchargé.

### 7. Fin

Affiche l'**URL de la release** et un récapitulatif : version, artefacts joints,
taille.

- GitHub : `gh release view <version> --json url -q .url`
- GitLab : `glab release view <version>`

Si le pipeline de la forge se déclenche sur le tag, **signale-le** et donne le
lien du pipeline : la release n'est réellement publiée qu'une fois ce pipeline
au vert.

## Rappels

- N'invente jamais un numéro de version : demande-le.
- Si une étape échoue **après** la création du tag, dis-le explicitement — un tag
  poussé sans release derrière est un état à corriger à la main :
  `git push --delete origin <version>` puis `git tag -d <version>`.
