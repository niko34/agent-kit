# ADR-0038 — La méthode du cycle 2 : gardes avant code, un registre borné, et `bug-017` absorbé

## Statut

Accepté

## Date

2026-09-22

## Contexte

`ADR-0029` avait tranché de revenir au mono-écran et refusé `three.js` ; le
cycle qui devait l'implémenter (`feature-021`) a été **refondé** le
2026-09-20 quand l'utilisateur a fourni sa propre maquette Material 3 sous
forme de **prototype HTML exécutable**
(`control-center/maquettes/2026-09-20-maquette-materiel-3.html`, copie
normative de `docs/design-references/control-center-animated-prototype.html`)
et demandé « la maquette précise, pas une interprétation ».

Ce changement de nature — d'un design à inventer à un design **déjà écrit
en code** — a permis quelque chose d'inhabituel dans ce dépôt : la
conformité ne se juge plus à la lecture, elle se **mesure** par comparaison
automatique entre le prototype et l'implémentation, sur cinq contrats
(jetons, durées d'animation, parité des classes, contrat d'accessibilité,
contrastes). Le présent ADR documente la méthode que ce régime a imposée au
cycle entier, et une absorption qu'il a rendue nécessaire.

## Décision

### §1. La fidélité prime, l'usage des gardes se restreint

Les cinq gardes de conformité (`F1` jetons, `F2` durées, `F3` classes, `F4`
accessibilité, `F5` contrastes) sont écrites et commitées **au lot 0**,
avant toute ligne de production sous `control-center/web/`. Elles lisent le
prototype comme seule source normative, **jamais** `docs/`
(`control-center/maquettes/`, que le clone jetable de test copie ;
`PIEGES §32`) — une garde qui lirait le prototype ailleurs serait livrée
**morte** dans le harnais qui la vérifie.

Chaque garde porte deux disciplines pour rester informative, pas seulement
verte :
- une **assertion d'atteignabilité bruyante** (l'artefact lu existe, n'est
  pas vide, et une grandeur **dérivée** de son contenu — jamais récitée —
  est affichée) ;
- **chaque assertion nomme sa raison d'échec attendue**, pour que « vu
  rouge » (voir §2) prouve que la garde échoue *pour la bonne raison*, pas
  simplement qu'elle échoue.

« Vu rouge » ne remplace jamais la mutation : `D2` (mutation des gardes
elles-mêmes, `PIEGES §37`) reste dû, y compris sur les gardes écrites avant
le code qu'elles gardent.

### §2. Le registre `ATTENDU_ROUGE` — borné, jamais une amnistie

**Le problème qu'il résout.** Écrire les cinq gardes au lot 0 et les voir
échouer produit cinq gardes rouges commitées pendant plusieurs lots, ce qui
contredit la règle « le dépôt est vert à la sortie de chaque lot ».

**La forme.** Chaque fichier de garde porte une table `ATTENDU_ROUGE = {…}` :
une entrée par assertion encore fausse, avec **le lot qui la ferme** et la
date. La garde échoue dans deux cas :

1. toute régression **hors** registre ;
2. **toute entrée du registre qui se met à passer sans avoir été retirée.**

C'est la clause (2) qui empêche le registre de devenir une amnistie — même
patron que `test_ci_partition_navigateur.py` (`ADR-0037 §3`) : trois
ensembles qui doivent coïncider, pas une liste qu'on allonge. Une entrée
**sans lot de clôture nommé** est traitée comme un échec de la garde au même
titre qu'une entrée périmée : « le lot qui la ferme » n'est pas déclaratif,
il est vérifié.

Le registre est une énumération tenue à la main (`PIEGES §21`) ; c'est
précisément la clause (2) qui la rend non périmable, à l'inverse d'une
liste qu'on se contente d'allonger.

**Bénéfice non prévu** : le registre **est** l'état d'avancement du cycle,
versionné — la réponse directe à la leçon de `feature-020` (59 cases à
`[ ]` pour une quarantaine de livrables déjà faits, après une interruption
de session).

**Repousser le lot de clôture d'une entrée existante pour la faire tenir
est interdit** ; un changement de lot est une décision écrite avec sa
raison (mesuré au lot 2 : deux entrées scindées, deux lots de clôture
distincts, aucun repoussé sans le dire), jamais un glissement.

### §3. Absorption de `bug-017` au titre d'`ADR-0017`

**Verdict : absorbée dans ce cycle, traitée au lot 3, avant la sortie de
son point d'arrêt humain.** Le critère d'`ADR-0017` est mécanique, pas
prudentiel, et quatre points l'établissent :

