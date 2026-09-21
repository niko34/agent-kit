## Métadonnées
- **ID** : bug-018
- **Slug** : la-suite-est-verte-en-root-et-rouge-en-ci
- **Type** : bug
- **Statut** : todo
- **Priorité** : haute
- **Version cible** : 0.12.1
- **Spec(s) liée(s)** : feature-007 (a introduit `jeton.py` et les tests de
  mode, et le premier run rouge), bug-012 (a introduit le cas `::ffff:`),
  feature-008 (livrée sur une CI déjà rouge)
- **Dernière mise à jour** : 2026-09-19

> Format **feature complet** et non `modele.md`, bien qu'il s'agisse d'un bug :
> les deux défauts portent sur la surface d'authentification — la lisibilité du
> fichier de jeton et la décision de localité qui gouverne l'exigence de jeton
> (ADR-0020). La règle du kit impose alors le template complet, pour que
> `security-reviewer` (rôle GATE) soit déclenché.

## Grandeurs mesurées
- **Runs CI consécutifs en échec** = **7** — de `49fdc8f` (2026-09-14) à
  `d1838ed` (2026-09-19 21:02) ; dernier vert : `665720d` (2026-09-13 17:57).
  Remesuré le 2026-09-20 par `gh run list`. *La valeur initiale de cette spec
  était **6** : le run de `d1838ed` est postérieur à la fenêtre alors mesurée.
  Corrigée plutôt que laissée périmée — une grandeur mesurée qui a bougé n'est
  plus une mesure.*
- **Job en échec** = **« Suite de tests (control-center/) »** ; les 4 autres jobs
  du workflow sont verts. Mesuré le 2026-09-20 sur le run `35469200391`.
- **Cas en échec en CI** = **4**, sur **2** fichiers — `test_jeton.py`
  (48 cas, 3 échecs) et `test_server_bug012.py` (53 cas, 1 échec). Mesuré par
  `gh api repos/niko34/agent-kit/actions/jobs/105949490194/logs`.
- **Cas en échec en local, en root** = **0** sur **1817** cas / **23** fichiers.
  Mesuré par `find control-center -name 'test_*.py'` puis `python3 <fichier>`.
- **Cas en échec en local, en non-root** = **3** — les trois mêmes que la CI sur
  `test_jeton.py`. `test_server_bug012.py` reste à **0 échec** en non-root.
  Mesuré le 2026-09-19 par exécution sous un utilisateur créé pour l'occasion.
- **Modes déclarés « permis »** par `test_jeton.py:109` = **6** —
  `0600, 0400, 0500, 0200, 0300, 0100`. **3** d'entre eux (`0200`, `0300`,
  `0100`) n'ont **pas le bit de lecture**.
- **Occurrences de `setup-python`** dans `.github/workflows/` = **0** — mesuré
  par `grep -c setup-python .github/workflows/*.yml`. La version de Python
  n'est épinglée nulle part : la CI prend celle du système de `ubuntu-latest`.
- **Version de Python en local** = **3.13.5**, pour laquelle
  `ipaddress.ip_address('::ffff:127.0.0.1').is_loopback` vaut **True**.

## Domaines touchés
- [ ] API REST (endpoints, contrats, codes d'erreur)
- [ ] Frontend (écrans, composants, appels API)
- [ ] BDD / migrations
- [x] Auth / permissions → **passage obligatoire par `security-reviewer` (rôle GATE)** —
      lisibilité du fichier de jeton, et décision de localité qui gouverne
      l'exigence de jeton (ADR-0020)
- [ ] Données personnelles (collecte, traitement, effacement)
- [ ] Intégrations externes
- [ ] Tâches de fond

## Agents requis
- [x] spec-reader
- [x] architect
- [x] security-reviewer, rôle GATE — P1 sur le design, P2 sur le diff
- [ ] ux-ui-designer — aucune surface UI
- [x] backend-developer
- [ ] frontend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer
- [x] **debugger** — la cause racine du défaut B n'est **pas établie** (voir
      plus bas) ; elle doit l'être par mesure avant toute correction

## Description
La suite du centre de contrôle est verte en local et rouge en intégration
continue depuis six runs. Rendre le verdict de la suite **indépendant de
l'identité de l'exécutant et de la version de Python**, pour que « suite verte »
redevienne une preuve de non-régression et non une propriété de la machine qui
l'a lancée.

## Contexte
La CI est rouge depuis `49fdc8f` (2026-09-14) — le commit de **feature-007**,
celui-là même qui a introduit `jeton.py` et ses tests de mode. Les trois cas en
cause sont donc rouges **depuis le jour où ils ont été écrits**. `bug-012` a
ensuite ajouté le quatrième par-dessus. Deux lots, puis **feature-008** le
2026-09-19, ont été livrés sur une CI rouge sans que personne ne le voie.

La raison pour laquelle personne ne l'a vu est le cœur du problème : la suite
est lancée en **root** dans le conteneur de développement, et root lit un
fichier que son mode interdit à tout autre utilisateur. Le règle du kit
« suite verte + zéro régression tolérée » a donc été satisfaite, à chaque
cycle, contre une mesure qui n'était pas équivalente à celle de la CI.

Ce n'est pas un défaut de confort. Le second symptôme porte sur `_locale()`,
dont dépend la décision « cette requête doit-elle présenter un jeton ? »
(ADR-0020). Un désaccord d'environnement à cet endroit n'est pas cosmétique.

## Comportement attendu

### Défaut A — un jeton illisible n'est pas un jeton actif
`test_jeton.py:109` affirme que les six modes `0600, 0400, 0500, 0200, 0300,
0100` rendent le jeton **actif**, au motif qu'aucun ne pose de bit groupe ou
autres. Trois d'entre eux n'ont pas le bit de lecture : un utilisateur normal ne
peut pas lire le fichier, donc `charger()` rend un refus « absent ou illisible ».

Il y a deux questions distinctes, et la spec ne tranche ni l'une ni l'autre
d'avance — c'est le travail de l'`architect` et du GATE P1 :

1. **Le test est-il faux** (il confond « aucun bit de trop » avec « utilisable »),
   auquel cas `0200/0300/0100` doivent sortir de la liste des modes permis, ou
   y entrer avec l'attente inverse ?
2. **Le code est-il trop permissif** de laisser passer la vérification de mode
   pour un fichier qu'on ne pourra jamais lire, au lieu de refuser tôt avec un
   motif explicite ?

Quelle que soit la réponse, le résultat attendu est le même : **le verdict ne
dépend plus de l'identité de l'exécutant**. Un test qui passe en root et échoue
autrement ne prouve rien — il doit devenir vrai pour les deux, ou dire
explicitement ce qu'il suppose et se sauter proprement sinon.

### Défaut B — `::ffff:127.0.0.1` n'est pas reconnu comme local en CI
`test_server_bug012.py:101` attend que `_locale("::ffff:127.0.0.1")` rende
`True`. En CI il rend `False`. En local il rend `True`, **y compris en
non-root** — l'identité de l'exécutant n'explique donc pas celui-ci.

**Cause racine NON ÉTABLIE.** Hypothèse de travail, à vérifier ou à réfuter par
mesure avant toute correction : `_locale()` repose sur
`ipaddress.ip_address(...).is_loopback`, et le traitement des adresses IPv6
mappées IPv4 par ce module a changé entre versions de CPython ; la CI n'épinglant
aucune version (0 occurrence de `setup-python`), elle exécute une autre version
que le poste. **Cette hypothèse n'a pas été vérifiée** : la version de Python de
la CI n'a pas été relevée. La première tâche du `debugger` est de la relever, et
de dire si elle explique l'écart — ou ce qui l'explique à sa place.

Le comportement attendu, lui, ne dépend pas de la cause : une requête arrivant
de la boucle locale sous forme IPv4-mappée **est** locale, sur toute version
supportée.

⚠️ **Ce que le correctif ne doit pas être** : une reconnaissance de `::ffff:`
par préfixe de chaîne. `::ffff:192.168.1.55` est une adresse **mappée non
locale** ; la traiter comme locale ouvrirait l'écriture sans jeton au réseau.
Le correctif doit extraire l'adresse IPv4 mappée et lui reposer la question,
jamais reconnaître un préfixe.

