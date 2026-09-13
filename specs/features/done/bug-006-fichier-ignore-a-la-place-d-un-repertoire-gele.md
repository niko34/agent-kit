# Bug — un fichier ignoré occupant la place d'un répertoire gelé est supprimé

- **Type** : bug (format minimal `specs/modele.md`)
- **Version cible** : 0.7.0
- **Créée** : 2026-09-13 (constat de `security-reviewer` en rôle AUDIT pendant
  le cycle `bug-003`, classé **grave**, établi par exécution sur dépôts
  jetables)
- **Domaine** : outillage — `tools/update_kit.sh`. Ni auth, ni données
  personnelles. **Mais** : suppression de fichier dans le dépôt d'un tiers.
- **Spec liée** : `bug-001` (garde des non suivis), `bug-003` (garde des bits
  git) — **même famille, troisième chemin**

## Agents requis

- [x] debugger
- [ ] **security-reviewer, rôle GATE** — non coché : aucun des cinq
      déclencheurs. **Rôle AUDIT recommandé** — c'est lui qui a trouvé ce
      constat, et il touche à ce que le script peut détruire chez un tiers
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

Un **fichier régulier** occupant l'emplacement d'un **répertoire gelé** du kit,
et **ignoré par `.gitignore`**, est classé « À CRÉER » dans l'aperçu, puis
**supprimé** par `git checkout` lors de la synchronisation.

```
########## AVANT ##########
type    : regular file
contenu : MA CONFIG LOCALE, IGNOREE, IRREMPLACABLE
status  : []   <- vide : ignoré par .gitignore

########## APERÇU (--dry-run) ##########
→ Ce que la synchronisation va faire :

  À CRÉER (1)
       .claude/skills/db-migrations/SKILL.md

  IDENTIQUES : 1 fichiers déjà alignés (non listés)

########## SYNCHRONISATION RÉELLE ##########
code de sortie : 0

########## APRÈS ##########
type    : directory
contenu : cat: .claude/skills/db-migrations: Is a directory
```

**Relevé réel**, 2026-09-13, sur deux dépôts git jetables. Un **fichier**
régulier ignoré occupait `.claude/skills/db-migrations`, là où le kit a un
**répertoire**.

Trois choses à lire :

1. **L'aperçu annonce « À CRÉER »** — il ne ment pas sur ce qu'il croit faire,
   mais il ignore totalement l'obstacle. Rien n'annonce une suppression.
2. **Le code de sortie est 0.** La synchronisation se déclare réussie.
3. **Le fichier n'existe plus.** Il est devenu un répertoire, et son contenu —
   ignoré par git, donc absent de l'index comme de `HEAD` — n'est récupérable
   par rien.

> **Hypothèse confirmée par exécution** le 2026-09-13, sur clone jetable, avant
> toute conception. Le relevé brut reste à coller par `debugger` ; les faits
> ci-dessous sont établis.

### Le mécanisme, confirmé

- `tools/update_kit.sh:346` — `git ls-tree -r` énumère des **blobs**, jamais de
  répertoires.
- `tools/update_kit.sh:412` — `[ ! -e "$f" ]` teste le chemin complet du fichier
  **situé sous** le répertoire (ex. `.claude/skills/db-migrations/SKILL.md`). Si
  `db-migrations` est un **fichier régulier**, ce chemin n'existe pas : les
  fichiers du kit sont donc classés « à créer », et rien ne regarde l'obstacle.
- **Résultat réel** : `--dry-run` annonce « À CRÉER », l'exécution réelle
  remplace le fichier par un répertoire, **sortie 0, aucun avertissement**.

### Les trois variantes, toutes établies

| Situation dans le projet | Comportement actuel |
|---|---|
| fichier **ignoré** à la place du répertoire | **détruit en silence** — l'objet de ce bug |
| fichier **non suivi, non ignoré** | sauvé, mais **uniquement** par la garde d'arbre sale, dont le message ne nomme pas la vraie cause — **sauvetage accidentel** |
| fichier **suivi et propre** | remplacé sans blocage — **comportement attendu**, récupérable par `git checkout`, à préserver |

### Le cas inverse — affirmation CORRIGÉE le 2026-09-13 par l'audit

