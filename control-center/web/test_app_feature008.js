"use strict";
/* Harnais headless pour la création de spec depuis un prompt (feature-008).
 *
 *     node control-center/web/test_app_feature008.js
 *
 * Zéro dépendance installée (ADR-0006) : uniquement les modules standard de
 * Node (`vm`, `fs`, `path`) — bac à sable dupliqué depuis
 * `test_app_accordeon.js`/`test_app_bug012.js` (ces harnais ne sont pas des
 * modules : chacun exécute `app.js` TEL QUEL dans son propre contexte `vm`,
 * jamais copié ni modifié). Convention du projet : sortie « N cas,
 * M echec(s) », code de sortie 1 à l'échec. Invoqué depuis
 * `test_app_feature008.py`, qui se saute proprement si `node` est absent.
 *
 * Design arrêté (ux-ui-designer, feature-008) : panneau en FLUX normal dans
 * `.demande`, machine à états `saisie -> brouillon -> confirmation-ecriture
 * -> ecrit`, plus une erreur qui ne quitte jamais la phase courante.
 *
 * Ce que ce harnais établit PAR EXÉCUTION :
 *  1. Le cycle nominal complet : saisie -> brouillon -> confirmation ->
 *     écrit -> nouveau brouillon, avec les bons champs envoyés au serveur —
 *     `{type, titre, texte, minimal}` sur `/api/spec/brouillon`,
 *     `{type, titre, contenu}` sur `/api/spec/ecrire` (reboucle 5b : le
 *     serveur écrit `contenu` VERBATIM, le Markdown relu/édité dans le
 *     `<textarea>` — `texte`/`minimal` ne voyagent plus sur cette route).
 *  2. Le bouton « Écrire… » est une COMMODITÉ, jamais une garde : même
 *     invoqué directement (bouton désactivé outrepassé), le passage en
 *     confirmation n'a PAS lieu si `ecriture_active` est faux.
 *  3. L'escalade est rendue VISIBLE : dérogation cochée + contenu renvoyé
 *     SANS le marqueur du gabarit minimal (« ## Symptôme observé » — voir
 *     `contenuEstGabaritMinimal`, `genre` n'étant qu'un écho de `type`,
 *     jamais une preuve d'escalade) affiche la note « Dérogation ignorée »,
 *     absente si le serveur honore la dérogation ou si elle n'était pas
 *     demandée.
 *  4. Le compte de blocs `[remplir]` se recalcule sur la frappe (débounce),
 *     sans reconstruire le `<textarea>` ni perdre le focus.
 *  5. Un 409 affiche le message exact instruisant de régénérer, un 422
 *     (contenu vide/absent) affiche le message du serveur — les deux SANS
 *     changer de phase ni réinitialiser le texte du brouillon.
 *  6. Un 401 rouvre la porte d'authentification (même point d'entrée que le
 *     reste du module, `sur401Lecture`), jamais une modale dédiée.
 *  7. Rien du texte saisi ne part en query string : l'URL des deux routes
 *     reste exactement son chemin, le texte ne voyage que dans le corps.
 *  8. Aucune surface `role="dialog"`/`.porte` n'est introduite pour ce flux
 *     (lecture statique de `index.html`), et l'ancienne note « Inactif à
 *     dessein » a disparu au profit de l'avertissement RGPD permanent.
 *
 * Ce que ce harnais NE peut PAS établir : le rendu visuel réel, ni le
 * comportement d'un vrai `<textarea>` face à un focus perdu pendant une
 * frappe réelle (aucun navigateur ici, ADR-0006).
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

const ICI = __dirname;
const HTML = fs.readFileSync(path.join(ICI, "index.html"), "utf8");

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
    this.selected = false;
    this.scrollTop = 0;
    this.scrollHeight = 0;
    this.rows = 0;
    this._listeners = {};
    this._focusAppels = 0;
  }
  set textContent(v) { this._text = v === undefined || v === null ? "" : String(v); this.children = []; }
  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent).join("");
    return this._text;
  }
  get childNodes() { return this.children; }
  get firstChild() { return this.children.length ? this.children[0] : null; }
  // Un `DocumentFragment` réel VIDE ses enfants dans le parent au moment de
  // `appendChild` (comportement natif du DOM) — `rendreBrouillonRedaction`
  // et consorts en dépendent (`app.js` retourne un fragment). Sans ce cas
  // particulier, le fragment lui-même se retrouve poussé comme UN SEUL
  // enfant, et toute traversée par classe/tag échoue à tort (piège de ce
  // bac à sable, pas un défaut d'`app.js`).
  appendChild(child) {
    if (child && child.tagName === "#FRAGMENT") {
      child.children.forEach((c) => this.children.push(c));
      child.children = [];
      return child;
    }
    this.children.push(child);
    return child;
  }
  insertBefore(child, avant) {
    const i = this.children.indexOf(avant);
    if (i === -1) return this.appendChild(child);
    this.children.splice(i, 0, child);
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
  focus() { this._focusAppels += 1; }
  get classList() {
    const self = this;
    return {
      add: (c) => { self.className = (self.className ? self.className + " " : "") + c; },
      contains: (c) => self.className.split(/\s+/).filter(Boolean).indexOf(c) !== -1,
    };
  }
}

// Même liste que `test_app_bug012.js` (tenue à la main, PIEGES.md §7),
// re-synchronisée pour cette feature. Resynchronisée au lot 3 (feature-021,
// cycle 2, F7) : voir le commentaire de `test_app_bug012.js`.
const IDS = [
  "a11y-announcement", "account-button", "agents", "avatar",
  "backlog-column-count", "backlog-count",
  "backlog-title", "bandeau-hote", "bandeau-hote-bouton",
  "bandeau-hote-texte", "barre", "bouton-generer-brouillon",
  "compteur-prompt", "compteur-specs", "cycle-canvas", "cycle-status",
  "cycle-title", "derogation-minimale", "erreur-generer-brouillon", "fichiers", "filtre",
  "filtre-divergences", "horodatage", "jauge-flux", "jauge-git",
  "jauge-pilotage", "kanban", "legende-cycles", "link-front-sec",
  "link-front-tests", "link-front2-review", "link-reprise",
  "link-sec-front2", "link-spec-front", "link-tests-front2", "main-content",
  "motion-note", "note-agents", "pied-cycles", "pilotage-corps",
  "porte-aide", "porte-bouton", "porte-champ", "porte-corps", "porte-erreur",
  "porte-jeton", "porte-titre", "projet", "prompt", "redaction-corps",
  "selected-code", "selected-duration", "selected-files", "selected-state",
  "selected-task", "selected-title", "selected-tools", "sheet-metrics", "sheet-toggle", "summary-active",
  "summary-step", "summary-time", "systeme", "timeline", "tiroir",
  "tiroir-contenu", "tiroir-fermer", "tiroir-titre", "titre-agents",
  "titre-besoin", "titre-cycles", "titre-demande",
  "titre-evenements", "titre-fichiers", "titre-pilotage", "titre-systeme",
  "user-name", "workflows",
];

// `section-*` retirés avec la navigation à onglets (lot 3, F7) : plus
// aucune section n'est masquée.
const CACHES_PAR_DEFAUT = new Set([
  "bandeau-hote", "tiroir", "porte-jeton", "porte-erreur",
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
    for (let i = 0; i < reponsesFetch.length; i += 1) {
      const r = reponsesFetch[i];
      if (r.predicat(url, options)) {
        if (!r.persistant) reponsesFetch.splice(i, 1);
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
  if (_sourceDiagrammeJs === null) {
    _sourceDiagrammeJs = fs.readFileSync(path.join(ICI, "diagramme.js"), "utf8");
  }
  new vm.Script(_sourceDiagrammeJs, { filename: "diagramme.js" }).runInContext(bac.sandbox);

  if (_sourceAppJs === null) {
    _sourceAppJs = fs.readFileSync(path.join(ICI, "app.js"), "utf8");
  }
  new vm.Script(_sourceAppJs, { filename: "app.js" }).runInContext(bac.sandbox);
}

function attendreMicrotaches() {
  return new Promise((resolve) => setImmediate(resolve));
}

function attendreMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    ecriture_active: true,
    ecriture_raison: null,
    jeton_requis: false,
    horodatage: "2026-09-19T12:00:00Z",
  }, overrides || {});
}

// `/api/etat` est interrogé PLUSIEURS fois dans un seul chargement
// (`verifierEtatAuth` puis, dans la foulée, `rafraichir()` en interne) : la
// réponse reste servie tant qu'aucune autre n'est explicitement enfilée —
// jamais consommée après un seul appel (sinon `dernierEtat` reste `null`
// après le tout premier chargement, un piège de CE bac à sable, pas
// d'`app.js`).
function enfilerEtat(bac, status, body) {
  bac.reponsesFetch.push({
    predicat: (url) => String(url).indexOf("/api/etat") === 0,
    repondre: async () => ({ status, body }),
    persistant: true,
  });
}

function enfilerUneFois(bac, cheminExact, status, body) {
  bac.reponsesFetch.push({
    predicat: (url) => String(url) === cheminExact,
    repondre: async () => ({ status, body }),
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

// ------------------------------------------------------------ traversée --
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
function unParClasse(racine, c) {
  const t = tousLesNoeuds(racine).filter((n) => aClasse(n, c));
  return t.length ? t[0] : null;
}
function boutonParTexte(racine, texte) {
  return tousLesNoeuds(racine).find((n) => n.tagName === "BUTTON" && n.textContent === texte) || null;
}
function cliquer(bouton) { (bouton._listeners.click || []).forEach((fn) => fn()); }

// ------------------------------------------------------------- scénarios --

async function testCycleNominalComplet() {
  const bac = await chargerAvecEtat({ ecriture_active: true });
  const corps = bac.$("redaction-corps");

  check("N_phase_saisie_corps_vide_au_depart", corps.children.length === 0,
    "obtenu " + corps.children.length + " enfant(s)");

  bac.$("titre-besoin").value = "Ajouter un export CSV";
  bac.$("prompt").value = "Ajouter un export CSV des specs affichées";
  bac.$("derogation-minimale").checked = false;

  enfilerUneFois(bac, "/api/spec/brouillon", 200, {
    genre: "feature",
    slug: "export-csv",
    nom_fichier_prevu: "feature-NNN-export-csv.md",
    contenu: "## Métadonnées\n- ID : [remplir]\n- Slug : export-csv\n\n"
      + "## Description\n[remplir]\n",
    substitutions: ["slug", "type"],
  });
  cliquer(bac.$("bouton-generer-brouillon"));
  await attendreMicrotaches();
  await attendreMicrotaches();
  await attendreMicrotaches();

  check("N_appel_brouillon_chemin_exact",
    bac.appelsFetch.some((a) => a.url === "/api/spec/brouillon"),
    "urls appelées : " + bac.appelsFetch.map((a) => a.url).join(", "));
  const appelBrouillon = bac.appelsFetch.find((a) => a.url === "/api/spec/brouillon");
  const corpsEnvoye = JSON.parse(appelBrouillon.options.body);
  check("N_corps_brouillon_porte_le_titre_et_le_texte_saisis",
    corpsEnvoye.titre === "Ajouter un export CSV"
    && corpsEnvoye.texte === "Ajouter un export CSV des specs affichées"
    && corpsEnvoye.type === "feature" && corpsEnvoye.minimal === false,
    "obtenu : " + JSON.stringify(corpsEnvoye));

  const titre = unParClasse(corps, "") ; // no-op, placeholder pour lisibilité
  const h3 = tousLesNoeuds(corps).find((n) => n.tagName === "H3");
  check("N_titre_brouillon_affiche_le_nom_prevu",
    !!h3 && h3.textContent.indexOf("feature-NNN-export-csv.md") !== -1,
    "obtenu : " + (h3 && h3.textContent));
  check("N_titre_brouillon_recoit_le_focus", !!h3 && h3._focusAppels === 1);

  const textarea = tousLesNoeuds(corps).find((n) => n.tagName === "TEXTAREA");
  check("N_textarea_editable_porte_le_contenu_integral",
    !!textarea && textarea.value.indexOf("[remplir]") !== -1
    && textarea.value.indexOf("Slug : export-csv") !== -1);
  check("N_textarea_porte_la_classe_brouillon", aClasse(textarea, "brouillon"));

  const compteurRemplir = unParClasse(corps, "compteur");
  check("N_compteur_remplir_deux_blocs",
    !!compteurRemplir && compteurRemplir.textContent === "2 blocs [remplir] restants",
    "obtenu : " + (compteurRemplir && compteurRemplir.textContent));

  const boutonEcrire = boutonParTexte(corps, "Écrire dans todo/…");
  check("N_bouton_ecrire_actif_quand_ecriture_active",
    !!boutonEcrire && boutonEcrire.disabled === false);

  // -- débounce : la frappe modifie SEULEMENT le compteur, jamais le DOM --
  const enfantsAvant = corps.children.length;
  textarea.value = textarea.value.replace("[remplir]\n", "");
  (textarea._listeners.input || []).forEach((fn) => fn());
  check("N_debounce_pas_de_redessin_immediat", corps.children.length === enfantsAvant);
  await attendreMs(400);
  check("N_debounce_recompte_apres_300ms",
    compteurRemplir.textContent === "1 bloc [remplir] restant",
    "obtenu : " + compteurRemplir.textContent);
  check("N_debounce_pas_de_reconstruction_du_textarea",
    corps.children.length === enfantsAvant,
    "le nombre d'enfants directs a changé après la frappe débattue");

  // -- passage en confirmation --
  cliquer(boutonEcrire);
  const h3Confirm = tousLesNoeuds(corps).find((n) => n.tagName === "H3");
  check("N_confirmation_titre", !!h3Confirm && h3Confirm.textContent === "Confirmer l'écriture");
  const code = tousLesNoeuds(corps).find((n) => n.tagName === "CODE");
  check("N_confirmation_cite_le_nom_prevu",
    !!code && code.textContent === "feature-NNN-export-csv.md");

  const boutonConfirmer = boutonParTexte(corps, "Confirmer l'écriture");
  check("N_bouton_confirmer_present", !!boutonConfirmer);

  enfilerUneFois(bac, "/api/spec/ecrire", 201, {
    id: "021", chemin: "specs/features/todo/feature-021-export-csv.md",
    numero: 21, substitutions_finales: ["slug", "type", "numero"],
  });
  cliquer(boutonConfirmer);
  await attendreMicrotaches();
  await attendreMicrotaches();
  await attendreMicrotaches();

  const appelEcrire = bac.appelsFetch.find((a) => a.url === "/api/spec/ecrire");
  check("N_appel_ecrire_chemin_exact", !!appelEcrire);
  const corpsEcrit = JSON.parse(appelEcrire.options.body);
  // Reboucle (étape 5b) : `/api/spec/ecrire` écrit désormais `contenu`
  // VERBATIM — {type, titre, contenu}, PLUS de {texte, minimal} sur cette
  // route (ils restent propres à `/api/spec/brouillon`).
  check("N_corps_ecrire_porte_type_et_titre",
    corpsEcrit.type === "feature" && corpsEcrit.titre === "Ajouter un export CSV",
    "obtenu : " + JSON.stringify(corpsEcrit));
  // RÉGRESSION VISÉE (reboucle 5b, point 5) : si le frontend cesse d'envoyer
  // `contenu`, ce cas doit échouer — c'est exactement le défaut qu'on vient
  // de corriger (le Markdown édité était ignoré par le serveur).
  check("N_regression_contenu_toujours_envoye_et_verbatim",
    corpsEcrit.contenu !== undefined && corpsEcrit.contenu === textarea.value
    && corpsEcrit.contenu.indexOf("[remplir]") !== -1,
    "obtenu contenu : " + JSON.stringify(corpsEcrit.contenu));
  check("N_corps_ecrire_ne_porte_plus_texte_ni_minimal",
    corpsEcrit.texte === undefined && corpsEcrit.minimal === undefined,
    "obtenu : " + JSON.stringify(corpsEcrit));

  const codeFinal = tousLesNoeuds(corps).find((n) => n.tagName === "CODE");
  check("N_ecrit_affiche_le_chemin",
    !!codeFinal && codeFinal.textContent === "specs/features/todo/feature-021-export-csv.md");

  const boutonNouveau = boutonParTexte(corps, "Nouveau brouillon");
  check("N_bouton_nouveau_brouillon_present", !!boutonNouveau);
  cliquer(boutonNouveau);
  check("N_retour_saisie_corps_vide", corps.children.length === 0);
  check("N_titre_reinitialise", bac.$("titre-besoin").value === "");
  check("N_prompt_reinitialise", bac.$("prompt").value === "");
  check("N_derogation_reinitialisee", bac.$("derogation-minimale").checked === false);
}

async function testEcritureActiveEstUneCommoditePasUneGarde() {
  const bac = await chargerAvecEtat({ ecriture_active: false, ecriture_raison: "plafond atteint" });
  const corps = bac.$("redaction-corps");
  bac.$("titre-besoin").value = "Un besoin quelconque";
  bac.$("prompt").value = "Un besoin quelconque, en détail";

  enfilerUneFois(bac, "/api/spec/brouillon", 200, {
    genre: "feature", slug: "x", nom_fichier_prevu: "feature-NNN-x.md",
    contenu: "[remplir]", substitutions: [],
  });
  cliquer(bac.$("bouton-generer-brouillon"));
  await attendreMicrotaches(); await attendreMicrotaches(); await attendreMicrotaches();

  const boutonEcrire = boutonParTexte(corps, "Écrire dans todo/…");
  check("G_bouton_ecrire_desactive_quand_ecriture_inactive",
    !!boutonEcrire && boutonEcrire.disabled === true);
  const noteInactive = tousLesNoeuds(corps).find((n) => n.textContent.indexOf("plafond atteint") !== -1);
  check("G_note_ecriture_non_activee_visible", !!noteInactive);

  // Appel DIRECT de la fonction — même en outrepassant l'attribut
  // `disabled`, le passage en confirmation n'a pas lieu : ce n'est pas le
  // bouton qui protège, c'est la fonction qui relit `dernierEtat`. Preuve
  // par la structure DOM (jamais par un état interne inaccessible : `let
  // redaction` ne devient PAS une propriété du bac à sable `vm`, seules les
  // déclarations `function`/`var` le font).
  bac.sandbox.surClicDemanderEcriture();
  check("G_phase_reste_brouillon_meme_bouton_outrepasse",
    !!unParClasse(corps, "brouillon"),
    "le panneau ne porte plus de <textarea class=\"brouillon\"> — la phase a changé");
}

// Contenus réalistes (gabarit complet vs minimal), distingués par le SEUL
// signal que le frontend peut lire dans la réponse : la présence littérale
// de « ## Symptôme observé » (propre à `specs/modele.md`, absente de
// `_template.md`) — voir `contenuEstGabaritMinimal` (app.js).
const CONTENU_GABARIT_COMPLET = "## Métadonnées\n- ID : [remplir]\n\n## Description\n[remplir]\n";
const CONTENU_GABARIT_MINIMAL = "# Bug — x\n\n## Symptôme observé\n[remplir]\n";

async function testEscaladeIgnoreeVisible() {
  // Dérogation cochée (« bug simple »), mot-clé sensible dans le texte :
  // le serveur FORCE le gabarit complet (fail-closed) — visible SEULEMENT
  // par l'absence de « ## Symptôme observé » dans le contenu renvoyé.
  const bac1 = await chargerAvecEtat({ ecriture_active: true });
  bac1.$("titre-besoin").value = "Ajouter une permission d'accès";
  bac1.$("prompt").value = "Ajouter une permission d'accès au tableau de bord";
  bac1.$("derogation-minimale").checked = true;
  enfilerUneFois(bac1, "/api/spec/brouillon", 200, {
    genre: "bug", slug: "permission", nom_fichier_prevu: "bug-NNN-permission.md",
    contenu: CONTENU_GABARIT_COMPLET, substitutions: [],
  });
  cliquer(bac1.$("bouton-generer-brouillon"));
  await attendreMicrotaches(); await attendreMicrotaches(); await attendreMicrotaches();
  const corps1 = bac1.$("redaction-corps");
  const noteIgnoree = tousLesNoeuds(corps1)
    .find((n) => n.textContent === "Dérogation ignorée : le texte mentionne un sujet sensible — "
      + "template complet appliqué.");
  check("E_note_derogation_ignoree_visible_quand_gabarit_complet_impose", !!noteIgnoree);

  // Dérogation cochée, rien de sensible : le serveur honore le gabarit
  // minimal (« ## Symptôme observé » présent) — pas de note.
  const bac2 = await chargerAvecEtat({ ecriture_active: true });
  bac2.$("titre-besoin").value = "Corriger une faute de frappe";
  bac2.$("prompt").value = "Corriger une faute de frappe dans le pied de page";
  bac2.$("derogation-minimale").checked = true;
  enfilerUneFois(bac2, "/api/spec/brouillon", 200, {
    genre: "bug", slug: "faute", nom_fichier_prevu: "bug-NNN-faute.md",
    contenu: CONTENU_GABARIT_MINIMAL, substitutions: [],
  });
  cliquer(bac2.$("bouton-generer-brouillon"));
  await attendreMicrotaches(); await attendreMicrotaches(); await attendreMicrotaches();
  const corps2 = bac2.$("redaction-corps");
  const noteAbsente = tousLesNoeuds(corps2)
    .find((n) => n.textContent.indexOf("Dérogation ignorée") !== -1);
  check("E_pas_de_note_quand_derogation_honoree", !noteAbsente);

  // Dérogation jamais demandée : jamais de note, même si le gabarit renvoyé
  // est le complet (cas normal, pas une escalade).
  const bac3 = await chargerAvecEtat({ ecriture_active: true });
  bac3.$("titre-besoin").value = "Une fonctionnalité banale";
  bac3.$("prompt").value = "Une fonctionnalité banale, sans rapport avec la sécurité";
  bac3.$("derogation-minimale").checked = false;
  enfilerUneFois(bac3, "/api/spec/brouillon", 200, {
    genre: "feature", slug: "banal", nom_fichier_prevu: "feature-NNN-banal.md",
    contenu: CONTENU_GABARIT_COMPLET, substitutions: [],
  });
  cliquer(bac3.$("bouton-generer-brouillon"));
  await attendreMicrotaches(); await attendreMicrotaches(); await attendreMicrotaches();
  const corps3 = bac3.$("redaction-corps");
  const noteAbsente3 = tousLesNoeuds(corps3)
    .find((n) => n.textContent.indexOf("Dérogation ignorée") !== -1);
  check("E_pas_de_note_quand_derogation_jamais_demandee", !noteAbsente3);
}

async function testErreur409NeChangePasDePhase() {
  const bac = await chargerAvecEtat({ ecriture_active: true });
  bac.$("titre-besoin").value = "Un besoin déjà nommé";
  bac.$("prompt").value = "Un besoin déjà nommé, en détail";
  enfilerUneFois(bac, "/api/spec/brouillon", 200, {
    genre: "feature", slug: "deja-nomme", nom_fichier_prevu: "feature-NNN-deja-nomme.md",
    contenu: "contenu du brouillon\n[remplir]", substitutions: [],
  });
  cliquer(bac.$("bouton-generer-brouillon"));
  await attendreMicrotaches(); await attendreMicrotaches(); await attendreMicrotaches();

  const corps = bac.$("redaction-corps");
  const textareaAvant = tousLesNoeuds(corps).find((n) => n.tagName === "TEXTAREA");
  const contenuAvant = textareaAvant.value;

  cliquer(boutonParTexte(corps, "Écrire dans todo/…"));

  const MESSAGE_ATTENDU = "Un fichier nommé feature-NNN-deja-nomme.md "
    + "existe déjà. Modifiez le texte du besoin, puis Régénérer.";
  enfilerUneFois(bac, "/api/spec/ecrire", 409, {});
  cliquer(boutonParTexte(corps, "Confirmer l'écriture"));
  await attendreMicrotaches(); await attendreMicrotaches(); await attendreMicrotaches();

  // Preuve par la structure DOM, jamais par un état interne inaccessible
  // (`let redaction` n'est pas une propriété du bac à sable `vm`) : l'erreur
  // NE quitte PAS la phase « confirmation-ecriture » — toujours son titre,
  // toujours son bouton de confirmation, jamais le panneau « Spec écrite ».
  check("E409_phase_reste_confirmation_ecriture",
    tousLesNoeuds(corps).some((n) => n.tagName === "H3" && n.textContent === "Confirmer l'écriture")
    && !!boutonParTexte(corps, "Confirmer l'écriture"));
  const erreurAffichee = tousLesNoeuds(corps).find((n) => aClasse(n, "erreur"));
  check("E409_message_exact",
    !!erreurAffichee && erreurAffichee.textContent === MESSAGE_ATTENDU,
    "obtenu : " + (erreurAffichee && erreurAffichee.textContent));

  // Retour arrière explicite (Annuler) : le contenu édité du brouillon
  // survit intact à l'aller-retour — jamais réinitialisé par l'erreur.
  cliquer(boutonParTexte(corps, "Annuler"));
  const textareaApres = tousLesNoeuds(corps).find((n) => n.tagName === "TEXTAREA");
  check("E409_contenu_du_brouillon_jamais_reinitialise",
    !!textareaApres && textareaApres.value === contenuAvant,
    "avant : " + JSON.stringify(contenuAvant) + " / après : " + JSON.stringify(textareaApres && textareaApres.value));
}

// Reboucle (étape 5b, point 4) : un `contenu` vide/absent/trop long est un
// `422` sur `/api/spec/ecrire`, géré EXACTEMENT comme les autres erreurs —
// `.note.erreur` au-dessus du bouton, jamais de perte du texte relu.
async function testErreur422ContenuVideGereeCommeLesAutres() {
  const bac = await chargerAvecEtat({ ecriture_active: true });
  bac.$("titre-besoin").value = "Un besoin quelconque";
  bac.$("prompt").value = "Un besoin quelconque, en détail";
  enfilerUneFois(bac, "/api/spec/brouillon", 200, {
    genre: "feature", slug: "quelconque", nom_fichier_prevu: "feature-NNN-quelconque.md",
    contenu: "contenu du brouillon\n[remplir]", substitutions: [],
  });
  cliquer(bac.$("bouton-generer-brouillon"));
  await attendreMicrotaches(); await attendreMicrotaches(); await attendreMicrotaches();

  const corps = bac.$("redaction-corps");
  const textareaAvant = tousLesNoeuds(corps).find((n) => n.tagName === "TEXTAREA");
  const contenuAvant = textareaAvant.value;
  cliquer(boutonParTexte(corps, "Écrire dans todo/…"));

  enfilerUneFois(bac, "/api/spec/ecrire", 422, { erreur: "contenu manquant ou vide" });
  cliquer(boutonParTexte(corps, "Confirmer l'écriture"));
  await attendreMicrotaches(); await attendreMicrotaches(); await attendreMicrotaches();

  check("E422_phase_reste_confirmation_ecriture",
    tousLesNoeuds(corps).some((n) => n.tagName === "H3" && n.textContent === "Confirmer l'écriture"));
  const erreurAffichee = tousLesNoeuds(corps).find((n) => aClasse(n, "erreur"));
  check("E422_message_du_serveur_affiche",
    !!erreurAffichee && erreurAffichee.textContent === "contenu manquant ou vide",
    "obtenu : " + (erreurAffichee && erreurAffichee.textContent));
  // L'erreur est posée AU-DESSUS du bouton qui a échoué (même conteneur, la
  // note précède la ligne de boutons dans l'ordre du DOM).
  const boutons = unParClasse(corps, "pilotage-boutons");
  check("E422_erreur_precede_les_boutons_dans_le_dom",
    !!erreurAffichee && !!boutons && corps.children.indexOf(erreurAffichee) < corps.children.indexOf(boutons));

  cliquer(boutonParTexte(corps, "Annuler"));
  const textareaApres = tousLesNoeuds(corps).find((n) => n.tagName === "TEXTAREA");
  check("E422_contenu_jamais_perdu",
    !!textareaApres && textareaApres.value === contenuAvant);
}

async function test401RouvreLaPorteJamaisUneModaleDediee() {
  const bac = await chargerAvecEtat({ ecriture_active: true, jeton_requis: false });
  bac.sessionStorageDonnees["pilotage_jeton"] = "jeton-perime";
  bac.$("titre-besoin").value = "Peu importe";
  bac.$("prompt").value = "Peu importe, en détail";

  enfilerUneFois(bac, "/api/spec/brouillon", 401, null);
  cliquer(bac.$("bouton-generer-brouillon"));
  await attendreMicrotaches(); await attendreMicrotaches(); await attendreMicrotaches();

  check("A401_porte_reouverte", bac.$("porte-jeton").hidden === false);
  check("A401_jeton_oublie", !bac.sessionStorageDonnees["pilotage_jeton"]);
  check("A401_aucune_nouvelle_surface_dialog_dediee_a_la_redaction",
    bac.$("redaction-corps").children.length === 0);
}

// Reboucle (revue, Request changes) : un 401 en cours de relecture ne doit
// JAMAIS laisser les boutons désactivés à demeure ni coûter le Markdown
// relu — les deux seuls chemins qui appelaient `sur401Lecture()` sans
// remettre leur drapeau à `false` ni redessiner AVANT. Mesuré : ce test
// échoue sur le code d'avant le correctif (boutons restés `disabled=true`).
async function test401NeBloqueJamaisLesBoutonsNiNePerdLeMarkdown() {
  // -- Route 1/2 : /api/spec/brouillon, depuis « Régénérer » (phase
  // brouillon, où vivent les boutons concernés par le défaut signalé) --
  const bac1 = await chargerAvecEtat({ ecriture_active: true, jeton_requis: false });
  bac1.$("titre-besoin").value = "Un besoin";
  bac1.$("prompt").value = "Un besoin, en détail";
  enfilerUneFois(bac1, "/api/spec/brouillon", 200, {
    genre: "feature", slug: "besoin", nom_fichier_prevu: "feature-NNN-besoin.md",
    contenu: "contenu relu\n[remplir]", substitutions: [],
  });
  cliquer(bac1.$("bouton-generer-brouillon"));
  await attendreMicrotaches(); await attendreMicrotaches(); await attendreMicrotaches();

  const corps1 = bac1.$("redaction-corps");
  const textareaAvant1 = tousLesNoeuds(corps1).find((n) => n.tagName === "TEXTAREA");
  const contenuAvant1 = textareaAvant1.value;

  bac1.sessionStorageDonnees["pilotage_jeton"] = "jeton-perime";
  enfilerUneFois(bac1, "/api/spec/brouillon", 401, null);
  cliquer(boutonParTexte(corps1, "Régénérer"));
  await attendreMicrotaches(); await attendreMicrotaches(); await attendreMicrotaches();

  check("A401_brouillon_bouton_regenerer_redevient_actif",
    !!boutonParTexte(corps1, "Régénérer") && boutonParTexte(corps1, "Régénérer").disabled === false);
  const boutonEcrire1 = boutonParTexte(corps1, "Écrire dans todo/…");
  check("A401_brouillon_bouton_ecrire_redevient_actif",
    !!boutonEcrire1 && boutonEcrire1.disabled === false);
  const textareaApres1 = tousLesNoeuds(corps1).find((n) => n.tagName === "TEXTAREA");
  check("A401_brouillon_contenu_intact",
    !!textareaApres1 && textareaApres1.value === contenuAvant1,
    "avant : " + JSON.stringify(contenuAvant1) + " / après : " + JSON.stringify(textareaApres1 && textareaApres1.value));

  // -- Route 2/2 : /api/spec/ecrire, depuis « Confirmer l'écriture » --
  const bac2 = await chargerAvecEtat({ ecriture_active: true, jeton_requis: false });
  bac2.$("titre-besoin").value = "Un autre besoin";
  bac2.$("prompt").value = "Un autre besoin, en détail";
  enfilerUneFois(bac2, "/api/spec/brouillon", 200, {
    genre: "feature", slug: "autre-besoin", nom_fichier_prevu: "feature-NNN-autre-besoin.md",
    contenu: "contenu relu et corrigé\n[remplir]", substitutions: [],
  });
  cliquer(bac2.$("bouton-generer-brouillon"));
  await attendreMicrotaches(); await attendreMicrotaches(); await attendreMicrotaches();

  const corps2 = bac2.$("redaction-corps");
  const textareaAvant2 = tousLesNoeuds(corps2).find((n) => n.tagName === "TEXTAREA");
  const contenuAvant2 = textareaAvant2.value;
  cliquer(boutonParTexte(corps2, "Écrire dans todo/…"));

  bac2.sessionStorageDonnees["pilotage_jeton"] = "jeton-perime";
  enfilerUneFois(bac2, "/api/spec/ecrire", 401, null);
  cliquer(boutonParTexte(corps2, "Confirmer l'écriture"));
  await attendreMicrotaches(); await attendreMicrotaches(); await attendreMicrotaches();

  check("A401_ecrire_bouton_annuler_redevient_actif",
    !!boutonParTexte(corps2, "Annuler") && boutonParTexte(corps2, "Annuler").disabled === false);
  const boutonConfirmer2 = boutonParTexte(corps2, "Confirmer l'écriture");
  check("A401_ecrire_bouton_confirmer_redevient_actif",
    !!boutonConfirmer2 && boutonConfirmer2.disabled === false);

  // Retour au brouillon (Annuler) : le Markdown relu doit être RÉCUPÉRABLE
  // sans rechargement — c'est précisément ce que le défaut empêchait.
  cliquer(boutonParTexte(corps2, "Annuler"));
  const textareaApres2 = tousLesNoeuds(corps2).find((n) => n.tagName === "TEXTAREA");
  check("A401_ecrire_contenu_recuperable_sans_rechargement",
    !!textareaApres2 && textareaApres2.value === contenuAvant2,
    "avant : " + JSON.stringify(contenuAvant2) + " / après : " + JSON.stringify(textareaApres2 && textareaApres2.value));
}

async function testAucuneFuiteDuTexteEnQueryString() {
  const bac = await chargerAvecEtat({ ecriture_active: true });
  bac.$("titre-besoin").value = "Un titre anodin";
  bac.$("prompt").value = "un secret ne doit jamais partir en clair dans une URL";
  enfilerUneFois(bac, "/api/spec/brouillon", 200, {
    genre: "feature", slug: "x", nom_fichier_prevu: "feature-NNN-x.md",
    contenu: "[remplir]", substitutions: [],
  });
  cliquer(bac.$("bouton-generer-brouillon"));
  await attendreMicrotaches(); await attendreMicrotaches(); await attendreMicrotaches();

  const appel = bac.appelsFetch.find((a) => a.url === "/api/spec/brouillon");
  check("Q_url_brouillon_sans_query_string", appel.url === "/api/spec/brouillon");
  check("Q_texte_uniquement_dans_le_corps",
    !/secret|jamais|partir/.test(appel.url));
}

// ------------------------------------------------- lecture statique HTML --
function testStatiqueHTML() {
  const bloc = (() => {
    const debut = HTML.indexOf('class="bloc demande"');
    const suite = HTML.indexOf("</section>", debut);
    return HTML.slice(debut, suite);
  })();

  check("S_prompt_nest_plus_disabled",
    !/<textarea id="prompt"[^>]*\bdisabled\b/.test(bloc));
  check("S_ancienne_note_inactif_a_dessein_disparue",
    HTML.indexOf("Inactif à dessein") === -1);
  check("S_avertissement_rgpd_permanent_present",
    bloc.indexOf("aucun appel de modèle") !== -1
    && bloc.indexOf("Il ne quitte pas ce poste") !== -1);
  check("S_case_derogation_minimale_presente",
    bloc.indexOf('id="derogation-minimale"') !== -1
    && bloc.indexOf("template minimal") !== -1);
  check("S_note_mot_cle_sensible_presente",
    bloc.indexOf("mot-clé sensible") !== -1);
  check("S_aucune_surface_dialog_dans_le_bloc_demande",
    bloc.indexOf("role=\"dialog\"") === -1 && !/class="[^"]*\bporte\b/.test(bloc));
  check("S_bouton_generer_brouillon_present",
    bloc.indexOf('id="bouton-generer-brouillon"') !== -1
    && bloc.indexOf("Générer le brouillon") !== -1);
  check("S_conteneur_redaction_corps_present",
    bloc.indexOf('id="redaction-corps"') !== -1);
  check("S_champ_titre_present_avec_label_associe",
    bloc.indexOf('id="titre-besoin"') !== -1
    && bloc.indexOf('for="titre-besoin"') !== -1);
}

async function main() {
  testStatiqueHTML();
  await testCycleNominalComplet();
  await testEcritureActiveEstUneCommoditePasUneGarde();
  await testEscaladeIgnoreeVisible();
  await testErreur409NeChangePasDePhase();
  await testErreur422ContenuVideGereeCommeLesAutres();
  await test401RouvreLaPorteJamaisUneModaleDediee();
  await test401NeBloqueJamaisLesBoutonsNiNePerdLeMarkdown();
  await testAucuneFuiteDuTexteEnQueryString();

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
