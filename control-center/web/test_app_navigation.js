"use strict";
/* Structure mono-écran (feature-021, cycle 2, lot 3, F7) — non-régressions
 * STATIQUES sur `index.html` et `app.css`.
 *
 *     node control-center/web/test_app_navigation.js
 *
 * ⚠️ Ce fichier s'appelait la suite de la navigation à onglets
 * (feature-019, absorbait bug-016). Cette navigation est RETIRÉE EN BLOC au
 * lot 3 : 0 `role="tab"`, plus de section masquée, tout le contenu est
 * empilé et lisible sans aucun clic. Les tests qui l'établissaient PAR
 * EXÉCUTION (bac à sable `vm` : roving tabindex, flèches, persistance
 * `localStorage`, focus sur le titre de la section arrivée) sont
 * ENTIÈREMENT SUPPRIMÉS avec elle — ils exerçaient `appliquerSection`,
 * qui n'existe plus dans `app.js`. Les garder aurait exercé une
 * fonctionnalité qu'aucune page réelle ne peut plus atteindre : un vert à
 * tort (PIEGES §21/§33).
 *
 * Ce qui reste ici est PUREMENT STATIQUE (lecture de texte, aucune
 * exécution de `app.js`) :
 *  B. Structure de `index.html` — la porte hors de `<main>`, le lien
 *     d'évitement, `#main-content`, les blocs fonctionnels tous visibles
 *     sans exception.
 *  C. Structure de `app.css` — classification chasse fixe/sans-serif,
 *     chiffres tabulaires, `.bloc h2`, la quatrième surface, profondeur des
 *     `z-index`, cibles interactives ≥ 48px.
 *
 * Le contrat de conformité au prototype (0 `role="tab"`, 25 id « adopté »
 * présents et conformes) est établi ET validé par mutation dans
 * `test_conformite_a11y.js` (F4a) — pas dupliqué ici. Le mécanisme
 * d'inertie de la porte (bug-017, absorbée au titre d'ADR-0017) est établi
 * PAR EXÉCUTION dans `test_app_bug017.js`, dédié — pas ici non plus : ce
 * fichier ne charge plus `app.js` du tout.
 */

const fs = require("fs");
const path = require("path");
const lib = require("./test_conformite_lib.js");

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

const ICI = __dirname;
const HTML = fs.readFileSync(path.join(ICI, "index.html"), "utf8");
const CSS = fs.readFileSync(path.join(ICI, "app.css"), "utf8");
const APP_JS_PATH = path.join(ICI, "app.js");

// ===================================================================== //
// B — structure statique de index.html                                   //
// ===================================================================== //

(function testPorteResteEnfantDirectDuBodyEtHorsDeMain() {
  // Condition héritée de feature-019, PRÉCONDITION du mécanisme d'inertie
  // de bug-017 (vérifié par exécution dans `test_app_bug017.js`, A0) : la
  // porte ne doit JAMAIS être déplacée dans `.app-shell` ni dans `<main>` —
  // elle apparaît APRÈS la fermeture de `</main>`, jamais entre `<main ...>`
  // et `</main>`.
  const iMainOuvre = HTML.indexOf("<main");
  const iMainFerme = HTML.indexOf("</main>");
  const iPorte = HTML.indexOf('id="porte-jeton"');
  check("B_porte_presente", iPorte !== -1);
  check("B_porte_hors_de_main",
    iPorte !== -1 && iMainFerme !== -1 && iPorte > iMainFerme,
    "porte@" + iPorte + " main-ouvre@" + iMainOuvre + " main-ferme@" + iMainFerme);
  check("B_aucun_transform_ni_filter_sur_html_body",
    !/\b(html|body)\s*\{[^}]*\b(transform|filter)\s*:/i.test(CSS));
})();

