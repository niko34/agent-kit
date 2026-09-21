# Bug — les tests navigateur expirent depuis que la matrice les exécute trois fois

## Métadonnées
- **ID** : bug-022
- **Slug** : les-tests-navigateur-expirent-quand-la-matrice-les-triple
- **Type** : bug
- **Statut** : todo
- **Priorité** : **haute** — une CI qui rend deux verdicts sur le même commit
  ne mesure plus rien, et c'est exactement ce que `bug-018` venait de fermer
- **Dernière mise à jour** : 2026-09-21
- **Spec(s) liée(s)** : **`bug-018`**, dont le livrable A5 a introduit la
  matrice ; `feature-017` et `feature-020` (les tests de diagramme concernés)

> ⚠️ **Régression causée par le cycle précédent.** La matrice `setup-python`
> ajoutée par `bug-018` fait passer la suite complète de **1 à 3 exécutions
> parallèles**, donc de 1 à 3 lancements simultanés de Chromium. Le délai de
> 30 s codé en dur tenait pour un, il ne tient plus pour trois.

## Agents requis
- [x] spec-reader · [x] architect · [x] test-engineer · [x] code-reviewer · [x] doc-writer
- [ ] security-reviewer — aucune surface d'authentification
- [ ] backend-developer, frontend-developer, ux-ui-designer
- [x] debugger — si la cause proposée ci-dessous devait être réfutée

## Symptôme observé

Run `35573591648`, sur `main`, commit `8d83e28`, le 2026-09-21 :

| job | verdict |
|---|---|
| Suite de tests (control-center/) | **échec** |
| Suite de tests (control-center/) — Python 3.11 | **échec** |
| Suite de tests (control-center/) — Python 3.13 | succès |
| les 4 autres | succès |

```
subprocess.TimeoutExpired: Command '['/usr/bin/chromium', '--headless',
'--disable-gpu', '--no-sandbox', '--dump-dom', 'file:///tmp/…']'
timed out after 30 seconds
```

Même trace dans les **deux** jobs en échec, `test_app_diagramme_navigateur.py`,
ligne 201.

**Relance des seuls jobs en échec, sans changer une ligne : les 7 jobs passent.**
Même commit, même code, rouge puis vert — c'est la définition d'un test
instable, et la preuve que ce n'est pas un défaut reproductible.

## Cause racine — établie par recoupement, à confirmer

Deux facteurs se cumulent :

1. **Un seuil absolu sur une machine dont on ne contrôle pas la charge.**
   `test_app_diagramme_navigateur.py:201` passe `timeout=30` à `subprocess.run`
   pour un lancement de Chromium sans fenêtre.
2. **La concurrence a triplé.** Avant `bug-018`, **un** job exécutait la suite
   complète. La matrice en ajoute deux : trois jobs lancent désormais Chromium
   en parallèle sur le même pool.

Sur les deux runs de la PR, les trois jobs sont passés ; sur `main`, deux ont
expiré. Le seuil est franchi de justesse, ce qui est cohérent avec un effet de
charge et non avec un défaut de code.

⚠️ **Non vérifié** : que la contention soit bien la cause, et non par exemple une
différence d'image ou un Chromium plus lent à froid. Le `debugger` doit le
confirmer ou le réfuter **avant** correction — le kit a déjà payé une cause
racine supposée (`bug-002`, et `bug-019` dont le récit était faux).

## Correctif attendu — deux pistes, la seconde recommandée

**Piste 1 — allonger le délai.** Simple, et mauvaise : elle déplace le seuil
sans le supprimer. On y retombera au prochain job ajouté à la matrice, et le
test restera une mesure de la charge du runner déguisée en mesure du code.

**Piste 2 — sortir les tests navigateur de la matrice.** Ce que les bornes 3.11
et 3.13 vérifient, c'est le comportement du **Python**, pas le rendu d'une page
dans Chromium. Exécuter trois fois un test de navigateur ne prouve rien de plus
qu'une fois et coûte exactement l'instabilité observée. La matrice lancerait la
suite **sans** les harnais navigateur ; le job système, lui, les garderait.

⚠️ Si la piste 2 est retenue, elle crée une **asymétrie** entre les jobs — donc
un risque de la voir diverger en silence. Elle doit être **gardée par un test**,
comme `test_ci_decouverte.py` garde la découverte, et non laissée à un
commentaire.

## Grandeurs mesurées
- `jobs exécutant la suite complète, avant bug-018` = **1**
- `après` = **3**
- `délai codé en dur` = **30 s**, `test_app_diagramme_navigateur.py:201`
- `verdicts sur le commit 8d83e28` = **2** — échec puis succès, sans modification
- `harnais navigateur dans la suite` = à mesurer (`grep -l chromium control-center/web/test_*.py`)

## Critères d'acceptation
- [ ] La cause est **confirmée ou réfutée par mesure**, pas supposée
- [ ] Trois exécutions consécutives de la CI sur un même commit rendent **le
      même verdict** — c'est le critère qui compte, et il exige de relancer
- [ ] Aucun seuil absolu de durée ne subsiste sur un lancement de navigateur,
      ou il est justifié par une mesure de la durée réelle observée
- [ ] Si les jobs deviennent asymétriques, un test le **garde**
- [ ] La suite reste verte en root et en non-root

## Hors périmètre
- Le contenu des tests de diagramme : ils sont justes, c'est leur délai qui ne l'est pas
- Le choix de la matrice elle-même (`ADR-0035`) : elle a trouvé un vrai défaut
  de plancher, on ne la retire pas
