#!/usr/bin/env python3
"""Reconstruction des workflows depuis le journal d'événements.

Ce module répond à la question « que s'est-il RÉELLEMENT passé ? », par
opposition au workflow théorique que décrit `CLAUDE.md`. Il ne lit que le
journal produit par `hooks/record-event.py` ; il n'interroge pas Claude Code, ne
lance rien, et ne connaît aucun nom d'agent.

## Pourquoi c'est un tri, et non un arbre

Les hooks `SubagentStart`/`SubagentStop` portent `agent_id`, `agent_type` et
`session_id`, mais **aucun identifiant d'appel parent**. Ce serait bloquant s'il
y avait de l'imbrication.

Or aucun agent de ce dépôt n'a l'outil `Task` : aucun ne peut déléguer. Une
session ne peut donc jamais imbriquer deux passages d'agent, et reconstruire un
segment revient à trier par horodatage.

⚠️ **Un workflow n'est PAS une session** (ADR-0002, réfuté à l'usage — voir la
note additive et bug-004) : une session interactive enchaîne autant de cycles
que l'utilisateur le demande, et rien dans le journal ne nomme un « cycle » ou
une « spec ». Ce module ne le sait pas davantage après ce correctif : il sait
seulement segmenter une session sur un signal qu'ON LUI DÉCLARE — l'invocation
d'un agent de la liste `agents_ouvrants`, fournie par l'appelant. Sans cette
liste, ou si aucun de ces agents n'apparaît, la session reste un seul segment :
le module ne découpe jamais au jugé, il rapporte l'hypothèse qu'on lui a
donnée, ou son absence.

⚠️ Si un jour un agent reçoit `Task`, cette hypothèse tombe et l'imbrication
devient invisible ici — les passages d'agent s'afficheraient à plat, dans le
désordre apparent. Le module le SIGNALE (`imbrication_suspectee`) plutôt que de
produire un récit faux : deux ouvertures sans fermeture intercalée en sont la
trace observable.

## Ce qu'on n'invente pas

Un passage d'agent sans fermeture n'est pas « terminé » : il est **en cours**, ou
sa fermeture a été perdue. On ne lui fabrique ni durée ni verdict. De même, une
session sans `SessionEnd` n'est pas « échouée » — elle tourne peut-être encore,
et c'est le cas le plus fréquent puisque la session interactive de l'utilisateur
ne se termine pas.
"""

import json
import os

# Événements structurants. Tout le reste est rattaché au passage d'agent courant.
DEBUT_SESSION = "SessionStart"
FIN_SESSION = "SessionEnd"
DEBUT_AGENT = "SubagentStart"
FIN_AGENT = "SubagentStop"
ECHEC_OUTIL = "PostToolUseFailure"

# Nom de l'acteur quand aucun `agent_id` n'est présent. L'ABSENCE d'agent_id
# identifie l'agent principal — elle n'est jamais comblée par une valeur du
# domaine, mais il faut bien l'afficher (ADR-0072 : la sentinelle est explicite).
AGENT_PRINCIPAL = "(agent principal)"

# Bornage d'un workflow — la RÈGLE qui a posé sa frontière, jamais tue.
# Un workflow qui n'a pas pu être découpé le DIT, plutôt que de laisser
# deviner s'il correspond à un cycle ou à une session entière.
BORNAGE_SESSION = "session-entiere"
BORNAGE_MARQUEUR = "marqueur-agent"
BORNAGE_PREFIXE = "avant-premier-marqueur"

LIBELLES_BORNAGE = {
    BORNAGE_SESSION: "session entière (aucun agent ouvrant configuré, ou "
                     "aucun rencontré)",
    BORNAGE_MARQUEUR: "segment ouvert par l'agent ouvrant déclaré",
    BORNAGE_PREFIXE: "avant le premier agent ouvrant — n'affirme rien sur "
                     "son contenu",
}

