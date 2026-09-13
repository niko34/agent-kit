## Métadonnées
- **ID** : feature-006
- **Slug** : tests-de-update-kit
- **Type** : feature
- **Statut** : todo
- **Priorité** : critique
- **Version cible** : 0.6.0
- **Dernière mise à jour** : 2026-09-12
- **Spec(s) liée(s)** : feature-004 et feature-005 (le script et ses quatre
  défauts), bug-001 (le harnais minimal livré en avance), feature-012 /
  feature-013 / feature-014 (les trois lots suivants), bug-003 (consommateur
  futur du harnais)

> **Lot 1 sur 4.** Cette spec demandait à l'origine 17 garanties, 4 cas
> limites, l'extraction d'un harnais, deux jobs de CI et une section de
> `GUIDE.md` — soit ~24 cas de test neufs, six fois le lot de bug-001, qui
> avait déjà coûté deux boucles de correction. Découpée le 2026-09-12 sur
> recommandation convergente de `spec-reader` et d'`orchestrator`, décision
> validée par l'utilisateur. Les garanties 3 à 13 et 17 sont parties sur
> `feature-012`, `feature-013` et `feature-014`. **Aucun livrable n'est
> perdu** — la répartition est tracée en fin de spec.
>
> Ce lot est **habilitant** : il livre le harnais partagé *et* le contrôle
> d'intégration continue, donc les trois lots suivants sont protégés dès leur
> première ligne.

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
      personnelles, ni migration. **Rôle AUDIT obligatoire en fin de cycle**
      en revanche : ce lot crée une surface neuve — un harnais qui exécute
      réellement `git` et `update_kit.sh` sur le poste, et deux jobs de CI qui
      font de même sur un runner
- [ ] ux-ui-designer
- [x] backend-developer
- [ ] frontend-developer
- [x] test-engineer — validation par mutation, un mutant par cas neuf
- [x] code-reviewer
- [x] doc-writer

## Description
Extraire un harnais de test partagé (`tests/harnais_kit.py`), couvrir les cinq
**gardes d'usage** de `tools/update_kit.sh` — celles qui décident si le script
s'exécute ou refuse — et câbler un contrôle d'intégration continue qui exécute
`tests/` sur les deux forges.

## Contexte
`update_kit.sh` est **le composant le plus dangereux du kit** : le seul qui
écrase des fichiers suivis dans le dépôt de quelqu'un d'autre. Ses cinq défauts
connus ont tous été trouvés à la main, aucun par relecture.

Deux faits établis lors du cycle bug-001 motivent l'ordre de ce lot.

**Aucune CI n'exécute `tests/` aujourd'hui.** `.github/workflows/hygiene-specs.yml`
a 3 jobs (unicité des specs, liens, profils Copilot) ; `.gitlab/ci/hygiene.yml`
en a **2** — le contrôle Copilot n'y existe pas. Ni les 9 cas de
`test_sync_copilot_agents.py`, ni les 4 de `test_update_kit.py` ne tournent
ailleurs qu'en local, à la main. Le job livré ici n'est donc pas une garantie
marginale de plus : c'est le premier qui fait exécuter `tests/` **tout court**.

**Le harnais est une surface dangereuse en soi.** La revue de bug-001 a
reproduit un cas où, `GIT_DIR` étant positionné, la suite **committait
`GUIDE.md` dans le vrai dépôt**. Le confinement neutralisait la configuration
git mais pas les variables qui redirigent git lui-même. C'est pourquoi ce lot
couvre les sorties d'erreur du script **avant** que vingt cas ne s'appuient sur
le harnais — l'inverse de ce qui s'est passé sur bug-001, où le défaut n'a été
trouvé qu'en revue, après coup.

## Comportement attendu

### Le harnais partagé
`tests/harnais_kit.py` [nouveau], extrait de `tests/test_update_kit.py` sans
changer le comportement des 4 cas existants. Il fabrique deux dépôts git
jetables (un faux kit, un faux projet avec un distant `kit` local), sans
réseau, sous `tempfile.TemporaryDirectory`, et nettoie même en cas d'échec.

**Le confinement est un invariant, pas une précaution.** La liste des variables
neutralisées doit être conservée **intégralement** à l'extraction :
`GIT_CONFIG_GLOBAL`, `GIT_CONFIG_NOSYSTEM`, `GIT_DIR`, `GIT_WORK_TREE`,
`GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`,
`GIT_COMMON_DIR`, `GIT_CEILING_DIRECTORIES`.

