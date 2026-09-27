#!/usr/bin/env python3
"""Garde du partitionnement des harnais navigateur dans la CI GitHub (bug-022).

    python3 control-center/backend/test_ci_partition_navigateur.py

## Pourquoi ce test existe

`bug-018` a fait passer la suite de `control-center/` de 1 à 3 exécutions
indépendantes par run (1 job système + 2 legs de matrice Python). Deux jobs
sur trois ont ensuite expiré sur le même commit (`test_app_diagramme_
navigateur.py:201`, `subprocess.TimeoutExpired` après 30 s), sans qu'aucune
ligne de code n'ait changé entre le run rouge et le run vert suivant. Établi
par le `debugger` puis confirmé par mesure locale : la cause n'est PAS une
contention entre les trois jobs (VM et régions Azure distinctes, marge
mesurée de 6,5× même bridé à 2 vCPU) mais l'EXPOSITION — 3 occasions
indépendantes de croiser une VM lente au lieu d'1 (RECTIFICATION de la spec
`bug-022`).

Le correctif retenu (les deux mécanismes convergent dessus) : un harnais
navigateur se DÉCLARE par un marqueur de module (`HARNAIS_NAVIGATEUR = True`), le job `centre-de-controle-matrice` (`.github/workflows/
hygiene-specs.yml`) l'EXCLUT, le job `centre-de-controle` (système) ne
l'exclut PAS — soit une seule exécution par harnais navigateur, au lieu de
trois. C'est une ASYMÉTRIE délibérée entre deux jobs dont le script était
jusqu'ici dupliqué à l'identique : exactement le genre de divergence
silencieuse qui se reforme dans un coin qu'aucun test ne regarde. Ce fichier
la garde.

## Trois ensembles, trois provenances, comparés

1. `declares`  — fichiers portant l'affectation de MODULE `HARNAIS_NAVIGATEUR
   = True`, lue par AST.
2. `detectes`  — fichiers qui LANCENT un navigateur, lus par AST eux aussi
   (une constante de chaîne commençant par `--headless`, ou une fonction
   `trouver_navigateur` définie n'importe où dans le module) : c'est
   l'ORACLE, indépendant du marqueur, qui attraperait un harnais neuf qu'on
   aurait oublié de marquer.
3. `grep_set`  — fichiers que le MOTIF DE FILTRAGE, extrait tel quel du YAML
   du job `centre-de-controle-matrice`, sélectionne quand on l'applique aux
   mêmes fichiers.

Les trois doivent coïncider EXACTEMENT. PIEGES §26 : la lecture des deux
premiers ensembles se fait par AST, JAMAIS par `grep` — un `grep` compterait
aussi une mention du marqueur ou de `--headless` dans un commentaire ou une
docstring, qui ne déclare ni ne lance rien.

## Ce que ce fichier ne fait PAS

Il ne réécrit ni la liste des fichiers, ni le motif de filtrage : les deux
sont lus depuis les artefacts (le code des trois harnais, le YAML du
workflow) à chaque exécution — PIEGES §21, aucune énumération à la main.

Saute proprement (0 cas, code 0) si `.github/workflows/hygiene-specs.yml`
est absent : chemin CONDITIONNEL comme `.gitlab/ci/hygiene.yml` pour
`test_ci_decouverte.py`, et absent par construction du clone produit par
`tools/lancer_suite_control_center_non_root.sh` (PIEGES §1, qui ne copie
JAMAIS `.github/`). ⚠️ Conséquence à DÉCLARER, pas une régression : le compte
de cas obtenu en non-root pour CE fichier est inférieur de tout son lot au
compte obtenu en root — l'écart normal de PIEGES §32/§47, pas un défaut.
"""

import ast
import os
import re
import shutil
import subprocess
import sys
import tempfile

_ICI = os.path.dirname(os.path.abspath(__file__))
_CONTROL_CENTER = os.path.dirname(_ICI)  # backend/ -> control-center/
_RACINE_DEPOT = os.path.dirname(_CONTROL_CENTER)  # control-center/ -> racine du dépôt (ou du clone)
_CHEMIN_WORKFLOW = os.path.join(_RACINE_DEPOT, ".github", "workflows", "hygiene-specs.yml")

_JOB_MATRICE = "centre-de-controle-matrice"
_JOB_SYSTEME = "centre-de-controle"

# Utilisé UNIQUEMENT pour les messages d'échec ci-dessous -- jamais pour la
# comparaison réelle, qui lit toujours le motif depuis le YAML lui-même
# (`_extraire_motif_filtre`, PIEGES §21). Une seule occurrence en code (donc
# sur une seule ligne physique, insensible à tout reflow de prose) plutôt
# qu'un littéral retapé dans chaque message.
_MARQUEUR_LITTERAL = "HARNAIS_NAVIGATEUR = True"

# Ligne de découverte EXACTE attendue, IDENTIQUE dans les deux jobs (§ ci-
# dessous, test_ligne_decouverte_identique_dans_les_deux_jobs). Toute
# variante ici (un filtre injecté via `xargs`/`grep -L` par exemple) ferait
# tomber les harnais navigateur à ZÉRO exécution dans LES TROIS JOBS À LA
# FOIS, silencieusement -- bug-022, mutant A3 relevé en revue.
_RE_LIGNE_DECOUVERTE = re.compile(
    r"^\s*mapfile -t fichiers < <\(find control-center -type f "
    r"-name 'test_\*\.py' \| sort\)\s*$",
    re.MULTILINE)

