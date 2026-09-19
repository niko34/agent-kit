---
name: stager-settings-json-est-refuse
description: "Le garde-fou d'auto-modification refuse `git add .claude/settings.json` — un commit qui balaie tout l'arbre échoue en bloc"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 4813ddfa-173e-4766-94e6-4f32541d0ec8
  modified: 2026-09-19T15:38:49.427Z
---

`git add .claude/settings.json` (ou tout commit qui l'emporte) est **refusé par
le classificateur d'auto-modification** du mode auto, motif « Self-Modification ».
C'est le fichier de permissions de la session.

Mesuré le 2026-09-19 : la commande refusée était `git add .claude/memory/
.claude/settings.json && git commit …`. **Le refus porte sur toute la commande** —
la mémoire n'a pas été stagée non plus, alors qu'elle n'était pas en cause.

**Why:** un `git add -A`, ou un `git add` groupé qui inclut ce fichier, échoue en
bloc et fait croire à un problème de commit alors que c'est un problème de
périmètre.

**How to apply:** exclure `.claude/settings.json` du staging, committer le reste,
et **le signaler à l'utilisateur** pour qu'il décide — ne pas le laisser
disparaître dans un rapport de fin. Un changement de permissions mérite d'être
relu comme tel : la modification en attente ce jour-là ajoutait `Edit`, `Write`
et `Bash` nus à la liste d'autorisations.

Voir [[push-exige-un-feu-vert-separe]] pour l'autre règle qui encadre ce qui
part dans l'historique.
