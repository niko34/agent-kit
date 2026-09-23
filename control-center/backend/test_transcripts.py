#!/usr/bin/env python3
"""Tests de la lecture des transcripts (feature-023, GATE P1 S5 ; revue
`feature-021` cycle 3 pour le correctif de disposition, la mémoïsation et le
tri par récence — voir `PIEGES.md` §59).

    python3 control-center/backend/test_transcripts.py

Correspondance condition GATE -> cas, pour la revue :

- S5.1 : test_racine_surcharge_absolue_rendue, test_racine_calcul_par_defaut,
  test_racine_suit_claude_config_dir, test_racine_absente_rend_none
- S5.2 : test_agent_id_hostile_zero_open_hors_racine (mutation espion),
  test_agent_id_forme_invalide_ignore, test_agent_id_hors_racine_via_chemin_sur,
  test_chemin_sur_ferme_le_separateur_intercale (PIEGES §59, défense en
  profondeur au-delà du regex)
- S5.3 : test_filtre_positif_type_seuls_input_output_int_sortent,
  test_aucune_valeur_str_ne_sort_recursivement, test_temoin_absent_de_la_sortie
- S5.4 : (couvert au niveau serveur, `test_server_feature023.py`)
- S5.5 : test_module_aucune_ecriture_par_introspection_ast
- S5.6 : test_budget_octets_zero_rend_partiel_immediat,
  test_budget_secondes_epuise_rend_partiel
- S5.7 : test_permission_refusee_rend_absence_pas_zero
- Disposition réelle (revue cycle 3) : test_atteignabilite_disposition_mesuree
  — constate la disposition RÉELLE sur cette machine (ne la suppose jamais),
  et fait échouer le cas si le code revient à `<racine>/subagents/...`
  (ancienne disposition, qui n'existe sur AUCUNE machine mesurée).
- Mémoïsation (M3) : test_cache_evite_une_seconde_lecture_disque,
  test_cache_ne_sert_jamais_une_lecture_partielle
- Tri par récence (M3) : test_tri_par_recence_pas_alphabetique
"""

import ast
import builtins
import json
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config as C  # noqa: E402
import transcripts as T  # noqa: E402

_ICI = os.path.dirname(os.path.abspath(__file__))
_ouvrir_reel = builtins.open

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


def _config(tmp, racine_projet=None, transcripts_toml=""):
    chemin = os.path.join(tmp, "c.toml")
    with open(chemin, "w", encoding="utf-8") as fichier:
        fichier.write(transcripts_toml)
    return C.charger(chemin=chemin, racine_projet=racine_projet or tmp)


def _ecrire_jsonl(chemin, lignes):
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    with open(chemin, "w", encoding="utf-8") as fichier:
        for ligne in lignes:
            fichier.write(json.dumps(ligne) + "\n")


def _ecrire_transcript(racine_lue, session, agent_id, lignes):
    """Écrit un transcript à l'endroit RÉELLEMENT mesuré sur cette machine :
    `<racine_lue>/<session>/subagents/agent-<agent_id>.jsonl` — jamais
    `<racine_lue>/subagents/...`, la disposition que `feature-023` a livrée
    par erreur et que les fixtures d'origine reproduisaient fidèlement (zéro
    fichier trouvé, en toutes circonstances)."""
    chemin = os.path.join(racine_lue, session, "subagents", "agent-%s.jsonl" % agent_id)
    _ecrire_jsonl(chemin, lignes)
    return chemin


def _usage_ligne(input_tokens=None, output_tokens=None, **extra):
    usage = dict(extra)
    if input_tokens is not None:
        usage["input_tokens"] = input_tokens
    if output_tokens is not None:
        usage["output_tokens"] = output_tokens
    return {"type": "assistant", "message": {"role": "assistant", "usage": usage}}


