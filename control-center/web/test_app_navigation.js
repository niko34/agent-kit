"use strict";
/* Harnais headless pour la navigation à sections (feature-019, absorbe
 * bug-016) — colonne étroite, une section visible à la fois, contenu borné
 * et centré, langage visuel du design system §3/§4.
 *
 *     node control-center/web/test_app_navigation.js
 *
 * Zéro dépendance installée (ADR-0006) : uniquement `fs`, `path`, `vm` de la
 * bibliothèque standard Node — bac à sable dupliqué depuis
 * `test_app_theme.js` (section 7 : `creerBacApp`), qui modélise déjà
 * `document.documentElement` — nécessaire ici pour vérifier l'amorçage
 * `data-section`. Convention du projet : sortie « N cas, M echec(s) », code
 * de sortie 1 à l'échec. Invoqué depuis `test_app_navigation.py`, qui se
 * saute proprement si `node` est absent.
 *
 * ## Ce que ce harnais établit
 *
 * A — PAR EXÉCUTION (app.js) : exactement une section visible à la fois,
 *     épinglée par identifiant ; roving tabindex sur les six onglets ;
 *     activation clavier (flèches, Home, End) ET clic ; le focus
 *     programmatique atterrit sur le TITRE de la section, jamais sur
 *     l'onglet ; persistance protégée dans `localStorage` (lecture ET
 *     écriture) sous la clé `section` ; une valeur inconnue ou absente
 *     retombe sur « agents » ; un rafraîchissement ne perd pas la section.
 * B — PAR LECTURE STATIQUE de `index.html` : `hidden` posé STATIQUEMENT sur
 *     les cinq sections non par défaut (condition de sécurité 5 — rien
 *     ajouté par JS au chargement) ; nav `role="tablist"`, six
 *     `role="tab"` avec `aria-controls` vers un panneau réel ; la porte
 *     d'authentification reste enfant direct de `<body>` (condition 4).
 * C — PAR LECTURE STATIQUE de `app.css` : le monospace n'apparaît plus que
 *     sur des identifiants techniques (31 usages d'entrée, classification
 *     ligne par ligne, 16 en sortie) ; `var(--surface-2)` ne sert plus qu'à
 *     des teintes d'INTERACTION — les trois aplats structurels d'entrée ont
 *     migré vers `var(--surface)` ; `.fsujet` distinct de `.fchemin` ;
 *     `.bloc h2` en sans-serif/18px/`--texte` ;
 *     `.section[hidden]{display:none}` déclarée après tout `display`
 *     d'auteur sur `.section` ; la nav et tout élément fixe/collant restent
 *     sous la profondeur 30.
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
const CSS = fs.readFileSync(path.join(ICI, "app.css"), "utf8");
const APP_JS_PATH = path.join(ICI, "app.js");
const DIAGRAMME_JS_PATH = path.join(ICI, "diagramme.js");

/* ===================================================================== *
 * Bac à sable — dupliqué depuis `test_app_theme.js` (section 7), étendu
 * avec les identifiants de navigation (nav-sections, onglet-*, section-*,
 * titre-section-*).
 * ===================================================================== */

class FakeNode {
  constructor(tag) {
    this.tagName = String(tag || "div").toUpperCase();
    this.children = [];
    this._text = "";
    this.className = "";
    this.hidden = false;
    this._attrs = {};
    this._listeners = {};
    this._focusAppels = 0;
  }
  set textContent(v) { this._text = v === undefined || v === null ? "" : String(v); this.children = []; }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join("") : this._text; }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); return child; }
  setAttribute(nom, valeur) { this._attrs[nom] = String(valeur); this[nom] = valeur; }
  getAttribute(nom) { return Object.prototype.hasOwnProperty.call(this._attrs, nom) ? this._attrs[nom] : null; }
  removeAttribute(nom) { delete this._attrs[nom]; delete this[nom]; }
  addEventListener(type, gestionnaire) { (this._listeners[type] = this._listeners[type] || []).push(gestionnaire); }
  focus() { this._focusAppels += 1; }
  get classList() {
    const self = this;
    return { add: (c) => { self.className = (self.className ? self.className + " " : "") + c; },
      contains: (c) => self.className.split(/\s+/).filter(Boolean).indexOf(c) !== -1 };
  }
}

const SECTIONS = ["agents", "systeme", "developper", "cycles", "fichiers", "evenements"];

const IDS_APP = [
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
  "workflows", "nav-sections",
].concat(SECTIONS.map((s) => "onglet-" + s))
  .concat(SECTIONS.map((s) => "section-" + s))
  .concat(SECTIONS.map((s) => "titre-section-" + s));

const CACHES_PAR_DEFAUT = new Set([
  "bandeau-hote", "tiroir", "porte-jeton", "porte-erreur", "icone-systeme-sombre",
  "erreur-generer-brouillon",
  // Reflète le HTML servi : seule « agents » est visible par défaut.
  "section-systeme", "section-developper", "section-cycles",
  "section-fichiers", "section-evenements",
]);

function creerLocalStorageMemoire() {
  const donnees = {};
  return {
    getItem: (c) => (Object.prototype.hasOwnProperty.call(donnees, c) ? donnees[c] : null),
    setItem: (c, v) => { donnees[c] = String(v); },
    removeItem: (c) => { delete donnees[c]; },
    _donnees: donnees,
  };
}

