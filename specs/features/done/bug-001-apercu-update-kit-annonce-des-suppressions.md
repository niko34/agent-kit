# Bug — l'aperçu d'`update_kit.sh` annonce comme supprimés des fichiers qu'il va créer

- **Type** : bug (format minimal `specs/modele.md`)
- **Version cible** : 0.6.0
- **Créée** : 2026-09-12 (relevé pendant la première mise en service réelle
  d'`update_kit.sh` dans un projet consommateur ; cinquième défaut de la
  série, les quatre autres ont été corrigés par feature-005)
- **Domaine** : outillage — `tools/update_kit.sh`. Ni auth, ni données
  personnelles touchées. **Mais** le script écrase des fichiers suivis dans le
  dépôt d'un projet tiers, et c'est sur cet aperçu qu'on décide de le lancer.
- **Spec liée** : feature-005 (les quatre défauts corrigés), feature-006 (le
  harnais de test dont le correctif a besoin), ADR-0008

## Agents requis

- [x] debugger
- [ ] **security-reviewer, rôle GATE** — non coché : aucun chemin sensible
      (auth, permissions, données personnelles, migration). L'impact est une
      **mauvaise décision humaine** prise sur un aperçu trompeur, pas une
      faille
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

L'aperçu affiché avant la synchronisation présente en **suppression** des
fichiers que le script va en réalité **créer**. Un utilisateur qui lit
l'aperçu pour décider s'il lance la synchronisation y voit une perte
annoncée là où il y aura un ajout.

```
→ Récupération de kit/main…
→ Écarts sur les fichiers gelés :

 .claude/agents/architect.md     | 1 -
 .claude/agents/test-engineer.md | 1 -
 GUIDE.md                        | 1 -
 specs/features/_template.md     | 1 -
 tools/check_doc_links.sh        | 1 -
 tools/check_specs.sh            | 1 -
 6 files changed, 6 deletions(-)

ℹ️  --dry-run : aucune modification appliquée.
   Relance sans --dry-run pour récupérer ces fichiers.
```

**Relevé réel**, obtenu le 2026-09-12 en exécutant `./tools/update_kit.sh
--dry-run` dans un projet jetable dépourvu des chemins gelés concernés. Les
six fichiers annoncés `6 deletions(-)` sont, après synchronisation réelle,
tous **présents** — donc créés :

```
--- les 6 fichiers annoncés « deletions » existent-ils après synchro ? ---
.claude/agents/architect.md          CRÉÉ
.claude/agents/test-engineer.md      CRÉÉ
GUIDE.md                             CRÉÉ
specs/features/_template.md          CRÉÉ
tools/check_doc_links.sh             CRÉÉ
tools/check_specs.sh                 CRÉÉ
```

### Aggravation constatée pendant la reproduction

Le cas du fichier **présent mais non suivi** est plus grave que « un aperçu
trompeur ». Dans un projet où `.claude/` est ignoré par git et contient du
travail local :

```
--- contenu local avant synchro ---
MON TRAVAIL LOCAL NON COMMITE, IRREMPLACABLE
--- aperçu annoncé ---
 .claude/agents/architect.md     | 1 -
 (… 6 files changed, 6 deletions(-))
--- après synchro réelle ---
agent architecte du kit
```

Le contenu local a été **écrasé sans aucun avertissement**, et l'aperçu
annonçait une suppression d'une ligne. Deux gardes échouent simultanément :

1. l'aperçu ne dit pas qu'un fichier va être écrasé — il annonce l'inverse ;
2. la garde d'arbre de travail propre (`tools/update_kit.sh:160`) repose sur
   `git status --porcelain`, **qui ne voit pas les fichiers ignorés**. Elle
   laisse donc passer la synchronisation.

Le contenu écrasé n'est récupérable par aucun `git checkout` : il n'a jamais
été suivi. Ce défaut, classé « cosmétique » dans les notes du 2026-09-12,
doit être reclassé **grave** — il détruit du travail en silence.

