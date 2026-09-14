#!/usr/bin/env python3
"""Tests des routes d'écriture du serveur — `/api/lancer`, `/api/interrompre`,
`/api/lancement` (feature-007, lot 2).

    python3 control-center/backend/test_server_ecriture.py

## Pourquoi ce fichier clone tout `control-center/`, jamais seulement `backend/`

`_RACINE_VAR` (verrous d'écrivain, `agent-events.jsonl`) et `_RACINE_WEB`
dérivent, dans `server.py`, de l'emplacement de CE fichier
(`os.path.dirname(os.path.dirname(os.path.abspath(__file__)))`). Importer
`server.py` depuis son emplacement RÉEL — même pour un test qui ne fait
qu'instancier `Handler` — écrirait donc dans le var/ et le journal RÉELS du
dépôt. Chaque groupe de tests ci-dessous clone `control-center/` entier dans un
répertoire jetable et importe SA COPIE de `server.py` sous un nom de module
unique, pour que `_RACINE_VAR` et `_RACINE_WEB` pointent dans le clone.

## Ce que chaque item de la spec vérifie ici

- T1 : nominal, clé inconnue (zéro processus, espion), jeton absent/faux (401
  à corps identique), Host invalide (421), corps > 4 Kio (413),
  Content-Length absent/non numérique/Transfer-Encoding (411/400), verrou
  concurrent (409), plafond non transmissible (503), freinage (429).
- T2 : POST sans jeton sur CHAQUE route d'écriture → 401 ET aucun Popen / flock
  appelé (espion, pas une supposition).
- T3 : contrebande de requête — un corps non consommé doit fermer la
  connexion, sur CHACUN des codes concernés.
- T5 : concurrence RÉELLE (threads + `Barrier`) sur `/api/lancer`.
- T6 (niveau intégration, `verrou.py` étant déjà couvert isolément par
  `test_verrou.py`) : le `pid_fils` réel d'un `Lancement` doit se propager
  jusqu'à la méta du verrou, pour qu'un second `Ecriture` (un serveur qui
  redémarrerait) le retrouve.
- T7 : `ecriture_active` / `ecriture_raison` cohérents par demandeur ; aucune
  sortie de commande n'atteint `/api/etat` ni le journal. Le masquage du
  chemin du jeton dans `ecriture_raison` (`_raison_publique`) est couvert
  directement sur la fonction dans `test_server.py` (bug-012, revue finale) :
  depuis le correctif 1 de ce cycle, lecture et écriture partagent la même
  garde, donc plus aucun `/api/etat` anonyme ne répond 200 avec une raison
  non vide à observer ici.
"""

import errno
import importlib.util
import json
import os
import shutil
import signal
import socket
import sys
import tempfile
import threading
import time
from http.server import ThreadingHTTPServer

_ICI = os.path.dirname(os.path.abspath(__file__))
_CONTROL_CENTER_REEL = os.path.dirname(_ICI)

_echecs = []
_tests = 0
_compteur_clone = [0]


def check(nom, condition, detail=""):
    global _tests
    _tests += 1
    if condition:
        print("  ok     %s" % nom)
    else:
        _echecs.append(nom)
        print("  ECHEC  %s%s" % (nom, (" : " + detail) if detail else ""))


# ---------------------------------------------------------------------------
# Clone jetable + import frais de server.py
# ---------------------------------------------------------------------------

def _cloner_control_center():
    tmp = tempfile.mkdtemp(prefix="cc-clone-")
    clone = os.path.join(tmp, "control-center")
    shutil.copytree(
        _CONTROL_CENTER_REEL, clone,
        ignore=shutil.ignore_patterns("__pycache__", "var"))
    os.makedirs(os.path.join(clone, "var"), exist_ok=True)
    return tmp, clone


def _importer_frais(nom_unique, chemin_fichier):
    spec = importlib.util.spec_from_file_location(nom_unique, chemin_fichier)
    module = importlib.util.module_from_spec(spec)
    sys.modules[nom_unique] = module
    spec.loader.exec_module(module)
    return module


def _importer_server_clone():
    """Clone control-center/, importe SA COPIE de server.py sous un nom
    unique. Rend (module_srv, tmp_a_nettoyer, clone_dir)."""
    _compteur_clone[0] += 1
    tmp, clone = _cloner_control_center()
    nom = "server_clone_%d" % _compteur_clone[0]
    srv = _importer_frais(nom, os.path.join(clone, "backend", "server.py"))
    return srv, tmp, clone


_PY = sys.executable
_VALEUR_JETON = "j" * 32  # 32 octets ASCII imprimables, largement > _TAILLE_MIN


class Groupe:
    """Un serveur de test complet : clone jetable, jeton, config, socket."""

    def __init__(self, commandes=None, avec_budget=(), budget_max_usd=5.0,
                 ecrivains_simultanes=1, jeton_mode=0o600, jeton_valeur=_VALEUR_JETON,
                 declarer_jeton=True):
        self.srv, self._tmp, self.clone = _importer_server_clone()

        # racine_projet : un dossier ORDINAIRE, séparé du clone de
        # control-center/ (qui lui n'est que le code du serveur). Le jeton doit
        # être HORS de cette racine.
        self.racine_projet = os.path.join(self._tmp, "projet")
        os.makedirs(self.racine_projet, exist_ok=True)
        self._dossier_jeton = os.path.join(self._tmp, "hors-projet")
        os.makedirs(self._dossier_jeton, exist_ok=True)

        self.chemin_jeton = os.path.join(self._dossier_jeton, ".jeton")
        if declarer_jeton:
            with open(self.chemin_jeton, "w", encoding="utf-8") as f:
                f.write(jeton_valeur + "\n")
            os.chmod(self.chemin_jeton, jeton_mode)

        lignes = ["[serveur]"]
        if declarer_jeton:
            lignes.append('fichier_jeton = %r' % self.chemin_jeton)
        lignes.append("[garde_fous]")
        lignes.append("budget_max_usd = %r" % budget_max_usd)
        lignes.append("ecrivains_simultanes = %d" % ecrivains_simultanes)
        lignes.append("commandes_avec_budget = %r" % list(avec_budget))
        lignes.append("[commandes]")
        for cle, argv in (commandes or {}).items():
            lignes.append("%s = %r" % (cle, list(argv)))
        chemin_toml = os.path.join(self._tmp, "config.toml")
        with open(chemin_toml, "w", encoding="utf-8") as f:
            f.write("\n".join(lignes) + "\n")

        self.config = self.srv.C.charger(chemin=chemin_toml, racine_projet=self.racine_projet)
        self.jeton_valeur = jeton_valeur if declarer_jeton else None

        self.serveur = ThreadingHTTPServer(("127.0.0.1", 0), self.srv.Handler)
        self.serveur.daemon_threads = True
        self.serveur.etat = self.srv.Etat(self.config)
        self.serveur.servables = self.srv._fichiers_servables()
        self.port = self.serveur.server_address[1]
        self._fil = threading.Thread(target=self.serveur.serve_forever, daemon=True)
        self._fil.start()

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

    def ecriture(self):
        """Force la construction paresseuse de `Ecriture`, comme le ferait
        une première requête d'écriture."""
        with self.srv.Handler._verrou_lazy:
            e = getattr(self.serveur, "_ecriture", None)
            if e is None:
                e = self.srv.Ecriture(self.serveur.etat.config)
                self.serveur._ecriture = e
            return e


