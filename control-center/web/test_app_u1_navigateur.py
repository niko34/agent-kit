#!/usr/bin/env python3
"""A1bis — U1 de `feature-021` appliquée, garde de NON-RÉGRESSION PAR
EXÉCUTION (feature-028, lot A1).

    python3 control-center/web/test_app_u1_navigateur.py

Pourquoi ce fichier existe, et pourquoi aucun autre ne suffisait
-----------------------------------------------------------------------------
`feature-021` (spec CLOSE) porte, dans sa section « U1 — ce qui disparaît
pour de bon », un verdict écrit PAR SECTION : `agents` supprimée entière,
`developper` moins deux blocs, `cycles` moins `.table-passages`, `fichiers`
moins la liste des commits, `evenements` supprimée comme panneau permanent.
Sa check-list de clôture portait `F7 — structure mono-écran ; 0
role="tab"` : cette garde vérifiait **la lettre** (aucun `role="tab"`, vrai)
et **jamais la chose** (l'ancien tableau de bord a disparu, faux). Résultat
mesuré le 2026-09-22 (feature-028) : **un seul verdict sur six avait été
appliqué**, et la dette a traversé une revue de code, une campagne de
mutation et une clôture complète sans qu'aucune garde ne la voie.

Ce fichier est la garde qui manquait. Elle ne relit pas une liste tenue à la
main (PIEGES §21) : elle **dérive** ses sections de la table `U1` elle-même,
lue dans la spec CLOSE — si la table change de forme ou de contenu sans que
cette garde soit mise à jour, la clause miroir ci-dessous ÉCHOUE (elle ne se
tait jamais). Le mappage section → sélecteur DOM reste, lui, tenu à la main
(comme `rôle(encre)` dans F5b de `feature-021` — une seule énumération
tolérée, PARCE QU'aucun artefact ne la porte), mais il est soumis à la même
clause miroir : toute section de la table sans mappage déclaré est un ÉCHEC.

`systeme` n'est PAS actionnée par la dérivation `U1` de cette garde (phases
A/B) : sa MIGRATION (Divergences / Budget max / Écrivains en pastilles d'un
panneau « État du dépôt ») reste BLOQUÉE — ce panneau n'existe pas (fait
historique de la spec CLOSE, immuable). L'inventer supprimerait
l'information ; la garde le dit EXPLICITEMENT plutôt que de prétendre une
conformité qui n'existe pas.

⚠️ Le 2026-09-23, l'humain a tranché AU-DELÀ de `U1` : « Supprime système. Je
ne souhaite pas que ça aille ailleurs. » — retrait sec de la section entière,
SANS migration, une décision plus large que ce que `U1` réclamait. La phase C
porte trois checks `DH20260923_*` pour cette décision précise, distincts des
`A1bis_*` dérivés de `U1` — ne pas les confondre : `U1` ne dit pas ça.

⚠️ Le 2026-09-23, l'humain a tranché une seconde fois AU-DELÀ de `U1` :
« fichiers : retirée, et la consultation des diffs ne va nulle part » — la
section « Fichiers touchés » disparaît ENTIÈRE (pas seulement la liste des
commits que `U1` visait), et `ouvrirDiff` avec elle (code mort, plus aucun
appelant). Quatre checks `DH20260923_fichiers_*` couvrent cette décision,
également distincts des `A1bis_fichiers_*` dérivés de `U1` : `U1` exigeait
seulement le retrait de la liste des commits (la liste des fichiers touchés,
elle, restant affichée) — cette décision va plus loin et retire la section
tout entière. Les deux jeux de checks ne se contredisent pas : `A1bis_
fichiers_*` reste vrai pour ce que `U1` dit (aucun `.fsujet`, ce qui est
trivialement vrai quand la section entière a disparu) ; `DH20260923_
fichiers_*` dit ce que `U1` ne dit pas.

⚠️ Une TROISIÈME décision, AU-DELÀ de `U1` elle aussi, mais d'une nature
différente : `demande` (« Que souhaitez-vous développer ? ») n'a JAMAIS été
visée par `U1` — elle en était explicitement EXEMPTÉE (A2 de la spec, GATE)
tant que le `+` restait inerte. Une fois câblé et vérifié (feature-028, lot
B), l'humain a tranché (2026-09-23, 03:10) : « la fonction "ajouter un
élément" sert justement à ça » — `demande` retirée (lot C2), `#add-item-
dialog` (le `+`) en est le remplaçant, MÊME machine à états
(`SURFACES_REDACTION`), jamais un second chemin. Neuf checks
`DH20260923_demande_*` couvrent cette décision : sept d'ABSENCE (les six
identifiants du formulaire et la clé `demande` de `SURFACES_REDACTION`,
qui n'a pas de fonction de rendu dédiée à tester) et deux de PRÉSENCE
ATTEIGNABLE du remplaçant (B6 : jamais une capacité retirée sans preuve
d'exécution qu'un chemin de rechange existe).

Méthode : même architecture que `test_app_classes_navigateur.py` —
`app.css`/`diagramme.js`/`app.js` servis par un vrai serveur HTTP en mémoire
(PIEGES §10), la page enveloppe (CSP oblige, PIEGES §9) chargée en `file://`,
le corps HTML de la page enveloppe est le VRAI `<body>` d'`index.html`.
Chaque section actionnable reçoit un scénario qui aurait peuplé le contenu
disparu S'IL EXISTAIT ENCORE (données représentatives, PIEGES §38) — la
garde échoue donc aussi si une réintroduction partielle laisse le mécanisme
de rendu vivant mais son affichage éteint par accident, plutôt que par
suppression réelle.

Saute proprement si Chromium OU `node` est introuvable.
"""

