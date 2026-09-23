#!/usr/bin/env python3
"""A1 — les onglets « Cycle actif »/« Historique » SÉLECTIONNENT réellement un
cycle, garde de NON-RÉGRESSION PAR EXÉCUTION (feature-028, lot A).

    python3 control-center/web/test_app_onglets_cycles_navigateur.py

Pourquoi ce fichier existe
-----------------------------------------------------------------------------
Mesuré le 2026-09-23 (feature-028, lot précédent) : les deux boutons
`.tab-button` de `.cycle-tabs` (« Cycle actif »/« Historique ») et le bouton
`#cycle-indice` avaient TOUT l'aspect d'un contrôle actif — `<button>`,
`aria-pressed`, un `aria-label` dédié — sans PORTER AUCUN gestionnaire
d'événement (`grep tab-button|cycle-tabs` sur `app.js` : 0 résultat).
`choisirCycleAffiche()` ne rendait jamais que le cycle en cours ou le plus
récent. Rien dans le DOM statique ni dans un test qui ne lirait que le
MARKUP ne pouvait le voir — seule la recherche explicite d'un gestionnaire,
ou l'exécution réelle d'un clic, l'établit (même défaut de méthode que
`feature-027` documente : vérifier la lettre, pas la chose).

Ce fichier est la garde qui manquait : elle CLIQUE réellement les trois
contrôles dans un vrai moteur de rendu et vérifie que le cycle AFFICHÉ (son
diagramme peint, son titre, son statut) change en conséquence — jamais
seulement qu'un attribut `aria-pressed` bascule.

Méthode
-----------------------------------------------------------------------------
Même architecture que `test_app_u1_navigateur.py` : `app.css`/`diagramme.js`/
`app.js` servis par un vrai serveur HTTP en mémoire (PIEGES §10), la page
enveloppe (CSP oblige, PIEGES §9) chargée en `file://`, le corps HTML de la
page enveloppe est le VRAI `<body>` d'`index.html` — les deux nouveaux id
(`cycle-tab-actif`/`cycle-tab-historique`) sont donc réellement présents,
jamais reconstruits à la main.

Trois cycles FABRIQUÉS, comptes de segments DISTINCTS (1, 2, 3) pour que le
nombre de disques peints (`.agent-node`) dans `#cycle-canvas` prouve que le
CONTENU change, pas seulement une étiquette : un test qui ne lirait que
`#cycle-indice.textContent` pourrait rester aveugle à un rendu qui ne
suivrait pas réellement la sélection (même patron d'exigence que §30 PIEGES).

Saute proprement si Chromium OU `node` est introuvable.
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
  try {
    function segments(n, prefixe) {
      var liste = [];
      for (var i = 0; i < n; i++) {
        liste.push({
          type: "sousagent", agent: prefixe + "-" + i,
          debut: "2026-09-18T09:00:" + String(i).padStart(2, "0") + ".000Z",
          duree_ms: 1000, outils: 1, fichiers: [], echecs: 0,
          termine: true, etat: "termine",
        });
      }
      return liste;
    }
    // Le plus RÉCENT en tête une fois `.slice().reverse()` appliqué par
    // `choisirCycleAffiche` : `etat.workflows` est donc donné du PLUS ANCIEN
    // au PLUS RÉCENT, comme le fait le vrai backend (append-only).
    var wfAncien = {
      workflow_id: "w-ancien", indice_cycle: 1,
      debut: "2026-09-18T09:00:00.000Z", fin_observee: "2026-09-18T09:05:00.000Z",
      bornage: "session-entiere", borne_par: null,
      segments: segments(3, "old"), passages: segments(3, "old"),
      cycles_total: 3, evenements_hors_session: 0,
    };
    var wfMoyen = {
      workflow_id: "w-moyen", indice_cycle: 2,
      debut: "2026-09-19T09:00:00.000Z", fin_observee: "2026-09-19T09:05:00.000Z",
      bornage: "session-entiere", borne_par: null,
      segments: segments(2, "mid"), passages: segments(2, "mid"),
      cycles_total: 3, evenements_hors_session: 0,
    };
    var wfRecent = {
      workflow_id: "w-recent", indice_cycle: 3,
      debut: "2026-09-20T09:00:00.000Z", fin_observee: "2026-09-20T09:05:00.000Z",
      bornage: "session-entiere", borne_par: null,
      segments: segments(1, "new"), passages: segments(1, "new"),
      cycles_total: 3, evenements_hors_session: 0,
    };
    dernierEtat = {
      workflows: [wfAncien, wfMoyen, wfRecent],
      cycles_total: 3, evenements_hors_session: 0,
      git: { depot: false, touches: [] }, agents: [],
    };
    rendreGrapheCyclePrincipal(dernierEtat);

    function etatCourant() {
      return {
        indice: document.getElementById("cycle-indice").textContent,
        disques: document.querySelectorAll("#cycle-canvas .agent-node").length,
        ongletActifPresse: document.getElementById("cycle-tab-actif").getAttribute("aria-pressed"),
        ongletHistoriquePresse: document.getElementById("cycle-tab-historique").getAttribute("aria-pressed"),
        indiceDisabled: document.getElementById("cycle-indice").getAttribute("aria-disabled"),
      };
    }

    // -- 1. état initial : mode "actif", le plus récent (1 disque) ---------
    out.initial = etatCourant();

    // -- 2. clic sur "Historique" : bascule de mode, RESTE sur le même -----
    //    cycle (le plus récent) au premier passage — rien ne doit changer
    //    de LUI-MÊME au simple changement de mode.
    document.getElementById("cycle-tab-historique").click();
    out.apresClicHistorique = etatCourant();

    // -- 3. clic sur #cycle-indice, en mode historique : recule d'UN cycle,
    //    vers une position NON PAR DÉFAUT (w-moyen, Cycle #2) — c'est cette
    //    position précise que les étapes 4/5 vérifient comme PERSISTÉE.
    document.getElementById("cycle-indice").click();
    out.apresUnClicIndice = etatCourant();

    // -- 4. retour à "Cycle actif" : reprend le plus récent, INDÉPENDAMMENT -
    //    de la position atteinte en historique (Cycle #2 encore parquée).
    document.getElementById("cycle-tab-actif").click();
    out.apresRetourActif = etatCourant();

    // -- 5. re-bascule en Historique : la position choisie AVANT (Cycle #2) -
    //    doit avoir SURVÉCU à l'aller-retour — même patron que `cycleOuvert`
    //    (accordéon) : un choix déjà fait reste tant que le cycle existe.
    document.getElementById("cycle-tab-historique").click();
    out.apresRebasculeHistorique = etatCourant();

    // -- 6. un second clic depuis Cycle #2 : recule vers Cycle #1 (le plus -
    //    ancien) — prouve que la position REPREND d'où elle était, pas d'un
    //    repli par défaut.
    document.getElementById("cycle-indice").click();
    out.apresDeuxiemeClicIndice = etatCourant();

    // -- 7. un troisième clic : boucle vers le plus récent (Cycle #3) ------
    document.getElementById("cycle-indice").click();
    out.apresTroisiemeClicIndice = etatCourant();
  } catch (e) {
    out.erreur = (e && e.stack) || String(e);
  }
  document.title = JSON.stringify(out);
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
    if not shutil.which("node"):
        print("ℹ️  `node` introuvable — harnais sauté (cohérence avec les gardes soeurs).")
        return 0

    for nom in ("app.css", "app.js", "diagramme.js", "index.html"):
        chemin = os.path.join(_ICI, nom)
        if not os.path.exists(chemin) or os.path.getsize(chemin) == 0:
            print("ECHEC ATTEIGNABILITE : %s est absent ou vide à %s" % (nom, chemin))
            return 1

    dossier_isole = tempfile.mkdtemp(prefix="cc-test-onglets-cycles-config-")
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
        with tempfile.TemporaryDirectory(prefix="cc-test-onglets-cycles-page-") as dossier:
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

    # -- 1. état initial : mode "actif", le cycle le plus récent (1 segment) -
    initial = m["initial"]
    check("A1_initial_mode_actif_presse", initial["ongletActifPresse"] == "true",
          "obtenu %r" % initial)
    check("A1_initial_mode_historique_pas_presse", initial["ongletHistoriquePresse"] == "false")
    check("A1_initial_cycle_le_plus_recent", initial["indice"] == "Cycle #3",
          "obtenu %r" % initial["indice"])
    check("A1_initial_un_seul_disque", initial["disques"] == 1,
          "obtenu %d disque(s)" % initial["disques"])
    check("A1_initial_indice_desactive_en_mode_actif", initial["indiceDisabled"] == "true")

    # -- 2. bascule en Historique : MÊME cycle qu'avant, rien ne bouge seul -
    apres_h = m["apresClicHistorique"]
    check("A1_bascule_historique_onglet_presse", apres_h["ongletHistoriquePresse"] == "true")
    check("A1_bascule_historique_onglet_actif_relache", apres_h["ongletActifPresse"] == "false")
    check("A1_bascule_historique_meme_cycle_quaupavant",
          apres_h["indice"] == "Cycle #3" and apres_h["disques"] == 1,
          "obtenu %r" % apres_h)
    check("A1_bascule_historique_indice_devient_parcourable",
          apres_h["indiceDisabled"] == "false")

    # -- 3. #cycle-indice RECULE réellement vers une position non par défaut -
    un_clic = m["apresUnClicIndice"]
    check("A1_un_clic_indice_recule_vers_cycle_2",
          un_clic["indice"] == "Cycle #2" and un_clic["disques"] == 2,
          "obtenu %r" % un_clic)

    # -- 4. retour à "Cycle actif" : reprend le plus récent, PAS la position -
    #    atteinte en historique (les deux modes restent INDÉPENDANTS).
    retour_actif = m["apresRetourActif"]
    check("A1_retour_actif_reprend_le_plus_recent",
          retour_actif["indice"] == "Cycle #3" and retour_actif["disques"] == 1,
          "obtenu %r" % retour_actif)
    check("A1_retour_actif_indice_redevient_desactive",
          retour_actif["indiceDisabled"] == "true")

    # -- 5. re-bascule en Historique : la position choisie AVANT (Cycle #2) -
    #    a SURVÉCU à l'aller-retour, jamais retombée sur le défaut.
    rebascule = m["apresRebasculeHistorique"]
    check("A1_rebascule_historique_position_persistee",
          rebascule["indice"] == "Cycle #2" and rebascule["disques"] == 2,
          "obtenu %r — la position choisie en Historique doit survivre à un "
          "aller-retour par Cycle actif (même patron que cycleOuvert)" % rebascule)

    # -- 6. depuis Cycle #2, un clic de plus recule vers le plus ancien -----
    deuxieme = m["apresDeuxiemeClicIndice"]
    check("A1_deuxieme_clic_indice_recule_vers_cycle_1",
          deuxieme["indice"] == "Cycle #1" and deuxieme["disques"] == 3,
          "obtenu %r" % deuxieme)

    # -- 7. un troisième clic boucle vers le plus récent --------------------
    troisieme = m["apresTroisiemeClicIndice"]
    check("A1_troisieme_clic_indice_boucle_vers_cycle_3",
          troisieme["indice"] == "Cycle #3" and troisieme["disques"] == 1,
          "obtenu %r" % troisieme)

    print("\n" + str(_tests) + " cas, " + str(len(_echecs)) + " echec(s)")
    for e in _echecs:
        print("  - " + e)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
