#!/usr/bin/env python3
"""Actions sur une spec EXISTANTE : lancer un cycle, modifier, supprimer.

    python3 control-center/backend/gestion_spec.py

feature-025 (lots 9-10 de `feature-021`, cycle 2) — GATE `security-reviewer`
P1, surfaces S1 (`POST /api/spec/lancer`) et S2 (`POST /api/spec/modifier`,
`POST /api/spec/supprimer`).

## Confinement — `spec_id` ne construit JAMAIS un chemin (GATE P1 S1.2)

Un `spec_id` venu du réseau est comparé, par ÉGALITÉ STRICTE, à l'ensemble
des identifiants RÉELLEMENT découverts par `specs.lister_depuis_config()` —
le même patron que `server.py:_spec()`. Le chemin qui en résulte repasse
ENSUITE par `vcs.chemin_sur()` ET doit valoir EXACTEMENT
`<specs.racine>/<colonne>/<id>.md` : deux gardes, jamais une confiance dans
la première. `resoudre_spec()` est le SEUL point d'entrée qui produit ce
chemin ; rien d'autre dans ce module ne construit de chemin depuis une
chaîne venue de la requête.

## Éligibilité par POSITION de colonne, jamais par nom codé en dur (ADR-0003)

`role_colonne()` ne connaît ni `"todo"` ni `"done"` : ces noms viennent de
`control-center.toml` et varient d'un projet à l'autre. Seule la POSITION
dans `config.colonnes()` (déclarée, ordonnée) porte un sens : la première
est lançable/modifiable/supprimable, la dernière est immuable (`done`,
GATE P1 S2.2), toute colonne intermédiaire (`doing`) est modifiable mais
jamais supprimable.

## Compare-and-write ATOMIQUE (GATE P1 S2.3)

`modifier()` n'écrit jamais à l'aveugle : l'appelant doit reporter
l'empreinte (SHA-256 du contenu) lue au dernier `GET /api/spec`. Sous un
verrou COURT (`var/specs.lock`, même budget que `numerotation.lock` —
`redaction_spec.py`), on relit le fichier, on compare l'empreinte, et on
n'écrit QUE si elle concorde — sinon `409`, fichier intact. L'écriture
passe par un fichier temporaire du MÊME répertoire puis `os.replace()` :
jamais de contenu partiel visible d'un lecteur concurrent.

## Correctif AUDIT feature-021 (A2) — le compare-and-write ne protège PAS le
## non-commité, et le choix retenu n'est PAS celui de `supprimer()`

Le compare-and-write ci-dessus garantit que le contenu envoyé par
l'appelant remplace bien ce qu'il a LU — jamais un écrasement à l'aveugle
d'une édition CONCURRENTE via l'API. Il ne dit RIEN sur si ce contenu lu
est lui-même RÉCUPÉRABLE : une ligne ajoutée localement à une spec de
`doing/` (le journal de bord d'un cycle, jamais commité à chaque ligne —
Règle absolue « rien n'est commité sans feu vert explicite ») peut être
remplacée par `modifier()` avec l'empreinte COURANTE, en 200, et
`git checkout HEAD -- <chemin>` ne rend alors que la version d'AVANT cette
ligne : mesuré (AUDIT), 172 lignes, aucun retour possible au delà de `HEAD`.

`supprimer()` répond à l'équivalent de ce problème en REFUSANT (`409`) tant
que `vcs.verifier_supprimable()` ne garantit pas que le disque égale `HEAD`.
**`modifier()` NE fait PAS le même choix** — et c'est délibéré, pas un
oubli symétrique :

- un `409` systématique tant que la spec n'est pas propre aurait rendu la
  route inutilisable sur son cas NOMINAL — une spec de `doing/` est
  PRESQUE TOUJOURS sale au sens git pendant toute la durée d'un cycle,
  précisément parce que son journal de bord s'écrit par des `modifier()`
  successifs, non commités entre eux ;
- `modifier()` sauvegarde donc, au lieu de refuser : avant tout
  `os.replace()`, si `vcs.verifier_supprimable()` dit que le contenu actuel
  N'EST PAS strictement celui de `HEAD` (non suivi, modifié dans l'arbre,
  ou indexé — les trois cas que cette fonction sait déjà distinguer), une
  copie horodatée du contenu REMPLACÉ est écrite dans
  `var/sauvegardes-specs/` AVANT l'écrasement. Si cette sauvegarde échoue,
  l'écrasement est REFUSÉ (`500`) plutôt que silencieux.

Ce que ce choix COÛTE, en face : la sauvegarde vit hors de git — un
`rm -rf var/` la perd, là où un `git stash` ou un commit intermédiaire ne
la perdrait pas. Elle protège contre LA PERTE, pas contre la DIVULGATION ni
contre une purge délibérée de `var/`. C'est un filet moins solide que celui
de `supprimer()`, choisi PARCE QUE la route doit rester utilisable pendant
tout un cycle, pas seulement entre deux commits.

## Suppression : jamais sans retour, jamais sur ce que git ne peut pas rendre

`POST /api/spec/ecrire` (`redaction_spec.py`) ne commite JAMAIS : toute spec
créée depuis le cockpit est donc NON SUIVIE par git tant qu'un commit humain
ne l'a pas indexée. `git rm` y échoue (`rc 128`, mesuré) ; sur une spec par
ailleurs suivie mais modifiée localement ou dans l'index, il échoue aussi
(`rc 1`, mesuré). Un plan de retour arrière fondé sur `git rm` + une
référence est donc INAPPLICABLE tant que la spec n'est pas suivie ET
propre — `supprimer()` le VÉRIFIE et le DIT (`409`, aucun effet) plutôt que
de se rabattre sur un `unlink()` qui perdrait le contenu sans retour
possible (Règle absolue n°4 : jamais de suppression sans plan de retour
arrière écrit).

La même vérification, et le `git rm` lui-même, sont refaits SOUS le même
verrou court que `modifier()` (GATE P1 S2.9) : deux suppressions
concurrentes sur la même spec rendent exactement `{200, 404}`, jamais deux
`git rm` ni un 500.
"""