HARNAIS_NAVIGATEUR = True

import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import html as _html
from http.server import ThreadingHTTPServer

_ICI = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.join(os.path.dirname(_ICI), "backend")
sys.path.insert(0, _BACKEND)
import config as C  # noqa: E402
import server as SRV  # noqa: E402

_RACINE = os.path.dirname(os.path.dirname(_ICI))
_SPEC_U1 = os.path.join(
    _RACINE, "specs", "features", "done",
    "feature-021-revenir-a-un-tableau-de-bord-unifie.md",
)

_tests = 0
_echecs = []


def check(nom, condition, detail=""):
    global _tests
    _tests += 1
    if condition:
        print("  ok     %s" % nom)
    else:
        _echecs.append(nom)
        print("  ECHEC  %s%s" % (nom, (" : " + detail) if detail else ""))


def trouver_navigateur():
    for nom in ("chromium", "chromium-browser", "google-chrome"):
        chemin = shutil.which(nom)
        if chemin:
            return chemin
    return None


# Delai maximal d'un lancement Chromium, en secondes (bug-022, rouvert le
# 2026-09-27 par son propre critere longitudinal — voir `_lancer_navigateur`).
# Nomme plutot qu'ecrit en dur : le meme fichier en portait jusqu'a TROIS
# occurrences, et un seuil a trois endroits se corrige a deux.
_DELAI_CHROMIUM_S = 120


def _lancer_navigateur(commande):
    """Lance `commande` (un appel Chromium), avec une seule reprise si la
    premiere tentative expire (bug-022).

    Le seuil vit dans `_DELAI_CHROMIUM_S` et vaut 120 s depuis le 2026-09-27.
    Les 30 s d'origine se justifiaient par une marge LOCALE de 6,5x (3
    lancements concurrents brides a 2 vCPU, 4,6 s). Le critere longitudinal
    pose par bug-022 -- « si l'avertissement apparait en CI, rouvrir le
    dossier » -- s'est declenche DEUX runs de suite sur le coureur GitHub :
    run 36243211048 (1 avertissement, reprise reussie) puis run 36305731821
    (les DEUX tentatives expirees, job rouge). Or dans ce meme journal, les
    lancements SUIVANTS tiennent en ~12 s : le seul qui expire est le PREMIER
    du job, un demarrage a FROID. 30 s etait donc a l'interieur de la
    distribution normale d'un demarrage a froid, pas au-dela — ce n'etait pas
    une VM anormale, c'etait un seuil trop juste, et la marge de 6,5x mesurait
    une machine qui n'est pas celle qui echoue.

    Cette reprise absorbe le residu d'exposition SANS masquer une vraie
    regression : elle ne rattrape QUE `subprocess.TimeoutExpired`, jamais un
    echec d'assertion ni un code de retour non nul, et elle est UNIQUE (pas de
    boucle). L'avertissement reste imprime bruyamment : c'est toujours le
    critere longitudinal -- s'il reapparait en CI, le seuil est a REMESURER
    sur la machine qui echoue, jamais a augmenter au juge."""
    try:
        return subprocess.run(commande, capture_output=True, text=True,
                              timeout=_DELAI_CHROMIUM_S)
    except subprocess.TimeoutExpired:
        print("!" * 70, file=sys.stderr)
        print(f"AVERTISSEMENT bug-022 : lancement Chromium expire apres "
              f"{_DELAI_CHROMIUM_S} s, nouvelle tentative unique. Si ceci "
              f"apparait en CI, rouvrir bug-022 (voir "
              f"control-center/PIEGES.md).", file=sys.stderr)
        print("!" * 70, file=sys.stderr)
        return subprocess.run(commande, capture_output=True, text=True,
                              timeout=_DELAI_CHROMIUM_S)


# ============================================================================
# Phase A — DÉRIVATION de la table U1 depuis la spec CLOSE (PIEGES §21)
# ============================================================================

def deriver_table_u1():
    """Lit `### U1 — ce qui disparaît pour de bon` dans la spec CLOSE et
    rend un dict {section: {verdict, retire, cout}} — jamais une recopie à
    la main de son contenu. Échoue bruyamment (jamais un saut silencieux) si
    la spec est absente, ou si la section U1 n'y est plus."""
    if not os.path.exists(_SPEC_U1) or os.path.getsize(_SPEC_U1) == 0:
        raise RuntimeError(
            "ATTEIGNABILITE : spec close feature-021 introuvable ou vide à %s"
            % _SPEC_U1
        )
    texte = open(_SPEC_U1, "r", encoding="utf-8").read()
    m = re.search(
        r"### U1 — ce qui disparaît pour de bon\s*\n\n(\|.*\|\n(?:\|.*\|\n)+)",
        texte,
    )
    if not m:
        raise RuntimeError(
            "ATTEIGNABILITE : section « U1 — ce qui disparaît pour de bon » "
            "introuvable dans la spec — la garde ne peut rien dériver."
        )
    lignes = [l for l in m.group(1).strip().split("\n") if l.strip()]
    # Ligne 0 = en-tête (Section|Verdict|Ce qui est retiré|Coût assumé),
    # ligne 1 = séparateur `|---|---|---|---|`, le reste = données.
    table = {}
    for ligne in lignes[2:]:
        cellules = [c.strip() for c in ligne.strip().strip("|").split("|")]
        if len(cellules) < 4:
            continue
        section = cellules[0].strip("` ")
        table[section] = {
            "verdict": cellules[1], "retire": cellules[2], "cout": cellules[3],
        }
    return table


