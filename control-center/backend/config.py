#!/usr/bin/env python3
"""Chargement de `control-center.toml` — la ligne de partage de la portabilité.

Ce module existe pour une raison précise : **le fichier de configuration existait
sans que personne ne le lise**. Il était commenté, versionné, et entièrement
décoratif. C'est la pire forme de dette — une configuration qui a l'air d'être en
service alors qu'elle ne pilote rien.

## Ce qui appartient à la configuration, et ce qui n'y appartient pas

Le principe est celui du projet : **tout ce qui peut être découvert l'est**. La
liste des agents vient du système de fichiers, la liste des specs aussi, les
fichiers modifiés viennent de git. La configuration ne porte QUE ce qu'aucune
inspection ne donne :

- l'ORDRE des colonnes et leur LIBELLÉ — « doing » ne dit pas si le travail
  avance ou s'il est bloqué ;
- le VOCABULAIRE des statuts — il est en français ici, il ne le sera pas ailleurs ;
- les COMMANDES lançables, en liste fermée ;
- les bornes de sûreté.

## Pourquoi tout doit avoir un défaut

Un projet instancié depuis le template n'aura peut-être pas de
`control-center.toml`. L'outil doit alors fonctionner, pas refuser de démarrer :
chaque réglage a une valeur par défaut, et `charger()` sur un fichier absent rend
une configuration utilisable. L'absence de configuration n'est pas une erreur,
c'est un projet qui n'a rien de particulier à déclarer.
"""

import os

try:
    import tomllib
except ImportError:  # Python < 3.11
    tomllib = None

# Valeurs par défaut. Elles ne décrivent AUCUN projet en particulier : ce sont
# les conventions les plus répandues, pas celles de ce dépôt.
_DEFAUTS = {
    "projet": {"nom": "Projet sans nom"},
    "specs": {
        "racine": "specs/features",
        "colonnes": [
            {"repertoire": "todo", "libelle": "À faire"},
            {"repertoire": "doing", "libelle": "En cours"},
            {"repertoire": "done", "libelle": "Clos"},
        ],
        # Fichiers à ne jamais prendre pour des specs. Codés en dur dans
        # `specs.py` jusqu'ici — donc invisibles et non modifiables par un autre
        # projet, qui archive peut-être ses notes sous un autre nom.
        "exclure": ["README.md"],
        "prefixes_exclus": ["_"],
        # Au-delà de cette ligne, on cesse de chercher des métadonnées. Certaines
        # specs redéfinissent un second « Statut » dans leurs notes, qui
        # contredit le premier.
        "lignes_entete": 60,
        # Vocabulaire de classification, au SEUL usage de la détection de
        # divergence. Tout mot absent d'ici rend « indéterminé », et l'outil se
        # tait alors au lieu d'affirmer une contradiction.
        # Les valeurs sont des NOMS DE COLONNE — c'est-à-dire, par défaut, des
        # noms de répertoire. Il n'existe donc qu'un seul système de noms.
        # Une couche intermédiaire (« a_faire », « en_cours », « clos ») existait
        # dans le code : deux vocabulaires pour la même notion, sans traduction
        # de l'un vers l'autre. Elle est supprimée.
        "vocabulaire": {
            "todo": "todo", "draft": "todo", "enattente": "todo",
            "doing": "doing", "wip": "doing", "encours": "doing",
            "done": "done", "livre": "done", "livree": "done",
            "cloturee": "done", "cloture": "done",
            "termine": "done", "terminee": "done",
            "implemente": "done", "implementee": "done",
            "abandonne": "done", "abandonnee": "done",
            # ⚠️ « GELÉE » n'est PAS ici : ranger une spec gelée en « clos »
            # suppose que le dernier répertoire archive les décisions de NE PAS
            # FAIRE, ce qui est vrai de ce dépôt et pas de tout projet. Ce choix
            # appartient au `control-center.toml` du projet, pas aux défauts.
        },
    },
    "agents": {"racine": ".claude/agents"},
    "commandes": {},
    "workflows": {
        # Défaut NEUTRE : un projet sans `control-center.toml` garde le
        # comportement d'avant bug-004, un workflow par session — le module
        # `events.py` ne connaît aucun nom d'agent, c'est ici qu'un projet
        # déclare celui qui ouvre ses cycles.
        "agents_ouvrants": [],
        "affiches": 20,
        # Combien de minutes sans AUCUNE activité observée avant qu'un
        # passage encore ouvert ne soit requalifié « sans clôture » plutôt
        # que laissé « en cours » indéfiniment (bug-013). Mesuré sur ce
        # dépôt : la plus longue durée réelle d'un passage est 24 min
        # (`backend-developer`), et un sous-agent peut légitimement rester
        # silencieux longtemps (`architect` : un seul appel d'outil en
        # 127 s). 120 min = 5× la plus longue mesurée : le risque d'accuser
        # un agent vivant (on relancerait un travail en cours) est pire que
        # celui d'afficher trop longtemps un agent mort.
        "seuil_abandon_minutes": 120,
    },
    "serveur": {
        # Par défaut on n'écoute QUE en local. Ouvrir au réseau est une décision
        # explicite du projet, jamais un héritage silencieux du défaut.
        "hote": "127.0.0.1",
        "port": 8787,
        "fichier_jeton": "",
    },
    "garde_fous": {
        "budget_max_usd": 5.0,
        "ecrivains_simultanes": 1,
        # Liste FERMÉE des clés de [commandes] pour lesquelles le plafond de
        # dépense peut être ajouté à l'argv (`--max-budget-usd`). Un clic ne
        # doit jamais déclencher une dépense non bornée : par défaut, AUCUNE
        # commande ne reçoit le drapeau ; le déclarer est une décision
        # explicite du projet, pas un héritage silencieux.
        "commandes_avec_budget": [],
    },
}


