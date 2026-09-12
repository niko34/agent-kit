## Métadonnées
- **ID** : refactor-001
- **Slug** : un-seul-auditeur-de-securite
- **Type** : refactor
- **Statut** : done
- **Priorité** : haute
- **Version cible** : 0.5.0 (`CHANGELOG.md`, commit `764dc15`)
- **Dernière mise à jour** : 2026-09-12
- **Spec(s) liée(s)** : feature-003 (propagation dans les profils Copilot
  générés), feature-002 (le chantier qui a servi de preuve empirique du défaut)

> Spec rétroactive, écrite depuis le commit `764dc15`
> (« refactor(agents): un seul auditeur de sécurité — security-auditor
> fusionne dans security-reviewer ») et `CHANGELOG.md` `[0.5.0]`.
> Rédigée avec le template complet, sur consigne explicite, bien que
> `CLAUDE.md` du kit permette normalement le format `specs/modele.md` pour un
> refactor ponctuel.

## Domaines touchés
- [ ] API REST
- [ ] Frontend
- [ ] BDD / migrations
- [ ] Auth / permissions applicatives — ce refactor touche l'équipe d'agents
      *chargée* de l'auth/permissions, pas une application elle-même
- [ ] Données personnelles
- [ ] Intégrations externes
- [ ] Tâches de fond

## Agents requis
- [x] spec-reader
- [x] architect — a tranché la fusion des deux rôles (GATE + AUDIT) et la
      règle « un GO en P1 ne vaut jamais GO en P2 »
- [ ] security-reviewer, rôle GATE — n'a pas de sens ici : l'agent lui-même
      est l'objet du refactor
- [ ] ux-ui-designer
- [ ] backend-developer
- [ ] frontend-developer
- [ ] test-engineer — pas de suite automatisée pour un frontmatter d'agent ;
      la propagation a été vérifiée par recherche exhaustive des occurrences
- [x] code-reviewer — a vérifié qu'aucune occurrence orpheline ne subsistait
      après la fusion
- [x] doc-writer

## Description
Fusion de `security-auditor` (gate bloquant, deux passages P1/design puis
P2/diff, verdict GO / GO SOUS CONDITIONS / NO GO) dans `security-reviewer`
(audit holistique de la surface d'attaque, sans diff ni spec). L'équipe passe
de 12 à 11 agents. `security-auditor.md` est supprimé ; l'agent fusionné
cumule les deux rôles et annonce toujours lequel il joue.

## Contexte
Le kit portait **deux** agents de sécurité dont les périmètres obligatoires
se recouvraient. Le constat qui a motivé la fusion est **empirique**, pas
théorique : pendant le chantier du centre de contrôle (feature-002,
un serveur HTTP destiné à écouter au-delà de localhost et à terme lancer des
workflows Claude Code), **aucun des deux agents de sécurité n'a été
invoqué**. Deux « invocation obligatoire » sur le même périmètre produisent
soit le double de coût, soit l'ambiguïté — et l'ambiguïté, en pratique,
signifie qu'aucune des deux n'est appelée.

## Comportement livré

### L'agent fusionné cumule deux rôles déclarés
- **Rôle GATE** — périmètre déclaré, deux passages, verdict
  **contraignant** : GO / GO SOUS CONDITIONS / NO GO. Un NO GO empêche la
  livraison.
- **Rôle AUDIT** — sans diff ni spec, examen de la surface d'attaque entière.

L'agent **annonce toujours lequel des deux rôles il joue** au moment de son
invocation.

### La règle du double passage est conservée
**Un GO en P1 (design) ne vaut jamais GO en P2 (diff)** — conservée
explicitement, parce qu'elle découle du motif d'échec que l'agent porte déjà :
une garde correcte sur le papier peut être mal placée dans le code une fois
implémentée.

### Hiérarchie des constats, distincte du verdict
Le verdict porte sur le **lot** entier ; la hiérarchie Grave / Acceptable /
Cosmétique porte sur **chaque constat** pris séparément. Un lot peut recevoir
GO en contenant des constats cosmétiques ; jamais en contenant un constat
grave.

### Propagation : 60 occurrences dans 17 fichiers
La majorité était un renommage mécanique. Les passages qui **opposaient** les
deux agents ont été réécrits à la main plutôt que par substitution
automatique — un `sed` naïf aurait produit des phrases absurdes du type
« security-reviewer, là où security-reviewer ne voit qu'un diff ». Concerné
en particulier :
- les tableaux à deux lignes de `CLAUDE.md`, `GUIDE.md` et `README.md`,
  devenus une ligne unique ;
- la règle « prévoir `security-reviewer` en plus du gate », devenue « prévoir
  un passage supplémentaire en rôle AUDIT » ;
- le décompte de l'équipe (« 12 agents ») dans `GUIDE.md` et `README.md`,
  passé à 11 ;
- les skills `security-checklist` et `db-migrations`, qui référençaient les
  deux agents séparément.

### Le CHANGELOG n'est pas réécrit
L'entrée antérieure qui présentait `security-reviewer` comme « complémentaire
du gate `security-auditor` » (`[0.2.0]`) était **vraie à sa date** — elle
décrit un état du kit qui a réellement existé. Une entrée neuve décrit la
fusion (`[0.5.0]`) ; le passé reste tel qu'il a eu lieu, sans réécriture
d'historique.

### Le modèle survit à la fusion
`security-auditor` était passé d'`opus` à `fable` avant sa disparition, sur
décision explicite de l'utilisateur (commit `04045ee`) ; ce choix de modèle
survit dans l'agent fusionné plutôt que d'être perdu par la suppression du
fichier.

## Comportement actuel (avant ce travail)
Deux agents de sécurité coexistaient, `security-auditor` (gate) et
`security-reviewer` (audit), avec des périmètres d'invocation obligatoire
recouvrants et documentés séparément dans `CLAUDE.md`, `GUIDE.md` et
`README.md`.

## Contraintes techniques
- Aucune perte d'information : chaque garantie portée par les deux agents
  d'origine (verdict bloquant du gate, audit holistique) devait subsister
  dans l'agent fusionné
- Propagation exhaustive : aucune occurrence orpheline des deux noms
  d'origine ne devait subsister après la fusion (contrôlé par recherche, pas
  seulement par relecture)
