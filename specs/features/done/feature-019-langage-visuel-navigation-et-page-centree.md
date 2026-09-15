## Métadonnées
- **ID** : feature-019
- **Slug** : langage-visuel-navigation-et-page-centree
- **Type** : feature
- **Statut** : todo
- **Priorité** : haute
- **Version cible** : 0.10.0
- **Dernière mise à jour** : 2026-09-15
- **Spec(s) liée(s)** : absorbe `bug-016` ; précède `feature-017` ; s'appuie sur
  `feature-015` (jetons) et `feature-016` (accordéon), toutes deux closes

## Grandeurs mesurées
<!-- Mesuré le 2026-09-15 avant écriture, conformément au gabarit. -->
- **Blocs de contenu de la page** = **8** — mesuré par
  `grep -c '<h2' control-center/web/index.html` : Agents · Système · Que
  souhaitez-vous développer ? · Spécifications · Pilotage · Cycles · Fichiers
  touchés · Derniers événements
- **Usages de la pile à chasse fixe** = **31**, **usages de la pile sans-serif**
  = **2** — mesuré par `grep -c 'var(--mono)' / 'var(--sans)'` sur `app.css`
- **Surfaces concernées** = `index.html` 193 lignes · `app.css` 803 · `app.js`
  1 921
- **Contraste de `--texte-faible`** = **3,55:1** sur `--surface-2` en thème
  sombre, **4,24:1** sur `--fond` — sous le seuil de 4,5:1 du §8 (origine de
  `bug-016`, absorbée ici)

## Domaines touchés
- [x] Frontend (écrans, composants, appels API)

## Agents requis
- [x] spec-reader
- [x] architect
- [x] **ux-ui-designer** — refonte de surface, arbitrage de mise en page
- [x] frontend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Description

Faire adopter au centre de contrôle **son propre design system** : une colonne
de navigation étroite, une section visible à la fois, et un contenu borné et
centré — au lieu de l'empilement actuel à colonne latérale et chasse fixe.

## Contexte

`docs/DESIGN-SYSTEM.md` existe depuis le 2026-09-14 et fixe les surfaces (§3) et
la typographie (§4). **Personne ne l'a jamais appliqué à l'existant.** Mesuré :
la feuille compte **31** usages de la pile à chasse fixe contre **2** de la pile
sans-serif, alors que le §4 réserve explicitement le monospace aux identifiants
techniques — « pas aux libellés d'interface ».

Trois cycles ont été livrés depuis : `feature-015` a posé les jetons et les deux
thèmes, `feature-016` la liste des cycles en accordéon. Les deux ont travaillé
**à l'intérieur** de la mise en page héritée. Le découpage initial du chantier
comportait les jetons, le comportement et le diagramme — **pas la mise en page**.
C'est un manque de ce découpage, constaté en comparant l'écran réel aux
maquettes, et cette spec le comble.

**Décision de structure prise par l'utilisateur le 2026-09-15** : colonne de
navigation étroite plus page centrée, une section à la fois. C'est aussi la
structure de l'outil qui a servi de référence visuelle au design system.

## Comportement attendu

1. **Une colonne de navigation étroite**, persistante, listant les sections.
   Elle **navigue**, elle ne contient pas de contenu.
2. **Une seule section visible à la fois**, dans un contenu **borné en largeur et
   centré**. Chaque section s'ouvre sur un fil d'Ariane et un titre.
3. **La typographie du §4 s'applique** : pile système sans-serif pour les
   libellés, monospace **réservé** aux identifiants techniques — chemins, sigles,
   codes — et chiffres à chasse fixe partout où des nombres se lisent en colonne.
4. **Les trois surfaces du §3** structurent la page ; un bloc se délimite par son
   **filet**, jamais par un aplat plus marqué.
5. **Les huit blocs existants sont tous replacés** — aucun ne disparaît sans
   décision écrite. L'`ux-ui-designer` arbitre leur regroupement en sections.
6. **`--texte-faible` et `--texte-doux` repassent au-dessus du seuil**
   (absorption de `bug-016`, voir ci-dessous).

### Cas limites

