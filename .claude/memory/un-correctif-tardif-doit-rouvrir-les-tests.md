---
name: un-correctif-tardif-doit-rouvrir-les-tests
description: "Faiblesse du workflow : un correctif livré après la phase de test entre sans filet, la suite restant verte donc muette"
metadata:
  type: feedback
---

**Un correctif qui arrive après la phase de test doit rouvrir la phase de
test.** Le cycle prescrit par `CLAUDE.md` est linéaire — tests → revue → doc —
et rien n'y dit que revenir en arrière sur le code oblige à revenir en arrière
sur les tests.

**Why** : constaté deux fois le 2026-09-13. Sur `bug-003`, quatre correctifs
(dont le plus grave du cycle, les noms accentués qui désarmaient toutes les
gardes) sont entrés **après** que les cas étaient écrits. La suite est restée
verte — donc **muette**. Le correctif bloquant n'était couvert par rien, et le
prochain qui aurait « simplifié » l'appel à `git ls-tree` aurait rouvert le trou
sans qu'aucun test ne l'arrête.

**How to apply** : après tout retour au développeur en fin de cycle, renvoyer
systématiquement à `test-engineer` avec la liste de ce qui a changé, avant la
re-revue. Ne jamais lire « suite verte » comme « correctif couvert » : vérifier
que le compte de tests a **augmenté**. Sur `bug-003`, 50/50 verts après quatre
correctifs était le signal d'alarme, pas un feu vert.

Rattrapé les deux fois par une vérification manuelle de l'agent principal, pas
par le processus. Voir [[le-defaut-se-trouve-en-executant]].
