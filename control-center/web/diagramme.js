"use strict";
/* Module PUR — feature-017, feature-020 (conformité à la maquette de
 * référence), docs/DESIGN-SYSTEM.md §5.
 *
 * Calcule la GÉOMÉTRIE COMPLÈTE du diagramme de déroulé d'un cycle : un
 * cercle par agent (principal compris), les agents simultanés empilés dans
 * un créneau unique, les liens entre créneaux, les pastilles d'attente et
 * les arcs de rebouclage — reproduisant `pose()` et `graphe()` de
 * `control-center/maquettes/2026-09-15-diagramme-reference.html`.
 *
 * AUCUN DOM ici — ni `document`, ni élément SVG, ni couleur, ni style :
 * uniquement de l'arithmétique sur les champs déjà présents dans
 * `passages[]` du journal (`agent`, `debut`, `duree_ms`, `outils`,
 * `fichiers`, `echecs`, `termine`, `etat`, `type`). C'est ce qui permet de
 * le tester SEUL, sans bac à sable DOM (voir `test_app_diagramme.js`), et de
 * le charger tel quel dans un `<script>` classique (pas de `module.exports`,
 * pas d'`import` — CSP `default-src 'self'`, ADR-0006).
 *
 * feature-020 (ADR neuf remplaçant ADR-0025 §1) élargit ce contrat pour que
 * `app.js` devienne un PEINTRE SANS ARITHMÉTIQUE : toute position, tout
 * angle, tout point de tracé (y compris la trigonométrie des graduations)
 * est calculé ICI. `app.js` ne doit plus appeler `duree()`, `heure()` ni
 * `Math.*` dans les fonctions qui peignent le diagramme — c'est vérifiable
 * par `grep` en revue.
 *
 * ============================ Contrat de sortie ==========================
 *
 * disposer(passages, mesures) → {
 *   largeur, hauteur,        // dimensions totales du tracé (px)
 *   axeY,                    // axe horizontal UNIQUE des liens = centre vertical
 *   margeHaut,                // 38 si des arcs existent, sinon 24 (bug-020)
 *   creneaux: [{
 *     index, x,               // position du créneau dans la séquence, abscisse du centre
 *     demiGauche, demiDroite, // extension réelle de chaque côté (asymétrique
 *                             // pour un créneau empilé — le libellé ne passe
 *                             // qu'à droite du cercle)
 *     demiLargeur,            // = max(demiGauche, demiDroite) — alias conservateur,
 *                             // conservé pour compatibilité (ne PAS l'utiliser
 *                             // pour positionner un lien : voir bordGauche/bordDroit)
 *     bordGauche, bordDroit,  // x ∓ demiGauche/demiDroite — bords RÉELS du
 *                             // créneau, ce que les liens (ci-dessous)
 *                             // rejoignent (bug défaut P)
 *     empile,                 // plus d'un agent dans ce créneau
 *     cadre: null | { x, y, largeur, hauteur, rx },
 *     libelleCadre: null | { texte, masque:{x,y,largeur,hauteur}, texteX, baselineY, taillePx },
 *     repli: null | { visibles, masques },
 *     repliLibelle: null | { texte, x, baselineY, taillePx, ancrage },
 *     agents: [{
 *       passageIndex, agent, cx, cy, rayon,
 *       outils, graduationsTotal, graduationsAllumees, plafondAtteint, fichiers,
 *       graduations: [{x1,y1,x2,y2,allumee,epaisseur}],   // trigonométrie FAITE ICI
 *       graduationDepartDeg, graduationPasDeg,             // méta, pour les tests
 *       rayonGuide, rayonGraduationInterieur, rayonExterieurTotal,
 *       barreZeroBlanche: {x1,y1,x2,y2}, barreZeroGrise: {x1,y1,x2,y2},
 *       // épaisseur des barres du zéro et du liseré : RETIRÉE du contrat
 *       // (feature-020 C2) — ne sert qu'au trait, ne réserve aucun espace,
 *       // vit désormais dans `.dg-barre-zero-blanche`/`-grise`/`.dg-liseret`.
 *       liseretRayon, liseretOpacite,
 *       anneauEnCoursRayon, anneauEnCoursOpacite,
 *       contourRole,           // "echec" | "sansCloture" | "enCours" | "nominal"
 *       contourLargeur,
 *       croixBras,
 *       sigleTaillePx, sigleBaselineY,
 *       socle: { type: "simple" | "empile", lignes: [{role, texte, x, baselineY, taillePx, ancrage}] },
 *       etat, echec, sansCloture, principal, enCours,
 *     }],
 *   }],
 *   liens: [{
 *     deCreneau, aCreneau, attenteMs,
 *     x1, y1, x2, y2,                 // bords de CRÉNEAU (bug défaut P), y = axeY
 *     pointe: { points: [[x,y],[x,y],[x,y]] },
 *     pastille: null | { x, y, largeur, hauteur, rx, texte, texteX, baselineY },
 *     // gabarit FIXE (86×18, rx 9) — jamais mesuré au rendu (correction de
 *     // mesure : le 54 de la maquette déborde son propre texte).
 *   }],
 *   arcs: [{
 *     dePassage, aPassage, agent,
 *     sommetY,                         // 16, ABSOLU, commun à tous les arcs
 *     depart: {x,y}, arrivee: {x,y},
 *     controle1: {x,y}, controle2: {x,y},  // tous deux à sommetY
 *     libelle: { texte: "↻ reboucle", x, baselineY, taillePx },
 *     // AUCUNE pointe (décision R) ; `hauteurArc` est RETIRÉ — remplacé par
 *     // `sommetY` absolu (deux sources pour la même hauteur, c'est le défaut
 *     // bug-020/défaut R).
 *   }],
 * }
 *
 * Aucun champ n'est inventé : un champ absent de `passages[]` donne 0 ou
 * `false`, jamais une valeur qui laisserait croire à une mesure.
 */

