# Bug — le serveur s'ouvre au réseau sans jeton, et livre toute l'activité du développeur en lecture libre

- **Type** : bug (format minimal `specs/modele.md`)
- **Version cible** : 0.8.0
- **Créée** : 2026-09-14 — mesuré en usage réel pendant la mise en service de
  `feature-007`, sur l'installation de l'utilisateur (serveur en conteneur,
  navigateur sur un autre poste)
- **Domaine** : centre de contrôle — `control-center/backend/server.py`.
  **Touche l'authentification et l'exposition de données** → `security-reviewer`
  **rôle GATE obligatoire, P1 sur le design puis P2 sur le diff**
- **Spec liée** : **ADR-0020** (le modèle de déploiement, qui fonde ce
  correctif), ADR-0019 (le jeton comme unique barrière), `bug-010` (freinage
  global et lecture non bornée — périmètre voisin, à ne pas absorber)

## Agents requis

- [x] spec-reader
- [x] architect
- [x] **security-reviewer, rôle GATE — P1 AVANT tout code, puis P2 sur le diff**
- [ ] ux-ui-designer — non : aucune surface neuve, au plus un message
- [x] backend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

**Relevé par exécution le 2026-09-14**, serveur lancé avec `hote = "0.0.0.0"` et
**aucun `fichier_jeton`** déclaré :

```
$ curl -o /dev/null -w "%{http_code}" http://127.0.0.1:8788/api/etat
200

$ curl -s http://127.0.0.1:8788/api/etat | jq 'keys'
agents, colonnes, commandes_declarees, config_lue, divergences,
ecriture_active, ecriture_raison, evenements, garde_fous, git,
horodatage, projet, specs, workflows
```

Quatorze champs : les specs du projet, les workflows observés, l'état du dépôt
git, les agents, le journal d'événements. **L'activité de développement
entière**, lisible par n'importe qui sur le réseau local, sans aucun secret.

Le serveur ne l'ignore pas — il **avertit** au démarrage (`server.py:886`) :

```
⚠️  ouvert au réseau local. L'écriture reste désactivée : aucune
    route ne peut lancer de commande tant qu'aucun jeton valide
    n'est déclaré (`[serveur].fichier_jeton`).
```

Mais il **démarre quand même**, et l'avertissement ne parle que de l'écriture.

## Cause racine

Le jeton a été conçu par `feature-007` comme une garde **d'écriture** : il
protège `POST /api/lancer`, `POST /api/interrompre` et `GET /api/lancement`. La
lecture n'a jamais été dans son périmètre, parce que le modèle de déploiement
n'était **écrit nulle part** — c'est le constat qui a produit **ADR-0020**.

Sous ce modèle désormais écrit, la règle change de forme : le jeton n'est plus
lié au **type de route** (lecture / écriture) mais au **déploiement** —

- sur `127.0.0.1`, il est **inutile** : qui atteint le port a déjà un shell sur
  la machine ;
- au-delà, il est **obligatoire, lecture comprise** : c'est lui qui rattache
  « qui frappe à la porte » à « celui à qui ce serveur appartient ».

## Correctif attendu

`architect` tranche entre deux issues et **écrit son choix** :

1. **Refus de démarrer** sur une adresse non locale sans jeton valide, avec un
   message qui nomme la cause et la sortie (déclarer un `fichier_jeton`, ou
   revenir à `127.0.0.1`).
2. **Démarrage autorisé, toutes routes protégées** : sans jeton valide sur une
   adresse non locale, chaque requête est refusée — y compris la page elle-même.

⚠️ **Ce qui est exclu dans les deux cas** : le comportement actuel, où le serveur
s'ouvre au réseau et livre l'activité du développeur sans un mot au-delà d'un
avertissement sur la seule écriture.

⚠️ **Ne pas dégrader le cas local.** Sur `127.0.0.1`, le jeton doit devenir
**facultatif** (ADR-0020) : exiger un secret là où il ne protège de rien ajoute
une friction et apprend à contourner les gardes. C'est un **changement de
comportement** par rapport à `feature-007`, pas une régression.

⚠️ **Ne pas absorber `bug-010`** (freinage global et non par IP, lecture non
bornée). Périmètre voisin, défaut distinct.

## Critères d'acceptation

- [x] Sur `127.0.0.1` **sans jeton** : lecture ET écriture fonctionnent, aucun
      secret exigé
