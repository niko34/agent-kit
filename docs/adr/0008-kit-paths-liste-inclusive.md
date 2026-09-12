# ADR-0008 — `.kit-paths` est une liste inclusive, jamais une liste d'exclusions

## Statut

Accepté

## Date

2026-09-12

## Contexte

`tools/update_kit.sh` synchronise un projet depuis le kit en écrasant une
liste fixe de chemins gelés (`CHEMINS_GITHUB` et consorts). Cette liste
suppose que le projet **descend** du kit et souhaite tout en recevoir. Ce
n'est pas toujours vrai : un cas réel a motivé le contraire — un projet
firmware (`esp32-pool-controller`) dont les agents avaient **divergé de 50 %
à 88 %** du kit générique, avec un agent métier propre au domaine chimique et
un `test-engineer` portant toute une doctrine de validation par mutation.
Lancer la synchronisation telle quelle y aurait remplacé ce travail par les
versions génériques, d'un coup et sans retour.

## Décision

Un fichier `.kit-paths`, à la racine du projet, **remplace** la liste des
chemins gelés du kit quand il est présent (un chemin par ligne, `#` commente).
Il est **inclusif** : seuls les chemins qu'il déclare sont synchronisés.
Déclarer un chemin, c'est l'adopter ; l'omettre, c'est en devenir propriétaire
— le script le formule ainsi et le rappelle en commentaire. Les chemins
conditionnels (fichiers CI, `control-center`) continuent de s'appliquer
indépendamment, puisqu'ils ne touchent que ce qui est déjà présent dans le
projet ; ils sont dédoublonnés avec `.kit-paths` pour éviter un chemin traité
deux fois dans le récapitulatif.

## Alternatives considérées

- **Une liste d'exclusions** (« tout le kit sauf ces chemins ») : écarté —
  si le kit ajoute demain un nouveau chemin gelé, un projet qui a forké ses
  agents n'en veut probablement pas, et une exclusion oubliée le lui
  imposerait **en silence** à la prochaine synchronisation. Une liste
  inclusive ne connaît que ce qu'elle déclare : un ajout futur au kit n'est
  jamais reçu tant qu'il n'est pas explicitement ajouté à `.kit-paths`. Le
  défaut penche du bon côté (rien reçu par erreur, plutôt que tout reçu par
  erreur).

## Conséquences

### Positives

- Un projet qui a spécialisé ses agents (cas mesuré : 50-88 % de
  divergence) peut continuer à ne recevoir du kit que ce qu'il choisit
  explicitement — le centre de contrôle, par exemple, sans toucher aux
  agents forkés.
- Un futur chemin gelé ajouté au kit n'écrase jamais un projet qui n'a pas
  mis à jour son `.kit-paths` : l'absence de mise à jour est sans danger.

### Négatives

- Omettre `tools/update_kit.sh` lui-même de `.kit-paths` fossilise
  silencieusement le script à la version du jour de son installation : les
  corrections faites plus tard dans le kit n'atteignent plus jamais ce
  projet. C'est un piège documenté (commentaire dans le script et le
  README), mais il reste possible de l'omettre par inattention.
- Un projet qui adopte `.kit-paths` de façon minimaliste peut, sans s'en
  rendre compte, cesser de recevoir des correctifs de sécurité ou de
  fiabilité portés sur des chemins qu'il n'a pas déclarés — l'inclusivité
  protège contre l'écrasement, pas contre l'obsolescence silencieuse.
