# Bug — La porte d'authentification laisse la page atteignable au clavier

- **Type** : bug
- **Statut** : doing — **absorbé dans le cycle `feature-021`** (lot 3, correctif ;
  lot 5, mesure chiffrée F4b), au titre d'`ADR-0017`. Tous les critères
  d'acceptation sont cochés ; la clôture (déplacement vers `done/`) reste à
  l'agent principal, avec celle de `feature-021`.
- **Priorité** : normale
- **Version cible** : [à fixer par l'agent qui reprend cette spec]
- **Créée** : 2026-09-15 (passage GATE P2 de `feature-019`)
- **Domaine** : frontend (`control-center/web/`)
- **Spec(s) liée(s)** : `feature-019` (a élargi le défaut, ne l'a pas créé), `ADR-0020`

## Agents requis

- [x] architect
- [x] ux-ui-designer — le comportement d'une modale est un arbitrage d'ergonomie
- [x] frontend-developer
- [x] test-engineer
- [x] code-reviewer
- [x] doc-writer

## Absorption dans le cycle `feature-021` (2026-09-21)

Ce bug n'est pas traité seul. Il entre dans le cycle `feature-021` **au lot 3**,
au titre d'`ADR-0017` : le lot 3 réécrit `index.html` en entier, donc la porte
d'authentification change de place dans le document de toute façon. Traiter le
défaut ailleurs qu'ici reviendrait à corriger une structure qui n'existera plus
à la fin du cycle, puis à refaire le correctif sur la structure neuve.

Conséquence de forme : le cycle porte **deux specs dans `doing/`**, avec une
**seule** phase de test, de revue et de documentation. Le journal de bord de
référence est celui de `feature-021`, section « cycle 2 » — c'est là que les
verdicts de ce bug sont écrits, pas ici.

Le **correctif structurel** (porte enfant direct de `<body>`, `inert` sur ses
frères) est au lot 3. Le **comptage** des contrôles atteignables hors modale,
qui est le critère d'acceptation chiffré, est la garde F4b au **lot 5**.

## Symptôme observé

Quand la porte d'authentification est ouverte, **le reste de la page reste
atteignable au clavier**. Le voile bloque le pointeur, pas la tabulation.

Mesuré en HTTP par l'auditeur de sécurité, les 2026-09-15 :

| État | Contrôles atteignables hors de la modale |
|---|---|
| Avant `feature-019` | **3** |
| Après, section par défaut | **2** |
| Après, section « Développer » | jusqu'à **6**, dont le bouton de lancement |

**L'élargissement propre à `feature-019` est la barre de navigation** : elle est
focalisable sous la modale, donc **on peut changer de section pendant que la
porte est levée**.

## Cause racine

La rétention de focus est « simple » : elle ramène le focus dans la modale sur
certains parcours, mais **ne rend pas le reste du document inerte**. Un
`tabindex` naturel suffit à en sortir.

Le défaut **préexiste** à `feature-019`. Ce cycle ne l'a pas créé : il a
augmenté le nombre de contrôles concernés en ajoutant une navigation permanente.

## Ce que ce n'est pas

⚠️ **Ce n'est pas une faille d'autorité.** Le frontend n'est jamais une barrière
de sécurité, et le backend revalide tout : une écriture déclenchée depuis un
contrôle atteint par cette voie est refusée côté serveur tant que le jeton n'est
pas présenté (ADR-0019, ADR-0020). L'auditeur l'a vérifié — la route d'écriture
est inchangée.

C'est un défaut d'**ergonomie et d'accessibilité** : une modale qui annonce
bloquer l'accès et ne le bloque qu'à la souris ment à qui navigue au clavier.

## Correctif attendu

Rendre le reste du document **inerte** tant que la porte est ouverte, et le
rendre à nouveau actif à sa fermeture. L'`ux-ui-designer` arbitre le mécanisme —
l'attribut dédié, un piège de focus complet, ou les deux — et dit ce qu'il
advient du focus **au retour**.

⚠️ La porte doit rester **enfant direct du corps du document** et **au-dessus**
de toute section : ce sont deux conditions déjà établies et gardées par
`feature-019`, ne les casse pas en corrigeant celle-ci.

## Critères d'acceptation

- [x] Porte ouverte : **aucun** contrôle hors de la modale n'est atteignable par
      tabulation, vérifié **en HTTP** et non en `file://` — voir §10 des pièges
      (lot 5, `test_app_a11y_navigateur.py`,
      `F4b_bug017_zero_controle_atteignable_hors_porte_quand_ouverte`)
- [x] La barre de navigation en particulier ne permet plus de changer de section
      sous la modale — sans objet depuis le lot 3 : la navigation par onglets a
      disparu de l'écran tout entier (`ADR-0029`), il n'y a donc plus de section
      à atteindre sous la modale
- [x] À la fermeture, le focus revient à un endroit **nommé**, pas au hasard
      (`dernierFocusAvantPorte`, repli nommé sur `#main-content` — lot 3,
      vérifié au lot 5 par `F4b_focus_restaure_sur_un_element_nomme_a_la_fermeture`)
- [x] La porte reste enfant direct du corps du document et au-dessus de toute
      section — non-régression des conditions de `feature-019` (lot 3, revérifié
      par mutation : envelopper la porte dans un `<div>` fait échouer
      `A0_porte_est_enfant_direct_de_body`)
- [x] Un test **compte** les contrôles atteignables hors modale et exige zéro ;
      il ne se contente pas de vérifier qu'un mécanisme est posé (lot 5, F4b,
      harnais navigateur avec focus réel — `document.activeElement`, jamais une
      relecture d'attributs)
- [x] Suite verte, compte de cas strictement supérieur à l'entrée
- [x] Validation par mutation : retirer le mécanisme d'inertie doit faire mourir
      le test (`fixerInerteAutourDeLaPorte` neutralisée → 3 cas meurent, nommant
      les quatre frères concernés)

## Hors périmètre

- La rétention de focus **à l'intérieur** de la modale, si elle fonctionne déjà.
- Toute modification des routes ou du modèle d'autorisation : le serveur reste
  la seule autorité.

## Notes d'implémentation (lot 3 de `feature-021`)

Le correctif structurel est livré. `control-center/web/index.html` conserve
`#porte-jeton` en enfant direct de `<body>`, au-dessus des sections (condition
héritée de `feature-019`, non régressée par la réécriture du lot 3).
`control-center/web/app.js` ajoute :

- `freresDeLaPorte()` — lit les enfants du parent de `#porte-jeton` autres
  qu'elle-même (`.bandeau-hote`, le lien d'évitement, `.app-shell`, `.tiroir`).
- `fixerInerteAutourDeLaPorte(inerte)` — pose `inert` sur ces frères à
  l'ouverture, le retire à la fermeture. `ouvrirPorte()`/`fermerPorte()`
  l'appellent ; la rétention de focus déjà présente (piège `Tab` interne à la
  porte) reste en complément, elle ne suffisait pas seule.
