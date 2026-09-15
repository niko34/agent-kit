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
function texteDureeAppJs(origine) {
  if (typeof origine.duree_ms === "number") return disposer.texteDuree(origine.duree_ms);
  return origine.termine === false ? "en cours" : "durée invalide";
}

function calculerBoitePeinteCreneau(creneauGeo, passages, m) {
  const empile = creneauGeo.agents.length > 1;
  let xGauche = Infinity;
  let xDroite = -Infinity;
  creneauGeo.agents.forEach((a) => {
    const origine = passages[a.passageIndex] || {};
    const lignes = [
      disposer.texteHeure(origine.debut),
      texteDureeAppJs(origine),
      a.agent,
    ];
    const largeurLibelle = Math.max(...lignes.map((l) => disposer.largeurTexte(l, m)));
    const rayonEtendu = a.rayon + m.graduationExtensionPx; // cercle + graduations peintes
    const cercleGauche = a.cx - rayonEtendu;
    const cercleDroite = a.cx + rayonEtendu;
    let libelleGauche;
    let libelleDroite;
    if (empile) {
      // app.js : `x: agentGeo.cx + agentGeo.rayon + 10, text-anchor: "start"`
      libelleGauche = a.cx + a.rayon + 10;
      libelleDroite = libelleGauche + largeurLibelle;
    } else {
      // app.js : `x: agentGeo.cx, text-anchor: "middle"` — le libellé est
      // CENTRÉ sur `cx`, il déborde symétriquement de part et d'autre.
      libelleGauche = a.cx - largeurLibelle / 2;
      libelleDroite = a.cx + largeurLibelle / 2;
    }
    xGauche = Math.min(xGauche, cercleGauche, libelleGauche);
    xDroite = Math.max(xDroite, cercleDroite, libelleDroite);
  });
  if (creneauGeo.repli) {
    // app.js : le « +N » part de `dernier.cx + dernier.rayon + 10` — inclus
    // pour rester fidèle au peint, même s'il ne domine jamais un libellé
    // complet.
    const dernier = creneauGeo.agents[creneauGeo.agents.length - 1];
    const largeurRepli = disposer.largeurTexte("+" + creneauGeo.repli.masques, m);
    xDroite = Math.max(xDroite, dernier.cx + dernier.rayon + 10 + largeurRepli);
  }
  return { xGauche, xDroite };
}

function verifierAucunChevauchement(creneaux, passages, mesures) {
  const m = mesures || disposer.MESURES_DEFAUT;
  const boites = creneaux.map((c) => calculerBoitePeinteCreneau(c, passages, m));
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
    // teste le RECTANGLE PEINT (celui qu'`app.js` dessine : `cx ±
    // largeur/2`, exactement sa formule) contre les bords RÉELLEMENT
    // réservés par le placement horizontal (`creneau.x ± demiLargeur`) —
    // jamais un milieu entre bords de CERCLE (l'ancien défaut, bug-021).
    const bordDroitA = creneauA.x + creneauA.demiLargeur;
    const bordGaucheB = creneauB.x - creneauB.demiLargeur;
    const cx = lien.pastille.cx;
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

  const bordDroitA = creneauA.x + creneauA.demiLargeur;
  const bordGaucheB = creneauB.x - creneauB.demiLargeur;
  const cx = lien.pastille.cx;
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
    verifierAucunChevauchement(g.creneaux, passages),
    "boîtes : " + JSON.stringify(g.creneaux.map((c) => calculerBoitePeinteCreneau(c, passages, disposer.MESURES_DEFAUT))));
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
    verifierAucunChevauchement(g.creneaux, passages),
    "boîtes : " + JSON.stringify(g.creneaux.map((c) => calculerBoitePeinteCreneau(c, passages, disposer.MESURES_DEFAUT))));
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
  check("186_aucun_chevauchement", verifierAucunChevauchement(g.creneaux, passages));
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

