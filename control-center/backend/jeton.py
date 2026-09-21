#!/usr/bin/env python3
"""Jeton partagé — l'unique barrière entre le réseau et l'exécution de commandes.

    python3 control-center/backend/jeton.py <chemin> <racine_projet>

## Ce que ce module garantit, et ce qu'il refuse de deviner

Le jeton est lu depuis le fichier désigné par `[serveur].fichier_jeton`
(config.py), **hors du dépôt** : un secret versionné n'en est plus un
(ADR-0007). `charger()` ne lève jamais — absent, vide, mal protégé ou
illisible, elle rend un `Jeton` **inactif**, avec un motif nommé
(`Jeton.refus`) : c'est le message que le serveur affichera au démarrage.

⚠️ Ce que fait `server.py` d'un jeton inactif **dépend du déploiement**
(ADR-0020, ce module n'en décide rien) : **aucun** `fichier_jeton` déclaré
laisse la lecture ET l'écriture ouvertes en local, sans secret — un projet qui
ne veut pas du pilotage garde son tableau de bord. Mais un `fichier_jeton`
**déclaré et inactif** (permissions, taille, encodage refusés ci-dessous) doit
**fermer** lecture ET écriture, locale comprise — *fail-closed* : une
configuration cassée est le moment où il faut se méfier, pas celui où l'on
baisse la garde. C'est `server.py` qui pose cette distinction, sur la
présence du chemin (`config.fichier_jeton() is not None`), jamais sur
`Jeton.actif()` seul — les confondre a ouvert une régression de sécurité
mesurée pendant `bug-012` : un jeton déclaré en mode `0644` bloquait
l'écriture (403) avant ce cycle, il ouvrait ensuite lecture ET écriture à
tout le réseau derrière un intermédiaire local.

## Deux dangers, deux gardes

**1. Le temps de réponse ne doit rien fuiter.** `Jeton.compare()` passe
toujours par `hmac.compare_digest`, jamais par `==` : une comparaison
naïve s'arrête au premier octet différent, et le temps qu'elle met à
répondre trahit la longueur du préfixe déjà correct.

**2. Un jeton non-ASCII ne doit jamais être « deviné ».** Un en-tête HTTP
est relu en LATIN-1 par la bibliothèque standard (RFC 7230) : un jeton
UTF-8 contenant un caractère accentué (`'sécret'`) redevient, une fois passé
par un en-tête, une suite d'octets **différente** de celle écrite dans le
fichier. La comparaison échouerait alors pour une raison qui n'a rien à voir
avec « jeton faux », et personne ne le saurait. On **refuse** donc au
chargement tout jeton qui n'est pas de l'ASCII imprimable strict — jamais on
ne tente de deviner quel encodage l'auteur avait en tête.

## Ce que ce module NE fait PAS

Il ne décide pas si les routes de lecture ou d'écriture s'ouvrent : c'est
`server.py` qui interroge `Jeton.actif()`, et — pour savoir si un jeton est
seulement EXIGÉ — la présence du chemin déclaré (`config.fichier_jeton()`),
selon le déploiement (ADR-0020). Ce module n'a pas non plus connaissance du
réseau : le jeton « présenté » qu'on lui passe est déjà une chaîne ou des
octets, jamais une requête HTTP.
"""

import hmac
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vcs as V  # noqa: E402

# Un jeton tient sur une ligne. Au-delà, ce n'est plus un secret qu'un humain a
# collé dans un fichier, et le lire en entier n'apporterait rien qu'un risque de
# mémoire ou de fichier piégé.
_TAILLE_MAX = 4096

# Un jeton lisible par le groupe ou par tous n'est pas un secret. C'est un
# MASQUE sur les bits groupe/autres (0o077), pas une comparaison numérique :
# `0o600 > 0o600` est faux mais `0o060 > 0o600` l'est aussi, alors que 0o060
# donne le secret en lecture au groupe. Seuls les bits propriétaire peuvent
# être posés ; tout bit groupe OU autre présent est refusé.
_MASQUE_INTERDIT = 0o077

# En-dessous de 16 octets utiles (après retrait du \n final), un jeton est
# trop court pour offrir une résistance sérieuse à une recherche exhaustive.
# Statué en GATE P1.
_TAILLE_MIN = 16

