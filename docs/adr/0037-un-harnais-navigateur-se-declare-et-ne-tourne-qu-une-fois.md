# ADR-0037 — Un harnais navigateur se déclare par un marqueur, et ne tourne qu'une fois par run ; amende ADR-0035 sur la cause de `bug-022`

## Statut

Accepté

## Date

2026-09-21

## Contexte

Run `35573591648` sur `main`, commit `8d83e28`, le 2026-09-21 : deux des
trois jobs qui exécutent la suite complète de `control-center/` (le job
système et le leg de matrice Python 3.11, introduits par `bug-018` /
[ADR-0035](0035-ce-qu-une-suite-verte-prouve-identite-et-intervalle-de-versions.md))
échouent sur la même trace : `subprocess.TimeoutExpired` après 30 s au
lancement de Chromium, `test_app_diagramme_navigateur.py:201`. Relancer les
seuls jobs en échec, sans changer une ligne, fait passer les 7 jobs au vert —
la définition même d'un test instable.

### Rectification de la cause — le corps de la spec était faux

La spec `bug-022` proposait d'abord une **contention** entre les trois jobs
de la matrice, lancés « sur le même pool ». **Réfuté par mesure**, par le
`debugger` puis l'agent principal : les deux jobs en échec du run
`35573591648` ont tourné sur des Worker ID et des **régions Azure
différentes** (`westus3`, `centralus`) — une matrice GitHub Actions alloue
une VM dédiée par entrée, « même pool » y désigne la flotte, pas un hôte
partagé. Aucune contention n'était possible entre ces deux jobs précis.

Mesure locale (4 vCPU, Chromium 152, page réelle du test) : 3 lancements
concurrents = 1,4–1,5 s ; bridés à 2 vCPU = 4,6 s ; contre un seuil de 30 s,
soit une marge de **6,5×** dans la pire condition mesurée. L'effet de
falaise n'apparaît qu'à ~9 processus simultanés — trois fois ce que
l'architecture actuelle peut produire (les fichiers d'un job s'exécutent en
boucle séquentielle, jamais en parallèle entre eux).

La cause retenue est l'**exposition**, pas la contention : avant `bug-018`,
**1** exécution par run offrait **1** occasion de croiser une VM GitHub
lente au démarrage (provisionnement à froid, gigue). La matrice fait passer
ce nombre à **3** exécutions indépendantes de la suite complète, donc à
**3** occasions indépendantes du même aléa — suffisant pour expliquer le
taux observé (1 run rouge sur 4) sans aucune contention entre jobs. La
corrélation que la spec avait vue (le taux d'échec augmente avec la
matrice) était réelle ; sa cause était fausse. C'est la troisième cause
racine erronée écrite pendant ce cycle du dépôt (après la pipeline GitLab
inexistante de `bug-019` et les tokens déclarés introuvables) — consignée
ici plutôt que corrigée en silence, conformément à la règle du dépôt sur les
diagnostics erronés.

### Ce que ça ne change pas

Les deux mécanismes (contention hypothétique, exposition mesurée)
convergent sur le même correctif : ramener de 3 à 1 le nombre d'exécutions
indépendantes des harnais navigateur. Ce qui a changé n'est que la
justification écrite, pas la décision de conception.

## Décision

### 1. Un harnais navigateur se déclare par un marqueur de module, jamais par son nom

`HARNAIS_NAVIGATEUR = True` en tête des trois fichiers concernés
(`control-center/web/test_app_diagramme_navigateur.py`,
`test_app_navigation_http.py`, `test_app_theme_navigateur.py`). Le job de
matrice (`centre-de-controle-matrice`) filtre les fichiers marqués après le
`find` ; le job système (`centre-de-controle`) ne filtre rien. Chaque
harnais navigateur tourne donc **exactement une fois** par run (le job
système), au lieu de trois.

Trois options mesurées pour reconnaître un harnais navigateur :

| option | mesure | verdict |
|---|---|---|
| nom de fichier `*_navigateur.py` | attrape 2 fichiers sur 3 — `test_app_navigation_http.py` lance Chromium sans porter ce suffixe | écartée : laisse le défaut ouvert sur un tiers du terrain |
| détection par contenu (constante `--headless` en AST) | attrape 3 sur 3 | écartée comme **règle** (muette sur `--headless=new`, un pilote futur type Playwright, ou un drapeau construit par concaténation) ; retenue comme **oracle** de secours |
| marqueur déclaré dans le fichier | explicite, meurt **avec** le fichier | **retenue** |

