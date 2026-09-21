"use strict";
/* Maquette feature-021 — U2/U3, second passage ux-ui-designer (2026-09-19).
 *
 * Fichier JAMAIS chargé par le produit réel (`control-center/web/` n'y
 * touche pas) : script CLASSIQUE (pas de `type="module"`, refusé en
 * `file://`), aucune dépendance, aucun accès réseau. Toutes les données
 * ci-dessous sont des DONNÉES DE DÉMONSTRATION, jamais lues depuis un
 * journal réel — PIEGES §16 rappelle qu'un tableau de bord ne doit jamais
 * promettre une donnée qu'il ne mesure pas ; ici, rien n'est promis, tout
 * est explicitement une maquette.
 *
 * Trois signatures RÉELLEMENT fonctionnelles (U3) :
 *  - S1 : champ de particules (canvas) sous le diagramme — voir §S1.
 *  - S2 : chronomètre 56px qui tourne à la seconde, gelable — voir §S2.
 *  - S3 : puits (panneau Cycle) contre bureau (les quatre autres) — posé en
 *    CSS uniquement (voir la feuille de style), complété ici par la
 *    pulsation de la pastille d'attente et son arrêt au changement d'agent.
 */

function $(id) { return document.getElementById(id); }

/* ============================================================ thème ==== */
const mqSombre = (typeof matchMedia === "function")
  ? matchMedia("(prefers-color-scheme: dark)") : null;

function attributeThemeActuel() {
  return document.documentElement.getAttribute("data-theme");
}
function positionActiveTheme() {
  const choix = attributeThemeActuel();
  if (choix === "clair") return "theme-clair";
  if (choix === "sombre") return "theme-sombre";
  return "theme-systeme";
}
function appliquerTheme(choix) {
  const racine = document.documentElement;
  if (choix === "clair" || choix === "sombre") racine.setAttribute("data-theme", choix);
  else racine.removeAttribute("data-theme");
  rafraichirCommandeTheme();
}
const BOUTONS_THEME = ["theme-clair", "theme-systeme", "theme-sombre"];
function idVersChoixTheme(id) {
  return id === "theme-clair" ? "clair" : id === "theme-sombre" ? "sombre" : "systeme";
}
function rafraichirCommandeTheme() {
  const active = positionActiveTheme();
  BOUTONS_THEME.forEach((id) => {
    const bouton = $(id);
    if (!bouton) return;
    const coche = id === active;
    bouton.setAttribute("aria-checked", coche ? "true" : "false");
    bouton.tabIndex = coche ? 0 : -1;
  });
}
BOUTONS_THEME.forEach((id, index) => {
  const bouton = $(id);
  if (!bouton) return;
  bouton.addEventListener("click", () => appliquerTheme(idVersChoixTheme(id)));
  bouton.addEventListener("keydown", (evenement) => {
    const touche = evenement.key;
    let indexSuivant;
    if (touche === "ArrowRight" || touche === "ArrowDown") indexSuivant = (index + 1) % BOUTONS_THEME.length;
    else if (touche === "ArrowLeft" || touche === "ArrowUp") indexSuivant = (index - 1 + BOUTONS_THEME.length) % BOUTONS_THEME.length;
    else if (touche === "Home") indexSuivant = 0;
    else if (touche === "End") indexSuivant = BOUTONS_THEME.length - 1;
    else return;
    evenement.preventDefault();
    const suivant = BOUTONS_THEME[indexSuivant];
    appliquerTheme(idVersChoixTheme(suivant));
    const boutonSuivant = $(suivant);
    if (boutonSuivant && boutonSuivant.focus) boutonSuivant.focus();
  });
});
if (mqSombre) mqSombre.addEventListener("change", () => { if (positionActiveTheme() === "theme-systeme") rafraichirCommandeTheme(); });
rafraichirCommandeTheme();

/* =============================================== réduction de mouvement ==
 * `* { animation: none }` (feuille de style) couvre la pulsation CSS pure
 * de `.pastille-etat`, mais PAS la boucle `requestAnimationFrame` de S1 ni
 * le `setInterval` de S2 (PIEGES, note du brief). Les deux sont donc gérés
 * ICI, en écoutant `matchMedia` et son événement `change` — jamais en
 * lisant la préférence une seule fois au chargement. */
const mqReduit = (typeof matchMedia === "function")
  ? matchMedia("(prefers-reduced-motion: reduce)") : null;
let forcerReduitDemo = false; // bouton de démonstration, voir §démo
function reduitActif() { return Boolean((mqReduit && mqReduit.matches) || forcerReduitDemo); }
const ecouteursReduit = [];
function surChangementReduit(fn) { ecouteursReduit.push(fn); }
function notifierChangementReduit() { ecouteursReduit.forEach((fn) => fn(reduitActif())); }
if (mqReduit) mqReduit.addEventListener("change", notifierChangementReduit);

/* ============================================================ données ===
 * DÉMONSTRATION UNIQUEMENT — un cycle réel n'a ni ce nom de champ ni cette
 * fraîcheur. Sigles repris de la maquette de référence (2026-09-15),
 * complétés pour les deux rôles qu'elle ne portait pas. */
