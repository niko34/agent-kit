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
  // `ouvrirTiroir` (app.js) appelle `.focus()` SANS garde de type sur
  // `#tiroir-fermer` — no-op nécessaire pour exercer ce chemin (M5).
  focus() {}
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
// Comparée par exécution à `grep -oE 'id="[a-zA-Z0-9-]+"' index.html`, pas
// recopiée à l'œil (PIEGES §7). Resynchronisée au lot 3 (feature-021,
// cycle 2, F7) : `nav-sections`/les six `onglet-*`/`section-*`/
// `titre-section-*` disparaissent avec la navigation à onglets ; les 25 id
// « adopté » de F0 (structure mono-écran, bottom sheet, connecteurs du
// graphe) et les nouveaux titres de bloc (`titre-agents`, `titre-systeme`,
// `titre-fichiers`, `titre-evenements`) entrent.
// Resynchronisée à nouveau au lot A1 de feature-028 (U1 de feature-021
// appliquée) : `agents`/`note-agents`/`titre-agents`, `compteur-prompt`,
// `timeline`/`titre-evenements` retirés (sections disparues) ;
// `voir-evenements-passage` ajouté (tranche d'événements d'un passage,
// ouverte dans le tiroir existant).
// Resynchronisée une troisième fois (feature-028, décision humaine du
// 2026-09-23, AU-DELÀ de U1) : `systeme`/`titre-systeme` retirés à leur
// tour — la section « Système » a disparu entière, retrait sec sans
// migration (contrairement à ce que `U1` réclamait).
// Resynchronisée une quatrième fois (feature-028, décision humaine du
// 2026-09-23, « fichiers ») : `fichiers`/`titre-fichiers` retirés — la
// section « Fichiers touchés » a disparu entière, retrait de capacité
// assumé (« la consultation des diffs ne va nulle part »), `ouvrirDiff`
// retiré avec elle (code mort, plus aucun appelant).
// Resynchronisée une cinquième fois (feature-028, lot A) : `cycle-tab-actif`/
// `cycle-tab-historique` ajoutés — les deux onglets `.tab-button` de
// `.cycle-tabs` reçoivent un id pour être câblés (jusqu'ici décoratifs, 0
// gestionnaire d'événement posé).
const IDS = [
  "a11y-announcement", "account-button", "add-item-dialog", "add-item-form",
  "add-item-intro", "add-item-redaction-corps", "add-item-title", "avatar",
  "backlog-column-count", "backlog-count", "backlog-title", "bandeau-hote",
  "bandeau-hote-bouton", "bandeau-hote-texte", "barre",
  "bouton-generer-item-brouillon",
  "cancel-add-item", "cancel-delete",
  "claude-compositeur-copie", "claude-compositeur-dialog",
  "claude-compositeur-fermer", "claude-compositeur-titre",
  "claude-destinataire", "claude-destinataire-valeur",
  "claude-question", "claude-question-texte", "claude-status", "claude-title",
  "close-add-item", "close-feature", "composer", "composer-etat",
  "compteur-specs", "context-menu", "conversation",
  "conversation-erreur", "conversation-portee", "cycle-canvas",
  "cycle-indice", "cycle-status", "cycle-tab-actif", "cycle-tab-historique",
  "cycle-title", "delete-confirm-aide", "delete-confirm-bouton",
  "delete-confirm-input", "delete-confirm-label", "delete-copy",
  "delete-dialog", "delete-erreur", "delete-item", "delete-title",
  "edit-item", "envoyer-conversation",
  "erreur-generer-item-brouillon",
  "feature-agent", "feature-criteria", "feature-dependency",
  "feature-description", "feature-dialog", "feature-done", "feature-edit",
  "feature-kind", "feature-priority", "feature-status", "feature-title",
  "feature-updated", "filtre", "filtre-divergences",
  "gabarits-adoptes", "horodatage", "item-derogation-minimale",
  "item-description", "item-priority",
  "item-title", "item-type-bug", "item-type-feature",
  "jauge-flux", "jauge-git", "jauge-pilotage", "kanban", "launch-divider",
  "link-front-sec", "link-front-tests",
  "link-front2-review", "link-reprise", "link-sec-front2", "link-spec-front",
  "link-tests-front2", "main-content",
  "menu-interrupt-cycle", "menu-launch-cycle", "motion-note",
  "open-add-item",
  "porte-aide", "porte-bouton", "porte-champ", "porte-corps", "porte-erreur",
  "porte-jeton", "porte-titre", "projet", "prompt",
  "repo-strip", "repo-strip-ok", "repo-strip-texte", "selected-code",
  "selected-duration", "selected-files", "selected-state", "selected-task",
  "selected-title", "selected-tokens", "selected-tools", "sheet-metrics", "sheet-toggle",
  "status-dot", "summary-active", "summary-step",
  "summary-time", "summary-tokens",
  "tiroir", "tiroir-contenu", "tiroir-edition",
  "tiroir-edition-annuler", "tiroir-edition-enregistrer",
  "tiroir-edition-erreur", "tiroir-edition-texte", "tiroir-fermer",
  "tiroir-titre",
  "user-name", "view-details", "voir-evenements-passage",
];
// Cachés par défaut dans le HTML (attribut `hidden` présent sur le balisage
// d'origine) — voir index.html. `section-*` retirés avec la navigation à
// onglets (lot 3) : plus aucune section n'est masquée.
const CACHES_PAR_DEFAUT = new Set([
  "bandeau-hote", "tiroir", "porte-jeton", "porte-erreur",
  "erreur-generer-item-brouillon", "gabarits-adoptes", "repo-strip-ok",
  // feature-025 (lots 9-10) : `hidden` posé sur le balisage d'origine.
  "context-menu", "delete-erreur", "tiroir-edition",
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
  // ⚠️ RECIBLÉ au lot A1 de feature-028 (U1 de feature-021) : `#agents` a
  // disparu avec la section « Agents ». RECIBLÉ À NOUVEAU (feature-028,
  // décision humaine du 2026-09-23) : `#systeme` a disparu à son tour
  // (section entière retirée, migration en pastilles jamais réalisée SANS
  // objet désormais). RECIBLÉ UNE TROISIÈME FOIS (feature-028, décision
  // humaine du 2026-09-23, retrait « fichiers ») : `#fichiers` a disparu
  // avec la section « Fichiers touchés ». RECIBLÉ UNE QUATRIÈME FOIS
  // (feature-028, lot C1, décision humaine 1B) : `#workflows`/`rendreCycles`
  // (l'accordéon « Cycles ») ont disparu à leur tour — `#cycle-canvas`
  // (`rendreGrapheCyclePrincipal`) reste peuplé au MÊME rafraîchissement
  // (voir `rafraichir`, app.js) ; même rôle de sonde ici.
  check("T1_aucun_rendu_avant_200_cycle_canvas_vide",
    bac.$("cycle-canvas").children.length === 0,
    "obtenu " + bac.$("cycle-canvas").children.length + " enfant(s)");
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
// `classes`/`aClasse`/`tousLesNoeuds`/`maillonsWorkflows`/`notesWorkflows`
// SUPPRIMÉES ICI (feature-028, lot C1) : plus aucun appelant depuis le
// retrait des scénarios T6/T7/F010 ci-dessus (accordéon « Cycles » retiré).
async function chargerAvecEtat(overrides) {
  const bac = creerBac();
  enfilerEtat(bac, 200, corpsEtat(false, overrides));
  chargerAppJS(bac);
  await attendreMicrotaches();
  await attendreMicrotaches();
  await attendreMicrotaches();
  return bac;
}

// -- T6/T7/F010 SUPPRIMÉS ICI (feature-028, lot C1) : ces quatre
// scénarios (`.maillon.sans-cloture`, note neutre d'imbrication, bandeau
// de rebouclage nommant les agents ancrés) testaient la CHAÎNE
// TEXTUELLE des segments de l'accordéon « Cycles » — l'une des DEUX
// informations que la décision humaine 1B (2026-09-23) déclare
// explicitement PERDUES en retirant l'accordéon entier, pas un défaut
// de ce lot. `maillonsWorkflows`/`notesWorkflows` retirées avec eux,
// plus aucun appelant.

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

// -- feature-021, cycle 2, lot 7 : identité (GATE S4) et #cycle-title -------
async function testIdentiteGateEtCycleTitle() {
  // Identité CONNUE : avatar + nom réels, jamais « JD »/« Jean Dupont ».
  const bacConnue = await chargerAvecEtat({ identite: "Nicolas Philippe" });

  // S4.2 — initiales dérivées CÔTÉ CLIENT, jamais recopiées d'un exemple.
  // (`app.js` est chargé dans `bacConnue.sandbox` : PIEGES §39, une
  // fonction déclarée `function` au premier niveau du script devient une
  // propriété du sandbox `vm`, contrairement à `let`/`const`.)
  check("S4_2_initiales_deux_mots",
    bacConnue.sandbox.initialesDepuisNom("Nicolas Philippe") === "NP",
    "obtenu : " + JSON.stringify(bacConnue.sandbox.initialesDepuisNom("Nicolas Philippe")));
  check("S4_2_initiales_un_seul_mot", bacConnue.sandbox.initialesDepuisNom("Madonna") === "MA");
  check("S4_2_initiales_espaces_multiples",
    bacConnue.sandbox.initialesDepuisNom("  Ada   Lovelace  ") === "AL");
  check("S4_2_initiales_absence_rend_null",
    bacConnue.sandbox.initialesDepuisNom(null) === null
    && bacConnue.sandbox.initialesDepuisNom("") === null
    && bacConnue.sandbox.initialesDepuisNom("   ") === null);
  check("S4_identite_connue_avatar_initiales",
    bacConnue.$("avatar").textContent === "NP",
    "obtenu : " + JSON.stringify(bacConnue.$("avatar").textContent));
  check("S4_identite_connue_nom_affiche",
    bacConnue.$("user-name").textContent === "Nicolas Philippe");
  check("S4_identite_connue_aria_label_cite_le_nom",
    String(bacConnue.$("account-button")["aria-label"] || "").indexOf("Nicolas Philippe") !== -1,
    "obtenu : " + JSON.stringify(bacConnue.$("account-button")["aria-label"]));
  check("S4_5_account_button_aucun_ecouteur_pose",
    Object.keys(bacConnue.$("account-button")._listeners || {}).length === 0,
    "S4.5 : account-button doit rester INERTE, n'appeler aucune route");

  // Identité ABSENTE : dégrade avec motif, JAMAIS une fabrication.
  const bacAbsente = await chargerAvecEtat({ identite: null });
  check("S4_identite_absente_avatar_pas_dinitiales_fabriquees",
    bacAbsente.$("avatar").textContent !== "NP" && bacAbsente.$("avatar").textContent !== "",
    "obtenu : " + JSON.stringify(bacAbsente.$("avatar").textContent));
  check("S4_identite_absente_nom_affiche_un_motif",
    bacAbsente.$("user-name").textContent === "Identité inconnue");

  // #cycle-title (F0) : JAMAIS une chaîne vide, cible aria-labelledby de
  // `.cycle-surface`. Aucun cycle observé → libellé factuel dédié ; un
  // cycle observé sans titre de spec connu (H4b reste au lot 10) →
  // « Cycle #N », sur la MÊME donnée que la pastille `#cycle-indice`.
  const bacSansCycle = await chargerAvecEtat({ workflows: [] });
  check("cycle_title_aucun_cycle_jamais_vide",
    !!bacSansCycle.$("cycle-title").textContent.trim(),
    "obtenu : " + JSON.stringify(bacSansCycle.$("cycle-title").textContent));
  check("cycle_title_aucun_cycle_libelle_dedie",
    bacSansCycle.$("cycle-title").textContent === "Aucun cycle observé");

  const workflowAvecIndice = {
    session_id: "identite0001", fin_observee_absente: true, cycles_dans_la_session: 1,
    indice_cycle: 42, debut: "2026-09-22T10:00:00.000Z", fin_observee: null,
    fichiers: [], segments: [
      { type: "sousagent", agent: "spec-reader", termine: false, etat: "en_cours",
        duree_ms: null, fichiers: [], echecs: 0 },
    ],
    reprises: {}, commandes: {}, imbrication_suspectee: false, fermetures_orphelines: 0,
  };
  const bacAvecCycle = await chargerAvecEtat({ workflows: [workflowAvecIndice] });
  check("cycle_title_cycle_observe_cycle_hash_n",
    bacAvecCycle.$("cycle-title").textContent === "Cycle #42",
    "obtenu : " + JSON.stringify(bacAvecCycle.$("cycle-title").textContent));
  check("cycle_title_egale_la_pastille_cycle_indice",
    bacAvecCycle.$("cycle-title").textContent === bacAvecCycle.$("cycle-indice").textContent);

  // feature-025 (lots 9-10) : TROISIÈME état — titre de spec CONNU. Une
  // garde écrite au lot 7 aurait été livrée morte (`etat.lancement_spec_id`
  // n'existait pas encore côté serveur) ; elle s'écrit ICI, sur les TROIS
  // états, pas seulement le nouveau — sinon une régression sur les deux
  // premiers passerait inaperçue pendant qu'on prouve le troisième.
  const bacAvecSpecConnue = await chargerAvecEtat({
    workflows: [workflowAvecIndice],
    lancement_spec_id: "feature-042-un-besoin",
    specs: [{ id: "feature-042-un-besoin", titre: "Un besoin précis", colonne: "todo" }],
  });
  check("cycle_title_spec_connue_prime_sur_cycle_hash_n",
    bacAvecSpecConnue.$("cycle-title").textContent === "feature-042-un-besoin · Un besoin précis",
    "obtenu : " + JSON.stringify(bacAvecSpecConnue.$("cycle-title").textContent));

  // `lancement_spec_id` non nul mais SANS titre distinct de l'id (spec sans
  // `## Titre` H1, cf. `specs.py:_titre` — l'id sert de repli) : pas de
  // « · » fabriqué pour rien.
  const bacSpecSansTitreDistinct = await chargerAvecEtat({
    workflows: [workflowAvecIndice],
    lancement_spec_id: "feature-043-sans-titre",
    specs: [{ id: "feature-043-sans-titre", titre: "feature-043-sans-titre", colonne: "todo" }],
  });
  check("cycle_title_spec_connue_sans_titre_distinct_pas_de_point_milieu_fabrique",
    bacSpecSansTitreDistinct.$("cycle-title").textContent === "feature-043-sans-titre",
    "obtenu : " + JSON.stringify(bacSpecSansTitreDistinct.$("cycle-title").textContent));

  // `lancement_spec_id` renvoyé par le serveur mais absent d'`etat.specs`
  // (course : la spec a été déplacée/supprimée entre le lancement et ce
  // relevé) — DÉGRADE sur « Cycle #N », jamais un titre vide ni un crash.
  const bacSpecIdSansCorrespondance = await chargerAvecEtat({
    workflows: [workflowAvecIndice],
    lancement_spec_id: "feature-999-introuvable",
    specs: [],
  });
  check("cycle_title_spec_id_sans_correspondance_degrade_sur_cycle_hash_n",
    bacSpecIdSansCorrespondance.$("cycle-title").textContent === "Cycle #42",
    "obtenu : " + JSON.stringify(bacSpecIdSansCorrespondance.$("cycle-title").textContent));

  // `lancement_spec_id` ABSENT (aucun lancement en cours, ou lancement
  // terminé — `etat.lancement_spec_id` redevient `null` côté serveur dès
  // que `toujours_en_cours()` est faux) : retombe sur l'état 2, jamais un
  // titre périmé conservé côté client.
  check("cycle_title_sans_lancement_spec_id_reste_a_l_etat_2",
    bacAvecCycle.$("cycle-title").textContent === "Cycle #42",
    "non-régression : le scénario SANS lancement_spec_id (ci-dessus) doit rester inchangé");
}

// -- Revue de code, cycle `feature-021` (M5) : le serveur rend trois `409`
// sémantiquement distincts sur `POST /api/spec/modifier` (`gestion_spec.py`
// : « spec close : immuable », « un lancement est en cours sur cette
// spec », empreinte périmée) — CHACUN avec son message exact. Le client ne
// doit JAMAIS fabriquer un diagnostic à leur place : il affiche
// `donnees.erreur` tel quel. Trois messages serveur DISTINCTS, trois
// assertions — la ancienne version affichait le MÊME texte fabriqué
// (« … rechargez-la avant de réessayer ») sur les trois, dont sur une spec
// `done` que rien ne rend modifiable.
async function testModifierSpec409AfficheLeMessageExactDuServeur() {
  const casServeur = [
    "spec close : immuable",
    "un lancement est en cours sur cette spec",
    "empreinte périmée, rechargez la spec",
  ];
  for (const messageServeur of casServeur) {
    const bac = creerBac();
    enfilerEtat(bac, 200, corpsEtat(false, {}));
    chargerAppJS(bac);
    await attendreMicrotaches();
    await attendreMicrotaches();
    await attendreMicrotaches();

    // `editionCourante` est un `let` de niveau supérieur d'`app.js` : PIEGES
    // §39, il ne devient JAMAIS une propriété du sandbox `vm` — l'y écrire
    // directement (`bac.sandbox.editionCourante = …`) crée une propriété
    // ORPHELINE, sans effet sur la variable réellement lue par
    // `surSoumissionEditionSpec`. Seul le flux réel (`ouvrirEditionSpec`,
    // une `async function` déclarée — PIEGES §39, celles-ci DEVIENNENT des
    // propriétés du sandbox) la pose pour de vrai.
    bac.reponsesFetch.push({
      predicat: (url) => String(url).indexOf("/api/spec?id=") === 0,
      repondre: async () => ({ status: 200, body: { contenu: "contenu initial", empreinte: "abc123" } }),
    });
    await bac.sandbox.ouvrirEditionSpec("feature-900-exemple");
    await attendreMicrotaches();

    bac.$("tiroir-edition-texte").value = "contenu modifié";
    bac.reponsesFetch.push({
      predicat: (url, options) => String(url) === "/api/spec/modifier" && options && options.method === "POST",
      repondre: async () => ({ status: 409, body: { erreur: messageServeur } }),
    });

    await bac.sandbox.surSoumissionEditionSpec({ preventDefault: () => {} });
    await attendreMicrotaches();

    const erreur = bac.$("tiroir-edition-erreur");
    check("M5_409_affiche_le_message_exact_du_serveur : " + messageServeur,
      erreur.hidden === false && erreur.textContent === messageServeur,
      "obtenu : " + JSON.stringify(erreur.textContent));
  }
}

async function main() {
  await testAucunRenduAvantUn200();
  await testPorteMotifPremierAcces();
  await testPorteMotifJetonRefuse();
  await testRechargementJetonMemoireExigeSondage();
  await testCheminNormalEventSource();
  await testReconnexionSeulementSiEventSource();
  await testIdentiteGateEtCycleTitle();
  await testModifierSpec409AfficheLeMessageExactDuServeur();

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