# Un jeton que son PROPRIÉTAIRE ne peut pas lire est une configuration cassée,
# jamais un jeton actif (bug-018) : `open()` échoue déjà pour un utilisateur
# normal, mais root franchit les permissions de fichier — ce qui rendait le
# verdict dépendant de l'IDENTITÉ de l'exécutant, pas du fichier. La garde se
# décide sur ce BIT de mode dans `info.st_mode`, JAMAIS sur ce que rendrait un
# appel de vérification d'accès du système (mesuré en root : un tel appel
# rend un accès en lecture VRAI sur `0200` ET sur `0000`, ce qui reconduirait
# exactement le défaut — voir PIEGES.md et le journal de bug-018).
_MASQUE_LECTURE_PROPRIETAIRE = 0o400


class Jeton:
    """Résultat du chargement : soit un jeton actif, soit un refus motivé et
    NOMMÉ — jamais les deux, jamais ni l'un ni l'autre."""

    def __init__(self, valeur=None, refus=None):
        assert (valeur is None) != (refus is None), \
            "un Jeton est actif XOR refusé, jamais les deux ni ni l'un ni l'autre"
        self._valeur = valeur  # bytes ASCII imprimables, ou None
        self.refus = refus     # motif lisible, ou None si actif

    def actif(self):
        """Vrai si un jeton a été chargé et que les routes d'écriture peuvent
        s'activer. Faux ⇒ `self.refus` porte le motif à afficher."""
        return self._valeur is not None

    def compare(self, presente):
        """Compare `presente` au jeton chargé, à temps constant.

        Rend toujours False si aucun jeton n'est actif : il ne doit jamais
        exister de valeur « présentée » qui réussisse par accident contre un
        jeton absent.

        `presente` peut être `str` ou `bytes`/`bytearray`. Une chaîne est
        réencodée en LATIN-1 — jamais en ASCII, jamais en UTF-8 : c'est
        l'encodage que la bibliothèque standard utilise pour DÉCODER un
        en-tête HTTP, et c'est le seul qui restitue exactement les octets
        reçus sur le fil (LATIN-1 est une bijection octet ↔ point de code sur
        [0, 255]). Une chaîne qui ne peut pas se réencoder ainsi (point de
        code > 255 — impossible depuis un vrai en-tête, possible depuis un
        appelant direct) est REFUSÉE, jamais devinée.
        """
        if self._valeur is None:
            return False
        if isinstance(presente, str):
            try:
                presente = presente.encode("latin-1")
            except UnicodeEncodeError:
                return False
        if not isinstance(presente, (bytes, bytearray)):
            return False
        # ⚠️ Remplacer cet appel par `==` rend EXACTEMENT les mêmes True/False
        # sur tout jeu de test fondé sur la sortie : aucun test ne peut TUER ce
        # mutant-là, la propriété qu'il protège est un TEMPS de réponse, pas
        # un résultat observable autrement qu'en microbenchmark. Écrit ici
        # plutôt que compté comme un mutant tué (même motif que le `..` de
        # `vcs.fichiers_du_commit`).
        return hmac.compare_digest(self._valeur, bytes(presente))


def _dans_le_depot(chemin, racine_projet):
    """Vrai si `chemin`, une fois résolu, tombe DANS le dépôt.

    Réutilise `vcs.chemin_sur()` — le point d'entrée unique déjà validé pour
    cette question — plutôt que de réimplémenter une résolution de chemin
    séparée qui pourrait diverger de la première (déjà vu : deux lecteurs d'une
    même notion qui ne s'accordent pas plus une garde fermée).
    """
    return V.chemin_sur(racine_projet, chemin) is not None


def _ascii_imprimable(donnees):
    """Vrai si `donnees` (bytes) ne contient QUE de l'ASCII imprimable
    (0x20-0x7E). Appelée sur la valeur déjà DÉBARRASSÉE de son retour à la
    ligne final : un jeton légitime tient sur une seule ligne."""
    return all(0x20 <= octet <= 0x7E for octet in donnees)


