"use strict";
/* Maquette feature-021 — parti pris « Le Couloir » (3ᵉ passage ux-ui-designer,
 * 2026-09-19). Remplace le catalogue du 2ᵉ passage (2026-09-19-mono-ecran.*),
 * qui RESTE en place pour comparaison — ce fichier est neuf, autonome, et ne
 * modifie aucune ligne de la première maquette.
 *
 * Jamais chargé par le produit réel (`control-center/web/` n'y touche pas) :
 * script CLASSIQUE (pas de `type="module"`, refusé en `file://`), aucune
 * dépendance, aucune bibliothèque WebGL, aucun accès réseau. Toutes les
 * données ci-dessous sont des DONNÉES DE DÉMONSTRATION (PIEGES §16 : un
 * tableau de bord ne doit jamais promettre une donnée qu'il ne mesure pas).
 *
 * Structure des 5 panneaux : INCHANGÉE par rapport à la première maquette
 * (U2, second passage) — seul le panneau 1 (Cycle en cours) est refait.
 *
 * Panneau 1 — deux modes :
 *  - Profondeur (défaut) : scène WebGL « Le Couloir », écrite à la main, UN
 *    SEUL programme de shader, sprites billboardés (gl.POINTS, toujours
 *    face caméra par construction), texture = dégradé radial généré dans un
 *    <canvas> 2D hors-écran, blend additif pour la lueur, particules par
 *    points pour la traînée d'étincelles.
 *  - Plan : le rendu SVG — repris INTACT AU BIT PRÈS de la première maquette
 *    (dessinerDiagramme/peindreAgent non modifiées). C'est aussi le repli
 *    automatique si WebGL échoue.
 *
 * Géométrie : rayonAgent(), graduacionAgente() et opacidadListado() sont
 * l'AUTORITÉ UNIQUE partagée par les deux modes — le placement 3D les
 * CONSOMME, il ne les recalcule pas (contrainte non négociable de la spec).
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
  reconstruirPaletteEtScene(); // les couleurs d'identité (--a-*) changent avec le thème
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
if (mqSombre) mqSombre.addEventListener("change", () => {
  if (positionActiveTheme() === "theme-systeme") { rafraichirCommandeTheme(); reconstruirPaletteEtScene(); }
});
rafraichirCommandeTheme();

/* =============================================== réduction de mouvement ==
 * `* { animation: none }` (feuille de style, + sa version dupliquée sur
 * `html[data-vista-reducida]` pour que le bouton de démonstration produise
 * le MÊME repli qu'une vraie préférence système) couvre les animations CSS
 * déclaratives. Elle NE couvre PAS la boucle WebGL/`requestAnimationFrame`
 * ni le `setInterval` du chronomètre — gérés ici via `matchMedia` et son
 * événement `change`, jamais lus une seule fois au chargement. */
const mqReduit = (typeof matchMedia === "function")
  ? matchMedia("(prefers-reduced-motion: reduce)") : null;
let forcerReduitDemo = false;
function reduitActif() { return Boolean((mqReduit && mqReduit.matches) || forcerReduitDemo); }
const ecouteursReduit = [];
function surChangementReduit(fn) { ecouteursReduit.push(fn); }
function notifierChangementReduit() { ecouteursReduit.forEach((fn) => fn(reduitActif())); }
if (mqReduit) mqReduit.addEventListener("change", notifierChangementReduit);

function marcarVistaReducida(reducido) {
  // `toggleAttribute` seul pose une valeur vide (""), pas "vrai" : le
  // sélecteur CSS `html[data-vista-reducida="vrai"]` ne matcherait jamais.
  if (reducido) document.documentElement.setAttribute("data-vista-reducida", "vrai");
  else document.documentElement.removeAttribute("data-vista-reducida");
}
surChangementReduit(marcarVistaReducida);

/* ============================================================ données ===
 * DÉMONSTRATION UNIQUEMENT. Sigles et formes identiques à la première
 * maquette. ⚠️ Décision prise seul (voir rapport) : le passage `debugger`
 * n°1 de `bug-018` porte désormais `echec: true` — aucun cas de la première
 * maquette n'exerçait la règle « croix + --alerte pour l'échec » ; celui-ci
 * précède un `rebouclage` ([1,3]) et une reprise (`repriseDe: 1`), ce qui en
 * fait un candidat cohérent avec le récit déjà présent dans les données. */
const SIGLE = {
  "spec-reader": "SP", "debugger": "DB", "test-engineer": "TE",
  "frontend-developer": "FE", "code-reviewer": "CR", "security-reviewer": "SE",
  "backend-developer": "BD", "doc-writer": "DW",
};
function rgbToken(role) { return `var(--a-${role})`; }
function fToken(role) { return `var(--f-${role})`; }

