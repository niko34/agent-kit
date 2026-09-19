---
name: etape-d-garde-fous-declares-non-appliques
description: "Étapes D et E du centre de contrôle livrées : les garde-fous d'écriture sont du code, et _ROUTES_ECRITURE porte 4 chemins"
metadata: 
  node_type: memory
  type: project
  originSessionId: 037e5b4a-b565-49f7-85ea-9de58365dec4
  modified: 2026-09-19T18:07:09.312Z
---

**Mis à jour le 2026-09-19. La version précédente de cette mémoire disait que
l'étape D était à venir et que `feature-007` était « écrite, non lancée » :
c'était faux au moment où je l'ai relue.** Les deux étapes sont livrées.

## Ce qui existe réellement

`feature-007` est dans `specs/features/done/`. Ses trois garde-fous sont du
code : `control-center/backend/jeton.py`, `verrou.py`, `lanceur.py`.

`feature-008` (étape E, création de spec depuis le tableau de bord) a été
livrée le 2026-09-19 — voir [[cycle-feature-008-ce-qu-il-a-appris]].

## Le point qui se redécouvre mal

⚠️ **`_ROUTES_ECRITURE` (`server.py`) n'est pas une liste sémantique, c'est la
table de routage de `do_POST`.** Tout chemin absent d'elle reçoit `404` à la
garde 1, avant toute autre. Donc « route d'écriture » y veut dire « chemin que
`do_POST` accepte de router », **jamais** « route qui écrit ».

Coût mesuré : un agent a conclu que `/api/spec/brouillon` ne devait pas y
entrer, puisqu'il n'écrit rien. Sans correction, cette route était livrée
inatteignable.

Elle porte **4 chemins** depuis feature-008 : `/api/lancer`, `/api/interrompre`,
`/api/spec/brouillon`, `/api/spec/ecrire`.

## Ce qui monte la garde

Le test d'introspection d'ADR-0004 (« `Handler` n'a aucun `do_POST` ») est
tombé avec l'étape D. Ce qui l'a remplacé, et qui tient toujours :
`test_routes_ecriture_fermees` compare `_ROUTES_ECRITURE` à un ensemble
**exact**, et `test_do_methodes_limitees_a_get_et_post` interdit toute méthode
`do_*` neuve. ADR-0019 nomme le seul risque que rien n'empêche mécaniquement :
un développeur qui corrigerait le test plutôt que d'ajouter la route à la
liste. C'est un point de revue de code, pas une garantie automatique.
