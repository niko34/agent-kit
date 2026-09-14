"use strict";
/* Harnais headless pour `control-center/web/app.js` — bug-012, ADR-0020.
 *
 *     node control-center/web/test_app_bug012.js
 *
 * Zéro dépendance installée (ADR-0006) : uniquement les modules standard de
 * Node (`vm`, `fs`, `path`). `app.js` est chargé TEL QUEL — jamais copié ni
 * modifié — dans un bac à sable qui ne fournit QUE les API globales dont le
 * fichier se sert réellement (`document`, `fetch`, `EventSource`,
 * `sessionStorage`, `setInterval`/`clearInterval`, `requestAnimationFrame`),
 * taillées sur l'usage relevé (aucun `querySelector`, aucun `dataset`,
 * aucun `removeEventListener` dans `app.js` au moment de l'écriture).
 *
 * Convention du projet : sortie « N cas, M echec(s) », code de sortie 1 à
 * l'échec (voir `control-center/backend/test_server_bug012.py`). Invoqué
 * depuis `test_app_bug012.py`, qui se saute proprement si `node` est absent.
 *
 * ## Ce que ce harnais établit PAR EXÉCUTION
 *
 * - Invariant central : aucune fonction `rendre*` n'écrit dans le DOM avant
 *   le premier `200` de `/api/etat` (T1).
 * - Les deux motifs de la porte : « premier-acces » sans jeton connu,
 *   « jeton-refuse » avec un jeton déjà en mémoire (T2).
 * - Le défaut du rechargement (bug-012) : un jeton en `sessionStorage` fait
 *   passer `/api/etat` en `200` sur un déploiement qui exige pourtant un
 *   jeton pour CE demandeur (`jeton_requis: true` dans le corps) —
 *   `EventSource` ne doit JAMAIS être instancié dans ce cas, le sondage
 *   périodique doit l'être (T3).
 * - Le chemin normal : `jeton_requis: false` → `EventSource` instancié, pas
 *   de sondage périodique démarré (T4).
 * - La jauge n'annonce « reconnexion » que quand une reconnexion est
 *   RÉELLEMENT possible, c.-à-d. seulement sur le chemin `EventSource` (T5).
 *
 * Ce que ce harnais NE peut PAS établir : le rendu visuel réel, ni le
 * comportement d'un VRAI `EventSource` de navigateur face à un 401 (aucun
 * navigateur ici — voir le rapport de fin de tâche, « hypothèse non
 * vérifiée »).
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
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = "";
    this.title = "";
    this.type = "";
    this.htmlFor = "";
    this.autocomplete = "";
    this.id = "";
    this.selected = false;
    this.scrollTop = 0;
    this.scrollHeight = 0;
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
  get childNodes() { return this.children; }
  get firstChild() { return this.children.length ? this.children[0] : null; }
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
// tenus à jour à la main, PAS lus depuis le HTML (le harnais reste un
// script isolé, sans parseur HTML : ADR-0006).
const IDS = [
  "agents", "bandeau-hote", "bandeau-hote-bouton", "bandeau-hote-texte",
  "compteur-specs", "compteur-workflows", "fichiers", "filtre",
  "filtre-divergences", "horodatage", "jauge-flux", "jauge-git",
  "jauge-pilotage", "kanban", "note-agents", "pilotage-corps", "porte-aide",
  "porte-bouton", "porte-champ", "porte-corps", "porte-erreur",
  "porte-jeton", "porte-titre", "projet", "prompt", "systeme", "timeline",
  "tiroir", "tiroir-contenu", "tiroir-fermer", "tiroir-titre",
  "titre-demande", "titre-pilotage", "workflows",
];
// Cachés par défaut dans le HTML (attribut `hidden` présent sur le balisage
// d'origine) — voir index.html.
const CACHES_PAR_DEFAUT = new Set(["bandeau-hote", "tiroir", "porte-jeton", "porte-erreur"]);

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

let _sourceAppJs = null;
function chargerAppJS(bac) {
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

function corpsEtat(jetonRequis, overrides) {
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
    jeton_requis: jetonRequis,
    horodatage: "2026-09-14T12:00:00Z",
  }, overrides || {});
}

function enfilerEtat(bac, status, body) {
  bac.reponsesFetch.push({
    predicat: (url) => String(url).indexOf("/api/etat") === 0,
    repondre: async () => ({ status, body }),
  });
}

function enfilerEtatDifferee(bac) {
  let resoudre;
  const promesse = new Promise((r) => { resoudre = r; });
  bac.reponsesFetch.push({
    predicat: (url) => String(url).indexOf("/api/etat") === 0,
    repondre: async () => promesse,
  });
  return (status, body) => resoudre({ status, body });
}

// ------------------------------------------------------------- scénarios --

async function testAucunRenduAvantUn200() {
  const bac = creerBac();
  const resoudre = enfilerEtatDifferee(bac);
  chargerAppJS(bac);
  await attendreMicrotaches();
  await attendreMicrotaches();

  check("T1_aucun_rendu_avant_200_projet_vide",
    bac.$("projet").textContent === "",
    "obtenu : " + JSON.stringify(bac.$("projet").textContent));
  check("T1_aucun_rendu_avant_200_agents_vide",
    bac.$("agents").children.length === 0,
    "obtenu " + bac.$("agents").children.length + " enfant(s)");
  check("T1_aucun_flux_ouvert_avant_200",
    bac.appelsEventSource.length === 0 && bac.appelsSetInterval.length === 0);

  resoudre(200, corpsEtat(false));
  await attendreMicrotaches();
  await attendreMicrotaches();
  await attendreMicrotaches();

  check("T1_rendu_apres_200_projet",
    bac.$("projet").textContent === "MonProjet",
    "obtenu : " + JSON.stringify(bac.$("projet").textContent));
}

async function testPorteMotifPremierAcces() {
  const bac = creerBac();
  enfilerEtat(bac, 401, null);
  chargerAppJS(bac);
  await attendreMicrotaches();
  await attendreMicrotaches();

  check("T2_porte_ouverte_sans_jeton_connu", bac.$("porte-jeton").hidden === false);
  check("T2_porte_titre_premier_acces",
    bac.$("porte-titre").textContent === "Authentification requise",
    "obtenu : " + JSON.stringify(bac.$("porte-titre").textContent));
}

async function testPorteMotifJetonRefuse() {
  const bac = creerBac();
  bac.sessionStorageDonnees["pilotage_jeton"] = "un-jeton-perime";
  enfilerEtat(bac, 401, null);
  chargerAppJS(bac);
  await attendreMicrotaches();
  await attendreMicrotaches();

  check("T2_porte_ouverte_avec_jeton_perime", bac.$("porte-jeton").hidden === false);
  check("T2_porte_titre_jeton_refuse",
    bac.$("porte-titre").textContent === "Reconnexion nécessaire",
    "obtenu : " + JSON.stringify(bac.$("porte-titre").textContent));
}

// -- T3 : LE défaut de bug-012 — rechargement, jeton en mémoire valide,
// déploiement qui exige un jeton (jeton_requis: true malgré le 200) --------
async function testRechargementJetonMemoireExigeSondage() {
  const bac = creerBac();
  bac.sessionStorageDonnees["pilotage_jeton"] = "jeton-valide";
  enfilerEtat(bac, 200, corpsEtat(true));
  chargerAppJS(bac);
  await attendreMicrotaches();
  await attendreMicrotaches();
  await attendreMicrotaches();

  check("T3_aucun_EventSource_quand_jeton_requis",
    bac.appelsEventSource.length === 0,
    "obtenu " + bac.appelsEventSource.length + " EventSource instancié(s)");
  const sondage10s = bac.appelsSetInterval.find((a) => a.ms === 10000);
  check("T3_sondage_periodique_demarre", !!sondage10s,
    "intervalles enregistrés : " + JSON.stringify(bac.appelsSetInterval.map((a) => a.ms)));
  check("T3_jauge_flux_classe_sondage",
    bac.$("jauge-flux").className === "jauge sondage",
    "obtenu : " + JSON.stringify(bac.$("jauge-flux").className));
  check("T3_jauge_flux_jamais_reconnexion",
    bac.$("jauge-flux").textContent.indexOf("reconnexion") === -1,
    "obtenu : " + JSON.stringify(bac.$("jauge-flux").textContent));
}

// -- T4 : chemin normal, jeton non exigé --> EventSource, pas de sondage ---
async function testCheminNormalEventSource() {
  const bac = creerBac();
  enfilerEtat(bac, 200, corpsEtat(false));
  chargerAppJS(bac);
  await attendreMicrotaches();
  await attendreMicrotaches();
  await attendreMicrotaches();

  check("T4_EventSource_instancie_quand_jeton_non_requis",
    bac.appelsEventSource.length === 1,
    "obtenu " + bac.appelsEventSource.length);
  const sondage10s = bac.appelsSetInterval.find((a) => a.ms === 10000);
  check("T4_aucun_sondage_periodique_demarre", !sondage10s);
}

// -- T5 : la jauge PEUT annoncer « reconnexion », mais seulement quand un
// EventSource réel existe et se rompt (source.onerror) -------------------
async function testReconnexionSeulementSiEventSource() {
  const bac = creerBac();
  enfilerEtat(bac, 200, corpsEtat(false));
  chargerAppJS(bac);
  await attendreMicrotaches();
  await attendreMicrotaches();
  await attendreMicrotaches();

  check("T5_precondition_EventSource_instancie", bac.appelsEventSource.length === 1);
  const source = bac.appelsEventSource[0];
  if (source && typeof source.onerror === "function") {
    source.onerror();
  }
  check("T5_reconnexion_annoncee_si_EventSource_rompu",
    bac.$("jauge-flux").textContent.indexOf("reconnexion") !== -1,
    "obtenu : " + JSON.stringify(bac.$("jauge-flux").textContent));
}

async function main() {
  await testAucunRenduAvantUn200();
  await testPorteMotifPremierAcces();
  await testPorteMotifJetonRefuse();
  await testRechargementJetonMemoireExigeSondage();
  await testCheminNormalEventSource();
  await testReconnexionSeulementSiEventSource();

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
