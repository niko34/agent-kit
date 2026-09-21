"use strict";
/* feature-021, cycle 2, lot 0→2 — F1 : TABLE DES JETONS.
 *
 *     node control-center/web/test_conformite_jetons.js
 *
 * Extrait le bloc `:root` du prototype PAR ANALYSE DE LA RÈGLE (profondeur
 * d'accolades, `test_conformite_lib.js`), jamais par `grep` (PIEGES §26 :
 * `grep -c` compte aussi les commentaires). Assertionne une INCLUSION au
 * bit près — les 24 propriétés du prototype doivent exister, IDENTIQUES,
 * dans `:root` de `app.css` — PLUS une liste déclarée `JETONS_AJOUTES` pour
 * tout nom PERMANENT que l'implémentation ajoute. Ce n'est PAS une égalité
 * d'ensembles : une égalité serait invalidée par le premier ajout légitime
 * (Notes d'implémentation cycle 2, §1).
 *
 * ⚠️ LOT 2 (F6) — trois choses tombées ici, chacune avec son propre sort au
 * registre (Notes d'implémentation cycle 2, §1, point 5 — « deux choses
 * différentes ne partagent pas une entrée de registre ») :
 *   1. Les 24 jetons du prototype sont désormais bit-identiques dans
 *      `app.css` → `F1_INCLUSION_ROOT_M3` FERME POUR DE BON, RETIRÉE du
 *      registre (pas laissée à passer).
 *   2. Les 8 hexadécimaux qui vivaient hors du bloc `:root` du prototype
 *      (`#000`, ligne 313, `mask: radial-gradient(...)`, EXCLU — arrêt de
 *      masque, pas une couleur peinte, pas dans ce compte de 8) sont promus
 *      en jetons `:root` PERMANENTS, déclarés dans `JETONS_AJOUTES` ci-dessous
 *      → volet « 8 hex promus » de `F1_JETONS_PROMUS_HORS_ROOT` FERME POUR DE
 *      BON, RETIRÉE elle aussi.
 *   3. Ce que l'ancien `--clair-*` servait (jetons sémantiques, identité
 *      colorée par agent) SURVIT comme couche TRANSITOIRE dans `app.css`,
 *      le temps que les fichiers qui les consomment soient réécrits. C'est
 *      une entrée NEUVE et DISTINCTE, scindée en DEUX (deux fichiers, deux
 *      lots de clôture différents) : `F1_TRANSITOIRE_SEMANTIQUE_CLAIR`
 *      (lot 3, `index.html`) et `F1_TRANSITOIRE_IDENTITE_AGENT` (lot 4,
 *      `diagramme.js`/`app.js`, ADR-0032).
 *
 * ATTENDU_ROUGE — une entrée par assertion encore fausse, avec son lot de
 * clôture et sa date. Cette garde ÉCHOUE si une entrée du registre PASSE
 * sans avoir été retirée (clause 2), ou si une régression apparaît HORS
 * registre, ou si une entrée n'a pas de lot de clôture nommé.
 */

const lib = require("./test_conformite_lib.js");

const ATTENDU_ROUGE = {
  F1_TRANSITOIRE_SEMANTIQUE_CLAIR: {
    description: "15 anciens jetons sémantiques (--fond, --actif, --texte-doux…) survivent " +
      "dans app.css :root, aliasés directement sur un jeton M3 (ou un color-mix() qui en " +
      "dérive) — ils disparaissent quand index.html/les règles qui les consomment sont " +
      "réécrits au lot 3.",
    lotDeCloture: "lot 3",
    date: "2026-09-21",
  },
  F1_TRANSITOIRE_IDENTITE_AGENT: {
    description: "18 jetons d'identité colorée par agent (--a-<rôle>/--f-<rôle>) + " +
      "--rebouclage (qui en dépend) survivent dans app.css :root, en littéraux directs " +
      "(l'indirection --clair-a-* a disparu) — ils disparaissent avec diagramme.js/app.js " +
      "au lot 4 (ADR-0032).",
    lotDeCloture: "lot 4",
    date: "2026-09-21",
  },
};

