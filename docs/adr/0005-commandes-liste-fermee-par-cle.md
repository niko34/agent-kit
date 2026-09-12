# ADR-0005 — Liste fermée de commandes : l'interface choisit une clé, jamais une ligne de commande

## Statut

Accepté

## Date

2026-09-12

## Contexte

Le centre de contrôle est appelé à exécuter des commandes locales (tests,
build) pour le compte de l'utilisateur. Une interface web qui accepterait une
ligne de commande arbitraire venue du navigateur ouvrirait un chemin direct
vers l'exécution de code non maîtrisé.

## Décision

Les commandes lançables sont déclarées en `argv` (liste de tokens, pas une
chaîne shell) dans `control-center.toml`, section `[commandes]`. L'interface
et l'API ne manipulent jamais une commande : elles fournissent une **clé**
(`Config.commande(cle)` dans `control-center/backend/config.py`) qui sert à
retrouver l'`argv` déclaré. Aucune chaîne venue du réseau ne peut donc
atteindre un shell : au pire, une clé inconnue ne correspond à rien et la
requête échoue sans effet.

Un défaut a été trouvé par le test de cette même garantie : deux fonctions
lisaient la liste des commandes autorisées de façon différente
(`commande()` validait le format `argv`, `tetes_de_commande()` traduisait les
entrées brutes sans repasser par cette validation) — une entrée malformée
(`["ls", 42]`) était refusée par l'une et acceptée par l'autre. Corrigé en
faisant passer `tetes_de_commande()` par `commande()` : **une liste fermée
dont deux lecteurs divergent n'est plus fermée**.

## Alternatives considérées

- **Accepter une ligne de commande, avec échappement/sanitation côté
  serveur** : écarté — l'échappement est une défense en profondeur, pas une
  garantie ; la moindre faille dans le parseur rouvre l'accès à un shell.
  Une liste fermée par clé rend la question sans objet.
- **Whitelist de préfixes de commande (regex sur la chaîne reçue)** : écarté
  — une regex de préfixe reste une chaîne interprétée, avec les mêmes risques
  d'échappement que l'option précédente ; l'`argv` déclaré en configuration
  supprime l'interprétation elle-même.

## Conséquences

### Positives

- La surface d'attaque est réduite à « la clé demandée existe-t-elle dans la
  configuration ? » — une comparaison, pas un parseur.
- Le défaut trouvé par le test (`tetes_de_commande()` vs `commande()`) montre
  que la garantie est vérifiable et a été effectivement vérifiée par
  mutation, pas seulement supposée.

### Négatives

- Toute nouvelle commande doit être ajoutée à `control-center.toml` avant de
  pouvoir être lancée depuis l'interface — pas de flexibilité ad hoc pour un
  besoin ponctuel.
- Deux fonctions qui lisent la même liste selon des règles différentes
  peuvent réintroduire silencieusement une divergence à l'avenir ; seul un
  test dédié à cette cohérence (comme celui qui a trouvé le défaut initial)
  la détecte.
