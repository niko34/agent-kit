# ADR-0036 — Une session distante se relève seule, plafonnée au pic mesuré de sa propre jumelle, jamais à celui de l'autre

## Statut

Accepté

## Date

2026-09-21

## Contexte

Le 21/09/2026 à 05:54:34 UTC, l'OOM killer de l'hôte a tué la session
Claude Code en Remote Control du dépôt `agent-kit`
(`claude-remote-kit.service`, tmux `claude-kit`, Remote Control « kit-lxc »,
tableau de bord :8788), après 1 j 17 h 24 min de fonctionnement. Le journal
porte : « A process of this unit has been killed by the OOM killer. » puis
« Failed with result 'oom-kill'. ». Pic mémoire relevé par systemd : 3,6 Go
plus 931,3 Mo de swap. Le conteneur dispose de 4 Go de RAM et 1 Go de swap,
et hébergeait en parallèle la session jumelle `claude-remote.service`
(`esp32-pool-controller`, « pool-lxc »), dont le pic mesuré au même moment
était de 2,27 Go — un régime différent, sur la même machine.

L'accès distant n'est jamais revenu seul, pour deux raisons distinctes et
cumulatives :

- Les deux unités étaient `Type=oneshot` + `RemainAfterExit=yes`, **sans
  aucune directive `Restart=`**. Une fois le processus tué, systemd marque
  l'unité `failed` et ne relance rien.
- `RuntimeDirectory=tmux-kit` est nettoyé à l'arrêt de l'unité, ce qui
  emporte le serveur tmux dédié avec elle : la session n'était donc plus ni
  jointe à distance, ni rattachable en local. La panne est restée invisible
  jusqu'à ce qu'un humain s'en aperçoive.

En tentant la reprise, une limite du client a été découverte par mesure :
`/resume` **n'est pas disponible en Remote Control** — la CLI (v2.1.278)
répond littéralement « /resume isn't available over Remote Control. ».
Reprendre une conversation impose donc de passer `--resume <session-id>`
**au lancement** du processus, pas depuis l'intérieur d'une session déjà
démarrée. Les scripts `claude-remote-kit-start.sh` et
`claude-remote-start.sh` savaient déjà recevoir des arguments
(`exec ... --remote-control kit-lxc "$@"`), mais `systemctl start` n'avait
aucun moyen de leur en transmettre.

## Décision

### 1. Relève automatique après un OOM

`Restart=on-failure` + `RestartSec=10` sur les deux unités
(`claude-remote-kit.service` et `claude-remote.service`). Un kill par l'OOM
killer marque le service `failed`, ce que `on-failure` couvre : la session
repart seule, dix secondes après.

### 2. Un plafond mémoire par service, calé sur le pic mesuré de CE service

`MemoryHigh` / `MemoryMax` sont posés service par service, avec des valeurs
**délibérément différentes** entre les deux jumelles :

- kit : `MemoryHigh=1800M`, `MemoryMax=2400M` (pic constaté au kill : 3,6 Go).
- pool : `MemoryHigh=2200M`, `MemoryMax=2800M` (pic relevé : 2,27 Go).

Appliquer au pool le plafond du kit (2400M) aurait posé une limite **sous
son régime normal mesuré** (2,27 Go), donc tué une session saine qui n'a
jamais posé de problème. Les deux jumelles partagent le même hôte et la
même contrainte de RAM totale, mais pas le même profil de consommation — le
plafond suit le service, pas le conteneur.

Les deux changements ont été appliqués à chaud (`daemon-reload`,
`systemd-analyze verify` sans erreur sur les deux unités), sans interrompre
la session pool qui tournait alors depuis 1 j 17 h.

### 3. La reprise d'une conversation passe par le service, jamais par `/resume`

`/resume` étant indisponible à distance, le seul chemin mesuré pour
reprendre une conversation existante est de faire porter `--resume
<session-id>` par la commande de démarrage du service :

- `EnvironmentFile=-/etc/default/claude-remote-kit` (resp.
  `/etc/default/claude-remote`) — le `-` rend le fichier facultatif, pour
  qu'un démarrage nominal (aucune reprise en cours) ne dépende pas de son
  existence.
- `ExecStart=<script> $CLAUDE_KIT_ARGS` (resp. `$CLAUDE_POOL_ARGS`).

