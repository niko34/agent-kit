# ADR-0033 — Le thème sombre est supprimé

## Statut

Accepté

## Date

2026-09-20

## Contexte

Depuis `feature-015`, le centre de contrôle propose deux thèmes (clair et sombre),
partageant les mêmes teintes à des clartés différentes (`ADR-0022`), avec une
bascule à trois positions (clair / sombre / système, `DESIGN-SYSTEM.md` §7).

La maquette Material 3 fournie par l'utilisateur (`control-center/maquettes/2026-09-20-maquette-materiel-3.html`)
est en `color-scheme: light`, sans aucun attribut `data-theme` ni palette sombre.
Aucune des références de conception fournies (le document de décisions, les
illustrations conservées) ne montre de variante sombre. Décision humaine du
2026-09-20 : adopter la maquette **telle quelle** plutôt que d'inventer une palette
sombre M3 qui ne figure dans aucune référence — l'inverse exact de ce que
« adoption fidèle » voudrait dire.

## Décision

### Le thème sombre est retiré, la bascule de thème disparaît

Le centre de contrôle devient **mono-thème**, clair. Ce que ça emporte, mesuré le
2026-09-20 :

| Élément | Mesure | Sort |
|---|---|---|
| `control-center/web/theme.js` | **75 lignes** | Retiré en entier |
| `control-center/web/test_app_theme.js` | **1 046 lignes** | Perd son objet, à retirer |
| `control-center/web/test_app_theme_navigateur.py` | **515 lignes** | Perd son objet, à retirer |
| Règles `data-theme`/`prefers-color-scheme` dans `app.css` | **5** règles | À retirer |
| Occurrences liées au thème dans `app.js` | **34** | À retirer |

### `ADR-0022` partiellement révoqué

Au-delà des §1-§3 déjà révoqués par `ADR-0032` (identité colorée), la suppression du
thème sombre rend sans objet toute clause d'`ADR-0022` formulée « dans les deux
thèmes » — le plancher perceptuel du §5, la méthode de mappage de gamut du §6, la
marge de conception du §7 restent des méthodes valides en elles-mêmes (voir
`ADR-0032 §4`), mais leur application « dans les deux thèmes » n'a plus qu'un thème
sur lequel s'exercer. `ADR-0022` est donc marqué partiellement révoqué au même
titre, sans qu'aucun paragraphe supplémentaire n'ait à être réécrit : ce sont les
conditions d'application qui se réduisent, pas la méthode elle-même.

### Ce qui est perdu, et ce qui doit être remesuré

- **L'acquis de `feature-015`** (bascule de thème à trois positions, persistance
  dans `localStorage`, lecture avant premier rendu pour éviter le clignotement) est
  perdu — il n'a plus d'objet sans second thème à choisir.
- **Le contraste corrigé par `bug-016`** portait sur des jetons du thème sombre
  (`--texte-faible`, `--texte-doux` contre les quatre surfaces). Il doit être
  **remesuré** contre la palette M3 claire du prototype, qui n'a jamais été
  auditée sous cet angle — rien ne garantit que les contrastes mesurés pour l'ancien
  thème clair (`DESIGN-SYSTEM.md` §2, tableau « Contrastes tenus ») tiennent contre
  les nouveaux jetons de la maquette. C'est le rôle de la garde F5 (matrice de
  contraste complète, seuil 4,65) du cycle d'implémentation de `feature-021`.

### `DESIGN-SYSTEM.md` §2 et §7 amendés

§2 (« Deux thèmes, une seule palette ») perd sa prémisse : il n'y a plus qu'un
thème. §7 (« Bascule de thème ») n'a plus d'objet : sans second thème, il n'y a rien
à basculer, et la maquette ne dessine aucun contrôle de ce type dans sa barre
supérieure. Les deux sections sont amendées en conséquence dans le corps du design
system.

## Alternatives considérées

- **Inventer une palette sombre M3** en dérivant les jetons clairs du prototype par
  une méthode équivalente à celle d'`ADR-0022 §1` (clarté/intensité constantes).
  Écartée : aucune référence fournie ne montre à quoi cette palette devrait
  ressembler, et en fabriquer une reviendrait à ajouter une interprétation là où
  l'utilisateur demande une adoption fidèle du prototype fourni.