function creerBac(options) {
  const opts = options || {};
  const elements = new Map();
  for (const id of IDS_APP) {
    const n = new FakeNode("div");
    n.id = id;
    n.hidden = CACHES_PAR_DEFAUT.has(id);
    elements.set(id, n);
  }
  const documentElement = new FakeNode("html");
  if (opts.dataSectionInitial) documentElement.setAttribute("data-section", opts.dataSectionInitial);

  const document_ = {
    documentElement,
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new FakeNode(tag),
    // feature-017 : `construireDiagramme` (app.js) construit du SVG réel.
    createElementNS: (_ns, tag) => new FakeNode(tag),
    createTextNode: (t) => { const n = new FakeNode("#text"); n.textContent = t; return n; },
    createDocumentFragment: () => new FakeNode("#fragment"),
    addEventListener: () => {},
    activeElement: null,
  };

  async function fetch_() { throw new Error("fetch non simulé (harnais navigation seule)"); }
  class FakeEventSource { constructor() {} addEventListener() {} }

  const sandbox = {
    document: document_,
    fetch: fetch_,
    EventSource: FakeEventSource,
    requestAnimationFrame: (cb) => cb(),
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout,
    clearTimeout,
    matchMedia: () => null,
    console,
  };
  sandbox.localStorage = Object.prototype.hasOwnProperty.call(opts, "localStorage")
    ? opts.localStorage : creerLocalStorageMemoire();
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  return { sandbox, elements, documentElement, $: (id) => elements.get(id) };
}

function chargerAppJS(bac) {
  // feature-017 : `disposer()` (diagramme.js) doit exister dans le contexte
  // AVANT `app.js`, même ordre que les deux `<script>` d'index.html.
  const sourceDiagramme = fs.readFileSync(DIAGRAMME_JS_PATH, "utf8");
  new vm.Script(sourceDiagramme, { filename: "diagramme.js" }).runInContext(bac.sandbox);
  const source = fs.readFileSync(APP_JS_PATH, "utf8");
  new vm.Script(source, { filename: "app.js" }).runInContext(bac.sandbox);
}

function cliquer(bouton) { (bouton._listeners.click || []).forEach((fn) => fn()); }
function appuyer(bouton, touche) {
  let empeche = false;
  (bouton._listeners.keydown || []).forEach((fn) => fn({ key: touche, preventDefault: () => { empeche = true; } }));
  return empeche;
}

function etatsSections(bac) {
  const r = {};
  SECTIONS.forEach((s) => { r[s] = bac.$("section-" + s).hidden; });
  return r;
}
function ongletsSelectionnes(bac) {
  const r = {};
  SECTIONS.forEach((s) => { r[s] = bac.$("onglet-" + s).getAttribute("aria-selected"); });
  return r;
}

// ===================================================================== //
// A — comportement, par exécution                                        //
// ===================================================================== //

(function testUneSeuleSectionVisibleAuChargement() {
  const bac = creerBac();
  chargerAppJS(bac);
  const etats = etatsSections(bac);
  // Épinglé un par un — pas seulement « une seule visible quelque part ».
  check("A_agents_visible_au_chargement", etats.agents === false, JSON.stringify(etats));
  SECTIONS.filter((s) => s !== "agents").forEach((s) => {
    check("A_" + s + "_cachee_au_chargement", etats[s] === true, JSON.stringify(etats));
  });
  const sel = ongletsSelectionnes(bac);
  check("A_onglet_agents_selectionne", sel.agents === "true", JSON.stringify(sel));
  check("A_onglet_agents_seul_tabindex_zero", bac.$("onglet-agents").tabIndex === 0);
  SECTIONS.filter((s) => s !== "agents").forEach((s) => {
    check("A_onglet_" + s + "_tabindex_moins_un", bac.$("onglet-" + s).tabIndex === -1);
  });
  // Aucun focus volé au chargement (§6) : la synchronisation initiale ne
  // doit PAS appeler `.focus()`.
  check("A_aucun_focus_vole_au_chargement",
    bac.$("titre-section-agents")._focusAppels === 0 && bac.$("onglet-agents")._focusAppels === 0);
})();

(function testClicBasculeExclusivementVersLaCible() {
  const bac = creerBac();
  chargerAppJS(bac);
  cliquer(bac.$("onglet-cycles"));
  const etats = etatsSections(bac);
  check("A_clic_cycles_visible", etats.cycles === false, JSON.stringify(etats));
  SECTIONS.filter((s) => s !== "cycles").forEach((s) => {
    check("A_clic_" + s + "_cachee_apres_clic_cycles", etats[s] === true, JSON.stringify(etats));
  });
  const sel = ongletsSelectionnes(bac);
  check("A_clic_onglet_cycles_selectionne", sel.cycles === "true", JSON.stringify(sel));
  check("A_clic_onglet_agents_deselectionne", sel.agents === "false", JSON.stringify(sel));
  check("A_clic_roving_tabindex_suit_cycles",
    bac.$("onglet-cycles").tabIndex === 0 && bac.$("onglet-agents").tabIndex === -1);
})();

(function testFocusVaSurLeTitreDeLaSectionPasSurLOnglet() {
  const bac = creerBac();
  chargerAppJS(bac);
  cliquer(bac.$("onglet-fichiers"));
  check("A_focus_sur_le_titre_de_la_section_arrivee",
    bac.$("titre-section-fichiers")._focusAppels === 1,
    "appels=" + bac.$("titre-section-fichiers")._focusAppels);
  check("A_aucun_focus_vole_par_l_onglet_lui_meme",
    bac.$("onglet-fichiers")._focusAppels === 0,
    "le focus doit atterrir sur le TITRE, pas sur l'onglet (§6)");
})();

(function testNavigationClavierFlechesHomeEnd() {
  const bac = creerBac();
  chargerAppJS(bac);
  const empeche1 = appuyer(bac.$("onglet-agents"), "ArrowRight");
  check("A_arrowright_empeche_le_defaut", empeche1 === true);
  check("A_arrowright_va_a_systeme", etatsSections(bac).systeme === false, JSON.stringify(etatsSections(bac)));

  appuyer(bac.$("onglet-systeme"), "ArrowLeft");
  check("A_arrowleft_revient_a_agents", etatsSections(bac).agents === false, JSON.stringify(etatsSections(bac)));

  appuyer(bac.$("onglet-agents"), "ArrowLeft");
  check("A_arrowleft_reboucle_du_premier_au_dernier",
    etatsSections(bac).evenements === false, JSON.stringify(etatsSections(bac)));

  appuyer(bac.$("onglet-evenements"), "End");
  check("A_end_reste_sur_le_dernier", etatsSections(bac).evenements === false);

  appuyer(bac.$("onglet-evenements"), "Home");
  check("A_home_va_au_premier", etatsSections(bac).agents === false, JSON.stringify(etatsSections(bac)));

  const empecheIgnoree = appuyer(bac.$("onglet-agents"), "a");
  check("A_touche_non_geree_ignoree_ne_change_rien",
    empecheIgnoree === false && etatsSections(bac).agents === false);
})();

