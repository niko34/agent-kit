#!/usr/bin/env python3
"""Parle à la session tmux persistante déjà authentifiée (feature-026).

SEUL module du centre de contrôle qui lance un `tmux`. Le cockpit ne
détient aucun processus : il tape dans le pty d'une session qui tourne
déjà, en dehors de lui, démarrée par systemd (`claude-remote-kit.service`).

## Ce que ce module garantit, et comment

- **Argv en LISTE, jamais `shell=True`** : aucune valeur ne traverse un shell.
- **`-S <socket>` TOUJOURS explicite** : le socket vient de la CONFIGURATION
  (`resoudre_socket`), jamais de l'environnement hérité (`TMUX`,
  `TMUX_TMPDIR`, `TMUX_PANE`) — c'est le couplage accidentel mesuré le
  2026-09-22 sur le serveur en cours (D8).
- **Timeout sur CHAQUE appel** (`_TIMEOUT_TMUX`) : un `tmux` qui ne répond
  jamais ne doit pas bloquer un thread du serveur HTTP indéfiniment.
- **`stderr` de `tmux` n'est JAMAIS renvoyé brut à l'appelant** (condition 3
  du GATE P1) : `_executer()` ne rend que `(ok, stdout)`.
- **Socket ABSENT et session ABSENTE sont deux états DISTINCTS** (D3) : le
  socket se teste par `os.stat`, AVANT tout appel `tmux` — jamais déduit
  d'une sous-chaîne de `stderr`.

## `etat()` — un seul appel `tmux` dans le cas commun

Le chemin heureux (socket lisible, session vivante) ne fait qu'UN appel
`tmux` : `capture-pane` échoue à lui seul si la session n'existe pas, ce qui
évite un `has-session` séparé. Le second appel (`has-session`, pour
distinguer `hors_ligne` d'`injoignable`) n'a lieu que dans le cas rare où
`capture-pane` échoue — coût mesuré par l'architecte : 2,3 ms pour un
`capture-pane` seul (voir le rapport de cette passe pour la mesure reprise
ici).

## Résolution du `session-id` — RE-RÉSOLU à chaque appel, jamais mémorisé

`resoudre_session_id()` combine DEUX voies, jamais une mémoïsation :
1. `--resume <id>` extrait de la ligne de commande du processus qui tient le
   pane (mesuré M1 : exact tant que le processus tourne) ;
2. à défaut, ou en désaccord, le fichier `*.jsonl` le plus RÉCENT par
   `mtime` du répertoire de transcripts — **jamais** le plus volumineux
   (mesuré par l'architecte : le plus gros transcript n'est pas l'actif,
   37,2 Mo contre 20,9 Mo).
Une divergence entre les deux voies est RAPPORTÉE (`divergence: true`),
jamais tranchée en silence.

## `ecran_semble_au_prompt()` — une HEURISTIQUE, jamais une garde

Condition 6 du GATE P1 : ce nom, et tous ceux qui en dérivent dans les
tests, portent le mot « heuristique », jamais « garde ». Elle a le droit de
REFUSER un envoi (409), jamais d'AUTORISER : aucun autre chemin de ce module
ne lit sa sortie comme un feu vert au sens d'une garantie.

⚠️ **Reboucle GATE P2 (2026-09-22)** : la première version ancrait sur une
ligne bordée `│ … │` — un dessin de test fait à la main, jamais mesuré sur
un `claude` réel. Recapturé en lecture seule sur `claude-kit` PUIS sur une
VRAIE session jetable (jamais `claude-kit` en écriture) : `claude` 2.1.278
n'a AUCUNE bordure verticale. Le compositeur est encadré par deux lignes
HORIZONTALES pleine largeur (`─`×N), et la ligne du milieu commence par `❯`
EN COLONNE 0 — mais ce même `❯` colonne 0 préfixe AUSSI chaque message déjà
envoyé dans le défilement au-dessus. D'où le sandwich bordure/❯/bordure : lui
seul désigne la boîte de saisie VIVANTE, jamais une ligne d'historique
(`PIEGES §27`, variante mesurée). « Vide » se mesure aussi : le repos réel
est `"❯\xa0"` (espace INSÉCABLE, `U+00A0`), jamais `"❯"` seul — tout le
reste après `❯` est un BROUILLON.

⚠️ **Reboucle GATE P2-bis (2026-09-22, même jour)** : « occupé » et
« clavier indisponible » ont été confondus dans TOUTES les versions
précédentes de cette heuristique. **Mesuré sur une VRAIE session jetable**,
pendant une génération active (spinner + `"esc to interrupt"` au pied de
page) : un texte tapé par le chemin `load-buffer`/`paste-buffer -p`/`Enter`
est **ACCEPTÉ et MIS EN FILE** par `claude` lui-même — jamais perdu, jamais
concaténé à la réponse en cours. Le transcript le confirme au mot près :
`promptSource: "queued"` sur l'enregistrement, contre `"typed"` pour les
mêmes messages envoyés hors occupation, PAR LE MÊME CHEMIN MÉCANIQUE — donc
le champ reflète bien l'état de `claude`, pas la façon dont le texte a été
inséré. Le message queued est traité, dans l'ordre, une fois la tâche en
cours terminée (vérifié : réponse explicite de l'agent au message mis en
file). **`ecran_semble_au_prompt` ne teste donc plus l'occupation** — un
compositeur VIDE, occupé ou non, est un compositeur qui accepte la saisie.

Deux cas restent refusés, mesurés dangereux :
- **aucun compositeur identifiable** (dialogue de permission, écran de
  confiance initial, liste des tâches de fond) : mesuré — un collage dans un
  dialogue de permission est silencieusement IGNORÉ par le TUI (aucune
  trace, aucune altération de la sélection), donc pas dangereux EN LUI-MÊME,
  mais le `Enter` séparé qui suivrait, s'il n'était pas gardé, activerait
  l'option en surbrillance (potentiellement destructrice) — c'est pourquoi
  le refus reste EN AMONT du `paste-buffer`, avant même de tenter le
  collage ;
- **un brouillon est déjà présent** : mesuré — un collage par-dessus un
  brouillon existant SE CONCATÈNE à l'octet près (aucun séparateur inséré),
  corrompant les deux messages. C'est le seul cas que le GATE avait
  correctement anticipé comme dangereux.

## `ecran_indique_occupation()` — informationnel, jamais un critère d'envoi

Le motif d'occupation (spinner PRIMAIRE `"…\\s*\\(\\d+s"`, motif SECOURS
`"esc to interrupt"` au pied de page — tronqué dès qu'un segment
supplémentaire, ex. `"/tasks to see subagents"`, le pousse hors de la
largeur du panneau, mesuré `"esc to int…"`) sert désormais UNIQUEMENT à
peupler le libellé `"occupee"` de `etat()`, pour l'AFFICHAGE — jamais à
refuser un envoi. `etat()` peut donc annoncer « Occupée » tout en acceptant
un `POST /api/conversation`.

## `envoyer()` — le point de non-retour est `Enter`, pas `paste-buffer`

Condition 5 du GATE P1 : un SECOND `capture-pane` a lieu après le collage et
AVANT `Enter` — mais il vérifie que le COMPOSITEUR EST TOUJOURS LÀ
(`compositeur_toujours_accessible()`), PAS qu'il est vide : après un
collage réussi, il porte NOTRE texte, donc n'est plus vide par construction.
Ce qui doit rester vrai, c'est qu'AUCUN dialogue ne s'est interposé entre le
collage et l'`Enter`. S'il a disparu, `Enter` n'est PAS envoyé — le texte
reste visible dans le composeur, `delete-buffer` est appelé en `finally`
dans tous les cas. Le texte transite par STDIN (`load-buffer -b <tampon>
-`), jamais par l'argv de `send-keys -l` : un argv est lisible dans `ps` par
tout le monde sur la machine.

⚠️ `paste-buffer -p` n'encadre le collage QUE si l'application a activé le
collage encadré (mesuré par l'architecte : aucun `ESC[200~` contre `cat`) —
la protection multi-lignes de `M2` est donc CONDITIONNELLE à l'état du
panneau, pas une garantie absolue.

## `texte_valide_pty()` — distinct de `server._texte_conversation_valide`

Cette dernière n'est PAS durcie : ses tests `feature-022` la figent (note du
journal de bord de la spec). `texte_valide_pty()` est une fonction NEUVE qui
refuse EN PLUS DEL (`0x7f`) et les C1 (`U+0080`-`U+009F`) — inoffensifs pour
un canal `json-lines`, effaçants/de contrôle dans un pty (D7).

## Ciblage tmux EXACT — `=<nom>:`, jamais `<nom>` nu

⚠️ **Reboucle GATE P2, condition 3** : `-t <nom>` résout par PRÉFIXE — mesuré
par le GATE, reproduit ici : sur un socket portant `claude` ET
`claude-kit-jetable`, `-t claude` (nu) atteint SILENCIEUSEMENT
`claude-kit-jetable` dès qu'aucune session ne s'appelle EXACTEMENT `claude`.
Le `destinataire` affiché au cockpit mentirait. `"=%s:" % nom` (via
`_cible()`) force la correspondance EXACTE — `=nom` SANS le `:` final
échoue sur `capture-pane` (mesuré, rc=1) bien qu'il fonctionne sur
`has-session` : c'est `=nom:` qui marche sur TOUS les sous-commandes tmux
utilisées ici. Les CINQ sites qui ciblent une session (`has_session`,
`capture_pane`, `_pane_pid`, `paste-buffer`, `send-keys`) passent tous par
`_cible()` — aucune exception.

## `session_id` — confiné à `[0-9a-fA-F-]{1,64}` sur les DEUX voies

⚠️ **Reboucle GATE P2, condition 4** : le `session_id` résolu (voie
`cmdline` OU voie `recence`) entre ensuite dans un `os.path.join` côté
appelant (`server.py`, `_conversation_lire`). Sans forme bornée, un
`--resume` forgé dans la ligne de commande d'un processus — ou un nom de
fichier `.jsonl` hostile déposé dans `repertoire_transcripts` — pourrait
porter des séparateurs de chemin. `resoudre_session_id()` rejette
désormais toute valeur, sur les DEUX voies, qui ne satisfait pas
`_RE_SESSION_ID.fullmatch` (forme UUID généreuse : hexadécimal et tirets,
1 à 64 caractères) AVANT de la retenir comme candidate — une voie rejetée
se comporte comme absente, jamais comme une valeur à moitié acceptée
(même patron que `config.transcripts_racine_surcharge()`). `server.py`
repasse en outre par `vcs.chemin_sur()` avant tout `os.path.join` final :
défense en profondeur, le confinement ne dépend pas d'une seule des deux
couches.
"""

