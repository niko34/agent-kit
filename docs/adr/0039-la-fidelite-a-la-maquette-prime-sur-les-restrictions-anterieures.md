# ADR-0039 — La fidélité à la maquette prime sur les restrictions antérieures

## Statut

Accepté

## Date

2026-09-22

## Contexte

### §1. Le fait générateur : 135 assertions vertes, un écran qui ne ressemble pas à la maquette

Après les six premiers lots du cycle 2 (`ADR-0038`), les cinq gardes de
conformité étaient vertes et le point d'arrêt humain n°4 avait validé la
structure. Le 2026-09-22, l'utilisateur a néanmoins signalé, mot pour mot :
« Je t'avais autorisé à créer de nouvelles ADR. **Rien ne justifie de livrer
un livrable qui couvre une petite partie de ce que j'ai demandé.** Fais ce
qu'il faut pour mettre en œuvre la maquette. »

Mesuré à ce moment-là : la table de partition `F0` du lot 0 avait affecté
**88 éléments sur 113** du prototype à trois specs hors périmètre
(`feature-022`, `023`, `025`) plutôt qu'au cockpit lui-même, et **135
assertions vertes** coexistaient avec un écran qui ne ressemblait pas à la
maquette. Les deux faits ne se contredisent pas : les gardes mesuraient
fidèlement ce qui avait été **décidé d'adopter**, pas ce que la maquette
contenait dans son ensemble.

**La cause, identifiée après coup.** Le point d'arrêt humain n°1 (validation
de la carte de périmètre `F0`) avait soumis un **tableau de comptes** —
« 64 id et 135 classes, répartis adopté/différé/écarté » — et non deux
rendus comparés côte à côte. Un tableau de comptes ne montre pas ce que la
répartition fait à l'écran. Il a fallu trois lots de plus pour que la
comparaison visuelle directe (prototype et cockpit dans le même Chromium)
révèle l'ampleur de l'écart, alors que les chiffres, eux, étaient exacts
depuis le début.

### §2. `ADR-0020` n'est amendé QUE sur l'identité du développeur

Au lot 0, la carte de périmètre avait exclu du cockpit sept contrôles de la
barre supérieure (`project-switcher`, `notification-button`,
`notification-badge`, `avatar`, `user-name`, `account-button`) au motif
« barre supérieure amputée par `ADR-0020` : un centre de contrôle appartient
à un développeur ».

**Vérifié, `ADR-0020` ne contient AUCUN** des mots `projet`, `barre`,
`switcher`, `avatar`, `notification` (0 occurrence chacun). Son §1 interdit
les **comptes et rôles multiples** — « pas de comptes, pas de rôles, pas
d'identités multiples » — ce qui ne dit rien d'un sélecteur de projet, d'un
avatar ou de notifications. L'exclusion de la barre supérieure était une
**mauvaise lecture du lot 0**, pas une application correcte d'`ADR-0020` :
elle est corrigée ici comme un **fait du cycle**, pas comme un amendement
d'`ADR-0020` sur ce point.

Ce qu'`ADR-0020` amende réellement, et pour la première fois par un texte
qui en dépend : `vcs.identite()` (nouveau, `control-center/backend/vcs.py`)
lit `git config --get user.name`, tronqué à 80 caractères, exposé
**seulement** dans `/api/etat.identite`, jamais `user.email`, `getlogin()`
ni `$USER`. C'est l'implémentation concrète de l'invariant du §1
d'`ADR-0020` (« il pilote une session Claude liée à *son* compte ») pour
`#user-name` et l'avatar — des initiales dérivées du nom réel, pas la
fabrication (« JD ») que la maquette suggérait par un exemple.

### §3. `ADR-0023` amendé : constat mesuré vs. cycle lancé depuis le cockpit

`ADR-0023` établissait, sur 14 cycles **observés** (mesurés après coup dans
le journal), que la corrélation cycle → spec par fichiers modifiés ne
désigne un candidat unique que dans 2 cas sur 14 — d'où la décision : un
cycle observé ne porte pas de nom, seulement une heure de départ et un
agent ouvrant.

**Ce fait mesuré reste vrai, sans changement, pour tout cycle observé
après coup.** Il cesse en revanche de s'appliquer à un cycle **lancé depuis
le cockpit** (`POST /api/spec/lancer {cle, spec_id}`, `feature-025`,
`ADR-0040`) : dans ce cas, la spec n'est plus une corrélation *a
posteriori* incertaine, elle est le **paramètre de la requête qui a
déclenché le cycle** — une donnée connue avec certitude à la source, pas
une heuristique.