// -- bug-020 : l'arc de rebouclage tient dans le cadre --------------------
// Un rebouclage sur une longue distance horizontale produit un arc haut
// (jusqu'à `arcHauteurMaxPx`, 70 px) : `margeHautPx` doit grandir en
// conséquence, sinon son sommet sort du cadre par le haut (`y < 0`).
function testArcDeRebouclageTientDansLeCadre() {
  const debut = Date.parse("2026-09-15T10:00:00.000Z");
  let t = debut;
  const passages = [passage("test-engineer", new Date(t).toISOString(), 5000)];
  t += 5000;
  // Neuf agents intercalés, assez espacés pour que l'écart horizontal entre
  // les deux occurrences de `test-engineer` dépasse le point où l'arc
  // plafonne à `arcHauteurMaxPx` (70 px, soit (x2-x1) >= 70/0.18 ≈ 389 px).
  for (let i = 0; i < 9; i++) {
    t += 400000;   // grand écart : chaque créneau est loin du précédent
    passages.push(passage("agent-" + i, new Date(t).toISOString(), 5000));
  }
  t += 400000;
  passages.push(passage("test-engineer", new Date(t).toISOString(), 5000));

  const g = disposer(passages);
  check("arc_long_un_seul_arc", g.arcs.length === 1, "obtenu " + g.arcs.length);
  if (g.arcs.length === 1) {
    const arc = g.arcs[0];
    check("arc_long_plafonne_a_la_hauteur_max",
      arc.hauteurArc === disposer.MESURES_DEFAUT.arcHauteurMaxPx,
      "obtenu " + arc.hauteurArc);
    const source = trouverAgentGeo(g, arc.dePassage);
    const cible = trouverAgentGeo(g, arc.aPassage);
    check("arc_long_source_et_cible_trouves", !!source && !!cible);
    if (source && cible) {
      const y1 = source.cy - source.rayon - 4;
      const y2 = cible.cy - cible.rayon - 4;
      const yControle = Math.min(y1, y2) - arc.hauteurArc;
      // Le point de contrôle d'une quadratique n'est pas l'apex exact, mais
      // il en est la borne la plus haute possible (l'apex réel reste
      // toujours SOUS lui) — une garde sur `yControle >= 0` couvre donc
      // l'apex a fortiori.
      check("arc_long_sommet_dans_le_cadre", yControle >= 0,
        "yControle=" + yControle + " (sortirait du cadre si négatif)");
    }
  }
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
    verifierAucunChevauchement(g.creneaux, passages),
    "boîtes : " + JSON.stringify(g.creneaux.map((c) => calculerBoitePeinteCreneau(c, passages, disposer.MESURES_DEFAUT))));
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

// M9 — `calculerRayon` (feature-017, item 1 : « le diamètre porte la
// durée ») : le contrat documenté dit que le rayon PLAFONNE à `rayonMax` au-
// delà de `dureeReferenceMs` (Math.min(1, ratio) dans diagramme.js). Aucune
// fixture existante ne dépassait cette référence (186 passages, max ~400 000
// ms, `dureeReferenceMs` = 1 200 000 ms) : le plafonnement n'était jamais
// sollicité.
function testRayonPlafonneAuDelaDeLaDureeReference() {
  const m = disposer.MESURES_DEFAUT;
  const rayonPile = disposer.calculerRayon(m.dureeReferenceMs, m);
  check("rayon_pile_sur_la_reference_egale_rayon_max",
    Math.abs(rayonPile - m.rayonMax) < 1e-9, "obtenu " + rayonPile);

  const rayonAuDela = disposer.calculerRayon(m.dureeReferenceMs * 3, m);
  check("rayon_trois_fois_la_reference_reste_plafonne_a_rayon_max",
    Math.abs(rayonAuDela - m.rayonMax) < 1e-9,
    "obtenu " + rayonAuDela + " (rayonMax=" + m.rayonMax + ") — un ratio non borné dépasserait rayonMax");
}

// M10 — `texteDuree` (contrat exposé, formatage lu par le socle heure / durée
// / nom) : la bascule "N,N s" -> "M min S s" se fait STRICTEMENT à 60000 ms.
// Les fixtures existantes ne portaient aucune durée valant exactement 60000.
function testTexteDureeBasculeMinutesPileAuSeuil() {
  check("texte_duree_59999ms_reste_en_secondes",
    disposer.texteDuree(59999) === "60.0 s", "obtenu " + disposer.texteDuree(59999));
  check("texte_duree_60000ms_bascule_en_minutes",
    disposer.texteDuree(60000) === "1 min 0 s", "obtenu " + disposer.texteDuree(60000));
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

function main() {
  testUnSeulAgent();
  testQuatreSimultanes();
  testCinqSimultanesRepli();
  testSixSimultanesRepli();
  testZeroAppelOutil();
  testPlafondOutilsMesure();
  testSeuilAttenteStrict();
  testPastilleNeRecouvrePasLeVoisin();
  testPastilleAdjacenteACreneauEmpileNeDeborde();
  testLibellesEmpilesNomsLongsPasDeChevauchement();
  testLibelleSimpleNomTresLongPasDeChevauchement();
  testSeuilAttenteEpingleSurLaConstante();
  testEchecJamaisCumuleAvecSansCloture();
  testCentQuatreVingtSixPassages();
  testRebouclageEntreOccurrencesDuMemeAgent();
  testArcDeRebouclageTientDansLeCadre();
  testPasDeRebouclageSansIntercalation();
  testTermineTrueAvecDureeMissing();
  testPlafondAtteintBornePileEtJusteEnDessous();
  testRayonPlafonneAuDelaDeLaDureeReference();
  testTexteDureeBasculeMinutesPileAuSeuil();
  testDeuxPassagesAdossesPileNeFusionnentPas();

  console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
  for (const e of _echecs) console.log("  - " + e);
  process.exit(_echecs.length ? 1 : 0);
}

main();
