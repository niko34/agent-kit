"use strict";
/* feature-021, cycle 2, lot 1 — LE THÈME UNIQUE, GARDÉ.
 *
 *     node control-center/web/test_conformite_theme_unique.js
 *
 * ADR-0033 retire le thème sombre : le centre de contrôle n'a plus qu'un
 * thème, clair, et plus aucun mécanisme de bascule.
 *
 * ⚠️ POURQUOI CETTE GARDE EXISTE. Le lot 1 a exécuté le retrait — trois
 * fichiers de test supprimés, 117 occurrences de `sombre` et deux blocs
 * `:root` conditionnels retirés d'`app.css`. Mesuré immédiatement après, sur
 * clone neuf : réintroduire `:root[data-theme="sombre"] { --bg: #000 }` dans
 * `app.css` ne faisait rougir AUCUNE des six gardes du lot 0, et la forme
 * NON conditionnelle `:root { --bg: #000 }` non plus — les deux assertions de
 * F1 qui lisent `app.css` sont intégralement quarantinées sous `ATTENDU_ROUGE`
 * jusqu'au lot 2, et ses cas `F1_NONREGRESSION_*` sont construits en mémoire,
 * donc verts quel que soit le contenu réel de la feuille.
 *
 * Autrement dit : le lot 1 livrait « le thème sombre est retiré » avec ZÉRO
 * garde sur `app.css`. Le thème pouvait revenir intégralement, sous sa syntaxe
 * d'origine exacte, suite verte. Une suppression sans garde se réintroduit en
 * silence — et s'annonce entre-temps comme acquise.
 *
 * Cette garde est VERTE aujourd'hui, et le reste tant que le retrait tient.
 * Elle n'a donc aucun registre `ATTENDU_ROUGE` : il n'y a rien à quarantiner,
 * le travail est fait.
 *
 * ⚠️ LIMITE ASSUMÉE : le retrait des commentaires JavaScript (critère 3)
 * suit les chaînes `'`/`"`/`` ` `` mais PAS les littéraux d'expression
 * régulière. Un `/data-theme//` écrit dans une regex serait vu comme du code.
 * C'est le sens prudent de l'erreur (faux rouge, jamais faux vert), et aucun
 * fichier servi n'en contient aujourd'hui.
 */

const fs = require("fs");
const path = require("path");
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

// ===================================================================== //
// Retrait des commentaires — la frontière code / commentaire porte la garde
// ===================================================================== //
// Un commentaire qui RACONTE le retrait (« ce script ne pose plus
// `data-theme` ») est légitime et doit rester vert. Une liste d'exceptions
// figée serait fausse au premier commentaire neuf : on distingue donc par
// analyse, jamais par énumération.

function retirerCommentairesJs(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let chaine = null;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (chaine !== null) {
      if (c === "\\") { out += c + (d === undefined ? "" : d); i += 2; continue; }
      if (c === chaine) chaine = null;
      out += c; i += 1; continue;
    }
    if (c === "/" && d === "/") { while (i < n && src[i] !== "\n") i += 1; continue; }
    if (c === "/" && d === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i += 1;
      i += 2; continue;
    }
    if (c === "'" || c === '"' || c === "`") { chaine = c; out += c; i += 1; continue; }
    out += c; i += 1;
  }
  return out;
}

function retirerCommentairesHtml(src) {
  let s = src.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<style([^>]*)>([\s\S]*?)<\/style>/g,
    (_m, attrs, corps) => "<style" + attrs + ">" + lib.retirerCommentairesCss(corps) + "</style>");
  s = s.replace(/<script([^>]*)>([\s\S]*?)<\/script>/g,
    (_m, attrs, corps) => "<script" + attrs + ">" + retirerCommentairesJs(corps) + "</script>");
  return s;
}

function codeSeul(nom, texte) {
  if (nom.endsWith(".css")) return lib.retirerCommentairesCss(texte);
  if (nom.endsWith(".js")) return retirerCommentairesJs(texte);
  if (nom.endsWith(".html")) return retirerCommentairesHtml(texte);
  return texte;
}