`#cycle-title` affiche donc désormais **« Cycle #N »** quand la spec n'est
**pas** connue (cycle observé, sans lien de lancement établi) — jamais le
vide : c'est la cible `aria-labelledby` de la région principale, et une
région principale sans libellé est un défaut d'accessibilité en soi. Quand
la spec **est** connue (cycle né d'un `/api/spec/lancer`), son titre
s'affiche. `ADR-0023` est amendé sur ce point ; son raisonnement sur la
corrélation *a posteriori* n'est pas remis en cause.

## Décision

### §4. Le cycle porte cinq specs, et pourquoi ce n'est PAS `ADR-0017`

À la réouverture, `feature-022` (conversation), `023` (tokens) et `025`
(actions du backlog) sont **absorbées** dans `feature-021`, portant le
cycle à cinq specs dans `doing/` avec `bug-017` (déjà absorbée au titre
d'`ADR-0017`, `ADR-0038 §3`).

**Ce n'est explicitement pas la même absorption.** Le critère d'`ADR-0017`
est mécanique : *un défaut qui désarme ou rend inatteignable une garde
livrée par ce cycle*. Aucune des trois specs neuves ne remplit ce critère —
aucune garde livrée par `feature-021` n'est désarmée par leur absence. Le
motif réel est la **réouverture de périmètre par l'utilisateur**, qui avait
autorisé dès son premier message du 2026-09-20 la création de nouveaux ADR
si des décisions antérieures s'y opposaient.

**Pourquoi le distinguo compte.** Absorber `feature-022`/`023`/`025` au
titre d'`ADR-0017` aurait étiré son critère mécanique jusqu'à recouvrir « le
périmètre a changé et c'est pratique de tout faire ensemble » — exactement
le régime qu'`ADR-0017` a été écrit pour empêcher (« absorber tout constat
trouvé en cycle » y est explicitement une alternative écartée). Le dépôt
aurait hérité d'un précédent : *on absorbe quand c'est pratique*. La
décision de reprise du 2026-09-22 est donc consignée ici, comme un
arbitrage humain explicite et distinct, avec sa propre section
« Absorption dans le cycle » dans chacune des trois specs.

### §5. `PIEGES §16` : le motif reste, l'exclusion tombe

`progress-track` (barre de progression linéaire à pourcentage sur
`.feature-card`, trois instances dans le prototype) avait été **écarté**
au lot 0, motif : « aucune donnée du dépôt ne mesure un pourcentage
d'avancement d'une spec, `PIEGES §16` ». La réouverture le fait revenir,
mais **redéfini plutôt que repris tel quel** : le lot 9 mesure qu'un ratio
de cases cochées donne **36 %** sur une spec jamais commencée (les cases
du gabarit qui ne sont pas des livrables gonflent le compte) — un chiffre
aussi trompeur que celui que `PIEGES §16` interdisait déjà. La grandeur
retenue est **l'état de colonne** (première / intermédiaire / dernière,
lue côté serveur par `gestion_spec.role_colonne()` et côté client sur
`etat.colonnes` — la même position), avec **trois largeurs fixes** (12 %,
55 %, 100 %), jamais une division. Même patron que l'anneau d'activité du
disque (`--progress`, `ADR-0038 §5` : `0deg`/`270deg`/`360deg`). L'élément
est décoratif (`aria-hidden`, jamais `role="progressbar"` ni
`aria-valuenow`) : la colonne porte déjà cette information au clavier et au
lecteur d'écran par son titre (`.column-title`) ; la barre n'en est qu'un
renfort visuel, jamais une seconde source de vérité.

`PIEGES §16` garde donc son **motif** (n'affiche jamais un pourcentage que
le dépôt ne mesure pas) mais **perd son exclusion** de `progress-track` —
l'élément revient, sur une grandeur réelle et discrète plutôt qu'absent ou
qu'un ratio mesuré trompeur.

### §6. La garde de fidélité d'ensemble

Le trou révélé par le §1 — cinq gardes locales vertes, ressemblance
d'ensemble absente — appelait un sixième contrat, orthogonal aux cinq
premiers : non plus « chaque propriété correspond-elle ? » mais « l'écran
**ressemble-t-il** ? ». Trois clauses, dont la dernière manquait au plan
initial :

1. **Couverture** — `0` entrée `differe:*` restante dans la table `F0` :
   plus aucun élément du prototype n'est laissé de côté sans verdict
   `adopté`/`écarté` nommé.
2. **Vocabulaire de forme** — inclusion **et emploi** : un jeton de forme ou
   d'élévation déclaré dans `:root` et jamais consommé par un sélecteur
   réel est un **défaut en soi**, pas une simple négligence. C'est le
   correctif direct du §1 : les cinq gardes précédentes vérifiaient
   seulement la déclaration, jamais l'usage — deux élévations M3 étaient
   déclarées au bit près pour **zéro** usage, et des rayons (`2px`/`4px`)
   n'existant nulle part dans le prototype avaient été introduits sans
   qu'aucune garde ne s'en aperçoive.
3. **Ressemblance rendue** — le prototype ET le cockpit chargés dans le
   **même** Chromium, comparés par ancre (style calculé, géométrie
   normalisée, ordre vertical) et par signature globale.

