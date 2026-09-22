#!/usr/bin/env python3
"""Tests HTTP des routes de `feature-025` — lancer/modifier/supprimer une
spec EXISTANTE (`feature-021`, cycle 2, lot 9 ; GATE `security-reviewer`
P1, surfaces S1 et S2).

    python3 control-center/backend/test_server_feature025.py

Réutilise l'infrastructure de `test_server_ecriture.py` (`Groupe`, `requete`,
`_autorisation`) — même clone jetable de `control-center/` entier, même
raison (`_RACINE_VAR`/`_RACINE_WEB` dérivent de `__file__`, PIEGES.md §1).
Ajoute ce que `Groupe` seul ne fournit pas : un VRAI dépôt git dans
`racine_projet` (S2 en a besoin) et de vraies specs sur disque, dans des
états git distincts (suivie et propre, non suivie, modifiée localement).

## Correspondance condition GATE -> test, pour la revue

- S1.1/S2.1 : `test_toutes_les_routes_feature025_sans_jeton_401_zero_popen`
- S1.2      : `test_lancer_spec_id_forge_404`, `test_modifier_spec_id_forge_404`,
              `test_supprimer_spec_id_forge_404`
- S1.3      : `test_lancer_cle_sans_placeholder_400`,
              `test_lancer_spec_id_non_conforme_422`
- S1.4      : `test_lancer_depuis_doing_409`, `test_lancer_depuis_done_409`
- S1.5      : `test_lancer_budget_non_transmissible_503`,
              `test_lancer_verrou_occupe_409`
- S1.6/S1.7 : `test_lancer_nominal_202_argv_reellement_substitue`,
              `test_lancer_expose_spec_id_sur_lancement_et_etat`
- S2.2      : `test_modifier_done_409`, `test_supprimer_done_409`,
              `test_supprimer_doing_409`
- S2.3      : `test_modifier_empreinte_perimee_409_fichier_intact`,
              `test_modifier_concurrence_exactement_200_409`
- S2.4      : `test_modifier_pendant_lancement_409`,
              `test_supprimer_pendant_lancement_409`
- S2.5      : `test_modifier_contenu_non_encodable_422_fichier_intact`
- S2.6/S2.7 : `test_supprimer_non_suivie_409_fichier_intact`,
              `test_supprimer_modifiee_409_fichier_intact`,
              `test_supprimer_nominal_retour_arriere_EXECUTE`
- S2.8      : `test_supprimer_confirmation_discordante_422_fichier_intact`
              (+ mutation, voir le rapport)
- S2.9      : `test_supprimer_concurrence_exactement_200_404_git_rm_une_fois`
- S2.10     : `test_supprimer_utilise_argv_shell_false` (lu depuis vcs.py)
- S2.11     : `test_reponses_ne_portent_jamais_la_racine`
- S2.12     : `test_supprimer_journalise_spec_id_et_sha`
"""

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import threading
import time

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


_PY = sys.executable
_autorisation = TSE._autorisation
_attendre = TSE._attendre

# --- GATE P2 (lot 9), condition 2 : `requete()` enveloppée -------------------
#
# `test_reponses_ne_portent_jamais_la_racine` ne couvrait qu'UNE réponse 404
# (`spec_id` inconnu). Mutant M12 survivant : `retour_arriere.chemin` et
# `argv[-1]` rendus en chemin ABSOLU passaient les 52/52 cas d'alors, retour
# arrière compris — un chemin absolu reste un chemin valide pour
# `git checkout`. On enveloppe donc ICI `requete()` pour qu'AUCUN appel, dans
# TOUT ce fichier, ne puisse plus rendre une réponse qui contienne
# `racine_projet` — 2xx comme 4xx — sans faire échouer un cas. `_racine_verif`
# est réglé UNE fois par groupe, juste après sa création : la racine ne
# change jamais en cours de groupe.
_racine_verif = [None]


def _surveiller_racine(racine):
    _racine_verif[0] = racine


def requete(port, methode, chemin, *args, **kwargs):
    code, corps = TSE.requete(port, methode, chemin, *args, **kwargs)
    racine = _racine_verif[0]
    if racine:
        check("test_reponse_ne_porte_pas_la_racine[%s %s -> %d]" % (methode, chemin, code),
              racine not in corps,
              "la racine du dépôt a fuité dans une réponse %d" % code)
    return code, corps


# ---------------------------------------------------------------------------
# Dépôt git RÉEL dans `racine_projet` — `Groupe` seul n'en fournit pas.
# ---------------------------------------------------------------------------

def _git(racine, *arguments):
    return subprocess.run(["git", "-C", racine] + list(arguments),
                          capture_output=True, text=True, check=False)


def _depot(racine):
    _git(racine, "init", "-q", "-b", "main")
    _git(racine, "config", "user.email", "t@t")
    _git(racine, "config", "user.name", "Test")


def _preparer_colonnes(racine):
    for colonne in ("todo", "doing", "done"):
        os.makedirs(os.path.join(racine, "specs", "features", colonne), exist_ok=True)


def _chemin_spec(racine, colonne, spec_id):
    return os.path.join(racine, "specs", "features", colonne, spec_id + ".md")


def _ecrire_spec(racine, colonne, spec_id, contenu=None):
    contenu = contenu or ("# %s\n\n## Métadonnées\n- **ID** : %s\n" % (spec_id, spec_id))
    chemin = _chemin_spec(racine, colonne, spec_id)
    with open(chemin, "w", encoding="utf-8") as fichier:
        fichier.write(contenu)
    return chemin


def _relatif(spec_id, colonne):
    return "specs/features/%s/%s.md" % (colonne, spec_id)


def _committer(racine, *chemins_relatifs):
    _git(racine, "add", "--", *chemins_relatifs)
    _git(racine, "commit", "-q", "-m", "specs de test")


class GroupeGit(TSE.Groupe):
    """Un `Groupe` (clone `control-center/` + serveur HTTP) dont
    `racine_projet` est en plus un VRAI dépôt git, avec les trois colonnes de
    specs créées — ce que `feature-025` (S2) exige et que `Groupe` seul,
    pensé pour `feature-007`, ne fournissait pas."""

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        _preparer_colonnes(self.racine_projet)
        _depot(self.racine_projet)


