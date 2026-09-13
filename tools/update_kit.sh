#!/usr/bin/env bash
# ============================================================================
# Récupère, dans un projet, les évolutions du kit d'agents — CHIRURGICALEMENT.
#
# POURQUOI CE SCRIPT : un projet créé depuis le kit n'a AUCUN lien git avec lui.
# Ni template GitHub, ni copie manuelle ne propagent quoi que ce soit : les deux
# dépôts sont étrangers dès la seconde qui suit la création. Sans outil, une
# amélioration d'agent faite trois mois plus tard n'atteint jamais les projets.
#
# POURQUOI « CHIRURGICALEMENT » : une synchronisation aveugle écraserait
# CLAUDE.md — le fichier le plus personnalisé du projet est aussi celui que le
# kit fournit. D'où deux catégories, à ne jamais confondre :
#
#   GELÉS      — fournis par le kit, jamais modifiés sur place. Une amélioration
#                se fait DANS le kit, puis redescend ici. Ce sont eux, et eux
#                seuls, que ce script récupère.
#   PERSONNALISÉS — CLAUDE.md, skill dev-workflow, settings.json, CHANGELOG,
#                mémoire, fichiers de CI, agents métier du projet. JAMAIS touchés
#                par ce script.
#
# Le sens inverse (une leçon apprise ici qui vaut pour tous les projets) reste
# MANUEL et délibéré : on copie le fichier vers le kit et on l'inscrit à son
# CHANGELOG avec le défaut qui l'a motivée.
#
# USAGE :
#     ./tools/update_kit.sh [--dry-run]
#
# Prérequis : un distant nommé `kit` pointant sur le dépôt du kit.
#     git remote add kit https://github.com/<compte>/agent-kit.git
#
# Portable bash 3.2 (macOS) : ni `declare -A`, ni `mapfile`.
# ============================================================================
set -uo pipefail

DISTANT="kit"
BRANCHE="main"

# Chemins GELÉS, toujours récupérés. Un chemin absent du kit est ignoré sans erreur.
CHEMINS="
.claude/agents
.claude/skills/spec-workflow
.claude/skills/security-checklist
.claude/skills/db-migrations
tools/check_specs.sh
tools/check_doc_links.sh
tools/sync_copilot_agents.py
tests/test_sync_copilot_agents.py
tests/harnais_kit.py
tests/test_harnais_kit.py
tests/test_update_kit.py
tools/update_kit.sh
specs/features/_template.md
specs/modele.md
specs/modele_iteration.md
GUIDE.md
"

# Chemins récupérés UNIQUEMENT s'ils existent déjà dans le projet.
# Le kit fournit les deux variantes de pipeline d'hygiène ; un projet n'en garde
# qu'une. Les rapatrier sans condition réinstallerait `.github/` dans un projet
# GitLab, et inversement — en ramenant un pipeline mort que personne ne regarde.
# Leur contenu, lui, n'est jamais personnalisé : ils se contentent d'appeler
# tools/, donc on peut les écraser sans risque quand ils sont là.
CHEMINS_SI_PRESENTS="
.github/workflows/hygiene-specs.yml
.gitlab/ci/hygiene.yml
control-center
"

# ⚠️ `control-center` est CONDITIONNEL, et non gelé, pour deux raisons.
#
# 1. C'est un composant OPTIONNEL. Le mettre dans les chemins gelés
#    installerait un serveur web et une vingtaine de fichiers dans tout projet
#    qui synchronise, qu'il en veuille ou non.
# 2. Il arriverait INERTE. Ses hooks vivent dans `.claude/settings.json`, qui est
#    personnalisé et que ce script ne touche jamais : le code atterrirait sans
#    son instrumentation, et le tableau de bord afficherait un journal vide pour
#    toujours. Un outil livré cassé est pire qu'un outil absent.
#
# Un projet l'installe donc UNE FOIS — `control-center/installer.py` du kit
# l'assiste — puis reçoit ensuite toutes les évolutions par ce script.
#
# Sa configuration (`control-center.toml`) et son journal (`var/`) ne risquent
# rien : ils sont absents de l'arbre du kit, et `git checkout` ne restaure que ce
# qu'il connaît.

# Compatibilité Copilot : on l'ajoute aux projets qui ont conservé .github/
# (GitHub, ou GitLab avec Copilot dans l'IDE), sans l'imposer aux autres.
CHEMINS_GITHUB="
.github/copilot-instructions.md
"

