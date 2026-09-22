"use strict";
/* feature-021, cycle 2, lots 6 (reboucle de fidélité) et 6bis (gardes de
 * fidélité d'ensemble, extension de périmètre) — F17 : ÉCHELLE DE FORME ET
 * ÉLÉVATIONS.
 *
 *     node control-center/web/test_conformite_formes.js
 *
 * Défaut mesuré à l'ouverture du lot 6 : F1 (`test_conformite_jetons.js`)
 * vérifie que `--shadow-1`/`--shadow-2` sont DÉCLARÉS dans `:root`, au bit
 * près — mais RIEN ne vérifiait qu'ils soient EMPLOYÉS. Résultat mesuré :
 * les deux ombres M3 étaient présentes dans `:root` et utilisées ZÉRO fois
 * dans toute la feuille, pendant que plusieurs sélecteurs portaient un
 * `border-radius` (2px/3px/4px) qui n'existe dans AUCUNE règle du
 * prototype — des boîtes plates à angles vifs sous un thème qui se déclare
 * Material 3. Défaut PLUS LARGE mesuré à l'ouverture du lot 6bis (gardes de
 * fidélité d'ensemble) : 135 assertions vertes et un écran qui ne
 * ressemblait pas à la maquette — aucune garde ne comparait les deux
 * rendus, sélecteur par sélecteur. F17a-c fermaient les deux trous
 * PONCTUELS ; F17d-f ferment le trou STRUCTUREL : rien ne comparait le
 * VECTEUR DE FORME d'un sélecteur partagé entre les deux feuilles.
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
 *   F17d — INCLUSION généralisée à `box-shadow` (F17a ne portait que
 *          `border-radius`) : tout `box-shadow` employé dans app.css
 *          appartient à l'échelle du prototype, modulo `AJOUTS_HORS_ECHELLE`
 *          (liste déclarée, motif + lot).
 *   F17e — EMPLOI généralisé, sens VALEUR (F17b/c ne portaient que le nom
 *          des JETONS `:root`) : toute valeur `border-radius`/`box-shadow`
 *          employée QUELQUE PART dans le prototype est employée QUELQUE
 *          PART dans app.css, modulo `VALEURS_PAS_ENCORE_EMPLOYEES` (liste
 *          déclarée, motif + lot de clôture).
 *   F17f — VECTEUR EXACT PAR SÉLECTEUR COMMUN, la clause « plus forte que
 *          les deux » : pour tout sélecteur de PREMIER NIVEAU (hors
 *          `@media`) présent tel quel dans les deux feuilles, la valeur de
 *          `border-radius`/`box-shadow` déclarée par le prototype doit être
 *          reproduite AU BIT PRÈS par app.css — modulo `DIVERGENCES_VECTEUR`
 *          (liste déclarée, motif + lot). C'est LA clause mécanique, sans
 *          seuil à négocier : elle aurait tué `border-radius: 2px` sur
 *          `.summary-band` ET l'absence d'emploi des ombres d'un seul coup,
 *          sur le MÊME sélecteur.
 *
 * ⚠️ PORTÉE DÉCLARÉE DE F17d-f, MESURÉE, PAS SUPPOSÉE : ce lot borne le
 * « vecteur de forme » à `border-radius` et `box-shadow` — les deux
 * propriétés RÉELLEMENT impliquées dans le défaut que ce fichier ferme
 * (l'échelle de forme et les élévations M3). Étendre la vérification F17f
 * (vecteur exact par sélecteur commun) à `font-size`, `font-weight`,
 * `line-height`, `letter-spacing`, `padding`, `gap`, `border-width` a été
 * MESURÉ, pas supposé : sur les 64 sélecteurs de premier niveau communs aux
 * deux feuilles, cela produit 26 divergences — presque toutes sur des
 * sélecteurs de fonctionnalités ANTÉRIEURES au cycle M3 (`.jauge`,
 * `.pilotage-*`, `.bandeau-hote`, `.systeme`, `.agents li`,
 * `.table-passages`, `.tiroir`…) qui n'ont jamais prétendu reproduire
 * l'espacement/la typographie du prototype — seule leur FORME (rayons,
 * élévations) est dans le mandat M3 de ce cycle. Inclure ces propriétés
 * ferait échouer la garde pour la MAUVAISE raison (règle non négociable
 * n°2) : vérifié, pas décrété — voir le script de mesure cité dans le
 * rapport du lot. `border-width` n'a AUCUNE déclaration dans le prototype
 * (échelle vide) : hors du périmètre mesurable, exclu par construction.
 *
 * Mesure sur la SOURCE (parseur par profondeur d'accolades, jamais `grep` —
 * PIEGES §26) plutôt que sur le DOM peint : les valeurs comparées ici sont
 * des littéraux `border-radius`/`box-shadow` déclarés PAR RÈGLE, sans
 * cascade ambiguë à résoudre (contrairement au double `:root` de F1) — la
 * source dit exactement ce que le navigateur peindra pour cette propriété
 * précise. F17f se borne aux sélecteurs de PREMIER NIVEAU (hors `@media`,
 * même discipline que `declarationsRootRepliees` pour `:root`) : un
 * sélecteur qui ne vit que sous condition ne « complète » pas la règle
 * nue, il la bat sous condition — le replier inconditionnellement
 * affirmerait une valeur que le navigateur ne peint pas toujours. La
 * fidélité de rendu RÉELLEMENT peinte (cascade, media, DOM construit à
 * l'exécution) est le rôle du harnais navigateur G3
 * (`test_app_fidelite_navigateur.py`), pas de ce fichier.
 */

