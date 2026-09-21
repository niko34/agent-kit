#!/usr/bin/env python3
"""E1 (feature-015) — la couleur RÉELLEMENT PEINTE, mesurée dans un vrai
moteur de rendu, pas la règle CSS.

    python3 control-center/web/test_app_theme_navigateur.py

Un choix explicite (`data-theme="clair"` / `"sombre"` posé DIRECTEMENT dans le
HTML servi à Chromium, jamais via `theme.js`) doit gagner contre la
préférence système **dans les deux sens**. `getComputedStyle` seul ne suffit
pas dès qu'un jeton est déclaré en `oklch()` : ce build de Chromium sérialise
`oklch()` tel quel sans le résoudre en `rgb()` (mesuré — voir la note
d'implémentation de feature-015). On passe donc systématiquement par un
canevas 2D (`fillStyle` + `fillRect` + `getImageData`) : c'est la couleur
RÉELLEMENT composée à l'écran, jamais une sérialisation de texte CSS.

Neutralisation du piège documenté (`theme.js` écrase un `data-theme` posé à
la main) : ce test ne charge JAMAIS `theme.js`. La page de test pose
`data-theme` directement dans le HTML statique, sans script d'amorçage —
la règle CSS seule est donc ce qui est mesuré.

`--blink-settings=preferredColorScheme=` vaut **0 pour sombre et 1 pour
clair** — l'inverse de l'intuition (mesuré, voir la note d'implémentation).

Saute proprement si aucun binaire Chromium n'est trouvé (`chromium`,
`chromium-browser`, `google-chrome`) — Chromium n'est une dépendance que de
CE harnais, pas du centre de contrôle lui-même (ADR-0006).
"""

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

# bug-022 : marqueur de MODULE (pas le nom du fichier) declarant ce harnais
# comme lanceur de navigateur. Mesure : `*_navigateur.py` n'attrape que 2 des
# 3 harnais qui lancent Chromium -- `test_app_navigation_http.py` n'a pas ce
# suffixe et le lance quand meme. Le marqueur, lui, meurt AVEC le fichier :
# `feature-021` supprimera CE fichier (le thème sombre), et sa ligne
# HARNAIS_NAVIGATEUR partira avec lui, sans rien a editer ailleurs. Lu par
# `control-center/backend/test_ci_partition_navigateur.py` et par le job
# `centre-de-controle-matrice` (`.github/workflows/hygiene-specs.yml`), qui
# l'exclut de la matrice Python -- ce fichier vaut un rendu Chromium, pas une
# version de l'interpreteur.
HARNAIS_NAVIGATEUR = True

_ICI = os.path.dirname(os.path.abspath(__file__))
_APP_CSS = os.path.join(_ICI, "app.css")

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


_PAGE = """<!doctype html><html%(attr)s><head><meta charset="utf-8">
<link rel="stylesheet" href="file://%(css)s">
</head><body>
<canvas id="c" width="2" height="2"></canvas>
<pre id="salida"></pre>
<script>
var ctx = document.getElementById('c').getContext('2d', {colorSpace: 'srgb'});
var val = getComputedStyle(document.body).backgroundColor;
ctx.fillStyle = val;
ctx.fillRect(0, 0, 2, 2);
var d = ctx.getImageData(0, 0, 1, 1).data;
function h2(n) { return n.toString(16).padStart(2, '0'); }
document.getElementById('salida').textContent = '#' + h2(d[0]) + h2(d[1]) + h2(d[2]);
</script>
</body></html>
"""

_RE_SALIDA = re.compile(r'<pre id="salida">(#[0-9a-fA-F]{6})</pre>')