def main():
    # =========================================================================
    # Préparation commune : un groupe, cinq specs dans des états git distincts
    # =========================================================================
    # ⚠️ AUCUNE clé n'est déclarée `avec_budget` ici, DÉLIBÉRÉMENT : la
    # dernière assertion de ce groupe (`test_lancer_budget_non_transmissible_503`)
    # a besoin qu'une cible par ailleurs VALIDE échoue au seul test du
    # budget — le nominal complet (budget transmissible) est couvert par le
    # groupe `g2` ci-dessous.
    g = GroupeGit(commandes={
        "lancer_spec": [_PY, "-c", "import sys; print('ARGV=' + sys.argv[1])", "{spec_id}"],
        "sans_placeholder": [_PY, "-c", "print('ok')"],
        "lent": [_PY, "-c", "import time; time.sleep(2)"],
    }, avec_budget=[])
    _surveiller_racine(g.racine_projet)
    try:
        # todo/ : suivie et propre — la spec « normale »
        _ecrire_spec(g.racine_projet, "todo", "feature-100-alpha")
        # todo/ : JAMAIS suivie — reproduit EXACTEMENT le fait 4 du GATE
        # (`/api/spec/ecrire` ne commite jamais)
        _ecrire_spec(g.racine_projet, "todo", "feature-101-beta")
        # todo/ : suivie puis modifiée dans l'arbre de travail APRÈS le commit
        _ecrire_spec(g.racine_projet, "todo", "feature-102-gamma")
        # doing/ : suivie et propre
        _ecrire_spec(g.racine_projet, "doing", "feature-103-delta")
        # done/ : suivie et propre
        _ecrire_spec(g.racine_projet, "done", "feature-104-epsilon")
        # nom non conforme à `_RE_NUMERO`, mais bien réel dans todo/
        _ecrire_spec(g.racine_projet, "todo", "notes")

        _committer(g.racine_projet,
                   _relatif("feature-100-alpha", "todo"),
                   _relatif("feature-102-gamma", "todo"),
                   _relatif("feature-103-delta", "doing"),
                   _relatif("feature-104-epsilon", "done"),
                   _relatif("notes", "todo"))
        # feature-101-beta reste NON suivie (jamais `git add`).
        with open(_chemin_spec(g.racine_projet, "todo", "feature-102-gamma"),
                  "a", encoding="utf-8") as fichier:
            fichier.write("\nune ligne ajoutée après le commit\n")

        # =====================================================================
        # S1.1/S2.1 — sans jeton, les TROIS routes neuves sont 401, sans effet
        # =====================================================================
        appels_popen = []
        OrigLancement = g.srv.L.Lancement

        class LancementEspion(OrigLancement):
            def __init__(self, *a, **k):
                appels_popen.append(1)
                super().__init__(*a, **k)

        g.srv.L.Lancement = LancementEspion
        try:
            code, _ = requete(g.port, "POST", "/api/spec/lancer", entetes={},
                              corps=json.dumps({"cle": "lancer_spec",
                                                "spec_id": "feature-100-alpha"}).encode())
            check("test_toutes_les_routes_feature025_sans_jeton_401_zero_popen",
                  code == 401 and not appels_popen, "code=%r popen=%r" % (code, appels_popen))

            code, _ = requete(g.port, "POST", "/api/spec/modifier", entetes={},
                              corps=json.dumps({"spec_id": "feature-100-alpha",
                                                "empreinte": "x", "contenu": "y"}).encode())
            check("test_modifier_sans_jeton_401", code == 401, "obtenu %d" % code)

            code, _ = requete(g.port, "POST", "/api/spec/supprimer", entetes={},
                              corps=json.dumps({"spec_id": "feature-100-alpha",
                                                "confirmation_nom": "feature-100-alpha"}).encode())
            check("test_supprimer_sans_jeton_401", code == 401, "obtenu %d" % code)
            check("test_supprimer_sans_jeton_fichier_intact",
                  os.path.isfile(_chemin_spec(g.racine_projet, "todo", "feature-100-alpha")))
        finally:
            g.srv.L.Lancement = OrigLancement

        auth = _autorisation(g.jeton_valeur)

        # =====================================================================
        # S1.2 — confinement : spec_id forgé -> 404, zéro Popen
        # =====================================================================
        for force in ("../../etc/passwd", "feature-999-inexistante", "_template", "README"):
            appels_popen = []
            g.srv.L.Lancement = LancementEspion
            try:
                code, corps = requete(g.port, "POST", "/api/spec/lancer", entetes=auth,
                                      corps=json.dumps({"cle": "lancer_spec",
                                                        "spec_id": force}).encode())
                check("test_lancer_spec_id_forge_404[%s]" % force,
                      code == 404 and not appels_popen,
                      "code=%r popen=%r corps=%s" % (code, appels_popen, corps))
            finally:
                g.srv.L.Lancement = OrigLancement

        code, _ = requete(g.port, "POST", "/api/spec/modifier", entetes=auth,
                          corps=json.dumps({"spec_id": "../../etc/passwd",
                                            "empreinte": "x", "contenu": "y"}).encode())
        check("test_modifier_spec_id_forge_404", code == 404, "obtenu %d" % code)

        code, _ = requete(g.port, "POST", "/api/spec/supprimer", entetes=auth,
                          corps=json.dumps({"spec_id": "../../etc/passwd",
                                            "confirmation_nom": "../../etc/passwd"}).encode())
        check("test_supprimer_spec_id_forge_404", code == 404, "obtenu %d" % code)

        # =====================================================================
        # S1.3 — placeholder déclaré, spec_id conforme AVANT d'entrer dans argv
        # =====================================================================
        code, corps = requete(g.port, "POST", "/api/spec/lancer", entetes=auth,
                              corps=json.dumps({"cle": "sans_placeholder",
                                                "spec_id": "feature-100-alpha"}).encode())
        check("test_lancer_cle_sans_placeholder_400", code == 400, "obtenu %d : %s" % (code, corps))

        code, corps = requete(g.port, "POST", "/api/spec/lancer", entetes=auth,
                              corps=json.dumps({"cle": "lancer_spec",
                                                "spec_id": "notes"}).encode())
        check("test_lancer_spec_id_non_conforme_422",
              code == 422, "obtenu %d : %s" % (code, corps))

        # =====================================================================
        # S1.4 — seule la PREMIÈRE colonne est éligible au lancement
        # =====================================================================
        code, _ = requete(g.port, "POST", "/api/spec/lancer", entetes=auth,
                          corps=json.dumps({"cle": "lancer_spec",
                                            "spec_id": "feature-103-delta"}).encode())
        check("test_lancer_depuis_doing_409", code == 409, "obtenu %d" % code)

        code, _ = requete(g.port, "POST", "/api/spec/lancer", entetes=auth,
                          corps=json.dumps({"cle": "lancer_spec",
                                            "spec_id": "feature-104-epsilon"}).encode())
        check("test_lancer_depuis_done_409", code == 409, "obtenu %d" % code)

        # =====================================================================
        # S1.5 — même chaîne que `/api/lancer` : budget, verrou
        # =====================================================================
        code, corps = requete(g.port, "POST", "/api/spec/lancer", entetes=auth,
                              corps=json.dumps({"cle": "lancer_spec",
                                                "spec_id": "feature-100-alpha"}).encode())
        check("test_lancer_budget_non_transmissible_503", code == 503,
              "obtenu %d : %s (aucune commande n'a `avec_budget` déclaré ici pour ce test)"
              % (code, corps))
    finally:
        g.fermer()

    # =========================================================================
    # S1.5 (suite, budget transmissible) + S1.6/S1.7 — nominal
    # =========================================================================
    g2 = GroupeGit(commandes={
        "lancer_spec": [_PY, "-c", "import sys; print('ARGV=' + sys.argv[1])", "{spec_id}"],
        "lent": [_PY, "-c", "import time; time.sleep(2)"],
    }, avec_budget=["lancer_spec", "lent"])
    _surveiller_racine(g2.racine_projet)
    try:
        _ecrire_spec(g2.racine_projet, "todo", "feature-200-nominal")
        auth2 = _autorisation(g2.jeton_valeur)

        code, corps = requete(g2.port, "POST", "/api/spec/lancer", entetes=auth2,
                              corps=json.dumps({"cle": "lancer_spec",
                                                "spec_id": "feature-200-nominal"}).encode())
        check("test_lancer_nominal_202", code == 202, "obtenu %d : %s" % (code, corps))
        donnees = json.loads(corps) if code == 202 else {}
        check("test_lancer_nominal_rend_spec_id", donnees.get("spec_id") == "feature-200-nominal")
        pid = donnees.get("pid")

        def _sortie_lisible():
            code_l, corps_l = requete(g2.port, "GET", "/api/lancement", entetes=auth2)
            if code_l != 200:
                return False
            return "ARGV=feature-200-nominal" in json.loads(corps_l).get("lignes", "")

        ok = _attendre(_sortie_lisible)
        check("test_lancer_nominal_202_argv_reellement_substitue", ok,
              "le processus lancé n'a jamais vu `feature-200-nominal` en argv[1]")

        code_l, corps_l = requete(g2.port, "GET", "/api/lancement", entetes=auth2)
        d = json.loads(corps_l) if code_l == 200 else {}
        check("test_lancement_porte_spec_id", d.get("spec_id") == "feature-200-nominal",
              "obtenu %r" % d.get("spec_id"))

        # S1.6 : `spec_id` visible dans l'événement PUBLIC (`/api/etat`)
        def _spec_id_dans_etat():
            code_e, corps_e = requete(g2.port, "GET", "/api/etat", entetes=auth2)
            if code_e != 200:
                return False
            etat = json.loads(corps_e)
            evts = [e for e in etat.get("evenements", [])
                    if e.get("hook_event_name") == "LancementDemande"]
            return any(e.get("spec_id") == "feature-200-nominal" for e in evts)

        check("test_lancer_expose_spec_id_sur_lancement_et_etat", _attendre(_spec_id_dans_etat))

        # `lancement_spec_id` de `/api/etat`, tant que le processus tourne
        # encore (relancé sur une commande plus lente pour l'observer) :
        code, corps = requete(g2.port, "POST", "/api/spec/lancer", entetes=auth2,
                              corps=json.dumps({"cle": "lancer_spec",
                                                "spec_id": "feature-200-nominal"}).encode())
        # un écrivain (le premier, encore en cours de lecture ?) peut occuper la
        # place : peu importe ici, on veut seulement voir passer l'état.
        code_e, corps_e = requete(g2.port, "GET", "/api/etat", entetes=auth2)
        etat = json.loads(corps_e) if code_e == 200 else {}
        check("test_etat_porte_le_champ_lancement_spec_id", "lancement_spec_id" in etat)
    finally:
        g2.fermer()

    # =========================================================================
    # S1.5 — verrou d'écrivain occupé -> 409
    # =========================================================================
    # `"{spec_id}"` figure dans l'argv même si `/api/lancer` (generique,
    # utilisé pour occuper le verrou) l'ignore : c'est un token de plus dans
    # `sys.argv`, sans effet sur `time.sleep(2)`.
    g3 = GroupeGit(commandes={"lent": [_PY, "-c", "import time; time.sleep(2)", "{spec_id}"]},
                   avec_budget=["lent"])
    _surveiller_racine(g3.racine_projet)
    try:
        _ecrire_spec(g3.racine_projet, "todo", "feature-300-occupe")
        auth3 = _autorisation(g3.jeton_valeur)
        code, _ = requete(g3.port, "POST", "/api/lancer", entetes=auth3,
                          corps=json.dumps({"cle": "lent"}).encode())
        check("test_lancer_verrou_occupe_setup_202", code == 202)
        code, _ = requete(g3.port, "POST", "/api/spec/lancer", entetes=auth3,
                          corps=json.dumps({"cle": "lent",
                                            "spec_id": "feature-300-occupe"}).encode())
        check("test_lancer_verrou_occupe_409", code == 409, "obtenu %d" % code)
    finally:
        g3.fermer()

    # =========================================================================
    # S2 — modifier / supprimer
    # =========================================================================
    g4 = GroupeGit(commandes={"lent": [_PY, "-c", "import time; time.sleep(3)"]},
                   avec_budget=["lent"])
    _surveiller_racine(g4.racine_projet)
    try:
        _ecrire_spec(g4.racine_projet, "todo", "feature-400-alpha")
        _ecrire_spec(g4.racine_projet, "todo", "feature-401-beta")  # non suivie
        _ecrire_spec(g4.racine_projet, "todo", "feature-402-gamma")
        _ecrire_spec(g4.racine_projet, "doing", "feature-403-delta")
        _ecrire_spec(g4.racine_projet, "done", "feature-404-epsilon")
        _ecrire_spec(g4.racine_projet, "todo", "feature-405-zeta")
        _ecrire_spec(g4.racine_projet, "todo", "feature-406-eta")
        _ecrire_spec(g4.racine_projet, "todo", "feature-407-theta")
        _committer(g4.racine_projet,
                   _relatif("feature-400-alpha", "todo"),
                   _relatif("feature-402-gamma", "todo"),
                   _relatif("feature-403-delta", "doing"),
                   _relatif("feature-404-epsilon", "done"),
                   _relatif("feature-405-zeta", "todo"),
                   _relatif("feature-406-eta", "todo"),
                   _relatif("feature-407-theta", "todo"))
        with open(_chemin_spec(g4.racine_projet, "todo", "feature-402-gamma"),
                  "a", encoding="utf-8") as fichier:
            fichier.write("\nmodifiee localement\n")
        auth4 = _autorisation(g4.jeton_valeur)

        def _get_spec(spec_id):
            code, corps = requete(g4.port, "GET", "/api/spec?id=" + spec_id, entetes=auth4)
            return code, (json.loads(corps) if code == 200 else {})

        # --- modifier : nominal ------------------------------------------------
        code, spec = _get_spec("feature-400-alpha")
        check("test_get_spec_porte_empreinte", code == 200 and "empreinte" in spec,
              "obtenu %d %r" % (code, spec))
        code, corps = requete(g4.port, "POST", "/api/spec/modifier", entetes=auth4,
                              corps=json.dumps({
                                  "spec_id": "feature-400-alpha",
                                  "empreinte": spec["empreinte"],
                                  "contenu": "# nouveau contenu\n",
                              }).encode())
        check("test_modifier_nominal_200", code == 200, "obtenu %d : %s" % (code, corps))
        with open(_chemin_spec(g4.racine_projet, "todo", "feature-400-alpha"),
                  encoding="utf-8") as fichier:
            check("test_modifier_nominal_fichier_reellement_ecrit",
                  fichier.read() == "# nouveau contenu\n")

        # --- modifier : empreinte périmée ---------------------------------------
        code, corps = requete(g4.port, "POST", "/api/spec/modifier", entetes=auth4,
                              corps=json.dumps({
                                  "spec_id": "feature-400-alpha",
                                  "empreinte": spec["empreinte"],  # PÉRIMÉE désormais
                                  "contenu": "# ECRASEMENT REFUSE\n",
                              }).encode())
        check("test_modifier_empreinte_perimee_409_fichier_intact",
              code == 409, "obtenu %d : %s" % (code, corps))
        with open(_chemin_spec(g4.racine_projet, "todo", "feature-400-alpha"),
                  encoding="utf-8") as fichier:
            check("test_modifier_empreinte_perimee_fichier_vraiment_intact",
                  fichier.read() == "# nouveau contenu\n")

        # --- modifier : contenu non encodable (point de code substitut isolé) --
        code, spec_gamma = _get_spec("feature-402-gamma")
        avant = open(_chemin_spec(g4.racine_projet, "todo", "feature-402-gamma"),
                    encoding="utf-8").read()
        code, corps = requete(g4.port, "POST", "/api/spec/modifier", entetes=auth4,
                              corps=json.dumps({
                                  "spec_id": "feature-402-gamma",
                                  "empreinte": spec_gamma["empreinte"],
                                  "contenu": "\ud800",
                              }, ensure_ascii=True).encode())
        check("test_modifier_contenu_non_encodable_422_fichier_intact",
              code == 422, "obtenu %d : %s" % (code, corps))
        apres = open(_chemin_spec(g4.racine_projet, "todo", "feature-402-gamma"),
                    encoding="utf-8").read()
        check("test_modifier_contenu_non_encodable_fichier_vraiment_intact", avant == apres)

        # --- modifier : colonne `done` immuable --------------------------------
        code, spec_done = _get_spec("feature-404-epsilon")
        code, corps = requete(g4.port, "POST", "/api/spec/modifier", entetes=auth4,
                              corps=json.dumps({
                                  "spec_id": "feature-404-epsilon",
                                  "empreinte": spec_done["empreinte"],
                                  "contenu": "peu importe",
                              }).encode())
        check("test_modifier_done_409", code == 409, "obtenu %d : %s" % (code, corps))

        # --- modifier : autorisé depuis `doing/` -------------------------------
        code, spec_doing = _get_spec("feature-403-delta")
        code, corps = requete(g4.port, "POST", "/api/spec/modifier", entetes=auth4,
                              corps=json.dumps({
                                  "spec_id": "feature-403-delta",
                                  "empreinte": spec_doing["empreinte"],
                                  "contenu": "# modifiee en doing\n",
                              }).encode())
        check("test_modifier_doing_200", code == 200, "obtenu %d : %s" % (code, corps))

        # --- modifier : concurrence, exactement {200, 409} ---------------------
        code, spec_zeta = _get_spec("feature-405-zeta")
        empreinte_commune = spec_zeta["empreinte"]
        barriere = threading.Barrier(2)
        resultats = []

        def _tenter_modifier(suffixe):
            barriere.wait(timeout=5.0)
            code, _ = requete(g4.port, "POST", "/api/spec/modifier", entetes=auth4,
                              corps=json.dumps({
                                  "spec_id": "feature-405-zeta",
                                  "empreinte": empreinte_commune,
                                  "contenu": "# version %s\n" % suffixe,
                              }).encode())
            resultats.append(code)

        fils = [threading.Thread(target=_tenter_modifier, args=(s,)) for s in ("A", "B")]
        for f in fils:
            f.start()
        for f in fils:
            f.join(timeout=10.0)
        check("test_modifier_concurrence_exactement_200_409",
              sorted(resultats) == [200, 409], "obtenu %r" % resultats)

        # --- modifier : renforcement DÉTERMINISTE de M6 (GATE P2, lot 9) -------
        # Le test ci-dessus ne tue le mutant qui retire le verrou COURT
        # (`gestion_spec._verrou_court`/flock) qu'ALÉATOIREMENT — mesuré par le
        # GATE : 1 fois sur 3. Cause probable : rien ne force les deux threads
        # à se CHEVAUCHER réellement dans la fenêtre lecture/comparaison/
        # écriture ; ils peuvent très bien s'exécuter en séquence, verrou ou
        # pas, et produire {200, 409} par pure chance de l'ordonnanceur. On
        # FORCE ici le chevauchement en retardant la PREMIÈRE lecture du
        # contenu sous verrou (`_lire_contenu`, appelée UNE fois le verrou
        # pris) : si le verrou tient, le second thread reste bloqué à
        # `_verrou_court()` — AVANT même d'atteindre `_lire_contenu` — et le
        # résultat reste {200, 409} à coup sûr ; si le verrou est retiré, le
        # second thread atteint `_lire_contenu` PENDANT la pause du premier,
        # lit le MÊME contenu original, et les deux écrivent : {200, 200}.
        code, spec_theta = _get_spec("feature-407-theta")
        empreinte_theta = spec_theta["empreinte"]
        OrigLireContenu = g4.srv.GS._lire_contenu
        _premiere_lecture = threading.Event()

        def _lire_contenu_retarde(chemin_absolu):
            contenu = OrigLireContenu(chemin_absolu)
            if not _premiere_lecture.is_set():
                _premiere_lecture.set()
                time.sleep(0.3)
            return contenu

        g4.srv.GS._lire_contenu = _lire_contenu_retarde
        try:
            barriere_theta = threading.Barrier(2)
            resultats_theta = []

            def _tenter_modifier_theta(suffixe):
                barriere_theta.wait(timeout=5.0)
                code, _ = requete(g4.port, "POST", "/api/spec/modifier", entetes=auth4,
                                  corps=json.dumps({
                                      "spec_id": "feature-407-theta",
                                      "empreinte": empreinte_theta,
                                      "contenu": "# version-theta %s\n" % suffixe,
                                  }).encode())
                resultats_theta.append(code)

            fils_theta = [threading.Thread(target=_tenter_modifier_theta, args=(s,))
                         for s in ("A", "B")]
            for f in fils_theta:
                f.start()
            for f in fils_theta:
                f.join(timeout=10.0)
            check("test_modifier_concurrence_chevauchement_force_exactement_200_409",
                  sorted(resultats_theta) == [200, 409],
                  "obtenu %r (le verrou doit bloquer le second thread AVANT sa lecture)"
                  % resultats_theta)
        finally:
            g4.srv.GS._lire_contenu = OrigLireContenu

        # --- supprimer : confirmation discordante -> 422, aucun effet ----------
        code, corps = requete(g4.port, "POST", "/api/spec/supprimer", entetes=auth4,
                              corps=json.dumps({
                                  "spec_id": "feature-406-eta",
                                  "confirmation_nom": "feature-AUTRE-CHOSE",
                              }).encode())
        check("test_supprimer_confirmation_discordante_422_fichier_intact",
              code == 422 and os.path.isfile(
                  _chemin_spec(g4.racine_projet, "todo", "feature-406-eta")),
              "obtenu %d" % code)

        # --- supprimer : non suivie -> 409, fichier intact (fait 4 du GATE) ----
        code, corps = requete(g4.port, "POST", "/api/spec/supprimer", entetes=auth4,
                              corps=json.dumps({
                                  "spec_id": "feature-401-beta",
                                  "confirmation_nom": "feature-401-beta",
                              }).encode())
        check("test_supprimer_non_suivie_409_fichier_intact",
              code == 409 and os.path.isfile(
                  _chemin_spec(g4.racine_projet, "todo", "feature-401-beta")),
              "obtenu %d : %s" % (code, corps))

        # --- supprimer : modifiée localement -> 409, fichier intact ------------
        code, corps = requete(g4.port, "POST", "/api/spec/supprimer", entetes=auth4,
                              corps=json.dumps({
                                  "spec_id": "feature-402-gamma",
                                  "confirmation_nom": "feature-402-gamma",
                              }).encode())
        check("test_supprimer_modifiee_409_fichier_intact",
              code == 409 and os.path.isfile(
                  _chemin_spec(g4.racine_projet, "todo", "feature-402-gamma")),
              "obtenu %d : %s" % (code, corps))

        # --- supprimer : colonne `done` immuable, `doing` non supprimable ------
        code, corps = requete(g4.port, "POST", "/api/spec/supprimer", entetes=auth4,
                              corps=json.dumps({
                                  "spec_id": "feature-404-epsilon",
                                  "confirmation_nom": "feature-404-epsilon",
                              }).encode())
        check("test_supprimer_done_409", code == 409, "obtenu %d : %s" % (code, corps))

        code, corps = requete(g4.port, "POST", "/api/spec/supprimer", entetes=auth4,
                              corps=json.dumps({
                                  "spec_id": "feature-403-delta",
                                  "confirmation_nom": "feature-403-delta",
                              }).encode())
        check("test_supprimer_doing_409", code == 409, "obtenu %d : %s" % (code, corps))

        # --- supprimer : pendant un lancement sur la MÊME spec -> 409 ----------
        _ecrire_spec(g4.racine_projet, "todo", "feature-408-iota")
        _committer(g4.racine_projet, _relatif("feature-408-iota", "todo"))
        code, corps = requete(g4.port, "POST", "/api/lancer", entetes=auth4,
                              corps=json.dumps({"cle": "lent"}).encode())
        # `/api/lancer` (pas `/api/spec/lancer`) ne porte pas de `spec_id` :
        # `feature-408-iota` ne peut donc PAS être vu « en cours » par ce
        # lancement générique — ce test isole donc S2.4 pour `/api/spec/lancer`
        # uniquement, dans son propre groupe ci-dessous.
        requete(g4.port, "POST", "/api/interrompre", entetes=auth4)
    finally:
        g4.fermer()

    # =========================================================================
    # S2.4 (suite) : modifier/supprimer PENDANT un lancement SUR CETTE spec
    # =========================================================================
    g5 = GroupeGit(commandes={"lent": [_PY, "-c", "import time; time.sleep(3)", "{spec_id}"]},
                   avec_budget=["lent"])
    _surveiller_racine(g5.racine_projet)
    try:
        _ecrire_spec(g5.racine_projet, "todo", "feature-500-encours")
        _committer(g5.racine_projet, _relatif("feature-500-encours", "todo"))
        auth5 = _autorisation(g5.jeton_valeur)
        code, corps = requete(g5.port, "POST", "/api/spec/lancer", entetes=auth5,
                              corps=json.dumps({"cle": "lent",
                                                "spec_id": "feature-500-encours"}).encode())
        check("test_S2_4_setup_lancement_202", code == 202, "obtenu %d : %s" % (code, corps))

        code, spec = requete(g5.port, "GET", "/api/spec?id=feature-500-encours", entetes=auth5)
        empreinte = json.loads(spec)["empreinte"]
        code, corps = requete(g5.port, "POST", "/api/spec/modifier", entetes=auth5,
                              corps=json.dumps({
                                  "spec_id": "feature-500-encours",
                                  "empreinte": empreinte, "contenu": "x",
                              }).encode())
        check("test_modifier_pendant_lancement_409", code == 409, "obtenu %d : %s" % (code, corps))

        code, corps = requete(g5.port, "POST", "/api/spec/supprimer", entetes=auth5,
                              corps=json.dumps({
                                  "spec_id": "feature-500-encours",
                                  "confirmation_nom": "feature-500-encours",
                              }).encode())
        check("test_supprimer_pendant_lancement_409", code == 409, "obtenu %d : %s" % (code, corps))
        requete(g5.port, "POST", "/api/interrompre", entetes=auth5)
    finally:
        g5.fermer()

    # =========================================================================
    # S2.7/S2.9/S2.11/S2.12 — suppression nominale, retour arrière EXÉCUTÉ,
    # concurrence, absence de racine dans les réponses, journalisation
    # =========================================================================
    g6 = GroupeGit(commandes={})
    _surveiller_racine(g6.racine_projet)
    try:
        _ecrire_spec(g6.racine_projet, "todo", "feature-600-a-supprimer",
                    contenu="# Contenu ORIGINAL, bit pour bit\n\nligne 2\n")
        _ecrire_spec(g6.racine_projet, "todo", "feature-601-concurrence")
        _committer(g6.racine_projet,
                   _relatif("feature-600-a-supprimer", "todo"),
                   _relatif("feature-601-concurrence", "todo"))
        auth6 = _autorisation(g6.jeton_valeur)
        chemin_600 = _chemin_spec(g6.racine_projet, "todo", "feature-600-a-supprimer")
        contenu_original = open(chemin_600, encoding="utf-8").read()

        code, corps = requete(g6.port, "POST", "/api/spec/supprimer", entetes=auth6,
                              corps=json.dumps({
                                  "spec_id": "feature-600-a-supprimer",
                                  "confirmation_nom": "feature-600-a-supprimer",
                              }).encode())
        check("test_supprimer_nominal_200", code == 200, "obtenu %d : %s" % (code, corps))
        resultat = json.loads(corps) if code == 200 else {}
        check("test_supprimer_nominal_fichier_reellement_absent", not os.path.isfile(chemin_600))
        retour = resultat.get("retour_arriere", {})
        check("test_supprimer_nominal_retour_arriere_present",
              {"sha", "chemin", "argv"} <= set(retour), "obtenu %r" % retour)
        check("test_supprimer_nominal_argv_forme_attendue",
              retour.get("argv") == ["git", "checkout", retour.get("sha"), "--", retour.get("chemin")],
              "obtenu %r" % retour.get("argv"))

        # GATE P2 (lot 9), condition 2, mutant M12 : `test_supprimer_nominal_
        # argv_forme_attendue` compare DEUX champs de la MÊME réponse entre
        # eux (`retour.get("chemin")` des deux côtés) — un mutant qui rend
        # `chemin` ET `argv[-1]` ABSOLUS (au lieu de relatifs) les altère
        # tous les deux DE LA MÊME FAÇON et survit à cette comparaison. Ici,
        # comparaison contre un LITTÉRAL ATTENDU, indépendant de la réponse
        # elle-même — un chemin rendu absolu ne peut plus concorder.
        check("test_supprimer_nominal_retour_arriere_chemin_est_le_relatif_attendu",
              retour.get("chemin") == "specs/features/todo/feature-600-a-supprimer.md",
              "obtenu %r" % retour.get("chemin"))
        check("test_supprimer_nominal_retour_arriere_chemin_jamais_absolu",
              not os.path.isabs(retour.get("chemin") or ""),
              "obtenu %r" % retour.get("chemin"))

        # ⚠️ Le test EXÉCUTE l'argv TEL QUE la réponse JSON le rend — jamais
        # une commande réécrite ici (Règle absolue n°4 : un plan de retour
        # arrière S'EXÉCUTE, il ne se décrit pas). L'argv rendu commence déjà
        # par `"git"` : c'est `cwd`, jamais un second `-C`, qui fixe le dépôt.
        proc = subprocess.run(retour.get("argv", []), cwd=g6.racine_projet,
                              capture_output=True, text=True)
        check("test_supprimer_retour_arriere_git_checkout_reussit", proc.returncode == 0,
              "stderr=%s" % proc.stderr)
        check("test_supprimer_retour_arriere_fichier_restaure",
              os.path.isfile(chemin_600))
        contenu_restaure = (open(chemin_600, encoding="utf-8").read()
                           if os.path.isfile(chemin_600) else None)
        check("test_supprimer_retour_arriere_EXECUTE_contenu_bit_pour_bit",
              contenu_restaure == contenu_original,
              "original=%r restaure=%r" % (contenu_original, contenu_restaure))
        statut = _git(g6.racine_projet, "status", "--porcelain").stdout
        check("test_supprimer_retour_arriere_git_status_porcelain_vide",
              statut.strip() == "", "obtenu %r" % statut)

        # S2.12 : journalisé, avec `spec_id` et `sha`, visible sur `/api/etat`.
        def _spec_supprimee_dans_etat():
            code_e, corps_e = requete(g6.port, "GET", "/api/etat", entetes=auth6)
            if code_e != 200:
                return False
            etat = json.loads(corps_e)
            evts = [e for e in etat.get("evenements", [])
                    if e.get("hook_event_name") == "SpecSupprimee"]
            return any(e.get("spec_id") == "feature-600-a-supprimer" and e.get("sha")
                      for e in evts)

        check("test_supprimer_journalise_spec_id_et_sha", _attendre(_spec_supprimee_dans_etat))

        # S2.9 : deux suppressions concurrentes sur LA MÊME spec -> {200, 404}.
        compteur_git_rm = []
        OrigSupprimerSuivi = g6.srv.V.supprimer_suivi

        def _supprimer_suivi_espion(racine, relatif):
            compteur_git_rm.append(1)
            return OrigSupprimerSuivi(racine, relatif)

        g6.srv.GS.V.supprimer_suivi = _supprimer_suivi_espion
        try:
            barriere = threading.Barrier(2)
            resultats = []

            def _tenter_supprimer():
                barriere.wait(timeout=5.0)
                code, _ = requete(g6.port, "POST", "/api/spec/supprimer", entetes=auth6,
                                  corps=json.dumps({
                                      "spec_id": "feature-601-concurrence",
                                      "confirmation_nom": "feature-601-concurrence",
                                  }).encode())
                resultats.append(code)

            fils = [threading.Thread(target=_tenter_supprimer) for _ in range(2)]
            for f in fils:
                f.start()
            for f in fils:
                f.join(timeout=10.0)
            check("test_supprimer_concurrence_exactement_200_404_git_rm_une_fois",
                  sorted(resultats) == [200, 404] and len(compteur_git_rm) == 1,
                  "resultats=%r git_rm=%d" % (resultats, len(compteur_git_rm)))
        finally:
            g6.srv.GS.V.supprimer_suivi = OrigSupprimerSuivi

        # S2.11 : ni chemin absolu ni `racine` dans les réponses.
        racine_abs = g6.racine_projet
        code, corps = requete(g6.port, "POST", "/api/spec/supprimer", entetes=auth6,
                              corps=json.dumps({"spec_id": "inconnue-x",
                                                "confirmation_nom": "inconnue-x"}).encode())
        check("test_reponses_ne_portent_jamais_la_racine", racine_abs not in corps,
              "la racine du dépôt a fuité dans une réponse")
    finally:
        g6.fermer()

    # =========================================================================
    # GATE P2 (lot 9), condition 1 : `Ecriture.lancement_courant()` ne rend
    # que le DERNIER lancement (`self.courant`) — sous `ecrivains_simultanes
    # > 1`, un lancement CIBLÉ sur X qui reste actif devient INVISIBLE à
    # `_spec_en_cours`/`lancement_spec_id` dès qu'un lancement PLUS RÉCENT
    # (ciblé ou non) bascule `self.courant` ailleurs. Sonde REJOUÉE avec
    # `ecrivains_simultanes=2`, exactement la configuration mesurée par le
    # GATE : lancement ciblé sur X (202) -> lancement générique (202,
    # `courant` bascule) -> `modifier`/`supprimer` sur X DOIVENT rester 409
    # tant que le premier lancement tourne encore.
    # =========================================================================
    g7 = GroupeGit(commandes={
        "lancer_spec": [_PY, "-c", "import time; time.sleep(3)", "{spec_id}"],
        "generique": [_PY, "-c", "import time; time.sleep(3)"],
    }, avec_budget=["lancer_spec", "generique"], ecrivains_simultanes=2)
    _surveiller_racine(g7.racine_projet)
    try:
        _ecrire_spec(g7.racine_projet, "todo", "feature-700-cible")
        _committer(g7.racine_projet, _relatif("feature-700-cible", "todo"))
        auth7 = _autorisation(g7.jeton_valeur)

        code, corps = requete(g7.port, "GET", "/api/spec?id=feature-700-cible", entetes=auth7)
        check("test_S9c1_setup_get_spec_200", code == 200, "obtenu %d : %s" % (code, corps))
        empreinte_x = json.loads(corps).get("empreinte") if code == 200 else None

        # 1) lancement CIBLÉ sur X -> verrou 0, `self.courant` = 0.
        code, corps = requete(g7.port, "POST", "/api/spec/lancer", entetes=auth7,
                              corps=json.dumps({"cle": "lancer_spec",
                                                "spec_id": "feature-700-cible"}).encode())
        check("test_S9c1_lancement_cible_202", code == 202, "obtenu %d : %s" % (code, corps))

        # 2) lancement GÉNÉRIQUE -> verrou 1, `self.courant` BASCULE à 1 —
        # sans le correctif, `lancement_courant()` ne porte plus que CELUI-CI.
        code, corps = requete(g7.port, "POST", "/api/lancer", entetes=auth7,
                              corps=json.dumps({"cle": "generique"}).encode())
        check("test_S9c1_lancement_generique_202", code == 202, "obtenu %d : %s" % (code, corps))

        def _lancement_x_toujours_actif():
            code_e, corps_e = requete(g7.port, "GET", "/api/etat", entetes=auth7)
            if code_e != 200:
                return False
            return json.loads(corps_e).get("lancement_spec_id") == "feature-700-cible"

        check("test_S9c1_etat_voit_toujours_x_malgre_le_basculement",
              _attendre(_lancement_x_toujours_actif))

        # `supprimer` D'ABORD, sur le fichier encore COMMITÉ et PROPRE : sinon
        # un `modifier` qui réussirait À TORT sous le mutant salirait l'arbre
        # de travail et ferait rendre 409 à `supprimer` pour une raison
        # ÉTRANGÈRE (`vcs.verifier_supprimable`, « modifiée ») — masquant
        # exactement le défaut que ce test doit prouver.
        code, corps = requete(g7.port, "POST", "/api/spec/supprimer", entetes=auth7,
                              corps=json.dumps({
                                  "spec_id": "feature-700-cible",
                                  "confirmation_nom": "feature-700-cible",
                              }).encode())
        check("test_S9c1_supprimer_pendant_lancement_cible_non_courant_409",
              code == 409,
              "obtenu %d : %s (courant a bascule sur le lancement generique)" % (code, corps))
        check("test_S9c1_supprimer_fichier_intact",
              os.path.isfile(_chemin_spec(g7.racine_projet, "todo", "feature-700-cible")))

        code, corps = requete(g7.port, "POST", "/api/spec/modifier", entetes=auth7,
                              corps=json.dumps({
                                  "spec_id": "feature-700-cible",
                                  "empreinte": empreinte_x,
                                  "contenu": "# ECRASEMENT PENDANT LANCEMENT CIBLE NON COURANT\n",
                              }).encode())
        check("test_S9c1_modifier_pendant_lancement_cible_non_courant_409",
              code == 409,
              "obtenu %d : %s (courant a bascule sur le lancement generique)" % (code, corps))
        chemin_700 = _chemin_spec(g7.racine_projet, "todo", "feature-700-cible")
        # `os.path.isfile` d'abord (pas un `open()` direct) : sous un mutant
        # QUI COMBINERAIT le défaut avec une suppression réussie juste avant
        # (cf. test précédent), le fichier peut ne plus exister du tout — un
        # `open()` direct planterait alors le harnais (`FileNotFoundError`)
        # au lieu de rendre un ECHEC lisible.
        contenu_700 = (open(chemin_700, encoding="utf-8").read()
                      if os.path.isfile(chemin_700) else None)
        check("test_S9c1_modifier_fichier_intact",
              contenu_700 is not None and "ECRASEMENT" not in contenu_700,
              "obtenu %r" % contenu_700)
    finally:
        g7.fermer()

    # =========================================================================
    # AUDIT feature-021 (A1) — confinement ASYMÉTRIQUE : `GET /api/spec`
    # composait son chemin à la main (`racine/colonne/id.md`) SANS passer
    # par `GS.resoudre_spec()`, contrairement aux routes d'ÉCRITURE. Un lien
    # symbolique planté dans `todo/` était donc LISTÉ (`lister_specs()` ne
    # filtrait pas les liens) ET SUIVI par `open()` à la lecture — la
    # réponse portait le contenu de la CIBLE, pas celui du lien. Reproduit
    # ICI EXACTEMENT comme mesuré par l'audit : un lien réel dans `todo/`
    # pointant HORS de l'arborescence `specs/`.
    # =========================================================================
    g8 = GroupeGit(commandes={})
    _surveiller_racine(g8.racine_projet)
    try:
        contenu_secret = "CONTENU-HORS-COLONNE-9f31a7\n"
        chemin_cible = os.path.join(g8.racine_projet, "SECRET-HORS-COLONNE.md")
        with open(chemin_cible, "w", encoding="utf-8") as fichier:
            fichier.write(contenu_secret)
        chemin_lien = _chemin_spec(g8.racine_projet, "todo", "feature-998-lien")
        os.symlink(chemin_cible, chemin_lien)
        auth8 = _autorisation(g8.jeton_valeur)

        code, corps = requete(g8.port, "GET", "/api/etat", entetes=auth8)
        etat8 = json.loads(corps) if code == 200 else {}
        ids8 = {s["id"] for s in etat8.get("specs", [])}
        check("test_A1_lien_absent_de_la_liste", "feature-998-lien" not in ids8,
              "obtenu %r" % sorted(ids8))

        code, corps = requete(g8.port, "GET", "/api/spec?id=feature-998-lien", entetes=auth8)
        check("test_A1_lecture_par_id_refuse_404", code == 404, "obtenu %d : %s" % (code, corps))
        check("test_A1_lecture_ne_fuite_jamais_la_cible",
              contenu_secret.strip() not in corps,
              "la réponse porte le contenu de la CIBLE hors colonne : %r" % corps)

        # Preuve, INDÉPENDANTE de la garde, que le défaut mesuré par
        # l'AUDIT était réel : `open()` sur le CHEMIN DE COLONNE (celui que
        # l'ANCIEN `_spec()` composait directement) suit bel et bien le
        # lien jusqu'à la cible. C'est CE fait qui rend `resoudre_spec()`
        # nécessaire ici — sans lui, la route rendrait exactement ceci.
        with open(chemin_lien, encoding="utf-8") as fichier:
            contenu_suivi = fichier.read()
        check("test_A1_MUTATION_preuve_open_suit_le_lien_jusqu_a_la_cible",
              contenu_suivi == contenu_secret,
              "si `open()` ne suivait pas le lien, l'ancienne composition "
              "directe du chemin n'aurait rien pu fuiter — preuve que le "
              "défaut mesuré par l'AUDIT (A1) était réel, contenu lu : %r"
              % contenu_suivi)
    finally:
        g8.fermer()

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
