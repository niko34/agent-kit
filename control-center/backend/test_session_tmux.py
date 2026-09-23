#!/usr/bin/env python3
"""Gardes D3/D4/D5/D7/D8 pour `session_tmux.py` (feature-026, écrites AVANT
le module, `ADR-0038` — « gardes avant code, registre ATTENDU_ROUGE »).

    python3 control-center/backend/test_session_tmux.py

## ⚠️ Interdiction absolue, respectée dans ce fichier

Aucune commande de ce fichier ne touche la session réelle `claude-kit`
(PID 1474788, socket `/run/tmux-kit/tmux-0/default`). Chaque scénario qui a
besoin d'un VRAI serveur `tmux` en démarre un JETABLE, sur un socket sous
le répertoire scratchpad de cette passe, et le tue par PID CAPTURÉ
(`PIEGES §3`) — jamais par motif — en fin de test.

## Contrat attendu par `session_tmux.py` (livrable A du backend-developer)

Nommé ici pour rendre la garde exécutable dès que le module existe — reprise
littérale des décisions du journal de bord (architecte, GATE P1), pas une
architecture inventée par ce fichier :

- `resoudre_socket(config_session)` — D8 : `config_session` un `dict`
  `{"socket_tmux": …, "nom": …, "repertoire_transcripts": …}`. Rend le
  chemin de `config_session["socket_tmux"]`, **jamais** dérivé de
  `os.environ` (`TMUX`, `TMUX_TMPDIR`, `TMUX_PANE`) — le couplage
  accidentel mesuré le 2026-09-22 (le serveur actuel hérite ces variables
  de la session qui l'a lancé).
- `etat(config_session)` — D3 : rend
  `{"etat": "en_ligne"|"occupee"|"hors_ligne"|"injoignable", …}`.
  `"injoignable"` quand le socket est illisible/absent ; `"hors_ligne"`
  quand le socket répond mais qu'aucune session du nom configuré n'existe —
  DEUX états distincts, jamais confondus.
- `resoudre_session_id(cmdline, repertoire_transcripts)` — D4 : rend
  `{"session_id": str, "source": "cmdline"|"recence", "divergence": bool}`
  ou `None`. Primaire : `--resume <id>` extrait de `cmdline` (mesuré M1 :
  exact tant que le processus tourne). Repli : le fichier `*.jsonl` le
  plus RÉCENT par `mtime` du répertoire — **jamais** le plus VOLUMINEUX
  (mesuré par l'architecte : le plus gros transcript n'est pas l'actif,
  37,2 Mo contre 20,9 Mo). Le `session_id` retenu est toujours NOMMÉ, une
  divergence entre les deux voies est toujours RAPPORTÉE (jamais choisie en
  silence).
- `ecran_semble_au_prompt(texte_capture)` — D5, **HEURISTIQUE, jamais une
  garde** (condition 6 du GATE — le mot vaut jusque dans les noms de test,
  d'où le nom de cette fonction et de ce fichier, jamais `*_garde_*`).

  ⚠️ **Reboucle GATE P2 (2026-09-22)** : la première version ancrait sur une
  bordure VERTICALE (`│ … │`) — un dessin de test, jamais mesuré sur un
  `claude` réel. `claude` 2.1.278 n'a AUCUNE bordure verticale (mesuré en
  lecture seule sur `claude-kit`, PUIS sur une vraie session jetable). Le
  contrat RÉVISÉ, mesuré : vrai seulement si (1) un sandwich bordure
  HORIZONTALE (`─`×10+) / ligne `❯` EN COLONNE 0 / bordure HORIZONTALE est
  trouvé (la DERNIÈRE occurrence, jamais une ligne d'historique — ce même
  `❯` colonne 0 préfixe aussi chaque message déjà envoyé), (2) rien après
  `❯` sinon un espace INSÉCABLE (`U+00A0` — tout le reste est un BROUILLON,
  jamais traité comme prêt), (3) aucun signal d'occupation : ni le spinner
  PRIMAIRE `"…\\s*\\(\\d+s"` (zone de défilement, immunisé à la troncature de
  fin de ligne), ni le motif SECOURS `"esc to interrupt"` du pied de page
  (qui PEUT être tronqué par la largeur du panneau — sa présence compte, son
  absence ne prouve rien). Aucune recherche de sous-chaîne libre dans tout
  l'écran (`PIEGES §27`).
- `texte_valide_pty(texte)` — D7 : refuse DEL (`0x7f`) et les C1
  (`U+0080`–`U+009F`), EN PLUS de ce que `server._texte_conversation_valide`
  refuse déjà (NUL et C0 hors `\\n`/`\\t`). Fonction NEUVE, distincte de
  `server._texte_conversation_valide` — celle-ci n'est PAS durcie (ses
  tests `feature-022` la figent, note de l'architecte, journal de bord).
- Ciblage tmux : les CINQ sites qui ciblent une session passent par
  `"=<nom>:"` (`_cible()`), jamais `<nom>` nu — `-t <nom>` résout par
  PRÉFIXE (mesuré GATE P2 : `-t claude` atteint silencieusement
  `claude-kit-jetable`).
- `resoudre_session_id` confine les DEUX voies à
  `[0-9a-fA-F-]{1,64}` (GATE P2, condition 4) avant de les retenir.

## Discipline ATTENDU_ROUGE et mutation (D6)

Même mécanique que `test_fil.py` : `check_rouge()` absorbe un échec
ATTENDU (log seul), échoue si une entrée repasse au vert sans être retirée
(clause 2), et chaque entrée doit porter un lot de clôture nommé.

`session_tmux.py` existe désormais (lot 2). Les scénarios D5 ci-dessous sont
la preuve par MUTATION exigée par le GATE P2 : les anciens témoins dessinés
à la main (`_ANCIEN_ECRAN_*`, conservés) sont passés à la NOUVELLE
`ecran_semble_au_prompt` et DOIVENT échouer à produire `True` — la garde ne
tient que sur la forme RÉELLEMENT mesurée, pas sur une coïncidence de motif.
"""

import os
import subprocess
import sys
import tempfile
import time

_ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _ICI)

import server as SRV  # noqa: E402 — pour la baseline D7 (fonction EXISTANTE)

try:
    import session_tmux as ST  # noqa: E402
except ImportError:
    ST = None

_echecs = []
_tests = 0


def check(nom, condition, detail=""):
    global _tests
    _tests += 1
    if condition:
        print("  ok     %s" % nom)
    else:
        _echecs.append(nom)
        print("  ECHEC  %s%s" % (nom, (" : " + detail) if detail else ""))