import os
import re
import shutil
import subprocess
import threading

# Délai maximal accordé à CHAQUE appel `tmux` (secondes) : un `tmux` qui ne
# répond jamais ne doit pas bloquer un thread HTTP indéfiniment.
_TIMEOUT_TMUX = 5.0

# Nom du tampon tmux utilisé pour le collage — dédié à ce module, jamais
# partagé avec un tampon que l'utilisateur pourrait manipuler à la main.
_NOM_TAMPON = "kit-cockpit"

# Motif d'occupation SECOURS, dans le pied de page — tronqué par la largeur
# du panneau dès qu'un segment supplémentaire s'intercale (mesuré, GATE P2) :
# sa PRÉSENCE reste un signal valide, sa seule ABSENCE ne prouve rien.
_MOTIF_OCCUPATION_PIED = "esc to interrupt"

# Motif d'occupation PRIMAIRE : le spinner de calcul (ex. "Seasoning… (0s",
# "Whirring… (0s"), dans la zone de défilement — AVANT le pied de page,
# jamais mangé par la troncature de fin de ligne (GATE P2, condition 1/2).
_RE_OCCUPATION_SPINNER = re.compile(r"…\s*\(\d+s")

# Boîte du compositeur (GATE P2) : une ligne de bordure HORIZONTALE pleine
# largeur (jamais de bordure verticale sur `claude` 2.1.278), au moins 10
# `─` consécutifs — marge large sous du 80 colonnes mesuré.
_RE_BORDURE_COMPOSITEUR = re.compile(r"^─{10,}$")