(function testPersistanceLocalStorageEcriture() {
  const ls = creerLocalStorageMemoire();
  const bac = creerBac({ localStorage: ls });
  chargerAppJS(bac);
  cliquer(bac.$("onglet-evenements"));
  check("A_persistance_ecrit_la_cle_section", ls.getItem("section") === "evenements",
    JSON.stringify(ls._donnees));
})();

(function testLecturePreferenceStockeeAuChargementSansVolerLeFocus() {
  // `theme.js` aurait déjà posé `data-section` avant l'exécution de app.js
  // (préférence retrouvée dans localStorage) — la synchronisation initiale
  // doit suivre CET attribut, sans déplacer le focus.
  const bac = creerBac({ dataSectionInitial: "pilotage-inexistant" });
  chargerAppJS(bac);
  check("A_valeur_inconnue_retombe_sur_agents", etatsSections(bac).agents === false,
    JSON.stringify(etatsSections(bac)));

  const bac2 = creerBac({ dataSectionInitial: "fichiers" });
  chargerAppJS(bac2);
  const etats2 = etatsSections(bac2);
  check("A_preference_stockee_fichiers_appliquee_au_chargement",
    etats2.fichiers === false && etats2.agents === true, JSON.stringify(etats2));
  check("A_synchronisation_initiale_ne_vole_pas_le_focus",
    bac2.$("titre-section-fichiers")._focusAppels === 0);
})();

(function testEcritureLocalStorageQuiLeveAucuneException() {
  const lsCasse = {
    getItem: () => null,
    setItem: () => { throw new Error("quota dépassé"); },
    removeItem: () => {},
  };
  const bac = creerBac({ localStorage: lsCasse });
  chargerAppJS(bac);
  let exception = null;
  try {
    cliquer(bac.$("onglet-cycles"));
  } catch (e) {
    exception = e;
  }
  check("A_ecriture_qui_leve_aucune_exception_remontee", exception === null,
    exception && exception.message);
  check("A_la_section_change_quand_meme_malgre_l_echec_d_ecriture",
    etatsSections(bac).cycles === false);
})();

// ===================================================================== //
// B — structure statique de index.html                                   //
// ===================================================================== //

(function testHtmlHiddenPoseStatiquementPasParJS() {
  // Condition de sécurité 5 : l'attribut `hidden` des cinq sections non
  // par défaut doit être écrit dans le HTML SERVI, pas ajouté par app.js.
  SECTIONS.filter((s) => s !== "agents").forEach((s) => {
    const re = new RegExp('id="section-' + s + '"[^>]*\\bhidden\\b');
    const reInverse = new RegExp('\\bhidden\\b[^>]*id="section-' + s + '"');
    check("B_section_" + s + "_hidden_statique_dans_le_html",
      re.test(HTML) || reInverse.test(HTML),
      "aucun attribut `hidden` statique trouvé sur #section-" + s);
  });
  check("B_section_agents_sans_hidden_statique",
    !new RegExp('id="section-agents"[^>]*\\bhidden\\b').test(HTML));
})();

(function testHtmlNavTablistEtSixOnglets() {
  check("B_nav_role_tablist", /<nav[^>]*role="tablist"/.test(HTML));
  SECTIONS.forEach((s) => {
    const reOnglet = new RegExp('id="onglet-' + s + '"[^>]*role="tab"[^>]*aria-controls="section-' + s + '"'
      + '|id="onglet-' + s + '"[^>]*aria-controls="section-' + s + '"[^>]*role="tab"'
      + '|role="tab"[^>]*id="onglet-' + s + '"[^>]*aria-controls="section-' + s + '"');
    check("B_onglet_" + s + "_role_tab_et_aria_controls", reOnglet.test(HTML));
    check("B_section_" + s + "_existe_comme_cible", new RegExp('id="section-' + s + '"').test(HTML));
  });
})();

/* E5 — les HUIT blocs atteignables, une assertion épinglée par bloc — pas
 * seulement « six sections trouvées » : la section « developper » porte à
 * elle seule trois des huit blocs (Que souhaitez-vous développer ? ·
 * Spécifications · Pilotage), et une assertion d'ensemble sur les SECTIONS
 * ne les distinguerait pas. Chaque bloc est épinglé par son libellé exact
 * (le `<h2>` ou l'élément qui en tient lieu) ET par la section qui le rend
 * atteignable, lue dans le HTML servi. */
