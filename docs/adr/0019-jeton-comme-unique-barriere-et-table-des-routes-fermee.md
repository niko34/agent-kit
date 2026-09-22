# ADR-0019 — Ce qui remplace l'absence de route d'écriture : une table des routes fermée et le jeton comme unique barrière

## Statut

Accepté (`_ROUTES_ECRITURE` étendue de 4 à 8 entrées par [ADR-0040](0040-les-chemins-decriture-du-cockpit.md) —
`/api/spec/lancer`, `/api/spec/modifier`, `/api/spec/supprimer`, `/api/conversation` ;
le test d'introspection et la garantie structurelle décrits ici ne changent pas de forme)

## Date

2026-09-13

## Contexte

[ADR-0004](0004-centre-controle-sans-route-ecriture.md) posait que le tableau
de bord ne pouvait rien lancer, rien écrire, rien dépenser, parce que
`Handler` ne définissait **aucune** méthode `do_POST`, `do_PUT` ou
`do_DELETE` : `http.server` répondait `501` de lui-même, et un test
d'introspection de classe vérifiait l'**absence** de ces méthodes. ADR-0004
posait aussi explicitement sa propre échéance : les trois garde-fous déclarés
en configuration (jeton, écrivain unique, plafond de dépense) devaient
devenir du code **avant**, et non après, l'ajout de la première route
d'écriture.

`feature-007` (étape D du centre de contrôle) ajoute cette première route.
Le test d'introspection d'ADR-0004 échoue donc **par construction** dès que
`do_POST` existe — ce n'est pas une régression, c'est le signal que la
garantie qu'il vérifiait est arrivée à son terme prévu.

## Décision

**La garantie structurelle ne repose plus sur une absence de méthode, mais
sur une table des routes d'écriture fermée, combinée à un test
d'introspection inversé.**

- `control-center/backend/server.py` déclare `_ROUTES_ECRITURE = ("/api/lancer",
  "/api/interrompre")` : une liste fermée, vérifiée **avant** toute autre
  garde dans `do_POST`. Un chemin absent de cette liste reçoit `404` sans
  qu'aucune comparaison de jeton, aucune lecture de corps, aucun `Popen` ne
  s'exécute.
- Le test d'introspection n'affirme plus l'absence de méthodes d'écriture :
  il affirme que l'ensemble des méthodes `do_*` de `Handler` vaut
  **exactement** `{"do_GET", "do_POST"}`, et que l'ensemble des routes
  réellement routées par `do_POST` vaut **exactement**
  `_ROUTES_ECRITURE`. Ce nouveau test échoue sur **tout** `do_*` futur
  (`do_PUT`, `do_DELETE`, ou tout autre verbe) et sur **toute** route
  d'écriture ajoutée à `do_POST` sans être d'abord ajoutée à
  `_ROUTES_ECRITURE` — il est donc **plus large** que celui qu'il remplace,
  pas seulement différent : l'ancien ne protégeait que contre l'ajout de
  méthodes ; le nouveau protège aussi contre l'ajout de routes à l'intérieur
  d'une méthode déjà existante.
- Le jeton partagé (`jeton.py`, `hmac.compare_digest`) est l'**unique**
  barrière d'authentification : sans jeton actif, `do_POST` répond `403` à
  toute route d'écriture, quoi qu'on présente. Un jeton absent, vide, mal
  protégé ou non-ASCII désactive l'écriture sans jamais désactiver la
  lecture.

**ADR-0004 n'est pas contredit : sa condition est remplie, et c'est
vérifiable.** Au terme du lot 1 de `feature-007` (jeton, verrou, plafond,
testés isolément), `control-center/backend/test_server.py` passait encore
34/34 avec l'introspection d'origine intacte, et `git diff` ne touchait pas
`server.py` — la route d'écriture n'existait pas encore. C'est seulement au
lot 2 (`do_POST` lui-même) que l'ancien test a été remplacé par le nouveau,
dans le même mouvement que l'ajout de la route qui le rendait caduc. Le
statut d'ADR-0004 est mis à jour avec un renvoi vers le présent ADR ; son
corps n'est pas réécrit.

### Ce qui a été écarté : le SSE pour diffuser la sortie d'un lancement

La spec envisageait d'étendre le flux SSE existant (`/api/flux`) pour
diffuser la sortie d'un lancement en direct. Écarté :

- l'API `EventSource` du navigateur ne permet de poser **aucun en-tête** —
  le jeton aurait dû voyager en paramètre de requête (query string) ;
- une query string atterrit dans les journaux d'accès et les historiques de
  proxy, exactement ce que le jeton doit éviter (il ne doit apparaître « ni
  dans un journal, une URL, un message d'erreur, ni un événement du
  collecteur », spec `feature-007`) ;
- `Handler.log_message` recrache déjà sur `stderr` tout code `4xx`/`5xx` —
  donc précisément le `401` qu'un jeton en query string déclencherait à
  chaque échec, l'exposant deux fois : une fois côté client dans l'URL, une
  fois côté serveur dans les logs.

Remplacé par `GET /api/lancement?depuis=<curseur>`, jeton dans l'en-tête
`Authorization: Bearer`, comme `/api/lancer`. Le paramètre `depuis` est un
curseur opaque sur le flux total produit, ce qui rend la reconnexion après
fermeture d'onglet gratuite : le navigateur redemande simplement depuis son
dernier curseur connu, sans état côté serveur à retrouver pour lui.

### Le sort du processus fils, décidé et non subi

- `lanceur.py` lance le fils avec `start_new_session=True` : il devient
  meneur de son propre groupe de processus, distinct de celui du serveur.
- À l'arrêt propre du serveur (`atexit`, `SIGTERM`, `SIGINT`) :
  `killpg(SIGTERM)` sur le groupe, puis `killpg(SIGKILL)` après un délai de
  5 secondes s'il n'a pas terminé.
- Si le serveur est lui-même `SIGKILL`é, rien de ce qui précède ne s'exécute
  — le **noyau** libère alors le `flock` du verrou (comportement du noyau,
  pas du code), mais le fils peut continuer à tourner, orphelin. La méta du
  verrou porte `pid_fils` **et** `starttime` (champ 22 de
  `/proc/<pid>/stat`) précisément pour ce cas : au prochain démarrage, un
  verrou repris dont le fils désigné est encore vivant (PID existe,
  `/proc/<pid>/cmdline` non vide, `starttime` identique) rend `409` avec un
  motif qui NOMME explicitement l'orphelin — `Verrou._raison_orphelin()`,
  distinct du motif d'un écrivain concurrent réel (`Verrou._raison()`) :
  « un fils orphelin (commande %r, pid_fils=%s) tourne encore … : le serveur
  qui l'a lancé a disparu sans le terminer — interromps ce fils avant de
  reprendre l'écriture » — plutôt que de laisser un second écrivain démarrer
  à côté du premier, ou de rendre l'orphelin indiscernable d'un simple
  concurrent (correctif relevé en revue finale de `feature-007` : le message
  d'origine ne distinguait pas les deux cas).
- Vérifié en conditions réelles (`verrou.py`, section « Le noyau libère le
  verrou ; il ne tue pas le fils ») : un fils orphelin continue d'écrire tant
  qu'il n'est pas explicitement repris — ce que ce lot ne fait pas encore
  (voir « Ce que l'ADR ne ferme pas »).

## Alternatives considérées

- **Garder l'absence de méthode comme garantie, et déplacer les deux routes
  d'écriture dans un second `Handler` monté sur un port séparé** : écarté —
  cela aurait dupliqué toute la logique de lecture (`/api/etat`, `/api/spec`,
  `/api/diff`, `/api/flux`) sur deux serveurs, ou exigé un routage HTTP par
  port devant le navigateur, sans supprimer le besoin d'une liste fermée
  quelque part.
- **Un décorateur ou une garde en tête de `do_POST` plutôt qu'une liste
  déclarée en constante de module** : écarté — c'est exactement l'alternative
  qu'ADR-0004 avait déjà écartée pour la même raison (« une garde peut être
  contournée par erreur ou oubliée sur un chemin annexe ») ; une liste
  fermée, vérifiée par un test d'introspection qui énumère la totalité de ce
  qui est routé, ne laisse pas de chemin annexe possible.
- **SSE pour la sortie du lancement** : écarté, voir ci-dessus.
- **Laisser le noyau seul décider du sort du fils (aucune action explicite à
  l'arrêt du serveur)** : écarté — un `Ctrl+C` ou un arrêt de service
  ordinaire aurait alors systématiquement laissé un orphelin, faisant du cas
  rare (`SIGKILL` du serveur) le cas normal.

## Conséquences

### Positives

- La garantie reste vérifiable mécaniquement (test d'introspection), pas
  seulement par lecture du code — et elle est **plus large** qu'avant : elle
  couvre aussi les routes ajoutées à l'intérieur d'une méthode existante, pas
  seulement l'apparition d'une méthode.
- Le jeton ne transite jamais par une URL, y compris pour la sortie en
  direct d'un lancement : aucun log d'accès, aucun historique de proxy ne
  peut le recueillir.
- La reconnexion après fermeture de l'onglet ne demande aucun état côté
  serveur à retrouver : le curseur suffit.
- Un crash du serveur ne laisse jamais un second écrivain démarrer à côté
  d'un fils toujours vivant : le refus `409` nomme la situation.

### Négatives

- **Ce qui verrouille l'avenir** : toute route d'écriture future doit
  d'abord entrer dans `_ROUTES_ECRITURE`, sous peine de faire échouer le test
  d'introspection — c'est la contrainte structurante voulue, mais c'est une
  contrainte. Un développeur pressé qui contournerait le test lui-même
  (plutôt que d'ajouter la route à la liste) romprait la garantie sans que
  rien ne l'en empêche mécaniquement au-delà de la revue de code.
- Le modèle de permissions reste binaire (porteur du jeton = peut tout
  lancer) : ce n'est pas résolu par cet ADR, c'est un choix assumé ailleurs
  (spec `feature-007`, section Sécurité & données) et hors périmètre de ce
  lot.
- Un orphelin détecté (`409`) n'est, à ce stade, **repris par aucun chemin**
  de l'interface : voir « Ce que l'ADR ne ferme pas ».

### Ce que l'ADR ne ferme pas

- **La reprise d'un orphelin.** Le verrou le détecte et refuse un second
  lancement (`409`), mais `POST /api/interrompre` répond `404` dans ce cas
  (aucun lancement connu du serveur courant) : il n'existe aucun chemin pour
  interrompre l'orphelin depuis l'interface. Traité par `bug-011`.
- **Le freinage des échecs d'authentification est global, pas par IP.** Vingt
  échecs venus d'une seule IP anonyme déclenchent `429` pour **tout le
  monde**, y compris l'opérateur légitime. Traité par `bug-010`, avec la
  lecture anonyme non bornée de `/api/flux`.
- **Le sondage de `/api/lancement` n'est borné en nombre de clients par
  aucune garde** — hors périmètre de ce lot.
- **Le début d'une sortie de plus de 200 000 octets est perdu**, pas la fin :
  le tampon de `lanceur.py` est circulaire et annonce la troncature
  (`tronque=True`), mais ne conserve que la queue du flux. Assumé, comme pour
  les diffs (étape B).
- **La réutilisation de PID sur un système sans `/proc`** (donc hors Linux)
  n'est pas couverte : `_starttime()` rend `None` en son absence, et la méta
  correspondante est alors traitée comme un verrou libre plutôt que comme un
  409 permanent — un défaut sûr, mais qui laisse la détection d'orphelin
  inopérante sur ces systèmes.

## Références

- Code : `control-center/backend/server.py` (`_ROUTES_ECRITURE`, `do_POST`,
  `_lancement`) ; `control-center/backend/jeton.py` ; `control-center/backend/verrou.py` ;
  `control-center/backend/lanceur.py` ; `control-center/backend/test_server.py`
  (test d'introspection inversé).
- Spec : `specs/features/doing/feature-007-pilotage-depuis-le-tableau-de-bord.md`.
- Supersède partiellement (condition remplie, pas de contradiction) :
  [ADR-0004](0004-centre-controle-sans-route-ecriture.md).
- Constats reportés hors périmètre : `bug-010`, `bug-011` (à créer dans
  `specs/features/todo/`).
