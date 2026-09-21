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
| [0002](0002-graphe-execution-plat.md) | Le graphe d'exécution des agents est plat | Accepté (bornage : superseded by ADR-0014) |
| [0003](0003-colonne-spec-depuis-repertoire.md) | La colonne d'une spec vient de son répertoire, jamais de son champ « Statut » | Accepté |
| [0004](0004-centre-controle-sans-route-ecriture.md) | Le tableau de bord n'a aucune route d'écriture tant que ses garde-fous ne sont pas du code | Accepté (condition remplie ; garantie reprise par [ADR-0019](0019-jeton-comme-unique-barriere-et-table-des-routes-fermee.md)) |
| [0005](0005-commandes-liste-fermee-par-cle.md) | Liste fermée de commandes : l'interface choisit une clé, jamais une ligne de commande | Accepté |
| [0006](0006-centre-controle-zero-dependance.md) | Le centre de contrôle n'a aucune dépendance d'exécution | Accepté |
| [0007](0007-config-projet-ne-voyage-pas-avec-kit.md) | Ce qui appartient au projet ne voyage pas avec le kit | Accepté |
| [0008](0008-kit-paths-liste-inclusive.md) | `.kit-paths` est une liste inclusive, jamais une liste d'exclusions | Accepté |
| [0009](0009-un-seul-auditeur-securite.md) | Un seul auditeur de sécurité, cumulant gate et audit | Accepté |
| [0010](0010-un-seul-script-de-synchronisation.md) | Un seul script de synchronisation : `update_kit.sh` | Accepté |
| [0011](0011-apercu-recapitulatif-d-operations.md) | L'aperçu d'`update_kit` est un récapitulatif d'opérations, pas un diff de deux arbres | Accepté |
| [0012](0012-harnais-de-test-partage-et-doctrine-anti-chevauchement.md) | Un harnais de test partagé, et la doctrine anti-chevauchement | Accepté |
| [0013](0013-detection-par-fichier-et-noms-cites.md) | La détection des fichiers gelés se fait par fichier, jamais sur un état global de l'arbre, et les noms sortis de git sont dé-cités avant réutilisation comme chemins disque | Accepté |
| [0014](0014-bornage-des-cycles-par-marqueur-declare.md) | Le bornage des cycles se fait par marqueur déclaré, jamais par nom d'agent en dur | Accepté — supersède ADR-0002 sur le bornage seul |
| [0015](0015-grammaire-kit-paths.md) | `.kit-paths` a une grammaire, et c'est un contrat public | Accepté |
| [0016](0016-fidelite-de-type-des-chemins-geles.md) | La garde de fidélité de type ne porte que sur les ancêtres du chemin, jamais sur sa feuille | Accepté |
| [0017](0017-un-defaut-qui-desarme-la-garde-livree-entre-dans-le-cycle.md) | Un défaut qui rend inatteignable la garde livrée entre dans le cycle qui la livre | Accepté |
| [0018](0018-refus-nomme-des-noms-cites-et-quatrieme-garde-sur-la-feuille.md) | `bug-008` se ferme par refus nommé, et la partition de fidélité de type se referme sur la feuille répertoire suivi | Accepté |
| [0019](0019-jeton-comme-unique-barriere-et-table-des-routes-fermee.md) | Ce qui remplace l'absence de route d'écriture : une table des routes fermée et le jeton comme unique barrière | Accepté |
| [0020](0020-un-centre-de-controle-appartient-a-un-developpeur.md) | Un centre de contrôle appartient à un développeur, et le jeton dépend du déploiement | Accepté |
| [0021](0021-etat-sans-cloture-additif-et-seuil-declare.md) | Un état de passage additif (`sans_cloture`), gouverné par un seuil déclaré en configuration | Accepté |
| [0022](0022-deux-familles-de-jetons-couleur-plancher-perceptuel.md) | Deux familles de jetons de couleur, séparées par un plancher perceptuel | Accepté (§1-§3 révoqués par [ADR-0032](0032-l-identite-coloree-des-agents-disparait-du-diagramme.md) ; §5 sans objet ; partiellement révoqué par [ADR-0033](0033-le-theme-sombre-est-supprime.md)) |
| [0023](0023-un-cycle-observe-ne-porte-pas-de-nom.md) | Un cycle observé ne porte pas de nom, et le centre de contrôle renonce à lui en donner un | Accepté |
| [0024](0024-une-section-a-la-fois-dans-un-contenu-borne.md) | Une section à la fois, dans un contenu borné : la colonne de navigation, l'absorption de `bug-016`, l'amendement du §3, et la règle de marge chiffrée | Accepté (§1 et la partie navigation de §2 remplacés par [ADR-0029](0029-le-tableau-de-bord-revient-au-mono-ecran.md) ; §4 révoqué par [ADR-0030](0030-material-design-3-ecrit-a-la-main-devient-le-systeme-visuel.md)) |
| [0025](0025-grammaire-du-diagramme-de-deroule.md) | La grammaire du diagramme de déroulé : ce que porte chaque forme du cercle, l'écart horizontal qui ne mesure pas le temps, et la séparation entre géométrie et rendu | Accepté (§1-§3 révoqués par [ADR-0031](0031-la-grammaire-du-disque-d-agent-change.md) ; §4 maintenu, écart assumé) |
| [0026](0026-trois-echelles-du-diagramme-alignees-sur-la-maquette.md) | Trois échelles du diagramme (graduations, rayon, liseré des fichiers) alignées sur la maquette de référence — remplace `ADR-0025 §1` sur ces trois points | Superseded by [ADR-0031](0031-la-grammaire-du-disque-d-agent-change.md) |
| [0027](0027-le-centre-de-controle-ecrit-des-specs-il-n-en-valide-aucune.md) | Le centre de contrôle écrit des specs, il n'en valide aucune : aucun appel de modèle, verrou court dédié plutôt que le verrou d'écrivain de `feature-007`, bornes de corps par route, et le contenu relu écrit verbatim | Accepté |
| [0028](0028-la-tete-de-commande-garde-deux-jetons-et-un-seul-module-decide-du-second.md) | La tête de commande garde deux jetons, et un seul module décide du second : arbitrage A′ contre les options A littérale et B, `_lancer()` mis en conformité, et la réserve sur la portée de l'oracle de validation | Accepté |
| [0029](0029-le-tableau-de-bord-revient-au-mono-ecran.md) | Le tableau de bord revient au mono-écran, et pourquoi `three.js` est écarté : amendement du §1/§2 d'ADR-0024, confirmation d'ADR-0006, trois alternatives chiffrées | Accepté (note additive 2026-09-20 : la prémisse 3D du §3 est retirée comme règle, reste vraie comme constat) |
| [0030](0030-material-design-3-ecrit-a-la-main-devient-le-systeme-visuel.md) | Material Design 3, écrit à la main, devient le système visuel : ADR-0006 confirmé sans exception, §3 des surfaces révoqué au profit des surfaces tonales, ADR-0024 §4 révoqué | Accepté |
| [0031](0031-la-grammaire-du-disque-d-agent-change.md) | La grammaire du disque d'agent change : ADR-0025 §1-§3 et ADR-0026 révoqués, pertes nommées (appels d'outils, échelle des fichiers, échec, sans-clôture, agent principal, heure de départ), ADR-0025 §4 maintenu en écart assumé, l'anneau signale l'activité sans jamais encoder de progression | Accepté |
| [0032](0032-l-identite-coloree-des-agents-disparait-du-diagramme.md) | L'identité colorée des agents disparaît du diagramme ; la couleur y devient exclusivement sémantique : ADR-0022 §1-§3 révoqués, §5 sans objet | Accepté |
| [0033](0033-le-theme-sombre-est-supprime.md) | Le thème sombre est supprimé : fidélité à la maquette Material 3 fournie, ADR-0022 partiellement révoqué, contraste de `bug-016` à remesurer | Accepté |
| [0034](0034-ce-que-le-depot-garde-des-references-de-conception.md) | Ce que le dépôt garde des références de conception, et à quel coût d'historique : le prototype HTML fait foi, les 12 PNG ne sont pas versionnés, le prototype est dupliqué sous `control-center/maquettes/` | Accepté |
| [0035](0035-ce-qu-une-suite-verte-prouve-identite-et-intervalle-de-versions.md) | Ce qu'une suite verte prouve : sous quelle identité, contre quel intervalle de versions — un jeton sans bit de lecture propriétaire refusé pour tout le monde, l'intervalle Python déclaré et vérifié plutôt qu'épinglé, `bug-019` absorbé au titre d'ADR-0017 | Accepté |
| [0036](0036-une-session-distante-se-releve-seule-plafonnee-au-pic-mesure.md) | Une session distante se relève seule après un OOM (`Restart=on-failure`), plafonnée au pic mesuré de sa propre unité et non de sa jumelle ; reprise d'une conversation via `--resume` transmis au démarrage du service, `/resume` étant indisponible en Remote Control | Accepté |