const MESURES_DEFAUT = Object.freeze({
  echelleOutils: 70,             // graduations sur une échelle de 70 appels d'outils
  seuilAttenteMs: 120000,        // pastille au-delà de deux minutes, STRICT (>)

  // Rayon : ADR neuf remplaçant ADR-0025 §1 — 11 + 0,80·√(durée_s), plafonné
  // à 56px. Mesuré : le plafond ne mord qu'à 3164s ; le plus long sous-agent
  // du journal réel (2560s) n'est jamais écrêté.
  rayonBase: 11,
  rayonCoefficient: 0.80,
  rayonMax: 56,

  // Anneau et graduations (maquette pose(), l.164-181)
  guideDecalagePx: 4,              // r0 = rayon + 4
  guideSupplementPx: 3.5,          // anneau guide = r0 + 3.5
  graduationDepartDeg: 2.4,
  graduationEcartFermetureDeg: 4.8, // pas = (360 - écart) / TK
  graduationExtensionAllumeePx: 7,
  graduationExtensionEteintePx: 3.2,
  graduationEpaisseurAllumeePx: 1.8,
  graduationEpaisseurEteintePx: 1,

  // Barres du zéro (marqueur de départ des graduations) — la LONGUEUR fixe
  // la position du second point (géométrie, reste ici) ; l'ÉPAISSEUR ne sert
  // qu'au trait et ne réserve rien : posée en CSS (feature-020 C2,
  // `.dg-barre-zero-blanche`/`.dg-barre-zero-grise`).
  barreBlancheLongueurPx: 8.5,     // r0+0.5 → r0-8.5 (maquette l.172)
  barreGriseDecalageXPx: 0.6,
  barreGriseLongueurPx: 9.5,       // r0+0.5 → r0-9.5 (maquette l.173)

  // Liseré des fichiers (D2 : opacité, épaisseur CONSTANTE — plus de largeur
  // variable 1.5→6px). L'épaisseur ne réserve rien (le liseré est intérieur
  // au disque) : posée en CSS (feature-020 C2, `.dg-liseret`), pas ici.
  liseretDecalagePx: 4,            // liseretRayon = rayon - 4
  liseretOpaciteBase: 0.22,
  liseretOpaciteAmplitude: 0.45,
  liseretFichiersReference: 8,     // min(f,8)/8

  anneauEnCoursSupplementPx: 3.5,
  anneauEnCoursOpacite: 0.45,

  croixRatio: 0.42,

  contourLargeurEchec: 2,
  contourLargeurSansCloture: 1.2,
  contourLargeurEnCours: 1.8,
  contourLargeurNominal: 1.2,

  sigleBaselineDecalagePx: 3.6,

  // Correction de mesure : la largeur d'un texte dépend de la taille de
  // police. Mesuré : à 12,5px, "7 min 47 s" fait 65,86px contre 65,0px
  // réservés par l'ancien coefficient constant 6.5px/caractère (rejeté).
  largeurTexteCoefficient: 0.70,
  largeurTexteMargePx: 4,

  // Pastille d'attente : gabarit FIXE, jamais mesuré au rendu (correction de
  // mesure : le 54×18 de la maquette déborde son propre texte — mesuré,
  // "attente 4m" fait 58,61px).
  pastilleLargeurPx: 86,
  pastilleHauteurPx: 18,
  pastilleRxPx: 9,
  pastilleReservePx: 62,           // espace horizontal réservé en plus de ECART

  // Placement horizontal (maquette l.130 : ECART, PAD, INTER)
  ecartHorizontalPx: 30,
  margeHorizontalePx: 16,
  cadrePaddingPx: 12,
  espaceVerticalEmpilementPx: 11,
  creneauLigneMinPx: 42,
  labelDecalageXPx: 40,            // 26 + 14 (maquette l.196)

  // Marge haute et sommet des arcs (maquette : AXE = 38 + HAUTEUR_HAUT, h = 16)
  margeHautAvecArcsPx: 38,
  margeHautSansArcsPx: 24,
  arcSommetYPx: 16,
  arcDepartDecalagePx: 16,         // point de départ = bord du cercle - 16px
  arcLibelleDecalagePx: 4,         // baseline du libellé = sommetY - 4

  simpleSlotHautSupplementPx: 2,   // haut = rayonExterieurTotal + 2 (= rayon+13)
  simpleSlotBasSupplementPx: 46,   // bas = haut + 46 (socle : heure/durée/nom)
  margeBasFinalePx: 16,

  repliMaxVisibles: 4,
});