1. `F4b` (contrat d'accessibilité, volet runtime) porte l'assertion exacte
   imposée par `bug-017` : « **0** contrôle atteignable hors modale ». Avec
   le défaut ouvert, cette assertion est fausse au lot 5.
2. Elle doit donc entrer au registre `ATTENDU_ROUGE` — qui exige un lot de
   clôture. Si `bug-017` reste hors cycle, **aucun lot ne la ferme** :
   l'entrée devient inexpirable, la clause (2) ne peut jamais se déclencher
   sur elle, et le registre devient l'amnistie qu'il est conçu pour
   empêcher. La garde n'est pas contournée : elle est **désarmée par
   construction**.
3. Le correctif exige que la porte d'authentification soit enfant direct de
   `<body>` et au-dessus de toute section — une contrainte structurelle
   décidée au **lot 3**, qui est le point de non-retour visuel validé par
   l'humain. La reporter obligerait soit à rouvrir `index.html` après ce
   point de non-retour, soit à livrer une porte à laquelle l'inertie ne
   serait plus attachable sans refaire le lot 3.
4. `feature-021` (cycle 1) avait **déclaré** le mécanisme d'inertie en `U5`
   sans le livrer. Un second cycle qui réécrit le même fichier en laissant
   `U5` déclaré et non livré est le cas nominal d'« une protection annoncée
   qui ne s'applique pas », que `CLAUDE.md` fait entrer dans le cycle en
   cours.

**État mesuré du défaut au moment de l'absorption** : `grep -rn "inert"
control-center/web/*.{js,html,css}` (hors `test_`) → une seule occurrence,
un commentaire d'`app.js:2216` disant explicitement que le défaut *n'est
pas corrigé*. Aucun mécanisme d'inertie n'existait alors dans le module.

**Pas d'ADR dédié à `bug-017` lui-même.** Sur les quatre absorptions déjà
pratiquées par ce dépôt (`bug-008`/`bug-009` → `ADR-0018` ; `bug-016` →
`ADR-0024 §3` ; `bug-013` → `ADR-0023`/`ADR-0021` ; `bug-019` →
`ADR-0035 §`), aucune n'a reçu d'ADR séparé : chacune est une section
datée de l'ADR substantiel du cycle qui l'a absorbée. `CLAUDE.md` exige
seulement que la décision soit « écrite dans un ADR — pas subie ». Cette
section en tient lieu.

**Conséquences de procédure** : `git mv specs/features/todo/bug-017-*.md
specs/features/doing/` (déplacement, jamais copie) ; deux specs dans
`doing/`, ce que `check_specs.sh` n'interdit pas (`ADR-0017`,
Conséquences) ; une seule phase de test, de revue et de documentation. Les
critères d'acceptation de `bug-017` s'ajoutent à ceux de `feature-021`.

### §4. Les noms du prototype comme clé de jointure de toutes les gardes

**Tranché : l'implémentation reprend les noms de classes ET les noms de
`@keyframes` du prototype, à l'identique.** C'est la décision la plus
structurante du lot 0, pour une raison mécanique : `F2` compare des tables
`(nom → durée, délai, courbe)` et `F3` des ensembles de classes. Deux
tables ne se comparent que par une **clé**. Sans identité des noms, la
seule comparaison possible est « le multi-ensemble des durées est le même »
— vraie pour n'importe quelle permutation, une garde verte à vide. `F3`
dégénère symétriquement en « le nombre de classes est le même ».

Ce que ça impose, appliqué tout au long du cycle :

1. **Interdiction de renommer**, y compris pour se conformer à une
   convention interne héritée (le préfixe `dg-` du diagramme précédent a
   disparu **avec** ce qu'il nommait, `ADR-0031 §1`, pas par choix de
   nommage).
2. **Toute classe et tout `@keyframes` en plus** figure dans une liste
   déclarée (`CLASSES_AJOUTEES`, `KEYFRAMES_AJOUTES`, sur le même patron que
   `JETONS_AJOUTES` de `F1`) **avec sa raison**. La garde échoue sur tout
   nom hors prototype **et** hors liste — la clause miroir, encore.
3. **La parité se mesure par parseur, jamais par `grep`** (`PIEGES §26`) :
   `grep -oE '\.[a-zA-Z…]'` sur le prototype rend 249 « classes », un compte
   faux qui capture `.2s`, `.textContent`, `.34`.
4. **Une règle CSS vide ne protège rien** (`PIEGES §33`) : une classe posée
   « pour la parité » sans au moins une déclaration ne fait échouer aucune
   mutation.

Cette clé de jointure s'impose à `feature-022`, `023` et `025`, qui bâtissent
sur la même maquette (partitionnée par `F0`) : renommer une classe adoptée
casserait `F2`/`F3` du cockpit entier, pas seulement le lot qui la touche.

### §5. Ce que le cycle a fini par livrer au centre du disque — constat, pas prédiction

Au lot 4, faute de données de tokens dans le périmètre alors défini, le
centre du disque a été livré **sans chiffre** — sigle seul, dégradable et
jamais à trous (`ADR-0031 §5` avait explicitement anticipé ce cas : « seul
le chiffre du centre dégrade alors, pas l'anneau »).

Le 2026-09-22, l'utilisateur a rouvert le périmètre sur la maquette entière
et rappelé une décision antérieure non reprise : le backend entre dans le
périmètre pour capter les tokens, et le chiffre est la **somme entrée +
sortie** (voir `ADR-0039`, qui documente la réouverture). `feature-023` a
été **absorbée** dans ce même cycle, au lot 12, et son lecteur de
transcripts est traité à part dans `ADR-0041`.

**Ce paragraphe corrige donc, en le constatant plutôt qu'en le prédisant,
ce que la version précédente de ce plan annonçait comme non livré : la
branche « centre avec chiffre » EST livrée.** Le disque porte désormais
**trois** états, pas deux :

| État | Ce qui s'affiche |
|---|---|
| Chiffre connu | somme `input_tokens + output_tokens` du passage |
| Chiffre absent | le nœud du chiffre n'existe pas dans le DOM — jamais un `0`, un `—` ni un espace réservé |
| Relevé partiel | le budget de lecture des transcripts (`ADR-0041`) a coupé avant terme — dit explicitement, jamais confondu avec l'absence |

L'anneau reste piloté par l'état seul (`ADR-0031 §5`) : une garde interdit
désormais de le recoupler aux tokens, et deux mutations qui tentent ce
recouplage meurent. La dépendance favorable notée par `ADR-0031 §5` —
l'anneau reste lisible même si la lecture des transcripts est refusée ou
indisponible — tient donc toujours, alors même que le chiffre, lui, est
maintenant peint dès que la donnée existe.

## Alternatives considérées

- **Garder les gardes en arbre de travail jusqu'au lot qui les verdit,
  plutôt qu'un registre commité dès le lot 0.** Écartée : c'est
  l'invitation à ajuster la garde au code plutôt que l'inverse, le vice
  mesuré de `bug-022` (quatre reboucles avant que la cause — exposition,
  pas contention — soit établie).
- **Une branche à fenêtre rouge déclarée**, plutôt qu'un registre par
  entrée. Écartée : elle perd la trace datée par entrée et rend la reprise
  après interruption aveugle — l'inverse de ce que `feature-020` a coûté.
- **Un ADR dédié pour `bug-017`.** Écartée : aucune des quatre absorptions
  précédentes du dépôt n'en a reçu un ; une section de l'ADR substantiel du
  cycle est le patron établi.
- **Reporter `bug-017` malgré la réouverture de périmètre.** Écartée : le
  critère d'`ADR-0017` est mécanique (la garde F4b serait désarmée par
  construction), pas une question d'opportunité.

## Conséquences

### Positives

- La conformité au prototype est **mesurée**, pas jugée : tout cycle futur
  touchant le cockpit doit passer les cinq gardes ou réviser cet ADR.
- Le registre `ATTENDU_ROUGE` rend la reprise après interruption lisible
  sans re-mesurer le dépôt — contrairement à `feature-020`.
- `bug-017` est fermé avec sa mesure chiffrée (0 contrôle atteignable hors
  modale, vérifié en HTTP au lot 5), pas seulement avec un mécanisme posé.

### Négatives

- Le registre est une énumération tenue à la main : sans la clause (2), il
  se serait dégradé en simple liste de dette. Tout mainteneur qui
  l'allongerait sans clause miroir referait l'erreur qu'il corrige.
- La règle « les noms du prototype sont la clé de jointure » verrouille le
  vocabulaire de classes du cockpit à celui du prototype : un renommage
  futur, même motivé, doit d'abord réviser `F2`/`F3` et les listes
  déclarées.

### Ce que ça verrouille

- Tout cycle futur qui écrit une garde avant son code hérite du régime
  `ATTENDU_ROUGE` tel que défini ici (clause 1 + clause 2 + lot de clôture
  nommé).
- `feature-022`, `023`, `025` héritent de la clé de jointure du §4 : elles
  ne peuvent pas renommer un élément adopté du prototype sans casser les
  gardes du cockpit.

## Références

- Code : `control-center/web/test_conformite_{perimetre,jetons,animations,
  classes,a11y,contrastes}.{js,py}` (les six gardes du lot 0, `F0`-`F5a`) ;
  `control-center/web/test_app_a11y_navigateur.py` (`F4b`, lot 5, ferme
  `bug-017`) ; `control-center/web/app.js` (`freresDeLaPorte`,
  `fixerInerteAutourDeLaPorte`).
- Specs : `specs/features/doing/feature-021-revenir-a-un-tableau-de-bord-unifie.md`
  (journal de bord, cycle 2) ; `specs/features/doing/bug-017-la-porte-ne-rend-pas-la-page-inerte.md`.
- ADR : [ADR-0017](0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md)
  (critère d'absorption) ; [ADR-0031](0031-la-grammaire-du-disque-d-agent-change.md)
  §5 (anticipation du cas « lecture des transcripts refusée ») ;
  [ADR-0037](0037-un-harnais-navigateur-se-declare-et-ne-tourne-qu-une-fois.md) §3
  (précédent du patron « trois ensembles qui coïncident ») ; `ADR-0039`
  (réouverture de périmètre qui a permis la livraison du §5) ; `ADR-0041`
  (lecture des transcripts, budget et confinement).
