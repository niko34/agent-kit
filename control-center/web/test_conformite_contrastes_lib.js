"use strict";
/* feature-021, cycle 2 — dérivation PARTAGÉE de la matrice de contraste.
 *
 * Extrait de `test_conformite_contrastes.js` (F5a) au lot 5, pour que F5b
 * (`test_app_contrastes_navigateur.py`, qui vérifie ce qui est RÉELLEMENT
 * PEINT) n'ait JAMAIS à recopier cette dérivation à la main (PIEGES §21) :
 * les deux volets partagent la MÊME fonction, appliquée au MÊME CSS source
 * (le prototype — F1 garantit l'égalité au bit près avec `app.css`).
 *
 * `deriverMatriceContraste(cssBrut)` → {
 *   JETONS,               // identifiant -> hex (28 : 20 `:root` + 8 promus)
 *   ROLES,                // identifiant -> "texte" | "trait" | "fond" | "decor"
 *   SURFACES,              // les 5 jetons de fond retenus (Cycle 2, point 1)
 *   ENCRES,                // jetons de rôle texte/trait
 *   COUPLES_INTERDITS,     // [{encre, fond, contraste, seuil, role}]
 *   rolesManquants,        // jetons dérivés SANS rôle déclaré (clause miroir)
 *   rolesPerimes,          // rôles déclarés pour un jeton qui n'existe plus
 * }
 */

const lib = require("./test_conformite_lib.js");

const TEXTE = "texte", TRAIT = "trait", FOND = "fond", DECOR = "decor";
// Rôle d'un APLAT (forme pleine peinte en `background`), distinct du rôle du
// jeton : voir `USAGES_APLAT` plus bas.
const INDICATEUR = "indicateur";

// SEULE énumération tenue à la main tolérée (aucun artefact ne porte le
// rôle d'un jeton) — soumise à la clause miroir ci-dessous.
//
// ⚠️ CE QUE CETTE TABLE CLASSE, ET CE QU'ELLE NE CLASSE PAS (reboucle lot 5).
// Elle porte le rôle d'un jeton EN TANT QU'ENCRE DE TEXTE OU DE FILET —
// c'est tout ce dont la matrice arithmétique (F5a) a besoin. Elle ne dit
// RIEN de ce qu'un jeton devient quand il est peint en APLAT (`background`
// d'une forme pleine) : un même jeton sert alors à plusieurs choses, et le
// classer en bloc exempte des usages qu'on n'a pas regardés. Le rôle d'un
// aplat est déclaré usage par usage dans `USAGES_APLAT`, et c'est F5b qui
// le confronte au rendu réel.
//
// ⚠️ `--line` reclassé `decor`, PAS `trait`, au lot 5 (F5b, en écrivant
// `test_app_contrastes_navigateur.py`) : mesuré RÉELLEMENT PEINT comme
// bordure de `.bloc`/`.kanban-column`/`.feature-card`/etc. sur `--surface`
// (contraste 1,45:1), F5b le voyait « interdit peint » sur CHAQUE panneau du
// cockpit — pas un cas isolé, la totalité des cadres décoratifs de la page.
// `--line`/`--line-strong` correspondent aux jetons M3 `outline-variant`/
// `outline` : `outline-variant` est PAR DÉFINITION un filet décoratif de
// séparation, sans seuil de contraste minimal (WCAG 1.4.11, exception
// « Decoration » — un filet qui ne porte aucune information n'entre pas
// dans le contrat de contraste non textuel) ; `outline` (`--line-strong`)
// reste `trait`, il porte un ÉTAT (`.cycle-etat.sans-cloture`,
// `.agent-flag--sans-cloture`) et son contraste sur `--surface` (3,31)
// passe le seuil de toute façon. `DECOR` n'entre PAS dans `ENCRES` : la
// clause miroir (« tout jeton dérivé a un rôle ») reste satisfaite, mais
// aucun couple `--line` × surface n'entre plus dans la matrice — ni F5a
// (qui n'assertionne aucun COMPTE fixe, seulement rôle complet + au moins
// un couple interdit) ni son registre `ATTENDU_ROUGE` (resté VIDE) n'en
// sont affectés.
const ROLES = {
  "--bg": FOND, "--surface": FOND, "--surface-low": FOND, "--surface-high": FOND, "--surface-highest": FOND,
  "--ink": TEXTE, "--muted": TEXTE,
  "--line": DECOR, "--line-strong": TRAIT,
  "--primary": TEXTE, "--primary-soft": FOND, "--primary-ink": TEXTE,
  "--teal": TEXTE, "--teal-soft": FOND,
  "--coral": TEXTE, "--coral-soft": FOND,
  "--amber": TEXTE, "--amber-soft": FOND,
  "--danger": TEXTE, "--danger-soft": FOND,
  "#aaa6b0": TRAIT, "#777385": TRAIT,
  "#4e1d12": TEXTE, "#654b00": TEXTE, "#690005": TEXTE,
  "#eea52a": FOND, "#3b8f35": FOND, "#fff0c8": FOND,
};