class Config(dict):
    """Configuration fusionnée. Accès par section, jamais de KeyError."""

    def section(self, nom):
        return self.get(nom, {})

    def colonnes(self):
        """[(repertoire, classe, libelle), …] dans l'ordre déclaré."""
        sorties = []
        for colonne in self.section("specs").get("colonnes", []):
            repertoire = colonne.get("repertoire")
            if not repertoire:
                continue
            sorties.append((
                repertoire,
                # Sans `classe` explicite, le répertoire EST la classe : c'est le
                # cas le plus courant et il évite de tout déclarer deux fois.
                colonne.get("classe") or repertoire,
                colonne.get("libelle") or repertoire,
            ))
        return sorties

    def commande(self, cle):
        """L'argv d'une commande autorisée, ou None.

        ⚠️ C'est ici que vit la LISTE FERMÉE. L'appelant fournit une CLÉ ; il ne
        fournit jamais une ligne de commande. Aucune chaîne venue du réseau ne
        peut donc atteindre un shell : au pire elle ne correspond à aucune clé.
        """
        argv = self.section("commandes").get(cle)
        if isinstance(argv, list) and argv and all(isinstance(x, str) for x in argv):
            return list(argv)
        return None

    def agents_ouvrants(self):
        """Les `agent_type` dont l'invocation ouvre un cycle, chaînes non vides.

        Défensif dans le même esprit que `commande()` : une entrée malformée
        (nombre, liste, chaîne vide) est ignorée plutôt que de faire planter
        `events.py` — qui, lui, fait confiance à ce que ce module lui donne.
        """
        bruts = self.section("workflows").get("agents_ouvrants", [])
        if not isinstance(bruts, list):
            return []
        return [a for a in bruts if isinstance(a, str) and a]

    def workflows_affiches(self):
        """Nombre de workflows envoyés au tableau de bord, borné [1, 100].

        Une valeur aberrante (négative, hors bornes, ou d'un autre type) ne
        doit pas priver l'interface de tout historique : on retombe alors sur
        le défaut plutôt que de propager une valeur qui casserait `[-n:]`.
        """
        defaut = _DEFAUTS["workflows"]["affiches"]
        brut = self.section("workflows").get("affiches", defaut)
        if not isinstance(brut, int) or isinstance(brut, bool):
            return defaut
        if brut < 1 or brut > 100:
            return defaut
        return brut

    def seuil_abandon_minutes(self):
        """Minutes sans activité avant qu'un passage ouvert soit requalifié
        « sans clôture » (bug-013), borné [60, 10080] (1h à 1 semaine).

        Même discipline défensive que `workflows_affiches()` : une valeur
        aberrante ne doit pas faire planter la reconstruction, ni accuser à
        tort un agent vivant (borne basse) ni laisser un abandon invisible
        pour toujours (borne haute) — on retombe alors sur le défaut.
        """
        defaut = _DEFAUTS["workflows"]["seuil_abandon_minutes"]
        brut = self.section("workflows").get("seuil_abandon_minutes", defaut)
        if isinstance(brut, bool) or not isinstance(brut, (int, float)):
            return defaut
        if brut < 60 or brut > 10080:
            return defaut
        return brut

    def fichier_jeton(self):
        """Chemin ABSOLU du fichier de jeton, ou None si rien n'est déclaré.

        `None` est le signal qui désactive les routes d'écriture (garde-fou 1,
        `jeton.py`) : aucun autre module n'a besoin de connaître la
        différence entre « chaîne vide » et « absent », ils reçoivent la même
        réponse univoque.
        """
        brut = self.section("serveur").get("fichier_jeton", "")
        if not isinstance(brut, str) or not brut:
            return None
        if os.path.isabs(brut):
            return brut
        return os.path.join(self["_racine_projet"], brut)

    def budget_max_usd(self):
        """Plafond de dépense, strictement positif. Retombe sur le défaut si
        absent, du mauvais type, ou négatif/nul — un plafond à 0 ou négatif
        interdirait tout lancement sans le dire clairement, silencieusement."""
        defaut = _DEFAUTS["garde_fous"]["budget_max_usd"]
        brut = self.section("garde_fous").get("budget_max_usd", defaut)
        if isinstance(brut, bool) or not isinstance(brut, (int, float)):
            return defaut
        if brut <= 0:
            return defaut
        return float(brut)

    def ecrivains_simultanes(self):
        """Nombre d'écrivains simultanés autorisés, entier >= 1. Retombe sur
        le défaut (1) si absent, du mauvais type, ou hors bornes."""
        defaut = _DEFAUTS["garde_fous"]["ecrivains_simultanes"]
        brut = self.section("garde_fous").get("ecrivains_simultanes", defaut)
        if isinstance(brut, bool) or not isinstance(brut, int):
            return defaut
        if brut < 1:
            return defaut
        return brut

    def budget_transmissible(self, cle):
        """Vrai si le plafond de dépense PEUT être ajouté à l'argv de `cle`.

        Critère DÉCLARATIF (condition n°7 du GATE P1) : liste FERMÉE, dans
        `[garde_fous].commandes_avec_budget`, des clés de `[commandes]`
        connues pour accepter `--max-budget-usd`. Une clé absente de cette
        liste — y compris une clé par ailleurs valide dans `[commandes]` —
        REFUSE la transmission : le défaut sûr est de ne rien ajouter en
        silence à une commande qui ne l'attend pas.

        Un argv qui contient DÉJÀ `--max-budget-usd` est refusé même s'il
        figure dans la liste : ajouter le drapeau le dupliquerait, et rien ne
        dit laquelle des deux valeurs devrait l'emporter.
        """
        argv = self.commande(cle)
        if argv is None or "--max-budget-usd" in argv:
            return False
        bruts = self.section("garde_fous").get("commandes_avec_budget", [])
        if not isinstance(bruts, list):
            return False
        autorisees = [c for c in bruts if isinstance(c, str) and c]
        return cle in autorisees

    def tetes_de_commande(self):
        """Les deux premiers jetons de chaque commande autorisée.

        Fait le pont entre le format `argv` de la configuration et le format
        « tête à deux jetons » du journal, qui était jusqu'ici deux notions sans
        traduction l'une vers l'autre.

        ⚠️ Passe par `commande()` et non par les valeurs brutes : sans cela, les
        deux fonctions ne s'accordaient pas sur ce qu'est une commande valide.
        Une entrée malformée (`["ls", 42]`) était refusée par `commande()` et
        pourtant traduite en tête `"ls 42"` ici. Une liste fermée dont deux
        lecteurs divergent n'est plus fermée — défaut trouvé par son test.
        """
        tetes = set()
        for cle in self.section("commandes"):
            argv = self.commande(cle)
            if argv:
                tetes.add(" ".join(argv[:2]))
        return tetes


