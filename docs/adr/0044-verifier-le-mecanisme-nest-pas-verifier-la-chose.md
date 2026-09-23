# ADR-0044 — Vérifier le mécanisme n'est pas vérifier la chose

## Statut

Accepté

## Date

2026-09-23

## Contexte

Le cycle portant `feature-026` et `feature-028` (absorbée au titre d'
`ADR-0017`, voir `ADR-0043`) a produit **sept défauts**, tous établis par
l'humain en se servant du produit — jamais par la chaîne d'agents, pourtant
composée cette fois d'un `architect`, d'un `ux-ui-designer`, d'un
`security-reviewer` en rôle GATE (deux passages), d'un `test-engineer`
(une campagne de mutation dédiée) et d'un `code-reviewer` :

| # | Défaut | Détecté par | Ce qui était pourtant vérifié, vert |
|---|---|---|---|
| 1 | Le canal parlait à un processus lancé par le cockpit, jamais à la session réelle | l'humain | que le canal `json-lines` de `feature-022` fonctionne |
| 2 | L'envoi refusé pendant que Claude travaille, alors que le TUI met en file | l'humain | que l'heuristique d'occupation est atteignable et meurt par mutation |
| 3 | Un état « Occupée » de la pastille, absent de toute référence normative | l'humain (relu par le designer lui-même) | que chaque couleur choisie a un précédent dans le design system |
| 4 | Sept sections héritées, censées disparaître (`U1` de `feature-021`), toujours visibles | l'humain | `F7` de `feature-021` — « 0 `role="tab"` » |
| 5 | La clôture de `feature-021` elle-même, qui a coché `F7` sans vérifier l'énoncé complet | l'agent principal, après le signalement humain | revue de code et campagne de mutation, toutes deux passées sur `feature-021` |
| 6 | Le journal du cockpit n'écrivait jamais le `destinataire` qu'il devait porter | l'humain, en relisant la ligne écrite après un envoi réel | que la journalisation précède l'envoi sur tous les chemins (GATE P2) |
| 7 | La boîte d'ajout ouvre un bouton inatteignable (`elementFromPoint` → `null`) clavier iPad affiché | l'humain (rapport initial), puis re-établi par exécution en revue de code après un premier correctif incomplet | que les unités de viewport dynamique (`dvh`) remplacent les `vh` statiques |

Chacune de ces vérifications a réellement tourné, réellement réussi, et n'a
rien détecté. Ce n'est pas un défaut d'assiduité : `test-engineer` a mesuré
un GATE P1 à neuf conditions et un GATE P2 à quatre, une campagne de mutation
a tué dix-huit mutants sur ce seul cycle, `code-reviewer` a exécuté des cas
positifs et négatifs sur chaque garde avant de l'approuver. Le mécanisme
outillé a fonctionné exactement comme prévu.

## Décision

### Le diagnostic : la vérification portait sur le mécanisme, jamais sur la chose

Dans les sept cas, une vérification existait, elle était **verte**, et elle
portait sur le **mécanisme** — « le canal transmet-il un octet ? »,
« l'heuristique meurt-elle si on la neutralise ? », « cette couleur a-t-elle
un précédent ? », « le DOM ne contient-il aucun `role="tab"` ? », « la
journalisation a-t-elle lieu avant l'envoi ? », « les `vh` sont-ils
remplacés par des `dvh` ? » — jamais sur la **chose** que ce mécanisme devait
produire : « ce canal atteint-il la session que l'humain pilote
réellement ? », « ce refus reflète-t-il ce que `claude` fait vraiment
pendant qu'il travaille ? », « combien d'états la référence distingue-t-elle,
et qui a autorisé d'en ajouter un ? », « l'ancien tableau de bord a-t-il
disparu ? », « le champ qu'on exigeait deux fois est-il présent sur la ligne
écrite ? », « le bouton est-il atteignable au sens de `elementFromPoint`,
pas seulement dimensionné en unités dynamiques ? ».

Une garde peut donc être **atteignable, mutée et verte**, et garder le
**mauvais invariant** — un invariant réel, vérifié avec rigueur, mais qui
n'est pas celui que l'utilisateur final éprouve. Aucun outillage de ce cycle
(mutation, introspection AST, exécution en navigateur réel) ne détecte ce
décalage, parce que tous mesurent la conformité **au brief tel qu'écrit**,
jamais la conformité **à l'usage**.

### Ce que ça impose aux cycles suivants

1. **Toute garde comportementale s'écrit avec, en regard, l'énoncé de la
   chose qu'elle prétend garantir — en langage d'usage, pas en langage de
   mécanisme.** « Le canal transmet un octet » n'est pas « le message
   atteint la session que l'humain pilote ». La seconde formulation est
   celle qui doit apparaître dans la spec, la garde ne fait qu'en dériver.
2. **Une clôture de spec qui coche une case chiffrée ou structurelle
   (« 0 `role="tab"` », « N sections retirées ») doit relire l'énoncé
   complet du critère, pas seulement sa forme mesurable la plus commode.**
   C'est le défaut #5 ci-dessus, sur mon propre travail de clôture — la
   garde qui manquait n'est pas une garde technique plus poussée, c'est une
   relecture de l'intention derrière le chiffre.
