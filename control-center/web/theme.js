"use strict";
/* Amorçage du thème (feature-015) — chargé SYNCHRONE dans <head>, après le
 * <link rel="stylesheet">, et jamais en ligne : la CSP servie interdit
 * `unsafe-inline` (server.py, `default-src 'self'`). Ce fichier doit donc
 * être un fichier STATIQUE SERVI, pas un `<script>` embarqué dans le HTML.
 *
 * Rôle unique : poser `data-theme` sur `<html>` AVANT le premier rendu, pour
 * qu'aucune image ne montre le mauvais thème avant le bon
 * (docs/DESIGN-SYSTEM.md §7). Rien d'autre — la commande à trois positions,
 * la persistance à l'écriture et le suivi de `matchMedia` vivent dans
 * app.js, qui s'exécute après que le DOM de la barre existe.
 *
 * Lecture protégée en ENTRÉE ET EN SORTIE : `localStorage` peut échouer
 * (fenêtre privée, données bloquées, quota) — un seul bloc try/catch couvre
 * la lecture ET le nettoyage de la clé, et n'atteint JAMAIS l'appelant :
 * échec => rien de posé => la page reste sur « système ».
 *
 * Piège mesuré à la conception : ce script tourne à CHAQUE chargement et
 * ÉCRASE un `data-theme` posé à la main sur `<html>` avant lui. Un test qui
 * veut éprouver la règle CSS seule doit neutraliser ce script — sinon il
 * mesure autre chose et passe pour vert.
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
})();