def _contient_une_chaine_en_valeur(valeur):
    """Vrai si `valeur` porte, n'importe où dans sa structure, un `str` non
    vide EN POSITION DE VALEUR. Sert à l'assertion S5.3 : la sortie du
    module ne doit jamais y porter de texte — c'est la preuve, pas la
    conviction.

    Les CLÉS ne sont volontairement PAS inspectées : `agent_id` (hexadécimal)
    et les noms `input_tokens`/`output_tokens` sont des chaînes structurelles
    légitimes, pas du texte de conversation — ce n'est pas ce que S5.3 interdit.
    """
    if isinstance(valeur, str):
        return bool(valeur)
    if isinstance(valeur, dict):
        return any(_contient_une_chaine_en_valeur(v) for v in valeur.values())
    if isinstance(valeur, (list, tuple, set)):
        return any(_contient_une_chaine_en_valeur(v) for v in valeur)
    return False


def _reperer_disposition_reelle():
    """Cherche, sur CETTE machine, un vrai transcript de sous-agent sous
    `$CLAUDE_CONFIG_DIR/projects/...` (ou `~/.claude/projects/...`), et rend
    `(racine_projet, segments)` où `segments` est le chemin RELATIF (une
    liste de composants) du premier `agent-*.jsonl` trouvé sous cette racine
    de projet.

    Ceci ne SUPPOSE rien sur la disposition : c'est la même erreur que celle
    corrigée ici — un docstring qui décrit `<session>/subagents/...` pendant
    qu'un code ou qu'un test suppose autre chose. Ce qui suit MESURE un
    fichier réel et rejoue sa profondeur EXACTE dans une fixture jetable.

    Rend `None` si aucun transcript n'est trouvable sur cette machine (CI,
    conteneur neuf sans historique d'agents) : le test qui en dépend se
    saute alors proprement, il ne suppose jamais à sa place.
    """
    base = os.environ.get("CLAUDE_CONFIG_DIR") or os.path.expanduser("~/.claude")
    racine_projects = os.path.join(base, "projects")
    if not os.path.isdir(racine_projects):
        return None
    try:
        noms_projets = sorted(os.listdir(racine_projects))
    except OSError:
        return None
    for nom_projet in noms_projets:
        chemin_projet = os.path.join(racine_projects, nom_projet)
        if not os.path.isdir(chemin_projet):
            continue
        for dirpath, _dirnames, filenames in os.walk(chemin_projet):
            trouves = sorted(f for f in filenames
                              if f.startswith("agent-") and f.endswith(".jsonl"))
            if not trouves:
                continue
            chemin_fichier = os.path.join(dirpath, trouves[0])
            relatif = os.path.relpath(chemin_fichier, chemin_projet)
            segments = relatif.split(os.sep)
            return chemin_projet, segments
    return None


