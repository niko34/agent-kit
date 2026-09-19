# ADR-0026 — Trois échelles du diagramme alignées sur la maquette de référence

## Statut

Accepté — remplace `ADR-0025 §1` sur quatre paragraphes (nombre de
graduations, formule du rayon, encodage du liseré des fichiers, et le rendu
du zéro / du plafond / de la pleine échelle sur chaque forme). `ADR-0025`
n'est pas réécrit ; il porte une mention de remplacement aux endroits
concernés.

## Date

2026-09-19

## Contexte

`feature-020` reprend, pour la troisième fois, la même demande : rendre le
diagramme de déroulé conforme à `control-center/maquettes/2026-09-15-diagramme-reference.html`
(maquette non versionnée, voir Références). Les deux itérations précédentes
avaient procédé par retouches jugées à l'œil. L'utilisateur a tranché
l'ambiguïté qui restait ouverte en formulant l'exigence ainsi : **« Je veux
la même chose que la maquette, pas une adaptation. »**

`ADR-0025 §1` fige trois échelles pour les trois grandeurs mesurées par le
journal d'événements (durée, appels d'outils, fichiers écrits), écrites avant
que la maquette n'existe et sans s'y confronter. La comparaison mesurée entre
le rendu du kit et la maquette (table des divergences A→W, `specs/features/doing/feature-020-conformite-du-diagramme-a-la-maquette.md`)
fait apparaître quatre désaccords, sur quatre paragraphes de `ADR-0025 §1` :

- le nombre de graduations autour du cercle (représentant les appels
  d'outils) ;
- la formule du rayon du cercle (représentant la durée) ;
- l'encodage du liseré intérieur (représentant les fichiers écrits) ;
- le rendu du zéro, du plafond et de la pleine échelle sur chaque forme
  (item J de la table des divergences).

## Décision

Sur ces quatre points, **la maquette prime** sur `ADR-0025 §1`. Raison :
**la maquette est la référence visuelle retenue par le commanditaire.**

### 1. Nombre de graduations — discret selon le rayon, pas une formule continue

`ADR-0025` : `floor(2π·rayon / 7)` borné `[8, 40]`.

Retenu (maquette, `pose()` l. 164-181) : **24 / 36 / 52** graduations, selon
deux seuils sur le rayon — 24 en dessous de 22 px, 36 entre 22 et 32 px, 52
au-delà. À rayon 56 px (le plafond retenu au point 2), la formule d'origine
rendait 40 graduations quand la maquette en réclame 52.

### 2. Formule du rayon — sans plafond de durée nominale

`ADR-0025` : rayon borné `[20, 56]` px, plafond nominal à 20 minutes.

Retenu (maquette, l. 168) : **`r = 11 + 0,80·√(durée_s)`**, sans plafond de
durée nominale — voir cependant l'écart assumé du point 3 ci-dessous, qui
introduit un plafond de nature différente (un plafond de rayon en pixels, pas
un plafond de durée).

### 3. Encodage du liseré des fichiers — opacité, épaisseur fixe

`ADR-0025` : épaisseur variable `[1,5, 6]` px, plein.

Retenu (maquette, l. 176) : **anneau à épaisseur constante 1 px**, dont
l'**opacité** porte l'information — `0,22 + min(f, 8)/8 × 0,45`, où `f` est
le nombre de fichiers écrits.

### 4. Zéro, plafond et pleine échelle — disparition d'un signal, assumée

`ADR-0025` : chaque forme porte « une encoche de zéro, un cran de plafond et
un anneau fantôme donnant la pleine échelle ».

Retenu (maquette, item J de la table des divergences) : la maquette ne
dessine ni cran de plafond, ni anneau fantôme. Elle marque le zéro par
**deux barres superposées** (blanche puis grise), et distingue la longueur
d'une graduation **allumée** (7 px) de celle d'une graduation **éteinte**
(3,2 px) — pas ses bornes. `plafondAtteint` reste calculé (le contrat de
`disposer()` le porte toujours) mais n'a **plus aucun rendu propre** : la
forme qui donnait la pleine échelle disparaît, remplacée par l'anneau guide
de la maquette (`--trait-fin`), qui existait déjà pour un autre usage
(repère visuel constant, pas une jauge de plafond).

**Conséquence assumée, pas silencieuse** : la saturation de l'échelle des
appels d'outils (un agent qui dépasse le nominal) **n'est plus signalée à
l'écran**. Elle reste lisible dans l'infobulle du cercle (`<title>`,
« plafond d'appels d'outils atteint »), mais un survol ou une lecture au
clavier est désormais nécessaire pour la voir — une perte de lisibilité au
premier coup d'œil, tolérée parce que la maquette ne porte pas ce signal et
que l'exigence du cycle est l'identité visuelle avec elle, pas son
enrichissement.

## Alternatives considérées

- **Garder les trois formules d'`ADR-0025`**, écartée — l'exigence formulée
  par l'utilisateur (« la même chose que la maquette, pas une adaptation »)
  exclut explicitement toute reformulation, même motivée, de ce que la
  maquette fixe dans son domaine de couverture.
- **N'aligner qu'une partie des trois points** (par exemple garder la formule
  du rayon d'origine et n'aligner que les graduations), écartée — aurait
  laissé un diagramme partiellement conforme sans qu'aucune règle ne dise
  laquelle des deux références fait foi à quel endroit, rouvrant le débat
  tranché ici pour le point suivant.
- **Adapter la maquette au kit** (par exemple lisser le seuil discret des
  graduations en une formule continue proche), écartée — c'est précisément
  l'adaptation que l'utilisateur a exclue.

### Écarts assumés à la maquette, sur mesure

Trois fois, une mesure sur données réelles a montré que la maquette, prise à
la lettre, ne suffit pas. Ces écarts restent **nommés**, pas subis, et ne
remettent pas en cause la décision ci-dessus : ils s'appliquent au-delà du
domaine que la maquette couvre.

| Point | Maquette | Retenu | Mesure qui le motive |
|---|---|---|---|
| Pastille d'attente | `rect` 54×18 | **86×18**, texte borné à 12 caractères | `"attente 4m"` mesuré à **58,61 px** dans la police réellement résolue : la maquette déborde sa propre boîte |
| Rayon | `11 + 0,80·√s`, sans plafond | idem, **plafonné à 56 px** | Le journal réel porte un segment de **33 186 s** → 156,7 px de rayon sinon, soit 313 px de diamètre. Le plafond mord à 3 164 s ; le plus long sous-agent réel (2 560 s) n'est jamais écrêté |
| Durées ≥ 1 h | aucune branche « heures » (la plus longue vignette de la maquette fait 66 min) | format maquette sous 60 min, **forme en heures au-dessus** | Le format maquette écrirait « 553 min 06 » pour le segment de 33 186 s ; illisible |

Ces trois écarts sont indépendants des paragraphes remplacés ci-dessus (ils
portent sur la pastille d'attente et le format des durées, pas sur les trois
échelles du cercle) ; ils sont documentés ici parce qu'ils relèvent de la même
décision d'ensemble : la maquette prime, sauf mesure contraire.

## Conséquences

### Positives

- Le diagramme reproduit la maquette pixel pour pixel dans son domaine
  nominal, ce qui rend « identique » vérifiable par une table de valeurs
  écrite à la main (`E1`, suite de conformité `test_app_diagramme_conformite.js`)
  plutôt que par un jugement à l'œil — le risque nommé de la spec (une
  quatrième itération).
