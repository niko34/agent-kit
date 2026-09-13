## Métadonnées
- **ID** : feature-013
- **Slug** : geles-personnalises-conditionnels
- **Type** : feature
- **Statut** : todo
- **Priorité** : normale
- **Version cible** : 0.6.0
- **Dernière mise à jour** : 2026-09-12
- **Spec(s) liée(s)** : feature-006 (lot 1, prérequis : le harnais),
  feature-004 (la distinction gelés / personnalisés / conditionnels),
  ADR-0007, ADR-0010, bug-003 (piège à éviter, voir « Notes pour agent »)

> **Lot 3 sur 4** du découpage de feature-006, décidé le 2026-09-12.
> **Prérequis : feature-006 (lot 1)** — ce lot s'appuie sur
> `tests/harnais_kit.py` et ses primitives (`.github/`, faux
> `sync_copilot_agents.py`).

## Domaines touchés
- [ ] API REST
- [ ] Frontend
- [ ] BDD / migrations
- [ ] Auth / permissions
- [ ] Données personnelles
- [ ] Intégrations externes
- [x] Tâches de fond — `tools/update_kit.sh`

## Agents requis
- [x] spec-reader
- [x] architect
- [ ] security-reviewer, rôle GATE — aucun chemin sensible
- [ ] ux-ui-designer
- [x] backend-developer
- [ ] frontend-developer
- [x] test-engineer — mutation obligatoire sur chaque cas
- [x] code-reviewer
- [x] doc-writer

## Description
Couvrir par des tests les quatre garanties qui portent sur la **distinction
fondatrice** du script : ce qui est gelé (toujours récupéré), ce qui est
personnalisé (jamais touché), ce qui est conditionnel (récupéré seulement si
déjà présent).

## Contexte
Cette distinction est la raison d'être d'`update_kit.sh` : une synchronisation
aveugle écraserait `CLAUDE.md`, c'est-à-dire le fichier le plus personnalisé
d'un projet, qui se trouve être aussi un fichier que le kit fournit. Les
commentaires en tête du script la décrivent sur une vingtaine de lignes.

**Aucune de ces quatre garanties n'est vérifiée par un test.** Le kit affirme
pourtant qu'« une règle que rien ne vérifie n'est pas une règle ». Sur le
composant qui écrase des fichiers suivis dans le dépôt d'un tiers, c'est
précisément la règle dont la violation coûterait le plus cher — et elle ne
serait constatée que chez le consommateur, sans retour possible.

## Comportement attendu

### Les quatre garanties à couvrir
| # | Garantie |
|---|---|
| 3 | `CLAUDE.md` personnalisé survit intact à une synchronisation |
| 4 | Un chemin gelé modifié dans le kit est réaligné dans le projet |
| 8 | Chemin conditionnel absent du projet → non installé |
| 9 | Chemin conditionnel présent → mis à jour |

Un cas par garantie, nommé d'après elle. Pour chacun, démontrer qu'une **seule**
garde peut le faire échouer.

### Précisions sur chaque cas
- **Garantie 3** — le faux projet doit porter un `CLAUDE.md` au contenu
  reconnaissable, différent de celui du kit. Après synchronisation, il est
  **bit pour bit** inchangé. Étendre aux autres personnalisés :
  `.claude/settings.json`, la skill `dev-workflow`, la mémoire de projet.
- **Garantie 4** — un fichier gelé **suivi**, modifié côté kit et divergent
  côté projet, doit être réaligné, et **lui seul** indexé par `git add`.
- **Garantie 8** — un projet sans `.github/` ne doit pas s'en voir installer
  un. Le cas vaut aussi pour `.gitlab/` et `control-center/`.
- **Garantie 9** — un projet ayant déjà `.github/workflows/hygiene-specs.yml`
  le reçoit à jour.

### Cas limites
- Projet ayant `.github/` **et** `.gitlab/` : les deux pipelines sont-ils
  rapatriés ? Comportement à constater et documenter.
- `control-center/` présent mais partiel (répertoire créé, fichiers absents) :
  que fait le script ?

## Comportement actuel
Aucun test ne couvre ces quatre garanties. La seule validation existante est
manuelle et date de feature-004 : « script exécuté sur un clone jouant un
projet ayant divergé du kit ; `CLAUDE.md` personnalisé a survécu ».

## Contraintes techniques
- Portable bash 3.2, zéro dépendance externe (ADR-0006)
- **Ce lot ne modifie pas `tools/update_kit.sh`** — il ajoute des tests. Si un
  invariant s'avère intestable en l'état, la modification doit être justifiée
  par écrit dans les notes d'implémentation
- Le harnais de feature-006 est **étendu, jamais refondu**

## Fichiers potentiellement concernés
- `tests/test_update_kit.py` — les 4 cas et les cas limites
- `tests/harnais_kit.py` — extension éventuelle des primitives
- `CHANGELOG.md` — seulement si un comportement observable change

