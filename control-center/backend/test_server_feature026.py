#!/usr/bin/env python3
"""Garde d'intégration HTTP pour `/api/conversation` (feature-026, écrite
AVANT le rebranchement de `server.py` — `ADR-0038`, registre `ATTENDU_ROUGE`).

    python3 control-center/backend/test_server_feature026.py

## Ce que ce fichier établit MAINTENANT, par exécution réelle (pas de module
absent en jeu ici : `server.py` et `config.py` existent déjà)

1. **Baseline documentée** (« Comportement actuel » de la spec) :
   `GET`/`POST /api/conversation` rendent `404` tant qu'aucun lancement
   `json-lines` n'est actif — c'est le défaut que `feature-026` corrige,
   PAS un livrable de ce cycle. Pinné ici pour que le diff du prochain lot
   se lise contre un fait mesuré, pas une impression.
2. **`Config` traverse déjà une section `[session]` inconnue sans la
   perdre** : `config.section("session")` rend le dict déclaré tel quel —
   fait établi par la fusion générique de `config.py` (`_fusionner`), avant
   même que `A1` (accesseurs dédiés `session_socket_tmux()` etc.) existe.

## Ce qui reste ATTENDU_ROUGE — server.py pas encore rebranché

`_conversation_lire`/`_conversation_envoyer` gardent, tels quels
aujourd'hui, la même garde `ecriture.lancement_conversation() is None`
(feature-022). Tant que A2/A3 n'ont pas rebranché ces deux méthodes sur
`session_tmux`/`fil`, une session tmux JETABLE réelle et déclarée en
configuration ne change RIEN à la réponse HTTP — exactement l'état que ce
fichier fige comme rouge nommé, pas une supposition.
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
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


ATTENDU_ROUGE = {
    # Les deux entrées ont fermé au lot 4 (backend-developer, A2/A3) :
    # `_conversation_lire`/`_conversation_envoyer` rebranchés sur
    # `session_tmux`/`fil` dès que `[session]` est déclarée — GET rend 503
    # (session Claude introuvable, aucun `claude` réel derrière la session
    # tmux jetable de ce test), POST rend 409 (panneau non au prompt,
    # heuristique) : ni l'un ni l'autre n'est plus le 404 générique
    # « n'accepte de message » d'avant ce lot. Voir le rapport de cette
    # passe pour la divergence avec le brief reçu (qui plaçait cette
    # clôture au lot frontend) — laissées enregistrées, la clause (2) aurait
    # cassé la suite dès ce lot.
}


def check_rouge(nom, condition, detail=""):
    global _tests
    entree = ATTENDU_ROUGE.get(nom)
    if condition:
        if entree is not None:
            _tests += 1
            _echecs.append(nom + "_ATTENDU_ROUGE_PASSE_SANS_ETRE_RETIRE")
            print("  ECHEC  %s : assertion VERTE mais l'entrée est encore dans "
                  "ATTENDU_ROUGE (clause 2) — la retirer" % nom)
        else:
            check(nom, True)
    else:
        if entree is not None:
            print("  (ATTENDU_ROUGE) %s : %s — clôture %s"
                  % (nom, detail, entree["lot_de_cloture"]))
        else:
            check(nom, False, detail)


requete = TSE.requete
_VALEUR_JETON = TSE._VALEUR_JETON


def _construire_groupe_avec_session(socket_tmux, nom_session, repertoire_transcripts):
    """Réécrit la config TOML d'un `TSE.Groupe` déjà construit pour y
    ajouter `[session]`, puis recharge — plus simple et plus sûr qu'un
    override de constructeur (`TSE.Groupe.__init__` écrit et charge la
    config en une seule passe)."""
    g = TSE.Groupe(commandes={}, ecrivains_simultanes=1)
    chemin_toml = os.path.join(g._tmp, "config.toml")
    with open(chemin_toml, "a", encoding="utf-8") as f:
        f.write("\n[session]\n")
        f.write("socket_tmux = %r\n" % socket_tmux)
        f.write("nom = %r\n" % nom_session)
        f.write("repertoire_transcripts = %r\n" % repertoire_transcripts)
    g.config = g.srv.C.charger(chemin=chemin_toml, racine_projet=g.racine_projet)
    g.serveur.etat.config = g.config
    return g


def test_baseline_get_404_sans_lancement():
    g = TSE.Groupe(commandes={})
    try:
        code, corps = requete(g.port, "GET", "/api/conversation",
                               {"Authorization": "Bearer " + g.jeton_valeur})
        check("BASELINE_get_conversation_404_sans_lancement", code == 404,
              "obtenu %r %r (comportement ACTUEL documenté par la spec, pas un défaut)" % (code, corps))
        check("BASELINE_get_conversation_raison_json_lines",
              "n'accepte de message" in corps, corps)
    finally:
        g.fermer()


def test_baseline_post_404_sans_lancement():
    g = TSE.Groupe(commandes={})
    try:
        code, corps = requete(g.port, "POST", "/api/conversation",
                               {"Authorization": "Bearer " + g.jeton_valeur,
                                "Content-Type": "application/json"},
                               b'{"texte": "bonjour"}')
        check("BASELINE_post_conversation_404_sans_lancement", code == 404, "obtenu %r %r" % (code, corps))
    finally:
        g.fermer()


def test_config_section_session_traverse_sans_accesseur_dedie():
    with tempfile.TemporaryDirectory(prefix="feature026-cfg-") as dossier:
        g = _construire_groupe_avec_session(
            os.path.join(dossier, "un.sock"), "claude-kit-test", dossier)
        try:
            section = g.config.section("session")
            check("CONFIG_section_session_traverse_le_chargement",
                  section.get("nom") == "claude-kit-test"
                  and section.get("socket_tmux") == os.path.join(dossier, "un.sock")
                  and section.get("repertoire_transcripts") == dossier,
                  "obtenu %r" % (section,))
        finally:
            g.fermer()


def _demarrer_tmux_jetable(dossier, nom_session):
    """Voir `test_session_tmux.py::_demarrer_tmux_jetable` pour la mesure qui
    a fait préférer `lsof -t <socket>` à `#{pid}`/`PPid` : sur cette machine
    `#{pid}` d'un pane rend DÉJÀ le PID du serveur, remonter un `PPid`
    supplémentaire cible le mauvais processus (souvent `1`) et laisse le
    serveur jetable orphelin."""
    tmux_bin = shutil.which("tmux")
    if not tmux_bin:
        return None, None
    socket_chemin = os.path.join(dossier, "socket-%s" % nom_session)
    subprocess.run([tmux_bin, "-S", socket_chemin, "new-session", "-d",
                     "-s", nom_session, "-x", "80", "-y", "24"],
                    check=True, capture_output=True)
    pid = None
    lsof_bin = shutil.which("lsof")
    if lsof_bin:
        sortie = subprocess.run([lsof_bin, "-t", socket_chemin], capture_output=True, text=True)
        for ligne in sortie.stdout.split():
            try:
                pid = int(ligne)
                break
            except ValueError:
                continue
    if pid is None:
        sortie = subprocess.run([tmux_bin, "-S", socket_chemin, "list-panes", "-a", "-F", "#{pid}"],
                                 check=True, capture_output=True, text=True)
        pid = int(sortie.stdout.strip().splitlines()[0])
    return socket_chemin, pid


def test_session_declaree_et_vivante_ne_change_rien_encore():
    """`ATTENDU_ROUGE` : une session tmux JETABLE réelle, déclarée en
    configuration, devrait faire sortir `GET`/`POST /api/conversation` de
    leur `404` générique une fois A2/A3 livrés. Aujourd'hui : rien n'a
    changé, `server.py` ignore encore totalement `[session]`."""
    with tempfile.TemporaryDirectory(prefix="feature026-live-") as dossier:
        socket_chemin, pid = _demarrer_tmux_jetable(dossier, "claude-kit-test")
        if socket_chemin is None:
            check_rouge("D_get_conversation_reflete_la_session_declaree_pas_404", False, "tmux introuvable")
            check_rouge("D_post_conversation_sans_lancement_json_lines_nest_plus_404_generique", False, "tmux introuvable")
            return
        try:
            g = _construire_groupe_avec_session(socket_chemin, "claude-kit-test", dossier)
            try:
                code, corps = requete(g.port, "GET", "/api/conversation",
                                       {"Authorization": "Bearer " + g.jeton_valeur})
                check_rouge("D_get_conversation_reflete_la_session_declaree_pas_404",
                             code != 404 or "n'accepte de message" not in corps,
                             "obtenu %r %r — server.py ignore encore [session]" % (code, corps))

                code2, corps2 = requete(g.port, "POST", "/api/conversation",
                                         {"Authorization": "Bearer " + g.jeton_valeur,
                                          "Content-Type": "application/json"},
                                         b'{"texte": "bonjour depuis le test"}')
                check_rouge("D_post_conversation_sans_lancement_json_lines_nest_plus_404_generique",
                             not (code2 == 404 and "n'accepte de message" in corps2),
                             "obtenu %r %r — server.py ignore encore [session]" % (code2, corps2))
            finally:
                g.fermer()
        finally:
            try:
                os.kill(pid, 15)
            except OSError:
                pass
            time.sleep(0.2)


def test_A2_destinataire_ecrit_dans_la_ligne_de_journal():
    """A1/A2 (reboucle GATE P2) : POST /api/conversation, chemin session
    tmux — la ligne ÉCRITE dans `var/conversations/session-<nom>.jsonl`
    doit porter EXACTEMENT `{ts, texte, destinataire, envoye}`, jamais
    l'un manquant. Lit la ligne réellement écrite sur disque, jamais
    seulement « le fichier existe » — c'est la lecture qui rend cette garde
    mutable (retirer `destinataire` de l'écriture doit la faire mourir)."""
    if not shutil.which("tmux"):
        check("A2_destinataire_present_dans_la_ligne", False, "tmux introuvable")
        return
    with tempfile.TemporaryDirectory(prefix="feature026-a2-") as dossier:
        nom = "claude-kit-test-a2"
        socket_chemin, pid = _demarrer_tmux_jetable(dossier, nom)
        if socket_chemin is None:
            check("A2_destinataire_present_dans_la_ligne", False, "tmux introuvable")
            return
        g = _construire_groupe_avec_session(socket_chemin, nom, dossier)
        chemin_journal = None
        try:
            import server as SRV
            chemin_journal = SRV._chemin_conversation_session(nom)
            requete(g.port, "POST", "/api/conversation",
                    {"Authorization": "Bearer " + g.jeton_valeur,
                     "Content-Type": "application/json"},
                    b'{"texte": "message A2"}')
            with open(chemin_journal, encoding="utf-8") as f:
                lignes = [l for l in f if l.strip()]
            check("A2_ligne_ecrite", len(lignes) == 1, "obtenu %d ligne(s)" % len(lignes))
            if lignes:
                objet = json.loads(lignes[-1])
                check("A2_destinataire_present_dans_la_ligne",
                      set(objet.keys()) == {"ts", "texte", "destinataire", "envoye"},
                      "clés obtenues : %r" % (sorted(objet.keys()),))
                check("A2_destinataire_non_nul",
                      isinstance(objet.get("destinataire"), str) and objet["destinataire"],
                      "obtenu %r" % (objet.get("destinataire"),))
        finally:
            g.fermer()
            try:
                os.kill(pid, 15)
            except OSError:
                pass
            time.sleep(0.2)
            if chemin_journal:
                try:
                    os.remove(chemin_journal)
                except OSError:
                    pass


def test_B1_fusion_ajoute_un_message_absent_du_transcript():
    """B1 : un message mis en file par `claude` (jamais `type: user` tant
    que non rejoué) doit ressortir de la fusion — le cockpit sait ce qu'il
    a envoyé, le transcript ne le sait pas encore."""
    srv_direct, tmp_direct, _ = TSE._importer_server_clone()
    entrees_cockpit = [{"ts": "2026-09-22T20:43:10.000Z", "texte": "message queued",
                        "destinataire": "session tmux 'x'", "envoye": True}]
    fusion = srv_direct._fusionner_avec_journal_cockpit([], entrees_cockpit)
    check("B1_message_absent_du_transcript_ajoute",
          len(fusion) == 1 and fusion[0]["texte"] == "message queued"
          and fusion[0]["role"] == "user" and fusion[0]["prompt_source"] == "cockpit",
          "obtenu %r" % (fusion,))


def test_B1_fusion_dedoublonne_meme_texte_meme_fenetre():
    """B1 (dédoublonnage) : un message qui finit AUSSI en `type: user`
    (même texte, horodatage proche) n'est ajouté qu'UNE fois."""
    srv_direct, tmp_direct, _ = TSE._importer_server_clone()
    message_transcript = {"role": "user", "texte": "deja vu", "prompt_source": "typed",
                          "ts": "2026-09-22T20:43:10.000Z"}
    entrees_cockpit = [{"ts": "2026-09-22T20:43:12.000Z", "texte": "deja vu",
                        "destinataire": "x", "envoye": True}]
    fusion = srv_direct._fusionner_avec_journal_cockpit([message_transcript], entrees_cockpit)
    check("B1_dedoublonne_meme_texte_fenetre_proche",
          len(fusion) == 1, "obtenu %r message(s), attendu 1 (pas de doublon)" % (len(fusion),))


def test_B1_fusion_ne_dedoublonne_pas_hors_fenetre():
    """Deux envois du MÊME texte à des minutes d'écart sont deux messages
    distincts — le dédoublonnage ne doit pas les confondre."""
    srv_direct, tmp_direct, _ = TSE._importer_server_clone()
    message_transcript = {"role": "user", "texte": "encore", "prompt_source": "typed",
                          "ts": "2026-09-22T20:00:00.000Z"}
    entrees_cockpit = [{"ts": "2026-09-22T20:10:00.000Z", "texte": "encore",
                        "destinataire": "x", "envoye": True}]
    fusion = srv_direct._fusionner_avec_journal_cockpit([message_transcript], entrees_cockpit)
    check("B1_ne_dedoublonne_pas_hors_fenetre_10min",
          len(fusion) == 2, "obtenu %r, attendu 2 messages distincts" % (len(fusion),))


def test_B1a_message_jamais_envoye_absent_du_fil():
    """B1a/B1c(1) (revue de code) : une entrée `envoye: false` (message
    JAMAIS parti — refus 409/503, ou échec `tmux`) ne doit JAMAIS
    apparaître dans le fil fusionné. Mesuré sur le journal de production :
    5 tentatives refusées du même texte s'affichaient comme 5 messages
    envoyés avant ce correctif."""
    srv_direct, tmp_direct, _ = TSE._importer_server_clone()
    entrees_cockpit = [
        {"ts": "2026-09-22T20:43:10.000Z", "texte": "tentative refusee", "envoye": False},
        {"ts": "2026-09-22T20:43:11.000Z", "texte": "tentative refusee", "envoye": False},
    ]
    fusion = srv_direct._fusionner_avec_journal_cockpit([], entrees_cockpit)
    check("B1a_envoye_false_absent_du_fil", fusion == [], "obtenu %r" % (fusion,))


def test_B1b_refuse_puis_reessaye_avec_succes_une_seule_occurrence():
    """B1b (revue de code) : la MÊME tentative, refusée puis réessayée avec
    succès plus de 30 s après (mesuré sur le journal réel), ne doit
    apparaître qu'UNE FOIS — jamais deux."""
    srv_direct, tmp_direct, _ = TSE._importer_server_clone()
    entrees_cockpit = [
        {"ts": "2026-09-22T20:43:10.000Z", "texte": "reessai", "envoye": False},
        {"ts": "2026-09-22T20:44:20.000Z", "texte": "reessai", "envoye": True},  # +70 s, succès
    ]
    fusion = srv_direct._fusionner_avec_journal_cockpit([], entrees_cockpit)
    check("B1b_refuse_puis_succes_une_seule_occurrence",
          len(fusion) == 1 and fusion[0]["texte"] == "reessai",
          "obtenu %r, attendu 1 occurrence" % (fusion,))


def test_message_sans_ts_ne_remonte_pas_en_tete():
    """Revue de code : un message SANS `ts` comparable (que
    `interpreter_ligne` autorise) ne doit pas être trié en TÊTE (ancien
    `or 0.0` -> epoch 1970) — il doit rester APRÈS les messages qui ont un
    horodatage réel."""
    srv_direct, tmp_direct, _ = TSE._importer_server_clone()
    avec_ts = {"role": "user", "texte": "recent", "prompt_source": "typed",
              "ts": "2026-09-22T20:00:00.000Z"}
    sans_ts = {"role": "assistant", "texte": "sans horodatage", "prompt_source": None, "ts": None}
    fusion = srv_direct._fusionner_avec_journal_cockpit([sans_ts, avec_ts], [])
    check("message_sans_ts_reste_apres_celui_qui_en_a_un",
          fusion[-1]["texte"] == "sans horodatage" and fusion[0]["texte"] == "recent",
          "obtenu %r" % ([m["texte"] for m in fusion],))


def test_B2_bornes_inchangees_apres_fusion():
    """B2 : la fusion ne doit jamais laisser passer plus de
    `F.MAX_MESSAGES_DEFAUT` messages — au-delà, `tronque` devient vrai."""
    srv_direct, tmp_direct, _ = TSE._importer_server_clone()
    import fil as FIL
    entrees_cockpit = [{"ts": "2026-09-22T20:%02d:00.000Z" % i, "texte": "m%d" % i,
                        "destinataire": "x", "envoye": True} for i in range(50)]
    messages, tronque = srv_direct._fusionner_et_borner([], False, entrees_cockpit)
    check("B2_borne_max_messages_respectee",
          len(messages) == FIL.MAX_MESSAGES_DEFAUT,
          "obtenu %d messages, attendu %d" % (len(messages), FIL.MAX_MESSAGES_DEFAUT))
    check("B2_tronque_annonce_quand_fusion_depasse", tronque is True)


def main():
    print("== test_server_feature026.py — intégration /api/conversation ==")
    test_baseline_get_404_sans_lancement()
    test_baseline_post_404_sans_lancement()
    test_config_section_session_traverse_sans_accesseur_dedie()
    test_session_declaree_et_vivante_ne_change_rien_encore()
    test_A2_destinataire_ecrit_dans_la_ligne_de_journal()
    test_B1_fusion_ajoute_un_message_absent_du_transcript()
    test_B1_fusion_dedoublonne_meme_texte_meme_fenetre()
    test_B1_fusion_ne_dedoublonne_pas_hors_fenetre()
    test_B1a_message_jamais_envoye_absent_du_fil()
    test_B1b_refuse_puis_reessaye_avec_succes_une_seule_occurrence()
    test_message_sans_ts_ne_remonte_pas_en_tete()
    test_B2_bornes_inchangees_apres_fusion()

    for cle, entree in ATTENDU_ROUGE.items():
        check("ATTENDU_ROUGE_%s_porte_un_lot_de_cloture_nomme" % cle,
              bool(entree.get("lot_de_cloture")))

    print("\n%d cas, %d echec(s)" % (_tests, len(_echecs)))
    for e in _echecs:
        print("  - %s" % e)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