# ── SURCHARGE PAR PROJET ─────────────────────────────────────────────────────
# Un fichier `.kit-paths` à la racine du projet REMPLACE la liste des chemins
# gelés ci-dessus. Un chemin par ligne ; `#` commente ; les lignes vides sont
# ignorées.
#
# POURQUOI CETTE SOUPAPE. Tous les projets ne descendent pas du kit. Certains le
# précèdent, et ont spécialisé leurs agents pendant des mois : leur appliquer la
# liste gelée écraserait ce travail d'un coup, sans retour possible.
#
# Le cas réel qui l'a motivée : un projet firmware dont les agents avaient
# divergé de 50 à 88 % du kit — un agent métier propre au domaine, un
# test-engineer portant toute une doctrine de validation. La synchronisation
# aveugle les aurait remplacés par les versions génériques.
#
# ⚠️ DÉCLARER UN CHEMIN ICI, C'EST L'ADOPTER. Un chemin absent de `.kit-paths`
# n'est plus jamais mis à jour depuis le kit : le projet en devient
# propriétaire. C'est le but — mais c'est définitif tant que le fichier n'est pas
# modifié.
#
# La liste INCLUSIVE est délibérée, là où une liste d'exclusions serait
# fragile : si le kit ajoute demain un chemin gelé, un projet qui a forké n'en
# veut probablement pas, et une exclusion oubliée le lui imposerait en silence.
#
# Les chemins CONDITIONNELS (fichiers de CI, control-center) continuent de
# s'appliquer : ils ne sont récupérés que s'ils existent déjà dans le projet.
#
# ⚠️ PENSER À Y METTRE `tools/update_kit.sh` LUI-MÊME. Omis, le script cesse de
# se mettre à jour et se fossilise à la version du jour de son installation —
# les corrections apportées ici n'atteindraient jamais le projet.
#
# ── GRAMMAIRE DE .kit-paths (feature-012) ───────────────────────────────────
# Un chemin par ligne, lue ligne à ligne (jamais par découpage de mots du
# shell, jamais par un pipeline `sed|grep`). Pour chaque ligne, dans l'ordre :
#   1. un `\r` TERMINAL est retiré — un `.kit-paths` enregistré en CRLF
#      (un éditeur Windows suffit) fonctionne donc comme en LF ;
#   2. tout ce qui suit un `#` est un commentaire, retiré ;
#   3. les espaces/tabulations de tête et de queue sont coupées ;
#   4. une ligne devenue vide (blanche ou entièrement commentée) est ignorée.
# Ce qui reste sur la ligne, tel quel, est le chemin déclaré — une espace
# INTÉRIEURE (`dossier avec espace/fichier.txt`) en fait désormais partie,
# au lieu d'être découpée en plusieurs chemins par l'ancien parsing.
#
# Conséquence assumée de ce trim explicite : un chemin ne peut plus commencer
# ni finir par une espace, ni contenir un `#` ou un retour à la ligne. C'est
# le prix des espaces intérieures — un chemin réel ne commence ni ne finit
# normalement par une espace.
#
# Diagnostics associés, tous non destructifs :
#   - un chemin déclaré mais introuvable côté kit est nommé sur stderr, sans
#     bloquer la synchronisation des autres chemins déclarés ;
#   - un `.kit-paths` vide ou entièrement commenté est signalé explicitement
#     (avant, le script accusait à tort le distant « kit ») ;
#   - si aucun chemin déclaré n'existe côté kit, le message le dit
#     nommément, distinct du message qui soupçonne un mauvais distant.
RACINE_PROJET="$(git rev-parse --show-toplevel 2>/dev/null || echo .)"
KIT_PATHS_ACTIF=0
if [ -f "$RACINE_PROJET/.kit-paths" ]; then
  declares=()
  while IFS= read -r ligne || [ -n "$ligne" ]; do
    ligne="${ligne%$'\r'}"
    ligne="${ligne%%#*}"
    ligne="${ligne#"${ligne%%[![:blank:]]*}"}"
    ligne="${ligne%"${ligne##*[![:blank:]]}"}"
    [ -z "$ligne" ] && continue
    declares+=("$ligne")
  done <"$RACINE_PROJET/.kit-paths"
  KIT_PATHS_ACTIF=1
  # ⚠️ Expansion gardée : sous `set -u` en bash < 4.4 (macOS, bash 3.2),
  # `"${declares[@]}"` sur un tableau VIDE lève « unbound variable ». Le
  # repli `${declares[@]+"${declares[@]}"}` n'expanse rien si le tableau est
  # vide, sans jamais échouer.
  CHEMINS="$(printf '%s\n' "${declares[@]+"${declares[@]}"}")"
  # ⚠️ `.kit-paths` gouverne TOUT, conditionnels compris. Sans cela, les chemins
  # conditionnels lui échappaient et s'appliquaient quand même.
  #
  # Le défaut a été trouvé au premier essai réel : un projet avait déclaré ne
  # prendre que `control-center`, et la prévisualisation annonçait le
  # remplacement de son fichier de CI — qui portait un contrôle de sécurité
  # absent du kit. Un projet qui déclare ce qu'il prend ne s'attend pas à
  # recevoir autre chose.
  CHEMINS_SI_PRESENTS=""
  CHEMINS_GITHUB=""
  echo "ℹ️  .kit-paths trouvé — il définit SEUL ce que ce projet prend du kit."
fi

SIMULATION=0
# La seule soupape humaine de ce script est ce test d'argument : une faute de
# frappe ne doit JAMAIS retomber sur la synchronisation réelle. Tout ce qui
# n'est ni absent ni exactement `--dry-run` est un argument inconnu, rejeté
# avec un message d'usage et une sortie non nulle.
if [ "$#" -gt 1 ]; then
  echo "❌ Trop d'arguments." >&2
  echo "   Usage : $0 [--dry-run]" >&2
  exit 1
fi
case "${1:-}" in
  "")
    ;;
  --dry-run)
    SIMULATION=1
    ;;
  *)
    echo "❌ Argument inconnu : $1" >&2
    echo "   Usage : $0 [--dry-run]" >&2
    exit 1
    ;;
esac

# ⚠️ `cd "$(...)" || { ... }` ne suffit PAS : quand la substitution est vide,
# `cd ""` réussit silencieusement en bash (aucun changement de répertoire,
# code 0) — le `||` ne se déclenche alors JAMAIS, et ce message n'était donc
# jamais affiché hors d'un dépôt (le script retombait sur la garde suivante,
# « distant absent », pour la mauvaise raison). Constaté à l'exécution par
# feature-006. On capture donc la racine d'abord, on vérifie qu'elle est non
# vide, PUIS on `cd`.
racine_du_projet="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$racine_du_projet" ] || ! cd "$racine_du_projet"; then
  echo "❌ Ce script doit tourner dans un dépôt git." >&2
  exit 1
fi

if ! git remote get-url "$DISTANT" >/dev/null 2>&1; then
  echo "❌ Aucun distant nommé « $DISTANT »." >&2
  echo "   Déclare-le une fois pour toutes :" >&2
  echo "     git remote add $DISTANT https://github.com/<compte>/agent-kit.git" >&2
  exit 1
fi

