# ADR-0035 — Ce qu'une suite verte prouve : sous quelle identité, contre quel intervalle de versions

## Statut

Accepté

## Date

2026-09-20

## Contexte

Le dépôt a cru tenir « suite verte, zéro régression » pendant **7 runs de CI
consécutifs en échec** (`49fdc8f` du 2026-09-14 à `d1838ed` du 2026-09-19,
dernier vert `665720d`), parce que la suite du centre de contrôle était
lancée en **root** sur le poste de développement, et que root lit un fichier
que son mode interdit à tout autre utilisateur. Trois lots ont été livrés
dans cet intervalle sans que personne ne le voie — le job en échec,
« Suite de tests (control-center/) », était le seul rouge parmi les cinq du
workflow.

Deux défauts distincts causaient ce rouge :

- **Défaut A** — `test_jeton.py` déclarait actif un jeton dont le mode ne
  posait aucun bit groupe ni autre, y compris quand aucun bit de lecture
  propriétaire n'était posé (`0200`, `0300`, `0100`). En root, `open()`
  franchit les permissions du fichier et le test passe ; pour tout autre
  utilisateur, `open()` échoue et le même test échoue.
- **Défaut B** — `_locale("::ffff:127.0.0.1")` rendait `True` sur le poste
  (Python 3.13.5) et `False` en CI. La CI exécute le Python **système**
  d'`ubuntu-24.04`, faute de `setup-python` dans le workflow — aucune version
  n'y est épinglée.

Un désaccord d'environnement à cet endroit n'est pas cosmétique : `_locale()`
gouverne la décision « cette requête doit-elle présenter un jeton ? »
(ADR-0020). Une garde d'authentification dont le verdict dépend de la machine
qui l'exécute n'est pas une garde connue.

Un troisième défaut, découvert pendant l'arbitrage et absorbé dans le même
cycle au titre d'[ADR-0017](0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md)
(`bug-019`) : `.gitlab/ci/hygiene.yml` **énumérait** les fichiers de test à la
main plutôt que de les **découvrir**, et lançait 6 fichiers sur 23 — dont les
deux mêmes suites d'authentification qui échouaient côté GitHub en étaient
absentes. Sur le même commit, « la CI est rouge » et « la CI est verte »
étaient toutes deux vraies, selon la forge regardée. Corriger GitHub sans
corriger GitLab aurait laissé une forge continuer de mentir.

## Décision

### 1. Un jeton sans bit de lecture propriétaire est refusé pour tout le monde

`jeton.py` ajoute `_MASQUE_LECTURE_PROPRIETAIRE = 0o400`, vérifié **après**
`_MASQUE_INTERDIT = 0o077` (qui reste inchangé — `0640` continue d'être
refusé par lui, jamais par la garde neuve). Un fichier dont le bit `0o400`
n'est pas posé est refusé avec un motif nommé et **textuellement distinct**
de « absent ou illisible ».

C'est un **changement de comportement du produit** : un jeton en `0200`
fonctionnait auparavant sous un serveur lancé en root. Jugé **sens
fermant** par le GATE P1 : rien de ce qui était refusé ne devient accepté.
Le seul cas perdu — serveur en root, jeton en `0200`/`0300`/`0100`/`0000` —
bascule de « pilotage ouvert » à « pilotage fermé avec un motif nommé »,
réparable par une seule commande (`chmod 600`).

**La garde se décide sur le bit de mode (`info.st_mode & 0o400`), jamais sur
`os.access()`.** Mesuré en root : `os.access(f, os.R_OK)` rend `True` aussi
bien sur `0200` que sur `0000` — une garde écrite contre le résultat d'un
appel de vérification d'accès aurait reproduit exactement le défaut qu'elle
prétend fermer, puisque cet appel suit lui aussi les franchissements de
permission accordés à root. Seul le bit lui-même est une donnée que
l'identité de l'exécutant ne change pas.

**Résidu assumé, nommé, non traité ici** : un fichier `0600` appartenant à
un autre utilisateur reste lisible par root et refusé pour tout autre
compte — la dépendance à l'identité subsiste sur l'axe `st_uid`. Une garde de
propriété casserait un déploiement légitime (serveur en root dans un
conteneur, fichier détenu par le développeur) et mérite son propre GATE P1.
Une spec dédiée est écrite en parallèle de ce cycle ; s'y référer plutôt que
de dupliquer sa description ici.

### 2. L'intervalle de versions Python est déclaré et vérifié, jamais épinglé

`.github/workflows/hygiene-specs.yml` garde son job système **non épinglé**
(`ubuntu-latest`, sans `setup-python`) intact, et lui ajoute un job en
**matrice** sur les deux bornes d'un intervalle déclaré une seule fois
(`python-version: ["3.11", "3.13"]`) via `actions/setup-python@v5`. Trois
exécutions au total : plancher, plafond, vigie non épinglée.

