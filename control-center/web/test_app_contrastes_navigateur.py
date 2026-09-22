#!/usr/bin/env python3
"""F5b — CONTRASTES, PHASE PEINTE (feature-021, cycle 2, lot 5).

    python3 control-center/web/test_app_contrastes_navigateur.py

F5a (`test_conformite_contrastes.js`) DÉRIVE la table des couples interdits
depuis le prototype (encre × surface, seuils 4,65/3,0) — une matrice
purement ARITHMÉTIQUE, qui ne regarde jamais ce qui est réellement peint.
Ce fichier ferme le trou nommé par l'architecte (notes d'implémentation
cycle 2, §1, phase B) : `getComputedStyle`, jamais l'arithmétique — c'est
aussi ce qui referme le trou laissé par les jetons en `color-mix()`
(`--trait-fin`, `--ombre`, `--voile`) qu'AUCUNE garde arithmétique ne sait
calculer (F1/F5a lisent les hex du `:root`, pas la fonction).

Méthode
-----------------------------------------------------------------------------
1. La matrice `COUPLES_INTERDITS` est DÉRIVÉE une seule fois, par un pont
   Node vers `test_conformite_contrastes_lib.js` (le MÊME module que F5a,
   jamais une recopie — PIEGES §21) : c'est la SORTIE d'un calcul, jamais
   une liste écrite ici.
2. Un vrai serveur HTTP (en mémoire, même motif que
   `test_app_navigation_http.py`) sert `app.css`/`diagramme.js`/`app.js` —
   PIEGES §10 : un `file://` ne prouve rien sur ce qui est réellement SERVI
   (`_TYPES`, MIME). Seule la page ENVELOPPE (CSP interdirait tout script
   inline sur une page réellement servie, PIEGES §9) est chargée en
   `file://`, comme `test_app_a11y_navigateur.py`.
3. La page enveloppe construit plusieurs scènes représentatives (disques
   dans tous les états F16, kanban avec priorité/divergence, porte ouverte,
   bandeau d'hôte, jauges dans leurs variantes, légende, agents, système) —
   PAS le bootstrap réel (`verifierEtatAuth`/`fetch`/`EventSource`), qui
   échouerait en CORS depuis une page `file://` sans rien prouver de plus
   (PIEGES §28 : neutraliser la source d'événements avant de mesurer —
   ici, ne jamais l'ouvrir).
4. Pour CHAQUE nœud portant du texte non vide : `color` calculée, puis
   remontée des ancêtres jusqu'au premier `background-color` dont l'alpha
   ≠ 0 (le fond RÉELLEMENT peint, jamais la règle qui le déclare, PIEGES
   §24). Chaque `rgb()` est réapparié à son nom de jeton via les valeurs
   `:root` lues au runtime (`getComputedStyle(documentElement)`) — un
   couple peint qui ne correspond à AUCUN jeton connu est un ÉCHEC en soi
   (il attraperait un hex codé en dur réintroduit).
5. Les traits (`border-color` visible, `stroke`) sont parcourus à part, au
   seuil 3,0 (même distinction de rôle que F5a).
6. Assertion : `COUPLES_INTERDITS ∩ couples_peints = ∅`, et le compte de
   nœuds visités est assertionné non nul (sans quoi la garde serait verte
   à vide).

Saute proprement si Chromium OU `node` est introuvable.
"""

HARNAIS_NAVIGATEUR = True

import json
import os
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


_NODE_DERIVATION = r"""
const lib = require("./test_conformite_lib.js");
const { deriverMatriceContraste } = require("./test_conformite_contrastes_lib.js");
const css = lib.extraireBlocStyle(lib.lirePrototype());
const m = deriverMatriceContraste(css);
process.stdout.write(JSON.stringify({
  JETONS: m.JETONS,
  ROLES: m.ROLES,
  SEUIL: m.SEUIL,
  COUPLES_INTERDITS: m.COUPLES_INTERDITS.map((c) => ({ encre: c.encre, fond: c.fond, role: c.role, contraste: c.contraste })),
  rolesManquants: m.rolesManquants,
  rolesPerimes: m.rolesPerimes,
  USAGES_APLAT: m.USAGES_APLAT,
  SEUIL_APLAT_INDICATEUR: m.SEUIL_APLAT_INDICATEUR,
  INDICATEUR: m.INDICATEUR,
}));
"""


def deriver_matrice():
    node = shutil.which("node")
    if not node:
        return None
    res = subprocess.run([node, "-e", _NODE_DERIVATION], cwd=_ICI,
                          capture_output=True, text=True, timeout=30)
    if res.returncode != 0:
        raise RuntimeError("dérivation Node échouée : %s" % res.stderr[-1000:])
    return json.loads(res.stdout)


