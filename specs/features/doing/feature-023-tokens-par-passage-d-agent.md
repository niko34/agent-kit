# Tokens consommés par passage d'agent

## Métadonnées
- **ID** : feature-023
- **Slug** : tokens-par-passage-d-agent
- **Type** : feature
- **Statut** : doing — **absorbée dans le cycle `feature-021`** (lot 12), réouverture de périmètre
- **Priorité** : normale
- **Version cible** : N/A
- **Dernière mise à jour** : 2026-09-20
- **Spec(s) liée(s)** : `feature-021` (le disque qui affiche le chiffre), `feature-001`
  (observabilité des workflows), `bug-012` (confinement et lecture)

## Grandeurs mesurées

Mesurées le 2026-09-20.

- `tokens dans le journal d'événements` = **0** sur 14 372 événements
- `champs retenus par le hook` = **8**, tous de type `str` — un objet `usage` imbriqué
  serait **jeté silencieusement**
- `hooks exposant les tokens` = **aucun** — vérifié dans la documentation ; la demande
  de fonctionnalité correspondante est **fermée en « not planned »**
- `transcripts par sous-agent` = **225** sous `~/.claude/projects/<projet>/<session>/subagents/agent-<id>.jsonl`
- `appariement `agent_id` ↔ nom de fichier` = **225 / 225**, exact
- `passages `SubagentStop` distincts` = **3 305**
- `passages portant un `agent_type` — ceux que le diagramme dessine` = **223**
- **`couverture des passages dessinés` = 223 / 223 = 100 %**
- `champs d'usage` = `input_tokens`, `output_tokens`, `cache_creation_input_tokens`,
  `cache_read_input_tokens`
- `input+output par passage` = min **1 070**, médiane **27 660**, max **219 359**, écart **205×**
- `cache_read rapporté à input+output` = **241 ×**
- `poids total des transcripts` = **213 Mo**, mode `0600`

## Domaines touchés
- [x] API REST — un champ neuf dans `/api/etat`
- [x] Frontend — le chiffre au centre du disque
- [ ] BDD / migrations
- [ ] Auth / permissions
- [x] Données personnelles → **`security-reviewer` rôle GATE obligatoire**
- [ ] Intégrations externes
- [ ] Tâches de fond

## Agents requis
- [x] spec-reader · [x] architect · [x] **security-reviewer, rôle GATE (P1, P2)**
- [ ] ux-ui-designer — le rendu est déjà spécifié par `feature-021`
- [x] backend-developer · [x] frontend-developer
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

Cette spec porte le **lot 12** du plan du cycle 2.

### Éléments du prototype qui lui reviennent

Dérivés de `control-center/web/test_conformite_partition_donnees.js`
(table F0, entrées de lot `12`) — **3 éléments uniques**
(2 identifiants + 1 classe, sans recouvrement de nom) :

- **Identifiants (2)** : `selected-tokens`, `summary-tokens`
- **Classe (1)** : `token-value`

`token-value` est le chiffre au centre du disque (M6 du plan) ; `selected-tokens`
et `summary-tokens` sont les reprises du même chiffre dans la bottom sheet de
détail et dans la bande de résumé.



Afficher, au centre de chaque disque du graphe d'agents, le nombre de tokens consommés
par ce passage : **`input_tokens + output_tokens`**.

## Contexte

Une première analyse avait conclu que cette donnée était **impossible** à obtenir. Cette
conclusion était **fausse** : la recherche n'avait pas regardé le sous-répertoire
`subagents/`. La donnée existe, elle couvre **100 %** des passages dessinés, et
l'appariement avec le journal d'événements est exact.

## Comportement attendu
- Le centre du disque affiche `input + output`, abrégé (« 27,7k »)
- La bottom sheet de détail **dit ce que le chiffre compte** — sinon l'écran affiche un
  nombre que personne ne sait interpréter, ce que le dépôt s'interdit
- ⚠️ **L'anneau n'en dépend PAS** : décision du 2026-09-20, il signale l'activité et
  n'encode aucune progression chiffrée. Si la lecture des transcripts est refusée ou
  indisponible, **seul le chiffre se dégrade**, le diagramme reste entier

