"use strict";
/* feature-021, cycle 2, lot 6 (extension de périmètre) — table de partition
 * PARTAGÉE par les gardes de fidélité (F0 la définit et l'exige exhaustive ;
 * F1-F5a et le harnais navigateur F3b/F4b/F5b la CONSOMMENT). Un SEUL
 * exemplaire de la table (PIEGES §21/§22 : une correction qui s'arrête au
 * premier endroit signalé).
 *
 * ⚠️ RÉOUVERTURE DE PÉRIMÈTRE (2026-09-22) — ce que cette table cesse de
 * faire depuis ce lot : elle NE PORTE PLUS aucun verdict `differe:*` ni
 * `ecarte`. La maquette ENTIÈRE entre au périmètre du cycle — les 88
 * éléments précédemment différés vers feature-022/023/025 et les 7 éléments
 * précédemment écartés reviennent tous. Deux verdicts seulement subsistent :
 *
 *   "adopte"           — l'élément entre au périmètre, tel quel
 *   "adopte:redefini"  — l'élément entre au périmètre, mais sa SÉMANTIQUE
 *                         est corrigée par rapport à la lecture initiale du
 *                         prototype (seule occurrence : `progress-track`,
 *                         voir sa note)
 *
 * Chaque entrée gagne un troisième élément, `lot` (chaîne) : le lot du plan
 * du cycle 2 où l'élément est/sera livré. Pour les 97 éléments déjà adoptés
 * AVANT ce lot (lots 0-5), le lot est DÉRIVÉ de l'historique git (premier
 * commit du cycle 2 où le sélecteur apparaît dans index.html/app.css/app.js/
 * diagramme.js — script conservé, voir note de méthode en fin de fichier),
 * jamais recopié à la main (PIEGES §21). Pour les éléments qui reviennent
 * par cette réouverture, le lot est celui du plan d'orchestration :
 * feature-022 → lot 11, feature-023 → lot 12, feature-025 → lots 9-10,
 * barre supérieure (ADR-0020 amendé) → lot 7.
 *
 * ⚠️ QUATRE RECTIFICATIONS MESURÉES à cette réouverture, à ne pas
 * recopier de travers en cas de reprise partielle :
 *
 * 1. Les six entrées motivées « ADR-0020 : barre supérieure amputée »
 *    (account-button, avatar, notification-badge, notification-button,
 *    project-switcher, user-name) portaient un motif FAUX. Vérifié : le
 *    texte d'`ADR-0020` ne contient AUCUN des mots « projet », « barre »,
 *    « switcher », « avatar », « notification » — 0 occurrence chacun. Son
 *    §1 interdit les COMPTES et RÔLES multiples, rien de plus. Ces six
 *    éléments avaient été exclus par une mauvaise lecture au lot 0. Le
 *    motif réel, écrit sur chacune : « mauvaise lecture d'ADR-0020,
 *    rectifiée, cf. ADR-0039 ».
 * 2. `progress-track` N'EST PAS l'anneau de progression. Mesuré dans le
 *    prototype (l.783, 784, 785) : 3 instances, TOUTES dans `.feature-card`
 *    — une barre linéaire de 6px avec pourcentage (`role="progressbar"`,
 *    `aria-valuenow`). Elle est adoptée REDÉFINIE au lot 10 (la grandeur de
 *    progression reste à définir et mesurer — K4 du plan ; si aucune
 *    grandeur ne se mesure, la carte n'en porte pas). L'ANNEAU
 *    (`--progress` posé sur `.agent-node`) est un mécanisme DIFFÉRENT, déjà
 *    livré aux lots 2/4. Les deux entrées ne sont JAMAIS fusionnées.
 * 3. `icon-button` N'EST PLUS une classe morte. Le prototype en porte 5
 *    instances (l.655, 659, 757, 811, 825), qui rentrent TOUTES au
 *    périmètre. La note héritée du lot 0 (« aucune instance adoptée ») était
 *    fausse et est réécrite, pas reportée — voir le détail sur l'entrée.
 * 4. Le bouton « Ouvrir les réglages » (l.659, prototype) n'a NI id NI
 *    classe distinctive au-delà d'`icon-button`, et NI feature-022, NI
 *    feature-023, NI feature-025 ne porte de fonctionnalité « réglages »
 *    ce cycle : c'est le SEUL bouton de la barre supérieure sans
 *    propriétaire fonctionnel. Assigné explicitement lot 7, il reste
 *    INERTE avec ce motif affiché (H6 : jamais inerte en silence) — une
 *    décision écrite, pas un oubli.
 *
 * CLAUSE MIROIR EXIGÉE (vérifiée par `test_conformite_perimetre.js`) : tout
 * élément dont le lot est 9-10, 11 ou 12 doit être NOMMÉ dans la section
 * « Éléments du prototype qui lui reviennent » de la spec absorbée
 * correspondante (feature-025, feature-022, feature-023 — déjà écrites par
 * `spec-reader`). Une entrée orpheline (lot renvoyant à une spec qui ne la
 * nomme pas) fait ÉCHOUER la garde.
 */

