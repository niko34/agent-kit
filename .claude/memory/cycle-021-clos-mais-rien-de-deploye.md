---
name: cycle-021-clos-mais-rien-de-deploye
description: Cycle feature-021 clos et vert (18 commits) ; serveur redémarré le 2026-09-22 sur ce code, mais lancé à la main — il ne survivra pas à un reboot tant que l'unité systemd n'existe pas.
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

**Le fait qui comptait, et qui est réglé** : le serveur tournait depuis le
**2026-09-19** avec le backend d'avant le cycle. **Redémarré le 2026-09-22 à
12:56** (SIGTERM propre, aucun SIGKILL nécessaire), relancé détaché par
`setsid` depuis `/root/agent-kit`, journal dans `control-center/var/serveur.log`.
Vérifié : `/app.js` servi a le **même sha256** que le fichier du dépôt,
`/api/etat` rend 200 et 50 specs, la bannière de démarrage liste
`/api/conversation` parmi les routes d'écriture, et le navigateur du poste
(192.168.1.16) **appelle `/api/conversation`** — ce que seul le nouveau
frontal fait.

⚠️ **Le code 404 seul ne prouve plus rien sur `/api/conversation`** : le
nouveau code rend lui aussi 404, avec le corps
`{"erreur": "aucun agent en cours n'accepte de message"}`, quand aucun
lancement n'accepte de canal. Distinguer par le **corps**, jamais par le
statut.

⚠️ Le processus est lancé **à la main**, pas par un service : il ne survivra
pas à un redémarrage de la machine. L'**unité systemd reste à écrire** — c'est
le premier durcissement classé par l'AUDIT.

**Why:** dix-huit commits vérifiés ne sont pas une protection tant que le
processus servi est l'ancien — il l'a été pendant trois jours sans que rien ne
le signale. Un processus relancé à la main rouvre la même fenêtre au premier
reboot.

**How to apply:** avant d'annoncer qu'un correctif du centre de contrôle
protège l'utilisateur, vérifier quelle version tourne — date de lancement du
PID, **empreinte du statique servi contre celle du dépôt**, bannière de
démarrage. Le `!` d'une session ne peut pas signaler ce processus (bac à sable
distinct) ; l'outil Bash de la session, lui, le peut. Chantiers laissés ouverts par
l'AUDIT, dans son ordre : unité systemd + redéploiement ; `bug-010` (20
mauvais jetons en 60 s verrouillent le jeton valide) ; traçabilité du canal de
conversation (événement `MessageEnvoye`) ; TLS local ; `var/` en 0600 +
rétention des conversations + bornage de `pwrite` ; documenter ce que
`permissions_autorisees` **ne peut pas** voir (`--allowedTools`, `--settings`).
Voir aussi [[centre-de-controle-etat-et-pieges]] et
[[une-garde-se-livre-atteignable]].
