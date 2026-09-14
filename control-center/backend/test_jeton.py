#!/usr/bin/env python3
"""Tests du jeton partagé — garde-fou 1.

    python3 control-center/backend/test_jeton.py

Testé ISOLÉMENT, avant toute route d'écriture (ADR-0004, condition GATE P1).
Trois familles de cas comptent ici, et aucune n'est acceptable en silence :

1. **Un jeton mal protégé, absent ou vide ne doit jamais activer l'écriture** —
   et le motif de refus doit être NOMMÉ, jamais un simple booléen.
2. **La comparaison est à temps constant** (`hmac.compare_digest` sur des
   bytes) — jamais `==`.
3. **Un jeton non-ASCII est REFUSÉ au chargement**, pas deviné : un en-tête
   HTTP le relirait en LATIN-1, une suite d'octets différente de celle écrite
   dans le fichier.
"""

import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import jeton as J  # noqa: E402

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


def ecrire(dossier, nom, contenu_bytes, mode=0o600):
    chemin = os.path.join(dossier, nom)
    with open(chemin, "wb") as fichier:
        fichier.write(contenu_bytes)
    os.chmod(chemin, mode)
    return chemin


def main():
    with tempfile.TemporaryDirectory() as tmp:
        depot = os.path.join(tmp, "depot")
        hors_depot = os.path.join(tmp, "hors-depot")
        os.makedirs(depot)
        os.makedirs(hors_depot)

        # --- absent, vide, non déclaré ---------------------------------------
        j = J.charger("", depot)
        check("test_chemin_vide_refuse_sans_activer",
              not j.actif() and j.refus,
              "un fichier_jeton non déclaré ne doit jamais activer l'écriture")

        j = J.charger(None, depot)
        check("test_chemin_none_refuse_sans_lever", not j.actif() and j.refus)

        chemin_absent = os.path.join(hors_depot, "absent.token")
        j = J.charger(chemin_absent, depot)
        check("test_fichier_absent_refuse_motive",
              not j.actif() and ("absent" in j.refus or "illisible" in j.refus))

        chemin_vide = ecrire(hors_depot, "vide.token", b"")
        j = J.charger(chemin_vide, depot)
        check("test_fichier_vide_refuse", not j.actif() and "vide" in j.refus)

        # --- permissions -------------------------------------------------------
        chemin_644 = ecrire(hors_depot, "large.token", b"secret-normal-valide", mode=0o644)
        j = J.charger(chemin_644, depot)
        check("test_mode_644_refuse_routes_ecriture",
              not j.actif(), "un jeton lisible par tous n'est pas un secret")
        check("test_refus_de_mode_est_motive", "permissif" in (j.refus or "")
              or "mode" in (j.refus or ""))

        chemin_640 = ecrire(hors_depot, "groupe.token", b"secret-normal-valide", mode=0o640)
        j = J.charger(chemin_640, depot)
        check("test_mode_640_refuse_aussi", not j.actif())

        chemin_600 = ecrire(hors_depot, "correct.token", b"secret-normal-valide", mode=0o600)
        j = J.charger(chemin_600, depot)
        check("test_mode_600_active", j.actif(), j.refus or "")

        chemin_400 = ecrire(hors_depot, "lecture-seule.token", b"secret-normal-valide", mode=0o400)
        j = J.charger(chemin_400, depot)
        check("test_mode_400_active_aussi",
              j.actif(), "plus restrictif que 0600 doit rester accepté")

        # --- règle la vraie règle : un MASQUE, pas un ordre numérique -----------
        # Piège historique : `permissions > 0o600` est une comparaison
        # NUMÉRIQUE, pas un masque de bits. `0o060` (60 décimal) et `0o006`
        # (6 décimal) sont tous deux INFÉRIEURS à `0o600` (384 décimal) alors
        # qu'ils donnent respectivement lecture au groupe et à tous — la garde
        # doit les refuser malgré leur valeur numérique plus petite.
        for mode_interdit in (0o060, 0o006, 0o066, 0o077, 0o070, 0o007, 0o004):
            chemin_bits = ecrire(hors_depot, "bits-%04o.token" % mode_interdit,
                                  b"secret-normal-valide", mode=mode_interdit)
            j = J.charger(chemin_bits, depot)
            check("test_mode_%04o_refuse_malgre_valeur_numerique_faible"
                  % mode_interdit,
                  not j.actif(),
                  "bits groupe/autres posés (mode %04o < 0600 en valeur "
                  "mais lisible hors propriétaire)" % mode_interdit)

        for mode_permis in (0o600, 0o400, 0o500, 0o200, 0o300, 0o100):
            chemin_bits = ecrire(hors_depot, "ok-%04o.token" % mode_permis,
                                  b"secret-normal-valide", mode=mode_permis)
            j = J.charger(chemin_bits, depot)
            check("test_mode_%04o_actif_bits_proprietaire_seuls" % mode_permis,
                  j.actif(), j.refus or "")

        # --- hors dépôt, statué en GATE P1 --------------------------------------
        chemin_dans_le_depot = ecrire(depot, ".token-dans-le-depot", b"secret-normal-valide")
        os.chmod(chemin_dans_le_depot, 0o600)
        j = J.charger(chemin_dans_le_depot, depot)
        check("test_jeton_dans_le_depot_refuse",
              not j.actif() and "dépôt" in j.refus,
              "un secret versionné n'en est plus un — ADR-0007")

        # un lien symbolique qui MÈNE dans le dépôt doit être traité pareil
        lien = os.path.join(hors_depot, "lien-vers-le-depot.token")
        try:
            os.symlink(chemin_dans_le_depot, lien)
            j = J.charger(lien, depot)
            check("test_lien_symbolique_vers_le_depot_refuse", not j.actif())
        except OSError:
            pass  # symlinks indisponibles sur certains systèmes de fichiers

        # --- retrait du \n final : ACCEPTABLE (statué en GATE P1) --------------
        chemin_avec_nl = ecrire(hors_depot, "avec-nl.token", b"secret-normal-valide\n")
        j1 = J.charger(chemin_avec_nl, depot)
        j2 = J.charger(chemin_600, depot)  # b"secret-normal-valide" sans \n
        check("test_retrait_du_saut_de_ligne_final",
              j1.actif() and j2.actif() and j1.compare("secret-normal-valide")
              and j2.compare("secret-normal-valide"),
              "echo secret > f laisse un \\n final ; il doit être retiré")

        # --- ASCII imprimable STRICT : refusé plutôt que deviné -----------------
        chemin_accent = ecrire(hors_depot, "accent.token", "sécret".encode("utf-8"))
        j = J.charger(chemin_accent, depot)
        check("test_jeton_utf8_non_ascii_refuse",
              not j.actif(),
              "un jeton UTF-8 accentué arrive DÉCODÉ LATIN-1 dans un en-tête "
              "HTTP — refuser plutôt que deviner (condition GATE P1 n°4)")

        chemin_controle = ecrire(hors_depot, "controle.token", b"secret\x01\x02")
        j = J.charger(chemin_controle, depot)
        check("test_jeton_avec_octets_de_controle_refuse", not j.actif())

        # --- longueur minimale : 16 octets utiles (statué en GATE P1) -----------
        chemin_15 = ecrire(hors_depot, "quinze.token", b"a" * 15)
        j = J.charger(chemin_15, depot)
        check("test_jeton_15_octets_refuse",
              not j.actif() and ("court" in (j.refus or "")
                                  or "16" in (j.refus or "")),
              "15 octets est EN-DESSOUS du seuil de 16 (GATE P1)")

        chemin_16 = ecrire(hors_depot, "seize.token", b"a" * 16)
        j = J.charger(chemin_16, depot)
        check("test_jeton_16_octets_accepte", j.actif(),
              "16 octets est le seuil exact, ACCEPTÉ")

        # le \n final ne doit pas être compté dans le seuil : il est retiré
        # AVANT que la longueur soit mesurée.
        chemin_15_nl = ecrire(hors_depot, "quinze-nl.token", b"a" * 15 + b"\n")
        j = J.charger(chemin_15_nl, depot)
        check("test_jeton_15_octets_utiles_plus_nl_refuse",
              not j.actif(),
              "le \\n final est retiré avant le calcul de la longueur — "
              "il reste 15 octets utiles, refusés")

        chemin_16_nl = ecrire(hors_depot, "seize-nl.token", b"a" * 16 + b"\n")
        j = J.charger(chemin_16_nl, depot)
        check("test_jeton_16_octets_utiles_plus_nl_accepte", j.actif())

        # --- espace : refusée, au milieu comme aux bords ------------------------
        chemin_espace_milieu = ecrire(hors_depot, "espace-milieu.token",
                                       b"a" * 8 + b" " + b"a" * 8)
        j = J.charger(chemin_espace_milieu, depot)
        check("test_jeton_avec_espace_au_milieu_refuse",
              not j.actif() and "espace" in (j.refus or ""),
              "une espace au milieu est un caractère invisible qui "
              "s'incruste silencieusement dans le secret")

        chemin_espace_debut = ecrire(hors_depot, "espace-debut.token",
                                      b" " + b"a" * 16)
        j = J.charger(chemin_espace_debut, depot)
        check("test_jeton_avec_espace_en_debut_refuse",
              not j.actif() and "espace" in (j.refus or ""))

        chemin_espace_fin = ecrire(hors_depot, "espace-fin.token",
                                    b"a" * 16 + b" ")
        j = J.charger(chemin_espace_fin, depot)
        check("test_jeton_avec_espace_en_fin_refuse",
              not j.actif() and "espace" in (j.refus or ""),
              "contrairement au \\n final, une espace finale n'est JAMAIS "
              "retirée silencieusement")

        # --- volume : jeton de 1 Mo (ADR-0017 — pas de jetable réduit) ----------
        chemin_gros = ecrire(hors_depot, "gros.token", b"a" * (1024 * 1024))
        j = J.charger(chemin_gros, depot)
        check("test_jeton_de_1_mo_refuse_sans_lever",
              not j.actif() and "volumineux" in (j.refus or ""))

        # --- bornes exactes de _TAILLE_MAX (4096 octets UTILES), AVEC et SANS
        # `\n` final : la borne doit porter sur les octets utiles, pas sur la
        # taille brute du fichier — sinon un jeton de 4096 octets utiles suivi
        # d'un `\n` (l'usage `echo` le plus courant) serait refusé alors qu'un
        # jeton STRICTEMENT IDENTIQUE sans `\n` serait accepté : la même valeur
        # de secret ne doit pas changer de verdict selon la présence d'un
        # retour à la ligne, que `charger()` retire de toute façon.
        chemin_max_sans_nl = ecrire(hors_depot, "max-sans-nl.token",
                                     b"a" * 4096)
        j = J.charger(chemin_max_sans_nl, depot)
        check("test_jeton_4096_octets_utiles_sans_nl_accepte", j.actif(),
              "refus : %r" % j.refus)

        chemin_max_avec_nl = ecrire(hors_depot, "max-avec-nl.token",
                                     b"a" * 4096 + b"\n")
        j = J.charger(chemin_max_avec_nl, depot)
        check("test_jeton_4096_octets_utiles_avec_nl_accepte", j.actif(),
              "refus : %r — la borne ne doit pas compter le \\n final retiré "
              "juste après, sous peine de refuser un jeton de 4096 octets "
              "utiles écrit par un simple `echo secret > fichier`" % j.refus)

        chemin_trop_sans_nl = ecrire(hors_depot, "trop-sans-nl.token",
                                      b"a" * 4097)
        j = J.charger(chemin_trop_sans_nl, depot)
        check("test_jeton_4097_octets_utiles_sans_nl_refuse",
              not j.actif() and "volumineux" in (j.refus or ""))

        chemin_trop_avec_nl = ecrire(hors_depot, "trop-avec-nl.token",
                                      b"a" * 4097 + b"\n")
        j = J.charger(chemin_trop_avec_nl, depot)
        check("test_jeton_4097_octets_utiles_avec_nl_refuse",
              not j.actif() and "volumineux" in (j.refus or ""))

        # --- comparaison à temps constant ---------------------------------------
        j = J.charger(chemin_600, depot)  # b"secret-normal-valide"
        check("test_comparaison_bonne_valeur", j.compare("secret-normal-valide"))
        check("test_comparaison_mauvaise_valeur", not j.compare("autre-chose"))
        check("test_comparaison_bytes_acceptee", j.compare(b"secret-normal-valide"))
        check("test_comparaison_prefixe_ne_reussit_pas",
              not j.compare("secret-norma"),
              "un préfixe correct ne doit RIEN faire réussir")
        check("test_comparaison_chaine_vide_refusee", not j.compare(""))
        check("test_comparaison_type_invalide_ne_leve_pas", not j.compare(12345))
        check("test_comparaison_sur_jeton_inactif_toujours_fausse",
              not J.charger("", depot).compare("secret-normal-valide"),
              "aucune valeur ne doit réussir contre un jeton absent")

        # présentation d'un en-tête HTTP relu en LATIN-1 (RFC 7230) : un jeton
        # ASCII strict, présenté depuis un en-tête, doit continuer de matcher.
        presente_comme_latin1 = "secret-normal-valide"
        check("test_comparaison_via_latin1_pour_un_jeton_ascii",
              j.compare(presente_comme_latin1))

        # point de code hors LATIN-1 : refusé, jamais deviné.
        check("test_comparaison_point_de_code_hors_latin1_refusee",
              not j.compare("ሴ"))

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for echec in _echecs:
        print("  - %s" % echec)
    return 1 if _echecs else 0


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