_echecs = []
_tests = 0


def check(nom, condition, detail=""):
    global _tests
    _tests += 1
    if condition:
        print("  ok     %s" % nom)
    else:
        _echecs.append(nom)
        print("  ECHEC  %s%s" % (nom, (" : " + detail) if detail else ""))


def _decouvrir_fichiers_test():
    """DÉCOUVERTE par parcours de `control-center/`, jamais une liste tenue à
    la main (PIEGES §21) — le même invariant que le `find` des deux jobs."""
    fichiers = []
    for racine, _dirs, noms in os.walk(_CONTROL_CENTER):
        for nom in noms:
            if nom.startswith("test_") and nom.endswith(".py"):
                fichiers.append(os.path.join(racine, nom))
    return sorted(fichiers)


def _corps_module(chemin):
    try:
        with open(chemin, "r", encoding="utf-8") as f:
            return ast.parse(f.read(), filename=chemin)
    except (SyntaxError, UnicodeDecodeError, OSError):
        return None


def _porte_marqueur(arbre):
    """Affectation de MODULE `HARNAIS_NAVIGATEUR = True` -- au niveau
    supérieur seulement (`arbre.body`, pas `ast.walk`) : une affectation
    imbriquée dans une fonction, une classe, ou une chaîne de docstring ne
    déclare rien au sens où le workflow le lit."""
    if arbre is None:
        return False
    for noeud in arbre.body:
        if isinstance(noeud, ast.Assign):
            noms_cibles = [c.id for c in noeud.targets if isinstance(c, ast.Name)]
            if "HARNAIS_NAVIGATEUR" in noms_cibles:
                valeur = noeud.value
                if isinstance(valeur, ast.Constant) and valeur.value is True:
                    return True
    return False


def _lance_navigateur(arbre):
    """Oracle INDÉPENDANT du marqueur (retenu comme garde et non comme règle
    par la note d'implémentation, §1.1) : une constante de chaîne qui
    commence par `--headless`, ou une fonction `trouver_navigateur` -- vus
    n'importe où dans le module, par AST."""
    if arbre is None:
        return False
    for noeud in ast.walk(arbre):
        if isinstance(noeud, ast.Constant) and isinstance(noeud.value, str):
            if noeud.value.startswith("--headless"):
                return True
        if isinstance(noeud, ast.FunctionDef) and noeud.name == "trouver_navigateur":
            return True
    return False


def _corps_lancer_navigateur(arbre):
    """Empreinte structurelle (`ast.dump`, sans numéros de ligne ni
    colonnes -- `include_attributes` vaut `False` par défaut) du corps de la
    fonction de MODULE `_lancer_navigateur`, ou `None` si le fichier n'en
    définit aucune. `ast.dump` ignore la position : un simple décalage
    ailleurs dans le fichier (une ligne de commentaire ajoutée, par exemple)
    ne fait donc PAS diverger l'empreinte -- seul un changement RÉEL du
    corps (un seuil différent, un message d'avertissement changé, une
    reprise qui devient une boucle) le fait."""
    if arbre is None:
        return None
    for noeud in arbre.body:
        if isinstance(noeud, ast.FunctionDef) and noeud.name == "_lancer_navigateur":
            return ast.dump(noeud)
    return None


def _valeur_delai_chromium(arbre):
    """Valeur de la constante de MODULE `_DELAI_CHROMIUM_S`, ou `None` si le
    fichier n'en définit aucune.

    ⚠️ Cette garde-ci existe parce que l'empreinte AST ci-dessus a CESSÉ de
    couvrir le seuil. Tant que `timeout=30` était écrit DANS le corps de
    `_lancer_navigateur`, `ast.dump` du corps portait la valeur : deux copies
    aux seuils différents rendaient deux empreintes. Depuis que le seuil est
    sorti en constante de module (bug-022 rouvert le 2026-09-27),
    `timeout=_DELAI_CHROMIUM_S` est le MÊME nœud AST quelle que soit la
    valeur — l'empreinte reste identique alors que les harnais n'attendent
    plus la même chose. Sortir une valeur d'une fonction déplace donc aussi
    ce qui la gardait, en silence : c'est ce trou-là que ces deux checks
    referment (ADR-0044)."""
    if arbre is None:
        return None
    for noeud in arbre.body:
        if not isinstance(noeud, ast.Assign):
            continue
        for cible in noeud.targets:
            if isinstance(cible, ast.Name) and cible.id == "_DELAI_CHROMIUM_S":
                if isinstance(noeud.value, ast.Constant):
                    return noeud.value.value
    return None


