# ADR-0034 — Ce que le dépôt garde des références de conception, et à quel coût d'historique

## Statut

Accepté

## Date

2026-09-20

## Contexte

L'utilisateur a fourni un livrable complet de conception pour le centre de contrôle :
un document de décisions (`docs/design-references/control-center-design-decisions.md`),
un prototype HTML interactif, et douze captures PNG illustrant les étapes
successives de l'exploration (formulaire d'ajout, vue accessible, side sheet
rejetée, etc.), le tout initialement livré sous forme d'archive
(`centre-controle-claude-livrable.zip`).

Deux questions se posent avant tout commit : que **verser** dans le dépôt git parmi
ces artefacts, et où le prototype doit-il **vivre** pour que les gardes de
conformité automatiques (F1-F5 de `feature-021`) puissent réellement le lire.

## Décision

### 1. Le prototype HTML est la référence normative, versionné

`control-center/maquettes/2026-09-20-maquette-materiel-3.html` (copie de
`docs/design-references/control-center-animated-prototype.html`) est la référence
normative des jetons de couleur, de la structure DOM, des classes d'état et des
durées d'animation. C'est du **code** : sa conformité avec l'implémentation se
**mesure** (comparaison automatique), au lieu de se juger à l'œil sur une capture
d'écran. Les deux copies sont versionnées.

### 2. Les 12 PNG sont des illustrations, non versionnées

Les douze captures PNG citées par le document de décisions documentent la
**succession** des décisions (ce qui a été essayé, retenu, puis remplacé) mais
n'ajoutent aucune information vérifiable au-delà de ce que le prototype HTML porte
déjà. Une fois le HTML reconnu comme référence, les conserver dans l'historique git
n'aurait plus d'autre effet que de gonfler ce dernier : **18 Mo** d'images retirés
avant tout commit, n'entrant jamais dans l'historique. **144 Ko** de références plus
légères sont conservés (le document de décisions et le prototype lui-même).
L'archive d'origine (`centre-controle-claude-livrable.zip`) reste la source si l'une
de ces images devait être consultée plus tard — elle n'est pas détruite, seulement
non versionnée.

### 3. Le prototype est dupliqué sous `control-center/maquettes/`

`control-center/maquettes/` (pas `docs/design-references/`) est l'emplacement que
lisent les gardes de conformité automatiques. Raison mesurée : le clone jetable
utilisé pour tester le module (`control-center/PIEGES.md` §32) ne copie **pas**
`docs/` — un test de conformité qui lirait le prototype depuis `docs/design-references/`
s'exécuterait dans ce clone sur un fichier absent, et **se saperait en silence**.

Ce défaut de classe a déjà été mesuré une fois sur ce projet : un compte de cas
attendu à 200 est retombé à **199** parce qu'un cas dépendait d'un chemin non copié
dans le clone jetable — l'écart d'un seul cas, silencieux, jusqu'à investigation
(`PIEGES.md` §32). Dupliquer le prototype sous `control-center/maquettes/`, qui est
copié par construction avec le reste du module testé, ferme ce chemin d'erreur pour
la garde de conformité de `feature-021` avant qu'elle n'existe.

## Alternatives considérées

- **Verser les 12 PNG dans le dépôt**, par exhaustivité de la trace de décision.
  Écartée : 18 Mo pour des illustrations strictement redondantes avec un prototype
  HTML normatif et déjà versionné plus légèrement (144 Ko) — le coût d'historique
  n'a pas de contrepartie d'information une fois le HTML reconnu comme référence.
- **Ne garder qu'un lien vers l'archive d'origine**, sans dupliquer le prototype
  dans le dépôt. Écartée : un lien vers une archive externe n'est vérifiable par
  aucune garde automatique, et disparaît si l'archive n'est plus accessible —
  contraire au principe que la conformité doit se mesurer depuis le dépôt lui-même.
- **Faire lire les gardes de conformité directement depuis `docs/design-references/`**,
  sans dupliquer sous `control-center/maquettes/`. Écartée et **mesurée
  dangereuse** : c'est exactement le chemin qui s'est déjà sapé en silence une fois
  (`PIEGES.md` §32, 199 cas sur 200) — une garde qui lirait ce chemin dans le clone
  jetable ne verrait jamais l'échec qu'elle est censée détecter, elle serait
  simplement absente de son propre rapport.

## Conséquences

### Positives

- L'historique git ne porte jamais les 18 Mo d'illustrations : tout clone futur du
  dépôt reste léger, sans que l'information de conception soit perdue (elle reste
  dans l'archive d'origine et dans le document de décisions versionné).
- La conformité au design se vérifie automatiquement, sur un artefact accessible
  dans tous les contextes de test (dépôt principal et clone jetable).
- Un piège déjà coûteux une fois (`PIEGES.md` §32) est neutralisé pour ce cycle
  avant même que la garde qui l'aurait révélé ne soit écrite.

### Négatives

- **Deux copies** du même prototype existent dans le dépôt (`docs/design-references/`
  et `control-center/maquettes/`) : elles doivent rester identiques, et rien ne
  l'impose automatiquement en dehors de la discipline de ne jamais éditer l'une sans
  l'autre.
- Les 12 PNG, bien que non versionnés, restent une trace de décision utile en cas de
  litige sur « ce qui a été essayé avant » ; leur absence du dépôt signifie qu'elles
  ne sont consultables qu'en retrouvant l'archive d'origine, hors du contrôle de
  version.

### Ce que ça verrouille

- **Critère 1 (contrainte structurante)** : tout cycle futur qui apporterait de
  nouvelles références de conception (maquette, capture d'écran, document de
  décisions) se confronte à cette règle — HTML normatif versionné et dupliqué là où
  les gardes le lisent, illustrations écartées de l'historique sauf valeur ajoutée
  mesurable au-delà du code.
- **Critère 4 (verrouillage long terme)** : l'historique git ne se défait pas — un
  gonflement de 18 Mo évité aujourd'hui ne peut plus être retiré après coup sans
  réécrire l'historique, ce que ce dépôt ne fait pas (voir `docs/adr/README.md`,
  immutabilité).

## Références

- Fichiers : `docs/design-references/control-center-animated-prototype.html`,
  `docs/design-references/control-center-design-decisions.md`,
  `control-center/maquettes/2026-09-20-maquette-materiel-3.html` (copie normative).
- Pièges du module : `control-center/PIEGES.md` §32 (« un compte de cas mesuré dans
  le clone jetable n'est comparable au dépôt qu'à `docs/` près »).
- Spec : `specs/features/doing/feature-021-revenir-a-un-tableau-de-bord-unifie.md`
  — « REFONDATION » du 2026-09-20 (« les 12 PNG n'étaient que des illustrations »),
  « Contraintes techniques » (avertissement sur le chemin de lecture des gardes).
- Design system : `docs/design-references/control-center-design-decisions.md`,
  note éditoriale du 2026-09-20 en tête de section « Maquette de référence ».
