---
name: dev-workflow
description: Commandes canoniques du projet (installation, dev, tests, lint, build, migrations BDD, déploiement/rollback). À charger avant de lancer des tests, un build, une migration ou un déploiement. À PERSONNALISER au démarrage du projet.
---

# Dev workflow — commandes canoniques

<!-- KIT DE DÉMARRAGE : remplacer chaque <…> par la commande réelle du projet,
     supprimer les lignes non applicables, puis supprimer ce commentaire. -->

## Commandes

```bash
<npm install / pip install -r requirements.txt>        # Installer les dépendances
<npm run dev / uvicorn app:app --reload>               # Lancer en développement (backend)
<npm run dev --workspace frontend>                     # Lancer en développement (frontend)
<npm test / pytest>                                    # Suite de tests complète
<npm run lint / ruff check .>                          # Lint
<npm run build>                                        # Build production
<npx knex migrate:latest / alembic upgrade head>       # Migrations BDD — appliquer
<npx knex migrate:rollback / alembic downgrade -1>     # Migrations BDD — annuler la dernière
```

> Toute migration suit la check-list de la skill **`db-migrations`** (réversibilité,
> sauvegarde, compatibilité N/N-1, backfill par lots).

## Déploiement / rollback

```bash
<commande de déploiement — ex. via CI, ou ssh + script>   # Déployer <environnement>
<commande de rollback — redéploiement version précédente> # Retour arrière
<commande de vérification post-déploiement — healthcheck> # Vérifier
```

- Noter ici QUI a le droit de déployer quoi (staging libre ? production sur accord ?)
- Un déploiement qui embarque une migration suit d'abord la skill `db-migrations`

## Règles

1. **Toujours lancer la suite de tests avant de conclure** un tour qui a modifié du code — « ça devrait marcher » n'est pas un résultat.
2. **Commandes longues** (build, suite complète, installation) : lancer en background quand c'est possible.
3. **Jamais de commande destructive** (DROP, reset de BDD, suppression de données, rollback en production) **sans accord explicite de l'utilisateur**.