(function testSkipLinkPresentEtCibleMainContentFocalisable() {
  // F7 : le lien d'évitement (classe adoptée `skip-link`) cible
  // `#main-content` (id adopté), qui doit être PROGRAMMATIQUEMENT
  // focalisable (`tabindex="-1"`) — c'est aussi le repli NOMMÉ de
  // `fermerPorte()` (bug-017) quand rien n'était mémorisé avant l'ouverture.
  check("B_skip_link_present", /<a class="skip-link" href="#main-content">/.test(HTML));
  check("B_main_content_existe_et_focalisable",
    /<main class="main" id="main-content" tabindex="-1">/.test(HTML));
})();

(function testZeroSectionMasqueeNiAncienneNavigation() {
  // Non-régression directe du retrait de la navigation à onglets : aucun
  // vestige de `#section-*`/`#onglet-*`/`#nav-sections`/`#titre-section-*`,
  // et aucun `hidden` statique sur un des blocs fonctionnels — le mono-écran
  // montre TOUT, sans exception.
  check("B_aucun_id_section_residuel", !/id="section-[a-z]+"/.test(HTML));
  check("B_aucun_id_onglet_residuel", !/id="onglet-[a-z]+"/.test(HTML));
  check("B_aucun_nav_sections_residuel", !/id="nav-sections"/.test(HTML));
  check("B_aucun_id_titre_section_residuel", !/id="titre-section-[a-z]+"/.test(HTML));
})();

/* Les 4 contrôles inertes de la barre supérieure (feature-021, cycle 2,
 * lot 7, arbitrage designer 2026-09-22 10:05) : `aria-disabled="true"`,
 * JAMAIS `disabled` (qui sortirait l'élément du parcours clavier — la
 * garde exécutable de bug-017 le compterait alors correctement absent
 * pour la MAUVAISE raison, un motif qui ne s'annoncerait jamais), et
 * AUCUN `:hover` déclaré dans app.css (un survol actif suggérerait une
 * affordance qu'ils n'ont pas). Repéré par CLASSE, pas par id (ces
 * contrôles n'ont pas tous un id) — sur la balise ouvrante précise, jamais
 * une sous-chaîne du document (PIEGES §27). */
(function testControlesInertesDeLaBarreSuperieure() {
  const corps = lib.extraireCorpsAvantScript(HTML);
  function baliseParClasse(classe) {
    const echappe = classe.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const re = new RegExp('<[a-zA-Z][^>]*\\bclass="[^"]*\\b' + echappe + '\\b[^"]*"[^>]*>');
    const m = corps.match(re);
    return m ? m[0] : null;
  }
  const CONTROLES = ["project-switcher", "notification-button", "account-button"];
  for (const classe of CONTROLES) {
    const balise = baliseParClasse(classe);
    check("B_" + classe + "_present", !!balise, "classe absente de index.html");
    check("B_" + classe + "_aria_disabled_true",
      !!balise && /\baria-disabled="true"/.test(balise));
    check("B_" + classe + "_jamais_disabled",
      !!balise && !/\sdisabled\b/.test(balise));
    check("B_" + classe + "_porte_un_aria_label",
      !!balise && /\saria-label="[^"]+"/.test(balise));
  }
  // Le bouton « réglages » n'a NI id NI classe distinctive au-delà
  // d'`icon-button` (F0, PARTITION_CLASSES) : repéré par son aria-label,
  // seule ancre stable, sur la balise ouvrante précise.
  const iReglages = corps.indexOf('aria-label="Réglages —');
  check("B_reglages_present", iReglages !== -1);
  if (iReglages !== -1) {
    const debut = corps.lastIndexOf("<button", iReglages);
    const fin = corps.indexOf(">", iReglages);
    const baliseReglages = debut !== -1 && fin !== -1 ? corps.slice(debut, fin + 1) : "";
    check("B_reglages_aria_disabled_true", /\baria-disabled="true"/.test(baliseReglages));
    check("B_reglages_jamais_disabled", !/\sdisabled\b/.test(baliseReglages));
  }

  // Aucun `:hover` déclaré pour ces 4 sélecteurs (lecture PAR RÈGLE CSS
  // parsée, jamais par sous-chaîne : un commentaire qui les CITE ne doit
  // pas faire échouer cette garde à tort, PIEGES §26).
  const regles = lib.reglesCss(CSS);
  const HOVERS_INTERDITS = [
    ".project-switcher:hover", ".icon-button:hover",
    ".notification-button:hover", ".account-button:hover",
  ];
  for (const hover of HOVERS_INTERDITS) {
    const trouve = regles.some((r) => !r.estAtRegle && !r.estKeyframes
      && r.selecteur.split(",").map((s) => s.trim()).includes(hover));
    check("B_aucun_hover_" + hover.replace(/[^a-z]+/gi, "_"), !trouve,
      hover + " ne doit jamais être déclaré (contrôle inerte, lot 7)");
  }
})();

