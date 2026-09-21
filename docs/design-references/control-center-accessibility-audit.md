# Revue d’accessibilité — centre de contrôle Claude

Date : 20 septembre 2026

## Référentiel et périmètre

Revue du prototype HTML `control-center-animated-prototype.html`, visant WCAG 2.2 niveau AA et les recommandations d’accessibilité Material 3. Cette revue porte sur la structure, les noms accessibles, le clavier, les cibles d’interaction, le mouvement, les dialogues, les menus, les indicateurs et les contrastes définis par la maquette.

Il s’agit d’une revue de prototype, pas d’une déclaration de conformité. Une validation finale devra encore être faite dans le produit réel avec VoiceOver, NVDA ou TalkBack, à 200 % et 400 % de zoom, en contraste renforcé et sur plusieurs tailles d’écran.

## Résultat synthétique

| Sujet | Constat initial | Correction dans la maquette | État |
| --- | --- | --- | --- |
| Boutons Notifications et Réglages | Cibles de 40 px et pictogrammes Unicode | Cibles de 48 px, SVG de 24 px, noms `Notifications, 3 non lues` et `Ouvrir les réglages` | Corrigé |
| Icônes fonctionnelles | Risque de lecture du glyphe à la place de sa fonction | Nom porté par le bouton ; SVG ou glyphe interne masqué avec `aria-hidden="true"` | Corrigé |
| Icônes décoratives | Plusieurs caractères pouvaient être annoncés inutilement | Marques, avatars, puces et séparateurs décoratifs retirés de l’arbre d’accessibilité | Corrigé |
| Taille des cibles | Plusieurs contrôles faisaient 34 à 40 px | Cibles principales portées à 48 px ; sous-agents non lancés à 52 px | Corrigé |
| Cartes du backlog | Carte focalisable sans rôle explicite et bouton imbriqué | Titre devenu un vrai bouton de 48 px ; menu indépendant et nommé | Corrigé |
| Menu contextuel | Pas de gestion des flèches, de Début/Fin ou d’Échap | Focus placé à l’ouverture, navigation verticale, Échap et restitution du focus | Corrigé |
| Progression | Barre décrite seulement par un libellé | `role="progressbar"` avec valeurs minimale, maximale et actuelle | Corrigé |
| Animation | Contrôles techniques de démonstration visibles dans l’interface produit | Contrôles retirés ; scénario automatique, non annoncé à chaque étape, et état statique complet si le mouvement est réduit | Corrigé |
| Réduction du mouvement | Déjà prise en compte | `prefers-reduced-motion` conservé, lecture automatique désactivée | Conforme au prototype |
| Focus clavier | Indicateurs partiels et parfois translucides | Contour indigo plein de 3 px, contraste supérieur à 3:1 et lien d’évitement | Corrigé |
| Dialogues | Bon usage de l’élément natif, description implicite | `aria-labelledby` et `aria-describedby` explicites, fermeture nommée | Corrigé |
| Zone de saisie | Label visuellement masqué présent, bouton trop petit | Label conservé, bouton d’envoi 48 px et icône décorative masquée | Corrigé |
| Mise à jour dynamique | Régions vivantes trop bavardes pendant l’animation | Annonces limitées aux actions de l’utilisateur | Corrigé |
| Création d’un élément | Nouveau formulaire à intégrer | Libellés explicites, vrai contrôle radio, champs obligatoires natifs, focus initial et annonce après ajout | Corrigé |

## Contrastes vérifiés

Calculs selon la formule de contraste WCAG :

| Combinaison | Ratio | Lecture |
| --- | ---: | --- |
| Texte principal `#1d1b20` / surface `#fffbff` | 16,66:1 | AA et AAA |
| Texte secondaire `#67636d` / fond `#f7f5fb` | 5,42:1 | AA pour le texte normal |
| Indigo `#4f46d8` / lavande `#e7e2ff` | 5,22:1 | AA pour le texte normal |
| Blanc / indigo `#4f46d8` | 6,56:1 | AA pour le texte normal |
| Turquoise `#087e6d` / fond `#f7f5fb` | 4,60:1 | AA pour le texte normal |
| Erreur `#ba1a1a` / surface `#fffbff` | 6,31:1 | AA pour le texte normal |
| Ligne informative renforcée `#8f8997` / surface `#fffbff` | 3,31:1 | Contraste non textuel ≥ 3:1 |

Les séparateurs purement décoratifs peuvent rester plus discrets. Les limites porteuses d’information, comme les pistes de progression, utilisent désormais la ligne renforcée.

## Règle retenue pour les icônes

- Un élément `<img>` informatif ou fonctionnel utilise un attribut `alt` adapté.
- Une icône SVG placée dans un bouton n’a pas besoin d’un `alt` : le bouton porte le nom accessible décrivant l’action et l’icône interne est décorative.
- Une icône qui transmet seule une information doit recevoir une alternative textuelle équivalente.
- Une icône décorative utilise `aria-hidden="true"` ou, pour une image, `alt=""`.

## Points à valider dans le produit final

1. Parcours complet avec VoiceOver sur macOS/iOS et NVDA sur Windows.
2. Ordre de tabulation après branchement des vrais menus Projet, Réglages, Compte, Historique et Filtres.
3. Reflow à 400 % ; le diagramme de cycle peut conserver un défilement horizontal en tant que représentation bidimensionnelle, mais les autres zones doivent se réorganiser sans double défilement.
4. Modes de contraste renforcé et couleurs forcées du système.
5. Annonces des changements d’état réels de Claude, en évitant de vocaliser chaque mise à jour de tokens.
6. Tests avec utilisateurs ayant une basse vision, une déficience motrice ou utilisant un lecteur d’écran.

## Sources primaires

- WCAG 2.2 : https://www.w3.org/TR/WCAG22/
- W3C — taille minimale des cibles : https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
- W3C — apparence du focus : https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance
- W3C — images fonctionnelles et alternatives textuelles : https://www.w3.org/WAI/tutorials/images/functional/
- Google/Android — cibles Material de 48 dp : https://developer.android.com/develop/ui/compose/accessibility/api-defaults
- Google/Android — boutons d’icône Material 3 : https://developer.android.com/reference/kotlin/androidx/compose/material3/IconButton.composable
