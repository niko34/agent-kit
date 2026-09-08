---
name: db-migrations
description: Check-list de sécurité pour toute migration de base de données (schéma ou données). À charger systématiquement par backend-developer avant d'écrire une migration, et par security-auditor quand une spec en contient une. Les migrations destructives déclenchent en plus le gate security-auditor (cf. CLAUDE.md, Règles absolues).
---

# Check-list migrations BDD

## Pourquoi cette skill existe

La migration est l'opération récurrente la plus risquée d'une application de
gestion : une erreur peut détruire des données (irréversible), verrouiller une
table en production (indisponibilité), ou casser la compatibilité avec le code
déployé. Cette skill liste les invariants à vérifier pour CHAQUE migration —
l'équivalent, pour la base de données, d'une check-list avant une opération
irréversible.

## Invariants

### M1 — Toujours réversible
- Chaque migration montante a sa migration **descendante écrite ET testée**
  (up puis down puis up sur une base de développement remplie de données)
- Si la descente est impossible par nature (perte d'information), la migration
  est **destructive** → M6

### M2 — Sauvegarde vérifiée avant toute migration en production
- Sauvegarde récente ET restaurable (une sauvegarde jamais restaurée n'est pas
  une sauvegarde) ; noter l'identifiant de la sauvegarde dans la spec

### M3 — Compatibilité N/N-1
- Pendant un déploiement, l'ancien code et le nouveau coexistent : le schéma
  migré doit fonctionner avec LES DEUX versions du code
- Conséquence : renommer/supprimer une colonne se fait en DEUX livraisons
  (1 : ajouter la nouvelle + double écriture ; 2 : supprimer l'ancienne une
  fois l'ancien code retiré)

### M4 — Backfill en deux temps
- Remplir une nouvelle colonne sur une table volumineuse : JAMAIS dans la
  migration de schéma (transaction géante, verrous) — schéma d'abord,
  puis backfill par lots (batch borné, reprise possible), puis contrainte
  NOT NULL en dernier

### M5 — Verrous et volumétrie
- Avant tout DDL sur une table de production : estimer la volumétrie et la
  durée du verrou ; privilégier les variantes non bloquantes du moteur
  (ex. index créés en concurrent) ; jamais de DDL bloquant aux heures pleines

### M6 — Migration destructive = procédure renforcée (Règle absolue)
- DROP, suppression de colonnes, purge de données : validation
  `security-auditor` obligatoire + plan de retour arrière ÉCRIT dans la spec
  (sauvegarde identifiée, procédure de restauration, durée estimée)
- La suppression réelle attend UNE version : d'abord déprécier/renommer
  (ex. `_deprecated`), supprimer à la livraison suivante

### M7 — Données personnelles
- Une migration qui copie/transforme des données personnelles hérite des
  règles RGPD (finalité, minimisation) — pas de copie « au cas où »

### M8 — Idempotence et ordre
- Une migration rejouée par erreur ne doit pas corrompre (garde IF EXISTS /
  IF NOT EXISTS quand le moteur le permet) ; jamais de dépendance à une
  donnée insérée à la main hors migration

## Check-list avant d'écrire (backend-developer)

- [ ] La descente est écrite et testée (M1) ou la spec déclare la migration destructive (M6)
- [ ] Compatible avec le code N-1 encore déployé (M3)
- [ ] Backfill séparé du DDL si table volumineuse (M4)
- [ ] Verrous estimés, variante non bloquante choisie si disponible (M5)
- [ ] Idempotente ou protégée contre le rejeu (M8)

## Check-list avant d'appliquer en production (agent principal / humain)

- [ ] Sauvegarde récente et restaurable, identifiant noté dans la spec (M2)
- [ ] up → down → up validé sur une base réaliste (M1)
- [ ] Si destructive : GO security-auditor + plan de retour arrière écrit (M6)
- [ ] Fenêtre d'application choisie (M5)

## Exemples de violations à bloquer

- `ALTER TABLE users DROP COLUMN legacy_email;` livré dans la même version que
  le code qui cesse de l'utiliser → viole M3 et M6 (deux livraisons + gate)
- `UPDATE orders SET status_v2 = …` sur 10 M de lignes dans la migration de
  schéma → viole M4 (backfill par lots séparé)
- Migration descendante « vide pour l'instant » → viole M1 (elle ment : elle
  passera les outils mais ne restaurera rien)