# Arbre propre EXIGÉ : ce script écrase des fichiers suivis. Sans cette garde, une
# modification en cours sur un agent disparaîtrait sans trace ni possibilité de
# comparaison. C'est à l'humain de décider quoi faire de son travail en cours.
# ⚠️ La garde ne s'applique PAS en simulation : `--dry-run` n'écrit rien, et
# refuser de PRÉVISUALISER sur un arbre sale est exactement l'inverse de ce qu'on
# veut — c'est précisément quand on a du travail en cours qu'on aimerait savoir
# ce qu'une synchronisation ferait, avant de décider quoi en faire.
#
# Constaté en installant le script dans un projet : un seul fichier modifié,
# appartenant à l'utilisateur, empêchait toute prévisualisation.
if [ "$SIMULATION" -eq 0 ] && [ -n "$(git status --porcelain)" ]; then
  echo "❌ Arbre de travail sale — ce script écrase des fichiers suivis." >&2
  echo "   Committe ou remise tes modifications d'abord :" >&2
  git status --short >&2
  echo "" >&2
  echo "   (./tools/update_kit.sh --dry-run fonctionne, lui, sur un arbre sale)" >&2
  exit 1
fi

echo "→ Récupération de $DISTANT/$BRANCHE…"
git fetch "$DISTANT" "$BRANCHE" --quiet || {
  echo "❌ Échec du fetch. Le dépôt du kit est-il joignable depuis ce réseau ?" >&2
  exit 1
}

# Ne garder que les chemins réellement présents côté kit. Lecture ligne à
# ligne (jamais `for chemin in $CHEMINS` : le word-splitting par défaut
# découpait un chemin contenant une espace). `presents` est un tableau
# indexé — voir le garde-fou bash 3.2 plus bas, avant chaque expansion.
presents=()
while IFS= read -r chemin; do
  [ -z "$chemin" ] && continue
  if git cat-file -e "$DISTANT/$BRANCHE:$chemin" 2>/dev/null; then
    presents+=("$chemin")
  elif [ "$KIT_PATHS_ACTIF" -eq 1 ]; then
    # Nommé seulement quand `.kit-paths` gouverne : sous la liste gelée par
    # défaut, un chemin absent du kit est une situation normale (un projet
    # peut ne pas avoir encore reçu tel fichier récent) — le nommer là
    # produirait un avertissement à chaque synchronisation, pour rien.
    echo "⚠️  Déclaré dans .kit-paths mais absent de $DISTANT/$BRANCHE : $chemin" >&2
  fi
done <<<"$CHEMINS"

# Conditionnels : présents côté kit ET déjà présents dans le projet.
while IFS= read -r chemin; do
  [ -z "$chemin" ] && continue
  if [ -e "$chemin" ] && git cat-file -e "$DISTANT/$BRANCHE:$chemin" 2>/dev/null; then
    presents+=("$chemin")
  fi
done <<<"$CHEMINS_SI_PRESENTS"

if [ -d ".github" ]; then
  while IFS= read -r chemin; do
    [ -z "$chemin" ] && continue
    if git cat-file -e "$DISTANT/$BRANCHE:$chemin" 2>/dev/null; then
      presents+=("$chemin")
    fi
  done <<<"$CHEMINS_GITHUB"
fi

# Dédoublonnage : un même chemin peut apparaître deux fois dans `presents` —
# typiquement un `.kit-paths` qui le déclare deux fois par erreur (garantie 17).
# `git ls-tree`/`git checkout` tolèrent un pathspec dupliqué sans broncher (ni
# erreur, ni doublon en sortie — vérifié par exécution), MAIS la boucle des
# ORPHELINS plus bas itère directement sur `presents`, PAS sur une sortie déjà
# dédupliquée par git : sans ce bloc, un dossier déclaré deux fois y relance
# deux fois la même comparaison `comm`, et le même chemin orphelin apparaît en
# double dans le récapitulatif final — confirmé par exécution (dossier commun
# déclaré deux fois, contenant un fichier absent du kit : la ligne
# `ORPHELIN` sort deux fois sans ce bloc, une seule fois avec). Ce n'est donc
# pas du code mort : c'est la seule protection contre cette duplication-là.
# ⚠️ Gardé par `${#presents[@]}` (sûr sous set -u, même vide) : expanser
# `"${presents[@]}"` alors que le tableau est VIDE lève « unbound variable »
# sous bash < 4.4 (macOS, bash 3.2) — cible déclarée du kit, non reproductible
# ici (bash local 5.2).
if [ "${#presents[@]}" -gt 0 ]; then
  presents_tries=()
  while IFS= read -r chemin; do
    presents_tries+=("$chemin")
  done < <(printf '%s\n' "${presents[@]}" | sort -u)
  presents=("${presents_tries[@]}")
fi

if [ "${#presents[@]}" -eq 0 ]; then
  if [ "$KIT_PATHS_ACTIF" -eq 1 ]; then
    if [ "${#declares[@]}" -eq 0 ]; then
      echo "❌ .kit-paths ne déclare aucun chemin (fichier vide ou entièrement commenté)." >&2
    else
      echo "❌ Aucun chemin déclaré dans .kit-paths n'existe côté kit (${#declares[@]} déclarés, 0 trouvés)." >&2
    fi
  else
    echo "❌ Aucun des chemins gelés n'existe dans $DISTANT/$BRANCHE." >&2
    echo "   Le distant « $DISTANT » pointe-t-il bien sur le kit ?" >&2
  fi
  exit 1
fi

