---
name: une-mesure-en-aveugle-exige-de-retirer-l-information
description: Cacher une information dans le brief d'un agent ne l'aveugle pas si elle est posée en clair dans le dépôt qu'il doit lire.
metadata:
  type: feedback
---

Le 2026-09-14, pendant `feature-010`, j'ai voulu mesurer si un scénario écrit
« en aveugle » retrouverait seul le défaut de `bug-013`. J'ai donc soigneusement
omis `bug-013` du brief de `test-engineer`.

Raté : `bug-013` est un **fichier de `specs/features/todo/`**, et le premier
travail d'un agent qui écrit un scénario est d'inventorier les specs. Son
scénario en portait **16 occurrences**. La mesure était morte avant de commencer.

**Why:** l'aveuglement ne se décrète pas dans un brief, il se construit dans
l'environnement. Un agent lit le dépôt — c'est même ce qu'on lui demande. Toute
information laissée dans l'arbre est une information transmise, quel que soit le
silence du brief. Et une mesure en aveugle ne se rejoue pas : une fois
l'information passée, il n'y a pas de seconde chance.

**How to apply:** pour une mesure en aveugle, **retirer l'information de
l'arbre** le temps de l'exercice, ou choisir un objet que le dépôt ne contient
pas encore. Solution supérieure trouvée ensuite : **figer le scénario d'abord**,
puis laisser le **prochain** défaut découvert en usage réel servir de
calibration — il aura été écrit sans que le scénario puisse en rien savoir, et
ça ne coûte rien.

Corollaire sur la conduite : quand la consigne était impossible à tenir, le dire
à l'agent. Lui reprocher une lecture légitime lui apprend à se défier de ses
propres lectures — exactement l'inverse du but. Voir
[[le-defaut-se-trouve-en-executant]] et [[une-justification-ne-vaut-que-refutee]].
