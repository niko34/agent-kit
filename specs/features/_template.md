<!--
Template de spec FEATURE.
Copier ce fichier dans specs/features/todo/ sous le nom :
    feature-<NNN>-<slug-court>.md
Remplir les sections, supprimer ce bloc commentaire et les lignes « [remplir] ».
Les sections marquées (optionnelle) peuvent être supprimées si non pertinentes.
-->

## Métadonnées
- **ID** : feature-NNN
- **Slug** : [remplir : quelques-mots-separes-par-tirets]
- **Type** : feature
- **Statut** : todo
- **Priorité** : basse | normale | haute | critique
- **Version cible** : [remplir : X.Y.Z] ou `N/A` si référence
- **Dernière mise à jour** : [remplir : YYYY-MM-DD]
- **Spec(s) liée(s)** : [remplir ou « aucune »]

## Grandeurs mesurées
<!--
OBLIGATOIRE dès que la spec cite un nombre : « les six rôles », « les trois
routes », « les deux formats ». Chaque quantité affirmée plus bas se mesure ICI
avant d'être promise, avec la commande qui l'a produite.

Un nombre repris d'un exemple, d'une maquette ou d'une autre spec n'est PAS une
mesure — et l'ensemble compté est rarement fermé : compte AUSSI ce qui apparaît
dans les données sans être déclaré dans le dépôt.

Mesuré sur le projet d'origine : une spec promettait « six identités d'agent ».
Il y en avait onze déclarées et douze observées. Quatre allers-retours.
-->
- `<quantité affirmée>` = **<valeur>** — mesurée par `<commande>` le `<date>`
- [remplir, ou « aucune quantité affirmée »]