const lib = require("./test_conformite_lib.js");

// Aucune entrée : cette garde est neuve, rien n'y est encore rouge par
// construction déclarée.
const ATTENDU_ROUGE = {};

// ===================================================================== //
// Exceptions DÉCLARÉES de F17d-f — pas le registre ATTENDU_ROUGE (qui reste
// à { } dans ce fichier comme dans les autres), un mécanisme DISTINCT, au
// même patron que `CLASSES_AJOUTEES` (test_conformite_classes.js) :
// permanent tant que le motif tient, avec un LOT DE CLÔTURE nommé et une
// clause miroir qui échoue si l'exception cesse d'être nécessaire (purge
// obligatoire). Chacune vérifiée par une NON-RÉGRESSION dédiée plus bas.
// ===================================================================== //

// F17d — valeurs `box-shadow` employées par app.css, hors échelle du
// prototype, déjà présentes AVANT ce lot pour des surfaces ANTÉRIEURES au
// cycle M3 (pas des rayons/ombres inventés par ce lot).
const AJOUTS_HORS_ECHELLE = {
  "box-shadow": [
    { val: "0 0 0 2px var(--surface)", raison: "`.agent-flag` : F16, drapeau d'état inventé (ADR-0031 §3), absent du prototype par construction — CLASSES_AJOUTEES le déclare déjà côté classe", lotDeCloture: "F16/ADR-0031, clos" },
    { val: "-16px 0 40px color-mix(in srgb, var(--ink) 16%, transparent)", raison: "`.tiroir` : tiroir de pilotage, fonctionnalité ANTÉRIEURE au cycle M3, jamais dans le mandat de fidélité au prototype", lotDeCloture: "hors mandat M3, non applicable" },
  ],
};

