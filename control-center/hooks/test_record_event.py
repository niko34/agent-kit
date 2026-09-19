#!/usr/bin/env python3
"""Tests du collecteur d'événements — sans dépendance, lançables tels quels.

    python3 control-center/hooks/test_record_event.py

Le cœur de ces tests est la NON-FUITE. Le collecteur reçoit toute commande shell
exécutée par Claude Code ; ce dépôt en exécute qui portent le mot de passe de
l'appareil, et `ota_update.sh` documente lui-même `POOL_PASSWORD=… ./ota_update.sh`
comme un usage normal. Un journal qui recopie les deux premiers jetons d'une
commande recopie donc ce mot de passe.

Le défaut a été constaté sur le PREMIER événement réel produit par le collecteur,
avant toute mise en service. Ces tests existent pour qu'il ne revienne pas.

VALIDATION PAR MUTATION (discipline du dépôt, cf. CLAUDE.md étape 6) — casser
`_command_head` en retirant le filtre `"=" in token or ":" in token` doit faire
mourir `test_affectation_en_tete` ET `test_identifiant_inline`. Une suite qui ne
tue pas ce mutant ne prouve rien.

⚠️ UNE PROPRIÉTÉ N'EST PAS COUVERTE ICI, et c'est assumé : l'écriture en UN SEUL
appel `os.write()` sur un descripteur `O_APPEND`. Scinder cet appel en deux ne
tue aucun test — l'entrelacement n'apparaît qu'avec plusieurs écrivains
concurrents, et un test de course serait intermittent. Un test intermittent vaut
moins que pas de test : il apprend à ignorer les échecs. La propriété tient donc
par CONSTRUCTION (un appel, pas de tampon), et ce commentaire est sa seule garde.
"""

import json
import os
import subprocess
import sys
import tempfile

_HERE = os.path.dirname(os.path.abspath(__file__))
_SCRIPT = os.path.join(_HERE, "record-event.py")
_MODULE_REDACTION = os.path.join(_HERE, "redaction_commande.py")

# Un faux secret, jamais le vrai : ce fichier est versionné.
#
# ⚠️ IL DOIT ÊTRE COURT. `_command_head()` a DEUX gardes qui écartent un jeton :
# le filtre `=`/`:` et un plafond de longueur (`_MAX_TOKEN`). Un faux secret long
# est écarté par le plafond AVANT d'atteindre le filtre — le test passe alors
# sans jamais exercer la garde qu'il prétend protéger.
#
# Constaté par mutation : avec un secret de 29 caractères, retirer entièrement le
# filtre `=`/`:` ne tuait AUCUN des deux tests de non-fuite. Un mot de passe court
# aurait fui. `POOL_PASSWORD=Pw4x` fait 17 caractères : sous le plafond, donc seul
# le filtre peut le sauver.
_SECRET = "Pw4x"

# ⚠️ SECOND faux secret, ENTIÈREMENT EN MINUSCULES, distinct de `_SECRET` — et
# c'est déterminant, pas cosmétique. Revue de code, étape 8, bloquant 2 :
# `_SECRET` porte une majuscule ET un chiffre, ce qui le fait écarter par la
# FORME du mot nu (`_MOT_NU`) avant même d'atteindre la garde que plusieurs
# tests prétendaient éprouver (l'exclusion de `echo`/`sshpass`/`curl`/`printf`
# de `_PROGRAMMES_A_SOUS_COMMANDE`, ou le plafond de longueur d'une option
# collée). `mysql -pPw4x` était DÉJÀ écarté par `_OPTION_COURTE` avant le
# correctif — le commentaire qui prétendait le contraire ("VU ÉCHOUER sur le
# code d'avant") était donc FAUX pour 3 formes sur 5, révélé par exécution
# directe contre `record-event-avant.py` (git show HEAD) en revue.
# `_SECRET_MINUSCULE` est le SEUL secret utilisé pour les cinq formes du
# symptôme (T1) : une forme entièrement en minuscules est précisément le
# titre du bug — toute autre casse fermerait la garde pour la MAUVAISE raison.
_SECRET_MINUSCULE = "hunterpass"

