## Métadonnées
- **ID** : feature-012
- **Slug** : kit-paths-gouverne-seul
- **Type** : feature (tests **et** correctif — voir l'avertissement ci-dessous)
- **Statut** : todo
- **Priorité** : haute
- **Version cible** : 0.6.0
- **Dernière mise à jour** : 2026-09-12
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
- un chemin contenant une **espace** : `for chemin in $CHEMINS` (l. ~198)
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

### Cas limites
- `.kit-paths` **vide** ou entièrement commenté : le script doit le **dire**,
  et non retomber silencieusement sur la liste gelée par défaut.
- `.kit-paths` absent : comportement inchangé (liste gelée par défaut).
- `.kit-paths` contenant uniquement des chemins absents du kit : message
  distinguant clairement ce cas d'un mauvais distant.

## Comportement actuel
`tools/update_kit.sh` l. ~120-133 lit `.kit-paths` par
`sed 's/#.*//' | grep -v '^[[:space:]]*$'`, puis itère sur la liste non quotée.
Les quatre garanties ne sont couvertes par aucun test. Les défauts de parsing
décrits ci-dessus sont **confirmés par lecture**, et restent à confirmer par
exécution (première tâche du cycle).

## Contraintes techniques
- Portable bash 3.2 — ni `declare -A`, ni `mapfile`
- Zéro dépendance externe (ADR-0006)
- ADR-0008 reste vrai : `.kit-paths` est **inclusif**, et gouverne aussi les
  chemins conditionnels. Le correctif ne doit pas rouvrir cette question
- Les correctifs de feature-005 et les gardes de bug-001 restent intacts
- Le harnais de feature-006 est **étendu, jamais refondu**

## Fichiers potentiellement concernés
- `tools/update_kit.sh` — lecture de `.kit-paths`, itération, messages
- `tests/test_update_kit.py` — les 4 cas + les cas limites
- `tests/harnais_kit.py` — extension éventuelle des primitives
- `CHANGELOG.md`, `README.md`, `GUIDE.md` si le comportement documenté change

## Livrables — check-list
- [ ] A1 — Reproduire les deux défauts de parsing (CRLF, espace) et coller la
      sortie réelle dans cette spec
- [ ] A2 — Garanties 5, 6, 7, 17 : un cas chacune
- [ ] A3 — CRLF toléré
- [ ] A4 — Chemin avec espace : traité ou refusé nommément, jamais perdu
- [ ] A5 — Chemin déclaré mais absent du kit : signalé nommément
- [ ] A6 — Diagnostic distinct entre « rien ne correspond » et « mauvais distant »
- [ ] A7 — `.kit-paths` vide ou entièrement commenté : le script le dit
- [ ] C1 — `CHANGELOG.md`, et `README.md`/`GUIDE.md` si le documenté change
- [ ] D1 — Mutation : chaque cas neuf vu mourir
- [ ] D2 — Anti-chevauchement démontré pour chaque cas

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
- `CHANGELOG.md` — entrée sous 0.6.0 : un `.kit-paths` en CRLF fonctionne enfin
- `README.md` / `GUIDE.md` — si les règles d'écriture de `.kit-paths` changent

## Critères d'acceptation
- [ ] Un `.kit-paths` en CRLF produit exactement le même périmètre qu'en LF
- [ ] Un chemin contenant une espace n'est jamais perdu en silence
- [ ] Un chemin déclaré mais absent du kit est nommé
- [ ] Le message accusant le distant n'apparaît plus sur un défaut local
- [ ] Les quatre garanties ont chacune leur cas, vu mourir par mutation
- [ ] Suite complète verte, zéro régression
- [ ] Lint propre (`shellcheck`), pas de warning nouveau

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

## Hors périmètre
- Les garanties 1, 2, 14, 15, 16 — feature-006 (lot 1)
- Les garanties 3, 4, 8, 9 — feature-013
- Les garanties 10 à 13 — feature-014
- La garde `skip-worktree` — `bug-003`
