<!--
Template de SUIVI D'ITÉRATIONS — à AJOUTER en fin de spec (jamais en remplacement)
pendant le cycle doing, puis conservé dans done/. Ne copier que les sections utiles.
Règle du kit : honnêteté documentaire — on consigne ce qui s'est vraiment passé,
y compris les hypothèses invalidées et les retours en arrière.
-->

---
# Notes d'implémentation

## Plan (architect)
<!-- Le plan court retenu (≤10 lignes), avec les trade-offs tranchés et l'éventuel ADR décidé. -->
- [remplir]
- ADR : [aucun | ADR-NNNN à créer — sujet]

## Validation security-auditor (si applicable)
<!-- P1 = revue du design AVANT codage ; P2 = revue du diff réel AVANT commit. -->
- **P1 (design)** — Verdict : GO / GO SOUS CONDITIONS / NO GO
  - Conditions ou réserves : [remplir ou « aucune »]
- **P2 (diff)** — Verdict : GO / GO SOUS CONDITIONS / NO GO
  - Points vérifiés : [auth, permissions, injections, données personnelles, secrets, migration]

## Implémentation
<!-- Fichiers créés/modifiés + les choix non évidents faits en cours de route. -->
- **Fichiers créés** : [liste]
- **Fichiers modifiés** : [liste, avec un mot sur le pourquoi]
- **Choix d'implémentation** : [décisions prises pendant le codage, écarts par rapport au plan]

## Tests (test-engineer)
<!-- Résultats CHIFFRÉS, pas « les tests passent ». -->
- Suite complète : [N/N tests verts] — [durée]
- Tests ajoutés : [N — quels scénarios]
- Lint : [propre / N warnings préexistants, 0 nouveau]
- Couverture (si mesurée) : [X %]

## Revue (code-reviewer)
- **Verdict** : Approved / Request changes
- **Points relevés** : [liste, avec pour chacun : corrigé / accepté avec justification]

## Doc (doc-writer)
<!-- Fichiers de documentation mis à jour, un par ligne. -->
- `docs/API.md` — [ou retirer]
- `docs/subsystems/<module>.md` — [ou retirer]
- `docs/features/page-<nom>.md` — [ou retirer]
- `CHANGELOG.md` — [entrée sous version X.Y.Z]
- `docs/adr/NNNN-<slug>.md` — [ou retirer]

## Addendum — itération du [YYYY-MM-DD] (si cycle à rebondissements)
<!--
Une section datée PAR itération supplémentaire quand le cycle ne se déroule pas
en ligne droite : hypothèse invalidée, correctif qui n'a pas suffi, régression
introduite puis corrigée, verdict NO GO et reboucle. Écrire ce qui s'est vraiment
passé — la spec done/ doit raconter l'histoire réelle, pas la version idéale.
-->
- **Déclencheur** : [ce qui a forcé cette itération]
- **Hypothèse précédente invalidée** : [remplir ou « aucune »]
- **Ce qui a été fait** : [remplir]
- **Résultat** : [remplir, chiffré si possible]

## Statut final
<!-- Ajouté au moment de la promotion doing → done. -->
✅ Done — [YYYY-MM-DD] — commit [sha]
