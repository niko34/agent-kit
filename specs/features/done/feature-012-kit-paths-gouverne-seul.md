## Métadonnées
- **ID** : feature-012
- **Slug** : kit-paths-gouverne-seul
- **Type** : feature (tests **et** correctif — voir l'avertissement ci-dessous)
- **Statut** : todo
- **Priorité** : haute
- **Version cible** : 0.7.0 <!-- corrigé par doc-writer le 2026-09-13 : le
  fichier était déjà en 0.7.0 (non taggé) au moment de ce lot ; l'entrée
  CHANGELOG rejoint cette version au lieu d'en ouvrir une nouvelle -->
- **Dernière mise à jour** : 2026-09-13
- **Spec(s) liée(s)** : feature-006 (lot 1, dont le harnais est un prérequis),
  feature-005 (`.kit-paths` livré là), ADR-0008 (la liste inclusive)

> **Lot 2 sur 4** du découpage de feature-006, décidé le 2026-09-12.
> **Prérequis : feature-006 (lot 1)** doit être livrée — ce lot s'appuie sur
> `tests/harnais_kit.py` et sur sa primitive d'écriture de `.kit-paths`.
>
> ⚠️ **Ce lot n'est pas une spec de tests pure.** Sur décision de
> l'utilisateur du 2026-09-12, il **corrige** le défaut de parsing découvert
> par l'audit sécurité, au lieu de se contenter de le figer par un test. La
> règle « cette spec ajoute des tests, elle ne change pas ce que le script
> fait » ne s'applique donc pas ici, et c'est délibéré.

## Domaines touchés
- [ ] API REST
- [ ] Frontend
- [ ] BDD / migrations
- [ ] Auth / permissions
- [ ] Données personnelles
- [ ] Intégrations externes
- [x] Tâches de fond — `tools/update_kit.sh`, et son périmètre déclaré par le projet

## Agents requis
- [x] spec-reader
- [x] architect
- [ ] security-reviewer, rôle GATE — aucun chemin sensible. **Rôle AUDIT
      recommandé** : le défaut corrigé ici est une *perte silencieuse de
      périmètre déclaré*, et c'est l'audit qui l'a trouvé
- [ ] ux-ui-designer
- [x] backend-developer
- [ ] frontend-developer
- [x] test-engineer — mutation obligatoire sur chaque cas
- [x] code-reviewer
- [x] doc-writer

## Description
Couvrir par des tests les quatre garanties qui portent sur `.kit-paths` — le
fichier par lequel un projet déclare ce qu'il prend du kit — et **corriger** le
défaut de parsing qui lui fait perdre tous ses chemins en silence sur un
fichier en CRLF ou contenant une espace.

## Contexte
`.kit-paths` est la soupape d'ADR-0008 : une **liste inclusive** par laquelle
un projet déclare ce qu'il accepte de recevoir du kit. « Déclarer un chemin,
c'est l'adopter ; l'omettre, c'est en devenir propriétaire. » C'est le
mécanisme qui protège un projet ayant spécialisé ses agents — le cas réel qui
l'a motivé affichait 50 à 88 % de divergence.

L'audit sécurité du cycle bug-001 a établi que ce mécanisme **perd son
périmètre en silence** dans deux cas ordinaires :

- un `.kit-paths` enregistré en **CRLF** (un éditeur Windows suffit) : le `\r`
  final survit à `sed 's/#.*//' | grep -v '^[[:space:]]*$'` ;
- un chemin contenant une **espace** : `for chemin in $CHEMINS` (l. ~208 — le script a bougé depuis la rédaction)
  découpe dessus.

Dans les deux cas, `git cat-file -e` échoue, le chemin disparaît, `presents` se
vide, et le script affiche **« Le distant "kit" pointe-t-il bien sur le kit ? »**
— un message qui accuse le distant d'un défaut de parsing purement local.

Le profil est exactement celui du défaut 2 de feature-005 : une perte
silencieuse de périmètre déclaré, avec un diagnostic qui envoie chercher
ailleurs.

## Comportement attendu

### Les quatre garanties à couvrir
| # | Garantie |
|---|---|
| 5 | `.kit-paths` présent → seuls ses chemins sont touchés |
| 6 | `.kit-paths` présent → les chemins **conditionnels** sont neutralisés |
| 7 | `.kit-paths` : `#` commente, lignes vides ignorées |
| 17 | Chemin listé deux fois (`.kit-paths` + conditionnel) → traité une fois |

Un cas par garantie, nommé d'après elle. Pour chacun, démontrer qu'une **seule**
garde peut le faire échouer.

### Le correctif de parsing
1. Les fins de ligne **CRLF** sont tolérées : un `\r` terminal est retiré, il
   ne fait jamais partie du chemin.
2. Un chemin contenant une **espace** est traité comme un seul chemin, ou —
   si `architect` juge que la refonte de l'itération est disproportionnée —
   **explicitement refusé avec un message qui le nomme**. Ce qui est exclu,
   c'est qu'il disparaisse en silence.
3. Un chemin déclaré dans `.kit-paths` mais **absent du kit** est signalé
   nommément, jamais avalé (comportement actuel : ignoré sans un mot).
4. Le message « Le distant pointe-t-il bien sur le kit ? » ne doit plus
   apparaître quand la cause est un défaut de parsing local. Distinguer les
   deux diagnostics : « aucun chemin déclaré n'existe côté kit » et « le
   distant semble ne pas être le kit ».

### Point de périmètre à trancher par `architect` — le glob `*`

Signalé par l'audit du cycle `bug-003`, classé **cosmétique** et rattaché à ce
lot, mais **absent du texte de cette spec** jusqu'au 2026-09-13 : un `.kit-paths`
contenant `*` est **glob-expansé par le shell** contre le répertoire courant
(`tools/update_kit.sh`, itération sur `$CHEMINS`).

C'est la même famille que les deux défauts corrigés ici — un périmètre déclaré
qui se transforme en autre chose sans que personne ne le voie — mais ce n'est
pas le même mécanisme.

`architect` doit **trancher explicitement** : livrable de ce lot, ou hors
périmètre **nommé**. Le silence n'est pas une option : sans décision écrite, ce
constat retournerait dans le flou d'où l'audit l'a sorti.

### Cas limites
- `.kit-paths` **vide** ou entièrement commenté : le script doit le **dire**
  nommément. **Correction établie par exécution (A1)** : contrairement à ce
  qu'affirmait cette ligne jusqu'au 2026-09-13, le comportement actuel n'est
  PAS un repli silencieux sur la liste gelée par défaut — `CHEMINS` devient la
  chaîne vide, la boucle `for chemin in $CHEMINS` n'itère pas, `presents` reste
  vide, et le script sort en accusant le distant (« Aucun des chemins gelés
  n'existe… Le distant « kit » pointe-t-il bien sur le kit ? »), exit 1. Voir
  le cas 4 de la section « Comportement actuel » ci-dessous pour la sortie
  réelle. Le correctif attendu ici n'est donc pas d'empêcher un repli qui
  n'existe pas, mais de distinguer ce cas (« déclaration vide ») du cas
  « mauvais distant ».
- `.kit-paths` absent : comportement inchangé (liste gelée par défaut).
- `.kit-paths` contenant uniquement des chemins absents du kit : message
  distinguant clairement ce cas d'un mauvais distant.

## Comportement actuel
`tools/update_kit.sh` l. ~120-133 lit `.kit-paths` par
`sed 's/#.*//' | grep -v '^[[:space:]]*$'`, puis itère sur la liste non quotée
(`for chemin in $CHEMINS`, l. ~208). Les quatre garanties ne sont couvertes
par aucun test.

**A1 — les six cas ont été reproduits par exécution** (clone jetable, via
`tests/harnais_kit.py::fabriquer_kit_et_projet`/`ecrire_kit_paths`, rev
`ab525b7`). Les six sorties réelles suivent.

#### Cas 1 — `.kit-paths` en CRLF vs LF
`.kit-paths` = `GUIDE.md` (LF) contre `GUIDE.md\r` (CRLF), `GUIDE.md` présent
dans le kit. **Confirmé : le `\r` survit au pipeline `sed | grep` et fait
perdre tout le périmètre.**

```
>>> LF (.kit-paths = "GUIDE.md\n")
code retour: 0
→ Ce que la synchronisation va faire :
  À CRÉER (1)
       GUIDE.md
ℹ️  --dry-run : aucune modification appliquée.

>>> CRLF (.kit-paths = "GUIDE.md\r\n")
code retour: 1
❌ Aucun des chemins gelés n'existe dans kit/main.
   Le distant « kit » pointe-t-il bien sur le kit ?
```
Recap LF == Recap CRLF ? **False**.

#### Cas 2 — chemin contenant une espace
`.kit-paths` = `dossier avec espace/fichier.txt`, ce chemin existe bien dans
le kit. **Confirmé : `for chemin in $CHEMINS` découpe sur l'espace** (IFS par
défaut) et cherche séparément `dossier`, `avec`, `espace/fichier.txt` — aucun
des trois ne correspond à un objet git, le chemin réel disparaît sans être
nommé.

```
code retour: 1
❌ Aucun des chemins gelés n'existe dans kit/main.
   Le distant « kit » pointe-t-il bien sur le kit ?
```

#### Cas 3 — chemin déclaré mais absent du kit (avec un autre chemin valide)
`.kit-paths` = `GUIDE.md` (présent) + `chemin/qui-nexiste-pas.md` (absent du
kit). **Confirmé : avalé sans un mot** — aucune mention de
`chemin/qui-nexiste-pas.md` nulle part dans la sortie.

```
code retour: 0
→ Ce que la synchronisation va faire :
  À CRÉER (1)
       GUIDE.md
ℹ️  --dry-run : aucune modification appliquée.
```

#### Cas 4 — `.kit-paths` vide, puis entièrement commenté
**La spec affirmait (l. ~117, corrigé ci-dessus) que le script « retombe
silencieusement sur la liste gelée par défaut ». Infirmé par exécution.**
Dans les deux variantes, `CHEMINS` devient la chaîne vide, la boucle
n'itère pas, `presents` reste vide, et le script sort en **accusant le
distant** — il ne retombe sur rien.

```
>>> .kit-paths vide
code retour: 1
❌ Aucun des chemins gelés n'existe dans kit/main.
   Le distant « kit » pointe-t-il bien sur le kit ?

>>> .kit-paths entièrement commenté ("# rien ici" / "# une autre ligne commentée")
code retour: 1
❌ Aucun des chemins gelés n'existe dans kit/main.
   Le distant « kit » pointe-t-il bien sur le kit ?
```

#### Cas 5 — glob `*` dans `.kit-paths`
Discriminé par exécution avec deux fichiers `.md` : `PARTAGE.md` (même nom
dans le kit ET dans le projet, contenus différents) et `SEUL_AU_KIT.md`
(seulement dans le kit). `.kit-paths` = `*.md`.

```
code retour: 0
→ Ce que la synchronisation va faire :
  À METTRE À JOUR (1)
       PARTAGE.md
```
**Confirmé : le glob s'expanse contre le CWD DU PROJET, pas contre l'arbre du
kit** — `SEUL_AU_KIT.md` n'apparaît nulle part, alors qu'un glob expansé côté
kit l'aurait inclus. Ceci confirme l'hypothèse de l'orchestrateur, vérifiée
ici dans le contexte réel du script (le `for chemin in $CHEMINS` de la
boucle l. ~208 s'exécute après le `cd "$racine_du_projet"` de la l. ~169,
alors que le `.kit-paths` a été lu — comme simple texte, sans glob — au
moyen de `$RACINE_PROJET`, calculé *avant* ce `cd`).

Tracé avec `bash -x` (`.kit-paths` = `*.inexistant`, aucune correspondance
dans le cwd du projet) :
```
+ for chemin in $CHEMINS
+ git cat-file -e 'kit/main:*.inexistant'
...
+ presents=
❌ Aucun des chemins gelés n'existe dans kit/main.
   Le distant « kit » pointe-t-il bien sur le kit ?
```
**Confirmé : un `*` sans correspondance reste littéral** (pas de `nullglob`),
et c'est ce littéral `*.inexistant` qui est cherché tel quel via
`git cat-file -e`, sans succès — cas indiscernable, dans la sortie, d'un
vrai chemin absent (cas 3), toujours sans message dédié.

#### Cas 6 — chemin ACCENTUÉ déclaré dans `.kit-paths`
`.kit-paths` = `révision.md`, présent dans le kit sous ce nom accentué.

```
code retour: 0
→ Ce que la synchronisation va faire :
  À CRÉER (1)
       révision.md
```
**Confirmé, la nuance de `spec-reader` tient** : le chemin déclaré est
vérifié par `git cat-file -e "$DISTANT/$BRANCHE:$chemin"`, donc tel quel,
sans passer par `ls-tree` — aucune citation `core.quotepath` n'entre en jeu
à cette étape, et le chemin accentué n'est pas perdu ici.

#### Synthèse — le message qui accuse le distant
« Le distant « kit » pointe-t-il bien sur le kit ? » apparaît dans les cas 1
(CRLF), 2 (espace), 4 (vide/commenté) et 5bis (glob sans correspondance) —
chaque fois pour une cause purement locale de parsing. Il n'apparaît pas
dans les cas 3 (perte partielle, silencieuse) ni 6 (chemin accentué, non
affecté).

## Contraintes techniques
- Portable bash 3.2 — ni `declare -A`, ni `mapfile`
- Zéro dépendance externe (ADR-0006)
- ADR-0008 reste vrai : `.kit-paths` est **inclusif**, et gouverne aussi les
  chemins conditionnels. Le correctif ne doit pas rouvrir cette question
- Les correctifs de feature-005 et les gardes de bug-001 restent intacts
- Le harnais de feature-006 est **étendu, jamais refondu**
- ⚠️ **`core.quotepath` (ADR-0013) — le chemin actuel est sûr, le correctif peut
  le casser.** Aujourd'hui le chemin déclaré est vérifié par
  `git cat-file -e "$DISTANT/$BRANCHE:$chemin"`, donc **tel quel**, sans passer
  par `ls-tree` : aucune citation en jeu. **Mais si le diagnostic distinct (A6)
  est implémenté en listant les chemins du kit via `git ls-tree`, cet appel neuf
  devra porter `-c core.quotepath=off`** — sans quoi on réintroduit précisément
  le défaut qu'ADR-0013 vient de codifier, dans le lot censé appliquer sa règle.

## Fichiers potentiellement concernés
- `tools/update_kit.sh` — lecture de `.kit-paths`, itération, messages
- `tests/test_update_kit.py` — les 4 cas + les cas limites
- `tests/harnais_kit.py` — extension éventuelle des primitives
- `CHANGELOG.md`, `README.md`, `GUIDE.md` si le comportement documenté change

## Livrables — check-list
- [x] A1 — Reproduire les deux défauts de parsing (CRLF, espace) et coller la
      sortie réelle dans cette spec — étendu aux six cas (CRLF, espace,
      chemin absent, vide/commenté, glob, accentué), tous confirmés par
      exécution sur clone jetable, cf. « Comportement actuel »
- [x] A2 — Garanties 5, 6, 7, 17 : un cas chacune (`KitPathsGrammaireTest`,
      `test_garantie_5_…` à `test_garantie_17_…`)
- [x] A3 — CRLF toléré (quatre cas : ligne de chemin, commentaire, ligne
      vide, dernière ligne sans saut final)
- [x] A4 — Chemin avec espace : traité comme un seul chemin, jamais perdu
      (`architect` a tranché pour le support plutôt que le refus nommé —
      voir « Verdicts du cycle » ci-dessous)
- [x] A5 — Chemin déclaré mais absent du kit : signalé nommément
      (`test_chemin_absent_du_kit_nomme_avec_un_chemin_valide_a_cote`)
- [x] A6 — Diagnostic distinct entre « rien ne correspond » et « mauvais
      distant » (trois messages désormais distincts : déclaration vide,
      aucun chemin déclaré trouvé côté kit, mauvais distant préexistant —
      non-régression vérifiée mot pour mot)
- [x] A7 — `.kit-paths` vide ou entièrement commenté : le script le dit
      (deux cas dédiés, jamais confondus avec le soupçon de mauvais distant)
- [x] C1 — `CHANGELOG.md` (entrée sous 0.7.0, cf. `git log`), `README.md`
      (section grammaire ajoutée) ; `GUIDE.md` inchangé — ne documentait pas
      les règles d'écriture de `.kit-paths` avant ce lot, rien à corriger là
- [x] D1 — Mutation : chaque cas neuf vu mourir (cf. matrice de mutation
      ci-dessous)
- [x] D2 — Anti-chevauchement démontré pour chaque cas
      (`affirmer_seule_garde` sur tous les cas neufs, dérogation ADR-0012
      documentée et contre-vérifiée)

## Sécurité & données
- Authentification / permissions / données personnelles : non
- Migration destructive : non applicable
- Risque identifié : le correctif touche le mécanisme qui **protège** le
  périmètre d'un projet tiers. Une régression ici ferait recevoir à un projet
  des chemins qu'il a explicitement refusés — c'est le scénario qu'ADR-0008
  existe pour empêcher.

## ADR attendu ?
- **Probable** : non — le correctif applique ADR-0008, il ne le révise pas.
- **Critère(s) candidat(s)** : aucun a priori. Si `architect` retient le refus
  explicite d'un chemin avec espace plutôt que son support, cela crée une
  contrainte sur les projets consommateurs et mériterait le critère 1.

## Éléments visibles (pour doc-writer)
### Endpoints REST concernés
- Aucun
### Écrans / flux UI concernés
- Aucun
### Documentation à produire / mettre à jour
- `CHANGELOG.md` — entrée sous **0.7.0** (version réelle en cours, non taggée
  — corrigé par `doc-writer`, la spec visait 0.6.0 à tort) : un `.kit-paths`
  en CRLF fonctionne enfin
- `README.md` / `GUIDE.md` — si les règles d'écriture de `.kit-paths`
  changent : fait pour `README.md` (section grammaire) ; `GUIDE.md` ne
  documentait pas ces règles avant ce lot, rien à y corriger

## Critères d'acceptation
- [x] Un `.kit-paths` en CRLF produit exactement le même périmètre qu'en LF
- [x] Un chemin contenant une espace n'est jamais perdu en silence
- [x] Un chemin déclaré mais absent du kit est nommé
- [x] Le message accusant le distant n'apparaît plus sur un défaut local
- [x] Les quatre garanties ont chacune leur cas, vu mourir par mutation
- [x] Suite complète verte, zéro régression (55 → 71 tests)
- [x] Lint propre (`shellcheck`), pas de warning nouveau (1 → 0 avertissement)

## Plan de test manuel
1. Écrire un `.kit-paths` avec `unix2dos`, lancer `--dry-run`, comparer le
   périmètre à celui obtenu en LF.
2. Déclarer un chemin contenant une espace, vérifier qu'il n'est pas avalé.
3. Déclarer un chemin inexistant côté kit, vérifier qu'il est nommé.
4. `.kit-paths` entièrement commenté : vérifier que le script le dit.

## Notes pour agent
- **Harnais livré (feature-006, lot 1)** : `tests/harnais_kit.py` est
  disponible, avec `fabriquer_kit_et_projet()`, `ecrire_kit_paths()`,
  `MARQUEURS_DE_GARDE` et `affirmer_seule_garde()`. ADR-0012 impose que ce
  lot déclare sa propre clé dans `MARQUEURS_DE_GARDE` pour chaque garantie
  neuve et produise une **matrice de mutation diagonale** (chaque mutant ne
  tue que son propre cas) — ce n'est pas optionnel.
- Le défaut corrigé ici a été trouvé par l'**audit**, pas par un diff : il ne
  se voyait dans aucune ligne prise isolément.
- ADR-0008 explique pourquoi la liste est inclusive : « le défaut penche du
  bon côté — rien reçu par erreur, plutôt que tout reçu par erreur ». Un
  parsing qui perd des chemins fait pencher le défaut du bon côté par accident,
  mais pour une mauvaise raison, et prive le projet de ce qu'il voulait.
- ⚠️ **Piège trouvé par `bug-003`, applicable ici** : `git ls-tree`/`git
  ls-files` citent par défaut (`core.quotepath`) les octets non-ASCII — un
  chemin `.kit-paths` accentué peut donc ressortir d'une commande git sous
  une forme littéralement échappée (`"r\303\251vision.md"`) qui ne
  correspond plus, telle quelle, à aucun fichier sur le disque. Ce lot
  traite justement le parsing de `.kit-paths` et les chemins déclarés y sont
  le sujet central : tout appel à `ls-tree`/`ls-files` introduit ou modifié
  ici, dont la sortie sert ensuite de chemin disque, doit porter
  `-c core.quotepath=off` (voir ADR-0013 et le commentaire correspondant
  dans `tools/update_kit.sh`). Ne retire ni ne remplace aucun des livrables
  déjà listés — s'ajoute comme point de vigilance à l'implémentation.

## Hors périmètre
- Les garanties 1, 2, 14, 15, 16 — feature-006 (lot 1)
- Les garanties 3, 4, 8, 9 — feature-013
- Les garanties 10 à 13 — feature-014
- La garde `skip-worktree` — `bug-003`


---
## Dérogation à ADR-0012 — justification CORRIGÉE le 2026-09-13

ADR-0012 lie nommément `feature-012` : elle doit déclarer son marqueur dans
`MARQUEURS_DE_GARDE`. Ce lot y **déroge** — aucune clé n'est ajoutée, tous les
cas neufs utilisent `affirmer_seule_garde(..., None)`.

**Le motif invoqué par `architect` était faux.** Il affirmait qu'ajouter les
clés ferait tomber **tous** les `affirmer_seule_garde(..., None)` existants.
`code-reviewer` a testé plutôt que lu : il a ajouté les trois clés, et **seuls
les 4 cas neufs tombent — aucun cas préexistant.**

**Le motif réel**, établi par cette même expérience : le cas du glob
déclencherait **deux** marqueurs simultanément, ce que `affirmer_seule_garde`
interdit par construction. La dérogation tient donc, mais pour une autre raison
que celle qui avait été écrite.

Consigné ici, et non dans une docstring, parce qu'ADR-0012 est un contrat entre
specs : une dérogation à un ADR se documente là où la prochaine spec la
cherchera.

**Leçon de méthode, la troisième de cette session** : une justification n'a de
valeur que si quelqu'un a **essayé de la réfuter**. Sur `feature-006`, une
non-testabilité déclarée a été démolie en dix minutes. Ici, un motif de
dérogation. Dans les deux cas, l'auteur avait raisonné juste sur la conclusion
et faux sur la cause — et seul un contradicteur qui exécute l'a vu.

---
## Verdicts du cycle (consignés par `doc-writer`, clôture de cycle)

### Verdicts `architect`

- **V1 — Espace dans un chemin déclaré : traiter, pas refuser.** Le point
  laissé ouvert par la spec (« traité ou refusé nommément ») est tranché en
  faveur du **support**. Conséquence assumée : le trim explicite qui rend ce
  support possible interdit désormais une espace de tête/queue et un `#`
  dans un chemin — voir [ADR-0015](docs/adr/0015-grammaire-kit-paths.md), qui
  formalise ce compromis.
- **V2 — Glob `*` : livrable de ce lot, tranché « littéral, hors
  périmètre nommé ».** `architect` ne pouvait pas laisser le point dans le
  flou (rappel de la spec : « le silence n'est pas une option »). Décision :
  aucune expansion, ni côté projet (défaut corrigé) ni côté kit (alternative
  écartée, cf. ADR-0015) — un glob sans correspondance exacte côté kit est
  nommé comme un chemin absent, au même titre que n'importe quel autre.
- **V3 — ADR requis : oui.** Critères retenus : **1** (contrainte
  structurante — un chemin ne peut plus commencer/finir par une espace, ni
  contenir `#` ou un retour à la ligne, pour tout projet consommateur),
  **3** (alternatives crédibles écartées — refus nommé de l'espace, expansion
  du glob côté kit) et **4** (verrouillage long terme — la grammaire de
  `.kit-paths` devient un contrat qu'on ne peut plus élargir sans casser).
  → [ADR-0015](docs/adr/0015-grammaire-kit-paths.md).
- **V4 — Dérogation à ADR-0012 : confirmée, motif corrigé.** Voir la section
  ci-dessus (non réécrite) : le motif initialement invoqué par `architect`
  était faux (réfuté par exécution par `code-reviewer`), le motif réel tient
  toujours.

### Verdict `security-reviewer` (rôle AUDIT)

**GO.** Aucun chemin sensible (auth, permissions, données personnelles,
migration) n'est touché par ce lot. Le correctif renforce exactement le
mécanisme que l'AUDIT avait lui-même mis en cause (perte silencieuse de
périmètre déclaré) : les quatre défauts corrigés font tous pencher le défaut
du bon côté au sens d'ADR-0008 (un chemin mal parsé n'est plus synchronisé
par accident, il est nommé). Aucune régression identifiée sur les gardes
préexistantes (bug-001, bug-003) : les 55 tests antérieurs restent verts.

### Verdict `code-reviewer`

**Approved**, après deux tours de « Request changes » sur la première
proposition :

1. **Round 1** — le cas de la garantie 17 (chemin listé deux fois) comparait
   `git checkout`/`ls-tree` sur un pathspec dupliqué, que git tolère tout
   seul sans dédoublonnage : le cas ne prouvait rien. `code-reviewer` a
   supprimé le bloc de dédoublonnage entier sans qu'aucun test ne meure, ce
   qui a établi le défaut. Réécrit contre la boucle des **orphelins**, le
   site réellement discriminant (`presents` non déduplié y produit
   effectivement un doublon dans le récapitulatif).
2. **Round 1** — le message « Aucun chemin déclaré dans .kit-paths n'existe
   côté kit » n'était asserté par aucun test : le mutant `-eq 0` → `-ge 0`
   sur `${#declares[@]}` survivait aux 69 tests précédents. Deux cas dédiés
   ajoutés (`test_diagnostic_distinct_…`).
3. **Round 2** — les deux corrections vérifiées par exécution (le mutant
   ciblé meurt désormais sur les deux cas), et la dérogation à ADR-0012
   contre-vérifiée en ajoutant réellement les clés proposées : **Approved**.

### Matrice de mutation (D1/D2 — diagonale, doctrine ADR-0012)

| Cas neuf | Mutation appliquée | Test qui meurt | Chevauchement vérifié |
|---|---|---|---|
| CRLF (chemin, commentaire, ligne vide, dernière ligne) | ne pas retirer le `\r` terminal (`ligne="${ligne%$'\r'}"` neutralisé) | les 4 `test_crlf_sur_…` | `affirmer_seule_garde(..., None)` — aucune autre garde ne parle |
| Espace intérieure | revert vers `for chemin in $CHEMINS` (word-splitting) | `test_espace_dans_chemin_traite_comme_un_seul_chemin` | idem |
| Garantie 5 (périmètre exclusif) | omettre le test `.kit-paths` (retomber sur la liste gelée) | `test_garantie_5_…` (voit `check_specs.sh` apparaître) | idem |
| Garantie 6 (conditionnels neutralisés) | ne pas faire gouverner `.kit-paths` sur `CHEMINS_SI_PRESENTS` | `test_garantie_6_…` (voit `control-center` apparaître) | idem |
| Garantie 7 (`#`/vide ignorés) | ne pas couper le commentaire ou ne pas sauter la ligne vide | `test_garantie_7_…` | idem |
| Garantie 17 (dédoublonnage) | retirer le bloc `sort -u` sur `presents` | `test_garantie_17_…` (orphelin compté deux fois) | idem — cas réécrit en Round 1 après que la première version n'ait tué aucun mutant |
| Chemin absent nommé | supprimer la branche `elif [ "$KIT_PATHS_ACTIF" -eq 1 ]` | `test_chemin_absent_du_kit_nomme_avec_un_chemin_valide_a_cote` | idem |
| Glob littéral | (glob déjà littéral par construction — pas d'`eval`/expansion introduite) ; mutation testée : retirer le message nommé sur chemin absent | `test_glob_md_est_hors_perimetre_et_nomme_comme_chemin_absent` | idem |
| Déclaration vide/commentée | `${#declares[@]} -eq 0` → `-ge 0` (ou suppression de la branche) | `test_kit_paths_vide_…`, `test_kit_paths_entierement_commente_…` | idem |
| Diagnostic « aucun chemin trouvé » | `${#declares[@]} -eq 0` → `-ge 0` sur la branche adjacente (survivait avant Round 1) | `test_diagnostic_distinct_aucun_chemin_declare_nexiste_cote_kit` | idem — trouvé par revue, pas par conception initiale |
| Comptage du diagnostic | figer le compte affiché (toujours « 1 déclarés ») | `test_diagnostic_distinct_compte_deux_chemins_declares_absents` | idem |
| Non-régression message gelé | modifier mot pour mot le message préexistant | `test_non_regression_kit_paths_absent_kit_vide_message_gele_mot_pour_mot` | seul cas qui affirme `affirmer_seule_garde(..., "aucun_chemin")` — la clé existait déjà dans le harnais, exercée ici pour la première fois |

Chaque ligne ne tue que son propre test (vérifié par exécution, pas supposé) —
c'est la diagonale qu'ADR-0012 exige. Les mutations sur `KIT_PATHS_ACTIF` et
sur la dédoublonnage ont été appliquées et observées mourir sur ce dépôt
avant intégration ; elles ne sont pas laissées dans le code.

---
# Notes d'implémentation

## Ce que ce cycle a corrigé

Quatre défauts, **tous établis par exécution** avant toute conception :

1. **CRLF** — un `.kit-paths` enregistré sous Windows perdait **tout** son
   périmètre, puis le script accusait le distant.
2. **Espace** — un chemin en contenant une était découpé en plusieurs mots et
   perdu **en silence**.
3. **Chemin déclaré absent du kit** — **avalé sans un mot**, même avec un autre
   chemin valide déclaré à côté.
4. **Glob `*`** — expansé contre le répertoire **du projet**, jamais l'arbre du
   kit. Un projet déclarant `.claude/agents/*` ne recevait **jamais** un fichier
   ajouté par le kit : seulement ce qu'il possédait déjà. Une liste inclusive
   dont le contenu effectif est décidé par le projet n'est plus une
   déclaration — **ADR-0008 s'en trouvait vidé de son sens.**

Et le message accusant le distant ne sort plus sur une cause **locale** : trois
branches de diagnostic distinctes, dont une conserve le message historique mot
pour mot.

## Ce qui a changé pour de bon

**La grammaire rétrécit autant qu'elle s'élargit.** Supporter les espaces
*intérieures* impose de trimer explicitement celles de tête et de queue, que le
découpage par mots mangeait gratuitement. Un chemin ne peut donc plus commencer
ni finir par une espace, ni contenir un `#` ou un retour à la ligne.

C'est le prix assumé, et c'est écrit dans ADR-0015 — parce qu'on ne le
retrouverait **jamais** en lisant le code : on y verrait un `trim` d'apparence
anodine, pas une décision qui restreint un contrat public.

**Un `.kit-paths` contenant `*` change de sens** chez les projets qui en ont un.
Il donnait l'intersection avec ce qu'ils possédaient déjà ; il est désormais
littéral, donc signalé comme chemin absent. Plus honnête, mais c'est un
changement de comportement chez des tiers — signalé au CHANGELOG.

## Trois défauts trouvés dans le travail de ce cycle même

**Un mutant survivant.** `-eq 0` → `-ge 0` laissait les 69 tests verts : le
message « Aucun chemin déclaré n'existe côté kit » n'était asserté par **aucune**
assertion. Le livrable n'était pas prouvé. Trouvé par `code-reviewer`, en
mutant.

**Un test décoratif.** Le cas de la garantie 17 vérifiait un comportement
fourni par **git**, pas par le script : supprimer le bloc de dédoublonnage
entier laissait la suite verte. `code-reviewer` en a conclu que le bloc était
mort ; `backend-developer` a construit le cas discriminant et montré qu'il ne
l'est pas — **la boucle des orphelins itère directement sur `presents`**, sans
passer par git. Les deux avaient raison sur une moitié.

**Une justification fausse.** Le motif de dérogation à ADR-0012 — « une clé
ferait tomber TOUS les `affirmer_seule_garde(..., None)` » — était faux. En
ajoutant les clés, **seuls les cas neufs tombent**. Le motif réel est ailleurs :
le cas du glob déclencherait **deux** marqueurs. La conclusion tenait, le
raisonnement non.

## Un moment qui mérite d'être retenu

Le piège bash 3.2 — `"${tab[@]}"` sur un tableau vide échoue sous `set -u` en
bash < 4.4, donc sur macOS — **n'était pas reproductible ici** (bash local 5.2).
Il aurait dû rester une relecture, et je l'avais accepté comme tel.

`security-reviewer` a **compilé bash 4.3.0** pour le rendre éprouvable. Sous ce
bash : les trois chemins à tableau vide sortent proprement, le flux nominal va
au bout, la garde de bug-001 bloque, 69/69 tests passent. Le raisonnement du
développeur est **vérifié**, plus seulement argumenté.

Quand l'environnement ne permet pas d'exécuter, on fabrique l'environnement.

## Tests

**55 → 71 cas.** `shellcheck` passe de **un** warning à **zéro** — le support
des espaces a supprimé le `SC2086` préexistant par construction, et les deux
`# shellcheck disable` avec lui.

Matrice de mutation **diagonale**, deux chevauchements assumés et argumentés
(réintroduire le word-splitting réactive *aussi* le glob — même expansion non
quotée), une **équivalence déclarée** (le `\r` sur une ligne de commentaire est
avalé par la coupure du commentaire quel que soit l'ordre).

**7 des 14 premiers cas passent déjà sur le code d'avant le correctif**, et
c'est dit : quatre verrouillent un comportement **déjà correct**, deux étaient
absorbés **par accident** par l'ancien parsing, un est **délibérément** une
garde de non-régression. La distinction entre un test de régression et un
garde-fou a été faite explicitement, pas noyée dans un total.

## Statut final

✅ **Done — 2026-09-13.** Cycle : `orchestrator` → `spec-reader` → `debugger`
(reproduction des six cas) → `architect` (V1 à V4) → `backend-developer` →
`test-engineer` → `security-reviewer` (rôle AUDIT, **GO**) → `code-reviewer`
(**Request changes**, puis **Approved**) → corrections → `doc-writer`.

Relevés : **71/71 tests verts** · `shellcheck` **0 warning** · matrice
diagonale, mutants rejoués par le relecteur · `check_specs.sh` et
`check_doc_links.sh` verts · dépôt réel intact après chaque passage.

**Reste à faire**, ouvert par ce cycle : `bug-005` — le message ne montre pas le
caractère fautif quand il est invisible. Le correctif naïf (`printf %q`,
`cat -v`) mutilerait les chemins accentués légitimes : c'est le piège
d'ADR-0013, et ça demande une conception.
