## Métadonnées
- **ID** : feature-014
- **Slug** : apercu-effets-de-bord-echecs
- **Type** : feature
- **Statut** : todo
- **Priorité** : normale
- **Version cible** : 0.6.0
- **Dernière mise à jour** : 2026-09-12
- **Spec(s) liée(s)** : feature-006 (lot 1, prérequis : le harnais),
  feature-003 (la passerelle Copilot), bug-001 et ADR-0011 (l'aperçu),
  feature-011 (dépendance d'ordonnancement, voir « Notes pour agent »)

> **Lot 4 sur 4** du découpage de feature-006, décidé le 2026-09-12.
> **Prérequis : feature-006 (lot 1)** — ce lot s'appuie sur
> `tests/harnais_kit.py` et sa primitive « faux `sync_copilot_agents.py` ».

## Domaines touchés
- [ ] API REST
- [ ] Frontend
- [ ] BDD / migrations
- [ ] Auth / permissions
- [ ] Données personnelles
- [x] Intégrations externes — la régénération des profils Copilot
- [x] Tâches de fond — `tools/update_kit.sh`

## Agents requis
- [x] spec-reader
- [x] architect
- [ ] security-reviewer, rôle GATE — aucun chemin sensible. **Rôle AUDIT
      recommandé** sur l'état laissé derrière par un échec partiel
- [ ] ux-ui-designer
- [x] backend-developer
- [ ] frontend-developer
- [x] test-engineer — mutation obligatoire sur chaque cas
- [x] code-reviewer
- [x] doc-writer

## Description
Couvrir les quatre garanties qui portent sur ce que le script produit et laisse
derrière lui — la fidélité de l'aperçu, la régénération Copilot, la
conservation des orphelins — et constater le comportement en cas d'échec
partiel de `git checkout`.

## Contexte
Les trois lots précédents couvrent les conditions d'entrée du script (gardes
d'usage, périmètre déclaré, catégories de chemins). Celui-ci couvre sa
**sortie** : ce qu'il affiche, ce qu'il régénère, ce qu'il conserve, et ce
qu'il laisse quand il échoue au milieu.

Deux points sont particulièrement mal couverts aujourd'hui :

**La conservation des orphelins.** Le script signale les fichiers présents dans
le projet et absents du kit — sans jamais les supprimer, parce qu'il ne peut
pas distinguer un fichier retiré du kit d'un ajout local délibéré. Ce bloc
(l. ~244-266 avant bug-001) n'est **jamais atteint** par les tests actuels.

**L'échec partiel.** `git checkout` sur plusieurs chemins n'est pas atomique.
L'audit sécurité du cycle bug-001 a relevé que le message d'échec ne dit ni ce
qui a été écrit, ni comment revenir en arrière — alors que tout ce qui a été
écrasé est, dans ce cas précis, récupérable (les fichiers concernés sont suivis
et propres, ou identiques).

## Comportement attendu

### Les quatre garanties à couvrir
| # | Garantie |
|---|---|
| 10 | L'aperçu ne liste que des fichiers présents côté kit |
| 11 | Régénération Copilot : `.github/` sans le script → pas d'échec |
| 12 | Régénération Copilot : script présent → profils régénérés **et indexés** |
| 13 | Fichier présent dans le projet, absent du kit → **signalé, conservé** |

Un cas par garantie, nommé d'après elle. Pour chacun, démontrer qu'une **seule**
garde peut le faire échouer.

### Précisions
- **Garantie 10** — un fichier propre au projet, situé sous un chemin gelé
  mais absent du kit, ne doit **pas** apparaître dans l'aperçu. C'est le défaut
  3 de feature-005, corrigé mais jamais couvert par un test.
- **Garantie 11** — projet avec `.github/` mais sans
  `tools/sync_copilot_agents.py` : la synchronisation va au bout sans échec de
  fin de course. C'est le défaut 4 de feature-005.
- **Garantie 12** — le script présent, les profils sont régénérés **et**
  `git add .github/agents` a bien eu lieu : vérifier l'index, pas seulement le
  disque.
- **Garantie 13** — le bloc orphelins est atteint, le fichier est **nommé dans
  la sortie**, et il existe toujours après la synchronisation.

### Cas limite — l'échec partiel
- `git checkout` en échec (fichier cible non inscriptible) : le script doit
  sortir en erreur. **Constater et documenter** ce qu'il laisse derrière :
  quels fichiers ont été écrits, lesquels ne l'ont pas été, ce qui est indexé.
- Régénération Copilot en échec **après** que les fichiers ont été écrits :
  que reste-t-il d'indexé ? C'est le scénario exact du défaut 4 de
  feature-005, dans sa version non corrigée.

**Livrable attendu : un comportement constaté et documenté, pas corrigé.** Si
le constat révèle un défaut grave, il donne lieu à une spec dédiée — comme
`bug-001` est né d'un constat de feature-005.

## Comportement actuel
Aucune de ces quatre garanties n'est couverte. Le bloc orphelins n'est jamais
atteint par un test. L'état laissé par un échec partiel n'est décrit nulle part.

## Contraintes techniques
- Portable bash 3.2, zéro dépendance externe (ADR-0006)
- **Ce lot ne modifie pas `tools/update_kit.sh`**, sauf justification écrite
- Le harnais de feature-006 est **étendu, jamais refondu**
- Rendre un fichier non inscriptible ne fonctionne pas sous `root` : le cas
  limite d'échec de `checkout` doit trouver un autre levier (répertoire en
  lecture seule, chemin occupé par un répertoire, etc.) ou être documenté
  comme non reproductible dans cet environnement

## Fichiers potentiellement concernés
- `tests/test_update_kit.py` — les 4 cas et les cas limites
- `tests/harnais_kit.py` — extension éventuelle des primitives
- `CHANGELOG.md` — seulement si un comportement observable change

## Livrables — check-list
- [ ] A1 — Garantie 10 : l'aperçu exclut les fichiers propres au projet
- [ ] A2 — Garantie 11 : `.github/` sans le script → pas d'échec
- [ ] A3 — Garantie 12 : profils régénérés **et indexés**
- [ ] A4 — Garantie 13 : orphelin signalé et conservé
- [ ] A5 — Échec partiel de `checkout` : comportement constaté et **documenté**
- [ ] A6 — Régénération Copilot en échec après écriture : état constaté et documenté
- [ ] A7 — Tout défaut grave révélé par A5/A6 donne lieu à une spec dédiée,
      jamais à un correctif au fil de l'eau
- [ ] D1 — Mutation : chaque cas neuf vu mourir
- [ ] D2 — Anti-chevauchement démontré pour chaque cas

## Sécurité & données
- Authentification / permissions / données personnelles : non
- Migration destructive : non applicable
- Risque identifié : un état à moitié synchronisé dans le dépôt d'un tiers,
  sans indication de ce qui a été fait ni de comment revenir. C'est un constat
  d'audit encore ouvert — ce lot l'établit, il ne le corrige pas.

## ADR attendu ?
- **Probable** : non pour les tests eux-mêmes
- **Critère(s) candidat(s)** : aucun a priori. Si le constat sur l'échec
  partiel conduit à décider d'une stratégie (transaction, point de reprise,
  message de retour arrière), **ce choix-là** relèverait des critères 1 et 4 —
  et appartiendrait à la spec dédiée, pas à celle-ci.