function fusionnerMesures(mesures) {
  return Object.assign({}, MESURES_DEFAUT, mesures || {});
}

function versMs(iso) {
  if (!iso) return null;
  const t = Date.parse(String(iso));
  return Number.isNaN(t) ? null : t;
}

/* Un passage « en cours » au sens de ce module : un état explicite
 * `en_cours`, ou (repli historique, cf. app.js) l'absence de `etat` sur un
 * passage non `termine` — jamais une affirmation nouvelle par défaut. */
function estEnCours(p) {
  if (p.etat === "en_cours") return true;
  if (p.etat === undefined && p.termine === false) return true;
  return false;
}

function estSansCloture(p) { return p.etat === "sans_cloture"; }

/* Un échec ne s'affiche jamais par-dessus « sans clôture » : une fin sans
 * annonce n'est ni un succès ni un échec du travail. */
function estEchec(p) { return !!p.echecs && !estSansCloture(p); }

function estPrincipal(p) { return p.type === "principal"; }

/* ------------------------------------------------------- fenêtre temporelle */
function fenetre(p) {
  const debutMs = versMs(p.debut);
  if (debutMs === null) return { debutMs: null, finMs: null };
  const dureeMs = typeof p.duree_ms === "number" && p.duree_ms >= 0 ? p.duree_ms : 0;
  return { debutMs, finMs: debutMs + dureeMs };
}

/* ------------------------------------------------------------- créneaux --
 * Agents simultanés = créneau unique (§5) : regroupement par FUSION
 * D'INTERVALLES, dans l'ordre d'arrivée de `passages`. */
function construireCreneaux(passages) {
  const creneaux = [];
  let courant = null;
  let finMaxCourante = null;

  passages.forEach((p, index) => {
    const { debutMs, finMs } = fenetre(p);
    const chevauche = courant !== null && debutMs !== null && finMaxCourante !== null
      && debutMs < finMaxCourante;
    if (chevauche) {
      courant.push({ passage: p, index, debutMs, finMs });
      finMaxCourante = Math.max(finMaxCourante, finMs === null ? debutMs : finMs);
    } else {
      if (courant !== null) creneaux.push(courant);
      courant = [{ passage: p, index, debutMs, finMs }];
      finMaxCourante = finMs === null ? debutMs : finMs;
    }
  });
  if (courant !== null) creneaux.push(courant);

  creneaux.forEach((c) => {
    c.sort((a, b) => {
      if (a.debutMs === null || b.debutMs === null) return 0;
      return a.debutMs - b.debutMs;
    });
  });
  return creneaux;
}

