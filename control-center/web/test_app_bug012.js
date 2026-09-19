"use strict";
/* Harnais headless pour `control-center/web/app.js` — bug-012, ADR-0020, et
 * feature-010 (§8/§9/§10 — les trois états d'affichage manquants du tableau
 * de bord).
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
 * Étendu plutôt que dédoublé (feature-010) : un harnais de plus est une
 * suite de plus à découvrir par la CI pour rien — celui-ci fournit déjà tout
 * le bac à sable nécessaire.
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
 * - [10] `.maillon.sans-cloture` : un segment `etat: "sans_cloture"` ne porte
 *   ni `.en-cours` ni `.echec`, affiche « ⋯ fin non observée depuis … », et le
 *   repli d'un backend SANS le champ `etat` (plus ancien) reste inchangé (T6).
 * - [9] `imbrication_suspectee` se rend en `.attendu` (gris), jamais
 *   `.alerte` (ambre), et le mot « imbrication » a disparu du texte visible
 *   comme de l'infobulle (T7).
 * - [8] Le rebouclage réel — un agent qui réapparaît après qu'un AUTRE
 *   sous-agent l'a suivi — porte `.wf-notes.reboucle` et `.maillon.repris` ;
 *   un simple passage de l'agent principal entre deux appels du MÊME agent
 *   n'est PAS un rebouclage : le bandeau `.reboucle` ne s'affiche pas, une
 *   mention neutre (`.attendu`) le remplace (T8, cas positif ET négatif
 *   dans le même test — le bandeau ne suit plus `wf.reprises` seul, il
 *   suit la détection réelle sur les segments).
 * - feature-010 §A2 : le bandeau ne NOMME que les agents réellement ancrés par
 *   `indicesRepris` — un workflow MIXTE (un vrai rebouclage sur `debugger`
 *   ET une simple réapparition de `frontend-developer` après le seul
 *   agent principal, dans la MÊME chaîne) affiche le bandeau ambre pour
 *   `debugger` et la mention neutre pour `frontend-developer`, jamais
 *   l'inverse ni les deux noms mélangés dans le même bloc.
 *
 * Ce que ce harnais NE peut PAS établir : le rendu visuel réel (couleurs,
 * bordures pointillées), ni le comportement d'un VRAI `EventSource` de
 * navigateur face à un 401 (aucun navigateur ici — voir le rapport de fin de
 * tâche, « hypothèse non vérifiée » sauf capture headless produite à part).
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
    // feature-016 : app.js pose désormais `.style.color`/`.style.background`
    // (identité de couleur d'agent, §8 du design system) — un objet nu
    // suffit, `.style` n'a besoin d'aucun comportement CSSOM réel ici.
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
//
// ⚠️ Piège mesuré (PIEGES.md §7) : cette liste tenue à la main a laissé
// passer, sans échec, l'arrivée de la navigation à sections (feature-019) —
// `nav-sections`, les six onglets, les six sections et leurs six titres,
// PLUS `barre` (ajouté en revue pour `--hauteur-barre`) manquaient encore ici
// pendant tout le cycle : chaque `if (section) …`/`if (onglet) …` de
// `appliquerSection` (app.js) avalait silencieusement un `getElementById`
// retombé à `null`, et la suite restait verte sur une navigation totalement
// inerte. Complété le 2026-09-15 (revue) — comparé par exécution à
// `grep -oE 'id="[a-zA-Z0-9-]+"' index.html`, pas recopié à l'œil.
const IDS = [
  "agents", "bandeau-hote", "bandeau-hote-bouton", "bandeau-hote-texte",
  "barre", "bascule-theme", "bouton-generer-brouillon", "compteur-prompt",
  "compteur-specs", "derogation-minimale", "erreur-generer-brouillon",
  "fichiers", "filtre", "filtre-divergences", "horodatage",
  "icone-systeme-clair", "icone-systeme-sombre", "jauge-flux", "jauge-git",
  "jauge-pilotage", "kanban", "legende-cycles", "nav-sections", "note-agents",
  "pied-cycles", "pilotage-corps", "porte-aide", "porte-bouton",
  "porte-champ", "porte-corps", "porte-erreur", "porte-jeton", "porte-titre",
  "projet", "prompt", "redaction-corps", "systeme", "theme-clair",
  "theme-sombre", "theme-systeme", "timeline", "tiroir", "tiroir-contenu",
  "tiroir-fermer", "tiroir-titre", "titre-besoin", "titre-cycles", "titre-demande",
  "titre-pilotage", "workflows",
].concat(["agents", "systeme", "developper", "cycles", "fichiers", "evenements"]
  .flatMap((s) => ["onglet-" + s, "section-" + s, "titre-section-" + s]));
// Cachés par défaut dans le HTML (attribut `hidden` présent sur le balisage
// d'origine) — voir index.html.
const CACHES_PAR_DEFAUT = new Set([
  "bandeau-hote", "tiroir", "porte-jeton", "porte-erreur", "icone-systeme-sombre",
  "section-systeme", "section-developper", "section-cycles", "section-fichiers",
  "section-evenements", "erreur-generer-brouillon",
]);

// Garde structurelle contre la RÉCURRENCE du piège ci-dessus (§7) : `IDS`
// reste tenue à la main (le bac à sable n'a pas de parseur HTML complet),
// mais on la COMPARE ici, par exécution, à ce que `index.html` porte
// RÉELLEMENT — dans les deux sens. Un identifiant ajouté au HTML et oublié
// ici, ou retiré du HTML et laissé ici, fait échouer CE test, pas la suite
// entière en silence.
(function testListeIdsAJourAvecLeHtmlReel() {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const idsHtml = new Set((html.match(/\bid="[a-zA-Z0-9-]+"/g) || [])
    .map((m) => m.slice(4, -1)));
  const idsListe = new Set(IDS);
  const manquants = [...idsHtml].filter((id) => !idsListe.has(id));
  const perimes = [...idsListe].filter((id) => !idsHtml.has(id));
  check("prealable_IDS_couvre_tous_les_id_du_html", manquants.length === 0,
    manquants.length + " manquant(s) : " + manquants.join(", "));
  check("prealable_IDS_ne_contient_aucun_id_perime", perimes.length === 0,
    perimes.length + " périmé(s) : " + perimes.join(", "));
})();

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
    // `createElementNS` — un simple `FakeNode` suffit ici, ce module n'a
    // besoin d'aucun comportement SVG spécifique pour ces suites (qui ne
    // testent pas le diagramme lui-même, voir `test_app_diagramme.js`).
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
  // — chargé ICI, dans le MÊME contexte `vm`, avant `app.js`, exactement
  // comme `index.html` charge les deux `<script>` dans cet ordre.
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

// ------------------------------------------------- utilitaires feature-010 --
function classes(noeud) { return (noeud.className || "").split(/\s+/).filter(Boolean); }
function aClasse(noeud, c) { return classes(noeud).indexOf(c) !== -1; }
function tousLesNoeuds(racine) {
  const resultat = [];
  (function parcourir(n) {
    resultat.push(n);
    (n.children || []).forEach(parcourir);
  })(racine);
  return resultat;
}
function maillonsWorkflows(bac) {
  return tousLesNoeuds(bac.$("workflows")).filter((n) => aClasse(n, "maillon"));
}
function notesWorkflows(bac, classe) {
  return tousLesNoeuds(bac.$("workflows"))
    .filter((n) => aClasse(n, "wf-notes") && (!classe || aClasse(n, classe)));
}
async function chargerAvecEtat(overrides) {
  const bac = creerBac();
  enfilerEtat(bac, 200, corpsEtat(false, overrides));
  chargerAppJS(bac);
  await attendreMicrotaches();
  await attendreMicrotaches();
  await attendreMicrotaches();
  return bac;
}

// -- T6 [10] : `.maillon.sans-cloture` — ni `.en-cours` ni `.echec`, libellé
// « fin non observée », et repli fidèle sur un backend sans champ `etat` ---
async function testSansCloture() {
  const ilYA22h = new Date(Date.now() - 22 * 3600 * 1000).toISOString();
  const workflow = {
    session_id: "abcdefgh1234", fin_observee_absente: true, cycles_dans_la_session: 1,
    debut: "2026-09-13T20:00:00.000Z", fin_observee: ilYA22h, fichiers: [],
    segments: [
      {
        type: "sousagent", agent: "test-engineer", termine: false, etat: "sans_cloture",
        derniere_activite: ilYA22h, duree_ms: null, fichiers: [], echecs: 2,
      },
      {
        // Backend antérieur au correctif bug-013 : pas de champ `etat` du
        // tout. Le comportement HISTORIQUE (`.en-cours` sur tout segment
        // ouvert) doit rester intact — aucune affirmation nouvelle par défaut.
        type: "sousagent", agent: "debugger", termine: false,
        duree_ms: null, fichiers: [], echecs: 0,
      },
    ],
    reprises: {}, commandes: {}, imbrication_suspectee: false, fermetures_orphelines: 0,
  };
  const bac = await chargerAvecEtat({ workflows: [workflow] });
  const [m1, m2] = maillonsWorkflows(bac);

  check("T6_sans_cloture_porte_la_classe", aClasse(m1, "sans-cloture"),
    "classes obtenues : " + classes(m1).join(" "));
  check("T6_sans_cloture_jamais_en_cours", !aClasse(m1, "en-cours"));
  check("T6_sans_cloture_jamais_echec_meme_avec_des_echecs", !aClasse(m1, "echec"),
    "classes obtenues : " + classes(m1).join(" ") + " (echecs=2 dans la donnée)");
  const libelle = m1.textContent;
  check("T6_libelle_fin_non_observee", libelle.indexOf("fin non observée depuis") !== -1,
    "obtenu : " + JSON.stringify(libelle));
  check("T6_libelle_ne_dit_jamais_en_cours", libelle.indexOf("en cours") === -1,
    "obtenu : " + JSON.stringify(libelle));

  check("T6_backend_sans_champ_etat_repli_en_cours", aClasse(m2, "en-cours"),
    "classes obtenues : " + classes(m2).join(" "));
  check("T6_backend_sans_champ_etat_jamais_sans_cloture", !aClasse(m2, "sans-cloture"));
}

// -- T7 [9] : imbrication_suspectee — rendu neutre, jamais accusateur, jamais
// le mot « imbrication » dans le texte affiché -----------------------------
async function testImbricationDevientOrdreApproximatif() {
  const workflow = {
    session_id: "11112222", fin_observee_absente: false, cycles_dans_la_session: 1,
    debut: "2026-09-13T20:00:00.000Z", fin_observee: "2026-09-13T20:05:00.000Z", fichiers: [],
    segments: [], reprises: {}, commandes: {},
    imbrication_suspectee: true, fermetures_orphelines: 0,
  };
  const bac = await chargerAvecEtat({ workflows: [workflow] });
  const attendues = notesWorkflows(bac, "attendu");
  const alertes = notesWorkflows(bac, "alerte");

  check("T7_rendu_en_attendu_pas_en_alerte", attendues.length === 1 && alertes.length === 0,
    "attendu(s) : " + attendues.length + ", alerte(s) directe(s) sur wf-notes : " + alertes.length);
  const texte = attendues.length ? attendues[0].textContent : "";
  check("T7_libelle_nomme_la_vraie_cause", texte.indexOf("ordre approximatif") !== -1,
    "obtenu : " + JSON.stringify(texte));
  check("T7_libelle_ne_dit_plus_jamais_imbrication",
    texte.toLowerCase().indexOf("imbrication") === -1,
    "obtenu : " + JSON.stringify(texte));
  const titre = attendues.length ? tousLesNoeuds(attendues[0]).map((n) => n.title || "").join(" ") : "";
  check("T7_infobulle_ne_dit_pas_non_plus_imbrication",
    titre.toLowerCase().indexOf("imbrication") === -1,
    "obtenu : " + JSON.stringify(titre));
}

// -- T8 [8] : rebouclage réel vs. enchaînement normal — LA distinction
// jamais vérifiée sur un vrai cas (positif ET négatif dans le même test) --
async function testRebouclageAncreDansLaChaine() {
  const seg = (type, agent, extra) => Object.assign({
    type, agent, termine: true, etat: "termine", duree_ms: 500, fichiers: [], echecs: 0,
  }, type === "principal" ? { outils: 1 } : {}, extra || {});

  // Positif : test-engineer → debugger → test-engineer. Un AUTRE sous-agent
  // (debugger) s'est intercalé : c'est un vrai rebouclage.
  const workflowPositif = {
    session_id: "aaaa1111", fin_observee_absente: false, cycles_dans_la_session: 1,
    debut: "2026-09-13T20:00:00.000Z", fin_observee: "2026-09-13T20:10:00.000Z", fichiers: [],
    segments: [
      seg("principal", "(agent principal)"),
      seg("sousagent", "test-engineer"),
      seg("principal", "(agent principal)"),
      seg("sousagent", "debugger"),
      seg("principal", "(agent principal)"),
      seg("sousagent", "test-engineer"),
    ],
    reprises: { "test-engineer": 2 }, commandes: {},
    imbrication_suspectee: false, fermetures_orphelines: 0,
  };

  // Négatif : debugger → (agent principal seul) → debugger. AUCUN autre
  // sous-agent ne s'est intercalé — l'orchestration normale ne doit jamais
  // se lire comme un rebouclage.
  const workflowNegatif = {
    session_id: "bbbb2222", fin_observee_absente: false, cycles_dans_la_session: 1,
    debut: "2026-09-13T21:00:00.000Z", fin_observee: "2026-09-13T21:05:00.000Z", fichiers: [],
    segments: [
      seg("sousagent", "debugger"),
      seg("principal", "(agent principal)"),
      seg("sousagent", "debugger"),
    ],
    reprises: { debugger: 2 }, commandes: {},
    imbrication_suspectee: false, fermetures_orphelines: 0,
  };

  const bac = await chargerAvecEtat({ workflows: [workflowNegatif, workflowPositif] });
  // `rendreCycles` (feature-016 ; anciennement `rendreWorkflows`) affiche
  // `etat.workflows.slice().reverse()` : le premier bloc DOM rendu est donc
  // `workflowPositif` (le dernier de la liste fournie).
  const tousMaillons = maillonsWorkflows(bac);
  // Le bandeau `.wf-notes.reboucle` ne doit se déclencher QUE si
  // `indicesRepris` a réellement marqué un maillon (`.repris`) — jamais sur
  // la seule présence de `wf.reprises`. Sur le NÉGATIF, `wf.reprises` vaut
  // pourtant `{debugger: 2}` : sans ce garde, le bandeau s'affichait là où
  // la détection elle-même dit qu'il n'y a pas de rebouclage (bug trouvé sur
  // capture, pas par ce test — c'est précisément le trou qu'il comble).
  const bandeaux = notesWorkflows(bac, "reboucle");

  check("T8_bandeau_reboucle_seulement_sur_le_positif", bandeaux.length === 1,
    "obtenu " + bandeaux.length);
  const texteBandeaux = bandeaux.map((b) => b.textContent).join(" | ");
  check("T8_bandeau_contient_fleche_reboucle", texteBandeaux.indexOf("↻") !== -1,
    "obtenu : " + JSON.stringify(texteBandeaux));
  check("T8_bandeau_cite_lagent_et_le_compte",
    texteBandeaux.indexOf("test-engineer ×2") !== -1,
    "obtenu : " + JSON.stringify(texteBandeaux));

  // Le NÉGATIF ne porte aucun `.wf-notes.reboucle` : la réapparition de
  // `debugger` après le seul agent principal reste nommée, mais dans une
  // mention neutre (`.attendu`), pas dans la bande ambre du rebouclage.
  const attendues = notesWorkflows(bac, "attendu");
  const noteNegative = attendues.filter(
    (n) => n.textContent.indexOf("debugger ×2") !== -1);
  check("T8_negatif_porte_une_mention_neutre_pas_le_bandeau",
    noteNegative.length === 1,
    "note(s) neutre(s) citant debugger ×2 : " + noteNegative.length);
  if (noteNegative.length) {
    check("T8_mention_neutre_ne_dit_pas_reboucle",
      noteNegative[0].textContent.indexOf("↻") === -1
      && noteNegative[0].textContent.toLowerCase().indexOf("reboucle") === -1,
      "obtenu : " + JSON.stringify(noteNegative[0].textContent));
  }

  // Sur le workflow POSITIF (rendu en premier, 6 maillons) : seul le
  // DEUXIÈME maillon "test-engineer" (après le debugger intercalé) est
  // `.repris` — pas le premier.
  const positifs = tousMaillons.slice(0, 6);
  const testEngineerMaillons = positifs.filter((m) => m.textContent.indexOf("test-engineer") !== -1);
  check("T8_deux_maillons_test_engineer_sur_le_positif", testEngineerMaillons.length === 2,
    "obtenu " + testEngineerMaillons.length);
  if (testEngineerMaillons.length === 2) {
    check("T8_premier_test_engineer_pas_repris", !aClasse(testEngineerMaillons[0], "repris"),
      "classes : " + classes(testEngineerMaillons[0]).join(" "));
    check("T8_second_test_engineer_est_repris", aClasse(testEngineerMaillons[1], "repris"),
      "classes : " + classes(testEngineerMaillons[1]).join(" "));
  }

  // Sur le workflow NÉGATIF (rendu en second, 3 maillons) : AUCUN `.repris`,
  // même si `wf.reprises` vaut `{debugger: 2}` côté backend — seul un AUTRE
  // sous-agent intercalé fait foi côté rendu.
  const negatifs = tousMaillons.slice(6);
  const aucunRepris = negatifs.every((m) => !aClasse(m, "repris"));
  check("T8_enchainement_normal_jamais_repris", aucunRepris,
    "classes : " + negatifs.map((m) => classes(m).join(" ")).join(" | "));
}

// -- feature-010 §A2 : le bandeau ne doit NOMMER que les agents réellement marqués
// par `indicesRepris` — jamais recopier `wf.reprises` brut. Cas MIXTE, tel
// qu'observé sur le tableau de bord réel : un vrai rebouclage (debugger,
// intercalé par test-engineer) coexiste, dans la MÊME chaîne, avec une
// simple réapparition après le seul agent principal (frontend-developer).
// `wf.reprises` cite les deux ; le rendu doit les séparer.
async function testBandeauNommeSeulementLesAgentsAncres() {
  const seg = (type, agent, extra) => Object.assign({
    type, agent, termine: true, etat: "termine", duree_ms: 500, fichiers: [], echecs: 0,
  }, type === "principal" ? { outils: 1 } : {}, extra || {});

  const workflow = {
    session_id: "cccc3333", fin_observee_absente: false, cycles_dans_la_session: 1,
    debut: "2026-09-14T09:00:00.000Z", fin_observee: "2026-09-14T09:20:00.000Z", fichiers: [],
    segments: [
      seg("principal", "(agent principal)"),
      seg("sousagent", "frontend-developer"),
      seg("principal", "(agent principal)"),
      seg("sousagent", "frontend-developer"), // repasse APRÈS le seul principal : pas un rebouclage
      seg("principal", "(agent principal)"),
      seg("sousagent", "debugger"),
      seg("principal", "(agent principal)"),
      seg("sousagent", "test-engineer"),      // s'intercale : le prochain debugger EST un rebouclage
      seg("principal", "(agent principal)"),
      seg("sousagent", "debugger"),
    ],
    reprises: { "frontend-developer": 2, debugger: 2 }, commandes: {},
    imbrication_suspectee: false, fermetures_orphelines: 0,
  };

  const bac = await chargerAvecEtat({ workflows: [workflow] });

  const bandeaux = notesWorkflows(bac, "reboucle");
  check("F010_un_seul_bandeau_reboucle", bandeaux.length === 1,
    "obtenu " + bandeaux.length);
  const texteBandeau = bandeaux.map((b) => b.textContent).join(" | ");
  check("F010_bandeau_nomme_debugger", texteBandeau.indexOf("debugger ×2") !== -1,
    "obtenu : " + JSON.stringify(texteBandeau));
  check("F010_bandeau_ne_nomme_pas_frontend_developer",
    texteBandeau.indexOf("frontend-developer") === -1,
    "obtenu : " + JSON.stringify(texteBandeau));

  const attendues = notesWorkflows(bac, "attendu");
  const texteAttendues = attendues.map((n) => n.textContent).join(" | ");
  check("F010_mention_neutre_nomme_frontend_developer",
    texteAttendues.indexOf("frontend-developer ×2") !== -1,
    "obtenu : " + JSON.stringify(texteAttendues));
  check("F010_mention_neutre_ne_nomme_pas_debugger",
    texteAttendues.indexOf("debugger") === -1,
    "obtenu : " + JSON.stringify(texteAttendues));
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

/* feature-015 (revue code-reviewer) : le groupe `role="radiogroup"` de la
 * bascule de thème doit honorer le motif WAI-ARIA complet — pas seulement
 * gauche/droite. On vérifie la cible du focus (le vrai signal de « quel
 * bouton la touche a sélectionné »), pas `aria-checked` : le faux DOM ne
 * modélise pas `document.documentElement`, donc `positionActiveTheme()` y
 * retombe toujours sur « système » — c'est une limite du harnais, pas du
 * code (voir le commentaire de `attributeThemeActuel` dans app.js). */
