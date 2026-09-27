#!/usr/bin/env python3
"""G3 — RESSEMBLANCE RENDUE, harnais navigateur (feature-021, cycle 2, lot 6
gardes de fidélité d'ensemble).

    python3 control-center/web/test_app_fidelite_navigateur.py

Complète G0 (F0, exhaustivité de la partition) et G1/G2
(`test_conformite_formes.js`, vocabulaire de forme et emploi des jetons SUR
LA SOURCE) par la clause qui manquait : le prototype ET le cockpit sont
RÉELLEMENT CHARGÉS ET RENDUS, puis comparés — l'attendu de cette garde n'est
PAS une table recopiée à la main, c'est **le prototype chargé** (PIEGES §30 :
un test qui délègue à ce qu'il vérifie pour reconstruire son propre attendu
ne prouve rien). C'est ce qui rend cette garde non tautologique : une
quatrième garde qui relirait des constantes écrites à la main referait
exactement le défaut que ce lot ferme.

Deux comparaisons
-----------------------------------------------------------------------------
A. PAR ANCRE — pour chaque id « adopté, DÉJÀ LIVRÉ » de la table F0 (lots
   0-5, `lotEstDejaLivre`, cf. `test_conformite_partition_donnees.js`)
   présent dans les DEUX DOM rendus :
     - vecteur de STYLE CALCULÉ (`getComputedStyle` : `border-radius`,
       `box-shadow` et `font-family` RÉSOLUS — `color-mix()` compris, cascade
       réelle, pas la déclaration source que G1/G2 lisent ; `font-family`
       ajoutée bug-030, cf. commentaire sur `styleForme`) ;
     - GÉOMÉTRIE NORMALISÉE : largeur rapportée à la fenêtre
       (`rect.width / innerWidth`), hauteur rapportée à l'ancre PARENTE
       (`rect.height / parent.rect.height`) ;
     - ORDRE VERTICAL : la séquence des ancres triée par `rect.top`.
B. SIGNATURE GLOBALE — histogrammes, sur TOUS les nœuds peints des deux
   pages, des `border-radius` et `box-shadow` (non-`none`) RÉELLEMENT
   calculés. Comparaison d'INCLUSION (tout ce que peint le cockpit appartient
   à ce que peint le prototype, modulo `AJOUTS_HISTOGRAMME_DECLARES`) et de
   PRÉSENCE (les ancres du volet A couvrent la présence nommément).

Ce que cette garde NE PEUT PAS voir, déclaré ici plutôt que découvert en
revue
-----------------------------------------------------------------------------
- AUCUNE comparaison de pixels : le cockpit peint des données RÉELLES
  (git, agents, backlog), le prototype un GABARIT à texte fixe. Mesuré :
  `<span class="brand">` porte "Le Couloir" côté prototype, "Centre de
  contrôle" côté cockpit — toute largeur dépendant du texte DIVERGE
  légitimement. La géométrie comparée ici se borne donc aux ancres dont la
  taille ne dépend PAS du texte qu'elles encadrent (conteneurs structurels :
  `#cycle-canvas`, `#main-content` ; feuilles à hauteur fixée par grille).
  Une ancre dont la largeur dépend du texte est EXCLUE de la comparaison de
  largeur (liste déclarée `ANCRES_LARGEUR_NON_COMPARABLE`, motif nommé),
  jamais fondue dans une tolérance numérique arbitraire (PIEGES §20).
- `getBoundingClientRect()` N'INCLUT NI `box-shadow` NI `outline` (défaut
  déjà payé au lot 4) : la géométrie ici sert à l'ORDRE et au RATIO, jamais
  à vérifier qu'une ombre déborde — c'est `getComputedStyle` qui porte
  `box-shadow`, jamais le rectangle.
- SIGNATURE GLOBALE bornée à `border-radius`/`box-shadow` — PAS à
  `font-size`/`font-weight` malgré la formulation initiale du plan. Mesuré
  (`test_conformite_formes.js`, en-tête) : étendre la comparaison de
  vecteur à la typographie fait remonter des dizaines de sélecteurs
  ANTÉRIEURS au cycle M3 (`.jauge`, `.pilotage-*`, `.bandeau-hote`,
  `.agents li`…) — présents dans le MÊME `index.html` que le cockpit M3,
  jamais dans le mandat de fidélité de ce cycle, et qu'AUCUN clic de ce
  harnais ne peut exclure du balayage `document.querySelectorAll('*')`.
  Même scoping que G1/G2, pour la même raison mesurée, gardé cohérent
  plutôt que réinventé ici.
- Le prototype vit sous `control-center/maquettes/`, jamais servi par le
  module (`_RACINE_WEB = control-center/web`) : servi ici par un second
  serveur HTTP trivial, TOUJOURS un port > 8800 (jamais `file://`,
  PIEGES §10 ; jamais le port 8788, PIEGES §2).
- « Même Chromium, même fenêtre » : DEUX invocations successives du MÊME
  binaire Chromium, avec des indicateurs et une taille de fenêtre
  (1440×1000) STRICTEMENT identiques — pas un onglet CDP partagé (aucune
  dépendance ajoutée pour piloter le protocole DevTools, ADR-0006). La
  garantie que ceci apporte : même moteur de rendu, mêmes polices, même
  résolution — PAS un partage d'état entre les deux pages, qui serait de
  toute façon FAUX à vouloir (deux documents indépendants).
- La scène balaie PLUSIEURS états (menu contextuel ouvert, une boîte de
  dialogue ouverte côté prototype ; agents dans des états mélangés, carte
  active, bottom sheet peuplée côté cockpit) — PAS tous les 6 « steps »
  d'animation du prototype (minutés en temps réel, hors de portée d'un
  `--virtual-time-budget` fiable sans dépendre d'un minutage fragile,
  PIEGES §28) : limite assumée, pas l'état par défaut nu.
- LA RÉFÉRENCE EST FIGÉE, ET CE QUE LE FIGEAGE RETIRE EST DÉCLARÉ ICI.
  `--force-prefers-reduced-motion` est posé sur les DEUX invocations : le
  prototype est une démo qui se joue seule (`demoTimer` l.1037,
  `metricTimer` l.1251) et `playing = !reducedMotion` (l.895) l'empêche de
  démarrer. Sans ce figeage, sa signature peinte dépendait de la phase de
  la démo au moment du relevé — mesuré : 1 échec sur 6 sous charge, la
  valeur `--primary` à 8 % (halo d'un agent ACTIF) n'entrant dans la
  référence que si la démo avait atteint cette étape.
  Ce que le figeage RETIRE du périmètre comparé : les états de disque que
  seule la démo produisait. Ils sont RENDUS déterministes, pas perdus — la
  scène du prototype pose désormais `state-active` / `state-done` /
  `state-pending` explicitement sur trois `.agent-node` (noms du prototype,
  donc clé de jointure), là où la scène du cockpit les obtient déjà par
  construction (`termine` true/false de ses passages). Ce qui reste hors
  périmètre est ce qui dépend d'une ANIMATION en cours, jamais d'un état.
  Effet second : les `transition` (`.agent-node` : `box-shadow 460ms`) ne
  sont plus échantillonnées à mi-course.
- G3 PROUVE la stabilité de sa référence au lieu d'être seulement
  configurée pour l'obtenir : le prototype est relevé DEUX fois dans la
  même exécution, et `REFERENCE_stable_entre_deux_releves_*` échoue en
  nommant l'écart si les deux diffèrent. Une garde dont l'ATTENDU varie
  d'un run à l'autre est pire qu'absente — on apprend à l'ignorer.

Saute proprement si Chromium OU `node` est introuvable.
"""