// Tout le CSS d'un fichier servi : la feuille elle-même, ou les blocs
// `<style>` d'un HTML.
function cssDe(nom, texte) {
  if (nom.endsWith(".css")) return texte;
  if (!nom.endsWith(".html")) return "";
  let out = "";
  const motif = /<style[^>]*>([\s\S]*?)<\/style>/g;
  let m;
  while ((m = motif.exec(texte)) !== null) out += m[1] + "\n";
  return out;
}

// ===================================================================== //
// Atteignabilité bruyante (règle non négociable n°1) — la liste des fichiers
// servis est DÉRIVÉE du répertoire, jamais énumérée.
// ===================================================================== //
const RACINE = __dirname;
const EXTENSIONS_SERVIES = [".css", ".js", ".html"];

const servis = fs.readdirSync(RACINE)
  .filter((nom) => EXTENSIONS_SERVIES.some((e) => nom.endsWith(e)))
  .filter((nom) => !nom.startsWith("test_"))
  .sort();

if (servis.length === 0) {
  throw new Error("ATTEIGNABILITE : aucun fichier servi (.css/.js/.html hors test_*) trouvé dans " + RACINE);
}

const contenus = new Map();
for (const nom of servis) {
  contenus.set(nom, lib.lireNonVide(path.join(RACINE, nom), "control-center/web/" + nom));
}
const octets = [...contenus.values()].reduce((s, t) => s + t.length, 0);
console.log("[atteignabilité] " + servis.length + " fichier(s) servi(s) : " + servis.join(", ") +
  " — " + octets + " octets au total");

const cssApp = contenus.get("app.css");
if (cssApp === undefined) {
  throw new Error("ATTEIGNABILITE : app.css introuvable parmi les fichiers servis");
}

// ===================================================================== //
// Les quatre critères, sur le dépôt réel
// ===================================================================== //

// --- 1. Un seul bloc `:root` nu de premier niveau -------------------- //
const blocsRootNus = lib.reglesRootTopNiveau(cssApp);
console.log("[dérivé] blocs `:root` nus de premier niveau dans app.css : " + blocsRootNus.length);
check("theme_unique_un_seul_bloc_root_nu",
  blocsRootNus.length === 1,
  blocsRootNus.length + " bloc(s) — ADR-0033 : le thème unique n'en porte qu'un");

// --- 2. Aucun autre sélecteur de la famille `:root` ne déclare de jeton - //
// Couvre `:root[data-theme=…]`, `:root:not(…)`, `:root.…`, ET un `:root` nu
// écrit SOUS un `@media` (profondeur > 0) — c'est la forme qu'avait le thème
// sombre avant son retrait.
function selecteurTouchantRoot(sel) {
  return /(^|[\s,>+~])::?root\b/.test(sel) || /^:root\b/.test(sel);
}

const coupablesRoot = [];
for (const [nom, texte] of contenus) {
  const css = cssDe(nom, texte);
  if (!css) continue;
  for (const r of lib.reglesCss(css)) {
    if (r.estAtRegle || r.estKeyframes || r.estAutreAtRegle) continue;
    if (!selecteurTouchantRoot(r.selecteur)) continue;
    const estLUniqueNu = r.selecteur === ":root" && r.profondeur === 0;
    if (estLUniqueNu) continue;
    const jetons = lib.declarationsDeCorps(r.corps).filter((d) => d.prop.startsWith("--"));
    if (jetons.length > 0) {
      coupablesRoot.push(nom + " :: `" + r.selecteur + "` (profondeur " + r.profondeur +
        ") déclare " + jetons.length + " jeton(s), ex. " + jetons[0].prop);
    }
  }
}
check("theme_unique_aucun_selecteur_root_conditionnel_declare_des_jetons",
  coupablesRoot.length === 0,
  coupablesRoot.join(" | "));

// --- 3. `data-theme` absent du CODE servi ---------------------------- //
const porteursDataTheme = [];
for (const [nom, texte] of contenus) {
  const code = codeSeul(nom, texte);
  const n = (code.match(/data-theme|dataset\s*\.\s*theme/g) || []).length;
  if (n > 0) porteursDataTheme.push(nom + " (" + n + " occurrence(s) hors commentaire)");
}
const commentaires = [...contenus.entries()].reduce((s, [nom, texte]) => {
  const brut = (texte.match(/data-theme/g) || []).length;
  const code = (codeSeul(nom, texte).match(/data-theme/g) || []).length;
  return s + (brut - code);
}, 0);
console.log("[dérivé] `data-theme` : " + commentaires +
  " occurrence(s) en COMMENTAIRE (légitimes, elles racontent le retrait), " +
  porteursDataTheme.length + " fichier(s) en portant dans le CODE");
