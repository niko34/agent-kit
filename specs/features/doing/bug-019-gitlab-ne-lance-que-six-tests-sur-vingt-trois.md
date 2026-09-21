# Bug — GitLab est verte parce qu'elle ne lance pas les tests qui échouent

## Métadonnées
- **ID** : bug-019
- **Slug** : gitlab-ne-lance-que-six-tests-sur-vingt-trois
- **Type** : bug
- **Statut** : todo
- **Priorité** : **haute**
- **Dernière mise à jour** : 2026-09-20
- **Spec(s) liée(s)** : `bug-018` (même défaut de fond sur l'autre forge — une
  suite verte qui ne prouve rien) ; `feature-004` (le kit parle aux deux forges)

> **Absorbé dans le cycle de `bug-018` au titre d'`ADR-0017`**, sur décision
> humaine du 2026-09-20. Motif : ce défaut **désarme exactement la garde que ce
> cycle livre**. Corriger la CI GitHub sans corriger GitLab reviendrait à
> annoncer « la CI prouve la non-régression » alors qu'une forge continuerait de
> mentir. C'est le cas d'école d'`ADR-0017`, pas une lecture élargie.

## Agents requis
- [x] spec-reader · [x] architect
- [ ] security-reviewer — aucune surface d'authentification touchée
- [x] test-engineer · [x] code-reviewer · [x] doc-writer
- [ ] backend-developer, frontend-developer, ux-ui-designer, debugger

## Symptôme observé

Sur le même commit, **« la CI est rouge » et « la CI est verte » sont toutes deux
vraies**, selon la forge qu'on regarde.

- GitHub : job « Suite de tests (control-center/) » **rouge depuis 7 runs**
  (`bug-018`), parce qu'il découvre les fichiers par
  `find control-center -name 'test_*.py'`.
- GitLab : pipeline **verte**, parce que `.gitlab/ci/hygiene.yml` **énumère les
  tests à la main** et n'inclut pas ceux qui échouent.

## Cause racine

`.gitlab/ci/hygiene.yml` liste les fichiers de test un par un, sous la forme
`if [ -f <chemin> ]; then python3 <chemin>; else echo "absent — rien à lancer."`.
Un fichier absent de cette liste n'est jamais lancé, et **rien ne le signale** :
la branche `else` n'existe que pour les fichiers déjà listés.

⚠️ **Le dépôt avait déjà appris cette leçon — sur l'autre forge seulement.** Le
commentaire de `.github/workflows/` l'écrit noir sur blanc : « La liste des
fichiers est DÉCOUVERTE (`find control-center -name 'test_*.py'`), jamais
énumérée à la main : une énumération manuelle a déjà laissé
`control-center/backend/test_agents.py` (24 cas verts) hors CI sans que rien ne
le signale. » GitLab fait aujourd'hui **exactement** ce que ce commentaire
proscrit, et `test_agents.py` y est toujours absent.

## Correctif attendu

Aligner GitLab sur GitHub : **découvrir** les fichiers de test au lieu de les
énumérer. Le job doit échouer si **aucun** fichier n'est découvert — sans quoi
un `find` qui ne trouve rien rendrait la pipeline verte, reproduisant le défaut
sous une autre forme.

⚠️ **Ce que le correctif ne doit pas être** : ajouter à la main les 17 fichiers
manquants. Cela rendrait la pipeline verte aujourd'hui et reformerait l'écart au
premier fichier neuf. C'est le mécanisme d'énumération qui est le défaut, pas
son contenu.

## Grandeurs mesurées

Mesurées le 2026-09-20 par `find control-center -name 'test_*.py'` recoupé avec
les invocations `python3 <chemin>` de `.gitlab/ci/hygiene.yml`.

- `fichiers de test sous control-center/` = **23**
- `lancés par GitLab` = **6**
- **`manquants de GitLab` = 17**, dont `test_jeton.py` et `test_server_bug012.py`
  — précisément les deux qui échouent — et `test_agents.py`, déjà oublié une fois
- `mécanisme GitHub` = découverte par `find` · `mécanisme GitLab` = énumération manuelle

## Critères d'acceptation
- [x] GitLab lance **les 23** fichiers, mesuré, et le nombre est **découvert**, pas écrit
- [x] Un fichier de test neuf est lancé **sans modifier le fichier de CI** — vérifié en
      ajoutant un fichier jetable et en constatant qu'il est pris
- [x] Le job **échoue** si la découverte ne rend aucun fichier — mesuré
- [ ] GitLab est rouge **tant que `bug-018` n'est pas corrigé**, et verte après —
      c'est la preuve que les deux forges mesurent enfin la même chose
