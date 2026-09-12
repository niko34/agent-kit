# Bug — une session encore vivante est affichée comme close par le tableau de bord

- **Type** : bug (format minimal `specs/modele.md`)
- **Version cible** : 0.7.0
- **Créée** : 2026-09-12 (constaté en branchant les hooks du collecteur sur des
  sessions détachées ; défaut connu, non corrigé à la livraison de l'étape C)
- **Domaine** : centre de contrôle — `control-center/backend/events.py` et
  l'affichage des workflows. Ni auth, ni données personnelles touchées.
- **Spec liée** : feature-001 (le collecteur et la reconstruction),
  feature-002 (le tableau de bord qui affiche le résultat), feature-010 (le
  scénario de bout en bout qui l'exercera systématiquement)

## Agents requis

- [x] debugger
- [ ] **security-reviewer, rôle GATE** — non coché : aucun chemin sensible.
      Le défaut porte sur la fidélité d'un affichage, pas sur un accès
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

Le tableau de bord affiche une session comme **terminée** alors qu'elle est
toujours vivante et disponible. Une session détachée (`claude --bg`) émet
`SessionEnd` à la fin de son tour, puis reste en vie, à l'état `idle`, prête à
recevoir un nouveau message. Le récit reconstruit, lui, la range parmi les
workflows clos.

```
Tableau de bord :   workflow 12156c3b…  ● terminé   (SessionEnd à 13:41:18.535Z)
Réalité :           claude agents --json  →  { "id": "12156c3b…", "state": "idle" }
```

> **Provenance de ce relevé** : reconstitué à partir des notes de la session
> du 2026-09-12, qui a observé le comportement sans conserver la sortie
> exacte. **Première tâche du cycle : reproduire et coller ici la sortie
> réelle** — l'événement `SessionEnd` du journal d'un côté, la sortie de
> `claude agents --json` de l'autre, horodatées.

**Scénario de reproduction (à confirmer)** : lancer une session détachée dans
un dépôt instrumenté, la laisser finir son tour, ouvrir le tableau de bord.
Le workflow apparaît clos ; la session répond pourtant encore.

## Cause racine

`SessionEnd` du runtime Claude Code marque la **fin du tour**, pas la mort de
la session. C'est un comportement non documenté, observé sur le terrain le
2026-09-12 — le troisième de la même famille, après les deux anomalies de
`SubagentStop` déjà traitées par feature-001 (`agent_type` vide, et des
fermetures sans ouverture correspondante).

La reconstruction (`control-center/backend/events.py`) interprète `SessionEnd`
comme une clôture définitive, parce que c'est le seul signal de fin dont elle
dispose. Le journal ne peut pas dire autre chose : **il enregistre ce qui
s'est passé, pas ce qui vit encore**. Aucun événement n'est émis quand une
session détachée reste disponible, et aucun ne l'est non plus lorsqu'elle
meurt réellement.

La conséquence dépasse l'affichage : c'est la même confusion qui ferait
croire, à l'étape D, qu'un écrivain a rendu son verrou alors qu'il tient
toujours l'arbre de travail.

## Correctif attendu

1. Distinguer dans le récit **« tour terminé »** de **« session terminée »**.
   Le premier est ce que `SessionEnd` atteste réellement ; le second demande
   une autre source.
2. Rapprocher deux sources de vérité, comme le fait déjà le module pour les
   specs (le répertoire fait foi, le champ « Statut » informe — ADR-0003) :
   `claude agents --json` dit **ce qui vit**, le journal dit **ce qui s'est
   passé**. `architect` tranche la forme du rapprochement, et notamment si
   l'appel est fait à la demande ou périodiquement.
3. En l'absence de cette seconde source — binaire absent, commande en échec,
   format inattendu — l'état affiché doit être **indéterminé**, jamais
   « terminé » par défaut. Le module applique déjà cette règle ailleurs :
   « je ne sais pas lire ce statut » n'est jamais confondu avec « ils se
   contredisent ».
4. Le tableau de bord distingue visuellement les trois états : en cours, tour
   terminé mais session vivante, session morte.

## Critères d'acceptation

- [ ] Dans le scénario de reproduction, une session détachée encore vivante
      n'est plus affichée comme terminée
- [ ] Une session réellement morte est, elle, affichée comme terminée
- [ ] Sans seconde source disponible, l'état est **indéterminé** et le dit ;
      il ne retombe jamais sur « terminé »
- [ ] Aucun appel à une commande externe ne peut faire échouer la lecture du
      journal : le tableau de bord reste consultable même si
      `claude agents --json` est indisponible
- [ ] Aucun chemin sensible (auth, permissions, données personnelles) touché
- [ ] Suite de tests verte, avec un test de non-régression couvrant ce bug
- [ ] Le test de non-régression a été **vu échouer sur le code d'avant le
      fix** — sinon il ne protège rien
- [ ] Lint propre, pas de warning nouveau

## Hors périmètre

- L'ajout d'un hook ou d'un événement nouveau côté runtime : on lit ce que le
  runtime donne, on ne lui demande rien de plus
- La reprise ou la fermeture d'une session depuis l'interface — ce serait une
  route d'écriture, donc feature-007 et ses garde-fous
- Les deux anomalies de `SubagentStop`, déjà traitées par feature-001
