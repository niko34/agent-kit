"use strict";
/* feature-020 — LE LIVRABLE DU CYCLE : test de CONFORMITÉ À LA MAQUETTE.
 *
 *     node control-center/web/test_app_diagramme_conformite.js
 *
 * Troisième itération sur la même demande ("je veux la même chose que la
 * maquette, pas une adaptation"). Les deux itérations précédentes ont
 * procédé par retouches jugées à l'œil. Ce fichier existe pour que
 * « identique » cesse d'être un jugement et devienne une MESURE : une table
 * de valeurs attendues ÉCRITE À LA MAIN depuis la lecture de
 * `control-center/maquettes/2026-09-15-diagramme-reference.html`
 * (`pose()`, l. 164-181 ; `graphe()`, l. 152-215) — jamais dérivée de
 * `diagramme.js` lui-même, jamais relue depuis `disposer.MESURES_DEFAUT`.
 *
 * ⚠️ RÈGLE DE CE FICHIER, PLUS STRICTE que `test_app_diagramme.js` : aucune
 * valeur ATTENDUE ne vient de l'artefact sous test. Comparer une valeur
 * calculée à partir d'une constante à CETTE MÊME constante relue dans
 * `diagramme.js` est tautologique — toujours vraie, y compris sous une
 * mutation de la constante. Les nombres ci-dessous (2.4, 4.8, 24/36/52, 7,
 * 3.2, 1.8, 1, 11, 0.80, 3.6, 17/33/47, -3/12, 0.22/0.45/8) sont RECOPIÉS,
 * à la main, depuis le texte de la maquette — pas depuis `MESURES_DEFAUT`.
 *
 * Seule exception : les DURÉES d'entrée des fixtures (pour amener le rayon
 * dans telle ou telle bande) sont calculées à partir de la formule de rayon
 * elle-même RECOPIÉE EN LITTÉRAL ici (11 + 0.80·√s) — jamais lue depuis
 * `disposer.MESURES_DEFAUT.rayonBase`/`rayonCoefficient`.
 *
 * Zéro dépendance installée (ADR-0006) : `fs`/`path`/`vm` de la bibliothèque
 * standard Node uniquement, même discipline que `test_app_diagramme.js`.
 * Invoqué depuis `test_app_diagramme_conformite.py`, qui se saute
 * proprement si `node` est absent.
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

function chargerDisposer() {
  const chemin = path.join(__dirname, "diagramme.js");
  const source = fs.readFileSync(chemin, "utf8");
  const sandbox = { console };
  vm.createContext(sandbox);
  new vm.Script(source, { filename: "diagramme.js" }).runInContext(sandbox);
  if (typeof sandbox.disposer !== "function") {
    throw new Error("diagramme.js ne définit pas `disposer` au premier niveau");
  }
  return sandbox.disposer;
}

const disposer = chargerDisposer();

function passage(agent, debutIso, dureeMs, options) {
  const o = options || {};
  return {
    agent, debut: debutIso, duree_ms: dureeMs,
    outils: o.outils || 0, fichiers: o.fichiers || [], echecs: o.echecs || 0,
    termine: o.termine !== undefined ? o.termine : true, etat: o.etat,
    type: o.type || "sousagent",
  };
}

// -- Formule de rayon, RECOPIÉE À LA MAIN depuis `graphe()` (maquette,
// l.121) : `a.r=11+Math.sqrt(a.d)*0.80` — `a.d` est déjà en SECONDES
// (`AG[].d`, ex. `d:2807`), jamais en millisecondes.
const RAYON_BASE_MAQUETTE = 11;
const RAYON_COEFFICIENT_MAQUETTE = 0.80;
function rayonAttenduMaquette(dureeS) {
  return RAYON_BASE_MAQUETTE + RAYON_COEFFICIENT_MAQUETTE * Math.sqrt(dureeS);
}
function dureeMsPourRayonVise(rayonVise) {
  const s = Math.pow((rayonVise - RAYON_BASE_MAQUETTE) / RAYON_COEFFICIENT_MAQUETTE, 2);
  return s * 1000;
}

// -- Point sur un cercle — RECOPIÉ (pas importé) : `pointSurCercle` est le
// SEUL endroit de `diagramme.js` qui fait de la trigonométrie ; le
// reproduire ici de façon indépendante permet à une mutation de son signe
// ou de sa convention d'être détectée (PIEGES.md §30 : ne jamais déléguer
// à la fonction qu'on met en défaut). Convention documentée par
// `diagramme.js` : angle mesuré depuis le haut, sens horaire (0° = 12h) —
// mathématiquement équivalente à la convention `-90 + ...` en cos/sin de la
// maquette (note de la spec feature-020, item D).
function pointAttendu(cx, cy, rayon, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + rayon * Math.sin(rad), y: cy - rayon * Math.cos(rad) };
}

// ===================================================================== //
// A — TK, angles de première/dernière graduation, par bande de rayon      //
// (maquette : `TK=a.r<22?24:a.r<32?36:52`, `g=(-90+2.4+i*(360-4.8)/TK)`)  //
// ===================================================================== //
function testTableTK() {
  const TABLE = [
    // [rayon visé, TK attendu]
    [15, 24],  // r < 22
    [25, 36],  // 22 <= r < 32
    [40, 52],  // r >= 32
  ];
  TABLE.forEach(([rayonVise, tkAttendu]) => {
    const dureeMs = dureeMsPourRayonVise(rayonVise);
    const g = disposer([passage("agent-tk-" + rayonVise, "2026-09-15T10:00:00.000Z", dureeMs, { outils: 0 })]);
    const a = g.creneaux[0].agents[0];
    const rayonAttendu = rayonAttenduMaquette(dureeMs / 1000);
    check("rayon_" + rayonVise + "_formule_11_plus_0_80_racine_s",
      Math.abs(a.rayon - rayonAttendu) < 1e-6,
      "obtenu " + a.rayon + " attendu " + rayonAttendu);
    check("TK_" + rayonVise + "_attendu_" + tkAttendu,
      a.graduationsTotal === tkAttendu,
      "rayon=" + a.rayon + " obtenu TK=" + a.graduationsTotal);
  });
}

// ===================================================================== //
// B — angle de la première et de la dernière graduation, PAR BANDE       //
// (maquette : départ 2.4°, pas = (360-4.8)/TK, TK divisions)              //
// ===================================================================== //
function testAnglesPremiereEtDerniereGraduation() {
  // [TK, angle de la dernière graduation, calculé à la main]
  //   TK=24 : pas=355.2/24=14.8              -> dernier = 2.4+23*14.8   = 342.8
  //   TK=36 : pas=355.2/36=9.8666666666667   -> dernier = 2.4+35*pas    = 347.73333333333335
  //   TK=52 : pas=355.2/52=6.8307692307692   -> dernier = 2.4+51*pas    = 350.76923076923083
  const TABLE = [
    { rayonVise: 15, tk: 24, dernierAngle: 342.8 },
    { rayonVise: 25, tk: 36, dernierAngle: 347.73333333333335 },
    { rayonVise: 40, tk: 52, dernierAngle: 350.76923076923083 },
  ];
  TABLE.forEach(({ rayonVise, tk, dernierAngle }) => {
    const dureeMs = dureeMsPourRayonVise(rayonVise);
    const g = disposer([passage("agent-angle-" + rayonVise, "2026-09-15T10:00:00.000Z", dureeMs, { outils: 0 })]);
    const a = g.creneaux[0].agents[0];
    const r0 = a.rayon + 4; // maquette : r0 = a.r + 4
    const premiereAttendu = pointAttendu(a.cx, a.cy, r0, 2.4);
    const derniereAttendu = pointAttendu(a.cx, a.cy, r0, dernierAngle);
    const premiere = a.graduations[0];
    const derniere = a.graduations[a.graduations.length - 1];
    check("angle_premiere_TK" + tk + "_position",
      Math.abs(premiere.x1 - premiereAttendu.x) < 1e-6 && Math.abs(premiere.y1 - premiereAttendu.y) < 1e-6,
      "obtenu (" + premiere.x1 + "," + premiere.y1 + ") attendu (" + premiereAttendu.x + "," + premiereAttendu.y + ")");
    check("angle_derniere_TK" + tk + "_position",
      Math.abs(derniere.x1 - derniereAttendu.x) < 1e-6 && Math.abs(derniere.y1 - derniereAttendu.y) < 1e-6,
      "obtenu (" + derniere.x1 + "," + derniere.y1 + ") attendu (" + derniereAttendu.x + "," + derniereAttendu.y + ")");
  });
}

// ===================================================================== //
// C — longueurs / épaisseurs de graduation : ALLUMÉE vs ÉTEINTE          //
// (maquette : `on?7:3.2`, `on?1.8:1`)                                     //
// ===================================================================== //
function testLongueursEtEpaisseursGraduation() {
  // TK=36, 70 outils (= échelle) -> ratio=1 -> TOUTES allumées.
  const gAllumee = disposer([
    passage("agent-allumee", "2026-09-15T10:00:00.000Z", dureeMsPourRayonVise(25), { outils: 70 }),
  ]);
  const aAllumee = gAllumee.creneaux[0].agents[0];
  check("toutes_graduations_allumees_quand_outils_egale_70",
    aAllumee.graduationsAllumees === aAllumee.graduationsTotal,
    "obtenu " + aAllumee.graduationsAllumees + "/" + aAllumee.graduationsTotal);
  const allumee = aAllumee.graduations[0];
  const longueurAllumee = Math.hypot(allumee.x2 - allumee.x1, allumee.y2 - allumee.y1);
  check("graduation_allumee_longueur_7", Math.abs(longueurAllumee - 7) < 1e-6, "obtenu " + longueurAllumee);
  check("graduation_allumee_epaisseur_1_8", allumee.epaisseur === 1.8, "obtenu " + allumee.epaisseur);

  // 0 outils -> TOUTES éteintes.
  const gEteinte = disposer([
    passage("agent-eteinte", "2026-09-15T10:00:00.000Z", dureeMsPourRayonVise(25), { outils: 0 }),
  ]);
  const aEteinte = gEteinte.creneaux[0].agents[0];
  check("aucune_graduation_allumee_quand_outils_zero",
    aEteinte.graduationsAllumees === 0, "obtenu " + aEteinte.graduationsAllumees);
  const eteinte = aEteinte.graduations[0];
  const longueurEteinte = Math.hypot(eteinte.x2 - eteinte.x1, eteinte.y2 - eteinte.y1);
  check("graduation_eteinte_longueur_3_2", Math.abs(longueurEteinte - 3.2) < 1e-6, "obtenu " + longueurEteinte);
  check("graduation_eteinte_epaisseur_1", eteinte.epaisseur === 1, "obtenu " + eteinte.epaisseur);
}

// ===================================================================== //
// D — opacité du liseré, POUR f DANS {0, 1, 4, 8, 20}                     //
// (maquette : `opacity:(0.22+Math.min(a.f,8)/8*0.45).toFixed(2)`)         //
// ===================================================================== //
function testOpaciteLiseretTableManuelle() {
  // Valeurs recalculées À LA MAIN (0.22 base, amplitude 0.45, plafond à 8
  // fichiers, arrondi à 2 décimales COMME LE FAIT LA MAQUETTE ELLE-MÊME —
  // `.toFixed(2)` fait partie de la formule de référence, pas une correction
  // du kit) :
  //   f=0  -> 0.22 + 0/8*0.45   = 0.22            -> "0.22"
  //   f=1  -> 0.22 + 1/8*0.45   = 0.27625          -> "0.28"
  //   f=4  -> 0.22 + 4/8*0.45   = 0.445            -> "0.45" (0.44 en JS pur — voir note ci-dessous)
  //   f=8  -> 0.22 + 8/8*0.45   = 0.67             -> "0.67"
  //   f=20 -> min(20,8)=8, identique à f=8         -> "0.67"
  // Note f=4 : `(0.445).toFixed(2)` vaut RÉELLEMENT "0.45" en IEEE-754 (le
  // double le plus proche de 0.445 est très légèrement AU-DESSUS de 0.445),
  // vérifié par exécution — ce n'est pas une approximation choisie par ce
  // test, c'est ce que `toFixed` rend sur CETTE plateforme.
  const TABLE = [
    [0, 0.22],
    [1, 0.28],
    [4, 0.45],
    [8, 0.67],
    [20, 0.67],
  ];
  TABLE.forEach(([f, opaciteAttendue]) => {
    const fichiers = new Array(f).fill("fichier.txt");
    const g = disposer([
      passage("agent-liseret-" + f, "2026-09-15T10:00:00.000Z", 5000, { outils: 1, fichiers }),
    ]);
    const a = g.creneaux[0].agents[0];
    check("liseret_opacite_f" + f, a.liseretOpacite === opaciteAttendue,
      "obtenu " + a.liseretOpacite + " attendu " + opaciteAttendue);
  });
}

// ===================================================================== //
// E — décalage du sigle par rapport au centre (maquette : `y:cy+3.6`)     //
// ===================================================================== //
function testSigleBaselineYDecalage36() {
  const g = disposer([passage("debugger", "2026-09-15T10:00:00.000Z", 5000, { outils: 1 })]);
  const a = g.creneaux[0].agents[0];
  check("sigle_baseline_y_decalage_3_6_depuis_cy",
    Math.abs(a.sigleBaselineY - (a.cy + 3.6)) < 1e-9,
    "obtenu " + a.sigleBaselineY + " cy=" + a.cy);
}

// ===================================================================== //
// F — positions de socle, SIMPLE (maquette : `yb=cy+a.r+17` puis          //
// `yb`, `yb+16`, `yb+30`) et EMPILÉ (`cy-3`, `cy+12`)                     //
// ===================================================================== //
function testSoclePositionsSimple() {
  const g = disposer([passage("backend-developer", "2026-09-15T10:00:00.000Z", 5000, { outils: 3 })]);
  const a = g.creneaux[0].agents[0];
  const [heure, duree, nom] = a.socle.lignes;
  const ybAttendu = a.cy + a.rayon + 17;
  check("socle_simple_heure_baseline_yb", heure.baselineY === ybAttendu, "obtenu " + heure.baselineY);
  check("socle_simple_duree_baseline_yb_plus_16", duree.baselineY === ybAttendu + 16, "obtenu " + duree.baselineY);
  check("socle_simple_nom_baseline_yb_plus_30", nom.baselineY === ybAttendu + 30, "obtenu " + nom.baselineY);
}

function testSoclePositionsEmpile() {
  const passages = [
    passage("backend-developer", "2026-09-15T10:00:00.000Z", 60000, { outils: 2 }),
    passage("frontend-developer", "2026-09-15T10:00:00.000Z", 60000, { outils: 3 }),
  ];
  const g = disposer(passages);
  const c = g.creneaux[0];
  check("socle_empile_deux_agents", c.agents.length === 2, "obtenu " + c.agents.length);
  c.agents.forEach((a, i) => {
    const [heureDuree, nom] = a.socle.lignes;
    check("socle_empile_" + i + "_heureDuree_baseline_cy_moins_3",
      heureDuree.baselineY === a.cy - 3, "obtenu " + heureDuree.baselineY);
    check("socle_empile_" + i + "_nom_baseline_cy_plus_12",
      nom.baselineY === a.cy + 12, "obtenu " + nom.baselineY);
  });
}

// ===================================================================== //
// G — texteDuree() : format des durées ALIGNÉ SUR LA MAQUETTE (D8),      //
// dans le diagramme ET la table des passages (maquette l.117 :           //
// `dur=s=>s>=60?Math.floor(s/60)+' min '+String(s%60).padStart(2,'0'):s+' s'`) //
//                                                                         //
// `dur()` de la maquette prend `s` DÉJÀ EN SECONDES ENTIÈRES (ses         //
// fixtures : `d:172`, `d:67`…). Le kit convertit lui-même `dureeMs` en    //
// secondes (`Math.round(dureeMs/1000)`, hors domaine de la maquette) —    //
// chaque valeur attendue ci-dessous est un LITTÉRAL recopié à la main,    //
// jamais dérivé de `texteDuree` ni d'une relecture de `diagramme.js`.     //
// ===================================================================== //
function testTexteDureeFormatMaquetteBornesPileEtAlentour() {
  const TABLE = [
    // [ms, attendu, commentaire]
    [999, "999 ms", "hors domaine maquette, branche propre au kit"],
    [1000, "1 s", "s=round(1)=1, domaine maquette, s<60"],
    [59999, "1 min 00", "s=round(59.999)=60 -> bascule (round, pas floor)"],
    [60000, "1 min 00", "s=round(60)=60 -> bascule"],
    [67000, "1 min 07", "padStart : s%60=7 doit s'écrire sur DEUX chiffres"],
    [3599999, "1 h 00", "s=round(3599.999)=3600 -> écart heures (round, pas floor)"],
    [3600000, "1 h 00", "s=round(3600)=3600 -> écart heures"],
  ];
  TABLE.forEach(([ms, attendu, commentaire]) => {
    const obtenu = disposer.texteDuree(ms);
    check("texteDuree_" + ms + "ms", obtenu === attendu,
      "obtenu " + JSON.stringify(obtenu) + " attendu " + JSON.stringify(attendu) + " (" + commentaire + ")");
  });
}

// ===================================================================== //
// H — écart ASSUMÉ au-delà d'1 h : la maquette n'a AUCUNE branche         //
// « heures » (`dur()` ne fait jamais que "N min SS"). Le kit en ajoute    //
// une, sur mesure d'un cas réel du journal (33 186 s). Ce test épingle    //
// LES DEUX écritures — celle du kit et celle qu'aurait produite une       //
// application littérale de `dur()` au-delà de son domaine — pour que la  //
// divergence soit une décision tenue, pas une dérive silencieuse.        //
// ===================================================================== //
function testEcartAssumeAuDelaDUneHeure() {
  const DUREE_S_REELLE = 33186; // segment mesuré du journal réel (spec feature-020, D8)
  const ATTENDU_KIT = "9 h 13";
  const ATTENDU_SI_MAQUETTE_APPLIQUEE_TELLE_QUELLE = "553 min 06";

  check("texteDuree_33186000ms_forme_kit_en_heures",
    disposer.texteDuree(DUREE_S_REELLE * 1000) === ATTENDU_KIT,
    "obtenu " + disposer.texteDuree(DUREE_S_REELLE * 1000));

  // Réimplémentation INDÉPENDANTE de `dur()` (maquette, l.117), littérale,
  // jamais appelée via `disposer` : sert uniquement à documenter et
  // épingler l'écriture QUE LA MAQUETTE AURAIT PRODUITE si on lui donnait
  // cette durée hors de son propre domaine — pas à calculer l'attendu du kit.
  const durMaquette = (s) => (s >= 60 ? Math.floor(s / 60) + " min " + String(s % 60).padStart(2, "0") : s + " s");
  check("dur_maquette_litterale_33186s_donnerait_553min06",
    durMaquette(DUREE_S_REELLE) === ATTENDU_SI_MAQUETTE_APPLIQUEE_TELLE_QUELLE,
    "obtenu " + durMaquette(DUREE_S_REELLE));

  check("ecart_heures_bien_une_divergence_reelle_et_non_un_hasard",
    disposer.texteDuree(DUREE_S_REELLE * 1000) !== durMaquette(DUREE_S_REELLE));
}

// ===================================================================== //
// G2 (revue code-reviewer, feature-020) — barres du zéro : LONGUEURS      //
// recopiées à la main depuis la maquette (l.172-173) :                  //
//   sv.appendChild(E('line',{x1:cx,y1:cy-r0+.5,x2:cx,y2:cy-r0-8.5, ...   //
//   sv.appendChild(E('line',{x1:cx-.6,y1:cy-r0+.5,x2:cx-.6,y2:cy-r0-9.5,…//
// Non couvert avant cette passe : `diagramme.js` produisait r0-9/r0-10   //
// sans qu'aucun test ne le voie. `r0` est RECALCULÉ ici (`a.rayon+4`,    //
// même formule que `testAnglesPremiereEtDerniereGraduation` plus haut),  //
// jamais relu depuis `a.rayonGraduationInterieur` (le champ du contrat   //
// lui-même) — pour ne pas dépendre d'un champ qui pourrait muter avec la //
// valeur qu'il sert à vérifier.                                          //
// ===================================================================== //
function testBarresDuZeroLongueursTableManuelle() {
  const g = disposer([
    passage("agent-barres-zero", "2026-09-15T10:00:00.000Z", dureeMsPourRayonVise(25), { outils: 3 }),
  ]);
  const a = g.creneaux[0].agents[0];
  const r0 = a.rayon + 4; // maquette l.165 : r0=a.r+4

  const bzb = a.barreZeroBlanche;
  check("barre_zero_blanche_x1_sur_cx", bzb.x1 === a.cx, "obtenu " + bzb.x1);
  check("barre_zero_blanche_y1", Math.abs(bzb.y1 - (a.cy - r0 + 0.5)) < 1e-9, "obtenu " + bzb.y1);
  check("barre_zero_blanche_x2_sur_cx", bzb.x2 === a.cx, "obtenu " + bzb.x2);
  check("barre_zero_blanche_y2_longueur_8_5",
    Math.abs(bzb.y2 - (a.cy - r0 - 8.5)) < 1e-9, "obtenu " + bzb.y2);

  const bzg = a.barreZeroGrise;
  check("barre_zero_grise_x1_decale_0_6", Math.abs(bzg.x1 - (a.cx - 0.6)) < 1e-9, "obtenu " + bzg.x1);
  check("barre_zero_grise_y1", Math.abs(bzg.y1 - (a.cy - r0 + 0.5)) < 1e-9, "obtenu " + bzg.y1);
  check("barre_zero_grise_x2_decale_0_6", Math.abs(bzg.x2 - (a.cx - 0.6)) < 1e-9, "obtenu " + bzg.x2);
  check("barre_zero_grise_y2_longueur_9_5",
    Math.abs(bzg.y2 - (a.cy - r0 - 9.5)) < 1e-9, "obtenu " + bzg.y2);

  // Les deux longueurs doivent rester DISTINCTES (8.5 vs 9.5) — une
  // assertion d'ensemble seule (« toutes deux correctes ») laisserait
  // passer un échange des deux constantes entre elles.
  check("barre_zero_blanche_et_grise_longueurs_distinctes",
    Math.abs(bzb.y2 - bzg.y2) > 1e-6, "blanche.y2=" + bzb.y2 + " grise.y2=" + bzg.y2);
}

function main() {
  testTableTK();
  testAnglesPremiereEtDerniereGraduation();
  testLongueursEtEpaisseursGraduation();
  testOpaciteLiseretTableManuelle();
  testBarresDuZeroLongueursTableManuelle();
  testSigleBaselineYDecalage36();
  testSoclePositionsSimple();
  testSoclePositionsEmpile();
  testTexteDureeFormatMaquetteBornesPileEtAlentour();
  testEcartAssumeAuDelaDUneHeure();

  console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
  for (const e of _echecs) console.log("  - " + e);
  process.exit(_echecs.length ? 1 : 0);
}

main();
