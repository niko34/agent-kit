#!/usr/bin/env python3
"""Collecteur d'événements du centre de contrôle — un hook Claude Code.

Lit le JSON du hook sur stdin, écrit UNE ligne JSON dans le journal en ajout
seul, et sort. Rien d'autre.

⚠️ CONTRAINTES NON NÉGOCIABLES — ce script s'exécute DANS le chemin critique de
   chaque session Claude Code, y compris la session interactive de l'utilisateur.

1. **Il ne doit jamais bloquer.** Un hook lent retarde la session ; un hook qui
   sort en code 2 ANNULE l'action observée. Ce script sort donc TOUJOURS en 0,
   quoi qu'il arrive — un journal incomplet est un désagrément, une session
   cassée est une panne.

2. **Il ne doit jamais recopier de contenu volumineux.** Ni `tool_result`, ni
   diff, ni sortie de test. Les gros volumes sont référencés par chemin, jamais
   inclus (cf. le point 15 du cahier des charges).

3. **Il ne doit jamais recopier de secret.** Une commande shell peut contenir un
   mot de passe (`curl -u admin:…`, `POOL_PASSWORD=…`). On ne conserve donc que
   les DEUX PREMIERS jetons d'une commande, et encore : le second n'est retenu
   que s'il a la forme d'une option, ou d'un mot nu derrière un programme
   connu pour porter des sous-commandes (jamais une donnée). Voir
   `redaction_commande.command_head()`, qui documente aussi les deux points
   restés ouverts (`bug-014`) : un résidu ASSUMÉ par écrit (option longue à
   valeur collée sans séparateur, bornée par la longueur du jeton) et un
   résidu FERMÉ (le décalage de position causé par un jeton écarté n'admet
   plus, en première position décalée, qu'une forme d'option ou de chemin).
   ⚠️ Un chiffre ou une majuscule N'écarte PLUS un mot nu à lui seul — cette
   ancienne garde (`bug-012`) fermait l'exemple (`hunter2`), jamais la
   classe : une passphrase entièrement en minuscules passait intégralement
   (`bug-014`).

4. **Il ne connaît rien du projet.** Aucun nom d'agent, aucun chemin de spec,
   aucune commande de test en dur : ce fichier doit survivre au déménagement vers
   le template, où les agents porteront d'autres noms. `redaction_commande`
   porte une liste de programmes GÉNÉRIQUES (`git`, `npm`, `docker`…) — ce
   n'est pas une connaissance « du projet », voir l'arbitrage écrit dans ce
   module.
"""

import json
import os
import sys
import time

# ⚠️ Import ENVELOPPÉ, PAS une copie de la règle de rédaction : un module
# manquant ou cassé ne doit jamais faire échouer ce hook (contrainte n°1), et
# une deuxième version de la même règle a déjà dérivé trois fois (`bug-012`,
# ce cycle). Repli FERMÉ : `command_head` renvoie toujours `None`, jamais une
# règle réécrite ici — un module absent perd le champ, il ne peut jamais le
# faire fuir davantage.
try:
    import redaction_commande as _RC
    _command_head = _RC.command_head
except BaseException:
    _command_head = lambda _c: None  # noqa: E731

# Le journal vit à côté du script, jamais à un chemin absolu codé en dur : le
# répertoire `control-center/` doit pouvoir être déplacé d'un bloc.
_HOOKS_DIR = os.path.dirname(os.path.abspath(__file__))
_ROOT = os.path.dirname(_HOOKS_DIR)
_JOURNAL = os.path.join(_ROOT, "var", "agent-events.jsonl")

# Champs communs à tous les hooks, repris tels quels. `agent_id`/`agent_type`
# ne sont présents que pour les sous-agents : leur ABSENCE identifie l'agent
# principal, elle n'est donc jamais remplacée par une valeur par défaut.
_PASSTHROUGH = (
    "session_id",
    "hook_event_name",
    "agent_id",
    "agent_type",
    "cwd",
    "transcript_path",
    "permission_mode",
    "prompt_id",
)

# Bornes de la ligne journalisée. `_MAX_LIGNE` est très en dessous des 8 192
# octets du tampon par défaut : c'est ce qui garantit qu'une ligne part en UN
# seul appel write() et ne peut donc pas s'entrelacer avec celle d'une autre
# session (voir l'écriture, plus bas).
# ⚠️ Le pire cas doit tenir SOUS `_MAX_LIGNE`, sinon un événement parfaitement
# légitime — tous champs au maximum — serait silencieusement PERDU. Huit champs
# repris × 512 o faisaient déjà 4 096 o à eux seuls, avant même les clés JSON.
# Défaut trouvé par mutation : retirer le plafond de ligne ne tuait aucun test,
# ce qui a mis en évidence qu'il n'était atteignable que par accident.
# 8 × 256 = 2 048 o, plus les clés et les champs d'outil : marge confortable.
_MAX_CHAMP = 256
_MAX_LIGNE = 4096

# La règle de rédaction elle-même (`_command_head` / `command_head`) vit dans
# `redaction_commande.py`, PARTAGÉE avec `backend/config.py` et
# `backend/server.py` (`bug-014`) : voir l'import enveloppé plus haut, et la
# docstring de ce module pour ce qu'elle accepte, ce qu'elle écarte, le résidu
# qu'elle assume par écrit, et celui qu'elle ferme.


