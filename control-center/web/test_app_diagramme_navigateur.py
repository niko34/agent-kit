#!/usr/bin/env python3
"""E7 (feature-020) — capture headless du DIAGRAMME, dans les DEUX thèmes,
comparée à la maquette de référence.

    python3 control-center/web/test_app_diagramme_navigateur.py

Mesuré (feature-020, brief) : `test_app_theme_navigateur.py` (56 cas) ne rend
JAMAIS le diagramme — ses pages ne chargent ni `diagramme.js` ni `app.js`,
et ne posent aucun élément `dg-*`. Ce fichier comble ce trou : il charge les
DEUX scripts RÉELS du kit (`file://`, jamais copiés ni modifiés — ADR-0006)
dans une page minimale, appelle `construireDiagramme()` (la même fonction
qu'`index.html` en production) sur une fixture littérale, et mesure le SVG
RÉELLEMENT peint par Chromium — pas une reconstruction dans le bac à sable
`vm` de `test_app_accordeon.js` (qui ne peut pas résoudre `oklch()`,
PIEGES.md §11).

Pourquoi une page maison plutôt que le vrai `index.html` servi par
`server.py` : `index.html` exige `/api/etat` (fetch + SSE) pour peupler
`#workflows` ; sous `file://` ces appels échouent proprement (rejet
asynchrone, pas d'exception synchrone) et n'empêchent pas la suite du
script de s'exécuter — mais piloter un cycle réel demanderait de démarrer le
serveur, ce que PIEGES.md §2/§4 réserve à des precautions que ce test n'a
pas besoin de payer : `construireDiagramme(wf, sigles)` est LE point d'entrée
que production et ce test appellent tous deux, à l'identique.

`$("filtre")` etc. (câblage de la barre de recherche, tout en bas d'`app.js`)
lèvent une exception au chargement faute des éléments attendus dans le DOM —
sans conséquence : ce sont des DÉCLARATIONS `function` (hoisted) qui nous
intéressent (`disposer`, `construireDiagramme`, `siglesAgents`,
`collecterRoles`), déjà définies avant que ce throw n'interrompe le reste du
script `app.js`. Un script suivant s'exécute normalement même si le
précédent a levé une exception non rattrapée (comportement standard des
balises `<script>` séquentielles).

Relation mesurée (défaut E, feature-020) : dans la maquette, l'anneau guide
et le contour nominal se distinguent par un jeton *toujours plus subtil pour
le guide* (`T.bd`, alpha .10 clair / .085 sombre) que pour le contour et les
graduations éteintes (`T.bd2`, alpha .19 clair / .16 sombre) — RECOPIÉ ICI
depuis le texte brut de la maquette, jamais recalculé depuis le kit. On
mesure que le kit respecte la MÊME direction (guide moins contrasté contre
le fond que le contour/graduation), sur la couleur RÉELLEMENT peinte
(canevas 2D, PIEGES.md §11 — `getComputedStyle` seul rendrait `oklch()` non
résolu), dans LES DEUX thèmes, et qu'aucune des deux couleurs n'est figée
(elles changent bien entre thème clair et thème sombre).

Saute proprement si aucun binaire Chromium n'est trouvé.

Écarts NON couverts par ce fichier (nommés, pas passés sous silence) :
- aucune comparaison PIXEL PAR PIXEL avec une capture PNG de la maquette
  elle-même (la maquette n'utilise pas les jetons du kit — seule la
  correspondance déclarée dans la spec est vérifiable, pas un diff d'image) ;
- le rendu de l'émoji "⏳" de la pastille d'attente dépend de la fonte
  installée sur la machine qui exécute le test (déjà noté item Q de la
  spec) — non mesuré ici ;
- la légende HTML (`.diagramme-legende`) et l'en-tête (`.dg-entete`) ne sont
  pas mesurés visuellement, seule leur présence structurelle l'est déjà par
  `test_app_accordeon.py`.
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

_ICI = os.path.dirname(os.path.abspath(__file__))
_APP_CSS = os.path.join(_ICI, "app.css")
_APP_JS = os.path.join(_ICI, "app.js")
_DIAGRAMME_JS = os.path.join(_ICI, "diagramme.js")
_MAQUETTE = os.path.join(
    os.path.dirname(_ICI), "maquettes", "2026-09-15-diagramme-reference.html")

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


_PAGE = """<!doctype html><html data-theme="%(theme)s"><head><meta charset="utf-8">
<link rel="stylesheet" href="file://%(css)s">
</head><body>
<div class="bloc" id="conteneur" style="width:640px"></div>
<canvas id="c" width="2" height="2"></canvas>
<pre id="salida"></pre>
<script src="file://%(diagramme_js)s"></script>
<script src="file://%(app_js)s"></script>
<script>
(function () {
  function passage(agent, debutIso, dureeMs, outils) {
    return {
      agent: agent, debut: debutIso, duree_ms: dureeMs, outils: outils || 0,
      fichiers: [], echecs: 0, termine: true, etat: undefined, type: "sousagent",
    };
  }
  var resultat = {};
  try {
    var passages = [
      passage("backend-developer", "2026-09-15T10:00:00.000Z", 5000, 0),
      passage("frontend-developer", "2026-09-15T10:00:00.000Z", 5000, 0),
      passage("test-engineer", "2026-09-15T10:10:00.000Z", 5000, 0),
    ];
    var wf = { segments: passages, passages: passages };
    var sigles = siglesAgents(Array.from(collecterRoles([wf])));
    var frag = construireDiagramme(wf, sigles);
    document.getElementById('conteneur').appendChild(frag);

    var svg = document.querySelector('.dg-svg');
    var guide = svg.querySelector('.dg-guide');
    var graduation = svg.querySelector('.dg-graduation');
    var cercle = svg.querySelector('.dg-cercle');
    var sigle = svg.querySelector('.dg-sigle');
    var lien = svg.querySelector('.dg-lien');
    var cadre = svg.querySelector('.dg-cadre-simultane');

    // G1 : taille de police RÉELLEMENT CALCULÉE (getComputedStyle), jamais
    // l'attribut ni la règle — c'est tout l'objet du défaut (une règle CSS
    // `.dg-socle-nom { font-size: 10.5px }` écrasait l'attribut de
    // présentation posé depuis `taillePx`). Le MÊME rôle « nom » a deux
    // tailles selon la forme du créneau : la fixture ci-dessus porte les
    // DEUX (créneau 0 empilé à 2 agents, créneau 1 simple à 1 agent) —
    // `.dg-socle-nom` apparaît donc 3 fois dans le DOM (empilé, empilé,
    // simple, dans l'ordre de peinture des créneaux) : les deux premiers
    // sont le nom EMPILÉ, le dernier le nom SIMPLE.
    var nomsEmpileEtSimple = Array.prototype.slice.call(svg.querySelectorAll('.dg-socle-nom'));
    var socleHeureSimple = svg.querySelector('.dg-socle-heure');
    var socleDureeSimple = svg.querySelector('.dg-socle-duree');
    var socleHeureDureeEmpile = svg.querySelector('.dg-socle-heure-duree');

    var ctx = document.getElementById('c').getContext('2d', {colorSpace: 'srgb'});
    function peindre(couleur) {
      ctx.clearRect(0, 0, 2, 2);
      ctx.fillStyle = couleur;
      ctx.fillRect(0, 0, 2, 2);
      var d = ctx.getImageData(0, 0, 1, 1).data;
      function h2(n) { return n.toString(16).padStart(2, '0'); }
      return '#' + h2(d[0]) + h2(d[1]) + h2(d[2]);
    }

    resultat = {
      surface: peindre(getComputedStyle(document.getElementById('conteneur')).backgroundColor),
      guideStroke: peindre(getComputedStyle(guide).stroke),
      graduationStroke: peindre(getComputedStyle(graduation).stroke),
      cercleStroke: peindre(getComputedStyle(cercle).stroke),
      sigleFill: peindre(getComputedStyle(sigle).fill),
      lienStroke: peindre(getComputedStyle(lien).stroke),
      cadrePresent: !!cadre,
      cadreFillAttr: cadre ? cadre.getAttribute('fill') : null,
      cadreRx: cadre ? cadre.getAttribute('rx') : null,
      fontSizeHeureSimple: socleHeureSimple ? getComputedStyle(socleHeureSimple).fontSize : null,
      fontSizeDureeSimple: socleDureeSimple ? getComputedStyle(socleDureeSimple).fontSize : null,
      fontSizeNomSimple: nomsEmpileEtSimple.length
        ? getComputedStyle(nomsEmpileEtSimple[nomsEmpileEtSimple.length - 1]).fontSize : null,
      fontSizeNomEmpile: nomsEmpileEtSimple.length
        ? getComputedStyle(nomsEmpileEtSimple[0]).fontSize : null,
      fontSizeHeureDureeEmpile: socleHeureDureeEmpile ? getComputedStyle(socleHeureDureeEmpile).fontSize : null,
      nomsSocleCount: nomsEmpileEtSimple.length,
      erreur: null,
    };
  } catch (e) {
    resultat = { erreur: e.name + ': ' + e.message };
  }
  document.getElementById('salida').textContent = JSON.stringify(resultat);
})();
</script>
</body></html>
"""

_RE_SALIDA_JSON = re.compile(r'<pre id="salida">(\{.*?\})</pre>', re.S)


def rendre_diagramme(navigateur, dossier, theme):
    page = _PAGE % {
        "theme": theme, "css": _APP_CSS,
        "diagramme_js": _DIAGRAMME_JS, "app_js": _APP_JS,
    }
    chemin = os.path.join(dossier, "page_diagramme_%s.html" % theme)
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(page)
    commande = [
        navigateur, "--headless", "--disable-gpu", "--no-sandbox",
        "--dump-dom", "file://" + chemin,
    ]
    resultat = subprocess.run(commande, capture_output=True, text=True, timeout=30)
    m = _RE_SALIDA_JSON.search(resultat.stdout)
    if not m:
        return None
    return json.loads(m.group(1))


def _srgb_vers_lineaire(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _luminance_relative(hexcolor):
    h = hexcolor.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return (0.2126 * _srgb_vers_lineaire(r) + 0.7152 * _srgb_vers_lineaire(g)
            + 0.0722 * _srgb_vers_lineaire(b))


def contraste(hex1, hex2):
    """Formule WCAG 2.1 — même calcul, reproduit indépendamment, que dans
    `test_app_theme_navigateur.py` et `test_app_theme.js`."""
    l1, l2 = _luminance_relative(hex1), _luminance_relative(hex2)
    clair, sombre = (l1, l2) if l1 > l2 else (l2, l1)
    return (clair + 0.05) / (sombre + 0.05)


def alphas_bd_bd2_maquette():
    """Lit LITTÉRALEMENT, depuis le texte de la maquette, l'alpha de `--bd`
    et `--bd2` dans chacun des DEUX blocs de thème explicite
    (`:root[data-theme="clair"]` n'existe pas dans ce fichier — le bloc
    racine SANS media query sert de clair par défaut ; `:root[data-theme=
    "sombre"]` est le second bloc `--bd2:`). Jamais recalculé : juste
    recopié puis parsé, pour comparer une DIRECTION (bd plus subtil que
    bd2), pas une valeur absolue."""
    with open(_MAQUETTE, "r", encoding="utf-8") as f:
        source = f.read()
    # `.10` / `.085` sont des fractions décimales (CSS `rgba(...,.10)` ==
    # alpha 0.10) — reconstruites en préfixant `0.`, jamais lues comme des
    # entiers bruts (`085` vaudrait alors 85, plus grand que `16`, et
    # inverserait la comparaison).
    alphas = [float("0." + m.group(1)) for m in re.finditer(r"--bd:rgba\([^)]*,\.(\d+)\)", source)]
    alphas2 = [float("0." + m.group(1)) for m in re.finditer(r"--bd2:rgba\([^)]*,\.(\d+)\)", source)]
    check("maquette_bd_et_bd2_trouves_au_moins_deux_fois_chacun",
          len(alphas) >= 2 and len(alphas2) >= 2,
          "bd=%r bd2=%r" % (alphas, alphas2))
    return alphas, alphas2


def main():
    navigateur = trouver_navigateur()
    if not navigateur:
        print("ℹ️  Aucun binaire Chromium trouvé (chromium / chromium-browser / "
              "google-chrome) — test_app_diagramme_navigateur.py SAUTÉ (E7 : "
              "mesure du diagramme RÉELLEMENT peint, nécessite un vrai moteur "
              "de rendu).")
        return 0

    # -- vérité terrain, recopiée depuis le texte de la maquette elle-même --
    alphas_bd, alphas_bd2 = alphas_bd_bd2_maquette()
    if alphas_bd and alphas_bd2:
        check("maquette_bd_toujours_plus_subtil_que_bd2",
              all(a < b for a, b in zip(sorted(alphas_bd), sorted(alphas_bd2))),
              "bd=%r bd2=%r" % (alphas_bd, alphas_bd2))

    with tempfile.TemporaryDirectory(prefix="cc-test-diagramme-navigateur-") as dossier:
        mesures = {}
        for theme in ("clair", "sombre"):
            m = rendre_diagramme(navigateur, dossier, theme)
            check("E7_%s_rendu_disponible" % theme, m is not None,
                  "--dump-dom n'a rien renvoyé")
            if m is None:
                continue
            check("E7_%s_aucune_erreur_js" % theme, m.get("erreur") is None,
                  "erreur : %r" % m.get("erreur"))
            mesures[theme] = m

        for theme, m in mesures.items():
            if m.get("erreur"):
                continue
            surface = m["surface"]

            # -- défaut E, sur la couleur RÉELLEMENT peinte : le guide doit
            # rester moins contrasté contre le fond que le contour nominal
            # ET que la graduation éteinte (les deux portent --trait, comme
            # le contour nominal de la maquette et sa graduation éteinte
            # portent tous deux T.bd2). --
            c_guide = contraste(m["guideStroke"], surface)
            c_graduation = contraste(m["graduationStroke"], surface)
            c_cercle = contraste(m["cercleStroke"], surface)
            check("E7_%s_guide_moins_contraste_que_graduation_eteinte" % theme,
                  c_guide < c_graduation,
                  "guide=%.3f:1 (%s) graduation=%.3f:1 (%s) sur fond %s"
                  % (c_guide, m["guideStroke"], c_graduation, m["graduationStroke"], surface))
            check("E7_%s_guide_moins_contraste_que_contour_nominal" % theme,
                  c_guide < c_cercle,
                  "guide=%.3f:1 (%s) contour=%.3f:1 (%s) sur fond %s"
                  % (c_guide, m["guideStroke"], c_cercle, m["cercleStroke"], surface))
            check("E7_%s_contour_nominal_et_graduation_eteinte_meme_jeton" % theme,
                  m["cercleStroke"] == m["graduationStroke"],
                  "contour=%s graduation=%s — les deux portent --trait, comme "
                  "T.bd2 dans la maquette" % (m["cercleStroke"], m["graduationStroke"]))

            check("E7_%s_cadre_simultane_present" % theme, m["cadrePresent"] is True)
            check("E7_%s_cadre_sans_aplat" % theme, m["cadreFillAttr"] == "none",
                  "obtenu fill=%r" % m["cadreFillAttr"])
            check("E7_%s_cadre_rx_9" % theme, m["cadreRx"] == "9",
                  "obtenu rx=%r" % m["cadreRx"])

            # -- G1 (revue code-reviewer, feature-020) : la taille de police
            # RÉELLEMENT CALCULÉE par Chromium (`getComputedStyle`), jamais
            # l'attribut de présentation ni une règle CSS recopiée — c'est le
            # défaut trouvé (`.dg-socle-nom { font-size: 10.5px }` écrasait
            # l'attribut posé depuis `taillePx`, y compris pour le nom
            # EMPILÉ qui doit valoir 11px). Valeurs recopiées À LA MAIN
            # depuis la maquette (l.188 nom simple, l.203 nom empilé),
            # jamais relues du contrat `disposer()`.
            check("G1_%s_nb_lignes_dg_socle_nom_attendu" % theme, m["nomsSocleCount"] == 3,
                  "obtenu " + str(m["nomsSocleCount"]) + " — la fixture doit porter 2 agents "
                  "empilés + 1 agent simple pour distinguer les deux tailles du même rôle")
            check("G1_%s_heure_simple_10_5px" % theme, m["fontSizeHeureSimple"] == "10.5px",
                  "obtenu " + repr(m["fontSizeHeureSimple"]))
            check("G1_%s_duree_simple_12_5px" % theme, m["fontSizeDureeSimple"] == "12.5px",
                  "obtenu " + repr(m["fontSizeDureeSimple"]))
            check("G1_%s_nom_simple_10_5px" % theme, m["fontSizeNomSimple"] == "10.5px",
                  "obtenu " + repr(m["fontSizeNomSimple"]))
            check("G1_%s_heure_duree_empile_11_5px" % theme, m["fontSizeHeureDureeEmpile"] == "11.5px",
                  "obtenu " + repr(m["fontSizeHeureDureeEmpile"]))
            check("G1_%s_nom_empile_11px" % theme, m["fontSizeNomEmpile"] == "11px",
                  "obtenu " + repr(m["fontSizeNomEmpile"]))
            # Le point précis du défaut : même RÔLE (nom), même CLASSE CSS
            # (`.dg-socle-nom`), taille RÉELLEMENT calculée différente selon
            # la forme du créneau — épinglé nommément, pas juste "différent".
            check("G1_%s_nom_simple_et_nom_empile_reellement_distincts" % theme,
                  m["fontSizeNomSimple"] != m["fontSizeNomEmpile"]
                  and m["fontSizeNomSimple"] == "10.5px" and m["fontSizeNomEmpile"] == "11px",
                  "simple=%r empilé=%r" % (m["fontSizeNomSimple"], m["fontSizeNomEmpile"]))

        # -- aucune couleur figée : le passage clair -> sombre doit changer
        # les quatre couleurs mesurées (sinon un littéral aurait remplacé
        # une variable, feature-020 §C4/plan de test manuel item 5). --
        if "clair" in mesures and "sombre" in mesures:
            mc, ms = mesures["clair"], mesures["sombre"]
            if not mc.get("erreur") and not ms.get("erreur"):
                for cle in ("guideStroke", "graduationStroke", "cercleStroke", "sigleFill", "lienStroke"):
                    check("E7_%s_change_entre_les_deux_themes" % cle,
                          mc[cle] != ms[cle],
                          "clair=%s sombre=%s — identique d'un thème à l'autre : "
                          "couleur probablement figée" % (mc[cle], ms[cle]))

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for e in _echecs:
        print("  - " + e)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
