# Architecture

<!-- KIT DE DÉMARRAGE : remplir les <…> à mesure que le projet prend forme.
     Ce fichier décrit l'ÉTAT COURANT (doc vivante) ; l'historique des décisions
     et leurs alternatives vivent dans docs/adr/. Supprimer ce commentaire. -->

## Vue d'ensemble

<Deux ou trois phrases : ce que fait l'application, pour qui, et le découpage macro.>

## Composants

| Composant | Rôle | Techno | Emplacement |
|---|---|---|---|
| Frontend | Portail web utilisateur | <React / Vue / vanilla> | `frontend/` |
| API backend | Logique métier, REST | <framework> | `backend/` |
| Base de données | Persistance | <PostgreSQL / …> | <hébergement> |
| Tâches de fond | <jobs, cron, files d'attente ou « aucune »> | <…> | <…> |

## Flux d'une requête

<Décrire le chemin type, ex. :>

1. Le navigateur appelle `GET /api/v1/<ressource>` avec le jeton d'auth
2. <Middleware auth : vérification du jeton, chargement de l'utilisateur et de ses rôles>
3. <Contrôleur / route : validation des entrées>
4. <Service métier : règles, accès BDD via requêtes paramétrées>
5. Réponse JSON (contrat : `docs/API.md`)

## Dépendances externes

| Service | Usage | Mode dégradé si indisponible |
|---|---|---|
| <API tierce / SMTP / stockage objet> | <pourquoi> | <comportement de repli> |

## Environnements

| Environnement | URL | BDD | Particularités |
|---|---|---|---|
| Développement | `http://localhost:<port>` | <locale> | <données de test, seed> |
| Staging | <URL> | <instance> | <…> |
| Production | <URL> | <instance> | <sauvegardes, monitoring> |

Configuration par variables d'environnement — liste de référence dans `.env.example` (jamais de secret committé).
