---
name: spec-workflow
description: Cycle de vie d'une spec (todo → doing → done), format à respecter, règles de promotion entre dossiers. À charger dès qu'une spec est créée, reprise ou clôturée.
---

# Spec workflow

## Arborescence

```
specs/
  modele.md             # Template minimal (bug simple / refactor) — NE PAS modifier sans accord
  modele_iteration.md   # Template de suivi d'itérations
  features/
    _template.md        # Template OBLIGATOIRE pour toute nouvelle feature — NE PAS modifier sans accord
    todo/               # Specs à traiter, priorité par nom alphabétique ou horodatage
    doing/              # Spec en cours (idéalement une seule)
    done/               # Specs terminées et validées
```

## Cycle de vie

```
features/todo/X.md ──(promotion par spec-reader)──> features/doing/X.md ──(validation QA + revue)──> features/done/X.md
```

- Une spec = un cycle. Pas de spec « en pause » dans `doing/` pendant qu'on en fait une autre.
- Si un imprévu force à suspendre : renvoyer dans `features/todo/` avec note explicite en tête.
- Pas de création de spec directement dans `features/doing/`.

## Création d'une spec

### Feature (obligatoire : template riche)

1. Copier `specs/features/_template.md` vers `specs/features/todo/feature-NNN-<kebab-case-slug>.md` (NNN = prochain numéro dispo)
2. Remplir **tous les blocs obligatoires** :
   - Métadonnées (ID, slug, priorité, version cible)
   - Domaines touchés (checklist)
   - Agents requis (checklist — cocher `security-reviewer` (rôle GATE) si auth / permissions / données personnelles / migration destructive touchés)
   - Description, Contexte, Comportement attendu, Comportement actuel
   - Contraintes techniques, Fichiers potentiellement concernés
   - Sécurité & données (si applicable)
   - Éléments visibles (pour doc-writer)
   - Critères d'acceptation + Plan de test manuel
3. Supprimer les sections optionnelles non pertinentes plutôt que les laisser vides
4. Ne pas ajouter de sections « Notes techniques », « Statut » — elles seront ajoutées en cours de route

### Bug simple ou refactor ponctuel (format minimal toléré)

1. Copier `specs/modele.md` vers `specs/features/todo/bug-NNN-<slug>.md` (ou `refactor-NNN-<slug>.md`)
2. Remplir type, symptôme observé (avec preuves : logs serveur, réponse HTTP, stack trace), cause racine, correctif attendu, critères d'acceptation
3. Si le bug touche l'auth, les permissions, les données personnelles ou une migration destructive : basculer sur le template feature complet pour que `security-reviewer` (rôle GATE) soit déclenché

## Promotion todo → doing

- Faite par `spec-reader` après analyse d'impact complète
- Si spec incomplète : ne PAS la promouvoir, poser les questions à l'utilisateur

```bash
mv specs/features/todo/<nom>.md specs/features/doing/<nom>.md
```

⚠️ **Déplacer, jamais copier** — et c'est **vérifié par la CI**
(`.github/workflows/hygiene-specs.yml`). Un nom de spec présent dans plusieurs des
dossiers `todo/` · `doing/` · `done/` rend le run **rouge**. Contrôles lançables en
local avant de committer :

```bash
./tools/check_specs.sh       # 0 si tout va bien, 1 sinon
./tools/check_doc_links.sh   # les liens de la doc résolvent encore après la promotion
```

`check_specs.sh` signale aussi, **sans bloquer**, un même numéro porté par deux slugs
différents : une référence `feature-042` dans un commit ou un ADR devient alors ambiguë.

Le second contrôle n'est pas décoratif : **le chemin d'un lien vers une spec encode son
état dans le cycle**, donc chaque promotion casse silencieusement les liens qui citaient
l'ancien emplacement. Sur le projet d'origine, 29 % des liens vers des specs étaient
morts pour cette seule raison — des liens justes le jour où ils ont été écrits.

## Enrichissement pendant doing

Ajouter **en fin de fichier** (pas en remplacement) les sections de `specs/modele_iteration.md` :

```markdown
---
# Notes d'implémentation

## Plan (architect)
...

## Validation security-reviewer, rôle GATE (si applicable)
P1 (design) : GO / GO SOUS CONDITIONS / NO GO
P2 (diff)   : GO / GO SOUS CONDITIONS / NO GO
...

## Tests (test-engineer)
- Suite de tests du projet (cf. skill dev-workflow) : ✅
- Tests ajoutés : ...

## Revue (code-reviewer)
Verdict : Approved / Request changes
...
```

## Promotion doing → done

Exigences avant promotion :
- [ ] Suite de tests du projet verte (commandes canoniques : skill `dev-workflow`)
- [ ] Tests ajoutés / passants, **validés par mutation** (chaque test neuf a été vu
      échouer sur une altération volontaire du code qu'il protège)
- [ ] `./tools/check_specs.sh` et `./tools/check_doc_links.sh` verts
- [ ] Lint propre
- [ ] Rapport `code-reviewer` Approved
- [ ] `security-reviewer` (rôle GATE) GO si applicable
- [ ] `CHANGELOG.md` mis à jour (si visible utilisateur)
- [ ] Documentation à jour (si API / UX / schéma BDD change)

```bash
mv specs/features/doing/<nom>.md specs/features/done/<nom>.md
```

En fin de fichier, ajouter :
```markdown
## Statut final
✅ Done — <date> — commit <sha>
```

## Règles

- **Une spec = une unité** : si trop gros, découper en sous-specs avant de démarrer
- **Source de vérité** : pas de travail sans spec. Si demande verbale → créer une spec d'abord
- **Immuable après done** : ne pas modifier une spec `done/` ; créer une nouvelle spec pour toute évolution
- **Historique** : l'ordre des fichiers `done/` raconte l'histoire du projet
- **Honnêteté documentaire** : les notes d'implémentation consignent ce qui s'est vraiment passé, y compris les hypothèses invalidées (addendum daté par itération)
