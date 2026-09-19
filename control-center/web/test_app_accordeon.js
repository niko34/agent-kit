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
const IDS = [
  "agents", "bandeau-hote", "bandeau-hote-bouton", "bandeau-hote-texte",
  "bascule-theme", "bouton-generer-brouillon", "compteur-prompt",
  "compteur-specs", "derogation-minimale", "erreur-generer-brouillon",
  "fichiers", "filtre", "filtre-divergences", "horodatage",
  "icone-systeme-clair", "icone-systeme-sombre", "jauge-flux", "jauge-git",
  "jauge-pilotage", "kanban", "legende-cycles", "note-agents", "pied-cycles",
  "pilotage-corps", "porte-aide", "porte-bouton", "porte-champ",
  "porte-corps", "porte-erreur", "porte-jeton", "porte-titre", "projet",
  "prompt", "redaction-corps", "systeme", "theme-clair", "theme-sombre",
  "theme-systeme", "timeline", "tiroir", "tiroir-contenu", "tiroir-fermer",
  "tiroir-titre", "titre-besoin", "titre-cycles", "titre-demande", "titre-pilotage",
  "workflows",
];
const CACHES_PAR_DEFAUT = new Set([
  "bandeau-hote", "tiroir", "porte-jeton", "porte-erreur", "icone-systeme-sombre",
  "erreur-generer-brouillon",
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
// item 10 — repli neutre pour un type d'agent sans teinte assignée        //
// ===================================================================== //
async function testRepliNeutrePourAgentSansTeinte() {
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
  check("item10_role_connu_porte_sa_propre_teinte",
    sigleConnu.style.color === "var(--a-test-engineer)"
    && sigleConnu.style.background === "var(--f-test-engineer)"
    && nomConnu.style.color === "var(--a-test-engineer)",
    "sigle.color=" + sigleConnu.style.color + " sigle.bg=" + sigleConnu.style.background
    + " nom.color=" + nomConnu.style.color);

  const sigleInconnu = unParClasse(lignes[1], "agent-sigle");
  const nomInconnu = unParClasse(lignes[1], "agent-nom");
  check("item10_role_inconnu_replie_sur_neutre",
    sigleInconnu.style.color === "var(--a-neutre)"
    && sigleInconnu.style.background === "var(--f-neutre)"
    && nomInconnu.style.color === "var(--a-neutre)",
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
  check("f017_legende_presente", !!unParClasse(detail, "diagramme-legende"));
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
// item 16/17 (feature-017) — la géométrie PEINTE vient de `disposer()`,   //
// jamais recalculée par `app.js` — invariant énoncé mais pas exécuté      //
// (diagramme.js:57-65, §64 du commentaire de contrat).                    //
// ===================================================================== //
//
// Fixture commune aux deux sondes : trois passages, aucun chevauchement
// temporel (donc trois créneaux distincts) —
//   0. backend-developer  (2 s)
//   1. frontend-developer (5 s), démarrant 15 min après la fin de 0 :
//      l'écart dépasse le seuil (2 min, STRICT), une pastille d'attente
//      est donc réservée ENTRE les créneaux 0 et 1 — et seulement ceux-là
//      (l'écart 1→2 ci-dessous reste sous le seuil).
//   2. backend-developer  (3 s), démarrant 1 s après la fin de 1 :
//      reprise du MÊME agent qu'en 0, après que frontend-developer se soit
//      intercalé — un rebouclage (arc) entre les passages 0 et 2.
// Les noms d'agent sont volontairement longs (« backend-developer »,
// « frontend-developer ») : `demiLargeur` (disposer.js) y est alors dictée
// par le LIBELLÉ, pas par le rayon du cercle — sans cet écart, la formule
// mutante `(x1 + x2) / 2` (bords de CERCLE, bug-021) coïnciderait par
// hasard avec `pastille.cx` (bord de CRÉNEAU) et la sonde ne prouverait
// rien.
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

async function sondeLienPorteClasseDgLien() {
  const passages = fixtureGeometrieSondee();
  const wf = workflow({
    workflow_id: "sessLien#0", segments: passages, passages: passages,
  });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);

  // Aucune pastille sur le deuxième lien → le groupe dg-liens contient au
  // moins un trait (lien entre créneau 0 et 1, sans attente > 2 min)
  const noeuds = tousLesNoeuds(detail);
  const liens = noeuds.filter(
    (n) => n.tagName === "LINE" && aClasseSvg(n, "dg-lien"));
  check("sondeLienPorteClasseDgLien_au_moins_un_lien_peint",
    liens.length >= 1, "obtenu " + liens.length);
  liens.forEach((lien, i) => {
    const stroke = lien.getAttribute("style")
      ? lien.style.stroke : window.getComputedStyle(lien).stroke;
    // La classe dg-lien ne pose rien (cf. app.css §751), tout vient du CSS.
    // Si la classe est absente, stroke calcule `none` (héritage + valeur
    // initiale) — c'est le bug que cette sonde protège.
    check("sondeLienPorteClasseDgLien[" + i + "]_couleur_trait",
      stroke !== "none" && stroke !== "",
      "obtenu stroke=" + JSON.stringify(stroke));
  });
}

async function sondePastilleCxVientDeDisposer() {
  const passages = fixtureGeometrieSondee();
  const wf = workflow({
    workflow_id: "sessP#0", segments: passages, passages: passages,
  });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);

  // Valeur ATTENDUE : `disposer()` rappelée ICI, sur la MÊME fixture, dans
  // le MÊME contexte vm que celui qui a peint le diagramme (fonction pure,
  // déterministe) — jamais relue depuis le rendu, sinon la sonde serait
  // tautologique (avertissement du contrat, diagramme.js).
  const geo = bac.sandbox.disposer(passages);
  check("sondePastilleCxVientDeDisposer_precondition_une_pastille_calculee",
    !!geo.liens[0] && !!geo.liens[0].pastille && !geo.liens[1].pastille,
    "obtenu : " + JSON.stringify(geo.liens.map((l) => !!l.pastille)));
  // feature-020 : le champ s'appelle désormais `x` (centre), plus `cx`.
  const cxAttendu = geo.liens[0].pastille.x;

  // Piège (ordre des nœuds SVG non garanti dans le groupe) : chercher PAR
  // CLASSE et par tagName, jamais par indice fixe.
  const noeuds = tousLesNoeuds(detail);
  const groupePastille = noeuds.find(
    (n) => n.tagName === "G" && aClasseSvg(n, "dg-pastille-attente"));
  check("sondePastilleCxVientDeDisposer_pastille_peinte", !!groupePastille);
  const rect = groupePastille
    ? groupePastille.children.find((n) => n.tagName === "RECT") : null;
  check("sondePastilleCxVientDeDisposer_rect_trouve", !!rect);

  const cxPeint = rect ? Number(rect.x) + Number(rect.width) / 2 : NaN;
  // ⚠️ Garde réelle : si `app.js` recalcule `cx` depuis les bords de CERCLE
  // (mutation bug-021, `(x1 + x2) / 2`) au lieu de lire `lien.pastille.cx`
  // (bord de CRÉNEAU, `disposer()`), ce nombre diverge — mesuré 29 à 31 px
  // sur cette fixture.
  check("sondePastilleCxVientDeDisposer",
    Math.abs(cxPeint - cxAttendu) < 0.1,
    "peint=" + cxPeint + " attendu(disposer)=" + cxAttendu
    + " écart=" + Math.abs(cxPeint - cxAttendu));
}

// feature-020 (défaut R/bug-020) : `hauteurArc` a disparu du contrat,
// remplacé par `sommetY` — un ABSOLU commun à tout arc, plus de recalcul
// par paire d'agents. `trouverAgentParPassageIndex` n'existe plus dans
// `app.js` (il n'y a plus de source/cible à retrouver pour dessiner l'arc :
// `disposer()` fournit `depart`/`arrivee`/`controle1`/`controle2` tout
// faits) — cette sonde vérifie donc directement que le tracé PEINT reprend
// le `sommetY` CALCULÉ PAR `disposer()`, jamais une valeur recalculée par
// `app.js`.
async function sondeArcSommetVientDeDisposer() {
  const passages = fixtureGeometrieSondee();
  const wf = workflow({
    workflow_id: "sessQ#0", segments: passages, passages: passages,
  });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);

  const geo = bac.sandbox.disposer(passages);
  check("sondeArcSommetVientDeDisposer_precondition_un_arc_calcule",
    geo.arcs.length === 1, "obtenu " + geo.arcs.length);
  const arc = geo.arcs[0];
  const ycAttendu = arc.sommetY;

  const noeuds = tousLesNoeuds(detail);
  const chemin = noeuds.find(
    (n) => n.tagName === "PATH" && aClasseSvg(n, "dg-arc-rebouclage"));
  check("sondeArcSommetVientDeDisposer_arc_peint", !!chemin);
  const d = chemin ? String(chemin.d) : "";
  // Courbe de Bézier CUBIQUE (`C x1 yc, x2 yc, x2 y2`, deux points de
  // contrôle confondus en hauteur, tous deux à `sommetY`) : le premier
  // nombre capturé après `C` est l'ordonnée du premier point de contrôle.
  const correspondance = /C\s+(-?[0-9.]+)\s+(-?[0-9.]+),/.exec(d);
  check("sondeArcSommetVientDeDisposer_d_parsable", !!correspondance, "d=" + JSON.stringify(d));
  const ycPeint = correspondance ? Number(correspondance[2]) : NaN;

  // ⚠️ Garde réelle : si `app.js` recalculait `sommetY` localement (mutation
  // bug-020) au lieu de lire `arc.sommetY` (`disposer()`), le sommet peint
  // divergerait de la valeur calculée.
  check("sondeArcSommetVientDeDisposer",
    Math.abs(ycPeint - ycAttendu) < 0.1,
    "peint=" + ycPeint + " attendu(disposer)=" + ycAttendu
    + " écart=" + Math.abs(ycPeint - ycAttendu));
}

// ===================================================================== //
// Renfort post-revue (code-reviewer) : cinq corrections apportées au      //
// diagramme (`dg-lien`/`dg-pastille-attente` rebranchés sur `--trait`,    //
// `traitsCercle()` rebranché au cercle principal, pointe d'arc rétablie)  //
// n'étaient couvertes par AUCUNE assertion — établi par mutation :        //
// remettre `var(--bd2)`/`var(--bd)`, débrancher `traitsCercle()` du       //
// cercle principal, ou supprimer la pointe d'arc, ne faisait mourir       //
// AUCUN des 1319 cas existants. Les sondes suivantes ferment ce trou.     //
// ===================================================================== //

// Le jeton attendu est lu dans `docs/DESIGN-SYSTEM.md` (§ filets) QUAND ce
// fichier est atteignable, pas recopié à la main : c'est LUI qui déclare
// que le filet d'un bloc porte `--trait`, indépendamment de ce que `app.css`
// en fait aujourd'hui. `control-center/` est conçu pour être déplacé seul
// (PIEGES.md §1 : un clone jetable ne contient que `control-center/` et
// `.claude/agents/`) — `docs/` du dépôt hôte n'est alors pas là. Dans ce
// cas, ce sondage particulier se SAUTE proprement (comme `test_specs.py`
// sans spec réelle) plutôt que d'échouer pour une raison qui n'a rien à
// voir avec `app.css` ; les deux sondes qui suivent, elles, gardent la
// valeur `--trait` en dur — c'est la garde qui reste même hors du dépôt
// complet.
function jetonFiletDeclareOuNull() {
  let doc;
  try {
    doc = fs.readFileSync(path.join(__dirname, "..", "..", "docs", "DESIGN-SYSTEM.md"), "utf8");
  } catch (erreur) {
    return null;
  }
  const trouve = /filet[^`]*`(--trait)`/.exec(doc) || /`(--trait)`\)[^.]*filet/i.exec(doc);
  return trouve ? trouve[1] : null;
}

function extraireRegleCss(css, selecteur) {
  const debut = css.indexOf(selecteur);
  if (debut === -1) return null;
  const finAccolade = css.indexOf("}", debut);
  return finAccolade === -1 ? null : css.slice(debut, finAccolade + 1);
}

function sondeJetonsCssDesLiensEtPastilles() {
  const jetonDoc = jetonFiletDeclareOuNull();
  if (jetonDoc === null) {
    console.log("  sauté  sondeJeton_declare_dans_design_system — docs/DESIGN-SYSTEM.md hors du clone");
  } else {
    check("sondeJeton_declare_dans_design_system", jetonDoc === "--trait", "obtenu " + jetonDoc);
  }
  const jeton = "--trait";

  const css = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");

  const regleLien = extraireRegleCss(css, ".dg-lien {");
  check("sonde_dg_lien_regle_presente", !!regleLien);
  check("sonde_dg_lien_porte_var_trait",
    !!regleLien && new RegExp("stroke:\\s*var\\(" + jeton + "\\)").test(regleLien),
    "règle=" + regleLien);

  // feature-020 (table de correspondance de jetons) : le contour de la
  // pastille suit `T.bd` (le plus clair), au même titre que l'anneau guide
  // — soit `--trait-fin`, PAS `--trait` (qui reste, lui, le jeton des liens
  // et des graduations éteintes, `T.bd2`).
  const jetonPastille = "--trait-fin";
  const reglePastille = extraireRegleCss(css, ".dg-pastille-attente rect");
  check("sonde_dg_pastille_attente_regle_presente", !!reglePastille);
  check("sonde_dg_pastille_attente_porte_var_trait_fin",
    !!reglePastille && new RegExp("stroke:\\s*var\\(" + jetonPastille + "\\)").test(reglePastille),
    "règle=" + reglePastille);
}

function trouverGroupeAgent(detail, nomAgent) {
  return tousLesNoeuds(detail).find((n) => n.tagName === "G" && aClasseSvg(n, "dg-agent")
    && n.children.some((c) => c.tagName === "TITLE" && String(c.textContent).indexOf(nomAgent + " —") === 0));
}
function cerclePrincipalDeGroupe(g) {
  return g.children.find((n) => n.tagName === "CIRCLE" && (
    aClasseSvg(n, "dg-contour-plein")
    || aClasseSvg(n, "dg-contour-tirets")
    || aClasseSvg(n, "dg-contour-pointille")));
}

// B3 (feature-020, défaut E) : l'anneau GUIDE porte le jeton le plus CLAIR
// (`--trait-fin`), les graduations ÉTEINTES le plus SOMBRE (`--trait`) —
// l'inversion exacte de l'ancien rendu. Aucune sonde ne couvrait
// jusqu'ici le jeton du GUIDE spécifiquement (seule la pastille d'attente
// était vérifiée sur ce même jeton, `sondeJetonsCssDesLiensEtPastilles`).
async function sondeGuideEtGraduationEteinteJetonsCorrects() {
  const passages = [
    segment("sousagent", "backend-developer", {
      debut: "2026-09-14T09:00:00.000Z", fin: "2026-09-14T09:00:03.000Z", duree_ms: 3000,
      outils: 0,
    }),
  ];
  const wf = workflow({ workflow_id: "sessGuide#0", segments: passages, passages });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);

  const g = trouverGroupeAgent(detail, "backend-developer");
  check("guide_groupe_agent_trouve", !!g);
  if (!g) return;
  const guide = g.children.find((n) => n.tagName === "CIRCLE" && aClasseSvg(n, "dg-guide"));
  check("guide_element_trouve", !!guide);
  check("guide_stroke_trait_fin", !!guide && guide.style.stroke === "var(--trait-fin)",
    "stroke=" + (guide && guide.style.stroke));

  // 0 outils -> toutes les graduations sont ÉTEINTES.
  const graduation = g.children.find((n) => n.tagName === "LINE" && aClasseSvg(n, "dg-graduation"));
  check("graduation_eteinte_element_trouve", !!graduation);
  check("graduation_eteinte_stroke_trait", !!graduation && graduation.style.stroke === "var(--trait)",
    "stroke=" + (graduation && graduation.style.stroke));
}

// Cinq états, épinglés un par un (jamais une propriété d'ensemble) : agent
// principal (D1 — nominal IDENTIQUE, plus de tirets), agent sans clôture,
// agent en échec, agent EN COURS (D4 — identité sur le contour, seule
// exception à « l'identité ne va jamais sur un contour »), sous-agent
// ordinaire.
async function sondeContourCerclePourChaqueEtat() {
  const passages = [
    segment("principal", "orchestrator", {
      debut: "2026-09-14T09:00:00.000Z", fin: "2026-09-14T09:00:05.000Z", duree_ms: 5000,
    }),
    segment("sousagent", "backend-developer", {
      debut: "2026-09-14T09:05:00.000Z", fin: "2026-09-14T09:05:03.000Z", duree_ms: 3000,
      etat: "sans_cloture", termine: false,
    }),
    segment("sousagent", "test-engineer", {
      debut: "2026-09-14T09:10:00.000Z", fin: "2026-09-14T09:10:03.000Z", duree_ms: 3000,
      echecs: 2, etat: "termine",
    }),
    segment("sousagent", "code-reviewer", {
      debut: "2026-09-14T09:15:00.000Z", fin: "2026-09-14T09:15:03.000Z", duree_ms: 3000,
    }),
    segment("sousagent", "security-reviewer", {
      debut: "2026-09-14T09:20:00.000Z", fin: "2026-09-14T09:20:03.000Z", duree_ms: 3000,
      etat: "en_cours", termine: false,
    }),
  ];
  const wf = workflow({ workflow_id: "sessR#0", segments: passages, passages });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);

  // D1 : l'agent principal, terminé sans échec, est désormais IDENTIQUE au
  // rendu nominal — contour PLEIN (plus de `dg-contour-tirets`, régression de
  // revue feature-017 corrigée par ce cycle). Il ne se distingue plus QUE par
  // son fond (`--creux`) et son sigle dédié (couvert par une autre sonde).
  const gPrincipal = trouverGroupeAgent(detail, "orchestrator");
  check("contourCercle_principal_groupe_trouve", !!gPrincipal);
  const cPrincipal = gPrincipal && cerclePrincipalDeGroupe(gPrincipal);
  check("contourCercle_principal_cercle_trouve", !!cPrincipal);
  check("contourCercle_principal_classe_plein", !!cPrincipal && aClasseSvg(cPrincipal, "dg-contour-plein"),
    "classe=" + (cPrincipal && cPrincipal.class));
  check("contourCercle_principal_fill_creux", !!cPrincipal && cPrincipal.style.fill === "var(--creux)",
    "fill=" + (cPrincipal && cPrincipal.style.fill));
  check("contourCercle_principal_stroke_trait", !!cPrincipal && cPrincipal.style.stroke === "var(--trait)",
    "stroke=" + (cPrincipal && cPrincipal.style.stroke));
  check("contourCercle_principal_strokewidth_1_2", !!cPrincipal && Number(cPrincipal.style.strokeWidth) === 1.2,
    "strokeWidth=" + (cPrincipal && cPrincipal.style.strokeWidth));

  const gSansCloture = trouverGroupeAgent(detail, "backend-developer");
  check("contourCercle_sans_cloture_groupe_trouve", !!gSansCloture);
  const cSansCloture = gSansCloture && cerclePrincipalDeGroupe(gSansCloture);
  check("contourCercle_sans_cloture_classe_pointille", !!cSansCloture && aClasseSvg(cSansCloture, "dg-contour-pointille"),
    "classe=" + (cSansCloture && cSansCloture.class));
  check("contourCercle_sans_cloture_stroke_contour_etat",
    !!cSansCloture && cSansCloture.style.stroke === "var(--contour-etat)",
    "stroke=" + (cSansCloture && cSansCloture.style.stroke));

  const gEchec = trouverGroupeAgent(detail, "test-engineer");
  check("contourCercle_echec_groupe_trouve", !!gEchec);
  const cEchec = gEchec && cerclePrincipalDeGroupe(gEchec);
  check("contourCercle_echec_classe_plein", !!cEchec && aClasseSvg(cEchec, "dg-contour-plein"),
    "classe=" + (cEchec && cEchec.class));
  check("contourCercle_echec_stroke_alerte", !!cEchec && cEchec.style.stroke === "var(--alerte)",
    "stroke=" + (cEchec && cEchec.style.stroke));
  check("contourCercle_echec_strokewidth_2", !!cEchec && Number(cEchec.style.strokeWidth) === 2,
    "strokeWidth=" + (cEchec && cEchec.style.strokeWidth));

  const gOrdinaire = trouverGroupeAgent(detail, "code-reviewer");
  check("contourCercle_ordinaire_groupe_trouve", !!gOrdinaire);
  const cOrdinaire = gOrdinaire && cerclePrincipalDeGroupe(gOrdinaire);
  check("contourCercle_ordinaire_classe_plein", !!cOrdinaire && aClasseSvg(cOrdinaire, "dg-contour-plein"),
    "classe=" + (cOrdinaire && cOrdinaire.class));
  check("contourCercle_ordinaire_stroke_trait", !!cOrdinaire && cOrdinaire.style.stroke === "var(--trait)",
    "stroke=" + (cOrdinaire && cOrdinaire.style.stroke));
  check("contourCercle_ordinaire_strokewidth_1_2", !!cOrdinaire && Number(cOrdinaire.style.strokeWidth) === 1.2,
    "strokeWidth=" + (cOrdinaire && cOrdinaire.style.strokeWidth));

  // D4 : l'agent EN COURS est la SEULE exception où l'identité va sur le
  // contour (la maquette elle-même colore ainsi son agent actif).
  const gEnCours = trouverGroupeAgent(detail, "security-reviewer");
  check("contourCercle_en_cours_groupe_trouve", !!gEnCours);
  const cEnCours = gEnCours && cerclePrincipalDeGroupe(gEnCours);
  check("contourCercle_en_cours_classe_plein", !!cEnCours && aClasseSvg(cEnCours, "dg-contour-plein"),
    "classe=" + (cEnCours && cEnCours.class));
  check("contourCercle_en_cours_stroke_identite",
    !!cEnCours && cEnCours.style.stroke === "var(--a-security-reviewer)",
    "stroke=" + (cEnCours && cEnCours.style.stroke));
  check("contourCercle_en_cours_strokewidth_1_8", !!cEnCours && Number(cEnCours.style.strokeWidth) === 1.8,
    "strokeWidth=" + (cEnCours && cEnCours.style.strokeWidth));

  // Garde globale (D1) : AUCUN cercle du diagramme ne porte plus jamais
  // `dg-contour-tirets` — la classe existait avant ce cycle pour distinguer
  // visuellement l'agent principal ; sa réapparition serait la régression
  // que ce cycle corrige.
  const tousLesCercles = tousLesNoeuds(detail).filter((n) => n.tagName === "CIRCLE");
  check("contourCercle_aucun_cercle_en_tirets",
    !tousLesCercles.some((c) => aClasseSvg(c, "dg-contour-tirets")),
    "cercles en tirets trouvés : " + tousLesCercles.filter((c) => aClasseSvg(c, "dg-contour-tirets")).length);
}

// feature-020 (décision R) : l'arc de rebouclage n'a plus AUCUNE pointe —
// la maquette de référence n'en trace pas (`pose()`/`graphe()`), c'est un
// ajout du cycle précédent qui n'a pas d'équivalent dans la référence
// visuelle. Cette sonde protège la décision dans les DEUX sens : l'arc est
// bien peint, et `dg-arc-pointe` (l'élément ET la règle CSS) n'existe nulle
// part — sa réapparition serait la régression inverse de celle que ce
// cycle corrige.
async function sondeArcRebouclageNAPlusDePointe() {
  const passages = fixtureGeometrieSondee();
  const wf = workflow({ workflow_id: "sessS#0", segments: passages, passages });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);

  const noeuds = tousLesNoeuds(detail);
  const arc = noeuds.find((n) => n.tagName === "PATH" && aClasseSvg(n, "dg-arc-rebouclage"));
  check("arc_rebouclage_present", !!arc);
  const pointe = noeuds.find((n) => aClasseSvg(n, "dg-arc-pointe"));
  check("arc_sans_pointe_de_direction", !pointe,
    "un élément dg-arc-pointe a été trouvé alors que la décision R l'exclut");

  // Le libellé de l'arc était la DERNIÈRE taille venue du contrat encore
  // posée en attribut de présentation (relevé en revue) : aucune règle CSS
  // ne la concurrence aujourd'hui, mais un `font-size` futur sur
  // `.dg-arc-libelle` rouvrirait le piège du socle (PIEGES.md, attribut
  // contre règle). 10,5 px est recopié de la maquette (l.210).
  const libelleArc = noeuds.find((n) => n.tagName === "TEXT" && aClasseSvg(n, "dg-arc-libelle"));
  verifierPoliceEnStyleAvecUnitePx(libelleArc, "police_libelle_arc", 10.5);
}

function sondeCssNeDeclarePlusDgArcPointe() {
  const css = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");
  const regle = extraireRegleCss(css, ".dg-arc-pointe {");
  check("sonde_dg_arc_pointe_absente_du_css", regle === null,
    "règle trouvée alors que la décision R (aucune pointe) l'exclut : " + regle);
}

// feature-020 (D1/B2) : le sigle porte désormais la couleur d'IDENTITÉ pour
// TOUS les agents, y compris le principal — c'est le comportement de la
// maquette de référence (`pose()`, `fill: c` inconditionnel, l.180), et la
// régression de revue (`--texte-faible` pour le principal) que ce cycle
// corrige. « orchestrator » n'a pas de teinte assignée (`ROLES_TEINTES`) :
// son sigle retombe donc sur le jeton NEUTRE, pas sur `--texte-faible` — les
// deux valeurs sont épinglées NOMMÉMENT (PIEGES.md, « une assertion globale
// ne prouve pas l'appariement »), jamais seulement « les deux sigles
// diffèrent ».
async function sondeSigleEnCouleurIdentitePourTousLesAgents() {
  const passages = [
    segment("principal", "orchestrator", {
      debut: "2026-09-14T09:00:00.000Z", fin: "2026-09-14T09:00:05.000Z", duree_ms: 5000,
    }),
    segment("sousagent", "code-reviewer", {
      debut: "2026-09-14T09:05:00.000Z", fin: "2026-09-14T09:05:03.000Z", duree_ms: 3000,
    }),
  ];
  const wf = workflow({ workflow_id: "sessT#0", segments: passages, passages });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);

  const gPrincipal = trouverGroupeAgent(detail, "orchestrator");
  check("sondeSigle_principal_groupe_trouve", !!gPrincipal);
  const sPrincipal = gPrincipal && gPrincipal.children.find((n) => n.tagName === "TEXT");
  check("sondeSigle_principal_texte_trouve", !!sPrincipal);
  check("sondeSigle_principal_couleur_identite_neutre",
    !!sPrincipal && sPrincipal.style.fill === "var(--a-neutre)",
    "fill=" + (sPrincipal && sPrincipal.style.fill));

  const gOrdinaire = trouverGroupeAgent(detail, "code-reviewer");
  check("sondeSigle_ordinaire_groupe_trouve", !!gOrdinaire);
  const sOrdinaire = gOrdinaire && gOrdinaire.children.find((n) => n.tagName === "TEXT");
  check("sondeSigle_ordinaire_texte_trouve", !!sOrdinaire);
  check("sondeSigle_ordinaire_couleur_identite",
    !!sOrdinaire && sOrdinaire.style.fill === "var(--a-code-reviewer)",
    "fill=" + (sOrdinaire && sOrdinaire.style.fill));
}

// ===================================================================== //
// feature-020 — livrables E4/E5 et garde architecte « zéro arithmétique »  //
// ===================================================================== //

// E4 (défaut H) : le liseré des fichiers doit être VISIBLE — peint APRÈS le
// disque opaque, jamais avant. ⚠️ La médiane du journal réel est de 0
// fichier (architect) : une fixture PAR DÉFAUT n'a PAS de liseré — cette
// garde ASSERTE D'ABORD SA PRÉSENCE (fixture à fichiers ≥ 1), puis SEULEMENT
// ENSUITE l'ordre de peinture. Une garde écrite « si je trouve un liseré
// alors... » serait verte À VIDE. Mutant de contrôle : échanger les deux
// `appendChild` (disque puis liseré) dans `construireCercleAgent`.
async function sondeLiseretPeintApresLeDisque() {
  const passages = [
    segment("sousagent", "backend-developer", {
      debut: "2026-09-14T09:00:00.000Z", fin: "2026-09-14T09:00:03.000Z", duree_ms: 3000,
      fichiers: ["a.py", "b.py", "c.py"],
    }),
  ];
  const wf = workflow({ workflow_id: "sessW#0", segments: passages, passages });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);

  const gAgent = trouverGroupeAgent(detail, "backend-developer");
  check("liseret_groupe_agent_trouve", !!gAgent);
  if (!gAgent) return;
  const indexDisque = gAgent.children.findIndex((n) => n.tagName === "CIRCLE" && aClasseSvg(n, "dg-cercle"));
  const indexLiseret = gAgent.children.findIndex((n) => n.tagName === "CIRCLE" && aClasseSvg(n, "dg-liseret"));
  check("liseret_present_pour_cette_fixture", indexLiseret !== -1,
    "aucun élément dg-liseret trouvé alors que fichiers.length=3 (D2 : le liseré doit être VISIBLE)");
  check("disque_present_pour_cette_fixture", indexDisque !== -1);
  if (indexLiseret !== -1 && indexDisque !== -1) {
    check("liseret_peint_apres_le_disque", indexDisque < indexLiseret,
      "index disque=" + indexDisque + " index liseret=" + indexLiseret);
  }
}

// E5 : le sigle de l'agent principal — épinglé EXACTEMENT sur "AP", jamais
// seulement "différent de ??" (mesuré par l'architect : réparer
// `collecterRoles` seul, SANS la table `SIGLES_SPECIAUX`, produit "(A", un
// sigle FAUX qui passerait une garde écrite en négatif).
async function sondeSigleAgentPrincipalEstAP() {
  const principal = segment("principal", "(agent principal)", {
    debut: "2026-09-14T09:00:00.000Z", fin: "2026-09-14T09:00:05.000Z", duree_ms: 5000,
  });
  const sousAgent = segment("sousagent", "backend-developer", {
    debut: "2026-09-14T09:05:00.000Z", fin: "2026-09-14T09:05:03.000Z", duree_ms: 3000,
  });
  // `wf.passages` ne porte JAMAIS le segment principal (convention réelle du
  // backend, voir le commentaire de `construireChaineEtNotes` : « on ne lit
  // jamais le segment principal depuis passages ») — seul `wf.segments` le
  // porte. Une fixture qui mettrait le principal dans LES DEUX resterait
  // aveugle à une régression de `collecterRoles` qui retomberait sur
  // `wf.passages` (défaut G, mesuré par l'architect : produirait "(A").
  const wf = workflow({
    workflow_id: "sessU#0", segments: [principal, sousAgent], passages: [sousAgent],
  });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);

  const gPrincipal = trouverGroupeAgent(detail, "(agent principal)");
  check("sigleAP_principal_groupe_trouve", !!gPrincipal);
  const sPrincipal = gPrincipal && gPrincipal.children.find((n) => n.tagName === "TEXT" && aClasseSvg(n, "dg-sigle"));
  check("sigleAP_principal_texte_trouve", !!sPrincipal);
  check("sigleAP_principal_vaut_exactement_AP",
    !!sPrincipal && sPrincipal.textContent === "AP",
    "obtenu " + JSON.stringify(sPrincipal && sPrincipal.textContent));
}

// Cas voisin à NE PAS déclencher (feature-020, E5) : un agent RÉEL dont le
// nom commence par « ap » garde son sigle CALCULÉ — la table
// `SIGLES_SPECIAUX` ne porte QUE sur la sentinelle EXACTE
// `(agent principal)`, jamais sur un préfixe de nom.
async function sondeAgentReelPrefixeApGardeSigleCalcule() {
  const principal = segment("principal", "(agent principal)", {
    debut: "2026-09-14T09:00:00.000Z", fin: "2026-09-14T09:00:05.000Z", duree_ms: 5000,
  });
  const sousAgent = segment("sousagent", "ap-integrateur", {
    debut: "2026-09-14T09:05:00.000Z", fin: "2026-09-14T09:05:03.000Z", duree_ms: 3000,
  });
  // Même prudence que `sondeSigleAgentPrincipalEstAP` : `wf.passages` ne
  // porte pas le principal.
  const wf = workflow({
    workflow_id: "sessV#0", segments: [principal, sousAgent], passages: [sousAgent],
  });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);

  // `SIGLES_SPECIAUX` est une constante de module (`const`), jamais exposée
  // comme propriété du contexte `vm` (contrairement aux DÉCLARATIONS de
  // fonction, qui s'attachent à l'objet global d'un script classique) —
  // cette sonde ne peut donc l'inspecter QUE par son EFFET observable :
  // le sigle réellement peint pour "ap-integrateur", ci-dessous.
  const gPrincipal = trouverGroupeAgent(detail, "(agent principal)");
  const sPrincipal = gPrincipal && gPrincipal.children.find((n) => n.tagName === "TEXT" && aClasseSvg(n, "dg-sigle"));
  check("sigleAP_voisin_principal_vaut_AP",
    !!sPrincipal && sPrincipal.textContent === "AP",
    "obtenu " + JSON.stringify(sPrincipal && sPrincipal.textContent));

  const gVoisin = trouverGroupeAgent(detail, "ap-integrateur");
  check("sigleAP_voisin_groupe_trouve", !!gVoisin);
  const sVoisin = gVoisin && gVoisin.children.find((n) => n.tagName === "TEXT" && aClasseSvg(n, "dg-sigle"));
  check("sigleAP_voisin_texte_trouve", !!sVoisin);
  // "AP" est déjà pris par le principal (alphabétiquement premier : "(" est
  // avant toute lettre) : l'agent réel préfixé "ap-" retombe donc sur le
  // repli déterministe (FNV-1a) de `sigleAgent` — jamais "AP" (qu'une table
  // trop permissive pourrait lui attribuer quand même), jamais "??" (repli
  // d'échec). Le repli attendu est reconstruit à partir de la même fonction
  // de hachage EXPOSÉE (`empreinteFnv1a`, un utilitaire pur non concerné par
  // le défaut visé ici), sans jamais rappeler `sigleAgent` lui-même.
  const empreinte = bac.sandbox.empreinteFnv1a("ap-integrateur");
  let attendu = null;
  for (let d = 0; d < 10 && attendu === null; d++) {
    const candidat = "A" + String((empreinte + d) % 10);
    if (candidat !== "AP") attendu = candidat;
  }
  check("sigleAP_voisin_ne_vaut_pas_AP", !!sVoisin && sVoisin.textContent !== "AP",
    "obtenu " + JSON.stringify(sVoisin && sVoisin.textContent));
  check("sigleAP_voisin_ne_vaut_pas_repli_echec", !!sVoisin && sVoisin.textContent !== "??",
    "obtenu " + JSON.stringify(sVoisin && sVoisin.textContent));
  check("sigleAP_voisin_vaut_le_repli_attendu",
    !!sVoisin && sVoisin.textContent === attendu,
    "obtenu " + JSON.stringify(sVoisin && sVoisin.textContent) + " attendu " + JSON.stringify(attendu));
}

// feature-020 (C1/C2, mutant de contrôle M16) : le cadre d'un créneau empilé
// ne doit JAMAIS porter d'aplat — un filet suffit (§9 du design system). La
// régression visée (défaut O) est un simple `fill:"var(--creux)"` qui
// masquerait le lien passant sous le cadre ; elle ne se détecte que sur
// l'ATTRIBUT réellement posé par `app.js` (`svgAttrs`), jamais sur une classe
// CSS (`.dg-cadre-simultane` ne porte pas de `fill` en CSS, voir app.css).
async function sondeCadreSimultaneSansAplat() {
  const passages = [
    segment("sousagent", "backend-developer", {
      debut: "2026-09-14T09:00:00.000Z", fin: "2026-09-14T09:00:03.000Z", duree_ms: 3000, outils: 1,
    }),
    segment("sousagent", "frontend-developer", {
      debut: "2026-09-14T09:00:00.000Z", fin: "2026-09-14T09:00:03.000Z", duree_ms: 3000, outils: 1,
    }),
  ];
  const wf = workflow({ workflow_id: "sessCadre#0", segments: passages, passages });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);
  const noeuds = tousLesNoeuds(detail);
  const cadre = noeuds.find((n) => n.tagName === "RECT" && aClasseSvg(n, "dg-cadre-simultane"));
  check("cadre_simultane_present_dans_le_rendu", !!cadre, "aucun rect .dg-cadre-simultane trouvé");
  check("cadre_simultane_sans_aplat_fill_none",
    !!cadre && cadre.fill === "none",
    "obtenu fill=" + JSON.stringify(cadre && cadre.fill));
}

// feature-020 (E6a, mutants de contrôle M10/M19) : épaisseur du LISERÉ des
// fichiers et de la BARRE GRISE du zéro — descendues de `diagramme.js` vers
// `app.css` (constantes de pur trait, C2) pendant ce cycle. La garde lit la
// déclaration RÉELLE de la règle CSS (jamais une sous-chaîne dans tout le
// fichier, PIEGES.md §25/§26/§27) et vérifie qu'AUCUNE autre règle du même
// sélecteur n'existe dans app.css (sinon la spécificité déciderait, pas
// cette déclaration — PIEGES.md §25) : chaque sélecteur n'apparaît qu'UNE
// fois dans app.css au moment de l'écriture de ce test, vérifié ci-dessous
// avant de lire la valeur.
function sondeEpaisseursDeTraitLiseretEtBarreGriseDepuisCss() {
  const css = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, " ");

  function occurrences(selecteur) {
    const regex = new RegExp(selecteur.replace(/[.]/g, "\\.") + "\\s*\\{", "g");
    return (sansCommentaires.match(regex) || []).length;
  }

  check("sonde_dg_liseret_declare_une_seule_fois", occurrences(".dg-liseret") === 1,
    "obtenu " + occurrences(".dg-liseret") + " occurrence(s) — la spécificité déciderait sinon (PIEGES §25)");
  const regleLiseret = extraireRegleCss(sansCommentaires, ".dg-liseret {");
  check("sonde_dg_liseret_regle_presente", !!regleLiseret);
  check("sonde_dg_liseret_epaisseur_1px",
    !!regleLiseret && /stroke-width:\s*1px/.test(regleLiseret),
    "règle=" + regleLiseret);

  check("sonde_dg_barre_zero_grise_declare_une_seule_fois", occurrences(".dg-barre-zero-grise") === 1,
    "obtenu " + occurrences(".dg-barre-zero-grise") + " occurrence(s)");
  const regleBarreGrise = extraireRegleCss(sansCommentaires, ".dg-barre-zero-grise {");
  check("sonde_dg_barre_zero_grise_regle_presente", !!regleBarreGrise);
  check("sonde_dg_barre_zero_grise_epaisseur_1px",
    !!regleBarreGrise && /stroke-width:\s*1px/.test(regleBarreGrise),
    "règle=" + regleBarreGrise);
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

// feature-020 (E6c) : parité « posé ⇔ déclaré » entre les classes `dg-*`
// réellement POSÉES par `app.js` (toute chaîne littérale du fichier — le seul
// mécanisme par lequel une classe entre dans le DOM ici, aucune construction
// dynamique de nom de classe n'existe dans ce module) et celles réellement
// DÉCLARÉES dans `app.css` (sélecteurs `.dg-*`). Les DEUX listes sont LUES
// DEPUIS LES ARTEFACTS livrés (PIEGES.md §21 : une énumération à la main
// serait périmée au premier ajout), les commentaires sont retirés en amont
// (§26/§27 : une citation en commentaire ne doit compter ni comme pose ni
// comme déclaration). Échoue dans les DEUX sens.
function classesDgPoseesDepuisAppJs(source) {
  const sansCommentaires = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
  const classes = new Set();
  const regexLitteral = /"([^"\\]*)"/g;
  let m;
  while ((m = regexLitteral.exec(sansCommentaires)) !== null) {
    m[1].split(/\s+/).forEach((tok) => { if (tok.indexOf("dg-") === 0) classes.add(tok); });
  }
  return classes;
}
function classesDgDeclareesDepuisCss(css) {
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  const classes = new Set();
  const regex = /\.(dg-[a-zA-Z0-9-]+)/g;
  let m;
  while ((m = regex.exec(sansCommentaires)) !== null) classes.add(m[1]);
  return classes;
}
function sondePariteClassesDgPoseesEtDeclarees() {
  const sourceAppJs = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const sourceAppCss = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");
  const posees = classesDgPoseesDepuisAppJs(sourceAppJs);
  const declarees = classesDgDeclareesDepuisCss(sourceAppCss);
  check("parite_dg_au_moins_une_classe_lue_de_chaque_cote",
    posees.size > 0 && declarees.size > 0,
    "posées=" + posees.size + " déclarées=" + declarees.size);
  const poseesSansDeclaration = [...posees].filter((c) => !declarees.has(c)).sort();
  const declareesSansPose = [...declarees].filter((c) => !posees.has(c)).sort();
  check("parite_dg_aucune_classe_posee_sans_etre_declaree",
    poseesSansDeclaration.length === 0,
    "posées sans déclaration CSS : " + JSON.stringify(poseesSansDeclaration));
  check("parite_dg_aucune_classe_declaree_sans_etre_posee",
    declareesSansPose.length === 0,
    "déclarées sans être posées dans app.js : " + JSON.stringify(declareesSansPose));
}

// feature-020 (revue code-reviewer, G1/G3) : la taille de police des socles
// et du sigle est posée en `style.fontSize`, JAMAIS en attribut de
// présentation (G1 — une classe CSS regagnerait la priorité sur un attribut,
// c'est le défaut réel trouvé : `.dg-socle-nom { font-size: 10.5px }`
// écrasait l'attribut posé depuis `taillePx`, y compris pour le nom EMPILÉ
// qui doit valoir 11px), et TOUJOURS avec une unité EXPLICITE (G3 —
// `style.fontSize = 11`, nombre nu, est coercé en `11px` par CE Chromium
// mais resterait une déclaration CSS INVALIDE ailleurs ; les 547 cas front
// existants n'avaient rien vu passer de l'attribut à l'unité manquante).
//
// Le bac à sable `FakeNode` de ce harnais ne coerce RIEN (`.style` est un
// objet nu, jamais un `CSSStyleDeclaration` réel) : assigner un NOMBRE au
// lieu d'une CHAÎNE `"11px"` reste un nombre ici, là où un vrai navigateur
// l'aurait masqué en silence — exactement le mécanisme qui a rendu G3
// invisible sur les 547 cas déjà verts. C'est ce qui rend ce test capable de
// voir la régression qu'aucune mesure `getComputedStyle` (Chromium) ne peut
// voir par elle-même.
function verifierPoliceEnStyleAvecUnitePx(noeud, nom, tailleAttendue) {
  check(nom + "_trouve", !!noeud);
  if (!noeud) return;
  check(nom + "_posee_en_style_jamais_en_attribut",
    typeof noeud.style.fontSize === "string" && noeud.getAttribute("font-size") == null,
    "style.fontSize=" + JSON.stringify(noeud.style.fontSize) + " attribut font-size="
    + JSON.stringify(noeud.getAttribute("font-size")));
  check(nom + "_unite_px_explicite_valeur_exacte",
    noeud.style.fontSize === tailleAttendue + "px",
    "obtenu " + JSON.stringify(noeud.style.fontSize) + " attendu " + JSON.stringify(tailleAttendue + "px"));
}

async function sondePoliceSocleEtSigleEnStyleAvecUnitePx() {
  const passages = [
    segment("sousagent", "backend-developer", {
      debut: "2026-09-14T09:00:00.000Z", fin: "2026-09-14T09:00:05.000Z", duree_ms: 5000, outils: 1,
    }),
    segment("sousagent", "frontend-developer", {
      debut: "2026-09-14T09:00:00.000Z", fin: "2026-09-14T09:00:05.000Z", duree_ms: 5000, outils: 1,
    }),
    segment("sousagent", "test-engineer", {
      debut: "2026-09-14T09:10:00.000Z", fin: "2026-09-14T09:10:05.000Z", duree_ms: 5000, outils: 1,
    }),
  ];
  const wf = workflow({ workflow_id: "sessPolice#0", segments: passages, passages });
  const bac = await chargerAvecEtat({ workflows: [wf] });
  const { detail } = enteteEtDetail(cyclesLi(bac)[0]);
  const noeuds = tousLesNoeuds(detail);

  // Le MÊME rôle (nom) porte deux tailles distinctes, épinglées un par un
  // (PIEGES.md, « une assertion globale ne prouve pas l'appariement ») —
  // jamais seulement « les tailles diffèrent ». Créneau empilé peint en
  // premier (deux agents), créneau simple en second (un agent).
  const noeudsNom = noeuds.filter((n) => n.tagName === "TEXT" && aClasseSvg(n, "dg-socle-nom"));
  check("police_trois_lignes_nom_trouvees", noeudsNom.length === 3, "obtenu " + noeudsNom.length);
  verifierPoliceEnStyleAvecUnitePx(noeudsNom[0], "police_nom_empile_agent0", 11);
  verifierPoliceEnStyleAvecUnitePx(noeudsNom[1], "police_nom_empile_agent1", 11);
  verifierPoliceEnStyleAvecUnitePx(noeudsNom[2], "police_nom_simple", 10.5);

  const heureSimple = noeuds.find((n) => n.tagName === "TEXT" && aClasseSvg(n, "dg-socle-heure"));
  verifierPoliceEnStyleAvecUnitePx(heureSimple, "police_heure_simple", 10.5);
  const dureeSimple = noeuds.find((n) => n.tagName === "TEXT" && aClasseSvg(n, "dg-socle-duree"));
  verifierPoliceEnStyleAvecUnitePx(dureeSimple, "police_duree_simple", 12.5);
  const heureDureeEmpile = noeuds.find((n) => n.tagName === "TEXT" && aClasseSvg(n, "dg-socle-heure-duree"));
  verifierPoliceEnStyleAvecUnitePx(heureDureeEmpile, "police_heure_duree_empile", 11.5);

  const sigle = noeuds.find((n) => n.tagName === "TEXT" && aClasseSvg(n, "dg-sigle"));
  verifierPoliceEnStyleAvecUnitePx(sigle, "police_sigle", 9.5);
}

// Libellé de cadre (« N agents en parallèle ») et libellé de repli (« +N »)
// — les deux DERNIERS points cités par la revue, non couverts ci-dessus
// (fixtures dédiées : cadre déjà présent dans la fixture précédente à 2
// agents ; repli exige > `repliMaxVisibles` (4) agents simultanés).
async function sondePoliceLibelleCadreEtRepliEnStyleAvecUnitePx() {
  const passagesCadre = [
    segment("sousagent", "backend-developer", {
      debut: "2026-09-14T09:00:00.000Z", fin: "2026-09-14T09:00:05.000Z", duree_ms: 5000, outils: 1,
    }),
    segment("sousagent", "frontend-developer", {
      debut: "2026-09-14T09:00:00.000Z", fin: "2026-09-14T09:00:05.000Z", duree_ms: 5000, outils: 1,
    }),
  ];
  const wfCadre = workflow({ workflow_id: "sessPoliceCadre#0", segments: passagesCadre, passages: passagesCadre });
  const bacCadre = await chargerAvecEtat({ workflows: [wfCadre] });
  const { detail: detailCadre } = enteteEtDetail(cyclesLi(bacCadre)[0]);
  const libelleCadre = tousLesNoeuds(detailCadre)
    .find((n) => n.tagName === "TEXT" && aClasseSvg(n, "dg-libelle-cadre"));
  verifierPoliceEnStyleAvecUnitePx(libelleCadre, "police_libelle_cadre", 10.5);

  const passagesRepli = [];
  for (let i = 0; i < 5; i++) {
    passagesRepli.push(segment("sousagent", "agent-repli-" + i, {
      debut: "2026-09-14T09:00:00.000Z", fin: "2026-09-14T09:00:05.000Z", duree_ms: 5000, outils: 1,
    }));
  }
  const wfRepli = workflow({ workflow_id: "sessPoliceRepli#0", segments: passagesRepli, passages: passagesRepli });
  const bacRepli = await chargerAvecEtat({ workflows: [wfRepli] });
  const { detail: detailRepli } = enteteEtDetail(cyclesLi(bacRepli)[0]);
  const libelleRepli = tousLesNoeuds(detailRepli)
    .find((n) => n.tagName === "TEXT" && aClasseSvg(n, "dg-repli"));
  verifierPoliceEnStyleAvecUnitePx(libelleRepli, "police_libelle_repli", 10.5);
}

// feature-020 (G1, statique) : AUCUNE des règles CSS du socle ne déclare
// `font-size` — l'invariant explicitement écrit en commentaire d'`app.css`
// (« AUCUN font-size ici, jamais »). Garde COMPLÉMENTAIRE aux deux sondes
// ci-dessus : tant qu'`app.js` pose la taille en `style` (gagnant toujours
// contre une classe), réintroduire cette règle CSS seule ne changerait rien
// au RENDU réel — mais laisser l'invariant se dégrader sans témoin, c'est
// laisser la moitié de la protection reposer uniquement sur l'autre moitié
// (`app.js`) sans qu'aucun test ne le nomme. Lu depuis L'ARTEFACT (jamais
// une liste de sélecteurs recopiée par ailleurs) : les BLOCS eux-mêmes
// viennent d'`extraireRegleCss`, déjà utilisé plus haut dans ce fichier.
function sondeCssSocleNeDeclarePlusFontSize() {
  const css = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");
  const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, " ");
  const SELECTEURS = [
    ".dg-socle-heure, .dg-socle-nom {",
    ".dg-socle-duree, .dg-socle-heure-duree {",
    ".dg-repli, .dg-libelle-cadre {",
  ];
  SELECTEURS.forEach((selecteur) => {
    const regle = extraireRegleCss(sansCommentaires, selecteur);
    check("sonde_" + selecteur.replace(/[^a-z-]/gi, "") + "_regle_presente", !!regle);
    check("sonde_" + selecteur.replace(/[^a-z-]/gi, "") + "_sans_font_size",
      !!regle && !/font-size/.test(regle), "règle=" + regle);
  });
}

// Garde « zéro arithmétique dans app.js » (architect) : les six fonctions
// qui peignent le diagramme ne doivent plus jamais appeler `duree(`,
// `heure(`, ni `Math.*` — c'est l'invariant qui empêche la classe de
// défauts bug-020/bug-021 (une position recalculée localement, divergente
// de `disposer()`) de revenir. Lu depuis L'ARTEFACT LIVRÉ (`app.js`),
// jamais une affirmation sur l'intention du code (PIEGES.md §21).
function sondeZeroArithmetiqueDansLesFonctionsDeDiagramme() {
  const source = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  const FONCTIONS = [
    "construireCercleAgent", "construireSoclesCreneau", "construireLiensDiagramme",
    "construireArcsDiagramme", "construireLegendeDiagramme", "construireDiagramme",
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
  await testRepliNeutrePourAgentSansTeinte();
  await testStructureClavier();
  await testAucunCheminAbsoluDansLInfobulle();
  await testDiagrammeCableAvantLaTable();
  await testGuardeAbsenceDiagrammeJs();
  await sondeLienPorteClasseDgLien();
  await sondePastilleCxVientDeDisposer();
  await sondeArcSommetVientDeDisposer();
  sondeJetonsCssDesLiensEtPastilles();
  await sondeGuideEtGraduationEteinteJetonsCorrects();
  await sondeContourCerclePourChaqueEtat();
  await sondeArcRebouclageNAPlusDePointe();
  sondeCssNeDeclarePlusDgArcPointe();
  await sondeSigleEnCouleurIdentitePourTousLesAgents();
  await sondeLiseretPeintApresLeDisque();
  await sondeSigleAgentPrincipalEstAP();
  await sondeAgentReelPrefixeApGardeSigleCalcule();
  await sondeCadreSimultaneSansAplat();
  sondeEpaisseursDeTraitLiseretEtBarreGriseDepuisCss();
  await testDureeTablePassagesFormatMaquette();
  sondePariteClassesDgPoseesEtDeclarees();
  await sondePoliceSocleEtSigleEnStyleAvecUnitePx();
  await sondePoliceLibelleCadreEtRepliEnStyleAvecUnitePx();
  sondeCssSocleNeDeclarePlusFontSize();
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
