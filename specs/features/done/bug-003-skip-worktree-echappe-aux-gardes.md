# Bug — un fichier marqué `skip-worktree` est écrasé sans qu'aucune garde ne le voie

- **Type** : bug (format minimal `specs/modele.md`)
- **Version cible** : 0.6.0
- **Créée** : 2026-09-12 (trouvé par `security-reviewer` en rôle AUDIT, pendant le
  cycle de bug-001 ; établi par expérience sur dépôts jetables, pas par lecture)
- **Domaine** : outillage — `tools/update_kit.sh`. Ni auth, ni données
  personnelles. **Mais** : destruction silencieuse de travail non committé dans
  le dépôt d'un projet tiers.
- **Spec liée** : bug-001 (même défaut, autre bit — la garde livrée là ne couvre
  pas ce cas), feature-006 (harnais de test)

## Agents requis

- [x] debugger
- [ ] **security-reviewer, rôle GATE** — non coché : aucun chemin sensible au
      sens des déclencheurs (auth, permissions, données personnelles,
      migration). Le constat vient néanmoins de son rôle AUDIT, et un
      repassage en AUDIT après correctif est souhaitable
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

Un fichier suivi par git mais marqué `git update-index --skip-worktree` (ou
`--assume-unchanged`) est **écrasé par la synchronisation**, alors que son
contenu local n'a jamais été committé. Aucune des trois gardes du script ne le
voit passer.

```
########## ÉTAT AVANT ##########
contenu local  : MON TRAVAIL LOCAL, JAMAIS COMMITE, IRREMPLACABLE
bit posé       : S .claude/agents/architect.md
git status     : []  <- VIDE : l'arbre paraît propre

########## APERÇU ##########
→ Ce que la synchronisation va faire :

  À METTRE À JOUR (1)
       .claude/agents/architect.md

  IDENTIQUES : 1 fichiers déjà alignés (non listés)

########## APRÈS SYNCHRONISATION RÉELLE ##########
contenu local  : agent architecte VERSION DU KIT
```

**Relevé réel**, obtenu le 2026-09-13 sur deux dépôts git jetables : un faux
kit, un faux projet dont `.claude/agents/architect.md` porte du travail local
**jamais committé**, suivi de `git update-index --skip-worktree` sur ce fichier.

Trois choses à lire dans ce relevé :

1. **`git status --porcelain` est vide** — c'est tout l'effet du bit
   `skip-worktree`. La garde d'arbre de travail propre
   (`tools/update_kit.sh:191`) ne voit donc rien et laisse passer.
2. **L'aperçu ne ment pas** : « À METTRE À JOUR » est exact. Mais rien n'y
   distingue *rattrapable par un `git checkout`* de *perdu à jamais*. C'est la
   différence qui compte ici, et elle n'est pas dite.
3. **Le contenu local a disparu**, remplacé par celui du kit, sans un mot.

**Scénario de reproduction (confirmé)** : dans un projet consommateur, prendre un chemin
gelé du kit, le modifier localement sans committer, puis
`git update-index --skip-worktree <chemin>`. Lancer `./tools/update_kit.sh`.
La synchronisation s'exécute et le contenu local disparaît.

### Les deux bits, et ce que fait réellement `git checkout` (git 2.47.3)

| | `git ls-files -v` | `git status --porcelain` | `checkout` écrase ? | le bit survit ? |
|---|---|---|---|---|
| `skip-worktree` | `S` | vide | **oui** | **non**, retombe à `H` |
| `assume-unchanged` | `h` (minuscule) | vide | **oui** | **non**, retombe à `H` |

Trois faits établis par exécution, qui orientent le correctif :

1. **Les deux bits se comportent identiquement** ici — la spec le supposait, c'est
   vérifié, et les deux doivent donc être couverts.
2. **La détection par fichier est fiable** : `git ls-files -v -- "$f"` distingue
   les deux cas (majuscule / minuscule), et `git hash-object` fonctionne sur le
   fichier de l'arbre **même avec le bit posé** — la comparaison à `HEAD:$f` est
   donc praticable, fichier par fichier, indépendamment du mode `--dry-run`.
3. **Le dégât est total** : `git checkout` écrase le contenu **et** efface le
   bit. Après coup, il ne reste aucune trace de l'intention de l'utilisateur —
   ni le travail, ni le marqueur qui disait « ne touche pas à ce fichier ».

## Cause racine

Les trois gardes du script regardent chacune ailleurs :

