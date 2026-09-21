"use strict";
/* feature-021, cycle 2, lot 0 — F0 : LA CARTE DE PÉRIMÈTRE.
 *
 *     node control-center/web/test_conformite_perimetre.js
 *
 * Partition EXHAUSTIVE des `id` et des classes du prototype
 * `control-center/maquettes/2026-09-20-maquette-materiel-3.html` en
 * « adopté » (ce cycle) / « différé » (feature-022, feature-023 ou
 * feature-025) / « écarté » (aucune spec ne le reprend). Sans cette carte,
 * F3 et F4 n'ont pas de cible définissable (spec feature-021, check-list F0).
 *
 * ⚠️ RÈGLE DE CE FICHIER : la partition ci-dessous (PARTITION_IDS,
 * PARTITION_CLASSES) est une TABLE ÉCRITE À LA MAIN — c'est la SEULE chose
 * que ce cycle tolère d'énumérer manuellement pour ce fichier (au même titre
 * que la table `rôle(jeton)` de F5a, qu'aucun artefact ne porte). Ce qui
 * n'est PAS toléré, et que ce fichier interdit MÉCANIQUEMENT, c'est qu'un
 * `id` ou qu'une classe du prototype reste EN DEHORS de cette table : le
 * jeu {ids, classes} est DÉRIVÉ du prototype à chaque exécution
 * (`test_conformite_lib.js`), et comparé à la table dans LES DEUX SENS —
 * tout id/classe présent dans le prototype mais absent de la table ÉCHOUE,
 * et tout id/classe présent dans la table mais absent du prototype ÉCHOUE
 * aussi (clause miroir, PIEGES §21 : une énumération à la main est une
 * mesure périmée d'avance si rien ne la recale).
 *
 * ⚠️ LIMITE ASSUMÉE, DOCUMENTÉE ICI PLUTÔT QUE DÉCOUVERTE EN REVUE : la
 * classe `icon-button` est portée par CINQ éléments du prototype, dont
 * AUCUN n'est adopté par ce cycle — notifications (écarté, ADR-0020),
 * réglages (écarté, ADR-0020, SEUL discriminant : son `aria-label="Ouvrir
 * les réglages"`, il ne porte AUCUNE autre classe ni id), options de
 * conversation (différé, feature-022, seul discriminant : son
 * `aria-label="Options de la conversation"`), et les deux boutons de
 * fermeture des boîtes de dialogue (différé, feature-025, discriminés par
 * leur classe compagne `feature-close`). La classe est donc classée
 * `differe:feature-025` par convention (bucket dominant), avec cette note :
 * comme AUCUNE de ses cinq instances n'est adoptée, le choix du bucket
 * n'influe sur aucune garde F1-F5 (qui ne s'intéressent qu'au sous-ensemble
 * « adopté »). Les deux instances sans classe ni id distinctif (réglages,
 * options de conversation) sont nommées ici pour qu'aucune lecture future
 * ne les perde — un id/une classe reste la seule granularité mécanique de
 * cette carte ; un discriminant par `aria-label` n'est PAS automatisé ici.
 */

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
  ADOPTE, F022, F023, F025, ECARTE, PARTITION_IDS, PARTITION_CLASSES,
} = require("./test_conformite_partition_donnees.js");

// ===================================================================== //
// La clause miroir — jamais recopiée, toujours dérivée + comparée
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

// Chaque entrée doit porter un verdict VALIDE et une raison non vide —
// sinon la table protège moins qu'elle ne le prétend.
const VERDICTS_VALIDES = new Set([ADOPTE, F022, F023, F025, ECARTE]);
function verifierFormeTable(nom, table) {
  let toutesValides = true;
  for (const [cle, [verdict, raison]] of Object.entries(table)) {
    if (!VERDICTS_VALIDES.has(verdict) || !raison || !raison.trim()) {
      toutesValides = false;
      console.log("  ECHEC  " + nom + "_entree_malformee : " + cle);
    }
  }
  check(nom + "_toutes_les_entrees_ont_un_verdict_valide_et_une_raison", toutesValides);
}
verifierFormeTable("ids", PARTITION_IDS);
verifierFormeTable("classes", PARTITION_CLASSES);

// ===================================================================== //
// Comptes DÉRIVÉS (sortie de la garde, jamais une entrée) — repris dans le
// journal de bord, jamais écrits en dur ailleurs.
// ===================================================================== //
function compter(table) {
  const out = { [ADOPTE]: 0, [F022]: 0, [F023]: 0, [F025]: 0, [ECARTE]: 0 };
  for (const [, [verdict]] of Object.entries(table)) out[verdict]++;
  return out;
}
console.log("[dérivé] ids par verdict     : " + JSON.stringify(compter(PARTITION_IDS)));
console.log("[dérivé] classes par verdict : " + JSON.stringify(compter(PARTITION_CLASSES)));

// Repères mesurés explicitement exigés par la tâche — assertions ciblées,
// en plus de la clause miroir globale.
check("dialogues_les_3_vont_a_feature_025",
  // `delete-dialog` n'a qu'un `id`, pas de classe compagne dans le prototype
  // — vérifié : `grep -n '<dialog id="delete-dialog"'` ne porte aucun `class=`.
  ["feature-dialog", "add-item-dialog"].every((c) => PARTITION_CLASSES[c][0] === F025) &&
  PARTITION_IDS["delete-dialog"][0] === F025);
check("context_menu_va_a_feature_025", PARTITION_IDS["context-menu"][0] === F025);
check("composer_prompt_claude_vont_a_feature_022",
  PARTITION_IDS["composer"][0] === F022 && PARTITION_IDS["prompt"][0] === F022 &&
  PARTITION_CLASSES["claude-panel"][0] === F022);
check("summary_tokens_et_token_value_vont_a_feature_023",
  PARTITION_IDS["summary-tokens"][0] === F023 && PARTITION_CLASSES["token-value"][0] === F023);
check("progress_track_est_ecarte", PARTITION_CLASSES["progress-track"][0] === ECARTE);
check("barre_amputee_project_switcher_notification_account_ecartes",
  ["project-switcher", "notification-button", "account-button"].every((c) => PARTITION_CLASSES[c][0] === ECARTE));
check("cycle_title_ecarte_par_adr_0023", PARTITION_IDS["cycle-title"][0] === ECARTE);

function main() {
  console.log("\n" + _tests + " cas, " + _echecs.length + " echec(s)");
  for (const e of _echecs) console.log("  - " + e);
  process.exit(_echecs.length ? 1 : 0);
}
main();
