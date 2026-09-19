#!/usr/bin/env python3
"""La règle de rédaction d'une tête de commande — UNE SEULE, partagée.

`bug-014` : deux écrivains (`record-event.py`, `backend/server.py`) posaient
chacun leur propre motif pour retenir « les deux premiers jetons » d'une
commande, et les deux ont dérivé au fil de trois passages successifs sur le
même problème (`bug-012`, puis ce cycle). Ce module existe pour que la
question « qu'est-ce qu'on a le droit de journaliser d'une commande ? » ait
une seule réponse, appelée depuis les deux endroits qui en ont besoin :
`hooks/record-event.py` (le hook) et `backend/config.py` /
`backend/server.py` (`tetes_de_commande()` et `_lancer()`).

## Ce que la garde fait réellement — et ce qu'elle ne fait pas

Un mot de passe entièrement en minuscules (`hunterpass`, une passphrase, un
mot du dictionnaire) est **lexicalement indiscernable** d'une sous-commande
légitime (`git status`, `npm run`, `docker ps`). Aucun motif sur la FORME du
second jeton ne peut donc, à lui seul, fermer la classe : il faut soit perdre
l'information (ne jamais garder de second jeton nu), soit la borner à des
programmes dont le second jeton est *structurellement* un verbe du
programme, jamais une donnée saisie par l'utilisateur.

La variante retenue (« A′ », `ADR-0028`) accepte un second jeton si :

1. il a la forme d'une **option courte** (`-` + 1 ou 2 lettres : `-e`, `-rn`,
   `-la`) — une grappe de drapeaux, jamais une option collée à sa valeur
   (`-psecret` ferait 7 lettres, largement hors de cette borne) ;
2. il a la forme d'une **option longue** (`--` + lettres/tirets : `--json`,
   `--max-budget-usd`) ;
3. il est un **mot nu en minuscules** (`test`, `run`, `status`) **et** le
   PREMIER jeton de la commande figure dans `_PROGRAMMES_A_SOUS_COMMANDE` —
   une liste FERMÉE de programmes dont le second mot est un verbe du
   programme, jamais une donnée (voir plus bas).

Sans chiffre dans le mot nu : `git 4a0d9ce` ne doit pas passer pour une
sous-commande.

### Ce qui reste ouvert, et pourquoi c'est un choix écrit, pas un oubli

**Résidu 1 — option longue à valeur collée.** `^--[A-Za-z][A-Za-z-]*$` laisse
passer `--passwordx` ou `--token-hunterpass` : rien ne distingue, sur la
forme, un nom d'option de 20 lettres d'un nom d'option suivi d'une valeur
collée sans séparateur. **Décision : ASSUMÉ, non fermé.** Fermer ce résidu
par une borne de longueur casserait des options longues légitimes déjà
observées (`--max-budget-usd`, 17 caractères) sans borne évidente qui les
distingue d'un `--motdepasse` de même longueur. La forme « valeur collée à
une option longue sans `=` » est de toute façon non standard (`getopt`
exige un séparateur) — et la mesure sur les deux journaux réels
(`bug-014`, condition 6 du GATE) ne trouve QUE des options légitimes
(`--version`, `--check`, `--help`, `--write`) à cet endroit. Le résidu reste
borné par `_MAX_TOKEN` (24 caractères) comme tout jeton.

**Résidu 2 — fermé pour le décalage EN TÊTE et pour le décalage
INTERCALAIRE, sur la FORME, pas sur le contenu.** Un jeton écarté (`=`, `:`,
ou plus de `_MAX_TOKEN` caractères) DÉCALE la position des jetons suivants.
Deux fermetures successives ont été nécessaires, chacune trouvée en revue
après que la précédente ne fermait que l'exemple qu'elle citait — l'aveu
est volontaire, c'est le mode d'échec établi de ce fichier :

1. Décalage EN TÊTE : le jeton qui atterrit en première position de `safe`
   après un écart n'était accepté SANS AUCUN filtre
   (`POOL_PASSWORD=x hunterpass` → `hunterpass`, `A=b -psecret` →
   `-psecret`). Une première fermeture n'écartait que le mot nu minuscule
   pur et le tiret isolé — elle rouvrait la classe à la première majuscule
   ou au premier chiffre (`Hunterpass`, `hunter_pass`, `hunterpass2`
   passaient tous), le défaut historique de `bug-012`. Fermée en resserrant
   `_admis_comme_premier_jeton_decale` à deux formes seulement — option, ou
   apparence de chemin (`/…`, `./…`, `../…`).
2. Décalage INTERCALAIRE : un écart survenant ENTRE la position 1 (déjà
   établie sans écart) et la position 2 ne remettait PAS `premier_jeton` à
   `None` — le passe-droit de sous-commande du VRAI premier jeton survivait
   à un écart pourtant intervenu après lui (`git PASSWORD=x hunterpass` →
   `git hunterpass`, six programmes de `_PROGRAMMES_A_SOUS_COMMANDE`
   concernés). Fermée en conditionnant `_admis_en_seconde_position` sur
   « aucun écart À CE STADE », jamais seulement « aucun écart avant la
   position 1 ».

Dans les deux cas, tout le reste est rejeté, y compris un nom de programme
réel qui n'aurait ni tiret ni chemin (`python3`, `md5sum` cités sans `./`) :
perte d'observation ASSUMÉE. Coût mesuré, PAS nul : la mesure de l'historique
déjà journalisé (GATE P1, condition 6, sur les deux instantanés figés)
couvre les TROIS déclencheurs de `continue` (`=`, `:`, longueur — aucun ne
laisse de trace distinctive une fois le jeton écarté) et trouve 36 têtes
(kit) et 26 têtes (firmware) déjà nées de cette branche, TOUTES des noms de
programme bruts (`cd`, `cat`, `ls`, `cp`, `echo`…), ZÉRO secret parmi elles.
Ce sont ces 36 + 26 têtes, précisément, que la fermeture EN TÊTE fait
disparaître de l'historique — pas zéro occurrence, mais zéro secret parmi
les occurrences perdues.

## `_PROGRAMMES_A_SOUS_COMMANDE` — critère d'admission, pas une intuition

Mesurée contre les journaux réels du kit et du firmware (`bug-014`, M1) :
les seuls programmes dont le second jeton porte, en pratique, une
sous-commande utile plutôt qu'une donnée sont `git`, `gh`, `pio`, `npm`,
`docker`, `pip`. Trois garde-fous, à respecter pour toute évolution de cette
liste :

1. Elle ne contient QUE des **premiers jetons** (des noms de programmes),
   JAMAIS de sous-commandes : ce module ne connaît toujours rien du contenu
   d'un projet particulier (contrainte n°4 de `record-event.py`) — `git`,
   `npm`, `docker` portent le même nom dans le template et dans tout projet
   qui l'instancie, ce n'est pas une connaissance « du projet ».
2. Critère d'admission ÉCRIT pour toute entrée : un programme dont le
   second jeton est TOUJOURS un verbe du programme lui-même, JAMAIS une
   donnée saisie par l'utilisateur ou un chemin.
3. Défaut sûr : un programme ABSENT de la liste perd simplement son second
   jeton — il ne fait jamais fuir plus. Une liste incomplète coûte de
   l'observation, jamais de la sécurité.

Sont explicitement EXCLUS, bien que leur second jeton ressemble parfois à un
verbe : `sudo`, `env` (enveloppent une commande arbitraire — leur "verbe" est
en réalité le programme suivant, potentiellement avec ses propres données) ;
`ssh`, `sshpass` (le second jeton est un hôte ou une option de connexion,
jamais un verbe fermé) ; `echo`, `printf`, `cat` (impriment tel quel ce qu'on
leur donne — c'est la forme historique de la fuite, `bug-012`) ; `cd`
(argument = un chemin, jamais un verbe) ; `python3`, `bash`, `sh`
(interprètes génériques dont le second mot est un script ou du code, jamais
un verbe fermé du programme).

## Ce que ce module N'EST PAS

Il n'est PAS un hook : il ne lit pas stdin, n'écrit rien, ne sort jamais en
erreur de façon visible pour un appelant qui l'importerait correctement — et
surtout, un échec à l'IMPORT de ce module ne doit jamais faire échouer
`record-event.py` (voir son enveloppe d'import). C'est un pur module de
calcul : une fonction, des constantes, aucun effet de bord.
"""