# L'aperçu ne montre QUE ce qui sera réellement écrit, c'est-à-dire les fichiers
# présents DANS LE KIT. Un `git diff` sur les chemins entiers listait aussi les
# fichiers propres au projet — la configuration du centre de contrôle y
# apparaissait comme sur le point d'être modifiée, alors que `git checkout` ne
# peut pas la toucher : elle n'existe pas dans l'arbre du kit.
#
# Un aperçu auquel on ne peut pas se fier ne sert à rien : c'est sur lui qu'on
# décide de lancer la synchronisation ou non.
#
# ⚠️ `-c core.quotepath=off` est OBLIGATOIRE ici. Par défaut (`core.quotepath`
# actif), git cite les octets non-ASCII : un fichier `révision.md` sort sous la
# forme littérale `"r\303\251vision.md"`, guillemets et échappement octal
# compris. Le `[ ! -e "$f" ]` de la classification plus bas cherche alors un
# fichier qui n'existe pas TEL QUEL sur le disque, le classe « à créer », et
# `git checkout` l'écrase — silencieusement, bit compris pour un fichier gelé
# divergent. C'est un kit francophone : un accent suffisait à contourner
# TOUTES les gardes de bug-001 et bug-003. `-c core.quotepath=off` restitue le
# nom en octets bruts, un par ligne — la boucle `while IFS= read -r … <<<` n'a
# PAS besoin de changer : les noms restent séparés par des retours à la ligne,
# aucun octet NUL n'entre en jeu. (`git ls-tree -z` aurait aussi désactivé la
# citation, mais aurait forcé une lecture délimitée par NUL — inutilisable ici
# puisque bash ne peut pas conserver un octet NUL dans une variable de
# substitution de commande : le nom serait tronqué en silence, un défaut pire
# que celui qu'on corrige.)
#
# ⚠️ `"${presents[@]}"` non gardé ICI est sûr : la garde `[ "${#presents[@]}"
# -eq 0 ]` plus haut a déjà fait sortir le script si le tableau était vide —
# à ce point de l'exécution, `presents` contient au moins un élément.
fichiers_du_kit="$(git -c core.quotepath=off ls-tree -r --name-only "$DISTANT/$BRANCHE" -- "${presents[@]}" 2>/dev/null)"

# ── CLASSIFICATION DES FICHIERS GELÉS ───────────────────────────────────────
# Le récapitulatif décrit ce que `git checkout` va RÉELLEMENT faire, pas un
# diff entre deux arbres : un fichier absent du projet n'est pas « supprimé »,
# il sera CRÉÉ. Quatre issues, sans dépendance entre les tests qui les
# tranchent :
#   1. absent du projet                                  → à créer
#   2. présent, NON SUIVI par git, hash != celui du kit   → non suivi, la
#      synchro RÉELLE REFUSERA de l'écraser (voir garde plus bas)
#   3. présent, NON SUIVI par git, hash == celui du kit    → non suivi mais
#      sans risque : sera indexé, rien à perdre
#   4. présent et suivi, hash != celui du kit → à mettre à jour
#      présent et suivi, hash == celui du kit → identique (compté, non listé)
#
# Cinquième issue (bug-003) : présent et SUIVI, mais gelé par un bit
# `skip-worktree` ou `assume-unchanged`. `git status --porcelain` ne voit rien
# — c'est tout l'objet de ces bits — donc la divergence ne peut être détectée
# qu'en comparant le hash local à `HEAD:$f`, PAR FICHIER, jamais par un état
# global de l'arbre. C'est délibéré : un état global (`git status --porcelain`
# propre) serait vrai en réel et faux en `--dry-run` sur un arbre par ailleurs
# sale, et le même fichier changerait alors de catégorie selon le mode
# d'exécution — l'aperçu divergerait de ce que fait réellement le script, ce
# qu'ADR-0011 interdit. Le test se glisse dans la branche « suivi » :
#   a. hash_local == hash_kit → identique (aucun risque, même bit posé)
#   b. sinon, bit posé (`S`, ou TOUTE lettre minuscule — c'est la règle de
#      `git ls-files -v` pour assume-unchanged, pas seulement `h` : `m`, `r`,
#      `c` sont aussi des états assume-unchanged, dans d'autres situations)
#      ET hash_local != HEAD:$f → geles_perte, traité comme non_suivis_perte
#   c. sinon, bit posé mais hash_local == HEAD:$f (rien à perdre) → à mettre
#      à jour, MAIS `git checkout` effacera le bit sans un mot : signalé
#      séparément dans le récapitulatif (a_maj_bit_efface), jamais bloquant
#   d. sinon (pas de bit) → à mettre à jour (inchangé)
#
# Sixième issue (bug-006) : un ANCÊTRE de `$f` — jamais `$f` lui-même — est un
# fichier régulier là où le kit attend un répertoire. Testé AVANT l'issue 1
# (absent du projet), dans la boucle plus bas, sur les préfixes de `$f` en
# bash pur. Non récupérable (obstacle non suivi, ou suivi mais divergent de
# HEAD) → `obstacles_type`, jamais « à créer » ; récupérable (suivi et
# identique à HEAD) → comportement d'aujourd'hui conservé, issue 1 inchangée.
#
# La divergence de hash pour un non-suivi est calculée ICI, à la
# classification, et nulle part ailleurs : c'est la même valeur qui alimente
# le récapitulatif et la garde d'écrasement plus bas. Deux calculs séparés
# avaient permis à l'un des deux de désigner « sera écrasé » un fichier que
# l'autre, quelques lignes plus loin, refusait finalement de toucher — le
# récapitulatif annonçait alors une opération que l'exécution démentait.
#
# `while IFS= read -r … <<<`, jamais `… | while` : sous `set -uo pipefail`, un
# pipe ouvre un sous-shell — les listes construites dans la boucle seraient
# perdues en sortant du pipe, en silence. Ni `declare -A`, ni `mapfile` : bash
# 3.2 (macOS) n'a ni l'un ni l'autre ; les listes restent des chaînes
# multi-lignes, comme `presents` plus haut.
#
# ⚠️ Un écart qui ne porte QUE sur le bit exécutable est classé « identique » :
# `git hash-object` ne hash que le contenu, jamais le mode du fichier. Un
# fichier gelé dont seul le mode diffère reste donc « identique » lui aussi —
# cohérent avec ce qui précède, à ne pas corriger.
#
# ⚠️ `git hash-object` applique les filtres `clean` déclarés par
# `.gitattributes`, `git checkout` applique les filtres `smudge` symétriques.
# Un `core.autocrlf` agressif peut donc faire apparaître un « à mettre à
# jour » sans aucun écart sémantique une fois les filtres appliqués.
a_creer=""
non_suivis_perte=""
non_suivis_ok=""
a_maj=""
a_maj_bit_efface=""
geles_perte=""
obstacles_type=""
identiques=0

