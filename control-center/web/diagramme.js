"use strict";
/* Module PUR — feature-021, cycle 2, lot 4 (F8/F9/F15/F16), ADR-0031.
 *
 * RÉÉCRITURE COMPLÈTE : la grammaire `ADR-0025`/`ADR-0026` (diamètre =
 * fonction de la durée, graduations = appels d'outils, liseré = fichiers en
 * continu) est RÉVOQUÉE. La nouvelle grammaire (`ADR-0031 §2`) est celle du
 * disque Material 3 du prototype `control-center/maquettes/2026-09-20-
 * maquette-materiel-3.html` :
 *
 *   - diamètre = fonction de l'ÉTAT (52px non lancé → 88px actif/terminé),
 *   - graduations radiales = 12, FIXES, purement décoratives (posées en CSS
 *     pur par `app.js`, `--i` 0..11 — aucune géométrie data-dépendante, donc
 *     hors du contrat de sortie ci-dessous, voir la note dans `app.js`),
 *   - pastilles de fichiers = 3, binaires (allumée/éteinte),
 *   - anneau = activité, jamais une progression chiffrée (`ADR-0031 §5`),
 *   - centre = sigle (le chiffre `input+output` est hors périmètre de ce
 *     cycle, `feature-023`, `ADR-0031 §5`/notes d'implémentation §5),
 *   - sous le disque = durée seule ; au-dessus = nom.
 *
 * `disposer()` reste l'UNIQUE autorité de géométrie (`ADR-0031 §4`,
 * `ADR-0025 §4` maintenu) : positions (cx/cy), rayons de réservation d'espace
 * (demi-largeurs), tracés de connecteurs (bézier). AUCUN DOM ici — ni
 * `document`, ni élément, ni couleur, ni classe CSS : uniquement de
 * l'arithmétique sur les champs déjà présents dans `passages[]` du journal
 * (`agent`, `debut`, `duree_ms`, `outils`, `fichiers`, `echecs`, `termine`,
 * `etat`, `type`). `app.js` ne fait plus AUCUN calcul de position — c'est ce
 * qui a déjà trouvé deux défauts par mutation avant ce lot (`ADR-0031 §4`).
 *
 * ============================ Contrat de sortie ==========================
 *
 * disposer(passages, mesures) → {
 *   largeur, hauteur, axeY,      // dimensions totales du tracé (px)
 *   agents: [{
 *     passageIndex, agent, id,          // id = index séquentiel stable (DOM)
 *     etat,                             // "pending" | "active" | "done"
 *     echec, sansCloture, principal,    // booléens F16 (indépendants de `etat`)
 *     diametre,                         // 52 | 88
 *     cx, cy,                           // centre du disque
 *     demiGauche, demiDroite,           // réservation horizontale RÉELLE
 *                                       // (non-chevauchement des libellés,
 *                                       // ADR-0031 §3 — "trou à combler")
 *     fichiersAllumes,                  // 0..3 pastilles allumées
 *     outils, fichiersTotal,            // valeurs brutes (bottom sheet, F11 — hors lot)
 *     nom: { texte, x, y },
 *     duree: { texte, x, y },
 *   }],
 *   connecteurs: [{
 *     id,
 *     etat,        // "pending" | "flowing" | "complete" | "reprise"
 *     d,           // chemin SVG cubique, bords de disque à bords de disque
 *   }],
 * }
 *
 * Aucun champ n'est inventé : un champ absent de `passages[]` donne 0 ou
 * `false`, jamais une valeur qui laisserait croire à une mesure.
 */