ATTENDU_ROUGE = {
    # Toutes les entrées D3/D4/D5/D7/D8 ont fermé au lot 2 (backend-developer,
    # A1) : `session_tmux.py` existe et les 14 assertions comportementales
    # sont vertes (voir le rapport de cette passe). Registre vidé plutôt que
    # supprimé pour que la mécanique `check_rouge()`/clause (2) reste en
    # place, prête pour un futur livrable de ce même fichier.
}


def check_rouge(nom, condition, detail=""):
    global _tests
    entree = ATTENDU_ROUGE.get(nom)
    if condition:
        if entree is not None:
            _tests += 1
            _echecs.append(nom + "_ATTENDU_ROUGE_PASSE_SANS_ETRE_RETIRE")
            print("  ECHEC  %s : assertion VERTE mais l'entrée est encore dans "
                  "ATTENDU_ROUGE (clause 2) — la retirer" % nom)
        else:
            check(nom, True)
    else:
        if entree is not None:
            print("  (ATTENDU_ROUGE) %s : %s — clôture %s"
                  % (nom, detail, entree["lot_de_cloture"]))
        else:
            check(nom, False, detail)


# ---------------------------------------------------------------------------
# Fixtures tmux JETABLES — jamais la session réelle. Chaque serveur démarré
# ici est tué par PID CAPTURÉ en fin de programme (PIEGES §3).
# ---------------------------------------------------------------------------

_TMUX = None
_pids_serveurs_jetables = []


def _tmux_disponible():
    global _TMUX
    if _TMUX is None:
        import shutil
        _TMUX = shutil.which("tmux") or ""
    return bool(_TMUX)


def _demarrer_tmux_jetable(dossier, nom_session):
    """Démarre un serveur tmux JETABLE sur un socket dédié, une session
    nommée `nom_session`. Rend (socket, pid_serveur) ; `pid_serveur` est
    capturé pour l'arrêt final, jamais un motif.

    ⚠️ Mesuré PENDANT cette passe (et corrigé, PIEGES candidat) : `#{pid}`
    d'un pane rend, sur cette machine, le PID du SERVEUR tmux lui-même — pas
    celui d'un shell enfant dont il faudrait remonter le `PPid` (l'hypothèse
    initiale de ce fichier). Remonter quand même le `PPid` d'un PID qui EST
    déjà celui du serveur tue le mauvais processus (souvent `1`, `init` — le
    serveur, reparenté après détachement, a justement `PPid: 1`), et le
    serveur survit, orphelin, à la fin du test. Résolu ici par la même
    méthode que la capture des témoins D5 en tout début de cette passe :
    interroger qui tient réellement le socket (`lsof -t`), jamais dériver
    une relation de parenté supposée."""
    socket_chemin = os.path.join(dossier, "socket-%s" % nom_session)
    subprocess.run([_TMUX, "-S", socket_chemin, "new-session", "-d",
                     "-s", nom_session, "-x", "80", "-y", "24"],
                    check=True, capture_output=True)
    pid_a_tuer = None
    lsof_bin = None
    import shutil as _shutil
    lsof_bin = _shutil.which("lsof")
    if lsof_bin:
        sortie = subprocess.run([lsof_bin, "-t", socket_chemin],
                                 capture_output=True, text=True)
        for ligne in sortie.stdout.split():
            try:
                pid_a_tuer = int(ligne)
                break
            except ValueError:
                continue
    if pid_a_tuer is None:
        # Repli si `lsof` est indisponible : `#{pid}` du pane, mesuré
        # identique au PID serveur sur cette machine — jamais un `PPid`
        # dérivé, qui s'est avéré faux ici.
        sortie = subprocess.run([_TMUX, "-S", socket_chemin, "list-panes", "-a",
                                  "-F", "#{pid}"], check=True, capture_output=True, text=True)
        pid_a_tuer = int(sortie.stdout.strip().splitlines()[0])
    _pids_serveurs_jetables.append(pid_a_tuer)
    return socket_chemin, pid_a_tuer


def _arreter_tmux_jetables():
    for pid in _pids_serveurs_jetables:
        try:
            os.kill(pid, 15)
        except OSError:
            pass
    time.sleep(0.2)
    # Atteignabilité bruyante de l'ARRÊT lui-même : un PID mal résolu se
    # serait tu silencieusement avant ce correctif (voir le commentaire de
    # `_demarrer_tmux_jetable`) — vérifier ici que chaque PID capturé est
    # réellement mort, pas seulement que `kill()` n'a pas levé.
    survivants = []
    for pid in _pids_serveurs_jetables:
        try:
            os.kill(pid, 0)
            survivants.append(pid)
        except OSError:
            pass
    if survivants:
        print("  (!) %d serveur(s) tmux jetable(s) n'ont PAS pu être confirmés "
              "arrêtés : %r" % (len(survivants), survivants))


# ---------------------------------------------------------------------------
# D5 — ANCIENS témoins (lot 1), dessinés À LA MAIN, bordure VERTICALE — JAMAIS
# mesurés sur un vrai `claude`. Conservés UNIQUEMENT pour la preuve par
# mutation exigée par le GATE P2 : appliqués à la NOUVELLE
# `ecran_semble_au_prompt`, ils NE DOIVENT PLUS produire le verdict d'avant —
# sinon la garde tiendrait par coïncidence de motif, pas par la forme
# réellement mesurée.
# ---------------------------------------------------------------------------

_ANCIEN_ECRAN_A_PROMPT_PRET = """\
 FEATURE-026-MARQUEUR-JETABLE-A · session jetable de test, aucune donnee reelle
 (rien au-dessus, conversation vide)

╭──────────────────────────────────────────────────────────────────────────────╮
│ ❯                                                                         │
╰──────────────────────────────────────────────────────────────────────────────╯
  ? for shortcuts                                            auto-accept edits on
root@poolcontroller:~/agent-kit#
"""

# ---------------------------------------------------------------------------
# D5 — témoins RÉELS (reboucle GATE P2, 2026-09-22) : captures `tmux
# capture-pane -p` D'UN VRAI `claude` 2.1.278, sur une session JETABLE dédiée
# (`claude-witness`, socket `/tmp/f026gate2/sock/j.sock`, JAMAIS `claude-kit`
# — celui-ci n'a été lu qu'EN LECTURE SEULE, jamais écrit). Chaque scénario
# porte sa phrase-marqueur `FEATURE-026-MARQUEUR-JETABLE-REEL-*`, tapée EN
# TOUTES LETTRES dans le prompt envoyé à cette session jetable — provenance
# vérifiable, distincte des anciens marqueurs `-JETABLE-A/B/C` (sans
# `-REEL-`). La session jetable et son `claude` ont été terminés par PID
# capturé (`lsof -t <socket>`) après capture, `PIEGES §3`.
# ---------------------------------------------------------------------------