HARNAIS_NAVIGATEUR = True

import html as _html
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

_ICI = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.join(os.path.dirname(_ICI), "backend")
_MAQUETTES = os.path.join(os.path.dirname(_ICI), "maquettes")
_MAQUETTE_NOM = "2026-09-20-maquette-materiel-3.html"
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

# Delai d'un appel `node -e` de derivation : ce n'est PAS un lancement de
# navigateur, il ne partage donc pas la cause du seuil ci-dessus (demarrage
# a froid de Chromium) et garde les 30 s d'origine.
_DELAI_NODE_S = 30


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


# ===================================================================== //
# Dérivation Node : ancres = id « adopté, DÉJÀ LIVRÉ » de la table F0.
# ===================================================================== //
_NODE_DERIVATION = r"""
const t = require("./test_conformite_partition_donnees.js");
const ancres = Object.entries(t.PARTITION_IDS)
  .filter(([, [v, , lot]]) => v === t.ADOPTE && t.lotEstDejaLivre(lot))
  .map(([id]) => id)
  .sort();
process.stdout.write(JSON.stringify({ ancres }));
"""


def deriver():
    node = shutil.which("node")
    if not node:
        return None
    res = subprocess.run([node, "-e", _NODE_DERIVATION], cwd=_ICI,
                          capture_output=True, text=True, timeout=_DELAI_NODE_S)
    if res.returncode != 0:
        raise RuntimeError("dérivation Node échouée : %s" % res.stderr[-1000:])
    return json.loads(res.stdout)


# ===================================================================== //
# Exceptions DÉCLARÉES — pas ATTENDU_ROUGE (registre distinct, laissé vide
# comme les autres) : deux listes permanentes, motif nommé, purge exigée.
# ===================================================================== //

# Ancres dont la LARGEUR dépend du texte qu'elles encadrent (contenu réel
# côté cockpit, gabarit fixe côté prototype) — exclues de la comparaison de
# largeur, jamais de la comparaison de forme/ordre.
ANCRES_LARGEUR_NON_COMPARABLE = {
    "claude-title": "contient `.claude-status`, dont le texte est un substitut rempli à\n        l'exécution depuis l'état réel (« … ») là où le prototype affiche une prose fixe\n        (« En ligne ») — largeur non comparable ; le RESTE de son vecteur de style l'est",
    "backlog-count": "texte variable (« N éléments »)",
    "backlog-column-count": "texte variable (compte de colonne)",
    "backlog-title": "texte du titre, longueur non garantie identique",
    "cycle-status": "texte de statut, longueur variable",
    "motion-note": "texte de note, longueur variable",
    "summary-active": "texte « N agents actifs », longueur variable",
    "summary-step": "texte d'étape, longueur variable",
    "summary-time": "chronomètre, longueur variable selon la valeur",
    "selected-code": "sigle d'agent, longueur variable (2 à 4 caractères)",
    "selected-title": "titre + état, texte long variable",
    "selected-task": "texte de tâche, longueur variable",
    "selected-state": "libellé d'état, longueur variable",
    "selected-duration": "durée formatée, longueur variable",
    "selected-tools": "texte « N appels », longueur variable",
    "selected-files": "texte « N fichiers », longueur variable",
    # feature-023 (lot 12) : texte connu/absent/partiel, longueur variable —
    # même famille que summary-active/summary-step/selected-tools ci-dessus.
    "selected-tokens": "chiffre ou texte d'état (« lecture partielle »/« indisponible »), longueur variable",
    "summary-tokens": "chiffre ou texte d'état, longueur variable selon le compte connu",
    "a11y-announcement": "visuellement masqué, largeur non significative",
    "cycle-canvas": "largeur du SVG DÉRIVÉE du nombre d'agents dessinés (disposer()) — la scène "
                    "en peint 3 côté cockpit contre 6 côté prototype, DONNÉE, pas CSS",
    "link-front-sec": "connecteur du graphe — largeur dérivée de la géométrie du disque, même raison que cycle-canvas",
    "link-front-tests": "connecteur du graphe — même raison que cycle-canvas",
    "link-front2-review": "connecteur du graphe — même raison que cycle-canvas",
    "link-reprise": "connecteur du graphe — même raison que cycle-canvas",
    "link-sec-front2": "connecteur du graphe — même raison que cycle-canvas",
    "link-spec-front": "connecteur du graphe — même raison que cycle-canvas",
    "link-tests-front2": "connecteur du graphe — même raison que cycle-canvas",
    # feature-025 (lots 9-10) : chips/titres du dialogue de détail — largeur
    # gouvernée par le TEXTE qu'ils encadrent (chip Material, `<h2>` en
    # ligne), jamais garantie identique entre le jeu de démonstration du
    # prototype (`featureDetails['F-023']`) et celui de cette scène.
    "feature-title": "titre du dialogue de détail, texte variable (identifiant + titre de spec)",
    "feature-status": "chip de statut, texte variable",
    "feature-priority": "chip de priorité, texte variable",
    "feature-agent": "chip d'agent, texte variable — non exposé par `specs.py` (K4), texte de repli",
    "add-item-title": "texte identique (« Ajouter un élément ») mais `<h2>` en ligne dont la largeur "
                       "dépend aussi de la hauteur du dialogue VOISIN (feature-dialog) ouvert en même "
                       "temps dans cette scène — dérive avec le contenu du dialogue de détail, pas un "
                       "défaut de app.css",
    "cycle-title": "titre du cycle, texte variable (« Cycle #N », titre de spec, ou aucun cycle observé)",
}

