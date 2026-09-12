## Métadonnées
- **ID** : feature-005
- **Slug** : synchronisation-selective
- **Type** : feature
- **Statut** : done
- **Priorité** : haute
- **Version cible** : 0.5.0 (mécanisme `.kit-paths` et assistant d'installation
  fusionnés dans le kit par `f5183e6` ; corrections `update_kit.sh` sur
  commits `d375aa8`, `9b8a741`, `91fafcc`, `846d480`)
- **Dernière mise à jour** : 2026-09-12
- **Spec(s) liée(s)** : feature-004 (version initiale d'`update_kit.sh`
  corrigée ici), feature-002 (l'assistant d'installation configure le centre
  de contrôle livré par cette dernière)

> Spec rétroactive, écrite depuis quatre commits distincts d'`update_kit.sh`
> (`d375aa8`, `9b8a741`, `91fafcc`, `846d480`), le commit de fusion `f5183e6`
> (assistant d'installation `control-center/installer.py`) et les commentaires
> du script lui-même.

## Domaines touchés
- [ ] API REST
- [ ] Frontend
- [ ] BDD / migrations
- [ ] Auth / permissions
- [ ] Données personnelles
- [ ] Intégrations externes
- [x] Tâches de fond — script de synchronisation git exécuté à la demande,
      pas de service continu

## Agents requis
- [x] spec-reader
- [x] architect — a posé le principe « liste inclusive et non liste
      d'exclusions » pour `.kit-paths`
- [ ] security-reviewer
- [ ] ux-ui-designer
- [x] backend-developer — `tools/update_kit.sh`, `control-center/installer.py`
- [ ] frontend-developer
- [ ] test-engineer — validation par exécution réelle sur des projets
      consommateurs, pas de suite automatisée pour ce script shell
- [x] code-reviewer
- [x] doc-writer

## Description
Un fichier `.kit-paths` à la racine d'un projet consommateur **remplace** la
liste gelée d'`update_kit.sh` par une liste choisie par le projet — pour les
projets qui ont forké leurs agents avant l'existence du kit et ne veulent pas
que la synchronisation les écrase. En parallèle, `control-center/installer.py`
assiste l'installation du centre de contrôle (feature-002) sans jamais
écraser une configuration existante ni écrire dans `.claude/settings.json`.
Quatre défauts de conception ont été trouvés en installant ces mécanismes
dans des **projets réels**, aucun par relecture.

## Contexte
La liste gelée d'`update_kit.sh` (feature-004) s'appliquait identiquement à
tous les projets. Or tous ne descendent pas du kit : un projet firmware réel
avait spécialisé ses agents pendant des mois — un agent métier propre au
domaine chimique, un `test-engineer` portant toute une doctrine de validation
par mutation — avec des agents ayant divergé de **50 à 88 %** des versions
génériques du kit. Lancer la synchronisation aveugle y aurait remplacé tout
cela d'un coup, sans retour possible.

## Comportement livré

### `.kit-paths` — liste inclusive, et non liste d'exclusions
Un chemin par ligne, `#` commente, lignes vides ignorées. **Déclarer un
chemin, c'est l'adopter ; l'omettre, c'est en devenir propriétaire** — le
script le dit explicitement. Choix délibéré : si le kit ajoute demain un
chemin gelé, un projet qui a forké n'en veut probablement pas ; une liste
d'**exclusions** oubliée le lui imposerait en silence, une liste
**d'inclusions** omise ne fait rien. Le défaut penche du bon côté.

Deux pièges documentés dans le script lui-même :
- omettre `tools/update_kit.sh` de `.kit-paths` fossilise le script à la
  version du jour de son installation — les corrections faites dans le kit
  n'atteindraient plus jamais le projet ;
- les chemins conditionnels (CI, `control-center`) continuaient, dans la
  première version de ce mécanisme, de s'appliquer même en présence d'un
  `.kit-paths` (voir défaut 2 ci-dessous).

### `control-center/installer.py`
- **Découvre** : répertoires de specs réellement présents, répertoire
  d'agents, commandes de test devinées d'après les fichiers de build — et
  n'invente rien : une colonne absente du disque n'entre pas dans la
  configuration.
- Deux choses qu'il ne fait **jamais**, délibérément :
  - il n'écrase jamais un `control-center.toml` existant (une configuration
    en place a été relue par quelqu'un) ;
  - il n'écrit jamais dans `.claude/settings.json` — le fichier le plus
    personnalisé d'un projet — et se contente d'**afficher** le bloc de hooks
    à coller.
- `control-center` figure dans `update_kit.sh` comme chemin **conditionnel**,
  et non gelé : composant optionnel (n'installer un serveur web et une
  vingtaine de fichiers que dans les projets qui le veulent), et il
  arriverait **inerte** si gelé — ses hooks vivent dans `.claude/settings.json`,
  que le script ne touche jamais.

## Défauts réels trouvés en installant ce mécanisme dans des projets réels

1. **`--dry-run` exigeait un arbre de travail propre.** La garde s'appliquait
   AVANT le branchement de simulation, donc aussi à la prévisualisation, qui
   n'écrit pourtant rien. Constaté en installant le script dans un projet
   réel : un seul fichier modifié, hors périmètre, empêchait toute
   prévisualisation — l'inverse de ce qu'on veut : c'est précisément quand on
   a du travail en cours qu'on voudrait savoir ce qu'une synchronisation
   ferait. Corrigé (`d375aa8`) : la garde reste entière pour la
   synchronisation réelle, elle ne s'applique plus à `--dry-run`.
2. **`.kit-paths` ne gouvernait pas les chemins conditionnels.** Un projet
   avait déclaré ne prendre que `control-center`, et la prévisualisation
   annonçait quand même le remplacement de son fichier de CI — qui portait un
   contrôle de sécurité absent du kit. Une synchronisation aurait supprimé ce
   garde-fou **en silence**. Corrigé (`91fafcc`) : `.kit-paths`, quand il
   existe, gouverne désormais **tout**, conditionnels compris — déclarer ce
   qu'on prend, c'est aussi déclarer ce qu'on ne prend pas.
3. **L'aperçu annonçait des fichiers qui n'allaient pas être touchés.**
   `git diff` sur les chemins entiers listait aussi des fichiers **propres au
   projet** : la configuration du centre de contrôle apparaissait comme sur
   le point d'être modifiée, alors que `git checkout` ne pouvait pas la
   toucher — elle n'existe pas dans l'arbre du kit. Corrigé (`91fafcc`) :
   l'aperçu ne montre plus que les fichiers présents dans le kit, donc ceux
   réellement écrits. C'est sur cet aperçu qu'on décide de lancer la
   synchronisation ; s'il inquiète à tort, il ne sert à rien.
4. **La régénération Copilot échouait là où elle n'avait rien à faire.** La
   condition portait sur la seule présence de `.github/` — or un projet peut
   avoir `.github/` pour sa CI sans consommer la passerelle Copilot (dès
   qu'un `.kit-paths` exclut `tools/sync_copilot_agents.py`). Constaté au
   premier lancement réel : la synchronisation copiait correctement ses
   fichiers, signalait proprement les orphelins, puis **échouait en fin de
   course** sur un script absent — laissant croire à un échec global alors
   que tout avait été écrit. Corrigé (`846d480`) : la condition porte
   désormais sur la présence du script lui-même, pas sur `.github/`.

Les défauts 1 à 3 partagent la même origine : un mécanisme relu plusieurs
fois, jamais exécuté contre un vrai projet avant sa première mise en service
réelle. Le premier lancement les a sortis en quelques minutes ; le quatrième
a suivi au lancement suivant, dans un autre projet.

## Comportement actuel (avant ce travail)
`update_kit.sh` (feature-004) appliquait sa liste gelée identiquement à tout
projet, sans dérogation possible. Un projet ayant spécialisé ses agents avant
l'existence du kit n'avait aucun moyen de bénéficier des corrections futures
sans risquer d'écraser son travail.

## Contraintes techniques
- Portable bash 3.2 (macOS) — pas de `declare -A` ni `mapfile`
- `.kit-paths` doit être lisible sans dépendance (simple fichier texte,
  `#` = commentaire)
- L'aperçu (`git diff`) ne doit annoncer que des fichiers réellement présents
  côté kit
- Dédoublonnage des chemins : `control-center` peut figurer à la fois dans
  `.kit-paths` et dans les chemins conditionnels

## Fichiers concernés
- `tools/update_kit.sh` — mécanisme `.kit-paths`, garde `--dry-run`, aperçu
  filtré, condition de régénération Copilot
- `control-center/installer.py` — [nouveau] assistant d'installation

## Livrables — check-list
- [x] A1 — `.kit-paths` remplace la liste gelée quand il existe
- [x] A2 — `.kit-paths` gouverne aussi les chemins conditionnels
- [x] A3 — `--dry-run` fonctionne sur un arbre de travail sale
- [x] A4 — Aperçu filtré aux seuls fichiers présents côté kit
- [x] A5 — Régénération Copilot conditionnée à la présence du script, pas de `.github/`
- [x] A6 — `control-center/installer.py` : découverte, jamais d'écrasement,
      jamais d'écriture dans `settings.json`
- [x] C1 — Documentation des deux pièges (`update_kit.sh` omis, chemins
      conditionnels échappant à `.kit-paths`)

## ADR produits
- **ADR-0007** (`docs/adr/0007-config-projet-ne-voyage-pas-avec-kit.md`) — ce
  qui appartient au projet ne voyage pas (fondement de la distinction
  gelés/personnalisés/conditionnels)
- **ADR-0008** (`docs/adr/0008-kit-paths-liste-inclusive.md`) — `.kit-paths`
  est une liste **inclusive**, jamais une liste d'exclusions

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- Aucun

### Écrans / flux UI concernés
- Aucun

### Documentation produite / mise à jour
- `tools/update_kit.sh` — commentaires en tête expliquant chaque garde et le
  défaut qui l'a motivée
- `control-center/README.md` — section « Installation dans un projet »
- `CHANGELOG.md` — entrées correspondantes (commits `9b8a741`, `d375aa8`,
  `91fafcc`, `846d480`)

## Critères d'acceptation
- [x] Un projet listant `.kit-paths` ne reçoit **que** les chemins déclarés,
      conditionnels compris
- [x] `--dry-run` s'exécute sur un arbre de travail sale
- [x] L'aperçu de synchronisation n'annonce que des fichiers réellement
      remplacés
- [x] La régénération Copilot ne s'exécute que si le script de conversion est
      lui-même rapatrié
- [x] L'assistant d'installation ne modifie jamais `.claude/settings.json` ni
      un `control-center.toml` existant
- [ ] Suite de tests automatisée pour `update_kit.sh` — non applicable
      (script shell de synchronisation git), validation par exécution réelle
      documentée ci-dessous

## Validation effectuée (à la place du plan de test manuel)
1. Projet réel n'ayant déclaré que `control-center` dans `.kit-paths` :
   l'aperçu annonçait à tort le remplacement d'un fichier de CI portant un
   contrôle de sécurité — défaut 2, corrigé avant nouvelle tentative.
2. Même projet, après correction : l'aperçu ne montre plus que les fichiers
   du kit réellement présents — défaut 3 vérifié résolu.
3. Projet ayant `.github/` pour sa CI mais sans la passerelle Copilot :
   synchronisation menée à bien sans échec de fin de course — défaut 4
   vérifié résolu.
4. Prévisualisation (`--dry-run`) lancée sur un arbre sale (un fichier hors
   périmètre modifié) : n'est plus bloquée — défaut 1 vérifié résolu.

## Notes pour agent
- Les quatre défauts ont un point commun explicitement noté dans le script :
  aucun n'était visible à la lecture, tous ont été trouvés en **installant**
  le mécanisme dans un vrai projet. Toute évolution future d'`update_kit.sh`
  devrait être éprouvée de la même manière avant d'être considérée close.
- Le cas qui a motivé `.kit-paths` (agents divergents de 50 à 88 %) doit être
  gardé en tête pour toute future extension de la liste gelée : une addition
  gelée impose son remplacement à tout projet qui n'a pas de `.kit-paths`.

## Hors périmètre
- Étapes D à G du centre de contrôle (voir feature-002) — l'installateur ne
  prépare que la configuration, pas le pilotage
- Migration automatique d'un projet divergent vers `.kit-paths` — reste un
  geste manuel de l'humain