(function testHuitBlocsAtteignablesEpinglesUnParUn() {
  function echapper(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function h2DansSection(idSection, texteAttendu) {
    const iSection = HTML.indexOf('id="' + idSection + '"');
    if (iSection === -1) return false;
    // Prochaine section (ou fin de <main>) : borne la recherche du <h2> à
    // l'intérieur de CETTE section, pas n'importe où dans le document.
    const iSuite = HTML.indexOf("<section class=\"section\"", iSection + 1);
    const fin = iSuite === -1 ? HTML.indexOf("</main>") : iSuite;
    const zone = HTML.slice(iSection, fin === -1 ? HTML.length : fin);
    // Le libellé doit être le CONTENU d'un `<h2>`, pas n'importe quelle
    // occurrence de la sous-chaîne dans la zone (une note de prose voisine
    // qui MENTIONNE le libellé, par ex. « le bloc « Pilotage » ci-dessous »,
    // ferait sinon passer ce test alors que le `<h2>` réel a disparu — trouvé
    // par mutation le 2026-09-15, corrigé ici).
    const re = new RegExp("<h2[^>]*>[^<]*" + echapper(texteAttendu) + "[^<]*</h2>");
    return re.test(zone);
  }
  const BLOCS = [
    ["section-agents", "Agents"],
    ["section-systeme", "Système"],
    ["section-developper", "Que souhaitez-vous développer"],
    ["section-developper", "Spécifications"],
    ["section-developper", "Pilotage"],
    ["section-cycles", "Cycles"],
    ["section-fichiers", "Fichiers touchés"],
    ["section-evenements", "Derniers événements"],
  ];
  BLOCS.forEach(([idSection, libelle], index) => {
    check("E5_bloc_" + index + "_" + libelle.replace(/[^a-zA-Z]+/g, "_"),
      h2DansSection(idSection, libelle),
      "bloc « " + libelle + " » introuvable dans #" + idSection);
  });
})();

(function testPorteResteEnfantDirectDuBody() {
  // Condition de sécurité 4 : la porte ne doit JAMAIS être déplacée dans la
  // nav ni dans le contenu principal — vérifié en s'assurant qu'aucune balise
  // <nav ...> ou <main ...> n'ouvre et ne se referme AVANT `#porte-jeton`
  // sans que celui-ci ne soit son enfant (la porte apparaît APRÈS la
  // fermeture de </main>, jamais entre <main ...> et </main>).
  const iMainOuvre = HTML.indexOf("<main");
  const iMainFerme = HTML.indexOf("</main>");
  const iPorte = HTML.indexOf('id="porte-jeton"');
  check("B_porte_presente", iPorte !== -1);
  check("B_porte_hors_de_main",
    iPorte !== -1 && iMainFerme !== -1 && iPorte > iMainFerme,
    "porte@" + iPorte + " main-ouvre@" + iMainOuvre + " main-ferme@" + iMainFerme);
  check("B_aucun_transform_ni_filter_sur_html_body",
    !/\b(html|body)\s*\{[^}]*\b(transform|filter)\s*:/i.test(CSS));
})();

// ===================================================================== //
// C — structure statique de app.css                                      //
// ===================================================================== //

function sansCommentairesCSS(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ""); }
const CSS_SANS_COMMENTAIRES = sansCommentairesCSS(CSS);

(function testMonospaceUniquementSurDesIdentifiantsTechniques() {
  const compteMono = (CSS_SANS_COMMENTAIRES.match(/var\(--mono\)/g) || []).length;
  const compteSans = (CSS_SANS_COMMENTAIRES.match(/var\(--sans\)/g) || []).length;
  // Entrée du cycle mesurée : 31 usages du monospace, 2 du sans-serif
  // (feature-019). Sortie feature-019 : 16 mono (31 - 15 migrés) ; 18
  // sans-serif (2 préexistants + 15 migrés + 1 nouveau, `.fichier .fsujet`,
  // item 3 — le sujet de commit, une phrase humaine, jamais un
  // identifiant). feature-017 (diagramme de déroulé) ajoute DEUX
  // identifiants techniques de plus en chasse fixe (`.dg-sigle`, le sigle
  // d'agent dans le cercle ; le socle du diagramme, pour sa DURÉE — vedette
  // du socle) et des libellés de plus en sans-serif (heure/nom du socle,
  // compte replié, attente, légende — des phrases ou des nombres lus, pas
  // des identifiants).
  // feature-020 (conformité à la maquette) reprend le socle du diagramme :
  // `.dg-libelle tspan:last-child` (texte multi-lignes reconstruit par
  // `app.js`) disparaît, remplacé par des classes posées PAR RÔLE et déjà
  // séparées dans `disposer()` — `.dg-socle-duree`/`.dg-socle-heure-duree`
  // (la DURÉE, vedette, reste en chasse fixe) et `.dg-socle-heure`/
  // `.dg-socle-nom` (déjà en sans-serif). Un libellé d'arc sans-serif de
  // plus (`.dg-arc-libelle`, « reboucle » — une phrase, pas un
  // identifiant). Mesuré par PARCOURS DES RÈGLES (voir E3 plus bas), pas
  // recompté à l'oeil (PIEGES.md paragraphe 21).
  // feature-008 : `.demande textarea.brouillon` rejoint la chasse fixe — le
  // brouillon de spec est du Markdown technique, comme `#tiroir-contenu`.
  check("C_compte_mono_final_dix_neuf", compteMono === 19, "obtenu " + compteMono);
  // feature-008 : `.demande input[type="text"]` (titre du besoin, une
  // phrase lue par un humain — sert à nommer le fichier, n'est pas
  // lui-même un identifiant technique) rejoint le sans-serif.
  check("C_compte_sans_final_vingt_quatre", compteSans === 24, "obtenu " + compteSans);

  // Sélecteurs qui DOIVENT rester en chasse fixe (identifiants techniques :
  // slugs, sigles, codes, chemins, sorties brutes, jeton).
  const DOIT_RESTER_MONO = [
    ".projet", ".note code", ".agents .nom", ".agents .modele",
    ".carte .cid", ".agent-sigle", ".agent-nom", ".maillon .mnom",
    ".dg-sigle", ".dg-socle-duree", ".dg-socle-heure-duree",
    ".pilotage-jeton input", "#sortie-lancement", ".fichier .fcode",
    ".fichier .fchemin", ".timeline .quoi", ".tiroir-barre",
    "#tiroir-contenu", "#porte-champ",
  ];
  DOIT_RESTER_MONO.forEach((selecteur) => {
    const i = CSS_SANS_COMMENTAIRES.indexOf(selecteur);
    check("C_reste_mono_" + selecteur, i !== -1, "sélecteur introuvable : " + selecteur);
  });

  // Sélecteurs de LIBELLÉS qui doivent avoir basculé en sans-serif.
  const DOIT_ETRE_SANS = [
    ".jauge", ".horodatage", ".bloc h2", ".compteur", ".systeme dd",
    '.filtres input[type="search"]', ".colonne-entete", ".etiquette",
    ".cycle-designation", ".cycle-etat", ".cycle-proprietes dd",
    ".maillon .mduree", ".pilotage-ligne", ".pilotage-tronque",
    ".timeline .heure",
  ];
  DOIT_ETRE_SANS.forEach((selecteur) => {
    const i = CSS_SANS_COMMENTAIRES.indexOf(selecteur);
    check("C_passe_sans_" + selecteur, i !== -1, "sélecteur introuvable : " + selecteur);
  });
})();

