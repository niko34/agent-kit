"use strict";
/* feature-021, cycle 2, lot 4 (ADR-0031) — RÉÉCRITURE COMPLÈTE.
 *
 *     node control-center/web/test_app_diagramme.js
 *
 * L'ancienne grammaire (`ADR-0025`/`ADR-0026`, cercles à graduations
 * data-dépendantes, créneaux empilés avec cadre, pastilles d'attente, arcs
 * de rebouclage séparés) est RÉVOQUÉE. Cette suite couvre le contrat NEUF de
 * `disposer()` (`diagramme.js`) — module PUR, testé SEUL, sans DOM :
 *
 *   - diamètre = fonction de l'ÉTAT (52 non lancé, 88 actif/terminé) ;
 *   - non-chevauchement des libellés (ADR-0031 §3, le « trou à combler ») :
 *     chaque disque réserve, de chaque côté, la moitié du plus exigeant
 *     entre le diamètre MAXIMAL possible et ses deux libellés ;
 *   - connecteurs séquentiels (créneau → créneau suivant), état dérivé de
 *     l'état des deux extrémités ;
 *   - rebouclages : connecteur SÉPARÉ, en arc élevé, entre l'occurrence
 *     précédente et la nouvelle occurrence du même agent ;
 *   - AUCUN champ n'est inventé pour un passage sans mesure.
 *
 * Zéro dépendance installée (ADR-0006).
 */

const path = require("path");
const vm = require("vm");
const fs = require("fs");

const source = fs.readFileSync(path.join(__dirname, "diagramme.js"), "utf8");
const sandbox = {};
vm.createContext(sandbox);
new vm.Script(source, { filename: "diagramme.js" }).runInContext(sandbox);
const disposer = sandbox.disposer;

let _tests = 0;
const _echecs = [];
function check(nom, condition, detail) {
  _tests += 1;
  if (condition) { console.log("  ok     " + nom); }
  else { _echecs.push(nom); console.log("  ECHEC  " + nom + (detail ? " : " + detail : "")); }
}

function passage(agent, overrides) {
  return Object.assign({
    type: "sousagent", agent, termine: true,
    debut: "2026-09-14T08:00:00.000Z", duree_ms: 1000,
    outils: 0, fichiers: [], echecs: 0,
  }, overrides || {});
}

// ===================================================================== //
// Liste vide et cas dégénérés
// ===================================================================== //
(function testListeVide() {
  const g = disposer([]);
  check("liste_vide_largeur_zero", g.largeur === 0, "obtenu " + g.largeur);
  check("liste_vide_hauteur_zero", g.hauteur === 0, "obtenu " + g.hauteur);
  check("liste_vide_aucun_agent", g.agents.length === 0);
  check("liste_vide_aucun_connecteur", g.connecteurs.length === 0);
})();

// ===================================================================== //
// Un seul agent
// ===================================================================== //
(function testUnAgent() {
  const g = disposer([passage("backend-developer")]);
  check("un_agent_un_seul_agent", g.agents.length === 1, "obtenu " + g.agents.length);
  check("un_agent_aucun_connecteur", g.connecteurs.length === 0);
  check("un_agent_largeur_positive", g.largeur > 0);
  check("un_agent_hauteur_positive", g.hauteur > 0);
  const a = g.agents[0];
  check("un_agent_cx_dans_les_bornes", a.cx > 0 && a.cx < g.largeur);
  check("un_agent_cy_egale_axeY", a.cy === g.axeY);
})();

