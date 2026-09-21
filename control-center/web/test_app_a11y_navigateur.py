#!/usr/bin/env python3
"""F4b — CONTRAT D'ACCESSIBILITÉ, VOLET RUNTIME (feature-021, cycle 2, lot 5).

    python3 control-center/web/test_app_a11y_navigateur.py

Porte le critère chiffré de `bug-017` (absorbée dans ce cycle au titre
d'`ADR-0017`) : quand la porte d'authentification est ouverte, **compter**
les contrôles atteignables au clavier hors de la modale, et exiger **0**.
Relevé d'origine de l'auditeur (2026-09-15) : 2 en section par défaut,
jusqu'à 6 en « Développer ». Le lot 3 a livré le mécanisme structurel
(`inert` posé sur les frères de `#porte-jeton`, `test_app_bug017.js`) ; ce
fichier mesure l'EFFET, pas le mécanisme — la limite explicitement déclarée
par `test_app_bug017.js` lui-même : « le bac à sable `vm` ne modélise aucun
ordre de tabulation ».

Méthode — pourquoi `.focus()` plutôt qu'une lecture d'attributs
-----------------------------------------------------------------------------
Un candidat est déclaré « atteignable » si, après lui avoir appelé
`.focus()`, `document.activeElement === lui`. C'est le moteur de rendu réel
(Chromium) qui tranche — pas une relecture de `inert`/`hidden`/`tabindex`
recopiée à la main : `inert` retire un sous-arbre entier du focus, y compris
programmatique, et c'est justement ce que ni le bac à sable `vm` ni une
sonde d'attributs ne peuvent établir (PIEGES §15, §38).

Le DOM testé est le VRAI `index.html` (son `<body>` est repris tel quel,
octet pour octet, script de moins) : aucune reconstruction manuelle de la
topologie ne peut diverger de la structure réellement servie. `app.css`,
`diagramme.js` et `app.js` sont chargés depuis un VRAI serveur HTTP en
mémoire (même motif que `test_app_navigation_http.py`) — jamais lus en
`file://` (PIEGES §10) : c'est ce qui garantit que ce qui est mesuré est ce
qui est réellement SERVI, `_TYPES` compris. Seule la page ENVELOPPE (le
`<body>` copié + le script de mesure) est chargée en `file://` : la CSP
réellement servie (`default-src 'self'`) interdit tout script inline sur une
page servie par le vrai serveur (PIEGES §9) — la contourner reviendrait à
demander l'assouplissement de la politique, ce qu'aucun agent ne décide
(PIEGES §9, dernier paragraphe).

`ouvrirPorte("premier-acces")` est appelée DIRECTEMENT (la même fonction que
`verifierEtatAuth()` appelle sur un vrai 401) : la page envelope n'a pas de
réseau vers `/api/etat` (aucune CORS sur cette route), donc reproduire le
401 réel n'est pas nécessaire pour mesurer l'EFFET du mécanisme d'inertie,
déjà déclenché par le même point d'entrée que la production.

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


_SELECTEUR_FOCALISABLE = (
    "a[href], button, input, select, textarea, [tabindex], summary, "
    "audio[controls], video[controls]"
)

_SCRIPT_MESURE = """
(function () {
  var out = { erreur: null };
  try {
    function scanner() {
      var candidats = Array.prototype.slice.call(
        document.querySelectorAll(%(selecteur)r));
      var porte = document.getElementById('porte-jeton');
      var horsPorte = candidats.filter(function (n) {
        return !(porte && porte.contains(n));
      });
      var atteignables = [];
      horsPorte.forEach(function (n) {
        try { n.focus({ preventScroll: true }); } catch (e) {}
        if (document.activeElement === n) {
          atteignables.push(n.id ? ('#' + n.id)
            : (n.className ? ('.' + String(n.className).split(/\\s+/)[0]) : n.tagName));
        }
        // ⚠️ Mesuré en écrivant ce fichier (Chromium 152.0.7977.75) : SANS ce
        // `blur()`, un candidat resté actif « contamine » le test du candidat
        // SUIVANT — `document.activeElement === n2` pourrait rester vrai pour
        // le n2 précédent si `n.focus()` échoue silencieusement (élément déjà
        // inert), donnant un FAUX atteignable. Un scan qui ne blur jamais
        // entre deux candidats ne mesure pas 18 candidats indépendants, il
        // mesure une chaîne où chacun hérite parfois du focus du précédent.
        try { n.blur(); } catch (e) {}
      });
      return {
        total_candidats: candidats.length,
        hors_porte: horsPorte.length,
        atteignables: atteignables,
      };
    }

    if (typeof ouvrirPorte !== 'function' || typeof fermerPorte !== 'function') {
      throw new Error('ouvrirPorte/fermerPorte introuvables — app.js ne s appelle pas t il');
    }

    out.avant = scanner();

    // ------------------------------------------------------------------
    // Scénario déterminant : le focus est DÉJÀ posé dans la page (pas au
    // premier chargement, un 401 tardif via `sur401Lecture` peut survenir
    // pendant que l'utilisateur travaille) au moment où la porte s'ouvre.
    // C'est le cas qui a révélé, en écrivant ce fichier, que `inert` seul
    // NE RETIRE PAS le focus d'un élément déjà actif (voir le commentaire
    // daté dans `ouvrirPorte()`, app.js).
    // ------------------------------------------------------------------
    var focalisePreexistant = document.getElementById('kanban').closest('.kanban-viewport')
      || document.querySelector('.kanban-viewport');
    focalisePreexistant.focus({ preventScroll: true });
    out.preexistant_focalise_avant_ouverture = document.activeElement === focalisePreexistant;

    ouvrirPorte('premier-acces');
    // Vérifié IMMÉDIATEMENT après l'appel, avant tout autre `.focus()` de ce
    // script : c'est `ouvrirPorte()` elle-même qui doit avoir déplacé le
    // focus, pas une conséquence du scan qui suit.
    out.focus_preexistant_retire_immediatement_apres_ouverture =
      document.activeElement !== focalisePreexistant;

    out.apres_ouverture = scanner();

    var champ = document.getElementById('porte-champ');
    champ.focus();
    out.porte_champ_focalisable = document.activeElement === champ;
    out.porte_visible = document.getElementById('porte-jeton').hidden === false;

    fermerPorte();
    // ⚠️ Lu ICI, AVANT `scanner()` : `scanner()` teste (focus PUIS blur)
    // chaque candidat un par un, et son DERNIER `blur()` renvoie donc
    // `document.activeElement` à `<body>` par construction — le lire APRÈS
    // `scanner()` aurait effacé la restauration qu'on cherche justement à
    // observer, et fait passer une restauration réussie pour un échec.
    var actif = document.activeElement;
    out.focus_restaure_sur = actif ? (actif.id || actif.tagName) : null;
    out.apres_fermeture = scanner();
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
    # Les deux scripts de production sont retirés du corps copié : on les
    # recharge nous-mêmes, en HTTP, dans l'ordre qui compte (diagramme.js
    # AVANT app.js — `disposer()` doit exister avant que `app.js` s'exécute).
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

    # -- serveur RÉEL en mémoire, config par défaut (ouverte, aucun jeton
    # déclaré) : on n'a besoin ni de 401 ni de flux, `ouvrirPorte()` est
    # appelée directement (voir en-tête). -----------------------------------
    dossier_isole = tempfile.mkdtemp(prefix="cc-test-a11y-config-")
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
        # -- atteignabilité : app.css est RÉELLEMENT servi, en HTTP --------
        import urllib.request
        with urllib.request.urlopen(base + "/app.css", timeout=10) as reponse:
            check("atteignabilite_app_css_servi_200", reponse.status == 200,
                  "obtenu %d" % reponse.status)
            check("atteignabilite_app_css_type_mime_correct",
                  "text/css" in reponse.headers.get("Content-Type", ""),
                  reponse.headers.get("Content-Type"))

        page = construire_page(base)
        with tempfile.TemporaryDirectory(prefix="cc-test-a11y-page-") as dossier:
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
    print("[atteignabilité] candidats focalisables trouvés (avant) : %d, hors porte : %d"
          % (avant["total_candidats"], avant["hors_porte"]))
    print("[dérivé] atteignables AVANT ouverture : %d" % len(avant["atteignables"]))
    print("[dérivé] atteignables APRÈS ouverture : %d — %s"
          % (len(apres["atteignables"]), apres["atteignables"]))
    print("[dérivé] atteignables APRÈS fermeture : %d" % len(apres_fermeture["atteignables"]))
    print("[dérivé] focus déjà posé (kanban-viewport) avant ouverture : %s ; retiré immédiatement "
          "après `ouvrirPorte()` : %s" % (mesures["preexistant_focalise_avant_ouverture"],
                                           mesures["focus_preexistant_retire_immediatement_apres_ouverture"]))

    # -- ⚠️ Défaut trouvé EN ÉCRIVANT ce harnais, pas en relisant : Chromium
    # (152.0.7977.75) ne retire PAS le focus d'un élément déjà actif quand un
    # ancêtre devient `inert` a posteriori — corrigé dans `ouvrirPorte()`
    # (app.js, `blur()` explicite avant de poser `inert`). Ce cas est un 401
    # TARDIF (`sur401Lecture`), pas le premier chargement (où rien n'a encore
    # le focus) : sans lui, la mesure « zéro contrôle atteignable » ci-dessous
    # serait vraie pour la mauvaise raison — vraie seulement parce qu'aucun
    # scénario ne pose de focus avant l'ouverture. ---------------------------
    check("atteignabilite_focus_preexistant_reellement_pose_avant_ouverture",
          mesures["preexistant_focalise_avant_ouverture"],
          "le focus n'a pas pu être posé sur .kanban-viewport avant l'ouverture — "
          "le scénario ne teste rien")
    check("F4b_focus_deja_pose_est_retire_DES_L_OUVERTURE_pas_seulement_au_prochain_scan",
          mesures["focus_preexistant_retire_immediatement_apres_ouverture"],
          "un contrôle qui avait le focus AVANT l'ouverture le garde encore juste après "
          "l'appel à ouvrirPorte() — inert seul ne suffit pas, voir le commentaire daté "
          "dans app.js")

    # -- Atteignabilité bruyante : le mécanisme de comptage doit d'abord
    # trouver quelque chose — sinon un compte à zéro ne prouve rien, il
    # pourrait venir d'un sélecteur cassé plutôt que de `inert` (même
    # discipline que F8 : "12 graduations", jamais "0 partout"). ------------
    check("atteignabilite_candidats_focalisables_trouves", avant["total_candidats"] > 10,
          "obtenu %d — le sélecteur ne trouve presque rien, la mesure serait vide de sens"
          % avant["total_candidats"])
    check("atteignabilite_hors_porte_AVANT_ouverture_non_nul", len(avant["atteignables"]) > 0,
          "0 contrôle atteignable même AVANT ouverture : la porte est peut-être déjà "
          "ouverte au chargement, ce qui invaliderait la mesure « avant »")

    # -- Le critère chiffré de bug-017 --------------------------------------
    check("F4b_bug017_zero_controle_atteignable_hors_porte_quand_ouverte",
          len(apres["atteignables"]) == 0,
          "%d contrôle(s) atteignable(s) hors modale : %s" % (len(apres["atteignables"]), apres["atteignables"]))

    # -- La porte reste elle-même utilisable pendant qu'elle est ouverte ----
    check("F4b_porte_visible_quand_ouverte", mesures["porte_visible"])
    check("F4b_porte_champ_reste_focalisable_pendant_l_ouverture",
          mesures["porte_champ_focalisable"])

    # -- Non-régression : la fermeture restaure l'atteignabilité ------------
    check("F4b_fermeture_restaure_l_atteignabilite_hors_porte",
          len(apres_fermeture["atteignables"]) == len(avant["atteignables"]),
          "avant=%d, après fermeture=%d" % (len(avant["atteignables"]), len(apres_fermeture["atteignables"])))

    # -- « Le focus revient à un endroit NOMMÉ » (critère d'acceptation de
    # bug-017), jamais au hasard ni à <body> ---------------------------------
    check("F4b_focus_restaure_sur_un_element_nomme_a_la_fermeture",
          bool(mesures["focus_restaure_sur"]) and mesures["focus_restaure_sur"] != "BODY",
          "activeElement après fermeture : %r" % mesures["focus_restaure_sur"])

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for nom in _echecs:
        print("  - %s" % nom)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
