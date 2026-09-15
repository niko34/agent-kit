# ADR-0021 — Un état de passage additif (`sans_cloture`), gouverné par un seuil déclaré en configuration

## Statut

Accepté

## Date

2026-09-15

## Contexte

Le modèle de passage d'agent du centre de contrôle n'avait que deux états —
**ouvert** ou **fermé** — dérivés d'un seul fait : la présence ou l'absence
d'un `SubagentStop` apparié. C'est insuffisant : un agent peut disparaître
**sans clôture**, pour des raisons hors de son contrôle (limite de session
atteinte, processus tué, machine arrêtée), et `SubagentStop` n'est alors
**jamais** écrit.

**Relevé par l'utilisateur, en usage réel, pas par un test ni un audit**
(`bug-013`) : un `test-engineer` tué par le runtime le 2026-09-13T19:11:54Z
restait affiché « en cours » **22 heures plus tard**. Le tableau de bord ne
mentait pas — il rapportait fidèlement le dernier fait connu — mais le modèle
à deux états ne lui laissait qu'une seule case pour « mort sans clôture », et
c'était la mauvaise : « en cours ».

Ce défaut a été **absorbé dans le cycle `feature-010`**, au titre d'
[ADR-0017](0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md) :
`feature-010` s'engage, dans ses propres cas limites, sur « le récit ne doit
pas afficher un passage ouvert pour toujours » (session interrompue en plein
cycle). `bug-013` est exactement le défaut qui rend cette garantie
inatteignable — pas un constat annexe découvert en cours de route.

Deux contraintes fortes, écrites dans la spec `bug-013`, ont gouverné la
conception :

- **Ne jamais fermer un agent réellement vivant** — le risque symétrique, et
  le pire des deux : un cycle long affiché comme abandonné pousserait à le
  relancer, donc à dupliquer un travail en cours.
- **Ne jamais déduire la mort de la seule absence de `SubagentStop`** :
  l'appariement `SubagentStart`/`SubagentStop` est déjà fragile en production
  — 1237 `SubagentStop` sur 1359 arrivent sans `agent_type`, relevé du
  2026-09-14.

## Décision

### 1. Un troisième état, additif

```
etat ∈ {termine, en_cours, sans_cloture}
```

`ETAT_TERMINE` si le segment a une fermeture observée. Sinon `ETAT_EN_COURS`,
sauf si son inactivité dépasse le seuil déclaré (voir §2), auquel cas
`ETAT_SANS_CLOTURE` (`control-center/backend/events.py`, `_etat_segment`).
`ETAT_SANS_CLOTURE` n'est ni un succès ni un échec du travail : une **fin
sans annonce**, à ne confondre ni avec « terminé » (verdict positif) ni avec
un échec (faute que l'agent n'a pas commise).

**Additif** : le champ booléen `segment["termine"]` garde son sens d'avant ce
correctif, inchangé ; `etat` est un champ **de plus**, jamais un remplacement.
Tout appelant qui ne lit pas `etat` continue de fonctionner à l'identique.

La borne porte sur `derniere_activite`, rafraîchie à **tout** événement
rattaché au segment (pas seulement un échec, un fichier ou une commande —
c'était un défaut trouvé pendant ce même cycle : un `PostToolUse` nu ne
comptait pas, alors qu'il représente 3806 événements sur 5926 relevés
réels), jamais sur l'absence d'un `SubagentStop` précis — ce qui respecte la
seconde contrainte du Contexte.

Le comptage des agents actifs (`control-center/backend/server.py`) teste
désormais `etat == ETAT_EN_COURS`, jamais `not passage["termine"]` seul :
sans ce changement, un passage requalifié `sans_cloture` resterait compté
actif, contredisant ce que l'écran vient pourtant d'afficher.

### 2. Le seuil est déclaré, jamais codé en dur — et sa valeur vient du silence légitime, pas de la durée

`[workflows] seuil_abandon_minutes`, défaut **120**, borné `[60, 10080]`
(1 heure à 1 semaine) — `control-center/backend/config.py`,
`Config.seuil_abandon_minutes()`.

**Le seuil ne vient pas de la durée maximale d'un passage** (24 minutes
mesurées sur ce dépôt, 36 retenues comme borne haute de test) **mais du
silence légitime à l'intérieur d'un passage vivant** : un `architect` a émis
un seul appel d'outil en 127 secondes — un agent qui lit, cherche et
raisonne sans écrire peut rester silencieux longtemps, sans rapport avec la
durée totale du cycle auquel il appartient. Fonder le seuil sur la durée
maximale observée aurait sous-estimé ce silence tolérable et produit des
faux positifs sur des agents vivants.

L'asymétrie des coûts tranche le sens de l'erreur à tolérer : **accuser à
tort un agent vivant coûte plus cher qu'afficher trop longtemps un agent
mort**. Le premier pousse à relancer un travail déjà en cours — une
duplication. Le second n'est qu'un affichage en retard sur la réalité,
comme il l'a toujours été le temps qu'un humain le remarque.

**Garde `math.isfinite`, avant toute comparaison de borne.** Toute
comparaison avec `nan` est fausse — y compris le contrôle `< 60` / `> 10080`
qui est censé le rejeter. Un `seuil_abandon_minutes = nan` traverserait donc
les deux bornes et désarmerait silencieusement la requalification dans
`events.py` (`minutes > seuil` ne se déclenche plus jamais). Prouvé par
exécution, sur le même jeu d'événements :