# Séquences SGR (couleur/attribut) émises par `tmux capture-pane -e` —
# reboucle GATE P2-ter. Retirées pour obtenir le texte PLAN (bordures,
# motifs d'occupation) ; conservées pour `_contenu_apres_marqueur_est_reel`,
# qui en a besoin pour distinguer un vrai brouillon d'un indice affiché par
# `claude` lui-même.
_RE_ANSI = re.compile(r"\x1b\[[0-9;]*m")

_RE_RESUME = re.compile(r"--resume[= ]+(\S+)")

# `session_id` confiné (GATE P2, condition 4) : hexadécimal et tirets
# seulement, 1 à 64 caractères — forme UUID généreuse, jamais un séparateur
# de chemin. Appliqué aux DEUX voies de résolution avant toute retenue.
_RE_SESSION_ID = re.compile(r"^[0-9a-fA-F-]{1,64}$")

# Un verrou threading PAR NOM de session déclaré (A6) : la capture d'écran
# et l'écriture ne se séparent jamais, transposition de S3.10 (feature-022).
_verrou_verrous = threading.Lock()
_verrous_session = {}


def _verrou_pour(nom):
    with _verrou_verrous:
        v = _verrous_session.get(nom)
        if v is None:
            v = threading.Lock()
            _verrous_session[nom] = v
        return v


