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

/* Sept blocs atteignables, une assertion épinglée par bloc — pas seulement
 * « sept titres trouvés » (même défaut que l'ancien E5 : une prose voisine
 * qui MENTIONNE un libellé ferait passer l'assertion à tort si elle
 * cherchait une sous-chaîne dans tout le document — PIEGES §27). Chaque
 * libellé est cherché comme contenu d'un `<h1>`/`<h2>` précis, jamais dans
 * un bloc de texte qui l'engloberait.
 * ⚠️ RÉDUIT de neuf à sept blocs (feature-028, lot A1, U1 de feature-021) :
 * « Agents » et « Derniers événements » ont disparu du DOM — voir
 * `test_app_u1_navigateur.py` (A1bis) pour la garde d'ABSENCE, exécutée sur
 * le DOM réel plutôt que sur ce texte statique.
 * ⚠️ RÉDUIT à nouveau de sept à six blocs (feature-028, décision humaine du
 * 2026-09-23, AU-DELÀ de U1) : « Système » a disparu à son tour, retrait
 * sec sans migration — voir `test_app_u1_navigateur.py` (checks
 * `DH20260923_*`) pour la garde d'ABSENCE sur le DOM réel.
 * ⚠️ RÉDUIT une troisième fois de six à cinq blocs (feature-028, décision
 * humaine du 2026-09-23, « fichiers ») : « Fichiers touchés » a disparu à
 * son tour, retrait de capacité assumé (« la consultation des diffs ne va
 * nulle part ») — voir `test_app_u1_navigateur.py` (checks `DH20260923_*`)
 * pour la garde d'ABSENCE sur le DOM réel.
 * ⚠️ RÉDUIT une quatrième fois de cinq à quatre blocs (feature-028, lot C2,
 * une fois B3 vérifié) : « Que souhaitez-vous développer ? » (`demande`) a
 * disparu à son tour — `#add-item-dialog` (le `+`) en est le remplaçant,
 * MÊME machine à états (GATE C1, jamais un second chemin).
 * ⚠️ RÉDUIT une cinquième fois de quatre à trois blocs (feature-028, lot C1,
 * décision humaine 1B) : « Cycles » (l'accordéon `#workflows`) a disparu à
 * son tour — les onglets « Cycle actif »/« Historique » du haut restent le
 * SEUL endroit du DOM pour voir un cycle.
 * ⚠️ RÉDUIT une sixième fois de trois à deux blocs (feature-028, lot
 * pilotage dédié, décision humaine du 2026-09-23) : « Pilotage » (le
 * panneau générique « Piloter par clé ») a disparu à son tour — le
 * lancement et l'interruption PAR CARTE (menu `⋮`) restent le SEUL endroit
 * du DOM pour agir sur un cycle. */
