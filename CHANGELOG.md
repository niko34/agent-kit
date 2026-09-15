# Changelog — <NOM DU PROJET>

Journal des changements **visibles par les utilisateurs**, version la plus récente en
premier, versions séparées par `---`. Tenu par `doc-writer` à chaque tour qui change
un comportement observable (cf. CLAUDE.md, « Auto-vérification fin de tour »).

<!-- Les entrées ci-dessous documentent le KIT lui-même. Au démarrage d'un projet,
     les remplacer par le journal du projet. -->

## [0.9.0] - 2026-09-15

### Outillage

- **`tools/update_kit.sh` : un chemin invisible ne se cache plus derrière un
  chemin qui lui ressemble trait pour trait.** Un chemin déclaré dans
  `.kit-paths` mais absent du kit produisait un message d'avertissement qui
  affichait le chemin tel quel (`echo` brut) : quand ce chemin contenait un
  caractère **invisible à l'affichage** — un BOM en tête de fichier, une
  espace insécable au lieu d'une espace ordinaire, un `\r` intérieur —, le
  message montrait un chemin visuellement identique au fichier réellement
  présent. L'utilisateur cherchait alors la cause ailleurs. Une ligne de
  diagnostic supplémentaire est désormais émise sur stderr, **avant** la
  ligne brute, qui nomme le caractère entre crochets (ex.
  `[U+00A0 ESPACE INSÉCABLE]`). Le chemin déclaré lui-même n'est **jamais
  modifié** — le correctif rend visible, il ne corrige pas à la place de
  l'utilisateur.
  - Couvre, à la livraison initiale : BOM (U+FEFF), espace insécable
    (U+00A0), `\r` intérieur, tabulation, contrôles ASCII 0-31 et 0x7F.
  - **Depuis la revue de code**, six familles de plus : U+200B (espace sans
    chasse), U+00AD (trait d'union conditionnel), U+2028/U+2029 (séparateurs
    de ligne/paragraphe), U+3000 (espace idéographique), les onze espaces
    typographiques U+2000–U+200A, et les contrôles C1 U+0080–U+009F.
  - Un chemin accentué **légitime** (non-ASCII mais imprimable, ex.
    `révision.md`) continue de s'afficher tel quel, sans échappement — les
    deux correctifs naïfs envisagés (`printf '%q'`, `cat -v`) ont été écartés
    parce qu'ils l'auraient mutilé à l'affichage.
  - **Pourquoi la forme repérable s'affiche avant la ligne brute** : un
    chemin peut contenir une séquence ANSI (`\x1b[2J` efface l'écran) —
    l'annoncer après l'aurait fait disparaître sous ce qu'elle explique.

### Centre de contrôle

- **Un agent tué par le runtime cesse d'être affiché « en cours » pour
  toujours.** Un agent dont la session est interrompue avant qu'il ait pu
  émettre son événement de fin (limite de session atteinte, processus tué,
  machine arrêtée) restait affiché « en cours » indéfiniment — relevé par
  l'utilisateur, sur son propre tableau de bord, 22 heures après les faits.
  Un troisième état apparaît désormais à l'écran : `sans_cloture`, additif à
  `termine`/`en_cours`, rendu en gris pointillé, visuellement distinct des
  deux autres. Ce n'est ni un succès ni un échec du travail — une fin
  **sans annonce**, jamais un verdict.
  - Un passage « en cours » dont **aucun événement** n'est rattaché depuis
    plus de `[workflows] seuil_abandon_minutes` minutes (défaut **120**,
    borné `[60, 10080]`) est requalifié `sans_cloture`. Les compteurs
    d'agents actifs ne le comptent plus comme actif.
  - **Le seuil ne vient pas de la durée maximale d'un agent** (24 minutes
    mesurées, 36 retenues en borne de test) mais du **silence légitime** —
    un `architect` a émis un seul appel d'outil en 127 secondes sans que le
    cycle soit à l'arrêt. Accuser à tort un agent vivant coûte plus cher
    qu'afficher trop longtemps un agent mort : on relancerait un travail en
    cours.
  - Un agent réellement en cours depuis longtemps n'est jamais requalifié —
    la garde reste **inerte** tant qu'aucune horloge n'est fournie, et une
    valeur de seuil non finie (`nan`, `inf`) est rejetée, sans quoi elle
    désarmerait silencieusement la requalification.
  - **Trouvé en jouant, pas en relisant** : le scénario de bout en bout de
    `feature-010`, joué pour de vrai (une vraie spec, un vrai échec planté
    dans le code, `test-engineer` invoqué sans un mot sur le défaut), a
    confirmé le dispositif — rebouclage observé et affiché à l'écran pour la
    première fois depuis la création du module — et révélé deux défauts de
    plus dans le rendu du récit (bandeau de rebouclage sans condition,
    libellé énumérant des agents non marqués).