_SCRIPT_MESURE = r"""
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

    // -- scène 1 : le graphe d'agents, tous les états F16 réunis ----------
    var passages = [
      passage({ agent: "claude", debut: "2026-09-21T10:00:00.000Z", type: "principal" }),
      passage({ agent: "backend-developer", debut: "2026-09-21T10:00:05.000Z", termine: false, fichiers: ["a", "b"] }),
      passage({ agent: "test-engineer", debut: "2026-09-21T10:00:10.000Z", echecs: 2 }),
      passage({ agent: "doc-writer", debut: "2026-09-21T10:00:15.000Z", etat: "sans_cloture" }),
      passage({ agent: "frontend-developer", debut: "2026-09-21T10:00:20.000Z", fichiers: ["x", "y", "z", "w"] }),
    ];
    var wf = { segments: passages, passages: passages };
    var sigles = siglesAgents(Array.from(collecterRoles([wf])));
    document.getElementById('cycle-canvas').appendChild(construireDiagramme(wf, sigles));

    // -- scène 2 : kanban, priorité haute + divergence ---------------------
    var etat = {
      colonnes: [
        { repertoire: "todo", classe: "todo", libelle: "Todo" },
        { repertoire: "doing", classe: "doing", libelle: "Doing" },
        { repertoire: "done", classe: "done", libelle: "Done" },
      ],
      specs: [
        { id: "F-001", titre: "Un premier exemple", colonne: "todo", priorite: "Haute", divergence: false, statut_texte: "todo" },
        { id: "F-002", titre: "Divergence visible", colonne: "todo", priorite: "Basse", divergence: true, statut_texte: "doing" },
        { id: "F-003", titre: "En cours", colonne: "doing", priorite: "Critique — urgent", divergence: false, statut_texte: "doing" },
        { id: "F-004", titre: "Terminé", colonne: "done", priorite: null, divergence: false, statut_texte: "done" },
      ],
      divergences: 1,
    };
    rendreKanban(etat);

    // -- scène 3 : agents + système, jauges dans leurs variantes -----------
    rendreAgents([
      { nom: "frontend-developer", actif_sur: "F-003", modele: "sonnet", peut_ecrire: true, outils: ["Read"], peut_deleguer: false, description: "d" },
      { nom: "backend-developer", actif_sur: null, modele: "sonnet", peut_ecrire: false, outils: [], peut_deleguer: true, description: "d" },
    ]);
    rendreSysteme({
      ecriture_active: false, git: { depot: true, branche: "main", touches: [1, 2] },
      divergences: 1, workflows: [1], config_lue: true, commandes_declarees: [],
      garde_fous: { budget_max_usd: 5, ecrivains_simultanes: 1 },
    });
    document.getElementById('jauge-git').className = 'jauge ok';
    document.getElementById('jauge-flux').className = 'jauge ko';
    document.getElementById('jauge-pilotage').className = 'jauge lecture-seule';

    // -- scène 3bis : conversation (feature-022, lot 11) — panneau
    // disponible, un message persisté + le statut réel d'un agent actif :
    // peint `.claude-mark`/`.message-avatar`/`.bubble` (aucun autre scénario
    // de ce fichier ne les atteint, sinon le balayage ci-dessous mesurerait
    // un contraste jamais réellement peint — PIEGES §38/§55).
    conversation.phase = "disponible";
    conversation.messages = [{ ts: Date.parse("2026-09-21T10:00:00.000Z"), texte: "un message utilisateur" }];
    conversation.tronque = false;
    dernierEtat = Object.assign({}, dernierEtat, { ecriture_active: true, agents: [{ nom: "frontend-developer", actif_sur: "F-003" }] });
    rendreConversation();

    // -- scène 4 : bandeau d'hôte, alerte ----------------------------------
    afficherBandeauHote('reseau');

    // -- scène 5 : la porte ouverte -----------------------------------------
    ouvrirPorte('premier-acces');

    // -- balayage : chaque nœud texte non vide, chaque trait visible -------
    function couleurEffective(prop, noeud) {
      var n = noeud;
      while (n && n.nodeType === 1) {
        var c = getComputedStyle(n).getPropertyValue(prop);
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c;
        n = n.parentElement;
      }
      return null;
    }

    var jetonsRuntime = {};
    Object.keys(%(jetons)s).forEach(function (nom) {
      if (nom.charAt(0) === '-') {
        var v = getComputedStyle(document.documentElement).getPropertyValue(nom).trim();
        if (v) jetonsRuntime[nom] = v;
      }
    });

    var couplesPeints = [];
    var noeudsTexte = 0;
    var marcheur = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var n;
    while ((n = marcheur.nextNode())) {
      if (!n.nodeValue || !n.nodeValue.trim()) continue;
      var parent = n.parentElement;
      if (!parent) continue;
      var style = getComputedStyle(parent);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      noeudsTexte += 1;
      var couleur = style.color;
      var fond = couleurEffective('background-color', parent);
      if (couleur && fond) couplesPeints.push({ role: 'texte', couleur: couleur, fond: fond });
    }

    var traitsVus = 0;
    var SELECTEUR_TRAITS = 'button, .agent-node, .kanban-column, .feature-card, .cycle-etat, .porte-carte, [style*="border"], hr, path[stroke]';
    Array.prototype.forEach.call(document.querySelectorAll(SELECTEUR_TRAITS), function (el) {
      var style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      var bc = style.borderTopColor || style.borderColor;
      var bw = style.borderTopWidth;
      if (bc && bc !== 'rgba(0, 0, 0, 0)' && parseFloat(bw) > 0) {
        traitsVus += 1;
        var fond = couleurEffective('background-color', el.parentElement || el);
        if (fond) couplesPeints.push({ role: 'trait', couleur: bc, fond: fond });
      }
      var stroke = el.getAttribute && el.getAttribute('stroke');
      if (stroke && stroke !== 'none') {
        traitsVus += 1;
        couplesPeints.push({ role: 'trait', couleur: getComputedStyle(el).stroke || stroke, fond: 'rgb(255, 255, 255)' });
      }
    });

    /* -- balayage des APLATS (reboucle lot 5) ----------------------------
     * Un aplat est une forme PLEINE peinte en `background-color`, par
     * opposition à un filet (`border`) et à du texte. Les deux balayages
     * ci-dessus ne le voyaient pas : ils traitent `background-color`
     * uniquement comme le FOND d'une encre, jamais comme l'encre elle-même.
     * C'est ce trou qui laissait cinq usages de `--line` hors de toute
     * vérification quand le jeton a été reclassé `decor`.
     *
     * On ne retient que les formes SANS texte propre (une boîte de contenu
     * a déjà été jugée par le balayage de texte) et dont le fond diffère
     * réellement de ce qui est derrière — sinon rien n'est peint. */
    var aplatsPeints = [];
    var aplatsVus = 0;
    function balayerAplats() {
    Array.prototype.forEach.call(document.querySelectorAll('body *'), function (el) {
      var style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return;
      if (el.textContent && el.textContent.trim()) return;      // pas une forme pleine
      var propre = style.backgroundColor;
      if (!propre || propre === 'rgba(0, 0, 0, 0)' || propre === 'transparent') return;
      var r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;                 // rien de peint
      var derriere = couleurEffective('background-color', el.parentElement || el);
      if (!derriere || derriere === propre) return;              // invisible par identité
      aplatsVus += 1;
      // Quel usage DÉCLARÉ décrit cette forme ? `el.matches` fait foi, pas
      // une comparaison de noms de classe : c'est le même moteur de
      // sélecteurs que la cascade qui a peint l'élément.
      var declare = null;
      %(selecteurs_aplat)s.forEach(function (sel) {
        if (declare) return;
        try { if (el.matches(sel)) declare = sel; } catch (e) { /* sélecteur non matchable */ }
      });
      aplatsPeints.push({
        selecteur: declare,
        // L'aperçu porte le PARENT : deux `<i>` sans classe peuvent venir
        // d'endroits sans rapport (logotype, légende), et un message qui
        // dit seulement « i » n'aide personne à retrouver l'élément.
        apercu: (function (e) {
          var nom = function (x) {
            return x.tagName.toLowerCase() +
              (x.getAttribute('class') ? '.' + x.getAttribute('class').trim().split(/\s+/).join('.') : '') +
              (x.id ? '#' + x.id : '');
          };
          return (e.parentElement ? nom(e.parentElement) + ' > ' : '') + nom(e);
        })(el),
        couleur: propre,
        fond: derriere,
      });
    });
    }

    /* Deux passes, et la seconde est celle qui compte.
     *
     * Un indicateur d'état n'a qu'UN état peint à un instant donné : la
     * scène rend `.status-dot.actif` (teal), donc l'état INACTIF — celui
     * qui est justement peint dans le jeton le plus pâle — n'était jamais
     * balayé. Une mutation le repeignant en `--line` passait inaperçue :
     * la garde ne voyait pas la couleur qu'elle est censée juger.
     *
     * On balaye donc la scène telle quelle, puis on retire les classes
     * d'état des porteurs déclarés et on rebalaye. L'union des deux passes
     * est ce que l'utilisateur peut réellement voir au fil de la vie de la
     * page, pas seulement à l'instant de la capture. */
    balayerAplats();
    var CLASSES_ETAT = ['actif', 'active', 'parallel', 'reprise', 'on',
                        'column-todo', 'column-doing', 'column-done'];
    Array.prototype.forEach.call(document.querySelectorAll('body *'), function (el) {
      CLASSES_ETAT.forEach(function (c) { el.classList.remove(c); });
    });
    balayerAplats();

    out.jetonsRuntime = jetonsRuntime;
    out.couplesPeints = couplesPeints;
    out.noeudsTexte = noeudsTexte;
    out.traitsVus = traitsVus;
    out.aplatsPeints = aplatsPeints;
    out.aplatsVus = aplatsVus;
  } catch (e) {
    out.erreur = String(e && e.stack || e);
  }
  document.title = JSON.stringify(out);
}());
"""


