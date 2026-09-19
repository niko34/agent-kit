"use strict";
/* Harnais headless pour `control-center/web/diagramme.js` — feature-017.
 *
 *     node control-center/web/test_app_diagramme.js
 *
 * Zéro dépendance installée (ADR-0006) : `fs`, `path`, `vm` de la
 * bibliothèque standard Node uniquement — même discipline que
 * `test_app_bug012.js`. Invoqué depuis `test_app_diagramme.py`, qui se
 * saute proprement si `node` est absent.
 *
 * Ce harnais NE CHARGE NI serveur NI journal (PIEGES.md §4 : le journal réel
 * grossit pendant qu'on le mesure) : sept fixtures LITTÉRALES, écrites à la
 * main, couvrent les cas limites de la spec (feature-017, plan de test
 * manuel item 5). Toutes les assertions sont ARITHMÉTIQUES, sur les boîtes
 * retournées par `disposer()` — jamais une relecture de capture d'écran
 * (PIEGES.md §24 : une assertion sur la position du texte source ne prouve
 * rien sur l'effet réellement peint ; ici, on ne teste QUE la géométrie
 * calculée, pas un rendu, donc cette limite ne s'applique pas — mais la
 * même prudence vaut : chaque assertion porte sur un CHAMP du contrat de
 * sortie documenté dans `diagramme.js`, jamais sur une supposition de mise
 * en page qu'il ne documente pas).
 *
 * `diagramme.js` est un module PUR (aucun DOM) : chargé ici tel quel dans un
 * contexte `vm` nu (juste `console`) — pas de bac à sable DOM nécessaire,
 * contrairement à `test_app_bug012.js` et consorts qui évaluent `app.js`.
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

// ------------------------------------------------------------ fixtures ---
function passage(agent, debutIso, dureeMs, options) {
  const o = options || {};
  return {
    agent,
    debut: debutIso,
    duree_ms: dureeMs,
    outils: o.outils || 0,
    fichiers: o.fichiers || [],
    echecs: o.echecs || 0,
    termine: o.termine !== undefined ? o.termine : true,
    etat: o.etat,
    type: o.type || "sousagent",
  };
}

function simultanes(n, debutIso, dureeMs) {
  const passages = [];
  for (let i = 0; i < n; i++) {
    passages.push(passage("agent-" + i, debutIso, dureeMs, { outils: i }));
  }
  return passages;
}

// -- Garde de non-chevauchement des libellés --------------------------------
// ANCIENNE VERSION, TAUTOLOGIQUE (verdict code-reviewer, feature-017) : elle
// ne comparait que des bords dérivés de `creneau.demiLargeur` à d'autres bords
// dérivés du MÊME `creneau.demiLargeur` — la propriété tient PAR CONSTRUCTION
// du placement horizontal de `disposer()` (`x[i] = x[i-1] + demiLargeur[i-1] +
// espaceMin + demiLargeur[i]`), quelle que soit la valeur — même fausse — que
// contient `demiLargeur`. Deux mutations de la formule qui CALCULE
// `demiLargeur` (`diagramme.js:328-329`, la largeur réservée au libellé) ont
// traversé cette garde et produit jusqu'à 78,50 px de recouvrement RÉEL sur
// un journal, sans qu'aucune assertion ne s'en aperçoive :
//
//   function verifierAucunChevauchement(creneaux) {
//     for (let i = 1; i < creneaux.length; i++) {
//       const bordDroitPrecedent = creneaux[i - 1].x + creneaux[i - 1].demiLargeur;
//       const bordGaucheCourant = creneaux[i].x - creneaux[i].demiLargeur;
//       if (bordDroitPrecedent > bordGaucheCourant + 1e-9) return false;
//     }
//     return true;
//   }
//
// NOUVELLE VERSION : reconstitue la boîte RÉELLEMENT peinte par
// `construireSoclesCreneau` (app.js, ~lignes 898-918) — cercle + graduations
// PLUS libellé — à partir de `agentGeo.cx`/`rayon` et des textes d'ORIGINE
// (`passages[]`), avec les MÊMES décalages (10 px, 16 px) et le MÊME mode
// d'ancrage (centré pour un créneau simple, à droite du cercle pour un
// créneau empilé) que le code de peinture. Le champ `demiLargeur` n'intervient
// JAMAIS dans le calcul de la boîte : si la réservation d'espace (calculée par
// `disposer()`) est trop courte pour ce que peint réellement `app.js`, les
// boîtes indépendamment reconstruites ici se chevauchent, et la garde le voit.
//
// `texteDuree` n'est PAS appelée ici via `disposer.texteDuree` : c'est
// exactement cette délégation qui a rendu la garde aveugle une première fois
// (correctif code-reviewer, feature-017) — tant que la fonction testée ET la
// fonction de reconstruction partagent le même code, les deux s'accordent
// toujours entre elles, même quand ce code diverge de ce que `app.js` peint
// RÉELLEMENT (formule indépendante, ligne 900-901 de `app.js`). La branche
// « pas de durée mesurable » est donc recopiée ICI À LA MAIN, à l'identique
// de `app.js` ; seul le formatage numérique (jamais en cause) reste délégué.
// feature-020 : contrat élargi — `app.js` ne recalcule plus AUCUN texte de
// socle (heure/durée/nom), il peint VERBATIM `agentGeo.socle.lignes[]`
// (texte, x, baselineY, taillePx, ancrage), tous produits par `disposer()`
// (A7). La boîte reconstruite ici lit donc CES CHAMPS directement — plus
// aucune reconstruction indépendante de `texteDuree`/`texteHeure` (l'ancien
// piège PIEGES.md §30 disparaît avec la duplication qui le permettait : il
// n'y a plus qu'UNE SEULE production de ces textes, et cette garde la relit
// telle quelle, jamais recalculée). Seule `disposer.largeurTexte` (estimateur
// de largeur PARTAGÉ par la réservation d'espace ET par cette vérification)
// reste un heuristique commun — c'est la même prudence que l'ancien fichier :
// ni `demiGauche`, ni `demiDroite`, ni `demiLargeur` n'entrent dans ce calcul,
// pour ne jamais rendre la garde tautologique vis-à-vis du placement.
function calculerBoitePeinteCreneau(creneauGeo, mesures) {
  const m = mesures || disposer.MESURES_DEFAUT;
  let xGauche = Infinity;
  let xDroite = -Infinity;
  const etendreAvecLigne = (ligne) => {
    const largeur = disposer.largeurTexte(ligne.texte, ligne.taillePx, m);
    let gauche;
    let droite;
    if (ligne.ancrage === "start") { gauche = ligne.x; droite = ligne.x + largeur; }
    else if (ligne.ancrage === "end") { gauche = ligne.x - largeur; droite = ligne.x; }
    else { gauche = ligne.x - largeur / 2; droite = ligne.x + largeur / 2; }
    xGauche = Math.min(xGauche, gauche);
    xDroite = Math.max(xDroite, droite);
  };
  creneauGeo.agents.forEach((a) => {
    // Cercle + graduations peintes : `rayonExterieurTotal` (rayon + guide +
    // extension de graduation ALLUMÉE, le plus long trait) EST le champ que
    // `disposer()` réserve pour cet effet (A3) — pas une reconstruction
    // séparée depuis `rayon` + une constante recopiée ici.
    xGauche = Math.min(xGauche, a.cx - a.rayonExterieurTotal);
    xDroite = Math.max(xDroite, a.cx + a.rayonExterieurTotal);
    a.socle.lignes.forEach(etendreAvecLigne);
  });
  if (creneauGeo.repliLibelle) etendreAvecLigne(creneauGeo.repliLibelle);
  if (creneauGeo.libelleCadre) {
    const lc = creneauGeo.libelleCadre;
    xGauche = Math.min(xGauche, lc.masque.x);
    xDroite = Math.max(xDroite, lc.masque.x + lc.masque.largeur);
  }
  if (creneauGeo.cadre) {
    xGauche = Math.min(xGauche, creneauGeo.cadre.x);
    xDroite = Math.max(xDroite, creneauGeo.cadre.x + creneauGeo.cadre.largeur);
  }
  return { xGauche, xDroite };
}

function verifierAucunChevauchement(creneaux, mesures) {
  const m = mesures || disposer.MESURES_DEFAUT;
  const boites = creneaux.map((c) => calculerBoitePeinteCreneau(c, m));
  for (let i = 1; i < boites.length; i++) {
    if (boites[i - 1].xDroite > boites[i].xGauche + 1e-9) return false;
  }
  return true;
}

function compterAgentsTotal(creneaux) {
  return creneaux.reduce(
    (total, c) => total + c.agents.length + (c.repli ? c.repli.masques : 0), 0);
}

// -- Fixture 1 : un seul agent — pas de lien, pas de repli -----------------
function testUnSeulAgent() {
  const g = disposer([passage("backend-developer", "2026-09-15T10:00:00.000Z", 5000, { outils: 3 })]);
  check("un_agent_un_seul_creneau", g.creneaux.length === 1, "obtenu " + g.creneaux.length);
  check("un_agent_pas_de_lien", g.liens.length === 0, "obtenu " + g.liens.length);
  check("un_agent_pas_de_repli", g.creneaux[0].repli === null);
  check("un_agent_largeur_positive", g.largeur > 0, "obtenu " + g.largeur);
  check("un_agent_hauteur_positive", g.hauteur > 0, "obtenu " + g.hauteur);
}

// -- Fixture 2 : quatre agents simultanés — un créneau, pas de repli -------
function testQuatreSimultanes() {
  const g = disposer(simultanes(4, "2026-09-15T10:00:00.000Z", 60000));
  check("quatre_simultanes_un_seul_creneau", g.creneaux.length === 1, "obtenu " + g.creneaux.length);
  check("quatre_simultanes_pas_de_repli", g.creneaux[0].repli === null);
  check("quatre_simultanes_quatre_agents_visibles", g.creneaux[0].agents.length === 4,
    "obtenu " + g.creneaux[0].agents.length);
  // Empilement vertical : quatre ordonnées DISTINCTES, jamais côte à côte
  // (une seule abscisse pour tout le créneau).
  const abscisses = new Set(g.creneaux[0].agents.map((a) => a.cx));
  const ordonnees = new Set(g.creneaux[0].agents.map((a) => a.cy));
  check("quatre_simultanes_une_seule_abscisse", abscisses.size === 1, "obtenu " + abscisses.size);
  check("quatre_simultanes_quatre_ordonnees_distinctes", ordonnees.size === 4, "obtenu " + ordonnees.size);
}

// -- Fixture 3 : cinq simultanés — repli à quatre plus un ------------------
function testCinqSimultanesRepli() {
  const g = disposer(simultanes(5, "2026-09-15T10:00:00.000Z", 60000));
  const c = g.creneaux[0];
  check("cinq_simultanes_un_seul_creneau", g.creneaux.length === 1);
  check("cinq_simultanes_quatre_visibles", c.agents.length === 4, "obtenu " + c.agents.length);
  check("cinq_simultanes_repli_plus_un", !!c.repli && c.repli.masques === 1,
    "obtenu : " + JSON.stringify(c.repli));
}

// -- Fixture 4 : six simultanés — repli à quatre plus deux -----------------
function testSixSimultanesRepli() {
  const g = disposer(simultanes(6, "2026-09-15T10:00:00.000Z", 60000));
  const c = g.creneaux[0];
  check("six_simultanes_quatre_visibles", c.agents.length === 4, "obtenu " + c.agents.length);
  check("six_simultanes_repli_plus_deux", !!c.repli && c.repli.masques === 2,
    "obtenu : " + JSON.stringify(c.repli));
}

// -- Fixture 5 : agent à zéro appel d'outil — anneau fantôme sans graduation
// allumée, mais un total de graduations toujours strictement positif -------
function testZeroAppelOutil() {
  const g = disposer([passage("debugger", "2026-09-15T10:00:00.000Z", 30000, { outils: 0 })]);
  const a = g.creneaux[0].agents[0];
  check("zero_outil_zero_graduation_allumee", a.graduationsAllumees === 0,
    "obtenu " + a.graduationsAllumees);
  check("zero_outil_anneau_fantome_present", a.graduationsTotal > 0,
    "obtenu " + a.graduationsTotal);
  check("zero_outil_pas_de_plafond", a.plafondAtteint === false);
}

// -- Fixture 5bis : plafond mesuré (143 appels, échelle 70) — toutes les
// graduations sont allumées, le plafond est atteint -------------------------
function testPlafondOutilsMesure() {
  const g = disposer([passage("test-engineer", "2026-09-15T10:00:00.000Z", 300000, { outils: 143 })]);
  const a = g.creneaux[0].agents[0];
  check("plafond_143_toutes_graduations_allumees", a.graduationsAllumees === a.graduationsTotal,
    "obtenu " + a.graduationsAllumees + "/" + a.graduationsTotal);
  check("plafond_143_plafond_atteint", a.plafondAtteint === true);
}

// -- Fixture 6 : écarts 119 000 / 120 000 / 121 000 ms — le seuil de
// pastille d'attente est STRICT (> 120 000 ms, jamais >=) -------------------
function testSeuilAttenteStrict() {
  function deuxSequentiels(ecartMs) {
    const debut1 = Date.parse("2026-09-15T10:00:00.000Z");
    const duree1 = 10000;
    const debut2 = debut1 + duree1 + ecartMs;
    return [
      passage("spec-reader", new Date(debut1).toISOString(), duree1, {}),
      passage("architect", new Date(debut2).toISOString(), 10000, {}),
    ];
  }
  [
    [119000, false],
    [120000, false],   // égal au seuil : PAS de pastille (strict >)
    [121000, true],
  ].forEach(([ecart, attendu]) => {
    const g = disposer(deuxSequentiels(ecart));
    check("ecart_" + ecart + "ms_creneaux_distincts", g.creneaux.length === 2,
      "obtenu " + g.creneaux.length);
    // `pastille` est `null | { largeur, hauteur, texte }` (bug-020) — jamais
    // un booléen : ce test épingle sa PRÉSENCE, pas sa forme.
    check("ecart_" + ecart + "ms_pastille_" + attendu, (g.liens[0].pastille !== null) === attendu,
      "obtenu : " + JSON.stringify(g.liens[0]));
    check("ecart_" + ecart + "ms_attente_mesuree", g.liens[0].attenteMs === ecart,
      "obtenu " + g.liens[0].attenteMs);
  });
}

// -- Gabarit de pastille FIXE (86×18, rx 9) — épinglé en LITTÉRAL, jamais
// lu depuis `disposer.MESURES_DEFAUT` : les tests de non-recouvrement
// (ci-dessous) restent verts même si le gabarit rétrécit, tant que la marge
// réservée (`pastilleReservePx`, une constante SÉPARÉE) reste large — le
// gabarit lui-même n'a donc pas d'autre garde. Correction de mesure
// documentée dans `diagramme.js` : le 54×18 de la maquette déborde son
// propre texte (« attente 4m » fait 58,61 px) — le kit fixe donc 86×18,
// jamais mesuré au rendu.
function testPastilleGabaritFixe() {
  const debut1 = Date.parse("2026-09-15T10:00:00.000Z");
  const passages = [
    passage("spec-reader", new Date(debut1).toISOString(), 10000, {}),
    passage("architect", new Date(debut1 + 10000 + 15 * 60 * 1000).toISOString(), 10000, {}),
  ];
  const g = disposer(passages);
  const pastille = g.liens[0].pastille;
  check("pastille_gabarit_presente", pastille !== null, JSON.stringify(g.liens[0]));
  if (!pastille) return;
  check("pastille_gabarit_largeur_86", pastille.largeur === 86, "obtenu " + pastille.largeur);
  check("pastille_gabarit_hauteur_18", pastille.hauteur === 18, "obtenu " + pastille.hauteur);
  check("pastille_gabarit_rx_9", pastille.rx === 9, "obtenu " + pastille.rx);
}

// -- bug-020 : la pastille ne recouvre jamais le créneau voisin ------------
// L'espace RÉSERVÉ entre deux créneaux (par le placement horizontal) doit
// toujours pouvoir loger la largeur RENDUE de la pastille — sinon elle
// déborde sur le libellé du créneau suivant (défaut mesuré : réservation
// fixe de 46 px contre une pastille réelle de 78 à 98 px).
function testPastilleNeRecouvrePasLeVoisin() {
  function deuxSequentiels(ecartMs, agentLong) {
    const debut1 = Date.parse("2026-09-15T10:00:00.000Z");
    const duree1 = 10000;
    const debut2 = debut1 + duree1 + ecartMs;
    return [
      passage("spec-reader", new Date(debut1).toISOString(), duree1, {}),
      passage(agentLong, new Date(debut2).toISOString(), 10000, {}),
    ];
  }
  // Un nom d'agent long pousse aussi la largeur de la pastille estimée dans
  // l'ancien code (`texte.length * 6.5`) à ne rien changer : la largeur de la
  // pastille dépend du TEXTE D'ATTENTE (une durée), pas du nom de l'agent —
  // c'est justement ce qui rendait le forfait fixe insuffisant pour de
  // longues attentes (ex. « ⏳ 12 min 34 s »).
  const g = disposer(deuxSequentiels(15 * 60 * 1000, "code-reviewer"));
  const lien = g.liens[0];
  check("pastille_presente_pour_ce_test", lien.pastille !== null,
    "obtenu : " + JSON.stringify(lien));
  if (lien.pastille) {
    const creneauA = g.creneaux[0];
    const creneauB = g.creneaux[1];
    // bug-021 : comparer `pastille.largeur` à un « espace disponible » qui
    // se DÉRIVE de cette même largeur (`gapSupplementaire`, dans
    // `disposer()`) est une garde MORTE — l'inégalité tient par construction,
    // quelle que soit la position réellement peinte. La garde qui vaut
    // teste le RECTANGLE PEINT (celui qu'`app.js` dessine : `x ±
    // largeur/2`, exactement sa formule) contre les bords RÉELS du créneau
    // (`creneau.bordGauche`/`bordDroit`, feature-020 défaut P) — jamais
    // `demiLargeur` (alias symétrique conservé pour compatibilité, mais
    // explicitement écarté du positionnement par le contrat), et jamais un
    // milieu entre bords de CERCLE (l'ancien défaut, bug-021).
    const bordDroitA = creneauA.bordDroit;
    const bordGaucheB = creneauB.bordGauche;
    const cx = lien.pastille.x;
    check("pastille_cx_defini", typeof cx === "number" && Number.isFinite(cx), "obtenu " + cx);
    const gaucheRect = cx - lien.pastille.largeur / 2;
    const droiteRect = cx + lien.pastille.largeur / 2;
    check("pastille_rect_peint_ne_deborde_pas_a_gauche", gaucheRect >= bordDroitA - 1e-9,
      "gauche rect " + gaucheRect + ", bord droit créneau A " + bordDroitA);
    check("pastille_rect_peint_ne_deborde_pas_a_droite", droiteRect <= bordGaucheB + 1e-9,
      "droite rect " + droiteRect + ", bord gauche créneau B " + bordGaucheB);
    check("pastille_largeur_positive", lien.pastille.largeur > 0);
    check("pastille_hauteur_positive", lien.pastille.hauteur > 0);
    check("pastille_texte_non_vide", typeof lien.pastille.texte === "string" && lien.pastille.texte.length > 0);
  }
}

// -- bug-021 : la pastille reste dans l'espace réservé quand le créneau
// voisin est EMPILÉ (agents simultanés) ------------------------------------
// Cas absent de la fixture ci-dessus (deux créneaux à un seul agent chacun) :
// pour un créneau empilé à labels longs, `demiLargeur` (bords de créneau,
// utilisés par `disposer()`) dépasse largement `rayon + 4` (bords de CERCLE
// du plus grand agent, ce qu'utilisait l'ancien code d'`app.js` pour
// recalculer une abscisse) — c'est précisément ce qui rendait les deux
// abscisses divergentes, et la pastille peinte hors de l'espace réservé
// (défaut mesuré : recouvrement de 28,3 px sur un journal réel, cycle 10,
// 63 segments).
function testPastilleAdjacenteACreneauEmpileNeDeborde() {
  const debut1 = Date.parse("2026-09-15T10:00:00.000Z");
  const duree1 = 45000;
  const debut2 = debut1 + duree1 + 15 * 60 * 1000;
  const passages = [
    passage("backend-developer", new Date(debut1).toISOString(), duree1, { outils: 12 }),
    passage("frontend-developer", new Date(debut1).toISOString(), duree1, { outils: 8 }),
    passage("security-reviewer", new Date(debut1).toISOString(), duree1, { outils: 20 }),
    passage("test-engineer", new Date(debut2).toISOString(), 10000, {}),
  ];
  const g = disposer(passages);
  check("empile_deux_creneaux", g.creneaux.length === 2, "obtenu " + g.creneaux.length);
  const creneauA = g.creneaux[0];
  const creneauB = g.creneaux[1];
  check("empile_creneau_a_bien_empile", creneauA.agents.length === 3,
    "obtenu " + creneauA.agents.length);
  const lien = g.liens[0];
  check("empile_pastille_presente", lien.pastille !== null, JSON.stringify(lien));
  if (!lien.pastille) return;

  const bordDroitA = creneauA.bordDroit;
  const bordGaucheB = creneauB.bordGauche;
  const cx = lien.pastille.x;
  check("empile_pastille_cx_defini", typeof cx === "number" && Number.isFinite(cx), "obtenu " + cx);
  const gaucheRect = cx - lien.pastille.largeur / 2;
  const droiteRect = cx + lien.pastille.largeur / 2;
  check("empile_pastille_rect_peint_ne_deborde_pas_a_gauche", gaucheRect >= bordDroitA - 1e-9,
    "gauche rect " + gaucheRect + ", bord droit créneau A " + bordDroitA);
  check("empile_pastille_rect_peint_ne_deborde_pas_a_droite", droiteRect <= bordGaucheB + 1e-9,
    "droite rect " + droiteRect + ", bord gauche créneau B " + bordGaucheB);

  // Le cas est DISCRIMINANT : preuve que l'ancien calcul (milieu entre bords
  // de CERCLE) et le nouveau (milieu entre bords de CRÉNEAU) ne coïncident
  // PAS ici — sinon cette fixture ne prouverait rien de plus que la
  // précédente (deux créneaux à un seul agent, où les deux bords coïncident
  // à peu près).
  const rA = Math.max(...creneauA.agents.map((a) => a.rayon));
  const rB = Math.max(...creneauB.agents.map((a) => a.rayon));
  const cxAncien = ((creneauA.x + rA + 4) + (creneauB.x - rB - 4)) / 2;
  check("empile_ancien_calcul_bien_different_du_nouveau",
    Math.abs(cxAncien - cx) > 1, "ancien " + cxAncien + ", nouveau " + cx);
}

// -- Noms très longs sur créneau EMPILÉ — discriminant pour la branche
// « empilé » de l'exigence de `demiLargeur` (`diagramme.js:328`, exigence =
// `rayonEtendu + espaceLabelPx + libelleMax`). Une mutation qui rogne ou
// oublie `libelleMax` sur cette branche réserve un espace bien plus étroit
// que ce que peint réellement `app.js` — le nom, ici, domine largement le
// rayon (courtes durées, donc petits cercles), pour que l'écart soit sans
// ambiguïté.
function testLibellesEmpilesNomsLongsPasDeChevauchement() {
  const debut1 = Date.parse("2026-09-15T10:00:00.000Z");
  const duree1 = 3000; // rayon minimal : le libellé domine la demi-largeur
  const passages = [
    passage("un-agent-au-nom-extraordinairement-long-pour-le-test", new Date(debut1).toISOString(), duree1, { outils: 4 }),
    passage("un-autre-agent-au-nom-tout-aussi-demesurement-long", new Date(debut1).toISOString(), duree1, { outils: 9 }),
    passage("court", new Date(debut1 + 200000).toISOString(), duree1, { outils: 1 }),
  ];
  const g = disposer(passages);
  check("empile_noms_longs_deux_creneaux", g.creneaux.length === 2, "obtenu " + g.creneaux.length);
  check("empile_noms_longs_premier_creneau_bien_empile", g.creneaux[0].agents.length === 2,
    "obtenu " + g.creneaux[0].agents.length);
  check("empile_noms_longs_aucun_chevauchement",
    verifierAucunChevauchement(g.creneaux),
    "boîtes : " + JSON.stringify(g.creneaux.map((c) => calculerBoitePeinteCreneau(c, disposer.MESURES_DEFAUT))));
}

// -- Nom très long sur créneau SIMPLE — discriminant pour la branche
// « simple » de l'exigence (`diagramme.js:329`, exigence =
// `Math.max(rayonEtendu, demiLibelle)`). Une mutation qui neutralise
// `demiLibelle` (ex. ne retenir que `rayonEtendu`) réserve un espace qui ne
// suit plus du tout le nom — encore une fois, un petit rayon (courte durée)
// et un nom long rendent l'écart sans ambiguïté.
function testLibelleSimpleNomTresLongPasDeChevauchement() {
  const debut1 = Date.parse("2026-09-15T10:00:00.000Z");
  const passages = [
    passage("un-agent-dont-le-nom-a-lui-seul-depasse-tout-le-reste-de-la-boite", new Date(debut1).toISOString(), 3000, { outils: 2 }),
    passage("suivant", new Date(debut1 + 5000).toISOString(), 3000, { outils: 1 }),
  ];
  const g = disposer(passages);
  check("simple_nom_long_deux_creneaux", g.creneaux.length === 2, "obtenu " + g.creneaux.length);
  check("simple_nom_long_aucun_chevauchement",
    verifierAucunChevauchement(g.creneaux),
    "boîtes : " + JSON.stringify(g.creneaux.map((c) => calculerBoitePeinteCreneau(c, disposer.MESURES_DEFAUT))));
}

// -- Fixture 7 : 186 passages (pire cas mesuré, PIEGES.md/spec) — aucun
// chevauchement de boîte, aucun agent perdu en silence ----------------------
function genererCycleLong(nTotal) {
  const passages = [];
  let curDebutMs = Date.parse("2026-09-15T09:00:00.000Z");
  const tailles = [1, 2, 1, 3, 1, 1, 5, 1, 2, 1, 4, 1, 1, 1, 6, 1, 2, 1];
  let indiceTaille = 0;
  let compte = 0;
  while (compte < nTotal) {
    const taille = Math.min(tailles[indiceTaille % tailles.length], nTotal - compte);
    indiceTaille++;
    const debutGroupeIso = new Date(curDebutMs).toISOString();
    let dureeMaxGroupe = 0;
    for (let k = 0; k < taille; k++) {
      const outils = (compte * 7) % 90;               // dépasse 70 par endroits
      const dureeMs = 2000 + ((compte * 5333) % 400000);
      const nomAgent = "agent-" + (compte % 9);
      passages.push(passage(nomAgent, debutGroupeIso, dureeMs,
        { outils, fichiers: new Array(compte % 5).fill("fichier.txt") }));
      dureeMaxGroupe = Math.max(dureeMaxGroupe, dureeMs);
      compte++;
    }
    curDebutMs += dureeMaxGroupe + 30000;   // écart garanti après le groupe
  }
  return passages;
}

function testCentQuatreVingtSixPassages() {
  const passages = genererCycleLong(186);
  check("186_passages_generes", passages.length === 186, "obtenu " + passages.length);

  const g = disposer(passages);
  check("186_aucun_chevauchement", verifierAucunChevauchement(g.creneaux));
  check("186_aucun_agent_perdu", compterAgentsTotal(g.creneaux) === 186,
    "obtenu " + compterAgentsTotal(g.creneaux));
  check("186_repli_jamais_au_dela_de_quatre_visibles",
    g.creneaux.every((c) => c.agents.length <= 4),
    "creneau(x) en défaut : " + g.creneaux.filter((c) => c.agents.length > 4).length);
  check("186_largeur_et_hauteur_finies",
    Number.isFinite(g.largeur) && Number.isFinite(g.hauteur) && g.largeur > 0 && g.hauteur > 0);
}

// ----------------------------------------------------- rebouclage (arcs) --
function testRebouclageEntreOccurrencesDuMemeAgent() {
  const passages = [
    passage("test-engineer", "2026-09-15T10:00:00.000Z", 5000),
    passage("debugger", "2026-09-15T10:00:10.000Z", 5000),
    passage("test-engineer", "2026-09-15T10:00:20.000Z", 5000),
  ];
  const g = disposer(passages);
  check("rebouclage_un_seul_arc", g.arcs.length === 1, "obtenu " + g.arcs.length);
  if (g.arcs.length === 1) {
    check("rebouclage_relie_les_deux_occurrences_du_meme_agent",
      g.arcs[0].dePassage === 0 && g.arcs[0].aPassage === 2 && g.arcs[0].agent === "test-engineer",
      "obtenu : " + JSON.stringify(g.arcs[0]));
  }
}

// -- Seuil d'attente épinglé sur la CONSTANTE, pas sur sa valeur recopiée --
// Deux fixtures à 1000 ms d'écart (119000/120000/121000) ne détectent pas un
// décalage d'1 ms du seuil : `120000 -> 120001` ne fait basculer AUCUN des
// trois cas ci-dessus (119000 et 120000 restent `false`, 121000 reste
// `true`). Ce test lit `disposer.MESURES_DEFAUT.seuilAttenteMs` (l'artefact
// livré, PIEGES.md §21) et teste EXACTEMENT à la frontière et à la frontière
// + 1 ms — immunisé contre la valeur numérique elle-même, il tue tout
// décalage d'un seul milliseconde, dans un sens comme dans l'autre.
function testSeuilAttenteEpingleSurLaConstante() {
  const seuil = disposer.MESURES_DEFAUT.seuilAttenteMs;
  check("seuil_constante_positive", typeof seuil === "number" && seuil > 0, "obtenu " + seuil);
  // Valeur exigée par la spec (feature-017, item 5 : « au-delà de deux
  // minutes ») — hardcodée à dessein : ce n'est pas une énumération à lire
  // depuis un artefact (PIEGES.md §21), c'est une règle métier documentée.
  // Sans cette ligne, un décalage du SEUIL LUI-MÊME (120000 -> 120001) est
  // invisible : la paire pile/pile+1 ci-dessous ne teste que la STRICTE
  // inégalité, pas la valeur — elle serait relue en 120001 et resterait
  // cohérente avec elle-même sans jamais alerter personne.
  check("seuil_vaut_exactement_deux_minutes", seuil === 2 * 60 * 1000, "obtenu " + seuil);

  function deuxSequentiels(ecartMs) {
    const debut1 = Date.parse("2026-09-15T10:00:00.000Z");
    const duree1 = 10000;
    const debut2 = debut1 + duree1 + ecartMs;
    return [
      passage("spec-reader", new Date(debut1).toISOString(), duree1, {}),
      passage("architect", new Date(debut2).toISOString(), 10000, {}),
    ];
  }

  const gPile = disposer(deuxSequentiels(seuil));
  check("seuil_pile_a_la_frontiere_pas_de_pastille", gPile.liens[0].pastille === null,
    "obtenu : " + JSON.stringify(gPile.liens[0]) + " (seuil=" + seuil + ")");

  const gUnDeLa = disposer(deuxSequentiels(seuil + 1));
  check("seuil_plus_un_ms_pastille", gUnDeLa.liens[0].pastille !== null,
    "obtenu : " + JSON.stringify(gUnDeLa.liens[0]) + " (seuil=" + seuil + ")");
}

// -- Un échec ne s'affiche jamais par-dessus « sans clôture » -------------
// Invariant documenté (docs/DESIGN-SYSTEM.md §8, feature-017 item 7) : une
// fin sans annonce n'est ni un succès ni un échec. Épinglé sur LES DEUX
// champs du contrat de sortie (`echec`, `sansCloture`), jamais un seul —
// un passage `sans_cloture` qui porte aussi `echecs > 0` (agent tué en plein
// appel d'outil, cas réel) doit rester `sansCloture: true, echec: false`.
function testEchecJamaisCumuleAvecSansCloture() {
  const gSansClotureAvecEchecs = disposer([
    passage("debugger", "2026-09-15T10:00:00.000Z", 30000, { etat: "sans_cloture", echecs: 2 }),
  ]);
  const a1 = gSansClotureAvecEchecs.creneaux[0].agents[0];
  check("sans_cloture_avec_echecs_reste_sans_cloture", a1.sansCloture === true, "obtenu " + a1.sansCloture);
  check("sans_cloture_avec_echecs_jamais_echec", a1.echec === false, "obtenu " + a1.echec);

  // Contrôle : un échec SANS sans-clôture reste bien signalé comme échec —
  // sinon une neutralisation totale de `estEchec` passerait aussi ce test.
  const gEchecSeul = disposer([
    passage("debugger", "2026-09-15T10:00:00.000Z", 30000, { etat: "termine", echecs: 2 }),
  ]);
  const a2 = gEchecSeul.creneaux[0].agents[0];
  check("echec_seul_sans_sans_cloture_est_bien_echec", a2.echec === true, "obtenu " + a2.echec);
  check("echec_seul_pas_sans_cloture", a2.sansCloture === false, "obtenu " + a2.sansCloture);
}

// -- Priorité de `contourRole` : ÉCHEC avant EN COURS -----------------------
// `estEchec`/`estEnCours` ne s'excluent PAS mutuellement (contrairement à
// échec/sans-clôture, ou sans-clôture/en-cours, qui le sont par construction
// du champ `etat`) : un agent peut porter `echecs > 0` ET `etat: "en_cours"`
// en même temps (un appel d'outil a déjà échoué pendant que l'agent tourne
// toujours). C'est le SEUL couple de rôles où l'ordre du ternaire
// (`echec ? ... : sansCloture ? ... : enCours ? ...`) a un effet observable
// — une inversion ÉCHEC/EN COURS spécifiquement (contrairement à
// ÉCHEC/SANS-CLÔTURE ou SANS-CLÔTURE/EN-COURS, des mutants ÉQUIVALENTS ici,
// jamais atteignables avec les champs actuels) change réellement le rendu.
function testPrioriteContourRoleEchecAvantEnCours() {
  const g = disposer([
    passage("test-engineer", "2026-09-15T10:00:00.000Z", 5000,
      { echecs: 2, etat: "en_cours", termine: false }),
  ]);
  const a = g.creneaux[0].agents[0];
  check("priorite_echec_et_en_cours_tous_deux_vrais",
    a.echec === true && a.enCours === true,
    "echec=" + a.echec + " enCours=" + a.enCours);
  check("priorite_contourRole_est_echec", a.contourRole === "echec", "obtenu " + a.contourRole);
  check("priorite_contourLargeur_est_celle_de_l_echec", a.contourLargeur === 2, "obtenu " + a.contourLargeur);
}

// -- bug-020 : l'arc de rebouclage tient dans le cadre --------------------
// feature-020 (défaut R) a retiré `arcHauteurMaxPx` du contrat : le sommet
// de l'arc est désormais un ABSOLU (`sommetY`, 16px), commun à tout arc quelle
// que soit la distance horizontale — c'est `margeHaut` (38px avec arcs) qui
// garantit que ce sommet fixe reste dans le cadre (`y >= 0`).
function testArcDeRebouclageTientDansLeCadre() {
  const debut = Date.parse("2026-09-15T10:00:00.000Z");
  let t = debut;
  const passages = [passage("test-engineer", new Date(t).toISOString(), 5000)];
  t += 5000;
  // Neuf agents intercalés, assez espacés pour que l'écart horizontal entre
  // les deux occurrences de `test-engineer` soit largement suffisant pour
  // révéler une régression si `sommetY` recommençait à dépendre de cet écart.
  for (let i = 0; i < 9; i++) {
    t += 400000;   // grand écart : chaque créneau est loin du précédent
    passages.push(passage("agent-" + i, new Date(t).toISOString(), 5000));
  }
  t += 400000;
  passages.push(passage("test-engineer", new Date(t).toISOString(), 5000));

  const g = disposer(passages);
  // ⚠️ Littéraux (16, 38, 4), jamais relus depuis `disposer.MESURES_DEFAUT` :
  // comparer `arc.sommetY` à `m.arcSommetYPx` serait tautologique sous une
  // mutation de CETTE constante précise (les deux côtés se déplaceraient
  // ensemble). Ces trois nombres sont documentés en commentaire du contrat
  // (`diagramme.js` : « sommetY, 16, ABSOLU » ; « margeHaut, 38 si des arcs
  // existent, sinon 24 »).
  const SOMMET_Y_ATTENDU = 16;
  const MARGE_HAUT_AVEC_ARCS_ATTENDUE = 38;
  const ARC_LIBELLE_DECALAGE_ATTENDU = 4;
  check("arc_long_un_seul_arc", g.arcs.length === 1, "obtenu " + g.arcs.length);
  // feature-020 (défaut R/bug-020) : `sommetY` est désormais un ABSOLU commun
  // à tout arc — plus de recalcul de hauteur par paire d'agents (`hauteurArc`
  // a disparu du contrat). C'est `margeHaut` qui garantit que ce sommet fixe
  // reste dans le cadre, quelle que soit la distance horizontale entre les
  // deux occurrences.
  check("arc_long_marge_haut_avec_arcs", g.margeHaut === MARGE_HAUT_AVEC_ARCS_ATTENDUE,
    "obtenu " + g.margeHaut);
  if (g.arcs.length === 1) {
    const arc = g.arcs[0];
    check("arc_long_sommet_constant", arc.sommetY === SOMMET_Y_ATTENDU,
      "obtenu " + arc.sommetY);
    check("arc_long_controles_au_sommet",
      arc.controle1.y === arc.sommetY && arc.controle2.y === arc.sommetY,
      "obtenu " + JSON.stringify([arc.controle1.y, arc.controle2.y]));
    // La vraie encre la plus haute est le libellé "↻ reboucle", posé à
    // `sommetY - arcLibelleDecalagePx` avec un ascendant mesuré au
    // navigateur (~10px) — le garde-fou teste que ce sommet ET son libellé
    // restent tous deux dans le cadre (y >= 0), quelle que soit la distance
    // horizontale entre les deux occurrences (ici : neuf agents intercalés,
    // largement plus loin que ce qu'un ancien calcul par paire plafonnait).
    const ASCENDANT_LIBELLE = 10;
    check("arc_long_libelle_baseline_attendue",
      arc.libelle.baselineY === SOMMET_Y_ATTENDU - ARC_LIBELLE_DECALAGE_ATTENDU,
      "obtenu " + arc.libelle.baselineY);
    const yMinLibelle = arc.libelle.baselineY - ASCENDANT_LIBELLE;
    check("arc_long_sommet_et_libelle_dans_le_cadre", yMinLibelle >= 0,
      "yLibelle=" + yMinLibelle + " (sortirait du cadre si < 0)");
  }
}

// -- Sans rebouclage, la marge haute retombe sur la valeur SANS arc
// (bug-020) : un cadre plus haut que nécessaire persisterait sinon même
// quand aucun arc n'est tracé. Littéral (24), même prudence que ci-dessus.
function testArcAbsentMargeHautReduite() {
  const MARGE_HAUT_SANS_ARCS_ATTENDUE = 24;
  const passages = [
    passage("debugger", "2026-09-15T11:00:00.000Z", 5000),
    passage("test-engineer", "2026-09-15T11:05:00.000Z", 5000),
  ];
  const g = disposer(passages);
  check("arc_absent_marge_haut_sans_arcs",
    g.margeHaut === MARGE_HAUT_SANS_ARCS_ATTENDUE, "obtenu " + g.margeHaut);
  check("arc_absent_aucun_arc", g.arcs.length === 0, "obtenu " + g.arcs.length);
}

function trouverAgentGeo(g, passageIndex) {
  for (const c of g.creneaux) {
    for (const a of c.agents) {
      if (a.passageIndex === passageIndex) return a;
    }
  }
  return null;
}

function testPasDeRebouclageSansIntercalation() {
  // Deux passages consécutifs du MÊME agent, rien entre eux : ce n'est pas
  // un rebouclage (aucun autre agent ne s'est intercalé).
  const passages = [
    passage("debugger", "2026-09-15T11:00:00.000Z", 5000),
    passage("debugger", "2026-09-15T11:05:00.000Z", 5000),
  ];
  const g = disposer(passages);
  check("pas_de_rebouclage_sans_intercalation", g.arcs.length === 0, "obtenu " + g.arcs.length);
}

// -- Fixture 8 (correctif code-reviewer, feature-017) : `duree_ms: null` ET
// `termine: true` — le cas que produit `events.py:426-427` quand `_duree_ms`
// échoue à mesurer une durée pourtant close (`passage["termine"] = True`
// posé juste après, sans condition sur le succès du calcul). `texteDuree`
// doit refléter FIDÈLEMENT `app.js:901` (« durée invalide », PAS « en
// cours ») pour que la réservation d'espace de `disposer()` corresponde à ce
// qui est réellement peint — sinon le créneau suivant recouvre le libellé
// (mesuré : 5,75 px de recouvrement réel sur deux créneaux de production).
function testTermineTrueAvecDureeMissing() {
  const debut1 = Date.parse("2026-09-15T10:00:00.000Z");
  // Les DEUX créneaux portent le cas limite (chacun sous-réservé de la même
  // marge) : la sous-réservation d'un seul créneau (17,5 px) reste absorbée
  // par `espaceMinHorizontalPx` (28 px) et ne recouvre rien — il faut cumuler
  // les deux voisinages pour dépasser cette marge et rendre le recouvrement
  // mesurable (voir le calcul détaillé en commentaire plus haut du fichier).
  const passages = [
    passage("a", new Date(debut1).toISOString(), null, { outils: 1, termine: true }),
    passage("b", new Date(debut1 + 5000).toISOString(), null, { outils: 1, termine: true }),
  ];
  const g = disposer(passages);
  check("termine_true_duree_missing_deux_creneaux", g.creneaux.length === 2, "obtenu " + g.creneaux.length);
  check("termine_true_duree_missing_aucun_chevauchement",
    verifierAucunChevauchement(g.creneaux),
    "boîtes : " + JSON.stringify(g.creneaux.map((c) => calculerBoitePeinteCreneau(c, disposer.MESURES_DEFAUT))));
}

// -- Bornes épinglées (renforcement test-engineer, feature-017) -----------
// Quatre bornes de la spec n'étaient testées qu'AU LARGE de leur seuil, jamais
// PILE dessus : la mutation `>` -> `>=` (ou l'inverse) sur chacune d'elles
// traversait la suite sans faire tomber un seul cas (vérifié par mutation
// réelle sur un clone jetable, 4 survivants sur 11 mutations tentées).

// M2 — `plafondAtteint` (feature-017, item 1 : « un cran de plafond ») : le
// contrat dit `bornes >= m.echelleOutils` (§diagramme.js `calculerGraduations`).
// Sans un cas PILE à `echelleOutils`, `>=` et `>` produisent le même résultat
// sur toute valeur testée ailleurs (69 ou 143).
function testPlafondAtteintBornePileEtJusteEnDessous() {
  const echelle = disposer.MESURES_DEFAUT.echelleOutils;
  const gJusteEnDessous = disposer([
    passage("test-engineer", "2026-09-15T10:00:00.000Z", 60000, { outils: echelle - 1 }),
  ]);
  check("plafond_juste_en_dessous_pas_atteint",
    gJusteEnDessous.creneaux[0].agents[0].plafondAtteint === false,
    "obtenu " + gJusteEnDessous.creneaux[0].agents[0].plafondAtteint + " pour outils=" + (echelle - 1));

  const gPile = disposer([
    passage("test-engineer", "2026-09-15T10:00:00.000Z", 60000, { outils: echelle }),
  ]);
  check("plafond_pile_sur_l_echelle_atteint",
    gPile.creneaux[0].agents[0].plafondAtteint === true,
    "obtenu " + gPile.creneaux[0].agents[0].plafondAtteint + " pour outils=" + echelle);
}

// M9 — `calculerRayon` (feature-020, ADR neuf remplaçant ADR-0025 §1) :
// rayon = rayonBase + rayonCoefficient·√(durée_s), plafonné à `rayonMax`. Le
// seuil où le plafond mord se DÉRIVE algébriquement des trois constantes
// LUES DEPUIS L'ARTEFACT (`disposer.MESURES_DEFAUT`, PIEGES.md §21) — jamais
// recopié en dur — : durée_s = ((rayonMax - rayonBase) / rayonCoefficient)².
// Mesuré (commentaire de `diagramme.js`) : ce seuil vaut 3164,0625 s ; le plus
// long sous-agent d'un journal réel (2560 s) ne l'atteint jamais, d'où
// l'absence de toute fixture existante qui l'aurait sollicité.
// ⚠️ `RAYON_MAX_ATTENDU` est un LITTÉRAL (56, valeur documentée en
// commentaire de `diagramme.js` : « le plafond ne mord qu'à 3164s ») —
// jamais relu depuis `m.rayonMax` : un seuil dérivé de `m.rayonMax` ET
// comparé à `m.rayonMax` serait tautologique sous une mutation de CETTE
// constante précise (les deux côtés de l'égalité se déplaceraient
// ensemble). `rayonBase`/`rayonCoefficient`, eux, sont déjà épinglés en
// littéral ailleurs (`test_app_diagramme_conformite.js`, table E1) — seul
// le plafond manquait d'un pin indépendant.
function testRayonPlafonneAuDelaDuSeuilDerive() {
  const m = disposer.MESURES_DEFAUT;
  const RAYON_MAX_ATTENDU = 56;
  check("rayon_max_vaut_56", m.rayonMax === RAYON_MAX_ATTENDU, "obtenu " + m.rayonMax);
  const seuilS = Math.pow((RAYON_MAX_ATTENDU - m.rayonBase) / m.rayonCoefficient, 2);
  const seuilMs = seuilS * 1000;

  const rayonJusteEnDessous = disposer.calculerRayon(seuilMs - 1000, m);
  check("rayon_juste_en_dessous_du_seuil_pas_encore_plafonne",
    rayonJusteEnDessous < RAYON_MAX_ATTENDU - 1e-6,
    "obtenu " + rayonJusteEnDessous + " (rayonMax attendu=" + RAYON_MAX_ATTENDU + ")");

  const rayonPile = disposer.calculerRayon(seuilMs, m);
  check("rayon_pile_sur_le_seuil_egale_rayon_max",
    Math.abs(rayonPile - RAYON_MAX_ATTENDU) < 1e-6, "obtenu " + rayonPile);

  const rayonAuDela = disposer.calculerRayon(seuilMs * 3, m);
  check("rayon_trois_fois_le_seuil_reste_plafonne_a_rayon_max",
    Math.abs(rayonAuDela - RAYON_MAX_ATTENDU) < 1e-9,
    "obtenu " + rayonAuDela + " (rayonMax attendu=" + RAYON_MAX_ATTENDU + ") — un plafond neutralisé dépasserait rayonMax");
}

// M10 — `texteDuree` (contrat exposé, formatage lu par le socle heure / durée
// / nom) : format ALIGNÉ SUR LA MAQUETTE (feature-020, D8) depuis le
// 2026-09-16 — la bascule "N s" -> "M min SS" se fait sur LA SECONDE ARRONDIE
// (`Math.round(dureeMs/1000)`), pas sur le ms brut. 59999 ms ET 60000 ms
// arrondissent TOUS LES DEUX à s=60 et donnent donc désormais le MÊME
// résultat — ce qui distingue encore les deux cas d'un `Math.floor` (qui
// laisserait 59999 ms à s=59, donc "59 s") : ce test tue une mutation
// round -> floor à cette frontière précise, que les deux valeurs isolément
// ne suffiraient pas à couvrir.
function testTexteDureeBasculeMinutesPileAuSeuil() {
  check("texte_duree_59999ms_arrondit_a_60s_et_bascule",
    disposer.texteDuree(59999) === "1 min 00", "obtenu " + disposer.texteDuree(59999));
  check("texte_duree_60000ms_bascule_en_minutes",
    disposer.texteDuree(60000) === "1 min 00", "obtenu " + disposer.texteDuree(60000));
}

// M11 — fusion des créneaux (`construireCreneaux`, §5 « agents simultanés »)
// : la condition de chevauchement est STRICTE (`debutMs < finMaxCourante`).
// Deux passages parfaitement adossés (le second démarre exactement quand le
// premier finit) ne doivent PAS fusionner — aucune fixture existante ne
// plaçait le second passage pile sur la fin du premier (toujours un écart net
// ou un recouvrement net).
function testDeuxPassagesAdossesPileNeFusionnentPas() {
  const debut1 = Date.parse("2026-09-15T10:00:00.000Z");
  const duree1 = 10000;
  const passages = [
    passage("spec-reader", new Date(debut1).toISOString(), duree1, {}),
    // Démarre exactement à `debut1 + duree1` (fin du précédent) : adossé,
    // pas chevauchant.
    passage("architect", new Date(debut1 + duree1).toISOString(), 5000, {}),
  ];
  const g = disposer(passages);
  check("adosses_pile_deux_creneaux_distincts", g.creneaux.length === 2,
    "obtenu " + g.creneaux.length);
}

// -- E2 (A1-A3) : angles, longueurs et épaisseurs de graduation, sur les
// TROIS bandes de rayon — hand-calc depuis les constantes de l'artefact,
// jamais dérivé de `calculerGraduations`/`finaliserPositionAgent` eux-mêmes.
// ⚠️ Les nombres comparés ci-dessous sont des LITTÉRAUX (2.4, 4.8, 4, 7,
// 3.2, 1.8, 1) — jamais relus depuis `disposer.MESURES_DEFAUT` : comparer
// une valeur CALCULÉE à partir d'une constante à cette MÊME constante
// relue dans l'artefact serait tautologique (toujours vrai, y compris sous
// une mutation de la constante elle-même). Seuls `rayonBase`/
// `rayonCoefficient`/`echelleOutils` sont lus depuis `m` — UNIQUEMENT pour
// construire la fixture (choisir une durée qui vise un rayon, un nombre
// d'outils qui sature l'échelle), jamais comme valeur ATTENDUE ; le test de
// conformité E1 (`test_app_diagramme_conformite.js`) reprend ces mêmes
// nombres, également en dur, depuis `pose()` de la maquette.
function testGraduationsAnglesLongueursEpaisseurs() {
  const m = disposer.MESURES_DEFAUT;
  const DEPART_DEG = 2.4;
  const ECART_FERMETURE_DEG = 4.8;
  const GUIDE_DECALAGE_PX = 4;
  function pointAttendu(cx, cy, rayon, angleDeg) {
    const rad = (angleDeg * Math.PI) / 180;
    return { x: cx + rayon * Math.sin(rad), y: cy - rayon * Math.cos(rad) };
  }
  function verifierBande(nomBande, dureeMs, outils, tkAttendu) {
    const g = disposer([passage("agent-" + nomBande, "2026-09-15T10:00:00.000Z", dureeMs, { outils })]);
    const a = g.creneaux[0].agents[0];
    check(nomBande + "_TK_attendu", a.graduationsTotal === tkAttendu,
      "rayon=" + a.rayon + " obtenu TK=" + a.graduationsTotal + " attendu " + tkAttendu);
    const pasAttendu = (360 - ECART_FERMETURE_DEG) / tkAttendu;
    check(nomBande + "_depart_2_4_degres", a.graduationDepartDeg === DEPART_DEG,
      "obtenu " + a.graduationDepartDeg);
    check(nomBande + "_pas_attendu", Math.abs(a.graduationPasDeg - pasAttendu) < 1e-9,
      "obtenu " + a.graduationPasDeg);

    const angleDernier = DEPART_DEG + (tkAttendu - 1) * pasAttendu;
    const r0 = a.rayon + GUIDE_DECALAGE_PX;
    const premiereAttendu = pointAttendu(a.cx, a.cy, r0, DEPART_DEG);
    const derniereAttendu = pointAttendu(a.cx, a.cy, r0, angleDernier);
    const premiere = a.graduations[0];
    const derniere = a.graduations[a.graduations.length - 1];
    check(nomBande + "_premiere_graduation_position",
      Math.abs(premiere.x1 - premiereAttendu.x) < 1e-6 && Math.abs(premiere.y1 - premiereAttendu.y) < 1e-6,
      "obtenu (" + premiere.x1 + "," + premiere.y1 + ") attendu (" + premiereAttendu.x + "," + premiereAttendu.y + ")");
    check(nomBande + "_derniere_graduation_position",
      Math.abs(derniere.x1 - derniereAttendu.x) < 1e-6 && Math.abs(derniere.y1 - derniereAttendu.y) < 1e-6,
      "obtenu (" + derniere.x1 + "," + derniere.y1 + ") attendu (" + derniereAttendu.x + "," + derniereAttendu.y + ")");
    return a;
  }

  verifierBande("bande_r_inf_22", 100, 0, 24);
  function dureeMsPourRayon(rayonVise) {
    const s = Math.pow((rayonVise - m.rayonBase) / m.rayonCoefficient, 2);
    return s * 1000;
  }
  const aMoyen = verifierBande("bande_r_22_a_32", dureeMsPourRayon(25), m.echelleOutils, 36);
  check("bande_r_22_a_32_rayon_dans_la_bande", aMoyen.rayon >= 22 && aMoyen.rayon < 32, "obtenu " + aMoyen.rayon);
  const aHaut = verifierBande("bande_r_32_et_plus", dureeMsPourRayon(40), 0, 52);
  check("bande_r_32_et_plus_rayon_dans_la_bande", aHaut.rayon >= 32, "obtenu " + aHaut.rayon);

  // Longueur / épaisseur : ALLUMÉE vs ÉTEINTE (défaut J — ce n'est plus la
  // première/dernière graduation qui est longue, c'est celle qui est
  // ALLUMÉE). `aMoyen` (outils = echelleOutils, plafond atteint) a TOUTES
  // ses graduations allumées ; `aHaut` (outils = 0) les a TOUTES éteintes.
  const allumee = aMoyen.graduations[0];
  const longueurAllumee = Math.hypot(allumee.x2 - allumee.x1, allumee.y2 - allumee.y1);
  check("graduation_allumee_longueur_7", Math.abs(longueurAllumee - 7) < 1e-6, "obtenu " + longueurAllumee);
  check("graduation_allumee_epaisseur_1_8", allumee.epaisseur === 1.8, "obtenu " + allumee.epaisseur);
  check("graduation_allumee_flag_vrai", allumee.allumee === true);

  const eteinte = aHaut.graduations[0];
  const longueurEteinte = Math.hypot(eteinte.x2 - eteinte.x1, eteinte.y2 - eteinte.y1);
  check("graduation_eteinte_longueur_3_2", Math.abs(longueurEteinte - 3.2) < 1e-6, "obtenu " + longueurEteinte);
  check("graduation_eteinte_epaisseur_1", eteinte.epaisseur === 1, "obtenu " + eteinte.epaisseur);
  check("graduation_eteinte_flag_faux", eteinte.allumee === false);
}

// -- Bornes de TK épinglées PILE et JUSTE AUTOUR (PIEGES.md §20 : une
// bande large — ici un rayon de 15 pour <22, 40 pour ≥32 — ne meurt jamais
// sous une mutation du SEUIL lui-même : `rayon < 22` -> `rayon < 21` ne
// change rien pour un rayon de 15, loin de la frontière). Rayon visé au
// dixième de millième près de chaque borne (22 et 32), dans les deux sens.
function testBornesTKPileEtJusteAutour() {
  const m = disposer.MESURES_DEFAUT;
  function tkPourRayon(rayonVise) {
    const s = Math.pow((rayonVise - m.rayonBase) / m.rayonCoefficient, 2);
    const g = disposer([passage("agent-borne-tk", "2026-09-15T10:00:00.000Z", s * 1000, { outils: 0 })]);
    return g.creneaux[0].agents[0];
  }
  const sousVingtDeux = tkPourRayon(21.9999);
  check("TK_juste_sous_22_vaut_24", sousVingtDeux.graduationsTotal === 24,
    "rayon=" + sousVingtDeux.rayon + " obtenu " + sousVingtDeux.graduationsTotal);
  const surVingtDeux = tkPourRayon(22.0001);
  check("TK_juste_sur_22_vaut_36", surVingtDeux.graduationsTotal === 36,
    "rayon=" + surVingtDeux.rayon + " obtenu " + surVingtDeux.graduationsTotal);

  const sousTrenteDeux = tkPourRayon(31.9999);
  check("TK_juste_sous_32_vaut_36", sousTrenteDeux.graduationsTotal === 36,
    "rayon=" + sousTrenteDeux.rayon + " obtenu " + sousTrenteDeux.graduationsTotal);
  const surTrenteDeux = tkPourRayon(32.0001);
  check("TK_juste_sur_32_vaut_52", surTrenteDeux.graduationsTotal === 52,
    "rayon=" + surTrenteDeux.rayon + " obtenu " + surTrenteDeux.graduationsTotal);
}

// -- E2 (A7/A8) : positions de socle — simple et empilé — épinglées valeur
// par valeur (jamais une propriété d'ensemble).
function testSocleSimpleChampsAttendus() {
  const g = disposer([passage("backend-developer", "2026-09-15T10:00:00.000Z", 5000, { outils: 3 })]);
  const a = g.creneaux[0].agents[0];
  check("socle_simple_type", a.socle.type === "simple", "obtenu " + a.socle.type);
  const [heure, duree, nom] = a.socle.lignes;
  check("socle_simple_role_heure",
    heure.role === "heure" && heure.taillePx === 10.5 && heure.ancrage === "middle",
    JSON.stringify(heure));
  check("socle_simple_role_duree",
    duree.role === "duree" && duree.taillePx === 12.5 && duree.ancrage === "middle",
    JSON.stringify(duree));
  check("socle_simple_role_nom",
    nom.role === "nom" && nom.taillePx === 10.5 && nom.ancrage === "middle",
    JSON.stringify(nom));
  check("socle_simple_heure_baseline", heure.baselineY === a.cy + a.rayon + 17, "obtenu " + heure.baselineY);
  check("socle_simple_duree_baseline", duree.baselineY === a.cy + a.rayon + 33, "obtenu " + duree.baselineY);
  check("socle_simple_nom_baseline", nom.baselineY === a.cy + a.rayon + 47, "obtenu " + nom.baselineY);
}

function testSocleEmpileChampsAttendus() {
  const g = disposer(simultanes(2, "2026-09-15T10:00:00.000Z", 60000));
  const c = g.creneaux[0];
  check("socle_empile_type", c.agents.every((a) => a.socle.type === "empile"));
  c.agents.forEach((a, i) => {
    const [heureDuree, nom] = a.socle.lignes;
    check("socle_empile_" + i + "_role_heure_duree",
      heureDuree.role === "heureDuree" && heureDuree.taillePx === 11.5 && heureDuree.ancrage === "start",
      JSON.stringify(heureDuree));
    check("socle_empile_" + i + "_role_nom",
      nom.role === "nom" && nom.taillePx === 11 && nom.ancrage === "start",
      JSON.stringify(nom));
    check("socle_empile_" + i + "_heureDuree_baseline", heureDuree.baselineY === a.cy - 3,
      "obtenu " + heureDuree.baselineY);
    check("socle_empile_" + i + "_nom_baseline", nom.baselineY === a.cy + 12,
      "obtenu " + nom.baselineY);
  });
}

// -- E2 (A4, reste) : extrémités RÉELLES d'un lien — bords de CRÉNEAU
// (`bordDroit`/`bordGauche`), sur l'axe commun `axeY`, jamais un bord de
// CERCLE ni une moyenne locale (défaut P, mutant de contrôle M12 : recalculer
// `lien.x1` depuis `a.x + a.demiLargeur + 7` romprait le partage de repère
// entre le trait et sa pastille, sans qu'aucune garde d'ensemble — style
// « la pastille ne déborde pas » — ne le remarque, puisque ce cas n'a pas de
// pastille). Un seul agent par créneau ici, donc `bordDroit`/`bordGauche`
// coïncident avec les bords de cercle + marge : la valeur pinée vient de
// `creneau.bordDroit`/`bordGauche` eux-mêmes (champs du contrat), jamais
// recalculée indépendamment — ce test vérifie l'ÉGALITÉ de deux champs du
// contrat, pas une propriété dérivable par construction d'un seul côté.
function testLienExtremitesBordsDeCreneauEtPointe() {
  const debut1 = Date.parse("2026-09-15T10:00:00.000Z");
  const g = disposer([
    passage("spec-reader", new Date(debut1).toISOString(), 5000, {}),
    passage("architect", new Date(debut1 + 5000).toISOString(), 5000, {}),
  ]);
  check("lien_deux_creneaux_presents", g.creneaux.length === 2, "obtenu " + g.creneaux.length);
  const lien = g.liens[0];
  const a = g.creneaux[0];
  const b = g.creneaux[1];
  check("lien_x1_egale_bordDroit_du_creneau_de_depart",
    lien.x1 === a.bordDroit, "obtenu x1=" + lien.x1 + " bordDroit=" + a.bordDroit);
  check("lien_y1_egale_axeY", lien.y1 === g.axeY, "obtenu y1=" + lien.y1 + " axeY=" + g.axeY);
  check("lien_x2_egale_bordGauche_du_creneau_d_arrivee",
    lien.x2 === b.bordGauche, "obtenu x2=" + lien.x2 + " bordGauche=" + b.bordGauche);
  check("lien_y2_egale_axeY", lien.y2 === g.axeY, "obtenu y2=" + lien.y2 + " axeY=" + g.axeY);

  // Pointe : trois points, littéralement recopiés depuis `diagramme.js`
  // (décalage 5 px en x, ±2.6 px en y autour de l'arrivée) — jamais dérivés
  // d'un calcul générique qui suivrait n'importe quelle mutation de ces deux
  // constantes.
  check("lien_pointe_presente", !!lien.pointe && Array.isArray(lien.pointe.points),
    JSON.stringify(lien.pointe));
  const pts = lien.pointe.points;
  check("lien_pointe_trois_points", pts.length === 3, "obtenu " + pts.length);
  check("lien_pointe_point_1", pts[0][0] === lien.x2 - 5 && pts[0][1] === g.axeY - 2.6,
    "obtenu " + JSON.stringify(pts[0]));
  check("lien_pointe_point_2_sur_x2_axeY", pts[1][0] === lien.x2 && pts[1][1] === g.axeY,
    "obtenu " + JSON.stringify(pts[1]));
  check("lien_pointe_point_3", pts[2][0] === lien.x2 - 5 && pts[2][1] === g.axeY + 2.6,
    "obtenu " + JSON.stringify(pts[2]));
}

// -- E2 (A5, reste) : le cadre de créneau empilé porte un rayon de coin
// `rx` non nul (9 px, littéral dans `diagramme.js`, jamais lu depuis `m` —
// mutant de contrôle M15 : `rx: 9` -> `rx: 0`, aucune garde existante ne le
// remarquait, un rectangle à coins vifs passait pour conforme).
function testCadreSimultaneRxVaut9() {
  const g = disposer(simultanes(2, "2026-09-15T10:00:00.000Z", 60000));
  const c = g.creneaux[0];
  check("cadre_simultane_present", !!c.cadre, JSON.stringify(c.cadre));
  check("cadre_simultane_rx_vaut_9", !!c.cadre && c.cadre.rx === 9,
    "obtenu " + (c.cadre && c.cadre.rx));
}

// -- E6a (M18) : seuil du corps du sigle — `rayon > 26` bascule 9.5 -> 11 px.
// Bornes PILE et JUSTE AUTOUR (PIEGES.md §20 : une mutation du seuil lui-même,
// ex. `> 26` -> `> 99`, ne mordrait jamais sur une bande large ; ici la
// fixture VISE le rayon au dix-millième près de la frontière des deux côtés).
function testSigleTailleSeuilRayon26() {
  const m = disposer.MESURES_DEFAUT;
  // `rayonBase`/`rayonCoefficient` lus UNIQUEMENT pour CONSTRUIRE la fixture
  // (viser un rayon), jamais comme valeur ATTENDUE — la même exception que
  // `testGraduationsAnglesLongueursEpaisseurs` plus haut.
  function dureeMsPourRayon(rayonVise) {
    const s = Math.pow((rayonVise - m.rayonBase) / m.rayonCoefficient, 2);
    return s * 1000;
  }
  function agentPourRayon(rayonVise) {
    const g = disposer([passage("agent-sigle", "2026-09-15T10:00:00.000Z", dureeMsPourRayon(rayonVise), { outils: 0 })]);
    return g.creneaux[0].agents[0];
  }
  const juste_sous = agentPourRayon(25.9999);
  check("sigle_taille_juste_sous_26_vaut_9_5",
    juste_sous.rayon < 26 && juste_sous.sigleTaillePx === 9.5,
    "rayon=" + juste_sous.rayon + " obtenu " + juste_sous.sigleTaillePx);
  const juste_sur = agentPourRayon(26.0001);
  check("sigle_taille_juste_sur_26_vaut_11",
    juste_sur.rayon > 26 && juste_sur.sigleTaillePx === 11,
    "rayon=" + juste_sur.rayon + " obtenu " + juste_sur.sigleTaillePx);
}

// -- E6a (M20) : opacité de l'anneau « en cours », constante 0.45 — valeur
// LITTÉRALE recopiée depuis `diagramme.js`, jamais relue via
// `disposer.MESURES_DEFAUT.anneauEnCoursOpacite` (ce serait tautologique :
// une mutation de la constante muterait aussi la valeur attendue).
function testAnneauEnCoursOpaciteValeurAttendue() {
  const g = disposer([passage("test-engineer", "2026-09-15T10:00:00.000Z", 5000, { termine: false })]);
  const a = g.creneaux[0].agents[0];
  check("anneau_en_cours_present", a.enCours === true, "obtenu enCours=" + a.enCours);
  check("anneau_en_cours_opacite_0_45", a.anneauEnCoursOpacite === 0.45,
    "obtenu " + a.anneauEnCoursOpacite);
}

// -- E2 (A6) : décalage constant du sigle par rapport au centre du cercle.
function testSigleBaselineYDecalageConstant() {
  const g = disposer([passage("debugger", "2026-09-15T10:00:00.000Z", 5000, { outils: 1 })]);
  const a = g.creneaux[0].agents[0];
  const m = disposer.MESURES_DEFAUT;
  check("sigle_baseline_y_decalage", a.sigleBaselineY === a.cy + m.sigleBaselineDecalagePx,
    "obtenu " + a.sigleBaselineY + " cy=" + a.cy);
}

// -- Garde Q (architect, feature-020) : `texteAttente()` sur une table
// manuelle {1 min, 99 min, 100 min, 23 h, 240 h} — jamais dérivée du code
// sous test. Boîte de pastille FIXE (86 px, budget mesuré 78,1 px) : le
// texte doit toujours tenir dans un gabarit court (≤ 12 caractères) et
// respecter le motif `attente <N><m|h>` (ou `attente >99h` au plafond).
function testGardeQTexteAttenteTableManuelle() {
  const REGEX_ATTENTE = /^attente (>?\d{1,2})[mh]$/;
  const table = [
    [60000, "attente 1m"],           // 1 min
    [99 * 60000, "attente 99m"],     // 99 min — borne haute de la branche minutes
    [100 * 60000, "attente 2h"],     // 100 min = 1 h 40 → arrondi à 2 h
    [23 * 3600000, "attente 23h"],   // 23 h
    [240 * 3600000, "attente >99h"], // 240 h — plafond
  ];
  table.forEach(([ms, attendu]) => {
    const obtenu = disposer.texteAttente(ms);
    check("texteAttente_" + ms + "ms_valeur_attendue", obtenu === attendu,
      "obtenu " + JSON.stringify(obtenu) + " attendu " + JSON.stringify(attendu));
    check("texteAttente_" + ms + "ms_longueur_max_12", obtenu.length <= 12,
      "obtenu " + obtenu.length + " caractères : " + JSON.stringify(obtenu));
    check("texteAttente_" + ms + "ms_motif", REGEX_ATTENTE.test(obtenu),
      "obtenu " + JSON.stringify(obtenu));
  });
}

function main() {
  testUnSeulAgent();
  testQuatreSimultanes();
  testCinqSimultanesRepli();
  testSixSimultanesRepli();
  testZeroAppelOutil();
  testPlafondOutilsMesure();
  testSeuilAttenteStrict();
  testPastilleGabaritFixe();
  testPastilleNeRecouvrePasLeVoisin();
  testPastilleAdjacenteACreneauEmpileNeDeborde();
  testLibellesEmpilesNomsLongsPasDeChevauchement();
  testLibelleSimpleNomTresLongPasDeChevauchement();
  testSeuilAttenteEpingleSurLaConstante();
  testEchecJamaisCumuleAvecSansCloture();
  testPrioriteContourRoleEchecAvantEnCours();
  testCentQuatreVingtSixPassages();
  testRebouclageEntreOccurrencesDuMemeAgent();
  testArcDeRebouclageTientDansLeCadre();
  testArcAbsentMargeHautReduite();
  testPasDeRebouclageSansIntercalation();
  testTermineTrueAvecDureeMissing();
  testPlafondAtteintBornePileEtJusteEnDessous();
  testRayonPlafonneAuDelaDuSeuilDerive();
  testTexteDureeBasculeMinutesPileAuSeuil();
  testDeuxPassagesAdossesPileNeFusionnentPas();
  testGraduationsAnglesLongueursEpaisseurs();
  testBornesTKPileEtJusteAutour();
  testLienExtremitesBordsDeCreneauEtPointe();
  testCadreSimultaneRxVaut9();
  testSigleTailleSeuilRayon26();
  testAnneauEnCoursOpaciteValeurAttendue();
  testSocleSimpleChampsAttendus();
  testSocleEmpileChampsAttendus();
  testSigleBaselineYDecalageConstant();
  testGardeQTexteAttenteTableManuelle();

  console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
  for (const e of _echecs) console.log("  - " + e);
  process.exit(_echecs.length ? 1 : 0);
}

main();