def _fusionner(defaut, surcharge):
    """Fusion récursive : la surcharge complète le défaut, elle ne l'efface pas.

    Un projet qui déclare seulement `[serveur] port = 9000` garde tous les autres
    réglages. Sans cette fusion, déclarer une section vide effacerait tout ce
    qu'elle contenait par défaut — un piège classique des fichiers de config.
    """
    resultat = dict(defaut)
    for cle, valeur in surcharge.items():
        if isinstance(valeur, dict) and isinstance(resultat.get(cle), dict):
            resultat[cle] = _fusionner(resultat[cle], valeur)
        else:
            resultat[cle] = valeur
    return resultat


def charger(chemin=None, racine_projet=None):
    """Charge la configuration. Un fichier absent ou illisible rend les défauts.

    `racine_projet` est le répertoire auquel les chemins relatifs se rapportent ;
    par défaut, le parent de `control-center/`.
    """
    ici = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    if chemin is None:
        chemin = os.path.join(ici, "control-center.toml")
    if racine_projet is None:
        racine_projet = os.path.dirname(ici)

    brut = {}
    if tomllib is not None and os.path.exists(chemin):
        try:
            with open(chemin, "rb") as fichier:
                brut = tomllib.load(fichier)
        except (OSError, ValueError):
            # Un TOML cassé ne doit pas empêcher l'outil de démarrer : il
            # démarre sur les défauts, et l'appelant verra `fichier_lu` à False.
            brut = {}

    config = Config(_fusionner(_DEFAUTS, brut if isinstance(brut, dict) else {}))
    config["_chemin"] = chemin
    config["_racine_projet"] = racine_projet
    config["_fichier_lu"] = bool(brut)
    return config


if __name__ == "__main__":
    import json

    config = charger()
    print(json.dumps({
        "fichier": config["_chemin"],
        "lu": config["_fichier_lu"],
        "racine_projet": config["_racine_projet"],
        "projet": config.section("projet").get("nom"),
        "colonnes": config.colonnes(),
        "commandes": sorted(config.section("commandes")),
        "tetes": sorted(config.tetes_de_commande()),
        "serveur": config.section("serveur"),
        "garde_fous": config.section("garde_fous"),
        "agents_ouvrants": config.agents_ouvrants(),
        "workflows_affiches": config.workflows_affiches(),
        "seuil_abandon_minutes": config.seuil_abandon_minutes(),
        "taille_vocabulaire": len(config.section("specs").get("vocabulaire", {})),
        "fichier_jeton": config.fichier_jeton(),
        "budget_max_usd": config.budget_max_usd(),
        "ecrivains_simultanes": config.ecrivains_simultanes(),
    }, ensure_ascii=False, indent=2))