def construire_page(base_http, jetons, selecteurs_aplat=()):
    return (
        '<!doctype html><html><head><meta charset="utf-8">'
        '<link rel="stylesheet" href="%(base)s/app.css">'
        "</head><body>"
        '<div class="bandeau-hote" id="bandeau-hote" role="alert" hidden>'
        '<p id="bandeau-hote-texte"></p>'
        '<button type="button" id="bandeau-hote-bouton" class="action-ecriture">Réessayer</button></div>'
        '<a class="skip-link" href="#main-content">Aller au contenu principal</a>'
        '<div class="app-shell">'
        '<header class="top-app-bar" id="barre"><div class="brand-row"><div class="brand">'
        '<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span>'
        '<span class="titre"><span class="marque">Centre de contrôle</span>'
        '<span class="projet" id="projet">démo</span></span></div></div>'
        '<div class="top-actions"><div class="status-inline">'
        '<span class="status-dot actif" aria-hidden="true" id="status-dot"></span>'
        '<span class="jauge" id="jauge-flux">flux</span>'
        '<span class="jauge" id="jauge-git">git</span>'
        '<span class="jauge lecture-seule" id="jauge-pilotage">lecture seule</span></div>'
        '<span class="horodatage" id="horodatage"></span></div></header>'
        '<main class="main" id="main-content" tabindex="-1">'
        '<div class="visually-hidden" id="a11y-announcement" aria-live="polite" aria-atomic="true"></div>'
        '<section class="summary-band" aria-label="Résumé">'
        '<div class="summary-item"><span class="summary-icon" aria-hidden="true">◴</span>'
        '<span class="summary-copy"><strong id="summary-step">2</strong><span>Étape en cours</span></span></div>'
        '<div class="summary-item"><span class="summary-icon" aria-hidden="true">◷</span>'
        '<span class="summary-copy"><strong id="summary-time">01:20</strong><span>Temps écoulé</span></span></div>'
        '<div class="summary-item"><span class="summary-icon" aria-hidden="true">●</span>'
        '<span class="summary-copy"><strong id="summary-active">1</strong><span>agents actifs</span></span></div>'
        '</section>'
        '<div class="workspace"><section class="cycle-surface" aria-labelledby="titre-cycle-surface">'
        '<div class="cycle-toolbar"><div class="cycle-tabs" role="group" aria-label="Vue des cycles">'
        '<button class="tab-button" type="button" aria-pressed="true">Cycle actif</button>'
        '<button class="tab-button" type="button" aria-pressed="false">Historique</button>'
        '<button class="small-button" type="button" id="cycle-indice">#3</button></div></div>'
        '<div class="cycle-heading-row"><div><h1 id="titre-cycle-surface">Centre de contrôle</h1>'
        '<p class="cycle-subtitle"><span class="live-label">vivant</span>'
        '<span id="cycle-status">Cycle #3</span></p></div>'
        '<div class="legend" role="group" aria-label="Légende des états">'
        '<span><i class="active"></i>Actif</span><span><i class="parallel"></i>Travail en parallèle</span>'
        '<span><i class="reprise"></i>Reprise</span><span><i></i>Non lancé</span></div></div>'
        '<p class="motion-note" id="motion-note"></p>'
        '<div class="cycle-canvas" id="cycle-canvas"></div>'
        '<section class="detail-sheet" aria-labelledby="selected-title">'
        '<div class="sheet-handle" aria-hidden="true"></div><div class="sheet-heading">'
        '<div class="selected-agent"><span class="selected-mark" id="selected-code">FE</span>'
        '<span class="selected-copy"><h2 id="selected-title">frontend-developer</h2>'
        '<p id="selected-task">en cours</p></span></div>'
        '<button class="sheet-toggle" id="sheet-toggle" type="button" aria-expanded="true" '
        'aria-controls="sheet-metrics" aria-label="Replier le détail"><span aria-hidden="true">⌄</span></button></div>'
        '<div class="sheet-metrics" id="sheet-metrics">'
        '<div class="metric"><span>Anneau · état</span><strong id="selected-state">actif</strong></div>'
        '<div class="metric"><span>Graduations · outils</span><strong id="selected-tools">3</strong></div>'
        '<div class="metric"><span>Points · fichiers</span><strong id="selected-files">2</strong></div>'
        '<div class="metric"><span>Sous le disque · durée</span><strong id="selected-duration">5 s</strong></div>'
        '</div></section>'
        '<p class="repo-strip" id="repo-strip"><span aria-hidden="true">◆</span>'
        '<span id="repo-strip-texte">main · 2 fichier(s)</span>'
        '<span class="ok" id="repo-strip-ok"><span aria-hidden="true">●</span>'
        '<span class="visually-hidden">dépôt accessible</span></span></p>'
        '</section>'
        # feature-022 (lot 11) : panneau de conversation, markup minimal
        # nécessaire pour que `rendreConversation()` trouve `#conversation`
        # et peigne réellement `.claude-mark`/`.message-avatar`/`.bubble` —
        # sans ce fragment, le scénario 3bis s'exécute mais `$("conversation")`
        # rend `null` et la fonction sort sans rien peindre (PIEGES §38).
        '<aside class="claude-panel" aria-labelledby="claude-title">'
        '<div class="claude-title"><div class="claude-ident">'
        '<span class="claude-mark" aria-hidden="true">✺</span>'
        '<span><h2 id="claude-title">Claude</h2>'
        '<span class="claude-status" id="claude-status">…</span></span></div>'
        '<button class="icon-button" type="button" aria-disabled="true" aria-label="Options"><span aria-hidden="true">⋮</span></button>'
        '</div>'
        '<div class="conversation" id="conversation" aria-live="polite"><p class="vide">chargement…</p></div>'
        '<div class="question" id="claude-question" hidden><strong>Question en attente</strong><p id="claude-question-texte"></p></div>'
        '<form class="composer" id="composer"><label class="visually-hidden" for="prompt">Répondre à Claude</label>'
        '<input id="prompt" autocomplete="off" placeholder="Répondre à Claude…" maxlength="8192" disabled>'
        '<button class="send-button" id="envoyer-conversation" type="submit" aria-label="Envoyer le message" disabled>'
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m22 2-7 20-4-9-9-4Z"></path><path d="M22 2 11 13"></path></svg></button></form>'
        '<p class="note" id="composer-etat" aria-live="polite"></p>'
        '<p class="note erreur" id="conversation-erreur" role="alert" hidden></p>'
        '</aside>'
        '</div>'
        '<section class="bloc" aria-labelledby="titre-agents"><h2 id="titre-agents">Agents</h2>'
        '<p class="note" id="note-agents"></p><ul class="agents" id="agents"></ul></section>'
        '<section class="bloc" aria-labelledby="titre-systeme"><h2 id="titre-systeme">Système</h2>'
        '<dl class="systeme" id="systeme"></dl></section>'
        '<section class="bloc demande" aria-labelledby="titre-demande">'
        '<h2 id="titre-demande">Que souhaitez-vous développer ?</h2>'
        '<div class="champ-titre"><label for="titre-besoin">Titre</label>'
        '<input type="text" id="titre-besoin" maxlength="200"></div>'
        '<textarea id="spec-prompt" rows="4"></textarea>'
        '<span class="compteur" id="compteur-prompt">0 caractère</span>'
        '<p class="note avert">Aucun secret.</p>'
        '<label class="bascule"><input type="checkbox" id="derogation-minimale"><span>Minimal</span></label>'
        '<p class="note erreur" id="erreur-generer-brouillon" role="alert" hidden></p>'
        '<div class="pilotage-boutons"><button type="button" id="bouton-generer-brouillon" '
        'class="pilotage-secondaire">Générer le brouillon</button></div>'
        '<div id="redaction-corps"></div></section>'
        '<section class="backlog" aria-labelledby="backlog-title"><div class="kanban-heading">'
        '<div class="kanban-title-row entete-bloc"><h2 id="backlog-title">Spécifications</h2>'
        '<span class="compteur" id="compteur-specs"></span>'
        '<span class="backlog-count visually-hidden" id="backlog-count">—</span></div>'
        '<div class="kanban-actions filtres"><input type="search" id="filtre">'
        '<label class="bascule"><input type="checkbox" id="filtre-divergences"><span>divergences</span></label>'
        '</div></div>'
        '<div class="kanban-viewport" tabindex="0" role="region" aria-label="Backlog">'
        '<div class="kanban-grid" id="kanban"></div></div>'
        '<span id="backlog-column-count" class="visually-hidden">—</span></section>'
        '<section class="bloc" aria-labelledby="titre-pilotage"><h2 id="titre-pilotage">Pilotage</h2>'
        '<div id="pilotage-corps"><p class="vide">chargement…</p></div></section>'
        '<section class="bloc" aria-labelledby="titre-cycles"><div class="entete-bloc">'
        '<h2 id="titre-cycles">Cycles</h2></div><p class="note" id="legende-cycles"></p>'
        '<ul id="workflows" class="cycles"></ul><p class="note" id="pied-cycles"></p></section>'
        '<section class="bloc" aria-labelledby="titre-fichiers"><h2 id="titre-fichiers">Fichiers touchés</h2>'
        '<div id="fichiers"></div></section>'
        '<section class="bloc" aria-labelledby="titre-evenements"><h2 id="titre-evenements">Derniers événements</h2>'
        '<ol class="timeline" id="timeline"></ol></section>'
        "</main></div>"
        '<div class="tiroir" id="tiroir" hidden><div class="tiroir-barre"><span id="tiroir-titre"></span>'
        '<button type="button" id="tiroir-fermer" aria-label="Fermer">✕</button></div>'
        '<pre id="tiroir-contenu"></pre></div>'
        '<div class="porte" id="porte-jeton" role="dialog" aria-modal="true" '
        'aria-labelledby="porte-titre" hidden><div class="porte-fond"></div><div class="porte-carte">'
        '<h2 id="porte-titre"></h2><p id="porte-corps" class="note"></p>'
        '<label for="porte-champ">Jeton de pilotage</label>'
        '<input type="password" id="porte-champ" aria-describedby="porte-aide">'
        '<p id="porte-aide" class="note"></p><p id="porte-erreur" class="note" role="alert" hidden></p>'
        '<button type="button" id="porte-bouton" class="action-ecriture">Ouvrir</button></div></div>'
        '<script src="%(base)s/diagramme.js"></script>'
        '<script src="%(base)s/app.js"></script>'
        "<script>%(script)s</script>"
        "</body></html>"
    ) % {
        "base": base_http,
        "script": _SCRIPT_MESURE % {
            "jetons": json.dumps(jetons),
            "selecteurs_aplat": json.dumps(list(selecteurs_aplat)),
        },
    }