const dur = (s) => s >= 60 ? Math.floor(s / 60) + " min " + String(s % 60).padStart(2, "0") : s + " s";
const hm = (s) => { const h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60; return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0"); };

/* ==== AUTORITÉ UNIQUE DE GÉOMÉTRIE (disposer) — consommée par les deux modes,
 * jamais recalculée séparément. Formules reprises de
 * `control-center/web/diagramme.js` (MESURES_DEFAUT), même grammaire que la
 * première maquette. */
function rayonAgent(dureeS) { return Math.min(11 + 0.80 * Math.sqrt(Math.max(dureeS, 1)), 56); }
function graduacionAgente(agent, r) {
  const echelleOutils = 70;
  const TK = r < 22 ? 24 : r < 32 ? 36 : 52;
  const n = Math.round(TK * Math.min((agent.outils || 0) / echelleOutils, 1));
  return { TK, n };
}
function opacidadListado(fichiers) { return 0.22 + Math.min(fichiers || 0, 8) / 8 * 0.45; }

const CYCLES_DEMO = [
  {
    id: "feature-021", statut: "en_cours",
    nom: "feature-021 — revenir à un tableau de bord unifié",
    debutOffsetS: 462,
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
      { agent: "debugger", debut: 95, dureeS: 640, outils: 71, fichiers: 2, echec: true },
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
 * Motif ARIA réutilisé pour la bande de cycles ET pour la bascule de mode
 * du panneau 1 (les deux seuls `radiogroup`/`tablist` qui subsistent). */
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

/* ======================================================= Mode PLAN (SVG)
 * INTACT AU BIT PRÈS par rapport à 2026-09-19-mono-ecran.js : mêmes
 * fonctions, mêmes classes `.dg-*`. Seul changement non visuel : les deux
 * formules de seuil (graduations, opacité du liseré) sont tirées de
 * l'autorité partagée ci-dessus au lieu d'être répétées en ligne — mêmes
 * nombres, sortie strictement identique. */
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
  const { TK, n } = graduacionAgente(agent, r);
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
      opacity: opacidadListado(agent.fichiers).toFixed(2),
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
/* ============================== Mode PROFONDEUR (WebGL — « Le Couloir »)
 * Écrit à la main, AUCUNE bibliothèque (ADR-0006 tient sans exception).
 * UN SEUL programme de shader pour tout ce qui est dessiné : sphères
 * d'agent, graduations, liseré, anneau pointillé (sans-clôture), croix
 * d'échec, arc de rebouclage, particules — tout est un point (`gl.POINTS`,
 * billboard par construction) texturé par un dégradé/motif généré dans un
 * <canvas> 2D hors-écran. Le texte (heure/durée/nom) N'EST JAMAIS DANS LE
 * CANEVAS : posé en HTML au-dessus, jamais flouté, jamais parallaxé.
 */

// Constantes de projection — SOURCE UNIQUE partagée entre le vertex shader
// (rendu GPU) et `proyectarPantalla` (placement des plaques HTML), pour que
// les deux ne divergent jamais.
const K_PERSPECTIVE = 0.0026;  // force de convergence vers le point de fuite
const Z_PASO = 130;            // pas de profondeur entre deux agents consécutifs
const ESPACIO_X = 78;          // écart latéral fixe (même logique que le Plan simplifié)
const BORNE_RECUL_MIN = 0.72;  // borne EXPLICITE — jamais posée en dur ailleurs
const BORNE_RECUL_MAX = 1.0;

function facteurRecul(z) {
  const brut = 1 / (1 + Math.max(z, 0) * K_PERSPECTIVE);
  return Math.max(BORNE_RECUL_MIN, Math.min(BORNE_RECUL_MAX, brut));
}
// Projette un point du monde (x,y centrés, z = profondeur) vers l'écran.
// `parallax` vaut [0,0] pour tout ce qui porte du texte — jamais appliqué au texte.
function proyectarPantalla(x, y, z, resolucion, parallax) {
  const f = facteurRecul(z);
  const px = parallax ? parallax[0] * z * 0.05 : 0;
  const py = parallax ? parallax[1] * z * 0.05 : 0;
  return {
    x: resolucion.w / 2 + x * f + px,
    y: resolucion.h / 2 + y * f + py,
    f,
  };
}

const VS = `
attribute vec3 a_pos;
attribute vec3 a_color;
attribute float a_taille;
attribute float a_intensite;
attribute float a_respire;
attribute float a_fase;
uniform vec2 u_resolution;
uniform vec2 u_parallax;
uniform float u_dpr;
uniform float u_tiempo;
uniform float u_k;
uniform float u_reducido;
varying vec3 v_color;
varying float v_alpha;
void main() {
  /* BORNE EXPLICITE [0.72 ; 1] — jamais plus de 28% d'écart de taille dû à
   * la seule position dans la séquence. Posée ici en dur, pas laissée
   * émerger d'une division de perspective libre. */
  float brut = 1.0 / (1.0 + max(a_pos.z, 0.0) * u_k);
  float profondeur = clamp(brut, 0.72, 1.0);
  vec2 parallax = u_parallax * a_pos.z * 0.05 * (1.0 - u_reducido);
  vec2 centro = u_resolution * 0.5;
  vec2 pantalla = centro + (a_pos.xy * profondeur) + parallax;
  vec2 clip = (pantalla / u_resolution) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  float respiracion = mix(1.0, 0.85 + 0.15 * sin(u_tiempo * 2.856 + a_fase), a_respire * (1.0 - u_reducido));
  gl_PointSize = clamp(a_taille * profondeur * u_dpr, 1.0, 300.0);
  v_color = a_color;
  v_alpha = a_intensite * respiracion;
}
`;
const FS = `
precision mediump float;
uniform sampler2D u_textura;
varying vec3 v_color;
varying float v_alpha;
void main() {
  vec4 t = texture2D(u_textura, gl_PointCoord);
  gl_FragColor = vec4(v_color * t.rgb, t.a * v_alpha);
}
`;

let gl = null, programa = null;
let ubic = {}; // localisations uniform/attribute
let texGlow = null, texAnilloPunteado = null, texCruz = null;
let glReal = false;         // capacité RÉELLE mesurée une fois au chargement
let forzarSinWebglDemo = false; // simulation du bouton de démonstration
let modoActual = "profondidad"; // 'profondidad' | 'plano'

function compilarSombreador(gl, tipo, fuente) {
  const s = gl.createShader(tipo);
  gl.shaderSource(s, fuente);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error("shader: " + info);
  }
  return s;
}

// UN SEUL appel à createProgram dans tout le fichier.
function iniciarGL() {
  const canvas = $("gl-couloir");
  if (!canvas) return null;
  let contexte = null;
  try {
    contexte = canvas.getContext("webgl2") || canvas.getContext("webgl");
  } catch (erreur) {
    contexte = null;
  }
  if (!contexte) return null;
  try {
    const vs = compilarSombreador(contexte, contexte.VERTEX_SHADER, VS);
    const fs = compilarSombreador(contexte, contexte.FRAGMENT_SHADER, FS);
    const prog = contexte.createProgram();
    contexte.attachShader(prog, vs);
    contexte.attachShader(prog, fs);
    contexte.linkProgram(prog);
    if (!contexte.getProgramParameter(prog, contexte.LINK_STATUS)) {
      throw new Error("link: " + contexte.getProgramInfoLog(prog));
    }
    programa = prog;
    ubic = {
      a_pos: contexte.getAttribLocation(prog, "a_pos"),
      a_color: contexte.getAttribLocation(prog, "a_color"),
      a_taille: contexte.getAttribLocation(prog, "a_taille"),
      a_intensite: contexte.getAttribLocation(prog, "a_intensite"),
      a_respire: contexte.getAttribLocation(prog, "a_respire"),
      a_fase: contexte.getAttribLocation(prog, "a_fase"),
      u_resolution: contexte.getUniformLocation(prog, "u_resolution"),
      u_parallax: contexte.getUniformLocation(prog, "u_parallax"),
      u_dpr: contexte.getUniformLocation(prog, "u_dpr"),
      u_tiempo: contexte.getUniformLocation(prog, "u_tiempo"),
      u_k: contexte.getUniformLocation(prog, "u_k"),
      u_reducido: contexte.getUniformLocation(prog, "u_reducido"),
      u_textura: contexte.getUniformLocation(prog, "u_textura"),
    };
    texGlow = crearTexturaRadial(contexte);
    texAnilloPunteado = crearTexturaAnilloPunteado(contexte);
    texCruz = crearTexturaCruz(contexte);
    contexte.enable(contexte.BLEND);
    return contexte;
  } catch (erreur) {
    return null;
  }
}

// Dégradé radial généré dans un <canvas> 2D hors-écran, uploadé en texture.
function crearTexturaDesdeCanvas(gl, dibujar, tam) {
  const c = document.createElement("canvas");
  c.width = tam; c.height = tam;
  const ctx = c.getContext("2d");
  dibujar(ctx, tam);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return tex;
}
function crearTexturaRadial(gl) {
  return crearTexturaDesdeCanvas(gl, (ctx, tam) => {
    const g = ctx.createRadialGradient(tam / 2, tam / 2, 0, tam / 2, tam / 2, tam / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.55, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, tam, tam);
  }, 64);
}
function crearTexturaAnilloPunteado(gl) {
  return crearTexturaDesdeCanvas(gl, (ctx, tam) => {
    ctx.clearRect(0, 0, tam, tam);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = tam * 0.09;
    ctx.setLineDash([tam * 0.14, tam * 0.10]);
    ctx.beginPath();
    ctx.arc(tam / 2, tam / 2, tam * 0.38, 0, Math.PI * 2);
    ctx.stroke();
  }, 64);
}
function crearTexturaCruz(gl) {
  return crearTexturaDesdeCanvas(gl, (ctx, tam) => {
    ctx.clearRect(0, 0, tam, tam);
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineCap = "round";
    ctx.lineWidth = tam * 0.14;
    const m = tam * 0.22;
    ctx.beginPath();
    ctx.moveTo(m, m); ctx.lineTo(tam - m, tam - m);
    ctx.moveTo(tam - m, m); ctx.lineTo(m, tam - m);
    ctx.stroke();
  }, 64);
}

// Résolution d'un jeton CSS en RGBA 0..1 par lecture PEINTE (canvas 2D +
// getImageData), PAS `getComputedStyle` seul — PIEGES §11 : un moteur peut
// rendre une fonction de couleur non résolue en chaîne de caractères ; la
// lecture peinte est correcte quel que soit l'espace de couleur utilisé.
let cvsSonda = null, ctxSonda = null;
function resolverColorCSS(nombreVar) {
  if (!cvsSonda) { cvsSonda = document.createElement("canvas"); cvsSonda.width = 1; cvsSonda.height = 1; ctxSonda = cvsSonda.getContext("2d"); }
  const valeur = getComputedStyle(document.documentElement).getPropertyValue(nombreVar).trim() || "rgb(136,136,136)";
  ctxSonda.clearRect(0, 0, 1, 1);
  ctxSonda.fillStyle = valeur;
  ctxSonda.fillRect(0, 0, 1, 1);
  const d = ctxSonda.getImageData(0, 0, 1, 1).data;
  return [d[0] / 255, d[1] / 255, d[2] / 255];
}
let paletteCache = {};
function reconstruirPalette() {
  paletteCache = {};
  ["backend-developer", "security-reviewer", "test-engineer", "spec-reader",
    "code-reviewer", "debugger", "doc-writer", "frontend-developer", "neutre"].forEach((role) => {
    paletteCache["a-" + role] = resolverColorCSS("--a-" + role);
  });
  paletteCache["echec"] = resolverColorCSS("--echec");
  paletteCache["rebouclage"] = resolverColorCSS("--rebouclage");
  paletteCache["texte-faible"] = resolverColorCSS("--texte-faible");
}
function colorIdentidad(role) { return paletteCache["a-" + role] || paletteCache["a-neutre"]; }

/* ---- construction de la scène (consomme la géométrie, ne la recalcule pas) */
let escena = { puntos: [], placas: [] }; // puntos: {x,y,z,color[3],taille,intens,respire,fase,textura}
let centroEnCoursCorredor = null;

function construirEscenaProfundidad(cycle) {
  const puntos = [];
  const placas = [];
  const passages = cycle.passages || [];
  const n = passages.length;
  centroEnCoursCorredor = null;

  const centros = passages.map((p, i) => {
    const r = rayonAgent(p.dureeS); // AUTORITÉ PARTAGÉE — consommée, pas recalculée
    const z = (n - 1 - i) * Z_PASO; // le plus récent (i=n-1) est le plus proche (z=0)
    const x = (i - (n - 1) / 2) * ESPACIO_X;
    return { x, y: 0, z, r, agent: p, color: colorIdentidad(p.role || p.agent) };
  });

  centros.forEach((c) => {
    const { x, y, z, r, agent, color } = c;
    const diametrePx = r * 2;

    // liseré (fichiers écrits) — halo légèrement plus large, en dessous
    if (agent.fichiers) {
      puntos.push({ x, y, z, color, taille: diametrePx * 1.55, intens: opacidadListado(agent.fichiers), respire: 0, fase: 0, tex: texGlow, additif: true });
    }
    // sphère principale
    puntos.push({ x, y, z, color, taille: diametrePx, intens: agent.enCours ? 1 : 0.82, respire: agent.enCours ? 1 : 0, fase: 0, tex: texGlow, additif: false });
    if (agent.enCours) centroEnCoursCorredor = { x, y, z, color };

    // graduations (appels d'outils) — anneau de petits points, MÊME seuil
    // que le Plan (graduacionAgente = autorité partagée, un seul appel).
    const { TK, n: nAllumees } = graduacionAgente(agent, r);
    const r0 = r + 6;
    const pasAffiche = Math.max(1, Math.round(TK / 16)); // échantillonnage visuel, la donnée sous-jacente reste TK/n
    for (let i = 0; i < TK; i += pasAffiche) {
      const allumee = i < nAllumees;
      const ang = (-90 + i * 360 / TK) * Math.PI / 180;
      puntos.push({
        x: x + Math.cos(ang) * r0, y: y + Math.sin(ang) * r0, z,
        color: allumee ? color : paletteCache["texte-faible"],
        taille: allumee ? 5 : 3, intens: allumee ? 0.95 : 0.35, respire: 0, fase: 0, tex: texGlow, additif: allumee,
      });
    }

    // sans-clôture : anneau pointillé, teinte neutre
    if (agent.sansCloture) {
      puntos.push({ x, y, z, color: paletteCache["texte-faible"], taille: diametrePx * 1.25, intens: 0.8, respire: 0, fase: 0, tex: texAnilloPunteado, additif: false });
    }
    // échec : croix + teinte --alerte→--echec (jeton disponible : --echec)
    if (agent.echec) {
      puntos.push({ x, y, z, color: paletteCache["echec"], taille: diametrePx * 1.1, intens: 0.95, respire: 0, fase: 0, tex: texCruz, additif: false });
    }

    // plaque HTML — heure, durée, nom : JAMAIS floutée, JAMAIS parallaxée.
    placas.push({
      x, y, z, tipo: "agent",
      heure: hm(agent.debut), duree: dur(agent.dureeS), nom: agent.role || agent.agent,
      enCours: Boolean(agent.enCours), outils: agent.outils || 0,
    });
  });

  // pastille d'attente (> 120s) entre deux agents consécutifs — même seuil que le Plan
  for (let i = 0; i < centros.length - 1; i++) {
    const a = centros[i], b = centros[i + 1];
    const attenteS = b.agent.debut - (a.agent.debut + a.agent.dureeS);
    if (attenteS > 120) {
      placas.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2, tipo: "attente", texte: "attente " + Math.round(attenteS / 60) + "m" });
    }
  }

  // rebouclage : chaîne de points colorés --rebouclage entre les deux agents
  (cycle.rebouclages || []).forEach(([iDe, iVers]) => {
    const de = centros[iDe], vers = centros[iVers];
    if (!de || !vers) return;
    const N_ARC = 10;
    for (let k = 0; k <= N_ARC; k++) {
      const t = k / N_ARC;
      const x = de.x + (vers.x - de.x) * t;
      const y = Math.min(de.y, vers.y) - 46 * Math.sin(Math.PI * t) - Math.max(de.r, vers.r);
      const z = de.z + (vers.z - de.z) * t;
      puntos.push({ x, y, z, color: paletteCache["rebouclage"], taille: 4, intens: 0.7, respire: 0, fase: 0, tex: texGlow, additif: true });
    }
  });

  // agents simultanés (empile) — placés au plus proche (z=0), décalés
  // latéralement et verticalement : la donnée est consommée telle quelle,
  // seul l'agencement change (cadre 2D → empilement 3D).
  if (cycle.empile) {
    const baseX = (centros.length ? centros[centros.length - 1].x : 0) + ESPACIO_X * 0.9;
    cycle.empile.membres.forEach((m, i) => {
      const r = Math.min(rayonAgent(m.dureeS), 16);
      const y = -30 + i * 40;
      const color = colorIdentidad(m.role || m.agent);
      puntos.push({ x: baseX, y, z: 0, color, taille: r * 2, intens: 0.85, respire: 0, fase: 0, tex: texGlow, additif: false });
      placas.push({ x: baseX, y, z: 0, tipo: "agent", heure: hm(m.debut), duree: dur(m.dureeS), nom: m.role || m.agent, enCours: false, outils: m.outils || 0 });
    });
  }

  escena = { puntos, placas };
}

