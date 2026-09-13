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

- [ ] Dans le scénario de reproduction, les deux cycles apparaissent comme
      **deux workflows distincts**
- [ ] Un cycle unique dans une session reste affiché comme un seul workflow —
      pas de découpage parasite
- [ ] Deux sessions simultanées restent séparées
- [ ] Une session dont le bornage n'est pas déterminable est affichée entière,
      avec mention explicite que la frontière n'a pas pu être établie — jamais
      découpée au jugé ni masquée
- [ ] Les événements de l'agent principal (segment `"type": "principal"`)
      restent rattachés au bon cycle
- [ ] Aucun chemin sensible (auth, permissions, données personnelles) touché
- [ ] Suite de tests verte, avec un test de non-régression rejouant un journal
      à deux cycles dans une session
- [ ] Le test de non-régression a été **vu échouer sur le code d'avant le
      fix** — sinon il ne protège rien
- [ ] Lint propre, pas de warning nouveau

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