_ECRAN_REEL_A_PROMPT_VIDE = """\


❯ FEATURE-026-MARQUEUR-JETABLE-REEL-C liste les fichiers avec la commande shell
  ls -la

  Listed 1 directory

● Le répertoire /tmp/f026gate2/repo est vide — il ne contient que . et .., aucun
  fichier ni sous-répertoire (y compris cachés).

✻ Cooked for 3s · done 4:31 PM

❯ FEATURE-026-MARQUEUR-JETABLE-REEL-D cree un fichier test.txt contenant le mot
  bonjour avec la commande shell : echo bonjour > test.txt

  Read 1 file
  ⎿  Interrupted · What should Claude do instead?

✻ Worked for 3s · done 4:31 PM
                                                  Ctrl+Y to paste deleted text
────────────────────────────────────────────────────────────────────────────────
❯ 
────────────────────────────────────────────────────────────────────────────────
  ⏸ manual mode on · ? for shortcuts · ← for agents
"""

_ECRAN_REEL_B_REPONSE_EN_COURS = """\

 ▐▛███▛█   Claude Code v2.1.278
▝▜██████▀  Opus 5 (1M context) · Claude Team
  ▝▝ ▝▝    /tmp/f026gate2/repo


❯ FEATURE-026-MARQUEUR-JETABLE-REEL-A dis juste bonjour en une ligne

●









· Seasoning… (0s · ↓ 2 tokens)
  You've used 80% of your weekly limit · resets Sep 26, 11am (UTC) · Run /usa…
────────────────────────────────────────────────────────────────────────────────
❯ 
────────────────────────────────────────────────────────────────────────────────
  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt · ← for agents
"""

_ECRAN_REEL_C_DIALOGUE_PERMISSION = """\

✻ Cooked for 3s · done 4:31 PM

❯ FEATURE-026-MARQUEUR-JETABLE-REEL-D cree un fichier test.txt contenant le mot
  bonjour avec la commande shell : echo bonjour > test.txt

● Creating test.txt containing bonjour
  ⎿  $ echo bonjour > test.txt && cat test.txt

────────────────────────────────────────────────────────────────────────────────
 Bash command
 Tip: auto mode handles these prompts for you — choose "switch to auto mode"
 below

   echo bonjour > test.txt && cat test.txt
   Create test.txt containing bonjour

 Do you want to proceed?
 ❯ 1. Yes
   2. Yes, and always allow access to /tmp/f026gate2/repo from this project
   3. Yes, and switch to auto mode · auto mode handles these prompts for you
   4. No

 Esc to cancel · Tab to amend
"""

_ECRAN_REEL_D_BROUILLON = """\


❯ FEATURE-026-MARQUEUR-JETABLE-REEL-C liste les fichiers avec la commande shell
  ls -la

  Listed 1 directory

● Le répertoire /tmp/f026gate2/repo est vide — il ne contient que . et .., aucun
  fichier ni sous-répertoire (y compris cachés).

✻ Cooked for 3s · done 4:31 PM

❯ FEATURE-026-MARQUEUR-JETABLE-REEL-D cree un fichier test.txt contenant le mot
  bonjour avec la commande shell : echo bonjour > test.txt

  Read 1 file
  ⎿  Interrupted · What should Claude do instead?

✻ Worked for 3s · done 4:31 PM

────────────────────────────────────────────────────────────────────────────────
❯ FEATURE-026-MARQUEUR-JETABLE-REEL-E brouillon non envoye
────────────────────────────────────────────────────────────────────────────────
  ⏸ manual mode on
"""

# ⚠️ Reboucle GATE P2-bis (2026-09-22, même jour) : mesuré sur session
# jetable réelle — un texte tapé PENDANT que `claude` travaille est ACCEPTÉ
# et MIS EN FILE (`promptSource: "queued"` au transcript, jamais perdu, la
# réponse au message mis en file arrive après la tâche en cours). Le témoin
# B_REPONSE_EN_COURS, INCHANGÉ, passe donc de témoin de REFUS à témoin
# D'ACCEPTATION — l'assertion s'inverse, PIEGES §30 : on ne supprime pas le
# témoin, on corrige ce qu'il est censé prouver.
_ECRANS_D5 = {
    "D5_ecran_reel_A_prompt_vide_vrai": (_ECRAN_REEL_A_PROMPT_VIDE, "FEATURE-026-MARQUEUR-JETABLE-REEL", True),
    "D5_ecran_reel_B_reponse_en_cours_accepte_mise_en_file": (_ECRAN_REEL_B_REPONSE_EN_COURS, "FEATURE-026-MARQUEUR-JETABLE-REEL", True),
    "D5_ecran_reel_C_dialogue_permission_faux": (_ECRAN_REEL_C_DIALOGUE_PERMISSION, "FEATURE-026-MARQUEUR-JETABLE-REEL", False),
    "D5_ecran_reel_D_brouillon_faux": (_ECRAN_REEL_D_BROUILLON, "FEATURE-026-MARQUEUR-JETABLE-REEL", False),
}


def test_D5_provenance_et_fixtures():
    # Atteignabilité bruyante : chaque témoin porte SA phrase-marqueur —
    # preuve de provenance (condition 8 du GATE P1, reconduite au P2), pas
    # une capture caviardée de la session réelle.
    for nom, (texte, marqueur, _attendu) in _ECRANS_D5.items():
        check("%s_porte_son_marqueur" % nom, marqueur in texte)


def test_D5_heuristique_ancree_sur_la_forme_reelle():
    if ST is None:
        for nom in _ECRANS_D5:
            check_rouge(nom, False, "session_tmux.py absent")
        return
    for nom, (texte, _marqueur, attendu) in _ECRANS_D5.items():
        obtenu = ST.ecran_semble_au_prompt(texte)
        check_rouge(nom, obtenu == attendu, "attendu %r, obtenu %r" % (attendu, obtenu))


def test_D5_ancien_dessin_ne_satisfait_plus_le_nouveau_format():
    """Preuve par MUTATION exigée par le GATE P2 : le témoin « prêt » d'AVANT
    (bordure verticale `│ … │`, dessiné à la main) ne doit PLUS être reconnu
    comme prêt par la nouvelle détection — sinon la garde tiendrait par
    coïncidence de motif, jamais par la forme réellement mesurée."""
    if ST is None:
        check_rouge("D5_ancien_dessin_ne_produit_plus_true", False, "session_tmux.py absent")
        return
    obtenu = ST.ecran_semble_au_prompt(_ANCIEN_ECRAN_A_PROMPT_PRET)
    check("D5_ancien_dessin_ne_produit_plus_true", obtenu is False,
          "l'ancien témoin (bordure verticale, jamais mesuré) est encore "
          "reconnu comme prêt : la garde ne dépend plus de la forme réelle — obtenu %r" % (obtenu,))


