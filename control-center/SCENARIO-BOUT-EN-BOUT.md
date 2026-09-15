# Scénario de bout en bout, avec échec délibéré — feature-010

> **Statut de ce document au 2026-09-14 : écrit, non joué.** C'est le livrable
> A1 de `specs/features/doing/feature-010-scenario-de-bout-en-bout-avec-echec.md` —
> lire cette spec en entier avant de jouer ce scénario, elle porte le contexte,
> les critères d'acceptation et les notes pour agent que ce fichier ne répète
> pas.
>
> Ce document est une **procédure**, pas un relevé. Il ne contient aucune
> mesure : jouer ce scénario produit le relevé (livrable A2 de la même spec),
> qui se rapporte séparément. **Aucun événement de ce scénario n'a été écrit à
> la main** — toute affirmation qui y figurerait sur « ce que fait le kit »
> devrait porter la mention **hypothèse non vérifiée** (régime ADR-0017)
> jusqu'à ce qu'elle soit rejouée.
>
> **Révision** : la version précédente de ce document choisissait `bug-013`
> comme spec porteuse. Deux défauts corrigés ici : (1) `bug-013` touche
> `control-center/backend/events.py` et `control-center/web/app.js` —
> exactement l'instrument que ce scénario utilise pour observer ; on ne
> modifie pas l'appareil de mesure pendant qu'on mesure avec. (2) Le document
> affirmait que `bug-013` était « désignée par `feature-010` elle-même » —
> vérifié faux : `feature-010` est datée du 2026-09-12, `bug-013` du
> 2026-09-14, et le mot « bug-013 » ne figure nulle part dans le texte de
> `feature-010`. La spec porteuse est désormais `bug-005`, hors de
> `control-center/` ; `bug-013` reste corrigée dans ce même cycle, mais comme
> correctif **absorbé** sous ADR-0017, pas comme spec que ce scénario mène de
> `todo/` à `done/`. Voir la section suivante.

## Pourquoi `bug-005` est la spec choisie, et `bug-013` absorbée avec elle (ADR-0017)

`specs/features/todo/bug-005-caractere-invisible-non-montre.md` est la spec
que ce scénario mène de `todo/` à `done/`. Trois raisons, aucune tirée d'un
lien supposé avec `feature-010` :

1. **Son domaine est hors de l'instrument observé.** `bug-005` vit dans
   `tools/update_kit.sh` (un message de diagnostic sur stderr) —
   `control-center/` n'y est touché nulle part. Le tableau de bord peut donc
   observer ce cycle sans que le cycle ne modifie, sous ses yeux, le code qui
   produit l'observation. C'est la propriété que `bug-013` n'avait pas.
2. Elle ne déclenche **pas** `security-reviewer` en rôle GATE (case non
   cochée dans `bug-005` : « aucun chemin sensible — auth, permissions,
   données personnelles, migration ») — ce qui isole ce scénario de la
   variable « verdict de sécurité », qui a sa propre procédure ailleurs dans
   le kit et n'est pas l'objet de `feature-010`.
3. Elle exige une vraie décision de conception (« Ça demande une conception,
   pas une ligne », cf. `bug-005`, section Correctif attendu) tout en restant
   compacte : `debugger` (ou `architect` si la piste retenue est un refactor),
   `architect` (étape 2 du workflow imposé, toujours due), `test-engineer`,
   `code-reviewer`, `doc-writer` — cinq agents, un vrai rebouclage possible,
   sans `ux-ui-designer` ni `frontend-developer` (aucune surface UI).

**`bug-013` est absorbée dans ce même cycle, pas choisie comme porteuse.**
Son domaine (`control-center/backend/events.py`, `control-center/web/app.js`)
est précisément ce que ce scénario utilise pour observer — y compris pour le
cas limite §7.1 (session interrompue), qui **est** le symptôme de `bug-013` :
tant qu'elle n'est pas corrigée, un agent interrompu reste affiché « en
cours » indéfiniment, et §7.1 ne peut alors rien constater d'autre que le
défaut lui-même. Un défaut qui rend inatteignable l'observation qu'un cycle
doit livrer entre dans **ce** cycle, avant lui — c'est exactement l'exception
que `CLAUDE.md` décrit et qu'`ADR-0017` a actée : « le cycle porte alors
plusieurs specs dans `doing/`, avec une seule phase de test / revue /
documentation, et la décision est écrite dans un ADR ». `bug-013` ne
déclenche pas non plus `security-reviewer` GATE (même case non cochée, même
raison : lecture seule, aucune donnée personnelle) — l'absorption ne change
donc pas la variable « sécurité » du scénario.

Concrètement : `bug-005` et `bug-013` passent toutes deux `todo/` → `doing/`
en §4.2, sont implémentées chacune par `debugger` (c'est l'agent que
désignent les deux specs, pas `backend-developer`) en §4.5, partagent **une
seule** passe de `test-engineer`/`code-reviewer`/`doc-writer`, et closent
ensemble en §4.11. `architect` doit écrire, dans un ADR (`docs/adr/00NN-*.md`,
le numéro réel dépend de ce qui existe au moment du jeu — au 2026-09-14, le
dernier est `0020`), la décision de co-traitement elle-même — pas seulement
les deux choix de conception qu'elle recouvre.

Si `bug-005` **ou** `bug-013` a déjà été clôturée au moment où ce scénario
est rejoué : pour `bug-005`, choisir la spec la plus ancienne de
`specs/features/todo/` qui ne déclenche pas `security-reviewer` GATE et dont
le domaine est hors de `control-center/` ; pour `bug-013`, réévaluer si un
autre défaut désarme une garde de ce cycle avant de reconduire l'exception —
l'absorption n'est pas automatique, elle se justifie à chaque fois. Documenter
le remplacement dans le relevé (A2), ne pas modifier ce fichier pour ça.

## 0. Invariants non négociables de l'expérimentation

Ces règles s'appliquent à **toute** commande de ce scénario, sans exception :