/* ---- particules (traînée d'étincelles) — dérivent vers l'arrière du
 * couloir (z croissant), extinction ~3s, émission = débit réel simulé. */
let particulasGL = [];
let minuteurRafaleGL = null;
function planificarRafalaGL() {
  if (minuteurRafaleGL) clearTimeout(minuteurRafaleGL);
  const delai = 160 + Math.random() * 820;
  minuteurRafaleGL = setTimeout(() => {
    if (!centroEnCoursCorredor || reduitActif() || pausadoPorVisibilidad) { planificarRafalaGL(); return; }
    const tailleRafale = Math.random() < 0.3 ? 0 : 1 + Math.floor(Math.random() * 6);
    for (let i = 0; i < tailleRafale; i++) {
      particulasGL.push({
        x: centroEnCoursCorredor.x + (Math.random() - 0.5) * 10,
        y: centroEnCoursCorredor.y + (Math.random() - 0.5) * 10,
        z: centroEnCoursCorredor.z,
        color: centroEnCoursCorredor.color,
        ne: performance.now(),
        vieMs: 2600 + Math.random() * 700, // extinction ~3s
        vz: 55 + Math.random() * 40, // dérive vers l'arrière (z croît)
      });
    }
    if (particulasGL.length > 260) particulasGL.splice(0, particulasGL.length - 260);
    planificarRafalaGL();
  }, delai);
}
function detenerRafalasGL() { if (minuteurRafaleGL) { clearTimeout(minuteurRafaleGL); minuteurRafaleGL = null; } }

