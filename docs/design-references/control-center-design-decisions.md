# Centre de contrôle Claude — décisions de conception

Ce document consolide les choix validés pendant l’exploration. Il devra servir de référence lors de la production des exemples et des prompts d’implémentation destinés à Claude.

## Architecture générale

- Concevoir un cockpit monopage, sans navigation latérale permanente.
- Conserver le sélecteur de projet, l’état de connexion, les notifications, les réglages et le compte utilisateur dans la barre supérieure.
- Regrouper les indicateurs opérationnels dans une bande compacte, et non dans une succession de cartes KPI.
- Afficher le backlog en kanban sur toute la largeur sous le cycle.
- Intégrer l’historique dans le module des cycles avec `Cycle actif / Historique` et un sélecteur de cycle, plutôt que dans un écran séparé.

## Représentation du cycle

- Le cycle occupe la partie principale de la rangée supérieure, à gauche d’un panneau de conversation permanent. Il doit conserver assez de largeur pour rendre lisibles les branches parallèles, les attentes et les reprises sans compacter exagérément les agents.
- Le diagramme est posé directement sur la surface principale du scaffold, sans carte blanche ni cadre décoratif autour de lui.
- Les sous-agents sont représentés par des disques porteurs d’information :
  - centre : identité et tokens consommés ;
  - anneau : état ou progression du passage ;
  - graduations radiales : appels d’outils ;
  - points périphériques : fichiers manipulés ;
  - valeur sous le disque : durée.
- Le cycle peut contenir plusieurs passages du même sous-agent, des branches parallèles, des attentes et des boucles de reprise.

## Mouvement et états des sous-agents

- Un passage **non lancé** est représenté par un disque réduit, peu contrasté et sans métriques. Son rôle reste nommé afin que la structure future du cycle soit compréhensible.
- Le passage `non lancé → actif` constitue le moment expressif principal : le disque grandit une seule fois avec un mouvement spatial souple, puis les tokens, appels d’outils, fichiers et durée apparaissent progressivement.
- Un passage **actif** ne doit pas respirer ni changer continuellement de taille. Le travail en cours est signalé par des effets non spatiaux et limités : progression de l’anneau, déplacement d’un marqueur orbital, illumination séquentielle de quelques graduations et flux sur les connexions actives.
- Un passage **terminé** se stabilise : toutes les animations continues cessent, l’anneau devient stable et les données finales restent visibles.
- Ne pas animer tous les agents simultanément. Seuls les agents réellement actifs et leurs connexions peuvent porter une animation continue.
- Ne pas afficher les contrôles de démonstration `Lire/Pause`, `Étape suivante` et `Réinitialiser` dans la maquette produit : ils ne correspondent à aucune action métier. Le prototype conserve toutefois l’enchaînement automatique de ses états afin de documenter pour Claude l’activation, le parallélisme, la reprise et la stabilisation des sous-agents.
- Donner aux animations un rythme posé : environ 5,6 s entre deux étapes automatiques, une rotation d’activité proche de 5 s et des transitions spatiales proches de 800 ms. Les données restent ainsi lisibles pendant le mouvement.
- Respecter `prefers-reduced-motion` : supprimer les animations continues, désactiver la lecture automatique par défaut et conserver le passage d’état immédiatement compréhensible.

## Détail d’un sous-agent

- Un clic sur un passage ouvre une **standard bottom sheet Material 3** attachée au module du cycle.
- La bottom sheet explique les données du disque sélectionné et sert de mécanisme d’apprentissage progressif.
- Elle possède une poignée, un état replié et un état développé. Elle ne crée pas de voile modal et laisse le cycle perceptible.
- Ne pas réintroduire de légende permanente avec des traits d’appel : elle a été jugée trop confuse.

## Conversation avec Claude

