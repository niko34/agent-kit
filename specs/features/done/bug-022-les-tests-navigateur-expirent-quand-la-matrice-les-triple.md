# Bug — les tests navigateur expirent depuis que la matrice les exécute trois fois

## Métadonnées
- **ID** : bug-022
- **Slug** : les-tests-navigateur-expirent-quand-la-matrice-les-triple
- **Type** : bug
- **Statut** : todo
- **Priorité** : **haute** — une CI qui rend deux verdicts sur le même commit
  ne mesure plus rien, et c'est exactement ce que `bug-018` venait de fermer
- **Dernière mise à jour** : 2026-09-21
- **Spec(s) liée(s)** : **`bug-018`**, dont le livrable A5 a introduit la
  matrice ; `feature-017` et `feature-020` (les tests de diagramme concernés)

> ⚠️ **Régression causée par le cycle précédent.** La matrice `setup-python`
> ajoutée par `bug-018` fait passer la suite complète de **1 à 3 exécutions
> parallèles**, donc de 1 à 3 lancements simultanés de Chromium. Le délai de
> 30 s codé en dur tenait pour un, il ne tient plus pour trois.

## Agents requis
- [x] spec-reader · [x] architect · [x] test-engineer · [x] code-reviewer · [x] doc-writer
- [ ] security-reviewer — aucune surface d'authentification
- [ ] backend-developer, frontend-developer, ux-ui-designer
- [x] debugger — si la cause proposée ci-dessous devait être réfutée

## Symptôme observé

Run `35573591648`, sur `main`, commit `8d83e28`, le 2026-09-21 :

| job | verdict |
|---|---|
| Suite de tests (control-center/) | **échec** |
| Suite de tests (control-center/) — Python 3.11 | **échec** |
| Suite de tests (control-center/) — Python 3.13 | succès |
| les 4 autres | succès |

```
subprocess.TimeoutExpired: Command '['/usr/bin/chromium', '--headless',
'--disable-gpu', '--no-sandbox', '--dump-dom', 'file:///tmp/…']'
timed out after 30 seconds
```

Même trace dans les **deux** jobs en échec, `test_app_diagramme_navigateur.py`,
ligne 201.

**Relance des seuls jobs en échec, sans changer une ligne : les 7 jobs passent.**
Même commit, même code, rouge puis vert — c'est la définition d'un test
instable, et la preuve que ce n'est pas un défaut reproductible.

## Cause racine — établie par recoupement, à confirmer

Deux facteurs se cumulent :

1. **Un seuil absolu sur une machine dont on ne contrôle pas la charge.**
   `test_app_diagramme_navigateur.py:201` passe `timeout=30` à `subprocess.run`
   pour un lancement de Chromium sans fenêtre.
2. **La concurrence a triplé.** Avant `bug-018`, **un** job exécutait la suite
   complète. La matrice en ajoute deux : trois jobs lancent désormais Chromium
   en parallèle sur le même pool.

Sur les deux runs de la PR, les trois jobs sont passés ; sur `main`, deux ont
expiré. Le seuil est franchi de justesse, ce qui est cohérent avec un effet de
charge et non avec un défaut de code.

⚠️ **Non vérifié** : que la contention soit bien la cause, et non par exemple une
différence d'image ou un Chromium plus lent à froid. Le `debugger` doit le
confirmer ou le réfuter **avant** correction — le kit a déjà payé une cause
racine supposée (`bug-002`, et `bug-019` dont le récit était faux).

## Correctif attendu — deux pistes, la seconde recommandée

**Piste 1 — allonger le délai.** Simple, et mauvaise : elle déplace le seuil
sans le supprimer. On y retombera au prochain job ajouté à la matrice, et le
test restera une mesure de la charge du runner déguisée en mesure du code.

**Piste 2 — sortir les tests navigateur de la matrice.** Ce que les bornes 3.11
et 3.13 vérifient, c'est le comportement du **Python**, pas le rendu d'une page
dans Chromium. Exécuter trois fois un test de navigateur ne prouve rien de plus
qu'une fois et coûte exactement l'instabilité observée. La matrice lancerait la
suite **sans** les harnais navigateur ; le job système, lui, les garderait.

⚠️ Si la piste 2 est retenue, elle crée une **asymétrie** entre les jobs — donc
un risque de la voir diverger en silence. Elle doit être **gardée par un test**,
comme `test_ci_decouverte.py` garde la découverte, et non laissée à un
commentaire.

## Grandeurs mesurées
- `jobs exécutant la suite complète, avant bug-018` = **1**
- `après` = **3**
- `délai codé en dur` = **30 s**, `test_app_diagramme_navigateur.py:201`
- `verdicts sur le commit 8d83e28` = **2** — échec puis succès, sans modification
- `harnais navigateur dans la suite` = à mesurer (`grep -l chromium control-center/web/test_*.py`)