/* ---- boucle de rendu */
let rafGL = null;
let tiempoInicioGL = performance.now();
let parallaxActual = [0, 0];
let parallaxObjetivo = [0, 0];
let pausadoPorVisibilidad = false;

function dibujarCapa(gl, lista) {
  if (!lista.length || !programa) return;
  const n = lista.length;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const tam = new Float32Array(n);
  const intens = new Float32Array(n);
  const resp = new Float32Array(n);
  const fase = new Float32Array(n);
  lista.forEach((p, i) => {
    pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
    col[i * 3] = p.color[0]; col[i * 3 + 1] = p.color[1]; col[i * 3 + 2] = p.color[2];
    tam[i] = p.taille; intens[i] = p.intens; resp[i] = p.respire; fase[i] = p.fase;
  });
  const buf = (datos, loc, tamComp) => {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, datos, gl.STREAM_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, tamComp, gl.FLOAT, false, 0, 0);
  };
  buf(pos, ubic.a_pos, 3);
  buf(col, ubic.a_color, 3);
  buf(tam, ubic.a_taille, 1);
  buf(intens, ubic.a_intensite, 1);
  buf(resp, ubic.a_respire, 1);
  buf(fase, ubic.a_fase, 1);
  gl.bindTexture(gl.TEXTURE_2D, lista[0].tex);
  gl.uniform1i(ubic.u_textura, 0);
  gl.blendFunc(gl.SRC_ALPHA, lista[0].additif ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.POINTS, 0, n);
};