/* Badge de notification : donnée d'exemple RETIRÉE (règle humaine
 * 2026-09-22). Aucun compte fabriqué, l'élément reste `hidden`. */
(function testBadgeNotificationSansDonneeFabriquee() {
  check("B_aucun_badge_notification_3_fabrique",
    !/class="notification-badge"[^>]*>\s*3\s*</.test(HTML));
  check("B_notification_badge_hidden_par_defaut",
    /class="notification-badge"[^>]*\bhidden\b/.test(HTML));
})();

/* Identité : AUCUNE donnée de la maquette (le « Jean Dupont »/« JD »
 * d'exemple) ne doit être recopiée en dur — S4.1/S4.2 exigent une
 * DÉRIVATION depuis `etat.identite`, jamais une fabrication statique. */
(function testAucuneIdentiteFabriqueeDansLeHtml() {
  check("B_aucun_jean_dupont_fabrique", !/Jean Dupont/.test(HTML));
  check("B_aucun_jd_fabrique_dans_avatar",
    !/class="avatar"[^>]*>\s*JD\s*</.test(HTML));
})();

/* Neuf blocs atteignables, une assertion épinglée par bloc — pas seulement
 * « neuf titres trouvés » (même défaut que l'ancien E5 : une prose voisine
 * qui MENTIONNE un libellé ferait passer l'assertion à tort si elle
 * cherchait une sous-chaîne dans tout le document — PIEGES §27). Chaque
 * libellé est cherché comme contenu d'un `<h1>`/`<h2>` précis, jamais dans
 * un bloc de texte qui l'engloberait. */
(function testNeufBlocsAtteignablesEpinglesUnParUn() {
  function echapper(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  const BLOCS = [
    ["h1", "Aucun cycle observé"],
    ["h2", "Agents"],
    ["h2", "Système"],
    ["h2", "Que souhaitez-vous développer"],
    ["h2", "Spécifications"],
    ["h2", "Pilotage"],
    ["h2", "Cycles"],
    ["h2", "Fichiers touchés"],
    ["h2", "Derniers événements"],
  ];
  BLOCS.forEach(([balise, libelle]) => {
    const re = new RegExp("<" + balise + "[^>]*>[^<]*" + echapper(libelle) + "[^<]*</" + balise + ">");
    check("E5_bloc_" + libelle.replace(/[^a-zA-Z]+/g, "_"), re.test(HTML),
      "« " + libelle + " » introuvable dans un <" + balise + ">");
  });
  // Aucun de ces neuf blocs n'est masqué : le mono-écran n'a plus de
  // pagination — un `hidden` réapparu sur l'un d'eux serait une régression
  // vers l'ancien découpage en onglets.
  check("E5_aucun_hidden_statique_dans_le_corps",
    !/<(section|main)[^>]*\bhidden\b/.test(HTML));
})();

// ===================================================================== //
// C — structure statique de app.css                                      //
// ===================================================================== //

function sansCommentairesCSS(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ""); }
const CSS_SANS_COMMENTAIRES = sansCommentairesCSS(CSS);