## Éléments visibles (pour doc-writer)
### Endpoints REST concernés
- Aucun
### Écrans / flux UI concernés
- Aucun
### Documentation à produire / mettre à jour
- `CHANGELOG.md` — seulement si un comportement observable change
- La documentation du comportement en cas d'échec partiel, si le constat
  justifie de l'écrire quelque part de durable

## Critères d'acceptation
- [ ] L'aperçu n'annonce jamais un fichier absent du kit
- [ ] Un projet avec `.github/` mais sans la passerelle synchronise sans échec
- [ ] Les profils régénérés sont bien indexés, vérifié sur l'index
- [ ] Un orphelin est nommé dans la sortie et existe toujours après coup
- [ ] L'état laissé par un échec partiel est **documenté**, qu'il soit
      satisfaisant ou non
- [ ] Les quatre garanties ont chacune leur cas, vu mourir par mutation
- [ ] Suite complète verte, zéro régression
- [ ] Lint propre, pas de warning nouveau

## Plan de test manuel
1. Placer un fichier propre au projet sous un chemin gelé : vérifier qu'il
   n'apparaît pas dans l'aperçu et qu'il survit.
2. Projet avec `.github/` sans la passerelle : synchroniser jusqu'au bout.
3. Provoquer un échec de `checkout` et relever précisément l'état laissé.