### Défaut C — la CI n'épingle aucune version de Python
Conséquence transverse des deux précédents : le comportement du produit dépend
d'une version que rien ne fixe, et qui peut changer sous le dépôt sans qu'aucun
commit ne le signale. À traiter dans ce cycle : soit épingler, soit déclarer
explicitement l'intervalle supporté et le vérifier.

### Cas limites
- Suite lancée en **root** (poste de développement actuel) et en **non-root**
  (CI) : même verdict exigé.
- Adresse mappée **non locale** (`::ffff:192.168.1.55`) : doit rester non
  locale, sous peine d'ouvrir l'écriture au réseau.
- Adresse imprononçable : reste non locale (défaut sûr déjà en place).
- Fichier de jeton en `0200` : quel que soit l'arbitrage retenu, le
  comportement doit être **le même** pour root et pour un utilisateur normal.

## Comportement actuel
- CI rouge depuis 6 runs ; job « Suite de tests (control-center/) » en échec,
  les quatre autres jobs verts.
- En local, en root : 1817 cas, 0 échec.
- En local, en non-root : les 3 mêmes échecs que la CI sur `test_jeton.py`.
- Aucune alerte : le dépôt a reçu trois lots depuis que la CI est rouge.

## Contraintes techniques
- Bibliothèque standard Python uniquement (ADR-0006)
- Les suites du module sont des **scripts autonomes** (`python3 <fichier>`,
  « N cas, M echec(s) », code 1 si échec), jamais `unittest` — cf. PIEGES §6
- Ne pas affaiblir la garde de mode : un jeton lisible par le groupe ou par
  les autres doit rester refusé (ADR-0007)
- Ne pas affaiblir `_locale()` : la localité gouverne l'exigence de jeton
  (ADR-0020), et le défaut sûr est « non locale »

## Fichiers potentiellement concernés
- `control-center/backend/jeton.py` — vérification de mode et de lisibilité
- `control-center/backend/test_jeton.py` — la boucle des six modes (l.109)
- `control-center/backend/server.py` — `_locale()` (l.266), dont le docstring
  affirme « vérifié par exécution : `::ffff:127.0.0.1` → True », affirmation
  vraie sur le poste et fausse en CI
- `control-center/backend/test_server_bug012.py` — le cas `::ffff:` (l.101)
- `.github/workflows/hygiene-specs.yml` — épinglage de la version de Python
- `control-center/PIEGES.md` — l'entrée « mesurer en root ne mesure pas la CI »
- `docs/adr/` — si l'arbitrage sur le mode du jeton est structurant

## Livrables — check-list
- [x] A1 — Défaut A tranché : le test, le code, ou les deux ; verdict identique
      en root et en non-root
- [x] A2 — Défaut B : cause racine **établie par mesure** (version de Python de
      la CI relevée), écrite dans la spec, hypothèse confirmée ou réfutée
- [x] A3 — Défaut B corrigé **sans reconnaissance par préfixe de chaîne** ;
      `::ffff:<non-local>` reste non local
- [x] A4 — Docstring de `_locale()` corrigé : il affirme aujourd'hui un
      « vérifié par exécution » qui est faux hors du poste
- [x] A5 — Défaut C : version de Python épinglée en CI, ou intervalle supporté
      déclaré et vérifié
- [x] C1 — `PIEGES.md` : mesurer en root ne mesure pas la CI ; `control-center/README.md`
      si le compte de tests change ; `CHANGELOG.md` ; ADR si arbitrage structurant
- [ ] D1 — **La CI repasse au vert** — critère non substituable par une mesure locale.
      ⚠️ **Seule case volontairement laissée vide.** Elle exige un commit et un
      push, que seul l'humain autorise. Tout le reste est mesuré : 1887 cas en
      root, 1883 en non-root, 0 échec, 12 mutations dont 1 survivant corrigé.
- [x] D2 — Un moyen de lancer la suite **en non-root** depuis le poste, documenté,
      pour que l'écart ne puisse plus se reformer en silence
- [x] D3 — Cas validés par mutation, dont `::ffff:<non-local>` doit rester non local

## Nouvelles signatures / API
- Aucune route, aucun champ, aucun schéma nouveau.
- Variables d'environnement nouvelles : aucune, sauf si l'épinglage de Python
  en exige une.

## Sécurité & données
- **Authentification touchée : oui** — la lisibilité du fichier de jeton
  (défaut A) et la décision de localité qui gouverne l'exigence de jeton
  (défaut B, ADR-0020).
- Permissions / rôles touchés : oui — indirectement, `_locale()` décide si une
  requête doit présenter un secret.
- Données personnelles : non.
- Migration destructive : non applicable.
- Nouvelle exposition publique : **non, et c'est le risque à surveiller** — un
  correctif maladroit du défaut B (reconnaissance de `::ffff:` par préfixe)
  rendrait locale une adresse mappée **distante**, et ouvrirait l'écriture sans
  jeton au réseau. C'est l'inverse exact de ce que `bug-012` a corrigé.
- Risque identifié : **une garde d'authentification dont le verdict dépend de
  l'environnement n'est pas une garde connue**. Pendant six runs, le dépôt a
  cru tenir une propriété que la CI démentait.
- **Au moins un « oui » → `security-reviewer` (rôle GATE) coché**

## ADR attendu ?
- **Probable** : oui
- **Critère(s) candidat(s)** : 1, 2
- **Sujet pressenti** : « Ce qu'une suite verte prouve, et contre quel
  environnement » — l'épinglage de la version de Python et l'exécution en
  non-root sont des contraintes imposées à tous les cycles futurs, et la
  décision est invisible dans le code une fois prise. À confirmer par
  l'`architect` ; il se peut qu'un seul ADR couvre aussi l'arbitrage sur les
  modes de jeton acceptés.

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- Aucun

### Écrans / flux UI concernés
- Aucun

### Schéma BDD / migrations
- Aucun

### Documentation à produire / mettre à jour

#### Docs vivantes
- `control-center/README.md` — section « Tests », si le compte change ; la
  commande de lancement recommandée si elle devient « en non-root »

#### Docs transverses
- `CHANGELOG.md` — entrée sous 0.12.1
- `control-center/PIEGES.md` — mesurer en root ne mesure pas la CI

#### Docs immuables
- `docs/adr/NNNN-*.md` — si l'ADR pressenti est confirmé

## Critères d'acceptation
- [ ] **La CI est verte** — job « Suite de tests (control-center/) » compris.
      ⚠️ En attente d'un commit et d'un push autorisés par l'humain.
      Ce critère ne peut être remplacé par aucune mesure locale
- [x] La suite rend le **même verdict** en root et en non-root, et c'est
      vérifié par exécution dans les deux identités
- [x] `::ffff:127.0.0.1` est local sur la version de Python de la CI **et** sur
      *(prouvé localement par ÉMULATION de la sémantique 3.12.3 — test T1bis ;
      confirmation par exécution réelle en CI reste attendue)*
      celle du poste
- [x] `::ffff:192.168.1.55` **n'est pas** local, et un test le tient
- [x] La version de Python est épinglée en CI, ou l'intervalle supporté est
      *(intervalle **déclaré** 3.11–3.13, plancher mesuré via `tomllib` ; la
      vérification par la matrice exige un run CI)*
      déclaré et vérifié
- [x] Le docstring de `_locale()` ne contient plus d'affirmation « vérifié par
      exécution » qui soit fausse hors du poste
- [x] Suite de tests complète verte, zéro régression — **1887 cas / 24 fichiers**
      en root, **1883** en non-root, **0 échec**
- [ ] Lint propre, pas de warning nouveau.
      ⚠️ **Sans objet dans ce dépôt** : aucun linter n'est configuré ni installé
      (`ruff`, `flake8`, `pylint`, `pyproject.toml` absents), et aucun job de
      lint n'existe dans les deux CI. `python3 -m compileall` passe sur
      `backend/`, `hooks/` et `tools/`, ce qui couvre la syntaxe et rien de plus.
      Le critère vient du template ; il n'a pas de référent ici.
- [x] Comportement nominal testé manuellement selon le plan ci-dessous —
      points 1 à 3 exécutés (double identité, localité sur 10 formes, modes de
      jeton) ; **point 4 (CI) en attente du push**

## Plan de test manuel
1. **Double identité** : lancer la suite complète en root, puis sous un
   utilisateur normal sur une copie lisible — les deux comptes de cas et les
   deux verdicts doivent être identiques.