(function testMonospaceUniquementSurDesIdentifiantsTechniques() {
  const compteMono = (CSS_SANS_COMMENTAIRES.match(/var\(--mono\)/g) || []).length;
  const compteSans = (CSS_SANS_COMMENTAIRES.match(/var\(--sans\)/g) || []).length;
  // feature-021 cycle 2, lot 3 (F7) : `#selected-code` (bottom sheet, id
  // adopté F0 — sigle du passage sélectionné, ex. « SR ») rejoint la chasse
  // fixe, MÊME NATURE que `.agent-sigle` — un sigle de deux à trois lettres
  // est un identifiant, pas une phrase lue.
  // feature-021 cycle 2, lot 4 : le diagramme hérité (`.dg-sigle`,
  // `.dg-socle-duree`/`.dg-socle-heure-duree`, `.dg-socle-heure`/`.dg-socle-
  // nom`, `.dg-repli`/`.dg-libelle-cadre`, `.dg-pastille-attente text`,
  // `.dg-arc-libelle`, `.diagramme-legende dt`) est RETIRÉ avec ses jetons
  // transitoires (ADR-0031/0032) : 20 → 18 mono (−2, `.dg-sigle` et
  // `.dg-socle-duree, .dg-socle-heure-duree`) ; 24 → 19 sans-serif (−5, les
  // cinq règles `font-family: var(--sans)` du diagramme hérité). Le disque
  // Material 3 (`.agent-code`/`.agent-name`/`.agent-duration`) n'impose
  // AUCUN `font-family` explicite — comme le prototype, il hérite du
  // sans-serif de `body`, non compté par ce grep littéral.
  //
  // feature-021 cycle 2, lot 5 (F10) : le kanban est réécrit sur les classes
  // M3 (`kanban-grid`/`kanban-column`/`column-title`/`feature-card`/
  // `card-footer`), qui n'imposent — comme le prototype — AUCUN
  // `font-family` explicite : 18 → 17 mono (−1, `.carte .cid` disparaît
  // avec `.carte`, aucun remplaçant dédié : l'identifiant de spec n'a plus
  // de chasse fixe propre dans la carte M3) ; 19 → 17 sans (−2,
  // `.colonne-entete` et `.etiquette` disparaissent avec le rendu qu'ils
  // habillaient, sans qu'aucune règle neuve ne redéclare `var(--sans)` —
  // héritée du corps, comme dans le prototype).
  // feature-021 cycle 2, lots 9-10 (feature-025, B2) : `#tiroir-edition-
  // texte` reprend le tiroir EXISTANT comme surface de modification d'une
  // spec — c'est du Markdown technique relu par un humain, MÊME NATURE que
  // `#tiroir-contenu` qu'il complète (l'un affiche, l'autre édite le même
  // texte) : 17 → 18 mono (+1), sans-serif inchangé.
  check("C_compte_mono_final_dix_sept", compteMono === 18, "obtenu " + compteMono);
  check("C_compte_sans_final_dix_sept", compteSans === 17, "obtenu " + compteSans);

  const DOIT_RESTER_MONO = [
    ".projet", ".note code", ".agents .nom", ".agents .modele",
    ".agent-sigle", ".agent-nom", ".maillon .mnom",
    ".pilotage-jeton input", "#sortie-lancement", ".fichier .fcode",
    ".fichier .fchemin", ".timeline .quoi", ".tiroir-barre",
    "#tiroir-contenu", "#porte-champ", ".selected-mark", "#tiroir-edition-texte",
  ];
  DOIT_RESTER_MONO.forEach((selecteur) => {
    const i = CSS_SANS_COMMENTAIRES.indexOf(selecteur);
    check("C_reste_mono_" + selecteur, i !== -1, "sélecteur introuvable : " + selecteur);
  });

  const DOIT_ETRE_SANS = [
    ".jauge", ".horodatage", ".bloc h2", ".compteur", ".systeme dd",
    '.filtres input[type="search"]', ".column-title", ".card-footer",
    ".cycle-designation", ".cycle-etat", ".cycle-proprietes dd",
    ".maillon .mduree", ".pilotage-ligne", ".pilotage-tronque",
    ".timeline .heure",
  ];
  DOIT_ETRE_SANS.forEach((selecteur) => {
    const i = CSS_SANS_COMMENTAIRES.indexOf(selecteur);
    check("C_passe_sans_" + selecteur, i !== -1, "sélecteur introuvable : " + selecteur);
  });
})();