def couleur_peinte(navigateur, dossier, data_theme, preference_systeme_sombre):
    """Rend `data_theme` (None, "clair" ou "sombre") sous la préférence
    système donnée, et retourne la couleur de fond RÉELLEMENT peinte."""
    attr = ' data-theme="%s"' % data_theme if data_theme else ""
    page = _PAGE % {"attr": attr, "css": _APP_CSS}
    nom_fichier = "page_%s_%s.html" % (data_theme or "aucun",
                                        "sombre" if preference_systeme_sombre else "clair")
    chemin = os.path.join(dossier, nom_fichier)
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(page)

    # 0 = sombre, 1 = clair — inversé par rapport à l'intuition (mesuré).
    valeur_scheme = "0" if preference_systeme_sombre else "1"
    commande = [
        navigateur, "--headless", "--disable-gpu", "--no-sandbox",
        "--blink-settings=preferredColorScheme=" + valeur_scheme,
        "--dump-dom", "file://" + chemin,
    ]
    resultat = _lancer_navigateur(commande)
    m = _RE_SALIDA.search(resultat.stdout)
    if not m:
        return None
    return m.group(1)


_RE_SALIDA_JSON = re.compile(r'<pre id="salida">(\{.*?\})</pre>', re.S)

# feature-016 (item 12) — les quatre badges d'état, avec leur classe RÉELLE
# (`app.css`) dans un `.bloc` (le fond sur lequel ils sont effectivement
# posés — voir `.bloc { background: var(--surface); }`, pas `--fond`, qui
# habille la page derrière). Même méthode que `_PAGE` ci-dessus (canevas 2D) :
# `border-color` peut, comme `background-color`, transiter par une
# indirection non triviale (`color-mix`, cascade `[data-theme]`) — mesurer la
# couleur RÉELLEMENT peinte, jamais supposer qu'un jeton résolu à la main
# donnerait le même résultat.
_PAGE_ETATS = """<!doctype html><html%(attr)s><head><meta charset="utf-8">
<link rel="stylesheet" href="file://%(css)s">
</head><body>
<div class="bloc">
  <span class="cycle-etat en-cours" id="e-en-cours"><span class="glyphe">●</span> en cours</span>
  <span class="cycle-etat termine" id="e-termine"><span class="glyphe">✓</span> terminé</span>
  <span class="cycle-etat sans-cloture" id="e-sans-cloture"><span class="glyphe">⋯</span> sans clôture</span>
  <span class="cycle-etat indetermine" id="e-indetermine"><span class="glyphe">?</span> indéterminé</span>
  <!-- Revue : badge et chaîne doivent dessiner le MÊME motif pour le MÊME
       état (`dotted`), et JAMAIS le motif réservé au RÔLE (`dashed` sur
       `.principal`) — les trois mesurés ici, style RÉELLEMENT calculé. -->
  <span class="maillon sans-cloture" id="m-sans-cloture"><span class="mnom">x</span></span>
  <span class="maillon principal" id="m-principal"><span class="mnom">x</span></span>
</div>
<canvas id="c" width="2" height="2"></canvas>
<pre id="salida"></pre>
<script>
var ctx = document.getElementById('c').getContext('2d', {colorSpace: 'srgb'});
function peindre(couleur) {
  ctx.fillStyle = couleur;
  ctx.fillRect(0, 0, 2, 2);
  var d = ctx.getImageData(0, 0, 1, 1).data;
  function h2(n) { return n.toString(16).padStart(2, '0'); }
  return '#' + h2(d[0]) + h2(d[1]) + h2(d[2]);
}
var resultat = {};
resultat.surface = peindre(getComputedStyle(document.querySelector('.bloc')).backgroundColor);
['e-en-cours', 'e-termine', 'e-sans-cloture', 'e-indetermine'].forEach(function (id) {
  var el = document.getElementById(id);
  resultat[id] = peindre(getComputedStyle(el).borderTopColor);
  // Revue : le libellé (texte) doit lui aussi tenir son propre seuil
  // (4,5:1) — c'est LUI qui rend acceptable un contour hors WCAG.
  resultat[id + '-texte'] = peindre(getComputedStyle(el).color);
});
resultat['m-sans-cloture-style'] = getComputedStyle(document.getElementById('m-sans-cloture')).borderTopStyle;
resultat['m-principal-style'] = getComputedStyle(document.getElementById('m-principal')).borderTopStyle;
resultat['e-sans-cloture-style'] = getComputedStyle(document.getElementById('e-sans-cloture')).borderTopStyle;
document.getElementById('salida').textContent = JSON.stringify(resultat);
</script>
</body></html>
"""


