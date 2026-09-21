"use strict";
/* bug-017 — absorbée dans feature-021 (cycle 2, lot 3) au titre d'ADR-0017 :
 * la porte d'authentification doit rendre le RESTE DU DOCUMENT INERTE, pas
 * seulement reprendre un focus qui s'en échappe.
 *
 *     node control-center/web/test_app_bug017.js
 *
 * Ce fichier établit, PAR EXÉCUTION (`vm`, zéro dépendance — ADR-0006) :
 *
 *  A. À l'ouverture, TOUS les frères de `#porte-jeton` (et EUX SEULS —
 *     jamais la porte elle-même) reçoivent `inert`.
 *  B. À la fermeture, `inert` est retiré de tous les frères.
 *  C. Le focus revient à un endroit NOMMÉ à la fermeture : l'élément qui
 *     avait le focus avant l'ouverture s'il existe encore, sinon
 *     `#main-content` (jamais `document.body`, qui ne nomme rien).
 *  D. Le déclenchement RÉEL (`verifierEtatAuth()` → 401 → `ouvrirPorte()`,
 *     le chemin qu'emprunte une vraie page sans jeton) engage le même
 *     mécanisme — pas seulement un appel direct aux fonctions internes.
 *
 * ⚠️ Ce que ce fichier NE peut PAS établir : que `inert` neutralise
 * RÉELLEMENT la tabulation dans un moteur de rendu (le bac à sable `vm` ne
 * modélise aucun ordre de tabulation) — c'est le rôle de F4b (lot 5,
 * `feature-021`), qui COMPTE les contrôles atteignables hors modale en HTTP
 * + Chromium. Ce fichier établit le MÉCANISME structurel (l'attribut est
 * posé sur les bons noeuds, au bon moment, et seulement sur eux) ; F4b en
 * établira l'EFFET.
 *
 * ⚠️ Limite du bac à sable, distincte de PIEGES §38/§39 : les harnais
 * existants de ce module (`test_app_bug012.js` et consorts) ne modélisent
 * PAS `parentNode`/`children` — un arbre plat suffisait tant qu'aucun test
 * ne parcourait les FRÈRES d'un noeud. Ce fichier construit donc son PROPRE
 * bac à sable, avec une topologie `document.body` réelle (dupliquée, pas
 * partagée — même convention que les autres harnais de ce module, cf.
 * l'en-tête de `test_app_accordeon.js`).
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

// ===================================================================== //
// A0 — non-régression STATIQUE, sur le HTML réellement servi : `#porte-
// jeton` reste enfant direct de `<body>`, au-dessus de `<main>` — condition
// héritée de feature-019, PRÉCONDITION du mécanisme d'inertie ci-dessous.
// Parenté vérifiée en comptant les balises `<body`/`<div class="app-shell"`
// qui s'ouvrent et se referment AVANT `#porte-jeton` : si la porte était
// descendue dans `.app-shell`, ce compte serait déséquilibré.
// ===================================================================== //
(function testPreconditionStructurelle() {
  const html = fs.readFileSync(path.join(ICI, "index.html"), "utf8");
  const iBody = html.indexOf("<body>");
  const iAppShellOuvre = html.indexOf('<div class="app-shell">');
  const iAppShellFerme = html.lastIndexOf("</div>\n</body>") !== -1
    ? html.lastIndexOf("<div class=\"app-shell\">") : -1;
  const iPorte = html.indexOf('id="porte-jeton"');
  check("A0_body_porte_appshell_tous_presents",
    iBody !== -1 && iAppShellOuvre !== -1 && iPorte !== -1,
    "body@" + iBody + " app-shell@" + iAppShellOuvre + " porte@" + iPorte);
  // `.app-shell` doit se REFERMER avant que la porte n'apparaisse — sinon
  // la porte serait descendue À L'INTÉRIEUR.
  const iAppShellFinBloc = (function () {
    // recherche naïve mais suffisante ici : premier `</div>` de plus haut
    // niveau après l'ouverture — approximé en cherchant la fermeture du
    // `<main>` qu'`.app-shell` contient, puis le `</div>` qui suit.
    const iMainFerme = html.indexOf("</main>", iAppShellOuvre);
    if (iMainFerme === -1) return -1;
    return html.indexOf("</div>", iMainFerme);
  })();
  check("A0_porte_apres_fermeture_app_shell",
    iAppShellFinBloc !== -1 && iPorte > iAppShellFinBloc,
    "app-shell fermé@" + iAppShellFinBloc + " porte@" + iPorte);

  // ------------------------------------------------------------------ //
  // ⚠️ Les deux checks ci-dessus vérifient un ORDRE, pas une PARENTÉ.
  // Mesuré en reboucle du lot 3 : envelopper `#porte-jeton` dans un
  // `<div>` quelconque les laisse TOUS LES DEUX verts (la porte reste
  // après `.app-shell`), alors que `fixerInerteAutourDeLaPorte` parcourt
  // les FRÈRES de la porte — enveloppée, elle n'en a plus hors de
  // l'enveloppe, donc PLUS RIEN ne reçoit `inert` et toute la page
  // redevient atteignable. Le défaut d'origine de bug-017, revenu, suite
  // verte. D'où une vraie mesure de PROFONDEUR ci-dessous.
  // ------------------------------------------------------------------ //
  const VIDES = new Set(["meta", "link", "br", "hr", "img", "input", "source", "area", "base", "col", "embed", "param", "track", "wbr"]);
  function profondeurDeLId(htmlTexte, idCherche) {
    const sansCommentaires = htmlTexte.replace(/<!--[\s\S]*?-->/g, "");
    const jeton = /<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
    let m, profondeur = 0, dansBody = false;
    while ((m = jeton.exec(sansCommentaires)) !== null) {
      const brut = m[0];
      const nom = m[1].toLowerCase();
      const fermante = brut.startsWith("</");
      const autoFermante = brut.endsWith("/>") || VIDES.has(nom);
      if (nom === "body") { dansBody = !fermante; profondeur = 0; continue; }
      if (!dansBody) continue;
      if (fermante) { profondeur -= 1; continue; }
      // l'attribut cherché est porté par CETTE balise ouvrante
      if (m[2].indexOf(idCherche) !== -1) return profondeur;
      if (!autoFermante) profondeur += 1;
    }
    return -1;
  }
  const prof = profondeurDeLId(html, 'id="porte-jeton"');
  check("A0_porte_est_enfant_direct_de_body", prof === 0,
    "profondeur mesurée sous <body> : " + prof + " (0 = enfant direct ; " +
    "toute valeur > 0 signifie que la porte est enveloppée et n'a plus les " +
    "frères que fixerInerteAutourDeLaPorte rend inertes)");

  // ------------------------------------------------------------------ //
  // Ce que bug-017 demande RÉELLEMENT : zéro contrôle atteignable hors de
  // la porte quand elle est ouverte. Le comptage COMPLET, en HTTP et au
  // clavier, est la garde F4b du lot 5 (feature-021) — ici, la version
  // STATIQUE que le DOM servi permet : tout élément focalisable doit être
  // SOIT dans la porte, SOIT dans un sous-arbre qui reçoit `inert`.
  // Relevé d'origine (auditeur, 2026-09-15) : 2 atteignables en section par
  // défaut, jusqu'à 6 en « Développer », dont le bouton de lancement.
  // ------------------------------------------------------------------ //
  // feature-021 cycle 2, lot 4 : `#gabarits-adoptes` (gabarit statique du
  // disque d'agent et de la carte kanban, F3a) rejoint la liste — il est
  // `hidden` PAR CONSTRUCTION (déjà retiré du rendu et de l'arbre
  // d'accessibilité, PIEGES §15) ET reçoit `inert` comme tout autre frère à
  // l'ouverture de la porte (double protection, aucune n'est retirée).
  const FRERES_INERTES = ["bandeau-hote", "skip-link", "app-shell", "tiroir", "gabarits-adoptes"];
  const FOCALISABLE = /<(a\s[^>]*href=|button|input|select|textarea|[a-zA-Z][a-zA-Z0-9-]*\s[^>]*tabindex=")/gi;
  (function compterAtteignablesHorsPorte() {
    const sansCommentaires = html.replace(/<!--[\s\S]*?-->/g, "");
    const iCorps = sansCommentaires.indexOf("<body>");
    const corps = sansCommentaires.slice(iCorps);
    // découpe en sous-arbres de premier niveau sous <body>
    const zones = [];
    const jeton = /<\/?([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
    let m, profondeur = 0, debut = -1, etiquette = null;
    while ((m = jeton.exec(corps)) !== null) {
      const nom = m[1].toLowerCase();
      const fermante = m[0].startsWith("</");
      const autoFermante = m[0].endsWith("/>") || VIDES.has(nom);
      if (nom === "body" || nom === "script") { if (!fermante && nom === "script") { /* ignoré */ } continue; }
      if (fermante) {
        profondeur -= 1;
        if (profondeur === 0 && debut !== -1) {
          zones.push({ etiquette: etiquette, texte: corps.slice(debut, jeton.lastIndex) });
          debut = -1; etiquette = null;
        }
        continue;
      }
      if (profondeur === 0) {
        const idm = /id="([^"]+)"/.exec(m[2]);
        const clm = /class="([^"]+)"/.exec(m[2]);
        etiquette = idm ? idm[1] : (clm ? clm[1].split(/\s+/)[0] : nom);
        if (autoFermante) { zones.push({ etiquette: etiquette, texte: m[0] }); etiquette = null; continue; }
        debut = m.index;
      }
      if (!autoFermante) profondeur += 1;
    }
    const atteignables = [];
    for (const z of zones) {
      if (z.etiquette === "porte-jeton") continue;              // dans la porte : légitime
      if (FRERES_INERTES.indexOf(z.etiquette) !== -1) continue; // rendu inert à l'ouverture
      FOCALISABLE.lastIndex = 0;
      const n = (z.texte.match(FOCALISABLE) || []).length;
      if (n > 0) atteignables.push(z.etiquette + " (" + n + ")");
    }
    console.log("[dérivé] sous-arbres de premier niveau sous <body> : " +
      zones.map((z) => z.etiquette).join(", "));
    check("A0_zero_controle_atteignable_hors_porte_quand_ouverte",
      atteignables.length === 0,
      atteignables.length + " sous-arbre(s) focalisable(s) ni dans la porte ni rendus " +
      "inertes : " + atteignables.join(", "));
  })();
})();

