"use strict";
/* feature-028 (lot B1/D1) — L'IPAD DE L'HUMAIN : UNITÉS DE VIEWPORT.
 *
 *     node control-center/web/test_conformite_viewport.js
 *
 * Défaut mesuré le 2026-09-22 : `app.css` porte cinq déclarations en unité
 * de viewport STATIQUE — `min-height: 100vh` (`.app-shell`),
 * `max-height: calc(100vh - 32px)` (`.feature-dialog`, `.add-item-dialog`),
 * `max-height: 58vh` (`.claude-panel`, `.kanban-viewport`) — et ZÉRO unité
 * DYNAMIQUE (`dvh`/`svh`/`lvh`). Sur iOS, `100vh` désigne le viewport
 * LARGE, qui IGNORE le clavier virtuel : une boîte modale dimensionnée
 * ainsi reste à la taille de l'écran ENTIER pendant que la zone réellement
 * visible rétrécit sous le clavier — c'est exactement le symptôme rapporté
 * par l'humain (« la popup […] rétrécit […] jusqu'à devenir inutilisable »).
 *
 * D1 : aucune unité de viewport STATIQUE (`vh` nu) ne subsiste dans
 * `app.css` sans un repli `dvh`/`svh`/`lvh` DÉCLARÉ pour la MÊME propriété,
 * dans la MÊME règle, et DANS LE BON ORDRE — le repli `vh` doit être écrit
 * AVANT l'unité dynamique : c'est ce qui permet à un navigateur qui ignore
 * `dvh` (déclaration non reconnue, donc IGNORÉE, jamais appliquée comme `0`)
 * de retomber sur la valeur `vh`, tandis qu'un navigateur qui la comprend
 * l'applique en dernier et gagne la cascade (règle CSS : à spécificité
 * égale, la DERNIÈRE déclaration valide l'emporte).
 *
 * Analyse sur la SOURCE (parseur par profondeur d'accolades de
 * `test_conformite_lib.js`, jamais `grep` — PIEGES §26), à l'exclusion des
 * `@media`/`@supports` (une unité conditionnelle ne "complète" pas la règle
 * nue, PIEGES §24/§25 : même discipline que les gardes soeurs F1/F17).
 */

const lib = require("./test_conformite_lib.js");

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

const cheminCss = lib.cheminWeb("app.css");
const css = lib.lireNonVide(cheminCss, "control-center/web/app.css");

const REGEX_VH_STATIQUE = /(?:^|[^a-zA-Z])(\d+(?:\.\d+)?)vh\b/g;
const REGEX_VH_DYNAMIQUE = /\b\d+(?:\.\d+)?[dsl]vh\b/;

// Règles de PREMIER NIVEAU seulement (hors `@media`/`@supports`) : une unité
// posée sous condition ne peut pas servir de repli inconditionnel — mêmes
// motifs que `declarationsRootRepliees` (test_conformite_lib.js).
const reglesTopNiveau = lib.reglesCss(css).filter((r) => r.profondeur === 0 && !r.estAtRegle);
check("prealable_regles_top_niveau_trouvees", reglesTopNiveau.length > 50,
  "obtenu " + reglesTopNiveau.length);

const sitesVhStatique = [];
const violations = [];

reglesTopNiveau.forEach((regle) => {
  const declarations = lib.declarationsDeCorps(regle.corps);
  declarations.forEach((decl, index) => {
    // Un même déclaration peut porter DEUX occurrences (ex. `calc(100vh -
    // 32px)` n'en a qu'une, mais on reste générique) — matchAll sur la
    // valeur, jamais sur le corps entier (PIEGES §27 : cibler l'élément,
    // pas un bloc qui l'engloberait).
    const occurrences = [...decl.val.matchAll(REGEX_VH_STATIQUE)];
    if (!occurrences.length) return;
    sitesVhStatique.push({ selecteur: regle.selecteur, prop: decl.prop, val: decl.val });

    // Cherche, PLUS LOIN dans le MÊME corps, une déclaration de LA MÊME
    // propriété qui porte une unité dynamique — c'est l'ORDRE qui fait le
    // repli : `vh` doit précéder `dvh` pour que ce dernier gagne quand il
    // est comprend, et que le premier serve de repli sinon.
    const suite = declarations.slice(index + 1);
    const replisTrouves = suite.filter(
      (d) => d.prop === decl.prop && REGEX_VH_DYNAMIQUE.test(d.val)
    );
    if (!replisTrouves.length) {
      violations.push(
        regle.selecteur + " { " + decl.prop + ": " + decl.val + " } — aucun repli "
        + "dvh/svh/lvh déclaré APRÈS pour la même propriété"
      );
    }
  });
});

