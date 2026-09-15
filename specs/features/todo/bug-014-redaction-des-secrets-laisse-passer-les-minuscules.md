# Bug — La rédaction du collecteur laisse passer un mot de passe entièrement en minuscules

- **Type** : bug
- **Statut** : todo
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

- [ ] Les cinq formes du symptôme ci-dessus ne laissent plus rien fuir, chacune
      couverte par un test **vu échouer** sur le code d'avant le correctif
- [ ] Une sous-commande légitime (`git status`, `npm run build`, `docker ps`)
      reste lisible dans `command_head` — sinon le collecteur perd sa raison d'être
- [ ] L'arbitrage entre option A et option B est **écrit**, avec le motif du refus
- [ ] Un instantané figé du journal réel a été **mesuré**, et la décision sur
      l'existant est consignée
- [ ] `_lancer()` (`server.py:1121`) journalise `argv[:2]` **sans passer par la
      rédaction** : soit il y passe, soit l'écart est justifié par écrit
- [ ] Suite verte, compte de cas strictement supérieur à l'entrée
- [ ] Validation par mutation sur chacune des cinq formes

## Hors périmètre

- La purge du journal existant, si elle est décidée : elle fera sa propre spec,
  parce qu'elle détruit des données et exige un plan de retour arrière.
- Le chiffrement du journal au repos.