def main():
    with tempfile.TemporaryDirectory() as tmp:
        # === S5.1 — racine de lecture ========================================
        cible = os.path.join(tmp, "cible-declaree")
        os.makedirs(cible)
        config = _config(tmp, transcripts_toml='[transcripts]\nracine = %r\n' % cible)
        check("test_racine_surcharge_absolue_rendue", T.racine(config) == cible)

        config_absente = _config(tmp, transcripts_toml='[transcripts]\nracine = "/nexiste/pas/du/tout"\n')
        check("test_racine_surcharge_inexistante_rend_none", T.racine(config_absente) is None)

        # Calcul par défaut : $HOME/.claude/projects/<racine encodée>, règle /→-
        faux_home = os.path.join(tmp, "faux-home")
        projet = os.path.join(tmp, "un", "projet")
        os.makedirs(projet)
        encodee = projet.replace(os.sep, "-")
        attendu = os.path.join(faux_home, ".claude", "projects", encodee)
        os.makedirs(attendu)
        ancien_home = os.environ.get("HOME")
        ancien_ccd = os.environ.pop("CLAUDE_CONFIG_DIR", None)
        os.environ["HOME"] = faux_home
        try:
            config_defaut = _config(tmp, racine_projet=projet)
            check("test_racine_calcul_par_defaut", T.racine(config_defaut) == attendu,
                  "obtenu %r, attendu %r" % (T.racine(config_defaut), attendu))

            # CLAUDE_CONFIG_DIR, quand elle est posée, prend le pas sur $HOME —
            # c'est une variable d'ENVIRONNEMENT lue, jamais un sous-processus.
            autre_base = os.path.join(tmp, "autre-config-dir")
            attendu_ccd = os.path.join(autre_base, "projects", encodee)
            os.makedirs(attendu_ccd)
            os.environ["CLAUDE_CONFIG_DIR"] = autre_base
            check("test_racine_suit_claude_config_dir", T.racine(config_defaut) == attendu_ccd)
        finally:
            if ancien_home is not None:
                os.environ["HOME"] = ancien_home
            else:
                os.environ.pop("HOME", None)
            if ancien_ccd is not None:
                os.environ["CLAUDE_CONFIG_DIR"] = ancien_ccd
            else:
                os.environ.pop("CLAUDE_CONFIG_DIR", None)

        # Répertoire par défaut qui n'existe pas : absence propre, pas d'exception.
        config_isole = _config(tmp, racine_projet=os.path.join(tmp, "projet-jamais-mesure"))
        check("test_racine_absente_rend_none", T.racine(config_isole) is None)

        # === Fixture commune : une vraie racine, DEUX sessions ===============
        # Disposition RÉELLEMENT mesurée sur cette machine (deux fois, par
        # deux lecteurs différents) : `<racine>/<session>/subagents/...`,
        # PAS `<racine>/subagents/...` — voir l'en-tête du module.
        racine_lue = os.path.join(tmp, "racine-transcripts")
        os.makedirs(racine_lue)
        os.makedirs(os.path.join(racine_lue, "session-1", "subagents"))
        os.makedirs(os.path.join(racine_lue, "session-2", "subagents"))
        config_racine = _config(tmp, transcripts_toml='[transcripts]\nracine = %r\n' % racine_lue)

        agent_ok = "a1b2c3d4e5f6a1b2"
        chemin_agent_ok = _ecrire_transcript(racine_lue, "session-1", agent_ok, [
            _usage_ligne(input_tokens=2, output_tokens=3),
            _usage_ligne(input_tokens=5, output_tokens=7,
                         cache_creation={"x": 1}, service_tier="standard",
                         inference_geo="not_available"),
        ])

        # === S5.3 — filtre positif, typé =====================================
        resultat = T.lire_tokens_par_passage(config_racine, [agent_ok])
        check("test_filtre_positif_type_seuls_input_output_int_sortent",
              resultat["par_agent"].get(agent_ok) == {"input_tokens": 7, "output_tokens": 10},
              "obtenu %r" % resultat["par_agent"].get(agent_ok))
        check("test_aucune_valeur_str_ne_sort_recursivement",
              not _contient_une_chaine_en_valeur(resultat["par_agent"]),
              "une valeur `str` est sortie du module — S5.3 violée")

        # `bool` est un sous-type d'`int` en Python : un usage bricolé avec
        # `input_tokens: true` ne doit JAMAIS être compté comme 1.
        agent_bool = "b1b2c3d4e5f6a1b2"
        _ecrire_transcript(racine_lue, "session-1", agent_bool, [
            _usage_ligne(input_tokens=True, output_tokens=False),
        ])
        resultat_bool = T.lire_tokens_par_passage(config_racine, [agent_bool])
        check("test_booleen_jamais_compte_comme_entier",
              agent_bool not in resultat_bool["par_agent"],
              "un `bool` a été compté comme un `input_tokens` — obtenu %r"
              % resultat_bool["par_agent"].get(agent_bool))

        # Témoin de fuite : un motif reconnaissable dans un CHAMP TEXTE ET
        # dans `usage.service_tier` — absent de la sortie du module.
        agent_temoin = "c1b2c3d4e5f6a1b2"
        temoin = "TEMOIN-FUITE-9f3"
        _ecrire_transcript(racine_lue, "session-1", agent_temoin, [
            {"type": "assistant", "message": {
                "role": "assistant",
                "content": [{"type": "text", "text": "secret : %s" % temoin}],
                "usage": {"input_tokens": 11, "output_tokens": 13, "service_tier": temoin},
            }},
        ])
        resultat_temoin = T.lire_tokens_par_passage(config_racine, [agent_temoin])
        check("test_temoin_absent_de_la_sortie",
              temoin not in json.dumps(resultat_temoin),
              "le témoin de fuite est sorti du module")
        check("test_temoin_les_compteurs_restent_corrects",
              resultat_temoin["par_agent"].get(agent_temoin) ==
              {"input_tokens": 11, "output_tokens": 13})

        # === S5.2 — confinement ==============================================
        # Espion posé sur `open` : compte les chemins RÉELLEMENT ouverts. Un
        # `agent_id` hostile ne doit produire AUCUN `open()` hors de `racine_lue`.
        # `transcripts.py` n'a pas son propre `open` : lui en affecter un DEPUIS
        # ce test suffit à faire gagner ce nom sur le builtin, dans le module
        # SEUL (recherche de nom Python : local -> module -> builtins).
        ouverts = []

        def espion_open(chemin, *a, **k):
            ouverts.append(chemin)
            return _ouvrir_reel(chemin, *a, **k)

        T.open = espion_open
        try:
            for hostile in ("../../etc/passwd", "..%2Fescape", "/etc/passwd",
                             "a1B2", "a" * 33, "", "a b", "a/../b",
                             # `..` en PREMIER segment après le préfixe `agent-`
                             # ("agent-..") n'est PAS le composant spécial —
                             # seul un `/` intercalé réintroduit un `..` PUR
                             # comme composant à part entière, qui échappe
                             # réellement à `racine_lue` une fois assez profond.
                             "x/../../../../../../../../etc/passwd"):
                resultat_hostile = T.lire_tokens_par_passage(config_racine, [hostile])
                check("test_agent_id_hostile_%r_absent" % hostile,
                      hostile not in resultat_hostile["par_agent"])
            racine_reelle = os.path.realpath(racine_lue)
            hors_racine = [c for c in ouverts
                            if not os.path.realpath(c).startswith(racine_reelle + os.sep)]
            check("test_agent_id_hostile_zero_open_hors_racine", hors_racine == [],
                  "ouverts hors racine : %r" % hors_racine)
        finally:
            del T.open

        # `../../x` qui, une fois concaténé, RESTERAIT sous la racine par la
        # seule force de `os.path.join` échouerait quand même le regex avant
        # toute construction de chemin — testé isolément :
        check("test_agent_id_forme_invalide_ignore_sans_lecture",
              "../../x" not in T.lire_tokens_par_passage(config_racine, ["../../x"])["par_agent"])

        # --- PIEGES §59 : défense en profondeur AU-DELÀ du regex ------------
        # Le regex `_RE_AGENT_ID` interdit tout `/` dans `agent_id` — les
        # témoins ci-dessus ne peuvent donc JAMAIS exercer `chemin_sur()`
        # lui-même par la voie publique. On éprouve ici `chemin_sur()`
        # directement, en appelant les fonctions internes SANS passer par le
        # regex : c'est le seul moyen de vérifier que le filet, pas
        # seulement le premier obstacle, ferme le cas où un séparateur
        # intercalé réintroduit un `..` pur qui s'échappe réellement.
        ouverts_defense = []

        def espion_defense(chemin, *a, **k):
            ouverts_defense.append(chemin)
            return _ouvrir_reel(chemin, *a, **k)

        hostile_separateur = "x/../../../../../../../../etc/passwd"
        check("test_chemin_sur_ferme_le_separateur_intercale",
              T._chemin_transcript(racine_lue, "session-1", hostile_separateur) is None,
              "obtenu %r — `chemin_sur()` doit refuser le témoin à séparateur intercalé"
              % (T._chemin_transcript(racine_lue, "session-1", hostile_separateur),))
        T.open = espion_defense
        try:
            resolu = T._resoudre(racine_lue, hostile_separateur)
            check("test_resoudre_ne_trouve_rien_pour_un_identifiant_hostile", resolu is None,
                  "obtenu %r" % (resolu,))
        finally:
            del T.open
        racine_reelle_defense = os.path.realpath(racine_lue)
        hors_racine_defense = [c for c in ouverts_defense
                                if not os.path.realpath(c).startswith(racine_reelle_defense + os.sep)]
        check("test_aucun_open_hors_racine_meme_avec_bypass_du_regex",
              hors_racine_defense == [], "ouverts hors racine : %r" % hors_racine_defense)

        # === S5.6 — budget par instantané ====================================
        # Cache VIDÉ avant chaque assertion de budget : ces tests éprouvent
        # une LECTURE RÉELLE bornée, pas ce que la mémoïsation (M3) sert déjà
        # gratuitement depuis un appel précédent dans ce même fichier.
        T._cache.clear()
        config_budget_zero = _config(
            tmp, transcripts_toml='[transcripts]\nracine = %r\nbudget_octets = 0\n' % racine_lue)
        resultat_zero = T.lire_tokens_par_passage(config_budget_zero, [agent_ok])
        check("test_budget_octets_zero_rend_partiel_immediat",
              resultat_zero["partiel"] is True and resultat_zero["par_agent"] == {},
              "obtenu %r" % resultat_zero)

        # Budget de TEMPS : première itération passe (temps encore sous le
        # budget), la seconde le trouve dépassé — horloge FEINTE pour un
        # résultat déterministe, jamais une vraie course contre le temps.
        # Le tri est par RÉCENCE (mtime décroissant, M3), pas alphabétique :
        # des mtimes EXPLICITES remplacent ici l'ordre alphabétique d'origine
        # pour rester déterministe.
        T._cache.clear()
        agent_second = "d1b2c3d4e5f6a1b2"
        chemin_second = _ecrire_transcript(racine_lue, "session-2", agent_second, [
            _usage_ligne(input_tokens=1, output_tokens=1),
        ])
        maintenant = time.time()
        os.utime(chemin_second, (maintenant - 100, maintenant - 100))  # plus ancien
        os.utime(chemin_agent_ok, (maintenant, maintenant))            # plus récent
        config_budget_temps = _config(
            tmp, transcripts_toml='[transcripts]\nracine = %r\nbudget_secondes = 1\n' % racine_lue)
        valeurs = iter([0.0, 0.0, 5.0])
        ancien_monotonic = T.time.monotonic
        T.time.monotonic = lambda: next(valeurs)
        try:
            resultat_temps = T.lire_tokens_par_passage(
                config_budget_temps, [agent_ok, agent_second])
        finally:
            T.time.monotonic = ancien_monotonic
        check("test_budget_secondes_epuise_rend_partiel",
              resultat_temps["partiel"] is True,
              "obtenu %r" % resultat_temps)
        check("test_budget_secondes_premier_agent_traite_avant_epuisement",
              agent_ok in resultat_temps["par_agent"],
              "l'agent le plus RÉCENT (tri par récence, M3) doit être traité "
              "avant que le budget ne se révèle dépassé au suivant")

        # === Tri par récence, pas alphabétique (M3) ==========================
        # `agent_second` ("d...") est alphabétiquement APRÈS `agent_ok`
        # ("a...") mais son fichier est plus ANCIEN (mtime posé ci-dessus) :
        # sous un budget qui ne permet qu'UNE lecture réelle, c'est
        # `agent_ok` qui doit passer, pas parce qu'il est alphabétiquement
        # premier, mais parce qu'il est le plus RÉCENT. Preuve directe,
        # budget large en octets, un seul budget-temps qui coupe après le
        # premier candidat.
        T._cache.clear()
        valeurs_tri = iter([0.0, 0.0, 999.0])
        T.time.monotonic = lambda: next(valeurs_tri)
        try:
            resultat_tri = T.lire_tokens_par_passage(
                config_budget_temps, [agent_ok, agent_second])
        finally:
            T.time.monotonic = ancien_monotonic
        check("test_tri_par_recence_pas_alphabetique",
              agent_ok in resultat_tri["par_agent"] and agent_second not in resultat_tri["par_agent"],
              "obtenu %r — le plus RÉCENT doit passer avant le plus ancien, "
              "indépendamment de l'ordre alphabétique des agent_id" % resultat_tri)

        # === Mémoïsation (M3) =================================================
        T._cache.clear()
        agent_cache = "aaab2c3d4e5f6a1b"
        _ecrire_transcript(racine_lue, "session-1", agent_cache, [
            _usage_ligne(input_tokens=3, output_tokens=4),
        ])
        config_sans_budget = _config(tmp, transcripts_toml='[transcripts]\nracine = %r\n' % racine_lue)
        _lire_fichier_reel = T._lire_fichier
        appels = []

        def espion_lire_fichier(*a, **k):
            appels.append(a[0] if a else k.get("chemin"))
            return _lire_fichier_reel(*a, **k)

        T._lire_fichier = espion_lire_fichier
        try:
            r1 = T.lire_tokens_par_passage(config_sans_budget, [agent_cache])
            r2 = T.lire_tokens_par_passage(config_sans_budget, [agent_cache])
        finally:
            T._lire_fichier = _lire_fichier_reel
        attendu_cache = {"partiel": False, "par_agent":
                          {agent_cache: {"input_tokens": 3, "output_tokens": 4}}}
        check("test_cache_evite_une_seconde_lecture_disque",
              len(appels) == 1 and r1 == attendu_cache and r2 == attendu_cache,
              "lectures réelles : %d (attendu 1), r1=%r, r2=%r" % (len(appels), r1, r2))

        # Une lecture COUPÉE par le budget ne se met jamais en cache : sinon
        # `partiel` mentirait pour toujours sur ce fichier une fois le
        # budget redevenu généreux.
        T._cache.clear()
        agent_partiel = "bbbb2c3d4e5f6a1b"
        _ecrire_transcript(racine_lue, "session-1", agent_partiel, [
            _usage_ligne(input_tokens=9, output_tokens=1),
            _usage_ligne(input_tokens=9, output_tokens=1),
        ])
        config_budget_etroit = _config(
            tmp, transcripts_toml='[transcripts]\nracine = %r\nbudget_octets = 40\n' % racine_lue)
        resultat_coupe = T.lire_tokens_par_passage(config_budget_etroit, [agent_partiel])
        check("test_cache_ne_sert_jamais_une_lecture_partielle",
              resultat_coupe["partiel"] is True,
              "obtenu %r — pré-condition du test : la lecture doit être coupée" % resultat_coupe)
        cle_partielle = [c for c in T._cache if os.path.basename(c[0]).startswith("agent-%s" % agent_partiel)]
        check("test_cache_ne_contient_pas_la_cle_de_la_lecture_partielle",
              cle_partielle == [], "clés trouvées en cache pour une lecture coupée : %r" % cle_partielle)

        # === S5.7 — absence propre, jamais un zéro ===========================
        # `chmod 000` serait un faux positif EN ROOT (`PIEGES §43`) : on force
        # `PermissionError` par un espion, indépendant de l'UID qui exécute.
        T._cache.clear()
        agent_prive = "e1b2c3d4e5f6a1b2"
        chemin_prive = _ecrire_transcript(racine_lue, "session-1", agent_prive,
                                           [_usage_ligne(input_tokens=99, output_tokens=99)])

        def espion_refuse(chemin, *a, **k):
            if os.path.abspath(chemin) == os.path.abspath(chemin_prive):
                raise PermissionError(13, "Permission denied")
            return _ouvrir_reel(chemin, *a, **k)

        T.open = espion_refuse
        try:
            resultat_prive = T.lire_tokens_par_passage(config_racine, [agent_prive, agent_ok])
        finally:
            del T.open
        check("test_permission_refusee_rend_absence_pas_zero",
              agent_prive not in resultat_prive["par_agent"]
              and resultat_prive["par_agent"].get(agent_ok) == {"input_tokens": 7, "output_tokens": 10},
              "obtenu %r" % resultat_prive)

        # === Robustesse de lecture ============================================
        # Ces cas exercent `_lire_fichier` DIRECTEMENT : ils ne testent pas la
        # résolution de chemin, seulement la lecture bas niveau — la fixture
        # n'a donc pas besoin de respecter la disposition par session.
        zone_brute = os.path.join(tmp, "lecture-brute")
        agent_invalide = "f1b2c3d4e5f6a1b2"
        chemin_invalide = os.path.join(zone_brute, "agent-%s.jsonl" % agent_invalide)
        os.makedirs(zone_brute, exist_ok=True)
        with open(chemin_invalide, "w", encoding="utf-8") as fichier:
            fichier.write("{ceci n'est pas du json}\n")
            fichier.write(json.dumps(_usage_ligne(input_tokens=4, output_tokens=6)) + "\n")
            fichier.write("\n")  # ligne vide : ignorée
        lecture_invalide = T._lire_fichier(chemin_invalide, budget_octets=10_000)
        check("test_ligne_json_invalide_ignoree_lecture_continue",
              lecture_invalide is not None and lecture_invalide[0] == 4 and lecture_invalide[1] == 6,
              "obtenu %r" % (lecture_invalide,))

        agent_ligne_longue = "111b2c3d4e5f6a1b"
        chemin_ligne_longue = os.path.join(zone_brute, "agent-%s.jsonl" % agent_ligne_longue)
        ligne_valide = json.dumps(_usage_ligne(input_tokens=8, output_tokens=9))
        with open(chemin_ligne_longue, "w", encoding="utf-8") as fichier:
            # Ligne trop longue UNE FOIS LA BORNE ABAISSÉE (ci-dessous), mais
            # la ligne valide (105 caractères mesurés) doit, elle, tenir
            # dedans — sinon le test se piège lui-même.
            fichier.write('{"x": "%s"}\n' % ("Z" * 500))
            fichier.write(ligne_valide + "\n")
        ancienne_borne = T._TAILLE_LIGNE_MAX
        T._TAILLE_LIGNE_MAX = 200
        try:
            lecture = T._lire_fichier(chemin_ligne_longue, budget_octets=10_000)
        finally:
            T._TAILLE_LIGNE_MAX = ancienne_borne
        check("test_ligne_trop_longue_ignoree_pas_chargee_entiere",
              lecture is not None and lecture[0] == 8 and lecture[1] == 9,
              "obtenu %r" % (lecture,))

        check("test_fichier_absent_rend_none",
              T._lire_fichier(os.path.join(zone_brute, "agent-0000.jsonl"), 10_000) is None)

        # `lire_tokens_par_passage` sur une racine absente : dégradation propre.
        check("test_lire_tokens_racine_absente_rend_structure_vide",
              T.lire_tokens_par_passage(config_absente, [agent_ok]) ==
              {"partiel": False, "par_agent": {}})

        # === Atteignabilité contre la disposition RÉELLE ======================
        # C'est le cœur du correctif : une fixture qui rejoue une disposition
        # SUPPOSÉE (au lieu de mesurée) peut rester cohérente avec un code
        # tout aussi faux, et les deux passent au vert ensemble — exactement
        # ce qui s'est produit dans la version livrée de `feature-023`. Ce
        # test constate la disposition RÉELLE sur cette machine (si
        # disponible) et rejoue SA profondeur, jamais celle du docstring.
        reel = _reperer_disposition_reelle()
        if reel is None:
            print("  skip   test_atteignabilite_disposition_mesuree "
                  "(aucun transcript réel trouvé sur cette machine)")
        else:
            _chemin_projet_reel, segments = reel
            racine_mesuree = os.path.join(tmp, "disposition-mesuree")
            dossier = racine_mesuree
            for segment in segments[:-1]:
                dossier = os.path.join(dossier, segment)
            os.makedirs(dossier, exist_ok=True)
            agent_id_mesure = "9" * 16
            nom_fichier = "agent-%s.jsonl" % agent_id_mesure
            _ecrire_jsonl(os.path.join(dossier, nom_fichier),
                          [_usage_ligne(input_tokens=42, output_tokens=17)])
            config_mesuree = _config(
                tmp, transcripts_toml='[transcripts]\nracine = %r\n' % racine_mesuree)
            resultat_mesure = T.lire_tokens_par_passage(config_mesuree, [agent_id_mesure])
            check("test_atteignabilite_disposition_mesuree",
                  resultat_mesure["par_agent"].get(agent_id_mesure) ==
                  {"input_tokens": 42, "output_tokens": 17},
                  "obtenu %r — la disposition mesurée sur cette machine (profondeur "
                  "%d, segments %r) n'est pas atteinte par le module"
                  % (resultat_mesure["par_agent"], len(segments) - 1, segments))

        # === S5.5 — le module n'écrit rien (introspection AST) ===============
        # ⚠️ `PIEGES §54` : un oracle qui cherche un NOM de méthode se
        # détecterait lui-même sur un faux positif — `str.replace()` (utilisé
        # par `racine()` pour encoder `/` en `-`) porte le MÊME nom que
        # `os.replace()` (renommage de fichier). L'oracle ne flague donc que
        # les appels dont le RECEVEUR se résout textuellement à `os`,
        # `os.path` ou `shutil` — jamais le seul nom de méthode.
        def _receveur(attr):
            valeur = attr.value
            if isinstance(valeur, ast.Name):
                return valeur.id
            if isinstance(valeur, ast.Attribute) and isinstance(valeur.value, ast.Name):
                return "%s.%s" % (valeur.value.id, valeur.attr)
            return None

        with open(os.path.join(_ICI, "transcripts.py"), encoding="utf-8") as fichier:
            arbre = ast.parse(fichier.read(), filename="transcripts.py")
        appels_open = []
        appels_interdits = []
        _FONCTIONS_ECRITURE_OS = ("remove", "unlink", "rename", "replace", "rmdir",
                                   "mkdir", "makedirs", "truncate")
        _FONCTIONS_ECRITURE_SHUTIL = ("rmtree", "move", "copy", "copyfile", "copytree")
        for noeud in ast.walk(arbre):
            if not isinstance(noeud, ast.Call):
                continue
            if isinstance(noeud.func, ast.Name) and noeud.func.id == "open":
                mode = None
                if len(noeud.args) >= 2 and isinstance(noeud.args[1], ast.Constant):
                    mode = noeud.args[1].value
                for motclef in noeud.keywords:
                    if motclef.arg == "mode" and isinstance(motclef.value, ast.Constant):
                        mode = motclef.value.value
                appels_open.append(mode)
            elif isinstance(noeud.func, ast.Attribute):
                receveur = _receveur(noeud.func)
                if receveur in ("os", "os.path") and noeud.func.attr in _FONCTIONS_ECRITURE_OS:
                    appels_interdits.append("%s.%s" % (receveur, noeud.func.attr))
                elif receveur == "shutil" and noeud.func.attr in _FONCTIONS_ECRITURE_SHUTIL:
                    appels_interdits.append("%s.%s" % (receveur, noeud.func.attr))
        check("test_module_aucun_open_hors_lecture",
              all(m is None or "r" in m for m in appels_open),
              "modes trouvés : %r" % appels_open)
        check("test_module_aucun_appel_d_ecriture_ou_suppression",
              appels_interdits == [], "trouvés : %r" % appels_interdits)

        # Contre-épreuve : l'oracle DOIT détecter un vrai `os.remove(...)`
        # injecté dans un arbre jouet — sinon il ne prouve rien (mutation a).
        arbre_mutant = ast.parse("import os\ndef f():\n    os.remove('x')\n")
        trouve_mutant = any(
            isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
            and _receveur(n.func) == "os" and n.func.attr in _FONCTIONS_ECRITURE_OS
            for n in ast.walk(arbre_mutant))
        check("test_oracle_ast_detecte_un_vrai_os_remove", trouve_mutant)

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
        print("  (le compte ci-dessus est un MINORANT)")
        _code = 1
    sys.exit(_code)