import errno
import fcntl
import hashlib
import os
import tempfile
import time

import specs as S
import vcs as V

_RACINE_VAR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "var")
_CHEMIN_VERROU = os.path.join(_RACINE_VAR, "specs.lock")

# AUDIT feature-021 (A2) : où `modifier()` dépose une copie du contenu
# REMPLACÉ quand git ne peut pas le rendre (voir `_sauvegarder_avant_ecrasement`
# ci-dessous). Même convention que `_CHEMIN_VERROU` : relatif à CE module,
# jamais au projet géré — `var/` appartient au cockpit, pas au dépôt cible.
_CHEMIN_SAUVEGARDES = os.path.join(_RACINE_VAR, "sauvegardes-specs")

# Même discipline que `redaction_spec._BUDGET_VERROU_S` (`numerotation.lock`) :
# un verrou COURT, jamais tenu le temps d'une requête réseau.
_BUDGET_VERROU_S = 2.0
_INTERVALLE_VERROU_S = 0.1

# Borne sur `contenu` à la modification — même valeur que
# `redaction_spec._CONTENU_MAX` : très large marge au-dessus de la plus
# grande spec mesurée dans ce dépôt, jamais un chèque en blanc. DÉFENSIVE,
# pas la garde principale : `_TAILLES_MAX_CORPS["/api/spec/modifier"]`
# (server.py) borne déjà le corps HTTP entier avant que ce module ne soit
# atteint. Répétée ici pour que le module reste correct et testable SEUL.
_CONTENU_MAX = 65_536


# --- verrou court, partagé par `modifier()` et `supprimer()` ------------------

def _prendre_flock(fd):
    """`flock(LOCK_EX | LOCK_NB)`, réessayé jusqu'à un budget total de 2 s
    (même discipline que `redaction_spec._prendre_flock`)."""
    fin = time.monotonic() + _BUDGET_VERROU_S
    while True:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return True
        except OSError as erreur:
            if erreur.errno not in (errno.EACCES, errno.EAGAIN):
                raise
            if time.monotonic() >= fin:
                return False
            time.sleep(_INTERVALLE_VERROU_S)


def _verrou_court(chemin_verrou=None):
    """Ouvre et verrouille `var/specs.lock`. Rend le descripteur si acquis
    dans le budget, sinon `None` — l'appelant traduit en `503`."""
    chemin_verrou = chemin_verrou or _CHEMIN_VERROU
    os.makedirs(os.path.dirname(chemin_verrou), exist_ok=True)
    fd = os.open(chemin_verrou, os.O_CREAT | os.O_RDWR, 0o600)
    if _prendre_flock(fd):
        return fd
    os.close(fd)
    return None


