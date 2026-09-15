## Métadonnées
- **ID** : feature-018
- **Slug** : chaine-de-confiance-des-hooks-versionnes
- **Type** : feature
- **Statut** : todo
- **Priorité** : normale
- **Version cible** : [à fixer par l'agent qui reprend cette spec]
- **Dernière mise à jour** : 2026-09-15
- **Spec(s) liée(s)** : issue de l'audit `S1` de `feature-010` ; touche `ADR-0006`, `ADR-0020`

## Domaines touchés
- [x] Intégrations externes (le runtime Claude Code exécute du code du dépôt)

## Agents requis
- [x] spec-reader
- [x] architect
- [x] **security-reviewer, rôle GATE** — chemin d'exécution de code non relu
- [x] doc-writer

## Description

Nommer, dans un ADR, ce que le dépôt fait exécuter chez chaque développeur qui
l'utilise — et décider si l'on s'en contente.

## Contexte

Constat de l'audit de sécurité du 2026-09-15, étiqueté **hypothèse non vérifiée**
faute d'avoir pu éprouver le comportement du runtime :

`.claude/settings.json` est **versionné** et câble neuf hooks vers
`control-center/hooks/record-event.py`, lui aussi versionné. **Quiconque pousse
sur l'un de ces deux fichiers exécute du code dans la session Claude de chaque
développeur du projet, à chaque appel d'outil.**

C'est le même niveau de confiance que n'importe quel script d'un dépôt — un
`Makefile`, un hook git, un script de build. Ce n'est donc pas nécessairement un
défaut. Mais c'est un chemin d'exécution que **rien ne nomme aujourd'hui**, et
le kit est fait pour être **recopié dans d'autres projets** : la surface se
multiplie par le nombre de dépôts qui l'adoptent.

Ce constat est frère de `feature-011` — « la passerelle Copilot exécute du code
non relu » — déjà ouverte. Les traiter ensemble ou séparément est un arbitrage à
poser.

## Comportement attendu

Cette spec ne livre **pas de code**. Elle livre une décision écrite.

1. **Établir par exécution** ce que fait le runtime Claude Code quand les hooks
   d'un projet versionné changent : demande-t-il confirmation ? silencieusement ?
   au premier lancement seulement ? Tant que ce point n'est pas mesuré, tout le
   reste est de la conjecture.
2. **Nommer la surface** : quels fichiers versionnés sont exécutés, par quoi, à
   quelle fréquence, avec quels droits.
3. **Trancher** entre les postures, et écrire le motif du refus des autres :
   - accepter, au même titre qu'un script de build, et le **dire** dans le README
     du kit — ce qu'un projet adoptant le kit accepte en l'adoptant ;
   - restreindre le collecteur à un sous-ensemble déclaré et vérifiable ;
   - sortir les hooks du dépôt et les faire installer explicitement par le
     développeur, au prix de l'installation en une commande.
4. **Produire l'ADR** correspondant.

### Cas limites

- Un projet qui adopte le kit **sans** le centre de contrôle : les hooks sont-ils
  quand même câblés ?
- Un développeur qui tire une mise à jour du kit par `update_kit.sh` : le
  changement de hooks passe-t-il par le même chemin que tout autre fichier gelé ?
- Une forge qui exécute la CI : les hooks s'y déclenchent-ils ?

## Comportement actuel

Aucun document ne mentionne ce chemin d'exécution. `ADR-0006` traite l'absence de
dépendance **externe** ; il ne dit rien du code **interne** exécuté automatiquement.

## Contraintes techniques

- Ne rien casser du collecteur : le journal est la matière première du tableau de
  bord, et plusieurs specs closes s'appuient dessus.
- Toute mesure du runtime se fait sur un **clone jetable**, jamais dans le dépôt réel.

## Fichiers potentiellement concernés

- `.claude/settings.json`, `control-center/hooks/record-event.py` (lecture)
- `README.md`, `GUIDE.md` — ce qu'un projet accepte en adoptant le kit
- `docs/adr/NNNN-chaine-de-confiance-des-hooks-versionnes.md`

## ADR attendu ?
- **Probable** : oui
- **Critère(s) candidat(s)** : 1, 2, 3, 4
- **Sujet pressenti** : ce que le dépôt fait exécuter chez ceux qui l'adoptent, et
  pourquoi on l'accepte — ou ce qu'on change pour ne plus l'accepter.

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- aucun

### Écrans / flux UI concernés
- aucun

### Documentation à produire / mettre à jour
#### Docs transverses
- `README.md` — ce qu'un projet accepte en adoptant le kit
- `GUIDE.md` — si la posture retenue change l'installation

#### Docs immuables
- `docs/adr/NNNN-chaine-de-confiance-des-hooks-versionnes.md`

## Critères d'acceptation
- [ ] Le comportement du runtime face à un changement de hooks versionnés est
      **établi par exécution**, ou explicitement étiqueté « non mesurable, et
      voici pourquoi »
- [ ] La surface exécutée est énumérée : fichiers, déclencheurs, fréquence
- [ ] Une posture est retenue, et le motif du refus des deux autres est écrit
- [ ] L'ADR existe et est indexé
- [ ] Si la posture retenue change quoi que ce soit à l'installation, `README.md`
      et `GUIDE.md` le disent

## Plan de test manuel
1. Sur un clone jetable, modifier `control-center/hooks/record-event.py` pour
   qu'il écrive une trace inoffensive, lancer une session, observer si le runtime
   avertit.
2. Même essai en modifiant `.claude/settings.json`.
3. Adopter le kit dans un projet neuf sans centre de contrôle, vérifier ce qui est
   câblé.

## Notes pour agent

L'audit a étiqueté ce constat **« hypothèse non vérifiée »** et c'est important :
il n'a **pas** vérifié si le runtime demande confirmation. La première chose à
faire est donc de mesurer, pas de concevoir. Une spec qui déciderait d'abord et
mesurerait ensuite se tromperait probablement de problème.