Il expose les primitives dont les lots 2 à 4 **et** `bug-003` auront besoin,
pour qu'aucun d'eux n'ait à le rouvrir : écrire un `.kit-paths`, créer un
`.github/` avec un faux `sync_copilot_agents.py`, salir l'arbre de travail,
rendre un fichier non inscriptible, poser `skip-worktree` / `assume-unchanged`.

### Les cinq gardes d'usage
Un cas par garantie, nommé d'après elle :

| # | Garantie |
|---|---|
| 1 | Arbre sale → la synchronisation réelle refuse, code de sortie non nul |
| 2 | Arbre sale → `--dry-run` s'exécute quand même, code 0 |
| 14 | Aucun distant `kit` → message explicite, code de sortie non nul |
| 15 | Hors dépôt git → code de sortie non nul |
| 16 | Projet déjà aligné → message « rien à récupérer », code 0 |

⚠️ **Ces cinq gardes se recouvrent structurellement** : 1 et 2 portent sur la
même garde vue sous deux angles ; 14, 15 et 16 sortent toutes avant la
classification. Le chevauchement n'est pas accidentel ici, il est inhérent —
c'est exactement la configuration qui, sur bug-001, a laissé un test passer
pour la mauvaise raison. Pour **chaque** cas, il faut démontrer qu'une **seule**
garde peut le faire échouer.

### Le harnais exécute le script du kit
Invariant testé : le harnais lance toujours `REPO_ROOT/tools/update_kit.sh`, et
**jamais** la copie présente dans le faux projet. Sans cette garantie, dès
qu'un lot synchronisera `tools/update_kit.sh` dans le faux projet, on testerait
bash en train de s'auto-écraser pendant sa propre lecture au lieu du
comportement voulu.

### Le contrôle d'intégration continue
Un job **distinct**, sur les deux forges, exécutant
`python3 -m unittest discover -s tests`.

**Distinct, et non une extension des jobs existants** : mesure prise le
2026-09-12 — 4 cas en 0,30 s, soit ~75 ms par cas, chacun fabriquant deux
dépôts git réels. Les quatre lots visent ~24 cas, donc ~2 s pour ce seul
fichier. Le budget annoncé des contrôles d'hygiène est « une seconde, sans
toolchain ni cache » (`GUIDE.md`). La question est donc tranchée d'avance, elle
n'est pas laissée à `architect`.

⚠️ L'image GitLab actuelle (`alpine:3.20`) n'a **ni `git` ni `python3`** : le
job échouerait au premier commit. À traiter.

⚠️ **Parité des forges** : le contrôle Copilot (`sync_copilot_agents.py
--check`) existe côté GitHub et pas côté GitLab. Ce lot le comble — c'est le
lot CI, et le bloc fait cinq lignes.

### Cas limites
- Suite lancée sans `git` dans le `PATH` → message exploitable, pas une trace
  illisible.
- Suite lancée avec `GIT_DIR` pointé sur le dépôt réel → celui-ci reste intact.

## Comportement actuel
`tests/test_update_kit.py` porte 4 cas, livrés par bug-001 — mais qui couvrent
des garanties **absentes** du tableau d'origine (l'aperçu comme récapitulatif
d'opérations, la garde d'écrasement des non suivis, le rejet d'argument
inconnu). Établi par deux lectures indépendantes : **aucune des 17 garanties
d'origine n'est couverte au sens strict**. Aucune CI n'exécute `tests/`.

## Contraintes techniques
- **Aucune dépendance à installer** (ADR-0006) : bibliothèque standard,
  `git`, `python3`.
- **Portable bash 3.2** pour toute partie en shell — ni `declare -A`, ni
  `mapfile`.
- Les tests ne touchent **jamais** au dépôt réel.
- Les 3 jobs d'hygiène existants restent sous la seconde ; le contrôle de
  tests est un job à part.
- **Le script testé n'est pas réécrit pour arranger les tests.** Une seule
  exception est prévue et doit être justifiée par écrit : voir S1.

## Fichiers potentiellement concernés
- `tests/harnais_kit.py` — [nouveau] le harnais partagé
- `tests/test_update_kit.py` — importe le harnais, reçoit les 5 cas neufs
- `tools/update_kit.sh` — **liste `CHEMINS` uniquement** (voir S1)
- `.github/workflows/hygiene-specs.yml` — job de tests
- `.gitlab/ci/hygiene.yml` — job de tests + parité du contrôle Copilot
- `GUIDE.md`, `CHANGELOG.md`, `README.md`

