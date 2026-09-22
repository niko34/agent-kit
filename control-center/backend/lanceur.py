#!/usr/bin/env python3
"""Exécution d'une commande déclarée — étape D, la première route d'écriture.

Ce module ne connaît ni HTTP, ni jeton, ni verrou : il sait seulement lancer un
`argv` en `shell=False`, retenir sa sortie dans un tampon BORNÉ, et le tuer
proprement. `server.py` orchestre l'authentification et l'écrivain unique ;
ce module se contente d'exécuter et de rapporter.

## Le tampon est CIRCULAIRE, la lecture est PAR BLOCS

Une commande peut écrire une ligne de plusieurs mégaoctets sans `\n`, ou
tourner en silence pendant des minutes, ou produire cent mégaoctets. Trois
raisons pour lesquelles on ne lit **jamais** avec `readline()` : elle
suppose des lignes courtes, et bloquerait indéfiniment sur une ligne qui n'en
a pas. La lecture se fait par blocs (`os.read`, 64 Kio à la fois), et seuls
les `_TAILLE_TAMPON` derniers octets sont conservés — comme `_MAX_DIFF` dans
`vcs.py`. La troncature est ANNONCÉE (`tronque=True`), jamais silencieuse.

## `start_new_session=True` : un groupe de processus propre

Le fils devient meneur de son propre groupe. Tuer le GROUPE (et non le seul
PID) atteint aussi les petits-fils qu'il aurait lancés, et ne risque jamais
d'atteindre le serveur lui-même (qui n'appartient pas à ce groupe).

## `sur_fin` : le SEUL point où l'appelant est notifié de la fin

`server.py` a besoin de rendre le verrou et d'écrire un événement quand le
processus s'achève — qu'il finisse seul, ou qu'on l'ait interrompu. Plutôt que
de faire deviner cette fin par sondage, le thread de lecture appelle `sur_fin`
une fois, à la fin, avec `self` en argument. Une exception levée par ce
rappel est AVALÉE : la responsabilité du thread de lecture est de lire et de
constater la fin du processus, pas de porter les conséquences d'un rappel
fautif.

## `entree` : le canal RÉINJECTABLE reste l'exception (feature-022, D1/D3)

Par défaut (`entree="aucune"`), `stdin=DEVNULL` — comportement STRICTEMENT
inchangé depuis l'étape D. `entree="json-lines"` (jamais un champ de requête,
lu depuis `[commandes.<cle>].entree`, cf. `config.py`) ouvre `stdin=PIPE`,
dimensionne sa capacité APRÈS `Popen` (`_CAPACITE_TUBE_JSON_LINES`), et permet
UN SEUL message en vol via `envoyer()` : verrou par lancement, `FIONREAD == 0`
exigé, UN SEUL `os.write` non bloquant, jamais d'arithmétique de place libre
(GATE P1 re-passage, M7-M10 : une écriture partielle produit une ligne
tronquée qui tue `claude --input-format stream-json`, donc un canal marqué
CORROMPU ne réessaie jamais).
"""

import array
import fcntl
import json
import os
import signal
import subprocess
import termios
import threading
import time

# Borne haute de la sortie CONSERVÉE, dans le même esprit que `_MAX_DIFF` de
# `vcs.py` : au-delà, les octets les plus anciens sont perdus et `tronque` le
# dit. Ce n'est pas une borne sur ce que le processus peut produire, seulement
# sur ce que le serveur retient en mémoire.
_TAILLE_TAMPON = 200_000

# -- canal d'entrée (feature-022, D1/D3, GATE P1 re-passage) ----------------
#
# Capacité posée sur `stdin` d'un lancement `entree == "json-lines"`, APRÈS
# `Popen` (S3.9). Mesuré (GATE, M10 + re-mesure du re-passage) : la capacité
# d'un tube est une propriété PARTAGÉE par les deux extrémités — poser
# `F_SETPIPE_SZ` côté écriture (le seul côté que ce processus détient) est vu
# par le fils sur son `fd 0`. 262 144 ≤ `pipe-max-size` par défaut du noyau
# (1 048 576), donc atteignable aussi par un utilisateur non root. Choisie
# pour couvrir l'enveloppe pire cas d'un message (S3.11, ~98 482 o mesurés
# pour 8192 caractères astraux en `ensure_ascii=True`) avec une marge large,
# jamais recalculée depuis un chiffre récité.
_CAPACITE_TUBE_JSON_LINES = 262_144