def _tmux_bin():
    return shutil.which("tmux") or "tmux"


def _cible(nom):
    """`=<nom>:` — correspondance EXACTE (GATE P2, condition 3) : `-t <nom>`
    nu résout par PRÉFIXE, et `=<nom>` SANS le `:` final échoue sur
    `capture-pane` (mesuré). TOUS les sites qui ciblent une session passent
    par cette fonction, jamais par `nom` directement."""
    return "=%s:" % nom


def _environnement_purge():
    """Copie de `os.environ`, PURGÉE de `TMUX`, `TMUX_TMPDIR`, `TMUX_PANE`
    (D8) — le couplage accidentel mesuré le 2026-09-22 : le serveur en cours
    ne trouve le socket que parce qu'il a hérité ces variables de la session
    qui l'a lancé ; démarré par systemd, il n'aurait aucune d'elles."""
    env = dict(os.environ)
    for cle in ("TMUX", "TMUX_TMPDIR", "TMUX_PANE"):
        env.pop(cle, None)
    return env


def _executer(argv, entree=None, timeout=_TIMEOUT_TMUX):
    """Exécute `argv` (LISTE, jamais `shell=True`), timeout et environnement
    purgé. Rend `(ok, stdout)` — `stderr` n'est JAMAIS renvoyé (condition 3
    du GATE P1) : un échec ne renseigne l'appelant que par `ok=False`."""
    try:
        resultat = subprocess.run(
            argv, input=entree, capture_output=True, timeout=timeout,
            env=_environnement_purge())
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return False, ""
    sortie = resultat.stdout.decode("utf-8", errors="replace") if resultat.stdout else ""
    return resultat.returncode == 0, sortie


def resoudre_socket(config_session):
    """Chemin du socket tmux DÉCLARÉ en configuration — jamais dérivé de
    `os.environ` (D8). `config_session` est un `dict`
    `{"socket_tmux": …, "nom": …, "repertoire_transcripts": …}`."""
    return config_session.get("socket_tmux")


def _socket_lisible(chemin):
    """Vrai si `chemin` peut être `stat()`é — testé AVANT tout appel `tmux`
    (D3) : socket absent ou illisible (permissions) sont tous deux
    `injoignable`, jamais déduits d'une sous-chaîne de `stderr`."""
    if not chemin or not isinstance(chemin, str):
        return False
    try:
        os.stat(chemin)
    except OSError:
        return False
    return True


def _has_session(socket_tmux, nom):
    """`True`/`False` si le serveur a répondu, `None` sur échec du canal
    lui-même (timeout, binaire absent) — distinct d'une réponse « non »."""
    argv = [_tmux_bin(), "-S", socket_tmux, "has-session", "-t", _cible(nom)]
    try:
        resultat = subprocess.run(argv, capture_output=True, timeout=_TIMEOUT_TMUX,
                                   env=_environnement_purge())
    except (OSError, subprocess.TimeoutExpired, ValueError):
        return None
    return resultat.returncode == 0


def capture_pane(socket_tmux, nom):
    """Capture l'écran courant du panneau, SANS rien y écrire. Rend le texte
    AVEC ses séquences ANSI (`-e`, reboucle GATE P2-ter — voir
    `_contenu_apres_marqueur_est_reel`), ou `None` en cas d'échec —
    `tmux capture-pane` échoue notamment si la session `nom` n'existe pas
    sur ce socket. Mesuré : `-e` ne coûte RIEN de plus que `-p` seul
    (0,0023 s/appel dans les deux cas, session jetable)."""
    ok, sortie = _executer([_tmux_bin(), "-S", socket_tmux, "capture-pane", "-p", "-e", "-t", _cible(nom)])
    return sortie if ok else None


def _despouiller_ansi(texte):
    """Retire les séquences SGR (`\\x1b[...m`) — le texte PLAN qui reste est
    celui sur lequel `_RE_BORDURE_COMPOSITEUR` et les motifs d'occupation
    (calibrés avant l'ajout de `-e`) continuent de s'appliquer SANS
    changement."""
    return _RE_ANSI.sub("", texte)


