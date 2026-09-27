#!/usr/bin/env python3
"""B2b/B2c — la boîte d'ajout reste UTILISABLE (bouton ATTEIGNABLE, pas
seulement visible) à un viewport d'iPad clavier ouvert, brouillon affiché
(feature-028, revue de code).

    python3 control-center/web/test_app_feature028_boite_ajout_atteignable_navigateur.py

Pourquoi ce fichier existe
-----------------------------------------------------------------------------
`.add-item-form` avait QUATRE enfants directs (`.add-item-body`,
`#erreur-generer-item-brouillon`, `#add-item-redaction-corps`,
`.add-item-actions`) mais seulement DEUX rangées de grille déclarées
(`minmax(0,1fr) auto`) — les deux enfants en trop tombaient dans des rangées
IMPLICITES qui ne se compriment jamais. Mesuré en Chromium réel (revue de
code) : à 413 px de hauteur de viewport, brouillon affiché, `.add-item-body`
tombe à `0px` (titre et description disparaissent) et le bouton « Générer le
brouillon » devient INATTEIGNABLE — `document.elementFromPoint` sur son
centre rend `null`, pas seulement hors de vue.

⚠️ Le patron que ce cycle paie depuis deux jours : une garde qui vérifierait
la seule PRÉSENCE d'un `max-height`/`dvh` resterait verte ICI MÊME, pendant
que le bouton est inatteignable — les deux boîtes portent déjà leur repli
`dvh` (lot B1), qui n'a jamais été la cause de CE défaut. Ce fichier
n'affirme donc RIEN sur la présence d'une règle CSS : il mesure le RÉSULTAT
peint — géométrie réelle (`getBoundingClientRect`) ET hit-test
(`elementFromPoint`), sur les DEUX dialogues (`.add-item-dialog` ET
`.feature-dialog`, même famille de règles).

Saute proprement si Chromium est introuvable.
"""

HARNAIS_NAVIGATEUR = True

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import html as _html
from http.server import ThreadingHTTPServer

_ICI = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.join(os.path.dirname(_ICI), "backend")
sys.path.insert(0, _BACKEND)
import config as C  # noqa: E402
import server as SRV  # noqa: E402

_tests = 0
_echecs = []


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


# 413 px : hauteur mesurée par la revue (iPad paysage clavier ouvert). Le
# brouillon renvoyé est volontairement LONG (nombreuses lignes) pour forcer
# le `<textarea rows="20">` à réclamer toute la hauteur disponible — c'est
# CE contenu qui déclenche le défaut, un brouillon court ne le révèle pas.
_SCRIPT_MESURE = r"""
(function () {
  var out = { erreur: null };
  function attendre(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  (async function () {
    try {
      var lignes = [];
      for (var i = 0; i < 30; i++) lignes.push("ligne " + i + " du brouillon [remplir]");
      var contenuLong = "## Métadonnées\n- ID : [remplir]\n\n## Description\n" + lignes.join("\n") + "\n";

      window.fetch = function (url) {
        if (url === "/api/spec/brouillon") {
          return Promise.resolve({
            status: 200, ok: true,
            json: function () {
              return Promise.resolve({
                genre: "feature", slug: "long", nom_fichier_prevu: "feature-NNN-long.md",
                contenu: contenuLong, substitutions: [],
              });
            },
          });
        }
        return Promise.reject(new Error("fetch non simule : " + url));
      };
      dernierEtat = { ecriture_active: true, ecriture_raison: null };

      function mesurerBoite(dialogueId, ouvrir, boutonId) {
        ouvrir();
        var dialogue = document.getElementById(dialogueId);
        var bouton = document.getElementById(boutonId);
        var rd = dialogue.getBoundingClientRect();
        var rb = bouton.getBoundingClientRect();
        var cx = rb.left + rb.width / 2;
        var cy = rb.top + rb.height / 2;
        var elu = document.elementFromPoint(cx, cy);
        var atteint = elu === bouton || (elu && bouton.contains(elu));
        return {
          dialogue_bottom: rd.bottom, bouton_bottom: rb.bottom,
          actions_sous_dialogue: rb.bottom <= rd.bottom + 0.5,
          bouton_atteint: atteint,
          bouton_rect: { top: rb.top, bottom: rb.bottom, height: rb.height },
        };
      }

      // -- .add-item-dialog, brouillon LONG affiché --------------------------
      document.getElementById("open-add-item").click();
      document.getElementById("item-title").value = "Un besoin quelconque";
      document.getElementById("item-description").value = "Un besoin quelconque, en detail";
      document.getElementById("add-item-form").dispatchEvent(new Event("submit", { cancelable: true }));
      await attendre(120);
      out.add_item = mesurerBoite("add-item-dialog", function () {}, "bouton-generer-item-brouillon");

      // -- .feature-dialog, contenu réaliste (B2c) ---------------------------
      document.getElementById("close-add-item").click();
      document.getElementById("feature-title").textContent = "Un titre de spec assez long pour occuper de la place";
      document.getElementById("feature-description").textContent = lignes.join(" ");
      var ul = document.getElementById("feature-criteria");
      lignes.forEach(function (l) { var li = document.createElement("li"); li.textContent = l; ul.appendChild(li); });
      out.feature = mesurerBoite("feature-dialog", function () {
        document.getElementById("feature-dialog").showModal
          ? document.getElementById("feature-dialog").showModal()
          : (document.getElementById("feature-dialog").hidden = false);
      }, "feature-done");
    } catch (e) {
      out.erreur = (e && e.stack) || String(e);
    }
    document.title = JSON.stringify(out);
  })();
})();
"""