def test_D5_capture_reelle_lecture_seule_claude_kit_rend_false():
    """Capture RÉELLE, EN LECTURE SEULE, de `claude-kit` (interdiction
    d'écriture respectée — aucune commande de ce fichier n'écrit vers cette
    session) : au moment de la mesure GATE P2, le compositeur portait un
    BROUILLON non envoyé (« Déplace les specs vers done ») pendant qu'un
    sous-agent tournait. `ecran_semble_au_prompt` doit rendre `False` — un
    brouillon existant n'est jamais un panneau prêt à recevoir un envoi."""
    if ST is None:
        check_rouge("D5_capture_reelle_claude_kit_brouillon_rend_false", False, "session_tmux.py absent")
        return
    capture_lecture_seule = (
        "✻ Waiting for 1 background agent to finish\n"
        "\n"
        "────────────────────────────────────────────────────────────────────────────────\n"
        "❯\xa0Déplace les specs vers done\n"
        "────────────────────────────────────────────────────────────────────────────────\n"
        "  ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents · ↓ to manage\n"
    )
    obtenu = ST.ecran_semble_au_prompt(capture_lecture_seule)
    check("D5_capture_reelle_claude_kit_brouillon_rend_false", obtenu is False,
          "obtenu %r" % (obtenu,))


def test_D5_compositeur_toujours_accessible_ignore_le_contenu():
    """`compositeur_toujours_accessible` (condition 5 du GATE P1, TOCTOU
    post-collage) teste que la BOÎTE est encore là, PAS qu'elle est vide —
    après un collage réussi elle porte notre texte. Vrai sur les 3 témoins
    RÉELS qui ont une boîte (vide ou non), FAUX sur le dialogue de
    permission (pas de boîte du tout)."""
    if ST is None:
        for suffixe in ("A", "B", "D", "C"):
            check("D5_compositeur_toujours_accessible_%s" % suffixe, False, "session_tmux.py absent")
        return
    check("D5_compositeur_toujours_accessible_A",
          ST.compositeur_toujours_accessible(_ECRAN_REEL_A_PROMPT_VIDE) is True)
    check("D5_compositeur_toujours_accessible_B",
          ST.compositeur_toujours_accessible(_ECRAN_REEL_B_REPONSE_EN_COURS) is True)
    check("D5_compositeur_toujours_accessible_D_brouillon_compte_quand_meme",
          ST.compositeur_toujours_accessible(_ECRAN_REEL_D_BROUILLON) is True,
          "un compositeur NON VIDE reste ACCESSIBLE — c'est justement le cas "
          "attendu juste après un collage réussi")
    check("D5_compositeur_toujours_accessible_C_dialogue_absent",
          ST.compositeur_toujours_accessible(_ECRAN_REEL_C_DIALOGUE_PERMISSION) is False,
          "aucune boîte dans un dialogue de permission : doit rester False")


# ---------------------------------------------------------------------------
# Reboucle GATE P2-ter (2026-09-22, même jour) : « brouillon » et « texte
# écrit par `claude` lui-même à cet endroit » ont été confondus — mesuré,
# l'écho transitoire de notre propre envoi (~25-260 ms selon l'état, JAMAIS
# borné à une durée fixe fiable — voir le rapport de cette passe) et les
# indices de mise en file / session neuve font tous échouer l'ancien test
# « rien après ❯ ». Les TROIS lignes ci-dessous sont COPIÉES TELLES QUELLES
# depuis des captures RÉELLES (`tmux capture-pane -p -e`, session jetable
# dédiée, jamais `claude-kit`) — bordures et pied de page RÉELS d'autres
# captures de la MÊME session, assemblés autour de la ligne mesurée qui
# importe pour ce test.
# ---------------------------------------------------------------------------

_BORDURE_REELLE = "\x1b[38;5;244m────────────────────────────────────────────────────────────────────────────────"
_PIED_REEL = "\x1b[39m  \x1b[38;5;220m⏵⏵ auto mode on\x1b[38;5;246m (shift+tab to cycle) · ← for agents\x1b[39m"

# Écho transitoire RÉEL (composeur avec fond/avant-plan non par défaut,
# `38;5;239`/`48;5;237`/`38;5;246` — mesuré juste après un `Enter`, une
# fenêtre qui a persisté jusqu'à 260 ms dans un des essais).
_ECRAN_REEL_ECHO_TRANSITOIRE = "\n".join([
    _BORDURE_REELLE,
    "\x1b[38;5;239m❯ \x1b[38;5;246mFEATURE-026-MARQUEUR-POLL-ANSI-2\x1b[39m",
    _BORDURE_REELLE,
    _PIED_REEL,
]) + "\n"

# Indice RÉEL de mise en file (« Press up to edit queued messages »),
# mesuré ATTÉNUÉ (`\x1b[2m`).
_ECRAN_REEL_HINT_MISE_EN_FILE = "\n".join([
    _BORDURE_REELLE,
    "\x1b[38;5;246m❯\xa0\x1b[2m\x1b[39mPress up to edit queued messages\x1b[0m",
    _BORDURE_REELLE,
    _PIED_REEL,
]) + "\n"

# Placeholder RÉEL de session neuve (« Try "…" »), capturé avec sa propre
# bordure et son propre pied de page — fichier complet, pas un montage.
_ECRAN_REEL_PLACEHOLDER_SESSION_NEUVE = "\n".join([
    "\x1b[38;5;244m────────────────────────────────────────────────────────────────────────────────",
    '\x1b[39m❯\xa0\x1b[2mTry "write a test for <filepath>"\x1b[0m',
    "\x1b[38;5;244m────────────────────────────────────────────────────────────────────────────────",
    "\x1b[39m  \x1b[38;5;220m⏵⏵ auto mode on\x1b[38;5;246m (shift+tab to cycle) · ← for agents\x1b[39m",
]) + "\n"

# Vrai brouillon RÉEL, mesuré PLAN (aucune séquence spéciale) — laissé
# 2 secondes sans jamais changer de style (persistance confirmée par
# exécution, voir le rapport de cette passe).
_ECRAN_REEL_VRAI_BROUILLON_PLAN = "\n".join([
    _BORDURE_REELLE,
    "\x1b[39m❯\xa0FEATURE-026-MARQUEUR-BROUILLON-PERSISTANT verification duree",
    _BORDURE_REELLE,
    _PIED_REEL,
]) + "\n"