/* ===================================================================== *
 * USAGES_APLAT — le rôle appartient à l'USAGE, pas au jeton
 * ===================================================================== *
 *
 * Pourquoi cette table existe (reboucle lot 5). `--line` a été reclassé
 * `decor` parce qu'il est peint comme BORDURE partout dans le cockpit, et
 * qu'un filet de séparation M3 (`outline-variant`) relève bien de
 * l'exception « Decoration » de WCAG 1.4.11. Mais `--line` est AUSSI peint
 * en aplat à cinq endroits (formes pleines, jamais des filets), à un
 * contraste de 1,14 à 1,45 sur les surfaces. Reclasser le JETON en bloc
 * exemptait donc ces cinq usages au passage — dont des pastilles qui
 * PORTENT DU SENS, et qui sont précisément les « Graphical Objects — parts
 * of graphics required to understand the content » que l'exception
 * « Decoration » NE couvre PAS.
 *
 * Deux rôles, et un seul a un seuil :
 *   - `INDICATEUR` : la forme porte de l'information. Seuil 3,0 contre la
 *     surface RÉELLEMENT peinte derrière elle, mesurée par F5b — jamais
 *     déduite ici, la cascade et le DOM décident.
 *   - `DECOR` : la forme ne porte rien qu'un texte adjacent ne dise déjà,
 *     ou n'est jamais peinte. Exempte, mais le motif est écrit.
 *
 * ⚠️ CLAUSE MIROIR (un seul sens, délibérément). F5b échoue sur tout aplat
 * PEINT dont le sélecteur n'est pas déclaré ici. L'inverse — un usage
 * déclaré qu'on ne voit jamais peint — n'échoue PAS et se signale : un
 * repli CSS systématiquement surchargé est légitime (`.column-label i` en
 * est un), et le faire échouer pousserait à supprimer des replis utiles.
 */
