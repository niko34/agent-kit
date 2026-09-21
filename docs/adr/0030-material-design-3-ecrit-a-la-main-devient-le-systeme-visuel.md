# ADR-0030 — Material Design 3, écrit à la main, devient le système visuel

## Statut

Accepté

## Date

2026-09-20

## Contexte

L'utilisateur a fourni sa propre maquette (`control-center/maquettes/2026-09-20-maquette-materiel-3.html`,
copie normative de `docs/design-references/control-center-animated-prototype.html`) et
demande son adoption **fidèle**, en Material Design 3, et non une interprétation.
`ADR-0006` (« le centre de contrôle n'a aucune dépendance d'exécution ») étant la
contrainte la plus susceptible d'être mise en cause par un système visuel entier
importé d'un tiers, ce point a été mesuré en premier, avant tout arbitrage de style.

Mesuré sur le prototype (1 259 lignes, 84 267 octets) :

| Mesure | Résultat |
|---|---|
| Liens externes (`grep -cE '(src\|href)="(https?:)?//'`) | **0** |
| Scripts tiers | **0** |
| Occurrences du mot « material » (`grep -ic material`) | **0** |
| Jetons de couleur dans le bloc `:root` | **22**, un seul bloc |

Material Design 3 y est donc **écrit à la main** : aucune bibliothèque de composants
(Material Web Components, MUI, Material You Android), aucune feuille de styles
distante, aucune police Google Fonts. C'est le point qui aurait pu faire basculer
`ADR-0006` — une adoption « précise » de Material 3 aurait pu passer par l'import
d'une bibliothèque officielle — et la mesure montre que ce n'est pas le cas.

## Décision

### 1. `ADR-0006` est CONFIRMÉ, sans exception

Aucune dépendance n'entre dans le module à l'occasion de ce changement de système
visuel. Le statut d'`ADR-0006` reste `Accepté`, non amendé : Material 3 est un
**vocabulaire de conception** (jetons, surfaces tonales, élévation, typographie,
mouvement), pas un paquet à installer.

### 2. Material Design 3 remplace le parti pris visuel du §1 de `DESIGN-SYSTEM.md`

Le parti pris « outil de développeur, densité forte, peu de couleur, aucune
animation décorative » est amendé : la référence devient Material Design 3 /
Material 3 Expressive, densité adaptée au bureau, typographie fine (graisses 400 et
500 principalement), hiérarchie construite par les surfaces tonales, l'espace et une
élévation discrète plutôt que par des bordures épaisses. La règle de fond ne change
pas : la couleur reste un **signal**, jamais une décoration gratuite — mais son
vocabulaire s'élargit à la palette M3 (indigo, turquoise, corail atténué, ambre)
et l'interdiction d'« animation décorative » se précise : toute animation reste
rattachée à un changement d'état (transitions d'enchaînement du disque d'agent,
ouverture de bottom sheet), jamais un effet ajouté pour lui-même.

### 3. §4 (Typographie) amendé

La pile système reste seule autorisée (aucune police distante — confirmé par la
mesure : `_TYPES` ne sert pas `.woff2`, `ADR-0006` inchangé). L'échelle se resserre
sur les graisses 400/500 du prototype, sans titres énormes, en cohérence avec le
document de décisions de l'utilisateur (« Direction visuelle »).

### 4. §9 (Interdits) amendé, pas remplacé

Les interdictions liées à la CSP, à l'absence de dépendance et à l'absence de
bibliothèque graphique restent intactes — elles sont confirmées par la mesure
ci-dessus, pas contredites. Un seul interdit change de statut : **« un aplat de
fond pour délimiter un bloc là où un filet suffit »** est retiré, parce qu'il
contredit désormais §3 révoqué (ci-dessous) — les surfaces tonales M3 **sont** des
aplats délibérés (bande de résumé sur `--surface-low`, colonnes du kanban sur
`--surface-low`, panneau de conversation sur `--surface`), et le prototype les
emploie sans qu'aucun filet ne les délimite.

### 5. §3 (Surfaces) RÉVOQUÉ — les trois niveaux cèdent aux surfaces tonales

`DESIGN-SYSTEM.md` §3 fixait trois niveaux structurels (`--fond`, `--surface`,
`--creux`), un écart volontairement faible entre eux, et un `--surface-2` réservé à
une teinte d'interaction, jamais un aplat de repos. Le prototype mesuré emploie
**cinq** surfaces tonales (`--bg`, `--surface`, `--surface-low`, `--surface-high`,
`--surface-highest`) utilisées **en aplat de repos** partout : bande de résumé,
colonnes du kanban, panneau de conversation, cartes de fonctionnalité. §3 est donc
**révoqué en bloc**, remplacé par l'échelle de surfaces tonales M3 du prototype.