# `claude --restricted` et `--bare` répondent « Not logged in » avec `rc=0`
# et un JSON parfaitement formé (PIEGES §56, mesuré GATE M5) : ces
# drapeaux ignorent les fichiers de réglages où vivent les identifiants. Un
# canal `json-lines` sur une commande qui les porte consommerait le verrou
# d'écrivain pour un agent qui n'a rien fait. Défense en profondeur (S3.12) :
# le serveur choisit la clé dans `[commandes]`, mais ce module refuse quand
# même de lancer, quel que soit l'appelant.
_ARGV_INTERDITS_JSON_LINES = ("--restricted", "--bare")


class CommandeRefusee(Exception):
    """Levée par `Lancement.__init__` AVANT tout `Popen` (feature-022, S3.12) :
    l'appelant (`server.py`, `Ecriture.lancer()`) la traite exactement comme
    une `OSError` de `Popen` — aucun processus n'a été créé, rien à nettoyer.
    """

# Taille des blocs de lecture. Assez grand pour ne pas multiplier les appels
# système sur une sortie volumineuse, assez petit pour ne jamais retenir un
# bloc unique de taille déraisonnable en mémoire avant de l'avoir traité.
_TAILLE_BLOC = 65536

# Délai entre SIGTERM et SIGKILL, à l'interruption comme à l'arrêt du serveur.
# Statué en P1 : un fils qui ignore SIGTERM (ou le traite) a cinq secondes pour
# se terminer proprement avant d'être tué sans préavis.
_DELAI_SIGKILL = 5.0


def tuer_immediatement(pid):
    """SIGKILL sans délai, sur le GROUPE du processus `pid`.

    Utilisé quand un processus vient d'être lancé mais que le verrou
    d'écrivain n'a pas pu être pris juste après (course perdue face à un autre
    écrivain) : il n'a pas vocation à continuer, et on ne lui laisse aucune
    chance de terminer proprement — il n'a rien produit d'observable, il n'y a
    rien à préserver.

    ⚠️ NE RÉCOLTE PAS le processus elle-même (pas de `waitpid` ici) : le
    `Lancement` qui l'a créé a déjà un thread dédié à cela
    (`Lancement._lire`), qui appelle `self.processus.wait()`. Un DEUXIÈME
    appel à `waitpid` depuis ailleurs course avec le premier — et sur cette
    course, CPython avale silencieusement l'`ECHILD` du perdant en lui
    inventant un code de retour 0 (`subprocess.Popen._internal_poll`), ce qui
    a produit un `resultat: "termine"` pour un processus qu'on venait
    pourtant de tuer. Constaté par exécution avant ce correctif — voir la
    mémoire de session. La seule réponse sûre est UN SEUL récolteur : le
    thread de lecture, toujours.
    """
    try:
        os.killpg(pid, signal.SIGKILL)
    except OSError:
        pass


def _tuer_groupe_avec_delai(pid):
    """SIGTERM au groupe, puis SIGKILL après `_DELAI_SIGKILL` s'il résiste."""
    try:
        os.killpg(pid, signal.SIGTERM)
    except OSError:
        return
    fin = time.monotonic() + _DELAI_SIGKILL
    while time.monotonic() < fin:
        try:
            os.killpg(pid, 0)
        except OSError:
            return  # le groupe n'existe plus : mort avant l'échéance
        time.sleep(0.1)
    try:
        os.killpg(pid, signal.SIGKILL)
    except OSError:
        pass