def _rendre_flock(fd):
    try:
        fcntl.flock(fd, fcntl.LOCK_UN)
    finally:
        os.close(fd)


# --- résolution, confinement, éligibilité -------------------------------------

def empreinte(contenu):
    """SHA-256 hexadécimal du contenu — l'empreinte que l'appelant reporte
    du `GET` au `POST` (compare-and-write, GATE P1 S2.3)."""
    return hashlib.sha256(contenu.encode("utf-8")).hexdigest()


def resoudre_spec(config, spec_id):
    """`spec_id` -> `(spec, chemin_relatif)` par ÉGALITÉ STRICTE contre les
    specs RÉELLEMENT découvertes, ou `(None, None)` (GATE P1 S1.2).

    Aucune arithmétique de chemin : le nom `<spec_id>.md` n'est composé
    qu'APRÈS avoir trouvé une correspondance exacte dans la liste, puis
    revérifié par `vcs.chemin_sur()` ET par égalité exacte avec le chemin
    attendu — deux gardes, jamais une confiance dans la première.
    """
    if not isinstance(spec_id, str) or not spec_id:
        return None, None
    racine_projet = config["_racine_projet"]
    specs_racine = config.section("specs").get("racine", "specs/features")
    for spec in S.lister_depuis_config(config):
        if spec["id"] != spec_id:
            continue
        nom = spec_id + ".md"
        chemin_absolu = os.path.join(racine_projet, specs_racine, spec["colonne"], nom)
        attendu = "/".join([specs_racine, spec["colonne"], nom])
        relatif = V.chemin_sur(racine_projet, chemin_absolu)
        if relatif is None or relatif != attendu:
            return None, None
        return spec, relatif
    return None, None


def spec_id_conforme(spec_id):
    """Vrai si `spec_id` respecte la convention de nommage des specs
    (`specs._RE_NUMERO`, appliquée au nom de fichier complet). Une spec
    RÉELLEMENT présente sur le disque mais nommée hors convention (`notes.md`,
    un format historique) est refusée — GATE P1 S1.3 : « une spec existante
    au nom non conforme est refusée, jamais lancée »."""
    return bool(S._RE_NUMERO.match(spec_id + ".md"))


def role_colonne(config, classe_colonne):
    """`"premiere"` (lançable, modifiable, supprimable), `"derniere"`
    (immuable, GATE P1 S2.2 — la colonne `done` par défaut), ou
    `"intermediaire"` (modifiable, jamais supprimable — `doing` par défaut),
    selon la POSITION déclarée par `config.colonnes()` — jamais un nom de
    répertoire codé en dur (ADR-0003). Rend `None` si `classe_colonne` ne
    correspond à aucune colonne déclarée."""
    classes = [c for _, c, _ in config.colonnes()]
    if not classes or classe_colonne not in classes:
        return None
    index = classes.index(classe_colonne)
    if index == 0:
        return "premiere"
    if index == len(classes) - 1:
        return "derniere"
    return "intermediaire"


def _lire_contenu(chemin_absolu):
    try:
        with open(chemin_absolu, encoding="utf-8") as fichier:
            return fichier.read()
    except (OSError, UnicodeDecodeError):
        return None


