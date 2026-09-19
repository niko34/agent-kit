## Métadonnées
- **ID** : feature-016
- **Slug** : liste-des-cycles-en-accordeon
- **Type** : feature
- **Statut** : done
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
   état, sa désignation, le nombre d'agents, la durée totale, l'ancienneté.
   **Amendement (2026-09-15)** : la ligne ne porte pas « le nom de la spec »
   — cette donnée n'existe dans aucun des vingt champs produits par
   `reconstruire()`, et la corrélation heuristique envisagée s'est révélée
   non invalidable (2 cas sur 14 mesurés désignent un candidat unique). La
   désignation retenue est l'**heure de départ** et l'**agent ouvrant**
   (ou la mention du bornage en son absence) — voir
   [ADR-0023](../../../docs/adr/0023-un-cycle-observe-ne-porte-pas-de-nom.md).
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
- **Probable** : non, à l'écriture de la spec
- **Statué par l'architecte, en cours d'implémentation** : oui — **critères 1
  et 3** (contrainte structurante sur `feature-017` et les écrans futurs ;
  alternative crédible étudiée et écartée). La décision « un seul cycle à la
  fois » restait bien consignée dans `docs/DESIGN-SYSTEM.md` §6, mais un
  second sujet est apparu en cours de travail : la spec promettait « le nom
  de la spec » sur chaque ligne, une donnée qui n'existe nulle part. Voir
  [ADR-0023](../../../docs/adr/0023-un-cycle-observe-ne-porte-pas-de-nom.md).

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- aucun

### Écrans / flux UI concernés
- Remplacement de la section « workflows observés » par la liste des cycles

### Schéma BDD / migrations
- aucun

### Documentation à produire / mettre à jour
#### Docs vivantes
- `docs/features/page-centre-de-controle.md` — la liste et son dépliement, et
  ce que l'écran n'affiche pas (nom de spec, nombre de cycles)

#### Docs transverses
- `CHANGELOG.md` — entrée 0.9.0
- `docs/adr/0023-un-cycle-observe-ne-porte-pas-de-nom.md` — ADR créé en cours
  de cycle (critères 1 et 3), amendant le point A1 ci-dessus

## Critères d'acceptation
- [x] À l'ouverture, exactement un cycle est déplié, et c'est le plus récent
- [x] Déplier un autre cycle referme le précédent — jamais deux détails ouverts
      simultanément, vérifié par un test
- [x] Sans aucun cycle, un état vide explicite s'affiche
- [x] Un agent sans clôture s'affiche dans son propre état, distinct de
      « en cours » et de « terminé »
- [x] Un rafraîchissement pendant qu'un cycle est déplié ne le referme pas
- [x] Les totaux affichés dans les propriétés égalent la somme des lignes de la
      table — vérifié par un test, pas par relecture
- [x] Navigation clavier complète : atteindre, déplier, replier, parcourir
- [x] Suite de tests complète verte, zéro régression
- [x] Lint propre, pas de warning nouveau

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

---

# Clôture — 2026-09-15

## La spec promettait une donnée inexistante

Elle annonçait une ligne portant **« le nom de la spec »**. Mesuré : les vingt
clés d'un cycle reconstruit et les dix-sept clés du journal n'en portent
**aucune**. La corrélation avec les specs du dépôt ne désigne un candidat unique
que dans **2 cas sur 14** — et surtout, son taux d'erreur **n'est pas mesurable**,
faute de vérité terrain dans le journal.

C'est la **deuxième fois de la journée** qu'une spec issue d'une maquette promet
une donnée que rien ne produit : les comptes de jetons de `feature-017`, puis ce
nom. Une maquette montre ce qu'on veut voir, pas ce qu'on peut mesurer.

⇒ **ADR-0023** : un cycle est désigné par son heure de départ et son agent
ouvrant. La spec est amendée.

## Trois défauts trouvés qu'aucun critère ne demandait

