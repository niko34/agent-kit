# Guide de l'équipe d'agents — manuel de référence

Ce document explique comment fonctionne l'organisation installée par ce kit.
Il sert de référence pour répondre à toute question sur l'équipe d'agents,
l'arborescence ou le cycle de travail. (Le `README.md` explique l'installation ;
`CLAUDE.md` est le contrat opérationnel ; ce guide explique le POURQUOI et le
QUI-FAIT-QUOI.)

## Vue d'ensemble en une phrase

Tout travail part d'une **spec** (la source de vérité), traverse un **cycle
d'agents spécialisés** orchestré par la session principale, et se termine par
une spec **clôturée qui raconte ce qui s'est vraiment passé** — avec des gates
bloquants (sécurité, revue) qu'on ne contourne pas.

```
spec (todo) → analyse → plan → [gate sécurité P1] → [design UX] → code
   → [gate sécurité P2] → tests → revue → doc → spec (done)
```

## L'arborescence, fichier par fichier

```
CLAUDE.md                    Contrat de Claude : stack, règles absolues, workflow.
                             LU À CHAQUE SESSION — c'est le fichier maître.
GUIDE.md                     Ce manuel (référence pour les questions).
README.md                    Notice d'installation du kit (pour l'humain).
CHANGELOG.md                 Changements visibles utilisateur, par version.
.claude/
  settings.json              Permissions. Principe : autoriser largement la
                             LECTURE et les commandes locales sans effet de bord
                             (sinon on approuve tout sans lire), DEMANDER pour ce
                             qui sort du dépôt (push, PR, release), REFUSER ce qui
                             détruit. Secrets interdits en lecture.
  agents/*.md                Les 12 agents (voir tableau ci-dessous). Un fichier
                             = un rôle : frontmatter (nom, description, outils)
                             + instructions.
  commands/release.md        Commande slash `/release` — ne commite rien, ne
                             pousse que le tag. À PERSONNALISER (build, assets).
  memory/                    Mémoire de projet VERSIONNÉE : pièges, hypothèses
                             réfutées, incidents. Voir memory/README.md.
  skills/
    spec-workflow/           Cycle de vie des specs — se charge dès qu'une spec
                             est créée, reprise ou clôturée.
    security-checklist/      Invariants de sécurité I1-I10 — chargée par
                             security-auditor à chaque audit.
    dev-workflow/            Commandes réelles du projet (build/test/lint/
                             migrations/déploiement) — À PERSONNALISER.
    db-migrations/           Check-list des migrations BDD (réversibilité,
                             sauvegarde, compat N/N-1, backfill) — chargée par
                             backend-developer et security-auditor.
specs/
  features/todo|doing|done/  La file de travail (voir « Cycle de vie »).
  features/_template.md      Template RICHE, obligatoire pour toute feature.
  modele.md                  Template MINIMAL pour bug simple / refactor.
  modele_iteration.md        Sections à AJOUTER en fin de spec pendant le cycle
                             (plan, verdicts, tests, revue, addendums datés).
tools/
  check_specs.sh             Une spec ne vit que dans UN dossier du cycle.
  check_doc_links.sh         Tout lien relatif de la doc résout.
  update_kit.sh              Récupère les évolutions du kit dans un projet, sur
                             les seuls fichiers « gelés ».
.github/workflows/           Variante GitHub Actions des contrôles d'hygiène.
.gitlab/ci/hygiene.yml       Variante GitLab CI des mêmes contrôles. On garde
                             UNE des deux au moment de la copie. Le support des
                             deux forges est quasi gratuit parce que la logique
                             vit dans tools/, pas dans le YAML.
docs/
  API.md                     Contrat REST (conventions + une section/ressource).
  ARCHITECTURE.md            Vue d'ensemble : composants, flux, environnements.
  features/page-*.md         Doc vivante : une fiche par écran du portail.
  subsystems/<module>.md     Doc vivante : une fiche par module backend.
  adr/                       Décisions d'architecture — IMMUABLES (voir ADR).
```

## Les 12 agents