def hex_vers_rgb(hexv):
    h = hexv.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    n = int(h[:6], 16)
    return (n >> 16) & 255, (n >> 8) & 255, n & 255


def rgb_texte_vers_tuple(txt):
    txt = txt.strip()
    if not txt.startswith("rgb"):
        return None
    interieur = txt[txt.find("(") + 1:txt.find(")")]
    parts = [p.strip() for p in interieur.split(",")]
    try:
        return tuple(int(round(float(p))) for p in parts[:3])
    except ValueError:
        return None


def contraste_rgb(rgb_a, rgb_b):
    """Contraste WCAG 2.x entre deux triplets RGB déjà résolus.

    Même formule que `contraste()` de `test_conformite_contrastes_lib.js`,
    mais appliquée à ce que le NAVIGATEUR a résolu, pas à un hex du
    prototype : un aplat peut être peint par une variable, un `color-mix()`
    ou une surcharge, et seule la valeur calculée dit ce qu'on voit.
    """
    def canal(c):
        s = c / 255
        return s / 12.92 if s <= 0.03928 else ((s + 0.055) / 1.055) ** 2.4

    def lum(rgb):
        r, g, b = (canal(x) for x in rgb)
        return 0.2126 * r + 0.7152 * g + 0.0722 * b

    la, lb = lum(rgb_a), lum(rgb_b)
    clair, sombre = (la, lb) if la >= lb else (lb, la)
    return (clair + 0.05) / (sombre + 0.05)