1. **Garde d'arbre de travail sale** (`tools/update_kit.sh:160`) — repose sur
   `git status --porcelain`, qui **ignore délibérément** les fichiers marqués
   `skip-worktree` / `assume-unchanged`. C'est tout l'objet de ces bits.
2. **Garde d'écrasement des non suivis** (livrée par bug-001) — ne regarde que
   les fichiers **non suivis**. Or ceux-ci sont suivis : ils lui échappent.
3. **Classification de l'aperçu** (livrée par bug-001) — compare
   `git hash-object` du fichier local au blob du kit. Le hash diverge, donc le
   fichier est classé « à mettre à jour » : la sortie est honnête, mais elle
   ne signale pas que le contenu local n'est **récupérable par aucun
   `git checkout`**, n'ayant jamais été committé.

C'est exactement le défaut de bug-001 — du travail irremplaçable détruit par
une garde qui regarde le mauvais bit — sur un autre chemin. bug-001 a bouché le
trou « non suivi » ; celui-ci reste ouvert.

## Correctif attendu

1. Dans la classification (`tools/update_kit.sh`, boucle de classification
   livrée par bug-001), comparer aussi le hash local à `HEAD:$f`. Si les deux
   diffèrent alors que `git status --porcelain` est propre, le fichier porte
   une modification locale invisible : le classer dans une catégorie propre et
   le traiter comme le cas « non suivi divergent ».
2. La garde d'écrasement refuse la synchronisation dans ce cas, avec le même
   contrat que celle de bug-001 : **avant** tout `git checkout`, jamais au fil
   de l'eau, **inactive en `--dry-run`**, message nommant les issues manuelles
   (committer, déplacer le fichier, retirer le bit `skip-worktree`, ou exclure
   le chemin via `.kit-paths`).
3. Le message doit nommer le bit en cause : un utilisateur qui a posé
   `skip-worktree` il y a six mois ne fera pas le lien tout seul.

> **Note (feature-006, lot 1, harnais livré)** : `tests/harnais_kit.py` est
> disponible, avec la primitive `poser_skip_worktree()` (et sa variante
> `assume_unchanged`), `MARQUEURS_DE_GARDE` et `affirmer_seule_garde()`. La
> **garde** correspondante reste entièrement à la charge de ce bug (voir
> « Notes pour agent » de feature-006). ADR-0012 impose que le test de
> non-régression ajouté ici déclare sa propre clé dans `MARQUEURS_DE_GARDE`
> et démontre, par mutation, qu'aucune autre garde ne peut le faire échouer.

## Critères d'acceptation

- [x] Dans le scénario de reproduction, la synchronisation refuse de
      s'exécuter et le contenu local est intact (`test_T2_skip_worktree_divergent_synchro_reelle_refuse`)
