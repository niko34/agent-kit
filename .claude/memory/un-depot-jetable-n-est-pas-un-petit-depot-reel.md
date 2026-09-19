---
name: un-depot-jetable-n-est-pas-un-petit-depot-reel
description: Les dépôts fabriqués pour les tests forment une classe à part ; tout ce qui dépend d'un volume y est invisible par construction.
metadata:
  type: feedback
---

Le 2026-09-13, la garde `SOUS-MODULE EN TRAVERS` a franchi 99 tests verts, dix
mutations toutes tuées, une revue et un audit — en ne fonctionnant **que sur les
petits dépôts**. Elle s'écrivait :

```bash
if git ls-files -s -- "$f" | grep -q '^160000 '; then
```

Sous `set -uo pipefail`, `grep -q` sort au premier match, `git` meurt en SIGPIPE,
le pipeline vaut **141**, le `if` est faux, la garde est sautée. Mesuré dans les
deux sens sur 420 Ko de sortie : avant correctif, sortie 0 et historique du dépôt
embarqué **perdu** ; après, refus propre.

**Why:** les dépôts jetables des tests ne sont pas de *petits* dépôts réels, ce
sont des dépôts d'une **autre classe**. Tout ce qui dépend d'un **volume** —
tampon de tube (64 Ko sous Linux), `ARG_MAX`, temps, nombre d'entrées — y est
invisible **par construction**. Aucune des règles d'ADR-0017 ne l'attrape :
la garde est exécutée, elle est atteignable, son cas la déclenche. Ce qui l'a
trouvée, c'est d'avoir cherché un **mécanisme** (`pipefail` + SIGPIPE) puis
d'avoir fabriqué le cas qui le déclenche.

**How to apply:** quand une garde lit une sortie de commande, se demander ce qui
change si cette sortie fait 500 Ko au lieu de 200 octets. Pour tout lecteur à
sortie anticipée (`grep -q`, `head`) qui porte une décision, préférer la
**substitution de commande**, qui consomme toute l'entrée. Et vérifier qu'un test
de régression sur ce genre de défaut n'est pas une **course** instable — un test
flaky sur un défaut silencieux est pire que pas de test, parce qu'on le
désactive. Voir [[le-defaut-se-trouve-en-executant]] et
[[une-garde-se-livre-atteignable]].
