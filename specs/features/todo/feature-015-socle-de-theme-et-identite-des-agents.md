## Métadonnées
- **ID** : feature-015
- **Slug** : socle-de-theme-et-identite-des-agents
- **Type** : feature
- **Statut** : todo
- **Priorité** : haute
- **Version cible** : 0.9.0
- **Dernière mise à jour** : 2026-09-15
- **Spec(s) liée(s)** : feature-016 (accordéon) et feature-017 (diagramme) en dépendent

## Domaines touchés
- [x] Frontend (écrans, composants, appels API)

## Agents requis
- [x] spec-reader
- [x] architect
- [x] ux-ui-designer — le design system existe, il s'agit de **vérifier la conformité**, pas de re-arbitrer
- [x] frontend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Description

Doter le centre de contrôle d'une **identité de couleur par agent** et d'un
**second thème clair**, commandés par une bascule à trois positions.

## Contexte

`docs/DESIGN-SYSTEM.md` décrit la cible ; `control-center/web/app.css` décrit
l'existant, et les deux divergent sur deux points :

- la feuille actuelle porte des jetons **sémantiques** — `--accent`, `--actif`,
  `--alerte`, `--echec` — et **aucune couleur par agent** ; un `debugger` et un
  `test-engineer` s'affichent aujourd'hui de la même façon ;
- il n'existe **qu'un thème sombre**, avec `color-scheme: dark` figé.

Cette spec est le **socle** : tant qu'elle n'est pas livrée, l'accordéon
(feature-016) et le diagramme (feature-017) n'ont pas de couleurs à consommer.

La propriété à préserver — elle est déjà vraie — est que **chaque couleur
n'apparaît qu'une fois**, dans le bloc `:root`. Treize littéraux, treize
variables, aucun hexadécimal ailleurs dans la feuille.

## Comportement attendu

1. **Six identités d'agent** exposées en jetons (`--a-<rôle>` pour le trait, le
   sigle et les graduations ; `--f-<rôle>` pour le remplissage), engendrées par
   la méthode du §2 du design system : teinte fixée par rôle, clarté et
   intensité constantes à l'intérieur d'un thème.
2. **Deux thèmes** partageant exactement les mêmes teintes ; seules la clarté et
   l'intensité changent. Les jetons sémantiques existants (`--accent`, `--actif`,
   `--alerte`, `--echec`) sont conservés et déclinés dans les deux thèmes.
3. **Trois positions de thème** — clair, système, sombre — dans une commande en
   haut à droite. **« Système » est le défaut.**
4. La position **« système » annonce sa résolution** : son icône suit le thème
   auquel elle aboutit à cet instant, et son libellé accessible le nomme —
   « Suivre le système (actuellement sombre) ».
5. Le choix **persiste** entre deux ouvertures, et il est **appliqué avant le
   premier rendu**.
6. En position « système », un changement de préférence de l'OS **pendant que la
   page est ouverte** est suivi sans rechargement.

### Cas limites

- `localStorage` indisponible ou en échec (fenêtre privée, données bloquées) :
  la page s'affiche correctement, en position « système », sans exception.
- Une valeur inconnue stockée sous la clé du thème : traitée comme « système »,
  et la clé est nettoyée.
- `prefers-reduced-motion` : la bascule ne produit aucune transition animée.
- L'OS n'exprime aucune préférence : « système » vaut clair.

## Comportement actuel

Thème sombre unique, figé par `color-scheme: dark`. Aucune commande de thème.
Aucune couleur portant l'identité d'un agent.

## Contraintes techniques

- **Zéro dépendance, zéro ressource distante** : la CSP du serveur n'autorise que
  `'self'`. Variables CSS natives, aucun préprocesseur. Voir ADR-0006.
- Les trois déclarations de jetons sont **obligatoires** : `:root` nu,
  `@media (prefers-color-scheme: dark)` protégé par
  `:root:not([data-theme="clair"])`, et `:root[data-theme="sombre"]`. Sans la
  troisième, un choix explicite ne gagne pas contre la préférence système.
- `color-scheme` suit le thème résolu, sinon les éléments natifs (barres de
  défilement, champs) restent dans l'ancien registre.
- Le SVG **lit les jetons** (`var(--a-dbg)`), il ne recopie aucune couleur :
  c'est ce qui permet à un seul diagramme de servir les deux thèmes.

