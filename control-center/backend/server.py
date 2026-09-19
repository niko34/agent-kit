#!/usr/bin/env python3
"""Serveur du centre de contrôle — étape E : quatre routes d'écriture.

    python3 control-center/backend/server.py

## Ce qui a changé depuis l'étape C

L'étape C tirait sa garantie de l'ABSENCE de `do_POST` : la méthode n'existait
pas, `http.server` répondait 501 de lui-même. L'étape D a ajouté `do_POST`,
donc cette garantie-là est tombée — c'est le sujet de l'ADR qui accompagne ce
lot. Ce qui la remplace :

- une liste FERMÉE de routes d'écriture, `_ROUTES_ECRITURE` — tout chemin
  absent de cette liste reçoit 404 sans qu'aucune autre garde ne s'exécute ;
- un test d'introspection INVERSÉ (`test_server.py`) : il n'affirme plus
  qu'aucune méthode `do_*` d'écriture n'existe, mais que l'ENSEMBLE des
  méthodes `do_*` vaut exactement `{"do_GET", "do_POST"}`, et que l'ensemble
  des routes d'écriture vaut exactement `_ROUTES_ECRITURE` ;
- le jeton partagé (`jeton.py`) comme UNIQUE barrière d'authentification :
  sans lui, `do_POST` répond 403 à toute route d'écriture, quoi qu'on
  présente.

## Ce qui a changé depuis l'étape D (feature-008)

`_ROUTES_ECRITURE` est passée de deux à QUATRE chemins :
`/api/spec/brouillon` (fabrique un brouillon de spec, N'ÉCRIT RIEN) et
`/api/spec/ecrire` (écrit le brouillon relu dans `specs/features/todo/`) —
voir `redaction_spec.py`. `/api/spec/brouillon` figure dans cette liste bien
qu'il n'écrive rien : c'est ELLE, et non un attribut par route, qui gouverne
le ROUTAGE entier de `do_POST` — un chemin absent reçoit 404 avant toute
autre garde, donc l'exclure l'aurait rendu inatteignable. Il traverse en
conséquence les mêmes gardes d'authentification que les routes qui écrivent
réellement (voir `_TAILLES_MAX_CORPS` ci-dessous pour ses bornes de corps,
distinctes de celles de `/api/lancer`/`/api/interrompre`).

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

chemin ∈ `_ROUTES_ECRITURE` → jeton OU origine (voir ci-dessous) → `Host` →
`Content-Length` → lecture BORNÉE du corps → clé → plafond de dépense →
verrou d'écrivain → `Popen`. Tout code 4xx autre que 401/403/400 (garde de
rattachement) ou le 404 de route inconnue est rendu APRÈS cette garde : sinon
un anonyme énumérerait les clés de commande et l'état du verrou sans jamais
s'authentifier.

Un corps non consommé (401, 411, 413, 400, 421, 429) ferme la connexion
(`close_connection = True`) : sur `HTTP/1.1` en keep-alive, un corps de requête
refusé mais non lu est réinterprété comme le DÉBUT de la requête suivante — une
contrebande de requête vérifiée par exécution sur ce module même avant ce lot.

## ADR-0020 : le jeton dépend du DÉPLOIEMENT, pas de la route (bug-012)

La décision « cette requête doit-elle présenter un jeton ? » se prend PAR
REQUÊTE, sur `client_address[0]` (`_locale()`) — jamais sur `[serveur].hote` :
`hote = "0.0.0.0"` sert indifféremment la boucle locale et le réseau sur le
MÊME socket, et une requête locale reste locale quel que soit `hote`.

- **Locale, aucun `fichier_jeton` configuré** : le jeton est INUTILE (ADR-0020)
  — qui atteint le port a déjà un shell sur la machine. Lecture ET écriture
  fonctionnent sans secret. L'écriture perd alors la protection que le jeton
  apportait contre un site hostile ouvert dans le navigateur du développeur
  (CSRF) : deux gardes INDÉPENDANTES du jeton la remplacent sur `do_POST`,
  GATE P1 conditions 1 et 2 — `Origin`/`Sec-Fetch-Site` et
  `Content-Type: application/json` (force un préflight que ce serveur, sans
  `do_OPTIONS`, refuse toujours).
- **Un `fichier_jeton` CONFIGURÉ reste vérifié, locale ou distante** — c'est
  ce qui rend la garde distante effective derrière un intermédiaire LOCAL
  (reverse proxy, TLS, `socat`, userland-proxy Docker : GATE P1 condition 5)
  qui fait arriver le réseau en boucle locale.
- **Distante, aucun `fichier_jeton` configuré** : refusée SANS exception —
  lecture (`/api/*` en `do_GET`) et écriture, `401` uniforme, rien à comparer
  contre.

Le freinage des échecs (`Ecriture.frein_actif`) ne compte, sur les routes de
LECTURE, que les jetons PRÉSENTS ET FAUX — jamais absents (GATE P1 condition
3) : l'`EventSource` d'un opérateur légitime se reconnecte automatiquement
sans pouvoir poser d'en-tête, et compter ses échecs verrouillerait son propre
tableau de bord.

`/api/lancement` ne revérifie RIEN par lui-même : c'est un chemin `/api/*`
comme les autres, déjà gardé par la règle ci-dessus dans `do_GET`. `/api/etat`
expose `ecriture_active`/`ecriture_raison` (capacité d'ÉCRITURE de CE
demandeur, `Handler._peut_ecrire`, jamais déduite de la seule présence d'un
`fichier_jeton`) et `jeton_requis` (CE déploiement exige-t-il un jeton pour CE
demandeur, indépendamment du fait que la requête en cours en porte un — sert
au frontend à choisir entre `EventSource`, qui ne pose aucun en-tête, et un
sondage qui le pose explicitement).
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
# `hooks/` en APPEND, jamais en `insert(0)` : `backend/` doit rester résolu en
# premier, `redaction_commande` ne doit jamais passer devant un module du
# backend qui porterait accidentellement le même nom (`bug-014`, D4).
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "hooks"))
import agents as A  # noqa: E402
import config as C  # noqa: E402
import events as E  # noqa: E402
import jeton as J  # noqa: E402
import lanceur as L  # noqa: E402
import redaction_commande as RC  # noqa: E402
import redaction_spec as RS  # noqa: E402
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
#
# `/api/spec/brouillon` y figure ALORS QU'IL N'ÉCRIT RIEN sur disque
# (feature-008) : c'est cette même liste qui gouverne le ROUTAGE de
# `do_POST` dans son ensemble — un chemin absent reçoit 404 avant toute autre
# garde — donc `/api/spec/brouillon` y serait sinon INATTEIGNABLE. Il traverse
# en conséquence exactement les mêmes gardes d'authentification que les
# routes qui écrivent réellement (jeton/origine, Host, Content-Length) :
# c'est un choix délibéré, pas un effet de bord — aucune prévisualisation de
# spec ne doit être possible sans la même autorisation qu'une écriture.
_ROUTES_ECRITURE = ("/api/lancer", "/api/interrompre",
                     "/api/spec/brouillon", "/api/spec/ecrire")

# Un corps de POST tient largement sous cette borne : {"cle": "..."} ne
# dépasse jamais quelques dizaines d'octets. Au-delà, 413 sans lire le reste.
# Reste le DÉFAUT inchangé pour toute route absente de `_TAILLES_MAX_CORPS`
# ci-dessous — en particulier `/api/lancer` et `/api/interrompre`, qui ne
# transportent jamais plus qu'une clé de commande.
_TAILLE_MAX_CORPS = 4096

# Bornes PAR ROUTE (feature-008) : un besoin en texte libre ne tient pas dans
# 4096 octets. `/api/spec/ecrire` (65536) reste 1,93× la plus grande spec
# mesurée dans ce dépôt (33 212 octets) — large marge pour un besoin en texte
# libre, jamais un chèque en blanc. `/api/spec/brouillon` (8192) n'a besoin
# que du titre et du texte, jamais du contenu déjà fabriqué.
_TAILLES_MAX_CORPS = {
    "/api/spec/brouillon": 8192,
    "/api/spec/ecrire": 65536,
}

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


def _locale(adresse_ip):
    """Vrai si `adresse_ip` (`client_address[0]`, une chaîne) est un littéral
    IP de la boucle locale — la décision qui gouverne le jeton (ADR-0020,
    bug-012) se prend PAR REQUÊTE, jamais sur `[serveur].hote` : `0.0.0.0` sert
    les deux catégories sur le même socket.

    Vérifié par exécution : `127.0.0.1`, `127.0.0.5`, `::1`,
    `::ffff:127.0.0.1` → True ; `192.168.1.55`, `0.0.0.0` → False. Une adresse
    imprononçable (ne devrait jamais arriver depuis `client_address`, mais on
    ne suppose rien) est traitée comme NON locale — défaut sûr : mieux vaut
    exiger un jeton à tort que l'omettre à tort.
    """
    try:
        return ipaddress.ip_address(adresse_ip).is_loopback
    except (ValueError, TypeError):
        return False


def _raison_publique(jeton, config):
    """Motif de refus du jeton, DÉBARRASSÉ de son chemin.

    `/api/etat` exige le jeton dès que la requête est distante ou qu'un
   jeton est déclaré (bug-012, ADR-0020) : le chemin du fichier de
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