const MESURES_DEFAUT = Object.freeze({
  diametrePending: 52,
  diametreActifOuTermine: 88,

  // Non-chevauchement des libellés (ADR-0031 §3, "trou à combler") : chaque
  // disque réserve, de chaque côté, la MOITIÉ du plus exigeant entre son
  // propre diamètre maximal possible (88, jamais 52 — un agent qui devient
  // actif ne doit jamais chevaucher son voisin) et la moitié de son libellé
  // le plus large (nom ou durée).
  margeLabelPx: 10,
  ecartHorizontalPx: 36,
  margeHorizontalePx: 20,

  // Empilement vertical d'agents simultanés (créneau "empile") : écart
  // constant entre deux centres, assez grand pour que le nom du dessus et la
  // durée du dessous ne se chevauchent jamais (88px de disque + ~2×22px de
  // libellés + marge).
  espacementVerticalPx: 168,

  // Écrêtage du canevas (feature-021, lot 4, bug signalé sur capture réelle) :
  // AVANT ce lot, ces deux marges valaient exactement le rayon du disque
  // (44/40 pour un disque de 88 px) — donc RIEN n'était réservé pour ce qui
  // se dessine hors du disque (`.role-ring`, `.agent-flag`, `.agent-name`,
  // `.agent-duration`), alors que `.graphe-scroll` écrête verticalement
  // (`overflow-y: hidden`, app.css). Les valeurs ci-dessous sont MESURÉES,
  // pas recalculées depuis les propriétés CSS elles-mêmes (`bottom`/`top`
  // déclarés n'incluent ni les métriques de police réellement rendues ni le
  // bord par défaut du `<button>` non réinitialisé qui rétrécit de 2 px le
  // bloc de confinement des enfants absolus) : mesuré via
  // `getBoundingClientRect()` dans Chromium réel (même méthode que
  // `test_app_diagramme_navigateur.py`), un agent d'état actif/terminé avec
  // un libellé d'UNE ligne (le nom n'a jamais de sous-titre dans ce DOM,
  // contrairement au prototype) exige, depuis le CENTRE du disque :
  //   - `.agent-name` (le plus haut) : 52 px (offset CSS `bottom: 53px`,
  //     mesuré 52) + 17,5 px (hauteur d'une ligne `<strong>` 13 px,
  //     line-height hérité 1.35 du corps) ≈ 69,5 px vers le haut ;
  //   - `.agent-duration` (le plus bas) : 51 px (offset CSS `top: 51px`) +
  //     16,2 px (hauteur d'une ligne 12 px) ≈ 67,2 px vers le bas.
  // L'anneau de rôle (`.role-ring`, ±55 px) et le drapeau (`.agent-flag`,
  // contenu dans le disque) restent tous deux SOUS ces deux valeurs — les
  // libellés, pas l'anneau, gouvernent l'écrêtage. Marge de sécurité de 2 px
  // ajoutée sur chacune (métriques de police dépendantes de la machine) :
  // 69,5 → 72, 67,2 → 70. Réservées INCONDITIONNELLEMENT, y compris quand
  // le texte du libellé est vide aujourd'hui (14 `SubagentStop` sur 16
  // arrivent sans `agent_type` — voir notes d'implémentation) : un libellé
  // VIDE ne réserve AUCUNE hauteur lui-même (`<strong></strong>` sans texte
  // mesure 0 px, vérifié), donc dimensionner sur l'état actuel aurait fait
  // sauter le graphe le jour où les noms redeviennent lisibles.
  margeHautPx: 72,
  margeBasPx: 70,

  // Étiquettes (feature-020, formule conservée : dépend de la taille de
  // police, coefficient mesuré 0,70).
  largeurTexteCoefficient: 0.70,
  largeurTexteMargePx: 4,
  tailleNomPx: 12,
  tailleDureePx: 12,
  nomDecalageYPx: 33,     // distance centre → baseline du nom (au-dessus)
  dureeDecalageYPx: 33,   // distance centre → baseline de la durée (en dessous)

  // Connecteurs : contrôle en S (mesuré sur le prototype, l.701-707 —
  // c1 = x1 + 0.425·Δx à y1, c2 = x1 + 0.575·Δx à y2).
  connecteurRatioC1: 0.425,
  connecteurRatioC2: 0.575,
  // Rebouclage (reprise) : arc élevé au-dessus du plus haut point du rang,
  // même principe qu'`ADR-0025 §4`/bug-020 (sommet ABSOLU, un seul calcul).
  repriseElevationPx: 90,
  // Demi-épaisseur du trait des connecteurs (`app.css` l.601,
  // `stroke-width: 2`) : le trait est centré sur le tracé, donc il déborde
  // d'un pixel AU-DESSUS du sommet de la courbe.
  demiTraitConnecteurPx: 1,

  fichiersPlafond: 3,
});