// ===================================================================== //
// État → diamètre (ADR-0031 §2) — la grammaire n'a QUE deux diamètres
// atteignables par un passage réel (le journal ne consigne que des
// passages déjà commencés, jamais "pending" — voir diagramme.js, en-tête).
// ===================================================================== //
(function testEtatEtDiametre() {
  const gActif = disposer([passage("backend-developer", { etat: "en_cours", termine: false })]);
  check("etat_en_cours_donne_active", gActif.agents[0].etat === "active",
    "obtenu " + gActif.agents[0].etat);
  check("diametre_actif_88px", gActif.agents[0].diametre === 88,
    "obtenu " + gActif.agents[0].diametre);

  const gTermine = disposer([passage("backend-developer", { termine: true })]);
  check("etat_termine_donne_done", gTermine.agents[0].etat === "done");
  check("diametre_termine_88px", gTermine.agents[0].diametre === 88);

  // Le diamètre NE dépend PLUS de la durée (propriété inverse d'ADR-0025 §1,
  // ADR-0031 §2) : deux passages actifs de durées très différentes ont le
  // MÊME diamètre.
  const gCourt = disposer([passage("backend-developer", { etat: "en_cours", termine: false, duree_ms: 500 })]);
  const gLong = disposer([passage("backend-developer", { etat: "en_cours", termine: false, duree_ms: 5000000 })]);
  check("diametre_independant_de_la_duree",
    gCourt.agents[0].diametre === gLong.agents[0].diametre,
    "court=" + gCourt.agents[0].diametre + " long=" + gLong.agents[0].diametre);
})();

// ===================================================================== //
// F16 — booléens indépendants de l'état (échec / sans clôture / principal)
// ===================================================================== //
(function testBooleensF16() {
  const gEchec = disposer([passage("backend-developer", { echecs: 1, termine: true })]);
  check("echec_signale", gEchec.agents[0].echec === true);
  check("echec_pas_sans_cloture", gEchec.agents[0].sansCloture === false);

  const gSansCloture = disposer([passage("test-engineer", { etat: "sans_cloture", termine: false, echecs: 3 })]);
  check("sans_cloture_signale", gSansCloture.agents[0].sansCloture === true);
  // Une fin sans annonce n'est ni un succès ni un échec du travail (règle
  // conservée du système précédent) : l'échec ne s'affiche jamais par-dessus.
  check("sans_cloture_prioritaire_sur_echec", gSansCloture.agents[0].echec === false,
    "echecs=3 dans la donnée, mais sans_cloture doit l'emporter");

  const gPrincipal = disposer([passage("(agent principal)", { type: "principal", termine: true })]);
  check("principal_signale", gPrincipal.agents[0].principal === true);
  const gSousAgent = disposer([passage("backend-developer", { termine: true })]);
  check("sous_agent_pas_principal", gSousAgent.agents[0].principal === false);
})();

// ===================================================================== //
// Non-chevauchement des libellés (ADR-0031 §3) — chaque disque réserve
// assez d'espace pour son NOM et sa DURÉE, quel que soit leur longueur.
// ===================================================================== //
(function testNonChevauchementLibelles() {
  const gCourt = disposer([
    passage("t", { agent: "t", termine: true }),
    passage("t2", { agent: "t2", debut: "2026-09-14T08:00:05.000Z", termine: true }),
  ]);
  const gLong = disposer([
    passage("frontend-developer-tres-tres-long-nom", { termine: true }),
    passage("security-reviewer-tres-tres-long-nom", { debut: "2026-09-14T08:00:05.000Z", termine: true }),
  ]);
  // Deux agents aux noms longs doivent être plus ESPACÉS que deux agents aux
  // noms courts — sinon le libellé déborderait sur son voisin.
  check("libelles_longs_espacent_davantage",
    (gLong.agents[1].cx - gLong.agents[0].cx) > (gCourt.agents[1].cx - gCourt.agents[0].cx),
    "long=" + (gLong.agents[1].cx - gLong.agents[0].cx) + " court=" + (gCourt.agents[1].cx - gCourt.agents[0].cx));

  // Invariant vérifié directement, PAS en recopiant la formule interne
  // (PIEGES §30) : l'écart entre deux centres consécutifs doit être AU
  // MOINS la somme des deux demi-réservations — sinon les disques (ou
  // leurs libellés) se chevauchent par construction.
  for (let i = 1; i < gLong.agents.length; i++) {
    const prec = gLong.agents[i - 1], suivant = gLong.agents[i];
    const ecart = suivant.cx - prec.cx;
    const reserve = prec.demiDroite + suivant.demiGauche;
    check("ecart_couvre_la_reserve[" + i + "]", ecart >= reserve,
      "ecart=" + ecart + " reserve=" + reserve);
  }
})();

