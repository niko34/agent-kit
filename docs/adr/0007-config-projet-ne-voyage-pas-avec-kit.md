# ADR-0007 — Ce qui appartient au projet ne voyage pas avec le kit

## Statut

Accepté

## Date

2026-09-12

## Contexte

Le centre de contrôle a deux catégories de fichiers propres à chaque projet
qui l'instancie : sa configuration (`control-center.toml` : répertoires de
specs réels, commandes de test, etc.) et son journal d'événements (`var/` :
l'historique des workflows observés). Ni l'un ni l'autre n'a de sens dans le
dépôt `agent-kit` lui-même, qui n'est pas un projet en activité mais un
gabarit destiné à être copié.

## Décision

`control-center.toml` et `control-center/var/` sont listés dans `.gitignore`
et **absents de l'arbre versionné du kit**. Le modèle à copier et remplir est
`control-center.example.toml`. La protection ne repose donc **pas sur une
liste de chemins protégés qu'il faudrait maintenir à jour** : ces fichiers ne
sont tout simplement pas là. `git checkout` (utilisé par
`tools/update_kit.sh` pour synchroniser un projet depuis le kit) ne peut
restaurer ou écraser que ce qu'il connaît dans le kit — il ne peut pas
toucher un fichier qui n'y a jamais existé.

## Alternatives considérées

- **Une liste de chemins protégés, vérifiée par empreinte (hash) avant toute
  synchronisation** : écarté — cette liste devrait être tenue à jour à
  chaque nouveau fichier propre au projet ajouté au fil du temps ; l'oublier
  une fois suffit à écraser une configuration ou un journal de production.
  L'absence pure et simple du fichier dans le kit ne demande aucune
  maintenance.

## Conséquences

### Positives

- Aucun risque qu'une synchronisation du kit (`tools/update_kit.sh`) écrase
  la configuration ou le journal d'un projet en production : ces fichiers ne
  font partie d'aucun commit du kit à synchroniser.
- Pas de liste à maintenir, donc pas d'oubli possible sur ce point précis.

### Négatives

- Un nouveau venu doit savoir que `control-center.example.toml` est le
  modèle à copier — l'absence de `control-center.toml` dans le dépôt n'est
  pas auto-documentée sans lire le `.gitignore` ou le README du module.
- Cette protection ne couvre que les deux fichiers identifiés aujourd'hui ;
  un futur fichier propre au projet (par exemple un futur cache local) devra
  suivre la même convention explicitement — l'absence de liste protège ce
  qui est déjà absent, pas ce qui serait ajouté par erreur au dépôt du kit.