import re

# Un jeton anormalement long est un chemin ou une donnée, jamais un nom de
# programme ou une option : il n'apporte rien et peut porter n'importe quoi.
# Même borne que l'historique de `record-event.py` (`bug-012`).
_MAX_TOKEN = 24

# Option courte : UN tiret suivi d'une à deux lettres. Une grappe de drapeaux
# (`-rn`, `-la`, `-rf`) passe ; une option collée à sa valeur (`-psecretword`,
# 11 lettres) est bien au-delà de cette borne et n'est donc jamais retenue.
# Résidu assumé et mesuré : `-pa` (valeur collée d'UN caractère) — jamais un
# préfixe tronqué, voir la docstring de `command_head`.
_OPTION_COURTE = re.compile(r"^-[A-Za-z]{1,2}$")

# Option longue : `--` suivi de lettres et de tirets, sans borne de longueur.
# Résidu 1, assumé par écrit dans la docstring du module.
_OPTION_LONGUE = re.compile(r"^--[A-Za-z][A-Za-z-]*$")

# Mot nu : lettres MINUSCULES et tirets uniquement, jamais de chiffre — sinon
# un hachage de commit (`4a0d9ce`) ou une version (`v2`) passerait pour une
# sous-commande. N'est admis que si le premier jeton figure dans
# `_PROGRAMMES_A_SOUS_COMMANDE` (voir plus bas).
_MOT_NU = re.compile(r"^[a-z][a-z-]*$")

