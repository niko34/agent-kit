# ADR-0006 — Le centre de contrôle n'a aucune dépendance d'exécution

## Statut

Accepté

## Date

2026-09-12

## Contexte

Le centre de contrôle (`control-center/`) est distribué comme partie du kit :
tout projet instancié depuis le template peut le recevoir tel quel
(`tools/update_kit.sh`, en chemin conditionnel — ADR-0010). Un projet qui
adopte le kit ne doit pas se
retrouver, pour ce seul module, à gérer un gestionnaire de paquets Python
(pip, poetry) ni un outillage frontend (npm, bundler) en plus de sa propre
chaîne de build.

## Décision

Le backend (`control-center/backend/*.py`, `control-center/hooks/*.py`) est
écrit en **bibliothèque standard Python uniquement** (`http.server`,
`json`, `os`, `threading`, `urllib.parse` — voir les imports de `server.py`).
Le frontend (`control-center/web/*`) est en **vanilla JS/HTML/CSS**, sans
framework ni bundler, cohérent avec le principe déjà posé dans les projets
issus du kit. Aucun fichier `requirements.txt` ni `package.json` n'accompagne
`control-center/`.

## Alternatives considérées

- **Un micro-framework Python (Flask, FastAPI) pour le routage HTTP et le
  SSE** : écarté — cela ajoute une dépendance à installer (et à maintenir en
  version) dans chaque projet qui adopte le kit, pour un service qui reste un
  serveur de lecture avec un nombre borné de routes.
- **Un framework frontend (React, Vue) pour l'interface** : écarté pour la
  même raison, et par cohérence avec le choix déjà fait pour le reste du kit
  (vanilla JS, pas de bundler).

## Conséquences

### Positives

- Un projet qui instancie le kit n'a **aucune chaîne d'installation
  supplémentaire à porter** pour le centre de contrôle : `python3
  control-center/backend/server.py` suffit, avec l'interpréteur système.
- Aucune dépendance externe à auditer pour les vulnérabilités, aucune version
  à faire coïncider avec le reste du projet.

### Négatives

- **Le routage HTTP et le flux SSE sont écrits à la main**
  (`ThreadingHTTPServer`, `BaseHTTPRequestHandler`, gestion manuelle des
  types MIME et du protocole SSE) — du code qu'un framework aurait fourni
  tout fait, avec son lot de cas limites à traiter soi-même (types de
  fichiers, encodage, fermeture de connexion) et à garder correct dans le
  temps.
- Toute évolution future (authentification, sessions, validation de schéma)
  devra elle aussi être écrite sans dépendance, ou remettre en cause cet ADR.
