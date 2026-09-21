# ADR-0031 — La grammaire du disque d'agent change

## Statut

Accepté

## Date

2026-09-20

## Contexte

`ADR-0025` (grammaire du diagramme de déroulé) et `ADR-0026` (trois échelles alignées
sur la maquette du 2026-09-15) fixaient ce que porte chaque forme du cercle qui
représente un passage d'agent : diamètre = durée, graduations = appels d'outils,
liseré = fichiers écrits — trois grandeurs mesurées par le journal d'événements,
trois formes disponibles.

La maquette Material 3 fournie par l'utilisateur (`control-center/maquettes/2026-09-20-maquette-materiel-3.html`)
dessine un disque d'agent avec une grammaire différente sur presque tous les points,
et l'utilisateur demande son adoption **fidèle**. `ADR-0022` a par ailleurs rendu
disponible, le 2026-09-20, une donnée qui n'existait pas au moment d'`ADR-0025` : les
**tokens par sous-agent**, mesurés à **225** transcripts, appariés à **223 des 223**
passages dessinés (100 % de couverture) — voir la rectification du
2026-09-20 dans `feature-021` (« RECTIFICATION »).

Ce même cycle a également tranché une question de conception que la donnée de
tokens ouvrait : comment faire progresser l'anneau sans total final connu pour un
passage en cours (voir §3 ci-dessous).

## Décision

### 1. `ADR-0025 §1`, `§2`, `§3` et `ADR-0026` en entier sont RÉVOQUÉS

Ce qu'ils fixaient — les trois échelles du cercle (rayon fonction de la durée,
graduations comptant les appels d'outils, liseré encodant les fichiers en épaisseur
ou en opacité), le fait que l'écart horizontal ne mesure pas le temps, l'empilement
vertical des agents simultanés — est remplacé par la grammaire du disque de la
maquette M3, décrite au §2. `ADR-0025 §4` (séparation géométrie/rendu) est **excepté**
de cette révocation : voir §4 ci-dessous.

### 2. La nouvelle grammaire, mesurée sur le prototype

| Partie du disque | Ancienne grammaire (`ADR-0025`/`ADR-0026`) | Nouvelle grammaire (maquette M3) |
|---|---|---|
| Diamètre | fonction de la **durée** — `11 + 0,80·√(durée_s)`, plafond 56 px | fonction de l'**état** — 52 px (non lancé / non actif) → 88 px (actif / terminé) |
| Graduations radiales | comptent les **appels d'outils**, 24/36/52 selon le rayon | **12, fixes** — ne dénombrent plus rien, purement décoratives/rythmiques |
| Fichiers | liseré intérieur, épaisseur ou opacité, échelle continue plafonnée à 8 | **3 pastilles internes**, plafonnées, échelle binaire allumée/éteinte |
| Centre | rien (les jetons n'étaient pas mesurés) | sigle d'identité **et** `input_tokens + output_tokens` |
| Anneau | n'existait pas sous cette forme | signal d'**activité**, jamais une progression chiffrée (§3) |
| Sous le disque | heure de départ, durée, nom — trois libellés | **durée seule** |
| Au-dessus du disque | — | **nom** de l'agent |

Le diamètre cesse d'être une fonction pure de la durée : deux passages de durées
très différentes, tous deux actifs, ont le **même** diamètre (88 px). C'est la
propriété inverse de celle qu'`ADR-0025 §1` avait posée.

### 3. Pertes nommées — ce que cette grammaire abandonne

Cette section existe parce que la spec l'exige explicitement (`feature-021`,
« ADR attendu ? ») : un redessin du disque doit **nommer ses pertes**, pas les
laisser se découvrir en usage.

- **Les appels d'outils quittent le disque.** Ils n'ont plus aucune représentation
  visuelle sur le cercle — les 12 graduations sont fixes et ne les comptent plus.
  Ils ne subsistent que dans la **bottom sheet** de détail d'un passage (livrable
  F11), qui doit les afficher explicitement pour que la donnée ne disparaisse pas
  du dépôt, seulement du premier coup d'œil.
- **L'échelle des fichiers s'effondre de 8 paliers d'opacité à 3 pastilles
  binaires.** `ADR-0026 §3` codait le nombre de fichiers écrits en continu
  (`0,22 + min(f,8)/8 × 0,45`, soit 8 paliers perceptibles). La nouvelle grammaire
  n'a que 3 pastilles, chacune allumée ou éteinte : un passage à 4 fichiers et un
  passage à 40 fichiers **dessinent exactement pareil**. La distinction fine reste
  disponible dans la bottom sheet, jamais sur le disque.
- **L'échec perd toute représentation propre.** Le prototype ne connaît que trois
  classes d'état (`state-pending`, `state-active`, `state-done`) : il n'a jamais eu à
  représenter un échec. `ADR-0025`/`ADR-0026` faisaient porter l'échec par une croix
  et un contour `--alerte` (voir `DESIGN-SYSTEM.md` §5, §8). Cette représentation
  n'a pas d'équivalent mesuré dans la maquette et doit être **ajoutée** par le cycle
  d'implémentation sans la déduire du prototype — sous peine d'inventer une
  convention non vérifiable par comparaison automatique.