# Ancres dont le `top` (position verticale) n'est pas un signal d'ORDRE DE
# LECTURE fiable — motif nommé, exclues de la clause d'ordre uniquement.
ANCRES_ORDRE_NON_COMPARABLE = {
    "a11y-announcement": "visuellement masqué (position hors-écran), son `top` ne reflète aucun ordre de lecture",
    # feature-025 (lots 9-10) : MÊME raison que leur exclusion de largeur
    # ci-dessus — leur position verticale est DÉRIVÉE de la géométrie du
    # graphe (disposer()), pas un ordre de lecture de document, et cette
    # géométrie n'est pas requise de coïncider pixel pour pixel avec celle
    # du prototype (6 agents dessinés côté prototype, 3 côté cockpit).
    "link-front-sec": "connecteur du graphe — position dérivée de la géométrie du disque, même raison que sa largeur",
    "link-front-tests": "connecteur du graphe — même raison",
    "link-front2-review": "connecteur du graphe — même raison",
    "link-reprise": "connecteur du graphe — même raison",
    "link-sec-front2": "connecteur du graphe — même raison",
    "link-spec-front": "connecteur du graphe — même raison",
    "link-tests-front2": "connecteur du graphe — même raison",
    # feature-025 (lots 9-10) : à la frontière de bande (seuil 40px, chaîné)
    # entre l'en-tête du dialogue (chips déjà exclues de la largeur
    # ci-dessus) et le corps — mesuré : bascule d'un côté ou de l'autre pour
    # un écart d'interligne de quelques px, jamais un ordre de LECTURE réel
    # (la description suit TOUJOURS les chips dans le DOM, `feature-meta`
    # puis `feature-section`, vérifié par `test_conformite_a11y.js`/F4a).
    "feature-description": "frontière de bande fragile avec l'en-tête du dialogue, pas un ordre DOM différent",
    # Boutons d'action des dialogues (bas de `.feature-dialog`/`.add-item-
    # dialog`) : leur `top` dépend de la HAUTEUR du dialogue (donc du texte
    # qu'il contient, déjà la raison des exclusions ci-dessus), pas d'un
    # ordre de lecture — ils tombent, selon cette hauteur, dans la même
    # bande que la feuille de détail (`selected-*`) ou une bande séparée,
    # sans que l'ordre RELATIF dans chaque document ne change.
    "feature-edit": "position dépend de la hauteur du dialogue de détail, pas un ordre DOM différent",
    "feature-done": "position dépend de la hauteur du dialogue de détail, pas un ordre DOM différent",
    "cancel-add-item": "position dépend de la hauteur du dialogue d'ajout, pas un ordre DOM différent",
    # feature-028 (lot B, GATE C2) : MÊME cause que `cancel-add-item`
    # ci-dessus, remontée d'un cran — `#item-title` ajouté fait grandir
    # `#add-item-dialog` (`<dialog>` centré verticalement par le navigateur,
    # `showModal()`), donc son bord haut REMONTE mécaniquement (un dialogue
    # plus grand, centré, a un `top` plus petit) : `#add-item-dialog` et son
    # bouton de fermeture `#close-add-item` migrent de bande avec lui,
    # jamais un ordre DOM différent.
    "add-item-dialog": "hauteur du dialogue augmentée par `#item-title` (GATE C2) — un `<dialog>` centré "
                        "remonte mécaniquement quand il grandit, voir le commentaire sur `#add-item-dialog` (index.html)",
    "close-add-item": "contenu de l'en-tête d'`#add-item-dialog` — même raison que `add-item-dialog` ci-dessus",
    # feature-028 (lot pilotage dédié) : MÊME cause, remontée une fois de
    # plus — `#item-derogation-minimale` (et sa note) ajoutés font grandir
    # `#add-item-dialog` davantage, donc son `<h2>` `#add-item-title` migre
    # de bande à son tour.
    "add-item-title": "hauteur du dialogue augmentée par `#item-derogation-minimale` (CLAUDE.md) — "
                       "même raison que `add-item-dialog` ci-dessus",
    # Correctif « hauteur du panneau » (rapporté depuis un iPad, cycle
    # feature-026) : `.claude-panel` porte désormais `max-height: 58vh` —
    # avant ce correctif, le panneau s'étirait (`align-items: stretch`,
    # comportement PAR DÉFAUT de la grille) jusqu'à la hauteur de sa colonne
    # sœur, poussant `#composer`/`#prompt` (dernière rangée `auto` de sa
    # grille interne) à une position DÉPENDANTE de cette colonne sœur — pas
    # d'un ordre de lecture. Plafonné, le panneau reprend sa hauteur PROPRE,
    # et `#composer`/`#prompt` remontent d'autant : c'est la conséquence
    # ATTENDUE du plafond (le panneau ne doit plus grandir sans borne), pas
    # une régression — le prototype STATIQUE n'a jamais eu ce comportement
    # d'étirement à mesurer contre.
    "composer": "position dépend de la hauteur, désormais plafonnée, de `.claude-panel` — pas un ordre DOM différent. "
                "COMPENSÉ (l'ordre DOM, lui, reste vérifié) par `ORDRE_DOM_conversation_precede_composer` dans "
                "`test_app_conversation_feature026.js` — cette exemption retire le `top` peint, pas la couverture.",
    "prompt": "même raison que `composer`, qui le contient. COMPENSÉ par "
              "`ORDRE_DOM_prompt_descendant_de_composer` (même fichier).",
    # feature-028 (lot B, GATE C2) : `#item-title` AJOUTÉ juste au-dessus
    # dans `#add-item-dialog` (le prototype n'a pas de champ titre, alors
    # que le slug — donc le nom de fichier réel — en dérive) — décale
    # mécaniquement `#item-priority` d'une rangée de formulaire vers le bas,
    # donc hors de la bande verticale où il tombait par coïncidence dans le
    # prototype (`feature-updated`/`feature-dependency`, un dialogue SANS
    # rapport). Pas un ordre DOM différent : `#item-priority` reste APRÈS
    # `#item-description` dans les deux documents, seule sa position en
    # PIXELS a bougé, mécaniquement, à cause d'un champ requis par le GATE.
    "item-priority": "position décalée par l'ajout requis d'`#item-title` juste au-dessus (GATE C2) — "
                      "pas un ordre DOM différent, voir le commentaire sur `#add-item-dialog` (index.html).",
}