# État d'un segment (bug-013) — TROIS cases, jamais deux. Un passage sans
# fermeture n'est plus automatiquement « en cours » : il ne le reste que tant
# que son inactivité ne dépasse pas le seuil déclaré (fourni par l'appelant,
# jamais lu ici). `ETAT_SANS_CLOTURE` n'est ni un succès ni un échec du
# travail — une fin SANS ANNONCE, à ne jamais confondre avec « terminé » (un
# verdict positif) ni avec un échec (une faute de l'agent qu'il n'a pas
# commise).
ETAT_TERMINE = "termine"
ETAT_EN_COURS = "en_cours"
ETAT_SANS_CLOTURE = "sans_cloture"


class _Workflows(list):
    """La liste de workflows rendue par `reconstruire()`, augmentée du compte
    d'événements SANS `session_id` (`evenements_hors_session`, bug-013 /
    feature-010) — un ATTRIBUT, jamais un élément de la liste : le contrat de
    liste (indexation, slicing, égalité avec une liste ordinaire, tri) reste
    entièrement inchangé pour tout appelant qui ne lit pas cet attribut.
    """

    evenements_hors_session = 0


def lire_journal(chemin):
    """Lit le journal. Une ligne illisible est IGNORÉE, jamais fatale.

    Le journal est écrit en ajout par plusieurs sessions ; une ligne tronquée
    par un arrêt brutal ne doit pas rendre tout l'historique inexploitable.
    """
    evenements = []
    if not os.path.exists(chemin):
        return evenements
    try:
        with open(chemin, encoding="utf-8") as fichier:
            for ligne in fichier:
                ligne = ligne.strip()
                if not ligne:
                    continue
                try:
                    evenement = json.loads(ligne)
                except ValueError:
                    continue
                if isinstance(evenement, dict) and evenement.get("ts"):
                    evenements.append(evenement)
    except OSError:
        return evenements
    # Les horodatages sont ISO 8601 à la milliseconde, en UTC, de longueur
    # constante : l'ordre lexicographique EST l'ordre chronologique.
    evenements.sort(key=lambda e: e["ts"])
    return evenements


def _duree_ms(debut, fin):
    """Durée entre deux horodatages ISO, ou None si l'un manque.

    None signifie « pas mesurable », jamais 0 : un passage d'agent sans
    fermeture n'a pas duré zéro milliseconde, on ignore sa durée.
    """
    if not debut or not fin:
        return None
    import datetime
    try:
        d = datetime.datetime.strptime(debut, "%Y-%m-%dT%H:%M:%S.%fZ")
        f = datetime.datetime.strptime(fin, "%Y-%m-%dT%H:%M:%S.%fZ")
    except ValueError:
        return None
    millisecondes = int((f - d).total_seconds() * 1000)
    # Une durée négative signifie que l'horloge a reculé entre les deux
    # événements. Ce n'est pas une durée : c'est une mesure invalide, et on rend
    # None plutôt qu'un nombre qui s'afficherait comme un fait.
    return millisecondes if millisecondes >= 0 else None


def _minutes_ecoulees(ts, maintenant):
    """Minutes écoulées entre un horodatage ISO du journal et `maintenant`.

    `maintenant` est un `time.struct_time` UTC (le format de `time.gmtime()`)
    FOURNI PAR L'APPELANT — jamais lu ici via `time.time()` ou
    `time.gmtime()` internes : l'horloge entre par paramètre, la fonction
    reste pure et déterministe (ADR-0014, invariant du module).

    Rend `None` — jamais une durée fabriquée — si `ts` est absent/illisible
    ou si `maintenant` est `None` : c'est précisément le signal qui laisse la
    garde de fraîcheur INERTE plutôt que de deviner (bug-013).
    """
    if not ts or maintenant is None:
        return None
    import calendar
    import datetime
    try:
        d = datetime.datetime.strptime(ts, "%Y-%m-%dT%H:%M:%S.%fZ")
    except ValueError:
        return None
    epoque_ts = calendar.timegm(d.timetuple()) + d.microsecond / 1e6
    epoque_maintenant = calendar.timegm(maintenant)
    return (epoque_maintenant - epoque_ts) / 60.0