| Règle | Pourquoi |
|---|---|
| Clone **jetable et complet** du dépôt (`git clone` local, jamais `cp` partiel de `control-center/`) | `_RACINE_VAR` dans `server.py` et `verrou.py` se calcule depuis l'emplacement de `server.py` (`os.path.dirname(os.path.dirname(...))` — vérifié par lecture, `control-center/backend/server.py:112-114` : deux niveaux au-dessus de `backend/`, donc `control-center/` lui-même). Une copie qui ne contiendrait que `control-center/` — même complète, via `cp -a` — suffirait pour `_RACINE_VAR`, mais **pas pour ce cycle** : `bug-005` vit dans `tools/update_kit.sh`, hors de `control-center/`, et `spec-reader`/`architect`/`doc-writer` ont besoin de `specs/`, `docs/adr/`, `.claude/agents/` pour dérouler le workflow, plus l'historique git pour `git mv`. Un `git clone` complet du dépôt règle tout ça par construction : le nouveau `.git` fait du clone un dépôt autonome, avec son propre `control-center/var/`, **et** contient tout ce que `cp -a control-center/` seul aurait laissé dehors. |
| Port **choisi explicitement**, jamais 8787/8788 | Un serveur réel écoute sur 8788 (`control-center/control-center.toml` du dépôt réel) et sert l'utilisateur. Vérifier qu'un port est libre avant de démarrer : `ss -ltn | grep ':<port> '` ne doit rien rendre. |
| Tout arrêt de processus vise un **PID capturé au lancement** (`$!`, ou `pid=$(cat fichier.pid)`) | `pkill -f` et motifs similaires ont déjà tué le mauvais processus dans ce dépôt. Interdits, sans exception, y compris dans ce scénario. |
| Le journal réel (`/root/agent-kit/control-center/var/agent-events.jsonl`, ou l'équivalent du dépôt où ce scénario est rejoué) est **lecture seule** | Ne jamais y écrire, ni y ajouter, ni le tronquer. Toute mesure de ce scénario porte sur le journal du **clone**. |
| **Écrire un événement à la main est interdit** | Un journal fabriqué prouve seulement que le lecteur sait lire ce qu'on lui a écrit. Chaque ligne du journal du clone doit provenir d'une **exécution réelle** du collecteur (`hooks/record-event.py`), jamais d'un `echo` ou d'un éditeur. Y compris pour simuler un « ancien format » (§7.3) : on modifie le **code** du collecteur temporairement, on le laisse écrire un événement réel, on restaure le code. |

## 1. Préparer le clone jetable

```bash
# Un répertoire de travail, hors du dépôt, nommé pour être reconnaissable.
DIR=$(mktemp -d /tmp/scenario-e2e-feature010.XXXXXX)
SOURCE="${SOURCE:-/root/agent-kit}"

# ⚠️ COPIE DE L'ARBRE DE TRAVAIL (`cp -a`), JAMAIS `git clone`.
# Constaté par exécution le 2026-09-14 : un `git clone` de ce dépôt rendait le
# scénario INJOUABLE à partir de sa section 4.5 — le clone ne contenait ni
# `forme_lisible_chemin`, ni le correctif du bandeau, ni `bug-005` dans
# `doing/`, parce que ce travail n'était pas encore commité. Un scénario qui
# ne se rejoue que sur un dépôt propre n'est pas rejouable : il l'est le jour
# où tout est commité, et pas les autres jours — c'est-à-dire justement ceux
# où l'on veut s'en servir.
#
# Si vous voulez délibérément partir d'un état commité, exportez
# SOURCE=<chemin d'un clone git à jour> avant de lancer cette procédure, et
# dites-le dans le relevé : ce n'est pas le même objet qu'on mesure.
cp -a "$SOURCE" "$DIR/agent-kit"
cd "$DIR/agent-kit"

# Vérifier qu'il s'agit bien d'un dépôt autonome, distinct de l'original.
git remote -v            # doit pointer vers /root/agent-kit (origin du clone), pas GitHub
git rev-parse --git-dir  # doit résoudre DANS $DIR, jamais /root/agent-kit/.git
```

`control-center.toml` et `control-center/var/` ne sont **pas suivis par git**
(vérifié : `git ls-files control-center/control-center.toml control-center/var`
ne rend rien dans le dépôt réel) — le clone ne les reçoit donc pas. Écrire la
configuration du clone à la main :

```bash
PORT=8799   # choisir un port libre ; vérifier d'abord : ss -ltn | grep ':8799 '
cat > control-center/control-center.toml <<EOF
[projet]
nom = "agent-kit — clone jetable (scénario feature-010)"

[specs]
racine = "specs/features"

[workflows]
# Indispensable : sans cette ligne, le tableau de bord affiche la session
# entière comme un seul workflow (comportement documenté par ADR-0014).
# C'est la même valeur que le control-center.toml réel de ce dépôt.
agents_ouvrants = ["orchestrator"]

[serveur]
hote = "127.0.0.1"
port = ${PORT}
# Pas de fichier_jeton : écoute strictement locale, jeton facultatif
# (ADR-0020). Ce scénario n'éprouve pas feature-007 (déjà couvert par
# test_jeton.py, test_verrou.py, test_server_bug012.py).
EOF
```

Vérifier que `control-center/var/` n'existe pas encore (il sera créé au
premier événement) :

```bash
test -e control-center/var && echo "ANOMALIE : var/ déjà présent dans le clone" || echo "OK : var/ absent"
```

## 2. Démarrer le tableau de bord du clone

```bash
cd "$DIR/agent-kit"
python3 control-center/backend/server.py > /tmp/scenario-e2e-server.log 2>&1 &
SERVER_PID=$!
echo "$SERVER_PID" > /tmp/scenario-e2e-server.pid
sleep 1
cat /tmp/scenario-e2e-server.log
```

