#!/usr/bin/env python3
"""Fabrication et écriture d'un brouillon de spec (feature-008).

    python3 control-center/backend/redaction_spec.py

## Ce que ce module fait, et ne fait jamais

**Aucun appel de modèle.** Le brouillon est le TEMPLATE DU PROJET recopié
octet pour octet, à l'exception d'un nombre BORNÉ de substitutions
déterministes (slug, type, statut, date, titre H1, texte saisi). Tout ce que
le texte saisi ne permet pas de déduire reste `[remplir]` : un blanc visible
vaut mieux qu'une invention plausible.

Le numéro (`NNN`) n'est attribué qu'à L'ÉCRITURE (`ecrire_spec`), jamais dans
le brouillon (`preparer_brouillon`) : deux brouillons consécutifs sans
rechargement ne doivent jamais se disputer un numéro qui n'existe pas encore.

## Le formulaire : titre, texte, type, dérogation — deux décisions séparées

`ux-ui-designer` (feature-008) pose TROIS champs (`titre-besoin`, `prompt`,
la case `derogation-minimale`) ; le client en déduit un quatrième, `type`
(`"bug"` si la case est cochée, `"feature"` sinon) et envoie les quatre.
Ce module traite `genre` (repris de `type`) et la RICHESSE du template
(`_template.md` vs `specs/modele.md`) comme **deux décisions
INDÉPENDANTES** :

- `genre` est un champ CLIENT, re-validé contre l'enum FERMÉ `_GENRES` — il
  gouverne la SÉRIE de numérotation et le préfixe du nom de fichier, jamais
  le choix du template ;
- la **richesse** est décidée ICI, à partir de `minimal` (la dérogation) et
  d'une escalade par mot-clé qui peut l'ANNULER, jamais l'accorder
  (`choisir_richesse`) — un « bug » qui mentionne un sujet sensible reçoit
  quand même le template COMPLET, tout en restant numéroté `bug-NNN`.

## Écriture : le contenu relu est écrit VERBATIM, jamais régénéré

`POST /api/spec/ecrire` reçoit `{type, titre, contenu}`. `contenu` est le
Markdown TEL QUE RELU par l'humain — corrections comprises — et il est écrit
OCTET POUR OCTET : la spec est explicite (« le brouillon est affiché
intégralement et **modifiable** … ») : une correction qui ne survit pas à
l'écriture rendrait le textarea mensonger, exactement le défaut que la
relecture existe pour empêcher. Régénérer depuis `{titre, texte}` — comme le
faisait une version antérieure de ce module — jetait silencieusement toute
correction humaine : corrigé (reboucle étape 5a).

`type` et `titre` restent des CHAMPS JSON DÉDIÉS, RE-VALIDÉS et RE-DÉRIVÉS
(le slug est recalculé depuis `titre`, jamais lu dans `contenu`) — **le
chemin n'est jamais dérivé du Markdown**, quoi que ce dernier contienne :
GATE P1 condition 1 porte sur le CHEMIN (`type`, donc `slug`), pas sur le
contenu, et reste tenue à la lettre. `contenu` absent, vide ou non-`str` est
un `422` explicite : jamais un repli silencieux sur une régénération.

## Confinement et exclusivité (GATE P1)

`ecrire_sous_verrou` est le SEUL point d'écriture. Trois garanties, dans cet
ordre :

1. la cible est calculée depuis la configuration SEULE — `join(racine_projet,
   [specs].racine, colonnes()[0][0])`, ZÉRO donnée de requête — et revérifiée
   par `vcs.chemin_sur()` avant toute écriture ;
2. un verrou `flock` COURT (`var/numerotation.lock`), tenu seulement le temps
   de lire les numéros existants et d'écrire le fichier — jamais le temps
   d'une requête réseau ;
3. `os.O_CREAT | os.O_EXCL` À L'INTÉRIEUR de ce verrou : deux créations
   concurrentes ne peuvent jamais produire deux fichiers au même numéro, et
   un nom déjà pris échoue proprement (`409`) sans toucher au fichier
   existant.

## Ce qui n'est PAS traité ici, et pourquoi

`specs.py:_extraire_champs` lit les 60 premières lignes de tout fichier pour
en tirer les métadonnées, SANS tenir compte des sections Markdown ni des
blocs de code : une ligne du texte saisi qui ressemble à `- **Priorité** :
...` serait lue comme un vrai champ si elle tombe dans cette fenêtre. Pour le
template COMPLET (`_template.md`), l'insertion du titre H1 (voir
`_poser_titre`) repousse mécaniquement `## Description` — et donc tout texte
saisi qui y est recopié — hors de la fenêtre de 60 lignes : vérifié par
`test_redaction_spec.py`. Pour le template MINIMAL (`specs/modele.md`), ce
n'est PAS le cas : `## Symptôme observé` reste dans la fenêtre, et
`specs/modele.md` n'a ni `Priorité` ni `Dernière mise à jour` dans son
en-tête pour que la règle « le premier champ gagne » les protège (GATE P1,
piège 3). Une ligne hostile peut donc s'y faire passer pour un champ.
Décision assumée, PAS un oubli : le texte est recopié VERBATIM par contrat
explicite du plan (« aucun appel de modèle », « recopié verbatim ») — le
transformer pour échapper ce motif romprait cette garantie. L'impact mesuré
est cosmétique : `specs.py` rend ces champs en `textContent` côté frontend
(aucune exécution), `check_specs.sh` (qui ne regarde que le RÉPERTOIRE, pas
le champ Statut) reste vert, et le chemin n'est atteignable QUE par
dérogation explicite du client, elle-même annulée par la moindre présence
d'un mot-clé sensible dans le texte (`escalade_necessaire`).
"""

