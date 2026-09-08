# Mémoire de projet — ce que l'expérience a appris

Ce dossier est la mémoire accumulée par Claude Code au fil du projet : pièges
rencontrés, hypothèses **réfutées**, incidents, et principes que l'utilisateur a dû
rappeler plusieurs fois.

`MEMORY.md` est l'index — une ligne par fichier. Les autres fichiers portent un fait
chacun.

## Pourquoi versionner ça dans le dépôt

Claude Code range sa mémoire dans `~/.claude/projects/<chemin-du-projet>/memory/` :
**hors du dépôt, donc sur une seule machine et sans sauvegarde**. Un changement de
poste, un clone sur un autre disque, un collègue qui rejoint le projet — et toute la
connaissance accumulée disparaît sans que personne s'en aperçoive.

Ce ne sont pas des notes de confort. Sur le projet d'où vient ce kit, plusieurs
mémoires existent parce que **l'erreur a été commise puis répétée** : un principe
rappelé trois fois par l'utilisateur, un même défaut de synchronisation revenu quatre
fois, un diagnostic entier faussé pour avoir raisonné sur une valeur de configuration
par défaut alors que l'installation réelle en portait une autre. Reprendre une piste
déjà réfutée coûte plusieurs cycles à chaque fois.

## Ce qui mérite une mémoire

- **Une hypothèse réfutée**, avec ce qui l'a réfutée. C'est le contenu à plus fort
  rendement : il empêche de refaire le trajet.
- **Un piège récidivant** : le défaut qui revient sous une forme différente.
- **Un rappel de l'utilisateur** sur la façon de travailler, avec son *pourquoi*.
- **Une décision prise hors du code** (« on ne fait pas X, et voici pourquoi »).
- **Un incident** et sa cause racine réelle.

Ce qui n'y a **pas** sa place : ce que le dépôt dit déjà (structure du code, historique
git, `CLAUDE.md`), et ce qui ne vaut que pour la conversation en cours.

## Format d'un fichier

```markdown
---
name: <slug-en-kebab-case>
description: <une ligne — sert à décider de la pertinence au rappel>
metadata:
  type: user | feedback | project | reference
---

<Le fait. Pour feedback/project, faire suivre de **Pourquoi :** et
**Comment l'appliquer :**. Lier les mémoires connexes par [[leur-slug]].>
```

Dates en absolu (« le 12/03/2027 »), jamais en relatif (« la semaine dernière »).

## Réactiver cette mémoire sur une autre machine

```bash
# 1. Trouver le dossier de mémoire de CETTE machine
ls ~/.claude/projects/

# 2. Y copier le contenu versionné
cp .claude/memory/*.md ~/.claude/projects/<le-dossier-trouvé>/memory/
```

À défaut, ces fichiers restent **lisibles tels quels** : `MEMORY.md` d'abord.

## Tenir cette mémoire à jour

Toute mémoire écrite dans `~/.claude/projects/…/memory/` doit être **recopiée ici**
pour survivre à un changement de poste. Sans quoi le dossier redevient ce qu'il était :
une connaissance qui n'existe que sur un disque.

## Règle absolue : aucun secret ici

Ce dossier est versionné, donc public au sens du dépôt. **Jamais** de mot de passe,
de jeton, de clé d'API, d'adresse d'un environnement privé ni de donnée personnelle.
Ce qui doit être transmis autrement l'est par le canal prévu par le projet.
