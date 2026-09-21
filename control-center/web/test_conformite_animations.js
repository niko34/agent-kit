"use strict";
/* feature-021, cycle 2, lot 0 — F2 : TABLE DES DURÉES.
 *
 *     node control-center/web/test_conformite_animations.js
 *
 * Table `(sélecteur, propriété) -> valeur` pour toute déclaration
 * `animation`, `transition`, `animation-delay` du prototype, PLUS les noms
 * des `@keyframes`. Les NOMS DU PROTOTYPE SONT NORMATIFS (Notes
 * d'implémentation cycle 2, §4) : sans identité de nom, deux tables ne se
 * comparent que par cardinalité — « même multi-ensemble de durées » est vrai
 * pour n'importe quelle permutation, une garde verte à vide. C'est pourquoi
 * la comparaison ci-dessous est indexée par SÉLECTEUR LITTÉRAL, pas par
 * position ni par tri des valeurs.
 *
 * Mesuré sur le prototype (dérivé à chaque exécution, jamais recopié) :
 * 4 `@keyframes`, 6 `animation:`, 9 `transition:`, 2 `animation-delay:
 * calc(var(--i) * …)`.
 */

const lib = require("./test_conformite_lib.js");

/* ⚠️ LIMITE DE SENSIBILITÉ, À LIRE AVANT DE CROIRE CETTE GARDE SOUS FILET.
 *
 * Tant que `F2_TABLE_DES_DUREES` est intégralement sous `ATTENDU_ROUGE`
 * (clôture lot 4), une mutation du prototype se propage bien à l'attendu —
 * vérifié : renommer `@keyframes work-orbit` en `work-orbitXX` change la
 * liste dérivée — mais elle NE PEUT PAS rendre la garde rouge, puisque
 * l'assertion est déjà quarantinée. F2 ne tue donc aucun mutant AUJOURD'HUI ;
 * sa sensibilité n'est démontrable qu'au lot 4, quand l'entrée sort du
 * registre. Les quatre `mesure_*` ci-dessous, eux, sont sous filet dès
 * maintenant : ils portent sur le prototype seul.
 *
 * Note de cascade : `clefApp` est une Map construite dans l'ordre du
 * document, donc une (sélecteur, propriété) déclarée deux fois retient la
 * DERNIÈRE — ce qui est bien la sémantique CSS à spécificité égale.
 */
const ATTENDU_ROUGE = {
  F2_TABLE_DES_DUREES: {
    description: "aucune des déclarations animation/transition/animation-delay ni des " +
      "4 @keyframes du prototype n'existe encore dans app.css : le graphe d'agents et ses " +
      "animations d'enchaînement ne sont pas encore implémentés.",
    lotDeCloture: "lot 4",
    date: "2026-09-21",
  },
};

// Toute déclaration ou tout `@keyframes` qu'app.css ajoute au-delà de ceux du
// prototype, AVEC sa raison (F16 : 4 représentations neuves, statiques —
// KEYFRAMES_AJOUTES reste donc VIDE par construction, cf. brief designer).
const KEYFRAMES_AJOUTES = [];

let _tests = 0;
const _echecs = [];
function check(nom, condition, detail) {
  _tests += 1;
  if (condition) console.log("  ok     " + nom);
  else { _echecs.push(nom); console.log("  ECHEC  " + nom + (detail ? " : " + detail : "")); }
}

const htmlPrototype = lib.lirePrototype();
const cssApp = lib.lireNonVide(lib.cheminWeb("app.css"), "control-center/web/app.css");
console.log("[atteignabilité] prototype : " + htmlPrototype.length + " octets ; app.css : " + cssApp.length + " octets");

const cssPrototype = lib.extraireBlocStyle(htmlPrototype);
const kfPrototype = lib.nomsKeyframes(cssPrototype);
const declPrototype = lib.declarationsAnimationEtTransition(cssPrototype);
const compte = { animation: 0, transition: 0, "animation-delay": 0 };
declPrototype.forEach((d) => compte[d.prop]++);
console.log("[dérivé] @keyframes du prototype (" + kfPrototype.size + ") : " + [...kfPrototype].join(", "));
console.log("[dérivé] déclarations du prototype : " + JSON.stringify(compte));

check("mesure_4_keyframes", kfPrototype.size === 4, "obtenu " + kfPrototype.size);
check("mesure_6_animation", compte.animation === 6, "obtenu " + compte.animation);
check("mesure_9_transition", compte.transition === 9, "obtenu " + compte.transition);
check("mesure_2_animation_delay", compte["animation-delay"] === 2, "obtenu " + compte["animation-delay"]);

const kfApp = lib.nomsKeyframes(cssApp);
const declApp = lib.declarationsAnimationEtTransition(cssApp);
const clefApp = new Map(declApp.map((d) => [d.selecteur + "||" + d.prop, d.val]));

const kfManquants = [...kfPrototype].filter((n) => !kfApp.has(n));
const declManquantes = [];
for (const d of declPrototype) {
  const clef = d.selecteur + "||" + d.prop;
  if (!clefApp.has(clef)) declManquantes.push(clef + " (attendu `" + d.val + "`)");
  else if (clefApp.get(clef) !== d.val) declManquantes.push(clef + " (attendu `" + d.val + "`, obtenu `" + clefApp.get(clef) + "`)");
}

const tableEstConforme = kfManquants.length === 0 && declManquantes.length === 0;
if (tableEstConforme) {
  check("F2_table_des_durees_conforme_au_prototype", true);
} else {
  console.log("  ECHEC  F2_table_des_durees_conforme_au_prototype : " +
    kfManquants.length + " @keyframes manquant(s) [" + kfManquants.join(", ") + "], " +
    declManquantes.length + " déclaration(s) manquante(s)/divergente(s)");
  for (const d of declManquantes.slice(0, 20)) console.log("           " + d);
  if (ATTENDU_ROUGE.F2_TABLE_DES_DUREES) {
    console.log("  (ATTENDU_ROUGE F2_TABLE_DES_DUREES, clôture " + ATTENDU_ROUGE.F2_TABLE_DES_DUREES.lotDeCloture + ")");
  } else {
    _tests += 1;
    _echecs.push("F2_table_des_durees_conforme_au_prototype_HORS_REGISTRE");
  }
}

// Clause miroir : tout @keyframes d'app.css hors du prototype doit être dans
// KEYFRAMES_AJOUTES.
const kfExtra = [...kfApp].filter((n) => !kfPrototype.has(n) && !KEYFRAMES_AJOUTES.includes(n));
check("aucun_keyframes_extra_non_declare", kfExtra.length === 0,
  kfExtra.length + " non déclaré(s) : " + kfExtra.join(", "));

if (tableEstConforme && ATTENDU_ROUGE.F2_TABLE_DES_DUREES) {
  check("F2_TABLE_DES_DUREES_purgee_du_registre_si_verte", false,
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
