# claude-agent-kit

Équipe d'agents, workflow de specs, ADR et garde-fous prêts à l'emploi pour démarrer
un projet avec Claude Code. Orienté application de gestion (portail web + backend
d'API REST), mais le cycle de travail lui-même ne dépend d'aucune techno.

**Ce dépôt n'est pas une application : c'est une référence à recopier.** Il ne contient
que l'outillage Claude et son échafaudage — aucun code métier, aucune stack. On le
clone, on copie son contenu à la racine d'un nouveau projet, on personnalise, et il
reste ici comme version de référence à faire évoluer.

Il est issu d'un projet réel où cette organisation a été rodée sur plusieurs mois de
cycles complets (features, debug de production, revues croisées, incidents). Il en
transpose la méthode en la débarrassant de tout ce qui était spécifique au projet
d'origine — mais chaque règle un peu inhabituelle qu'il contient a été payée par un
défaut réel, et le dit.

## Contenu

```
CLAUDE.md                     # Le contrat de travail de Claude (À PERSONNALISER)
GUIDE.md                      # Manuel de référence : qui fait quoi, pourquoi
.claude/
  settings.json               # Permissions de départ (larges en lecture, sûres en écriture)
  agents/                     # L'équipe : 12 agents spécialisés
    orchestrator.md           #   prépare les plans d'exécution multi-agents
    spec-reader.md            #   analyse d'impact des specs
    architect.md              #   conception, plans courts, verdicts ADR
    backend-developer.md      #   API REST, BDD, migrations
    frontend-developer.md     #   portail web
    security-auditor.md       #   GATE obligatoire : auth, RGPD, injections
    security-reviewer.md      #   AUDIT de la surface d'attaque, hors diff
    ux-ui-designer.md         #   ergonomie avant implémentation
    test-engineer.md          #   tests + lint + mutation, zéro régression
    debugger.md               #   investigation méthodique des bugs
    code-reviewer.md          #   revue avant tout commit
    doc-writer.md             #   documentation par tour, pas par cycle
  commands/
    release.md                # /release : ne commite rien, ne pousse que le tag
  memory/                     # Mémoire de projet versionnée (pièges, hypothèses réfutées)
  skills/
    spec-workflow/            # Cycle de vie des specs (todo → doing → done)
    security-checklist/       # Invariants de sécurité (chargée par security-auditor)
    dev-workflow/             # Commandes build/test/lint/déploiement (À PERSONNALISER)
    db-migrations/            # Check-list migrations BDD (réversibilité, N/N-1…)
specs/
  features/{todo,doing,done}/ # La file de travail
  features/_template.md       # Template de feature (obligatoire)
  modele.md                   # Template minimal bug/refactor
  modele_iteration.md         # Suivi d'itérations d'un cycle
tools/
  check_specs.sh              # Unicité des specs dans le cycle (CI + local)
  check_doc_links.sh          # Aucun lien mort dans la doc (CI + local)
.github/workflows/
  hygiene-specs.yml           # Lance les deux contrôles sur chaque commit
docs/
  adr/                        # Décisions d'architecture (avec template)
  API.md                      # Contrat REST (squelette)
  ARCHITECTURE.md             # Vue d'ensemble (squelette)
  features/, subsystems/      # Docs vivantes par écran / par module
CHANGELOG.md                  # Journal des changements visibles
.gitignore                    # Base raisonnable
```

## Démarrage d'un nouveau projet (15 minutes)

1. **Copier** le contenu de ce dépôt à la racine du nouveau projet — `.claude/`
   (dossier **caché**, le plus souvent oublié), `specs/`, `docs/`, `tools/`,
   `.github/`, `CLAUDE.md`, `GUIDE.md`, `CHANGELOG.md`, `.gitignore`.
   **Ne pas copier ce `README.md`** : c'est la notice du kit, pas celle du projet.
   `GUIDE.md`, lui, se copie — `CLAUDE.md` y renvoie pour toute question sur
   l'équipe d'agents.
2. **Personnaliser `CLAUDE.md`** : suivre le bloc de commentaire en tête
   (nom, stack, arborescence réelle, règles métier). C'est LE fichier que
   Claude lit à chaque session — sa précision conditionne tout le reste.
3. **Personnaliser `.claude/skills/dev-workflow/SKILL.md`** : y inscrire les
   commandes réelles de build/test/lint du projet.
4. **Relire `.claude/settings.json`** et l'adapter à votre gestionnaire de
   paquets et vos scripts.
5. **Personnaliser `.claude/commands/release.md`** (build, artefacts à joindre)
   ou le supprimer si le projet ne publie pas de release.
6. **Vérifier que les contrôles d'hygiène passent** : `./tools/check_specs.sh`
   et `./tools/check_doc_links.sh`. Ils tournent ensuite sur chaque commit via
   `.github/workflows/hygiene-specs.yml`.
7. `git init && git add -A && git commit -m "chore: kit de démarrage Claude"`.
8. Ouvrir Claude Code dans le dossier et lancer :
   > « Lis CLAUDE.md. Voici ce que doit faire l'application : … .
   > Crée la première spec dans specs/features/todo/. »

## Les principes qui font marcher ce kit (résumé d'expérience)

- **La spec est la source de vérité** : pas de travail sans spec, une spec à la fois,
  et la spec clôturée raconte ce qui s'est VRAIMENT passé (y compris les diagnostics
  erronés — l'honnêteté documentaire évite de refaire les mêmes erreurs).
- **L'orchestrator ne code pas et n'invoque personne** : il produit un plan avec des
  briefs prêts à l'emploi ; la session principale exécute. Cette séparation donne des
  briefs de qualité ET un contrôle humain entre chaque étape.
- **Le gate de sécurité est non négociable** : `security-auditor` passe DEUX fois —
  P1 sur le design (avant le code), P2 sur le diff réel (après). Les deux passes
  attrapent des choses différentes.
- **La revue avant chaque commit** attrape ce que l'auteur ne peut plus voir. Briefer
  le relecteur avec « un œil neuf » sur les zones qui ont déjà trompé quelqu'un.
- **La doc est une obligation par tour, pas un livrable de fin de cycle** : cinq fixes
  dans une session = cinq passages de doc-writer.
- **Les ADR capturent le pourquoi** : une décision par fichier, immuable, on écrit un
  nouvel ADR pour changer d'avis. La table de déclencheurs est dans CLAUDE.md.
- **En debug : mesurer au plus près de la source** avant de raisonner — et se méfier
  de ses propres commentaires de code périmés, qui égarent les revues suivantes.
- **Un test vert ne prouve rien tant qu'on ne l'a pas vu échouer** : tout test neuf est
  validé par MUTATION (casser volontairement le code protégé et vérifier que le test
  meurt). Sur le projet d'origine, trois mutations sur cinq ne tuaient aucun test.
- **Un garde-fou visible fait passer le relecteur** : chercher la PLACE de la garde dans
  le cycle de vie de la requête, jamais sa seule présence. C'est le rôle de
  `security-reviewer`, qui regarde le système là où le gate ne voit qu'un diff.
- **Une règle que rien ne vérifie n'est pas une règle** : l'unicité des specs et la
  validité des liens de doc sont contrôlées par la CI, pas par la bonne volonté.
- **On versionne les sources, on publie les générés** : les artefacts de build sont des
  assets de release, jamais du contenu commité.

## Ce que le kit ne fait pas

- Il n'installe aucune stack : backend, frontend, BDD et CI restent à créer selon
  vos choix (le kit encadre le *travail*, pas la technologie).
- Il ne remplace pas le jugement : les verdicts NO GO / Request changes des agents
  sont faits pour être lus, pas contournés.

## Faire vivre la référence

**La copie est un fork au jour J.** Un projet qui affûte un agent, découvre un piège ou
ajoute un garde-fou l'améliore *chez lui* — et cette amélioration est perdue pour les
projets suivants si personne ne la rapatrie.

- Quand une leçon apprise sur un projet vaut au-delà de lui, **la rétro-porter ici**
  et l'inscrire au `CHANGELOG.md` du kit, avec le défaut réel qui l'a motivée. Une
  règle sans son incident fondateur finit par se faire supprimer par quelqu'un qui
  la trouve excessive.
- Ce qui reste **spécifique à un projet** (chimie, matériel, métier) n'a rien à faire
  ici : c'est ce qui a fait dériver la première version du kit.
- Avant de repartir de ce dépôt pour un nouveau projet, **relire son `CHANGELOG.md`** :
  c'est le résumé de ce qui a changé depuis la dernière copie.
