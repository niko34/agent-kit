"use strict";
/* Harnais headless pour le socle de thème (feature-015) — jetons de couleur,
 * identité par agent, bascule à trois positions.
 *
 *     node control-center/web/test_app_theme.js
 *
 * Zéro dépendance installée (ADR-0006) : uniquement `fs`, `path`, `vm` de la
 * bibliothèque standard Node — même discipline que `test_app_bug012.js`, dont
 * ce fichier reprend le bac à sable (dupliqué ici à dessein : chaque harnais
 * de `control-center/web/` reste un script autonome, lisible seul).
 *
 * Convention du projet : sortie « N cas, M echec(s) », code de sortie 1 à
 * l'échec. Invoqué depuis `test_app_theme.py`, qui se saute proprement si
 * `node` est absent.
 *
 * ## Ce que ce harnais établit
 *
 * A — Aucun littéral de couleur hors du bloc de littéraux d'`app.css`
 *     (hexadécimaux, `rgb()`/`rgba()`, `hsl()`/`hsla()`, `oklch()`/`lab()`,
 *     et les noms CSS — vérifié sur la VALEUR de chaque déclaration, jamais
 *     sur le nom de propriété, pour ne pas confondre `white-space` avec un
 *     `white` littéral).
 * B — Chaque jeton d'identité documenté au §2 du design system (six rôles :
 *     `backend-developer` et `doc-writer` en sont encore absents, à la charge
 *     de `doc-writer`) est reconstruit depuis la teinte (H) et la clarté (L)
 *     publiées, ET la chroma effectivement peinte est soit celle de la
 *     méthode, soit la chroma maximale atteignable en sRGB à ce (L, H) —
 *     jamais une valeur inventée. Un écart de teinte d'un seul degré fait
 *     échouer ce cas (voir mutation E8).
 * C — Contraste ≥ 4,5:1 des neuf identités (huit rôles + `neutre`) contre les
 *     trois fonds, et ≥ 4:1 de chaque sigle contre son propre remplissage,
 *     dans les deux thèmes — calculé depuis les jetons, formule WCAG.
 * D — Écart perceptuel ΔE OKLab ≥ 0,10 entre chacun des quatre jetons
 *     sémantiques et chacune des neuf identités, dans les deux thèmes —
 *     calculé après écrêtage de gamut (implicite : ce sont les hexadécimaux
 *     RÉELLEMENT déclarés, déjà dans le gamut sRGB).
 * E — Taux de remplissage du gamut strictement croissant accent < alerte <
 *     echec, et bande de clarté des jetons sémantiques disjointe de celle
 *     des identités (ΔL ≥ 0,10), dans les deux thèmes.
 * F — Deux rôles ne partagent jamais couleur ni sigle ; la désambiguïsation
 *     de sigle (FNV-1a, §8) est exercée avec des noms synthétiques et vérifiée
 *     INDÉPENDANTE de l'ordre d'arrivée.
 * G — `theme.js` (amorçage synchrone) : lecture protégée de `localStorage` en
 *     entrée ET en sortie, valeur inconnue nettoyée, aucune exception quand
 *     l'accesseur lève ou que `window` est absent.
 * H — `app.js` (commande à trois positions) : persistance protégée à
 *     l'écriture, suivi de `matchMedia` seulement en position « système »,
 *     ignoré sur choix explicite.
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

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

const CSS_PATH = path.join(__dirname, "app.css");
const APP_JS_PATH = path.join(__dirname, "app.js");
const THEME_JS_PATH = path.join(__dirname, "theme.js");
const CSS = fs.readFileSync(CSS_PATH, "utf8");

/* ===================================================================== *
 * Section 0 — couleur : sRGB <-> OKLab/OKLCH, contraste WCAG, gamut.
 * Formules publiques (Björn Ottosson) — indépendantes de tout moteur de
 * rendu, pour pouvoir calculer SANS navigateur (E1, lui, vérifie en plus la
 * couleur réellement PEINTE par un vrai moteur — voir
 * test_app_theme_navigateur.py).
 * ===================================================================== */

function srgbToLinear(c) {
  c = c / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function linearToSrgb(c) {
  if (c <= 0.0031308) return c * 12.92;
  return 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055;
}
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function hexToOklab(hex) {
  const [r, g, b] = hexToRgb(hex);
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return {
    L: 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_,
    A: 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_,
    B: 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_,
  };
}
function toLCH({ L, A, B }) {
  const C = Math.hypot(A, B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C, H };
}
function oklabToLinearRgb(L, A, B) {
  const l_ = L + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = L - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = L - 0.0894841775 * A - 1.291485548 * B;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}
function enGamut(L, C, H) {
  const hr = (H * Math.PI) / 180;
  const [r, g, b] = oklabToLinearRgb(L, C * Math.cos(hr), C * Math.sin(hr));
  const eps = 1e-6;
  return r >= -eps && r <= 1 + eps && g >= -eps && g <= 1 + eps && b >= -eps && b <= 1 + eps;
}
/* Chroma maximale atteignable en sRGB à (L, H) fixés — bisection sur le canal
 * qui sort du cube [0,1]³. Validé PAR EXÉCUTION contre les hexadécimaux
 * réellement déclarés dans `app.css` (voir section 2) : les deux teintes que
 * le design system signale comme limitées par le gamut en thème clair
 * (`debugger` 80°, `security-reviewer` 177°), et une troisième non signalée
 * dans le texte (`frontend-developer` 130°), reproduisent EXACTEMENT (à
 * 0,0002 près) la chroma effectivement déclarée — c'est ce qui rend cette
 * bisection digne de confiance pour juger un écart d'un degré (section 2) ou
 * un taux de remplissage de gamut (section 5). */
function chromaMaxA(L, H) {
  let lo = 0, hi = 0.4;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (enGamut(L, mid, H)) lo = mid; else hi = mid;
  }
  return lo;
}
function deltaEOklab(hex1, hex2) {
  const a = hexToOklab(hex1), b = hexToOklab(hex2);
  return Math.hypot(a.L - b.L, a.A - b.A, a.B - b.B);
}
function luminanceRelative(hex) {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}
function contraste(hex1, hex2) {
  const l1 = luminanceRelative(hex1), l2 = luminanceRelative(hex2);
  const [clair, sombre] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (clair + 0.05) / (sombre + 0.05);
}
/* Le plancher perceptuel du cycle (E3b/E8, mutation « ancienne règle ») :
 * volontairement une fonction À PART, jamais l'inline `>= 0.10` répété —
 * c'est CETTE fonction que la mutation E8 remplace par la règle
 * ΔL ≥ 0,08 OU ΔC ≥ 0,03 pour prouver qu'elle est bien nécessaire (un test
 * dédié encode un couple synthétique que l'ancienne règle laissait passer,
 * voir section 4). */
function ecartPerceptuelSuffisant(hex1, hex2) {
  return deltaEOklab(hex1, hex2) >= 0.10;
}

/* ===================================================================== *
 * Section 1 — E2 : aucun littéral de couleur hors du bloc de littéraux.
 * ===================================================================== */

const DEBUT_LITTERAUX = "/* ============================== littéraux";
const FIN_LITTERAUX = "/* ========================= jetons servis (clair)";