while IFS= read -r f; do
  [ -z "$f" ] && continue

  # ── DÉTECTION D'OBSTACLE DE TYPE (bug-006) ────────────────────────────────
  # Un chemin gelé que le kit place SOUS un répertoire (ex.
  # `.claude/skills/db-migrations/SKILL.md`) peut être inatteignable parce
  # qu'un de ses ANCÊTRES — jamais `$f` lui-même, la feuille — est ici un
  # FICHIER RÉGULIER : `[ ! -e "$f" ]` ci-dessous le classerait alors « à
  # créer », et `git checkout` supprimerait l'obstacle pour créer le
  # répertoire. Remontée pure bash des préfixes de `$f`, sans aucun appel git :
  # aucune primitive neuve n'est nécessaire hors de la branche « obstacle
  # trouvé » plus bas.
  #
  # ⚠️ Ancêtres SEULEMENT. Le cas inverse — un répertoire occupant la place
  # d'un FICHIER gelé — est déjà classé `non_suivis_perte` plus bas (`git
  # ls-files`/`git hash-object` échouent sur un répertoire) : l'inclure ici
  # ferait parler deux gardes sur la même exécution.
  #
  # ⚠️ TOUS les composants sont parcourus, pas seulement les racines de
  # `presents` : un obstacle PROFOND (un fichier ignoré à
  # `.claude/agents/sous`, alors que le kit y place un répertoire contenant
  # `profil.md`) est détruit par le même mécanisme, et un contrôle limité aux
  # racines déclarées le manquerait.
  obstacle=""
  ancetre=""
  resto="$f"
  while [[ "$resto" == */* ]]; do
    compo="${resto%%/*}"
    resto="${resto#*/}"
    if [ -z "$ancetre" ]; then
      ancetre="$compo"
    else
      ancetre="$ancetre/$compo"
    fi
    if [ -f "$ancetre" ]; then
      obstacle="$ancetre"
      break
    fi
  done
  if [ -n "$obstacle" ]; then
    # La récupérabilité — et elle seule — décide de bloquer. Mêmes primitives
    # que la cinquième issue (`geles_perte`) plus bas : un obstacle SUIVI et
    # IDENTIQUE à HEAD ne perd rien, `git checkout` peut le traiter comme
    # aujourd'hui (comportement conservé, aucune régression du cas « suivi et
    # propre »). Un obstacle non suivi (ignoré ou non) ou suivi mais divergent
    # de HEAD n'est récupérable par rien après coup : bloquant.
    recuperable=0
    if git ls-files --error-unmatch -- "$obstacle" >/dev/null 2>&1; then
      hash_obstacle_local="$(git hash-object -- "$obstacle" 2>/dev/null)"
      hash_obstacle_head="$(git rev-parse "HEAD:$obstacle" 2>/dev/null)"
      # Cas limite délibéré, même convention que `geles_perte` : un obstacle
      # INDEXÉ mais absent de HEAD (ajouté, jamais committé) fait échouer
      # `rev-parse`, qui rend une chaîne vide — différente du hash local, donc
      # non récupérable. Conservateur : on ne sait rien de ce contenu.
      [ "$hash_obstacle_local" = "$hash_obstacle_head" ] && recuperable=1
    fi
    if [ "$recuperable" -ne 1 ]; then
      # Accumulé tel quel, dédoublonné plus tard (récapitulatif et garde) par
      # `sort -u`, même convention que le dédoublonnage de `presents` plus
      # haut : N fichiers du kit sous le même obstacle produisent N lignes
      # identiques ici, une seule à l'affichage.
      obstacles_type="$obstacles_type$obstacle
"
      # Cas limite documenté, pas un défaut : un obstacle SUIVI mais MODIFIÉ
      # (contenu local ≠ HEAD ≠ non suivi) est déjà arrêté PLUS TÔT en mode
      # réel par la garde d'arbre de travail sale (`git status --porcelain`
      # le voit). En `--dry-run`, cette garde-là ne s'applique pas : le
      # marqueur neuf peut alors apparaître seul au récapitulatif — ce n'est
      # pas une rupture de parité avec le réel, puisqu'en réel aucun
      # récapitulatif n'est produit dans ce cas (le script sort avant).
      continue
    fi
  fi

  if [ ! -e "$f" ]; then
    a_creer="$a_creer$f
"
    continue
  fi
  if ! git ls-files --error-unmatch -- "$f" >/dev/null 2>&1; then
    hash_local="$(git hash-object -- "$f" 2>/dev/null)"
    hash_kit="$(git rev-parse "$DISTANT/$BRANCHE:$f" 2>/dev/null)"
    if [ "$hash_local" = "$hash_kit" ]; then
      non_suivis_ok="$non_suivis_ok$f
"
    else
      non_suivis_perte="$non_suivis_perte$f
"
    fi
    continue
  fi
  hash_local="$(git hash-object -- "$f" 2>/dev/null)"
  hash_kit="$(git rev-parse "$DISTANT/$BRANCHE:$f" 2>/dev/null)"
  if [ "$hash_local" = "$hash_kit" ]; then
    identiques=$((identiques + 1))
    continue
  fi
  # Cinquième issue : fichier suivi mais gelé (skip-worktree/assume-unchanged),
  # dont le contenu local n'a jamais été committé. `head -n1` en substitution
  # de commande (pas dans un pipe de boucle) : `pipefail` ne s'y applique pas
  # au sens d'une perte de données ici, `ls-files -v` ne peut pas échouer sur
  # un chemin déjà confirmé suivi juste au-dessus.
  etat="$(git ls-files -v -- "$f" 2>/dev/null | head -n1 | cut -c1)"
  # ⚠️ La règle est « S, ou TOUTE lettre minuscule », pas seulement `h` :
  # `git ls-files -v` rend une lettre minuscule pour assume-unchanged quel que
  # soit l'état de base (`h`, mais aussi `m`, `r`, `c`…). Tester deux lettres
  # précises en aurait laissé passer d'autres, à coût de test identique.
  gele=0
  case "$etat" in
    S) gele=1 ;;
    # ⚠️ `[[:lower:]]` et NON `[a-z]` : sous une locale non-C, les plages de
    # bash suivent la collation et peuvent happer des majuscules (`H`, `C`…),
    # qui signifient tout autre chose ici. La classe POSIX encode la règle —
    # « toute minuscule = assume-unchanged » — là où la plage encode un
    # intervalle de caractères qui dépend de l'environnement. Non testable
    # dans ce conteneur : seule la locale C y est installée.
    [[:lower:]]) gele=1 ;;
  esac
  if [ "$gele" -eq 1 ]; then
    # Cas limite délibéré : si `$f` est indexé mais absent de HEAD (ajouté,
    # jamais committé, bit posé quand même), `git rev-parse HEAD:$f` échoue et
    # renvoie une chaîne vide → considéré divergent → bloqué. C'est
    # conservateur et voulu, pas un effet de bord : on ne sait rien de ce
    # contenu, donc on ne l'écrase pas.
    hash_head="$(git rev-parse "HEAD:$f" 2>/dev/null)"
    if [ "$hash_local" != "$hash_head" ]; then
      geles_perte="$geles_perte$f