# Valeurs de `border-radius`/`box-shadow` peintes par le cockpit hors de
# l'histogramme du prototype — le cas mesuré est `.agent-flag`/variantes
# (F16, ADR-0031 §3 : drapeau d'état INVENTÉ, absent du prototype par
# construction — CLASSES_AJOUTEES/AJOUTS_HORS_ECHELLE le déclarent déjà côté
# source dans test_conformite_classes.js/test_conformite_formes.js). Valeurs
# RÉSOLUES par le navigateur (`getComputedStyle`, couleur en `color()`/`rgb()`
# résolue depuis `var(--surface)`/`var(--danger)` — jamais recopiées à la
# main : dérivées en exécutant ce fichier une première fois et en collant le
# littéral que Chromium a réellement résolu, comme toute autre garde de ce
# module dérive ses attendus depuis l'artefact.
AJOUTS_HISTOGRAMME_DECLARES = {
    "border-radius": [],
    "box-shadow": [
        {"val": "rgb(255, 251, 255) 0px 0px 0px 2px", "raison": "`.agent-flag` (F16) : anneau `0 0 0 2px var(--surface)`, résolu"},
        {"val": "color(srgb 0.729412 0.101961 0.101961 / 0.08) 0px 0px 0px 6px", "raison": "`.agent-flag--echec` (F16) : variante échec du halo, résolu"},
    ],
}


# ===================================================================== //
# Scène de mesure — INJECTÉE dans chaque page (JS commun aux deux).
# ===================================================================== //
_MESURER_JS = r"""
function fideliteMesurer(idsAncres) {
  function styleForme(el) {
    var cs = getComputedStyle(el);
    return { borderRadius: cs.borderRadius, boxShadow: cs.boxShadow };
  }
  // `fontFamily` RÉSOLUE, séparément du vecteur de forme ci-dessus (bug-030)
  // : sans elle, une ancre de type bouton qui perd son `font: inherit`
  // (repli sur la police par défaut du NAVIGATEUR pour les contrôles de
  // formulaire, jamais celle de `body`) ne fait bouger ni `borderRadius` ni
  // `boxShadow` — la divergence n'était visible qu'INDIRECTEMENT, par la
  // largeur du texte peint, dépendante des polices installées sur la
  // machine. Portée VOLONTAIREMENT étroite aux ancres où ce cycle l'a
  // établie et corrigée (`.add-item-button`, `.feature-dialog-actions
  // button`, `.form-buttons`/`.dialog-actions button`) — pas à toutes les
  // ancres communes : `#selected-code` (entre autres) déclare DÉLIBÉRÉMENT
  // `--mono` côté cockpit contre `--sans` côté prototype (sigle d'agent en
  // chasse fixe), une divergence de police PRÉEXISTANTE et hors du périmètre
  // de ce correctif — l'étendre sans discernement transforme la garde en
  // échec sur un choix de design non concerné, pas sur la cause réelle.
  function fontFamilleCalculee(el) {
    return getComputedStyle(el).fontFamily;
  }
  var ancres = {};
  var pourOrdre = [];
  idsAncres.forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    var rect = el.getBoundingClientRect();
    var parent = el.parentElement;
    var rectParent = parent ? parent.getBoundingClientRect() : null;
    ancres[id] = {
      forme: styleForme(el),
      fontFamille: fontFamilleCalculee(el),
      largeurFenetre: rect.width / window.innerWidth,
      hauteurParent: (rectParent && rectParent.height > 0) ? (rect.height / rectParent.height) : null,
      top: rect.top,
    };
    pourOrdre.push({ id: id, top: rect.top });
  });
  pourOrdre.sort(function (a, b) { return a.top - b.top; });

  var histBorderRadius = {}, histBoxShadow = {};
  function compter(obj, val) { obj[val] = (obj[val] || 0) + 1; }
  var noeuds = document.querySelectorAll('*');
  var noeudsReellementPeints = 0;
  Array.prototype.forEach.call(noeuds, function (el) {
    // `getClientRects().length === 0` : élément NON rendu (lui-même
    // `display:none`, OU un ANCÊTRE l'est — `getComputedStyle` répondrait
    // quand même sur l'élément lui-même, ce qui compterait à tort de la
    // forme JAMAIS PEINTE, ex. le tiroir de pilotage fermé par défaut).
    // C'est la mesure « réellement peint », pas « présent dans le DOM ».
    if (el.getClientRects().length === 0) return;
    noeudsReellementPeints++;
    var cs = getComputedStyle(el);
    if (cs.borderRadius) compter(histBorderRadius, cs.borderRadius);
    if (cs.boxShadow && cs.boxShadow !== 'none') compter(histBoxShadow, cs.boxShadow);
  });

  return {
    ancres: ancres,
    ordre: pourOrdre.map(function (o) { return o.id; }),
    histogramme: { borderRadius: histBorderRadius, boxShadow: histBoxShadow },
    noeudsVisites: noeudsReellementPeints,
  };
}
"""