// ===================================================================== //
// Bac à sable dédié — topologie réelle de `document.body`
// ===================================================================== //
function creerBac() {
  const elements = new Map();
  const document_ = { activeElement: null };

  class FakeNode {
    constructor(tag) {
      this.tagName = String(tag || "div").toUpperCase();
      this.children = [];
      this.parentNode = null;
      this._text = "";
      this.className = "";
      this.hidden = false;
      this.disabled = false;
      this.value = "";
      this.id = "";
      this._attrs = {};
      this._listeners = {};
      this._focusAppels = 0;
    }
    set textContent(v) { this._text = v === undefined || v === null ? "" : String(v); this.children = []; }
    get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join("") : this._text; }
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
    removeChild(child) {
      const i = this.children.indexOf(child);
      if (i >= 0) { this.children.splice(i, 1); child.parentNode = null; }
      return child;
    }
    setAttribute(nom, valeur) { this._attrs[nom] = String(valeur); }
    getAttribute(nom) { return Object.prototype.hasOwnProperty.call(this._attrs, nom) ? this._attrs[nom] : null; }
    hasAttribute(nom) { return Object.prototype.hasOwnProperty.call(this._attrs, nom); }
    removeAttribute(nom) { delete this._attrs[nom]; }
    addEventListener(type, gestionnaire) { (this._listeners[type] = this._listeners[type] || []).push(gestionnaire); }
    focus() { this._focusAppels += 1; document_.activeElement = this; }
    get classList() {
      const self = this;
      return {
        add: (c) => { self.className = (self.className ? self.className + " " : "") + c; },
        contains: (c) => self.className.split(/\s+/).filter(Boolean).indexOf(c) !== -1,
      };
    }
  }

  function creer(id, tag) {
    const n = new FakeNode(tag || "div");
    if (id) { n.id = id; elements.set(id, n); }
    return n;
  }

  // -- topologie réelle : `porte-jeton` ENFANT DIRECT de `body`, avec ses
  // QUATRE frères (bandeau-hote, lien d'évitement, app-shell, tiroir) —
  // reproduit `index.html` au niveau qui compte pour ce mécanisme. --------
  const body = creer(null, "body");
  const bandeauHote = creer("bandeau-hote", "div");
  const skipLink = creer(null, "a");
  const appShell = creer(null, "div");
  const tiroir = creer("tiroir", "div");
  const porteJeton = creer("porte-jeton", "div");
  [bandeauHote, skipLink, appShell, tiroir, porteJeton].forEach((n) => body.appendChild(n));

  // Reste des id que `app.js` référence à l'amorçage ou dans les chemins
  // exercés ici — regroupés sous `.app-shell` (peu importe où exactement,
  // seul `getElementById` compte pour ces id-là ; PIEGES §38).
  const AUTRES_IDS = [
    "bandeau-hote-bouton", "bandeau-hote-texte", "barre", "jauge-flux", "jauge-git",
    "jauge-pilotage", "horodatage", "projet", "agents", "note-agents", "systeme",
    "kanban", "filtre", "filtre-divergences", "compteur-specs", "titre-besoin",
    "prompt", "compteur-prompt", "derogation-minimale", "erreur-generer-brouillon",
    "bouton-generer-brouillon", "redaction-corps", "pilotage-corps", "workflows",
    "legende-cycles", "pied-cycles", "fichiers", "timeline", "tiroir-contenu",
    "tiroir-fermer", "tiroir-titre", "main-content", "a11y-announcement",
    "summary-step", "summary-time", "summary-active", "cycle-status", "motion-note",
    "cycle-canvas", "selected-code", "selected-title", "selected-task",
    "selected-state", "selected-tools", "selected-files", "selected-duration",
    "sheet-metrics", "sheet-toggle",
    "backlog-title", "backlog-count", "backlog-column-count",
  ];
  AUTRES_IDS.forEach((id) => appShell.appendChild(creer(id)));
  ["porte-titre", "porte-corps", "porte-aide"].forEach((id) => porteJeton.appendChild(creer(id)));
  porteJeton.appendChild(creer("porte-champ", "input"));
  porteJeton.appendChild(creer("porte-erreur", "div"));
  porteJeton.appendChild(creer("porte-bouton", "button"));

  document_.body = body;
  document_.documentElement = creer(null, "html");
  document_.getElementById = (id) => elements.get(id) || null;
  document_.createElement = (tag) => new FakeNode(tag);
  document_.createElementNS = (_ns, tag) => new FakeNode(tag);
  document_.createTextNode = (t) => { const n = new FakeNode("#text"); n.textContent = t; return n; };
  document_.createDocumentFragment = () => new FakeNode("#fragment");
  document_.addEventListener = () => {};

  const appelsEventSource = [];
  class FakeEventSource {
    constructor(url) { this.url = url; this.onopen = null; this.onerror = null; this._listeners = {}; appelsEventSource.push(this); }
    addEventListener(type, gestionnaire) { (this._listeners[type] = this._listeners[type] || []).push(gestionnaire); }
  }

  const sessionStorageDonnees = {};
  const sessionStorage_ = {
    getItem: (c) => (Object.prototype.hasOwnProperty.call(sessionStorageDonnees, c) ? sessionStorageDonnees[c] : null),
    setItem: (c, v) => { sessionStorageDonnees[c] = String(v); },
    removeItem: (c) => { delete sessionStorageDonnees[c]; },
  };

  const reponsesFetch = [];
  async function fetch_(url, options) {
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
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout,
    clearTimeout,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  return {
    sandbox, elements, reponsesFetch, body, bandeauHote, skipLink, appShell, tiroir, porteJeton,
    $: (id) => elements.get(id),
  };
}

