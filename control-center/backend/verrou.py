#!/usr/bin/env python3
"""Verrou d'écrivain unique — garde-fou 2.

    python3 control-center/backend/verrou.py

Au plus `[garde_fous].ecrivains_simultanes` (défaut : 1) workflow écrivain à la
fois. Deux sessions qui écrivent dans le même arbre s'entrelacent selon l'ordre
des vidages ; le résultat n'est réparable par personne. Ce module protège le cas
par défaut (un seul écrivain) ; il n'a pas à connaître le nombre : c'est
`config.ecrivains_simultanes()` qui le porte, et l'appelant (un lot ultérieur)
qui décide combien de `Verrou` il instancie.

## La prise doit être ATOMIQUE

Le serveur est un `ThreadingHTTPServer` : deux requêtes peuvent arriver au même
instant. « Lire l'état du verrou puis écrire » laisserait une fenêtre où les
deux passeraient. `flock(LOCK_EX | LOCK_NB)` est la primitive du noyau pour
cela : sur DEUX `open()` du même fichier (même thread, threads différents ou
processus différents), un seul flock() réussit — établi par exécution : deux
`open()` du même processus se refusent mutuellement le verrou (EAGAIN), et huit
threads lancés en même temps donnent exactement un pris et sept refusés. Un
test séquentiel ne prouverait RIEN ici : il faut des threads réellement
concurrents (une barrière), pas des appels l'un après l'autre.

## Le noyau libère le verrou ; il ne tue pas le fils

Si le SERVEUR meurt, le noyau referme son descripteur et le verrou se libère
tout seul — un `flock()` suffit alors à le reprendre, aucune horlogerie n'est
nécessaire pour ça (statué en GATE P1 : « flock atomique suffit »). Mais le
verrou protège le **serveur**, pas le processus **fils** qu'il a lancé : un
fils orphelin peut très bien continuer d'écrire dans le dépôt alors que le
verrou vient d'être repris par un nouveau serveur. C'est pour cette raison-là,
et uniquement celle-là, que la méta du verrou porte `pid_fils` ET `starttime` :
avant d'écraser une méta laissée par un détenteur disparu, on vérifie que le
fils qu'elle désigne n'est pas TOUJOURS vivant.

`os.kill(pid, 0)` seul ne suffit pas : le noyau peut avoir réattribué ce PID à
un processus sans rapport entre-temps. Le champ 22 de `/proc/<pid>/stat`
(`starttime`, l'horloge de démarrage du processus) est le seul rempart réel
contre cette réutilisation — deux processus distincts qui partageraient et le
PID et le starttime seraient une coïncidence infinitésimale.

Une méta illisible (fichier vide, JSON cassé, `/proc` disparu) est traitée
comme un verrou LIBRE, jamais comme un 409 permanent : on ne peut pas bloquer
indéfiniment sur la foi d'une information qu'on est incapable de lire.
"""

import errno
import fcntl
import json
import os
import time

_RACINE_VAR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "var")
_CHEMIN_DEFAUT = os.path.join(_RACINE_VAR, "ecrivain.lock")

# Une méta tient en quelques champs JSON. Au-delà, on cesse de lire : ce n'est
# plus une méta de verrou mais un fichier piégé.
_TAILLE_MAX_META = 4096


def _champ_starttime(contenu_stat):
    """Extrait le champ 22 (starttime) d'un contenu de `/proc/<pid>/stat`.

    Le 2e champ (`comm`, le nom de la commande) est entre parenthèses et PEUT
    contenir n'importe quel caractère, y compris des parenthèses ou des
    espaces : on ne peut pas se contenter d'un `split()` naïf sur toute la
    ligne. On repart de la DERNIÈRE parenthèse fermante, qui marque la fin de
    `comm` quoi qu'il contienne.
    """
    fin = contenu_stat.rfind(")")
    if fin == -1:
        return None
    champs = contenu_stat[fin + 1:].split()
    # `champs[0]` est l'état (3e champ global) ; le starttime est le 22e champ
    # global, donc l'index 19 dans cette liste qui commence au 3e champ.
    if len(champs) <= 19:
        return None
    return champs[19]