# ============================================================================
# Phase B — mappage section → vérification (UNE énumération tolérée, PIEGES
# §21 : aucun artefact ne porte ce mappage, comme `rôle(encre)` dans F5b de
# feature-021 — soumis à la clause miroir juste en dessous).
# ============================================================================

# Sections dont U1 exige une suppression INCONDITIONNELLE (aucune migration
# à trouver au préalable) — ce sont les cinq que ce lot applique réellement.
SECTIONS_ACTIONNABLES = {
    "agents": "ancre_retire_contient_ul_agents",
    "developper": "ancre_retire_contient_compteur_prompt",
    "cycles": "ancre_retire_contient_table_passages",
    "fichiers": "ancre_retire_contient_liste_des_commits",
    "evenements": "ancre_retire_contient_panneau_permanent",
}
# `systeme` : migration BLOQUÉE ce lot (panneau « État du dépôt » absent) —
# NOMMÉE ici pour que la clause miroir la reconnaisse, jamais actionnée.
SECTIONS_BLOQUEES = {"systeme": "ancre_verdict_contient_migrent_en_pastilles"}

_ANCRES = {
    "ancre_retire_contient_ul_agents": ("agents", "retire", "ul#agents"),
    "ancre_retire_contient_compteur_prompt": ("developper", "retire", "#compteur-prompt"),
    "ancre_retire_contient_table_passages": ("cycles", "verdict", "`.table-passages`"),
    "ancre_retire_contient_liste_des_commits": ("fichiers", "verdict", "Liste des commits"),
    "ancre_retire_contient_panneau_permanent": ("evenements", "verdict", "SUPPRIMÉE comme panneau permanent"),
    "ancre_verdict_contient_migrent_en_pastilles": ("systeme", "cout", "migrent en pastilles"),
}


def verifier_derivation(table):
    """Clause miroir : la table dérivée doit contenir EXACTEMENT les six
    sections que ce fichier connaît (ni plus, ni moins), et le fragment de
    texte que chaque ancre cite doit toujours y être — sinon la spec a
    changé sous les pieds de cette garde, et elle le dit au lieu de se
    taire."""
    attendu = set(SECTIONS_ACTIONNABLES) | set(SECTIONS_BLOQUEES)
    obtenu = set(table)
    check("A1bis_derivation_meme_ensemble_de_sections", attendu == obtenu,
          "attendu %s, obtenu %s (table U1 a changé : mettre à jour ce "
          "fichier, ne pas ignorer l'écart)" % (sorted(attendu), sorted(obtenu)))
    for nom_ancre, (section, colonne, fragment) in _ANCRES.items():
        cellule = table.get(section, {}).get(colonne, "")
        check("A1bis_" + nom_ancre, fragment in cellule,
              "fragment %r absent de la colonne %r de la ligne %r (obtenu : %r)"
              % (fragment, colonne, section, cellule))


# ============================================================================
# Phase C — exécution réelle : chaque section actionnable reçoit un scénario
# qui aurait peuplé le contenu disparu s'il existait encore.
# ============================================================================

