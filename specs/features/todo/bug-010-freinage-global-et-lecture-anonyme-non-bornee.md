# Bug — Le freinage des échecs d'authentification est global, et `/api/flux` se lit sans aucune borne ni contrôle d'origine

- **Type** : bug
- **Statut** : todo
- **Version cible** : [à fixer par l'agent qui reprend cette spec]
- **Créée** : 2026-09-13 (constat reporté par `feature-007`, étape D du
  centre de contrôle — voir `docs/adr/0019-jeton-comme-unique-barriere-et-table-des-routes-fermee.md`,
  section « Ce que l'ADR ne ferme pas »)
- **Domaine** : API (`control-center/backend/server.py`) — freinage des
  échecs d'authentification et lecture anonyme de flux
- **Spec liée** : `feature-007-pilotage-depuis-le-tableau-de-bord` (close),
  `ADR-0019`

## Agents requis

- [x] architect
- [ ] **security-reviewer, rôle GATE** — touche l'authentification et une
      route lisible sans authentification ; si coché, **basculer sur le
      template feature complet** (`specs/features/_template.md`) plutôt que
      ce format minimal
- [x] backend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

Deux défauts distincts, tous deux constatés par lecture du code livré par
`feature-007`, pas encore reproduits en conditions réelles — à confirmer par
exécution avant correction (régime ADR-0017) :

1. **Freinage global, pas par IP.** `Ecriture.frein_actif()`
   (`control-center/backend/server.py`) compte les échecs d'authentification
   (`401`) dans une liste unique, partagée par tous les appelants :

   ```python
   self._echecs = []      # horodatages monotoniques des 401 récents
   ```

   Vingt échecs en une minute, envoyés par **n'importe quel** anonyme,
   déclenchent `429` pour **tout le monde**, y compris l'opérateur légitime
   qui présente un jeton valide.

2. **`/api/flux` (SSE) est lisible sans authentification, sans contrôle
   d'origine ni limite de connexions.** `do_GET` route `/api/flux` vers
   `_flux()` sans jamais consulter le jeton ni compter les appelants
   simultanés. C'était déjà vrai à l'étape C (lecture seule) ; l'étape D
   ajoute maintenant des routes d'écriture protégées par jeton à côté d'une
   lecture qui, elle, reste ouverte à quiconque atteint le port.

## Cause racine

- Le freinage a été conçu (GATE P1, condition 6 de `feature-007`) pour
  empêcher un compteur qui continuerait de comparer le jeton sous charge —
  ce qui resterait un oracle de temps. Le mécanisme retenu (compteur
  **global**) résout ce problème-là mais en introduit un second : un
  anonyme peut priver l'opérateur légitime en épuisant le même compteur.
  Un compteur **par IP source** (`self.client_address[0]`) résoudrait les
  deux à la fois, mais n'a pas été implémenté dans ce lot — hors périmètre
  déclaré par `feature-007`.
- `/api/flux` n'a jamais été conçu comme une route protégée : à l'étape C,
  tout le tableau de bord était en lecture seule et volontairement ouvert
  (le modèle de menace ne couvrait que l'écriture). L'étape D introduit une
  asymétrie qu'aucune spec n'a encore réexaminée : des routes d'écriture
  protégées par jeton, à côté d'une lecture toujours ouverte à quiconque
  atteint le port — y compris, potentiellement, la sortie d'un lancement
  via un futur usage de `/api/flux` si le sujet n'est pas traité ici.

## Correctif attendu

1. Freinage des échecs d'authentification (`401` sur les routes d'écriture
   et sur `/api/lancement`) compté **par adresse IP source**
   (`self.client_address[0]`), pas globalement — avec une borne sur le
   nombre d'IP suivies simultanément, pour ne pas remplacer un déni de
   service par un autre (mémoire non bornée).
2. `architect` tranche sur `/api/flux` : rester en lecture ouverte (décision
   explicite, documentée, avec le modèle de menace qui la justifie) ou
   passer sous jeton comme les routes d'écriture. Dans les deux cas, borner
   le nombre de connexions SSE simultanées acceptées par le serveur.
3. Si `/api/flux` reste sans authentification : documenter explicitement
   pourquoi dans `docs/adr/` ou dans `control-center/README.md` — une lecture
   ouverte à côté d'une écriture protégée n'est acceptable que si c'est un
   choix assumé, pas un oubli.

## Critères d'acceptation

- [ ] Le symptôme 1 est reproduit par un test réellement concurrent (deux
      IP distinctes simulées, l'une épuisant son quota, l'autre restant
      opérationnelle) avant d'être corrigé
- [ ] Après correctif, vingt échecs venus d'une IP ne réduisent en rien le
      quota d'une autre IP
- [ ] Le nombre d'IP suivies par le freinage est borné (pas de croissance
      non bornée de `_echecs` sous une attaque distribuée)
- [ ] Le statut de `/api/flux` (protégé ou non) est une décision explicite,
      écrite, pas un défaut hérité en silence
- [ ] Aucun chemin sensible nouveau n'est ouvert par le correctif — sinon
      basculer sur le template feature complet et invoquer `security-reviewer`
      (rôle GATE)
- [ ] Suite de tests verte (+ tests de non-régression couvrant les deux
      symptômes, vus échouer sur le code d'avant le fix)
- [ ] Lint propre, pas de warning nouveau

## Hors périmètre

- La reprise d'un orphelin détecté par le verrou (`bug-011`)
- Tout modèle de permissions plus fin qu'un jeton unique (rôles, utilisateurs
  distincts)