## Critères d'acceptation
- [x] La cause est **confirmée ou réfutée par mesure**, pas supposée —
      **RÉFUTÉE** : les deux jobs en échec ont tourné sur des Worker ID et des
      régions Azure distincts (`westus3`, `centralus`), donc aucune contention
      n'était possible. Cause retenue : l'**exposition**, 3 exécutions
      indépendantes au lieu d'1.
- [ ] ~~Trois exécutions consécutives de la CI sur un même commit rendent le
      même verdict — c'est le critère qui compte.~~
      ⚠️ **CRITÈRE RÉFUTÉ PAR SON PROPRE CYCLE, le 2026-09-21.** Avec le taux de
      base mesuré (1 rouge sur 4 runs, ~25 %), trois verts consécutifs
      surviennent **`0,75³ = 42 %` du temps SANS aucun correctif**, et il
      faudrait **11 runs** pour rejeter un taux de 25 % à 95 % de confiance. Ce
      qui était écrit ici comme une preuve n'était qu'un tirage un peu plus
      long. **Ce qui prouve réellement quelque chose, et le remplace** :
      l'arithmétique dérivée du YAML, l'oracle comportemental à 5 témoins **vu
      mourir sur 9 mutants**, la reprise prouvée par **injection de faute**, et
      un **critère longitudinal** — l'avertissement de reprise imprimé en CI
      rouvre le dossier. Les relances restent un contrôle de fumée, avec cette
      valeur-là et pas une autre. **Case laissée vide à dessein** : elle ne se
      cochera jamais, parce qu'elle ne mesure rien.
- [x] Aucun seuil absolu de durée ne subsiste sur un lancement de navigateur,
      ou il est justifié par une mesure de la durée réelle observée — 30 s
      **conservé**, justifié : marge mesurée de **6,5×** (4,6 s au pire, bridé
      à 2 vCPU), et un échec impliquerait une VM plus de vingt fois plus lente,
      donc un incident. Complété par une **reprise unique**.
- [x] Si les jobs deviennent asymétriques, un test le **garde** — oracle
      comportemental qui **exécute** le bloc `run:` de chaque job, 5 témoins
      croisant 3 dimensions (marqueur, nom, contenu), **9 mutants tués**.
      ⚠️ Couverture **déclarée, pas supposée** : taille, répertoire, date et
      toute autre propriété ne sont **pas** couvertes, c'est écrit dans le code.
- [x] La suite reste verte en root et en non-root — **1935 cas / 25 fichiers**
      en root, **1883** en non-root, **0 échec**. L'écart de 52 est le fichier
      de garde, qui se saute proprement faute de `.github/` dans le clone.

## Hors périmètre
- Le contenu des tests de diagramme : ils sont justes, c'est leur délai qui ne l'est pas
- Le choix de la matrice elle-même (`ADR-0035`) : elle a trouvé un vrai défaut
  de plancher, on ne la retire pas

---
## Journal de bord

<!-- UNE ligne par étape du workflow, écrite QUAND L'ÉTAPE TOMBE, jamais à la
     clôture. Horodatage · étape · agent · verdict · preuve chiffrée ou livrables. -->

- [2026-09-21 08:40] Étape 0 (rétroactif) — agent principal — mesures faites avant
  promotion, à ne pas refaire : run `35573591648` sur `main`, commit `8d83e28` —
  **2 jobs sur 3** en échec (« Suite de tests (control-center/) » et sa variante
  Python 3.11), même trace `subprocess.TimeoutExpired … chromium … timed out
  after 30 seconds`, `test_app_diagramme_navigateur.py` ligne 201 ; **relance
  des seuls jobs en échec, sans changer une ligne : les 7 jobs passent** ; runs
  suivants sur `main` : `35576789306` vert (7/7) ; jobs exécutant la suite
  complète avant `bug-018` = **1**, depuis la matrice = **3**
