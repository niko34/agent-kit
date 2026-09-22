# Conversation permanente avec Claude dans le cockpit

## Métadonnées
- **ID** : feature-022
- **Slug** : conversation-permanente-avec-claude
- **Type** : feature
- **Statut** : doing — **absorbée dans le cycle `feature-021`** (lot 11), réouverture de périmètre
- **Priorité** : normale
- **Version cible** : N/A
- **Dernière mise à jour** : 2026-09-20
- **Spec(s) liée(s)** : `feature-021` (le cockpit qui l'accueille), **`feature-009`
  (discussion par spec)** — ⚠️ à lire AVANT de commencer : elle pose déjà la question
  décisive, « où vivent les messages », et annonce un ADR pour elle. Ne pas rejouer cet
  arbitrage, s'appuyer dessus ou fusionner les deux specs.

## Grandeurs mesurées
- `routes exposées aujourd'hui` = **10** — GET `/`, `/api/etat`, `/api/spec`, `/api/diff`,
  `/api/flux`, `/api/lancement` + statiques ; POST `/api/lancer`, `/api/interrompre`,
  `/api/spec/brouillon`, `/api/spec/ecrire`
- `routes d'écriture dans la table FERMÉE `_ROUTES_ECRITURE`` = **4**
- `canal d'entrée vers un agent en cours` = **aucun** — `lanceur.py` fait un `Popen`
  **sans stdin réinjectable** (mesuré)
- `nature de `/api/flux`` = **signal pur** : il écrit littéralement `event: maj\ndata: {}`
  et transporte un SIGNAL, jamais l'état
- `nature de `/api/lancement`` = **unidirectionnelle**, sortie brute du lancement courant,
  **404** si aucun lancement

## Domaines touchés
- [x] API REST — **une 5ᵉ route d'écriture dans une table déclarée fermée**
- [x] Frontend
- [ ] BDD / migrations
- [x] Auth / permissions → **`security-reviewer` rôle GATE obligatoire**
- [x] Données personnelles → **GATE obligatoire** : un fil de conversation est du texte
      libre, et il peut finir versionné
- [ ] Intégrations externes
- [ ] Tâches de fond

## Agents requis
- [x] spec-reader · [x] architect · [x] **security-reviewer, rôle GATE (P1 design, P2 diff)**
- [x] ux-ui-designer · [x] backend-developer · [x] frontend-developer
- [x] test-engineer · [x] code-reviewer · [x] doc-writer

## Absorption dans le cycle `feature-021` (2026-09-22)

Cette spec n'est pas traitée seule. L'humain a rouvert le périmètre de
`feature-021` le 2026-09-22 : « Rien ne justifie de livrer un livrable qui
couvre une petite partie de ce que j'ai demandé. Fais ce qu'il faut pour
mettre en œuvre la maquette. » La maquette Material 3 **entière** revient au
périmètre du cycle, y compris les éléments que le découpage du 2026-09-20
avait différés vers cette spec.

⚠️ Le motif est **distinct** de celui de `bug-017` : ce n'est **pas**
`ADR-0017` (une spec qui désarme ou rend inatteignable une garde livrée par le
cycle en cours). Aucune garde livrée par `feature-021` n'est désarmée par
l'absence de cette spec. Le motif est une réouverture de périmètre décidée
par l'humain parce que le livrable initial ne couvrait qu'une fraction de sa
demande. Les deux précédents ne se confondent pas.

Conséquence de forme : le cycle porte désormais **cinq specs dans `doing/`**
(`feature-021`, `bug-017`, `feature-022`, `feature-023`, `feature-025`), avec
une **seule** phase de test, de revue et de documentation. **Le journal de
bord de référence est celui de `feature-021`** — c'est là que les verdicts
GATE (P1/P2) et les livrables de cette spec sont consignés au fil des étapes,
pas ici. Cette spec reçoit uniquement, à la clôture, ses notes
d'implémentation avant son déplacement vers `done/`.

Cette spec porte le **lot 11** du plan du cycle 2.

### Éléments du prototype qui lui reviennent

Dérivés de `control-center/web/test_conformite_partition_donnees.js`
(table F0, entrées de lot `11`) — **15 éléments uniques** (4 identifiants +
13 classes, 2 noms partagés entre les deux ensembles : `claude-title`,
`composer`) :

- **Identifiants (4)** : `claude-live-message`, `claude-title`, `composer`,
  `prompt`
- **Classes (13)** : `bubble`, `claude-ident`, `claude-mark`, `claude-panel`,
  `claude-status`, `claude-title`, `composer`, `conversation`, `icon-button`,
  `message`, `message-avatar`, `question`, `send-button`

⚠️ `icon-button` est une classe **partagée** entre trois lots (7-8, 9-10 et
11 — voir sa note dans la table F0) : son instance propre à cette spec est
le bouton « Options de la conversation » (prototype l.757, dans
`.claude-panel`, sans id ni classe distinctive au-delà d'`icon-button`).
Rectification du lot 6 (réouverture de périmètre) : la version précédente
de cette liste, écrite quand la table classait encore `icon-button` en bloc
sous `feature-025` par convention (aucune de ses cinq instances n'était
alors adoptée), omettait cette classe. Corrigé, pas reporté.

⚠️ **Collision d'identifiant à trancher, pas à subir** (L11 du plan) :
`#prompt` existe **déjà** dans `control-center/web/index.html:225`
(`<textarea id="prompt" rows="4" …>`, la zone de rédaction de spec de
`feature-008`), et la table F0 assigne ce même nom au composer de cette spec.
Deux rôles pour un identifiant — vérifié dans le dépôt le 2026-09-22.



Le cockpit accueille, à droite du cycle, un **panneau de conversation permanent** avec
l'agent principal. Il montre les deux ou trois messages récents, une question bloquante
épinglée, et une zone de saisie « Répondre à Claude… ». Répartition indicative 72 % pour
le cycle, 28 % pour la conversation ; même hauteur, s'arrêtant avant le backlog.

**Seul l'agent principal converse.** Les sous-agents n'ont pas de conversation propre.

La piste d'une *side sheet* à la demande a été **testée puis explicitement rejetée** par
l'auteur de la maquette : elle masquait une partie du cockpit et rendait la présence de
Claude trop intermittente. Ne pas la réintroduire.

## Contexte

Le centre de contrôle sait **lancer** un agent et **regarder** sa sortie. Il ne sait pas
lui **parler**. C'est la différence entre un moniteur et un poste de pilotage, et c'est
l'ajout le plus lourd de la refonte Material 3.

## Comportement attendu
- Le panneau est **toujours visible**, jamais derrière un clic
- Il montre les derniers messages, l'historique défile à l'intérieur du panneau
- Une **question bloquante** de Claude est épinglée et visuellement distincte
- La saisie reprend le modèle ChatGPT : une zone de texte et **un seul** bouton circulaire
  à flèche. Aucun bouton « Message », « Instruction » ou « Envoyer »

### Cas limites
- Aucun agent en cours : la saisie doit dire ce qu'elle fera du texte, ou être inerte
- Écriture désactivée (pas de jeton) : saisie visiblement inerte, jamais absente
- Serveur injoignable : le panneau dit qu'il ne sait plus, il ne fige pas un fil périmé
- Message très long, caractères de contrôle, contenu ressemblant à une commande

## Comportement actuel

Rien. Aucune route, aucun stockage, aucune notion de message ou de question bloquante.

## Contraintes techniques
- ⚠️ **Il n'existe aucun canal d'entrée.** `lanceur.py` lance un `Popen` sans stdin
  réinjectable. Faire parler l'utilisateur à un agent **en cours d'exécution** suppose de
  créer ce canal — ce n'est pas un ajout d'interface, c'est un mécanisme neuf.
- Une route qui **injecte du texte dans le processus d'un agent** est une surface
  d'injection de commande. Elle doit passer par la table fermée `_ROUTES_ECRITURE`
  (`ADR-0019`), donc par un ADR qui l'amende.
- Où vivent les messages : **trancher avec `feature-009`**, qui a déjà posé la question.
  Le dépôt l'a tranchée deux fois en sens opposés (`ADR-0007` pour le journal,
  `.claude/memory/` pour la mémoire).

## Fichiers potentiellement concernés
- `control-center/backend/server.py` — route d'écriture, table `_ROUTES_ECRITURE`
- `control-center/backend/lanceur.py` — canal d'entrée vers le processus
- `control-center/web/` — le panneau
- `docs/adr/` — au moins un ADR

## Livrables — check-list
- [ ] S1 — **GATE P1** sur le design : verdict sur l'injection de texte dans un agent en cours
- [ ] A1 — arbitrage du lieu de stockage des messages, **avec `feature-009`**
- [ ] A2 — verdict ADR sur l'amendement d'`ADR-0019` (table des routes)
- [ ] B1 — canal d'entrée vers le processus lancé
- [ ] B2 — route d'écriture, bornée, typée, avec ses codes d'erreur
- [ ] B3 — lecture du fil
- [ ] F1 — panneau permanent, 72/28, historique défilant
- [ ] F2 — question bloquante épinglée
- [ ] F3 — saisie à bouton unique, cas limites traités
- [ ] S2 — **GATE P2** sur le diff réel
- [ ] D1 — tests, dont **mutation** sur les gardes de la route neuve
- [ ] C1 — `docs/API.md`, ADR, `CHANGELOG.md`

## Sécurité & données
- Authentification touchée : **oui** — une route d'écriture de plus
- Données personnelles : **oui** — texte libre, potentiellement versionné
- Nouvelle exposition : **non**
- **Risque identifié** : *injection de commande*. Le texte saisi atteint l'entrée standard
  d'un processus en cours. Tout ce qui ressemble à une instruction pour l'agent **est** une
  instruction pour l'agent. C'est le risque central de cette spec.

## ADR attendu ?
- **Probable** : **oui** · Critères **1**, **2**, **3**, **4**
- Sujets : l'ouverture d'un canal d'entrée vers un agent en cours (contre `ADR-0019`) ;
  le lieu de stockage des messages (avec `feature-009`)

## Éléments visibles (pour doc-writer)
- Endpoints : **au moins un POST neuf** → `docs/API.md`
- Écrans : le panneau de conversation → `docs/features/page-*.md`
- `CHANGELOG.md` : changement visible majeur

## Critères d'acceptation
- [ ] Un message envoyé depuis le navigateur atteint l'agent en cours et sa réponse revient
- [ ] Sans jeton, aucune écriture n'est possible et la saisie le dit
- [ ] Une question bloquante est visible sans défilement
- [ ] Verdict GATE P1 **et** P2 écrits dans la spec
- [ ] Suite verte, lint propre, tests neufs validés par mutation

## Plan de test manuel
1. Lancer un agent, lui écrire, vérifier qu'il reçoit
2. Sans jeton : la saisie est inerte, et le dit
3. Couper le serveur en cours de fil
4. Envoyer un texte qui ressemble à une instruction système — vérifier ce qui en est fait
5. Envoyer 100 Ko de texte

## Hors périmètre
- La conversation avec un **sous-agent** : explicitement exclue par la maquette
- La rédaction de spec par Claude (`feature-024`)
