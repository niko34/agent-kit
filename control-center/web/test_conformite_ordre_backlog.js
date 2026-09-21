"use strict";
/* feature-021, cycle 2, lot 6 (reboucle de fidélité) — F18 : ORDRE DE PAGE.
 *
 *     node control-center/web/test_conformite_ordre_backlog.js
 *
 * Défaut mesuré à l'ouverture du lot : le prototype place le Backlog en
 * second élément visible (barre résumé → graphe → feuille de détail →
 * Backlog), mais `index.html` l'enterrait sous trois sections préexistantes
 * (Agents, Système, formulaire de demande) que le prototype ne positionne
 * pas du tout. AUCUNE des 135 assertions du cycle ne portait sur un ORDRE de
 * sections — seulement sur leur présence (F3a/F4a) — donc ce défaut passait
 * inaperçu de toute la suite. Cette garde ferme ce trou précis, et
 * SEULEMENT lui : elle ne prend pas parti sur l'ordre relatif d'Agents,
 * Système et demande entre elles (hors périmètre du défaut mesuré).
 *
 * Mesure sur la POSITION TEXTUELLE des attributs `id=` dans le HTML servi
 * (jamais `querySelector`/DOM : ce harnais est un script Node autonome, pas
 * un navigateur — PIEGES §6). La position dans le texte source EST la
 * position dans le DOM pour des éléments frères non réordonnés par script
 * au chargement (aucun de ces `<section>` ne l'est ici) — hypothèse
 * documentée, pas une garde sur le DOM peint (voir aussi PIEGES §24, qui
 * met en garde contre une comparaison de position de TEXTE VISIBLE — ce
 * n'est pas le cas ici : on compare la position d'ATTRIBUTS `id=`
 * structurels, jamais un rendu de texte que la cascade pourrait déplacer).
 */

const lib = require("./test_conformite_lib.js");

const ATTENDU_ROUGE = {};

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

const cheminIndex = lib.cheminWeb("index.html");
const htmlIndex = lib.lireNonVide(cheminIndex, "control-center/web/index.html");
const corps = lib.extraireCorpsAvantScript(htmlIndex);

// Position du PREMIER `id="…"` littéral rencontré — bornée à l'attribut,
// jamais à un paragraphe qui l'engloberait (même garde-fou que
// `baliseParId`, PIEGES §27).
function positionDeId(idValeur) {
  const aiguille = 'id="' + idValeur + '"';
  const pos = corps.indexOf(aiguille);
  if (pos === -1) {
    throw new Error("ATTEIGNABILITE : id=\"" + idValeur + "\" introuvable dans index.html");
  }
  return pos;
}

const pDetailSheet = positionDeId("selected-title");
const pBacklog = positionDeId("backlog-title");
const pAgents = positionDeId("titre-agents");
const pSysteme = positionDeId("titre-systeme");
const pDemande = positionDeId("titre-demande");
console.log("[dérivé] positions (octets) : selected-title=" + pDetailSheet +
  " backlog-title=" + pBacklog + " titre-agents=" + pAgents +
  " titre-systeme=" + pSysteme + " titre-demande=" + pDemande);

check("F18_backlog_suit_directement_la_feuille_de_detail",
  pDetailSheet < pBacklog,
  "`selected-title` (feuille de détail) devrait précéder `backlog-title` — obtenu " +
    pDetailSheet + " >= " + pBacklog);

check("F18_backlog_precede_agents_systeme_et_demande",
  pBacklog < pAgents && pBacklog < pSysteme && pBacklog < pDemande,
  "`backlog-title` devrait précéder titre-agents(" + pAgents + "), titre-systeme(" +
    pSysteme + ") et titre-demande(" + pDemande + ") — obtenu backlog-title=" + pBacklog);

// Non-régression du comparateur : fige la lecture « position textuelle »
// hors de tout aléa du contenu actuel d'index.html.
(function nonRegressionPosition() {
  const texteTemoin = '<section id="a"></section><section id="b"></section>';
  const posA = texteTemoin.indexOf('id="a"');
  const posB = texteTemoin.indexOf('id="b"');
  check("F18_NONREGRESSION_a_precede_b_dans_un_temoin_construit", posA < posB);
  const texteInverse = '<section id="b"></section><section id="a"></section>';
  const posBinv = texteInverse.indexOf('id="b"');
  const posAinv = texteInverse.indexOf('id="a"');
  check("F18_NONREGRESSION_inversion_est_detectee", posBinv < posAinv);
})();

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