# ---------------------------------------------------------------------------
# C3 (reboucle GATE, validation par mutation) : « dernière occurrence, pas
# la première » (`PIEGES §27`) n'était exercée par AUCUN témoin — aucun
# écran capturé ne contenait deux sandwiches complets. Assemblé à partir de
# DEUX morceaux RÉELS, dit ici explicitement : le sandwich du HAUT
# (brouillon RÉEL mesuré, non vide) précède du texte d'historique, puis le
# sandwich du BAS (composeur RÉEL vide) — le vivant est le second, jamais
# le premier.
# ---------------------------------------------------------------------------
_ECRAN_DEUX_SANDWICHES_LE_BAS_FAIT_FOI = "\n".join([
    _BORDURE_REELLE,
    "\x1b[39m❯\xa0FEATURE-026-MARQUEUR-BROUILLON-PERSISTANT verification duree",
    _BORDURE_REELLE,
    "  (texte d'historique entre les deux sandwiches, comme un défilement réel)",
    "",
    _BORDURE_REELLE,
    "❯\xa0",
    _BORDURE_REELLE,
    _PIED_REEL,
]) + "\n"


def test_C3_deux_sandwiches_le_bas_fait_foi():
    """C3 : le sandwich du BAS (composeur VIVANT, vide) doit décider, JAMAIS
    celui du HAUT (brouillon d'un tour antérieur, non vide) — sinon un
    envoi serait refusé à tort à chaque fois qu'un ancien brouillon reste
    visible plus haut dans le défilement."""
    if ST is None:
        check("C3_deux_sandwiches_le_bas_fait_foi", False, "session_tmux.py absent")
        return
    obtenu = ST.ecran_semble_au_prompt(_ECRAN_DEUX_SANDWICHES_LE_BAS_FAIT_FOI)
    check("C3_deux_sandwiches_le_bas_fait_foi", obtenu is True,
          "le sandwich du bas est VIDE, l'envoi doit être accepté — obtenu %r" % (obtenu,))


def test_D5_echo_transitoire_et_indices_claude_nempechent_plus_lenvoi():
    """Reboucle GATE P2-ter : ces trois textes sont écrits PAR `claude`
    LUI-MÊME à l'endroit du compositeur — jamais par l'utilisateur. Aucun
    n'a de raison de bloquer l'envoi suivant. Le critère retenu est
    STRUCTUREL (style ANSI), jamais une énumération de ces trois chaînes
    précises (`PIEGES §21`) : un futur indice, quel que soit son texte,
    passera tant qu'il reste habillé différemment du texte réel — ce que
    `claude` a fait dans les TROIS cas mesurés ici, sans exception."""
    if ST is None:
        for suffixe in ("echo", "file", "placeholder"):
            check("D5_%s_naccepte_pas_envoi" % suffixe, False, "session_tmux.py absent")
        return
    check("D5_echo_transitoire_naccepte_pas_envoi",
          ST.ecran_semble_au_prompt(_ECRAN_REEL_ECHO_TRANSITOIRE) is True,
          "l'écho transitoire de notre propre envoi ne doit plus refuser le suivant")
    check("D5_hint_mise_en_file_naccepte_pas_envoi",
          ST.ecran_semble_au_prompt(_ECRAN_REEL_HINT_MISE_EN_FILE) is True,
          "l'indice « Press up to edit queued messages » est écrit par claude, pas un brouillon")
    check("D5_placeholder_session_neuve_naccepte_pas_envoi",
          ST.ecran_semble_au_prompt(_ECRAN_REEL_PLACEHOLDER_SESSION_NEUVE) is True,
          "le placeholder « Try … » d'une session neuve est écrit par claude, pas un brouillon")
    # Le vrai brouillon, mesuré PLAN, reste refusé — sinon la correction
    # ouvrirait exactement le trou qu'elle prétend fermer.
    check("D5_vrai_brouillon_plan_reste_refuse",
          ST.ecran_semble_au_prompt(_ECRAN_REEL_VRAI_BROUILLON_PLAN) is False,
          "un brouillon RÉEL (style plan, mesuré persistant 2 s sans changer) doit rester refusé")


def test_D5_spinner_seul_alimente_le_libelle_occupee_sans_bloquer_lenvoi():
    """Témoin HYBRIDE, et déclaré comme tel : contenu RÉEL
    (`_ECRAN_REEL_B_REPONSE_EN_COURS`, spinner et boîte inchangés), pied de
    page RETOUCHÉ pour reproduire la troncature MESURÉE par le GATE sur
    `claude-kit` en lecture seule (`"… · /tasks to see subagents · esc to
    int…"` — le motif complet `"esc to interrupt"` n'y survit PAS).

    ⚠️ Reboucle GATE P2-bis : ce témoin ne teste plus un REFUS. Le motif
    PRIMAIRE (spinner) doit continuer à alimenter `ecran_indique_occupation`
    (le libellé `"occupee"` de `etat()`, informationnel) INDÉPENDAMMENT de
    la troncature du motif secours — mais `ecran_semble_au_prompt` (le
    critère d'ENVOI) doit rester `True` : le compositeur est vide, la
    session accepte la mise en file, quel que soit le libellé affiché."""
    if ST is None:
        check("D5_spinner_seul_alimente_occupee", False, "session_tmux.py absent")
        check("D5_spinner_seul_envoi_reste_accepte", False, "session_tmux.py absent")
        return
    pied_tronque = ("  ⏵⏵ auto mode on (shift+tab to cycle) · /tasks to see "
                     "subagents · esc to int…")
    texte = _ECRAN_REEL_B_REPONSE_EN_COURS.replace(
        "  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt · ← for agents",
        pied_tronque)
    check("D5_spinner_seul_temoin_pied_bien_tronque",
          "esc to interrupt" not in texte and "esc to int" in texte,
          "le témoin doit reproduire une troncature RÉELLE, ni plus ni moins")
    occupation = ST.ecran_indique_occupation(texte)
    check("D5_spinner_seul_alimente_occupee", occupation is True,
          "pied de page tronqué (motif secours absent), spinner RÉEL "
          "toujours présent : le libellé occupee doit rester alimenté — obtenu %r" % (occupation,))
    envoi = ST.ecran_semble_au_prompt(texte)
    check("D5_spinner_seul_envoi_reste_accepte", envoi is True,
          "occupation affichée ou non, le compositeur VIDE doit rester "
          "disponible à l'envoi (mise en file) — obtenu %r" % (envoi,))