/* ------------------------------------------------------------- rebouclage */
function detecterRebouclages(passages) {
  const arcs = [];
  const sousAgents = [];
  passages.forEach((p, index) => { if (!estPrincipal(p)) sousAgents.push({ agent: p.agent, index }); });
  const dernierePosition = new Map();
  sousAgents.forEach((entree, position) => {
    const precedente = dernierePosition.get(entree.agent);
    if (precedente !== undefined && position - precedente.position > 1) {
      arcs.push({ dePassage: precedente.index, aPassage: entree.index, agent: entree.agent });
    }
    dernierePosition.set(entree.agent, { position, index: entree.index });
  });
  return arcs;
}

/* ----------------------------------------------------------- métriques --
 * Rayon : 11 + 0,80·√(durée_s), plafonné à 56px (ADR neuf, D5/§ mesuré). */
function calculerRayon(dureeMs, m) {
  if (typeof dureeMs !== "number" || dureeMs <= 0) return m.rayonBase;
  const dureeS = dureeMs / 1000;
  return Math.min(m.rayonMax, m.rayonBase + m.rayonCoefficient * Math.sqrt(dureeS));
}

/* Graduations : TK discret selon le rayon (D3/§ maquette), plus aucune
 * notion de borne pour la longueur (défaut J). */
function calculerGraduations(outils, rayon, m) {
  const total = rayon < 22 ? 24 : rayon < 32 ? 36 : 52;
  const bornes = Math.max(0, outils || 0);
  const ratio = Math.min(1, bornes / m.echelleOutils);
  const allumees = Math.min(total, Math.round(ratio * total));
  return { total, allumees, plafondAtteint: bornes >= m.echelleOutils };
}

function calculerLiseretOpacite(nbFichiers, m) {
  const n = Math.max(0, nbFichiers || 0);
  const ratio = Math.min(1, n / m.liseretFichiersReference);
  return +(m.liseretOpaciteBase + m.liseretOpaciteAmplitude * ratio).toFixed(2);
}

/* Point sur un cercle, angle en degrés MESURÉ DEPUIS LE HAUT, sens horaire
 * (0° = 12h) — SEUL endroit de ce module qui fait de la trigonométrie ;
 * `app.js` ne calcule plus jamais un `Math.cos`/`Math.sin` lui-même. */
function pointSurCercle(cx, cy, rayon, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + rayon * Math.sin(rad), y: cy - rayon * Math.cos(rad) };
}

/* Estimation de largeur de texte SANS DOM — correction de mesure : dépend de
 * la taille de police (D6/W). `largeurCaracterePx` constant est rejeté par
 * mesure (65,86px réels contre 65,0px estimés à 12,5px). */
function largeurTexte(texte, taillePx, m) {
  const mm = m || MESURES_DEFAUT;
  const t = String(texte || "");
  return mm.largeurTexteCoefficient * taillePx * t.length + mm.largeurTexteMargePx;
}

function texteHeure(iso) {
  if (!iso) return "";
  const t = String(iso);
  return t.length >= 16 ? t.slice(11, 16) : t;
}

/* Formats alignés sur la maquette de référence (bug complément feature-020,
 * `control-center/maquettes/2026-09-15-diagramme-reference.html` l. 117 :
 * `s>=60 ? floor(s/60)+' min '+String(s%60).padStart(2,'0') : s+' s'`).
 * SEUL FORMATEUR de durée du module — `app.js` n'en réimplémente aucun :
 * `duree()` y délègue ici (voir commentaire sur `duree()` dans `app.js`).
 *
 * Écart assumé au-delà d'1 h : la maquette n'a aucune branche « heures » (sa
 * plus longue vignette fait 3 960 s = 66 min), or le journal réel porte des
 * segments mesurés à 33 186 s, qu'un format "min MM" écrirait "553 min 06" —
 * illisible. Forme en heures cohérente avec le style de la maquette. */
