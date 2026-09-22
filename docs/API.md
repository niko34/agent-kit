# API REST — Contrat

<!-- KIT DE DÉMARRAGE : remplacer les <…> et l'exemple fictif « clients » par vos
     vraies ressources, puis supprimer ce commentaire. Ce fichier est la source de
     vérité du contrat REST : doc-writer le met à jour à CHAQUE changement d'endpoint. -->

> **Ce fichier documente l'API REST du projet qui adopte le kit** — versionnée
> `/api/v1/…`, avec l'enveloppe d'erreur ci-dessous. Les routes du
> **centre de contrôle** (`/api/etat`, `/api/lancer`, `/api/interrompre`,
> `/api/spec/brouillon`, `/api/spec/ecrire`, …) n'entrent pas ici : ce module
> fait partie du kit lui-même, pas de l'application qu'il aide à construire,
> il n'est pas versionné en `/api/v1`, et son contrat — y compris les codes
> d'erreur et les cas limites, mutation-testés — est tenu dans
> [`control-center/README.md`](../control-center/README.md), au fil de ses
> étapes (A à E, puis H à J à ce jour — F et G restent à faire). Aucune
> route de ce module n'a jamais figuré ici ;
> ce fichier garde son exemple fictif tant que le projet n'a pas sa propre
> ressource à documenter.

## Conventions

- **Base URL** : `/api/v1` — versionnement dans le chemin ; un changement cassant ⇒ `/api/v2`, jamais de modification silencieuse d'un contrat publié.
- **Format** : JSON (`Content-Type: application/json`) en requête et réponse.
- **Auth** : <mécanisme — ex. header `Authorization: Bearer <token>`>. Tout endpoint est protégé par défaut ; les exceptions publiques sont signalées `[public]` et justifiées.
- **Erreurs** — format uniforme sur toute l'API :

```json
{
  "error": {
    "code": "RESSOURCE_INTROUVABLE",
    "message": "Message lisible destiné à l'utilisateur.",
    "details": {}
  }
}
```

  Codes HTTP : `400` requête invalide, `401` non authentifié, `403` permission refusée, `404` introuvable, `409` conflit, `422` validation, `500` erreur serveur (jamais de stack trace dans la réponse).

- **Pagination** — paramètres `?page=N&per_page=M` (M borné par le serveur, défaut <20>, max <100>) ; réponse enveloppée :

```json
{
  "data": [],
  "meta": { "page": 1, "per_page": 20, "total": 134, "total_pages": 7 }
}
```

- **Dates** : ISO 8601 UTC (`2026-01-15T09:30:00Z`).

---

## Ressource : clients (exemple fictif — à remplacer)

### `GET /api/v1/clients`

Liste paginée des clients. Rôles : `admin`, `gestionnaire`.

Paramètres : `page`, `per_page`, `q` (recherche sur le nom, optionnel).

Réponse `200` :

```json
{
  "data": [
    { "id": 42, "nom": "Dupont SARL", "email": "contact@dupont.example", "cree_le": "2026-01-15T09:30:00Z" }
  ],
  "meta": { "page": 1, "per_page": 20, "total": 1, "total_pages": 1 }
}
```

### `POST /api/v1/clients`

Crée un client. Rôles : `admin`.

Corps :

```json
{ "nom": "Dupont SARL", "email": "contact@dupont.example" }
```

Réponse `201` : l'objet créé (même schéma que le GET). Erreurs : `422` si `nom` absent ou `email` invalide, `409` si l'email existe déjà.

---

## Ressource : <nom>

<!-- Dupliquer le bloc ci-dessus pour chaque ressource : endpoints, rôles requis,
     paramètres, exemple de requête/réponse, codes d'erreur spécifiques. -->
