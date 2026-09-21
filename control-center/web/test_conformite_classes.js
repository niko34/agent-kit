"use strict";
/* feature-021, cycle 2, lot 0 — F3a : PARITÉ DES CLASSES, VOLET STATIQUE.
 *
 *     node control-center/web/test_conformite_classes.js
 *
 * Deux vérifications, PAR PARSEUR jamais par `grep` (mesuré :
 * `grep -oE '\.[a-zA-Z…]'` rend 249 « classes » sur le prototype — il
 * capture `.2s`, `.34`, `.textContent`, du texte de déclaration, pas des
 * sélecteurs) :
 *
 *   A. FIDÉLITÉ — les classes « adoptées » par F0 (modulo F0, cf.
 *      `test_conformite_partition_donnees.js`) doivent exister, à l'identique,
 *      dans `index.html` (posées) ET dans `app.css` (déclarées avec un corps
 *      non vide — PIEGES §33, une règle vide ne protège rien).
 *   B. PARITÉ INTERNE, sens HTML→CSS — toute classe posée par `index.html`
 *      doit être déclarée avec un corps non vide dans `app.css`, modulo
 *      `CLASSES_AJOUTEES` (les 4 représentations neuves de F16).
 *
 * ⚠️ CE QUE CE VOLET NE FAIT PAS, ET POURQUOI : le sens CSS→HTML (« toute
 * classe déclarée est posée quelque part ») N'EST PAS vérifié ici. Mesuré :
 * appliqué à `index.html` STATIQUE, il rend 96 « orphelines » qui sont en
 * réalité posées par `app.js` à l'exécution (`classList.add` sur états,
 * ex. `.actif`, `.ko`) — un faux positif STRUCTUREL, pas un défaut. C'est
 * exactement la distinction entre F3a (DOM INITIAL) et F3b (runtime, lot 5) :
 * seul un harnais qui exécute `app.js` peut légitimement établir ce sens-là
 * (`PIEGES §38` : un bac à sable JS ne connaît que les id du HTML statique —
 * la même limite s'applique aux classes). L'exiger ici ferait échouer la
 * garde pour la MAUVAISE raison (règle non négociable n°2).
 */

const lib = require("./test_conformite_lib.js");
const { ADOPTE, PARTITION_CLASSES } = require("./test_conformite_partition_donnees.js");

const ATTENDU_ROUGE = {
  F3A_CLASSES_ADOPTEES_ABSENTES: {
    description: "les classes du prototype classées « adopté » par F0 (structure, kanban, " +
      "graphe d'agents, bottom sheet) sont encore absentes d'index.html et d'app.css : la " +
      "structure mono-écran n'est écrite qu'au lot 3, le graphe qu'au lot 4.",
    lotDeCloture: "lot 4",
    date: "2026-09-21",
  },
  F3A_CLASSE_POSEE_SANS_DECLARATION_PREEXISTANTE: {
    description: "défaut PRÉEXISTANT, sans rapport avec feature-021, découvert par cette " +
      "garde neuve : `index.html` pose `class=\"bloc pilotage\"` (ligne 181) mais aucune règle " +
      "`.pilotage` n'existe dans app.css (seules des classes composées `pilotage-*` existent). " +
      "Disparaît de lui-même à la réécriture complète d'index.html.",
    lotDeCloture: "lot 3",
    date: "2026-09-21",
  },
};

// F16 (designer) : state-sans-cloture, has-echec, role-principal, agent-flag,
// agent-flag--echec, agent-flag--sans-cloture, role-ring — 4 représentations
// absentes du prototype, mandat ADR-0031 §3. KEYFRAMES_AJOUTES (F2) reste
// vide : ces 4 inventions sont STATIQUES, aucun jeton neuf non plus.
const CLASSES_AJOUTEES = [
  { nom: "state-sans-cloture", raison: "F16 : représenter un passage sans fin observée sans se fonder sur SessionEnd (PIEGES §17)" },
  { nom: "has-echec", raison: "F16 : représenter un échec, absent du prototype (3 classes d'état seulement)" },
  { nom: "role-principal", raison: "F16 : distinguer l'agent principal, absent du prototype" },
  { nom: "agent-flag", raison: "F16 : porteur générique des drapeaux d'état neufs (base commune)" },
  { nom: "agent-flag--echec", raison: "F16 : variante échec du drapeau" },
  { nom: "agent-flag--sans-cloture", raison: "F16 : variante sans-clôture du drapeau" },
  { nom: "role-ring", raison: "F16 : anneau secondaire portant le rôle principal" },
];

let _tests = 0;
const _echecs = [];
function check(nom, condition, detail) {
  _tests += 1;
  if (condition) console.log("  ok     " + nom);
  else { _echecs.push(nom); console.log("  ECHEC  " + nom + (detail ? " : " + detail : "")); }
}

const htmlPrototype = lib.lirePrototype();
const htmlApp = lib.lireNonVide(lib.cheminWeb("index.html"), "control-center/web/index.html");
const cssApp = lib.lireNonVide(lib.cheminWeb("app.css"), "control-center/web/app.css");
console.log("[atteignabilité] prototype " + htmlPrototype.length + " o, index.html " + htmlApp.length +
  " o, app.css " + cssApp.length + " o");