/* ===================================================================== *
 * C bis — E3 : TOUT `var(--mono)` résiduel appartient à une liste blanche,
 * établie par PARCOURS DES RÈGLES de la feuille — pas par présence isolée
 * d'un sélecteur dans la chaîne, qui ne prouve ni l'exhaustivité ni
 * l'absence de doublon.
 *
 * ⚠️ Le comptage naïf par « dernière ligne finissant par une accolade » se
 * trompe sur les règles tenant sur une seule ligne (ex. `.projet { ...
 * font-family: var(--mono); ... }`) : il annonçait 24 sélecteurs et 6
 * doublons sur l'ENTRÉE du cycle, quand le parcours correct par profondeur
 * d'accolade en donne 31, tous distincts. Le parseur ci-dessous marche par
 * profondeur de `{`/`}`, pas par fin de ligne — il traite donc aussi bien
 * une règle multi-lignes qu'une règle tassée sur une seule ligne, et
 * descend dans les blocs `@media` sans les prendre pour des règles.
 * ===================================================================== */

function analyserReglesCSS(css) {
  const regles = [];
  let i = 0;
  const n = css.length;
  let debutEntete = 0;
  while (i < n) {
    if (css[i] === "{") {
      const entete = css.slice(debutEntete, i).trim();
      if (/^@/.test(entete)) {
        // `@media (...)`, `@font-face`… : pas une règle, on descend dedans
        // sans capturer — les règles qu'il contient sont capturées à leur
        // propre passage par cette même boucle.
        i += 1;
        debutEntete = i;
        continue;
      }
      let profondeur = 1;
      let j = i + 1;
      while (j < n && profondeur > 0) {
        if (css[j] === "{") profondeur += 1;
        else if (css[j] === "}") profondeur -= 1;
        j += 1;
      }
      regles.push({ selecteur: entete, corps: css.slice(i + 1, j - 1) });
      i = j;
      debutEntete = i;
      continue;
    }
    if (css[i] === "}") {
      i += 1;
      debutEntete = i;
      continue;
    }
    i += 1;
  }
  return regles;
}

(function testMonospaceResiduelParParcoursDesRegles() {
  const regles = analyserReglesCSS(CSS_SANS_COMMENTAIRES);
  check("prealable_parseur_trouve_des_regles", regles.length > 50, "obtenu " + regles.length);

  // Témoin négatif du parseur lui-même : une règle tassée sur une seule
  // ligne doit être détectée au même titre qu'une règle étalée — sinon ce
  // parseur reproduit exactement le défaut du comptage naïf qu'il remplace.
  const sondeUneLigne = analyserReglesCSS(".sonde-une-ligne { font-family: var(--mono); }");
  check("prealable_parseur_detecte_une_regle_sur_une_seule_ligne",
    sondeUneLigne.length === 1 && sondeUneLigne[0].selecteur === ".sonde-une-ligne"
    && /var\(--mono\)/.test(sondeUneLigne[0].corps),
    JSON.stringify(sondeUneLigne));

  const selecteursMono = new Set();
  regles.forEach((r) => {
    if (/var\(--mono\)/.test(r.corps)) {
      r.selecteur.split(",").map((s) => s.trim()).filter(Boolean)
        .forEach((s) => selecteursMono.add(s));
    }
  });

  // Liste blanche : identifiants techniques (slugs, sigles, codes, chemins,
  // sorties brutes, jeton) — déclarée ICI, comparée à ce que le parcours des
  // règles trouve RÉELLEMENT, dans les deux sens (rien d'omis, rien de mort).
  // `.pilotage-select select` (options = clés de commande déclarées en
  // configuration, un identifiant au même titre que `.pilotage-jeton input`)
  // manquait de la liste écrite à la main par le développeur — trouvé
  // PRÉCISÉMENT par ce parcours, ce qu'une vérification par simple présence
  // de sous-chaîne ne pouvait pas révéler puisqu'elle ne compare jamais
  // l'ensemble résiduel à la liste, seulement la liste au texte.
  const LISTE_BLANCHE_MONO = [
    ".projet", ".note code", ".agents .nom", ".agents .modele",
    ".carte .cid", ".agent-sigle", ".agent-nom", ".maillon .mnom",
    // feature-017 : sigle d'agent DANS le diagramme — même nature
    // d'identifiant que `.agent-sigle` ci-dessus.
    // feature-020 : le socle du diagramme est désormais peint par CLASSE DE
    // RÔLE (`disposer()`/`construireSoclesCreneau`, jamais par position) —
    // `.dg-libelle tspan:last-child` (texte reconstruit à la main par
    // `app.js`) disparaît ; la DURÉE (vedette du socle, §8) reste en chasse
    // fixe sous ses deux formes (créneau simple / empilé).
    ".dg-sigle", ".dg-socle-duree", ".dg-socle-heure-duree",
    ".pilotage-jeton input", ".pilotage-select select", "#sortie-lancement",
    ".fichier .fcode", ".fichier .fchemin", ".timeline .quoi",
    ".tiroir-barre", "#tiroir-contenu", "#porte-champ",
    // feature-008 : le brouillon de spec relu avant écriture — texte
    // Markdown technique, même nature que `#tiroir-contenu`.
    ".demande textarea.brouillon",
  ];

  const blancheSet = new Set(LISTE_BLANCHE_MONO);
  selecteursMono.forEach((s) => {
    check("E3_selecteur_mono_residuel_" + s + "_dans_la_liste_blanche",
      blancheSet.has(s), "sélecteur trouvé par parcours des règles, absent de la liste blanche : " + s);
  });
  LISTE_BLANCHE_MONO.forEach((s) => {
    check("E3_entree_liste_blanche_" + s + "_reellement_utilisee",
      selecteursMono.has(s), "sélecteur de la liste blanche introuvable par parcours des règles : " + s);
  });
  check("E3_liste_blanche_meme_cardinal_que_le_residu_reel",
    selecteursMono.size === LISTE_BLANCHE_MONO.length,
    "résidu réel: " + selecteursMono.size + ", liste blanche: " + LISTE_BLANCHE_MONO.length);
})();