- [2026-09-21 09:05] Étape 1 — spec-reader — spec complète au regard de
  `specs/modele.md` (type, comportement attendu/actuel, symptôme reproductible,
  cause à confirmer par mesure, critères d'acceptation testables) ; promue vers
  `doing/` par `git mv` (fichier tracké depuis `16648d4`), aux côtés de
  `feature-021` déjà présente, au titre d'**ADR-0017** — lecture confirmée non
  abusive, voir analyse d'impact. Grandeurs de la spec vérifiées par exécution :
  matrice `.github/workflows/*.yml` confirmée à **1 job système + 2 legs de
  matrice (3.11, 3.13)** = 3 exécutions de la suite complète (contre 1 avant
  `bug-018`) ; `timeout=30` confirmé `test_app_diagramme_navigateur.py:201` ;
  **harnais navigateur = 3 fichiers**, pas 1 comme la spec le laissait
  « à mesurer » (`test_app_diagramme_navigateur.py`, `test_app_navigation_http.py`,
  `test_app_theme_navigateur.py` — `grep -l chromium control-center/web/test_*.py`).
  `security-reviewer` confirmé sans objet — aucune surface d'authentification,
  de donnée personnelle ni de paiement, défaut d'infrastructure CI pur.

---

## ⚠️ RECTIFICATION du 2026-09-21 08:39 — la cause écrite dans cette spec est RÉFUTÉE

La section « Cause racine » ci-dessus affirme que « trois jobs lancent Chromium
en parallèle **sur le même pool** » et que le délai ne tient plus « pour trois ».
**C'est faux.** Établi par le `debugger`, puis confirmé par l'agent principal.

### Preuve empirique, décisive

Les deux jobs en échec du run `35573591648` n'ont pas tourné sur la même
machine — ni même dans la même région :

| job | Worker ID | région Azure |
|---|---|---|
| `106250331444` | `f5a5dbaa-ed3d-4a85-99f9-bc85c094d90e` | **westus3** |
| `106250331593` | `3644eccc-e26d-47cf-ae93-9edd23455c3a` | **centralus** |

Deux VM éphémères distinctes, deux régions. **Aucune contention possible entre
elles.** Une matrice GitHub Actions alloue une VM dédiée par entrée ; « même
pool » désigne la *flotte* de VM, pas un hôte partagé — la spec confondait les
deux.

### Preuve par la mesure locale

Chronométré sur cette machine (4 vCPU, Chromium 152), page réelle du test :

| condition | durée par lancement |
|---|---|
| seul, à chaud | **0,57 s** |
| seul, à froid | 1,50 s |
| 3 concurrents | 1,4–1,5 s |
| 3 concurrents bridés à 2 vCPU | 4,6 s |
| 6 concurrents | 5,6 s |
| **9 concurrents** | **> 30 s — effet de falaise** |

Marge sous le seuil à 3 concurrents, même bridé : **~6,5×**. Et à l'intérieur
d'un job les fichiers s'exécutent en **boucle séquentielle**, jamais en
parallèle. La contention n'atteint le seuil qu'à ~9 processus simultanés, trois
fois ce que notre architecture peut produire.

### L'hypothèse qui remplace : l'EXPOSITION, pas la contention

Avant `bug-018` : **1** exécution par run, donc **1** occasion de tomber sur une
VM GitHub lente (démarrage à froid, gigue de provisionnement). Depuis la
matrice : **3** exécutions indépendantes, donc **3** occasions indépendantes.
Cela suffit à expliquer le taux observé (1 rouge sur 4 runs) **sans aucune
contention entre nos jobs**.

La corrélation que la spec avait vue était réelle — le taux d'échec a bien
augmenté avec la matrice — mais sa cause était fausse.

### Ce que ça change pour le correctif : rien

Les deux mécanismes convergent sur la **piste 2**. Sortir les harnais navigateur
des jobs de matrice ramène de 3 à 1 le nombre d'exécutions indépendantes, que la
cause soit l'exposition ou une contention résiduelle d'hyperviseur non exclue.
La piste 1 (allonger le délai) ne traite ni l'une ni l'autre.

### Non vérifiable depuis ce poste

La spécification réelle des VM `ubuntu-latest` au moment des runs, l'effet de
voisinage entre VM au niveau hyperviseur, et la cause précise de la latence sur
les deux jobs rouges. Une mesure locale oriente, elle ne prouve rien sur
l'infrastructure GitHub.

### Correction du compte de harnais

La spec annonçait « à mesurer ». Mesuré : **3 fichiers** lancent Chromium —
`test_app_diagramme_navigateur.py` (2 lancements), `test_app_navigation_http.py`
(1), `test_app_theme_navigateur.py` (**4**) — soit **7 lancements par job**,
tous à `timeout=30`. ⚠️ `feature-021` **supprimera** `test_app_theme_navigateur.py`
avec le thème sombre : une liste d'exclusion écrite à la main figerait un fichier
bientôt mort, et c'est celui qui lance le plus de navigateurs.

---

- [2026-09-21 08:39] Livrable « cause établie » — debugger + agent principal — **hypothèse
  de la spec RÉFUTÉE**. Preuve empirique : les deux jobs en échec ont tourné sur
  des Worker ID et des **régions Azure différentes** (westus3, centralus) — aucune
  contention possible. Mesures locales : 3 concurrents = 1,4-1,5 s contre un
  seuil de 30 s, soit **6,5× de marge** ; la falaise n'arrive qu'à ~9 processus.
  Hypothèse retenue à la place : **exposition** — 3 exécutions indépendantes au
  lieu d'1, donc 3 occasions de croiser une VM lente. **Le correctif ne change
  pas** : la piste 2 traite les deux mécanismes. ⚠️ Troisième cause racine fausse
  de ce cycle, et la troisième que j'ai écrite moi-même — après la pipeline
  GitLab inexistante et les tokens déclarés introuvables.

---

## Notes d'implémentation — arbitrage de l'architecte (2026-09-21)

> Pas de `VALIDATION SECURITY-AUDITOR REQUISE` : aucune surface d'auth, de donnée
> personnelle, de paiement ni de migration. Confirmé par `spec-reader`, non rouvert.

### Approche en une ligne

Les harnais navigateur se **déclarent** par un marqueur lu dans le fichier ; les
deux legs de matrice les sautent, le job système les garde — soit **une** exécution
par harnais — et un test exécutable recalcule cette arithmétique depuis les
artefacts.

### Étapes (≤ 10)

1. `control-center/web/test_app_diagramme_navigateur.py`, `test_app_navigation_http.py`,
   `test_app_theme_navigateur.py` : ajouter la ligne de module `HARNAIS_NAVIGATEUR = True`
   (les 3 fichiers **mesurés**, pas énumérés — voir §1 ci-dessous).
2. Mêmes 3 fichiers : encapsuler le lancement dans un `_lancer_navigateur(commande)`
   local (une reprise unique sur `subprocess.TimeoutExpired`, avertissement bruyant).
3. `.github/workflows/hygiene-specs.yml`, job `centre-de-controle-matrice` : filtrer
   les fichiers marqués après le `find` ; compter `découverts / exclus / exécutés`.
4. Même fichier, job `centre-de-controle` (système) : **ne pas** filtrer ; ajouter le
   même comptage et `python3 "$fichier" < /dev/null` (PIEGES §48, absent côté GitHub).
5. `control-center/backend/test_ci_partition_navigateur.py` (**neuf**) : la garde (§1.3).
6. `docs/adr/0037-*.md` : ADR, amende `ADR-0035` (§3).
7. `control-center/PIEGES.md`, `docs/ARCHITECTURE.md` ou `docs/subsystems/` + `CHANGELOG.md` : `doc-writer`.

### 1. Partitionnement

**1.1 — Par quoi reconnaît-on un harnais navigateur ?** Trois options pesées :

| option | mesure | verdict |
|---|---|---|
| nom de fichier `*_navigateur.py` | attrape **2 des 3** (`test_app_navigation_http.py` lance Chromium et ne finit pas par `_navigateur`) | **écartée** — laisse le défaut ouvert sur un tiers du terrain |
| détection par contenu seule (`--headless` dans l'AST) | attrape **3 des 3** | **écartée comme règle**, retenue comme **oracle** : muette sur `--headless=new`, sur un pilote futur (playwright), et sur un harnais qui construirait le drapeau par concaténation |
| **marqueur déclaré dans le fichier** (`HARNAIS_NAVIGATEUR = True`) | explicite, meurt **avec** le fichier | **RETENUE** |

Le marqueur est la **règle** ; la détection par contenu est la **garde** qui rattrape
un marqueur oublié. Les deux ensembles sont calculés depuis les artefacts : aucune
liste écrite à la main nulle part (PIEGES §21). Un marqueur ne peut pas se périmer
comme une liste : `feature-021` supprime `test_app_theme_navigateur.py`, et sa ligne
`HARNAIS_NAVIGATEUR` part avec lui — **aucun fichier à éditer ailleurs**.

Mesure du détecteur (exécutée ce jour, en root, sur le dépôt) :

```
$ python3 - <<'EOF'   # AST : constante str commençant par "--headless", ou def trouver_navigateur
  ... walk(ast.parse(src)) sur les test_*.py de control-center/
fichiers test_*.py total: 24
control-center/web/test_app_diagramme_navigateur.py ['const:--headless', 'def:trouver_navigateur']
control-center/web/test_app_navigation_http.py      ['const:--headless', 'def:trouver_navigateur']
control-center/web/test_app_theme_navigateur.py     ['const:--headless', 'def:trouver_navigateur']
```

**3 sur 24**, et les deux signaux coïncident exactement. Lecture par AST et non par
`grep` : un commentaire ou une docstring qui mentionne `--headless` ne compte pas
(PIEGES §26) — seule une **constante de chaîne** est vue.

**1.2 — Par où arrive-t-on à la garde, et qu'est-ce qui l'en empêcherait ?**
Le fichier neuf est sous `control-center/`, donc ramassé par le `find` des deux jobs
et du lanceur non-root : il s'exécute. **Un défaut connu limite sa portée** :
`tools/lancer_suite_control_center_non_root.sh` ne clone que `control-center/`,
`.claude/agents/` et deux gabarits de spec — **pas `.github/`** (mesuré : lignes 37-41
du script). La garde s'y **sautera proprement** (`0 cas, 0 echec(s)`, message explicite),
exactement comme `test_ci_decouverte.py` se saute faute de `.gitlab/`. Sa force
réelle s'exerce en CI et en local root. **À déclarer** : le compte de cas non-root
sera inférieur au compte root de tout le lot de cette garde — c'est l'écart normal de
PIEGES §32, pas une régression.

**1.3 — Ce que la garde vérifie** (modèle `test_ci_decouverte.py`, mais sur
`.github/workflows/hygiene-specs.yml`, l'artefact **vivant** — noter que
`test_ci_decouverte.py` ne garde que `.gitlab/ci/hygiene.yml`, gabarit distribué
qu'aucune pipeline n'exécute : **le workflow GitHub n'est aujourd'hui gardé par
aucun test**) :

1. `declares` = fichiers portant l'affectation module `HARNAIS_NAVIGATEUR = True` (AST).
2. `detectes` = fichiers portant le signal navigateur (AST, §1.1).
3. `grep_set` = fichiers que le motif **extrait du YAML lui-même** sélectionne.
4. **`declares == detectes == grep_set`** — trois ensembles, trois provenances, un seul
   verdict. Un marqueur oublié : `detectes ⊃ declares` → rouge. Un marqueur posé dans
   une docstring : `grep_set ≠ declares` → rouge.
5. Le job **matrice** contient le filtre ; le job **système** ne le contient **pas** —
   c'est la garde du « ni zéro fois ». Une copie du filtre dans le job système
   ramènerait les harnais à **0** exécution, en silence : c'est le seul scénario de
   perte de couverture, et il est le plus probable (copier-coller entre deux jobs
   dont le script est déjà dupliqué à l'identique).
6. Les deux jobs découvrent toujours par `find`, isolent `stdin` (`< /dev/null`) et
   comparent **exécutés == découverts − exclus**, `exit 1` sinon.
7. Arithmétique explicite : pour chaque fichier, `exécutions = 1 (système) + 2×(non marqué)`
   → **1** pour un harnais navigateur, **3** sinon. Assertion écrite sous cette forme.

Le point 6 n'est pas hors périmètre : le filtre **crée** un second chemin par lequel
un job exécute moins de fichiers qu'il n'en découvre. Sans le compte, un filtre trop
gourmand rend « 24 découverts, tous verts » avec 0 exécuté, code 0 — le faux vert de
PIEGES §48 sous une autre forme.

**Mutations à exiger de `test-engineer`** : (a) retirer le marqueur d'un des 3 fichiers ;
(b) ajouter le filtre au job système ; (c) remplacer le filtre par une énumération
`case "$fichier" in *theme*)` ; (d) déplacer le marqueur dans une docstring ;
(e) décaler le compte attendu de 1. Les cinq doivent **tuer** la garde.

### 2. Le seuil de 30 s — on le garde, et on ajoute une reprise

**Verdict : seuil inchangé à 30 s ; une reprise unique sur `TimeoutExpired`.**

Marge, mesurée (rectification ci-dessus, non refaite) : 4,6 s au pire cas local
(3 concurrents bridés à 2 vCPU) contre 30 s = **6,5×** ; 1,5 s à froid, seul = **20×**.
Je retiens **6,5×** comme marge liante, parce que le runner GitHub est à 2-4 vCPU et
que c'est la condition mesurée la plus proche de lui. PIEGES §20 vise une borne posée
**au ras** de sa valeur : 6,5× n'est pas au ras, le seuil n'est donc pas décidé par
l'arrondi. **Le relever serait un geste sans cible** : l'échec observé implique une VM
> 20× plus lente que le local, donc un incident de provisionnement, pas un dépassement
de justesse. Passer à 60 s ne couvrirait que la bande 20×–40× — aucune mesure ne dit
qu'elle s'y trouve — et doublerait le pire cas d'un Chromium réellement bloqué
(7 lancements × 30 s = 3,5 min → 7 min).

Ce qui traite le résidu, c'est la **reprise**, parce qu'elle ne suppose rien sur
l'ampleur du ralentissement. Ordre de grandeur, **estimation et non mesure**
(n = 4 runs, échantillon minuscule — à ne pas citer comme un fait) : taux observé
25 % par run sur 3 expositions → ~9 % par exécution ; le partitionnement seul ramène
25 % → ~9 % (facteur 2,7) ; une reprise unique, si les décrochages sont indépendants
d'un lancement à l'autre, ramène ~9 % → ~0,1 %. **La reprise est le levier fort, le
partitionnement le levier structurel** : on prend les deux, et on ne prend pas le
troisième (allonger), que la spec juge mauvais comme correctif principal — ici il ne
serait même pas un bon correctif secondaire.

Garde-fous de la reprise, non négociables :
- elle ne rattrape **que** `subprocess.TimeoutExpired`, jamais un échec d'assertion ni
  un code de retour non nul — sinon elle masque une vraie régression ;
- **une seule** reprise, et elle **imprime une ligne d'avertissement** dans la sortie
  du job : une reprise silencieuse transforme une dérive de performance en angle mort ;
- elle se teste par **injection de faute** (forcer la première tentative à expirer,
  vérifier que le harnais passe quand même **et** que l'avertissement est imprimé) —
  c'est la seule preuve déterministe que le résidu est couvert.

Critère d'acceptation « aucun seuil absolu ne subsiste » : il subsiste, **justifié par
mesure** — c'est la seconde branche que la spec autorise explicitement.

### 3. Verdict ADR — **OUI. ADR-0037** (prochain numéro libre, mesuré : `ls docs/adr/` s'arrête à `0036`)

| critère | verdict |
|---|---|
| 1. contrainte structurante imposée ailleurs | **rempli** — tout test navigateur futur doit porter le marqueur, et tout projet consommateur du kit hérite d'un workflow aux jobs volontairement asymétriques |
| 2. décision invisible dans le code | **rempli** — le marqueur se voit, la raison (« exactement une fois : ce qu'on vérifie ici, c'est un rendu, pas une version de Python ») ne se voit nulle part |
| 3. alternatives crédibles | **rempli** — allonger le seuil, reprise seule, retirer la matrice, marquer par nom de fichier : quatre options défendables, trois écartées |
| 4. verrouillage long terme | **rempli** — fixe pour la suite ce qu'une entrée de matrice garantit, et ce qu'elle ne garantit plus |

**4 sur 4.** L'ADR **amende `ADR-0035`**, il ne le révoque pas : `ADR-0035` a posé
l'intervalle de versions et l'identité de ce qu'une suite verte prouve ; `ADR-0037`
en retire une conséquence non voulue — la couverture de versions ne s'applique qu'à ce
dont la version de Python change le résultat, et un rendu Chromium n'en est pas. Il
doit aussi porter la **rectification de la cause** (exposition, pas contention) :
c'est la décision de conception réellement prise, et l'ADR est le seul endroit où elle
survivra à la clôture de la spec.

### 4. Le critère de clôture — « trois exécutions » ne prouve presque rien

**Arithmétique, explicite** : avec un taux de base de 25 %, `0,75³ = 0,42`. Trois verts
consécutifs surviendraient **42 % du temps sans aucun correctif**. Ce n'est pas une
preuve, c'est un tirage. Pour rejeter un taux de 25 % à 95 % de confiance il faudrait
`ln 0,05 / ln 0,75 ≈ 10,4` → **11 runs verts d'affilée** ; et le taux visé après
correctif (~0,1 %) est de toute façon hors de portée d'une campagne de relances.

**Ce que je propose à la place — trois preuves déterministes, plus une observation :**

1. **Arithmétique gardée** (§1.3, point 7) : la garde prouve « exactement une fois »
   par calcul sur les artefacts, à chaque run, pour tout fichier présent ou futur.
   Ne dépend d'aucun tirage.
2. **Injection de faute sur la reprise** (§2) : prouve que le résidu d'exposition est
   couvert, sans attendre qu'une VM lente veuille bien se présenter.
3. **Campagne de mutation** (§1.3, 5 mutants) : prouve que la garde tue ce qu'elle
   prétend tuer.
4. **Observation, pas preuve** : sur le premier run après correctif, **lire dans les
   journaux** les trois comptes affichés par les jobs (système : `N découverts, 0 exclu,
   N exécutés` ; chaque leg : `N découverts, 3 exclus, N−3 exécutés`). C'est une lecture
   de l'artefact livré, pas un pari.
5. **Critère longitudinal, à écrire dans la spec close** : rouvrir `bug-022` si un
   `TimeoutExpired` navigateur reparaît **ou** si la ligne d'avertissement de reprise
   apparaît dans un journal de CI. Le second cas est le plus utile : il signale que
   l'incident est toujours là, absorbé mais visible — une instabilité qu'on masquerait
   sans le savoir est exactement ce que ce cycle veut éviter.

Je **maintiens** les trois relances comme contrôle de fumée (elles coûtent peu et
réfuteraient une régression déterministe), mais la spec doit dire **par écrit** ce
qu'elles valent : `0,75³ = 42 %`. Les livrer en silence comme « le critère qui compte »
reproduirait, sur un chiffre, la faute que la RECTIFICATION vient de corriger sur une
cause.

### Compatibilité, données, dépendances

- Aucun endpoint, aucun schéma, aucune migration, aucune dépendance neuve.
- Le workflow est un **gabarit distribué** (`update_kit.sh`) : un projet consommateur
  sans `control-center/` garde les sorties anticipées existantes — inchangées.
- Le marqueur est une ligne Python inerte : aucun effet sur l'exécution des harnais.

### Points d'attention pour l'implémentation

- **Ne pas créer de module partagé sous `control-center/web/`** pour la reprise : la
  liste des fichiers servables est calculée au démarrage et n'exclut par construction
  que les noms commençant par `test_` (PIEGES §8) — un `_navigateur.py` y deviendrait
  potentiellement servable. La reprise reste **locale à chaque harnais** (3 copies d'une
  fonction de 6 lignes, dont une meurt avec `feature-021`), comme `trouver_navigateur`
  qui est déjà dupliqué 3 fois (mesuré).
- Les deux jobs du workflow portent aujourd'hui un script **dupliqué à l'identique** ;
  après ce cycle ils divergent **d'une clause**. C'est exactement la divergence
  silencieuse que la garde existe pour empêcher — la garde doit être livrée **dans le
  même commit** que le filtre, jamais après.
- `feature-021` est dans `doing/` en parallèle : elle supprimera un des 3 harnais. La
  garde recalculant tout depuis les artefacts, **aucune coordination n'est requise** ;
  c'est précisément le test de la conception, et il faut le vérifier au moment où
  `feature-021` tombe.
- [2026-09-21 09:07] Étapes 5 et 7 — backend-developer puis test-engineer — **implémenté,
  puis BLOQUÉ par la campagne de mutation**. Livré : 3 marqueurs
  `HARNAIS_NAVIGATEUR = True`, `_lancer_navigateur()` avec reprise unique,
  filtre côté matrice, et la **parade §48 ajoutée côté GitHub où elle
  manquait** (`dev/null` 0→3, `executes` 0→10 ; elle n'existait que sur le
  gabarit GitLab que rien n'exécute). Garde neuve
  `test_ci_partition_navigateur.py` : 40 cas. Suite : **1929 cas en root**,
  1883 en non-root, 0 échec — l'écart de 46 vient de `.github/` non cloné.

  **Injection de faute sur la reprise : concluante sur les 4 points.** Vrai
  `TimeoutExpired`, deux vrais processus, aucun mock — reprise **une seule
  fois**, avertissement imprimé **1 fois** et repérable, double échec qui
  **remonte** sans boucle, cas nominal à 0,001 s sans reprise.

  ⚠️ **DEUX MUTANTS SURVIVANTS sur la garde neuve** :
  - **6a — la garde valide un COMMENTAIRE.** Le job système porte au-dessus de
    sa boucle un commentaire qui *cite* `python3 "$fichier" < /dev/null` pour
    documenter §48. La regex cherche ce motif dans tout le texte du job,
    commentaires compris : retirer le vrai `< /dev/null` de la ligne de
    commande laisse la garde **verte**. Famille de `PIEGES §26` (compter des
    occurrences en commentaire), transposée à une regex sur un bloc YAML — ce
    que §26 ne couvre pas. **Trouvé par la 6ᵉ mutation ajoutée au brief par
    l'agent principal**, précisément par méfiance envers une parade neuve et
    non gardée.
  - **5 — l'arithmétique code en dur le nombre de legs.** `1 + 2×(non marqué)`
    ne lit jamais `strategy.matrix.python-version`. Un 3ᵉ leg ferait tourner un
    harnais **4 fois** au lieu de 3 — le défaut de ce cycle sous une autre
    forme — et les 40 cas restent verts.
  - Note liée : la mutation 4 (filtre copié côté système) ne meurt que par le
    booléen dédié, **jamais par l'arithmétique** — celle-ci n'est donc pas une
    preuve indépendante, elle repose entièrement sur les deux booléens.

  Renvoyé au `test-engineer` pour correction et re-mutation, avec une 7ᵉ
  mutation neuve : **retirer** un leg de matrice, pour vérifier que
  l'arithmétique dérivée suit sans hurler à tort.
- [2026-09-21 10:12] Étape 8 — code-reviewer — **REQUEST CHANGES**, 1 bloquant :
  **la garde vérifiait une FORME, pas une PROPRIÉTÉ.**
  `test_filtre_absent_cote_systeme` faisait `re.search("grep -qx '<motif>'",
  job_systeme) is None` — ce qui prouve qu'un texte est absent, jamais que le
  job n'exclut rien. Deux mutants passent : **A3** (découverte réécrite en
  `find … | xargs grep -Lx 'HARNAIS_NAVIGATEUR = True'`) fait tomber les 3
  harnais à **ZÉRO exécution** dans les 3 jobs, garde **verte 41/41** et job CI
  vert ; **A** (`case … continue` dans la boucle) ne survit qu'au runtime, par
  chance. C'est le scénario que l'architecte désignait comme le plus probable.
  ⚠️ Et une erreur de l'agent principal : la parade `§48` que j'ai fait ajouter
  côté GitHub repose sur un défaut **qui n'existe pas dans cette forme**. La
  boucle y est un `for` sur un tableau `mapfile`, pas un `while read … done <
  liste` : immunisée par construction, mesuré 3/3. Le `< /dev/null` reste utile,
  mais la comparaison exécutés/découverts y est **tautologique** — et le
  commentaire la présentait comme une garde agissante.
- [2026-09-21 10:12] Étape 5bis — backend-developer — **3 reboucles, toutes vérifiées par
  mutation**. (1) Garde forme→propriété : `test_ligne_decouverte_identique_
  dans_les_deux_jobs` (ligne de découverte verbatim identique dans les deux
  jobs) tue **A3** ; `test_systeme_naucune_exclusion_conditionnelle_dans_la_
  boucle` tue **A**. (2) Commentaire `§48` réécrit : il dit désormais que la
  comparaison est un **fil-piège tautologique**, pas une protection. (3) Garde
  de **synchronisation** des copies de `_lancer_navigateur`, ajoutée sur
  arbitrage de l'agent principal — ⚠️ **dérivée du marqueur, jamais d'une liste
  de trois noms**, pour survivre à la suppression de `test_app_theme_navigateur.py`
  par `feature-021`. Vérifiée par mutation (corps modifié → tuée ; message
  d'avertissement seul modifié → tuée aussi) et sur ses deux cas limites
  (un seul fichier marqué → reste **vert** ; fichier marqué sans la fonction →
  **échoue explicitement**).
  Mesuré par l'agent principal : garde **44 cas**, suite **1933 cas sur 25
  fichiers en root**, 1883 en non-root, **0 échec**. Les 3 copies de
  `_lancer_navigateur` ont une **empreinte AST unique**.
  Note honnête portée par l'implémenteur : les ~24 assertions arithmétiques ne
  sont **pas indépendantes** — le compte de 44 ne vaut pas 44 gardes distinctes.
- [2026-09-21 10:32] Étapes 8 et 5ter à 5quinquies — **3 reboucles de plus, toutes sur la
  même faille de METHODE** : une garde qui **énumère** se contourne par un
  élément de plus.
  - Reboucle 2 — la garde testait une **forme** (`re.search("grep -qx …") is
    None`), pas une propriété. Deux mutants passaient : **A3** (découverte
    réécrite via `xargs grep -Lx`) et **A** (`case … continue`), tous deux
    ramenant les 3 harnais à **ZÉRO exécution** avec la garde verte.
  - Reboucle 3 — les deux checks de propriété qui les remplaçaient restaient
    une **énumération de syntaxes** : **A4** (`if/else` sans `continue`) et
    **A5** (second `mapfile` après la ligne canonique) passaient encore, même
    conséquence. **Changement de méthode** : la garde **EXÉCUTE** désormais le
    bloc `run:` de chaque job sur une arborescence factice et compare ce qui a
    **réellement** tourné. ~25 lignes. Les deux anciens checks sont rétrogradés
    en `test_diagnostic_*` — sur A4, A5 et F ils restent **verts**, seul
    l'oracle tue : ils ne couvraient rien de ce qu'on leur prêtait.
  - Reboucle 4 — **un oracle ne vaut que son jeu de témoins.** Le mutant **H**
    excluait par **NOM de fichier**, et le témoin marqué s'appelant
    `test_marque.py`, aucun témoin ne croisait cette dimension : 2 harnais sur
    3 à zéro exécution, 46/46 vert. Ironie mesurée — l'exclusion par nom est
    le critère que la conception avait écarté au départ (« attrape 2 des 3 »).
    Témoins portés à 4 (marqueur × nom), puis à **5** : le 9ᵉ mutant, **I**
    (exclusion par **contenu**, `grep -q chromium`), échappait encore.
  ⚠️ **Le développeur a TROUVÉ ce mutant lui-même, sur demande, et l'a ÉCRIT
  au lieu d'ajouter un témoin en silence.** C'est ce qui a permis de le fermer.
  **État final** : 5 témoins croisant **3 dimensions** (marqueur, nom, contenu),
  chacune justifiée par un mutant réellement mort — pas par prudence abstraite.
  Un `assert` de module garantit qu'aucun témoin marqué ne mentionne
  « chromium », pour croiser la 3ᵉ dimension dans les deux sens sans dépendre
  d'une relecture. **9 mutants tués** : A, A3, A4, A5, F, G4 (masquage de
  `python3` par une fonction shell), G5, H, I.
  Le paragraphe **« COUVERTURE DÉCLARÉE, PAS SUPPOSÉE »** est conservé et
  nomme ce qui n'est **pas** couvert (taille, répertoire, date, toute autre
  propriété), avec la consigne d'ajouter un témoin plutôt que de réécrire la
  phrase pour la rendre rassurante.
  Mesuré par l'agent principal : garde **46 cas, 0 échec, 0,17 s** ; suite
  **1935 cas / 25 fichiers en root**, 1883 en non-root, **0 échec**.
  Règle d'arrêt posée avant la dernière passe : une dixième dimension qui
  échapperait serait **écrite, pas corrigée**. Aucune n'a été trouvée.

## Statut final

✅ **Done — 2026-09-21** — branche `main`.

Les harnais navigateur ne tournent plus qu'**une fois** au lieu de trois, reconnus
par un **marqueur déclaré** et non par leur nom. Seuil de 30 s conservé et justifié
par mesure, complété par une **reprise unique** prouvée par injection de faute.
`code-reviewer` a rendu **Request changes trois fois** — chaque reboucle a trouvé un
défaut réel et mesuré ; `security-reviewer` **sans objet**, aucune surface d'auth.

⚠️ **Ce que ce cycle NE prouve pas, et qui est écrit plutôt que coché** : que
l'instabilité a disparu. Son critère d'origine — trois runs verts — vaut **42 %**
par hasard, et onze runs seraient nécessaires pour trancher. Ce qui est livré est
une arithmétique dérivée, un oracle **vu mourir sur 9 mutants**, une reprise
éprouvée, et un **critère longitudinal** : si l'avertissement de reprise apparaît en
CI, le dossier se rouvre.

⚠️ **La garde couvre 3 dimensions nommées** — marqueur, nom, contenu — et **pas**
la taille, le répertoire, la date, ni toute autre propriété. La consigne gravée est
d'**ajouter un témoin** plutôt que de réécrire la phrase pour la rendre rassurante.