- [x] Sur une adresse **non locale sans jeton** : le comportement tranché par
      `architect` s'applique, et **aucun champ d'activité n'est lisible**
- [x] Sur une adresse **non locale avec jeton valide** : lecture et écriture
      fonctionnent comme aujourd'hui
- [x] Le message dit **pourquoi** et **comment sortir** de la situation
- [x] `localhost` et `::1` sont traités comme `127.0.0.1` — la boucle locale ne
      s'écrit pas d'une seule façon
- [x] La détection ne repose pas sur la seule valeur déclarée dans la
      configuration si le serveur peut être joint autrement (ex. `0.0.0.0` lie
      aussi la boucle locale) — **établi par exécution** (`_locale()` teste
      `client_address[0]`, cas `T*` de `test_server_bug012.py`)
- [x] Aucune régression des gardes de `feature-007` : les quatre mutations
      livrées (`> 0o600`, `start()` dans `__init__`, garde jeton après lecture du
      corps, retrait du `finally`) **tuent toujours**
- [x] Suite verte, **compte de cas strictement supérieur** au compte d'entrée
      (451 cas sur 13 suites, contre 371 sur 11 en entrée de cycle)
- [x] Verdicts `security-reviewer` **P1 puis P2**, GO (GO sous conditions aux
      deux passages ; la condition P2 restante — ADR-0020 en tête du README et
      du `.example.toml` — traitée par ce tour de `doc-writer`)
- [x] `control-center/README.md` et `control-center.example.toml` énoncent le
      modèle d'**ADR-0020** en tête, pas en note

## Notes pour agent

- **Ce bug ne vient pas d'une erreur de code mais d'une prémisse absente.** Le
  code fait exactement ce que `feature-007` demandait ; c'est la spec qui
  raisonnait sous un modèle jamais écrit. Lire **ADR-0020 en premier**.
- Le `security-reviewer` avait relevé en P2 que `/api/etat` anonyme livrait
  `commandes_declarees`, `garde_fous` et `pid_fils`, et l'avait classé
  « acceptable », en le rattachant à `bug-010`. Sous ADR-0020, ce classement
  n'est plus tenable : ce n'est pas un défaut de bornage, c'est une exposition.
- Le cas d'usage réel de l'utilisateur — serveur en conteneur, navigateur sur un
  autre poste — **doit continuer de fonctionner** avec un jeton. Ce n'est pas un
  cas limite à refuser, c'est le déploiement que l'ADR légitime.

## Hors périmètre

- Le freinage des 401, global et non par IP — `bug-010`
- La reprise d'un orphelin — `bug-011`
- Le pilotage réel des coûts (`budget_max_usd` transmis mais jamais mesuré ni
  cumulé) — spec à ouvrir
- `int(Content-Length)` et `int(depuis)` tolérants (`+12`, ` 12 `, `1_2`) — spec
  à ouvrir

---

## Statut final

✅ **Done — 2026-09-14.** Cycle fondé sur **ADR-0020**, écrit *avant* lui : ce bug
ne venait pas d'une erreur de code mais d'une **prémisse absente**.

**Cycle réel** : `ADR-0020` → `spec-reader` → `architect` → **GATE P1** *(GO sous
conditions, 6)* → `backend` ∥ `ux-ui-designer` → `test-engineer` → `frontend` →
**GATE P2** *(GO sous conditions)* ∥ `code-reviewer` *(Request changes, 5)* →
`backend` → `frontend` → `doc-writer` → `code-reviewer` *(Request changes, 4)* →
`backend` → `code-reviewer` **[Approved]** → clôture.

