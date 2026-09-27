#!/usr/bin/env python3
"""A4 — le lancement ET l'interruption PAR CARTE fonctionnent TOUJOURS après
le retrait du panneau générique « Piloter par clé » (feature-028, lot
pilotage dédié).

    python3 control-center/web/test_app_feature028_pilotage_dedie_navigateur.py

Pourquoi ce fichier existe
-----------------------------------------------------------------------------
Le panneau visible (`#pilotage-corps`, `#titre-pilotage`) a été retiré, mais
l'OBJET `pilotage` et plusieurs fonctions qui portent encore son nom
(`actualiserPilotage`, `initialiserPilotage`, `demarrerSondagePilotage`,
`sonderLancementPilotage`, `rendreBadgePilotage`) SURVIVENT : elles sont
l'état d'exécution PARTAGÉ dont dépendent directement le lancement et
l'interruption depuis le menu `⋮` d'une carte. Un futur lecteur qui verrait
« pilotage » et croirait ce bloc mort avec le panneau pourrait le retirer à
son tour — silencieusement, il casserait alors le lancement et
l'interruption PAR CARTE, sans qu'aucun test dédié à ces deux actions
elles-mêmes (`test_app_feature028_interrompre_navigateur.py`) ne le
détecte forcément, puisque ceux-là posent l'état directement plutôt que de
passer par le VRAI chemin d'initialisation (`rafraichir` → `actualiserPilotage`
→ `initialiserPilotage` → auto-sélection de `pilotage.cleChoisie`).

Ce fichier exerce donc le CHEMIN RÉEL, de bout en bout : un premier
`rafraichir()` (comme au chargement de la page) peuple `pilotage.commandes`/
`cleChoisie` SANS qu'aucune UI ne les choisisse — c'est l'auto-sélection,
seul mécanisme qui reste depuis le retrait du `<select>` du panneau. Puis un
VRAI clic sur « Lancer un cycle » (menu `⋮`), puis sur « Interrompre ».

Mutation attendue (documentée, pas automatisée dans ce fichier — voir le
rapport du lot) : neutraliser l'auto-sélection dans `initialiserPilotage`
fait mourir `A4_lancement_par_carte_envoie_la_commande_auto_selectionnee`
(plus aucune commande choisie, le lancement s'arrête avant le moindre
`fetch`) ET, par ricochet, `A4_interruption_par_carte_cible_bien_la_carte`
(sans lancement démarré, `etat.lancement_spec_id` ne devient jamais celui de
la carte, l'item « Interrompre » n'apparaît jamais).

Méthode : même architecture que `test_app_feature028_interrompre_navigateur.py`
— page enveloppe (CSP oblige, PIEGES §9) chargée en `file://`, corps HTML
réel d'`index.html`, `window.fetch` remplacé par un espion multi-routes.

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


_SCRIPT_MESURE = r"""
(function () {
  var out = { erreur: null };
  function attendre(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  (async function () {
    try {
      var appels = [];
      var etatServeur = {
        projet: "MonProjet", config_lue: true,
        colonnes: [
          { repertoire: "todo", classe: "todo", libelle: "Todo" },
          { repertoire: "doing", classe: "doing", libelle: "Doing" },
          { repertoire: "done", classe: "done", libelle: "Done" },
        ],
        specs: [
          { id: "F-500", titre: "cycle a lancer", colonne: "todo", priorite: "Moyenne", divergence: false, statut_texte: "todo" },
        ],
        divergences: 0, agents: [], workflows: [], evenements: [],
        git: { depot: false, branche: null, touches: [], commits: [] },
        commandes_declarees: ["run-cycle"],
        garde_fous: { budget_max_usd: 5, ecrivains_simultanes: 1 },
        ecriture_active: true, ecriture_raison: null, jeton_requis: false,
        horodatage: "2026-09-23T12:00:00Z",
        lancement_spec_id: null,
      };

      window.fetch = function (url, options) {
        appels.push({ url: url, options: options || {} });
        if (url === "/api/etat") {
          return Promise.resolve({ status: 200, ok: true, json: function () { return Promise.resolve(etatServeur); } });
        }
        if (url === "/api/spec/lancer") {
          etatServeur.lancement_spec_id = "F-500"; // le serveur mémorise le lancement
          return Promise.resolve({ status: 202, ok: true, json: function () { return Promise.resolve({}); } });
        }
        if (url.indexOf("/api/lancement") === 0) {
          return Promise.resolve({
            status: 200, ok: true,
            json: function () { return Promise.resolve({ etat: "en_cours", curseur: 10, lignes: "sortie…", derniere_activite: Date.now() / 1000, tronque: false }); },
          });
        }
        if (url === "/api/interrompre") {
          etatServeur.lancement_spec_id = null;
          return Promise.resolve({ status: 202, ok: true, json: function () { return Promise.resolve({ interrompu: true, spec_id: "F-500" }); } });
        }
        return Promise.reject(new Error("fetch non simule dans ce harnais : " + url));
      };

      // -- 1. chargement RÉEL : `rafraichir()` peuple pilotage SANS aucune --
      //    UI (le <select> du panneau a disparu) : c'est l'auto-sélection
      //    (`initialiserPilotage`) qui doit poser `cleChoisie`.
      await rafraichir();
      out.cleChoisieApresChargement = pilotage.cleChoisie;
      out.phaseApresChargement = pilotage.phase;

      function boutonPour(specId) {
        return document.querySelector('.feature-card[data-feature-id="' + specId + '"] .more-button');
      }

      // -- 2. lancement PAR CARTE, un vrai clic ------------------------------
      var b500 = boutonPour("F-500");
      out.bouton_carte_trouve = !!b500;
      b500.click();
      var itemLancer = document.getElementById("menu-launch-cycle");
      out.item_lancer_visible_avant_clic = itemLancer ? !itemLancer.hidden : null;
      if (itemLancer) itemLancer.click();
      await attendre(80);

      var appelsLancer = appels.filter(function (a) { return a.url === "/api/spec/lancer"; });
      out.appels_lancer = appelsLancer.map(function (a) { return JSON.parse(a.options.body || "{}"); });

      // -- 3. le badge d'en-tête reflète le lancement (infrastructure) ------
      out.badgeApresLancement = document.getElementById("jauge-pilotage").className;

      // -- 4. interruption PAR CARTE, une fois le serveur reconnaît F-500 ---
      //    comme lancement courant (`etatServeur.lancement_spec_id`, posé au
      //    'fetch' précédent) — un second `rafraichir()` recharge le kanban
      //    avec `data-interrompable` à jour, EXACTEMENT le chemin réel.
      await rafraichir();
      var b500bis = boutonPour("F-500");
      b500bis.click();
      var itemInterrompre = document.getElementById("menu-interrupt-cycle");
      out.item_interrompre_visible = itemInterrompre ? !itemInterrompre.hidden : null;
      if (itemInterrompre) itemInterrompre.click();
      await attendre(80);

      var appelsInterrompre = appels.filter(function (a) { return a.url === "/api/interrompre"; });
      out.appels_interrompre = appelsInterrompre.map(function (a) { return JSON.parse(a.options.body || "{}"); });
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

    dossier_isole = tempfile.mkdtemp(prefix="cc-test-f028-pilotage-config-")
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
        with tempfile.TemporaryDirectory(prefix="cc-test-f028-pilotage-page-") as dossier:
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

    # -- infrastructure : auto-sélection SANS aucune UI --------------------
    check("A4_infra_auto_selection_cleChoisie_apres_chargement",
          m["cleChoisieApresChargement"] == "run-cycle",
          "obtenu %r — l'auto-sélection (initialiserPilotage) doit poser "
          "cleChoisie sans qu'aucun <select> n'existe plus" % m["cleChoisieApresChargement"])
    check("A4_infra_phase_pret_apres_chargement", m["phaseApresChargement"] == "pret",
          "obtenu %r" % m["phaseApresChargement"])

    # -- lancement PAR CARTE, chemin réel -----------------------------------
    check("A4_bouton_carte_trouve", bool(m["bouton_carte_trouve"]))
    check("A4_item_lancer_visible", m["item_lancer_visible_avant_clic"] is True)
    check("A4_lancement_par_carte_envoie_la_commande_auto_selectionnee",
          m["appels_lancer"] == [{"cle": "run-cycle", "spec_id": "F-500"}],
          "obtenu %r" % m["appels_lancer"])
    check("A4_badge_infra_reflete_le_lancement_en_cours",
          "pilotage-en-cours" in m["badgeApresLancement"],
          "obtenu %r" % m["badgeApresLancement"])

    # -- interruption PAR CARTE, chemin réel --------------------------------
    check("A4_item_interrompre_visible_apres_lancement", m["item_interrompre_visible"] is True)
    check("A4_interruption_par_carte_cible_bien_la_carte",
          m["appels_interrompre"] == [{"spec_id": "F-500"}],
          "obtenu %r" % m["appels_interrompre"])

    print("\n" + str(_tests) + " cas, " + str(len(_echecs)) + " echec(s)")
    for e in _echecs:
        print("  - " + e)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