## Cause racine

L'aperçu repose sur `git diff --stat "$DISTANT/$BRANCHE" -- $fichiers_du_kit`
(`tools/update_kit.sh:223-225`), qui compare la référence du kit à l'**arbre
de travail suivi** du projet. Le périmètre réel du défaut couvre toute la
construction de l'aperçu, `tools/update_kit.sh:209-229`, et non les seules
lignes du `git diff` : c'est le choix d'un diff d'arbres comme source du
récapitulatif qui est en cause, pas sa mise en forme.

`git diff` ne voit que ce que git suit. Un fichier présent dans le kit et
absent de l'index du projet est donc vu comme « présent dans la référence,
absent ici » — c'est-à-dire **une suppression**. Or l'opération réelle est
l'inverse : `git checkout "$DISTANT/$BRANCHE" -- $presents`
(`tools/update_kit.sh:239`) va **écrire** ce fichier dans le projet.

Le sens du diff est donc correct du point de vue de git, et faux du point de
vue de l'utilisateur : il lit un récapitulatif de ce que le script va faire,
pas une comparaison de deux arbres. Les deux coïncident pour les fichiers déjà
suivis, et divergent exactement pour ceux qui ne le sont pas.

C'est le même défaut de nature que le troisième de feature-005 — un aperçu qui
décrit autre chose que l'action à venir — corrigé alors sur le périmètre des
fichiers listés, pas sur le **sens** de ce qui est affiché.

## Correctif attendu

1. L'aperçu distingue explicitement les trois cas, plutôt que de restituer un
   diff brut :
   - **à créer** — présent dans le kit, absent du projet (ou présent mais non
     suivi) ;
   - **à mettre à jour** — présent des deux côtés, contenu différent ;
   - **identique** — non affiché, ou affiché en compte agrégé.
2. Un fichier **non suivi** qui va être écrasé est signalé comme tel : c'est
   le cas le plus dangereux, puisque son contenu actuel n'est récupérable par
   aucun `git checkout` après coup.
3. Le récapitulatif final ne doit jamais employer le mot « suppression » pour
   une opération qui ajoute. `architect` tranche la forme exacte
   (`git diff --numstat` interprété, `git ls-tree` comparé à `git ls-files`,
   ou autre) ; le critère est la lisibilité pour qui décide.

## Critères d'acceptation

- [x] Dans le scénario de reproduction, aucun fichier destiné à être créé
      n'apparaît comme supprimé
- [x] Les trois cas (créé / mis à jour / identique) sont distingués dans la
      sortie — devenus quatre à l'implémentation (non suivi divergent et non
      suivi identique séparés), cf. ADR-0011
- [x] Un fichier non suivi sur le point d'être écrasé est explicitement
      signalé avant l'écriture
- [x] `--dry-run` et l'exécution réelle affichent **le même** récapitulatif :
      un aperçu qui diffère de l'action ne sert à rien
- [x] Aucun chemin sensible (auth, permissions, données personnelles) touché
- [x] Suite de tests verte, avec un test de non-régression couvrant ce bug
      dans le harnais de feature-006
- [x] Le test de non-régression a été **vu échouer sur le code d'avant le
      fix** — sinon il ne protège rien
- [x] Lint propre (`shellcheck`), pas de warning nouveau

## Hors périmètre

> ⚠️ **Cette section a été démentie par le cycle lui-même.** Elle est conservée
> telle qu'elle a été écrite — le kit corrige par addendum daté, jamais par
> réécriture. Ce qui a réellement été fait, et pourquoi, est consigné dans
> « Écarts assumés par rapport à la spec initiale », plus bas. En particulier :
> le harnais de test **a** été construit ici, et le correctif ne s'est **pas**
> limité à l'aperçu.

- Toute autre évolution d'`update_kit.sh` : ce fix ne corrige que l'aperçu
- La création du harnais de test lui-même — c'est feature-006, dont ce bug
  dépend : sans harnais, le critère « vu échouer avant le fix » n'est pas
  atteignable