## Notes pour agent
- **Harnais livré (feature-006, lot 1)** : `tests/harnais_kit.py` est
  disponible, avec sa primitive de faux `.github/` + `sync_copilot_agents.py`
  et `MARQUEURS_DE_GARDE` / `affirmer_seule_garde()`. ADR-0012 impose que ce
  lot déclare sa propre clé pour chaque garantie neuve et produise une
  **matrice de mutation diagonale**.
- ⚠️ **Dépendance d'ordonnancement avec `feature-011`** : les garanties 11 et 12
  testent le **résultat** de la régénération Copilot, jamais le **moment** où
  elle intervient par rapport au `checkout`. C'est précisément cet
  ordonnancement que `feature-011` va changer. Si `feature-011` passe avant ce
  lot, ces deux cas devront être écrits contre le nouveau comportement ; si
  elle passe après, ils devront être relus. À arbitrer au lancement.
- La garantie 13 est la seule qui atteigne le bloc orphelins. Vérifier que le
  cas l'atteint réellement — un test qui n'entre jamais dans le code qu'il
  prétend couvrir est le pire des faux témoins.
- A5 et A6 sont des **constats**, pas des correctifs. La tentation de réparer
  en passant est exactement la dérive de périmètre que le découpage cherche à
  éviter.

## À ajouter — constats de l'audit de `bug-006` (2026-09-13)

**L'aperçu est muet sur les objets non réguliers**, tous établis par exécution :

- un **lien symbolique** d'ancêtre pointant vers un répertoire — cas réel du
  partage de skills entre projets — est **remplacé par un vrai répertoire**. La
  cible externe reste intacte, mais **le câblage disparaît sans aucune mention
  dans l'aperçu** ;
- un **lien cassé** et un **FIFO** sont **supprimés en silence**.

Rien n'est irrécupérable dans ces trois cas, mais l'aperçu **ne dit pas ce qu'il
va faire** — ce qui est précisément l'objet de la garantie 10.

**Non vérifiable dans le conteneur** : l'échec **partiel** de `git checkout`. En
root sur tmpfs, ni `chmod` ni `chattr +i` ne provoquent d'échec d'écriture.
L'état laissé par une écriture interrompue reste une **hypothèse** — le dire, ou
fabriquer l'environnement qui permet de l'éprouver, comme l'audit l'a fait en
compilant bash 4.3 pour `feature-012`.

## À ajouter — constat de l'audit du cycle `bug-008`/`bug-009` (2026-09-13)

Confirme et complète le constat de l'audit `bug-006` ci-dessus, cosmétique
(rien d'irrécupérable), reporté ici plutôt qu'absorbé (ADR-0017 : ne désarme
aucune garde livrée par ce cycle) : un **FIFO** ou un **lien symbolique
cassé** occupant un chemin gelé est **remplacé sans un mot** par
`git checkout` — ni dans l'aperçu, ni dans la sortie réelle. Même défaut que
celui déjà noté (« supprimés en silence »), vu sous l'angle du remplacement
plutôt que de la suppression ; rattaché au même constat, pas dupliqué en
garantie séparée.

## Hors périmètre
- Les garanties 1, 2, 14, 15, 16 — feature-006 (lot 1)
- Les garanties 5, 6, 7, 17 — feature-012
- Les garanties 3, 4, 8, 9 — feature-013
- L'ordonnancement de la régénération Copilot — `feature-011`
- La correction de tout défaut révélé par A5/A6 — spec dédiée