# ---------------------------------------------------------------------------
# Requêtes brutes — contrôle total des en-têtes (Content-Length omis, faux, etc.)
# ---------------------------------------------------------------------------

def _brut(methode, chemin, entetes, corps=b""):
    tete = "%s %s HTTP/1.1\r\n" % (methode, chemin)
    for cle, valeur in entetes.items():
        tete += "%s: %s\r\n" % (cle, valeur)
    tete += "\r\n"
    return tete.encode("latin-1") + corps


def _lire_reponse(sock, timeout=5.0):
    """Lit UNE réponse HTTP complète (en-têtes + corps selon Content-Length).

    Rend (code, corps_str, reste_brut) — `reste_brut` est ce qui a déjà été lu
    au-delà du corps annoncé (viderait une éventuelle réponse en trop reçue
    dans le même paquet).
    """
    sock.settimeout(timeout)
    tampon = b""
    while b"\r\n\r\n" not in tampon:
        try:
            bloc = sock.recv(4096)
        except socket.timeout:
            break
        if not bloc:
            break
        tampon += bloc
    if b"\r\n\r\n" not in tampon:
        return None, "", tampon
    tete, reste = tampon.split(b"\r\n\r\n", 1)
    lignes = tete.decode("latin-1").split("\r\n")
    code = int(lignes[0].split(" ", 2)[1])
    longueur = None
    for ligne in lignes[1:]:
        if ligne.lower().startswith("content-length:"):
            longueur = int(ligne.split(":", 1)[1].strip())
    while longueur is not None and len(reste) < longueur:
        try:
            bloc = sock.recv(4096)
        except socket.timeout:
            break
        if not bloc:
            break
        reste += bloc
    if longueur is None:
        return code, reste.decode("utf-8", "replace"), b""
    corps = reste[:longueur]
    fuite = reste[longueur:]
    return code, corps.decode("utf-8", "replace"), fuite


def requete(port, methode, chemin, entetes=None, corps=b"", host="127.0.0.1",
            omettre_content_length=False):
    """Une requête isolée sur une connexion fraîche. Rend (code, corps_str)."""
    entetes = dict(entetes or {})
    entetes.setdefault("Host", host)
    if not omettre_content_length and "Content-Length" not in entetes:
        entetes["Content-Length"] = str(len(corps))
    entetes.setdefault("Connection", "close")
    sock = socket.create_connection(("127.0.0.1", port), timeout=5.0)
    try:
        sock.sendall(_brut(methode, chemin, entetes, corps))
        code, texte, _ = _lire_reponse(sock)
        return code, texte
    finally:
        sock.close()


def requete_avec_fuite(port, methode, chemin, entetes, corps):
    """Envoie EN UN SEUL `sendall` une requête suivie d'octets qui, si la
    connexion n'était pas fermée après un corps non consommé, seraient
    réinterprétés comme le DÉBUT de la requête suivante (contrebande).

    Rend (code, corps_str, a_fuite) — `a_fuite` est True si une DEUXIÈME
    réponse HTTP a été reçue sur la même connexion (signe de la contrebande).
    """
    sock = socket.create_connection(("127.0.0.1", port), timeout=5.0)
    try:
        sock.sendall(_brut(methode, chemin, entetes, corps))
        code, texte, fuite_immediate = _lire_reponse(sock)
        if fuite_immediate.startswith(b"HTTP/1."):
            return code, texte, True
        sock.settimeout(1.0)
        try:
            extra = sock.recv(4096)
        except socket.timeout:
            extra = b""
        a_fuite = extra.startswith(b"HTTP/1.")
        return code, texte, a_fuite
    finally:
        sock.close()


def _autorisation(jeton):
    return {} if jeton is None else {"Authorization": "Bearer " + jeton}


def _attendre(predicat, delai=5.0, pas=0.02):
    fin = time.monotonic() + delai
    while time.monotonic() < fin:
        if predicat():
            return True
        time.sleep(pas)
    return predicat()