def _sauvegarder_avant_ecrasement(chemin_sauvegardes, spec_id, contenu_actuel):
    """Écrit une copie horodatée de `contenu_actuel` — le contenu que
    `modifier()` s'apprête à remplacer — AVANT tout `os.replace()` (AUDIT
    feature-021, A2). Rend le NOM du fichier écrit (jamais un chemin absolu :
    même règle que `supprimer()`, GATE P1 S2.11), ou `None` si l'écriture a
    échoué. Une sauvegarde qui échoue en silence n'est pas une sauvegarde :
    l'APPELANT doit refuser l'écrasement quand ce rend `None`.

    Écriture par fichier temporaire du MÊME répertoire puis `os.replace()` —
    même discipline que l'écriture de la spec elle-même : jamais de fichier
    de sauvegarde partiel visible.
    """
    try:
        os.makedirs(chemin_sauvegardes, exist_ok=True)
        octets = contenu_actuel.encode("utf-8")
    except (OSError, UnicodeEncodeError):
        return None
    # Horodatage EN NANOSECONDES : deux `modifier()` sur la MÊME spec dans la
    # MÊME seconde (un double-clic, un client qui réessaie) ne doivent
    # jamais partager un nom de fichier — la seconde sauvegarde écraserait
    # la première, silencieusement.
    nom = "%s-%d.md" % (spec_id, time.time_ns())
    chemin_final = os.path.join(chemin_sauvegardes, nom)
    try:
        fd_tmp, chemin_tmp = tempfile.mkstemp(dir=chemin_sauvegardes, prefix=".tmp-sauvegarde-")
    except OSError:
        return None
    try:
        with os.fdopen(fd_tmp, "wb") as fichier_tmp:
            fichier_tmp.write(octets)
            fichier_tmp.flush()
            os.fsync(fichier_tmp.fileno())
        os.replace(chemin_tmp, chemin_final)
    except OSError:
        try:
            os.unlink(chemin_tmp)
        except OSError:
            pass
        return None
    return nom


# --- lancement -----------------------------------------------------------------

def eligible_au_lancement(config, spec_id):
    """Rend `(spec, None)` ou `(None, (code, message))` — ne lance rien,
    ne construit aucun `argv` : c'est `server.py` (qui détient `Ecriture`)
    qui orchestre le `Popen`. Ce module ne fait que valider la CIBLE."""
    spec, _ = resoudre_spec(config, spec_id)
    if spec is None:
        return None, (404, "spec inconnue")
    if not spec_id_conforme(spec_id):
        return None, (422, "spec_id non conforme : jamais lancée")
    if role_colonne(config, spec["colonne"]) != "premiere":
        return None, (409, "spec non éligible au lancement depuis cette colonne")
    return spec, None


# --- modification ----------------------------------------------------------------