def _etat_ansi_apres_marqueur(ligne_brute):
    """Parcourt `ligne_brute` (AVEC séquences ANSI) à partir du caractère
    `❯`, applique chaque séquence SGR rencontrée à un état `(attenue,
    fg_defaut, bg_defaut)`, et rend cet état au premier caractère VISIBLE
    (hors espace/NBSP) — ou `None` si la ligne s'épuise avant (rien après le
    marqueur)."""
    idx = ligne_brute.find("❯")
    if idx == -1:
        return None
    attenue, fg_defaut, bg_defaut = False, True, True
    pos = idx + 1
    n = len(ligne_brute)
    while pos < n:
        c = ligne_brute[pos]
        if c == "\x1b":
            m = _RE_ANSI.match(ligne_brute, pos)
            if m:
                parametres = m.group(0)[2:-1]
                codes = parametres.split(";") if parametres else ["0"]
                if "0" in codes:
                    attenue, fg_defaut, bg_defaut = False, True, True
                if "22" in codes:
                    attenue = False
                if "2" in codes:
                    attenue = True
                if "38" in codes:
                    fg_defaut = False
                if "39" in codes:
                    fg_defaut = True
                if "48" in codes:
                    bg_defaut = False
                if "49" in codes:
                    bg_defaut = True
                pos = m.end()
                continue
            pos += 1
            continue
        if c in (" ", "\xa0"):
            pos += 1
            continue
        return attenue, fg_defaut, bg_defaut
    return None


def _contenu_apres_marqueur_est_reel(ligne_brute):
    """⚠️ Reboucle GATE P2-ter (2026-09-22, même jour) : « brouillon » et
    « texte que `claude` écrit lui-même à cet endroit » ont été confondus.
    Mesuré sur session jetable, avec séquences ANSI (`-e`) :

    - un VRAI brouillon tapé est rendu en style PLAN (pas de SGR 2, avant-
      plan et arrière-plan par défaut) ;
    - le placeholder `"Try \\"…\\""` d'une session neuve, et l'indice `"Press
      up to edit queued messages"` d'un message mis en file, sont TOUS DEUX
      rendus ATTÉNUÉS (`\\x1b[2m`) ;
    - **l'ÉCHO transitoire** de notre propre texte, encore affiché le temps
      que le terminal se redessine après un `Enter` (mesuré : ~25-50 ms,
      voir le rapport de cette passe), est rendu dans une couleur de
      premier plan ET un arrière-plan NON PAR DÉFAUT (`38;5;239`/`48;5;237`
      pour le marqueur, `38;5;246` pour le texte) — sans `\\x1b[2m`.

    Aucune de ces trois formes ne doit refuser l'envoi suivant. Le critère
    retenu, POSITIF et NON ÉNUMÉRÉ (jamais une liste de messages connus,
    `PIEGES §21`) : le contenu est « réel » seulement si le PREMIER
    caractère visible après `❯` est rendu SANS AUCUN attribut spécial —
    pas atténué, avant-plan PAR DÉFAUT, arrière-plan PAR DÉFAUT. Tout
    habillage distinct (atténuation OU couleur OU fond) est traité comme
    NON réel, quel que soit son motif exact — la prochaine version de
    `claude` peut ajouter un nouvel indice sans casser ce critère, tant
    qu'elle continue de l'habiller différemment du texte réel (mesuré : le
    texte réel, lui, n'a JAMAIS porté le moindre attribut dans ce lot).
    """
    etat = _etat_ansi_apres_marqueur(ligne_brute)
    if etat is None:
        return False
    attenue, fg_defaut, bg_defaut = etat
    return (not attenue) and fg_defaut and bg_defaut


def _boite_compositeur(texte_capture):
    """Cherche le sandwich bordure HORIZONTALE (`─`×10+) / ligne `❯` EN
    COLONNE 0 / bordure HORIZONTALE — la DERNIÈRE occurrence (celle du bas,
    jamais une ligne d'historique qui commencerait aussi par `❯`, `PIEGES
    §27`), sur le texte PLAN (séquences ANSI retirées). Rend `(trouvee,
    vide)` — `vide` n'est signifiant que si `trouvee` est vrai.

    « Vide » signifie : rien après `❯` sinon un espace insécable (`U+00A0`),
    OU — reboucle GATE P2-ter — le contenu présent n'est pas « réel » au
    sens de `_contenu_apres_marqueur_est_reel` (écho transitoire, indice de
    mise en file, placeholder de session neuve). Seul un contenu rendu en
    style PLAN reste un BROUILLON, refusé."""
    if not isinstance(texte_capture, str) or not texte_capture:
        return False, False
    lignes_brutes = texte_capture.splitlines()
    lignes_planes = [_despouiller_ansi(l) for l in lignes_brutes]
    n = len(lignes_planes)
    for i in range(n - 3, -1, -1):  # de bas en haut : la boîte VIVANTE est la dernière
        if not _RE_BORDURE_COMPOSITEUR.match(lignes_planes[i].rstrip()):
            continue
        ligne_compositeur_plane = lignes_planes[i + 1]
        if not ligne_compositeur_plane.startswith("❯"):
            continue
        if not _RE_BORDURE_COMPOSITEUR.match(lignes_planes[i + 2].rstrip()):
            continue
        interieur_plan = ligne_compositeur_plane[1:]
        if interieur_plan.strip(" \xa0\t") == "":
            return True, True
        reel = _contenu_apres_marqueur_est_reel(lignes_brutes[i + 1])
        return True, not reel
    return False, False


