"use strict";
/* Module PUR — feature-017, docs/DESIGN-SYSTEM.md §5.
 *
 * Calcule la GÉOMÉTRIE du diagramme de déroulé d'un cycle : un cercle par
 * agent (principal compris quand il est fourni), les agents simultanés
 * empilés dans un créneau unique, les liens entre créneaux, les pastilles
 * d'attente et les arcs de rebouclage.
 *
 * AUCUN DOM ici — ni `document`, ni élément SVG : uniquement de
 * l'arithmétique sur les champs déjà présents dans `passages[]` du journal
 * (`agent`, `debut`, `duree_ms`, `outils`, `fichiers`, `echecs`, `termine`,
 * `etat`, `type`). C'est ce qui permet de le tester SEUL, sans bac à sable
 * DOM (voir `test_app_diagramme.js`), et de le charger tel quel dans un
 * `<script>` classique (pas de `module.exports`, pas d'`import` — CSP
 * `default-src 'self'`, ADR-0006) : les fonctions top-niveau deviennent des
 * globales de la page, exactement comme dans `app.js` et `theme.js`.
 *
 * `app.js` (`construireDiagramme`) est le SEUL appelant en production ; il
 * transforme la géométrie retournée ici en éléments SVG, et lit les jetons de
 * couleur (`var(--a-<rôle>)`, `var(--f-<rôle>)`) — ce module n'écrit AUCUNE
 * couleur, aucun style, aucune valeur qui ne vienne pas de `passages[]`.
 *
 * ============================ Contrat de sortie ==========================
 *
 * disposer(passages, mesures) → {
 *   largeur, hauteur,                 // dimensions totales du tracé (px)
 *   creneaux: [{
 *     index,                          // position du créneau dans la séquence
 *     x,                              // abscisse du centre du créneau
 *     demiLargeur,                    // demi-largeur réservée (lisibilité)
 *     repli: null | { visibles, masques },
 *     agents: [{                      // au plus REPLI_MAX_VISIBLES, dans
 *                                      // l'ordre chronologique du créneau
 *       passageIndex,                 // index dans `passages` d'origine
 *       agent, cx, cy, rayon,
 *       outils, graduationsTotal, graduationsAllumees, plafondAtteint,
 *       fichiers, liseretEpaisseur,
 *       etat, echec, sansCloture, principal, enCours,
 *     }],
 *   }],
 *   liens: [{
 *     deCreneau, aCreneau, attenteMs,
 *     pastille: null | { largeur, hauteur, texte, cx },  // null = pas de pastille
 *     // `cx` (bug-021) : abscisse du CENTRE de la pastille, calculée ICI à
 *     // partir des bords réels des créneaux voisins (creneau.x ± demiLargeur,
 *     // asymétrique quand un créneau empile plusieurs agents) — jamais un
 *     // milieu entre bords de CERCLE recalculé par l'appelant, qui ne
 *     // coïncide pas avec l'espace réellement réservé ici.
 *   }],
 *   arcs:  [{ dePassage, aPassage, agent, hauteurArc }],
 * }
 *
 * Aucun champ n'est inventé : un champ absent de `passages[]` (ex. `outils`
 * manquant sur un journal antérieur) donne 0 ou `false`, jamais une valeur
 * qui laisserait croire à une mesure.
 *
 * `pastille` et `hauteurArc` sont calculés ICI, jamais recalculés par
 * l'appelant : un bug mesuré (bug-020) faisait diverger la largeur RÉSERVÉE
 * pour la pastille (un forfait fixe, ici) de la largeur RENDUE par `app.js`
 * (dépendante du texte, calculée séparément) — la seconde débordait de la
 * première et recouvrait le libellé voisin. Même défaut de principe pour
 * `hauteurArc` : recalculée dans `app.js` sans jamais compter dans
 * l'extension verticale du tracé, elle pouvait dépasser du cadre. La
 * géométrie et sa réservation d'espace doivent venir de LA MÊME
 * fonction — sinon rien ne garantit qu'elles s'accordent.
 */