function sansCommentaires(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

(function testE2AucunLitteralHorsBloc() {
  const iDebut = CSS.indexOf(DEBUT_LITTERAUX);
  const iFin = CSS.indexOf(FIN_LITTERAUX);
  check("E2_marqueurs_du_bloc_litteraux_presents", iDebut !== -1 && iFin !== -1 && iDebut < iFin,
    "les deux commentaires balises du bloc de littéraux doivent exister dans cet ordre");
  if (iDebut === -1 || iFin === -1) return;

  const avant = CSS.slice(0, iDebut);
  const apres = CSS.slice(iFin);
  const horsBloc = sansCommentaires(avant + "\n" + apres);

  // Une couleur n'apparaît qu'en VALEUR d'une déclaration (après le `:`),
  // jamais dans le nom de propriété : `white-space:` ne doit pas se lire
  // comme le littéral `white` (piège documenté dans la spec).
  const declarations = [];
  const reDecl = /:\s*([^;{}]+);/g;
  let m;
  while ((m = reDecl.exec(horsBloc))) declarations.push(m[1]);

  const reHex = /#[0-9a-fA-F]{3,8}\b/;
  const reFonction = /\b(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch|color)\s*\(/i;
  const NOMS_CSS = ("aliceblue,antiquewhite,aqua,aquamarine,azure,beige,bisque,black,blanchedalmond," +
    "blue,blueviolet,brown,burlywood,cadetblue,chartreuse,chocolate,coral,cornflowerblue,cornsilk," +
    "crimson,cyan,darkblue,darkcyan,darkgoldenrod,darkgray,darkgreen,darkgrey,darkkhaki,darkmagenta," +
    "darkolivegreen,darkorange,darkorchid,darkred,darksalmon,darkseagreen,darkslateblue,darkslategray," +
    "darkslategrey,darkturquoise,darkviolet,deeppink,deepskyblue,dimgray,dimgrey,dodgerblue,firebrick," +
    "floralwhite,forestgreen,fuchsia,gainsboro,ghostwhite,gold,goldenrod,gray,green,greenyellow,grey," +
    "honeydew,hotpink,indianred,indigo,ivory,khaki,lavender,lavenderblush,lawngreen,lemonchiffon," +
    "lightblue,lightcoral,lightcyan,lightgoldenrodyellow,lightgray,lightgreen,lightgrey,lightpink," +
    "lightsalmon,lightseagreen,lightskyblue,lightslategray,lightslategrey,lightsteelblue,lightyellow," +
    "lime,limegreen,linen,magenta,maroon,mediumaquamarine,mediumblue,mediumorchid,mediumpurple," +
    "mediumseagreen,mediumslateblue,mediumspringgreen,mediumturquoise,mediumvioletred,midnightblue," +
    "mintcream,mistyrose,moccasin,navajowhite,navy,oldlace,olive,olivedrab,orange,orangered,orchid," +
    "palegoldenrod,palegreen,paleturquoise,palevioletred,papayawhip,peachpuff,peru,pink,plum,powderblue," +
    "purple,rebeccapurple,red,rosybrown,royalblue,saddlebrown,salmon,sandybrown,seagreen,seashell," +
    "sienna,silver,skyblue,slateblue,slategray,slategrey,snow,springgreen,steelblue,tan,teal,thistle," +
    "tomato,turquoise,violet,wheat,white,whitesmoke,yellow,yellowgreen").split(",");
  const reNom = new RegExp("\\b(" + NOMS_CSS.join("|") + ")\\b", "i");

  const trouves = [];
  for (const valeur of declarations) {
    if (reHex.test(valeur)) trouves.push("hex: " + valeur.trim());
    else if (reFonction.test(valeur)) trouves.push("fonction: " + valeur.trim());
    else if (reNom.test(valeur)) trouves.push("nom CSS: " + valeur.trim());
  }
  check("E2_aucun_litteral_hors_bloc", trouves.length === 0,
    trouves.length + " trouvé(s) : " + trouves.slice(0, 5).join(" | "));

  // Contrôle négatif : le harnais lui-même doit repérer un littéral injecté
  // hors bloc — sinon `E2_aucun_litteral_hors_bloc` prouve juste que la
  // regex ne regarde rien.
  const horsBlocAvecFuite = horsBloc + "\n.sonde { color: white; border-color: #ff00ff; }\n";
  const declarationsSonde = [];
  const reDeclSonde = /:\s*([^;{}]+);/g;
  let m2;
  while ((m2 = reDeclSonde.exec(horsBlocAvecFuite))) declarationsSonde.push(m2[1]);
  const trouvesSonde = declarationsSonde.filter((v) => reHex.test(v) || reFonction.test(v) || reNom.test(v));
  check("E2_le_detecteur_reagit_a_une_fuite_injectee", trouvesSonde.length >= 2,
    "le détecteur doit repérer `white` ET `#ff00ff` quand on les injecte");
})();

/* ===================================================================== *
 * Section 2 — extraction des jetons, et B : reconstruction depuis le §2.
 * ===================================================================== */

function extraireLitteraux(css) {
  const re = /--(clair|sombre)-([a-z0-9-]+):\s*([^;]+);/g;
  const clair = {}, sombre = {};
  let m;
  while ((m = re.exec(css))) {
    const [, theme, nom, valeur] = m;
    (theme === "clair" ? clair : sombre)[nom] = valeur.trim();
  }
  return { clair, sombre };
}
const { clair: LIT_CLAIR, sombre: LIT_SOMBRE } = extraireLitteraux(CSS);

(function testExtractionNonVide() {
  check("prealable_litteraux_clairs_extraits", Object.keys(LIT_CLAIR).length >= 20,
    Object.keys(LIT_CLAIR).length + " clé(s) — la regex d'extraction a-t-elle rien trouvé ?");
  check("prealable_litteraux_sombres_extraits", Object.keys(LIT_SOMBRE).length >= 20,
    Object.keys(LIT_SOMBRE).length + " clé(s)");
})();

const ROLES_IDENTITE = Object.keys(LIT_CLAIR)
  .filter((k) => k.startsWith("a-"))
  .map((k) => k.slice(2));

(function testHuitRolesPlusNeutre() {
  check("prealable_neuf_roles_identite", ROLES_IDENTITE.length === 9,
    "trouvé " + ROLES_IDENTITE.length + " : " + ROLES_IDENTITE.join(", "));
  check("prealable_neutre_present", ROLES_IDENTITE.includes("neutre"));
})();

// §2 du design system : les SIX rôles déjà documentés, PLUS deux rôles
// documentés seulement dans la note d'implémentation de feature-015
// (`backend-developer` 220°, `doc-writer` 336°) — le §2 lui-même ne les
// liste pas encore (à la charge de `doc-writer`), mais leurs hexadécimaux
// suivent la MÊME méthode et sont donc vérifiables golden au même titre.
// Couvre 8 des 9 identités par la teinte ; seule `neutre` (achromatique, sans
// teinte définie) échappe à ce tableau — voir la garde dédiée plus bas.
const TEINTES_DOCUMENTEES = {
  "spec-reader": 264, "debugger": 80, "test-engineer": 300,
  "frontend-developer": 130, "code-reviewer": 31, "security-reviewer": 177,
  "backend-developer": 220, "doc-writer": 336,
};
const PARAMS_METHODE = {
  "trait-sombre": { L: 0.75, C: 0.13 },
  "trait-clair": { L: 0.415, C: 0.152 },
  "fill-clair": { L: 0.885, C: 0.082 },
  // fill-sombre : chroma non spécifiée par le §2 (« L 0,22 mêlé au fond » sans
  // chroma) — non vérifiable en golden, note d'implémentation l'indique déjà.
};
const TOLERANCE_ANGLE = 1.0; // degrés — nettement en dessous d'un « un degré » de mutation
const TOLERANCE_L = 0.01;
const TOLERANCE_C = 0.002;

function verifierGolden(nomCas, hexReel, H, L, Ccible) {
  const { L: Lr, C: Cr, H: Hr } = toLCH(hexToOklab(hexReel));
  let ecartH = Math.abs(Hr - H);
  if (ecartH > 180) ecartH = 360 - ecartH;
  check(nomCas + "_teinte", ecartH <= TOLERANCE_ANGLE,
    "H attendu " + H + "°, mesuré " + Hr.toFixed(2) + "° (écart " + ecartH.toFixed(2) + "°)");
  check(nomCas + "_clarte", Math.abs(Lr - L) <= TOLERANCE_L,
    "L attendu " + L + ", mesuré " + Lr.toFixed(4));
  const cMax = chromaMaxA(Lr, Hr);
  const cAttendue = Math.min(Ccible, cMax);
  check(nomCas + "_chroma", Math.abs(Cr - cAttendue) <= TOLERANCE_C,
    "C mesurée " + Cr.toFixed(4) + ", attendue " + cAttendue.toFixed(4) +
    " (cible méthode " + Ccible + ", plafond de gamut " + cMax.toFixed(4) + ")");
}

(function testBGoldenSectionDeux() {
  for (const [role, H] of Object.entries(TEINTES_DOCUMENTEES)) {
    verifierGolden("E_golden_" + role + "_trait_clair", LIT_CLAIR["a-" + role], H,
      PARAMS_METHODE["trait-clair"].L, PARAMS_METHODE["trait-clair"].C);
    verifierGolden("E_golden_" + role + "_trait_sombre", LIT_SOMBRE["a-" + role], H,
      PARAMS_METHODE["trait-sombre"].L, PARAMS_METHODE["trait-sombre"].C);
    verifierGolden("E_golden_" + role + "_fill_clair", LIT_CLAIR["f-" + role], H,
      PARAMS_METHODE["fill-clair"].L, PARAMS_METHODE["fill-clair"].C);
  }
})();

// Garde dédiée pour `neutre`, la seule identité que le tableau ci-dessus ne
// couvre pas (achromatique, sans teinte à épingler) — ET couverture d'un
// même angle mort que celui trouvé sur les sigles (E8, mutation #4) : les
// contrôles `E4_..._tous_distincts` plus bas (section 6) prouvent l'unicité
// GLOBALE des couleurs, mais un ÉCHANGE de deux couleurs entre deux rôles
// laisse cette unicité intacte. Les golden ci-dessus ferment déjà ce trou
// pour les 8 rôles teintés (un échange y change la teinte MESURÉE d'un rôle
// nommé). Il restait `neutre`, sans teinte : la chroma quasi nulle est SA
// signature, non partageable par un rôle teinté sans faire chuter le
// contraste — épinglée ici explicitement plutôt que supposée.
(function testBNeutreAchromatique() {
  for (const [theme, lit] of [["clair", LIT_CLAIR], ["sombre", LIT_SOMBRE]]) {
    const cTrait = toLCH(hexToOklab(lit["a-neutre"])).C;
    const cFill = toLCH(hexToOklab(lit["f-neutre"])).C;
    check("E_golden_neutre_" + theme + "_trait_achromatique", cTrait <= 0.02,
      "chroma mesurée " + cTrait.toFixed(4) + " — neutre doit rester quasi sans teinte");
    check("E_golden_neutre_" + theme + "_fill_achromatique", cFill <= 0.02,
      "chroma mesurée " + cFill.toFixed(4) + " — neutre doit rester quasi sans teinte");
  }
})();

/* ===================================================================== *
 * Section 3 — E3 : contrastes.
 * ===================================================================== */

(function testE3Contrastes() {
  for (const [theme, lit] of [["clair", LIT_CLAIR], ["sombre", LIT_SOMBRE]]) {
    const fonds = { fond: lit["fond"], surface: lit["surface"], creux: lit["creux"] };
    for (const role of ROLES_IDENTITE) {
      const trait = lit["a-" + role], fill = lit["f-" + role];
      for (const [nomFond, hexFond] of Object.entries(fonds)) {
        const c = contraste(trait, hexFond);
        check("E3_" + theme + "_" + role + "_contre_" + nomFond, c >= 4.5,
          "obtenu " + c.toFixed(2) + ":1 (" + trait + " / " + hexFond + ")");
      }
      const cSigle = contraste(trait, fill);
      check("E3_" + theme + "_sigle_" + role + "_contre_remplissage", cSigle >= 4.0,
        "obtenu " + cSigle.toFixed(2) + ":1 (" + trait + " / " + fill + ")");
    }
  }
})();

/* ===================================================================== *
 * Section 3bis — E7 : contraste des jetons de TEXTE (bug-016/feature-019,
 * absorbé au titre d'ADR-0017), sur les quatre surfaces, dans les deux
 * thèmes — calculé depuis les jetons, jamais supposé.
 *
 * Les jetons sont découverts DYNAMIQUEMENT (`texte*` dans le bloc de
 * littéraux), pas listés à la main : un futur jeton de texte ajouté au bloc
 * de littéraux est automatiquement couvert, sans modifier ce fichier — c'est
 * précisément ce que le critère d'acceptation exige.
 * ===================================================================== */

const JETONS_TEXTE = Object.keys(LIT_CLAIR).filter((k) => k.indexOf("texte") === 0);

/* Les SURFACES, elles aussi, se lisent depuis la feuille — jamais une liste
 * écrite à la main. C'est la faute mesurée deux fois le 2026-09-15 (§21 de
 * `PIEGES.md`) : deux specs énuméraient « fond, surface, creux » en omettant
 * `--surface-2`, précisément le jeton qui portait le pire défaut.
 *
 * Dérivation : dans le bloc « jetons servis (clair) », les jetons `--X: var
 * (--clair-X);` qui suivent immédiatement `--fond` forment le groupe des
 * niveaux structurels — le fichier lui-même les distingue du groupe suivant
 * par sa propre prose (DESIGN-SYSTEM.md §3 : « ce n'est pas le fond qui
 * délimite un bloc, c'est son filet (--trait) »). On arrête donc de
 * consommer dès le premier jeton dont le nom commence par `trait` : ce
 * qui reste avant est le groupe des surfaces, quel que soit son cardinal
 * (3 aujourd'hui plus `surface-2`, 5 demain si un jeton y est inséré).
 */
function extraireSurfacesServies(css) {
  const iServis = css.indexOf("jetons servis (clair)");
  if (iServis === -1) return [];
  const region = css.slice(iServis);
  const re = /--([a-z0-9-]+):\s*var\(--clair-\1\);/g;
  const surfaces = [];
  let m;
  while ((m = re.exec(region))) {
    if (/^trait/.test(m[1])) break;
    surfaces.push(m[1]);
  }
  return surfaces;
}
const FONDS_TEXTE = extraireSurfacesServies(CSS);

(function testPrealableJetonsTexteDecouverts() {
  check("prealable_au_moins_trois_jetons_texte", JETONS_TEXTE.length >= 3,
    JETONS_TEXTE.length + " jeton(s) : " + JETONS_TEXTE.join(", "));
  ["texte", "texte-doux", "texte-faible"].forEach((attendu) => {
    check("prealable_jeton_texte_" + attendu + "_present", JETONS_TEXTE.indexOf(attendu) !== -1,
      "jetons découverts : " + JETONS_TEXTE.join(", "));
  });
})();

(function testPrealableSurfacesDecouvertesDepuisLaFeuille() {
  // Épinglé un par un — pas seulement « quatre surfaces trouvées » : c'est
  // justement une assertion d'ensemble qui laisserait passer l'omission
  // ciblée d'un jeton nommé.
  check("prealable_quatre_surfaces_decouvertes", FONDS_TEXTE.length === 4,
    FONDS_TEXTE.length + " surface(s) : " + FONDS_TEXTE.join(", "));
  ["fond", "surface", "surface-2", "creux"].forEach((attendu) => {
    check("prealable_surface_" + attendu + "_decouverte", FONDS_TEXTE.indexOf(attendu) !== -1,
      "surfaces découvertes : " + FONDS_TEXTE.join(", "));
  });
})();

(function testE7ContrasteJetonsTexte() {
  for (const [theme, lit] of [["clair", LIT_CLAIR], ["sombre", LIT_SOMBRE]]) {
    for (const jeton of JETONS_TEXTE) {
      const hexTexte = lit[jeton];
      for (const nomFond of FONDS_TEXTE) {
        const hexFond = lit[nomFond];
        const c = contraste(hexTexte, hexFond);
        check("E7_" + theme + "_" + jeton + "_contre_" + nomFond, c >= 4.5,
          "obtenu " + c.toFixed(4) + ":1 (" + hexTexte + " / " + hexFond + ")");
      }
    }
  }
})();

// Hiérarchie des trois niveaux (critère d'acceptation dédié) : un
// `--texte-faible` relevé jusqu'à se confondre avec `--texte-doux` ne
// corrigerait rien. Épinglé par le CONTRASTE relatif contre `--fond` — pas
// par un simple ordre alphabétique des hexadécimaux, qui ne dirait rien de
// la lisibilité réelle.
(function testE7HierarchieRestelisible() {
  for (const [theme, lit] of [["clair", LIT_CLAIR], ["sombre", LIT_SOMBRE]]) {
    const cTexte = contraste(lit["texte"], lit["fond"]);
    const cDoux = contraste(lit["texte-doux"], lit["fond"]);
    const cFaible = contraste(lit["texte-faible"], lit["fond"]);
    check("E7_hierarchie_" + theme + "_texte_plus_contraste_que_doux", cTexte > cDoux,
      "texte=" + cTexte.toFixed(2) + " doux=" + cDoux.toFixed(2));
    check("E7_hierarchie_" + theme + "_doux_plus_contraste_que_faible", cDoux > cFaible,
      "doux=" + cDoux.toFixed(2) + " faible=" + cFaible.toFixed(2));
    // Écart minimal entre les paliers : un jeton relevé au ras de son voisin
    // (par ex. 4,50 vs 4,51) tiendrait le seuil mais confondrait les deux
    // niveaux à l'œil.
    check("E7_hierarchie_" + theme + "_ecart_doux_faible_perceptible",
      (cDoux - cFaible) >= 0.3,
      "écart mesuré " + (cDoux - cFaible).toFixed(3) + " — trop proche pour rester distinct");
  }
})();

/* ===================================================================== *
 * Section 4 — E3b : écart perceptuel ΔE OKLab, sémantique <-> identité.
 * ===================================================================== */

const JETONS_SEMANTIQUES = ["accent", "actif", "alerte", "echec"];

(function testE3bDeltaEPerceptuel() {
  for (const [theme, lit] of [["clair", LIT_CLAIR], ["sombre", LIT_SOMBRE]]) {
    let min = Infinity, minPaire = null;
    for (const sem of JETONS_SEMANTIQUES) {
      for (const role of ROLES_IDENTITE) {
        const hexSem = lit[sem], hexId = lit["a-" + role];
        const d = deltaEOklab(hexSem, hexId);
        if (d < min) { min = d; minPaire = [sem, role]; }
        check("E3b_" + theme + "_" + sem + "_vs_" + role, ecartPerceptuelSuffisant(hexSem, hexId),
          "ΔE=" + d.toFixed(4) + " < 0,10 (" + hexSem + " / " + hexId + ")");
      }
    }
    console.log("  ..    E3b_" + theme + "_minimum_observe = " + min.toFixed(4) +
      " (" + minPaire[0] + " ↔ " + minPaire[1] + ")");
  }
})();

// Régression dédiée : un couple synthétique que l'ANCIENNE règle
// (ΔL ≥ 0,08 OU ΔC ≥ 0,03) aurait laissé passer alors que le ΔE réel — 0,028
// annoncé par la spec — reste sous le plancher de 0,10. Construit à la main :
// même teinte (donc Δ(a,b) aligné sur ΔC), ΔL = 0,081 (> 0,08, fait « passer »
// l'ancienne règle par le premier disjoint), ΔC = 0,028 (< 0,03, ne fait PAS
// passer par le second — hors de propos puisque le premier suffit déjà).
// ΔE = √(0,081² + 0,028²) ≈ 0,0857 < 0,10 : un VRAI rapprochement perceptuel
// que l'ancienne règle validait à tort.
(function testE3bRegressionAncienneRegleTropPermissive() {
  const H = 40; // hue arbitraire, alignée entre les deux points (Δhue = 0)
  const A = { L: 0.500, C: 0.150 };
  const B = { L: 0.500 + 0.081, C: 0.150 + 0.028 };
  const hexA = hexDepuisLCH(A.L, A.C, H);
  const hexB = hexDepuisLCH(B.L, B.C, H);
  const dE = deltaEOklab(hexA, hexB);
  check("E3b_regression_couple_synthetique_est_une_collision_reelle", dE < 0.10,
    "ΔE mesuré " + dE.toFixed(4) + " — attendu < 0,10 (la spec annonce ~0,028 d'écart de chroma)");
  check("E3b_regression_ancienne_regle_aurait_laisse_passer",
    (Math.abs(B.L - A.L) >= 0.08) || (Math.abs(B.C - A.C) >= 0.03),
    "la règle ΔL≥0,08 OU ΔC≥0,03 doit être vraie sur ce couple, sinon la régression ne démontre rien");
  check("E3b_regression_nouvelle_regle_le_rejette", !ecartPerceptuelSuffisant(hexA, hexB),
    "la fonction du plancher (0,10) doit refuser ce couple, contrairement à l'ancienne règle");
})();

function hexDepuisLCH(L, C, H) {
  const hr = (H * Math.PI) / 180;
  const [r, g, b] = oklabToLinearRgb(L, C * Math.cos(hr), C * Math.sin(hr));
  const clip = (v) => Math.min(255, Math.max(0, Math.round(linearToSrgb(v) * 255)));
  return "#" + [r, g, b].map(clip).map((n) => n.toString(16).padStart(2, "0")).join("");
}

/* ===================================================================== *
 * Section 5 — E3c : taux de remplissage du gamut, bande de clarté disjointe.
 *
 * IMPORTANT (corrigé après une divergence mesurée entre l'architecte et ce
 * harnais sur un couple ΔE) : TOUT ce bloc se calcule depuis les
 * hexadécimaux RÉELLEMENT lus dans `app.css` (`LIT_CLAIR`/`LIT_SOMBRE`,
 * extraits en section 2) — jamais depuis une table de constantes recopiée
 * dans ce fichier de test. La cause de la divergence était exactement ça :
 * la table L/C du §2 suppose un écrêtage de gamut CANAL PAR CANAL, alors que
 * l'implémentation réduit la CHROMA à clarté et teinte conservées — deux
 * méthodes qui donnent des couleurs différentes dès qu'un jeton déborde le
 * gamut, et seule celle réellement peinte (donc réellement déclarée en hex)
 * fait foi.
 * ===================================================================== */

(function testE3cGamutEtBandeDeClarte() {
  for (const [theme, lit] of [["clair", LIT_CLAIR], ["sombre", LIT_SOMBRE]]) {
    function taux(hex) {
      const { L, C, H } = toLCH(hexToOklab(hex));
      return C / chromaMaxA(L, H);
    }
    const tAccent = taux(lit["accent"]), tAlerte = taux(lit["alerte"]), tEchec = taux(lit["echec"]);
    check("E3c_" + theme + "_gamut_croissant_accent_alerte", tAccent < tAlerte,
      "accent=" + tAccent.toFixed(4) + " alerte=" + tAlerte.toFixed(4));
    check("E3c_" + theme + "_gamut_croissant_alerte_echec", tAlerte < tEchec,
      "alerte=" + tAlerte.toFixed(4) + " echec=" + tEchec.toFixed(4));

    const lSem = JETONS_SEMANTIQUES.map((n) => hexToOklab(lit[n]).L);
    const lId = ROLES_IDENTITE.map((r) => hexToOklab(lit["a-" + r]).L);
    const semMin = Math.min(...lSem), semMax = Math.max(...lSem);
    const idMin = Math.min(...lId), idMax = Math.max(...lId);
    let gap;
    if (semMax <= idMin) gap = idMin - semMax;
    else if (idMax <= semMin) gap = semMin - idMax;
    else gap = -1; // bandes chevauchantes
    check("E3c_" + theme + "_bandes_de_clarte_disjointes_ecart_0_10", gap >= 0.10,
      "écart mesuré " + gap.toFixed(4) + " (sémantique [" + semMin.toFixed(3) + "," + semMax.toFixed(3) +
      "] vs identité [" + idMin.toFixed(3) + "," + idMax.toFixed(3) + "])");
  }
})();

// Test de CONCEPTION, en plus du test EFFECTIF ci-dessus : la marge doit être
// tenue par la RÈGLE, pas par la chance de l'arrondi. On compare ici les
// paramètres NOMINAUX de génération (avant tout arrondi en hexadécimal 8
// bits/canal), et on exige 0,12 — pas 0,10 — pour absorber la dérive
// d'arrondi mesurée par l'architecte sur les 26 jetons livrés (pire cas
// 0,0015 ; marge retenue 0,02, soit 13× ce pire cas). Ce raisonnement est
// CONFIRMÉ ici indépendamment : le pire écart observé entre une clarté
// nominale et sa clarté effective (mesurée en section 2/5 ci-dessus, sur les
// mêmes jetons) ne dépasse jamais 0,0016 sur cette feuille — voir
// `E_conception_derive_arrondi_sous_controle`. Même en additionnant DEUX
// dérives dans le pire sens (un jeton identité ET un jeton sémantique
// dérivant chacun au maximum, l'un vers l'autre), l'écart combiné
// (≤ 0,0032) reste très en dessous des 0,02 de marge — 13× est donc
// confortable, pas seulement correct.
//
// Nominal identité (§2, constante par construction à l'intérieur d'un
// thème) : L = 0,75 (sombre) / 0,415 (clair) pour LES NEUF rôles, `neutre`
// compris (achromatique, mais la clarté suit la même règle).
//
// Nominal sémantique : `alerte`/`echec` reprennent les OKLCH nominaux
// communiqués après correction du défaut E3c — sombre L=0,87, clair
// L=0,295. `accent`/`actif` sont INCHANGÉS par cette correction ; en
// l'absence d'une table publiée pour ces deux jetons (ils suivent un axe
// propre, hors méthode catégorielle du §2 — voir `app.css`), leur clarté
// EFFECTIVE (dérivée de leur hex, inchangé) sert de nominal : ce sont les
// deux seuls jetons sémantiques qui ne débordent PAS le gamut (voir le taux
// de remplissage < 1 mesuré plus haut, `accent` toujours le plus bas des
// trois), donc sans risque de la même divergence écrêtage/réduction que
// celle qui a affecté `alerte`/`echec`.
const L_IDENTITE_NOMINAL = { clair: PARAMS_METHODE["trait-clair"].L, sombre: PARAMS_METHODE["trait-sombre"].L };
const L_SEMANTIQUE_NOMINAL = {
  clair: {
    accent: hexToOklab(LIT_CLAIR["accent"]).L, actif: hexToOklab(LIT_CLAIR["actif"]).L,
    alerte: 0.295, echec: 0.295,
  },
  sombre: {
    accent: hexToOklab(LIT_SOMBRE["accent"]).L, actif: hexToOklab(LIT_SOMBRE["actif"]).L,
    alerte: 0.87, echec: 0.87,
  },
};

(function testE3cMargeDeConceptionSurValeursNominales() {
  for (const theme of ["clair", "sombre"]) {
    const idNominal = L_IDENTITE_NOMINAL[theme];
    const semValeurs = Object.values(L_SEMANTIQUE_NOMINAL[theme]);
    const semMin = Math.min(...semValeurs), semMax = Math.max(...semValeurs);
    const gap = semMax <= idNominal ? idNominal - semMax
      : idNominal <= semMin ? semMin - idNominal : -1;
    check("E_conception_" + theme + "_marge_nominale_0_12", gap >= 0.12,
      "écart nominal mesuré " + gap.toFixed(4) + " (identité=" + idNominal +
      ", sémantique [" + semMin.toFixed(3) + "," + semMax.toFixed(3) + "])");
  }

  // Confirmation indépendante du raisonnement « 13× la dérive d'arrondi » :
  // dérive = |nominal - effectif| sur chaque jeton dont on connaît un
  // nominal publié (les 8 rôles teintés du tableau golden, plus
  // alerte/echec des deux thèmes) — 20 jetons, pas les 26 de l'architecte
  // (accent/actif exclus : pas de nominal publié indépendant de l'effectif
  // pour eux, la dérive y est nulle par construction de ce test).
  let deriveMax = 0, pireCas = null;
  for (const [role, H] of Object.entries(TEINTES_DOCUMENTEES)) {
    for (const [theme, lit, LNominal] of [
      ["clair", LIT_CLAIR, PARAMS_METHODE["trait-clair"].L],
      ["sombre", LIT_SOMBRE, PARAMS_METHODE["trait-sombre"].L]]) {
      const Leff = hexToOklab(lit["a-" + role]).L;
      const d = Math.abs(Leff - LNominal);
      if (d > deriveMax) { deriveMax = d; pireCas = role + " (" + theme + ")"; }
    }
  }
  for (const theme of ["clair", "sombre"]) {
    const LNominal = theme === "clair" ? 0.295 : 0.87;
    for (const role of ["alerte", "echec"]) {
      const Leff = hexToOklab((theme === "clair" ? LIT_CLAIR : LIT_SOMBRE)[role]).L;
      const d = Math.abs(Leff - LNominal);
      if (d > deriveMax) { deriveMax = d; pireCas = role + " (" + theme + ")"; }
    }
  }
  check("E_conception_derive_arrondi_sous_controle", deriveMax <= 0.0016,
    "pire dérive mesurée " + deriveMax.toFixed(4) + " (" + pireCas + ") — " +
    "doit rester sous ~0,0015/0,0016 pour que la marge de 0,02 tienne 13x");
})();

/* ===================================================================== *
 * Section 6 — E4 : unicité couleur + sigle, désambiguïsation par mutation.
 * ===================================================================== */

(function testE4UniciteCouleurs() {
  for (const [theme, lit] of [["clair", LIT_CLAIR], ["sombre", LIT_SOMBRE]]) {
    const traits = ROLES_IDENTITE.map((r) => lit["a-" + r]);
    const fills = ROLES_IDENTITE.map((r) => lit["f-" + r]);
    check("E4_" + theme + "_traits_tous_distincts", new Set(traits).size === traits.length,
      traits.length + " valeurs, " + new Set(traits).size + " distinctes");
    check("E4_" + theme + "_remplissages_tous_distincts", new Set(fills).size === fills.length,
      fills.length + " valeurs, " + new Set(fills).size + " distinctes");
  }
})();

// Sigles : charge SEULEMENT les deux fonctions pures (déclarations de
// fonction top-level -> accessibles comme propriétés du contexte `vm`, à la
// différence des `const`). Aucun DOM requis pour cette partie.
function chargerFonctionsSigle() {
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const source = fs.readFileSync(APP_JS_PATH, "utf8");
  // On isole : exécuter TOUT app.js échouerait ici (pas de `document`). On
  // extrait donc seulement les deux fonctions par la regex de leurs bornes
  // textuelles — fragile si le fichier est réorganisé, mais explicite : si
  // l'extraction rate, le test qui suit échoue plutôt que de mentir.
  const debut = source.indexOf("function empreinteFnv1a");
  const fin = source.indexOf("/* ---------------------------------------------------------------- agents");
  if (debut === -1 || fin === -1 || fin <= debut) {
    throw new Error("bornes de sigleAgent/siglesAgents introuvables dans app.js — extraction à mettre à jour");
  }
  const extrait = source.slice(debut, fin);
  new vm.Script(extrait, { filename: "app.js#sigles" }).runInContext(sandbox);
  return { sigleAgent: sandbox.sigleAgent, siglesAgents: sandbox.siglesAgents };
}

(function testE4Sigles() {
  const { siglesAgents } = chargerFonctionsSigle();

  const ROLES_REELS = ["backend-developer", "security-reviewer", "test-engineer", "spec-reader",
    "code-reviewer", "debugger", "doc-writer", "frontend-developer"];
  const sigles8 = siglesAgents(ROLES_REELS);
  const valeurs8 = Array.from(sigles8.values());
  check("E4_huit_roles_reels_sigles_distincts", new Set(valeurs8).size === valeurs8.length,
    JSON.stringify(Array.from(sigles8.entries())));
  check("E4_spec_reader_distinct_de_security_reviewer",
    sigles8.get("spec-reader") !== sigles8.get("security-reviewer"),
    "spec-reader=" + sigles8.get("spec-reader") + " security-reviewer=" + sigles8.get("security-reviewer"));
  // Valeurs ÉPINGLÉES sur l'exemple travaillé du §8 du design system — la
  // seule distinction (test ci-dessus) ne suffit pas : un mutant qui
  // ATTRIBUE "SP" à security-reviewer fait alors dériver spec-reader vers
  // "SE" par la désambiguïsation normale, les deux restant distincts l'un de
  // l'autre sans que rien ne le détecte. Un sigle appartient à UN rôle.
  check("E4_spec_reader_sigle_epingle_SP", sigles8.get("spec-reader") === "SP",
    "obtenu " + sigles8.get("spec-reader"));
  check("E4_security_reviewer_sigle_epingle_SE", sigles8.get("security-reviewer") === "SE",
    "obtenu " + sigles8.get("security-reviewer"));

  // Noms synthétiques partageant le même segment initial « spec » — force la
  // désambiguïsation au-delà des deux premières lettres, jusqu'au repli
  // FNV-1a (§8, jamais exercé par le roster réel selon la note
  // d'implémentation de feature-015).
  const SYNTHETIQUES = ["spec-alpha", "spec-beta", "spec-gamma", "spec-delta",
    "spec-epsilon", "spec-zeta", "spec-eta", "spec-theta", "spec-iota", "spec-kappa"];
  const siglesSynth = siglesAgents(SYNTHETIQUES);
  const valeursSynth = Array.from(siglesSynth.values());
  check("E4_dix_noms_synthetiques_meme_segment_sigles_distincts",
    new Set(valeursSynth).size === valeursSynth.length,
    JSON.stringify(Array.from(siglesSynth.entries())));
  check("E4_desambiguisation_atteint_le_repli_fnv",
    valeursSynth.some((s) => /\d$/.test(s)),
    "aucun sigle chiffré trouvé — le repli FNV-1a n'a jamais été exercé : " + valeursSynth.join(","));

  // Indépendance de l'ordre d'arrivée (feature-015, doc §8) : deux ordres
  // différents du MÊME ensemble doivent produire EXACTEMENT les mêmes
  // sigles par nom.
  const ordreA = [...SYNTHETIQUES];
  const ordreB = [...SYNTHETIQUES].reverse();
  const resA = siglesAgents(ordreA);
  const resB = siglesAgents(ordreB);
  let identiques = true;
  for (const nom of SYNTHETIQUES) if (resA.get(nom) !== resB.get(nom)) identiques = false;
  check("E4_sigles_independants_de_l_ordre_d_arrivee", identiques,
    "ordre direct=" + JSON.stringify(Array.from(resA.entries())) +
    " ordre inverse=" + JSON.stringify(Array.from(resB.entries())));

  // Troisième ordre, mélangé plutôt que simplement inversé — un mutant qui
  // triche en ne comparant que direct/inverse doit aussi mourir ici.
  const ordreC = [SYNTHETIQUES[3], SYNTHETIQUES[0], SYNTHETIQUES[7], SYNTHETIQUES[1],
    SYNTHETIQUES[9], SYNTHETIQUES[2], SYNTHETIQUES[8], SYNTHETIQUES[4], SYNTHETIQUES[6], SYNTHETIQUES[5]];
  const resC = siglesAgents(ordreC);
  let identiquesC = true;
  for (const nom of SYNTHETIQUES) if (resA.get(nom) !== resC.get(nom)) identiquesC = false;
  check("E4_sigles_independants_d_un_troisieme_ordre_melange", identiquesC,
    "ordre direct=" + JSON.stringify(Array.from(resA.entries())) +
    " ordre mélangé=" + JSON.stringify(Array.from(resC.entries())));
})();

/* ===================================================================== *
 * Section 7 — bac à sable pour theme.js et app.js (G, H).
 * Dupliqué à dessein depuis test_app_bug012.js (voir en-tête de fichier).
 * ===================================================================== */

class FakeNode {
  constructor(tag) {
    this.tagName = String(tag || "div").toUpperCase();
    this.children = [];
    this._text = "";
    this.className = "";
    this.hidden = false;
    this._attrs = {};
    this._listeners = {};
  }
  set textContent(v) { this._text = v === undefined || v === null ? "" : String(v); this.children = []; }
  get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join("") : this._text; }
  appendChild(child) { this.children.push(child); return child; }
  removeChild(child) { const i = this.children.indexOf(child); if (i >= 0) this.children.splice(i, 1); return child; }
  setAttribute(nom, valeur) { this._attrs[nom] = String(valeur); this[nom] = valeur; }
  getAttribute(nom) { return Object.prototype.hasOwnProperty.call(this._attrs, nom) ? this._attrs[nom] : null; }
  removeAttribute(nom) { delete this._attrs[nom]; delete this[nom]; }
  addEventListener(type, gestionnaire) { (this._listeners[type] = this._listeners[type] || []).push(gestionnaire); }
  get classList() {
    const self = this;
    return { add: (c) => { self.className = (self.className ? self.className + " " : "") + c; },
      contains: (c) => self.className.split(/\s+/).filter(Boolean).indexOf(c) !== -1 };
  }
}

const IDS_APP = [
  "agents", "bandeau-hote", "bandeau-hote-bouton", "bandeau-hote-texte",
  "bascule-theme", "compteur-specs", "fichiers",
  "filtre", "filtre-divergences", "horodatage", "icone-systeme-clair",
  "icone-systeme-sombre", "jauge-flux", "jauge-git", "jauge-pilotage",
  "kanban", "legende-cycles", "note-agents", "pied-cycles", "pilotage-corps",
  "porte-aide", "porte-bouton", "porte-champ", "porte-corps", "porte-erreur",
  "porte-jeton", "porte-titre", "projet", "prompt", "systeme", "theme-clair",
  "theme-sombre", "theme-systeme", "timeline", "tiroir", "tiroir-contenu",
  "tiroir-fermer", "tiroir-titre", "titre-cycles", "titre-demande",
  "titre-pilotage", "workflows",
];
const CACHES_PAR_DEFAUT = new Set([
  "bandeau-hote", "tiroir", "porte-jeton", "porte-erreur", "icone-systeme-sombre",
]);

/* Fabrique un bac à sable pour `app.js`. `options.localStorage` : `null`
 * pour un `localStorage` absent (piège « window absent » couvert séparément
 * pour `theme.js`, qui lui accède via `window.` explicitement — `app.js`
 * référence `localStorage` NU, protégé par le même `try/catch`) ; sinon un
 * objet `{getItem,setItem,removeItem}` — peut lever pour simuler un échec.
 * `options.matchesInitial` : préférence système au chargement. */
function creerBacApp(options) {
  const opts = options || {};
  const elements = new Map();
  for (const id of IDS_APP) {
    const n = new FakeNode("div");
    n.id = id;
    n.hidden = CACHES_PAR_DEFAUT.has(id);
    elements.set(id, n);
  }
  const documentElement = new FakeNode("html");

  const document_ = {
    documentElement,
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new FakeNode(tag),
    // feature-017 : `construireDiagramme` (app.js) construit du SVG réel.
    createElementNS: (_ns, tag) => new FakeNode(tag),
    createTextNode: (t) => { const n = new FakeNode("#text"); n.textContent = t; return n; },
    createDocumentFragment: () => new FakeNode("#fragment"),
    addEventListener: () => {},
    activeElement: null,
  };

  async function fetch_() { throw new Error("fetch non simulé dans ce harnais (théme seul)"); }
  class FakeEventSource { constructor() {} addEventListener() {} }

  const changeListeners = [];
  const mq = {
    matches: !!opts.matchesInitial,
    addEventListener: (type, cb) => { if (type === "change") changeListeners.push(cb); },
  };
  function declencherChangementSysteme(nouvelleValeur) {
    mq.matches = nouvelleValeur;
    changeListeners.forEach((cb) => cb());
  }

  const sandbox = {
    document: document_,
    fetch: fetch_,
    EventSource: FakeEventSource,
    requestAnimationFrame: (cb) => cb(),
    setInterval: () => 0,
    clearInterval: () => {},
    setTimeout,
    clearTimeout,
    matchMedia: (q) => (String(q).indexOf("prefers-color-scheme") !== -1 ? mq : null),
    console,
  };
  if (Object.prototype.hasOwnProperty.call(opts, "localStorage")) {
    if (opts.localStorage !== undefined) sandbox.localStorage = opts.localStorage;
    // opts.localStorage === undefined explicitement demandé : on NE POSE PAS
    // la clé du tout -> `localStorage` nu est une ReferenceError, exactement
    // le cas « absent du contexte » (voir note d'en-tête d'app.js).
  } else {
    sandbox.localStorage = creerLocalStorageMemoire();
  }
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  return { sandbox, elements, documentElement, declencherChangementSysteme, $: (id) => elements.get(id) };
}

function creerLocalStorageMemoire() {
  const donnees = {};
  return {
    getItem: (c) => (Object.prototype.hasOwnProperty.call(donnees, c) ? donnees[c] : null),
    setItem: (c, v) => { donnees[c] = String(v); },
    removeItem: (c) => { delete donnees[c]; },
    _donnees: donnees,
  };
}

function chargerAppJS(bac) {
  // feature-017 : `disposer()` (diagramme.js) doit exister dans le contexte
  // AVANT `app.js`, même ordre que les deux `<script>` d'index.html.
  const sourceDiagramme = fs.readFileSync(path.join(__dirname, "diagramme.js"), "utf8");
  new vm.Script(sourceDiagramme, { filename: "diagramme.js" }).runInContext(bac.sandbox);
  const source = fs.readFileSync(APP_JS_PATH, "utf8");
  new vm.Script(source, { filename: "app.js" }).runInContext(bac.sandbox);
}

/* ===================================================================== *
 * Section 8 — G : theme.js, amorçage synchrone.
 * ===================================================================== */

function chargerThemeJS(sandboxPartiel) {
  const documentElement = new FakeNode("html");
  const document_ = { documentElement };
  const sandbox = Object.assign({ document: document_, console }, sandboxPartiel);
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  const source = fs.readFileSync(THEME_JS_PATH, "utf8");
  const script = new vm.Script(source, { filename: "theme.js" });
  let exceptionEchappee = null;
  try {
    script.runInContext(sandbox);
  } catch (erreur) {
    exceptionEchappee = erreur;
  }
  return { documentElement, exceptionEchappee };
}

(function testGThemeJs() {
  // Cas 1 : valeur "clair" en mémoire -> data-theme posé.
  {
    const ls = creerLocalStorageMemoire();
    ls.setItem("theme", "clair");
    const { documentElement, exceptionEchappee } = chargerThemeJS({ window: { localStorage: ls } });
    check("G_theme_js_clair_pose_attribut", documentElement.getAttribute("data-theme") === "clair");
    check("G_theme_js_clair_aucune_exception", exceptionEchappee === null,
      exceptionEchappee && exceptionEchappee.message);
  }
  // Cas 2 : valeur "sombre".
  {
    const ls = creerLocalStorageMemoire();
    ls.setItem("theme", "sombre");
    const { documentElement } = chargerThemeJS({ window: { localStorage: ls } });
    check("G_theme_js_sombre_pose_attribut", documentElement.getAttribute("data-theme") === "sombre");
  }
  // Cas 3 : rien en mémoire -> aucun attribut posé (« système »).
  {
    const ls = creerLocalStorageMemoire();
    const { documentElement } = chargerThemeJS({ window: { localStorage: ls } });
    check("G_theme_js_absence_ne_pose_rien", documentElement.getAttribute("data-theme") === null);
  }
  // Cas 4 (E5) : valeur INCONNUE stockée -> traitée comme système, ET la clé
  // est nettoyée (pas laissée à pourrir).
  {
    const ls = creerLocalStorageMemoire();
    ls.setItem("theme", "violet-a-pois");
    const { documentElement, exceptionEchappee } = chargerThemeJS({ window: { localStorage: ls } });
    check("G_theme_js_valeur_inconnue_ne_pose_rien", documentElement.getAttribute("data-theme") === null);
    check("G_theme_js_valeur_inconnue_cle_nettoyee",
      ls.getItem("theme") === null, "clé encore présente : " + JSON.stringify(ls._donnees));
    check("G_theme_js_valeur_inconnue_aucune_exception", exceptionEchappee === null);
  }
  // Cas 5 (E5) : accesseur qui LÈVE (quota, données bloquées).
  {
    const ls = {
      getItem: () => { throw new Error("SecurityError simulée"); },
      setItem: () => { throw new Error("ne devrait pas être appelé"); },
      removeItem: () => { throw new Error("ne devrait pas être appelé"); },
    };
    const { documentElement, exceptionEchappee } = chargerThemeJS({ window: { localStorage: ls } });
    check("G_theme_js_accesseur_qui_leve_aucune_exception", exceptionEchappee === null,
      exceptionEchappee && exceptionEchappee.message);
    check("G_theme_js_accesseur_qui_leve_rien_pose", documentElement.getAttribute("data-theme") === null);
  }
  // Cas 6 (E5) : `window` totalement ABSENT du contexte.
  {
    const { documentElement, exceptionEchappee } = chargerThemeJS({});
    check("G_theme_js_window_absent_aucune_exception", exceptionEchappee === null,
      exceptionEchappee && exceptionEchappee.message);
    check("G_theme_js_window_absent_rien_pose", documentElement.getAttribute("data-theme") === null);
  }
  // Cas 7 : `window` présent mais SANS `localStorage` (propriété absente).
  {
    const { documentElement, exceptionEchappee } = chargerThemeJS({ window: {} });
    check("G_theme_js_localStorage_absent_de_window_aucune_exception", exceptionEchappee === null,
      exceptionEchappee && exceptionEchappee.message);
    check("G_theme_js_localStorage_absent_de_window_rien_pose", documentElement.getAttribute("data-theme") === null);
  }
})();

/* ===================================================================== *
 * Section 9 — E5 (écriture) et E6 : app.js, commande à trois positions.
 * ===================================================================== */

(function testE5EcritureProtegee() {
  const lsQuiLeve = {
    getItem: () => { throw new Error("lecture bloquée"); },
    setItem: () => { throw new Error("écriture bloquée"); },
    removeItem: () => { throw new Error("suppression bloquée"); },
  };
  const bac = creerBacApp({ localStorage: lsQuiLeve, matchesInitial: false });
  let exceptionEchappee = null;
  try {
    chargerAppJS(bac);
    bac.sandbox.appliquerTheme("sombre");
  } catch (erreur) {
    exceptionEchappee = erreur;
  }
  check("E5_ecriture_localStorage_qui_leve_aucune_exception", exceptionEchappee === null,
    exceptionEchappee && exceptionEchappee.stack);
  check("E5_ecriture_localStorage_qui_leve_attribut_quand_meme_pose",
    bac.documentElement.getAttribute("data-theme") === "sombre",
    "l'échec de la PERSISTANCE ne doit pas empêcher l'application immédiate du choix");
})();

(function testE5LocalStorageAbsentDApp() {
  // `localStorage` NU absent du contexte (pas seulement `window.localStorage`
  // — voir la garde `Object.prototype.hasOwnProperty` dans `creerBacApp`).
  const bac = creerBacApp({ localStorage: undefined, matchesInitial: false });
  let exceptionEchappee = null;
  try {
    chargerAppJS(bac);
    bac.sandbox.appliquerTheme("clair");
  } catch (erreur) {
    exceptionEchappee = erreur;
  }
  check("E5_localStorage_absent_du_contexte_app_js_aucune_exception", exceptionEchappee === null,
    exceptionEchappee && exceptionEchappee.stack);
  check("E5_localStorage_absent_attribut_quand_meme_pose",
    bac.documentElement.getAttribute("data-theme") === "clair");
})();

(function testE6MatchMediaSuiviSeulementEnSysteme() {
  const bac = creerBacApp({ matchesInitial: false }); // système = clair au départ
  chargerAppJS(bac);

  check("E6_position_initiale_systeme", bac.sandbox.positionActiveTheme() === "theme-systeme");
  check("E6_libelle_systeme_annonce_clair",
    bac.$("theme-systeme").getAttribute("aria-label").indexOf("clair") !== -1,
    bac.$("theme-systeme").getAttribute("aria-label"));

  // L'OS bascule en sombre PENDANT que la page est ouverte, en position
  // « système » : suivi sans rechargement (D1).
  bac.declencherChangementSysteme(true);
  check("E6_systeme_suit_le_changement_os_libelle",
    bac.$("theme-systeme").getAttribute("aria-label").indexOf("sombre") !== -1,
    bac.$("theme-systeme").getAttribute("aria-label"));
  check("E6_systeme_suit_le_changement_os_icone",
    bac.$("icone-systeme-sombre").hidden === false && bac.$("icone-systeme-clair").hidden === true);
  check("E6_systeme_ne_pose_pas_data_theme", bac.documentElement.getAttribute("data-theme") === null,
    "« système » ne doit JAMAIS poser data-theme, même après résolution");

  // Choix EXPLICITE « clair » : un changement d'OS ultérieur est IGNORÉ.
  bac.sandbox.appliquerTheme("clair");
  check("E6_choix_explicite_pose_attribut", bac.documentElement.getAttribute("data-theme") === "clair");
  bac.declencherChangementSysteme(false); // OS repasse clair, ne devrait rien changer
  bac.declencherChangementSysteme(true); // OS repasse sombre : DOIT être ignoré
  check("E6_choix_explicite_ignore_le_changement_os",
    bac.documentElement.getAttribute("data-theme") === "clair",
    "obtenu : " + bac.documentElement.getAttribute("data-theme"));
  check("E6_position_reste_clair_apres_changement_os_ignore",
    bac.sandbox.positionActiveTheme() === "theme-clair");
})();

(function testCPersistanceEtLecture() {
  const ls = creerLocalStorageMemoire();
  const bac = creerBacApp({ localStorage: ls, matchesInitial: false });
  chargerAppJS(bac);
  bac.sandbox.appliquerTheme("sombre");
  check("C1_choix_explicite_persiste_dans_localStorage", ls.getItem("theme") === "sombre",
    JSON.stringify(ls._donnees));
  bac.sandbox.appliquerTheme("systeme");
  check("C1_retour_systeme_nettoie_la_cle", ls.getItem("theme") === null, JSON.stringify(ls._donnees));
})();

console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
for (const e of _echecs) console.log("  - " + e);
process.exit(_echecs.length ? 1 : 0);
