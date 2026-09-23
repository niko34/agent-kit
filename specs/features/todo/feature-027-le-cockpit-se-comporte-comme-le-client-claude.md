# Le panneau de conversation se comporte comme le client Claude

## Métadonnées

- **ID** : feature-027
- **Slug** : le-cockpit-se-comporte-comme-le-client-claude
- **Type** : feature
- **Statut** : todo
- **Priorité** : **haute** — trois défauts de cette famille ont déjà été trouvés par
  l'humain en se servant du produit, aucun par les agents du cycle
- **Version cible** : [à fixer par l'agent qui reprend cette spec]
- **Dernière mise à jour** : 2026-09-22
- **Spec(s) liée(s)** : `feature-026` (fournit le mécanisme : lecture du transcript,
  frappe dans le pty — cette spec ne le refait pas), `ADR-0039` (la fidélité à la maquette
  prime), `ADR-0042` (parler à une session qu'on ne détient pas)

## Pourquoi cette spec existe — le constat qui l'a déclenchée

Trois défauts trouvés **par l'humain**, en une heure, en se servant du cockpit. Aucun
trouvé par les cinq agents du cycle `feature-026`, qui ont pourtant chacun mesuré,
muté et audité :

| Défaut | Trouvé par | Ce que les agents avaient vérifié |
|---|---|---|
| Le canal parlait à un processus que le cockpit lance, pas à la session réelle | l'humain | que le canal `json-lines` fonctionne |
| L'envoi refusé pendant que Claude travaille, alors que le TUI met en file | l'humain | que l'heuristique est atteignable et meurt par mutation |
| Un état « Occupée » qui n'existe dans aucune référence | l'humain | que chaque couleur a un précédent dans le design system |

**Le point commun est une méthode, pas une inattention** : chaque agent a vérifié que le
mécanisme **fonctionne**, jamais qu'il fait **la bonne chose**. Une garde atteignable,
mutée et verte peut garder le mauvais invariant — et rien dans le cycle ne le détecte,
parce que tout l'outillage mesure la conformité au brief, jamais la conformité à l'usage.

Cette spec est la réponse structurelle : **comparer, élément par élément, le comportement
du cockpit à celui du client Claude que l'humain utilise déjà**, au lieu d'inventer un
comportement et de le garder ensuite avec rigueur.

## Grandeurs mesurées

Toutes relevées le **2026-09-22** sur ce conteneur, `claude` **2.1.278**.

- **La maquette normative ne code qu'UN état de pastille** : `.claude-status` →
  `« ● En ligne »`, **1 occurrence** (l.756). `« Occupée »`, `« Hors ligne »`,
  `« Injoignable »` : **0 occurrence chacun**. Les trois derniers sont des inventions du
  cycle `feature-026`.
- **Le TUI accepte la saisie pendant qu'il travaille** : le dernier message de l'humain,
  envoyé depuis son téléphone pendant un traitement, porte `promptSource: "queued"`.
  Sur 10 000 lignes de transcript, **554** enregistrements `queue-operation`.
- **En `auto mode`, `claude` 2.1.278 approuve automatiquement les commandes shell**
  (`rm -rf` compris) **sans afficher aucun dialogue**. Seul `manual mode` **plus une
  écriture de fichier** en déclenche un (mesuré au prix d'une quinzaine de tentatives).
- **Le transcript porte ce que le cockpit n'affiche pas** : sur 10 000 lignes,
  `thinking` **720**, `tool_use` **985**, `tool_result` **985**. Le client réel, lui,
  **montre** les étapes d'outils.
- **Le pied de page varie et se tronque** : `esc to interrupt` disparaît de l'écran quand
  `/tasks to see subagents` s'y insère, c'est-à-dire **quand des sous-agents tournent**.
- **`Ctrl+U` ne vide qu'une ligne logique** du compositeur (5 frappes nécessaires après un
  collage de 3 lignes).
- **`❯` en colonne 0 préfixe aussi chaque message déjà envoyé** dans le défilement.

## Domaines touchés

- [x] API REST (endpoints, contrats, codes d'erreur)
- [x] Frontend (écrans, composants, appels API)
- [ ] BDD / migrations — **sans objet**
- [ ] Auth / permissions — **sans objet** : aucune surface d'authentification ne change
- [x] Données personnelles → le fil affiché s'élargit potentiellement (étapes d'outils)
- [ ] Intégrations externes
- [ ] Tâches de fond

## Agents requis

- [x] orchestrator
- [x] spec-reader
- [x] architect
- [x] security-reviewer, rôle GATE — **si et seulement si** l'inventaire conclut qu'il faut
      exposer des `tool_use`/`tool_result` (le contenu d'un appel d'outil porte des chemins,
      des extraits de fichiers, parfois des secrets lus) **ou** lever le refus des commandes
      slash. Le GATE tranche **sur l'inventaire**, avant tout code.
- [x] ux-ui-designer — **mandat principal** : c'est une spec de comportement visible
- [x] frontend-developer
- [x] backend-developer — seulement pour ce que l'inventaire exige côté contrat
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Description

Établir, **par mesure**, ce que le client Claude fait et que le cockpit ne fait pas —
puis fermer chaque écart ou le **déclarer**, jamais le laisser implicite.

La spec procède en deux temps, et le premier est un livrable à part entière :

1. **L'inventaire** : une table, mesurée, une ligne par comportement observable du client.
2. **Les écarts** : pour chaque ligne, `conforme` · `à combler` · `écarté avec raison`.
   Un écart `écarté` sans raison écrite est un échec de la spec, pas un choix.

## Contexte

`feature-026` a livré le **mécanisme** : lire le transcript de la session Remote Control,
taper dans son pty. Elle ne dit rien du **comportement** — et c'est précisément là que les
trois défauts se sont logés. Cette spec ne refait pas le mécanisme, elle le confronte à
l'usage réel.

⚠️ **Deux défauts déjà connus ne sont PAS dans ce périmètre** : le `409` sur
« Claude travaille » et l'état « Occupée » se corrigent **dans `feature-026`**, au titre
d'`ADR-0017` — ce sont des défauts de ses propres livrables, et la clore en les laissant
livrerait une protection dont on sait déjà qu'elle est fausse.

## Comportement attendu

**L'inventaire est mesuré, jamais listé de mémoire.** Chaque ligne cite la commande, la
capture ou l'enregistrement de transcript qui l'établit. Une ligne sans preuve n'entre pas
dans la table.

**Périmètre de l'inventaire — les familles à couvrir**, chacune close ou déclarée :

- **Saisie** : pendant un traitement · pendant un dialogue · multi-lignes · collage ·
  brouillon conservé entre deux visites · effacement du champ.
- **Envoi** : mise en file · ordre de traitement · ce que l'utilisateur voit entre l'envoi
  et le traitement.
- **Interruption** : le client a `esc` ; le cockpit n'a rien. Écart à trancher.
- **Affichage** : étapes d'outils · raisonnement · pièces jointes · blocs
  `<system-reminder>` · troncature de l'historique · défilement et ancrage en bas.
- **Commandes** : `/` et `!` — aujourd'hui refusés par `feature-026` pour
  **irréversibilité** (`/exit`, `/clear` ne se rattrapent pas depuis le cockpit). Une
  **liste positive** mesurée commande par commande est la seule levée acceptable.
- **État** : ce que le client montre, et où. ⚠️ Point de départ **imposé** : la maquette
  ne code qu'`« ● En ligne »`.

**Ce que la spec livre pour chaque écart** : soit le comportement aligné, soit une ligne
de déclaration dans `docs/features/page-centre-de-controle.md` disant **ce que le cockpit
ne fait pas et pourquoi** — lisible par l'utilisateur, pas enterrée dans un commentaire.

### Cas limites

- Un comportement du client qui **dépend de la version** : la mesure date et nomme la
  version, elle ne prétend pas à l'intemporel.
- Un comportement **impossible** à reproduire depuis un pty (raccourci clavier capté par
  le terminal, par exemple) : déclaré impossible, avec la mesure qui l'établit.
- Un écart dont la fermeture **coûterait une capacité de sécurité** (les commandes slash) :
  remonte au GATE, jamais tranché par le développeur.

## Comportement actuel

Le cockpit affiche un fil filtré, refuse les commandes slash, ne montre ni étapes d'outils
ni raisonnement, n'a aucun moyen d'interrompre, et — jusqu'aux correctifs en cours dans
`feature-026` — refusait l'envoi pendant un traitement en affichant un état que la
référence ne connaît pas. **Aucun de ces écarts n'est écrit nulle part** : ils se
découvrent en s'en servant.

## Contraintes techniques

⚠️ **Une spec de parité est non bornée par nature.** Elle se borne par **l'inventaire figé
au premier lot** : la table est close avant tout code, et tout comportement découvert
ensuite est une **spec suivante**, pas un ajout en cours de route. Sans cette règle, la
spec ne se termine jamais.

⚠️ **Le client de référence est celui que l'humain utilise** — `claude` **2.1.278** en
Remote Control, pas une documentation, pas un souvenir. Toute mesure se prend sur une
session **jetable**, jamais sur `claude-kit`.

⚠️ **Afficher les étapes d'outils élargit ce qui sort par la route de lecture.** Un
`tool_result` porte des chemins, des extraits de fichiers, parfois des secrets lus. C'est
le déclencheur du GATE, et il est à traiter **sur l'inventaire**, avant la première ligne
de code.

## Fichiers potentiellement concernés

- `control-center/backend/fil.py` — filtre et bornes, si l'inventaire élargit le rendu
- `control-center/backend/session_tmux.py` — saisie, interruption
- `control-center/backend/server.py` — contrat de `/api/conversation`
- `control-center/web/app.js`, `app.css`, `index.html` — affichage et compositeur
- `docs/features/page-centre-de-controle.md` — **les écarts déclarés**
- `control-center/PIEGES.md` — la leçon de méthode (voir « Éléments visibles »)

## Livrables — check-list

- [ ] I1 — **inventaire mesuré** : une ligne par comportement, avec sa **preuve**
      (commande, capture, enregistrement). Aucune ligne sans preuve.
- [ ] I2 — inventaire **figé** : la table est close avant le premier lot de code, et tout
      ajout ultérieur part en spec suivante
- [ ] I3 — verdict par ligne : `conforme` · `à combler` · `écarté avec raison écrite`
- [ ] A1 — les écarts `à combler` côté backend (contrat de `/api/conversation`)
- [ ] B1 — les écarts `à combler` côté écran
- [ ] B2 — **état** : conforme à la maquette (`« ● En ligne »`), plus les cas limites
      qu'elle ne couvre pas, **déclarés comme inventions et tenus au minimum**
- [ ] S1 — GATE sur l'inventaire **si** exposition d'étapes d'outils ou levée des
      commandes slash
- [ ] C1 — `docs/features/page-centre-de-controle.md` : **la liste des écarts déclarés**,
      lisible par l'utilisateur
- [ ] C2 — `control-center/PIEGES.md` : la leçon de méthode (« une garde verte peut garder
      le mauvais invariant »), avec les trois défauts mesurés en preuve
- [ ] D1 — garde : chaque ligne `conforme` de l'inventaire est **vérifiée par exécution**,
      jamais par relecture
- [ ] D2 — garde : chaque ligne `écarté` a une raison écrite **et** une trace visible par
      l'utilisateur ; une disparition silencieuse fait échouer
- [ ] D3 — validation par **mutation** de D1 et D2

## Nouvelles signatures / API

Aucune a priori — l'inventaire peut en imposer (interruption, étapes d'outils). Toute
signature neuve est une conséquence **mesurée**, jamais une anticipation.

## Sécurité & données

- **Authentification touchée** : non.
- **Permissions / rôles touchés** : **conditionnel** — seulement si l'inventaire conclut
  qu'il faut lever le refus des commandes slash. La levée n'est acceptable que par **liste
  positive**, commande par commande, chacune mesurée **à la soumission**.
- **Données personnelles** : **oui, conditionnel** — exposer les `tool_result` élargit ce
  qui sort par la route de lecture (chemins, extraits de fichiers, secrets lus).
- **Migration destructive** : non. **Nouvelle exposition publique** : non.
- **Risque identifié** : l'élargissement du fil est **silencieux** — personne ne remarque
  qu'un `tool_result` porte un secret tant qu'il n'est pas affiché. D'où le GATE **sur
  l'inventaire**, pas sur le diff.

## ADR attendu ?

- **Probable** : **oui, un** — et son sujet est la **méthode**, pas la technique :
  vérifier qu'une garde garde **le bon invariant**, et pas seulement qu'elle est
  atteignable, verte et mutée. Les trois défauts de `feature-026` en sont la preuve
  mesurée.
- **Critère(s) candidat(s)** : **1** (contrainte qui verrouille les cycles suivants),
  **4** (le cockpit se lie au comportement d'une version de `claude`).

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- `GET` / `POST /api/conversation` — contrat possiblement élargi par l'inventaire
### Écrans / flux UI concernés
- Le panneau de conversation, entièrement
### Documentation à produire / mettre à jour
- `docs/features/page-centre-de-controle.md` — **la liste des écarts déclarés**
- `control-center/PIEGES.md` — la leçon de méthode
- `CHANGELOG.md` — tout écart comblé est un changement visible

## Critères d'acceptation

- [ ] L'inventaire existe, **chaque ligne porte sa preuve**, et il est figé avant le code
- [ ] Aucun écart `écarté` sans raison écrite **et** visible par l'utilisateur
- [ ] Les trois défauts qui ont déclenché cette spec sont **couverts par une ligne
      d'inventaire** — sinon la spec n'aurait rien appris de ce qui l'a causée
- [ ] Suite complète verte, root **et** non-root, les deux comptes rendus
- [ ] Chaque garde neuve **vue rouge** puis validée **par mutation**

## Plan de test manuel

1. Depuis le cockpit, écrire pendant que la session travaille → le message part et se met
   en file, comme depuis le téléphone.
2. Comparer, côte à côte, le fil du cockpit et l'écran de la session sur les mêmes dix
   minutes : ce qui manque doit être **déclaré**, pas surprenant.
3. Couper le socket tmux → le cockpit le dit, sans inventer d'état.

## Hors périmètre

- Le **mécanisme** de `feature-026` (lecture du transcript, frappe dans le pty) : livré.
- Les **deux défauts** déjà identifiés (`409` sur « occupée », état « Occupée ») : ils se
  corrigent dans `feature-026`, au titre d'`ADR-0017`.
- L'**authentification** d'un second compte : reste dans le volet écarté de `feature-026`.
