---
name: ce-qui-attend-un-commit
description: "Rétro-documentation et file de travail : commitées puis poussées le 2026-09-12, sur demande explicite"
metadata:
  type: project
---

Au 2026-09-12, ce travail est **commité et poussé sur `main`**
(`874fa39..fa2028c`), en deux commits :

- `b5b2ecd` — 9 ADR, 6 specs rétroactives, corrections factuelles ;
- `fa2028c` — les 7 specs de la file.

Les trois contrôles d'hygiène passent sur l'état commité (13 specs, 10 liens,
profils Copilot synchronisés).

**Rétro-documentation** (première passe) : 9 ADR (`docs/adr/0002` à `0010`) et
6 specs rétroactives dans `specs/features/done/`.

**File de travail** (seconde passe) : 7 specs dans `specs/features/todo/` —
`feature-006` (tests d'`update_kit.sh`), `feature-007` (étape D, pilotage),
`feature-008` (étape E), `feature-009` (étape F), `feature-010` (étape G),
`bug-001` (aperçu d'`update_kit.sh`), `bug-002` (session vivante affichée
comme close).

**Trois corrections factuelles** appliquées aux fichiers modifiés :
`tools/sync-control-center.sh` n'a jamais existé — c'est `update_kit.sh` qui
fait tout (d'où ADR-0010) ; « limitation runtime » retiré de `GUIDE.md` et de
`control-center/README.md` (ADR-0002 : la cause est l'absence de l'outil
`Task`, un choix de configuration) ; renvoi erroné corrigé dans feature-003.

Hygiène verte après coup : `check_specs.sh` (13 specs), `check_doc_links.sh`
(10 liens).

Le commit et le push ont été demandés séparément, à deux tours différents —
conforme à [[push-exige-un-feu-vert-separe]].

⚠️ Les sept notes de cette mémoire ne sont **pas** recopiées dans
`.claude/memory/` du dépôt, alors que `CLAUDE.md` l'exige. Elles contiennent
des IP internes et des noms de services : à arbitrer avec l'utilisateur avant
de les verser dans un dépôt versionné. Voir [[ou-vivent-les-deux-depots]].