| Agent | En une phrase | Particularité |
|---|---|---|
| `orchestrator` | Lit la spec et produit le PLAN : check-list figée, briefs prêts-à-l'emploi, invariants, critères de clôture | **N'invoque jamais les autres agents** (limitation runtime) — c'est la session principale qui exécute son plan |
| `spec-reader` | Analyse d'impact d'une spec, la promeut de `todo/` vers `doing/` | Spec incomplète = questions à l'utilisateur, pas de promotion |
| `architect` | Plan d'implémentation ≤ 10 lignes, arbitrages techniques | Statue explicitement sur la nécessité d'un ADR (4 critères) |
| `security-auditor` | Audit sécurité : auth, permissions, injections, RGPD, secrets, migrations | **Gate bloquant, passe DEUX fois** : P1 sur le design (avant code), P2 sur le diff réel. Verdicts GO / GO SOUS CONDITIONS / NO GO. Lecture seule |
| `security-reviewer` | Audit de la SURFACE D'ATTAQUE entière, sans diff ni spec | Complète le gate : il cherche ce qui n'apparaît dans aucun diff. Règle maîtresse : « la PLACE de la garde dans le cycle de vie, jamais sa seule présence ». Rapport à 3 niveaux (Grave / assumé / cosmétique). Lecture seule |
| `ux-ui-designer` | Ergonomie et mise en page, AVANT l'implémentation | Rend un arbitrage, pas un catalogue d'options |
| `backend-developer` | API REST, logique métier, BDD, migrations | Migrations toujours réversibles ; requêtes paramétrées |
| `frontend-developer` | Écrans du portail, appels API, formulaires | « Le frontend n'est jamais une barrière de sécurité » |
| `test-engineer` | Suite de tests + lint, rapport chiffré | Zéro régression tolérée ; pas de test artificiel ; **tout test neuf est validé par MUTATION** (vu échouer sur une altération volontaire du code) |
| `debugger` | Investigation de bug : reproduire, mesurer, cause racine | Méthode : mesurer AU PLUS PRÈS de la source avant de raisonner |
| `code-reviewer` | Revue du diff EN ENTIER avant tout commit | Verdicts Approved / Request changes / Blocked ; « œil neuf » sur les flux complexes |
| `doc-writer` | Docs vivantes, CHANGELOG, notes ADR | Obligation PAR TOUR (pas par cycle) dès qu'un comportement observable change |

**Règle de communication** : les sub-agents ne s'invoquent pas entre eux. Ils
signalent dans leur rapport, et la session principale route (ex. test-engineer
trouve un bug → le signale → la session invoque debugger).

## Cycle de vie d'une spec

```
todo/  ──(spec-reader, après analyse)──>  doing/  ──(agent principal, en clôture)──>  done/
```

- **Une seule spec dans `doing/` à la fois.** Suspendue = retour en `todo/` avec note.
- Pendant le cycle, la spec s'ENRICHIT en fin de fichier (format
  `modele_iteration.md`) : plan, verdicts P1/P2, tests, revue, addendums.
- Exigences avant `done/` : tests verts, revue Approved, security-auditor GO
  (si applicable), CHANGELOG et docs à jour.
- Une spec `done/` est **immuable** — nouvelle évolution = nouvelle spec.
  L'ordre des fichiers `done/` raconte l'histoire du projet.
- **Honnêteté documentaire** : un diagnostic qui s'avère faux reste dans la spec,
  corrigé par un addendum daté — jamais réécrit. Les erreurs documentées évitent
  de refaire les mêmes.

## Deux templates de spec — pourquoi pas un seul ?

C'est la **proportionnalité du processus** :

- `_template.md` (features) : riche à dessein — ses blocs Domaines / Agents
  requis / Sécurité & données sont LUS par l'orchestrator pour construire le
  plan et déclencher les gates.
- `modele.md` (bugs/refactors) : une page — symptôme avec preuves, cause
  racine, correctif, critères. S'écrit en cinq minutes au cœur d'un debug.
- **Règle d'escalade (le verrou anti-abus)** : un bug qui touche l'auth, les
  permissions, les données personnelles ou une migration → bascule obligatoire
  sur le template complet, pour que security-auditor soit déclenché.

Fusionner les deux pousserait soit à bâcler le grand format sur les petits
sujets, soit à priver l'orchestrator de ses blocs de pilotage.

Pour que le verrou tienne, `modele.md` porte lui aussi un bloc **Agents requis** :
l'escalade doit être *lisible par l'orchestrator*, pas seulement mentionnée dans un
commentaire qu'un humain pressé saute.

## Pourquoi la CI vérifie les specs et les liens

Trois contrôles tournent sur chaque commit (`.github/workflows/hygiene-specs.yml`),
sans toolchain ni cache, en une seconde :

- **Unicité** — un nom de spec ne vit que dans un seul de `todo/` · `doing/` · `done/`.
  Le cycle procède par déplacement ; une spec copiée, ce sont deux versions qui
  divergent et deux statuts qui se contredisent.
- **Liens** — tout lien relatif de la doc résout. Le chemin d'un lien vers une spec
  **encode son état** (`doing/`, `done/`), donc chaque promotion casse silencieusement
  les liens qui citaient l'ancien emplacement.
- **Agents Copilot** — chaque profil `.github/agents/*.agent.md` correspond exactement
  à sa source `.claude/agents/*.md` ; une modification non régénérée bloque la CI.

Les deux défauts sont attestés sur le projet d'origine : trois specs dans deux dossiers
avec des statuts contradictoires, et 29 % de liens morts vers des specs — des liens
pourtant justes le jour où ils ont été écrits. D'où la règle : **une règle que rien ne
vérifie n'est pas une règle**. Les scripts vivent dans `tools/`, pas dans le YAML, pour
tourner à l'identique en local et servir de hook pre-commit.

## Sources versionnées, générés publiés

On versionne les sources, **jamais** les fichiers générés : bundles, images, PDF,
binaires deviennent des **assets de release** (horodatés, associés à un tag) plutôt que
d'alourdir l'historique. Trois conséquences qui se paient cher quand on les oublie :