def _starttime(pid):
    if pid is None:
        return None
    try:
        with open("/proc/%d/stat" % pid, "r", encoding="utf-8") as fichier:
            contenu = fichier.read()
    except OSError:
        return None
    return _champ_starttime(contenu)


def _cmdline_lisible(pid):
    """Vrai si `/proc/<pid>/cmdline` existe et n'est pas vide.

    Un `cmdline` vide est le signe d'un processus déjà zombie : ce n'est plus
    un fils qui écrit, c'est un cadavre que le parent n'a pas encore récolté.
    """
    try:
        with open("/proc/%d/cmdline" % pid, "rb") as fichier:
            return bool(fichier.read(1))
    except OSError:
        return False


def _fils_toujours_vivant(pid, starttime_attendu):
    """Vrai SEULEMENT si `pid` désigne encore le même processus fils.

    Les trois conditions sont cumulatives : `os.kill(pid, 0)` réussit (le PID
    existe), `/proc/<pid>/cmdline` est lisible et non vide (ce n'est pas un
    zombie), et le starttime actuel de ce PID est identique à celui enregistré
    (ce n'est pas un PID recyclé pour un processus sans rapport). La moindre
    de ces trois informations manquante rend « pas vivant » — jamais « on ne
    sait pas donc on bloque ».
    """
    if pid is None or starttime_attendu is None:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    if not _cmdline_lisible(pid):
        return False
    actuel = _starttime(pid)
    return actuel is not None and actuel == starttime_attendu


def _duree_lisible(secondes):
    secondes = max(0, int(secondes))
    if secondes < 60:
        return "%ds" % secondes
    minutes, secondes = divmod(secondes, 60)
    if minutes < 60:
        return "%dmin%02ds" % (minutes, secondes)
    heures, minutes = divmod(minutes, 60)
    return "%dh%02dmin" % (heures, minutes)


