#!/usr/bin/env python3
"""F8/F15/F16 — capture headless du NOUVEAU graphe d'agents (feature-021,
lot 4), mesurée sur ce que Chromium PEINT réellement.

    python3 control-center/web/test_app_diagramme_navigateur.py

Pourquoi ce fichier existe, et pourquoi il a été RÉÉCRIT plutôt que supprimé
-----------------------------------------------------------------------------
Le lot 4 a remplacé la grammaire du diagramme (socle, bandes de rayon,
graduations data-dépendantes) par celle du prototype Material 3 (disque de
88 px, 3 états, 12 graduations fixes). L'ancien harnais mesurait un invariant
de contraste entre `--trait-fin` et `--trait`, deux jetons que le lot 4
supprime : ses ASSERTIONS étaient donc réellement périmées.

Son HARNAIS, lui, ne l'était pas. C'est lui qui avait attrapé, EN EXÉCUTANT,
deux défauts que la relecture n'avait pas vus — la consolidation de
`--trait-fin` au lot 2, et la casse du rendu par retrait des jetons au lot 3.
Le supprimer laissait le livrable le plus complexe du cycle sans aucune
vérification au niveau de l'exécution : les 40 cas de `test_app_diagramme.js`
portent sur `disposer()`, une fonction PURE, qui ne sait rien de ce qui est
peint.

Ce que ce fichier couvre, et que RIEN d'autre ne couvre
-----------------------------------------------------------------------------
Tout ce qui n'existe qu'une fois la cascade CSS appliquée :

- F8  : l'anneau d'activité est réellement animé (`animation-name` calculé),
        les 12 graduations sont réellement 12 nœuds peints, les 3 pastilles
        de fichiers se DISTINGUENT à l'œil (opacité calculée) et pas
        seulement par une classe ;
- F15 : aucun `.token-value` n'existe dans l'arbre, et le sigle restant est
        optiquement CENTRÉ — le disque est dégradable sans être à trous,
        ce qui se mesure en comparant les boîtes réelles, pas en relisant
        `place-content: center` ;
- F16 : les quatre représentations sont VISIBLES. Un échec change réellement
        la couleur peinte ET porte un glyphe réellement rendu ; « sans
        clôture » se distingue de l'échec par la couleur ET par le glyphe ;
        l'agent principal porte un anneau réellement dessiné ; et les
        libellés ne se chevauchent pas, mesuré sur les RECTANGLES RÉELS
        rendus par le moteur, jamais en recalculant la formule de
        `disposer()` (qui ne prouverait que sa propre cohérence).

La leçon du lot 3 s'applique ici : une garde qui constate qu'une classe est
posée vérifie le MÉCANISME. Ce fichier vérifie le RÉSULTAT.

Méthode
-----------------------------------------------------------------------------
On charge les DEUX scripts RÉELS du kit (`file://`, jamais copiés ni modifiés
— `ADR-0006`) et la feuille RÉELLE dans une page minimale, on appelle
`construireGrapheAgents(disposer(segments), sigles, null)` — LE point
d'entrée bas niveau que la production appelle aussi (`rendreGrapheCycle
Principal`, app.js) — et on lit `getComputedStyle` / `getBoundingClientRect`.
⚠️ Retargeté (feature-028, lot C1) : ce fichier appelait `construireDiagramme()`,
une enveloppe autour de `construireGrapheAgents()` propre à l'accordéon
« Cycles », retirée avec lui — le rendu peint (ce que CE fichier vérifie)
est rigoureusement identique, `construireDiagramme` n'ajoutait qu'une note
de contexte textuelle jamais mesurée ici.

Écarts NON couverts, nommés plutôt que tus :
- aucune comparaison pixel par pixel avec le prototype (il n'utilise pas les
  jetons du kit ; seule la correspondance déclarée est vérifiable) ;
- `prefers-reduced-motion` n'est pas émulé ici : la PRÉSENCE du bloc est
  gardée statiquement par `test_conformite_animations.js`
  (`F14_bloc_prefers_reduced_motion_present`), et ce fichier vérifie la
  proposition complémentaire — qu'en mode normal l'animation s'applique
  VRAIMENT, sans quoi la supprimer sous `reduced-motion` ne voudrait rien
  dire ;
- la fonte utilisée pour les glyphes dépend de la machine : on mesure que le
  glyphe occupe une largeur NON NULLE et que les deux glyphes diffèrent,
  jamais leur forme.

Saute proprement si aucun binaire Chromium n'est trouvé.
"""

