# Actions du backlog : lancer, modifier, supprimer

## Métadonnées
- **ID** : feature-025
- **Slug** : actions-du-backlog
- **Type** : feature
- **Statut** : todo
- **Priorité** : normale
- **Version cible** : N/A
- **Dernière mise à jour** : 2026-09-20
- **Spec(s) liée(s)** : `feature-021` (le kanban qui les porte), `feature-007`
  (pilotage et garde-fous), `feature-005` (synchronisation sélective)

## Grandeurs mesurées
- `routes d'écriture dans la table FERMÉE` = **4** — `/api/lancer`, `/api/interrompre`,
  `/api/spec/brouillon`, `/api/spec/ecrire`
- `ce que transporte `/api/lancer`` = **une clé**, choisie dans une **liste fermée**
  (`ADR-0005`), jamais un identifiant libre
- `routes de suppression` = **0** · `routes d'édition d'une spec existante` = **0**
- `champs exposés par `specs.py`` = `id`, `titre`, `colonne`, `statut_texte`,
  `statut_classe`, `priorite`, `type`, `maj`, `divergence`, `illisible`
- `champs manquants pour les cartes de la maquette` = **2** — l'**agent responsable** et
  la **progression**

## Domaines touchés
- [x] API REST — **des routes mutatrices et destructives**
- [x] Frontend
- [ ] BDD / migrations
- [x] Auth / permissions → **GATE obligatoire**
- [ ] Données personnelles
- [ ] Intégrations externes
- [ ] Tâches de fond

## Agents requis
- [x] spec-reader · [x] architect · [x] **security-reviewer, rôle GATE (P1, P2)**
- [ ] ux-ui-designer — le menu est spécifié par la maquette
- [x] backend-developer · [x] frontend-developer
- [x] test-engineer · [x] code-reviewer · [x] doc-writer

## Description

Chaque carte du kanban porte un bouton `⋮` ouvrant un menu Material 3 ancré à la carte.
Pour une carte de la première colonne, le menu commence par **« Lancer un cycle »**, puis
un séparateur, puis « Voir les détails » et « Modifier », puis un séparateur et l'action
destructive **« Supprimer »** en couleur d'erreur.

Cliquer le corps d'une carte ouvre un dialogue Material 3 : description, statut, priorité,
agent, critères d'acceptation, dépendance, date de mise à jour.

## Contexte

Le centre de contrôle sait lancer une **commande** choisie dans une liste fermée. Il ne
sait pas lancer **pour une spec donnée**, ni modifier une spec, ni en supprimer une.

## Comportement attendu
- Le menu gère le placement initial du focus, les flèches, Début/Fin, Échap, et **rend le
  focus** à son ouvrant
- « Lancer un cycle » n'apparaît que pour les éléments **éligibles**
- Pas de bouton « Lancer » permanent dans les cartes : il surcharge la lecture
- **La suppression déclenche toujours une confirmation explicite nommant précisément
  l'élément concerné**

### Cas limites
- Deux suppressions simultanées ; suppression d'une spec déjà déplacée
- Suppression d'une spec en cours de cycle (`doing/`) — à interdire ou à confirmer lourdement
- Modification concurrente à une édition hors du cockpit
- Écriture désactivée : les actions mutatrices sont **visiblement inertes**, pas absentes

## Comportement actuel

Aucune de ces actions n'existe. `/api/lancer` ne transporte qu'une clé fermée.

## Contraintes techniques
- ⚠️ **Règle absolue n°4** : jamais de suppression sans **plan de retour arrière écrit**.
  Une spec supprimée est un fichier du dépôt — le retour arrière passe par git, et cela
  doit être **écrit**, pas supposé.
- `ADR-0005` (liste fermée par clé) et `ADR-0019` (table fermée des routes) sont amendés
  au minimum, peut-être révoqués. Transporter un identifiant de spec jusqu'à la commande
  est exactement ce que `ADR-0005` refusait.
