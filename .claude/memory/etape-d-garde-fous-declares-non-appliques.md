---
name: etape-d-garde-fous-declares-non-appliques
description: "La prochaine étape du centre de contrôle est la première qui écrit — ses trois garde-fous n'existent que dans un fichier de configuration"
metadata:
  type: project
---

Le centre de contrôle en est à l'**étape C** : lecture seule, terminée.

**L'étape D est la première qui écrit** — lancer un workflow depuis le
navigateur. Ses trois garde-fous sont **déclarés dans `control-center.toml` et
appliqués par personne** :

- le **jeton** partagé, à comparer par `hmac.compare_digest`, dans un fichier
  hors dépôt ;
- l'**écrivain unique** — deux sessions qui écrivent dans le même arbre
  s'entrelacent ;
- le **plafond de dépense** (`--max-budget-usd`), pour qu'un clic ne déclenche
  jamais une consommation non bornée.

Ils doivent devenir du code **avant la première ligne de `do_POST`**.

⚠️ Ce qui monte la garde là-dessus : un test **par introspection de la classe**
vérifie que `Handler` n'a ni `do_POST`, ni `do_PUT`, ni `do_DELETE`. Son message
d'échec rappelle la règle. Voir `docs/adr/0004`.

**L'étape D doit se faire dans les règles**, contrairement aux étapes A à C qui
ont été menées sans spec ni orchestrateur : une spec d'abord, puis
l'`orchestrator`, puis `security-reviewer` **en P1 sur le design avant le code**.
L'agent a reçu le double passage P1/P2 précisément pour cela, et
l'authentification est son périmètre obligatoire.

**Spec écrite le 2026-09-12** :
`specs/features/todo/feature-007-pilotage-depuis-le-tableau-de-bord.md`. Elle
impose l'ordre (gardes testées isolément AVANT la première ligne de `do_POST`),
coche `security-reviewer` en GATE P1/P2, et prévoit un ADR sur ce qui remplace
la garantie structurelle d'ADR-0004 une fois le test d'introspection tombé.
