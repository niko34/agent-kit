# ADR-0027 — Le centre de contrôle écrit des specs, il n'en valide aucune

## Statut

Accepté

## Date

2026-09-19

## Contexte

`feature-008` ajoute au centre de contrôle la première capacité qui écrit un
**contenu arbitraire** dans le dépôt — jusqu'ici, la seule route d'écriture
(`/api/lancer`, étape D) ne transportait qu'une **clé** choisie dans une
liste fermée (ADR-0005), jamais un texte libre. Deux routes nouvelles :
`POST /api/spec/brouillon` (fabrique un brouillon, n'écrit rien) et
`POST /api/spec/ecrire` (écrit dans `specs/features/todo/`).

Le cycle a tranché sept questions de conception (journal de bord de
`specs/features/doing/feature-008-creation-de-spec-depuis-un-prompt.md`,
étape 2), a été soumis deux fois au GATE sécurité (P1 puis P2), et a corrigé
en cours de route un défaut central : la première implémentation régénérait
le contenu au lieu d'écrire celui que l'humain avait relu et corrigé. Ces
décisions engagent les étapes F (discussion par spec) et G (scénario complet
avec échec réel) à venir, et ne sont pas lisibles dans le code une fois
prises — elles remplissent les critères 1 (contrainte structurante), 2
(décision invisible dans le code), 3 (alternatives crédibles écartées) et 4
(verrouillage long terme) du dossier `docs/adr/README.md`.

## Décision

### 1. La frontière : l'outil écrit, il ne valide jamais

Le centre de contrôle peut désormais **écrire un fichier** dans
`specs/features/todo/`. Il ne fait rien de plus : il ne déplace aucune spec
entre répertoires (`spec-reader` et la session principale restent seuls
maîtres de la promotion, ADR-0003), il ne coche aucune case, il n'exécute
aucun agent sur le fichier produit. La relecture humaine avant écriture
n'est pas une option d'ergonomie : c'est la seule garde qui empêche une
spec **générée et jamais relue** de porter la forme d'une spec vraie — un
danger documentaire explicitement nommé par la spec elle-même (« Notes pour
agent »). Cette frontière engage les étapes F et G : aucune extension
future de ce module ne doit lui faire franchir la ligne qui sépare
« préparer un fichier » de « décider qu'il est bon ».

### 2. Aucun appel de modèle

Le brouillon est le template du projet (`specs/features/_template.md` ou
`specs/modele.md`) recopié **octet pour octet**, à l'exception de six
substitutions déterministes (slug, type, statut, date, titre H1, texte
saisi dans la section idoine). Tout ce que le texte ne permet pas de
déduire reste `[remplir]`.

**Conséquence** : le texte saisi ne quitte jamais le poste qui héberge le
centre de contrôle — aucune requête réseau vers un service de modèle. Le
plafond de dépense de `feature-007` (`budget_max_usd`) est **sans objet**
ici : il n'y a rien à facturer.

**Alternative écartée** : un appel de modèle aurait rempli davantage de
blocs (contexte, critères d'acceptation plausibles). Écartée pour deux
raisons cumulatives : (a) elle ferait sortir le texte saisi — potentiellement
porteur d'un secret ou d'une donnée personnelle collée par inadvertance —
vers un tiers ; (b) elle remplacerait des `[remplir]` honnêtes par du
contenu plausible, ce que les « Notes pour agent » de la spec interdisent
explicitement : « une génération qui invente des contraintes ou des
critères d'acceptation plausibles empoisonne cette discipline à la racine ».

### 3. Un verrou court dédié, pas le verrou d'écrivain de `feature-007`

La numérotation (`NNN`) et l'écriture du fichier sont protégées par un
`flock` court et dédié (`var/numerotation.lock`), tenu seulement le temps
de scanner les trois répertoires du cycle et d'écrire le fichier — jamais
le temps d'une requête réseau.

**Alternative écartée** : réutiliser `verrou.py`, l'écrivain unique de
`feature-007` (garde-fou 2 de l'étape D). Écartée pour trois raisons
mesurées, pas supposées :
- ce verrou est taillé pour des lancements de **plusieurs minutes** (un
  processus fils suivi tout du long) ; l'écriture d'une spec dure une
  fraction de seconde — un modèle de verrou pensé pour l'un serait mal
  taillé pour l'autre ;
- sa méta `pid_fils`/`starttime` (détection d'orphelin par `/proc`) est
  **sans objet** ici : il n'y a pas de processus fils à surveiller ;
- son `409` d'orphelin (verrou tenu par un détenteur disparu) n'est
  **levable par aucun chemin de l'interface actuelle** — `bug-011`, déjà
  ouvert, documente que `/api/interrompre` répond `404` dans ce cas. Prendre
  ce verrou aurait rendu la création de spec **inatteignable après un crash
  serveur avec verrou orphelin**, et aurait fait entrer `bug-011` dans ce
  cycle au titre d'ADR-0017 (« un défaut qui rend inatteignable la garde
  livrée entre dans le cycle qui la livre »). Le verrou dédié n'a pas cette
  méta, donc pas cette panne : un `flock` court sans détection d'orphelin,
  budgété à 2 s, rend `503` explicite en cas d'indisponibilité plutôt que de
  bloquer indéfiniment.

### 4. Bornes de corps par route, table fermée

`_TAILLES_MAX_CORPS` fixe une borne par route d'écriture, en supplément du
défaut historique (4096 octets, inchangé pour `/api/lancer` et
`/api/interrompre`) :

| Route | Borne | Justification |
|---|---|---|
| `/api/spec/brouillon` | 8192 octets | titre + texte saisi, jamais le contenu déjà fabriqué |
| `/api/spec/ecrire` | 65536 octets | 1,93× la plus grande spec mesurée dans ce dépôt (33 212 octets) — large marge pour un besoin en texte libre, jamais un chèque en blanc |

**Ce que ça verrouille** : toute route d'écriture future qui accepte un
corps plus grand qu'une clé de commande doit déclarer sa propre entrée dans
cette table, jamais relever du défaut ni d'une constante ad hoc dans le
handler de la route.

### 5. Condition 2 du GATE P2 : l'escalade ne protège que le brouillon

L'escalade fail-closed (un mot-clé sensible — auth, permission, personnel,
paiement, migration — bascule toujours vers le template complet, ne
l'annule jamais) n'agit que sur `POST /api/spec/brouillon`. `POST
/api/spec/ecrire` reçoit et écrit un **contenu arbitraire**, non validé
contre un gabarit ni contre la présence des blocs Sécurité ou des cases
GATE — rien n'empêche un client d'appeler `/ecrire` directement, sans
jamais être passé par `/brouillon`.

**C'est acceptable** parce que le porteur du jeton est déjà, par
construction, l'opérateur complet du centre de contrôle (ADR-0020,
permission binaire : qui a le jeton peut tout faire de ce que ce serveur
expose, il n'existe pas de rôle intermédiaire). La garde qui compte n'a
jamais été et ne devient pas le serveur — **c'est la relecture, par
`spec-reader` puis par l'humain**, au moment où la spec est promue de
`todo/` vers `doing/`. Faire porter cette validation au serveur créerait une
fausse garantie : une spec qui « passe » la validation serveur n'est pas
pour autant une spec dont le contenu est juste.

### 6. La cible d'écriture est la première colonne configurée, pas littéralement `todo`

`ecrire_sous_verrou` calcule la cible par `colonnes()[0][0]` — la **première
colonne déclarée** dans la configuration du projet, jamais la chaîne
littérale `"todo"`. Sur ce dépôt, la première colonne s'appelle `todo` ; un
projet qui réordonnerait ses colonnes (ou nommerait sa première colonne
autrement) verrait `/api/spec/ecrire` écrire ailleurs, sans qu'aucun message
ne le signale comme une anomalie — c'est le comportement voulu (aucune
donnée de requête n'entre dans le calcul du chemin, feature-008 §Confinement
et Sécurité de la spec), mais une réserve relevée en revue de code : le nom
de la fonction et sa documentation doivent continuer à dire « première
colonne », jamais « todo », pour qu'une relecture future ne suppose pas à
tort une chaîne en dur.

### 7. Le contenu relu est écrit verbatim — l'arbitrage central du cycle

La première implémentation de `POST /api/spec/ecrire` recevait `{type,
titre, texte, minimal}` et **régénérait** le contenu depuis ces champs,
exactement comme `/api/spec/brouillon`. Mesuré sur copie jetable pendant le
cycle (journal de bord, étape 5a — agent principal) : une correction faite
par l'humain dans le champ de relecture — présente dans le brouillon relu —
**disparaissait du fichier écrit**, remplacée par une régénération qui
ignorait purement et simplement le texte corrigé.

Ce défaut provenait d'une **sur-application** de la condition 1 du GATE P1
(« design »), qui posait que `type` et `slug` doivent être des champs
serveur re-validés, jamais lus dans le Markdown — une garde sur le
**chemin**, pas sur le **contenu**. L'implémentation avait étendu cette
garde au contenu tout entier, en refusant tout contenu transmis par le
client.

**Décision retenue** : `POST /api/spec/ecrire` prend un champ `contenu`
distinct, écrit **verbatim**, à l'octet près. `type` et `titre` restent des
champs JSON dédiés, re-validés contre l'enum fermé et re-dérivés (le slug —
donc le chemin — est recalculé depuis `titre`, jamais lu dans `contenu`) :
la condition 1 du GATE P1 reste tenue à la lettre, parce qu'elle n'a jamais
porté que sur le chemin. Un `contenu` absent, vide, non-chaîne ou trop long
est un `422` explicite — jamais un repli silencieux sur une régénération.

**Pourquoi l'écrire ici** : sans cette clarification, « le brouillon est
affiché intégralement et modifiable avant toute écriture » — l'exigence
même de la spec — serait un mensonge d'interface : un champ que
l'utilisateur peut modifier sans que sa modification ne survive à
l'écriture est une relecture décorative, pas une relecture. Le défaut a
coûté une reboucle complète de l'étape 5 (backend puis frontend), documentée
dans le journal de bord ; il ne doit pas se reproduire par une future
« simplification » qui reviendrait à régénérer depuis les champs bruts.

## Alternatives considérées

- **Un appel de modèle pour fabriquer le brouillon** — écartée, voir
  décision 2.
- **Réutiliser le verrou d'écrivain de `feature-007`** — écartée, voir
  décision 3.
- **Valider le contenu écrit contre un schéma ou une liste de blocs
  obligatoires, côté serveur** — écartée : le serveur n'a aucun moyen
  fiable de distinguer un `[remplir]` honnête d'un bloc rempli à tort, ni
  de juger la pertinence d'un critère d'acceptation. Formaliser cette
  validation aurait déplacé la garde réelle (la relecture humaine) vers une
  fausse garantie automatisée.
- **Régénérer le contenu à l'écriture depuis les champs structurés** —
  écartée après l'avoir livrée et défaite en cours de cycle, voir
  décision 7.

## Conséquences

### Positives

- Le texte saisi par l'utilisateur ne sort jamais du poste : aucune surface
  d'exfiltration nouvelle, aucun coût à plafonner.
- La relecture humaine reste la seule garde de fond sur le contenu, ce qui
  évite la fausse sécurité d'une validation serveur partielle.
- Le verrou dédié rend la création de spec disponible même si `verrou.py`
  est occupé par un lancement en cours, et ne peut pas se retrouver bloqué
  par un orphelin de processus qui n'existe pas dans ce flux.

### Négatives

- `POST /api/spec/ecrire`, pris isolément (sans être passé par
  `/brouillon`), peut écrire n'importe quel contenu Markdown dans `todo/` —
  y compris un contenu qui ne respecte aucun bloc du template. C'est
  assumé (décision 5), pas corrigé.
- La cible `colonnes()[0][0]` est correcte pour ce dépôt mais silencieuse
  sur un projet qui réordonne ses colonnes (décision 6) : aucun message ne
  distingue ce cas d'une mauvaise configuration.
- Deux verrous de fichiers coexistent désormais dans le module
  (`verrou.py` pour les lancements, `numerotation.lock` pour les specs),
  chacun avec sa propre sémantique — une lecture future du module doit
  savoir laquelle s'applique où.

### Ce que ça verrouille

- Aucune route d'écriture future de ce module ne doit faire d'appel de
  modèle sans rouvrir explicitement cette décision (et, avec elle, le
  plafond de dépense de `feature-007`).
- Le contenu transmis à `/api/spec/ecrire` restera écrit verbatim : toute
  évolution qui réintroduirait une régénération partielle ou totale doit
  d'abord relire cet ADR §7.
- La relecture humaine reste, et doit rester, la seule garde de contenu.
  Ajouter une validation serveur du contenu écrit constituerait un
  changement de posture de sécurité, pas un simple ajustement — il
  reviendrait sur la décision 5 et mériterait son propre ADR.

## Références

- Code : `control-center/backend/redaction_spec.py`,
  `control-center/backend/server.py` (`_ROUTES_ECRITURE`,
  `_TAILLES_MAX_CORPS`, `_spec_brouillon`, `_spec_ecrire`).
- Spec : `specs/features/doing/feature-008-creation-de-spec-depuis-un-prompt.md`
  (journal de bord, étapes 2, 3, 5a, 5a bis, 6, 5a ter, 8, 8 bis).
- ADR liés : `docs/adr/0003-colonne-spec-depuis-repertoire.md` (la promotion
  reste hors de ce module), `docs/adr/0004-centre-controle-sans-route-ecriture.md`
  et `docs/adr/0019-jeton-comme-unique-barriere-et-table-des-routes-fermee.md`
  (table fermée des routes d'écriture, dont ce lot porte le compte à quatre),
  `docs/adr/0020-un-centre-de-controle-appartient-a-un-developpeur.md`
  (permission binaire du porteur du jeton), `docs/adr/0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md`
  (motif de l'exclusion de `verrou.py`, `bug-011`).
