# ADR-0004 — Le tableau de bord n'a aucune route d'écriture tant que ses garde-fous ne sont pas du code

## Statut

Accepté

## Date

2026-09-12

## Contexte

`control-center.toml` déclare déjà trois garde-fous destinés à un futur
pilotage depuis l'interface web : un jeton d'authentification, un écrivain
unique, un plafond de dépense. Aucun des trois n'est aujourd'hui **appliqué
par du code** — ils existent en configuration, sans logique qui les fasse
respecter.

## Décision

`control-center/backend/server.py` (`Handler`, sous-classe de
`BaseHTTPRequestHandler`) ne définit **ni `do_POST`, ni `do_PUT`, ni
`do_DELETE`**. Ce n'est pas une politique désactivable : ces méthodes
**n'existent pas** dans la classe, donc `http.server` répond de lui-même
`501 Not Implemented` à toute tentative. Aucun clic dans l'interface ne peut
donc rien lancer, rien écrire, rien dépenser.

Deux tests verrouillent cette garantie, dont un par **introspection de la
classe** (vérifie l'absence des méthodes elles-mêmes, pas seulement le
comportement observé sur une requête).

Tant qu'aucune route n'écrit, l'absence de jeton, d'écrivain unique et de
plafond de dépense ne se paie pas : ces garde-fous devront devenir du code
**avant**, et non après, l'ajout de la première route qui écrit.

## Alternatives considérées

- **Implémenter les routes d'écriture immédiatement, protégées par les
  garde-fous déclarés en configuration** : écarté pour cette étape — cela
  aurait exigé d'écrire et de faire auditer jeton, écrivain unique et plafond
  de dépense avant de livrer la moindre observation, alors que le besoin
  immédiat est la lecture seule.
- **Désactiver les routes d'écriture par une vérification en tête de
  fonction (garde explicite plutôt qu'absence de méthode)** : écarté — une
  garde peut être contournée par erreur ou oubliée sur un chemin annexe ;
  l'absence de la méthode elle-même ne peut pas l'être, et `http.server` la
  refuse structurellement.

## Conséquences

### Positives

- Aucune surface d'attaque en écriture n'existe tant que les garde-fous ne
  sont pas du code : rien à auditer côté sécurité sur ce point pour l'étape
  actuelle.
- La garantie est vérifiable par lecture de classe, pas seulement par test de
  bout en bout — un test d'introspection ne peut pas être trompé par un
  chemin caché.

### Négatives

- **L'interface est inerte** : aucun bouton d'action (relancer un agent,
  acquitter une alerte, etc.) n'est possible tant que cette étape n'est pas
  dépassée — c'est un renoncement fonctionnel assumé, pas un oubli.
- Ajouter la première route d'écriture (`do_POST`) impose de livrer les trois
  garde-fous **en même temps**, ce qui concentre un travail de sécurité en un
  seul lot plutôt que de l'étaler.

> **Note (2026-09-13)** : la condition posée par cet ADR est **remplie**,
> pas contredite. `feature-007` (étape D) a livré les trois garde-fous comme
> du code, testés isolément, **avant** `do_POST` — vérifié par exécution : au
> terme de ce lot, `test_server.py` passait encore 34/34 avec
> l'introspection d'origine intacte, et `git diff` ne touchait pas
> `server.py`. `do_POST` existe désormais, donc le test d'introspection
> ci-dessus (qui vérifiait l'absence de toute méthode d'écriture) a été
> remplacé par un test inversé, plus large. C'est
> [ADR-0019](0019-jeton-comme-unique-barriere-et-table-des-routes-fermee.md)
> qui fait foi sur la garantie désormais en vigueur ; la Décision ci-dessus
> reste la trace exacte de ce qui a été vrai jusqu'à ce lot.
