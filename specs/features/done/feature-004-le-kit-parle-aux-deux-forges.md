## Métadonnées
- **ID** : feature-004
- **Slug** : le-kit-parle-aux-deux-forges
- **Type** : feature
- **Statut** : done
- **Priorité** : haute
- **Version cible** : 0.3.0 (`CHANGELOG.md`, commit `9d18d70`)
- **Dernière mise à jour** : 2026-09-12
- **Spec(s) liée(s)** : feature-005 (les corrections ultérieures d'`update_kit.sh`
  livrées après la première synchronisation réelle)

> Spec rétroactive, écrite depuis le commit `9d18d70`
> (« feat: le kit parle aux deux forges, et cesse d'être un cul-de-sac »)
> et `CHANGELOG.md` `[0.3.0]`. Décrit la **version initiale** d'`update_kit.sh` ;
> ses corrections ultérieures (première synchronisation réelle) sont couvertes
> par feature-005.

## Domaines touchés
- [ ] API REST
- [ ] Frontend
- [ ] BDD / migrations
- [ ] Auth / permissions
- [ ] Données personnelles
- [x] Intégrations externes — support de GitLab (`glab`) en plus de GitHub (`gh`)
- [x] Tâches de fond — pipeline CI GitLab en plus de GitHub, appelant les mêmes scripts

## Agents requis
- [x] spec-reader
- [x] architect — a posé le principe « la logique vit dans `tools/`, pas dans
      le YAML » qui rend le bi-forge quasi gratuit
- [ ] security-reviewer
- [ ] ux-ui-designer
- [x] backend-developer — `tools/update_kit.sh`, `.gitlab/ci/hygiene.yml`
- [ ] frontend-developer
- [ ] test-engineer — pas de suite automatisée pour un script shell de
      synchronisation git ; validation par exécution réelle sur un clone
      jouant un projet divergent (voir « Validation effectuée »)
- [x] code-reviewer
- [x] doc-writer

## Description
Deux manques comblés dans le même lot : le kit ne savait vivre que sur
GitHub (CI, commande `/release`) alors que les projets professionnels visés
sont souvent sur GitLab ; et un projet issu du kit n'avait aucun moyen de
récupérer ses évolutions ultérieures — un template GitHub ne crée aucun lien
git, rien ne descend, rien ne remonte. `tools/update_kit.sh` répond au
second point en distinguant fichiers **gelés** (fournis par le kit, jamais
modifiés sur place) et **personnalisés** (jamais touchés par la
synchronisation).

## Contexte
Le kit n'existait jusque-là que pour GitHub, et une fois copié dans un
projet, devenait un « cul-de-sac » : aucune amélioration faite dans le kit
n'atteignait plus jamais les projets qui en descendaient. Les deux défauts
sont liés : combler le second (`update_kit.sh`) suppose de savoir quels
fichiers sont gelés dans **les deux** forges, donc de traiter GitHub et
GitLab en même temps plutôt que d'ajouter GitLab après coup.

## Comportement livré

### Support GitLab
- `.gitlab/ci/hygiene.yml` — variante GitLab CI des contrôles d'hygiène,
  écrite pour **s'inclure** dans un `.gitlab-ci.yml` existant, jamais pour le
  remplacer : une chaîne de déploiement en place ne doit pas être touchée.
- Les deux pipelines (`hygiene-specs.yml` côté GitHub, `hygiene.yml` côté
  GitLab) appellent les **mêmes scripts** `tools/check_specs.sh` et
  `tools/check_doc_links.sh` : le support bi-forge est quasi gratuit parce que
  la logique n'a jamais vécu dans le YAML.
- `.claude/commands/release.md` couvre `gh` **et** `glab`, avec la consigne
  explicite de supprimer la variante inutilisée — et la commande entière si
  la chaîne CI publie déjà les releases sur tag, pour éviter deux mécanismes
  de publication qui s'ignorent.
- `.claude/settings.json` : entrées `glab` en miroir des entrées `gh`.
- `README.md` : étape « Choisir sa forge » ajoutée à la procédure de démarrage.

### `tools/update_kit.sh` (version initiale)
- Recrée à la demande le lien manquant vers le kit, via un distant nommé
  `kit`.
- Ne rapatrie que les fichiers **gelés** : agents génériques, skills
  partagées, `tools/`, templates de specs, `GUIDE.md`.
- Ne touche **jamais** aux fichiers **personnalisés** : `CLAUDE.md`, la skill
  `dev-workflow`, `.claude/settings.json`, les pipelines de CI, la mémoire de
  projet, les agents métier propres au projet.
- Les deux pipelines d'hygiène sont un **cas à part** : contenu jamais
  personnalisé donc écrasable sans risque, mais rapatriés **seulement s'ils
  existent déjà** dans le projet — sinon `update_kit.sh` réinstallerait
  `.github/` dans un projet purement GitLab, et inversement.
- Garde d'arbre de travail sale, systématique à ce stade (assouplie ensuite
  pour `--dry-run` par feature-005).

