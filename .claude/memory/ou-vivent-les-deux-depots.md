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

## Relève après OOM, et reprise d'une conversation à distance

Le 21/09/2026 à 05:54:34 UTC, l'OOM killer de l'hôte a tué la session du
kit (`claude-remote-kit.service`) après 1 j 17 h 24 min de fonctionnement —
pic mesuré 3,6 Go + 931,3 Mo de swap, sur un conteneur à 4 Go de RAM
partagé avec la session jumelle du firmware (pic mesuré au même moment :
2,27 Go). L'accès n'est jamais revenu seul : les deux unités étaient
`Type=oneshot` + `RemainAfterExit=yes` sans aucun `Restart=`, et
`RuntimeDirectory=tmux-kit` est nettoyé à l'arrêt de l'unité — le serveur
tmux dédié disparaît avec elle. La panne est restée invisible jusqu'à ce
qu'un humain la remarque.

Les deux unités portent désormais `Restart=on-failure` + `RestartSec=10`,
et un plafond mémoire **par service, calé sur son propre pic mesuré** —
jamais sur celui de sa jumelle, parce que les deux n'ont pas le même
régime :

| | `MemoryHigh` | `MemoryMax` | pic mesuré |
|---|---|---|---|
| kit | 1800M | 2400M | 3,6 Go — **au moment du kill** |
| firmware | 2200M | 2800M | 2,27 Go — en fonctionnement, jamais tué |

Détail et trade-off assumé (le kill arrive plus tôt qu'avant, en échange
d'une relève automatique en 10 s) dans
[ADR-0036](../../docs/adr/0036-une-session-distante-se-releve-seule-plafonnee-au-pic-mesure.md).

### Reprendre une conversation à distance

`/resume` **n'est pas disponible en Remote Control** — la CLI (v2.1.278)
répond « /resume isn't available over Remote Control. ». La reprise se
fait donc au **lancement** du service, jamais depuis l'intérieur d'une
session déjà démarrée :

1. Écrire l'identifiant de session dans le fichier d'environnement du
   service concerné (facultatif, absent par défaut) :
   `/etc/default/claude-remote-kit` pour le kit (variable
   `CLAUDE_KIT_ARGS`), `/etc/default/claude-remote` pour le firmware
   (`CLAUDE_POOL_ARGS`) — par exemple `CLAUDE_KIT_ARGS="--resume
   6cb1e70e-5272-44c2-9214-62de8382a978"`.
2. Redémarrer le service (`systemctl restart claude-remote-kit.service`) :
   le script de lancement reçoit l'argument et le passe à la CLI.
3. **Vider le fichier tout de suite après** (`CLAUDE_KIT_ARGS=""` ou fichier
   supprimé). Sans cette étape, `Restart=on-failure` referait le même
   `--resume` après chaque OOM futur — la relève automatique rechargerait
   alors indéfiniment la conversation dont le volume a fait tomber le
   service, transformant la réparation en boucle d'échec.

Vérifié par exécution, avec une unité systemd transitoire reproduisant la
construction : fichier vidé → 0 argument transmis (démarrage nominal
intact, aucun argument vide parasite) ; fichier rempli → 2 arguments
correctement séparés (`--resume`, puis l'identifiant). Reprise réelle
effectuée sur la conversation `6cb1e70e-5272-44c2-9214-62de8382a978`,
rechargée avec son historique.