**Observation 2.a**
- *Ce qu'on regarde* : la bannière de démarrage dans `/tmp/scenario-e2e-server.log`.
- *Ce qu'on attend* : une ligne `écoute   : http://127.0.0.1:8799` (le port
  choisi ci-dessus) et `écriture : ACTIVE en local, SANS jeton (ADR-0020)`.
- *Comment on constate l'écart* : tout autre port, ou une ligne `écriture :
  FERMÉE`, signale une configuration mal écrite — corriger avant de
  continuer, ne jamais deviner un port depuis une documentation.

```bash
curl -s "http://127.0.0.1:${PORT}/api/etat" | python3 -m json.tool | head -20
```

**Observation 2.b — état vide**
- *Ce qu'on regarde* : le corps de `/api/etat` (`workflows` doit être `[]`),
  et dans un navigateur pointé sur `http://127.0.0.1:8799/`, la zone
  « workflows ».
- *Ce qu'on attend* : `zone.appendChild(el("div", "vide", "aucun événement
  encore observé"))` — le message exact codé dans `web/app.js`.
- *Comment on constate l'écart* : tout autre texte, une zone qui reste
  vide sans message, ou une erreur JavaScript en console.
- Cette capture sert de matière brute pour B3 (vérification d'apparence,
  état « vide ») une fois que `ux-ui-designer` aura écrit l'attendu (B1) —
  ce scénario ne tranche pas B3 lui-même, il fournit l'état à comparer.

## 3. Vérité terrain — comment mesurer indépendamment de l'écran

Trois sources indépendantes existent pour la même information. Chaque
observation de ce scénario compare **au moins deux** d'entre elles :

1. **Le journal brut**, compté à la main (`grep`/`python3 -c`) — la source la
   plus basse, ce que le collecteur a réellement écrit.
2. **La reconstruction en ligne de commande** :
   `python3 control-center/backend/events.py control-center/var/agent-events.jsonl`
   — appelle directement `reconstruire()`, imprime un texte lisible sans
   passer par le serveur HTTP ni le navigateur.
3. **Le rendu à l'écran** (`http://127.0.0.1:${PORT}/`, ou `curl .../api/etat`
   pour la même donnée sans navigateur) — passe par `server.py` (même
   `reconstruire()` que (2), donc pas indépendant de (2)) **et** par
   `web/app.js` (qui, lui, est indépendant : c'est la seule couche que (1) et
   (2) ne couvrent pas).

**Convention pour ce scénario** : (1) vs (2) vérifie la fidélité du backend
(`events.py`) ; (2)/(3)-JSON vs (3)-écran vérifie la fidélité du rendu
(`app.js`). Un écart entre (1) et (2) est un défaut de reconstruction ; un
écart entre le JSON et l'écran est un défaut de rendu. Les deux sont à
signaler, jamais à corriger dans le relevé lui-même.

## 4. Déroulé du cycle nominal, agent par agent

Chaque étape suit le workflow imposé de `CLAUDE.md`. Dans le clone, lancer une
vraie session `claude` (`cd "$DIR/agent-kit" && claude`) et y dérouler le
cycle normalement — **ce scénario ne simule aucun agent**, il fait tourner le
kit tel qu'un développeur le ferait.

Avant de commencer, capturer le `session_id` dès le premier événement :

```bash
tail -n1 -f control-center/var/agent-events.jsonl &
TAIL_PID=$!
# lancer la session claude dans un autre terminal, laisser passer le premier tour, puis :
kill "$TAIL_PID"
SID=$(python3 -c "import json; print(json.loads(open('control-center/var/agent-events.jsonl').readlines()[0])['session_id'])")
echo "$SID"
```

### 4.1 `orchestrator` — ouverture du cycle

- Prompt : « Prépare le plan pour bug-005, et pour bug-013 absorbée dans ce
  même cycle sous ADR-0017 ».
- **Observation** : dans la source (2)/(3), un nouveau `workflow_id`
  `"$SID#0"` apparaît, `bornage = "marqueur-agent"`, `borne_par =
  "orchestrator"`. Sur l'écran, la puce « cycle 1/N — ouvert par orchestrator »
  n'apparaît **que** si une session ultérieure du même `SID` existe (elle
  n'apparaît pas tant qu'un seul segment a été vu — c'est `cycles_dans_la_session
  > 1` qui commande son affichage, pas juste sa présence en base : vérifier
  ce point précisément, c'est un piège de lecture documenté dans `app.js`).
- *Écart* : un `bornage = "session-entiere"` signale que
  `[workflows].agents_ouvrants` n'a pas été lu (config mal écrite, §1) —
  arrêter et corriger avant de continuer, la segmentation de tout le reste du
  scénario en dépend.
- **Constat à faire, si le lancement passe par le tableau de bord plutôt que
  par un terminal** : `server.py` expose une route `/api/lancer` (commit
  `49fdc8f`) qui journalise `LancementDemande` puis `LancementTermine`
  (`control-center/backend/server.py`, lignes ~1107 et ~582-591). Ces deux
  événements **n'ont pas de `session_id`** (il n'est pas encore connu au
  moment de la demande) et `reconstruire()` les écarte silencieusement
  (`if not session: continue`) — établi par lecture du code, à vérifier par
  exécution au moins une fois pendant ce scénario, même si ce déroulé utilise
  un terminal `claude` classique pour le reste. Si la route est exercée, le
  tableau de bord ne montre **pas** le lancement qu'il a lui-même déclenché :
  à consigner comme fait, pas à corriger dans ce passage.

### 4.2 `spec-reader` — déplacement `todo/` → `doing/`, deux specs

```bash
git mv specs/features/todo/bug-005-caractere-invisible-non-montre.md \
       specs/features/doing/
git mv specs/features/todo/bug-013-agent-tue-reste-en-cours-pour-toujours.md \
       specs/features/doing/
