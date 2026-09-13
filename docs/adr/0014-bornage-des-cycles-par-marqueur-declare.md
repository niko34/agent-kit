# ADR-0014 — Le bornage des cycles se fait par marqueur déclaré, jamais par nom d'agent en dur

## Statut

Accepté. Supersède [ADR-0002](0002-graphe-execution-plat.md) sur le seul point
du bornage d'un workflow (« un workflow est une session »). Le reste d'ADR-0002
— graphe plat, reconstruction par tri chronologique, absence de l'outil `Task`
— reste valide et n'est pas remis en cause ici.

## Date

2026-09-13

## Contexte

ADR-0002 posait qu'« un workflow observable est une session et une suite de
sous-agents qui partagent un `session_id` ». Cette hypothèse a été **réfutée à
l'usage**, en se servant de l'outil, pas en le relisant (`bug-004`) :

- Relevé du 2026-09-12 : trois sessions distinctes dans le journal, dont une de
  442 événements contenant à elle seule le cycle `bug-001` (13 passages
  d'agent, jusqu'à sa clôture et le commit `189ad9f`) suivi des deux premiers
  passages du cycle `feature-006` — affichés comme un seul workflow.
- Relevé du 2026-09-13 : la même session porte désormais **1563 événements et
  45 passages d'agents sur quinze heures**, fondant **quatre** cycles de spec
  complets (`bug-001`, `feature-006`, `bug-003`, `bug-004`) en un seul
  workflow affiché.

**Le fait qui a fermé une piste** : `SessionEnd` — le seul signal qu'ADR-0002
aurait pu invoquer pour clore une session — **ne se déclenche jamais** en
pratique. Sur les 1563 événements du relevé, zéro occurrence, alors que le hook
est bien branché dans `.claude/settings.json`. Ce signal est inutilisable comme
frontière, dans un sens comme dans l'autre.

Inventaire complet des signaux disponibles sur ce relevé :

| Type d'événement | Compte |
|---|---|
| `PostToolUse` | 997 |
| `SubagentStop` | 378 — dont 333 sans `agent_type` |
| `UserPromptSubmit` | 65 |
| `Stop` | 61 |
| `SubagentStart` | 45 |
| `PostToolUseFailure` | 17 |
| `Notification` | 6 |
| `SessionStart` | 1 |
| `SessionEnd` | 0 |

Le seul fait objectif marquant une frontière de cycle est le déplacement d'une
spec `todo/ → doing/`, mais il n'apparaît sous aucune forme dans le journal
d'événements — voir Alternatives écartées.

## Décision

Le bornage d'un workflow en segments (cycles) est un **paramètre déclaré par le
projet**, jamais un nom d'agent en dur dans `events.py` :

```toml
[workflows]
agents_ouvrants = ["orchestrator"]
```

`control-center/backend/events.py` promet en tête de module de « ne connaître
aucun nom d'agent » — la même promesse qui vaut déjà pour les commandes de
projet (`commandes_suivies`, ADR-0005). `reconstruire(evenements,
commandes_suivies=(), agents_ouvrants=())` applique la même discipline : la
liste vient de la configuration, le module se contente de la faire respecter.

Un `SubagentStart` dont l'`agent_type` figure dans `agents_ouvrants` ouvre un
nouveau segment (sauf s'il est le tout premier événement de la session, auquel
cas il commence directement le segment 0). Chaque segment porte `workflow_id`
(`"<session_id>#<indice>"`), `bornage`, `borne_par`, `indice_cycle` et
`cycles_dans_la_session`. `session_id` reste présent et inchangé sur chaque
segment ; aucun champ n'est supprimé.

### Les trois refus explicites

C'est le cœur de la décision : le module refuse de découper au jugé, dans
trois cas précis, et le dit à l'écran plutôt que de deviner :

1. **`agents_ouvrants` vide** (défaut) ⇒ aucun découpage. `bornage` =
   `session-entiere` — le comportement d'avant ce correctif, désormais déclaré
   comme tel plutôt que subi.
2. **Aucun agent de la liste rencontré** dans une session ⇒ même verdict, même
   valeur. Une liste déclarée mais jamais observée ne produit pas un
   découpage partiel ou supposé.
3. **Événements antérieurs au premier marqueur rencontré** ⇒ ils ne sont pas
   absorbés dans le premier cycle. Ils forment un workflow à part, `bornage`
   = `avant-premier-marqueur`, qui **n'affirme rien sur son contenu** — ce
   pourrait être un cycle de travail direct, un reste d'une session
   précédente mal fermée, ou autre chose : le module ne tranche pas.

### Point de vocabulaire — une décision, pas une préférence de rédaction

Un segment ne s'appelle **jamais** « cycle de spec », ni dans le code ni à
l'écran. Le module ne sait pas ce qu'est une spec : il ne lit ni `specs.py` ni
`vcs.py`, il ne connaît qu'un `agent_type` qu'on lui a désigné. Dire « cycle de
spec » affirmerait une correspondance que le module n'a pas les moyens de
vérifier.

C'est la différence entre deux récits que ce module pourrait raconter :

- « quatre cycles sur cinq, sans le dire » — une régression déguisée en
  amélioration, où l'écran affirme plus que ce qu'il sait ;