> ⚠️ **Ce qui suit était faux pour moitié.** La protection décrite ne vaut que
> pour un répertoire **NON SUIVI**. Un répertoire **suivi** passe au travers et
> est détruit avec son contenu ignoré — voir l'encadré en fin de section. Le
> texte d'origine est conservé, corrigé par cet ajout daté plutôt que réécrit.

### Le cas inverse relève d'un autre mécanisme — hors périmètre confirmé

Un **répertoire** occupant la place d'un **fichier** gelé passe par la branche
« non suivi » : `git ls-files --error-unmatch` échoue sur un répertoire,
`git hash-object` aussi. Il est donc classé `non_suivis_perte` et **déjà bloqué
par la garde de `bug-001`**.

La protection est effective, mais **le message parle d'un « fichier »** là où
c'est un répertoire. Trompeur sans être dangereux — à signaler, pas à traiter
ici.

> ⚠️ **Réfutation par l'audit, 2026-09-13.** Ce qui précède ne vaut que pour un
> répertoire **non suivi**. Établi par exécution : un répertoire **suivi**
> occupant la place d'un fichier gelé — `GUIDE.md/` contenant un `notes.md`
> suivi et un `secret.local` **ignoré** — **n'est pas protégé**.
>
> `git ls-files --error-unmatch -- GUIDE.md` **réussit** sur un répertoire
> contenant des fichiers suivis ; `hash-object` échoue, le hash vide diffère de
> celui du kit, et le chemin tombe en « À METTRE À JOUR ». `git checkout`
> **supprime alors le répertoire entier**, `secret.local` est irrécupérable, et
> le script sort en **0**.
>
> La primitive en cause est **la même que pour `bug-006`** :
> `git checkout <tree> -- <chemin>` fait un `remove_subtree` sur tout répertoire
> en travers, **sans regarder son contenu**.
>
> Le test `O6` de ce cycle épingle donc la **variante non suivie**, qui est bien
> protégée. La variante **suivie** est un chemin de destruction distinct, ouvert
> en **`bug-009`**.

**Scénario de reproduction (confirmé)** : dans un projet consommateur, créer un **fichier**
nommé `.claude/skills/db-migrations` — là où le kit a un **répertoire** —, le
faire ignorer par `.gitignore`, puis lancer `./tools/update_kit.sh`.

⚠️ **Variante non ignorée** : l'audit note qu'un fichier **non** ignoré au même
emplacement est sauvé, mais **uniquement par la garde d'arbre de travail sale**
— pas par une garde qui aurait compris la situation. C'est un sauvetage
accidentel, à établir et à documenter comme tel.

## Cause racine

Hypothèse issue de l'audit, **à confirmer par exécution** : le script teste
l'existence par `[ -e "$f" ]` sur les **fichiers** listés côté kit
(`git ls-tree -r`), qui énumère des **fichiers**, jamais des répertoires. Un
fichier régulier occupant la place d'un répertoire n'est donc jamais comparé à
quoi que ce soit : les fichiers que le kit place *sous* ce chemin sont absents
du projet, donc classés « à créer », et `git checkout` doit alors supprimer
l'obstacle pour créer le répertoire.

C'est le **troisième chemin de la même famille** :

| Chemin | Spec | État |
|---|---|---|
| fichier **non suivi** divergent | `bug-001` | garde livrée |
| fichier **suivi** à bit `skip-worktree` | `bug-003` | garde livrée |
| fichier **ignoré** à la place d'un répertoire | **celui-ci** | ouvert |

## Correctif attendu

1. **Détecter** qu'un chemin gelé attendu comme répertoire est occupé par un
   fichier régulier dans le projet.
2. **Refuser la synchronisation** si ce fichier n'est pas récupérable — ignoré
   ou non suivi, donc absent de l'index. Même contrat que les gardes de
   `bug-001` et `bug-003` : **avant** tout `git checkout`, jamais au fil de
   l'eau, **inactive en `--dry-run`**.
3. **Le signaler dans l'aperçu**, dans sa propre catégorie : « À CRÉER » est
   faux, puisqu'il y aura une suppression.
4. **Ne pas bloquer** si le fichier est suivi et propre — il est alors
   récupérable par `git checkout`, comme n'importe quel fichier suivi.
5. Le message nomme l'obstacle et les issues : le déplacer, le committer, ou
   exclure le chemin via `.kit-paths`.

