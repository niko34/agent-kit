# Bug — Un orphelin est détecté (409) mais aucun chemin ne permet de le reprendre

- **Type** : bug
- **Statut** : todo
- **Version cible** : [à fixer par l'agent qui reprend cette spec]
- **Créée** : 2026-09-13 (constat reporté par `feature-007`, étape D du
  centre de contrôle — voir `docs/adr/0019-jeton-comme-unique-barriere-et-table-des-routes-fermee.md`,
  section « Ce que l'ADR ne ferme pas »)
- **Domaine** : API (`control-center/backend/server.py`,
  `control-center/backend/verrou.py`) — reprise d'un verrou orphelin
- **Spec liée** : `feature-007-pilotage-depuis-le-tableau-de-bord` (close),
  `ADR-0019`

## Agents requis

- [x] architect
- [ ] **security-reviewer, rôle GATE** — touche l'exécution de commandes
      locales déclenchées depuis le réseau (interruption d'un processus déjà
      en cours) ; si coché, **basculer sur le template feature complet**
- [x] backend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

Scénario, décrit par `verrou.py` et vérifié par le comportement documenté
de `feature-007` (à reconfirmer par exécution avant correction, régime
ADR-0017) :

1. Le serveur est tué par `SIGKILL` (ou tout signal qu'`atexit` ne peut pas
   intercepter) pendant qu'un lancement écrivain tourne.
2. Le noyau libère le `flock` du verrou — mais le processus fils continue de
   tourner, orphelin de son serveur.
3. Le serveur redémarre. `Verrou.acquerir()` lit la méta laissée par
   l'ancien détenteur, constate (via `pid_fils` + `starttime`) que le fils
   désigné est **toujours vivant**, et refuse la prise avec un motif qui
   NOMME l'orphelin (`Verrou._raison_orphelin()` : « un fils orphelin
   (commande %r, pid_fils=%s) tourne encore … : le serveur qui l'a lancé a
   disparu sans le terminer — interromps ce fils avant de reprendre
   l'écriture »). Ce refus se traduit par un `409` sur `POST /api/lancer`.
4. **Aucune route ne permet d'agir sur cet orphelin.**
   `POST /api/interrompre` interroge `Ecriture.lancement_courant()`, qui
   n'existe que pour un `Lancement` créé par **ce** processus serveur — un
   orphelin d'un serveur précédent n'a pas de `Lancement` en mémoire du
   nouveau serveur. `_interrompre()` répond donc `404 "aucun lancement en
   cours"`, alors même que `/api/lancer` répond `409` en nommant un fils
   bel et bien vivant.

Le seul recours actuel est de tuer le processus à la main sur la machine
(`kill <pid_fils>`), en dehors de toute interface.

## Cause racine

`Ecriture` (l'état en mémoire côté serveur) ne connaît que les lancements
qu'**elle** a créés (`self.lancements`). La méta du verrou, elle, survit à un
redémarrage de processus serveur (elle est sur disque) et porte assez
d'information (`pid_fils`, `starttime`, `cle`, `debut`) pour reconstruire un
objet d'interruption minimal — mais rien dans `server.py` ne fait ce pont :
`_interrompre()` ne consulte jamais la méta du verrou directement, seulement
`Ecriture.lancement_courant()`.

## Correctif attendu

1. `POST /api/interrompre` doit pouvoir agir sur un orphelin détecté par la
   méta du verrou, pas seulement sur un `Lancement` en mémoire du serveur
   courant : a minima, envoyer `SIGTERM` puis `SIGKILL` (même délai que
   `lanceur._tuer_groupe_avec_delai`) au `pid_fils` désigné par la méta,
   sans dépendre d'un objet `Lancement` que ce serveur n'a jamais créé.
2. Après interruption réussie d'un orphelin, la méta du verrou doit être
   nettoyée (le verrou redevient réellement libre), pour qu'un lancement
   suivant ne re-détecte pas le même orphelin déjà mort.
3. La journalisation de cette interruption doit être aussi fidèle que celle
   d'un lancement normal (A7/A8 de `feature-007`) : qui a interrompu, quel
   `pid_fils`, quand — un orphelin tué ne doit pas être une opération
   silencieuse.
4. Cas limite : l'orphelin est déjà mort entre la détection (`409` sur
   `/api/lancer`) et la tentative d'interruption — `POST /api/interrompre`
   doit alors répondre proprement (pas une exception), et un lancement
   redevient possible immédiatement après.

## Critères d'acceptation

- [ ] Un scénario réel (serveur tué par SIGKILL pendant un lancement,
      redémarrage, `POST /api/interrompre`) permet de reprendre la main sans
      intervention manuelle sur la machine
- [ ] La méta du verrou est nettoyée après reprise réussie ; un lancement
      suivant n'est plus refusé par l'orphelin déjà traité
- [ ] L'interruption d'un orphelin est journalisée avec le même niveau de
      détail qu'une interruption normale
- [ ] Interrompre un orphelin déjà mort entre la détection et la tentative
      ne lève aucune exception non gérée
- [ ] Suite de tests verte (+ test de non-régression couvrant ce scénario,
      vu échouer sur le code d'avant le fix — nécessite de simuler un
      SIGKILL réel du serveur, pas seulement un mock)
- [ ] Lint propre, pas de warning nouveau

## Hors périmètre

- Le freinage global des échecs d'authentification et la lecture anonyme non
  bornée (`bug-010`)
- La reprise automatique (sans action de l'opérateur) d'un orphelin au
  redémarrage : ce lot ne fait qu'ouvrir un chemin d'interruption manuelle
  depuis l'interface, pas une politique de reprise automatique
