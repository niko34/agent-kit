"use strict";
/* feature-021, cycle 2, lot 6 (extension de périmètre) — F0 : LA CARTE DE
 * PÉRIMÈTRE, réouverte.
 *
 *     node control-center/web/test_conformite_perimetre.js
 *
 * Partition EXHAUSTIVE des `id` et des classes du prototype
 * `control-center/maquettes/2026-09-20-maquette-materiel-3.html`. Depuis la
 * réouverture du périmètre (2026-09-22), TOUT élément du prototype est
 * « adopté » (ou « adopté, redéfini » pour `progress-track`) — il ne reste
 * plus de verdict `differe:*` ni `ecarte` à vérifier ici (voir l'en-tête de
 * `test_conformite_partition_donnees.js` pour les quatre rectifications
 * mesurées à cette réouverture).
 *
 * ⚠️ RÈGLE DE CE FICHIER, INCHANGÉE : la partition (PARTITION_IDS,
 * PARTITION_CLASSES) est une TABLE ÉCRITE À LA MAIN — la SEULE chose que ce
 * cycle tolère d'énumérer manuellement pour ce fichier. Ce qui n'est PAS
 * toléré, et que ce fichier interdit MÉCANIQUEMENT, c'est qu'un `id` ou
 * qu'une classe du prototype reste EN DEHORS de cette table : le jeu
 * {ids, classes} est DÉRIVÉ du prototype à chaque exécution
 * (`test_conformite_lib.js`), et comparé à la table dans LES DEUX SENS
 * (clause miroir, PIEGES §21).
 *
 * CLAUSE MIROIR NEUVE DE CE LOT — table ↔ specs absorbées : tout élément
 * dont le lot est `LOT_FEATURE_022` (11), `LOT_FEATURE_023` (12) ou
 * `LOT_FEATURE_025` (9-10) doit être NOMMÉ dans la section « Éléments du
 * prototype qui lui reviennent » de la spec absorbée correspondante — lue
 * et parsée ici depuis le fichier réel (jamais recopiée), dans les DEUX
 * sens : un élément du lot absent de la liste de la spec ÉCHOUE, un nom
 * listé dans la spec mais absent de la table avec ce lot ÉCHOUE aussi. Une
 * entrée orpheline (rangée dans un bucket sans être nommée nulle part) est
 * exactement le défaut mesuré : 83 des 88 éléments différés n'étaient
 * nommés dans AUCUNE spec avant ce lot.
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

// ===================================================================== //
// Assertion d'atteignabilité bruyante (règle non négociable n°1)
// ===================================================================== //
const html = lib.lirePrototype();
console.log("[atteignabilité] prototype lu : " + html.length + " octets (non vide)");

const idsPrototype = lib.idsDeHtml(html);
const classesPrototype = lib.classesDeHtml(html);
console.log("[atteignabilité] " + idsPrototype.size + " id(s) et " + classesPrototype.size + " classe(s) DÉRIVÉS du prototype (pas recopiés)");

// ===================================================================== //
// La table — ÉCRITE À LA MAIN, seule énumération tolérée de ce fichier
// ===================================================================== //

const {
  ADOPTE, ADOPTE_REDEFINI, LOT_FEATURE_022, LOT_FEATURE_023, LOT_FEATURE_025,
  PARTITION_IDS, PARTITION_CLASSES,
} = require("./test_conformite_partition_donnees.js");

// ===================================================================== //
// La clause miroir historique — jamais recopiée, toujours dérivée + comparée
// ===================================================================== //
function verifierPartitionExhaustive(nomEnsemble, ensemblePrototype, table) {
  const clesTable = new Set(Object.keys(table));
  const manquants = [...ensemblePrototype].filter((x) => !clesTable.has(x));
  const perimes = [...clesTable].filter((x) => !ensemblePrototype.has(x));
  check(
    nomEnsemble + "_tout_element_du_prototype_est_classe",
    manquants.length === 0,
    manquants.length + " non classé(s) : " + manquants.slice(0, 10).join(", ") + (manquants.length > 10 ? "…" : "")
  );
  check(
    nomEnsemble + "_aucune_entree_perimee_dans_la_table",
    perimes.length === 0,
    perimes.length + " entrée(s) de la table absente(s) du prototype : " + perimes.slice(0, 10).join(", ")
  );
}

verifierPartitionExhaustive("ids", idsPrototype, PARTITION_IDS);
verifierPartitionExhaustive("classes", classesPrototype, PARTITION_CLASSES);

// Chaque entrée doit porter un verdict VALIDE, une raison non vide, et
// depuis ce lot, un LOT non vide (3ᵉ élément) — sinon la table protège
// moins qu'elle ne le prétend.
const VERDICTS_VALIDES = new Set([ADOPTE, ADOPTE_REDEFINI]);
function verifierFormeTable(nom, table) {
  let toutesValides = true;
  for (const [cle, entree] of Object.entries(table)) {
    const [verdict, raison, lot] = entree;
    const ok = VERDICTS_VALIDES.has(verdict) && !!(raison && raison.trim()) && !!(lot && String(lot).trim());
    if (!ok) {
      toutesValides = false;
      console.log("  ECHEC  " + nom + "_entree_malformee : " + cle);
    }
  }
  check(nom + "_toutes_les_entrees_ont_un_verdict_une_raison_et_un_lot", toutesValides);
}
verifierFormeTable("ids", PARTITION_IDS);
verifierFormeTable("classes", PARTITION_CLASSES);

// Plus aucun `differe:*` ni `ecarte` : la réouverture est TOTALE. Cette
// assertion est celle qui aurait échoué avant ce lot — c'est la preuve que
// la réouverture a bien eu lieu, pas une formalité.
function compterVerdicts(table) {
  const out = {};
  for (const [, [verdict]] of Object.entries(table)) out[verdict] = (out[verdict] || 0) + 1;
  return out;
}
const comptesIds = compterVerdicts(PARTITION_IDS);
const comptesClasses = compterVerdicts(PARTITION_CLASSES);
console.log("[dérivé] ids par verdict     : " + JSON.stringify(comptesIds));
console.log("[dérivé] classes par verdict : " + JSON.stringify(comptesClasses));

check("aucun_verdict_differe_ou_ecarte_ne_subsiste",
  Object.keys(comptesIds).every((v) => v === ADOPTE || v === ADOPTE_REDEFINI) &&
  Object.keys(comptesClasses).every((v) => v === ADOPTE || v === ADOPTE_REDEFINI),
  "verdicts ids: " + Object.keys(comptesIds).join(",") + " ; verdicts classes: " + Object.keys(comptesClasses).join(","));

check("progress_track_est_adopte_redefini_pas_lecran", PARTITION_CLASSES["progress-track"][0] === ADOPTE_REDEFINI);

check("barre_superieure_revient_adoptee_avec_motif_adr0039",
  ["project-switcher", "notification-button", "notification-badge", "account-button", "avatar", "user-name"].every(
    (c) => PARTITION_CLASSES[c][0] === ADOPTE && /ADR-0039/.test(PARTITION_CLASSES[c][1])
  ));

check("icon_button_nest_plus_declaree_morte",
  PARTITION_CLASSES["icon-button"][0] === ADOPTE &&
  /5 instances/.test(PARTITION_CLASSES["icon-button"][1]) &&
  /était fausse/.test(PARTITION_CLASSES["icon-button"][1]));

// ===================================================================== //
// Clause miroir neuve — table (par lot) ↔ specs absorbées (liste écrite)
// ===================================================================== //

const RACINE = path.join(__dirname, "..", "..");

// Une spec absorbée CHANGE DE COLONNE pendant le cycle qui la porte
// (`todo/` → `doing/` → `done/`, par `git mv`, jamais par copie). Chercher
// dans la seule colonne `doing/` faisait échouer cette garde à la CLÔTURE du
// cycle — trouvé en exécutant, au moment du `git mv` vers `done/`. On
// résout donc la spec par son NOM DE FICHIER, dans les trois colonnes, et on
// exige qu'elle soit trouvée dans EXACTEMENT UNE : zéro, c'est une spec
// disparue ; deux, c'est le doublon que `tools/check_specs.sh` interdit, et
// une garde qui prendrait la première trouvée lirait une version périmée
// sans le dire.
const COLONNES_DU_CYCLE = ["todo", "doing", "done"];

function lireSpec(nomFichier) {
  const trouves = COLONNES_DU_CYCLE
    .map((colonne) => path.join(RACINE, "specs", "features", colonne, nomFichier))
    .filter((chemin) => fs.existsSync(chemin));
  if (trouves.length === 0) {
    throw new Error("ATTEIGNABILITE : spec absorbée introuvable dans " +
      COLONNES_DU_CYCLE.map((c) => "specs/features/" + c + "/").join(", ") + " : " + nomFichier);
  }
  if (trouves.length > 1) {
    throw new Error("ATTEIGNABILITE : " + nomFichier + " présente dans " + trouves.length +
      " colonnes à la fois (" + trouves.join(", ") + ") — doublon interdit par check_specs.sh");
  }
  const texte = fs.readFileSync(trouves[0], "utf8");
  if (texte.trim().length === 0) throw new Error("ATTEIGNABILITE : spec vide à " + trouves[0]);
  return texte;
}

// Extrait le sous-texte de la section « Éléments du prototype qui lui
// reviennent », du titre jusqu'au prochain titre `###` (ou fin de fichier).
function sectionElements(md, nomFichier) {
  const titre = "### Éléments du prototype qui lui reviennent";
  const debut = md.indexOf(titre);
  if (debut === -1) {
    throw new Error("ATTEIGNABILITE : section « Éléments du prototype qui lui reviennent » absente de " + nomFichier);
  }
  const suite = md.indexOf("\n### ", debut + titre.length);
  return suite === -1 ? md.slice(debut) : md.slice(debut, suite);
}

// Dans le sous-texte de la section, isole la puce commençant par le motif
// donné (ex. `- **Identifiants`) et rend l'ensemble des jetons entre
// backticks qu'elle porte, jusqu'à la puce suivante (`\n- **`) ou la
// première ligne vide.
function jetonsDePuce(section, motifDebutPuce, nomFichier, etiquette) {
  const m = section.match(motifDebutPuce);
  if (!m) {
    throw new Error("ATTEIGNABILITE : puce « " + etiquette + " » absente de la section, dans " + nomFichier);
  }
  const debut = m.index + m[0].length;
  const finPuceSuivante = section.indexOf("\n- **", debut);
  const finLigneVide = section.indexOf("\n\n", debut);
  let fin = section.length;
  if (finPuceSuivante !== -1) fin = Math.min(fin, finPuceSuivante);
  if (finLigneVide !== -1) fin = Math.min(fin, finLigneVide);
  const segment = section.slice(debut, fin);
  const tokens = [...segment.matchAll(/`([^`]+)`/g)].map((mm) => mm[1]);
  return new Set(tokens);
}

function elementsNommesDansSpec(nomFichier) {
  const md = lireSpec(nomFichier);
  const section = sectionElements(md, nomFichier);
  const ids = jetonsDePuce(section, /-\s+\*\*Identifiants?\s*\(\d+\)\*\*\s*:/, nomFichier, "Identifiants");
  const classes = jetonsDePuce(section, /-\s+\*\*Classes?\s*\(\d+\)\*\*\s*:/, nomFichier, "Classes");
  return { ids, classes };
}

// Le champ `lot` d'une entrée PEUT porter plusieurs lots séparés par une
// virgule (classe utilitaire partagée entre plusieurs specs, ex.
// `icon-button` : "7-8,9-10,11") — appartenance par JETON, jamais par
// égalité stricte de la chaîne entière, sinon une classe partagée ne
// pourrait jamais satisfaire la clause miroir d'AUCUNE des specs qui la
// nomment légitimement.
function lotContientJeton(lotEntree, lotCible) {
  return String(lotEntree).split(",").map((s) => s.trim()).includes(lotCible);
}

function elementsDeLaTablePourLot(table, lot) {
  const out = new Set();
  for (const [cle, [, , lotEntree]] of Object.entries(table)) {
    if (lotContientJeton(lotEntree, lot)) out.add(cle);
  }
  return out;
}

function verifierMiroirSpec(nomBucket, nomFichierSpec, lot) {
  const idsTable = elementsDeLaTablePourLot(PARTITION_IDS, lot);
  const classesTable = elementsDeLaTablePourLot(PARTITION_CLASSES, lot);
  const nommes = elementsNommesDansSpec(nomFichierSpec);

  console.log("[dérivé] " + nomBucket + " (lot " + lot + ") : " + idsTable.size + " id(s) et " +
    classesTable.size + " classe(s) dans la table ; spec en nomme " + nommes.ids.size + " id(s) et " +
    nommes.classes.size + " classe(s)");

  const idsManquantsDeLaSpec = [...idsTable].filter((x) => !nommes.ids.has(x));
  const idsOrphelinsDeLaSpec = [...nommes.ids].filter((x) => !idsTable.has(x));
  check(nomBucket + "_tout_id_du_lot_est_nomme_dans_la_spec", idsManquantsDeLaSpec.length === 0,
    idsManquantsDeLaSpec.length + " id(s) du lot " + lot + " absent(s) de " + nomFichierSpec + " : " + idsManquantsDeLaSpec.join(", "));
  check(nomBucket + "_aucun_id_de_la_spec_nest_orphelin_de_la_table", idsOrphelinsDeLaSpec.length === 0,
    idsOrphelinsDeLaSpec.length + " id(s) nommé(s) par " + nomFichierSpec + " mais absent(s) du lot " + lot + " dans la table : " + idsOrphelinsDeLaSpec.join(", "));

  const classesManquantesDeLaSpec = [...classesTable].filter((x) => !nommes.classes.has(x));
  const classesOrphelinesDeLaSpec = [...nommes.classes].filter((x) => !classesTable.has(x));
  check(nomBucket + "_toute_classe_du_lot_est_nommee_dans_la_spec", classesManquantesDeLaSpec.length === 0,
    classesManquantesDeLaSpec.length + " classe(s) du lot " + lot + " absente(s) de " + nomFichierSpec + " : " + classesManquantesDeLaSpec.join(", "));
  check(nomBucket + "_aucune_classe_de_la_spec_nest_orpheline_de_la_table", classesOrphelinesDeLaSpec.length === 0,
    classesOrphelinesDeLaSpec.length + " classe(s) nommée(s) par " + nomFichierSpec + " mais absente(s) du lot " + lot + " dans la table : " + classesOrphelinesDeLaSpec.join(", "));
}

verifierMiroirSpec("feature_022", "feature-022-conversation-permanente-avec-claude.md", LOT_FEATURE_022);
verifierMiroirSpec("feature_023", "feature-023-tokens-par-passage-d-agent.md", LOT_FEATURE_023);
verifierMiroirSpec("feature_025", "feature-025-actions-du-backlog.md", LOT_FEATURE_025);

// Non-régression du parseur de section/puce : une spec fabriquée en mémoire
// (fichier temporaire) doit rendre exactement les jetons qu'elle porte, ni
// plus ni moins — sans dépendre du contenu actuel des specs réelles.
(function nonRegressionParseur() {
  const dossierTmp = fs.mkdtempSync(path.join(require("os").tmpdir(), "cc-test-f0-miroir-"));
  const cheminSpecTmp = path.join(dossierTmp, "specs", "features", "doing", "feature-999-temoin.md");
  fs.mkdirSync(path.dirname(cheminSpecTmp), { recursive: true });
  const contenu = "# Titre\n\nTexte avant.\n\n### Éléments du prototype qui lui reviennent\n\n" +
    "Dérivés de la table F0 — **3 éléments uniques** :\n\n" +
    "- **Identifiants (2)** : `id-un`, `id-deux`\n" +
    "- **Classes (1)** : `classe-un`\n\n" +
    "⚠️ Une note qui suit, avec un `id-un` répété et un `piege` qui ne doit PAS être compté.\n\n" +
    "### Section suivante\n\nCeci ne doit pas être lu : `jamais-vu`.\n";
  fs.writeFileSync(cheminSpecTmp, contenu, "utf8");

  // Réimplémentation locale bornée à ce répertoire temporaire (les fonctions
  // ci-dessus visent RACINE en dur ; on relit directement pour l'isolation).
  const section = sectionElements(contenu, "témoin");
  const idsTemoin = jetonsDePuce(section, /-\s+\*\*Identifiants?\s*\(\d+\)\*\*\s*:/, "témoin", "Identifiants");
  const classesTemoin = jetonsDePuce(section, /-\s+\*\*Classes?\s*\(\d+\)\*\*\s*:/, "témoin", "Classes");
  check("NONREGRESSION_miroir_identifiants_exacts",
    idsTemoin.size === 2 && idsTemoin.has("id-un") && idsTemoin.has("id-deux"));
  check("NONREGRESSION_miroir_classes_exactes",
    classesTemoin.size === 1 && classesTemoin.has("classe-un"));
  check("NONREGRESSION_miroir_ne_deborde_pas_sur_la_section_suivante",
    !classesTemoin.has("jamais-vu") && !idsTemoin.has("jamais-vu"));

  fs.rmSync(dossierTmp, { recursive: true, force: true });
})();

function main() {
  console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
  for (const e of _echecs) console.log("  - " + e);
  process.exit(_echecs.length ? 1 : 0);
}
main();
