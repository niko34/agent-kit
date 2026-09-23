#!/usr/bin/env python3
"""F14/F8bis — l'anneau d'activité SOUS `prefers-reduced-motion` (feature-021,
cycle 2, lot 8, ADR-0031 §5).

    python3 control-center/web/test_app_anneau_reduit_navigateur.py

Pourquoi ce fichier existe
-----------------------------------------------------------------------------
`test_conformite_animations.js` (F14) garde la PRÉSENCE et le TEXTE du bloc
`@media (prefers-reduced-motion: reduce)` — jamais son EFFET. Mesuré au
navigateur (Chromium, `--force-prefers-reduced-motion`) pendant ce lot : le
sélecteur `*` seul, tel qu'il vivait avant ce lot, NE COUVRE PAS les
pseudo-éléments. Un `animation` posé sur `.agent-node::before` (l'anneau
d'activité, lot 8) survit intégralement à `* { animation: none !important }`
— `animationName` calculé du pseudo-élément reste le nom de la keyframe, pas
`none`. Aucune garde existante ne pouvait le voir : `test_conformite_
animations.js` ne lit que le TEXTE de la règle, jamais l'effet sur un
pseudo-élément ; `test_app_diagramme_navigateur.py` n'émule délibérément pas
`reduced-motion` (voir son en-tête). Ce fichier ferme ce trou précis, sans
dupliquer les deux autres.

Ce que ce fichier vérifie, et RIEN de plus
-----------------------------------------------------------------------------
Sous `prefers-reduced-motion: reduce` RÉELLEMENT ÉMULÉ (flag Chromium
`--force-prefers-reduced-motion`, PIEGES §12 : sans rapport avec l'inversion
du thème sombre/clair, ce flag-ci n'a qu'un sens) :
  - l'anneau (`.agent-node.state-active::before`) ne tourne plus
    (`animation-name` calculé == `none`) ;
  - l'arc reste néanmoins VISIBLE et distinct de 0°/360° (`--progress` ==
    `270deg`) : l'état final reste compréhensible sans mouvement (F14).

Saute proprement si aucun binaire Chromium n'est trouvé.
"""

HARNAIS_NAVIGATEUR = True

import os
import shutil
import subprocess
import sys
import tempfile

ICI = os.path.dirname(os.path.abspath(__file__))

_tests = 0
_echecs = []


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


_PAGE = """<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file://%(css)s">
</head><body>
<div class="bloc" id="conteneur" style="width:400px"></div>
<script src="file://%(diagramme_js)s"></script>
<script src="file://%(app_js)s"></script>
<script>
(function () {
  var out = { erreur: null };
  try {
    var passages = [
      { agent: "backend-developer", debut: "2026-09-21T10:00:00.000Z",
        duree_ms: 5000, outils: 0, fichiers: [], echecs: 0, termine: false,
        type: "sousagent" },
    ];
    var wf = { segments: passages, passages: passages };
    var sigles = siglesAgents(Array.from(collecterRoles([wf])));
    // `construireDiagramme` SUPPRIMÉE (feature-028, lot C1, accordéon
    // « Cycles » retiré) : retargeté vers `construireGrapheAgents`, le
    // point d'entrée bas niveau qu'elle enveloppait — MÊME rendu, celui que
    // `rendreGrapheCyclePrincipal` (la production) appelle aussi.
    var geo = disposer(wf.segments);
    document.getElementById('conteneur').appendChild(construireGrapheAgents(geo, sigles, null));
    var noeud = document.querySelector('.agent-node');
    var avant = getComputedStyle(noeud, '::before');
    out.classes = noeud.className;
    out.progress = getComputedStyle(noeud).getPropertyValue('--progress').trim();
    out.avant_animation_name = avant.animationName;
    out.avant_animation_duration = avant.animationDuration;
  } catch (e) {
    out.erreur = String((e && e.stack) || e);
  }
  document.title = JSON.stringify(out);
}());
</script>
</body></html>"""


def main():
    navigateur = trouver_navigateur()
    if not navigateur:
        print("ℹ️  Aucun binaire Chromium trouvé (chromium / chromium-browser / "
              "google-chrome) — harnais sauté.")
        return 0

    for nom in ("app.css", "app.js", "diagramme.js"):
        chemin = os.path.join(ICI, nom)
        if not os.path.exists(chemin) or os.path.getsize(chemin) == 0:
            print("ECHEC ATTEIGNABILITE : %s est absent ou vide à %s" % (nom, chemin))
            return 1

    page = _PAGE % {
        "css": os.path.join(ICI, "app.css"),
        "app_js": os.path.join(ICI, "app.js"),
        "diagramme_js": os.path.join(ICI, "diagramme.js"),
    }

    with tempfile.TemporaryDirectory() as tmp:
        fichier = os.path.join(tmp, "harnais.html")
        with open(fichier, "w", encoding="utf-8") as f:
            f.write(page)
        res = _lancer_navigateur(
            [navigateur, "--headless", "--disable-gpu", "--no-sandbox",
            "--force-prefers-reduced-motion",
            "--virtual-time-budget=3000", "--window-size=800,600",
            "--dump-dom", "file://" + fichier])

    if res.returncode != 0:
        print("ECHEC : Chromium a rendu le code %d\n%s" % (res.returncode, res.stderr[-2000:]))
        return 1

    dom = res.stdout
    debut = dom.find("<title>")
    fin = dom.find("</title>")
    if debut < 0 or fin < 0:
        print("ECHEC ATTEIGNABILITE : aucun <title> dans le DOM rendu — la page "
              "n'a pas exécuté son script (DOM de %d octets)" % len(dom))
        return 1

    import html as _html
    import json
    brut = dom[debut + 7:fin]
    try:
        m = json.loads(_html.unescape(brut))
    except Exception as e:
        print("ECHEC ATTEIGNABILITE : <title> illisible (%s) : %s" % (e, brut[:400]))
        return 1

    if m.get("erreur"):
        print("ECHEC ATTEIGNABILITE : le script de la page a levé :\n%s" % m["erreur"])
        return 1

    print("[dérivé] classes=%r --progress=%r ::before animation-name=%r duration=%r"
          % (m["classes"], m["progress"], m["avant_animation_name"], m["avant_animation_duration"]))

    check("atteignabilite_disque_actif_trouve", "state-active" in m["classes"],
          "classes obtenues : %r" % m["classes"])
    check("F14_anneau_ne_tourne_plus_sous_reduced_motion",
          m["avant_animation_name"] == "none",
          "animation-name calculé du pseudo-élément = %r (si ce n'est pas `none`, "
          "l'anneau continue de tourner sous préférence réduite, silencieusement — "
          "`*` seul ne couvre pas `::before`)" % m["avant_animation_name"])
    check("F14_arc_reste_visible_et_distinct_sous_reduced_motion",
          m["progress"] == "270deg",
          "--progress calculé = %r (devrait rester `270deg` : l'état actif reste "
          "compréhensible sans mouvement, distinct de 0°/360°)" % m["progress"])

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for e in _echecs:
        print("  - %s" % e)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
