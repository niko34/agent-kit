## Métadonnées
- **ID** : feature-009
- **Slug** : discussion-par-spec
- **Type** : feature
- **Statut** : todo
- **Priorité** : normale
- **Version cible** : 0.7.0
- **Dernière mise à jour** : 2026-09-12
- **Spec(s) liée(s)** : feature-008 (l'autre surface d'écriture liée aux
  specs), feature-007 (les garde-fous d'écriture), feature-002 (le Kanban
  depuis lequel une spec s'ouvre)

> **Étape F** du centre de contrôle. La question centrale n'est pas
> l'interface mais **où vivent les messages** — et cette question a déjà été
> tranchée deux fois dans ce dépôt, dans deux sens opposés (ADR-0007 pour le
> journal, `.claude/memory/` pour la mémoire). Voir « ADR attendu ».

## Domaines touchés
- [x] API REST (endpoints, contrats, codes d'erreur)
- [x] Frontend (écrans, composants, appels API)
- [ ] BDD / migrations
- [x] Auth / permissions → **passage obligatoire par `security-reviewer` (rôle GATE)** —
      écriture déclenchée depuis le navigateur
- [x] Données personnelles → **passage obligatoire par `security-reviewer` (rôle GATE)** —
      un fil de discussion est du texte libre, et il peut finir versionné
- [ ] Intégrations externes
- [ ] Tâches de fond

## Agents requis
- [x] spec-reader
- [x] architect — l'arbitrage sur le lieu de stockage lui revient
- [x] security-reviewer, rôle GATE — P1 sur le design, P2 sur le diff
- [x] ux-ui-designer
- [x] backend-developer
- [x] frontend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Description
Attacher à chaque spec un fil de discussion consultable et alimentable depuis
le tableau de bord : questions ouvertes, arbitrages en attente, décisions
prises en cours de cycle. Objectif : que le contexte d'une spec cesse de vivre
uniquement dans une conversation de terminal qui disparaît avec la session.

## Contexte
Le kit sait déjà conserver deux choses : ce qui s'est **passé** (le journal
d'événements, non versionné, une trace) et ce qui a été **décidé** (les specs
enrichies, les ADR, la mémoire de projet, versionnés). Entre les deux, il perd
tout : les questions posées pendant un cycle, les hypothèses écartées avant
d'être écrites, les arbitrages dits à l'oral.

Cette perte est mesurable dans ce dépôt même. Les étapes A à C ont produit des
décisions fines — pourquoi le plafond de ligne vaut 256 octets par champ,
pourquoi `GELÉE` est rangé en clos, pourquoi deux gardes du lecteur de specs
ont chacune leur cas de test — qui n'ont survécu que parce que quelqu'un a pris
le temps de les recopier dans un README et huit ADR rétroactifs. Le reste a
disparu avec les sessions.

## Comportement attendu

### Un fil par spec
- Ouvert depuis le Kanban : une spec affichée porte son fil.
- Un message = un auteur, un horodatage à la milliseconde (cohérent avec le
  journal), un texte. Format lisible à la main, sans outil.
- Les messages sont **immuables** : on n'édite pas, on répond. Une correction
  est un message de plus, comme les addendums datés d'une spec.
- Le fil reste consultable pour une spec en `done/` — c'est même là qu'il vaut
  le plus cher, puisqu'il explique ce que la spec close ne dit pas.

### Ce qui ne doit pas se produire
- Le fil ne modifie **jamais** le fichier de spec. Une spec `done/` est
  immuable ; un fil qui y écrirait violerait cette règle par construction.
- Le fil ne change pas la colonne d'une spec : le répertoire fait foi
  (ADR-0003).
- Un fil ne peut pas exister pour une spec qui n'existe pas : l'identifiant est
  validé contre la liste des specs réellement découvertes, comme l'est déjà
  `GET /api/spec`.

### Cas limites
- Spec **promue** pendant qu'un fil existe (`todo/` → `doing/` → `done/`) : le
  fil doit suivre la spec, pas son chemin. Le kit a déjà payé ce défaut —
  29 % de liens morts vers des specs sur le projet d'origine, uniquement parce
  que le chemin encode l'état dans le cycle.
- Spec **renommée** ou supprimée : le fil devient-il orphelin, conservé,
  signalé ? À décider, pas à subir — `update_kit.sh` a déjà tranché un cas
  voisin en signalant les orphelins sans jamais les supprimer.
- Deux messages écrits simultanément : aucun ne doit être perdu ni entrelacé.
  Le collecteur d'événements a résolu le même problème par une écriture
  atomique unique en `O_APPEND` avec plafond de ligne — la solution est
  disponible dans le dépôt.
- Message très long, ou vide : borné, avec un message explicite.
- Fil très long : pagination ou troncature **annoncée**, jamais coupée en
  silence.

## Comportement actuel
Rien. Une spec affichée dans le tableau de bord est du texte en lecture seule.
Le contexte d'un cycle vit dans la conversation Claude Code, dont le chemin
(`transcript_path`) est même **délibérément filtré** avant d'atteindre le
navigateur (feature-002).

## Contraintes techniques
- Bibliothèque standard Python uniquement (ADR-0006)
- Toute écriture passe par les garde-fous de feature-007
- Écriture atomique des messages, sur le modèle du collecteur d'événements
- Format de stockage lisible sans outil (Markdown ou JSON Lines), pour que le
  fil survive à la disparition du centre de contrôle lui-même
- L'identifiant de spec est validé contre les specs découvertes ; aucun chemin
  n'est construit depuis la requête

## Fichiers potentiellement concernés
- `control-center/backend/discussions.py` — [nouveau] lecture/écriture des fils
- `control-center/backend/server.py` — routes de lecture et d'écriture
- `control-center/backend/specs.py` — appariement fil ↔ spec à travers les
  promotions
- `control-center/web/*` — affichage et saisie
- `control-center/control-center.example.toml` — emplacement des fils, si
  configurable
- `.gitignore` — selon l'arbitrage de stockage
- `control-center/README.md`, `docs/API.md`, `CHANGELOG.md`

## Livrables — check-list
- [ ] A1 — Stockage des fils, selon l'arbitrage tranché par l'ADR ci-dessous
- [ ] A2 — Appariement fil ↔ spec **stable à travers les promotions** de répertoire
- [ ] A3 — Écriture atomique, aucun message perdu ni entrelacé en concurrence
- [ ] A4 — Messages immuables ; correction = message supplémentaire
- [ ] A5 — Le fichier de spec n'est jamais modifié par un fil
- [ ] A6 — Fils orphelins : comportement décidé, signalé, jamais silencieux
- [ ] B1 — Affichage du fil depuis le Kanban, saisie, états vide / chargement / erreur
- [ ] C1 — ADR sur le lieu de stockage (voir ci-dessous)
- [ ] C2 — `control-center/README.md`, `docs/API.md`, `CHANGELOG.md`
- [ ] D1 — Cas validés par mutation, dont la concurrence et la promotion de spec

## Nouvelles signatures / API
- `GET /api/discussion?spec=<id>` — lecture d'un fil
- `POST /api/discussion` — ajout d'un message (sous jeton)
- Codes d'erreur : `401` jeton, `404` spec inconnue, `422` message vide ou
  trop long. À confirmer par `architect`.

## Sécurité & données
- Authentification touchée : oui — hérite du jeton de feature-007
- Permissions / rôles touchés : oui — porteur du jeton = peut écrire
- Données personnelles collectées ou traitées : **oui** — un fil de discussion
  est du texte libre, où l'on colle volontiers un extrait de journal, une
  adresse, un identifiant. Si les fils sont versionnés, ils sont poussés ;
  s'ils ne le sont pas, ils restent sur un poste. Les deux options ont un coût
  de confidentialité distinct, à instruire en P1 **avant** de choisir.
- Migration destructive : non applicable
- Nouvelle exposition publique : non — routes sous jeton
- Risque identifié : un fil versionné devient un canal de fuite durable (un
  secret collé dans un message part au premier `git push` et survit à sa
  suppression). Le kit porte déjà la règle pour un cas identique : « aucun
  secret ne va dans ce dossier — il est versionné » (`.claude/memory/`).
- **Au moins un « oui » → `security-reviewer` (rôle GATE) coché**

## ADR attendu ?
- **Probable** : **oui**
- **Critère(s) candidat(s)** : 1 (contrainte structurante), 3 (alternatives
  crédibles à tracer), 4 (verrouillage long terme : un format de données)
- **Sujet pressenti** : « Où vivent les fils de discussion ». Trois options
  crédibles, et le dépôt a déjà tranché dans les deux sens sur des objets
  voisins :
  - **versionné** (fichiers à côté des specs) — survit au changement de poste
    et à la perte du conteneur, comme `.claude/memory/` qui est versionné
    précisément pour cette raison ; mais devient un canal de fuite, alourdit
    le dépôt, et fait diverger deux récits du même cycle ;
  - **non versionné** (`var/`, avec la configuration et le journal) — cohérent
    avec ADR-0007 : ce qui appartient au projet ne voyage pas avec le kit, et
    le journal est « une trace, pas une source de vérité » ; mais un fil perdu
    au changement de machine ne vaut guère mieux que pas de fil ;
  - **replié dans la spec elle-même** — le plus simple, et le seul qui
    contredit frontalement l'immuabilité d'une spec `done/`.
  Le choix engage le format de données et se paie longtemps : c'est un ADR.

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- `GET /api/discussion`, `POST /api/discussion`

### Écrans / flux UI concernés
- Fil de discussion d'une spec, ouvert depuis le Kanban

### Schéma BDD / migrations
- Aucun

### Documentation à produire / mettre à jour

#### Docs vivantes
- `control-center/README.md` — étape F, et ce que le stockage implique

#### Docs transverses
- `docs/API.md` — les deux routes
- `README.md` — si les fils sont versionnés (conséquence visible pour l'humain)
- `CHANGELOG.md` — entrée sous 0.7.0

#### Docs immuables
- `docs/adr/NNNN-ou-vivent-les-fils-de-discussion.md`

## Critères d'acceptation
- [ ] Un fil reste attaché à sa spec après une promotion `todo/ → doing/ → done/`
- [ ] Le fichier de spec est bit pour bit inchangé après l'écriture d'un message
- [ ] Deux messages envoyés simultanément sont tous les deux présents, lisibles,
      non entrelacés
- [ ] Un identifiant de spec inconnu ne crée aucun fichier
- [ ] Un fil dont la spec a disparu est signalé, jamais supprimé en silence
- [ ] La mise en garde sur les secrets est visible **à la saisie** si les fils
      sont versionnés
- [ ] `./tools/check_specs.sh` et `./tools/check_doc_links.sh` restent verts
- [ ] Suite de tests complète verte, zéro régression
- [ ] Lint propre, pas de warning nouveau
- [ ] Comportement nominal testé manuellement selon le plan ci-dessous

## Plan de test manuel
1. **Nominal** : ouvrir une spec, écrire deux messages, recharger la page,
   vérifier qu'ils sont là dans l'ordre.
2. **Promotion** : déplacer la spec de `todo/` vers `doing/` par `git mv`,
   recharger — le fil doit toujours être attaché.
3. **Concurrence** : envoyer deux messages depuis deux navigateurs au même
   instant — les deux doivent être présents et lisibles.
4. **Spec close** : ouvrir une spec de `done/`, vérifier que le fil est
   consultable et que le fichier de spec n'a pas bougé (`git status`).
5. **Orphelin** : supprimer une spec ayant un fil — vérifier le signalement.

## Notes pour agent
- L'arbitrage de stockage est le cœur de cette spec ; l'interface en découle.
  Ne pas commencer par l'écran.
- Le piège à éviter est connu et documenté : « le chemin d'un lien vers une
  spec **encode son état** dans le cycle ». Apparier un fil par son chemin
  reproduirait exactement le défaut qui a tué 29 % des liens du projet
  d'origine. L'appariement doit se faire sur un identifiant stable, comme
  l'appariement des passages d'agents se fait par `agent_id` et jamais par nom.
- Si les fils sont versionnés, ils entrent dans le périmètre d'`update_kit.sh`
  et de `.kit-paths` : vérifier qu'aucune synchronisation ne peut les écraser
  (ADR-0007 et ADR-0008 donnent le raisonnement, pas la réponse).

## Hors périmètre
- La participation d'un agent au fil (réponse automatique à une question) —
  spec dédiée si le besoin apparaît
- La notification (courriel, message) sur nouveau message
- L'édition ou la suppression d'un message : les messages sont immuables
