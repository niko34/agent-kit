# Bug — La rédaction du collecteur laisse passer un mot de passe entièrement en minuscules

- **Type** : bug
- **Statut** : done
- **Priorité** : haute
- **Version cible** : [à fixer par l'agent qui reprend cette spec]
- **Créée** : 2026-09-15 (audit de sécurité en rôle AUDIT, étape `S1` de `feature-010`)
- **Domaine** : collecteur d'événements (`control-center/hooks/record-event.py`)
- **Spec(s) liée(s)** : `bug-012` (deux premières classes fermées), `ADR-0020`

## Agents requis

- [x] architect
- [x] **security-reviewer, rôle GATE** — secrets journalisés puis servis au
      navigateur ; si le correctif touche la table des champs publics,
      basculer sur le template feature complet
- [x] backend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Symptôme observé

Exécution directe de `_command_head()` (`record-event.py:82-121`), le 2026-09-15 :

```
'mysql -psecretword -h db'         -> 'mysql -psecretword'      ← fuite
'sshpass -phunterpass ssh host'    -> 'sshpass -phunterpass'    ← fuite
'curl -uadmin http://x'            -> 'curl -uadmin'            ← fuite
'echo hunterpass | sudo -S reboot' -> 'echo hunterpass'         ← fuite
'printf secretphrase > f'          -> 'printf secretphrase'     ← fuite
'mysql -pSecret1 -h db'            -> 'mysql'                   (le chiffre sauve)
'echo hunter2 | sudo -S reboot'    -> 'echo'                    (cas documenté comme fermé)
```

Le secret atterrit dans `var/agent-events.jsonl`, **mode 0644**, champ
`command_head` — qui figure dans `_CHAMPS_PUBLICS` (`server.py:136-138`) et
part donc **vers le navigateur**, puis s'affiche sur le tableau de bord.

La contrainte n°3 de l'en-tête du hook — « il ne doit jamais recopier de
secret » — est donc violée sur la forme la plus banale qui soit.

## Cause racine

`_SECOND_JETON` (`record-event.py:79`) accepte :
- tout `-` suivi de **lettres**, donc une option **collée à sa valeur** ;
- tout mot en **minuscules** de 24 caractères ou moins.

Le commentaire des lignes 74-78 annonce qu'« un chiffre ou une majuscule suffit
désormais à l'écarter ». C'est exact — et c'est précisément le problème : le cas
réputé fermé (`hunter2`) ne l'était **que par son chiffre**. Un mot de passe
entièrement en minuscules — une passphrase, un mot du dictionnaire — est la
forme la plus courante et passe intégralement.

> **La garde protège contre l'exemple, pas contre la classe.** C'est le
> troisième passage sur cette même fonction ; les deux premiers ont fermé des
> cas, jamais la famille.

## Correctif attendu

La classe **ne se ferme pas** par un motif plus fin sur le second jeton : toute
valeur alphabétique en minuscules est indiscernable d'une sous-commande
légitime (`git status`, `npm run`, `docker ps`). L'architecte doit trancher
entre deux options, et **écrire le motif du refus** de l'autre :

- **Option A** — option courte limitée à **une seule lettre** (`^-[A-Za-z]$`),
  et second mot nu retenu seulement pour une **liste fermée** de premiers
  jetons connus pour porter une sous-commande (`git`, `npm`, `docker`, `pio`…).
  ⚠️ Heurte la contrainte n°4 de l'en-tête du hook : « il ne connaît rien du
  projet ». À arbitrer explicitement, pas à contourner.
- **Option B** — ne journaliser que le **premier** jeton, et adapter
  `config.tetes_de_commande()` (`config.py:275-293`) en conséquence. Perd de
  l'information d'observation, ne peut plus fuir.

## Le journal existant

Le journal réel est vivant depuis plusieurs jours et n'a **pas** été inspecté —
l'audit s'est imposé la lecture seule. **Première mesure de ce cycle** : chercher,
sur un **instantané figé**, si un secret de cette classe y figure déjà. Ce que
l'on fait du résultat — purge, re-rédaction, ou rien — est une décision à part
entière, à écrire ici avant d'agir.

## Critères d'acceptation

- [x] Les cinq formes du symptôme ci-dessus ne laissent plus rien fuir, chacune
      couverte par un test **vu échouer** sur le code d'avant le correctif —
      trace réelle rendue en étape 7bis (`git show HEAD:record-event.py`, 21
      échecs dont les 5 `test_symptome_*`)
- [x] Une sous-commande légitime (`git status`, `npm run build`, `docker ps`)
      reste lisible dans `command_head` — sinon le collecteur perd sa raison d'être
- [x] L'arbitrage entre option A et option B est **écrit**, avec le motif du refus
      (design-bug-014, étape 3 : variante A′ retenue, ADR-0028)
- [x] Un instantané figé du journal réel a été **mesuré**, et la décision sur
      l'existant est consignée (M1/M2, rejoué sur les résidus en condition 6 du GATE P1)
- [x] `_lancer()` (`server.py:1121`) journalise `argv[:2]` **sans passer par la
      rédaction** : soit il y passe, soit l'écart est justifié par écrit — D3 :
      `_lancer()` passe désormais par `command_head()`, fuite réelle du TOML non
      versionné démontrée comme motif
- [x] Suite verte, compte de cas strictement supérieur à l'entrée (1817 → 1857 cas, 0 échec)
- [x] Validation par mutation sur chacune des cinq formes (9 mutants posés sur la garde
      en étape 7bis, 0 survivant ; 6 mutants reposés indépendamment par code-reviewer, 6 tués ;
      1 mutant reposé par code-reviewer sur le correctif final, tué par exactement les 5 tests neufs)

## Hors périmètre

- La purge du journal existant, si elle est décidée : elle fera sa propre spec,
  parce qu'elle détruit des données et exige un plan de retour arrière.
- Le chiffrement du journal au repos.

---

## Grandeurs mesurées à l'entrée du cycle

Mesures faites par l'agent principal le 2026-09-19, avant tout correctif.

### Suites de tests à l'entrée
- `control-center/hooks/test_record_event.py` : **19 cas, 0 échec**
- Suite du module : **23 fichiers** `test_*.py`, ≈ **1817 cas en root**
- **4 échecs connus en CI / non-root** : `test_jeton.py` (3) et `test_server_bug012.py` (1).
  C'est `bug-018`, **hors périmètre** de ce cycle : à nommer et à laisser inchangés.

### M1 — Instantané figé du journal réel

Deux journaux mesurés, car le même hook instrumente les deux dépôts.

| | kit (`agent-kit`) | firmware (`esp32-pool-controller`) |
|---|---|---|
| instantané | 2026-09-19 19:17, 5 827 070 o, mode 0644 | 2026-09-19 16:32, 2 294 061 o, mode 0644 |
| sha256 de l'instantané | `1aa165a20bbad960b0bc36f53bdd13e2533411e4bd07509f6cf9154f64adf6cf` | — |
| lignes | 13 278 | — |
| lignes illisibles | 0 | — |
| événements avec `command_head` | 7 857 | 3 085 |
| têtes distinctes | 362 | — |
| 1 jeton seul | 3 244 (41,3 %) | 961 (31,2 %) |
| 2e jeton = option | 3 232 occ / 92 formes | 1 324 occ / 62 formes |
| 2e jeton = **sous-commande porteuse** (`git`, `gh`, `pio`, `npm`, `docker`, `pip`…) | **676 occ (8,6 %) / 29 formes** | **230 occ (7,5 %) / 20 formes** |
| 2e jeton = mot nu non porteur — **le vecteur de fuite** | 705 occ / 173 formes | 570 occ / 97 formes |

Recherche des cinq formes du symptôme, par classe :

| forme du symptôme | occurrences suspectes, kit | occurrences suspectes, firmware |
|---|---|---|
| option courte collée à sa valeur (`-p…`, `-u…`, `-P…`) | **0** — les 23 formes à simple tiret sont des grappes de drapeaux légitimes (`grep -rn`, `ls -la`, `rm -rf`, `find -iname`, `ss -ltnp`…) | **0** |
| second mot nu en minuscules portant un secret | **0** — les 173 formes non porteuses sont du bruit de shell (`for f`, `cd grep`, `cp diff`, `echo <mot français>`) | **0** |

Contrôles complémentaires :
- le jeton réel de `/root/.kit-jeton` (65 o) : **0 occurrence** dans chacun des deux instantanés
- aucun champ ne porte `passw|secret|token|jeton|apikey|api_key`

**Conclusion M1 : non — aucun secret de cette classe ne figure dans les journaux réels.**
Aucune valeur suspecte n'a donc eu à être citée, masquée ou recopiée.

### M2 — Décision sur l'existant

**Rien.** Ni purge, ni re-rédaction.

Motif : la mesure ci-dessus est exhaustive sur les deux journaux vivants et ne trouve
aucune occurrence de la classe. Purger détruirait des données d'observation réelles pour
corriger un risque qui ne s'est pas matérialisé, et exigerait un plan de retour arrière
pour rien. La spec de purge envisagée en « Hors périmètre » devient **sans objet** — si un
secret apparaît plus tard, il sera pris par le correctif, pas par une purge rétroactive.

Conséquence : les journaux réels restent en **lecture seule** pendant tout le cycle.

### Ce que la mesure apporte à l'arbitrage D1

- Le second jeton n'apporte de l'information que dans **8,6 %** des événements, et ~98 %
  de cette information tient dans `git` / `gh` / `pio`.
- Les mots nus non porteurs sont à la fois **le bruit majoritaire** et **toute la surface
  de fuite** restante.
- Coût chiffré de l'option A telle qu'écrite : le motif `^-[A-Za-z]$` détruirait
  **~297 occurrences** de grappes de drapeaux légitimes (`grep -rn` 96, `ls -la` 62,
  `rm -rf` 36, `diff -rq` 13, `grep -rl` 12, `grep -rln` 12, `find -iname` 9, `find -name` 9,
  `ss -ltnp` 8…). À arbitrer : une option à plusieurs lettres SANS valeur collée reste
  possible à distinguer d'une option collée à une valeur.

---

## Check-list du cycle (figée à l'étape 0 par l'orchestrator)

- [x] M1 — Instantané FIGÉ du journal réel (copie vers le scratchpad, jamais dans le dépôt) : compter les lignes, puis chercher dans le champ `command_head` les cinq formes du symptôme. Rapporter CLASSE + COMPTE + numéros de ligne, JAMAIS la valeur trouvée (la spec est versionnée, le rapport aussi).
- [x] M2 — Décision écrite sur l'existant (purge / re-rédaction / rien), consignée dans la spec AVANT tout correctif. Si purge : elle fait sa propre spec (hors périmètre).
- [x] M3 — Comptes de cas d'entrée consignés dans la spec (19 cas sur le hook ; 23 fichiers ; 4 échecs CI connus nommés).
- [x] D1 — Arbitrage option A / option B ÉCRIT, avec le MOTIF DU REFUS de l'autre.
- [x] D2 — Verdict ADR explicite (oui/non) contre les 4 critères du kit.
- [x] D3 — Décision écrite sur `_lancer()` (`server.py:1177`, `"command_head": " ".join(argv[:2])`) : soit il passe par la rédaction, soit l'écart est justifié PAR ÉCRIT dans le code.
- [x] D4 — Décision écrite sur le PARTAGE du code de rédaction entre le hook et `server.py` (module commun / duplication / rien), sous la contrainte « le hook ne doit jamais échouer, y compris à l'import » et la contrainte n°4 « il ne connaît rien du projet ».
- [x] A1 — `_command_head()` : les cinq formes du symptôme ne laissent plus rien fuir.
- [x] A2 — `git status`, `npm run build`, `docker ps` restent lisibles dans `command_head` (ou, si option B, la perte est assumée et écrite — voir A6).
- [x] A3 — En-tête et commentaires de `record-event.py` (lignes 70-79 et docstring 82-121) corrigés : ils affirment aujourd'hui qu'« un chiffre ou une majuscule suffit […] et ferme la classe entière », ce qui est faux.
- [x] A4 — `_lancer()` mis en conformité avec D3.
- [x] A5 — (option A seulement) motif `^-[A-Za-z]$` + liste fermée de premiers jetons porteurs de sous-commande, et arbitrage de la contrainte n°4 inscrit dans l'en-tête. *(variante A′ retenue, pas A littérale — motif inscrit dans le module et l'en-tête du hook)*
- [ ] A6 — (option B seulement) — **sans objet** : option B refusée (D1).
- [x] S1 — GATE P1 : verdict écrit (GO / GO SOUS CONDITIONS / NO GO) sur le design.
- [x] S2 — GATE P2 : verdict écrit sur le diff réel.
- [x] T1 — Un test par forme du symptôme (5), chacun VU ÉCHOUER sur le code d'avant.
- [x] T2 — Test de non-régression sur les sous-commandes légitimes.
- [x] T3 — Test sur le chemin `_lancer()` conforme à D3.
- [x] T4 — Campagne de mutation sur les CINQ formes, mutants posés sur LA GARDE elle-même.
- [x] T5 — Suite complète mesurée (23 fichiers) ; compte de cas STRICTEMENT supérieur à l'entrée ; les 4 échecs `bug-018` nommés et inchangés ; tout test neuf touchant des permissions mesuré AUSSI en non-root.
- [x] R1 — Revue de code : verdict Approved / Request changes.
- [x] C1 — `control-center/README.md`, section « La redaction, et pourquoi elle a deux gardes » (l.177 — la spec citait ~165-203, périmé ; le TITRE lui-même devient faux, trois formes acceptées) : le tableau et le « deux règles, et il faut les deux » sont périmés par ce correctif. *(section réécrite, titre corrigé, résidus nommés)*
- [x] C2 — ADR créé si D2 = oui (prochain numéro libre : 0028). *(`docs/adr/0028-la-tete-de-commande-garde-deux-jetons-et-un-seul-module-decide-du-second.md`, indexé dans `docs/adr/README.md`)*
- [x] C3 — `CHANGELOG.md` : comportement observable changé (ce qui s'affiche sur le tableau de bord et ce qui n'est plus journalisé).
- [x] C4 — `docs/features/page-centre-de-controle.md` si l'affichage change (option B : `$ pio` au lieu de `$ pio test`). *(sans objet — cette doc décrit la structure de la page, jamais le texte littéral de `command_head` rendu dans le journal d'événements ni le format du survol `wf.commandes` : rien n'y devient faux ; voir rapport doc-writer)*
- [x] C5 — `control-center/PIEGES.md` : entrée ajoutée, entrée retirée, ou « aucun piège neuf » ÉCRIT dans le rapport de `doc-writer`. *(4 entrées ajoutées, §40-43)*
- [x] C6 — Spec enrichie : journal de bord complet, décision M2, arbitrage D1, notes d'implémentation, puis `git mv` vers `specs/features/done/`. *(enrichissement fait par doc-writer ; le `git mv` vers `done/` reste à la charge de l'agent principal)*