## Livrables — check-list
- [x] H1 — `tests/harnais_kit.py` extrait ; les 4 cas existants restent verts
      et inchangés dans leur comportement
- [x] H2 — Primitives pour les lots suivants et pour bug-003 : `.kit-paths`,
      `.github/` + faux `sync_copilot_agents.py`, arbre sali, fichier non
      inscriptible, `skip-worktree`
- [x] H3 — Invariant testé : le harnais exécute le script du **kit**, jamais la
      copie du faux projet
- [x] H4 — Cas automatisé de confinement : après la suite, `HEAD`, l'index, les
      distants et l'arbre du dépôt réel sont inchangés, y compris sous `GIT_DIR`
- [x] G1 — Garantie 1 : arbre sale → réel refuse, code non nul
- [x] G2 — Garantie 2 : arbre sale → `--dry-run` passe, code 0
- [x] G14 — Garantie 14 : aucun distant `kit` → message explicite, code non nul
- [x] G15 — Garantie 15 : hors dépôt git → code non nul
- [x] G16 — Garantie 16 : déjà aligné → « rien à récupérer », code 0
- [x] S1 — `tests/harnais_kit.py` ajouté aux `CHEMINS` de `tools/update_kit.sh`,
      **avec justification écrite** dans les notes d'implémentation
- [x] C1a — Job CI GitHub distinct exécutant `tests/`
- [x] C1b — Job CI GitLab équivalent, sur une image dotée de `git` **et** `python3`
- [x] C1c — Parité GitLab du contrôle Copilot, ou refus justifié par écrit
- [x] C2 — `GUIDE.md` (pourquoi un job distinct), `CHANGELOG.md`, `README.md`
- [x] D1 — Mutation : chaque cas neuf vu **mourir**, mutant nommé ; tout
      survivant démontré équivalent, jamais déclaré tel
- [x] D2 — Anti-chevauchement : pour chaque cas, démontrer qu'une **seule**
      garde peut le faire échouer

## Sécurité & données
- Authentification touchée : non
- Permissions / rôles touchés : non
- Données personnelles : non
- Migration destructive : non applicable
- Nouvelle exposition publique : non
- Risque identifié : **le harnais exécute le script testé**, et deux runners de
  CI vont désormais en faire autant. Un cas mal confiné ferait tourner une
  synchronisation réelle sur le dépôt courant — le défaut a déjà été reproduit
  une fois sur bug-001. Le rôle **AUDIT** est demandé en fin de cycle sur cette
  surface neuve.

## ADR attendu ?
- **Probable** : non — ajouter des tests ne verrouille aucun choix.
- **Critère(s) candidat(s)** : aucun a priori. Si `architect` conclut qu'un
  invariant n'est testable qu'en modifiant la conception du script, ce choix
  relèverait du critère 1.
- **Sujet pressenti** : aucun

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- Aucun

### Écrans / flux UI concernés
- Aucun

### Documentation à produire / mettre à jour
- `GUIDE.md` — section sur les contrôles d'hygiène : le quatrième contrôle et
  **pourquoi il est un job distinct** plutôt qu'une extension du budget
- `CHANGELOG.md` — entrée sous 0.6.0 : ce qui change pour un humain, c'est
  qu'une CI exécute enfin `tests/`
- `README.md` — si la commande de lancement des tests change
- Ni `docs/API.md`, ni `docs/features/`, ni `docs/subsystems/` : aucune surface
  UI, aucun endpoint, aucun module backend

## Critères d'acceptation
- [x] Les cinq gardes d'usage ont chacune leur cas, nommé d'après elle
- [x] Chaque cas neuf a été **vu mourir** sur une mutation qui le vise
- [x] Pour chaque cas, une **seule** garde du script peut le faire échouer
- [x] Le harnais exécute le script du kit, jamais la copie du faux projet
- [x] La suite ne touche jamais au dépôt qui l'exécute, `GIT_DIR` compris
- [x] `tests/harnais_kit.py` figure dans les `CHEMINS` — sans quoi un projet
      consommateur reçoit un test qui importe un module absent
- [x] Les deux forges exécutent réellement `tests/`
- [x] Les 3 jobs d'hygiène existants restent sous la seconde
- [x] Suite complète verte, zéro régression sur les 13 cas existants
- [x] Lint propre (`shellcheck`), pas de warning nouveau

