#!/usr/bin/env python3
"""A2/A3/B6 — l'action « Interrompre » du menu `⋮` cible EXACTEMENT la carte,
garde de NON-RÉGRESSION PAR EXÉCUTION (feature-028, lot A, GATE C3).

    python3 control-center/web/test_app_feature028_interrompre_navigateur.py

Pourquoi ce fichier existe
-----------------------------------------------------------------------------
Le GATE (security-reviewer, P1) a exigé deux choses distinctes, et c'est leur
CONJONCTION qui protège contre le défaut visé :

  - A2 : l'item « Interrompre » du menu contextuel n'apparaît QUE sur la
    carte dont la spec est le lancement COURANT (`etat.lancement_spec_id`) —
    jamais sur une autre carte, jamais sur aucune si rien n'est lancé.
  - B6 (renforcée par le GATE) : cliquer l'item envoie bien LE `spec_id` DE
    CETTE CARTE au serveur — pas seulement « un POST est parti ». Un agent
    qui ajouterait `{spec_id}` côté client sans le lier à la bonne carte
    verrait un 202 et croirait avoir ciblé, pendant que le serveur (ou un
    futur bug côté client) tuerait autre chose.

Une garde qui ne vérifierait que « le menu s'ouvre » ou qu'« un fetch part »
resterait verte si le `spec_id` envoyé était figé, ou repris d'une carte
précédemment ciblée (`menuTargetSpec` mal réinitialisé) — d'où l'assertion
sur le CONTENU du corps envoyé, jamais seulement sur le fait qu'un appel a eu
lieu (même patron d'exigence que PIEGES §51 : un oracle ne vaut que le jeu de
témoins qui le traverse — ici, DEUX cartes distinctes, l'une interrompable,
l'autre non, dans la MÊME page).

Méthode : même architecture que `test_app_feature025_a11y_navigateur.py` —
page enveloppe (CSP oblige, PIEGES §9) chargée en `file://`, corps HTML réel
d'`index.html`, `rendreKanban` appelé directement avec un état fabriqué (deux
specs de la colonne « todo », une seule marquée par `lancement_spec_id`).
`window.fetch` est remplacé par un espion qui répond `202` à
`/api/interrompre` et rejette toute autre URL (capturée sans crasher : ce
harnais ne clique jamais rien qui déclenche `rafraichir()` avant la fin de
la mesure qu'on lit).

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


def _lancer_navigateur(commande):
    """Lance `commande` (un appel Chromium), avec une seule reprise si la
    premiere tentative expire (bug-022).

    Le seuil de 30 s reste inchange : marge mesuree de 6,5x au pire cas local
    (3 lancements concurrents brides a 2 vCPU, 4,6 s), donc un depassement
    implique une VM anormalement lente (incident de provisionnement), pas un
    seuil trop juste. Cette reprise absorbe ce residu d'exposition SANS
    masquer une vraie regression : elle ne rattrape QUE
    `subprocess.TimeoutExpired`, jamais un echec d'assertion ni un code de
    retour non nul, et elle est UNIQUE (pas de boucle). L'avertissement est
    imprime bruyamment : c'est le critere longitudinal du correctif -- s'il
    apparait dans un journal de CI, bug-022 doit etre rouvert."""
    try:
        return subprocess.run(commande, capture_output=True, text=True, timeout=30)
    except subprocess.TimeoutExpired:
        print("!" * 70, file=sys.stderr)
        print("AVERTISSEMENT bug-022 : lancement Chromium expire apres 30 s, "
              "nouvelle tentative unique. Si ceci apparait en CI, rouvrir "
              "bug-022 (voir control-center/PIEGES.md).", file=sys.stderr)
        print("!" * 70, file=sys.stderr)
        return subprocess.run(commande, capture_output=True, text=True, timeout=30)


_SCRIPT_MESURE = r"""
(function () {
  var out = { erreur: null };
  function attendre(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  (async function () {
    try {
      var appelsFetch = [];
      window.fetch = function (url, options) {
        appelsFetch.push({ url: url, options: options || {} });
        if (url === "/api/interrompre") {
          return Promise.resolve({
            status: 202, ok: true,
            json: function () { return Promise.resolve({ interrompu: true }); },
          });
        }
        return Promise.reject(new Error("fetch non simule dans ce harnais : " + url));
      };

      var etat = {
        colonnes: [
          { repertoire: "todo", classe: "todo", libelle: "Todo" },
          { repertoire: "doing", classe: "doing", libelle: "Doing" },
          { repertoire: "done", classe: "done", libelle: "Done" },
        ],
        specs: [
          { id: "F-100", titre: "en cours", colonne: "todo", priorite: "Moyenne", divergence: false, statut_texte: "todo" },
          { id: "F-200", titre: "au repos", colonne: "todo", priorite: "Moyenne", divergence: false, statut_texte: "todo" },
          { id: "F-300", titre: "close", colonne: "done", priorite: "Moyenne", divergence: false, statut_texte: "done" },
        ],
        divergences: 0,
        lancement_spec_id: "F-100",
      };
      window.dernierEtat = etat;
      rendreKanban(etat);

      function boutonPour(specId) {
        return document.querySelector('.feature-card[data-feature-id="' + specId + '"] .more-button');
      }
      out.attribut_f100 = boutonPour("F-100") ? boutonPour("F-100").getAttribute("data-interrompable") : null;
      out.attribut_f200 = boutonPour("F-200") ? boutonPour("F-200").getAttribute("data-interrompable") : null;
      out.attribut_f300 = boutonPour("F-300") ? boutonPour("F-300").getAttribute("data-interrompable") : null;

      // -- F-100 (lancement courant) : le menu porte l'item, VISIBLE -------
      var b100 = boutonPour("F-100");
      b100.click();
      var item = document.getElementById("menu-interrupt-cycle");
      out.item_f100_hidden = item.hidden;
      out.lancer_f100_hidden = document.getElementById("menu-launch-cycle").hidden;
      out.divider_f100_hidden = document.getElementById("launch-divider").hidden;

      item.click(); // ferme le menu, envoie POST /api/interrompre {spec_id:"F-100"}
      await attendre(80);
      // Filtré sur l'URL : `surClicInterromprePourSpec` déclenche `rafraichir()`
      // en cas de 202, qui appelle `/api/etat` À SON TOUR — un second appel
      // réel, mais hors du périmètre de CETTE garde (qui cible le corps de
      // `/api/interrompre` seul).
      out.appels_apres_f100 = appelsFetch.filter(function (a) { return a.url === "/api/interrompre"; });
      out.tous_les_appels_apres_f100 = appelsFetch.slice();

      // -- F-200 (même colonne, PAS le lancement courant) : item CACHÉ -----
      var b200 = boutonPour("F-200");
      b200.click();
      out.item_f200_hidden = document.getElementById("menu-interrupt-cycle").hidden;
      out.lancer_f200_hidden = document.getElementById("menu-launch-cycle").hidden;

      // -- F-300 (colonne "done", ni lancable ni interrompable) -------------
      // Cliquer une AUTRE carte referme le menu de F-200 (même mécanisme
      // que le prototype, `ouvrirMenuContextuel` ferme avant de rouvrir).
      var b300 = boutonPour("F-300");
      b300.click();
      out.item_f300_hidden = document.getElementById("menu-interrupt-cycle").hidden;
      out.lancer_f300_hidden = document.getElementById("menu-launch-cycle").hidden;
      out.divider_f300_hidden = document.getElementById("launch-divider").hidden;
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

    dossier_isole = tempfile.mkdtemp(prefix="cc-test-f028-interrompre-config-")
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
        with tempfile.TemporaryDirectory(prefix="cc-test-f028-interrompre-page-") as dossier:
            fichier = os.path.join(dossier, "harnais.html")
            with open(fichier, "w", encoding="utf-8") as f:
                f.write(page)
            res = _lancer_navigateur([
                navigateur, "--headless", "--disable-gpu", "--no-sandbox",
                "--virtual-time-budget=3000", "--window-size=1400,1400",
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

    # -- A2 : l'attribut ne marque QUE la carte du lancement courant --------
    check("A2_attribut_interrompable_pose_sur_f100", m["attribut_f100"] == "true",
          "obtenu %r" % m["attribut_f100"])
    check("A2_attribut_interrompable_absent_sur_f200_meme_colonne",
          m["attribut_f200"] == "false", "obtenu %r" % m["attribut_f200"])
    check("A2_attribut_interrompable_absent_sur_f300_colonne_done",
          m["attribut_f300"] == "false", "obtenu %r" % m["attribut_f300"])

    # -- A2 : le MENU reflète l'attribut, carte par carte --------------------
    check("A2_item_visible_sur_f100", m["item_f100_hidden"] is False,
          "hidden=%r" % m["item_f100_hidden"])
    check("A2_lancer_visible_sur_f100", m["lancer_f100_hidden"] is False)
    check("A2_divider_visible_sur_f100", m["divider_f100_hidden"] is False)
    check("A2_item_cache_sur_f200", m["item_f200_hidden"] is True,
          "hidden=%r" % m["item_f200_hidden"])
    check("A2_lancer_reste_visible_sur_f200", m["lancer_f200_hidden"] is False)
    check("A2_item_cache_sur_f300", m["item_f300_hidden"] is True)
    check("A2_lancer_cache_sur_f300", m["lancer_f300_hidden"] is True)
    check("A2_divider_cache_sur_f300_ni_lancer_ni_interrompre",
          m["divider_f300_hidden"] is True)

    # -- B6 renforcée : le corps envoyé porte le spec_id DE LA CARTE F-100 --
    appels = m["appels_apres_f100"]
    check("B6_un_seul_appel_interrompre_envoye", len(appels) == 1,
          "obtenu %d appel(s) : %r" % (len(appels), appels))
    if appels:
        appel = appels[0]
        check("B6_url_api_interrompre", appel["url"] == "/api/interrompre",
              "obtenu %r" % appel["url"])
        try:
            corps = json.loads(appel["options"].get("body") or "{}")
        except Exception as e:
            corps = None
            check("B6_corps_json_lisible", False, str(e))
        if corps is not None:
            check("B6_corps_porte_spec_id_de_la_carte_ciblee",
                  corps.get("spec_id") == "F-100",
                  "obtenu %r — un spec_id different de la carte cliquee "
                  "prouverait que menuTargetSpec est mal lie" % corps)

    print("\n" + str(_tests) + " cas, " + str(len(_echecs)) + " echec(s)")
    for e in _echecs:
        print("  - " + e)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
