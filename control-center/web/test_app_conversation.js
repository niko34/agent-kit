"use strict";
/* Harnais headless pour le panneau de conversation (feature-022, absorbée
 * dans feature-021 cycle 2, lot 11).
 *
 *     node control-center/web/test_app_conversation.js
 *
 * Même bac à sable minimal que `test_app_bug012.js` (dupliqué, pas partagé —
 * ces harnais ne sont pas des modules, ADR-0006, PIEGES §6) : `app.js`
 * exécuté TEL QUEL dans un contexte `vm` neuf par test.
 *
 * Ce que ce harnais établit PAR EXÉCUTION :
 *  - Les trois états de lecture (chargement/erreur/vide), et le fil normal.
 *  - `tronque: true` affiche le message « fil tronqué » (S3.4/D2).
 *  - Le composeur est INERTE (pas absent) : sans jeton actif, sans agent
 *    disponible (404), pendant un envoi — avec une raison en clair.
 *  - Un envoi réussi (202) vide le champ et rafraîchit le fil.
 *  - Un 503 (« canal occupé ») affiche le message SANS effacer le texte
 *    saisi et SANS réessayer en silence (cas limite nommé dans la spec).
 *  - Un 401 à l'envoi rouvre la porte, comme partout ailleurs dans ce module.
 *  - Anti double-soumission : un second clic pendant un envoi en cours est
 *    sans effet.
 *  - S3.6 (rendu par `textContent` exclusif) est gardée SÉPARÉMENT par
 *    `test_conformite_rendu_textuel.js` — ce fichier ne la reproduit pas.
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
    this.checked = false;
    this.value = "";
    this.title = "";
    this.type = "";
    this.htmlFor = "";
    this.autocomplete = "";
    this.id = "";
    this.placeholder = "";
    this._listeners = {};
  }
  set textContent(v) { this._text = v === undefined || v === null ? "" : String(v); this.children = []; }
  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent).join("");
    return this._text;
  }
  get childNodes() { return this.children; }
  get firstChild() { return this.children.length ? this.children[0] : null; }
  appendChild(child) {
    if (child && child.tagName === "#FRAGMENT") {
      child.children.forEach((c) => this.children.push(c));
      child.children = [];
      return child;
    }
    this.children.push(child);
    return child;
  }
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
  dispatchSubmit() {
    const evt = { preventDefault: () => {}, type: "submit" };
    (this._listeners.submit || []).forEach((f) => f(evt));
  }
  get classList() {
    const self = this;
    return {
      add: (c) => { self.className = (self.className ? self.className + " " : "") + c; },
      contains: (c) => self.className.split(/\s+/).filter(Boolean).indexOf(c) !== -1,
    };
  }
}

// Tout id qu'`app.js` touche SANS CONDITION au chargement, plus ceux propres
// à ce fichier (PIEGES §38 : un id absent du bac rend `null`, silencieux).
const IDS = [
  "a11y-announcement", "account-button", "agents", "avatar",
  "backlog-column-count", "backlog-count", "backlog-title", "bandeau-hote",
  "bandeau-hote-bouton", "bandeau-hote-texte", "barre",
  "bouton-generer-brouillon", "claude-status", "composer", "composer-etat",
  "conversation", "conversation-erreur", "compteur-prompt", "compteur-specs",
  "cycle-canvas", "cycle-indice", "cycle-status", "cycle-title",
  "derogation-minimale", "envoyer-conversation", "erreur-generer-brouillon",
  "fichiers", "filtre", "filtre-divergences", "horodatage", "jauge-flux",
  "jauge-git", "jauge-pilotage", "kanban", "legende-cycles",
  "link-front-sec", "link-front-tests", "link-front2-review", "link-reprise",
  "link-sec-front2", "link-spec-front", "link-tests-front2", "main-content",
  "motion-note", "note-agents", "pied-cycles", "pilotage-corps",
  "porte-aide", "porte-bouton", "porte-champ", "porte-corps", "porte-erreur",
  "porte-jeton", "porte-titre", "projet", "prompt", "redaction-corps",
  "repo-strip", "repo-strip-ok", "repo-strip-texte", "selected-code",
  "selected-duration", "selected-files", "selected-state", "selected-task",
  "selected-title", "selected-tokens", "selected-tools", "sheet-metrics", "sheet-toggle",
  "spec-prompt", "status-dot", "summary-active", "summary-step",
  "summary-time", "summary-tokens", "systeme", "timeline", "tiroir", "tiroir-contenu",
  "tiroir-fermer", "tiroir-titre", "titre-agents", "titre-besoin",
  "titre-cycles", "titre-demande", "titre-evenements", "titre-fichiers",
  "titre-pilotage", "titre-systeme", "user-name", "workflows",
];
const CACHES_PAR_DEFAUT = new Set(["bandeau-hote", "tiroir", "porte-jeton", "porte-erreur", "erreur-generer-brouillon"]);

function creerBac() {
  const elements = new Map();
  for (const id of IDS) {
    const n = new FakeNode(id === "composer" ? "form" : "div");
    n.id = id;
    n.hidden = CACHES_PAR_DEFAUT.has(id);
    elements.set(id, n);
  }

  const document_ = {
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new FakeNode(tag),
    createElementNS: (_ns, tag) => new FakeNode(tag),
    createTextNode: (texte) => { const n = new FakeNode("#text"); n.textContent = texte; return n; },
    createDocumentFragment: () => new FakeNode("#fragment"),
    addEventListener: () => {},
    activeElement: null,
  };

  class FakeEventSource {
    constructor(url) { this.url = url; this.onopen = null; this.onerror = null; this._listeners = {}; }
    addEventListener(type, gestionnaire) { (this._listeners[type] = this._listeners[type] || []).push(gestionnaire); }
  }

  const appelsSetInterval = [];
  let prochainId = 1;
  const setInterval_ = (fn, ms) => { const id = prochainId++; appelsSetInterval.push({ id, fn, ms }); return id; };
  const clearInterval_ = (id) => { const i = appelsSetInterval.findIndex((a) => a.id === id); if (i >= 0) appelsSetInterval.splice(i, 1); };

  const sessionStorageDonnees = {};
  const sessionStorage_ = {
    getItem: (cle) => (Object.prototype.hasOwnProperty.call(sessionStorageDonnees, cle) ? sessionStorageDonnees[cle] : null),
    setItem: (cle, valeur) => { sessionStorageDonnees[cle] = String(valeur); },
    removeItem: (cle) => { delete sessionStorageDonnees[cle]; },
  };

  const reponsesFetch = [];
  const appelsFetch = [];
  async function fetch_(url, options) {
    appelsFetch.push({ url, options });
    // Persistant par construction (comme `test_app_bug012.js`) : `app.js`
    // fait DEUX appels distincts à `/api/etat` au démarrage
    // (`verifierEtatAuth` puis `rafraichir()`, appelé PAR `verifierEtatAuth`
    // sur un 200) — une réponse retirée après un seul usage ferait échouer
    // le second, silencieusement transformé en état « chargement » figé.
    for (const r of reponsesFetch) {
      if (r.predicat(url, options)) {
        const resultat = await r.repondre(url, options);
        return { status: resultat.status, ok: resultat.status >= 200 && resultat.status < 300, json: async () => resultat.body };
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
    setTimeout, clearTimeout,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  return { sandbox, elements, appelsSetInterval, sessionStorageDonnees, reponsesFetch, appelsFetch, $: (id) => elements.get(id) };
}

let _sourceDiagrammeJs = null;
let _sourceAppJs = null;
function chargerAppJS(bac) {
  if (_sourceDiagrammeJs === null) _sourceDiagrammeJs = fs.readFileSync(path.join(__dirname, "diagramme.js"), "utf8");
  new vm.Script(_sourceDiagrammeJs, { filename: "diagramme.js" }).runInContext(bac.sandbox);
  if (_sourceAppJs === null) _sourceAppJs = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  new vm.Script(_sourceAppJs, { filename: "app.js" }).runInContext(bac.sandbox);
}

function attendreMicrotaches() { return new Promise((resolve) => setImmediate(resolve)); }

function corpsEtat(overrides) {
  return Object.assign({
    projet: "MonProjet", config_lue: true, colonnes: [], specs: [], divergences: 0,
    agents: [], workflows: [], evenements: [],
    git: { depot: false, branche: null, touches: [], commits: [] },
    commandes_declarees: [], garde_fous: { budget_max_usd: null, ecrivains_simultanes: null },
    ecriture_active: true, ecriture_raison: null, jeton_requis: false,
    horodatage: "2026-09-22T12:00:00Z",
  }, overrides || {});
}

function enfiler(bac, chemin, status, body) {
  bac.reponsesFetch.push({
    predicat: (url) => String(url).indexOf(chemin) === 0,
    repondre: async () => ({ status, body }),
  });
}

// Démarre l'app avec un état initial connu, laisse le premier rafraîchissement
// (et donc le premier `GET /api/conversation`) se dérouler.
async function demarrer(bac, etatOverrides, conversationReponse) {
  enfiler(bac, "/api/etat", 200, corpsEtat(etatOverrides));
  if (conversationReponse) {
    bac.reponsesFetch.push({
      predicat: (url, options) => String(url).indexOf("/api/conversation") === 0 && (!options || !options.method || options.method === "GET"),
      repondre: async () => conversationReponse,
      persistant: true,
    });
  }
  chargerAppJS(bac);
  for (let i = 0; i < 6; i += 1) await attendreMicrotaches();
}

// ------------------------------------------------------------- scénarios --

async function testChargementInitialComposerInerte() {
  const bac = creerBac();
  const composer = bac.$("composer"); const champ = bac.$("prompt"); const bouton = bac.$("envoyer-conversation");
  chargerAppJS(bac);
  check("CHARGEMENT_composer_inerte_avant_tout_rendu", champ.disabled === true && bouton.disabled === true);
  check("CHARGEMENT_conversation_dit_chargement",
    bac.$("conversation").textContent.indexOf("chargement") !== -1,
    JSON.stringify(bac.$("conversation").textContent));
  void composer;
}

async function testFilNormalEtTronque() {
  const bac = creerBac();
  await demarrer(bac, {}, { status: 200, body: {
    messages: [{ ts: 1758000000000, texte: "bonjour" }],
    tronque: true,
  } });

  const texteConv = bac.$("conversation").textContent;
  check("FIL_message_utilisateur_present", texteConv.indexOf("bonjour") !== -1, texteConv);
  check("FIL_tronque_affiche_mutation_c",
    texteConv.indexOf("tronqué") !== -1 || texteConv.indexOf("tronque") !== -1,
    "attendu la mention « tronqué », obtenu : " + JSON.stringify(texteConv));
  check("FIL_composer_actif_quand_disponible_et_ecriture_active",
    bac.$("prompt").disabled === false && bac.$("envoyer-conversation").disabled === false);
}

async function testFilVideEtatExplicite() {
  const bac = creerBac();
  await demarrer(bac, {}, { status: 200, body: { messages: [], tronque: false } });
  const texte = bac.$("conversation").textContent;
  check("VIDE_etat_explicite", texte.indexOf("Aucun message") !== -1, JSON.stringify(texte));
}

async function testIndisponible404ComposerInerteAvecRaison() {
  const bac = creerBac();
  await demarrer(bac, {}, { status: 404, body: { erreur: "aucun agent en cours n'accepte de message" } });
  check("INDISPONIBLE_composer_inerte", bac.$("prompt").disabled === true && bac.$("envoyer-conversation").disabled === true);
  check("INDISPONIBLE_raison_en_clair",
    (bac.$("prompt").title || "").length > 0 || (bac.$("composer-etat").textContent || "").length > 0);
  const texte = bac.$("conversation").textContent;
  check("INDISPONIBLE_etat_conversation_le_dit", texte.indexOf("Aucun agent") !== -1, JSON.stringify(texte));
}

async function testEcritureInactiveComposerInerteAvecRaison() {
  const bac = creerBac();
  await demarrer(bac, { ecriture_active: false, ecriture_raison: "aucun jeton déclaré" },
    { status: 200, body: { messages: [], tronque: false } });
  check("ECRITURE_INACTIVE_composer_inerte", bac.$("prompt").disabled === true);
  check("ECRITURE_INACTIVE_raison_nommee",
    (bac.$("prompt").title || "").indexOf("aucun jeton déclaré") !== -1
      || (bac.$("composer-etat").textContent || "").indexOf("aucun jeton déclaré") !== -1,
    "title=" + bac.$("prompt").title + " note=" + bac.$("composer-etat").textContent);
}

async function testErreurReseauNeFigePasLeFilPerime() {
  const bac = creerBac();
  // Premier chargement réussi avec un message, PUIS le fil suivant échoue.
  enfiler(bac, "/api/etat", 200, corpsEtat({}));
  let appelsConversation = 0;
  bac.reponsesFetch.push({
    predicat: (url) => String(url).indexOf("/api/conversation") === 0,
    repondre: async () => {
      appelsConversation += 1;
      if (appelsConversation === 1) return { status: 200, body: { messages: [{ ts: 1, texte: "premier message" }], tronque: false } };
      throw new Error("réseau coupé");
    },
    persistant: true,
  });
  chargerAppJS(bac);
  for (let i = 0; i < 6; i += 1) await attendreMicrotaches();
  check("RESEAU_precondition_message_present", bac.$("conversation").textContent.indexOf("premier message") !== -1);

  // Second rafraîchissement (appelé directement, comme `rafraichir()` le
  // ferait sur le signal SSE ou le sondage 10s) : le réseau échoue.
  await bac.sandbox.actualiserConversation();
  const texte = bac.$("conversation").textContent;
  check("RESEAU_message_perime_reste_affiche", texte.indexOf("premier message") !== -1, JSON.stringify(texte));
  check("RESEAU_incertitude_dite_a_l_ecran", texte.indexOf("injoignable") !== -1, JSON.stringify(texte));
}

async function testEnvoi202VideLeChampEtRafraichit() {
  const bac = creerBac();
  // UN SEUL mock GET, dont la réponse dépend d'un état mutable — plutôt que
  // deux mocks persistants empilés (le premier matché gagne toujours, le
  // second ne serait jamais atteint).
  let messagesGet = [];
  bac.reponsesFetch.push({
    predicat: (url, options) => String(url).indexOf("/api/conversation") === 0 && (!options || !options.method || options.method === "GET"),
    repondre: async () => ({ status: 200, body: { messages: messagesGet, tronque: false } }),
  });
  bac.reponsesFetch.push({
    predicat: (url, options) => String(url) === "/api/conversation" && options && options.method === "POST",
    repondre: async () => { messagesGet = [{ ts: 2, texte: "un nouveau message" }]; return { status: 202, body: { envoye: true } }; },
  });

  await demarrer(bac, {}, null);
  bac.$("prompt").value = "un nouveau message";

  bac.$("composer").dispatchSubmit();
  for (let i = 0; i < 6; i += 1) await attendreMicrotaches();

  check("ENVOI_202_champ_vide", bac.$("prompt").value === "", JSON.stringify(bac.$("prompt").value));
  check("ENVOI_202_fil_rafraichi", bac.$("conversation").textContent.indexOf("un nouveau message") !== -1);
}

async function testEnvoi503CanalOccupeNeReessaiePasEtGardeLeTexte() {
  const bac = creerBac();
  await demarrer(bac, {}, { status: 200, body: { messages: [], tronque: false } });
  bac.$("prompt").value = "texte en attente";

  let appelsPost = 0;
  bac.reponsesFetch.push({
    predicat: (url, options) => String(url) === "/api/conversation" && options && options.method === "POST",
    repondre: async () => { appelsPost += 1; return { status: 503, body: { erreur: "tube occupé" } }; },
  });

  bac.$("composer").dispatchSubmit();
  for (let i = 0; i < 6; i += 1) await attendreMicrotaches();

  check("503_un_seul_appel_aucune_reprise_silencieuse", appelsPost === 1, "obtenu " + appelsPost);
  check("503_texte_conserve", bac.$("prompt").value === "texte en attente", JSON.stringify(bac.$("prompt").value));
  check("503_dit_a_l_ecran",
    bac.$("conversation-erreur").hidden === false && bac.$("conversation-erreur").textContent.indexOf("occupé") !== -1,
    JSON.stringify(bac.$("conversation-erreur").textContent));
}

async function testEnvoi401RouvreLaPorte() {
  const bac = creerBac();
  await demarrer(bac, {}, { status: 200, body: { messages: [], tronque: false } });
  bac.$("prompt").value = "quelque chose";
  bac.reponsesFetch.push({
    predicat: (url, options) => String(url) === "/api/conversation" && options && options.method === "POST",
    repondre: async () => ({ status: 401, body: { erreur: "authentification requise" } }),
  });
  bac.$("composer").dispatchSubmit();
  for (let i = 0; i < 6; i += 1) await attendreMicrotaches();
  check("401_porte_reouverte", bac.$("porte-jeton").hidden === false);
}

async function testAntiDoubleSoumission() {
  const bac = creerBac();
  await demarrer(bac, {}, { status: 200, body: { messages: [], tronque: false } });
  bac.$("prompt").value = "un message";

  let appelsPost = 0;
  let resoudre;
  const promesseLente = new Promise((r) => { resoudre = r; });
  bac.reponsesFetch.push({
    predicat: (url, options) => String(url) === "/api/conversation" && options && options.method === "POST",
    repondre: async () => { appelsPost += 1; return promesseLente; },
  });

  bac.$("composer").dispatchSubmit();
  await attendreMicrotaches();
  check("ANTI_DOUBLE_bouton_inerte_pendant_l_envoi", bac.$("envoyer-conversation").disabled === true);
  // Second clic PENDANT l'envoi : sans effet, aucun second appel réseau.
  bac.$("composer").dispatchSubmit();
  await attendreMicrotaches();
  check("ANTI_DOUBLE_un_seul_appel_reseau", appelsPost === 1, "obtenu " + appelsPost);

  resoudre({ status: 202, body: { envoye: true } });
  for (let i = 0; i < 6; i += 1) await attendreMicrotaches();
}

async function main() {
  await testChargementInitialComposerInerte();
  await testFilNormalEtTronque();
  await testFilVideEtatExplicite();
  await testIndisponible404ComposerInerteAvecRaison();
  await testEcritureInactiveComposerInerteAvecRaison();
  await testErreurReseauNeFigePasLeFilPerime();
  await testEnvoi202VideLeChampEtRafraichit();
  await testEnvoi503CanalOccupeNeReessaiePasEtGardeLeTexte();
  await testEnvoi401RouvreLaPorte();
  await testAntiDoubleSoumission();

  console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
  for (const e of _echecs) console.log("  - " + e);
  process.exit(_echecs.length ? 1 : 0);
}

main();