/* ===================================================================== *
 * C bis — E3 : TOUT `var(--mono)` résiduel appartient à une liste blanche,
 * établie par PARCOURS DES RÈGLES de la feuille — pas par présence isolée
 * d'un sélecteur dans la chaîne (PIEGES §26/§27).
 * ===================================================================== */

function analyserReglesCSS(css) {
  const regles = [];
  let i = 0;
  const n = css.length;
  let debutEntete = 0;
  while (i < n) {
    if (css[i] === "{") {
      const entete = css.slice(debutEntete, i).trim();
      if (/^@/.test(entete)) {
        i += 1;
        debutEntete = i;
        continue;
      }
      let profondeur = 1;
      let j = i + 1;
      while (j < n && profondeur > 0) {
        if (css[j] === "{") profondeur += 1;
        else if (css[j] === "}") profondeur -= 1;
        j += 1;
      }
      regles.push({ selecteur: entete, corps: css.slice(i + 1, j - 1) });
      i = j;
      debutEntete = i;
      continue;
    }
    if (css[i] === "}") {
      i += 1;
      debutEntete = i;
      continue;
    }
    i += 1;
  }
  return regles;
}

(function testMonospaceResiduelParParcoursDesRegles() {
  const regles = analyserReglesCSS(CSS_SANS_COMMENTAIRES);
  check("prealable_parseur_trouve_des_regles", regles.length > 50, "obtenu " + regles.length);

  const sondeUneLigne = analyserReglesCSS(".sonde-une-ligne { font-family: var(--mono); }");
  check("prealable_parseur_detecte_une_regle_sur_une_seule_ligne",
    sondeUneLigne.length === 1 && sondeUneLigne[0].selecteur === ".sonde-une-ligne"
    && /var\(--mono\)/.test(sondeUneLigne[0].corps),
    JSON.stringify(sondeUneLigne));

  const selecteursMono = new Set();
  regles.forEach((r) => {
    if (/var\(--mono\)/.test(r.corps)) {
      r.selecteur.split(",").map((s) => s.trim()).filter(Boolean)
        .forEach((s) => selecteursMono.add(s));
    }
  });

  const LISTE_BLANCHE_MONO = [
    ".projet", ".note code", ".agents .nom", ".agents .modele",
    ".agent-sigle", ".agent-nom", ".maillon .mnom",
    ".pilotage-jeton input", ".pilotage-select select", "#sortie-lancement",
    ".fichier .fcode", ".fichier .fchemin", ".timeline .quoi",
    ".tiroir-barre", "#tiroir-contenu", "#porte-champ",
    ".demande textarea.brouillon",
    // feature-021 cycle 2, lot 3 (F7) : sigle du passage sélectionné
    // (bottom sheet, id adopté), même nature que `.agent-sigle`.
    ".selected-mark",
    // feature-025 (lots 9-10) : surface de modification d'une spec,
    // réutilise le tiroir existant — voir le commentaire au-dessus de
    // `C_compte_mono_final_dix_sept`.
    "#tiroir-edition-texte",
    // `.carte .cid` (feature-008) RETIRÉ au lot 5 (F10) : le kanban M3 ne
    // porte plus de chasse fixe dédiée à l'identifiant de spec.
  ];

  const blancheSet = new Set(LISTE_BLANCHE_MONO);
  selecteursMono.forEach((s) => {
    check("E3_selecteur_mono_residuel_" + s + "_dans_la_liste_blanche",
      blancheSet.has(s), "sélecteur trouvé par parcours des règles, absent de la liste blanche : " + s);
  });
  LISTE_BLANCHE_MONO.forEach((s) => {
    check("E3_entree_liste_blanche_" + s + "_reellement_utilisee",
      selecteursMono.has(s), "sélecteur de la liste blanche introuvable par parcours des règles : " + s);
  });
  check("E3_liste_blanche_meme_cardinal_que_le_residu_reel",
    selecteursMono.size === LISTE_BLANCHE_MONO.length,
    "résidu réel: " + selecteursMono.size + ", liste blanche: " + LISTE_BLANCHE_MONO.length);
})();

