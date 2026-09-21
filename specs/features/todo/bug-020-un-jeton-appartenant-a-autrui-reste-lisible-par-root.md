# Un jeton appartenant à autrui reste lisible par root, pas par son propriétaire

## Métadonnées
- **ID** : bug-020
- **Slug** : un-jeton-appartenant-a-autrui-reste-lisible-par-root
- **Type** : bug
- **Statut** : todo
- **Priorité** : normale
- **Version cible** : N/A
- **Dernière mise à jour** : 2026-09-21
- **Spec(s) liée(s)** : **`bug-018`** — ce résidu y a été **nommé, mesuré et
  explicitement reporté** par le GATE P1 puis confirmé au P2 ; `feature-007`
  (dont le GATE P1 a posé la règle des bits groupe/autres)

> Format **feature complet** bien qu'il s'agisse d'un bug : la surface touchée
> est la lisibilité du fichier de jeton, donc l'authentification. La règle du
> kit impose alors le template complet, pour que `security-reviewer` (rôle
> GATE) soit déclenché.

## Grandeurs mesurées
- `modes traités par bug-018` = **8** — `0600/0400/0500/0700` actifs,
  `0200/0300/0100/0000` refusés, **verdicts identiques en root et en non-root**
  après correctif. Mesuré le 2026-09-20.
- `dimension NON traitée` = **la propriété du fichier**. Mesuré le 2026-09-20
  pendant l'analyse de `bug-018` : un fichier en `0600` appartenant à **root**
  est refusé à `nobody` (`PermissionError`) et lu par root. Les bits sont
  pourtant conformes.
- `garde actuelle` = **2** vérifications dans `jeton.py` — `_MASQUE_INTERDIT`
  (`0o077`, bits groupe/autres) et `_MASQUE_LECTURE_PROPRIETAIRE` (`0o400`,
  bit de lecture). **Aucune** ne regarde `st_uid`.

## Domaines touchés
- [ ] API REST · [ ] Frontend · [ ] BDD / migrations
- [x] Auth / permissions → **passage obligatoire par `security-reviewer` (rôle GATE)**
- [ ] Données personnelles · [ ] Intégrations externes · [ ] Tâches de fond

## Agents requis
- [x] spec-reader · [x] architect · [x] **security-reviewer, rôle GATE (P1, P2)**
- [x] backend-developer · [x] test-engineer · [x] code-reviewer · [x] doc-writer
- [ ] ux-ui-designer, frontend-developer, debugger

## Description

`bug-018` a rendu le verdict du jeton **indépendant de l'identité de
l'exécutant** sur la dimension des **bits de mode**. Il reste une dimension
intacte : la **propriété** du fichier. Un jeton en `0600` appartenant à un
autre utilisateur est lu par root et refusé à tout autre — les bits sont
conformes, le verdict dépend encore de qui lance le serveur.

## Contexte

Ce résidu n'est pas une découverte tardive : il a été **nommé par l'architecte**
pendant l'arbitrage de `bug-018`, puis **accepté en report par le GATE P1**, avec
un motif explicite — exiger `st_uid == geteuid()` **casserait un déploiement
légitime** : un serveur lancé en root dans un conteneur, avec un fichier de
jeton appartenant au développeur. Le GATE a jugé le report propre *à condition
qu'une spec dédiée existe*. La voici.

⚠️ Sans cette spec, le résidu n'aurait vécu que dans une spec en partance pour
`done/` — relevé par `code-reviewer` à l'étape 8 de ce cycle.

## Comportement attendu

**La question n'est pas tranchée d'avance**, et c'est le travail de
l'`architect` et du GATE P1. Trois branches, au moins :

1. **Refuser un jeton dont le propriétaire n'est pas l'utilisateur effectif.**
   Sens fermant, mais casse le déploiement en conteneur décrit ci-dessus.
2. **Avertir sans refuser** : le jeton reste actif, la bannière d'état dit que
   sa propriété ne correspond pas. Ne ferme rien, mais rend visible.