HARNAIS_NAVIGATEUR = True

import json
import os
import shutil
import subprocess
import sys
import tempfile

ICI = os.path.dirname(os.path.abspath(__file__))

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


_PAGE = """<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="file://%(css)s">
</head><body>
<div class="bloc" id="conteneur" style="width:1200px"></div>
<script src="file://%(diagramme_js)s"></script>
<script src="file://%(app_js)s"></script>
<script>
(function () {
  function passage(o) {
    return {
      agent: o.agent, debut: o.debut, duree_ms: o.duree_ms || 5000,
      outils: o.outils || 0, fichiers: o.fichiers || [],
      echecs: o.echecs || 0, termine: o.termine !== false,
      etat: o.etat, type: o.type || "sousagent",
    };
  }
  function peindre(passages) {
    var conteneur = document.getElementById('conteneur');
    conteneur.innerHTML = '';
    var wf = { segments: passages, passages: passages };
    var sigles = siglesAgents(Array.from(collecterRoles([wf])));
    conteneur.appendChild(construireGrapheAgents(disposer(wf.segments), sigles, null));
    return conteneur;
  }
  function boite(n) {
    var r = n.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height,
             cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
  }
  function calc(n, prop) { return getComputedStyle(n).getPropertyValue(prop).trim(); }
  function pseudo(n, prop) { return getComputedStyle(n, '::before').getPropertyValue(prop).trim(); }

  // Ecretage du canevas (lot 4) : la boite ENGLOBANTE de tout ce qui
  // appartient a un agent -- disque, anneau de role, drapeau, nom, duree --
  // par les rectangles REELLEMENT peints, jamais par un recalcul de la
  // formule de `disposer()` (PIEGES, "un test qui delegue a la fonction
  // sous test peut rester aveugle a sa propre divergence"). Le canevas de
  // reference est lui aussi lu sur le DOM reel (`.graphe-scroll`, qui
  // ecrete verticalement via `overflow-y: hidden`, app.css), jamais
  // recalcule depuis `geo.hauteur`.
  function boiteAgent(noeud) {
    var wrap = noeud.closest('.agent-wrap');
    var elements = [noeud];
    var ring = wrap.querySelector('.role-ring'); if (ring) elements.push(ring);
    var flag = wrap.querySelector('.agent-flag'); if (flag) elements.push(flag);
    var nom = wrap.querySelector('.agent-name'); if (nom) elements.push(nom);
    var duree = wrap.querySelector('.agent-duration'); if (duree) elements.push(duree);
    var rects = elements.map(function (n) { return n.getBoundingClientRect(); });
    return {
      top: Math.min.apply(null, rects.map(function (r) { return r.top; })),
      bottom: Math.max.apply(null, rects.map(function (r) { return r.bottom; })),
      left: Math.min.apply(null, rects.map(function (r) { return r.left; })),
      right: Math.max.apply(null, rects.map(function (r) { return r.right; })),
    };
  }
  // Union de TOUT ce qui est reellement trace : agents ET connecteurs. La
  // version precedente unissait les seuls elements d'un AGENT (disque,
  // anneau, drapeau, nom, duree) -- un arc de reprise, qui n'appartient a
  // aucun agent mais relie deux passages, restait donc HORS du perimetre
  // mesure, et c'est exactement par la qu'il a ete tronque de 62 px sans
  // qu'aucune garde ne bouge. Une garde ne couvre que ce que son enonce
  // NOMME ; un enonce qui enumere laisse dehors ce qu'il n'a pas liste.
  // `getBoundingClientRect()` n'inclut NI `box-shadow` NI `outline`. Le halo
  // d'echec est precisement un `box-shadow: 0 0 0 6px` (app.css l.633) et le
  // focus un `outline: 3px` avec `outline-offset` : deux debordements reels
  // qu'une union de rectangles ne voit pas. On gonfle donc le rectangle de
  // leur extension verticale, lue sur le style CALCULE.
  // Limite declaree : on traite la forme simple `<dx> <dy> <flou> <etendue>`,
  // non-`inset`, eventuellement repetee — celle qu'emploie la feuille. Une
  // forme `inset` (qui ne deborde pas) ou une notation exotique retomberait
  // sur 0, donc sous-estimerait : le sens de l'erreur est signale ici.
  function debordementOmbre(n) {
    var st = getComputedStyle(n);
    var v = 0;
    var ombre = st.boxShadow;
    if (ombre && ombre !== 'none' && ombre.indexOf('inset') === -1) {
      ombre.split(/,(?![^(]*\))/).forEach(function (part) {
        var l = (part.match(/-?[0-9.]+px/g) || []).map(parseFloat);
        if (l.length >= 3) v = Math.max(v, Math.abs(l[1]) + l[2] + (l[3] || 0));
      });
    }
    if (st.outlineStyle && st.outlineStyle !== 'none') {
      v = Math.max(v, parseFloat(st.outlineWidth || 0) + parseFloat(st.outlineOffset || 0));
    }
    return v;
  }
  function boiteTracee(conteneur) {
    var rects = [];
    Array.prototype.forEach.call(conteneur.querySelectorAll('.agent-node'),
      function (n) {
        rects.push(boiteAgent(n));
        // L'ombre et l'outline appartiennent au DISQUE seul, pas aux
        // libelles : on gonfle le rectangle du noeud, jamais l'union deja
        // etendue par `.agent-name`/`.agent-duration` — sinon on inventerait
        // 6 px de debordement sous une etiquette qui n'en porte aucun.
        var e = debordementOmbre(n);
        if (e > 0) {
          var r = n.getBoundingClientRect();
          rects.push({ top: r.top - e, bottom: r.bottom + e,
                       left: r.left - e, right: r.right + e });
        }
      });
    Array.prototype.forEach.call(conteneur.querySelectorAll('.connector-layer path'),
      function (n) {
        var r = n.getBoundingClientRect();
        rects.push({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
      });
    if (!rects.length) return null;
    return {
      top: Math.min.apply(null, rects.map(function (r) { return r.top; })),
      bottom: Math.max.apply(null, rects.map(function (r) { return r.bottom; })),
      elements: rects.length,
    };
  }
  function canevasBoite() {
    var r = document.querySelector('.graphe-scroll').getBoundingClientRect();
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }

  var out = { erreur: null };
  try {
    // --- scenario 1 : un cycle ordinaire, un agent actif -------------------
    var c = peindre([
      passage({ agent: "backend-developer", debut: "2026-09-21T10:00:00.000Z",
                termine: false, fichiers: ["a", "b"] }),
    ]);
    var noeud = c.querySelector('.agent-node');
    out.actif = {
      classes: noeud.className,
      orbite_presente: !!noeud.querySelector('.work-orbit'),
      orbite_animation: calc(noeud.querySelector('.work-orbit'), 'animation-name'),
      orbite_duree: calc(noeud.querySelector('.work-orbit'), 'animation-duration'),
      graduations: noeud.querySelectorAll('.tool-ticks i').length,
      graduation_animation: calc(noeud.querySelector('.tool-ticks i'), 'animation-name'),
      pastilles: noeud.querySelectorAll('.file-dots i').length,
      opacites: Array.prototype.map.call(
        noeud.querySelectorAll('.file-dots i'), function (i) { return calc(i, 'opacity'); }),
      sigle_texte: noeud.querySelector('.agent-code').textContent,
      sigle_boite: boite(noeud.querySelector('.agent-code')),
      noeud_boite: boite(noeud),
      face_enfants: noeud.querySelector('.agent-face').children.length,
      token_value: document.querySelectorAll('.token-value').length,
      diametre: calc(noeud, 'width') + ' x ' + calc(noeud, 'height'),
      agent_boite: boiteAgent(noeud),
      canevas_boite: canevasBoite(),
      // Anneau d'activite pilote par `--progress` (lot 8, ADR-0031 §5) :
      // arc FIXE (jamais un pourcentage), peint sur le pseudo-element
      // DEDIE `::before`, mis en mouvement SEUL -- jamais `.agent-node`
      // lui-meme (le sigle et les pastilles tourneraient avec).
      anneau_progress: calc(noeud, '--progress'),
      anneau_avant_anime: pseudo(noeud, 'animation-name'),
      disque_anime: calc(noeud, 'animation-name'),
      anneau_avant_fond: pseudo(noeud, 'background-image'),
    };

    // --- scenario 2 : echec ------------------------------------------------
    c = peindre([
      passage({ agent: "test-engineer", debut: "2026-09-21T10:00:00.000Z", echecs: 2 }),
    ]);
    noeud = c.querySelector('.agent-node');
    var drapeauE = noeud.querySelector('.agent-flag');
    out.echec = {
      classes: noeud.className,
      state_color: calc(noeud, '--state-color'),
      danger: calc(document.documentElement, '--danger'),
      drapeau_classe: drapeauE ? drapeauE.className : null,
      drapeau_boite: drapeauE ? boite(drapeauE) : null,
      drapeau_couleur: drapeauE ? calc(drapeauE, 'color') : null,
      glyphe: drapeauE ? pseudo(drapeauE, 'content') : null,
      graduation_couleur: calc(noeud.querySelector('.tool-ticks i'), 'background-color'),
      agent_boite: boiteAgent(noeud),
      canevas_boite: canevasBoite(),
      // Meme passage `termine: true` par defaut => etat "done" : l'anneau
      // doit etre COMPLET et STABLE (360deg, aucune animation), meme en
      // echec (l'echec ne fait que RECOLORER l'anneau, jamais varier son
      // ouverture -- ADR-0031 §3/§5, deux dimensions distinctes).
      anneau_progress: calc(noeud, '--progress'),
      anneau_avant_anime: pseudo(noeud, 'animation-name'),
    };

    // --- scenario 3 : sans cloture ----------------------------------------
    c = peindre([
      passage({ agent: "doc-writer", debut: "2026-09-21T10:00:00.000Z", etat: "sans_cloture" }),
    ]);
    noeud = c.querySelector('.agent-node');
    var drapeauS = noeud.querySelector('.agent-flag');
    out.sans_cloture = {
      classes: noeud.className,
      state_color: calc(noeud, '--state-color'),
      drapeau_classe: drapeauS ? drapeauS.className : null,
      drapeau_boite: drapeauS ? boite(drapeauS) : null,
      drapeau_couleur: drapeauS ? calc(drapeauS, 'color') : null,
      glyphe: drapeauS ? pseudo(drapeauS, 'content') : null,
      drapeau_bordure: drapeauS ? calc(drapeauS, 'border-top-style') : null,
      agent_boite: boiteAgent(noeud),
      canevas_boite: canevasBoite(),
    };

    // --- scenario 4 : agent principal --------------------------------------
    c = peindre([
      passage({ agent: "claude", debut: "2026-09-21T10:00:00.000Z", type: "principal" }),
    ]);
    noeud = c.querySelector('.agent-node');
    var anneau = noeud.querySelector('.role-ring');
    out.principal = {
      classes: noeud.className,
      anneau_present: !!anneau,
      anneau_boite: anneau ? boite(anneau) : null,
      anneau_style: anneau ? calc(anneau, 'border-top-style') : null,
      anneau_largeur: anneau ? calc(anneau, 'border-top-width') : null,
      noeud_boite: boite(noeud),
      agent_boite: boiteAgent(noeud),
      canevas_boite: canevasBoite(),
    };

    // --- scenario 5 : non-chevauchement des libelles, sur boites REELLES ---
    // Noms de longueurs tres inegales, enchaines : c'est le cas ou la
    // reservation de `disposer()` doit se voir.
    var noms = ["a", "security-reviewer", "b", "frontend-developer",
                "c", "ux-ui-designer", "backend-developer"];
    var suite = noms.map(function (n, i) {
      return passage({ agent: n,
                       debut: new Date(Date.UTC(2026, 8, 21, 10, i * 5, 0)).toISOString() });
    });
    c = peindre(suite);
    var libelles = Array.prototype.map.call(c.querySelectorAll('.agent-name'), boite);
    var durees = Array.prototype.map.call(c.querySelectorAll('.agent-duration'), boite);
    out.libelles = {
      nombre: libelles.length,
      boites: libelles,
      durees_nombre: durees.length,
      toutes_largeurs_positives: libelles.every(function (b) { return b.w > 0; }),
    };

    // --- scenario 6 : un cycle QUI REBOUCLE -------------------------------
    // `frontend-developer` revient apres deux autres passages : c'est la
    // condition exacte de `detecterRebouclages` (meme agent, ecart > 1).
    // Le journal reel en regorge (`events.py` : doc-writer 9,
    // frontend-developer 8, backend-developer 7...), mais aucune scene ne
    // portait de reprise -- donc aucune mesure n'en voyait jamais une.
    var quiReboucle = ["frontend-developer", "code-reviewer", "test-engineer",
                       "frontend-developer"].map(function (n, i) {
      return passage({ agent: n,
                       debut: new Date(Date.UTC(2026, 8, 21, 10, i * 5, 0)).toISOString() });
    });
    c = peindre(quiReboucle);
    var arcs = c.querySelectorAll('.connector-layer path.is-reprise');
    out.reprise = {
      arcs_nombre: arcs.length,
      arc_boite: arcs.length ? (function () {
        var r = arcs[0].getBoundingClientRect();
        return { top: r.top, bottom: r.bottom, h: r.height };
      }()) : null,
      boite_tracee: boiteTracee(c),
      canevas_boite: canevasBoite(),
    };
  } catch (e) {
    out.erreur = String(e && e.stack || e);
  }
  document.title = JSON.stringify(out);
}());
</script>
</body></html>"""


