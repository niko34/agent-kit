## Métadonnées
- **ID** : feature-016
- **Slug** : liste-des-cycles-en-accordeon
- **Type** : feature
- **Statut** : todo
- **Priorité** : haute
- **Version cible** : 0.9.0
- **Dernière mise à jour** : 2026-09-15
- **Spec(s) liée(s)** : dépend de feature-015 ; feature-017 vient s'insérer dedans

## Domaines touchés
- [x] Frontend (écrans, composants, appels API)

## Agents requis
- [x] spec-reader
- [x] architect
- [x] ux-ui-designer — conformité au design system, §6
- [x] frontend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Description

Remplacer l'affichage actuel des workflows observés par une **liste de cycles en
accordéon** : un seul cycle déplié à la fois, le plus récent ouvert par défaut.

## Contexte

L'affichage actuel des « workflows observés » a été jugé incompréhensible à
l'usage : plusieurs cycles s'empilent, chacun avec son enchaînement d'agents, et
rien ne dit lequel regarder. Le retour utilisateur est direct — « c'est assez
incompréhensible comme représentation ».

Le design system (§6) fixe la réponse : **un seul cycle visible à la fois**.
Cette spec livre la structure — liste, dépliement, propriétés, table des agents.
Le diagramme visuel qui prendra place dans le détail fait l'objet de
feature-017 ; d'ici là le détail est déjà utile sans lui.

## Comportement attendu

1. Une **liste** des cycles, le plus récent en tête. Chaque ligne porte : son
   état, le nom de la spec, le nombre d'agents, la durée totale, l'ancienneté.
2. Le **dernier cycle est déplié par défaut**.
3. Déplier un autre cycle **referme le précédent**. Jamais deux détails ouverts.
4. Le détail contient :
   - les **propriétés** du cycle : statut, durée, appels d'outils, fichiers
     écrits, rebouclages, agents simultanés ;
   - la **table des agents** : agent, début, durée, outils, fichiers, état ;
     une reprise est signalée sur la ligne concernée.
5. L'identité de couleur de chaque agent (feature-015) est utilisée dans la
   table et dans les pastilles d'état.

### Cas limites

- **Aucun cycle** : état vide explicite, qui dit quoi faire, pas une liste vide.
- **Un cycle sans agent typé** : la ligne existe et le détail le dit, il ne
  disparaît pas silencieusement.
- **Cycle en cours** : l'état se distingue d'un cycle terminé, et le détail se
  rafraîchit sans refermer l'accordéon ni perdre la position de lecture.
- **Agent sans clôture** (état livré par bug-013) : affiché comme tel, ni
  « en cours » ni « terminé ».
- **Événements hors session** : ne créent pas de cycle fantôme.

## Comportement actuel

Les workflows observés s'affichent tous ensemble, sans hiérarchie ni sélection.
Le maillon, le liseré de reprise et le bandeau de rebouclage existent déjà mais
sont noyés.

## Contraintes techniques

- Les données proviennent de la reconstruction existante
  (`control-center/backend/events.py`, fonction `reconstruire`) — **ne pas la
  réécrire** ; si elle ne fournit pas une donnée nécessaire, l'ajouter de façon
  additive, comme l'a fait bug-013 pour `etat`.
- Aucune route d'écriture n'est ajoutée : cette spec est en **lecture seule**.
- Le dépliement est une préférence d'affichage locale, pas un état serveur.
- Accessibilité : l'accordéon est navigable au clavier, chaque en-tête est un
  bouton portant `aria-expanded`, et le détail est associé à son en-tête.

## Fichiers potentiellement concernés

- `control-center/web/app.js` — rendu de la liste, dépliement, rafraîchissement
- `control-center/web/app.css` — la liste, le détail, la table
- `control-center/web/index.html` — le conteneur
- `control-center/backend/events.py` — seulement si une donnée manque
- `control-center/web/test_app_accordeon.js` + `.py`

## Livrables — check-list
- [ ] A1 — liste des cycles, plus récent en tête, dernier déplié
- [ ] B1 — dépliement exclusif, au clic et au clavier
- [ ] C1 — bloc de propriétés du cycle
- [ ] D1 — table des agents avec identité de couleur et reprises

## ADR attendu ?
- **Probable** : non
- **Critère(s) candidat(s)** : aucun
- **Sujet pressenti** : aucun — la décision « un seul cycle à la fois » est déjà
  consignée dans `docs/DESIGN-SYSTEM.md` §6

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- aucun

### Écrans / flux UI concernés
- Remplacement de la section « workflows observés » par la liste des cycles

### Schéma BDD / migrations
- aucun

### Documentation à produire / mettre à jour
#### Docs vivantes
- `docs/features/page-centre-de-controle.md` — la liste et son dépliement

#### Docs transverses
- `CHANGELOG.md` — entrée 0.9.0

## Critères d'acceptation
- [ ] À l'ouverture, exactement un cycle est déplié, et c'est le plus récent
- [ ] Déplier un autre cycle referme le précédent — jamais deux détails ouverts
      simultanément, vérifié par un test
- [ ] Sans aucun cycle, un état vide explicite s'affiche
- [ ] Un agent sans clôture s'affiche dans son propre état, distinct de
      « en cours » et de « terminé »
- [ ] Un rafraîchissement pendant qu'un cycle est déplié ne le referme pas
- [ ] Les totaux affichés dans les propriétés égalent la somme des lignes de la
      table — vérifié par un test, pas par relecture
- [ ] Navigation clavier complète : atteindre, déplier, replier, parcourir
- [ ] Suite de tests complète verte, zéro régression
- [ ] Lint propre, pas de warning nouveau

## Plan de test manuel
1. Ouvrir le centre de contrôle : le cycle le plus récent est déplié.
2. Déplier un cycle plus ancien : le premier se referme.
3. Lancer un agent pendant qu'un cycle est déplié : le détail se met à jour sans
   se refermer ni sauter.
4. Vider le journal d'événements (sur un clone jetable) : l'état vide apparaît.
5. Tuer un agent en cours : sa ligne passe à l'état « sans clôture », pas à
   « terminé ».
6. Parcourir toute la liste au clavier seul.

## Notes pour agent

**Toute expérience se fait sur un clone jetable**, jamais dans `/root/agent-kit`.
Cloner par `cp -a` — pas `git clone`, le travail n'est pas commité — et cloner
`control-center/` **et** `.claude/agents/` : la racine est dérivée de
l'emplacement de `server.py`, et un clone partiel écrit dans le vrai journal.

Le serveur de l'utilisateur tourne sur le **port 8788** : ne pas l'occuper, ne
pas le tuer. Tout arrêt de processus vise un PID capturé, jamais un motif.

Le journal réel `control-center/var/agent-events.jsonl` est en **lecture seule**
pour les mesures, et il **grossit pendant qu'on le mesure** : travailler sur un
instantané figé, sinon deux comptages successifs se contredisent sans raison.
