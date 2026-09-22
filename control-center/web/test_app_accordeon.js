"use strict";
/* Harnais headless pour la liste de cycles en accordéon (feature-016,
 * docs/DESIGN-SYSTEM.md §6).
 *
 *     node control-center/web/test_app_accordeon.js
 *
 * Zéro dépendance installée (ADR-0006) : uniquement les modules standard de
 * Node (`vm`, `fs`, `path`), même bac à sable minimal que
 * `test_app_bug012.js` — dupliqué ici plutôt que partagé, ces harnais ne
 * sont pas des modules (chacun exécute `app.js` TEL QUEL dans son propre
 * contexte `vm`, jamais copié ni modifié). Convention du projet : sortie
 * « N cas, M echec(s) », code de sortie 1 à l'échec. Invoqué depuis
 * `test_app_accordeon.py`, qui se saute proprement si `node` est absent.
 *
 * Ce que ce harnais établit PAR EXÉCUTION (numéros = items de la spec) :
 *  1. Un seul cycle déplié à l'ouverture, et c'est le plus récent — épinglé
 *     par identifiant, pas seulement « un seul déplié ».
 *  2. Dépliement exclusif au clic, y compris APRÈS un rafraîchissement
 *     complet (`rendreCycles` rappelée avec un état neuf) — c'est le point
 *     que l'architecte désigne comme le plus facile à croire vert à tort.
 *     Régression couverte : un second clic sur l'en-tête déjà ouvert ne
 *     referme plus rien.
 *  3. L'état d'un cycle ne se lit jamais de `fin_observee_absente`.
 *  4. Les quatre états, épinglés un par un, plus la priorité `en_cours` >
 *     `sans_cloture` sur un cycle qui porte les deux, et un passage sans
 *     `etat` qui NE devient PAS « en cours » par défaut.
 *  5. Aucun nom de spec inventé sur la désignation d'un cycle.
 *  6. État vide explicite ; cycle sans agent typé, la ligne existe.
 *  7. Événements hors session comptés, aucun cycle fantôme.
 *  8. Totaux du bloc de propriétés == somme des lignes de la table,
 *     épinglés ligne par ligne.
 *  9. Repli au-delà de 40 passages, lignes jamais retirées du DOM.
 * 10. Repli neutre pour un agent sans teinte assignée.
 * 14. Structure clavier : bouton natif, portée par tabulation (ordre DOM =
 *     ordre de la liste), en-tête/panneau appariés un par un.
 * 15. Aucun chemin absolu du `cwd` du cycle ne fuit dans l'infobulle d'un
 *     maillon construite depuis ses fichiers touchés.
 *
 * Ce que ce harnais NE peut PAS établir : qu'une touche Entrée/Espace RÉELLE
 * (événement clavier de confiance, `isTrusted: true`) déclenche l'activation
 * d'un `<button>` — c'est un comportement natif du moteur de rendu, jamais
 * simulable par un événement synthétique (`dispatchEvent` reste non fiable
 * pour l'action par défaut d'un bouton), et aucun outil de pilotage de
 * navigateur (CDP, Selenium) n'est installé ici (ADR-0006). Ce harnais
 * établit donc que le bouton EST natif (`<button type="button">`, sans
 * `tabindex` ni gestionnaire `keydown` qui court-circuiterait ce défaut) —
 * la seule chose qui rend cette garantie du navigateur applicable. Voir le
 * plan de test manuel du rapport pour la validation en vraie session.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

let _tests = 0;
const _echecs = [];
function check(nom, condition, detail) {
  _tests += 1;
  if (condition) {
    console.log("  ok     " + nom);
  } else {
    _echecs.push(nom);
    console.log("  ECHEC  " + nom + (detail ? " : " + detail : ""));
  }
}

// ------------------------------------------------------------- fake DOM --
class FakeNode {
  constructor(tag) {
    this.tagName = String(tag || "div").toUpperCase();
    this.children = [];
    this._text = "";
    this.className = "";
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.title = "";
    this.type = "";
    this.id = "";
    this._listeners = {};
  }
  set textContent(v) {
    this._text = v === undefined || v === null ? "" : String(v);
    this.children = [];
  }
  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent).join("");
    return this._text;
  }
  get firstChild() { return this.children.length ? this.children[0] : null; }
  get childNodes() { return this.children; }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) {
    const i = this.children.indexOf(child);
    if (i >= 0) this.children.splice(i, 1);
    return child;
  }
  setAttribute(nom, valeur) { this[nom] = valeur; }
  getAttribute(nom) { return this[nom]; }
  addEventListener(type, gestionnaire) {
    (this._listeners[type] = this._listeners[type] || []).push(gestionnaire);
  }
  get classList() {
    const self = this;
    return {
      add: (c) => { self.className = (self.className ? self.className + " " : "") + c; },
      contains: (c) => self.className.split(/\s+/).filter(Boolean).indexOf(c) !== -1,
    };
  }
}

// Identifiants réellement présents dans `control-center/web/index.html` —
// tenus à jour à la main (même liste que `test_app_bug012.js`, ADR-0006).
// Resynchronisée au lot 3 (feature-021, cycle 2, F7).
const IDS = [
  "a11y-announcement", "account-button", "agents", "avatar",
  "backlog-column-count", "backlog-count",
  "backlog-title", "bandeau-hote", "bandeau-hote-bouton",
  "bandeau-hote-texte", "barre", "bouton-generer-brouillon",
  "compteur-prompt", "compteur-specs", "cycle-canvas", "cycle-indice",
  "cycle-status", "cycle-title", "derogation-minimale", "erreur-generer-brouillon",
  "fichiers", "filtre", "filtre-divergences", "gabarits-adoptes",
  "horodatage", "jauge-flux", "jauge-git",
  "jauge-pilotage", "kanban", "legende-cycles", "link-front-sec",
  "link-front-tests", "link-front2-review", "link-reprise",
  "link-sec-front2", "link-spec-front", "link-tests-front2", "main-content",
  "motion-note", "note-agents", "pied-cycles", "pilotage-corps",
  "porte-aide", "porte-bouton", "porte-champ", "porte-corps", "porte-erreur",
  "porte-jeton", "porte-titre", "projet", "prompt", "redaction-corps",
  "repo-strip", "repo-strip-ok", "repo-strip-texte",
  "selected-code", "selected-duration", "selected-files", "selected-state",
  "selected-task", "selected-title", "selected-tools", "sheet-metrics", "sheet-toggle", "status-dot",
  "summary-active", "summary-step", "summary-time", "systeme", "timeline",
  "tiroir", "tiroir-contenu", "tiroir-fermer", "tiroir-titre", "titre-agents",
  "titre-besoin", "titre-cycles", "titre-demande",
  "titre-evenements", "titre-fichiers", "titre-pilotage", "titre-systeme",
  "user-name", "workflows",
];
const CACHES_PAR_DEFAUT = new Set([
  "bandeau-hote", "tiroir", "porte-jeton", "porte-erreur",
  "erreur-generer-brouillon", "gabarits-adoptes", "repo-strip-ok",
]);

function creerBac() {
  const elements = new Map();
  for (const id of IDS) {
    const n = new FakeNode("div");
    n.id = id;
    n.hidden = CACHES_PAR_DEFAUT.has(id);
    elements.set(id, n);
  }

  const document_ = {
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new FakeNode(tag),
    // feature-017 : `construireDiagramme` (app.js) construit du SVG réel via
    // `createElementNS` — un simple `FakeNode` suffit ici (ce harnais teste
    // l'accordéon, pas le diagramme lui-même — voir `test_app_diagramme.js`).
    createElementNS: (_ns, tag) => new FakeNode(tag),
    createTextNode: (texte) => { const n = new FakeNode("#text"); n.textContent = texte; return n; },
    createDocumentFragment: () => new FakeNode("#fragment"),
    addEventListener: () => {},
    activeElement: null,
  };

  const appelsEventSource = [];
  class FakeEventSource {
    constructor(url) {
      this.url = url;
      this.onopen = null;
      this.onerror = null;
      this._listeners = {};
      appelsEventSource.push(this);
    }
    addEventListener(type, gestionnaire) {
      (this._listeners[type] = this._listeners[type] || []).push(gestionnaire);
    }
  }

  const appelsSetInterval = [];
  let prochainId = 1;
  const setInterval_ = (fn, ms) => {
    const id = prochainId++;
    appelsSetInterval.push({ id, fn, ms });
    return id;
  };
  const clearInterval_ = (id) => {
    const i = appelsSetInterval.findIndex((a) => a.id === id);
    if (i >= 0) appelsSetInterval.splice(i, 1);
  };

  const sessionStorageDonnees = {};
  const sessionStorage_ = {
    getItem: (cle) => (Object.prototype.hasOwnProperty.call(sessionStorageDonnees, cle)
      ? sessionStorageDonnees[cle] : null),
    setItem: (cle, valeur) => { sessionStorageDonnees[cle] = String(valeur); },
    removeItem: (cle) => { delete sessionStorageDonnees[cle]; },
  };

  const reponsesFetch = [];
  const appelsFetch = [];
  async function fetch_(url, options) {
    appelsFetch.push({ url, options });
    for (const r of reponsesFetch) {
      if (r.predicat(url, options)) {
        const resultat = await r.repondre(url, options);
        return {
          status: resultat.status,
          ok: resultat.status >= 200 && resultat.status < 300,
          json: async () => resultat.body,
        };
      }
    }
    throw new Error("fetch non simulé dans le harnais : " + url);
  }

  const sandbox = {
    document: document_,
    sessionStorage: sessionStorage_,
    fetch: fetch_,
    EventSource: FakeEventSource,
    requestAnimationFrame: (cb) => cb(),
    setInterval: setInterval_,
    clearInterval: clearInterval_,
    setTimeout,
    clearTimeout,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  return {
    sandbox, elements, appelsEventSource, appelsSetInterval,
    sessionStorageDonnees, reponsesFetch, appelsFetch,
    $: (id) => elements.get(id),
  };
}

let _sourceDiagrammeJs = null;
let _sourceAppJs = null;
function chargerAppJS(bac) {
  // feature-017 : `app.js` appelle `disposer()`, définie dans `diagramme.js`
  // — chargé ICI, dans le MÊME contexte `vm`, avant `app.js` (même ordre que
  // les deux `<script>` d'`index.html`).
  if (_sourceDiagrammeJs === null) {
    _sourceDiagrammeJs = fs.readFileSync(path.join(__dirname, "diagramme.js"), "utf8");
  }
  new vm.Script(_sourceDiagrammeJs, { filename: "diagramme.js" }).runInContext(bac.sandbox);

  if (_sourceAppJs === null) {
    const chemin = path.join(__dirname, "app.js");
    _sourceAppJs = fs.readFileSync(chemin, "utf8");
  }
  const script = new vm.Script(_sourceAppJs, { filename: "app.js" });
  script.runInContext(bac.sandbox);
}

function attendreMicrotaches() {
  return new Promise((resolve) => setImmediate(resolve));
}

function corpsEtat(overrides) {
  return Object.assign({
    projet: "MonProjet",
    config_lue: true,
    colonnes: [],
    specs: [],
    divergences: 0,
    agents: [],
    workflows: [],
    evenements: [],
    git: { depot: false, branche: null, touches: [], commits: [] },
    commandes_declarees: [],
    garde_fous: { budget_max_usd: null, ecrivains_simultanes: null },
    ecriture_active: false,
    ecriture_raison: "lecture seule (test)",
    jeton_requis: false,
    horodatage: "2026-09-15T12:00:00Z",
  }, overrides || {});
}

function enfilerEtat(bac, status, body) {
  bac.reponsesFetch.push({
    predicat: (url) => String(url).indexOf("/api/etat") === 0,
    repondre: async () => ({ status, body }),
  });
}

// Rafraîchissements successifs : le premier appel à `/api/etat` sert la
// première entrée, chaque appel suivant avance dans la liste (la dernière
// entrée sert pour tout appel excédentaire).
function enfilerEtatSequence(bac, entrees) {
  let indice = 0;
  bac.reponsesFetch.push({
    predicat: (url) => String(url).indexOf("/api/etat") === 0,
    repondre: async () => {
      const entree = entrees[Math.min(indice, entrees.length - 1)];
      indice += 1;
      return entree;
    },
  });
}

async function chargerAvecEtat(overrides) {
  const bac = creerBac();
  enfilerEtat(bac, 200, corpsEtat(overrides));
  chargerAppJS(bac);
  await attendreMicrotaches();
  await attendreMicrotaches();
  await attendreMicrotaches();
  return bac;
}

// bug-020 : `diagramme.js` NON chargé — simule le cas réel (fichier 404,
// PIEGES.md §8, ou script oublié dans `index.html`) où `disposer` n'existe
// pas dans le contexte global d'`app.js`.
async function chargerAvecEtatSansDiagramme(overrides) {
  const bac = creerBac();
  enfilerEtat(bac, 200, corpsEtat(overrides));
  if (_sourceAppJs === null) {
    _sourceAppJs = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  }
  new vm.Script(_sourceAppJs, { filename: "app.js" }).runInContext(bac.sandbox);
  await attendreMicrotaches();
  await attendreMicrotaches();
  await attendreMicrotaches();
  return bac;
}

// Déclenche `rafraichir()` via l'événement SSE "maj" — le seul chemin que
// `app.js` prévoit pour redemander `/api/etat` en cours de session.
async function provoquerRafraichissement(bac) {
  const source = bac.appelsEventSource[0];
  (source._listeners.maj || []).forEach((fn) => fn());
  await attendreMicrotaches();
  await attendreMicrotaches();
  await attendreMicrotaches();
}

// ------------------------------------------------------------ fixtures --
function segment(type, agent, overrides) {
  return Object.assign({
    type, agent,
    agent_id: agent + "-id",
    debut: "2026-09-14T08:00:00.000Z",
    fin: "2026-09-14T08:00:01.000Z",
    duree_ms: 1000,
    outils: 0,
    fichiers: [],
    echecs: 0,
    termine: true,
    etat: "termine",
    commandes: [],
    derniere_activite: "2026-09-14T08:00:01.000Z",
  }, overrides || {});
}

function workflow(overrides) {
  return Object.assign({
    session_id: "sessA",
    workflow_id: "sessA#0",
    indice_cycle: 0,
    debut: "2026-09-14T08:00:00.000Z",
    fin_observee: "2026-09-14T08:10:00.000Z",
    fin_observee_absente: false,
    cwd: "/root/agent-kit",
    runtime: "claude-code",
    passages: [],
    segments: [],
    fichiers: [],
    echecs: 0,
    commandes: {},
    imbrication_suspectee: false,
    fermetures_orphelines: 0,
    reprises: {},
    bornage: "session-entiere",
    borne_par: null,
  }, overrides || {});
}

// ------------------------------------------------------------- lecture DOM
function tousLesNoeuds(racine) {
  const resultat = [];
  (function parcourir(n) {
    resultat.push(n);
    (n.children || []).forEach(parcourir);
  })(racine);
  return resultat;
}
function classes(n) { return (n.className || "").split(/\s+/).filter(Boolean); }
function aClasse(n, c) { return classes(n).indexOf(c) !== -1; }
// Un nœud SVG pose sa classe via `setAttribute("class", …)` (voir `svgEl`,
// app.js) — le `FakeNode` générique de ce harnais stocke ça dans la
// propriété `class`, PAS `className` (celle-ci reste posée par `el()`, pour
// le HTML classique). Un `aClasse` seul serait aveugle à tout nœud du
// diagramme (PIEGES.md §à-venir, control-center) : toujours lire les DEUX.
function classesSvg(n) { return (n.class || n.className || "").split(/\s+/).filter(Boolean); }
function aClasseSvg(n, c) { return classesSvg(n).indexOf(c) !== -1; }
function cliquer(bouton) { (bouton._listeners.click || []).forEach((fn) => fn()); }

function cyclesLi(bac) {
  return bac.$("workflows").children.filter((n) => n.tagName === "LI" && aClasse(n, "cycle"));
}
function enteteEtDetail(li) {
  const h3 = li.children[0];
  const bouton = h3.children[0];
  const detail = li.children[1];
  return { h3, bouton, detail };
}
function trouverParClasse(racine, c) {
  return tousLesNoeuds(racine).filter((n) => aClasse(n, c));
}
function unParClasse(racine, c) {
  const trouves = trouverParClasse(racine, c);
  return trouves.length ? trouves[0] : null;
}
function proprietes(detail) {
  const dl = unParClasse(detail, "cycle-proprietes");
  const paires = {};
  if (!dl) return paires;
  for (let i = 0; i < dl.children.length; i += 2) {
    paires[dl.children[i].textContent] = dl.children[i + 1].textContent;
  }
  return paires;
}
function lignesTable(detail) {
  const table = tousLesNoeuds(detail).find((n) => n.tagName === "TABLE");
  if (!table) return [];
  const tbody = table.children.find((c) => c.tagName === "TBODY");
  return tbody ? tbody.children : [];
}
function texteEtat(ligne) {
  const badge = unParClasse(ligne, "cycle-etat");
  return badge ? badge.textContent : "";
}
function nomAgentLigne(ligne) {
  const nom = unParClasse(ligne, "agent-nom");
  return nom ? nom.textContent : "";
}

// ===================================================================== //
// item 1 — un seul cycle déplié à l'ouverture, et c'est le plus récent    //
// ===================================================================== //
async function testUnSeulDeplioLePlusRecent() {
  const a = workflow({ workflow_id: "sessA#0", debut: "2026-09-14T06:00:00.000Z" });
  const b = workflow({ workflow_id: "sessA#1", debut: "2026-09-14T07:00:00.000Z" });
  const c = workflow({ workflow_id: "sessA#2", debut: "2026-09-14T08:00:00.000Z" });
  // Fourni dans l'ordre ASCENDANT (comme `events.reconstruire`, le plus
  // ancien en premier) — c'est `rendreCycles` qui inverse pour l'affichage.
  const bac = await chargerAvecEtat({ workflows: [a, b, c] });
  const lis = cyclesLi(bac);
  check("A1_trois_cycles_rendus", lis.length === 3, "obtenu " + lis.length);

  const { bouton: boutonC } = enteteEtDetail(lis[0]);
  const { bouton: boutonB } = enteteEtDetail(lis[1]);
  const { bouton: boutonA } = enteteEtDetail(lis[2]);

  // Épinglé UN PAR UN — jamais seulement « exactement un true dans la liste »
  // (une permutation C/B resterait invisible à une assertion d'ensemble).
  check("A1_c_le_plus_recent_est_premier_dans_le_DOM",
    boutonC.getAttribute("aria-expanded") === "true", "obtenu " + boutonC.getAttribute("aria-expanded"));
  check("A1_b_reste_ferme", boutonB.getAttribute("aria-expanded") === "false");
  check("A1_a_reste_ferme", boutonA.getAttribute("aria-expanded") === "false");

  const { detail: detailC } = enteteEtDetail(lis[0]);
  const { detail: detailB } = enteteEtDetail(lis[1]);
  check("A1_detail_c_visible", detailC.hidden === false);
  check("A1_detail_b_cache", detailB.hidden === true);
}

// ===================================================================== //
// item 2 — dépliement exclusif, y compris après un rafraîchissement       //
// ===================================================================== //
async function testDepliementExclusifEtSurvieAuRafraichissement() {
  const a = workflow({ workflow_id: "sessA#0", debut: "2026-09-14T06:00:00.000Z" });
  const b = workflow({ workflow_id: "sessA#1", debut: "2026-09-14T07:00:00.000Z" });
  const c = workflow({ workflow_id: "sessA#2", debut: "2026-09-14T08:00:00.000Z" });

  const bac = creerBac();
  enfilerEtatSequence(bac, [
    { status: 200, body: corpsEtat({ workflows: [a, b, c], cycles_total: 3 }) },
    // Deuxième réponse (rafraîchissement) : mêmes cycles, un compteur qui
    // bouge — c'est le cas normal d'un sondage périodique, pas un jeu de
    // données différent.
    { status: 200, body: corpsEtat({ workflows: [a, b, c], cycles_total: 3, evenements_hors_session: 1 }) },
  ]);
  chargerAppJS(bac);
  await attendreMicrotaches(); await attendreMicrotaches(); await attendreMicrotaches();

  // On déplie B (le cycle du milieu, ni le défaut ni le premier de la liste).
  let lis = cyclesLi(bac);
  let { bouton: boutonB } = enteteEtDetail(lis[1]);
  cliquer(boutonB);

  lis = cyclesLi(bac);
  let etats = lis.map((li) => enteteEtDetail(li).bouton.getAttribute("aria-expanded"));
  check("B1_apres_clic_b_ouvert", etats[1] === "true", "obtenu " + JSON.stringify(etats));
  check("B1_apres_clic_c_ferme", etats[0] === "false", "obtenu " + JSON.stringify(etats));
  check("B1_apres_clic_a_ferme", etats[2] === "false", "obtenu " + JSON.stringify(etats));

  // Second clic sur B, DÉJÀ ouvert : ne referme rien (régression corrigée
  // en cours de route par le développeur).
  ({ bouton: boutonB } = enteteEtDetail(cyclesLi(bac)[1]));
  cliquer(boutonB);
  lis = cyclesLi(bac);
  etats = lis.map((li) => enteteEtDetail(li).bouton.getAttribute("aria-expanded"));
  check("B1_second_clic_sur_ouvert_ne_referme_rien",
    etats[1] === "true" && etats[0] === "false" && etats[2] === "false",
    "obtenu " + JSON.stringify(etats));

  // ⚠️ Le point que l'architecte désigne comme le plus facile à croire vert
  // à tort : un RAFRAÎCHISSEMENT COMPLET (nouvel état reçu, `rendreCycles`
  // rappelée depuis `rafraichir()`, pas depuis le clic) ne doit PAS
  // réinitialiser le choix sur le cycle le plus récent.
  await provoquerRafraichissement(bac);
  lis = cyclesLi(bac);
  etats = lis.map((li) => enteteEtDetail(li).bouton.getAttribute("aria-expanded"));
  check("B1_choix_survit_au_rafraichissement",
    etats[1] === "true", "obtenu " + JSON.stringify(etats) + " (B doit rester ouvert)");
  check("B1_c_toujours_ferme_apres_rafraichissement", etats[0] === "false");
  check("B1_a_toujours_ferme_apres_rafraichissement", etats[2] === "false");
}

// Mutant survécu à la première passe (revue) : la garde
// `!idsPresents.has(cycleOuvert)` de `rendreCycles` protège le cas où le
// cycle ouvert SORT de la fenêtre affichée (`workflows_affiches`, défaut 20
// — server.py tranche `workflows[-N:]`) : son identifiant disparaît de
// l'état servi. Sans la garde, `cycleOuvert` resterait un identifiant
// absent de la liste courante et PLUS AUCUN cycle ne s'ouvrirait — un repli
// total que le commentaire du code promet d'interdire (§6 : « jamais deux
// détails ouverts », implicitement jamais zéro non plus une fois un premier
// rendu fait). Épinglé : pas seulement « un seul ouvert », mais LEQUEL.
async function testCycleOuvertSortiDeLaFenetreRepliSurLePlusRecent() {
  const a = workflow({ workflow_id: "sessM#0", debut: "2026-09-14T05:00:00.000Z" });
  const b = workflow({ workflow_id: "sessM#1", debut: "2026-09-14T06:00:00.000Z" });
  const c = workflow({ workflow_id: "sessM#2", debut: "2026-09-14T07:00:00.000Z" });
  const d = workflow({ workflow_id: "sessM#3", debut: "2026-09-14T08:00:00.000Z" });

  const bac = creerBac();
  const fenetreInitiale = corpsEtat({ workflows: [a, b, c] });
  // ⚠️ Le bootstrap d'`app.js` fait DEUX appels `/api/etat` avant tout
  // rafraîchissement explicite : `verifierEtatAuth()` (résultat jeté, seul
  // `jeton_requis` compte) PUIS `rafraichir()` elle-même, qui est celle qui
  // rend réellement (voir `verifierEtatAuth`, app.js). La première entrée de
  // la séquence sert au premier appel jeté, la SECONDE au rendu initial
  // réel — c'est seulement la TROISIÈME qui correspond à mon rafraîchissement
  // explicite ci-dessous.
  enfilerEtatSequence(bac, [
    { status: 200, body: fenetreInitiale },
    { status: 200, body: fenetreInitiale },
    // La fenêtre affichée a tourné : A (le cycle ouvert par l'utilisateur)
    // est sorti, D (plus récent que tout ce qui précède) est entré.
    { status: 200, body: corpsEtat({ workflows: [b, c, d] }) },
  ]);
  chargerAppJS(bac);
  await attendreMicrotaches(); await attendreMicrotaches(); await attendreMicrotaches();

  // Vérifie qu'on part bien de la fenêtre initiale AVANT de cliquer — sinon
  // le clic suivant porterait sur le mauvais cycle sans qu'aucune assertion
  // ne le révèle (voir le commentaire ci-dessus : c'est exactement le piège
  // qui a fait échouer la première version de ce test).
  const idsAuDepart = cyclesLi(bac).map((li) => enteteEtDetail(li).bouton.getAttribute("aria-controls"));
  check("mutant_survecu_precondition_fenetre_initiale_chargee",
    idsAuDepart.some((id) => id.indexOf("sessM-0") !== -1),
    "obtenu : " + JSON.stringify(idsAuDepart) + " — A (sessM#0) doit être présent avant le clic");

  // On déplie A, le cycle le PLUS ANCIEN de la première fenêtre — identité
  // vérifiée AVANT de cliquer, jamais supposée depuis un seul indice.
  let lis = cyclesLi(bac);
  const { bouton: boutonA } = enteteEtDetail(lis[2]);
  check("mutant_survecu_precondition_lis_2_est_bien_a",
    boutonA.getAttribute("aria-controls").indexOf("sessM-0") !== -1,
    "obtenu : " + boutonA.getAttribute("aria-controls"));
  cliquer(boutonA);
  lis = cyclesLi(bac);
  check("mutant_survecu_precondition_a_ouvert",
    enteteEtDetail(lis[2]).bouton.getAttribute("aria-expanded") === "true",
    "obtenu " + enteteEtDetail(lis[2]).bouton.getAttribute("aria-expanded"));

  // A disparaît de la fenêtre affichée (rafraîchissement).
  await provoquerRafraichissement(bac);
  lis = cyclesLi(bac);
  check("mutant_survecu_toujours_trois_cycles_affiches", lis.length === 3,
    "obtenu " + lis.length);

  const etats = lis.map((li) => enteteEtDetail(li).bouton.getAttribute("aria-expanded"));
  const nbOuverts = etats.filter((e) => e === "true").length;
  check("mutant_survecu_exactement_un_cycle_ouvert", nbOuverts === 1,
    "obtenu " + nbOuverts + " (" + JSON.stringify(etats) + ")");

  // Épinglé : c'est D (le plus récent de la NOUVELLE fenêtre), pas B ni C,
  // et surtout pas « rien » (repli total, le défaut sans la garde).
  const { bouton: boutonD, detail: detailD } = enteteEtDetail(lis[0]);
  check("mutant_survecu_c_est_bien_d_le_plus_recent_qui_s_ouvre",
    boutonD.getAttribute("aria-controls").indexOf("sessM-3") !== -1
    && boutonD.getAttribute("aria-expanded") === "true",
    "aria-controls=" + boutonD.getAttribute("aria-controls")
    + " aria-expanded=" + boutonD.getAttribute("aria-expanded"));
  check("mutant_survecu_detail_d_visible", detailD.hidden === false);
  const { bouton: boutonC } = enteteEtDetail(lis[1]);
  const { bouton: boutonB } = enteteEtDetail(lis[2]);
  check("mutant_survecu_c_reste_ferme", boutonC.getAttribute("aria-expanded") === "false");
  check("mutant_survecu_b_reste_ferme", boutonB.getAttribute("aria-expanded") === "false");
}

// ===================================================================== //
// item 3 — l'état ne se lit jamais de `fin_observee_absente`              //
// ===================================================================== //
async function testEtatIgnoreFinObserveeAbsente() {
  // `fin_observee_absente: true` (vrai pour 85,7 % des cycles réels,
  // bug-002 non corrigé), mais TOUS les passages sont `termine` : le cycle
  // ne doit PAS s'afficher « en cours ».
  const wf = workflow({
    workflow_id: "sessB#0",
    fin_observee_absente: true,
    passages: [
      segment("sousagent", "test-engineer", { etat: "termine", termine: true }),
    ],
  });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { bouton } = enteteEtDetail(cyclesLi(bac)[0]);
  const texte = bouton.textContent;
  check("item3_termine_malgre_fin_observee_absente_vraie",
    texte.indexOf("terminé") !== -1, "obtenu : " + JSON.stringify(texte));
  check("item3_jamais_en_cours_a_cause_du_champ",
    texte.indexOf("en cours") === -1, "obtenu : " + JSON.stringify(texte));
}

// ===================================================================== //
// item 4 — les quatre états, épinglés, plus la priorité et le défaut      //
// ===================================================================== //
async function testQuatreEtatsEtPrioriteEtDefaut() {
  const wfEnCours = workflow({
    workflow_id: "sessC#0",
    passages: [segment("sousagent", "test-engineer", { etat: "en_cours", termine: false })],
  });
  const wfSansCloture = workflow({
    workflow_id: "sessC#1",
    passages: [segment("sousagent", "debugger", { etat: "sans_cloture", termine: false })],
  });
  const wfTermine = workflow({
    workflow_id: "sessC#2",
    passages: [segment("sousagent", "doc-writer", { etat: "termine", termine: true })],
  });
  // 3 cycles sur 14 dans le journal réel n'ont AUCUN passage typé — c'est
  // « indéterminé », jamais « terminé ».
  const wfIndetermineSansPassage = workflow({ workflow_id: "sessC#3", passages: [] });
  // Un passage sans champ `etat` DU TOUT (journal antérieur à bug-013) :
  // indéterminé, jamais « en cours » par défaut.
  const wfIndeterminePassageSansEtat = workflow({
    workflow_id: "sessC#4",
    passages: [(() => { const s = segment("sousagent", "spec-reader", { termine: false }); delete s.etat; return s; })()],
  });
  // Priorité en_cours > sans_cloture, sur le MÊME cycle : la mutation qui
  // inverserait cette priorité doit mourir ici.
  const wfMixte = workflow({
    workflow_id: "sessC#5",
    passages: [
      segment("sousagent", "backend-developer", { etat: "sans_cloture", termine: false }),
      segment("sousagent", "frontend-developer", { etat: "en_cours", termine: false }),
    ],
  });

  const bac = await chargerAvecEtat({
    workflows: [wfEnCours, wfSansCloture, wfTermine, wfIndetermineSansPassage,
      wfIndeterminePassageSansEtat, wfMixte],
  });
  const lis = cyclesLi(bac);
  // Rendu en ordre INVERSE de la liste fournie.
  const parId = {};
  lis.forEach((li) => {
    const { bouton } = enteteEtDetail(li);
    // `aria-controls` porte l'identifiant assaini du cycle — s'en servir
    // pour retrouver, sans dépendre de l'ordre, le bon bouton par cycle.
    parId[bouton.getAttribute("aria-controls")] = bouton;
  });

  const idDetail = (id) => "cycle-" + id.replace(/[^A-Za-z0-9_-]/g, "-") + "-detail";
  // Épinglé sur la CLASSE du badge, jamais sur une sous-chaîne de texte :
  // « indéterminé » contient littéralement la sous-chaîne « terminé »
  // (in-DÉTERMINÉ), un `indexOf` seul s'y ferait tromper.
  const classeBadge = (id) => {
    const badge = unParClasse(parId[idDetail(id)], "cycle-etat");
    return badge ? classes(badge).filter((c) => c !== "cycle-etat").join(" ") : "(aucun badge)";
  };
  const texteDe = (id) => parId[idDetail(id)].textContent;

  check("item4_en_cours", classeBadge("sessC#0") === "en-cours",
    "obtenu : " + JSON.stringify(classeBadge("sessC#0")));
  check("item4_sans_cloture", classeBadge("sessC#1") === "sans-cloture",
    "obtenu : " + JSON.stringify(classeBadge("sessC#1")));
  check("item4_termine", classeBadge("sessC#2") === "termine",
    "obtenu : " + JSON.stringify(classeBadge("sessC#2")));
  check("item4_indetermine_sans_aucun_passage",
    classeBadge("sessC#3") === "indetermine",
    "obtenu : " + JSON.stringify(classeBadge("sessC#3")));
  check("item4_indetermine_passage_sans_etat_jamais_en_cours_par_defaut",
    classeBadge("sessC#4") === "indetermine"
    && texteDe("sessC#4").indexOf("en cours") === -1,
    "classe=" + JSON.stringify(classeBadge("sessC#4")) + " texte=" + JSON.stringify(texteDe("sessC#4")));
  check("item4_priorite_en_cours_sur_sans_cloture",
    classeBadge("sessC#5") === "en-cours",
    "obtenu : " + JSON.stringify(classeBadge("sessC#5")));
}

// ===================================================================== //
// item 5 — aucun nom de spec inventé dans la désignation                  //
// ===================================================================== //
async function testDesignationSansNomInvente() {
  const wfOuvert = workflow({
    workflow_id: "sessD#0",
    bornage: "marqueur-agent", borne_par: "backend-developer",
    // Champ parasite : si une future régression lisait un nom de spec
    // imaginaire quelque part sur le workflow, ce test le débusquerait.
    nom_spec: "feature-999-jamais-affichee",
  });
  const wfPrefixe = workflow({ workflow_id: "sessD#1", bornage: "avant-premier-marqueur", nom_spec: "feature-999-jamais-affichee" });
  const wfSession = workflow({ workflow_id: "sessD#2", bornage: "session-entiere", nom_spec: "feature-999-jamais-affichee" });

  const bac = await chargerAvecEtat({ workflows: [wfOuvert, wfPrefixe, wfSession] });
  const lis = cyclesLi(bac);
  const [liSession, liPrefixe, liOuvert] = lis; // rendu inversé

  check("item5_ouvert_par_agent",
    enteteEtDetail(liOuvert).bouton.textContent.indexOf("ouvert par") !== -1);
  check("item5_avant_premier_repere",
    enteteEtDetail(liPrefixe).bouton.textContent.indexOf("avant le premier repère") !== -1);
  check("item5_session_entiere",
    enteteEtDetail(liSession).bouton.textContent.indexOf("session entière") !== -1);

  const texteTotal = lis.map((li) => enteteEtDetail(li).bouton.textContent).join(" | ");
  check("item5_aucun_nom_de_spec_invente",
    texteTotal.indexOf("feature-999") === -1, "obtenu : " + JSON.stringify(texteTotal));
}

// ===================================================================== //
// item 6 — état vide explicite ; cycle sans agent typé                    //
// ===================================================================== //
async function testEtatVideExplicite() {
  const bac = await chargerAvecEtat({ workflows: [] });
  check("item6_zone_porte_un_seul_enfant_vide",
    bac.$("workflows").children.length === 1
    && aClasse(bac.$("workflows").children[0], "vide"));
  const texte = bac.$("workflows").children[0].textContent;
  check("item6_texte_dit_quoi_faire",
    texte.indexOf("aucun cycle observé") !== -1 && texte.toLowerCase().indexOf("pilotage") !== -1,
    "obtenu : " + JSON.stringify(texte));
  check("item6_legende_videe", bac.$("legende-cycles").textContent === "");
  check("item6_pied_vide", bac.$("pied-cycles").textContent === "");
}

async function testCycleSansAgentTypeNeDisparaitPas() {
  const wf = workflow({ workflow_id: "sessE#0", passages: [] });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const lis = cyclesLi(bac);
  check("item6_la_ligne_existe_quand_meme", lis.length === 1);
  const { detail } = enteteEtDetail(lis[0]);
  const vide = unParClasse(detail, "vide");
  check("item6_le_detail_le_dit",
    !!vide && vide.textContent.indexOf("aucun agent typé") !== -1,
    "obtenu : " + JSON.stringify(vide && vide.textContent));
}

// ===================================================================== //
// item 7 — événements hors session : comptés, aucun cycle fantôme         //
// ===================================================================== //
async function testEvenementsHorsSessionComptesSansFantome() {
  const a = workflow({ workflow_id: "sessF#0", debut: "2026-09-14T06:00:00.000Z" });
  const b = workflow({ workflow_id: "sessF#1", debut: "2026-09-14T07:00:00.000Z" });
  const bac = await chargerAvecEtat({
    workflows: [a, b], cycles_total: 5, evenements_hors_session: 4,
  });
  const lis = cyclesLi(bac);
  check("item7_aucun_cycle_fantome_exactement_deux_lignes", lis.length === 2,
    "obtenu " + lis.length);
  check("item7_pied_annonce_le_compte",
    bac.$("pied-cycles").textContent.indexOf("4 événement(s) sans session associée") !== -1,
    "obtenu : " + JSON.stringify(bac.$("pied-cycles").textContent));
  check("item7_legende_2_sur_5",
    bac.$("legende-cycles").textContent.indexOf("2 sur 5") !== -1,
    "obtenu : " + JSON.stringify(bac.$("legende-cycles").textContent));
}

async function testPiedVidePasDeHorsSession() {
  const a = workflow({ workflow_id: "sessG#0" });
  const bac = await chargerAvecEtat({ workflows: [a], evenements_hors_session: 0 });
  check("item7_pied_vide_si_aucun_hors_session", bac.$("pied-cycles").textContent === "",
    "obtenu : " + JSON.stringify(bac.$("pied-cycles").textContent));
}

// ===================================================================== //
// item 8 — totaux du bloc de propriétés == somme des lignes, épinglés     //
// ===================================================================== //
async function testTotauxProprietesEgalentLaSommeDesLignesEpingle() {
  const principal = segment("principal", "(agent principal)", { outils: 5, fichiers: [] });
  const passageA = segment("sousagent", "backend-developer", { outils: 3, fichiers: ["a.py"] });
  const passageB = segment("sousagent", "test-engineer", { outils: 2, fichiers: ["b.py", "c.py"] });
  // Rebouclage réel : backend-developer réapparaît après qu'un AUTRE
  // sous-agent (test-engineer) se soit intercalé.
  const passageC = segment("sousagent", "backend-developer", { outils: 0, fichiers: [] });

  const wf = workflow({
    workflow_id: "sessH#0",
    segments: [principal, passageA, passageB, passageC],
    passages: [passageA, passageB, passageC],
    fichiers: ["a.py", "b.py", "c.py", "d.md"],
    imbrication_suspectee: true,
  });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);
  const props = proprietes(detail);

  check("item8_total_outils_egale_la_somme_5_3_2_0",
    props["Appels d'outils"] === "10", "obtenu : " + JSON.stringify(props["Appels d'outils"]));
  check("item8_fichiers_ecrits_4",
    props["Fichiers écrits"] === "4", "obtenu : " + JSON.stringify(props["Fichiers écrits"]));
  check("item8_un_rebouclage_detecte",
    props["Rebouclages"] === "1", "obtenu : " + JSON.stringify(props["Rebouclages"]));
  check("item8_agents_simultanes_suspectes",
    props["Agents simultanés"] === "suspectés", "obtenu : " + JSON.stringify(props["Agents simultanés"]));

  // Épinglé LIGNE PAR LIGNE — jamais seulement « la somme correspond »
  // (deux lignes interverties donneraient la même somme sans se trahir).
  const lignes = lignesTable(detail);
  check("item8_trois_lignes_dans_la_table", lignes.length === 3, "obtenu " + lignes.length);
  check("item8_ligne_1_est_backend_developer_3_outils",
    nomAgentLigne(lignes[0]) === "backend-developer" && lignes[0].children[3].textContent === "3",
    "agent=" + nomAgentLigne(lignes[0]) + " outils=" + lignes[0].children[3].textContent);
  check("item8_ligne_2_est_test_engineer_2_outils",
    nomAgentLigne(lignes[1]) === "test-engineer" && lignes[1].children[3].textContent === "2",
    "agent=" + nomAgentLigne(lignes[1]) + " outils=" + lignes[1].children[3].textContent);
  check("item8_ligne_3_est_backend_developer_reprise_0_outils",
    nomAgentLigne(lignes[2]) === "backend-developer" && lignes[2].children[3].textContent === "0",
    "agent=" + nomAgentLigne(lignes[2]) + " outils=" + lignes[2].children[3].textContent);
  check("item8_seule_la_ligne_de_reprise_porte_repris",
    !aClasse(lignes[0], "repris") && !aClasse(lignes[1], "repris") && aClasse(lignes[2], "repris"),
    lignes.map((l) => classes(l).join(" ")).join(" | "));
}

// ===================================================================== //
// item 9 — repli au-delà de 40 passages, jamais retirés du DOM            //
// ===================================================================== //
function passagesUniformes(n) {
  const liste = [];
  for (let i = 0; i < n; i++) {
    const num = String(i).padStart(3, "0");
    liste.push(segment("sousagent", "agent-" + num, {
      duree_ms: 100, outils: 1, fichiers: [], etat: "termine", termine: true,
    }));
  }
  return liste;
}

async function testRepliAuDelaDe40Passages() {
  const passages = passagesUniformes(45);
  const wf = workflow({ workflow_id: "sessI#0", passages });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);
  const lignes = lignesTable(detail);

  check("item9_les_45_lignes_sont_dans_le_DOM", lignes.length === 45, "obtenu " + lignes.length);
  // Épinglé : ce sont les 5 PLUS ANCIENNES (index 0..4) qui sont repliées —
  // pas 5 lignes quelconques.
  check("item9_ligne_0_repliee_agent_000",
    lignes[0].hidden === true && nomAgentLigne(lignes[0]) === "agent-000",
    "hidden=" + lignes[0].hidden + " agent=" + nomAgentLigne(lignes[0]));
  check("item9_ligne_4_repliee_agent_004",
    lignes[4].hidden === true && nomAgentLigne(lignes[4]) === "agent-004",
    "hidden=" + lignes[4].hidden + " agent=" + nomAgentLigne(lignes[4]));
  check("item9_ligne_5_visible_agent_005",
    lignes[5].hidden === false && nomAgentLigne(lignes[5]) === "agent-005",
    "hidden=" + lignes[5].hidden + " agent=" + nomAgentLigne(lignes[5]));
  check("item9_derniere_ligne_visible_agent_044",
    lignes[44].hidden === false && nomAgentLigne(lignes[44]) === "agent-044",
    "hidden=" + lignes[44].hidden + " agent=" + nomAgentLigne(lignes[44]));

  const bouton = unParClasse(detail, "action-repli");
  check("item9_bouton_annonce_5_passages",
    !!bouton && bouton.textContent === "Afficher les 5 passages plus anciens",
    "obtenu : " + JSON.stringify(bouton && bouton.textContent));
  check("item9_bouton_aria_expanded_false", bouton.getAttribute("aria-expanded") === "false");

  cliquer(bouton);
  check("item9_apres_clic_ligne_0_visible", lignes[0].hidden === false);
  check("item9_apres_clic_ligne_4_visible", lignes[4].hidden === false);
  check("item9_apres_clic_bouton_annonce_masquer",
    bouton.textContent === "Masquer les 5 passages plus anciens",
    "obtenu : " + JSON.stringify(bouton.textContent));
  check("item9_apres_clic_toujours_45_lignes_dans_le_DOM",
    lignesTable(detail).length === 45, "obtenu " + lignesTable(detail).length);

  cliquer(bouton);
  check("item9_second_clic_referme_sans_retirer",
    lignes[0].hidden === true && lignesTable(detail).length === 45,
    "hidden=" + lignes[0].hidden + " total=" + lignesTable(detail).length);
}

async function testFrontiereExactementQuarantePasDeRepli() {
  const wf = workflow({ workflow_id: "sessI#1", passages: passagesUniformes(40) });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);
  check("item9_exactement_40_aucun_repli", !unParClasse(detail, "action-repli"),
    "un bouton de repli existe alors qu'il ne devrait pas, à 40 passages pile");
  check("item9_exactement_40_toutes_visibles",
    lignesTable(detail).every((l) => l.hidden === false));
}

async function testFrontiereQuaranteEtUnDeclencheUnRepli() {
  const wf = workflow({ workflow_id: "sessI#2", passages: passagesUniformes(41) });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);
  const bouton = unParClasse(detail, "action-repli");
  check("item9_41_passages_declenche_un_repli_de_1",
    !!bouton && bouton.textContent.indexOf("1 passage") !== -1,
    "obtenu : " + JSON.stringify(bouton && bouton.textContent));
}

async function testPireCasMesure297() {
  const wf = workflow({ workflow_id: "sessI#3", passages: passagesUniformes(297) });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);
  const lignes = lignesTable(detail);
  check("item9_297_passages_tous_dans_le_DOM", lignes.length === 297, "obtenu " + lignes.length);
  const excedent = 297 - 40;
  check("item9_297_excedent_257_replie", lignes[0].hidden === true && lignes[excedent - 1].hidden === true);
  check("item9_297_ligne_40_visible", lignes[excedent].hidden === false);
  const bouton = unParClasse(detail, "action-repli");
  check("item9_297_bouton_annonce_257",
    !!bouton && bouton.textContent.indexOf("257 passages") !== -1,
    "obtenu : " + JSON.stringify(bouton && bouton.textContent));
}

// ===================================================================== //
// item 10 — plus de couleur d'identité par agent (ADR-0032, feature-021    //
// cycle 2 lot 4) : le texte SEUL porte l'identité, quel que soit le rôle,  //
// connu ou non — aucun repli neutre à tester puisqu'il n'y a plus qu'un    //
// seul registre visuel, partagé par tous les rôles.                       //
// ===================================================================== //
async function testAucuneCouleurDIdentitePourAucunRole() {
  const passageConnu = segment("sousagent", "test-engineer", { outils: 1 });
  const passageInconnu = segment("sousagent", "role-jamais-vu", { outils: 1 });
  const wf = workflow({
    workflow_id: "sessJ#0",
    passages: [passageConnu, passageInconnu],
  });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);
  const lignes = lignesTable(detail);

  const sigleConnu = unParClasse(lignes[0], "agent-sigle");
  const nomConnu = unParClasse(lignes[0], "agent-nom");
  check("item10_role_connu_aucune_couleur_inline",
    !sigleConnu.style.color && !sigleConnu.style.background && !nomConnu.style.color,
    "sigle.color=" + sigleConnu.style.color + " sigle.bg=" + sigleConnu.style.background
    + " nom.color=" + nomConnu.style.color);

  const sigleInconnu = unParClasse(lignes[1], "agent-sigle");
  const nomInconnu = unParClasse(lignes[1], "agent-nom");
  check("item10_role_inconnu_aucune_couleur_inline_non_plus",
    !sigleInconnu.style.color && !sigleInconnu.style.background && !nomInconnu.style.color,
    "sigle.color=" + sigleInconnu.style.color + " sigle.bg=" + sigleInconnu.style.background
    + " nom.color=" + nomInconnu.style.color);
}

// ===================================================================== //
// item 14 — structure clavier : natif, tabulation en ordre de liste,      //
// panneau apparié un par un                                               //
// ===================================================================== //
async function testStructureClavier() {
  const a = workflow({ workflow_id: "sessK#0", debut: "2026-09-14T06:00:00.000Z" });
  const b = workflow({ workflow_id: "sessK#1", debut: "2026-09-14T07:00:00.000Z" });
  const c = workflow({ workflow_id: "sessK#2", debut: "2026-09-14T08:00:00.000Z" });
  const bac = await chargerAvecEtat({ workflows: [a, b, c] });
  const lis = cyclesLi(bac); // ordre DOM = ordre de tabulation naturel : C, B, A

  lis.forEach((li, index) => {
    const { bouton, detail } = enteteEtDetail(li);
    check("item14_bouton_" + index + "_est_un_vrai_button",
      bouton.tagName === "BUTTON" && bouton.type === "button",
      "tagName=" + bouton.tagName + " type=" + bouton.type);
    check("item14_bouton_" + index + "_aucun_tabindex_qui_le_sortirait_de_l_ordre_naturel",
      bouton.tabindex === undefined || bouton.tabindex === "" || bouton.tabindex === 0,
      "obtenu tabindex=" + JSON.stringify(bouton.tabindex));
    check("item14_bouton_" + index + "_aucun_gestionnaire_keydown_qui_court_circuiterait_le_natif",
      !bouton._listeners.keydown, "un keydown est enregistré : le natif Entrée/Espace pourrait être altéré");
    // Appariement un par un (pas « tous les id concordent quelque part »).
    check("item14_panneau_" + index + "_suit_son_entete",
      bouton.getAttribute("aria-controls") === detail.id
      && detail.getAttribute("aria-labelledby") === bouton.id,
      "aria-controls=" + bouton.getAttribute("aria-controls") + " detail.id=" + detail.id
      + " aria-labelledby=" + detail.getAttribute("aria-labelledby") + " bouton.id=" + bouton.id);
  });

  // L'ordre DOM (= ordre de tabulation) suit l'ordre de la LISTE affichée :
  // le plus récent (C) en premier.
  const idsOrdre = lis.map((li) => enteteEtDetail(li).bouton.getAttribute("aria-controls"));
  check("item14_ordre_dom_est_c_b_a",
    idsOrdre[0].indexOf("sessK-2") !== -1
    && idsOrdre[1].indexOf("sessK-1") !== -1
    && idsOrdre[2].indexOf("sessK-0") !== -1,
    "obtenu : " + JSON.stringify(idsOrdre));
}

// ===================================================================== //
// item 15 — aucun chemin absolu du `cwd` ne fuit dans l'infobulle         //
// ===================================================================== //
async function testAucunCheminAbsoluDansLInfobulle() {
  const principal = segment("principal", "(agent principal)", {
    outils: 2, fichiers: ["control-center/web/app.js"],
  });
  const wf = workflow({
    workflow_id: "sessL#0",
    cwd: "/root/agent-kit",
    segments: [principal],
    passages: [],
  });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);
  const maillon = unParClasse(detail, "maillon");
  check("item15_maillon_existe", !!maillon);
  const infobulle = maillon ? maillon.title : "";
  check("item15_infobulle_ne_contient_pas_le_cwd_absolu",
    infobulle.indexOf("/root/agent-kit") === -1,
    "obtenu : " + JSON.stringify(infobulle));
  check("item15_infobulle_ne_commence_aucune_ligne_par_un_slash",
    !/(^|\n)\//.test(infobulle), "obtenu : " + JSON.stringify(infobulle));
  check("item15_infobulle_porte_bien_le_chemin_relatif",
    infobulle.indexOf("control-center/web/app.js") !== -1,
    "obtenu : " + JSON.stringify(infobulle));
}

// -- feature-017 : le diagramme (SVG + légende) est bien branché AVANT la
// table des passages, sans lever d'exception — la géométrie elle-même est
// éprouvée à part, arithmétiquement, par `test_app_diagramme.js` ; ce test-ci
// ne vérifie QUE le câblage (`construireDetailCycle` → `construireDiagramme`)
// et l'ORDRE d'apparition dans le détail. -----------------------------------
async function testDiagrammeCableAvantLaTable() {
  const principal = segment("principal", "(agent principal)", { outils: 3 });
  const sousAgent = segment("sousagent", "backend-developer", {
    outils: 5, fichiers: ["a.py"], etat: "termine",
  });
  const wf = workflow({
    workflow_id: "sessM#0",
    segments: [principal, sousAgent],
    passages: [sousAgent],
  });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);

  const noeuds = tousLesNoeuds(detail);
  const indexSvg = noeuds.findIndex((n) => n.tagName === "SVG");
  const indexTable = noeuds.findIndex((n) => n.tagName === "TABLE");
  check("f017_svg_present", indexSvg !== -1, "aucun <svg> dans le détail du cycle");
  // feature-021 cycle 2, lot 4 (ADR-0031) : la légende dédiée
  // (`.diagramme-legende`, dix entrées) disparaît avec l'ancienne grammaire
  // — la légende des états (`.legend`, Actif/parallèle/reprise/non lancé)
  // couvre désormais le graphe d'agents, statique dans `index.html`.
  check("f017_svg_avant_la_table",
    indexSvg !== -1 && indexTable !== -1 && indexSvg < indexTable,
    "svg@" + indexSvg + " table@" + indexTable);
}

// -- bug-020 : sans `diagramme.js`, le reste du tableau de bord reste
// utilisable — pas d'exception qui remonte jusqu'au `catch` global de
// `rafraichir()` (qui l'aurait affichée à tort comme « serveur
// injoignable », alors que `/api/etat` a bien répondu 200). ----------------
async function testGuardeAbsenceDiagrammeJs() {
  const sousAgent = segment("sousagent", "backend-developer", {
    outils: 5, fichiers: ["a.py"], etat: "termine",
  });
  const principal = segment("principal", "(agent principal)", { outils: 1 });
  const wf = workflow({
    workflow_id: "sessN#0", segments: [principal, sousAgent], passages: [sousAgent],
  });
  const bac = await chargerAvecEtatSansDiagramme({ workflows: [wf] });

  check("bug020_pas_de_serveur_injoignable_a_tort",
    bac.$("jauge-flux").textContent !== "serveur injoignable",
    "obtenu : " + JSON.stringify(bac.$("jauge-flux").textContent));

  const lis = cyclesLi(bac);
  check("bug020_cycle_toujours_affiche", lis.length === 1, "obtenu " + lis.length);
  if (lis.length === 1) {
    const { detail } = enteteEtDetail(lis[0]);
    const noeuds = tousLesNoeuds(detail);
    check("bug020_table_des_passages_toujours_presente",
      noeuds.some((n) => n.tagName === "TABLE"));
    check("bug020_aucun_svg_sans_disposer",
      !noeuds.some((n) => n.tagName === "SVG"));
  }
}

// ===================================================================== //
// graphe d'agents (feature-021, cycle 2, lot 4, ADR-0031/0032) — la        //
// grammaire SVG précédente (item 16/17, feature-017) est retirée avec     //
// elle : ces sondes couvraient `.dg-lien`/`.dg-pastille-attente`/`.dg-    //
// arc-*`/`.dg-cadre-simultane`/`.dg-liseret`/`.dg-socle-*`, qui n'existent //
// plus. Remplacées par des sondes sur la nouvelle grammaire (`.agent-     //
// node`, `.connector-layer path`, F16) — mêmes fixtures réutilisées où    //
// c'est possible.
// ===================================================================== //

function fixtureGeometrieSondee() {
  const passage0 = segment("sousagent", "backend-developer", {
    debut: "2026-09-14T08:00:00.000Z", duree_ms: 2000, outils: 1,
  });
  const passage1 = segment("sousagent", "frontend-developer", {
    debut: "2026-09-14T08:15:02.000Z", duree_ms: 5000, outils: 1,
  });
  const passage2 = segment("sousagent", "backend-developer", {
    debut: "2026-09-14T08:15:08.000Z", duree_ms: 3000, outils: 1,
  });
  return [passage0, passage1, passage2];
}

function agentsDuDetail(detail) {
  return tousLesNoeuds(detail).filter((n) => n.tagName === "BUTTON" && aClasse(n, "agent-node"));
}
function connecteursDuDetail(detail) {
  return tousLesNoeuds(detail).filter((n) => n.tagName === "PATH");
}

// -- disposer() reste l'unique autorité de géométrie (ADR-0031 §4) : les
// positions peintes (`--x`/`--y` posés par `construireDisqueAgent`) sont
// RAPPELÉES ici depuis `disposer()`, sur la MÊME fixture, dans le MÊME
// contexte vm — jamais relues depuis le rendu (sinon la sonde serait
// tautologique, PIEGES §30).
async function sondePositionAgentVientDeDisposer() {
  const passages = fixtureGeometrieSondee();
  const wf = workflow({ workflow_id: "sessGeo#0", segments: passages, passages });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);

  const geo = bac.sandbox.disposer(passages);
  check("sondePositionAgentVientDeDisposer_precondition_trois_agents",
    geo.agents.length === 3, "obtenu " + geo.agents.length);

  const noeuds = agentsDuDetail(detail);
  check("sondePositionAgentVientDeDisposer_trois_disques_peints",
    noeuds.length === 3, "obtenu " + noeuds.length);
  if (noeuds.length !== 3) return;

  const wraps = tousLesNoeuds(detail).filter((n) => aClasse(n, "agent-wrap"));
  check("sondePositionAgentVientDeDisposer_trois_enveloppes", wraps.length === 3);
  wraps.forEach((w, i) => {
    const xAttendu = geo.agents[i].cx + "px";
    check("sondePositionAgentVientDeDisposer_x[" + i + "]",
      w.style["--x"] === xAttendu, "obtenu " + w.style["--x"] + " attendu " + xAttendu);
  });
}

// -- Connecteurs : au moins un tracé peint entre créneaux adjacents, et
// AUCUN calcul de point de contrôle recalculé ici — le `d` peint est celui
// de `disposer()`, comparé au bit près.
async function sondeConnecteurDVientDeDisposer() {
  const passages = fixtureGeometrieSondee();
  const wf = workflow({ workflow_id: "sessLien#0", segments: passages, passages });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);

  const geo = bac.sandbox.disposer(passages);
  check("sondeConnecteurDVientDeDisposer_precondition_connecteurs",
    geo.connecteurs.length >= 1, "obtenu " + geo.connecteurs.length);

  const chemins = connecteursDuDetail(detail);
  check("sondeConnecteurDVientDeDisposer_chemins_peints",
    chemins.length === geo.connecteurs.length,
    "peints=" + chemins.length + " attendu=" + geo.connecteurs.length);
  chemins.forEach((chemin, i) => {
    check("sondeConnecteurDVientDeDisposer_d[" + i + "]",
      chemin.d === geo.connecteurs[i].d, "divergence sur le connecteur " + i);
  });
}

// -- 12 graduations FIXES par disque (ADR-0031 §2), et 3 pastilles de
// fichiers au plus (plafond), quel que soit le nombre réel de fichiers.
async function sondeGraduationsFixesEtPastillesPlafonnees() {
  const passage = segment("sousagent", "backend-developer", {
    debut: "2026-09-14T08:00:00.000Z", duree_ms: 2000, outils: 40,
    fichiers: ["a.py", "b.py", "c.py", "d.py", "e.py"],
  });
  const wf = workflow({ workflow_id: "sessGrad#0", segments: [passage], passages: [passage] });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);
  const noeud = agentsDuDetail(detail)[0];
  check("sondeGraduations_agent_trouve", !!noeud);
  if (!noeud) return;

  const ticks = tousLesNoeuds(noeud).filter((n) => n.tagName === "I" && n.style && "--i" in n.style);
  check("sondeGraduations_douze_graduations", ticks.length === 12, "obtenu " + ticks.length);

  const points = tousLesNoeuds(noeud).filter((n) => aClasse(n, "file-dots"))[0];
  const puces = points ? points.children.filter((n) => n.tagName === "I") : [];
  check("sondePastilles_trois_puces_au_plus", puces.length === 3, "obtenu " + puces.length);
  const allumees = puces.filter((n) => aClasse(n, "on")).length;
  check("sondePastilles_plafonnees_a_trois_malgre_cinq_fichiers", allumees === 3,
    "obtenu " + allumees + " sur 5 fichiers réels");
}

// -- F15 : le centre du disque ne porte JAMAIS de nœud de chiffre — ni
// `.token-value`, ni aucun texte numérique — la branche « centre avec
// chiffre » n'est PAS écrite à ce cycle (feature-023, hors GATE).
async function sondeCentreDisqueSansChiffre() {
  const passage = segment("sousagent", "backend-developer", {
    debut: "2026-09-14T08:00:00.000Z", duree_ms: 2000, outils: 1, etat: "en_cours",
  });
  const wf = workflow({ workflow_id: "sessF15#0", segments: [passage], passages: [passage] });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);
  const noeud = agentsDuDetail(detail)[0];
  check("sondeF15_agent_trouve", !!noeud);
  if (!noeud) return;
  const valeurJeton = tousLesNoeuds(noeud).find((n) => aClasse(n, "token-value"));
  check("sondeF15_aucun_noeud_token_value_pose", !valeurJeton,
    "un nœud .token-value a été posé alors que F15 l'interdit à ce cycle");
  const donnees = tousLesNoeuds(noeud).find((n) => aClasse(n, "agent-data"));
  check("sondeF15_agent_data_present_pour_les_pastilles", !!donnees);
}

// -- F16 : les quatre représentations absentes du prototype (ADR-0031 §3),
// portées par une SECONDE dimension (classe + glyphe de drapeau), jamais la
// seule couleur.
async function sondeRepresentationsF16() {
  const echec = segment("sousagent", "backend-developer", {
    debut: "2026-09-14T08:00:00.000Z", duree_ms: 2000, outils: 1, echecs: 1, termine: true,
  });
  const sansCloture = segment("sousagent", "test-engineer", {
    debut: "2026-09-14T08:05:00.000Z", duree_ms: 1000, outils: 1, etat: "sans_cloture",
  });
  const principal = segment("principal", "(agent principal)", {
    debut: "2026-09-14T07:59:00.000Z", duree_ms: 500, outils: 0, termine: true,
  });
  const wf = workflow({
    workflow_id: "sessF16#0",
    segments: [principal, echec, sansCloture],
    passages: [echec, sansCloture],
  });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);
  const noeuds = agentsDuDetail(detail);
  check("sondeF16_trois_disques", noeuds.length === 3, "obtenu " + noeuds.length);

  const nEchec = noeuds.find((n) => aClasse(n, "has-echec"));
  check("sondeF16_echec_classe_posee", !!nEchec);
  if (nEchec) {
    const drapeau = tousLesNoeuds(nEchec).find((n) => aClasse(n, "agent-flag--echec"));
    check("sondeF16_echec_drapeau_glyphe_pose", !!drapeau,
      "aucun .agent-flag--echec — l'échec ne serait porté que par la couleur");
  }

  const nSansCloture = noeuds.find((n) => aClasse(n, "state-sans-cloture"));
  check("sondeF16_sans_cloture_classe_posee", !!nSansCloture);
  if (nSansCloture) {
    const drapeau = tousLesNoeuds(nSansCloture).find((n) => aClasse(n, "agent-flag--sans-cloture"));
    check("sondeF16_sans_cloture_drapeau_glyphe_pose", !!drapeau);
    check("sondeF16_sans_cloture_jamais_has_echec", !aClasse(nSansCloture, "has-echec"));
  }

  const nPrincipal = noeuds.find((n) => aClasse(n, "role-principal"));
  check("sondeF16_principal_classe_posee", !!nPrincipal);
  if (nPrincipal) {
    const anneau = tousLesNoeuds(nPrincipal).find((n) => aClasse(n, "role-ring"));
    check("sondeF16_principal_anneau_role_pose", !!anneau,
      "aucun .role-ring — l'agent principal ne serait distingué que par le texte");
  }
}

// feature-020 (D8, E6b, mutant de contrôle M21) : format des durées dans la
// TABLE DES PASSAGES — secondes sur deux chiffres, sans suffixe au-delà de la
// minute (« 1 min 07 », jamais « 1 min 7 s »). ⚠️ PIEGES.md §30 : la valeur
// ATTENDUE est recopiée À LA MAIN ici, jamais obtenue via `disposer.texteDuree`
// ni `duree()` elle-même — sinon une mutation du format muterait les deux
// productions à la fois et cette garde resterait verte quel que soit le texte
// réellement peint dans la table.
async function testDureeTablePassagesFormatMaquette() {
  const passages = [
    segment("sousagent", "test-engineer", {
      debut: "2026-09-14T09:00:00.000Z", fin: "2026-09-14T09:01:07.000Z", duree_ms: 67000,
    }),
  ];
  const wf = workflow({ workflow_id: "sessDuree#0", segments: passages, passages });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);
  const lignes = lignesTable(detail);
  check("duree_table_une_ligne", lignes.length === 1, "obtenu " + lignes.length);
  if (!lignes.length) return;
  const texteDureeCellule = lignes[0].children[2].textContent;
  check("duree_table_67000ms_vaut_1_min_07",
    texteDureeCellule === "1 min 07",
    "obtenu " + JSON.stringify(texteDureeCellule) + " attendu \"1 min 07\"");
}

// Garde « zéro arithmétique dans app.js » (architect) : les fonctions qui
// peignent le graphe d'agents ne doivent JAMAIS appeler `duree(`, `heure(`,
// ni `Math.*` — c'est l'invariant qui empêche la classe de défauts
// bug-020/bug-021 (une position recalculée localement, divergente de
// `disposer()`) de revenir. Lu depuis L'ARTEFACT LIVRÉ (`app.js`), jamais
// une affirmation sur l'intention du code (PIEGES.md §21). Renommée au
// lot 4 (feature-021 cycle 2, ADR-0031) : les six fonctions de l'ancien
// diagramme SVG sont remplacées par les cinq du disque Material 3.
function sondeZeroArithmetiqueDansLesFonctionsDeDiagramme() {
  const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const FONCTIONS = [
    "construireDisqueAgent", "construireGrapheAgents", "construireDiagramme",
    "rendreGrapheCyclePrincipal", "construireGraduations",
  ];
  FONCTIONS.forEach((nom) => {
    const debut = source.indexOf("function " + nom + "(");
    check(nom + "_trouvee_dans_app_js", debut !== -1);
    if (debut === -1) return;
    const debutAccolade = source.indexOf("{", debut);
    let profondeur = 0;
    let fin = debutAccolade;
    for (let i = debutAccolade; i < source.length; i++) {
      if (source[i] === "{") profondeur++;
      else if (source[i] === "}") {
        profondeur--;
        if (profondeur === 0) { fin = i; break; }
      }
    }
    const corps = source.slice(debut, fin + 1);
    check(nom + "_aucun_appel_duree", corps.indexOf("duree(") === -1, "trouvé dans " + nom);
    check(nom + "_aucun_appel_heure", corps.indexOf("heure(") === -1, "trouvé dans " + nom);
    check(nom + "_aucun_appel_Math", !/\bMath\./.test(corps), "trouvé dans " + nom);
  });
}

async function main() {
  await testUnSeulDeplioLePlusRecent();
  await testDepliementExclusifEtSurvieAuRafraichissement();
  await testCycleOuvertSortiDeLaFenetreRepliSurLePlusRecent();
  await testEtatIgnoreFinObserveeAbsente();
  await testQuatreEtatsEtPrioriteEtDefaut();
  await testDesignationSansNomInvente();
  await testEtatVideExplicite();
  await testCycleSansAgentTypeNeDisparaitPas();
  await testEvenementsHorsSessionComptesSansFantome();
  await testPiedVidePasDeHorsSession();
  await testTotauxProprietesEgalentLaSommeDesLignesEpingle();
  await testRepliAuDelaDe40Passages();
  await testFrontiereExactementQuarantePasDeRepli();
  await testFrontiereQuaranteEtUnDeclencheUnRepli();
  await testPireCasMesure297();
  await testAucuneCouleurDIdentitePourAucunRole();
  await testStructureClavier();
  await testAucunCheminAbsoluDansLInfobulle();
  await testDiagrammeCableAvantLaTable();
  await testGuardeAbsenceDiagrammeJs();
  await sondePositionAgentVientDeDisposer();
  await sondeConnecteurDVientDeDisposer();
  await sondeGraduationsFixesEtPastillesPlafonnees();
  await sondeCentreDisqueSansChiffre();
  await sondeRepresentationsF16();
  await testDureeTablePassagesFormatMaquette();
  sondeZeroArithmetiqueDansLesFonctionsDeDiagramme();

  console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
  for (const e of _echecs) console.log("  - " + e);
  process.exit(_echecs.length ? 1 : 0);
}

main().catch((erreur) => {
  console.error(erreur);
  console.log("\n" + _tests + " cas atteints, INTERROMPU par "
    + erreur.name + " : " + erreur.message);
  process.exit(1);
});