function texteDuree(dureeMs, termine) {
  if (typeof dureeMs === "number") {
    if (dureeMs < 1000) return dureeMs + " ms";
    const s = Math.round(dureeMs / 1000);
    if (s < 60) return s + " s";
    if (s < 3600) return Math.floor(s / 60) + " min " + String(s % 60).padStart(2, "0");
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    return h + " h " + String(m).padStart(2, "0");
  }
  return termine === false ? "en cours" : "durée invalide";
}

/* Libellé de pastille borné À 12 CARACTÈRES par construction (D6/Q) :
 * "attente Nm" tant que N < 100 minutes, sinon "attente Nh" tant que N < 100
 * heures, sinon "attente >99h" — jamais un texte plus long que le gabarit
 * fixe de la pastille (86×18) ne pourrait accueillir. */
function texteAttente(attenteMs) {
  const minutes = Math.round(attenteMs / 60000);
  if (minutes < 100) return "attente " + minutes + "m";
  const heures = Math.round(attenteMs / 3600000);
  if (heures < 100) return "attente " + heures + "h";
  return "attente >99h";
}

function finMaxDuGroupe(groupe) {
  let max = null;
  groupe.forEach((e) => {
    const val = e.finMs === null ? e.debutMs : e.finMs;
    if (val !== null && (max === null || val > max)) max = val;
  });
  return max;
}

function debutMinDuGroupe(groupe) {
  let min = null;
  groupe.forEach((e) => {
    if (e.debutMs !== null && (min === null || e.debutMs < min)) min = e.debutMs;
  });
  return min;
}

/* --------------------------------------------------- géométrie par agent --
 * Tout ce qui NE DÉPEND PAS de la position finale (cx, cy) — calculé dans un
 * premier temps, avant le placement. */
function construireAgentBase(passage, index, m) {
  const rayon = calculerRayon(typeof passage.duree_ms === "number" ? passage.duree_ms : null, m);
  const grad = calculerGraduations(passage.outils, rayon, m);
  const fichiers = (passage.fichiers || []).length;
  const echec = estEchec(passage);
  const sansCloture = estSansCloture(passage);
  const enCours = estEnCours(passage);
  const principal = estPrincipal(passage);
  const contourRole = echec ? "echec" : sansCloture ? "sansCloture" : enCours ? "enCours" : "nominal";
  const contourLargeur = {
    echec: m.contourLargeurEchec,
    sansCloture: m.contourLargeurSansCloture,
    enCours: m.contourLargeurEnCours,
    nominal: m.contourLargeurNominal,
  }[contourRole];
  return {
    passageIndex: index,
    agent: passage.agent,
    cx: 0, cy: 0,
    rayon,
    rayonGuide: rayon + m.guideDecalagePx + m.guideSupplementPx,
    rayonGraduationInterieur: rayon + m.guideDecalagePx,
    rayonExterieurTotal: rayon + m.guideDecalagePx + m.graduationExtensionAllumeePx,
    outils: passage.outils || 0,
    graduationsTotal: grad.total,
    graduationsAllumees: grad.allumees,
    plafondAtteint: grad.plafondAtteint,
    graduationDepartDeg: m.graduationDepartDeg,
    graduationPasDeg: (360 - m.graduationEcartFermetureDeg) / grad.total,
    fichiers,
    liseretRayon: rayon - m.liseretDecalagePx,
    liseretOpacite: calculerLiseretOpacite(fichiers, m),
    anneauEnCoursRayon: rayon + m.anneauEnCoursSupplementPx,
    anneauEnCoursOpacite: m.anneauEnCoursOpacite,
    contourRole, contourLargeur,
    croixBras: rayon * m.croixRatio,
    sigleTaillePx: rayon > 26 ? 11 : 9.5,
    sigleBaselineY: 0, // rempli après positionnement
    socle: null,        // rempli après positionnement
    etat: passage.etat,
    echec, sansCloture, principal, enCours,
    _texteHeure: texteHeure(passage.debut),
    _texteDuree: texteDuree(passage.duree_ms, passage.termine),
  };
}

/* Complète les champs qui dépendent de la position finale (cx, cy) : barres
 * du zéro, graduations tracées (trigonométrie faite ICI), sigle. */