def charger(chemin, racine_projet):
    """Charge le jeton depuis `chemin`. Rend un `Jeton`, ne lève JAMAIS.

    Chaque refus est nommé — c'est le message que le serveur affichera au
    démarrage. Ce module ne dit que si CE jeton est comparable ; ce que
    `server.py` en fait — lecture et écriture ouvertes en local sans jeton
    déclaré, ou fermées si un jeton est déclaré et invalide — dépend du
    déploiement (ADR-0020), pas de ce module seul.
    """
    if not chemin or not isinstance(chemin, str):
        return Jeton(refus="aucun fichier_jeton déclaré — routes d'écriture "
                            "désactivées, lecture seule active")

    if _dans_le_depot(chemin, racine_projet):
        return Jeton(refus="fichier_jeton situé DANS le dépôt (%s) — un secret "
                            "versionné n'en est plus un" % chemin)

    try:
        info = os.stat(chemin)
    except OSError:
        return Jeton(refus="fichier_jeton absent ou illisible (%s)" % chemin)

    if not os.path.isfile(chemin):
        return Jeton(refus="fichier_jeton n'est pas un fichier régulier (%s)"
                            % chemin)

    permissions = info.st_mode & 0o777
    if permissions & _MASQUE_INTERDIT:
        return Jeton(refus="fichier_jeton trop permissif (mode %04o, attendu "
                            "au plus 0600)" % permissions)

    # bug-018 : distinct du refus « absent ou illisible » ci-dessous (qui
    # constate un ÉCHEC d'ouverture) — ici le fichier EST accessible à
    # `os.stat`, son mode passe le masque groupe/autres, mais son propriétaire
    # lui-même n'a pas le bit de lecture. Aucun chemin dans le motif : il
    # traverse `_raison_publique()` jusqu'à `/api/etat` (server.py).
    if not (permissions & _MASQUE_LECTURE_PROPRIETAIRE):
        return Jeton(refus="fichier_jeton sans bit de lecture propriétaire "
                            "(mode %04o) — corrigez avec chmod 600" % permissions)

    try:
        with open(chemin, "rb") as fichier:
            # Lu jusqu'à _TAILLE_MAX + 2 : au plus _TAILLE_MAX octets UTILES
            # plus, tolérée, une unique `\n` finale (voir plus bas). Lire un
            # octet de plus que ce total suffit à constater le dépassement
            # sans jamais lire un fichier piégé en entier.
            brut = fichier.read(_TAILLE_MAX + 2)
    except OSError:
        return Jeton(refus="fichier_jeton absent ou illisible (%s)" % chemin)

    # Borne AVANT le retrait du `\n` : au-delà de _TAILLE_MAX + 1 octets bruts,
    # même un unique `\n` final retiré laisse plus de _TAILLE_MAX octets
    # utiles — inutile de lire plus loin pour le savoir.
    if len(brut) > _TAILLE_MAX + 1:
        return Jeton(refus="fichier_jeton trop volumineux (> %d octets utiles)"
                            % _TAILLE_MAX)

    # Le retrait du \n final est ACCEPTABLE (statué en GATE P1) : c'est ce
    # qu'un `echo secret > fichier` laisse, et c'est l'usage le plus courant.
    if brut.endswith(b"\n"):
        brut = brut[:-1]

    # La borne compte les octets UTILES (après retrait du `\n` ci-dessus),
    # pas les octets bruts du fichier — cohérent avec `_TAILLE_MIN` plus bas,
    # qui compte déjà ainsi. Un jeton de _TAILLE_MAX octets utiles est
    # accepté QUE le fichier porte ou non un `\n` final.
    if len(brut) > _TAILLE_MAX:
        return Jeton(refus="fichier_jeton trop volumineux (> %d octets utiles)"
                            % _TAILLE_MAX)

    if not brut:
        return Jeton(refus="fichier_jeton vide (%s)" % chemin)

    if len(brut) < _TAILLE_MIN:
        return Jeton(refus="fichier_jeton trop court (%d octet(s) utile(s), "
                            "minimum %d)" % (len(brut), _TAILLE_MIN))

    if b" " in brut:
        return Jeton(refus="fichier_jeton contient une espace — un caractère "
                            "invisible, indiscernable à la lecture, qui ne "
                            "doit jamais faire silencieusement partie d'un "
                            "secret")

    if not _ascii_imprimable(brut):
        return Jeton(refus="fichier_jeton contient des octets hors ASCII "
                            "imprimable — refusé plutôt que deviné (un jeton "
                            "non-ASCII redevient une suite d'octets différente "
                            "une fois relu depuis un en-tête HTTP, en LATIN-1)")

    return Jeton(valeur=bytes(brut))


if __name__ == "__main__":
    chemin_arg = sys.argv[1] if len(sys.argv) > 1 else ""
    racine_arg = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    resultat = charger(chemin_arg, racine_arg)
    if resultat.actif():
        print("jeton actif (%d octets)" % len(resultat._valeur))
    else:
        print("jeton INACTIF : %s" % resultat.refus)