(function testDeuxBlocsAtteignablesEpinglesUnParUn() {
  function echapper(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  const BLOCS = [
    ["h1", "Aucun cycle observé"],
    ["h2", "Spécifications"],
  ];
  BLOCS.forEach(([balise, libelle]) => {
    const re = new RegExp("<" + balise + "[^>]*>[^<]*" + echapper(libelle) + "[^<]*</" + balise + ">");
    check("E5_bloc_" + libelle.replace(/[^a-zA-Z]+/g, "_"), re.test(HTML),
      "« " + libelle + " » introuvable dans un <" + balise + ">");
  });
  // Aucun de ces cinq blocs n'est masqué : le mono-écran n'a plus de
  // pagination — un `hidden` réapparu sur l'un d'eux serait une régression
  // vers l'ancien découpage en onglets.
  check("E5_aucun_hidden_statique_dans_le_corps",
    !/<(section|main)[^>]*\bhidden\b/.test(HTML));
  // INVERSÉ (feature-028, décision humaine du 2026-09-23) : ce bloc
  // affirmait la présence d'un <h2>Système</h2> ; il affirme désormais son
  // ABSENCE complète du HTML statique.
  check("E5_bloc_Systeme_absent",
    !/<h2[^>]*>[^<]*Système[^<]*<\/h2>/.test(HTML));
  // INVERSÉ (feature-028, décision humaine du 2026-09-23, « fichiers ») : ce
  // bloc affirmait la présence d'un <h2>Fichiers touchés</h2> ; il affirme
  // désormais son ABSENCE complète du HTML statique.
  check("E5_bloc_Fichiers_touches_absent",
    !/<h2[^>]*>[^<]*Fichiers touchés[^<]*<\/h2>/.test(HTML));
  // INVERSÉ (feature-028, lot C2) : ce bloc affirmait la présence d'un
  // <h2>Que souhaitez-vous développer&nbsp;?</h2> ; il affirme désormais
  // son ABSENCE complète du HTML statique.
  check("E5_bloc_Que_souhaitez_vous_developper_absent",
    !/<h2[^>]*>[^<]*Que souhaitez-vous d[ée]velopper[^<]*<\/h2>/.test(HTML));
  // INVERSÉ (feature-028, lot C1, décision humaine 1B) : ce bloc affirmait
  // la présence d'un <h2>Cycles</h2> (l'accordéon) ; il affirme désormais
  // son ABSENCE complète du HTML statique.
  check("E5_bloc_Cycles_absent",
    !/<h2[^>]*>[^<]*Cycles[^<]*<\/h2>/.test(HTML));
  // INVERSÉ (feature-028, lot pilotage dédié, décision humaine du
  // 2026-09-23) : ce bloc affirmait la présence d'un <h2>Pilotage</h2> (le
  // panneau générique) ; il affirme désormais son ABSENCE complète du HTML
  // statique.
  check("E5_bloc_Pilotage_absent",
    !/<h2[^>]*>[^<]*Pilotage[^<]*<\/h2>/.test(HTML));
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
  // feature-026 (frontend, B4/note) : `.claude-destinataire-valeur` (texte
  // BRUT du backend, `"session tmux %r" % nom` — identifiant technique) et
  // `.prompt-source` (`"queued"`/`"typed"`, brut) rejoignent la chasse fixe,
  // MÊME NATURE que `#sortie-lancement` : 18 → 20 mono (+2), sans inchangé.
  // feature-028 (lot A1, U1 de feature-021) : `.agents .nom`/`.agents
  // .modele` retirées avec la section « Agents » (−2 mono) ; `.fichier
  // .fsujet` (−1 sans) et `.timeline .quoi` (−1 mono) / `.timeline .heure`
  // (−1 sans) retirées avec la liste des commits et le panneau d'événements
  // permanent : 20 → 17 mono (−3), 17 → 15 sans (−2).
  // feature-028 (décision humaine du 2026-09-23, AU-DELÀ de U1) : `.systeme
  // dd` retirée avec la section « Système » entière (−1 sans) :
  // 15 → 14 sans, mono inchangé.
  // feature-028 (décision humaine du 2026-09-23, « fichiers ») : `.fichier
  // .fcode`/`.fichier .fchemin` retirées avec la section « Fichiers
  // touchés » entière (−2 mono, plus aucun élément ne pose `.fichier`) :
  // 17 → 15 mono, sans-serif inchangé.
  // feature-028 (lot C2, `.demande` retirée) : `.demande input[type="text"]`
  // retirée SANS remplaçant explicite — `#item-title` (le champ qui la
  // remplace) est stylé par `.form-field input` (prototype), qui n'impose
  // AUCUN `font-family` : il hérite du sans-serif de `body`, comme les
  // autres champs M3, non compté par ce grep littéral (−1 sans, mono
  // inchangé : `.demande textarea`/`.demande textarea.brouillon` sont
  // RETARGETÉS vers `#add-item-redaction-corps textarea`, pas retirés).
  // 14 → 13 sans.
  // feature-028 (lot C1, accordéon « Cycles » retiré, décision humaine 1B) :
  // `.agent-sigle`/`.agent-nom`/`.maillon .mnom` retirées (−3 mono) ;
  // `.cycle-designation`/`.cycle-etat`/`.cycle-proprietes dd`/`.maillon
  // .mduree` retirées (−4 sans) : 15 → 12 mono, 13 → 9 sans.
  // feature-028 (lot pilotage dédié, décision humaine du 2026-09-23) :
  // `.pilotage-jeton input`/`#sortie-lancement` retirées avec le panneau
  // « Piloter par clé » (−2 mono) ; `.bloc h2`/`.pilotage-ligne`/
  // `.pilotage-tronque` retirées avec lui (−3 sans, `.bloc` n'a plus aucun
  // porteur — les sept sections qu'il habillait ont TOUTES disparu) :
  // 12 → 10 mono, 9 → 6 sans.
  check("C_compte_mono_final_dix", compteMono === 10, "obtenu " + compteMono);
  check("C_compte_sans_final_six", compteSans === 6, "obtenu " + compteSans);

  const DOIT_RESTER_MONO = [
    ".projet", ".note code",
    ".tiroir-barre",
    "#tiroir-contenu", "#porte-champ", ".selected-mark", "#tiroir-edition-texte",
  ];
  DOIT_RESTER_MONO.forEach((selecteur) => {
    const i = CSS_SANS_COMMENTAIRES.indexOf(selecteur);
    check("C_reste_mono_" + selecteur, i !== -1, "sélecteur introuvable : " + selecteur);
  });

  const DOIT_ETRE_SANS = [
    ".jauge", ".horodatage", ".compteur",
    '.filtres input[type="search"]', ".column-title", ".card-footer",
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
    ".projet", ".note code",
    ".tiroir-barre", "#tiroir-contenu", "#porte-champ",
    // `.agent-sigle`/`.agent-nom`/`.maillon .mnom` RETIRÉES (feature-028,
    // lot C1, accordéon « Cycles » retiré, décision humaine 1B) : plus
    // aucun producteur.
    // `.pilotage-jeton input`/`.pilotage-select select`/`#sortie-lancement`
    // RETIRÉES (feature-028, lot pilotage dédié) : plus aucun producteur.
    // `.demande textarea.brouillon` RETARGETÉ (feature-028, lot C2,
    // `.demande` retirée) : le sélecteur vit désormais sous le seul
    // conteneur qui porte ce `<textarea>`, `#add-item-dialog`.
    "#add-item-redaction-corps textarea.brouillon",
    // feature-021 cycle 2, lot 3 (F7) : sigle du passage sélectionné
    // (bottom sheet, id adopté), même nature que `.agent-sigle`.
    ".selected-mark",
    // feature-025 (lots 9-10) : surface de modification d'une spec,
    // réutilise le tiroir existant — voir le commentaire au-dessus de
    // `C_compte_mono_final_dix_sept`.
    "#tiroir-edition-texte",
    // feature-026 : destinataire et `prompt_source` bruts du backend — voir
    // le commentaire au-dessus de `C_compte_mono_final_dix_sept`.
    ".claude-destinataire-valeur", ".prompt-source",
    // `.carte .cid` (feature-008) RETIRÉ au lot 5 (F10) : le kanban M3 ne
    // porte plus de chasse fixe dédiée à l'identifiant de spec.
    // `.fichier .fcode`/`.fichier .fchemin` (feature-028, décision humaine du
    // 2026-09-23, « fichiers ») RETIRÉS : la section « Fichiers touchés » a
    // disparu entière, plus aucun élément ne pose `.fichier`.
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
  // `.maillon .mduree` RETIRÉE (feature-028, lot C1, accordéon « Cycles »
  // retiré, décision humaine 1B) : plus aucun producteur.
  const CIBLES = [".column-title", ".compteur", ".horodatage"];
  CIBLES.forEach((selecteur) => {
    const i = CSS_SANS_COMMENTAIRES.indexOf(selecteur);
    if (i === -1) { check("C_tabular_nums_" + selecteur, false, "sélecteur introuvable"); return; }
    const finBloc = CSS_SANS_COMMENTAIRES.indexOf("}", i);
    const bloc = CSS_SANS_COMMENTAIRES.slice(i, finBloc);
    check("C_tabular_nums_" + selecteur, bloc.indexOf("tabular-nums") !== -1, "bloc: " + bloc.trim());
  });
})();

// RETARGETÉ (feature-028, lot pilotage dédié) : `.bloc h2` stylait le titre
// des sept sections héritées — TOUTES retirées au fil de ce cycle, la
// dernière étant « Pilotage ». `.bloc`/`.bloc h2` ont été retirées avec
// elle (§33 PIEGES : aucune règle CSS orpheline) ; ce test affirme
// désormais leur ABSENCE complète, plutôt que de vérifier des corrections
// sur un sélecteur qui n'a plus de porteur.
(function testBlocRetireeAvecSesSeptSections() {
  check("C_bloc_absente_de_la_feuille",
    CSS_SANS_COMMENTAIRES.indexOf(".bloc ") === -1 && CSS_SANS_COMMENTAIRES.indexOf(".bloc{") === -1
    && CSS_SANS_COMMENTAIRES.indexOf(".bloc\n") === -1 && CSS_SANS_COMMENTAIRES.indexOf(".bloc,") === -1);
  check("C_bloc_h2_absente_de_la_feuille",
    CSS_SANS_COMMENTAIRES.indexOf(".bloc h2") === -1);
  check("C_class_bloc_absente_du_html_statique",
    HTML.indexOf('class="bloc') === -1 && HTML.indexOf('class="bloc"') === -1);
})();

(function testQuatriemeSurfaceLimiteeAuxInteractions() {
  // feature-021 cycle 2, lot 3 : `var(--surface-2)` a été re-pointé sur
  // `var(--surface-low)` (F1_TRANSITOIRE_SEMANTIQUE_CLAIR), ET
  // `.nav-onglet:hover` — l'un des DEUX usages d'entrée — a disparu AVEC la
  // navigation à onglets qui le portait (F7). Un usage hérité subsistait,
  // `.cycle-bouton:hover` (accordéon des cycles, feature-016) — retiré à son
  // tour avec l'accordéon (feature-028, lot C1, décision humaine 1B) ;
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
  // feature-028 (lot C1, accordéon « Cycles » retiré, décision humaine 1B) :
  // `.cycle-bouton:hover` disparaît avec l'accordéon qu'il survolait — le
  // seul usage HÉRITÉ (pas COPIÉ du prototype) de ce jeton : 10 → 9.
  const compte = (CSS_SANS_COMMENTAIRES.match(/var\(--surface-low\)/g) || []).length;
  check("C_surface_low_neuf_usages", compte === 9, "obtenu " + compte);
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
  // `.maillon` RETIRÉE (feature-028, lot C1, accordéon « Cycles » retiré,
  // décision humaine 1B) : plus aucun producteur, rien à vérifier ici.
})();

/* ⚠️ INVERSÉ une première fois au lot A1 de feature-028 (U1 de feature-021) :
 * la liste des commits (donc `.fsujet`, qui la distinguait de `.fchemin`)
 * était SUPPRIMÉE de `rendreFichiers` — historique VCS rétrospectif, pas un
 * état de cycle — mais `.fichier .fchemin` restait, la liste des fichiers
 * touchés étant conservée.
 * ⚠️ INVERSÉ UNE SECONDE FOIS (feature-028, décision humaine du 2026-09-23,
 * « fichiers ») : la section « Fichiers touchés » elle-même a disparu
 * ENTIÈRE — `.fichier` (donc `.fsujet` ET `.fchemin`) n'existe plus en CSS,
 * `rendreFichiers`/`ouvrirDiff` n'existent plus en JS. Ce test vérifiait la
 * présence de `.fchemin` en chasse fixe ; il vérifie désormais l'ABSENCE
 * complète de `.fichier` (règle CSS ET fonctions de rendu JS), pour qu'une
 * réintroduction silencieuse de la section soit détectée. */
(function testFichierAbsentDuCssEtDuJs() {
  check("C_fichier_nexiste_plus_en_css",
    !/\.fichier(\s|\{|\.|:)/.test(CSS_SANS_COMMENTAIRES));
  const appJs = fs.readFileSync(APP_JS_PATH, "utf8");
  check("C_app_js_nexpose_plus_rendreFichiers",
    !/function rendreFichiers/.test(appJs));
  check("C_app_js_nexpose_plus_ouvrirDiff",
    !/function ouvrirDiff/.test(appJs));
})();

/* ⚠️ INVERSÉ (feature-028, décision humaine du 2026-09-23, AU-DELÀ de U1) :
 * la section « Système » (donc `.systeme`) est SUPPRIMÉE ENTIÈRE — retrait
 * sec, sans migration. Ce fichier vérifiait la présence et la police de
 * `.systeme dd` (via `DOIT_ETRE_SANS`/`CIBLES`, ci-dessus, désormais sans
 * cette entrée) ; il vérifie ici son ABSENCE complète (règle CSS ET
 * fonction de rendu JS), pour qu'une réintroduction silencieuse de la
 * section soit détectée. */
(function testSystemeAbsentDuCssEtDuJs() {
  const appJs = fs.readFileSync(APP_JS_PATH, "utf8");
  check("C_systeme_nexiste_plus_en_css",
    !/\.systeme(\s|\{|\.)/.test(CSS_SANS_COMMENTAIRES));
  check("C_app_js_nexpose_plus_rendreSysteme",
    !/function rendreSysteme/.test(appJs));
})();

  /* `theme.js` a été SUPPRIMÉ au lot 13 de feature-021 : code mort depuis le
   * lot 3 (plus aucun lecteur de `data-section`), chargé en synchrone dans
   * `<head>` pour rien. Les deux cas qui vérifiaient son commentaire partent
   * avec lui — ⚠️ un test qui lit un fichier ABSENT ne rougit pas, il PLANTE,
   * et emporte tous les cas suivants du même fichier (mesuré : 1878 → 1708
   * cas à la suppression, un seul fichier muet). */

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