function enfilerEtat(bac, status, body) {
  bac.reponsesFetch.push({
    predicat: (url) => String(url).indexOf("/api/etat") === 0,
    repondre: async () => ({ status, body }),
  });
}

function corpsEtat(jetonRequis, overrides) {
  return Object.assign({
    projet: "MonProjet", config_lue: true, colonnes: [], specs: [], divergences: 0,
    agents: [], workflows: [], evenements: [],
    git: { depot: false, branche: null, touches: [], commits: [] },
    commandes_declarees: [], garde_fous: { budget_max_usd: null, ecrivains_simultanes: null },
    ecriture_active: false, ecriture_raison: "lecture seule (test)",
    jeton_requis: jetonRequis, horodatage: "2026-09-14T12:00:00Z",
  }, overrides || {});
}

let _sourceDiagrammeJs = null;
let _sourceAppJs = null;
function chargerAppJS(bac) {
  if (_sourceDiagrammeJs === null) _sourceDiagrammeJs = fs.readFileSync(path.join(ICI, "diagramme.js"), "utf8");
  new vm.Script(_sourceDiagrammeJs, { filename: "diagramme.js" }).runInContext(bac.sandbox);
  if (_sourceAppJs === null) _sourceAppJs = fs.readFileSync(path.join(ICI, "app.js"), "utf8");
  new vm.Script(_sourceAppJs, { filename: "app.js" }).runInContext(bac.sandbox);
}