def mesures_etats(navigateur, dossier, data_theme):
    """Rend les quatre badges d'état sous `data-theme` et retourne un dict
    des couleurs RÉELLEMENT peintes (fond de `.bloc` + contour de chacun)."""
    page = _PAGE_ETATS % {"attr": ' data-theme="%s"' % data_theme, "css": _APP_CSS}
    chemin = os.path.join(dossier, "page_etats_%s.html" % data_theme)
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(page)
    commande = [
        navigateur, "--headless", "--disable-gpu", "--no-sandbox",
        "--dump-dom", "file://" + chemin,
    ]
    resultat = _lancer_navigateur(commande)
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
    """Formule WCAG 2.1 publique (indépendante du projet) — même calcul que
    `contraste()` dans `test_app_theme.js`, reproduit ici pour rester une
    mesure indépendante sur la couleur réellement peinte, pas sur un
    hexadécimal résolu à la main."""
    l1, l2 = _luminance_relative(hex1), _luminance_relative(hex2)
    clair, sombre = (l1, l2) if l1 > l2 else (l2, l1)
    return (clair + 0.05) / (sombre + 0.05)


# feature-016 (item 13) — le libellé d'état ne se tronque jamais, à AUCUNE
# largeur, y compris 360px (le plus étroit auquel `.bloc` est réellement
# soumis : `.grille` passe à une seule colonne sous 900px — voir `app.css`,
# `@media (max-width: 900px)` — et rien en dessous ne contraint davantage un
# `.bloc`). C'est la condition de validité du contour de « terminé »
# (1,20:1, mesuré ci-dessus) : illisible seul, acceptable UNIQUEMENT parce
# que le mot reste toujours lisible.
#
# ⚠️ À 360px, le badge le plus long (« sans clôture ») tient très
# large — un test qui se contenterait de mesurer la géométrie à cette seule
# largeur ne verrait donc RIEN si quelqu'un ajoutait, par erreur,
# `overflow: hidden` / `text-overflow: ellipsis` / `white-space: nowrap` sur
# `.cycle-etat` : rien ne déborderait encore à 360px, la garde tomberait sans
# que ce test ne bronche. La mesure porte donc sur les propriétés
# RÉELLEMENT calculées (`getComputedStyle`) du badge ET de sa chaîne de
# parents jusqu'à `.bloc` — c'est CE mécanisme, pas une géométrie qui ne le
# révèle qu'à une largeur hypothétique jamais atteinte en pratique, que
# `white-space: normal` (app.css, `.cycle-etat`) est censé garantir. Une
# géométrie réelle à 360px (aucun débordement propre du badge) complète la
# mesure sans s'y substituer.
_PAGE_LARGEUR = """<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file://%(css)s">
<style>body { margin: 0; }</style>
</head><body>
<section class="bloc" id="bloc360" style="width:360px;box-sizing:border-box;">
  <ul class="cycles">
    <li class="cycle">
      <h3 class="cycle-entete">
        <button type="button" class="cycle-bouton">
          <span class="cycle-etat sans-cloture" id="badge">
            <span class="glyphe">⋯</span> sans clôture
          </span>
          <span class="cycle-designation">08:00:00 — session entière</span>
        </button>
      </h3>
    </li>
  </ul>
</section>
<pre id="salida"></pre>
<script>
var badge = document.getElementById('badge');
var chaine = [badge, badge.closest('.cycle-bouton'), badge.closest('.cycle-entete'),
              badge.closest('.cycle'), badge.closest('.cycles'), badge.closest('.bloc')];
var proprietesTronquantes = chaine.map(function (el) {
  var cs = getComputedStyle(el);
  return { overflow: cs.overflow, textOverflow: cs.textOverflow, whiteSpace: cs.whiteSpace };
});
var resultat = {
  proprietesTronquantes: proprietesTronquantes,
  scrollWidthBadge: badge.scrollWidth,
  clientWidthBadge: badge.clientWidth,
  texte: badge.textContent.replace(/\\s+/g, ' ').trim(),
};
document.getElementById('salida').textContent = JSON.stringify(resultat);
</script>
</body></html>
"""