class Lancement:
    """Un processus lancé pour une clé de `[commandes]`, sa sortie bornée, son
    état. Une instance = un lancement ; l'appelant (`server.py`) décide combien
    en garder simultanément (autant que de verrous obtenus).
    """

    def __init__(self, cle, argv, cwd, sur_fin=None, spec_id=None, entree="aucune"):
        self.cle = cle
        self.argv = list(argv)
        # `spec_id` (feature-025, GATE P1 S1.7) : `None` pour un lancement
        # par la route générique `/api/lancer` (clé fermée seule) ; la
        # spec CIBLÉE pour un lancement par `/api/spec/lancer`. Mémorisé
        # tel quel, jamais recalculé — sert de source à `cycle-title` et à
        # la garde de non-modification concurrente (S2.4).
        self.spec_id = spec_id
        # `entree` (feature-022, D1) : `"aucune"` (défaut, `stdin=DEVNULL`,
        # comportement STRICTEMENT inchangé) ou `"json-lines"` — jamais une
        # troisième valeur, `config.entree()` ne rend jamais autre chose ;
        # une valeur inattendue retombe défensivement sur `"aucune"` ICI
        # AUSSI, pas seulement côté config.
        self.entree = entree if entree in ("aucune", "json-lines") else "aucune"
        self.debut = time.time()
        self.verrou = None  # rempli par l'appelant après acquisition
        self._sur_fin = sur_fin

        self._etat_verrou = threading.Lock()
        self._tampon = bytearray()
        self._base_tampon = 0        # position, dans le flux total, du 1er octet conservé
        self.derniere_activite = self.debut
        self.etat = "en_cours"       # en_cours / termine / echec / interrompu
        self.code_retour = None
        self._interruption_demandee = False

        # S3.12 : AVANT tout `Popen` — aucun processus n'est créé si le
        # canal demandé porte un drapeau qui retire l'authentification.
        # L'appelant (`Ecriture.lancer()`) traite `CommandeRefusee` comme une
        # `OSError` de `Popen` : rien à nettoyer.
        if self.entree == "json-lines" and any(
                d in self.argv for d in _ARGV_INTERDITS_JSON_LINES):
            raise CommandeRefusee(
                "durcissement (--restricted/--bare) incompatible avec un "
                "canal d'entrée authentifié (PIEGES §56)")

        # ⚠️ Peut lever OSError (FileNotFoundError, PermissionError…) : c'est à
        # l'appelant de la capturer — une commande déclarée mais absente de la
        # machine est une erreur exploitable, pas une trace brute.
        self.processus = subprocess.Popen(
            argv, cwd=cwd, shell=False,
            stdin=subprocess.PIPE if self.entree == "json-lines" else subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        self.pid = self.processus.pid

        # S3.9 : la capacité se pose APRÈS `Popen`, sur l'extrémité que CE
        # processus détient (`processus.stdin`) — mesuré (GATE, re-passage) :
        # la capacité d'un tube est une propriété PARTAGÉE, le fils la voit
        # sur son `fd 0`. Un échec (EPERM/EBUSY) ne doit JAMAIS laisser un
        # canal à la capacité par défaut (65 536, sous l'enveloppe pire cas
        # d'un message) : `echec_capacite` est un DRAPEAU, jamais une
        # exception ici — le fils existe déjà, sa mort et son recueil
        # passent par le SEUL récolteur légitime (le thread de lecture,
        # `_lire`), jamais par un `waitpid` concurrent (voir
        # `tuer_immediatement`). C'est `Ecriture.lancer()` qui, voyant ce
        # drapeau, démarre la lecture puis tue le fils immédiatement, sans
        # jamais tenter d'acquérir de verrou pour ce lancement.
        self.echec_capacite = False
        self._canal_verrou = threading.Lock()
        self._canal_corrompu = False
        if self.entree == "json-lines":
            try:
                fcntl.fcntl(self.processus.stdin.fileno(),
                            fcntl.F_SETPIPE_SZ, _CAPACITE_TUBE_JSON_LINES)
            except OSError:
                self.echec_capacite = True

        self._fil = threading.Thread(target=self._lire, daemon=True)

    # -- canal d'entrée (feature-022, D3, S3.9-S3.11) ------------------------
    def envoyer(self, texte):
        """Écrit `texte` sur `stdin`, sérialisé en UNE ligne `json-lines`
        (protocole D1 : `{"type":"user","message":{"role":"user",
        "content":[{"type":"text","text":texte}]}}`). Rend `(True, None)` ou
        `(False, motif)` — JAMAIS d'exception, l'appelant HTTP traduit le
        motif en 503.

        Discipline stricte, tirée des mesures du GATE (M7-M10, re-mesurées
        au re-passage) :

        - `entree != "json-lines"` : refusé, ce lancement n'a pas de `stdin`
          réinjectable (`DEVNULL`) ;
        - verrou NON BLOQUANT par lancement, tenu de `FIONREAD` JUSQU'AU
          RETOUR de `os.write` (S3.10) — le contrôle et l'écriture ne
          doivent JAMAIS être séparés par un autre message concurrent ;
        - `FIONREAD == 0` EXIGÉ (tube VIDÉ par l'agent) avant d'écrire quoi
          que ce soit — JAMAIS d'arithmétique de « place libre » : mesuré
          FAUSSE (M9, comptabilité par pages du noyau) ;
        - si vide : UN SEUL `os.write`, non bloquant. `len(ligne) <=
          _CAPACITE_TUBE_JSON_LINES` est assuré PAR CONSTRUCTION (le corps
          de la route borne `texte` à 8192 caractères, S3.3/S3.11) — mais on
          ne suppose rien : un retour partiel marque le canal CORROMPU,
          DÉFINITIVEMENT (S3.10) — une ligne JSON tronquée tue le lecteur
          `claude --input-format stream-json` (mesuré, GATE M3, rc=1) ; un
          second message n'y changerait rien.
        """
        if self.entree != "json-lines":
            return False, "ce lancement n'accepte aucun canal d'entrée"
        if not self._canal_verrou.acquire(blocking=False):
            return False, "canal occupé : un envoi est déjà en cours"
        try:
            if self._canal_corrompu:
                return False, "canal corrompu : ce lancement n'accepte plus de message"
            ligne = (json.dumps({
                "type": "user",
                "message": {"role": "user",
                            "content": [{"type": "text", "text": texte}]},
            }, ensure_ascii=False) + "\n").encode("utf-8")
            try:
                fd = self.processus.stdin.fileno()
                disponible = array.array("i", [0])
                fcntl.ioctl(fd, termios.FIONREAD, disponible, True)
            except OSError:
                return False, "canal indisponible"
            if disponible[0] != 0:
                return False, "canal occupé : l'agent n'a pas encore lu le message précédent"
            try:
                ecrits = os.write(fd, ligne)
            except OSError:
                self._canal_corrompu = True
                return False, "canal corrompu"
            if ecrits != len(ligne):
                # Écriture PARTIELLE (M7) : une ligne JSON tronquée tue le
                # lecteur (M3). Aucune écriture suivante ne « répare » ceci.
                self._canal_corrompu = True
                return False, "canal corrompu : écriture partielle"
            return True, None
        finally:
            self._canal_verrou.release()

    def demarrer_lecture(self):
        """Démarre le thread de lecture — à appeler explicitement, APRÈS que
        l'appelant ait fini d'assigner `self.verrou` (ou décidé de le laisser
        `None` pour un lancement qui n'a jamais tenu la place).

        ⚠️ Ne JAMAIS démarrer ce thread depuis `__init__` : le fils peut
        mourir arbitrairement vite — y compris avant que l'appelant n'ait eu
        la main pour assigner le verrou. `_lire` appelle `sur_fin` dès qu'il
        constate la fin du processus ; si ce rappel s'exécute alors que
        `self.verrou` n'est pas ENCORE assigné (mais le sera juste après), le
        verrou n'est JAMAIS rendu — `_sur_fin` l'a vu à `None`, a considéré
        (à raison, dans le cas où la course contre un autre écrivain a été
        perdue) qu'il n'y avait rien à rendre, et ne sera plus jamais rappelé
        pour ce lancement. Constaté par exécution : fenêtre de course mesurée
        à 0,41 ms de vie du fils contre 0,14 ms pour `verrou.acquerir()` — un
        `fsync` contendu suffit à l'inverser. En appelant cette méthode
        seulement une fois l'assignation (ou la non-assignation délibérée)
        de `self.verrou` terminée, aucune exécution du thread ne peut plus
        voir un `None` transitoire : soit le verrou est déjà là pour de bon,
        soit il ne le sera jamais.
        """
        self._fil.start()

    # -- lecture de la sortie, dans un thread dédié --------------------------
    def _lire(self):
        fd = self.processus.stdout.fileno()
        try:
            while True:
                try:
                    bloc = os.read(fd, _TAILLE_BLOC)
                except OSError:
                    break
                if not bloc:
                    break
                with self._etat_verrou:
                    self._tampon += bloc
                    if len(self._tampon) > _TAILLE_TAMPON:
                        trop = len(self._tampon) - _TAILLE_TAMPON
                        del self._tampon[:trop]
                        self._base_tampon += trop
                    self.derniere_activite = time.time()
        finally:
            code = self.processus.wait()
            with self._etat_verrou:
                self.code_retour = code
                if self._interruption_demandee:
                    self.etat = "interrompu"
                elif code == 0:
                    self.etat = "termine"
                else:
                    self.etat = "echec"
                self.derniere_activite = time.time()
            if self._sur_fin is not None:
                try:
                    self._sur_fin(self)
                except Exception:
                    # Le thread de lecture ne porte pas les fautes de
                    # l'appelant : sa responsabilité s'arrête à constater la
                    # fin du processus.
                    pass

    # -- lecture de la sortie pour l'API -------------------------------------
    def sortie_depuis(self, curseur):
        """Rend un dict {etat, lignes, curseur, tronque, derniere_activite,
        debut, code_retour}.

        `curseur` est la position, dans le flux TOTAL produit depuis le début,
        depuis laquelle l'appelant veut la suite. Si des octets antérieurs au
        curseur demandé ont déjà été perdus par la troncature circulaire,
        `tronque` vaut True — la coupure est ANNONCÉE, jamais silencieuse.

        `code_retour` vaut `None` tant que le processus tourne. Il ne dit pas
        à lui seul si la fin est normale : `etat` porte déjà cette distinction
        (`termine` / `echec` / `interrompu`, cf. `_lire`) — `code_retour` est le
        code brut, rien de plus, pour ne pas dupliquer cette information.
        """
        with self._etat_verrou:
            effectif = max(curseur, self._base_tampon)
            tronque = effectif > curseur
            relatif = effectif - self._base_tampon
            morceau = bytes(self._tampon[relatif:])
            nouveau_curseur = self._base_tampon + len(self._tampon)
            return {
                "etat": self.etat,
                "lignes": morceau.decode("utf-8", errors="replace"),
                "curseur": nouveau_curseur,
                "tronque": tronque,
                "derniere_activite": self.derniere_activite,
                "debut": self.debut,
                "code_retour": self.code_retour,
                # Additif (feature-025, GATE P1 S1.7) : `None` pour un
                # lancement par clé seule, sinon la spec ciblée.
                "spec_id": self.spec_id,
            }

    def toujours_en_cours(self):
        with self._etat_verrou:
            return self.etat == "en_cours"

    def interrompre(self):
        """Demande l'arrêt : SIGTERM au groupe, SIGKILL après délai s'il
        résiste. Bloque jusqu'à ce que le fils soit réellement mort (borné par
        `_DELAI_SIGKILL`) — l'appelant peut alors affirmer sans mentir que le
        processus est mort et rendre le verrou.

        Sans effet si le lancement n'est déjà plus en cours.
        """
        with self._etat_verrou:
            if self.etat != "en_cours":
                return False
            self._interruption_demandee = True
        _tuer_groupe_avec_delai(self.pid)
        self._fil.join(timeout=_DELAI_SIGKILL + 2.0)
        return True
