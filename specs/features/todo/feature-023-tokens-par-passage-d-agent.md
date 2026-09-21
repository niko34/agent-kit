# Tokens consommés par passage d'agent

## Métadonnées
- **ID** : feature-023
- **Slug** : tokens-par-passage-d-agent
- **Type** : feature
- **Statut** : todo
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

## Description

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
- [ ] S1 — **GATE P1** : verdict sur la lecture hors racine de fichiers contenant des
      conversations entières. Conditions numérotées et **vérifiables sur un diff**
- [ ] A1 — verdict ADR sur le franchissement du confinement en lecture
- [ ] B1 — module de lecture en flux, borné, tolérant aux lignes invalides
- [ ] B2 — agrégation par `agent_id`, **compteurs seulement**
- [ ] B3 — champ exposé dans `/api/etat`
- [ ] F1 — chiffre au centre du disque, abrégé
- [ ] F2 — bottom sheet qui **dit ce que le chiffre compte**
- [ ] F3 — dégradation propre quand le transcript manque
- [ ] S2 — **GATE P2** sur le diff réel
- [ ] D1 — tests, dont **mutation** sur la garde de confinement et sur la borne de lecture
- [ ] C1 — `docs/API.md`, `DESIGN-SYSTEM.md` §5 et §9 corrigés, ADR, `CHANGELOG.md`

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
- [ ] Les 223 passages dessinés affichent un chiffre ; aucun ne montre un zéro inventé
- [ ] Aucun extrait de conversation ne sort du module — vérifié par test
- [ ] Un transcript de 37 Mo ne charge pas 37 Mo en mémoire
- [ ] Une ligne JSON invalide n'interrompt pas la lecture
- [ ] Verdicts GATE P1 et P2 écrits
- [ ] Suite verte, mutation sur la garde de confinement

## Plan de test manuel
1. Ouvrir le cockpit, comparer un chiffre affiché à un calcul fait à la main sur le transcript
2. Renommer un transcript : le disque se dégrade sans casser l'anneau
3. Corrompre une ligne : la lecture continue
4. Vérifier qu'aucun chemin ni texte de transcript n'apparaît dans `/api/etat`

## Hors périmètre
- Le **coût** en monnaie : `input + output` ne le mesure pas
- Le cache : mesuré, écarté, motivé
- Tout affichage de contenu de transcript