def _jeton_configure(config):
    """Vrai si un `[serveur].fichier_jeton` est DÉCLARÉ dans la configuration
    — que ce jeton soit valide ou non (ADR-0020, régression mesurée pendant
    `bug-012`).

    C'est CETTE question, jamais `jeton.actif()`, qui doit décider si une
    requête est soumise à la garde de jeton. `jeton.actif()` répond à une
    question SUIVANTE — « ce jeton déclaré peut-il être comparé ? » — posée
    seulement une fois qu'on sait qu'un jeton est exigé. Les confondre a
    ouvert `bug-012` : un `fichier_jeton` déclaré mais en mode `0644`
    (`jeton.actif()` faux) retombait sur le régime « aucun jeton, ouvert en
    local » au lieu de fermer — la lecture ET l'écriture s'ouvraient alors à
    tout le réseau derrière un intermédiaire local. *Fail-closed* : une
    configuration cassée est le moment où il faut se méfier, pas celui où
    l'on baisse la garde.
    """
    return config.fichier_jeton() is not None


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

    def instantane(self, peut_ecrire=None, jeton_requis=None):
        """`peut_ecrire` et `jeton_requis` sont calculés PAR REQUÊTE par
        `do_GET` (`Handler._peut_ecrire`, bug-012, ADR-0020) — jamais déduits
        ici de la seule présence d'un `fichier_jeton`. `None` (tout appelant
        hors `do_GET` : tests directs sur `Etat`) retombe sur l'ancien test
        global, conservateur — un jeton configuré mais jamais confronté à un
        demandeur précis ne peut affirmer une capacité."""
        # Une SEULE lecture de l'horloge, partagée entre la requalification
        # `sans_cloture` (bug-013) et `horodatage` ci-dessous : deux appels
        # séparés à `time.gmtime()` pourraient diverger de quelques
        # millisecondes et rendre deux affirmations incohérentes sur le
        # « maintenant » de cette même réponse.
        maintenant = time.gmtime()
        evenements = E.lire_journal(self.journal)
        workflows = E.reconstruire(
            evenements, self.config.tetes_de_commande(), self.config.agents_ouvrants(),
            maintenant=maintenant, seuil_abandon_minutes=self.config.seuil_abandon_minutes())
        # Lus AVANT le découpage `workflows[-N:]` ci-dessous (feature-016,
        # item K) : `evenements_hors_session` est un ATTRIBUT de la liste
        # `_Workflows` (voir events.py), perdu dès qu'on la tranche — une
        # slice rend une liste ordinaire. Calculé aujourd'hui, jamais exposé :
        # la liste des cycles en accordéon l'affiche en pied de liste.
        evenements_hors_session = workflows.evenements_hors_session
        cycles_total = len(workflows)
        specs = self.specs()
        colonnes = [{"repertoire": r, "classe": c, "libelle": l}
                    for r, c, l in self.config.colonnes()]
        agents = A.lister_depuis_config(self.config)
        jeton = self.jeton()
        if peut_ecrire is None:
            peut_ecrire = jeton.actif()
        if jeton_requis is None:
            jeton_requis = jeton.actif()

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
        # ⚠️ `etat == ETAT_EN_COURS`, jamais `not passage["termine"]` seul
        # (bug-013) : un passage requalifié `sans_cloture` (agent tué par le
        # runtime, aucun événement depuis le seuil déclaré) n'est plus
        # compté actif — sinon le tableau de bord continuerait d'annoncer un
        # agent qu'il vient pourtant d'afficher comme abandonné.
        actifs = {}
        for workflow in dernier_segment_par_session.values():
            if not workflow["fin_observee_absente"]:
                continue
            for passage in workflow["passages"]:
                if passage["etat"] == E.ETAT_EN_COURS:
                    actifs[passage["agent"]] = workflow["workflow_id"]

        return {
            "projet": self.config.section("projet").get("nom"),
            "config_lue": self.config["_fichier_lu"],
            "colonnes": colonnes,
            "specs": specs,
            "divergences": sum(1 for s in specs if s["divergence"]),
            "agents": [dict(a, actif_sur=actifs.get(a["nom"])) for a in agents],
            "workflows": workflows[-self.config.workflows_affiches():],
            # Additifs (feature-016, item K) : le frontend en tolère
            # l'absence (backend plus ancien) — la légende de la liste de
            # cycles retombe alors sur le seul compte affiché.
            "cycles_total": cycles_total,
            "evenements_hors_session": evenements_hors_session,
            "evenements": [_evenement_public(e) for e in evenements[-60:]],
            "git": {
                "depot": V.est_un_depot(self.racine),
                "branche": V.branche(self.racine),
                "touches": V.etat(self.racine),
                "commits": V.journal(self.racine, 8),
            },
            "commandes_declarees": sorted(self.config.section("commandes")),
            "garde_fous": self.config.section("garde_fous"),
            # Champ POSITIF et UNIQUE : calculé PAR REQUÊTE, par le MÊME test
            # d'identité que celui qui conditionne `do_POST` (`_peut_ecrire`,
            # bug-012 correctif 2), jamais déduit de la seule présence d'un
            # `fichier_jeton` configuré — c'était le bug : en local sans jeton
            # configuré, l'écriture RÉUSSIT (ADR-0020) mais ce champ valait
            # `False` faute de test par demandeur. L'interface lit ce champ à
            # chaque endroit où l'état d'écriture s'affiche ; elle ne refait
            # jamais sa propre déduction.
            "ecriture_active": peut_ecrire,
            "ecriture_raison": None if peut_ecrire else _raison_publique(jeton, self.config),
            # Répond à une question DISTINCTE de `ecriture_active` (bug-012,
            # correctif 3) : « ce déploiement exige-t-il un jeton pour CE
            # demandeur ? », indépendamment du fait que la requête EN COURS en
            # porte un. `ecriture_active` peut valoir `True` alors qu'un jeton
            # est PORTÉ (en mémoire, via `fetch`) sur un déploiement qui
            # l'exige — un `EventSource` ultérieur, qui ne pose aucun en-tête,
            # échouera quand même. Le frontend s'en sert pour choisir entre
            # `EventSource` et un sondage qui pose l'en-tête lui-même.
            "jeton_requis": jeton_requis,
            "horodatage": time.strftime("%Y-%m-%dT%H:%M:%SZ", maintenant),
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
        # Un `test_*` (convention du dépôt entier : `test_app_bug012.js`…) est
        # un harnais, jamais un livrable du portail — il n'a rien à faire dans
        # une liste que `/`, distant compris, sert sans jeton (bug-012, revue
        # finale). L'exclusion vit ici, PAS dans `web/` : la liste servable
        # reste calculée d'un seul endroit, jamais par un nom de fichier
        # déplacé ou renommé.
        if nom.startswith("test_"):
            continue
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
    """`do_GET` et `do_POST` — RIEN d'autre. `do_POST` ne route que les
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
        # `frame-ancestors 'none'` (GATE P1 condition 6, bug-012) : sans elle,
        # un tableau de bord local sans jeton, cadré dans une page hostile,
        # lance une commande en un clic — établi absent avant ce correctif.
        self.send_header("Content-Security-Policy",
                         "default-src 'self'; style-src 'self' 'unsafe-inline'; "
                         "img-src 'self' data:; connect-src 'self'; "
                         "frame-ancestors 'none'")
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

    def _distante(self):
        """Vrai si CETTE requête n'arrive pas par la boucle locale — décision
        prise sur `client_address[0]` (bug-012), jamais sur `[serveur].hote`."""
        return not _locale(self.client_address[0])

    def _autorisation_lecture(self, jeton, distante):
        """Garde de lecture sur `/api/*` (GATE P1, bug-012, ADR-0020). Rend
        `None` si la requête est autorisée à poursuivre, sinon `(code,
        message)` à renvoyer tel quel.

        Appelée uniquement quand `distante` est vraie, ou quand un jeton est
        DÉCLARÉ (`_jeton_configure()`, valide ou non — bug-012, correctif 1)
        — c'est `do_GET` qui décide de l'appeler ; une requête locale sans
        aucun jeton déclaré ne l'atteint jamais (ADR-0020 : le jeton y est
        inutile, y compris en lecture).

        Le freinage ne compte que les jetons PRÉSENTS ET FAUX, jamais absents
        (condition 3) : l'`EventSource` d'un opérateur légitime se reconnecte
        automatiquement sans pouvoir poser d'en-tête ; compter ces échecs-là
        verrouillerait son propre tableau de bord.
        """
        if not jeton.actif():
            # Deux chemins mènent ici sans jeton actif : une requête
            # DISTANTE (aucun jeton n'a besoin d'être déclaré pour l'exiger),
            # ou un jeton DÉCLARÉ mais invalide (permissions, taille,
            # encodage — `jeton.py`), locale ou non (bug-012, correctif 1,
            # fail-closed : un jeton cassé ferme, il n'ouvre jamais). Dans
            # les deux cas, rien n'est chargé contre quoi comparer — refuser
            # sans jamais appeler `compare()` ni compter d'échec.
            return 401, "authentification requise"
        ecriture = self._ecriture()
        if ecriture.frein_actif():
            return 429, "trop de tentatives récentes"
        presente = self._jeton_presente()
        if not jeton.compare(presente):
            if presente:
                ecriture.enregistrer_echec()
            return 401, "authentification requise"
        return None

    def _peut_ecrire(self, jeton, distante):
        """Vrai si CE demandeur (pas cette requête précise) peut écrire —
        MÊME test d'identité que la branche d'authentification de `do_POST`
        (ADR-0020, bug-012, correctif 2) : local sans jeton DÉCLARÉ (rien à
        comparer), ou jeton déclaré ET correctement présenté. Ignore
        DÉLIBÉRÉMENT les gardes CSRF de `do_POST` (`Origin`, `Content-Type`) :
        elles bornent la FORME d'une requête d'écriture précise, jamais la
        capacité du demandeur — ce que ce champ annonce.

        Sert à calculer `ecriture_active` par requête, plus jamais depuis la
        seule présence d'un `fichier_jeton` configuré (le bug mesuré :
        `ecriture_active` valait `False` en local sans jeton alors que
        l'écriture y réussit, 202 à l'appui).

        ⚠️ La décision « un jeton est-il exigé ? » se prend sur
        `_jeton_configure()` — un fichier_jeton DÉCLARÉ, valide ou non —
        JAMAIS sur `jeton.actif()` : un jeton déclaré mais invalide doit
        FERMER, pas retomber sur le régime « aucun jeton, ouvert en local »
        (régression mesurée pendant `bug-012`, corrigée par ce même correctif).

        ⚠️ Cette méthode n'est JAMAIS atteinte, dans le déploiement local avec
        un jeton déclaré mais invalide, sans être déjà passée par la garde de
        LECTURE de `do_GET` (`jeton_requis`, même `_jeton_configure()`) — qui
        répond 401 avant de construire l'instantané. Remplacer
        `_jeton_configure()` par `jeton.actif()` sur la ligne suivante ne
        change donc AUCUNE sortie observable par HTTP tant que cet invariant
        d'appel tient ; gardé néanmoins pour ne pas dépendre, ici, d'une garde
        posée ailleurs — un futur appelant qui n'y passerait pas se
        tromperait sinon dans le même sens que la régression `bug-012`.
        """
        if not distante and not _jeton_configure(self.server.etat.config):
            return True
        if not jeton.actif():
            return False
        return jeton.compare(self._jeton_presente())

    def _origine_locale_valide(self):
        """Garde CSRF (GATE P1, bug-012, condition 1) pour l'écriture LOCALE
        sans jeton configuré : ADR-0020 rend le jeton facultatif dans ce cas
        précis, ce qui retire la seule protection qui empêchait un site
        hostile, ouvert dans le navigateur du développeur, de faire poster ce
        même navigateur vers son propre tableau de bord.

        `Origin` ABSENT passe : tout navigateur moderne le pose sur un POST
        cross-origine, et un client qui n'en pose aucun (`curl`, un script) est
        un processus local — exactement ce qu'ADR-0020 assume légitime.
        `Origin` PRÉSENT et différent de `http://<Host>` refuse, `null` inclus
        (un `Origin: null` — iframe sandboxée, redirection — traverse cette
        garde si elle ne le nommait pas explicitement : vérifié par exécution).
        `Sec-Fetch-Site`, quand il est présent, doit valoir `same-origin` ou
        `none` — un navigateur qui le pose le pose aussi sur les requêtes qui
        n'ont pas d'`Origin` (ex. navigation), donc c'est un filet distinct,
        pas redondant.
        """
        hote = self.headers.get("Host", "")
        origine = self.headers.get("Origin")
        if origine is not None and origine != "http://" + hote:
            return False
        site = self.headers.get("Sec-Fetch-Site")
        if site is not None and site not in ("same-origin", "none"):
            return False
        return True

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

            # Garde de lecture (bug-012, ADR-0020) : TOUT `/api/*` quand la
            # requête est distante, ou dès qu'un jeton est configuré (même en
            # local — condition 5 : un intermédiaire local la rend
            # effective). `/`, et les fichiers statiques (`app.js`, `app.css`,
            # …) restent libres dans tous les cas : sinon un navigateur
            # distant ne peut jamais charger la page qui lui permettrait de
            # saisir le jeton.
            jeton = None
            distante = None
            jeton_requis = None
            if chemin.startswith("/api/"):
                jeton = self.server.etat.jeton()
                distante = self._distante()
                # Même condition, MÊME variable, pour deux usages : garder la
                # garde de lecture ci-dessous (comme avant), ET l'exposer telle
                # quelle sur `/api/etat` (bug-012, correctif 3) — le frontend
                # ne peut pas la déduire d'un `200` : un jeton peut être PORTÉ
                # par la requête en cours (en mémoire, via `fetch`) sans que le
                # déploiement l'exige pour un flux `EventSource`, qui ne pose
                # aucun en-tête.
                #
                # ⚠️ Sur `_jeton_configure()` — un fichier_jeton DÉCLARÉ,
                # valide ou non — JAMAIS sur `jeton.actif()` : c'était la
                # régression mesurée pendant ce même cycle. `jeton.actif()`
                # vaut faux aussi bien pour « aucun jeton déclaré » (ouvert en
                # local, ADR-0020) que pour « jeton déclaré mais invalide »
                # (doit FERMER, fail-closed) — les confondre laissait un jeton
                # en mode 0644 rouvrir toute la lecture ET l'écriture derrière
                # un intermédiaire local, précisément le cas que
                # `[serveur].fichier_jeton` existe pour couvrir.
                jeton_requis = distante or _jeton_configure(self.server.etat.config)
                if jeton_requis:
                    erreur = self._autorisation_lecture(jeton, distante)
                    if erreur is not None:
                        code, message = erreur
                        return self._erreur(code, message)

            if chemin == "/":
                return self._statique("index.html")
            if chemin == "/api/etat":
                return self._json(self.server.etat.instantane(
                    self._peut_ecrire(jeton, distante), jeton_requis))
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

            # 2) jeton — OU origine, sur la seule branche où ADR-0020 rend le
            # jeton facultatif : locale, aucun `fichier_jeton` DÉCLARÉ.
            # Partout ailleurs (distant, ou un jeton EST déclaré — condition
            # 5 : un intermédiaire local le rend effectif quand même),
            # comportement INCHANGÉ depuis feature-007 : 403 si l'écriture
            # n'est pas activée DU TOUT ; 429 si le freinage est déclenché,
            # SANS comparer ; 401 sinon, avec un corps IDENTIQUE que le jeton
            # soit absent ou faux.
            #
            # ⚠️ Sur `_jeton_configure()`, JAMAIS sur `jeton.actif()` : c'est
            # la régression mesurée pendant ce cycle (bug-012, correctif 1).
            # Un `fichier_jeton` déclaré mais en mode 0644 rendait
            # `jeton.actif()` faux, retombait dans CETTE branche — celle
            # d'ADR-0020 pensée pour « aucun jeton, ouvert en local » — et un
            # `POST /api/lancer` sans aucun jeton présenté recevait 202,
            # derrière l'intermédiaire local que `fichier_jeton` existe
            # justement pour couvrir. Fail-closed : un jeton déclaré mais
            # invalide doit FERMER cette branche, pas y rester.
            if not self._distante() and not _jeton_configure(self.server.etat.config):
                # Écriture locale sans jeton (ADR-0020) : plus aucune
                # comparaison de secret ne protège cette requête d'un site
                # hostile ouvert dans le navigateur du développeur — deux
                # gardes INDÉPENDANTES du jeton la remplacent (GATE P1
                # conditions 1 et 2).
                if not self._origine_locale_valide():
                    self.close_connection = True
                    return self._erreur(403, "origine non reconnue")
                type_contenu = (self.headers.get("Content-Type") or "").split(";")[0].strip()
                if type_contenu != "application/json":
                    self.close_connection = True
                    return self._erreur(400, "Content-Type application/json requis")
            else:
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
            borne_corps = _TAILLES_MAX_CORPS.get(chemin, _TAILLE_MAX_CORPS)
            if taille > borne_corps:
                self.close_connection = True
                return self._erreur(413, "corps trop volumineux (max %d octets)"
                                          % borne_corps)

            # 5) lecture BORNÉE du corps, exactement `taille` octets.
            corps = self.rfile.read(taille) if taille else b""
            if len(corps) != taille:
                self.close_connection = True
                return self._erreur(400, "corps tronqué")

            if chemin == "/api/interrompre":
                return self._interrompre()

            if chemin == "/api/spec/brouillon":
                return self._spec_brouillon(corps)

            if chemin == "/api/spec/ecrire":
                return self._spec_ecrire(corps)

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

        ⚠️ AUCUNE revérification d'authentification ici (bug-012, correctif
        1) : `/api/lancement` est un chemin `/api/*` comme les autres, déjà
        gardé par `do_GET` — distante ou jeton configuré → `_autorisation_lecture`
        (jeton exigé, comparé, freiné) ; locale sans jeton configuré →
        facultatif (ADR-0020), cette méthode n'est même pas atteinte sans
        avoir déjà franchi cette garde. Une revérification INDÉPENDANTE ici
        avait dérivé de la règle commune : elle exigeait `jeton.actif()`
        inconditionnellement, y compris en local sans jeton configuré —
        rendant la sortie d'un lancement qu'on venait d'autoriser à démarrer
        indéfiniment inatteignable (202 puis 403 en boucle).
        """
        ecriture = self._ecriture()
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

        # D3 (`bug-014`) : `argv` est une liste FERMÉE (`config.commande()`),
        # mais `control-center.toml` n'est PAS versionné — une entrée locale
        # du type `["env", "POOL_PASSWORD=x", "./ota.sh"]` produirait sinon
        # `command_head = "env POOL_PASSWORD=x"`, écrit en 0644 et servi au
        # navigateur. `_lancer()` passe donc par LA MÊME fonction que
        # `config.tetes_de_commande()`, sur `" ".join(argv)` — sinon les deux
        # côtés de `tete in suivies` (`events.py`) divergent. Champ OMIS, pas
        # `None`, quand rien n'est retenu (voir `_tool_details`, le hook).
        evenement = {
            "hook_event_name": "LancementDemande",
            "cle": cle,
            "pid_fils": lancement.pid,
        }
        tete = RC.command_head(" ".join(argv))
        if tete:
            evenement["command_head"] = tete
        _ecrire_evenement(self.server.etat.journal, evenement)
        return self._json({"lance": True, "cle": cle, "pid": lancement.pid}, 202)

    def _interrompre(self):
        ecriture = self._ecriture()
        lancement = ecriture.lancement_courant()
        if lancement is None or not lancement.toujours_en_cours():
            return self._erreur(404, "aucun lancement en cours")
        ecriture.interrompre_courant()
        return self._json({"interrompu": True}, 202)

    def _corps_spec(self, corps):
        """JSON attendu : `{type, titre, texte, minimal?}` pour
        `/api/spec/brouillon`, `{type, titre, contenu}` pour
        `/api/spec/ecrire` (reboucle étape 5a — `contenu` remplace
        `{texte, minimal}` à l'écriture, voir `_spec_ecrire`). Rend
        `(donnees, None)` ou `(None, (code, message))` — `400` pour un corps
        illisible, jamais `422` (réservé aux erreurs de SAISIE une fois le
        JSON compris)."""
        try:
            donnees = json.loads(corps.decode("utf-8")) if corps else {}
        except (ValueError, UnicodeDecodeError):
            return None, (400, "corps illisible")
        if not isinstance(donnees, dict):
            return None, (400, "corps illisible")
        return donnees, None

    def _spec_brouillon(self, corps):
        """`POST /api/spec/brouillon` : produit un brouillon, n'écrit rien
        (feature-008). Champs attendus : `type`, `titre`, `texte`,
        `minimal` (booléen, dérogation vers le template minimal)."""
        donnees, erreur = self._corps_spec(corps)
        if erreur is not None:
            code, message = erreur
            return self._erreur(code, message)
        resultat, erreur = RS.preparer_brouillon(
            self.server.etat.config,
            donnees.get("type"), donnees.get("titre"), donnees.get("texte"),
            bool(donnees.get("minimal")))
        if erreur is not None:
            code, message = erreur
            return self._erreur(code, message)
        return self._json({
            "genre": resultat["genre"],
            "slug": resultat["slug"],
            "nom_fichier_prevu": resultat["nom_fichier_prevu"],
            "contenu": resultat["contenu"],
            "substitutions": resultat["substitutions"],
        }, 200)

    def _spec_ecrire(self, corps):
        """`POST /api/spec/ecrire` : écrit `contenu` — le Markdown TEL QUE
        RELU par l'humain, corrections comprises — VERBATIM dans `todo/`
        (feature-008, reboucle étape 5a : une version antérieure régénérait
        depuis `{titre, texte}` et jetait silencieusement toute correction
        humaine). Champs attendus : `type`, `titre`, `contenu`. `type` et
        `titre` sont des champs JSON DÉDIÉS, RE-VALIDÉS et RE-DÉRIVÉS (le
        slug — donc le chemin — vient de `titre`, jamais de `contenu`) :
        GATE P1 condition 1 porte sur le CHEMIN, pas sur le contenu, et reste
        tenue à la lettre quel que soit ce que `contenu` renferme."""
        donnees, erreur = self._corps_spec(corps)
        if erreur is not None:
            code, message = erreur
            return self._erreur(code, message)
        resultat, erreur = RS.ecrire_spec(
            self.server.etat.config,
            donnees.get("type"), donnees.get("titre"), donnees.get("contenu"))
        if erreur is not None:
            code, message = erreur
            return self._erreur(code, message)
        return self._json(resultat, 201)

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
    # ⚠️ Sur `_jeton_configure()` — un `fichier_jeton` DÉCLARÉ, valide ou non
    # — JAMAIS sur `jeton_demarrage.actif()` seul : c'est le test qui décide
    # si un jeton est EXIGÉ (bug-012, correctif 1). La bannière annonçait
    # « désactivée … LECTURE SEULE » sans `fichier_jeton` déclaré, alors que
    # ce même processus servait `ecriture_active: true` et un 202 en local
    # (ADR-0020 : aucun jeton n'y est exigé) — mesuré pendant ce cycle
    # (bug-012, correctif 2).
    jeton_declare = _jeton_configure(config)
    print("Centre de contrôle")
    print("  projet   : %s" % config.section("projet").get("nom"))
    print("  écoute   : http://%s:%d" % (hote, port))
    print("  dépôt    : %s" % config["_racine_projet"])
    print("  statique : %s" % (", ".join(sorted(serveur.servables)) or "aucun fichier web/"))
    if not jeton_declare:
        print("  écriture : ACTIVE en local, SANS jeton (ADR-0020) — %s"
              % ", ".join(_ROUTES_ECRITURE))
        print("             aucun secret exigé depuis la boucle locale (127.0.0.1/::1) ;")
        print("             toute requête distante reste refusée, lecture comprise, sans")
        print("             `[serveur].fichier_jeton` valide.")
    elif jeton_demarrage.actif():
        print("  écriture : ACTIVE avec jeton — %s" % ", ".join(_ROUTES_ECRITURE))
        print("             un jeton valide est exigé pour toute requête, y compris")
        print("             locale derrière un intermédiaire (reverse proxy, TLS, socat…).")
    else:
        print("  écriture : FERMÉE — jeton déclaré mais invalide : %s" % jeton_demarrage.refus)
        print("             fail-closed (ADR-0020) : lecture ET écriture refusées à")
        print("             TOUTE requête, y compris locale, tant que ce jeton n'est pas")
        print("             corrigé (permissions au plus 0600, 16 à 4096 octets ASCII")
        print("             imprimable) ou retiré de `[serveur].fichier_jeton`.")
    if hote not in ("127.0.0.1", "localhost"):
        # ⚠️ Ce que voit CETTE ligne n'est qu'une déclaration de configuration
        # (`[serveur].hote`) : la décision réelle, elle, se prend PAR
        # REQUÊTE sur l'adresse source (`_locale()`) — `0.0.0.0` sert la
        # boucle locale ET le réseau sur le même socket (bug-012, ADR-0020).
        if jeton_declare and jeton_demarrage.actif():
            print("  ⚠️  ouvert au réseau local, ET un jeton valide est déclaré : c'est")
            print("      lui, seul, qui protège LECTURE et ÉCRITURE pour toute requête")
            print("      qui n'arrive pas par la boucle locale de CETTE machine.")
        elif jeton_declare:
            print("  ⚠️  ouvert au réseau local, ET le jeton déclaré est INVALIDE : %s"
                  % jeton_demarrage.refus)
            print("      fail-closed (ADR-0020) — aucune requête, locale ou distante,")
            print("      ne passera tant que ce jeton n'est pas corrigé ou retiré.")
        else:
            print("  ⚠️  ouvert au réseau local, SANS jeton déclaré. Cause : aucun")
            print("      `[serveur].fichier_jeton` valide n'est configuré — sous ce")
            print("      modèle (ADR-0020), le jeton protège aussi la LECTURE dès que")
            print("      le serveur sort de la machine. Deux sorties possibles :")
            print("        - déclarer un `[serveur].fichier_jeton` valide, pour ouvrir")
            print("          ce serveur au réseau en le protégeant réellement ;")
            print("        - revenir à `hote = \"127.0.0.1\"`, si l'usage est purement")
            print("          local.")
            print("      En l'état, toute requête distante — lecture comprise — reçoit")
            print("      401 ; la machine locale, elle, continue de fonctionner sans")
            print("      secret.")
    # ⚠️ `serve_forever()` ne rend jamais la main : sans ce vidage, tout ce qui
    # précède reste dans le tampon de stdout dès que la sortie n'est pas un
    # terminal (`nohup`, `> fichier`, superviseur). Les logs de requêtes, eux,
    # partent sur stderr et s'affichent — d'où un démarrage qui paraît muet
    # alors que le serveur répond. Relevé en usage réel : la ligne « écoute »
    # est précisément celle dont le README dit qu'elle fait foi.
    sys.stdout.flush()
    try:
        serveur.serve_forever()
    except KeyboardInterrupt:
        print("\narrêt")
        _arret_propre()
    finally:
        serveur.server_close()


if __name__ == "__main__":
    demarrer()