## Plan de test manuel
1. **Nominal** : lancer la suite sur une machine propre, sans distant `kit`
   configuré dans le dépôt courant — elle doit passer.
2. **Confinement** : modifier un fichier suivi du dépôt réel, lancer la suite,
   vérifier par `git status` que rien d'autre n'a bougé. Recommencer avec
   `GIT_DIR=/root/agent-kit/.git`.
3. **Mutation témoin** : retirer `[ "$SIMULATION" -eq 0 ]` de la garde d'arbre
   sale — c'est le défaut 1 de feature-005 réintroduit — et constater que le
   cas G2 meurt.
4. **Erreur** : lancer la suite sans `git` dans le `PATH`.

## Notes pour agent
- **La leçon du 2026-09-12 s'applique ici en premier lieu** : sur ce script, la
  relecture n'a jamais rien trouvé, l'exécution a tout trouvé. Un cas jamais vu
  échouer ne prouve rien.
- Sur bug-001, un `.gitignore` non committé faisait déclencher la garde d'arbre
  sale **avant** celle qu'on croyait tester : le cas passait pour la mauvaise
  raison, et aucun mutant ne mourait. Les cinq gardes de ce lot sont dans la
  même configuration. D2 n'est pas une formalité.
- `bug-003` attend de ce lot une primitive « poser `skip-worktree` » pour ne pas
  avoir à rouvrir le harnais. La **garde** correspondante reste à sa charge.

## Répartition des livrables d'origine — rien n'est perdu

| Item d'origine | Destination |
|---|---|
| A1 harnais | **lot 1** (H1, H2) |
| A2 — garanties 1, 2 | **lot 1** (G1, G2) |
| A2 — garanties 3, 4 | feature-013 |
| A3 — garanties 5, 6, 7 | feature-012 |
| A4 — garanties 8, 9 | feature-013 |
| A4 — garantie 10 | feature-014 |
| A5 — garanties 11, 12 | feature-014 |
| A6 — garanties 14, 15, 16 | **lot 1** (G14, G15, G16) |
| A6 — garantie 17 | feature-012 |
| A6 — garantie 13 | feature-014 |
| A7 — `.kit-paths` vide, chemin absent du kit, espace | feature-012 |
| A7 — `git checkout` en échec | feature-014 |
| C1, C2 — CI et docs | **lot 1** |
| D1 — validation par mutation | **dans chaque lot**, jamais différée |
| Audit (a) — harnais → script du kit | **lot 1** (H3) |
| Audit (b) — `.kit-paths` CRLF / espace | feature-012 |
| Audit (c) — état après un checkout partiel | feature-014 |