function finaliserPositionAgent(a, m) {
  const r0 = a.rayonGraduationInterieur;
  a.sigleBaselineY = a.cy + m.sigleBaselineDecalagePx;
  a.barreZeroBlanche = {
    x1: a.cx, y1: a.cy - r0 + 0.5,
    x2: a.cx, y2: a.cy - r0 - m.barreBlancheLongueurPx,
  };
  a.barreZeroGrise = {
    x1: a.cx - m.barreGriseDecalageXPx, y1: a.cy - r0 + 0.5,
    x2: a.cx - m.barreGriseDecalageXPx, y2: a.cy - r0 - m.barreGriseLongueurPx,
  };
  const graduations = [];
  for (let i = 0; i < a.graduationsTotal; i++) {
    const angle = a.graduationDepartDeg + i * a.graduationPasDeg;
    const allumee = i < a.graduationsAllumees;
    const longueur = allumee ? m.graduationExtensionAllumeePx : m.graduationExtensionEteintePx;
    const interieur = pointSurCercle(a.cx, a.cy, r0, angle);
    const exterieur = pointSurCercle(a.cx, a.cy, r0 + longueur, angle);
    graduations.push({
      x1: interieur.x, y1: interieur.y, x2: exterieur.x, y2: exterieur.y,
      allumee,
      epaisseur: allumee ? m.graduationEpaisseurAllumeePx : m.graduationEpaisseurEteintePx,
    });
  }
  a.graduations = graduations;
}

