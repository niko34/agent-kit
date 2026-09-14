# ADR-0020 — Un centre de contrôle appartient à un développeur, et le jeton dépend du déploiement

## Statut

Accepté

## Date

2026-09-14

## Contexte

Le centre de contrôle a été conçu, développé et audité pendant trois étapes
(A à D) **sans que son modèle de déploiement soit écrit nulle part**. Vérifié :
ni `control-center/README.md`, ni aucun des dix-neuf ADR précédents ne dit sur
quelle machine ce serveur tourne, ni pour qui. La seule mention est une incise
dans ADR-0009.

Cette absence a coûté cher, et c'est mesurable. Le cycle `feature-007` a
construit toutes ses gardes contre un modèle de menace **implicite** : « un
serveur que plusieurs personnes peuvent joindre ». Le `security-reviewer` a
statué en GATE P1 que le modèle binaire « porteur du jeton = peut tout lancer »
était « acceptable en local mono-utilisateur » et basculerait en NO GO « si
plusieurs personnes partagent le jeton sur `0.0.0.0` » — sans que personne
puisse dire lequel des deux cas était le vrai, puisque la question n'avait
jamais été tranchée.

Le modèle réel, énoncé par l'utilisateur le 2026-09-14 :

> Le centre de contrôle est destiné à être installé chez **un** développeur. Les
> specs sont partagées par git ; plusieurs développeurs voient donc les mêmes
> specs, chacun sur sa machine. Mais s'ils lancent des cycles, c'est **sur leur
> propre machine**, comme quand ils développent eux-mêmes.

Précision apportée dans le même échange, et décisive : le serveur **n'est pas
nécessairement sur le portable du développeur**. Il peut vivre dans un conteneur,
sur une autre machine. Ce qui ne varie pas, c'est qu'il **pilote une session
Claude liée au compte de ce développeur**.

## Décision

### 1. L'invariant

> **Un centre de contrôle appartient à un développeur.** Il pilote une session
> Claude liée à *son* compte, dépense *son* budget, écrit dans *son* dépôt, sous
> *son* identité.

Où il tourne — portable, conteneur, machine distante — est un **choix de
déploiement**, jamais un changement de nature. Il n'y a pas, et il n'y aura pas,
de centre de contrôle **partagé** entre plusieurs développeurs.

Corollaire, qui clôt plusieurs questions ouvertes : **pas de comptes, pas de
rôles, pas d'identités multiples.** La question « qui a lancé cette
commande ? » n'a qu'une réponse possible, et elle est connue d'avance. Ce n'est
pas une simplification provisoire : c'est la nature du produit.

### 2. Le jeton dépend du déploiement, pas de la route

Le jeton **n'est pas** un dispositif de contrôle des coûts, et il ne l'a jamais
été — c'est `[garde_fous].budget_max_usd` qui porte cette intention, avec ses
propres limites. Le jeton est une **barrière de rattachement** : il relie « qui
atteint ce port » à « celui à qui ce serveur appartient ».

D'où la règle :

- **Écoute sur `127.0.0.1` (ou `localhost`) → le jeton est inutile.** Qui peut
  atteindre le port a déjà un shell sur la machine : il lancerait les mêmes
  commandes directement, sans passer par le tableau de bord. Exiger un secret
  n'ajoute aucune barrière, il ajoute une friction.
- **Un `fichier_jeton` DÉCLARÉ ferme, qu'il soit valide ou non.** « Configuré »
  se lit **déclaré dans la configuration**, jamais « valide » : un jeton en mode
  `0644`, vide ou illisible doit **fermer** les routes, pas les ouvrir.
  *Fail-closed* — une configuration cassée est le moment où il faut se méfier,
  pas celui où l'on baisse la garde.

  > Cette précision n'était pas dans la première rédaction de cet ADR, et son
  > absence a coûté une régression de sécurité **mesurée pendant le cycle
  > `bug-012`** : l'implémentation avait lu « configuré » comme `jeton.actif()`,
  > c'est-à-dire *valide*. Un jeton déclaré mais mal protégé, qui bloquait
  > l'écriture (403) avant ce cycle, ouvrait ensuite **la lecture et l'écriture**
  > à tout le réseau derrière un intermédiaire local. Le mot « configuré »
  > paraissait sans ambiguïté au moment de l'écrire.