- **Second thème clair, et une couleur d'identité par agent.** Le tableau de
  bord n'avait qu'un thème sombre figé et affichait tous les agents dans la
  même couleur — un `debugger` et un `test-engineer` étaient visuellement
  indiscernables. Une commande à trois positions apparaît désormais en haut
  à droite de la barre :
  - **Clair**, **système** (par défaut) et **sombre**. La position « système »
    annonce l'apparence à laquelle elle aboutit à cet instant — icône et
    libellé accessible suivent le thème résolu (« Suivre le système
    (actuellement sombre) ») — les deux autres positions gardent un libellé
    fixe.
  - Le choix persiste entre deux ouvertures et s'applique **avant le premier
    rendu** : aucune image ne montre le mauvais thème avant le bon. Avec
    `localStorage` indisponible (fenêtre privée, données bloquées), la page
    s'affiche normalement en position « système ».
  - En position « système », un changement de préférence de l'OS pendant que
    la page reste ouverte est suivi **sans rechargement**.
  - Chaque agent (huit rôles) reçoit désormais une couleur propre — trait,
    sigle et graduations — et un remplissage assorti, tenus dans les deux
    thèmes ; deux rôles n'ont jamais la même couleur ni le même sigle. Un type
    d'agent non reconnu reçoit un rendu neutre plutôt qu'une couleur recyclée.
  - ⚠️ **Les quatre couleurs d'état du thème sombre changent d'aspect** —
    conséquence mécanique de la séparation entre les couleurs d'état
    (gravité) et les couleurs d'identité (agent), désormais tenues à l'écart
    l'une de l'autre pour ne plus jamais se confondre visuellement :
    l'accent (bouton d'action) passe du laiton à un crème pâle, l'alerte de
    l'ambre à un pêche pâle, l'échec de la rouille à un rose pâle, et l'état
    « agent en cours » du teal à une menthe vive. Le contraste du bouton
    d'action monte de 8,0:1 à 13,8:1. Arbitré et accepté : une couleur d'état
    pâle en thème sombre ne peut plus être fortement saturée une fois
    placée au-dessus de la bande de clarté des identités d'agent, qui elle
    garde sa palette saturée.

### Documentation

- `docs/adr/0021-etat-sans-cloture-additif-et-seuil-declare.md` : nouvel ADR
  — l'état `sans_cloture`, additif au contrat existant, et le seuil déclaré
  en configuration, avec sa justification (silence légitime, pas durée
  maximale) et la garde `math.isfinite`.
- Note additive datée (2026-09-15) en pied d'
  [ADR-0014](docs/adr/0014-bornage-des-cycles-par-marqueur-declare.md) :
  « `SessionEnd` ne se déclenche jamais » était faux par généralisation —
  mesuré vrai sur les sessions courtes proprement closes, jamais sur une
  session longue reprise. La Décision (bornage par marqueur déclaré) reste
  valide. Corps non modifié.
- Note additive datée (2026-09-15) en pied d'
  [ADR-0020](docs/adr/0020-un-centre-de-controle-appartient-a-un-developpeur.md) :
  l'ADR était muet sur le transport — le jeton circule en clair, sans TLS.
  L'hypothèse manquante (segment réseau de confiance, sinon terminaison TLS
  par un intermédiaire local) est désormais écrite. Corps non modifié.
- `control-center/README.md` : documentation de `[workflows]
  seuil_abandon_minutes` à côté d'`agents_ouvrants` ; correction d'une
  affirmation inexacte sur le freinage (`429`) — vraie en lecture, fausse en
  écriture (défaut ouvert, voir `bug-010`) ; rappel de l'hypothèse de
  confiance réseau en tête de la section sur le modèle de déploiement.
- `docs/features/page-centre-de-controle.md` : première fiche du répertoire
  (jusque-là vide) — commande de thème à trois positions, persistance,
  suivi de l'OS sans rechargement, identité de couleur par agent.