console.log("[dérivé] " + sitesVhStatique.length + " site(s) en unité de viewport statique "
  + "trouvé(s) dans app.css (règles de premier niveau) : "
  + JSON.stringify(sitesVhStatique.map((s) => s.selecteur + "/" + s.prop)));

check("D1_au_moins_les_cinq_sites_mesures_sont_couverts", sitesVhStatique.length >= 5,
  "obtenu " + sitesVhStatique.length + " — attendu au moins 5 "
  + "(.app-shell, .claude-panel, .kanban-viewport, .feature-dialog, .add-item-dialog)");

check("D1_aucune_unite_de_viewport_statique_sans_repli_declare", violations.length === 0,
  JSON.stringify(violations));

// -- Non-régression du comparateur lui-même : témoins construits, jamais
// pris pour argent comptant sans preuve qu'ils discriminent (PIEGES §51). --
(function nonRegressionSurTemoinsConstruits() {
  const cssTemoinSansRepli = ".t1 { max-height: 100vh; }";
  const reglesT1 = lib.reglesCss(cssTemoinSansRepli).filter((r) => r.profondeur === 0);
  const declsT1 = lib.declarationsDeCorps(reglesT1[0].corps);
  const occurrencesT1 = [...declsT1[0].val.matchAll(REGEX_VH_STATIQUE)];
  check("NONREGRESSION_temoin_sans_repli_est_detecte", occurrencesT1.length === 1);

  const cssTemoinAvecRepli = ".t2 { max-height: 100vh; max-height: 100dvh; }";
  const reglesT2 = lib.reglesCss(cssTemoinAvecRepli).filter((r) => r.profondeur === 0);
  const declsT2 = lib.declarationsDeCorps(reglesT2[0].corps);
  const repliT2 = declsT2.slice(1).some((d) => d.prop === declsT2[0].prop && REGEX_VH_DYNAMIQUE.test(d.val));
  check("NONREGRESSION_temoin_avec_repli_est_reconnu", repliT2 === true);

  // Ordre INVERSÉ (dvh avant vh) : le repli existe TEXTUELLEMENT mais dans
  // le MAUVAIS sens — un navigateur qui comprend `dvh` appliquerait ensuite
  // `vh` par-dessus (dernière déclaration valide gagne), ce qui n'est PAS
  // le comportement voulu. Ce comparateur-ci ne cherche le repli qu'APRÈS
  // l'occurrence statique : un repli avant elle n'est pas vu ici, et DOIT
  // donc échouer comme « aucun repli déclaré ».
  const cssTemoinOrdreInverse = ".t3 { max-height: 100dvh; max-height: 100vh; }";
  const reglesT3 = lib.reglesCss(cssTemoinOrdreInverse).filter((r) => r.profondeur === 0);
  const declsT3 = lib.declarationsDeCorps(reglesT3[0].corps);
  const occurrencesT3 = [...declsT3[1].val.matchAll(REGEX_VH_STATIQUE)];
  const repliT3 = declsT3.slice(2).some((d) => d.prop === declsT3[1].prop && REGEX_VH_DYNAMIQUE.test(d.val));
  check("NONREGRESSION_ordre_inverse_est_rejete", occurrencesT3.length === 1 && repliT3 === false);

  // `dvh` seul ne doit JAMAIS être confondu avec un `vh` nu.
  check("NONREGRESSION_dvh_seul_nest_pas_un_faux_positif",
    [..."max-height: 58dvh".matchAll(REGEX_VH_STATIQUE)].length === 0);
})();

console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
for (const e of _echecs) console.log("  - " + e);
process.exit(_echecs.length ? 1 : 0);
