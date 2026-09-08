# Architecture Decision Records

Ce dossier contient les décisions d'architecture structurantes du projet, au format Michael Nygard (*Architecture Decision Records*, 2011).

## Pourquoi des ADR ?

Certaines décisions techniques ne sont pas lisibles dans le code : elles expliquent **pourquoi** telle option a été retenue plutôt que telle autre. Un ADR capture le contexte, l'alternative rejetée et la conséquence assumée, pour ne pas avoir à rediscuter la question six mois plus tard.

## Règles du dossier

- **Immuable une fois accepté** : un ADR n'est pas modifié. S'il est remis en cause, on en écrit un nouveau qui le supersède (et on change le statut de l'ancien en `Superseded by ADR-XXXX`).
- **Un ADR = une décision**. Pas de document fourre-tout.
- **Format court** : contexte, décision, conséquences. Pas de tutoriel.
- **Numérotation monotone** : `ADR-0001`, `ADR-0002`, …

## Quand écrire un ADR ? (critères de déclenchement)

Un ADR est justifié dès qu'**au moins un** de ces critères est atteint :

1. **Contrainte structurante** : la décision impose une contrainte au reste du système (format de données, protocole, découpage en modules).
2. **Décision invisible dans le code** : un refus, un compromis entre options équivalentes — rien dans le code ne dira jamais pourquoi.
3. **Alternatives crédibles** : au moins une autre option sérieuse a été étudiée et écartée ; la trace évite de rejouer le débat.
4. **Verrouillage long terme** : la décision engage l'avenir (contrat d'API public, schéma de BDD, format de fichier, compatibilité).

Une simple préférence de style, un choix réversible en une heure ou un détail d'implémentation ne méritent PAS d'ADR.

## Index

| # | Titre | Statut |
|---|-------|--------|
| [0001](0001-exemple-format-adr.md) | Adopter le format ADR et ses règles | Accepté |
