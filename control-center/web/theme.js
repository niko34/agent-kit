"use strict";
/* Amorçage du thème ET de la section (feature-015, feature-019) — chargé
 * SYNCHRONE dans <head>, après le <link rel="stylesheet">, et jamais en
 * ligne : la CSP servie interdit `unsafe-inline` pour les SCRIPTS
 * (server.py, `default-src 'self'`) — elle autorise en revanche le style
 * inline (`style-src 'self' 'unsafe-inline'`), ce qui ne concerne pas ce
 * fichier. Ce fichier doit donc rester un fichier STATIQUE SERVI, pas un
 * `<script>` embarqué dans le HTML.
 *
 * Rôle : poser `data-theme` sur `<html>` AVANT le premier rendu, pour
 * qu'aucune image ne montre le mauvais thème avant le bon
 * (docs/DESIGN-SYSTEM.md §7). Pose aussi `data-section`, mais dans un but
 * plus modeste : app.css n'a PLUS aucune règle qui affiche une section
 * d'après cet attribut (retiré en revue, feature-019 — il entrait en
 * concurrence de spécificité avec `.section[hidden]{display:none}` et
 * pouvait rendre une section visible tout en portant `hidden`, violation de
 * la condition de sécurité « hidden, seul mécanisme »). `data-section` ici
 * ne fait donc plus que TRANSMETTRE la préférence retrouvée à `app.js`, qui
 * la lit à son premier appel (`sectionActuelle()`) pour poser `hidden`
 * lui-même — la seule chose qui compte pour l'affichage. Un flash bref de
 * la section par défaut, avant l'exécution d'`app.js`, est downgradé en
 * comportement accepté plutôt qu'empêché par la cascade : `app.js` termine
 * le document et s'exécute de façon synchrone, sans retour à la boucle
 * d'événements entre le parsing et la synchronisation.
 *
 * Rien d'autre ici — la commande à trois positions, la navigation par
 * onglets, la persistance à l'écriture et le suivi de `matchMedia` vivent
 * dans app.js, qui s'exécute après que le DOM de la page existe.
 *
 * Lecture protégée en ENTRÉE ET EN SORTIE : `localStorage` peut échouer
 * (fenêtre privée, données bloquées, quota) — un seul bloc try/catch couvre
 * la lecture ET le nettoyage de la clé, et n'atteint JAMAIS l'appelant :
 * échec => rien de posé => la page reste sur le défaut (thème « système »,
 * section « agents », la seule dépourvue de `hidden` dans le HTML servi).
 *
 * Piège mesuré à la conception : ce script tourne à CHAQUE chargement et
 * ÉCRASE un `data-theme`/`data-section` posé à la main sur `<html>` avant
 * lui. Un test qui veut éprouver la règle CSS seule doit neutraliser ce
 * script — sinon il mesure autre chose et passe pour vert.
 */
(function () {
  var CLE_THEME = "theme";
  try {
    var valeur = window.localStorage.getItem(CLE_THEME);
    if (valeur === "clair" || valeur === "sombre") {
      document.documentElement.setAttribute("data-theme", valeur);
    } else if (valeur !== null) {
      // Valeur inconnue sous la clé : traitée comme « système », et la clé
      // est nettoyée plutôt que laissée à pourrir.
      window.localStorage.removeItem(CLE_THEME);
    }
    // valeur === null : « système », rien à poser sur <html>.
  } catch (erreur) {
    // localStorage indisponible : la page s'affiche correctement en
    // « système », sans exception remontée.
  }

  var CLE_SECTION = "section";
  var SECTIONS_CONNUES = ["agents", "systeme", "developper", "cycles", "fichiers", "evenements"];
  try {
    var section = window.localStorage.getItem(CLE_SECTION);
    if (section !== null && SECTIONS_CONNUES.indexOf(section) !== -1) {
      document.documentElement.setAttribute("data-section", section);
    } else if (section !== null) {
      // Valeur inconnue sous la clé : nettoyée plutôt que laissée à pourrir
      // — la page reste sur la section par défaut (« agents »).
      window.localStorage.removeItem(CLE_SECTION);
    }
    // section === null : défaut « agents », déjà la seule section sans
    // `hidden` dans le HTML servi — rien à poser sur <html>.
  } catch (erreur) {
    // localStorage indisponible : la page s'affiche correctement sur la
    // section par défaut, sans exception remontée.
  }
})();