(function testChiffresTabularNums() {
  const CIBLES = [".systeme dd", ".timeline .heure", ".colonne-entete", ".compteur", ".horodatage", ".maillon .mduree"];
  CIBLES.forEach((selecteur) => {
    const i = CSS_SANS_COMMENTAIRES.indexOf(selecteur);
    if (i === -1) { check("C_tabular_nums_" + selecteur, false, "sélecteur introuvable"); return; }
    const finBloc = CSS_SANS_COMMENTAIRES.indexOf("}", i);
    const bloc = CSS_SANS_COMMENTAIRES.slice(i, finBloc);
    check("C_tabular_nums_" + selecteur, bloc.indexOf("tabular-nums") !== -1, "bloc: " + bloc.trim());
  });
})();

(function testBlocH2TroisCorrections() {
  const i = CSS_SANS_COMMENTAIRES.indexOf(".bloc h2");
  const fin = CSS_SANS_COMMENTAIRES.indexOf("}", i);
  const bloc = CSS_SANS_COMMENTAIRES.slice(i, fin);
  check("C_bloc_h2_sans_serif", bloc.indexOf("var(--sans)") !== -1, bloc);
  check("C_bloc_h2_dix_huit_px", /font-size:\s*18px/.test(bloc), bloc);
  check("C_bloc_h2_texte_pas_faible", /color:\s*var\(--texte\)\s*;/.test(bloc), bloc);
  check("C_bloc_h2_pas_de_majuscules", !/text-transform/.test(bloc), bloc);
  check("C_bloc_h2_pas_d_interlettrage", !/letter-spacing/.test(bloc), bloc);
})();

(function testQuatriemeSurfaceLimiteeAuxInteractions() {
  const compte = (CSS_SANS_COMMENTAIRES.match(/var\(--surface-2\)/g) || []).length;
  // Trois des cinq usages D'ENTRÉE étaient des aplats de repos sur des blocs
  // déjà délimités par un filet (violation du §3) : migrés vers
  // `var(--surface)`. Les deux usages D'ENTRÉE restants sont des teintes
  // D'INTERACTION (survol, sélection), pas des niveaux structurels — plus UN
  // troisième, nouveau, introduit par la navigation elle-même (`.nav-onglet`
  // au survol) : même registre, même justification.
  check("C_surface_2_final_trois_usages_interaction", compte === 3, "obtenu " + compte);
  check("C_surface_2_theme_bouton_selectionne_conserve",
    CSS_SANS_COMMENTAIRES.indexOf('.theme-bouton[aria-checked="true"]') !== -1
    && /\.theme-bouton\[aria-checked="true"\]\s*\{[^}]*var\(--surface-2\)/.test(CSS_SANS_COMMENTAIRES));
  check("C_surface_2_cycle_bouton_survol_conserve",
    /\.cycle-bouton:hover\s*\{[^}]*var\(--surface-2\)/.test(CSS_SANS_COMMENTAIRES));
  check("C_surface_2_nav_onglet_survol_conserve",
    /\.nav-onglet:hover\s*\{[^}]*var\(--surface-2\)/.test(CSS_SANS_COMMENTAIRES));
  // Les trois aplats migrés référencent désormais `var(--surface)`.
  check("C_bandeau_hote_surface_pas_surface_2",
    /\.bandeau-hote\s*\{[^}]*background:\s*var\(--surface\)\s*;/.test(CSS_SANS_COMMENTAIRES));
  check("C_carte_surface_pas_surface_2",
    /\.carte\s*\{[^}]*background:\s*var\(--surface\)\s*;/.test(CSS_SANS_COMMENTAIRES));
  check("C_maillon_surface_pas_surface_2",
    /\.maillon\s*\{[^}]*background:\s*var\(--surface\)\s*[;,]/.test(CSS_SANS_COMMENTAIRES));
})();

(function testFsujetDistinctDeFchemin() {
  check("C_fsujet_existe_en_sans_serif",
    /\.fichier \.fsujet\s*\{[^}]*var\(--sans\)/.test(CSS_SANS_COMMENTAIRES));
  check("C_fchemin_reste_en_chasse_fixe",
    /\.fichier \.fchemin\s*\{[^}]*var\(--mono\)/.test(CSS_SANS_COMMENTAIRES));
  const appJs = fs.readFileSync(APP_JS_PATH, "utf8");
  check("C_app_js_utilise_fsujet_pour_le_sujet_de_commit",
    /el\("span",\s*"fsujet",\s*commit\.sujet\)/.test(appJs));
  check("C_app_js_n_utilise_plus_fchemin_pour_le_sujet_de_commit",
    !/el\("span",\s*"fchemin",\s*commit\.sujet\)/.test(appJs));
})();

/* Condition de sécurité 2, RÉÉCRITE après revue : une comparaison de
 * POSITIONS dans le texte ne prouve rien sur la cascade, qui se décide par
 * SPÉCIFICITÉ d'abord, ordre seulement à égalité. Le relecteur l'a prouvé :
 * `.contenu .section { display: flex }` placé APRÈS `.section[hidden]`
 * (0,2,0) porte la MÊME spécificité (deux classes, 0,2,0) et gagne par
 * ordre — les six sections s'affichaient d'un coup, et l'ancienne version
 * de ce test restait verte puisqu'elle ne regardait que des offsets.
 *
 * Calcul de spécificité CSS standard (a,b,c) = (id, classes/attributs/
 * pseudo-classes, éléments/pseudo-éléments), sur CHAQUE règle dont le
 * DERNIER COMPOUND du sélecteur cible `.section` elle-même (pas un
 * descendant, ex. `.section .bloc` ne compte pas : ce n'est pas `.section`
 * qui reçoit alors le `display`).
 *
 * ⚠️ Portée assumée : ne détecte que les sélecteurs qui RÉFÉRENCENT la
 * classe `.section` (la convention réellement suivie dans cette feuille —
 * `#section-cycles { display: … }` par exemple resterait hors de portée).
 * Élargir à une correspondance de sélecteur complète (id/élément/attribut
 * sans la classe) demanderait un moteur de sélecteurs, pas une mesure de
 * spécificité sur du texte. */