"
      continue
    fi
    # Rien à perdre (contenu local == HEAD), mais `git checkout` efface le bit
    # gelé sans un mot : le marqueur « ne touche pas à ce fichier » disparaît
    # en silence. Non bloquant — juste signalé dans le récapitulatif.
    a_maj_bit_efface="$a_maj_bit_efface$f
"
  fi
  a_maj="$a_maj$f
"
done <<<"$fichiers_du_kit"

# Court-circuit « déjà aligné » : rien à créer, rien à mettre à jour, aucun
# non-suivi (perdant ou non) à traiter, aucun gelé perdant non plus, ni aucun
# obstacle de type (bug-006) — sans ce dernier test, un projet dont le seul
# écart est un obstacle sortirait ici en « rien à récupérer » et la garde plus
# bas ne serait jamais atteinte. Même piège déjà rencontré sur `geles_perte`.
if [ -z "$a_creer" ] && [ -z "$a_maj" ] && [ -z "$non_suivis_perte" ] && [ -z "$non_suivis_ok" ] && [ -z "$geles_perte" ] && [ -z "$obstacles_type" ]; then
  echo "   ✅ Rien à récupérer : le projet est déjà aligné sur le kit."
  exit 0
fi

# ── RÉCAPITULATIF — SITE D'APPEL UNIQUE ─────────────────────────────────────
# Appelé une seule fois, ICI, AVANT le branchement --dry-run / réel : les deux
# chemins ne peuvent pas diverger puisqu'il n'y en a qu'un qui produit ce
# texte. Seul le pied de page, après ce bloc, distingue simulation et réel.
echo "→ Ce que la synchronisation va faire :"
echo ""
if [ -n "$non_suivis_perte" ]; then
  n="$(echo "$non_suivis_perte" | grep -c .)"
  echo "  ⚠️  PRÉSENTS ICI, NON SUIVIS PAR GIT, CONTENU DIVERGENT — LA SYNCHRONISATION REFUSERA DE LES ÉCRASER ($n)"
  echo "$non_suivis_perte" | grep . | sed 's/^/       /'
  echo "       (contenu actuel non récupérable après coup : aucun \`git checkout\` ne le rendra ;"
  echo "        committe le fichier, déplace-le, ou exclus-le via .kit-paths pour débloquer)"
  echo ""
fi
if [ -n "$geles_perte" ]; then
  n="$(echo "$geles_perte" | grep -c .)"
  echo "  ⚠️  SUIVIS MAIS GELÉS PAR UN BIT GIT (skip-worktree / assume-unchanged),"
  echo "      CONTENU LOCAL JAMAIS COMMITTÉ — LA SYNCHRONISATION REFUSERA DE LES ÉCRASER ($n)"
  echo "$geles_perte" | grep . | sed 's/^/       /'
  echo "       (git checkout écraserait le contenu local ET effacerait le bit posé :"
  echo "        aucune trace de ton intention ne survivrait après coup)"
  echo ""
fi
if [ -n "$obstacles_type" ]; then
  # Dédoublonné ici, au premier affichage (récapitulatif) : N fichiers du kit
  # sous le même obstacle ne produisent qu'UNE seule ligne.
  obstacles_uniques="$(echo "$obstacles_type" | grep . | sort -u)"
  n="$(echo "$obstacles_uniques" | grep -c .)"
  echo "  ⚠️  CHEMINS GELÉS OCCUPÉS PAR UN FICHIER, LÀ OÙ LE KIT ATTEND UN RÉPERTOIRE ($n)"
  echo "$obstacles_uniques" | sed 's/^/       /;s/$/  (fichier ici, répertoire dans le kit)/'
  echo "       (contenu non récupérable : aucun \`git checkout\` ne le restaurera après coup)"
  echo ""
fi
if [ -n "$non_suivis_ok" ]; then
  n="$(echo "$non_suivis_ok" | grep -c .)"
  echo "  PRÉSENTS ICI, NON SUIVIS PAR GIT, MAIS DÉJÀ IDENTIQUES AU KIT ($n) — seront indexés, rien à perdre"
  echo "$non_suivis_ok" | grep . | sed 's/^/       /'
  echo ""
