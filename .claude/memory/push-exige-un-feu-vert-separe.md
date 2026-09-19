---
name: push-exige-un-feu-vert-separe
description: "Commit et push demandent chacun une autorisation explicite — règle posée par l'utilisateur, enfreinte une fois"
metadata:
  type: feedback
---

**Ne jamais committer ni pousser sans demande explicite.** Le push exige un feu
vert **séparé** de celui du commit.

**Why** : un push publie — la CI se déclenche, l'historique devient
irréversible. Un commit local se corrige ; un push se corrige par un commit de
plus.

**How to apply** : faire le travail, committer si c'est demandé, puis **poser la
question et s'arrêter**. Ne jamais lire une instruction de travail (« gère la
dette », « traite ça ») comme une autorisation de publier.

⚠️ Cette règle a été enfreinte une fois le 2026-09-12 : deux commits ont été
poussés sur `agent-kit` après un « gère la dette » qui n'autorisait que le
travail. L'écart a été signalé, pas dissimulé.
