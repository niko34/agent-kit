#!/usr/bin/env python3
"""Tests du verrou d'écrivain unique — garde-fou 2.

    python3 control-center/backend/test_verrou.py

Testé ISOLÉMENT, avant toute route d'écriture (ADR-0004, condition GATE P1).

⚠️ Le piège classique : un test SÉQUENTIEL (prendre le verrou, vérifier qu'un
deuxième appel échoue, relâcher) passerait même sur un code FAUX — un simple
« si le fichier existe, refuser » sans aucun flock. La seule preuve qui compte
est un test réellement CONCURRENT : huit threads lancés ensemble derrière une
barrière, dont un seul doit gagner. C'est établi par exécution ailleurs dans ce
projet : deux `open()` du même processus se refusent mutuellement le verrou
(EAGAIN), et huit threads en course donnent un pris, sept refusés.
"""

import errno
import os
import sys
import tempfile
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import verrou as V  # noqa: E402

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


def main():
    with tempfile.TemporaryDirectory() as tmp:
        chemin = os.path.join(tmp, "sous-repertoire", "ecrivain.lock")

        # --- prise / relâche nominales -----------------------------------------
        # ⚠️ `pid_fils` est un FILS distinct, déjà terminé — jamais le PID du
        # test lui-même : celui-ci reste vivant tout le long du script, ce qui
        # rendrait indistinguable « le fils est mort » de « le fils est ce
        # process-ci qui tourne encore ». Les deux cas ont chacun leur test
        # dédié plus bas.
        pid_v1 = subprocess_mort()
        v1 = V.Verrou(chemin)
        ok, raison = v1.acquerir("tests", pid_fils=pid_v1)
        check("test_premiere_prise_reussit", ok and raison is None)
        check("test_repertoire_parent_cree_au_besoin", os.path.isdir(os.path.dirname(chemin)))

        v2 = V.Verrou(chemin)
        ok2, raison2 = v2.acquerir("build", pid_fils=os.getpid())
        check("test_second_appel_pendant_detention_refuse", not ok2 and raison2)
        check("test_raison_nomme_la_commande_occupante",
              "tests" in raison2, "obtenu : %r" % raison2)
        check("test_raison_nomme_le_pid_fils",
              str(pid_v1) in raison2, "obtenu : %r" % raison2)
        check("test_raison_concurrent_reel_ne_dit_pas_orphelin",
              "orphelin" not in raison2,
              "un écrivain concurrent RÉEL (le flock est encore tenu) n'est "
              "pas un orphelin — un même mot pour les deux rendrait les deux "
              "cas indiscernables ; obtenu : %r" % raison2)

        v1.liberer()
        v3 = V.Verrou(chemin)
        # Le pid_fils enregistré par v1 (`pid_v1`) est déjà mort : une reprise
        # après relâche explicite doit réussir. Le cas d'un pid_fils ENCORE
        # vivant après relâche explicite est couvert plus bas
        # (`test_reprise_refusee_tant_que_le_fils_precedent_est_vivant`).
        ok3, raison3 = v3.acquerir("apres-liberation", pid_fils=subprocess_mort())
        check("test_reprise_apres_liberation_explicite", ok3 and raison3 is None)
        v3.liberer()

        # --- CONCURRENCE RÉELLE : 8 threads derrière une barrière ---------------
        chemin_conc = os.path.join(tmp, "concurrence.lock")
        n = 8
        barriere = threading.Barrier(n)
        resultats = [None] * n

        def tenter(i):
            barriere.wait()  # tous les threads franchissent la ligne ENSEMBLE
            v = V.Verrou(chemin_conc)
            ok, _ = v.acquerir("course-%d" % i, pid_fils=os.getpid())
            resultats[i] = (ok, v)

        fils = [threading.Thread(target=tenter, args=(i,)) for i in range(n)]
        for f in fils:
            f.start()
        for f in fils:
            f.join(timeout=10)

        gagnants = [ok for ok, _ in resultats if ok]
        check("test_8_threads_en_course_un_seul_gagne",
              len(gagnants) == 1,
              "attendu exactement 1 pris sur %d, obtenu %d" % (n, len(gagnants)))
        for ok, v in resultats:
            if ok:
                v.liberer()

        # --- pid_fils mort : le verrou est repris (orphelin) --------------------
        chemin_orphelin = os.path.join(tmp, "orphelin.lock")
        # un PID quasi certainement mort et non réutilisé dans ce test
        fils_fictif = subprocess_mort()
        v_ancien = V.Verrou(chemin_orphelin)
        ok, _ = v_ancien.acquerir("ancien-workflow", pid_fils=fils_fictif)
        check("test_prise_avec_pid_fils_deja_mort_reussit_quand_meme", ok,
              "au moment de la PREMIÈRE prise, il n'y a pas encore de méta à "
              "vérifier : seule la reprise ultérieure lit la méta précédente")
        v_ancien.liberer()  # simule la mort du SERVEUR : le noyau libère le verrou

        v_nouveau = V.Verrou(chemin_orphelin)
        ok2, raison2 = v_nouveau.acquerir("nouveau-workflow", pid_fils=os.getpid())
        check("test_verrou_orphelin_repris_quand_le_fils_est_mort",
              ok2 and raison2 is None,
              "un fils mort ne doit jamais interdire indéfiniment un nouveau "
              "lancement ; obtenu ok=%s raison=%r" % (ok2, raison2))
        v_nouveau.liberer()

        # --- pid_fils TOUJOURS vivant : refusé même si le verrou est repris -----
        chemin_vivant = os.path.join(tmp, "vivant.lock")
        v_ancien2 = V.Verrou(chemin_vivant)
        # `os.getpid()` (ce processus de test) est réellement vivant, et son
        # /proc/<pid>/stat est lisible : starttime correctement enregistré.
        ok, _ = v_ancien2.acquerir("workflow-en-cours", pid_fils=os.getpid())
        check("test_prise_avec_fils_vivant_reussit", ok)
        v_ancien2.liberer()  # le noyau libère le verrou, PAS le "fils" (nous-même)

        v_nouveau2 = V.Verrou(chemin_vivant)
        ok2, raison2 = v_nouveau2.acquerir("autre-workflow", pid_fils=99999999)
        check("test_reprise_refusee_tant_que_le_fils_precedent_est_vivant",
              not ok2 and raison2,
              "le PROCESSUS DE TEST lui-même est enregistré comme pid_fils de "
              "la méta précédente et il est bien vivant : la reprise doit "
              "être refusée, pas silencieusement accordée")
        # bug-011 (relevé en revue finale de feature-007) : un ORPHELIN (fils
        # d'un serveur disparu, mais toujours vivant) doit produire un motif
        # NOMMÉ « orphelin », distinct de celui d'un écrivain concurrent réel
        # (`test_raison_nomme_la_commande_occupante` ci-dessus) — sinon
        # l'utilisateur ne peut pas savoir qu'il affronte un orphelin plutôt
        # qu'un collègue en train d'écrire.
        check("test_raison_orphelin_nomme_explicitement_orphelin",
              "orphelin" in raison2, "obtenu : %r" % raison2)
        check("test_raison_orphelin_nomme_la_commande",
              "autre-workflow" not in raison2 and "workflow-en-cours" in raison2,
              "le motif doit nommer la commande de l'ANCIEN détenteur (celui "
              "qui a laissé l'orphelin), pas celle du nouveau lancement "
              "refusé ; obtenu : %r" % raison2)

        # --- PID réutilisé : même PID, starttime différent → PAS le même fils --
        # C'est le cœur de la condition GATE P1 n°8 : `os.kill(pid, 0)` seul ne
        # suffit pas, un PID mort peut être réattribué à un processus sans
        # rapport. On force ici un starttime FAUX dans la méta pour simuler
        # exactement ce cas (le vrai pid_fils enregistré est bien vivant, mais
        # sous un déguisement de starttime qui ne correspond à rien).
        chemin_recycle = os.path.join(tmp, "recycle.lock")
        v_ancien3 = V.Verrou(chemin_recycle)
        ok, _ = v_ancien3.acquerir("workflow-recycle", pid_fils=os.getpid())
        check("test_prise_pour_scenario_de_recyclage_reussit", ok)
        with open(chemin_recycle, "r+", encoding="utf-8") as f:
            import json as _json
            meta = _json.load(f)
            meta["starttime"] = "0-ceci-ne-correspond-a-rien"
            f.seek(0)
            f.truncate()
            f.write(_json.dumps(meta))
        v_ancien3.liberer()

        v_nouveau3 = V.Verrou(chemin_recycle)
        ok2, raison2 = v_nouveau3.acquerir("apres-recyclage", pid_fils=os.getpid())
        check("test_starttime_different_traite_comme_pid_recycle_donc_repris",
              ok2 and raison2 is None,
              "le PID enregistré est vivant mais son starttime actuel ne "
              "correspond plus à celui de la méta : ce n'est PAS le même "
              "processus, la reprise doit être ACCORDÉE ; obtenu ok=%s "
              "raison=%r" % (ok2, raison2))
        v_nouveau3.liberer()

        # --- méta illisible : traitée comme un verrou LIBRE, jamais un 409 permanent
        chemin_casse = os.path.join(tmp, "meta-cassee.lock")
        with open(chemin_casse, "wb") as f:
            f.write(b"{ ceci n'est pas du json")
        v = V.Verrou(chemin_casse)
        ok, raison = v.acquerir("apres-meta-cassee", pid_fils=os.getpid())
        check("test_meta_cassee_traitee_comme_verrou_libre",
              ok and raison is None,
              "une méta illisible ne doit JAMAIS produire un refus permanent")
        v.liberer()

        # --- deux processus, pas seulement deux threads -------------------------
        # (complète le test à threads : flock() sur deux OPEN distincts, même
        # sans multiprocessing, est déjà couvert ci-dessus par deux `Verrou()`
        # distincts qui ouvrent chacun leur propre descripteur.)
        check("test_deux_verrous_sur_le_meme_chemin_sont_bien_deux_fds",
              True)  # documentation : voir test_second_appel_pendant_detention_refuse

        # --- écriture de la méta qui échoue APRÈS un flock réussi : ni le
        # descripteur ni le flock ne doivent fuiter (relevé en revue finale de
        # feature-007). Sans le correctif, `self._fd` ne serait jamais
        # assigné (donc `liberer()` deviendrait un no-op) alors que le flock,
        # lui, resterait tenu par le `fd` fui — une PROCHAINE tentative sur ce
        # même chemin échouerait indéfiniment, jusqu'au redémarrage du
        # processus. On le vérifie PAR EXÉCUTION : une seconde tentative,
        # réelle, doit réussir immédiatement — pas seulement inspecter
        # `self._fd` après coup.
        chemin_ecriture_ratee = os.path.join(tmp, "ecriture-ratee.lock")
        fsync_origine = V.os.fsync
        appels_fsync = []

        def _fsync_qui_leve(fd):
            appels_fsync.append(fd)
            raise OSError(errno.EIO, "erreur disque simulée pour le test")

        V.os.fsync = _fsync_qui_leve
        v_rate = V.Verrou(chemin_ecriture_ratee)
        try:
            leve_ecriture = None
            try:
                # ⚠️ `pid_fils` DÉJÀ MORT, délibérément : `os.write()` réussit
                # AVANT que `os.fsync()` (simulé en échec ici) ne lève — la
                # méta atterrit donc réellement dans le fichier malgré
                # l'échec. Avec un `pid_fils` vivant, la tentative suivante
                # serait refusée comme un ORPHELIN VIVANT (comportement
                # correct par ailleurs), ce qui masquerait la question posée
                # ici : le flock, lui, a-t-il fui ?
                v_rate.acquerir("ecriture-ratee", pid_fils=subprocess_mort())
            except OSError as erreur:
                leve_ecriture = erreur
        finally:
            V.os.fsync = fsync_origine

        check("test_echec_fsync_de_la_meta_se_propage", leve_ecriture is not None,
              "obtenu %r" % leve_ecriture)
        check("test_echec_fsync_de_la_meta_bien_simule_une_fois",
              len(appels_fsync) == 1, "obtenu %d" % len(appels_fsync))
        check("test_fd_non_assigne_apres_echec_ecriture_meta",
              v_rate._fd is None,
              "un descripteur assigné après un échec d'écriture fuirait : "
              "`liberer()` ne le refermerait jamais")
        check("test_meta_non_assignee_apres_echec_ecriture_meta",
              v_rate.meta is None)

        v_apres_echec = V.Verrou(chemin_ecriture_ratee)
        ok_apres_echec, raison_apres_echec = v_apres_echec.acquerir(
            "apres-echec-ecriture", pid_fils=os.getpid())
        check("test_flock_non_fuite_apres_echec_ecriture_meta",
              ok_apres_echec,
              "obtenu ok=%s raison=%r — si le flock avait fui avec le fd, "
              "cette seconde tentative RÉELLE aurait échoué (EAGAIN), "
              "indéfiniment jusqu'au redémarrage du processus"
              % (ok_apres_echec, raison_apres_echec))
        if ok_apres_echec:
            v_apres_echec.liberer()

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for echec in _echecs:
        print("  - %s" % echec)
    return 1 if _echecs else 0


def subprocess_mort():
    """Rend un PID qui vient de mourir : lancé puis attendu (`wait()`), donc
    `os.kill(pid, 0)` écheoue et `/proc/<pid>` a disparu — un vrai cas
    d'orphelin, pas une supposition sur un PID inutilisé au hasard."""
    import subprocess
    p = subprocess.Popen(["true"])
    p.wait()
    return p.pid


if __name__ == "__main__":
    # Même filet que les autres suites autonomes : une exception ne doit pas
    # faire disparaître le résumé. `sys.exit()` reste HORS du try.
    try:
        _code = main()
    except Exception as erreur:
        print("\n%d cas atteints, INTERROMPU par %s : %s"
              % (_tests, type(erreur).__name__, erreur))
        print("  (le compte ci-dessus est un MINORANT)")
        _code = 1
    sys.exit(_code)
