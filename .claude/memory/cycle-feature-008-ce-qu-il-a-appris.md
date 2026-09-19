---
name: cycle-feature-008-ce-qu-il-a-appris
description: "Quatre défauts réels sur feature-008, aucun trouvé par relecture — et une campagne de mutation sincère qui passait à côté de trois gardes"
metadata: 
  node_type: memory
  type: project
  originSessionId: 037e5b4a-b565-49f7-85ea-9de58365dec4
  modified: 2026-09-19T18:07:31.018Z
---

Cycle `feature-008` (création de spec depuis le tableau de bord), livré le
2026-09-19. Baseline 1627 cas / 21 fichiers → **1817 cas / 23 fichiers**.
Cinq reboucles.

## Muter la garde n'est pas muter ce qu'elle appelle

La leçon la plus rentable du cycle. Une première campagne a annoncé
**10 mutants sur 10 tués**, sincèrement. Elle mutait les *fonctions appelées*
par les gardes, pas les *gardes elles-mêmes*.

- Inverser `vcs.chemin_sur` casse aussi les chemins légitimes → ça meurt
  bruyamment, **pour la mauvaise raison**.
- Neutraliser la garde par `if False:` n'ouvre **que** le cas hostile — que
  personne ne couvrait.

Résultat : **trois gardes déclarées tuées n'étaient tenues par aucun test**,
dont le **confinement d'écriture**, la garde centrale du lot. Le GATE P2 l'avait
vérifiée à la main, donc elle fonctionnait ; elle était simplement livrée sans
filet.

**À faire** : muter au **point de décision** (`if <garde>:` → `if False:`), pas
la fonction qu'il appelle. Puis appliquer la même question à toutes les gardes
de la même famille — ça en a trouvé deux de plus ici.

Voir [[un-correctif-tardif-doit-rouvrir-les-tests]] et
[[le-defaut-se-trouve-en-executant]].

## Une garde placée après ce qu'elle protège ne protège rien

`os.open(O_EXCL)` précédait `contenu.encode("utf-8")`. Un substitut isolé
(`"\ud800"`, JSON valide que `JSON.stringify` peut produire) levait
`UnicodeEncodeError` **après** création : fichier **vide** laissé dans `todo/`,
**numéro brûlé**. `O_EXCL` et le flock étaient corrects ; l'encodage était du
mauvais côté de l'opération qu'ils devaient couvrir.

## Un test en sous-chaîne ne tient pas une garde de verbatim

Deux tests gardaient « le Markdown relu est écrit tel quel ». Ils cherchaient
une **sous-chaîne**. Le mutant qui régénérait le contenu leur **survivait** :
en régénérant, le texte corrigé était réinjecté dans une section « Description »
fraîche, donc la sous-chaîne restait présente. Remplacés par une **égalité
octet pour octet**.

## Paralléliser deux bouts d'un même contrat

J'ai lancé backend et frontend en parallèle. Les briefs figeaient les
**réponses** des routes, pas les **corps de requête**. Les deux agents ont
convergé en se relisant sur le disque, sans signal : **deux réécritures
complètes du backend**, puis une rupture d'intégration à rattraper.

Pire : j'ai ensuite dispatché `backend-developer` et `test-engineer` en
parallèle **sur le même fichier de test**. Pas de perte au final, mais de la
flakiness observée par les deux.

**À faire** : figer les corps autant que les réponses, et ne jamais mettre deux
agents en écriture sur un même fichier.

## Ce qui a trouvé les défauts

Aucun des quatre défauts n'a été trouvé par relecture de code. Un par un agent
qui se branchait sur un contrat, un par une exécution ciblée, un par un audit
qui exécutait au lieu de lire, un par une mutation bien placée. Les 1796 tests
verts du moment n'en voyaient aucun — et pour l'un d'eux, les tests validaient
consciencieusement le comportement défectueux.