def _etat_segment(segment, maintenant, seuil_abandon_minutes):
    """`ETAT_TERMINE` si le segment a une fermeture observée. Sinon
    `ETAT_EN_COURS`, sauf si SON INACTIVITÉ dépasse le seuil déclaré — auquel
    cas `ETAT_SANS_CLOTURE` (bug-013).

    ⚠️ Ne déduit JAMAIS la fin de la seule absence d'un `SubagentStop` : la
    borne porte sur `derniere_activite` (mise à jour à chaque événement
    rattaché au segment), pas sur l'absence d'un événement particulier —
    l'appariement `SubagentStart`/`SubagentStop` est déjà fragile en
    production (1237 `SubagentStop` sur 1359 sans `agent_type`).

    Sans horloge (`maintenant`) NI seuil déclarés, aucune requalification :
    la garde reste prouvablement inerte plutôt que de trancher au jugé.
    """
    if segment["termine"]:
        return ETAT_TERMINE
    if maintenant is None or seuil_abandon_minutes is None:
        return ETAT_EN_COURS
    minutes = _minutes_ecoulees(segment.get("derniere_activite"), maintenant)
    if minutes is not None and minutes > seuil_abandon_minutes:
        return ETAT_SANS_CLOTURE
    return ETAT_EN_COURS