import errno
import fcntl
import os
import re
import time
import unicodedata

import specs as S
import vcs as V

_RACINE_VAR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "var")
_CHEMIN_VERROU = os.path.join(_RACINE_VAR, "numerotation.lock")

# Budget total d'attente du verrou de numérotation, et intervalle entre deux
# tentatives (GATE P1, condition 4) : au-delà, `503` plutôt qu'un thread HTTP
# bloqué indéfiniment.
_BUDGET_VERROU_S = 2.0
_INTERVALLE_VERROU_S = 0.1

# Bornes de saisie (cas limite de la spec : « texte saisi très long, ou
# vide : borné, avec un message explicite »). Choisies confortablement sous
# les plafonds de corps par route (feature-008, § architect) : un titre de
# 200 caractères et un texte de 20 000 ne peuvent jamais, une fois encodés en
# JSON, dépasser `_TAILLES_MAX_CORPS["/api/spec/ecrire"]` (65536 octets).
_TITRE_MAX = 200
_TEXTE_MAX = 20_000

# Borne sur `contenu` à l'écriture (reboucle étape 5a) : DÉFENSIVE, pas la
# garde principale — `_TAILLES_MAX_CORPS["/api/spec/ecrire"]` (server.py)
# borne déjà le corps HTTP entier à 65536 octets avant que ce module ne soit
# atteint. Répétée ici pour que le module reste correct et testable SEUL.
_CONTENU_MAX = 65_536

# Genres reconnus par CE serveur — enum FERMÉ (GATE P1, condition 1) : une
# valeur hors de cette liste est un 422, jamais un chemin de fichier.
_GENRES = ("feature", "bug")

_RE_SLUG = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")

# Mots-clés d'escalade (GATE P1, condition 7 de l'architect ; leçon de
# `bug-014` : un filtre de ce genre est TOUJOURS poreux). Escalateur
# MONOTONE : leur présence peut seulement ANNULER une dérogation vers le
# template minimal, jamais l'accorder. Leur absence ne prouve rien — c'est
# pour cela que le défaut, sans dérogation explicite, est déjà le template
# complet.
_MOTS_SENSIBLES = ("auth", "permission", "personnel", "paiement", "migration")


# --- normalisation ------------------------------------------------------------

