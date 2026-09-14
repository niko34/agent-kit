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
"""

import os
import signal
import subprocess
import threading
import time

# Borne haute de la sortie CONSERVÉE, dans le même esprit que `_MAX_DIFF` de
# `vcs.py` : au-delà, les octets les plus anciens sont perdus et `tronque` le
# dit. Ce n'est pas une borne sur ce que le processus peut produire, seulement
# sur ce que le serveur retient en mémoire.
_TAILLE_TAMPON = 200_000

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

    def __init__(self, cle, argv, cwd, sur_fin=None):
        self.cle = cle
        self.argv = list(argv)
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

        # ⚠️ Peut lever OSError (FileNotFoundError, PermissionError…) : c'est à
        # l'appelant de la capturer — une commande déclarée mais absente de la
        # machine est une erreur exploitable, pas une trace brute.
        self.processus = subprocess.Popen(
            argv, cwd=cwd, shell=False,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        self.pid = self.processus.pid
        self._fil = threading.Thread(target=self._lire, daemon=True)

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
