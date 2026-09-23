#!/usr/bin/env python3
"""Pont découvert par la CI (même convention que bug-012/feature-016/
ADR-0020) pour la suite front-end `test_app_bug017.js`.

    python3 control-center/web/test_app_bug017.py

Le job « Suite de tests du centre de contrôle » découvre les tests par `find
control-center -name 'test_*.py'` et lance chaque fichier trouvé avec
`python3 <fichier>` — un fichier `.js` seul n'est JAMAIS ramassé. Ce fichier
est le pont : il ne contient AUCUNE assertion lui-même, il délègue
entièrement à `test_app_bug017.js` (le vrai harnais, zéro dépendance
installée — ADR-0006, `vm`/`fs`/`path` de la bibliothèque standard Node
uniquement) et relaie sa sortie et son code de sortie tels quels.

Si `node` est introuvable sur la machine qui exécute ce fichier, la suite se
SAUTE proprement (code 0, message explicite) plutôt que d'échouer faute
d'interpréteur — Node n'est pas une dépendance du centre de contrôle
lui-même (ADR-0006 ne porte que sur le backend Python et le frontend
vanilla JS livrés dans `control-center/`), seulement de CE harnais de test.
"""

import shutil
import subprocess
import sys
import os

_ICI = os.path.dirname(os.path.abspath(__file__))
_HARNAIS_JS = os.path.join(_ICI, "test_app_bug017.js")


def main():
    node = shutil.which("node")
    if not node:
        print("ℹ️  `node` introuvable sur cette machine — test_app_bug017.js "
              "SAUTÉ (Node n'est pas une dépendance du centre de contrôle, "
              "seulement de ce harnais de test frontend).")
        return 0

    resultat = subprocess.run([node, _HARNAIS_JS])
    return resultat.returncode


if __name__ == "__main__":
    sys.exit(main())
