# Mémoire de projet — ce que l'expérience a appris

Ce dossier est la mémoire accumulée par Claude Code au fil du projet :
hypothèses **réfutées**, incidents, décisions prises hors du code, et principes
que l'utilisateur a dû rappeler plusieurs fois.

> **Ce n'est pas le fichier de pièges d'un module.** La frontière n'est pas le
> contenu, c'est le **destinataire** : un sous-agent **ne reçoit jamais** cette
> mémoire — elle est chargée dans la session principale, pas dans les agents
> qu'elle invoque. Tout ce dont un agent a besoin pour travailler doit donc
> vivre dans un fichier qu'on lui **dit de lire**, par exemple
> `<module>/PIEGES.md`. Voir « Mémoire ou pièges de module ? » plus bas.

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
- **Un piège récidivant qui dépasse un module** : le défaut qui revient sous une
  forme différente, dans plusieurs endroits du projet. Un piège **propre à un
  module** va dans le `PIEGES.md` de ce module, pas ici.
- **Un rappel de l'utilisateur** sur la façon de travailler, avec son *pourquoi*.
- **Une décision prise hors du code** (« on ne fait pas X, et voici pourquoi »).
- **Un incident** et sa cause racine réelle.

Ce qui n'y a **pas** sa place : ce que le dépôt dit déjà (structure du code,
historique git, `CLAUDE.md`), ce qui ne vaut que pour la conversation en cours, et
ce qu'un **agent** doit savoir pour travailler sur un module — il ne le lira pas.

## Mémoire ou pièges de module ?

| | `.claude/memory/` | `<module>/PIEGES.md` |
|---|---|---|
| **Qui le lit** | la session principale, au démarrage | les agents, parce qu'un brief le leur dit |
| **Portée** | le projet, et la façon d'y travailler | **un** module |
| **Contenu** | hypothèses réfutées, préférences de l'utilisateur, incidents, décisions hors code | contraintes opérationnelles, faits qui trompent, faux-semblants de mesure |
| **Qui écrit** | la session principale, quand elle apprend | `doc-writer`, en clôture de cycle, depuis les rapports |
| **Durée de vie** | tant que le fait reste vrai | tant que le code le rend vrai — **une entrée périmée se retire** |

Le test qui tranche : **est-ce qu'un agent en a besoin pour faire son travail ?**
Si oui, c'est un piège de module, quel que soit le sujet. Sinon, c'est une
mémoire.

> Écrit le 2026-09-15, après avoir constaté que « pièges rencontrés » figurait
> dans les deux endroits — donc que ni l'un ni l'autre ne serait lu.

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
