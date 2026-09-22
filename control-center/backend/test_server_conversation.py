#!/usr/bin/env python3
"""Tests HTTP du canal de conversation — `POST`/`GET /api/conversation`
(feature-022, GATE P1 re-passage, surface S3 ; D1/D2/D3).

    python3 control-center/backend/test_server_conversation.py

Réutilise l'infrastructure de `test_server_ecriture.py` (clone jetable,
`requete()`, `_autorisation()`, `_attendre()` — même raison : `_RACINE_VAR`/
`_RACINE_WEB` dérivent de `__file__`, PIEGES.md §1). `TSE.Groupe` seul ne
sait PAS déclarer une commande sous forme TABLE (`[commandes.<cle>] argv =
… entree = "json-lines"`) ni `[garde_fous].commandes_sans_permissions` : ce
fichier construit donc sa PROPRE configuration TOML, avec `json.dumps()`
plutôt que `%r` — un script `-c` multi-lignes contient de VRAIS retours à la
ligne, que `repr()` rendrait en chaîne TOML *littérale* (guillemets
simples) où `\\n` resterait deux caractères, jamais un saut de ligne.

## Correspondance condition GATE -> test, pour la revue

- S3.1 (route)                    : `test_conversation_dans_les_routes_ecriture`
  (assertion structurelle, `test_server.py`)
- S3.2 (destinataire)             : `test_conversation_sans_canal_404`
- S3.3 (borne caractères/422)     : `test_texte_trop_long_413`,
                                     `test_texte_caractere_controle_422`
- S3.4 (journal 0600, jamais envoyé sans être journalisé) :
                                     `test_conversation_fichier_mode_0600`,
                                     `test_texte_trop_long_ne_journalise_rien`
- S3.7 (effacer le fichier efface le fil, absent du journal d'événements) :
                                     `test_effacer_le_fichier_efface_le_fil`,
                                     `test_texte_absent_du_journal_evenements`
- S3.9 (capacité, 503 avant Popen) : couvert unitairement par
                                     `test_lanceur.py` ; bout en bout ici par
                                     `test_canal_corrompu_503_puis_permanent`
- S3.10 (écriture partielle -> corrompu, permanent) :
                                     `test_canal_corrompu_503_puis_permanent`
- S3.12 (--restricted/--bare)      : `test_argv_restricted_refuse_503_zero_popen`
- S3.13 (mode de permission)       : `test_bypass_permissions_hors_liste_503_zero_popen`,
                                     `test_bypass_permissions_liste_202`
"""

import json
import os
import shutil
import sys
import threading
from http.server import ThreadingHTTPServer

_ICI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, _ICI)
import test_server_ecriture as TSE  # noqa: E402

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


requete = TSE.requete
_autorisation = TSE._autorisation
_attendre = TSE._attendre
_PY = TSE._PY
_VALEUR_JETON = TSE._VALEUR_JETON

# Lit des lignes sur stdin jusqu'à EOF, en réémet une trace sur stdout — tient
# lieu d'agent pour ces tests (`claude` n'est pas installé sur ce poste). UNE
# SEULE ligne logique (liste en compréhension), délibérément : un VRAI saut de
# ligne dans l'argv casserait la config TOML écrite par `repr()` ailleurs dans
# ce dépôt — ici on utilise `json.dumps()`, qui n'a pas ce problème, mais on
# garde la même discipline par cohérence.
_CMD_ECHO_STDIN = [
    _PY, "-c",
    "import sys; [print('recu:' + l.strip(), flush=True) "
    "for l in iter(sys.stdin.readline, '')]",
]


