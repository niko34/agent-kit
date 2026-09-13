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

> ⚠️ **Ce bloc a été entièrement réécrit le 2026-09-13.** Sa rédaction d'origine
> reposait sur un mécanisme que les relevés réels **réfutent**. Le texte
> antérieur affirmait que « `SessionEnd` marque la fin du tour, pas la mort de
> la session » et que « le runtime en émet un à chaque fin de tour ». C'est
> faux. Conservé ici comme diagnostic invalidé, conformément à la règle
> d'honnêteté documentaire du kit.

### Ce que les deux journaux établissent

Relevé du 2026-09-13 sur **les deux dépôts instrumentés**, et recoupé avec
`claude agents --json` :

| Session | `Stop` | `SessionEnd` | État réel |
|---|---|---|---|
| `0a51b0a1` (agent-kit) | 0 | **1** | morte |
| `dc11d595` (agent-kit) | 1 | **1** | morte |
| `602ebd5c` (agent-kit) | 68 | **0** | **vivante** (`busy`) |
| `12156c3b` (esp32-pool-controller) | 75 | **0** | **vivante** (`idle`) |

**Trois conclusions, toutes établies par exécution :**

1. **`SessionEnd` n'est PAS émis par tour.** 68 et 75 tours respectivement,
   zéro `SessionEnd`. L'affirmation inverse, écrite dans la mémoire de projet
   et reprise par la première version de cette spec, est fausse.
2. **`SessionEnd` marque bien la mort réelle de la session.** Les deux seules
   sessions qui l'ont émis sont mortes ; les deux vivantes ne l'ont pas émis.
   Le comportement est **correct**.
3. **Aucune session vivante n'est affichée comme close**, dans aucun des deux
   journaux — puisque aucune n'a émis de `SessionEnd`. **Le symptôme décrit par
   cette spec n'est reproductible nulle part avec les données disponibles.**

### Ce qui reste possible, et non vérifié

L'observation d'origine mentionnait une session **détachée** (`claude --bg`).
Or les deux sessions vivantes relevées sont `kind: "interactive"` — **aucune
donnée n'existe sur le mode détaché**. Il reste donc concevable qu'une session
lancée en `--bg` émette `SessionEnd` en restant vivante, ce qui produirait
exactement le symptôme décrit.

**Cette hypothèse n'est ni confirmée ni infirmée** : elle n'a jamais été
éprouvée. La distinction compte — ce n'est pas « le bug n'existe pas », c'est
« le bug n'est pas reproductible avec ce qu'on a, et le mécanisme qu'on lui
prêtait est faux ».

### Ce qu'il faut faire avant de lancer ce cycle

Lancer délibérément une session `claude --bg`, la laisser finir un tour, et
observer si un `SessionEnd` apparaît alors qu'elle vit encore. Tant que ce
relevé n'existe pas, cette spec n'a pas de symptôme établi et ne doit pas être
promue.

### Troisième objection : le correctif proposé casserait l'isolement des dépôts

Relevé du 2026-09-13, sur demande de l'utilisateur.

**Les journaux sont isolés aujourd'hui, et c'est une propriété à préserver :**

| Journal | Événements | `cwd` observés |
|---|---|---|
| `agent-kit` | 1852 | `/root/agent-kit` uniquement |
| `esp32-pool-controller` | 770 | `/root/esp32-pool-controller` uniquement |

Chaque journal n'est écrit que par les hooks du dépôt où tourne la session —
« c'est le répertoire de LANCEMENT qui compte ». Aucune fuite.

**Or le correctif proposé par cette spec (point 2) la casserait.** Il prévoit
de rapprocher le journal de `claude agents --json`, qui dit « ce qui vit ». Mais
cette commande est **à l'échelle de la machine** :

```
12156c3b…  idle    cwd = /root/esp32-pool-controller
602ebd5c…  busy    cwd = /root/agent-kit
```

Le tableau de bord du kit se mettrait donc à consulter — et potentiellement à
afficher — l'état d'une session appartenant à un autre projet. **Un centre de
contrôle ne doit rien savoir d'un dépôt qui n'est pas le sien.**

Un filtrage par `cwd` serait possible, mais il introduirait une dépendance à une
commande externe, à l'échelle machine, pour obtenir une information que le
journal local ne porte pas — au prix de la propriété d'isolement qui tient
aujourd'hui par construction.

### Bilan : trois objections, dont deux fatales