fi
if [ -n "$a_creer" ]; then
  n="$(echo "$a_creer" | grep -c .)"
  echo "  À CRÉER ($n)"
  echo "$a_creer" | grep . | sed 's/^/       /'
  echo ""
fi
if [ -n "$a_maj" ]; then
  n="$(echo "$a_maj" | grep -c .)"
  echo "  À METTRE À JOUR ($n)"
  echo "$a_maj" | grep . | sed 's/^/       /'
  echo ""
fi
if [ -n "$a_maj_bit_efface" ]; then
  n="$(echo "$a_maj_bit_efface" | grep -c .)"
  echo "  ⚠️  PARMI EUX, LE BIT GELÉ (skip-worktree / assume-unchanged) SERA EFFACÉ SANS AVERTISSEMENT ($n)"
  echo "$a_maj_bit_efface" | grep . | sed 's/^/       /'
  echo "       (rien à perdre : contenu local identique à HEAD ; mais le marqueur"
  echo "        \"ne touche pas à ce fichier\" disparaît — repose-le après coup si besoin)"
  echo ""
fi
if [ "$identiques" -gt 0 ]; then
  echo "  IDENTIQUES : $identiques fichiers déjà alignés (non listés)"
  echo ""
fi

if [ "$SIMULATION" -eq 1 ]; then
  echo "ℹ️  --dry-run : aucune modification appliquée."
  echo "   Relance sans --dry-run pour récupérer ces fichiers."
  exit 0
fi

# ── GARDE D'ÉCRASEMENT ───────────────────────────────────────────────────────
# Un fichier non suivi dont le contenu DIFFÈRE de celui du kit (non_suivis_perte,
# déjà établi à la classification ci-dessus) serait écrasé par `git checkout`
# sans AUCUN retour arrière possible : n'ayant jamais été suivi, il n'a jamais
# été sauvegardé nulle part. La garde d'arbre de travail propre plus haut ne le
# voit pas : `git status --porcelain` est aveugle aux fichiers ignorés — c'est
# le trou qu'elle laissait passer.
#
# ⚠️ Cette garde doit rester APRÈS la sortie --dry-run, jamais avant : la
# déplacer plus tôt bloquerait aussi la SIMULATION, régression exacte du
# défaut que feature-005 a corrigé (refuser de PRÉVISUALISER sur un arbre
# sale).
#
# ⚠️ Un fichier non suivi dont le hash est identique à celui du kit
# (non_suivis_ok) ne déclenche PAS cette garde : rien ne serait perdu, le
# bloquer serait gratuit — c'est le cas d'un projet qui a copié le kit à la
# main sans committer.
#
# ⚠️ `tools/update_kit.sh` se met à jour lui-même. S'il devient non suivi dans
# un projet et diverge du kit, cette garde bloque — y compris la synchro qui
# aurait livré le correctif à cette garde. Le blocage n'est pas permanent :
# `.kit-paths` (voir en tête de ce script) permet de l'exclure du périmètre
# géré, ou de le committer pour lever le blocage.
#
# Même piège pour la garde `geles_perte` juste en dessous : si ce script porte
# un bit skip-worktree/assume-unchanged localement avec un contenu jamais
# committé, la synchro qui livrerait son propre correctif se bloque elle
# aussi. Mais ici les issues sont PRATICABLES sans rien perdre : le fichier
# étant suivi (contrairement au cas non-suivi ci-dessus), `git update-index
# --no-skip-worktree -- tools/update_kit.sh` puis un `git checkout` manuel
# lèvent le blocage sans effacer de travail irremplaçable.
if [ -n "$non_suivis_perte" ]; then
  echo "❌ Des fichiers non suivis par git seraient écrasés SANS RETOUR POSSIBLE :" >&2
  echo "$non_suivis_perte" | grep . | sed 's/^/     /' >&2
  echo "" >&2
  echo "   Trois issues, à toi de choisir :" >&2
  echo "     1. committer le fichier (git add -- <chemin> && git commit)" >&2
  echo "     2. le déplacer hors du chemin gelé" >&2
  echo "     3. l'exclure en déclarant .kit-paths (voir en tête de ce script)" >&2
  exit 1
fi

# ── GARDE D'ÉCRASEMENT (bit skip-worktree / assume-unchanged, bug-003) ──────
# Même contrat que la garde ci-dessus, pour le trou qu'elle ne couvre pas :
# un fichier SUIVI mais gelé, dont le contenu local n'a jamais été committé
# (geles_perte, déjà établi à la classification). `git checkout` l'écraserait
# ET effacerait le bit, sans laisser aucune trace de l'intention de
# l'utilisateur. Reste après la sortie --dry-run pour la même raison que la
# garde précédente : la remonter bloquerait aussi la simulation.
if [ -n "$geles_perte" ]; then
  echo "❌ MODIFICATION LOCALE INVISIBLE : des fichiers suivis mais gelés par un bit git" >&2
  echo "   (skip-worktree ou assume-unchanged) seraient écrasés par git checkout, qui" >&2
  echo "   efface aussi le bit — aucune trace de ton intention ne survivrait :" >&2
  echo "$geles_perte" | grep . | sed 's/^/     /' >&2
  echo "" >&2
  echo "   Trois issues, à toi de choisir :" >&2
  echo "     1. lever le bit d'abord — git update-index --no-skip-worktree -- <chemin>" >&2
  echo "        (ou --no-assume-unchanged, selon celui qui est posé) — PUIS committer" >&2
  echo "        (git add -- <chemin> && git commit) ou jeter le contenu local :" >&2
  echo "        \`git add\` seul n'indexe RIEN tant que le bit reste posé" >&2
  echo "     2. le déplacer hors du chemin gelé" >&2
  echo "     3. l'exclure en déclarant .kit-paths (voir en tête de ce script)" >&2
  exit 1
fi

