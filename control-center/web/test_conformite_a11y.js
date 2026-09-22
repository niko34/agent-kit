"use strict";
/* feature-021, cycle 2, lot 0 — F4a : CONTRAT D'ACCESSIBILITÉ, VOLET STATIQUE.
 *
 *     node control-center/web/test_conformite_a11y.js
 *
 * ⚠️ Sa cible n'est PAS le prototype : c'est **prototype moins le différé de
 * F0, plus les écarts déclarés** —
 *   - 0 `role="tab"` (déjà vrai du prototype, réaffirmé comme critère
 *     d'acceptation direct sur l'implémentation) ;
 *   - barre supérieure amputée (project-switcher/notification-button/
 *     réglages/account-button écartés par F0 — déjà hors de la cible car
 *     leurs `id`/classes sont classés `ecarte`) ;
 *   - colonnes dynamiques (`/api/etat.colonnes`, ADR-0003) — hors du champ de
 *     ce contrat, qui ne porte que id/role/aria-*, pas le contenu texte ;
 *   - le `<dialog>` de la porte d'authentification, ABSENT du prototype,
 *     AJOUTÉ ici en écart déclaré (ECARTS_DECLARES.portesAuthentification) ;
 *   - le sigle `SP` (pas `SR`) pour spec-reader — écart de CONTENU (texte),
 *     hors du périmètre de ce contrat qui ne porte que id/role/aria-*
 *     (déclaré ici, non assertionné : voir note en fin de fichier).
 *
 * id/role/aria-* requis dérivés du prototype, filtrés à `adopte` par F0
 * (`test_conformite_partition_donnees.js`), PAR PARSEUR bornée à la balise
 * portant l'`id` (PIEGES §27 : une assertion par sous-chaîne dans un bloc de
 * texte passe à tort si une prose voisine cite le même mot).
 */

const lib = require("./test_conformite_lib.js");
const { ADOPTE, PARTITION_IDS, lotEstDejaLivre } = require("./test_conformite_partition_donnees.js");

// F4A_IDS_ARIA_MANQUANTS et F4A_ROLE_TAB_RESIDUEL : RETIRÉES du registre au
// lot 3 (clôture réelle, feature-021 cycle 2) — index.html est réécrit en
// structure mono-écran (F7) : les 25 id « adopté » de F0 sont présents et
// conformes, et les 6 `role="tab"` du découpage en onglets ont disparu.
const ATTENDU_ROUGE = {};

// Écart déclaré : le <dialog> de la porte d'authentification n'existe PAS
// dans le prototype — il est ajouté ici comme exigence supplémentaire,
// symétrique de JETONS_AJOUTES/CLASSES_AJOUTEES. Valeurs relevées dans
// l'implémentation ACTUELLE (control-center/web/index.html:245-255), à
// PRÉSERVER par la réécriture du lot 3, pas à réinventer.
const ECARTS_DECLARES = {
  porteAuthentification: {
    id: "porte-jeton",
    role: "dialog",
    ariaRequis: ["aria-modal", "aria-labelledby"],
    enfants: ["porte-titre", "porte-corps", "porte-champ", "porte-aide", "porte-erreur", "porte-bouton"],
    raison: "gate d'écriture existant, absent du prototype (mono-utilisateur, ADR-0020) — U5/bug-017",
  },
};

// -- Exception déclarée : ids POSÉS À L'EXÉCUTION, jamais statiques --
// Le prototype écrit `#claude-live-message` en dur, à l'intérieur d'un de ses
// deux messages d'EXEMPLE. Le cockpit ne fabrique jamais de message : il
// construit cette bulle à chaque rendu autour d'un texte DÉRIVÉ de
// `etat.agents[].actif_sur` (voir app.js, qui cite PIEGES §38 : un id créé
// dynamiquement est invisible à toute lecture du HTML statique).
//
// ⚠️ Ce n'est PAS une dette, donc rien dans ATTENDU_ROUGE — c'est la limite
// structurelle du volet statique. La couverture réelle est F4b/F3b, sur DOM
// exécuté. Les deux clauses miroir plus bas empêchent cette liste de pourrir.
const POSES_A_L_EXECUTION = {
  "claude-live-message": "bulle de statut construite par app.js à chaque rendu, texte dérivé d'etat.agents[].actif_sur ; le prototype l'écrit en dur dans un message d'exemple — couvert au runtime",
};

