## Métadonnées
- **ID** : feature-010
- **Slug** : scenario-de-bout-en-bout-avec-echec
- **Type** : feature
- **Statut** : todo
- **Priorité** : haute
- **Version cible** : 0.7.0
- **Dernière mise à jour** : 2026-09-12
- **Spec(s) liée(s)** : feature-001 (le journal et sa reconstruction),
  feature-002 (le tableau de bord, dont l'apparence n'a jamais été vérifiée),
  feature-007 (le lancement, sans lequel le scénario reste manuel)

> **Étape G** du centre de contrôle — la dernière déclarée. Elle ne livre
> presque aucun code : elle **éprouve** ce que les six autres ont livré, sur
> un cycle réel qui **échoue quelque part**. Elle absorbe aussi la seule
> vérification que feature-002 a explicitement laissée non faite : l'apparence
> de l'interface.

## Domaines touchés
- [ ] API REST — sauf correctifs révélés par le scénario
- [x] Frontend — la vérification de rendu laissée en suspens par feature-002
- [ ] BDD / migrations
- [ ] Auth / permissions
- [ ] Données personnelles
- [ ] Intégrations externes
- [x] Tâches de fond — le scénario exerce les neuf hooks du collecteur

## Agents requis
- [x] spec-reader
- [x] architect
- [ ] security-reviewer, rôle GATE — non applicable en l'état : cette spec
      n'ouvre aucune surface. **Rôle AUDIT** en revanche demandé après
      l'étape D (voir « Notes pour agent »)
- [x] ux-ui-designer — la vérification d'apparence a besoin d'un référentiel :
      sans attendu écrit, une capture ne prouve rien
- [ ] backend-developer — seulement pour les correctifs que le scénario révèle
- [x] frontend-developer — idem, plus la vérification de rendu
- [x] test-engineer — c'est sa spec
- [x] code-reviewer
- [x] doc-writer

## Description
Exécuter un cycle complet du kit — spec, agents, gate de sécurité, tests,
revue, clôture — **en y provoquant un échec réel** (un NO GO, un Request
changes, un test rouge), puis vérifier que le tableau de bord en donne un
récit fidèle. Ce que le scénario révèle de faux est corrigé dans ce lot.

## Contexte
Le centre de contrôle a été construit sur des relevés réels, mais jamais sur
un cycle complet mené de bout en bout. Or les défauts trouvés jusqu'ici l'ont
tous été de la même manière : **en exécutant, jamais en relisant**. Les deux
fuites de mot de passe du collecteur, les quatre défauts d'`update_kit.sh`,
les deux comportements non documentés de `SubagentStop` — tous sortis d'un
lancement, aucun d'une relecture.

Trois zones restent, à ce jour, non éprouvées :

1. **Le chemin d'échec.** Les workflows observés jusqu'ici se sont bien
   passés. Or c'est le rebouclage — NO GO, Request changes, test rouge, retour
   à l'agent concerné — qui distingue le récit du kit d'une simple liste
   chronologique. Le module de reconstruction affirme distinguer « une boucle
   `tester → debugger → developer` d'un enchaînement normal » ; cela n'a jamais
   été constaté sur une vraie boucle.
2. **L'apparence de l'interface.** Explicitement non vérifiée par feature-002 :
   une capture headless n'aboutit pas, la page gardant une connexion SSE
   ouverte que le budget de temps virtuel de Chromium ne fait pas expirer.
   L'état d'avancement l'affiche tel quel — « ✅ livré · apparence non
   vérifiée ».
3. **Les cas comptés mais non expliqués.** Le collecteur compte les
   `fermetures_orphelines` et signale une `imbrication_suspectee` plutôt que de
   mentir en silence. Personne n'a encore regardé ces compteurs sur un cycle
   complet pour dire ce qu'ils valent.

## Comportement attendu

### Un cycle réel, avec un échec délibéré
- Le scénario part d'une **vraie spec** du dépôt et la mène jusqu'à `done/`,
  en passant par les agents que le kit impose.
- Au moins un échec est **provoqué volontairement** et documenté comme tel :
  un test rouge qui force un retour au développeur, ou un verdict bloquant qui
  force une reprise du design.
- Le rebouclage doit apparaître **comme un rebouclage** dans le tableau de
  bord, pas comme une succession d'agents sans lien.