## Hors périmètre
- Les garanties 3 à 13 et 17 — feature-012, feature-013, feature-014
- La garde `skip-worktree` — `bug-003` (ce lot n'en livre que la primitive de test)
- L'ordonnancement de la régénération Copilot — `feature-011`
- Toute évolution fonctionnelle d'`update_kit.sh` autre que S1

---
# Notes d'implémentation

## Plan (architect)

- Le harnais devient le seul endroit où l'on **fabrique, confine, exécute et
  observe** ; chaque cas déclare quelle garde il vise, et la suite refuse de
  passer si une autre a parlé.
- **Python, pas shell** — argument décisif et non préférence : le confinement
  est un dictionnaire **construit une fois**, donc testable en un point ; en
  bash 3.2 il redeviendrait un `env -u …` répété à chaque appel, et une seule
  omission rejouerait le défaut de bug-001 sans que rien ne le détecte.
- **Frontière harnais / cas** : le harnais fabrique, confine, exécute et
  observe ; le fichier de test affirme le métier. Les primitives sont écrites
  **maintenant**, signatures gelées, chacune auto-contrôlée — une primitive
  livrée sans consommateur *et* sans auto-contrôle est du code mort qui ment.
- **Un seul site d'appel** pour le rendu ; `affirmer_seule_garde()` comme
  réponse mécanique au chevauchement ; **matrice de mutation diagonale** comme
  critère de clôture.
- ADR : **ADR-0012 requis**, quatre critères sur quatre.

## Validation security-reviewer

- **Rôle GATE** : non applicable (ni auth, ni permissions, ni données
  personnelles, ni paiement, ni migration). Confirmé par `spec-reader`,
  `orchestrator` et `architect`.
- **Rôle AUDIT** : **deux passages**. Le premier, au milieu du cycle, a produit
  trois constats dont le grave sur `G15` et la découverte de trois canaux de
  contournement du confinement. Le second, en fin de cycle, parce que le code
  de confinement avait entre-temps beaucoup changé et que le premier ne
  l'avait jamais vu.

## Implémentation

- **Fichiers créés** : `tests/harnais_kit.py` (harnais partagé, **16 variables
  d'environnement maîtrisées** : 13 retirées par liste, 2 positionnées vers une
  configuration vide — on ne neutralise pas une config globale en retirant la
  variable — et `GIT_CONFIG_SYSTEM` retirée à part, `MARQUEURS_DE_GARDE`, `affirmer_seule_garde`, `empreinte_depot`,
  `env_hors_depot`, 5 primitives) ; `tests/test_harnais_kit.py` (auto-contrôles,
  confinement éprouvé variable par variable, H3, H4).
- **Fichiers modifiés** : `tests/test_update_kit.py` (import du harnais, + G1,
  G2, G14, G15, G16) ; `tools/update_kit.sh` (**deux** modifications de fond) ;
  les deux fichiers de CI ; `GUIDE.md`, `CHANGELOG.md`.
- **Choix d'implémentation** : le garde-fou d'existence des fichiers de test
  dans la CI est un `if/then/else` explicite et **non** un `A && B || echo` —
  ce dernier aurait aussi masqué un véritable échec de test. Vérifié par
  contre-épreuve : un mutant posé dans le script fait bien sortir l'étape en 1.

## Tests (test-engineer)

- Suite complète : **40/40 verts** (13 préexistants + 27 neufs), ~0,94 s.
- **Matrice de mutation 5×5 : diagonale**, après correction. Chaque mutant ne
  tue que son propre cas.
- **Confinement éprouvé variable par variable** : **12 des 13** variables de la
  liste ont un cas dédié avec un décoy dont l'effet serait observable en cas de
  fuite ; retirer une variable tue son cas homonyme, **et lui seul**.
- **Deux exceptions documentées**, pas masquées :
  - `GIT_CEILING_DIRECTORIES` n'a pas de décoy — aucune commande du harnais ne
    remonte l'arborescence, le `cwd` étant toujours déjà une racine de dépôt.
    Elle est éprouvée là où elle agit réellement, dans `G15`.
  - la boucle de préfixes `GIT_CONFIG_KEY_*`/`VALUE_*` est un **mutant
    équivalent déclaré** : sans `GIT_CONFIG_COUNT`, ces clés sont inertes pour
    git. Redondance défensive, jamais comptée comme tuée.
- Lint : `shellcheck` 0.10.0 — un seul SC2086, préexistant à l'identique dans
  `HEAD`, 0 nouveau.

## Revue (code-reviewer)

- **Trois verdicts successifs** : Request changes (défaut bloquant) → Request
  changes (trois points neufs) → **Approved**.
- Chaque point a été **reproduit** par le relecteur, jamais accepté sur
  déclaration — y compris la contre-épreuve du garde-fou de CI.

## Doc (doc-writer)

- `docs/adr/0012-harnais-de-test-partage-et-doctrine-anti-chevauchement.md` — créé
- `docs/adr/README.md` — index
- `GUIDE.md` — quatrième contrôle d'hygiène, et **pourquoi il est hors budget**
- `CHANGELOG.md` — entrée `[0.6.0]`, avec l'action manuelle `.kit-paths`
- Notes ajoutées à `feature-012`, `feature-013`, `feature-014` et `bug-003` :
  harnais disponible, obligation ADR-0012 (marqueur + matrice diagonale)

## Défauts réels trouvés pendant ce cycle

Six, et **aucun par relecture**.

1. **La garde « hors dépôt git » était du code mort.** `cd ""` réussit
   silencieusement en bash, donc le `|| exit 1` ne se déclenchait jamais. Le
   message existait depuis feature-004 et n'avait jamais pu s'afficher. Trouvé
   par la **matrice de mutation** : un mutant tuait deux cas, un autre n'en
   tuait aucun.
2. **`G15` s'échappait du répertoire temporaire.** `GIT_CEILING_DIRECTORIES`
   n'est honoré par git que s'il est un ancêtre **strict** du `cwd` ; il était
   posé sur le `cwd`. Reproduit **deux fois indépendamment** — par la revue
   (`GUIDE.md` écrasé dans un dépôt englobant) et par l'audit (**24 fichiers
   indexés** dans un dépôt consommateur).
