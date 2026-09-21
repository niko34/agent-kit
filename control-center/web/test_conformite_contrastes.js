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
// Dérivation des 28 jetons de couleur (20 :root + 8 promus, hors #000)
// ===================================================================== //
const declRoot = lib.declarationsRoot(cssPrototype);
const JETONS = {}; // identifiant -> hex
for (const d of declRoot) {
  if (d.prop.startsWith("--") && /^#[0-9a-fA-F]{3,8}$/.test(d.val)) JETONS[d.prop] = d.val;
}
const nRoot = Object.keys(JETONS).length;

const ctxHorsRoot = lib.hexHorsRootAvecContexte(cssPrototype);
const EXCLUS_NON_COULEUR = { mask: "arrêt de dégradé de masque (canal alpha), pas une couleur peinte" };
const promusParHex = new Map(); // hex -> {props:Set, exclu}
for (const occ of ctxHorsRoot) {
  if (!promusParHex.has(occ.hex)) promusParHex.set(occ.hex, { props: new Set() });
  promusParHex.get(occ.hex).props.add(occ.prop);
}
const promus = [];
const exclusDocumentes = [];
for (const [hex, info] of promusParHex) {
  const proprietes = [...info.props];
  if (proprietes.every((p) => p in EXCLUS_NON_COULEUR)) {
    exclusDocumentes.push({ hex, raison: EXCLUS_NON_COULEUR[proprietes[0]] });
    continue;
  }
  promus.push(hex);
  JETONS[hex] = hex; // identifiant = valeur elle-même, aucun nom dans le prototype
}
console.log("[dérivé] " + nRoot + " jeton(s) `:root`, " + promus.length + " promu(s) hors `:root` (exclus : " +
  exclusDocumentes.map((e) => e.hex + " [" + e.raison + "]").join("; ") + ")");
console.log("[dérivé] total : " + Object.keys(JETONS).length + " jetons de couleur");

// ===================================================================== //
// rôle(jeton) — SEULE énumération manuelle tolérée, justifiée par l'usage
// mesuré (`grep -oE '[a-z-]+:\s*[^;]*var\(--X\)'`, et par le contexte de
// propriété pour les valeurs promues, `hexHorsRootAvecContexte`).
// ===================================================================== //
const TEXTE = "texte", TRAIT = "trait", FOND = "fond";
const ROLES = {
  "--bg": FOND, "--surface": FOND, "--surface-low": FOND, "--surface-high": FOND, "--surface-highest": FOND,
  "--ink": TEXTE, "--muted": TEXTE,
  "--line": TRAIT, "--line-strong": TRAIT,
  "--primary": TEXTE, "--primary-soft": FOND, "--primary-ink": TEXTE,
  "--teal": TEXTE, "--teal-soft": FOND,
  "--coral": TEXTE, "--coral-soft": FOND,
  "--amber": TEXTE, "--amber-soft": FOND, // --amber : 0 usage mesuré (jeton libre) ; role par convention de nommage (accent de base, comme primary/teal/coral/danger)
  "--danger": TEXTE, "--danger-soft": FOND,
  "#aaa6b0": TRAIT, "#777385": TRAIT, // --state-color : anneau/halo, jamais du texte plein
  "#4e1d12": TEXTE, "#654b00": TEXTE, "#690005": TEXTE, // `color:` mesuré (hexHorsRootAvecContexte)
  "#eea52a": FOND, "#3b8f35": FOND, "#fff0c8": FOND, // `background:` mesuré
};

// Clause miroir : tout jeton dérivé du prototype doit avoir un rôle déclaré,
// et toute entrée de ROLES doit correspondre à un jeton réellement dérivé.
const jetonsDerives = new Set(Object.keys(JETONS));
const rolesManquants = [...jetonsDerives].filter((j) => !(j in ROLES));
const rolesPerimes = Object.keys(ROLES).filter((j) => !jetonsDerives.has(j));
check("F5a_tout_jeton_derive_a_un_role_declare", rolesManquants.length === 0,
  rolesManquants.join(", "));
check("F5a_aucun_role_declare_pour_un_jeton_qui_n_existe_plus", rolesPerimes.length === 0,
  rolesPerimes.join(", "));

// ===================================================================== //
// Contraste WCAG 2.x — luminance relative, calculé, jamais recopié.
// ===================================================================== //
function hexVersRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function canalLineaire(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminanceRelative(hex) {
  const [r, g, b] = hexVersRgb(hex);
  return 0.2126 * canalLineaire(r) + 0.7152 * canalLineaire(g) + 0.0722 * canalLineaire(b);
}
function contraste(hexA, hexB) {
  const la = luminanceRelative(hexA), lb = luminanceRelative(hexB);
  const [clair, sombre] = la >= lb ? [la, lb] : [lb, la];
  return (clair + 0.05) / (sombre + 0.05);
}

const SEUIL = { [TEXTE]: 4.65, [TRAIT]: 3.0 };
const SURFACES = ["--bg", "--surface", "--surface-low", "--surface-high", "--surface-highest"];
check("F5a_5_surfaces_tonales_presentes_dans_les_jetons_derives",
  SURFACES.every((s) => s in JETONS), SURFACES.filter((s) => !(s in JETONS)).join(", "));

const ENCRES = Object.keys(JETONS).filter((j) => ROLES[j] === TEXTE || ROLES[j] === TRAIT);
console.log("[dérivé] " + ENCRES.length + " jeton(s) d'encre (texte+trait) × " + SURFACES.length + " surface(s) = " +
  (ENCRES.length * SURFACES.length) + " couple(s) à évaluer");

const COUPLES_INTERDITS = [];
for (const encre of ENCRES) {
  for (const fond of SURFACES) {
    if (encre === fond) continue;
    const c = contraste(JETONS[encre], JETONS[fond]);
    const seuil = SEUIL[ROLES[encre]];
    if (c < seuil) COUPLES_INTERDITS.push({ encre, fond, contraste: c, seuil, role: ROLES[encre] });
  }
}
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
