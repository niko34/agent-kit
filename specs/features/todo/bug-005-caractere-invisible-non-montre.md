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
- **Statut** : todo
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

- [ ] Un chemin déclaré contenant un caractère non imprimable (BOM, espace
      insécable, `\r` intérieur) produit un message qui rend ce caractère
      **visible et identifiable**, distinct du chemin sans ce caractère
- [ ] Un chemin déclaré accentué (non-ASCII mais imprimable) continue de
      s'afficher **tel quel**, sans échappement — non-régression du cas
      couvert par ADR-0013 / `NomsAccentuesTest`
- [ ] Aucun chemin sensible (auth, permissions, données personnelles) touché
      — sinon basculer sur le template feature
- [ ] Suite de tests verte (+ test de non-régression ajouté couvrant ce bug)
- [ ] Le test de non-régression a été **vu échouer sur le code d'avant le
      fix** — sinon il ne protège rien
- [ ] Lint propre (`shellcheck`), pas de warning nouveau

## Hors périmètre

- Le parsing de `.kit-paths` lui-même (CRLF terminal, espaces de bord, glob)
  — déjà couvert par feature-012 / ADR-0015. Ce bug porte uniquement sur
  l'**affichage** d'un chemin déjà lu.
- Toute normalisation qui **réinterpréterait** silencieusement un chemin
  (par exemple : retirer un BOM du chemin avant comparaison) — ce bug
  demande de le **montrer**, pas de le corriger à la place de l'utilisateur.
