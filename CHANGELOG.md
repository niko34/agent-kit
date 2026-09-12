# Changelog — <NOM DU PROJET>

Journal des changements **visibles par les utilisateurs**, version la plus récente en
premier, versions séparées par `---`. Tenu par `doc-writer` à chaque tour qui change
un comportement observable (cf. CLAUDE.md, « Auto-vérification fin de tour »).

<!-- Les entrées ci-dessous documentent le KIT lui-même. Au démarrage d'un projet,
     les remplacer par le journal du projet. -->

## [0.6.0] - 2026-09-12

### Outillage

- **`tools/update_kit.sh` : l'aperçu cesse d'annoncer des suppressions là où
  il va créer des fichiers.** Il reposait sur un `git diff --stat` entre le
  kit et l'arbre suivi du projet ; un chemin gelé absent du projet y
  apparaissait comme `deletions(-)` alors qu'il allait être **créé**.
  L'aperçu distingue désormais quatre issues par fichier : à créer, non suivi
  divergent, non suivi déjà identique, à mettre à jour (les identiques suivis
  sont comptés, non listés). Voir ADR-0011.
- **Nouvelle garde d'écrasement** : un fichier non suivi par git (typiquement
  ignoré par `.gitignore`) dont le contenu diverge de celui du kit fait
  désormais **échouer** la synchronisation réelle avant tout `git checkout`.
  Motif : un tel fichier, jamais commité, n'est récupérable par aucun retour
  arrière une fois écrasé — et la garde d'arbre propre préexistante
  (`git status --porcelain`) ne le voyait pas, puisqu'elle est aveugle aux
  fichiers ignorés. **Ce qui peut surprendre** : une synchronisation qui
  réussissait jusqu'ici en silence peut désormais sortir en erreur — c'est le
  compromis assumé (voir ADR-0011, conséquences négatives).
- **Tout argument différent de `--dry-run` est rejeté**, sortie non nulle.
  Motif, relevé par l'audit sécurité : `./tools/update_kit.sh --dry_run`
  (faute de frappe) déclenchait jusqu'ici une synchronisation **réelle** — la
  seule soupape humaine du script était contournable par une simple coquille.
  **Ce qui peut surprendre** : un argument mal orthographié est désormais
  refusé au lieu d'être silencieusement ignoré.
- `--dry-run` et l'exécution réelle passent par un site d'appel unique du
  récapitulatif : ils ne peuvent plus afficher un texte différent.

### Tests

- `tests/test_update_kit.py` [nouveau] : harnais minimal (dépôts kit/projet
  jetables, confinés, sans réseau) et 4 cas de non-régression sur l'aperçu et
  la garde d'écrasement. Ajouté à `CHEMINS` d'`update_kit.sh` pour se
  synchroniser avec le script qu'il protège.

### Documentation

- `docs/adr/0011-apercu-recapitulatif-d-operations.md` [nouveau] : pourquoi
  l'aperçu décrit des opérations et non un diff d'arbres, alternatives
  écartées (`numstat` réinterprété, `ls-tree`/`ls-files`, sauvegarde `.bak`
  automatique).
- `README.md` : section « Récupérer les évolutions du kit » mise à jour avec
  les quatre issues de l'aperçu et la garde d'écrasement.
- `specs/features/todo/feature-006-tests-de-update-kit.md` : note sur le
  harnais livré en avance par bug-001.

## [0.5.0] - 2026-09-12

### Équipe d'agents

- **Fusion `security-auditor` + `security-reviewer` → `security-reviewer` unique.**
  Le nouvel agent cumule les deux rôles : **GATE** bloquant sur un périmètre déclaré
  (P1 sur le design, P2 sur le diff, verdict GO / GO SOUS CONDITIONS / NO GO) et
  **AUDIT** holistique de la surface d'attaque, sans diff ni spec. Raison : deux
  « invocation obligatoire » sur le même périmètre produisent soit le double de
  coût, soit l'ambiguïté — et l'ambiguïté, en pratique, veut dire qu'aucune des
  deux n'est appelée. `.claude/agents/security-auditor.md` supprimé.
- Toutes les références au gate dans `CLAUDE.md`, `GUIDE.md`, `README.md`,
  `orchestrator.md`, les templates de spec et les skills `security-checklist` /
  `db-migrations` renommées vers `security-reviewer`, en précisant le rôle (GATE
  ou AUDIT) partout où l'ambiguïté était possible.
- L'équipe passe de 12 à 11 agents.

## [0.4.0] - 2026-09-11

### GitHub Copilot

- `tools/sync_copilot_agents.py` convertit les profils `.claude/agents/*.md` en
  `.github/agents/*.agent.md`, traduit les outils, refuse les collisions avec un profil
  manuel et supprime uniquement ses propres dérivés devenus orphelins.
- Les modes `--write` et `--check` permettent respectivement la génération locale et
  le contrôle déterministe en CI, sans dépendance Python externe.
