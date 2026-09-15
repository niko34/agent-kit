# Page — Centre de contrôle

Tableau de bord web fourni avec le kit (`control-center/web/`), qui observe et
pilote les workflows d'agents. Une seule page. Voir
`control-center/README.md` pour le modèle de déploiement et
`docs/DESIGN-SYSTEM.md` pour les règles visuelles et leur méthode.

## Commande de thème

Un contrôle à trois positions, en haut à droite de la barre (`role="radiogroup"`,
navigation aux flèches, un seul arrêt de tabulation) :

- **Clair**
- **Système** — position par défaut
- **Sombre**

Le choix explicite pose `data-theme="clair"` ou `data-theme="sombre"` sur
`<html>` ; la position « système » ne pose rien et suit
`prefers-color-scheme`.

### « Système » annonce sa résolution

Les positions « clair » et « système » rendent le même écran tant que l'OS est
en clair — deux positions indiscernables à l'usage si rien ne les distingue.
La position « système » affiche donc l'apparence à laquelle elle aboutit à cet
instant : son icône suit le thème résolu, et son libellé accessible le
nomme — « Suivre le système (actuellement sombre) ». Les deux autres positions
gardent un libellé fixe.

### Persistance et premier rendu

Le choix persiste dans `localStorage` (clé `theme`) et son application se fait
**avant le premier rendu** : `control-center/web/theme.js`, chargé de façon
synchrone dans `<head>`, pose l'attribut `data-theme` sur `<html>` dès que le
script s'exécute, avant que le reste de la page ne se peigne. Sans cela, la
page clignoterait dans le mauvais thème le temps que le script principal
s'exécute.

- `localStorage` indisponible ou en échec (fenêtre privée, données bloquées) :
  la page s'affiche correctement, en position « système », sans exception.
- Une valeur inconnue stockée sous la clé `theme` est traitée comme
  « système », et la clé est nettoyée.

### Suivi de l'OS sans rechargement

En position « système », un changement de préférence de l'OS pendant que la
page reste ouverte est suivi en direct (écoute de
`matchMedia("(prefers-color-scheme: dark)")`), sans rechargement. Un choix
explicite (« clair » ou « sombre ») n'est jamais annulé par ce changement —
il gagne dans les deux sens contre la préférence système.

`prefers-reduced-motion` est respecté : la bascule ne produit aucune
transition animée.

## Identité de couleur par agent

Chaque agent affiché sur le diagramme et dans la liste des agents reçoit une
couleur propre, dérivée de son rôle (`--a-<rôle>` pour le trait, le sigle et
les graduations ; `--f-<rôle>` pour le remplissage). Deux rôles n'ont jamais
la même couleur ni le même sigle à deux lettres. La méthode qui engendre ces
couleurs — clarté et intensité constantes, seule la teinte varie — est
documentée dans `docs/DESIGN-SYSTEM.md` (§2) et son verrouillage dans
[ADR-0022](../adr/0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md).

Un rôle sans teinte assignée (type d'agent inconnu du tableau des identités)
reçoit le jeton neutre achromatique (`--a-neutre` / `--f-neutre`) plutôt
qu'une couleur d'agent recyclée : le neutre signale l'absence d'identité, il
n'en emprunte pas une.

Les deux thèmes partagent les mêmes teintes ; seules la clarté et l'intensité
diffèrent, ce qui permet au même diagramme SVG de servir les deux sans
recopier de couleur (il lit les jetons via `var()`).

## Voir aussi

- `docs/DESIGN-SYSTEM.md` — règles visuelles complètes, méthode de palette,
  grammaire du diagramme
- [ADR-0022](../adr/0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md)
  — la décision derrière la séparation des deux familles de jetons
- `control-center/README.md` — modèle de déploiement, jeton d'accès