def ecran_indique_occupation(texte_capture):
    """INFORMATIONNEL seulement (reboucle GATE P2-bis) — jamais un critère
    d'envoi, seulement le libellé `"occupee"` de `etat()`. Opère sur le
    texte PLAN (séquences ANSI retirées, reboucle P2-ter — les motifs
    n'ont pas changé, `-e` ne fait qu'ajouter des séquences qui ne les
    traversent pas dans les captures mesurées, mais on se confine au texte
    plan par prudence). Vrai si le spinner PRIMAIRE (`"…\\s*\\(\\d+s"`,
    immunisé à la troncature de fin de ligne) ou le motif SECOURS du pied
    de page (`"esc to interrupt"`, qui PEUT être tronqué — sa présence
    compte, son absence ne prouve rien) est présent."""
    if not isinstance(texte_capture, str):
        return False
    texte_plan = _despouiller_ansi(texte_capture)
    if _RE_OCCUPATION_SPINNER.search(texte_plan):
        return True
    if _MOTIF_OCCUPATION_PIED in texte_plan:
        return True
    return False


def ecran_semble_au_prompt(texte_capture):
    """HEURISTIQUE D'ENVOI (jamais une garde, condition 6 du GATE P1) —
    reboucle GATE P2-bis (2026-09-22) : « occupé » et « clavier
    indisponible » sont DEUX choses différentes, mesuré sur session jetable
    réelle — `claude` MET EN FILE (`promptSource: "queued"`, transcript
    réel) un texte tapé pendant qu'il travaille, il ne le perd ni ne le
    corrompt. Cette fonction ne teste donc PLUS l'occupation (voir
    `ecran_indique_occupation`, informationnelle seulement) : vrai si la
    boîte du compositeur est identifiée ET VIDE — qu'un signal d'occupation
    soit présent ou non. Faux si AUCUNE boîte n'est identifiable (dialogue
    de permission, écran de confiance initial, liste des tâches de fond —
    mesuré : un collage y est silencieusement ignoré, mais le `Enter`
    séparé qui suivrait ne l'est pas, d'où le refus EN AMONT) ou si un
    BROUILLON y est déjà présent (mesuré : un collage par-dessus se
    CONCATÈNE à l'octet près, sans séparateur — corrompant les deux
    messages)."""
    trouvee, vide = _boite_compositeur(texte_capture)
    return trouvee and vide


def compositeur_toujours_accessible(texte_capture):
    """Condition 5 du GATE P1, réinterprétée pour la reboucle P2-bis : le
    SECOND `capture-pane` (après collage, avant `Enter`) ne peut plus tester
    la VACUITÉ du compositeur — après un collage réussi, il porte NOTRE
    texte, donc n'est plus vide par construction. Ce qui doit rester vrai,
    c'est qu'aucun dialogue ne s'est interposé : la boîte est-elle TOUJOURS
    identifiable, contenu ou pas."""
    trouvee, _vide = _boite_compositeur(texte_capture)
    return trouvee


