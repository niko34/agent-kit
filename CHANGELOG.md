# Changelog — <NOM DU PROJET>

Journal des changements **visibles par les utilisateurs**, version la plus récente en
premier, versions séparées par `---`. Tenu par `doc-writer` à chaque tour qui change
un comportement observable (cf. CLAUDE.md, « Auto-vérification fin de tour »).

<!-- Les entrées ci-dessous documentent le KIT lui-même. Au démarrage d'un projet,
     les remplacer par le journal du projet. -->

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