const classesRequisesAdoptees = new Set(
  Object.entries(PARTITION_CLASSES).filter(([, [verdict]]) => verdict === ADOPTE).map(([c]) => c)
);
console.log("[dérivé] " + classesRequisesAdoptees.size + " classe(s) « adopté » requise(s) (F0)");

const classesHtmlApp = lib.classesDeHtml(htmlApp);
const classesCssApp = lib.classesDeclareesAvecCorps(cssApp);

// -- A. Fidélité au prototype (modulo F0) --
const manquantesHtml = [...classesRequisesAdoptees].filter((c) => !classesHtmlApp.has(c));
const manquantesCss = [...classesRequisesAdoptees].filter((c) => !classesCssApp.has(c));
const fideliteOk = manquantesHtml.length === 0 && manquantesCss.length === 0;
if (fideliteOk) {
  check("F3a_fidelite_classes_adoptees_posees_et_declarees", true);
} else {
  console.log("  ECHEC  F3a_fidelite_classes_adoptees_posees_et_declarees : " +
    manquantesHtml.length + " absente(s) d'index.html, " + manquantesCss.length + " absente(s)/vide(s) dans app.css");
  console.log("           index.html (10 premières) : " + manquantesHtml.slice(0, 10).join(", "));
  console.log("           app.css    (10 premières) : " + manquantesCss.slice(0, 10).join(", "));
  if (ATTENDU_ROUGE.F3A_CLASSES_ADOPTEES_ABSENTES) {
    console.log("  (ATTENDU_ROUGE F3A_CLASSES_ADOPTEES_ABSENTES, clôture " +
      ATTENDU_ROUGE.F3A_CLASSES_ADOPTEES_ABSENTES.lotDeCloture + ")");
  } else {
    _tests += 1;
    _echecs.push("F3a_fidelite_classes_adoptees_posees_et_declarees_HORS_REGISTRE");
  }
}

// -- B. Parité interne d'index.html/app.css, modulo CLASSES_AJOUTEES --
// B1 : toute classe posée par index.html doit être déclarée (corps non vide)
// dans app.css, ou explicitement listée en ajout.
const nomsAjoutes = new Set(CLASSES_AJOUTEES.map((c) => c.nom));
const poseesNonDeclarees = [...classesHtmlApp].filter((c) => !classesCssApp.has(c) && !nomsAjoutes.has(c));
if (poseesNonDeclarees.length === 0) {
  check("F3a_toute_classe_posee_est_declaree_avec_un_corps", true);
} else {
  console.log("  ECHEC  F3a_toute_classe_posee_est_declaree_avec_un_corps : " +
    poseesNonDeclarees.length + " posée(s) sans déclaration valide : " + poseesNonDeclarees.slice(0, 10).join(", "));
  const seulementPreexistant = poseesNonDeclarees.length === 1 && poseesNonDeclarees[0] === "pilotage";
  if (seulementPreexistant && ATTENDU_ROUGE.F3A_CLASSE_POSEE_SANS_DECLARATION_PREEXISTANTE) {
    console.log("  (ATTENDU_ROUGE F3A_CLASSE_POSEE_SANS_DECLARATION_PREEXISTANTE, clôture " +
      ATTENDU_ROUGE.F3A_CLASSE_POSEE_SANS_DECLARATION_PREEXISTANTE.lotDeCloture + ")");
  } else {
    _tests += 1;
    _echecs.push("F3a_toute_classe_posee_est_declaree_avec_un_corps_HORS_REGISTRE");
  }
}

// B2 : chaque entrée de CLASSES_AJOUTEES porte une raison.
const ajoutsSansRaison = CLASSES_AJOUTEES.filter((c) => !c.raison || !c.raison.trim());
check("F3a_toute_classe_ajoutee_porte_une_raison", ajoutsSansRaison.length === 0,
  ajoutsSansRaison.map((c) => c.nom).join(", "));

if (fideliteOk && ATTENDU_ROUGE.F3A_CLASSES_ADOPTEES_ABSENTES) {
  check("F3A_CLASSES_ADOPTEES_ABSENTES_purgee_du_registre_si_verte", false,
    "l'assertion est VERTE mais l'entrée est encore dans ATTENDU_ROUGE — la retirer (clause 2)");
}
if (poseesNonDeclarees.length === 0 && ATTENDU_ROUGE.F3A_CLASSE_POSEE_SANS_DECLARATION_PREEXISTANTE) {
  check("F3A_CLASSE_POSEE_SANS_DECLARATION_PREEXISTANTE_purgee_du_registre_si_verte", false,
    "l'assertion est VERTE mais l'entrée est encore dans ATTENDU_ROUGE — la retirer (clause 2)");
}
for (const [cle, entree] of Object.entries(ATTENDU_ROUGE)) {
  check("ATTENDU_ROUGE_" + cle + "_porte_un_lot_de_cloture_nomme", !!(entree.lotDeCloture && entree.lotDeCloture.trim()));
}

function main() {
  console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
  for (const e of _echecs) console.log("  - " + e);
  process.exit(_echecs.length ? 1 : 0);
}
main();