- [x] Le cas `--assume-unchanged` est couvert au même titre que `skip-worktree`
      (`test_T3_assume_unchanged_divergent_synchro_reelle_refuse`, plus le cas
      d'état de base non couvert par `h` seul)
- [x] La garde reste **inactive en `--dry-run`** — la régresser serait
      réintroduire le défaut 1 de feature-005 (`test_T4_dry_run_code_zero_aucune_garde_recapitule`,
      parité vérifiée par `test_T8_recapitulatif_dry_run_identique_a_l_execution_reelle`)
- [x] Un fichier `skip-worktree` **identique** au kit ne déclenche aucune garde
      (`test_T5_bit_pose_contenu_identique_synchro_sans_garde`)
- [x] Aucun chemin sensible (auth, permissions, données personnelles) touché
- [x] Suite de tests verte, avec un test de non-régression couvrant ce bug
      (revue Approved, deux passages, tout vérifié par exécution ; 42 → 55 cas)
- [x] Le test de non-régression a été **vu échouer sur le code d'avant le
      fix** — sinon il ne protège rien
- [x] La mutation « neutraliser la comparaison à `HEAD:$f` » tue ce test
      (matrice de mutation diagonale sur neuf passes, aucun cas préexistant tué)
- [x] Lint propre (`shellcheck`), pas de warning nouveau

## Hors périmètre

- La garde des fichiers **non suivis** : déjà livrée par bug-001
- Tout drapeau `--force` / `--adopt` / sauvegarde `.bak` : nouvelle surface
  publique, décision produit distincte
- La régénération Copilot qui exécute du code non relu — voir
  `feature-011-passerelle-copilot-execute-du-code-non-relu.md`

---
# Notes d'implémentation

## Plan (architect)

- Cinquième état de classification, détecté **par fichier** — bit git posé
  (`git ls-files -v` : `S`, ou toute minuscule = `assume-unchanged`) **et**
  `hash_local ≠ HEAD:$f` — alimentant un bloc de récapitulatif dédié au site
  d'appel unique et une garde placée après la sortie `--dry-run`.
- **Détection par fichier, et non globale** : la formulation de la spec
  (« hash ≠ `HEAD:$f` *alors que `git status --porcelain` est propre* ») est
  vraie en mode réel mais **fausse en `--dry-run` sur arbre sale**. Le même
  fichier aurait changé de catégorie selon le mode, et l'aperçu aurait cessé
  d'être identique au réel — ce qu'ADR-0011 interdit. Écarté avant tout code.
- **Fragment de message disjoint** : `MARQUEURS_DE_GARDE["ecrasement"]` vaut
  « SANS RETOUR POSSIBLE ». Le réutiliser aurait fait voir « deux gardes qui
  parlent » à `affirmer_seule_garde()`, cassant les cas neufs **et** un cas
  existant sans rapport. Retenu : « MODIFICATION LOCALE INVISIBLE ».
- ADR : **ADR-0013 neuf**, pas un amendement — les ADR de ce dépôt sont
  immuables. Il complète ADR-0011 sans le superséder.

## Validation security-reviewer

- **Rôle GATE** : non applicable, confirmé par trois lectures (`spec-reader`,
  `orchestrator`, `architect`). Aucun des cinq déclencheurs.
- **Rôle AUDIT** : invoqué en fin de cycle — c'est lui qui avait trouvé ce
  défaut pendant `bug-001`, le passage ferme la boucle. Il a trouvé **un
  constat grave et neuf** qui a bloqué la clôture (voir ci-dessous), plus deux
  constats reportés sur specs à ouvrir.

## Implémentation

- **Fichier modifié** : `tools/update_kit.sh` — cinquième catégorie
  `geles_perte`, bloc de récapitulatif, garde de refus, liste
  `a_maj_bit_efface` (avertissement non bloquant), `-c core.quotepath=off` sur
  les trois appels produisant des noms réutilisés comme chemins disque.
- **Tests** : `tests/test_update_kit.py` (13 cas neufs), `tests/harnais_kit.py`
  (entrée `MARQUEURS_DE_GARDE` uniquement — le harnais n'a pas été rouvert).
- **Choix d'implémentation** : `-c core.quotepath=off` plutôt que
  `ls-tree -z`. Argument du développeur : une variable bash ne peut pas porter
  un octet NUL. Argument corrigé par la revue : bash ne les tronque pas, il les
  **supprime**, et les noms se colleraient — mais surtout, git cite **toujours**
  retours-ligne et guillemets, quotepath ou non, donc `-z` n'aurait rien gagné.

## Tests (test-engineer)

- Suite complète : **55/55 verts** (42 préexistants + 13 neufs), ~2,2 s.
- **Matrice de mutation diagonale sur neuf passes**, aucun cas préexistant tué.
- **Un mutant a réellement survécu à la première salve** — inverser l'ordre
  « identique au kit » / « bit posé » ne cassait rien. Plutôt que de le déclarer
  équivalent, un cas a été ajouté pour le tuer : celui où le contenu local
  coïncide avec le kit tout en divergeant de `HEAD`.
- **Honnêteté sur ce qui ne prouve rien** : quatre cas neufs passent aussi sur
  le code d'avant le correctif. Trois tuent un mutant qui leur est propre ; le
  quatrième (`T5`) n'en tue aucun — décoratif, conservé pour six lignes parce
  qu'il encode un critère d'acceptation. Dit, pas masqué.
- **Limite déclarée après tentative de réfutation** : les états `m`, `r`, `c`
  de `git ls-files -v` n'ont pas pu être fabriqués —
  `git update-index --assume-unchanged` refuse sur un fichier en conflit
  (`fatal: Unable to mark file`), et aucune opération d'utilisateur normal ne
  produit `r` ou `c` en git 2.47.3. Essayé avant d'être déclaré.

## Revue (code-reviewer)

- **Deux passages, Approved les deux fois**, chacun vérifié **par exécution**
  plutôt que sur rapport — y compris en retirant le correctif pour voir le
  fichier être détruit et le bit passer de `S` à `H`.
- Points mineurs relevés et corrigés : détection élargie à toute minuscule,
  avertissement du bit effacé, puis `[[:lower:]]` au lieu de `[a-z]`.

## Défauts réels trouvés pendant ce cycle

1. **Le défaut visé** : un fichier suivi à bit posé était écrasé sans qu'aucune
   des trois gardes ne le voie. Dégât total — contenu **et** bit effacés, donc
   plus aucune trace de l'intention de l'utilisateur.
2. **Les noms non-ASCII désarmaient TOUTES les gardes** (trouvé par l'audit,
   a bloqué la clôture). `git ls-tree --name-only` cite les noms sous
   `core.quotepath`, actif par défaut : `révision.md` sortait sous la forme
   `".claude/agents/r\303\251vision.md"`, le test d'existence échouait, le
   fichier était classé **« À CRÉER »** et `git checkout` l'écrasait. Un fichier
   suivi à bit posé divergent était détruit ; un fichier ignoré divergent
   aussi. **Sur un kit francophone, un accent suffisait.**
3. **Le conseil du message était inopérant** : `git add` n'indexe rien sous
   `skip-worktree` ni `assume-unchanged`. On disait à l'utilisateur de faire un
   geste sans effet.
4. **La détection encodait deux lettres au lieu d'une règle** : `S`/`h` au lieu
   de « toute minuscule ». Puis, après correction, `[a-z]` au lieu de
   `[[:lower:]]` — sous une locale non-C, les plages de bash suivent la
   collation et peuvent happer des majuscules. **Deux fois la même erreur dans
   un seul cycle.**
5. **Le bit effacé en silence** sur un fichier identique à `HEAD` : aucun
   contenu perdu, mais le marqueur d'intention disparaissait sans un mot.

Aucun de ces cinq n'a été trouvé par relecture.

## Écarts assumés par rapport à la spec initiale

1. **Le correctif des noms cités dépasse le périmètre annoncé.** La spec ne
   parlait que du bit git. Justification : sans lui, la garde livrée par ce
   cycle **ne tire pas** — corriger l'un sans l'autre aurait livré une
   protection inopérante sur tout chemin accentué.
2. **Un avertissement non bloquant a été ajouté** (bit effacé sur fichier
   identique à `HEAD`), hors des trois volets du « Correctif attendu ». Coût
   d'une ligne, et il comble le seul cas où l'outil agissait encore en silence.

## Addendum — itération du 2026-09-13 (l'audit bloque la clôture)

- **Déclencheur** : rapport d'audit reçu après un « Approved » de la revue.
- **Hypothèse invalidée** : « la garde couvre le défaut ». Faux pour tout
  fichier au nom non-ASCII — et la chaîne complète (architecte, développeur,
  23 mutations, revue) ne l'avait pas vu, parce que tous raisonnaient sur le
  mécanisme et qu'aucun n'avait mis d'accent dans un nom de fichier.
- **Résultat** : quatre correctifs, dont le bloquant.

## Addendum — leçon de procédure du 2026-09-13

**Un correctif qui arrive après la phase de test doit rouvrir la phase de
test.** Les quatre correctifs ci-dessus ont été livrés alors que la suite était
déjà écrite : elle est restée verte, donc silencieuse. Le correctif le plus
grave du cycle n'était couvert par **rien**, et le prochain qui aurait
« simplifié » l'appel à `git ls-tree` aurait rouvert le trou sans qu'aucun test
ne l'arrête.

L'écart n'a été rattrapé que par une vérification manuelle de l'agent
principal. C'est une faiblesse du workflow, pas un incident isolé : le cycle
prescrit par `CLAUDE.md` est linéaire (tests → revue → doc), et rien n'y dit
que revenir en arrière sur le code oblige à revenir en arrière sur les tests.

## Statut final

✅ **Done — 2026-09-13.** Cycle : `orchestrator` → `spec-reader` →
reproduction (par l'agent principal) → `architect` → `backend-developer` →
`test-engineer` → `code-reviewer` → `security-reviewer` (rôle AUDIT) → retour
développeur et tests → re-revue → `doc-writer`.

Relevés : **55/55 tests verts** · matrice de mutation **diagonale sur neuf
passes**, aucun cas préexistant tué · `shellcheck` 0 warning nouveau ·
`check_specs.sh`, `check_doc_links.sh` verts · dépôt réel intact, vérifié après
chaque passage.

**Specs à ouvrir**, issues de l'audit et non traitées ici :
- un fichier **ignoré occupant la place d'un répertoire gelé** est classé « à
  créer » puis supprimé par `git checkout` ;
- **déni de service** sur un chemin épinglé non divergent : `checkout` échoue
  (« pathspec did not match »), rien n'est écrit, mais `--dry-run` n'annonce
  rien et le message ne nomme pas le bit ;
- résiduel **préexistant** : un nom contenant un retour-ligne ou un guillemet
  reste cité par git, donc classé « À CRÉER » et écrasé. Improbable dans un
  kit, mais réel.
