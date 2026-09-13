# Bug — un chemin épinglé non divergent bloque la synchronisation sans que rien ne le dise

- **Type** : bug (format minimal `specs/modele.md`)
- **Version cible** : 0.7.0
- **Créée** : 2026-09-13 (constat de `security-reviewer` en rôle AUDIT pendant
  le cycle `bug-003`, classé **acceptable**, établi par exécution — cas S12 et
  S8b de son rapport)
- **Domaine** : outillage — `tools/update_kit.sh`. Aucun chemin sensible.
- **Spec liée** : `bug-003` (la garde des bits git, dont ce cas est l'angle
  mort), `feature-014` (fidélité de l'aperçu — voisin)

## Agents requis

- [x] debugger
- [ ] **security-reviewer, rôle GATE** — non coché : aucun des cinq
      déclencheurs. Ce n'est pas une destruction, c'est un **déni de service
      muet**
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

Un bit `skip-worktree` ou `assume-unchanged` posé sur un chemin **listé
nommément** dans les chemins gelés (`tools/update_kit.sh`, `GUIDE.md`…), dont le
contenu est **identique** à `HEAD` **et** au kit, fait **échouer `git checkout`**
avec « pathspec did not match ».

**Rien n'est écrit** — l'échec est atomique, c'est le bon côté. Mais :
- **`--dry-run` n'annonce rien** : l'aperçu ne laisse pas deviner que la
  synchronisation réelle va échouer ;
- **le message d'erreur ne nomme pas le bit**, donc l'utilisateur n'a aucun
  moyen de comprendre pourquoi.

La garde livrée par `bug-003` ne se déclenche pas non plus — et c'est **voulu** :
elle ne bloque que sur un contenu **divergent**, précisément pour ne pas gêner
un fichier sans risque. Ce cas tombe dans l'angle mort.

```
(relevé à produire : l'audit a établi le mécanisme par expérience sans
conserver la sortie. PREMIÈRE TÂCHE DU CYCLE : reproduire, et coller ici l'état
de départ, la commande, la sortie complète et le code de retour.)
```

**Scénario de reproduction** : dans un projet consommateur, poser
`git update-index --skip-worktree` sur un chemin gelé **identique** au kit, puis
lancer `./tools/update_kit.sh --dry-run`, puis sans.

## Cause racine

À confirmer par exécution. Hypothèse de l'audit : `git checkout <ref> -- <path>`
refuse un pathspec dont l'entrée d'index porte le bit, quand il n'y a rien à
mettre à jour. L'échec remonte tel quel, avec le message de git, sans
interprétation.

Le résultat est un script qui **s'arrête sans expliquer pourquoi** sur un état
que l'utilisateur a lui-même créé six mois plus tôt et qu'il a oublié.

## Correctif attendu

1. **Détecter le cas à la classification**, avant `git checkout` : un chemin
   porteur d'un bit, identique au kit, sur un chemin épinglé.
2. **L'annoncer dans l'aperçu**, donc **en `--dry-run` aussi** — c'est le
   manque principal. `architect` tranche la catégorie : un état à part, ou une
   mention dans « identiques ».
3. **Décider explicitement** entre deux comportements, et l'écrire :
   - **poursuivre** en écartant ce chemin du `checkout` — rien n'était à faire,
     l'échec n'apporte rien ;
   - ou **refuser d'emblée** avec un message qui nomme le bit et les issues.

   Ce qui est exclu, c'est le comportement actuel : un échec brut de git que
   l'utilisateur ne peut pas relier à sa cause.
4. Si un message est ajouté, il **nomme le bit** (`skip-worktree` /
   `assume-unchanged`) et la commande pour le lever, littéralement — comme le
   fait déjà la garde de `bug-003`.

⚠️ Ne pas rendre la garde de `bug-003` bloquante sur les fichiers **identiques**
au kit : c'est son contrat, et le rouvrir gênerait les projets qui figent
légitimement un fichier de configuration local.

## Critères d'acceptation

- [ ] Dans le scénario de reproduction, `--dry-run` **annonce** ce qui va se
      passer
- [ ] Le comportement en exécution réelle est celui tranché par `architect`, et
      **jamais** un échec brut de git non expliqué
- [ ] Si un message est ajouté, il nomme le bit **et** la commande pour le lever
- [ ] La garde de `bug-003` reste inchangée sur son périmètre : un non-suivi ou
      un bit **divergent** bloque toujours, un **identique** ne bloque jamais
- [ ] Parité `--dry-run` / réel préservée (ADR-0011)
- [ ] Aucun chemin sensible touché
- [ ] Suite verte, avec un test de non-régression **vu échouer sur le code
      d'avant le fix**
- [ ] Matrice de mutation **diagonale** (ADR-0012)
- [ ] Lint propre, pas de warning nouveau

## Hors périmètre

- La garde de `bug-003` elle-même — livrée, son contrat ne change pas
- Les chemins **conditionnels** et le contenu de l'aperçu — `feature-014`
- Le cas d'un bit posé sur un chemin **divergent** — déjà traité par `bug-003`
