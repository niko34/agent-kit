#!/usr/bin/env python3
"""Point d'entree decouvert par la CI (feature-026) pour le harnais
front-end `test_app_conversation_feature026.js` (index.html porte les trois
ids neufs decides par l'ux-ui-designer ; le libelle de la pastille vient du
backend, jamais redderive du code HTTP).

    python3 control-center/web/test_app_conversation_feature026.py

Meme discipline que `test_app_conversation.py` (PIEGES.md Sec.6) : ce
fichier ne porte AUCUNE assertion, delegue entierement au harnais JS, et se
SAUTE proprement (code 0) si `node` est introuvable.
"""

import shutil
import subprocess
import sys
import os

_ICI = os.path.dirname(os.path.abspath(__file__))
_HARNAIS_JS = os.path.join(_ICI, "test_app_conversation_feature026.js")


def main():
    node = shutil.which("node")
    if not node:
        print("(i) `node` introuvable sur cette machine -- "
              "test_app_conversation_feature026.js SAUTE (Node n'est pas une "
              "dependance du centre de controle, seulement de ce harnais de "
              "test frontend).")
        return 0

    resultat = subprocess.run([node, _HARNAIS_JS])
    return resultat.returncode


if __name__ == "__main__":
    sys.exit(main())
