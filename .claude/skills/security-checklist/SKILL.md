---
name: security-checklist
description: Check-list de sécurité applicative web (auth, permissions, injections, RGPD, secrets, migrations, uploads). À charger systématiquement par security-reviewer (rôle GATE) et avant toute modif auth/permissions/données.
---

# Check-list sécurité applicative

## Pourquoi cette skill existe

L'application gère des **comptes utilisateurs et des données personnelles** derrière une API REST. Un bug de sécurité peut conduire à :
- **Fuite de données personnelles** (obligation de notification, sanction RGPD)
- **Prise de contrôle de comptes** (usurpation, actions au nom d'autrui)
- **Perte ou corruption de données** (migration destructive, injection)
- **Perte de confiance et coût juridique**

Toute régression ici est inacceptable. Cette skill liste les invariants à vérifier systématiquement.

## Invariants

### I1 — Le backend est la seule autorité
- Toute règle d'accès, de validation ou de quota existe côté backend
- Le frontend (bouton masqué, champ désactivé, check JS) n'est qu'un confort, jamais une barrière
- Vérification : pour chaque contrôle visible dans l'UI, trouver le contrôle serveur équivalent

### I2 — Endpoint protégé par défaut
- Tout nouvel endpoint exige une authentification, sauf exposition publique **déclarée et justifiée** dans la spec
- Vérification : la route passe par le middleware/décorateur d'auth du projet ; les exceptions sont listées explicitement
- ⚠️ **La présence de la garde ne suffit pas — vérifie sa PLACE dans le cycle de la requête.** Un contrôle d'auth dans le gestionnaire final ne protège rien si un parseur de corps, un middleware d'upload ou un hook de validation s'exécute avant lui et a déjà produit l'effet de bord. Un `grep` du décorateur qui remonte la route ne prouve rien : il faut savoir ce qui tourne avant. (Motif responsable de trois failles réelles sur le projet d'origine du kit.)
- ⚠️ Ne confonds pas **contrôle de validité** et **contrôle d'autorisation** : vérifier qu'un fichier est bien un PNG ou qu'un identifiant existe ne dit rien sur le droit de l'appelant.

### I3 — Permission revérifiée par ressource (anti-IDOR)
- « Être connecté » ne suffit pas : chaque accès à une ressource identifiée (`/api/v1/factures/42`) vérifie que **cet** utilisateur a le droit sur **cette** ressource
- Vérification : la requête BDD filtre par propriétaire/organisation, ou un contrôle explicite compare l'utilisateur courant à la ressource — jamais de confiance dans l'ID fourni par le client

### I4 — Requêtes paramétrées
- ❌ Aucune concaténation de valeur utilisateur dans une requête SQL (ou équivalent NoSQL)
- Vérification : chercher les constructions dynamiques de requêtes dans le diff ; toute valeur passe par des paramètres liés ou l'ORM

### I5 — Échappement de sortie
- Tout contenu d'origine utilisateur rendu en HTML est échappé (ou passé par le moteur de template qui échappe par défaut)
- ❌ `innerHTML` / rendu brut / désactivation de l'auto-échappement sur des données utilisateur
- Vérification : chercher les points d'injection de HTML dans le diff frontend et les templates

### I6 — CSRF sur les mutations
- Toute requête qui modifie l'état (POST/PUT/PATCH/DELETE) est protégée contre le CSRF selon le mécanisme du projet (token, SameSite, en-tête custom)
- Vérification : les nouvelles mutations utilisent le même mécanisme que les mutations existantes

### I7 — Secrets hors dépôt
- ❌ Aucun token, mot de passe, clé d'API dans le code, la config committée ou le frontend
- Secrets via variables d'environnement ; `.env` gitignoré ; `.env.example` documenté sans valeurs réelles
- Vérification : grep du diff sur les motifs de secrets ; vérifier qu'aucune valeur sensible n'atteint le bundle frontend

### I8 — Données personnelles minimisées et absentes des logs
- Pas de nouvelle collecte sans finalité déclarée dans la spec ; ne stocker que le nécessaire
- ❌ Email, nom, IP, identifiants ou contenu utilisateur dans les logs applicatifs
- Le droit à l'effacement reste réalisable (pas de copie orpheline non effaçable)
- Vérification : relire chaque nouvel appel au logger et chaque nouveau champ stocké

### I9 — Migrations réversibles + sauvegarde
- Toute migration a un chemin de retour (down) testé
- ❌ Migration destructive (DROP, suppression de colonnes/données) sans sauvegarde vérifiée et plan de retour arrière écrit
- Vérification : lire la migration entière, y compris le down ; exiger la preuve de sauvegarde pour le destructif

### I10 — Uploads contraints
- Type de fichier vérifié côté serveur (pas seulement l'extension ou le Content-Type client)
- Taille maximale imposée ; nom de fichier régénéré (pas de chemin fourni par le client)
- Stockage **hors webroot** (ou équivalent : bucket non exécutable) — un upload ne doit jamais devenir exécutable/servable tel quel
- Vérification : suivre le fichier de la requête jusqu'au disque dans le diff

## Checklist à appliquer à chaque design (P1) et à chaque diff (P2)

Pour tout code touchant auth, permissions, données personnelles, paiements, migrations, uploads :

- [ ] I1 : chaque contrôle client a son équivalent serveur
- [ ] I2 : nouveaux endpoints protégés par défaut
- [ ] I3 : accès par ressource revérifié (anti-IDOR)
- [ ] I4 : requêtes paramétrées, zéro concaténation
- [ ] I5 : sortie échappée
- [ ] I6 : mutations protégées CSRF
- [ ] I7 : aucun secret dans le diff
- [ ] I8 : données personnelles minimisées, logs propres
- [ ] I9 : migration réversible, sauvegarde si destructif
- [ ] I10 : uploads contraints (type/taille/stockage)
- [ ] Rate limiting présent sur les endpoints sujets à l'abus (login, reset, envoi de mails)
- [ ] Tests couvrant les cas de refus (non authentifié, mauvais propriétaire, entrée hostile)
- [ ] Rapport `security-reviewer` (rôle GATE) avec verdict GO présent dans la spec

## Exemples de violations à bloquer

```js
// ❌ IDOR : aucun contrôle de propriétaire
app.get('/api/v1/factures/:id', auth, async (req, res) => {
  res.json(await db.factures.findById(req.params.id)); // n'importe quel utilisateur connecté lit tout
});
```

```js
// ❌ Injection SQL : concaténation de valeur utilisateur
db.query("SELECT * FROM users WHERE email = '" + req.body.email + "'");
```

```js
// ❌ Donnée personnelle dans les logs
logger.info("Connexion échouée pour " + user.email + " depuis " + req.ip);
```

## Versions à jour

Cette skill doit être relue dès qu'une évolution touche :
- Le mécanisme d'auth ou de sessions du projet
- Le modèle de permissions/rôles
- La politique de logs ou de rétention des données

Mettre à jour la skill si les invariants évoluent ou si de nouvelles surfaces d'attaque apparaissent (webhooks, API publique, intégrations tierces).