- « quatre segments, et la règle qui les a découpés est affichée » — un récit
  borné à ce qu'il sait, qui montre sa propre limite plutôt que de la cacher.

Le second est ce que ce correctif livre. Le premier est précisément ce
qu'ADR-0002 avait, sans le vouloir, laissé s'installer.

## Alternatives considérées

- **Corréler le journal avec les mouvements de specs** (`backend/specs.py`,
  `backend/vcs.py`) : c'est le seul fait *objectif* de frontière de cycle
  (`todo/ → doing/`). Écarté parce que :
  - cela romprait la promesse de tête de module — `events.py` ne connaîtrait
    plus aucun nom d'agent, mais connaîtrait la structure des specs ;
  - cela ferait dépendre les tests d'`events.py` d'un dépôt git réel (`vcs.py`
    lit l'historique git), alourdissant un module qui n'a aujourd'hui aucune
    dépendance d'exécution ;
  - le journal d'événements ne porte **aucun horodatage de promotion** de
    spec : la corrélation demanderait de croiser deux sources temporelles
    distinctes, sans garantie qu'elles s'alignent.

- **Émettre un événement de bornage explicite** (un geste volontaire — par
  exemple dans `hooks/record-event.py` — qui écrit « ici commence un cycle »)
  : le signal serait alors un **fait** du journal, et non une convention
  reconstruite après coup. Écarté pour cette itération parce que :
  - cela touche `hooks/record-event.py`, le **chemin de rédaction des
    secrets** — toute modification y déclenche `security-reviewer` en rôle
    GATE, hors du périmètre déclaré de `bug-004` (« ni auth, ni données
    personnelles ») ;
  - un oubli du geste rend l'outil muet sur la frontière, sans le dire aussi
    clairement qu'un `agents_ouvrants` vide le dit aujourd'hui.

  Cette option reste la **piste de repli** si le marqueur par agent s'avère
  trop lâche à l'usage (par exemple si plusieurs conventions de projet
  invoquent l'agent ouvrant sans ouvrir de cycle). Elle n'est pas fermée, elle
  est consignée pour ne pas être redécouverte à zéro.

## Conséquences

### Positives

- Le bornage suit exactement le patron déjà accepté pour les commandes de
  projet (`commandes_suivies`, ADR-0005) : une liste fermée fournie par la
  configuration, jamais un nom en dur dans le module.
- Les trois refus sont testés explicitement (`test_events.py`, cas E1 à E13) et
  documentés en commentaire à l'endroit où ils sont tranchés dans le code.
- Une régression réelle (quatre cycles fondus en un) devient un fait visible
  et nommé (`cycles_dans_la_session`, `bornage`) plutôt qu'un défaut silencieux.

### Négatives

- **Le bornage est aveugle aux cycles de travail direct.** Un fix isolé mené
  sans passer par `orchestrator` (ou l'agent déclaré comme ouvrant) reste
  rattaché au segment précédent. C'est dit à l'écran (`bornage` =
  `session-entiere` ou absorption dans le segment courant), jamais caché.
- **La fenêtre d'historique affichée se raccourcit.** Dix segments couvrent
  moins de travail que dix sessions entières. Conséquence directe : le nombre
  de workflows envoyés au tableau de bord passe de 10 (constante en dur) à
  `workflows_affiches`, configurable, par défaut 20.
- **`fin` n'étant jamais renseigné** (`SessionEnd` ne se déclenche jamais, voir
  Contexte), **tous les segments d'une session afficheront « sans fin
  observée »**, y compris ceux manifestement clos depuis longtemps par la
  fermeture de leur dernier passage d'agent. C'est laid, et c'est **voulu** :
  fabriquer une fin à partir d'une absence de signal inventerait un fait que
  le journal ne contient pas. Ce défaut n'est pas corrigé ici — il appartient
  à `bug-002`.

### Ce que ça verrouille

- `events.py` reste sans dépendance au disque ou à git : toute future
  proposition de bornage qui romprait cette contrainte redevient une décision
  d'ADR, pas un ajustement local.
- Le vocabulaire « segment »/« bornage » (jamais « cycle de spec ») s'applique
  à toute évolution future de ce module et de son affichage (`web/app.js`).
- La piste de repli (événement de bornage explicite) reste ouverte, mais son
  adoption impose de facto le passage par `security-reviewer` en rôle GATE.

## Références

- Code : `control-center/backend/events.py` (fonction `reconstruire`,
  constantes `BORNAGE_SESSION`, `BORNAGE_MARQUEUR`, `BORNAGE_PREFIXE`),
  `control-center/backend/config.py` (`Config.agents_ouvrants`,
  `Config.workflows_affiches`), `control-center/backend/server.py`
  (restriction des agents actifs au dernier segment de chaque session),
  `control-center/web/app.js` (affichage du bornage).
- Tests : `control-center/backend/test_events.py`, cas E1 à E13.
- Configuration : `control-center/control-center.example.toml`, bloc
  `[workflows]`.
- Spec : `specs/features/doing/bug-004-plusieurs-cycles-dans-un-seul-workflow.md`.
- ADR superseded (sur ce point précis) : [ADR-0002](0002-graphe-execution-plat.md).