class Verrou:
    """Un verrou d'écrivain, adossé à un unique fichier.

    Une instance = une tentative de prise. `ecrivains_simultanes() > 1` se
    traduit, côté appelant, par plusieurs `Verrou` sur des chemins distincts
    (`ecrivain-0.lock`, `ecrivain-1.lock`, …) — ce module ne connaît que « au
    plus un détenteur par fichier », la primitive la plus simple qui couvre le
    cas par défaut et se compose pour les autres.
    """

    def __init__(self, chemin=None):
        self.chemin = chemin or _CHEMIN_DEFAUT
        self._fd = None
        self.meta = None

    def acquerir(self, cle, pid_fils=None):
        """Tente de prendre le verrou pour la commande `cle`.

        Rend `(True, None)` en cas de succès, `(False, raison)` sinon — la
        raison NOMME ce qui occupe la place et depuis quand. Jamais mis en
        file d'attente en silence : un refus est immédiat.
        """
        os.makedirs(os.path.dirname(os.path.abspath(self.chemin)), exist_ok=True)
        fd = os.open(self.chemin, os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as erreur:
            meta = self._lire_fd(fd)
            os.close(fd)
            if erreur.errno in (errno.EACCES, errno.EAGAIN):
                return False, self._raison(meta)
            raise

        # Le verrou est à nous. Mais un FILS d'un détenteur disparu peut
        # survivre au verrou lui-même (le noyau libère le verrou, pas le
        # processus) : on lit l'ancienne méta AVANT de l'écraser.
        ancienne_meta = self._lire_fd(fd)
        if ancienne_meta and _fils_toujours_vivant(
                ancienne_meta.get("pid_fils"), ancienne_meta.get("starttime")):
            fcntl.flock(fd, fcntl.LOCK_UN)
            os.close(fd)
            return False, self._raison_orphelin(ancienne_meta)

        meta = {
            "pid_serveur": os.getpid(),
            "pid_fils": pid_fils,
            "cle": cle,
            "debut": time.time(),
            "starttime": _starttime(pid_fils),
        }
        try:
            os.lseek(fd, 0, os.SEEK_SET)
            os.ftruncate(fd, 0)
            os.write(fd, json.dumps(meta, ensure_ascii=False).encode("utf-8"))
            os.fsync(fd)
        except OSError:
            # Écrire la méta a échoué APRÈS que le flock ait réussi : sans ce
            # dégagement explicite, `fd` (et le flock qu'il porte) fuirait —
            # `self._fd` ne serait jamais assigné, donc `liberer()` deviendrait
            # un no-op, et toute reprise ultérieure verrait une méta illisible
            # (verrou traité comme libre, cf. `_raison`) mais ne pourrait
            # JAMAIS reprendre le flock lui-même, toujours tenu par ce `fd`
            # fui — un 409 permanent jusqu'au redémarrage du serveur.
            fcntl.flock(fd, fcntl.LOCK_UN)
            os.close(fd)
            raise
        self._fd = fd
        self.meta = meta
        return True, None

    def liberer(self):
        """Rend le verrou. Sans effet s'il n'était pas détenu."""
        if self._fd is not None:
            try:
                fcntl.flock(self._fd, fcntl.LOCK_UN)
            finally:
                os.close(self._fd)
                self._fd = None
                self.meta = None

    def _lire_fd(self, fd):
        """Lit la méta depuis un descripteur déjà ouvert, sans bouger le
        curseur ni exiger le verrou (lire n'est pas exclusif)."""
        try:
            brut = os.pread(fd, _TAILLE_MAX_META, 0)
        except OSError:
            return None
        if not brut:
            return None
        try:
            return json.loads(brut.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None

    def _raison(self, meta):
        if not meta:
            return ("un écrivain occupe déjà la place (méta du verrou "
                    "illisible — refusé par prudence)")
        return ("un écrivain (commande %r, pid_fils=%s) tourne déjà %s"
                % (meta.get("cle"), meta.get("pid_fils"), self._depuis_txt(meta)))

    def _raison_orphelin(self, meta):
        """Motif RÉSERVÉ au cas où le `flock` a pu être repris (le détenteur
        précédent — le SERVEUR — a disparu) mais où le FILS qu'il avait
        lancé est encore vivant (`_fils_toujours_vivant`, appelée juste avant
        ce motif dans `acquerir()`).

        Distinct de `_raison()` à dessein (bug-011) : un écrivain concurrent
        RÉEL (le flock lui-même encore tenu, `_raison()`) et un orphelin
        détecté après coup sont deux situations différentes pour qui reçoit
        le refus — la première se résorbe seule (l'écrivain en cours finira),
        la seconde ne se résorbera JAMAIS sans intervention, puisque le
        serveur qui aurait pu l'interrompre proprement a déjà disparu. Un même
        texte pour les deux rendrait l'orphelin indiscernable d'un simple
        concurrent."""
        return ("un fils orphelin (commande %r, pid_fils=%s) tourne encore "
                "%s : le serveur qui l'a lancé a disparu sans le terminer — "
                "interromps ce fils avant de reprendre l'écriture"
                % (meta.get("cle"), meta.get("pid_fils"), self._depuis_txt(meta)))

    @staticmethod
    def _depuis_txt(meta):
        depuis = meta.get("debut")
        if isinstance(depuis, (int, float)):
            return "depuis %s" % _duree_lisible(time.time() - depuis)
        return "depuis une date inconnue"


if __name__ == "__main__":
    v = Verrou()
    ok, raison = v.acquerir("demo", pid_fils=os.getpid())
    print("verrou pris" if ok else "verrou refusé : %s" % raison)
    if ok:
        v.liberer()
        print("verrou rendu")