- **Écoute au-delà de la machine → le jeton est OBLIGATOIRE, lecture comprise.**
  C'est lui, et lui seul, qui rend ce déploiement défendable.

Cette seconde moitié **corrige un trou mesuré** le 2026-09-14 : le serveur
autorisait `hote = "0.0.0.0"` **sans aucun jeton**, en se contentant d'un
avertissement au démarrage (`server.py:886`). Un anonyme sur le réseau local
obtenait `GET /api/etat` en **200**, avec quatorze champs — specs, workflows,
état git, agents, événements. Soit l'activité de développement entière, en
lecture libre.

### 3. Ce qui reste, et ce qui tombe

**Reste valide** : le verrou d'écrivain unique. Deux cycles sur le même arbre de
travail s'écrasent — c'est une contrainte de **répertoire**, pas d'utilisateurs,
et elle survit intacte au changement de modèle.

**Tombe** : les comptes, les rôles, la traçabilité « par qui ».

**Devient plus simple** : l'échange interactif entre un cycle et l'humain. Sous
le modèle « serveur partagé », faire entrer du texte venu du réseau dans un agent
qui exécute des outils était une décision de sécurité lourde. Sous le modèle réel,
c'est le développeur qui tape dans son propre outil — exactement ce qu'il fait
déjà dans son terminal. Le problème redevient ergonomique.

**Devient plus contraint** : `feature-009` (discussion par spec). Les specs sont
partagées par **git**, les centres de contrôle ne le sont pas. Une discussion
rangée dans le stockage local d'un serveur serait **différente chez chaque
développeur**. Pour avoir un sens, elle doit vivre **dans le dépôt**. Cette
contrainte n'était pas dans la spec ; elle y entre par cet ADR.

## Alternatives écartées

- **« Le serveur tourne sur le portable du développeur. »** Écartée par
  l'utilisateur lui-même : son installation vit dans un conteneur sur une autre
  machine, et c'est un cas légitime. Lier l'invariant à la *machine* plutôt qu'à
  la *personne* aurait interdit un déploiement valable.
- **Supprimer le jeton.** Séduisante après le constat qu'il ne sert à rien en
  local, mais fausse : elle interdirait le déploiement distant, ou le rendrait
  indéfendable.
- **Garder le jeton obligatoire partout.** C'est l'état livré par `feature-007`.
  Écartée : sur `127.0.0.1`, il n'ajoute aucune barrière — seulement une friction
  et un secret de plus à gérer. Une garde qui ne protège de rien apprend à
  contourner les gardes.
- **Ajouter des comptes.** Écartée : il n'y a qu'un utilisateur par
  installation, par construction.

## Conséquences

- Le serveur **refuse de démarrer avec des routes actives** sur une adresse non
  locale sans jeton valide — ou démarre en refusant toute requête. Le choix exact
  revient à la spec qui traite le trou, pas à cet ADR.
- Les routes de **lecture** deviennent protégées dès que l'écoute sort de la
  machine. Aujourd'hui elles ne le sont jamais.
- `control-center/README.md` et `control-center.example.toml` doivent énoncer ce
  modèle **en tête**, pas en note.
- `feature-009` est à reprendre sous la contrainte « la discussion vit dans git ».
- `bug-010` (freinage global, lecture anonyme non bornée) voit son périmètre
  précisé par cet ADR.

## Ce que cet ADR ne ferme pas

- **Le pilotage des coûts.** `budget_max_usd` est un drapeau **transmis** à la
  commande, jamais une dépense **mesurée** : rien ne vérifie que le programme
  lancé le respecte, et rien ne cumule d'un lancement à l'autre. Cinq lancements
  à 5 $ ne déclenchent aucun refus. À traiter par une spec dédiée.
- **Ce que « lancer un cycle » exécute réellement** quand personne n'est au bout
  pour arbitrer un `NO GO`.
- **Le canal d'échange interactif** entre un cycle et le tableau de bord : cet
  ADR le simplifie, il ne le conçoit pas.