def modifier(config, spec_id, empreinte_attendue, contenu, en_cours=False,
             chemin_verrou=None, chemin_sauvegardes=None):
    """Rend `(resultat, None)` ou `(None, (code, message))` — JAMAIS
    d'exception, y compris sur un échec d'écriture disque (`tempfile.mkstemp`,
    `os.replace`) : traduit en `(None, (500, …))`, comme `supprimer()` le
    fait déjà pour ses propres échecs (revue de code, cycle `feature-021` —
    avant ce correctif, `OSError` s'échappait de `os.replace` sur ce chemin
    précis et le contrat annoncé était faux ; l'appelant HTTP la rattrapait
    tout de même en 500 générique via son `except Exception` de dernier
    recours, mais le contrat de CETTE fonction, lui, mentait).

    `en_cours` est calculé par l'APPELANT (`server.py`, seul détenteur de
    `Ecriture.lancement_courant()`) : vrai si un lancement encore actif
    porte CE `spec_id` (GATE P1 S2.4/S1.7).

    AUDIT feature-021 (A2) : avant tout `os.replace()`, si le contenu
    ACTUELLEMENT sur disque n'est pas strictement celui de `HEAD`
    (`vcs.verifier_supprimable()` — non suivi, modifié dans l'arbre, ou
    indexé), une copie en est sauvegardée sous `chemin_sauvegardes`
    (`var/sauvegardes-specs/` par défaut) AVANT l'écrasement. Si cette
    sauvegarde échoue, l'écrasement est refusé (`500`), pas silencieux. Voir
    la note de tête de module pour ce que ce choix retient et ce qu'il
    coûte, en face du choix contraire fait par `supprimer()`."""
    spec, relatif = resoudre_spec(config, spec_id)
    if spec is None:
        return None, (404, "spec inconnue")
    role = role_colonne(config, spec["colonne"])
    if role == "derniere":
        return None, (409, "spec close : immuable")
    if en_cours:
        return None, (409, "un lancement est en cours sur cette spec")
    if not isinstance(empreinte_attendue, str) or not empreinte_attendue:
        return None, (400, "empreinte manquante")
    if not isinstance(contenu, str) or not contenu.strip():
        return None, (422, "contenu manquant ou vide")
    if len(contenu) > _CONTENU_MAX:
        return None, (413, "corps trop volumineux (max %d octets)" % _CONTENU_MAX)

    racine_projet = config["_racine_projet"]
    chemin_absolu = os.path.join(racine_projet, relatif)

    fd_verrou = _verrou_court(chemin_verrou)
    if fd_verrou is None:
        return None, (503, "verrou de spec indisponible, réessayez")
    try:
        actuel = _lire_contenu(chemin_absolu)
        if actuel is None:
            return None, (404, "spec introuvable sur disque")
        if empreinte(actuel) != empreinte_attendue:
            return None, (409, "le contenu a changé depuis la lecture — rechargez et réessayez")

        # Encoder AVANT tout `open` en écriture (leçon GATE P2 feature-008,
        # `redaction_spec.py:524-527`) : un contenu portant un point de code
        # substitut isolé lève `UnicodeEncodeError` — erreur de SAISIE
        # (422), jamais une panne serveur, et rien n'est encore ouvert.
        try:
            octets = contenu.encode("utf-8")
        except UnicodeEncodeError:
            return None, (422, "contenu invalide : caractère non encodable en UTF-8")

        # AUDIT feature-021 (A2) : `actuel` est ce que l'`os.replace()`
        # ci-dessous va REMPLACER — évalué ICI, APRÈS que toutes les autres
        # raisons de refus (empreinte, encodage) soient écartées, pour ne
        # jamais sauvegarder un contenu qu'on n'allait de toute façon pas
        # écraser. S'il diverge de `HEAD` (non suivi, modifié, ou indexé),
        # git ne pourra JAMAIS le rendre après coup — on en dépose une copie
        # AVANT d'écraser. `verifier_supprimable()` est réutilisé tel quel :
        # c'est EXACTEMENT le test « git peut-il rendre ce contenu » que
        # `supprimer()` fait déjà, pas un nouveau critère inventé pour
        # l'occasion.
        protege, _motif = V.verifier_supprimable(racine_projet, relatif)
        if not protege:
            nom_sauvegarde = _sauvegarder_avant_ecrasement(
                chemin_sauvegardes or _CHEMIN_SAUVEGARDES, spec_id, actuel)
            if nom_sauvegarde is None:
                return None, (500, "sauvegarde impossible avant écrasement, écriture refusée")

        dossier = os.path.dirname(chemin_absolu)
        try:
            fd_tmp, chemin_tmp = tempfile.mkstemp(dir=dossier, prefix=".tmp-spec-")
        except OSError:
            return None, (500, "écriture impossible")
        try:
            with os.fdopen(fd_tmp, "wb") as fichier_tmp:
                fichier_tmp.write(octets)
                fichier_tmp.flush()
                os.fsync(fichier_tmp.fileno())
            os.replace(chemin_tmp, chemin_absolu)
        except OSError:
            try:
                os.unlink(chemin_tmp)
            except OSError:
                pass
            return None, (500, "écriture impossible")

        resultat = {"spec_id": spec_id, "empreinte": empreinte(contenu)}
        if not protege:
            # Nom SEUL, jamais un chemin absolu (même règle que la réponse de
            # `supprimer()`, GATE P1 S2.11) : l'appelant sait qu'une
            # sauvegarde a été prise et sous quel nom, pas où `var/` vit sur
            # ce serveur.
            resultat["sauvegarde"] = nom_sauvegarde
        return resultat, None
    finally:
        _rendre_flock(fd_verrou)


# --- suppression -----------------------------------------------------------------