def etat(config_session):
    """`{"etat": "en_ligne"|"occupee"|"hors_ligne"|"injoignable"}`.

    `"injoignable"` : socket absent/illisible, ou serveur tmux qui ne répond
    pas. `"hors_ligne"` : le socket répond mais aucune session du nom
    configuré n'existe — DEUX états distincts, jamais confondus (D3).

    ⚠️ Reboucle GATE P2-bis : `"occupee"` est désormais purement
    INFORMATIONNEL (`ecran_indique_occupation`) — il ne dit PLUS « refusé
    à l'envoi », `POST /api/conversation` accepte un message que la session
    soit `"en_ligne"` OU `"occupee"`. Aucune boîte de compositeur
    identifiable (dialogue, écran de confiance, liste de tâches) retombe
    prudemment sur `"occupee"` : le panneau n'est pas dans son état de
    repos normal, sans qu'on puisse affirmer plus précisément lequel."""
    socket_tmux = resoudre_socket(config_session)
    nom = config_session.get("nom")
    if not _socket_lisible(socket_tmux) or not nom:
        return {"etat": "injoignable"}

    capture = capture_pane(socket_tmux, nom)
    if capture is None:
        # Chemin rare : distinguer hors_ligne (session absente) de
        # injoignable (canal en faute) coûte UN second appel — jamais payé
        # dans le cas commun où `capture-pane` réussit du premier coup.
        presente = _has_session(socket_tmux, nom)
        if presente is None:
            return {"etat": "injoignable"}
        if not presente:
            return {"etat": "hors_ligne"}
        return {"etat": "injoignable"}

    trouvee, _vide = _boite_compositeur(capture)
    if not trouvee:
        return {"etat": "occupee"}
    if ecran_indique_occupation(capture):
        return {"etat": "occupee"}
    return {"etat": "en_ligne"}


def resoudre_session_id(cmdline, repertoire_transcripts):
    """Rend `{"session_id": str, "source": "cmdline"|"recence",
    "divergence": bool}`, ou `None` si RIEN n'est résolvable.

    Primaire : `--resume <id>` extrait de `cmdline` (exact tant que le
    processus tourne, mesuré M1). Repli : le fichier `*.jsonl` le plus
    RÉCENT par `mtime` de `repertoire_transcripts` — jamais le plus
    volumineux. Une divergence entre les deux voies est toujours rapportée,
    jamais choisie en silence.

    Confinement (GATE P2, condition 4) : les DEUX voies sont rejetées si
    elles ne matchent pas `_RE_SESSION_ID` (hexadécimal/tirets, 1-64
    caractères) — une valeur rejetée se comporte comme absente, jamais
    comme une valeur à moitié acceptée."""
    id_cmdline = None
    m = _RE_RESUME.search(cmdline or "")
    if m and _RE_SESSION_ID.fullmatch(m.group(1)):
        id_cmdline = m.group(1)

    id_recence = None
    try:
        candidats = []
        with os.scandir(repertoire_transcripts) as entrees:
            for entree in entrees:
                if not entree.name.endswith(".jsonl"):
                    continue
                candidat_id = entree.name[:-len(".jsonl")]
                if not _RE_SESSION_ID.fullmatch(candidat_id):
                    continue  # nom hostile/hors forme : jamais retenu (D4)
                try:
                    if not entree.is_file(follow_symlinks=False):
                        continue
                    mtime = entree.stat().st_mtime
                except OSError:
                    continue
                candidats.append((mtime, candidat_id))
        if candidats:
            candidats.sort(key=lambda c: -c[0])
            id_recence = candidats[0][1]
    except (OSError, TypeError):
        id_recence = None

    if id_cmdline is None and id_recence is None:
        return None

    if id_cmdline is not None:
        session_id, source = id_cmdline, "cmdline"
    else:
        session_id, source = id_recence, "recence"

    divergence = bool(id_cmdline is not None and id_recence is not None
                       and id_cmdline != id_recence)
    return {"session_id": session_id, "source": source, "divergence": divergence}


def _pane_pid(socket_tmux, nom):
    ok, sortie = _executer([_tmux_bin(), "-S", socket_tmux, "list-panes",
                             "-t", _cible(nom), "-F", "#{pane_pid}"])
    if not ok:
        return None
    for ligne in sortie.splitlines():
        ligne = ligne.strip()
        if ligne.isdigit():
            return int(ligne)
    return None


def _cmdline_pid(pid):
    try:
        with open("/proc/%d/cmdline" % pid, "rb") as fichier:
            brut = fichier.read()
    except OSError:
        return ""
    return " ".join(p for p in brut.decode("utf-8", errors="replace").split("\x00") if p)


def session_id_courant(config_session):
    """`resoudre_session_id()`, alimentée par la chaîne `tmux list-panes` ->
    `pane_pid` -> `/proc/<pid>/cmdline` (chaîne M3) — RE-RÉSOLUE à chaque
    appel, jamais mémorisée (A2) : le `session-id` change au redémarrage."""
    socket_tmux = resoudre_socket(config_session)
    nom = config_session.get("nom")
    repertoire = config_session.get("repertoire_transcripts")
    cmdline = ""
    if socket_tmux and nom and _socket_lisible(socket_tmux):
        pid = _pane_pid(socket_tmux, nom)
        if pid is not None:
            cmdline = _cmdline_pid(pid)
    return resoudre_session_id(cmdline, repertoire)


