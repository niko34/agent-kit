# ADR-0029 — Le tableau de bord revient au mono-écran, et pourquoi three.js est écarté

## Statut

Accepté

## Date

2026-09-19

## Contexte

Quatre jours après que `feature-019` a livré une colonne de navigation à six
onglets (`ADR-0024`) et que `feature-016` y a ajouté un accordéon des cycles,
l'usage a montré l'inverse de ce que l'un et l'autre visaient : un tableau de
bord doit dire l'état du projet **d'un seul regard**, et le découpage en
tiroirs oblige à naviguer pour le savoir. Le diagramme de déroulé
(`feature-017`, mis en conformité par `feature-020`) rend en outre redondante
l'ancienne table des passages d'agent : les deux racontent le même
enchaînement, l'une en tracé, l'autre en lignes.

`feature-021` révoque ce découpage et refond le tableau de bord en un seul
écran. Le même cycle a par ailleurs arbitré, puis désarbitré, l'usage d'une
bibliothèque de rendu 3D pour l'« effet wahoo » demandé à l'écran refondu :
la spec autorisait initialement `three.js` sur la foi d'une estimation de
poids ; la mesure réelle a renversé cette autorisation. Les deux décisions
naissent du même geste de conception visuelle et s'appuient sur les mêmes
mesures ; elles sont donc consignées dans un seul ADR plutôt que recopiées
dans deux documents immuables.

## Décision

### 1. Le tableau de bord devient mono-écran

La navigation par onglets (six `role="tab"`, une section affichée à la fois,
les cinq autres `hidden`) et l'accordéon des cycles (un seul cycle déplié à
la fois) sont **retirés** de leur usage de navigation entre sections. Le
tableau de bord se lit désormais **sans interaction** : ce qui tourne, où en
est le cycle, ce qui a échoué sont visibles au chargement, sans clic.

Le diagramme de déroulé (`feature-017`, `feature-020`) devient la **seule**
représentation des enchaînements d'agent ; l'ancienne table des passages
(`.table-passages`, livrée par `feature-016`) est supprimée — elle listait en
colonnes ce que le diagramme dessine déjà, et c'est nommément ce que
`feature-021` demandait de remplacer.

Un `role="tablist"` **subsiste**, mais change de rôle : décision humaine du
2026-09-19, il ne sert plus à naviguer entre des sections du tableau de bord,
seulement à consulter un **cycle antérieur** dans la bande de sélection des
cycles. Le cycle courant s'affiche sans aucun clic ; sélectionner un autre
cycle dans la bande ouvre un seul panneau à la fois, jamais deux diagrammes
simultanés. La révocation porte sur la navigation entre sections d'un même
écran, pas sur le motif ARIA `tablist`/`tab`/`tabpanel` lui-même, qui reste le
vocabulaire d'accessibilité retenu pour « un seul panneau actif parmi
plusieurs » dès qu'un tel choix existe.

**Ce que cela contraint pour tout écran futur** : toute information nouvelle
se dispute désormais une place visible en permanence, au lieu d'ouvrir un
tiroir ou un onglet. C'est un budget d'écran fermé, imposé à tous les cycles
suivants — l'inverse exact de la contrainte posée par `ADR-0024 §1`.

### 2. Sort d'ADR-0024 : amendé, pas révoqué en bloc

`ADR-0024` — « Une section à la fois, dans un contenu borné » — voit son
**§1** (colonne de navigation, une section à la fois) et la partie de son
**§2** qui justifiait l'écart de l'empilement **remplacés** par la présente
décision. Son statut passe à `Accepté (§1 et la partie navigation de §2
remplacés par ADR-0029)`.

