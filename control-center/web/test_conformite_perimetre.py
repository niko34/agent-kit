#!/usr/bin/env python3
"""Point d'entree decouvert par la CI (feature-021, cycle 2, lot 0) pour la
garde front-end `test_conformite_perimetre.js`.

    python3 control-center/web/test_conformite_perimetre.py

Le job de CI decouvre les tests par `find control-center -name 'test_*.py'`
et lance chaque fichier trouve avec `python3 <fichier>` -- un fichier `.js`
seul n'est JAMAIS ramasse (PIEGES.md Sec.6). Ce fichier est le pont : il ne
porte AUCUNE assertion lui-meme, il delegue entierement a `test_conformite_perimetre.js`
(zero dependance installee -- ADR-0006, `fs`/`path` de la bibliotheque
standard Node uniquement) et relaie sa sortie et son code de sortie tels
quels.

Si `node` est introuvable sur la machine qui execute ce fichier, la suite se
SAUTE proprement (code 0, message explicite) plutot que d'echouer faute
d'interpreteur -- Node n'est pas une dependance du centre de controle
lui-meme, seulement de CE harnais de test frontend.
"""

import shutil
import subprocess
import sys
import os

_ICI = os.path.dirname(os.path.abspath(__file__))
_HARNAIS_JS = os.path.join(_ICI, "test_conformite_perimetre.js")


def main():
    node = shutil.which("node")
    if not node:
        print("(i) `node` introuvable sur cette machine -- "
              "test_conformite_perimetre.js SAUTE (Node n'est pas une dependance du centre "
              "de controle, seulement de ce harnais de test frontend).")
        return 0

    resultat = subprocess.run([node, _HARNAIS_JS])
    return resultat.returncode


if __name__ == "__main__":
    sys.exit(main())