### 6. `ADR-0024 §4` RÉVOQUÉ

`ADR-0024 §4` disait : « `--surface-2` reste réservé à un état d'interaction sur un
élément déjà délimité par un filet — jamais un aplat de repos. » La maquette fait
délibérément l'inverse : ses surfaces tonales servent d'aplats de repos généralisés,
sans filet. `ADR-0024 §4` est donc **révoqué** par le présent ADR — pas amendé, pas
laissé en vigueur avec une exception : la règle qu'il posait n'a plus cours dans le
nouveau système visuel.

## Alternatives considérées

- **Conserver le parti pris « outil de développeur, peu de couleur »** et adapter la
  maquette de l'utilisateur à cette contrainte. Écartée : l'utilisateur demande une
  adoption fidèle, « pas une interprétation », et la contrainte qu'elle aurait servie
  (densité, sobriété) est précisément ce que Material 3 Expressive assume de
  dépasser.
- **Importer une bibliothèque de composants Material 3** (Material Web Components,
  ou équivalent) pour garantir la conformité au référentiel officiel. Écartée : la
  mesure montre que le prototype fourni n'en a besoin d'aucune — l'écrire à la main
  confirme `ADR-0006` sans qu'aucun arbitrage nouveau ne soit nécessaire.
- **Garder `DESIGN-SYSTEM.md` §3 en vigueur et traiter les aplats de la maquette
  comme une entorse locale à documenter au cas par cas.** Écartée : la maquette les
  emploie de façon systématique, pas ponctuelle ; les documenter comme des entorses
  répétées aurait été moins honnête qu'admettre que la règle elle-même a changé.

## Conséquences

### Positives

- `ADR-0006` sort confirmé par une mesure directe (0 lien, 0 script, 0 occurrence du
  mot « material », 22 jetons dans un seul bloc), pas par une lecture du code.
- Le système visuel devient vérifiable automatiquement contre le prototype (table
  des jetons, table des durées — livrables F1/F2 de `feature-021`), au lieu de se
  juger à l'œil.
- La contradiction entre §3 (trois niveaux, jamais d'aplat) et l'usage réel de la
  maquette est levée explicitement, plutôt que de laisser un document et un code
  diverger silencieusement (le même défaut qu'`ADR-0024 §4` avait déjà dû corriger
  une fois pour `--surface-2`).

### Négatives

- La discipline de sobriété colorée que §3 et le parti pris d'origine imposaient
  disparaît : un futur cycle qui voudrait revenir à une palette restreinte devra
  rouvrir cette décision explicitement.
- Cinq surfaces tonales à tenir cohérentes (au lieu de trois plus une teinte
  d'interaction) élargissent la matrice de contraste à vérifier — absorbé par la
  garde F5 (contrastes, matrice jeton × surface complète) du cycle d'implémentation.

### Ce que ça verrouille

- Tout ajustement futur du système visuel du centre de contrôle part du prototype
  M3, pas de l'ancien parti pris « développeur sobre » — un retour en arrière
  rouvrirait cet ADR, pas seulement le code.
- `ADR-0006` reste la référence unique sur la question de la dépendance : toute
  tentation future d'importer une bibliothèque Material officielle repasse par un
  arbitrage explicite, la mesure de ce cycle ne préjuge pas des cycles suivants.
- `--surface-2` (et toute surface tonale du même type) peut désormais servir
  d'aplat de repos ; un futur cycle qui voudrait à nouveau réserver une surface à un
  seul usage d'interaction devra l'écrire, elle ne va plus de soi.

## Références

- Code : `control-center/maquettes/2026-09-20-maquette-materiel-3.html` (bloc
  `:root`, lignes 8-34).
- ADR : [ADR-0006](0006-centre-controle-zero-dependance.md) (confirmé) ;
  [ADR-0024](0024-une-section-a-la-fois-dans-un-contenu-borne.md) (§4 révoqué ici).
- Design system : `docs/DESIGN-SYSTEM.md` §1, §3 (révoqué), §4, §9.
- Spec : `specs/features/doing/feature-021-revenir-a-un-tableau-de-bord-unifie.md`
  — « Grandeurs mesurées », étape A du 2026-09-20.
- Document de décisions : `docs/design-references/control-center-design-decisions.md`,
  section « Direction visuelle ».
