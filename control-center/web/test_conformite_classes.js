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
const { ADOPTE, PARTITION_CLASSES, lotEstDejaLivre } = require("./test_conformite_partition_donnees.js");

// F3A_CLASSE_POSEE_SANS_DECLARATION_PREEXISTANTE : RETIRÉE du registre au
// lot 3 (clôture réelle) — le défaut préexistant (`class="bloc pilotage"`
// sans règle `.pilotage`) a disparu à la réécriture complète d'index.html
// (feature-021 cycle 2, F7) : la section « Pilotage » ne porte plus que
// `class="bloc"`.
// F3A_CLASSES_ADOPTEES_ABSENTES : FERMÉE au LOT 4 (feature-021 cycle 2). Les
// 71 classes « adoptées » (structure, kanban, graphe d'agents, bottom sheet)
// sont désormais toutes posées dans `index.html` et déclarées avec un corps
// non vide dans `app.css` — le graphe (F8/F9/F16) et le gabarit kanban
// (`#gabarits-adoptes`, jamais lu par `app.js`, F10 reste lot 5) ferment ce
// registre ensemble.
const ATTENDU_ROUGE = {};

// F16 (designer) : state-sans-cloture, has-echec, role-principal, agent-flag,
// agent-flag--echec, agent-flag--sans-cloture, role-ring — 4 représentations
// absentes du prototype, mandat ADR-0031 §3. KEYFRAMES_AJOUTES (F2) reste
// vide : ces 4 inventions sont STATIQUES, aucun jeton neuf non plus.
// feature-023 (lot 12) : token-value--partiel s'ajoute à la même discipline
// (classe posée SEULEMENT par app.js, jamais dans index.html statique — non
// scrutée par B1 ci-dessous pour cette raison, enregistrée quand même par
// discipline, comme les 7 entrées F16 déjà dynamiques-seules).
const CLASSES_AJOUTEES = [
  { nom: "state-sans-cloture", raison: "F16 : représenter un passage sans fin observée sans se fonder sur SessionEnd (PIEGES §17)" },
  { nom: "has-echec", raison: "F16 : représenter un échec, absent du prototype (3 classes d'état seulement)" },
  { nom: "role-principal", raison: "F16 : distinguer l'agent principal, absent du prototype" },
  { nom: "agent-flag", raison: "F16 : porteur générique des drapeaux d'état neufs (base commune)" },
  { nom: "agent-flag--echec", raison: "F16 : variante échec du drapeau" },
  { nom: "agent-flag--sans-cloture", raison: "F16 : variante sans-clôture du drapeau" },
  { nom: "token-value--partiel", raison: "feature-023 (lot 12) : distinguer un relevé de tokens interrompu par le budget (S5.6) d'un chiffre absent ou connu — glyphe dédié, jamais celui de sans-clôture" },
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

// Depuis la réouverture de périmètre (lot 6), `ADOPTE` seul désigne les 199
// éléments du cycle ENTIER — la cible de ce volet STATIQUE reste ce qui est
// DÉJÀ construit (lots 0-5), filtré par `lotEstDejaLivre` (voir sa note dans
// `test_conformite_partition_donnees.js`), jamais par le verdict seul.
const classesRequisesAdoptees = new Set(
  Object.entries(PARTITION_CLASSES)
    .filter(([, [verdict, , lot]]) => verdict === ADOPTE && lotEstDejaLivre(lot))
    .map(([c]) => c)
);
console.log("[dérivé] " + classesRequisesAdoptees.size + " classe(s) « adopté, déjà livrée » requise(s) (F0)");

const classesHtmlApp = lib.classesDeHtml(htmlApp);
const classesCssApp = lib.classesDeclareesAvecCorps(cssApp);

// -- Exception déclarée : classes POSÉES À L'EXÉCUTION, jamais statiques --
// Le prototype montre ces éléments avec des DONNÉES D'EXEMPLE (deux messages
// écrits en dur dans son HTML) ; le cockpit les dérive du réel et les
// construit dans `app.js` à chaque rendu. Une parité STATIQUE ne peut donc
// pas les voir — c'est la même limite structurelle que les 96 faux positifs
// qui ont fait retirer le sens CSS→HTML de ce volet au lot 0, et c'est le
// mandat de F3b (`test_app_classes_navigateur.py`, DOM exécuté).
//
// ⚠️ Ce n'est PAS une dette : rien à combler, donc rien dans ATTENDU_ROUGE.
// La clause miroir ci-dessous fait échouer une entrée devenue statique —
// sans quoi la liste survivrait à sa raison d'être.
const POSEES_A_L_EXECUTION = {
  "bubble": "corps d'un message, construit par app.js — le prototype l'écrit en dur (2 messages d'exemple) ; couverte par F3b",
  "message": "conteneur d'un message, construit par app.js — idem ; couverte par F3b",
  "message-avatar": "glyphe d'un message, construit par app.js — idem ; couverte par F3b",
};

// -- A. Fidélité au prototype (modulo F0) --
const manquantesHtml = [...classesRequisesAdoptees]
  .filter((c) => !classesHtmlApp.has(c))
  .filter((c) => !Object.prototype.hasOwnProperty.call(POSEES_A_L_EXECUTION, c));
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

// Clause miroir de POSEES_A_L_EXECUTION : une classe qui DEVIENDRAIT statique
// n'a plus de raison d'être exemptée — l'exception doit être retirée, sinon
// elle masquerait pour toujours une régression sur cette classe.
const exemptionsPerimees = Object.keys(POSEES_A_L_EXECUTION).filter((c) => classesHtmlApp.has(c));
check("F3a_aucune_exemption_execution_perimee", exemptionsPerimees.length === 0,
  exemptionsPerimees.length
    ? exemptionsPerimees.join(", ") + " — désormais posée(s) statiquement dans index.html : "
      + "retirer l'entrée de POSEES_A_L_EXECUTION, le volet statique les couvre"
    : "");

// Et l'inverse : une exemption doit désigner une classe RÉELLEMENT requise,
// sinon la liste accumule des noms morts que plus rien ne rattache à F0.
const exemptionsHorsCible = Object.keys(POSEES_A_L_EXECUTION).filter((c) => !classesRequisesAdoptees.has(c));
check("F3a_toute_exemption_execution_designe_une_classe_requise", exemptionsHorsCible.length === 0,
  exemptionsHorsCible.join(", "));

// Garde méta (feature-021, lot 13, D5) : LOTS_DEJA_LIVRES (module partagé)
// ne doit JAMAIS être EN RETARD sur ce qui est réellement construit. Une
// classe `adopte` dont le lot déclaré n'est PAS couvert par
// `lotEstDejaLivre` (donc exclue de `classesRequisesAdoptees` ci-dessus) mais
// qui est pourtant DÉJÀ posée dans index.html ET déclarée avec un corps non
// vide dans app.css révèle exactement le trou trouvé (et corrigé) au lot 12
// (jeton du lot 11 absent de LOTS_DEJA_LIVRES, 17 éléments non vérifiés par
// aucune garde) — sans cette assertion, la même omission passe totalement
// inaperçue : le compte de cas de ce fichier ne varie pas, `fideliteOk` ne
// regarde jamais ce qui a été EXCLU du périmètre par `lotEstDejaLivre`.
// Mesuré par mutation : retirer "12" de LOTS_DEJA_LIVRES laisse ce fichier à
// 5 cas / 0 échec inchangé sans cette garde ; avec elle, cette assertion
// meurt nommément (feature-021, rapport de mutation du lot 13).
const classesConstruitesMaisLotNonCouvert = Object.entries(PARTITION_CLASSES)
  .filter(([, [verdict]]) => verdict === ADOPTE)
  .filter(([, [, , lot]]) => !lotEstDejaLivre(lot))
  .filter(([nom]) => !Object.prototype.hasOwnProperty.call(POSEES_A_L_EXECUTION, nom))
  .filter(([nom]) => classesHtmlApp.has(nom) && classesCssApp.has(nom))
  .map(([nom]) => nom);
check("F3a_LOTS_DEJA_LIVRES_ne_retarde_pas_sur_le_construit",
  classesConstruitesMaisLotNonCouvert.length === 0,
  classesConstruitesMaisLotNonCouvert.join(", ") +
    " — posée(s)/déclarée(s) dans le code, mais leur lot n'est couvert par aucun "
    + "jeton de LOTS_DEJA_LIVRES : le registre partagé est en retard sur le code livré");

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