check("theme_unique_data_theme_absent_du_code_servi",
  porteursDataTheme.length === 0,
  porteursDataTheme.join(" | "));

// --- 4. Aucune préférence système de thème --------------------------- //
const porteursDark = [];
for (const [nom, texte] of contenus) {
  const code = codeSeul(nom, texte);
  if (/prefers-color-scheme/.test(code)) porteursDark.push(nom);
}
check("theme_unique_aucun_media_prefers_color_scheme",
  porteursDark.length === 0,
  porteursDark.join(", "));

// ===================================================================== //
// Non-régression — construite EN MÉMOIRE, donc indépendante de l'état du
// dépôt : ces cas restent probants quand les quatre critères ci-dessus sont
// verts, et figent chacun une forme de retour du thème sombre.
// ===================================================================== //
const ROOT_SAIN = ":root { --bg: #f7f5fb; --ink: #1c1b1e; }";

function jetonsHorsRootNu(css) {
  const out = [];
  for (const r of lib.reglesCss(css)) {
    if (r.estAtRegle || r.estKeyframes || r.estAutreAtRegle) continue;
    if (!selecteurTouchantRoot(r.selecteur)) continue;
    if (r.selecteur === ":root" && r.profondeur === 0) continue;
    if (lib.declarationsDeCorps(r.corps).some((d) => d.prop.startsWith("--"))) out.push(r.selecteur);
  }
  return out;
}

check("NONREGRESSION_root_conditionnel_est_vu",
  jetonsHorsRootNu(ROOT_SAIN + '\n:root[data-theme="sombre"] { --bg: #000; }').length === 1,
  "un `:root[data-theme=…]` réintroduit doit être vu");

check("NONREGRESSION_root_nu_sous_media_est_vu",
  jetonsHorsRootNu(ROOT_SAIN + "\n@media (min-width: 1px) { :root { --bg: #000; } }").length === 1,
  "un `:root` nu écrit SOUS un @media doit être vu (portée conditionnelle)");

check("NONREGRESSION_second_root_nu_est_vu",
  lib.reglesRootTopNiveau(ROOT_SAIN + "\n:root { --bg: #000; }").length === 2,
  "un second bloc `:root` nu doit être compté");

check("NONREGRESSION_data_theme_en_js_est_vu",
  /data-theme|dataset\s*\.\s*theme/.test(
    retirerCommentairesJs('const a = 1;\ndocument.documentElement.dataset.theme = "sombre";')),
  "une pose de `dataset.theme` en JS doit être vue");

check("NONREGRESSION_media_dark_est_vu",
  /prefers-color-scheme/.test(
    lib.retirerCommentairesCss(ROOT_SAIN + "\n@media (prefers-color-scheme: dark) { :root { --bg: #000 } }")),
  "un @media (prefers-color-scheme: dark) doit être vu");

// La contre-épreuve : un commentaire qui PARLE du retrait reste vert. Sans
// elle, la garde se désarme au premier commentaire d'historique.
check("NONREGRESSION_commentaire_mentionnant_data_theme_reste_vert",
  !/data-theme/.test(lib.retirerCommentairesCss("/* plus aucun data-theme ici (ADR-0033) */\n" + ROOT_SAIN)) &&
  !/data-theme/.test(retirerCommentairesJs("// ce script ne pose plus data-theme\nconst a = 1;")) &&
  !/data-theme/.test(retirerCommentairesHtml("<!-- ne pose plus data-theme -->\n<div></div>")),
  "un commentaire mentionnant `data-theme` ne doit PAS faire rougir");

// ===================================================================== //
console.log("");
console.log(_tests + " cas, " + _echecs.length + " echec(s)");
for (const e of _echecs) console.log("  - " + e);
process.exit(_echecs.length === 0 ? 0 : 1);