def main():
    navigateur = trouver_navigateur()
    if not navigateur:
        print("ℹ️  Aucun binaire Chromium trouvé — harnais sauté.")
        return 0
    matrice = deriver_matrice()
    if matrice is None:
        print("ℹ️  `node` introuvable — harnais sauté (dérivation de la matrice dépend de "
              "test_conformite_contrastes_lib.js).")
        return 0

    for nom in ("app.css", "app.js", "diagramme.js"):
        chemin = os.path.join(_ICI, nom)
        if not os.path.exists(chemin) or os.path.getsize(chemin) == 0:
            print("ECHEC ATTEIGNABILITE : %s est absent ou vide à %s" % (nom, chemin))
            return 1

    print("[atteignabilité] matrice dérivée : %d jeton(s), %d couple(s) interdit(s)"
          % (len(matrice["JETONS"]), len(matrice["COUPLES_INTERDITS"])))
    check("atteignabilite_matrice_non_vide", len(matrice["JETONS"]) > 0 and len(matrice["COUPLES_INTERDITS"]) > 0)
    check("F5b_aucun_role_manquant_dans_la_derivation", len(matrice["rolesManquants"]) == 0,
          str(matrice["rolesManquants"]))
    check("F5b_aucun_role_perime_dans_la_derivation", len(matrice["rolesPerimes"]) == 0,
          str(matrice["rolesPerimes"]))

    dossier_isole = tempfile.mkdtemp(prefix="cc-test-contrastes-config-")
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
            check("atteignabilite_app_css_servi_200", reponse.status == 200, "obtenu %d" % reponse.status)
            check("atteignabilite_app_css_type_mime_correct",
                  "text/css" in reponse.headers.get("Content-Type", ""),
                  reponse.headers.get("Content-Type"))

        selecteurs_aplat = [s for s, d in matrice["USAGES_APLAT"].items() if not d.get("pseudo")]
        page = construire_page(base, matrice["JETONS"], selecteurs_aplat)
        with tempfile.TemporaryDirectory(prefix="cc-test-contrastes-page-") as dossier:
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
        mesures = json.loads(_html.unescape(dom[debut + 7:fin]))
    except Exception as e:
        print("ECHEC ATTEIGNABILITE : <title> illisible (%s)" % e)
        return 1
    if mesures.get("erreur"):
        print("ECHEC ATTEIGNABILITE : le script de la page a levé :\n%s" % mesures["erreur"])
        return 1

    jetons_runtime = mesures["jetonsRuntime"]
    print("[atteignabilité] %d nœud(s) texte visité(s), %d trait(s) visité(s), %d jeton(s) résolus au runtime"
          % (mesures["noeudsTexte"], mesures["traitsVus"], len(jetons_runtime)))
    check("atteignabilite_noeuds_texte_visites_non_nul", mesures["noeudsTexte"] > 20,
          "obtenu %d — trop peu de texte peint pour que la mesure signifie quelque chose"
          % mesures["noeudsTexte"])
    check("atteignabilite_traits_visites_non_nul", mesures["traitsVus"] > 0,
          "obtenu %d" % mesures["traitsVus"])
    check("atteignabilite_jetons_runtime_resolus", len(jetons_runtime) >= len(matrice["JETONS"]) - 8,
          "obtenu %d sur %d attendus (les 8 valeurs promues hors :root n'ont pas de nom de "
          "variable et ne sont donc jamais dans jetonsRuntime)" % (len(jetons_runtime), len(matrice["JETONS"])))

    # -- table de correspondance rgb -> nom de jeton, RÉSOLUE AU RUNTIME ----
    rgb_vers_nom = {}
    for nom, hexv in matrice["JETONS"].items():
        rgb_vers_nom[hex_vers_rgb(hexv)] = nom
    for nom, val in jetons_runtime.items():
        t = rgb_vers_nom.get(hex_vers_rgb(val)) if val.startswith("#") else None
        if t is None and val.startswith("#"):
            rgb_vers_nom[hex_vers_rgb(val)] = nom

    interdits_par_role = {"texte": set(), "trait": set()}
    for c in matrice["COUPLES_INTERDITS"]:
        interdits_par_role[c["role"] if c["role"] in interdits_par_role else "texte"].add((c["encre"], c["fond"]))

    couples_interdits_peints = []
    couples_sans_jeton = []
    encres_inconnues_sous_seuil = []
    for c in mesures["couplesPeints"]:
        rgb_c = rgb_texte_vers_tuple(c["couleur"])
        rgb_f = rgb_texte_vers_tuple(c["fond"])
        if rgb_c is None or rgb_f is None:
            continue
        nom_c = rgb_vers_nom.get(rgb_c)
        nom_f = rgb_vers_nom.get(rgb_f)
        if nom_c is None:
            couples_sans_jeton.append(("encre-inconnue", c["couleur"], c["fond"]))
            # Une encre qui ne se rattache à AUCUN jeton connu (hex codé en
            # dur réintroduit, par exemple) ÉCHAPPAIT jusqu'ici entièrement à
            # la vérification : ni la table des interdits (indexée par NOM de
            # jeton) ni aucune autre assertion ne la regardait — seul son
            # compte était imprimé. Trouvé par mutation (`.marque { color:
            # #fefefe }` sur fond quasi identique, contraste ~1.03:1) : la
            # suite restait à 12 cas, 0 échec. On calcule ici le contraste
            # BRUT (peu importe l'identité du jeton) contre le seuil de son
            # rôle — ce qui referme le trou sans introduire de faux positif
            # sur un fond légitimement hors palette (blanc pur des traits
            # SVG), puisqu'on ne juge que l'ENCRE inconnue, jamais le fond.
            seuil_role = matrice["SEUIL"].get(c["role"], matrice["SEUIL"].get("texte"))
            contraste_brut = contraste_rgb(rgb_c, rgb_f)
            if contraste_brut < seuil_role:
                encres_inconnues_sous_seuil.append({
                    "role": c["role"], "couleur": c["couleur"], "fond": c["fond"],
                    "contraste": round(contraste_brut, 2), "seuil": seuil_role,
                })
            continue
        if nom_f is None:
            # Le fond peut être blanc pur (traits SVG, hors palette) — pas
            # une anomalie en soi, seule l'encre doit se rattacher à un jeton.
            continue
        role = c["role"]
        if (nom_c, nom_f) in interdits_par_role.get(role, ()):
            couples_interdits_peints.append({"role": role, "encre": nom_c, "fond": nom_f,
                                              "couleur": c["couleur"], "fond_rgb": c["fond"]})

    print("[dérivé] %d couple(s) peint(s) sans jeton résolu (hors palette : traits SVG, blanc)"
          % len(couples_sans_jeton))
    check("F5b_couples_interdits_jamais_peints", len(couples_interdits_peints) == 0,
          "%d couple(s) interdit(s) réellement peint(s) : %s" % (len(couples_interdits_peints),
                                                                   couples_interdits_peints[:5]))
    check("F5b_encre_inconnue_respecte_le_seuil_de_son_role", len(encres_inconnues_sous_seuil) == 0,
          "%d encre(s) sans jeton connu SOUS le seuil de son rôle : %s" %
          (len(encres_inconnues_sous_seuil), encres_inconnues_sous_seuil[:5]))

    # ================================================================== #
    # Les APLATS — le rôle appartient à l'usage, pas au jeton
    # ================================================================== #
    # Deux volets, et le premier est celui qui empêche la table de pourrir :
    # une forme pleine peinte dont le sélecteur n'est déclaré nulle part
    # ÉCHOUE. Sans lui, le premier sélecteur neuf échapperait en silence,
    # exactement comme les cinq usages de `--line` ont échappé au
    # reclassement en bloc du jeton.
    aplats = mesures.get("aplatsPeints", [])
    print("[dérivé] %d aplat(s) peint(s) retenus sur %d forme(s) pleine(s) balayée(s)"
          % (len(aplats), mesures.get("aplatsVus", 0)))
    check("atteignabilite_aplats_balayes_non_nul", len(aplats) > 0,
          "aucun aplat peint retenu — le balayage ne mesure rien, la garde serait creuse")

    non_declares = sorted({a["apercu"] for a in aplats if not a["selecteur"]})
    check("F5b_tout_aplat_peint_a_un_usage_declare", not non_declares,
          "%d forme(s) pleine(s) peinte(s) sans entrée dans USAGES_APLAT : %s "
          "— déclarer le rôle de cet usage (indicateur ou decor) avec son motif"
          % (len(non_declares), non_declares[:6]))

    seuil_ind = matrice["SEUIL_APLAT_INDICATEUR"]
    indicateurs_trop_faibles = []
    indicateurs_vus = 0
    for a in aplats:
        sel = a["selecteur"]
        if not sel or matrice["USAGES_APLAT"][sel]["role"] != matrice["INDICATEUR"]:
            continue
        rgb_c = rgb_texte_vers_tuple(a["couleur"])
        rgb_f = rgb_texte_vers_tuple(a["fond"])
        if rgb_c is None or rgb_f is None:
            continue
        indicateurs_vus += 1
        # Contraste calculé sur la couleur RÉELLEMENT RÉSOLUE et le fond
        # RÉELLEMENT derrière — jamais sur la surface qu'on croit savoir.
        c = contraste_rgb(rgb_c, rgb_f)
        if c < seuil_ind:
            indicateurs_trop_faibles.append(
                {"usage": sel, "contraste": round(c, 2), "seuil": seuil_ind,
                 "couleur": a["couleur"], "fond": a["fond"]})

    print("[dérivé] %d aplat(s) de rôle INDICATEUR mesurés contre leur fond réel" % indicateurs_vus)
    check("F5b_aplats_indicateurs_atteignent_le_seuil", not indicateurs_trop_faibles,
          "%d aplat(s) porteur(s) d'information sous %.1f:1 : %s"
          % (len(indicateurs_trop_faibles), seuil_ind, indicateurs_trop_faibles[:5]))

    # Sens INVERSE, volontairement SIGNALÉ et non bloquant : un repli CSS
    # systématiquement surchargé (`.column-label i`) est légitime, et le
    # faire échouer pousserait à supprimer des replis utiles.
    vus = {a["selecteur"] for a in aplats if a["selecteur"]}
    jamais_vus = sorted(s for s, d in matrice["USAGES_APLAT"].items()
                        if not d.get("pseudo") and s not in vus)
    if jamais_vus:
        print("[info] usage(s) déclaré(s) jamais vus peints (replis surchargés, non bloquant) : %s"
              % jamais_vus)

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for nom in _echecs:
        print("  - %s" % nom)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