let _tests = 0;
const _echecs = [];
function check(nom, condition, detail) {
  _tests += 1;
  if (condition) console.log("  ok     " + nom);
  else { _echecs.push(nom); console.log("  ECHEC  " + nom + (detail ? " : " + detail : "")); }
}

const htmlPrototype = lib.lirePrototype();
const htmlApp = lib.lireNonVide(lib.cheminWeb("index.html"), "control-center/web/index.html");
console.log("[atteignabilité] prototype " + htmlPrototype.length + " o, index.html " + htmlApp.length + " o");

// -- Cible dérivée : ids adoptés ET DÉJÀ LIVRÉS (lots 0-5) + leurs
// role/aria-* dans le prototype. Depuis la réouverture de périmètre, `ADOPTE`
// seul désigne les 64 id du cycle ENTIER — filtrer sur le seul verdict
// ferait échouer ce contrat pour des id légitimement pas encore écrits
// (voir la note de `lotEstDejaLivre` dans test_conformite_partition_donnees.js).
const idsAdoptes = Object.entries(PARTITION_IDS)
  .filter(([, [v, , lot]]) => v === ADOPTE && lotEstDejaLivre(lot))
  .map(([id]) => id);
console.log("[dérivé] " + idsAdoptes.length + " id(s) « adopté, déjà livré » requis (F0)");

const cibleParId = {};
for (const id of idsAdoptes) {
  const balise = lib.baliseParId(htmlPrototype, id);
  cibleParId[id] = lib.attributsDeBalise(balise);
}
let totalRolesRequis = 0, totalAriaRequis = 0;
for (const id of idsAdoptes) {
  if (cibleParId[id].role) totalRolesRequis++;
  totalAriaRequis += cibleParId[id].aria.size;
}
console.log("[dérivé] parmi eux, " + totalRolesRequis + " portent un `role`, " +
  totalAriaRequis + " attribut(s) aria-* au total dans le prototype");

// -- A. Présence des ids requis --
// `baliseParId` inspecte la PREMIÈRE balise portant l'id. Un id dupliqué
// rendrait donc toute assertion role/aria ci-dessous aveugle au second
// porteur — un élément non conforme passerait derrière un conforme. On refuse
// la duplication au lieu de choisir silencieusement (même famille de défaut
// que le second bloc `:root` de F1, corrigé en reboucle du lot 0).
for (const [libelle, htmlSource] of [["prototype", htmlPrototype], ["index.html", htmlApp]]) {
  const doublons = lib.idsDupliquesDeHtml(htmlSource);
  check("aucun_id_duplique_dans_" + libelle.replace(/\W/g, "_"),
    doublons.length === 0,
    doublons.map((d) => d.id + " x" + d.occurrences).join(", "));
}

const idsApp = lib.idsDeHtml(htmlApp);
const idsManquants = idsAdoptes
  .filter((id) => !idsApp.has(id))
  .filter((id) => !Object.prototype.hasOwnProperty.call(POSES_A_L_EXECUTION, id));

// -- B. Pour les ids présents, role/aria-* au moins équivalents --
const attributsDivergents = [];
for (const id of idsAdoptes) {
  if (!idsApp.has(id)) continue;
  const requis = cibleParId[id];
  const balise = lib.baliseParId(htmlApp, id);
  const obtenu = lib.attributsDeBalise(balise);
  if (requis.role && requis.role !== obtenu.role) {
    attributsDivergents.push(id + " : role attendu `" + requis.role + "`, obtenu `" + obtenu.role + "`");
  }
  for (const a of requis.aria) {
    if (!obtenu.aria.has(a)) attributsDivergents.push(id + " : `" + a + "` manquant");
  }
}

const cibleOk = idsManquants.length === 0 && attributsDivergents.length === 0;
if (cibleOk) {
  check("F4a_ids_role_aria_adoptes_presents_et_conformes", true);
} else {
  console.log("  ECHEC  F4a_ids_role_aria_adoptes_presents_et_conformes : " +
    idsManquants.length + " id(s) manquant(s), " + attributsDivergents.length + " attribut(s) divergent(s)");
  console.log("           ids manquants (10 premiers) : " + idsManquants.slice(0, 10).join(", "));
  console.log("           attributs (10 premiers)     : " + attributsDivergents.slice(0, 10).join(" | "));
  if (ATTENDU_ROUGE.F4A_IDS_ARIA_MANQUANTS) {
    console.log("  (ATTENDU_ROUGE F4A_IDS_ARIA_MANQUANTS, clôture " + ATTENDU_ROUGE.F4A_IDS_ARIA_MANQUANTS.lotDeCloture + ")");
  } else {
    _tests += 1;
    _echecs.push("F4a_ids_role_aria_adoptes_presents_et_conformes_HORS_REGISTRE");
  }
}

