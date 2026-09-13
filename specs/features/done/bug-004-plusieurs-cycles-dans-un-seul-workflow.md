# Bug — deux cycles de spec menés dans la même session n'en forment qu'un seul workflow

- **Type** : bug (format minimal `specs/modele.md`)
- **Version cible** : 0.7.0
- **Créée** : 2026-09-12 (constaté par l'utilisateur en regardant le tableau de
  bord pendant le lancement du cycle `feature-006`, alors que le cycle
  `bug-001` venait d'être clos dans la même session)
- **Domaine** : centre de contrôle — `control-center/backend/events.py`,
  et l'affichage des workflows. Ni auth, ni données personnelles.
- **Spec liée** : feature-001 (la reconstruction), feature-002 (l'affichage),
  bug-002 (`SessionEnd` ne marque pas la mort de la session — même famille),
  ADR-0002 (l'hypothèse que ce bug réfute)

## Agents requis

- [x] debugger
- [ ] **security-reviewer, rôle GATE** — non coché : aucun chemin sensible.
      Le défaut porte sur la fidélité d'un récit, pas sur un accès
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

Le tableau de bord présente **un seul workflow** là où deux cycles de spec
distincts ont été menés. Les agents du second cycle apparaissent à la suite de
ceux du premier, dans la même timeline, sans séparation.

Relevé réel du 2026-09-12, obtenu en comptant les sessions du journal :

```
3 session(s) distincte(s) dans le journal

session 0a51b0a1… — 2 évts,   2026-09-12T19:09:00.553Z → 2026-09-12T19:10:12.485Z
   agents : (aucun)
session dc11d595… — 10 évts,  2026-09-12T19:10:14.528Z → 2026-09-12T19:13:22.522Z
   agents : (aucun)
session 602ebd5c… — 442 évts, 2026-09-12T19:15:52.940Z → 2026-09-12T20:50:33.943Z
   agents : orchestrator, spec-reader, architect, backend-developer,
            test-engineer, backend-developer, test-engineer, code-reviewer,
            security-reviewer, backend-developer, test-engineer,
            code-reviewer, doc-writer, orchestrator, spec-reader
```

Les **treize premiers** passages sont le cycle `bug-001`, mené de bout en bout
jusqu'à la clôture en `done/` et le commit `189ad9f`. Les **deux derniers**
sont l'ouverture du cycle `feature-006`. Le tableau de bord les affiche
ensemble.

**Scénario de reproduction** : dans une même session interactive, mener un
cycle de spec jusqu'à `done/`, puis en ouvrir un second. Ouvrir le tableau de
bord : un seul workflow, contenant les deux.

### Relevé complémentaire du 2026-09-13 — quatre cycles, un seul workflow

La session `602ebd5c` porte désormais **1563 événements et 45 passages
d'agents sur quinze heures**, affichés comme **un seul** workflow. Quatre
cycles de spec y sont fondus : `bug-001`, `feature-006`, `bug-003`, `bug-004`.

Séquence relevée (extraits) :

```
 1. 19:59:20  orchestrator      <- début bug-001
 2. 19:59:27  spec-reader
 …
13. 20:38:51  doc-writer        <- fin bug-001
14. 20:47:46  orchestrator      <- début feature-006
15. 20:47:59  spec-reader
16. 21:00:03  spec-reader       <- second passage (refus de promouvoir)
 …
33. 09:22:26  orchestrator      <- début bug-003
 …
44. 10:56:20  orchestrator      <- début bug-004
45. 10:56:34  spec-reader
```

**Ce que ce relevé établit sur les pistes de bornage :**

1. **L'invocation d'`orchestrator` marque exactement les quatre débuts de
   cycle.** Le signal est propre sur ces données.
2. **Mais c'est une convention, pas un fait du système.** `CLAUDE.md` n'impose
   l'orchestrateur qu'au-delà d'un fichier ou sur les domaines sensibles : un
   cycle de « travail direct » (correction documentaire, CSS sans impact) n'en
   aurait aucun et serait silencieusement rattaché au cycle précédent.
3. **`spec-reader` n'est pas un marqueur unique** : il apparaît deux fois dans
   le cycle `feature-006` (passages 15 et 16), la première ayant refusé la
   promotion faute de découpage.
4. **Le seul fait objectif reste le déplacement de la spec** `todo/ → doing/`,
   qui définit le cycle par construction — mais il n'apparaît dans le journal
   sous aucune forme.

Un bornage fondé sur `orchestrator` serait donc **juste sur les cycles
complets et aveugle aux autres**. C'est un arbitrage à poser explicitement, pas
un détail d'implémentation : il décide de ce que l'outil sait et de ce qu'il
ignore.

### Inventaire des signaux disponibles (relevé du 2026-09-13)

Session `602ebd5c`, 1563 événements, 65 tours, quinze heures :

| Type d'événement | Compte |
|---|---|
| `PostToolUse` | 997 |
| `SubagentStop` | 378 — dont **333 sans `agent_type`** |
| `UserPromptSubmit` | 65 |
| `Stop` | 61 |
| `SubagentStart` | 45 |
| `PostToolUseFailure` | 17 |
| `Notification` | 6 |
| `SessionStart` | **1** |
| `SessionEnd` | **0** |

**Deux faits qui corrigent des hypothèses écrites dans ce dépôt :**

1. **`SessionEnd` ne se déclenche jamais.** Le hook est pourtant branché dans
   `.claude/settings.json` (vérifié). Zéro occurrence. Conséquence directe pour
   ce bug : **ce signal est inutilisable comme frontière**, ce qui écarte aussi
   tout risque de collision avec `bug-002`.
   ⚠️ **Conséquence pour `bug-002`** : sa cause racine affirme que « `SessionEnd`
   marque la fin du tour, pas la mort de la session ». Le relevé ne le
   reproduit pas — il ne se déclenche pas du tout ici. Son bloc de symptôme
   devra être réétabli avant que ce cycle-là ne démarre.
2. **333 `SubagentStop` sur 378 ne portent aucun `agent_type`.** Le comportement
   documenté par feature-001 est confirmé et bien plus massif qu'estimé. Les 45
   restants correspondent exactement aux 45 `SubagentStart`.

**Ce qu'il reste comme signaux de bornage exploitables** : `UserPromptSubmit`
(65), `Stop` (61), et `SubagentStart` avec `agent_type` (45). Aucun ne dit
« un cycle de spec commence » — c'est une interprétation à construire, pas une
donnée à lire.

## Cause racine

`control-center/backend/events.py:101` — `reconstruire()` groupe les
événements **un workflow par `session_id`** (`workflows.setdefault(session, …)`
l. 124). C'est le dessein explicite d'ADR-0002 :

> Un workflow observable est par conséquent **une session et une suite de
> sous-agents qui partagent un `session_id`** — jamais un arbre d'appels.

L'hypothèse sous-jacente est que **session = cycle**. Elle est fausse dans
l'usage réel : une session interactive enchaîne autant de cycles que
l'utilisateur le demande, et rien dans le journal ne marque la frontière
entre deux. Les seuls signaux de bornage disponibles sont `SessionStart` et
`SessionEnd` — or `SessionEnd` marque la fin du **tour**, pas celle de la
session (voir bug-002), et il tombe donc plusieurs fois par cycle.

Ce n'est pas un défaut d'implémentation : le module fait exactement ce
qu'ADR-0002 décrit. C'est l'hypothèse d'ADR-0002 qui ne tient pas à l'usage.

Fait notable pour l'historique du projet : cette hypothèse a été **réfutée en
se servant de l'outil**, jamais en le relisant — elle a survécu à l'écriture
d'ADR-0002, à celle de feature-001 et feature-002, et à leur relecture.

## Correctif attendu

1. Délimiter un workflow par le **cycle de spec**, et non plus par la session.
   La frontière réelle est observable : une spec se déplace `todo/` → `doing/`
   → `done/`, et ce déplacement est un fait du système de fichiers **et** de
   git, que `backend/specs.py` et `backend/vcs.py` savent déjà lire.
2. `architect` tranche le moyen. Trois pistes, non exclusives :
   - **marquer** le début de cycle sur un signal déjà présent — l'invocation
     d'`orchestrator` ou de `spec-reader` ouvre un cycle dans les faits ;
   - **corréler** le journal avec les mouvements de specs (git ou disque) ;
   - **émettre** un événement de bornage explicite, au prix d'un geste de plus
     dans le workflow.
3. Une session sans cycle identifiable doit rester affichable : le récit ne
   doit pas disparaître faute de frontière trouvée. En l'absence de bornage
   fiable, retomber sur le comportement actuel — un workflow par session — et
   le **dire**, plutôt que de découper au jugé.
4. Le cas inverse reste garanti : deux sessions simultanées dans le même dépôt
   ne doivent jamais se mélanger (déjà prévu par feature-010).

## Critères d'acceptation

- [x] Dans le scénario de reproduction, les deux cycles apparaissent comme
      **deux workflows distincts** (`test_events.py`, cas E1)
- [x] Un cycle unique dans une session reste affiché comme un seul workflow —
      pas de découpage parasite (cas E2)
- [x] Deux sessions simultanées restent séparées (cas E8)
- [x] Une session dont le bornage n'est pas déterminable est affichée entière,
      avec mention explicite que la frontière n'a pas pu être établie — jamais
      découpée au jugé ni masquée (cas E3, E4 ; `bornage = session-entiere`)
- [x] Les événements de l'agent principal (segment `"type": "principal"`)
      restent rattachés au bon cycle (cas E6)
- [x] Aucun chemin sensible (auth, permissions, données personnelles) touché
- [x] Suite de tests verte, avec un test de non-régression rejouant un journal
      à deux cycles dans une session (cas E1, explicitement commenté comme tel)
- [x] Le test de non-régression a été **vu échouer sur le code d'avant le
      fix** — sinon il ne protège rien
- [x] Lint propre, pas de warning nouveau

## Conséquence documentaire

ADR-0002 est **immuable** : il ne sera pas réécrit. Son hypothèse « un
workflow est une session » ayant été réfutée à l'usage, la correction passe
par une **note additive datée** sur cet ADR, ou par un ADR neuf qui le
supersède si `architect` juge que le changement est structurant. Le silence
n'est pas une option : quiconque lira ADR-0002 seul en tirera aujourd'hui une
conclusion fausse.

## Hors périmètre

- `SessionEnd` qui ne marque pas la mort de la session — voir `bug-002`
- L'imbrication des agents (aucun ne porte l'outil `Task`) — inchangée, et
  toujours couverte par ADR-0002 sur ce point précis
- Toute modification du collecteur d'événements : ce fix porte sur la
  **reconstruction**, pas sur la collecte, sauf si `architect` retient la
  troisième piste (événement de bornage explicite)

---
# Notes d'implémentation

## Plan (architect)

- Le bornage devient un **paramètre déclaré** —
  `reconstruire(evenements, commandes_suivies=(), agents_ouvrants=())` — et
  chaque workflow **dit** par quelle règle sa frontière a été posée, ou qu'elle
  ne l'a pas été.
- **Aucun nom d'agent en dur.** `events.py` promet en tête de module de ne lire
  que le journal et de « ne connaître aucun nom d'agent ». Le patron suivi est
  celui déjà en place pour `commandes_suivies` : une liste fermée venue de la
  configuration. C'est ce qui préserve la portabilité du module vers un projet
  dont les agents portent d'autres noms.
- **Trois refus explicites**, qui sont le cœur de la correction : liste vide ⇒
  aucun découpage ; aucun marqueur rencontré ⇒ aucun découpage non plus ;
  événements antérieurs au premier marqueur ⇒ segment distinct qui **n'affirme
  rien sur son contenu**.
- **Le défaut du kit reste la liste vide** : un projet neuf garde exactement le
  comportement actuel. Le découpage est une déclaration, jamais un héritage.
- **Décision de vocabulaire, et non préférence de rédaction** : un segment ne
  s'appelle **jamais** « cycle de spec », ni dans le code ni à l'écran — le
  module ne sait pas ce qu'est une spec. C'est la différence entre « quatre
  cycles sur cinq, sans le dire » (régression déguisée en progrès) et « quatre
  segments dont la règle de découpe est affichée » (récit borné à ce qu'il
  sait).
- ADR : **ADR-0014**, superséant ADR-0002 sur le **seul** point du bornage.

## Validation security-reviewer

- **Rôle GATE** : non requis. Aucun des cinq déclencheurs. Confirmé par
  `spec-reader`, `orchestrator` et `architect`.
- ⚠️ **Il l'aurait été** si la piste de l'événement de bornage explicite avait
  été retenue : elle touche `hooks/record-event.py`, chemin de rédaction des
  secrets. L'orchestrateur avait posé ce déclencheur conditionnel à l'avance.
- **Rôle AUDIT** : non invoqué. La piste retenue ne crée aucune surface neuve —
  lecture de journal, paramètre de configuration, affichage.

## Implémentation

- **Modifiés** : `control-center/backend/events.py` (découpage, cinq champs
  ajoutés, docstring de tête corrigé), `config.py` (section `[workflows]`,
  accesseurs défensifs), `server.py`, `control-center/web/app.js`,
  `control-center.example.toml`, et les deux fichiers de CI.
- **Compatibilité ascendante** : `session_id` conservé, aucun champ supprimé ni
  renommé, troisième paramètre ajouté **en queue**. `agent.actif_sur` passe de
  `session_id` à `workflow_id` — l'interface n'en teste que la vérité.
- **Le piège traité** : `FIN_AGENT` cherche l'`agent_id` dans le segment
  courant **puis dans les segments antérieurs de la même session**. Sans ça,
  une fermeture à cheval sur une frontière gonflerait `fermetures_orphelines` —
  l'outil aurait fabriqué des anomalies **en découpant**, ce qui aurait
  discrédité tout ce qu'il signale par ailleurs.

## Tests (test-engineer)

- **139 → 171 cas** (+32), les six fichiers verts. `test_events.py` 31→54,
  `test_config.py` 17→22, `test_server.py` 30→34.
- **4 mutations, 4 tuées**, dont celle que l'architecte avait désignée comme le
  piège central : neutraliser la recherche dans les segments antérieurs fait
  passer `fermetures_orphelines` de `[0,0]` à `[0,1]`.
- **Preuve « vu échouer avant le fix »** particulièrement parlante sur
  `test_server.py` : sur l'ancien code, **un agent resté ouvert dans un vieux
  segment ressuscite comme actif** — le symptôme exact du bug, reproduit par le
  test.
- Aucun test ne dépend du journal réel, non versionné.

## Revue (code-reviewer)

- **Approved**, deux mutations rejouées par le relecteur lui-même dont celle du
  piège central.
- **Sa propre troisième mutation a survécu**, et il l'a analysée plutôt que de
  la taire : un segment antérieur ne reçoit plus jamais d'événement, donc
  l'affectation est **inerte**. Correcte mais intuable — « ne pas la compter
  comme couverte ».
- Deux points mineurs corrigés ensuite : le libellé affichait « cycle 1/2 »
  pour un segment **préfixe**, celui-là même que le backend refuse de
  qualifier ; et le commentaire du job de CI citait un compte de cas **périmé
  le jour de son écriture**.

## Faits établis par exécution pendant ce cycle

1. **Quatre cycles fondus en un** : 1563 événements, 45 passages d'agents,
   quinze heures, un seul workflow affiché.
2. **`SessionEnd` ne se déclenche jamais** — 0 occurrence, bien que branché
   dans `.claude/settings.json` (vérifié). Cela a écarté d'emblée toute piste
   de bornage fondée sur lui, et supprimé le risque de collision avec
   `bug-002`.
   ⚠️ **Conséquence pour `bug-002`** : sa cause racine affirme que « `SessionEnd`
   marque la fin du tour ». Le relevé ne le reproduit pas. Son bloc de symptôme
   devra être réétabli avant que ce cycle-là ne démarre.
3. **333 `SubagentStop` sur 378 ne portent aucun `agent_type`** — comportement
   documenté par feature-001, confirmé et bien plus massif qu'estimé. Figé par
   un test.
4. **L'invocation d'`orchestrator` marque exactement les quatre débuts de
   cycle**, mais c'est une **convention de workflow**, pas un fait du système :
   un cycle de travail direct n'en aurait aucun. C'est la limite assumée du
   bornage retenu, et elle est affichée à l'écran.

## Écarts assumés par rapport à la spec initiale

1. **Un job de CI a été ajouté**, hors du périmètre d'une spec de bug.
   Arbitrage soumis à l'utilisateur et tranché par lui. Motif : la suite du
   centre de contrôle (139 cas, 6 fichiers) n'était **exécutée par aucune
   CI** — un correctif dans `events.py` serait parti sans qu'aucune machine ne
   vérifie qu'il survit, exactement la configuration qui a produit `bug-003`.
2. **La fenêtre d'historique passe de 10 à 20 workflows**, et devient
   configurable. Dix segments couvrent typiquement une journée là où dix
   sessions couvraient des semaines.

## Une régression visuelle qui est une correction

Le tableau de bord affichera désormais **tous** les segments d'une session
comme « sans fin observée », y compris ceux manifestement terminés.

C'est laid, et c'est juste. Avant, une session close affichait une fin parce
qu'il n'y avait qu'un workflow ; maintenant qu'il y en a quatre, trois n'ont
aucune fin observée — et c'est **vrai** : rien dans le journal ne dit quand ils
se sont terminés. L'outil est passé d'une apparence correcte reposant sur une
coïncidence à une apparence médiocre reposant sur les faits.

Fabriquer une fin pour les segments antérieurs a été **explicitement interdit**
par l'architecte : ce serait inventer un fait. Le défaut appartient à
`bug-002`, qui est le cycle suivant dans l'ordre de priorité — et c'est
précisément pour cela qu'il y était placé.

## Statut final

✅ **Done — 2026-09-13.** Cycle : `orchestrator` → `spec-reader` → relevés par
l'agent principal → `architect` → `backend-developer` → `frontend-developer` et
`test-engineer` en parallèle → `code-reviewer` → corrections → `doc-writer`.

Relevés : **171/171 tests verts** sur les six fichiers · 4 mutants, 4 tués ·
`check_specs.sh` et `check_doc_links.sh` verts · dépôt réel intact, vérifié
après chaque passage.

**La suite du centre de contrôle est désormais exécutée en CI sur les deux
forges** — elle ne l'était par aucune.
