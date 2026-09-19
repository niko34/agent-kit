---
name: un-oracle-exhaustif-prouve-la-conformite
description: "Une énumération exhaustive contre un oracle prouve la conformité règle↔code, jamais l'absence du défaut"
metadata:
  type: feedback
---

Sur `bug-014`, après cinq formes de fuite trouvées à cinq échelons successifs, le
`security-reviewer` a cessé de chercher des exemples : il a posé un **oracle** (à
quelles conditions un jeton de sortie est légitime) et **énuméré 1 082 400 commandes**.
Zéro jeton hors oracle. Le `code-reviewer` a réimplémenté l'oracle et réénuméré
indépendamment : même résultat.

C'est la bonne méthode — et elle a failli être sur-déclarée. La réserve, écrite dans
l'ADR-0028 :

- deux clauses de l'oracle **promeuvent en « légitimes » les résidus qu'on avait
  décidé d'assumer**. Par construction, l'énumération ne peut donc pas trouver une
  forme qui vit **à l'intérieur** de l'oracle ;
- une clause s'adossait à une **observation du passé** (« les têtes à un jeton
  observées sont toutes des noms de programme »), pas à une propriété. Un contre-exemple
  hors de l'alphabet énuméré la traversait.

Donc : « zéro jeton hors oracle » s'écrit **« zéro divergence règle↔implémentation »**,
jamais « plus de fuite ».

**Pourquoi :** un oracle est une **définition**, pas une observation. C'est le seul
endroit d'un cycle où une preuve peut être exhaustive et creuse à la fois — et une
fermeture annoncée sur un oracle complaisant est le défaut d'origine de ce bug, d'un
cran plus sophistiqué.

**Comment l'appliquer :** faire **relire l'oracle par un autre agent que celui qui
l'a écrit**, clause par clause, en demandant explicitement lesquelles absolvent un
résidu connu. Et énoncer la portée exacte dans l'ADR. Voir
[[une-justification-ne-vaut-que-refutee]] et [[une-garde-se-livre-atteignable]].