/* Bornes verticales EXACTES d'une Bézier cubique — extremums analytiques,
 * jamais le point de contrôle. Mesuré : pour l'arc de reprise réel
 * (y0=y3=28, contrôles à -62), le sommet PEINT est à -39,5 et non à -62 ;
 * prendre le contrôle réserverait 22,5 px de vide sur tout graphe qui
 * reboucle. Dérivation : y'(t) = 0 sur une quadratique, on retient les
 * racines dans ]0,1[ et les deux extrémités. */
function bornesYCourbe(y0, y1, y2, y3) {
  const valeurs = [y0, y3];
  const a = y3 - 3 * y2 + 3 * y1 - y0;
  const b = 2 * (y2 - 2 * y1 + y0);
  const c = y1 - y0;
  const evaluer = (t) => {
    const u = 1 - t;
    return u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
  };
  const retenir = (t) => { if (t > 0 && t < 1) valeurs.push(evaluer(t)); };
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) > 1e-9) retenir(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const r = Math.sqrt(disc);
      retenir((-b + r) / (2 * a));
      retenir((-b - r) / (2 * a));
    }
  }
  return { min: Math.min(...valeurs), max: Math.max(...valeurs) };
}

function fusionnerMesures(mesures) {
  return Object.assign({}, MESURES_DEFAUT, mesures || {});
}

function versMs(iso) {
  if (!iso) return null;
  const t = Date.parse(String(iso));
  return Number.isNaN(t) ? null : t;
}

function estEnCours(p) {
  if (p.etat === "en_cours") return true;
  if (p.etat === undefined && p.termine === false) return true;
  return false;
}
function estSansCloture(p) { return p.etat === "sans_cloture"; }
/* Un échec ne s'affiche jamais par-dessus « sans clôture » : une fin sans
 * annonce n'est ni un succès ni un échec du travail (règle conservée du
 * système précédent). */
function estEchec(p) { return !!p.echecs && !estSansCloture(p); }
function estPrincipal(p) { return p.type === "principal"; }

function fenetre(p) {
  const debutMs = versMs(p.debut);
  if (debutMs === null) return { debutMs: null, finMs: null };
  const dureeMs = typeof p.duree_ms === "number" && p.duree_ms >= 0 ? p.duree_ms : 0;
  return { debutMs, finMs: debutMs + dureeMs };
}

/* Agents simultanés = créneau unique, par FUSION D'INTERVALLES, dans l'ordre
 * d'arrivée de `passages` (conservé du système précédent, feature-017 §5). */
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

/* Rebouclage : relie une reprise à l'OCCURRENCE PRÉCÉDENTE du MÊME agent
 * (conservé du système précédent, §5). */
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

function largeurTexte(texte, taillePx, m) {
  const mm = m || MESURES_DEFAUT;
  const t = String(texte || "");
  return mm.largeurTexteCoefficient * taillePx * t.length + mm.largeurTexteMargePx;
}

/* État du DISQUE au sens de la grammaire M3 (3 classes seulement,
 * `ADR-0031 §2` — jamais une 4e valeur ici : « échec »/« sans clôture »/
 * « principal » sont des booléens INDÉPENDANTS, F16, pas une variante de cet
 * enum). Un passage réel n'est jamais "pending" (le journal ne consigne que
 * des passages déjà commencés) — cette valeur ne sert qu'au gabarit statique
 * (index.html, `<template>`), conservée ici pour que le contrat reste
 * complet. */
function etatDisque(p) {
  if (estEnCours(p)) return "active";
  return "done";
}

function diametrePour(etat, m) {
  return etat === "pending" ? m.diametrePending : m.diametreActifOuTermine;
}