function dibujarEscenaGL(marcaTiempo) {
  if (!gl || !programa) return;
  const canvas = $("gl-couloir");
  const cadre = $("diagramme-cadre");
  const dpr = window.devicePixelRatio || 1;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(programa);
  gl.uniform2f(ubic.u_resolution, cadre.clientWidth, cadre.clientHeight);
  gl.uniform1f(ubic.u_dpr, dpr);
  gl.uniform1f(ubic.u_k, K_PERSPECTIVE);
  gl.uniform1f(ubic.u_reducido, reduitActif() ? 1 : 0);
  gl.uniform1f(ubic.u_tiempo, (marcaTiempo - tiempoInicioGL) / 1000);
  gl.uniform2f(ubic.u_parallax, parallaxActual[0], parallaxActual[1]);

  // regroupe par texture/mode de blend pour limiter les appels de dessin
  const grupos = new Map();
  const claveDe = (p) => (p.tex === texGlow ? "g" : p.tex === texAnilloPunteado ? "p" : "c") + (p.additif ? "1" : "0");
  escena.puntos.forEach((p) => { const k = claveDe(p); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(p); });
  // particules (additif, texture glow) dans leur propre passe, dessinées en dernier
  const ahora = performance.now();
  const vivas = [];
  particulasGL.forEach((p) => {
    const age = ahora - p.ne;
    if (age >= p.vieMs) return;
    const t = age / 1000;
    vivas.push({
      x: p.x, y: p.y, z: p.z + p.vz * t, color: p.color,
      taille: 5, intens: Math.max(0, 1 - age / p.vieMs), respire: 0, fase: 0, tex: texGlow, additif: true,
    });
  });
  particulasGL = particulasGL.filter((p) => (ahora - p.ne) < p.vieMs);

  grupos.forEach((lista) => dibujarCapa(gl, lista));
  if (vivas.length) dibujarCapa(gl, vivas);
}

function bucleGL(marcaTiempo) {
  if (reduitActif() || pausadoPorVisibilidad) { rafGL = null; dibujarEscenaGL(marcaTiempo); return; }
  parallaxActual[0] += (parallaxObjetivo[0] - parallaxActual[0]) * 0.08;
  parallaxActual[1] += (parallaxObjetivo[1] - parallaxActual[1]) * 0.08;
  dibujarEscenaGL(marcaTiempo);
  rafGL = requestAnimationFrame(bucleGL);
}
function arrancarGL() {
  if (rafGL != null || !gl || modoActual !== "profondidad") return;
  rafGL = requestAnimationFrame(bucleGL);
}
function detenerGL() { if (rafGL != null) { cancelAnimationFrame(rafGL); rafGL = null; } }
surChangementReduit((reduit) => {
  if (reduit) { detenerGL(); parallaxActual = [0, 0]; parallaxObjetivo = [0, 0]; if (gl) dibujarEscenaGL(performance.now()); }
  else arrancarGL();
});