// -- Liste déclarée : TOUT jeton PERMANENT qu'app.css ajoute au-delà des 24
// requis — les 8 hexadécimaux promus hors du `:root` du prototype (nom
// dérivé du SÉLECTEUR qui les porte, jamais de la valeur — lot 2) + les
// constantes hors couleur déjà présentes avant ce cycle (police, hauteur de
// barre). Ne JAMAIS y mettre une entrée transitoire (couche 3 ci-dessus) :
// ces listes sont séparées plus bas, `JETONS_TRANSITOIRES_*`.
const JETONS_AJOUTES = [
  { nom: "--agent-state-pending", valeur: "#aaa6b0",
    origine: ".agent-node{--state-color} l.263 (défaut) et .agent-node.state-pending l.304" },
  { nom: "--agent-state-done", valeur: "#777385",
    origine: ".agent-node.state-done{--state-color:#777385} l.303" },
  { nom: "--question-ink", valeur: "#4e1d12",
    origine: ".question{color:#4e1d12} l.454, texte sur fond var(--coral-soft)" },
  { nom: "--column-todo-dot", valeur: "#eea52a",
    origine: ".column-todo .column-label i{background:#eea52a} l.498" },
  { nom: "--column-done-dot", valeur: "#3b8f35",
    origine: ".column-done .column-label i{background:#3b8f35} l.500" },
  { nom: "--chip-todo-bg", valeur: "#fff0c8",
    origine: ".feature-chip.todo{background:#fff0c8} l.552" },
  { nom: "--chip-todo-ink", valeur: "#654b00",
    origine: ".feature-chip.todo{color:#654b00} l.552" },
  { nom: "--chip-high-ink", valeur: "#690005",
    origine: ".feature-chip.high{color:#690005} l.553, texte sur fond var(--danger-soft)" },
  { nom: "--mono", valeur: 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace',
    origine: "pile monospace du projet, antérieure à ce cycle, hors prototype (identifiants techniques)" },
  { nom: "--sans", valeur: '"Google Sans", "Roboto", Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    origine: "body{font-family} du prototype, l.43 — copiée bit à bit (lot 2, F6)" },
  { nom: "--hauteur-barre", valeur: "62px",
    origine: "constante de mise en page, feature-019, hors prototype (aucun équivalent M3)" },
];

// -- Couche transitoire 3a : alias sémantiques, ferment au LOT 3. Liste
// DÉRIVÉE à la main (aucun artefact ne la porte, comme ROLES en F5a) mais
// soumise à la CLAUSE MIROIR plus bas : toute entrée absente d'app.css doit
// en être retirée, tout extra d'app.css doit y figurer — sinon échec.
const JETONS_TRANSITOIRES_SEMANTIQUES = [
  "--fond", "--surface-2", "--creux", "--trait", "--trait-fin", "--contour-etat",
  "--texte", "--texte-doux", "--texte-faible", "--accent", "--actif", "--alerte",
  "--echec", "--ombre", "--voile",
];

// -- Couche transitoire 3b : identité colorée par agent + --rebouclage (en
// dépend), ferment au LOT 4 (ADR-0032).
const JETONS_TRANSITOIRES_IDENTITE_AGENT = [
  "--a-backend-developer", "--f-backend-developer",
  "--a-security-reviewer", "--f-security-reviewer",
  "--a-test-engineer", "--f-test-engineer",
  "--a-spec-reader", "--f-spec-reader",
  "--a-code-reviewer", "--f-code-reviewer",
  "--a-debugger", "--f-debugger",
  "--a-doc-writer", "--f-doc-writer",
  "--a-frontend-developer", "--f-frontend-developer",
  "--a-neutre", "--f-neutre",
  "--rebouclage",
];

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

// ===================================================================== //
// Atteignabilité bruyante
// ===================================================================== //
const htmlPrototype = lib.lirePrototype();
const cssAppChemin = lib.cheminWeb("app.css");
const cssApp = lib.lireNonVide(cssAppChemin, "control-center/web/app.css");
console.log("[atteignabilité] prototype : " + htmlPrototype.length + " octets ; app.css : " + cssApp.length + " octets");

const cssPrototype = lib.extraireBlocStyle(htmlPrototype);
const declPrototype = lib.declarationsRoot(cssPrototype);
const propsPrototype = declPrototype.filter((d) => d.prop.startsWith("--"));
console.log("[dérivé] " + propsPrototype.length + " propriétés personnalisées dans `:root` du prototype (+ " +
  (declPrototype.length - propsPrototype.length) + " déclaration(s) non `--`, ex. `color-scheme`)");

const hexHorsRootPrototype = lib.hexHorsRoot(cssPrototype);
console.log("[dérivé] " + hexHorsRootPrototype.length + " occurrence(s) hex hors `:root` du prototype, " +
  new Set(hexHorsRootPrototype).size + " valeur(s) distincte(s) : " + [...new Set(hexHorsRootPrototype)].join(", "));

// ===================================================================== //
// F1 — inclusion stricte au bit près
// ===================================================================== //
let declRootApp;
let inclusionOk = true;
const manquants = [];
const divergents = [];
try {
  declRootApp = lib.declarationsRoot(cssApp);
} catch (e) {
  declRootApp = [];
}
const mapApp = new Map(declRootApp.map((d) => [d.prop, d.val]));
for (const d of propsPrototype) {
  if (!mapApp.has(d.prop)) {
    manquants.push(d.prop);
    inclusionOk = false;
  } else if (mapApp.get(d.prop) !== d.val) {
    divergents.push(d.prop + " : attendu `" + d.val + "`, obtenu `" + mapApp.get(d.prop) + "`");
    inclusionOk = false;
  }
}
if (inclusionOk) {
  check("F1_inclusion_stricte_des_24_jetons_root", true);
} else {
  console.log("  ECHEC  F1_inclusion_stricte_des_24_jetons_root : " +
    manquants.length + " manquant(s), " + divergents.length + " divergent(s)");
  console.log("           manquants  : " + manquants.join(", "));
  console.log("           divergents : " + divergents.join(" | "));
  if (ATTENDU_ROUGE.F1_INCLUSION_ROOT_M3) {
    console.log("  (ATTENDU_ROUGE F1_INCLUSION_ROOT_M3, clôture " + ATTENDU_ROUGE.F1_INCLUSION_ROOT_M3.lotDeCloture + ")");
  } else {
    _tests += 1;
    _echecs.push("F1_inclusion_stricte_des_24_jetons_root_HORS_REGISTRE");
  }
}

// ===================================================================== //
// F1 — toute propriété `--x` d'app.css hors des 24 requis doit être comptée
// dans EXACTEMENT un des trois registres : JETONS_AJOUTES (permanent),
// JETONS_TRANSITOIRES_SEMANTIQUES (lot 3) ou JETONS_TRANSITOIRES_IDENTITE_
// AGENT (lot 4). Rien ne doit rester hors de tout registre (clause miroir,
// symétrique à celle de F0/F5a).
// ===================================================================== //
const requisNoms = new Set(propsPrototype.map((d) => d.prop));
const ajouteesNoms = new Set(JETONS_AJOUTES.map((j) => j.nom));
const appNoms = new Set(declRootApp.filter((d) => d.prop.startsWith("--")).map((d) => d.prop));
const semDeclares = new Set(JETONS_TRANSITOIRES_SEMANTIQUES);
const agentDeclares = new Set(JETONS_TRANSITOIRES_IDENTITE_AGENT);

// -- 3a. JETONS_AJOUTES : présence ET valeur (une addition permanente qui
// diverge de sa valeur déclarée est aussi une régression silencieuse).
const ajouteesManquantes = JETONS_AJOUTES.filter((j) => !appNoms.has(j.nom));
const ajouteesDivergentes = JETONS_AJOUTES.filter((j) => appNoms.has(j.nom) && mapApp.get(j.nom) !== j.valeur);
check("F1_JETONS_AJOUTES_presents_et_conformes",
  ajouteesManquantes.length === 0 && ajouteesDivergentes.length === 0,
  [
    ...ajouteesManquantes.map((j) => j.nom + " absent d'app.css"),
    ...ajouteesDivergentes.map((j) => j.nom + " : attendu `" + j.valeur + "`, obtenu `" + mapApp.get(j.nom) + "`"),
  ].join(" | "));

// -- rien hors des quatre compartiments (24 requis + AJOUTEES + les deux
// couches transitoires) : une propriété non comptée nulle part est toujours
// un échec DUR, jamais quarantinable — aucune raison qu'elle échappe à tout.
const horsTout = [...appNoms].filter((n) =>
  !requisNoms.has(n) && !ajouteesNoms.has(n) && !semDeclares.has(n) && !agentDeclares.has(n));
check("F1_aucune_propriete_root_hors_de_tout_registre", horsTout.length === 0,
  horsTout.length + " propriété(s) non couverte(s) : " + horsTout.slice(0, 8).join(", "));

// -- clause miroir des DEUX listes transitoires : une entrée déclarée qui
// n'existe plus dans app.css est une liste PÉRIMÉE, pas une liste à jour —
// même défaut que les jetons de rôle en F5a (rolesPerimes).
const semPerimes = [...semDeclares].filter((n) => !appNoms.has(n));
const agentPerimes = [...agentDeclares].filter((n) => !appNoms.has(n));
check("F1_TRANSITOIRE_SEMANTIQUE_CLAIR_liste_sans_entree_perimee", semPerimes.length === 0, semPerimes.join(", "));
check("F1_TRANSITOIRE_IDENTITE_AGENT_liste_sans_entree_perimee", agentPerimes.length === 0, agentPerimes.join(", "));

// -- fermeture de chaque couche transitoire : ATTENDU_ROUGE tant qu'elle
// n'est pas vide, clause (2) dès qu'elle l'est.
const semVide = semDeclares.size === 0;
if (semVide) {
  check("F1_aucun_jeton_semantique_transitoire_restant", true);
} else {
  console.log("  ECHEC  F1_aucun_jeton_semantique_transitoire_restant : " +
    semDeclares.size + " propriété(s) encore transitoire(s) : " + [...semDeclares].join(", "));
  if (ATTENDU_ROUGE.F1_TRANSITOIRE_SEMANTIQUE_CLAIR) {
    console.log("  (ATTENDU_ROUGE F1_TRANSITOIRE_SEMANTIQUE_CLAIR, clôture " +
      ATTENDU_ROUGE.F1_TRANSITOIRE_SEMANTIQUE_CLAIR.lotDeCloture + ")");
  } else {
    _tests += 1;
    _echecs.push("F1_aucun_jeton_semantique_transitoire_restant_HORS_REGISTRE");
  }
}
const agentVide = agentDeclares.size === 0;
if (agentVide) {
  check("F1_aucun_jeton_identite_agent_transitoire_restant", true);
} else {
  console.log("  ECHEC  F1_aucun_jeton_identite_agent_transitoire_restant : " +
    agentDeclares.size + " propriété(s) encore transitoire(s) : " + [...agentDeclares].join(", "));
  if (ATTENDU_ROUGE.F1_TRANSITOIRE_IDENTITE_AGENT) {
    console.log("  (ATTENDU_ROUGE F1_TRANSITOIRE_IDENTITE_AGENT, clôture " +
      ATTENDU_ROUGE.F1_TRANSITOIRE_IDENTITE_AGENT.lotDeCloture + ")");
  } else {
    _tests += 1;
    _echecs.push("F1_aucun_jeton_identite_agent_transitoire_restant_HORS_REGISTRE");
  }
}

// ===================================================================== //
// F1 — aucun jeton du prototype n'est déclaré DEUX FOIS avec des valeurs
// divergentes dans les `:root` repliés
// ===================================================================== //
// Motif : la valeur effective peut être la bonne et la feuille être quand
// même piégée. Un jeton posé juste puis écrasé faux (ou l'inverse) dépend de
// l'ORDRE des blocs ; déplacer une règle suffit alors à changer ce que le
// navigateur peint, sans qu'aucune valeur n'ait été touchée. On refuse la
// configuration, pas seulement son résultat du jour.
const redeclares = lib.jetonsRedeclaresDivergents(cssApp).filter((r) => requisNoms.has(r.prop));
check("F1_aucun_jeton_du_prototype_redeclare_avec_valeur_divergente",
  redeclares.length === 0,
  redeclares.map((r) => r.prop + " déclaré " + r.valeurs.length + " fois : " + r.valeurs.join(" puis ")).join(" | "));

// ===================================================================== //
// F1 — NON-RÉGRESSION : le faux vert du second bloc `:root`
// ===================================================================== //
// Défaut mesuré au lot 0 (reboucle) : `declarationsRoot` ne lisait que le
// PREMIER bloc `:root`. Un app.css portant les 24 jetons conformes suivis de
// `:root { --bg: #ff0000 }` passait au VERT, alors que le navigateur peint
// #ff0000. La garde certifiait l'identité au bit près d'une valeur que le
// rendu contredit.
//
// Ce cas fige le défaut sur une feuille construite EN MÉMOIRE — il ne dépend
// donc ni d'app.css ni du lot en cours, et reste rouge si un futur refactor
// de `test_conformite_lib.js` rouvre le trou.
(function nonRegressionSecondRoot() {
  const rootProto = lib.reglesRootTopNiveau(cssPrototype)[0];
  const conforme = ":root {" + rootProto.corps + "}";
  const jetonTemoin = propsPrototype[0].prop;
  const valeurAttendue = propsPrototype[0].val;

  // (a) la feuille conforme seule : la valeur effective est celle du prototype
  const seul = new Map(lib.declarationsRoot(conforme).map((d) => [d.prop, d.val]));
  check("F1_NONREGRESSION_feuille_conforme_seule_donne_la_valeur_du_prototype",
    seul.get(jetonTemoin) === valeurAttendue,
    jetonTemoin + " = `" + seul.get(jetonTemoin) + "`, attendu `" + valeurAttendue + "`");

  // (b) la MÊME feuille suivie d'un second `:root` qui écrase : la valeur
  //     effective doit suivre la cascade, pas le premier bloc
  const ecrase = conforme + "\n:root { " + jetonTemoin + ": #ff0000; }\n";
  const apres = new Map(lib.declarationsRoot(ecrase).map((d) => [d.prop, d.val]));
  check("F1_NONREGRESSION_second_root_ecrasant_est_vu",
    apres.get(jetonTemoin) === "#ff0000",
    "valeur effective lue `" + apres.get(jetonTemoin) + "` — la garde ne lit encore que le PREMIER bloc :root");

  // (c) et la divergence est refusée nommément
  const divergence = lib.jetonsRedeclaresDivergents(ecrase);
  check("F1_NONREGRESSION_second_root_ecrasant_est_refuse",
    divergence.some((r) => r.prop === jetonTemoin),
    "aucune divergence signalée sur " + jetonTemoin);

  // (d) un `:root` sous @media ne doit PAS être replié (périmètre déclaré)
  const sousMedia = conforme + "\n@media (min-width: 1px) { :root { " + jetonTemoin + ": #00ff00; } }\n";
  const apresMedia = new Map(lib.declarationsRoot(sousMedia).map((d) => [d.prop, d.val]));
  check("F1_NONREGRESSION_root_sous_media_reste_hors_repli",
    apresMedia.get(jetonTemoin) === valeurAttendue,
    "un `:root` conditionnel a été replié : lu `" + apresMedia.get(jetonTemoin) + "`");
})();

// ===================================================================== //
// Registre ATTENDU_ROUGE — clause (2) : toute entrée qui repasse au vert
// SANS avoir été retirée du registre est un ÉCHEC. `F1_INCLUSION_ROOT_M3` et
// le volet « 8 hex promus » de `F1_JETONS_PROMUS_HORS_ROOT` sont DÉJÀ
// retirés (lot 2, voir en-tête) : s'ils réapparaissaient ici, ce serait un
// oubli de retrait, donc traités au même régime hors-registre que toute
// autre clé absente — inutile de les re-tester nommément. Restent les DEUX
// entrées vivantes de ce lot.
// ===================================================================== //
if (semVide && ATTENDU_ROUGE.F1_TRANSITOIRE_SEMANTIQUE_CLAIR) {
  check("F1_TRANSITOIRE_SEMANTIQUE_CLAIR_purgee_du_registre_si_verte", false,
    "l'assertion est VERTE mais l'entrée est encore dans ATTENDU_ROUGE — la retirer (clause 2)");
}
if (agentVide && ATTENDU_ROUGE.F1_TRANSITOIRE_IDENTITE_AGENT) {
  check("F1_TRANSITOIRE_IDENTITE_AGENT_purgee_du_registre_si_verte", false,
    "l'assertion est VERTE mais l'entrée est encore dans ATTENDU_ROUGE — la retirer (clause 2)");
}
for (const [cle, entree] of Object.entries(ATTENDU_ROUGE)) {
  check("ATTENDU_ROUGE_" + cle + "_porte_un_lot_de_cloture_nomme",
    !!(entree.lotDeCloture && entree.lotDeCloture.trim()));
}

function main() {
  console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
  for (const e of _echecs) console.log("  - " + e);
  process.exit(_echecs.length ? 1 : 0);
}
main();