### Condition 6 du GATE P1 — M1 rejoué sur les deux résidus

Rejeu mécanique du 2026-09-19, sur les **mêmes instantanés**, pour les deux formes que le
GATE a trouvées encore ouvertes. Les deux instantanés sont désormais prouvés figés :

| | lignes | sha256 |
|---|---|---|
| kit | 13 278 | `1aa165a20bbad960b0bc36f53bdd13e2533411e4bd07509f6cf9154f64adf6cf` |
| firmware | 5 275 | `c7a8ea9d3e992929c162c86a8e778c96dd1935efb570b27f48a88a6b16f554d0` |

(La réserve du GATE sur l'instantané firmware — « ni sha256 ni compte de lignes, non prouvé
figé » — est levée par cette ligne.)

| résidu | kit | firmware | verdict |
|---|---|---|---|
| **condition 1** — option longue à valeur collée (`--motx`) | 9 formes, 28 occ | 3 formes, 4 occ | **0 secret** : toutes sont `--version`, `--check`, `--help`, `--write` |
| **condition 2** — tête d'UN jeton non filtré (le `continue` décale les positions) | 36 formes | 26 formes | **0 secret** : toutes sont des noms de programme (`cd` 1 410, `cat` 354, `ls` 221, `cp` 212, `echo` 163…) |

