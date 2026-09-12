## Métadonnées
- **ID** : feature-006
- **Slug** : tests-de-update-kit
- **Type** : feature
- **Statut** : todo
- **Priorité** : critique
- **Version cible** : 0.6.0
- **Dernière mise à jour** : 2026-09-12
- **Spec(s) liée(s)** : feature-004 (version initiale du script), feature-005
  (les quatre défauts trouvés à la main), bug-001 (le cinquième défaut, dont
  le test de non-régression a besoin du harnais livré ici)

## Domaines touchés
- [ ] API REST (endpoints, contrats, codes d'erreur)
- [ ] Frontend (écrans, composants, appels API)
- [ ] BDD / migrations
- [ ] Auth / permissions
- [ ] Données personnelles
- [ ] Intégrations externes (API tierces, webhooks, e-mail…)
- [x] Tâches de fond — `tools/update_kit.sh` est exécuté à la demande dans le
      dépôt d'un projet consommateur, et y écrase des fichiers **suivis**

## Agents requis
- [x] spec-reader
- [x] architect
- [ ] security-reviewer, rôle GATE — ni auth, ni permissions, ni données
      personnelles, ni migration. **Mais** : le script écrit dans le dépôt
      d'un tiers, et le défaut 2 de feature-005 a failli supprimer un contrôle
      de sécurité d'un projet. Un passage en **rôle AUDIT** est demandé en
      fin de cycle, hors gate — voir « Notes pour agent »
- [ ] ux-ui-designer
- [x] backend-developer — le harnais et les cas de test
- [ ] frontend-developer
- [x] test-engineer — validation par mutation obligatoire sur chaque cas
- [x] code-reviewer
- [x] doc-writer

## Description
Doter `tools/update_kit.sh` d'une suite de tests automatisée, exécutable en
local et en CI, qui construit de vrais dépôts git jetables (un faux kit, un
faux projet consommateur) et vérifie sur eux le comportement du script.
Objectif : que les cinq défauts déjà connus ne puissent plus revenir, et que
les invariants documentés en commentaire deviennent vérifiables.

## Contexte
`update_kit.sh` est **le composant le plus dangereux du kit** : c'est le seul
qui écrase des fichiers suivis dans le dépôt de quelqu'un d'autre. Il n'a
**aucun test**.

Ses cinq défauts connus ont **tous** été trouvés à la main, aucun par
relecture — quatre lors de sa première installation dans un projet réel
(feature-005), un cinquième resté ouvert (bug-001) :

1. `--dry-run` exigeait un arbre propre alors qu'il n'écrit rien ;
2. `.kit-paths` ne gouvernait pas les chemins conditionnels — l'aperçu
   annonçait le remplacement d'un fichier de CI portant un contrôle de
   sécurité absent du kit ;
3. l'aperçu présentait comme modifiables des fichiers que `git checkout` ne
   peut pas toucher ;
4. la régénération Copilot se déclenchait sur la seule présence de
   `.github/`, et échouait après avoir tout écrit correctement ;
5. l'aperçu présente les fichiers **non suivis** comme des suppressions.

Le script porte aujourd'hui environ 120 lignes de commentaires qui décrivent
ses garanties. Aucune n'est vérifiée. Le kit affirme par ailleurs qu'« une
règle que rien ne vérifie n'est pas une règle » (`GUIDE.md`) : c'est
exactement le cas ici, sur le composant où le coût d'un défaut est le plus
élevé, puisqu'il se paie dans un dépôt tiers et sans retour.

## Comportement attendu

### Un harnais qui fabrique de vrais dépôts
Chaque cas de test construit, dans un répertoire temporaire :

- un **faux kit** — dépôt git avec quelques-uns des chemins gelés réels
  (`.claude/agents/`, `tools/check_specs.sh`, `GUIDE.md`…), au moins un commit
  sur `main` ;
- un **faux projet** — dépôt git distinct, avec un distant `kit` pointant sur
  le premier par chemin local, un `CLAUDE.md` personnalisé, et selon le cas
  un `.kit-paths`, un `.github/`, un `control-center/`.

Pas de réseau, pas de dépendance : `git` et l'interpréteur suffisent. Chaque
cas part d'un état neuf et nettoie derrière lui, y compris en cas d'échec.

### Les invariants à couvrir
Un cas de test par garantie, nommé d'après elle :

| # | Garantie | Défaut d'origine |
|---|---|---|
| 1 | Arbre sale → la synchronisation réelle refuse, code de sortie non nul | — |
| 2 | Arbre sale → `--dry-run` s'exécute quand même | feature-005 / 1 |
| 3 | `CLAUDE.md` personnalisé survit intact à une synchronisation | feature-004 |
| 4 | Un chemin gelé modifié dans le kit est réaligné dans le projet | feature-004 |
| 5 | `.kit-paths` présent → seuls ses chemins sont touchés | feature-005 |
| 6 | `.kit-paths` présent → les chemins **conditionnels** sont neutralisés | feature-005 / 2 |
| 7 | `.kit-paths` : `#` commente, lignes vides ignorées | — |
| 8 | Chemin conditionnel absent du projet → non installé | feature-004 |
| 9 | Chemin conditionnel présent → mis à jour | feature-004 |
| 10 | L'aperçu ne liste que des fichiers présents côté kit | feature-005 / 3 |
| 11 | Régénération Copilot : `.github/` sans le script → pas d'échec | feature-005 / 4 |
| 12 | Régénération Copilot : script présent → profils régénérés et indexés | feature-003 |
| 13 | Fichier présent dans le projet, absent du kit → **signalé, conservé** | — |
| 14 | Aucun distant `kit` → message explicite, code de sortie non nul | — |
| 15 | Hors dépôt git → code de sortie non nul | — |
| 16 | Projet déjà aligné → message « rien à récupérer », code 0 | — |
| 17 | Chemin listé deux fois (`.kit-paths` + conditionnel) → traité une fois | feature-005 |

### Cas limites
- Chemin déclaré dans `.kit-paths` mais **absent du kit** : ignoré sans erreur
  (comportement actuel, à figer).
- `.kit-paths` vide ou entièrement commenté : aucun chemin gelé — vérifier que
  le script le dit au lieu de synchroniser silencieusement la liste par défaut.
- Nom de fichier contenant une espace dans un chemin synchronisé : le script
  itère sur des listes non quotées (`for chemin in $CHEMINS`) ; le cas doit
  être **couvert et son résultat constaté**, qu'il soit correct ou documenté
  comme limite connue.
- `git checkout` en échec (permission refusée sur un fichier cible) : le
  script doit sortir en erreur sans laisser le projet à moitié synchronisé,
  ou documenter qu'il ne le garantit pas.

## Comportement actuel
Aucun test. `tests/` ne contient que `test_sync_copilot_agents.py` (9 cas,
pour la passerelle Copilot). La validation d'`update_kit.sh` est exclusivement
manuelle : exécution sur un clone jouant un projet divergent (feature-004),
puis installations réelles dans deux projets (feature-005).

## Contraintes techniques
- **Aucune dépendance à installer** — cohérent avec ADR-0006 pour le reste du
  kit : bibliothèque standard uniquement. Le harnais peut être écrit en
  Python (comme `tests/test_sync_copilot_agents.py`) ou en shell ; `architect`
  tranche, avec un argument explicite.
- **Portable bash 3.2 (macOS)** si le harnais est en shell — ni `declare -A`,
  ni `mapfile`, comme le script testé.
- Les tests ne doivent **jamais** toucher au dépôt réel : tout se passe dans
  un répertoire temporaire, avec `GIT_CONFIG_GLOBAL`/identité git locale au
  dépôt jetable pour ne pas dépendre de la configuration de la machine.
- Durée : la suite doit rester dans le budget des contrôles d'hygiène
  (aujourd'hui « une seconde, sans toolchain ni cache » — `GUIDE.md`). Si
  elle ne peut pas, elle devient un job de CI distinct, pas un
  ralentissement du contrôle existant.
- Le script testé ne doit pas être modifié pour devenir testable sans que le
  changement soit justifié dans les notes d'implémentation : réécrire le sujet
  pour arranger le test est précisément ce qu'on cherche à éviter.

## Fichiers potentiellement concernés
- `tests/test_update_kit.py` ou `tests/test_update_kit.sh` — [nouveau] la suite
- `tests/harnais_kit.py` ou fonctions partagées — [nouveau, si le harnais de
  fabrication des dépôts est extrait]
- `tools/update_kit.sh` — seulement si un invariant s'avère intestable en
  l'état ; toute modification doit être justifiée
- `.github/workflows/hygiene-specs.yml` — quatrième job
- `.gitlab/ci/hygiene.yml` — la variante GitLab, pour que les deux forges
  restent à parité
- `GUIDE.md` — section « Pourquoi la CI vérifie les specs et les liens »,
  à étendre au quatrième contrôle
- `CHANGELOG.md` — entrée sous 0.6.0

## Livrables — check-list
- [ ] A1 — Harnais de fabrication : faux kit + faux projet, dépôts git réels, jetables
- [ ] A2 — Cas 1 à 4 : gardes d'arbre de travail et distinction gelés / personnalisés
- [ ] A3 — Cas 5 à 7 : `.kit-paths`, y compris sa gouvernance des conditionnels
- [ ] A4 — Cas 8 à 10 : chemins conditionnels et fidélité de l'aperçu
- [ ] A5 — Cas 11 et 12 : régénération Copilot, présente et absente
- [ ] A6 — Cas 13 à 17 : orphelins, erreurs d'usage, idempotence, dédoublonnage
- [ ] A7 — Cas limites (chemin absent du kit, `.kit-paths` vide, espace dans un
      nom, `git checkout` en échec) — couverts ou documentés comme limites connues
- [ ] C1 — Quatrième job d'hygiène côté GitHub **et** côté GitLab
- [ ] C2 — `GUIDE.md` et `CHANGELOG.md` à jour
- [ ] D1 — Chaque cas validé par **mutation** : altération volontaire du script,
      vérification que le cas meurt en nommant le défaut

## Sécurité & données
- Authentification touchée : non
- Permissions / rôles touchés : non
- Données personnelles collectées ou traitées : non
- Migration destructive : non applicable
- Nouvelle exposition publique : non
- Risque identifié : **le harnais exécute le script testé**. Un cas mal écrit
  qui oublie de se confiner au répertoire temporaire ferait tourner une
  synchronisation réelle sur le dépôt courant — donc un `git checkout` sur des
  fichiers suivis. Le confinement est à traiter comme un invariant du harnais
  lui-même, pas comme une précaution d'écriture.

## ADR attendu ?
- **Probable** : non
- **Critère(s) candidat(s)** : aucun — ajouter des tests ne verrouille aucun
  choix. Si `architect` conclut qu'un invariant n'est testable qu'en modifiant
  la conception du script (par exemple en extrayant la sélection des chemins
  dans une fonction pure), ce choix-là relèverait du critère 1 et mériterait
  un ADR.
- **Sujet pressenti** : aucun

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- Aucun

### Écrans / flux UI concernés
- Aucun

### Schéma BDD / migrations
- Aucun

### Documentation à produire / mettre à jour

#### Docs vivantes
- Aucune page UI touchée
- Aucun module backend touché

#### Docs transverses
- `GUIDE.md` — le quatrième contrôle d'hygiène et ce qu'il garantit
- `README.md` — si la commande de lancement des tests change pour l'humain
- `CHANGELOG.md` — entrée sous 0.6.0

#### Docs immuables
- Aucun ADR attendu (voir ci-dessus)

## Critères d'acceptation
- [ ] Les cinq défauts connus sont chacun couverts par un cas qui **meurt**
      quand on réintroduit le défaut dans le script
- [ ] Les 17 garanties listées ont chacune leur cas, nommé d'après la garantie
- [ ] La suite s'exécute sans réseau et sans dépendance à installer
- [ ] La suite ne touche jamais au dépôt qui l'exécute — vérifié en la lançant
      sur un arbre de travail volontairement sale, puis en constatant qu'il est
      inchangé
- [ ] La suite tourne dans les deux CI (GitHub et GitLab)
- [ ] Suite de tests complète verte, zéro régression
- [ ] Lint propre, pas de warning nouveau (`shellcheck` si le harnais est en shell)
- [ ] Comportement nominal testé manuellement selon le plan ci-dessous

## Plan de test manuel
1. **Nominal** : lancer la suite sur une machine propre, sans distant `kit`
   configuré dans le dépôt courant — elle doit passer, puisqu'elle fabrique
   ses propres dépôts.
2. **Confinement** : modifier un fichier suivi du dépôt réel, lancer la suite,
   vérifier par `git status` que la modification est toujours là et qu'aucun
   autre fichier n'a bougé.
3. **Mutation témoin** : réintroduire à la main le défaut 1 (rétablir la garde
   d'arbre propre avant le branchement `--dry-run`), constater que le cas 2
   échoue et que son message nomme le défaut, puis rétablir le script.
4. **Erreur** : lancer la suite avec `git` indisponible dans le `PATH` — elle
   doit échouer avec un message exploitable, pas une trace illisible.

## Note — harnais minimal livré par bug-001 (2026-09-12)

L'ordre annoncé plus haut (« le cinquième défaut se corrige après cette
spec ») a été **inversé** : bug-001 a été traité avant feature-006, au motif
que ce défaut détruisait des données et ne pouvait pas attendre les 17 cas
prévus ici. `tests/test_update_kit.py` existe donc déjà, avec un harnais
**minimal** — dépôts kit/projet jetables, confinement git complet (config
globale/système neutralisée **et** variables `GIT_DIR`/`GIT_WORK_TREE`/etc.
neutralisées), sans réseau — et **4 cas** de non-régression, tous liés au
seul défaut de bug-001 :

1. fichier absent du projet classé « à créer », jamais annoncé en suppression ;
2. fichier non suivi divergent signalé dans l'aperçu **et** protégé par la
   garde d'écrasement à l'exécution réelle ;
3. récapitulatif `--dry-run` identique à celui de l'exécution réelle ;
4. argument inconnu (`--dry_run`) rejeté sans déclencher de synchronisation.

**Ce qui reste dû à cette spec, intégralement** : les 17 garanties listées
ci-dessus (le harnais de bug-001 n'en couvre qu'une poignée, indirectement),
les cas limites (chemin absent du kit, `.kit-paths` vide, espace dans un nom,
échec de `git checkout`), l'extraction éventuelle d'un `harnais_kit.py`
partagé, les jobs CI GitHub **et** GitLab, et la section hygiène de
`GUIDE.md`. Aucun livrable de cette spec n'est retiré ni considéré comme
couvert par ce qui précède.

## Notes pour agent
- **La leçon du 2026-09-12 s'applique en premier lieu ici** : sur ce script,
  la relecture n'a jamais rien trouvé, l'exécution a tout trouvé. Un cas de
  test qui n'a pas été vu échouer ne prouve rien — la validation par mutation
  n'est pas une formalité de clôture sur cette spec, c'est son objet.
- Deux garanties étaient **mutuellement redondantes** dans un cas de test du
  centre de contrôle, et aucun mutant ne mourait tant qu'elles partageaient
  un seul cas. Prévoir un cas par garantie, pas un cas qui en couvre trois.
- `security-reviewer` en **rôle AUDIT** est demandé en fin de cycle : pas un
  gate sur ce diff, mais un regard sur ce que le script peut détruire chez un
  tiers. Le défaut 2 de feature-005 a failli supprimer, en silence, un
  contrôle de sécurité d'un projet consommateur — c'est exactement le genre de
  chose qu'aucun diff ne montre.
- Le cinquième défaut (bug-001) se corrige **après** cette spec : son test de
  non-régression a besoin du harnais livré ici.

## Hors périmètre
- La correction du cinquième défaut — voir bug-001
- Toute évolution fonctionnelle d'`update_kit.sh` : cette spec ajoute des
  tests, elle ne change pas ce que le script fait
- Les tests de `control-center/installer.py` — composant distinct, non couvert
  ici