### Ce que le scénario doit permettre d'affirmer
- Chaque passage d'agent du cycle réel figure dans le récit reconstruit.
- Le travail de l'agent principal y figure aussi (segment `"type":
  "principal"`), et le compte d'appels d'outils est cohérent avec la réalité.
- Les `fermetures_orphelines` relevées sont **expliquées** : combien, pourquoi,
  et pourquoi ce n'est pas un défaut — ou c'en est un, et il est corrigé.
- Les horodatages à la milliseconde suffisent réellement à ordonner deux
  événements consécutifs d'un même tour.

### La vérification d'apparence
- Un attendu écrit d'abord (`ux-ui-designer`) : ce que l'écran doit montrer,
  dans quelle hiérarchie, dans quels états — vide, chargement, erreur, fil
  long.
- Une méthode de capture qui aboutit malgré le flux SSE. Pistes à instruire,
  `architect` tranche : page servie avec le flux désactivé par paramètre, ou
  capture après fermeture explicite de la connexion, ou rendu d'un état figé
  depuis un journal d'exemple.
- Le résultat remplace la mention « apparence non vérifiée » du tableau
  d'avancement — ou la précise, si la vérification reste partielle. Ce qui
  n'est pas vérifié continue d'être dit.

### Cas limites
- Session interrompue en plein cycle (Ctrl-C, fermeture du terminal) : le
  récit doit rester lisible et ne pas afficher un passage ouvert pour
  toujours.
- Deux sessions simultanées dans le même dépôt : les workflows doivent rester
  séparés par `session_id`, sans mélange.
- Journal contenant des événements d'une version antérieure du collecteur :
  lecture sans plantage (le champ `runtime` a été inscrit dès le premier
  événement pour cela).
- Session détachée encore vivante après un `SessionEnd` : voir bug-002, dont
  ce scénario est le révélateur naturel.

## Comportement actuel
Le tableau de bord affiche des workflows reconstruits depuis des relevés
réels, mais aucun cycle complet du kit — avec gate, rebouclage et clôture —
n'a été observé de bout en bout. L'apparence de l'interface n'a jamais été
vérifiée. Les compteurs d'anomalies n'ont jamais été interprétés sur un cycle
entier.

## Contraintes techniques
- Le scénario doit être **rejouable** : ce qui n'est pas rejouable n'est pas
  une vérification, c'est une anecdote. Si le cycle complet ne peut pas être
  automatisé, la procédure manuelle est écrite pas à pas et versionnée.
- Aucune dépendance nouvelle (ADR-0006). Si la capture d'écran en exige une,
  elle reste un **outil de développement**, jamais une dépendance d'exécution
  du centre de contrôle.
- Les correctifs révélés restent **minimaux** : cette spec éprouve, elle ne
  refond pas. Un défaut trop gros pour un correctif minimal devient une spec
  à part.

## Fichiers potentiellement concernés
- `control-center/backend/events.py` — si le rebouclage n'est pas restitué
  fidèlement
- `control-center/web/*` — si la vérification d'apparence révèle un écart
- `control-center/README.md` — étape G, tableau d'avancement, mention
  « apparence non vérifiée » à lever ou préciser
- `docs/features/` — la fiche d'écran, si le projet hôte en tient une
- `specs/features/done/` — la spec réellement menée par le scénario
- `CHANGELOG.md`

## Livrables — check-list
- [ ] A1 — Scénario de bout en bout écrit, rejouable, avec échec délibéré
- [ ] A2 — Relevé du cycle réel : passages, outils, rebouclage, compteurs
- [ ] A3 — `fermetures_orphelines` et `imbrication_suspectee` expliquées ou corrigées
- [ ] B1 — Attendu visuel écrit par `ux-ui-designer`, avant toute capture
- [ ] B2 — Méthode de capture qui aboutit malgré le flux SSE
- [ ] B3 — Vérification d'apparence effectuée, écarts corrigés ou documentés
- [ ] C1 — `control-center/README.md` : étape G, mention d'apparence levée ou précisée
- [ ] C2 — `CHANGELOG.md`
- [ ] D1 — Les correctifs révélés par le scénario sont couverts par des tests
      validés par mutation

## Sécurité & données
- Authentification touchée : non
- Permissions / rôles touchés : non
- Données personnelles collectées ou traitées : non — **mais** le scénario
  produit un relevé réel qui sera cité dans la documentation. Toute capture
  d'écran ou extrait de journal publié doit être relu : le journal contient
  des chemins, des noms de fichiers et des têtes de commande.
- Migration destructive : non applicable
- Nouvelle exposition publique : non
- Risque identifié : publier un relevé sans le relire. La redaction du
  collecteur couvre les commandes, pas ce qu'un humain colle dans une doc.

## ADR attendu ?
- **Probable** : non
- **Critère(s) candidat(s)** : aucun a priori — éprouver ne décide rien. Si le
  scénario révèle que la reconstruction du rebouclage demande un modèle de
  données différent, ce choix-là relèverait des critères 1 et 4.
- **Sujet pressenti** : aucun

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- Aucun, sauf correctif révélé

### Écrans / flux UI concernés
- L'ensemble du tableau de bord, cette fois vérifié visuellement

### Schéma BDD / migrations
- Aucun

### Documentation à produire / mettre à jour

#### Docs vivantes
- `control-center/README.md` — étape G, tableau d'avancement A→G
- `docs/features/page-*.md` — fiche d'écran, si le projet hôte en tient une

#### Docs transverses
- `CHANGELOG.md` — entrée sous 0.7.0

#### Docs immuables
- Aucun ADR attendu

## Critères d'acceptation
- [ ] Un cycle complet a été mené, avec au moins un échec réel, et le tableau
      de bord en donne un récit **fidèle** — vérifié en comparant le récit
      affiché au déroulement réellement vécu
- [ ] Le rebouclage apparaît comme tel, distinct d'un enchaînement normal
- [ ] Le compte d'appels d'outils du récit correspond au compte réel
- [ ] Les compteurs d'anomalies sont expliqués, chiffres à l'appui
- [ ] L'apparence de l'interface est vérifiée contre un attendu écrit, ou ce
      qui reste non vérifié est dit explicitement
- [ ] Le scénario est rejouable par quelqu'un d'autre à partir de sa seule
      description
- [ ] Suite de tests complète verte, zéro régression
- [ ] Lint propre, pas de warning nouveau

## Plan de test manuel
1. **Cycle nominal** : mener une spec de `todo/` à `done/` en suivant le
   workflow imposé, tableau de bord ouvert, et comparer le récit affiché au
   déroulement vécu.
2. **Échec provoqué** : casser volontairement le code au moment des tests,
   forcer le retour au développeur, vérifier que la boucle se voit.
3. **Interruption** : couper la session en plein cycle, recharger le tableau
   de bord, vérifier qu'aucun passage ne reste ouvert indéfiniment.
4. **Deux sessions** : lancer deux sessions dans le même dépôt, vérifier que
   les workflows ne se mélangent pas.
5. **Apparence** : capturer chaque état de l'écran (plein, vide, chargement,
   erreur) et comparer à l'attendu écrit.

## Notes pour agent
- **C'est la spec qui met en application la leçon du 2026-09-12** : « le
  défaut se trouve en exécutant, pas en relisant ». Elle n'a de valeur que si
  elle est réellement jouée. La mener sur le papier serait une contradiction
  dans les termes.
- Un mutant qui survit est une information : soit un trou de couverture, soit
  une **équivalence** à documenter comme telle. Ne jamais le compter comme tué.
- `security-reviewer` en **rôle AUDIT** est à invoquer une fois l'étape D
  livrée : le rôle GATE n'aura vu que des diffs, pas l'assemblage complet
  — serveur, jeton, verrou, lanceur, hooks — une fois regardé d'ensemble.
  C'est exactement le cas que le rôle AUDIT existe pour couvrir.
- Deux bugs connus seront exercés par ce scénario : bug-001 (l'aperçu
  d'`update_kit.sh`) seulement s'il touche à la synchronisation, et bug-002
  (session vivante affichée comme close), qui apparaîtra dès la première
  session détachée.

## Hors périmètre
- Toute refonte révélée par le scénario : un défaut trop gros pour un
  correctif minimal devient sa propre spec
- Les étapes au-delà de G : il n'y en a pas de déclarée à ce jour