Le marqueur ne peut pas se périmer comme une liste écrite à la main :
`feature-021` supprimera `test_app_theme_navigateur.py`, et sa ligne
`HARNAIS_NAVIGATEUR` part avec lui, sans qu'aucun fichier tiers n'ait besoin
d'être édité.

### 2. Le seuil de 30 s est conservé, avec une reprise unique sur `TimeoutExpired`

Aucun seuil absolu n'est relevé. Un échec observé implique une VM plus de
vingt fois plus lente que la condition la plus défavorable mesurée en
local (1,5 s à froid, seul) — c'est le signe d'un incident de
provisionnement, pas d'un dépassement de justesse. Relever le seuil à 60 s
n'aurait couvert que la bande 20×–40×, sans qu'aucune mesure ne dise que
l'incident s'y trouve, et aurait doublé le pire cas d'un Chromium
réellement bloqué (7 lancements × 30 s = 3,5 min → 7 min).

`_lancer_navigateur()`, dupliquée localement dans les trois fichiers,
reprend **une seule fois** sur `subprocess.TimeoutExpired` — jamais sur un
échec d'assertion ni un code de retour non nul, ce qui masquerait une vraie
régression — et **imprime une ligne d'avertissement** à chaque reprise
effective : une reprise silencieuse transformerait une dérive de
performance en angle mort. Vérifiée par injection de faute (vrai
`TimeoutExpired`, deux vrais processus, aucun mock), sur 4 points : reprise
déclenchée une seule fois, avertissement imprimé une seule fois, un
deuxième échec consécutif remonte sans boucle, le cas nominal ne coûte
aucune reprise (0,001 s).

### 3. La garde est comportementale : elle exécute le bloc `run:`, elle ne le lit pas

`control-center/backend/test_ci_partition_navigateur.py` compare trois
ensembles calculés depuis les artefacts (jamais une liste écrite à la
main) : les fichiers **déclarés** (AST, ligne de module exacte), les
fichiers **détectés** (AST, oracle de secours), et les fichiers que le
**motif de filtrage extrait du YAML** sélectionnerait. Les trois doivent
coïncider. Le job matrice doit porter le filtre, le job système ne doit pas
le porter — c'est la garde du « ni zéro fois » : une copie du filtre dans le
job système ramènerait silencieusement les trois harnais à zéro exécution.

Ce test partiel est traité en détail dans « Ce qu'une garde qui énumère ne
peut pas prouver » ci-dessous, parce que la manière d'y arriver — pas
seulement son état final — porte la vraie leçon de ce cycle.

## Alternatives considérées

- **Allonger le délai (piste 1 de la spec).** Écartée avant même la
  rectification de cause : déplace le seuil sans rien supprimer, et
  reproduit le même symptôme au prochain job ajouté à une matrice. La
  rectification de cause ne change pas ce verdict — un seuil plus haut ne
  traite ni la contention hypothétique ni l'exposition mesurée.
- **Reprise seule, sans partitionnement.** Écartée : ne réduit pas le nombre
  d'exécutions indépendantes exposées à l'aléa d'une VM lente, elle absorbe
  seulement le symptôme une fois qu'il s'est produit. Retenue en
  complément du partitionnement, pas à sa place — estimation (échantillon
  minuscule, n = 4 runs) : le partitionnement seul ramènerait un taux
  observé de ~25 % par run à ~9 % par exécution (facteur 2,7) ; la reprise
  seule, si les décrochages sont indépendants d'un lancement à l'autre,
  ramènerait ~9 % à ~0,1 %.
- **Retirer la matrice.** Hors périmètre déclaré : `ADR-0035` a trouvé un
  vrai défaut de plancher de version Python (`_locale()` sur 3.12.3), la
  matrice n'est pas remise en cause.
- **Marquer par nom de fichier (`*_navigateur.py`).** Écartée et mesurée
  insuffisante : attrape 2 harnais sur 3, laisse le troisième s'exécuter
  trois fois en silence.

## Ce qu'une garde qui énumère ne peut pas prouver

C'est le cœur de cet ADR, et sa vraie valeur pour le reste du dépôt.

Chercher un texte dans un fichier de CI prouve qu'un texte est présent ou
absent ; jamais ce que le script gardé **fait** réellement à l'exécution.
Quatre reboucles de `test-engineer` / `code-reviewer` / `backend-developer`
l'ont établi, chacune avec des mutants mesurés :