- Le comportement de `git checkout` sur un fichier non suivi (il l'écrase) :
  ce fix le **signale**, il ne le change pas

---
# Notes d'implémentation

## Plan (architect)

- L'aperçu cesse d'être un diff de deux arbres pour devenir le **récapitulatif
  des opérations** que `git checkout` va réellement exécuter.
- Classification par fichier, trois tests sans dépendance : `[ -e "$f" ]`
  (absent → à créer) ; `git ls-files --error-unmatch` (présent non indexé →
  non suivi) ; `git hash-object` contre le blob du kit (égal → identique,
  sinon → à mettre à jour).
- Moyen retenu : **comparaison de contenu fichier par fichier**. Écartés :
  `git diff --numstat` réinterprété (reste un diff d'arbres, sens à inverser à
  la main, non suivis invisibles) et `git ls-tree` vs `git ls-files`
  (`ls-files` est aveugle aux non suivis, donc rate exactement le cas grave).
- **Site d'appel unique** du rendu, au-dessus du branchement `--dry-run`/réel :
  deux chemins ne peuvent pas diverger s'il n'y en a qu'un. Plus fort qu'« une
  fonction appelée deux fois ».
- **Le correctif de l'aperçu ne suffit pas** (verdict explicite) : un aperçu
  honnête ne sauve rien d'un utilisateur qui lance sans `--dry-run`, et c'est
  le mode nominal. La garde d'arbre propre (l. 150-152) revendique déjà de
  protéger le travail en cours mais repose sur `git status --porcelain`,
  aveugle aux fichiers ignorés : elle est **trouée**, pas absente. La réparer
  est donc dans le périmètre — voir « Écarts assumés » ci-dessous.
- ADR : **ADR-0011 à créer** — « L'aperçu d'`update_kit` est un récapitulatif
  d'opérations, pas un diff de deux arbres ». Trois critères sur quatre
  remplis (1 contrainte structurante, 3 alternatives crédibles, 4 verrouillage
  durable) ; le critère 2 ne l'est pas, la décision étant visible dans le code.

## Validation security-reviewer

- **Rôle GATE** : non applicable. Ni auth, ni permissions, ni données
  personnelles, ni paiement, ni migration destructive. Trois lectures
  indépendantes l'ont confirmé (`spec-reader`, `orchestrator`, `architect`)
  alors même que le défaut s'est révélé destructeur de données.
- **Rôle AUDIT** : invoqué délibérément en fin de cycle, hors gate, sur la
  question « que peut détruire ce script dans le dépôt d'un tiers ». Trois
  constats **graves**, tous établis par expérience sur dépôts jetables :
  1. fichiers marqués `skip-worktree`/`assume-unchanged` — suivis, donc
     invisibles à `porcelain` **et** hors de portée de la garde neuve, écrasés
     sans retour → reporté sur `bug-003` ;
  2. **tout argument inconnu déclenche la synchronisation réelle**
     (`--dry_run` écrit) → **corrigé dans ce cycle** ;
  3. la régénération Copilot exécute du code fraîchement récupéré **avant** la
     relecture humaine que le script promet trois lignes plus bas → reporté
     sur `feature-011`.

## Implémentation

- **Fichiers créés** : `tests/test_update_kit.py` — harnais minimal (deux
  dépôts git jetables, environnement git confiné) et 4 cas de non-régression.
- **Fichiers modifiés** : `tools/update_kit.sh` — classification et rendu du
  récapitulatif (l. ~209-320), garde d'écrasement, validation d'argument,
  ajout de `tests/test_update_kit.py` aux `CHEMINS` pour que le test descende
  avec le script qu'il protège.
- **Choix d'implémentation** : boucle `while IFS= read -r … <<<` et jamais
  `| while` — sous `set -uo pipefail` un pipe crée un sous-shell et les listes
  construites seraient perdues en silence. La divergence de hash est calculée
  **une seule fois** à la classification, puis partagée par le récapitulatif et
  par la garde : c'est ce qui garantit que l'aperçu ne peut plus annoncer autre
  chose que ce que l'exécution fait.

## Tests (test-engineer)

- Suite complète : **13/13 verts** (9 préexistants + 4 neufs), 0,24 s.
- Tests ajoutés : 4 — fichier absent classé « à créer » et jamais annoncé en
  suppression ; fichier non suivi divergent signalé **et** protégé ;
  récapitulatif `--dry-run` identique à celui de l'exécution réelle ; argument
  inconnu rejeté sans synchroniser.
- **Preuve rouge avant le fix** : les trois premiers cas vus échouer sur
  `git show HEAD:tools/update_kit.sh` —
  `AssertionError: 'À CRÉER' not found in '… 1 file changed, 1 deletion(-)'`,
  `'NON SUIVI' not found`, `bloc récapitulatif introuvable`.
- **Mutation** : 9 mutants, **8 tués**. Le survivant est **inerte**
  (`SIMULATION=1` suivi de `exit 1`) et documenté comme tel — une équivalence,
  jamais comptée comme tuée.
- Lint : `shellcheck` 0.10.0 — un seul SC2086, préexistant à l'identique dans
  `HEAD`, 0 warning nouveau.
- Confinement vérifié : `GIT_DIR=/root/agent-kit/.git python3 -m unittest
  discover -s tests` laisse `HEAD`, `origin`, l'index (md5) et l'arbre de
  travail strictement identiques.

## Revue (code-reviewer)

- **Verdict initial : Request changes.** Trois points bloquants :
  1. le harnais pouvait **écrire dans le vrai dépôt** — reproduit : avec
     `GIT_DIR` positionné, la suite committait `GUIDE.md` dans
     `/root/agent-kit`. Le confinement neutralisait `GIT_CONFIG_GLOBAL` mais
     pas `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` et consorts — **corrigé** ;
  2. un mutant survivant : déplacer la garde avant la sortie `--dry-run`, donc
     régresser le défaut 1 de feature-005, ne tuait aucun test — **corrigé**
     par une assertion sur le code de sortie de l'aperçu ;
  3. `doc-writer` non passé — traité à l'étape suivante.
- Points mineurs, tous corrigés : un non-suivi **identique** au kit était
  annoncé « SERONT ÉCRASÉS / non récupérable » (alarmant à tort) ;
  `tests/test_update_kit.py` absent des `CHEMINS` ; « IDENTIQUES : 0 fichiers ».
- **Verdict final : Approved**, après re-vérification de chaque point par ses
  propres scénarios plutôt que sur déclaration.

## Doc (doc-writer)

- `docs/adr/0011-apercu-recapitulatif-d-operations.md` — créé
- `docs/adr/README.md` — index
- `CHANGELOG.md` — entrée sous 0.6.0
- `README.md` — nouvelle forme de l'aperçu et refus sur non suivi divergent
- `specs/features/todo/feature-006-tests-de-update-kit.md` — note sur le
  harnais minimal livré ici et sur ce qui reste dû

## Écarts assumés par rapport à la spec initiale

Consignés parce que la spec `done/` doit raconter ce qui s'est réellement
passé, et non la version idéale.

1. **Le harnais de test a été construit ici**, alors que la section « Hors
   périmètre » de cette spec l'excluait explicitement et le renvoyait à
   feature-006. Motif : le critère « test vu échouer avant le fix » est
   inatteignable sans harnais, et ce défaut détruit des données — il ne
   pouvait pas attendre 17 cas de test. Frontière tenue et vérifiée : aucun
   fichier de CI touché, aucune des 17 garanties de feature-006 implémentée,
   section hygiène de `GUIDE.md` intacte, `harnais_kit.py` non extrait.
2. **L'ordre prévu entre bug-001 et feature-006 a été inversé.** feature-006
   plaçait bug-001 après elle ; c'est le contraire qui s'est produit, sur
   proposition d'`architect` et pour le même motif.
3. **Une garde d'écrasement a été ajoutée**, au-delà du seul aperçu que la
   spec annonçait. Justification retenue : elle répare un trou dans une
   garantie que le script revendique déjà par écrit, elle ne crée pas une
   protection nouvelle. Conséquence visible : une synchronisation jusqu'ici
   réussie peut désormais **sortir en erreur**.
4. **La validation des arguments a été ajoutée**, hors périmètre déclaré.
   Motif : constat d'audit établi par expérience — `--dry_run` mal
   orthographié déclenchait une synchronisation réelle, rendant contournable
   par une coquille la seule soupape humaine du script. Corriger l'aperçu en
   laissant ce chemin ouvert n'aurait pas eu de sens.
5. **Le défaut a été reclassé « grave ».** Les notes du 2026-09-12 le
   tenaient pour cosmétique. La reproduction a montré qu'il détruit du travail
   irremplaçable en silence.

## Addendum — itération du 2026-09-12 (n° 1)

- **Déclencheur** : validation par mutation. Le mutant (b) — inverser la garde
  d'écrasement — **survivait**.
- **Hypothèse précédente invalidée** : « les trois cas de test protègent les
  trois garanties ». Faux : le cas 2 passait **pour la mauvaise raison**.
  `.gitignore` n'était pas committé dans `setUp`, donc `git status --porcelain`
  voyait l'arbre comme sale et la garde **préexistante** (l. 160) se
  déclenchait avant la garde neuve. Deux gardes se recouvraient dans un même
  cas : casser l'une laissait l'autre sauver la mise.
- **Ce qui a été fait** : `.gitignore` committé avant l'écriture du contenu
  local divergent, pour isoler la garde testée. Cas 1 et 3 réexaminés pour le
  même motif de chevauchement — aucun trouvé, vérifié indépendamment.
- **Résultat** : mutant (b) tué (`AssertionError: 0 == 0`).

## Addendum — itération du 2026-09-12 (n° 2)

- **Déclencheur** : revue de code **Request changes**, et rapport d'audit
  sécurité reçu en parallèle.
- **Hypothèse précédente invalidée** : « le harnais est confiné ». Faux : il
  neutralisait la configuration git mais pas les variables qui redirigent git
  lui-même. Avec `GIT_DIR` positionné — cas d'un lancement depuis un hook —
  la suite écrivait dans le dépôt réel. Le défaut que le brief désignait comme
  bloquant existait bel et bien.
- **Ce qui a été fait** : six corrections en un seul retour — confinement
  complet, assertion contre le mutant survivant, rejet des arguments inconnus,
  cohérence entre récapitulatif et garde, test ajouté aux `CHEMINS`, ligne
  « IDENTIQUES » masquée à zéro. Deux constats graves d'audit délibérément
  **non traités** et reportés sur `bug-003` et `feature-011`.
- **Résultat** : 13/13 verts, 8 mutants sur 9 tués (le neuvième inerte),
  confinement vérifié sous `GIT_DIR`, revue **Approved**.

## Statut final

✅ **Done — 2026-09-12.** Cycle complet : `orchestrator` → `spec-reader` →
reproduction → `architect` → `backend-developer` → `test-engineer` →
`code-reviewer` (Request changes, puis Approved) → `security-reviewer`
(rôle AUDIT) → `doc-writer`. Deux boucles de correction, consignées en
addendums.

Relevés de clôture : 13/13 tests verts · 9 mutants, 8 tués (le neuvième
inerte, documenté comme équivalence) · `shellcheck` 0 warning nouveau (1
préexistant, vérifié identique à `HEAD`) · `check_specs.sh`, `check_doc_links.sh`
et `sync_copilot_agents.py --check` verts · confinement du harnais vérifié
sous `GIT_DIR` pointé sur le dépôt réel.

Deux constats graves de l'audit sécurité reportés sur specs neuves :
`bug-003-skip-worktree-echappe-aux-gardes.md` et
`feature-011-passerelle-copilot-execute-du-code-non-relu.md`.