def test_D5_motif_secours_alimente_occupee_sans_bloquer_lenvoi():
    """Témoin SYNTHÉTIQUE, déclaré comme tel — PAS une capture. Vérifie que
    le motif SECOURS du pied de page (`"esc to interrupt"`) alimente À LUI
    SEUL `ecran_indique_occupation` (défense en profondeur si un futur
    habillage de `claude` ne porte plus le spinner `"…(<N>s"` mesuré dans ce
    lot) — reboucle GATE P2-bis : il n'empêche PLUS `ecran_semble_au_prompt`
    de rendre `True`, puisque le compositeur reste vide. Aucune capture
    réelle ne démontre encore ce chemin exclusivement — ce cas documente le
    filet, il ne prétend pas l'avoir observé en conditions réelles."""
    if ST is None:
        check("D5_motif_secours_seul_alimente_occupee", False, "session_tmux.py absent")
        check("D5_motif_secours_seul_envoi_reste_accepte", False, "session_tmux.py absent")
        return
    texte = (
        "────────────────────────────────────────────────────────────────────────────────\n"
        "❯\xa0\n"
        "────────────────────────────────────────────────────────────────────────────────\n"
        "  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt · ← for agents\n"
    )
    occupation = ST.ecran_indique_occupation(texte)
    check("D5_motif_secours_seul_alimente_occupee", occupation is True, "obtenu %r" % (occupation,))
    envoi = ST.ecran_semble_au_prompt(texte)
    check("D5_motif_secours_seul_envoi_reste_accepte", envoi is True, "obtenu %r" % (envoi,))


def test_D3_socket_absent_vs_session_absente():
    if ST is None:
        check_rouge("D3_socket_absent_rend_injoignable", False, "session_tmux.py absent")
        check_rouge("D3_socket_present_session_absente_rend_hors_ligne", False, "session_tmux.py absent")
        check_rouge("D3_injoignable_distinct_de_hors_ligne", False, "session_tmux.py absent")
        return

    with tempfile.TemporaryDirectory(prefix="feature026-d3-") as dossier:
        # (a) Socket ABSENT — jamais démarré, chemin qui n'a jamais existé.
        config_absent = {"socket_tmux": os.path.join(dossier, "jamais-cree.sock"),
                          "nom": "claude-kit-test", "repertoire_transcripts": dossier}
        etat_a = ST.etat(config_absent)
        check_rouge("D3_socket_absent_rend_injoignable",
                     isinstance(etat_a, dict) and etat_a.get("etat") == "injoignable",
                     "obtenu %r" % (etat_a,))

        if not _tmux_disponible():
            check_rouge("D3_socket_present_session_absente_rend_hors_ligne", False, "tmux introuvable sur cette machine")
            check_rouge("D3_injoignable_distinct_de_hors_ligne", False, "tmux introuvable sur cette machine")
            return

        # (b) Socket PRÉSENT (serveur tmux jetable réel), mais AUCUNE session
        # du nom configuré — un nom différent est démarré à dessein.
        socket_reel, _pid = _demarrer_tmux_jetable(dossier, "jetable-autre-nom")
        config_hors_ligne = {"socket_tmux": socket_reel, "nom": "claude-kit-test",
                              "repertoire_transcripts": dossier}
        etat_b = ST.etat(config_hors_ligne)
        check_rouge("D3_socket_present_session_absente_rend_hors_ligne",
                     isinstance(etat_b, dict) and etat_b.get("etat") == "hors_ligne",
                     "obtenu %r" % (etat_b,))
        check_rouge("D3_injoignable_distinct_de_hors_ligne",
                     isinstance(etat_a, dict) and isinstance(etat_b, dict)
                     and etat_a.get("etat") != etat_b.get("etat"),
                     "les deux états ne sont pas distingués : %r vs %r" % (etat_a, etat_b))


def test_D4_resolution_session_id():
    if ST is None:
        check_rouge("D4_choisit_par_cmdline_pas_par_taille", False, "session_tmux.py absent")
        check_rouge("D4_session_id_toujours_nomme", False, "session_tmux.py absent")
        check_rouge("D4_pas_de_memoisation_second_appel_reflete_le_redemarrage", False, "session_tmux.py absent")
        check_rouge("D4_divergence_rapportee_quand_les_deux_voies_different", False, "session_tmux.py absent")
        return

    with tempfile.TemporaryDirectory(prefix="feature026-d4-") as dossier:
        id_gros_vieux = "11111111-1111-1111-1111-111111111111"
        id_petit_recent = "22222222-2222-2222-2222-222222222222"
        chemin_gros = os.path.join(dossier, id_gros_vieux + ".jsonl")
        chemin_petit = os.path.join(dossier, id_petit_recent + ".jsonl")
        with open(chemin_gros, "w") as f:
            f.write("x" * (2 * 1024 * 1024))  # gros : 2 Mio
        with open(chemin_petit, "w") as f:
            f.write("y" * 1024)  # petit : 1 Kio
        maintenant = time.time()
        os.utime(chemin_gros, (maintenant - 3600, maintenant - 3600))  # vieux, 1h
        os.utime(chemin_petit, (maintenant, maintenant))  # récent

        cmdline_pointe_sur_le_petit = (
            "claude --remote-control kit-lxc --resume %s" % id_petit_recent)
        resultat = ST.resoudre_session_id(cmdline_pointe_sur_le_petit, dossier)
        check_rouge("D4_session_id_toujours_nomme",
                     isinstance(resultat, dict) and "session_id" in resultat and resultat["session_id"],
                     "obtenu %r" % (resultat,))
        check_rouge("D4_choisit_par_cmdline_pas_par_taille",
                     isinstance(resultat, dict) and resultat.get("session_id") == id_petit_recent,
                     "un tri par taille aurait choisi %s (2 Mio) ; obtenu %r" % (id_gros_vieux, resultat))

        # Divergence : cmdline pointe sur le GROS/VIEUX alors que la récence
        # pointerait sur le PETIT/RÉCENT — les deux voies désaccordent,
        # ça doit être RAPPORTÉ, jamais tranché en silence.
        cmdline_pointe_sur_le_gros = (
            "claude --remote-control kit-lxc --resume %s" % id_gros_vieux)
        resultat_divergent = ST.resoudre_session_id(cmdline_pointe_sur_le_gros, dossier)
        check_rouge("D4_divergence_rapportee_quand_les_deux_voies_different",
                     isinstance(resultat_divergent, dict) and resultat_divergent.get("divergence") is True,
                     "obtenu %r" % (resultat_divergent,))

        # Pas de mémoïsation : un second appel avec un cmdline DIFFÉRENT
        # (simulateur de redémarrage : `Restart=on-failure` relance sans
        # `--resume`, sur un fichier neuf) doit refléter le NOUVEL état, pas
        # rendre le premier résultat en cache.
        id_neuf_apres_redemarrage = "33333333-3333-3333-3333-333333333333"
        chemin_neuf = os.path.join(dossier, id_neuf_apres_redemarrage + ".jsonl")
        with open(chemin_neuf, "w") as f:
            f.write("z" * 10)
        os.utime(chemin_neuf, (maintenant + 10, maintenant + 10))
        resultat_apres_redemarrage = ST.resoudre_session_id("", dossier)  # pas de --resume après redémarrage (mesuré : CLAUDE_KIT_ARGS vide)
        check_rouge("D4_pas_de_memoisation_second_appel_reflete_le_redemarrage",
                     isinstance(resultat_apres_redemarrage, dict)
                     and resultat_apres_redemarrage.get("session_id") == id_neuf_apres_redemarrage,
                     "obtenu %r, attendu le fichier le plus RÉCENT après « redémarrage »" % (resultat_apres_redemarrage,))


