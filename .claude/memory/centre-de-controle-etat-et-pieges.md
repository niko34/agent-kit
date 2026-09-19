---
name: centre-de-controle-etat-et-pieges
description: "État du centre de contrôle au 2026-09-13 : bornage par segments livré, SessionEnd ne se déclenche jamais, bug-002 à réétablir"
metadata:
  type: project
---

Module `control-center/`, distinct de `tools/update_kit.sh` — **rien du terrain
de l'un ne s'applique à l'autre**. Sa suite est faite de **scripts autonomes**
(`python3 control-center/backend/test_events.py`), pas de `unittest` : ni
`harnais_kit`, ni `MARQUEURS_DE_GARDE`, ni matrice diagonale ici.

**171 cas** sur 6 fichiers au 2026-09-13 (139 avant `bug-004`), et **enfin
exécutés par une CI**, sur les deux forges — ils ne l'étaient par aucune.

## Deux faits mesurés qui commandent la suite

**`SessionEnd` ne se déclenche JAMAIS.** Zéro occurrence sur 1563 événements,
bien que branché dans `.claude/settings.json` (vérifié). Conséquence directe :
⚠️ **la cause racine de `bug-002` est invalide** — elle affirme que
« `SessionEnd` marque la fin du tour ». Son bloc de symptôme **doit être
réétabli avant de lancer ce cycle**.

**333 `SubagentStop` sur 378 sans `agent_type`.** Confirmé et bien plus massif
que ce que `feature-001` estimait. Figé par un test.

## Ce que `bug-004` a livré (`09a3e44`)

Bornage par **segments**, paramètre déclaré en configuration
(`[workflows] agents_ouvrants`), jamais de nom d'agent en dur — `events.py`
promet en tête de module de n'en connaître aucun. **Défaut = liste vide**, donc
comportement inchangé pour un projet neuf.

Limite assumée et **affichée à l'écran** : le bornage est **aveugle aux cycles
de travail direct**, qui n'invoquent pas d'orchestrateur et restent rattachés
au segment précédent. Un segment ne s'appelle jamais « cycle de spec » — le
module ne sait pas ce qu'est une spec (ADR-0014).

⚠️ **Effet visible à ne pas « corriger » par erreur** : tous les segments
s'affichent « sans fin observée », y compris les terminés, puisque `fin` n'est
jamais renseigné. C'est **voulu** — fabriquer une fin serait inventer un fait.
Appartient à `bug-002`.

Voir [[un-correctif-tardif-doit-rouvrir-les-tests]].