def _extraire_job(texte_yaml, nom_job):
    """Rend le texte du job `nom_job:` -- de sa ligne de déclaration
    (indentée de DEUX espaces sous `jobs:`) jusqu'à la prochaine clé au même
    niveau d'indentation. Extraction PAR INDENTATION, comme
    `test_ci_decouverte.py` sur `.gitlab/ci/hygiene.yml` -- jamais un compte
    de lignes fixe, qui périmerait au premier commentaire ajouté.

    Les lignes de COMMENTAIRE (YAML `#` en tête de ligne, ou commentaire bash
    dans un bloc `run: |`, même convention) sont retirées du texte rendu
    (bug-022, mutation 6a) : un commentaire qui CITE une ligne de code
    protégée par une garde (ex. `# PIEGES §48 : python3 "$fichier" <
    /dev/null isole...`) contient littéralement le motif recherché par les
    checks ci-dessous, et le ferait matcher même quand le VRAI code a
    divergé -- variante de PIEGES §26 (`grep -c` compte les commentaires),
    ici sur une recherche par bloc de texte entier plutôt qu'un comptage.
    Toutes les regex de ce fichier qui inspectent le texte d'un job partent
    donc d'un texte déjà nettoyé de ses commentaires : une seule source pour
    toute la famille de checks, pas un correctif ponctuel sur un seul test.
    Aucune ligne de ce fichier ne comporte de commentaire EN FIN de ligne de
    code (vérifié : les seules occurrences de `#` hors début de ligne dans
    `hygiene-specs.yml` sont des expansions bash `${#tableau[@]}`, jamais un
    commentaire) -- retirer la ligne entière est donc correct ici, pas une
    approximation qui tronquerait du code réel."""
    lignes = texte_yaml.splitlines()
    motif_cle_job = re.compile(r"^  [A-Za-z0-9_-]+:")
    debut = None
    entete = "  %s:" % nom_job
    for i, ligne in enumerate(lignes):
        if ligne == entete or ligne.startswith(entete):
            debut = i
            break
    assert debut is not None, "job %r introuvable dans %s" % (nom_job, _CHEMIN_WORKFLOW)
    fin = len(lignes)
    for i in range(debut + 1, len(lignes)):
        if motif_cle_job.match(lignes[i]):
            fin = i
            break
    lignes_job = lignes[debut:fin]
    lignes_sans_commentaires = [l for l in lignes_job if not l.lstrip().startswith("#")]
    return "\n".join(lignes_sans_commentaires)


def _extraire_bloc_run(texte_yaml, nom_job):
    """Isole le corps du bloc `run: |` de l'UNIQUE step de test de `nom_job`,
    tel qu'il apparaît RÉELLEMENT dans le YAML -- SUR LE TEXTE BRUT, sans le
    nettoyage des commentaires qu'applique `_extraire_job` : ce texte va être
    EXÉCUTÉ (`_fichiers_reellement_lances` ci-dessous), pas lu par regex, et
    un commentaire bash est inerte à l'exécution -- aucune raison de le
    tronquer ici. Bornage du job PAR INDENTATION, même méthode que
    `_extraire_job`."""
    lignes = texte_yaml.splitlines()
    motif_cle_job = re.compile(r"^  [A-Za-z0-9_-]+:")
    entete = "  %s:" % nom_job
    debut = next((i for i, l in enumerate(lignes) if l == entete or l.startswith(entete)), None)
    assert debut is not None, "job %r introuvable dans %s" % (nom_job, _CHEMIN_WORKFLOW)
    fin = next((i for i in range(debut + 1, len(lignes)) if motif_cle_job.match(lignes[i])),
               len(lignes))
    bloc = lignes[debut:fin]
    i_run = next(i for i, l in enumerate(bloc) if l.strip() == "run: |")
    corps = []
    for l in bloc[i_run + 1:]:
        if l.strip() and not l.startswith(" " * 10):
            break
        corps.append(l[10:])
    return "\n".join(corps)


# bug-022, revues 3-5 : CINQ témoins, pas deux -- ils CROISENT TROIS
# DIMENSIONS, chacune une syntaxe d'exclusion PLAUSIBLE côté CI (une
# alternative que la CONCEPTION a réellement pesée -- §1.1 de la note
# d'architecte -- ou qu'une revue a démontré praticable), et qui doit varier
# SEULE au moins une fois pour que l'oracle ne puisse pas la confondre avec
# une autre :
#   1. MARQUEUR (`HARNAIS_NAVIGATEUR = True` ou pas) -- ce que la CI est
#      CENSÉE lire. Seule dimension qui devrait compter.
#   2. NOM DE FICHIER (contient "navigateur" ou pas) -- §1.1 l'écarte comme
#      RÈGLE de partitionnement (`*_navigateur.py` n'attrape que 2 des 3
#      harnais réels), mais ça n'empêche pas un filtre CI de s'en servir
#      quand même. REVENUE par cette porte : mutant H
#      (`if [[ "$fichier" == *navigateur* ]]`), 46/46 vert avec la version à
#      DEUX témoins (`test_marque.py`/`test_ordinaire.py`, où le seul
#      fichier marqué portait AUSSI "marque" dans son nom -- dimensions
#      confondues). TUÉ dès les 4 témoins qui séparent marqueur et nom.
#   3. CONTENU AUTRE QUE LE MARQUEUR (mentionne "chromium" ou pas) -- §1.1
#      l'écarte EXPLICITEMENT comme RÈGLE et la retient comme ORACLE AST
#      (`_lance_navigateur` ci-dessus) : c'est l'alternative la plus
#      naturelle pour quiconque voudrait filtrer les harnais navigateur SANS
#      connaître le marqueur (`grep -q chromium`). REVENUE par cette porte :
#      mutant I, inventé en revue, ÉCHAPPAIT ENCORE À L'ORACLE À 4 TÉMOINS
#      (aucun des 4 ne contenait "chromium", marqué ou pas -- rien ne
#      pouvait distinguer un filtre par marqueur d'un filtre par contenu).
# Le 5e témoin, `test_ordinaire_avec_chromium.py`, NON marqué mais
# mentionnant "chromium", croise la dimension 3 dans le sens qui manquait ;
# les 4 premiers couvrent déjà l'autre sens (aucun témoin MARQUÉ ne mentionne
# "chromium" -- vérifié ci-dessous par construction, pas supposé).
_TEMOINS = {
    # nom                                : (porte le marqueur, contenu additionnel)
    "test_marque_navigateur.py":         (True,  ""),
    "test_marque_autre.py":              (True,  ""),
    "test_ordinaire_navigateur.py":      (False, ""),
    "test_ordinaire_autre.py":           (False, ""),
    "test_ordinaire_avec_chromium.py":   (False, '# mentionne "chromium" sans '
                                          "lancer de navigateur -- croise la "
                                          "dimension CONTENU (mutant I)\n"),
}
assert not any(marque and "chromium" in contenu for marque, contenu in _TEMOINS.values()), (
    "aucun témoin MARQUÉ ne doit mentionner 'chromium' -- sinon la dimension "
    "3 ne serait plus croisée dans les deux sens")