// ===================================================================== //
// Empilement vertical (agents simultanés) — même axe X, Y distincts, assez
// espacés pour ne jamais chevaucher (diamètre max + libellés).
// ===================================================================== //
(function testEmpilementVertical() {
  const g = disposer([
    passage("tests", { debut: "2026-09-14T08:00:00.000Z", duree_ms: 5000, termine: true }),
    passage("securite", { debut: "2026-09-14T08:00:01.000Z", duree_ms: 4000, termine: true }),
  ]);
  check("deux_agents_simultanes_meme_x", g.agents[0].cx === g.agents[1].cx,
    g.agents[0].cx + " vs " + g.agents[1].cx);
  check("deux_agents_simultanes_y_distincts", g.agents[0].cy !== g.agents[1].cy);
  const ecartY = Math.abs(g.agents[0].cy - g.agents[1].cy);
  check("ecart_vertical_couvre_deux_disques_pleins", ecartY >= 88,
    "obtenu " + ecartY);
})();

// ===================================================================== //
// Connecteurs séquentiels — état dérivé, chemin bézier reproductible
// ===================================================================== //
(function testConnecteursSequentiels() {
  const g = disposer([
    passage("backend-developer", { termine: true }),
    passage("frontend-developer", { debut: "2026-09-14T08:00:02.000Z", termine: true }),
  ]);
  check("deux_agents_un_connecteur", g.connecteurs.length === 1, "obtenu " + g.connecteurs.length);
  const c = g.connecteurs[0];
  check("connecteur_complete_si_deux_termines", c.etat === "complete", "obtenu " + c.etat);
  check("connecteur_d_commence_au_bord_du_disque_source",
    c.d.startsWith("M " + (g.agents[0].cx + g.agents[0].diametre / 2)),
    c.d.slice(0, 40));

  const gActif = disposer([
    passage("backend-developer", { termine: true }),
    passage("frontend-developer", { debut: "2026-09-14T08:00:02.000Z", etat: "en_cours", termine: false }),
  ]);
  check("connecteur_flowing_si_destination_active",
    gActif.connecteurs[0].etat === "flowing", "obtenu " + gActif.connecteurs[0].etat);
})();

// ===================================================================== //
// Rebouclage — connecteur SÉPARÉ, élevé au-dessus du rang, jamais confondu
// avec la chaîne séquentielle.
// ===================================================================== //
(function testRebouclage() {
  const g = disposer([
    passage("backend-developer", { termine: true }),
    passage("frontend-developer", { debut: "2026-09-14T08:00:02.000Z", termine: true }),
    passage("backend-developer", { debut: "2026-09-14T08:00:05.000Z", termine: true }),
  ]);
  const reprise = g.connecteurs.find((c) => c.etat === "reprise");
  check("rebouclage_present", !!reprise);
  check("rebouclage_distinct_des_connecteurs_sequentiels",
    g.connecteurs.filter((c) => c.etat === "reprise").length === 1
    && g.connecteurs.length === 3, // 2 séquentiels + 1 reprise
    "obtenu " + g.connecteurs.length + " connecteur(s)");

  // Pas de rebouclage si l'agent revient IMMÉDIATEMENT après lui-même (pas
  // d'agent intercalé) — même définition que le système précédent.
  const gSansIntercalation = disposer([
    passage("backend-developer", { termine: true }),
    passage("backend-developer", { debut: "2026-09-14T08:00:02.000Z", termine: true }),
  ]);
  check("pas_de_rebouclage_sans_intercalation",
    !gSansIntercalation.connecteurs.some((c) => c.etat === "reprise"));

  // Jamais sur l'agent principal (même règle que le système précédent).
  const gPrincipalRepete = disposer([
    passage("(agent principal)", { type: "principal", termine: true }),
    passage("frontend-developer", { debut: "2026-09-14T08:00:02.000Z", termine: true }),
    passage("(agent principal)", { type: "principal", debut: "2026-09-14T08:00:05.000Z", termine: true }),
  ]);
  check("jamais_de_rebouclage_sur_l_agent_principal",
    !gPrincipalRepete.connecteurs.some((c) => c.etat === "reprise"));
})();