- **Écran étroit** (≤ 600 px) : la navigation se replie sans rendre une section
  inatteignable.
- **Section vide** : chaque section a son état vide propre, qui dit quoi faire.
- **Rafraîchissement périodique** : il ne change pas la section affichée et ne
  perd pas la position de lecture — la garantie déjà tenue par `feature-016`
  pour l'accordéon vaut pour la navigation.
- **Sans JavaScript ou avant son exécution** : la page ne doit pas rester vide ni
  afficher les huit sections d'un coup.
- **Navigation au clavier seul** : chaque section est atteignable et l'élément
  actif est annoncé.

## Comportement actuel

Barre supérieure, colonne latérale portant Agents et Système, et six blocs
empilés dans une colonne centrale. Tout est en chasse fixe, à forte densité,
sans hiérarchie de titres ni largeur bornée. L'écran ne ressemble pas aux
maquettes qui ont fondé le design system.

## Contraintes techniques

- **Zéro dépendance, zéro ressource distante** (ADR-0006). Pas de routeur, pas de
  framework : la navigation est du code à la main.
- **CSP `default-src 'self'`** sans `'unsafe-inline'` pour les scripts : **aucun
  `<script>` inline**. Ne jamais proposer de l'assouplir — escalade humaine.
- **Aucun littéral de couleur hors du bloc de littéraux** d'`app.css` ; tout
  jeton neuf est servi dans les **trois** blocs de thème.
- **Lecture seule** : aucune route d'écriture ajoutée (ADR-0004). Le contrat
  `/api/etat` reste inchangé.
- **Aucune information perdue.** Les huit blocs, leurs libellés et leurs
  infobulles survivent au déplacement. Ce qui disparaît est **décidé et écrit**,
  jamais laissé tomber.
- La **section courante** est une préférence d'affichage locale, pas un état
  serveur.

## Absorption de `bug-016` — au titre d'ADR-0017

Cette spec applique la typographie du §4, donc elle **s'appuie** sur les jetons de
texte. Or `--texte-faible` est mesuré à **3,55:1**, sous le seuil de 4,5:1 que le
§8 exige pour du texte.

Appliquer une règle typographique en bâtissant sur un jeton qu'on sait
défaillant reviendrait à livrer une hiérarchie de texte dont on sait déjà qu'elle
ne tient pas son propre critère. **`bug-016` entre donc dans ce cycle** — même
raisonnement que pour le contour de « sans clôture » dans `feature-016`.

`specs/features/todo/bug-016-…` est traitée ici ; le cycle porte les deux specs
dans `doing/`, avec une seule phase de test, de revue et de documentation, comme
l'exige l'exception de `CLAUDE.md`.

## Fichiers potentiellement concernés

- `control-center/web/index.html` — structure, navigation, sections
- `control-center/web/app.css` — typographie, surfaces, mise en page, jetons de texte
- `control-center/web/app.js` — navigation, section courante, rendu par section
- `control-center/web/test_app_navigation.js` + `.py` — suite neuve
- `docs/DESIGN-SYSTEM.md` — §3 et §4 marqués appliqués ; jetons de texte corrigés
- `docs/features/page-centre-de-controle.md` — la nouvelle structure

## Livrables — check-list
- [ ] A1 — colonne de navigation étroite, persistante, qui navigue sans contenir
- [ ] A2 — une section à la fois, contenu borné et centré, fil d'Ariane et titre
- [ ] B1 — typographie du §4 appliquée : monospace réservé aux identifiants
- [ ] B2 — surfaces du §3 appliquées ; un bloc se délimite par son filet
- [ ] C1 — les huit blocs replacés, aucun perdu sans décision écrite
- [ ] C2 — `--texte-faible` et `--texte-doux` au-dessus du seuil, dans les deux
      thèmes, sur les trois surfaces (absorption de `bug-016`)
- [ ] D1 — navigation au clavier, section courante annoncée, repli en écran étroit

