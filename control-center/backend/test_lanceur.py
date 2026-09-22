#!/usr/bin/env python3
"""Tests de l'exécution d'une commande déclarée — `lanceur.py` (feature-007, lot 2).

    python3 control-center/backend/test_lanceur.py

Ce module ne connaît ni HTTP ni jeton ni verrou : il sait lancer un `argv` en
`shell=False`, retenir sa sortie dans un tampon BORNÉ, et le tuer proprement.
Trois familles de cas comptent ici :

1. **Le double `waitpid`** (T8) — un fils tué depuis l'extérieur (pas via
   `interrompre()`) doit être rapporté `echec`, jamais `termine`, et son
   `code_retour` doit être le code brut négatif du signal. C'est la régression
   nommée dans le module lui-même (`tuer_immediatement`) : une SEULE voie
   récolte le processus, le thread de lecture — jamais un `waitpid` concurrent
   depuis ailleurs.
2. **Le tampon circulaire et sa troncature ANNONCÉE** — jamais silencieuse.
3. **`sortie_depuis`** rend exactement les huit champs attendus (feature-025,
   GATE P1 S1.7 : `spec_id` s'ajoute aux sept déjà couverts, dont les deux
   plus anciens `debut` et `code_retour`).
"""

import fcntl
import os
import signal
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lanceur as L  # noqa: E402

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


_PY = sys.executable


def _attendre(predicat, delai=5.0, pas=0.02):
    fin = time.monotonic() + delai
    while time.monotonic() < fin:
        if predicat():
            return True
        time.sleep(pas)
    return predicat()