**Conclusion : la décision M2 (« rien ») tient aussi pour les deux résidus découverts en P1.**
Aucun secret n'a eu à être cité, masqué ou recopié.

---

## Notes d'implémentation (ajoutées par doc-writer à la clôture)

### D1 — Arbitrage (architect, étape 3)

Variante **A′** retenue (ni A littérale, ni B) : second jeton accepté sous
trois formes bornées (option courte 1-2 lettres, option longue, mot nu
derrière un programme à sous-commande d'une liste fermée mesurée). Motif du
refus de B, chiffré : sous B, `config.tetes_de_commande()` ne remet pas les
comptes à zéro mais les **sur-compte d'un facteur 8,4** (44 → 371 sur
l'instantané réel), en comptant tout `python3 script.py` ad hoc comme un
lancement configuré — en plus de détruire 58,9 % de l'information. Coût
chiffré d'A′ : 776 occ / 9,81 % perdent leur second jeton, contre 1 019
(12,9 %) pour A littérale et 4 655 (58,9 %) pour B. Détail complet, y compris
la contrainte n°4 du hook arbitrée par trois garde-fous inscrits dans le
code : [ADR-0028](../../../docs/adr/0028-la-tete-de-commande-garde-deux-jetons-et-un-seul-module-decide-du-second.md).

### D2 — ADR

**Oui**, 4 critères sur 4 (contrainte structurante, décision invisible dans
le code, alternatives crédibles mesurées, verrouillage long terme) —
[ADR-0028](../../../docs/adr/0028-la-tete-de-commande-garde-deux-jetons-et-un-seul-module-decide-du-second.md).

### D3 — `_lancer()`

Passe désormais par la même rédaction que le hook. Motivé par une fuite
**réelle**, pas hypothétique : `control-center/control-center.toml` n'est
pas versionné ; une entrée locale de déploiement portant une variable
d'environnement type `POOL_PASSWORD=x` y produisait un `command_head`
journalisé et servi au navigateur, sans passer par aucune garde. Zéro effet
sur la configuration réelle du projet une fois corrigé.

### D4 — Partage du code

Module neuf et unique `control-center/hooks/redaction_commande.py`, importé
sous enveloppe par le hook (`try/except BaseException` couvrant l'import
lui-même), repli fermé `command_head = lambda _c: None` — jamais une
seconde copie de la règle. `backend/config.py` l'importe sans enveloppe
(échec visible côté serveur, assumé).

### Les cinq formes du symptôme, retrouvées à cinq échelons du cycle

1. Design (étape 3) : les cinq formes de la spec fermées par construction,
   vérifié par exécution sur 38 formes.
2. GATE P1 (étape 4) : deux résidus supplémentaires trouvés que le design
   croyait fermés (option longue à valeur collée ; décalage de position en
   tête, non filtré).
3. GATE P2 (étape 6) : le résidu « décalage en tête », revendiqué fermé,
   ne l'était pas sur la classe (majuscule/chiffre traversaient encore) —
   resserré en étape 5bis.
4. GATE P2 re-verdict (étape 6bis) : quatrième forme mineure trouvée
   (`.hunterpass` sans barre) — resserrée en étape 7.
5. Revue de code (étape 8) : cinquième forme — un écart **intercalaire**
   (entre position 1 et 2) ne réinitialisait pas le passe-droit de
   sous-commande (`git PASSWORD=x hunterpass` → `git hunterpass`) — fermée
   en étape 5ter, re-vérifiée et approuvée en étape 8bis.

### Verdicts des GATE et des revues

- GATE P1 (étape 4) : **GO SOUS CONDITIONS**, 6 conditions.
- GATE P2 (étape 6) : **GO SOUS CONDITIONS**, condition bloquante n°1.
- GATE P2 re-verdict (étape 6bis) : **GO SOUS CONDITIONS**, condition n°1 levée, n°2 et n°3 restantes.
- GATE P2 final (étape 6ter) : **GO SOUS CONDITIONS**, condition n°2 levée par oracle + énumération exhaustive de 1 082 400 commandes ; seule la n°3 (doc) reste ouverte pour l'étape 9.
- Revue de code (étape 8) : **REQUEST CHANGES**, 2 bloquants (5e forme, 3 tests T1 verts sur le code d'avant).
- Revue de code (étape 8bis) : **APPROVED**, avec réserve documentée sur la portée de l'oracle de validation (voir ADR-0028).

### Réserve à retenir

L'oracle de validation utilisé en revue prouve la **conformité règle↔code**,
pas l'**absence de fuite** — ses clauses promeuvent en légitimes les résidus
déjà assumés par écrit. Voir ADR-0028, section dédiée.


---
## Journal de bord

<!-- UNE ligne par étape du workflow, écrite QUAND L'ÉTAPE TOMBE, jamais à la
     clôture. Horodatage · étape · agent · verdict · preuve chiffrée ou livrables. -->


- [2026-09-19 19:24] Étape 1 — spec-reader — spec promue todo/→doing/ par `git mv` ; 4 fichiers touchés, 4 lecteurs indirects de `command_head` ; GATE requis confirmé ; check_specs 0 (39 specs), check_doc_links 0 (103 liens) — livrables M3
- [2026-09-19 19:17] Étape 2 — agent principal — M1 mesuré sur DEUX instantanés figés (kit 13 278 l. / sha256 1aa165a2… ; firmware 3 085 têtes) : 0 occurrence des cinq formes, 0 occurrence du jeton réel, 0 champ marqué secret. M2 = RIEN (ni purge ni re-rédaction), motif écrit — livrables M1, M2
- [2026-09-19 19:33] Étape 3 — architect — **variante A′ retenue** (2e jeton : option ≤2 lettres, option longue, ou mot nu derrière un programme à sous-commandes) ; option B REFUSÉE, motif mesuré : elle ne remet pas les comptes à zéro mais les SUR-COMPTE d'un facteur 8,4 (44 → 371) en plus de détruire 58,9 % de l'information. Coût d'A′ mesuré : 776 occ / 9,81 % perdent leur 2e jeton, contre 1 019 pour l'option A littérale. ADR-0028 = OUI, 4 critères sur 4. D3 : `_lancer()` passe par la rédaction — fuite réelle démontrée (`env POOL_PASSWORD=x` via un `control-center.toml` NON VERSIONNÉ). D4 : module neuf `hooks/redaction_commande.py`, import enveloppé, repli fermé `lambda: None` — livrables D1, D2, D3, D4
- [2026-09-19 19:47] Étape 4 — security-reviewer GATE P1 — **GO SOUS CONDITIONS**, 6 conditions numérotées. Motif A′ EXÉCUTÉ sur 38 formes : les 5 formes du symptôme sont fermées, 2 résidus trouvés que le design croyait fermés — (1) option longue à valeur collée `--passwordx` passe encore, (2) le `continue` décale les positions et le 1er jeton retenu n'est jamais filtré (`POOL_PASSWORD=x hunterpass` → `hunterpass`). 3e lecteur manqué par le design : `config.py:381`. `_CHAMPS_PUBLICS` non touché → template minimal suffit — livrables S1
- [2026-09-19 19:52] Étape 4bis — agent principal — condition 6 levée : M1 rejoué sur les deux résidus P1, sur instantanés prouvés figés (kit 13 278 l. / `1aa165a2…` ; firmware 5 275 l. / `c7a8ea9d…`). Résidu 1 : 12 formes / 32 occ, toutes `--version|--check|--help|--write`, 0 secret. Résidu 2 : 62 formes, toutes des noms de programme, 0 secret. M2 « rien » tient — livrables M1 (rejoué), condition P1 n°6
- [2026-09-19 20:06] Étape 5 — backend-developer — A′ implémenté ; module neuf `hooks/redaction_commande.py` (seule règle, appelée par les 3 lecteurs), import enveloppé + repli fermé, `_lancer()` et `tetes_de_commande()` passent par la même fonction. Résidu P1 n°2 **FERMÉ** (`_admis_comme_premier_jeton_decale`) ; résidu P1 n°1 **assumé par écrit**. Diff : 4 fichiers + 1 neuf, +211/−65. ⚠️ **Suite du hook ROUGE : 19 cas, 4 échecs** — vérifié par l'agent principal, pas seulement rapporté — livrables A1-A5, D4, conditions P1 n°1/2/3/5
- [2026-09-19 20:06] Étape 5 — constat à trancher en étape 7 — le harnais `test_record_event.py` ne copie QUE `record-event.py` dans son dossier temporaire : sans `redaction_commande.py`, le repli rend `None` partout. Mais au moins un des 4 échecs (`test_affectation_en_tete`) est un **vrai changement de comportement assumé** d'A′ (`./ota_update.sh firmware` → `./ota_update.sh`). Les 4 échecs ne sont donc PAS tous imputables au harnais : à démêler un par un, pas en bloc
- [2026-09-19 20:22] Étape 6 — security-reviewer GATE P2 — **GO SOUS CONDITIONS**. 7 points vérifiés par exécution : 5 formes fermées, `_CHAMPS_PUBLICS`/`_ROUTES_ECRITURE` à 0 ligne de diff, repli d'import → exit 0 sous 4 pannes distinctes (module absent / syntaxe cassée / sans fonction / illisible en `nobody`), `sys.path` backend idx 0-1 et hooks idx 8-9. **Condition bloquante n°1 : le résidu n°2 n'est PAS fermé sur la classe** — `A=b Hunterpass` → `Hunterpass`, `a:b hunter_pass` → `hunter_pass` ; la docstring contredit le code. Reboucle vers étape 5bis — livrables S2 (partiel)
- [2026-09-19 20:31] Étape 5bis — backend-developer — condition P2 n°1 traitée par **RESSERRAGE** (issue préférée, pas l'aveu écrit) : en position décalée, seules une option ou un chemin (`/…`, `./…`) sont admis. Les 3 contre-exemples du GATE rendent `None` — **revérifié par l'agent principal en exécution directe**, avec les 5 formes du symptôme et les 9 formes de non-régression. Chiffrage du coût : **0 tête déjà journalisée affectée** (un jeton porteur de `=`/`:` n'atteint jamais le journal). Incohérence hook/module alignée. Suite existante rejouée : 230 cas, 0 échec — livrables A1 (resserré), condition P2 n°1
- [2026-09-19 20:38] Étape 6bis — security-reviewer GATE P2 — **GO SOUS CONDITIONS**, condition bloquante n°1 **LEVÉE**. Resserrage éprouvé en exécution : option+décalage fermé (`A=b -x hunterpass` → `-x`, `A=b -- hunterpass` → `None`), double écart fermé, alignement hook/module vérifié de visu. **Quatrième forme trouvée, mineure** : `A=b .hunterpass` → `.hunterpass` (le critère « commence par `.` » admet un jeton sans barre) — cosmétique, à resserrer en étape 7 avec un test qui la nomme. Chemin sensible (`A=b /etc/shadow` → `/etc/shadow`) jugé acceptable, hors classe. Restent les conditions 2 (étape 7) et 3 (étape 9) — livrables S2
- [2026-09-19 20:58] Étape 7 — test-engineer — **23 fichiers, 1852 cas, 0 échec** (mesuré indépendamment par l'agent principal, pas repris du rapport) ; hook 19 → **52 cas** (+33), `test_config.py` 59 → 61. **8 mutants posés, 8 tués**, une invocation par mutant, `__pycache__` purgé et md5sum vérifié à chaque fois — mais **3 d'entre eux ont survécu au premier essai** et ont forcé 3 tests neufs. 4 échecs d'entrée démêlés un par un : 2 (a) harnais, 1 (b) contrat re-basé en le disant, 1 mixte éclaté en assertions épinglées. Correctif T3ter appliqué (4e résidu fermé). Journal réel intact — livrables T1, T2, T2bis, T3, T3bis, T3ter, T4, T5, condition P2 n°2
- [2026-09-19 20:58] Étape 7 — découverte par mutation, pas par relecture — les tests du symptôme utilisaient le faux secret `Pw4x` (majuscule + chiffre) : court, donc sous le plafond, mais écarté par `_MOT_NU` avant d'atteindre la garde. Ils n'exerçaient **jamais** la classe « entièrement en minuscules » — le titre même du bug. Révélé par le mutant « ajouter `echo` à la liste », qui ne tuait rien
- [2026-09-19 21:14] Étape 8 — code-reviewer — **REQUEST CHANGES**, 2 points bloquants. (1) **CINQUIÈME forme** : l'écart ne réinitialise `premier_jeton` qu'en position 1, donc un écart INTERCALAIRE garde le passe-droit — `git PASSWORD=x hunterpass` → `git hunterpass`, 6 programmes concernés, vérifié bout en bout jusqu'à la ligne 0644. (2) **3 des 5 tests T1 étaient VERTS sur le code d'avant** : le faux secret `Pw4x` a été corrigé sur les formes 4-5 et pas balayé sur 1-3 → critère d'acceptation n°1 non tenu tel qu'écrit. Mutation refaite indépendamment : 6 mutants sur la garde, 6 tués. Aucun §30, aucun test supprimé ni assoupli. Reboucle vers étape 5ter — livrables R1 (refusé)
- [2026-09-19 21:26] Étape 5ter — backend-developer — **cinquième forme FERMÉE** : `premier_jeton if not ecart_survenu else None` au site unique. **Revérifié par l'agent principal en exécution** : les 7 programmes de la liste fermée rendent le premier jeton seul sur la forme intercalaire (`git PASSWORD=x hunterpass` → `git`), et les 14 formes de non-régression tiennent (`git status`, `pio test`, `./ota_update.sh`, `curl --passwordx` = résidu 1 assumé). Titre `:53` désaffirmé (deux étapes datées, plus de « fermé sur la CLASSE »). 3 mineures traitées : justification élargie aux 3 déclencheurs de `continue`, comptes lettres/caractères corrigés, garde morte retirée avec commentaire — livrables A1 (5e forme), mineures de l'étape 8
- [2026-09-19 21:42] Étape 7bis — test-engineer — bloquant 2 corrigé + **balayage complet** : **4** faux secrets masqués par une garde en amont, pas 3 — le 4e (`test_second_jeton_positionnel_ecarte`) trouvé par le sweep, pas par la revue, et confirmé par mutation. Trace réelle du « vu échouer » rendue : les 5 formes avec `hunterpass` fuient TOUTES sur `record-event-avant.py`. 5e forme couverte (5 tests, un par déclencheur × programme) ; mutant « retirer `if not ecart_survenu` » tué par les 5. **Campagne rejouée intégralement : 9 mutants, 0 survivant.** Suite **23 fichiers, 1857 cas, 0 échec** — remesurée par l'agent principal ; hook 52 → 57. `check_specs`=0, `check_doc_links`=0 — livrables T1 (réel), T4 (rejoué), T5
- [2026-09-19 21:52] Étape 6ter — security-reviewer GATE P2 — **GO SOUS CONDITIONS**, seule la n°3 (doc, étape 9) reste ouverte. **Sixième forme cherchée MÉCANIQUEMENT, non trouvée** : au lieu d'exemples, un ORACLE (un jeton de sortie n'est légitime que s'il est le 1er jeton, une option, un chemin `/`·`./`·`../`, ou un mot nu en position 2 réelle derrière un programme listé sans écart avant lui) + énumération exhaustive de **1 082 400 commandes** (longueur 1 à 4, alphabet de 32 jetons) → **zéro jeton hors oracle**. Combinaisons confirmées : `git A=b -x hunterpass` → `git -x`, `A=b ./x A=b hunterpass` → `./x`, `git -c a=b status` → `git -c`. Seuls survivants : les résidus déjà assumés. Titre `:53` vérifié exact contre le code. Condition n°2 LEVÉE (hook 57 cas 0 échec, exécuté par le GATE) — livrables S2 (final)
- [2026-09-19 22:05] Étape 8bis — code-reviewer — **APPROVED**. Bloquants vérifiés sur le code : oracle **réimplémenté et réénuméré indépendamment** (1 082 400 commandes, 0 hors oracle) ; mutant posé sur le correctif lui-même tué par exactement les 5 tests neufs ; suite courante contre `git show HEAD:record-event.py` → **21 échecs** dont les 5 `test_symptome_*`, donc le « vu échouer » est réel. 8 mutants reposés par le reviewer, 8 tués. **Réserve à graver dans l'ADR** : l'oracle prouve la conformité règle↔code, PAS l'absence de fuite — ses clauses (2)(3) promeuvent en légitimes les résidus assumés, et la clause (1) (le vrai premier jeton passe quelle que soit sa forme) est adossée à une observation passée, pas à une propriété : `"hunterpass" x` → `"hunterpass"` traverse — livrables R1
- [2026-09-19 22:20] Étape 9 — doc-writer — ADR-0028 créé et indexé (arbitrage A′ + motifs de refus A et B, D3, D4, **et la réserve sur la portée de l'oracle écrite telle quelle**) ; `control-center/README.md:177+` réécrit (titre « deux gardes » périmé corrigé, 3 formes admises, 2 résidus nommés) ; `CHANGELOG.md` [Non publié] ; `PIEGES.md` §40-43, aucune entrée retirée ; C4 **sans objet motivé** (la fiche de page ne cite aucun format littéral de `command_head`, vérifié par grep). `check_specs`=0, `check_doc_links`=0 — livrables C1, C2, C3, C4, C5, C6
- [2026-09-19 22:24] Étape 10 — agent principal — clôture vérifiée **sur le diff, pas sur les rapports** : suite **23 fichiers / 1857 cas / 0 échec** ; `check_specs`=0 ; `check_doc_links`=0 ; jeton réel **0 occurrence** dans le diff, le module neuf, l'ADR et la spec ; `_CHAMPS_PUBLICS` et `_ROUTES_ECRITURE` à 0 ligne de diff ; journal réel **intact** (lecture seule tenue tout le cycle) ; une seule case `[ ]` restante, A6, marquée sans objet motivé (option B refusée). Spec déplacée par `git mv` vers `done/`

## Statut final

✅ **Done** — 2026-09-19 — non commité (le commit et le push attendent un feu vert explicite de l'humain)

Cinq formes de fuite trouvées à **cinq échelons successifs** (GATE P1 ×2, GATE P2, re-verdict
P2, revue de code), **toutes par exécution, aucune par relecture**. La sixième a été cherchée
mécaniquement — oracle + énumération exhaustive de 1 082 400 commandes, réimplémentée
indépendamment par le reviewer — et n'a pas été trouvée. Cette preuve établit la **conformité
règle↔code**, pas l'absence de fuite : la réserve est écrite dans l'ADR-0028.