const ADOPTE = "adopte";
const ADOPTE_REDEFINI = "adopte:redefini";

// Lots des trois specs absorbées, réutilisés par la clause miroir spec ↔
// table (test_conformite_perimetre.js) — une seule fois, jamais recopiés.
const LOT_FEATURE_022 = "11";
const LOT_FEATURE_023 = "12";
const LOT_FEATURE_025 = "9-10";

const PARTITION_IDS = {
  "a11y-announcement": ["adopte", "annonce a11y générique, utile à tout écran", "3"],
  "add-item-dialog": ["adopte", "un des 3 <dialog>, action backlog", "9-10"],
  "add-item-form": ["adopte", "formulaire d'ajout, action backlog", "9-10"],
  "add-item-intro": ["adopte", "texte du formulaire d'ajout", "9-10"],
  "add-item-title": ["adopte", "titre du formulaire d'ajout", "9-10"],
  "backlog-column-count": ["adopte", "compte de colonne, kanban F10", "3"],
  "backlog-count": ["adopte", "compte du backlog, kanban F10", "3"],
  "backlog-title": ["adopte", "titre du kanban", "3"],
  "cancel-add-item": ["adopte", "bouton annuler, formulaire d'ajout", "9-10"],
  "cancel-delete": ["adopte", "bouton annuler, dialogue de suppression", "9-10"],
  "claude-live-message": ["adopte", "message du panneau de conversation", "11"],
  "claude-title": ["adopte", "titre du panneau de conversation", "11"],
  "close-add-item": ["adopte", "fermeture du dialogue d'ajout", "9-10"],
  "close-feature": ["adopte", "fermeture du dialogue de détail", "9-10"],
  "composer": ["adopte", "champ de saisie vers Claude", "11"],
  "context-menu": ["adopte", "menu contextuel des actions backlog", "9-10"],
  "cycle-canvas": ["adopte", "conteneur du graphe d'agents, F8/F9", "3"],
  "cycle-status": ["adopte", "statut du cycle en cours", "3"],
  "cycle-title": ["adopte", "l'élément existe, JAMAIS une chaîne vide (cible aria-labelledby de .cycle-surface) — « Cycle #N » ou un libellé factuel dédié tant que la spec n'est pas connue (ADR-0023 conserve son fait mesuré pour un cycle OBSERVÉ, H4a, livré lot 7) ; se remplit du TITRE de spec pour un cycle lancé DEPUIS le cockpit pour une spec désignée (H4b, lot 10, pas encore câblé)", "7,10"],
  "delete-copy": ["adopte", "texte du dialogue de suppression", "9-10"],
  "delete-dialog": ["adopte", "un des 3 <dialog>, action backlog", "9-10"],
  "delete-item": ["adopte", "action « supprimer » du menu contextuel", "9-10"],
  "delete-title": ["adopte", "titre du dialogue de suppression", "9-10"],
  "edit-item": ["adopte", "action « modifier » du menu contextuel", "9-10"],
  "feature-agent": ["adopte", "champ du dialogue de détail", "9-10"],
  "feature-criteria": ["adopte", "champ du dialogue de détail", "9-10"],
  "feature-dependency": ["adopte", "champ du dialogue de détail", "9-10"],
  "feature-description": ["adopte", "champ du dialogue de détail", "9-10"],
  "feature-dialog": ["adopte", "un des 3 <dialog>, voir détails", "9-10"],
  "feature-done": ["adopte", "bouton fermer, dialogue de détail", "9-10"],
  "feature-edit": ["adopte", "bouton modifier, dialogue de détail", "9-10"],
  "feature-kind": ["adopte", "champ du dialogue de détail", "9-10"],
  "feature-priority": ["adopte", "champ du dialogue de détail", "9-10"],
  "feature-status": ["adopte", "champ du dialogue de détail", "9-10"],
  "feature-title": ["adopte", "titre du dialogue de détail", "9-10"],
  "feature-updated": ["adopte", "champ du dialogue de détail", "9-10"],
  "item-description": ["adopte", "champ du formulaire d'ajout", "9-10"],
  "item-priority": ["adopte", "champ du formulaire d'ajout", "9-10"],
  "launch-divider": ["adopte", "séparateur du menu contextuel", "9-10"],
  "link-front-sec": ["adopte", "connexion du graphe, F8/F9", "3"],
  "link-front-tests": ["adopte", "connexion du graphe, F8/F9", "3"],
  "link-front2-review": ["adopte", "connexion du graphe, F8/F9", "3"],
  "link-reprise": ["adopte", "connexion de reprise, F8/F9", "3"],
  "link-sec-front2": ["adopte", "connexion du graphe, F8/F9", "3"],
  "link-spec-front": ["adopte", "connexion du graphe, F8/F9", "3"],
  "link-tests-front2": ["adopte", "connexion du graphe, F8/F9", "3"],
  "main-content": ["adopte", "cible du lien d'évitement, structurel", "3"],
  "menu-launch-cycle": ["adopte", "action « lancer » du menu contextuel", "9-10"],
  "motion-note": ["adopte", "note de mouvement du panneau cycle", "3"],
  "open-add-item": ["adopte", "ouverture du dialogue d'ajout", "9-10"],
  "prompt": ["adopte", "champ de saisie du composer — ⚠️ COLLISION D'IDENTIFIANT non résolue avec le `#prompt` déjà posé par feature-008 (textarea de rédaction de spec, index.html) : à trancher au lot 11 (L11 du plan), pas ici", "11"],
  "selected-code": ["adopte", "sigle du passage sélectionné, bottom sheet F11", "3"],
  "selected-duration": ["adopte", "durée du passage sélectionné, F11", "3"],
  "selected-files": ["adopte", "fichiers du passage sélectionné, F11 — donnée mesurée (liseret)", "3"],
  "selected-state": ["adopte", "état du passage sélectionné, F11", "3"],
  "selected-task": ["adopte", "tâche du passage sélectionné, F11", "3"],
  "selected-title": ["adopte", "titre du passage sélectionné, F11", "3"],
  "selected-tokens": ["adopte", "chiffre de jetons, GATE lecture transcripts", "12"],
  "selected-tools": ["adopte", "appels d'outils du passage sélectionné — donnée mesurée", "3"],
  "summary-active": ["adopte", "bande de résumé, agents actifs", "3"],
  "summary-step": ["adopte", "bande de résumé, étape en cours", "3"],
  "summary-time": ["adopte", "bande de résumé, chronomètre", "3"],
  "summary-tokens": ["adopte", "chiffre de jetons agrégé, GATE lecture transcripts", "12"],
  "view-details": ["adopte", "action « voir détails » du menu contextuel", "9-10"],
};

