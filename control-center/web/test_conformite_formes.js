"use strict";
/* feature-021, cycle 2, lot 6 (reboucle de fidélité) — F17 : ÉCHELLE DE
 * FORME ET ÉLÉVATIONS.
 *
 *     node control-center/web/test_conformite_formes.js
 *
 * Défaut mesuré à l'ouverture du lot : F1 (`test_conformite_jetons.js`)
 * vérifie que `--shadow-1`/`--shadow-2` sont DÉCLARÉS dans `:root`, au bit
 * près — mais RIEN ne vérifiait qu'ils soient EMPLOYÉS. Résultat mesuré :
 * les deux ombres M3 étaient présentes dans `:root` et utilisées ZÉRO fois
 * dans toute la feuille, pendant que plusieurs sélecteurs portaient un
 * `border-radius` (2px/3px/4px) qui n'existe dans AUCUNE règle du
 * prototype — des boîtes plates à angles vifs sous un thème qui se déclare
 * Material 3. Cette garde ferme les deux trous :
 *
 *   F17a — tout `border-radius` employé dans app.css doit avoir une valeur
 *          qui appartient à l'ÉCHELLE DU PROTOTYPE (l'ensemble des valeurs
 *          de `border-radius` réellement déclarées quelque part dans le
 *          prototype, DÉRIVÉ à chaque exécution — PIEGES §21, jamais recopié
 *          à la main). Un rayon hors échelle échoue en NOMMANT le sélecteur
 *          et la valeur fautive.
 *   F17b — `--shadow-1` et `--shadow-2` sont réellement RÉFÉRENCÉS
 *          (`var(--shadow-N)`) au moins une fois chacun dans app.css — pas
 *          seulement déclarés dans `:root`.
 *   F17c — clause MIROIR de F17b, généralisée : tout jeton `:root` dont le
 *          nom évoque une forme ou une élévation (`shadow`, `radius`,
 *          `rayon`, `elevation`, `ombre`) et qui n'est référencé nulle part
 *          ailleurs dans la feuille est un ÉCHEC — c'est EXACTEMENT le cas
 *          qui a échappé à F1 (un jeton déclaré, jamais consommé). Portée
 *          générique (pas seulement `--shadow-1`/`--shadow-2` nommés en dur)
 *          pour rester vraie si un futur lot ajoute un troisième jeton
 *          d'élévation sans le brancher nulle part.
 *
 * Mesure sur la SOURCE (parseur par profondeur d'accolades, jamais `grep` —
 * PIEGES §26) plutôt que sur le DOM peint : les valeurs comparées ici sont
 * des littéraux `border-radius`/`box-shadow` déclarés PAR RÈGLE, sans
 * cascade ambiguë à résoudre (contrairement au double `:root` de F1) — la
 * source dit exactement ce que le navigateur peindra pour cette propriété
 * précise, un aller au navigateur n'ajouterait ici aucune fidélité, juste
 * une dépendance Chromium supplémentaire (PIEGES §28).
 */

const lib = require("./test_conformite_lib.js");

// Aucune entrée : cette garde est neuve, rien n'y est encore rouge par
// construction déclarée.
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

// ===================================================================== //
// Atteignabilité bruyante
// ===================================================================== //
const htmlPrototype = lib.lirePrototype();
const cssAppChemin = lib.cheminWeb("app.css");
const cssApp = lib.lireNonVide(cssAppChemin, "control-center/web/app.css");
console.log("[atteignabilité] prototype : " + htmlPrototype.length + " octets ; app.css : " + cssApp.length + " octets");

const cssPrototype = lib.extraireBlocStyle(htmlPrototype);

// ===================================================================== //
// Extraction : toute déclaration `border-radius`/`box-shadow` d'une feuille,
// à TOUTE profondeur (racine + sous `@media`), jamais dans un `@keyframes`
// (qui ne porte que des étapes d'animation, pas des règles de style) ni dans
// l'en-tête d'un `@media`/`@supports` lui-même (dont `corps` est du texte
// brut, pas des déclarations).
// ===================================================================== //
function declarationsDeForme(cssBrut, prop) {
  const out = [];
  for (const regle of lib.reglesCss(cssBrut)) {
    if (regle.estKeyframes || regle.estAtRegle || regle.estAutreAtRegle) continue;
    for (const d of lib.declarationsDeCorps(regle.corps)) {
      if (d.prop.toLowerCase() === prop) {
        out.push({ selecteur: regle.selecteur, val: d.val, profondeur: regle.profondeur });
      }
    }
  }
  return out;
}