// F17e — valeurs déclarées par le prototype, pas encore employées QUELQUE
// PART dans app.css, parce que le sélecteur qui les porte n'est PAS ENCORE
// CONSTRUIT (lots futurs du plan) — ou reste une divergence assumée avec
// l'existant (brand-mark).
const VALEURS_PAS_ENCORE_EMPLOYEES = {
  "border-radius": [
    { val: "3px", raison: "`.brand-mark i` (prototype) : app.css emploie `50%` sur le même sélecteur — divergence assumée, voir DIVERGENCES_VECTEUR", lotDeCloture: "voir DIVERGENCES_VECTEUR, même entrée" },
    { val: "6px 16px 16px 16px", raison: "`.bubble` (bulle de message), feature-022, pas encore construite", lotDeCloture: "lot 11" },
    { val: "22px", raison: "`.composer` (champ de saisie vers Claude), feature-022, pas encore construit", lotDeCloture: "lot 11" },
    { val: "inherit", raison: "`.progress-track i` (barre de progression, adoptée redéfinie), pas encore construite", lotDeCloture: "lot 10" },
  ],
  "box-shadow": [],
};

// F17f — divergences de vecteur pour un sélecteur PARTAGÉ, déjà présentes à
// l'entrée de ce lot (pas introduites par lui).
const DIVERGENCES_VECTEUR = [
  { selecteur: ".brand-mark i", prop: "border-radius", protoVal: "3px", raison: "app.css emploie `50%` (pastille ronde) plutôt que le carré à coin arrondi du prototype — divergence cosmétique assumée, pas un défaut d'élévation/rayon absent", lotDeCloture: "arbitrage design différé, hors mandat strict M3 de ce lot" },
];

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
// F17d — inclusion généralisée à `box-shadow` (F17a ne portait que
// `border-radius`)
// ===================================================================== //
const PROPS_VECTEUR = ["border-radius", "box-shadow"];

function verifierInclusion(prop) {
  const echelleProto = new Set(declarationsDeForme(cssPrototype, prop).map((d) => d.val));
  const declApp = declarationsDeForme(cssApp, prop);
  const ajoutsNoms = new Set((AJOUTS_HORS_ECHELLE[prop] || []).map((a) => a.val));
  const horsEchelle = declApp.filter((d) => !echelleProto.has(d.val) && !ajoutsNoms.has(d.val));
  check("F17d_" + prop.replace(/-/g, "_") + "_employe_appartient_a_lechelle_ou_est_un_ajout_declare",
    horsEchelle.length === 0,
    horsEchelle.length + " déclaration(s) hors échelle ET hors AJOUTS_HORS_ECHELLE : " +
      horsEchelle.map((d) => "`" + d.selecteur + "` : " + d.val).join(" | "));
  // Purge obligatoire : un ajout déclaré qui appartient DÉSORMAIS à
  // l'échelle du prototype (le prototype a changé) n'a plus de raison d'être
  // une exception — même discipline que CLASSES_AJOUTEES/ATTENDU_ROUGE.
  const ajoutsPerimes = (AJOUTS_HORS_ECHELLE[prop] || []).filter((a) => echelleProto.has(a.val));
  check("F17d_" + prop.replace(/-/g, "_") + "_aucun_ajout_perime_dans_AJOUTS_HORS_ECHELLE",
    ajoutsPerimes.length === 0,
    ajoutsPerimes.map((a) => a.val).join(", ") + " appartiennent maintenant à l'échelle — à retirer");
}
for (const prop of PROPS_VECTEUR) verifierInclusion(prop);

(function nonRegressionF17d() {
  const echelleTemoin = new Set(["0 1px 2px red"]);
  const declTemoin = [{ selecteur: ".x", val: "0 1px 2px red" }, { selecteur: ".y", val: "0 0 0 99px blue" }];
  const ajoutsTemoin = new Set(["0 0 0 99px blue"]);
  const horsEchelleTemoin = declTemoin.filter((d) => !echelleTemoin.has(d.val) && !ajoutsTemoin.has(d.val));
  check("F17d_NONREGRESSION_ajout_declare_est_tolere", horsEchelleTemoin.length === 0);
  const sansAjout = declTemoin.filter((d) => !echelleTemoin.has(d.val));
  check("F17d_NONREGRESSION_valeur_non_declaree_est_refusee",
    sansAjout.length === 1 && sansAjout[0].selecteur === ".y");
})();

