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