- **Le « sans clôture » et l'agent principal perdent leur motif de trait.**
  `DESIGN-SYSTEM.md` §5/§8 faisait porter « sans clôture » par un pointillé de
  contour, et l'agent principal se distinguait par son fond et son sigle « AP » (les
  tirets pleins ayant déjà été retirés par `feature-020`). Le prototype ne dessine ni
  l'un ni l'autre cas : ces deux représentations doivent elles aussi être réinventées
  par le cycle d'implémentation, hors du domaine couvert par la maquette.
- **Le non-chevauchement des libellés n'est plus tenable par construction.**
  `ADR-0025 §2` garantissait l'absence de chevauchement en réservant, pour chaque
  agent, la demi-largeur du plus exigeant entre son cercle et ses trois libellés
  (heure, durée, nom). Cette garantie disparaît avec la révocation du §2 : la
  nouvelle grammaire n'a que deux libellés (nom au-dessus, durée en dessous) et un
  diamètre binaire (52/88 px), mais **aucune règle de placement équivalente n'existe
  encore** pour garantir leur non-chevauchement sur un graphe dense. C'est un trou à
  combler par le cycle d'implémentation, pas un acquis transposé.
- **L'heure de départ disparaît.** Elle n'a plus d'emplacement dans la nouvelle
  grammaire (voir tableau du §2, ligne « Sous le disque »).

### 4. `ADR-0025 §4` (séparation géométrie/rendu) — MAINTENU, écart assumé à la maquette

`ADR-0025 §4` sépare strictement le calcul de géométrie (`disposer(passages, mesures)`,
module pur, aucun DOM, aucune couleur) du rendu SVG (`app.js`, seul appelant en
production). Cette séparation a déjà trouvé, par mutation, **deux** défauts réels où
la réservation d'espace et le rendu divergeaient (pastille recouvrant un libellé
voisin, arc dépassant du cadre — voir `ADR-0025`, section Conséquences).

La maquette ne l'interdit pas : elle ne code aucune architecture de module, elle ne
fait que dessiner un résultat. Rien dans le prototype HTML/CSS ne force à recalculer
la géométrie à deux endroits différents. Le présent ADR **statue explicitement** :
`ADR-0025 §4` **reste en vigueur**, comme **écart assumé à la maquette** — la
maquette ne s'en sert pas, mais elle ne s'y oppose pas non plus, et l'analyse de
l'architecte (`feature-021`, étape A) le recommande fortement au vu du gain déjà
mesuré. Le motif « écart assumé », déjà employé par `ADR-0026` pour la pastille
d'attente et le format des durées, s'applique donc ici à une décision d'architecture
plutôt qu'à une valeur chiffrée.

### 5. L'anneau signale l'activité, il n'encode jamais une progression chiffrée

Décision humaine du 2026-09-20. Le prototype calcule `progress = tokens / finalTokens
× 315°` — une progression chiffrée qui suppose un total final connu. Pour un passage
**en cours**, ce total final n'existe pas encore : on ne peut pas diviser par une
grandeur qui n'est pas encore mesurée.

| État | Anneau |
|---|---|
| Non lancé | éteint (`--line`), 0° |
| **Actif** | **animation indéterminée en boucle**, sans pourcentage |
| Terminé | **complet et stable**, plus aucun mouvement |

Raison : le dépôt n'affiche jamais une proportion qu'il ne sait pas mesurer — c'est
le même principe qui gouverne la correction des §5/§9 de `DESIGN-SYSTEM.md` sur les
jetons (voir la note datée 2026-09-20 dans ce document).

**Écart assumé au document de conception de l'utilisateur**, qui listait
« progression de l'anneau » parmi les signaux de travail en cours
(`docs/design-references/control-center-design-decisions.md`, « Mouvement et états
des sous-agents »). La raison prime sur la lettre du document : un anneau qui
prétendrait mesurer une avancée qu'il ne connaît pas retomberait exactement dans
l'interdit que ce dépôt s'impose ailleurs (aucun chiffre affiché qui n'est pas dans
les données).

Conséquence favorable, notée pour mémoire : cela **supprime la dépendance de
l'anneau aux tokens**. Le diagramme reste lisible (activité visible) même si la
lecture des transcripts de sous-agent est refusée par le GATE de sécurité ou
indisponible pour une autre raison — seul le chiffre du centre dégrade alors, pas
l'anneau.

## Alternatives considérées

- **Garder `ADR-0025`/`ADR-0026` intacts et superposer la nouvelle grammaire par
  au-dessus** (par exemple garder les graduations comme compteur d'appels d'outils
  en plus des 12 graduations fixes). Écartée : la maquette dessine 12 graduations
  fixes sans variation visuelle liée aux appels d'outils ; superposer les deux
  grammaires aurait produit un disque qui ne ressemble à la maquette dans aucun des
  deux régimes, contredisant l'exigence de fidélité de `feature-021`.