1. **Le symptôme n'est reproductible nulle part** avec les données disponibles.
2. **Le mécanisme qu'on lui prêtait est faux** — `SessionEnd` n'est pas émis par
   tour et marque bien la mort réelle.
3. **Le correctif proposé casserait l'isolement entre dépôts.**

S'y ajoute une remarque de fond de l'utilisateur : **« la session n'est sans
doute pas le bon axe »**. C'est cohérent avec ce que `bug-004` vient
d'établir — on est passé des sessions aux **segments** parce que la session
n'était pas la bonne unité de récit.

Et l'affichage actuel est en réalité **déjà honnête** : « sans fin observée »
n'affirme ni que la session vit, ni qu'elle est morte. Il dit que le journal
n'enregistre pas de fin — ce qui est exact, et conforme à la doctrine du module
(« jamais un récit plus affirmatif que les événements »).

### Recommandation

**Clôturer cette spec sans code**, comme décision de ne pas faire. Le kit le
prévoit explicitement : `done/` « archive aussi les décisions de NE PAS faire ».

Ce qui mériterait éventuellement une spec neuve, sur un axe différent : rendre
visible qu'un segment **sans fin observée** peut être soit en cours, soit
interrompu — sans jamais interroger l'extérieur du dépôt.

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

---
# Statut final

✅ **Clos le 2026-09-13 — DÉCISION DE NE PAS FAIRE.** Aucune ligne de code
écrite, et c'est le résultat.

> Les sections « Correctif attendu » et « Critères d'acceptation » ci-dessus
> sont conservées telles qu'elles ont été écrites. Elles décrivent une solution
> qui ne sera pas mise en œuvre, pour les trois raisons établies plus haut. Le
> kit corrige par addendum daté, jamais par réécriture — et une spec close
> raconte ce qui s'est vraiment passé, y compris quand ce qui s'est passé est
> un renoncement.

## Pourquoi

1. **Le symptôme n'est reproductible nulle part.** Quatre sessions relevées sur
   deux dépôts instrumentés, recoupées avec `claude agents --json` : aucune
   session vivante n'a émis de `SessionEnd`, donc aucune n'est affichée close à
   tort.
2. **Le mécanisme qu'on lui prêtait est faux.** `SessionEnd` n'est pas émis par
   tour — 68 et 75 tours dans les deux sessions vivantes, zéro occurrence — et
   marque bien la mort réelle. Le comportement du runtime est **correct**.
3. **Le correctif proposé aurait cassé l'isolement entre dépôts.** Il reposait
   sur `claude agents --json`, commande à l'échelle de la **machine** : le
   tableau de bord du kit se serait mis à consulter l'état d'une session
   appartenant à un autre projet. Objection soulevée par l'utilisateur, et
   décisive — un centre de contrôle ne doit rien savoir d'un dépôt qui n'est
   pas le sien.

## Ce que ce cycle a produit sans écrire de code

- **Une affirmation fausse retirée de la mémoire de projet.** La note
  `pieges-du-runtime-sur-les-sous-agents` a été corrigée : elle propageait
  depuis le 2026-09-12 l'idée que `SessionEnd` marque la fin du tour.
- **Une contrainte d'architecture explicitée** : l'isolement des journaux entre
  dépôts tient aujourd'hui **par construction** (chaque journal n'est écrit que
  par les hooks du dépôt où tourne la session, aucune fuite mesurée sur 2622
  événements). Toute future source d'information à l'échelle machine la
  romprait. À opposer à la prochaine spec qui voudra savoir « ce qui vit ».
- **Le constat que l'affichage actuel est déjà honnête** : « sans fin
  observée » n'affirme ni vie ni mort, il dit que le journal n'enregistre pas
  de fin. C'est exact, et conforme à la doctrine du module — « jamais un récit
  plus affirmatif que les événements ». Le défaut supposé venait d'une attente
  mal posée, pas d'un mensonge de l'outil.

## Si le sujet revient

Ce qui mériterait une spec neuve, **sur un autre axe** : rendre visible qu'un
segment sans fin observée peut être soit en cours, soit interrompu — **sans
jamais interroger l'extérieur du dépôt**. Et si quelqu'un veut rouvrir la
question des sessions détachées, il lui faudra d'abord un relevé : lancer un
`claude --bg`, lui faire finir un tour, et constater si un `SessionEnd` apparaît
alors qu'elle vit encore. Ce relevé n'existe pas.