2. **Localité mappée** : vérifier `_locale()` sur `127.0.0.1`, `::1`,
   `::ffff:127.0.0.1` → local ; `192.168.1.55`, `::ffff:192.168.1.55`,
   `0.0.0.0` → non local.
3. **Jeton illisible** : poser un fichier de jeton en `0200` et vérifier que le
   comportement observé est le même pour root et pour un utilisateur normal.
4. **CI** : pousser et constater le vert, ou lancer le workflow sur une branche.

## Notes pour agent
- **Ne pas conclure de cause racine sans mesure.** Le défaut B a une hypothèse
  plausible et non vérifiée. Le kit a déjà payé ce travers : la cause racine de
  `bug-002` affirmait que `SessionEnd` marque la fin du tour, et `SessionEnd`
  ne se déclenche jamais. Relever la version de Python de la CI est la première
  tâche, pas une formalité.
- **Mesurer en root ne mesure pas la CI.** Tout compte de cas produit pendant
  ce cycle doit dire sous quelle identité il a été obtenu.
- Le docstring de `_locale()` est un cas d'école : il porte la mention
  « vérifié par exécution », et cette vérification a bien eu lieu — sur le
  poste. Une preuve d'exécution n'est une preuve que pour l'environnement où
  elle a été produite.
- Le défaut A a peut-être une bonne réponse « le test avait raison » : si l'on
  décide qu'un jeton en `0200` doit être refusé, c'est un **changement de
  comportement** du produit, pas seulement un test à corriger — et il mérite le
  GATE P1.

## Hors périmètre
- Les autres jobs de la CI, tous verts
- La dette de `tools/update_kit.sh` (`feature-013`, `feature-014`)
- Le passage de la suite à `unittest` : les scripts autonomes sont un choix
  assumé du module (PIEGES §6)
- Les quatre gardes de `redaction_spec.py` non auditées sous l'angle `if False:`,
  relevées à la clôture de feature-008 — elles méritent leur propre spec

---
## Journal de bord

<!-- UNE ligne par étape du workflow, écrite QUAND L'ÉTAPE TOMBE, jamais à la
     clôture. Horodatage · étape · agent · verdict · preuve chiffrée ou livrables. -->

- [2026-09-20 00:00] Étape 0 — agent principal — entrée dans le cycle au titre
  d'ADR-0017 : le critère d'acceptation de `feature-021` (« suite complète
  verte, zéro régression ») n'a **aucune ligne de base verte à opposer** tant
  que la CI reste rouge — ce n'est pas une garde désarmée au sens littéral de
  l'ADR (aucun bit de sécurité neutralisé par `bug-018`), mais une garde
  **rendue inatteignable en pratique** : « zéro régression » ne peut se
  mesurer contre un état déjà rouge. Les deux specs cohabitent donc dans
  `doing/`, une seule phase de test/revue/doc, décision reportée à un ADR
  (probable, critères 1 et 2 déjà pressentis dans la spec elle-même)
- [2026-09-20 00:00] Étape 1 — spec-reader — mesures de contrôle : image CI
  **ubuntu-24.04** (job « Suite de tests (control-center/) », workflow
  « Hygiène du dépôt »), Python local **3.13.5**
  (`ipaddress.ip_address('::ffff:127.0.0.1').is_loopback` → `True` en local,
  confirmé par exécution), et relevé du journal CI :
  `ECHEC test_T1_locale___ffff_127-0-0-1 : obtenu False pour
  '::ffff:127.0.0.1', attendu True`. Spec promue vers `doing/`, avec un
  correctif à sa propre grandeur mesurée (voir analyse d'impact : 7 runs
  rouges consécutifs, pas 6)

- [2026-09-20 20:19] Mesure du défaut A — agent principal — **mécanisme établi par
  exécution**, dans les deux identités, sur des fichiers dont l'utilisateur est
  **propriétaire** (condition de la CI ; une première tentative avec des
  fichiers appartenant à root refusait les cinq modes et ne reproduisait rien) :

  | mode | propriétaire non-root | root |
  |---|---|---|
  | `0600` | **LU** | LU |
  | `0400` | **LU** | LU |
  | `0200` | **REFUS** `PermissionError` | LU |
  | `0300` | **REFUS** | LU |
  | `0100` | **REFUS** | LU |

  Ce sont exactement les trois modes que `test_jeton.py:109` déclare actifs.
  `_MASQUE_INTERDIT = 0o077` ne vérifie que l'absence de bits groupe/autres ;
  `open()` échoue ensuite, sauf pour root qui franchit les permissions de
  fichier. ⚠️ Refuser explicitement ces trois modes rendrait les deux identités
  d'accord, mais **change le comportement du produit** : un jeton en `0200`
  fonctionne aujourd'hui sous root. Arbitrage `architect` + GATE P1.

- [2026-09-20 20:20] Livrable A2 — debugger — **cause racine du défaut B ÉTABLIE**, par
  comparaison source contre source : `Lib/ipaddress.py` téléchargé aux tags
  `v3.12.2` → `v3.13.0` et AST de `IPv6Address.is_loopback` parsé pour chacun.
  **Absent de la correction en 3.12.2 et 3.12.3** (`is_loopback` vaut
  `self._ip == 1`, donc `::1` seulement) ; **présent à partir de 3.12.4** et
  dans tout 3.13.x, où il délègue à `ipv4_mapped.is_loopback`. C'est le
  correctif CPython **gh-117566** (PR gh-117567 sur `main` le 2024-04-25,
  rétroportage gh-118391 sur la branche 3.12 le 2024-04-29).
  **La CI exécute le Python SYSTÈME d'`ubuntu-24.04` = 3.12.3**, faute de
  `setup-python` — recoupé par l'archive Ubuntu (`python3.12` de Noble =
  `3.12.3-1ubuntu0.17`, patchs de sécurité seulement). **Hypothèse de la spec
  CONFIRMÉE.** ⚠️ Aucune exécution directe sous 3.12.3 n'était possible ici
  (seule 3.13.5 est installée) : la preuve est une lecture du code amont par
  version, citable et vérifiable.
  **`ipv4_mapped` est IDENTIQUE** entre 3.12.3 et 3.12.4 (comparaison AST) :
  base de correction stable, contrairement à `is_loopback`.
  **Ligne fautive : `control-center/backend/server.py:284`** —
  `return ipaddress.ip_address(adresse_ip).is_loopback`. Le docstring (l. 277-281)
  affirme « vérifié par exécution : `::ffff:127.0.0.1` → True », vrai sur 3.13.5
  seulement → livrable **A4** confirmé.
  ⚠️ **Piège relevé** : le README de l'image runner porte **deux** listes Python
  — le logiciel système, et le cache d'outils inactif sans `setup-python`. Les
  confondre mène à la mauvaise version.

---
# Notes d'implémentation

## Plan (architect) — 2026-09-20

> **VALIDATION SECURITY-AUDITOR REQUISE (P1)** — la branche retenue pour A1 est
> un **changement de comportement du produit** sur la surface d'authentification
> (un jeton en `0200` cesse de fonctionner), et A3 touche la décision de localité
> qui gouverne l'exigence de jeton (ADR-0020).

### Approche en une ligne
Rendre les deux gardes **décidables sur des données que l'exécutant ne change
pas** — le *bit de mode* plutôt que ce que `open()` réussit, l'*adresse mappée*
plutôt que ce que `is_loopback` sait de la version — puis déclarer et vérifier
l'intervalle de Python au lieu de l'épingler.

### Étapes (≤ 10)
1. `backend/jeton.py` : après la garde `_MASQUE_INTERDIT`, ajouter
   `_MASQUE_LECTURE_PROPRIETAIRE = 0o400` et refuser avec un motif **nommé et
   distinct** de « absent ou illisible » (A1).
2. `backend/test_jeton.py:109` : scinder la boucle en **4 modes actifs**
   (`0600, 0400, 0500, 0700`) et **4 modes refusés** (`0200, 0300, 0100, 0000`),
   l'assertion de refus portant **sur le motif**, pas sur `not actif()` seul (A1).
3. `backend/server.py:284` : `_locale()` extrait `ipv4_mapped` et **repose la
   question** sur l'adresse extraite ; jamais de reconnaissance de préfixe (A3).
