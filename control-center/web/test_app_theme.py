#!/usr/bin/env python3
"""Point d'entrée découvert par la CI pour la suite front-end
`test_app_theme.js` (feature-015 — socle de thème et identité des agents).

    python3 control-center/web/test_app_theme.py

Même pont que `test_app_bug012.py` (bug-012, ADR-0020) : découvert par
`find control-center -name 'test_*.py'`, il ne contient AUCUNE assertion
lui-même, il délègue entièrement à `test_app_theme.js` (zéro dépendance
installée — ADR-0006, `vm`/`fs`/`path` de la bibliothèque standard Node
uniquement) et relaie sa sortie et son code de sortie tels quels.

Si `node` est introuvable, la suite se SAUTE proprement (code 0) plutôt que
d'échouer faute d'interpréteur — Node n'est une dépendance que de CE harnais
de test, pas du centre de contrôle lui-même.
"""

import shutil
import subprocess
import sys
import os

_ICI = os.path.dirname(os.path.abspath(__file__))
_HARNAIS_JS = os.path.join(_ICI, "test_app_theme.js")


def main():
    node = shutil.which("node")
    if not node:
        print("ℹ️  `node` introuvable sur cette machine — test_app_theme.js "
              "SAUTÉ (Node n'est pas une dépendance du centre de contrôle, "
              "seulement de ce harnais de test frontend).")
        return 0

    resultat = subprocess.run([node, _HARNAIS_JS])
    return resultat.returncode


if __name__ == "__main__":
    sys.exit(main())