- **Réviser `ADR-0025`/`ADR-0026` par amendement plutôt que révocation.** Écartée :
  les paragraphes concernés ne survivent pas partiellement — le §1 d'`ADR-0025`
  (trois grandeurs, trois formes) et l'intégralité d'`ADR-0026` portaient
  spécifiquement les formules que la nouvelle grammaire remplace point par point ;
  un amendement aurait laissé un document à truffer d'exceptions plutôt que de dire
  clairement que la correspondance forme↔donnée a changé.
- **Faire de l'anneau une progression relative au passage le plus long du cycle**
  (plutôt qu'à son propre total final). Écartée par l'utilisateur : cela afficherait
  encore un pourcentage, construit sur une grandeur (le passage le plus long) qui
  peut elle-même changer pendant que le cycle tourne — un nombre trompeur plutôt
  qu'un nombre absent.
- **Ne pas afficher d'anneau du tout en état actif.** Écartée : un signal d'activité
  reste nécessaire pour distinguer visuellement un passage actif d'un passage
  terminé sans lire le texte — l'animation indéterminée porte cette distinction sans
  prétendre mesurer une avancée.

## Conséquences

### Positives

- Le centre du disque redevient porteur d'une donnée réelle et mesurée
  (`input_tokens + output_tokens`, 225/225 transcripts appariés, 223/223 passages
  dessinés couverts) — une capacité qu'`ADR-0025` avait explicitement exclue faute de
  mesure disponible à l'époque.
- La fidélité à la maquette devient vérifiable automatiquement (garde F1/F2 de
  `feature-021`), au lieu d'une nouvelle itération de rendu « à l'œil » — le
  problème même qu'`ADR-0026` avait dû résoudre pour le diagramme précédent.
- La séparation géométrie/rendu, dont la valeur est déjà mesurée (deux défauts
  trouvés par mutation), n'est pas perdue dans la refonte.
- L'anneau reste lisible même sans accès aux tokens (GATE refusé ou indisponible),
  parce qu'il n'en dépend plus.

### Négatives

- **Cinq pertes d'information nommées** (§3) : appels d'outils, granularité fine des
  fichiers, représentation de l'échec, motifs de trait « sans clôture »/« agent
  principal », heure de départ. Chacune doit être compensée ailleurs (bottom sheet)
  ou réinventée par le cycle d'implémentation, hors du domaine couvert par la
  maquette.
- Le non-chevauchement des libellés, garanti par construction sous l'ancienne
  grammaire, devient un problème ouvert : la nouvelle grammaire ne fournit aucune
  règle de placement équivalente.
- L'anneau s'écarte du document de conception initial de l'utilisateur sur un point
  explicite (« progression de l'anneau ») — un écart assumé, mais qui doit être
  vérifié auprès de l'utilisateur au premier usage réel, pas seulement consigné ici.
- `ADR-0025` porte désormais trois paragraphes révoqués (§1, §2, §3) et un seul
  maintenu (§4) : sa lecture seule, sans la mention de statut, induirait en erreur.

### Ce que ça verrouille

- Toute évolution future de ce que porte une forme du disque (diamètre,
  graduations, pastilles, anneau, centre) révise cet ADR, pas seulement le code —
  reprise de la règle posée par `ADR-0025`.
- `disposer()` reste l'unique autorité de géométrie pour le disque d'agent, comme
  pour le reste du diagramme ; toute réintroduction d'un second calcul de géométrie
  dans `app.js` est la régression que §4 interdit.
- L'anneau ne code jamais une proportion qu'aucune donnée ne mesure — un futur ajout
  qui voudrait lui redonner une signification de progression doit d'abord établir
  comment le total final serait connu pour un passage en cours, faute de quoi il
  rouvre la question tranchée ici.
- Les cinq pertes nommées au §3 sont le budget de référence pour juger si un futur
  cycle les a comblées ou les a laissées ouvertes ; elles ne doivent pas être
  redécouvertes en production.

## Références

- Code (à livrer par `feature-021`, non modifié par cet ADR) :
  `control-center/web/diagramme.js`, `control-center/web/app.js`,
  `control-center/web/app.css`.
- Maquette : `control-center/maquettes/2026-09-20-maquette-materiel-3.html`,
  classes `.agent-node`, `.work-orbit`, `.tool-ticks`, `.file-dots`,
  `.agent-data`, `.agent-name`, `.agent-duration`.
- ADR : [ADR-0025](0025-grammaire-du-diagramme-de-deroule.md) (§1-§3 révoqués,
  §4 maintenu) ; [ADR-0026](0026-trois-echelles-du-diagramme-alignees-sur-la-maquette.md)
  (révoqué en entier) ; [ADR-0022](0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md)
  (sans rapport direct, cité pour la disponibilité des tokens).
- Spec : `specs/features/doing/feature-021-revenir-a-un-tableau-de-bord-unifie.md` —
  « RECTIFICATION » du 2026-09-20 (couverture des transcripts), « Décisions
  humaines du 2026-09-20 sur le disque d'agent » (chiffre au centre, anneau
  d'activité).
- Document de décisions : `docs/design-references/control-center-design-decisions.md`,
  « Représentation du cycle », « Mouvement et états des sous-agents ».
