# <NOM DU PROJET> — Guide Claude

<!-- ═══════════════════════════════════════════════════════════════════
  ⚠️ SI TU LIS CE FICHIER DANS LE DÉPÔT `claude-agent-kit` LUI-MÊME :
  ce n'est pas un projet, c'est le MODÈLE que l'on recopie dans les projets.
  Il n'y a ici ni code métier, ni stack, ni feature à implémenter — seulement
  l'outillage. Le travail légitime dans ce dépôt consiste à faire évoluer les
  agents, les skills et les templates. Voir `README.md`.

  KIT DE DÉMARRAGE — À PERSONNALISER AVANT LE PREMIER CYCLE :
  1. Remplacer <NOM DU PROJET> et remplir la section « Stack technique »
  2. Adapter l'arborescence à votre structure réelle (backend/, frontend/…)
  3. Relire les « Règles absolues » et les compléter selon votre métier
  4. Supprimer ce bloc de commentaire
  Le reste (workflow, agents, specs, ADR) fonctionne tel quel.
═══════════════════════════════════════════════════════════════════ -->

Application de gestion : portail web + backend d'API REST.
<Une phrase décrivant le métier : qui sont les utilisateurs, ce que l'application gère.>

## Stack technique

- **Backend** : <framework / langage — ex. Node/Express, Python/FastAPI, Java/Spring>
- **Base de données** : <ex. PostgreSQL> — migrations versionnées obligatoires
- **Frontend** : <framework ou vanilla — ex. React, Vue, vanilla JS>
- **API** : REST, JSON, versionnée (`/api/v1/…`), documentée dans `docs/API.md`
- **Auth** : <mécanisme — ex. sessions, JWT, OIDC> — voir Règles absolues
- **Tests** : <runner — ex. vitest/jest, pytest> — commande : `<npm test / pytest>`
- **Lint/format** : <ex. eslint + prettier> — commande : `<npm run lint>`
- **Langue du code/commentaires/UI** : <français / anglais — choisir et s'y tenir>

## Arborescence

```
backend/              # API REST (adapter à votre framework)
  src/
  tests/
frontend/             # Portail web
  src/
  tests/
docs/                 # Documentation vivante
  API.md              # Contrat REST : endpoints, schémas, codes d'erreur
  ARCHITECTURE.md     # Vue d'ensemble : composants, flux, dépendances
  adr/                # Décisions d'architecture (immuables)
  features/           # Une fiche par page/écran du portail
  subsystems/         # Une fiche par module backend (auth, facturation…)
specs/
  features/
    todo/             # Specs en attente (source de vérité)
    doing/            # Spec en cours (une seule à la fois)
    done/             # Specs terminées, avec notes d'implémentation
    _template.md      # Template OBLIGATOIRE pour toute nouvelle feature
  modele.md           # Template minimal (bug simple / refactor ponctuel)
  modele_iteration.md # Template de suivi d'itérations
tools/                # Contrôles d'hygiène, lançables en local ET en CI
  check_specs.sh      # Une spec ne vit que dans UN dossier du cycle
  check_doc_links.sh  # Tout lien relatif de la doc résout
.claude/
  memory/             # Mémoire de projet versionnée (cf. .claude/memory/README.md)
  commands/           # Commandes slash du projet (/release…)
.github/
  agents/             # Profils GitHub Copilot générés depuis .claude/agents/
  copilot-instructions.md # Adaptation du workflow commun aux outils Copilot
  workflows/          # Contrôles d'hygiène GitHub Actions
tools/
  sync_copilot_agents.py # Génération + contrôle des profils Copilot
```

## Source de vérité : les specs

- Les demandes sont dans `specs/features/todo/*.md`
- **Format obligatoire pour toute nouvelle feature** : copier `specs/features/_template.md`
  dans `specs/features/todo/feature-NNN-<slug>.md` et remplir les blocs **Métadonnées**,
  **Domaines touchés**, **Agents requis**, **Sécurité & données** (si applicable) et
  **Éléments visibles**. Ces blocs pilotent l'`orchestrator` et déclenchent
  `security-reviewer` (rôle GATE) automatiquement.