/* --------------------------------------------------------------- disposer */
function disposer(passages, mesures) {
  const m = fusionnerMesures(mesures);
  const liste = Array.isArray(passages) ? passages : [];
  if (!liste.length) {
    return { largeur: 0, hauteur: 0, axeY: 0, agents: [], connecteurs: [] };
  }

  const groupes = construireCreneaux(liste);
  const arcsBruts = detecterRebouclages(liste);

  // -- 1. géométrie par agent, indépendante de la position finale --
  const parPassageIndex = new Map();
  const creneauxAgents = groupes.map((groupe) => {
    return groupe.map(({ passage, index }) => {
      const etat = etatDisque(passage);
      const diametre = diametrePour(etat, m);
      const echec = estEchec(passage);
      const sansCloture = estSansCloture(passage);
      const principal = estPrincipal(passage);
      const nomTexte = passage.agent || "";
      const dureeTexte = texteDuree(passage.duree_ms, passage.termine);
      const fichiersTotal = (passage.fichiers || []).length;
      const demi = Math.max(
        m.diametreActifOuTermine / 2,
        largeurTexte(nomTexte, m.tailleNomPx, m) / 2 + m.margeLabelPx,
        largeurTexte(dureeTexte, m.tailleDureePx, m) / 2 + m.margeLabelPx,
      );
      const a = {
        passageIndex: index,
        agent: passage.agent,
        id: "agent-" + index,
        etat, echec, sansCloture, principal,
        diametre,
        cx: 0, cy: 0,
        demiGauche: demi, demiDroite: demi,
        fichiersAllumes: Math.min(m.fichiersPlafond, Math.max(0, fichiersTotal)),
        outils: Math.max(0, passage.outils || 0),
        fichiersTotal,
        nom: { texte: nomTexte, x: 0, y: 0 },
        duree: { texte: dureeTexte, x: 0, y: 0 },
      };
      parPassageIndex.set(index, a);
      return a;
    });
  });

  // -- 2. placement horizontal séquentiel (un créneau = une colonne) --
  const demiCreneau = creneauxAgents.map((agents) => Math.max(...agents.map((a) => a.demiGauche)));
  let x = m.margeHorizontalePx + demiCreneau[0];
  const xCreneaux = [x];
  for (let i = 1; i < creneauxAgents.length; i++) {
    x += demiCreneau[i - 1] + m.ecartHorizontalPx + demiCreneau[i];
    xCreneaux.push(x);
  }
  const largeur = xCreneaux[xCreneaux.length - 1] + demiCreneau[demiCreneau.length - 1] + m.margeHorizontalePx;

  // -- 3. placement vertical : l'axe se déduit de TOUT ce qui sera tracé --
  //
  // ⚠️ La hauteur ne se dimensionne PAS sur une liste d'éléments énumérée.
  // Elle l'a été (disque, anneau, drapeau, nom, durée) et l'arc de reprise,
  // qui n'appartient à AUCUN agent — il relie deux passages —, est resté
  // dehors : sommet à -62 px pour un canevas commençant à 0, arc tronqué,
  // suite verte. Une garde, comme un calcul, ne couvre que ce que son énoncé
  // NOMME ; un énoncé qui énumère laisse toujours dehors ce qu'il n'a pas
  // listé. D'où le principe ici : l'extension verticale est l'UNION de ce
  // qui est réellement tracé, agents ET connecteurs, et elle se dérive.
  const demiHauteurCreneau = creneauxAgents.map((agents) =>
    agents.length <= 1 ? 0 : ((agents.length - 1) / 2) * m.espacementVerticalPx);
  const demiHauteurMax = Math.max(...demiHauteurCreneau, 0);

  // Décalage de chaque agent par rapport à l'axe : connu AVANT que l'axe le
  // soit, puisqu'il ne dépend que du créneau. C'est ce qui casse la
  // circularité « l'arc dépend des positions, les positions de la hauteur ».
  creneauxAgents.forEach((agents, ci) => {
    const n = agents.length;
    agents.forEach((a, ai) => {
      a.cx = xCreneaux[ci];
      a.dy = n <= 1 ? 0 : (ai - (n - 1) / 2) * m.espacementVerticalPx;
    });
  });

  // Sommet RELATIF de chaque arc de reprise, par les bornes exactes de la
  // Bézier — le point de contrôle n'est pas le sommet peint (22,5 px
  // d'écart mesuré). Un cycle SANS reprise n'ajoute donc rien du tout :
  // pas de « pire cas » imposé à tous.
  const debordementsHautArcs = [];
  arcsBruts.forEach((arc) => {
    const source = parPassageIndex.get(arc.dePassage);
    const cible = parPassageIndex.get(arc.aPassage);
    if (!source || !cible) return;
    const y1 = source.dy - source.diametre / 2;
    const y2 = cible.dy - cible.diametre / 2;
    const sommet = Math.min(y1, y2) - m.repriseElevationPx;
    const bornes = bornesYCourbe(y1, sommet, sommet, y2);
    debordementsHautArcs.push(-bornes.min + m.demiTraitConnecteurPx);
  });

  const extensionHaut = Math.max(
    demiHauteurMax + m.margeHautPx,
    ...debordementsHautArcs,
  );
  const extensionBas = demiHauteurMax + m.margeBasPx;
  const axeY = extensionHaut;
  const hauteur = extensionHaut + extensionBas;

  creneauxAgents.forEach((agents) => {
    agents.forEach((a) => {
      a.cy = axeY + a.dy;
      a.nom.x = a.cx; a.nom.y = a.cy - m.nomDecalageYPx;
      a.duree.x = a.cx; a.duree.y = a.cy + m.dureeDecalageYPx;
    });
  });

  const agentsAPlat = [];
  creneauxAgents.forEach((agents) => agents.forEach((a) => agentsAPlat.push(a)));

  // -- 4. connecteurs séquentiels : chaque agent d'un créneau vers chaque
  // agent du créneau suivant (produit cartésien — dans la quasi-totalité des
  // cas 1×1 ou 1×N/N×1, un créneau empilé n'étant jamais séquentiellement
  // suivi d'un autre créneau empilé dans les données réelles du journal). --
  const connecteurs = [];
  let compteurConnecteur = 0;
  function courbe(x1, y1, x2, y2, ratioC1, ratioC2, yC1, yC2) {
    const c1x = x1 + (x2 - x1) * ratioC1;
    const c2x = x1 + (x2 - x1) * ratioC2;
    return "M " + x1 + " " + y1
      + " C " + c1x + " " + (yC1 === undefined ? y1 : yC1)
      + ", " + c2x + " " + (yC2 === undefined ? y2 : yC2)
      + ", " + x2 + " " + y2;
  }

  for (let ci = 1; ci < creneauxAgents.length; ci++) {
    const precedents = creneauxAgents[ci - 1];
    const suivants = creneauxAgents[ci];
    precedents.forEach((src) => {
      suivants.forEach((dst) => {
        const x1 = src.cx + src.diametre / 2, y1 = src.cy;
        const x2 = dst.cx - dst.diametre / 2, y2 = dst.cy;
        const etat = dst.etat === "active" ? "flowing"
          : (src.etat === "done" && dst.etat === "done") ? "complete" : "pending";
        connecteurs.push({
          id: "lien-" + (compteurConnecteur++),
          etat,
          d: courbe(x1, y1, x2, y2, m.connecteurRatioC1, m.connecteurRatioC2),
        });
      });
    });
  }

  // -- 5. rebouclages : arc élevé, séparé de la chaîne séquentielle --
  arcsBruts.forEach((arc) => {
    const source = parPassageIndex.get(arc.dePassage);
    const cible = parPassageIndex.get(arc.aPassage);
    if (!source || !cible) return;
    const x1 = source.cx, y1 = source.cy - source.diametre / 2;
    const x2 = cible.cx, y2 = cible.cy - cible.diametre / 2;
    const sommetY = Math.min(y1, y2) - m.repriseElevationPx;
    connecteurs.push({
      id: "reprise-" + arc.dePassage + "-" + arc.aPassage,
      etat: "reprise",
      d: courbe(x1, y1, x2, y2, 0.22, 0.78, sommetY, sommetY),
    });
  });

  return { largeur, hauteur, axeY, agents: agentsAPlat, connecteurs };
}

/* Exposé pour être testé isolément (test_app_diagramme.js). */
disposer.MESURES_DEFAUT = MESURES_DEFAUT;
disposer.construireCreneaux = construireCreneaux;
disposer.bornesYCourbe = bornesYCourbe;
disposer.detecterRebouclages = detecterRebouclages;
disposer.texteDuree = texteDuree;
disposer.largeurTexte = largeurTexte;
disposer.etatDisque = etatDisque;
disposer.estEnCours = estEnCours;
disposer.estSansCloture = estSansCloture;
disposer.estEchec = estEchec;
disposer.estPrincipal = estPrincipal;
