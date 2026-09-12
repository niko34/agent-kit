# agent-kit

Équipe d'agents, workflow de specs, ADR et garde-fous prêts à l'emploi pour démarrer
un projet avec Claude Code ou GitHub Copilot. Orienté application de gestion
(portail web + backend d'API REST), mais le cycle de travail lui-même ne dépend
d'aucune techno.

**Ce dépôt n'est pas une application : c'est une référence à recopier.** Il ne contient
que l'outillage multi-agent et son échafaudage — aucun code métier, aucune stack. On le
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
  agents/                     # L'équipe : 11 agents spécialisés
    orchestrator.md           #   prépare les plans d'exécution multi-agents
    spec-reader.md            #   analyse d'impact des specs
    architect.md              #   conception, plans courts, verdicts ADR
    backend-developer.md      #   API REST, BDD, migrations
    frontend-developer.md     #   portail web
    security-reviewer.md      #   GATE obligatoire (auth, RGPD, injections) + AUDIT de la surface d'attaque, hors diff
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
    security-checklist/       # Invariants de sécurité (chargée par security-reviewer)
    dev-workflow/             # Commandes build/test/lint/déploiement (À PERSONNALISER)
    db-migrations/            # Check-list migrations BDD (réversibilité, N/N-1…)
.github/
  agents/                     # Profils GitHub Copilot générés depuis .claude/agents/
  copilot-instructions.md     # Pont entre le workflow commun et les outils Copilot
  workflows/
    hygiene-specs.yml         # Hygiène specs, liens et synchronisation des agents
specs/
  features/{todo,doing,done}/ # La file de travail
  features/_template.md       # Template de feature (obligatoire)
  modele.md                   # Template minimal bug/refactor
  modele_iteration.md         # Suivi d'itérations d'un cycle
tools/
  check_specs.sh              # Unicité des specs dans le cycle (CI + local)
  check_doc_links.sh          # Aucun lien mort dans la doc (CI + local)
  sync_copilot_agents.py      # Génère et contrôle les profils GitHub Copilot
  update_kit.sh               # Récupère les évolutions du kit dans un projet
.gitlab/ci/
  hygiene.yml                 # Variante GitLab CI — supprimer si GitHub
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
   les agents utilisent comme contrat commun — sa précision conditionne tout le reste.
3. **Personnaliser `.claude/skills/dev-workflow/SKILL.md`** : y inscrire les
   commandes réelles de build/test/lint du projet.
4. **Relire `.claude/settings.json`** et l'adapter à votre gestionnaire de
   paquets et vos scripts.
5. **Générer les profils GitHub Copilot** après toute modification d'un agent source :

   ```bash
   python3 tools/sync_copilot_agents.py --write
   ```

   Les fichiers `.github/agents/*.agent.md` sont des dérivés versionnés requis par
   Copilot : ne jamais les corriger directement.
6. **Personnaliser `.claude/commands/release.md`** (build, artefacts à joindre)
   ou le supprimer si le projet ne publie pas de release.
7. **Choisir sa forge — supprimer le pipeline de l'autre.** Le kit fournit les deux :
   - **GitHub** → garder `.github/workflows/hygiene-specs.yml`, supprimer `.gitlab/`
   - **GitLab** → supprimer `.github/workflows/`, et brancher
     `.gitlab/ci/hygiene.yml` depuis le `.gitlab-ci.yml` du projet
     (`include: - local: '.gitlab/ci/hygiene.yml'`). Conserver `.github/agents/` et
     `.github/copilot-instructions.md` si GitHub Copilot est utilisé dans l'IDE ; sinon,
     le dossier `.github/` entier peut être supprimé.

   Dans `.claude/commands/release.md`, supprimer de même la variante inutilisée
   (`gh` ou `glab`) — ou le fichier entier si la chaîne CI publie déjà les releases.
8. **Vérifier que les contrôles d'hygiène passent** : `./tools/check_specs.sh`,
   `./tools/check_doc_links.sh` et
   `python3 tools/sync_copilot_agents.py --check`. Ils tournent ensuite sur chaque commit.
9. `git init && git add -A && git commit -m "chore: kit de démarrage agents"`
   (à sauter si le dépôt du projet existe déjà).
10. **Déclarer le kit comme distant**, pour pouvoir récupérer ses évolutions plus
   tard (voir « Faire vivre la référence ») :

   ```bash
   git remote add kit https://github.com/niko34/agent-kit.git
   ```
11. Ouvrir Claude Code ou GitHub Copilot dans le dossier et lancer :
   > « Lis CLAUDE.md. Voici ce que doit faire l'application : … .
   > Crée la première spec dans specs/features/todo/. »

## Les principes qui font marcher ce kit (résumé d'expérience)

- **La spec est la source de vérité** : pas de travail sans spec, une spec à la fois,
  et la spec clôturée raconte ce qui s'est VRAIMENT passé (y compris les diagnostics
  erronés — l'honnêteté documentaire évite de refaire les mêmes erreurs).
- **L'orchestrator ne code pas et n'invoque personne** : il produit un plan avec des
  briefs prêts à l'emploi ; la session principale exécute. Cette séparation donne des
  briefs de qualité ET un contrôle humain entre chaque étape.
- **Le gate de sécurité est non négociable** : le rôle GATE de `security-reviewer`
  passe DEUX fois — P1 sur le design (avant le code), P2 sur le diff réel (après).
  Les deux passes attrapent des choses différentes.
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
  le cycle de vie de la requête, jamais sa seule présence. C'est le rôle AUDIT de
  `security-reviewer`, qui regarde le système là où son rôle GATE ne voit qu'un diff.
- **Une règle que rien ne vérifie n'est pas une règle** : l'unicité des specs et la
  validité des liens de doc sont contrôlées par la CI, pas par la bonne volonté.
- **On versionne les sources, on publie les générés** : les artefacts de build sont des
  assets de release, jamais du contenu commité. Les profils `.github/agents/` constituent
  l'exception nécessaire : Copilot ne peut les découvrir que s'ils sont dans le dépôt.

## Ce que le kit ne fait pas

- Il n'installe aucune stack : backend, frontend, BDD et CI restent à créer selon
  vos choix (le kit encadre le *travail*, pas la technologie).
- Il ne remplace pas le jugement : les verdicts NO GO / Request changes des agents
  sont faits pour être lus, pas contournés.

## Faire vivre la référence

**Un template n'est pas un lien : c'est une photocopie.** Un dépôt créé depuis un
template GitHub démarre avec un unique commit et **aucune relation git** avec son
template — ce n'est pas un fork. Conséquence, à connaître avant de s'organiser :

| Question | Réponse |
|---|---|
| La création recopie-t-elle le kit ? | **Oui**, intégralement, à cet instant-là |
| Une évolution du kit descend-elle dans les projets ? | **Non. Jamais.** |
| Une amélioration faite dans un projet remonte-t-elle au kit ? | **Non. Jamais.** |

Et c'est voulu : une propagation automatique écraserait le `CLAUDE.md` du projet, qui
est à la fois **le fichier le plus personnalisé** et **un fichier fourni par le kit**.

### Deux catégories de fichiers, à ne jamais confondre

**GELÉS** — fournis par le kit, jamais modifiés dans le projet. Une amélioration se fait
*dans le kit*, puis redescend : `.claude/agents/` (les génériques), les skills
`spec-workflow`, `security-checklist`, `db-migrations`,
`.github/copilot-instructions.md`, `tools/`, les templates de specs, `GUIDE.md`.
Les profils `.github/agents/` sont ensuite régénérés localement afin d'inclure aussi
les éventuels agents métier du projet.

**PERSONNALISÉS** — jamais rapatriés depuis le kit : `CLAUDE.md`, la skill
`dev-workflow`, `.claude/settings.json`, `CHANGELOG.md`, `.claude/memory/`, les fichiers
de CI, et **les agents métier propres au projet**.

### Récupérer les évolutions du kit

Le lien absent se recrée avec un simple distant — ce qui marche aussi bien d'un kit
GitHub vers un projet GitLab, puisqu'un distant n'est qu'une URL :

```bash
git remote add kit https://github.com/niko34/agent-kit.git
./tools/update_kit.sh --dry-run    # ce qui changerait
./tools/update_kit.sh              # récupère UNIQUEMENT les fichiers gelés
```

Le script refuse de tourner sur un arbre sale, n'écrase que les chemins gelés, et laisse
les modifications indexées pour que tu relises le diff avant de committer. Il signale
aussi les fichiers présents dans le projet et **absents du kit** — sans jamais les
supprimer : il ne peut pas distinguer un module retiré du kit d'un ajout local délibéré.

L'aperçu (`--dry-run` ou avant l'écriture réelle) décrit ce que la synchronisation va
**faire**, pas un diff entre deux arbres (voir ADR-0011) : chaque chemin gelé est classé
en à créer, à mettre à jour, identique (compté, non listé), ou non suivi par git. Un
chemin non suivi (typiquement ignoré par `.gitignore`) dont le contenu diverge de celui
du kit est signalé à part et **fait échouer la synchronisation réelle avant tout
écrasement** — ce contenu, jamais commité, ne serait récupérable par aucun retour
arrière. Trois issues, à choisir :

