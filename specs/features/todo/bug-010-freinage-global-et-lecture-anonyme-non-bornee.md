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
  `ADR-0019`, `ADR-0020`, `bug-012` (périmètre précisé, voir note ci-dessous)

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

## Note additive (2026-09-14, `bug-012`)

Sous ADR-0020, `bug-012` a rendu le jeton obligatoire pour **toutes** les
routes dès qu'une requête est distante — la lecture y compris. Le freinage
compte donc désormais aussi les échecs sur des routes de lecture qui, avant
ce cycle, n'en connaissaient aucun. Conséquence mesurée : **le périmètre du
symptôme 1 s'élargit**. Vingt jetons faux envoyés depuis une adresse distante
déclenchent toujours un `429` **global** (le défaut décrit ci-dessus n'est
pas corrigé par `bug-012`, qui ne l'absorbait pas délibérément) — mais ce
`429` prive désormais **aussi** le développeur local muni d'un jeton valide,
lecture comprise, tant que le compteur global reste saturé. Le correctif
attendu (comptage par IP source) reste inchangé ; seul l'impact mesuré d'une
absence de correctif s'aggrave.

**Le point 2 est partiellement recouvert**, à vérifier par le prochain agent
qui reprend cette spec plutôt qu'à supposer clos : `server.py:762-777` fait
désormais passer `/api/flux` par la **même** garde générique que le reste de
`/api/*` (`jeton_requis = distante or jeton.actif()`). Une connexion SSE
distante sans jeton est donc refusée (`401`) — mais `EventSource` ne pouvant
porter aucun en-tête, une connexion distante **ne peut jamais** s'authentifier
par ce canal ; c'est ce qui a forcé le repli sur polling décrit dans
`control-center/README.md` (section « Étape D+ »). En local, `/api/flux`
reste ouvert sans jeton, comme prévu par ADR-0020. Ce que `bug-012` **ne
règle pas** : la limite de connexions SSE simultanées (fin du point 2 et
correctif attendu ci-dessus) — toujours absente.

---

## Addendum du 2026-09-15 — établi par EXÉCUTION, et plus grave que le constat d'origine

Le symptôme ci-dessus était relevé **par lecture du code**, non reproduit. Il l'est
désormais, par l'audit de sécurité en rôle AUDIT (étape `S1` de `feature-010`), sur
un clone jetable écoutant `0.0.0.0`, frappé depuis `127.0.0.1` puis depuis l'adresse
du réseau local.

### Ce qui a été mesuré

Régime **« jeton valide déclaré, `hote = 0.0.0.0` »** — c'est-à-dire la configuration
de déploiement réellement utilisée :

```
20 × POST /api/lancer distants, SANS aucun en-tête Authorization  →  401 puis 429
puis, depuis 127.0.0.1 AVEC le jeton valide :
    GET  /api/etat       → 429
    POST /api/lancer     → 429
    GET  /api/lancement  → 429
```

**Un tiers sans aucune connaissance verrouille le propriétaire hors de son propre
tableau de bord, lecture comprise.** Fenêtre glissante de 60 s à 20 échecs : une
requête toutes les trois secondes suffit à tenir le verrou indéfiniment. Coût nul
pour l'attaquant, et invisible pour le propriétaire autrement que par un `429`
qu'il n'a pas provoqué.

### La cause exacte

`do_POST` appelle `enregistrer_echec()` **que le jeton soit absent ou faux**
(`server.py:924-927`), sans la garde `if presente:` que porte la branche de lecture
(`server.py:733-736`). Le compteur est **global** (`server.py:482`, `:492-494`), et
`frein_actif()` est consulté **avant** toute comparaison (`server.py:729-731`,
`:921-923`) : un jeton valide ne peut donc pas prouver son porteur une fois le frein
déclenché.

### Le point d'assemblage à retenir

En régime « aucun jeton déclaré », le `POST` distant rend `403` **avant** de compter :
25 tentatives n'ont rien déclenché. **Le verrouillage n'existe que dans le déploiement
qu'ADR-0020 prescrit précisément pour sortir de la machine.** La garde et le trou
arrivent ensemble.

### Une sentinelle qui déclarait acquis ce qu'elle devait surveiller

`control-center/README.md` affirmait que le freinage ne compte que les jetons
**présents et faux**. Vrai en lecture, faux en écriture. Le test qui garde cette
propriété (`test_server_bug012.py:277-297`, cas `T7`) **ne couvre que la lecture** :
la propriété était documentée comme globale, testée sur une moitié, absente de
l'autre. La documentation a été corrigée le 2026-09-15 ; **le code, non** — c'est
l'objet de cette spec.

### Correctif attendu, complété

1. **Compteur par adresse source**, avec une borne sur le nombre d'adresses suivies
   (sinon le suivi devient lui-même un vecteur d'épuisement mémoire).
2. Le compteur de la **boucle locale n'est jamais alimenté par une adresse distante**.
3. **Décision écrite** sur les jetons absents en `do_POST` : soit aligner sur la règle
   documentée (ne compter que les jetons présents), soit assumer l'écart et le dire.
4. `401` **uniforme** sur `do_POST` distant : aujourd'hui `403` et `401` distinguent
   les régimes et renseignent un anonyme sur la présence d'un tableau de bord ouvert
   en local.

### Critères d'acceptation ajoutés

- [ ] 20 échecs distants consécutifs, puis le **propriétaire local muni du jeton
      valide obtient 200** en lecture et 202 en écriture — le test qui manque
      aujourd'hui
- [ ] Le jumeau de `T7` existe **côté écriture**, symétrique de celui de la lecture
- [ ] Le nombre d'adresses suivies est borné, et la borne est déclarée, jamais devinée
- [ ] Un anonyme distant ne peut plus distinguer « jeton déclaré » de « aucun jeton
      déclaré » par le seul code de réponse