Ses **§3** (absorption de `bug-016`, seuils de contraste), **§4**
(`--surface-2` réservé à une teinte d'interaction, jamais un aplat de repos)
et **§5** (toute borne numérique se pose avec une marge chiffrée — 2,5 bits,
contraste nominal ≥ 4,65 pour un seuil dur de 4,5:1) **restent en vigueur**,
sans rapport avec la navigation, et **s'imposent au cycle 2** de
`feature-021` : un mono-écran dense sera tenté de délimiter ses blocs par des
aplats, or `--surface-2` en aplat de repos reste la violation qu'ADR-0024 §4 a
déjà corrigée une fois.

L'accessibilité clavier que le motif `tablist` fournissait à la navigation
révoquée ne disparaît pas avec lui : ce qui remplace les onglets — la bande
de sélection des cycles, le défilement du mono-écran — doit rester
parcourable au clavier.

### 3. Le refus d'une dépendance 3D (`three.js`)

**ADR-0006** (« Le centre de contrôle n'a aucune dépendance d'exécution »)
est **CONFIRMÉ**, non amendé : rien dans cette décision ne le contredit,
puisqu'aucune dépendance n'entre au final dans le module. Son statut reste
`Accepté`.

La spec `feature-021` avait initialement **autorisé** `three.js` pour l'effet
visuel demandé, sur la foi d'une estimation à **~600 Ko**. Mesuré le
2026-09-19 depuis `unpkg.com` (`three@0.186.0`), le poids réellement servi
est de **2 120 885 octets** (2,02 Mo) : `three.module.js` (662 772 o) plus
`three.core.js` (1 458 113 o), que le premier importe. L'estimation initiale
était **fausse d'un facteur 3,4** — elle ne doit être recopiée nulle part
ailleurs que comme la mise en garde qu'elle est devenue : c'est sa
**réfutation** qui a renversé la décision d'autorisation, pas un nouvel
arbitrage de goût.

Mesures complémentaires, toutes datées du 2026-09-19 :
- aucun build minifié n'existe en version 0.186.0 (`three.module.min.js` →
  HTTP 404 sur unpkg) : sans étape de build dans ce module, ce sont les
  sources non minifiées qui seraient servies ;
- le serveur ne compresse rien (`control-center/backend/server.py`, aucune
  occurrence de `gzip`/`Content-Encoding`/`deflate`) : les 2,02 Mo
  partiraient tels quels (gzippés, ils feraient 417 288 o, ce qui reste hors
  de portée sans changer le serveur) ;
- licence MIT, maintenance active (313 versions, dernière le 2026-09-08 ; 24
  publications en 2022, 19 en 2023, 16 en 2024, 13 en 2025, 7 en 2026) — la
  licence et la maintenance ne sont pas ce qui a fait pencher la décision ;
- le tableau de bord entier, aujourd'hui, pèse **230 680 octets** servis
  (`index.html` + `app.css` + `app.js` + `theme.js` + `diagramme.js`) :
  `three.js` pèserait à lui seul **9,2 ×** ce total.

**L'argument décisif n'est pas le poids, c'est la nature des données.** Rien
de ce que ce tableau de bord montre n'est une donnée à trois dimensions :
une scène 3D y serait exactement l'effet décoratif que `feature-021`
interdit (« aucun effet sans fonction »). Le poids aggrave la décision, il ne
la fonde pas — et il l'aggrave doublement : `control-center/` est distribué
**tel quel** à tout projet instancié depuis le kit (`tools/update_kit.sh`,
chemin conditionnel, `ADR-0010`), donc un poids accepté ici **voyage
partout**, vers des projets dont aucun auteur n'aura relu ces 2,02 Mo de
source.

### Les trois alternatives pesées

| Option | Poids servi | Verdict |
|---|---|---|
| **Vanilla Canvas 2D / SVG / CSS** | 0 octet ajouté ; le tableau de bord entier pèse 230 680 o | **Retenue.** Tout ce que la spec demande (particules, chronomètre, matière) est disponible sous la CSP réellement mesurée : Canvas 2D, SVG animé, WAAPI, `IntersectionObserver`, `requestAnimationFrame`, Web Worker de même origine. |
| **WebGL écrit à la main** | 0 octet ajouté | **Écartée.** Disponible et autorisé par la CSP (mesuré), mais il faudrait écrire shaders et repli logiciel à la main pour des données qui ne sont pas tridimensionnelles ; la spec exige déjà un repli « machine sans WebGL ». Coût de maintenance sans contrepartie d'information. |
| **`three.js` 0.186.0 vendu** | 2 120 885 o servis, aucun build minifié en 0.186.0, aucune compression serveur → 9,2 × le tableau de bord entier | **Écartée**, après avoir été autorisée puis retirée sur mesure (voir ci-dessus). |

**Conséquence de sécurité, distincte du poids** : un script tiers non relu,
servi par la **même origine** que la page qui détient le jeton d'écriture
(`Authorization: Bearer`), est un chemin par lequel ce script peut lire le
jeton et s'en servir sur les routes d'écriture. Abandonner la dépendance
referme ce chemin — c'est ce qui rend `security-reviewer` (rôle GATE) sans
objet pour ce cycle. **À rouvrir immédiatement** si un fichier tiers
réapparaît dans le périmètre du module.

## Alternatives considérées