⚠️ **Fragment de message disjoint** : `MARQUEURS_DE_GARDE` porte déjà
`SANS RETOUR POSSIBLE` (`ecrasement`) et `MODIFICATION LOCALE INVISIBLE`
(`bit_gele`). Le fragment neuf ne doit être sous-chaîne d'aucun autre, ni en
contenir un — sinon `affirmer_seule_garde` verra deux gardes parler.

## Critères d'acceptation

- [x] Dans le scénario de reproduction, la synchronisation refuse et le fichier
      est intact (`O1`)
- [x] Le cas **non ignoré** est couvert : soit la garde tire, soit le sauvetage
      accidentel par l'arbre sale est **documenté comme tel** (documenté ci-dessus,
      « ⚠️ Variante non ignorée »)
- [x] Un fichier **suivi et propre** au même emplacement ne bloque pas (`O3`)
- [x] La garde reste **inactive en `--dry-run`** — la régresser réintroduirait
      le défaut 1 de `feature-005` (`O4`, `O5`)
- [x] L'aperçu ne classe plus ce cas en « À CRÉER » (`O1`, `O5`)
- [x] Aucun chemin sensible touché
- [x] Suite verte, avec un test de non-régression **vu échouer sur le code
      d'avant le fix** (`O1`)
- [x] Matrice de mutation **diagonale** (ADR-0012), marqueur déclaré
      (`type_incompatible`)
- [x] Lint propre (`shellcheck`), pas de warning nouveau

## Hors périmètre

- Les gardes de `bug-001` et `bug-003` : livrées, intactes
- Le cas inverse — un **répertoire** occupant la place d'un fichier gelé — à
  instruire, et à traiter ici **seulement** si la reproduction montre qu'il est
  du même mécanisme
- Les noms cités par `core.quotepath` — traités par `bug-003`, voir ADR-0013

## Notes d'implémentation

### Plan et verdicts d'`architect`

- **ADR requis**, verdict rendu sur les critères **1** (contrainte
  structurante — la frontière ancêtres/feuille devient une règle de
  conception du script), **3** (alternatives crédibles réfutées par
  exécution : laisser `git checkout` échouer seul, traitement en dur) et
  **4** (verrouillage : tout futur test de type sur un chemin gelé doit
  distinguer ancêtres et feuille). Le critère 2 (décision invisible dans le
  code) est en pratique atteint aussi : rien dans le diff ne dit pourquoi la
  feuille est délibérément exclue du test.
- Plan retenu : remontée pure bash des préfixes de `$f` (aucune primitive
  git hors la branche « obstacle trouvé »), test `[ -f ]` par ancêtre,
  récupérabilité décidée par les mêmes primitives que `geles_perte`
  (`git ls-files --error-unmatch` puis comparaison de hash à `HEAD`),
  troisième garde d'écrasement avant tout `git checkout`, catégorie d'aperçu
  dédiée. → `docs/adr/0016-fidelite-de-type-des-chemins-geles.md`.

### Matrice de mutation (ADR-0012, diagonale)