def reconstruire(evenements, commandes_suivies=(), agents_ouvrants=(),
                  maintenant=None, seuil_abandon_minutes=None):
    """Groupe les événements en workflows.

    Un workflow est un SEGMENT d'une session — la session entière par défaut,
    ou un cycle borné par un agent ouvrant si `agents_ouvrants` en désigne un.
    Le champ `session_id` reste présent et inchangé sur chaque workflow ; c'est
    `workflow_id` (`"<session_id>#<indice>"`) qui identifie le segment.

    `commandes_suivies` est la liste FERMÉE des débuts de commande à compter à
    part (« pio test », « pio run »…). Elle vient de la configuration du projet :
    ce module ne connaît aucune commande.

    `agents_ouvrants` est la liste FERMÉE des `agent_type` dont l'invocation
    ouvre un nouveau cycle — elle aussi vient de la configuration du projet :
    **ce module ne connaît aucun nom d'agent**, il ne fait qu'appliquer la
    règle qu'on lui donne. Trois refus explicites, jamais un découpage au
    jugé :

    - `agents_ouvrants` vide (défaut) ⇒ aucun découpage, `bornage` =
      `BORNAGE_SESSION` — le comportement d'avant ce correctif, désormais
      déclaré ;
    - aucun agent de la liste rencontré dans une session ⇒ même verdict,
      même valeur ;
    - les événements antérieurs au premier agent ouvrant rencontré ne sont
      PAS absorbés dans le premier cycle : ils forment un workflow à part,
      `bornage` = `BORNAGE_PREFIXE`, qui n'affirme rien sur son contenu.

    `maintenant` (un `time.struct_time` UTC, `time.gmtime()`) et
    `seuil_abandon_minutes` gouvernent le champ additif `etat` de chaque
    segment (`ETAT_TERMINE` / `ETAT_EN_COURS` / `ETAT_SANS_CLOTURE`,
    bug-013) : un passage ouvert dont `derniere_activite` remonte à plus de
    `seuil_abandon_minutes` avant `maintenant` devient `ETAT_SANS_CLOTURE`
    plutôt que de rester affiché « en cours » indéfiniment (l'agent tué par
    une limite de session, jamais fermé). Les deux valent `None` par défaut
    : SANS horloge ni seuil fournis, AUCUNE requalification n'a lieu — la
    garde de fraîcheur reste prouvablement inerte, jamais une déduction
    silencieuse. `termine` garde son sens d'avant ce correctif, inchangé.

    Le compte d'événements SANS `session_id` (`LancementDemande` /
    `LancementTermine`, écrits avant qu'une session ne soit connue) n'est
    plus écarté en silence : il est exposé sur `evenements_hors_session`,
    un ATTRIBUT de la liste rendue (voir `_Workflows`) — on ne leur fabrique
    jamais de session.

    ⚠️ CONTRAT D'ORDRE : cette fonction NE TRIE PAS. Elle consomme les événements
    dans l'ordre reçu, et c'est `lire_journal()` qui garantit l'ordre
    chronologique. Un appelant qui passe une liste non triée obtient un récit
    dans l'ordre qu'il a fourni — ce qui est voulu (on peut vouloir rejouer une
    capture telle quelle), mais qui doit être su.

    C'est la raison d'être du garde-fou sur les durées négatives : une fermeture
    antérieure à son ouverture est alors possible, et `_duree_ms()` rend `None`
    plutôt qu'un nombre négatif qui s'afficherait comme un fait.
    """
    suivies = set(commandes_suivies)
    ouvrants = {a for a in agents_ouvrants if a}
    workflows = {}
    # Dernier indice de segment ouvert, par session — c'est ce compteur qui
    # fabrique la clé `(session_id, indice)` et le suffixe de `workflow_id`.
    indice_courant = {}
    # Événements SANS `session_id` (`LancementDemande`/`LancementTermine`,
    # écrits avant qu'une session ne soit connue) : COMPTÉS, jamais absorbés
    # dans une session fabriquée pour l'occasion (bug-013).
    hors_session = 0

    for evenement in evenements:
        session = evenement.get("session_id")
        if not session:
            hors_session += 1
            continue

        nom = evenement.get("hook_event_name")
        agent_type = evenement.get("agent_type")
        est_marqueur = bool(nom == DEBUT_AGENT and ouvrants and agent_type in ouvrants)

        indice = indice_courant.setdefault(session, 0)
        cle = (session, indice)
        workflow = workflows.get(cle)

        # Un marqueur rencontré alors que le segment courant a déjà reçu un
        # événement (donc `workflow` existe déjà) clôt ce segment et en ouvre
        # un neuf. Un marqueur qui EST le tout premier événement de la session
        # ne clôt rien : il commence directement le segment 0, et c'est ce
        # segment 0 qui portera `borne_par` — il n'existe alors aucun « avant »
        # à isoler.
        if workflow is not None and est_marqueur:
            indice += 1
            indice_courant[session] = indice
            cle = (session, indice)
            workflow = None

        if workflow is None:
            # `borne_par` est fixé UNE FOIS, à la création : c'est le nom de
            # l'agent ouvrant si ce segment démarre exactement sur lui, sinon
            # `None` — la valeur ne peut plus changer une fois le segment posé.
            workflow = workflows[cle] = {
                "session_id": session,
                "workflow_id": "%s#%d" % (session, indice),
                "indice_cycle": indice,
                "_borne_par": agent_type if est_marqueur else None,
                "debut": evenement["ts"],
                "fin": None,
                "cwd": evenement.get("cwd"),
                "runtime": evenement.get("runtime", "inconnu"),
                "passages": [],
                # `segments` raconte la chaîne COMPLÈTE, agent principal compris ;
                # `passages` ne contient que les sous-agents et reste inchangé pour
                # les appelants qui ne s'intéressent qu'à eux.
                "segments": [],
                "fichiers": [],
                "en_cours": None,
                "principal": None,
                "echecs": 0,
                "commandes": {},
                "imbrication_suspectee": False,
                "fermetures_orphelines": 0,
                # Candidats à l'imbrication suspectée — des RÉFÉRENCES vers
                # des passages, jamais une décision : le verdict final se
                # prend en post-passe, une fois `etat` connu pour chacun
                # (bug-013, ne pas accuser un passage requalifié
                # `sans_cloture`, ni un passage fermé tardivement).
                "_candidats_imbrication": [],
            }
        workflow["fin_observee"] = evenement["ts"]
        if evenement.get("cwd") and not workflow["cwd"]:
            workflow["cwd"] = evenement["cwd"]

        # Un segment d'agent principal s'ouvre au premier événement qui lui
        # appartient et se ferme quand un sous-agent démarre. Sans lui, la chaîne
        # racontait un workflow plus creux qu'il n'est : sur un relevé réel, 112
        # appels d'outils de l'agent principal n'apparaissaient nulle part.
        if workflow["en_cours"] is None and nom not in (DEBUT_AGENT, FIN_AGENT, FIN_SESSION):
            if workflow["principal"] is None:
                workflow["principal"] = {
                    "type": "principal", "agent": AGENT_PRINCIPAL,
                    "debut": evenement["ts"], "fin": evenement["ts"],
                    "duree_ms": None, "outils": 0, "fichiers": [], "echecs": 0,
                    "termine": True,
                    "derniere_activite": evenement["ts"],
                }
                workflow["segments"].append(workflow["principal"])
            workflow["principal"]["fin"] = evenement["ts"]
            workflow["principal"]["duree_ms"] = _duree_ms(
                workflow["principal"]["debut"], workflow["principal"]["fin"])
            workflow["principal"]["derniere_activite"] = evenement["ts"]
            if evenement.get("tool"):
                workflow["principal"]["outils"] += 1

        if nom == DEBUT_AGENT:
            # Le segment principal en cours se clôt : ce qui suit appartient au
            # sous-agent.
            workflow["principal"] = None
            if workflow["en_cours"] is not None:
                # Deux ouvertures sans fermeture intercalée : soit une fermeture
                # a été perdue, soit un agent en a invoqué un autre. Le récit
                # devient incertain — mais le verdict (`imbrication_suspectee`)
                # attend la post-passe (bug-013) : ici on ne fait que
                # RETENIR le candidat, jamais trancher au vol.
                workflow["_candidats_imbrication"].append(workflow["en_cours"])
            passage = {
                "agent": evenement.get("agent_type") or AGENT_PRINCIPAL,
                "agent_id": evenement.get("agent_id"),
                "debut": evenement["ts"],
                "fin": None,
                "duree_ms": None,
                "echecs": 0,
                "fichiers": [],
                "commandes": [],
                "termine": False,
                "derniere_activite": evenement["ts"],
            }
            passage["type"] = "sousagent"
            workflow["passages"].append(passage)
            workflow["segments"].append(passage)
            workflow["en_cours"] = passage
            continue

        if nom == FIN_AGENT:
            # ⚠️ OBSERVÉ SUR LE TERRAIN, ET NON DOCUMENTÉ : `SubagentStop` arrive
            # parfois SANS `SubagentStart` correspondant. Relevé le 2026-09-12 :
            # chaque `Stop` de l'agent principal (fin de tour) est suivi ~2 s plus
            # tard d'un `SubagentStop` portant un `agent_id` neuf et un
            # `agent_type` VIDE. Ce ne sont pas des sous-agents du workflow.
            #
            # Deuxième surprise du même relevé : `SubagentStop` ne porte PAS le
            # nom de l'agent (`agent_type` est vide) là où `SubagentStart` le
            # porte. L'appariement DOIT donc se faire par `agent_id`, jamais par
            # nom — et jamais « le dernier ouvert », qui attribuerait la
            # fermeture d'un intrus au vrai passage en cours.
            #
            # ⚠️ Un bornage en cycles peut couper une session PENDANT qu'un
            # passage reste ouvert (l'agent qui ouvre le cycle suivant n'attend
            # pas la fermeture du précédent). La fermeture cherche donc d'ABORD
            # dans le segment courant, PUIS dans les segments antérieurs de la
            # même session — jamais dans une autre session, et toujours par
            # `agent_id` seul.
            identifiant = evenement.get("agent_id")
            passage = None
            workflow_du_passage = None
            if identifiant:
                for candidat in reversed(workflow["passages"]):
                    if candidat["agent_id"] == identifiant and not candidat["termine"]:
                        passage = candidat
                        workflow_du_passage = workflow
                        break
                if passage is None:
                    for indice_anterieur in range(indice - 1, -1, -1):
                        autre = workflows.get((session, indice_anterieur))
                        if autre is None:
                            continue
                        for candidat in reversed(autre["passages"]):
                            if candidat["agent_id"] == identifiant and not candidat["termine"]:
                                passage = candidat
                                workflow_du_passage = autre
                                break
                        if passage is not None:
                            break
            if passage is None:
                # On la COMPTE plutôt que de l'avaler : un événement inexpliqué
                # passé sous silence deviendrait un écart invisible entre le
                # journal et le récit qu'on en tire.
                workflow["fermetures_orphelines"] += 1
                continue
            passage["fin"] = evenement["ts"]
            passage["duree_ms"] = _duree_ms(passage["debut"], passage["fin"])
            passage["termine"] = True
            passage["derniere_activite"] = evenement["ts"]
            if workflow_du_passage["en_cours"] is passage:
                workflow_du_passage["en_cours"] = None
            continue

        if nom == FIN_SESSION:
            workflow["fin"] = evenement["ts"]
            continue

        # --- événements rattachés au passage courant -------------------------
        # ⚠️ Hors passage, l'événement appartient à l'AGENT PRINCIPAL, pas à
        # personne. Les rattacher au seul passage courant faisait disparaître
        # tout son travail : sur le journal réel, 33 appels d'outils ne
        # rapportaient qu'un seul fichier. Défaut relevé en revue.
        passage = workflow["en_cours"]

        # TOUT événement qui atteint ce point est rattaché au passage courant
        # (bug-013, correctif) : un `PostToolUse` nu — sans `file`, sans échec,
        # sans commande suivie — reste de l'ACTIVITÉ OBSERVÉE. Ne rafraîchir
        # `derniere_activite` que sur les trois cas particuliers ci-dessous
        # laissait la garde de fraîcheur ignorer la forme d'événement la plus
        # fréquente du journal réel (Read, Grep, réflexion sans écriture) et
        # déclarait `sans_cloture` un agent qui travaillait toujours.
        if passage is not None:
            passage["derniere_activite"] = evenement["ts"]

        if nom == ECHEC_OUTIL:
            workflow["echecs"] += 1
            if passage is not None:
                passage["echecs"] += 1
                # C'est de l'ACTIVITÉ OBSERVÉE (bug-013) : un passage qui
                # continue d'échouer n'est pas un passage abandonné.
                passage["derniere_activite"] = evenement["ts"]
            elif workflow["principal"] is not None:
                workflow["principal"]["echecs"] += 1

        fichier = evenement.get("file")
        if fichier:
            if fichier not in workflow["fichiers"]:
                workflow["fichiers"].append(fichier)
            cible = passage if passage is not None else workflow["principal"]
            if cible is not None and fichier not in cible["fichiers"]:
                cible["fichiers"].append(fichier)
            if passage is not None:
                passage["derniere_activite"] = evenement["ts"]

        tete = evenement.get("command_head")
        if tete and tete in suivies:
            workflow["commandes"][tete] = workflow["commandes"].get(tete, 0) + 1
            if passage is not None:
                passage["commandes"].append(tete)
                passage["derniere_activite"] = evenement["ts"]

    for (session, indice), workflow in workflows.items():
        # `cycles_dans_la_session` vient du compteur final : il ne dit pas
        # combien de cycles ont EU LIEU, mais combien ce module a pu en
        # DISTINGUER avec la règle qu'on lui a donnée.
        workflow["cycles_dans_la_session"] = indice_courant[session] + 1
        if workflow["_borne_par"] is not None:
            workflow["bornage"] = BORNAGE_MARQUEUR
            workflow["borne_par"] = workflow["_borne_par"]
        elif indice == 0 and workflow["cycles_dans_la_session"] > 1:
            # Un cycle ultérieur a bien été détecté dans cette session : ce
            # segment 0 est donc réellement un « avant premier marqueur », pas
            # une session non découpée.
            workflow["bornage"] = BORNAGE_PREFIXE
            workflow["borne_par"] = None
        else:
            workflow["bornage"] = BORNAGE_SESSION
            workflow["borne_par"] = None
        del workflow["_borne_par"]

        workflow["reprises"] = _reprises(workflow["passages"])
        # ⚠️ « sans fin observée » et NON « actif ». Une session abandonnée n'émet
        # pas de `SessionEnd` : la déclarer active la laisserait éternellement en
        # cours. Le module promet en en-tête de ne pas trancher — il ne tranche
        # donc pas, il rapporte ce qu'il a vu et donne la date de la dernière
        # activité pour que l'appelant décide.
        #
        # ⚠️ AMPLIFICATION CONNUE, NON CORRIGÉE ICI : `SessionEnd` ne se
        # déclenche jamais en pratique (0 occurrence relevée sur 1563
        # événements — voir bug-002). Une session bornée en N segments affiche
        # donc SES N segments comme « sans fin observée », y compris les
        # cycles clos de longue date. Fabriquer une fin pour les segments
        # antérieurs inventerait un fait que le journal ne contient pas : ce
        # défaut appartient à `bug-002`, pas à ce correctif.
        workflow["fin_observee_absente"] = workflow["fin"] is None
        del workflow["en_cours"]
        del workflow["principal"]

        # `etat` (bug-013) — calculé APRÈS que tous les segments du workflow
        # existent, avec l'horloge et le seuil fournis par l'appelant.
        for segment in workflow["segments"]:
            segment["etat"] = _etat_segment(segment, maintenant, seuil_abandon_minutes)

        # Post-passe sur l'imbrication suspectée (bug-013) : ⚠️ L'ORDRE
        # IMPORTE — ceci doit venir APRÈS le calcul de `etat` ci-dessus.
        # Inversé, un passage tué par le runtime (jamais fermé) serait
        # requalifié en vraie imbrication au lieu d'une fin sans annonce déjà
        # expliquée par `ETAT_SANS_CLOTURE`. Ne lever le drapeau que si le
        # passage antérieur est réellement resté `ETAT_EN_COURS` — ni fermé
        # (tardivement ou non), ni `ETAT_SANS_CLOTURE`.
        workflow["imbrication_suspectee"] = any(
            candidat.get("etat") == ETAT_EN_COURS
            for candidat in workflow["_candidats_imbrication"])
        del workflow["_candidats_imbrication"]

    resultat = _Workflows(sorted(workflows.values(), key=lambda w: (w["debut"], w["indice_cycle"])))
    resultat.evenements_hors_session = hors_session
    return resultat