def mesures_largeur(navigateur, dossier):
    page = _PAGE_LARGEUR % {"css": _APP_CSS}
    chemin = os.path.join(dossier, "page_largeur.html")
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(page)
    commande = [
        navigateur, "--headless", "--disable-gpu", "--no-sandbox",
        "--dump-dom", "file://" + chemin,
    ]
    resultat = _lancer_navigateur(commande)
    m = _RE_SALIDA_JSON.search(resultat.stdout)
    if not m:
        return None
    return json.loads(m.group(1))


def hex_litteral(nom_variable):
    """Lit UN littéral du bloc `:root` d'`app.css` par son nom exact — pas de
    dépendance à la logique de résolution des jetons, pour rester une mesure
    indépendante de ce que `test_app_theme.js` calcule déjà."""
    with open(_APP_CSS, "r", encoding="utf-8") as f:
        css = f.read()
    m = re.search(r"--%s:\s*(#[0-9a-fA-F]{6});" % re.escape(nom_variable), css)
    if not m:
        raise AssertionError("littéral --%s introuvable dans app.css" % nom_variable)
    return m.group(1).lower()


# feature-019/bug-016 (E6, ADR-0017) : contraste des jetons de TEXTE sur les
# QUATRE surfaces, mesuré sur la couleur RÉELLEMENT peinte — pas le littéral
# résolu à la main (`test_app_theme.js`, E7, fait déjà ce calcul ; ce test-ci
# mesure le rendu réel, seul capable de révéler une divergence entre le
# bloc `[data-theme]` et un éventuel second bloc de règles qui s'en écarte —
# c'est exactement la faute déjà commise une fois sur ce fichier : deux
# endroits qui divergent, un seul corrigé). `.bloc` est le fond réel sur
# lequel `--texte-faible`/`--texte-doux` apparaissent le plus souvent
# (mentions secondaires dans un bloc) ; `--surface-2` et `--creux` sont
# mesurés via des `div` dédiés, faute d'un sélecteur existant qui les pose
# tous deux comme fond direct.
_PAGE_TEXTE = """<!doctype html><html%(attr)s><head><meta charset="utf-8">
<link rel="stylesheet" href="file://%(css)s">
</head><body>
<div style="background: var(--fond)" id="d-fond"><span class="fil-ariane" id="t-fond-faible">x</span></div>
<div class="bloc" id="d-surface"><span class="fil-ariane" id="t-surface-faible">x</span></div>
<div style="background: var(--surface-2)" id="d-surface-2"><span class="fil-ariane" id="t-surface-2-faible">x</span></div>
<div style="background: var(--creux)" id="d-creux"><span class="fil-ariane" id="t-creux-faible">x</span></div>
<canvas id="c" width="2" height="2"></canvas>
<pre id="salida"></pre>
<script>
var ctx = document.getElementById('c').getContext('2d', {colorSpace: 'srgb'});
function peindre(couleur) {
  ctx.fillStyle = couleur;
  ctx.fillRect(0, 0, 2, 2);
  var d = ctx.getImageData(0, 0, 1, 1).data;
  function h2(n) { return n.toString(16).padStart(2, '0'); }
  return '#' + h2(d[0]) + h2(d[1]) + h2(d[2]);
}
var resultat = {};
['fond', 'surface', 'surface-2', 'creux'].forEach(function (nom) {
  resultat[nom + '-surface'] = peindre(getComputedStyle(document.getElementById('d-' + nom)).backgroundColor);
  resultat[nom + '-texte-faible'] = peindre(getComputedStyle(document.getElementById('t-' + nom + '-faible')).color);
});
document.getElementById('salida').textContent = JSON.stringify(resultat);
</script>
</body></html>
"""


