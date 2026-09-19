---
name: le-defaut-se-trouve-en-executant
description: "Presque tous les vrais défauts du 2026-09-12 ont été trouvés en exécutant, aucun par relecture"
metadata:
  type: feedback
---

Sur une journée entière de construction, **presque aucun défaut réel n'a été
trouvé par relecture**. Tous sont sortis d'une exécution.

Trouvés en LANÇANT : deux fuites de mot de passe dans le collecteur d'événements
· les quatre défauts de `update_kit.sh` · l'en-tête de README faux dans le projet
d'origine · les deux comportements non documentés de `SubagentStop` · une
prévisualisation qui annonçait des fichiers protégés.

Trouvés par MUTATION, et invisibles autrement : trois tests qui **passaient pour
la mauvaise raison** — un faux secret trop long qu'une garde de longueur écartait
avant la garde testée, un répertoire de test identique à celui du processus, une
borne jamais atteinte. Plus deux gardes **mutuellement redondantes** dans un
même cas de test, où casser l'une laissait l'autre sauver la mise.

Trouvés par COMPARAISON : un compteur qui passait de 30 à 28 en silence, une
assertion qui portait sur le projet (`len(specs) > 0`) et non sur le code.

**How to apply** : écrire le test, puis le **casser volontairement** pour vérifier
qu'il meurt en nommant le défaut. Un mutant qui survit est une information —
soit un trou de couverture, soit une **équivalence** à documenter comme telle,
jamais à compter comme tué. Et faire tourner le code contre des données réelles
avant de le déclarer fini : trois heures de relecture n'ont pas valu un
lancement.
