#!/usr/bin/env python3
"""Garde de non-régression sur la DÉCOUVERTE des tests du centre de contrôle
dans la CI GitLab (bug-019).

    python3 control-center/backend/test_ci_decouverte.py

## Pourquoi ce test existe

`.gitlab/ci/hygiene.yml` énumérait autrefois les fichiers de test du centre
de contrôle À LA MAIN, un par un (`if [ -f control-center/backend/test_X.py
]; then python3 ...`). Le jour où `bug-019` a été mesuré, le dépôt comptait
**23** fichiers `test_*.py` sous `control-center/`, et cette énumération n'en
lançait que **6** — les 17 manquants incluaient `test_jeton.py` et
`test_server_bug012.py`, PRÉCISÉMENT les deux qui échouaient. La pipeline
GitLab était donc verte PARCE QU'ELLE NE LANÇAIT PAS ce qui échouait, pendant
que GitHub (qui DÉCOUVRE par `find control-center -name 'test_*.py'`) était
rouge sur le même commit.

Rien, avant ce test, ne gardait ce mécanisme contre une régression future —
un futur commit pourrait réintroduire une énumération manuelle (par exemple
« pour accélérer la CI » ou « pour ne lancer que deux fichiers pendant un
debug ») sans qu'aucune suite ne le remarque, puisque ce YAML n'est exécuté
QUE par GitLab lui-même. Ce fichier lit `.gitlab/ci/hygiene.yml` comme un
ARTEFACT (jamais une copie de son contenu attendu, PIEGES §29-like) et vérifie
que le job `hygiene:centre-de-controle` DÉCOUVRE toujours ses fichiers par
`find`, et n'en énumère plus aucun à la main.

⚠️ Ce fichier lui-même, une fois ajouté sous `control-center/`, est un cas
vivant du critère d'acceptation de `bug-019` : « un fichier de test neuf est
lancé sans modifier le fichier de CI » — il est repris par la découverte
`find` des DEUX forges sans qu'aucune ligne de `.gitlab/ci/hygiene.yml` ni de
`.github/workflows/hygiene-specs.yml` n'ait à changer.

Hors périmètre (bug-019, section « Hors périmètre ») : le job `hygiene:tests`
(pour `tests/`, hors `control-center/`), dont l'énumération manuelle est un
choix distinct, non corrigé par ce cycle.
"""

import os
import re

_ICI = os.path.dirname(os.path.abspath(__file__))
_RACINE_DEPOT = os.path.dirname(os.path.dirname(_ICI))  # backend/ -> control-center/ -> racine
_CHEMIN_GITLAB_CI = os.path.join(_RACINE_DEPOT, ".gitlab", "ci", "hygiene.yml")

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


def _extraire_job(texte_yaml, nom_job):
    """Rend le texte du job `nom_job:` — de sa ligne de déclaration jusqu'à la
    prochaine ligne qui démarre en colonne 0 (le prochain job ou la fin du
    fichier). Extraction PAR INDENTATION, pas par un compte de lignes fixe :
    un compte de lignes fixe périmerait au premier commentaire ajouté."""
    lignes = texte_yaml.splitlines()
    debut = None
    for i, ligne in enumerate(lignes):
        if ligne.startswith(nom_job + ":"):
            debut = i
            break
    assert debut is not None, "job %r introuvable dans %s" % (nom_job, _CHEMIN_GITLAB_CI)
    fin = len(lignes)
    for i in range(debut + 1, len(lignes)):
        if lignes[i] and not lignes[i][0].isspace():
            fin = i
            break
    return "\n".join(lignes[debut:fin])


def main():
    # `.gitlab/` est un chemin CONDITIONNEL du kit (comme `tests/` ou
    # `control-center/` eux-mêmes) : un projet qui ne parle qu'à GitHub ne
    # l'a jamais reçu, et ce n'est pas une régression. Se saute PROPREMENT
    # (0 cas, code 0) dans ce cas — même patron que le pont JS/Python
    # (PIEGES §6) et que la dépendance hors-clone de `docs/DESIGN-SYSTEM.md`
    # (PIEGES §32) : `tools/lancer_suite_control_center_non_root.sh` ne clone
    # QUE `control-center/` + trois chemins ADDITIONNELS déclarés (PIEGES
    # §1), jamais `.gitlab/` — ce test s'y saute donc TOUJOURS, y compris
    # dans CE dépôt qui a bel et bien un `.gitlab/`. Sa garde réelle s'exerce
    # dans les DEUX CI (checkout complet), pas dans cette vérification locale
    # partielle.
    if not os.path.isfile(_CHEMIN_GITLAB_CI):
        print("ℹ️  %s absent — rien à lancer (chemin conditionnel, ou clone "
              "partiel qui ne le copie pas — PIEGES §1)." % _CHEMIN_GITLAB_CI)
        print("\n0 cas, 0 echec(s)")
        return 0

    with open(_CHEMIN_GITLAB_CI, "r", encoding="utf-8") as f:
        texte = f.read()

    job = _extraire_job(texte, "hygiene:centre-de-controle")

    # --- la découverte est bien un `find`, jamais une énumération à la main ---
    check("test_job_centre_de_controle_decouvre_par_find",
          re.search(r"find\s+control-center\s+-type\s+f\s+-name\s+'test_\*\.py'",
                     job) is not None,
          "aucun `find control-center -type f -name 'test_*.py'` trouvé dans "
          "le job — la découverte a peut-être disparu")

    # --- aucune énumération manuelle de fichier de test précis -------------
    # Motif de l'ancienne régression (bug-019) : un test d'EXISTENCE posé sur
    # un chemin de fichier de test LITTÉRAL, un par un. `if [ ! -d
    # control-center ]` (test de RÉPERTOIRE, toujours légitime) ne matche pas
    # ce motif : seul `-f` sur un chemin qui se termine par `test_*.py` est
    # visé.
    enumerations = re.findall(r"-f\s+\S*test_[\w]+\.py", job)
    check("test_job_centre_de_controle_sans_enumeration_manuelle",
          len(enumerations) == 0,
          "fichiers énumérés à la main trouvés : %r" % enumerations)

    # --- aucun appel direct à un fichier de test nommé en dur --------------
    # `python3 control-center/backend/test_X.py` en dur, plutôt que
    # `python3 "$fichier"` (variable de boucle issue de la découverte).
    appels_en_dur = re.findall(r"python3\s+control-center\S*test_[\w]+\.py", job)
    check("test_job_centre_de_controle_sans_appel_en_dur",
          len(appels_en_dur) == 0,
          "appels en dur trouvés : %r" % appels_en_dur)

    # --- la découverte échoue si elle ne trouve aucun fichier --------------
    # Une liste vide ne doit jamais se lire comme « tout est vert » (défaut
    # sûr déjà exigé par bug-019) : le job doit contenir un `exit 1` gardé par
    # un test sur le nombre de fichiers découverts.
    check("test_job_centre_de_controle_echoue_si_liste_vide",
          re.search(r'nombre.*-eq\s+0', job) is not None
          and "exit 1" in job,
          "aucune garde « liste vide => exit 1 » trouvée dans le job")

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for echec in _echecs:
        print("  - %s" % echec)
    return 1 if _echecs else 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