3. **Quatre canaux contournaient le confinement.** `GIT_CONFIG_PARAMETERS`
   (injection de `core.hooksPath`, donc exécution d'un hook `pre-commit`),
   `GIT_CONFIG_COUNT`/`KEY_n`/`VALUE_n` (`core.fsmonitor`), `GIT_TEMPLATE_DIR`
   (hooks recopiés par `git init`), `GIT_EXEC_PATH`. La liste de neuf variables
   était réputée complète.
4. **La neutralisation n'était éprouvée par aucun test.** Retirer n'importe
   laquelle des variables ne tuait rien : aucun cas ne les positionnait en
   ambiant. La protection marchait sans que rien ne garantisse qu'elle
   continuerait.
5. **Le test de confinement ne prouvait que le chemin le plus court.** Il
   rejouait un cas qui refuse sur arbre sale — le script s'arrêtait donc avant
   d'écrire. Le confinement n'était éprouvé qu'en lecture seule.
6. **Le job de CI aurait cassé la CI des consommateurs.** Les fichiers de CI
   descendent chez eux ; `discover` y aurait collecté **leurs** tests dans une
   image dépourvue de leurs dépendances. Et `test_harnais_kit.py` n'étant pas
   dans les `CHEMINS`, le motif n'aurait rien matché — `unittest` sort en code
   **5** depuis Python 3.12, donc job rouge à perpétuité.

## Écarts assumés par rapport à la spec initiale

1. **La spec a été réduite au lot 1** et découpée en quatre, sur recommandation
   convergente de `spec-reader` et d'`orchestrator`, décision validée par
   l'utilisateur. Motif : ~24 cas neufs, six fois le lot de bug-001, sur le
   composant où la revue avait déjà trouvé que le harnais écrivait dans le vrai
   dépôt. Répartition tracée en fin de spec, vérifiée mécaniquement : 17/17
   garanties couvertes, aucune en double.
2. **`S1` s'est élargi deux fois** : d'abord à `tests/harnais_kit.py`, puis à
   `tests/test_harnais_kit.py`. Sans quoi la CI des consommateurs devenait
   rouge à perpétuité.
3. **Une garde du script a été réparée**, au-delà du S1 annoncé. La spec
   interdisait toute évolution fonctionnelle d'`update_kit.sh` hors S1.
   Justification : un test nommé d'après la garantie 15 ne pouvait pas la
   couvrir tant que la garde était morte — il aurait menti sur ce qu'il
   protège, exactement le défaut que ce lot existe pour éliminer. Même
   raisonnement que la garde d'écrasement de bug-001.
4. **Une justification de non-testabilité a été réfutée par l'exécution.**
   `GIT_EXEC_PATH` avait été déclarée non éprouvable avec un argument ; la revue
   a écrit le cas et il fonctionne. Leçon retenue : une justification de
   non-testabilité ne vaut que si quelqu'un a **essayé** de la réfuter.

## Addendum — incident du 2026-09-12

- **Déclencheur** : `backend-developer` a exécuté la mutation du test de
  confinement **contre le dépôt réel**.
- **Ce qui s'est passé** : commit involontaire dans `/root/agent-kit`, distant
  `kit` ajouté, identité git écrasée. **Rien n'a été poussé.**
- **Réparation vérifiée par l'agent principal** : commit annulé (`HEAD` revenu
  à `189ad9f`), distant retiré, identité restaurée — la « réparation » de
  l'agent était elle-même fautive, ayant *ajouté* un `user.name` qui n'existait
  pas. `GUIDE.md` vérifié intact.
- **Cause de fond** : muter un test de confinement revient à **autoriser
  délibérément le harnais à détruire**. Rien dans le kit ne disait de le faire
  sur un clone jetable. La consigne a été imposée à tous les agents suivants et
  respectée ensuite (un écart mineur, signalé spontanément par `test-engineer`,
  sans commande git donc sans dégât).

## Addendum — itération du 2026-09-13 (matrice non diagonale)

- **Déclencheur** : la première matrice de mutation n'était pas diagonale.
- **Hypothèse invalidée** : « `G15` teste la garantie 15 ». Faux — la garde
  était morte, et `G15` retombait sur celle du distant absent.
- **Résultat** : garde réparée, matrice diagonale, et un sixième défaut réel
  d'`update_kit.sh` documenté.