class GroupeConversation:
    """Un `Groupe` (clone `control-center/` + serveur HTTP), construit à la
    main pour porter des commandes TABLE (`entree`) et
    `[garde_fous].commandes_sans_permissions`, que `TSE.Groupe` ne sait pas
    déclarer.
    """

    def __init__(self, commandes_liste=None, commandes_table=None,
                 avec_budget=(), sans_permissions=(), budget_max_usd=5.0,
                 ecrivains_simultanes=1, jeton_valeur=_VALEUR_JETON):
        self.srv, self._tmp, self.clone = TSE._importer_server_clone()

        self.racine_projet = os.path.join(self._tmp, "projet")
        os.makedirs(self.racine_projet, exist_ok=True)
        dossier_jeton = os.path.join(self._tmp, "hors-projet")
        os.makedirs(dossier_jeton, exist_ok=True)
        self.chemin_jeton = os.path.join(dossier_jeton, ".jeton")
        with open(self.chemin_jeton, "w", encoding="utf-8") as f:
            f.write(jeton_valeur + "\n")
        os.chmod(self.chemin_jeton, 0o600)
        self.jeton_valeur = jeton_valeur

        lignes = [
            "[serveur]",
            "fichier_jeton = %s" % json.dumps(self.chemin_jeton),
            "[garde_fous]",
            "budget_max_usd = %r" % budget_max_usd,
            "ecrivains_simultanes = %d" % ecrivains_simultanes,
            "commandes_avec_budget = %s" % json.dumps(list(avec_budget)),
            "commandes_sans_permissions = %s" % json.dumps(list(sans_permissions)),
            "[commandes]",
        ]
        for cle, argv in (commandes_liste or {}).items():
            lignes.append("%s = %s" % (cle, json.dumps(list(argv))))
        for cle, decl in (commandes_table or {}).items():
            lignes.append("[commandes.%s]" % cle)
            lignes.append("argv = %s" % json.dumps(list(decl["argv"])))
            if "entree" in decl:
                lignes.append("entree = %s" % json.dumps(decl["entree"]))

        chemin_toml = os.path.join(self._tmp, "config.toml")
        with open(chemin_toml, "w", encoding="utf-8") as f:
            f.write("\n".join(lignes) + "\n")

        self.config = self.srv.C.charger(chemin=chemin_toml, racine_projet=self.racine_projet)

        self.serveur = ThreadingHTTPServer(("127.0.0.1", 0), self.srv.Handler)
        self.serveur.daemon_threads = True
        self.serveur.etat = self.srv.Etat(self.config)
        self.serveur.servables = self.srv._fichiers_servables()
        self.port = self.serveur.server_address[1]
        self._fil = threading.Thread(target=self.serveur.serve_forever, daemon=True)
        self._fil.start()

    def ecriture(self):
        with self.srv.Handler._verrou_lazy:
            e = getattr(self.serveur, "_ecriture", None)
            if e is None:
                e = self.srv.Ecriture(self.serveur.etat.config)
                self.serveur._ecriture = e
            return e

    def fermer(self):
        try:
            ecriture = getattr(self.serveur, "_ecriture", None)
            if ecriture is not None:
                ecriture.arreter_tout()
        except Exception:
            pass
        self.serveur.shutdown()
        self.serveur.server_close()
        shutil.rmtree(self._tmp, ignore_errors=True)


def _test_chemin_conversation_unitaire():
    """B2 (revue de code, cycle `feature-021`), en dehors de tout serveur
    HTTP : `_chemin_conversation` doit produire des chemins DISTINCTS pour
    deux lancements qui partagent le même `pid` mais pas le même `debut` —
    c'est exactement le cas d'un pid RÉATTRIBUÉ par le noyau entre deux
    lancements. Sans la clé composite, un nouvel agent hériterait du fil
    (et donc des messages) d'un cycle antérieur sans rapport.
    """
    import types

    srv_direct, tmp_direct, _ = TSE._importer_server_clone()
    try:
        ancien = types.SimpleNamespace(pid=4242, debut=1_700_000_000.0)
        nouveau = types.SimpleNamespace(pid=4242, debut=1_700_000_050.0)  # même pid, réattribué plus tard
        chemin_ancien = srv_direct._chemin_conversation(ancien)
        chemin_nouveau = srv_direct._chemin_conversation(nouveau)
        check("test_chemin_conversation_meme_pid_debuts_distincts_fichiers_distincts",
              chemin_ancien != chemin_nouveau,
              "pid réattribué, chemins obtenus identiques : %r" % chemin_ancien)

        ok, _pos = srv_direct._ecrire_message_conversation(
            chemin_ancien, "message-du-cycle-precedent")
        check("test_chemin_conversation_ecriture_ancien_lancement_ok", ok)

        messages_nouveau, _tronque = srv_direct._lire_conversation(chemin_nouveau)
        check("test_pid_reattribue_ne_voit_pas_le_fil_precedent",
              messages_nouveau == [],
              "un lancement neuf sur un pid réattribué ne doit JAMAIS "
              "hériter des messages d'un cycle antérieur ; obtenu %r"
              % messages_nouveau)
    finally:
        shutil.rmtree(tmp_direct, ignore_errors=True)