def _script_scene_prototype(ancres_json):
    return _MESURER_JS + r"""
(function () {
  var out = { erreur: null };
  try {
    // Balaie PLUSIEURS états, pas l'état par défaut nu : un menu contextuel
    // ouvert, une boîte de dialogue de détail ouverte, un formulaire
    // d'ajout ouvert — tous cliqués RÉELLEMENT (mêmes gestionnaires que
    // l'utilisateur), jamais un appel direct aux fermetures internes de
    // l'IIFE (inatteignables depuis un script externe).
    //
    // « Cimetière » (même technique que test_app_classes_navigateur.py) :
    // ouvrir la boîte de dialogue de détail FERME le menu contextuel
    // (`openFeatureDetails` appelle `closeMenu()`) — sans ce clone, l'état
    // « menu ouvert » (et son `.menu-item`, rayon 9px du prototype) ne
    // serait JAMAIS balayé par la signature globale, alors qu'il est un
    // état réel et atteignable.
    var cimetiere = document.createElement('div');
    cimetiere.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cimetiere);

    var premierPlus = document.querySelector('.more-button');
    if (premierPlus) premierPlus.click();
    var menu = document.getElementById('context-menu');
    if (menu && !menu.hidden) cimetiere.appendChild(menu.cloneNode(true));

    var premiereCarte = document.querySelector('.card-title-button');
    if (premiereCarte) premiereCarte.click();
    var ouvrirAjout = document.getElementById('open-add-item');
    if (ouvrirAjout) ouvrirAjout.click();

    // Les TROIS états de disque, posés EXPLICITEMENT — jamais attendus de
    // la démo. Sous `--force-prefers-reduced-motion` celle-ci ne démarre
    // pas (`playing = !reducedMotion`), donc aucun agent n'atteindrait
    // `state-active` et le halo `--primary` à 8 % manquerait de la
    // référence alors que la scène du cockpit le peint (ses passages sont
    // construits avec `termine` true/false, donc déterministes). Les noms
    // de classe sont ceux du prototype : ils sont la clé de jointure.
    var disques = document.querySelectorAll('.agent-node');
    var etats = ['state-active', 'state-done', 'state-pending'];
    for (var i = 0; i < etats.length && i < disques.length; i++) {
      disques[i].classList.remove('state-active', 'state-done', 'state-pending');
      disques[i].classList.add(etats[i]);
    }
    out.mesure = fideliteMesurer(""" + ancres_json + r""");
  } catch (e) {
    out.erreur = String((e && e.stack) || e);
  }
  document.title = JSON.stringify(out);
}());
"""


def _script_scene_cockpit(ancres_json):
    return _MESURER_JS + r"""
(function () {
  var out = { erreur: null };
  try {
    function passage(o) {
      return {
        agent: o.agent, debut: o.debut, duree_ms: o.duree_ms || 5000,
        outils: o.outils || 0, fichiers: o.fichiers || [],
        echecs: o.echecs || 0, termine: o.termine !== false,
        etat: o.etat, type: o.type || "sousagent",
      };
    }
    // 6 rôles, comme les 6 agents du graphe du prototype (spec/front1/
    // tests/security/front2/review) : une hauteur de disque COMPARABLE,
    // pas un artefact de compression dû à un plus petit nombre d'agents.
    var passages = [
      passage({ agent: "claude", debut: "2026-09-21T10:00:00.000Z", type: "principal" }),
      passage({ agent: "spec-reader", debut: "2026-09-21T10:00:01.000Z", termine: true }),
      passage({ agent: "frontend-developer", debut: "2026-09-21T10:00:05.000Z", termine: false, fichiers: ["a"] }),
      passage({ agent: "test-engineer", debut: "2026-09-21T10:00:10.000Z", echecs: 2 }),
      passage({ agent: "security-reviewer", debut: "2026-09-21T10:00:12.000Z", termine: true }),
      passage({ agent: "code-reviewer", debut: "2026-09-21T10:00:15.000Z", termine: false }),
    ];
    var wf1 = { segments: passages, passages: passages };
    var sigles = siglesAgents(Array.from(collecterRoles([wf1])));
    // `construireDiagramme` SUPPRIMÉE (feature-028, lot C1, accordéon
    // « Cycles » retiré) : retargeté vers `construireGrapheAgents`, le
    // point d'entrée bas niveau qu'elle enveloppait — MÊME rendu.
    document.getElementById('cycle-canvas').appendChild(
      construireGrapheAgents(disposer(wf1.segments), sigles, null));

    rendreKanban({
      colonnes: [
        { repertoire: "todo", classe: "todo", libelle: "Todo" },
        { repertoire: "doing", classe: "doing", libelle: "Doing" },
        { repertoire: "done", classe: "done", libelle: "Done" },
      ],
      specs: [
        { id: "F-001", titre: "a", colonne: "todo", priorite: "Basse", divergence: false, statut_texte: "todo" },
        { id: "F-002", titre: "b", colonne: "todo", priorite: "Haute", divergence: true, statut_texte: "doing" },
        { id: "F-003", titre: "c", colonne: "doing", priorite: "Critique — urgent", divergence: false, statut_texte: "doing" },
      ],
      divergences: 1,
    });

    // `rendreAgents` SUPPRIMÉE (U1 de feature-021, feature-028 lot A1) : la
    // section « Agents » a disparu, rien à peindre ici pour elle.

    // Sélectionne un agent RÉEL du graphe (clic, pas un appel direct) pour
    // peupler la bottom sheet de détail (F11, ancres `selected-*`).
    var premierNoeud = document.querySelector('.agent-node');
    if (premierNoeud) premierNoeud.click();

    // feature-025 (lots 9-10) — MÊMES trois états balayés côté prototype
    // (menu ouvert, dialogue de détail ouvert, formulaire d'ajout ouvert),
    // par les MÊMES gestionnaires réels (clic), même « cimetière » pour le
    // menu (fermé par l'ouverture du dialogue, comme côté prototype :
    // `document.addEventListener('click', …)` dans app.js le referme dès
    // qu'un clic tombe hors de lui).
    //
    // ⚠️ `#feature-dialog` diverge d'UN point du prototype : son ouverture
    // RÉELLE (`ouvrirDetailFeature`, sur clic de `.card-title-button`) passe
    // par `GET /api/spec` — réseau ABSENT de cette scène statique (servie
    // par un simple fichier, pas `server.py`). Peupler puis ouvrir le
    // dialogue À LA MAIN ci-dessous reproduit EXACTEMENT ce que cette
    // fonction pose sur le DOM une fois la réponse reçue (mêmes id, même
    // `showModal()`) — un test double délibéré, pas une divergence de
    // fidélité : c'est la MÊME raison que `rendreKanban` est appelée
    // directement plus haut avec des données synthétiques, plutôt que via
    // `/api/etat`.
    var cimetiere2 = document.createElement('div');
    cimetiere2.setAttribute('aria-hidden', 'true');
    document.body.appendChild(cimetiere2);

    var premierPlus = document.querySelector('.more-button');
    if (premierPlus) premierPlus.click();
    var menu = document.getElementById('context-menu');
    if (menu && !menu.hidden) cimetiere2.appendChild(menu.cloneNode(true));

    var fd = document.getElementById('feature-dialog');
    if (fd) {
      document.getElementById('feature-kind').textContent = 'Feature';
      document.getElementById('feature-title').textContent = 'F-001 · a';
      var statut = document.getElementById('feature-status');
      statut.className = 'feature-chip todo';
      statut.textContent = 'todo';
      var priorite = document.getElementById('feature-priority');
      priorite.className = 'feature-chip high';
      priorite.textContent = 'Haute';
      document.getElementById('feature-agent').textContent = 'Agent · non déterminé par le dépôt';
      // Longueur COMPARABLE à `featureDetails['F-023']` du prototype (la
      // première carte cliquée des deux côtés) : une description d'une
      // phrase et TROIS critères — sinon la hauteur du dialogue diverge et
      // décale la bande verticale d'éléments qui n'ont rien à voir avec lui
      // (mesuré : les connecteurs SVG du graphe migraient de bande).
      document.getElementById('feature-description').textContent =
        'Permettre un remboursement partiel avec génération automatique d’un avoir.';
      var crit = document.getElementById('feature-criteria');
      ['Saisir un montant inférieur au paiement initial',
       'Tracer chaque remboursement dans l’historique',
       'Empêcher un cumul supérieur au montant encaissé'].forEach(function (texte) {
        var li = document.createElement('li');
        li.textContent = texte;
        crit.appendChild(li);
      });
      document.getElementById('feature-dependency').textContent = 'API avoirs';
      document.getElementById('feature-updated').textContent = 'Il y a 18 min';
      if (typeof fd.showModal === 'function') fd.showModal();
    }

    var ouvrirAjout = document.getElementById('open-add-item');
    if (ouvrirAjout) ouvrirAjout.click();

    out.mesure = fideliteMesurer(""" + ancres_json + r""");
  } catch (e) {
    out.erreur = String((e && e.stack) || e);
  }
  document.title = JSON.stringify(out);
}());
"""