- `ADR-0003` : les colonnes viennent de la **configuration**, jamais figées
- Le confinement du chemin (`vcs.chemin_sur()`) s'applique à toute cible
- L'**agent responsable** et la **progression** doivent être **définis** avant d'être
  affichés : un pourcentage inventé est un chiffre non mesuré, que le dépôt s'interdit

## Fichiers potentiellement concernés
- `control-center/backend/server.py` — routes neuves, table `_ROUTES_ECRITURE`
- `control-center/backend/specs.py` — agent responsable, progression
- `control-center/backend/vcs.py` — confinement, retour arrière
- `control-center/web/` — menu, dialogue, confirmation
- `docs/adr/` — au moins un ADR

## Livrables — check-list
- [ ] S1 — **GATE P1** : routes mutatrices et destructives sur des fichiers du dépôt
- [ ] A1 — **plan de retour arrière écrit** pour la suppression (Règle absolue n°4)
- [ ] A2 — verdict ADR sur l'amendement d'`ADR-0005` et `ADR-0019`
- [ ] A3 — **définition** de la progression : quelle grandeur, mesurée comment
- [ ] B1 — lancer un cycle pour une spec désignée, chemin confiné
- [ ] B2 — modifier une spec existante
- [ ] B3 — supprimer, avec confirmation serveur **et** retour arrière
- [ ] B4 — agent responsable et progression exposés par `specs.py`
- [ ] F1 — menu `⋮` accessible : focus, flèches, Début/Fin, Échap, restitution
- [ ] F2 — dialogue de détail
- [ ] F3 — confirmation de suppression **nommant l'élément**
- [ ] F4 — actions inertes et visibles quand l'écriture est désactivée
- [ ] S2 — **GATE P2**
- [ ] D1 — tests, dont **mutation** sur le confinement et sur la garde de confirmation
- [ ] C1 — `docs/API.md`, ADR, `CHANGELOG.md`

## Sécurité & données
- **Authentification : OUI** — trois routes d'écriture de plus
- **Permissions : OUI** — une action destructive
- Données personnelles : **non**
- **Migration destructive : OUI, au sens de la Règle absolue n°4** — plan de retour
  arrière **obligatoire et écrit**
- **Risque identifié** : une route de suppression mal confinée efface un fichier
  quelconque du dépôt. C'est le risque le plus sévère de toute la famille de specs.

## ADR attendu ?
- **Probable** : **oui** · Critères **1**, **2**, **4**
- Sujets : l'ouverture de routes mutatrices et destructives ; la définition de la
  progression d'une spec

## Éléments visibles (pour doc-writer)
- Endpoints neufs → `docs/API.md` · Menu, dialogue, confirmation → `docs/features/page-*.md`
- `CHANGELOG.md` · ADR

## Critères d'acceptation
- [ ] Aucune suppression sans confirmation nommant l'élément
- [ ] Une cible hors de la racine du dépôt est **refusée** — vérifié par test de confinement
- [ ] Le retour arrière d'une suppression est **écrit et exécuté au moins une fois**
- [ ] Sans jeton, les trois actions sont inertes et le disent
- [ ] La progression affichée correspond à une grandeur **définie et mesurée**
- [ ] Le menu est entièrement utilisable au clavier
- [ ] Verdicts GATE P1 et P2 écrits
- [ ] Suite verte, mutation sur le confinement et la confirmation

## Plan de test manuel
1. Lancer un cycle depuis une carte, vérifier que c'est la bonne spec
2. Supprimer une spec, vérifier la confirmation puis le retour arrière
3. Tenter une suppression avec un identifiant forgé pointant hors du dépôt
4. Sans jeton : les trois actions sont inertes
5. Modifier une spec pendant qu'un éditeur externe la modifie aussi
6. Parcourir le menu au clavier seul

## Hors périmètre
- La conversation permanente (`feature-022`) et la rédaction par Claude (`feature-024`)
- Le déplacement d'une spec entre colonnes : c'est le **cycle** qui promeut, pas l'écran