def texte_valide_pty(texte):
    """D7 : refuse DEL (`0x7f`) et les C1 (`U+0080`-`U+009F`), EN PLUS de ce
    que `server._texte_conversation_valide` refuse déjà (NUL et C0 hors
    `\\n`/`\\t`). Fonction NEUVE, distincte : `_texte_conversation_valide`
    n'est PAS durcie, ses tests `feature-022` la figent."""
    for c in texte:
        code = ord(c)
        if code == 0x7F:
            return False
        if 0x80 <= code <= 0x9F:
            return False
        if code < 0x20 and c not in ("\n", "\t"):
            return False
    return True


def envoyer(config_session, texte):
    """Tape `texte` dans le composeur de la session déclarée puis `Enter`.

    Verrou (A6) tenu de la capture d'écran JUSQU'AU retour — transposition
    de S3.10. Rend un `dict` :
      `{"ok": True}`
      `{"ok": False, "raison": "injoignable"}`
      `{"ok": False, "raison": "session_absente"}`
      `{"ok": False, "raison": "compositeur_introuvable", "heuristique": True}`
      `{"ok": False, "raison": "brouillon_present", "heuristique": True}`
      `{"ok": False, "raison": "interrompu_apres_collage", "heuristique": True}`
      `{"ok": False, "raison": "echec_tmux"}`

    ⚠️ Reboucle GATE P2-bis : ce n'est PLUS l'occupation (« Claude
    travaille ») qui refuse ici — mesuré, un texte tapé pendant que la
    session travaille est mis EN FILE par `claude` lui-même
    (`promptSource: "queued"`), jamais perdu. Seuls `compositeur_introuvable`
    (dialogue, écran de confiance, liste de tâches) et `brouillon_present`
    (un collage s'y concatènerait, mesuré) refusent AVANT tout `paste-buffer`.
    Ne renvoie JAMAIS de `stderr` brut (condition 3 du GATE).
    """
    socket_tmux = resoudre_socket(config_session)
    nom = config_session.get("nom")
    if not _socket_lisible(socket_tmux) or not nom:
        return {"ok": False, "raison": "injoignable"}

    verrou = _verrou_pour(nom)
    with verrou:
        capture = capture_pane(socket_tmux, nom)
        if capture is None:
            presente = _has_session(socket_tmux, nom)
            if presente is False:
                return {"ok": False, "raison": "session_absente"}
            return {"ok": False, "raison": "injoignable"}
        trouvee, vide = _boite_compositeur(capture)
        if not trouvee:
            return {"ok": False, "raison": "compositeur_introuvable", "heuristique": True}
        if not vide:
            return {"ok": False, "raison": "brouillon_present", "heuristique": True}

        tmux_bin = _tmux_bin()
        ok, _s = _executer([tmux_bin, "-S", socket_tmux, "load-buffer",
                             "-b", _NOM_TAMPON, "-"], entree=texte.encode("utf-8"))
        if not ok:
            return {"ok": False, "raison": "echec_tmux"}
        try:
            # `-p` n'encadre le collage QUE si l'application a activé le
            # collage encadré (mesuré, docstring du module) : protection
            # CONDITIONNELLE, pas une garantie.
            ok, _s = _executer([tmux_bin, "-S", socket_tmux, "paste-buffer", "-p",
                                 "-b", _NOM_TAMPON, "-t", _cible(nom)])
            if not ok:
                return {"ok": False, "raison": "echec_tmux"}

            # Condition 5 du GATE : le point de non-retour est `Enter`, pas
            # `paste-buffer` — SECOND `capture-pane` après collage, AVANT
            # `Enter`. Teste que le COMPOSITEUR EST TOUJOURS LÀ (pas qu'il
            # est vide : il porte désormais notre texte) — un dialogue qui
            # se serait interposé entre temps ferait disparaître la boîte.
            # Sinon pas d'`Enter`, texte laissé visible.
            capture2 = capture_pane(socket_tmux, nom)
            if capture2 is None:
                return {"ok": False, "raison": "injoignable"}
            if not compositeur_toujours_accessible(capture2):
                return {"ok": False, "raison": "interrompu_apres_collage", "heuristique": True}

            ok, _s = _executer([tmux_bin, "-S", socket_tmux, "send-keys", "-t", _cible(nom), "Enter"])
            if not ok:
                return {"ok": False, "raison": "echec_tmux"}
            return {"ok": True}
        finally:
            _executer([tmux_bin, "-S", socket_tmux, "delete-buffer", "-b", _NOM_TAMPON])
