# Bug — les suites `tests/` sont encore énumérées à la main, sur les deux forges

## Métadonnées
- **ID** : bug-021
- **Slug** : les-suites-unittest-sont-encore-enumerees-a-la-main
- **Type** : bug
- **Statut** : todo
- **Priorité** : normale
- **Dernière mise à jour** : 2026-09-21
- **Spec(s) liée(s)** : **`bug-019`**, qui a corrigé le **même mécanisme** pour
  `control-center/` et a explicitement laissé ce périmètre-ci de côté

> Né d'un constat de `bug-019` qui ne vivait **que** dans une spec en partance
> pour `done/` — relevé par `code-reviewer` à la revue finale. Sans cette spec,
> le constat disparaissait avec elle.

## Agents requis
- [x] spec-reader · [x] architect · [x] test-engineer · [x] code-reviewer · [x] doc-writer
- [ ] security-reviewer — aucune surface d'authentification touchée
- [ ] backend-developer, frontend-developer, ux-ui-designer, debugger

## Symptôme observé

`bug-019` a établi qu'une **énumération manuelle** de fichiers de test laisse
tomber en silence ce qu'elle n'énumère pas : GitLab lançait **6 fichiers sur
23** et était verte pour cette seule raison. Le correctif a remplacé
l'énumération par une découverte — **pour `control-center/` uniquement**.

Le même mécanisme subsiste pour les suites `unittest` de `tests/` : **trois**
fichiers énumérés à la main, **sur chacune des deux forges**.

| forge | fichiers énumérés |
|---|---|
| `.github/workflows/hygiene-specs.yml` | `tests/test_update_kit.py`, `test_harnais_kit.py`, `test_sync_copilot_agents.py` |
| `.gitlab/ci/hygiene.yml` | les mêmes trois |

## Cause racine

Le même patron que `bug-019` : `if [ -f <chemin> ]; then … else echo "absent —
rien à lancer." fi`. Un fichier absent de la liste n'est jamais lancé, et la
branche `else` n'existe que pour les fichiers **déjà listés**.

## Pourquoi ce n'est pas urgent, et pourquoi ça mérite quand même une spec

⚠️ **Les deux forges énumèrent les MÊMES trois fichiers.** Cette symétrie est
ce qui distingue ce défaut de `bug-019` : elle ne produit **aucun écart entre
les forges**, donc aucun des deux ne peut être vert pendant que l'autre est
rouge. Le danger n'est pas actuel, il est **futur** : un quatrième fichier
ajouté sous `tests/` ne sera lancé par personne, et rien ne le signalera.

Le dépôt a déjà payé exactement ce scénario. Le commentaire de
`.github/workflows/` le dit : « une énumération manuelle a déjà laissé
`control-center/backend/test_agents.py` (24 cas verts) hors CI sans que rien ne
le signale. »

## Correctif attendu

Découvrir au lieu d'énumérer, comme `bug-019` l'a fait pour `control-center/`.

⚠️ **Deux différences à traiter, qui font que ce n'est pas un copier-coller** :

1. Ce sont des suites **`unittest`**, lancées par `python3 -m unittest discover`,
   pas des scripts autonomes. La découverte doit produire un motif que
   `unittest discover` accepte, ou lancer les fichiers un par un.
2. `tests/` est un **chemin conditionnel du kit** : un projet consommateur peut
   ne pas l'avoir. L'absence de répertoire doit rester un succès silencieux,
   comme aujourd'hui — mais un répertoire **présent et vide de tests** doit
   échouer, exactement comme dans `bug-019`.

⚠️ **Ce que le correctif ne doit pas être** : ajouter les fichiers manquants à
la main. C'est le mécanisme qui est le défaut, pas son contenu.

Constat annexe relevé par la revue finale de `bug-019` : le bloc de découverte
existe désormais en **trois copies** — GitLab, le job GitHub système, le job
GitHub de matrice — et **une seule est gardée par un test**. `PIEGES` §21 dit
qu'une énumération dupliquée diverge. À traiter ici ou à nommer comme reporté.

## Grandeurs mesurées
- `énumérations manuelles restantes` = **3 par forge**, **6 au total** — mesuré
  le 2026-09-21 par `grep -n "if \[ -f .*test_.*\.py \]"` sur les deux fichiers
- `écart entre forges produit par ce défaut` = **0** — les deux listes sont
  identiques
- `copies du bloc de découverte` = **3**, dont **1** gardée par un test

## Critères d'acceptation
- [ ] Aucune énumération manuelle de fichier de test ne subsiste dans le dépôt —
      c'est le critère que `bug-019` n'a **pas pu cocher**, et qui se ferme ici
- [ ] Un fichier de test neuf sous `tests/` est lancé **sans modifier aucun
      fichier de CI** — vérifié en en ajoutant un jetable
- [ ] Un répertoire `tests/` présent mais sans test **fait échouer** le job
- [ ] Un répertoire `tests/` absent reste un succès silencieux
- [ ] Les deux forges lancent le **même** ensemble, mesuré et non supposé
- [ ] Les gardes neuves sont **vues mourir** par mutation

## Hors périmètre
- `control-center/` : fait par `bug-019`
- Le passage des suites `tests/` à des scripts autonomes : les deux styles
  coexistent par choix (`PIEGES` §6)