def mesures_texte(navigateur, dossier, data_theme):
    page = _PAGE_TEXTE % {"attr": ' data-theme="%s"' % data_theme, "css": _APP_CSS}
    chemin = os.path.join(dossier, "page_texte_%s.html" % data_theme)
    with open(chemin, "w", encoding="utf-8") as f:
        f.write(page)
    commande = [
        navigateur, "--headless", "--disable-gpu", "--no-sandbox",
        "--dump-dom", "file://" + chemin,
    ]
    resultat = _lancer_navigateur(commande)
    m = _RE_SALIDA_JSON.search(resultat.stdout)
    if not m:
        return None
    return json.loads(m.group(1))


def main():
    navigateur = trouver_navigateur()
    if not navigateur:
        print("ℹ️  Aucun binaire Chromium trouvé (chromium / chromium-browser / "
              "google-chrome) — test_app_theme_navigateur.py SAUTÉ (E1 : "
              "mesure sur la couleur réellement peinte, nécessite un vrai "
              "moteur de rendu).")
        return 0

    fond_clair = hex_litteral("clair-fond")
    fond_sombre = hex_litteral("sombre-fond")
    check("prealable_fond_clair_et_sombre_distincts", fond_clair != fond_sombre,
          "%s vs %s" % (fond_clair, fond_sombre))

    with tempfile.TemporaryDirectory(prefix="cc-test-theme-navigateur-") as dossier:
        # -- les deux sens du choix explicite (le cœur de l'acceptation E1) --
        obtenu = couleur_peinte(navigateur, dossier, "clair", preference_systeme_sombre=True)
        check("E1_clair_explicite_gagne_sous_systeme_sombre", obtenu == fond_clair,
              "attendu %s, obtenu %s" % (fond_clair, obtenu))

        obtenu = couleur_peinte(navigateur, dossier, "sombre", preference_systeme_sombre=False)
        check("E1_sombre_explicite_gagne_sous_systeme_clair", obtenu == fond_sombre,
              "attendu %s, obtenu %s" % (fond_sombre, obtenu))

        # -- témoins positifs : sans choix explicite, le système décide seul --
        # (si CES cas échouaient alors que les deux ci-dessus passent, la
        # mesure elle-même serait suspecte — jamais vu, gardé par prudence.)
        obtenu = couleur_peinte(navigateur, dossier, None, preference_systeme_sombre=True)
        check("temoin_aucun_choix_systeme_sombre_donne_le_fond_sombre", obtenu == fond_sombre,
              "attendu %s, obtenu %s" % (fond_sombre, obtenu))

        obtenu = couleur_peinte(navigateur, dossier, None, preference_systeme_sombre=False)
        check("temoin_aucun_choix_systeme_clair_donne_le_fond_clair", obtenu == fond_clair,
              "attendu %s, obtenu %s" % (fond_clair, obtenu))

        # -- même sens que le système : les deux DEVRAIENT coïncider, mais on
        # le mesure quand même plutôt que de le supposer --
        obtenu = couleur_peinte(navigateur, dossier, "sombre", preference_systeme_sombre=True)
        check("E1_sombre_explicite_sous_systeme_sombre_aussi", obtenu == fond_sombre,
              "attendu %s, obtenu %s" % (fond_sombre, obtenu))

        obtenu = couleur_peinte(navigateur, dossier, "clair", preference_systeme_sombre=False)
        check("E1_clair_explicite_sous_systeme_clair_aussi", obtenu == fond_clair,
              "attendu %s, obtenu %s" % (fond_clair, obtenu))

        # -- feature-016 (item 12) : contraste des contours ET des libellés --
        # -- d'état, sur la couleur RÉELLEMENT peinte, dans les DEUX thèmes --
        # ⚠️ Marge testée à 3,5:1 pour les contours (pas 3,0:1, le plancher
        # WCAG 1.4.11 : à 3,0 pile, un arrondi déciderait du verdict) et
        # 4,5:1 pour les libellés (texte normal, WCAG 1.4.3) — GARDÉS
        # ENSEMBLE ici, jamais l'un sans l'autre (revue) : c'est le libellé
        # qui rend acceptable un contour hors plancher (« terminé »), les
        # deux seuils protègent donc la MÊME promesse.
        contour_etat_clair = hex_litteral("clair-contour-etat")
        contour_etat_sombre = hex_litteral("sombre-contour-etat")
        for theme in ("clair", "sombre"):
            mesures = mesures_etats(navigateur, dossier, theme)
            if mesures is None:
                check("item12_" + theme + "_mesure_disponible", False,
                      "--dump-dom n'a rien renvoyé pour le thème " + theme)
                continue
            surface = mesures["surface"]
            # Jeton EXACT attendu pour CE thème (revue : retirer
            # `--contour-etat` du bloc sombre ne fait chuter aucun contraste
            # sous 3,5 — le repli sur le littéral clair reste, par hasard,
            # conforme — seule une comparaison à la valeur EXACTE le révèle).
            contour_etat_attendu = contour_etat_clair if theme == "clair" else contour_etat_sombre

            for etat in ("en-cours", "sans-cloture", "indetermine"):
                cle = "e-" + etat
                c_contour = contraste(mesures[cle], surface)
                check("item12_" + theme + "_contour_" + etat + "_marge_3_5",
                      c_contour >= 3.5,
                      "%.2f:1 (%s contre %s)" % (c_contour, mesures[cle], surface))
                c_texte = contraste(mesures[cle + "-texte"], surface)
                check("item12_" + theme + "_libelle_" + etat + "_marge_4_5",
                      c_texte >= 4.5,
                      "%.2f:1 (%s contre %s)" % (c_texte, mesures[cle + "-texte"], surface))

            for etat in ("sans-cloture", "indetermine"):
                cle = "e-" + etat
                check("item12_" + theme + "_" + etat + "_jeton_contour_etat_exact_pour_le_theme",
                      mesures[cle] == contour_etat_attendu,
                      "obtenu %s, attendu --%s-contour-etat = %s"
                      % (mesures[cle], theme, contour_etat_attendu))

            # Témoin, PAS une exigence WCAG : le contour de « terminé » est
            # délibérément sous le plancher (voir le commentaire d'`app.css`,
            # `.cycle-etat.termine`) — acceptable UNIQUEMENT parce que le
            # libellé, lui, tient son propre seuil (vérifié ci-dessus). Si ce
            # témoin se mettait à passer ≥ 3,5, la justification écrite dans
            # `app.css` serait devenue fausse SANS que personne ne l'ait mise
            # à jour — un signal, pas un verdict bloquant à lui seul.
            c_termine = contraste(mesures["e-termine"], surface)
            check("item12_" + theme + "_contour_termine_reste_sous_le_plancher_temoin",
                  c_termine < 3.5,
                  "%.2f:1 (%s contre %s) — si ce témoin échoue, le commentaire "
                  "d'app.css sur .cycle-etat.termine est à jour ou à corriger"
                  % (c_termine, mesures["e-termine"], surface))
            c_texte_termine = contraste(mesures["e-termine-texte"], surface)
            check("item12_" + theme + "_libelle_termine_marge_4_5",
                  c_texte_termine >= 4.5,
                  "%.2f:1 (%s contre %s)" % (c_texte_termine, mesures["e-termine-texte"], surface))

            # Revue, point mineur 3 : badge et chaîne dessinent le MÊME motif
            # pour « sans clôture » (`dotted`), et JAMAIS celui réservé au
            # RÔLE (`dashed` sur `.principal`) — épinglé sur les TROIS
            # valeurs, pas seulement « badge == chaîne ».
            check("item13_" + theme + "_badge_sans_cloture_est_dotted",
                  mesures["e-sans-cloture-style"] == "dotted",
                  "obtenu : %r" % mesures["e-sans-cloture-style"])
            check("item13_" + theme + "_maillon_sans_cloture_est_dotted",
                  mesures["m-sans-cloture-style"] == "dotted",
                  "obtenu : %r" % mesures["m-sans-cloture-style"])
            check("item13_" + theme + "_maillon_principal_reste_dashed_distinct",
                  mesures["m-principal-style"] == "dashed",
                  "obtenu : %r" % mesures["m-principal-style"])

        # -- feature-016 (item 13) : le libellé d'état ne se tronque jamais --
        mesures_l = mesures_largeur(navigateur, dossier)
        if mesures_l is None:
            check("item13_mesure_disponible", False, "--dump-dom n'a rien renvoyé")
        else:
            check("item13_libelle_present_en_entier_a_360px",
                  mesures_l["texte"] == "⋯ sans clôture",
                  "obtenu : %r" % mesures_l["texte"])
            check("item13_badge_ne_deborde_pas_de_lui_meme_a_360px",
                  mesures_l["scrollWidthBadge"] <= mesures_l["clientWidthBadge"] + 1,
                  "scrollWidth=%spx clientWidth=%spx"
                  % (mesures_l["scrollWidthBadge"], mesures_l["clientWidthBadge"]))
            # Épinglé maillon par maillon de la chaîne badge → .bloc — un
            # SEUL ancêtre qui tronquerait suffit à couper le libellé dès
            # qu'une largeur plus contraignante que 360px se présente
            # ailleurs (fenêtre étroite, zoom navigateur…).
            noms_chaine = ["badge", ".cycle-bouton", ".cycle-entete", ".cycle", ".cycles", ".bloc"]
            for nom, props in zip(noms_chaine, mesures_l["proprietesTronquantes"]):
                check("item13_%s_n_a_pas_overflow_hidden_ni_clip" % nom,
                      props["overflow"] not in ("hidden", "clip"),
                      "overflow=%r sur %s" % (props["overflow"], nom))
                check("item13_%s_pas_de_text_overflow_ellipsis" % nom,
                      props["textOverflow"] != "ellipsis",
                      "text-overflow=%r sur %s" % (props["textOverflow"], nom))
            # `white-space: normal` est la garde EXPLICITEMENT posée sur le
            # badge lui-même (app.css, commentaire de `.cycle-etat`) — c'est
            # elle que ce test protège en premier lieu.
            check("item13_badge_white_space_normal",
                  mesures_l["proprietesTronquantes"][0]["whiteSpace"] == "normal",
                  "obtenu : %r" % mesures_l["proprietesTronquantes"][0]["whiteSpace"])

        # -- E6 (feature-019/bug-016, ADR-0017) : --texte-faible RÉELLEMENT --
        # -- peint contre les QUATRE surfaces RÉELLEMENT peintes, dans les ---
        # -- deux thèmes — pas le littéral résolu à la main. -----------------
        for theme in ("clair", "sombre"):
            mesures_t = mesures_texte(navigateur, dossier, theme)
            if mesures_t is None:
                check("E6_" + theme + "_mesure_texte_disponible", False,
                      "--dump-dom n'a rien renvoyé")
                continue
            for surface in ("fond", "surface", "surface-2", "creux"):
                c = contraste(mesures_t[surface + "-texte-faible"], mesures_t[surface + "-surface"])
                check("E6_" + theme + "_texte_faible_peint_contre_" + surface,
                      c >= 4.5,
                      "%.2f:1 (%s contre %s)"
                      % (c, mesures_t[surface + "-texte-faible"], mesures_t[surface + "-surface"]))

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for e in _echecs:
        print("  - " + e)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