(function testChiffresTabularNums() {
  const CIBLES = [".systeme dd", ".timeline .heure", ".column-title", ".compteur", ".horodatage", ".maillon .mduree"];
  CIBLES.forEach((selecteur) => {
    const i = CSS_SANS_COMMENTAIRES.indexOf(selecteur);
    if (i === -1) { check("C_tabular_nums_" + selecteur, false, "sélecteur introuvable"); return; }
    const finBloc = CSS_SANS_COMMENTAIRES.indexOf("}", i);
    const bloc = CSS_SANS_COMMENTAIRES.slice(i, finBloc);
    check("C_tabular_nums_" + selecteur, bloc.indexOf("tabular-nums") !== -1, "bloc: " + bloc.trim());
  });
})();

(function testBlocH2TroisCorrections() {
  const i = CSS_SANS_COMMENTAIRES.indexOf(".bloc h2");
  const fin = CSS_SANS_COMMENTAIRES.indexOf("}", i);
  const bloc = CSS_SANS_COMMENTAIRES.slice(i, fin);
  check("C_bloc_h2_sans_serif", bloc.indexOf("var(--sans)") !== -1, bloc);
  check("C_bloc_h2_dix_huit_px", /font-size:\s*18px/.test(bloc), bloc);
  // feature-021 cycle 2, lot 3 (F1_TRANSITOIRE_SEMANTIQUE_CLAIR) :
  // `var(--texte)` a été re-pointé sur `var(--ink)`, MÊME VALEUR peinte.
  check("C_bloc_h2_texte_pas_faible", /color:\s*var\(--ink\)\s*;/.test(bloc), bloc);
  check("C_bloc_h2_pas_de_majuscules", !/text-transform/.test(bloc), bloc);
  check("C_bloc_h2_pas_d_interlettrage", !/letter-spacing/.test(bloc), bloc);
})();

