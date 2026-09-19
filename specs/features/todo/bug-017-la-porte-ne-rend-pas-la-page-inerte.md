# Bug — La porte d'authentification laisse la page atteignable au clavier

- **Type** : bug
- **Statut** : todo
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

- [ ] Porte ouverte : **aucun** contrôle hors de la modale n'est atteignable par
      tabulation, vérifié **en HTTP** et non en `file://` — voir §10 des pièges
- [ ] La barre de navigation en particulier ne permet plus de changer de section
      sous la modale
- [ ] À la fermeture, le focus revient à un endroit **nommé**, pas au hasard
- [ ] La porte reste enfant direct du corps du document et au-dessus de toute
      section — non-régression des conditions de `feature-019`
- [ ] Un test **compte** les contrôles atteignables hors modale et exige zéro ;
      il ne se contente pas de vérifier qu'un mécanisme est posé
- [ ] Suite verte, compte de cas strictement supérieur à l'entrée
- [ ] Validation par mutation : retirer le mécanisme d'inertie doit faire mourir
      le test

## Hors périmètre

- La rétention de focus **à l'intérieur** de la modale, si elle fonctionne déjà.
- Toute modification des routes ou du modèle d'autorisation : le serveur reste
  la seule autorité.