function calculerSpecificite(selecteur) {
  let a = 0, b = 0, c = 0;
  const re = /(#[a-zA-Z0-9_-]+)|(\.[a-zA-Z0-9_-]+)|(\[[^\]]+\])|(::[a-zA-Z-]+)|(:[a-zA-Z-]+(?:\([^)]*\))?)|([a-zA-Z][a-zA-Z0-9-]*)|(\*)/g;
  let m;
  while ((m = re.exec(selecteur))) {
    if (m[1]) a += 1;
    else if (m[2]) b += 1;
    else if (m[3]) b += 1;
    else if (m[4]) c += 1;
    else if (m[5]) b += 1;
    else if (m[6]) c += 1;
    // m[7] (`*`) : 0, aucune contribution.
  }
  return [a, b, c];
}
function specificitePlusGrandeOuEgale(x, y) {
  if (x[0] !== y[0]) return x[0] > y[0];
  if (x[1] !== y[1]) return x[1] > y[1];
  return x[2] >= y[2];
}
function specificiteEgale(x, y) { return x[0] === y[0] && x[1] === y[1] && x[2] === y[2]; }
function dernierCompound(selecteurPartie) {
  const morceaux = selecteurPartie.trim().split(/\s+/);
  return morceaux[morceaux.length - 1];
}
function cibleLaClasseSection(compound) {
  return /\.section(?![-\w])/.test(compound);
}

(function testAucuneRegleDisplayNeMenaceLeMasquageParSpecificite() {
  const regles = analyserReglesCSS(CSS_SANS_COMMENTAIRES);

  // Témoin négatif du calculateur lui-même : `.contenu .section` doit
  // mesurer (0,2,0), à ÉGALITÉ avec `.section[hidden]` — sinon ce test ne
  // détecterait pas la mutation qui l'a fait naître.
  check("prealable_specificite_contenu_section_deux_classes",
    JSON.stringify(calculerSpecificite(".contenu .section")) === JSON.stringify([0, 2, 0]),
    JSON.stringify(calculerSpecificite(".contenu .section")));
  check("prealable_specificite_section_simple_une_classe",
    JSON.stringify(calculerSpecificite(".section")) === JSON.stringify([0, 1, 0]),
    JSON.stringify(calculerSpecificite(".section")));

  function displayImportant(corps) {
    return /display\s*:[^;]*!important/i.test(corps);
  }

  // La règle de masquage elle-même, repérée par son DERNIER compound exact.
  let indexMasquage = -1, specMasquage = null, masquageImportant = false;
  regles.forEach((r, i) => {
    r.selecteur.split(",").map((s) => s.trim()).forEach((partie) => {
      if (dernierCompound(partie) === ".section[hidden]") {
        indexMasquage = i;
        specMasquage = calculerSpecificite(partie);
        masquageImportant = displayImportant(r.corps);
      }
    });
  });
  check("prealable_regle_masquage_trouvee", indexMasquage !== -1);
  check("prealable_specificite_masquage_deux",
    !!specMasquage && JSON.stringify(specMasquage) === JSON.stringify([0, 2, 0]),
    JSON.stringify(specMasquage));
  if (indexMasquage === -1 || !specMasquage) return;

  /* Critère GATE reformulé après le second passage sécurité : « aucune
   * règle `display` d'auteur ne peut BATTRE `.section[hidden]` EN CASCADE »
   * — spécificité, origine, `!important`, ordre — jamais « déclarée après »
   * seule. Un `!important` de plus faible spécificité bat un non-important
   * de spécificité supérieure : traité EN PREMIER, avant la comparaison de
   * spécificité, qui ne s'applique qu'entre règles de même statut
   * `!important`. Couvre aussi bien les sélecteurs DESCENDANTS que les
   * règles sous `@media` — `analyserReglesCSS` descend déjà dans les
   * `@media`, rien de spécifique à ajouter ici. */
  let menaces = 0;
  regles.forEach((r, i) => {
    if (i === indexMasquage) return;
    if (!/display\s*:/.test(r.corps)) return;
    const important = displayImportant(r.corps);
    r.selecteur.split(",").map((s) => s.trim()).forEach((partie) => {
      if (!cibleLaClasseSection(dernierCompound(partie))) return;
      const spec = calculerSpecificite(partie);
      let raison = null;
      if (important && !masquageImportant) {
        raison = "!important, le masquage ne l'est pas";
      } else if (!important && masquageImportant) {
        raison = null; // le masquage important gagne toujours ici
      } else {
        const egale = specificiteEgale(spec, specMasquage);
        const plusForte = specificitePlusGrandeOuEgale(spec, specMasquage) && !egale;
        const gagneParOrdre = egale && i > indexMasquage;
        if (plusForte) raison = "spécificité supérieure" + (important ? " (les deux !important)" : "");
        else if (gagneParOrdre) raison = "égalité, mais déclarée après" + (important ? " (les deux !important)" : "");
      }
      if (raison) {
        menaces += 1;
        check("E7_c2_menace_" + partie.replace(/[^a-zA-Z0-9]+/g, "_"), false,
          "sélecteur « " + partie + "» (spécificité " + JSON.stringify(spec) + ", règle #" + i
          + (important ? ", !important" : "") + ") menace le masquage (spécificité "
          + JSON.stringify(specMasquage) + ", règle #" + indexMasquage + ") — " + raison);
      }
    });
  });
  check("E7_c2_aucune_regle_display_ne_menace_le_masquage", menaces === 0,
    menaces + " menace(s) trouvée(s) — voir les cas E7_c2_menace_* ci-dessus");
})();

(function testProfondeurNavSousLaBarre() {
  const m = CSS_SANS_COMMENTAIRES.match(/\.nav-sections\s*\{[^}]*\}/);
  check("C_nav_sections_declaree", !!m);
  if (!m) return;
  const zMatch = m[0].match(/z-index:\s*(\d+)/);
  check("C_nav_z_index_present", !!zMatch, m[0]);
  if (zMatch) {
    const z = parseInt(zMatch[1], 10);
    check("C_nav_z_index_sous_trente", z < 30, "obtenu " + z);
    check("C_nav_z_index_recommande_onze", z === 11, "obtenu " + z + " (recommandé : 11)");
  }
})();

