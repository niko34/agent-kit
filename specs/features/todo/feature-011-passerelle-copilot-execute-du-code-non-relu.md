## Métadonnées
- **ID** : feature-011
- **Slug** : passerelle-copilot-execute-du-code-non-relu
- **Type** : feature (durcissement)
- **Statut** : todo
- **Priorité** : haute
- **Version cible** : 0.6.0
- **Dernière mise à jour** : 2026-09-12
- **Spec(s) liée(s)** : feature-003 (la passerelle Copilot), feature-004 et
  feature-005 (`update_kit.sh`), bug-001 (le cycle dont l'audit a sorti ce
  constat), ADR-0010

> Constat de `security-reviewer` en **rôle AUDIT**, pendant le cycle de
> bug-001. Classé **grave**. C'est le seul des trois constats graves qui ne
> relève pas de la famille « travail local écrasé » : il porte sur
> l'exécution de code, pas sur sa destruction.

## Domaines touchés
- [ ] API REST
- [ ] Frontend
- [ ] BDD / migrations
- [x] Auth / permissions → **passage obligatoire par `security-reviewer` (rôle GATE)** —
      il ne s'agit pas d'authentification applicative, mais de la **confiance
      accordée à un dépôt distant** dont le code est exécuté localement. C'est
      la même question, posée au niveau de la chaîne d'approvisionnement
- [ ] Données personnelles
- [x] Intégrations externes — le distant `kit`, et la passerelle Copilot
- [x] Tâches de fond — `update_kit.sh` s'exécute à la demande et lance un
      sous-processus Python

## Agents requis
- [x] spec-reader
- [x] architect
- [x] security-reviewer, rôle GATE — P1 sur le design, P2 sur le diff
- [ ] ux-ui-designer
- [x] backend-developer
- [ ] frontend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Description
`tools/update_kit.sh` exécute `python3 tools/sync_copilot_agents.py --write`
**après** avoir récupéré ce fichier depuis le kit, et **avant** que l'humain
n'ait relu quoi que ce soit. La version exécutée est donc celle qui vient
d'arriver du distant, jamais celle que le projet avait validée. Cette spec
referme cet écart.

## Contexte
Le script se termine par une consigne explicite à l'utilisateur :

> À FAIRE MAINTENANT :
>   1. Relire le diff — un agent peut avoir changé de comportement

Or la régénération Copilot (`tools/update_kit.sh:279-285`) tourne **avant** ce
message. L'ordre réel est donc : récupérer du code distant → **l'exécuter** →
demander à l'humain de le relire. La relecture arrive après coup, sur du code
qui a déjà tourné.

Le distant est `kit/main` — une **branche**, jamais un tag ni un commit
épinglé. Ce qu'un projet reçoit dépend donc de l'état de `main` au moment du
`git fetch`, sans point fixe vérifiable.

Portée : tout projet consommateur qui a `.github/` et la passerelle. Un kit
compromis, ou simplement une erreur poussée sur `main`, obtient une exécution
Python dans chaque projet qui synchronise.

Ce n'est pas une vulnérabilité exploitable à distance : elle suppose un accès
en écriture au dépôt du kit. C'est un **défaut d'ordonnancement** qui prive
l'utilisateur du contrôle que le script lui promet par écrit trois lignes
plus bas.

## Comportement attendu

### L'une des trois issues, `architect` tranche
1. **Exécuter la version déjà validée** — lancer la passerelle depuis `HEAD`
   (`git show HEAD:tools/sync_copilot_agents.py | python3 -`) plutôt que
   depuis la copie fraîchement écrite. Le code qui tourne est celui que le
   projet avait déjà.
2. **Différer la régénération** — ne pas l'exécuter, et l'inscrire dans la
   liste « À FAIRE MAINTENANT » comme une commande que l'humain lance après
   relecture. Plus simple, au prix d'une étape manuelle de plus.
3. **Épingler et vérifier** — exiger un tag signé ou un commit épinglé plutôt
   qu'une branche mouvante, et afficher la référence récupérée avant
   exécution.

Les trois sont défendables ; le choix doit être écrit, pas subi.

### Ce qui doit être vrai dans tous les cas
- Aucun code fraîchement récupéré ne s'exécute avant que l'utilisateur n'ait
  eu l'occasion de le lire.
- La référence exacte récupérée (`git log -1 --format='%h %s' kit/main`) est
  **affichée avant** toute exécution, pas seulement suggérée à la fin.
- Le comportement en l'absence de la passerelle reste celui livré par
  feature-005 : aucune erreur, aucun échec de fin de course.

### Cas limites
- Projet où `tools/sync_copilot_agents.py` est **absent** de `.kit-paths` :
  rien ne doit s'exécuter, ni échouer (déjà corrigé par feature-005, à ne pas
  régresser).
- Passerelle présente dans le projet mais **absente du kit** : ne pas
  l'exécuter depuis un fichier qui vient de disparaître.
- `git add .github/agents` après une régénération échouée : que reste-t-il
  d'indexé ? L'audit signale que l'état laissé derrière n'est décrit nulle
  part.

## Comportement actuel
`tools/update_kit.sh:279-285` : si `.github/` existe **et** que
`tools/sync_copilot_agents.py` est présent, le script exécute ce dernier — la
version tout juste récupérée — puis `git add .github/agents`. Le message
invitant à relire le diff vient après.