_echecs = []
_tests = 0


def _run(payload, journal_root):
    """Exécute le collecteur avec un journal isolé, rend (code, événements)."""
    env = dict(os.environ)
    # Le collecteur écrit à côté de lui-même ; on l'exécute donc depuis une copie
    # placée dans un arbre jetable, pour ne jamais polluer le vrai journal.
    result = subprocess.run(
        [sys.executable, os.path.join(journal_root, "hooks", "record-event.py")],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        env=env,
        # ⚠️ Répertoire courant DIFFÉRENT de celui des charges de test. Sans
        # cela, un chemin relatif résolu contre le cwd du processus donnait le
        # même résultat que résolu contre celui de la charge : le test passait
        # sans rien prouver, et retirer la résolution ne tuait aucun mutant.
        cwd=journal_root,
    )
    journal = os.path.join(journal_root, "var", "agent-events.jsonl")
    events = []
    if os.path.exists(journal):
        with open(journal, encoding="utf-8") as handle:
            events = [json.loads(line) for line in handle if line.strip()]
    return result.returncode, events


def _bash(command):
    return {
        "session_id": "t",
        "hook_event_name": "PostToolUse",
        "tool_name": "Bash",
        "cwd": "/root/esp32-pool-controller",
        "tool_input": {"command": command},
    }


def check(nom, condition, detail=""):
    global _tests
    _tests += 1
    if not condition:
        _echecs.append("%s — %s" % (nom, detail))
        print("  ECHEC  %s%s" % (nom, (" : " + detail) if detail else ""))
    else:
        print("  ok     %s" % nom)