def _test_marquer_message_envoye_unitaire():
    """B3 (revue de code, cycle `feature-021`), en dehors de tout serveur
    HTTP : la ligne journalisée porte `"envoye": false` à l'écriture, et
    seul un appel explicite à `_marquer_message_envoye` la fait basculer à
    `true` — RIEN d'autre ne doit la faire changer d'état, en particulier
    pas le simple fait d'écrire (cas d'un envoi refusé, 503 : la ligne doit
    rester `false`, sans quoi rien ne distingue plus un message REFUSÉ d'un
    message REMIS).
    """
    srv_direct, tmp_direct, _ = TSE._importer_server_clone()
    try:
        chemin = os.path.join(tmp_direct, "conv-b3.jsonl")
        ok, position = srv_direct._ecrire_message_conversation(chemin, "un message")
        check("test_marquer_envoye_ecriture_initiale_ok", ok)

        messages_avant, _ = srv_direct._lire_conversation(chemin)
        check("test_marquer_envoye_initialement_faux",
              len(messages_avant) == 1 and messages_avant[0]["envoye"] is False,
              "obtenu %r" % messages_avant)

        # Simule un REFUS (503) : jamais d'appel à `_marquer_message_envoye`.
        # La ligne doit rester `false` — c'est cette absence de bascule qui
        # doit permettre à un client de distinguer un message non remis.
        messages_refus, _ = srv_direct._lire_conversation(chemin)
        check("test_marquer_envoye_refus_reste_faux",
              messages_refus[0]["envoye"] is False)

        srv_direct._marquer_message_envoye(chemin, position)
        messages_apres, _ = srv_direct._lire_conversation(chemin)
        check("test_marquer_envoye_bascule_a_vrai_apres_confirmation",
              len(messages_apres) == 1 and messages_apres[0]["envoye"] is True
              and messages_apres[0]["texte"] == "un message",
              "obtenu %r" % messages_apres)
    finally:
        shutil.rmtree(tmp_direct, ignore_errors=True)