## ADR attendu ?
- **Probable** : oui
- **Critère(s) candidat(s)** : 1, 4
- **Sujet pressenti** : le centre de contrôle affiche **une section à la fois**
  dans un contenu borné, et la navigation est une colonne qui ne porte aucun
  contenu. Contraint tout écran futur, et verrouille l'abandon de l'empilement.

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- aucun

### Écrans / flux UI concernés
- **Toute** la surface du centre de contrôle

### Documentation à produire / mettre à jour
#### Docs vivantes
- `docs/features/page-centre-de-controle.md` — la navigation et les sections

#### Docs transverses
- `CHANGELOG.md` — entrée 0.10.0
- `docs/DESIGN-SYSTEM.md` — §3 et §4 marqués appliqués ; jetons de texte corrigés

#### Docs immuables
- `docs/adr/NNNN-une-section-a-la-fois-dans-un-contenu-borne.md`

## Critères d'acceptation
- [ ] **Exactement une section visible** à la fois, vérifié par un test qui
      épingle laquelle — pas seulement « une seule »
- [ ] Le **monospace n'apparaît plus que sur des identifiants techniques** —
      vérifié par un test qui lit la feuille, pas par relecture. Entrée du
      cycle : **31 usages contre 2**
- [ ] **Tous les jetons de texte** atteignent **≥ 4,5:1** contre `--fond`,
      `--surface` et `--creux`, **dans les deux thèmes**, contraste **calculé
      depuis les jetons** — et le test couvre **tous** les jetons de texte, pas
      seulement les deux corrigés, sinon le prochain ajouté y échappera
- [ ] La **hiérarchie des trois niveaux de texte reste lisible** : un jeton
      relevé jusqu'à se confondre avec son voisin ne corrige rien
- [ ] **Les huit blocs sont atteignables** après refonte, vérifié un par un
- [ ] Un **rafraîchissement** ne change pas la section affichée ni la position
- [ ] **Navigation au clavier seul** : chaque section atteinte, l'active annoncée
- [ ] À **600 px de large**, aucune section n'est inatteignable
- [ ] Suite complète verte, compte de cas **strictement supérieur** à l'entrée
- [ ] Validation par **mutation** : décaler un jeton de texte sous le seuil ;
      rendre deux sections visibles ; remettre du monospace sur un libellé

## Plan de test manuel
1. Parcourir les six sections à la souris, puis au clavier seul.
2. Réduire à 600 px : vérifier que la navigation se replie et que tout reste
   atteignable.
3. Basculer de thème pendant la navigation : rien ne saute, rien ne perd sa
   couleur.
4. Laisser le rafraîchissement périodique tourner sur une section : elle ne
   change pas, la position de lecture est conservée.
5. Comparer à la maquette `theme.html` : l'écart restant doit être **nommé**,
   pas constaté.

## Notes pour agent

**Cette spec applique un document qui existe déjà.** Le §3 et le §4 du design
system disent quoi faire ; le travail est de les appliquer à 2 917 lignes
écrites avant eux. Toute divergence entre le document et ce qui est livré doit
remonter — le document peut avoir tort, mais alors on l'amende, on ne l'ignore
pas.

⚠️ **Une correction s'arrête au premier endroit signalé, pas au dernier endroit
où la règle s'applique.** Constaté trois fois le 2026-09-15 : jetons sémantiques
corrigés en clair mais pas en sombre, règle de précédence appliquée aux badges
mais pas à la chaîne, tirets libérés dans la chaîne mais pas sur le badge. Ici la
règle typographique a **31 points d'application** : les traiter tous, et le
vérifier par une mesure, pas par relecture.

**Toute expérience sur un clone jetable** : `cp -a`, jamais `git clone`, avec
`control-center/` **et** `.claude/agents/` — un clone partiel écrit dans le vrai
journal. Le port **8788** est occupé par le serveur de l'utilisateur : ne pas le
prendre, ne pas le tuer. Tout arrêt vise un **PID capturé**.

La capture d'écran sans fenêtre est disponible et utile pour **constater** —
`chromium --headless=new --screenshot` — mais elle ne remplace aucun test. Sur ce
module, deux défauts ont été trouvés en regardant une image et deux autres en
mesurant des couleurs peintes ; aucun en relisant du code.