- Les trois écarts assumés restent lisibles et traçables à leur mesure,
  distincts d'un oubli.

### Négatives

- **La saturation de l'échelle des appels d'outils n'est plus visible à
  l'écran** (point 4) — c'est une perte d'information, pas une simplification
  neutre ; elle ne reste lisible que dans l'infobulle du cercle.
- `ADR-0025 §1` porte désormais deux échelles obsolètes en son sein
  (l'ancienne formule du rayon, l'ancienne borne des graduations) : sa
  lecture seule, sans la mention de remplacement, induirait en erreur. La
  mention pointe explicitement ici.
- Deux ADR décrivent désormais la même forme du cercle (le rayon, les
  graduations) : toute lecture future doit partir d'`ADR-0026`, pas
  d'`ADR-0025`, pour ces deux points précis.

### Ce que ça verrouille

- Le seuil discret des graduations (22 px, 32 px) et la formule du rayon
  (`11 + 0,80·√s`, plafond 56 px) ne se redérivent plus d'un principe
  continu : toute révision future de ces deux échelles révise cet ADR, pas
  seulement le code.
- Le plafond de rayon (56 px) et la branche « heures » du format de durée
  restent hors du domaine couvert par la maquette : une future maquette qui
  couvrirait un journal aux durées plus longues devrait être confrontée à ces
  deux écarts avant de les considérer caducs.

## Références

- Code : `control-center/web/diagramme.js` (`calculerRayon`, `calculerGraduations`,
  `calculerLiseret`, `texteDuree`).
- Maquette : `control-center/maquettes/2026-09-15-diagramme-reference.html`
  — **non versionnée** (absente du dépôt git), voir avertissement dans
  `docs/DESIGN-SYSTEM.md` §5.
- Spec : `specs/features/doing/feature-020-conformite-du-diagramme-a-la-maquette.md`
  (table des divergences A→W, décisions D1-D8).
- ADR remplacé (partiellement) : `docs/adr/0025-grammaire-du-diagramme-de-deroule.md` §1.
- Design system : `docs/DESIGN-SYSTEM.md` §5.