def supprimer(config, spec_id, confirmation_nom, en_cours=False, chemin_verrou=None):
    """Rend `(resultat, None)` ou `(None, (code, message))`.

    `resultat["retour_arriere"]` porte un `argv` EXÉCUTABLE tel quel
    (`["git", "checkout", <sha HEAD>, "--", <chemin>]`) — une référence
    atteignable, jamais un blob dangling (GATE P1 S2.7). Ce module ne
    l'exécute PAS lui-même : c'est le plan de retour arrière écrit que la
    Règle absolue n°4 exige, pas un geste automatique supplémentaire.

    ⚠️ FONCTIONNEL, PAS SÉCURITÉ (GATE P2, lot 9, relevé au passage, non
    corrigé — décision à prendre séparément) : `git rm` supprime le
    RÉPERTOIRE lui-même s'il ne contenait plus que le fichier supprimé — et,
    en CASCADE, tout parent devenu vide à son tour (mesuré : supprimer la
    dernière spec de `todo/` a fait disparaître `todo/` ET `features/`). La
    colonne du kanban correspondante disparaît alors du disque jusqu'à ce
    qu'une spec y revienne — un `os.listdir()` sur un répertoire absent
    (`S.lister_specs()`) rend une liste vide pour cette colonne, pas une
    erreur, donc rien ne le signale à l'écran. Le retour arrière EXÉCUTÉ
    (`git checkout <sha> -- <chemin>`) recrée les répertoires en même temps
    que le fichier — l'état revient, mais l'INTERVALLE entre les deux reste
    un trou fonctionnel, pas encore décidé.
    """
    # Confirmation AVANT tout effet, y compris avant de savoir si la spec
    # existe (GATE P1 S2.8) : une mutation qui neutralise cette comparaison
    # doit faire échouer le test « nom discordant supprime quand même ».
    if not isinstance(confirmation_nom, str) or confirmation_nom != spec_id:
        return None, (422, "confirmation invalide : le nom ne correspond pas exactement")

    spec, relatif = resoudre_spec(config, spec_id)
    if spec is None:
        return None, (404, "spec inconnue")
    role = role_colonne(config, spec["colonne"])
    # `!= "premiere"`, PAS `in ("derniere", "intermediaire")` (GATE P2 lot 9,
    # condition 4) : cette route est la SEULE destructive du cockpit — une
    # forme énumérée s'ouvre par un cas de plus (un `role` neuf, ou `None`
    # depuis une configuration à colonne unique/mal formée) ; le symétrique
    # exact de `eligible_au_lancement()` FERME au lieu d'ouvrir sur ce
    # cas-là. `role is None` est inatteignable aujourd'hui (`resoudre_spec`
    # n'aurait pas trouvé la spec sans une colonne connue), mais rien ne
    # garantit que ça le reste.
    if role != "premiere":
        return None, (409, "suppression interdite pour cette colonne")
    if en_cours:
        return None, (409, "un lancement est en cours sur cette spec")

    racine_projet = config["_racine_projet"]
    ok, motif = V.verifier_supprimable(racine_projet, relatif)
    if not ok:
        return None, (409, motif)

    fd_verrou = _verrou_court(chemin_verrou)
    if fd_verrou is None:
        return None, (503, "verrou de spec indisponible, réessayez")
    try:
        # Revérification SOUS verrou (GATE P1 S2.9) : une suppression
        # concurrente a pu retirer la spec entre la garde ci-dessus et la
        # prise du verrou — la SECONDE doit rendre 404, jamais un 500.
        spec2, relatif2 = resoudre_spec(config, spec_id)
        if spec2 is None:
            return None, (404, "spec inconnue")
        ok, motif = V.verifier_supprimable(racine_projet, relatif2)
        if not ok:
            return None, (409, motif)

        sha = V.tete_sha(racine_projet)
        if not sha:
            return None, (500, "impossible de déterminer HEAD")
        ok, _motif_git = V.supprimer_suivi(racine_projet, relatif2)
        if not ok:
            # Le message brut de git n'est JAMAIS renvoyé (GATE P1 S2.11) :
            # ni chemin absolu ni `racine` ne doivent fuiter dans une
            # réponse — un message générique suffit, le cas ne devrait
            # jamais se produire une fois `verifier_supprimable()` passé.
            return None, (500, "suppression git a échoué")

        return {
            "spec_id": spec_id,
            "retour_arriere": {
                "sha": sha,
                "chemin": relatif2,
                "argv": ["git", "checkout", sha, "--", relatif2],
            },
        }, None
    finally:
        _rendre_flock(fd_verrou)


if __name__ == "__main__":
    import json
    import sys

    import config as C

    configuration = C.charger()
    demande = sys.argv[1] if len(sys.argv) > 1 else "feature-025-actions-du-backlog"
    spec, chemin = resoudre_spec(configuration, demande)
    print(json.dumps({
        "spec_id": demande,
        "trouvee": spec is not None,
        "chemin_relatif": chemin,
        "role_colonne": role_colonne(configuration, spec["colonne"]) if spec else None,
    }, ensure_ascii=False, indent=2))