- Seul l’agent principal Claude converse avec l’utilisateur. Les sous-agents ne disposent pas de conversations individuelles.
- La conversation reste dans un **panneau permanent à droite** de la zone du cycle. Cette présence continue est préférable pour un centre de contrôle : les questions et interventions de Claude restent visibles sans action préalable.
- La rangée supérieure utilise une répartition indicative de 72 % pour le cycle et 28 % pour Claude. Les deux zones ont la même hauteur et s’arrêtent avant le backlog.
- Le panneau montre les deux ou trois messages récents, une question bloquante épinglée et la zone de saisie. L’historique des messages peut défiler à l’intérieur du panneau.
- La piste d’une side sheet à la demande a été testée puis explicitement rejetée : elle masquait une partie du cockpit et rendait la présence de Claude trop intermittente. Ne pas la réintroduire dans les prompts d’implémentation.
- La saisie reprend le modèle ChatGPT : une zone de texte `Répondre à Claude…` et un unique bouton circulaire bleu avec flèche. Aucun bouton `Message`, `Instruction` ou `Envoyer`.

## Backlog

- Le backlog reste visible sur la page principale sous forme de kanban pleine largeur.
- Le workflow du backlog comporte exactement trois colonnes : `Todo`, `Doing`, `Done`. Il n’existe ni étape `À cadrer`, ni colonne `Prêt`.
- Les cartes représentent des features réelles avec identifiant, priorité, agent responsable et progression. Les cartes sont justifiées ici par la nature même du kanban, mais il faut éviter d’en faire un motif décoratif ailleurs.
- Le backlog doit accepter un volume significatif de features et de bugs sans allonger indéfiniment le cockpit. Sur grand écran, utiliser une hauteur maximale pour la zone du kanban et **un seul défilement vertical commun aux trois colonnes**, avec en-têtes de colonnes persistants.
- Ne pas créer trois ascenseurs indépendants : ils rendent la comparaison des colonnes et l’usage au trackpad inutilement difficiles.
- Sur les largeurs compactes, supprimer ce défilement imbriqué : les colonnes s’empilent et la page reprend un défilement vertical naturel.
- Chaque carte de feature ou de bug possède un bouton d’overflow vertical `⋮` dans son angle supérieur droit. Il ouvre un menu Material 3 ancré à la carte, sur une surface temporaire élevée.
- Cliquer sur le corps d’une carte, ou choisir `Voir les détails`, ouvre un dialogue Material 3 contenant description, statut, priorité, agent, critères d’acceptation, dépendance et date de mise à jour. Le dialogue conserve le contexte du kanban derrière un voile léger.
- Pour une carte de la colonne `Todo`, le menu commence par `Lancer un cycle`, suivi d’un séparateur. Viennent ensuite `Voir les détails`, `Modifier`, puis un séparateur et l’action destructive `Supprimer` en couleur d’erreur.
- La suppression doit toujours déclencher une confirmation explicite indiquant précisément l’élément concerné.
- Dans ce kanban dense, ne pas afficher de bouton `Lancer un cycle` permanent dans les cartes : il surcharge leur lecture. L’action contextuelle reste facile à trouver en première position du menu et n’apparaît que pour les éléments éligibles.
- L’en-tête du backlog contient une action primaire `Ajouter un élément`, distincte du filtre. Elle ouvre un dialogue Material 3 afin de créer une `Feature` ou un `Bug` sans quitter le cockpit.
- Le formulaire de création demande uniquement les informations exprimées par l’utilisateur : type, description et priorité. Le titre n’est pas saisi par l’utilisateur : Claude le choisit, rédige la spec, sélectionne l’agent adapté et définit les critères d’acceptation. L’identifiant est généré automatiquement et l’élément entre directement dans `Todo`, avec mise à jour immédiate des compteurs.
- Ne pas afficher d’encart `Complété par Claude` dans ce dialogue. Le comportement est implicite dans le flux de création et l’encart alourdit inutilement un formulaire volontairement minimal.

## Direction visuelle

- Respecter Material Design 3 / Material 3 Expressive avec une densité adaptée au bureau.
- Employer une typographie fine, principalement en graisses 400 et 500, sans titres énormes.
- Construire la hiérarchie avec les surfaces tonales, l’espace et une élévation discrète plutôt qu’avec des bordures épaisses.
- Palette de référence : surface neutre légèrement lavande, indigo pour l’activité principale, turquoise pour le parallélisme et la réussite, corail atténué pour les reprises et questions bloquantes.

## Accessibilité