def normaliser_slug(titre):
    """Slug par LISTE BLANCHE de caractères, jamais par retrait des seuls
    motifs dangereux connus (`..`, `/`, `\\`) : une liste blanche couvre aussi
    ce qu'on n'a pas anticipé (NUL, caractères de contrôle, non-ASCII).

    Rend une chaîne conforme à `^[a-z0-9]+(-[a-z0-9]+)*$`, 1 à 60
    caractères, ou `""` si rien d'exploitable ne reste — c'est à l'appelant
    de traduire une chaîne vide en `422`.
    """
    if not isinstance(titre, str):
        return ""
    # Translittération : "é" -> "e", etc. Tout caractère qui n'a pas
    # d'équivalent ASCII (emoji, CJK...) disparaît plutôt que de forcer un
    # octet non désiré dans un nom de fichier.
    decompose = unicodedata.normalize("NFKD", titre)
    ascii_str = decompose.encode("ascii", "ignore").decode("ascii").lower()
    # Toute suite de caractères non alphanumériques devient UN SEUL tiret :
    # couvre du même geste les séparateurs (`/`, `\\`, espace), les remontées
    # (`..`), le NUL et les caractères de contrôle, et empêche les tirets
    # doublés.
    ascii_str = re.sub(r"[^a-z0-9]+", "-", ascii_str).strip("-")
    ascii_str = ascii_str[:60].strip("-")
    return ascii_str


def slug_valide(slug):
    return bool(slug) and len(slug) <= 60 and bool(_RE_SLUG.fullmatch(slug))


def _normaliser_recherche(texte):
    if not isinstance(texte, str):
        return ""
    decompose = unicodedata.normalize("NFKD", texte)
    return decompose.encode("ascii", "ignore").decode("ascii").lower()


def escalade_necessaire(titre, texte):
    """Vrai si `titre` ou `texte` contient un mot-clé sensible — ANNULE une
    dérogation vers le template minimal, ne l'accorde jamais (voir
    `_MOTS_SENSIBLES`)."""
    corpus = _normaliser_recherche(titre) + " " + _normaliser_recherche(texte)
    return any(mot in corpus for mot in _MOTS_SENSIBLES)


def choisir_richesse(minimal_demande, titre, texte):
    """`"complet"` par défaut, TOUJOURS (FAIL-CLOSED) — `"minimal"`
    seulement si le client le demande EXPLICITEMENT et qu'aucun mot-clé
    sensible n'annule cette dérogation.

    INDÉPENDANT de `genre` : un besoin marqué `"bug"` mais mentionnant un
    sujet sensible reçoit quand même le template COMPLET, sans changer de
    série de numérotation ni de préfixe de fichier."""
    if not minimal_demande:
        return "complet"
    if escalade_necessaire(titre, texte):
        return "complet"
    return "minimal"


# --- fabrication du contenu ----------------------------------------------------

def _remplacer_valeur_champ(lignes, nom_champ, valeur, debut=0, fin=None):
    """Remplace la VALEUR de la ligne `- **<nom_champ>** : ...`, EN PLACE.

    Cherche dans `lignes[debut:fin]` UNIQUEMENT (par défaut : tout le
    document) — voir `appliquer_numero`, qui restreint cette recherche au
    bloc `## Métadonnées` pour ne jamais interpréter par POSITION un contenu
    qui n'est plus maîtrisé par le seul template (revue de code, feature-008 :
    un `- **ID** :` forgé dans un bloc de code AVANT `## Métadonnées`
    recevait sinon le vrai numéro, laissant le vrai champ à `feature-NNN`).

    Rend `True` si une ligne a été trouvée et modifiée, `False` sinon — un
    champ absent du template (ex. `Priorité` et `Dernière mise à jour`
    n'existent pas dans `specs/modele.md`) est silencieusement IGNORÉ, jamais
    inventé : ce que le formulaire ne peut pas remplir reste `[remplir]`
    natif du template, ou absent si le template ne porte pas ce champ."""
    if fin is None:
        fin = len(lignes)
    motif = re.compile(r'^(\s*[-*]\s+\*\*%s\*\*\s*:\s*).*$' % re.escape(nom_champ))
    for i in range(debut, fin):
        correspondance = motif.match(lignes[i])
        if correspondance:
            lignes[i] = correspondance.group(1) + valeur
            return True
    return False