// ===================================================================== //
// F17a — échelle de forme
// ===================================================================== //
const rayonsPrototype = declarationsDeForme(cssPrototype, "border-radius");
const echelleRayons = new Set(rayonsPrototype.map((d) => d.val));
console.log("[dérivé] " + rayonsPrototype.length + " déclaration(s) `border-radius` dans le prototype, " +
  echelleRayons.size + " valeur(s) distincte(s) : " + [...echelleRayons].sort().join(", "));

const rayonsApp = declarationsDeForme(cssApp, "border-radius");
const rayonsHorsEchelle = rayonsApp.filter((d) => !echelleRayons.has(d.val));
check("F17a_tout_rayon_employe_appartient_a_lechelle_du_prototype",
  rayonsHorsEchelle.length === 0,
  rayonsHorsEchelle.length + " déclaration(s) hors échelle : " +
    rayonsHorsEchelle.map((d) => "`" + d.selecteur + "` : " + d.val).join(" | "));

// Non-régression du détecteur lui-même : une échelle à un seul élément doit
// laisser passer une valeur membre et refuser une valeur absente — fige le
// comportement de comparaison hors de tout aléa du contenu actuel d'app.css.
(function nonRegressionEchelle() {
  const echelleTemoin = new Set(["12px", "50%"]);
  const conforme = [{ selecteur: ".x", val: "12px" }, { selecteur: ".y", val: "50%" }];
  const fautif = [{ selecteur: ".x", val: "12px" }, { selecteur: ".z", val: "3px" }];
  check("F17a_NONREGRESSION_toutes_valeurs_membres_passent",
    conforme.every((d) => echelleTemoin.has(d.val)));
  const horsEchelleTemoin = fautif.filter((d) => !echelleTemoin.has(d.val));
  check("F17a_NONREGRESSION_valeur_absente_est_refusee_et_nommee",
    horsEchelleTemoin.length === 1 && horsEchelleTemoin[0].selecteur === ".z" && horsEchelleTemoin[0].val === "3px");
})();

// ===================================================================== //
// F17b — `--shadow-1`/`--shadow-2` réellement employés (référencés par
// `var(--shadow-N)` dans une déclaration, n'importe laquelle — pas
// seulement `box-shadow` : un usage dans un `filter` ou une variable
// composée compterait tout autant).
// ===================================================================== //
function usagesDeVar(cssBrut, nomJeton) {
  const out = [];
  const aiguille = "var(" + nomJeton + ")";
  for (const regle of lib.reglesCss(cssBrut)) {
    if (regle.estKeyframes || regle.estAtRegle || regle.estAutreAtRegle) continue;
    for (const d of lib.declarationsDeCorps(regle.corps)) {
      if (d.val.includes(aiguille)) {
        out.push({ selecteur: regle.selecteur, prop: d.prop, val: d.val });
      }
    }
  }
  return out;
}

const usagesShadow1 = usagesDeVar(cssApp, "--shadow-1");
const usagesShadow2 = usagesDeVar(cssApp, "--shadow-2");
console.log("[dérivé] `var(--shadow-1)` : " + usagesShadow1.length + " usage(s) — " +
  (usagesShadow1.map((u) => u.selecteur).join(", ") || "aucun"));
console.log("[dérivé] `var(--shadow-2)` : " + usagesShadow2.length + " usage(s) — " +
  (usagesShadow2.map((u) => u.selecteur).join(", ") || "aucun"));

check("F17b_shadow_1_reellement_employe", usagesShadow1.length > 0,
  "0 usage de `var(--shadow-1)` hors `:root` — le jeton est déclaré mais jamais peint");
check("F17b_shadow_2_reellement_employe", usagesShadow2.length > 0,
  "0 usage de `var(--shadow-2)` hors `:root` — le jeton est déclaré mais jamais peint");

