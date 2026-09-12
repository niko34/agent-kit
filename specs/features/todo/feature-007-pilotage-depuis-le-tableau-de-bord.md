## Métadonnées
- **ID** : feature-007
- **Slug** : pilotage-depuis-le-tableau-de-bord
- **Type** : feature
- **Statut** : todo
- **Priorité** : haute
- **Version cible** : 0.6.0
- **Dernière mise à jour** : 2026-09-12
- **Spec(s) liée(s)** : feature-002 (le tableau de bord en lecture seule, dont
  cette spec lève la restriction), feature-001 (le journal qui rendra le
  lancement observable)

> **Étape D** du centre de contrôle. C'est la **première étape qui écrit**.
> Les trois garde-fous sont aujourd'hui déclarés dans `control-center.toml` et
> appliqués par **personne** ; ADR-0004 pose qu'ils doivent devenir du code
> **avant**, et non après, la première route qui écrit. Cette spec est donc
> ordonnée : garde-fous d'abord, route ensuite.

## Domaines touchés
- [x] API REST (endpoints, contrats, codes d'erreur) — première route
      d'écriture du centre de contrôle
- [x] Frontend (écrans, composants, appels API) — le bouton qui lance, et
      l'état d'un lancement en cours
- [ ] BDD / migrations
- [x] Auth / permissions → **passage obligatoire par `security-reviewer` (rôle GATE)** —
      le jeton partagé est la seule barrière entre le réseau et l'exécution de
      commandes locales
- [x] Données personnelles → **passage obligatoire par `security-reviewer` (rôle GATE)** —
      la sortie d'une commande lancée peut contenir tout ce que le projet
      manipule ; elle traverse le serveur pour atteindre le navigateur
- [ ] Intégrations externes
- [x] Tâches de fond — un processus lancé vit au-delà de la requête HTTP qui
      l'a déclenché

## Agents requis
- [x] spec-reader
- [x] architect
- [x] security-reviewer, rôle GATE — **P1 sur le design, AVANT toute ligne de
      code** ; P2 sur le diff réel. C'est le cas nominal pour lequel le double
      passage existe
- [x] ux-ui-designer — un bouton qui dépense de l'argent et écrit dans le
      dépôt n'a pas la même ergonomie qu'un bouton de filtre
- [x] backend-developer
- [x] frontend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Description
Permettre de lancer, depuis le tableau de bord, un workflow déclaré dans
`control-center.toml`, et d'en suivre l'exécution en direct. Le lancement est
protégé par les trois garde-fous déjà déclarés — jeton partagé, écrivain
unique, plafond de dépense — qui deviennent du code **dans ce lot**, avant la
première route d'écriture.

## Contexte
Le centre de contrôle observe (étapes A à C) mais ne peut rien déclencher :
`Handler` ne définit ni `do_POST`, ni `do_PUT`, ni `do_DELETE`, et
`http.server` répond donc `501` de lui-même. Ce n'est pas une option
désactivée, c'est une absence de méthode, verrouillée par un test
d'introspection de classe (ADR-0004).

Cette absence était le prix assumé d'une livraison rapide en lecture seule.
Elle a une contrepartie explicite : `control-center.toml` déclare depuis trois
commits un `fichier_jeton`, un `budget_max_usd` et un `ecrivains_simultanes`
que **rien ne lit**. Le module a déjà connu ce défaut une fois — le README
note un fichier de configuration resté « commenté, versionné, entièrement
décoratif » pendant trois commits, et le qualifie de « pire forme de dette :
une configuration qui a l'air d'être en service alors qu'elle ne pilote
rien ». Livrer la route avant les gardes referait exactement cela, avec cette
fois une conséquence réelle.

## Comportement attendu

### Ordre imposé : les gardes d'abord
Aucune ligne de `do_POST` n'est écrite tant que les trois garde-fous ne sont
pas implémentés et testés **isolément**. C'est la condition posée par
ADR-0004, et le critère d'acceptation qui la vérifie est le premier de la
liste.

### Garde-fou 1 — le jeton partagé
- Lu depuis le fichier désigné par `[serveur].fichier_jeton`, **hors dépôt**.
- Comparaison par `hmac.compare_digest`, jamais par `==` : une comparaison qui
  s'arrête au premier octet différent fuit la longueur du préfixe correct.
- Permissions du fichier vérifiées au démarrage : un jeton lisible par tous
  n'est pas un secret. Le serveur **refuse de démarrer** avec les routes
  d'écriture actives plutôt que de démarrer en les croyant protégées.
- Absent, vide ou illisible → les routes d'écriture ne sont pas exposées, et
  le serveur le **dit au démarrage**. La lecture seule, elle, continue de
  fonctionner : un projet qui ne veut pas du pilotage garde son tableau de
  bord.
- Le jeton n'apparaît jamais dans un journal, une URL, un message d'erreur ni
  un événement du collecteur.

### Garde-fou 2 — l'écrivain unique
- Au plus `[garde_fous].ecrivains_simultanes` workflow écrivain à la fois
  (défaut : 1). Deux sessions qui écrivent dans le même arbre s'entrelacent
  selon l'ordre des vidages ; le résultat n'est réparable par personne.
- Un second lancement est **refusé avec sa raison**, jamais mis en file en
  silence. Le refus nomme ce qui occupe la place et depuis quand.
- Le verrou survit à la mort du serveur : un verrou laissé par un processus
  disparu doit être détectable et repris, sinon le premier plantage interdit
  tout lancement ultérieur.
- Le serveur étant un `ThreadingHTTPServer`, deux requêtes concurrentes
  peuvent franchir le test en même temps : la prise du verrou doit être
  atomique, pas un « lire puis écrire ».

### Garde-fou 3 — le plafond de dépense
- `[garde_fous].budget_max_usd` est passé au processus lancé
  (`--max-budget-usd`), et **jamais seulement affiché**.
- Un clic ne doit pas pouvoir déclencher une consommation non bornée : si le
  plafond ne peut pas être transmis à la commande déclarée, le lancement est
  refusé.
- Le plafond appliqué est visible dans l'interface avant la confirmation.

### Le lancement lui-même
- L'interface envoie une **clé** de `[commandes]`, jamais une ligne de
  commande (ADR-0005). Une clé inconnue échoue sans effet.
- Exécution en `argv`, `shell=False`, répertoire de travail confiné au dépôt —
  mêmes règles que `backend/vcs.py`.
- La sortie est diffusée au navigateur **en direct**, par le flux SSE existant
  ou un flux dédié — `architect` tranche.
- Le lancement produit des événements dans le journal : qui a lancé, quelle
  clé, quand, avec quel résultat. Un lancement qu'on ne peut pas retrouver
  après coup n'est pas auditable.
- Un lancement en cours peut être **interrompu** depuis l'interface, et
  l'interruption est elle aussi journalisée.

### Cas limites
- Jeton absent / invalide / expiré en cours de session → refus, et l'interface
  le dit sans exposer la valeur attendue.
- Deuxième lancement pendant qu'un premier tourne → refus motivé (garde-fou 2).
- Serveur arrêté pendant un lancement : que devient le processus fils ? Le
  comportement doit être **décidé**, pas subi (orphelin, tué, ou repris).
- Commande déclarée qui n'existe pas sur la machine → erreur exploitable, pas
  une trace brute.
- Commande qui n'écrit rien pendant plusieurs minutes → l'interface doit
  distinguer « en cours » de « bloqué ».
- Sortie très volumineuse → bornée, et la troncature **annoncée** : un flux
  coupé en silence se lit comme un flux complet (règle déjà appliquée aux
  diffs en étape B).
- Navigateur fermé pendant le lancement → le processus continue ; la
  reconnexion doit retrouver l'état.

## Comportement actuel
Le tableau de bord est en lecture seule par construction. `Handler` n'a aucune
méthode d'écriture ; toute requête `POST`/`PUT`/`DELETE` reçoit `501 Not
Implemented` de `http.server` lui-même. Les trois garde-fous existent
uniquement comme clés de configuration, lues par personne.

## Contraintes techniques
- **Bibliothèque standard Python uniquement** (ADR-0006). Le jeton, le verrou
  et la diffusion de sortie s'écrivent sans dépendance, ou l'ADR-0006 est
  remis en cause explicitement — pas contourné.
- Les commandes lançables restent une **liste fermée par clé** (ADR-0005) ;
  aucune chaîne venue du réseau n'atteint un shell.
- Le défaut de configuration reste sûr : sans `fichier_jeton`, sans
  `[commandes]`, le serveur démarre en lecture seule. L'ouverture est une
  décision explicite du projet, jamais un héritage silencieux.
- L'écoute reste locale par défaut (`127.0.0.1`).
- Le test d'introspection de classe d'ADR-0004 **va échouer** par
  construction : c'est le signal qu'il est fait pour donner. Il n'est pas
  supprimé sans être remplacé par une garantie au moins aussi forte sur le
  périmètre des méthodes d'écriture réellement exposées — voir « ADR attendu ».

## Fichiers potentiellement concernés
- `control-center/backend/server.py` — `do_POST`, routage d'écriture
- `control-center/backend/jeton.py` — [nouveau] lecture et comparaison du jeton
- `control-center/backend/verrou.py` — [nouveau] écrivain unique
- `control-center/backend/lanceur.py` — [nouveau] exécution `argv`, flux de sortie
- `control-center/backend/config.py` — lecture de `fichier_jeton`,
  `budget_max_usd`, `ecrivains_simultanes`, aujourd'hui déclarés et non lus
- `control-center/backend/test_server.py` — le test d'introspection à
  reformuler, les cas d'écriture à ajouter
- `control-center/web/app.js`, `app.css`, `index.html` — commande, confirmation,
  sortie en direct, interruption
- `control-center/control-center.example.toml` — commentaires à jour une fois
  les clés réellement lues
- `control-center/README.md` — étape D
- `docs/adr/NNNN-*.md` — voir « ADR attendu »
- `CHANGELOG.md` — entrée sous 0.6.0

## Livrables — check-list
- [ ] A1 — Jeton : lecture hors dépôt, `hmac.compare_digest`, contrôle des
      permissions, refus de démarrer les routes d'écriture sans lui
- [ ] A2 — Verrou d'écrivain unique, prise atomique, refus motivé, reprise
      d'un verrou orphelin
- [ ] A3 — Plafond de dépense réellement transmis au processus lancé
- [ ] A4 — Les trois garde-fous testés **isolément**, avant toute route
- [ ] A5 — `do_POST` : lancement par clé, `argv`, `shell=False`, confinement
- [ ] A6 — Diffusion de la sortie en direct, bornée, troncature annoncée
- [ ] A7 — Interruption d'un lancement en cours
- [ ] A8 — Journalisation du lancement (qui, quoi, quand, résultat), sans secret
- [ ] B1 — Interface : choix de la commande, confirmation montrant le plafond
- [ ] B2 — Interface : sortie en direct, état « en cours / terminé / échoué /
      interrompu », reconnexion après fermeture du navigateur
- [ ] C1 — `control-center/README.md` étape D, `CHANGELOG.md`
- [ ] C2 — ADR sur le remplacement de la garantie d'ADR-0004 (voir ci-dessous)
- [ ] D1 — Tous les cas validés par mutation

## Nouvelles signatures / API
- `POST /api/lancer` — corps : `{ "cle": "<clé de [commandes]>" }` ;
  authentification par jeton ; réponses : `202` accepté, `401` jeton absent ou
  faux, `403` routes d'écriture non activées, `404` clé inconnue, `409` un
  écrivain est déjà en cours, `503` plafond de dépense non transmissible.
  Les statuts exacts sont à confirmer par `architect`.
- `POST /api/interrompre` — interruption du lancement en cours.
- Flux de sortie : extension de `/api/flux` ou flux dédié — `architect` tranche.
- Variables d'environnement nouvelles : aucune a priori ; le jeton vit dans un
  fichier, pas dans l'environnement (un environnement se recopie dans les
  journaux plus facilement qu'un fichier en mode 600).

## Sécurité & données
- Authentification touchée : **oui** — création de la première et unique
  barrière d'authentification du module. Jeton partagé, comparaison à temps
  constant, fichier hors dépôt en mode 600.
- Permissions / rôles touchés : **oui** — le modèle est binaire (porteur du
  jeton = peut tout lancer). C'est un choix à assumer explicitement devant
  `security-reviewer` en P1, pas un défaut d'implémentation.
- Données personnelles collectées ou traitées : **oui** — la sortie d'une
  commande lancée peut contenir n'importe quoi de ce que le projet manipule,
  et elle transite par le serveur vers le navigateur. Finalité : rendre
  observable le workflow lancé. À borner comme le sont déjà les diffs.
- Migration destructive : non applicable
- Nouvelle exposition publique (endpoint sans auth) : **non, et c'est le
  point** — la route d'écriture ne doit jamais exister sans jeton. Un projet
  qui ouvre `hote = "0.0.0.0"` sans jeton doit obtenir un tableau de bord en
  lecture seule, pas un lanceur ouvert.
- Risque identifié : **exécution de commandes locales déclenchée depuis le
  réseau**. C'est la surface la plus dangereuse de tout le kit. Les
  atténuations prévues (liste fermée par clé, jeton, verrou, plafond,
  `shell=False`) doivent être validées **avant** le code, en P1.
- **Au moins un « oui » ci-dessus → `security-reviewer` (rôle GATE) est coché**

## ADR attendu ?
- **Probable** : **oui**
- **Critère(s) candidat(s)** : 1 (contrainte structurante), 2 (décision
  invisible dans le code), 4 (verrouillage long terme)
- **Sujet pressenti** : « Ce qui remplace l'absence de route d'écriture ».
  ADR-0004 tire sa force d'une garantie **structurelle** — une méthode qui
  n'existe pas ne peut pas être contournée — et le test d'introspection qui
  la verrouille va tomber avec ce lot. Ce qui la remplace (une liste fermée de
  routes d'écriture ? un test d'introspection inversé, qui énumère les
  méthodes autorisées et échoue sur toute autre ? le jeton comme unique
  barrière ?) est exactement le genre de décision qui disparaît dans le code
  six mois plus tard. ADR-0004 n'est pas contredit — sa condition est
  remplie — mais le nouvel ADR doit dire lequel des deux fait foi désormais.

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- `POST /api/lancer`, `POST /api/interrompre`, extension du flux de sortie

### Écrans / flux UI concernés
- Tableau de bord : sélection d'une commande, confirmation avec plafond
  affiché, sortie en direct, interruption, états d'un lancement

### Schéma BDD / migrations
- Aucun

### Documentation à produire / mettre à jour

#### Docs vivantes
- `control-center/README.md` — étape D, et tableau d'avancement A→G
- `docs/subsystems/` — si le projet hôte en tient un pour le centre de contrôle

#### Docs transverses
- `docs/API.md` — les deux routes d'écriture et leurs codes d'erreur
- `docs/ARCHITECTURE.md` — le jeton, le verrou, le processus lancé
- `README.md` — la mise en service du pilotage (fichier de jeton, mode 600)
- `CHANGELOG.md` — entrée sous 0.6.0

#### Docs immuables
- `docs/adr/NNNN-*.md` — voir « ADR attendu »

## Critères d'acceptation
- [ ] **Les trois garde-fous sont du code, testés, avant la première ligne de
      `do_POST`** — vérifiable dans l'ordre des commits du cycle
- [ ] Sans fichier de jeton valide, aucune route d'écriture n'est exposée, et
      le serveur le dit au démarrage
- [ ] Un jeton faux est refusé sans révéler d'information par le temps de
      réponse (comparaison à temps constant)
- [ ] Deux lancements concurrents : le second est refusé avec sa raison ;
      vérifié avec des requêtes **réellement simultanées**, pas séquentielles
- [ ] Le plafond de dépense atteint réellement le processus lancé — vérifié
      sur la ligne de commande effective, pas sur l'intention
- [ ] Une clé de commande inconnue n'atteint aucun shell
- [ ] Aucun secret (jeton, contenu de la sortie) n'apparaît dans le journal
      d'événements
- [ ] Le test d'introspection d'ADR-0004 est remplacé par une garantie au
      moins aussi forte, pas supprimé
- [ ] Suite de tests complète verte, zéro régression
- [ ] Lint propre, pas de warning nouveau
- [ ] Comportement nominal testé manuellement selon le plan ci-dessous

## Plan de test manuel
1. **Nominal** : jeton en place, lancer une commande déclarée, voir sa sortie
   arriver en direct, constater l'événement correspondant dans le journal.
2. **Sans jeton** : démarrer sans `fichier_jeton` — le tableau de bord
   fonctionne en lecture, aucune route d'écriture n'existe, le message de
   démarrage le dit.
3. **Jeton mal protégé** : fichier en mode 644 — le serveur refuse d'activer
   les routes d'écriture.
4. **Concurrence** : deux lancements envoyés simultanément depuis deux
   navigateurs — un seul démarre, l'autre est refusé avec un motif lisible.
5. **Plafond** : déclarer un plafond bas, lancer, vérifier sur la ligne de
   commande réelle du processus qu'il a bien été transmis.
6. **Clé inconnue** : envoyer une clé absente de `[commandes]` — refus, aucun
   processus créé.
7. **Interruption** : lancer une commande longue, l'interrompre, vérifier que
   le processus est mort et que le verrou est rendu.
8. **Plantage** : tuer le serveur pendant un lancement, le redémarrer —
   vérifier qu'un lancement reste possible (verrou orphelin repris).

## Notes pour agent
- **Cette spec est celle pour laquelle le double passage P1/P2 a été conçu.**
  Un GO en P1 ne vaut jamais GO en P2 : une garde correcte sur le papier peut
  être mal placée dans le code — et la règle maîtresse du rôle AUDIT est
  précisément « la PLACE de la garde dans le cycle de vie, jamais sa seule
  présence ».
- Le constat empirique d'ADR-0009 pèse ici : lors du chantier du tableau de
  bord (feature-002), **aucun agent de sécurité n'a été invoqué** sur un
  serveur HTTP destiné à écouter au-delà de localhost. Ne pas refaire.
- Les étapes A à C ont été menées sans spec ni orchestrateur. Celle-ci est à
  mener dans les règles : `orchestrator` d'abord, puis `security-reviewer` en
  P1 **sur le design**, avant que quoi que ce soit ne soit écrit.
- Le verrou d'écrivain unique et le `ThreadingHTTPServer` sont un piège
  classique : deux requêtes peuvent franchir un test « le verrou est-il
  libre ? » avant qu'aucune ne l'ait pris. La prise doit être atomique
  (création exclusive de fichier, par exemple), et le test doit être
  réellement concurrent — un test séquentiel passerait sur un code faux.
- La sortie d'une commande n'est pas une donnée neutre : le collecteur
  d'événements a déjà connu **deux** chemins de fuite de mot de passe
  (feature-001). Traiter la sortie diffusée avec la même défiance.

## Hors périmètre
- Étape E — création d'une spec depuis un prompt (feature-008)
- Étape F — discussion par spec (feature-009)
- Étape G — scénario complet avec échec réel (feature-010)
- Tout modèle de permissions plus fin qu'un jeton unique (rôles, utilisateurs
  distincts) : à traiter par une spec dédiée si le besoin apparaît
- L'ouverture du tableau de bord sur un réseau non maîtrisé : reste une
  décision du projet consommateur, documentée, jamais un défaut du kit