def construire_page_cockpit(base_http, script):
    chemin_index = os.path.join(_ICI, "index.html")
    with open(chemin_index, "r", encoding="utf-8") as f:
        html_reel = f.read()
    import re
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
    ) % {"base": base_http, "corps": corps, "script": script}


class _HandlerMaquette(BaseHTTPRequestHandler):
    """Sert le prototype normatif AVEC le script de mesure injecté avant
    `</body>` — jamais un second exemplaire écrit à la main (le fichier
    servi est lu tel quel sur disque, une seule insertion)."""

    script_mesure = ""

    def do_GET(self):
        if self.path not in ("/", "/" + _MAQUETTE_NOM):
            self.send_response(404)
            self.end_headers()
            return
        chemin = os.path.join(_MAQUETTES, _MAQUETTE_NOM)
        with open(chemin, "r", encoding="utf-8") as f:
            contenu = f.read()
        if "</body>" not in contenu:
            raise RuntimeError("ATTEIGNABILITE : aucune balise </body> dans le prototype")
        contenu = contenu.replace(
            "</body>", "<script>%s</script></body>" % self.script_mesure, 1
        )
        corps = contenu.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def log_message(self, fmt, *args):
        pass


def _mesurer_page(navigateur, url_ou_fichier, fichier_page=None):
    cible = url_ou_fichier if fichier_page is None else ("file://" + fichier_page)
    res = _lancer_navigateur([
        navigateur, "--headless", "--disable-gpu", "--no-sandbox",
        "--force-device-scale-factor=1", "--hide-scrollbars",
        # ⚠️ Fige la RÉFÉRENCE. Le prototype est une démo qui se joue seule
        # (`demoTimer = setInterval(...)` l.1037, `metricTimer` l.1251) et
        # `playing = !reducedMotion` (l.895) : sous ce drapeau, elle ne
        # démarre JAMAIS. Sans lui, la signature peinte du prototype dépend
        # de la phase de la démo à l'instant du relevé — mesuré : 1 échec
        # sur 6 sous charge, toujours sur `B_box_shadow_...`, la valeur
        # `--primary` à 8 % du halo d'un agent ACTIF n'apparaissant que
        # lorsque la démo a atteint cette étape. Posé des DEUX côtés : un
        # drapeau asymétrique rendrait la comparaison fausse. Effet second
        # utile : les `transition` (`.agent-node` porte `box-shadow 460ms`)
        # ne sont plus échantillonnées à mi-course.
        "--force-prefers-reduced-motion",
        "--virtual-time-budget=3000", "--window-size=1440,1000",
        "--dump-dom", cible,
    ])
    if res.returncode != 0:
        raise RuntimeError("Chromium a rendu le code %d\n%s" % (res.returncode, res.stderr[-2000:]))
    dom = res.stdout
    debut = dom.find("<title>")
    fin = dom.find("</title>")
    if debut < 0 or fin < 0:
        raise RuntimeError("ATTEIGNABILITE : aucun <title> dans le DOM rendu (%d octets)" % len(dom))
    mesures = json.loads(_html.unescape(dom[debut + 7:fin]))
    if mesures.get("erreur"):
        raise RuntimeError("le script de la page a levé :\n%s" % mesures["erreur"])
    return mesures["mesure"]