### Pourquoi `input + output` et pas un total
Le chiffre **discrimine** (205× d'écart, quartiles 15 805 / 27 660 / 44 203). Inclure le
cache le détruirait : `cache_read` pèse **241×** l'ensemble et mesurerait la longueur de
la conversation, pas le travail. ⚠️ Réserve à écrire dans l'interface : ce chiffre mesure
le **travail produit**, pas le **coût**.

### Cas limites
- Transcript absent (passage sans `agent_type`) : pas de chiffre, jamais un zéro inventé
- Transcript illisible, tronqué, ou JSON invalide sur une ligne
- Transcript de 37 Mo : lecture **en flux**, jamais en mémoire
- Le journal grandit pendant la lecture (`PIEGES §4`)

## Comportement actuel

Aucun compte de jetons nulle part. `DESIGN-SYSTEM.md` §5 affirme même qu'« une maquette
qui affiche un nombre de jetons **invente une donnée** » et son §9 l'interdit —
**ces deux règles deviennent fausses** et doivent être amendées par ce cycle.

## Contraintes techniques
- ⚠️ **Les transcripts vivent HORS de la racine du projet**, sous `/root/.claude/`. Les
  lire est un **franchissement de la frontière de confinement** que le module s'impose.
- Un transcript de sous-agent contient **l'intégralité de sa conversation** : secrets
  collés, chemins privés, données personnelles. Seuls des **compteurs** doivent en sortir
  — jamais un extrait de texte, jamais un chemin, jamais un message.
- Lecture **en flux**, bornée ; 213 Mo au total, 37 Mo pour le plus gros fichier.
- Aucun hook n'expose les tokens : inutile de modifier `record-event.py` pour les capter.

## Fichiers potentiellement concernés
- `control-center/backend/events.py` ou un module neuf — lecture et agrégation
- `control-center/backend/server.py` — champ neuf dans `/api/etat`
- `control-center/web/` — le chiffre et la bottom sheet
- `docs/DESIGN-SYSTEM.md` §5 et §9 — **à corriger, devenus faux**

## Livrables — check-list
- [x] S1 — **GATE P1** : verdict sur la lecture hors racine de fichiers contenant des
      conversations entières. Conditions numérotées et **vérifiables sur un diff**
      (**GO sous 7 conditions**, `S5.1`-`S5.7` ; le GATE a lui-même corrigé son
      propre compte de clés non entières de `usage`, de 2 à 7, en le remesurant)
- [x] A1 — verdict ADR sur le franchissement du confinement en lecture
      (`ADR-0041`, modèle de menace **distinct** des routes d'écriture — ne
      pas fusionner avec `ADR-0040`)
- [x] B1 — module de lecture en flux, borné, tolérant aux lignes invalides
      (`control-center/backend/transcripts.py`, `_lire_fichier` — budget
      d'octets et de secondes par instantané, ligne trop longue ignorée
      plutôt que chargée entière)
- [x] B2 — agrégation par `agent_id`, **compteurs seulement** (filtre
      **positif et typé**, `_CLES_USAGE = ("input_tokens", "output_tokens")`,
      testé récursivement sur l'ensemble de l'objet retourné)
- [x] B3 — champ exposé dans `/api/etat` (`tokens_par_passage`, additif —
      calculé sur les **seuls** `agent_id` des passages réellement affichés,
      jamais un parcours spontané de `subagents/`)
- [x] F1 — chiffre au centre du disque, abrégé (`formatTokensCompact`,
      « 27,7k »)
- [x] F2 — bottom sheet qui **dit ce que le chiffre compte** (`selected-tokens`,
      `formatTokensLong`, réserve écrite : mesure le travail, pas le coût)
- [x] F3 — dégradation propre quand le transcript manque (`.token-value`
      absent du DOM, jamais un `0` ; état **partiel** distinct — glyphe « … »
      — quand le budget de lecture a coupé avant terme, jamais confondu avec
      l'absence)
- [x] S2 — **GATE P2** — voir `feature-021`, journal cycle 2, Lot 12 : la
      campagne de mutation du lot 6 (test-engineer) a trouvé et fait réparer
      un trou de couverture préexistant (le jeton du lot 11 manquait à
      `LOTS_DEJA_LIVRES`, 17 éléments non vérifiés par aucune garde)
- [x] D1 — tests, dont **mutation** sur la garde de confinement et sur la borne de lecture
      (`test_transcripts.py`, `test_server_feature023.py`, `test_config.py` ;
      piège trouvé en exécutant et consigné `PIEGES §59` : un préfixe devant
      un identifiant annule le témoin de traversée classique)
- [x] C1 — `docs/API.md`, `DESIGN-SYSTEM.md` §5 et §9 corrigés, ADR, `CHANGELOG.md`

## Sécurité & données
- Authentification : **non** · Permissions : **non**
- **Données personnelles : OUI** — finalité déclarée : *compter des tokens par passage
  d'agent, et rien d'autre*. Aucun contenu de transcript ne doit sortir du module.
- Migration destructive : **non** · Exposition publique : **non**
- **Risque identifié** : une lecture hors confinement qui, mal bornée ou mal filtrée,
  ferait fuiter du texte de conversation vers l'interface ou vers un journal.

## ADR attendu ?
- **Probable** : **oui** · Critères **1**, **2**
- Sujet : le centre de contrôle lit, en dehors de sa racine, des fichiers qu'il n'écrit
  pas, et n'en extrait que des compteurs

## Éléments visibles (pour doc-writer)
- Endpoints : champ neuf dans `/api/etat` → `docs/API.md`
- Écrans : centre du disque, bottom sheet
- ⚠️ `docs/DESIGN-SYSTEM.md` §5 et §9 : **corriger deux règles devenues fausses**

## Critères d'acceptation
- [x] Les 223 passages dessinés affichent un chiffre ; aucun ne montre un zéro inventé
      — nuance mesurée : un passage sans transcript lisible **n'affiche aucun
      nœud**, plutôt qu'un chiffre à zéro ; le compte de 223/223 n'a pas été
      remesuré dans ce lot (dérivé de la mesure du 2026-09-20)
- [x] Aucun extrait de conversation ne sort du module — vérifié par test
      (test récursif sur tout l'objet retourné, témoin planté dans un
      message et dans `usage.service_tier`)
- [x] Un transcript de 37 Mo ne charge pas 37 Mo en mémoire (lecture en
      flux, `readline` bornée par ligne, budget d'octets cumulé)
- [x] Une ligne JSON invalide n'interrompt pas la lecture
- [x] Verdicts GATE P1 et P2 écrits (voir `feature-021`, journal cycle 2,
      Étape C et Lot 12)
- [x] Suite verte, mutation sur la garde de confinement

## Plan de test manuel
1. Ouvrir le cockpit, comparer un chiffre affiché à un calcul fait à la main sur le transcript
2. Renommer un transcript : le disque se dégrade sans casser l'anneau
3. Corrompre une ligne : la lecture continue
4. Vérifier qu'aucun chemin ni texte de transcript n'apparaît dans `/api/etat`

## Hors périmètre
- Le **coût** en monnaie : `input + output` ne le mesure pas
- Le cache : mesuré, écarté, motivé
- Tout affichage de contenu de transcript

## Notes d'implémentation (lot 12 de `feature-021`, cycle 2)

Livré le 2026-09-22, après `feature-022` (lot 11) et `feature-025` (lots
9-10). `control-center/backend/transcripts.py` porte le mécanisme complet ;
`server.py` construit `agent_ids_affiches` à partir des **seuls** passages
que `/api/etat` envoie déjà au frontend (jamais un parcours autonome de
`subagents/`), ce qui rend « compteurs seulement » vérifiable : un
`agent_id` jamais demandé n'est jamais ouvert.

**Le chiffre porte désormais trois états, pas deux** — connu, absent,
**partiel** (le troisième, introduit par ce lot : le budget de lecture a
coupé avant terme, dit explicitement, jamais confondu avec l'absence). Un
zéro n'est affiché dans aucun des trois cas.

L'anneau reste piloté par l'état seul, comme prévu (`ADR-0031 §5`) : une
garde interdit désormais explicitement de le recoupler aux tokens, vérifiée
par deux mutations qui tentent ce recouplage et meurent.

**Le signalement honnête du lot a trouvé plus que le lot lui-même** : en
ajoutant le jeton de ce lot à `LOTS_DEJA_LIVRES` (le registre de partition
du cycle), les gardes ont rougi sur un trou préexistant — dix-sept éléments
du lot 11 (conversation) n'étaient vérifiés par aucune garde. Treize
étaient déjà couverts ailleurs, trois posés à l'exécution et couverts par
le volet runtime, un ne l'était par rien ; réparé dans ce même lot, avec une
règle neuve (`F3b` exige que toute exemption déclarée soit couverte par un
scénario réel, sous peine de faire échouer la garde en le nommant).

`docs/DESIGN-SYSTEM.md` §5 et §9 sont corrigés : la règle « aucun chiffre
qu'on ne sait pas mesurer » est conservée, son fondement factuel — « les
jetons ne sont mesurables nulle part » — était faux et est rectifié depuis
le 2026-09-20 ; ce lot en tire la conséquence dans le rendu.

Détail complet (les sept conditions du GATE, le piège de confinement trouvé
en exécutant, les alternatives écartées) :
[ADR-0041](../../../docs/adr/0041-lecture-hors-racine-compteurs-seulement.md).
