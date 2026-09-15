#!/usr/bin/env python3
"""feature-019 — les conditions de sécurité 1, 2 et 5, et l'état « sans
JavaScript » (E8), vérifiées EN HTTP, pas en `file://`.

    python3 control-center/web/test_app_navigation_http.py

§10 de `control-center/PIEGES.md` : `test_app_theme_navigateur.py` charge la
page en `file://`, où la CSP ne s'applique pas — il y exécute d'ailleurs un
script inline et passe au vert. Toute vérification qui porte sur ce que le
serveur SERT (l'attribut `hidden` réellement transmis, la feuille réellement
transmise) doit donc passer par une vraie requête HTTP contre un vrai
serveur — c'est ce que ce fichier fait, en réutilisant le motif de
`control-center/backend/test_server.py` (port éphémère, `ThreadingHTTPServer`
sur `("127.0.0.1", 0)`, jamais le port 8788 de l'utilisateur).

## Ce que ce fichier établit

- Condition 5 : l'attribut `hidden` des cinq sections non par défaut est
  présent dans la réponse HTTP de `/`  — pas ajouté après coup par un script,
  puisqu'aucun script ne tourne ici (requête HTTP brute, aucun moteur JS).
- Condition 2 : `.section[hidden] { display: none; }`, dans la feuille
  SERVIE par `/app.css`, vient après toute règle `display` d'auteur sur
  `.section`.
- Condition 4 : la porte d'authentification reste hors de `<main>...</main>`
  dans le HTML SERVI.
- E8 (sans JavaScript / avant son exécution) : la réponse HTTP brute, SANS
  qu'aucun script ne l'ait modifiée, montre exactement une section visible
  (agents) — ni page vide, ni huit blocs d'un coup.
- Condition 1 : `hidden` neutralise réellement (le contrôle masqué N'EST
  PAS focalisable), démontré une fois, EN NAVIGATEUR RÉEL (Chromium
  headless), par contraste avec quatre alternatives qui NE neutralisent PAS
  (`opacity:0`, hors-écran, hauteur nulle à débordement caché, détourage) —
  ⚠️ ce witness est générique (page synthétique, `file://`, la CSP n'a rien
  à y faire puisqu'il ne s'agit pas de tester la conformité CSP mais un fait
  de rendu indépendant du serveur). Il est recoupé avec un fait mesuré EN
  HTTP : la règle RÉELLEMENT servie pour `.section[hidden]` est textuel-
  lement `display: none` (pas une des quatre alternatives non neutralisantes)
  — c'est la combinaison des deux qui établit la condition pour l'artefact
  livré, faute de pouvoir piloter le focus interactif d'une page contrainte
  par CSP sans dépendance installée (pas de client CDP disponible ici,
  ADR-0006). Limite assumée, documentée plutôt que passée sous silence.

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


def appeler(base, chemin):
    requete = urllib.request.Request(base + chemin, method="GET")
    try:
        with urllib.request.urlopen(requete, timeout=10) as reponse:
            return reponse.status, reponse.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as erreur:
        return erreur.code, erreur.read().decode("utf-8", "replace")
    except Exception as erreur:  # connexion refusée, etc.
        return 0, str(erreur)


SECTIONS = ["agents", "systeme", "developper", "cycles", "fichiers", "evenements"]

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
    resultat = subprocess.run(commande, capture_output=True, text=True, timeout=30)
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
        # -- E8 + condition 5 : le HTML SERVI, brut, aucun script exécuté ----
        code, html = appeler(base, "/")
        check("prealable_racine_servie_200", code == 200, "obtenu %d" % code)

        for s in SECTIONS:
            if s == "agents":
                continue
            motif = re.compile(r'id="section-%s"[^>]*\bhidden\b' % re.escape(s))
            motif_inverse = re.compile(r'\bhidden\b[^>]*id="section-%s"' % re.escape(s))
            check("E7_c5_http_section_%s_hidden_statique" % s,
                  bool(motif.search(html)) or bool(motif_inverse.search(html)),
                  "aucun `hidden` statique sur #section-%s dans la réponse HTTP" % s)
        check("E7_c5_http_section_agents_sans_hidden",
              not re.search(r'id="section-agents"[^>]*\bhidden\b', html))

        # E8, formulé positivement sur LA MÊME réponse : exactement une
        # section sans `hidden` (pas de page vide, pas huit blocs d'un coup),
        # avant tout script — cette réponse n'en a exécuté aucun.
        sections_sans_hidden = [
            s for s in SECTIONS
            if not re.search(r'id="section-%s"[^>]*\bhidden\b' % re.escape(s), html)
        ]
        check("E8_http_exactement_une_section_sans_hidden_avant_js",
              sections_sans_hidden == ["agents"],
              "sections sans hidden : %r" % sections_sans_hidden)
        check("E8_http_main_non_vide", "<main" in html and len(html) > 2000,
              "longueur=%d" % len(html))

        # -- condition 4 : la porte hors de <main> — sur le HTML SERVI -------
        i_main_ferme = html.find("</main>")
        i_porte = html.find('id="porte-jeton"')
        check("E7_c4_http_porte_presente", i_porte != -1)
        check("E7_c4_http_porte_hors_de_main",
              i_porte != -1 and i_main_ferme != -1 and i_porte > i_main_ferme,
              "porte@%d main-ferme@%d" % (i_porte, i_main_ferme))

        # -- condition 2, RÉÉCRITE après revue : une comparaison d'OFFSETS ne
        # prouve rien sur la cascade — elle se décide par SPÉCIFICITÉ
        # d'abord, ordre seulement à égalité. Preuve du relecteur :
        # `.contenu .section { display: flex }` placé APRÈS
        # `.section[hidden]` porte la MÊME spécificité (0,2,0, deux
        # classes) et l'emporte par ordre — les six sections s'affichaient
        # d'un coup pendant que l'ancienne version, fondée sur des offsets,
        # restait verte. Même calculateur que `test_app_navigation.js`
        # (reproduit ici : ce fichier est un script autonome, §6 de
        # PIEGES.md — pas de module partagé entre `.js` et `.py`).
        code_css, css = appeler(base, "/app.css")
        check("prealable_app_css_servi_200", code_css == 200, "obtenu %d" % code_css)
        css_sans_commentaires = re.sub(r"/\*.*?\*/", "", css, flags=re.S)

        def analyser_regles_css(texte):
            regles = []
            i, n, debut_entete = 0, len(texte), 0
            while i < n:
                if texte[i] == "{":
                    entete = texte[debut_entete:i].strip()
                    if entete.startswith("@"):
                        i += 1
                        debut_entete = i
                        continue
                    profondeur, j = 1, i + 1
                    while j < n and profondeur > 0:
                        if texte[j] == "{":
                            profondeur += 1
                        elif texte[j] == "}":
                            profondeur -= 1
                        j += 1
                    regles.append((entete, texte[i + 1:j - 1]))
                    i = j
                    debut_entete = i
                    continue
                if texte[i] == "}":
                    i += 1
                    debut_entete = i
                    continue
                i += 1
            return regles

        _RE_SPEC = re.compile(
            r"(#[a-zA-Z0-9_-]+)|(\.[a-zA-Z0-9_-]+)|(\[[^\]]+\])|(::[a-zA-Z-]+)"
            r"|(:[a-zA-Z-]+(?:\([^)]*\))?)|([a-zA-Z][a-zA-Z0-9-]*)|(\*)"
        )

        def calculer_specificite(selecteur):
            a = b = c = 0
            for m in _RE_SPEC.finditer(selecteur):
                if m.group(1):
                    a += 1
                elif m.group(2) or m.group(3):
                    b += 1
                elif m.group(4):
                    c += 1
                elif m.group(5):
                    b += 1
                elif m.group(6):
                    c += 1
            return (a, b, c)

        def dernier_compound(partie):
            morceaux = partie.strip().split()
            return morceaux[-1] if morceaux else ""

        def cible_la_classe_section(compound):
            return re.search(r"\.section(?![-\w])", compound) is not None

        def display_important(corps):
            return re.search(r"display\s*:[^;]*!important", corps, re.I) is not None

        regles = analyser_regles_css(css_sans_commentaires)
        index_masquage, spec_masquage, masquage_important = -1, None, False
        for i, (selecteur, corps) in enumerate(regles):
            for partie in [p.strip() for p in selecteur.split(",")]:
                if dernier_compound(partie) == ".section[hidden]":
                    index_masquage, spec_masquage = i, calculer_specificite(partie)
                    masquage_important = display_important(corps)
        check("E7_c2_http_regle_masquage_trouvee", index_masquage != -1)
        check("E7_c2_http_specificite_masquage_deux",
              spec_masquage == (0, 2, 0), spec_masquage)

        # Critère GATE reformulé : « aucune règle `display` d'auteur ne peut
        # BATTRE `.section[hidden]` EN CASCADE » — spécificité, origine,
        # `!important`, ordre — jamais « déclarée après » seule. Un
        # `!important` de plus faible spécificité bat un non-important de
        # spécificité supérieure : tranché AVANT la comparaison de
        # spécificité, qui ne s'applique qu'entre règles de même statut.
        menaces = []
        if index_masquage != -1 and spec_masquage is not None:
            for i, (selecteur, corps) in enumerate(regles):
                if i == index_masquage or "display" not in corps:
                    continue
                important = display_important(corps)
                for partie in [p.strip() for p in selecteur.split(",")]:
                    if not cible_la_classe_section(dernier_compound(partie)):
                        continue
                    spec = calculer_specificite(partie)
                    bat = False
                    if important and not masquage_important:
                        bat = True
                    elif not important and masquage_important:
                        bat = False
                    else:
                        egale = spec == spec_masquage
                        plus_forte = (not egale) and spec >= spec_masquage
                        gagne_par_ordre = egale and i > index_masquage
                        bat = plus_forte or gagne_par_ordre
                    if bat:
                        menaces.append((partie, spec, i, important))
        for partie, spec, i, important in menaces:
            check("E7_c2_http_menace_" + re.sub(r"[^a-zA-Z0-9]+", "_", partie), False,
                  "sélecteur « %s » (spécificité %s, règle #%d%s) menace le masquage "
                  "(spécificité %s, règle #%d%s)"
                  % (partie, spec, i, ", !important" if important else "",
                     spec_masquage, index_masquage, ", !important" if masquage_important else ""))
        check("E7_c2_http_aucune_regle_display_ne_menace_le_masquage", not menaces,
              "%d menace(s)" % len(menaces))

        # -- condition 1, partie HTTP : la règle RÉELLEMENT servie pour ------
        # -- `.section[hidden]` est EXACTEMENT `display: none`, pas une des --
        # -- quatre alternatives non neutralisantes ---------------------------
        m_regle = re.search(r"\.section\[hidden\]\s*\{([^}]*)\}", css)
        check("E7_c1_http_regle_trouvee", m_regle is not None)
        if m_regle:
            corps = m_regle.group(1)
            check("E7_c1_http_regle_est_display_none",
                  re.search(r"display:\s*none\s*;?", corps) is not None, corps)
            check("E7_c1_http_regle_n_est_pas_opacity",
                  "opacity" not in corps, corps)
            check("E7_c1_http_regle_n_est_pas_visibility_seule",
                  "visibility" not in corps or "display" in corps, corps)
    finally:
        serveur.shutdown()
        serveur.server_close()

    # -- condition 1, partie navigateur : witness générique, file:// --------
    navigateur = trouver_navigateur()
    if not navigateur:
        print("ℹ️  Aucun binaire Chromium trouvé — le witness de la condition "
              "1 (focalisabilité réelle) est SAUTÉ ; les vérifications HTTP "
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