// ===================================================================== //
// Fichiers — plafond à 3 (ADR-0031 §2), quel que soit le nombre réel
// ===================================================================== //
(function testFichiersPlafonnesATrois() {
  const g0 = disposer([passage("backend-developer", { fichiers: [] })]);
  check("zero_fichier_zero_allumee", g0.agents[0].fichiersAllumes === 0);
  const g2 = disposer([passage("backend-developer", { fichiers: ["a.py", "b.py"] })]);
  check("deux_fichiers_deux_allumees", g2.agents[0].fichiersAllumes === 2);
  const g8 = disposer([passage("backend-developer", {
    fichiers: ["a", "b", "c", "d", "e", "f", "g", "h"],
  })]);
  check("huit_fichiers_plafonnes_a_trois", g8.agents[0].fichiersAllumes === 3,
    "obtenu " + g8.agents[0].fichiersAllumes);
  check("fichiersTotal_garde_la_valeur_reelle", g8.agents[0].fichiersTotal === 8,
    "obtenu " + g8.agents[0].fichiersTotal + " — la donnée réelle ne doit PAS être perdue " +
    "(bottom sheet, F11)");
})();

// ===================================================================== //
// Aucun champ inventé — un passage sans mesure donne 0/false, jamais une
// valeur qui laisserait croire à une mesure (contrat du module).
// ===================================================================== //
(function testAucunChampInvente() {
  const g = disposer([passage("backend-developer", { outils: undefined, fichiers: undefined })]);
  check("outils_absent_donne_zero", g.agents[0].outils === 0, "obtenu " + g.agents[0].outils);
  check("fichiers_absent_donne_zero_allumee", g.agents[0].fichiersAllumes === 0);
})();