const PARTITION_CLASSES = {
  "account-button": ["adopte", "mauvaise lecture d'ADR-0020, rectifiée, cf. ADR-0039 §2 : son §1 (un centre appartient à UN développeur, pas de comptes/rôles) ne porte AUCUN des mots projet/barre/switcher/avatar/notification — vérifié, 0 occurrence chacun", "7"],
  "active": ["adopte", "légende des états", "3"],
  "active-card": ["adopte", "modificateur visuel de carte en cours", "4"],
  "add-item-actions": ["adopte", "dialogue d'ajout", "9-10"],
  "add-item-body": ["adopte", "dialogue d'ajout", "9-10"],
  "add-item-button": ["adopte", "action « ajouter », backlog", "9-10"],
  "add-item-dialog": ["adopte", "un des 3 <dialog>", "9-10"],
  "add-item-form": ["adopte", "dialogue d'ajout", "9-10"],
  "agent-code": ["adopte", "graphe d'agents, F8", "4"],
  "agent-data": ["adopte", "graphe d'agents, F8", "4"],
  "agent-duration": ["adopte", "graphe d'agents, F8", "4"],
  "agent-face": ["adopte", "graphe d'agents, F8", "4"],
  "agent-name": ["adopte", "graphe d'agents, F8", "4"],
  "agent-node": ["adopte", "graphe d'agents, F8", "2"],
  "agent-wrap": ["adopte", "graphe d'agents, F8", "3"],
  "app-shell": ["adopte", "conteneur racine", "3"],
  "avatar": ["adopte", "mauvaise lecture d'ADR-0020, rectifiée, cf. ADR-0039 §2 : son §1 (un centre appartient à UN développeur, pas de comptes/rôles) ne porte AUCUN des mots projet/barre/switcher/avatar/notification — vérifié, 0 occurrence chacun", "7"],
  "backlog": ["adopte", "section kanban, F10", "3"],
  "backlog-count": ["adopte", "kanban, F10", "3"],
  "brand": ["adopte", "identité de la barre supérieure", "3"],
  "brand-mark": ["adopte", "identité de la barre supérieure", "3"],
  "brand-row": ["adopte", "identité de la barre supérieure", "3"],
  "bubble": ["adopte", "bulle de message, panneau de conversation", "11"],
  "cancel": ["adopte", "bouton annuler, dialogues", "9-10"],
  "card-footer": ["adopte", "carte kanban, F10", "4"],
  "card-title-button": ["adopte", "ouvre le dialogue de détail (action différée)", "9-10"],
  "claude-ident": ["adopte", "panneau de conversation", "11"],
  "claude-mark": ["adopte", "panneau de conversation", "11"],
  "claude-panel": ["adopte", "panneau de conversation", "11"],
  "claude-status": ["adopte", "panneau de conversation", "11"],
  "claude-title": ["adopte", "panneau de conversation", "11"],
  "column-doing": ["adopte", "kanban, F10", "4"],
  "column-done": ["adopte", "kanban, F10", "2"],
  "column-label": ["adopte", "kanban, F10", "2"],
  "column-title": ["adopte", "kanban, F10", "4"],
  "column-todo": ["adopte", "kanban, F10", "2"],
  "composer": ["adopte", "champ de saisie vers Claude", "11"],
  "confirm": ["adopte", "bouton confirmer, dialogue de suppression", "9-10"],
  "connector-layer": ["adopte", "graphe d'agents, F8/F9", "3"],
  "context-menu": ["adopte", "menu contextuel des actions backlog", "9-10"],
  "conversation": ["adopte", "panneau de conversation", "11"],
  "cycle-canvas": ["adopte", "graphe d'agents, F8/F9", "3"],
  "cycle-heading-row": ["adopte", "en-tête du panneau cycle", "3"],
  "cycle-subtitle": ["adopte", "en-tête du panneau cycle", "3"],
  "cycle-surface": ["adopte", "panneau cycle", "3"],
  "cycle-tabs": ["adopte", "sélection cycle actif / historique, role=group (pas tab)", "3"],
  "cycle-toolbar": ["adopte", "panneau cycle", "3"],
  "danger": ["adopte", "variante de bouton, menu contextuel (supprimer)", "9-10"],
  "detail-sheet": ["adopte", "bottom sheet de détail, F11", "3"],
  "dialog-actions": ["adopte", "dialogue de suppression", "9-10"],
  "feature-card": ["adopte", "carte kanban, F10", "4"],
  "feature-chip": ["adopte", "dialogue de détail", "9-10"],
  "feature-close": ["adopte", "fermeture de dialogue", "9-10"],
  "feature-dialog": ["adopte", "un des 3 <dialog>", "9-10"],
  "feature-dialog-actions": ["adopte", "dialogue de détail", "9-10"],
  "feature-dialog-body": ["adopte", "dialogue de détail", "9-10"],
  "feature-dialog-header": ["adopte", "dialogue de détail", "9-10"],
  "feature-dialog-heading": ["adopte", "dialogue de détail", "9-10"],
  "feature-fact": ["adopte", "dialogue de détail", "9-10"],
  "feature-facts": ["adopte", "dialogue de détail", "9-10"],
  "feature-kind": ["adopte", "dialogue de détail", "9-10"],
  "feature-meta": ["adopte", "dialogue de détail", "9-10"],
  "feature-section": ["adopte", "dialogue de détail", "9-10"],
  "field-help": ["adopte", "formulaire d'ajout", "9-10"],
  "field-label": ["adopte", "formulaire d'ajout", "9-10"],
  "file-dots": ["adopte", "pastilles de fichiers, F8 (plafonnées à 3)", "4"],
  "form-buttons": ["adopte", "formulaire d'ajout", "9-10"],
  "form-field": ["adopte", "formulaire d'ajout", "9-10"],
  "form-grid": ["adopte", "formulaire d'ajout", "9-10"],
  "form-intro": ["adopte", "formulaire d'ajout", "9-10"],
  "full": ["adopte", "formulaire d'ajout, modificateur de grille", "9-10"],
  "high": ["adopte", "dialogue de détail, variante de badge", "9-10"],
  "icon-button": ["adopte", "5 instances dans le prototype (l.655 notification-button lot 7 — livré, l.659 « Ouvrir les réglages » — AUCUNE spec ne porte de fonctionnalité réglages ce cycle, assignée lot 7 — livré, reste INERTE avec ce motif affiché (H6), pas de propriétaire fonctionnel ; l.757 « Options de la conversation », claude-panel, lot 11 ; l.811 close-feature et l.825 close-add-item, lot 9-10). Classe utilitaire PARTAGÉE, jamais réductible à un seul lot — 2 instances sur 5 livrées, la classe reste comptée non-livrée tant que 9-10 et 11 ne le sont pas. L'ancienne note du lot 0, qui affirmait qu'aucune de ses cinq instances n'entrait au périmètre, était fausse ; elle est réécrite ici, pas reportée", "7,9-10,11"],
  "kanban-actions": ["adopte", "kanban, F10", "3"],
  "kanban-column": ["adopte", "kanban, F10", "4"],
  "kanban-grid": ["adopte", "kanban, F10", "4"],
  "kanban-heading": ["adopte", "kanban, F10", "3"],
  "kanban-title-row": ["adopte", "kanban, F10", "3"],
  "kanban-viewport": ["adopte", "kanban, F10, role=region", "3"],
  "launch-action": ["adopte", "action « lancer », menu contextuel", "9-10"],
  "legend": ["adopte", "légende des états, role=group", "3"],
  "live-label": ["adopte", "indicateur « vivant », brancher sur actifs (PIEGES §17)", "3"],
  "main": ["adopte", "conteneur principal", "3"],
  "menu-divider": ["adopte", "menu contextuel", "9-10"],
  "menu-icon": ["adopte", "menu contextuel", "9-10"],
  "menu-item": ["adopte", "menu contextuel, role=menuitem", "9-10"],
  "message": ["adopte", "panneau de conversation", "11"],
  "message-avatar": ["adopte", "panneau de conversation", "11"],
  "metric": ["adopte", "bottom sheet de détail, F11", "3"],
  "more-button": ["adopte", "ouvre le menu contextuel", "9-10"],
  "motion-note": ["adopte", "note de mouvement", "3"],
  "notification-badge": ["adopte", "mauvaise lecture d'ADR-0020, rectifiée, cf. ADR-0039 §2 : son §1 (un centre appartient à UN développeur, pas de comptes/rôles) ne porte AUCUN des mots projet/barre/switcher/avatar/notification — vérifié, 0 occurrence chacun", "7"],
  "notification-button": ["adopte", "mauvaise lecture d'ADR-0020, rectifiée, cf. ADR-0039 §2 : son §1 (un centre appartient à UN développeur, pas de comptes/rôles) ne porte AUCUN des mots projet/barre/switcher/avatar/notification — vérifié, 0 occurrence chacun", "7"],
  "ok": ["adopte", "statut dépôt/tests, repo-strip", "4"],
  "parallel": ["adopte", "légende des états + modificateur agent-node", "3"],
  "primary": ["adopte", "bouton principal, dialogue de détail", "9-10"],
  "priority-high": ["adopte", "badge de priorité, kanban", "4"],
  "progress-track": ["adopte:redefini", "PAS l'anneau : mesuré 3 instances dans le prototype (l.783,784,785), toutes dans .feature-card — barre linéaire 6px, role=progressbar, pourcentage affiché. Adoptée redéfinie (K4 : grandeur de progression à définir, mesurée, sinon la carte n'en porte pas). Distincte de l'anneau `--progress` sur .agent-node, déjà livré (lot 2/4) — jamais fusionnées", "10"],
  "project-switcher": ["adopte", "mauvaise lecture d'ADR-0020, rectifiée, cf. ADR-0039 §2 : son §1 (un centre appartient à UN développeur, pas de comptes/rôles) ne porte AUCUN des mots projet/barre/switcher/avatar/notification — vérifié, 0 occurrence chacun", "7"],
  "question": ["adopte", "question en attente, panneau de conversation", "11"],
  "repo-strip": ["adopte", "état du dépôt, donnée existante", "3"],
  "reprise": ["adopte", "légende des états", "3"],
  "required-note": ["adopte", "formulaire d'ajout", "9-10"],
  "secondary": ["adopte", "bouton secondaire, dialogue de détail", "9-10"],
  "selected-agent": ["adopte", "bottom sheet, F11", "3"],
  "selected-copy": ["adopte", "bottom sheet, F11", "3"],
  "selected-mark": ["adopte", "bottom sheet, F11", "3"],
  "send-button": ["adopte", "composer, panneau de conversation", "11"],
  "sheet-handle": ["adopte", "bottom sheet, F11", "3"],
  "sheet-heading": ["adopte", "bottom sheet, F11", "3"],
  "sheet-metrics": ["adopte", "bottom sheet, F11", "3"],
  "sheet-toggle": ["adopte", "bottom sheet, F11", "3"],
  "skip-link": ["adopte", "accessibilité, lien d'évitement", "3"],
  "small-button": ["adopte", "sélection de cycle / filtre backlog", "3"],
  "state-pending": ["adopte", "grammaire d'état du disque, F16", "4"],
  "status-dot": ["adopte", "indicateur « vivant »", "4"],
  "status-inline": ["adopte", "indicateur « vivant »", "3"],
  "submit": ["adopte", "formulaire d'ajout", "9-10"],
  "summary-band": ["adopte", "bande de résumé", "3"],
  "summary-copy": ["adopte", "bande de résumé", "3"],
  "summary-icon": ["adopte", "bande de résumé", "3"],
  "summary-item": ["adopte", "bande de résumé", "3"],
  "tab-button": ["adopte", "cycle actif / historique — bouton, pas role=tab", "3"],
  "todo": ["adopte", "badge de statut, dialogue de détail", "9-10"],
  "token-value": ["adopte", "chiffre de jetons au centre du disque, GATE", "12"],
  "tool-ticks": ["adopte", "graduations radiales, F8 (12 fixes)", "4"],
  "top-actions": ["adopte", "barre supérieure — les 3 boutons différés au lot 0 (project-switcher, notification-*, account-button) reviennent au périmètre lot 7, voir leurs propres entrées", "3"],
  "top-app-bar": ["adopte", "barre supérieure", "3"],
  "type-option": ["adopte", "formulaire d'ajout", "9-10"],
  "type-segment": ["adopte", "formulaire d'ajout", "9-10"],
  "user-name": ["adopte", "mauvaise lecture d'ADR-0020, rectifiée, cf. ADR-0039 §2 : son §1 (un centre appartient à UN développeur, pas de comptes/rôles) ne porte AUCUN des mots projet/barre/switcher/avatar/notification — vérifié, 0 occurrence chacun", "7"],
  "visually-hidden": ["adopte", "utilitaire a11y, déjà utilisé en contexte adopté (a11y-announcement, repo-strip)", "3"],
  "work-dot": ["adopte", "graphe d'agents, F8/F9", "4"],
  "work-orbit": ["adopte", "graphe d'agents, F8/F9", "4"],
  "workspace": ["adopte", "grille cycle + conversation", "3"],
};