function espionnerFocus(bouton) {
  bouton._focusAppels = 0;
  bouton.focus = () => { bouton._focusAppels += 1; };
}

function declencherKeydown(bouton, touche) {
  let empeche = false;
  const evenement = { key: touche, preventDefault: () => { empeche = true; } };
  (bouton._listeners.keydown || []).forEach((gestionnaire) => gestionnaire(evenement));
  return empeche;
}

async function testBasculeThemeClavierMotifComplet() {
  const bac = creerBac();
  chargerAppJS(bac);

  const clair = bac.$("theme-clair");
  const systeme = bac.$("theme-systeme");
  const sombre = bac.$("theme-sombre");
  [clair, systeme, sombre].forEach(espionnerFocus);

  declencherKeydown(clair, "ArrowDown");
  check("clavier_ArrowDown_deplace_vers_systeme",
    systeme._focusAppels === 1 && clair._focusAppels === 0 && sombre._focusAppels === 0);

  declencherKeydown(systeme, "ArrowUp");
  check("clavier_ArrowUp_revient_a_clair", clair._focusAppels === 1);

  declencherKeydown(clair, "End");
  check("clavier_End_va_au_dernier_sombre", sombre._focusAppels === 1);

  declencherKeydown(sombre, "Home");
  check("clavier_Home_revient_au_premier_clair", clair._focusAppels === 2);

  declencherKeydown(clair, "ArrowRight");
  check("clavier_ArrowRight_deplace_vers_systeme", systeme._focusAppels === 2);

  declencherKeydown(systeme, "ArrowLeft");
  check("clavier_ArrowLeft_revient_a_clair", clair._focusAppels === 3);

  // Rebouclage aux extrémités : ArrowDown/ArrowRight depuis le dernier
  // bouton revient au premier, ArrowUp/ArrowLeft depuis le premier va au
  // dernier — un `role="radiogroup"` ne s'arrête jamais en bout de liste.
  declencherKeydown(sombre, "ArrowDown");
  check("clavier_ArrowDown_reboucle_du_dernier_au_premier", clair._focusAppels === 4);
  declencherKeydown(clair, "ArrowUp");
  check("clavier_ArrowUp_reboucle_du_premier_au_dernier", sombre._focusAppels === 2);

  check("clavier_preventDefault_sur_touche_geree", declencherKeydown(clair, "Home"));
  const focusAvant = { c: clair._focusAppels, s: systeme._focusAppels, d: sombre._focusAppels };
  const empeche = declencherKeydown(clair, "Enter");
  check("clavier_touche_non_geree_ignoree",
    !empeche && clair._focusAppels === focusAvant.c
    && systeme._focusAppels === focusAvant.s && sombre._focusAppels === focusAvant.d);
}

async function main() {
  await testAucunRenduAvantUn200();
  await testPorteMotifPremierAcces();
  await testPorteMotifJetonRefuse();
  await testRechargementJetonMemoireExigeSondage();
  await testCheminNormalEventSource();
  await testSansCloture();
  await testImbricationDevientOrdreApproximatif();
  await testRebouclageAncreDansLaChaine();
  await testBandeauNommeSeulementLesAgentsAncres();
  await testReconnexionSeulementSiEventSource();
  await testBasculeThemeClavierMotifComplet();

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