def main():
    with tempfile.TemporaryDirectory() as tmp:
        os.makedirs(os.path.join(tmp, "hooks"))
        with open(_SCRIPT, encoding="utf-8") as src:
            source = src.read()
        with open(os.path.join(tmp, "hooks", "record-event.py"), "w", encoding="utf-8") as dst:
            dst.write(source)
        # ⚠️ Sans cette copie, `import redaction_commande` échoue dans le
        # dossier jetable et le repli d'import (`lambda _c: None`) rend TOUJOURS
        # `None` : la garde n'est alors JAMAIS exercée par ce harnais, quelle
        # que soit la commande envoyée — défaut du harnais, pas du code (voir
        # le rapport de test-engineer, bug-014, étape 7). `redaction_commande.py`
        # est la RÈGLE elle-même : ne pas la copier ici revient à tester un
        # hook qui a perdu sa garde sans le savoir.
        with open(_MODULE_REDACTION, encoding="utf-8") as src:
            source_rc = src.read()
        with open(os.path.join(tmp, "hooks", "redaction_commande.py"), "w", encoding="utf-8") as dst:
            dst.write(source_rc)

        def journal_text():
            path = os.path.join(tmp, "var", "agent-events.jsonl")
            if not os.path.exists(path):
                return ""
            with open(path, encoding="utf-8") as handle:
                return handle.read()

        # --- NON-FUITE ------------------------------------------------------
        code, events = _run(_bash("POOL_PASSWORD=%s ./ota_update.sh firmware" % _SECRET), tmp)
        check("test_affectation_en_tete — le secret n'est pas journalise",
              _SECRET not in journal_text(),
              "le journal contient le secret : %r" % events[-1].get("command_head"))
        # RE-BASÉ sur le nouveau contrat (A′, bug-014, étape 7) : ce test
        # attendait encore `./ota_update.sh firmware`, la sortie de l'ANCIENNE
        # garde (`_SECOND_JETON`). Sous A′, le premier jeton réel de la commande
        # est écarté par `=` : le jeton retenu en première position est donc
        # INCONNU (`premier_jeton = None`, résidu 2 fermé sur la CLASSE), et un
        # mot nu derrière un premier jeton inconnu ne peut plus jamais être admis
        # comme sous-commande — perte d'observation ASSUMÉE par écrit (A5,
        # `redaction_commande.py`). Ce n'est pas un assouplissement du test :
        # c'est le comportement voulu, vérifié par exécution directe avant ce
        # correctif (voir rapport test-engineer).
        check("test_affectation_en_tete — l'info utile survit (contrat A′)",
              events[-1].get("command_head") == "./ota_update.sh",
              "obtenu %r" % events[-1].get("command_head"))

        _run(_bash("curl -u admin:%s http://192.168.1.48/" % _SECRET), tmp)
        check("test_identifiant_inline — le secret n'est pas journalise",
              _SECRET not in journal_text())

        # Le plafond de longueur est la SECONDE ligne de défense : il écarte un
        # jeton qui ne porte ni `=` ni `:` mais reste manifestement une donnée et
        # non un nom de programme — un jeton d'API collé en argument, par exemple.
        # ⚠️ CORRECTIF (sweep étape 7bis) : cette affirmation était FAUSSE pour ce
        # cas précis. `long_token` porte des chiffres, donc `_admis_en_seconde_
        # position` le rejette déjà via `_MOT_NU` (et via l'appartenance de
        # `./deploy.sh` à `_PROGRAMMES_A_SOUS_COMMANDE`, qui est fausse de toute
        # façon) — neutraliser `_MAX_TOKEN` seul NE TUE PAS ce test (revérifié
        # par mutation). Ce cas reste utile en défense-en-profondeur (`=`/`:`
        # absents ET forme non admise), mais N'ISOLE PAS le plafond de longueur :
        # c'est `test_plafond_longueur_en_seconde_position_derriere_programme_
        # connu` (plus bas) qui le fait, avec un second jeton PUREMENT alphabétique
        # derrière un premier jeton du programme `_PROGRAMMES_A_SOUS_COMMANDE`.
        long_token = "s3cr3t" * 6  # 36 caractères, ni "=" ni ":"
        _, events = _run(_bash("./deploy.sh %s" % long_token), tmp)
        check("test_jeton_trop_long_ecarte",
              long_token not in journal_text() and events[-1].get("command_head") == "./deploy.sh",
              "obtenu %r" % events[-1].get("command_head"))

        # Second jeton POSITIONNEL : ni `=`, ni `:`, ni 24 caractères — les deux
        # premières gardes le laissaient passer. Prouvé en revue sur
        # `echo hunter2 | sudo -S reboot`.
        # ⚠️ Faux secret en MINUSCULES ici (sweep du bloquant 2, étape 7bis) :
        # avec `_SECRET` ("Pw4x"), le rejet vient de la FORME du mot nu
        # (majuscule + chiffre), jamais de l'exclusion d'`echo` de
        # `_PROGRAMMES_A_SOUS_COMMANDE` — ce test ne prouvait alors rien de
        # plus que `_MOT_NU`, déjà couvert ailleurs. Constaté par mutation :
        # ajouter `echo` à la liste blanche ne tuait pas ce test avec `_SECRET`.
        _, events = _run(_bash("echo %s | sudo -S reboot" % _SECRET_MINUSCULE), tmp)
        check("test_second_jeton_positionnel_ecarte",
              _SECRET_MINUSCULE not in journal_text() and events[-1].get("command_head") == "echo",
              "obtenu %r" % events[-1].get("command_head"))

        # Assertions ÉPINGLÉES cas par cas (pas une seule assertion d'ensemble) :
        # une propriété globale ("toutes survivent") laisserait passer une
        # permutation entre deux commandes sans qu'aucun test ne le remarque.
        #
        # `./ota_update.sh firmware` RE-BASÉ sur A′ (bug-014, étape 7) : la liste
        # `_PROGRAMMES_A_SOUS_COMMANDE` ne contient QUE des noms de programmes
        # GÉNÉRIQUES (contrainte n°4, "il ne connaît rien du projet") — un chemin
        # de script du projet (`./ota_update.sh`) n'y figure JAMAIS, sous-commande
        # ou pas. Perte d'observation assumée par écrit (design A′, item A2).
        for cmd, attendu in (("pio test -e native", "pio test"),
                              ("git commit -F /tmp/m", "git commit"),
                              ("./ota_update.sh firmware 1.2.3.4", "./ota_update.sh"),
                              ("python3 -c import os", "python3 -c")):
            _, events = _run(_bash(cmd), tmp)
            check("test_sous_commande_normale_survit_a_la_regle_de_forme[%s]" % cmd,
                  events[-1].get("command_head") == attendu,
                  "attendu %r, obtenu %r" % (attendu, events[-1].get("command_head")))

        # `description` est LIBRE et rédigée par le modèle : elle recopie
        # volontiers ce que l'utilisateur a collé. Un champ libre à côté d'un
        # champ durci annule le durcissement — fuite démontrée en revue.
        _, events = _run({
            "session_id": "t", "hook_event_name": "PostToolUse", "tool_name": "Bash",
            "cwd": "/root/esp32-pool-controller",
            "tool_input": {"command": "pio test",
                           "description": "Deployer en OTA avec le mot de passe %s" % _SECRET},
        }, tmp)
        check("test_description_jamais_journalisee",
              _SECRET not in journal_text() and "description" not in events[-1],
              "événement : %r" % events[-1])

        # Une ligne non bornée casserait l'atomicité de l'écriture en ajout.
        avant = len(journal_text().splitlines())
        _run({"session_id": "t" * 5000, "hook_event_name": "Stop"}, tmp)
        apres = len(journal_text().splitlines())
        check("test_champ_demesure_borne_et_ligne_ecrite", apres == avant + 1,
              "un champ démesuré doit être tronqué, pas faire perdre l'événement")
        # Un événement LÉGITIME dont tous les champs repris sont au maximum doit
        # être écrit, pas écarté par le plafond de ligne.
        # 5 000 caractères par champ : bien au-delà de toute borne plausible, pour
        # que le pire cas EXERCE réellement le rapport `_MAX_CHAMP` × nombre de
        # champs / `_MAX_LIGNE`. Avec 400, le test passait quelle que soit la
        # borne — il ne prouvait rien (constaté par mutation).
        maximal = {c: "x" * 5000 for c in ("session_id", "hook_event_name", "agent_id",
                                          "agent_type", "cwd", "transcript_path",
                                          "permission_mode", "prompt_id")}
        avant2 = len(journal_text().splitlines())
        _run(maximal, tmp)
        check("test_evenement_maximal_n_est_pas_perdu",
              len(journal_text().splitlines()) == avant2 + 1,
              "le pire cas de champs bornés doit tenir sous le plafond de ligne")

        check("test_ligne_reste_sous_le_plafond",
              all(len(l.encode("utf-8")) <= 4096 for l in journal_text().splitlines()),
              "une ligne dépasse le plafond : elle pourrait s'entrelacer")

        # --- CHEMINS --------------------------------------------------------
        payload_relatif = {
            "session_id": "t", "hook_event_name": "PostToolUse", "tool_name": "Edit",
            "cwd": "/root/esp32-pool-controller",
            "tool_input": {"file_path": "src/main.cpp"},
        }
        _, events = _run(payload_relatif, tmp)
        check("test_chemin_relatif_resolu_contre_le_cwd_de_la_charge",
              events[-1].get("file") == "src/main.cpp",
              "résolu contre le cwd du PROCESSUS, il désignerait un autre arbre ; obtenu %r"
              % events[-1].get("file"))

        payload = {
            "session_id": "t", "hook_event_name": "PostToolUse", "tool_name": "Edit",
            "cwd": "/root/esp32-pool-controller",
            "tool_input": {"file_path": "/etc/passwd"},
        }
        _, events = _run(payload, tmp)
        check("test_chemin_hors_depot_rejete", "file" not in events[-1],
              "un chemin hors du depot a ete journalise : %r" % events[-1].get("file"))

        payload["tool_input"]["file_path"] = "/root/esp32-pool-controller/src/main.cpp"
        _, events = _run(payload, tmp)
        check("test_chemin_interne_relativise", events[-1].get("file") == "src/main.cpp",
              "obtenu %r" % events[-1].get("file"))

        # --- ROBUSTESSE : le hook ne doit JAMAIS faire echouer la session ----
        for nom, entree in (("json_invalide", "pas du json"), ("entree_vide", "")):
            result = subprocess.run(
                [sys.executable, os.path.join(tmp, "hooks", "record-event.py")],
                input=entree, text=True, capture_output=True)
            check("test_%s — code de retour 0" % nom, result.returncode == 0,
                  "code %d" % result.returncode)

        # --- ORDRE : la resolution doit separer deux evenements consecutifs --
        before = len(journal_text().splitlines())
        for i in range(3):
            _run(_bash("pio test"), tmp)
        horodatages = [json.loads(l)["ts"] for l in journal_text().splitlines()[before:]]
        check("test_horodatage_strictement_croissant",
              all(a < b for a, b in zip(horodatages, horodatages[1:])),
              "ordre indecidable : %r" % horodatages)

        # --- ABSENCE ≠ VALEUR (ADR-0072 du depot) ---------------------------
        _, events = _run(_bash("A=1 B=2"), tmp)
        check("test_commande_entierement_filtree_absente_du_journal",
              "command_head" not in events[-1],
              "une commande sans jeton sur doit OMETTRE le champ, pas ecrire une chaine vide")

        _, events = _run({"session_id": "t", "hook_event_name": "SubagentStart",
                          "agent_type": "test-engineer", "agent_id": "a9"}, tmp)
        check("test_sous_agent_identifie",
              events[-1].get("agent_type") == "test-engineer" and events[-1].get("agent_id") == "a9")

        _, events = _run({"session_id": "t", "hook_event_name": "Stop"}, tmp)
        check("test_agent_principal_sans_agent_id",
              "agent_id" not in events[-1] and "agent_type" not in events[-1],
              "l'absence d'agent_id IDENTIFIE l'agent principal : ne jamais la combler")

        # --- T1 : une forme par symptôme (bug-014), VU ÉCHOUER sur le code
        # d'avant le correctif — RÉÉPROUVÉ en étape 7bis après un bloquant de
        # revue (étape 8) : le commentaire précédent affirmait un rouge JAMAIS
        # observé pour 3 formes sur 5 (`mysql`/`sshpass`/`curl` avec `_SECRET`
        # "Pw4x" étaient DÉJÀ écartées AVANT le correctif par `_OPTION_COURTE`,
        # le chiffre et la majuscule ne changeant rien à cette garde-là — le
        # défaut n'a RIEN à voir avec la forme, il tient à la LONGUEUR de
        # l'option collée). Mesure réelle, exécutée contre
        # `git show HEAD:control-center/hooks/record-event.py` (le fichier
        # d'avant ce cycle), avec `_SECRET_MINUSCULE` ("hunterpass") :
        #
        #   mysql -phunterpass -h db          -> 'mysql -phunterpass'   FUITE
        #   sshpass -phunterpass ssh host     -> 'sshpass -phunterpass' FUITE
        #   curl -uhunterpass http://x        -> 'curl -uhunterpass'    FUITE
        #   echo hunterpass | sudo -S reboot  -> 'echo hunterpass'      FUITE
        #   printf hunterpass > f             -> 'printf hunterpass'   FUITE
        #
        # Les CINQ fuient sur le code d'avant avec ce secret. `_SECRET_MINUSCULE`
        # est donc le SEUL secret utilisé ici, pour les CINQ formes : un secret
        # avec majuscule ou chiffre fermerait certaines gardes pour la MAUVAISE
        # raison (voir la note sur `_SECRET_MINUSCULE` plus haut, et le sweep
        # qui a aussi corrigé `test_second_jeton_positionnel_ecarte` pour la
        # même cause).
        for cmd, attendu, nom in (
            ("mysql -p%s -h db" % _SECRET_MINUSCULE, "mysql", "option_courte_collee_mysql"),
            ("sshpass -p%s ssh host" % _SECRET_MINUSCULE, "sshpass", "option_courte_collee_sshpass"),
            ("curl -u%s http://x" % _SECRET_MINUSCULE, "curl", "option_courte_collee_curl"),
            ("echo %s | sudo -S reboot" % _SECRET_MINUSCULE, "echo", "mot_nu_via_pipe"),
            ("printf %s > f" % _SECRET_MINUSCULE, "printf", "mot_nu_via_redirection"),
        ):
            _, events = _run(_bash(cmd), tmp)
            check("test_symptome_%s" % nom,
                  _SECRET_MINUSCULE not in journal_text()
                  and events[-1].get("command_head") == attendu,
                  "attendu %r, obtenu %r" % (attendu, events[-1].get("command_head")))

        # --- mot nu NON décalé : ni majuscule ni chiffre, même derrière un
        # programme connu (`_PROGRAMMES_A_SOUS_COMMANDE`). Trouvé SURVIVANT
        # par mutation : élargir `_MOT_NU` à `[A-Za-z][A-Za-z0-9-]*` ne tuait
        # AUCUN test existant — les tests de résidu 2 n'exercent cette
        # exclusion que sur le chemin DÉCALÉ (`_admis_comme_premier_jeton_decale`,
        # où `premier_jeton` est déjà `None`), jamais sur le chemin NORMAL
        # (`_admis_en_seconde_position`, `premier_jeton` connu). Sans ce test,
        # `git Status` ou `git 4a0d9ce` (l'exemple même de la docstring)
        # auraient pu passer pour une sous-commande sans qu'aucune suite ne le
        # remarque.
        for cmd, attendu in (
            ("git Status", "git"),
            ("git status4", "git"),
            ("git 4a0d9ce", "git"),
        ):
            _, events = _run(_bash(cmd), tmp)
            check("test_mot_nu_normal_rejette_majuscule_et_chiffre[%s]" % cmd,
                  events[-1].get("command_head") == attendu,
                  "attendu %r, obtenu %r" % (attendu, events[-1].get("command_head")))

        # --- T2 : non-régression sur les grappes de drapeaux légitimes ------
        for cmd, attendu in (
            ("git status", "git status"),
            ("npm run build", "npm run"),
            ("docker ps", "docker ps"),
            ("pio test", "pio test"),
            ("grep -rn TODO src", "grep -rn"),
            ("ls -la /tmp", "ls -la"),
            ("rm -rf build", "rm -rf"),
            ("python3 -c import os", "python3 -c"),
            ("node --check app.js", "node --check"),
        ):
            _, events = _run(_bash(cmd), tmp)
            check("test_non_regression[%s]" % cmd,
                  events[-1].get("command_head") == attendu,
                  "attendu %r, obtenu %r" % (attendu, events[-1].get("command_head")))

        # --- T2bis : les BORNES de l'option courte (marge de 4 caractères) --
        # `_OPTION_COURTE` accepte 1 ou 2 lettres après le tiret ; la plus
        # courte forme du symptôme (`-uadmin`) en fait 6 : la marge posée par
        # le design est de 4 caractères, pas seulement "le symptôme est
        # écarté". `-rln` (3 lettres) doit tomber, `-uadmin` (6 lettres) aussi.
        for cmd, attendu in (
            ("grep -c TODO src", "grep -c"),      # 1 lettre : gardé
            ("grep -rn TODO src", "grep -rn"),    # 2 lettres : gardé
            ("grep -rln TODO src", "grep"),       # 3 lettres : rejeté
            ("curl -uadmin http://x", "curl"),    # 6 lettres (valeur collée) : rejeté
        ):
            _, events = _run(_bash(cmd), tmp)
            check("test_borne_option_courte[%s]" % cmd,
                  events[-1].get("command_head") == attendu,
                  "attendu %r, obtenu %r" % (attendu, events[-1].get("command_head")))

        # --- plafond de longueur en SECONDE position derrière un programme à
        # sous-commande : sans _MAX_TOKEN, un jeton tout en minuscules mais
        # démesuré (un nom de branche, un jeton) serait admis par la seule
        # règle "mot nu + programme connu" (`_admis_en_seconde_position`) —
        # constaté par mutation : neutraliser `_MAX_TOKEN` seul ne tue AUCUN
        # test existant tant que le second jeton contient un chiffre. Ce test
        # comble le trou : premier jeton connu, second jeton PUREMENT
        # alphabétique et démesuré.
        jeton_demesure_alpha = "a" * 30
        _, events = _run(_bash("git %s" % jeton_demesure_alpha), tmp)
        check("test_plafond_longueur_en_seconde_position_derriere_programme_connu",
              events[-1].get("command_head") == "git",
              "un second jeton démesuré mais alphabétique a été admis derrière "
              "un programme connu : obtenu %r" % events[-1].get("command_head"))

        # --- T3bis : résidus NOMMÉS, exigés par la condition 2 du GATE P2 ---
        # Résidu 1 — ASSUMÉ par écrit (module + README) : une option longue à
        # valeur collée sans séparateur passe encore. Ce test ne le "corrige"
        # pas : il le CONSTATE et documente que c'est un choix écrit, pas un
        # oubli (voir `redaction_commande.py`, section "Résidu 1").
        # ⚠️ Faux secret sans CHIFFRE ici, volontairement : `_OPTION_LONGUE`
        # n'admet que des lettres/tirets. `_SECRET` ("Pw4x") porte un chiffre
        # et casserait la forme d'option longue — ce serait alors une fausse
        # démonstration du résidu (le chiffre le fermerait pour la mauvaise
        # raison, pas la garde).
        _faux_mdp_lettres = "abcxyz"
        _, events = _run(_bash("curl --password%s http://x" % _faux_mdp_lettres), tmp)
        check("test_residu_1_option_longue_collee_ASSUME",
              events[-1].get("command_head") == "curl --password%s" % _faux_mdp_lettres,
              "résidu 1 : si ce test casse, le résidu ASSUMÉ a été fermé sans "
              "mise à jour de la docstring qui le documente comme ouvert — "
              "obtenu %r" % events[-1].get("command_head"))

        # Résidu 2 — FERMÉ sur la CLASSE (pas seulement sur l'exemple qui avait
        # sauvé `bug-012`) : une majuscule ou un chiffre ne doit plus faire
        # traverser le jeton décalé.
        for cmd in (
            "A=b Hunterpass",
            "a:b hunter_pass",
            ("%s hunterpass2" % ("x" * 25)),
        ):
            _, events = _run(_bash(cmd), tmp)
            check("test_residu_2_ferme_sur_la_classe[%s]" % cmd,
                  "command_head" not in events[-1],
                  "un jeton décalé porteur d'une majuscule ou d'un chiffre a "
                  "traversé le filtre : %r" % events[-1].get("command_head"))

        # --- CINQUIÈME forme (revue de code, étape 8, bloquant 1, fermée en
        # étape 5ter) : le décalage INTERCALAIRE. Un écart (`=`, `:`, ou
        # longueur) survenant ENTRE la position 1 (déjà établie SANS écart) et
        # la position 2 ne devait PAS laisser survivre le passe-droit de
        # sous-commande du VRAI premier jeton — `git PASSWORD=x hunterpass`
        # devenait `git hunterpass` : le second jeton, qui est le SECRET, était
        # admis comme sous-commande de `git` alors que rien ne le distingue
        # plus d'une donnée une fois un jeton déjà écarté après lui. Un test
        # par DÉCLENCHEUR d'écart (`=`, `:`, longueur), sur plusieurs
        # programmes de `_PROGRAMMES_A_SOUS_COMMANDE` — pas un seul, pour ne
        # pas confondre "ce programme précis" et "la garde elle-même".
        for cmd in (
            "git PASSWORD=x %s" % _SECRET_MINUSCULE,     # écart par "="
            "docker TOKEN=y %s" % _SECRET_MINUSCULE,     # écart par "=", programme différent
            "pip x:y %s" % _SECRET_MINUSCULE,            # écart par ":"
            "npm a:b %s" % _SECRET_MINUSCULE,            # écart par ":", programme différent
            "git %s %s" % ("z" * 25, _SECRET_MINUSCULE),  # écart par longueur
        ):
            _, events = _run(_bash(cmd), tmp)
            check("test_residu_2_ferme_le_decalage_intercalaire[%s]" % cmd,
                  _SECRET_MINUSCULE not in journal_text()
                  and events[-1].get("command_head") == cmd.split()[0],
                  "le passe-droit de sous-commande du premier jeton a survécu "
                  "à un écart survenu APRÈS lui : obtenu %r"
                  % events[-1].get("command_head"))

        # --- T3ter : quatrième résidu (GATE P2, re-verdict), resserré -------
        # `.hunterpass` n'a l'apparence d'AUCUN chemin réel (pas de barre) —
        # seul `/`, `./`, `../` doivent faire passer un jeton décalé.
        _, events = _run(_bash("A=b .%s" % _SECRET), tmp)
        check("test_residu_4_point_seul_sans_barre_ferme",
              "command_head" not in events[-1],
              "un point seul sans barre (`.%s`) a été admis comme apparence "
              "de chemin : %r" % (_SECRET, events[-1].get("command_head")))
        # Non-régression du resserrage : un VRAI chemin relatif décalé reste
        # admis, et le cas nominal `_lancer()`/D3 continue de fonctionner.
        _, events = _run(_bash("POOL_PASSWORD=%s ./ota_update.sh firmware" % _SECRET), tmp)
        check("test_residu_4_ne_casse_pas_le_chemin_relatif_decale",
              events[-1].get("command_head") == "./ota_update.sh",
              "obtenu %r" % events[-1].get("command_head"))

    # --- D4 : repli d'import (condition 3 du GATE P1) — clone SANS le module
    with tempfile.TemporaryDirectory() as tmp_sans_module:
        os.makedirs(os.path.join(tmp_sans_module, "hooks"))
        with open(_SCRIPT, encoding="utf-8") as src:
            with open(os.path.join(tmp_sans_module, "hooks", "record-event.py"), "w",
                      encoding="utf-8") as dst:
                dst.write(src.read())
        # `redaction_commande.py` n'est PAS copié ici : c'est le scénario
        # "module absent" que le repli d'import doit couvrir.
        code, events = _run(_bash("git status"), tmp_sans_module)
        check("test_module_redaction_absent_sort_en_0", code == 0,
              "un module manquant ne doit jamais faire échouer le hook (code %d)" % code)
        check("test_module_redaction_absent_omet_command_head",
              "command_head" not in events[-1],
              "repli = perte du champ, jamais une règle réécrite sur place : "
              "obtenu %r" % events[-1])

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for echec in _echecs:
        print("  - %s" % echec)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