const USAGES_APLAT = {
  ".status-dot": {
    role: INDICATEUR,
    motif:
      "état de la connexion au flux. `--line` est l'état INACTIF (`.actif` " +
      "passe à `--teal`) : il dit « pas vivant », donc il doit se voir. " +
      "⚠️ divergence assumée au prototype, qui peint ce point TOUJOURS en " +
      "`--teal` (l. 117) et n'a donc jamais eu d'état inactif à représenter.",
  },
  ".legend i": {
    role: INDICATEUR,
    motif:
      "pastille de la légende. C'est la SEULE fonction de l'élément : faire " +
      "correspondre une teinte à un libellé. Invisible, la légende ne peut " +
      "plus rien expliquer — en particulier pour « Non lancé », dont la " +
      "pastille est justement celle laissée en `--line` par le prototype.",
  },
  ".sheet-handle": {
    role: INDICATEUR,
    motif:
      "poignée de la feuille de détail : c'est l'affordance qui signale " +
      "qu'on peut la déplier. Rien d'autre ne le dit à l'écran.",
  },
  // ⚠️ ORDRE SIGNIFIANT : le balayage retient le PREMIER sélecteur qui
  // `matches`. `.file-dots i.on` doit précéder `.file-dots i`, sinon l'état
  // allumé serait jugé par la règle de l'état éteint.
  ".file-dots i.on": {
    role: INDICATEUR,
    motif:
      "pastille ALLUMÉE : elle dit qu'un fichier a été touché, c'est la " +
      "seule lecture de cette information sur le disque.",
  },
  ".file-dots i": {
    role: DECOR,
    motif:
      "pastille ÉTEINTE (`opacity: .35`) : elle ne dit rien par elle-même, " +
      "seul son voisinage allumé informe. ⚠️ Limite assumée du balayage : " +
      "il lit `background-color`, qui NE tient PAS compte d'`opacity` — " +
      "l'état éteint n'est donc pas jugé sur sa couleur effective. Le " +
      "classer INDICATEUR donnerait un vert trompeur, pas une garantie.",
  },
  ".porte-fond": {
    role: DECOR,
    motif:
      "voile de la modale (`color-mix(--ink 45%, transparent)`) : il " +
      "assombrit et intercepte les clics, il ne porte aucune information. " +
      "Ce qu'il doit faire — rendre la page inerte — est vérifié par F4b, " +
      "pas par du contraste.",
  },
  ".brand-mark i": {
    role: DECOR,
    motif: "les quatre points du logotype : ornement, aucun état.",
  },
  ".tool-ticks i": {
    role: DECOR,
    motif:
      "une des 12 graduations. `ADR-0031 §2` les rend FIXES et purement " +
      "décoratives : le compte d'appels d'outils n'est plus représenté là " +
      "— c'est une perte de conception nommée dans l'ADR, pas une " +
      "information à rendre lisible ici. Elle se lit dans la feuille de " +
      "détail (« Graduations · outils », F11).",
  },
  ".work-dot": {
    role: DECOR,
    motif:
      "point en orbite de l'anneau d'activité : redondant avec l'anneau " +
      "lui-même, qui porte déjà l'état et reste visible sans lui " +
      "(`prefers-reduced-motion`, F14).",
  },
  "input, textarea": {
    role: DECOR,
    motif:
      "remplissage d'un champ de saisie : c'est sa BORDURE qui en dessine " +
      "la limite, et elle est déjà jugée par le balayage des traits. " +
      "Le remplissage seul ne porte rien.",
  },
  ".column-label i": {
    role: DECOR,
    motif:
      "repli JAMAIS peint : les trois colonnes le surchargent " +
      "(`.column-todo`, `.column-doing`, `.column-done`), comme dans le " +
      "prototype (l. 497-500). Vérifié par la clause miroir, qui ne le voit " +
      "jamais parmi les aplats peints.",
  },
  // feature-025 (lots 9-10) : `.progress-track` — ADOPTÉE REDÉFINIE (table
  // F0), PAS un pourcentage mesuré (K4, voir app.css pour la justification
  // complète). `aria-hidden="true"` dans `index.html`/`app.js` : la colonne
  // porte déjà cette information au clavier et au lecteur d'écran (le
  // titre de section `.column-title`), ceci n'en est qu'un RENFORT visuel
  // — DECOR par construction, pas une seconde source de vérité que son
  // illisibilité priverait d'information.
  ".progress-track": {
    role: DECOR,
    motif:
      "piste de fond de la barre d'état de colonne : décorative, " +
      "`aria-hidden`, la colonne qui porte l'information reste " +
      "`.column-title`.",
  },
  ".progress-track i": {
    role: DECOR,
    motif:
      "remplissage de la barre d'état de colonne : même motif que le " +
      "conteneur — décoratif, `aria-hidden`, trois largeurs FIXES par " +
      "état (jamais un pourcentage, jamais une information isolée ici).",
  },
  ".kanban-viewport::-webkit-scrollbar-thumb": {
    role: DECOR,
    pseudo: true,
    motif:
      "pouce d'ascenseur : dessiné par le moteur, hors de l'arbre du " +
      "document, donc hors de portée de `el.matches()` — déclaré ici pour " +
      "mémoire, jamais balayé par F5b. Le prototype le cercle de `--bg` " +
      "(l. 480), ce qui le détache du fond sans dépendre du contraste.",
  },
};