- un dérivé **ne se corrige jamais à la main** — la prochaine génération l'écrase ;
- la **source** de la doc générée se tient à jour en continu, pas à la release ;
- ce qui est **relevé** et non généré (dump de crash, trace d'incident) se versionne :
  rien ne le régénère. C'est l'exception assumée à la règle.

Les profils `.github/agents/*.agent.md` sont une seconde exception, imposée par leur
consommateur : GitHub Copilot ne les découvre que dans le dépôt. Leur source reste
`.claude/agents/*.md`; `tools/sync_copilot_agents.py --write` les régénère et `--check`
interdit leur dérive en CI. Un profil Copilot généré ne se corrige jamais directement.

`/release` applique ça : arbre propre exigé, branche à jour avec origin, **aucun commit,
seul le tag est poussé**.

## Le kit et les projets : photocopie, pas lien

Créer un projet depuis le kit — bouton « Use this template », fork, ou simple copie de
fichiers — produit un dépôt **sans aucune relation git** avec le kit. Rien ne descend,
rien ne remonte, jamais. C'est délibéré : le fichier le plus personnalisé d'un projet
(`CLAUDE.md`) est aussi un fichier que le kit fournit, donc toute synchronisation
automatique le détruirait.

Le lien se recrée à la demande, par un distant `kit` et le script `tools/update_kit.sh`,
qui ne récupère que les fichiers **gelés** — les agents génériques, les skills partagées,
le convertisseur Copilot, `tools/`, les templates de specs, `GUIDE.md`. Les profils
Copilot sont régénérés dans le projet après cette récupération, ce qui conserve aussi
ses agents métier propres.
Les fichiers **personnalisés** (`CLAUDE.md`,
`dev-workflow`, `settings.json`, CI, mémoire, agents métier) n'y sont jamais touchés.

Le retour vers le kit reste manuel : c'est là qu'on décide si une leçon vaut au-delà d'un
projet. Détail de la manœuvre dans le `README.md`, section « Faire vivre la référence ».

**Corollaire pour les agents métier** : un agent propre à un domaine (`pool-chemistry`,
`controle-de-gestion`…) vit **dans le projet**, jamais dans le kit. C'est précisément ce
mélange qui avait fait dériver la première version de ce kit.

## La mémoire de projet

`.claude/memory/` est versionné parce que la mémoire de Claude Code vit sinon dans
`~/.claude/projects/…` — hors dépôt, sur une seule machine, sans sauvegarde. On y écrit
surtout les **hypothèses réfutées** : c'est le contenu au meilleur rendement, celui qui
empêche de refaire un trajet déjà fait. Aucun secret n'y va, le dossier est versionné.

## Documentation : vivante vs immuable

- **Vivante** (mise à jour en continu par doc-writer) : `docs/API.md`,
  `docs/ARCHITECTURE.md`, `docs/features/page-*.md`, `docs/subsystems/*.md`,
  `CHANGELOG.md`. La matrice « quel changement → quelle doc » est dans CLAUDE.md.
- **Immuable** : `docs/adr/`. Un ADR capture UNE décision (contexte, décision,
  alternatives écartées, conséquences). On ne le modifie jamais : pour changer
  d'avis, on écrit un nouvel ADR qui supersède l'ancien ; pour un complément
  factuel, une **note additive datée**. Déclencheurs (4 critères) : contrainte
  structurante, décision invisible dans le code, alternatives crédibles à
  tracer, verrouillage long terme.
- **Principe central** : la doc est une obligation PAR TOUR. Cinq fixes dans une
  session = cinq passages de doc-writer, pas un seul à la fin.

## Questions fréquentes

**Qui décide de lancer le cycle complet ?** La session principale : dès qu'une
demande dépasse un fichier ou touche un domaine sensible, elle invoque
l'orchestrator ; sinon travail direct (voir CLAUDE.md, « Quand utiliser
l'orchestrateur »).

**Que se passe-t-il sur un NO GO ou un Request changes ?** On reboucle : retour
à l'agent concerné (architect ou developer), correction, puis RE-passage du
gate. Un verdict bloquant ne se contourne pas, il se lève.

**Qui déplace la spec vers `done/` ?** La session principale, en clôture, après
vérification de la check-list — pas doc-writer, pas l'orchestrator.

**Peut-on committer sans revue ?** Non. Et jamais de commit/push sans demande
explicite de l'utilisateur.

**Comment démarrer une feature ?** Copier `_template.md` → `todo/feature-NNN-
slug.md`, remplir les blocs, puis demander le lancement. Un bug simple :
`modele.md` → `todo/bug-NNN-slug.md`.

**Où sont les commandes du projet (tests, build, migrations) ?** Dans la skill
`dev-workflow` — l'unique endroit à maintenir quand elles changent.

**Comment mettre les agents à disposition de GitHub Copilot ?** Modifier uniquement
leur source dans `.claude/agents/`, puis lancer
`python3 tools/sync_copilot_agents.py --write`. Copilot charge les profils générés dans
`.github/agents/` et réutilise directement les skills sous `.claude/skills/`.