## Fichiers potentiellement concernés

- `control-center/web/app.css` — les jetons, les trois déclarations
- `control-center/web/index.html` — la commande de thème, le script d'amorçage
- `control-center/web/app.js` — application, persistance, écoute de `matchMedia`
- `control-center/web/test_app_theme.js` + `test_app_theme.py` — pont Python,
  sur le modèle de `test_app_bug012.js` / `.py`
- `docs/DESIGN-SYSTEM.md` — retirer la mention « décrit la cible » une fois livré

## Livrables — check-list
- [ ] A1 — jetons d'identité pour les six rôles, dans les deux thèmes
- [ ] A2 — jetons sémantiques existants déclinés dans les deux thèmes
- [ ] B1 — commande à trois positions, « système » par défaut et annonçant sa résolution
- [ ] C1 — persistance protégée + application avant premier rendu
- [ ] D1 — suivi de `matchMedia` en position « système »

## ADR attendu ?
- **Probable** : oui
- **Critère(s) candidat(s)** : 1, 3
- **Sujet pressenti** : une palette catégorielle se construit à clarté et
  intensité constantes ; les deux thèmes partagent les teintes. Contrainte
  imposée à tout ajout d'agent futur, et deux alternatives mesurées puis
  écartées (assombrissement mécanique, canevas sombre invariant).

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- aucun

### Écrans / flux UI concernés
- Toutes les surfaces du centre de contrôle (repeintes)
- Nouvelle commande de thème en haut à droite

### Schéma BDD / migrations
- aucun

### Documentation à produire / mettre à jour
#### Docs vivantes
- `docs/features/page-centre-de-controle.md` — la commande de thème
- aucun module backend touché

#### Docs transverses
- `README.md` — mention du choix de thème
- `CHANGELOG.md` — entrée 0.9.0

#### Docs immuables
- `docs/adr/NNNN-palette-categorielle-a-clarte-et-intensite-constantes.md`

## Critères d'acceptation
- [ ] Un choix explicite gagne contre la préférence système **dans les deux
      sens** : `data-theme="clair"` sous système sombre rend le fond clair, et
      `data-theme="sombre"` sous système clair rend le fond sombre — vérifié sur
      la couleur réellement peinte, pas sur la règle CSS
- [ ] Aucun littéral de couleur hors du bloc `:root` de `app.css` — vérifié par
      un test qui lit la feuille
- [ ] Les six couleurs d'agent atteignent **≥ 4,5:1** contre leur fond, et chaque
      sigle **≥ 4:1** contre son propre remplissage, **dans les deux thèmes** —
      vérifié par un test qui calcule le contraste depuis les jetons
- [ ] Deux rôles n'ont jamais la même couleur ni le même sigle
- [ ] Avec `localStorage` en échec simulé, la page s'affiche en « système » sans
      exception levée
- [ ] Au chargement, aucune image ne montre le mauvais thème avant le bon
- [ ] Suite de tests complète verte, zéro régression
- [ ] Lint propre, pas de warning nouveau

## Plan de test manuel
1. Ouvrir avec un OS en clair : la page est claire, la position du milieu est
   active, son libellé dit « actuellement clair ».
2. Basculer l'OS en sombre sans recharger : la page suit, le libellé change.
3. Cliquer « sombre », basculer l'OS en clair : la page **reste** sombre.
4. Recharger : le choix est conservé, sans clignotement.
5. Cliquer « système » : la page revient à la préférence de l'OS, et la clé
   stockée disparaît.
6. Naviguer à la commande au clavier seul : focus visible, activation possible,
   libellé annoncé correct.

## Notes pour agent

Les suites du centre de contrôle sont des **scripts autonomes** — `python3
<fichier>`, sortie « N cas, M echec(s) », code 1 si échec. Ce ne sont pas des
`unittest`. Pour la partie JavaScript, suivre le pont existant
`test_app_bug012.js` + `test_app_bug012.py`, qui se saute proprement si `node`
est absent, et veiller à ce que le fichier soit ramassé par la découverte CI
(`find control-center -name 'test_*.py'`).

Le piège mesuré pendant la conception : le script qui applique le thème au
chargement **écrase** un attribut `data-theme` posé à la main. Tout test qui veut
éprouver la règle CSS seule doit neutraliser ce script, sinon il mesure autre
chose et passe pour vert.
