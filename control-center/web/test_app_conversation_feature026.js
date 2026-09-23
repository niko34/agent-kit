"use strict";
/* Gardes D5 (reflet frontend, jamais une "garde") et B1/B2 pour le panneau
 * de conversation (feature-026, écrites AVANT le code — `ADR-0038`, registre
 * `ATTENDU_ROUGE`, désormais VIDE — voir journal de bord, lot 5).
 *
 *     node control-center/web/test_app_conversation_feature026.js
 *
 * Harnais DUPLIQUÉ depuis `test_app_conversation.js` (PIEGES §6 : ces
 * fichiers ne sont pas des modules, on duplique plutôt que de partager) —
 * IDS étendue des TROIS identifiants statiques du lot 5
 * (`#claude-destinataire`, `#claude-destinataire-valeur`,
 * `#conversation-portee`) PLUS les QUATRE de la correction ux-ui-designer
 * étape 5bis (`#claude-compositeur-dialog`, `-titre`, `-copie`, `-fermer` —
 * PIEGES §7 : DEUX harnais portent une liste `IDS` tenue à la main, cf.
 * `test_app_bug012.js`, mis à jour de la même façon).
 *
 * ## Réécriture de la correction (2026-09-22, reboucle « écrire pendant que
 * Claude travaille marche »)
 *
 * `ETAT_backend_fait_foi_jamais_redderive_du_code_HTTP` est INVERSÉ, pas
 * supprimé (PIEGES §30 : un témoin d'écran s'inverse, il ne disparaît pas).
 * MÊME scénario (200, `etat: "Occupée"`) — le verdict attendu change de
 * fond en comble : le badge ne montre PLUS jamais « Occupée » (ux-ui-designer
 * étape 5bis, « Occupée » disparaît du badge), il PLIE sur « En ligne ».
 * L'information n'est pas perdue : trois tests neufs couvrent où elle va
 * (le fil), et que le compositeur ne s'éteint plus pour cette raison.
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

const ATTENDU_ROUGE = {};

function checkRouge(nom, condition, detail) {
  const entree = ATTENDU_ROUGE[nom];
  if (condition) {
    if (entree) {
      _tests += 1;
      _echecs.push(nom + "_ATTENDU_ROUGE_PASSE_SANS_ETRE_RETIRE");
      console.log("  ECHEC  " + nom + " : assertion VERTE mais l'entrée est encore dans ATTENDU_ROUGE (clause 2) — la retirer");
    } else {
      check(nom, true);
    }
  } else {
    if (entree) {
      console.log("  (ATTENDU_ROUGE) " + nom + " : " + (detail || "") + " — clôture " + entree.lotDeCloture);
    } else {
      check(nom, false, detail);
    }
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
    // Correctif « hauteur du panneau » : lus AVANT toute réécriture par
    // `rendreConversation` (jamais posés par défaut à une valeur qui
    // simulerait « déjà en bas » — un bac à sable sans mise en page réelle
    // doit rester silencieux sur cette question, pas inventer un résultat).
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.clientHeight = 0;
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

// Même liste que `test_app_conversation.js` (PIEGES §7 : tenue à la main),
// PLUS les trois ids neufs de feature-026.
// feature-028 (lot A1, U1 de feature-021) : `agents`/`note-agents`/
// `titre-agents`, `compteur-prompt`, `timeline`/`titre-evenements` retirés ;
// `voir-evenements-passage` ajouté. Décision humaine du 2026-09-23,
// AU-DELÀ de U1 (feature-028) : `systeme`/`titre-systeme` retirés à leur
// tour — retrait sec, sans migration. Décision humaine du 2026-09-23,
// « fichiers » : `fichiers`/`titre-fichiers` retirés, `ouvrirDiff` avec eux.
const IDS = [
  "a11y-announcement", "account-button", "avatar",
  "backlog-column-count", "backlog-count", "backlog-title", "bandeau-hote",
  "bandeau-hote-bouton", "bandeau-hote-texte", "barre",
  "bouton-generer-brouillon", "claude-status",
  "claude-compositeur-copie", "claude-compositeur-dialog",
  "claude-compositeur-fermer", "claude-compositeur-titre",
  "claude-destinataire",
  "claude-destinataire-valeur", "conversation-portee",
  "composer", "composer-etat",
  "conversation", "conversation-erreur", "compteur-specs",
  "cycle-canvas", "cycle-indice", "cycle-status", "cycle-title",
  "cycle-tab-actif", "cycle-tab-historique",
  "derogation-minimale", "envoyer-conversation", "erreur-generer-brouillon",
  "filtre", "filtre-divergences", "horodatage", "jauge-flux",
  "jauge-git", "jauge-pilotage", "kanban", "legende-cycles",
  "link-front-sec", "link-front-tests", "link-front2-review", "link-reprise",
  "link-sec-front2", "link-spec-front", "link-tests-front2", "main-content",
  "motion-note", "pied-cycles", "pilotage-corps",
  "porte-aide", "porte-bouton", "porte-champ", "porte-corps", "porte-erreur",
  "porte-jeton", "porte-titre", "projet", "prompt", "redaction-corps",
  "repo-strip", "repo-strip-ok", "repo-strip-texte", "selected-code",
  "selected-duration", "selected-files", "selected-state", "selected-task",
  "selected-title", "selected-tokens", "selected-tools", "sheet-metrics", "sheet-toggle",
  "spec-prompt", "status-dot", "summary-active", "summary-step",
  "summary-time", "summary-tokens", "tiroir", "tiroir-contenu",
  "tiroir-fermer", "tiroir-titre", "titre-besoin",
  "titre-cycles", "titre-demande",
  "titre-pilotage", "user-name", "voir-evenements-passage", "workflows",
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

// Compensation de l'exemption `composer`/`prompt` dans
// `ANCRES_ORDRE_NON_COMPARABLE` (`test_app_fidelite_navigateur.py`,
// correctif « hauteur du panneau ») : cette exemption retire le `top` peint
// comme signal d'ordre pour ces deux ancres (il dépend désormais de la
// hauteur, plafonnée, de `.claude-panel`, plus d'un ordre de lecture) —
// SANS RIEN qui prenne le relais, une régression d'ordre DOM (composeur
// déplacé AU-DESSUS du fil) ne ferait plus échouer AUCUNE suite. Ancré sur
// l'ORDRE DOM (position dans la SOURCE, jamais un `top` peint — c'est
// précisément ce que l'exemption corrige) : le bac à sable `vm` de ce
// fichier ne modélise aucun arbre DOM réel (PIEGES §38), donc lu à même le
// VRAI `index.html`, comme `testIndexHtmlPorteLesTroisIdsNeufs` ci-dessous.
function testOrdreDomConversationPrecedeComposer() {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const iConversation = html.indexOf('id="conversation"');
  const iComposer = html.indexOf('id="composer"');
  check("ORDRE_DOM_conversation_precede_composer",
    iConversation !== -1 && iComposer !== -1 && iConversation < iComposer,
    "conversation@" + iConversation + " composer@" + iComposer);
}

function testPromptEstDescendantDeComposer() {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const iComposerOuvre = html.indexOf('<form class="composer" id="composer">');
  const iComposerFerme = iComposerOuvre !== -1 ? html.indexOf("</form>", iComposerOuvre) : -1;
  const iPrompt = html.indexOf('id="prompt"');
  check("ORDRE_DOM_prompt_descendant_de_composer",
    iComposerOuvre !== -1 && iComposerFerme !== -1 && iPrompt > iComposerOuvre && iPrompt < iComposerFerme,
    "composer[" + iComposerOuvre + "," + iComposerFerme + "] prompt@" + iPrompt);
}

function testIndexHtmlPorteLesTroisIdsNeufs() {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const idsRequis = ["claude-destinataire", "claude-destinataire-valeur", "conversation-portee"];
  const manquants = idsRequis.filter((id) => !new RegExp('id="' + id + '"').test(html));
  checkRouge("INDEX_HTML_porte_les_trois_ids_neufs", manquants.length === 0,
    manquants.length + " id(s) absent(s) d'index.html : " + manquants.join(", "));
}

// Les QUATRE ids du dialogue réactif de la correction étape 5bis — même
// discipline de lecture RÉELLE (jamais une supposition) que le test ci-dessus.
function testIndexHtmlPorteLesQuatreIdsDuDialogueCompositeur() {
  const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
  const idsRequis = ["claude-compositeur-dialog", "claude-compositeur-titre",
    "claude-compositeur-copie", "claude-compositeur-fermer"];
  const manquants = idsRequis.filter((id) => !new RegExp('id="' + id + '"').test(html));
  check("INDEX_HTML_porte_les_quatre_ids_du_dialogue_compositeur", manquants.length === 0,
    manquants.length + " id(s) absent(s) d'index.html : " + manquants.join(", "));
}

// TÉMOIN INVERSÉ (PIEGES §30) — même setup EXACT que l'ancien
// `ETAT_backend_fait_foi_jamais_redderive_du_code_HTTP`, verdict opposé :
// « Occupée » ne doit PLUS JAMAIS apparaître dans le badge (ux-ui-designer,
// étape 5bis). Le badge PLIE sur « En ligne » — jamais une redérivation du
// code HTTP (ce champ RESTE lu depuis le backend, seule la présentation
// change), et ne porte plus aucun `title` heuristique.
async function testOccupeePlieSurEnLigneDansLeBadge() {
  const bac = creerBac();
  await demarrer(bac, {}, { status: 200, body: { messages: [], tronque: false, etat: "Occupée" } });
  const statut = bac.$("claude-status");
  check("OCCUPEE_plie_sur_en_ligne_dans_le_badge",
    statut.textContent.indexOf("Occup") === -1 && statut.textContent.indexOf("En ligne") !== -1,
    "obtenu " + JSON.stringify(statut.textContent));
  check("OCCUPEE_classe_is_en_ligne_pas_is_occupee",
    statut.className.indexOf("is-en-ligne") !== -1 && statut.className.indexOf("is-occupee") === -1,
    "obtenu " + JSON.stringify(statut.className));
  check("OCCUPEE_badge_ne_porte_plus_de_title_heuristique",
    !statut.title, "obtenu " + JSON.stringify(statut.title));
}

// Recherche récursive, sans supposer un INDEX de position parmi les enfants
// (l'avatar précède la bulle dans `rendreMessageActiviteClaude` — indexer en
// dur aurait cherché au mauvais endroit).
function trouverParId(noeud, id) {
  if (!noeud || !Array.isArray(noeud.children)) return null;
  for (const enfant of noeud.children) {
    if (enfant.id === id) return enfant;
    const trouve = trouverParId(enfant, id);
    if (trouve) return trouve;
  }
  return null;
}

// L'information « Claude travaille » n'est pas perdue : elle est DÉPLACÉE
// dans le fil (ux-ui-designer étape 5bis), avec le `title` heuristique qui
// quitte le badge.
async function testClaudeTravailleDansLeFilQuandOccupee() {
  const bac = creerBac();
  await demarrer(bac, {}, { status: 200, body: { messages: [], tronque: false, etat: "Occupée" } });
  const live = trouverParId(bac.$("conversation"), "claude-live-message");
  check("OCCUPEE_le_fil_porte_claude_travaille", !!live,
    "aucun #claude-live-message trouvé dans #conversation");
  if (live) {
    check("OCCUPEE_texte_claude_travaille", live.textContent === "Claude travaille…",
      "obtenu " + JSON.stringify(live.textContent));
    check("OCCUPEE_title_heuristique_sur_l_indicateur_de_fil",
      live.title === "Déterminé par lecture de l'écran (heuristique).",
      "obtenu " + JSON.stringify(live.title));
  }
}

// Le fait qui commande tout ce cycle : le compositeur ne doit PLUS JAMAIS
// être inerte parce que Claude travaille (mesuré sur session jetable
// réelle — `promptSource: "queued"`, rien perdu, rien entrelacé).
async function testComposerJamaisInerteQuandOccupee() {
  const bac = creerBac();
  await demarrer(bac, {}, { status: 200, body: { messages: [], tronque: false, etat: "Occupée" } });
  check("OCCUPEE_champ_prompt_pas_desactive", bac.$("prompt").disabled === false);
  check("OCCUPEE_bouton_envoyer_pas_desactive", bac.$("envoyer-conversation").disabled === false);
  check("OCCUPEE_aucune_raison_occupee_dans_composer_etat",
    bac.$("composer-etat").textContent.indexOf("prompt") === -1,
    "obtenu " + JSON.stringify(bac.$("composer-etat").textContent));
}

// -- 409 réactif, discriminé par `donnees.raison` (correction étape 5bis) --

async function testDialogue409CompositeurIntrouvableOuvreLeDialogueDedie() {
  const bac = creerBac();
  await demarrer(bac, {}, { status: 200, body: { messages: [], tronque: false } });
  bac.$("prompt").value = "un message en cours de frappe";
  bac.$("claude-compositeur-dialog").hidden = true; // état FERMÉ simulé avant l'envoi
  bac.reponsesFetch.push({
    predicat: (url, options) => String(url) === "/api/conversation" && options && options.method === "POST",
    repondre: async () => ({
      status: 409,
      body: {
        erreur: "aucun compositeur identifiable (dialogue en cours) (heuristique) — texte non envoyé",
        raison: "compositeur_introuvable", heuristique: true, envoye: false,
        destinataire: "session tmux 'claude-kit'",
      },
    }),
  });
  bac.$("composer").dispatchSubmit();
  for (let i = 0; i < 6; i += 1) await attendreMicrotaches();

  check("409_COMPOSITEUR_INTROUVABLE_ouvre_le_dialogue_dedie",
    bac.$("claude-compositeur-dialog").hidden === false);
  check("409_COMPOSITEUR_INTROUVABLE_texte_conserve_dans_le_champ",
    bac.$("prompt").value === "un message en cours de frappe", JSON.stringify(bac.$("prompt").value));
  check("409_COMPOSITEUR_INTROUVABLE_note_inline_pas_utilisee",
    bac.$("conversation-erreur").hidden === true);
}

async function testDialogue409BrouillonPresentAfficheLaNoteInline() {
  const bac = creerBac();
  await demarrer(bac, {}, { status: 200, body: { messages: [], tronque: false } });
  bac.$("prompt").value = "un message en cours de frappe";
  bac.$("claude-compositeur-dialog").hidden = true;
  bac.reponsesFetch.push({
    predicat: (url, options) => String(url) === "/api/conversation" && options && options.method === "POST",
    repondre: async () => ({
      status: 409,
      body: {
        erreur: "un brouillon est déjà présent dans le composeur (heuristique) — texte non envoyé",
        raison: "brouillon_present", heuristique: true, envoye: false,
        destinataire: "session tmux 'claude-kit'",
      },
    }),
  });
  bac.$("composer").dispatchSubmit();
  for (let i = 0; i < 6; i += 1) await attendreMicrotaches();

  check("409_BROUILLON_PRESENT_note_inline_visible",
    bac.$("conversation-erreur").hidden === false);
  check("409_BROUILLON_PRESENT_texte_dedie",
    bac.$("conversation-erreur").textContent.indexOf("se mélanger") !== -1,
    JSON.stringify(bac.$("conversation-erreur").textContent));
  check("409_BROUILLON_PRESENT_dialogue_reste_ferme",
    bac.$("claude-compositeur-dialog").hidden === true);
  check("409_BROUILLON_PRESENT_texte_conserve_dans_le_champ",
    bac.$("prompt").value === "un message en cours de frappe");
}

async function testDialogue409InterrompuApresCollageRepercuteLeMessageBackend() {
  const bac = creerBac();
  await demarrer(bac, {}, { status: 200, body: { messages: [], tronque: false } });
  bac.$("prompt").value = "un message en cours de frappe";
  bac.$("claude-compositeur-dialog").hidden = true;
  const messageBackend = "un dialogue est apparu pendant le collage (heuristique) — texte non envoyé";
  bac.reponsesFetch.push({
    predicat: (url, options) => String(url) === "/api/conversation" && options && options.method === "POST",
    repondre: async () => ({
      status: 409,
      body: {
        erreur: messageBackend,
        raison: "interrompu_apres_collage", heuristique: true, envoye: false,
        destinataire: "session tmux 'claude-kit'",
      },
    }),
  });
  bac.$("composer").dispatchSubmit();
  for (let i = 0; i < 6; i += 1) await attendreMicrotaches();

  check("409_INTERROMPU_APRES_COLLAGE_note_inline_visible",
    bac.$("conversation-erreur").hidden === false);
  check("409_INTERROMPU_APRES_COLLAGE_reprend_le_texte_backend_tel_quel",
    bac.$("conversation-erreur").textContent === messageBackend,
    JSON.stringify(bac.$("conversation-erreur").textContent));
  check("409_INTERROMPU_APRES_COLLAGE_dialogue_reste_ferme",
    bac.$("claude-compositeur-dialog").hidden === true);
}

// -- retraits NOMMÉS (ux-ui-designer étape 5bis) — lus à même la source :
// une classe/entrée déclarée puis jamais retirée fait échouer la garde de
// parité F3b (PIEGES §7/§38 du même ordre) — ici, on vérifie le retrait
// LUI-MÊME, pas seulement l'atteignabilité de ce qui reste. ------------------

function testRetraitClasseIsOccupeeDeAppCss() {
  const css = fs.readFileSync(path.join(__dirname, "app.css"), "utf8");
  check("RETRAIT_classe_is_occupee_absente_app_css",
    css.indexOf(".claude-status.is-occupee") === -1);
}

function testRetraitEntreeOccupeeDeClasseEtatPastille() {
  const js = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  check("RETRAIT_entree_occupee_absente_de_classe_etat_pastille",
    js.indexOf('"Occupée": "is-occupee"') === -1);
}

function testRetraitTitreHeuristiquePastilleSupprimeEntierement() {
  const js = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  // La SEULE forme qui compte comme « objet encore vivant » : une
  // déclaration. Une mention dans un commentaire expliquant le retrait
  // (documentation légitime, ADR-like) n'en est pas une — d'où un motif qui
  // cible SPÉCIFIQUEMENT `const _TITRE_HEURISTIQUE_PASTILLE`, pas la
  // moindre occurrence du nom.
  check("RETRAIT_titre_heuristique_pastille_supprime_entierement",
    !/const\s+_TITRE_HEURISTIQUE_PASTILLE\s*=/.test(js));
}

function testRetraitBrancheComposerOccupeeSupprimee() {
  const js = fs.readFileSync(path.join(__dirname, "app.js"), "utf8");
  check("RETRAIT_branche_composer_occupee_supprimee",
    js.indexOf("Claude n'est pas au prompt (heuristique) — patientez") === -1);
}

// -- correctif « hauteur du panneau » (rapporté depuis un iPad) : l'ancrage
// en bas de `rendreConversation` — la borne CSS elle-même (`.claude-panel`,
// `max-height: 58vh`) est prouvée au NAVIGATEUR avec 40 messages
// (`test_app_classes_navigateur.py`, `PLAFOND_*`), pas ici (bac à sable vm,
// sans mise en page réelle). Ce fichier couvre la logique JS : LIRE avant
// d'écrire, restaurer SEULEMENT si le fil était déjà en bas. ----------------

async function testScrollAncreEnBasQuandDejaEnBas() {
  const bac = creerBac();
  let corps = { messages: [{ ts: "2026-09-22T10:00:00.000Z", texte: "premier" }], tronque: false };
  bac.reponsesFetch.push({
    predicat: (url, options) => String(url).indexOf("/api/conversation") === 0 && (!options || !options.method || options.method === "GET"),
    repondre: async () => ({ status: 200, body: corps }),
  });
  await demarrer(bac, {}, null);

  const conteneur = bac.$("conversation");
  // Simule un fil déjà scrollé jusqu'en bas AVANT l'arrivée du second
  // message : `scrollTop + clientHeight === scrollHeight` (dans la marge de
  // 24px).
  conteneur.scrollTop = 100; conteneur.clientHeight = 50; conteneur.scrollHeight = 150;

  corps = { messages: [
    { ts: "2026-09-22T10:00:00.000Z", texte: "premier" },
    { ts: "2026-09-22T10:00:05.000Z", texte: "deuxieme", role: "assistant" },
  ], tronque: false };
  await bac.sandbox.actualiserConversation();

  check("SCROLL_ancre_en_bas_quand_deja_en_bas",
    conteneur.scrollTop === conteneur.scrollHeight && conteneur.scrollTop === 150,
    "obtenu scrollTop=" + conteneur.scrollTop + " (attendu 150, == scrollHeight)");
}

async function testScrollPositionRemonteePreservee() {
  const bac = creerBac();
  let corps = { messages: [{ ts: "2026-09-22T10:00:00.000Z", texte: "premier" }], tronque: false };
  bac.reponsesFetch.push({
    predicat: (url, options) => String(url).indexOf("/api/conversation") === 0 && (!options || !options.method || options.method === "GET"),
    repondre: async () => ({ status: 200, body: corps }),
  });
  await demarrer(bac, {}, null);

  const conteneur = bac.$("conversation");
  // Simule quelqu'un ayant remonté l'historique : loin du bas.
  conteneur.scrollTop = 0; conteneur.clientHeight = 50; conteneur.scrollHeight = 500;

  corps = { messages: [
    { ts: "2026-09-22T10:00:00.000Z", texte: "premier" },
    { ts: "2026-09-22T10:00:05.000Z", texte: "deuxieme", role: "assistant" },
  ], tronque: false };
  await bac.sandbox.actualiserConversation();

  check("SCROLL_position_remontee_preservee_aucun_saut_force",
    conteneur.scrollTop === 0, "obtenu scrollTop=" + conteneur.scrollTop + " (attendu 0, inchangé)");
}

async function main() {
  testOrdreDomConversationPrecedeComposer();
  testPromptEstDescendantDeComposer();
  testIndexHtmlPorteLesTroisIdsNeufs();
  testIndexHtmlPorteLesQuatreIdsDuDialogueCompositeur();
  await testOccupeePlieSurEnLigneDansLeBadge();
  await testClaudeTravailleDansLeFilQuandOccupee();
  await testComposerJamaisInerteQuandOccupee();
  await testDialogue409CompositeurIntrouvableOuvreLeDialogueDedie();
  await testDialogue409BrouillonPresentAfficheLaNoteInline();
  await testDialogue409InterrompuApresCollageRepercuteLeMessageBackend();
  testRetraitClasseIsOccupeeDeAppCss();
  testRetraitEntreeOccupeeDeClasseEtatPastille();
  testRetraitTitreHeuristiquePastilleSupprimeEntierement();
  testRetraitBrancheComposerOccupeeSupprimee();
  await testScrollAncreEnBasQuandDejaEnBas();
  await testScrollPositionRemonteePreservee();

  for (const [cle, entree] of Object.entries(ATTENDU_ROUGE)) {
    check("ATTENDU_ROUGE_" + cle + "_porte_un_lot_de_cloture_nomme", !!entree.lotDeCloture);
  }

  console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
  for (const e of _echecs) console.log("  - " + e);
  process.exit(_echecs.length ? 1 : 0);
}

main();