// ===================================================================== //
// F17c — clause miroir, généralisée : tout jeton `:root` de FORME ou
// D'ÉLÉVATION doit être employé au moins une fois ailleurs dans la feuille.
// Portée par un motif de NOM (pas une liste à jour à la main, PIEGES §21) :
// tout `--x` dont le nom contient shadow/radius/rayon/elevation/ombre.
// ===================================================================== //
const MOTIF_JETON_FORME = /(shadow|radius|rayon|elevation|ombre)/i;
const declRootApp = lib.declarationsRoot(cssApp);
const jetonsFormeDeclares = declRootApp
  .filter((d) => d.prop.startsWith("--") && MOTIF_JETON_FORME.test(d.prop))
  .map((d) => d.prop);
console.log("[dérivé] jeton(s) `:root` de forme/élévation détecté(s) par motif de nom : " +
  jetonsFormeDeclares.join(", "));

const cssAppHorsRoot = lib.cssSansRootTopNiveau(cssApp);
const jetonsFormeNonEmployes = jetonsFormeDeclares.filter((nom) => {
  const usages = usagesDeVar(cssAppHorsRoot, nom);
  return usages.length === 0;
});
check("F17c_aucun_jeton_de_forme_declare_et_jamais_employe",
  jetonsFormeNonEmployes.length === 0,
  jetonsFormeNonEmployes.length + " jeton(s) déclaré(s) dans `:root` mais jamais employé(s) ailleurs : " +
    jetonsFormeNonEmployes.join(", "));

// Non-régression de la clause miroir : un jeton fabriqué en mémoire, déclaré
// puis JAMAIS référencé, doit être détecté — sans dépendre du contenu actuel
// d'app.css (qui pourrait, un jour, ne plus rien laisser d'inemployé).
(function nonRegressionMiroir() {
  const rootTemoin = ":root { --shadow-9: 0 0 0 1px red; --autre: 1px; }\n" +
    ".carte { box-shadow: var(--shadow-9); }\n" +
    ".fantome-non-lie {}\n";
  const declRootTemoin = lib.declarationsRoot(rootTemoin);
  const jetonsFormeTemoin = declRootTemoin
    .filter((d) => d.prop.startsWith("--") && MOTIF_JETON_FORME.test(d.prop))
    .map((d) => d.prop);
  check("F17c_NONREGRESSION_motif_isole_les_jetons_de_forme",
    jetonsFormeTemoin.length === 1 && jetonsFormeTemoin[0] === "--shadow-9",
    "obtenu : " + jetonsFormeTemoin.join(", "));

  const horsRootTemoin = lib.cssSansRootTopNiveau(rootTemoin);
  const employe = usagesDeVar(horsRootTemoin, "--shadow-9");
  check("F17c_NONREGRESSION_jeton_employe_est_vu", employe.length === 1);

  // Un second jeton de forme, déclaré mais jamais référencé : doit être
  // signalé comme non employé, jamais faussement blanchi par le premier.
  const rootDeuxJetons = ":root { --shadow-9: 0 0 0 1px red; --radius-fantome: 4px; }\n" +
    ".carte { box-shadow: var(--shadow-9); }\n";
  const declDeux = lib.declarationsRoot(rootDeuxJetons)
    .filter((d) => d.prop.startsWith("--") && MOTIF_JETON_FORME.test(d.prop))
    .map((d) => d.prop);
  const horsRootDeux = lib.cssSansRootTopNiveau(rootDeuxJetons);
  const nonEmployesDeux = declDeux.filter((nom) => usagesDeVar(horsRootDeux, nom).length === 0);
  check("F17c_NONREGRESSION_jeton_non_employe_est_refuse_et_nomme",
    nonEmployesDeux.length === 1 && nonEmployesDeux[0] === "--radius-fantome",
    "obtenu : " + nonEmployesDeux.join(", "));
})();

// ===================================================================== //
// Registre ATTENDU_ROUGE — vide à ce lot ; toute entrée future doit porter
// un lot de clôture nommé (même discipline que F1/F2).
// ===================================================================== //
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
