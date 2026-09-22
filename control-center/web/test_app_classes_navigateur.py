#!/usr/bin/env python3
"""F3b — PARITÉ DES CLASSES, VOLET RUNTIME (feature-021, cycle 2, lot 5).

    python3 control-center/web/test_app_classes_navigateur.py

F3a (`test_conformite_classes.js`) retire délibérément le sens CSS→HTML de
sa vérification interne : appliqué au seul DOM STATIQUE, il rend **96 faux
positifs** — des classes posées par `app.js` via `classList.add`/`className`
UNIQUEMENT à l'exécution (états `.actif`, `.ko`, `.has-echec`, `.en-cours`…),
absentes du HTML initial par construction. C'est le sens que ce fichier
établit : un HARNAIS NAVIGATEUR qui exécute réellement `app.js` à travers
plusieurs scénarios représentatifs, puis lit les classes RÉELLEMENT posées
dans le DOM final — jamais une relecture du code source (PIEGES §38 : un bac
à sable `vm` ne connaît que les id/classes du HTML STATIQUE, la même limite
s'applique aux classes posées dynamiquement).

Deux vérifications, symétriques de F3a :
  A. Toute classe déclarée avec un corps non vide dans `app.css` est posée
     QUELQUE PART — dans le HTML statique (déjà couvert par F3a) OU par
     `app.js` en cours d'exécution (couvert ICI). Modulo une liste déclarée
     `NON_ATTEIGNABLES_CE_CYCLE`, pour les classes dont le déclencheur
     appartient à une spec différée (`feature-022`/`023`/`025`) ou à un
     scénario hors périmètre d'un harnais headless (ex. `:hover`, jamais
     déclenché par un script).
  B. Toute classe posée par `app.js` À L'EXÉCUTION, qui n'existe PAS dans le
     HTML statique, est déclarée avec un corps non vide dans `app.css` —
     modulo aucune liste, la moindre classe orpheline posée par du code réel
     est un défaut réel.

Méthode
-----------------------------------------------------------------------------
Même architecture que `test_app_a11y_navigateur.py`/
`test_app_contrastes_navigateur.py` : `app.css`/`diagramme.js`/`app.js`
servis par un VRAI serveur HTTP en mémoire (PIEGES §10), la page ENVELOPPE
(CSP oblige, PIEGES §9) chargée en `file://`. Le corps HTML de la page
enveloppe est le VRAI `<body>` d'`index.html`, copié tel quel (pas de
reconstruction manuelle qui pourrait diverger).

Chaque scénario appelle une fonction de rendu RÉELLE d'`app.js`
(`rendreAgents`, `rendreSysteme`, `rendreKanban`, `construireDiagramme`,
`rendreCycles`, `rendreFichiers`, `rendreTimeline`, `ouvrirPorte`,
`afficherBandeauHote`) avec des données représentatives couvrant les
branches connues pour poser des classes d'état (§ liste dans le script).

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


_NODE_DERIVATION = r"""
const lib = require("./test_conformite_lib.js");
const html = lib.lireNonVide(lib.cheminWeb("index.html"), "index.html");
const css = lib.lireNonVide(lib.cheminWeb("app.css"), "app.css");
// `POSES_A_L_EXECUTION` de F4a : les ids que le volet STATIQUE s'interdit de
// vérifier parce qu'`app.js` les construit à chaque rendu. Les lire ICI
// COUPLE les deux gardes : déclarer une exception dans F4a OBLIGE ce harnais
// à la couvrir sur DOM exécuté, sinon l'élément ne serait vérifié nulle part
// — le trou exact trouvé sur `claude-live-message` (lot 11 non déclaré livré).
const a11y = require("fs").readFileSync(lib.cheminWeb("test_conformite_a11y.js"), "utf8");
const bloc = a11y.match(/const POSES_A_L_EXECUTION = \{([\s\S]*?)\n\};/);
const idsExecution = bloc
  ? [...bloc[1].matchAll(/^\s*"([^"]+)"\s*:/gm)].map((m) => m[1])
  : null;