def _fichiers_reellement_lances(texte_yaml, nom_job):
    """ORACLE COMPORTEMENTAL (bug-022, revues 3 à 5 -- remplace
    l'énumération de syntaxes d'exclusion par une MESURE) : EXÉCUTE le
    `run:` réel du job (`bash -c`, `cwd` = arborescence temporaire) sur les
    CINQ témoins `_TEMOINS` (voir le commentaire ci-dessus pour ce que
    chacun croise), déposés sous `control-center/web/` -- chacun se
    contentant d'imprimer `LANCE <nom sans .py>` puis de sortir en 0 -- et
    rend l'ensemble TRIÉ des fichiers RÉELLEMENT lancés, lu depuis cette
    sortie. Déterministe, sans réseau, sans navigateur, instantané (cinq
    lancements `python3` sur un script d'une ou deux lignes). `timeout=15`
    par précaution (un job mal formé pourrait boucler) -- très au-dessus du
    temps réel mesuré (< 1 s).

    ⚠️ COUVERTURE DÉCLARÉE, PAS SUPPOSÉE -- LA PHRASE LA PLUS IMPORTANTE DE
    CE FICHIER : ces témoins croisent EXACTEMENT trois dimensions (marqueur,
    nom, contenu-autre-que-le-marqueur). Chacune est apparue en revue, sur ce
    même cycle, comme une syntaxe d'exclusion qui échappait RÉELLEMENT à la
    version précédente de cet oracle (H puis I) -- ce ne sont pas des cas
    limites choisis par prudence abstraite, ce sont des mutants mesurés qui
    sont morts pour de vrai. Une exclusion basée sur une QUATRIÈME dimension
    -- la TAILLE du fichier, son RÉPERTOIRE, sa date de modification, ou
    toute autre propriété qu'aucun témoin ici ne fait varier -- n'est PAS
    nécessairement détectée : rien ici ne le garantit. Ce que cet oracle
    PROUVE : le marqueur, le nom et ce contenu-repère ne sont pas confondus.
    Ce qu'il NE PROUVE PAS : qu'aucune autre syntaxe d'exclusion imaginable
    n'existe. Si une revue future en démontre une, la réponse mesurée jusqu'ici
    est d'ajouter le témoin qui la croise -- pas de réécrire cette phrase pour
    qu'elle sonne plus rassurante qu'elle ne l'est."""
    bloc = _extraire_bloc_run(texte_yaml, nom_job)
    with tempfile.TemporaryDirectory() as t:
        os.makedirs(os.path.join(t, "control-center", "web"))
        for nom, (marque, contenu_additionnel) in _TEMOINS.items():
            with open(os.path.join(t, "control-center", "web", nom), "w",
                      encoding="utf-8") as f:
                entete = "HARNAIS_NAVIGATEUR = True\n" if marque else ""
                f.write('%s%sprint("LANCE %s")\n'
                        % (entete, contenu_additionnel, nom[:-len(".py")]))
        resultat = subprocess.run(["bash", "-c", bloc], cwd=t,
                                   capture_output=True, text=True, timeout=15)
    return sorted(set(re.findall(r"LANCE (\S+)", resultat.stdout)))


def _extraire_motif_filtre(job_matrice):
    """Le motif de filtrage n'est PAS recopié ici à la main : il est LU dans
    le job lui-même (`grep -qx '<motif>' "$fichier"`), pour que ce test
    reste une comparaison entre artefacts et non une réécriture de l'un
    d'eux (PIEGES §21)."""
    m = re.search(r"grep\s+-qx\s+'([^']+)'", job_matrice)
    return m.group(1) if m else None


def _porte_ligne_exacte(chemin, motif):
    """Réplique `grep -qx '<motif>'` : une ligne du fichier EST le motif,
    caractère pour caractère -- pas une sous-chaîne, pas une regex (le motif
    mesuré ne contient aucun métacaractère)."""
    try:
        with open(chemin, "r", encoding="utf-8", errors="replace") as f:
            for ligne in f:
                if ligne.rstrip("\n") == motif:
                    return True
    except OSError:
        return False
    return False