def test_D7_pty():
    # -- Baseline RÉELLE, mutation-testable maintenant : la fonction
    # EXISTANTE `server._texte_conversation_valide` accepte DEL et les C1 —
    # fait établi par l'architecte, ici RÉ-ÉTABLI par exécution, et gardé
    # pour que personne ne la durcisse par erreur (ses tests `feature-022`
    # la figent ; le refus supplémentaire doit vivre dans `session_tmux`).
    check("D7_baseline_existante_accepte_DEL",
          SRV._texte_conversation_valide("bonjour\x7f"))
    check("D7_baseline_existante_accepte_C1",
          SRV._texte_conversation_valide("bonjour\u0085"))

    if ST is None:
        check_rouge("D7_pty_refuse_DEL", False, "session_tmux.py absent")
        check_rouge("D7_pty_refuse_C1", False, "session_tmux.py absent")
        check_rouge("D7_pty_refuse_toujours_NUL_et_C0", False, "session_tmux.py absent")
        return

    check_rouge("D7_pty_refuse_DEL",
                 ST.texte_valide_pty("bonjour\x7f") is False)
    check_rouge("D7_pty_refuse_C1",
                 ST.texte_valide_pty("bonjour\u0085") is False)
    check_rouge("D7_pty_refuse_toujours_NUL_et_C0",
                 ST.texte_valide_pty("bonjour\x00") is False
                 and ST.texte_valide_pty("bonjour\x1b") is False)


def test_D8_socket_config_jamais_environnement():
    if not _tmux_disponible():
        check_rouge("D8_socket_vient_de_la_config_jamais_de_lenv", False, "tmux introuvable sur cette machine")
        return

    with tempfile.TemporaryDirectory(prefix="feature026-d8-leurre-") as dossier_leurre, \
         tempfile.TemporaryDirectory(prefix="feature026-d8-bon-") as dossier_bon:
        socket_leurre, _pid_l = _demarrer_tmux_jetable(dossier_leurre, "leurre")
        socket_bon, _pid_b = _demarrer_tmux_jetable(dossier_bon, "bon")

        if ST is None:
            check_rouge("D8_socket_vient_de_la_config_jamais_de_lenv", False, "session_tmux.py absent")
            return

        config = {"socket_tmux": socket_bon, "nom": "bon", "repertoire_transcripts": dossier_bon}
        environ_sauve = dict(os.environ)
        try:
            os.environ["TMUX_TMPDIR"] = os.path.dirname(socket_leurre)
            os.environ["TMUX"] = socket_leurre + ",0,0"
            os.environ["TMUX_PANE"] = "%0"
            resolu = ST.resoudre_socket(config)
        finally:
            os.environ.clear()
            os.environ.update(environ_sauve)

        check_rouge("D8_socket_vient_de_la_config_jamais_de_lenv",
                     resolu == socket_bon,
                     "TMUX_TMPDIR pointait sur le leurre (%s) ; obtenu %r, attendu %r"
                     % (socket_leurre, resolu, socket_bon))


# ---------------------------------------------------------------------------
# Condition 3 du GATE P2 — ciblage EXACT (`=<nom>:`), jamais `<nom>` nu.
# Mesuré par le GATE, reproduit ici sur socket JETABLE : `-t claude` (nu)
# résout par PRÉFIXE et atteint SILENCIEUSEMENT `claude-kit-jetable` dès
# qu'aucune session ne s'appelle EXACTEMENT `claude`.
# ---------------------------------------------------------------------------

def test_condition3_ciblage_exact_evite_la_collision_par_prefixe():
    if not _tmux_disponible():
        check("condition3_ciblage_exact", False, "tmux introuvable sur cette machine")
        return
    if ST is None:
        check("condition3_ciblage_exact", False, "session_tmux.py absent")
        return

    with tempfile.TemporaryDirectory(prefix="feature026-condition3-") as dossier:
        socket_chemin, _pid = _demarrer_tmux_jetable(dossier, "claude-kit-jetable")
        # Deuxième session sur le MÊME socket — celle qu'une résolution par
        # préfixe atteindrait à tort en visant "claude".
        subprocess.run([_TMUX, "-S", socket_chemin, "new-session", "-d",
                         "-s", "claude", "-x", "80", "-y", "24"],
                        check=True, capture_output=True)

        marqueur = "MARQUEUR-CONDITION3-CLAUDE-KIT-JETABLE"
        subprocess.run([_TMUX, "-S", socket_chemin, "send-keys", "-t",
                         "=claude-kit-jetable:", "-l", marqueur],
                        check=True, capture_output=True)

        # `capture_pane(socket, "claude")` doit rendre l'écran de LA session
        # "claude" — VIDE, sans le marqueur tapé dans l'autre session —
        # jamais celui de "claude-kit-jetable" par collision de préfixe.
        capture_claude = ST.capture_pane(socket_chemin, "claude")
        check("condition3_capture_pane_cible_exactement_la_session_demandee",
              capture_claude is not None and marqueur not in capture_claude,
              "le marqueur de 'claude-kit-jetable' est visible en ciblant "
              "'claude' : collision par préfixe non corrigée — capture=%r"
              % (capture_claude,))

        # `has_session`/`etat()` : même exigence sur has-session.
        etat_claude = ST.etat({"socket_tmux": socket_chemin, "nom": "claude",
                               "repertoire_transcripts": dossier})
        check("condition3_etat_distingue_bien_les_deux_sessions",
              etat_claude.get("etat") in ("en_ligne", "occupee"),
              "obtenu %r — la session 'claude' existe bien, etat() doit la "
              "voir vivante, pas 'hors_ligne' par confusion" % (etat_claude,))


def test_condition3_echec_ferme_quand_aucune_correspondance_exacte():
    """Repli fail-closed : SEULE `claude-kit-jetable` existe (aucune session
    nommée exactement `claude`) — cibler `claude` doit échouer PROPREMENT
    (`None`), jamais matcher `claude-kit-jetable` par préfixe."""
    if not _tmux_disponible():
        check("condition3_echec_ferme_sans_correspondance_exacte", False, "tmux introuvable")
        return
    if ST is None:
        check("condition3_echec_ferme_sans_correspondance_exacte", False, "session_tmux.py absent")
        return

    with tempfile.TemporaryDirectory(prefix="feature026-condition3b-") as dossier:
        socket_chemin, _pid = _demarrer_tmux_jetable(dossier, "claude-kit-jetable")
        capture = ST.capture_pane(socket_chemin, "claude")
        check("condition3_echec_ferme_sans_correspondance_exacte", capture is None,
              "aucune session ne s'appelle exactement 'claude' : capture_pane "
              "doit rendre None, jamais le contenu de 'claude-kit-jetable' — "
              "obtenu %r" % (capture,))