def _plage_section(lignes, entete):
    """Bornes `(debut_inclus, fin_exclusive)` du CORPS de la section
    `entete` — juste après son titre, jusqu'au prochain `## `, ou la fin du
    document. Rend `(None, None)` si `entete` n'existe pas.

    Point d'entrée UNIQUE pour délimiter une section par sa STRUCTURE
    Markdown plutôt que par une position de ligne — `_remplacer_section` et
    `appliquer_numero` s'appuient toutes deux dessus."""
    debut = None
    fin = len(lignes)
    for i, ligne in enumerate(lignes):
        if debut is None and ligne.strip() == entete:
            debut = i
            continue
        if debut is not None and i > debut and ligne.startswith("## "):
            fin = i
            break
    if debut is None:
        return None, None
    return debut + 1, fin


_RE_H1 = re.compile(r"^#\s+.*$")


def _poser_titre(lignes, titre):
    """Pose le titre H1, EN PLACE.

    Deux cas selon le template :
    - un H1 PLACEHOLDER existe déjà (`specs/modele.md` : `# Bug — <titre :
      ...>`) : il est REMPLACÉ, sans décalage de ligne ;
    - aucun H1 n'existe (`_template.md`) : un H1 est INSÉRÉ juste avant
      `## Métadonnées`, précédé et suivi d'une ligne blanche — ce décalage de
      2 lignes repousse mécaniquement `## Description` (et le texte saisi
      qui y est recopié) hors de la fenêtre `lignes_entete=60` de
      `specs.py` (voir le docstring du module).
    """
    for i, ligne in enumerate(lignes):
        if _RE_H1.match(ligne):
            lignes[i] = "# " + titre
            return
    for i, ligne in enumerate(lignes):
        if ligne.strip() == "## Métadonnées":
            lignes[i:i] = ["# " + titre, ""]
            return
    # Ni H1 ni « ## Métadonnées » (template imprévu, projet personnalisé) :
    # préfixer plutôt qu'échouer silencieusement sur un titre jamais posé.
    lignes[0:0] = ["# " + titre, ""]


def _remplacer_section(lignes, entete, texte):
    """Remplace le corps de la section `entete` (jusqu'au prochain `## `, ou
    la fin du fichier) par `texte`, VERBATIM — EN PLACE.

    C'est la SEULE section que le texte saisi remplit : le commentaire HTML
    explicatif et le `[remplir]` natifs de cette section disparaissent avec
    elle, tout le reste du template garde les siens intacts.
    """
    debut, fin = _plage_section(lignes, entete)
    if debut is None:
        return False
    lignes[debut:fin] = ["", texte, ""]
    return True


def _date_du_jour():
    return time.strftime("%Y-%m-%d", time.gmtime())


def fabriquer(genre, titre, texte, template):
    """Fabrique le contenu d'un brouillon depuis le TEMPLATE DU PROJET
    (`template` = chemin absolu, résolu par `config.chemin_template()`).

    Rend `(contenu, substitutions, slug)`. `contenu` est `None` si le
    template est illisible — l'appelant traduit ce cas en `500` : jamais de
    repli sur un contenu interne codé en dur (invariant du plan).
    """
    try:
        with open(template, encoding="utf-8") as fichier:
            brut = fichier.read()
    except OSError:
        return None, None, None

    slug = normaliser_slug(titre)
    lignes = brut.split("\n")
    substitutions = []

    if _remplacer_valeur_champ(lignes, "Slug", slug):
        substitutions.append("slug")
    if _remplacer_valeur_champ(lignes, "Type", genre):
        substitutions.append("type")
    if _remplacer_valeur_champ(lignes, "Statut", "todo"):
        substitutions.append("statut")
    if _remplacer_valeur_champ(lignes, "Dernière mise à jour", _date_du_jour()):
        substitutions.append("maj")

    _poser_titre(lignes, titre)
    substitutions.append("titre")

    # `## Description` (template complet) ou, à défaut, `## Symptôme
    # observé` (template minimal) — jamais les deux : le premier qui
    # correspond porte le texte saisi.
    if _remplacer_section(lignes, "## Description", texte):
        substitutions.append("texte")
    elif _remplacer_section(lignes, "## Symptôme observé", texte):
        substitutions.append("texte")

    return "\n".join(lignes), substitutions, slug


