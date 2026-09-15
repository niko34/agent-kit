## Métadonnées
- **ID** : feature-017
- **Slug** : diagramme-de-deroule-du-cycle
- **Type** : feature
- **Statut** : todo
- **Priorité** : haute
- **Version cible** : 0.9.0
- **Dernière mise à jour** : 2026-09-15
- **Spec(s) liée(s)** : dépend de feature-015 (jetons) et feature-016 (accordéon)

## Domaines touchés
- [x] Frontend (écrans, composants, appels API)

## Agents requis
- [x] spec-reader
- [x] architect
- [x] ux-ui-designer — conformité au design system, §5
- [x] frontend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Description

Afficher, dans le détail du cycle déplié, un **diagramme du déroulé** : un cercle
par agent, dimensionné et gradué, relié en séquence, avec les agents simultanés
empilés verticalement.

## Contexte

La représentation actuelle des enchaînements n'est pas lisible. Plusieurs pistes
ont été explorées puis mesurées ; le design system (§5) fige la grammaire
retenue. Cette spec l'implémente.

Deux constats issus du journal réel ont façonné cette grammaire :

- **Les jetons ne sont pas mesurés.** Le journal porte l'horodatage, l'outil, le
  fichier, l'échec — pas de compte de jetons. L'encodage repose donc sur les
  **appels d'outils**, qui ont l'avantage de ne pas suivre la durée : un
  `test-engineer` qui relance 80 fois la suite et un `backend-developer` qui
  écrit 53 fichiers en 235 appels racontent deux métiers différents.
- **Les agents se recouvrent.** Sur un cycle réel de neuf agents, `code-reviewer`
  et `security-reviewer` tournent ensemble, et un `debugger` redémarre avant la
  fin du premier. Une représentation purement séquentielle raconte une histoire
  qui n'a pas eu lieu.

## Comportement attendu

1. **Un cercle par agent**, dans le détail du cycle déplié :
   - le **diamètre** porte la durée ;
   - les **graduations** autour du cercle comptent les appels d'outils sur une
     échelle bornée, avec une encoche de zéro, un cran de plafond et un anneau
     fantôme donnant la pleine échelle ;
   - le **liseré intérieur** porte le nombre de fichiers écrits ;
   - la densité des graduations **s'adapte au rayon** : elles ne se touchent
     jamais.
2. **Sous chaque cercle** : heure de départ, puis durée, puis nom de l'agent.
3. **L'écart horizontal ne mesure pas le temps** — il garantit la lisibilité.
   Chaque agent réclame la demi-largeur du plus exigeant entre son cercle avec
   ses graduations et le plus long de ses libellés.
4. **Les agents simultanés** occupent un créneau unique et s'empilent
   **verticalement**, dans un cadre au filet discret — même fond que le
   diagramme, jamais d'aplat. Leurs libellés passent à droite du cercle.
5. **L'attente** entre deux agents s'écrit dans une pastille posée sur le lien
   au-delà de deux minutes, et la place lui est réservée dans le placement.
6. **Un rebouclage** relie une reprise à l'occurrence précédente du **même**
   agent, par un arc pointillé avec pointe de direction.
7. **Un échec** est signalé de façon redondante : couleur, croix, cercle en
   pointillé.
8. La zone **défile horizontalement** quand le tracé dépasse la largeur ; elle ne
   se comprime pas. Une **légende** rappelle ce que chaque forme encode.

### Cas limites

- **Un seul agent** : pas de lien, pas de défilement, mise en page correcte.
- **Cycle très long** (≥ 18 agents) : rien ne se chevauche, rien ne disparaît en
  silence, le défilement suffit.
- **Groupe simultané de 5 agents ou plus** : replier la pile — quatre visibles et
  « +N » — plutôt que laisser le bloc grandir sans fin.
- **Agent à zéro appel d'outil** : cercle sans graduation allumée, l'anneau
  fantôme reste visible.
- **Nom d'agent très long** : c'est le libellé, pas le cercle, qui commande
  l'écart.
- **Agent en cours** : se distingue par un anneau supplémentaire et la graisse du
  texte, pas par la seule couleur.

## Comportement actuel

Les enchaînements sont représentés par des maillons textuels en ligne, avec un
liseré ambre pour une reprise et un bandeau de rebouclage. Aucune notion de
durée, d'ampleur, ni de simultanéité.

## Contraintes techniques

- **SVG écrit à la main**, engendré depuis les données. Aucune bibliothèque de
  graphiques (ADR-0006).
- Le SVG **lit les jetons** (`var(--a-dbg)`), il ne recopie aucune couleur : un
  seul diagramme sert les deux thèmes.