/* ---- placement des plaques HTML (heure/durée/nom) — jamais floutées,
 * jamais parallaxées (parallax = [0,0] explicite dans proyectarPantalla). */
function posicionarPlacas() {
  const cont = $("plaques-3d");
  const cadre = $("diagramme-cadre");
  if (!cont || !cadre) return;
  cont.innerHTML = "";
  if (modoActual !== "profondidad") return;
  const resolucion = { w: cadre.clientWidth, h: cadre.clientHeight };
  escena.placas.forEach((pl) => {
    const pt = proyectarPantalla(pl.x, pl.y + (pl.tipo === "agent" ? (rayonSeguro(pl) + 22) : 0), pl.z, resolucion, null);
    const div = document.createElement("div");
    div.className = "plaque-3d" + (pl.tipo === "attente" ? " plaque-attente" : "");
    div.style.left = pt.x.toFixed(1) + "px";
    div.style.top = pt.y.toFixed(1) + "px";
    if (pl.tipo === "attente") {
      div.textContent = pl.texte;
    } else {
      div.tabIndex = 0;
      div.title = pl.outils + " appel(s) d'outil — survol/focus : compensation du dénombrement en profondeur";
      div.setAttribute("aria-label", pl.nom + ", " + pl.heure + ", " + pl.duree + ", " + pl.outils + " appels d'outils");
      const h = document.createElement("span"); h.className = "p-heure"; h.textContent = pl.heure;
      const d = document.createElement("span"); d.className = "p-duree" + (pl.enCours ? " actif" : ""); d.textContent = pl.duree;
      const n = document.createElement("span"); n.className = "p-nom"; n.textContent = pl.nom;
      div.appendChild(h); div.appendChild(d); div.appendChild(n);
    }
    cont.appendChild(div);
  });
}
function rayonSeguro(pl) { return 28; } // approx. d'affichage de la plaque sous la sphère, indépendant du rendu GPU

/* ---- redimensionnement */
function redimensionarEscenaProfundidad() {
  const canvas = $("gl-couloir");
  const cadre = $("diagramme-cadre");
  if (!canvas || !cadre) return;
  const rect = cadre.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * dpr));
  canvas.height = Math.max(1, Math.round(rect.height * dpr));
  posicionarPlacas();
  if (gl) dibujarEscenaGL(performance.now());
}

/* ---- parallaxe au curseur — jamais sur le texte (voir posicionarPlacas) */
function initParallaxe() {
  const cadre = $("diagramme-cadre");
  if (!cadre) return;
  cadre.addEventListener("mousemove", (ev) => {
    if (reduitActif() || modoActual !== "profondidad") return;
    const r = cadre.getBoundingClientRect();
    parallaxObjetivo[0] = ((ev.clientX - r.left) / r.width - 0.5) * 2;
    parallaxObjetivo[1] = ((ev.clientY - r.top) / r.height - 0.5) * 2;
  });
  cadre.addEventListener("mouseleave", () => { parallaxObjetivo = [0, 0]; });
}

/* ---- ouverture en fondu-lumière (~800ms) — le repli reduced-motion global
 * (transition: none !important) neutralise déjà la transition ; l'état
 * final est alors atteint directement, sans qu'aucune branche JS séparée
 * ne soit nécessaire ici. */
function reveillerScene() {
  const canvas = $("gl-couloir");
  if (!canvas) return;
  canvas.classList.remove("encendido");
  canvas.classList.add("entrando");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    canvas.classList.add("encendido");
  }));
}

/* ============================================= bascule Profondeur / Plan */
function crearBotonModo(idModo, etiqueta, activo) {
  const b = document.createElement("button");
  b.type = "button";
  b.id = "modo-" + idModo;
  b.className = "theme-bouton modo-bouton";
  b.setAttribute("role", "radio");
  b.setAttribute("aria-checked", activo ? "true" : "false");
  b.tabIndex = activo ? 0 : -1;
  b.dataset.modo = idModo;
  b.textContent = etiqueta;
  return b;
}
function construirBascule() {
  const cont = $("bascule-modo");
  if (!cont) return;
  cont.innerHTML = "";
  const puedeProfundidad = glReal && !forzarSinWebglDemo;
  if (puedeProfundidad) {
    cont.appendChild(crearBotonModo("profondidad", "Profondeur", modoActual === "profondidad"));
    cont.appendChild(crearBotonModo("plano", "Plan", modoActual === "plano"));
  } else {
    // Le second bouton est ABSENT, pas grisé : proposer un mode inatteignable
    // serait pire qu'un choix réduit (contrainte explicite de la spec).
    cont.appendChild(crearBotonModo("plano", "Plan", true));
    if (modoActual !== "plano") modoActual = "plano";
  }
  const botones = Array.from(cont.querySelectorAll("button"));
  activerRovingTabindex(botones, (i) => fijarModo(botones[i].dataset.modo));
}
function actualizarEstadoBascule() {
  const cont = $("bascule-modo");
  if (!cont) return;
  Array.from(cont.querySelectorAll("button")).forEach((b) => {
    const activo = b.dataset.modo === modoActual;
    b.setAttribute("aria-checked", activo ? "true" : "false");
    b.tabIndex = activo ? 0 : -1;
  });
}
function actualizarLeyenda() {
  const el = $("diagramme-legende");
  if (!el) return;
  if (modoActual === "profondidad") {
    el.innerHTML =
      '<span><u>sphère</u> durée (recul borné à 28% max)</span>' +
      '<span><u>anneau de points</u> appels d’outils</span>' +
      '<span><u>halo</u> fichiers écrits</span>' +
      '<span><u>croix</u> échec · <u>pointillé</u> sans-clôture</span>' +
      '<span><u>étincelles</u> débit réel d’appels d’outils</span>';
  } else {
    el.innerHTML =
      '<span><u>diamètre</u> durée</span>' +
      '<span><u>graduations</u> appels d’outils</span>' +
      '<span><u>liseré</u> fichiers écrits</span>' +
      '<span><u>pastille</u> attente entre deux agents</span>';
  }
}
function fijarModo(modo) {
  if (modo !== "profondidad" && modo !== "plano") return;
  modoActual = modo;
  const escenaEl = $("scene-profondeur");
  const planoEl = $("diagramme-scroll");
  const voileG = $("dg-voile-g"), voileD = $("dg-voile-d");
  const enProf = modo === "profondidad";
  if (escenaEl) escenaEl.hidden = !enProf;
  if (planoEl) planoEl.hidden = enProf;
  if (voileG) voileG.hidden = enProf;
  if (voileD) voileD.hidden = enProf;
  actualizarEstadoBascule();
  actualizarLeyenda();
  if (enProf) {
    redimensionarEscenaProfundidad();
    reveillerScene();
    arrancarGL();
  } else {
    detenerGL();
  }
}