def appliquer_numero(contenu, genre, numero):
    """Réconcilie le numéro attribué À L'ÉCRITURE avec la ligne `- **ID** :`,
    RESTREINTE au bloc `## Métadonnées` — jamais la première ligne
    `- **ID** :` du document, où qu'elle soit.

    Depuis que `contenu` est écrit VERBATIM (reboucle étape 5a, texte
    maîtrisé par l'opérateur, pas par un tiers non fiable), c'est la SEULE
    substitution de ce module qui interprète encore un `contenu` externe —
    et elle l'interprétait par POSITION plutôt que par structure : un
    `- **ID** :` forgé dans un bloc de code AVANT `## Métadonnées` recevait
    le vrai numéro tandis que le vrai champ restait à `feature-NNN` (revue de
    code, feature-008). Chercher UNIQUEMENT dans le bloc `## Métadonnées`
    élimine ce cas.

    `specs/modele.md` n'a NI section `## Métadonnées` NI champ `ID` (mesuré) :
    pour lui, cette fonction ne trouve rien à remplacer et rend
    `(contenu, False)` — seul le NOM DE FICHIER porte alors le numéro, jamais
    une invention de structure ou de champ absents du template.
    """
    lignes = contenu.split("\n")
    debut, fin = _plage_section(lignes, "## Métadonnées")
    if debut is None:
        return contenu, False
    applique = _remplacer_valeur_champ(
        lignes, "ID", "%s-%s" % (genre, _numero_txt(numero)), debut, fin)
    return "\n".join(lignes), applique


def _numero_txt(numero):
    return "%03d" % numero if numero < 1000 else str(numero)


def nom_fichier(genre, numero, slug):
    """`<genre>-<numero>-<slug>.md`. `numero=None` (brouillon, pas encore
    attribué) rend le littéral `NNN` — jamais un numéro inventé."""
    numero_txt = "NNN" if numero is None else _numero_txt(numero)
    return "%s-%s-%s.md" % (genre, numero_txt, slug)


# --- validation d'entrée --------------------------------------------------------

def valider_entrees(genre, titre, texte):
    """Rend `None` si valide, sinon `(code, message)` — toujours `422` ici :
    ce sont des erreurs de SAISIE, jamais des erreurs serveur."""
    if genre not in _GENRES:
        return 422, "type invalide : « feature » ou « bug » attendu"
    if not isinstance(titre, str) or not titre.strip():
        return 422, "titre manquant ou vide"
    if len(titre) > _TITRE_MAX:
        return 422, "titre trop long (max %d caractères)" % _TITRE_MAX
    if not isinstance(texte, str) or not texte.strip():
        return 422, "texte manquant ou vide"
    if len(texte) > _TEXTE_MAX:
        return 422, "texte trop long (max %d caractères)" % _TEXTE_MAX
    return None


def preparer_brouillon(config, genre, titre, texte, minimal_demande):
    """Rend `(resultat, None)` ou `(None, (code, message))`.

    N'écrit RIEN — c'est le contrat de `POST /api/spec/brouillon`.
    """
    erreur = valider_entrees(genre, titre, texte)
    if erreur is not None:
        return None, erreur

    richesse = choisir_richesse(bool(minimal_demande), titre, texte)
    template = config.chemin_template(richesse)
    if not template or not os.path.isfile(template):
        return None, (500, "template introuvable")

    contenu, substitutions, slug = fabriquer(genre, titre, texte, template)
    if contenu is None:
        return None, (500, "template introuvable")
    if not slug_valide(slug):
        return None, (422, "titre invalide : aucun caractère exploitable après normalisation")

    return {
        "genre": genre,
        "slug": slug,
        "nom_fichier_prevu": nom_fichier(genre, None, slug),
        "contenu": contenu,
        "substitutions": substitutions,
    }, None


# --- écriture sous verrou --------------------------------------------------------