function attendreMicrotaches() { return new Promise((resolve) => setImmediate(resolve)); }

function freresNonInertes(bac) {
  return [bac.bandeauHote, bac.skipLink, bac.appShell, bac.tiroir].filter((n) => !n.hasAttribute("inert"));
}

// ===================================================================== //
// A — ouverture directe (`ouvrirPorte`) : tous les frères inertes, jamais
// la porte elle-même
// ===================================================================== //
(function testOuvertureRendLesFreresInertes() {
  const bac = creerBac();
  chargerAppJS(bac);

  check("A_precondition_aucun_frere_inerte_avant_ouverture",
    freresNonInertes(bac).length === 4, freresNonInertes(bac).length + " non inerte(s)");

  bac.sandbox.ouvrirPorte("premier-acces");

  // Atteignabilité bruyante : compter, pas juste affirmer.
  const freresInertes = [bac.bandeauHote, bac.skipLink, bac.appShell, bac.tiroir]
    .filter((n) => n.hasAttribute("inert"));
  check("A_quatre_freres_deviennent_inertes", freresInertes.length === 4,
    freresInertes.length + "/4 — " + freresNonInertes(bac).map((n) => n.id || n.tagName).join(", "));
  check("A_la_porte_elle_meme_ne_recoit_jamais_inert", !bac.porteJeton.hasAttribute("inert"));
  check("A_porte_visible", bac.porteJeton.hidden === false);
})();