(function testThemeJsCommentaireCorrige() {
  const themeJs = fs.readFileSync(path.join(ICI, "theme.js"), "utf8");
  check("C_theme_js_ne_dit_plus_que_la_csp_interdit_le_style_inline",
    !/CSP servie interdit[^]*?unsafe-inline`, voir server\.py/.test(themeJs)
    || /style-src[^]*?unsafe-inline/.test(themeJs) || /autorise[^]*?style inline/.test(themeJs),
    "le commentaire doit distinguer script (interdit) et style (autorisé)");
  check("C_theme_js_mentionne_les_scripts_explicitement", /SCRIPTS/.test(themeJs));
})();

/* Condition de sécurité 3, EXHAUSTIVE : tout `z-index` déclaré dans la
 * feuille — pas seulement `.nav-sections` — reste sous la profondeur 30,
 * SAUF la porte d'authentification elle-même (`#porte-jeton` / `.porte`),
 * qui EST le plafond documenté. Établi par parcours des règles, pas par une
 * liste de sélecteurs choisie à la main : un futur élément fixe qui
 * dépasserait 30 (ou qui égalerait la porte) fait échouer ce test sans
 * modification. */
(function testTousLesZIndexRestentSousLaPorte() {
  const regles = analyserReglesCSS(CSS_SANS_COMMENTAIRES);
  const PORTE = new Set(["#porte-jeton", ".porte", ".porte-fond", ".porte-carte"]);
  let trouves = 0;
  regles.forEach((r) => {
    const m = r.corps.match(/z-index:\s*(\d+)/);
    if (!m) return;
    trouves += 1;
    const z = parseInt(m[1], 10);
    const estPorte = r.selecteur.split(",").map((s) => s.trim()).some((s) => PORTE.has(s));
    if (estPorte) {
      check("E7_c3_porte_" + r.selecteur.replace(/[^a-zA-Z-]+/g, "_") + "_est_le_plafond_trente",
        z === 30, "obtenu " + z + " sur " + r.selecteur);
    } else {
      check("E7_c3_" + r.selecteur.replace(/[^a-zA-Z-]+/g, "_") + "_sous_trente",
        z < 30, "obtenu " + z + " sur " + r.selecteur);
    }
  });
  check("prealable_au_moins_six_regles_z_index_trouvees", trouves >= 6, "obtenu " + trouves);
})();

/* E10 — un rafraîchissement périodique ne change pas la section affichée :
 * établi STRUCTURELLEMENT, en isolant le corps de `rafraichir()` (la
 * fonction rebranchée sur `setInterval`) et en prouvant qu'il n'appelle
 * JAMAIS `appliquerSection`, la seule fonction qui pose `hidden` ou
 * `data-section`. */
(function testRafraichissementNeTouchePasLaSection() {
  const appJs = fs.readFileSync(APP_JS_PATH, "utf8");
  check("prealable_setinterval_rafraichir_present",
    /setInterval\(rafraichir,/.test(appJs));
  const iDebut = appJs.indexOf("async function rafraichir()");
  check("prealable_fonction_rafraichir_trouvee", iDebut !== -1);
  if (iDebut === -1) return;
  let profondeur = 0, j = appJs.indexOf("{", iDebut), debutCorps = j + 1, k = j;
  profondeur = 1;
  k += 1;
  while (k < appJs.length && profondeur > 0) {
    if (appJs[k] === "{") profondeur += 1;
    else if (appJs[k] === "}") profondeur -= 1;
    k += 1;
  }
  const corpsRafraichir = appJs.slice(debutCorps, k - 1);
  check("E10_rafraichir_n_appelle_jamais_appliquerSection",
    !/appliquerSection\(/.test(corpsRafraichir),
    "rafraichir() ne doit jamais changer la section affichée");
})();

/* E9 — repli à 600 px, par lecture de la règle `@media (max-width: 600px)` :
 * aucune section/onglet rendu inatteignable (pas de `display: none` sur
 * `.nav-onglet` ou `.nav-sections`), et la cible tactile ≥ 44 px de
 * `.nav-onglet` (définie hors media query) n'est pas réduite dans le repli.
 * Complété par un test en navigateur réel (`test_app_navigation_http.py`)
 * pour la géométrie effectivement calculée. */
(function testReplique600pxNAucuneCibleInatteignable() {
  const m = CSS_SANS_COMMENTAIRES.match(/@media\s*\(max-width:\s*600px\)\s*\{([\s\S]*?)\n\}/);
  check("prealable_media_600px_trouve", !!m);
  if (!m) return;
  const bloc = m[1];
  check("E9_600px_nav_onglet_pas_display_none", !/\.nav-onglet\s*\{[^}]*display:\s*none/.test(bloc));
  check("E9_600px_nav_sections_pas_display_none", !/\.nav-sections\s*\{[^}]*display:\s*none/.test(bloc));
  check("E9_600px_nav_onglet_min_height_non_redefinie_plus_petite",
    !/\.nav-onglet\s*\{[^}]*min-height:\s*([1-3]?[0-9]|4[0-3])px/.test(bloc));
  const mBase = CSS_SANS_COMMENTAIRES.match(/\.nav-onglet\s*\{[^}]*\}/);
  check("E9_nav_onglet_cible_44px_hors_media",
    !!mBase && /min-height:\s*44px/.test(mBase[0]), mBase && mBase[0]);
})();

console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
for (const e of _echecs) console.log("  - " + e);
process.exit(_echecs.length ? 1 : 0);