**Comptes** : **395 → 471 cas** sur **13** suites (12 à l'entrée). Les 395 de
départ comptaient **5 échecs**. Suite du kit : 100, inchangée.

### Ce que le cycle a fermé

Un serveur en `0.0.0.0` **sans jeton** livrait `GET /api/etat` en 200 avec
quatorze champs — specs, workflows, état git, agents, événements. L'activité de
développement entière, lisible sans secret par quiconque sur le réseau.

### Sept défauts trouvés APRÈS le plan

| # | Défaut | Trouvé par |
|---|---|---|
| 1 | `Origin: null` traversait ; `Host` ne protège pas du CSRF | GATE P1 |
| 2 | `Content-Type: text/plain` traversait **toutes** les gardes — la « requête simple » sans préflight était le vrai vecteur | GATE P1 |
| 3 | Le frein aurait **banni le développeur de son propre tableau de bord** : `EventSource` se reconnecte seul et ne porte aucun en-tête | GATE P1 |
| 4 | Les suites lisaient le `control-center.toml` **local** : rouges chez qui configure un jeton, vertes en CI où le fichier est gitignoré | agent principal |
| 5 | `POST /api/lancer` → 202 puis `GET /api/lancement` → **403 indéfiniment** : lancer sans jamais voir la sortie | revue |
| 6 | `ecriture_active` valait `jeton.actif()` : l'écriture locale marchait, l'interface affichait « lecture seule », le bouton n'existait pas | revue |
| 7 | **`fail-open`** : un jeton **déclaré mais invalide** ouvrait tout (200 + 202) là où il bloquait (403) avant ce cycle | revue |

Le **7** est le plus grave, et il vient d'une **ambiguïté de cet ADR** :
« configuré » a été lu comme **valide** au lieu de **déclaré**. `ADR-0020` porte
désormais la précision et le motif.

### Quatre tests gardaient l'ancien modèle

Écrits quand `ecriture_active = jeton.actif()` était juste, ils en sont devenus
les gardiens. L'un affirmait `ecriture_active is False` **trois lignes avant** un
POST qui rendait 202 : un test qui ne rate pas un défaut mais le **protège**.

### Le harnais rapporté sans être livré

`frontend-developer` a rapporté « 39 assertions, 0 échec » sur un harnais
headless exécuté dans un environnement jetable — **absent de l'arbre**. Il y est
maintenant (`web/test_app_bug012.js` + un pont `test_app_bug012.py` que la
découverte CI ramasse, qui se saute proprement sans `node`), et il tue une
mutation choisie par la **revue**, pas par son auteur.

> Règle qui en découle : **ce qui n'est pas dans l'arbre n'a pas été fait**,
> quelle que soit la qualité du rapport.

### Décisions de conception

- **Décision par requête** sur l'adresse source, jamais sur `[serveur].hote` :
  `0.0.0.0` sert les deux catégories sur le même socket.
- **`jeton_requis`**, champ distinct : « ce déploiement exige-t-il un jeton ? »,
  indépendamment du fait que la requête en porte un. Sans lui, un rechargement
  de page figeait le tableau de bord — `modeAuth` confondait *« suis-je
  autorisé »* et *« le flux peut-il s'authentifier »*.
- **Une modale**, contrairement à `feature-007` qui les avait écartées. Jugée
  cohérente par la revue : la confirmation de lancement est *inline*, la porte
  est la seule surface rendue tant qu'aucun 200 n'est revenu.
- **Rien n'est rendu avant un 200** : sinon l'interface affiche « aucune spec »,
  « aucun agent » — faux, puisque personne n'a regardé.

### Reste ouvert, déclaré

- **`ecriture_active` est désormais constant** (`true`) sur tout `/api/etat`
  servi : lecture et écriture partagent la garde. Les branches
  `if (!etat.ecriture_active)` d'`app.js` sont mortes, mais **échouent du côté
  sûr**. Changement de contrat → **spec de suivi**, pas ce cycle.
- Plus d'assertion **de bout en bout** que le corps servi ne porte pas le chemin
  du jeton : la garde est testée en **unité** (`_raison_publique`), le cas
  n'étant plus atteignable par HTTP.
- `config.fichier_jeton()` ramène `""` et un type invalide (`= 42`) à « non
  déclaré » → régime local ouvert ; seule la bannière le signale. À distance, le
  comportement reste **fermé**.
- `do_POST` : 111 lignes, authentification en ligne, là où la lecture a
  `_autorisation_lecture` nommée et testable.
- **`bug-010`** voit son périmètre **élargi** (note additive datée) : 20 jetons
  faux distants déclenchent un 429 qui prive **tout le monde** 60 s, y compris le
  développeur local muni d'un jeton valide, lecture comprise.

### Non vérifié, déclaré comme tel

Rendu visuel de la modale et comportement d'un **vrai `EventSource`** de
navigateur face à un 401 : **aucun agent n'a de navigateur**. Seul le
comportement du code JS a pu être observé, via un DOM simulé.

⚠️ **Le plan de test manuel n'a pas été joué** — il exige un humain devant un
navigateur.