/* Note de méthode (lot 6) — comment le champ `lot` des 97 éléments déjà
 * ADOPTÉS avant cette réouverture a été établi : script à usage unique,
 * PAS conservé dans le dépôt (un script jetable n'est pas une garde — s'il
 * fallait re-dériver ce champ, il se réécrirait en 30 lignes contre
 * `git show <commit>:control-center/web/<fichier>` pour chacun des 6
 * commits du cycle 2, en cherchant la PREMIÈRE apparition du sélecteur
 * comme règle CSS (`.token` hors composé, ex. `.jauge.ok` ne compte PAS
 * pour `ok`), attribut `id="token"`, ou classe posée dans `class="…"`/
 * `classList`/`className`. Un seul faux positif rencontré et corrigé à la
 * main : `ok` collisionnait avec `.jauge.ok`, une classe PRÉ-EXISTANTE au
 * cycle 2 (fonctionnalité de pilotage), sans rapport avec `.ok` du
 * `repo-strip` — vérifié : `repo-strip`/`.ok` de ce badge n'apparaît qu'au
 * commit `f53a293` (lot 4).
 */

// Un élément est DÉJÀ LIVRÉ (posé dans index.html/app.css AUJOURD'HUI) si
// TOUS les tokens de son champ `lot` sont un entier nu de 0 à 5 (les six
// lots clos avant cette réouverture de périmètre). Tout autre token — une
// plage ("7-8", "9-10"), un lot à deux chiffres seul ("11", "12"), ou un
// mélange ("8,10") — désigne un travail FUTUR du plan, pas encore écrit.
//
// ⚠️ Consommé par F3a (`test_conformite_classes.js`) et F4a
// (`test_conformite_a11y.js`) : ces deux gardes filtraient auparavant sur
// `verdict === ADOPTE` seul, ce qui suffisait tant qu'`ADOPTE` ne désignait
// QUE les ~97 éléments déjà construits. Depuis la réouverture de périmètre,
// `ADOPTE` désigne les 199 éléments DU CYCLE ENTIER (lots 0 à 12) : filtrer
// sur le seul verdict ferait échouer F3a/F4a pour la MAUVAISE raison (des
// éléments légitimement pas encore écrits, pas une régression) — exactement
// le défaut que la règle non négociable n°2 interdit. `lotEstDejaLivre`
// referme ce trou : la cible de F3a/F4a reste « déjà construit », comme
// avant, sans jamais recopier à la main la liste des lots clos.
const LOTS_DEJA_LIVRES = new Set(["0", "1", "2", "3", "4", "5", "7"]);
function lotEstDejaLivre(lotField) {
  return String(lotField).split(",").map((s) => s.trim()).every((tok) => LOTS_DEJA_LIVRES.has(tok));
}

module.exports = {
  ADOPTE, ADOPTE_REDEFINI,
  LOT_FEATURE_022, LOT_FEATURE_023, LOT_FEATURE_025,
  LOTS_DEJA_LIVRES, lotEstDejaLivre,
  PARTITION_IDS, PARTITION_CLASSES,
};