| Configuration | `sans_cloture` | `en_cours` |
|---|---|---|
| `seuil = nan`, sans garde | 0 | 3 |
| `seuil = nan`, avec garde (retombe sur 120) | 1 | 2 |

Même discipline, déjà appliquée à `workflows_affiches()` (type et bornes) et
`budget_max_usd()` (`math.isfinite` contre `nan`/`inf`) : une valeur
aberrante ne doit jamais faire planter la reconstruction ni désarmer une
garde en silence — elle retombe sur le défaut.

## Alternatives considérées

- **Déduire l'abandon de la seule absence de `SubagentStop`.** Écartée :
  fabriquer une fin à partir d'une absence de signal inventerait un fait que
  le journal ne contient pas, et l'appariement est déjà fragile — 1237 `Stop`
  sur 1359 arrivent sans `agent_type`. C'est explicitement la contrainte
  posée par la spec `bug-013`, reprise en §1.
- **Seuil fondé sur la durée maximale mesurée** (24-36 minutes) plutôt que
  sur le silence légitime. Écartée : un silence de 127 secondes a été observé
  à l'intérieur d'un passage par ailleurs normal — un seuil calé sur la durée
  totale d'un cycle n'aurait aucun rapport avec ce que ce silence représente,
  et risquerait de requalifier des agents vivants.
- **Seuil codé en dur dans `events.py`.** Écartée, même discipline que
  `agents_ouvrants` ([ADR-0014](0014-bornage-des-cycles-par-marqueur-declare.md)) :
  une borne de sûreté qui dépend de l'usage réel d'un projet est un paramètre
  de déploiement, pas une constante du module qui la applique.

## Conséquences

### Positives

- Un agent mort cesse d'être affiché comme actif indéfiniment ; les
  compteurs d'agents actifs ne le comptent plus.
- Le contrat existant (`segment["termine"]`, booléen) n'est pas cassé : `etat`
  est additif, tout consommateur qui l'ignore continue de fonctionner.
- La garde `math.isfinite` referme, pour la troisième fois dans ce module,
  la même classe de défaut (`workflows_affiches`, `budget_max_usd`) —
  reconduire une discipline connue plutôt qu'inventer une quatrième façon
  d'échouer silencieusement à une borne.
- Vérifié par un scénario réellement joué (`feature-010`), pas seulement par
  des cas de test écrits a priori : le rebouclage d'un cycle réel a été
  observé et affiché à l'écran pour la première fois depuis la création du
  module de reconstruction.

### Négatives

- Un agent réellement vivant mais silencieux plus de 120 minutes serait mal
  classé `sans_cloture`. Accepté : c'est le sens d'erreur jugé le moins
  coûteux (voir §2), avec une marge volontairement large.
- `derniere_activite` doit désormais être tenue à jour à **chaque** événement
  rattaché, pas seulement échec/fichier/commande — un oubli de ce point sur
  un futur type d'événement réintroduirait un faux positif silencieux (déjà
  rencontré une fois pendant ce même cycle, sur `PostToolUse`).
- La garde dépend d'une horloge **injectée** (`maintenant`) : sans elle,
  `_etat_segment` reste inerte par construction. Un appelant qui oublie de la
  fournir perd la garde silencieusement plutôt que bruyamment — assumé, pour
  garder `reconstruire()` pure et testable sans mock du temps.

### Ce que ça verrouille

- Le vocabulaire `etat ∈ {termine, en_cours, sans_cloture}` s'impose à toute
  évolution future du rendu (`control-center/web/app.js`) et de la
  reconstruction (`events.py`) : un état futur devra être additif de la même
  façon, jamais une redéfinition des trois valeurs existantes.
- `[workflows] seuil_abandon_minutes` rejoint `agents_ouvrants`
  ([ADR-0014](0014-bornage-des-cycles-par-marqueur-declare.md)) et
  `workflows_affiches` comme paramètre de déploiement documenté : toute
  future borne de sûreté de ce module suit le même patron (déclarée, bornée,
  gardée par `math.isfinite`).
- `reconstruire()` reste pure : l'horloge est un paramètre (`maintenant`),
  jamais lue en interne (`time.time()`) — verrouille la testabilité
  déterministe de toute future garde temporelle du module.

## Références

- Code : `control-center/backend/events.py` (`_etat_segment`, constantes
  `ETAT_TERMINE`/`ETAT_EN_COURS`/`ETAT_SANS_CLOTURE`, fonction
  `reconstruire`), `control-center/backend/config.py`
  (`Config.seuil_abandon_minutes`), `control-center/backend/server.py`
  (comptage des agents actifs sur `etat == ETAT_EN_COURS`),
  `control-center/web/app.js` (classe `.sans-cloture`, rendu gris pointillé).
- Tests : `control-center/backend/test_events.py` (cas B1-B8, dont le cas
  réel `test-engineer afa8010143f2` et la garde `maintenant=None`) ;
  `control-center/backend/test_config.py` (`seuil_abandon_*`, dont la garde
  `nan`).
- Configuration : `control-center/control-center.example.toml`, bloc
  `[workflows]`.
- Specs : `specs/features/doing/bug-013-agent-tue-reste-en-cours-pour-toujours.md`,
  `specs/features/doing/feature-010-scenario-de-bout-en-bout-avec-echec.md`
  (cycle conjoint, une seule phase test/revue/doc).
- ADR : [ADR-0017](0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md)
  (justifie l'absorption de `bug-013` dans le cycle `feature-010`),
  [ADR-0014](0014-bornage-des-cycles-par-marqueur-declare.md) (bornage des
  cycles en segments, dont cet état affine le rendu).
