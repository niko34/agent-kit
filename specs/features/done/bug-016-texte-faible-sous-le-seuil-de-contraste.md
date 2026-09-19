# Bug — `--texte-faible` est sous le seuil de contraste, dans le thème sombre

- **Type** : bug
- **Statut** : done
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

Relever `--texte-faible` jusqu'à **au moins 4,5:1** contre `--fond`,
`--surface`, `--surface-2` et `--creux` — les **quatre** surfaces, pas
seulement celle sur laquelle on l'a regardé. (`--surface-2` n'apparaissait pas
encore dans ce relevé initial ; c'est contre elle que le pire cas a été
mesuré — 3,55:1 — voir `feature-019`, qui absorbe et traite ce défaut.)

⚠️ **Dans les deux thèmes.** `feature-015` livre un thème clair ; le jeton clair
doit être mesuré au même titre, et rien ne garantit qu'il passe.

⚠️ Vérifier au passage `--texte-doux` : il n'a pas été mesuré non plus. Une spec
qui corrigerait un seul des deux niveaux sans regarder l'autre referait l'erreur
qu'elle corrige.

## Critères d'acceptation

- [x] `--texte-faible` ≥ 4,5:1 contre `--fond`, `--surface`, `--surface-2` et `--creux`, dans
      les **deux** thèmes, vérifié par un test qui **calcule** le contraste
      depuis les jetons
- [x] `--texte-doux` mesuré et, s'il est sous le seuil, corrigé dans le même lot
- [x] La hiérarchie visuelle des trois niveaux de texte reste lisible — un
      `--texte-faible` relevé jusqu'à se confondre avec `--texte-doux` ne
      corrigerait rien
- [x] Le test couvre **tous** les jetons de texte, pas seulement celui-ci :
      sinon le prochain jeton ajouté échappera à la mesure
- [x] Suite verte, compte de cas strictement supérieur à l'entrée
- [x] Validation par mutation : décaler un jeton d'un cran sous le seuil doit
      faire mourir le test

## Hors périmètre

- Les couleurs d'identité d'agent et les jetons sémantiques : `feature-015` les
  mesure déjà.
- Toute refonte de la hiérarchie typographique.

---

# Clôture — 2026-09-15 — absorbée par `feature-019`

## Pourquoi dans ce cycle et pas un autre

`feature-019` applique la typographie du §4, donc elle **bâtit sur** les jetons
de texte. Livrer une hiérarchie typographique appuyée sur un jeton qu'on sait
sous le seuil, c'est livrer une règle dont on sait déjà qu'elle ne tient pas son
propre critère. Critère d'absorption d'ADR-0017 — décision écrite dans
**ADR-0024**, pas subie.

## Le défaut était plus large que ma spec ne le disait

Elle énumérait **trois** surfaces. La quatrième — omise — portait le **pire**
cas : **3,55:1**. Une correction suivant la lettre de la spec aurait visé le
seuil sur trois surfaces et **laissé le pire cas rouge**.

Amendée avant implémentation, après que l'orchestrateur l'a relevé.

## Correctif et mesure

Un seul littéral changé : `--sombre-texte-faible`, de **4,24:1** à **4,77:1**.

⚠️ La première valeur proposée donnait **4,5039 en nominal** — et **4,4454 après
arrondi d'un bit**. Elle échouait. Un bit vaut **0,0585 de ratio** sur cette
plage ; la marge retenue est de 2,5 bits. C'est le défaut « 0,10 ressorti à
0,0995 » de `feature-015`, cette fois **attrapé en amont**.

Vérifié après coup, par moi : **six jetons × quatre surfaces × deux thèmes**,
minimum **4,77:1**. `--texte` et `--texte-doux` n'ont pas bougé — ils passaient
déjà partout, et les toucher aurait écrasé la hiérarchie.

## Ce qui reste, et qui n'est pas de ce cycle

En thème clair, l'écart entre les deux niveaux de texte secondaires est d'environ
**1,2:1** — une hiérarchie à trois niveaux à peine distinguable. Relevé par la
revue, **antérieur** à ce cycle, non corrigé ici.

## Statut final
✅ Done — 2026-09-15 — commit à renseigner à la validation
