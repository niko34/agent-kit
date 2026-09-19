---
name: ou-vivent-les-deux-depots
description: "Le kit et le projet firmware sont deux dépôts distincts du conteneur, chacun avec son tableau de bord et sa session"
metadata:
  type: project
---

Deux dépôts, deux rôles, à ne jamais confondre.

| | chemin | rôle |
|---|---|---|
| `agent-kit` | `/root/agent-kit` | le kit — **source de vérité** du centre de contrôle |
| `esp32-pool-controller` | `/root/esp32-pool-controller` | un projet **consommateur** |

⚠️ **Ne jamais éditer `control-center/` dans esp32-pool-controller** : c'est une
copie vendue, que la prochaine synchronisation écrase. Tout se fait dans le kit,
puis redescend par `./tools/update_kit.sh`.

Le dépôt GitHub s'appelle **`agent-kit`**. `claude-agent-kit` est un ancien nom
que GitHub redirige — la redirection a masqué l'écart pendant toute une soirée :
un clone, un fetch et quatre push ont réussi sous l'ancien nom sans que rien ne
le signale.

## Tableaux de bord et sessions

| | tmux | Remote Control | tableau de bord | service systemd |
|---|---|---|---|---|
| kit | `claude-kit` | `kit-lxc` | port **8788** | `claude-remote-kit.service` |
| firmware | `claude` | `pool-lxc` | port **8787** | `claude-remote.service` |

> L'hôte n'est pas écrit ici, et ne doit pas l'être : ce dossier est versionné,
> et la règle absolue de `.claude/memory/README.md` exclut « l'adresse d'un
> environnement privé ». Les deux tableaux de bord tournent sur la même
> machine, ils ne se distinguent que par le port.

Les deux services sont `enabled` : les sessions repartent au démarrage du
conteneur.

⚠️ **Les hooks qui enregistrent sont ceux du dépôt où tourne la session.** Une
session lancée depuis `/root` n'est instrumentée nulle part. C'est le répertoire
de LANCEMENT qui compte, pas un `cd` ultérieur.

La configuration du tableau de bord (`control-center/control-center.toml`) et son
journal (`var/`) sont **ignorés par git** dans les deux dépôts : ils
n'appartiennent pas au kit et ne voyagent jamais. Voir [[ce-qui-attend-un-commit]].