## Livrables — check-list
- [ ] A1 — Garantie 3 : `CLAUDE.md` et les autres personnalisés intacts
- [ ] A2 — Garantie 4 : un gelé divergent est réaligné, et lui seul indexé
- [ ] A3 — Garantie 8 : conditionnel absent → non installé
- [ ] A4 — Garantie 9 : conditionnel présent → mis à jour
- [ ] A5 — Cas limites (deux forges présentes, `control-center/` partiel) :
      couverts ou documentés comme limites connues
- [ ] D1 — Mutation : chaque cas neuf vu mourir
- [ ] D2 — Anti-chevauchement démontré pour chaque cas

## Sécurité & données
- Authentification / permissions / données personnelles : non
- Migration destructive : non applicable
- Risque identifié : la garantie 3 est **la** promesse du script. Un test qui
  la couvrirait mal donnerait une confiance imméritée sur le seul point où
  l'erreur détruit du travail chez un tiers.

## ADR attendu ?
- **Probable** : non — ajouter des tests ne verrouille aucun choix
- **Critère(s) candidat(s)** : aucun
- **Sujet pressenti** : aucun

## Éléments visibles (pour doc-writer)
### Endpoints REST concernés
- Aucun
### Écrans / flux UI concernés
- Aucun
### Documentation à produire / mettre à jour
- `CHANGELOG.md` — seulement si un comportement observable change ; sinon,
  écrire explicitement qu'aucune entrée n'est due

## Critères d'acceptation
- [ ] `CLAUDE.md` personnalisé est bit pour bit inchangé après synchronisation
- [ ] Un chemin gelé divergent est réaligné, et lui seul est indexé
- [ ] Un chemin conditionnel absent du projet n'est jamais installé
- [ ] Un chemin conditionnel présent est mis à jour
- [ ] Les quatre garanties ont chacune leur cas, vu mourir par mutation
- [ ] Suite complète verte, zéro régression
- [ ] Lint propre, pas de warning nouveau

## Plan de test manuel
1. Projet avec `CLAUDE.md` personnalisé : synchroniser, comparer par `diff`.
2. Modifier un agent gelé côté kit : vérifier le réalignement et le contenu de
   `git diff --cached`.
3. Projet purement GitLab : vérifier qu'aucun `.github/` n'apparaît.

## Notes pour agent
- **Harnais livré (feature-006, lot 1)** : `tests/harnais_kit.py` est
  disponible, avec ses primitives de mise en scène (`.github/` + faux
  `sync_copilot_agents.py`, arbre sali, fichier non inscriptible,
  `skip-worktree`) et `MARQUEURS_DE_GARDE` / `affirmer_seule_garde()`.
  ADR-0012 impose que ce lot déclare sa propre clé pour chaque garantie
  neuve et produise une **matrice de mutation diagonale**.
- ⚠️ **Piège à éviter, lié à `bug-003`** : la garantie 4 doit être écrite sur un
  fichier **ordinaire, modifié et committé**, jamais sur un fichier portant
  `skip-worktree` ou `assume-unchanged`. Sinon elle figerait comme correct
  exactement le comportement que `bug-003` déclare défectueux — un test qui
  consacre un bug est pire que pas de test.
- La garantie 3 est la plus importante du script et la plus facile à écrire
  mollement. Vérifier le contenu **bit pour bit**, pas seulement l'existence
  du fichier.

## Constat additionnel — audit du cycle `bug-008`/`bug-009` (2026-09-13)

Établi par exécution, hors périmètre de ce cycle (ADR-0017 : ne désarmait
aucune des gardes livrées par `bug-008`/`bug-009`), reporté ici nommément —
cas **symétrique et distinct** de la garde « sous-module en travers » livrée
par `bug-009` (celle-ci couvre un sous-module à la place d'un **fichier**
gelé) :

**Un sous-module occupant la place d'un RÉPERTOIRE que le kit attend**
(ex. `.claude/skills/db-migrations/`) n'est détecté par aucune garde
existante. Les fichiers gelés que le kit place normalement sous ce
répertoire sont alors écrits par `git checkout` **dans le worktree du
sous-module** — un dépôt git à part, avec son propre index. Conséquence
observée : le gitlink (entrée `160000` dans le superprojet) peut se
retrouver traité comme une entrée `100644` ordinaire aux yeux du projet
consommateur, selon l'état du worktree du sous-module au moment du
`checkout`. Rien n'est perdu de façon irrémédiable comme dans les cas
`bug-006`/`bug-009`, mais l'aperçu reste **muet** sur ce cas et le
comportement qui en résulte n'a jamais été constaté au-delà de ce relevé. À
couvrir par ce lot si le harnais le permet, ou à documenter comme limite
connue sinon.

## Hors périmètre
- Les garanties 1, 2, 14, 15, 16 — feature-006 (lot 1)
- Les garanties 5, 6, 7, 17 — feature-012
- Les garanties 10 à 13 — feature-014
- La garde `skip-worktree` — `bug-003`