def main():
    navigateur = trouver_navigateur()
    if not navigateur:
        print("ℹ️  Aucun binaire Chromium trouvé — harnais sauté.")
        return 0
    derive = deriver()
    if derive is None:
        print("ℹ️  `node` introuvable — harnais sauté.")
        return 0

    for nom in ("app.css", "app.js", "diagramme.js", "index.html"):
        chemin = os.path.join(_ICI, nom)
        if not os.path.exists(chemin) or os.path.getsize(chemin) == 0:
            print("ECHEC ATTEIGNABILITE : %s est absent ou vide à %s" % (nom, chemin))
            return 1
    if not os.path.exists(os.path.join(_MAQUETTES, _MAQUETTE_NOM)):
        print("ECHEC ATTEIGNABILITE : prototype introuvable à %s" %
              os.path.join(_MAQUETTES, _MAQUETTE_NOM))
        return 1

    ancres = derive["ancres"]
    check("atteignabilite_ancres_non_vide", len(ancres) > 10, "obtenu %d" % len(ancres))
    print("[atteignabilité] %d ancre(s) « adopté, déjà livré » dérivée(s) de la table F0" % len(ancres))
    ancres_json = json.dumps(ancres)

    # -- Serveur du PROTOTYPE, port > 8800 (jamais 8788, PIEGES §2) --------
    serveur_maquette = ThreadingHTTPServer(("127.0.0.1", 0), _HandlerMaquette)
    serveur_maquette.daemon_threads = True
    _HandlerMaquette.script_mesure = _script_scene_prototype(ancres_json)
    port_maquette = serveur_maquette.server_address[1]
    check("atteignabilite_port_maquette_au_dessus_de_8800", port_maquette > 8800,
          "obtenu %d" % port_maquette)
    fil_maquette = threading.Thread(target=serveur_maquette.serve_forever, daemon=True)
    fil_maquette.start()

    # -- Serveur du COCKPIT (même motif que les autres harnais navigateur) -
    dossier_isole = tempfile.mkdtemp(prefix="cc-test-fidelite-config-")
    chemin_config_isole = os.path.join(dossier_isole, "n-existe-jamais.toml")
    racine_reelle = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(SRV.__file__))))
    config = C.charger(chemin=chemin_config_isole, racine_projet=racine_reelle)
    serveur_cockpit = ThreadingHTTPServer(("127.0.0.1", 0), SRV.Handler)
    serveur_cockpit.daemon_threads = True
    serveur_cockpit.etat = SRV.Etat(config)
    serveur_cockpit.servables = SRV._fichiers_servables()
    base_cockpit = "http://127.0.0.1:%d" % serveur_cockpit.server_address[1]
    fil_cockpit = threading.Thread(target=serveur_cockpit.serve_forever, daemon=True)
    fil_cockpit.start()

    try:
        url_maquette = "http://127.0.0.1:%d/%s" % (port_maquette, _MAQUETTE_NOM)
        mesure_proto = _mesurer_page(navigateur, url_maquette)
        # ⚠️ La référence doit PROUVER sa stabilité, pas seulement être
        # configurée pour l'être. Un second relevé, identique en tous
        # points : si les deux diffèrent, l'attendu bouge d'un run à
        # l'autre et TOUTE comparaison en aval est un tirage au sort. Une
        # garde dont l'attendu varie est pire qu'absente — on apprend à
        # l'ignorer (bug-022 : sept runs rouges avant qu'on cesse de
        # croire au hasard).
        mesure_proto_bis = _mesurer_page(navigateur, url_maquette)

        page_cockpit = construire_page_cockpit(base_cockpit, _script_scene_cockpit(ancres_json))
        with tempfile.TemporaryDirectory(prefix="cc-test-fidelite-page-") as dossier:
            fichier = os.path.join(dossier, "harnais.html")
            with open(fichier, "w", encoding="utf-8") as f:
                f.write(page_cockpit)
            mesure_cockpit = _mesurer_page(navigateur, None, fichier_page=fichier)
    except RuntimeError as e:
        print("ECHEC : %s" % e)
        return 1
    finally:
        serveur_maquette.shutdown()
        serveur_maquette.server_close()
        serveur_cockpit.shutdown()
        serveur_cockpit.server_close()

    # -- La référence est-elle stable ? (avant toute comparaison) ---------
    for _prop in ("borderRadius", "boxShadow"):
        _un = sorted(mesure_proto["histogramme"][_prop])
        _deux = sorted(mesure_proto_bis["histogramme"][_prop])
        _ecart = sorted(set(_un) ^ set(_deux))
        check("REFERENCE_stable_entre_deux_releves_" + _prop,
              _un == _deux,
              "la référence a BOUGÉ entre deux relevés — %d valeur(s) d'écart : %s "
              "(l'attendu varie d'un run à l'autre, aucune comparaison en aval n'a de sens)"
              % (len(_ecart), ", ".join(_ecart[:6])))

    check("atteignabilite_noeuds_prototype_visites", mesure_proto["noeudsVisites"] > 100,
          "obtenu %d" % mesure_proto["noeudsVisites"])
    check("atteignabilite_noeuds_cockpit_visites", mesure_cockpit["noeudsVisites"] > 100,
          "obtenu %d" % mesure_cockpit["noeudsVisites"])
    print("[dérivé] prototype : %d nœud(s) visité(s), %d ancre(s) mesurée(s) ; cockpit : %d nœud(s), %d ancre(s)" % (
        mesure_proto["noeudsVisites"], len(mesure_proto["ancres"]),
        mesure_cockpit["noeudsVisites"], len(mesure_cockpit["ancres"])))

    # ===================================================================== #
    # A. PAR ANCRE
    # ===================================================================== #
    ancres_communes = sorted(set(mesure_proto["ancres"]) & set(mesure_cockpit["ancres"]))
    check("A_ancres_communes_non_vide", len(ancres_communes) > 5, "obtenu %d" % len(ancres_communes))

    divergences_forme = []
    divergences_largeur = []
    for aid in ancres_communes:
        vp = mesure_proto["ancres"][aid]
        vc = mesure_cockpit["ancres"][aid]
        if vp["forme"] != vc["forme"]:
            divergences_forme.append("#%s : prototype=%s cockpit=%s" % (aid, vp["forme"], vc["forme"]))
        if aid not in ANCRES_LARGEUR_NON_COMPARABLE:
            if vp["largeurFenetre"] is not None and vc["largeurFenetre"] is not None:
                ecart = abs(vp["largeurFenetre"] - vc["largeurFenetre"])
                # Tolérance MESURÉE, pas un nombre rond (PIEGES §20) : sur les
                # ancres retenues (largeur non dépendante du texte), l'écart
                # RÉELLEMENT observé entre les deux rendus est nul à l'estime
                # du sous-pixel (`--force-device-scale-factor=1`, fenêtre
                # fixée) — 0.5 % de la fenêtre (≈7px sur 1440) absorbe le seul
                # écart structurel mesuré (bordures partagées entre colonnes
                # de grille) sans masquer un vrai défaut de rayon/mise en page.
                if ecart > 0.005:
                    divergences_largeur.append("#%s : prototype=%.4f cockpit=%.4f (écart %.4f)" %
                                                (aid, vp["largeurFenetre"], vc["largeurFenetre"], ecart))

    check("A_vecteur_de_style_calcule_identique_par_ancre_commune", len(divergences_forme) == 0,
          str(len(divergences_forme)) + " divergence(s) : " + " | ".join(divergences_forme[:10]))
    check("A_largeur_normalisee_dans_la_tolerance_mesuree", len(divergences_largeur) == 0,
          str(len(divergences_largeur)) + " divergence(s) : " + " | ".join(divergences_largeur[:10]))

    # bug-030 : ces trois boutons perdaient `font: inherit` côté cockpit
    # (`.add-item-button`, `.feature-dialog-actions button`, `.form-buttons
    # button`) et retombaient sur la police par défaut du NAVIGATEUR pour les
    # contrôles de formulaire, jamais sur `--sans` posé sur `body` — un écart
    # invisible à `A_vecteur_de_style_calcule_identique_par_ancre_commune`
    # (qui ne compare que `borderRadius`/`boxShadow`) et qui ne se manifestait
    # qu'INDIRECTEMENT, par la largeur du texte peint, dépendante des polices
    # installées sur la machine (rouge en CI, vert ici — cf. commentaire sur
    # `fontFamilleCalculee`). Portée délibérément étroite à ces trois ancres,
    # PAS à toutes les ancres communes : voir la note sur `#selected-code`.
    ANCRES_POLICE_HERITEE_DU_CORPS = {"open-add-item", "feature-edit", "cancel-add-item"}
    divergences_police = []
    for aid in ANCRES_POLICE_HERITEE_DU_CORPS & set(ancres_communes):
        vp = mesure_proto["ancres"][aid]["fontFamille"]
        vc = mesure_cockpit["ancres"][aid]["fontFamille"]
        if vp != vc:
            divergences_police.append("#%s : prototype=%s cockpit=%s" % (aid, vp, vc))
    check("A_police_heritee_du_corps_pour_les_boutons_bug030", len(divergences_police) == 0,
          str(len(divergences_police)) + " divergence(s) : " + " | ".join(divergences_police))

    # Ordre vertical : la séquence des ancres COMMUNES, dans l'ordre où
    # chaque page les peint, doit être la MÊME séquence relative — modulo
    # ANCRES_ORDRE_NON_COMPARABLE (motif nommé). Comparée par BANDE, pas par
    # rang exact : des ancres du MÊME groupe visuel (icône+texte voisins
    # d'une même bande de résumé, ex. `summary-active`/`summary-step`/
    # `summary-time`) peuvent avoir un `top` qui diffère de quelques pixels
    # SANS q'aucun ordre de lecture ne soit inversé — comparer le rang exact
    # les ferait échouer pour la MAUVAISE raison (règle non négociable n°2).
    # SEUIL mesuré, pas un nombre rond (PIEGES §20) : l'écart intra-groupe le
    # plus grand relevé (`summary-step` vs `summary-active`/`summary-time`,
    # prototype) est de 19px ; l'écart inter-groupe le plus petit relevé
    # (`selected-tools` → `backlog-title`) est de 104px. 40px se tient au
    # milieu, avec marge des deux côtés — pas au ras d'une des deux valeurs.
    SEUIL_BANDE_PX = 40

    def bandes(mesure, ids):
        classes = sorted(ids, key=lambda i: mesure["ancres"][i]["top"])
        groupes = []
        for i in classes:
            top = mesure["ancres"][i]["top"]
            if groupes and abs(top - groupes[-1]["dernierTop"]) < SEUIL_BANDE_PX:
                groupes[-1]["ids"].add(i)
                groupes[-1]["dernierTop"] = top
            else:
                groupes.append({"ids": {i}, "dernierTop": top})
        return [frozenset(g["ids"]) for g in groupes]

    cible_ordre = set(ancres_communes) - set(ANCRES_ORDRE_NON_COMPARABLE)
    bandes_proto = bandes(mesure_proto, cible_ordre)
    bandes_cockpit = bandes(mesure_cockpit, cible_ordre)
    check("A_ordre_vertical_des_ancres_communes_identique_par_bande",
          bandes_proto == bandes_cockpit,
          "prototype=%s cockpit=%s" % (bandes_proto, bandes_cockpit))

    # ===================================================================== #
    # B. SIGNATURE GLOBALE (histogrammes)
    # ===================================================================== #
    def valeurs_ajoutees_declarees(prop):
        return {e["val"] for e in AJOUTS_HISTOGRAMME_DECLARES.get(prop, [])}

    for prop, cle in (("border-radius", "borderRadius"), ("box-shadow", "boxShadow")):
        valeurs_proto = set(mesure_proto["histogramme"][cle].keys())
        valeurs_cockpit = set(mesure_cockpit["histogramme"][cle].keys())
        ajoutees = valeurs_ajoutees_declarees(prop)
        hors_signature = valeurs_cockpit - valeurs_proto - ajoutees
        check("B_" + prop.replace("-", "_") + "_peint_par_le_cockpit_appartient_a_la_signature_du_prototype",
              len(hors_signature) == 0,
              str(len(hors_signature)) + " valeur(s) peinte(s) par le cockpit, absente(s) de la signature "
              "du prototype ET hors AJOUTS_HISTOGRAMME_DECLARES : " + ", ".join(sorted(hors_signature)[:10]))
        # Purge : un ajout déclaré désormais présent côté prototype est périmé.
        perimes = ajoutees & valeurs_proto
        check("B_" + prop.replace("-", "_") + "_aucun_ajout_histogramme_perime",
              len(perimes) == 0, ", ".join(sorted(perimes)) + " appartiennent maintenant à la signature du prototype")

    print("\n" + str(_tests) + " cas, " + str(len(_echecs)) + " echec(s)")
    for e in _echecs:
        print("  - " + e)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