4. `backend/server.py:277-281` : docstring — retirer le « vérifié par exécution »
   et dire **sur quelle version** la vérification a eu lieu (A4).
5. `backend/test_server_bug012.py` : ajouter `::ffff:192.168.1.55` → **non local**
   et `::ffff:10.0.0.1` → non local, à côté du cas `::ffff:127.0.0.1` (A3/D3).
6. `.github/workflows/hygiene-specs.yml` : garder le job **système non épinglé**
   (`ubuntu-latest`, sans `setup-python`) et lui **ajouter** un job en matrice sur
   les deux bornes de l'intervalle déclaré, via `actions/setup-python` (A5).
7. `.gitlab/ci/hygiene.yml` : l'intervalle déclaré vaut aussi là-bas
   (`alpine:3.20`, Python encore différent) — au minimum le documenter (A5).
8. `control-center/README.md` + `PIEGES.md` + `CHANGELOG.md` + `docs/adr/0035-*`
   (C1).

### A1 — défaut A : **les DEUX branches, avec la branche 2 en tête**

**Verdict : le code est trop permissif (branche 2), et le test est faux en
conséquence (branche 1).** Les deux, et dans cet ordre : corriger le test seul
ne ferait que cesser de mesurer un comportement qui, lui, resterait dépendant de
l'identité.

**Mesuré ici**, en root, Python 3.13.5, fichiers dont l'exécutant est
propriétaire (`python3` appelant `J.charger()` sur un fichier hors dépôt, un
mode par appel) :

| mode | `actif()` aujourd'hui, **en root** | attendu après correctif, **les deux identités** |
|---|---|---|
| `0600` | True | True |
| `0400` | True | True |
| `0500` | True | True |
| `0700` | True | True |
| `0200` | **True** | **refusé** |
| `0300` | **True** | **refusé** |
| `0100` | **True** | **refusé** |
| `0000` | **True** | **refusé** |

`0000` **n'est pas dans la liste des six modes de `test_jeton.py:109`** : il est
actif aujourd'hui en root, et personne ne le teste. La garde proposée le couvre.

**Pourquoi la branche 2 plutôt que la branche 1 seule.** Retirer simplement
`0200/0300/0100` de la liste rendrait la suite verte dans les deux identités,
mais laisserait intacte la propriété qui a causé le bug : *le produit lui-même*
rend un verdict différent selon l'exécutant. Un serveur lancé en root accepterait
un jeton que le même serveur, lancé sous un compte normal, refuserait — avec pour
seul motif « fichier_jeton absent ou illisible », c'est-à-dire un message **faux**
(le fichier est là, et son mode passe la garde). Le module a une doctrine écrite,
*fail-closed* : « une configuration cassée est le moment où il faut se méfier ».
Un jeton que son propriétaire ne peut pas lire **est** une configuration cassée.

**Le sens du changement est fermant, pas ouvrant** : rien qui était refusé ne
devient accepté. Le seul cas perdu est « serveur lancé en root + jeton en
`0200/0300/0100/0000` », qui bascule de « pilotage ouvert » à « pilotage fermé
avec un motif nommé, réparable par un `chmod 600` ». Coût opérateur : une ligne
de message au démarrage. C'est ce point précis qui doit passer le GATE P1.

**La garde se décide sur le BIT DE MODE, jamais sur `os.access()`.** Mesuré ici,
en root : `os.access(f, os.R_OK)` rend **True** sur `0200` **et** sur `0000`,
alors que le bit `0o400` est absent dans les deux cas. Utiliser `os.access()`
réintroduirait exactement la dépendance à l'identité que ce cycle supprime.
`info.st_mode & 0o400` est la seule donnée que l'exécutant ne change pas.

**Par où l'on atteint la garde, et ce qui ne doit pas la déclencher.**
Chemin : `charger()` → chemin non vide → hors dépôt → `os.stat` OK → fichier
régulier → masque `0o077` passé → **garde neuve**. Sa portée est exactement
« aucun bit groupe/autres **et** pas de bit lecture propriétaire ».
*Atteignabilité prouvée par exécution* : les huit modes du tableau ci-dessus
arrivent tous jusqu'à `open()` aujourd'hui (`actif=True` en root pour les huit),
donc aucune garde antérieure ne court-circuite ; `0200/0300/0100/0000` la
déclencheront, `0600/0400/0500/0700` (bit `0o400` posé) **ne la déclencheront
pas**. Aucun défaut ouvert du backlog ne la rend inatteignable.
**Contrainte ADR-0007 préservée** : la garde de masque reste en place, en amont,
inchangée ; `0640` reste refusé par elle et non par la neuve.

**⚠️ Piège de test à ne pas rater (sinon la garde est livrée sans filet).** Sous
un exécutant non-root, `0200` rend **déjà** `actif() == False` — par l'échec de
`open()`. Un test qui n'assertait que `not j.actif()` resterait donc **vert en
non-root même si la garde neuve était supprimée**, et ne mourrait qu'en root :
le verdict de la *mutation* deviendrait à son tour une propriété de l'exécutant.
L'assertion doit porter sur le **motif** (`"lisible" in j.refus`), et le motif
neuf doit être **textuellement distinct** de `"fichier_jeton absent ou
illisible"`. Mutation à exercer (PIEGES §37) : neutraliser la garde elle-même
(`if False:`), pas le masque qu'elle jouxte — et mesurer le mutant **sous les
deux identités**.

**Résidu assumé, nommé.** Un fichier en `0600` appartenant à **un autre
utilisateur** reste lisible par root et refusé pour les autres : la dépendance à
l'identité subsiste sur cet axe. Le corriger demanderait une garde de propriété
(`st_uid`), soit un **second** changement de comportement, non exposé par la CI
et hors du périmètre de `bug-018`. À proposer comme spec propre ; à signaler au
GATE P1 pour qu'il statue sur le report plutôt que de le découvrir après.

### A5 — défaut C : **déclarer et vérifier, ne pas épingler**

**Verdict : ne pas épingler la version de Python. Déclarer l'intervalle supporté,
le vérifier aux deux bornes, et garder un job non épinglé en vigie.**

Trois raisons, dans l'ordre de poids :

1. **Épingler aurait masqué `bug-018` au lieu de le révéler.** C'est précisément
   le job non épinglé qui a rendu le défaut B visible. Un `setup-python` posé en
   2024 aurait rendu la CI verte et laissé le produit faux chez tous les
   consommateurs en 3.12.3. On ne supprime pas le seul capteur qui a fonctionné.
2. **Le kit est distribué** à des projets dont on ne contrôle pas
   l'environnement. Épingler ne fixerait que *notre* CI ; leur Python resterait
   celui de leur distribution. Mesuré : le même dépôt exécute déjà **trois**
   environnements différents — `ubuntu-latest` (= `ubuntu-24.04` aujourd'hui,
   Python système 3.12.3) pour GitHub, `alpine:3.20` pour GitLab
   (`.gitlab/ci/hygiene.yml`, `apk add python3`), et le poste en 3.13.5.
3. **Le correctif de A3 rend le comportement indépendant de la version de toute
   façon** (`ipv4_mapped` est identique de 3.12.3 à 3.12.4 — établi au livrable
   A2). Épingler n'aurait donc corrigé aucun des deux défauts ; ce serait un
   silence acheté, pas une garde.

**Ce que « vérifier » veut dire concrètement.** Un job en matrice
`actions/setup-python` sur les **deux bornes** de l'intervalle déclaré, **en plus**
du job système actuel laissé tel quel. Trois exécutions : plancher, plafond,
vigie non épinglée. Dépendance nouvelle : `actions/setup-python`, action
officielle GitHub, même fournisseur que `actions/checkout@v4` déjà utilisé —
justification suffisante au regard de la règle « pas de nouvelle dépendance sans
justification » ; aucune dépendance **du produit** n'est ajoutée (ADR-0006 tenu :
bibliothèque standard uniquement).