// -- C. Critère d'acceptation direct : 0 role="tab" --
const compteTab = lib.compterAttribut(htmlApp, /\srole="tab"/g);
if (compteTab === 0) {
  check("F4a_zero_role_tab", true);
} else {
  console.log("  ECHEC  F4a_zero_role_tab : obtenu " + compteTab + ", attendu 0");
  if (ATTENDU_ROUGE.F4A_ROLE_TAB_RESIDUEL) {
    console.log("  (ATTENDU_ROUGE F4A_ROLE_TAB_RESIDUEL, clôture " + ATTENDU_ROUGE.F4A_ROLE_TAB_RESIDUEL.lotDeCloture + ")");
  } else {
    _tests += 1;
    _echecs.push("F4a_zero_role_tab_HORS_REGISTRE");
  }
}

// -- D. Écart déclaré : la porte d'authentification (déjà présente,
// vérifiée ici pour qu'aucune réécriture future ne la perde) --
const porte = ECARTS_DECLARES.porteAuthentification;
const baliseporte = lib.baliseParId(htmlApp, porte.id);
const attrsPorte = lib.attributsDeBalise(baliseporte);
check("F4a_ecart_declare_porte_authentification_presente_et_conforme",
  !!baliseporte && attrsPorte.role === porte.role && porte.ariaRequis.every((a) => attrsPorte.aria.has(a)),
  baliseporte ? ("role=" + attrsPorte.role + ", aria=" + [...attrsPorte.aria].join(",")) : "balise absente");
const enfantsManquants = porte.enfants.filter((id) => !idsApp.has(id));
check("F4a_ecart_declare_porte_authentification_enfants_presents", enfantsManquants.length === 0,
  enfantsManquants.join(", "));

// -- Note, non assertionnée : écart de contenu « SP, pas SR » --
console.log("[note, hors périmètre id/role/aria-*] le sigle de spec-reader reste `SP` (pas `SR` " +
  "du prototype) — écart de CONTENU TEXTE, hors du contrat F4a ; à couvrir par une garde de " +
  "contenu si elle existe ailleurs (hors périmètre de ce fichier).");

if (cibleOk && ATTENDU_ROUGE.F4A_IDS_ARIA_MANQUANTS) {
  check("F4A_IDS_ARIA_MANQUANTS_purgee_du_registre_si_verte", false,
    "l'assertion est VERTE mais l'entrée est encore dans ATTENDU_ROUGE — la retirer (clause 2)");
}
if (compteTab === 0 && ATTENDU_ROUGE.F4A_ROLE_TAB_RESIDUEL) {
  check("F4A_ROLE_TAB_RESIDUEL_purgee_du_registre_si_verte", false,
    "l'assertion est VERTE mais l'entrée est encore dans ATTENDU_ROUGE — la retirer (clause 2)");
}
for (const [cle, entree] of Object.entries(ATTENDU_ROUGE)) {
  check("ATTENDU_ROUGE_" + cle + "_porte_un_lot_de_cloture_nomme", !!(entree.lotDeCloture && entree.lotDeCloture.trim()));
}

// Clause miroir de POSES_A_L_EXECUTION : un id devenu statique n'a plus de
// raison d'être exempté, et l'exemption masquerait dès lors toute régression
// sur son role/aria-*.
const exemptionsPerimees = Object.keys(POSES_A_L_EXECUTION).filter((id) => idsApp.has(id));
check("F4a_aucune_exemption_execution_perimee", exemptionsPerimees.length === 0,
  exemptionsPerimees.length
    ? exemptionsPerimees.join(", ") + " — désormais posé(s) statiquement dans index.html : "
      + "retirer l'entrée de POSES_A_L_EXECUTION, le volet statique le couvre"
    : "");

// Et l'inverse : une exemption qui ne désigne aucun id requis est un nom mort.
const exemptionsHorsCible = Object.keys(POSES_A_L_EXECUTION).filter((id) => !idsAdoptes.includes(id));
check("F4a_toute_exemption_execution_designe_un_id_requis", exemptionsHorsCible.length === 0,
  exemptionsHorsCible.join(", "));

function main() {
  console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
  for (const e of _echecs) console.log("  - " + e);
  process.exit(_echecs.length ? 1 : 0);
}
main();