const SURFACES = ["--bg", "--surface", "--surface-low", "--surface-high", "--surface-highest"];
const SEUIL_APLAT_INDICATEUR = 3.0;
const SEUIL = { [TEXTE]: 4.65, [TRAIT]: 3.0 };
const EXCLUS_NON_COULEUR = { mask: "arrêt de dégradé de masque (canal alpha), pas une couleur peinte" };

function hexVersRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function canalLineaire(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function luminanceRelative(hex) {
  const [r, g, b] = hexVersRgb(hex);
  return 0.2126 * canalLineaire(r) + 0.7152 * canalLineaire(g) + 0.0722 * canalLineaire(b);
}
function contraste(hexA, hexB) {
  const la = luminanceRelative(hexA), lb = luminanceRelative(hexB);
  const [clair, sombre] = la >= lb ? [la, lb] : [lb, la];
  return (clair + 0.05) / (sombre + 0.05);
}

function deriverMatriceContraste(cssBrut) {
  const declRoot = lib.declarationsRoot(cssBrut);
  const JETONS = {};
  for (const d of declRoot) {
    if (d.prop.startsWith("--") && /^#[0-9a-fA-F]{3,8}$/.test(d.val)) JETONS[d.prop] = d.val;
  }

  const ctxHorsRoot = lib.hexHorsRootAvecContexte(cssBrut);
  const promusParHex = new Map();
  for (const occ of ctxHorsRoot) {
    if (!promusParHex.has(occ.hex)) promusParHex.set(occ.hex, { props: new Set() });
    promusParHex.get(occ.hex).props.add(occ.prop);
  }
  for (const [hex, info] of promusParHex) {
    const proprietes = [...info.props];
    if (proprietes.every((p) => p in EXCLUS_NON_COULEUR)) continue;
    JETONS[hex] = hex;
  }

  const jetonsDerives = new Set(Object.keys(JETONS));
  const rolesManquants = [...jetonsDerives].filter((j) => !(j in ROLES));
  const rolesPerimes = Object.keys(ROLES).filter((j) => !jetonsDerives.has(j));

  const ENCRES = Object.keys(JETONS).filter((j) => ROLES[j] === TEXTE || ROLES[j] === TRAIT);

  const COUPLES_INTERDITS = [];
  for (const encre of ENCRES) {
    for (const fond of SURFACES) {
      if (encre === fond) continue;
      if (!(fond in JETONS)) continue;
      const c = contraste(JETONS[encre], JETONS[fond]);
      const seuil = SEUIL[ROLES[encre]];
      if (c < seuil) COUPLES_INTERDITS.push({ encre, fond, contraste: c, seuil, role: ROLES[encre] });
    }
  }

  return {
    JETONS, ROLES, SURFACES, ENCRES, COUPLES_INTERDITS, rolesManquants, rolesPerimes,
    USAGES_APLAT, SEUIL_APLAT_INDICATEUR, INDICATEUR,
    TEXTE, TRAIT, FOND, SEUIL,
  };
}

module.exports = {
  deriverMatriceContraste, contraste, luminanceRelative, hexVersRgb,
  TEXTE, TRAIT, FOND, DECOR, INDICATEUR, SEUIL, ROLES, SURFACES,
  USAGES_APLAT, SEUIL_APLAT_INDICATEUR,
};
