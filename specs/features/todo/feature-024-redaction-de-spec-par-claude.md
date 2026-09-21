# Claude rédige la spec depuis le cockpit

## Métadonnées
- **ID** : feature-024
- **Slug** : redaction-de-spec-par-claude
- **Type** : feature
- **Statut** : todo
- **Priorité** : normale
- **Version cible** : N/A
- **Dernière mise à jour** : 2026-09-20
- **Spec(s) liée(s)** : **`feature-008`** (création de spec depuis un prompt — la surface
  que celle-ci transforme), `feature-007` (garde-fous d'écriture et `budget_max_usd`),
  `feature-021` (le dialogue qui l'ouvre)

## Grandeurs mesurées
- `appels de modèle dans le centre de contrôle aujourd'hui` = **0** — `ADR-0027 §2` :
  « le texte saisi ne quitte **jamais** le poste »
- `substitutions du brouillon actuel` = **6**, déterministes ; tout le reste du template
  reste `[remplir]`, recopié **octet pour octet**
- `routes d'écriture existantes` = **4**, dont `/api/spec/brouillon` (ne écrit rien) et
  `/api/spec/ecrire`
- `reboucles déjà payées pour ce défaut` = **1** — `ADR-0027 §7` documente qu'une
  régénération avait été livrée puis défaite **en cours de cycle**, au prix d'une
  reboucle complète de `feature-008`

## Domaines touchés
- [x] API REST · [x] Frontend
- [ ] BDD / migrations
- [x] Auth / permissions → **GATE obligatoire**
- [x] Données personnelles → **GATE obligatoire** : le texte saisi quitterait le poste
- [x] Intégrations externes — **un appel de modèle**
- [ ] Tâches de fond

## Agents requis
- [x] spec-reader · [x] architect · [x] **security-reviewer, rôle GATE (P1, P2)**
- [x] ux-ui-designer · [x] backend-developer · [x] frontend-developer
- [x] test-engineer · [x] code-reviewer · [x] doc-writer

## Description

Dans le dialogue « Ajouter un élément », l'utilisateur ne saisit que **type**,
**description** et **priorité**. Claude choisit le **titre**, rédige la **spec**,
sélectionne l'**agent** adapté et définit les **critères d'acceptation**. L'identifiant
est engendré, l'élément entre dans la première colonne.

## Contexte — ce que cette spec révoque, et pourquoi c'est lourd

`ADR-0027` a tranché l'inverse, et pour deux raisons **cumulatives** :

1. **Exfiltration** : un secret ou une donnée personnelle collés par inadvertance
   quitteraient le poste.
2. **Doctrine documentaire** : « une génération qui invente des contraintes ou des
   critères d'acceptation plausibles **empoisonne cette discipline à la racine** ».

Et `ADR-0027 §1` pose que la relecture humaine avant écriture « n'est pas une option
d'ergonomie, c'est la **seule garde** qui empêche une spec générée et jamais relue de
porter la forme d'une spec vraie ».

⚠️ **Ce défaut a déjà coûté une reboucle complète** à `feature-008` (`ADR-0027 §7`). Le
remettre en place est un choix à prendre **les yeux ouverts**.

## Comportement attendu

### Recommandation forte de l'analyse : garder la relecture
Le flux existant fait déjà exactement ce qu'il faut : `/api/spec/brouillon` prépare,
**l'humain relit**, `/api/spec/ecrire` écrit **verbatim** ce qui a été relu. Conserver le
dialogue minimal de la maquette **et** insérer l'écran de relecture entre « Ajouter » et
l'écriture coûte **un écran de plus que la maquette**, et fait tenir `ADR-0027` §1 et §7
sans exception. La maquette écrit directement dans `Todo`, sans rien montrer.

**À trancher explicitement par l'humain**, et à écrire dans un ADR quel que soit le choix.

### Cas limites
- Le modèle est injoignable, lent, ou répond hors format
- La description contient un secret — que devient-il ?
- `budget_max_usd` est atteint : `ADR-0027 §2` l'avait déclaré **sans objet** faute
  d'appel de modèle ; il **redevient effectif**
- Deux créations simultanées : les identifiants doivent rester distincts
  (garde déjà éprouvée : 8 threads, 8 numéros distincts)

## Comportement actuel

`/api/spec/brouillon` recopie le template octet pour octet, **zéro appel de modèle**.
L'humain relit, puis `/api/spec/ecrire` écrit ce qu'il a relu, verbatim.

## Contraintes techniques
- Un appel de modèle depuis le serveur **rouvre le plafond de dépense** de `feature-007`
- La cible d'écriture reste `colonnes()[0][0]`, **jamais la chaîne `"todo"`** (`ADR-0027 §6`)
- Le confinement du chemin d'écriture (`vcs.chemin_sur()`) reste en vigueur
- Aucun secret dans le dépôt : la clé d'API, si elle existe, vient de l'environnement

## Fichiers potentiellement concernés
- `control-center/backend/redaction_spec.py` — le cœur de la transformation
- `control-center/backend/server.py`, `config.py` — plafond, clé, routes
- `control-center/web/` — dialogue et écran de relecture
- `docs/adr/` — l'ADR qui révoque `ADR-0027 §2`

## Livrables — check-list
- [ ] H1 — **arbitrage humain écrit** : la relecture avant écriture est-elle conservée ?
- [ ] S1 — **GATE P1** : exfiltration du texte saisi, gestion des secrets, plafond
- [ ] A1 — ADR révoquant `ADR-0027 §2` (et §1 si la relecture saute)
- [ ] B1 — appel de modèle, borné, avec délai maximal et repli
- [ ] B2 — plafond de dépense **réactivé** et vérifié
- [ ] B3 — écriture confinée, identifiants distincts sous concurrence
- [ ] F1 — dialogue minimal : type, description, priorité
- [ ] F2 — écran de relecture, **si H1 le conserve**
- [ ] S2 — **GATE P2**
- [ ] D1 — tests, dont **mutation** sur le plafond et sur le confinement
- [ ] C1 — `docs/API.md`, ADR, `CHANGELOG.md`

## Sécurité & données
- Authentification : **non** · Permissions : **non**
- **Données personnelles : OUI** — le texte saisi quitte le poste. Finalité à déclarer.
- Migration destructive : **non** · Exposition publique : **non**
- **Risque identifié** : *exfiltration*. Tout ce que l'utilisateur colle dans la
  description part vers un modèle. C'est précisément ce qu'`ADR-0027` avait refusé.

## ADR attendu ?
- **Probable** : **oui** · Critères **1**, **2**, **3**, **4**
- Sujet : le centre de contrôle cesse de n'être qu'un copieur de template

## Éléments visibles (pour doc-writer)
- Endpoints modifiés → `docs/API.md` · Écran de création → `docs/features/page-*.md`
- `CHANGELOG.md` · ADR révoquant `ADR-0027 §2`

## Critères d'acceptation
- [ ] Une création produit une spec **valide au regard de `_template.md`**
- [ ] Le plafond de dépense arrête une création qui le dépasserait
- [ ] Le modèle injoignable ne laisse **aucun fichier à moitié écrit**
- [ ] 8 créations simultanées → 8 identifiants distincts
- [ ] La colonne cible suit la configuration, pas la chaîne `"todo"`
- [ ] Verdicts GATE P1 et P2 écrits
- [ ] Suite verte, mutation sur le plafond et le confinement

## Plan de test manuel
1. Créer une feature depuis le cockpit, relire la spec produite
2. Couper le réseau en cours de rédaction
3. Baisser `budget_max_usd` à zéro
4. Renommer la première colonne dans la configuration
5. Saisir une description contenant un faux secret et vérifier ce qui part

## Hors périmètre
- La conversation permanente (`feature-022`)
- Les actions du backlog (`feature-025`)