def main():
    # --- nominal : sortie courte, code 0 ------------------------------------
    lancement = L.Lancement("t", [_PY, "-c", "print('bonjour')"], cwd=".")
    lancement.demarrer_lecture()
    ok = _attendre(lambda: not lancement.toujours_en_cours())
    check("test_nominal_se_termine", ok)
    d = lancement.sortie_depuis(0)
    check("test_nominal_etat_termine", d["etat"] == "termine",
          "obtenu %r" % d["etat"])
    check("test_nominal_code_retour_zero", d["code_retour"] == 0)
    check("test_nominal_sortie_contient_bonjour", "bonjour" in d["lignes"])
    for champ in ("etat", "lignes", "curseur", "tronque", "derniere_activite",
                  "debut", "code_retour", "spec_id"):
        check("test_sortie_depuis_porte_le_champ_%s" % champ, champ in d,
              "champs obtenus : %r" % sorted(d))
    check("test_sortie_depuis_champs_exactement_huit", len(d) == 8,
          "champs en trop ou manquants : %r" % sorted(d))
    check("test_sortie_depuis_spec_id_none_par_defaut", d["spec_id"] is None,
          "un `Lancement` sans `spec_id` déclaré ne doit rien inventer")

    # --- `spec_id` mémorisé tel quel (feature-025, GATE P1 S1.7) ------------
    lancement_cible = L.Lancement("t", [_PY, "-c", "print('ok')"], cwd=".",
                                   spec_id="feature-025-actions-du-backlog")
    lancement_cible.demarrer_lecture()
    _attendre(lambda: not lancement_cible.toujours_en_cours())
    d_cible = lancement_cible.sortie_depuis(0)
    check("test_sortie_depuis_spec_id_memorise",
          d_cible["spec_id"] == "feature-025-actions-du-backlog",
          "obtenu %r" % d_cible["spec_id"])

    # --- échec : code de retour non nul --------------------------------------
    lancement = L.Lancement("t", [_PY, "-c", "import sys; sys.exit(3)"], cwd=".")
    lancement.demarrer_lecture()
    _attendre(lambda: not lancement.toujours_en_cours())
    d = lancement.sortie_depuis(0)
    check("test_echec_etat_echec", d["etat"] == "echec", "obtenu %r" % d["etat"])
    check("test_echec_code_retour_trois", d["code_retour"] == 3)

    # --- interrompre() : SIGTERM puis mort constatée -------------------------
    lancement = L.Lancement("t", [_PY, "-c",
                                   "import time; time.sleep(30)"], cwd=".")
    lancement.demarrer_lecture()
    pid = lancement.pid
    resultat_interrompre = lancement.interrompre()
    check("test_interrompre_rend_true_si_en_cours", resultat_interrompre is True)
    d = lancement.sortie_depuis(0)
    check("test_interrompre_etat_interrompu", d["etat"] == "interrompu",
          "obtenu %r" % d["etat"])
    try:
        os.kill(pid, 0)
        vivant = True
    except OSError:
        vivant = False
    check("test_interrompre_processus_reellement_mort", not vivant)
    check("test_interrompre_second_appel_sans_effet", lancement.interrompre() is False)

    # --- T8 : tué depuis l'EXTÉRIEUR (pas via interrompre()) -----------------
    # C'est la régression nommée dans lanceur.py : un `waitpid` concurrent
    # depuis `tuer_immediatement` avalait l'ECHILD du perdant et CPython lui
    # inventait un code de retour 0, rapportant "termine" pour un processus
    # qu'on venait pourtant de tuer. La correction : SEUL le thread de lecture
    # appelle `wait()` ; `tuer_immediatement` ne le fait jamais.
    lancement = L.Lancement("t", [_PY, "-c",
                                   "import time; time.sleep(30)"], cwd=".")
    lancement.demarrer_lecture()
    pid = lancement.pid
    os.killpg(pid, signal.SIGKILL)  # tué depuis l'extérieur, PAS interrompre()
    ok = _attendre(lambda: not lancement.toujours_en_cours())
    check("test_tue_de_l_exterieur_thread_constate_la_fin", ok)
    d = lancement.sortie_depuis(0)
    check("test_tue_de_l_exterieur_n_est_jamais_termine",
          d["etat"] != "termine",
          "un processus SIGKILLé ne doit jamais être rapporté 'termine' ; "
          "obtenu %r (régression du double waitpid)" % d["etat"])
    check("test_tue_de_l_exterieur_etat_echec", d["etat"] == "echec",
          "obtenu %r" % d["etat"])
    check("test_tue_de_l_exterieur_code_retour_negatif",
          isinstance(d["code_retour"], int) and d["code_retour"] < 0,
          "un code_retour négatif signale la mort par signal ; obtenu %r"
          % d["code_retour"])

    # `tuer_immediatement` elle-même : appelée sur un processus déjà lancé,
    # elle ne doit jamais lever, et ne doit PAS interférer avec le seul
    # récolteur légitime (le thread de lecture).
    lancement = L.Lancement("t", [_PY, "-c", "import time; time.sleep(30)"], cwd=".")
    lancement.demarrer_lecture()
    pid = lancement.pid
    try:
        L.tuer_immediatement(pid)
        leve = False
    except Exception:
        leve = True
    check("test_tuer_immediatement_ne_leve_pas", not leve)
    ok = _attendre(lambda: not lancement.toujours_en_cours())
    d = lancement.sortie_depuis(0)
    check("test_tuer_immediatement_processus_bien_mort", ok)
    check("test_tuer_immediatement_pas_termine", d["etat"] != "termine",
          "obtenu %r" % d["etat"])

    # --- troncature ANNONCÉE, jamais silencieuse -----------------------------
    # `_TAILLE_TAMPON` vaut 200_000 octets ; on produit nettement plus, en une
    # seule écriture pour ne pas dépendre du séquencement des blocs de lecture.
    gros = L._TAILLE_TAMPON + 50_000
    lancement = L.Lancement(
        "t", [_PY, "-c", "import sys; sys.stdout.buffer.write(b'x' * %d)" % gros],
        cwd=".")
    lancement.demarrer_lecture()
    ok = _attendre(lambda: not lancement.toujours_en_cours(), delai=10.0)
    check("test_gros_volume_se_termine", ok)
    d = lancement.sortie_depuis(0)
    check("test_troncature_annoncee", d["tronque"] is True,
          "une sortie plus grosse que le tampon doit annoncer la troncature")
    check("test_troncature_lignes_bornees",
          len(d["lignes"].encode("utf-8", "replace")) <= L._TAILLE_TAMPON,
          "obtenu %d octets, tampon = %d" % (len(d["lignes"]), L._TAILLE_TAMPON))
    check("test_troncature_curseur_avance_du_total",
          d["curseur"] == gros,
          "le curseur doit porter la position dans le flux TOTAL, pas dans le "
          "tampon retenu ; obtenu %r pour un total de %d" % (d["curseur"], gros))

    # Un curseur déjà au-delà de ce qui a été perdu ne doit PAS être signalé
    # tronqué : la troncature ne concerne que ce qui a été demandé et perdu.
    d2 = lancement.sortie_depuis(gros - 10)
    check("test_pas_de_troncature_annoncee_a_tort_pres_de_la_fin",
          d2["tronque"] is False,
          "un curseur proche de la fin, dans la zone conservée, ne doit rien "
          "annoncer perdu ; obtenu %r" % d2)

    # --- sortie non-UTF8 : décodée sans lever, avec remplacement -------------
    lancement = L.Lancement(
        "t", [_PY, "-c", "import sys; sys.stdout.buffer.write(bytes([0xff, 0xfe, 0x41]))"],
        cwd=".")
    lancement.demarrer_lecture()
    ok = _attendre(lambda: not lancement.toujours_en_cours())
    d = lancement.sortie_depuis(0)
    check("test_sortie_non_utf8_ne_leve_pas", ok)
    check("test_sortie_non_utf8_contient_le_caractere_valide", "A" in d["lignes"])

    # --- commande absente de la machine : OSError laissée à l'appelant -------
    try:
        L.Lancement("t", ["/chemin/qui/n_existe/certainement/pas"], cwd=".")
        leve = False
    except OSError:
        leve = True
    check("test_commande_absente_leve_oserror_a_l_appelant", leve,
          "c'est à l'appelant (Ecriture.lancer côté server.py) de transformer "
          "cette exception en réponse HTTP exploitable")

    # --- T10 (volume), déclaré : ce qui est couvert et ce qui ne l'est pas ---
    # Couvert : sortie tronquée au-delà de _TAILLE_TAMPON (ci-dessus), sortie
    # non-UTF8 (ci-dessus).
    # NON couvert ici (coût CI disproportionné pour la valeur ajoutée au-delà
    # de ce que le test de troncature établit déjà) : une sortie de 100 Mo
    # réelle, une ligne unique de 10 Mo sans '\n' (le mécanisme de lecture par
    # blocs de 64 Kio est le même, indépendamment de la présence d'un '\n' —
    # déjà prouvé par le test de troncature qui écrit sans jamais de saut de
    # ligne), un processus silencieux plusieurs minutes (bornerait le test à
    # plusieurs minutes pour une propriété — `derniere_activite` — déjà
    # couverte structurellement par le fait qu'elle est mise à jour à chaque
    # bloc lu), trois clients simultanés lisant le même `Lancement` (couvert
    # côté `server.py` par le test de concurrence sur `/api/lancer`, qui
    # exerce le même verrou d'accès à `_tampon`).

    # =========================================================================
    # feature-022 (GATE P1 re-passage, D1/D3, S3.9-S3.12) : canal d'entrée
    # =========================================================================

    # --- D1 : `entree="aucune"` (défaut) — stdin=DEVNULL, STRICTEMENT inchangé
    lancement = L.Lancement("t", [_PY, "-c", "print('ok')"], cwd=".")
    check("test_entree_defaut_vaut_aucune", lancement.entree == "aucune")
    check("test_entree_aucune_stdin_est_None",
          lancement.processus.stdin is None,
          "`Popen(stdin=DEVNULL)` ne peuple jamais `.stdin` — un canal "
          "réinjectable ne doit exister QUE pour `entree='json-lines'`")
    lancement.demarrer_lecture()
    _attendre(lambda: not lancement.toujours_en_cours())

    # Mutation exigée (brief) : `entree` forcé à `"json-lines"` doit faire
    # mourir un test « demo reçoit DEVNULL » — c'est celui-ci.
    lancement_force = L.Lancement("t", [_PY, "-c", "print('ok')"], cwd=".",
                                   entree="json-lines")
    check("test_entree_json_lines_stdin_nest_pas_None",
          lancement_force.processus.stdin is not None,
          "avec entree='json-lines', stdin doit être un PIPE réinjectable")
    lancement_force.demarrer_lecture()
    _attendre(lambda: not lancement_force.toujours_en_cours())

    # Une valeur hors {"aucune", "json-lines"} retombe défensivement sur
    # "aucune", ICI AUSSI (pas seulement côté config.py).
    lancement_invalide = L.Lancement("t", [_PY, "-c", "print('ok')"], cwd=".",
                                      entree="texte-brut")
    check("test_entree_invalide_retombe_sur_aucune",
          lancement_invalide.entree == "aucune")
    check("test_entree_invalide_stdin_devnull",
          lancement_invalide.processus.stdin is None)
    lancement_invalide.demarrer_lecture()
    _attendre(lambda: not lancement_invalide.toujours_en_cours())

    # --- S3.9/S3.11 : capacité posée APRÈS Popen, à 262144 — la marge est
    # DÉRIVÉE avec le SÉRIALISEUR DU CODE (même structure, même `ensure_ascii`
    # qu'`envoyer()`), JAMAIS un chiffre récité d'un rapport : un test qui
    # recopierait « 98 482 » resterait vert même si le code changeait de
    # drapeau (S3.11, mesuré ×3 d'écart entre `ensure_ascii=True/False`).
    import json as _json  # import local : seul ce bloc en a besoin
    _enveloppe_pire_cas = len((_json.dumps({
        "type": "user",
        "message": {"role": "user",
                    "content": [{"type": "text", "text": "\U0001F600" * 8192}]},
    }, ensure_ascii=False) + "\n").encode("utf-8"))

    _CMD_LENT = [_PY, "-c", "import time; time.sleep(5)"]
    lancement_capacite = L.Lancement("t", _CMD_LENT, cwd=".", entree="json-lines")
    try:
        capacite = fcntl.fcntl(lancement_capacite.processus.stdin.fileno(),
                                fcntl.F_GETPIPE_SZ)
        check("test_capacite_tube_json_lines_262144",
              capacite == L._CAPACITE_TUBE_JSON_LINES,
              "obtenu %r" % capacite)
        check("test_capacite_couvre_l_enveloppe_pire_cas",
              capacite >= _enveloppe_pire_cas * 2,
              "enveloppe pire cas DÉRIVÉE (sérialiseur du code) = %d o ; "
              "capacité = %d o — doit couvrir 2x l'enveloppe (S3.11)"
              % (_enveloppe_pire_cas, capacite))
        check("test_echec_capacite_faux_par_defaut",
              lancement_capacite.echec_capacite is False)
    finally:
        lancement_capacite.demarrer_lecture()
        lancement_capacite.interrompre()

    # Mutation exigée (brief) : un `F_SETPIPE_SZ` qui échoue (EPERM/EBUSY)
    # ne doit JAMAIS laisser un canal à la capacité par défaut — `echec_capacite`
    # doit porter le signal, `server.py` (Ecriture.lancer) le traduit en 503.
    _fcntl_original = L.fcntl.fcntl

    def _fcntl_echoue(fd, op, *args):
        if op == L.fcntl.F_SETPIPE_SZ:
            raise OSError(1, "EPERM simulé pour le test")
        return _fcntl_original(fd, op, *args)

    L.fcntl.fcntl = _fcntl_echoue
    try:
        lancement_echec = L.Lancement("t", _CMD_LENT, cwd=".", entree="json-lines")
    finally:
        L.fcntl.fcntl = _fcntl_original
    check("test_setpipe_sz_echoue_marque_echec_capacite",
          lancement_echec.echec_capacite is True,
          "un F_SETPIPE_SZ qui lève OSError doit être VISIBLE, jamais silencieux")
    lancement_echec.demarrer_lecture()
    lancement_echec.interrompre()

    # --- S3.12 : --restricted / --bare refusés AVANT tout Popen ------------
    _popen_original = L.subprocess.Popen
    _appels_popen = []

    def _popen_espion(*args, **kwargs):
        _appels_popen.append((args, kwargs))
        return _popen_original(*args, **kwargs)

    L.subprocess.Popen = _popen_espion
    try:
        for drapeau, nom in (("--restricted", "restricted"), ("--bare", "bare")):
            _appels_popen.clear()
            leve = False
            try:
                L.Lancement("t", [_PY, "-c", "print('ne devrait jamais partir')", drapeau],
                            cwd=".", entree="json-lines")
            except L.CommandeRefusee:
                leve = True
            check("test_argv_%s_refuse_sur_canal_json_lines" % nom, leve,
                  "%s doit lever CommandeRefusee, jamais lancer le fils" % drapeau)
            check("test_argv_%s_aucun_popen_appele" % nom, len(_appels_popen) == 0,
                  "avant tout Popen (S3.12) : %d appel(s) observé(s)" % len(_appels_popen))

        # Défense en profondeur SCOPÉE à `entree="json-lines"` : un lancement
        # sans canal n'a pas besoin d'authentification interactive, le
        # drapeau ne le concerne pas.
        _appels_popen.clear()
        lancement_sans_canal = L.Lancement(
            "t", [_PY, "-c", "print('ok')", "--restricted"], cwd=".")
        check("test_argv_restricted_tolere_si_entree_aucune",
              lancement_sans_canal.entree == "aucune" and len(_appels_popen) == 1)
        lancement_sans_canal.demarrer_lecture()
        _attendre(lambda: not lancement_sans_canal.toujours_en_cours())
    finally:
        L.subprocess.Popen = _popen_original

    # --- envoyer() : refus sans canal ----------------------------------------
    lancement_aucun_canal = L.Lancement("t", [_PY, "-c", "print('ok')"], cwd=".")
    ok, motif = lancement_aucun_canal.envoyer("bonjour")
    check("test_envoyer_refuse_sans_canal", ok is False and bool(motif))
    lancement_aucun_canal.demarrer_lecture()
    _attendre(lambda: not lancement_aucun_canal.toujours_en_cours())

    # --- envoyer() : écriture nominale, le fils reçoit le message -----------
    _CMD_LIT_UNE_LIGNE = [_PY, "-c",
                          "import sys; print('recu:' + sys.stdin.readline(), flush=True)"]
    lancement_canal = L.Lancement("t", _CMD_LIT_UNE_LIGNE, cwd=".", entree="json-lines")
    lancement_canal.demarrer_lecture()
    ok, motif = lancement_canal.envoyer("bonjour-canal")
    check("test_envoyer_nominal_reussit", ok is True, "motif : %r" % motif)
    _attendre(lambda: not lancement_canal.toujours_en_cours())
    d = lancement_canal.sortie_depuis(0)
    check("test_envoyer_le_fils_recoit_le_texte",
          "bonjour-canal" in d["lignes"],
          "le fils devait relire la ligne JSON envoyée ; obtenu %r" % d["lignes"])

    # --- envoyer() : canal occupé (FIONREAD != 0), JAMAIS d'arithmétique de
    # place libre (S3.10 : le tube doit être VIDE, ou refus SANS RIEN écrire)
    _CMD_LENTE_A_LIRE = [_PY, "-c",
                        "import time,sys; time.sleep(2); sys.stdin.readline()"]
    lancement_occupe = L.Lancement("t", _CMD_LENTE_A_LIRE, cwd=".", entree="json-lines")
    lancement_occupe.demarrer_lecture()
    try:
        ok1, _ = lancement_occupe.envoyer("premier")
        check("test_envoyer_premier_message_reussit", ok1 is True)
        ok2, motif2 = lancement_occupe.envoyer("second-refuse")
        check("test_envoyer_second_message_refuse_canal_occupe",
              ok2 is False and bool(motif2),
              "le fils n'a pas encore lu le premier message : FIONREAD != 0 "
              "doit refuser SANS écrire, jamais calculer une place libre")
        check("test_envoyer_canal_occupe_ne_marque_pas_corrompu",
              lancement_occupe._canal_corrompu is False,
              "un canal OCCUPÉ n'est pas un canal CORROMPU : rien n'a été perdu")
    finally:
        lancement_occupe.interrompre()

    # --- envoyer() : écriture PARTIELLE → canal CORROMPU, DÉFINITIVEMENT ----
    # Mutation exigée (brief) : `os.write` rendant `n-1` → canal marqué
    # corrompu, 503 permanent, aucune écriture suivante.
    lancement_corruption = L.Lancement("t", _CMD_LENTE_A_LIRE, cwd=".", entree="json-lines")
    lancement_corruption.demarrer_lecture()
    _write_original = L.os.write

    def _write_menteur(fd, donnees):
        ecrits = _write_original(fd, donnees)
        return ecrits - 1 if ecrits > 0 else ecrits

    L.os.write = _write_menteur
    try:
        ok, motif = lancement_corruption.envoyer("va-etre-tronque")
    finally:
        L.os.write = _write_original
    check("test_ecriture_partielle_refuse", ok is False)
    check("test_ecriture_partielle_marque_corrompu",
          lancement_corruption._canal_corrompu is True,
          "un `os.write` qui rend moins que `len(ligne)` doit corrompre le "
          "canal DÉFINITIVEMENT — une ligne JSON tronquée tue le lecteur "
          "`claude --input-format stream-json` (mesuré par le GATE, rc=1)")
    ok_suivant, motif_suivant = lancement_corruption.envoyer("plus-jamais")
    check("test_canal_corrompu_refuse_tout_envoi_suivant",
          ok_suivant is False and "corrompu" in (motif_suivant or ""),
          "aucune écriture suivante ne doit jamais être tentée sur un canal "
          "corrompu — motif obtenu : %r" % motif_suivant)
    lancement_corruption.interrompre()

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for echec in _echecs:
        print("  - %s" % echec)
    return 1 if _echecs else 0


if __name__ == "__main__":
    try:
        _code = main()
    except Exception as erreur:
        print("\n%d cas atteints, INTERROMPU par %s : %s"
              % (_tests, type(erreur).__name__, erreur))
        _code = 1
    sys.exit(_code)
