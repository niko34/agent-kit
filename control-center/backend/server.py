#!/usr/bin/env python3
"""Serveur du centre de contrôle — étape D : la première route d'écriture.

    python3 control-center/backend/server.py

## Ce qui a changé depuis l'étape C

L'étape C tirait sa garantie de l'ABSENCE de `do_POST` : la méthode n'existait
pas, `http.server` répondait 501 de lui-même. Cette étape ajoute `do_POST`,
donc cette garantie-là tombe — c'est le sujet de l'ADR qui accompagne ce lot.
Ce qui la remplace :

- une liste FERMÉE de routes d'écriture, `_ROUTES_ECRITURE` — tout chemin
  absent de cette liste reçoit 404 sans qu'aucune autre garde ne s'exécute ;
- un test d'introspection INVERSÉ (`test_server.py`) : il n'affirme plus
  qu'aucune méthode `do_*` d'écriture n'existe, mais que l'ENSEMBLE des
  méthodes `do_*` vaut exactement `{"do_GET", "do_POST"}`, et que l'ensemble
  des routes d'écriture vaut exactement `_ROUTES_ECRITURE` ;
- le jeton partagé (`jeton.py`) comme UNIQUE barrière d'authentification :
  sans lui, `do_POST` répond 403 à toute route d'écriture, quoi qu'on
  présente.

## Ce qui peut sortir du serveur, et ce qui ne peut pas

Trois familles de chemins, trois validations différentes, aucune arithmétique de
chemin improvisée :

- **fichiers statiques** : liste FERMÉE, calculée au démarrage depuis `web/`.
  Un nom qui n'y figure pas est refusé sans même toucher au disque ;
- **specs** : l'identifiant demandé doit correspondre EXACTEMENT à une spec
  découverte. On ne construit jamais un chemin à partir de la requête ;
- **diffs** : `vcs.chemin_sur()`, qui résout les liens symboliques et refuse
  tout ce qui sort du dépôt.

`transcript_path` est présent dans le journal d'événements et pointe **hors du
dépôt** vers la conversation entière. Il n'est servi par aucune route et
n'atteint jamais le navigateur : `_evenement_public()` filtre les champs.

## L'ordre des gardes sur `do_POST` (GATE P1, condition 1)

chemin ∈ `_ROUTES_ECRITURE` → jeton (en-tête, avec freinage des échecs) →
`Host` → `Content-Length` → lecture BORNÉE du corps → clé → plafond de
dépense → verrou d'écrivain → `Popen`. Tout code 4xx autre que 401 ou le 404
de route inconnue est rendu APRÈS le jeton : sinon un anonyme énumérerait les
clés de commande et l'état du verrou sans jamais s'authentifier.

Un corps non consommé (401, 411, 413, 400, 421, 429) ferme la connexion
(`close_connection = True`) : sur `HTTP/1.1` en keep-alive, un corps de requête
refusé mais non lu est réinterprété comme le DÉBUT de la requête suivante — une
contrebande de requête vérifiée par exécution sur ce module même avant ce lot.
"""

import ipaddress
import json
import os
import signal
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import agents as A  # noqa: E402
import config as C  # noqa: E402
import events as E  # noqa: E402
import jeton as J  # noqa: E402
import lanceur as L  # noqa: E402
import specs as S  # noqa: E402
import vcs as V  # noqa: E402
import verrou as VR  # noqa: E402

_RACINE_WEB = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "web")
_RACINE_VAR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "var")
_JOURNAL = os.path.join(_RACINE_VAR, "agent-events.jsonl")

# Types servis. Une extension absente d'ici n'est pas servie : la liste des
# fichiers ET celle des types doivent toutes deux accepter.
_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
}

# Champs d'un événement qu'on accepte d'envoyer au navigateur. Liste POSITIVE :
# un champ neuf apparu dans le journal ne sort pas tant qu'il n'est pas ajouté
# ici. `transcript_path` et `cwd` en sont volontairement absents — le premier
# désigne la conversation entière, hors du dépôt.
#
# ⚠️ `cle`, `pid_fils` et `resultat` sont les champs des événements de
# lancement (A8) : sans eux ici, un lancement journalisé resterait INVISIBLE
# au navigateur — c'est exactement le piège que cette liste positive fait
# courir à tout champ neuf (A8b). La sortie de la commande, elle, n'y figure
# JAMAIS (condition 10 du GATE P1) : seule sa tête (`command_head`, déjà
# présente) est journalisée.
_CHAMPS_PUBLICS = ("ts", "runtime", "session_id", "hook_event_name",
                   "agent_type", "agent_id", "tool", "command_head", "file", "failed",
                   "cle", "pid_fils", "resultat")

_INTERVALLE_SONDAGE = 2.0      # secondes entre deux comparaisons d'empreinte
_BATTEMENT = 20.0              # secondes sans changement avant un signe de vie