# ---------------------------------------------------------------------------
# Condition 4 du GATE P2 — confinement du `session_id` sur les DEUX voies.
# Aucun `tmux` requis : `resoudre_session_id` est une fonction pure de
# système de fichiers.
# ---------------------------------------------------------------------------

def test_condition4_voie_cmdline_rejette_un_id_hostile():
    if ST is None:
        check("condition4_cmdline_hostile_rejete", False, "session_tmux.py absent")
        return
    with tempfile.TemporaryDirectory(prefix="feature026-condition4-cmdline-") as dossier:
        # Répertoire de transcripts VIDE : si la voie cmdline n'est pas
        # confinée, l'id hostile serait retenu tel quel (source "cmdline").
        cmdline_hostile = "claude --remote-control kit-lxc --resume ../../etc/passwd"
        resultat = ST.resoudre_session_id(cmdline_hostile, dossier)
        check("condition4_cmdline_hostile_rejete",
              resultat is None,
              "un --resume hostile (traversée de chemin) a été retenu : "
              "obtenu %r — la confination [0-9a-fA-F-]{1,64} ne filtre pas" % (resultat,))


def test_condition4_fullmatch_rejette_le_retour_a_la_ligne_final():
    """Revue de code : les DEUX sites d'appel de `_RE_SESSION_ID` utilisaient
    `.match`, qui tolère un `\\n` FINAL (`$` matche juste avant) — mesuré,
    `'6cb1e70e\\n'` passait. Ce test traverse le VRAI site d'appel (voie
    récence, nom de fichier), pas seulement l'objet regex isolé — sinon un
    retour à `.match` sur le site d'appel ne serait pas détecté."""
    if ST is None:
        check("condition4_fullmatch_rejette_le_retour_a_la_ligne", False, "session_tmux.py absent")
        return
    check("condition4_match_tolerait_le_retour_a_la_ligne_final",
          bool(ST._RE_SESSION_ID.match("6cb1e70e\n")),
          "cette prémisse (mesurée) doit rester vraie : c'est elle que corrige fullmatch")
    with tempfile.TemporaryDirectory(prefix="feature026-condition4-fullmatch-") as dossier:
        # Nom de fichier avec un `\n` embarqué dans l'identifiant — légal
        # sous Linux, et exactement la forme qui passait `.match`.
        chemin_hostile = os.path.join(dossier, "6cb1e70e\n.jsonl")
        with open(chemin_hostile, "w") as f:
            f.write("x")
        resultat = ST.resoudre_session_id("", dossier)
        check("condition4_fullmatch_rejette_le_retour_a_la_ligne",
              resultat is None,
              "un nom de fichier portant '6cb1e70e\\n' a été retenu comme "
              "session_id : obtenu %r — le site d'appel utilise encore .match" % (resultat,))


def test_condition4_voie_recence_ignore_un_nom_de_fichier_hostile():
    if ST is None:
        check("condition4_recence_hostile_ignore", False, "session_tmux.py absent")
        return
    with tempfile.TemporaryDirectory(prefix="feature026-condition4-recence-") as dossier:
        id_valide = "11111111-1111-1111-1111-111111111111"
        chemin_valide = os.path.join(dossier, id_valide + ".jsonl")
        with open(chemin_valide, "w") as f:
            f.write("x")
        # Nom hostile hors de la forme confinée, déposé APRÈS (plus récent) :
        # un tri par seule mtime, sans validation de forme, le choisirait.
        chemin_hostile = os.path.join(dossier, "..evil-nom-hostile;rm -rf.jsonl")
        with open(chemin_hostile, "w") as f:
            f.write("y")
        maintenant = time.time()
        os.utime(chemin_valide, (maintenant - 10, maintenant - 10))
        os.utime(chemin_hostile, (maintenant, maintenant))  # plus RÉCENT

        resultat = ST.resoudre_session_id("", dossier)  # pas de --resume : voie cmdline vide
        check("condition4_recence_hostile_ignore",
              isinstance(resultat, dict) and resultat.get("session_id") == id_valide,
              "le fichier le plus récent a une forme hostile : il ne doit "
              "JAMAIS être retenu comme session_id — obtenu %r" % (resultat,))


def main():
    print("== test_session_tmux.py — D3/D4/D5/D7/D8 (feature-026) ==")
    if ST is None:
        print("  (i) session_tmux.py introuvable — livrable A1 du "
              "backend-developer, lot 1. Les assertions comportementales "
              "sont ATTENDU_ROUGE, pas des échecs de suite.")
    if not _tmux_disponible():
        print("  (i) `tmux` introuvable sur cette machine — les scénarios "
              "D3(b)/D8 qui ont besoin d'un serveur réel sont ATTENDU_ROUGE "
              "pour cette raison, distincte de l'absence du module.")

    try:
        test_D5_provenance_et_fixtures()
        test_D5_heuristique_ancree_sur_la_forme_reelle()
        test_D5_ancien_dessin_ne_satisfait_plus_le_nouveau_format()
        test_D5_capture_reelle_lecture_seule_claude_kit_rend_false()
        test_D5_compositeur_toujours_accessible_ignore_le_contenu()
        test_D5_echo_transitoire_et_indices_claude_nempechent_plus_lenvoi()
        test_C3_deux_sandwiches_le_bas_fait_foi()
        test_D5_spinner_seul_alimente_le_libelle_occupee_sans_bloquer_lenvoi()
        test_D5_motif_secours_alimente_occupee_sans_bloquer_lenvoi()
        test_D3_socket_absent_vs_session_absente()
        test_D4_resolution_session_id()
        test_D7_pty()
        test_D8_socket_config_jamais_environnement()
        test_condition3_ciblage_exact_evite_la_collision_par_prefixe()
        test_condition3_echec_ferme_quand_aucune_correspondance_exacte()
        test_condition4_voie_cmdline_rejette_un_id_hostile()
        test_condition4_fullmatch_rejette_le_retour_a_la_ligne_final()
        test_condition4_voie_recence_ignore_un_nom_de_fichier_hostile()
    finally:
        _arreter_tmux_jetables()

    for cle, entree in ATTENDU_ROUGE.items():
        check("ATTENDU_ROUGE_%s_porte_un_lot_de_cloture_nomme" % cle,
              bool(entree.get("lot_de_cloture")))

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for e in _echecs:
        print("  - %s" % e)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