# Liste FERMÉE, mesurée contre les journaux réels (`bug-014`, M1) : voir le
# critère d'admission et les exclusions écrites dans la docstring du module.
_PROGRAMMES_A_SOUS_COMMANDE = frozenset({"git", "gh", "pio", "npm", "docker", "pip"})


def _admis_en_seconde_position(token, premier_jeton):
    """Vrai si `token` peut occuper la seconde position derrière `premier_jeton`."""
    if _OPTION_COURTE.match(token) or _OPTION_LONGUE.match(token):
        return True
    if _MOT_NU.match(token):
        return premier_jeton in _PROGRAMMES_A_SOUS_COMMANDE
    return False


def _admis_comme_premier_jeton_decale(token):
    """Vrai si `token` peut occuper la PREMIÈRE position de `safe` alors qu'il
    n'est PAS le tout premier jeton de la commande — un jeton précédent a été
    écarté (`=`, `:`, ou trop long).

    Fermeture du résidu 2 (GATE P1, `bug-014`) : sans cette fonction, ce jeton
    héritait du passe-droit du VRAI premier jeton (accepté quelle que soit sa
    forme), alors que rien ne garantit qu'il s'agit d'un nom de programme —
    `POOL_PASSWORD=x hunterpass` en faisait le premier jeton retenu, jamais
    filtré.

    ⚠️ Une première version de cette fonction (revue en GATE P2) n'écartait
    que le mot nu minuscule pur et le tiret isolé — elle fermait l'EXEMPLE
    (`hunterpass`), pas la CLASSE : une majuscule ou un chiffre suffisaient à
    la traverser (`Hunterpass`, `hunter_pass`, `hunterpass2`), exactement le
    défaut historique de `bug-012`. **Seules deux formes sont admises ici** :
    - un jeton d'apparence OPTION (`-x`, `--json`), comme en seconde
      position ;
    - un jeton d'apparence CHEMIN — commence par `/` (chemin absolu), `./` ou
      `../` (chemin relatif, `./script.sh`, `../bin/x`) — la forme que prend
      un nom de script ou de binaire quand il n'est pas résolu via `PATH`.
      ⚠️ Le critère porte sur la BARRE, pas sur le simple point : un point
      seul (`.hunterpass`) n'a l'apparence d'aucun chemin réel — c'est un
      préfixe d'un caractère, pas une syntaxe de script. Resserré en GATE P2
      (re-verdict), quatrième résidu trouvé, mineur.

    Tout le reste est REJETÉ, y compris un nom de programme bien réel s'il
    n'a ni tiret ni chemin (`python3`, `md5sum` cités tels quels, sans `./`) :
    perte d'observation ASSUMÉE. Coût mesuré, PAS nul : GATE P1 condition 6,
    sur les deux instantanés figés, trouve 36 têtes (kit) et 26 têtes
    (firmware) déjà nées de cette branche — la mesure couvre les TROIS
    déclencheurs de `continue` (`=`, `:`, jeton trop long), qui ne laissent
    aucune trace distinctive une fois le jeton écarté : rien ne permet de
    séparer, depuis le journal, un décalage par affectation d'un décalage
    par longueur. TOUTES sont des noms de programme bruts (`cd`, `cat`,
    `ls`, `cp`, `echo`…), ZÉRO secret parmi elles — ce sont ces 36 + 26
    têtes que cette fermeture fait disparaître de l'historique.
    """
    if _OPTION_COURTE.match(token) or _OPTION_LONGUE.match(token):
        return True
    return token.startswith("/") or token.startswith("./") or token.startswith("../")


