<!--
Template MINIMAL pour bug simple ou refactor ponctuel.
Copier ce fichier dans specs/features/todo/ sous le nom :
    bug-NNN-<slug>.md   ou   refactor-NNN-<slug>.md
Si le bug touche l'auth, les permissions, les données personnelles ou une migration
destructive : basculer sur specs/features/_template.md (déclenche security-reviewer, rôle GATE).
Supprimer ce bloc commentaire.
-->

# Bug — un chemin déclaré « absent » ne montre pas le caractère qui le rend introuvable, quand ce caractère est invisible

- **Type** : bug (format minimal `specs/modele.md`)
- **Statut** : done
- **Version cible** : 0.7.0 (non taggée à ce jour)
- **Créée** : 2026-09-13 (constat de l'audit sécurité pendant le cycle
  feature-012, arbitré par `code-reviewer` : signalé, mais volontairement
  **non corrigé** dans ce lot — ça demande une conception, pas une ligne)
- **Domaine** : outillage — `tools/update_kit.sh`, message de diagnostic
  « Déclaré dans .kit-paths mais absent de … ». Ni auth, ni données
  personnelles.
- **Spec liée** : feature-012 (grammaire de `.kit-paths` et les diagnostics
  qui nomment un chemin absent), ADR-0013 (piège `core.quotepath` — même
  famille de défaut : un nom de fichier qui ne s'affiche pas comme il faut
  fait perdre du temps à chercher une cause ailleurs), ADR-0015 (grammaire de
  `.kit-paths`)

## Agents requis

- [x] debugger (ou architect si la conception retenue est un refactor)
- [ ] **security-reviewer, rôle GATE** — non coché : aucun chemin sensible
      (auth, permissions, données personnelles, migration). Impact : perte de
      temps de diagnostic pour l'utilisateur, pas une faille
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

Depuis feature-012, un chemin déclaré dans `.kit-paths` mais introuvable côté
kit est nommé nommément sur stderr :

```
⚠️  Déclaré dans .kit-paths mais absent de kit/main : GUIDE.md
```

Ce message **montre les octets tels quels** (`echo` sans traitement
particulier). Quand le chemin déclaré contient un caractère **invisible** à
l'affichage — un BOM en tête de fichier, une espace insécable (U+00A0) au
lieu d'une espace ordinaire, un `\r` **intérieur** au chemin (jamais en fin
de ligne, donc non retiré par le trim de feature-012) — le message affiche un
chemin qui **ressemble en tout point** au fichier réellement présent dans le
projet et dans le kit. L'utilisateur lit :

```
⚠️  Déclaré dans .kit-paths mais absent de kit/main : GUIDE.md
```

... alors que `ls GUIDE.md` (ou l'explorateur de fichiers) montre bien
`GUIDE.md` présent, apparemment identique. Rien dans la sortie ne signale
que le chemin déclaré diffère du fichier attendu par un octet qu'aucun
terminal n'affiche. L'utilisateur cherche alors la cause ailleurs — exactement
le profil de défaut qu'ADR-0013 a nommé pour `core.quotepath`, et que
feature-012 a corrigé pour le message « mauvais distant » : un diagnostic qui
pointe la mauvaise direction fait perdre du temps de la même façon qu'un
diagnostic qui ne pointe nulle part.

## Cause racine

Le message est produit par un simple `echo "... : $chemin"` (voir
`tools/update_kit.sh`, bloc de classification des chemins déclarés,
feature-012) : `$chemin` est injecté tel quel dans la sortie. Un terminal
affiche un BOM, une espace insécable ou un `\r` intérieur soit comme rien du
tout, soit comme un espace visuellement indiscernable d'une espace normale —
**la cause n'est pas dans le parsing de `.kit-paths`** (feature-012 gère
correctement le `\r` *terminal* et les espaces de *bord*, cf. ADR-0015), mais
dans l'**affichage** d'un chemin qui contient un caractère non imprimable en
un point *intérieur*, jamais retiré ni signalé.

## Correctif attendu

**Ça demande une conception, pas une ligne** — c'est délibérément non tranché
ici. Deux exigences à concilier :

1. Rendre visible, dans le message d'erreur, la présence d'un caractère non
   imprimable dans le chemin déclaré — sans quoi le message actuel continue
   d'annoncer un chemin « absent » qui ressemble trait pour trait au chemin
   présent.
2. **Ne jamais mutiler un chemin légitime.** `architect` tranche la méthode
   d'affichage (candidats à évaluer, liste non fermée) : un encodage
   réversible et lisible qui ne modifie que la représentation à l'écran, en
   distinguant les octets non-ASCII **légitimes** (un chemin accentué, cf.
   ADR-0013) des caractères réellement non imprimables (BOM, `\r` intérieur,
   espace insécable, autres caractères de contrôle).

### ⚠️ Argument qui a écarté le correctif naïf