def main():
    _test_chemin_conversation_unitaire()
    _test_marquer_message_envoye_unitaire()

    g = GroupeConversation(
        commandes_liste={
            "silencieux": [_PY, "-c", "print('ok')"],
        },
        commandes_table={
            "chat": {"argv": _CMD_ECHO_STDIN, "entree": "json-lines"},
            "chat_restricted": {"argv": _CMD_ECHO_STDIN + ["--restricted"],
                                "entree": "json-lines"},
            "chat_bypass_interdit": {
                "argv": _CMD_ECHO_STDIN + ["--dangerously-skip-permissions"],
                "entree": "json-lines"},
            "chat_bypass_autorise": {
                "argv": _CMD_ECHO_STDIN + ["--dangerously-skip-permissions"],
                "entree": "json-lines"},
        },
        avec_budget=["silencieux", "chat", "chat_restricted",
                    "chat_bypass_interdit", "chat_bypass_autorise"],
        sans_permissions=["chat_bypass_autorise"],
    )
    try:
        entetes = _autorisation(g.jeton_valeur)

        # --- S3.3 : la borne HTTP (`_TAILLES_MAX_CORPS`) est DÉRIVÉE, jamais
        # posée — un test sérialise l'enveloppe PIRE CAS du CORPS de requête
        # (8192 caractères astraux, échappés en `\uXXXX` comme le ferait un
        # client adversarial délibéré, `ensure_ascii=True`) et l'affirme
        # COUVERTE. Une borne recopiée d'un rapport est fausse dès que le
        # texte pire cas mesuré change.
        enveloppe_corps_pire_cas = len(json.dumps(
            {"texte": chr(0x1F600) * 8192}, ensure_ascii=True))
        check("test_borne_corps_http_couvre_l_enveloppe_pire_cas",
              g.srv._TAILLES_MAX_CORPS["/api/conversation"] >= enveloppe_corps_pire_cas,
              "borne=%d, enveloppe pire cas mesurée=%d"
              % (g.srv._TAILLES_MAX_CORPS["/api/conversation"], enveloppe_corps_pire_cas))

        # --- S3.1/auth : sans jeton, 401, sans effet -------------------------
        code, _ = requete(g.port, "POST", "/api/conversation", entetes={},
                          corps=json.dumps({"texte": "x"}).encode())
        check("test_conversation_sans_jeton_401", code == 401, "obtenu %d" % code)
        code, _ = requete(g.port, "GET", "/api/conversation", entetes={})
        check("test_conversation_lecture_sans_jeton_401", code == 401, "obtenu %d" % code)

        # --- 404 : aucun lancement du tout -----------------------------------
        code, _ = requete(g.port, "POST", "/api/conversation", entetes=entetes,
                          corps=json.dumps({"texte": "bonjour"}).encode())
        check("test_conversation_aucun_lancement_404", code == 404, "obtenu %d" % code)

        # --- 404 : un lancement actif, mais SANS canal (entree="aucune") ----
        code, corps = requete(g.port, "POST", "/api/lancer", entetes=entetes,
                              corps=json.dumps({"cle": "silencieux"}).encode())
        check("test_lancer_silencieux_202", code == 202, "obtenu %d : %s" % (code, corps))
        _attendre(lambda: not g.ecriture().lancement_courant().toujours_en_cours())
        code, _ = requete(g.port, "POST", "/api/conversation", entetes=entetes,
                          corps=json.dumps({"texte": "bonjour"}).encode())
        check("test_conversation_sans_canal_404", code == 404, "obtenu %d" % code)

        # --- S3.12 : --restricted refusé, 503, ZÉRO Popen --------------------
        _appels_popen = []
        _popen_original = g.srv.L.subprocess.Popen

        def _popen_espion(*a, **k):
            _appels_popen.append(1)
            return _popen_original(*a, **k)

        g.srv.L.subprocess.Popen = _popen_espion
        try:
            code, corps = requete(g.port, "POST", "/api/lancer", entetes=entetes,
                                  corps=json.dumps({"cle": "chat_restricted"}).encode())
            check("test_argv_restricted_refuse_503_zero_popen",
                  code == 503 and not _appels_popen,
                  "code=%r popen=%r corps=%s" % (code, _appels_popen, corps))
        finally:
            g.srv.L.subprocess.Popen = _popen_original

        # --- S3.13 : bypass hors liste refusé, 503, ZÉRO Popen ---------------
        _appels_popen2 = []
        g.srv.L.subprocess.Popen = lambda *a, **k: (
            _appels_popen2.append(1) or _popen_original(*a, **k))
        try:
            code, corps = requete(g.port, "POST", "/api/lancer", entetes=entetes,
                                  corps=json.dumps({"cle": "chat_bypass_interdit"}).encode())
            check("test_bypass_permissions_hors_liste_503_zero_popen",
                  code == 503 and not _appels_popen2,
                  "code=%r popen=%r corps=%s" % (code, _appels_popen2, corps))
        finally:
            g.srv.L.subprocess.Popen = _popen_original

        # --- S3.13 : bypass LISTÉ, autorisé, 202 ------------------------------
        code, corps = requete(g.port, "POST", "/api/lancer", entetes=entetes,
                              corps=json.dumps({"cle": "chat_bypass_autorise"}).encode())
        check("test_bypass_permissions_liste_202", code == 202,
              "obtenu %d : %s" % (code, corps))
        g.ecriture().interrompre_courant()
        _attendre(lambda: g.ecriture().lancement_courant() is None
                  or not g.ecriture().lancement_courant().toujours_en_cours())

        # =====================================================================
        # Le round-trip nominal : "chat" (entree="json-lines")
        # =====================================================================
        code, corps = requete(g.port, "POST", "/api/lancer", entetes=entetes,
                              corps=json.dumps({"cle": "chat"}).encode())
        check("test_lancer_chat_202", code == 202, "obtenu %d : %s" % (code, corps))
        pid_chat = json.loads(corps)["pid"]

        # -- 400 : texte manquant / non-str ------------------------------------
        code, _ = requete(g.port, "POST", "/api/conversation", entetes=entetes,
                          corps=json.dumps({}).encode())
        check("test_texte_manquant_400", code == 400, "obtenu %d" % code)
        code, _ = requete(g.port, "POST", "/api/conversation", entetes=entetes,
                          corps=json.dumps({"texte": 42}).encode())
        check("test_texte_non_str_400", code == 400, "obtenu %d" % code)

        # B2 (revue feature-021) : nom composite `<pid>-<debut_ms>.jsonl`, lu
        # depuis le lancement RÉSOLU par le serveur — jamais reconstruit à la
        # main à partir du seul pid, sinon ce test ne verrait pas une
        # régression qui retomberait sur l'ancien nom `<pid>.jsonl`.
        lancement_pour_nom = g.ecriture().lancement_conversation()
        check("test_lancement_conversation_resout_pour_le_nom_de_fichier",
              lancement_pour_nom is not None and lancement_pour_nom.pid == pid_chat)
        chemin_fichier_conv = g.srv._chemin_conversation(lancement_pour_nom)

        # -- 413 : texte > 8192 CARACTÈRES, rien n'est journalisé -------------
        texte_trop_long = "é" * 8193  # caractères, pas octets (S3.3)
        code, _ = requete(g.port, "POST", "/api/conversation", entetes=entetes,
                          corps=json.dumps({"texte": texte_trop_long}).encode())
        check("test_texte_trop_long_413", code == 413, "obtenu %d" % code)
        check("test_texte_trop_long_ne_journalise_rien",
              not os.path.exists(chemin_fichier_conv),
              "aucune écriture ne doit précéder le refus de taille (S3.4)")

        # -- 413 : borne du CORPS HTTP (131072), indépendante de la précédente
        corps_enorme = json.dumps({"texte": "x" * 200_000}).encode()
        code, _ = requete(g.port, "POST", "/api/conversation", entetes=entetes,
                          corps=corps_enorme)
        check("test_corps_http_trop_volumineux_413", code == 413, "obtenu %d" % code)

        # -- 422 : caractère de contrôle interdit ------------------------------
        code, _ = requete(g.port, "POST", "/api/conversation", entetes=entetes,
                          corps=json.dumps({"texte": "bonjour\x00monde"}).encode())
        check("test_texte_caractere_controle_422", code == 422, "obtenu %d" % code)
        check("test_texte_caractere_controle_ne_journalise_rien",
              not os.path.exists(chemin_fichier_conv))

        # -- \n et \t restent AUTORISÉS -----------------------------------------
        code, _ = requete(g.port, "POST", "/api/conversation", entetes=entetes,
                          corps=json.dumps({"texte": "ligne1\nligne2\tfin"}).encode())
        check("test_texte_avec_saut_de_ligne_et_tabulation_accepte",
              code == 202, "obtenu %d" % code)

        # ⚠️ Le canal n'accepte qu'UN message en vol (S3.9/S3.10) : attendre que
        # le fils ait LU celui-ci (FIONREAD retombe à 0) avant d'en envoyer un
        # second, sinon le suivant rencontre "canal occupé" par construction —
        # pas un défaut, la propriété même que ce lot établit.
        def _fils_a_lu_le_premier():
            _, corps_lanc = requete(g.port, "GET", "/api/lancement?depuis=0", entetes=entetes)
            return "recu:" in corps_lanc and "ligne1" in corps_lanc

        check("test_fils_lit_le_premier_message", _attendre(_fils_a_lu_le_premier))

        # -- 202 nominal : le message atteint le fils --------------------------
        code, _ = requete(g.port, "POST", "/api/conversation", entetes=entetes,
                          corps=json.dumps({"texte": "bonjour"}).encode())
        check("test_conversation_envoi_nominal_202", code == 202, "obtenu %d" % code)

        def _fils_a_recu():
            _, corps_lanc = requete(g.port, "GET", "/api/lancement?depuis=0", entetes=entetes)
            return "recu:" in corps_lanc and "bonjour" in corps_lanc

        check("test_fils_recoit_le_message", _attendre(_fils_a_recu))

        # -- B3 (revue de code, feature-021) : un envoi RÉUSSI (202) bascule
        # `"envoye"` à `true` sur SA ligne — jamais sur les lignes voisines.
        messages_bruts, _ = g.srv._lire_conversation(chemin_fichier_conv)
        etats_par_texte = {m["texte"]: m["envoye"] for m in messages_bruts}
        check("test_message_remis_202_bascule_envoye_vrai",
              etats_par_texte.get("bonjour") is True,
              "obtenu %r" % etats_par_texte)
        check("test_message_remis_ne_touche_pas_les_voisins",
              etats_par_texte.get("ligne1\nligne2\tfin") is True,
              "obtenu %r" % etats_par_texte)

        # -- mode 0600 (PAS 0644, S3.4) -----------------------------------------
        mode = os.stat(chemin_fichier_conv).st_mode & 0o777
        check("test_conversation_fichier_mode_0600", mode == 0o600,
              "obtenu %o" % mode)

        # -- GET /api/conversation lit le fil, texte présent --------------------
        code, corps = requete(g.port, "GET", "/api/conversation", entetes=entetes)
        check("test_conversation_lecture_200", code == 200, "obtenu %d" % code)
        payload = json.loads(corps)
        textes = [m.get("texte") for m in payload.get("messages", [])]
        check("test_conversation_lecture_contient_le_texte", "bonjour" in textes,
              "obtenu %r" % textes)
        check("test_conversation_lecture_ne_contient_pas_les_refus",
              "42" not in textes and texte_trop_long not in textes,
              "un texte REFUSÉ (413/422/400) ne doit jamais apparaître dans le fil")

        # -- S3.7 : effacer le fichier efface le fil -----------------------------
        os.remove(chemin_fichier_conv)
        code, corps = requete(g.port, "GET", "/api/conversation", entetes=entetes)
        payload = json.loads(corps)
        check("test_effacer_le_fichier_efface_le_fil",
              code == 200 and payload.get("messages") == [],
              "obtenu code=%d payload=%r" % (code, payload))

        # -- S3.7 : le texte n'est NULLE PART ailleurs (agent-events.jsonl) -----
        chemin_journal = os.path.join(g.clone, "var", "agent-events.jsonl")
        if os.path.exists(chemin_journal):
            with open(chemin_journal, encoding="utf-8") as f:
                contenu_journal = f.read()
            check("test_texte_absent_du_journal_evenements",
                  "bonjour" not in contenu_journal,
                  "le texte d'un message de conversation ne doit JAMAIS "
                  "atteindre agent-events.jsonl (S3.7)")
        else:
            check("test_texte_absent_du_journal_evenements", True)

        # =====================================================================
        # S3.9/S3.10 bout en bout : écriture partielle -> canal CORROMPU,
        # PERMANENT (503), aucune écriture suivante n'est tentée.
        # =====================================================================
        lancement_chat = g.ecriture().lancement_conversation()
        check("test_lancement_conversation_resout_le_lancement_chat",
              lancement_chat is not None and lancement_chat.pid == pid_chat)
        if lancement_chat is not None:
            _write_original = g.srv.L.os.write

            def _write_menteur(fd, donnees):
                ecrits = _write_original(fd, donnees)
                return ecrits - 1 if ecrits > 0 else ecrits

            g.srv.L.os.write = _write_menteur
            try:
                code, corps = requete(g.port, "POST", "/api/conversation", entetes=entetes,
                                      corps=json.dumps({"texte": "va-etre-tronque"}).encode())
            finally:
                g.srv.L.os.write = _write_original
            check("test_canal_corrompu_503_puis_permanent_premier_refus",
                  code == 503, "obtenu %d : %s" % (code, corps))
            code2, corps2 = requete(g.port, "POST", "/api/conversation", entetes=entetes,
                                    corps=json.dumps({"texte": "plus-jamais"}).encode())
            check("test_canal_corrompu_503_puis_permanent_second_refus",
                  code2 == 503, "obtenu %d : %s" % (code2, corps2))

            # -- B3 (revue de code, feature-021) : un message REFUSÉ (503) reste
            # journalisé avec `"envoye": false` — rien ne le distingue d'un
            # message remis SAUF ce champ, désormais posé.
            messages_apres_refus, _ = g.srv._lire_conversation(chemin_fichier_conv)
            textes_refuses = {m["texte"]: m["envoye"] for m in messages_apres_refus}
            check("test_message_refuse_503_garde_envoye_faux",
                  textes_refuses.get("va-etre-tronque") is False,
                  "obtenu %r" % textes_refuses)

        # Nettoyage : tue le fils encore vivant.
        g.ecriture().interrompre_courant()

    finally:
        g.fermer()

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