_SCRIPT_MESURE = r"""
(function () {
  var out = { erreur: null };
  try {
    function passage(o) {
      return {
        agent: o.agent, debut: o.debut, duree_ms: o.duree_ms || 5000,
        outils: o.outils || 0, fichiers: o.fichiers || [],
        echecs: o.echecs || 0, termine: o.termine !== false,
        etat: o.etat, type: o.type || "sousagent", agent_id: o.agent_id,
      };
    }

    // -- `agents` : scénario représentatif, comme avant la suppression -----
    out.rendreAgentsExiste = (typeof rendreAgents === "function");
    out.elementAgentsExiste = !!document.getElementById("agents");
    out.elementTitreAgentsExiste = !!document.getElementById("titre-agents");
    out.classeAgentsPresenteQuelquePart = !!document.querySelector(".agents");

    // -- `developper` : #compteur-prompt, et le champ reste utilisable ------
    // `#spec-prompt`/`demande` retirés (feature-028, lot C2, une fois B3
    // vérifié) : `#item-description` (`#add-item-dialog`, le `+`) est
    // désormais le SEUL champ de texte libre du flux de rédaction — jamais
    // affublé d'un compteur non plus (`#compteur-prompt` n'a pas survécu
    // avec `demande`, jamais réapparu ailleurs).
    out.elementCompteurPromptExiste = !!document.getElementById("compteur-prompt");
    var champPrompt = document.getElementById("item-description");
    if (champPrompt) {
      champPrompt.value = "un besoin décrit en détail, sans compteur";
      champPrompt.dispatchEvent(new Event("input", { bubbles: true }));
    }
    out.champPromptToujoursPresent = !!champPrompt;

    // -- `cycles` : 45 passages (> LIMITE_PASSAGES_VISIBLES, ancien seuil de
    // repli de la table) — si `.table-passages`/`.action-repli` réapparaissait
    // partiellement, ce scénario le déclencherait.
    // ⚠️ RECIBLÉ (feature-028, lot C1, décision humaine 1B) : `rendreCycles`/
    // `#workflows`/`.cycle-bouton`/`.maillon` (l'accordéon « Cycles » ENTIER)
    // ont disparu à leur tour — plus de chaîne à compter. Rendu désormais
    // via `rendreGrapheCyclePrincipal` (le SEUL endroit qui affiche un cycle
    // depuis ce lot), en vérifiant que les 45 segments restent TOUS
    // représentés comme disques — aucune limite n'a été réintroduite en
    // silence dans le remplaçant.
    var passagesNombreux = [];
    for (var i = 0; i < 45; i++) {
      passagesNombreux.push(passage({
        agent: "agent-" + String(i).padStart(3, "0"),
        debut: "2026-09-18T09:00:" + String(i).padStart(2, "0") + ".000Z",
        outils: 1, termine: true, etat: "termine",
      }));
    }
    var wfLong = {
      workflow_id: "u1-cycles#0", indice_cycle: 0,
      debut: "2026-09-18T09:00:00.000Z", fin_observee: "2026-09-18T09:10:00.000Z",
      fin_observee_absente: false, bornage: "session-entiere", borne_par: null,
      segments: passagesNombreux, passages: passagesNombreux,
      cycles_total: 1, evenements_hors_session: 0,
    };
    dernierEtat = {
      workflows: [wfLong], cycles_total: 1, evenements_hors_session: 0,
      git: { depot: false, touches: [] }, agents: [],
    };
    rendreGrapheCyclePrincipal(dernierEtat);
    out.tableDePassagesPresenteQuelquePart = !!document.querySelector("table");
    out.boutonRepliPresentQuelquePart = !!document.querySelector(".action-repli");
    out.accordeonWorkflowsExiste = !!document.getElementById("workflows");
    out.elementTitreCyclesExiste = !!document.getElementById("titre-cycles");
    out.elementLegendeCyclesExiste = !!document.getElementById("legende-cycles");
    out.elementPiedCyclesExiste = !!document.getElementById("pied-cycles");
    out.rendreCyclesExiste = (typeof rendreCycles === "function");
    out.construireProprietesExiste = (typeof construireProprietes === "function");
    out.construireChaineEtNotesExiste = (typeof construireChaineEtNotes === "function");
    out.classeMaillonPresenteQuelquePart = !!document.querySelector(".maillon");
    out.classeCycleBoutonPresenteQuelquePart = !!document.querySelector(".cycle-bouton");
    // Non-régression positive : les 45 passages restent TOUS représentés,
    // désormais comme disques du graphe principal (`.agent-node`).
    out.nombreDeDisques = document.querySelectorAll("#cycle-canvas .agent-node").length;

    // -- `fichiers` : `U1` visait seulement la liste des commits (`.fsujet`) ;
    // ce point reste trivialement vrai (aucun `.fsujet` NULLE PART, la
    // section entière ayant disparu — décision humaine du 2026-09-23,
    // AU-DELÀ de U1). `rendreFichiers` N'EST PLUS APPELÉE ICI : la fonction
    // elle-même n'existe plus (l'appeler ferait échouer tout le script,
    // ATTEIGNABILITE bruyante plutôt qu'un saut silencieux).
    out.elementFsujetPresentQuelquePart = !!document.querySelector(".fsujet");
    out.elementFichiersExiste = !!document.getElementById("fichiers");
    out.elementTitreFichiersExiste = !!document.getElementById("titre-fichiers");
    out.rendreFichiersExiste = (typeof rendreFichiers === "function");
    out.ouvrirDiffExiste = (typeof ouvrirDiff === "function");

    // -- `evenements` : plus de panneau permanent ; MAIS la tranche d'un
    // passage s'ouvre bien dans le tiroir existant sur demande explicite.
    out.elementTimelineExiste = !!document.getElementById("timeline");
    out.elementTitreEvenementsExiste = !!document.getElementById("titre-evenements");
    out.rendreTimelineExiste = (typeof rendreTimeline === "function");

    var passageAvecEvenements = passage({
      agent: "backend-developer", debut: "2026-09-21T10:00:05.000Z",
      termine: true, etat: "termine", agent_id: "u1-evt-agent",
    });
    var wfEvt = {
      workflow_id: "u1-evenements#0", indice_cycle: 1,
      debut: "2026-09-21T10:00:00.000Z", fin_observee: "2026-09-21T10:05:00.000Z",
      fin_observee_absente: false, bornage: "session-entiere", borne_par: null,
      segments: [passageAvecEvenements], passages: [passageAvecEvenements],
      cycles_total: 1, evenements_hors_session: 0,
    };
    dernierEtat = {
      workflows: [wfEvt], cycles_total: 1, evenements_hors_session: 0,
      evenements: [
        { hook_event_name: "SubagentStart", agent_type: "backend-developer",
          agent_id: "u1-evt-agent", ts: "2026-09-21T10:00:05.000Z" },
        { hook_event_name: "PostToolUse", tool: "Read", agent_id: "u1-evt-agent",
          failed: false, ts: "2026-09-21T10:00:06.000Z" },
      ],
    };
    var sigles = siglesAgents(Array.from(collecterRoles([wfEvt])));
    var geo = disposer([passageAvecEvenements]);
    construireDisqueAgent(geo.agents[0], sigles, null);
    // Sélectionne le passage comme le ferait un clic réel sur le disque.
    selectionnerPassage(geo.agents[0], "BD", null);
    out.boutonEvenementsActiveApresSelection =
      !document.getElementById("voir-evenements-passage").disabled;
    document.getElementById("voir-evenements-passage").click();
    out.tiroirVisibleApresClic = !document.getElementById("tiroir").hidden;
    out.tiroirContenuApresClic = document.getElementById("tiroir-contenu").textContent || "";

    // -- décision humaine du 2026-09-23 (feature-028, AU-DELÀ de U1) --------
    // U1 exigeait une MIGRATION de `systeme` (Divergences/Budget max/
    // Écrivains vers un panneau « État du dépôt »), jamais réalisée — d'où
    // `SECTIONS_BLOQUEES` en phase A/B ci-dessus, qui reste vraie : c'est ce
    // que la spec CLOSE de feature-021 dit, et ça ne change pas. Mais le
    // 2026-09-23, l'humain a tranché AU-DELÀ de U1 : « Supprime système. Je
    // ne souhaite pas que ça aille ailleurs. » — retrait sec, sans
    // migration, decision plus large que ce que U1 réclamait. Ce bloc ne
    // dérive RIEN de la spec close (elle ne dit pas ça) : il vérifie la
    // décision écrite dans le journal de bord de `feature-028` (spec
    // COURANTE, `doing/`), jamais dans `U1`.
    out.elementSystemeExiste = !!document.getElementById("systeme");
    out.elementTitreSystemeExiste = !!document.getElementById("titre-systeme");
    out.rendreSystemeExiste = (typeof rendreSysteme === "function");

    // -- décision humaine du 2026-09-23, TROISIÈME fois AU-DELÀ de U1 -------
    // `demande` (« Que souhaitez-vous développer ? ») N'EST PAS dans `U1` —
    // elle en était même explicitement EXEMPTÉE (A2, GATE) tant que le `+`
    // restait inerte. Une fois câblé et vérifié (lot B), l'humain a tranché
    // (2026-09-23, 03:10) : « la fonction "ajouter un élément" sert
    // justement à ça » — `demande` retirée (lot C2), `#add-item-dialog` en
    // est le remplaçant, MÊME machine à états (`SURFACES_REDACTION`),
    // jamais un second chemin. `demande` n'avait pas de fonction de rendu
    // dédiée (formulaire statique) : c'est `SURFACES_REDACTION.demande`
    // elle-même, la clé de configuration qui la faisait fonctionner, qui
    // doit avoir disparu — même invariant que `rendreSysteme`/`rendreFichiers`
    // ci-dessus, sous une forme différente.
    out.elementTitreDemandeExiste = !!document.getElementById("titre-demande");
    out.elementTitreBesoinExiste = !!document.getElementById("titre-besoin");
    out.elementSpecPromptExiste = !!document.getElementById("spec-prompt");
    out.elementDerogationMinimaleExiste = !!document.getElementById("derogation-minimale");
    out.elementBoutonGenererBrouillonExiste = !!document.getElementById("bouton-generer-brouillon");
    out.elementRedactionCorpsExiste = !!document.getElementById("redaction-corps");
    out.surfaceDemandeExiste = (typeof SURFACES_REDACTION === "object" && SURFACES_REDACTION !== null
      && Object.prototype.hasOwnProperty.call(SURFACES_REDACTION, "demande"));

    // -- B6 : le remplaçant reste ATTEIGNABLE, vérifié par exécution --------
    // Le `+` ouvre bien la boîte, et la MÊME fonction de génération accepte
    // la surface "dialogue" — preuve que la capacité de créer une spec n'a
    // pas disparu avec `demande`, seulement son second point d'entrée.
    out.surfaceDialogueExiste = (typeof SURFACES_REDACTION === "object" && SURFACES_REDACTION !== null
      && Object.prototype.hasOwnProperty.call(SURFACES_REDACTION, "dialogue"));
    document.getElementById("open-add-item").click();
    out.remplacant_dialogue_ouvert_par_le_plus =
      typeof document.getElementById("add-item-dialog").open === "boolean"
        ? document.getElementById("add-item-dialog").open
        : !document.getElementById("add-item-dialog").hidden;

    // -- décision humaine du 2026-09-23, QUATRIÈME fois AU-DELÀ de U1 -------
    // `pilotage` (le panneau générique « Piloter par clé ») n'a JAMAIS été
    // visé par `U1` — comme `demande`, elle n'existait pas dans le
    // périmètre de la spec close de feature-021. Retirée dans un lot dédié
    // (« Pour le pilotage, lance le lot »), une fois le lancement et
    // l'interruption PAR CARTE vérifiés. `pilotage`/`rendreBadgePilotage`/
    // `demarrerSondagePilotage`/`sonderLancementPilotage`/
    // `actualiserPilotage`/`initialiserPilotage` SURVIVENT (infrastructure
    // partagée) : ce ne sont PAS des checks d'absence, contrairement aux
    // fonctions purement panneau qui suivent.
    out.elementTitrePilotageExiste = !!document.getElementById("titre-pilotage");
    out.elementPilotageCorpsExiste = !!document.getElementById("pilotage-corps");
    out.rendrePilotageExiste = (typeof rendrePilotage === "function");
    out.rendreSelecteurPilotageExiste = (typeof rendreSelecteurPilotage === "function");
    out.surClicLancerPilotageExiste = (typeof surClicLancerPilotage === "function");
    out.classeBlocPresenteQuelquePart = !!document.querySelector(".bloc");
    // -- B6 : l'infrastructure PARTAGÉE reste vivante, jamais retirée avec -
    out.pilotageObjetExiste = (typeof pilotage === "object" && pilotage !== null);
    out.rendreBadgePilotageExiste = (typeof rendreBadgePilotage === "function");
    out.actualiserPilotageExiste = (typeof actualiserPilotage === "function");
    out.demarrerSondagePilotageExiste = (typeof demarrerSondagePilotage === "function");
  } catch (e) {
    out.erreur = (e && e.stack) || String(e);
  }
  document.title = JSON.stringify(out);
})();
"""


