---
name: un-faux-secret-sur-peut-etre-le-mauvais
description: "Un faux secret conforme aux règles de sûreté peut être écarté par une garde EN AMONT de celle qu'il prétend éprouver"
metadata:
  type: feedback
---

Sur `bug-014` (rédaction des secrets du collecteur), la consigne de sûreté était
« faux secrets COURTS uniquement » — au-delà de 24 caractères, le plafond de longueur
les écarte avant la garde visée. Consigne **nécessaire et insuffisante**.

Le faux secret `Pw4x` respectait la règle : 4 caractères, largement sous le plafond.
Mais sa **majuscule et son chiffre** le faisaient écarter par `_MOT_NU` — une garde
située **en amont** de celle que le test prétendait éprouver. Résultat : **4 tests**
censés couvrir la classe « mot de passe entièrement en minuscules » — le titre même
du bug — ne l'exerçaient **jamais**. Trois étaient verts sur le code d'avant le
correctif, tout en affirmant en commentaire avoir été « vus échouer ».

Aucune relecture ne l'a trouvé. C'est **la mutation** qui l'a révélé : le mutant
« ajouter `echo` à la liste blanche » ne tuait rien. Puis la revue en a nommé 3, et
un **balayage complet** du fichier en a sorti un 4ᵉ que personne n'avait vu.

**Pourquoi :** une donnée de test se valide contre **la garde qu'elle vise**, pas
contre la liste générale des règles de sûreté. Un fixture peut être conforme et inerte.

**Comment l'appliquer :** pour chaque faux secret, écrire **quelle garde précise** il
doit franchir et laquelle il doit heurter, puis le vérifier en exécutant contre le
code d'avant. Et ne jamais corriger un tel défaut là où il a été remarqué : le
balayer sur tout le fichier — voir [[le-defaut-se-trouve-en-executant]] et
[[cycle-feature-008-ce-qu-il-a-appris]].