- `docs/adr/0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md` :
  nouvel ADR — méthode d'une palette catégorielle à clarté et intensité
  constantes, saturation du cercle de teintes à huit rôles, séparation des
  jetons sémantiques et des jetons d'identité par un plancher perceptuel
  ΔE ≥ 0,10, méthode de mappage de gamut (réduction d'intensité, jamais
  d'écrêtage canal par canal) et marge de conception.
- `docs/DESIGN-SYSTEM.md` : tableau des teintes du §2 complété
  (`backend-developer` 220°, `doc-writer` 336°) ; correction du nombre de
  teintes bridées par le gamut en thème clair (quatre, pas deux) ; règle de
  précédence identité/état ajoutée au §8 (« l'identité prend le texte et le
  sigle, l'état prend le contour et la forme »), posée pour `feature-016`
  sans y être encore appliquée ; renvoi vers ADR-0022.
- `README.md` : mention de la commande de thème du centre de contrôle dans
  la description du contenu du dépôt.

---

## [0.8.0] - 2026-09-14

### Centre de contrôle

- **Le jeton dépend désormais du déploiement, plus de la route — lecture
  comprise.** Un centre de contrôle lancé avec `hote = "0.0.0.0"` (ou toute
  adresse non locale) et sans `fichier_jeton` livrait `GET /api/etat` en
  `200` à quiconque sur le réseau : quatorze champs, l'activité de
  développement entière (specs, workflows, état du dépôt, agents, journal
  d'événements), sans secret exigé. Seule l'écriture était gardée, et le
  serveur ne faisait qu'avertir au démarrage. Sous
  [ADR-0020](docs/adr/0020-un-centre-de-controle-appartient-a-un-developpeur.md),
  la règle change de forme :
  - sur `127.0.0.1` (`localhost`, `::1`, y compris via `0.0.0.0`) : le jeton
    reste **facultatif**, lecture et écriture fonctionnent sans secret ;
  - au-delà : le jeton devient **obligatoire, lecture comprise** — toute
    requête distante sans jeton valide est refusée (`401`).
  - **Ce qui peut surprendre** : un tableau de bord consulté depuis un autre
    poste **demande désormais un jeton pour lire**, pas seulement pour
    lancer. À l'inverse, en local, le jeton **devient facultatif** — s'il
    est configuré, il reste exigé (utile derrière un reverse proxy ou un
    conteneur dont le trafic arrive en `127.0.0.1`).
  - `Host` est validé sur toutes les routes (`421` sinon), `Origin` /
    `Sec-Fetch-Site` sur les routes d'écriture (`403`), et l'en-tête
    `Content-Security-Policy: frame-ancestors 'none'` est posé sur `/`.
  - `/api/etat` porte un nouveau champ `jeton_requis` (« ce déploiement
    exige-t-il un jeton pour ce demandeur ? »), distinct d'`ecriture_active`
    (« ce demandeur peut-il écrire ? ») — ce dernier était auparavant calculé
    sur la seule présence d'un jeton configuré, et annonçait `false` en local
    sans jeton alors que l'écriture y fonctionnait déjà.
- **Étape D : le tableau de bord peut désormais lancer un workflow déclaré, le
  suivre en direct, et l'interrompre.** Jusqu'ici `Handler` n'avait aucune
  méthode d'écriture (`do_POST` absent) : c'était la garantie d'
  [ADR-0004](docs/adr/0004-centre-controle-sans-route-ecriture.md). Les trois
  garde-fous qu'elle laissait en attente sont désormais du code, testés
  isolément **avant** la route elle-même (ordre imposé) :
  - **jeton partagé** (`backend/jeton.py`) : lu depuis un fichier hors dépôt,
    comparé à temps constant (`hmac.compare_digest`), permissions vérifiées
    (masque de bits, pas de comparaison numérique) ;
  - **écrivain unique** (`backend/verrou.py`) : prise atomique par `flock`,
    refus nommé, détection d'un fils orphelin après un crash serveur
    (`pid_fils` + `starttime`) ;
  - **plafond de dépense** (`backend/config.py`) : réellement transmis
    (`--max-budget-usd`) aux seules commandes explicitement autorisées à le
    recevoir.
  - Nouvelles routes : `POST /api/lancer`, `POST /api/interrompre`,
    `GET /api/lancement?depuis=<curseur>` (sortie en direct, sans SSE — voir
    ci-dessous).
  - Ce que ça remplace, et pourquoi ce n'est pas une régression de
    ADR-0004 (sa condition est **remplie**, pas contredite) :
    [ADR-0019](docs/adr/0019-jeton-comme-unique-barriere-et-table-des-routes-fermee.md).
- **Un seul champ dit si l'écriture est active, plus jamais deux calculs qui
  pourraient diverger.** Le tableau de bord affichait « Budget max : 5 $ » et
  « Écrivains : 1 » alors qu'aucun code ne les appliquait — le module
  qualifiait déjà cela lui-même de « pire forme de dette : une configuration
  qui a l'air d'être en service alors qu'elle ne pilote rien ». `/api/etat`
  porte désormais `ecriture_active`, calculé par le même test que celui qui
  conditionne `do_POST`, lu aux deux endroits de l'interface qui en dépendent.
  Quand l'écriture n'est pas active, l'interface affiche « 5 $ · non appliqué
  (lecture seule) », plus la raison.
- **Ce qui peut surprendre** : sans fichier de jeton déclaré, le serveur
  démarre en **lecture seule** et le dit au démarrage — ce n'est pas une
  panne. Un jeton présent mais mal protégé (mode plus permissif que `0600`,
  vide, trop court, contenant une espace ou un octet non-ASCII) **désactive
  l'écriture** sans jamais empêcher la lecture : le tableau de bord reste
  utilisable.
- **Ce que ce lot ne corrige pas, consigné plutôt que passé sous silence** :
  un orphelin détecté au redémarrage (`409`) n'est repris par aucun chemin de
  l'interface (`bug-011`) ; le freinage des échecs d'authentification est
  global et non par IP, comme la lecture anonyme non bornée de `/api/flux`
  (`bug-010`).

### Documentation

- `docs/adr/0019-jeton-comme-unique-barriere-et-table-des-routes-fermee.md` :
  nouvel ADR — ce qui remplace la garantie d'ADR-0004, l'abandon du SSE pour
  la sortie d'un lancement, le sort décidé du processus fils.
- `docs/adr/0004-centre-controle-sans-route-ecriture.md` : statut mis à jour
  (condition remplie), note additive datée renvoyant vers ADR-0019 — corps
  non modifié.
- `control-center/README.md` : section étape D, tableau d'avancement A→G,
  section « garantie structurelle » réécrite sur la garantie actuelle,
  compteurs de tests à jour (371 cas verts sur onze suites).
- `control-center/control-center.example.toml` : commentaires de
  `fichier_jeton`, `budget_max_usd`, `ecrivains_simultanes` à jour — ces clés
  sont désormais lues, plus seulement déclarées.
- `specs/features/todo/bug-010-freinage-global-et-lecture-anonyme-non-bornee.md`
  et `specs/features/todo/bug-011-orphelin-detecte-jamais-repris.md` : les
  deux constats reportés par ce cycle, ouverts en spec.
- **`bug-012`** — `docs/adr/0020-un-centre-de-controle-appartient-a-un-developpeur.md` :
  nouvel ADR, la fondation du correctif ci-dessus (l'invariant « un centre de
  contrôle appartient à un développeur », le jeton comme barrière de
  rattachement dépendant du déploiement).
- `control-center/README.md` : section « Le modèle de déploiement (ADR-0020) »
  en tête, section « Étape D+ » sur la détection d'adresse locale et les deux
  champs `ecriture_active`/`jeton_requis`, section Tests à jour (451 cas sur
  treize suites, dont le harnais frontend et son pont Python).
- `control-center/control-center.example.toml` : le bloc `[serveur]` énonce
  désormais le modèle ADR-0020 en tête — la phrase affirmant que « la lecture
  seule continue de fonctionner » sans jeton, devenue fausse à distance, est
  retirée et remplacée par la règle dépendant du déploiement.
- `specs/features/todo/bug-010-freinage-global-et-lecture-anonyme-non-bornee.md` :
  périmètre élargi (le freinage à 20 échecs prive désormais aussi le
  développeur local muni d'un jeton valide, lecture comprise).

## [0.7.0] - 2026-09-13

### Centre de contrôle

- **Le tableau de bord recoupe désormais les cycles au lieu d'en fondre
  plusieurs en un seul workflow.** Jusqu'ici, un workflow était affiché par
  session : une session interactive qui enchaînait plusieurs cycles de spec
  (constaté en pratique — quatre cycles, 45 passages d'agents sur quinze
  heures) les présentait comme un seul récit continu, sans séparation.
  `reconstruire()` accepte désormais `agents_ouvrants`, une liste déclarée en
  configuration (`[workflows] agents_ouvrants`, vide par défaut) : un
  `SubagentStart` dont l'`agent_type` y figure ouvre un nouveau segment.
- **Et dit quand la frontière n'a pas pu être établie**, plutôt que de
  découper au jugé : liste vide, ou aucun agent de la liste rencontré ⇒ le
  workflow reste une session entière (`bornage = session entière`) ; les
  événements antérieurs au premier marqueur rencontré forment un segment à
  part qui n'affirme rien sur son contenu (`bornage = avant le premier
  repère`). Le tableau de bord affiche ce bornage, ainsi que l'indice du cycle
  et l'agent qui l'a ouvert.
- **Ce que ça n'améliore pas, assumé** : un cycle mené sans l'agent ouvrant
  déclaré (typiquement un fix isolé sans `orchestrator`) reste rattaché au
  segment précédent — c'est visible à l'écran, pas masqué. `SessionEnd` ne se
  déclenchant jamais en pratique (0 occurrence relevée sur 1563 événements),
  tous les segments d'une session continuent d'afficher « sans fin observée »,
  y compris ceux manifestement clos — ce défaut appartient à `bug-002`.
- Le nombre de workflows envoyés au tableau de bord n'est plus figé à 10 : il
  est désormais configurable (`[workflows] affiches`, défaut 20, borné
  [1, 100]), pour compenser la fenêtre d'historique plus courte qu'ouvre le
  découpage par segment.

### Outillage

- **`tools/update_kit.sh` : `.kit-paths` a désormais une grammaire ligne à
  ligne, et quatre défauts de parsing sont corrigés.** Établis par exécution
  sur clones jetables (feature-012) :
  - un `.kit-paths` enregistré en **CRLF** (un éditeur Windows suffit)
    perdait **tout** son périmètre déclaré — le `\r` terminal survivait au
    pipeline `sed | grep`, et le script accusait à tort le distant « kit ».
    Un `\r` terminal est désormais retiré ligne à ligne, avant tout le
    reste.
  - un chemin contenant une **espace** était découpé en plusieurs mots par
    le shell et disparaissait **en silence** ; il est désormais traité comme
    un seul chemin (les espaces de tête et de queue restent interdites,
    voir [ADR-0015](docs/adr/0015-grammaire-kit-paths.md)).
  - un chemin déclaré dans `.kit-paths` mais **absent du kit** était avalé
    sans un mot ; il est désormais nommé sur stderr, sans bloquer les autres
    chemins déclarés.
  - ⚠️ **un `.kit-paths` contenant un glob (`*`) change de comportement.**
    Il était auparavant expansé par le shell contre le répertoire **du
    projet** (jamais l'arbre du kit) : un projet déclarant
    `.claude/agents/*` ne recevait donc jamais un fichier ajouté côté kit,
    seulement ce qu'il possédait déjà — ADR-0008 s'en trouvait vidé de son
    sens. Le glob est désormais **littéral** : s'il ne correspond à aucun
    chemin exact côté kit, il est nommé comme un chemin absent. Un
    `.kit-paths` qui utilisait `*` doit être réécrit en chemins explicites.
  - le message « Le distant « kit » pointe-t-il bien sur le kit ? »
    n'apparaît plus sur une cause purement locale (CRLF, espace, glob,
    `.kit-paths` vide ou entièrement commenté) : trois diagnostics distincts
    remplacent le message unique — déclaration vide, aucun chemin déclaré
    trouvé côté kit, ou véritable soupçon de mauvais distant.
  - `presents` est désormais un tableau indexé (plus aucune expansion non
    quotée d'une liste de chemins) ; 55 → 71 tests ; `shellcheck` passe de
    un avertissement à zéro.
- **`tools/update_kit.sh` : troisième garde de la famille `bug-001`/`bug-003`
  — un chemin gelé attendu comme répertoire mais occupé par un fichier
  régulier n'est plus détruit en silence.** Établi par exécution : un fichier
  **ignoré** occupant l'emplacement d'un répertoire du kit (ex.
  `.claude/skills/db-migrations`) était classé « à créer » dans l'aperçu,
  puis remplacé par un répertoire lors de la synchronisation réelle — sortie
  0, contenu irrécupérable puisqu'absent de l'index. Chaque ANCÊTRE (jamais
  la feuille) du chemin de destination est désormais examiné ; un ancêtre non
  récupérable (non suivi, ou suivi mais divergent de `HEAD`) fait échouer la
  synchronisation avant tout `git checkout`, et l'aperçu le signale dans sa
  propre catégorie plutôt qu'en « à créer ». Un ancêtre suivi et identique à
  `HEAD` ne bloque rien. **Ce qui peut surprendre** : une synchronisation qui
  réussissait jusqu'ici en silence peut désormais refuser. Voir ADR-0016.
  **Ce que ça n'améliore pas** : la fidélité des noms cités par git
  (`bug-008`) reste un angle mort de cette garde comme des précédentes ; le
  cas inverse — un répertoire **suivi** occupant la place d'un fichier gelé —
  n'est pas couvert et détruit toujours son contenu ignoré en silence, sortie
  0 (`bug-009`) ; l'aperçu reste muet sur les liens symboliques, liens cassés
  et FIFO (`feature-014`). 71 → 77 tests, `shellcheck` toujours à zéro.
- **`tools/update_kit.sh` : trois gardes de plus, premier cycle mené sous le
  régime « un défaut qui désarme la garde livrée entre dans le cycle qui la
  livre »** (`bug-008` + `bug-009`, voir
  [ADR-0018](docs/adr/0018-refus-nomme-des-noms-cites-et-quatrieme-garde-sur-la-feuille.md)) :
  - un nom de fichier gelé contenant un **guillemet double, un retour à la
    ligne, une tabulation ou un antislash** ressort toujours **cité** par
    git, même avec `core.quotepath=off` (qui ne dé-cite que les accents). Un
    tel nom se classait « à créer » et écrasait l'original en silence ; la
    synchronisation **refuse** désormais nommément, avant toute
    classification ;
  - un **répertoire suivi** occupant la place d'un fichier gelé, et contenant
    du contenu non récupérable (non suivi, ignoré, ou gelé et divergent),
    était **détruit en entier** par `git checkout` (`remove_subtree`), sortie
    0 — y compris le contenu ignoré, irrécupérable. La synchronisation
    **refuse** désormais si ce répertoire contient quoi que ce soit
    d'irrécupérable ; un répertoire entièrement suivi et propre continue de
    passer ;
  - un **sous-module git** occupant la même place perdait **tout son
    historique embarqué** de la même façon, invisible à `git status` comme à
    `git ls-files --others` : catégorie et message dédiés.

  **Ce qui peut surprendre** : une synchronisation qui réussissait peut
  désormais **refuser**, notamment sur un nom de fichier gelé contenant l'un
  des quatre caractères ci-dessus. **Ce que ça n'améliore pas** : `bug-005`
  (caractère invisible non affiché dans les messages), `bug-007` (blocage
  muet sur un chemin épinglé non divergent — un cas de **FIFO** qui fait
  bloquer `git hash-object` indéfiniment y a été reporté), `feature-013` (un
  sous-module occupant la place d'un **répertoire** attendu par le kit, cas
  distinct du précédent), `feature-014` (état laissé par un `checkout`
  partiellement échoué). 44 → 65 tests dans `test_update_kit.py`, 24 → 25
  dans `test_harnais_kit.py`, `shellcheck` toujours à zéro.

### Intégration continue

- **La suite de tests du centre de contrôle est enfin exécutée par une CI**,
  sur GitHub et sur GitLab — elle ne l'était par aucune des deux jusqu'ici.

### Documentation

- `docs/adr/0018-refus-nomme-des-noms-cites-et-quatrieme-garde-sur-la-feuille.md`
  [nouveau] : trois décisions — la partition de fidélité de type se referme
  sur la feuille répertoire suivi (ADR-0016 non modifié) ; `bug-008` se ferme
  par refus nommé plutôt que dé-citation ou lecture NUL (alternatives
  écartées par exécution) ; l'écart de grain entre détection par fichier et
  écriture par racine est constaté et assumé, pas fermé — avec correction
  d'une affirmation erronée du plan initial sur ce que perd une détection
  manquée. Deux constats d'audit post-plan (fichier gelé après un voisin
  propre, sous-module en travers) et les terrains non fermés (`bug-005`,
  `bug-007`, `feature-013`, `feature-014`).
- `docs/adr/0016-fidelite-de-type-des-chemins-geles.md` : note additive datée
  du 2026-09-13, renvoyant vers ADR-0018 pour le cas inverse suivi — corps
  non modifié.
- `README.md` : la section synchronisation décrit les trois catégories
  neuves de l'aperçu (nom cité, répertoire en travers, sous-module en
  travers) et leur motif de refus.
- `specs/features/todo/bug-007-blocage-muet-sur-chemin-epingle-non-divergent.md` :
  constat d'audit reporté — un FIFO fait bloquer `git hash-object`
  indéfiniment.
- `specs/features/todo/feature-013-geles-personnalises-conditionnels.md` :
  constat d'audit reporté — un sous-module occupant la place d'un
  **répertoire** attendu par le kit.
- `specs/features/todo/feature-014-apercu-effets-de-bord-echecs.md` :
  constat d'audit reporté — FIFO et lien cassé remplacés sans un mot,
  complément au constat déjà présent de l'audit `bug-006`.
- `docs/adr/0016-fidelite-de-type-des-chemins-geles.md` [nouveau] : la garde
  de fidélité de type ne porte que sur les ancêtres d'un chemin gelé, jamais
  sur sa feuille — la feuille est déjà couverte par la garde de `bug-001`, et
  `code-reviewer` a vérifié par mutation qu'étendre l'invariant à la feuille
  fait mourir dix tests préexistants. Alternatives écartées (laisser
  `git checkout` échouer seul, traiter le cas en dur) et ce que la décision
  ne ferme pas (noms cités, liens symboliques, atomicité, cas inverse).
- `README.md` : la section synchronisation décrit la nouvelle catégorie
  d'aperçu (obstacle de type) et son motif de refus.
- `docs/adr/0015-grammaire-kit-paths.md` [nouveau] : `.kit-paths` a une
  grammaire et c'est un contrat public — le compromis du trim explicite (prix
  des espaces intérieures), les alternatives écartées (refus nommé de
  l'espace, expansion du glob côté kit) et ce que ça verrouille.
- `README.md` : la section sur les projets qui n'adoptent pas tout le kit
  décrit désormais la grammaire complète de `.kit-paths`.
- `docs/adr/0014-bornage-des-cycles-par-marqueur-declare.md` [nouveau] :
  pourquoi le bornage est un paramètre déclaré et jamais un nom d'agent en
  dur, les trois refus de découpage au jugé, alternatives écartées
  (corrélation avec `specs.py`/`vcs.py`, événement de bornage explicite).
  Supersède [ADR-0002](docs/adr/0002-graphe-execution-plat.md) sur le seul
  point du bornage.
- `docs/adr/0002-graphe-execution-plat.md` : note additive datée du
  2026-09-13 — l'hypothèse « un workflow est une session » a été réfutée à
  l'usage ; le reste de l'ADR (graphe plat, absence de `Task`) reste valide.
- `control-center/README.md` : section « Pourquoi le graphe est plat »
  corrigée (elle répétait l'hypothèse réfutée), compteurs de tests et lot de
  mutants de la section Tests mis à jour.

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
- **Nouvelle garde d'écrasement, pour les fichiers gelés par un bit git** :
  un fichier **suivi** mais marqué `git update-index --skip-worktree` (ou
  `--assume-unchanged`), dont le contenu local diverge de `HEAD` et n'a
  jamais été committé, fait désormais **échouer** la synchronisation réelle
  avant tout `git checkout`. Motif : ces deux bits rendent `git status
  --porcelain` aveugle par construction — la garde d'arbre propre ne voyait
  rien, et la garde d'écrasement des non-suivis (ci-dessus) ne couvre que
  les fichiers non suivis. Sans cette garde, `git checkout` écrasait le
  contenu **et** effaçait le bit posé, sans laisser aucune trace de
  l'intention de l'utilisateur. **Ce qui peut surprendre** : une
  synchronisation qui passait jusqu'ici en silence peut désormais sortir en
  erreur ; un projet qui fige un fichier avec `skip-worktree` devra lever le
  bit (`git update-index --no-skip-worktree -- <chemin>`), déplacer le
  fichier, ou l'exclure via `.kit-paths` pour débloquer la synchronisation.
  Un fichier gelé **identique** au kit n'est jamais bloqué ; un fichier gelé
  qui n'a rien à perdre (contenu local == `HEAD`) n'est pas bloqué non plus,
  mais un avertissement signale que `git checkout` va effacer le bit sans
  autre forme de procès. Voir ADR-0013.
- **Correctif, le plus grave de ce lot pour tout projet francophone** : un
  nom de fichier accentué (ou plus largement non-ASCII) désarmait
  silencieusement **toutes** les gardes ci-dessus. `git ls-tree` cite par
  défaut (`core.quotepath`) ces octets — `révision.md` sortait sous la forme
  `"r\303\251vision.md"` — et le test d'existence de la classification
  cherchait alors un fichier absent sous cette forme précise, le classait
  « à créer », et `git checkout` l'écrasait sans un mot. Les appels
  concernés portent désormais `-c core.quotepath=off`. Voir ADR-0013.
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
- **`tests/harnais_kit.py` [nouveau]** (feature-006, lot 1) : le harnais de
  `test_update_kit.py` est extrait en module partagé, confinement étendu à 4
  variables `GIT_*` supplémentaires trouvées par l'audit sécurité
  (`GIT_CONFIG_PARAMETERS`, `GIT_CONFIG_COUNT`, `GIT_TEMPLATE_DIR`,
  `GIT_EXEC_PATH`), et enrichi de primitives (`.kit-paths`, faux `.github/`,
  arbre sali, fichier non inscriptible, `skip-worktree`) pour les lots
  suivants. `tests/test_harnais_kit.py` [nouveau] : auto-contrôles du
  harnais lui-même, variable de confinement par variable. Voir ADR-0012.
- Cinq gardes d'usage d'`update_kit.sh` couvertes (arbre sale en réel et en
  `--dry-run`, distant `kit` absent, hors dépôt git, projet déjà aligné),
  chacune protégée par `affirmer_seule_garde()` — un cas qui passerait pour
  la mauvaise raison, comme sur bug-001, échoue désormais.
- **`GardeGelesPerteTest` et `NomsAccentuesTest` [nouveaux]** (bug-003) : la
  suite passe de 42 à 55 cas. Couvrent la garde des fichiers gelés
  (`skip-worktree`/`assume-unchanged`), la parité `--dry-run`/réel sur ce
  cas, le fichier gelé identique ou sans perte réelle, et le correctif des
  noms accentués. Matrice de mutation diagonale sur neuf passes, aucun cas
  préexistant tué. Nouvelle clé `bit_gele` dans `MARQUEURS_DE_GARDE`
  (`tests/harnais_kit.py`), conformément à ADR-0012. Voir ADR-0013.
- **Une garde d'`update_kit.sh` qui n'avait jamais fonctionné est réparée** :
  le message « Ce script doit tourner dans un dépôt git » ne pouvait jamais
  s'afficher, `cd ""` réussissant silencieusement en bash quand la
  substitution est vide. Trouvé à l'exécution, pas par relecture.

### Intégration continue

- **Une CI exécute enfin `tests/`** : jusqu'ici, ni les 4 cas de
  `test_update_kit.py` ni les 9 de `test_sync_copilot_agents.py` ne
  tournaient ailleurs qu'à la main, en local. Job distinct, hors du budget
  « une seconde » des trois contrôles d'hygiène existants (voir GUIDE.md).
- **Le contrôle des profils Copilot existe désormais aussi côté GitLab**
  (`.gitlab/ci/hygiene.yml`), en parité avec `.github/workflows/hygiene-specs.yml`.

⚠️ **Action manuelle pour les consommateurs du kit** : un projet dont le
`.kit-paths` liste `tests/test_update_kit.py` explicitement ne recevra **pas**
automatiquement `tests/harnais_kit.py` ni `tests/test_harnais_kit.py`
(`.kit-paths` est une liste inclusive, ADR-0008) — sa suite cassera à
l'import (`ModuleNotFoundError: harnais_kit`). Ajouter les deux fichiers à
son `.kit-paths`.

### Documentation

- `docs/adr/0011-apercu-recapitulatif-d-operations.md` [nouveau] : pourquoi
  l'aperçu décrit des opérations et non un diff d'arbres, alternatives
  écartées (`numstat` réinterprété, `ls-tree`/`ls-files`, sauvegarde `.bak`
  automatique).
- `docs/adr/0012-harnais-de-test-partage-et-doctrine-anti-chevauchement.md`
  [nouveau] : pourquoi un harnais unique et `affirmer_seule_garde()`,
  alternatives écartées (dépôt façonné par garde sans assertion croisée,
  extraction des gardes en fonctions shell, primitives écrites au fil de
  l'eau). Impose aux lots feature-012, feature-013, feature-014 et bug-003
  de déclarer leur marqueur et de produire une matrice diagonale.
- `README.md` : section « Récupérer les évolutions du kit » mise à jour avec
  les quatre issues de l'aperçu et la garde d'écrasement.
- `GUIDE.md` : section sur les contrôles d'hygiène — quatrième contrôle
  (tests), pourquoi il est hors du budget d'une seconde, parité des forges
  sur le contrôle Copilot.
- `specs/features/todo/feature-006-tests-de-update-kit.md` : note sur le
  harnais livré en avance par bug-001.
- `specs/features/todo/feature-012-kit-paths-gouverne-seul.md`,
  `feature-013-geles-personnalises-conditionnels.md`,
  `feature-014-apercu-effets-de-bord-echecs.md`,
  `bug-003-skip-worktree-echappe-aux-gardes.md` : note sur le harnais livré
  et l'obligation ADR-0012 (marqueur de garde déclaré + matrice diagonale).

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