(function testQuatriemeSurfaceLimiteeAuxInteractions() {
  // feature-021 cycle 2, lot 3 : `var(--surface-2)` a été re-pointé sur
  // `var(--surface-low)` (F1_TRANSITOIRE_SEMANTIQUE_CLAIR), ET
  // `.nav-onglet:hover` — l'un des DEUX usages d'entrée — a disparu AVEC la
  // navigation à onglets qui le portait (F7). Un usage hérité subsiste :
  // `.cycle-bouton:hover` (accordéon des cycles, feature-016, INCHANGÉ) ;
  // un usage NEUF le rejoint, fidèle au prototype (l.422) : `.sheet-toggle`
  // (bottom sheet, F11) porte un aplat de repos DANS LE PROTOTYPE LUI-MÊME
  // — `.cycle-canvas`, à l'inverse, N'A PAS de fond propre dans le
  // prototype (l.231-237) et n'en reçoit donc aucun ici (ADR-0024 §4 :
  // `--surface-2`/`--surface-low` reste interdit en aplat de repos INVENTÉ,
  // pas en aplat COPIÉ du prototype qui fait foi).
  //
  // feature-021 cycle 2, lots 9-10 (feature-025) : SIX usages neufs
  // rejoignent les deux existants (`.sheet-toggle`, `.cycle-bouton:hover`),
  // tous COPIÉS du prototype (jamais inventés, ADR-0024 §4) : `.menu-item:
  // hover` (interaction, l.529), `.feature-chip` (l.551), `.feature-fact`
  // (l.560), `.feature-dialog-actions` (l.563), `.type-segment` (l.581),
  // `.add-item-actions` (l.587) — 2 → 8.
  // feature-021 cycle 2, lot 11 (feature-022, absorbée) : DEUX usages neufs
  // rejoignent les huit précédents, tous deux COPIÉS du prototype (ADR-0024
  // §4) : `.bubble` (bulle de message, l.452) et `.composer` (fond du
  // composeur, l.456) — 8 → 10.
  const compte = (CSS_SANS_COMMENTAIRES.match(/var\(--surface-low\)/g) || []).length;
  check("C_surface_low_dix_usages", compte === 10, "obtenu " + compte);
  check("C_surface_low_cycle_bouton_survol_conserve",
    /\.cycle-bouton:hover\s*\{[^}]*var\(--surface-low\)/.test(CSS_SANS_COMMENTAIRES));
  check("C_surface_low_sheet_toggle_fidele_au_prototype",
    /\.sheet-toggle\s*\{[^}]*var\(--surface-low\)/.test(CSS_SANS_COMMENTAIRES));
  check("C_surface_low_bubble_fidele_au_prototype",
    /\.bubble\s*\{[^}]*var\(--surface-low\)/.test(CSS_SANS_COMMENTAIRES));
  check("C_surface_low_composer_fidele_au_prototype",
    /\.composer\s*\{[^}]*var\(--surface-low\)/.test(CSS_SANS_COMMENTAIRES));
  check("C_surface_low_cycle_canvas_aucun_fond_propre",
    !/\.cycle-canvas\s*\{[^}]*background/.test(CSS_SANS_COMMENTAIRES));
  check("C_surface_low_nav_onglet_survol_disparu",
    !/\.nav-onglet/.test(CSS_SANS_COMMENTAIRES));
  // Les trois aplats migrés (feature-019, §3) référencent `var(--surface)`,
  // toujours le jeton M3 du même nom (couche 1, jamais retiré).
  check("C_bandeau_hote_surface_pas_surface_low",
    /\.bandeau-hote\s*\{[^}]*background:\s*var\(--surface\)\s*;/.test(CSS_SANS_COMMENTAIRES));
  check("C_carte_surface_pas_surface_low",
    /\.feature-card\s*\{[^}]*background:\s*var\(--surface\)\s*;/.test(CSS_SANS_COMMENTAIRES));
  check("C_maillon_surface_pas_surface_low",
    /\.maillon\s*\{[^}]*background:\s*var\(--surface\)\s*[;,]/.test(CSS_SANS_COMMENTAIRES));
})();

(function testFsujetDistinctDeFchemin() {
  check("C_fsujet_existe_en_sans_serif",
    /\.fichier \.fsujet\s*\{[^}]*var\(--sans\)/.test(CSS_SANS_COMMENTAIRES));
  check("C_fchemin_reste_en_chasse_fixe",
    /\.fichier \.fchemin\s*\{[^}]*var\(--mono\)/.test(CSS_SANS_COMMENTAIRES));
  const appJs = fs.readFileSync(APP_JS_PATH, "utf8");
  check("C_app_js_utilise_fsujet_pour_le_sujet_de_commit",
    /el\("span",\s*"fsujet",\s*commit\.sujet\)/.test(appJs));
  check("C_app_js_n_utilise_plus_fchemin_pour_le_sujet_de_commit",
    !/el\("span",\s*"fchemin",\s*commit\.sujet\)/.test(appJs));
})();

