#!/usr/bin/env python3
"""feature-021, cycle 2, lot 3 (F7) — non-régressions vérifiées EN HTTP, pas
en `file://`, sur ce qui reste du mécanisme `hidden` après le retrait de la
navigation à onglets.

    python3 control-center/web/test_app_navigation_http.py

§10 de `control-center/PIEGES.md` : un harnais qui charge la page en
`file://` mesure une page où la CSP ne s'applique pas. Toute vérification
qui porte sur ce que le serveur SERT doit donc passer par une vraie requête
HTTP contre un vrai serveur — c'est ce que ce fichier fait, en réutilisant
le motif de `control-center/backend/test_server.py` (port éphémère,
`ThreadingHTTPServer` sur `("127.0.0.1", 0)`, jamais le port 8788 de
l'utilisateur).

⚠️ Ce fichier s'appelait la contrepartie HTTP de la navigation à onglets
(feature-019) : les conditions 1, 2 et 5, et l'état « sans JavaScript »
(E8), portaient toutes sur `#section-*`/`.section[hidden]`, qui n'existent
plus (feature-021, F7, structure mono-écran — 0 `role="tab"`, tout le
contenu empilé). Ces vérifications sont SUPPRIMÉES avec la navigation
elle-même, pas laissées à mesurer un sélecteur devenu introuvable (un vert à
tort qui ne prouverait plus rien).

## Ce que ce fichier établit désormais

- La porte d'authentification reste hors de `<main>...</main>` dans le HTML
  SERVI (condition héritée de feature-019, PRÉCONDITION du mécanisme
  d'inertie de bug-017 — voir `test_app_bug017.js` pour le mécanisme
  lui-même, vérifié par exécution).
- `#bandeau-hote`, `#tiroir` et `#porte-jeton` — les TROIS éléments qui
  utilisent encore `hidden` comme mécanisme de masquage — portent bien cet
  attribut dans la réponse HTTP brute, SANS qu'aucun script ne l'ait ajouté
  après coup (aucun moteur JS dans une requête HTTP brute).
- Witness générique, EN NAVIGATEUR RÉEL (Chromium headless) : `hidden`
  neutralise RÉELLEMENT un contrôle au clavier, par contraste avec quatre
  alternatives qui NE neutralisent PAS (`opacity:0`, hors-écran, hauteur
  nulle à débordement caché, détourage) — witness générique (page
  synthétique, `file://`, la CSP n'a rien à y faire puisqu'il ne s'agit pas
  de tester la conformité CSP mais un fait de rendu indépendant du serveur),
  recoupé avec un fait mesuré EN HTTP juste au-dessus (l'attribut RÉELLEMENT
  servi est bien `hidden`, pas une des alternatives non neutralisantes).

Saute proprement (code 0) si Chromium est introuvable — Chromium n'est une
dépendance que de CE harnais (ADR-0006).
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

# bug-022 : marqueur de MODULE (pas le nom du fichier) declarant ce harnais
# comme lanceur de navigateur — voir test_app_navigation_http.py (version
# antérieure) et control-center/backend/test_ci_partition_navigateur.py.
HARNAIS_NAVIGATEUR = True

_ICI = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.join(os.path.dirname(_ICI), "backend")
sys.path.insert(0, _BACKEND)
import config as C  # noqa: E402
import server as SRV  # noqa: E402

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


# Delai maximal d'un lancement Chromium, en secondes (bug-022, rouvert le
# 2026-09-27 par son propre critere longitudinal — voir `_lancer_navigateur`).
# Nomme plutot qu'ecrit en dur : le meme fichier en portait jusqu'a TROIS
# occurrences, et un seuil a trois endroits se corrige a deux.
_DELAI_CHROMIUM_S = 120


def _lancer_navigateur(commande):
    """Lance `commande` (un appel Chromium), avec une seule reprise si la
    premiere tentative expire (bug-022).

    Le seuil vit dans `_DELAI_CHROMIUM_S` et vaut 120 s depuis le 2026-09-27.
    Les 30 s d'origine se justifiaient par une marge LOCALE de 6,5x (3
    lancements concurrents brides a 2 vCPU, 4,6 s). Le critere longitudinal
    pose par bug-022 -- « si l'avertissement apparait en CI, rouvrir le
    dossier » -- s'est declenche DEUX runs de suite sur le coureur GitHub :
    run 36243211048 (1 avertissement, reprise reussie) puis run 36305731821
    (les DEUX tentatives expirees, job rouge). Or dans ce meme journal, les
    lancements SUIVANTS tiennent en ~12 s : le seul qui expire est le PREMIER
    du job, un demarrage a FROID. 30 s etait donc a l'interieur de la
    distribution normale d'un demarrage a froid, pas au-dela — ce n'etait pas
    une VM anormale, c'etait un seuil trop juste, et la marge de 6,5x mesurait
    une machine qui n'est pas celle qui echoue.

    Cette reprise absorbe le residu d'exposition SANS masquer une vraie
    regression : elle ne rattrape QUE `subprocess.TimeoutExpired`, jamais un
    echec d'assertion ni un code de retour non nul, et elle est UNIQUE (pas de
    boucle). L'avertissement reste imprime bruyamment : c'est toujours le
    critere longitudinal -- s'il reapparait en CI, le seuil est a REMESURER
    sur la machine qui echoue, jamais a augmenter au juge."""
    try:
        return subprocess.run(commande, capture_output=True, text=True,
                              timeout=_DELAI_CHROMIUM_S)
    except subprocess.TimeoutExpired:
        print("!" * 70, file=sys.stderr)
        print(f"AVERTISSEMENT bug-022 : lancement Chromium expire apres "
              f"{_DELAI_CHROMIUM_S} s, nouvelle tentative unique. Si ceci "
              f"apparait en CI, rouvrir bug-022 (voir "
              f"control-center/PIEGES.md).", file=sys.stderr)
        print("!" * 70, file=sys.stderr)
        return subprocess.run(commande, capture_output=True, text=True,
                              timeout=_DELAI_CHROMIUM_S)


def appeler(base, chemin):
    requete = urllib.request.Request(base + chemin, method="GET")
    try:
        with urllib.request.urlopen(requete, timeout=10) as reponse:
            return reponse.status, reponse.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as erreur:
        return erreur.code, erreur.read().decode("utf-8", "replace")
    except Exception as erreur:  # connexion refusée, etc.
        return 0, str(erreur)


_PAGE_FOCUS = """<!doctype html><html><head><meta charset="utf-8"></head><body>
<button id="b-hidden" hidden>hidden natif</button>
<button id="b-display-none" style="display:none">display none</button>
<button id="b-opacity" style="opacity:0">opacity 0</button>
<button id="b-offscreen" style="position:absolute;left:-9999px;top:-9999px">hors ecran</button>
<button id="b-height0" style="height:0;overflow:hidden;padding:0;border:0">hauteur nulle</button>
<button id="b-clip" style="position:absolute;clip:rect(0,0,0,0)">detoure</button>
<pre id="salida"></pre>
<script>
function focalisable(id) {
  var el = document.getElementById(id);
  el.focus();
  return document.activeElement === el;
}
var resultat = {};
['b-hidden', 'b-display-none', 'b-opacity', 'b-offscreen', 'b-height0', 'b-clip'].forEach(function (id) {
  resultat[id] = focalisable(id);
});
document.getElementById('salida').textContent = JSON.stringify(resultat);
</script>
</body></html>
"""

_RE_SALIDA_JSON = re.compile(r'<pre id="salida">(\{.*?\})</pre>', re.S)


def mesurer_focalisabilite(navigateur, dossier):
    chemin = os.path.join(dossier, "page_focus.html")
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(_PAGE_FOCUS)
    commande = [
        navigateur, "--headless", "--disable-gpu", "--no-sandbox",
        "--dump-dom", "file://" + chemin,
    ]
    resultat = _lancer_navigateur(commande)
    m = _RE_SALIDA_JSON.search(resultat.stdout)
    if not m:
        return None
    return json.loads(m.group(1))


def main():
    dossier_isole = tempfile.mkdtemp(prefix="cc-test-nav-http-config-")
    chemin_config_isole = os.path.join(dossier_isole, "n-existe-jamais.toml")
    racine_reelle = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(SRV.__file__))))
    config = C.charger(chemin=chemin_config_isole, racine_projet=racine_reelle)

    serveur = ThreadingHTTPServer(("127.0.0.1", 0), SRV.Handler)
    serveur.daemon_threads = True
    serveur.etat = SRV.Etat(config)
    serveur.servables = SRV._fichiers_servables()
    base = "http://127.0.0.1:%d" % serveur.server_address[1]
    fil = threading.Thread(target=serveur.serve_forever, daemon=True)
    fil.start()

    try:
        # -- le HTML SERVI, brut, aucun script exécuté ------------------
        code, html = appeler(base, "/")
        check("prealable_racine_servie_200", code == 200, "obtenu %d" % code)

        # -- porte hors de <main> — condition héritée de feature-019,
        # précondition du mécanisme d'inertie de bug-017 -----------------
        i_main_ferme = html.find("</main>")
        i_porte = html.find('id="porte-jeton"')
        check("F7_http_porte_presente", i_porte != -1)
        check("F7_http_porte_hors_de_main",
              i_porte != -1 and i_main_ferme != -1 and i_porte > i_main_ferme,
              "porte@%d main-ferme@%d" % (i_porte, i_main_ferme))

        # -- les TROIS éléments encore masqués par `hidden` portent bien
        # cet attribut dans le HTML SERVI, pas ajouté par un script -------
        for id_ in ("bandeau-hote", "tiroir", "porte-jeton"):
            motif = re.compile(r'id="%s"[^>]*\bhidden\b' % re.escape(id_))
            motif_inverse = re.compile(r'\bhidden\b[^>]*id="%s"' % re.escape(id_))
            check("F7_http_%s_hidden_statique" % id_.replace("-", "_"),
                  bool(motif.search(html)) or bool(motif_inverse.search(html)),
                  "aucun attribut `hidden` statique trouvé sur #%s" % id_)

        check("F7_http_main_non_vide", "<main" in html and len(html) > 2000,
              "longueur=%d" % len(html))
    finally:
        serveur.shutdown()
        serveur.server_close()

    # -- witness générique : `hidden` neutralise réellement, par contraste
    # avec quatre alternatives qui ne neutralisent pas -------------------
    navigateur = trouver_navigateur()
    if not navigateur:
        print("ℹ️  Aucun binaire Chromium trouvé — le witness de neutralisation "
              "réelle par `hidden` est SAUTÉ ; les vérifications HTTP "
              "ci-dessus restent jouées.")
    else:
        with tempfile.TemporaryDirectory(prefix="cc-test-nav-http-focus-") as dossier:
            mesures = mesurer_focalisabilite(navigateur, dossier)
            if mesures is None:
                check("E7_c1_witness_mesure_disponible", False,
                      "--dump-dom n'a rien renvoyé")
            else:
                check("E7_c1_witness_hidden_natif_non_focalisable",
                      mesures["b-hidden"] is False, mesures)
                check("E7_c1_witness_display_none_non_focalisable",
                      mesures["b-display-none"] is False, mesures)
                check("E7_c1_witness_opacite_zero_reste_focalisable",
                      mesures["b-opacity"] is True, mesures)
                check("E7_c1_witness_hors_ecran_reste_focalisable",
                      mesures["b-offscreen"] is True, mesures)
                check("E7_c1_witness_hauteur_nulle_reste_focalisable",
                      mesures["b-height0"] is True, mesures)
                check("E7_c1_witness_detoure_reste_focalisable",
                      mesures["b-clip"] is True, mesures)

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for e in _echecs:
        print("  - " + e)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
