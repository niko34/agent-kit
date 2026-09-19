# Mémoire du projet agent-kit

## Où l'on est

- [Les deux dépôts, leurs tableaux de bord, leurs sessions](ou-vivent-les-deux-depots.md) — le kit est la source, le firmware un consommateur ; ne jamais éditer `control-center/` côté projet
- [Rétro-documentation + file de travail, poussées](ce-qui-attend-un-commit.md) — 9 ADR + 6 specs rétroactives + 7 specs de la file, au 2026-09-12 au soir

## Préférences utilisateur

- ⭐ [Le push exige un feu vert séparé](push-exige-un-feu-vert-separe.md) — règle enfreinte une fois, signalée

## Pièges récurrents

- ⭐ [Trois comportements du runtime non documentés](pieges-du-runtime-sur-les-sous-agents.md) — `SubagentStop` sans nom ni ouverture, `SessionEnd` qui ne tue pas la session
- ⭐ [Une justification ne vaut que réfutée](une-justification-ne-vaut-que-refutee.md) — 3 fois en une session : raison sur la conclusion, tort sur la cause
- ⭐ [Un correctif tardif doit rouvrir les tests](un-correctif-tardif-doit-rouvrir-les-tests.md) — suite verte ≠ correctif couvert ; vérifier que le COMPTE augmente
- ⭐ [Le défaut se trouve en exécutant, pas en relisant](le-defaut-se-trouve-en-executant.md) — bilan d'une journée : la mutation et le lancement ont tout trouvé, la relecture rien

## Chantiers ouverts

- ⭐ [Centre de contrôle : état et pièges](centre-de-controle-etat-et-pieges.md) — `SessionEnd` ne se déclenche jamais, donc la prémisse de `bug-002` est à réétablir

- [`update_kit.sh` : 71 tests](dette-update-kit-sans-tests.md) — 11 défauts corrigés ; `feature-013` et `014` restants
- ⭐ [Ce que l'audit a laissé ouvert](chantiers-ouverts-apres-bug-001.md) — 3 constats graves, 1 corrigé, 2 en specs (`bug-003`, `feature-011`)
- [Étape D : garde-fous déclarés, appliqués par personne](etape-d-garde-fous-declares-non-appliques.md) — la première étape qui écrit ; spec `feature-007` écrite, non lancée
- [Une garde se livre atteignable](une-garde-se-livre-atteignable.md) — un défaut qui la rend inatteignable entre dans le cycle qui la livre (ADR-0017).
- [Un dépôt jetable n'est pas un petit dépôt réel](un-depot-jetable-n-est-pas-un-petit-depot-reel.md) — tout ce qui dépend d'un volume y est invisible par construction
- [Une mesure en aveugle exige de retirer l'information](une-mesure-en-aveugle-exige-de-retirer-l-information.md) — l'omettre du brief ne suffit pas si elle est dans le dépôt

---

## Note du 2026-09-15 — pourquoi ces fichiers sont ici

Ces mémoires vivaient **hors du dépôt**, dans l'emplacement que Claude Code
utilise par défaut. C'est précisément ce que le [README](README.md) de ce dossier
décrit comme le problème à éviter : *« hors du dépôt, donc sur une seule machine
et sans sauvegarde »*.

Le kit décrivait une discipline qu'il ne s'appliquait pas à lui-même. Quinze
mémoires — dont plusieurs écrites le jour même — auraient disparu au premier
changement de poste.

Copiées après vérification : **aucun secret, aucun jeton, aucun chemin de poste**
dans les quinze fichiers.

⚠️ **La copie n'est pas automatique.** Toute mémoire écrite pendant une session
doit être recopiée ici pour survivre — c'est ce que dit le README, et c'est ce
qui n'avait pas été fait pendant trois jours.