## Domaines touchés
<!-- Cocher tout ce que la spec modifie ou consomme — guide l'orchestrator -->
- [ ] API REST (endpoints, contrats, codes d'erreur)
- [ ] Frontend (écrans, composants, appels API)
- [ ] BDD / migrations
- [ ] Auth / permissions → **passage obligatoire par `security-reviewer` (rôle GATE)**
- [ ] Données personnelles (collecte, traitement, effacement) → **passage obligatoire par `security-reviewer` (rôle GATE)**
- [ ] Intégrations externes (API tierces, webhooks, e-mail…)
- [ ] Tâches de fond (jobs, cron, files d'attente)

## Agents requis
<!-- Décoché = non applicable, coché = à invoquer. L'orchestrator applique cette liste.
     (orchestrator et debugger n'y figurent pas : le premier est systématique pour toute
     feature, le second est réactif — il s'invoque quand un bug survient, pas sur plan.) -->
- [x] spec-reader
- [x] architect
- [ ] security-reviewer, rôle GATE — **obligatoire si** auth / permissions / données personnelles / paiements / migration destructive touchés
- [ ] ux-ui-designer — **obligatoire si** nouvelle surface UI / refonte visuelle / arbitrage entre plusieurs mises en page
- [ ] backend-developer
- [ ] frontend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Description
<!-- 1-3 phrases : quoi, pour qui, résultat attendu. Pas de détail technique ici. -->
[remplir]

## Contexte
<!-- Pourquoi cette feature. Problème actuel, besoin utilisateur, références. -->
[remplir]

## Comportement attendu
<!--
Décrire l'expérience / les règles métier, pas l'implémentation.
Structurer par écran, sous-fonction ou flux utilisateur si utile.
Préciser les cas nominaux ET les cas limites.
-->
[remplir]

### Cas limites
- [remplir : session expirée, données absentes, requête concurrente, permission insuffisante, API tierce en panne, etc.]

## Comportement actuel
<!-- État actuel du backend / UI avant modification. « Rien n'existe » est une réponse valide. -->
[remplir]

## Contraintes techniques
- API REST versionnée, format d'erreur uniforme (cf. `docs/API.md`)
- Tout endpoint protégé par défaut ; le backend revalide toutes les permissions
- Migrations BDD versionnées, réversibles si possible
- Pas de nouvelle dépendance sans justification ici
- [remplir contraintes spécifiques : volumétrie, performance, compatibilité navigateur, etc.]

## Fichiers potentiellement concernés
<!-- Lister avec une courte justification. Préciser [nouveau] si création. -->
- `backend/src/...` — [pourquoi]
- `backend/migrations/...` — [nouveau ? pourquoi]
- `frontend/src/...` — [pourquoi]
- `docs/API.md` — [si contrat REST modifié]
- `docs/xxx.md` — [pourquoi]

## Livrables — check-list
<!--
Liste PLATE et NUMÉROTÉE des items à livrer, consommée telle quelle par l'orchestrator (étape 0).
Une ligne = un item vérifiable. Préfixes suggérés : A = backend, B = frontend, C = docs, D = tests.
Ne pas imbriquer ; si un item est gros, le scinder.
-->
- [ ] A1 — [remplir]
- [ ] A2 — [remplir]
- [ ] B1 — [remplir]
- [ ] C1 — [remplir]
- [ ] D1 — [remplir]

## Nouvelles signatures / API (optionnelle)
<!-- À remplir si la spec introduit du nouveau public. Guide l'architect. -->
- Endpoints REST nouveaux : `POST /api/v1/...` (auth ? rôles ?)
- Schémas de réponse / champs nouveaux : [lister]
- Tables / colonnes BDD nouvelles : [lister + migration associée]
- Événements / jobs nouveaux : [lister]
- Variables d'environnement nouvelles : [lister + `.env.example`]

## Sécurité & données (optionnelle — obligatoire si auth/permissions/données personnelles/migration)
<!-- Aide `security-reviewer` (rôle GATE) à statuer GO / NO GO rapidement. -->
- Authentification touchée : oui / non — [comment]
- Permissions / rôles touchés : oui / non — [lesquels]
- Données personnelles collectées ou traitées : oui / non — finalité : [remplir]
- Migration destructive (DROP, perte de données possible) : oui / non — plan de retour arrière : [remplir]
- Nouvelle exposition publique (endpoint sans auth) : oui / non — justification : [remplir]
- Risque identifié : [remplir ou « aucun »]
- **Si au moins un « oui » ci-dessus → cocher `security-reviewer` (rôle GATE) dans Agents requis**

## ADR attendu ?
<!--
Déclencheurs ADR :
  1. Contrainte structurante imposée au reste du système
  2. Décision invisible dans le code (refus, compromis entre options équivalentes)
  3. Alternatives crédibles à tracer
  4. Verrouillage long terme (contrat d'API public, schéma BDD, format de données)
Cocher « probable » si au moins UN critère est a priori atteint ; `architect` / `security-reviewer`
confirmeront pendant le cycle.
-->
- **Probable** : oui / non
- **Critère(s) candidat(s)** : [1 | 2 | 3 | 4 | aucun]
- **Sujet pressenti** : [remplir ou « aucun »]

## Éléments visibles (pour doc-writer)
<!-- Ce qui doit apparaître dans la doc externe. Laisser vide si rien de visible. -->

### Endpoints REST concernés
- [remplir ou « aucun »]

### Écrans / flux UI concernés
- [remplir ou « aucun »]

### Schéma BDD / migrations
- [remplir ou « aucun »]

### Documentation à produire / mettre à jour
<!--
Appliquer la matrice de déclenchement du CLAUDE.md :
- écran UI modifié → `docs/features/page-<nom>.md`
- module backend modifié → `docs/subsystems/<module>.md`
- décision structurante → `docs/adr/NNNN-<slug>.md` (via doc-writer)
- contrat externe changé → docs transverses (API / ARCHITECTURE)
-->
#### Docs vivantes (1 par surface touchée)
- `docs/features/page-<nom>.md` — [remplir ou « aucune page UI touchée »]
- `docs/subsystems/<module>.md` — [remplir ou « aucun module backend touché »]

#### Docs transverses (si contrat externe modifié)
- `docs/API.md` — [si endpoints / schémas de réponse]
- `docs/ARCHITECTURE.md` — [si composant, flux ou dépendance externe modifié]
- `README.md` — [si fonctionnalité visible utilisateur]
- `CHANGELOG.md` — entrée à ajouter sous la version cible

#### Docs immuables
- `docs/adr/NNNN-<slug>.md` — [à créer si ADR attendu ci-dessus]

## Critères d'acceptation
<!-- Testables, observables. Pas « implémenter X » mais « quand Y, alors Z ». -->
- [ ] [remplir]
- [ ] [remplir]
- [ ] Suite de tests complète verte, zéro régression
- [ ] Lint propre, pas de warning nouveau
- [ ] Comportement nominal testé manuellement selon le plan de test ci-dessous

## Plan de test manuel
<!-- Scénarios concrets pour test-engineer (en complément des tests unitaires). -->
1. [remplir scénario nominal]
2. [remplir scénario cas limite]
3. [remplir scénario erreur / permission refusée]

## Notes pour agent
<!--
Points d'attention transverses, pièges connus, interactions avec autres écrans / modules.
Rappels de sécurité, décisions produit déjà prises, etc.
-->
- [remplir ou retirer la section]

## Hors périmètre (optionnelle)
<!-- Lister explicitement ce qui N'EST PAS couvert pour éviter le scope creep. -->
- [remplir ou retirer]