- `.github/copilot-instructions.md` adapte les références partagées à Claude/`Task`
  aux concepts Copilot et maintient l'orchestration par la session principale.
- La CI vérifie désormais que les 12 profils Copilot versionnés correspondent exactement
  à leurs sources Claude ; sept tests unitaires protègent le convertisseur.
- `tools/update_kit.sh` propage le convertisseur et les instructions communes puis, pour
  les projets ayant conservé `.github/`, régénère les profils localement afin d'inclure
  leurs agents métier sans recopier aveuglément tout le répertoire du kit.

---

## [0.3.0] - 2026-09-08

Le kit devient utilisable sur GitHub **et** GitLab, et cesse d'être un cul-de-sac
une fois recopié dans un projet.

### Deux forges

- `.gitlab/ci/hygiene.yml` : variante GitLab CI des contrôles d'hygiène, à inclure
  depuis un `.gitlab-ci.yml` existant sans le remplacer. Les deux variantes appellent
  les **mêmes scripts** `tools/` — le support bi-forge est quasi gratuit parce que la
  logique n'a jamais vécu dans le YAML.
- `/release` gère les deux forges (`gh` / `glab`), avec la consigne de supprimer la
  variante inutilisée — et la commande entière si la chaîne CI publie déjà les releases.
- `.claude/settings.json` : entrées `glab` en miroir des entrées `gh`.
- `README.md` : étape « Choisir sa forge » dans la procédure de démarrage.

### Propagation kit → projets

- `tools/update_kit.sh` : récupère dans un projet les évolutions du kit, **uniquement
  sur les fichiers gelés**. Refuse un arbre de travail sale, propose `--dry-run`, laisse
  le diff indexé pour relecture.
- `README.md` et `GUIDE.md` documentent qu'un template GitHub ne crée **aucun lien git** :
  rien ne descend, rien ne remonte. D'où les deux catégories de fichiers — **gelés**
  (rapatriables) et **personnalisés** (jamais touchés) — sans lesquelles toute
  synchronisation écraserait le `CLAUDE.md` du projet.
- Rappel explicite : un agent métier vit dans le projet, jamais dans le kit.

---

## [0.2.0] - 2026-09-08

Report des leçons apprises sur le projet d'origine depuis la constitution du kit.

### Positionnement

- Le kit devient **`claude-agent-kit`** : un dépôt de référence qui ne contient que
  l'outillage Claude, recopié dans les projets puis maintenu ici. Le nom précédent
  (`claude-webapp-kit`) désignait une techno alors que ce qui se réutilise est une
  méthode de travail.
- `README.md` : ce qui se copie et ce qui ne se copie pas, et la règle de
  rétro-portage — une leçon apprise sur un projet est perdue pour les suivants si
  personne ne la rapatrie ici.
- `CLAUDE.md` : avertissement en tête pour Claude ouvrant le dépôt du kit lui-même —
  c'est un modèle, pas un projet.

### Équipe d'agents

- Nouvel agent `security-reviewer` : audit **holistique** de la surface d'attaque, sans
  diff ni spec, complémentaire du gate `security-auditor`. Porte la règle « cherche la
  PLACE de la garde dans le cycle de vie, jamais sa seule présence », le modèle de
  menace à quatre attaquants et le rapport hiérarchisé en trois niveaux.
- `test-engineer` : validation obligatoire des tests neufs **par mutation**, avec
  relevé chiffré des mutants tués dans le rapport.
- `orchestrator` : prévoit `security-reviewer` après toute refonte de l'auth, du
  routage ou des permissions.

### Hygiène du dépôt

- `tools/check_specs.sh` : une spec ne vit que dans un seul dossier du cycle
  (bloquant) ; un numéro porté par deux slugs est signalé (avertissement).
- `tools/check_doc_links.sh` : tout lien relatif de la documentation résout.
- `.github/workflows/hygiene-specs.yml` : les deux contrôles sur chaque commit.

### Mémoire et releases

- `.claude/memory/` : mémoire de projet versionnée (index + README expliquant quoi y
  écrire, comment la réactiver sur une autre machine, et l'interdiction des secrets).
- `.claude/commands/release.md` : commande `/release` qui ne commite rien et ne pousse
  que le tag ; section « Fichiers générés et releases » dans `CLAUDE.md`.

### Permissions

- `.claude/settings.json` restructuré : `deny` / `ask` / `allow` explicites, allowlist
  de lecture large pour éviter les demandes de validation à répétition, sorties du
  dépôt (push, PR, release) sur confirmation.

### Specs

- `specs/modele.md` porte un bloc **Agents requis**, pour que la règle d'escalade vers
  le template complet soit lisible par l'orchestrator et pas seulement par un humain.

---

## [0.1.0] - AAAA-MM-JJ

### Backend

- Démarrage du projet avec le kit d'équipe Claude.

### Portail

- —

### Documentation

- Squelettes `docs/API.md`, `docs/ARCHITECTURE.md`, ADR-0001 (format ADR).