def chevauchent(a, b, marge=0.5):
    """Deux rectangles se chevauchent-ils, avec une marge de tolerance ?"""
    return (a["x"] < b["x"] + b["w"] - marge and b["x"] < a["x"] + a["w"] - marge
            and a["y"] < b["y"] + b["h"] - marge and b["y"] < a["y"] + a["h"] - marge)


def depassement_vertical(agent_boite, canevas_boite):
    """De combien de px la boite de l'agent (disque + anneau + drapeau +
    libelles, deja UNIE cote JS sur les rectangles reellement peints)
    deborde-t-elle du canevas reellement rendu (`.graphe-scroll`) ? Renvoie
    (haut, bas), chacun >= 0. AUCUN recalcul de la formule de `disposer()`
    ici : les deux boites viennent de `getBoundingClientRect()`."""
    haut = max(0.0, canevas_boite["top"] - agent_boite["top"])
    bas = max(0.0, agent_boite["bottom"] - canevas_boite["bottom"])
    return haut, bas


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
    print("[atteignabilité] navigateur : %s ; page : %d octets ; app.js : %d octets ; "
          "diagramme.js : %d octets"
          % (navigateur, len(page),
             os.path.getsize(os.path.join(ICI, "app.js")),
             os.path.getsize(os.path.join(ICI, "diagramme.js"))))

    with tempfile.TemporaryDirectory() as tmp:
        fichier = os.path.join(tmp, "harnais.html")
        with open(fichier, "w", encoding="utf-8") as f:
            f.write(page)
        res = _lancer_navigateur([
            navigateur, "--headless", "--disable-gpu", "--no-sandbox",
            "--virtual-time-budget=3000", "--window-size=1400,900",
            "--dump-dom", "file://" + fichier,
        ])

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

    brut = dom[debut + 7:fin]
    import html as _html
    try:
        mesures = json.loads(_html.unescape(brut))
    except Exception as e:
        print("ECHEC ATTEIGNABILITE : <title> illisible (%s) : %s" % (e, brut[:400]))
        return 1

    if mesures.get("erreur"):
        print("ECHEC ATTEIGNABILITE : le script de la page a levé :\n%s" % mesures["erreur"])
        return 1

    # ------------------------------------------------------------------ F8
    a = mesures["actif"]
    print("[dérivé] disque actif : %s ; graduations %d ; pastilles %d ; diamètre %s"
          % (a["classes"], a["graduations"], a["pastilles"], a["diametre"]))

    check("F8_anneau_d_activite_present", a["orbite_presente"])
    check("F8_anneau_d_activite_REELLEMENT_anime", a["orbite_animation"] == "work-orbit",
          "animation-name calculé = %r (si `none`, le disque actif ne tourne pas, quoi "
          "que dise la feuille)" % a["orbite_animation"])

    # ---------------------------------------------- F8bis (lot 8, ADR-0031 §5)
    # L'anneau `--progress` : arc FIXE par état, jamais un pourcentage, mis
    # en mouvement par un pseudo-élément DÉDIÉ (`::before`), jamais par
    # `.agent-node` lui-même.
    print("[dérivé] actif : --progress=%r, ::before animation-name=%r, "
          ".agent-node animation-name=%r" %
          (a["anneau_progress"], a["anneau_avant_anime"], a["disque_anime"]))
    check("F8bis_anneau_progress_actif_arc_fixe_270deg", a["anneau_progress"] == "270deg",
          "obtenu %r — ADR-0031 §5 : arc FIXE, jamais un pourcentage dérivé des tokens"
          % a["anneau_progress"])
    check("F8bis_anneau_avant_anime_sur_actif", a["anneau_avant_anime"] == "work-orbit",
          "animation-name calculé du pseudo-élément = %r (si `none`, l'anneau ne bouge "
          "plus pendant l'activité)" % a["anneau_avant_anime"])
    check("F8bis_disque_lui_meme_JAMAIS_anime", a["disque_anime"] == "none",
          "animation-name de `.agent-node` = %r — s'il tourne, le sigle et les "
          "pastilles tournent avec lui (interdit, notes de brief)" % a["disque_anime"])
    check("F8bis_anneau_avant_porte_bien_un_conic_gradient",
          "conic-gradient" in a["anneau_avant_fond"],
          "background-image calculé du pseudo-élément = %r" % a["anneau_avant_fond"])
    check("F8_douze_graduations_peintes", a["graduations"] == 12,
          "obtenu %d" % a["graduations"])
    check("F8_graduations_REELLEMENT_animees_sur_actif",
          a["graduation_animation"] == "tick-work",
          "animation-name calculé = %r" % a["graduation_animation"])
    check("F8_trois_pastilles_peintes", a["pastilles"] == 3, "obtenu %d" % a["pastilles"])
    # deux fichiers sur trois : les pastilles doivent se DISTINGUER a l'oeil,
    # pas seulement porter une classe differente.
    distinctes = len(set(a["opacites"])) >= 2
    check("F8_pastilles_allumees_VISIBLEMENT_distinctes", distinctes,
          "opacités calculées %s — si toutes égales, la classe `.on` ne peint rien"
          % a["opacites"])

    # ----------------------------------------------------------------- F15
    check("F15_aucun_token_value_dans_l_arbre", a["token_value"] == 0,
          "obtenu %d — la lecture des tokens est sortie vers feature-023" % a["token_value"])
    check("F15_sigle_reellement_rendu",
          bool(a["sigle_texte"].strip()) and a["sigle_boite"]["w"] > 0,
          "texte %r, largeur %s" % (a["sigle_texte"], a["sigle_boite"]["w"]))
    # « degradable, jamais a trous » : le sigle restant est OPTIQUEMENT centre
    # dans le disque. Si un espace etait reserve pour un chiffre absent, le
    # sigle serait decale vers le haut.
    ecart_y = abs(a["sigle_boite"]["cy"] - a["noeud_boite"]["cy"])
    check("F15_disque_sans_trou_le_sigle_reste_centre", ecart_y <= 14,
          "écart vertical mesuré entre le centre du sigle et celui du disque : %.1f px "
          "(un espace réservé pour un chiffre absent décalerait le sigle)" % ecart_y)

    # ----------------------------------------------------------------- F16
    e = mesures["echec"]
    s = mesures["sans_cloture"]
    p = mesures["principal"]
    print("[dérivé] échec : --state-color %r vs --danger %r ; glyphe %r"
          % (e["state_color"], e["danger"], e["glyphe"]))
    print("[dérivé] sans clôture : --state-color %r ; glyphe %r ; bordure %r"
          % (s["state_color"], s["glyphe"], s["drapeau_bordure"]))

    check("F16_echec_recolore_REELLEMENT_le_disque",
          e["state_color"] != "" and e["state_color"] == e["danger"],
          "--state-color calculé %r, --danger %r" % (e["state_color"], e["danger"]))
    check("F8bis_anneau_progress_termine_complet_360deg_meme_en_echec",
          e["anneau_progress"] == "360deg",
          "obtenu %r — l'échec RECOLORE l'anneau (--danger), il ne rouvre jamais son "
          "arc (ADR-0031 §3 : deux dimensions distinctes, jamais la seule couleur)"
          % e["anneau_progress"])
    check("F8bis_anneau_avant_STABLE_sur_termine",
          e["anneau_avant_anime"] == "none",
          "animation-name du pseudo-élément sur un disque terminé = %r (devrait être "
          "`none` : complet et stable, plus aucun mouvement, ADR-0031 §5)"
          % e["anneau_avant_anime"])
    check("F16_echec_recolore_jusqu_aux_graduations",
          e["graduation_couleur"] not in ("", "rgba(0, 0, 0, 0)"),
          "background-color calculé des graduations : %r" % e["graduation_couleur"])
    check("F16_echec_porte_un_drapeau_REELLEMENT_rendu",
          bool(e["drapeau_boite"]) and e["drapeau_boite"]["w"] > 0
          and e["drapeau_boite"]["h"] > 0,
          "boîte %s" % (e["drapeau_boite"],))
    check("F16_echec_glyphe_non_vide", e["glyphe"] not in (None, "", "none", '""'),
          "content calculé %r" % e["glyphe"])

    check("F16_sans_cloture_porte_un_drapeau_REELLEMENT_rendu",
          bool(s["drapeau_boite"]) and s["drapeau_boite"]["w"] > 0,
          "boîte %s" % (s["drapeau_boite"],))
    check("F16_sans_cloture_glyphe_non_vide", s["glyphe"] not in (None, "", "none", '""'),
          "content calculé %r" % s["glyphe"])
    # C'est LE critere qui separe les deux representations : un passage sans
    # fin observee n'est PAS un echec (PIEGES §17) et ne doit pas s'afficher
    # comme tel. On exige DEUX dimensions distinctes, couleur ET glyphe.
    check("F16_sans_cloture_SE_DISTINGUE_de_l_echec_par_la_couleur",
          s["drapeau_couleur"] != e["drapeau_couleur"],
          "les deux drapeaux sont peints %r — un passage sans clôture serait lu "
          "comme un échec" % s["drapeau_couleur"])
    check("F16_sans_cloture_SE_DISTINGUE_de_l_echec_par_le_glyphe",
          s["glyphe"] != e["glyphe"],
          "les deux glyphes valent %r" % s["glyphe"])
    check("F16_sans_cloture_n_est_pas_recolore_en_danger",
          s["state_color"] != e["danger"],
          "--state-color %r == --danger : un passage sans fin observée serait peint "
          "comme un échec" % s["state_color"])

    check("F16_principal_porte_un_anneau_REELLEMENT_dessine",
          p["anneau_present"] and p["anneau_boite"]["w"] > 0
          and p["anneau_style"] not in ("none", "hidden"),
          "présent=%s boîte=%s style=%r" % (p["anneau_present"], p["anneau_boite"],
                                            p["anneau_style"]))
    check("F16_anneau_du_principal_deborde_du_disque",
          p["anneau_boite"]["w"] > p["noeud_boite"]["w"],
          "anneau %.1f px vs disque %.1f px — un anneau à l'intérieur du disque "
          "ne se verrait pas" % (p["anneau_boite"]["w"], p["noeud_boite"]["w"]))

    # ------------------------------------------------ ecretage du canevas (lot 4)
    # Tout ce qui appartient a un agent (disque, anneau de role, drapeau, nom,
    # duree) doit tenir dans le canevas REELLEMENT rendu (`.graphe-scroll`,
    # qui ecrete verticalement — `overflow-y: hidden`, app.css). Les trois cas
    # les plus exigeants : l'agent principal (anneau pointille), l'agent en
    # echec (halo + drapeau), l'agent sans cloture (drapeau) — plus le cas de
    # base (agent actif).
    for cle, libelle in (
        ("actif", "agent actif"),
        ("echec", "agent en échec (halo + drapeau)"),
        ("sans_cloture", "agent sans clôture (drapeau)"),
        ("principal", "agent principal (anneau pointillé)"),
    ):
        d = mesures[cle]
        haut, bas = depassement_vertical(d["agent_boite"], d["canevas_boite"])
        print("[dérivé] écrêtage %s : dépassement haut %.1f px, bas %.1f px "
              "(boîte agent [%.1f, %.1f], canevas [%.1f, %.1f])"
              % (libelle, haut, bas, d["agent_boite"]["top"], d["agent_boite"]["bottom"],
                 d["canevas_boite"]["top"], d["canevas_boite"]["bottom"]))
        check("F_ecretage_%s_tient_entierement_dans_le_canevas" % cle,
              haut <= 0.5 and bas <= 0.5,
              "%s : dépassement haut %.1f px, bas %.1f px — mesuré sur les rectangles "
              "réellement peints (disque, anneau, drapeau, nom, durée unis), jamais "
              "recalculé depuis les marges de disposer()" % (libelle, haut, bas))

    # -------------------------------- F16, 4/4 : non-chevauchement des libelles
    lb = mesures["libelles"]
    print("[dérivé] %d libellés mesurés sur leurs rectangles RÉELS" % lb["nombre"])
    check("F16_tous_les_libelles_sont_rendus", lb["nombre"] == 7,
          "obtenu %d" % lb["nombre"])
    check("F16_chaque_libelle_a_une_largeur_non_nulle", lb["toutes_largeurs_positives"])
    paires = []
    for i in range(len(lb["boites"])):
        for j in range(i + 1, len(lb["boites"])):
            if chevauchent(lb["boites"][i], lb["boites"][j]):
                paires.append((i, j))
    check("F16_aucun_libelle_n_en_chevauche_un_autre", not paires,
          "%d paire(s) qui se recouvrent : %s — mesuré sur les rectangles rendus par "
          "le moteur, jamais en recalculant la formule de disposer()"
          % (len(paires), paires))
    check("F16_chaque_disque_porte_sa_duree", lb["durees_nombre"] == lb["nombre"],
          "%d durées pour %d libellés" % (lb["durees_nombre"], lb["nombre"]))

    # --------------------------- ecretage des CONNECTEURS (arc de reprise)
    # Un arc de reprise n'appartient a aucun agent : il relie deux passages,
    # et il etait donc hors du perimetre de la garde d'ecretage precedente,
    # qui enumerait « disque, anneau, drapeau, nom, duree ». Mesure :
    # sommet a -62 px pour un canevas commencant a 0, arc tronque, suite
    # verte. La garde porte desormais sur l'union de TOUT ce qui est trace.
    r = mesures["reprise"]
    check("F_reprise_la_scene_porte_bien_un_arc", r["arcs_nombre"] >= 1,
          "%d arc(s) de reprise dans une scène où `frontend-developer` revient "
          "après deux passages — sans arc, la garde ci-dessous serait verte par "
          "vacuité" % r["arcs_nombre"])
    if r["arc_boite"]:
        print("[dérivé] arc de reprise : hauteur peinte %.1f px, sommet à %.1f "
              "(canevas à %.1f)" % (r["arc_boite"]["h"], r["arc_boite"]["top"],
                                    r["canevas_boite"]["top"]))
    bt = r["boite_tracee"]
    print("[dérivé] union de %d élément(s) tracé(s) : [%.1f, %.1f], canevas [%.1f, %.1f]"
          % (bt["elements"], bt["top"], bt["bottom"],
             r["canevas_boite"]["top"], r["canevas_boite"]["bottom"]))
    haut, bas = depassement_vertical(bt, r["canevas_boite"])
    check("F_ecretage_tout_le_trace_CONNECTEURS_COMPRIS_tient_dans_le_canevas",
          haut <= 0.5 and bas <= 0.5,
          "dépassement haut %.1f px, bas %.1f px sur l'union de %d élément(s) "
          "réellement peints (agents ET connecteurs) — un arc de reprise culmine "
          "au-dessus du plus haut disque, il ne peut pas être couvert par une "
          "garde qui n'énumère que les parties d'un agent"
          % (haut, bas, bt["elements"]))

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for nom in _echecs:
        print("  - %s" % nom)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
