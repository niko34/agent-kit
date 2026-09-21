#!/usr/bin/env python3
"""Tests dédiés à `bug-012` — le jeton dépend du DÉPLOIEMENT, pas de la route
(ADR-0020).

    python3 control-center/backend/test_server_bug012.py

Réutilise le harnais de `test_server_ecriture.py` (`Groupe`, `requete`, la
famille `_brut`/`_lire_reponse`) plutôt que d'en refabriquer un second : même
clone jetable de `control-center/` entier (`_RACINE_VAR` et `_RACINE_WEB`
dérivent de l'emplacement de `server.py`), même discipline de nettoyage.

## Simuler une requête DISTANTE sans réseau

`Handler._distante()` appelle la fonction MODULE `_locale(self.client_address
[0])` — jamais une méthode. Toute connexion de ce harnais arrive par
`127.0.0.1` (la boucle locale de la machine de test elle-même), donc
`client_address[0]` vaut toujours une adresse locale : on ne peut pas
provoquer une vraie requête distante sans lier le serveur sur une interface
routable, ce que ce harnais ne fait jamais. On monkey-patch donc la fonction
MODULE `_locale` du clone importé (`g.srv._locale`), jamais une constante
séparée : c'est la MÊME fonction que `do_GET` et `do_POST` appellent, donc le
test exerce le VRAI chemin de code, pas une resimulation.

## Ce que chaque item vérifie ici (item = commande passée à test-engineer)

- T1 : `_locale` sur les six valeurs de référence.
- T1bis : `_locale` sous une ÉMULATION de la sémantique CPython D'AVANT le
  correctif gh-117566 (`IPv6Address.is_loopback` valant `self._ip == 1`, donc
  `::1` seulement) — la seule façon, sur ce poste où 3.13.5 est la SEULE
  version installée, de faire mourir un mutant qui supprimerait l'extraction
  `ipv4_mapped` de `_locale()` (bug-018, condition GATE P1 n°6). Sans cette
  émulation, ce mutant ne meurt sur aucun test de ce fichier ici : il ne
  meurt qu'en CI (Python système 3.12.3 d'`ubuntu-24.04`), ce qui revient à
  livrer la garde du défaut B sans filet local.
- T2 : distant sans jeton → 401, et AUCUN champ d'activité dans le corps.
- T3 : distant avec jeton valide → 200 en lecture, 202 en écriture.
- T4 : local sans jeton configuré → lecture ET écriture fonctionnent.
- T5 : local AVEC jeton configuré → le jeton est EXIGÉ (condition 5 du GATE).
- T6 : gardes CSRF de `do_POST` en local sans jeton (`Origin`, `null` inclus,
  `Sec-Fetch-Site`, `Content-Type`).
- T7 : le frein ne compte, en LECTURE, que les jetons PRÉSENTS ET FAUX.
- T8 : `frame-ancestors 'none'` sur `/`.
- T9 : `/`, `app.js`, `app.css` restent servis sans jeton, même distant.
- T10 : jeton DÉCLARÉ mais INVALIDE (mode 0644) → *fail-closed* (régression
  mesurée en revue finale : ce jeton bloquait l'écriture, 403, avant ce
  cycle ; il ouvrait lecture ET écriture, 200 puis 202, depuis le premier
  correctif de ce cycle — corrigé une seconde fois ici).
"""

import http.client
import json
import os
import sys

_ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _ICI)
import test_server_ecriture as TSE  # noqa: E402 — réutilise Groupe/requete/etc.

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


def _forcer_distant(g):
    """Monkey-patch `_locale` du MODULE clone pour que TOUTE requête soit vue
    comme distante — sans lier le serveur sur une interface routable. Rend la
    fonction ORIGINALE, à restaurer par l'appelant."""
    original = g.srv._locale
    g.srv._locale = lambda ip: False
    return original


def _requete_avec_entetes(port, methode, chemin, entetes=None, corps=b""):
    """Comme `TSE.requete`, mais rend aussi les en-têtes de réponse — utile
    pour vérifier une politique déclarée en en-tête (CSP), que `TSE._lire_reponse`
    n'expose pas."""
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        conn.request(methode, chemin, body=corps, headers=entetes or {})
        reponse = conn.getresponse()
        lu = reponse.read()
        return reponse.status, lu.decode("utf-8", "replace"), dict(reponse.getheaders())
    finally:
        conn.close()