const SIGLE = {
  "spec-reader": "SP", "debugger": "DB", "test-engineer": "TE",
  "frontend-developer": "FE", "code-reviewer": "CR", "security-reviewer": "SE",
  "backend-developer": "BD", "doc-writer": "DW",
};
function rgbToken(role) { return `var(--a-${role})`; }
function fToken(role) { return `var(--f-${role})`; }

const dur = (s) => s >= 60 ? Math.floor(s / 60) + " min " + String(s % 60).padStart(2, "0") : s + " s";
const hm = (s) => { const h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60; return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"); };

/* rayon = 11 + 0.80·√(durée_s), plafonné à 56 — formule reprise de
 * `control-center/web/diagramme.js` (MESURES_DEFAUT), même grammaire. */
function rayonAgent(dureeS) { return Math.min(11 + 0.80 * Math.sqrt(Math.max(dureeS, 1)), 56); }

const CYCLES_DEMO = [
  {
    id: "feature-021", statut: "en_cours",
    nom: "feature-021 — revenir à un tableau de bord unifié",
    debutOffsetS: 462, // durée déjà écoulée à l'ouverture de la maquette
    passages: [
      { agent: "spec-reader", debut: 0, dureeS: 96, outils: 22, fichiers: 1 },
      { agent: "architect", role: "backend-developer", debut: 100, dureeS: 140, outils: 8, fichiers: 0 },
      { agent: "test-engineer", debut: 250, dureeS: 60, outils: 14, fichiers: 0, sansCloture: true },
      { agent: "frontend-developer", debut: 320, dureeS: 142, outils: 44, fichiers: 3, enCours: true },
    ],
    rebouclages: [],
    empile: null,
  },
  {
    id: "bug-018", statut: "termine",
    nom: "bug-018 — la suite est verte en root et rouge en CI",
    dureeTotaleS: 2380,
    passages: [
      { agent: "spec-reader", debut: 0, dureeS: 88, outils: 19, fichiers: 1 },
      { agent: "debugger", debut: 95, dureeS: 640, outils: 71, fichiers: 2 },
      { agent: "test-engineer", debut: 760, dureeS: 210, outils: 26, fichiers: 1 },
      { agent: "debugger", debut: 1010, dureeS: 95, outils: 12, fichiers: 1, repriseDe: 1 },
      { agent: "code-reviewer", debut: 1140, dureeS: 300, outils: 33, fichiers: 0 },
    ],
    rebouclages: [[1, 3]],
    empile: null,
  },
  {
    id: "feature-020", statut: "termine",
    nom: "feature-020 — conformité du diagramme à la maquette",
    dureeTotaleS: 4820,
    passages: [
      { agent: "spec-reader", debut: 0, dureeS: 140, outils: 24, fichiers: 1 },
      { agent: "frontend-developer", debut: 150, dureeS: 1980, outils: 68, fichiers: 4 },
      { agent: "test-engineer", debut: 2160, dureeS: 420, outils: 31, fichiers: 2 },
      { agent: "code-reviewer", debut: 2620, dureeS: 260, outils: 18, fichiers: 0 },
    ],
    rebouclages: [],
    // groupe simultané de démonstration : deux agents qui se recouvrent
    empile: { debut: 2600, membres: [
      { agent: "doc-writer", debut: 2610, dureeS: 180, outils: 9, fichiers: 2 },
      { agent: "security-reviewer", debut: 2620, dureeS: 150, outils: 6, fichiers: 0 },
    ] },
  },
  {
    id: "bug-017", statut: "termine",
    nom: "bug-017 — jusqu'à 6 contrôles restent atteignables sous la modale",
    dureeTotaleS: 1560,
    passages: [
      { agent: "spec-reader", debut: 0, dureeS: 70, outils: 15, fichiers: 1 },
      { agent: "frontend-developer", debut: 75, dureeS: 640, outils: 39, fichiers: 2 },
      { agent: "test-engineer", debut: 720, dureeS: 210, outils: 21, fichiers: 1 },
    ],
    rebouclages: [],
    empile: null,
  },
];

/* ==================================================== roving tabindex ===
 * Un seul helper, réutilisé pour la bande de cycles (`role="tablist"`,
 * seul motif de ce type qui subsiste après la révocation des onglets de
 * section) — flèches gauche/droite/haut/bas + Origine/Fin, focus qui suit
 * la sélection. */
function activerRovingTabindex(boutons, onActiver) {
  boutons.forEach((bouton, index) => {
    bouton.addEventListener("click", () => onActiver(index, true));
    bouton.addEventListener("keydown", (evenement) => {
      const touche = evenement.key;
      let suivant;
      if (touche === "ArrowRight" || touche === "ArrowDown") suivant = (index + 1) % boutons.length;
      else if (touche === "ArrowLeft" || touche === "ArrowUp") suivant = (index - 1 + boutons.length) % boutons.length;
      else if (touche === "Home") suivant = 0;
      else if (touche === "End") suivant = boutons.length - 1;
      else return;
      evenement.preventDefault();
      onActiver(suivant, true);
      const cible = boutons[suivant];
      if (cible && cible.focus) cible.focus();
    });
  });
}

/* ============================================================ S1 —— ====
 * Champ de particules. Cible réelle (spec) : `OffscreenCanvas` transféré à
 * un Worker de MÊME ORIGINE (mesuré autorisé, A2 de la spec). Les Web
 * Workers sont BLOQUÉS en `file://` (contrainte de cette maquette, pas de
 * la cible) : ce qui suit est le REPLI DÉJÀ PRÉVU par la spec — même
 * simulation sur le fil principal, en `requestAnimationFrame`. La variante
 * Worker appartient au cycle 2, sous HTTP, où elle est mesurée atteignable.
 *
 * Densité d'émission = débit RÉEL d'un flux d'événements simulé (une
 * rafale d'appels d'outils fait un essaim, un silence laisse le champ
 * vide) — jamais un minuteur régulier, ce serait l'effet décoratif que la
 * spec interdit. */
let ctxParticules = null;
let particules = [];
let rafId = null;
let simulationEnPause = false; // IntersectionObserver — optimisation invisible

function initParticules() {
  const canvas = $("particules");
  if (!canvas) return null;
  // Repli « absence de WebGL / getContext refusé » : jamais d'écran blanc,
  // le SVG du diagramme reste seul si le canevas 2D n'est pas disponible.
  let ctx = null;
  try {
    ctx = canvas.getContext("2d");
  } catch (erreur) {
    ctx = null;
  }
  if (!ctx) {
    canvas.remove();
    return null;
  }
  return ctx;
}

function redimensionnerCanvas() {
  const canvas = $("particules");
  const cadre = $("diagramme-cadre");
  if (!canvas || !cadre) return;
  const rect = cadre.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  if (ctxParticules) ctxParticules.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function emettreParticule(point) {
  if (!ctxParticules || reduitActif() || simulationEnPause) return;
  particules.push({
    x: point.x, y: point.y,
    vx: 0.55 + Math.random() * 0.5, // dérive dans le sens du déroulé (droite)
    vy: (Math.random() - 0.5) * 0.3,
    ne: performance.now(),
    vieMs: 3600 + Math.random() * 900, // ~4s
    couleur: point.couleur,
  });
  if (particules.length > 400) particules.splice(0, particules.length - 400);
}

function dessinerParticules() {
  if (!ctxParticules) return;
  const canvas = $("particules");
  const dpr = window.devicePixelRatio || 1;
  const largeur = canvas.width / dpr, hauteur = canvas.height / dpr;
  ctxParticules.clearRect(0, 0, largeur, hauteur);
  const maintenant = performance.now();
  particules = particules.filter((p) => (maintenant - p.ne) < p.vieMs);
  particules.forEach((p) => {
    const age = (maintenant - p.ne) / p.vieMs;
    p.x += p.vx; p.y += p.vy;
    ctxParticules.globalAlpha = Math.max(0, 1 - age);
    ctxParticules.fillStyle = p.couleur;
    ctxParticules.beginPath();
    ctxParticules.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
    ctxParticules.fill();
  });
  ctxParticules.globalAlpha = 1;
}

function boucleParticules() {
  if (reduitActif()) { rafId = null; return; } // repli : champ figé sur le dernier état peint
  dessinerParticules();
  rafId = requestAnimationFrame(boucleParticules);
}
function demarrerBoucleParticules() {
  if (rafId != null || reduitActif() || simulationEnPause || !ctxParticules) return;
  rafId = requestAnimationFrame(boucleParticules);
}
function arreterBoucleParticules() {
  if (rafId != null) { cancelAnimationFrame(rafId); rafId = null; }
}
surChangementReduit((reduit) => { if (reduit) arreterBoucleParticules(); else demarrerBoucleParticules(); });

// Optimisation invisible (U3, « effet retiré réutilisé ») : la simulation
// se met en pause quand le panneau sort de la fenêtre, sans rien changer à
// l'information montrée puisqu'aucune particule n'est perdue de vue.
let observateurDiagramme = null;
function initObservateurVisibilite() {
  if (typeof IntersectionObserver !== "function") return;
  const cadre = $("diagramme-cadre");
  if (!cadre) return;
  observateurDiagramme = new IntersectionObserver((entrees) => {
    entrees.forEach((entree) => {
      simulationEnPause = !entree.isIntersecting;
      if (simulationEnPause) arreterBoucleParticules(); else demarrerBoucleParticules();
    });
  }, { threshold: 0.01 });
  observateurDiagramme.observe(cadre);
}

/* Générateur de rafale synthétique : simule un flux d'appels d'outils
 * irrégulier (rythme réel, pas un minuteur constant) tant que le cycle
 * affiché est « en cours ». */
let minuteurRafale = null;
function planifierProchaineRafale(agentEnCoursCentre) {
  if (minuteurRafale) clearTimeout(minuteurRafale);
  const delai = 180 + Math.random() * 900; // entre rafales : rythme irrégulier
  minuteurRafale = setTimeout(() => {
    if (!agentEnCoursCentre) return;
    const tailleRafale = Math.random() < 0.35 ? 0 : 1 + Math.floor(Math.random() * 7);
    for (let i = 0; i < tailleRafale; i++) {
      emettreParticule({
        x: agentEnCoursCentre.x + (Math.random() - 0.5) * 6,
        y: agentEnCoursCentre.y + (Math.random() - 0.5) * 6,
        couleur: agentEnCoursCentre.couleur,
      });
    }
    planifierProchaineRafale(agentEnCoursCentre);
  }, delai);
}
function arreterRafales() { if (minuteurRafale) { clearTimeout(minuteurRafale); minuteurRafale = null; } }

/* ============================================================ S2 —— ====
 * Chronomètre vedette, 56px. Tourne à la seconde ; se fige (comportement le
 * plus important à donner à voir ici) sur fin de cycle OU chute simulée du
 * flux, ET en `prefers-reduced-motion: reduce` la cadence tombe à la minute
 * sans perte d'information (le repli n'affiche jamais moins que ce que
 * l'utilisateur voyait). */
let chronoMinuteur = null;
let chronoDepart = null; // Date.now() de référence
let chronoFigeS = null;  // durée gelée, si figé

function texteChrono(totalS) {
  const h = Math.floor(totalS / 3600);
  const m = Math.floor((totalS % 3600) / 60);
  const s = totalS % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}
function rafraichirAffichageChrono() {
  const el = $("chrono-texte");
  if (!el) return;
  const totalS = chronoFigeS != null ? chronoFigeS : Math.floor((Date.now() - chronoDepart) / 1000);
  el.textContent = texteChrono(totalS);
}
function relancerMinuteurChrono() {
  if (chronoMinuteur) clearInterval(chronoMinuteur);
  if (chronoFigeS != null) return; // figé : rien à programmer
  const pas = reduitActif() ? 60000 : 1000; // repli reduced-motion : cadence à la minute
  chronoMinuteur = setInterval(rafraichirAffichageChrono, pas);
}
function demarrerChrono(dejaEcouleS) {
  chronoFigeS = null;
  chronoDepart = Date.now() - dejaEcouleS * 1000;
  const chrono = $("chrono");
  if (chrono) chrono.dataset.fige = "faux";
  rafraichirAffichageChrono();
  relancerMinuteurChrono();
}
function figerChrono(totalS) {
  if (chronoMinuteur) clearInterval(chronoMinuteur);
  chronoFigeS = totalS;
  const chrono = $("chrono");
  if (chrono) chrono.dataset.fige = "vrai";
  rafraichirAffichageChrono();
}
surChangementReduit(() => relancerMinuteurChrono());

/* Pastille d'attente : la pulsation elle-même est une classe CSS pure
 * (couverte par `@media (prefers-reduced-motion: reduce)` dans la feuille
 * de style — aucun code ici pour ce cas). Ce qui suit gère seulement
 * QUAND la classe est posée : elle cesse de battre dès que l'agent suivant
 * démarre (comportement fonctionnel, indépendant de reduced-motion). */
function definirPastilleAttente(enAttente, texte) {
  const pastille = $("pastille-attente");
  const libelle = $("pastille-attente-texte");
  if (pastille) pastille.classList.toggle("en-attente", Boolean(enAttente));
  if (libelle) libelle.textContent = texte;
}

/* ======================================================= diagramme (S1
 * s'appuie dessus) — GRAMMAIRE REPRISE de
 * control-center/maquettes/2026-09-15-diagramme-reference.html et de
 * control-center/web/diagramme.js (mêmes classes `.dg-*`, mêmes jetons,
 * mêmes formules de rayon/graduations). Géométrie SIMPLIFIÉE pour une
 * maquette de démonstration : espacement fixe entre créneaux plutôt que
 * l'ajustement au texte de la version pleine — le diagramme n'est
 * conceptuellement PAS redessiné, sa mise en œuvre ici est allégée. */
const NS = "http://www.w3.org/2000/svg";
function svgEl(nom, attrs, texte) {
  const e = document.createElementNS(NS, nom);
  for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
  if (texte !== undefined) e.textContent = texte;
  return e;
}

function dessinerDiagramme(cycle) {
  const svg = $("dg-svg");
  if (!svg) return null;
  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const passages = cycle.passages;
  if (!passages || passages.length === 0) return null;

  const ECART = 92, MARGE = 30;
  const axeY = 84;
  const largeur = MARGE * 2 + ECART * (passages.length - 1) + (cycle.empile ? 90 : 0);
  const hauteur = 190;
  svg.setAttribute("width", largeur);
  svg.setAttribute("height", hauteur);
  svg.setAttribute("viewBox", `0 0 ${largeur} ${hauteur}`);

  const centres = [];
  passages.forEach((p, i) => {
    const cx = MARGE + i * ECART;
    const r = rayonAgent(p.dureeS);
    centres.push({ x: cx, y: axeY, r, agent: p, couleur: rgbToken(p.role || p.agent) });
  });

  // liens séquentiels sur l'axe, flèche à l'arrivée, pastille d'attente
  // au-delà de 120s (même seuil que la version pleine)
  for (let i = 0; i < centres.length - 1; i++) {
    const a = centres[i], b = centres[i + 1];
    const x1 = a.x + a.r + 4, x2 = b.x - b.r - 4;
    svg.appendChild(svgEl("line", { class: "dg-lien", x1, y1: axeY, x2, y2: axeY }));
    svg.appendChild(svgEl("path", {
      class: "dg-lien-pointe", fill: "none",
      d: `M ${x2 - 5} ${axeY - 2.6} L ${x2} ${axeY} L ${x2 - 5} ${axeY + 2.6}`,
    }));
    const attenteS = b.agent.debut - (a.agent.debut + a.agent.dureeS);
    if (attenteS > 120) {
      const mx = (x1 + x2) / 2;
      svg.appendChild(svgEl("g", { class: "dg-pastille-attente" }, undefined));
      const g = svg.lastChild;
      g.appendChild(svgEl("rect", { x: mx - 30, y: axeY - 9, width: 60, height: 18, rx: 9 }));
      g.appendChild(svgEl("text", { x: mx, y: axeY + 4, "text-anchor": "middle" }, "attente " + Math.round(attenteS / 60) + "m"));
    }
  }

  // groupe simultané de démonstration (cadre-simultane) — n'apparaît que
  // pour le cycle qui en déclare un, pour montrer la grammaire au complet
  if (cycle.empile) {
    const x0 = largeur - 96, y0 = axeY - 60, w = 80, h = 120;
    svg.appendChild(svgEl("rect", { class: "dg-cadre-simultane", x: x0, y: y0, width: w, height: h, rx: 8 }));
    svg.appendChild(svgEl("text", { class: "dg-libelle-cadre", x: x0 + 8, y: y0 + h - 8, "font-size": 10 }, cycle.empile.membres.length + " agents en parallèle"));
    let y = y0 + 16;
    cycle.empile.membres.forEach((m) => {
      const r = Math.min(rayonAgent(m.dureeS), 16);
      const cy = y + r;
      peindreAgent(svg, { x: x0 + 20, y: cy, r, agent: m, couleur: rgbToken(m.role || m.agent) }, false);
      svg.appendChild(svgEl("text", { x: x0 + 40, y: cy + 3, "font-size": 9.5, class: "dg-socle-nom" }, m.agent));
      y += 2 * r + 10;
    });
  }

  // rebouclages
  (cycle.rebouclages || []).forEach(([iDe, iVers]) => {
    const de = centres[iDe], vers = centres[iVers];
    if (!de || !vers) return;
    const sommetY = 18;
    svg.appendChild(svgEl("path", {
      class: "dg-arc-rebouclage",
      d: `M ${de.x} ${de.y - de.r - 10} C ${de.x} ${sommetY}, ${vers.x} ${sommetY}, ${vers.x} ${vers.y - vers.r - 10}`,
    }));
    svg.appendChild(svgEl("text", { class: "dg-arc-libelle", x: (de.x + vers.x) / 2, y: sommetY - 4, "text-anchor": "middle", "font-size": 10.5 }, "↻ reboucle"));
  });

  let centreEnCours = null;
  centres.forEach((c) => {
    peindreAgent(svg, c, true);
    if (c.agent.enCours) centreEnCours = c;
  });

  return centreEnCours;
}

function peindreAgent(svg, c, avecSocle) {
  const { x: cx, y: cy, r, agent, couleur } = c;
  const echelleOutils = 70;
  const TK = r < 22 ? 24 : r < 32 ? 36 : 52;
  const n = Math.round(TK * Math.min((agent.outils || 0) / echelleOutils, 1));
  const r0 = r + 4;
  svg.appendChild(svgEl("circle", { class: "dg-guide", cx, cy, r: r0 + 3.5, stroke: "var(--trait-fin)" }));
  for (let i = 0; i < TK; i++) {
    const allumee = i < n;
    const g = (-90 + 2.4 + i * (360 - 4.8) / TK) * Math.PI / 180;
    const ext = allumee ? 7 : 3.2;
    svg.appendChild(svgEl("line", {
      class: "dg-graduation",
      x1: cx + Math.cos(g) * r0, y1: cy + Math.sin(g) * r0,
      x2: cx + Math.cos(g) * (r0 + ext), y2: cy + Math.sin(g) * (r0 + ext),
      stroke: allumee ? couleur : "var(--trait)",
      "stroke-width": allumee ? 1.8 : 1,
    }));
  }
  svg.appendChild(svgEl("circle", {
    class: "dg-cercle " + (agent.sansCloture ? "dg-contour-pointille" : "dg-contour-plein"),
    cx, cy, r, fill: fToken(agent.role || agent.agent),
    stroke: agent.enCours ? couleur : "var(--trait)",
    "stroke-width": agent.enCours ? 1.8 : 1,
  }));
  if (agent.fichiers) {
    svg.appendChild(svgEl("circle", {
      class: "dg-liseret", cx, cy, r: Math.max(r - 4, 2), fill: "none", stroke: couleur,
      opacity: (0.22 + Math.min(agent.fichiers, 8) / 8 * 0.45).toFixed(2),
    }));
  }
  if (agent.enCours) {
    svg.appendChild(svgEl("circle", { class: "dg-anneau-en-cours", cx, cy, r: r + 3.5, fill: "none", stroke: couleur, opacity: .45 }));
  }
  svg.appendChild(svgEl("text", { class: "dg-sigle", x: cx, y: cy + 3.6, "text-anchor": "middle", "font-size": r > 26 ? 11 : 9.5, fill: couleur }, SIGLE[agent.role || agent.agent] || "??"));

  if (avecSocle) {
    const yb = cy + r + 17;
    svg.appendChild(svgEl("text", { class: "dg-socle-heure", x: cx, y: yb, "text-anchor": "middle" }, hm(agent.debut)));
    svg.appendChild(svgEl("text", {
      class: "dg-socle-duree" + (agent.enCours ? " actif" : ""), x: cx, y: yb + 16, "text-anchor": "middle",
    }, dur(agent.dureeS)));
    svg.appendChild(svgEl("text", { class: "dg-socle-nom", x: cx, y: yb + 30, "text-anchor": "middle" }, agent.role || agent.agent));
  }
}

/* Empreinte figée d'un cycle terminé (« le champ se fige sur l'empreinte
 * accumulée, propre à ce cycle ») : un motif STATIQUE et DÉTERMINISTE
 * dérivé du nombre d'appels d'outils du cycle — jamais aléatoire à chaque
 * affichage, sinon deux ouvertures de la même maquette montreraient deux
 * empreintes différentes pour un même cycle clos. */
function empreinteFigee(cycle) {
  const total = cycle.passages.reduce((s, p) => s + (p.outils || 0), 0);
  let graine = total * 2654435761 % 2147483647;
  const alea = () => { graine = (graine * 16807) % 2147483647; return graine / 2147483647; };
  const points = [];
  cycle.passages.forEach((p, i) => {
    const cx = 30 + i * 92;
    const n = Math.min(Math.round((p.outils || 0) / 4), 40);
    for (let k = 0; k < n; k++) {
      points.push({
        x: cx + (alea() - 0.5) * 70,
        y: 84 + (alea() - 0.5) * 40,
        couleur: rgbToken(p.role || p.agent),
      });
    }
  });
  return points;
}
function peindreEmpreinteFigee(points) {
  if (!ctxParticules) return;
  const canvas = $("particules");
  const dpr = window.devicePixelRatio || 1;
  ctxParticules.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
  points.forEach((p) => {
    ctxParticules.globalAlpha = 0.55;
    ctxParticules.fillStyle = p.couleur;
    ctxParticules.beginPath();
    ctxParticules.arc(p.x, p.y, 1.6, 0, Math.PI * 2);
    ctxParticules.fill();
  });
  ctxParticules.globalAlpha = 1;
}

/* ================================================= sélection du cycle ===
 * Bande `role="tablist"` : SEUL motif ARIA à onglets qui subsiste après la
 * révocation de la navigation par section (amendement accepté le
 * 2026-09-19). Le cycle le plus récent (index 0) est déjà affiché sans
 * aucun clic ; la sélection ne sert qu'à consulter un cycle ANTÉRIEUR. */
let etatVideActif = false;

function afficherCycle(index) {
  const cycle = CYCLES_DEMO[index];
  if (!cycle) return;

  const onglets = CYCLES_DEMO.map((_, i) => $("cycle-tab-" + i));
  onglets.forEach((o, i) => {
    if (!o) return;
    o.setAttribute("aria-selected", i === index ? "true" : "false");
    o.tabIndex = i === index ? 0 : -1;
  });

  $("cycle-nom").textContent = cycle.nom;
  arreterRafales();

  if (etatVideActif) return; // l'état vide écrase le rendu, voir §démo

  if (cycle.statut === "en_cours") {
    demarrerChrono(cycle.debutOffsetS);
    const dernier = cycle.passages[cycle.passages.length - 1];
    $("cycle-agent-actuel-nom").textContent = dernier.agent;
    definirPastilleAttente(true, "en cours");
    const centreEnCours = dessinerDiagramme(cycle);
    if (centreEnCours) planifierProchaineRafale(centreEnCours);
    demarrerBoucleParticules();
  } else {
    figerChrono(cycle.dureeTotaleS);
    $("cycle-agent-actuel-nom").textContent = "cycle terminé";
    definirPastilleAttente(false, "terminé");
    dessinerDiagramme(cycle);
    arreterBoucleParticules();
    redimensionnerCanvas();
    peindreEmpreinteFigee(empreinteFigee(cycle));
  }

  const outilsTotal = cycle.passages.reduce((s, p) => s + (p.outils || 0), 0);
  const fichiersTotal = cycle.passages.reduce((s, p) => s + (p.fichiers || 0), 0);
  $("stat-duree").textContent = cycle.statut === "en_cours" ? dur(cycle.debutOffsetS) : dur(cycle.dureeTotaleS);
  $("stat-outils").textContent = String(outilsTotal);
  $("stat-fichiers").textContent = String(fichiersTotal);
  $("stat-rebouclages").textContent = String((cycle.rebouclages || []).length);
}

const ongletsCycles = CYCLES_DEMO.map((_, i) => $("cycle-tab-" + i)).filter(Boolean);
activerRovingTabindex(ongletsCycles, (index) => afficherCycle(index));

/* ============================================================ kanban ====
 * Trois colonnes de démonstration seulement (todo/doing/done) — la vraie
 * page en compte 40 specs réelles ; ici, un échantillon suffisant pour
 * juger la densité et la lisibilité du panneau. */
const SPECS_DEMO = {
  todo: [
    { id: "bug-018", titre: "la suite est verte en root et rouge en CI" },
    { id: "feature-022", titre: "export CSV des cycles affichés" },
  ],
  doing: [
    { id: "feature-021", titre: "revenir à un tableau de bord unifié", divergente: false },
  ],
  done: [
    { id: "feature-020", titre: "conformité du diagramme à la maquette" },
    { id: "bug-017", titre: "contrôles atteignables sous la modale" },
    { id: "feature-016", titre: "liste des cycles en accordéon" },
  ],
};
function rendreKanban() {
  const conteneur = $("kanban");
  if (!conteneur) return;
  conteneur.innerHTML = "";
  if (etatVideActif) {
    conteneur.appendChild((() => { const p = document.createElement("p"); p.className = "vide"; p.textContent = "Aucune spécification dans le dépôt."; return p; })());
    $("compteur-specs").textContent = "0 spec";
    return;
  }
  const LIBELLES = { todo: "À faire", doing: "En cours", done: "Terminé" };
  let total = 0;
  Object.keys(SPECS_DEMO).forEach((colonne) => {
    const items = SPECS_DEMO[colonne];
    total += items.length;
    const col = document.createElement("div");
    col.className = "colonne";
    const entete = document.createElement("div");
    entete.className = "colonne-entete";
    entete.innerHTML = `<span>${LIBELLES[colonne]}</span><span>${items.length}</span>`;
    col.appendChild(entete);
    const liste = document.createElement("div");
    liste.className = "colonne-liste";
    items.forEach((item) => {
      const bouton = document.createElement("button");
      bouton.type = "button";
      bouton.className = "carte" + (item.divergente ? " divergente" : "");
      bouton.innerHTML = `<span class="carte-titre">${item.id}</span><span class="carte-meta">${item.titre}</span>`;
      liste.appendChild(bouton);
    });
    col.appendChild(liste);
    conteneur.appendChild(col);
  });
  $("compteur-specs").textContent = total + " specs (démonstration — 40 dans le dépôt réel)";
}

/* ==================================================== état du dépôt =====
 * Fichiers thématiquement liés à CE cycle (ce que le cycle 2, non exécuté,
 * toucherait selon la spec) — pas une capture du dépôt de la personne qui
 * ouvre la maquette : ce serait promettre une donnée que ce fichier
 * statique ne mesure jamais. */
const FICHIERS_DEMO = [
  { code: "M", chemin: "control-center/web/index.html" },
  { code: "M", chemin: "control-center/web/app.css" },
  { code: "M", chemin: "control-center/web/app.js" },
  { code: "??", chemin: "docs/adr/0029-le-tableau-de-bord-revient-au-mono-ecran.md" },
];
function rendreFichiers() {
  const liste = $("fichiers-liste");
  if (!liste) return;
  liste.innerHTML = "";
  if (etatVideActif) {
    const li = document.createElement("li");
    li.innerHTML = `<span></span><span class="vide">Aucun fichier touché.</span>`;
    liste.appendChild(li);
    $("depot-divergences").textContent = "0";
    return;
  }
  FICHIERS_DEMO.forEach((f) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="fcode">${f.code}</span><span class="fchemin">${f.chemin}</span>`;
    liste.appendChild(li);
  });
}

/* ==================================================== panneau démo ======
 * N'existe pas dans le produit — bascule la maquette dans les états
 * déclarés par U4 pour qu'ils soient VUS, pas seulement lus. */
function definirPressed(id, valeur) { const b = $(id); if (b) b.setAttribute("aria-pressed", valeur ? "true" : "false"); }

function appliquerEtatVide(actif) {
  etatVideActif = actif;
  definirPressed("demo-vide", actif);
  const cycleActifIndex = ongletsCycles.findIndex((o) => o.getAttribute("aria-selected") === "true");
  if (actif) {
    arreterRafales(); arreterBoucleParticules();
    figerChrono(0);
    $("chrono").dataset.fige = "faux";
    $("chrono-texte").textContent = "--:--:--";
    $("cycle-nom").textContent = "Aucun cycle dans ce dépôt";
    $("cycle-agent-actuel-nom").textContent = "";
    definirPastilleAttente(false, "");
    const svg = $("dg-svg");
    if (svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); svg.setAttribute("viewBox", "0 0 200 60"); }
    ["stat-duree", "stat-outils", "stat-fichiers", "stat-rebouclages"].forEach((id) => { $(id).textContent = "—"; });
  } else {
    afficherCycle(cycleActifIndex === -1 ? 0 : cycleActifIndex);
  }
  rendreKanban();
  rendreFichiers();
}

function appliquerEtatLectureSeule(actif) {
  definirPressed("demo-lecture-seule", actif);
  const boutons = ["bouton-lancer", "bouton-interrompre", "bouton-generer-brouillon"];
  boutons.forEach((id) => { const b = $(id); if (b) b.disabled = actif; });
  const jauge = $("jauge-pilotage");
  const note = $("note-pilotage");
  if (jauge) {
    jauge.textContent = actif ? "lecture seule" : "écriture activée";
    jauge.classList.toggle("lecture-seule", actif);
  }
  if (note) {
    note.textContent = actif
      ? "Écriture désactivée (jeton absent ou 403) : les commandes restent visibles, elles sont inertes."
      : "Le jeton de pilotage sert à consulter et à lancer.";
  }
}

function appliquerEtatInjoignable(actif) {
  definirPressed("demo-injoignable", actif);
  const bandeau = $("bandeau-hote");
  const texte = $("bandeau-hote-texte");
  const jaugeFlux = $("jauge-flux");
  if (bandeau) bandeau.hidden = !actif;
  if (texte) texte.textContent = actif
    ? "Connexion au serveur perdue — dernier état affiché à " + $("horodatage").textContent + ", il peut être périmé."
    : "";
  if (jaugeFlux) {
    jaugeFlux.textContent = actif ? "flux interrompu" : "flux connecté";
    jaugeFlux.classList.toggle("ko", actif);
    jaugeFlux.classList.toggle("ok", !actif);
  }
  if (actif) {
    const cycleActifIndex = ongletsCycles.findIndex((o) => o.getAttribute("aria-selected") === "true");
    const cycle = CYCLES_DEMO[cycleActifIndex === -1 ? 0 : cycleActifIndex];
    const dejaEcoule = cycle.statut === "en_cours"
      ? Math.floor((Date.now() - chronoDepart) / 1000)
      : cycle.dureeTotaleS;
    figerChrono(dejaEcoule);
    arreterRafales();
  } else if (!etatVideActif) {
    const cycleActifIndex = ongletsCycles.findIndex((o) => o.getAttribute("aria-selected") === "true");
    afficherCycle(cycleActifIndex === -1 ? 0 : cycleActifIndex);
  }
}

function appliquerApercuReduit(actif) {
  forcerReduitDemo = actif;
  definirPressed("demo-reduit", actif);
  notifierChangementReduit();
}

$("demo-vide") && $("demo-vide").addEventListener("click", () => appliquerEtatVide($("demo-vide").getAttribute("aria-pressed") !== "true"));
$("demo-lecture-seule") && $("demo-lecture-seule").addEventListener("click", () => appliquerEtatLectureSeule($("demo-lecture-seule").getAttribute("aria-pressed") !== "true"));
$("demo-injoignable") && $("demo-injoignable").addEventListener("click", () => appliquerEtatInjoignable($("demo-injoignable").getAttribute("aria-pressed") !== "true"));
$("demo-reduit") && $("demo-reduit").addEventListener("click", () => appliquerApercuReduit($("demo-reduit").getAttribute("aria-pressed") !== "true"));

$("bouton-simuler-chute") && $("bouton-simuler-chute").addEventListener("click", () => {
  const totalS = Math.floor((Date.now() - chronoDepart) / 1000);
  figerChrono(totalS);
  arreterRafales();
  definirPastilleAttente(false, "flux interrompu");
});
$("bandeau-hote-bouton") && $("bandeau-hote-bouton").addEventListener("click", () => appliquerEtatInjoignable(false));

/* ============================================================ horloge ===
 * Horodatage de la barre — purement décoratif ici (démonstration), affiché
 * en clair pour que le bandeau « serveur injoignable » puisse le citer. */
function rafraichirHorodatage() {
  const el = $("horodatage");
  if (!el) return;
  const maintenant = new Date();
  el.textContent = String(maintenant.getHours()).padStart(2, "0") + ":" + String(maintenant.getMinutes()).padStart(2, "0") + ":" + String(maintenant.getSeconds()).padStart(2, "0");
}
setInterval(rafraichirHorodatage, reduitActif() ? 60000 : 1000);
rafraichirHorodatage();

/* ============================================================ amorçage ==*/
window.addEventListener("resize", redimensionnerCanvas);
ctxParticules = initParticules();
redimensionnerCanvas();
initObservateurVisibilite();
rendreKanban();
rendreFichiers();
afficherCycle(0);
