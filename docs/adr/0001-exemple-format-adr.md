# ADR-0001 — Adopter le format ADR et ses règles

<!-- Cet ADR sert de référence de format : il documente la décision d'utiliser
     des ADR, et illustre en même temps la structure attendue. À conserver. -->

## Statut

Accepté

## Date

YYYY-MM-DD <!-- remplacer par la date d'adoption du kit dans le projet -->

## Contexte

Les décisions d'architecture du projet (choix de découpage, contrats d'API, compromis écartés) se prennent au fil des cycles de développement. Sans trace écrite, le « pourquoi » disparaît : six mois plus tard, personne ne sait si une contrainte est volontaire ou accidentelle, et les débats déjà tranchés sont rejoués. Le code montre le *quoi*, jamais le *pourquoi pas autrement*.

## Décision

Nous adoptons les Architecture Decision Records au format Michael Nygard, dans `docs/adr/`, avec les règles suivantes :

- Un ADR par décision, numérotation monotone `NNNN-<slug>.md`.
- Structure fixe : Statut / Date / Contexte / Décision / Alternatives considérées / Conséquences.
- Immuable une fois accepté : toute remise en cause produit un nouvel ADR qui supersède l'ancien (statut `Superseded by ADR-XXXX`).
- Déclenchement selon les 4 critères du `docs/adr/README.md` (contrainte structurante, décision invisible dans le code, alternatives crédibles, verrouillage long terme).
- Rédaction par `doc-writer`, sur signalement de `architect` pendant le cycle.

## Alternatives considérées

- **Pas de trace formelle (commentaires + messages de commit)** : écarté — l'information est dispersée, non indexée, et les refus/compromis n'apparaissent jamais dans un diff.
- **Wiki externe** : écarté — hors du dépôt, se désynchronise du code, pas de revue dans le même flux.
- **Un gros document ARCHITECTURE.md historisé** : écarté — mélange l'état courant (doc vivante) et l'historique des décisions (immuable) ; les modifications successives effacent le contexte d'origine.

## Conséquences

### Positives

- Le « pourquoi » de chaque décision structurante survit aux changements d'intervenants (humains ou agents).
- Les débats tranchés ne sont pas rejoués : l'ADR se relit en une minute.
- L'index chronologique raconte l'évolution de l'architecture.

### Négatives

- Un coût de rédaction à chaque décision structurante (accepté : format court, ≤ 1 page).
- Risque de sur-production d'ADR pour des micro-choix — contenu par les 4 critères de déclenchement.