- **Garder le thème sombre existant en l'état**, sans le confronter à la nouvelle
  palette M3, et ne servir le thème clair que pour les nouveaux composants.
  Écartée : cela aurait produit un centre de contrôle à deux systèmes visuels
  simultanés (l'ancien sombre, orphelin, et le nouveau clair M3), plus coûteux à
  maintenir que l'un ou l'autre séparément, pour un thème sombre que rien ne
  demande plus.
- **Conserver la bascule de thème mais la limiter à « clair » et « système ».**
  Écartée : sans palette sombre, « système » en préférence sombre resterait clair
  quand même — un contrôle qui promet un effet qu'il ne produit jamais, l'exact
  défaut que `DESIGN-SYSTEM.md` §7 avait déjà dû corriger une fois (« système doit
  annoncer où il aboutit »).

## Conséquences

### Positives

- Fidélité totale à la seule référence de couleur fournie par l'utilisateur : aucune
  palette inventée sans base mesurable.
- Suppression nette de **1 636 lignes** de code et de tests (`theme.js` +
  `test_app_theme.js` + `test_app_theme_navigateur.py`) et de **39** points de
  couplage (5 règles CSS + 34 occurrences JS) qui n'ont plus de fonction.
- Une seule palette à faire tenir dans la matrice de contraste (garde F5), au lieu
  de deux.

### Négatives

- **Perte fonctionnelle réelle** pour tout utilisateur qui préférait le thème
  sombre — ce n'est pas un simple retrait de code mort, c'est un retrait d'option
  utilisateur déjà livrée (`feature-015`).
- Le contraste de `bug-016`, acquis pour l'ancien thème sombre, ne se reporte pas
  automatiquement : il doit être intégralement remesuré contre la nouvelle palette,
  sans présumer qu'elle hérite des marges déjà validées.
- Un futur retour à un thème sombre repartirait de zéro sur la génération de
  palette (§4 d'`ADR-0032` s'applique à l'identité par agent, pas à une variante
  sombre de la palette sémantique M3, qui n'a jamais été définie).

### Ce que ça verrouille

- Le centre de contrôle reste mono-thème tant qu'aucune référence de conception
  sombre n'est fournie ; en fabriquer une sans référence resterait la même faute
  que celle que cet ADR évite.
- Toute réintroduction d'un thème sombre est un changement structurant qui repasse
  par un ADR, pas par un ajustement de jetons au fil de l'eau.

## Références

- Code (à livrer par `feature-021`, non modifié par cet ADR) :
  `control-center/web/theme.js` (supprimé), `control-center/web/app.css`,
  `control-center/web/app.js`, `control-center/web/test_app_theme.js` (supprimé),
  `control-center/web/test_app_theme_navigateur.py` (supprimé).
- Maquette : `control-center/maquettes/2026-09-20-maquette-materiel-3.html`,
  `:root { color-scheme: light; }`, aucun `data-theme`.
- ADR : [ADR-0022](0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md)
  (partiellement révoqué ici, au-delà de la révocation d'`ADR-0032`) ;
  [ADR-0032](0032-l-identite-coloree-des-agents-disparait-du-diagramme.md).
- Design system : `docs/DESIGN-SYSTEM.md` §2 (amendé), §7 (amendé, sans objet).
- Spec : `specs/features/doing/feature-021-revenir-a-un-tableau-de-bord-unifie.md`
  — « REFONDATION » du 2026-09-20, « Grandeurs mesurées » (lignes des fichiers
  perdant leur objet).
- Bug absorbé au titre du contraste à remesurer : `specs/features/done/bug-016-*.md`.

> **Note (2026-09-21)** : le lot 1 de `feature-021` a livré cette décision
> avec un écart sur un point de mise en œuvre, sans revenir sur la décision
> elle-même. Le tableau ci-dessus annonçait `control-center/web/theme.js`
> **« retiré en entier »** ; le fichier livré est en réalité **modifié, pas
> supprimé** (75 lignes → 57 lignes) : il ne pose plus `data-theme` ni ne
> gère plus la bascule, mais il reste responsable de `data-section`, un rôle
> distinct hérité de `feature-019` (persistance de la section active dans
> `localStorage`, appliquée avant le premier rendu) qui n'a jamais dépendu du
> thème et n'avait pas de raison de disparaître avec lui. Les autres lignes du
> tableau (`test_app_theme.js`, `test_app_theme_navigateur.py`, les règles
> `data-theme`/`prefers-color-scheme` dans `app.css`, les occurrences dans
> `app.js`) sont retirées comme annoncé. Mesuré : suite de
> `control-center/web/` à 1586 cas, 0 échec ; garde neuve
> `test_conformite_theme_unique.{js,py}` (10 cas) qui échoue si `data-theme`
> ou `@media (prefers-color-scheme: dark)` reviennent dans le code servi.