1. **Un critère livrable mort.** `fin_observee_absente` vaut vrai pour
   **85,7 %** des cycles — `SessionEnd` ne se déclenche jamais. Lire l'état du
   cycle là-dessus aurait affiché « en cours » partout.
2. **Un contour sous le plancher, absorbé** (ADR-0017). L'état « sans clôture »
   était porté par un contour à **1,20:1**, livré par `bug-013`. Il ne devenait
   bloquant que parce que ce cycle fait du contour le **porteur exclusif** de
   l'état. Jeton neuf, achromatique, mesuré à 3,92:1.
3. **Une chaîne de justification circulaire**, trouvée en revue. Le contour de
   « terminé » à 1,20:1 n'était acceptable **que parce que le libellé est
   toujours affiché** — or ce libellé était peint à **3,90:1**, sous le seuil.
   *Le contour cédait au libellé, le libellé cédait au jeton.* Chaque règle était
   formellement respectée ; la chaîne, non. Corrigé : 13,29:1.

## Une ambiguïté de vocabulaire levée

Le trait en tirets signifiait **à la fois un état et un rôle**. La garde « l'état
se lit par la forme » était donc déjà vide de sens avant ce cycle. Désormais :
pointillé = état, tirets pleins = rôle, tirets en liseré gauche = rebouclage.
Consigné au §8 pour ne pas revenir.

⚠️ La correction a dû être faite **deux fois** : levée d'abord sur les nouveaux
badges, elle laissait la chaîne inchangée ; puis l'inverse. Une correction
s'arrête au premier endroit signalé, pas au dernier endroit où la règle
s'applique.

## Deux ajouts backend, strictement additifs

- `outils` sur les passages de sous-agent — il n'existait que sur l'agent
  principal, ce qui rendait une colonne entière invendable. **4 921 appels**
  enfin attribués.
- `evenements_hors_session`, calculé depuis toujours et **jeté** avant d'être
  servi.

Vérifié par exécution sur un instantané figé : sortie de `reconstruire`
identique hors la clé neuve.

## Comptes

| | entrée | sortie |
|---|---|---|
| Centre de contrôle | 15 suites, 827 cas | **16 suites, 959 cas** |
| Kit | 111 tests | 111 tests |
| Mutations | — | **10 tentées, 10 tuées** |

Dont un mutant qui avait **survécu** à la première passe : la garde anti-repli
total de l'accordéon était juste, écrite, commentée — et couverte par rien.

## Verdicts

- `spec-reader` : spec promouvable, sous-spécifiée sur un point, signalé
- `architect` : quatre arbitrages établis par exécution ; a **corrigé les
  chiffres du brief**, qui mélangeaient deux configurations
- `ux-ui-designer` : conforme sous réserve — une seule couleur vive, réservée à
  « en cours »
- `test-engineer` : vert, puis **un mutant survivant** rattrapé après revue
- `code-reviewer` : Request changes → **corrigé** → gardes exécutées et
  atteignables
- `security-reviewer` rôle GATE : **non requis**, lecture seule, confirmé

## Reste ouvert

- `bug-016` — les durées et compteurs secondaires de la table héritent d'un
  jeton à 3,55:1. **À traiter juste après ce cycle.**
- `feature-017` — le diagramme de déroulé s'insère dans le détail.
- **Le langage visuel n'a jamais été spécifié.** Les trois specs couvrent les
  jetons, le comportement et le diagramme ; la structure de page, la typographie
  et les espacements des maquettes n'ont fait l'objet d'aucune spec. C'est un
  manque du découpage, pas de l'exécution.
- ⚠️ **Le serveur doit être redémarré** : il sert l'ancien code Python avec la
  nouvelle interface, donc « indéterminé » partout et des compteurs à zéro.
  L'interface tolère l'absence — c'est la règle qui joue, pas un défaut.

## Statut final
✅ Done — 2026-09-15 — commit à renseigner à la validation