3. **Une table de verdicts par section (à la manière de `U1` de
   `feature-021`) doit être accompagnée d'une garde d'exécution qui vérifie
   chaque verdict**, jamais d'une seule assertion agrégée qui pourrait
   passer alors que cinq verdicts sur six restent lettre morte — c'est
   `A1bis` de `feature-028` (`ADR-0043`), qui n'existait pas au moment de
   `feature-021`.
4. **Une mesure déjà écrite et citée pour répondre à une question ne
   traverse pas automatiquement jusqu'aux autres décisions qu'elle
   informe** — voir défaut #2 et #3, et `PIEGES §64`. Après toute mesure, se
   demander explicitement à quelles autres décisions en cours elle
   s'applique.
5. **Un correctif partiel qui répare la cause la plus visible ne ferme pas
   le défaut** — défaut #7 : les `dvh` réparaient une cause réelle, mais un
   deuxième mécanisme (une grille CSS à rangées implicites non bornées)
   continuait de rendre le bouton inatteignable. La garde de clôture doit
   rejouer le symptôme original **au complet** (ici : `elementFromPoint`
   sur le bouton, à plusieurs hauteurs de viewport mesurées), pas seulement
   vérifier que la cause identifiée a disparu.
6. **`feature-027`** (« le panneau de conversation se comporte comme le
   client Claude ») est la réponse structurelle à ce cycle pour la surface
   qu'elle couvre : comparer, élément par élément, le comportement du
   cockpit à celui du client réel que l'humain utilise déjà, au lieu
   d'inventer un comportement puis de le garder avec rigueur. Cet ADR
   généralise le principe au-delà de cette seule surface.

## Alternatives considérées

- **Ajouter davantage de mutation, de couverture ou de revue.** Écartée
  comme réponse suffisante : le cycle avait déjà une campagne de mutation
  dédiée (dix-huit mutants), deux passages GATE et une revue de code —
  aucun des sept défauts n'était un trou de couverture au sens habituel
  (assertion absente). C'est la **question posée** par chaque vérification
  qui était insuffisante, pas son exécution.
- **Exiger une validation humaine systématique avant toute clôture.**
  Écartée comme règle générale : elle a fonctionné ici parce que l'humain
  utilisait réellement le produit en parallèle du cycle, ce qui ne se
  généralise pas à toute feature. La réponse structurelle retenue
  (`feature-027`, point 6) est de coder la comparaison à un référent réel
  **dans** le cycle, pas de dépendre d'un usage humain fortuit pour la
  déclencher.
- **Ne rien changer, ce cycle ayant fini par tout corriger.** Écartée : les
  sept défauts sont réels, corrigés dans ce cycle précisément parce que
  l'humain les a signalés en cours de route — un cycle sans cet usage
  parallèle les aurait tous livrés.

## Conséquences

### Positives

- Nomme un défaut de méthode transversal (la question posée par une
  vérification, pas son exécution) plutôt que de le laisser dispersé entre
  sept correctifs isolés dans le journal de bord de deux specs.
- Donne un critère de relecture explicite pour toute future clôture
  s'appuyant sur une table de verdicts ou un critère chiffré.

### Négatives

- Ne fournit aucun mécanisme automatique pour détecter ce défaut à
  l'avance : c'est un principe de relecture et de formulation, pas une
  garde de plus. Le risque qu'il entend documenter reste présent tant que
  `feature-027` (ou son équivalent pour une autre surface) n'a pas été
  construite.

### Ce que ça verrouille

- Toute spec qui introduit une garde comportementale doit désormais énoncer,
  à côté du mécanisme vérifié, la chose que ce mécanisme sert — un `architect`
  ou un `code-reviewer` qui approuve une garde sans cet énoncé explicite
  reproduit la situation que cet ADR documente.
- `feature-027` est la réponse déclarée pour la surface « conversation » ;
  toute nouvelle divergence entre le cockpit et un référent réel qu'elle ne
  couvrirait pas doit être traitée comme une extension de cette spec,
  jamais comme un cycle de correctifs isolés supplémentaires.

## Références

- Specs : `specs/features/doing/feature-026-session-claude-persistante-du-cockpit.md`
  et `specs/features/doing/feature-028-le-cockpit-tient-sur-un-ipad.md`
  (journaux de bord complets, source des sept défauts) ;
  `specs/features/todo/feature-027-le-cockpit-se-comporte-comme-le-client-claude.md`
  (réponse structurelle, écrite après les trois premiers défauts de cette
  liste, avant que les quatre suivants ne soient établis).
- ADR : [ADR-0017](0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md)
  (le critère d'absorption, dont l'application à ce cycle est `ADR-0043`) ;
  [ADR-0042](0042-parler-a-une-session-quon-ne-detient-pas.md) (le mécanisme
  dont les défauts #1, #2 et #6 relèvent) ; [ADR-0039](0039-la-fidelite-a-la-maquette-prime-sur-les-restrictions-anterieures.md)
  (la fidélité à la maquette normative, dont le défaut #3 est un
  débordement non couvert).
- `control-center/PIEGES.md` §63-§65 (témoin fabriqué, une mesure pour deux
  questions, registre d'ids inertes) — des instances plus étroites du même
  défaut de méthode, à l'échelle d'un test plutôt que d'un cycle.
