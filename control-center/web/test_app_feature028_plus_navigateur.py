#!/usr/bin/env python3
"""B3/B6 — le `+` mène au MÊME chemin que `demande` : `POST /api/spec/
brouillon` SEUL, jamais enchaîné à `/api/spec/ecrire` (feature-028, lot B,
GATE C1).

    python3 control-center/web/test_app_feature028_plus_navigateur.py

Pourquoi ce fichier existe
-----------------------------------------------------------------------------
Le `+` (`#open-add-item` → `#add-item-dialog`) était INERTE par conception
(`F0` de feature-021 n'en reprenait que le markup). Le câbler expose EXACTEMENT
le risque que le GATE (security-reviewer, P1, condition C1) a nommé : enchaîner
`/api/spec/brouillon` puis `/api/spec/ecrire` SANS relecture humaine du
Markdown supprimerait, en silence, la garde que `feature-008` avait posée sur
l'ANCIEN chemin (`demande`) — écrire un fichier sur disque sans que personne
n'ait relu ce qu'il contient.

Une garde qui se contenterait de vérifier « soumettre le formulaire déclenche
un appel réseau » resterait verte même si ce lot avait chaîné les deux appels :
il faut COMPTER les appels par route, et prouver que `/api/spec/ecrire` reste
à zéro tant que le bouton dédié (« Confirmer l'écriture », phase
`confirmation-ecriture`) n'a pas été cliqué EXPLICITEMENT — deux clics
distincts après la génération, jamais un seul.

Vérifie aussi (GATE C2) que les champs envoyés à `/api/spec/brouillon`
viennent bien des champs PROPRES à la boîte (`#item-title`, `#item-
description`, radio `#item-type-bug`) — au moment où ce lot (B) a été écrit,
`demande` (`#titre-besoin`/`#spec-prompt`) existait encore et partageait la
MÊME machine à états, jamais les CHAMPS ; elle est retirée depuis (lot C2,
une fois ce fichier vérifié vert), `#add-item-dialog` en est désormais le
SEUL point d'entrée.

Méthode : même architecture que `test_app_feature025_a11y_navigateur.py` —
page enveloppe (CSP oblige, PIEGES §9) chargée en `file://`, corps HTML réel
d'`index.html`, `window.fetch` remplacé par un espion. Le VRAI parcours
utilisateur est exercé : clic sur `#open-add-item`, saisie des champs, clic
sur le bouton de soumission du `<form>` (jamais un appel direct à une fonction
interne d'`app.js`).

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
      var appels = [];
      window.fetch = function (url, options) {
        appels.push({ url: url, options: options || {} });
        if (url === "/api/spec/brouillon") {
          return Promise.resolve({
            status: 200, ok: true,
            json: function () {
              return Promise.resolve({
                genre: "bug",
                slug: "un-titre-depuis-la-boite",
                nom_fichier_prevu: "bug-NNN-un-titre-depuis-la-boite.md",
                contenu: "# Bug — Un titre depuis la boite\n\n## Symptome observe\n\nUn texte depuis la boite\n",
                substitutions: ["slug", "type", "titre"],
              });
            },
          });
        }
        if (url === "/api/spec/ecrire") {
          return Promise.resolve({
            status: 201, ok: true,
            json: function () { return Promise.resolve({ chemin: "specs/features/todo/bug-042-un-titre-depuis-la-boite.md", numero: 42 }); },
          });
        }
        return Promise.reject(new Error("fetch non simule dans ce harnais : " + url));
      };

      // SANS `window.` : `dernierEtat` est un `let` de portée module top-level
      // d'`app.js` — un `<script>` classique ultérieur partage cette même
      // portée lexicale globale, mais PAS `window` (PIEGES §39, même écart
      // mesuré ici en navigateur réel plutôt que dans le bac à sable `vm`).
      dernierEtat = { ecriture_active: true, ecriture_raison: null };

      document.getElementById("open-add-item").click();
      out.dialogue_ouvert_apres_clic_plus =
        typeof document.getElementById("add-item-dialog").open === "boolean"
          ? document.getElementById("add-item-dialog").open
          : !document.getElementById("add-item-dialog").hidden;

      document.getElementById("item-title").value = "Un titre depuis la boite";
      document.getElementById("item-description").value = "Un texte depuis la boite";
      document.getElementById("item-type-bug").checked = true;

      document.getElementById("bouton-generer-item-brouillon").click();
      await attendre(80);

      out.appels_apres_generer = appels.slice();
      var titreBrouillon = document.querySelector("#add-item-redaction-corps h3");
      out.titre_brouillon_affiche = titreBrouillon ? titreBrouillon.textContent : null;
      // `#redaction-corps`/`demande` retirés (feature-028, lot C2, une fois
      // CE lot vérifié) : plus de second conteneur à vérifier vide, il n'y a
      // plus qu'UN SEUL chemin.
      out.aucun_second_conteneur_redaction_corps =
        document.getElementById("redaction-corps") === null;

      var boutonEcrire = document.getElementById("bouton-ecrire-spec");
      out.bouton_ecrire_present_avant_clic = !!boutonEcrire;
      boutonEcrire.click(); // passe en phase confirmation-ecriture — AUCUN fetch ici
      out.appels_apres_clic_ecrire_avant_confirmation = appels.slice();

      var boutonConfirmer = Array.prototype.slice
        .call(document.querySelectorAll("#add-item-redaction-corps button"))
        .filter(function (b) { return b.textContent.indexOf("Confirmer") !== -1; })[0];
      out.bouton_confirmer_trouve = !!boutonConfirmer;
      boutonConfirmer.click();
      await attendre(80);
      out.appels_apres_confirmation = appels.slice();
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

    dossier_isole = tempfile.mkdtemp(prefix="cc-test-f028-plus-config-")
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
        with tempfile.TemporaryDirectory(prefix="cc-test-f028-plus-page-") as dossier:
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

    check("B3_le_plus_ouvre_bien_la_boite", bool(m["dialogue_ouvert_apres_clic_plus"]))

    appels_generer = m["appels_apres_generer"]
    urls_generer = [a["url"] for a in appels_generer]
    check("GATE_C1_un_seul_appel_apres_generer", len(appels_generer) == 1,
          "obtenu %d appel(s) : %r" % (len(appels_generer), urls_generer))
    check("GATE_C1_generer_atteint_brouillon_seul",
          urls_generer == ["/api/spec/brouillon"], "obtenu %r" % urls_generer)
    check("GATE_C1_generer_n_atteint_jamais_ecrire",
          "/api/spec/ecrire" not in urls_generer, "obtenu %r" % urls_generer)

    if appels_generer:
        try:
            corps_envoye = json.loads(appels_generer[0]["options"].get("body") or "{}")
        except Exception as e:
            corps_envoye = None
            check("GATE_C2_corps_brouillon_json_lisible", False, str(e))
        if corps_envoye is not None:
            check("GATE_C2_titre_vient_du_champ_item_title",
                  corps_envoye.get("titre") == "Un titre depuis la boite",
                  "obtenu %r" % corps_envoye)
            check("GATE_C2_texte_vient_du_champ_item_description",
                  corps_envoye.get("texte") == "Un texte depuis la boite",
                  "obtenu %r" % corps_envoye)
            check("B3_type_vient_du_radio_item_type_bug_coche",
                  corps_envoye.get("type") == "bug", "obtenu %r" % corps_envoye)
            check("B3_minimal_toujours_faux_sur_la_surface_dialogue",
                  corps_envoye.get("minimal") is False, "obtenu %r" % corps_envoye)

    check("B3_titre_brouillon_affiche_le_nom_fichier_prevu",
          m["titre_brouillon_affiche"] == "Brouillon — bug-NNN-un-titre-depuis-la-boite.md",
          "obtenu %r" % m["titre_brouillon_affiche"])
    check("C2_demande_et_son_redaction_corps_bien_retires",
          bool(m["aucun_second_conteneur_redaction_corps"]))

    check("B3_bouton_ecrire_atteignable_apres_generation",
          bool(m["bouton_ecrire_present_avant_clic"]))
    appels_avant_confirmation = m["appels_apres_clic_ecrire_avant_confirmation"]
    check("GATE_C1_clic_ecrire_seul_ne_declenche_AUCUN_fetch_supplementaire",
          len(appels_avant_confirmation) == 1,
          "obtenu %d appel(s) (attendu : toujours le seul appel brouillon) : %r"
          % (len(appels_avant_confirmation), [a["url"] for a in appels_avant_confirmation]))

    check("B3_bouton_confirmer_ecriture_trouve", bool(m["bouton_confirmer_trouve"]))
    appels_finaux = m["appels_apres_confirmation"]
    urls_finaux = [a["url"] for a in appels_finaux]
    check("GATE_C1_ecrire_atteint_seulement_apres_confirmation_explicite",
          urls_finaux == ["/api/spec/brouillon", "/api/spec/ecrire"],
          "obtenu %r — deux clics distincts (Écrire… puis Confirmer) doivent séparer "
          "la génération de l'écriture, jamais un enchaînement automatique" % urls_finaux)

    print("\n" + str(_tests) + " cas, " + str(len(_echecs)) + " echec(s)")
    for e in _echecs:
        print("  - " + e)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