// ===================================================================== //
// F16, 4/4 — NON-CHEVAUCHEMENT, éprouvé sur un ORACLE INDÉPENDANT
//
// ⚠️ Pourquoi cette section existe, alors que `ecart_couvre_la_reserve`
// existait déjà : cette assertion-là compare `ecart` à
// `prec.demiDroite + suivant.demiGauche`, c'est-à-dire aux valeurs que
// `disposer()` A ELLE-MÊME PRODUITES. Si la formule de réservation
// rétrécit, les DEUX côtés de l'inégalité rétrécissent ensemble et
// l'assertion reste verte. Mesuré (lot 4, reboucle) : en remplaçant
// `largeurTexte(nom)/2 + marge` par `largeurTexte(nom)/4` dans
// `diagramme.js`, les libellés se chevauchent RÉELLEMENT — 6 paires
// recouvrantes constatées par le harnais Chromium — et
// `test_app_diagramme.js` sortait pourtant en 0. Son commentaire disait
// « PAS en recopiant la formule interne » : il ne la recopiait pas, il en
// CONSOMMAIT la sortie, ce qui est le même piège un cran plus bas.
//
// L'oracle ci-dessous ne dépend ni de `largeurTexte`, ni de `MESURES`, ni
// d'aucune valeur rendue par `disposer()` : c'est une borne BASSE de la
// largeur qu'occupe un texte, indépendante du kit.
// ===================================================================== //
(function testNonChevauchementSurOracleIndependant() {
  /* Plancher typographique : à la taille S, une chaîne de N caractères
   * latins occupe AU MOINS N × S × 0,42 px dans toute fonte proportionnelle
   * usuelle. Volontairement très en dessous du coefficient du kit (0,70) et
   * de la mesure réelle en Chromium — on veut une borne qu'aucune fonte ne
   * franchisse par le bas, pas une estimation fidèle. Le libellé du nom est
   * rendu en `<strong>` (donc plus large encore). */
  const PLANCHER = 0.42;
  const TAILLE_NOM = 12;      // `.agent-name`, relevé dans app.css
  const DIAMETRE = 88;        // disque actif/terminé, relevé dans le prototype

  function demiLargeurMinimale(nomAgent) {
    return Math.max(DIAMETRE / 2, (nomAgent.length * TAILLE_NOM * PLANCHER) / 2);
  }

  /* Éprouve la propriété sur une suite d'agents SÉQUENTIELS (un créneau
   * chacun), et renvoie le nombre de violations. */
  function violations(noms) {
    const passages = noms.map((nom, i) => passage(nom, {
      debut: new Date(Date.UTC(2026, 8, 21, 10, i * 5, 0)).toISOString(),
    }));
    const g = disposer(passages);
    let mauvaises = 0;
    let pire = null;
    for (let i = 1; i < g.agents.length; i++) {
      const ecart = g.agents[i].cx - g.agents[i - 1].cx;
      const exige = demiLargeurMinimale(noms[i - 1]) + demiLargeurMinimale(noms[i]);
      if (ecart < exige) {
        mauvaises += 1;
        if (!pire || exige - ecart > pire.manque) {
          pire = { i, ecart, exige, manque: exige - ecart, a: noms[i - 1], b: noms[i] };
        }
      }
    }
    return { mauvaises, pire, total: g.agents.length };
  }

  // -- entrées adverses, choisies pour MALMENER la propriété -------------
  const cas = [
    { nom: "un_seul_agent", noms: ["backend-developer"] },
    { nom: "libelles_tres_longs",
      noms: ["a".repeat(50), "b".repeat(48), "c".repeat(52)] },
    { nom: "largeurs_tres_inegales",
      noms: ["a", "x".repeat(40), "b", "y".repeat(38), "c", "z".repeat(44)] },
    { nom: "beaucoup_d_agents",
      noms: Array.from({ length: 30 }, (_, i) => "agent-numero-" + i) },
    { nom: "noms_reels_du_kit",
      noms: ["orchestrator", "spec-reader", "architect", "security-reviewer",
             "ux-ui-designer", "backend-developer", "frontend-developer",
             "test-engineer", "debugger", "code-reviewer", "doc-writer"] },
    { nom: "un_caractere_partout", noms: ["a", "b", "c", "d", "e", "f"] },
  ];
  for (const c of cas) {
    const r = violations(c.noms);
    check("non_chevauchement__" + c.nom, r.mauvaises === 0,
      r.pire
        ? r.mauvaises + " violation(s) sur " + (r.total - 1) + " écarts ; la pire entre `"
          + r.pire.a + "` et `" + r.pire.b + "` : écart " + r.pire.ecart.toFixed(1)
          + " px pour un minimum indépendant de " + r.pire.exige.toFixed(1) + " px ("
          + r.pire.manque.toFixed(1) + " px manquants)"
        : "");
  }

  // -- entrées PSEUDO-ALÉATOIRES, que je n'ai pas choisies ---------------
  // Graine fixe : reproductible, mais les longueurs ne sont pas cueillies
  // pour que la propriété tienne. C'est le point : une propriété qui ne
  // tient que sur des exemples choisis par son auteur n'est pas une
  // propriété.
  let graine = 20260921;
  function suivant() {            // générateur congruentiel, sans dépendance
    graine = (graine * 1103515245 + 12345) % 2147483648;
    return graine / 2147483648;
  }
  let echecsAleatoires = 0;
  let exempleAleatoire = null;
  const TIRAGES = 200;
  for (let t = 0; t < TIRAGES; t++) {
    const combien = 1 + Math.floor(suivant() * 12);
    const noms = Array.from({ length: combien }, () =>
      "n".repeat(1 + Math.floor(suivant() * 45)));
    const r = violations(noms);
    if (r.mauvaises > 0) {
      echecsAleatoires += 1;
      if (!exempleAleatoire) {
        exempleAleatoire = "tirage " + t + " : " + r.mauvaises + " violation(s), longueurs "
          + noms.map((n) => n.length).join(",");
      }
    }
  }
  check("non_chevauchement__200_tirages_pseudo_aleatoires", echecsAleatoires === 0,
    echecsAleatoires + " tirage(s) en défaut sur " + TIRAGES
    + (exempleAleatoire ? " — " + exempleAleatoire : ""));

  /* Contre-épreuve de l'oracle lui-même : la borne doit être ATTEIGNABLE,
   * sinon elle serait verte par vacuité. On vérifie qu'elle est bien plus
   * exigeante que le seul diamètre dès que le nom est long — c'est-à-dire
   * qu'elle contraint réellement quelque chose. */
  check("oracle_independant_contraint_vraiment",
    demiLargeurMinimale("x".repeat(40)) > DIAMETRE / 2,
    "borne pour 40 caractères = " + demiLargeurMinimale("x".repeat(40))
    + " px, diamètre/2 = " + DIAMETRE / 2 + " — si elle n'excédait jamais le disque, "
    + "la propriété serait vraie par vacuité");
})();

