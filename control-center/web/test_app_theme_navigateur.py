#!/usr/bin/env python3
"""E1 (feature-015) — la couleur RÉELLEMENT PEINTE, mesurée dans un vrai
moteur de rendu, pas la règle CSS.

    python3 control-center/web/test_app_theme_navigateur.py

Un choix explicite (`data-theme="clair"` / `"sombre"` posé DIRECTEMENT dans le
HTML servi à Chromium, jamais via `theme.js`) doit gagner contre la
préférence système **dans les deux sens**. `getComputedStyle` seul ne suffit
pas dès qu'un jeton est déclaré en `oklch()` : ce build de Chromium sérialise
`oklch()` tel quel sans le résoudre en `rgb()` (mesuré — voir la note
d'implémentation de feature-015). On passe donc systématiquement par un
canevas 2D (`fillStyle` + `fillRect` + `getImageData`) : c'est la couleur
RÉELLEMENT composée à l'écran, jamais une sérialisation de texte CSS.

Neutralisation du piège documenté (`theme.js` écrase un `data-theme` posé à
la main) : ce test ne charge JAMAIS `theme.js`. La page de test pose
`data-theme` directement dans le HTML statique, sans script d'amorçage —
la règle CSS seule est donc ce qui est mesuré.

`--blink-settings=preferredColorScheme=` vaut **0 pour sombre et 1 pour
clair** — l'inverse de l'intuition (mesuré, voir la note d'implémentation).

Saute proprement si aucun binaire Chromium n'est trouvé (`chromium`,
`chromium-browser`, `google-chrome`) — Chromium n'est une dépendance que de
CE harnais, pas du centre de contrôle lui-même (ADR-0006).
"""

import os
import re
import shutil
import subprocess
import sys
import tempfile

_ICI = os.path.dirname(os.path.abspath(__file__))
_APP_CSS = os.path.join(_ICI, "app.css")

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


def trouver_navigateur():
    for nom in ("chromium", "chromium-browser", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


_PAGE = """<!doctype html><html%(attr)s><head><meta charset="utf-8">
<link rel="stylesheet" href="file://%(css)s">
</head><body>
<canvas id="c" width="2" height="2"></canvas>
<pre id="salida"></pre>
<script>
var ctx = document.getElementById('c').getContext('2d', {colorSpace: 'srgb'});
var val = getComputedStyle(document.body).backgroundColor;
ctx.fillStyle = val;
ctx.fillRect(0, 0, 2, 2);
var d = ctx.getImageData(0, 0, 1, 1).data;
function h2(n) { return n.toString(16).padStart(2, '0'); }
document.getElementById('salida').textContent = '#' + h2(d[0]) + h2(d[1]) + h2(d[2]);
</script>
</body></html>
"""

_RE_SALIDA = re.compile(r'<pre id="salida">(#[0-9a-fA-F]{6})</pre>')


def couleur_peinte(navigateur, dossier, data_theme, preference_systeme_sombre):
    """Rend `data_theme` (None, "clair" ou "sombre") sous la préférence
    système donnée, et retourne la couleur de fond RÉELLEMENT peinte."""
    attr = ' data-theme="%s"' % data_theme if data_theme else ""
    page = _PAGE % {"attr": attr, "css": _APP_CSS}
    nom_fichier = "page_%s_%s.html" % (data_theme or "aucun",
                                        "sombre" if preference_systeme_sombre else "clair")
    chemin = os.path.join(dossier, nom_fichier)
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(page)

    # 0 = sombre, 1 = clair — inversé par rapport à l'intuition (mesuré).
    valeur_scheme = "0" if preference_systeme_sombre else "1"
    commande = [
        navigateur, "--headless", "--disable-gpu", "--no-sandbox",
        "--blink-settings=preferredColorScheme=" + valeur_scheme,
        "--dump-dom", "file://" + chemin,
    ]
    resultat = subprocess.run(commande, capture_output=True, text=True, timeout=30)
    m = _RE_SALIDA.search(resultat.stdout)
    if not m:
        return None
    return m.group(1)


def hex_litteral(nom_variable):
    """Lit UN littéral du bloc `:root` d'`app.css` par son nom exact — pas de
    dépendance à la logique de résolution des jetons, pour rester une mesure
    indépendante de ce que `test_app_theme.js` calcule déjà."""
    with open(_APP_CSS, "r", encoding="utf-8") as f:
        css = f.read()
    m = re.search(r"--%s:\s*(#[0-9a-fA-F]{6});" % re.escape(nom_variable), css)
    if not m:
        raise AssertionError("littéral --%s introuvable dans app.css" % nom_variable)
    return m.group(1).lower()


def main():
    navigateur = trouver_navigateur()
    if not navigateur:
        print("ℹ️  Aucun binaire Chromium trouvé (chromium / chromium-browser / "
              "google-chrome) — test_app_theme_navigateur.py SAUTÉ (E1 : "
              "mesure sur la couleur réellement peinte, nécessite un vrai "
              "moteur de rendu).")
        return 0

    fond_clair = hex_litteral("clair-fond")
    fond_sombre = hex_litteral("sombre-fond")
    check("prealable_fond_clair_et_sombre_distincts", fond_clair != fond_sombre,
          "%s vs %s" % (fond_clair, fond_sombre))

    with tempfile.TemporaryDirectory(prefix="cc-test-theme-navigateur-") as dossier:
        # -- les deux sens du choix explicite (le cœur de l'acceptation E1) --
        obtenu = couleur_peinte(navigateur, dossier, "clair", preference_systeme_sombre=True)
        check("E1_clair_explicite_gagne_sous_systeme_sombre", obtenu == fond_clair,
              "attendu %s, obtenu %s" % (fond_clair, obtenu))

        obtenu = couleur_peinte(navigateur, dossier, "sombre", preference_systeme_sombre=False)
        check("E1_sombre_explicite_gagne_sous_systeme_clair", obtenu == fond_sombre,
              "attendu %s, obtenu %s" % (fond_sombre, obtenu))

        # -- témoins positifs : sans choix explicite, le système décide seul --
        # (si CES cas échouaient alors que les deux ci-dessus passent, la
        # mesure elle-même serait suspecte — jamais vu, gardé par prudence.)
        obtenu = couleur_peinte(navigateur, dossier, None, preference_systeme_sombre=True)
        check("temoin_aucun_choix_systeme_sombre_donne_le_fond_sombre", obtenu == fond_sombre,
              "attendu %s, obtenu %s" % (fond_sombre, obtenu))

        obtenu = couleur_peinte(navigateur, dossier, None, preference_systeme_sombre=False)
        check("temoin_aucun_choix_systeme_clair_donne_le_fond_clair", obtenu == fond_clair,
              "attendu %s, obtenu %s" % (fond_clair, obtenu))

        # -- même sens que le système : les deux DEVRAIENT coïncider, mais on
        # le mesure quand même plutôt que de le supposer --
        obtenu = couleur_peinte(navigateur, dossier, "sombre", preference_systeme_sombre=True)
        check("E1_sombre_explicite_sous_systeme_sombre_aussi", obtenu == fond_sombre,
              "attendu %s, obtenu %s" % (fond_sombre, obtenu))

        obtenu = couleur_peinte(navigateur, dossier, "clair", preference_systeme_sombre=False)
        check("E1_clair_explicite_sous_systeme_clair_aussi", obtenu == fond_clair,
              "attendu %s, obtenu %s" % (fond_clair, obtenu))

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for e in _echecs:
        print("  - " + e)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