## Contraintes techniques
- Bash 3.2 portable, zéro dépendance externe (ADR-0006)
- Ne pas régresser les quatre correctifs de feature-005, en particulier la
  condition de régénération portant sur le script et non sur `.github/`
- Ne pas régresser les gardes d'écrasement livrées par bug-001
- `git checkout` ne supprime jamais ; le signalement des orphelins reste

## Fichiers potentiellement concernés
- `tools/update_kit.sh` — ordonnancement de la régénération, affichage de la
  référence récupérée
- `tests/test_update_kit.py` — cas de non-régression
- `docs/adr/NNNN-*.md` — si `architect` retient l'épinglage (critère 4 :
  verrouillage long terme)
- `README.md`, `GUIDE.md` — la procédure de synchronisation change pour l'humain
- `CHANGELOG.md`

## Livrables — check-list
- [ ] A1 — Décision écrite entre les trois issues, avec sa justification
- [ ] A2 — Aucun code fraîchement récupéré n'est exécuté avant relecture possible
- [ ] A3 — Référence récupérée affichée **avant** exécution
- [ ] A4 — Cas limites couverts (passerelle absente du projet, absente du kit,
      régénération en échec)
- [ ] C1 — `README.md`, `GUIDE.md`, `CHANGELOG.md` à jour
- [ ] D1 — Cas de test validés par mutation

## Sécurité & données
- Authentification touchée : **oui**, au sens de la confiance accordée à un
  distant dont on exécute le code
- Permissions / rôles touchés : non
- Données personnelles : non
- Migration destructive : non applicable
- Nouvelle exposition publique : non
- Risque identifié : **exécution de code fraîchement récupéré avant toute
  relecture humaine**, depuis une branche non épinglée, dans chaque projet
  consommateur. Suppose un accès en écriture au dépôt du kit — donc pas une
  vulnérabilité à distance, mais un défaut d'ordonnancement qui annule une
  garantie que le script promet par écrit.
- **`security-reviewer` (rôle GATE) coché** : P1 sur le design, avant le code

## ADR attendu ?
- **Probable** : oui, si l'issue retenue est l'épinglage
- **Critère(s) candidat(s)** : 3 (trois alternatives crédibles à tracer),
  4 (verrouillage long terme si l'on exige une référence épinglée)
- **Sujet pressenti** : « Ce que le kit exécute, et quand » — l'ordre entre
  récupération, exécution et relecture

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- Aucun

### Écrans / flux UI concernés
- Aucun

### Documentation à produire / mettre à jour
- `README.md` — section « Récupérer les évolutions du kit »
- `GUIDE.md` — mécanisme `update_kit.sh`
- `CHANGELOG.md` — entrée sous la version cible
- `docs/adr/NNNN-*.md` — si l'épinglage est retenu

## Critères d'acceptation
- [ ] Aucun fichier récupéré dans la session courante n'est exécuté avant que
      l'utilisateur n'ait pu le relire
- [ ] La référence du kit récupérée est affichée avant toute exécution
- [ ] Un projet sans la passerelle ne voit aucun changement de comportement
- [ ] Les quatre correctifs de feature-005 et les gardes de bug-001 sont intacts
- [ ] Suite de tests complète verte, zéro régression
- [ ] Lint propre (`shellcheck`), pas de warning nouveau

## Plan de test manuel
1. **Nominal** : synchroniser un projet avec la passerelle — vérifier que la
   référence récupérée s'affiche avant toute exécution.
2. **Passerelle modifiée dans le kit** : introduire une trace dans
   `sync_copilot_agents.py` côté kit, synchroniser, vérifier laquelle des deux
   versions s'exécute.
3. **Sans passerelle** : projet avec `.github/` mais sans le script — aucune
   erreur, aucun échec de fin de course.
4. **Régénération en échec** : casser volontairement la passerelle, vérifier
   l'état laissé derrière et ce qui reste indexé.

## Notes pour agent
- Ce constat vient du rôle **AUDIT** de `security-reviewer`, pas d'un gate :
  il cherchait « ce qu'aucun diff ne montre », et c'est précisément ce qu'il a
  trouvé — un défaut d'**ordre**, invisible dans chaque ligne prise isolément.
- Le script promet par écrit à l'utilisateur de relire avant que quoi que ce
  soit ne compte. Le défaut n'est pas qu'il exécute du code distant — c'est
  qu'il le fait **après avoir promis le contraire**.
- `update_kit.sh` se met lui-même à jour : la correction d'ordonnancement doit
  tenir compte du fait que le script en cours d'exécution peut avoir été
  remplacé sur le disque au moment où elle s'applique.

## Hors périmètre
- Signature cryptographique des commits du kit — sujet distinct, plus lourd
- La liste d'interdits d'écriture pour `.kit-paths` (un `.kit-paths` déclarant
  `.` ou `.claude` fait écraser `CLAUDE.md`, `settings.json`, la mémoire) :
  constat d'audit classé « acceptable », à traiter par une spec dédiée
- Les fichiers `skip-worktree` — voir `bug-003-skip-worktree-echappe-aux-gardes.md`