```

- **Observation** : un nouveau maillon `spec-reader` dans la chaîne du
  workflow, `fichiers` contient les quatre chemins (deux `todo/`, deux
  `doing/`), ou deux seulement selon la façon dont `git mv` est journalisé
  par les hooks — **à constater, pas à supposer**. C'est la première fois que
  ce maillon voit deux specs déplacées dans le même passage : si `fichiers`
  n'en retient qu'une, c'est un défaut de collecte à signaler, pas un
  résultat attendu.

### 4.3 `architect` — deux décisions de conception, un ADR de co-traitement

- **`bug-005`** : le plan écrit doit nommer la méthode d'affichage retenue
  pour rendre visible un caractère non imprimable dans un chemin déclaré,
  sans échapper les octets non-ASCII **légitimes** (accents, cf. ADR-0013).
  `printf '%q'` et `cat -v` sont déjà écartés par la spec elle-même — le plan
  doit dire pourquoi, ou proposer autre chose.
- **`bug-013`** : le plan doit nommer la clé de configuration retenue pour le
  seuil de fraîcheur (ex. `[workflows] seuil_abandon_minutes`) — cette clé
  n'existe pas encore au moment où ce document est écrit ; noter sa valeur
  réelle dans le relevé (A2), pas ici.
- **Le co-traitement lui-même** : `architect` doit écrire, dans un ADR, la
  décision d'absorber `bug-013` dans le cycle de `bug-005` (citant
  `ADR-0017`) — pas seulement les deux choix de conception ci-dessus.
- **Observation** : maillon `architect`, au moins un fichier
  `docs/adr/00NN-*.md` apparaît dans `fichiers` du workflow (potentiellement
  deux ou trois, selon que `architect` regroupe les trois décisions dans un
  seul ADR ou les sépare — les deux sont défendables, ce scénario constate le
  choix réel plutôt que d'en présumer un).

### 4.4 `ux-ui-designer` — un état de plus, pour `bug-013` seule

- `bug-005` n'a **aucune** surface UI (un message sur stderr) : ce maillon ne
  lui est pas dû.
- Pour `bug-013` : attendu écrit sur ce que « abandonné » (ou le libellé
  retenu) doit montrer visuellement, distinct de « en cours » et de
  « terminé ».
- **Observation** : maillon `ux-ui-designer`, aucun fichier de code touché
  (c'est un livrable de conception, pas d'implémentation), `fichiers` ne cite
  rien sous `tools/`.

### 4.5 `debugger` — implémentation, **avec le bug planté sur `bug-005`**

Deux invocations distinctes de `debugger`, l'une après l'autre, avant toute
passe de `test-engineer` (c'est la même phase, sous ADR-0017) :

1. **`bug-005`**, `tools/update_kit.sh` — voir §5 ci-dessous pour le détail
   de l'échec délibéré. En résumé : le premier essai neutralise, sans le
   dire, la condition qui exclurait les séquences UTF-8 multi-octets
   légitimes de la détection — un bug réel, pas un artifice de démonstration.
2. **`bug-013`**, `control-center/backend/events.py` (et `web/app.js` si
   `ux-ui-designer` a demandé un changement de rendu synchronisé) —
   implémentée proprement dans cette même passe, **sans** défaut planté :
   l'échec délibéré de ce scénario vit tout entier dans `bug-005` (§5).

- **Observation** : deux maillons `debugger` contigus, `fichiers` du premier
  contient `tools/update_kit.sh`, celui du second `control-center/backend/events.py`
  (et éventuellement `web/app.js`). Si `_reprises()` compte l'`agent_type`
  sur l'ensemble de la chaîne plutôt que sur des invocations non contiguës
  uniquement, ces deux maillons contigus pourraient déjà faire apparaître
  `{"debugger": 2}` **avant même** le rebouclage de §4.7 — **à vérifier par
  exécution**, c'est un cas que ce scénario n'a jamais exercé (deux specs
  distinctes confiées au même agent, dos à dos, dans la même phase).

### 4.6 `test-engineer` — premier passage, **rouge sur `bug-005`, vert sur `bug-013`**

- Le test de non-régression sur les chemins accentués (dans la lignée de
  `NomsAccentuesTest`, cf. ADR-0013) échoue avec le bug planté sur `bug-005` :
  un chemin accentué légitime se retrouve signalé comme s'il portait un
  caractère non imprimable.
- Le test de non-régression exigé par les critères d'acceptation de `bug-013`
  (« un agent réellement en cours depuis longtemps... cas de test explicite
  avec une durée supérieure à la plus longue mesurée sur ce dépôt, 36 min »)
  passe : `bug-013` est implémentée sans défaut dans cette passe.
- **Observation** : maillon `test-engineer` n°1. Le rapport dit « bloqué »,
  pas « OK » — c'est la garde du prompt de l'agent (« Interdit : dire OK sans
  avoir réellement lancé la suite »), à vérifier qu'elle tient dans ce
  passage réel, et qu'elle **distingue** ce qui est vert (`bug-013`) de ce
  qui est rouge (`bug-005`) plutôt que de rendre un verdict global opaque.
- ⚠️ **Piège de lecture** : le badge `✕N` (`echecs`) sur un maillon vient de
  `PostToolUseFailure` — un outil qui a lui-même échoué à s'exécuter (fichier
  introuvable, permission refusée), **pas** « la suite de tests a un résultat
  rouge ». Un test rouge lancé par `Bash` qui rend un exit code non nul est un
  **résultat de commande dans la sortie**, pas un `PostToolUseFailure` du
  point de vue du collecteur. Ne pas s'attendre à voir `✕N` sur ce maillon à
  cause du test rouge : le signal du reboucle est ailleurs (§4.7, `reprises`),
  et c'est exactement le genre d'attente fausse que ce scénario doit
  débusquer en l'écrivant, puis en la vérifiant fausse à l'exécution.

### 4.7 Reboucle vers `debugger` — le rebouclage réel, scopé à `bug-005`

- Le rapport rouge de `test-engineer` (4.6) déclenche, selon le workflow
  imposé, un retour à `debugger` (étape 6 du workflow : « À chaque verdict
  bloquant, reboucler sur l'agent concerné ») — sur `bug-005` uniquement,
  `bug-013` n'a rien à corriger.
- `debugger` restaure la condition neutralisée au premier essai : la
  détection ne s'applique qu'aux quatre signatures précises (BOM `EF BB BF`
  en tête, espace insécable `C2 A0`, retour chariot `0D` intérieur au
  chemin, autres octets de contrôle C0 hors tabulation/nouvelle ligne) — pas
  à tout octet supérieur à `0x7E`, qui couvrait aussi les octets de tête et de
  continuation d'une séquence UTF-8 légitime. Un seul changement, la
  condition retirée à tort — le correctif reste minimal (contrainte de
  `feature-010`).
- **Observation** : troisième maillon `debugger` dans la chaîne, **non
  contigu** aux deux premiers (le maillon `test-engineer` n°1 s'intercale).
  `wf.reprises` doit porter une entrée pour `debugger` — la valeur exacte
  (2 si `_reprises()` ne compte que les invocations séparées par un autre
  agent, 3 si elle compte toutes les occurrences y compris les deux
  contiguës de 4.5) est **à constater**, pas à deviner depuis ce document.

### 4.8 `test-engineer` — second passage, **vert**, avec mutation sur les deux specs

- Suite verte, sur `bug-005` **et** `bug-013`. Validation par mutation :
  - `bug-005` — retirer une des quatre signatures de la liste (ex. le BOM),
    ou élargir arbitrairement la plage détectée, doit faire échouer le test
    de non-régression correspondant.
  - `bug-013` — le seuil doit être muté, raccourci **et** allongé (exigé
    explicitement par les critères d'acceptation de `bug-013`).
- **Observation** : maillon `test-engineer` n°2. `wf.reprises` porte
  désormais l'entrée `debugger` mise à jour et `{"test-engineer": 2}`.
- **Le rebouclage doit se voir comme un rebouclage, pas comme une succession
  banale** (critère d'acceptation central de `feature-010`) : la chaîne à
  l'écran doit montrer visuellement `... → test-engineer → debugger →
  test-engineer → ...`, et une note `reprises` doit être visible sous le
  workflow. Si cette note est absente alors que le journal brut (source 1,
  §3) montre bien deux `SubagentStart` supplémentaires pour `debugger`,
  c'est un défaut de `_reprises()` à signaler, pas à corriger dans ce
  passage.

### 4.9 `code-reviewer`

- Un seul passage, sur les deux diffs (`tools/update_kit.sh` et
  `control-center/backend/events.py` / `web/app.js`) — c'est la
  « seule phase de revue » que prescrit ADR-0017 pour un cycle à specs
  multiples.
- **Observation** : maillon `code-reviewer`, verdict consigné (GO / Request
  changes), `fichiers` couvre les deux domaines. Un « Request changes » ici
  ouvrirait un **second** rebouclage, distinct de celui de 4.7 — s'il se
  produit réellement, le documenter comme un fait, pas comme un raté du
  scénario : ce scénario n'exige qu'**au moins un** échec réel, pas
  exactement un.

### 4.10 `doc-writer`

- Met à jour, dans une seule passe : le message d'aide ou la documentation de
  `tools/update_kit.sh` si elle existe, `control-center/README.md` (tableau
  d'avancement) et `CHANGELOG.md` pour les deux correctifs.
- **Observation** : maillon `doc-writer`, `fichiers` contient les trois (ou
  plus, selon ce qui existe réellement dans le clone).

### 4.11 Clôture — deux specs, ensemble

```bash
git mv specs/features/doing/bug-005-caractere-invisible-non-montre.md \
       specs/features/done/