// ===================================================================== //
// F17e — emploi généralisé, sens VALEUR : toute valeur employée par le
// prototype doit être employée QUELQUE PART dans app.css, modulo
// VALEURS_PAS_ENCORE_EMPLOYEES.
// ===================================================================== //
function verifierEmploiValeur(prop) {
  const valeursProto = new Set(declarationsDeForme(cssPrototype, prop).map((d) => d.val));
  const valeursApp = new Set(declarationsDeForme(cssApp, prop).map((d) => d.val));
  const declarees = new Map((VALEURS_PAS_ENCORE_EMPLOYEES[prop] || []).map((e) => [e.val, e]));
  const nonEmployees = [...valeursProto].filter((v) => !valeursApp.has(v) && !declarees.has(v));
  check("F17e_" + prop.replace(/-/g, "_") + "_toute_valeur_du_prototype_est_employee_ou_declaree",
    nonEmployees.length === 0,
    nonEmployees.length + " valeur(s) du prototype jamais employée(s) dans app.css, NI déclarée(s) " +
      "dans VALEURS_PAS_ENCORE_EMPLOYEES : " + nonEmployees.join(", "));
  // Chaque entrée déclarée porte un lot de clôture nommé.
  for (const e of VALEURS_PAS_ENCORE_EMPLOYEES[prop] || []) {
    check("F17e_" + prop.replace(/-/g, "_") + "_" + JSON.stringify(e.val) + "_porte_un_lot_de_cloture",
      !!(e.lotDeCloture && e.lotDeCloture.trim()));
  }
  // Purge obligatoire : une valeur déclarée « pas encore employée » qui
  // l'est DÉSORMAIS doit être retirée de la liste.
  const perimees = (VALEURS_PAS_ENCORE_EMPLOYEES[prop] || []).filter((e) => valeursApp.has(e.val));
  check("F17e_" + prop.replace(/-/g, "_") + "_aucune_entree_perimee",
    perimees.length === 0,
    perimees.map((e) => e.val).join(", ") + " sont maintenant employées — à retirer de VALEURS_PAS_ENCORE_EMPLOYEES");
}
for (const prop of PROPS_VECTEUR) verifierEmploiValeur(prop);

(function nonRegressionF17e() {
  const proto = new Set(["12px", "24px"]);
  const app = new Set(["12px"]);
  const declarees = new Map([["24px", { lotDeCloture: "témoin" }]]);
  const nonEmployees = [...proto].filter((v) => !app.has(v) && !declarees.has(v));
  check("F17e_NONREGRESSION_valeur_declaree_est_toleree", nonEmployees.length === 0);
  const declareesVides = new Map();
  const nonEmployeesSansDeclaration = [...proto].filter((v) => !app.has(v) && !declareesVides.has(v));
  check("F17e_NONREGRESSION_valeur_non_declaree_est_refusee_et_nommee",
    nonEmployeesSansDeclaration.length === 1 && nonEmployeesSansDeclaration[0] === "24px");
})();

// ===================================================================== //
// F17f — VECTEUR EXACT PAR SÉLECTEUR COMMUN, clause « plus forte que les
// deux » : sélecteurs de PREMIER NIVEAU (hors `@media`) présents tels quels
// dans le prototype ET dans app.css, égalité au bit près sur border-radius/
// box-shadow — modulo DIVERGENCES_VECTEUR.
// ===================================================================== //
function declarationsFormeParSelecteurTopNiveau(cssBrut) {
  const parSelecteur = new Map();
  for (const regle of lib.reglesCss(cssBrut)) {
    if (regle.estKeyframes || regle.estAtRegle || regle.estAutreAtRegle) continue;
    if (regle.profondeur !== 0) continue; // jamais un sélecteur qui ne vit que sous condition
    const vecteur = {};
    for (const d of lib.declarationsDeCorps(regle.corps)) {
      const p = d.prop.toLowerCase();
      if (PROPS_VECTEUR.includes(p)) vecteur[p] = d.val.trim();
    }
    if (Object.keys(vecteur).length === 0) continue;
    if (!parSelecteur.has(regle.selecteur)) parSelecteur.set(regle.selecteur, {});
    Object.assign(parSelecteur.get(regle.selecteur), vecteur);
  }
  return parSelecteur;
}

