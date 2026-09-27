#!/usr/bin/env python3
"""F4b, EXTENSION feature-025 (cycle 2, lots 9-10) — le dialogue de
suppression compte, lui aussi, ZÉRO contrôle atteignable hors de lui quand
il est ouvert.

    python3 control-center/web/test_app_feature025_a11y_navigateur.py

Réutilise la MÉTHODE de `test_app_a11y_navigateur.py` (F4b, lot 5) — focus
réel + `document.activeElement`, jamais une relecture d'attributs
(`inert`/`hidden`/`tabindex`, PIEGES §15/§38) — sur une cible différente :
`#delete-dialog`, un `<dialog>` NATIF, ouvert par le VRAI parcours
utilisateur (clic sur `.more-button` d'une carte réelle, clic sur
`#delete-item` dans `#context-menu`), jamais un appel direct aux fonctions
internes de `app.js`.

Pourquoi une cible native prouve un mécanisme DIFFÉRENT de bug-017
-----------------------------------------------------------------------------
`#porte-jeton` (bug-017, lot 3) est un `<div role="dialog">` ordinaire :
sans `fixerInerteAutourDeLaPorte` posant `inert` à la main sur ses frères,
rien ne l'aurait rendue exclusive. `#delete-dialog` est un `<dialog>`
NATIF, ouvert par `showModal()` — le brief de ce lot demande de RÉUTILISER
le mécanisme existant plutôt que de le réinventer ; la lecture retenue
(voir le commentaire au-dessus de `#context-menu` dans `index.html`) est
que la sémantique modale du navigateur EST cette réutilisation, au niveau
du moteur de rendu plutôt que du DOM. Ce fichier mesure l'EFFET pour
vérifier que cette lecture n'est pas qu'une facilité de conception.

`#delete-dialog` est CHOISIE plutôt que `#feature-dialog` : son ouverture
(`ouvrirDialogueSuppression`) est ENTIÈREMENT synchrone, sans appel réseau
— contrairement à `ouvrirDetailFeature`, qui dépend de `GET /api/spec` et
ne peut pas être exercée par un clic réel dans ce harnais (la page de
mesure est chargée en `file://`, PIEGES §9 : c'est ce qui permet d'injecter
le script de mesure sans assouplir la CSP, mais un `fetch("/api/spec…")`
relatif y résoudrait contre `file://`, pas contre le serveur réel). C'est
aussi l'action la plus sensible de ce lot (destructive, GATE P1) : la
couvrir ici n'est pas un choix de confort.

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


_SELECTEUR_FOCALISABLE = (
    "a[href], button, input, select, textarea, [tabindex], summary, "
    "audio[controls], video[controls]"
)

_SCRIPT_MESURE = """
(function () {
  var out = { erreur: null };
  try {
    function scanner(racineExclue) {
      var candidats = Array.prototype.slice.call(
        document.querySelectorAll(%(selecteur)r));
      var horsRacine = candidats.filter(function (n) {
        return !(racineExclue && racineExclue.contains(n));
      });
      var atteignables = [];
      horsRacine.forEach(function (n) {
        try { n.focus({ preventScroll: true }); } catch (e) {}
        if (document.activeElement === n) {
          atteignables.push(n.id ? ('#' + n.id)
            : (n.className ? ('.' + String(n.className).split(/\\s+/)[0]) : n.tagName));
        }
        // Même raison que F4b (lot 5) : blur explicite entre deux candidats,
        // sinon un focus refusé « hérite » du candidat précédent.
        try { n.blur(); } catch (e) {}
      });
      return { total_candidats: candidats.length, hors_racine: horsRacine.length, atteignables: atteignables };
    }

    if (!window.dernierEtat) window.dernierEtat = { colonnes: [], specs: [], divergences: 0 };
    rendreKanban({
      colonnes: [
        { repertoire: "todo", classe: "todo", libelle: "Todo" },
        { repertoire: "doing", classe: "doing", libelle: "Doing" },
        { repertoire: "done", classe: "done", libelle: "Done" },
      ],
      specs: [
        { id: "F-001", titre: "a", colonne: "todo", priorite: "Basse", divergence: false, statut_texte: "todo" },
      ],
      divergences: 0,
    });

    var dialogue = document.getElementById('delete-dialog');
    out.avant = scanner(null);

    var plus = document.querySelector('.more-button');
    if (!plus) throw new Error('aucune .more-button construite par rendreKanban');
    plus.click();
    var supprimer = document.getElementById('delete-item');
    if (!supprimer || supprimer.hidden) throw new Error('#delete-item absent ou caché après ouverture du menu');
    supprimer.click();

    out.dialogue_ouvert = typeof dialogue.open === 'boolean' ? dialogue.open : !dialogue.hidden;
    out.apres_ouverture = scanner(dialogue);

    var champ = document.getElementById('delete-confirm-input');
    champ.focus();
    out.champ_confirmation_focalisable = document.activeElement === champ;

    var annuler = document.getElementById('cancel-delete');
    annuler.click();
    out.dialogue_ferme = typeof dialogue.open === 'boolean' ? !dialogue.open : dialogue.hidden;
    out.apres_fermeture = scanner(null);

    out.mesure = { avant: out.avant, apres_ouverture: out.apres_ouverture, apres_fermeture: out.apres_fermeture };
  } catch (e) {
    out.erreur = String(e && e.stack || e);
  }
  document.title = JSON.stringify(out);
}());
""" % {"selecteur": _SELECTEUR_FOCALISABLE}


def construire_page(base_http):
    chemin_index = os.path.join(_ICI, "index.html")
    with open(chemin_index, "r", encoding="utf-8") as f:
        html_reel = f.read()
    m = re.search(r"<body>(.*)</body>", html_reel, re.S)
    if not m:
        raise RuntimeError("aucun <body> trouvé dans index.html")
    corps = m.group(1)
    corps = re.sub(r'<script src="/(diagramme\.js|app\.js)"></script>\s*', "", corps)
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

    dossier_isole = tempfile.mkdtemp(prefix="cc-test-f025-a11y-config-")
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
        with tempfile.TemporaryDirectory(prefix="cc-test-f025-a11y-page-") as dossier:
            fichier = os.path.join(dossier, "harnais.html")
            with open(fichier, "w", encoding="utf-8") as f:
                f.write(page)
            res = _lancer_navigateur([
                navigateur, "--headless", "--disable-gpu", "--no-sandbox",
                "--virtual-time-budget=3000", "--window-size=1400,900",
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
        print("ECHEC ATTEIGNABILITE : aucun <title> dans le DOM rendu — la page n'a "
              "pas exécuté son script (DOM de %d octets)" % len(dom))
        return 1
    brut = dom[debut + 7:fin]
    try:
        mesures = json.loads(_html.unescape(brut))
    except Exception as e:
        print("ECHEC ATTEIGNABILITE : <title> illisible (%s) : %s" % (e, brut[:400]))
        return 1
    if mesures.get("erreur"):
        print("ECHEC ATTEIGNABILITE : le script de la page a levé :\n%s" % mesures["erreur"])
        return 1

    avant = mesures["avant"]
    apres = mesures["apres_ouverture"]
    apres_fermeture = mesures["apres_fermeture"]
    print("[atteignabilité] candidats focalisables trouvés (avant) : %d" % avant["total_candidats"])
    print("[dérivé] atteignables AVANT ouverture : %d" % len(avant["atteignables"]))
    print("[dérivé] atteignables APRÈS ouverture : %d — %s"
          % (len(apres["atteignables"]), apres["atteignables"]))
    print("[dérivé] atteignables APRÈS fermeture : %d" % len(apres_fermeture["atteignables"]))

    check("atteignabilite_candidats_focalisables_trouves", avant["total_candidats"] > 5,
          "obtenu %d — le sélecteur ne trouve presque rien, la mesure serait vide de sens"
          % avant["total_candidats"])
    check("atteignabilite_hors_dialogue_AVANT_ouverture_non_nul", len(avant["atteignables"]) > 0,
          "0 contrôle atteignable même AVANT ouverture — la mesure « avant » serait invalide")
    check("atteignabilite_dialogue_reellement_ouvert", bool(mesures["dialogue_ouvert"]))

    check("F4b_zero_controle_atteignable_hors_delete_dialog_quand_ouvert",
          len(apres["atteignables"]) == 0,
          "%d contrôle(s) atteignable(s) hors modale : %s" % (len(apres["atteignables"]), apres["atteignables"]))
    check("F4b_champ_confirmation_reste_focalisable_pendant_l_ouverture",
          mesures["champ_confirmation_focalisable"])
    check("F4b_dialogue_reellement_ferme_par_annuler", bool(mesures["dialogue_ferme"]))
    check("F4b_fermeture_restaure_l_atteignabilite_hors_dialogue",
          len(apres_fermeture["atteignables"]) == len(avant["atteignables"]),
          "avant=%d, après fermeture=%d" % (len(avant["atteignables"]), len(apres_fermeture["atteignables"])))

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for nom in _echecs:
        print("  - %s" % nom)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