def main():
    # =======================================================================
    # T1 — `_locale` sur les six valeurs de référence (établi par exécution,
    # cf. bug-012 : critère d'acceptation « la détection ne repose pas sur la
    # seule valeur déclarée dans la configuration »)
    # =======================================================================
    srv_nu, tmp_nu, _ = TSE._importer_server_clone()
    try:
        for ip, attendu in (
            ("127.0.0.1", True), ("127.0.0.5", True), ("::1", True),
            ("::ffff:127.0.0.1", True),
            # bug-018 : même adresse que ci-dessus, autre graphie — le
            # discriminant qu'une reconnaissance par PRÉFIXE de chaîne rate
            # (elle ne verrait pas "::ffff" devant une forme compressée).
            ("::ffff:7f00:1", True),
            ("192.168.1.55", False), ("0.0.0.0", False),
            # bug-018 : mappées NON locales — doivent rester non locales, sous
            # peine d'ouvrir l'écriture sans jeton au réseau (l'inverse exact
            # de ce que bug-012 a corrigé).
            ("::ffff:192.168.1.55", False), ("::ffff:10.0.0.1", False),
            ("::ffff:0.0.0.0", False),
            # bug-018 : IPv4-compatible (pas mappée) et NAT64 — ne doivent
            # jamais être confondues avec une adresse mappée locale.
            ("::7f00:1", False), ("64:ff9b::7f00:1", False),
            ("", False), (None, False),
        ):
            if ip is None:
                nom_ip = "none"
            elif ip == "":
                nom_ip = "vide"
            else:
                nom_ip = ip.replace(":", "_").replace(".", "-")
            check("test_T1_locale_%s" % nom_ip,
                  srv_nu._locale(ip) == attendu,
                  "obtenu %r pour %r, attendu %r" % (srv_nu._locale(ip), ip, attendu))
    finally:
        import shutil
        shutil.rmtree(tmp_nu, ignore_errors=True)

    # =======================================================================
    # T1bis — `_locale` sous ÉMULATION de la sémantique CPython D'AVANT
    # gh-117566 (bug-018, condition GATE P1 n°6).
    #
    # Sur ce poste, une seule version de Python est installée (3.13.5, déjà
    # corrigée) : supprimer l'extraction `ipv4_mapped` dans `_locale()` ne
    # tue AUCUN test ici, parce que `IPv6Address.is_loopback` de 3.13.5 sait
    # déjà reconnaître une adresse IPv4 mappée. La seule façon de faire
    # mourir ce mutant SANS lancer la CI est de rejouer, temporairement, la
    # sémantique D'AVANT le correctif : `IPv6Address.is_loopback` valait
    # alors `self._ip == 1`, donc UNIQUEMENT `::1`.
    #
    # Sous cette émulation, mesuré à la main avant d'écrire ce test :
    #   ::ffff:127.0.0.1   -> sans extraction : False | avec extraction : True
    #   ::ffff:7f00:1      -> sans extraction : False | avec extraction : True
    #   ::ffff:192.168.1.55-> sans extraction : False | avec extraction : False
    #   ::1                -> sans extraction : True  | avec extraction : True
    #
    # Ce test appelle le VRAI `_locale()` (celui du clone importé), pas une
    # resimulation : si un mutant retire l'extraction `ipv4_mapped`, ce test
    # meurt SUR CE POSTE, sans attendre la CI.
    #
    # `ipaddress.IPv6Address.is_loopback` est une PROPRIÉTÉ DE CLASSE,
    # partagée par tout le processus (y compris le module `ipaddress` importé
    # par le clone : c'est le MÊME objet, mis en cache dans `sys.modules`).
    # La substitution DOIT être restaurée dans un `finally`, sinon elle
    # fuirait sur tous les tests suivants du même processus — un faux vert
    # d'un genre nouveau.
    # =======================================================================
    import ipaddress as _ip_mod

    srv_bis, tmp_bis, _ = TSE._importer_server_clone()
    _propriete_originale = _ip_mod.IPv6Address.is_loopback
    try:
        def _is_loopback_avant_gh117566(self):
            # Sémantique CPython < gh-117566 (absent de 3.12.3, présent à
            # partir de 3.12.4 et de toute la série 3.13) : `::1` seulement,
            # jamais une adresse IPv4 mappée.
            return int(self) == 1

        _ip_mod.IPv6Address.is_loopback = property(_is_loopback_avant_gh117566)

        for ip, attendu in (
            ("::1", True),
            ("::ffff:127.0.0.1", True),
            ("::ffff:7f00:1", True),
            ("::ffff:192.168.1.55", False),
        ):
            nom_ip = ip.replace(":", "_").replace(".", "-")
            obtenu = srv_bis._locale(ip)
            check("test_T1bis_emulation_pre_gh117566_%s" % nom_ip,
                  obtenu == attendu,
                  "obtenu %r pour %r sous émulation pré-gh-117566, attendu %r"
                  % (obtenu, ip, attendu))
    finally:
        _ip_mod.IPv6Address.is_loopback = _propriete_originale
        import shutil
        shutil.rmtree(tmp_bis, ignore_errors=True)

    # Contrôle que la restauration a bien eu lieu : sous la sémantique
    # RÉELLE de ce poste (3.13.5, corrigée), `::ffff:192.168.1.55` reste non
    # locale ET `::ffff:127.0.0.1` reste locale — si la propriété substituée
    # avait fui, ce contrôle mourrait à son tour.
    check("test_T1bis_propriete_is_loopback_restauree",
          _ip_mod.IPv6Address.is_loopback is _propriete_originale)

    # =======================================================================
    # T2 — distant SANS jeton : 401, et AUCUN champ d'activité dans le corps
    # =======================================================================
    g2 = TSE.Groupe(commandes={}, declarer_jeton=False)
    try:
        original = _forcer_distant(g2)
        try:
            code, corps = TSE.requete(g2.port, "GET", "/api/etat", entetes={})
            check("test_T2_distant_sans_jeton_401", code == 401, "obtenu %d" % code)
            donnees = json.loads(corps) if corps else {}
            for champ in ("ecriture_active", "specs", "agents", "workflows",
                          "evenements", "garde_fous", "commandes_declarees", "git"):
                check("test_T2_aucun_champ_%s_dans_le_corps" % champ,
                      champ not in donnees,
                      "le corps distant-sans-jeton contient %r : %r" % (champ, donnees))
        finally:
            g2.srv._locale = original
    finally:
        g2.fermer()

    # =======================================================================
    # T3 — distant AVEC jeton valide : lecture et écriture comme aujourd'hui
    # =======================================================================
    g3 = TSE.Groupe(commandes={"vite": [_PY, "-c", "print('ok')"]},
                    avec_budget=["vite"], declarer_jeton=True)
    try:
        original = _forcer_distant(g3)
        try:
            code, corps = TSE.requete(g3.port, "GET", "/api/etat",
                                      entetes={"Authorization": "Bearer " + g3.jeton_valeur})
            check("test_T3_distant_avec_jeton_200", code == 200, "obtenu %d : %s" % (code, corps))
            donnees = json.loads(corps) if code == 200 else {}
            check("test_T3_distant_avec_jeton_porte_specs",
                  isinstance(donnees.get("specs"), list))

            code, corps = TSE.requete(g3.port, "POST", "/api/lancer",
                                      entetes={"Authorization": "Bearer " + g3.jeton_valeur},
                                      corps=json.dumps({"cle": "vite"}).encode())
            check("test_T3_distant_avec_jeton_ecriture_202", code == 202,
                  "obtenu %d : %s" % (code, corps))
        finally:
            g3.srv._locale = original
    finally:
        g3.fermer()

    # =======================================================================
    # T4 — local SANS jeton configuré : lecture ET écriture fonctionnent,
    # aucun secret exigé (ADR-0020)
    # =======================================================================
    g4 = TSE.Groupe(commandes={"vite": [_PY, "-c", "print('ok')"]},
                    avec_budget=["vite"], declarer_jeton=False)
    try:
        code, corps = TSE.requete(g4.port, "GET", "/api/etat", entetes={})
        check("test_T4_local_sans_jeton_lecture_200", code == 200, "obtenu %d" % code)
        donnees = json.loads(corps) if code == 200 else {}
        # Corrigé (bug-012, correctif 2) : ce test affirmait `False` juste
        # avant de montrer, deux lignes plus bas, un POST qui rend 202 — il
        # certifiait le défaut au lieu de le détecter. `ecriture_active` est
        # désormais calculé PAR DEMANDEUR (`Handler._peut_ecrire`), pas sur la
        # seule présence d'un `fichier_jeton` configuré.
        check("test_T4_local_sans_jeton_ecriture_active_annoncee",
              donnees.get("ecriture_active") is True,
              "obtenu %r" % donnees.get("ecriture_active"))
        check("test_T4_local_sans_jeton_ecriture_raison_vide",
              not donnees.get("ecriture_raison"),
              "obtenu %r" % donnees.get("ecriture_raison"))

        code, corps = TSE.requete(
            g4.port, "POST", "/api/lancer",
            entetes={"Origin": "http://127.0.0.1", "Content-Type": "application/json"},
            corps=json.dumps({"cle": "vite"}).encode())
        check("test_T4_local_sans_jeton_ecriture_202", code == 202,
              "obtenu %d : %s" % (code, corps))
    finally:
        g4.fermer()

    # =======================================================================
    # T5 — local AVEC jeton configuré : le jeton reste EXIGÉ (condition 5 du
    # GATE — c'est ce qui rend la garde distante effective derrière un
    # intermédiaire local)
    # =======================================================================
    g5 = TSE.Groupe(commandes={"vite": [_PY, "-c", "print('ok')"]},
                    avec_budget=["vite"], declarer_jeton=True)
    try:
        code, corps = TSE.requete(g5.port, "GET", "/api/etat", entetes={})
        check("test_T5_local_avec_jeton_sans_authorization_401", code == 401,
              "obtenu %d : %s" % (code, corps))

        code, corps = TSE.requete(g5.port, "GET", "/api/etat",
                                  entetes={"Authorization": "Bearer " + g5.jeton_valeur})
        check("test_T5_local_avec_jeton_authorization_correcte_200", code == 200,
              "obtenu %d : %s" % (code, corps))

        # Écriture locale : même sans jeton local théoriquement facultatif
        # (T4), un jeton CONFIGURÉ le rend obligatoire malgré une origine et
        # un Content-Type par ailleurs conformes — sinon le mutant qui réduit
        # la condition à `distante` (T10) survivrait aussi côté POST.
        code, corps = TSE.requete(
            g5.port, "POST", "/api/lancer",
            entetes={"Origin": "http://127.0.0.1", "Content-Type": "application/json"},
            corps=json.dumps({"cle": "vite"}).encode())
        check("test_T5_local_avec_jeton_ecriture_sans_authorization_401", code == 401,
              "obtenu %d : %s" % (code, corps))
    finally:
        g5.fermer()

    # =======================================================================
    # T6 — gardes CSRF de `do_POST`, local SANS jeton configuré
    # =======================================================================
    g6 = TSE.Groupe(commandes={"vite": [_PY, "-c", "print('ok')"]},
                    avec_budget=["vite"], declarer_jeton=False)
    try:
        # -- Origin ABSENT : passe (combiné à un Content-Type conforme) ------
        code, corps = TSE.requete(
            g6.port, "POST", "/api/lancer",
            entetes={"Content-Type": "application/json"},
            corps=json.dumps({"cle": "vite"}).encode())
        check("test_T6_origin_absent_passe_202", code == 202,
              "obtenu %d : %s" % (code, corps))
        lancement = g6.ecriture().lancement_courant()
        TSE._attendre(lambda: lancement is not None and not lancement.toujours_en_cours())

        # -- Origin HOSTILE : 403 --------------------------------------------
        code, corps = TSE.requete(
            g6.port, "POST", "/api/lancer",
            entetes={"Origin": "http://evil.example",
                     "Content-Type": "application/json"},
            corps=json.dumps({"cle": "vite"}).encode())
        check("test_T6_origin_hostile_403", code == 403, "obtenu %d : %s" % (code, corps))

        # -- Origin: null : 403 (cas nommé explicitement par la spec) --------
        code, corps = TSE.requete(
            g6.port, "POST", "/api/lancer",
            entetes={"Origin": "null", "Content-Type": "application/json"},
            corps=json.dumps({"cle": "vite"}).encode())
        check("test_T6_origin_null_403", code == 403, "obtenu %d : %s" % (code, corps))

        # -- Sec-Fetch-Site: cross-site (sans Origin) : 403 -------------------
        code, corps = TSE.requete(
            g6.port, "POST", "/api/lancer",
            entetes={"Sec-Fetch-Site": "cross-site",
                     "Content-Type": "application/json"},
            corps=json.dumps({"cle": "vite"}).encode())
        check("test_T6_sec_fetch_site_cross_site_403", code == 403,
              "obtenu %d : %s" % (code, corps))

        # -- Origin CONFORME : passe (avec Content-Type conforme) -----------
        code, corps = TSE.requete(
            g6.port, "POST", "/api/lancer",
            entetes={"Origin": "http://127.0.0.1",
                     "Content-Type": "application/json"},
            corps=json.dumps({"cle": "vite"}).encode())
        check("test_T6_origin_conforme_202", code == 202, "obtenu %d : %s" % (code, corps))

        # -- Content-Type non conforme : 400 (corps par ailleurs valide, pour
        #    isoler CETTE garde de la lecture du corps) ----------------------
        code, corps = TSE.requete(
            g6.port, "POST", "/api/lancer",
            entetes={"Origin": "http://127.0.0.1", "Content-Type": "text/plain"},
            corps=json.dumps({"cle": "vite"}).encode())
        check("test_T6_content_type_non_conforme_400", code == 400,
              "obtenu %d : %s" % (code, corps))
    finally:
        g6.fermer()

    # =======================================================================
    # T7 — le frein ne compte, en LECTURE, que les jetons PRÉSENTS ET FAUX
    # (jamais absents) : 30 requêtes sans en-tête ne déclenchent jamais 429 ;
    # 20 jetons faux le déclenchent.
    # =======================================================================
    g7 = TSE.Groupe(commandes={}, declarer_jeton=True)
    try:
        codes = [TSE.requete(g7.port, "GET", "/api/etat", entetes={})[0] for _ in range(30)]
        check("test_T7_30_requetes_sans_entete_jamais_429", 429 not in codes,
              "obtenu %r" % codes)
        check("test_T7_30_requetes_sans_entete_toutes_401", all(c == 401 for c in codes),
              "obtenu %r" % codes)
    finally:
        g7.fermer()

    g7b = TSE.Groupe(commandes={}, declarer_jeton=True)
    try:
        for _ in range(20):
            TSE.requete(g7b.port, "GET", "/api/etat",
                       entetes={"Authorization": "Bearer " + ("z" * 32)})
        code, corps = TSE.requete(g7b.port, "GET", "/api/etat", entetes={})
        check("test_T7_20_jetons_faux_declenchent_429", code == 429,
              "obtenu %d : %s" % (code, corps))
    finally:
        g7b.fermer()

    # =======================================================================
    # T8 — `frame-ancestors 'none'` présent sur `/`
    # =======================================================================
    g8 = TSE.Groupe(commandes={}, declarer_jeton=False)
    try:
        code, _, entetes = _requete_avec_entetes(g8.port, "GET", "/")
        check("test_T8_page_racine_200", code == 200, "obtenu %d" % code)
        csp = entetes.get("Content-Security-Policy", "")
        check("test_T8_frame_ancestors_none", "frame-ancestors 'none'" in csp,
              "CSP obtenue : %r" % csp)
    finally:
        g8.fermer()

    # =======================================================================
    # T9 — `/`, `app.js`, `app.css` restent servis SANS jeton, même DISTANT
    # =======================================================================
    g9 = TSE.Groupe(commandes={}, declarer_jeton=True)
    try:
        original = _forcer_distant(g9)
        try:
            for chemin in ("/", "/app.js", "/app.css"):
                code, _ = TSE.requete(g9.port, "GET", chemin, entetes={})
                check("test_T9_statique_distant_sans_jeton_%s" % chemin.strip("/").replace(".", "_") or "racine",
                      code == 200, "%s : obtenu %d" % (chemin, code))
        finally:
            g9.srv._locale = original
    finally:
        g9.fermer()

    # =======================================================================
    # T10 — jeton DÉCLARÉ mais INVALIDE (mode 0644) : *fail-closed* (ADR-0020).
    # Régression mesurée en revue finale de ce cycle : la décision « un jeton
    # est-il exigé ? » se prenait sur `jeton.actif()` (déclaré ET valide) au
    # lieu du fichier DÉCLARÉ (`config.fichier_jeton()`) — un jeton en 0644
    # retombait sur le régime « aucun jeton, ouvert en local » (ADR-0020) et
    # rouvrait lecture ET écriture à tout le réseau derrière un intermédiaire
    # local, exactement le déploiement que `fichier_jeton` existe pour
    # couvrir.
    # =======================================================================
    g10 = TSE.Groupe(commandes={"vite": [_PY, "-c", "print('ok')"]},
                     avec_budget=["vite"], declarer_jeton=True, jeton_mode=0o644)
    try:
        # -- lecture, locale, sans en-tête : devait déjà fermer -------------
        code, corps = TSE.requete(g10.port, "GET", "/api/etat", entetes={})
        check("test_T10_local_jeton_invalide_lecture_sans_entete_401",
              code == 401, "obtenu %d : %s" % (code, corps))

        # -- lecture, locale, avec la VALEUR CORRECTE présentée : un jeton
        # invalide ne peut jamais être comparé (`Jeton.compare` rend toujours
        # False sans valeur chargée) — personne, pas même le détenteur du
        # bon secret, ne peut plus s'authentifier tant que le fichier n'est
        # pas corrigé ------------------------------------------------------
        code, corps = TSE.requete(g10.port, "GET", "/api/etat",
                                  entetes=TSE._autorisation(g10.jeton_valeur))
        check("test_T10_local_jeton_invalide_lecture_valeur_correcte_401",
              code == 401, "obtenu %d : %s" % (code, corps))
        donnees = json.loads(corps) if corps else {}
        for champ in ("ecriture_active", "specs", "agents", "workflows",
                      "evenements", "garde_fous", "commandes_declarees", "git"):
            check("test_T10_aucun_champ_%s_dans_le_corps" % champ,
                  champ not in donnees,
                  "le corps jeton-invalide contient %r : %r" % (champ, donnees))

        # -- écriture, locale, Origin/Content-Type conformes SANS jeton : le
        # chemin exact de la régression mesurée (`POST /api/lancer` rendait
        # 202 sans qu'aucun jeton n'ait été présenté) --------------------
        code, corps = TSE.requete(
            g10.port, "POST", "/api/lancer",
            entetes={"Origin": "http://127.0.0.1", "Content-Type": "application/json"},
            corps=json.dumps({"cle": "vite"}).encode())
        check("test_T10_local_jeton_invalide_ecriture_sans_jeton_403",
              code == 403, "obtenu %d : %s" % (code, corps))

        # -- écriture, locale, la VALEUR CORRECTE présentée : refusée aussi
        code, corps = TSE.requete(
            g10.port, "POST", "/api/lancer",
            entetes=dict(TSE._autorisation(g10.jeton_valeur),
                         **{"Origin": "http://127.0.0.1", "Content-Type": "application/json"}),
            corps=json.dumps({"cle": "vite"}).encode())
        check("test_T10_local_jeton_invalide_ecriture_valeur_correcte_403",
              code == 403, "obtenu %d : %s" % (code, corps))

        # -- distant, jeton déclaré invalide : ferme aussi -------------------
        original = _forcer_distant(g10)
        try:
            code, corps = TSE.requete(g10.port, "GET", "/api/etat", entetes={})
            check("test_T10_distant_jeton_invalide_lecture_401", code == 401,
                  "obtenu %d : %s" % (code, corps))
        finally:
            g10.srv._locale = original

        # -- aucun processus n'a été lancé pendant ce test ------------------
        check("test_T10_aucun_lancement_courant",
              g10.ecriture().lancement_courant() is None,
              "un lancement a démarré malgré le jeton invalide")
    finally:
        g10.fermer()

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for echec in _echecs:
        print("  - %s" % echec)
    return 1 if _echecs else 0


if __name__ == "__main__":
    try:
        _code = main()
    except Exception as erreur:
        import traceback
        traceback.print_exc()
        print("\n%d cas atteints, INTERROMPU par %s : %s"
              % (_tests, type(erreur).__name__, erreur))
        _code = 1
    sys.exit(_code)