function reconstruirPaletteEtScene() {
  if (!gl) return;
  reconstruirPalette();
  const cycleActifIndex = ongletsCyclesRef.findIndex((o) => o && o.getAttribute("aria-selected") === "true");
  const cycle = CYCLES_DEMO[cycleActifIndex === -1 ? 0 : cycleActifIndex];
  if (cycle && !etatVideActif) { construirEscenaProfundidad(cycle); posicionarPlacas(); dibujarEscenaGL(performance.now()); }
}

/* ============================================================ S2 —— ====
 * Chronomètre vedette, 56px, dégradé --accent→--actif (background-clip:
 * text, voir CSS). Se fige sur fin de cycle OU chute simulée du flux ; en
 * `prefers-reduced-motion: reduce`, cadence à la minute ET dégradé retiré
 * (couleur pleine --texte) — géré en CSS via `html[data-vista-reducida]`. */
let chronoMinuteur = null;
let chronoDepart = null;
let chronoFigeS = null;

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
  if (chronoFigeS != null) return;
  const pas = reduitActif() ? 60000 : 1000;
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

function definirPastilleAttente(enAttente, texte) {
  const pastille = $("pastille-attente");
  const libelle = $("pastille-attente-texte");
  if (pastille) pastille.classList.toggle("en-attente", Boolean(enAttente));
  if (libelle) libelle.textContent = texte;
}

/* ================================================= sélection du cycle === */
let etatVideActif = false;
let ongletsCyclesRef = [];

function afficherCycle(index) {
  const cycle = CYCLES_DEMO[index];
  if (!cycle) return;

  ongletsCyclesRef.forEach((o, i) => {
    if (!o) return;
    o.setAttribute("aria-selected", i === index ? "true" : "false");
    o.tabIndex = i === index ? 0 : -1;
  });

  $("cycle-nom").textContent = cycle.nom;
  detenerRafalasGL();

  if (etatVideActif) return;

  if (cycle.statut === "en_cours") {
    demarrerChrono(cycle.debutOffsetS);
    const dernier = cycle.passages[cycle.passages.length - 1];
    $("cycle-agent-actuel-nom").textContent = dernier.agent;
    definirPastilleAttente(true, "en cours");
  } else {
    figerChrono(cycle.dureeTotaleS);
    $("cycle-agent-actuel-nom").textContent = "cycle terminé";
    definirPastilleAttente(false, "terminé");
  }

  dessinerDiagramme(cycle);
  if (gl) { reconstruirPalette(); construirEscenaProfundidad(cycle); posicionarPlacas(); }
  if (cycle.statut === "en_cours" && !reduitActif()) planificarRafalaGL();
  if (modoActual === "profondidad") arrancarGL();

  const outilsTotal = cycle.passages.reduce((s, p) => s + (p.outils || 0), 0);
  const fichiersTotal = cycle.passages.reduce((s, p) => s + (p.fichiers || 0), 0);
  $("stat-duree").textContent = cycle.statut === "en_cours" ? dur(cycle.debutOffsetS) : dur(cycle.dureeTotaleS);
  $("stat-outils").textContent = String(outilsTotal);
  $("stat-fichiers").textContent = String(fichiersTotal);
  $("stat-rebouclages").textContent = String((cycle.rebouclages || []).length);
}

/* ============================================================ kanban ====*/
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
    const p = document.createElement("p"); p.className = "vide"; p.textContent = "Aucune spécification dans le dépôt.";
    conteneur.appendChild(p);
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

