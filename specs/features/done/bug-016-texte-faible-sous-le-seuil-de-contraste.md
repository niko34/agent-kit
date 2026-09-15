# Bug — `--texte-faible` est sous le seuil de contraste, dans le thème sombre

- **Type** : bug
- **Statut** : todo
- **Priorité** : normale
- **Version cible** : [à fixer par l'agent qui reprend cette spec]
- **Créée** : 2026-09-15 (relevé par l'architecte pendant `feature-015`, confirmé
  par `ux-ui-designer` comme **hors périmètre** de ce cycle)
- **Domaine** : frontend (`control-center/web/app.css`)
- **Spec(s) liée(s)** : `feature-015` (l'a trouvé, ne le corrige pas),
  `docs/DESIGN-SYSTEM.md` §8

## Agents requis

- [x] architect
- [x] ux-ui-designer — le seuil est une règle du design system
- [x] frontend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

Dans le thème sombre actuel, `--texte-faible` (`#737c84`) contre `--fond`
(`#14171a`) donne **4,24:1**.

Le design system §8 fixe le minimum à **4,5:1 pour le texte**. Le jeton est donc
sous le seuil, et il l'était **avant** `feature-015` — ce n'est pas une
régression, c'est un défaut jamais mesuré.

`--texte-faible` porte les mentions secondaires : horodatages, compteurs,
libellés d'appoint. Ce sont précisément les informations qu'on lit en dernier,
donc celles pour lesquelles un contraste insuffisant coûte le plus.

## Cause racine

Aucune mesure n'a jamais été faite. Les trois niveaux de texte ont été choisis
à l'œil, à une époque où le tableau de bord n'avait qu'un thème et aucune règle
de contraste écrite. Le design system, qui pose le seuil, est postérieur.

> C'est le même schéma que la palette d'agent : une valeur choisie à l'œil tient
> jusqu'au jour où quelqu'un la mesure.

## Correctif attendu

Relever `--texte-faible` jusqu'à **au moins 4,5:1** contre `--fond`, `--surface`
et `--creux` — les trois surfaces, pas seulement celle sur laquelle on l'a
regardé.

⚠️ **Dans les deux thèmes.** `feature-015` livre un thème clair ; le jeton clair
doit être mesuré au même titre, et rien ne garantit qu'il passe.

⚠️ Vérifier au passage `--texte-doux` : il n'a pas été mesuré non plus. Une spec
qui corrigerait un seul des deux niveaux sans regarder l'autre referait l'erreur
qu'elle corrige.

## Critères d'acceptation

- [ ] `--texte-faible` ≥ 4,5:1 contre `--fond`, `--surface` et `--creux`, dans
      les **deux** thèmes, vérifié par un test qui **calcule** le contraste
      depuis les jetons
- [ ] `--texte-doux` mesuré et, s'il est sous le seuil, corrigé dans le même lot
- [ ] La hiérarchie visuelle des trois niveaux de texte reste lisible — un
      `--texte-faible` relevé jusqu'à se confondre avec `--texte-doux` ne
      corrigerait rien
- [ ] Le test couvre **tous** les jetons de texte, pas seulement celui-ci :
      sinon le prochain jeton ajouté échappera à la mesure
- [ ] Suite verte, compte de cas strictement supérieur à l'entrée
- [ ] Validation par mutation : décaler un jeton d'un cran sous le seuil doit
      faire mourir le test

## Hors périmètre

- Les couleurs d'identité d'agent et les jetons sémantiques : `feature-015` les
  mesure déjà.
- Toute refonte de la hiérarchie typographique.