/* --------------------------------------------------------------- disposer */
function disposer(passages, mesures) {
  const m = fusionnerMesures(mesures);
  const liste = Array.isArray(passages) ? passages : [];

  if (!liste.length) {
    return { largeur: 0, hauteur: 0, axeY: 0, margeHaut: m.margeHautSansArcsPx, creneaux: [], liens: [], arcs: [] };
  }

  const groupes = construireCreneaux(liste);
  const arcsBruts = detecterRebouclages(liste);

  const creneaux = groupes.map((groupe, indexCreneau) => {
    const total = groupe.length;
    const empile = total > 1;
    const visibles = groupe.slice(0, m.repliMaxVisibles);
    const masques = Math.max(0, total - m.repliMaxVisibles);

    const agents = visibles.map(({ passage, index }) => construireAgentBase(passage, index, m));

    let demiGauche, demiDroite, haut, bas, cadreLargeur = 0, cadreHauteur = 0;
    let rayonMax = 0, R = 0, tw = 0;

    if (!empile) {
      const a = agents[0];
      const labelMax = Math.max(
        largeurTexte(a.agent, 10.5, m),
        largeurTexte(a._texteDuree, 12.5, m));
      const demi = Math.max(a.rayonExterieurTotal + m.simpleSlotHautSupplementPx, labelMax / 2 + 4, 26);
      demiGauche = demi; demiDroite = demi;
      haut = a.rayonExterieurTotal + m.simpleSlotHautSupplementPx;
      bas = haut + m.simpleSlotBasSupplementPx;
    } else {
      R = Math.max(...agents.map((a) => a.rayon));
      rayonMax = Math.max(...agents.map((a) => a.rayonExterieurTotal));
      tw = Math.max(...agents.map((a) => Math.max(
        largeurTexte(a.agent, 11, m),
        largeurTexte(a._texteHeure + " · " + a._texteDuree, 11.5, m))));
      const lignes = agents.map((a) => Math.max(2 * a.rayonExterieurTotal, m.creneauLigneMinPx));
      cadreHauteur = lignes.reduce((s, v) => s + v, 0)
        + m.espaceVerticalEmpilementPx * (agents.length - 1) + 2 * m.cadrePaddingPx + 18;
      cadreLargeur = m.cadrePaddingPx + 2 * R + m.labelDecalageXPx + tw + m.cadrePaddingPx;
      demiGauche = cadreLargeur / 2; demiDroite = cadreLargeur / 2;
      haut = cadreHauteur / 2; bas = cadreHauteur / 2;
    }
    if (masques > 0) {
      const demiRepli = largeurTexte("+" + masques, 10.5, m) / 2;
      demiDroite = Math.max(demiDroite, demiRepli);
      demiGauche = Math.max(demiGauche, demiRepli);
    }

    return {
      index: indexCreneau,
      x: 0,
      demiGauche, demiDroite,
      demiLargeur: Math.max(demiGauche, demiDroite),
      bordGauche: 0, bordDroit: 0,
      empile,
      _haut: haut, _bas: bas,
      _cadreLargeur: cadreLargeur, _cadreHauteur: cadreHauteur, _R: R, _tw: tw,
      cadre: null, libelleCadre: null,
      repli: masques > 0 ? { visibles: agents.length, masques } : null,
      repliLibelle: null,
      agents,
      _total: total,
    };
  });

  // Placement horizontal séquentiel — l'écart NE mesure PAS le temps (§5).
  const liens = [];
  let x = m.margeHorizontalePx + creneaux[0].demiGauche;
  creneaux[0].x = x;
  for (let i = 1; i < creneaux.length; i++) {
    const finPrecedente = finMaxDuGroupe(groupes[i - 1]);
    const debutSuivante = debutMinDuGroupe(groupes[i]);
    const attenteMs = (finPrecedente !== null && debutSuivante !== null)
      ? Math.max(0, debutSuivante - finPrecedente) : null;
    const attenteDepassee = attenteMs !== null && attenteMs > m.seuilAttenteMs;

    const gapReserve = attenteDepassee ? m.pastilleReservePx : 0;
    x += creneaux[i - 1].demiDroite + m.ecartHorizontalPx + gapReserve + creneaux[i].demiGauche;
    creneaux[i].x = x;

    let pastille = null;
    if (attenteDepassee) {
      const bordDroitPrecedent = creneaux[i - 1].x + creneaux[i - 1].demiDroite;
      const bordGaucheCourant = creneaux[i].x - creneaux[i].demiGauche;
      const cx = (bordDroitPrecedent + bordGaucheCourant) / 2;
      const texte = texteAttente(attenteMs);
      pastille = {
        x: cx, y: 0, // y (axeY) rempli après le placement vertical
        largeur: m.pastilleLargeurPx, hauteur: m.pastilleHauteurPx, rx: m.pastilleRxPx,
        texte, texteX: cx, baselineY: 0,
      };
    }
    liens.push({ deCreneau: i - 1, aCreneau: i, attenteMs, pastille });
  }
  creneaux.forEach((c) => { c.bordGauche = c.x - c.demiGauche; c.bordDroit = c.x + c.demiDroite; });

  const largeur = creneaux[creneaux.length - 1].bordDroit + m.margeHorizontalePx;

  // Rebouclages : hauteur toujours comptée via un sommet ABSOLU (bug-020,
  // défaut R) — plus de recalcul par paire d'agents.
  function agentDuPassage(passageIndex) {
    for (const c of creneaux) {
      for (const a of c.agents) {
        if (a.passageIndex === passageIndex) return a;
      }
    }
    return null;
  }

  // Placement vertical : chaque créneau centré sur le même axe médian.
  const margeHaut = arcsBruts.length > 0 ? m.margeHautAvecArcsPx : m.margeHautSansArcsPx;
  const hautMax = Math.max(...creneaux.map((c) => c._haut));
  const basMax = Math.max(...creneaux.map((c) => c._bas));
  const axeY = margeHaut + hautMax;
  const hauteur = axeY + basMax + m.margeBasFinalePx;

  creneaux.forEach((c) => {
    if (!c.empile) {
      const a = c.agents[0];
      a.cx = c.x; a.cy = axeY;
      finaliserPositionAgent(a, m);
      a.socle = {
        type: "simple",
        lignes: [
          { role: "heure", texte: a._texteHeure, x: a.cx, baselineY: a.cy + a.rayon + 17, taillePx: 10.5, ancrage: "middle" },
          { role: "duree", texte: a._texteDuree, x: a.cx, baselineY: a.cy + a.rayon + 33, taillePx: 12.5, ancrage: "middle" },
          { role: "nom", texte: a.agent, x: a.cx, baselineY: a.cy + a.rayon + 47, taillePx: 10.5, ancrage: "middle" },
        ],
      };
    } else {
      const x0 = c.x - c.demiGauche;
      const y0 = axeY - c._cadreHauteur / 2;
      const cx = x0 + m.cadrePaddingPx + c._R + 13;
      const tx = x0 + m.cadrePaddingPx + 2 * c._R + m.labelDecalageXPx;
      let y = y0 + m.cadrePaddingPx;
      const lignes = c.agents.map((a) => Math.max(2 * a.rayonExterieurTotal, m.creneauLigneMinPx));
      c.agents.forEach((a, i) => {
        const h = lignes[i];
        a.cx = cx; a.cy = y + h / 2;
        finaliserPositionAgent(a, m);
        a.socle = {
          type: "empile",
          lignes: [
            { role: "heureDuree", texte: a._texteHeure + " · " + a._texteDuree, x: tx, baselineY: a.cy - 3, taillePx: 11.5, ancrage: "start" },
            { role: "nom", texte: a.agent, x: tx, baselineY: a.cy + 12, taillePx: 11, ancrage: "start" },
          ],
        };
        y += h + m.espaceVerticalEmpilementPx;
      });
      c.cadre = { x: x0, y: y0, largeur: c._cadreLargeur, hauteur: c._cadreHauteur, rx: 9 };
      const y1 = y0 + c._cadreHauteur;
      const libelleTexte = c._total + " agents en parallèle";
      const lw = largeurTexte(libelleTexte, 10.5, m) + 14;
      c.libelleCadre = {
        texte: libelleTexte,
        masque: { x: x0 + m.cadrePaddingPx - 7, y: y1 - 21, largeur: lw, hauteur: 19 },
        texteX: x0 + m.cadrePaddingPx, baselineY: y1 - 7, taillePx: 10.5,
      };
    }
    if (c.repli) {
      const dernier = c.agents[c.agents.length - 1];
      c.repliLibelle = {
        texte: "+" + c.repli.masques,
        x: dernier.cx + dernier.rayon + 10,
        baselineY: dernier.cy + dernier.rayon + 4,
        taillePx: 10.5, ancrage: "start",
      };
    }
    // champs de travail internes, pas dans le contrat de sortie documenté
    delete c._haut; delete c._bas; delete c._cadreLargeur; delete c._cadreHauteur;
    delete c._R; delete c._tw; delete c._total;
    c.agents.forEach((a) => { delete a._texteHeure; delete a._texteDuree; });
  });

  liens.forEach((lien) => {
    const a = creneaux[lien.deCreneau];
    const b = creneaux[lien.aCreneau];
    lien.x1 = a.bordDroit; lien.y1 = axeY;
    lien.x2 = b.bordGauche; lien.y2 = axeY;
    lien.pointe = {
      points: [
        [lien.x2 - 5, axeY - 2.6],
        [lien.x2, axeY],
        [lien.x2 - 5, axeY + 2.6],
      ],
    };
    if (lien.pastille) {
      lien.pastille.y = axeY;
      lien.pastille.baselineY = axeY + 4;
    }
  });

  const arcs = arcsBruts.map((arc) => {
    const source = agentDuPassage(arc.dePassage);
    const cible = agentDuPassage(arc.aPassage);
    if (!source || !cible || cible.cx <= source.cx) return null;
    const sommetY = m.arcSommetYPx;
    const depart = { x: source.cx, y: source.cy - source.rayon - m.arcDepartDecalagePx };
    const arrivee = { x: cible.cx, y: cible.cy - cible.rayon - m.arcDepartDecalagePx };
    return {
      dePassage: arc.dePassage, aPassage: arc.aPassage, agent: arc.agent,
      sommetY,
      depart, arrivee,
      controle1: { x: depart.x, y: sommetY },
      controle2: { x: arrivee.x, y: sommetY },
      libelle: {
        texte: "↻ reboucle",
        x: (depart.x + arrivee.x) / 2,
        baselineY: sommetY - m.arcLibelleDecalagePx,
        taillePx: 10.5,
      },
    };
  }).filter(Boolean);

  return { largeur, hauteur, axeY, margeHaut, creneaux, liens, arcs };
}

/* Exposé pour être testé isolément (test_app_diagramme.js). */
disposer.MESURES_DEFAUT = MESURES_DEFAUT;
disposer.calculerRayon = calculerRayon;
disposer.calculerGraduations = calculerGraduations;
disposer.calculerLiseretOpacite = calculerLiseretOpacite;
disposer.detecterRebouclages = detecterRebouclages;
disposer.construireCreneaux = construireCreneaux;
disposer.pointSurCercle = pointSurCercle;
disposer.texteHeure = texteHeure;
disposer.texteDuree = texteDuree;
disposer.texteAttente = texteAttente;
disposer.largeurTexte = largeurTexte;