```bash
git add -- <chemin> && git commit   # 1. committer le fichier
mv <chemin> <ailleurs>              # 2. le déplacer hors du chemin gelé
```

ou l'exclure du périmètre géré en le retirant de `.kit-paths` (voir plus bas). Un
non-suivi déjà identique au kit ne bloque rien : il sera simplement indexé.

#### Un projet qui n'adopte pas tout le kit

Tous les projets ne descendent pas du kit. Certains le **précèdent**, et ont spécialisé
leurs agents pendant des mois — leur appliquer la liste gelée les écraserait d'un coup.

Un fichier **`.kit-paths`** à la racine du projet remplace alors la liste des chemins
gelés. Un chemin par ligne, `#` commente :

```
# Ce projet ne prend du kit que le centre de contrôle.
# Ses agents ont divergé et lui appartiennent.
control-center

# ⚠️ À ne pas oublier : sans cette ligne, le script ne se met plus à jour
# lui-même et se fossilise à la version du jour de son installation.
tools/update_kit.sh
```

⚠️ **Déclarer un chemin, c'est l'adopter ; l'omettre, c'est en devenir
propriétaire.** Un chemin absent de `.kit-paths` n'est plus jamais mis à jour depuis le
kit. La liste est **inclusive** à dessein : si le kit ajoute demain un chemin gelé, un
projet qui a forké n'en veut probablement pas, et une exclusion oubliée le lui imposerait
en silence.

### Et dans l'autre sens

Le retour d'une leçon vers le kit reste **manuel et délibéré** : on copie le fichier vers
le kit et on l'inscrit à son `CHANGELOG.md` avec le défaut réel qui l'a motivée. C'est le
moment où l'on décide si la leçon vaut au-delà de ce projet — un jugement qu'aucun script
ne peut rendre.

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