def _rel(ensemble):
    return sorted(os.path.relpath(f, _RACINE_DEPOT) for f in ensemble)


def _compter_legs_matrice(job_matrice):
    """Nombre de legs RÉELLEMENT déclarés par `strategy.matrix.python-version`
    dans le job matrice, LU dans le YAML -- jamais une constante `2` recopiée
    à la main (bug-022, mutation 5 : un troisième leg ajouté à la matrice
    faisait grimper l'exécution réelle à 1+3 sans qu'aucun des 40 cas ne le
    remarque, tant que ce nombre était codé en dur dans l'arithmétique
    ci-dessous). Motif volontairement étroit (une liste entre crochets sur
    UNE ligne, comme c'est le cas aujourd'hui) : si la déclaration change de
    forme, ce test doit échouer plutôt que deviner, PIEGES §21."""
    m = re.search(r"python-version:\s*\[([^\]]*)\]", job_matrice)
    if not m:
        return None
    entrees = [e.strip() for e in m.group(1).split(",") if e.strip()]
    return len(entrees)


def main():
    # `.github/` est un chemin CONDITIONNEL de ce clone : absent dans le
    # clone jetable non-root (PIEGES §1, `tools/lancer_suite_control_
    # center_non_root.sh` ne copie que `control-center/` + trois chemins
    # déclarés), présent dans le dépôt réel et en CI (checkout complet). Se
    # saute proprement -- même patron que `test_ci_decouverte.py` face à
    # `.gitlab/` absent.
    if not os.path.isfile(_CHEMIN_WORKFLOW):
        print("ℹ️  %s absent — rien à lancer (chemin conditionnel, ou clone "
              "partiel qui ne le copie pas — PIEGES §1)." % _CHEMIN_WORKFLOW)
        print("    Écart attendu : le compte de cas de CE fichier en non-root "
              "est inférieur à celui obtenu en root, pour tout son lot "
              "(PIEGES §32/§47) -- pas une régression.")
        print("\n0 cas, 0 echec(s)")
        return 0

    with open(_CHEMIN_WORKFLOW, "r", encoding="utf-8") as f:
        texte_workflow = f.read()

    job_matrice = _extraire_job(texte_workflow, _JOB_MATRICE)
    job_systeme = _extraire_job(texte_workflow, _JOB_SYSTEME)

    # Ce fichier lui-même est exclu de la comparaison à trois ensembles :
    # implémenter l'oracle `_lance_navigateur` exige d'y écrire le littéral
    # `"--headless"` (voir `_lance_navigateur` ci-dessus), donc ce module
    # SE DÉTECTERAIT LUI-MÊME comme lanceur de navigateur -- un faux positif
    # de sa propre lecture de son propre source, pas un fait sur ce que la
    # CI exécute. La CI, elle, ne fait JAMAIS ce scan par AST : les deux jobs
    # ne testent QUE la présence littérale de la ligne complète
    # `HARNAIS_NAVIGATEUR = True` (`grep -qx`, jamais un scan par AST), donc
    # ce fichier s'exécute normalement dans les deux -- ce qui est correct,
    # puisqu'il ne lance aucun navigateur. ⚠️ Cette phrase est volontairement
    # gardée SUR UNE SEULE LIGNE PHYSIQUE (voir `_MARQUEUR_LITTERAL`
    # ci-dessous) : un reflow qui la couperait entre `=` et `True` pourrait,
    # selon où tombe la coupe, produire une ligne bare qui ne matche
    # toujours pas `grep -qx` (elle resterait préfixée par `#`) -- mais
    # autant ne pas en dépendre.
    _CE_FICHIER = os.path.abspath(__file__)
    fichiers = [f for f in _decouvrir_fichiers_test() if os.path.abspath(f) != _CE_FICHIER]
    check("test_au_moins_un_fichier_test_decouvert", len(fichiers) > 0,
          "aucun test_*.py trouvé sous %s" % _CONTROL_CENTER)

    arbres = {f: _corps_module(f) for f in fichiers}
    declares = {f for f in fichiers if _porte_marqueur(arbres[f])}
    detectes = {f for f in fichiers if _lance_navigateur(arbres[f])}

    check("test_au_moins_un_harnais_navigateur_declare", len(declares) > 0,
          "aucun fichier ne porte %r -- le partitionnement bug-022 n'a "
          "peut-être pas survécu" % _MARQUEUR_LITTERAL)

    # --- synchronisation des copies de `_lancer_navigateur` -----------------
    # PAS une énumération des 3 fichiers actuels : la liste est DÉRIVÉE de
    # `declares` (fichiers marqués), pour survivre à `feature-021`
    # (suppression prévue de `test_app_theme_navigateur.py`) sans qu'aucune
    # ligne d'ici n'ait à bouger -- même principe que le choix du marqueur
    # plutôt que du nom de fichier (§1.1 de la note d'architecte). Duplication
    # assumée (PIEGES §22 : une correction s'arrête au premier endroit
    # signalé, jamais gardée) : un module partagé sous `web/` deviendrait
    # SERVABLE (PIEGES §8), et le loger sous `backend/` imposerait un
    # `sys.path.insert` à trois harnais pour six lignes, dont une meurt avec
    # `feature-021`. La duplication reste correcte tant qu'elle reste
    # IDENTIQUE -- ce que cette garde vérifie.
    corps_par_fichier = {f: _corps_lancer_navigateur(arbres[f]) for f in declares}
    manquants = sorted(f for f, corps in corps_par_fichier.items() if corps is None)
    check("test_tout_harnais_navigateur_declare_une_fonction_lancer_navigateur",
          len(manquants) == 0,
          "fichier(s) marqué(s) %r sans fonction `_lancer_navigateur` : %s "
          "-- ce harnais lance Chromium SANS la reprise sur "
          "`subprocess.TimeoutExpired` (bug-022)"
          % (_MARQUEUR_LITTERAL, _rel(manquants)))

    empreintes = {corps for corps in corps_par_fichier.values() if corps is not None}
    check("test_les_copies_de_lancer_navigateur_sont_synchronisees",
          len(empreintes) <= 1,
          "%d empreinte(s) AST distincte(s) pour `_lancer_navigateur` parmi "
          "%s -- les copies ont divergé (reprise UNIQUE sur "
          "`TimeoutExpired`, avertissement bruyant : toutes doivent "
          "rester identiques, PIEGES §22)" % (len(empreintes), _rel(declares)))

    # --- le SEUIL lui-même, que l'empreinte AST ne couvre plus -------------
    delai_par_fichier = {f: _valeur_delai_chromium(arbres[f]) for f in declares}
    sans_delai = sorted(f for f, v in delai_par_fichier.items() if not isinstance(v, int))
    check("test_tout_harnais_navigateur_declare_le_delai_chromium",
          len(sans_delai) == 0,
          "fichier(s) marqué(s) %r sans constante entière `_DELAI_CHROMIUM_S` "
          "de module : %s -- le seuil de `_lancer_navigateur` y est alors "
          "invérifiable (bug-022)" % (_MARQUEUR_LITTERAL, _rel(sans_delai)))

    delais = {v for v in delai_par_fichier.values() if isinstance(v, int)}
    check("test_le_delai_chromium_est_le_meme_partout", len(delais) <= 1,
          "%d valeur(s) distincte(s) de `_DELAI_CHROMIUM_S` parmi %s : %s -- "
          "les copies attendent des durées différentes, et l'empreinte AST de "
          "`_lancer_navigateur` ne le voit PAS (le nom est le même nœud quelle "
          "que soit la valeur)"
          % (len(delais), _rel(declares), sorted(delais)))

    # --- provenance 3 : le motif, LU depuis le YAML du job matrice ---------
    motif = _extraire_motif_filtre(job_matrice)
    check("test_motif_de_filtre_present_dans_le_job_matrice", motif is not None,
          "aucun `grep -qx '...'` trouvé dans le job %r -- le filtre a "
          "peut-être été remplacé par une autre forme (ex. énumération "
          "`case ... in *theme*)`), que ce test ne reconnaît pas et doit "
          "donc faire échouer" % _JOB_MATRICE)

    grep_set = {f for f in fichiers if motif and _porte_ligne_exacte(f, motif)}

    # --- les trois ensembles coïncident exactement --------------------------
    check("test_declares_egale_detectes", declares == detectes,
          "declares=%r detectes=%r -- un marqueur oublié se lit "
          "detectes ⊃ declares" % (_rel(declares), _rel(detectes)))
    check("test_declares_egale_grep_set", declares == grep_set,
          "declares=%r grep_set=%r -- un marqueur posé hors d'une "
          "affectation de module (ex. dans une docstring) se lit "
          "grep_set ⊅ declares ou grep_set ⊃ declares" % (_rel(declares), _rel(grep_set)))
    check("test_detectes_egale_grep_set", detectes == grep_set,
          "detectes=%r grep_set=%r" % (_rel(detectes), _rel(grep_set)))

    # --- l'asymétrie voulue : filtre présent en matrice, ABSENT en système -
    # Le scénario d'erreur le plus probable (§1.3 de la note d'architecte) :
    # les deux jobs partagent un script dupliqué à l'identique, et une copie
    # ferait tomber les harnais navigateur à ZÉRO exécution, en silence.
    check("test_filtre_present_cote_matrice",
          motif is not None and re.search(r"grep\s+-qx\s+'%s'" % re.escape(motif),
                                            job_matrice) is not None,
          "le motif de filtrage n'apparaît pas dans le job matrice lui-même")

    # ⚠️ bug-022, revue de code, DEUXIÈME reboucle sur ce même point : une
    # version antérieure vérifiait l'ABSENCE du texte `grep -qx '<motif>'`
    # dans le job système -- ça prouvait qu'une ORTHOGRAPHE précise était
    # absente, jamais que le job n'excluait rien. Corrigé une première fois
    # par les deux checks ci-dessous (ligne de découverte identique + aucun
    # `continue`), qui tuaient déjà :
    #   A  : un `case "$fichier" in *theme*) continue ;; esac` glissé dans la
    #        boucle du job système.
    #   A3 : la ligne de DÉCOUVERTE elle-même réécrite en
    #        `find control-center -type f -name 'test_*.py' | xargs grep -Lx
    #        'HARNAIS_NAVIGATEUR = True' | sort`.
    # ⚠️ Mais CES DEUX CHECKS SONT ENCORE UNE ÉNUMÉRATION DE SYNTAXES, et une
    # garde qui énumère des syntaxes se contourne par une syntaxe de plus --
    # constaté une seconde fois, en revue, avec deux mutants qui les
    # traversent TOUS LES DEUX sans y toucher :
    #   A4 : exclusion par `if grep -qx … ; then echo saute ; else <appel> ;
    #        fi` -- aucun `continue`, ligne de découverte intacte.
    #   A5 : un SECOND `mapfile` qui refiltre `fichiers` juste après la ligne
    #        canonique -- laquelle reste présente, verbatim, et satisfait le
    #        check (1) tel quel.
    # Dans les deux cas : harnais navigateur à ZÉRO exécution dans les TROIS
    # jobs, ces deux checks restaient verts. **Ils sont donc RÉTROGRADÉS EN
    # DIAGNOSTICS** : ils restent posés (un meilleur message d'erreur quand
    # ILS s'appliquent), mais NE PROUVENT PLUS RIEN par eux-mêmes -- toute
    # affirmation du genre « quelle que soit sa syntaxe » ou « quel que soit
    # le motif qui déclenche le saut » serait un acquis FAUX, du même genre
    # que celui que ce cycle existe pour débusquer. Ce qui fait foi
    # désormais, c'est l'ORACLE COMPORTEMENTAL ci-dessous : il ne lit plus le
    # texte du job, il l'EXÉCUTE.
    check("test_diagnostic_ligne_decouverte_identique_dans_les_deux_jobs",
          _RE_LIGNE_DECOUVERTE.search(job_systeme) is not None
          and _RE_LIGNE_DECOUVERTE.search(job_matrice) is not None,
          "[diagnostic, ne prouve rien seul -- voir l'oracle comportemental "
          "ci-dessous] la ligne `mapfile -t fichiers < <(find control-center "
          "-type f -name 'test_*.py' | sort)` n'apparaît pas identique dans "
          "les deux jobs")
    check("test_diagnostic_systeme_sans_continue_dans_la_boucle",
          "continue" not in job_systeme,
          "[diagnostic, ne prouve rien seul -- voir l'oracle comportemental "
          "ci-dessous] le mot-clé `continue` apparaît dans le job système")

    # --- ORACLE COMPORTEMENTAL : ce qui prouve réellement la partition ------
    # On EXTRAIT le `run:` réel de chaque job et on l'EXÉCUTE (`bash -c`) sur
    # une arborescence FACTICE portant les CINQ témoins `_TEMOINS` (voir le
    # commentaire au-dessus de `_fichiers_reellement_lances` pour ce que
    # chacun croise et pourquoi cinq, pas deux), puis on compare l'ensemble
    # RÉELLEMENT lancé. Peu importe PAR QUELLE SYNTAXE le job exclut un
    # fichier -- `continue`, `if/else`, un second `mapfile`, une fonction qui
    # avale l'appel, un filtre par NOM, un filtre par CONTENU (`grep -q
    # chromium`), ou toute autre forme qui ne lit QU'UNE des trois dimensions
    # croisées -- seul ce qui a RÉELLEMENT tourné compte. (Une exclusion qui
    # lirait une QUATRIÈME dimension, non couverte par ces témoins, peut
    # échapper à cet oracle -- voir l'avertissement de couverture dans le
    # docstring de `_fichiers_reellement_lances`, à jour et non un vœu.)
    _TEMOINS_MARQUES = sorted(n[:-len(".py")] for n, (m, _c) in _TEMOINS.items() if m)
    _TEMOINS_NON_MARQUES = sorted(n[:-len(".py")] for n, (m, _c) in _TEMOINS.items() if not m)
    _TOUS_LES_TEMOINS = sorted(_TEMOINS_MARQUES + _TEMOINS_NON_MARQUES)
    if shutil.which("bash") is None:
        check("test_oracle_comportemental_bash_disponible", False,
              "`bash` introuvable -- l'oracle comportemental ne peut pas "
              "s'exécuter ; les deux diagnostics ci-dessus restent seuls, "
              "ce qui est INSUFFISANT pour prouver la partition (voir "
              "commentaire ci-dessus)")
    else:
        lances_systeme = _fichiers_reellement_lances(texte_workflow, _JOB_SYSTEME)
        lances_matrice = _fichiers_reellement_lances(texte_workflow, _JOB_MATRICE)
        check("test_oracle_systeme_lance_les_cinq_temoins",
              lances_systeme == _TOUS_LES_TEMOINS,
              "le job système, EXÉCUTÉ RÉELLEMENT sur l'arborescence "
              "factice, a lancé %r au lieu des cinq témoins %r -- CE job "
              "doit exécuter TOUT témoin, marqué ou non, quel que soit son "
              "nom ou son contenu, PAR CONSTRUCTION (bug-022, mutants "
              "A4/A5/H/I)" % (lances_systeme, _TOUS_LES_TEMOINS))
        check("test_oracle_matrice_exclut_les_temoins_marques_et_eux_seuls",
              lances_matrice == _TEMOINS_NON_MARQUES,
              "le job matrice, EXÉCUTÉ RÉELLEMENT sur l'arborescence "
              "factice, a lancé %r au lieu des témoins NON marqués %r -- CE "
              "job doit exclure un témoin SI ET SEULEMENT SI il porte le "
              "marqueur, jamais sur la foi de son nom ou de son contenu "
              "(bug-022, mutants H/I)" % (lances_matrice, _TEMOINS_NON_MARQUES))

    # --- découverte / isolation du stdin / compte exécutés vs découverts, --
    # --- dans les DEUX jobs (§1.3 point 6, et PIEGES §48) -------------------
    for nom_job, texte_job in ((_JOB_SYSTEME, job_systeme), (_JOB_MATRICE, job_matrice)):
        prefixe = nom_job.replace("-", "_")
        check("test_%s_decouvre_par_find" % prefixe,
              re.search(r"find\s+control-center\s+-type\s+f\s+-name\s+'test_\*\.py'",
                         texte_job) is not None,
              "aucun `find control-center -type f -name 'test_*.py'` trouvé "
              "dans le job %r" % nom_job)
        check("test_%s_isole_le_stdin_des_tests" % prefixe,
              re.search(r'^\s*if\s+!\s+python3\s+"\$fichier"\s*<\s*/dev/null',
                        texte_job, re.MULTILINE) is not None,
              "l'appel `python3 \"$fichier\"` ne redirige pas son stdin "
              "depuis /dev/null dans le job %r (PIEGES §48) -- ANCRÉ sur la "
              "ligne d'appel réelle (`^...if ! python3 \"$fichier\" < "
              "/dev/null`), pas sur une phrase libre ailleurs dans le bloc "
              "(bug-022, mutation 6a)" % nom_job)
        check("test_%s_imprime_le_triple_comptage" % prefixe,
              "Exclus (harnais navigateur)" in texte_job and "Exécutés" in texte_job
              and "Découverts" in texte_job,
              "le job %r n'imprime pas les trois comptes découverts / "
              "exclus / exécutés" % nom_job)

    check("test_systeme_compare_executes_a_decouverts",
          re.search(r'"\$\{#executes\[@\]\}"\s*-ne\s*"\$\{#fichiers\[@\]\}"',
                     job_systeme) is not None,
          "le job système ne compare pas les fichiers exécutés aux fichiers "
          "découverts -- une boucle interrompue se lirait comme un succès")
    check("test_matrice_compare_executes_a_decouverts_moins_exclus",
          re.search(r'"\$\{#executes\[@\]\}"\s*-ne\s*"\$attendu"', job_matrice) is not None,
          "le job matrice ne compare pas les fichiers exécutés à "
          "(découverts − exclus) -- un filtre trop gourmand ou une boucle "
          "interrompue se liraient comme un succès")

    # --- arithmétique explicite (§1.3 point 7) ------------------------------
    # Simule ce que la CI exécute réellement : le job système lance TOUJOURS
    # chaque fichier une fois ; chacun des N legs de la matrice ne lance un
    # fichier QUE s'il n'est pas dans `grep_set` (le filtre réellement
    # appliqué). N est LU dans `strategy.matrix.python-version`, jamais codé
    # en dur (bug-022, mutation 5) : exécutions = 1 (système) + N×(non
    # marqué). Une matrice à 2 legs donne donc 1+2=3 pour un fichier NON
    # marqué et 1 pour un fichier marqué ; ajouter ou retirer un leg fait
    # bouger le premier chiffre sans qu'il faille toucher ce fichier.
    n_legs = _compter_legs_matrice(job_matrice)
    check("test_nombre_de_legs_matrice_detecte", n_legs is not None and n_legs >= 1,
          "`strategy.matrix.python-version` introuvable ou vide dans le job "
          "%r -- l'arithmétique ne peut pas se calculer sans lui" % _JOB_MATRICE)
    n_legs_surete = n_legs if n_legs else 0

    # ⚠️ Ces N assertions (une par fichier découvert) ne sont PAS N gardes
    # indépendantes -- ce compte de cas est gonflé, et il faut le dire plutôt
    # que laisser croire à autant de propriétés distinctes couvertes. Pour
    # tout fichier, `executions_reelles == executions_attendues` équivaut
    # exactement à `(fichier in grep_set) == (fichier in declares)` -- déjà
    # affirmé, une fois, par `test_declares_egale_grep_set` ci-dessus -- plus
    # `n_legs` correctement lu, déjà affirmé, une fois, par
    # `test_nombre_de_legs_matrice_detecte`. Ce que CETTE boucle ajoute
    # réellement : elle vérifie l'arithmétique fichier par fichier PLUTÔT
    # QUE sur les seuls ensembles, pour qu'un futur défaut localisé à un
    # SEUL fichier (une erreur d'arrondi, un fichier compté deux fois) reste
    # repérable individuellement dans la sortie -- une valeur pour le
    # diagnostic, pas une preuve supplémentaire.
    for fichier in fichiers:
        executions_reelles = 1 + (0 if fichier in grep_set else n_legs_surete)
        executions_attendues = 1 if fichier in declares else 1 + n_legs_surete
        check("test_arithmetique_executions_%s" % os.path.relpath(fichier, _RACINE_DEPOT),
              executions_reelles == executions_attendues,
              "fichier=%s reelles=%d attendues=%d (declare=%s, filtre=%s, N=%s)"
              % (os.path.relpath(fichier, _RACINE_DEPOT), executions_reelles,
                 executions_attendues, fichier in declares, fichier in grep_set, n_legs))

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for echec in _echecs:
        print("  - %s" % echec)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