- Le focus est mémorisé (`dernierFocusAvantPorte`) à l'ouverture et restauré
  à la fermeture ; repli nommé sur `#main-content` si rien n'était mémorisé
  ou si l'élément a disparu du DOM entre-temps — jamais `document.body`.

`control-center/web/test_app_bug017.js` et son pendant `.py` couvrent le
mécanisme (frères rendus inertes à l'ouverture, retirés à la fermeture, la
porte elle-même ne reçoit jamais `inert`).

**Ce que ce lot ne livre pas** : le critère d'acceptation « un test **compte**
les contrôles atteignables hors modale et exige zéro » est la garde `F4b`,
prévue au **lot 5** du cycle (harnais HTTP + navigateur, seul moyen fiable de
mesurer l'atteignabilité réelle). Ce lot livre le mécanisme structurel que
cette garde mesurera, pas la mesure elle-même — les critères d'acceptation
correspondants restent donc à cocher au lot 5, pas ici.

## Notes d'implémentation (lot 5 de `feature-021`, cycle 2)

`F4b` (contrat d'accessibilité, volet runtime) ferme le critère chiffré
laissé ouvert au lot 3 : `control-center/web/test_app_a11y_navigateur.py`
(harnais navigateur, `HARNAIS_NAVIGATEUR = True`) ouvre réellement
`#porte-jeton` en HTTP, mesure `document.activeElement` après avoir simulé
`Tab` à répétition (jamais une relecture des attributs `inert`/`hidden`,
`PIEGES §15`/§38), et compte les contrôles atteignables. Deux assertions
ferment directement les critères de cette spec :
`F4b_bug017_zero_controle_atteignable_hors_porte_quand_ouverte` (0 exigé,
0 mesuré) et `F4b_focus_restaure_sur_un_element_nomme_a_la_fermeture`.

Ce même mécanisme a été **réutilisé, pas dupliqué**, pour fermer le
dialogue de suppression de `feature-025` au lot 10
(`test_app_feature025_a11y_navigateur.py`) — la sémantique modale native de
`<dialog>` + `showModal()` s'est révélée être la même réutilisation que
`inert` posé à la main, au niveau du moteur de rendu plutôt que du DOM,
vérifié par la même méthode plutôt que supposé.

Absorption au titre d'`ADR-0017` documentée en détail dans
`ADR-0038` §3 (état mesuré du défaut, argument en quatre points, et
pourquoi aucun ADR dédié n'a été créé — le patron déjà établi par les
quatre absorptions précédentes du dépôt).

**Tous les critères d'acceptation de cette spec sont désormais cochés.**