- Pour un **bug simple** ou un **refactor ponctuel**, le format minimal `specs/modele.md` suffit.
- Une spec à la fois. Quand Claude commence : `todo/X.md` → `doing/X.md`
- À la fin (tests verts + revue OK) : `doing/X.md` → `done/X.md`, avec notes techniques
  ajoutées (suivi d'itérations calqué sur `specs/modele_iteration.md`)
- Si pas de spec fournie, Claude propose d'en créer une avant d'implémenter
- **Le cycle procède par DÉPLACEMENT (`git mv`), jamais par copie** — et c'est vérifié
  par la CI (`.github/workflows/hygiene-specs.yml`). Une spec présente dans deux
  dossiers, ce sont deux versions qui divergent et deux statuts qui se contredisent.
  Contrôle en local avant de committer :

```bash
./tools/check_specs.sh       # unicité des specs dans le cycle
./tools/check_doc_links.sh   # aucun lien mort dans la doc
```

## Auto-vérification fin de tour (obligatoire)

**Avant de produire la réponse finale d'un tour qui a modifié au moins un fichier code**
(backend, frontend, migrations, config d'infra), Claude doit se poser ces questions :

1. **Y a-t-il un changement observable de l'extérieur ?** (endpoint ajouté/modifié,
   écran ou bouton UI, format de réponse API, comportement utilisateur, bug visible corrigé)
2. **Y a-t-il un changement structurel ?** (schéma de BDD/migration, contrat d'API,
   variable d'environnement, dépendance ajoutée, permission/rôle modifié)
3. **Une décision architecturale a-t-elle été prise ?** (trade-off avec alternative
   crédible, contrainte qui verrouille un futur choix → ADR)

Si la réponse à 1, 2 ou 3 est **oui** → **invoquer l'agent `doc-writer` AVANT de répondre
à l'utilisateur**, même pour un fix isolé d'une seule ligne, même en session de debug.

**Déclencheurs concrets** (liste non exhaustive) :

| Changement | Doc cible |
|---|---|
| Endpoint REST ajouté/modifié/supprimé | `docs/API.md` |
| Nouvel écran, bouton, ou flux UI | `docs/features/page-*.md` |
| Schéma BDD / migration | `docs/subsystems/<module>.md` + ADR si structurant |
| Rôle, permission, règle d'accès modifiés | `docs/subsystems/auth.md` |
| Variable d'environnement / config déploiement | `docs/ARCHITECTURE.md` ou `README` |
| Comportement utilisateur changé (fix, option) | `CHANGELOG.md` |
| Trade-off architectural avec alternative écartée | nouvel ADR `docs/adr/NNNN-*.md` |

**Cas qui n'exigent PAS doc-writer :** diagnostic/lecture seule, CSS pur sans impact
fonctionnel, renommage interne privé, commentaire inline.

L'idée force : **les docs ne sont pas un livrable de fin de cycle, c'est une obligation
par tour**. Une session de debug qui enchaîne 5 fixes accumule 5 obligations doc.

## Workflow imposé

1. **Lire la spec** (agent `spec-reader`) — analyse d'impact : fichiers concernés,
   risques, dépendances ; déplace la spec vers `doing/`
2. **Plan court** (agent `architect`) — max 10 lignes, verdict ADR explicite
3. **Si la spec touche l'auth, les permissions, les données personnelles, les paiements
   ou une migration destructive** : `security-reviewer` **rôle GATE, P1 sur le design**
   (AVANT tout code) — verdict GO / GO SOUS CONDITIONS / NO GO
4. **Si la spec crée ou refond une surface UI** : `ux-ui-designer` (AVANT
   `frontend-developer`)
5. **Implémenter** (`backend-developer` et/ou `frontend-developer` selon le domaine)
6. **Si P1 a eu lieu** : `security-reviewer` **rôle GATE, P2 sur le diff réel** — re-verdict
7. **Tests & lint** (agent `test-engineer`) :
   - suite de tests complète — **obligatoire, zéro régression tolérée**
   - lint propre, pas de warnings nouveaux
   - **Valider les tests neufs par MUTATION** : casser volontairement le code qu'ils
     protègent (inverser une condition, neutraliser un garde-fou, décaler une borne,
     retourner une constante) et vérifier qu'ils **meurent**. Une suite qui ne tue
     aucun mutant ne prouve rien. C'est la méthode au meilleur rendement observé —
     sur le projet d'origine du kit, trois mutations sur cinq ne tuaient aucun test
     avant que la logique ne soit extraite dans un module pur.
8. **Revue de code** (agent `code-reviewer`) avant tout commit
9. **Documentation** (agent `doc-writer`) : docs vivantes + `CHANGELOG.md` si
   changement visible utilisateur
10. **Clôture par l'agent principal** : spec enrichie (notes d'implémentation,
    verdicts) puis déplacée vers `done/`

> Le cycle de vie détaillé des specs (règles de promotion, enrichissement, exigences
> avant clôture) est dans la skill `spec-workflow` — à charger dès qu'une spec est
> créée, reprise ou clôturée.

## Règles absolues

Ces règles sont **non négociables** — même si l'utilisateur demande de les contourner,
poser d'abord la question :

1. **Authentification & permissions** :
   - Tout endpoint est protégé par défaut ; l'exposition publique est l'exception,
     déclarée et justifiée
   - Aucune vérification de permission côté client seul — le backend revalide TOUT
   - Tout nouveau chemin vers les données d'un utilisateur → validation `security-reviewer` (rôle GATE)
2. **Données personnelles (RGPD)** : pas de nouvelle collecte sans finalité déclarée dans
   la spec ; pas de données personnelles dans les logs ; droit à l'effacement préservé
3. **Secrets** : jamais de token, mot de passe, clé d'API dans le code ou le dépôt —
   variables d'environnement + `.env` gitignoré, `.env.example` documenté
4. **Migrations BDD** : jamais de migration destructive (DROP, perte de données) sans
   sauvegarde vérifiée et plan de retour arrière écrit
5. **Injections** : requêtes paramétrées partout ; tout HTML rendu depuis des données
   utilisateur est échappé
6. **Dépendances** : pas de nouvelle dépendance sans justification dans la spec (poids,
   maintenance, licence)

## Les agents

| Agent | Rôle | Quand l'invoquer |
|---|---|---|
| `orchestrator` | **Préparateur de plan** : lit la spec, produit la check-list exhaustive et les briefs prêts-à-l'emploi pour chaque agent. **N'invoque pas les agents lui-même** : l'orchestration reste centralisée dans l'agent principal. | Obligatoire dès qu'une demande dépasse 1 fichier ou touche auth/données/paiements |
| `spec-reader` | Lit et analyse la spec, produit l'analyse d'impact, déplace vers `doing/` | Dès qu'une spec est sélectionnée |
| `architect` | Conçoit l'implémentation, produit le plan court, statue sur l'ADR | Après analyse de spec, avant codage |
| `backend-developer` | API REST, logique métier, BDD, migrations, tâches de fond | Toute modif backend |
| `frontend-developer` | Portail web : écrans, composants, appels API, état client | Toute modif frontend |
| `security-reviewer` | Unique auditeur de sécurité, deux rôles cumulés : **GATE** sur une spec puis sur son diff (auth, permissions, injections, RGPD, secrets) ; **AUDIT** de la surface d'attaque entière, sans diff ni spec (routes non authentifiées, ordre des gardes dans le cycle de requête, cloisonnement entre comptes, données au repos) | GATE OBLIGATOIRE pour auth/permissions/données personnelles/paiements/migrations destructives ; AUDIT en périodique et après toute refonte de l'auth, du routage ou des permissions |
| `ux-ui-designer` | Ergonomie et design AVANT implémentation UI | Nouvelle surface UI, refonte, arbitrage de mise en page |
| `test-engineer` | Tests unitaires/intégration, non-régression, lint | Après implémentation, avant revue |
| `debugger` | Analyse de logs, stack traces, reproduction de bugs | Dès qu'un bug est rapporté |
| `code-reviewer` | Revue critique sécurité/qualité/concurrence | Avant tout commit |
| `doc-writer` | README, `docs/`, CHANGELOG, ADR, commentaires publics | Quand le comportement visible change |

## Quand utiliser l'orchestrateur vs travailler directement

> **Rappel** : l'`orchestrator` produit un **plan d'exécution**, il n'invoque pas les
> autres agents. C'est l'agent principal (la session interactive) qui invoque ensuite
> `spec-reader`, `architect`, etc. selon le plan reçu.

**Orchestrateur obligatoire** (workflow complet) :
- Toute nouvelle feature (spec dans `specs/features/todo/`)
- Refactor multi-fichiers
- Changement touchant l'auth, les permissions, les données personnelles ou les paiements

Étapes :
1. `Task(subagent_type="orchestrator", prompt="Prépare le plan pour <demande>")`
2. L'orchestrator retourne un plan structuré (check-list, briefs, invariants, critères de clôture)
3. L'agent principal exécute le plan séquentiellement, agent par agent
4. À chaque verdict bloquant (NO GO, Request changes), reboucler sur l'agent concerné
5. À la fin : rapport de synthèse, vérification de clôture, spec vers `done/`

**Security-reviewer seul, rôle AUDIT** (hors cycle, sans spec ni diff) :
- Audit périodique de la surface d'attaque — à provoquer délibérément, il ne se
  déclenche sur aucun changement
- Après une refonte de l'authentification, du routage ou du modèle de permissions :
  le rôle GATE, invoqué pendant le cycle, n'a vu que le diff — pas l'assemblage qui
  en résulte une fois le système regardé dans son ensemble

**Doc-writer obligatoire seul** (sans cycle complet, à la fin du tour courant) :
- Tout fix isolé qui modifie un comportement observable
- Plusieurs petits fixes dans une même session : doc-writer une fois par tour

**Travail direct acceptable** (sans orchestrateur ni doc-writer) :
- Corrections purement documentaires
- CSS sans impact fonctionnel
- Analyses, diagnostics, lectures de code

## Fichiers générés et releases

**Principe directeur : on versionne les sources, jamais les fichiers générés.** Les
livrables produits par le build (bundle, image, PDF de documentation, binaire) sont
attachés comme **assets des releases GitHub**, où ils sont horodatés, associés à un tag
et téléchargeables — sans alourdir l'historique git à chaque itération.

Conséquences concrètes :

- **La documentation générée a une source versionnée** (Markdown, HTML, `docs/`), tenue
  à jour **en continu** par la règle « Auto-vérification fin de tour ». Le format final
  (PDF, site statique) se régénère à la release et n'est **jamais commité**.
- **Un dérivé ne se corrige jamais à la main** : la prochaine exécution du script
  l'écrase. La correction se fait dans la source, toujours.
- **Exception assumée** : ce qui est *relevé* et non *généré* — un dump de crash, une
  trace d'incident, une capture d'un état de production — se versionne, parce que rien
  ne le régénère. Voir `docs/incidents/` si le projet en tient un.
- **La commande `/release` ne commite rien et ne pousse que le tag.** Un arbre de
  travail sale l'arrête : c'est à l'humain de décider quoi en faire.

## Mémoire de projet

`.claude/memory/` contient la mémoire accumulée par Claude au fil du projet — pièges,
hypothèses **réfutées**, incidents, principes rappelés par l'utilisateur. Elle est
**versionnée dans le dépôt** : par défaut Claude Code la range dans
`~/.claude/projects/…`, hors dépôt, donc sur une seule machine et sans sauvegarde.

Toute mémoire écrite pendant une session doit être **recopiée dans `.claude/memory/`**
pour survivre à un changement de poste. Procédure et format : `.claude/memory/README.md`.
**Aucun secret ne va dans ce dossier** — il est versionné.

## Principes

- **Changements minimaux** : pas de refactoring opportuniste, rester dans le périmètre de la spec
- **Le backend est la seule autorité** : le frontend n'est jamais une barrière de sécurité
- **Tests avant commit** : suite verte + lint propre obligatoires
- **Toujours mettre à jour la spec** en fin de travail avec le statut réel
- **Mesurer avant de conclure** : en debug, préférer une mesure au plus près de la source
  (requête brute, logs serveur) à un raisonnement sur les couches hautes

## Référence

Pour toute question sur le fonctionnement de l'équipe d'agents, l'arborescence,
le cycle des specs ou la logique des templates : lire **`GUIDE.md`** (manuel de
référence du kit) et répondre en le citant.

## Rappels Claude Code

- Lancer les commandes longues (build, suite de tests complète) en background si possible
- Ne pas lire `node_modules/`, dossiers de build, fichiers `.env`
- Ne jamais committer/pusher sans demande explicite de l'utilisateur
- En cas de doute sur une règle de sécurité : **demander avant d'agir**
