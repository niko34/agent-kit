#!/usr/bin/env bash
# Lance la suite de tests de control-center/ sous un utilisateur NON-root
# (bug-018) : root lit un fichier que son mode interdit à tout autre
# utilisateur, ce qui a rendu la suite verte en local et rouge en CI (le seul
# exécutant non-root réel) pendant sept runs consécutifs sans qu'aucune
# alerte ne se déclenche. Ce script existe pour que l'écart puisse être
# vérifié DEPUIS LE POSTE, avant de pousser, et ne se reforme plus en silence.
#
# Usage :
#   sudo ./tools/lancer_suite_control_center_non_root.sh
#   UTILISATEUR_NON_ROOT=un-autre-compte sudo -E ./tools/lancer_suite_control_center_non_root.sh
#
# Doit être lancé avec les droits nécessaires pour `chown`/`runuser` (root ou
# sudo) : il travaille sur un CLONE JETABLE (`cp -a`, jamais `git clone` —
# PIEGES §1), jamais sur l'arbre de travail réel, et ne modifie aucun fichier
# du dépôt.
set -euo pipefail

UTILISATEUR_TEST="${UTILISATEUR_NON_ROOT:-nobody}"
RACINE_DEPOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -d "$RACINE_DEPOT/control-center" ]; then
  echo "ℹ️  control-center/ absent de ce dépôt — rien à lancer."
  exit 0
fi

CLONE="$(mktemp -d)"
nettoyer() {
  rm -rf "$CLONE"
}
trap nettoyer EXIT

# Clone jetable : control-center/ ET les trois chemins hors module que
# `redaction_spec.py` lit directement (PIEGES §1) — un clone incomplet
# produirait un symptôme (« template introuvable ») qui ressemble à un
# défaut du code, alors que c'est le clone qui est incomplet.
cp -a "$RACINE_DEPOT/control-center" "$CLONE/control-center"
mkdir -p "$CLONE/.claude" "$CLONE/specs/features"
[ -d "$RACINE_DEPOT/.claude/agents" ] && cp -a "$RACINE_DEPOT/.claude/agents" "$CLONE/.claude/agents"
[ -f "$RACINE_DEPOT/specs/features/_template.md" ] && cp -a "$RACINE_DEPOT/specs/features/_template.md" "$CLONE/specs/features/_template.md"
[ -f "$RACINE_DEPOT/specs/modele.md" ] && cp -a "$RACINE_DEPOT/specs/modele.md" "$CLONE/specs/modele.md"
# `doing/` est copié depuis feature-021 : la clause miroir du lot 6
# (`test_conformite_perimetre.js`) lit les specs absorbées pour vérifier que
# tout élément rangé dans un bucket y est NOMMÉ. Sans elles, la garde lève une
# `Error` au lieu d'échouer proprement, et ce clone rendait un fichier MUET —
# 35 comptes pour 36 fichiers, visible seulement au code de sortie.
[ -d "$RACINE_DEPOT/specs/features/doing" ] && cp -a "$RACINE_DEPOT/specs/features/doing" "$CLONE/specs/features/doing"

# Purge de tout .pyc avant de changer de propriétaire : un bytecode compilé
# en root et relu par un autre compte peut masquer un fichier source déjà
# corrigé (PIEGES §36).
find "$CLONE" -name '__pycache__' -exec rm -rf {} + 2>/dev/null || true

chown -R "$UTILISATEUR_TEST" "$CLONE"

# ⚠️ PAS de `chmod -R o+rX` ici. Le `chown` ci-dessus suffit : l'utilisateur de
# test devient PROPRIÉTAIRE du clone, donc ses bits propriétaire lui donnent
# déjà tout l'accès nécessaire (mesuré pendant la revue de bug-018). Un
# `o+rX` rendrait en plus lisible PAR TOUS une copie de
# `control-center/control-center.toml` — non versionné, et qui porte le chemin
# du fichier de jeton — ainsi que de `control-center/var/`, son journal
# d'événements. Élargir les droits d'un fichier de configuration pour faire
# passer une suite de tests est exactement le genre de geste que ce cycle
# existe pour rendre visible.

# `/tmp` (ou l'équivalent de `mktemp -d`) porte déjà le bit `o+x` par défaut
# (souvent 1777) : c'est ce qui distingue ce clone d'un répertoire de travail
# PRIVÉ, où il faudrait aussi poser `o+x` sur toute la chaîne des parents
# (PIEGES §43) — sans quoi l'utilisateur non-root ne pourrait pas non plus
# traverser jusqu'au clone, pour une raison différente mais tout aussi fausse.

mapfile -t fichiers < <(find "$CLONE/control-center" -type f -name 'test_*.py' | sort)
if [ "${#fichiers[@]}" -eq 0 ]; then
  echo "❌ control-center/ existe mais aucun fichier test_*.py n'a été découvert." >&2
  exit 1
fi

echo "Suite lancée sous l'utilisateur : $UTILISATEUR_TEST"
echo "Fichiers de test découverts (${#fichiers[@]}) :"
printf '  - %s\n' "${fichiers[@]}"
echo

echec_global=0
comptes=0
muets=()
for fichier in "${fichiers[@]}"; do
  echo "=== $fichier ==="
  # HOME=$CLONE : `runuser -u` ne fournit pas de répertoire personnel
  # utilisable (celui de `nobody` est `/nonexistent`) — sans un HOME
  # inscriptible, le harnais qui pilote un navigateur sans fenêtre
  # (`test_app_*_navigateur.py`) échoue pour une raison SANS RAPPORT avec
  # bug-018 (profil Chromium introuvable), un faux signal qu'il faut éviter
  # ici plutôt que le confondre avec le défaut recherché.
  sortie_fichier="$(mktemp)"
  if ! runuser -u "$UTILISATEUR_TEST" -- env HOME="$CLONE" PYTHONDONTWRITEBYTECODE=1 python3 "$fichier" 2>&1 | tee "$sortie_fichier"; then
    echec_global=1
  fi
  # ⚠️ `tee` masque le code de sortie de `runuser` : `pipefail` le restaure,
  # mais un script qui PLANTE (trace Python, `Error` JS non attrapée) sort en
  # échec SANS avoir rendu la ligne « N cas » de PIEGES §6. Un fichier muet
  # n'est pas un fichier vert — et sans ce comptage, la seule trace est le code
  # de sortie global, qui ne dit pas LEQUEL s'est tu.
  if ! grep -qE '^[0-9]+ cas, [0-9]+ echec' "$sortie_fichier"; then
    echo "❌ MUET : $fichier n'a rendu aucune ligne « N cas » — il a planté au lieu d'échouer." >&2
    muets+=("$fichier")
    echec_global=1
  else
    comptes=$((comptes + 1))
  fi
  rm -f "$sortie_fichier"
  echo
done

# Exécutés contre découverts (leçon de bug-022) : le compte des fichiers ayant
# rendu un verdict doit égaler le compte des fichiers lancés. Un écart signale
# un fichier muet, jamais un succès.
echo "Fichiers lancés : ${#fichiers[@]} — ayant rendu un verdict : $comptes"
if [ "$comptes" -ne "${#fichiers[@]}" ]; then
  echo "❌ $(( ${#fichiers[@]} - comptes )) fichier(s) MUET(S) : ${muets[*]}" >&2
  echec_global=1
fi

exit "$echec_global"