Vérifié par exécution, avec une unité systemd transitoire reproduisant la
construction : fichier d'environnement vidé → 0 argument transmis (aucun
argument vide parasite, démarrage nominal intact) ; fichier rempli →
2 arguments correctement séparés (`--resume`, puis l'identifiant). Reprise
réelle effectuée sur la conversation
`6cb1e70e-5272-44c2-9214-62de8382a978`, rechargée avec son historique.

**`CLAUDE_KIT_ARGS` (et son équivalent pool) doit être vidé après chaque
reprise.** Couplé à `Restart=on-failure`, un `--resume` laissé dans le
fichier ferait recharger, après chaque OOM futur, exactement la conversation
dont le volume a fait tomber le service — la relève automatique
deviendrait une boucle d'échec au lieu d'une réparation.

## Alternatives considérées

- **Augmenter la RAM du conteneur.** Écartée : repousse le seuil sans
  jamais rendre la relève automatique. Le défaut constaté n'est pas « le
  seuil est trop bas », c'est « rien ne relève le service une fois le
  process tué » — une RAM plus généreuse aurait simplement fait revenir le
  même incident plus tard, avec la même absence de filet.
- **Un plafond mémoire unique pour les deux services.** Écartée et mesurée
  dangereuse : le pic du kit (3,6 Go) appliqué au pool (régime mesuré
  2,27 Go) l'aurait fait passer sous un plafond qui le tue en fonctionnement
  normal — un service sain tué pour corriger l'incident d'un autre.
- **Restart=always plutôt que on-failure.** Non retenue : `always` relance
  même un arrêt volontaire (`systemctl stop`), ce qui empêcherait d'arrêter
  la session pour maintenance sans désactiver l'unité au préalable.
  `on-failure` ne couvre que les fins anormales — exactement le cas de
  l'OOM killer.

## Conséquences

### Positives

- Un kill par l'OOM killer se répare seul en 10 secondes, sans intervention
  humaine — la panne du 21/09/2026 (invisible jusqu'à ce qu'un humain la
  remarque) ne se reproduit plus sous cette forme précise.
- Le plafond de chaque service est une donnée mesurée, pas une estimation :
  aucun service n'hérite d'une contrainte pensée pour un régime de
  consommation qui n'est pas le sien.
- La reprise d'une conversation à distance est reproductible et vérifiée
  par exécution (fichier vide → 0 argument ; fichier rempli → 2 arguments),
  pas seulement documentée en théorie.

### Négatives

- **Le kill arrive désormais plus tôt qu'avant** : 2,4 Go de plafond pour le
  kit contre 3,6 Go mesurés au moment du kill par l'OOM killer de l'hôte.
  C'est un compromis assumé, pas un effet de bord : on échange un kill
  tardif et définitif (aucune relève, panne invisible pendant potentiellement
  des jours) contre un kill précoce et réparé en 10 secondes. Une session
  qui aurait continué à grossir jusqu'à 3,6 Go sans ce plafond sera
  désormais coupée puis relancée avant d'y arriver — au prix d'une reprise
  moins profonde si `CLAUDE_KIT_ARGS` n'a pas été renseigné à temps.
- Le dispositif ajoute deux fichiers d'exploitation
  (`/etc/default/claude-remote-kit`, `/etc/default/claude-remote`) qui ne
  vivent pas dans le dépôt (hors de son contrôle de version, propres à
  l'hôte) et doivent être vidés manuellement après chaque reprise — un oubli
  transforme la relève automatique en boucle de rechargement de la même
  conversation en échec.

### Ce que ça verrouille

- **Critère 1 (contrainte structurante)** : tout réglage futur des deux
  unités jumelles doit continuer de mesurer le pic **du service concerné**
  avant de poser un plafond — la valeur ne se copie jamais de l'une à
  l'autre.
- **Critère 2 (décision invisible dans le code)** : rien dans
  `claude-remote-kit-start.sh` ne dit pourquoi `$CLAUDE_KIT_ARGS` existe
  plutôt qu'un `/resume` classique — c'est une contrainte du client Remote
  Control (v2.1.278), pas un choix de conception du script.
- **Critère 3 (alternatives crédibles)** : « augmenter la RAM » et « un seul
  plafond pour les deux services » sont l'une et l'autre des réponses
  défendables à première vue, et fausses pour des raisons mesurées
  (l'absence de relève n'est pas un problème de seuil ; les deux jumelles
  n'ont pas le même régime).
- **Critère 4 (verrouillage long terme)** : `CLAUDE_KIT_ARGS` /
  `CLAUDE_POOL_ARGS` devient le seul canal de reprise d'une conversation à
  distance tant que `/resume` n'est pas supporté en Remote Control — toute
  procédure de reprise future s'écrit contre ce canal, jamais contre une
  commande interactive à l'intérieur de la session.

## Références

- Unités : `/etc/systemd/system/claude-remote-kit.service`,
  `/etc/systemd/system/claude-remote.service` (hôte, non versionnées).
- Fichiers d'environnement : `/etc/default/claude-remote-kit`,
  `/etc/default/claude-remote` (hôte, non versionnés).
- Scripts : `claude-remote-kit-start.sh`, `claude-remote-start.sh`.
- Mémoire de projet : `.claude/memory/ou-vivent-les-deux-depots.md`
  (tableaux de bord et sessions), section « Relève après OOM, et reprise
  d'une conversation à distance ».
- Conversation reprise pour validation :
  `6cb1e70e-5272-44c2-9214-62de8382a978`.