- Le diagramme est sur `--creux`, jamais sur un fond qui lui serait propre.
- Molette seule = la page ; `Maj` + molette ou glisser = la zone. La zone prend
  le focus clavier et se parcourt aux flèches.
- Tout nombre affiché vient du journal. **Aucune donnée inventée** — en
  particulier, pas de compte de jetons.

## Fichiers potentiellement concernés

- `control-center/web/app.js` — engendrement du SVG, placement, groupes
- `control-center/web/app.css` — la zone, le défilement, la légende
- `control-center/backend/events.py` — seulement si une donnée manque
  (simultanéité, compte d'outils par agent) ; ajout **additif** uniquement
- `control-center/web/test_app_diagramme.js` + `.py`

## Livrables — check-list
- [ ] A1 — cercle gradué : diamètre, graduations adaptatives, zéro, plafond,
      anneau fantôme, liseré des fichiers
- [ ] B1 — placement dicté par la lisibilité, socle heure / durée / nom
- [ ] C1 — groupes simultanés empilés verticalement, cadre au filet, repli au-delà de quatre
- [ ] D1 — liens, pastilles d'attente, arcs de rebouclage, marquage d'échec
- [ ] D2 — défilement horizontal, légende, accès clavier

## ADR attendu ?
- **Probable** : oui
- **Critère(s) candidat(s)** : 1, 3, 4
- **Sujet pressenti** : la grammaire d'encodage du diagramme — ce que porte le
  diamètre, ce que portent les graduations, et le fait que **l'écart horizontal
  ne mesure pas le temps**. Verrouille la lecture pour tout ajout futur, et deux
  alternatives ont été essayées puis écartées (échelle de temps réelle,
  disposition en deux couloirs).

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- aucun

### Écrans / flux UI concernés
- Le détail d'un cycle déplié gagne le diagramme et sa légende

### Schéma BDD / migrations
- aucun

### Documentation à produire / mettre à jour
#### Docs vivantes
- `docs/features/page-centre-de-controle.md` — le diagramme et sa lecture

#### Docs transverses
- `CHANGELOG.md` — entrée 0.9.0

#### Docs immuables
- `docs/adr/NNNN-grammaire-du-diagramme-de-deroule.md`

## Critères d'acceptation
- [ ] Sur un cycle réel de neuf agents, **aucun libellé n'en chevauche un autre**
      — vérifié par un test qui calcule les boîtes, pas par relecture d'une capture
- [ ] Deux agents qui se recouvrent dans le temps apparaissent **empilés dans un
      même créneau**, jamais côte à côte
- [ ] Un groupe de six agents simultanés se replie à quatre plus un « +2 »
- [ ] Le nombre de graduations allumées d'un agent correspond à son compte
      d'appels d'outils, à l'arrondi de l'échelle près
- [ ] Un agent à zéro appel d'outil s'affiche sans graduation allumée et reste lisible
- [ ] Un cycle de 18 agents ne produit aucun chevauchement et aucun élément hors cadre
- [ ] Le diagramme est correct dans **les deux thèmes** sans code dupliqué —
      vérifié en changeant de thème sans recharger
- [ ] Aucun nombre affiché ne provient d'une source absente du journal
- [ ] Suite de tests complète verte, zéro régression
- [ ] Lint propre, pas de warning nouveau

## Plan de test manuel
1. Déplier le cycle le plus récent : le diagramme s'affiche, les durées lues
   correspondent à celles de la table en dessous.
2. Changer de thème sans recharger : le diagramme suit, aucune couleur ne reste
   figée.
3. Réduire la fenêtre jusqu'à provoquer le défilement : la molette continue de
   faire défiler la page, `Maj` + molette fait défiler la zone.
4. Atteindre la zone au clavier et la parcourir aux flèches.
5. Lancer deux agents en parallèle sur un clone jetable : ils apparaissent
   empilés, pas en séquence.
6. Tuer un agent : son cercle passe à l'état sans clôture, distinct de l'échec.

## Notes pour agent

**Toute expérience se fait sur un clone jetable** (`cp -a`, jamais `git clone`),
en clonant `control-center/` **et** `.claude/agents/`. Le port 8788 est occupé
par le serveur de l'utilisateur : ne pas le tuer, ne pas le prendre.

Une capture d'écran en mode sans fenêtre est possible et **a déjà trouvé deux
défauts qu'une suite de 34 tests avait laissés passer** :
`chromium --headless=new --virtual-time-budget=N --screenshot`. Elle ne remplace
pas un test — elle le complète, et un test qui mesure une géométrie vaut mieux
qu'une capture qu'on relit.

Le journal réel est en lecture seule pour les mesures, et il grossit pendant
qu'on le mesure : figer un instantané.