# ── GARDE D'ÉCRASEMENT (obstacle de type, bug-006) ──────────────────────────
# Troisième garde de la même famille, pour le trou que les deux précédentes ne
# couvrent pas : un chemin gelé attendu comme RÉPERTOIRE par le kit est occupé
# ici par un FICHIER RÉGULIER non récupérable (obstacles_type, déjà établi à
# la classification ci-dessus). `git checkout` supprimerait ce fichier pour
# créer le répertoire — sans aucun retour arrière possible, son contenu
# n'étant nulle part dans git.
#
# ⚠️ Reste après la sortie --dry-run, même raison que les deux gardes
# ci-dessus : la remonter bloquerait aussi la SIMULATION — régression exacte
# du défaut 1 de feature-005 (refuser de PRÉVISUALISER sur un arbre qui en
# aurait besoin).
if [ -n "$obstacles_type" ]; then
  obstacles_uniques="$(echo "$obstacles_type" | grep . | sort -u)"
  echo "❌ TYPE INCOMPATIBLE : un chemin gelé est occupé par un objet d'un autre type," >&2
  echo "   dont le contenu n'est pas récupérable :" >&2
  echo "$obstacles_uniques" | sed 's/^/     /;s/$/  (fichier ici, répertoire dans le kit)/' >&2
  echo "   Trois issues : le déplacer / le committer / l'exclure via .kit-paths" >&2
  exit 1
fi

# ⚠️ Non gardé, comme au site `ls-tree` plus haut : `presents` est non vide à
# ce point, la garde de vacuité a déjà fait sortir le script sinon.
git checkout "$DISTANT/$BRANCHE" -- "${presents[@]}" || {
  echo "❌ Échec de la récupération." >&2
  exit 1
}

# `git checkout` n'EFFACE jamais : un fichier retiré du kit survit indéfiniment
# dans les projets, et personne ne s'en aperçoit. On le SIGNALE, sans jamais le
# supprimer — le script ne peut pas distinguer un fichier retiré du kit d'un
# ajout local délibéré, et effacer le second serait une perte silencieuse.
#
# ⚠️ Même exposition qu'à la classification : sans `-c core.quotepath=off`, un
# nom accentué sortirait cité (`"r\303\251vision.md"`) d'un côté ou de l'autre
# selon que git le voit ou non comme « spécial », et `comm -23` comparerait des
# représentations qui ne correspondent plus au même fichier.
orphelins=""
# ⚠️ Non gardé, même raison qu'aux deux sites ci-dessus : `presents` est
# garanti non vide à ce point de l'exécution.
for chemin in "${presents[@]}"; do
  # Seuls les répertoires sont concernés : un fichier listé nommément et absent
  # du kit n'aurait pas été retenu plus haut.
  [ -d "$chemin" ] || continue
  au_kit="$(git -c core.quotepath=off ls-tree -r --name-only "$DISTANT/$BRANCHE" -- "$chemin" 2>/dev/null | sort)"
  ici="$(git -c core.quotepath=off ls-files -- "$chemin" | sort)"
  manquants="$(comm -23 <(echo "$ici") <(echo "$au_kit"))"
  [ -n "$manquants" ] && orphelins="$orphelins$manquants
"
done

if [ -n "$(echo "$orphelins" | tr -d '[:space:]')" ]; then
  echo ""
  echo "ℹ️  Présents ici, absents du kit — CONSERVÉS, jamais supprimés :"
  echo "$orphelins" | grep . | sed 's/^/     /'
  echo "     (soit des ajouts propres à ce projet, soit des fichiers retirés du"
  echo "      kit depuis la dernière synchronisation — à toi de trancher)"
fi

# Les profils Copilot ne sont pas copiés depuis le kit : ils sont régénérés à
# partir des agents Claude réellement présents dans le projet. Ainsi, les agents
# métier propres au projet restent inclus et un profil Copilot manuel n'est
# jamais écrasé silencieusement par un répertoire venu du kit.
# ⚠️ La condition porte sur le SCRIPT, pas seulement sur `.github/`. Un projet
# peut avoir un `.github/` — pour sa CI — sans consommer la passerelle Copilot :
# c'est le cas dès qu'un `.kit-paths` exclut `tools/sync_copilot_agents.py`.
#
# Constaté au premier lancement dans un projet réel : la synchronisation copiait
# correctement ses fichiers, puis échouait en fin de course sur un script absent,
# laissant croire à un échec global alors que tout était écrit.
if [ -d ".github" ] && [ -f "tools/sync_copilot_agents.py" ]; then
  python3 tools/sync_copilot_agents.py --write || {
    echo "❌ Échec de la régénération des profils GitHub Copilot." >&2
    exit 1
  }
  git add .github/agents
fi

echo "✅ Fichiers gelés mis à jour et indexés."
echo ""
echo "À FAIRE MAINTENANT :"
echo "  1. Relire le diff — un agent peut avoir changé de comportement :"
echo "       git diff --cached"
echo "  2. Vérifier que les agents MÉTIER du projet n'ont pas été écrasés"
echo "     (ils ne sont pas dans le kit, donc ils ne le sont pas — mais vérifie)"
echo "  3. Relancer les contrôles :"
echo "       ./tools/check_specs.sh && ./tools/check_doc_links.sh"
if [ -d ".github/agents" ] && [ -f "tools/sync_copilot_agents.py" ]; then
  echo "       python3 tools/sync_copilot_agents.py --check"
fi
echo "  4. Committer en citant la version du kit récupérée :"
echo "       git log -1 --format='%h %s' $DISTANT/$BRANCHE"
echo ""
echo "NON RÉCUPÉRÉ, à regarder à la main si le CHANGELOG du kit le signale :"
echo "  .claude/commands/release.md   (personnalisé : build et artefacts du projet)"
echo "  .claude/settings.json         (personnalisé : commandes du projet)"
echo "  CLAUDE.md, skill dev-workflow (personnalisés par nature)"
