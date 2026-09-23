"use strict";
/* feature-021, cycle 2, lot 0 — F5a : MATRICE DE CONTRASTE, VOLET ARITHMÉTIQUE.
 *
 *     node control-center/web/test_conformite_contrastes.js
 *
 * ⚠️ Ce n'est PAS une liste, c'est une FONCTION, recalculée à chaque
 * exécution à partir des jetons DÉRIVÉS du prototype (même extracteur que
 * F1, `test_conformite_lib.js`) :
 *
 *     COUPLES_INTERDITS = { (encre, fond) ∈ ENCRES × SURFACES |
 *                            contraste(hex[encre], hex[fond]) < seuil(rôle(encre)) }
 *
 * - JETONS et leurs hex : extraits du bloc `:root` (20) PLUS les 8 valeurs
 *   hexadécimales promues (hors `:root`, hors `#000` qui n'est qu'un arrêt
 *   de `mask`, pas une couleur peinte — dérivé PAR CONTEXTE DE PROPRIÉTÉ,
 *   `hexHorsRootAvecContexte`, pas par simple présence de motif hex).
 * - SURFACES (5, « tonales ») : `--bg`, `--surface`, `--surface-low`,
 *   `--surface-high`, `--surface-highest` — décision humaine du 2026-09-21
 *   (Cycle 2, point 1) : « 10 jetons d'encre × 5 surfaces tonales ».
 * - `rôle(jeton)` : la SEULE énumération tenue à la main tolérée ici, parce
 *   qu'aucun artefact ne la porte (Notes d'implémentation cycle 2, §1). Elle
 *   est soumise à la CLAUSE MIROIR : tout jeton dérivé du prototype SANS
 *   rôle déclaré est un ÉCHEC.
 * - `seuil` : 4,65 pour `texte` (nominal, marge de 2,5 bits au-dessus de
 *   4,5 — ADR-0024 §5), 3,0 pour `trait`.
 *
 * ⚠️ N'INSCRIT AUCUN COMPTE lu ailleurs (« 12 sur 50 », « 11 », « 21 ») —
 * la matrice se RECALCULE, le compte est une SORTIE, jamais une entrée.
 */

const lib = require("./test_conformite_lib.js");
// Dérivation PARTAGÉE avec F5b (`test_app_contrastes_navigateur.py`, via un
// pont Node) — extraite au lot 5 pour que les deux volets ne recopient
// jamais la même formule (PIEGES §21) : voir test_conformite_contrastes_lib.js.
const { deriverMatriceContraste } = require("./test_conformite_contrastes_lib.js");

let _tests = 0;
const _echecs = [];
function check(nom, condition, detail) {
  _tests += 1;
  if (condition) console.log("  ok     " + nom);
  else { _echecs.push(nom); console.log("  ECHEC  " + nom + (detail ? " : " + detail : "")); }
}

// ===================================================================== //
// Atteignabilité bruyante
// ===================================================================== //
const htmlPrototype = lib.lirePrototype();
console.log("[atteignabilité] prototype : " + htmlPrototype.length + " octets");
const cssPrototype = lib.extraireBlocStyle(htmlPrototype);

// ===================================================================== //
// Dérivation des 28 jetons de couleur (20 :root + 8 promus, hors #000),
// des rôles et de la matrice — voir test_conformite_contrastes_lib.js.
// ===================================================================== //
const { JETONS, ROLES, SURFACES, ENCRES, COUPLES_INTERDITS, rolesManquants, rolesPerimes, TEXTE, TRAIT } =
  deriverMatriceContraste(cssPrototype);
console.log("[dérivé] total : " + Object.keys(JETONS).length + " jetons de couleur");

check("F5a_tout_jeton_derive_a_un_role_declare", rolesManquants.length === 0,
  rolesManquants.join(", "));
check("F5a_aucun_role_declare_pour_un_jeton_qui_n_existe_plus", rolesPerimes.length === 0,
  rolesPerimes.join(", "));

check("F5a_5_surfaces_tonales_presentes_dans_les_jetons_derives",
  SURFACES.every((s) => s in JETONS), SURFACES.filter((s) => !(s in JETONS)).join(", "));

console.log("[dérivé] " + ENCRES.length + " jeton(s) d'encre (texte+trait) × " + SURFACES.length + " surface(s) = " +
  (ENCRES.length * SURFACES.length) + " couple(s) à évaluer");
console.log("[dérivé, SORTIE, pas une entrée] " + COUPLES_INTERDITS.length + " couple(s) interdit(s) sur " +
  (ENCRES.length * SURFACES.length) + " évalué(s) :");
for (const c of COUPLES_INTERDITS) {
  console.log("           " + c.encre + " sur " + c.fond + " = " + c.contraste.toFixed(4) +
    " < seuil " + c.seuil + " (" + c.role + ")");
}
check("F5a_matrice_calculee_sans_exception", true); // la garde ci-dessus n'a rien levé : atteignable

// Repère structurel (pas un compte recopié) : au moins un couple doit
// exister sous le seuil, sinon la garde n'a jamais été vue capable
// d'interdire quoi que ce soit — signe qu'elle mesure mal (cf. règle « rouge
// pour la bonne raison », appliquée ici en positif : une matrice qui
// n'interdit JAMAIS rien est suspecte au même titre qu'une garde toujours
// verte).
check("F5a_la_matrice_interdit_au_moins_un_couple", COUPLES_INTERDITS.length > 0,
  "0 couple interdit — la matrice ne discrimine rien, à re-vérifier");

function main() {
  console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
  for (const e of _echecs) console.log("  - " + e);
  process.exit(_echecs.length ? 1 : 0);
}
main();