def construire_page(base_http):
    chemin_index = os.path.join(_ICI, "index.html")
    with open(chemin_index, "r", encoding="utf-8") as f:
        html_reel = f.read()
    m = re.search(r"<body>(.*)</body>", html_reel, re.S)
    if not m:
        raise RuntimeError("aucun <body> trouvé dans index.html")
    corps = re.sub(r'<script src="/(diagramme\.js|app\.js)"></script>\s*', "", m.group(1))
    return (
        '<!doctype html><html><head><meta charset="utf-8">'
        '<link rel="stylesheet" href="%(base)s/app.css">'
        "</head><body>"
        "%(corps)s"
        '<script src="%(base)s/diagramme.js"></script>'
        '<script src="%(base)s/app.js"></script>'
        "<script>%(script)s</script>"
        "</body></html>"
    ) % {"base": base_http, "corps": corps, "script": _SCRIPT_MESURE}


def main():
    navigateur = trouver_navigateur()
    if not navigateur:
        print("ℹ️  Aucun binaire Chromium trouvé — harnais sauté.")
        return 0

    for nom in ("app.css", "app.js", "diagramme.js", "index.html"):
        chemin = os.path.join(_ICI, nom)
        if not os.path.exists(chemin) or os.path.getsize(chemin) == 0:
            print("ECHEC ATTEIGNABILITE : %s est absent ou vide à %s" % (nom, chemin))
            return 1

    dossier_isole = tempfile.mkdtemp(prefix="cc-test-f028-boite-config-")
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
        import urllib.request
        with urllib.request.urlopen(base + "/app.css", timeout=10) as reponse:
            check("atteignabilite_app_css_servi_200", reponse.status == 200,
                  "obtenu %d" % reponse.status)

        page = construire_page(base)
        with tempfile.TemporaryDirectory(prefix="cc-test-f028-boite-page-") as dossier:
            fichier = os.path.join(dossier, "harnais.html")
            with open(fichier, "w", encoding="utf-8") as f:
                f.write(page)
            # 800x413 : largeur confortable, HAUTEUR = celle mesurée par la
            # revue (iPad paysage clavier ouvert) — c'est la dimension qui
            # comprime la boîte.
            res = _lancer_navigateur([
                navigateur, "--headless", "--disable-gpu", "--no-sandbox",
                "--virtual-time-budget=3000", "--window-size=800,413",
                "--dump-dom", "file://" + fichier,
            ])
    finally:
        serveur.shutdown()
        serveur.server_close()

    if res.returncode != 0:
        print("ECHEC : Chromium a rendu le code %d\n%s" % (res.returncode, res.stderr[-2000:]))
        return 1

    dom = res.stdout
    debut = dom.find("<title>")
    fin = dom.find("</title>")
    if debut < 0 or fin < 0:
        print("ECHEC ATTEIGNABILITE : aucun <title> dans le DOM rendu (%d octets)" % len(dom))
        return 1
    try:
        m = json.loads(_html.unescape(dom[debut + 7:fin]))
    except Exception as e:
        print("ECHEC ATTEIGNABILITE : <title> illisible (%s)" % e)
        return 1
    if m.get("erreur"):
        print("ECHEC ATTEIGNABILITE : le script de la page a levé :\n%s" % m["erreur"])
        return 1

    ai = m["add_item"]
    print("[dérivé] .add-item-dialog @413px : %r" % ai)
    check("B2b_add_item_bouton_sous_le_bas_du_dialogue", ai["actions_sous_dialogue"],
          "obtenu %r" % ai)
    check("B2b_add_item_bouton_atteint_par_elementFromPoint", ai["bouton_atteint"],
          "obtenu %r" % ai)

    fd = m["feature"]
    print("[dérivé] .feature-dialog @413px : %r" % fd)
    check("B2c_feature_dialog_bouton_sous_le_bas_du_dialogue", fd["actions_sous_dialogue"],
          "obtenu %r" % fd)
    check("B2c_feature_dialog_bouton_atteint_par_elementFromPoint", fd["bouton_atteint"],
          "obtenu %r" % fd)

    print("\n" + str(_tests) + " cas, " + str(len(_echecs)) + " echec(s)")
    for e in _echecs:
        print("  - " + e)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