- Viser WCAG 2.2 niveau AA et les recommandations d’accessibilité Material 3.
- Les boutons d’icône utilisent une cible minimale de 48 × 48 px avec un pictogramme de 24 px. Le bouton porte le nom accessible de l’action ; l’icône interne est masquée aux technologies d’assistance.
- Ne pas demander un attribut `alt` sur un SVG décoratif intégré à un bouton : utiliser `aria-label` sur le bouton et `aria-hidden="true"` sur le SVG. Réserver `alt` aux éléments `<img>`.
- Les cartes du backlog ne sont pas des conteneurs focalisables génériques : leur titre est un vrai bouton, distinct du bouton de menu.
- Tous les menus temporaires gèrent le placement initial du focus, les flèches, Début/Fin, Échap et la restitution du focus.
- Les contrôles techniques de démonstration ne doivent pas être exposés. Le scénario animé reste automatique, tandis que `prefers-reduced-motion` présente un état final stable sans mouvement continu.
- Utiliser un indicateur de focus plein de 3 px et un contraste non textuel d’au moins 3:1. Ajouter un lien d’évitement vers le contenu principal.
- Limiter les régions `aria-live` aux changements déclenchés par l’utilisateur ; ne pas annoncer chaque variation de tokens ou d’activité.
- Le rapport détaillé se trouve dans `design-references/control-center-accessibility-audit.md`.

## Maquette de référence

> **Note éditoriale ajoutée le 2026-09-20 (kit), hors texte d'origine.**
>
> **La référence normative est le prototype HTML** —
> `control-center-animated-prototype.html`, versionné ici. C'est du code : jetons
> CSS, structure DOM, classes d'état et durées d'animation y sont exacts, donc la
> conformité de l'implémentation se **mesure** au lieu de se juger.
>
> **Les PNG cités ci-dessous ne sont PAS versionnés.** L'auteur les a qualifiés
> d'illustrations, et 18 Mo d'images dans l'historique git ne se justifiaient plus
> une fois le HTML reconnu comme référence. Ils restent disponibles dans l'archive
> d'origine `centre-controle-claude-livrable.zip`. Les paragraphes qui suivent sont
> conservés tels quels parce qu'ils décrivent **la succession des décisions** — ce
> qui a été essayé, retenu, puis remplacé — et cette trace garde sa valeur même
> sans les images.


La maquette de référence active, avec cycle animé automatiquement et sans contrôles techniques de démonstration, est :

`design-references/control-center-autoplay-no-demo-controls-reference.png`

La vue de référence du formulaire minimal sans encart `Complété par Claude` est :

`design-references/control-center-add-item-minimal-reference.png`

La version précédente, sans titre saisi par l’utilisateur mais avec l’encart Claude, est :

`design-references/control-center-add-item-no-title-reference.png`

La version précédente, avec le workflow `Todo / Doing / Done` mais un titre encore saisi manuellement, est :

`design-references/control-center-todo-doing-done-reference.png`

La version précédente, avec le formulaire d’ajout simplifié mais l’ancien workflow, est :

`design-references/control-center-add-item-claude-enriched-reference.png`

La version précédente du formulaire, avant délégation de l’agent et des critères à Claude, est :

`design-references/control-center-add-item-reference.png`

La vue générale du tableau de bord après revue d’accessibilité est :

`design-references/control-center-accessible-reference.png`

La vue de référence avec consultation du détail d’une feature est :

`design-references/control-center-feature-detail-reference.png`

La vue précédente, avec conversation permanente et backlog dense à défilement commun, est :

`design-references/control-center-scrollable-backlog-reference.png`

La vue détaillant le menu contextuel et l’action de lancement est :

`design-references/control-center-backlog-actions-reference.png`

Le prototype HTML interactif illustrant les changements d’état et l’activité des sous-agents est :

`design-references/control-center-animated-prototype.html`

La version précédente, sans les actions du backlog, reste disponible comme étape intermédiaire :

`design-references/control-center-permanent-conversation-reference.png`

La piste rejetée est conservée uniquement comme trace de décision et ne doit pas servir de référence :

`design-references/rejected-control-center-side-sheet-reference.png`

## Références Material 3

- Bottom sheets : https://m3.material.io/components/bottom-sheets/overview
- Menus : https://m3.material.io/components/menus/overview
- DropdownMenu Material 3 : https://developer.android.com/reference/kotlin/androidx/compose/material3/DropdownMenu
- Motion Material 3 : https://m3.material.io/styles/motion/overview