// ===================================================================== //
// B — fermeture (`fermerPorte`) : `inert` retiré de tous les frères
// ===================================================================== //
(function testFermetureRetireInertDesFreres() {
  const bac = creerBac();
  chargerAppJS(bac);
  bac.sandbox.ouvrirPorte("premier-acces");
  check("B_precondition_freres_inertes_avant_fermeture", freresNonInertes(bac).length === 0);

  bac.sandbox.fermerPorte();

  check("B_tous_les_freres_perdent_inert", freresNonInertes(bac).length === 4,
    freresNonInertes(bac).length + "/4 rendus actifs");
  check("B_porte_masquee", bac.porteJeton.hidden === true);
})();

// ===================================================================== //
// C — focus au retour : NOMMÉ, pas au hasard
// ===================================================================== //
(function testFocusRestaureSurElementNomme() {
  const bac = creerBac();
  chargerAppJS(bac);
  // Un contrôle avait le focus avant l'ouverture (ex. un clic sur
  // « Ajouter au backlog » déclenche un 401 après coup, `sur401Lecture`).
  const cibleInitiale = bac.$("backlog-title");
  cibleInitiale.focus();
  const appelsAvant = cibleInitiale._focusAppels;

  bac.sandbox.ouvrirPorte("jeton-refuse");
  bac.sandbox.fermerPorte();

  check("C_focus_revient_a_l_element_qui_l_avait_avant_ouverture",
    cibleInitiale._focusAppels === appelsAvant + 1,
    "appels avant=" + appelsAvant + " après=" + cibleInitiale._focusAppels);
})();

(function testFocusReplieSurMainContentSiRienDeMemorise() {
  const bac = creerBac();
  chargerAppJS(bac);
  // Rien n'a le focus avant l'ouverture (cas nominal : porte ouverte au
  // chargement de la page, avant toute interaction) — `document.activeElement`
  // reste `null`.
  bac.sandbox.ouvrirPorte("premier-acces");
  bac.sandbox.fermerPorte();

  const repli = bac.$("main-content");
  check("C_repli_nomme_sur_main_content_si_rien_memorise", repli._focusAppels === 1,
    "appels=" + repli._focusAppels);
})();

// ===================================================================== //
// D — déclenchement RÉEL : `verifierEtatAuth()` → 401 → `ouvrirPorte()`
// engage le MÊME mécanisme, pas seulement un appel direct aux fonctions
// internes ci-dessus
// ===================================================================== //
async function testDeclenchementReelParVerifierEtatAuth() {
  const bac = creerBac();
  enfilerEtat(bac, 401, null);
  chargerAppJS(bac);
  await attendreMicrotaches();
  await attendreMicrotaches();

  check("D_porte_ouverte_par_le_flux_reel", bac.porteJeton.hidden === false);
  check("D_freres_inertes_par_le_flux_reel", freresNonInertes(bac).length === 0,
    freresNonInertes(bac).length + " encore atteignable(s)");
}

async function main() {
  await testDeclenchementReelParVerifierEtatAuth();
  console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
  for (const e of _echecs) console.log("  - " + e);
  process.exit(_echecs.length ? 1 : 0);
}
main();