def _relative_path(path, cwd):
    """Chemin relatif au dépôt, ou None s'il en sort.

    Un chemin hors du répertoire de travail n'a rien à faire dans le journal :
    il désignerait un fichier que l'interface n'a pas le droit d'afficher.
    """
    if not isinstance(path, str) or not isinstance(cwd, str):
        return None
    try:
        # Un chemin RELATIF doit être résolu contre le `cwd` de la charge, pas
        # contre celui du processus : lancé depuis un autre dépôt, le collecteur
        # enregistrerait sinon un chemin du mauvais arbre.
        if not os.path.isabs(path):
            path = os.path.join(cwd, path)
        absolute = os.path.realpath(path)
        base = os.path.realpath(cwd)
        if absolute == base or absolute.startswith(base + os.sep):
            return os.path.relpath(absolute, base)
    except (OSError, ValueError):
        pass
    return None


def _tool_details(payload):
    """Ce qu'on retient d'un appel d'outil : de quoi identifier, pas de quoi rejouer."""
    details = {}
    tool_name = payload.get("tool_name")
    if tool_name:
        details["tool"] = tool_name

    tool_input = payload.get("tool_input")
    if not isinstance(tool_input, dict):
        return details

    # ⚠️ `description` N'EST PAS journalisée, et ce n'est pas un oubli. C'est un
    # texte LIBRE rédigé par le modèle, qui recopie volontiers ce que
    # l'utilisateur a collé : une revue a produit
    # « Deployer en OTA avec le mot de passe … ». Un champ libre à côté d'un
    # champ durci annule le durcissement. `tool` et `command_head` suffisent à
    # identifier l'action.
    head = _command_head(tool_input.get("command"))
    if head:
        details["command_head"] = head

    relative = _relative_path(tool_input.get("file_path"), payload.get("cwd"))
    if relative:
        details["file"] = relative

    return details


def main():
    try:
        raw = sys.stdin.read()
    except BaseException:
        return
    if not raw.strip():
        return

    try:
        payload = json.loads(raw)
    except (ValueError, TypeError):
        return
    if not isinstance(payload, dict):
        return

    # Horodatage à la MILLISECONDE, et non à la seconde : plusieurs événements
    # tombent couramment dans la même seconde (un sous-agent qui s'achève et le
    # suivant qui démarre), et c'est leur ORDRE qui distingue une boucle de
    # correction d'un enchaînement normal. Une résolution à la seconde rendait
    # cet ordre indécidable — constaté au premier essai du collecteur.
    now = time.time()
    event = {
        "ts": "%s.%03dZ" % (
            time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(now)),
            int((now % 1) * 1000),
        ),
        # Le runtime est inscrit dès le premier événement : l'ajout d'OpenCode ne
        # doit pas exiger de relire un journal écrit sans lui (point 23).
        "runtime": "claude-code",
    }
    for key in _PASSTHROUGH:
        value = payload.get(key)
        # Borné et typé : ces valeurs viennent du runtime, mais une ligne non
        # bornée casserait l'atomicité de l'écriture (voir plus bas).
        if isinstance(value, str) and value:
            event[key] = value[:_MAX_CHAMP]

    details = _tool_details(payload)
    if details:
        event.update(details)

    # Un échec d'outil est la moitié manquante des boucles de correction : sans
    # lui, un retour `debugger → developer` ressemble à un enchaînement normal.
    if payload.get("hook_event_name") == "PostToolUseFailure":
        event["failed"] = True

    ligne = json.dumps(event, ensure_ascii=False) + "\n"
    # Filet : si malgré les bornes par champ la ligne dépasse, on ABANDONNE cet
    # événement plutôt que d'écrire une ligne qui s'entrelacerait avec celles
    # d'une autre session. Perdre un événement est réparable, corrompre le
    # journal des autres ne l'est pas.
    brut = ligne.encode("utf-8")
    if len(brut) > _MAX_LIGNE:
        return

    try:
        os.makedirs(os.path.dirname(_JOURNAL), exist_ok=True)
        # ⚠️ Écriture NON TAMPONNÉE, en un seul appel système, sur un descripteur
        # ouvert en O_APPEND.
        #
        # Le commentaire précédent invoquait PIPE_BUF : c'était faux, PIPE_BUF
        # régit les TUBES. Ce qui protège ici, c'est l'atomicité du couple
        # « décalage + écriture » de O_APPEND, et elle ne vaut que pour UN appel
        # à write(). Or `open(...,"a")` de Python est TAMPONNÉ : une ligne de
        # plus de 8 192 octets partait en plusieurs write() et pouvait
        # s'entrelacer avec celle d'une session voisine. Défaut relevé en revue.
        fd = os.open(_JOURNAL, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o644)
        try:
            os.write(fd, brut)
        finally:
            os.close(fd)
    except OSError:
        return


if __name__ == "__main__":
    try:
        main()
    except BaseException:
        # Filet de dernier recours. Aucune exception ne doit remonter : elle
        # ferait sortir le script en code non nul et polluerait la session
        # observée d'un avertissement, à chaque événement.
        pass
    # TOUJOURS 0. Voir la contrainte 1 de l'en-tête.
    sys.exit(0)