const MESURES_DEFAUT = Object.freeze({
  echelleOutils: 70,             // §5 design-system : graduations sur une échelle de 70
  seuilAttenteMs: 120000,        // pastille au-delà de deux minutes, STRICT (>)
  rayonMin: 20,
  rayonMax: 56,
  dureeReferenceMs: 20 * 60 * 1000, // durée à partir de laquelle le rayon plafonne
  graduationEspacementPx: 7,     // les graduations ne se touchent jamais
  graduationsMin: 8,
  graduationsMax: 40,
  graduationExtensionPx: 8,      // longueur d'une graduation au-delà du rayon
  espaceLabelPx: 6,              // écart entre le cercle et son libellé (créneau empilé)
  largeurCaracterePx: 6.5,       // estimation de chasse, pile --mono/--sans
  liseretMinPx: 1.5,
  liseretMaxPx: 6,
  liseretFichiersReference: 10,  // nombre de fichiers à partir duquel le liseré plafonne
  espaceMinHorizontalPx: 28,
  espacePastilleMargePx: 12,     // dégagement de part et d'autre de la pastille, EN PLUS de sa largeur mesurée (bug-020 : un forfait fixe ne suit pas la longueur du texte)
  pastilleHauteurPx: 18,
  margeHorizontalePx: 32,
  espaceVerticalEmpilementPx: 10,
  cadrePaddingPx: 8,
  margeHautPx: 24,
  margeBasPx: 24,
  espaceSoclePx: 54,             // heure / durée / nom, sous un créneau simple
  repliMaxVisibles: 4,           // au-delà, repli « 4 + N »
  arcHauteurMinPx: 24,
  arcHauteurMaxPx: 70,
  arcHauteurRatioLargeur: 0.18,  // hauteur de l'arc = ratio × distance horizontale, bornée min/max
  arcDegagementSommetPx: 8,      // marge au-dessus du sommet de l'arc le plus haut (bug-020)
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

/* Un échec ne s'affiche jamais par-dessus « sans clôture » (même garde que
 * `construireChaineEtNotes` dans app.js) : une fin sans annonce n'est ni un
 * succès ni un échec du travail. */
function estEchec(p) { return !!p.echecs && !estSansCloture(p); }

function estPrincipal(p) { return p.type === "principal"; }

/* ------------------------------------------------------- fenêtre temporelle
 * Une fenêtre [debutMs, finMs] par passage, pour détecter la simultanéité.
 * `finMs` retombe sur `debutMs` (fenêtre de largeur nulle) quand la durée
 * n'est pas mesurable — un passage sans durée ne doit jamais être traité
 * comme infiniment long, ni faire échouer le calcul. */
function fenetre(p) {
  const debutMs = versMs(p.debut);
  if (debutMs === null) return { debutMs: null, finMs: null };
  const dureeMs = typeof p.duree_ms === "number" && p.duree_ms >= 0 ? p.duree_ms : 0;
  return { debutMs, finMs: debutMs + dureeMs };
}

/* ------------------------------------------------------------- créneaux --
 * Agents simultanés = créneau unique (§5) : regroupement par FUSION
 * D'INTERVALLES, dans l'ordre d'arrivée de `passages` (jamais retrié par
 * horodatage — un passage sans date connue ouvre toujours son propre
 * créneau, il ne peut fusionner avec rien). */
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

  // Ordre chronologique DANS le créneau (empilement vertical, socle) — un
  // `debutMs` absent reste à sa position d'arrivée (tri stable).
  creneaux.forEach((c) => {
    c.sort((a, b) => {
      if (a.debutMs === null || b.debutMs === null) return 0;
      return a.debutMs - b.debutMs;
    });
  });
  return creneaux;
}

/* ------------------------------------------------------------- rebouclage
 * Même sémantique que `indicesRepris` (app.js) : une réapparition du MÊME
 * agent après qu'au moins un AUTRE agent se soit intercalé. L'agent
 * `principal` est ignoré du calcul de position — il s'intercale par
 * construction entre chaque sous-agent, sa présence seule ne signale rien. */
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
 * Diamètre = durée (échelle bornée, racine carrée pour une PROGRESSION
 * perceptuelle — un agent deux fois plus long n'occupe pas un disque deux
 * fois plus grand en RAYON, ce qui écraserait tout le reste du tracé). */
function calculerRayon(dureeMs, m) {
  if (typeof dureeMs !== "number" || dureeMs <= 0) return m.rayonMin;
  const ratio = Math.min(1, dureeMs / m.dureeReferenceMs);
  return m.rayonMin + (m.rayonMax - m.rayonMin) * Math.sqrt(ratio);
}

/* Graduations : la DENSITÉ s'adapte au rayon (§5, « elles ne se touchent
 * jamais ») — le nombre total de graduations est borné par la circonférence
 * disponible, jamais fixe. Le nombre ALLUMÉ est l'arrondi du ratio
 * outils/échelle sur ce total — c'est la seule notion de « à l'arrondi de
 * l'échelle près » du critère d'acceptation. */
function calculerGraduations(outils, rayon, m) {
  const circonference = 2 * Math.PI * rayon;
  const total = Math.max(m.graduationsMin,
    Math.min(m.graduationsMax, Math.floor(circonference / m.graduationEspacementPx)));
  const bornes = Math.max(0, outils || 0);
  const ratio = Math.min(1, bornes / m.echelleOutils);
  const allumees = Math.min(total, Math.round(ratio * total));
  return { total, allumees, plafondAtteint: bornes >= m.echelleOutils };
}

function calculerLiseret(nbFichiers, m) {
  const n = Math.max(0, nbFichiers || 0);
  const ratio = Math.min(1, n / m.liseretFichiersReference);
  return m.liseretMinPx + (m.liseretMaxPx - m.liseretMinPx) * ratio;
}

/* Estimation de largeur de texte SANS DOM : chasse fixe approximative — ce
 * module n'a accès à aucune métrique de police réelle (aucun `canvas`,
 * aucun `getComputedStyle`). Le rendu réel (app.js) peut rester plus large
 * qu'estimé ici sans jamais être plus ÉTROIT : la marge est délibérément
 * généreuse. */
function largeurTexte(texte, m) { return String(texte || "").length * m.largeurCaracterePx; }

function texteHeure(iso) {
  if (!iso) return "";
  const t = String(iso);
  return t.length >= 19 ? t.slice(11, 19) : t;
}

function texteDuree(dureeMs, termine) {
  if (typeof dureeMs === "number") {
    if (dureeMs < 1000) return dureeMs + " ms";
    if (dureeMs < 60000) return (dureeMs / 1000).toFixed(1) + " s";
    const minutes = Math.floor(dureeMs / 60000);
    return minutes + " min " + Math.round((dureeMs % 60000) / 1000) + " s";
  }
  // Copie fidèle de app.js:901 : `termine` n'est « en cours » que quand il
  // vaut EXPLICITEMENT `false` — `true` ou absent (agent principal jamais
  // clôturé) tombent dans « durée invalide », jamais l'inverse.
  return termine === false ? "en cours" : "durée invalide";
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

/* --------------------------------------------------------------- disposer */
function disposer(passages, mesures) {
  const m = fusionnerMesures(mesures);
  const liste = Array.isArray(passages) ? passages : [];

  if (!liste.length) {
    return { largeur: 0, hauteur: 0, creneaux: [], liens: [], arcs: [] };
  }

  const groupes = construireCreneaux(liste);
  const arcsBruts = detecterRebouclages(liste);

  const creneaux = groupes.map((groupe, indexCreneau) => {
    const total = groupe.length;
    const visibles = groupe.slice(0, m.repliMaxVisibles);
    const masques = Math.max(0, total - m.repliMaxVisibles);

    const agents = visibles.map(({ passage, index }) => {
      const rayon = calculerRayon(
        typeof passage.duree_ms === "number" ? passage.duree_ms : null, m);
      const grad = calculerGraduations(passage.outils, rayon, m);
      const liseretEpaisseur = calculerLiseret((passage.fichiers || []).length, m);
      return {
        passageIndex: index,
        agent: passage.agent,
        cx: 0, cy: 0, rayon,
        outils: passage.outils || 0,
        graduationsTotal: grad.total,
        graduationsAllumees: grad.allumees,
        plafondAtteint: grad.plafondAtteint,
        fichiers: (passage.fichiers || []).length,
        liseretEpaisseur,
        etat: passage.etat,
        echec: estEchec(passage),
        sansCloture: estSansCloture(passage),
        principal: estPrincipal(passage),
        enCours: estEnCours(passage),
        _texteHeure: texteHeure(passage.debut),
        _texteDuree: texteDuree(passage.duree_ms, passage.termine),
      };
    });

    // Demi-largeur : le plus exigeant entre cercle+graduations et le plus
    // long des libellés — jamais l'inverse (§5 : « un petit cercle au nom
    // long s'écarte aussi »). Volontairement SYMÉTRIQUE des deux côtés,
    // même pour un créneau empilé où les libellés passent à droite du
    // cercle : ça coûte un peu de blanc du côté gauche d'un tel créneau,
    // mais ça garantit qu'aucun calcul de recouvrement n'a besoin de
    // connaître le voisin — propriété qu'un test peut vérifier localement,
    // créneau par créneau.
    let demiLargeur = 0;
    agents.forEach((a) => {
      const rayonEtendu = a.rayon + m.graduationExtensionPx;
      const libelleMax = Math.max(
        largeurTexte(a._texteHeure, m), largeurTexte(a._texteDuree, m), largeurTexte(a.agent, m));
      const demiLibelle = libelleMax / 2;
      const exigence = total > 1
        // Créneau empilé : le libellé passe À CÔTÉ du cercle, jamais dessous
        // (§5) — l'extension à droite n'est donc PAS divisée par deux comme
        // dans le cas simple (le libellé n'est pas centré, il est APPENDU).
        // Traiter cette exigence comme une « demi-largeur » symétrique
        // surdimensionne le côté gauche du créneau, mais c'est ce qui permet
        // de garantir qu'aucun créneau voisin ne recouvre jamais son
        // libellé, sans connaître la largeur du voisin.
        ? rayonEtendu + libelleMax
        : Math.max(rayonEtendu, demiLibelle);
      demiLargeur = Math.max(demiLargeur, exigence);
    });
    if (masques > 0) {
      demiLargeur = Math.max(demiLargeur, largeurTexte("+" + masques, m) / 2);
    }

    // Hauteur nécessaire à CE créneau (empilement vertical, §5) — un cadre
    // au filet ajoute un peu de marge quand il y a plus d'un agent.
    let hauteurCreneau = 0;
    agents.forEach((a, i) => {
      if (i > 0) hauteurCreneau += m.espaceVerticalEmpilementPx;
      hauteurCreneau += 2 * a.rayon;
    });
    if (total > 1) hauteurCreneau += 2 * m.cadrePaddingPx;

    return {
      index: indexCreneau,
      x: 0, // posé après coup, une fois toutes les demi-largeurs connues
      demiLargeur,
      hauteurCreneau,
      repli: masques > 0 ? { visibles: agents.length, masques } : null,
      agents,
    };
  });

  // Placement horizontal séquentiel — l'écart NE mesure PAS le temps (§5) :
  // chaque créneau réclame sa propre demi-largeur, plus celle de son voisin,
  // plus une pastille d'attente quand l'écart réel dépasse le seuil.
  const liens = [];
  let x = m.margeHorizontalePx + creneaux[0].demiLargeur;
  creneaux[0].x = x;
  for (let i = 1; i < creneaux.length; i++) {
    const finPrecedente = finMaxDuGroupe(groupes[i - 1]);
    const debutSuivante = debutMinDuGroupe(groupes[i]);
    const attenteMs = (finPrecedente !== null && debutSuivante !== null)
      ? Math.max(0, debutSuivante - finPrecedente) : null;
    const attenteDepassee = attenteMs !== null && attenteMs > m.seuilAttenteMs;
    // Pastille calculée ICI, jamais recalculée par l'appelant (bug-020) : la
    // largeur RÉSERVÉE (gapSupplementaire, ci-dessous) et la largeur RENDUE
    // (app.js) viennent du même nombre — plus de forfait fixe qui déborde.
    const texteAttente = attenteDepassee ? "⏳ " + texteDuree(attenteMs) : null;
    const pastille = attenteDepassee
      ? { largeur: Math.max(30, largeurTexte(texteAttente, m)), hauteur: m.pastilleHauteurPx, texte: texteAttente }
      : null;

    const gapSupplementaire = pastille ? pastille.largeur + m.espacePastilleMargePx : 0;
    x += creneaux[i - 1].demiLargeur + m.espaceMinHorizontalPx + gapSupplementaire + creneaux[i].demiLargeur;
    creneaux[i].x = x;

    // `cx` (bug-021) : centre de l'espace RÉELLEMENT réservé entre les deux
    // créneaux — bord droit du créneau précédent (x + demiLargeur, pas le
    // rayon d'un cercle) et bord gauche du suivant (x - demiLargeur,
    // asymétrique si ce créneau empile plusieurs agents). C'est cette même
    // valeur que `app.js` doit peindre, jamais un milieu recalculé depuis
    // d'autres bords (bug-021).
    if (pastille) {
      const bordDroitPrecedent = creneaux[i - 1].x + creneaux[i - 1].demiLargeur;
      const bordGaucheCourant = creneaux[i].x - creneaux[i].demiLargeur;
      pastille.cx = (bordDroitPrecedent + bordGaucheCourant) / 2;
    }

    liens.push({ deCreneau: i - 1, aCreneau: i, attenteMs, pastille });
  }

  const largeur = x + creneaux[creneaux.length - 1].demiLargeur + m.margeHorizontalePx;

  // Rebouclages : la hauteur de l'arc le plus haut (§ci-dessus, même formule
  // que l'ancien calcul dans app.js) doit être comptée dans l'extension
  // VERTICALE (bug-020) — sinon l'apex sort du cadre. Se base sur les
  // abscisses de créneau, déjà connues (placement horizontal ci-dessus) ;
  // un agent replié (repli, §5) n'a pas d'abscisse propre trouvable et son
  // arc ne sera de toute façon jamais tracé par `app.js` — il n'entre donc
  // pas dans ce calcul, exactement comme dans le rendu.
  function xDuPassage(passageIndex) {
    for (const c of creneaux) {
      for (const a of c.agents) {
        if (a.passageIndex === passageIndex) return c.x;
      }
    }
    return null;
  }
  const arcs = arcsBruts.map((arc) => {
    const x1 = xDuPassage(arc.dePassage);
    const x2 = xDuPassage(arc.aPassage);
    const hauteurArc = (x1 === null || x2 === null || x2 <= x1) ? 0
      : Math.max(m.arcHauteurMinPx, Math.min(m.arcHauteurMaxPx, (x2 - x1) * m.arcHauteurRatioLargeur));
    return Object.assign({}, arc, { hauteurArc });
  });
  const maxHauteurArc = arcs.reduce((max, a) => Math.max(max, a.hauteurArc), 0);

  // Placement vertical : chaque créneau est centré sur un même axe médian —
  // seule la hauteur totale (déterminée par le PLUS grand créneau) varie.
  // `margeHautPx` grandit pour loger le plus haut des arcs de rebouclage
  // (bug-020) : le point le plus haut de N'IMPORTE QUEL cercle du tracé est
  // TOUJOURS à `margeHautPx` du bord (propriété du placement vertical
  // ci-dessous, atteinte par le plus grand cercle simple), donc réserver
  // `maxHauteurArc + arcDegagementSommetPx` au-dessus garantit qu'aucun arc
  // ne dépasse, quels que soient les deux agents qu'il relie.
  const margeHautPx = maxHauteurArc > 0
    ? Math.max(m.margeHautPx, maxHauteurArc + m.arcDegagementSommetPx) : m.margeHautPx;
  const hauteurMaxCreneau = Math.max(...creneaux.map((c) => c.hauteurCreneau));
  const centreVertical = margeHautPx + hauteurMaxCreneau / 2;
  const hauteur = margeHautPx + hauteurMaxCreneau + m.espaceSoclePx + m.margeBasPx;

  creneaux.forEach((c) => {
    let y = centreVertical - c.hauteurCreneau / 2 + (c.agents.length > 1 ? c.agents[0].rayon + m.cadrePaddingPx
      : c.agents[0].rayon);
    c.agents.forEach((a, i) => {
      a.cx = c.x;
      a.cy = y;
      if (i < c.agents.length - 1) y += a.rayon + m.espaceVerticalEmpilementPx + c.agents[i + 1].rayon;
    });
    // champs de travail internes, pas dans le contrat de sortie documenté
    delete c.hauteurCreneau;
    c.agents.forEach((a) => { delete a._texteHeure; delete a._texteDuree; });
  });

  return { largeur, hauteur, creneaux, liens, arcs };
}

/* Exposé pour être testé isolément (test_app_diagramme.js) sans reconstruire
 * tout `disposer` — mêmes fonctions que celles réellement appelées.
 *
 * `texteHeure`, `texteDuree` et `largeurTexte` sont exposées en plus (feature-017,
 * correctif suite au verdict code-reviewer) pour que le harnais reconstitue la
 * boîte de libellé RÉELLEMENT peinte par `app.js` — avec la MÊME estimation de
 * largeur que celle qui a servi à réserver l'espace ici — sans jamais relire
 * `creneau.demiLargeur` : une garde qui compare `disposer()` à lui-même via ce
 * champ ne prouve rien de la place réellement peinte (garde tautologique
 * identifiée en revue). */
disposer.MESURES_DEFAUT = MESURES_DEFAUT;
disposer.calculerRayon = calculerRayon;
disposer.calculerGraduations = calculerGraduations;
disposer.detecterRebouclages = detecterRebouclages;
disposer.construireCreneaux = construireCreneaux;
disposer.texteHeure = texteHeure;
disposer.texteDuree = texteDuree;
disposer.largeurTexte = largeurTexte;