def main():
    # =======================================================================
    # T1 — nominal, clé inconnue, jeton absent/faux, Host, tailles, verrou,
    #      plafond, freinage
    # =======================================================================
    g = Groupe(commandes={
        "vite": [_PY, "-c", "print('ok')"],
        "dodo": [_PY, "-c", "import time; time.sleep(3)"],
        "av_budget": [_PY, "-c", "import time; time.sleep(1)"],
        "sans_budget": [_PY, "-c", "print('ok')"],
    }, avec_budget=["vite", "dodo", "av_budget"])
    try:
        # -- nominal --------------------------------------------------------
        code, corps = requete(g.port, "POST", "/api/lancer",
                              entetes=_autorisation(g.jeton_valeur),
                              corps=json.dumps({"cle": "vite"}).encode())
        check("test_T1_nominal_202", code == 202, "obtenu %d : %s" % (code, corps))
        donnees = json.loads(corps) if code == 202 else {}
        check("test_T1_nominal_rend_pid", isinstance(donnees.get("pid"), int))

        # -- clé inconnue : ESPION, aucun processus créé ---------------------
        appels = []
        OrigLancement = g.srv.L.Lancement

        class LancementEspion(OrigLancement):
            def __init__(self, *a, **k):
                appels.append((a, k))
                super().__init__(*a, **k)

        g.srv.L.Lancement = LancementEspion
        try:
            code, corps = requete(g.port, "POST", "/api/lancer",
                                  entetes=_autorisation(g.jeton_valeur),
                                  corps=json.dumps({"cle": "fantome"}).encode())
            check("test_T1_cle_inconnue_404", code == 404, "obtenu %d" % code)
            check("test_T1_cle_inconnue_zero_processus_espion", len(appels) == 0,
                  "un Lancement a été construit alors que la clé est inconnue")
        finally:
            g.srv.L.Lancement = OrigLancement

        # -- jeton absent / faux : 401 à CORPS IDENTIQUE ---------------------
        code_absent, corps_absent = requete(g.port, "POST", "/api/lancer",
                                            entetes={},
                                            corps=json.dumps({"cle": "vite"}).encode())
        code_faux, corps_faux = requete(g.port, "POST", "/api/lancer",
                                        entetes={"Authorization": "Bearer " + ("z" * 32)},
                                        corps=json.dumps({"cle": "vite"}).encode())
        check("test_T1_jeton_absent_401", code_absent == 401, "obtenu %d" % code_absent)
        check("test_T1_jeton_faux_401", code_faux == 401, "obtenu %d" % code_faux)
        check("test_T1_401_corps_identique", corps_absent == corps_faux,
              "jeton absent : %r ; jeton faux : %r" % (corps_absent, corps_faux))

        # -- Host invalide : 421 --------------------------------------------
        code, corps = requete(g.port, "POST", "/api/lancer",
                              entetes=_autorisation(g.jeton_valeur),
                              corps=json.dumps({"cle": "vite"}).encode(),
                              host="evil.example.com")
        check("test_T1_host_invalide_421", code == 421, "obtenu %d : %s" % (code, corps))

        # -- Content-Length : absent / non numérique / Transfer-Encoding -----
        code, _ = requete(g.port, "POST", "/api/lancer",
                          entetes=_autorisation(g.jeton_valeur),
                          corps=b"{}", omettre_content_length=True)
        check("test_T1_content_length_absent_411", code == 411, "obtenu %d" % code)

        code, _ = requete(g.port, "POST", "/api/lancer",
                          entetes=dict(_autorisation(g.jeton_valeur),
                                       **{"Content-Length": "abc"}),
                          corps=b"{}")
        check("test_T1_content_length_non_numerique_400", code == 400, "obtenu %d" % code)

        code, _ = requete(g.port, "POST", "/api/lancer",
                          entetes=dict(_autorisation(g.jeton_valeur),
                                       **{"Transfer-Encoding": "chunked"}),
                          corps=b"1\r\nx\r\n0\r\n\r\n")
        check("test_T1_transfer_encoding_refuse_400", code == 400, "obtenu %d" % code)

        # -- corps trop volumineux : 413 -------------------------------------
        gros_corps = b"{" + b" " * 5000 + b"}"
        code, _ = requete(g.port, "POST", "/api/lancer",
                          entetes=_autorisation(g.jeton_valeur), corps=gros_corps)
        check("test_T1_corps_trop_volumineux_413", code == 413, "obtenu %d" % code)

        # -- verrou concurrent (séquentiel) : 409 ----------------------------
        # Le lancement nominal ("vite") plus haut doit avoir rendu le verrou.
        _attendre(lambda: g.ecriture().lancement_courant() is None
                  or not g.ecriture().lancement_courant().toujours_en_cours())
        code, _ = requete(g.port, "POST", "/api/lancer",
                          entetes=_autorisation(g.jeton_valeur),
                          corps=json.dumps({"cle": "dodo"}).encode())
        check("test_T1_second_lancement_demarre", code == 202, "obtenu %d" % code)
        code, corps = requete(g.port, "POST", "/api/lancer",
                              entetes=_autorisation(g.jeton_valeur),
                              corps=json.dumps({"cle": "dodo"}).encode())
        check("test_T1_verrou_concurrent_409", code == 409, "obtenu %d : %s" % (code, corps))
        g.ecriture().interrompre_courant()

        # -- plafond non transmissible : 503 ---------------------------------
        # "sans_budget" est une clé valide de [commandes] mais ABSENTE de
        # `commandes_avec_budget` : le lancement précédent ("dodo") a été
        # interrompu, le verrou est donc libre pour ce test, mais le refus
        # attendu ici tient au plafond, pas au verrou.
        _attendre(lambda: g.ecriture().lancement_courant() is None
                  or not g.ecriture().lancement_courant().toujours_en_cours())
        code, corps = requete(g.port, "POST", "/api/lancer",
                              entetes=_autorisation(g.jeton_valeur),
                              corps=json.dumps({"cle": "sans_budget"}).encode())
        check("test_T1_plafond_non_transmissible_503", code == 503,
              "obtenu %d : %s" % (code, corps))

        # -- T4 : le plafond atteint bien l'argv EFFECTIF (/proc/pid/cmdline) -
        code, corps = requete(g.port, "POST", "/api/lancer",
                              entetes=_autorisation(g.jeton_valeur),
                              corps=json.dumps({"cle": "av_budget"}).encode())
        check("test_T4_av_budget_202", code == 202, "obtenu %d : %s" % (code, corps))
        if code == 202:
            pid = json.loads(corps)["pid"]
            try:
                with open("/proc/%d/cmdline" % pid, "rb") as f:
                    argv_effectif = f.read().split(b"\x00")
            except OSError:
                argv_effectif = []
            argv_texte = [a.decode("utf-8", "replace") for a in argv_effectif]
            check("test_T4_argv_effectif_porte_max_budget_usd",
                  "--max-budget-usd" in argv_texte,
                  "argv effectif lu dans /proc : %r" % argv_texte)
            if "--max-budget-usd" in argv_texte:
                indice = argv_texte.index("--max-budget-usd")
                check("test_T4_argv_effectif_porte_la_valeur_configuree",
                      argv_texte[indice + 1] == str(g.config.budget_max_usd()),
                      "obtenu %r, attendu %r"
                      % (argv_texte[indice + 1], str(g.config.budget_max_usd())))
            g.ecriture().interrompre_courant()

        # -- freinage : 429 après trop d'échecs -------------------------------
        # Groupe DÉDIÉ : le compteur d'échecs est partagé par tout le serveur,
        # il ne doit pas être pollué par les 401 déjà envoyés ci-dessus.
    finally:
        g.fermer()

    g2 = Groupe(commandes={"vite": [_PY, "-c", "print('ok')"]}, avec_budget=["vite"])
    try:
        SEUIL = g2.srv._FREINAGE_MAX_ECHECS
        for _ in range(SEUIL):
            requete(g2.port, "POST", "/api/lancer", entetes={},
                    corps=json.dumps({"cle": "vite"}).encode())
        code, corps = requete(g2.port, "POST", "/api/lancer",
                              entetes=_autorisation(g2.jeton_valeur),
                              corps=json.dumps({"cle": "vite"}).encode())
        check("test_T1_freinage_429_apres_seuil_meme_avec_bon_jeton",
              code == 429, "obtenu %d : %s" % (code, corps))
    finally:
        g2.fermer()

    # =======================================================================
    # T2 — POST sans jeton sur CHAQUE route : 401 ET AUCUN Popen / flock
    # =======================================================================
    g3 = Groupe(commandes={"dodo": [_PY, "-c", "import time; time.sleep(2)"]})
    try:
        appels_popen = []
        appels_flock = []
        OrigLancement = g3.srv.L.Lancement
        OrigAcquerir = g3.srv.VR.Verrou.acquerir

        class LancementEspionT2(OrigLancement):
            def __init__(self, *a, **k):
                appels_popen.append(1)
                super().__init__(*a, **k)

        def acquerir_espion(self, *a, **k):
            appels_flock.append(1)
            return OrigAcquerir(self, *a, **k)

        g3.srv.L.Lancement = LancementEspionT2
        g3.srv.VR.Verrou.acquerir = acquerir_espion
        try:
            code, _ = requete(g3.port, "POST", "/api/lancer", entetes={},
                              corps=json.dumps({"cle": "dodo"}).encode())
            check("test_T2_lancer_sans_jeton_401", code == 401, "obtenu %d" % code)
            check("test_T2_lancer_sans_jeton_aucun_popen", len(appels_popen) == 0)
            check("test_T2_lancer_sans_jeton_aucun_flock", len(appels_flock) == 0)

            code, _ = requete(g3.port, "POST", "/api/interrompre", entetes={}, corps=b"")
            check("test_T2_interrompre_sans_jeton_401", code == 401, "obtenu %d" % code)
            check("test_T2_interrompre_sans_jeton_aucun_popen_supplementaire",
                  len(appels_popen) == 0)
        finally:
            g3.srv.L.Lancement = OrigLancement
            g3.srv.VR.Verrou.acquerir = OrigAcquerir
    finally:
        g3.fermer()

    # =======================================================================
    # T3 — contrebande de requête : corps non consommé ⇒ connexion fermée,
    #      pour CHACUN des codes concernés (401/400/411/413/421/429)
    # =======================================================================
    g4 = Groupe(commandes={"vite": [_PY, "-c", "print('ok')"]})
    try:
        injecte = b"GET /INJECTE HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"

        # 401 : jeton absent
        code, _, fuite = requete_avec_fuite(
            g4.port, "POST", "/api/lancer",
            {"Host": "127.0.0.1", "Content-Length": str(len(injecte))},
            injecte)
        check("test_T3_401_ne_fuite_pas", code == 401 and not fuite,
              "code=%r fuite=%r" % (code, fuite))

        # 421 : Host invalide (jeton correct, sinon on retomberait sur 401
        # avant même d'atteindre la vérification de Host)
        code, _, fuite = requete_avec_fuite(
            g4.port, "POST", "/api/lancer",
            {"Host": "evil.example.com", "Authorization": "Bearer " + g4.jeton_valeur,
             "Content-Length": str(len(injecte))},
            injecte)
        check("test_T3_421_ne_fuite_pas", code == 421 and not fuite,
              "code=%r fuite=%r" % (code, fuite))

        # 411 : Content-Length absent
        code, _, fuite = requete_avec_fuite(
            g4.port, "POST", "/api/lancer",
            {"Host": "127.0.0.1", "Authorization": "Bearer " + g4.jeton_valeur},
            injecte)
        check("test_T3_411_ne_fuite_pas", code == 411 and not fuite,
              "code=%r fuite=%r" % (code, fuite))

        # 400 : Content-Length non numérique
        code, _, fuite = requete_avec_fuite(
            g4.port, "POST", "/api/lancer",
            {"Host": "127.0.0.1", "Authorization": "Bearer " + g4.jeton_valeur,
             "Content-Length": "abc"},
            injecte)
        check("test_T3_400_ne_fuite_pas", code == 400 and not fuite,
              "code=%r fuite=%r" % (code, fuite))

        # 413 : corps trop volumineux
        code, _, fuite = requete_avec_fuite(
            g4.port, "POST", "/api/lancer",
            {"Host": "127.0.0.1", "Authorization": "Bearer " + g4.jeton_valeur,
             "Content-Length": "999999"},
            injecte)
        check("test_T3_413_ne_fuite_pas", code == 413 and not fuite,
              "code=%r fuite=%r" % (code, fuite))

        # 429 : freinage (20 échecs d'abord, sur ce MÊME groupe dédié)
        for _ in range(g4.srv._FREINAGE_MAX_ECHECS):
            requete(g4.port, "POST", "/api/lancer", entetes={}, corps=b"{}")
        code, _, fuite = requete_avec_fuite(
            g4.port, "POST", "/api/lancer",
            {"Host": "127.0.0.1", "Content-Length": str(len(injecte))},
            injecte)
        check("test_T3_429_ne_fuite_pas", code == 429 and not fuite,
              "code=%r fuite=%r" % (code, fuite))
    finally:
        g4.fermer()

    # =======================================================================
    # T5 — concurrence RÉELLE : N threads sur une Barrier, UN SEUL 202
    # =======================================================================
    g5 = Groupe(commandes={"dodo": [_PY, "-c", "import time; time.sleep(1.5)"]},
                avec_budget=["dodo"])
    try:
        N = 8
        barriere = threading.Barrier(N)
        resultats = [None] * N

        def lancer_concurrent(indice):
            barriere.wait()
            code, _ = requete(g5.port, "POST", "/api/lancer",
                              entetes=_autorisation(g5.jeton_valeur),
                              corps=json.dumps({"cle": "dodo"}).encode())
            resultats[indice] = code

        fils = [threading.Thread(target=lancer_concurrent, args=(i,)) for i in range(N)]
        for f in fils:
            f.start()
        for f in fils:
            f.join(timeout=10)

        nb_202 = resultats.count(202)
        nb_409 = resultats.count(409)
        check("test_T5_un_seul_202_parmi_N_concurrents", nb_202 == 1,
              "obtenu %r" % resultats)
        check("test_T5_les_autres_sont_409", nb_409 == N - 1,
              "obtenu %r" % resultats)
        g5.ecriture().interrompre_courant()
    finally:
        g5.fermer()

    # =======================================================================
    # T6 (intégration) — le pid_fils RÉEL se propage jusqu'à la méta du
    # verrou ; un second `Ecriture` (serveur qui redémarre) sur le MÊME
    # fichier de verrou le détecte tant que le fils est vivant, et peut
    # reprendre la place une fois le fils mort.
    # =======================================================================
    g6 = Groupe(commandes={"dodo": [_PY, "-c", "import time; time.sleep(3)"]},
                avec_budget=["dodo"], ecrivains_simultanes=1)
    try:
        code, corps = requete(g6.port, "POST", "/api/lancer",
                              entetes=_autorisation(g6.jeton_valeur),
                              corps=json.dumps({"cle": "dodo"}).encode())
        check("test_T6_lancement_initial_202", code == 202, "obtenu %d" % code)
        lancement1 = g6.ecriture().lancement_courant()
        pid_fils_reel = lancement1.pid

        # ⚠️ Simuler un CRASH DU SERVEUR, pas une interruption propre : le
        # noyau referme le descripteur de verrou (donc le flock se libère),
        # mais le FILS, lui, continue de tourner. `Verrou.liberer()` ne touche
        # qu'au descripteur de verrou, jamais au processus fils — c'est
        # exactement ce que ferait la fermeture du descripteur par le noyau.
        # Sans ce détachement, la seconde tentative échouerait de toute façon
        # sur le flock lui-même (toujours tenu par le premier), et ne
        # prouverait RIEN sur `_fils_toujours_vivant` — c'est le trou qu'une
        # première version de ce test laissait passer (mutation « reprise
        # d'orphelin neutralisée » non tuée).
        lancement1.verrou.liberer()

        # Un second Ecriture, sur le MÊME chemin de verrou (simule le serveur
        # qui redémarre après ce crash) : refusé tant que le fils RÉEL vit.
        chemin_verrou = os.path.join(g6.clone, "var", "ecrivain-0.lock")
        second = g6.srv.Ecriture(g6.config)
        second.verrous = [g6.srv.VR.Verrou(chemin=chemin_verrou)]
        lancement2, raison2 = second.lancer(
            "dodo", [_PY, "-c", "print('ne devrait pas partir')"],
            g6.racine_projet, os.path.join(g6.clone, "var", "j2.jsonl"))
        check("test_T6_second_ecriture_refuse_tant_que_le_fils_vit",
              lancement2 is None and bool(raison2), "obtenu %r, %r" % (lancement2, raison2))
        if lancement2 is not None:
            lancement2.interrompre()

        # Le fils RÉEL du premier lancement meurt (tué directement, puisque
        # son propre `Lancement` n'a plus le verrou pour l'interrompre
        # proprement) : la place doit redevenir prenable pour le second
        # `Ecriture`.
        g6.srv.L.tuer_immediatement(pid_fils_reel)
        _attendre(lambda: not g6.srv.VR._fils_toujours_vivant(
            pid_fils_reel, lancement1.verrou.meta.get("starttime")
            if lancement1.verrou.meta else None))
        lancement3, raison3 = second.lancer(
            "dodo", [_PY, "-c", "print('reprise')"],
            g6.racine_projet, os.path.join(g6.clone, "var", "j2.jsonl"))
        check("test_T6_reprise_une_fois_le_fils_mort",
              lancement3 is not None, "raison : %r" % raison3)
        if lancement3 is not None:
            lancement3.interrompre()
    finally:
        g6.fermer()

    # =======================================================================
    # T7 — `ecriture_active` / `ecriture_raison`, aucune fuite de sortie
    # =======================================================================
    g7_actif = Groupe(commandes={"vite": [_PY, "-c",
                                          "print('MARQUEUR_SECRET_9f3')"]},
                      avec_budget=["vite"])
    try:
        # ⚠️ bug-012 (ADR-0020, condition 5 du GATE) : un `fichier_jeton`
        # CONFIGURÉ reste vérifié même en boucle LOCALE — c'est lui qui rend
        # la garde distante effective derrière un intermédiaire local. Ce
        # `Groupe` déclare un jeton (`declarer_jeton` par défaut), donc
        # `GET /api/etat` l'EXIGE désormais, y compris ici. Sans
        # `Authorization`, cette requête reçoit 401 et ce test vérifiait alors
        # un corps d'ERREUR, pas l'état — établi par exécution, `bug-012`.
        code, corps = requete(g7_actif.port, "GET", "/api/etat",
                              entetes=_autorisation(g7_actif.jeton_valeur), corps=b"")
        etat = json.loads(corps)
        check("test_T7_ecriture_active_vrai_avec_jeton", etat.get("ecriture_active") is True)
        check("test_T7_ecriture_raison_absente_quand_actif",
              etat.get("ecriture_raison") is None)

        code, corps = requete(g7_actif.port, "POST", "/api/lancer",
                              entetes=_autorisation(g7_actif.jeton_valeur),
                              corps=json.dumps({"cle": "vite"}).encode())
        check("test_T7_marqueur_lancement_ok", code == 202)
        lancement = g7_actif.ecriture().lancement_courant()
        _attendre(lambda: lancement is not None and not lancement.toujours_en_cours())

        # ⚠️ Même motif que ci-dessus : sans `Authorization`, cette requête
        # serait bloquée en 401 AVANT même de construire l'instantané, et le
        # test « passerait » sans avoir vérifié la moindre purge du marqueur —
        # exactement le chemin qui ne prouve rien tant que la garde qu'il
        # traverse n'est pas réellement atteinte.
        code, corps_etat = requete(g7_actif.port, "GET", "/api/etat",
                                   entetes=_autorisation(g7_actif.jeton_valeur), corps=b"")
        check("test_T7_reponse_etat_200_apres_lancement", code == 200,
              "obtenu %d : la vérification suivante ne prouve rien sur un corps "
              "d'erreur" % code)
        check("test_T7_marqueur_absent_de_api_etat",
              "MARQUEUR_SECRET_9f3" not in corps_etat,
              "la sortie de la commande a fuité dans /api/etat")
        journal = g7_actif.serveur.etat.journal
        try:
            with open(journal, encoding="utf-8") as f:
                contenu_journal = f.read()
        except OSError:
            contenu_journal = ""
        check("test_T7_marqueur_absent_du_journal",
              "MARQUEUR_SECRET_9f3" not in contenu_journal,
              "la sortie de la commande a fuité dans le journal d'événements")
        for champ_interdit in ("lignes", "sortie", "stdout"):
            check("test_T7_champ_%s_absent_de_champs_publics" % champ_interdit,
                  champ_interdit not in g7_actif.srv._CHAMPS_PUBLICS)
    finally:
        g7_actif.fermer()

    g7_inactif = Groupe(commandes={}, declarer_jeton=False)
    try:
        # Corrigé (bug-012, ADR-0020, correctif 2) : en local sans
        # `fichier_jeton` configuré, l'écriture RÉUSSIT (même règle que
        # `do_POST`) — `ecriture_active` doit donc l'annoncer, calculé PAR
        # DEMANDEUR (`Handler._peut_ecrire`), pas sur la seule présence d'un
        # jeton configuré. Cette assertion valait `False` avant ce correctif :
        # elle certifiait l'ancien comportement, pas celui du déploiement
        # local que cible ADR-0020.
        code, corps = requete(g7_inactif.port, "GET", "/api/etat", entetes={}, corps=b"")
        etat = json.loads(corps)
        check("test_T7_ecriture_active_vrai_local_sans_jeton",
              etat.get("ecriture_active") is True,
              "obtenu %r" % etat.get("ecriture_active"))
        check("test_T7_ecriture_raison_vide_local_sans_jeton",
              not etat.get("ecriture_raison"),
              "obtenu %r" % etat.get("ecriture_raison"))
    finally:
        g7_inactif.fermer()

    # =======================================================================
    # T8 — ORDRE des gardes : un anonyme n'apprend RIEN au-delà du 401, même
    # avec un Host invalide ou un Content-Length absent. Le mutant « garde
    # jeton déplacée après la lecture du corps » doit mourir ici : condition 9
    # du GATE P1, jusqu'ici prouvée par la place du code mais jamais par un
    # test qui échouerait si la place changeait.
    # =======================================================================
    g8 = Groupe(commandes={"vite": [_PY, "-c", "print('ok')"]})
    try:
        code, _ = requete(g8.port, "POST", "/api/lancer", entetes={},
                          corps=json.dumps({"cle": "vite"}).encode(),
                          host="evil.example.com")
        check("test_T8_anonyme_host_invalide_401_pas_421", code == 401,
              "un anonyme sans jeton et avec un Host invalide doit voir le "
              "401 (jeton) avant le 421 (Host) ; obtenu %d" % code)

        code, _ = requete(g8.port, "POST", "/api/lancer", entetes={},
                          corps=json.dumps({"cle": "vite"}).encode(),
                          omettre_content_length=True)
        check("test_T8_anonyme_sans_content_length_401_pas_411", code == 401,
              "un anonyme sans jeton et sans Content-Length doit voir le "
              "401 (jeton) avant le 411 (Content-Length) ; obtenu %d" % code)
    finally:
        g8.fermer()

    # =======================================================================
    # T9 — une commande qui MEURT À L'EXEC ne doit jamais laisser le verrou
    # d'écrivain fuité (régression du GATE P2 : `_fil.start()` démarré avant
    # l'assignation de `lancement.verrou` dans `Lancement.__init__`). Si le
    # fils meurt dans cette fenêtre, `_sur_fin` voyait `verrou is None` et ne
    # le rendait jamais — 409 permanent jusqu'au redémarrage du serveur.
    # =======================================================================
    g9 = Groupe(commandes={"meurt": [_PY, "-c", "import sys; sys.exit(0)"]},
                avec_budget=["meurt"], ecrivains_simultanes=1)
    try:
        for tentative in range(5):
            code, corps = requete(g9.port, "POST", "/api/lancer",
                                  entetes=_autorisation(g9.jeton_valeur),
                                  corps=json.dumps({"cle": "meurt"}).encode())
            check("test_T9_lancement_%d_202_verrou_non_fuite" % tentative,
                  code == 202,
                  "tentative %d : obtenu %d : %s (verrou probablement fuité "
                  "par un lancement précédent mort trop vite)"
                  % (tentative, code, corps))
            lancement = g9.ecriture().lancement_courant()
            ok = _attendre(lambda: lancement is not None
                            and not lancement.toujours_en_cours())
            check("test_T9_lancement_%d_se_termine" % tentative, ok)

        # Régression au niveau unitaire, structurelle et DÉTERMINISTE — pas de
        # dépendance au séquencement réel du système (la fenêtre de course
        # naturelle est trop étroite pour se reproduire de façon fiable par le
        # seul timing : mesuré à 0,41 ms de vie du fils contre 0,14 ms
        # d'`acquerir()`, et un `python -c "...exit(0)"` prend en pratique
        # largement plus longtemps à démarrer que ça, ce qui masque le défaut
        # dans un test qui ne ferait QUE lancer la commande et regarder si le
        # verrou a fui). On vérifie donc directement l'INVARIANT structurel :
        # `Thread.ident` reste `None` tant que `start()` n'a jamais été
        # appelée, et devient non-`None` de façon SYNCHRONE dès que `start()`
        # retourne (documenté : `_bootstrap_inner` assigne `_ident` puis
        # débloque `start()` via `_started.wait()`) — ce n'est pas racy, que
        # le thread ait fini de tourner ou non au moment du contrôle.
        lancement_unitaire = g9.srv.L.Lancement(
            "t", [_PY, "-c", "import sys; sys.exit(0)"], cwd=g9.racine_projet)
        check("test_T9_thread_non_demarre_avant_demarrer_lecture",
              lancement_unitaire._fil.ident is None,
              "le thread de lecture ne doit démarrer qu'explicitement, jamais "
              "depuis __init__ — sinon `sur_fin` peut voir `verrou` à None "
              "avant que l'appelant n'ait fini de l'assigner")
        lancement_unitaire.verrou = "verrou-simule-par-le-test"
        lancement_unitaire.demarrer_lecture()
        check("test_T9_thread_demarre_apres_demarrer_lecture",
              lancement_unitaire._fil.ident is not None)
        _attendre(lambda: not lancement_unitaire.toujours_en_cours())
    finally:
        g9.fermer()

    # =======================================================================
    # T10 — GATE P2 : `verrou.acquerir()` lève une `OSError` AUTRE qu'une
    # place déjà prise (`ENOSPC`, `EROFS`…) ENTRE le `Popen` et l'assignation
    # de `lancement.verrou`. Sans le `finally` de `Ecriture.lancer()`, le fils
    # survivrait ORPHELIN : jamais confié au thread de lecture, jamais tué,
    # et sans méta de verrou écrite pour que la garde « 409 orphelin vivant »
    # le détecte ensuite. On vérifie PAR EXÉCUTION que le fils réel est mort
    # — pas seulement que `lancer()` laisse l'OSError se propager.
    # =======================================================================
    # ⚠️ La commande dort BIEN PLUS LONGTEMPS que la fenêtre d'attente du test
    # (30s de sommeil contre 5s de patience) : sans cet écart, un fils non tué
    # pourrait terminer de lui-même juste avant le dernier sondage de
    # `_attendre` et faire passer le test SANS RIEN PROUVER — coïncidence de
    # durée constatée par exécution sur une première version de ce test (5s
    # partout), qui passait aussi bien avec qu'AVANT ce correctif.
    _CMD_T10 = [_PY, "-c", "import time; time.sleep(30)"]
    g10 = Groupe(commandes={"attend": _CMD_T10}, avec_budget=["attend"],
                 ecrivains_simultanes=1)
    pids_a_nettoyer = []
    try:
        ecriture10 = g10.ecriture()

        captures = []
        ClasseLancementOrigine = g10.srv.L.Lancement

        class _LancementEspion(ClasseLancementOrigine):
            def __init__(self, *a, **kw):
                super().__init__(*a, **kw)
                # Capturé ICI, tout de suite après le `Popen` (donc AVANT le
                # premier appel à `acquerir()`, donc AVANT toute tentative de
                # tuer le fils, que le correctif soit présent ou non) : sinon,
                # avec le correctif en place, le fils pourrait déjà être mort
                # (et son `/proc/<pid>/stat` disparu) au moment où le test
                # tenterait de lire son starttime — ce qui ferait passer le
                # test SANS RIEN PROUVER (`_fils_toujours_vivant` rend `False`
                # dès que `starttime_attendu` est `None`).
                self.starttime_test = g10.srv.VR._starttime(self.pid)
                captures.append(self)

        ClasseVerrouOrigine = g10.srv.VR.Verrou
        acquerir_origine = ClasseVerrouOrigine.acquerir

        def _acquerir_panne_disque(self, cle, pid_fils=None):
            raise OSError(errno.ENOSPC, "no space left on device (simule pour le test)")

        g10.srv.L.Lancement = _LancementEspion
        ClasseVerrouOrigine.acquerir = _acquerir_panne_disque
        try:
            leve = None
            try:
                ecriture10.lancer("attend", _CMD_T10, g10.racine_projet,
                                   os.path.join(g10.clone, "var", "j10.jsonl"))
            except OSError as erreur:
                leve = erreur
        finally:
            g10.srv.L.Lancement = ClasseLancementOrigine
            ClasseVerrouOrigine.acquerir = acquerir_origine

        check("test_T10_OSError_non_EAGAIN_se_propage",
              leve is not None and leve.errno == errno.ENOSPC,
              "obtenu %r" % leve)
        check("test_T10_un_seul_fils_lance", len(captures) == 1,
              "obtenu %d" % len(captures))

        if captures:
            fils = captures[0]
            pids_a_nettoyer.append(fils.pid)  # filet de sécurité, cf. finally
            check("test_T10_lancement_n_a_jamais_recu_de_verrou",
                  fils.verrou is None)
            check("test_T10_starttime_capture_avant_toute_mise_a_mort",
                  fils.starttime_test is not None,
                  "starttime introuvable dès la construction : le test ne "
                  "prouverait plus rien")
            mort = _attendre(
                lambda: not g10.srv.VR._fils_toujours_vivant(
                    fils.pid, fils.starttime_test),
                delai=5.0)
            check("test_T10_fils_reellement_tue_par_execution", mort,
                  "le pid %d du fils orphelin est encore vivant après la "
                  "panne simulée de acquerir() (dort 30s, teste 5s : donc "
                  "réellement tué, jamais une coïncidence de durée)"
                  % fils.pid)
    finally:
        # Filet de sécurité INDÉPENDANT du correctif testé : si `lancer()`
        # laisse un fils sans verrou (assertion ci-dessus en échec, ou
        # `server.py` de nouveau régressé), ce test ne doit pas abandonner un
        # `sleep(30)` réel dans l'environnement du sandbox jetable.
        for pid in pids_a_nettoyer:
            try:
                os.killpg(pid, signal.SIGKILL)
            except OSError:
                pass
        g10.fermer()

    # =======================================================================
    # T11 — revue finale de feature-007, point 3 : `demarrer_lecture()`
    # elle-même lève (ex. épuisement de threads du système) APRÈS que
    # `verrou.acquerir()` a réussi. `lancement.verrou` est déjà assigné à ce
    # moment-là : le `finally` générique de `Ecriture.lancer()` (celui qui
    # couvre T10) ne voit alors PLUS `lancement.verrou is None` et ne fait
    # RIEN — sans un chemin dédié, le fils resterait vivant, orphelin, et le
    # verrou resterait tenu indéfiniment (aucun thread de lecture pour jamais
    # appeler `_sur_fin`, qui est le SEUL point qui rend le verrou). On
    # vérifie PAR EXÉCUTION RÉELLE que ni l'un ni l'autre ne survit : le fils
    # est bien tué, ET une tentative de lancement normale, juste après, réussit
    # immédiatement (preuve que le flock n'est pas resté tenu).
    # =======================================================================
    _CMD_T11 = [_PY, "-c", "import time; time.sleep(30)"]
    g11 = Groupe(commandes={"attend": _CMD_T11,
                            "rapide": [_PY, "-c", "print('ok')"]},
                 avec_budget=["attend", "rapide"], ecrivains_simultanes=1)
    pids_a_nettoyer11 = []
    try:
        ecriture11 = g11.ecriture()

        captures11 = []
        ClasseLancementOrigine11 = g11.srv.L.Lancement

        class _LancementEspion11(ClasseLancementOrigine11):
            def __init__(self, *a, **kw):
                super().__init__(*a, **kw)
                # Même raison qu'en T10 : capturé avant toute tentative de
                # mise à mort, correctif présent ou non.
                self.starttime_test = g11.srv.VR._starttime(self.pid)
                captures11.append(self)

        def _demarrer_lecture_qui_leve(self):
            raise RuntimeError("can't start new thread (simulé pour le test)")

        g11.srv.L.Lancement = _LancementEspion11
        DemarrerLectureOrigine11 = ClasseLancementOrigine11.demarrer_lecture
        ClasseLancementOrigine11.demarrer_lecture = _demarrer_lecture_qui_leve
        try:
            leve11 = None
            try:
                ecriture11.lancer("attend", _CMD_T11, g11.racine_projet,
                                   os.path.join(g11.clone, "var", "j11.jsonl"))
            except RuntimeError as erreur:
                leve11 = erreur
        finally:
            g11.srv.L.Lancement = ClasseLancementOrigine11
            ClasseLancementOrigine11.demarrer_lecture = DemarrerLectureOrigine11

        check("test_T11_demarrer_lecture_qui_leve_se_propage",
              leve11 is not None, "obtenu %r" % leve11)
        check("test_T11_un_seul_fils_lance", len(captures11) == 1,
              "obtenu %d" % len(captures11))

        if captures11:
            fils11 = captures11[0]
            pids_a_nettoyer11.append(fils11.pid)  # filet de sécurité
            check("test_T11_lancement_verrou_remis_a_none_apres_echec",
                  fils11.verrou is None)
            check("test_T11_starttime_capture_avant_toute_mise_a_mort",
                  fils11.starttime_test is not None,
                  "starttime introuvable dès la construction : le test ne "
                  "prouverait plus rien")
            mort11 = _attendre(
                lambda: not g11.srv.VR._fils_toujours_vivant(
                    fils11.pid, fils11.starttime_test),
                delai=5.0)
            check("test_T11_fils_reellement_tue_par_execution", mort11,
                  "le pid %d est encore vivant après l'échec simulé de "
                  "demarrer_lecture() (dort 30s, teste 5s : donc réellement "
                  "tué, jamais une coïncidence de durée)" % fils11.pid)

            # Le point CRITIQUE : le verrou (flock RÉEL) ne doit pas être
            # resté tenu. Un lancement normal, juste après, doit réussir
            # IMMÉDIATEMENT — pas une inspection d'attribut interne, une
            # vraie tentative de prise par `Ecriture.lancer()` non patché.
            lancement_apres11, raison_apres11 = ecriture11.lancer(
                "rapide", [_PY, "-c", "print('ok')"], g11.racine_projet,
                os.path.join(g11.clone, "var", "j11-apres.jsonl"))
            check("test_T11_verrou_non_fuite_relance_immediate_reussit",
                  lancement_apres11 is not None,
                  "obtenu raison=%r — si le verrou avait fui, ce second "
                  "lancement, pourtant normal, aurait été refusé" % raison_apres11)
            if lancement_apres11 is not None:
                _attendre(lambda: not lancement_apres11.toujours_en_cours())
    finally:
        # Filet de sécurité INDÉPENDANT du correctif testé, même motif qu'en
        # T10 : ce test ne doit jamais abandonner un `sleep(30)` réel dans
        # l'environnement du sandbox jetable.
        for pid in pids_a_nettoyer11:
            try:
                os.killpg(pid, signal.SIGKILL)
            except OSError:
                pass
        g11.fermer()

    # =======================================================================
    # Mutation T9 #12 — `Handler.timeout` : un corps annoncé mais jamais
    # honoré bloquerait un thread indéfiniment sans cette borne. On vérifie la
    # valeur DÉCLARÉE plutôt que de la reproduire par un test comportemental :
    # celui-ci devrait attendre 30 RÉELLES secondes pour observer l'effet (le
    # test se substituerait alors sa propre valeur au lieu de vérifier celle
    # du code, ce qui ne prouverait plus rien) — l'effet lui-même (un
    # `Content-Length` jamais honoré ne bloque pas indéfiniment) a été établi
    # par exécution avant ce lot (cf. docstring de `server.py`).
    # =======================================================================
    srv_direct, tmp_direct, _ = _importer_server_clone()
    try:
        check("test_handler_declare_un_timeout_socket_positif",
              isinstance(srv_direct.Handler.timeout, (int, float))
              and srv_direct.Handler.timeout > 0,
              "un Content-Length annoncé mais jamais honoré bloquerait un "
              "thread indéfiniment sans borne de timeout ; obtenu %r"
              % srv_direct.Handler.timeout)
    finally:
        shutil.rmtree(tmp_direct, ignore_errors=True)

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