`printf '%q'` (échappement shell) et `cat -v` (notation caret/`M-` de
`GNU cat`) ont été considérés puis écartés **sans être implémentés**, parce
que tous deux **mutileraient à l'affichage les chemins accentués
légitimes** : un chemin réel comme `révision.md` (cf. ADR-0013, cas
« NomsAccentuesTest ») ressortirait sous une forme échappée
(`r\303\251vision.md` ou équivalent) qui ne ressemble plus au fichier réel —
exactement le défaut que la classification de feature-012 a corrigé pour
`git ls-tree` (`-c core.quotepath=off`), réintroduit ici côté affichage si on
échappe indistinctement tout octet non-ASCII. Le correctif doit distinguer
« non-ASCII légitime » de « non imprimable », ce qu'aucun des deux outils ne
fait : c'est précisément ce qui transforme ce bug en sujet de conception.

## Critères d'acceptation

- [x] Un chemin déclaré contenant un caractère non imprimable (BOM, espace
      insécable, `\r` intérieur) produit un message qui rend ce caractère
      **visible et identifiable**, distinct du chemin sans ce caractère
- [x] Un chemin déclaré accentué (non-ASCII mais imprimable) continue de
      s'afficher **tel quel**, sans échappement — non-régression du cas
      couvert par ADR-0013 / `NomsAccentuesTest`
- [x] Aucun chemin sensible (auth, permissions, données personnelles) touché
      — sinon basculer sur le template feature
- [x] Suite de tests verte (+ test de non-régression ajouté couvrant ce bug)
- [x] Le test de non-régression a été **vu échouer sur le code d'avant le
      fix** — sinon il ne protège rien
- [x] Lint propre (`shellcheck`), pas de warning nouveau

## Hors périmètre

- Le parsing de `.kit-paths` lui-même (CRLF terminal, espaces de bord, glob)
  — déjà couvert par feature-012 / ADR-0015. Ce bug porte uniquement sur
  l'**affichage** d'un chemin déjà lu.
- Toute normalisation qui **réinterpréterait** silencieusement un chemin
  (par exemple : retirer un BOM du chemin avant comparaison) — ce bug
  demande de le **montrer**, pas de le corriger à la place de l'utilisateur.

---

# Notes d'implémentation

## Plan (architect)
Fonction `forme_lisible_chemin()` extraite dans `tools/update_kit.sh` : construit
une **seconde** chaîne réservée à l'affichage, en remplaçant des motifs d'octets
**nommés un à un** par une étiquette entre crochets. `$chemin` n'est jamais
modifié et continue d'être transmis intact au reste du script.

## Tests (test-engineer)
- Suite du kit : **104 → 111 tests**, verte. Le compte augmente : le correctif
  tardif a bien rouvert les tests.
- `CaracteresInvisiblesTest` : 13 cas, dont 6 ajoutés en revue.
- **Validation par mutation**, deux mutants, tous deux syntaxiquement valides :
  - retirer les motifs invisibles hors ASCII → **6 tests meurent** ;
  - remettre la ligne brute avant le diagnostic → **exactement 1 test meurt**,
    celui qui porte sur l'ordre.
- `shellcheck -S warning tools/update_kit.sh` : 0 warning.

## Revue (code-reviewer)
Verdict initial : **Request changes**. Deux défauts retenus comme appartenant à
ce cycle au titre d'ADR-0017 — la garde livrée était **inatteignable** sur toute
une famille de cas :

1. **Six familles d'invisibles non couvertes** — U+200B (le cas d'école du bug,
   strictement invisible), U+00AD, U+2028/U+2029, U+3000, les onze espaces
   U+2000–U+200A et les contrôles C1 U+0080–U+009F. Le critère d'acceptation
   n°1 n'était donc pas tenu. **Corrigé dans ce cycle.**
2. **La ligne brute précédait le diagnostic.** Un chemin contenant `\x1b[2J`
   efface l'écran quand la ligne brute l'émet : l'explication était supprimée
   par ce qu'elle explique. Exactement la classe de défaut que cette spec existe
   pour fermer. **Ordre inversé dans ce cycle.**

## ⚠️ Faute corrigée en route, trouvée par exécution seule
Les deux boucles neuves portaient `\$(` au lieu de `\\$(` — un dollar échappé,
donc **aucune substitution de commande**. La syntaxe était valable, `shellcheck`
restait vert, et les deux plages ne nommaient rien du tout. Seule l'épreuve
directe de la fonction l'a montrée. Consigné ici parce que la relecture ne
pouvait pas l'attraper.

## Pourquoi jamais de boucle 128-255
Un garde-commentaire l'interdit dans le code, adossé à un test qui meurt si on la
réintroduit. En UTF-8, un octet de tête (C2, E2, E3…) ne peut jamais apparaître
comme octet de continuation : une **séquence complète nommée** est sûre, une
boucle par octet mutile `révision.md` et corrompt les étiquettes de la fonction
elle-même.

## Statut final
✅ Done — 2026-09-15 — commit à renseigner à la validation
