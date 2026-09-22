---
name: cycle-021-clos-mais-rien-de-deploye
description: Le cycle feature-021 est clos et vert (18 commits), mais le serveur qui tourne sur le poste est celui du 2026-09-19 — aucun de ces commits ne protège quoi que ce soit tant qu'il n'est pas redéployé.
metadata:
  type: project
---

Cycle `feature-021` (cockpit Material 3) clos le **2026-09-22**, branche
`cycle/feature-021-cockpit-m3`, **18 commits**, cinq specs passées en `done/`
(`feature-021`, `bug-017`, `feature-022`, `feature-023`, `feature-025`).
Suite : 45 fichiers, **1893 cas en root / 1820 en non-root**, 0 échec — les
deux comptes sont normaux et l'écart de 73 est attribué (2 gardes CI muettes
dans un clone sans `.github/`, 1 cas sauté faute de transcript lisible par
`nobody`). **Branche non poussée** : le push exige un feu vert séparé
([[push-exige-un-feu-vert-separe]]).

**Le fait qui compte** : le serveur du centre de contrôle qui tourne sur le
poste de l'utilisateur a été lancé le **2026-09-19** et exécute le backend
d'avant le cycle — mesuré : 326 × `404` sur `/api/conversation`. Il ne se
redémarre pas depuis la session : le préfixe `!` s'exécute dans le même bac à
sable, qui ne peut pas signaler un processus qu'il n'a pas lancé.

**Why:** dix-huit commits vérifiés ne sont pas une protection tant que le
processus servi est l'ancien. L'AUDIT de sécurité classe le **redéploiement en
premier** des durcissements, avant tout nouveau code — d'où l'unité systemd,
convenue comme travail séparé et **pas encore écrite**.

**How to apply:** avant d'annoncer qu'un correctif du centre de contrôle
protège l'utilisateur, vérifier quelle version tourne (date de lancement du
PID, ou une route ajoutée par le cycle). Chantiers laissés ouverts par
l'AUDIT, dans son ordre : unité systemd + redéploiement ; `bug-010` (20
mauvais jetons en 60 s verrouillent le jeton valide) ; traçabilité du canal de
conversation (événement `MessageEnvoye`) ; TLS local ; `var/` en 0600 +
rétention des conversations + bornage de `pwrite` ; documenter ce que
`permissions_autorisees` **ne peut pas** voir (`--allowedTools`, `--settings`).
Voir aussi [[centre-de-controle-etat-et-pieges]] et
[[une-garde-se-livre-atteignable]].