1. **Une garde sur la forme d'une ligne.** `re.search("grep -qx '<motif>'",
   job_systeme) is None` vérifie qu'un texte est absent du job système —
   pas que ce job n'exclut rien. Mutant **A3** (découverte réécrite en
   `find … | xargs grep -Lx 'HARNAIS_NAVIGATEUR = True'`) fait tomber les
   trois harnais à **zéro exécution** dans les trois jobs, garde verte
   (41/41), job CI vert. Mutant **A** (`case … continue` dans la boucle) ne
   survit qu'au runtime, par chance.
2. **Deux checks de propriété, encore une énumération de syntaxes.**
   Mutant **A4** (`if`/`else` sans `continue`) et **A5** (second `mapfile`
   après la ligne canonique) passent encore, même conséquence : zéro
   exécution, garde verte.
3. **Changement de méthode : exécuter, pas lire.** La garde extrait le bloc
   `run:` de chaque job et le lance réellement (`bash -c`, `cwd` sur une
   arborescence factice, ~25 lignes), puis compare ce qui a **effectivement**
   tourné. Les deux anciens checks sont rétrogradés en diagnostics : sur
   A4, A5 et un mutant supplémentaire (**F**, masquage de `python3` par une
   fonction shell) ils restent verts, seul l'oracle comportemental tue.
4. **Un oracle ne vaut que son jeu de témoins.** Avec 4 témoins, le mutant
   **H** (exclusion par **nom** de fichier plutôt que par marqueur)
   échappait encore : le seul témoin marqué s'appelant `test_marque.py`,
   aucun témoin ne croisait la dimension « nom ». Deux harnais sur trois
   tombaient à zéro exécution, 46/46 vert — ironie mesurée, l'exclusion par
   nom est exactement le critère que la conception avait écarté au départ
   (« n'attrape que 2 harnais sur 3 »). Un 5ᵉ témoin, trouvé et **écrit** par
   l'implémenteur plutôt que silencieusement corrigé, a fermé un second
   mutant (**I**, exclusion par **contenu** — `grep -q chromium`).

État final : **5 témoins, croisant 3 dimensions** (marqueur, nom, contenu),
chacune justifiée par un mutant réellement mort, **9 mutants tués au total**
(A, A3, A4, A5, F, G4, G5, H, I). Le fichier de garde nomme explicitement ce
qu'il ne couvre **pas** — taille, répertoire, date de modification, ou toute
autre propriété qu'aucun témoin ne fait varier — avec la consigne d'ajouter
un témoin plutôt que de réécrire la phrase pour la rendre rassurante.

### Une erreur de l'agent principal à consigner

Pendant l'étape 8, une parade a été demandée « où elle manquait » côté job
système GitHub : le motif « une boucle qui partage son `stdin` avec ce
qu'elle lance » (PIEGES §48, mesuré sur `bug-019` où la boucle est un
`while read … done < liste.txt`). Cette parade a été **transposée sans
vérifier que le défaut existe dans la forme cible** : la boucle du job
GitHub est un `for` sur un tableau `mapfile`, immunisé **par construction**
contre le partage de `stdin` (mesuré 3/3). Le `< /dev/null` sur chaque
invocation reste utile en défense en profondeur, mais la comparaison
exécutés/découverts qui l'accompagnait y était **tautologique**, et le
commentaire la présentait comme une garde agissante avant correction.
Corrigé : le commentaire décrit désormais ce fil comme un fil-piège
tautologique dans cette forme précise, pas comme une protection.

## Conséquences

### Positives

- Chaque harnais navigateur tourne **exactement une fois** par run au lieu
  de trois, ramenant l'exposition à l'aléa d'une VM lente à son niveau
  d'avant `bug-018`.
- La reprise unique absorbe le résidu sans masquer une vraie régression
  (elle ne rattrape que `TimeoutExpired`, jamais un échec d'assertion), et
  laisse une trace visible (l'avertissement imprimé) plutôt qu'un silence.
- Le marqueur meurt avec le fichier qui le porte : `feature-021` peut
  supprimer `test_app_theme_navigateur.py` sans qu'aucune liste tierce ne
  doive être mise à jour.
- La garde compare trois ensembles calculés depuis les artefacts et exécute
  le bloc `run:` réel plutôt que de le lire — elle détecte un filtre copié
  dans le mauvais job (perte de couverture silencieuse), un marqueur oublié,
  et un marqueur mal placé (docstring plutôt que ligne de module).

### Négatives

- Deux jobs dont le script était jusqu'ici **dupliqué à l'identique**
  divergent désormais d'une clause (le filtre). C'est la divergence
  silencieuse que la garde existe pour empêcher, pas un défaut résiduel —
  mais elle doit être livrée dans le même commit que le filtre, jamais après.
- `_lancer_navigateur()` est dupliquée trois fois (une fonction de 6
  lignes), délibérément, plutôt que centralisée dans un module partagé sous
  `control-center/web/` : la liste des fichiers servables par le serveur
  n'exclut par construction que les noms commençant par `test_`, et un
  `_navigateur.py` partagé y deviendrait potentiellement servable.
- La garde comportementale (§3) ne couvre que les trois dimensions
  effectivement mesurées comme contournant une version antérieure de
  l'oracle (marqueur, nom, contenu). Une quatrième dimension d'exclusion —
  non identifiée à ce jour — pourrait y échapper ; la réponse mesurée est
  d'ajouter un témoin, jamais de réécrire l'affirmation de couverture.

### Ce que ça verrouille

- **Critère 1 (contrainte structurante)** : tout test navigateur futur, dans
  ce dépôt ou tout projet consommateur du kit, doit porter
  `HARNAIS_NAVIGATEUR = True` pour bénéficier du partitionnement — et tout
  projet consommateur hérite d'un workflow aux jobs volontairement
  asymétriques.
- **Critère 2 (décision invisible dans le code)** : le marqueur se voit ;
  la raison (« ce qu'on vérifie avec un harnais navigateur, c'est un rendu
  Chromium, pas une version de Python ; l'exécuter trois fois ne prouve rien
  de plus qu'une fois ») ne se voit nulle part sans cet ADR.
- **Critère 3 (alternatives crédibles)** : allonger le seuil, la reprise
  seule, retirer la matrice, marquer par nom de fichier — quatre options
  défendables à première lecture, trois écartées pour des raisons mesurées.
- **Critère 4 (verrouillage long terme)** : fixe ce qu'une entrée de matrice
  garantit désormais (couverture d'un intervalle de versions Python) et ce
  qu'elle ne garantit plus (répétition d'un test dont le résultat ne dépend
  pas de la version de Python) — et grave qu'une garde de partitionnement
  future doit être comportementale, jamais une lecture de motif dans un
  fichier YAML.

## Amendement d'ADR-0035

Cet ADR **amende** [ADR-0035](0035-ce-qu-une-suite-verte-prouve-identite-et-intervalle-de-versions.md),
il ne le révoque pas. ADR-0035 a posé l'intervalle de versions Python
déclaré et vérifié par matrice, et l'identité (root / non-root) sous
laquelle une suite verte est mesurée — ces deux décisions restent entières.
ADR-0037 en retire une conséquence non voulue : la couverture par intervalle
de versions ne s'applique qu'à ce dont le résultat dépend réellement de la
version de Python interprète ; un rendu Chromium n'en fait pas partie, et le
répéter à chaque leg de matrice ne mesure rien de plus qu'une fois — au prix
d'une exposition triplée à l'aléa d'une VM de CI lente.

## Références

- Fichiers : `control-center/web/test_app_diagramme_navigateur.py`,
  `test_app_navigation_http.py`, `test_app_theme_navigateur.py`
  (`HARNAIS_NAVIGATEUR = True`, `_lancer_navigateur()`) ;
  `.github/workflows/hygiene-specs.yml` (jobs `centre-de-controle` et
  `centre-de-controle-matrice`) ; `control-center/backend/test_ci_partition_navigateur.py`
  (garde neuve, oracle comportemental).
- Spec : `specs/features/doing/bug-022-les-tests-navigateur-expirent-quand-la-matrice-les-triple.md`
  — symptôme, RECTIFICATION de la cause racine, arbitrage de l'architecte,
  journal de bord des quatre reboucles de mutation.
- ADR liés : [ADR-0035](0035-ce-qu-une-suite-verte-prouve-identite-et-intervalle-de-versions.md)
  (amendé ici), [ADR-0017](0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md)
  (doctrine d'absorption d'un défaut dans le cycle qui livre la garde qu'il
  désarme — non invoquée ici, aucune garde livrée par ce cycle n'était
  désarmée par le défaut trouvé).
- Pièges du module : `control-center/PIEGES.md` (entrées ajoutées par ce
  cycle sur les gardes qui énumèrent, les oracles comportementaux et leurs
  témoins, et la portée réelle de PIEGES §48).