/* ---------------------------------------------------------------------------
 * Hauteur du canevas : dérivée de l'union des tracés, agents ET connecteurs.
 *
 * L'arc de reprise culmine AU-DESSUS du plus haut disque et n'appartient à
 * aucun agent. Une hauteur calculée sur les seules parties d'un agent le
 * laissait dehors — sommet peint à -62 px, arc tronqué, suite verte.
 * Les deux propriétés qui comptent tiennent ensemble : rien ne dépasse quand
 * il y a une reprise, et rien n'est réservé pour rien quand il n'y en a pas.
 * ------------------------------------------------------------------------ */
(function () {
  const M = disposer.MESURES_DEFAUT;
  const suite = (noms) => noms.map((n, i) => ({
    agent: n, type: "sousagent", termine: true, duree_ms: 60000, fichiers: [],
    debut: new Date(Date.UTC(2026, 8, 21, 10, i * 5, 0)).toISOString(),
  }));

  const sans = disposer(suite(["a", "b", "c"]));
  const avec = disposer(suite(["a", "b", "c", "a"]));
  const arcs = (g) => g.connecteurs.filter((c) => c.etat === "reprise");

  check("hauteur__la_scene_sans_reprise_n_en_porte_aucune", arcs(sans).length === 0);
  check("hauteur__la_scene_avec_reprise_en_porte_une", arcs(avec).length === 1,
    "sans arc, les deux cas suivants seraient vrais par vacuité");

  /* Contre-épreuve : un cycle sans reprise ne gagne PAS l'élévation de l'arc.
   * Sinon tout graphe qui ne reboucle pas porterait ~90 px de vide. */
  check("hauteur__sans_reprise_aucune_place_reservee_pour_un_arc",
    sans.axeY === M.margeHautPx && sans.hauteur === M.margeHautPx + M.margeBasPx,
    "axeY=" + sans.axeY + " hauteur=" + sans.hauteur + " — attendu "
    + M.margeHautPx + " et " + (M.margeHautPx + M.margeBasPx));

  /* Épreuve : le sommet RÉELLEMENT PEINT de l'arc — extremum de la Bézier,
   * jamais son point de contrôle (22,5 px d'écart mesuré) — tient dans le
   * canevas, trait compris. Le sommet est relu du tracé `d` émis, pas
   * recalculé depuis les mesures : la garde ne consomme pas la sortie de la
   * formule qu'elle juge. */
  const d = arcs(avec)[0].d;
  const nombres = d.match(/-?[0-9.]+/g).map(Number);
  const ys = nombres.filter((_, i) => i % 2 === 1);
  const sommetPeint = disposer.bornesYCourbe(ys[0], ys[1], ys[2], ys[3]).min;
  check("hauteur__le_sommet_PEINT_de_l_arc_tient_dans_le_canevas",
    sommetPeint - M.demiTraitConnecteurPx >= -0.01,
    "sommet peint " + sommetPeint.toFixed(2) + " px, demi-trait "
    + M.demiTraitConnecteurPx + " — négatif = tracé au-dessus du bord");

  /* Le point de CONTRÔLE, lui, sort du canevas : c'est précisément pourquoi
   * le dimensionner dessus réserverait du vide, et le mesurer dessus serait
   * faux. Cette assertion fige l'écart plutôt que de le laisser implicite. */
  check("hauteur__le_point_de_controle_n_est_PAS_le_sommet_peint",
    ys[1] < sommetPeint - 1,
    "contrôle " + ys[1].toFixed(2) + " vs sommet peint " + sommetPeint.toFixed(2)
    + " — s'ils coïncidaient, bornesYCourbe() serait inutile");
})();

function main() {
  console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
  for (const e of _echecs) console.log("  - " + e);
  process.exit(_echecs.length ? 1 : 0);
}
main();