def _reprises(passages):
    """Agents appelés PLUSIEURS fois — la trace observable d'une boucle.

    C'est ce qui distingue un cycle nominal d'un cycle qui a rebouclé :
    `test-engineer` appelé deux fois avec un `debugger` entre les deux, c'est une
    correction. On rapporte le COMPTE, on ne qualifie pas la cause.
    """
    compte = {}
    for passage in passages:
        compte[passage["agent"]] = compte.get(passage["agent"], 0) + 1
    return {agent: n for agent, n in compte.items() if n > 1}


if __name__ == "__main__":
    import sys

    ici = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    chemin = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ici, "var", "agent-events.jsonl")
    evenements = lire_journal(chemin)
    print("%d événement(s) dans %s\n" % (len(evenements), chemin))
    print("ℹ️  un cycle mené sans agent ouvrant est rattaché au précédent\n")
    for workflow in reconstruire(evenements, ("pio test", "pio run")):
        marque = "● sans fin observée" if workflow["fin_observee_absente"] else "✓ clos"
        print("%s  %s  (%s)  bornage : %s"
              % (marque, workflow["workflow_id"], workflow["runtime"],
                 LIBELLES_BORNAGE.get(workflow["bornage"], workflow["bornage"])))
        if workflow["borne_par"]:
            print("   ouvert par : %s" % workflow["borne_par"])
        print("   début %s · dernière activité %s · %d fichier(s) au total"
              % (workflow["debut"], workflow["fin_observee"], len(workflow["fichiers"])))
        if workflow["imbrication_suspectee"]:
            print("   ⚠️  imbrication suspectée — le récit peut être incomplet")
        if workflow["fermetures_orphelines"]:
            print("   %d fin(s) de tour du runtime — ce ne sont PAS des sous-agents"
                  % workflow["fermetures_orphelines"])
        for segment in workflow["segments"]:
            # `is not None` et non la vérité de la valeur : une durée de 0 ms
            # est une durée, pas une absence de mesure.
            duree = ("%.1f s" % (segment["duree_ms"] / 1000.0)
                     if segment["duree_ms"] is not None
                     else ("en cours" if not segment["termine"] else "durée invalide"))
            extra = ("%d outil(s)  " % segment["outils"]) if segment["type"] == "principal" else ""
            print("     %-22s %-10s %s%d fichier(s)  %d échec(s)"
                  % (segment["agent"], duree, extra,
                     len(segment["fichiers"]), segment["echecs"]))
        if workflow["reprises"]:
            print("   reprises : %s" % workflow["reprises"])
        if workflow["commandes"]:
            print("   commandes suivies : %s" % workflow["commandes"])
        print()