git mv specs/features/doing/bug-013-agent-tue-reste-en-cours-pour-toujours.md \
       specs/features/done/
```

- **Observation finale du cycle nominal** : le workflow `"$SID#0"` porte
  désormais la chaîne complète, `reprises` non vide, `fermetures_orphelines`
  et `imbrication_suspectee` disponibles pour la lecture du §6. Vérifier que
  l'ADR de co-traitement écrit en 4.3 existe bien sur disque au moment de
  cette clôture — CLAUDE.md l'exige, ce n'est pas optionnel pour fermer ce
  cycle sous ADR-0017.

## 5. L'échec délibéré, en détail

**Ce qui est planté, et où** : dans `tools/update_kit.sh` (le message de
diagnostic corrigé par `bug-005`, écrit par `debugger` en 4.5), le premier
essai détecte un caractère « non imprimable » avec un test trop large — tout
octet strictement supérieur à `0x7E` — au lieu de tester spécifiquement les
quatre signatures que la spec nomme (BOM `EF BB BF`, espace insécable
`C2 A0`, `\r` intérieur `0D`, autres octets de contrôle C0). Un octet de tête
ou de continuation d'une séquence UTF-8 légitime (plage `0xC2`–`0xF4` pour
la tête, `0x80`–`0xBF` pour la continuation) dépasse lui aussi `0x7E` : un
chemin accentué comme `révision.md` se retrouve donc signalé à tort. C'est
précisément l'« argument qui a écarté le correctif naïf » que `bug-005`
documente elle-même (`printf '%q'`, `cat -v`) — sauf que ce premier essai de
`debugger` réintroduit la même erreur sous une autre forme : neutraliser,
plutôt qu'écarter explicitement, la condition qui distingue « non-ASCII
légitime » de « non imprimable ». C'est un bug plausible, du genre que
produit une première implémentation pressée — pas un artifice ajouté pour la
démonstration.

**Pourquoi c'est un vrai échec, et pas un théâtre** : le test de
non-régression sur les chemins accentués existe déjà dans les critères
d'acceptation de `bug-005` avant toute implémentation (« un chemin déclaré
accentué... continue de s'afficher tel quel, sans échappement — non-
régression du cas couvert par ADR-0013 / `NomsAccentuesTest` »).
`test-engineer` l'écrit d'abord, il tourne contre le code de `debugger`, il
échoue pour de vraies raisons — le test de plage lit le mauvais seuil. Rien
n'est écrit dans le journal pour simuler cela : le rouge est un vrai résultat
de la suite du projet, la reboucle est une vraie invocation d'agent.

**Ce que le relevé (A2) doit établir** : le nombre exact de passages de
`debugger` et `test-engineer`, l'horodatage du rapport rouge, l'horodatage du
rapport vert, et une comparaison ligne à ligne entre le diff réellement
appliqué en 4.7 et le correctif attendu (retirer le test `> 0x7E` au profit
des quatre signatures nommées).

## 6. Compteurs et fidélité du récit

### 6.1 Compte d'appels d'outils

- *Vérité terrain* : `grep '"hook_event_name": "PostToolUse"' control-center/var/agent-events.jsonl | grep "\"$SID\"" | wc -l` pour le total de la
  session, et par segment en filtrant en plus sur la fenêtre temporelle
  `debut`/`fin` de chaque maillon (les horodatages ISO se comparent
  lexicalement, §3 du fichier `events.py`).
- *Ce qu'on attend* : le champ `outils` de chaque segment `"type":
  "principal"` (visible sur l'écran comme `N outils` sur le maillon
  « agent principal ») égale le compte d'événements `PostToolUse` tombés dans
  sa fenêtre. Les segments `"type": "sousagent"` n'exposent **pas** de compte
  d'outils à l'écran (seulement `fichiers`) — ce scénario doit confirmer si
  c'est un choix de `app.js` documenté (l'agent principal seul concentrait
  108 des 110 appels sur le relevé cité par le module) ou un oubli.
- *Comment on constate l'écart* : un total d'appels d'outils du récit
  (somme des `outils` de tous les segments principaux du workflow) différent
  du compte brut ci-dessus.

### 6.2 `fermetures_orphelines`

- *Fait déjà établi, sur le journal réel du dépôt (pas ce clone), par
  exécution* : `fermetures_orphelines = 1250`, la totalité à `agent_type`
  vide, **aucune** appariée à un `SubagentStart`. La cause identifiée : le
  runtime émet un `SubagentStop` **fantôme** à chaque fin de tour de l'agent
  principal — **ce n'est pas un défaut du kit**, c'est un comportement du
  runtime que le collecteur enregistre fidèlement.
- *Vérité terrain sur ce clone* : `(nombre de SubagentStop) − (nombre de
  SubagentStart)` pour la session, en excluant les `SubagentStop`
  correctement appariés par `agent_id`. En pratique, la manière la plus
  fiable de vérifier sans réimplémenter `_reprises`/l'appariement : comparer
  le compteur affiché à l'exécution indépendante de la source (2),
  `events.py` en ligne de commande, sur le **même** fichier journal — si (2)
  et (3) s'accordent, l'écart à chercher est entre (1) et (2), pas entre (2)
  et (3).
- *Ce qu'on attend sur ce clone* : un nombre proportionnel au nombre de tours
  de l'agent principal dans ce cycle (donc **pas zéro** — un
  `fermetures_orphelines` nul sur un cycle de plusieurs tours reste suspect,
  pas rassurant), avec la **même signature** que sur le journal réel :
  `agent_type` vide sur toutes ces fermetures, aucune appariée à un
  `SubagentStart`. C'est cette signature-là, pas seulement le total, que ce
  scénario doit confirmer se reproduire sur un cycle frais.
- *Comment on constate l'écart* : compter à la main, dans le journal brut du
  clone, les `SubagentStop` dont l'`agent_id` n'apparaît dans **aucun**
  `SubagentStart` du même fichier. Le vrai signal d'anomalie, désormais
  précisé, est une fermeture orpheline dont l'`agent_type` n'est **pas**
  vide, ou qui s'apparie malgré tout à un `SubagentStart` — l'un ou l'autre
  serait un défaut de `events.py` à signaler (pas à corriger ici), distinct
  du bruit déjà expliqué du runtime.
- Voir aussi §4.1 : `LancementDemande`/`LancementTermine` sont un autre
  exemple du même `if not session: continue` — des événements réels,
  silencieusement écartés, faute de `session_id`.

### 6.3 `imbrication_suspectee`

- *Fait déjà établi, sur le journal réel du dépôt, par exécution* :
  `imbrication_suspectee` vaut `true` sur **9 workflows sur 12**, et **le
  compteur est mal nommé** — ce n'est pas une imbrication (aucun agent de ce
  dépôt ne porte l'outil `Task` dans son frontmatter, donc aucun ne peut en
  invoquer un autre), mais un **retard d'écriture du hook** : exemple relevé,
  l'`orchestrator` cesse toute activité à `20:00:05`, son `SubagentStop`
  n'est journalisé qu'à `20:03:33`, après le démarrage de `spec-reader`. Le
  collecteur voit alors, dans l'ordre d'écriture, un agent qui « démarre »
  avant que le précédent ait « fini », sans qu'aucune imbrication réelle
  n'existe.
- *Ce qu'on attend sur ce clone* : `imbrication_suspectee` **peut** valoir
  `true` à un moment du cycle nominal **sans que ce soit un défaut** — ce
  n'est plus l'attendu naïf « `false` sur l'intégralité du cycle » de la
  version précédente de ce document, qui aurait fait sonner une fausse
  alarme sur un comportement déjà expliqué. Le signal à chercher n'est donc
  plus la valeur du booléen seule, mais l'écart entre l'ordre d'écriture
  (source 1, timestamps du journal) et l'ordre réel d'exécution (impossible à
  observer directement ici, faute d'horodatage de fin réelle côté agent —
  documenter cette limite plutôt que la contourner par supposition).
- *Comment on constate un vrai défaut* : `imbrication_suspectee = true`
  n'est un défaut réel que si, en plus, un `SubagentStop` manque
  **totalement** dans le journal brut (une fermeture perdue, pas seulement
  tardive), ou si un agent porte effectivement `Task` dans son frontmatter au
  moment du jeu (`grep -l Task .claude/agents/*.md` — vérifier par exécution,
  ne pas le supposer de la documentation). Le nom du compteur reste, lui, une
  dette de documentation établie à signaler dans le relevé (A2), indépendamment
  de ce que ce clone mesure.

## 7. Cas limites

### 7.1 Session interrompue en plein cycle

```bash
claude &
CLAUDE_PID=$!
echo "$CLAUDE_PID" > /tmp/scenario-e2e-claude.pid
# laisser passer une invocation d'agent (SubagentStart observé dans le journal
# du clone, SANS SubagentStop qui suit), puis :
kill -TERM "$CLAUDE_PID"     # jamais pkill -f
```

- **Observation** : le workflow correspondant reste `fin_observee_absente =
  true` indéfiniment — **et c'est exactement le symptôme de `bug-013`**. Si
  le cycle nominal (§4) a réellement livré son correctif (absorbé sous
  ADR-0017, §4.5 et §4.7-4.8), ce cas limite doit montrer l'état neuf
  (« abandonné » / le libellé retenu par `architect` en 4.3) une fois le
  seuil de fraîcheur dépassé, **jamais** « en cours » indéfiniment. C'est
  donc le test d'acceptation de `bug-013` rejoué en conditions réelles, pas
  seulement une vérification de non-crash.
- *Comment on constate l'écart* : recharger `http://127.0.0.1:${PORT}/`
  après avoir attendu (ou, si le seuil est configurable court dans les tests,
  après le délai configuré) et lire l'état du maillon interrompu.

### 7.2 Deux sessions simultanées dans le même dépôt

```bash
cd "$DIR/agent-kit" && claude &         # session A
cd "$DIR/agent-kit" && claude &         # session B, même clone, même dépôt
```

- Donner à chaque session une tâche triviale mais distincte (ex. « lis
  `README.md` » pour A, « liste les fichiers de `control-center/` » pour B)
  pour produire des `file` différents et faciliter la vérification visuelle.
- **Observation** : deux cartes de workflow distinctes, `session_id`
  différents (les 8 premiers caractères affichés à l'écran, `wf.session_id`
  complet dans le JSON). Aucun fichier touché par A n'apparaît dans les
  `fichiers` de B, et réciproquement.
- *Comment on constate l'écart* : `grep '"session_id"' control-center/var/agent-events.jsonl | sort -u` doit
  rendre exactement deux valeurs pour cette expérience ; tout mélange de
  `file` entre les deux cartes à l'écran est un défaut de cloisonnement à
  signaler immédiatement (proche d'un risque de confidentialité entre
  sessions, si ce dépôt en accueillait plusieurs utilisateurs — non
  applicable ici, ADR-0020, mais la garde reste vérifiable).

### 7.3 Journal contenant des événements d'une version antérieure du collecteur

Le champ `runtime` est inscrit **par le collecteur**, en dur, sur chaque
événement (`"runtime": "claude-code"`, `hooks/record-event.py`). Pour obtenir
un événement réel qui en soit dépourvu — comme l'aurait écrit une version du
collecteur antérieure à ce champ — **sans jamais écrire de ligne à la main** :

```bash
cd "$DIR/agent-kit"
cp control-center/hooks/record-event.py /tmp/record-event.py.bak
python3 - <<'PY'
import re
p = "control-center/hooks/record-event.py"
s = open(p).read()
s2 = s.replace('        "runtime": "claude-code",\n', '')
assert s2 != s, "le marqueur à retirer n'a pas été trouvé — ne pas continuer"
open(p, "w").write(s2)
PY
# Déclencher UN événement réel à travers le collecteur ainsi modifié — par
# exemple en soumettant un prompt trivial dans une session déjà ouverte, ou
# via un événement SessionStart : n'importe quel déclenchement réel du hook
# convient, l'important est qu'il passe par le code modifié.
# ... déclencher l'événement ...
cp /tmp/record-event.py.bak control-center/hooks/record-event.py   # restaurer AVANT de continuer le scénario
```

- **Observation** : le workflow qui contient cette ligne affiche `runtime:
  "inconnu"` (défaut de `evenement.get("runtime", "inconnu")` dans
  `events.py`) pour ce segment, sans que la lecture du reste du journal
  n'échoue — ni côté `events.py` (CLI, source 2), ni côté serveur (source 3).
- *Comment on constate l'écart* : toute exception Python au chargement du
  journal (`lire_journal`), ou tout écran qui reste vide/plante alors que
  d'autres workflows existent par ailleurs dans le même fichier, est un
  défaut de résilience à signaler.

### 7.4 Session détachée (`claude --bg`) encore vivante après un `SessionEnd`

**Fait déjà établi, sur le journal réel du dépôt, par exécution** : `SessionEnd`
se déclenche sur des sessions **courtes et proprement closes** (2 occurrences
observées), et **jamais** sur une session **longue, interrompue puis
reprise** — `ADR-0014` affirme le contraire de façon générale ; c'est établi
**faux par généralisation**, vrai seulement sur le sous-ensemble « session
courte, close proprement ». Ce fait motive ce cas limite sans le trancher :
la configuration exacte testée ici (`claude --bg`, un seul tour, processus
toujours vivant) n'a **pas** encore été mesurée — ne pas présumer son issue
depuis le fait ci-dessus, qui porte sur une configuration voisine mais
distincte (session longue interrompue-reprise).

Ce cas rejoue par ailleurs l'expérience que `specs/features/done/bug-002-...md`
décrit comme **jamais effectuée avant sa clôture** (« Ce qu'il faut faire
avant de lancer ce cycle : lancer délibérément une session `claude --bg`, la
laisser finir un tour, et observer si un `SessionEnd` apparaît alors qu'elle
vit encore. Tant que ce relevé n'existe pas, cette spec n'a pas de symptôme
établi »). `bug-002` est clos en « décision de ne pas faire », mais cette
prémisse précise reste, à ce jour, une **hypothèse non vérifiée** — voir
`.claude/memory/centre-de-controle-etat-et-pieges.md`.

```bash
cd "$DIR/agent-kit"
claude --bg &
BG_PID=$!
echo "$BG_PID" > /tmp/scenario-e2e-bg.pid
```

- Laisser la session détachée terminer au moins un tour de conversation.
- **Observation** :
  1. `ps -p "$BG_PID"` (ou le PID réel du processus `claude` si `--bg`
     détache dans un processus fils distinct — à constater, pas à supposer)
     confirme si le processus est **toujours vivant**.
  2. `grep '"hook_event_name": "SessionEnd"' control-center/var/agent-events.jsonl | grep "$(python3 -c "import json;print(json.loads(open('control-center/var/agent-events.jsonl').readlines()[-1])['session_id'])")"`
     (adapter le `session_id` à celui de la session `--bg`) dit si un
     `SessionEnd` a été émis.
- *Ce qu'on constate* — trois issues possibles, à consigner sans en présumer
  aucune avant exécution :
  - Aucun `SessionEnd` tant que le processus vit : **confirme** le relevé du
    2026-09-13 cité par `bug-002` (comportement correct, rien à corriger),
    et s'accorde avec le fait établi ci-dessus.
  - Un `SessionEnd` apparaît alors que `ps` montre le processus vivant :
    **réfute** la clôture de `bug-002` — un symptôme réel existe désormais,
    à rouvrir en spec neuve, jamais à corriger dans ce passage de test.
  - `claude --bg` n'est pas disponible dans l'environnement où ce scénario
    est rejoué : consigner **hypothèse non vérifiée** et ne pas trancher.

## 8. Vérification d'apparence — ce que ce scénario prépare, pas ce qu'il tranche

Les étapes ci-dessus produisent, comme sous-produit, quatre états d'écran
distincts qui serviront de matière à B2/B3 une fois que `ux-ui-designer` aura
écrit l'attendu visuel (B1, non encore produit à la date de ce document) :

| État | Produit par |
|---|---|
| Vide | §2, avant tout événement |
| Chargement / fil en cours | §4.5–4.6, pendant que `debugger`/`test-engineer` tournent, workflow `fin_observee_absente = true` |
| Erreur / reboucle | §4.6–4.7, le passage rouge et son rebouclage |
| Fil long | §4 entier, le workflow complet une fois clos (nombreux segments, deux specs) |

Capturer ces quatre états (méthode de capture : à instruire par `architect`,
B2 — piste possible : servir la page avec le flux SSE désactivé par
paramètre, puisque c'est lui qui empêche l'aboutissement d'une capture
headless, cf. `control-center/README.md`, section « Ce qui n'est pas
vérifié ») est **hors périmètre de ce fichier**. Ce scénario s'arrête à
fournir des états réels et datés à comparer — pas à réaliser la comparaison.

## 9. Nettoyage

```bash
kill "$SERVER_PID"                 # PID capturé en §2, jamais un motif
[ -f /tmp/scenario-e2e-claude.pid ] && kill "$(cat /tmp/scenario-e2e-claude.pid)" 2>/dev/null
[ -f /tmp/scenario-e2e-bg.pid ]     && kill "$(cat /tmp/scenario-e2e-bg.pid)" 2>/dev/null
ss -ltn | grep ":${PORT} " || echo "port libéré"
md5sum /root/agent-kit/control-center/var/agent-events.jsonl   # à comparer à AVANT le scénario
rm -rf "$DIR"
```

- *Comment on constate l'écart* : si le `md5sum` du journal réel du dépôt a
  changé entre avant et après ce scénario, **c'est une violation directe des
  invariants du §0** — arrêter, ne pas continuer, documenter l'incident.

## 10. Grille de sortie (livrables A2/A3, croisés avec les critères d'acceptation de feature-010)

| Critère (feature-010) | Où ce scénario le couvre |
|---|---|
| Cycle complet, échec réel, récit fidèle | §4 entier, comparaison (1)/(2)/(3) à chaque étape |
| Rebouclage distinct d'un enchaînement normal | §4.7–4.8, `wf.reprises` |
| Compte d'appels d'outils correspondant | §6.1 |
| Compteurs d'anomalies expliqués, chiffres à l'appui | §6.2, §6.3 |
| Cycle à specs multiples correctement absorbé (ADR-0017) | §4.2, §4.3, §4.11 — présence de l'ADR de co-traitement |
| Apparence vérifiée ou dite non vérifiée | §8 (préparé, pas tranché — dépend de B1) |
| Rejouable par un tiers | ce document lui-même |
| Suite verte, zéro régression | suite du kit + suites du centre de contrôle, relevées séparément (M1) |
| Lint propre | commande de lint du projet, si définie — sinon le dire explicitement |

## 11. Notes pour qui rejoue ce scénario

- **Régime ADR-0017** : toute case de ce document non cochée par une
  exécution réelle reste une hypothèse. Le relevé (A2) doit distinguer ce qui
  a été observé de ce qui a été supposé.
- Un mutant qui survit à la validation par mutation (§4.8, sur `bug-005`
  **et** `bug-013`) est une **information**, pas un échec à masquer : soit un
  trou de couverture, soit une équivalence à documenter comme telle.
- Ne jamais corriger, pendant le jeu de ce scénario, un défaut qu'il révèle
  au-delà du périmètre déjà couvert par `bug-005` et son absorption de
  `bug-013` : un défaut plus gros devient sa propre spec (`bug-011`,
  `bug-010` et consorts en sont déjà des exemples dans ce dépôt — `bug-013`
  elle-même en est un : absorbée par ce cycle sous ADR-0017 plutôt que
  traitée comme porteuse ou laissée de côté).
- Toute capture d'écran ou extrait de journal cité dans le relevé (A2) doit
  être **relu avant publication** : le journal contient des chemins, des noms
  de fichiers et des têtes de commande (section « Sécurité & données » de
  feature-010).