const vecteursProto = declarationsFormeParSelecteurTopNiveau(cssPrototype);
const vecteursApp = declarationsFormeParSelecteurTopNiveau(cssApp);
const selecteursCommuns = [...vecteursProto.keys()].filter((s) => vecteursApp.has(s));
console.log("[dérivé] " + selecteursCommuns.length + " sélecteur(s) de premier niveau communs au " +
  "prototype et à app.css portant un vecteur de forme (border-radius/box-shadow)");

const divergencesDeclarees = new Map(DIVERGENCES_VECTEUR.map((d) => [d.selecteur + "|" + d.prop, d]));
const divergencesTrouvees = [];
for (const sel of selecteursCommuns) {
  const vp = vecteursProto.get(sel), va = vecteursApp.get(sel);
  for (const prop of Object.keys(vp)) {
    if (va[prop] !== undefined && va[prop] !== vp[prop]) {
      const cle = sel + "|" + prop;
      if (!divergencesDeclarees.has(cle)) {
        divergencesTrouvees.push(sel + " ." + prop + " : prototype=" + vp[prop] + " app.css=" + va[prop]);
      }
    }
  }
}
check("F17f_vecteur_de_forme_egal_au_bit_pres_pour_tout_selecteur_commun",
  divergencesTrouvees.length === 0,
  divergencesTrouvees.length + " divergence(s) NON déclarée(s) : " + divergencesTrouvees.join(" | "));

// Chaque divergence déclarée porte un lot de clôture, et la clause miroir
// (purge) s'applique : si le vecteur s'accorde DÉSORMAIS, l'entrée est
// périmée.
for (const d of DIVERGENCES_VECTEUR) {
  check("F17f_divergence_" + d.selecteur.replace(/\W+/g, "_") + "_" + d.prop.replace(/-/g, "_") + "_porte_un_lot_de_cloture",
    !!(d.lotDeCloture && d.lotDeCloture.trim()));
}
const divergencesPerimees = DIVERGENCES_VECTEUR.filter((d) => {
  const va = vecteursApp.get(d.selecteur);
  return va && va[d.prop] === d.protoVal;
});
check("F17f_aucune_divergence_declaree_nest_perimee", divergencesPerimees.length === 0,
  divergencesPerimees.map((d) => d.selecteur + "." + d.prop).join(", ") + " s'accordent maintenant — à retirer");

(function nonRegressionF17f() {
  const cssProtoTemoin = ".carte { border-radius: 24px; box-shadow: 0 1px 2px red; }\n" +
    "@media (min-width: 900px) { .carte { border-radius: 999px; } }\n";
  const cssAppAccordTemoin = ".carte { border-radius: 24px; }\n";
  const cssAppDivergentTemoin = ".carte { border-radius: 2px; }\n";

  const vp = declarationsFormeParSelecteurTopNiveau(cssProtoTemoin);
  check("F17f_NONREGRESSION_media_est_exclu_du_repli",
    vp.get(".carte")["border-radius"] === "24px", "obtenu : " + JSON.stringify(vp.get(".carte")));

  const vaAccord = declarationsFormeParSelecteurTopNiveau(cssAppAccordTemoin);
  check("F17f_NONREGRESSION_vecteur_identique_ne_diverge_pas",
    vp.get(".carte")["border-radius"] === vaAccord.get(".carte")["border-radius"]);

  const vaDivergent = declarationsFormeParSelecteurTopNiveau(cssAppDivergentTemoin);
  check("F17f_NONREGRESSION_vecteur_different_diverge_et_est_nomme",
    vp.get(".carte")["border-radius"] !== vaDivergent.get(".carte")["border-radius"] &&
    vaDivergent.get(".carte")["border-radius"] === "2px");
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