Épingler une version unique aurait **masqué ce bug même** : c'est précisément
le job système non épinglé qui a rendu le défaut B visible — un
`setup-python` posé en amont aurait rendu la CI verte et laissé le produit
faux chez tout consommateur exécutant encore 3.12.3. Le kit est distribué à
des projets dont l'environnement n'est pas contrôlé ; épingler ne fixerait
que la CI du kit lui-même, pas la version que ces projets exécutent
réellement.

**Plancher fixé à 3.11**, mesuré et non supposé : `control-center/backend/`
importe `tomllib`, entré dans la bibliothèque standard à cette version, et
`installer.py` le déclarait déjà en clair avant ce cycle. Une première
rédaction du plan proposait 3.9 ; corrigé pendant la revue de code avant que
le job ne parte rouge dans le lot dont le critère non substituable est
« la CI est verte ». **Plafond 3.13**, dernière version disponible sur ce
cycle. La vigie non épinglée est **conservée à côté de la matrice**, pas
remplacée par elle : elle seule reproduit le cas historique (3.12.3).

## Alternatives considérées

### Défaut A

- **Corriger seulement le test** (retirer `0200`/`0300`/`0100` de la liste
  des modes actifs). Écartée : rend la suite verte dans les deux identités en
  cessant de mesurer ce qui est cassé — le produit resterait dépendant de
  l'identité de l'exécutant, un serveur en root continuant d'accepter un
  jeton qu'un serveur lancé normalement refuserait.
- **Garde sur `os.access()`**. Écartée et mesurée dangereuse : rend `True` en
  root sur `0200` et sur `0000`, reconduisant exactement le défaut qu'elle
  prétend fermer.

### Défaut C (intervalle de versions)

- **Épingler une version fixe de Python en CI**. Écartée : aurait masqué
  `bug-018` au lieu de le révéler, et ne dit rien de l'environnement des
  projets consommateurs du kit, dont on ne contrôle pas la distribution.

## Conséquences

### Positives