- [ ] Aucune énumération manuelle de fichiers de test ne subsiste dans le dépôt.
      ⚠️ **Non satisfait, et volontairement** : **3** énumérations subsistent de
      chaque côté (`tests/test_update_kit.py`, `test_harnais_kit.py`,
      `test_sync_copilot_agents.py`). Elles sont **symétriques entre les deux
      forges** — donc elles ne produisent pas l'écart que cette spec corrige —
      et le « Hors périmètre » les exclut explicitement. Le critère était rédigé
      plus largement que le périmètre : c'est le critère qui était trop large,
      pas le correctif trop étroit. **Candidat à une spec dédiée.**

## Hors périmètre
- Les tests de `tests/` (`test_update_kit.py`, `test_harnais_kit.py`,
  `test_sync_copilot_agents.py`), lancés par `unittest` sur les deux forges et
  dont l'énumération est un choix distinct — à examiner, pas à corriger ici
- Le contenu des tests eux-mêmes : c'est `bug-018`

---
## Journal de bord

<!-- UNE ligne par étape, écrite QUAND L'ÉTAPE TOMBE, jamais à la clôture.
     Horodatage · étape · agent · verdict · preuve chiffrée ou livrables. -->

- [2026-09-20 20:28] Création et promotion — agent principal — spec écrite puis promue
  directement dans `doing/` **sur décision humaine**, au titre d'`ADR-0017` :
  le défaut désarme la garde que le cycle de `bug-018` livre. Le cycle porte
  désormais **trois** specs dans `doing/` (`feature-021`, `bug-018`, `bug-019`)
  avec **une seule** phase de test, revue et documentation.
  Découvert par l'`architect` pendant l'arbitrage de `bug-018`, **vérifié par
  mesure** : 23 fichiers de test sous `control-center/`, **6** lancés par
  GitLab, **17 manquants** dont les deux qui échouent. `check_specs.sh` vert,
  45 specs, aucun doublon.
- [2026-09-20 20:33] Correctif — agent principal — `.gitlab/ci/hygiene.yml` : l'énumération
  des six fichiers est remplacée par une **découverte** `find control-center
  -type f -name 'test_*.py' | sort`. Mesuré : **0** énumération restante,
  **23** fichiers découverts.
  ⚠️ Écrit en **POSIX, pas en bash** : l'image est `alpine:3.20` et le `script:`
  de GitLab tourne en `sh` — le `mapfile` du workflow GitHub est une primitive
  bash et n'y passerait pas. La boucle lit depuis un fichier, jamais depuis un
  tube, pour qu'un échec reste visible hors du sous-shell.
  **Trois branches vérifiées par EXÉCUTION**, pas par lecture : `control-center/`
  absent → `exit 0` ; présent mais aucun test découvert → **`exit 1`** avec motif ;
  un test en échec parmi trois → les trois lancés, le fautif **nommé**, `exit 1`.
  `sh -n` valide sur le bloc extrait (33 lignes).
  ⚠️ **Faux vert évité pendant ce travail** : ma première extraction du bloc
  n'a sorti qu'une ligne vide, et le `sh -n` a donc « validé » du néant. Un
  contrôle qui passe sur du vide est exactement le défaut que ce cycle corrige.
  Le commentaire du job est réécrit : il présentait « ces six fichiers » comme
  un choix. Reste à faire : la preuve finale est que GitLab soit **rouge** tant
  que `bug-018` n'est pas corrigé, puis verte — les deux forges mesurant enfin
  la même chose.
- [2026-09-20 21:09] ⚠️ **FAUX VERT TROUVÉ DANS LE CORRECTIF LUI-MÊME** — relevé par
  `code-reviewer`, **reproduit puis corrigé** par l'agent principal.
  La boucle `while … done < "$liste"` partageait son `stdin` avec les tests :
  un test qui lit `stdin` avalait le reste de la liste. Mesuré : **4 fichiers
  découverts, 2 exécutés**, sortie « ✅ 4 fichier(s) … tous verts », code **0**.
  Un faux vert dans le code écrit pour corriger un faux vert — je n'avais
  éprouvé la boucle que sur des tests qui ne lisent pas `stdin`.
  **Correctif** : `python3 "$fichier" < /dev/null`, **plus** un comparatif
  EXÉCUTÉS contre DÉCOUVERTS qui fait échouer le job s'ils diffèrent — annoncer
  un compte qu'on n'a pas lancé est précisément le défaut que ce job ferme.
  Revérifié : le cas qui avalait `stdin` donne désormais **4 découverts,
  4 exécutés** ; les trois autres branches (absent → 0, liste vide → 1, test
  rouge → 1) tiennent toujours ; `sh -n` valide sur 51 lignes.
