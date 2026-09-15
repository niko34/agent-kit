#!/usr/bin/env python3
"""Point d'entrée découvert par la CI (feature-017) pour la suite front-end
`test_app_diagramme.js`.

    python3 control-center/web/test_app_diagramme.py

Le job « Suite de tests du centre de contrôle » (`.github/workflows/
hygiene-specs.yml`) découvre les tests par `find control-center -name
'test_*.py'` et lance chaque fichier trouvé avec `python3 <fichier>` — un
fichier `.js` seul n'est JAMAIS ramassé (PIEGES.md §6). Ce fichier est le
pont : il ne contient AUCUNE assertion lui-même, il délègue entièrement à
`test_app_diagramme.js` (le vrai harnais, zéro dépendance installée —
ADR-0006, `vm`/`fs`/`path` de la bibliothèque standard Node uniquement) et
relaie sa sortie et son code de sortie tels quels.

Si `node` est introuvable sur la machine qui exécute ce fichier, la suite se
SAUTE proprement (code 0, message explicite) plutôt que d'échouer faute
d'interpréteur — Node n'est pas une dépendance du centre de contrôle
lui-même, seulement de CE harnais de test frontend.
"""

import shutil
import subprocess
import sys
import os

_ICI = os.path.dirname(os.path.abspath(__file__))
_HARNAIS_JS = os.path.join(_ICI, "test_app_diagramme.js")


def main():
    node = shutil.which("node")
    if not node:
        print("ℹ️  `node` introuvable sur cette machine — test_app_diagramme.js "
              "SAUTÉ (Node n'est pas une dépendance du centre de contrôle, "
              "seulement de ce harnais de test frontend).")
        return 0

    resultat = subprocess.run([node, _HARNAIS_JS])
    return resultat.returncode


if __name__ == "__main__":
    sys.exit(main())
