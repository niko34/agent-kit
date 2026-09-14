# Bug — un agent tué par le runtime reste « en cours » indéfiniment dans le tableau de bord

- **Type** : bug (format minimal `specs/modele.md`)
- **Version cible** : 0.8.0
- **Créée** : 2026-09-14 — **relevé par l'utilisateur en usage réel**, sur son
  propre tableau de bord, 22 heures après les faits
- **Domaine** : centre de contrôle — `control-center/backend/events.py` (la
  reconstruction des cycles), `control-center/web/app.js` (le rendu).
  Ni auth, ni données personnelles, aucune écriture.
- **Spec liée** : `feature-010` (scénario de bout en bout **avec échec réel** —
  c'est exactement la classe de défaut qu'elle existe pour débusquer),
  `ADR-0002` (graphe d'exécution plat), `ADR-0014` (bornage par marqueur déclaré)

## Agents requis

- [x] debugger
- [ ] **security-reviewer, rôle GATE** — non coché : aucun des cinq
      déclencheurs. Lecture seule, aucune donnée personnelle
- [x] architect — l'état neuf est une décision de contrat, pas un détail de rendu
- [x] ux-ui-designer — un état de plus dans une liste d'états déjà rendue
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

**Relevé par exécution le 2026-09-14**, dans le journal réel du dépôt :

```
test-engineer  afa8010143f2
  2026-09-13T19:11:54Z  SubagentStart
  (aucun SubagentStop — jamais)
```

L'agent a été **tué par le runtime** (limite de session atteinte). Il n'a donc
jamais eu l'occasion d'émettre son événement de fin. Le tableau de bord l'affiche
toujours « en cours », **22 heures plus tard**.

Constat plus large, dans le même relevé :

```
SubagentStart : 123      SubagentStop : 1359
1237 Stop sur 1359 ne portent AUCUN agent_type
```

Les deux familles d'événements ne s'apparient ni en **nombre**, ni en
**nommage**. L'appariement ne tient que par `agent_id` — et il ne peut rien
contre une fin qui **n'arrive jamais**.

## Cause racine

**Le tableau de bord ne ment pas : il rapporte fidèlement le dernier fait connu.**
Simplement, personne ne lui a dit la suite, et il n'a aucun moyen de la déduire.

Un agent peut disparaître sans clôture pour au moins trois raisons, toutes hors
de son contrôle : limite de session atteinte, processus tué, machine arrêtée.
Dans les trois cas, `SubagentStop` n'est jamais écrit.

Le modèle actuel n'a que deux états — **ouvert** ou **fermé** — et fait donc
entrer « mort sans clôture » dans « en cours ». C'est la seule case disponible,
et c'est la mauvaise.

## Correctif attendu

`architect` tranche et **écrit son choix**. Deux pistes, qui ne s'excluent pas :

1. **Une borne de fraîcheur.** Un agent « en cours » sans **aucun** événement
   depuis un seuil n'est plus en cours : il est **abandonné**. Le seuil doit être
   déclaré, pas codé en dur, et sa valeur justifiée — un cycle légitime peut
   durer longtemps (mesuré sur ce dépôt : jusqu'à **36 minutes** entre le début
   et la fin d'un `test-engineer`). Un seuil trop court accuserait des agents
   vivants.
2. **Un état à part entière.** « Interrompu sans clôture » n'est ni un succès ni
   un échec du travail : c'est une **fin sans annonce**. Le confondre avec
   « en cours » fait croire qu'on attend quelque chose ; le confondre avec
   « échoué » impute à l'agent un défaut qu'il n'a pas commis.

⚠️ **Ne pas fermer un agent réellement vivant.** C'est le risque symétrique, et
il est pire : un cycle long affiché comme abandonné pousserait à le relancer,
donc à lancer deux fois le même travail.

⚠️ **Ne pas déduire la mort de l'absence de `SubagentStop` seule** : `1237` Stop
sur `1359` arrivent sans `agent_type`, l'appariement est déjà fragile. La borne
doit porter sur **l'activité observée**, pas sur l'absence d'un événement
particulier.

## Critères d'acceptation

- [ ] Un agent dont le dernier événement remonte au-delà du seuil n'est plus
      affiché « en cours »
- [ ] L'état neuf est **distinct** de « terminé » et de « échoué » — il dit une
      fin **sans clôture**, pas un verdict sur le travail
- [ ] Le seuil est **déclaré** dans la configuration, jamais codé en dur, et sa
      valeur par défaut est justifiée par une mesure
- [ ] Un agent **réellement en cours** depuis longtemps n'est **jamais** requalifié
      — cas de test explicite, avec une durée supérieure à la plus longue mesurée
      sur ce dépôt
- [ ] Le cas de `test-engineer afa8010143f2` (2026-09-13T19:11:54Z, sans fin)
      est couvert par un test sur des événements réels
- [ ] Les compteurs de cycles ne comptent pas un agent abandonné comme actif
- [ ] Suite verte, compte de cas strictement supérieur à l'entrée
- [ ] Matrice de mutation ; le seuil doit être muté (raccourci **et** allongé)

## Notes pour agent

- **Ce défaut a été trouvé par l'utilisateur, en regardant son écran** — ni par
  un test, ni par un audit, ni par une revue. Il était visible depuis 22 heures.
- `feature-010` — le scénario de bout en bout **avec un échec réel** — est
  précisément le cycle dont l'objet est de débusquer cette classe de défaut.
  Si elle est traitée avant, elle devrait retrouver celui-ci toute seule ; sinon,
  c'est qu'elle ne couvre pas ce qu'elle prétend.
- Les événements de hooks sont des **métadonnées**, jamais du contenu : le
  collecteur ne recopie que huit champs plafonnés. Ne pas chercher à enrichir le
  journal pour résoudre ce bug — il a déjà connu deux chemins de fuite de mot de
  passe, et son bornage est délibéré.

## Hors périmètre

- L'asymétrie `SubagentStart` / `SubagentStop` et les `Stop` sans `agent_type` :
  ce sont des faits du runtime, pas des défauts du kit. À **contourner**, pas à
  corriger.
- Le pilotage des coûts, la reprise d'orphelin (`bug-011`), le freinage
  (`bug-010`)

---

## ⏸ État au 2026-09-14 — implémentée, non clôturée

**Absorbée dans le cycle `feature-010`** au titre d'ADR-0017 : une session longue
n'émettant **jamais** `SessionEnd` (mesuré), ses passages s'affichaient
indéfiniment ouverts — or `feature-010` s'engage, dans ses cas limites, sur
« le récit ne doit pas afficher un passage ouvert pour toujours ».

**Le code est livré et vérifié** (backend et frontend, **471 → 512 cas**) :
horloge **injectée** (`reconstruire` reste pure, aucun `time.time()` interne),
état additif `etat ∈ {termine, en_cours, sans_cloture}`, `derniere_activite`
rafraîchie à **tout** événement rattaché, seuil **déclaré** en configuration
(`[workflows] seuil_abandon_minutes`, défaut **120**, borné `[60, 10080]`),
`actifs` ignorant les passages sans clôture, rendu gris pointillé du registre
**fait signalé** — jamais accusation.

**Reste à faire** : revue, documentation, **ADR** (l'état neuf est une décision
de contrat, le seuil déclaré un verrouillage), et clôture **conjointe** avec
`feature-010`, une seule phase test/revue/doc pour les deux.

⚠️ **Le seuil de 120 min ne vient pas de la durée maximale** (24 min mesurées,
36 retenues en borne haute) mais du **silence légitime** : un `architect` a
n'émis **qu'un seul appel d'outil en 127 secondes**. Accuser un agent vivant
coûte plus cher qu'afficher trop longtemps un agent mort — on relancerait un
travail en cours.