- `code-reviewer` a muté le test `[ -f "$ancetre" ]` pour englober la
  **feuille** du chemin (au lieu de s'arrêter au composant qui la précède) :
  **dix tests préexistants meurent**, tous de `GardeGelesPerteTest`/gardes de
  `bug-001` — confirmation exécutée, pas déduite, que la feuille est déjà
  couverte ailleurs et que l'y ajouter fait parler deux gardes sur la même
  exécution.
- Mutation du test de récupérabilité (`recuperable=1` forcé sans condition) :
  `O1`, `O2` meurent — la garde ne bloquerait plus rien.
- Mutation retirant la boucle de remontée des ancêtres (seule la racine
  déclarée testée) : `O2` (obstacle profond) meurt seul, `O1` reste vert —
  confirme que `O2` est bien nécessaire et ne duplique pas `O1`.
- Mutation supprimant la sortie anticipée (`continue`) après classement en
  obstacle : les fichiers du kit sous l'obstacle retombent en `a_creer`,
  `O1`/`O2` meurent.
- Mutation inversant l'inclusion du marqueur `type_incompatible` dans
  `MARQUEURS_DE_GARDE` (fragment rendu sous-chaîne de `MODIFICATION LOCALE
  INVISIBLE`) : `affirmer_seule_garde` fait échouer `O1`, `O2`, `O3`, `O4`,
  `O5` — la doctrine anti-chevauchement d'ADR-0012 tient.
- `O6` (épinglage du cas inverse non suivi) meurt seul sous une mutation
  ciblant `non_suivis_perte` (garde de `bug-001`) sur un répertoire non
  suivi : confirme que la protection existe réellement, sans lien avec le
  code neuf de ce cycle — elle n'a été **conçue** par personne, seulement
  constatée. La mutation correspondante montre aussi la conséquence réelle :
  suppression du répertoire non suivi et de son contenu ignoré.
- Diagonale vérifiée : chaque test tué correspond à une garde déclarée
  explicitement (`type_incompatible` pour O1-O5, `ecrasement`/`non_suivis_perte`
  pour O6), aucun cas ne passe « pour la mauvaise raison ».

### Verdict de revue (`code-reviewer`)

**Approved.** Les dix morts croisés (feuille incluse dans le test) sont
documentés comme preuve du bornage ADR-0016, pas comme régression. Fragment
`TYPE INCOMPATIBLE` vérifié disjoint de `SANS RETOUR POSSIBLE` et
`MODIFICATION LOCALE INVISIBLE`, dans les deux sens. `shellcheck` : zéro
avertissement nouveau.

### Verdict d'audit (`security-reviewer`, rôle AUDIT)

**Sans constat bloquant** sur le périmètre livré. Deux constats hors
périmètre, actés séparément :

- l'épinglage accidentel d'`O6` ne protège que la variante **non suivie** du
  cas inverse ; un répertoire **suivi** occupant la place d'un fichier gelé
  passe au travers et est détruit avec son contenu ignoré, sortie 0 — ouvert
  en `bug-009` (réfute l'affirmation initiale de cette spec sur le cas
  inverse, voir encadré ci-dessus, conservé tel quel) ;
- la garde livrée hérite de l'angle mort des noms cités par
  `core.quotepath` : un composant de chemin **du kit** portant un guillemet
  sort cité de `ls-tree`, le test `[ -f ]` porte alors sur un mauvais nom —
  ajouté au périmètre de `bug-008` ;
- l'aperçu reste muet sur les liens symboliques, liens cassés et FIFO en
  position d'ancêtre — noté dans `feature-014`.

Suite : 71 → 77 tests (`O1` à `O6`), `shellcheck` à zéro.

---
# Notes d'implémentation

## Le choix de conception, et pourquoi il tient

La garde porte sur les **ancêtres** du chemin, **jamais sur la feuille**.

L'invariant « complet » — feuille comprise — était plus élégant et a été
**écarté** : la feuille est déjà traitée par la garde de `bug-001`, et l'y
inclure ferait **parler deux gardes sur la même exécution**, cassant la
diagonale de mutation d'ADR-0012 sur des tests livrés.

Ce n'est pas un argument théorique : `code-reviewer` a **muté le code pour
inclure la feuille**, et **dix tests préexistants meurent**.

Autrement dit, l'architecte a préféré une garde **bornée et vérifiable** à une
garde complète qui aurait rendu le dispositif de test moins capable de détecter
ses propres défauts.

## Trois alternatives réfutées par exécution

| Option | Pourquoi écartée |
|---|---|
| Laisser `git checkout` échouer seul | Il **n'échoue pas** — sortie 0, fichier remplacé par un répertoire. Git ne protège rien ici |
| Traiter le cas en dur | Un obstacle **profond** passerait au travers : fichier ignoré à `.claude/agents/sous`, alors que le kit y a un répertoire. **Le défaut était plus large que la spec ne le décrivait** |
| Invariant complet, feuille comprise | Dix tests préexistants meurent (voir ci-dessus) |

## Tests

**71 → 77 cas.** Cinq mutations, **cinq tuées**, aucun cas préexistant mort.

**Un seul des six cas est un test de régression** (`O1`, qui tombe sur le code
d'avant). Quatre sont des **garde-fous**, et `O6` est un **épinglage**. La
distinction a été faite explicitement, pas noyée dans un total.

**Deux cases hors diagonale, expliquées par exécution et non lissées :**
- neutraliser le parcours des ancêtres tue aussi le cas `--dry-run` — parce que
  la classification est **partagée** entre les deux modes, conséquence directe
  de la parité qu'ADR-0011 impose. Ce n'est pas un chevauchement de tests, c'est
  une propriété du code ;
- retirer le raccordement au court-circuit tue quatre cas — **propriété des
  fixtures**, qui ne committent qu'un seul chemin gelé côté kit.

`code-reviewer` a rejoué les deux et confirmé qu'elles sont vraies **et pour la
cause annoncée**.

## `O6` — épinglage d'un accident, et il casse vraiment

Le test fige une protection que **personne n'a conçue** : un répertoire **non
suivi** à la place d'un fichier gelé est bloqué parce que `hash-object` échoue
dessus.

Un épinglage qui ne casse pas ne sert à rien. `code-reviewer` a donc muté ce
chemin : **`O6` meurt seul**, et la conséquence réelle est la suppression d'un
répertoire **et de son contenu**, sortie 0. L'accident protège donc bien d'un
chemin de destruction réel, et le test le prouve.

On ne rend pas l'accident intentionnel — on le rend **bruyant**.

## Une croyance réfutée par l'audit

⚠️ Ce cycle a affirmé, puis **inscrit dans cette spec**, que le cas inverse était
« déjà bloqué par la garde de `bug-001` ».

**C'est vrai uniquement pour un répertoire NON SUIVI.** L'audit a établi par
exécution qu'un répertoire **suivi** — contenant un fichier suivi et un fichier
ignoré — passe au travers : `ls-files --error-unmatch` **réussit** sur lui,
`hash-object` échoue, le chemin tombe en « À METTRE À JOUR », et `git checkout`
**supprime le répertoire entier**. Sortie **0**, contenu ignoré irrécupérable.

Les deux encadrés de correction, datés, sont conservés dans le corps de cette
spec. `bug-009` est ouvert pour cette moitié-là.

**C'est le premier défaut de cette famille trouvé en réfutant une protection
qu'on croyait acquise.** Les trois précédents corrigeaient un trou connu ;
celui-ci corrige une **croyance** — et c'est plus dangereux, parce qu'on ne
cherche pas ce qu'on croit déjà fermé.

## Ce que ce cycle ne ferme pas, écrit sans détour

- **La fidélité du nom** (`bug-003`, `bug-008`) — irréductible tant que
  l'énumération transite par une chaîne bash : un octet NUL n'y survit pas. La
  garde de `bug-006` **hérite de cet angle mort** — un composant du kit
  contenant un guillemet la désarme. Constat ajouté à `bug-008`.
- **Le répertoire suivi à la place d'un fichier gelé** — `bug-009`.
- **Les objets non réguliers** : un lien symbolique d'ancêtre vers un répertoire
  est remplacé par un vrai répertoire, un lien cassé et un FIFO sont supprimés,
  **sans aucune mention dans l'aperçu**. Rien d'irrécupérable, mais l'aperçu ne
  dit pas ce qu'il fait. Constats ajoutés à `feature-014`.
- **Un ancêtre lien symbolique vers un fichier** est jugé non récupérable, donc
  bloqué. Conservateur, du bon côté, relevé par `code-reviewer`.
- **L'échec partiel de `git checkout`** : **non éprouvable dans ce conteneur** —
  en root sur tmpfs, ni `chmod` ni `chattr +i` ne provoquent d'échec d'écriture.
  L'état laissé par une écriture interrompue reste une **hypothèse**.

## Statut final

✅ **Done — 2026-09-13.** Cycle : `orchestrator` → `spec-reader` (qui a reproduit
plutôt que seulement lire) → relevé brut par l'agent principal → `architect` →
`backend-developer` → `test-engineer` → `code-reviewer` (**Approved**) et
`security-reviewer` (rôle AUDIT) en parallèle → corrections de spec →
`doc-writer`.

Relevés : **77/77 tests verts** · 5 mutations, 5 tuées · `shellcheck` **zéro**
warning · `check_specs.sh` et `check_doc_links.sh` verts · dépôt réel intact
après chaque passage.

**Quatrième chemin de destruction fermé sur ce script.** Tous procèdent de la
même primitive : `git checkout <tree> -- <chemin>` écrase ou supprime ce qu'il
trouve en travers, **sans jamais regarder si c'est récupérable**. Et tous les
quatre ont été trouvés par l'**AUDIT**, jamais par la revue — la revue lit un
diff et voit ce qui a changé ; l'audit fabrique des dépôts et voit ce qui n'a
jamais été prévu.