3. **Déclarer la dimension hors garde**, par écrit, dans un ADR — et alors
   `jeton.py` doit le **dire en commentaire**, pour qu'aucun lecteur ne croie
   la garde plus complète qu'elle n'est.

Exigence commune aux trois : **le verdict ne doit plus dépendre de l'identité
sans que rien ne le signale**. Aujourd'hui il en dépend, et c'est muet.

### Cas limites
- Serveur en root, jeton appartenant au développeur : **le cas légitime**, à ne
  pas casser sans décision écrite
- Jeton appartenant à un tiers ni root ni l'exécutant
- Fichier sur un montage qui ne préserve pas `st_uid`
- Lien symbolique vers un fichier d'un autre propriétaire

## Comportement actuel

`charger()` vérifie deux masques de mode et n'inspecte jamais `st_uid`. Le
verdict dépend donc de l'identité de l'exécutant sur cette dimension, en silence.

## Contraintes techniques
- Bibliothèque standard uniquement (`ADR-0006`)
- Suites = **scripts autonomes**, jamais `unittest` (`PIEGES §6`)
- ⚠️ **Ne pas affaiblir l'acquis de `bug-018`** : les deux masques existants
  restent en amont et intacts, et les verdicts doivent rester identiques en
  root et en non-root sur les 8 modes déjà couverts
- Tout compte de cas doit dire **sous quelle identité** il a été obtenu

## Livrables — check-list
- [ ] S1 — **GATE P1** : arbitrage entre les trois branches, verdict contraignant
- [ ] A1 — verdict ADR (le report lui-même est déjà tracé par l'ADR de `bug-018`)
- [ ] B1 — la branche retenue, implémentée
- [ ] D1 — tests **sous les deux identités**, dont le cas du conteneur
- [ ] D2 — mutation : neutraliser la garde neuve doit **tuer** au moins un cas
- [ ] S2 — **GATE P2** sur le diff
- [ ] C1 — `PIEGES`, `CHANGELOG` si le comportement visible change, ADR

## Sécurité & données
- **Authentification touchée : oui** — la lisibilité du fichier de jeton
- Permissions : oui, indirectement · Données personnelles : non
- Migration destructive : non · Nouvelle exposition publique : non
- **Risque identifié** : la branche 1 est un **durcissement qui peut casser un
  déploiement légitime**. Le risque de ce cycle n'est pas d'ouvrir une porte,
  c'est d'en fermer une qui servait.

## ADR attendu ?
- **Probable** : oui · Critères candidats : **1**, **2**
- Sujet pressenti : ce que la garde du jeton regarde, et ce qu'elle déclare ne
  pas regarder

## Éléments visibles (pour doc-writer)
- Endpoints : aucun · Écrans : la bannière d'état, si la branche 2 est retenue
- `CHANGELOG.md` si le comportement visible change

## Critères d'acceptation
- [ ] Le verdict ne dépend plus de l'identité **sans que rien ne le signale** —
      soit la garde ferme, soit elle avertit, soit elle le déclare par écrit
- [ ] Le cas « serveur root, jeton du développeur » a un comportement **décidé
      et écrit**, pas subi
- [ ] Les 8 modes de `bug-018` rendent toujours le même verdict dans les deux
      identités
- [ ] Verdicts GATE P1 et P2 écrits dans la spec
- [ ] Suite verte dans les deux identités, mutation tuant la garde neuve

## Plan de test manuel
1. Jeton `0600` appartenant à l'exécutant → actif, dans les deux identités
2. Jeton `0600` appartenant à un autre, serveur en root → comportement **décidé**
3. Idem, serveur non-root → doit concorder avec le cas 2 ou être déclaré différent
4. Rejouer les 8 modes de `bug-018` : aucun verdict ne change

## Hors périmètre
- Les bits de mode : traités et clos par `bug-018`
- La localité (`_locale`) : traitée et close par `bug-018`
