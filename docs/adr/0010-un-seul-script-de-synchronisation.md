# ADR-0010 — Un seul script de synchronisation : `update_kit.sh`

## Statut

Accepté

## Date

2026-09-12

## Contexte

Trois fichiers du dépôt annoncent que le centre de contrôle est copié dans les
projets par un script dédié, `tools/sync-control-center.sh` :

- `control-center/README.md` (« Il est copié tel quel dans les projets, par
  leur script `tools/sync-control-center.sh` ») ;
- `control-center/control-center.example.toml` (« votre configuration […]
  n'est JAMAIS touchée par `tools/sync-control-center.sh` ») ;
- `docs/adr/0006`, qui a repris la formule du README.

**Ce script n'existe pas.** Il est absent de `tools/` dans le kit, et absent
de `tools/` dans `esp32-pool-controller`, le seul projet consommateur connu.
Aucun commit de l'historique ne le crée. La synchronisation du centre de
contrôle est en réalité assurée, depuis feature-004, par
`tools/update_kit.sh`, où `control-center` figure dans `CHEMINS_SI_PRESENTS` —
la liste des chemins **conditionnels**, récupérés seulement s'ils sont déjà
présents dans le projet. La première installation, elle, est assistée par
`control-center/installer.py`.

Une documentation qui nomme un outil inexistant coûte plus qu'une
documentation muette : elle envoie chercher un fichier introuvable, et laisse
croire que le centre de contrôle suit un chemin de distribution distinct du
reste du kit — avec ses propres règles sur ce qui est écrasé et ce qui ne
l'est pas.

## Décision

**Il n'y a qu'un seul script de synchronisation kit → projet :
`tools/update_kit.sh`.** Il traite le centre de contrôle comme tout le reste,
selon les trois catégories déjà posées :

| Catégorie | Exemples | Traitement |
|---|---|---|
| gelés | `.claude/agents`, `tools/`, `GUIDE.md` | toujours récupérés |
| conditionnels | `control-center`, pipelines d'hygiène | récupérés **seulement s'ils sont déjà là** |
| personnalisés | `CLAUDE.md`, `settings.json`, `dev-workflow` | jamais touchés |

`control-center/installer.py` reste l'**assistant de première installation** —
il découvre et propose un `control-center.toml` — et n'est pas un outil de
synchronisation : il n'écrase jamais une configuration existante et n'écrit
jamais dans `.claude/settings.json`.

Les trois mentions de `tools/sync-control-center.sh` sont corrigées à la date
de cet ADR pour pointer vers le mécanisme réel. Aucun script portant ce nom ne
sera créé.

## Alternatives considérées

- **Créer réellement `tools/sync-control-center.sh`, pour que la
  documentation dise vrai** : écarté — un second script de synchronisation
  aurait sa propre notion de ce qui est gelé, sa propre garde d'arbre propre,
  sa propre gestion des orphelins, et ignorerait `.kit-paths` (ADR-0008) tant
  qu'on n'y aurait pas recopié sa logique. Deux scripts qui écrivent dans le
  dépôt d'un projet, c'est deux fois la surface de défaut du composant déjà
  identifié comme le plus dangereux du kit — pour un besoin que
  `CHEMINS_SI_PRESENTS` couvre en trois lignes.
- **Sortir `control-center/` du kit, dans un dépôt distribué séparément** :
  écarté — le centre de contrôle n'a d'intérêt qu'avec les agents, les specs
  et les hooks du kit ; l'en distinguer imposerait de faire coïncider deux
  versions à la main dans chaque projet, exactement le cul-de-sac que
  feature-004 a supprimé.
- **Ne corriger que la documentation, sans ADR** : écarté — la question
  « faut-il un canal de distribution propre au centre de contrôle ? » s'est
  posée, et la réponse (non, un seul script, le composant est conditionnel)
  est une contrainte imposée à toute évolution future du module. Sans trace,
  le prochain qui lira `CHEMINS_SI_PRESENTS` pourra refaire le raisonnement
  inverse.

## Conséquences

### Positives

- Un seul chemin de code écrit dans le dépôt d'un projet consommateur : une
  seule garde d'arbre propre, un seul aperçu, un seul endroit à tester (voir
  feature-006, la dette de test d'`update_kit.sh`).
- `.kit-paths` (ADR-0008) gouverne aussi le centre de contrôle, sans
  exception à retenir : un projet qui déclare sa liste inclusive décide du
  sort de ce module comme de tous les autres.
- La documentation cesse d'envoyer le lecteur chercher un fichier
  introuvable.

### Négatives

- Le centre de contrôle reste soumis au rythme d'`update_kit.sh` : un projet
  qui ne synchronise pas le kit ne reçoit pas non plus les corrections du
  tableau de bord, même urgentes. Il n'existe pas de canal court pour ce seul
  module.
- Le statut **conditionnel** implique qu'un projet qui n'a jamais installé le
  centre de contrôle ne le recevra jamais par simple synchronisation : il
  faut passer par `installer.py` une première fois. C'est voulu (un composant
  optionnel, et qui arriverait inerte sans ses hooks), mais c'est une étape
  manuelle de plus, et la seule.
- Cet ADR corrige des mentions erronées plutôt que de les laisser vivre
  comme trace d'une intention passée : quiconque retrouverait le nom
  `sync-control-center.sh` dans un état ancien du dépôt ne saura, sans lire
  cet ADR, qu'il n'a jamais désigné un fichier réel.
