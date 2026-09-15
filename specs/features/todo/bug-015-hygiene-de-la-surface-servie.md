# Bug — Trois écarts d'hygiène sur la surface servie par le centre de contrôle

- **Type** : bug
- **Statut** : todo
- **Priorité** : normale
- **Version cible** : [à fixer par l'agent qui reprend cette spec]
- **Créée** : 2026-09-15 (audit de sécurité en rôle AUDIT, étape `S1` de `feature-010`)
- **Domaine** : API (`control-center/backend/server.py`, `events.py`)
- **Spec(s) liée(s)** : `bug-010` (le point 2 y est repris côté freinage), `ADR-0019`

## Agents requis

- [x] architect
- [x] backend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

Trois écarts distincts, tous **établis par exécution** le 2026-09-15, aucun
exploitable seul, tous du même genre : deux lecteurs d'une même notion qui ne
s'accordent pas.

### 1. `cwd` sort vers le navigateur malgré la liste positive

`_evenement_public` filtre **volontairement** `cwd` et `transcript_path` des
événements (`server.py:125-138`). Mais `reconstruire()` recopie `cwd` dans chaque
workflow (`events.py:299`, `:321-322`), et `workflows` part tel quel dans
`/api/etat`. Vérifié : le chemin absolu injecté dans un clone est présent dans la
réponse ; `transcript_path`, lui, ne l'est pas.

`app.js` n'utilise pas `cwd` — la fuite ne sert donc à rien, pas même à l'affichage.

### 2. Un anonyme distant distingue les régimes de déploiement

`POST /api/lancer` rend `403 « routes d'écriture non activées »` quand aucun
jeton valide n'est actif, et `401` sinon (`server.py:918-927`). Un anonyme
apprend donc si la machine porte un tableau de bord **ouvert en local** — utile
à qui obtiendrait ensuite un pied local.

### 3. La bannière de démarrage ne dit pas que le jeton voyage en clair

ADR-0020 a reçu le 2026-09-15 une note datée nommant l'hypothèse de transport,
et le README l'a reprise. **La bannière de démarrage, non** : quand `hote` n'est
pas local (`server.py:1204-1207`), elle annonce l'exposition réseau sans dire
que le jeton circule en clair. C'est le seul des trois endroits que l'opérateur
lit forcément.

## Cause racine

Pour 1 : la liste positive des champs publics est appliquée aux **événements**
seulement, jamais aux **workflows** reconstruits. Deux chemins vers la même
réponse, une seule barrière.

Pour 2 : deux codes de refus portent deux motifs différents sur une même
frontière — « pas autorisé » et « pas activé ».

Pour 3 : la note datée et le README sont des livrables documentaires ; la
bannière est du code, et elle est restée en dehors du lot.

## Correctif attendu

1. Appliquer la liste positive aux workflows servis, ou retirer `cwd` de la
   reconstruction. L'architecte tranche, et écrit lequel des deux lecteurs fait
   autorité — sinon l'écart reviendra.
2. `401` **uniforme** sur `do_POST` distant, quel que soit le régime.
3. Une ligne de plus dans la bannière `hote ≠ local`, reprenant la phrase de la
   note datée d'ADR-0020.

## Critères d'acceptation

- [ ] `GET /api/etat` ne contient **aucun** chemin absolu de la machine, vérifié
      par un test qui cherche le chemin, pas par relecture
- [ ] Un anonyme distant obtient le **même** code de réponse sur `POST
      /api/lancer`, que le serveur porte un jeton déclaré ou non
- [ ] La bannière de démarrage nomme le transport en clair dès que `hote` n'est
      pas local, et **ne le nomme pas** quand il l'est
- [ ] Suite verte, compte de cas strictement supérieur à l'entrée
- [ ] Validation par mutation sur les trois points

## Hors périmètre

- Le freinage par adresse source — c'est `bug-010`.
- L'ajout de TLS au serveur : ADR-0020 pose désormais l'hypothèse d'un
  intermédiaire local, cette spec ne la remet pas en cause.