- Le CHANGELOG existant ne devait pas être modifié

## Fichiers concernés
- `.claude/agents/security-auditor.md` — supprimé
- `.claude/agents/security-reviewer.md` — fusionné, rôles GATE + AUDIT
- `CLAUDE.md`, `GUIDE.md`, `README.md` — tableaux à deux agents réduits à un,
  décompte d'équipe 12 → 11
- `.claude/agents/orchestrator.md` — renommage des références
- `.claude/skills/security-checklist/*`, `.claude/skills/db-migrations/*` —
  références aux deux agents fusionnées
- `specs/features/_template.md` — bloc « Agents requis » aligné sur l'agent unique

## Livrables — check-list
- [x] A1 — `security-auditor.md` supprimé, son contenu absorbé par `security-reviewer.md`
- [x] A2 — Rôles GATE et AUDIT explicitement déclarés et annoncés par l'agent
- [x] A3 — Règle « GO en P1 ≠ GO en P2 » conservée
- [x] A4 — Hiérarchie Grave/Acceptable/Cosmétique distincte du verdict de lot
- [x] A5 — 60 occurrences propagées dans 17 fichiers, tableaux à deux lignes réécrits
- [x] C1 — Décompte d'équipe (12 → 11) mis à jour dans `GUIDE.md` et `README.md`
- [x] C2 — `CHANGELOG.md` : nouvelle entrée décrivant la fusion, l'ancienne non réécrite

## ADR produits
- **ADR-0009** (`docs/adr/0009-un-seul-auditeur-securite.md`) — un seul auditeur de sécurité, motivé
  par le constat empirique qu'aucun des deux gates séparés n'a été invoqué
  pendant un chantier qui les requérait pourtant tous les deux

## Éléments visibles (pour doc-writer)

### Endpoints REST concernés
- Aucun

### Écrans / flux UI concernés
- Aucun

### Documentation produite / mise à jour
- `CHANGELOG.md` `[0.5.0]` — section « Équipe d'agents »
- `GUIDE.md`, `README.md` — décompte d'équipe et description de l'agent fusionné

## Critères d'acceptation
- [x] Aucune occurrence orpheline de `security-auditor` ne subsiste hors du
      CHANGELOG historique
- [x] L'agent fusionné annonce explicitement le rôle (GATE ou AUDIT) qu'il joue
- [x] La règle « GO en P1 ne vaut jamais GO en P2 » reste lisible dans le
      profil de l'agent
- [x] Le décompte d'équipe affiché (11) correspond au nombre réel de fichiers
      dans `.claude/agents/`
- [x] `CHANGELOG.md` `[0.2.0]` n'a pas été modifié

## Notes pour agent
- Ce refactor a servi de preuve empirique à un principe plus général du kit :
  une règle d'invocation obligatoire qui recouvre celle d'un autre agent finit,
  en pratique, par n'être respectée par personne. À vérifier avant d'ajouter
  un futur agent dont le périmètre obligatoire chevaucherait un agent existant.
- La fusion Copilot (feature-003) a bénéficié de ce refactor comme cas de
  test réel : le profil `security-auditor.agent.md` orphelin a été supprimé
  automatiquement par `--check`, sans intervention manuelle.

## Hors périmètre
- Réécriture du CHANGELOG antérieur à la fusion — explicitement refusée
- Modification du contenu métier des skills `security-checklist` et
  `db-migrations` au-delà du renommage des références