## Comportement actuel (avant ce travail)
Le kit ne vivait que sur GitHub. Un projet créé depuis le kit n'avait aucun
moyen de récupérer une amélioration ultérieure d'un agent, d'un script ou
d'un template : le lien avec le dépôt d'origine se rompait à la copie.

## Contraintes techniques
- Portable bash 3.2 (macOS) — pas de `declare -A` ni `mapfile`
- La variante GitLab de la CI doit s'inclure dans un pipeline existant, pas
  le remplacer
- Deux catégories de fichiers strictement disjointes (gelés / personnalisés),
  jamais de zone grise laissée à l'appréciation du script

## Fichiers concernés
- `tools/update_kit.sh` — [nouveau]
- `.gitlab/ci/hygiene.yml` — [nouveau]
- `.claude/commands/release.md` — ajout du support `glab`
- `.claude/settings.json` — entrées `glab`
- `README.md`, `GUIDE.md` — documentation du choix de forge et du mécanisme
  de synchronisation
- `CHANGELOG.md` — entrée `[0.3.0]`

## Livrables — check-list
- [x] A1 — `.gitlab/ci/hygiene.yml`, inclusion dans un pipeline existant
- [x] A2 — `/release` couvre `gh` et `glab`, consigne de suppression si la CI publie déjà
- [x] A3 — `tools/update_kit.sh` : distinction gelés / personnalisés
- [x] A4 — Chemins conditionnels pour les pipelines d'hygiène (rapatriés
      seulement si déjà présents)
- [x] C1 — `README.md`/`GUIDE.md` : étape « Choisir sa forge »

## ADR attendu ?
- **Probable** : non pour ce lot précis — la décision structurante
  (« la logique des contrôles vit dans `tools/`, pas dans le YAML ») avait
  déjà été prise avant ce lot ; ce commit en récolte le bénéfice, il ne la
  prend pas
- **Sujet pressenti** : aucun ADR dédié trouvé dans `docs/adr/` pour ce commit

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- Aucun

### Écrans / flux UI concernés
- Aucun

### Documentation produite / mise à jour
- `CHANGELOG.md` `[0.3.0]` — sections « Deux forges » et « Propagation kit → projets »
- `README.md` — étape « Choisir sa forge »
- `GUIDE.md` — mécanisme `update_kit.sh`

## Critères d'acceptation
- [x] La CI GitLab appelle les mêmes scripts que la CI GitHub, sans dupliquer
      de logique
- [x] `update_kit.sh` ne touche jamais un fichier personnalisé
- [x] `update_kit.sh` refuse de s'exécuter sur un arbre de travail sale
- [x] Les pipelines d'hygiène ne sont rapatriés que s'ils existent déjà dans
      le projet cible
- [ ] Suite de tests automatisée pour `update_kit.sh` — non applicable à ce
      lot (script shell de synchronisation git, validé par exécution réelle)

## Validation effectuée (à la place du plan de test manuel)
1. Script exécuté sur un clone jouant le rôle d'un projet ayant divergé du
   kit : la garde d'arbre sale a bloqué comme attendu.
2. `CLAUDE.md` personnalisé du clone a survécu à la synchronisation.
3. Un agent gelé modifié dans le kit s'est réaligné dans le clone, et lui
   seul a été indexé par `git add`.

## Notes pour agent
- Ce lot est la **version initiale** d'`update_kit.sh`. Quatre défauts réels
  ont été trouvés lors de sa **première utilisation dans un projet réel**,
  après ce commit — ils sont documentés et corrigés dans feature-005, pas
  ici, pour ne pas mélanger ce qui a été livré à cette date avec ce qui a été
  corrigé ensuite.
- La distinction gelés/personnalisés posée ici est la fondation sur laquelle
  `.kit-paths` (feature-005) vient se greffer comme mécanisme de dérogation.

## Hors périmètre
- La liste `.kit-paths` et l'assistant d'installation du centre de contrôle —
  voir feature-005
- Le contenu de `security-checklist`/`db-migrations` adapté à GitLab — non
  demandé, non livré