**Ce qui rend cette dernière clause non tautologique : l'attendu n'est pas
une table recopiée, c'est le prototype CHARGÉ.** Deux garanties le
vérifient : (a) une contre-épreuve où changer le **texte** d'une carte doit
laisser la garde **verte** — sinon c'est un diff de pixels, pas une garde de
forme ; (b) une tolérance de bande **mesurée** (0,5 %), justifiée par un
écart intra-scène de 19 px contre un écart inter-scène de 104 px, jamais une
valeur choisie a priori.

Portée bornée à `border-radius`/`box-shadow` pour la clause 2, **mesuré** :
l'étendre remonterait 26 divergences sur du CSS antérieur à Material 3,
documentées comme héritage plutôt que subies en silence.

## Alternatives considérées

- **Continuer à livrer le périmètre restreint du lot 6, en renvoyant les
  88 éléments différés à leurs specs respectives comme prévu au lot 0.**
  Écartée explicitement par l'utilisateur : « rien ne justifie de livrer un
  livrable qui couvre une petite partie de ce que j'ai demandé ».
- **Absorber `feature-022`/`023`/`025` au titre d'`ADR-0017`.** Écartée,
  voir §4 : aucune garde livrée n'est désarmée par leur absence ; le motif
  réel est une réouverture de périmètre, pas un défaut qui rend une garde
  inatteignable.
- **Amender `ADR-0020` sur l'exclusion de la barre supérieure.** Écartée,
  voir §2 : il n'y a rien à amender, l'exclusion reposait sur une lecture
  erronée d'un ADR qui ne mentionne aucun des contrôles concernés.
- **Laisser `progress-track` écarté en totalité.** Écartée, voir §5 : la
  fidélité à l'ensemble de la maquette l'exige ; le laisser absent aurait
  laissé un jeton déclaré au prototype sans aucune reprise, contre la garde
  de fidélité d'ensemble du §6.
- **Reprendre `progress-track` comme un ratio de cases cochées dans la
  spec.** Écartée, voir §5 : mesurée à 36 % sur une spec jamais commencée —
  aussi trompeuse que le pourcentage inventé que `PIEGES §16` interdisait
  déjà, seulement déguisée en donnée réelle.

## Conséquences

### Positives

- Le cockpit couvre désormais la maquette dans son ensemble, mesuré par la
  clause de couverture (`0 differe:*`) plutôt qu'affirmé.
- La garde de fidélité d'ensemble détecte une classe de défaut que les cinq
  gardes locales ne pouvaient pas voir : un jeton déclaré et jamais employé.
- La distinction entre `ADR-0017` et une réouverture de périmètre humaine
  reste lisible pour tout cycle futur qui absorbera des specs.

### Négatives

- Le cycle porte cinq specs simultanément, avec une seule phase de test, de
  revue et de documentation — un risque de confusion pour qui lit le journal
  sans le contexte de cette décision.
- La garde de ressemblance rendue dépend de deux instances Chromium
  identiques et d'un seuil de tolérance mesuré empiriquement ; elle est plus
  coûteuse à exécuter et à maintenir que les cinq gardes locales.

### Ce que ça verrouille

- Tout point d'arrêt humain portant sur du visuel doit désormais soumettre
  **deux rendus comparés côte à côte**, jamais un seul tableau de comptes —
  leçon explicite de méthode tirée du §1, applicable au-delà de ce cycle.
- Toute future garde de conformité locale (jetons, classes, durées) doit
  être doublée d'une vérification d'**emploi**, pas seulement de
  déclaration, sous peine de reproduire le trou du §1.

## Références

- Code : `control-center/backend/vcs.py` (`identite()`) ;
  `control-center/web/test_conformite_formes.js` (clause miroir emploi/
  déclaration) ; `control-center/web/test_app_fidelite_navigateur.py`
  (garde de ressemblance rendue, comparaison par ancre et signature) ;
  `control-center/web/index.html` (`#cycle-title`, `aria-labelledby`).
- Specs : `specs/features/doing/feature-021-revenir-a-un-tableau-de-bord-unifie.md`
  (journal de bord, réouverture du 2026-09-22) ; `feature-022`, `feature-023`,
  `feature-025` (sections « Absorption dans le cycle »).
- ADR : [ADR-0017](0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md)
  (critère d'absorption, dont ce cycle se distingue explicitement) ;
  [ADR-0020](0020-un-centre-de-controle-appartient-a-un-developpeur.md)
  (§1, non amendé sur la barre supérieure — seule l'identité l'est) ;
  [ADR-0023](0023-un-cycle-observe-ne-porte-pas-de-nom.md) (amendé, §3
  ci-dessus) ; `ADR-0038` (méthode du cycle, registre `ATTENDU_ROUGE`) ;
  `ADR-0040` (`/api/spec/lancer`, qui rend un cycle non-observé).