**Où fixer le plancher — et pourquoi pas au ras de la borne.** Mesuré ici :
`ast.parse(..., feature_version=(3, N))` sur les **22** fichiers de
`control-center/backend/` passe **sans une seule erreur de syntaxe de 3.7 à
3.13** — la *syntaxe* ne contraint donc rien, et le plancher réel tient aux
**API de la bibliothèque standard**, que cette mesure ne couvre pas.
Conséquence : le plancher ne se décrète pas, il **se mesure par le job de
matrice**. Candidat de départ **3.9**, retenu avec **marge de trois versions
mineures** sous le plus ancien environnement réellement exécuté (3.12.3) : poser
le plancher à 3.12 le collerait au ras de l'image du runner, et le premier
retour à `ubuntu-22.04` (Python 3.10) ou une image Alpine plus ancienne
invaliderait la déclaration sans qu'aucun commit ne la touche. Si la matrice
échoue en 3.9, on **remonte le plancher à la première borne verte** et on écrit
la valeur mesurée — jamais l'inverse. *Hypothèse non vérifiée* :
`IPv6Address.ipv4_mapped` existe depuis 3.4 ; aucune exécution sous 3.9 n'a été
possible ici (seule 3.13.5 est installée), c'est le job de matrice qui tranchera.

**Source unique de l'intervalle.** La valeur déclarée ne doit exister **qu'à un
seul endroit** lu par la matrice (PIEGES §21 : une énumération tenue à la main
est une mesure périmée d'avance). Deux copies — une dans le workflow, une dans le
README — divergeront.

**Ce que ça impose aux cycles futurs :** (a) tout code neuf du module est écrit
contre le **plancher déclaré**, pas contre le Python du poste ; (b) toute
promesse « suite verte » mentionne l'**identité** et la **version** sous
lesquelles elle a été obtenue ; (c) relever le plancher est un changement
déclaré, pas un effet de bord d'une ligne de code.

**Point d'attention mesuré, hors périmètre déclaré mais à signaler** :
`.gitlab/ci/hygiene.yml` **énumère à la main** les fichiers de test du centre de
contrôle (`test_record_event.py`, `test_specs.py`…) au lieu de les découvrir par
`find` comme le fait GitHub — `test_jeton.py` et `test_server_bug012.py` n'y sont
pas. La CI GitLab est donc verte **parce qu'elle ne lance pas les tests qui
échouent**. C'est un §21 de plus, et il mérite sa propre spec.

### Trade-offs
- **Retenu (A1)** : refus explicite d'un jeton sans bit de lecture propriétaire.
  *Pour* : verdict identique root / non-root, motif vrai, sens fermant.
  *Contre* : changement de comportement du produit, si mince soit sa population.
- **Écarté (A1)** : corriger le seul test. *Pourquoi* : rend la suite verte en
  cessant de mesurer ce qui est cassé — le produit reste dépendant de l'identité.
- **Écarté (A1)** : garde sur `os.access()`. *Pourquoi* : rend True en root sur
  `0200` et `0000` (mesuré) — elle reconduirait le défaut.
- **Retenu (A5)** : intervalle déclaré + matrice aux deux bornes + vigie non
  épinglée. *Contre* : deux jobs de CI en plus, une action GitHub officielle.
- **Écarté (A5)** : `setup-python` avec une version fixe. *Pourquoi* : aurait
  masqué ce bug même ; ne dit rien de l'environnement des projets consommateurs.

### Données & transactions
Sans objet : aucune BDD, aucune migration, aucune route, aucun champ. Aucune
tâche de fond. Aucune variable d'environnement nouvelle.

### Verdict ADR
**ADR REQUIS — un seul, `docs/adr/0035-*`** (prochain numéro libre **vérifié** :
`ls docs/adr/` s'arrête à `0034-ce-que-le-depot-garde-des-references-de-conception.md`).
Sujet : **« Ce qu'une suite verte prouve : sous quelle identité, contre quel
intervalle de versions »**, portant les **deux** décisions de ce cycle — le mode
de jeton arbitré sur le bit plutôt que sur ce que l'exécutant peut faire, et
l'intervalle déclaré plutôt qu'épinglé. Un seul ADR, parce que les deux réponses
énoncent la même thèse : *une garde se décide sur une donnée que l'environnement
d'exécution ne peut pas changer*.

Les **quatre** critères de `CLAUDE.md` sont remplis — pas seulement les deux
pressentis par la spec :
1. **Contrainte structurante imposée ailleurs** : tout cycle futur écrit contre
   le plancher déclaré, et toute annonce « suite verte » doit nommer identité et
   version ; la contrainte descend aussi dans les projets consommateurs.
2. **Décision invisible dans le code** : une fois `permissions & 0o400` écrit,
   rien ne dit pourquoi un jeton en `0200` est refusé au lieu d'être tenté ; une
   fois la matrice verte, rien ne dit pourquoi le job système n'a pas été épinglé
   — et le premier lecteur pressé l'épinglera « pour stabiliser la CI ».
3. **Alternatives crédibles** : « corriger le test » et « épingler » sont l'une
   et l'autre des réponses défendables, moins coûteuses, et fausses pour des
   raisons qui ne se devinent pas.
4. **Verrouillage long terme** : l'intervalle supporté est une promesse faite aux
   projets consommateurs — on l'élargit sans douleur, on ne le rétrécit jamais
   sans casser quelqu'un.

### Points d'attention
- **A3 n'est pas un filtrage de préfixe.** Extraire `ipv4_mapped` et **reposer la
  question** ; `::ffff:192.168.1.55` doit rester non local, sous peine d'ouvrir
  l'écriture sans jeton au réseau — l'inverse exact de `bug-012`.
- **`0000` entre dans le périmètre** alors qu'il n'est pas dans les six modes de
  la spec : actif en root aujourd'hui (mesuré), non testé.
- **Le motif de refus neuf doit être textuellement distinct** de « absent ou
  illisible », sinon la mutation de la garde ne meurt qu'en root.
- **Aucun chemin de fichier dans le motif** exposé : `_raison_publique()`
  (`server.py`) nettoie déjà le chemin — vérifier que le motif neuf, s'il cite le
  mode, ne cite pas le chemin, ou qu'il passe bien par ce nettoyage.
- **D2 (lancer la suite en non-root)** est la garde qui empêche l'écart de se
  reformer ; sans elle, ce cycle corrige le symptôme du jour. Voir PIEGES §43
  (`runuser -u nobody` + `o+x` sur toute la chaîne des parents).
- **Tout compte de cas produit dans ce cycle dit son identité et sa version.**

### Tests à prévoir
- `test_jeton.py` : 4 modes actifs / 4 modes refusés, **assertion sur le motif** ;
  la suite entière rejouée **en root et en non-root**, mêmes comptes, même verdict.
- `test_server_bug012.py` : `::ffff:127.0.0.1` local ; `::ffff:192.168.1.55` et
  `::ffff:10.0.0.1` **non locaux** ; `0.0.0.0` non local ; adresse imprononçable
  non locale.
- Mutation (PIEGES §35, §36, §37) : `if False:` sur la garde de lecture
  propriétaire, et suppression de l'extraction `ipv4_mapped` — un mutant par
  invocation, `PYTHONDONTWRITEBYTECODE=1`, purge de `__pycache__`, **mesuré sous
  les deux identités**.
- CI : la matrice doit être **rouge** si l'on remet `is_loopback` seul — sinon
  elle ne prouve pas l'indépendance à la version qu'elle annonce.

- ADR : **ADR-0035 à créer** — « Ce qu'une suite verte prouve : sous quelle
  identité, contre quel intervalle de versions » (critères 1, 2, 3 et 4).

- [2026-09-20 20:26] ⚠️ **CONSTAT GRAVE hors périmètre déclaré** — relevé par l'architecte,
  **vérifié par mesure** par l'agent principal : `.gitlab/ci/hygiene.yml`
  **énumère les tests à la main**, là où `.github/workflows/` les **découvre**
  par `find control-center -name 'test_*.py'`. Résultat mesuré :
  **6 fichiers lancés sur 23**, soit **17 manquants**, dont `test_jeton.py` et
  `test_server_bug012.py` — précisément les deux qui échouent — et
  `test_agents.py`, que le commentaire du workflow GitHub cite comme ayant
  **déjà** été oublié une fois par énumération manuelle.
  **Conséquence** : sur le même commit, « la CI est rouge » et « la CI est
  verte » sont toutes deux vraies selon la forge. GitLab est verte **parce
  qu'elle ne lance pas ce qui échoue**. C'est le même défaut de fond que
  `bug-018` — une suite verte qui ne prouve rien — sur une autre surface, et
  il **désarme la garde que ce cycle livre**. Arbitrage humain demandé.

## Audit sécurité — bug-018 — rôle : GATE P1 (design) — 2026-09-20

**Périmètre lu** : cette spec (journal et plan compris) ; `backend/jeton.py`
(entier) ; `backend/server.py` l.255-330 (`_locale`, `_raison_publique`,
`_jeton_configure`), l.680-1010 (`Handler`, `do_GET`, `do_POST`), l.1290-1360
(bannière de démarrage) ; `test_jeton.py` l.80-140 ; `test_server_bug012.py`
l.80-120 ; `.github/workflows/hygiene-specs.yml` ; ADR-0007, ADR-0020 ;
`control-center/PIEGES.md`. **Non lu** : `.gitlab/ci/hygiene.yml` au-delà d'un
`grep`, `config.py`, `vcs.chemin_sur()`. Mesures faites en root, Python 3.13.5.

### Verdict : **GO SOUS CONDITIONS**

### Conditions à lever (vérifiables sur le diff P2)

1. **La garde neuve se décide sur `info.st_mode & 0o400`**, et `jeton.py` ne
   contient **aucun** appel à `os.access` (grep vide). Mesuré ici en root :
   `os.access(f, R_OK)` rend `True` sur `0200` **et** sur `0000` — une garde
   écrite ainsi reconduirait exactement le défaut A.
2. **Place et intégrité du masque** : la garde neuve vient **après** la ligne
   `if permissions & _MASQUE_INTERDIT:` (`jeton.py:173`), `_MASQUE_INTERDIT`
   reste `0o077`, et `0640` est toujours refusé avec le motif « trop
   permissif » (jamais avec le motif neuf). Les sept cas `0o060…0o004` de
   `test_jeton.py` restent inchangés.
3. **Motif neuf textuellement distinct** de « fichier_jeton absent ou
   illisible », **sans chemin de fichier** dans le texte (il traverse
   `_raison_publique()` jusqu'à `/api/etat`). L'assertion des 4 modes refusés
   (`0200, 0300, 0100, 0000`) porte sur ce motif, pas sur `not actif()` seul.
4. **`_locale()` ne touche jamais `ipv4_mapped` sur un `IPv4Address`** :
   mesuré ici, `ipaddress.ip_address("127.0.0.1").ipv4_mapped` lève
   `AttributeError`, que `except (ValueError, TypeError)` **n'attrape pas** —
   la requête tomberait en 500 (`do_GET:928`) pour toute adresse IPv4. Forme
   attendue : `getattr(ip, "ipv4_mapped", None)` ou `isinstance(ip,
   IPv6Address)`, puis `mapped.is_loopback` si non-`None`, sinon
   `ip.is_loopback`. Aucune opération de chaîne sur `adresse_ip` : grep de
   `startswith`, `"::ffff"`, `split(":")` dans `_locale` vide.
5. **Cas de test obligatoires sur `_locale`** (tous mesurés ici avec
   `ipv4_mapped.is_loopback`) — locaux : `127.0.0.1`, `::1`,
   `::ffff:127.0.0.1`, **`::ffff:7f00:1`** ; non locaux :
   `::ffff:192.168.1.55`, `::ffff:10.0.0.1`, `::ffff:0.0.0.0`, `::7f00:1`
   (IPv4-compatible, pas mappée), `64:ff9b::7f00:1` (NAT64), `0.0.0.0`, `""`,
   `None`. **`::ffff:7f00:1` est le discriminant** : même adresse que
   `::ffff:127.0.0.1` sous une autre graphie, il échoue sur toute
   reconnaissance de préfixe et passe sur une vraie extraction.
6. **Mutations mesurées sous les deux identités** : `if False:` sur la garde
   de lecture (doit tuer en root ET en non-root, cf. piège nommé par
   l'architecte) ; suppression de l'extraction `ipv4_mapped` (doit tuer T1 sur
   le job vigie 3.12.3 **et** au plancher de la matrice — 3.9 n'a pas le
   correctif gh-117566, hypothèse à confirmer par le run).

### Réponses point par point

**1. Changement de comportement (A1)** — *acceptable, sens fermant*. Rien de
refusé ne devient accepté. Le cas perdu (« serveur en root + jeton sans bit de
lecture ») bascule vers la bannière « écriture : FERMÉE — jeton déclaré mais
invalide » (`server.py:1327`) avec le motif neuf ; `/api/etat` le publie via
`ecriture_raison`. C'est la doctrine *fail-closed* d'ADR-0020 §2 appliquée à un
cas qu'elle ne nommait pas. Portée réelle : un secret que son propriétaire ne
peut pas lire est une erreur de `chmod`, pas un déploiement — population
vraisemblablement nulle, réparation en une commande.

**2. Bit, jamais `os.access`** — *confirmé par mesure*, gravé en condition 1.

**3. Résidu `st_uid`** — *report acceptable*. Sous ADR-0020 (un développeur, un
serveur), poser un fichier `0600` à l'emplacement configuré exige déjà un
shell local avec droits sur ce répertoire — l'attaquant a alors tout sans
passer par le jeton. Une garde `st_uid == geteuid()` casserait en outre un
déploiement légitime (serveur en root dans un conteneur, fichier détenu par le
développeur) : elle mérite son propre P1. Spec dédiée, hors cycle.

**4. Défaut B** — la forme « extraire puis reposer la question » est correcte
et ne reconnaît aucun préfixe ; conditions 4 et 5 la rendent vérifiable.
**Place de `_locale()`** : un seul appelant (`_distante()`, l.756), en
`do_POST` à l'étape 2 (l.958), après le 404 de routage et **avant** lecture
du corps. Un faux positif y ouvre la branche « locale sans jeton », gardée par
`Origin`/`Content-Type` seulement — écriture réseau sans secret, l'inverse de
`bug-012`. Ordre des gardes inchangé par le design : conforme.

**5. Acquis préservé** — le design pose la garde après le masque, sans le
modifier : conforme, condition 2 le rend vérifiable. Note : la règle « lisible
par groupe/autres = refusé » vient du GATE P1 de `feature-007`, pas
d'ADR-0007 (qui traite du `.toml` et de `var/`) — référence à corriger dans
l'ADR-0035, cosmétique.

### Acceptable pour ce contexte
- `actions/setup-python` (A5) : même fournisseur que `checkout@v4`, épinglé
  par tag majeur selon la convention existante. **Hypothèse** :
  `python-version: "3.12"` installe la dernière 3.12.x (≥ 3.12.4, corrigée) —
  seul le job vigie non épinglé reproduit 3.12.3. La matrice prouve
  l'intervalle, pas le cas CI historique ; c'est cohérent avec le plan.

### Cosmétique
- Référence ADR-0007 (ci-dessus). Docstring `_locale` (A4) : dire la version.

### Ce que je n'ai PAS pu vérifier
- Aucune exécution sous 3.12.3 ni 3.9 : la preuve du défaut B reste une
  lecture de source amont ; le run CI tranchera.
- Comportement de `ipv4_mapped` sur une adresse à portée (`%lo`) : non mesuré,
  non exigé.
- [2026-09-20 20:30] Étape GATE P1 — security-reviewer — **GO SOUS CONDITIONS**, 6 conditions
  numérotées et vérifiables sur le diff P2. A1 jugé **acceptable, sens fermant** :
  rien de refusé ne devient accepté, le cas perdu tombe sur la bannière
  « écriture FERMÉE » et se répare par `chmod 600`. Report de la garde `st_uid`
  **accepté** : l'exiger casserait un déploiement légitime (root en conteneur).
  ⚠️ **Défaut trouvé dans le correctif proposé, avant tout code** :
  `ip_address("127.0.0.1").ipv4_mapped` lève **`AttributeError`**, que le
  `except (ValueError, TypeError)` n'attrape pas — **toute requête IPv4 serait
  tombée en 500**. Exiger `getattr(ip, "ipv4_mapped", None)`.
  ⚠️ Cas discriminant imposé : **`::ffff:7f00:1`** — même adresse que
  `::ffff:127.0.0.1`, autre graphie ; un correctif par préfixe de chaîne y échoue.
  ⚠️ Correction d'une citation fautive que l'agent principal avait propagée
  depuis la spec : la règle groupe/autres vient du **GATE P1 de `feature-007`**,
  pas d'`ADR-0007` — à rectifier dans ADR-0035.
  Non vérifié et déclaré tel : aucune exécution sous 3.12.3 ni 3.9.
- [2026-09-20 20:42] Étape 5 — backend-developer — **implémenté sous les 6 conditions**.
  `jeton.py` : `_MASQUE_LECTURE_PROPRIETAIRE = 0o400`, garde **après**
  `_MASQUE_INTERDIT`, décidée sur le bit — `grep os.access jeton.py` **vide**
  (vérifié par l'agent principal). `server.py` : `_locale()` via
  `getattr(ip, "ipv4_mapped", None)`, **0** opération de chaîne (vérifié),
  docstring A4 corrigé (« SUR PYTHON 3.13.5 SEULEMENT » + explication de
  gh-117566). Tests : `test_jeton.py` **48 → 54 cas**, `test_server_bug012.py`
  **53 → 61 cas**, 0 échec, rejoués par l'agent principal. Les 10 cas de
  localité vérifiés un par un, dont le discriminant `::ffff:7f00:1` → `True`
  et `::ffff:192.168.1.55` → `False`. A5 : job vigie non épinglé **conservé**
  + matrice `setup-python` `["3.9","3.13"]`. D2 : script de lancement en
  non-root **testé réellement**, 23/23 fichiers verts.
- [2026-09-20 20:42] ⚠️ **RECTIFICATION d'une conclusion du développeur** — agent principal.
  Il concluait que muter le correctif du défaut B « ne tue rien sur ce poste »
  et que seule la CI pouvait le prouver. **C'est prouvable ici.** En émulant la
  sémantique d'avant gh-117566 (`IPv6Address.is_loopback` = `self._ip == 1`),
  le mutant sans extraction `ipv4_mapped` **diverge sur 2 cas** :
  `::ffff:127.0.0.1` et `::ffff:7f00:1` rendent `False` sans l'extraction,
  `True` avec. Et `::ffff:192.168.1.55` reste `False` dans les deux — aucun
  faux positif introduit. **À transformer en test durable** par
  `test-engineer` : la garde cesse alors de dépendre d'un environnement qu'on
  n'a pas sous la main. Une garde qu'on ne peut pas voir mourir ne prouve rien.
- [2026-09-20 20:44] Mesure de clôture partielle — agent principal — **les deux identités
  rendent désormais le MÊME verdict**, mesuré et non rapporté :

  | identité | fichiers | cas | échecs |
  |---|---|---|---|
  | root | 23 | **1870** | **0** |
  | `nobody` (via `tools/lancer_suite_control_center_non_root.sh`) | 23 | **1870** | **0** |

  C'est l'objet même de la spec : « suite verte » redevient une propriété du
  code et non de la machine qui l'a lancée. ⚠️ **Ne clôt pas le cycle** : le
  critère non substituable reste **la CI verte**, et il exige un commit et un
  push que seul l'humain autorise.

## Audit sécurité — bug-018 — rôle : GATE P2 (diff réel) — 2026-09-20

**Périmètre lu** : `git diff` de `jeton.py`, `server.py`, `test_jeton.py`,
`test_server_bug012.py`, `hygiene-specs.yml`, `.gitlab/ci/hygiene.yml`,
`README.md` ; `tools/lancer_suite_control_center_non_root.sh` entier ;
`server.py` `do_POST` l.946-1000 et `_raison_publique` l.309-324 ; `PIEGES.md`.
Mesures : root, Python 3.13.5, clone jetable `cp -a` + `runuser -u nobody`.
**Non lu** : `config.py`, `vcs.py`. **Non exécuté** : aucun Python 3.12.3 ni 3.9.

### Verdict : **GO SOUS CONDITIONS**

### Condition à lever (une seule, condition de clôture)

1. **Un test durable qui fait mourir le mutant « extraction `ipv4_mapped`
   retirée » sur ce poste.** Forme attendue : dans `test_server_bug012.py`,
   rejouer `_locale` avec une émulation de la sémantique pré-gh-117566
   (sous-classe d'`IPv6Address` dont `is_loopback` vaut `self._ip == 1`),
   et asserter `::ffff:127.0.0.1` et `::ffff:7f00:1` → `True`,
   `::ffff:192.168.1.55` → `False`. Recoupé par mesure ici : le mutant diverge
   sur exactement ces 2 cas, aucun faux positif sur les 12 autres. Sans ce
   test, la garde du défaut B ne peut mourir **que** sur le job vigie 3.12.3 —
   une garde d'authentification qu'on ne voit pas mourir localement a une
   portée que personne ne connaît. Preuve exigée : le mutant tue ≥ 1 cas
   en local (PIEGES §35-37).

### Les six conditions P1, une par une

| # | Condition P1 | État | Preuve |
|---|---|---|---|
| 1 | Bit `st_mode & 0o400`, zéro `os.access` | **tenue** | `jeton.py:86,193` ; grep `os.access` vide (recoupé) |
| 2 | Garde **après** `_MASQUE_INTERDIT`, masque intact `0o077`, `0640` → « trop permissif » | **tenue** | `jeton.py:75,184-193` ; mesuré : `0640`/`0604` → « trop permissif », `0200`/`0000` → motif neuf ; les 7 cas `0o060…0o004` de `test_jeton.py` non touchés par le diff |
| 3 | Motif distinct, sans chemin ; assertion sur le motif | **tenue** | `jeton.py:194-195` — `%04o` seul, aucun `%s` de chemin ; mesuré `chemin in motif == False` ; `test_jeton.py:127-137` asserte les deux |
| 4 | `getattr(ip, "ipv4_mapped", None)`, zéro opération de chaîne | **tenue** | `server.py:305-306` ; grep `startswith/split/replace` dans `_locale` vide |
| 5 | 12 cas de localité dont `::ffff:7f00:1` | **tenue** | `test_server_bug012.py:99-116` — les 12 présents, 14 au total, verdicts recoupés un par un |
| 6a | Mutation `if False:` sur la garde de lecture, root **et** non-root | **tenue autrement** (mesurée par moi, pas encore par test-engineer) | clone jetable : base 54/0 sous les deux identités ; mutant → **4 échecs en root**, **8 en nobody** (en nobody le motif retombe sur « absent ou illisible » **avec le chemin** — l'assertion « sans chemin » meurt aussi, c'est le bon signal) |
| 6b | Mutation `ipv4_mapped` doit tuer sur 3.12.3 / 3.9 | **non tenue localement** → condition 1 ci-dessus | sur 3.13.5 natif, le mutant tue 0 cas ; l'émulation le fait diverger sur 2 |

### Écarts design → code
- **Aucun sur l'ordre des gardes** : le diff `server.py` ne touche que la
  hunk l.274-306 ; `do_POST` garde 404-routage → `_distante()` → jeton/origine
  → corps, inchangé (`server.py:946-1000`).
- **Vigie non épinglée conservée** : `git diff -U0` montre une seule hunk
  `@@ -197,0 +198,63 @@` — le job `centre-de-controle` l.143 est intact, la
  matrice s'ajoute après. C'est lui seul qui reproduit 3.12.3.
- Matrice `["3.9","3.13"]` et non `3.12` : le plan disait « déclarer
  l'intervalle », c'est ce qui est fait ; conforme.

### `.gitlab/ci/hygiene.yml` (bug-019) — remarque de sécurité
Pas de constat bloquant, un constat **positif** : la pipeline GitLab lançait
6 fichiers sur 23 et **omettait précisément les deux suites d'authentification**
(`test_jeton.py`, `test_server_bug012.py`). « Suite verte » n'y prouvait rien
sur l'auth. La découverte corrige cela ; le refus sur liste vide et la collecte
des échecs hors sous-shell sont corrects. **Hypothèse non vérifiée** :
`alpine:3.20` fournit un Python 3.12.x dont la version de patch décide s'il
joue aussi vigie gh-117566 — sans importance une fois le correctif livré.

### Acceptable pour ce contexte
- Résidu `st_uid` (P1 §3) : toujours reporté, spec dédiée à ouvrir.
- Script non-root : `chown -R nobody` sur un clone `mktemp -d`, `trap` de
  nettoyage, aucune écriture dans le dépôt — conforme à PIEGES §1/§43.

### Hors périmètre, signalé
- `.claude/settings.json` (arbre de travail, pas ce lot) ajoute `Edit`,
  `Write`, `Bash` **sans motif** à la liste `allow` — élargissement des
  droits de l'outillage (attaquant 4), à ne pas embarquer dans ce commit.

### Ce que je n'ai PAS pu vérifier
- Exécution réelle sous 3.12.3 et 3.9 : c'est le run CI qui tranchera.
- Le script non-root sur un poste où `/tmp` n'est pas `1777`.
- [2026-09-20 20:46] Étape GATE P2 — security-reviewer — **GO SOUS CONDITIONS**, une seule
  condition, **de clôture** : le test d'émulation de la sémantique pré-gh-117566
  dans `test_server_bug012.py`, pour que le mutant « extraction `ipv4_mapped`
  retirée » meure **localement**. Motif du GATE, mot pour mot : « une garde
  d'authentification qu'on ne voit pas mourir a une portée que personne ne
  connaît. » Recoupé par sa propre mesure : le mutant diverge sur exactement
  2 cas, aucun faux positif sur les 12 autres.
  **Les 6 conditions P1 : tenues.** Mutation 6a refaite par le GATE en clone
  jetable : `if False:` sur la garde → **4 échecs en root, 8 sous `nobody`** ;
  sous `nobody` le motif retombe sur « absent ou illisible » **avec le chemin**,
  donc l'assertion « sans chemin » meurt aussi — la garde est doublement tenue.
  **Aucun écart design → code** : l'ordre des gardes de `do_POST` est inchangé
  (404-routage → `_distante()` → jeton/origine → corps), et la **vigie non
  épinglée est conservée** (`git diff -U0` : une seule hunk, ajout après le job
  existant). `bug-019` jugé **positif** : la pipeline GitLab omettait
  précisément les deux suites d'**authentification**.
  ⚠️ **Signalement hors lot** : `.claude/settings.json` de l'arbre de travail
  ajoute `Edit`, `Write`, `Bash` à `allow` **sans motif écrit** — élargissement
  des droits de l'outillage, **à ne pas embarquer dans ce commit**. Modifié
  avant ce cycle, non touché par lui.
  Non vérifié et déclaré : exécution réelle sous 3.12.3 et 3.9 — le run CI
  tranchera ; résidu `st_uid` toujours reporté à une spec dédiée.
- [2026-09-20 20:57] Étape 7 — test-engineer — **12 mutations, 1 survivant trouvé et corrigé**.
  Comptes vérifiés par l'agent principal : **24 fichiers, 1887 cas, 0 échec en
  root** ; 1883 en `nobody` (écart de 4 expliqué ci-dessous, pas un échec).
  **Condition de clôture du GATE P2 levée** : test d'émulation T1bis écrit dans
  `test_server_bug012.py` — substitue `is_loopback` par la sémantique
  pré-gh-117566, interroge le vrai `_locale()`, **restaure dans un `finally`**,
  avec un cas de contrôle qui détecterait la fuite de la substitution. Le mutant
  « extraction `ipv4_mapped` retirée » meurt désormais **localement**, sur 2 cas.
  ⚠️ **Le survivant** (mutation 3, garde neuve déplacée AVANT `_MASQUE_INTERDIT`)
  ne tuait **0 test** : aucune assertion n'épinglait le **motif** de refus pour
  les modes que le masque doit intercepter en premier, seulement `actif()`.
  Renforcé (+8 cas sur `"permissif" in motif and "lecture propriétaire" not in
  motif`), le mutant meurt 7/7. C'est le motif exact de la mémoire projet :
  muter la garde, pas ce qu'elle appelle.
  Mutation 5 (`getattr` → accès direct) **fait planter la suite entière** —
  confirme par exécution le 500 nominal que le GATE avait identifié sur plan.
  ⚠️ **Angle mort trouvé** : `tools/lancer_suite_control_center_non_root.sh`
  clone `control-center/` et 3 chemins déclarés, **jamais `.gitlab/` ni
  `.github/`**. Le test neuf `test_ci_decouverte.py` se saute donc TOUJOURS en
  non-root (0 cas, skip propre) — sa garde ne s'exerce que dans les vraies CI.
  À porter dans `PIEGES` §1 ou §32.
- [2026-09-20 21:09] Étape 8 — code-reviewer — **REQUEST CHANGES**, 5 points bloquants,
  aucun défaut de sécurité (conditions GATE recoupées par exécution).
- [2026-09-20 21:09] Étape 5bis — agent principal — **3 points bloquants corrigés**,
  chacun revérifié par exécution :
  1. **Plancher Python faux.** La matrice déclarait `3.9` ; `config.py` et
     `installer.py` importent `tomllib`, entré en **3.11**, et `installer.py`
     le dit déjà en clair. Le job serait parti **ROUGE** dans le lot dont le
     critère non substituable est « la CI est verte ». Corrigé en
     `["3.11", "3.13"]`, et le commentaire réécrit d'un bloc : il annonçait
     encore 3.9 et se prétendait « seule source » de la borne alors
     qu'`installer.py` en est une seconde, exécutable (PIEGES §21).
  2. **Le `chmod -R o+rX` du script non-root retiré.** Le `chown` suffit —
     mesuré : 24 fichiers, 1883 cas, 0 échec sans lui. Il rendait lisible par
     tous une copie de `control-center.toml` (non versionné, porteur du chemin
     du jeton) et de `var/`.
  3. Voir `bug-019` pour le troisième.
  Suite revérifiée après correctifs : **24 fichiers, 1887 cas, 0 échec en
  root**, **1883 en non-root**.
  Restent à traiter par `doc-writer` : ADR-0035, `CHANGELOG`, entrée `PIEGES`,
  comptes du `README` (jeton 62, bug012 66, total 1887/24), et le résidu
  `st_uid` qui n'est écrit **nulle part** ailleurs que dans une spec en partance
  pour `done/`.
- [2026-09-21 05:19] Point bloquant 5 levé — agent principal — le résidu `st_uid` a
  désormais sa spec : `specs/features/todo/bug-020-un-jeton-appartenant-a-
  autrui-reste-lisible-par-root.md`, format feature complet pour déclencher le
  GATE. Il n'existait jusque-là que dans CETTE spec, en partance pour `done/`
  — relevé par `code-reviewer`. La spec laisse les trois branches ouvertes
  (refuser / avertir / déclarer hors garde) et nomme le risque propre à ce
  cycle-là : le danger n'est pas d'ouvrir une porte mais d'en **fermer une qui
  servait** — un serveur en root dans un conteneur, avec un jeton appartenant
  au développeur, est un déploiement légitime que la branche « refuser »
  casserait. 46 specs, aucun doublon.
- [2026-09-21 05:23] Étape 9 — doc-writer — **`docs/adr/0035-ce-qu-une-suite-verte-prouve-
  identite-et-intervalle-de-versions.md` créé** (4 critères sur 4), portant les
  deux arbitrages et l'absorption de `bug-019` sous `ADR-0017`, avec la
  **rectification** de la citation fautive d'`ADR-0007`. `PIEGES` : **§47**
  (mesurer en root ne mesure pas la CI), **§48** (`while … done < fichier`
  partage son `stdin`), **§49** (les deux listes Python du README de l'image
  runner), plus un complément à §1 sur `.gitlab/`/`.github/` hors clone.
  `README` : comptes corrigés (jeton **62**, bug012 **66**, config **61**,
  accordéon **236**, `test_ci_decouverte` **4** ajouté, total **1887 / 24**).
  `CHANGELOG` sous 0.12.1. Vérifié par l'agent principal : **173 liens** tous
  résolus, 46 specs sans doublon.
- [2026-09-21 05:23] Clôture locale — agent principal — cases mises à jour. **Toute case
  encore vide porte sa raison écrite** : 8 « non applicable » (domaines, agents),
  et 3 annotées — la CI verte (exige un push), son doublon dans les critères,
  et **« lint propre », déclaré SANS OBJET** : aucun linter n'est configuré ni
  installé dans ce dépôt et aucun job de lint n'existe dans les deux CI ;
  `compileall` passe, ce qui couvre la syntaxe et rien de plus. Le critère vient
  du template, il n'a pas de référent ici — le dire vaut mieux que cocher sur
  du vide.
  ⚠️ **Le cycle NE PART PAS en `done/`** : son critère non substituable est la
  CI verte, et elle exige un commit et un push que seul l'humain autorise.