Voir le tableau ci-dessus pour le rendu visuel. Pour la structure d'écran,
les alternatives à l'empilement (onglets horizontaux, navigation par ancres)
avaient déjà été pesées et écartées par `ADR-0024 §2` ; ce cycle ne rejoue
pas ce débat, il **réhabilite** l'option que ADR-0024 avait écartée
(l'empilement), au vu d'un usage qui a montré le coût réel du découpage en
tiroirs — ce que ADR-0024 ne pouvait pas mesurer au moment où il a tranché.

## Conséquences

### Positives

- L'état du projet se lit sans interaction, ce qu'un tableau de bord doit
  offrir et qu'un découpage en onglets ne peut pas offrir par construction.
- Une seule représentation des enchaînements d'agent (le diagramme), au lieu
  de deux qui racontaient la même chose sous deux formes.
- Zéro dépendance nouvelle : le module reste à 0 tiers (`ADR-0006` confirmé),
  et aucun projet du kit n'hérite d'un poids qu'aucun de ses auteurs n'aura
  relu.
- Les acquis d'accessibilité et de contraste d'`ADR-0024` (§3, §4, §5)
  survivent intacts et s'imposent au cycle d'implémentation.

### Négatives

- Le motif `tablist` disparaît de la navigation principale mais subsiste pour
  les cycles antérieurs : deux significations d'un même motif ARIA coexistent
  dans le même écran, à documenter clairement pour qui reprend le code sans
  lire cet ADR.
- Un mono-écran dense doit tenir sur toutes les tailles d'écran sans
  redevenir un défilement illisible sur mobile — contrainte que le découpage
  en onglets évitait par construction en réduisant la densité par section.
- Le renoncement à `three.js` ferme l'option d'un rendu 3D authentique pour
  ce cycle ; si une donnée réellement tridimensionnelle apparaissait un jour
  dans ce tableau de bord, la question devra être rouverte par une spec
  dédiée, chiffres en main.

### Ce que ça verrouille

- Toute information nouvelle du tableau de bord se dispute une place visible
  en permanence ; ouvrir un nouveau tiroir ou un nouvel onglet redevient la
  régression que ce cycle corrige.
- `control-center/` reste sans dépendance d'exécution ; toute proposition
  contraire repasse par un arbitrage humain explicite et par le GATE sécurité
  avant d'entrer dans le module, jamais en cours de route.
- Le motif `tablist` reste disponible, mais réservé à la consultation d'un
  cycle antérieur — un nouvel usage de navigation entre sections du même
  écran serait la régression exacte que cet ADR corrige.

## Références

- Code (à livrer par le cycle 2 de `feature-021`, non modifié par cet ADR) :
  `control-center/web/index.html`, `control-center/web/app.css`,
  `control-center/web/app.js`, `control-center/web/diagramme.js`.
- ADR : [ADR-0006](0006-centre-controle-zero-dependance.md) (confirmé) ;
  [ADR-0024](0024-une-section-a-la-fois-dans-un-contenu-borne.md) (§1 et la
  partie navigation de §2 remplacés ici ; §3, §4, §5 en vigueur) ;
  [ADR-0017](0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md)
  (méthode d'absorption citée par ADR-0024 §3, sans rapport direct mais
  structurant le même document amendé).
- Design system : `docs/DESIGN-SYSTEM.md` §6 (liste des cycles, réécrit par
  ce cycle), §9 (interdits, complétés par la CSP mesurée).
- Spec : `specs/features/doing/feature-021-revenir-a-un-tableau-de-bord-unifie.md`
  — « Grandeurs mesurées » (mesures reprises telles quelles ci-dessus),
  verdicts A1/A2/A3 de l'architecte, « Design retenu » du designer.
- Mesure externe : `curl "https://unpkg.com/three@0.186.0/build/?meta"`,
  2026-09-19.

---

> **Note additive (2026-09-20)** : la prémisse du §3 selon laquelle « une scène 3D
> serait l'effet décoratif que la spec interdit » a été **retirée par l'utilisateur
> comme règle** le 2026-09-19, en cours de cycle (voir le Journal de bord de
> `feature-021`, entrée « REPRISE DE CYCLE »). Elle reste vraie comme **constat** :
> la maquette Material 3 finalement adoptée le 2026-09-20 est en 2D, donc la
> question d'une scène 3D authentique ne s'est pas reposée. Le refus de `three.js`
> tient désormais sur le **poids mesuré** (2 120 885 octets, §3 ci-dessus) et sur
> `ADR-0006` seuls — pas sur cette prémisse retirée. Aucune réhabilitation de
> WebGL ou de `three.js` : le prototype adopté ne s'en sert pas.