- « Suite verte » redevient une propriété du **code**, mesurée sous les deux
  identités (root et non-root) avec le même verdict — 1887 cas / 24 fichiers
  en root, mêmes cas 0 échec sous `nobody` via
  `tools/lancer_suite_control_center_non_root.sh` (angle mort connu : ce
  script clone `control-center/` et trois chemins déclarés, jamais
  `.gitlab/` ni `.github/`, donc `test_ci_decouverte.py` s'y saute toujours —
  4 cas d'écart entre les deux mesures, pas un échec).
- Le défaut B est corrigé de façon **indépendante de la version** : `_locale()`
  extrait `ipv4_mapped` elle-même et repose la question à `is_loopback`, sans
  jamais reconnaître un préfixe de chaîne. `::ffff:192.168.1.55` (mappée
  **non** locale) reste non locale — la reconnaissance par préfixe aurait
  ouvert l'écriture sans jeton au réseau, l'inverse exact de ce que `bug-012`
  avait corrigé.
- Les deux forges (GitHub, GitLab) mesurent enfin la même chose : GitLab
  découvre désormais ses fichiers de test au lieu de les énumérer à la main,
  et échoue explicitement si la découverte ne rend aucun fichier.

### Négatives

- Le job de matrice ajoute deux exécutions de plus au workflow GitHub, et une
  dépendance nouvelle (`actions/setup-python`) — acceptable au regard de la
  règle « pas de nouvelle dépendance sans justification » : même fournisseur
  que `actions/checkout@v4` déjà utilisé, aucune dépendance **du produit**
  n'est ajoutée (ADR-0006 tenu, bibliothèque standard uniquement).
- Un jeton `0200`/`0300`/`0100`/`0000` cesse de fonctionner sous un serveur
  lancé en root — population vraisemblablement nulle, mais c'est un
  changement de comportement réel, pas seulement un test corrigé.
- Le résidu `st_uid` reste ouvert : root lisant un fichier `0600` appartenant
  à un autre utilisateur demeure une dépendance à l'identité non fermée par
  ce cycle.

### Ce que ça verrouille

- **Critère 1 (contrainte structurante)** : tout cycle futur du module écrit
  son code contre le **plancher déclaré** (3.11), pas contre la version du
  poste ; toute promesse « suite verte » doit nommer l'**identité** et la
  **version** sous lesquelles elle a été obtenue — la contrainte descend
  aussi dans les projets consommateurs du kit.
- **Critère 2 (décision invisible dans le code)** : une fois
  `permissions & 0o400` écrit, rien ne dit pourquoi un jeton en `0200` est
  refusé plutôt que tenté ; une fois la matrice verte, rien ne dit pourquoi le
  job système n'a pas été épinglé — le premier lecteur pressé l'épinglerait
  « pour stabiliser la CI » sans connaître ce que ça masquerait.
- **Critère 3 (alternatives crédibles)** : « corriger le test » et « épingler
  la version » sont l'une et l'autre des réponses défendables, moins
  coûteuses, et fausses pour des raisons qui ne se devinent pas sans avoir
  mesuré le défaut jusqu'au bout.
- **Critère 4 (verrouillage long terme)** : l'intervalle Python déclaré est
  une promesse faite aux projets consommateurs du kit — on l'élargit sans
  douleur, on ne le rétrécit jamais sans casser quelqu'un. Relever le
  plancher est désormais un changement déclaré, jamais l'effet de bord d'une
  ligne de code.

## Leçon de méthode

Le vrai sujet de cet ADR n'est ni le bit de mode ni l'intervalle de version :
c'est qu'**une preuve d'exécution n'est une preuve que pour l'environnement
où elle a été produite**. Le docstring de `_locale()` portait la mention
« vérifié par exécution : `::ffff:127.0.0.1` → True » — cette vérification
avait bien eu lieu, réellement, mais seulement sur le poste de développement.
Il porte désormais « SUR PYTHON 3.13.5 SEULEMENT », et cite le correctif
CPython en cause plutôt que d'affirmer une propriété générale.

**Cause du défaut B, établie par mesure et non supposée** : le correctif
CPython **gh-117566** (PR gh-117567 sur `main` le 2024-04-25, rétroportage
gh-118391 sur la branche 3.12 le 2024-04-29) fait que `IPv6Address.is_loopback`
délègue à `ipv4_mapped.is_loopback` à partir de 3.12.4 et sur toute la série
3.13, mais pas en 3.12.3 — la version système d'`ubuntu-24.04`, exécutée par
la CI faute de `setup-python`. Le correctif du dépôt extrait `ipv4_mapped`
lui-même et repose la question à `is_loopback`, ce qui le rend indépendant de
la version installée. Le piège rencontré au passage : le README de l'image
runner GitHub porte deux listes Python — le logiciel système, et un cache
d'outils inactif tant que `setup-python` n'est pas invoqué — les confondre
mène à la mauvaise version et inverse le diagnostic.

## Rectification

Plusieurs documents produits pendant ce cycle (dont le plan de l'architecte
et le journal de la spec) citaient **ADR-0007** pour justifier la règle
« un jeton lisible par le groupe ou par les autres est refusé ». C'est
**faux** : [ADR-0007](0007-config-projet-ne-voyage-pas-avec-kit.md) traite de
la configuration et du journal du projet qui ne voyagent pas avec le kit
(`control-center.toml`, `var/`), pas des modes de fichier du jeton. La règle
groupe/autres vient du **GATE P1 de `feature-007`** (le cycle qui a introduit
`jeton.py`). Cette entrée d'ADR ne se corrige pas : la citation fautive était
déjà écrite ailleurs (journal de `bug-018`, plan de l'architecte) et cet ADR
en garde la trace correcte pour tout lecteur futur.

## Références

- Fichiers : `control-center/backend/jeton.py` (`_MASQUE_LECTURE_PROPRIETAIRE`),
  `control-center/backend/server.py` (`_locale`, l. ~270-306),
  `control-center/backend/test_jeton.py`, `control-center/backend/test_server_bug012.py`,
  `.github/workflows/hygiene-specs.yml` (job « Suite de tests (control-center/) »,
  matrice `python-version`), `.gitlab/ci/hygiene.yml`.
- Spec : `specs/features/doing/bug-018-la-suite-est-verte-en-root-et-rouge-en-ci.md`
  (mesures, plan de l'architecte, GATE P1 et P2) et
  `specs/features/doing/bug-019-gitlab-ne-lance-que-six-tests-sur-vingt-trois.md`
  (absorbée dans ce cycle au titre d'ADR-0017).
- ADR liés : [ADR-0017](0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md)
  (motif de l'absorption de `bug-019` dans ce cycle), [ADR-0020](0020-un-centre-de-controle-appartient-a-un-developpeur.md)
  (décision de localité gouvernée par `_locale()`), [ADR-0007](0007-config-projet-ne-voyage-pas-avec-kit.md)
  (référence corrigée ci-dessus, sans lien avec la règle de mode du jeton).
- Pièges du module : `control-center/PIEGES.md` (entrées ajoutées par ce cycle
  sur la mesure en root, le partage de `stdin` dans une boucle `while … done`,
  et les deux listes Python du runner GitHub).