/* ==================================================== état du dépôt =====*/
const FICHIERS_DEMO = [
  { code: "??", chemin: "control-center/maquettes/2026-09-19-couloir.html" },
  { code: "??", chemin: "control-center/maquettes/2026-09-19-couloir.js" },
  { code: "M", chemin: "specs/features/doing/feature-021-revenir-a-un-tableau-de-bord-unifie.md" },
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

/* ==================================================== panneau démo ======*/
function definirPressed(id, valeur) { const b = $(id); if (b) b.setAttribute("aria-pressed", valeur ? "true" : "false"); }

function indexCycleActif() {
  const i = ongletsCyclesRef.findIndex((o) => o && o.getAttribute("aria-selected") === "true");
  return i === -1 ? 0 : i;
}

function appliquerEtatVide(actif) {
  etatVideActif = actif;
  definirPressed("demo-vide", actif);
  if (actif) {
    detenerRafalasGL(); detenerGL();
    figerChrono(0);
    $("chrono").dataset.fige = "faux";
    $("chrono-texte").textContent = "--:--:--";
    $("cycle-nom").textContent = "Aucun cycle dans ce dépôt";
    $("cycle-agent-actuel-nom").textContent = "";
    definirPastilleAttente(false, "");
    const svg = $("dg-svg");
    if (svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); svg.setAttribute("viewBox", "0 0 200 60"); }
    escena = { puntos: [], placas: [] };
    posicionarPlacas();
    if (gl) dibujarEscenaGL(performance.now());
    ["stat-duree", "stat-outils", "stat-fichiers", "stat-rebouclages"].forEach((id) => { $(id).textContent = "—"; });
  } else {
    afficherCycle(indexCycleActif());
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
  if (jauge) { jauge.textContent = actif ? "lecture seule" : "écriture activée"; jauge.classList.toggle("lecture-seule", actif); }
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
  if (jaugeFlux) { jaugeFlux.textContent = actif ? "flux interrompu" : "flux connecté"; jaugeFlux.classList.toggle("ko", actif); jaugeFlux.classList.toggle("ok", !actif); }
  if (actif) {
    const cycle = CYCLES_DEMO[indexCycleActif()];
    const dejaEcoule = cycle.statut === "en_cours" ? Math.floor((Date.now() - chronoDepart) / 1000) : cycle.dureeTotaleS;
    figerChrono(dejaEcoule);
    detenerRafalasGL();
    detenerGL();
    if (gl) dibujarEscenaGL(performance.now());
  } else if (!etatVideActif) {
    afficherCycle(indexCycleActif());
  }
}

function appliquerApercuReduit(actif) {
  forcerReduitDemo = actif;
  definirPressed("demo-reduit", actif);
  notifierChangementReduit();
}

function appliquerSinWebglDemo(actif) {
  forzarSinWebglDemo = actif;
  definirPressed("demo-sin-webgl", actif);
  if (actif && modoActual === "profondidad") { detenerGL(); }
  construirBascule();
  fijarModo(actif ? "plano" : (glReal ? "profondidad" : "plano"));
  if (!actif && !etatVideActif) afficherCycle(indexCycleActif());
}

$("demo-vide") && $("demo-vide").addEventListener("click", () => appliquerEtatVide($("demo-vide").getAttribute("aria-pressed") !== "true"));
$("demo-lecture-seule") && $("demo-lecture-seule").addEventListener("click", () => appliquerEtatLectureSeule($("demo-lecture-seule").getAttribute("aria-pressed") !== "true"));
$("demo-injoignable") && $("demo-injoignable").addEventListener("click", () => appliquerEtatInjoignable($("demo-injoignable").getAttribute("aria-pressed") !== "true"));
$("demo-reduit") && $("demo-reduit").addEventListener("click", () => appliquerApercuReduit($("demo-reduit").getAttribute("aria-pressed") !== "true"));
$("demo-sin-webgl") && $("demo-sin-webgl").addEventListener("click", () => appliquerSinWebglDemo($("demo-sin-webgl").getAttribute("aria-pressed") !== "true"));

$("bouton-simuler-chute") && $("bouton-simuler-chute").addEventListener("click", () => {
  const totalS = Math.floor((Date.now() - chronoDepart) / 1000);
  figerChrono(totalS);
  detenerRafalasGL();
  detenerGL();
  if (gl) dibujarEscenaGL(performance.now());
  definirPastilleAttente(false, "flux interrompu");
});
$("bandeau-hote-bouton") && $("bandeau-hote-bouton").addEventListener("click", () => appliquerEtatInjoignable(false));

/* ============================================================ horloge ===*/
function rafraichirHorodatage() {
  const el = $("horodatage");
  if (!el) return;
  const maintenant = new Date();
  el.textContent = String(maintenant.getHours()).padStart(2, "0") + ":" + String(maintenant.getMinutes()).padStart(2, "0") + ":" + String(maintenant.getSeconds()).padStart(2, "0");
}
setInterval(rafraichirHorodatage, reduitActif() ? 60000 : 1000);
rafraichirHorodatage();

/* ============================================================ amorçage ==*/
function initObservateurVisibilite() {
  if (typeof IntersectionObserver !== "function") return;
  const cadre = $("diagramme-cadre");
  if (!cadre) return;
  new IntersectionObserver((entrees) => {
    entrees.forEach((entree) => {
      pausadoPorVisibilidad = !entree.isIntersecting;
      if (pausadoPorVisibilidad) detenerGL(); else arrancarGL();
    });
  }, { threshold: 0.01 }).observe(cadre);
}

marcarVistaReducida(reduitActif());

const banda = $("bande-cycles");
ongletsCyclesRef = CYCLES_DEMO.map((_, i) => $("cycle-tab-" + i)).filter(Boolean);
activerRovingTabindex(ongletsCyclesRef, (index) => afficherCycle(index));

gl = iniciarGL();
glReal = Boolean(gl);
if (gl) reconstruirPalette();
modoActual = glReal ? "profondidad" : "plano";
construirBascule();
window.addEventListener("resize", () => { redimensionarEscenaProfundidad(); });
initParallaxe();
initObservateurVisibilite();
rendreKanban();
rendreFichiers();
afficherCycle(0);
fijarModo(modoActual);