def _prendre_flock(fd):
    """`flock(LOCK_EX | LOCK_NB)`, réessayé toutes les 100 ms jusqu'à un
    budget total de 2 s (GATE P1, condition 4). Rend `True`/`False` — ne
    lève JAMAIS pour un verrou occupé, c'est le seul cas attendu ici."""
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


def _rendre_flock(fd):
    try:
        fcntl.flock(fd, fcntl.LOCK_UN)
    except OSError:
        pass


def ecrire_sous_verrou(config, genre, slug, contenu, substitutions, chemin_verrou=None):
    """Attribue le numéro et écrit le fichier, sous `flock` COURT.

    Rend `(resultat, None)` ou `(None, (code, message))`. Le verrou n'est
    tenu QUE le temps du scan + de l'écriture — jamais celui d'une requête
    réseau : le scan des répertoires et l'`O_CREAT | O_EXCL` sont TOUS DEUX
    À L'INTÉRIEUR (GATE P1, conditions 3 et 4).

    `chemin_verrou` est INJECTABLE (`None` retombe sur `_CHEMIN_VERROU`, le
    verrou RÉEL du dépôt) : uniquement pour que les tests pointent vers leur
    propre dépôt jetable (PIEGES.md §1) sans jamais toucher au `var/` réel du
    poste qui exécute la suite — `server.py`, en production, ne passe jamais
    cet argument.
    """
    chemin_verrou = chemin_verrou or _CHEMIN_VERROU
    racine_projet = config["_racine_projet"]
    colonnes = config.colonnes()
    if not colonnes:
        return None, (500, "répertoire cible absent")
    repertoire_cible = colonnes[0][0]  # PREMIÈRE colonne — zéro donnée de requête
    specs_racine = config.section("specs").get("racine", "specs/features")
    dossier_cible = os.path.join(racine_projet, specs_racine, repertoire_cible)
    if not os.path.isdir(dossier_cible):
        # Le répertoire n'est jamais créé ici (invariant du plan) : « l'outil
        # le dit, il ne le crée pas en silence ».
        return None, (500, "répertoire cible absent")

    # Ceinture par-dessus les bretelles de `normaliser_slug()` : un slug
    # invalide ne doit JAMAIS atteindre `os.path.join` ci-dessous, quelle que
    # soit la provenance de l'appel.
    if not slug_valide(slug):
        return None, (422, "slug invalide")

    os.makedirs(os.path.dirname(chemin_verrou), exist_ok=True)
    fd_verrou = os.open(chemin_verrou, os.O_CREAT | os.O_RDWR, 0o600)
    try:
        if not _prendre_flock(fd_verrou):
            return None, (503, "verrou de numérotation indisponible, réessayez")
        try:
            racine_specs = os.path.join(racine_projet, specs_racine)
            pris = S.numeros_pris(racine_specs, colonnes)
            numero = S.prochain_numero(pris, genre)

            contenu_final, id_applique = appliquer_numero(contenu, genre, numero)
            substitutions_finales = list(substitutions)
            if id_applique:
                substitutions_finales.append("id")

            nom = nom_fichier(genre, numero, slug)
            chemin_absolu = os.path.join(dossier_cible, nom)

            # Confinement (GATE P1, condition 2) : le chemin final DOIT
            # résoudre exactement à `<specs.racine>/<première colonne>/<nom>`
            # une fois passé par le point d'entrée unique `vcs.chemin_sur()`.
            attendu = "/".join([specs_racine, repertoire_cible, nom])
            relatif = V.chemin_sur(racine_projet, chemin_absolu)
            if relatif is None or relatif != attendu:
                return None, (500, "chemin de destination non conforme")

            # Encoder AVANT `os.open` (GATE P2, condition 1) : un `contenu`
            # portant un point de code substitut isolé (`"\ud800"` — JSON
            # valide, qu'un `JSON.stringify` de navigateur peut produire)
            # lève `UnicodeEncodeError`. Après l'`open`, cette exception
            # laissait un fichier VIDE sur disque avec un numéro déjà
            # consommé (mesuré par l'auditeur, GATE P2) — violation directe
            # de l'écriture tout-ou-rien ET du numéro jamais gaspillé. C'est
            # une SAISIE invalide, pas une panne serveur : `422`, jamais
            # `500`. Le numéro n'est ici qu'une valeur en mémoire (utilisée
            # par `appliquer_numero` ci-dessus) — rien n'est écrit sur disque
            # avant l'encodage, donc rien à « rendre » : le prochain appel
            # recalculera le MÊME numéro par un simple nouveau scan.
            try:
                octets = contenu_final.encode("utf-8")
            except UnicodeEncodeError:
                return None, (422, "contenu invalide : caractère non encodable en UTF-8")

            try:
                fd_fichier = os.open(
                    chemin_absolu, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
            except FileExistsError:
                return None, (409, "un fichier porte déjà ce nom")
            try:
                os.write(fd_fichier, octets)
            finally:
                os.close(fd_fichier)

            return {
                "id": os.path.splitext(nom)[0],
                "chemin": relatif,
                "numero": numero,
                "substitutions_finales": substitutions_finales,
            }, None
        finally:
            _rendre_flock(fd_verrou)
    finally:
        os.close(fd_verrou)


def valider_ecriture(genre, titre, contenu):
    """Rend `None` si valide, sinon `(422, message)`.

    `genre` : enum FERMÉ (GATE P1, condition 1). `titre` sert à RE-DÉRIVER le
    slug (donc le chemin), jamais lu dans `contenu`. `contenu` : absent, vide
    ou non-`str` est un `422` EXPLICITE (reboucle étape 5a) — jamais un repli
    silencieux sur une régénération : le client doit toujours dire ce qu'il a
    fait relire.
    """
    if genre not in _GENRES:
        return 422, "type invalide : « feature » ou « bug » attendu"
    if not isinstance(titre, str) or not titre.strip():
        return 422, "titre manquant ou vide"
    if len(titre) > _TITRE_MAX:
        return 422, "titre trop long (max %d caractères)" % _TITRE_MAX
    if not isinstance(contenu, str) or not contenu.strip():
        return 422, "contenu manquant ou vide"
    if len(contenu) > _CONTENU_MAX:
        return 422, "contenu trop volumineux (max %d caractères)" % _CONTENU_MAX
    return None


def ecrire_spec(config, genre, titre, contenu, chemin_verrou=None):
    """`POST /api/spec/ecrire` : écrit `contenu` — le Markdown TEL QUE RELU
    par l'humain, corrections comprises — VERBATIM, jamais reconstruit
    (reboucle étape 5a : régénérer depuis `{titre, texte}` jetait toute
    correction humaine en silence).

    `genre` et `titre` sont des CHAMPS JSON DÉDIÉS : `titre` RE-DÉRIVE le
    slug (`normaliser_slug`), `genre` est REVÉRIFIÉ contre l'enum fermé —
    aucun des deux n'est jamais lu dans `contenu` (GATE P1, condition 1 :
    porte sur le CHEMIN, pas sur le contenu, et reste tenue à la lettre quel
    que soit ce que `contenu` renferme, y compris une remontée de répertoire
    en texte libre — elle n'a aucune prise sur le nom de fichier). Le numéro
    (`NNN` -> réel) est réconcilié sur la ligne `- **ID** :` de CE `contenu`
    par `ecrire_sous_verrou`.
    """
    erreur = valider_ecriture(genre, titre, contenu)
    if erreur is not None:
        return None, erreur
    slug = normaliser_slug(titre)
    if not slug_valide(slug):
        return None, (422, "titre invalide : aucun caractère exploitable après normalisation")
    return ecrire_sous_verrou(config, genre, slug, contenu, substitutions=[],
                              chemin_verrou=chemin_verrou)


if __name__ == "__main__":
    import json
    import sys

    import config as C

    configuration = C.charger()
    titre_demo = sys.argv[1] if len(sys.argv) > 1 else "Exemple de besoin ../../etc"
    texte_demo = sys.argv[2] if len(sys.argv) > 2 else "Texte saisi de démonstration."
    resultat_demo, erreur_demo = preparer_brouillon(
        configuration, "feature", titre_demo, texte_demo, minimal_demande=False)
    print(json.dumps({"resultat": resultat_demo, "erreur": erreur_demo},
                      ensure_ascii=False, indent=2))