def construire_page(base_http):
    chemin_index = os.path.join(_ICI, "index.html")
    with open(chemin_index, "r", encoding="utf-8") as f:
        html_reel = f.read()
    m = re.search(r"<body>(.*)</body>", html_reel, re.S)
    if not m:
        raise RuntimeError("aucun <body> trouvé dans index.html")
    corps = re.sub(r'<script src="/(diagramme\.js|app\.js)"></script>\s*', "", m.group(1))
    return (
        '<!doctype html><html><head><meta charset="utf-8">'
        '<link rel="stylesheet" href="%(base)s/app.css">'
        "</head><body>"
        "%(corps)s"
        '<script src="%(base)s/diagramme.js"></script>'
        '<script src="%(base)s/app.js"></script>'
        "<script>%(script)s</script>"
        "</body></html>"
    ) % {"base": base_http, "corps": corps, "script": _SCRIPT_MESURE}


def main():
    navigateur = trouver_navigateur()
    if not navigateur:
        print("ℹ️  Aucun binaire Chromium trouvé — harnais sauté.")
        return 0
    if not shutil.which("node"):
        # Aucune dérivation Node n'est requise par CE fichier (la dérivation
        # de phase A est en Python), mais la cohérence avec les autres
        # harnais `HARNAIS_NAVIGATEUR` de ce module (sautés sans `node`)
        # évite un écart de comportement entre gardes soeurs.
        pass

    table = deriver_table_u1()
    print("[dérivé] %d section(s) lue(s) dans U1 (feature-021, spec close) : %s"
          % (len(table), sorted(table)))
    verifier_derivation(table)

    for nom in ("app.css", "app.js", "diagramme.js", "index.html"):
        chemin = os.path.join(_ICI, nom)
        if not os.path.exists(chemin) or os.path.getsize(chemin) == 0:
            print("ECHEC ATTEIGNABILITE : %s est absent ou vide à %s" % (nom, chemin))
            return 1

    dossier_isole = tempfile.mkdtemp(prefix="cc-test-u1-config-")
    chemin_config_isole = os.path.join(dossier_isole, "n-existe-jamais.toml")
    racine_reelle = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(SRV.__file__))))
    config = C.charger(chemin=chemin_config_isole, racine_projet=racine_reelle)

    serveur = ThreadingHTTPServer(("127.0.0.1", 0), SRV.Handler)
    serveur.daemon_threads = True
    serveur.etat = SRV.Etat(config)
    serveur.servables = SRV._fichiers_servables()
    base = "http://127.0.0.1:%d" % serveur.server_address[1]
    fil = threading.Thread(target=serveur.serve_forever, daemon=True)
    fil.start()

    try:
        import urllib.request
        with urllib.request.urlopen(base + "/app.css", timeout=10) as reponse:
            check("atteignabilite_app_css_servi_200", reponse.status == 200,
                  "obtenu %d" % reponse.status)

        page = construire_page(base)
        with tempfile.TemporaryDirectory(prefix="cc-test-u1-page-") as dossier:
            fichier = os.path.join(dossier, "harnais.html")
            with open(fichier, "w", encoding="utf-8") as f:
                f.write(page)
            res = _lancer_navigateur([
                navigateur, "--headless", "--disable-gpu", "--no-sandbox",
                "--virtual-time-budget=3000", "--window-size=1400,1400",
                "--dump-dom", "file://" + fichier,
            ])
    finally:
        serveur.shutdown()
        serveur.server_close()

    if res.returncode != 0:
        print("ECHEC : Chromium a rendu le code %d\n%s" % (res.returncode, res.stderr[-2000:]))
        return 1

    dom = res.stdout
    debut = dom.find("<title>")
    fin = dom.find("</title>")
    if debut < 0 or fin < 0:
        print("ECHEC ATTEIGNABILITE : aucun <title> dans le DOM rendu (%d octets)" % len(dom))
        return 1
    try:
        m = json.loads(_html.unescape(dom[debut + 7:fin]))
    except Exception as e:
        print("ECHEC ATTEIGNABILITE : <title> illisible (%s)" % e)
        return 1
    if m.get("erreur"):
        print("ECHEC ATTEIGNABILITE : le script de la page a levé :\n%s" % m["erreur"])
        return 1

    # -- `agents` : SUPPRIMÉE ENTIÈRE ---------------------------------------
    check("A1bis_agents_fonction_de_rendu_retiree", not m["rendreAgentsExiste"])
    check("A1bis_agents_element_absent", not m["elementAgentsExiste"])
    check("A1bis_agents_titre_absent", not m["elementTitreAgentsExiste"])
    check("A1bis_agents_classe_absente_de_tout_le_dom", not m["classeAgentsPresenteQuelquePart"])

    # -- `developper` : #compteur-prompt retiré, le champ reste utilisable --
    check("A1bis_developper_compteur_prompt_absent", not m["elementCompteurPromptExiste"])
    check("A1bis_developper_champ_prompt_toujours_utilisable", m["champPromptToujoursPresent"])

    # -- `cycles` : `.table-passages` et son repli absents, à 45 passages ---
    check("A1bis_cycles_aucune_table_meme_a_45_passages", not m["tableDePassagesPresenteQuelquePart"])
    check("A1bis_cycles_aucun_bouton_de_repli", not m["boutonRepliPresentQuelquePart"])
    # DH20260923_accordeon_* : décision humaine 1B (feature-028, lot C1),
    # AU-DELÀ de U1 — l'accordéon « Cycles » ENTIER a disparu (pas seulement
    # `.table-passages`, déjà retirée avant lui par U1). Distinct des
    # `A1bis_cycles_*` ci-dessus, qui restent vrais pour ce que `U1` dit.
    check("DH20260923_accordeon_workflows_absent", not m["accordeonWorkflowsExiste"])
    check("DH20260923_accordeon_titre_cycles_absent", not m["elementTitreCyclesExiste"])
    check("DH20260923_accordeon_legende_cycles_absent", not m["elementLegendeCyclesExiste"])
    check("DH20260923_accordeon_pied_cycles_absent", not m["elementPiedCyclesExiste"])
    check("DH20260923_accordeon_fonction_rendreCycles_retiree", not m["rendreCyclesExiste"])
    check("DH20260923_accordeon_fonction_construireProprietes_retiree", not m["construireProprietesExiste"])
    check("DH20260923_accordeon_fonction_construireChaineEtNotes_retiree", not m["construireChaineEtNotesExiste"])
    check("DH20260923_accordeon_classe_maillon_absente", not m["classeMaillonPresenteQuelquePart"])
    check("DH20260923_accordeon_classe_cycle_bouton_absente", not m["classeCycleBoutonPresenteQuelquePart"])
    # B6 : les 45 segments restent TOUS représentés — comme disques du
    # graphe principal, remplaçant atteignable de l'ancienne chaîne.
    check("DH20260923_accordeon_les_45_passages_restent_representes_en_disques",
          m["nombreDeDisques"] == 45, "obtenu %s disque(s)" % m["nombreDeDisques"])

    # -- `fichiers` : ce que U1 visait (aucun `.fsujet`) reste trivialement --
    # vrai, la section entière ayant disparu (décision humaine AU-DELÀ de U1,
    # voir DH20260923_fichiers_* ci-dessous pour la décision elle-même).
    check("A1bis_fichiers_aucun_fsujet_de_commit", not m["elementFsujetPresentQuelquePart"])

    # -- `evenements` : panneau permanent absent, tranche dans le tiroir ----
    check("A1bis_evenements_panneau_permanent_absent", not m["elementTimelineExiste"])
    check("A1bis_evenements_titre_absent", not m["elementTitreEvenementsExiste"])
    check("A1bis_evenements_fonction_de_rendu_retiree", not m["rendreTimelineExiste"])
    check("A1bis_evenements_bouton_actif_apres_selection", m["boutonEvenementsActiveApresSelection"])
    check("A1bis_evenements_tiroir_s_ouvre_au_clic", m["tiroirVisibleApresClic"])
    check("A1bis_evenements_tiroir_porte_le_bon_evenement",
          "backend-developer" in m["tiroirContenuApresClic"],
          "obtenu : %r" % m["tiroirContenuApresClic"])

    # -- décision humaine du 2026-09-23 (feature-028), AU-DELÀ de U1 --------
    # ⚠️ Distinct des vérifications A1bis ci-dessus : celles-ci dérivent la
    # table `U1` de la spec CLOSE de feature-021, qui exigeait une MIGRATION
    # de `systeme` (jamais faite, toujours BLOQUÉE — voir SECTIONS_BLOQUEES,
    # ça ne change pas). Les trois checks qui suivent testent une décision
    # PLUS LARGE, écrite le 2026-09-23 dans le journal de bord de la spec
    # COURANTE (`feature-028`, `doing/`) : retrait SEC de la section entière,
    # sans migration. Ne pas lire "DH20260923" comme si `U1` l'avait dit.
    check("DH20260923_systeme_element_absent", not m["elementSystemeExiste"])
    check("DH20260923_systeme_titre_absent", not m["elementTitreSystemeExiste"])
    check("DH20260923_systeme_fonction_de_rendu_retiree", not m["rendreSystemeExiste"])

    # -- décision humaine du 2026-09-23, « fichiers », AU-DELÀ de U1 --------
    # ⚠️ Distincte des vérifications A1bis_fichiers_* ci-dessus : celles-ci
    # dérivent la table `U1`, qui exigeait seulement le retrait de la liste
    # des commits (la liste des fichiers touchés restant affichée). Les
    # quatre checks qui suivent testent une décision PLUS LARGE, écrite le
    # 2026-09-23 dans le journal de bord de la spec COURANTE (`feature-028`,
    # `doing/`) : retrait SEC de la section « Fichiers touchés » entière —
    # « la consultation des diffs ne va nulle part ». Ne pas lire
    # "DH20260923_fichiers" comme si `U1` l'avait dit.
    check("DH20260923_fichiers_element_absent", not m["elementFichiersExiste"])
    check("DH20260923_fichiers_titre_absent", not m["elementTitreFichiersExiste"])
    check("DH20260923_fichiers_fonction_de_rendu_retiree", not m["rendreFichiersExiste"])
    check("DH20260923_fichiers_ouvrirDiff_retiree", not m["ouvrirDiffExiste"])

    # -- décision humaine du 2026-09-23, « demande », AU-DELÀ de U1 ---------
    # ⚠️ `demande` n'a JAMAIS été dans `U1` (elle en était explicitement
    # exemptée — A2, GATE — tant que le `+` restait inerte). Ces checks ne
    # dérivent donc RIEN de la spec close de feature-021 : ils testent la
    # décision écrite le 2026-09-23 dans le journal de bord de la spec
    # COURANTE (`feature-028`, `doing/`), une fois le `+` câblé et vérifié
    # (lot B) — « la fonction "ajouter un élément" sert justement à ça ».
    check("DH20260923_demande_titre_absent", not m["elementTitreDemandeExiste"])
    check("DH20260923_demande_titre_besoin_absent", not m["elementTitreBesoinExiste"])
    check("DH20260923_demande_spec_prompt_absent", not m["elementSpecPromptExiste"])
    check("DH20260923_demande_derogation_minimale_absente", not m["elementDerogationMinimaleExiste"])
    check("DH20260923_demande_bouton_generer_brouillon_absent", not m["elementBoutonGenererBrouillonExiste"])
    check("DH20260923_demande_redaction_corps_absent", not m["elementRedactionCorpsExiste"])
    check("DH20260923_demande_surface_de_configuration_retiree", not m["surfaceDemandeExiste"])
    # -- B6 : remplaçant ATTEIGNABLE, jamais une capacité perdue sans preuve -
    check("DH20260923_demande_remplacant_surface_dialogue_existe", m["surfaceDialogueExiste"])
    check("DH20260923_demande_remplacant_plus_ouvre_bien_la_boite",
          m["remplacant_dialogue_ouvert_par_le_plus"])

    # -- décision humaine du 2026-09-23, « pilotage », AU-DELÀ de U1 --------
    # ⚠️ `pilotage` n'a JAMAIS été dans `U1` (comme `demande` : hors périmètre
    # de la spec close de feature-021). Ces checks ne dérivent RIEN de `U1` :
    # ils testent la décision écrite le 2026-09-23 dans le journal de bord
    # de la spec COURANTE, une fois le lancement/l'interruption par carte
    # vérifiés (« Pour le pilotage, lance le lot »).
    check("DH20260923_pilotage_titre_absent", not m["elementTitrePilotageExiste"])
    check("DH20260923_pilotage_corps_absent", not m["elementPilotageCorpsExiste"])
    check("DH20260923_pilotage_fonction_de_rendu_retiree", not m["rendrePilotageExiste"])
    check("DH20260923_pilotage_selecteur_de_commande_retire", not m["rendreSelecteurPilotageExiste"])
    check("DH20260923_pilotage_action_lancer_generique_retiree", not m["surClicLancerPilotageExiste"])
    check("DH20260923_pilotage_classe_bloc_absente_partout",
          not m["classeBlocPresenteQuelquePart"])
    # -- B6 : l'INFRASTRUCTURE PARTAGÉE n'a PAS été retirée avec le panneau -
    check("DH20260923_pilotage_infrastructure_objet_pilotage_survit",
          m["pilotageObjetExiste"])
    check("DH20260923_pilotage_infrastructure_badge_survit",
          m["rendreBadgePilotageExiste"])
    check("DH20260923_pilotage_infrastructure_actualiserPilotage_survit",
          m["actualiserPilotageExiste"])
    check("DH20260923_pilotage_infrastructure_sondage_survit",
          m["demarrerSondagePilotageExiste"])

    print("\n" + str(_tests) + " cas, " + str(len(_echecs)) + " echec(s)")
    for e in _echecs:
        print("  - " + e)
    return 1 if _echecs else 0


if __name__ == "__main__":
    sys.exit(main())