process.stdout.write(JSON.stringify({
  classesCssAvecCorps: [...lib.classesDeclareesAvecCorps(css)],
  classesHtmlStatique: [...lib.classesDeHtml(html)],
  idsExecutionDeclaresParF4a: idsExecution,
}));
"""


def deriver():
    node = shutil.which("node")
    if not node:
        return None
    res = subprocess.run([node, "-e", _NODE_DERIVATION], cwd=_ICI,
                          capture_output=True, text=True, timeout=30)
    if res.returncode != 0:
        raise RuntimeError("dérivation Node échouée : %s" % res.stderr[-1000:])
    return json.loads(res.stdout)


# Classes déclarées avec corps non vide dans `app.css` (F1/F3a le garantissent
# non vide) que NUL scénario headless de ce fichier ne peut atteindre — le
# déclencheur appartient à un état du pilotage/de la rédaction qui dépend
# d'un aller-retour réseau (`fetch`) que cette page enveloppe, `file://`,
# n'a jamais (voir l'en-tête). Chaque entrée est datée et nommée, PAS une
# liste qui s'allonge en silence (même discipline que
# `JETONS_AJOUTES`/`CLASSES_AJOUTEES`, F1/F2) — et soumise à la clause
# miroir ci-dessous : toute entrée qui SE MET à être posée doit être retirée.
#
# feature-023 (lot 12) : VIDE depuis ce lot — `token-value` a été purgée
# (clause miroir, la voir posée l'a exigé) : la branche « centre avec
# chiffre » est maintenant ÉCRITE, et le scénario diagramme ci-dessous lui
# fournit un `tokens_par_passage` qui la déclenche.
NON_ATTEIGNABLES_CE_CYCLE = {}


_SCRIPT_MESURE = r"""
(function () {
  var out = { erreur: null };
  // « Cimetière » : CONSERVE un clone de tout conteneur qu'un scénario
  // ultérieur va vider ou réécrire (un même élément — `#jauge-flux`,
  // `#pilotage-corps` — porte plusieurs états MUTUELLEMENT EXCLUSIFS dans
  // l'app réelle, un seul visible à la fois). Sans lui, seul le DERNIER état
  // posé sur un élément partagé laisse une trace dans le balayage final —
  // trouvé EN EXÉCUTANT ce fichier (`.jauge.ko` écrasée par `.jauge.sondage`
  // sur le MÊME `#jauge-flux`), pas en le relisant.
  var cimetiere = document.createElement('div');
  cimetiere.setAttribute('aria-hidden', 'true');
  function figer(idConteneur) {
    var source = document.getElementById(idConteneur);
    if (!source) return;
    cimetiere.appendChild(source.cloneNode(true));
  }
  try {
    document.body.appendChild(cimetiere);
    function passage(o) {
      return {
        agent: o.agent, debut: o.debut, duree_ms: o.duree_ms || 5000,
        outils: o.outils || 0, fichiers: o.fichiers || [],
        echecs: o.echecs || 0, termine: o.termine !== false,
        etat: o.etat, type: o.type || "sousagent", agent_id: o.agent_id,
      };
    }

    // -- diagramme : tous les états F16 réunis ------------------------------
    var passages = [
      passage({ agent: "claude", debut: "2026-09-21T10:00:00.000Z", type: "principal", agent_id: "claude-id" }),
      passage({ agent: "backend-developer", debut: "2026-09-21T10:00:05.000Z", termine: false, fichiers: ["a"], agent_id: "backend-id" }),
      passage({ agent: "test-engineer", debut: "2026-09-21T10:00:10.000Z", echecs: 2, agent_id: "test-id" }),
      passage({ agent: "doc-writer", debut: "2026-09-21T10:00:15.000Z", etat: "sans_cloture", agent_id: "doc-id" }),
    ];
    var wf1 = { segments: passages, passages: passages };
    var sigles = siglesAgents(Array.from(collecterRoles([wf1])));
    // feature-023 (lot 12) : `partiel: true` GLOBAL + un SEUL agent_id
    // connu — pose `.token-value` (backend-developer, compteur réel) ET
    // `.token-value--partiel` (les trois autres, faute de compteur alors
    // que la lecture a été coupée par le budget) dans ce MÊME scénario.
    var tokensParPassage = { partiel: true, par_agent: { "backend-id": { input_tokens: 4000, output_tokens: 1500 } } };
    document.getElementById('cycle-canvas').appendChild(construireDiagramme(wf1, sigles, tokensParPassage));

    // -- kanban : priorité (basse/moyenne/haute/critique) + divergence -----
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
        // feature-025 (lots 9-10) : une spec en DERNIÈRE colonne, sinon
        // `.progress-track.etat-derniere` (posée par `roleColonneClient`)
        // n'est jamais atteinte par ce scénario — F3b la trouverait
        // déclarée dans app.css et jamais posée, pour la MAUVAISE raison.
        { id: "F-004", titre: "d", colonne: "done", priorite: "Moyenne", divergence: false, statut_texte: "done" },
      ],
      divergences: 1,
    });

    // -- agents : un actif, un inactif --------------------------------------
    rendreAgents([
      { nom: "frontend-developer", actif_sur: "F-003", modele: "sonnet", peut_ecrire: true, outils: ["Read"], peut_deleguer: false, description: "d" },
      { nom: "backend-developer", actif_sur: null, modele: "sonnet", peut_ecrire: false, outils: [], peut_deleguer: true, description: "d" },
    ]);
    // -- agents : liste vide (état vide explicite, classe `.vide`) ----------
    var agentsSauvegardes = document.getElementById('agents').innerHTML;
    rendreAgents([]);
    document.getElementById('agents').innerHTML = agentsSauvegardes;

    // -- système ---------------------------------------------------------
    rendreSysteme({
      ecriture_active: false, git: { depot: true, branche: "main", touches: [1] },
      divergences: 1, workflows: [1], config_lue: true, commandes_declarees: [],
      garde_fous: { budget_max_usd: 5, ecrivains_simultanes: 1 },
    });

    // -- cycles : les quatre états, un rebouclage réel, une imbrication -----
    function segPrincipal(debut, fin) {
      return { type: "principal", agent: "claude", debut: debut, fin: fin, duree_ms: 1000, outils: 1, fichiers: [], echecs: 0, termine: true, etat: "termine" };
    }
    function segAgent(agent, debut, etat, echecs, termine) {
      return { type: "sousagent", agent: agent, debut: debut, fin: termine === false ? null : debut, duree_ms: 500, outils: 1, fichiers: [], echecs: echecs || 0, termine: termine !== false, etat: etat };
    }
    var wfEnCours = {
      workflow_id: "s1#0", indice_cycle: 0, debut: "2026-09-21T10:00:00.000Z", fin_observee: "2026-09-21T10:05:00.000Z",
      fin_observee_absente: false, bornage: "session-entiere", borne_par: null,
      segments: [segPrincipal("2026-09-21T10:00:00.000Z", "2026-09-21T10:00:01.000Z"), segAgent("frontend-developer", "2026-09-21T10:00:02.000Z", "en_cours", 0, false)],
      passages: [segAgent("frontend-developer", "2026-09-21T10:00:02.000Z", "en_cours", 0, false)],
      cycles_total: 4, evenements_hors_session: 2,
    };
    var wfTermineRepris = {
      workflow_id: "s1#1", indice_cycle: 1, debut: "2026-09-21T09:00:00.000Z", fin_observee: "2026-09-21T09:10:00.000Z",
      fin_observee_absente: false, bornage: "marqueur-agent", borne_par: "orchestrator",
      segments: [
        segPrincipal("2026-09-21T09:00:00.000Z", "2026-09-21T09:00:01.000Z"),
        segAgent("frontend-developer", "2026-09-21T09:00:02.000Z", "termine", 0, true),
        segPrincipal("2026-09-21T09:00:03.000Z", "2026-09-21T09:00:04.000Z"),
        segAgent("backend-developer", "2026-09-21T09:00:05.000Z", "termine", 0, true),
        segPrincipal("2026-09-21T09:00:06.000Z", "2026-09-21T09:00:07.000Z"),
        segAgent("frontend-developer", "2026-09-21T09:00:08.000Z", "termine", 1, true),
      ],
      passages: [
        segAgent("frontend-developer", "2026-09-21T09:00:02.000Z", "termine", 0, true),
        segAgent("backend-developer", "2026-09-21T09:00:05.000Z", "termine", 0, true),
        segAgent("frontend-developer", "2026-09-21T09:00:08.000Z", "termine", 1, true),
      ],
      cycles_total: 4, evenements_hors_session: 2,
      reprises: { "frontend-developer": 2 },
    };
    var wfSansCloture = {
      workflow_id: "s1#2", indice_cycle: 2, debut: "2026-09-20T09:00:00.000Z", fin_observee: null,
      fin_observee_absente: true, bornage: "avant-premier-marqueur", borne_par: null,
      segments: [segAgent("test-engineer", "2026-09-20T09:00:00.000Z", "sans_cloture", 0, false)],
      passages: [segAgent("test-engineer", "2026-09-20T09:00:00.000Z", "sans_cloture", 0, false)],
      cycles_total: 4, evenements_hors_session: 2,
    };
    var wfIndetermine = {
      workflow_id: "s1#3", indice_cycle: 3, debut: "2026-09-19T09:00:00.000Z", fin_observee: "2026-09-19T09:01:00.000Z",
      fin_observee_absente: false, bornage: "session-entiere", borne_par: null,
      segments: [{ type: "sousagent", agent: "code-reviewer", debut: "2026-09-19T09:00:00.000Z", fin: null, duree_ms: null, outils: 0, fichiers: [], echecs: 0, termine: false }],
      passages: [{ type: "sousagent", agent: "code-reviewer", debut: "2026-09-19T09:00:00.000Z", fin: null, duree_ms: null, outils: 0, fichiers: [], echecs: 0, termine: false }],
      cycles_total: 4, evenements_hors_session: 2,
    };
    // 45 passages > LIMITE_PASSAGES_VISIBLES (40, app.js) : exerce le repli
    // (`.action-repli`) sur la table des passages.
    var passagesNombreux = [];
    for (var i = 0; i < 45; i++) {
      passagesNombreux.push(segAgent("frontend-developer", "2026-09-18T09:00:" + String(i).padStart(2, "0") + ".000Z", "termine", 0, true));
    }
    var wfLong = {
      workflow_id: "s1#4", indice_cycle: 4, debut: "2026-09-18T09:00:00.000Z", fin_observee: "2026-09-18T09:10:00.000Z",
      fin_observee_absente: false, bornage: "session-entiere", borne_par: null,
      segments: passagesNombreux, passages: passagesNombreux,
      cycles_total: 5, evenements_hors_session: 2,
    };

    // `dernierEtat` : le clic sur un en-tête de cycle appelle
    // `rendreCycles(dernierEtat)` (app.js), jamais l'objet local — sans le
    // poser ICI, ce même appel lève sur `null.workflows` et VIDE
    // `#workflows` sans le repeupler (`vider()` tourne avant l'exception).
    dernierEtat = { workflows: [wfEnCours, wfTermineRepris, wfSansCloture, wfIndetermine, wfLong], cycles_total: 5, evenements_hors_session: 2 };
    rendreCycles(dernierEtat);
    // clique le bouton d'en-tête de CHAQUE cycle listé : le dépliement
    // exclusif ne construit le détail visible qu'une fois ouvert au clic
    // (`.action-repli`/`.wf-notes.reboucle` vivent dans ce détail).
    Array.prototype.forEach.call(document.querySelectorAll('.cycle-bouton'), function (b) { b.click(); });

    // -- cycles : état vide explicite ---------------------------------------
    var cyclesSauvegardes = document.getElementById('workflows').innerHTML;
    rendreCycles({ workflows: [], cycles_total: 0, evenements_hors_session: 0 });
    document.getElementById('workflows').innerHTML = cyclesSauvegardes;

    // -- fichiers : dépôt avec fichiers touchés + commits --------------------
    rendreFichiers({
      git: {
        depot: true,
        touches: [{ libelle: "M", chemin: "a.py", ancien: null }, { libelle: "R", chemin: "b.py", ancien: "a_old.py" }],
        commits: [{ hash: "abc123", sujet: "un sujet de commit" }],
      },
    });

    // -- timeline : agent + échec + outil ------------------------------------
    rendreTimeline({
      evenements: [
        { hook_event_name: "SubagentStart", agent_type: "frontend-developer", ts: "2026-09-21T10:00:00.000Z" },
        { hook_event_name: "SubagentStop", ts: "2026-09-21T10:00:05.000Z" },
        { hook_event_name: "PostToolUse", tool: "Read", failed: true, ts: "2026-09-21T10:00:02.000Z" },
      ],
    });

    // -- jauges : les variantes d'état, posées telles quelles ---------------
    // `figer()` avant tout appel ultérieur qui réécrirait le MÊME élément
    // (`demarrerActualisationPeriodique()`, plus bas, repose `#jauge-flux`
    // en `.sondage` — un seul élément, plusieurs états mutuellement
    // exclusifs dans l'app réelle, voir le cimetière tout en haut).
    document.getElementById('jauge-git').className = 'jauge ok';
    document.getElementById('jauge-flux').className = 'jauge ko';
    document.getElementById('jauge-pilotage').className = 'jauge pilotage-actif';
    document.getElementById('status-dot').className = 'status-dot actif';
    figer('jauge-git'); figer('jauge-flux'); figer('jauge-pilotage'); figer('status-dot');

    // -- conversation (feature-022, lot 11) : fil disponible, avec un
    // message utilisateur persisté ET une activité réelle d'agent — pose
    // `message`/`message-avatar`/`bubble` (les trois classes que F3b
    // signalait déclarées jamais posées avant ce scénario). `file://` fait
    // échouer le `fetch` automatique de `verifierEtatAuth()` (réseau
    // refusé), qui ne touche jamais `#conversation` sur cette branche
    // (`afficherBandeauHote('reseau')` seulement) : ce scénario n'est donc
    // écrasé par aucun rafraîchissement asynchrone. -----------------------
    conversation.phase = "disponible";
    conversation.messages = [{ ts: Date.parse("2026-09-21T10:00:00.000Z"), texte: "un message utilisateur" }];
    conversation.tronque = false;
    dernierEtat = { ecriture_active: true, agents: [{ nom: "frontend-developer", actif_sur: "F-003" }] };
    rendreConversation();
    figer('conversation');

    // -- conversation : indisponible (état vide explicite) ------------------
    conversation.phase = "indisponible";
    conversation.messages = [];
    conversation.tronque = false;
    rendreConversation();
    figer('conversation');

    // -- bandeau d'hôte : les deux motifs -----------------------------------
    afficherBandeauHote('reseau');
    afficherBandeauHote('hote');

    // -- porte : ouverte puis refermée ---------------------------------------
    ouvrirPorte('premier-acces');
    fermerPorte();
    ouvrirPorte('jeton-refuse');
    fermerPorte();

    // -- jauge « sondage périodique » (repli sans EventSource) -------------
    demarrerActualisationPeriodique();
    arreterActualisationPeriodique();

    // -- pilotage : les cinq phases + les quatre états de `l.etat` ----------
    // `pilotage`/`rendrePilotage` sont purement DOM, aucun `fetch` : sûr à
    // piloter directement depuis ce script (même portée globale qu'app.js,
    // tous deux des scripts CLASSIQUES du même document). Chaque phase est
    // `figer()`ée dans le cimetière avant la suivante (voir tout en haut).
    pilotage.phase = "pret";
    pilotage.commandes = ["pio test", "pio run"];
    pilotage.budgetMaxUsd = 5;
    pilotage.ecrivains = 1;
    rendrePilotage();
    figer('pilotage-corps');

    pilotage.phase = "confirmation";
    pilotage.confirmation = { cle: "pio test", plafond: 5, ecrivains: 1, besoinJeton: true, erreur: "jeton refusé", enCours: false };
    rendrePilotage();
    figer('pilotage-corps');

    pilotage.phase = "occupe";
    pilotage.occupe = { texte: "un autre écrivain travaille déjà" };
    rendrePilotage();
    figer('pilotage-corps');

    ["en_cours", "termine", "echec", "interrompu"].forEach(function (etatL) {
      pilotage.phase = "lancement";
      pilotage.lancement = {
        cle: "pio test", etat: etatL, curseur: 0, tronque: true,
        derniereActivite: Math.floor(Date.now() / 1000) - 40, // > 30 s : "bloqué"
        debutClient: Date.now() - 5000, texteSortie: "sortie…",
        syntheticMessage: etatL === "echec" ? "code 1" : null,
      };
      rendrePilotage();
      figer('pilotage-corps');
      // `.jauge.pilotage-en-cours` sur le badge d'en-tête, seulement pour
      // l'état "en_cours" (rendreBadgePilotage, app.js).
      rendreBadgePilotage({ ecriture_active: true });
      figer('jauge-pilotage');
    });
    // `.en-cours` (pas bloqué) : activité récente, pas « bloqué ».
    pilotage.lancement = Object.assign({}, pilotage.lancement, { etat: "en_cours", derniereActivite: Math.floor(Date.now() / 1000) });
    rendrePilotage();
    figer('pilotage-corps');

    // -- rédaction : brouillon (`.brouillon`, le <textarea> réellement écrit)
    redaction.phase = "brouillon";
    redaction.brouillon = {
      genre: "complet", titre: "Un besoin", texte: "…", minimal: false,
      slug: "un-besoin", nomFichierPrevu: "feature-099-un-besoin.md", substitutions: 2,
    };
    redaction.contenu = "## Contenu\n[remplir]\n";
    redaction.compteRemplir = 1;
    rendreRedaction();
    figer('redaction-corps');

    // -- mutation (c), feature-025 : `.progress-track` NE PORTE JAMAIS un
    // pourcentage mesuré (K4 — aucune grandeur de progression n'est exposée
    // par `specs.py`, voir app.css). Balaie les instances RÉELLEMENT posées
    // par `rendreKanban` ci-dessus (colonnes todo/doing/done, donc les
    // trois classes d'état) et vérifie qu'AUCUNE ne porte `role=
    // "progressbar"`, `aria-valuenow`, ni un `%` dans son attribut `style`
    // (un pourcentage introduit — inline ou via `aria-valuenow` — doit
    // faire échouer CETTE assertion, pas une relecture du code source).
    var pistes = Array.prototype.slice.call(document.querySelectorAll('.progress-track'));
    var pistesAvecPourcentage = [];
    pistes.forEach(function (p) {
      var suspects = [p].concat(Array.prototype.slice.call(p.children));
      suspects.forEach(function (n) {
        var style = n.getAttribute('style') || '';
        var role = n.getAttribute('role');
        var valeurNow = n.getAttribute('aria-valuenow');
        if (style.indexOf('%') !== -1 || role === 'progressbar' || valeurNow !== null) {
          pistesAvecPourcentage.push({
            selecteur: n.className, style: style, role: role, ariaValuenow: valeurNow,
          });
        }
      });
    });
    out.progressTrackInstances = pistes.length;
    out.progressTrackAvecPourcentage = pistesAvecPourcentage;

    // -- balayage final : toutes les classes RÉELLEMENT présentes dans le DOM
    var classesVues = {};
    Array.prototype.forEach.call(document.querySelectorAll('*'), function (el) {
      // `el.className` sur un élément SVG rend un `SVGAnimatedString`
      // (objet, pas une chaîne) : `getAttribute('class')` fonctionne
      // uniformément sur HTML et SVG, jamais `.className` directement.
      String(el.getAttribute('class') || '').split(/\s+/).filter(Boolean).forEach(function (c) {
        classesVues[c] = true;
      });
    });
    out.classesRuntime = Object.keys(classesVues);

    // -- balayage final des ids RÉELLEMENT présents (cimetière compris) :
    // c'est lui qui couvre les ids qu'`app.js` construit et que le volet
    // statique de F4a s'interdit de vérifier.
    var idsVus = {};
    Array.prototype.forEach.call(document.querySelectorAll('[id]'), function (el) {
      idsVus[el.id] = true;
    });
    out.idsRuntime = Object.keys(idsVus);
  } catch (e) {
    out.erreur = String(e && e.stack || e);
  }
  document.title = JSON.stringify(out);
}());
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
    derive = deriver()
    if derive is None:
        print("ℹ️  `node` introuvable — harnais sauté.")
        return 0

    for nom in ("app.css", "app.js", "diagramme.js", "index.html"):
        chemin = os.path.join(_ICI, nom)
        if not os.path.exists(chemin) or os.path.getsize(chemin) == 0:
            print("ECHEC ATTEIGNABILITE : %s est absent ou vide à %s" % (nom, chemin))
            return 1

    classes_css = set(derive["classesCssAvecCorps"])
    classes_html_statique = set(derive["classesHtmlStatique"])
    print("[atteignabilité] %d classe(s) déclarée(s) avec corps dans app.css, %d posée(s) dans "
          "index.html statique" % (len(classes_css), len(classes_html_statique)))
    check("atteignabilite_classes_css_non_vide", len(classes_css) > 50, "obtenu %d" % len(classes_css))

    dossier_isole = tempfile.mkdtemp(prefix="cc-test-classes-config-")
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

        page = construire_page(base)
        with tempfile.TemporaryDirectory(prefix="cc-test-classes-page-") as dossier:
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

    classes_runtime = set(mesures["classesRuntime"])
    check("atteignabilite_classes_runtime_non_vide", len(classes_runtime) > 50,
          "obtenu %d" % len(classes_runtime))
    print("[dérivé] %d classe(s) réellement posée(s) dans le DOM après exécution des scénarios"
          % len(classes_runtime))

    classes_posees_quelque_part = classes_html_statique | classes_runtime

    # -- A : toute classe déclarée (corps non vide) est posée quelque part --
    manquantes = sorted(classes_css - classes_posees_quelque_part - set(NON_ATTEIGNABLES_CE_CYCLE))
    check("F3b_toute_classe_declaree_est_posee_quelque_part", len(manquantes) == 0,
          "%d classe(s) déclarée(s) dans app.css, jamais posées (ni HTML statique, ni scénarios "
          "runtime) : %s" % (len(manquantes), manquantes[:15]))

    # Clause miroir sur NON_ATTEIGNABLES_CE_CYCLE : toute entrée qui SE MET à
    # être posée (par un scénario neuf, un jour) doit être retirée — sinon
    # elle devient une amnistie silencieuse (même discipline qu'ATTENDU_ROUGE).
    purgees = sorted(c for c in NON_ATTEIGNABLES_CE_CYCLE if c in classes_posees_quelque_part)
    check("F3b_aucune_entree_non_atteignable_purgee_par_les_scenarios", len(purgees) == 0,
          "%s : maintenant posée(s), à retirer de NON_ATTEIGNABLES_CE_CYCLE" % purgees)

    # -- A bis : tout id que F4a s'interdit de vérifier statiquement DOIT
    # être posé par un scénario ici. Sans cette assertion, déclarer une
    # exception dans F4a suffirait à faire disparaître un élément de TOUTE
    # vérification — c'est le trou trouvé sur `claude-live-message`, invisible
    # tant que le lot 11 n'était pas déclaré livré.
    ids_declares = derive.get("idsExecutionDeclaresParF4a")
    check("F3b_liste_des_ids_execution_lue_depuis_F4a", isinstance(ids_declares, list),
          "POSES_A_L_EXECUTION introuvable dans test_conformite_a11y.js — le couplage "
          "des deux gardes est rompu, un id exempté ne serait plus couvert nulle part")
    if isinstance(ids_declares, list):
        ids_runtime = set(mesures.get("idsRuntime") or [])
        print("[dérivé] %d id(s) relevé(s) dans le DOM exécuté ; %d exempté(s) par F4a"
              % (len(ids_runtime), len(ids_declares)))
        jamais_poses = sorted(i for i in ids_declares if i not in ids_runtime)
        check("F3b_tout_id_exempte_par_F4a_est_pose_par_un_scenario", len(jamais_poses) == 0,
              "%s : exempté(s) du volet statique de F4a et posé(s) par AUCUN scénario ici — "
              "ces id ne sont vérifiés nulle part" % jamais_poses)

    # -- B : toute classe posée au runtime, absente du HTML statique, est
    # déclarée avec un corps non vide dans app.css -----------------------
    runtime_seules = classes_runtime - classes_html_statique
    orphelines = sorted(runtime_seules - classes_css)
    check("F3b_toute_classe_posee_au_runtime_est_declaree_avec_un_corps", len(orphelines) == 0,
          "%d classe(s) posée(s) par app.js à l'exécution, sans déclaration CSS valide : %s"
          % (len(orphelines), orphelines[:15]))
    print("[dérivé] %d classe(s) posée(s) UNIQUEMENT au runtime (absentes du HTML statique)"
          % len(runtime_seules))

    # -- mutation (c), feature-025 : `.progress-track` sans pourcentage -----
    instances = mesures.get("progressTrackInstances", 0)
    check("atteignabilite_progress_track_instances_reellement_posees", instances >= 3,
          "obtenu %d — le scénario ne construit peut-être plus les trois colonnes" % instances)
    avec_pourcentage = mesures.get("progressTrackAvecPourcentage", [])
    check("F5c_progress_track_ne_porte_jamais_un_pourcentage", len(avec_pourcentage) == 0,
          "%d instance(s) portent un pourcentage (role=progressbar, aria-valuenow, ou "
          "`%%` dans style) alors que K4 n'expose aucune grandeur de progression mesurée : %s"
          % (len(avec_pourcentage), avec_pourcentage))

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for nom in _echecs:
        print("  - %s" % nom)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