# Liste FERMÉE des routes d'écriture. C'est elle, et non plus l'absence de
# `do_POST`, qui porte la garantie structurelle depuis ce lot : un chemin
# absent d'ici reçoit 404 avant qu'aucune autre garde ne s'exécute.
_ROUTES_ECRITURE = ("/api/lancer", "/api/interrompre")

# Un corps de POST tient largement sous cette borne : {"cle": "..."} ne
# dépasse jamais quelques dizaines d'octets. Au-delà, 413 sans lire le reste.
_TAILLE_MAX_CORPS = 4096

# Freinage des échecs d'authentification (GATE P1, condition 6) : au-delà de
# ce nombre d'échecs sur la fenêtre, 429 SANS comparer le jeton présenté — un
# compteur qui continue de comparer sous charge reste une oracle de temps.
_FREINAGE_MAX_ECHECS = 20
_FREINAGE_FENETRE_S = 60.0

_PREFIXE_JETON = "Bearer "


def _evenement_public(evenement):
    return {c: evenement[c] for c in _CHAMPS_PUBLICS if c in evenement}


def _horodatage_ms():
    maintenant = time.time()
    return "%s.%03dZ" % (time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(maintenant)),
                          int((maintenant % 1) * 1000))


def _ecrire_evenement(chemin_journal, champs):
    """Ajoute UNE ligne JSON au journal, en un seul appel `write()`.

    Même discipline que `hooks/record-event.py` : descripteur ouvert en
    O_APPEND, écriture NON tamponnée en un seul appel système (l'atomicité de
    O_APPEND ne vaut que pour un unique write()), ligne bornée — une ligne qui
    dépasserait la borne est ABANDONNÉE plutôt que d'risquer de s'entrelacer
    avec celle d'une autre session.
    """
    evenement = {"ts": _horodatage_ms(), "runtime": "control-center"}
    evenement.update(champs)
    ligne = (json.dumps(evenement, ensure_ascii=False) + "\n").encode("utf-8")
    if len(ligne) > 4096:
        return
    try:
        os.makedirs(os.path.dirname(chemin_journal), exist_ok=True)
        fd = os.open(chemin_journal, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
        try:
            os.write(fd, ligne)
        finally:
            os.close(fd)
    except OSError:
        pass


def _hote_valide(valeur):
    """Vrai si l'en-tête `Host` est un littéral IP ou `localhost` — jamais un
    nom quelconque (GATE P1, condition 5 ; A9).

    Un nom DNS arbitraire laisserait une résolution intervenir entre la
    vérification et l'usage (rebinding) ou confondrait un hôte virtuel. Un
    littéral IP ou `localhost` ne laisse aucune résolution s'intercaler.
    Validé sur TOUTES les routes : clôt aussi la lecture anonyme de
    `/api/spec` et `/api/diff`.
    """
    if not valeur or not isinstance(valeur, str):
        return False
    hote = valeur.strip()
    if not hote:
        return False
    if hote.startswith("["):
        fin = hote.find("]")
        if fin == -1:
            return False
        hote = hote[1:fin]
    elif hote.count(":") == 1:
        hote = hote.split(":", 1)[0]
    elif hote.count(":") > 1:
        return False  # IPv6 littéral sans crochets : ambigu avec un port, refusé
    if hote.lower() == "localhost":
        return True
    try:
        ipaddress.ip_address(hote)
        return True
    except ValueError:
        return False


def _raison_publique(jeton, config):
    """Motif de refus du jeton, DÉBARRASSÉ de son chemin.

    `/api/etat` est lisible sans authentification : le chemin du fichier de
    jeton — qui renseigne sur l'arborescence du serveur — ne doit jamais
    l'atteindre. `jeton.py` inclut ce chemin dans certains de ses messages ;
    on le remplace ici par une mention neutre, PARTOUT où il apparaît.
    """
    if jeton.actif():
        return None
    motif = jeton.refus or "raison inconnue"
    chemin = config.fichier_jeton()
    if chemin:
        motif = motif.replace(chemin, "<chemin masqué>")
    return motif


class Etat:
    """Assemble l'état courant. Aucun cache : les sources sont des fichiers.

    Mettre en cache introduirait une quatrième copie de la vérité, après les
    specs, git et le journal — exactement ce que l'architecture refuse. Le coût
    réel est un `git status` et une lecture de journal par sondage.
    """

    def __init__(self, config):
        self.config = config
        self.racine = config["_racine_projet"]
        self.journal = _JOURNAL

    def specs(self):
        return S.lister_depuis_config(self.config)

    def jeton(self):
        """Recharge le jeton À L'INSTANT de l'appel — jamais mis en cache,
        jamais figé au démarrage.

        C'est le MÊME test qui décide si les routes d'écriture s'exposent
        (`do_POST`) ET ce que `/api/etat` annonce (`ecriture_active`) : deux
        calculs séparés finiraient par diverger, exactement le défaut que ce
        module existe pour ne plus reproduire (`config.py`, tetes_de_commande).
        """
        return J.charger(self.config.fichier_jeton(), self.racine)

    def instantane(self):
        evenements = E.lire_journal(self.journal)
        workflows = E.reconstruire(
            evenements, self.config.tetes_de_commande(), self.config.agents_ouvrants())
        specs = self.specs()
        colonnes = [{"repertoire": r, "classe": c, "libelle": l}
                    for r, c, l in self.config.colonnes()]
        agents = A.lister_depuis_config(self.config)
        jeton = self.jeton()

        # Agent actif = celui d'un passage non terminé, dans un workflow sans fin
        # observée. On ne dit JAMAIS qu'un agent est actif sur la foi d'un
        # passage ouvert dans une session close.
        #
        # ⚠️ Restreint au DERNIER segment de chaque session : déclarer un agent
        # actif est une affirmation sur le présent, jamais sur un cycle antérieur
        # déjà clos par un agent ouvrant. Sans cette restriction, un passage
        # resté ouvert dans un vieux segment (fermeture perdue, cf. l'appariement
        # à cheval sur une frontière) ressusciterait un agent qu'on ne peut plus
        # affirmer actif.
        dernier_segment_par_session = {}
        for workflow in workflows:
            dernier_segment_par_session[workflow["session_id"]] = workflow
        actifs = {}
        for workflow in dernier_segment_par_session.values():
            if not workflow["fin_observee_absente"]:
                continue
            for passage in workflow["passages"]:
                if not passage["termine"]:
                    actifs[passage["agent"]] = workflow["workflow_id"]

        return {
            "projet": self.config.section("projet").get("nom"),
            "config_lue": self.config["_fichier_lu"],
            "colonnes": colonnes,
            "specs": specs,
            "divergences": sum(1 for s in specs if s["divergence"]),
            "agents": [dict(a, actif_sur=actifs.get(a["nom"])) for a in agents],
            "workflows": workflows[-self.config.workflows_affiches():],
            "evenements": [_evenement_public(e) for e in evenements[-60:]],
            "git": {
                "depot": V.est_un_depot(self.racine),
                "branche": V.branche(self.racine),
                "touches": V.etat(self.racine),
                "commits": V.journal(self.racine, 8),
            },
            "commandes_declarees": sorted(self.config.section("commandes")),
            "garde_fous": self.config.section("garde_fous"),
            # Champ POSITIF et UNIQUE : calculé par le MÊME test que celui qui
            # conditionne `do_POST`, jamais déduit ailleurs (ni de la seule
            # présence de `fichier_jeton`, ni d'une constante, ni de
            # `commandes_declarees` non vide — des commandes peuvent être
            # déclarées alors que l'écriture est inactive). L'interface lit ce
            # champ à chaque endroit où l'état d'écriture s'affiche ; elle ne
            # refait jamais sa propre déduction.
            "ecriture_active": jeton.actif(),
            "ecriture_raison": _raison_publique(jeton, self.config),
            "horodatage": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

    def empreinte(self):
        """Empreinte bon marché de l'état. Change ⇒ l'interface se rafraîchit.

        On ne compare PAS l'instantané complet : il contient un horodatage, donc
        il changerait à chaque sondage et l'interface se rafraîchirait en
        permanence pour rien.
        """
        morceaux = []
        try:
            stat = os.stat(self.journal)
            morceaux.append("j%d" % stat.st_size)
        except OSError:
            morceaux.append("j-")
        ok, sortie = V._git(self.racine, "status", "--porcelain")
        morceaux.append("g%d" % (hash(sortie) if ok else 0))
        for repertoire, _, _ in self.config.colonnes():
            dossier = os.path.join(self.racine,
                                   self.config.section("specs").get("racine", ""), repertoire)
            try:
                morceaux.append("%s:%d" % (repertoire, len(os.listdir(dossier))))
            except OSError:
                morceaux.append("%s:-" % repertoire)
        return "|".join(morceaux)


def _fichiers_servables():
    """Liste FERMÉE des fichiers statiques, calculée au démarrage.

    Un nom absent d'ici est refusé sans que le disque soit touché. Aucun chemin
    n'est construit à partir de la requête.
    """
    servables = {}
    if not os.path.isdir(_RACINE_WEB):
        return servables
    for nom in os.listdir(_RACINE_WEB):
        extension = os.path.splitext(nom)[1].lower()
        chemin = os.path.join(_RACINE_WEB, nom)
        if extension in _TYPES and os.path.isfile(chemin):
            servables[nom] = (chemin, _TYPES[extension])
    return servables


class Ecriture:
    """État en mémoire du côté écriture : verrous, lancements, freinage.

    `verrou.py` protège « au plus un détenteur par FICHIER » ; c'est à
    l'appelant de décider combien de fichiers instancier pour
    `[garde_fous].ecrivains_simultanes`. Ici : un `Verrou` par écrivain
    autorisé, sur des chemins distincts (`ecrivain-0.lock`, `ecrivain-1.lock`,
    …).

    ⚠️ L'API HTTP, elle, n'adresse qu'UN lancement « courant » : ni
    `/api/lancement` ni `/api/interrompre` ne prennent d'identifiant. Avec la
    valeur par défaut (`ecrivains_simultanes = 1`), c'est exactement le
    lancement en cours. Une configuration > 1 resterait correcte côté verrou
    (au plus N écritures concurrentes, chacune isolée par son propre fichier),
    mais seul le DERNIER lancement resterait observable par cette API — limite
    assumée de ce lot, pas une extension prévue ici.
    """

    def __init__(self, config):
        n = config.ecrivains_simultanes()
        self.verrous = [
            VR.Verrou(chemin=os.path.join(_RACINE_VAR, "ecrivain-%d.lock" % i))
            for i in range(n)
        ]
        self._verrou_liste = threading.Lock()
        self.lancements = {}   # index de verrou -> lanceur.Lancement
        self.courant = None    # index du dernier lancement exposé par l'API

        self._verrou_freinage = threading.Lock()
        self._echecs = []      # horodatages monotoniques des 401 récents

    # -- freinage des échecs d'authentification ------------------------------
    def frein_actif(self):
        maintenant = time.monotonic()
        with self._verrou_freinage:
            while self._echecs and maintenant - self._echecs[0] > _FREINAGE_FENETRE_S:
                self._echecs.pop(0)
            return len(self._echecs) >= _FREINAGE_MAX_ECHECS

    def enregistrer_echec(self):
        with self._verrou_freinage:
            self._echecs.append(time.monotonic())

    # -- lancement ------------------------------------------------------------
    def lancer(self, cle, argv, cwd, journal):
        """Spawn puis verrouille. Rend (Lancement, None) ou (None, raison).

        ⚠️ L'ORDRE (Popen puis verrou) est déterminé par une contrainte du
        verrou lui-même : sa méta porte `pid_fils` pour détecter un ORPHELIN
        après un crash serveur (`verrou.py`), et ce pid ne peut être connu
        qu'une fois le processus lancé. On accepte donc une fenêtre minime où
        le fils existe avant que le verrou ne soit confirmé ; s'il ne peut pas
        être pris, le fils est tué IMMÉDIATEMENT (`lanceur.tuer_immediatement`)
        avant d'avoir eu la moindre chance de produire un effet observable.
        Le cas « clé inconnue » — seul cas pour lequel A5 exige zéro
        processus créé — est écarté PLUS TÔT, avant tout appel à `lancer()`.

        ⚠️ `lancement.demarrer_lecture()` n'est appelée qu'une fois
        `lancement.verrou` définitivement fixé (assigné, ou délibérément
        laissé à `None` pour la course perdue) — jamais avant : démarrer le
        thread de lecture plus tôt rouvre la fenêtre où `_sur_fin` peut voir
        un `None` transitoire et perdre le verrou pour de bon (constaté par
        exécution).

        ⚠️ `verrou.acquerir()` peut lever `OSError` pour une raison AUTRE
        qu'un verrou déjà pris (`ENOSPC`, `EROFS`… déjà remontée par
        `acquerir()` elle-même, cf. `verrou.py`). Sans le `finally`
        ci-dessous, cette exception traverserait `lancer()` avant que le
        fils n'ait été confié au thread de lecture ou tué : orphelin non
        journalisé, et sans méta de verrou écrite pour ce lancement —
        `Verrou._raison_orphelin()` (le motif nommé « fils orphelin » d'un
        409 sur une tentative ultérieure) ne peut donc rien détecter ici,
        faute de méta à lire. Le `finally` rejoue exactement le chemin de la
        course perdue (`demarrer_lecture` puis `tuer_immediatement`) dès lors
        que `lancement.verrou` est resté `None` — que ce soit par défaite
        normale de la course ou par exception —, puis laisse l'exception
        (s'il y en a une) continuer de se propager telle quelle.

        ⚠️ Cas voisin, distinct de celui-ci : si `demarrer_lecture()`
        elle-même lève (ex. épuisement de threads du système) alors que le
        verrou VIENT d'être acquis (`lancement.verrou` déjà assigné), le
        `finally` ci-dessous ne fait RIEN — sa condition ne voit que
        `lancement.verrou is None`. C'est le `try/except` autour de
        `demarrer_lecture()`, à l'intérieur de la boucle, qui couvre ce
        chemin-là : il rend explicitement le verrou et tue le fils avant de
        laisser l'exception se propager, sans repasser par
        `demarrer_lecture()` (un `Thread` ne se démarre qu'une fois).
        """
        try:
            lancement = L.Lancement(cle, argv, cwd,
                                     sur_fin=lambda l: self._sur_fin(l, journal))
        except OSError as erreur:
            return None, "impossible de lancer la commande : %s" % type(erreur).__name__

        # Bascule à `False` dès que `demarrer_lecture()` est TENTÉE (pas
        # seulement réussie) : c'est ce qui distingue, pour le `finally`
        # ci-dessous, « jamais tentée » (course perdue, ou `acquerir()` qui
        # lève avant tout `ok=True` — chemins inchangés) de « tentée mais en
        # échec » (nouveau chemin, traité par le `try/except` interne, qui ne
        # doit PAS être rejoué ici : un `Thread` ne se démarre qu'une fois).
        lecture_jamais_demarree = True
        try:
            with self._verrou_liste:
                raison = "un écrivain occupe déjà la place"
                for index, verrou in enumerate(self.verrous):
                    ok, motif = verrou.acquerir(cle, pid_fils=lancement.pid)
                    if ok:
                        lancement.verrou = verrou
                        lecture_jamais_demarree = False
                        try:
                            lancement.demarrer_lecture()
                        except Exception:
                            # Le verrou est pris mais le thread de lecture
                            # n'a jamais démarré : plus personne ne le
                            # rendra (`_sur_fin` ne sera jamais appelé) ni ne
                            # récoltera le fils. On répare ICI ; le `finally`
                            # générique plus bas ne refera rien de plus,
                            # `lecture_jamais_demarree` étant déjà à `False`.
                            verrou.liberer()
                            lancement.verrou = None
                            L.tuer_immediatement(lancement.pid)
                            raise
                        self.lancements[index] = lancement
                        self.courant = index
                        return lancement, None
                    raison = motif
        finally:
            if lecture_jamais_demarree:
                lancement.demarrer_lecture()
                L.tuer_immediatement(lancement.pid)
        return None, raison

    def _sur_fin(self, lancement, journal):
        """Rappel du thread de lecture : rend le verrou, journalise la fin.

        Appelé que le processus se soit terminé seul, ait échoué, ou ait été
        interrompu — c'est la SEULE voie de journalisation de la fin d'un
        lancement (A7 : l'interruption est journalisée par ce même chemin).

        ⚠️ Un `Lancement` qui n'a JAMAIS obtenu de verrou (course perdue face à
        un autre écrivain, tué immédiatement par `lanceur.tuer_immediatement`)
        n'a pas non plus de `LancementDemande` journalisé — `_lancer()` ne
        l'écrit qu'APRÈS acquisition. Lui trouver une fin ici produirait un
        `LancementTermine` sans début, orphelin dans le journal. On ne
        journalise donc QUE le lancement qui a réellement tenu la place.
        """
        if lancement.verrou is None:
            return
        lancement.verrou.liberer()
        _ecrire_evenement(journal, {
            "hook_event_name": "LancementTermine",
            "cle": lancement.cle,
            "pid_fils": lancement.pid,
            "resultat": lancement.etat,
        })

    def lancement_courant(self):
        if self.courant is None:
            return None
        return self.lancements.get(self.courant)

    def interrompre_courant(self):
        lancement = self.lancement_courant()
        if lancement is None:
            return False
        return lancement.interrompre()

    def arreter_tout(self):
        """Appelé à l'arrêt du serveur (A7) : le fils ne doit pas survivre
        seul, orphelin, au processus qui l'a lancé."""
        for lancement in list(self.lancements.values()):
            if lancement.toujours_en_cours():
                lancement.interrompre()


class Handler(BaseHTTPRequestHandler):
    """`do_GET` et `do_POST` — RIEN d'autre. `do_POST` ne route que les deux
    chemins de `_ROUTES_ECRITURE`, gardés par le jeton partagé."""

    protocol_version = "HTTP/1.1"
    server_version = "control-center"
    sys_version = ""

    # Délai de socket (GATE P1, condition 3). `BaseHTTPRequestHandler.timeout`
    # vaut `None` par défaut : un `Content-Length` annoncé mais jamais honoré
    # bloquerait un thread indéfiniment — vérifié par exécution sur ce module
    # avant ce lot.
    timeout = 30

    _verrou_lazy = threading.Lock()

    # -- utilitaires de réponse ---------------------------------------------
    def _envoyer(self, code, contenu, type_mime, cache=False):
        if isinstance(contenu, str):
            contenu = contenu.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", type_mime)
        self.send_header("Content-Length", str(len(contenu)))
        self.send_header("Cache-Control", "public, max-age=60" if cache else "no-store")
        # L'interface ne charge rien depuis l'extérieur : la politique le dit et
        # le navigateur l'applique. Pas de CDN, pas de police distante.
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; style-src 'self' 'unsafe-inline'; "
                         "img-src 'self' data:; connect-src 'self'")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        try:
            self.wfile.write(contenu)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _json(self, donnees, code=200):
        self._envoyer(code, json.dumps(donnees, ensure_ascii=False), "application/json; charset=utf-8")

    def _erreur(self, code, message):
        self._json({"erreur": message}, code)

    def _ecriture(self):
        """État d'écriture, initialisé au premier accès si le serveur ne l'a
        pas déjà fait dans `demarrer()` — permet à un harnais de test de
        construire un serveur minimal sans connaître ce détail. Verrouillé :
        deux requêtes concurrentes ne doivent jamais fabriquer deux états
        d'écriture séparés, ce qui romprait le suivi du lancement courant."""
        ecriture = getattr(self.server, "_ecriture", None)
        if ecriture is not None:
            return ecriture
        with Handler._verrou_lazy:
            ecriture = getattr(self.server, "_ecriture", None)
            if ecriture is None:
                ecriture = Ecriture(self.server.etat.config)
                self.server._ecriture = ecriture
            return ecriture

    def _jeton_presente(self):
        """Valeur du jeton présenté dans l'en-tête `Authorization: Bearer …`,
        ou chaîne vide si absent ou mal formé."""
        fourni = self.headers.get("Authorization", "")
        if not fourni.startswith(_PREFIXE_JETON):
            return ""
        return fourni[len(_PREFIXE_JETON):]

    # -- routage GET -----------------------------------------------------------
    def do_GET(self):  # noqa: N802 (nom imposé par http.server)
        try:
            # Host validé sur TOUTES les routes (GATE P1, condition 5 ; A9) :
            # clôt aussi la lecture anonyme de /api/spec et /api/diff.
            if not _hote_valide(self.headers.get("Host")):
                return self._erreur(421, "hôte non reconnu")
            analyse = urlparse(self.path)
            chemin = analyse.path
            parametres = parse_qs(analyse.query)
            if chemin == "/":
                return self._statique("index.html")
            if chemin == "/api/etat":
                return self._json(self.server.etat.instantane())
            if chemin == "/api/spec":
                return self._spec(parametres)
            if chemin == "/api/diff":
                return self._diff(parametres)
            if chemin == "/api/flux":
                return self._flux()
            if chemin == "/api/lancement":
                return self._lancement(parametres)
            if chemin.count("/") == 1:
                return self._statique(chemin[1:])
            return self._erreur(404, "route inconnue")
        except (BrokenPipeError, ConnectionResetError):
            return None
        except Exception as erreur:  # le serveur ne meurt pas d'une requête
            return self._erreur(500, "erreur interne : %s" % type(erreur).__name__)

    # -- routage POST (GATE P1, condition 1 : l'ordre des gardes ci-dessous) --
    def do_POST(self):  # noqa: N802
        try:
            analyse = urlparse(self.path)
            chemin = analyse.path

            # 1) chemin ∈ liste FERMÉE, sinon 404 — avant toute autre garde :
            # un anonyme ne doit rien apprendre de plus qu'« inconnu ».
            if chemin not in _ROUTES_ECRITURE:
                self.close_connection = True
                return self._erreur(404, "route inconnue")

            ecriture = self._ecriture()
            jeton = self.server.etat.jeton()

            # 2) jeton — 403 si l'écriture n'est pas activée DU TOUT (état
            # statique du serveur, ne dépend d'aucun secret présenté) ; 429 si
            # le freinage est déclenché, SANS comparer ; 401 sinon, avec un
            # corps IDENTIQUE que le jeton soit absent ou faux.
            if not jeton.actif():
                self.close_connection = True
                return self._erreur(403, "routes d'écriture non activées")
            if ecriture.frein_actif():
                self.close_connection = True
                return self._erreur(429, "trop de tentatives récentes")
            if not jeton.compare(self._jeton_presente()):
                ecriture.enregistrer_echec()
                self.close_connection = True
                return self._erreur(401, "authentification requise")

            # 3) Host — après le jeton (condition 1) : un 421 ne doit rien
            # apprendre à qui ne détient pas déjà le jeton.
            if not _hote_valide(self.headers.get("Host")):
                self.close_connection = True
                return self._erreur(421, "hôte non reconnu")

            # 4) Content-Length : présent, numérique, positif, borné — sinon
            # 411/400/413, corps NON CONSOMMÉ, connexion fermée (contrebande
            # de requête vérifiée par exécution sur ce module, sans jeton).
            if self.headers.get("Transfer-Encoding") is not None:
                self.close_connection = True
                return self._erreur(400, "Transfer-Encoding non supporté")
            brut_cl = self.headers.get("Content-Length")
            if brut_cl is None:
                self.close_connection = True
                return self._erreur(411, "Content-Length requis")
            try:
                taille = int(brut_cl)
            except ValueError:
                self.close_connection = True
                return self._erreur(400, "Content-Length invalide")
            if taille < 0:
                self.close_connection = True
                return self._erreur(400, "Content-Length invalide")
            if taille > _TAILLE_MAX_CORPS:
                self.close_connection = True
                return self._erreur(413, "corps trop volumineux (max %d octets)"
                                          % _TAILLE_MAX_CORPS)

            # 5) lecture BORNÉE du corps, exactement `taille` octets.
            corps = self.rfile.read(taille) if taille else b""
            if len(corps) != taille:
                self.close_connection = True
                return self._erreur(400, "corps tronqué")

            if chemin == "/api/interrompre":
                return self._interrompre()

            # -- /api/lancer : 6) clé -------------------------------------------
            try:
                donnees = json.loads(corps.decode("utf-8")) if corps else {}
            except (ValueError, UnicodeDecodeError):
                return self._erreur(400, "corps illisible")
            if not isinstance(donnees, dict):
                return self._erreur(400, "corps illisible")
            cle = donnees.get("cle")
            if not isinstance(cle, str) or not cle:
                return self._erreur(400, "clé manquante")

            return self._lancer(cle)
        except (BrokenPipeError, ConnectionResetError):
            return None
        except Exception as erreur:
            self.close_connection = True
            return self._erreur(500, "erreur interne : %s" % type(erreur).__name__)

    # -- routes GET ---------------------------------------------------------
    def _statique(self, nom):
        entree = self.server.servables.get(nom)
        if entree is None:
            return self._erreur(404, "fichier inconnu")
        chemin, type_mime = entree
        try:
            with open(chemin, "rb") as fichier:
                contenu = fichier.read()
        except OSError:
            return self._erreur(404, "fichier illisible")
        return self._envoyer(200, contenu, type_mime)

    def _spec(self, parametres):
        """Contenu d'une spec.

        L'identifiant demandé doit correspondre EXACTEMENT à une spec découverte.
        Aucun chemin n'est construit à partir de la requête : on cherche dans la
        liste, et on sert le fichier qu'elle désigne.
        """
        demande = (parametres.get("id") or [""])[0]
        if not demande:
            return self._erreur(400, "identifiant manquant")
        reglages = self.server.etat.config.section("specs")
        racine = os.path.join(self.server.etat.racine, reglages.get("racine", "specs/features"))
        for spec in self.server.etat.specs():
            if spec["id"] != demande:
                continue
            chemin = os.path.join(racine, spec["colonne"], spec["id"] + ".md")
            try:
                with open(chemin, encoding="utf-8") as fichier:
                    contenu = fichier.read()
            except (OSError, UnicodeDecodeError):
                return self._erreur(404, "spec illisible")
            return self._json(dict(spec, contenu=contenu[:400_000]))
        return self._erreur(404, "spec inconnue")

    def _diff(self, parametres):
        demande = (parametres.get("chemin") or [""])[0]
        texte, tronque = V.diff(self.server.etat.racine, demande or None)
        if texte is None:
            return self._erreur(404, "diff indisponible pour ce chemin")
        return self._json({"chemin": demande, "diff": texte, "tronque": tronque})

    def _flux(self):
        """Server-Sent Events : un signal quand l'état change.

        On envoie un SIGNAL, pas l'état : le navigateur redemande `/api/etat`. Un
        état poussé et un état demandé pourraient sinon diverger, et il faudrait
        décider lequel fait foi.
        """
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()
        precedente = None
        dernier_signe = time.monotonic()
        try:
            while True:
                empreinte = self.server.etat.empreinte()
                if empreinte != precedente:
                    precedente = empreinte
                    self.wfile.write(b"event: maj\ndata: {}\n\n")
                    self.wfile.flush()
                    dernier_signe = time.monotonic()
                elif time.monotonic() - dernier_signe > _BATTEMENT:
                    # Un commentaire SSE : garde la connexion vivante à travers
                    # les proxys sans déclencher de rafraîchissement côté client.
                    self.wfile.write(b": battement\n\n")
                    self.wfile.flush()
                    dernier_signe = time.monotonic()
                time.sleep(_INTERVALLE_SONDAGE)
        except (BrokenPipeError, ConnectionResetError, OSError):
            return None

    def _lancement(self, parametres):
        """GET /api/lancement?depuis=<curseur> — sortie du lancement courant.

        PAS de SSE pour la sortie : `EventSource` ne pose aucun en-tête, le
        jeton irait en query string (donc dans les journaux d'accès, les
        historiques de proxy). Le jeton est ici, comme sur `/api/lancer`, dans
        l'en-tête `Authorization`.
        """
        jeton = self.server.etat.jeton()
        if not jeton.actif():
            return self._erreur(403, "routes d'écriture non activées")
        ecriture = self._ecriture()
        if ecriture.frein_actif():
            return self._erreur(429, "trop de tentatives récentes")
        if not jeton.compare(self._jeton_presente()):
            ecriture.enregistrer_echec()
            return self._erreur(401, "authentification requise")
        lancement = ecriture.lancement_courant()
        if lancement is None:
            return self._erreur(404, "aucun lancement")
        brut = (parametres.get("depuis") or ["0"])[0]
        try:
            curseur = int(brut)
        except ValueError:
            return self._erreur(400, "curseur invalide")
        if curseur < 0:
            return self._erreur(400, "curseur invalide")
        return self._json(lancement.sortie_depuis(curseur))

    # -- routes POST ----------------------------------------------------------
    def _lancer(self, cle):
        config = self.server.etat.config
        argv = config.commande(cle)
        if argv is None:
            # ⚠️ SEUL cas pour lequel A5 exige explicitement zéro effet : la clé
            # est écartée AVANT tout appel à `Ecriture.lancer()`, donc avant tout
            # `Popen`.
            return self._erreur(404, "clé de commande inconnue")
        if not config.budget_transmissible(cle):
            # Défaut sûr (condition 7, config.py) : une commande absente de
            # `[garde_fous].commandes_avec_budget` ne peut pas recevoir le
            # plafond — un clic ne doit jamais déclencher une dépense non
            # bornée, donc le lancement est REFUSÉ plutôt que silencieusement
            # lancé sans plafond.
            return self._erreur(503, "plafond de dépense non transmissible pour cette commande")
        argv = argv + ["--max-budget-usd", str(config.budget_max_usd())]

        ecriture = self._ecriture()
        lancement, raison = ecriture.lancer(cle, argv, self.server.etat.racine,
                                             self.server.etat.journal)
        if lancement is None:
            return self._erreur(409, raison or "un écrivain occupe déjà la place")

        _ecrire_evenement(self.server.etat.journal, {
            "hook_event_name": "LancementDemande",
            "cle": cle,
            "command_head": " ".join(argv[:2]),
            "pid_fils": lancement.pid,
        })
        return self._json({"lance": True, "cle": cle, "pid": lancement.pid}, 202)

    def _interrompre(self):
        ecriture = self._ecriture()
        lancement = ecriture.lancement_courant()
        if lancement is None or not lancement.toujours_en_cours():
            return self._erreur(404, "aucun lancement en cours")
        ecriture.interrompre_courant()
        return self._json({"interrompu": True}, 202)

    def log_message(self, format, *args):
        # Le journal par défaut écrit une ligne par requête, flux SSE compris.
        # On garde les erreurs, on tait le reste.
        if args and str(args[1] if len(args) > 1 else "").startswith(("4", "5")):
            sys.stderr.write("%s %s\n" % (self.address_string(), format % args))


def demarrer(config=None):
    config = config or C.charger()
    reglages = config.section("serveur")
    hote = reglages.get("hote", "127.0.0.1")
    port = int(reglages.get("port", 8787))

    serveur = ThreadingHTTPServer((hote, port), Handler)
    serveur.daemon_threads = True
    serveur.etat = Etat(config)
    serveur.servables = _fichiers_servables()
    serveur._ecriture = Ecriture(config)

    def _arret_propre(*_args):
        serveur._ecriture.arreter_tout()

    # A7 : un fils ne survit pas seul à la mort du serveur. `start_new_session`
    # (lanceur.py) lui donne un groupe propre ; on essaie de le terminer
    # PROPREMENT (SIGTERM puis SIGKILL après délai) avant que le serveur ne
    # disparaisse — sur SIGKILL du serveur lui-même, rien de tout cela ne
    # s'exécute, et c'est alors la méta du verrou (pid_fils + starttime) qui
    # détecte l'orphelin au prochain démarrage (`verrou.py`).
    import atexit
    atexit.register(_arret_propre)
    try:
        signal.signal(signal.SIGTERM, lambda signum, frame: (_arret_propre(), sys.exit(0)))
    except (ValueError, OSError):
        pass  # hors thread principal, ou plateforme sans ce signal : tant pis

    jeton_demarrage = serveur.etat.jeton()
    print("Centre de contrôle")
    print("  projet   : %s" % config.section("projet").get("nom"))
    print("  écoute   : http://%s:%d" % (hote, port))
    print("  dépôt    : %s" % config["_racine_projet"])
    print("  statique : %s" % (", ".join(sorted(serveur.servables)) or "aucun fichier web/"))
    if jeton_demarrage.actif():
        print("  écriture : ACTIVE — %s" % ", ".join(_ROUTES_ECRITURE))
    else:
        print("  écriture : désactivée — %s" % jeton_demarrage.refus)
        print("             le tableau de bord reste utilisable en LECTURE SEULE")
    if hote not in ("127.0.0.1", "localhost"):
        if jeton_demarrage.actif():
            print("  ⚠️  ouvert au réseau local, ET l'écriture est ACTIVE : le jeton")
            print("      partagé est l'unique barrière entre le réseau et l'exécution")
            print("      de commandes locales.")
        else:
            print("  ⚠️  ouvert au réseau local. L'écriture reste désactivée : aucune")
            print("      route ne peut lancer de commande tant qu'aucun jeton valide")
            print("      n'est déclaré (`[serveur].fichier_jeton`).")
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print("\narrêt")
        _arret_propre()
    finally:
        serveur.server_close()


if __name__ == "__main__":
    demarrer()
