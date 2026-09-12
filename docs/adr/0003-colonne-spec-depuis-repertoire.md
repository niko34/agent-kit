# ADR-0003 — La colonne d'une spec vient de son répertoire, jamais de son champ « Statut »

## Statut

Accepté

## Date

2026-09-12

## Contexte

Le centre de contrôle affiche les specs en colonnes (todo / doing / done, ou
l'équivalent déclaré par le projet). Deux sources semblaient candidates pour
déterminer la colonne d'une spec : le répertoire qui la contient, ou un champ
« Statut » écrit dans son texte.

Mesuré sur le projet d'origine (`esp32-pool-controller`) : le champ « Statut »
existait dans 165 specs sur 167, mais en **texte libre** — plus de vingt formes
distinctes recensées, parfois une phrase étalée sur plusieurs lignes — et il
**contredisait le répertoire réel 22 fois sur 165**. Le répertoire, lui, est la
donnée que la CI vérifie déjà mécaniquement (unicité d'une spec entre
`todo/`/`doing/`/`done/`).

## Décision

La colonne d'affichage d'une spec est déterminée **exclusivement par le
répertoire** qui la contient (`control-center/backend/specs.py`,
`lister_specs`). Le champ « Statut » est lu et affiché **tel quel**, sans
jamais être réécrit ni normalisé, à titre d'information complémentaire.

Un classement grossier du champ « Statut » en une classe connue est néanmoins
tenté (`classifier_statut`), à seule fin de détecter une divergence. Corollaire
retenu : **une divergence n'est affirmée que si la classe est reconnue** dans
un vocabulaire fermé ; si le texte ne correspond à aucun mot connu, la classe
est `INDETERMINE` et aucune divergence n'est signalée — « je ne sais pas lire
ce statut » n'est jamais confondu avec « ils se contredisent ».

## Alternatives considérées

- **Faire du champ « Statut » la source de vérité de la colonne** : écarté —
  vingt formes textuelles distinctes sur 165 fichiers rendent tout parseur
  fragile, et 22 divergences mesurées montrent que ce champ dérive du
  répertoire réel sans que personne ne le corrige.
- **Réécrire/normaliser le champ « Statut » pour le faire correspondre au
  répertoire** : écarté — l'outil n'a pas vocation à modifier les specs ; il
  observe, il n'édite pas.

## Conséquences

### Positives

- La colonne affichée correspond toujours à l'état réel de la CI
  (unicité vérifiée mécaniquement), jamais à un texte pouvant dater de
  plusieurs cycles.
- Le champ « Statut » reste consultable sans être une source d'erreur pour le
  classement.

### Négatives

- Un projet dont les specs ne bougent jamais de répertoire (deux dossiers
  fusionnés, convention différente) verra le champ « Statut » ignoré pour le
  classement, même s'il est à jour et cohérent — la règle est la même pour
  tous, sans heuristique de confiance par projet.
- Le vocabulaire de classification (`classifier_statut`) doit être tenu par
  projet ; un vocabulaire trop pauvre fait basculer beaucoup de specs en
  `INDETERMINE`, ce qui masque de vraies divergences.
