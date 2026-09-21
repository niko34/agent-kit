"use strict";
/* feature-021, cycle 2, lot 0 — F1 : TABLE DES JETONS.
 *
 *     node control-center/web/test_conformite_jetons.js
 *
 * Extrait le bloc `:root` du prototype PAR ANALYSE DE LA RÈGLE (profondeur
 * d'accolades, `test_conformite_lib.js`), jamais par `grep` (PIEGES §26 :
 * `grep -c` compte aussi les commentaires). Assertionne une INCLUSION au
 * bit près — les 24 propriétés du prototype doivent exister, IDENTIQUES,
 * dans `:root` de `app.css` — PLUS une liste déclarée `JETONS_AJOUTES` pour
 * tout nom que l'implémentation ajoute. Ce n'est PAS une égalité
 * d'ensembles : une égalité serait invalidée par le premier ajout légitime
 * (Notes d'implémentation cycle 2, §1).
 *
 * ⚠️ Défaut fermé par ce lot : 10 occurrences (9 valeurs distinctes) d'un
 * littéral hexadécimal vivent HORS du bloc `:root` du prototype lui-même —
 * elles échappaient à toute garde qui ne lisait QUE `:root`. Ce fichier les
 * DÉRIVE (`lib.hexHorsRoot`) et les affiche ; leur PROMOTION en jetons
 * `:root` d'`app.css` est un livrable du LOT 2 (F6), pas de ce lot — inscrit
 * à `ATTENDU_ROUGE` ci-dessous avec son lot de clôture. `#000` (ligne 313,
 * `mask: radial-gradient(...)`) est une valeur de masque, pas une couleur de
 * texte/fond : elle n'entre PAS dans le compte des jetons À PROMOUVOIR (8
 * valeurs, pas 9) — d'où les « 28 jetons » de la matrice F5a (20 + 8).
 *
 * ATTENDU_ROUGE — une entrée par assertion encore fausse, avec son lot de
 * clôture et sa date. Cette garde ÉCHOUE si une entrée du registre PASSE
 * sans avoir été retirée (clause 2), ou si une régression apparaît HORS
 * registre, ou si une entrée n'a pas de lot de clôture nommé.
 */

const lib = require("./test_conformite_lib.js");

const ATTENDU_ROUGE = {
  F1_INCLUSION_ROOT_M3: {
    description: "aucun des 24 jetons `:root` du prototype n'existe encore dans app.css : " +
      "app.css porte l'ancien jeu `--clair-*`/`--sombre-*` (ADR-0022), pas les jetons Material 3.",
    lotDeCloture: "lot 2",
    date: "2026-09-21",
  },
  F1_JETONS_PROMUS_HORS_ROOT: {
    description: "les 8 hexadécimaux promouvables (hors #000, valeur de masque) ne sont pas " +
      "encore déclarés dans JETONS_AJOUTES ni dans le `:root` d'app.css.",
    lotDeCloture: "lot 2",
    date: "2026-09-21",
  },
};

// -- Liste déclarée : TOUT jeton qu'app.css ajoute au-delà des 24 requis --
// vide à ce lot, à compléter au lot 2 avec, pour chaque entrée, le nom, la
// valeur ET la raison (sélecteur + ligne du prototype dont elle provient).
const JETONS_AJOUTES = [
  // { nom: "--todo-chip-bg", valeur: "#fff0c8", origine: ".feature-chip.todo, ligne 552" },
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
// F1 — toute propriété `--x` d'app.css hors des 24 requis doit être dans
// JETONS_AJOUTES (clause miroir, symétrique à celle de F0/F5a)
// ===================================================================== //
const requisNoms = new Set(propsPrototype.map((d) => d.prop));
const ajouteesNoms = new Set(JETONS_AJOUTES.map((j) => j.nom));
const appNoms = new Set(declRootApp.filter((d) => d.prop.startsWith("--")).map((d) => d.prop));
const nonDeclares = [...appNoms].filter((n) => !requisNoms.has(n) && !ajouteesNoms.has(n));
if (nonDeclares.length === 0) {
  check("F1_toute_propriete_extra_est_dans_JETONS_AJOUTES", true);
} else {
  console.log("  ECHEC  F1_toute_propriete_extra_est_dans_JETONS_AJOUTES : " +
    nonDeclares.length + " propriété(s) non déclarée(s), ex. " + nonDeclares.slice(0, 5).join(", ") + "…");
  if (ATTENDU_ROUGE.F1_JETONS_PROMUS_HORS_ROOT) {
    console.log("  (ATTENDU_ROUGE F1_JETONS_PROMUS_HORS_ROOT, clôture " +
      ATTENDU_ROUGE.F1_JETONS_PROMUS_HORS_ROOT.lotDeCloture + ")");
  } else {
    _tests += 1;
    _echecs.push("F1_toute_propriete_extra_est_dans_JETONS_AJOUTES_HORS_REGISTRE");
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
// SANS avoir été retirée du registre est un ÉCHEC. Ici : dès que F1 est
// intégralement verte (les deux blocs ci-dessus passent), les DEUX entrées
// doivent avoir été retirées — sinon la garde le signale elle-même.
// ===================================================================== //
const inclusionEstVerte = manquants.length === 0 && divergents.length === 0;
const jetonsAjoutesEstVert = nonDeclares.length === 0;
if (inclusionEstVerte && ATTENDU_ROUGE.F1_INCLUSION_ROOT_M3) {
  check("F1_INCLUSION_ROOT_M3_purgee_du_registre_si_verte", false,
    "l'assertion est VERTE mais l'entrée est encore dans ATTENDU_ROUGE — la retirer (clause 2)");
}
if (jetonsAjoutesEstVert && ATTENDU_ROUGE.F1_JETONS_PROMUS_HORS_ROOT) {
  check("F1_JETONS_PROMUS_HORS_ROOT_purgee_du_registre_si_verte", false,
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