## Addendum — itération du 2026-09-13 (le confinement était insuffisant)

- **Déclencheur** : revue **Request changes** avec défaut bloquant reproduit,
  et second constat grave de l'audit sur le même objet.
- **Hypothèse invalidée** : « le confinement est complet à neuf variables ». Il
  en fallait treize, d'une famille qu'on n'avait pas envisagée — celles qui
  injectent de la **configuration** git plutôt que de rediriger des chemins.
- **Résultat** : 13 variables dans la liste, 12 éprouvées par décoy, 1 exception
  documentée (`GIT_CEILING_DIRECTORIES`, éprouvée là où elle agit, dans `G15`).
  42 tests.

## Addendum — itération du 2026-09-13 (second audit : deux canaux de plus)

- **Déclencheur** : second passage du rôle AUDIT, demandé parce que le premier
  avait tourné au milieu du cycle et n'avait jamais vu le code de confinement
  réécrit depuis.
- **Hypothèse invalidée** : « la liste est complète à onze ». Deux canaux
  neufs, reproduits :
  - **`GIT_CONFIG`** — honorée par `git config` dès qu'aucun `--file`/`--local`
    n'est passé, ce que le harnais fait deux fois par dépôt. Pointée sur le
    `.git/config` du dépôt réel, elle reproduit **exactement** le dégât
    `user.name`/`user.email` de l'incident : le mécanisme était encore
    atteignable par un autre chemin que celui qu'on avait bouché.
  - **`GIT_TEST_FSMONITOR`** — malgré son nom, un chemin d'exécution réel du
    binaire git : une commande lancée à **chaque `git status`**, y compris
    celui du script.
- **Trouvé aussi, à coût nul** : `empreinte_depot` lisait la configuration
  locale en clair, donc le `http.extraheader` d'un runner — le **jeton
  d'authentification** du checkout — entrait dans le tuple comparé. Il
  n'apparaissait pas dans les messages d'échec, mais seulement grâce à la
  troncature d'`unittest`, par accident et non par conception. `config_locale`
  et `distants` sont désormais hachés, à pouvoir de détection identique.
- **Résultat** : 42 tests. Et une limite qu'il faut nommer : **on ne peut pas
  prouver qu'une liste de variables d'environnement est complète.** On peut
  seulement chercher jusqu'à ce que chercher ne rapporte plus. Le rendement a
  baissé à ce tour — les deux canaux appartiennent à une famille déjà connue
  (configuration git injectée par l'environnement), là où le tour précédent en
  avait ouvert une neuve. La liste est **défensive, pas exhaustive**, et
  l'ADR-0012 doit le dire.

## Statut final

✅ **Done — 2026-09-13.** Cycle complet : `orchestrator` → `spec-reader`
(qui a refusé de promouvoir, imposant le découpage) → découpage en 4 lots
validé par l'utilisateur → `architect` → `backend-developer` → `test-engineer`
→ `code-reviewer` → `security-reviewer` (rôle AUDIT, **deux passages**) →
`doc-writer`. **Cinq boucles de correction**, toutes consignées en addendums.

Relevés de clôture : **42/42 tests verts** (13 préexistants + 29 neufs, ~1,2 s)
· matrice de mutation 5×5 **diagonale**, vérifiée trois fois · confinement
éprouvé **variable par variable**, 12 décoys sur 13 entrées de liste, la
treizième justifiée par écrit · 1 équivalence de mutation **déclarée**, jamais
comptée comme tuée · `shellcheck` 0 warning nouveau (1 préexistant, identique à
`HEAD`) · `check_specs.sh`, `check_doc_links.sh` et `sync_copilot_agents.py
--check` verts · dépôt réel intact après chaque passage, vérifié par l'agent
principal.

**Les deux forges exécutent enfin `tests/`** — c'est le premier contrôle qui le
fait, et la parité du contrôle Copilot est comblée côté GitLab.

Six défauts réels trouvés, **aucun par relecture**. Deux d'entre eux
(l'échappement de `G15`, les canaux de contournement du confinement) ont été
trouvés **indépendamment par deux agents**, par deux protocoles différents.

Suite du chantier : `feature-012`, `feature-013`, `feature-014` et `bug-003`
peuvent démarrer — chacune sait qu'elle doit déclarer son marqueur dans
`MARQUEURS_DE_GARDE` et produire une matrice diagonale (ADR-0012).