(function testThemeJsCommentaireCorrige() {
  const themeJs = fs.readFileSync(path.join(ICI, "theme.js"), "utf8");
  check("C_theme_js_ne_dit_plus_que_la_csp_interdit_le_style_inline",
    !/CSP servie interdit[^]*?unsafe-inline`, voir server\.py/.test(themeJs)
    || /style-src[^]*?unsafe-inline/.test(themeJs) || /autorise[^]*?style inline/.test(themeJs),
    "le commentaire doit distinguer script (interdit) et style (autorisé)");
  check("C_theme_js_mentionne_les_scripts_explicitement", /SCRIPTS/.test(themeJs));
})();

/* Condition de sécurité, EXHAUSTIVE : tout `z-index` déclaré dans la feuille
 * reste sous la profondeur 30, SAUF la porte d'authentification elle-même
 * (`#porte-jeton`/`.porte`), qui EST le plafond documenté. Établi par
 * parcours des règles, pas par une liste de sélecteurs choisie à la main —
 * inchangé par le retrait de la navigation (`.nav-sections` portait 11,
 * disparu avec elle ; le repli générique ne perd donc rien à vérifier
 * « toute règle », pas une liste figée). */
(function testTousLesZIndexRestentSousLaPorte() {
  const regles = analyserReglesCSS(CSS_SANS_COMMENTAIRES);
  const PORTE = new Set(["#porte-jeton", ".porte", ".porte-fond", ".porte-carte"]);
  let trouves = 0;
  regles.forEach((r) => {
    const m = r.corps.match(/z-index:\s*(\d+)/);
    if (!m) return;
    trouves += 1;
    const z = parseInt(m[1], 10);
    const estPorte = r.selecteur.split(",").map((s) => s.trim()).some((s) => PORTE.has(s));
    if (estPorte) {
      check("E7_c3_porte_" + r.selecteur.replace(/[^a-zA-Z-]+/g, "_") + "_est_le_plafond_trente",
        z === 30, "obtenu " + z + " sur " + r.selecteur);
    } else {
      check("E7_c3_" + r.selecteur.replace(/[^a-zA-Z-]+/g, "_") + "_sous_trente",
        z < 30, "obtenu " + z + " sur " + r.selecteur);
    }
  });
  check("prealable_au_moins_cinq_regles_z_index_trouvees", trouves >= 5, "obtenu " + trouves);
})();

/* E9 (reformulée) — la réserve `.nav-onglet` à 44px FERME ici : le
 * composant disparaît avec la navigation à onglets (F7), son ancien test
 * `E9_nav_onglet_cible_44px_hors_media` avec lui (plus rien à mesurer sur un
 * sélecteur qui n'existe plus). Contre-partie POSITIVE, exigée par le
 * cycle : aucune cible interactive introduite ou modifiée par CE lot ne
 * descend sous 48px — vérifié un sélecteur à la fois, sur la RÈGLE
 * RÉELLEMENT déclarée (pas une valeur recopiée à l'oeil). */
(function testAucuneCibleInteractiveNeuveSousQuaranteHuitPixels() {
  const regles = analyserReglesCSS(CSS_SANS_COMMENTAIRES);
  const CIBLES = [".tab-button", ".small-button", ".sheet-toggle"];
  CIBLES.forEach((cible) => {
    const regle = regles.find((r) => r.selecteur.split(",").map((s) => s.trim()).indexOf(cible) !== -1);
    const nomCas = "E9_" + cible.replace(/[^a-zA-Z]+/g, "_");
    check(nomCas + "_regle_trouvee", !!regle, "sélecteur introuvable : " + cible);
    if (!regle) return;
    const m = regle.corps.match(/(?:min-height|height)\s*:\s*(\d+(?:\.\d+)?)px/);
    check(nomCas + "_hauteur_min_48px",
      !!m && parseFloat(m[1]) >= 48,
      (m ? "obtenu " + m[1] + "px" : "aucune hauteur déclarée") + " sur " + cible + " — règle: " + regle.corps.trim());
  });
})();

console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
for (const e of _echecs) console.log("  - " + e);
process.exit(_echecs.length ? 1 : 0);