def command_head(command):
    """Les deux premiers jetons SÛRS d'une commande, et rien de plus.

    `pio test -e native` → `pio test` ; `git commit -F …` → `git commit` ;
    `mysql -psecretword -h db` → `mysql` (le second jeton est écarté, pas
    tronqué) ; `git status` → `git status` (mot nu admis, `git` est dans
    `_PROGRAMMES_A_SOUS_COMMANDE`).

    ⚠️ Tout jeton contenant `=` ou `:` est ÉCARTÉ (pas tronqué) : deux idiomes
    du shell portent couramment un secret dans les tout premiers jetons
    (`POOL_PASSWORD=secret ./ota_update.sh`, `curl -u admin:secret http://…`).
    Écarter plutôt que tronquer : `POOL_PASSWORD=sec` resterait un préfixe de
    secret. Un jeton anormalement long (`> _MAX_TOKEN`) est écarté pour la
    même raison — c'est un chemin ou une donnée, pas un nom de programme.

    ⚠️ Ce qu'un jeton écarté fait à la POSITION des suivants : le premier
    jeton non écarté n'est accepté SANS CONDITION que s'il est réellement le
    tout premier jeton de la commande. S'il arrive après un écart, voir
    `_admis_comme_premier_jeton_decale` — c'est la fermeture du résidu 2 du
    GATE P1 (`bug-014`) : sans elle, `POOL_PASSWORD=x hunterpass` recopiait
    `hunterpass` sans aucun filtre, et `A=b -psecret` recopiait `-psecret`.

    `None` et non `""` quand rien n'est retenu : l'absence n'est pas une
    valeur du domaine. L'appelant teste la valeur pour sa vérité, jamais
    `is None` — garder les deux vrais.
    """
    if not isinstance(command, str):
        return None
    safe = []
    premier_jeton = None
    ecart_survenu = False
    for token in command.split():
        if "=" in token or ":" in token:
            ecart_survenu = True
            continue
        if len(token) > _MAX_TOKEN:
            ecart_survenu = True
            continue
        if not safe:
            if ecart_survenu:
                # Le "premier" jeton retenu n'est pas le premier de la
                # commande : il n'a droit à aucun passe-droit inconditionnel.
                if not _admis_comme_premier_jeton_decale(token):
                    break
                # Le programme réel reste INCONNU (le vrai premier jeton a
                # été écarté) : un mot nu en seconde position ne peut donc
                # jamais être admis comme sous-commande, quel que soit ce
                # jeton — voir `_admis_en_seconde_position`.
                premier_jeton = None
            else:
                premier_jeton = token
            safe.append(token)
        else:
            # `premier_jeton` n'est un programme CONNU que si AUCUN jeton n'a
            # été écarté nulle part avant cette position — pas seulement
            # avant la position 1. Un écart INTERCALAIRE (entre la position 1
            # et celle-ci) ne remettait pas `premier_jeton` à `None` : le
            # passe-droit de sous-commande du VRAI premier jeton survivait à
            # un écart survenu APRÈS lui (`git PASSWORD=x hunterpass` →
            # `git hunterpass`, revue de code, cinquième forme). Le critère
            # est donc « aucun écart à date », jamais « aucun écart avant la
            # position 1 ».
            if _admis_en_seconde_position(token, premier_jeton if not ecart_survenu else None):
                safe.append(token)
            # On S'ARRÊTE plutôt que de chercher plus loin, que le jeton ait
            # été retenu ou non : le jeton suivant serait encore plus
            # probablement une donnée, jamais une troisième sous-commande.
            # C'est aussi la SEULE sortie de boucle utile une fois `safe`
            # non vide : la branche `if not safe` ci-dessus ne fait jamais
            # grandir `safe` au-delà d'UN élément avant de retomber ici. Un
            # second garde-fou `if len(safe) == 2: break` après cette
            # branche serait donc INATTEIGNABLE — trouvé en revue, retiré
            # plutôt que gardé mort.
            break
    return " ".join(safe) if safe else None
