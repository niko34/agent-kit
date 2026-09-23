"use strict";
/* feature-022 (absorbée dans feature-021 cycle 2, lot 11) — S3.6 : le rendu
 * du panneau de conversation (et de tout le reste de `web/`) se fait
 * EXCLUSIVEMENT par `textContent`/`document.createTextNode`/`el()`, jamais
 * par `innerHTML`, `insertAdjacentHTML` ou `outerHTML =`. Un fil de
 * conversation est du texte libre saisi par un utilisateur — l'injecter par
 * `innerHTML` en ferait une surface XSS.
 *
 *     node control-center/web/test_conformite_rendu_textuel.js
 *
 * ⚠️ Cette garde N'EXISTAIT PAS avant ce lot (vérifié : aucun fichier
 * `test_conformite_*` ni `test_app_*` n'assertionnait sur `innerHTML` avant
 * feature-022, lot 11 — `grep -rn innerHTML control-center/web/*.js` avant ce
 * commit ne rendait qu'un commentaire dans `app.js`, ligne 13, qui CITE la
 * règle en prose sans qu'aucun test ne l'évalue — exactement le défaut de
 * PIEGES §33 : « un invariant énoncé en commentaire n'est une garde que si
 * un test l'évalue »).
 *
 * La liste des fichiers examinés N'EST PAS recopiée à la main (PIEGES §21) :
 * elle est DÉRIVÉE du même critère que `_fichiers_servables()`
 * (control-center/backend/server.py) — tout `.js` de `control-center/web/`
 * dont le nom ne commence PAS par `test_` est un livrable SERVI au
 * navigateur, donc dans le périmètre de cette garde.
 */

const fs = require("fs");
const path = require("path");

const RACINE_WEB = __dirname;

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
// Assertion d'atteignabilité bruyante
// ===================================================================== //
function fichiersJsServis() {
  const noms = fs.readdirSync(RACINE_WEB)
    .filter((nom) => nom.endsWith(".js"))
    .filter((nom) => !nom.startsWith("test_"))
    .sort();
  return noms;
}

const fichiers = fichiersJsServis();
console.log("[atteignabilité] " + fichiers.length + " fichier(s) .js SERVI(S) dérivé(s) du répertoire : "
  + fichiers.join(", "));
if (fichiers.length === 0) {
  throw new Error("ATTEIGNABILITE : aucun .js servi trouvé dans " + RACINE_WEB
    + " — la garde ÉCHOUE, elle ne se saute pas.");
}
// Non-régression du périmètre lui-même : si `app.js` disparaissait de la
// liste, la garde continuerait de passer sur un ensemble VIDE de fichiers
// pertinents — aussi trompeur qu'un vert à vide (règle « vu rouge »).
check("perimetre_contient_app_js", fichiers.includes("app.js"),
  "app.js absent de la liste dérivée : " + fichiers.join(", "));

// ===================================================================== //
// S3.6 — aucune écriture de HTML brut dans les fichiers SERVIS
// ===================================================================== //

// Motifs recherchés SUR LE CODE, pas dans une prose de commentaire citant le
// mot : on exige la forme d'un ASSIGNEMENT ou d'un APPEL, jamais la simple
// présence du mot (qui apparaît légitimement dans des commentaires expliquant
// la règle, ex. `app.js` l.13).
const MOTIFS = [
  { nom: "innerHTML_assigne", regex: /\.innerHTML\s*=/g },
  { nom: "outerHTML_assigne", regex: /\.outerHTML\s*=/g },
  { nom: "insertAdjacentHTML_appele", regex: /\.insertAdjacentHTML\s*\(/g },
];

fichiers.forEach((nom) => {
  const chemin = path.join(RACINE_WEB, nom);
  const texte = fs.readFileSync(chemin, "utf8");
  if (texte.trim().length === 0) {
    throw new Error("ATTEIGNABILITE : " + nom + " est VIDE à " + chemin);
  }
  MOTIFS.forEach((motif) => {
    const trouves = texte.match(motif.regex) || [];
    check(nom + "_" + motif.nom + "_absent", trouves.length === 0,
      trouves.length + " occurrence(s) dans " + nom);
  });
});

function main() {
  console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
  for (const e of _echecs) console.log("  - " + e);
  process.exit(_echecs.length ? 1 : 0);
}
main();
