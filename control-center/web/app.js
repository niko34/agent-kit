/* Centre de contrôle — lecture, et pilotage sous garde-fous (feature-007).
 *
 * Le flux SSE transporte un SIGNAL, pas l'état. Le navigateur redemande
 * `/api/etat` quand il reçoit le signal — un état poussé et un état demandé
 * pourraient diverger, et il faudrait alors décider lequel fait foi.
 */
"use strict";

const $ = (id) => document.getElementById(id);

/* Tout ce qui vient du dépôt — titres de specs, statuts, noms de fichiers,
 * sujets de commit — est du texte écrit par des humains et des agents. Il passe
 * par `textContent`, jamais par `innerHTML`. */
function el(balise, classe, texte) {
  const noeud = document.createElement(balise);
  if (classe) noeud.className = classe;
  if (texte !== undefined && texte !== null) noeud.textContent = String(texte);
  return noeud;
}

function vider(noeud) {
  while (noeud.firstChild) noeud.removeChild(noeud.firstChild);
}

function heure(iso) {
  if (!iso) return "";
  const t = String(iso);
  return t.length >= 19 ? t.slice(11, 19) : t;
}

/* Délègue à `texteDuree()` (diagramme.js) — SEUL formateur de durée du
 * module (feature-020, complément « format des durées »). Les deux fichiers
 * partagent la portée globale d'un script classique (pas d'`import`,
 * ADR-0006, cf. `index.html`) : appeler `texteDuree` ici n'est pas une
 * duplication de règle, c'est le même code. `ms` numérique est toujours
 * accepté par `texteDuree` quel que soit `termine` — seul le cas non
 * numérique en dépend, et cette fonction ne l'atteint jamais grâce à la garde
 * ci-dessous. Le contrat `null` (« pas mesurable ≠ zéro ») reste local à
 * `app.js`, car `texteDuree` ne le connaît pas (elle renvoie un texte pour
 * tout ce qui n'est pas un nombre). */
function duree(ms) {
  if (ms === null || ms === undefined) return null;   /* pas mesurable ≠ zéro */
  /* Repli bug-020 : sans `diagramme.js` (404, cache, oubli de relancer le
   * serveur après un fichier neuf — PIEGES.md §8), `texteDuree` n'existe
   * pas et l'exception remonterait jusqu'au `catch` global de
   * `rafraichir()`, qui l'afficherait à tort comme « serveur injoignable »
   * — alors que c'est la TABLE DES PASSAGES, pas le diagramme, qui appelle
   * `duree()`. Ce chemin n'est atteint qu'en mode dégradé, où le diagramme
   * n'existe déjà plus à l'écran (`construireDiagramme` retourne `null` au
   * même défaut) : les deux écritures ne peuvent donc jamais coexister,
   * et ne peuvent pas diverger en fonctionnement normal. */
  if (typeof texteDuree !== "function") return Math.round(ms / 1000) + " s";
  return texteDuree(ms, true);
}

/* Temps écoulé depuis `derniere_activite`, pour le SEUL registre « sans
 * clôture » (`etat` additif, bug-013/feature-010) : un segment mort depuis
 * des heures s'exprime en heures, jamais en minutes à quatre chiffres. */
function dureeDepuisIso(iso) {
  if (!iso) return null;
  const debut = Date.parse(String(iso));
  if (Number.isNaN(debut)) return null;
  const ms = Date.now() - debut;
  if (ms < 0) return null;
  if (ms < 3600000) return Math.max(1, Math.round(ms / 60000)) + " min";
  return Math.round(ms / 3600000) + " h";
}

/* Le champ « Priorité » est du Markdown écrit à la main. Il arrivait brut dans
 * l'interface — « **Haute** — un crash n », « ~~Moyenne — fausse une » — avec
 * les astérisques visibles et une coupure au milieu d'un mot.
 *
 * On retire l'emphase, on garde la PREMIÈRE clause (avant le tiret cadratin ou
 * la parenthèse), et on coupe sur une frontière de mot. Le texte intégral reste
 * accessible en infobulle : on raccourcit l'affichage, on ne perd rien. */
function nettoyerPriorite(brut) {
  if (!brut) return null;
  let texte = String(brut)
    .replace(/\*\*|~~|`|__/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const coupure = texte.search(/\s[—–-]\s|\s\(/);
  if (coupure > 0) texte = texte.slice(0, coupure);
  texte = texte.replace(/[,;:.]+$/, "").trim();
  if (texte.length > 20) {
    const espace = texte.lastIndexOf(" ", 20);
    texte = texte.slice(0, espace > 8 ? espace : 20) + "…";
  }
  return texte || null;
}

/* ------------------------------------------------------- sigle d'agent ---
 * Deux lettres par rôle, déterministes et distinctes (feature-015 A7,
 * docs/DESIGN-SYSTEM.md §8). Livré par feature-015 SANS appelant ; feature-016
 * en est le premier — table des passages, désignation d'un cycle et centre du
 * disque d'agent (`.agent-code`, F8) le consomment. Plus de jeton de couleur
 * par rôle (`--a-<rôle>`/`--f-<rôle>` retirés, ADR-0032) : seul le texte du
 * sigle porte l'identité désormais (voir `construireIdentiteAgent`).
 *
 * Règle : les deux premières lettres du premier segment du nom, en
 * majuscules (« spec-reader » → SP, « security-reviewer » → SE). En cas de
 * collision, désambiguïsation déterministe et INDÉPENDANTE de l'ordre
 * d'arrivée : les rôles sont d'abord triés alphabétiquement, puis pour
 * chaque collision on essaie la première lettre suivie d'une lettre encore
 * libre du même segment, puis, à défaut, la première lettre suivie d'un
 * chiffre dérivé d'un FNV-1a du nom complet — jamais un compteur qui
 * dépendrait de l'ordre de découverte. */
function empreinteFnv1a(texte) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/* Sentinelle du segment « agent principal » (backend/events.py:57,
 * `AGENT_PRINCIPAL`) — recopiée ici en littéral : ce fichier n'importe rien
 * du backend (CSP `default-src 'self'`, ADR-0006). Table appliquée
 * UNIQUEMENT à cette sentinelle EXACTE (feature-020, défaut G) : un agent
 * réel nommé `ap-*` garde son sigle calculé, seul « (agent principal) »
 * emprunte « AP » (vérifié : ne collisionne avec aucun des sigles des onze
 * rôles déclarés — AR BA CO DE DO FR OR SE SP TE UX). Sans cette table, la
 * règle générale calculerait « (A », un sigle faux. */
const SIGLES_SPECIAUX = { "(agent principal)": "AP" };

function sigleAgent(nomRole, siglesDejaPris) {
  const pris = siglesDejaPris || new Set();
  if (Object.prototype.hasOwnProperty.call(SIGLES_SPECIAUX, nomRole)) {
    const special = SIGLES_SPECIAUX[nomRole];
    if (!pris.has(special)) return special;
  }
  const segment = String(nomRole).split("-")[0].toUpperCase();
  const premiere = segment[0] || "?";
  let candidat = premiere + (segment[1] || "");
  if (!pris.has(candidat)) return candidat;
  for (let i = 2; i < segment.length; i++) {
    candidat = premiere + segment[i];
    if (!pris.has(candidat)) return candidat;
  }
  const empreinte = empreinteFnv1a(String(nomRole));
  for (let decalage = 0; decalage < 10; decalage++) {
    candidat = premiere + String((empreinte + decalage) % 10);
    if (!pris.has(candidat)) return candidat;
  }
  return candidat; // improbable : segment épuisé ET les 10 chiffres pris
}

/* Calcule les sigles de TOUT un ensemble de rôles en une passe, dans l'ordre
 * alphabétique — c'est ce qui rend le résultat indépendant de l'ordre
 * d'arrivée des rôles (un agent découvert plus tard ne redistribue jamais
 * les sigles déjà attribués aux autres). */
function siglesAgents(nomsRoles) {
  const tries = Array.from(new Set(nomsRoles)).sort((a, b) => a.localeCompare(b, "fr"));
  const pris = new Set();
  const resultat = new Map();
  for (const nom of tries) {
    const sigle = sigleAgent(nom, pris);
    pris.add(sigle);
    resultat.set(nom, sigle);
  }
  return resultat;
}

/* ------------------------------------------------------------- identité -- *
 * feature-021, cycle 2, lot 7, GATE S4. `etat.identite` (backend, `vcs.py`
 * `identite()`, SEULE source autorisée : `git config --get user.name`) est
 * soit une chaîne non vide, soit `null`/absente (dépôt sans identité
 * déclarée, ou `git` indisponible). AUCUNE fabrication ici : pas d'email,
 * pas de nom d'utilisateur système — S4.1 l'interdit explicitement. */
function initialesDepuisNom(nom) {
  if (typeof nom !== "string") return null;
  const mots = nom.trim().split(/\s+/).filter(Boolean);
  if (!mots.length) return null;
  const initiales = mots.length === 1
    ? mots[0].slice(0, 2)
    : mots[0].slice(0, 1) + mots[mots.length - 1].slice(0, 1);
  return initiales.toUpperCase() || null;
}

/* S4.2 : initiales dérivées CÔTÉ CLIENT du nom réel — jamais une image
 * externe (la CSP `img-src 'self' data:` n'est pas assouplie pour ce lot).
 * S4.5 : `account-button` reste `aria-disabled`, n'appelle jamais aucune
 * route — cette fonction ne fait que POSER du texte, aucun `fetch`. Identité
 * ABSENTE : dégradation avec motif, JAMAIS un nom inventé (règle absolue
 * n°1, jamais de fabrication de données personnelles). */
function rendreIdentite(etat) {
  const identite = typeof etat.identite === "string" && etat.identite.trim()
    ? etat.identite.trim() : null;
  const avatar = $("avatar");
  const nomAffiche = $("user-name");
  const bouton = $("account-button");
  if (identite) {
    avatar.textContent = initialesDepuisNom(identite) || "…";
    nomAffiche.textContent = identite;
    bouton.setAttribute("aria-label",
      "Compte de " + identite + " — aucune action de compte disponible depuis l'interface");
  } else {
    avatar.textContent = "?";
    nomAffiche.textContent = "Identité inconnue";
    bouton.setAttribute("aria-label",
      "Compte — identité non disponible, aucune action de compte disponible depuis l'interface");
  }
}

/* ---------------------------------------------------------------- agents -- */
function rendreAgents(agents) {
  const liste = $("agents");
  vider(liste);
  if (!agents.length) {
    /* État vide explicite, qui dit quoi faire (§8, feature-019) — pas une
     * liste muette. */
    liste.appendChild(el("li", "vide",
      "aucun agent découvert — vérifiez que le dépôt déclare des agents "
      + "sous .claude/agents/"));
    $("note-agents").textContent = "";
    return;
  }
  agents.forEach((agent) => {
    const ligne = el("li", agent.actif_sur ? "actif" : "");
    const gauche = el("div");
    gauche.appendChild(el("span", "nom", agent.nom));
    if (agent.actif_sur) gauche.appendChild(el("span", "plume", " ● en cours"));
    ligne.appendChild(gauche);
    const droite = el("div");
    droite.appendChild(el("span", "modele", agent.modele || "—"));
    droite.appendChild(el("span", "plume", agent.peut_ecrire ? " ✎" : " ·"));
    ligne.appendChild(droite);
    ligne.title = (agent.description || agent.nom) +
      "\nOutils : " + (agent.outils.join(", ") || "—") +
      (agent.peut_deleguer ? "\nPeut déléguer (Task)" : "\nNe peut pas déléguer (pas de Task)");
    liste.appendChild(ligne);
  });
  $("note-agents").textContent =
    agents.length + " agents découverts · ✎ = peut écrire";
}

/* --------------------------------------------------------------- système -- */
/* Le suffixe « appliqué / non appliqué » vient du MÊME champ `ecriture_active`
 * que le badge d'en-tête (voir rendreBadgePilotage) — jamais d'une déduction
 * séparée sur `commandes_declarees.length` ou une constante. C'est le défaut
 * d'origine de ce module (app.js affichait les garde-fous comme s'ils étaient
 * en vigueur alors qu'aucun code ne les appliquait) ; le corriger ici sans
 * changer la source laisserait la moitié du mensonge intacte. */
function rendreSysteme(etat) {
  const dl = $("systeme");
  vider(dl);
  const suffixe = etat.ecriture_active ? "appliqué" : "non appliqué (lecture seule)";
  const lignes = [
    ["Dépôt", etat.git.depot ? (etat.git.branche || "?") : "absent", null],
    ["Fichiers touchés", etat.git.touches.length, null],
    ["Divergences", etat.divergences, null],
    ["Workflows", etat.workflows.length, null],
    ["Configuration", etat.config_lue ? "lue" : "défauts", null],
    ["Commandes", etat.commandes_declarees.length, null],
    ["Budget max", (etat.garde_fous.budget_max_usd ?? "—") + " $", suffixe],
    ["Écrivains", etat.garde_fous.ecrivains_simultanes ?? "—", suffixe],
  ];
  lignes.forEach(([cle, valeur, suffixeLigne]) => {
    dl.appendChild(el("dt", "", cle));
    const dd = el("dd", "", valeur);
    if (suffixeLigne) dd.appendChild(el("span", "suffixe-ecriture", " · " + suffixeLigne));
    dl.appendChild(dd);
  });
}

/* ---------------------------------------------------------------- kanban -- */
let dernierEtat = null;

function specCorrespond(spec, terme, divergencesSeules) {
  if (divergencesSeules && !spec.divergence) return false;
  if (!terme) return true;
  const champs = [spec.id, spec.titre, spec.statut_texte, spec.priorite, spec.type];
  return champs.some((c) => c && String(c).toLowerCase().indexOf(terme) !== -1);
}

/* F10 (feature-021, cycle 2, lot 5) — grille M3 `kanban-grid`/`kanban-column`/
 * `feature-card`, lue depuis `etat.colonnes` (ADR-0003) : jamais figée à
 * Todo/Doing/Done, une configuration qui renomme ou réordonne ses colonnes
 * change le rendu SANS toucher à ce fichier. `colonne.classe` (déclaré par
 * `config.py`, PAS un nom choisi ici) porte le double rôle de sélecteur CSS
 * (`kanban-column column-<classe>`) et de clé de filtrage des specs — c'est
 * la MÊME donnée aux deux endroits, jamais recopiée.
 *
 * Remplace l'ancien rendu `.colonne`/`.carte` (feature-008) : les classes
 * qu'il posait n'existent plus nulle part ailleurs dans ce fichier — les
 * règles CSS correspondantes sont retirées d'`app.css` dans le même lot
 * (sinon F3b, qui vérifie qu'aucune classe déclarée ne reste sans porteur,
 * les trouverait orphelines). */
function rendreKanban(etat) {
  const grille = $("kanban");
  vider(grille);
  /* F12 : cas limite non traité par la maquette — aucune colonne déclarée
   * (config absente ou vide). État vide explicite, jamais une grille
   * silencieusement blanche. */
  if (!etat.colonnes || !etat.colonnes.length) {
    grille.appendChild(el("p", "vide",
      "aucune colonne déclarée — vérifiez [colonnes] dans control-center.toml"));
    $("compteur-specs").textContent = "0 spec";
    const compteBacklogVide = $("backlog-count");
    if (compteBacklogVide) compteBacklogVide.textContent = "0 spec";
    const compteColonnesVide = $("backlog-column-count");
    if (compteColonnesVide) compteColonnesVide.textContent = "0 colonne";
    return;
  }
  const terme = ($("filtre").value || "").trim().toLowerCase();
  const divergencesSeules = $("filtre-divergences").checked;
  let affichees = 0;

  etat.colonnes.forEach((colonne) => {
    const toutes = etat.specs.filter((s) => s.colonne === colonne.classe);
    const specs = toutes.filter((s) => specCorrespond(s, terme, divergencesSeules));
    affichees += specs.length;

    const section = el("section", "kanban-column column-" + colonne.classe);
    const titre = el("div", "column-title");
    const label = el("span", "column-label");
    label.appendChild(el("i"));
    label.appendChild(document.createTextNode(colonne.libelle));
    titre.appendChild(label);
    /* Quand un filtre est actif, on montre les DEUX nombres : cacher le total
     * ferait croire que la colonne a rétréci. */
    titre.appendChild(el("span", "",
      specs.length === toutes.length ? String(toutes.length)
                                     : specs.length + " / " + toutes.length));
    section.appendChild(titre);

    /* feature-025 (lots 9-10) : la MÊME position que `gestion_spec.
     * role_colonne()` (ADR-0003 — jamais un nom de colonne codé en dur)
     * décide ce qu'une carte de CETTE colonne peut proposer : lancer et
     * supprimer seulement en première colonne, modifier partout sauf la
     * dernière (close/immuable, GATE P1 S2.2). */
    const role = roleColonneClient(etat, colonne.classe);
    const eligibleLancement = role === "premiere";
    const eligibleModification = role !== "derniere";
    const eligibleSuppression = role === "premiere";

    specs.forEach((spec) => {
      const carte = el("article", "feature-card");
      carte.setAttribute("data-feature-id", spec.id);

      /* `.more-button` (⋮) — ouvre `#context-menu`, markup repris du
       * prototype l.774. `data-*` posés par `setAttribute`, jamais
       * `.dataset` (absent du bac à sable `vm` de ce module). */
      const plus = el("button", "more-button");
      plus.type = "button";
      plus.setAttribute("aria-label", "Actions pour " + spec.id);
      plus.setAttribute("aria-haspopup", "menu");
      plus.setAttribute("aria-controls", "context-menu");
      plus.setAttribute("aria-expanded", "false");
      plus.setAttribute("data-menu-for", spec.id);
      plus.setAttribute("data-launchable", eligibleLancement ? "true" : "false");
      plus.setAttribute("data-editable", eligibleModification ? "true" : "false");
      plus.setAttribute("data-supprimable", eligibleSuppression ? "true" : "false");
      const plusIcone = el("span", "", "⋮");
      plusIcone.setAttribute("aria-hidden", "true");
      plus.appendChild(plusIcone);
      plus.addEventListener("click", (evenement) => {
        if (evenement && typeof evenement.stopPropagation === "function") evenement.stopPropagation();
        ouvrirMenuContextuel(plus, spec.id);
      });
      carte.appendChild(plus);

      const entete = el("h3");
      const titreBouton = el("button", "card-title-button",
        spec.titre && spec.titre !== spec.id ? spec.id + " · " + spec.titre : spec.id);
      titreBouton.type = "button";
      titreBouton.addEventListener("click", () => ouvrirDetailFeature(spec.id));
      entete.appendChild(titreBouton);
      carte.appendChild(entete);

      /* `.progress-track` — ADOPTÉE REDÉFINIE (K4, table F0) : PAS un
       * pourcentage, l'ÉTAT DE COLONNE (voir app.css pour la justification
       * complète). Décoratif : `aria-hidden`, aucun `aria-valuenow`. */
      const piste = el("div", "progress-track etat-" + (role || "intermediaire"));
      piste.setAttribute("aria-hidden", "true");
      piste.appendChild(el("i"));
      carte.appendChild(piste);

      const bas = el("div", "card-footer");
      const priorite = nettoyerPriorite(spec.priorite);
      if (priorite) {
        const p = priorite.toLowerCase();
        const estHaute = p.indexOf("critique") === 0 || p.indexOf("haute") === 0;
        const etiquette = el("span", estHaute ? "priority-high" : "", priorite);
        etiquette.title = "Priorité, telle qu'écrite : " + spec.priorite;
        bas.appendChild(etiquette);
      } else {
        bas.appendChild(el("span"));
      }
      if (spec.divergence) {
        /* Jamais la seule couleur (§8, docs/DESIGN-SYSTEM.md) : le glyphe
         * « ≠ » et le texte portent le signal, `.divergence-flag` ne fait que
         * l'accentuer. Le statut brut est en infobulle TEL QUEL, jamais
         * réécrit : c'est une phrase écrite par un humain, pas un jeton. */
        const badge = el("span", "divergence-flag", "≠ " + colonne.libelle);
        badge.title = "Le fichier annonce : " + (spec.statut_texte || "");
        bas.appendChild(badge);
      }
      carte.appendChild(bas);
      section.appendChild(carte);
    });
    if (!specs.length) {
      section.appendChild(el("p", "vide", toutes.length ? "aucune ne correspond" : "aucune"));
    }
    grille.appendChild(section);
  });

  const filtre_actif = terme || divergencesSeules;
  const resumeSpecs = filtre_actif ? affichees + " sur " + etat.specs.length + " specs"
                                    : etat.specs.length + " specs";
  const resumeDivergences = etat.divergences + " divergence" + (etat.divergences > 1 ? "s" : "") +
    " répertoire / champ Statut";
  /* Une seule mesure (`resumeSpecs`/`resumeDivergences`), postée sur DEUX
   * porteurs (`#compteur-specs`, existant, et `#backlog-count`, adopté F0
   * mais laissé décoratif jusqu'ici) : pas une seconde source de vérité,
   * la même phrase à deux endroits du DOM (§ « Pas de duplication d'état »). */
  $("compteur-specs").textContent = resumeSpecs + " · " + resumeDivergences;
  const compteBacklog = $("backlog-count");
  if (compteBacklog) compteBacklog.textContent = resumeSpecs + " · " + resumeDivergences;
  const compteColonnes = $("backlog-column-count");
  if (compteColonnes) {
    compteColonnes.textContent = etat.colonnes.length + " colonne" + (etat.colonnes.length > 1 ? "s" : "");
  }
}

/* ------------------------------------------------------------- workflows -- */
/* Ancrage visuel du rebouclage dans la chaîne (feature-010, §8) : un agent qui
 * réapparaît APRÈS qu'un AUTRE sous-agent l'a suivi. On ignore l'agent
 * principal dans ce calcul : il s'intercale entre chaque appel de sous-agent
 * par construction (c'est lui qui orchestre), sa présence seule ne signale
 * donc rien — c'est un AUTRE sous-agent intercalé qui distingue un vrai
 * rebouclage d'un enchaînement normal. Aucun appel réseau : tout vient de
 * `segments[]`, déjà transmis. */
function indicesRepris(segments) {
  const indices = new Set();
  const sousAgents = [];
  segments.forEach((segment, index) => {
    if (segment.type !== "principal") sousAgents.push({ agent: segment.agent, index });
  });
  const dernierePosition = new Map();
  sousAgents.forEach((entree, position) => {
    const precedente = dernierePosition.get(entree.agent);
    if (precedente !== undefined && position - precedente > 1) indices.add(entree.index);
    dernierePosition.set(entree.agent, position);
  });
  return indices;
}

/* --------------------------------------------------------- identité d'agent
 * feature-016 : PREMIER appelant de `sigleAgent`/`siglesAgents` (ci-dessus).
 * L'identité colorée par agent (`--a-<rôle>`/`--f-<rôle>`) est RETIRÉE
 * (`ADR-0032`, feature-021 cycle 2 lot 4) : le disque Material 3 de la
 * maquette n'emploie aucune couleur par rôle (`ADR-0031`), et l'ADR retire
 * ce signal du tableau de bord ENTIER, pas seulement du diagramme — « le
 * rôle d'un agent se communique par le TEXTE, jamais plus par une teinte
 * qui lui serait propre » (ADR-0032 §2). `.agent-sigle`/`.agent-nom`
 * gardent leur forme (chasse fixe, contour) mais plus de couleur inline. */
function construireIdentiteAgent(nom, sigles) {
  const enveloppe = document.createDocumentFragment();
  const sigle = el("span", "agent-sigle", (sigles && sigles.get(nom)) || "??");
  sigle.setAttribute("aria-hidden", "true");
  const nomSpan = el("span", "agent-nom", nom);
  enveloppe.appendChild(sigle);
  enveloppe.appendChild(nomSpan);
  return enveloppe;
}

/* ------------------------------------------------------------ état — cycle
 * Tableau arrêté à QUATRE cases (feature-016), une seule teinte vive
 * (« en cours »), les trois autres achromatiques — §8 : aucune information
 * portée par la seule couleur, le glyphe ET le libellé (jamais tronqué,
 * quelle que soit la largeur) portent le même signal que le contour. */
const ETATS_CYCLE = {
  en_cours:     { classe: "en-cours",     glyphe: "●", libelle: "en cours" },
  termine:      { classe: "termine",      glyphe: "✓", libelle: "terminé" },
  sans_cloture: { classe: "sans-cloture", glyphe: "⋯", libelle: "sans clôture" },
  indetermine:  { classe: "indetermine",  glyphe: "?", libelle: "indéterminé" },
};
function descripteurEtat(cle) { return ETATS_CYCLE[cle] || ETATS_CYCLE.indetermine; }

function construireBadgeEtat(cle) {
  const info = descripteurEtat(cle);
  const badge = el("span", "cycle-etat " + info.classe);
  const glyphe = el("span", "glyphe", info.glyphe);
  glyphe.setAttribute("aria-hidden", "true");
  badge.appendChild(glyphe);
  badge.appendChild(document.createTextNode(" " + info.libelle));
  return badge;
}

/* Dérivation de l'état d'un CYCLE (feature-016) — lit UNIQUEMENT `passages`
 * (les sous-agents) : le segment principal a `termine: true` par construction
 * (events.py), l'inclure ferait passer à « terminé » un cycle sans sous-agent
 * encore actif. JAMAIS depuis `fin_observee_absente` (vrai pour 85,7 % des
 * cycles, ne distingue donc rien). Un passage sans `etat` (journal antérieur
 * à bug-013) n'est jamais compté « en cours » par défaut : il fait juste
 * échouer le test « tous terminés », et le cycle devient indéterminé. */
function etatCycle(wf) {
  const passages = wf.passages || [];
  if (passages.some((p) => p.etat === "en_cours")) return "en_cours";
  if (passages.some((p) => p.etat === "sans_cloture")) return "sans_cloture";
  if (passages.length && passages.every((p) => p.etat === "termine")) return "termine";
  return "indetermine";
}

function idCycleDom(workflowId) {
  /* workflow_id assaini avant usage en id HTML (item B) : format
   * `<session_id>#<indice>`, le `#` et tout caractère hors [A-Za-z0-9_-]
   * remplacés. */
  return "cycle-" + String(workflowId).replace(/[^A-Za-z0-9_-]/g, "-");
}

/* Désignation d'un cycle (feature-016) — N'INVENTE AUCUN NOM : la donnée
 * « nom de spec » n'existe pas dans le journal. Trois formes seulement,
 * toutes dérivées de champs réellement présents. */
function construireDesignation(wf, sigles) {
  const frag = document.createDocumentFragment();
  frag.appendChild(document.createTextNode(heure(wf.debut) + " — "));
  if (wf.bornage === "marqueur-agent" && wf.borne_par) {
    frag.appendChild(document.createTextNode("ouvert par "));
    frag.appendChild(construireIdentiteAgent(wf.borne_par, sigles));
  } else if (wf.bornage === "avant-premier-marqueur") {
    frag.appendChild(document.createTextNode("avant le premier repère"));
  } else {
    frag.appendChild(document.createTextNode("session entière"));
  }
  return frag;
}

function dureeIso(debutIso, finIso) {
  if (!debutIso || !finIso) return null;
  const d = Date.parse(debutIso);
  const f = Date.parse(finIso);
  if (Number.isNaN(d) || Number.isNaN(f)) return null;
  const ms = f - d;
  return ms >= 0 ? ms : null;
}

function construireResume(wf) {
  const n = (wf.passages || []).length;
  const d = duree(dureeIso(wf.debut, wf.fin_observee));
  const ecoule = dureeDepuisIso(wf.fin_observee);
  const morceaux = [n + " agent" + (n > 1 ? "s" : ""), d !== null ? d : "durée inconnue"];
  if (ecoule) morceaux.push("il y a " + ecoule);
  return morceaux.join(" · ");
}

/* Dépliement exclusif (item C) : préférence d'affichage LOCALE, tenue HORS
 * DOM (clé = `workflow_id`) — elle survit à `vider()` + reconstruction
 * complète du sous-arbre à chaque rafraîchissement. `null` = tout replié
 * (un ré-clic sur l'en-tête ouvert le referme). */
/* `null` seulement AVANT le tout premier rendu (aucun cycle encore vu) —
 * une fois un cycle affiché, un et un seul reste toujours ouvert : le
 * design (§6) décrit un dépliement EXCLUSIF, jamais un repli total, et
 * `rendreCycles` retombe de toute façon sur le plus récent si `cycleOuvert`
 * ne correspond plus à rien d'affiché. Autoriser le repli complet ferait
 * réapparaître le cycle par défaut au rafraîchissement suivant sans que
 * rien ne le signale — un aller-retour silencieux, pas un choix retenu. */
let cycleOuvert = null;

function construireEnteteCycle(wf, sigles, ouvert) {
  const h3 = el("h3", "cycle-entete");
  const bouton = el("button", "cycle-bouton");
  bouton.type = "button";
  const idBouton = idCycleDom(wf.workflow_id) + "-bouton";
  const idDetail = idCycleDom(wf.workflow_id) + "-detail";
  bouton.id = idBouton;
  bouton.setAttribute("aria-expanded", ouvert ? "true" : "false");
  bouton.setAttribute("aria-controls", idDetail);
  bouton.appendChild(construireBadgeEtat(etatCycle(wf)));
  const designation = el("span", "cycle-designation");
  designation.appendChild(construireDesignation(wf, sigles));
  bouton.appendChild(designation);
  bouton.appendChild(el("span", "cycle-resume", construireResume(wf)));
  bouton.addEventListener("click", () => {
    /* Ré-cliquer l'en-tête déjà ouvert ne fait rien : « un seul cycle visible
     * à la fois » (§6), jamais zéro — voir le commentaire sur `cycleOuvert`. */
    if (cycleOuvert === wf.workflow_id) return;
    cycleOuvert = wf.workflow_id;
    rendreCycles(dernierEtat);
  });
  h3.appendChild(bouton);
  return { h3, idBouton, idDetail };
}

/* Bloc de propriétés (item D) — chaque valeur RELIT une donnée déjà calculée,
 * n'invente aucun compte. « Agents simultanés » lit `imbrication_suspectee`
 * tel quel : c'est une SUSPICION, jamais un dénombrement (le journal ne
 * permet pas de compter des agents réellement concurrents). */
function construireProprietes(wf) {
  const dl = el("dl", "cycle-proprietes");
  const ajouter = (cle, valeur) => {
    dl.appendChild(el("dt", "", cle));
    dl.appendChild(el("dd", "", valeur));
  };
  const info = descripteurEtat(etatCycle(wf));
  ajouter("Statut", info.glyphe + " " + info.libelle);
  const d = duree(dureeIso(wf.debut, wf.fin_observee));
  ajouter("Durée", d !== null ? d : "inconnue");
  const segments = wf.segments || wf.passages || [];
  const outils = segments.reduce((total, s) => total + (s.outils || 0), 0);
  ajouter("Appels d'outils", outils);
  ajouter("Fichiers écrits", (wf.fichiers || []).length);
  ajouter("Rebouclages", indicesRepris(wf.passages || []).size);
  ajouter("Agents simultanés", wf.imbrication_suspectee ? "suspectés" : "aucun");
  return dl;
}

/* Table des passages (item F) — agent, début, durée, outils, fichiers, état.
 * Au-delà de 40 lignes (item M, pire cas mesuré : 297), les plus anciennes
 * sont repliées via `hidden`, JAMAIS retirées du DOM. */
const LIMITE_PASSAGES_VISIBLES = 40;

function construireLignePassage(passage, sigles, repris) {
  const tr = el("tr", repris ? "repris" : "");
  const tdAgent = el("td");
  const colonne = el("div", "colonne-agent");
  colonne.appendChild(construireIdentiteAgent(passage.agent, sigles));
  tdAgent.appendChild(colonne);
  tr.appendChild(tdAgent);
  tr.appendChild(el("td", "", heure(passage.debut)));
  const d = duree(passage.duree_ms);
  tr.appendChild(el("td", "", d !== null ? d : (passage.termine ? "durée invalide" : "en cours")));
  tr.appendChild(el("td", "", passage.outils || 0));
  tr.appendChild(el("td", "", (passage.fichiers || []).length));
  const tdEtat = el("td");
  tdEtat.appendChild(construireBadgeEtat(passage.etat));
  tr.appendChild(tdEtat);
  return tr;
}

function construireTablePassages(wf, sigles) {
  const passages = wf.passages || [];
  const enveloppe = document.createDocumentFragment();
  if (!passages.length) {
    /* Cas limite L : un cycle sans agent typé ne disparaît pas en silence. */
    enveloppe.appendChild(el("p", "vide", "aucun agent typé n'est apparu dans ce cycle"));
    return enveloppe;
  }
  const reprisesIdx = indicesRepris(passages);
  const excedent = Math.max(0, passages.length - LIMITE_PASSAGES_VISIBLES);
  const lignesRepliees = [];

  const table = el("table", "table-passages");
  const thead = document.createElement("thead");
  const trEntete = document.createElement("tr");
  ["Agent", "Début", "Durée", "Outils", "Fichiers", "État"].forEach((libelle) => {
    trEntete.appendChild(el("th", "", libelle));
  });
  thead.appendChild(trEntete);
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  passages.forEach((passage, index) => {
    const ligne = construireLignePassage(passage, sigles, reprisesIdx.has(index));
    if (excedent > 0 && index < excedent) {
      ligne.hidden = true;
      lignesRepliees.push(ligne);
    }
    tbody.appendChild(ligne);
  });
  table.appendChild(tbody);

  if (excedent > 0) {
    let ouvert = false;
    const bouton = el("button", "pilotage-secondaire action-repli",
      "Afficher les " + excedent + " passages plus anciens");
    bouton.type = "button";
    bouton.setAttribute("aria-expanded", "false");
    bouton.addEventListener("click", () => {
      ouvert = !ouvert;
      lignesRepliees.forEach((ligne) => { ligne.hidden = !ouvert; });
      bouton.textContent = ouvert
        ? "Masquer les " + excedent + " passages plus anciens"
        : "Afficher les " + excedent + " passages plus anciens";
      bouton.setAttribute("aria-expanded", ouvert ? "true" : "false");
    });
    enveloppe.appendChild(bouton);
  }
  enveloppe.appendChild(table);
  return enveloppe;
}

/* Chaîne des segments + notes (item E) — placeholder du diagramme visuel de
 * feature-017 : conservé À L'IDENTIQUE (aucune information perdue), les
 * libellés et infobulles ne changent pas. Seule modification (item H) : le
 * texte du maillon (`.mnom`) porte désormais l'identité de l'agent — l'état
 * reste au contour (CSS), jamais recoloré par-dessus. */
function construireChaineEtNotes(wf) {
  const enveloppe = document.createDocumentFragment();

  /* La chaîne montre les SEGMENTS, agent principal compris. Sans lui, elle
   * racontait un workflow plus creux qu'il n'est : sur un relevé réel, 108
   * des 110 appels d'outils lui appartenaient et n'apparaissaient nulle part. */
  const segments = wf.segments || wf.passages || [];
  /* Seule source de vérité pour un VRAI rebouclage : un autre sous-agent
   * intercalé entre deux passages du même agent (voir `indicesRepris`
   * ci-dessus). `wf.reprises` ne fait que NOMMER les agents et leur
   * compte pour le libellé — il ne décide plus, seul, de l'affichage :
   * il comptait aussi une simple réapparition après l'agent principal,
   * un enchaînement normal, comme un rebouclage. */
  const reprisesChaine = indicesRepris(segments);
  if (segments.length) {
    const chaine = el("div", "chaine");
    segments.forEach((segment, index) => {
      if (index) chaine.appendChild(el("span", "fleche", "→"));
      let classe = "maillon";
      if (segment.type === "principal") classe += " principal";
      /* `etat` est additif (bug-013) : sur un backend plus ancien, il est
       * absent — on retombe alors sur le SEUL signal disponible avant lui
       * (`termine`), jamais sur une affirmation nouvelle par défaut. */
      const sansCloture = segment.etat === "sans_cloture";
      if (sansCloture) classe += " sans-cloture";
      else if (segment.etat === "en_cours") classe += " en-cours";
      else if (segment.etat === undefined && !segment.termine) classe += " en-cours";
      /* Jamais cumulée avec `.sans-cloture` : une fin sans annonce n'est ni
       * un succès ni un échec du travail, l'accusation visuelle (bordure
       * rouille, marqueur ✕) n'a pas sa place dessus. */
      if (segment.echecs && !sansCloture) classe += " echec";
      if (reprisesChaine.has(index)) classe += " repris";
      const maillon = el("span", classe);
      const mnom = el("span", "mnom", segment.agent);
      /* Plus de couleur d'identité (ADR-0032, lot 4) : le segment principal
       * garde son propre registre visuel (`.principal .mnom`, fond creusé +
       * italique), les sous-agents restent au jeton de texte par défaut. */
      maillon.appendChild(mnom);
      if (sansCloture) {
        const ecoule = dureeDepuisIso(segment.derniere_activite);
        maillon.appendChild(el("span", "mduree",
          "⋯ fin non observée depuis " + (ecoule || "un temps inconnu")));
      } else {
        const d = duree(segment.duree_ms);
        maillon.appendChild(el("span", "mduree",
          d !== null ? d : (segment.termine ? "durée invalide" : "en cours")));
      }
      const detail = [];
      if (segment.type === "principal" && segment.outils) detail.push(segment.outils + " outils");
      if (segment.fichiers && segment.fichiers.length) detail.push(segment.fichiers.length + " fich.");
      if (detail.length) maillon.appendChild(el("span", "mduree", detail.join(" · ")));
      if (segment.echecs && !sansCloture) maillon.appendChild(el("span", "mduree", "✕" + segment.echecs));
      maillon.title = segment.type === "principal"
        ? "Agent principal — la session Claude Code elle-même, entre deux "
          + "sous-agents.\nC'est elle qui orchestre : elle lit, écrit, lance "
          + "les commandes et invoque les agents.\n"
          + (segment.fichiers || []).join("\n")
        : "Sous-agent " + segment.agent + "\n" + (segment.fichiers || []).join("\n");
      chaine.appendChild(maillon);
    });
    enveloppe.appendChild(chaine);
  }

  const notes = [];
  if (wf.commandes && Object.keys(wf.commandes).length) {
    notes.push("commandes : " + Object.keys(wf.commandes)
      .map((c) => c + " ×" + wf.commandes[c]).join(", "));
  }
  if (notes.length) enveloppe.appendChild(el("div", "wf-notes", notes.join(" · ")));

  /* Le rebouclage a sa propre bande, distincte d'un enchaînement normal
   * (feature-010, §8) : `wf.reprises` était affiché comme une ligne de
   * texte neutre, indiscernable des autres notes. `.repris` sur les
   * maillons concernés (voir `indicesRepris`, ci-dessus) ancre le même
   * signal dans la chaîne.
   * ⚠️ Le bandeau ne se déclenche QUE si `indicesRepris` a réellement
   * marqué un maillon — jamais sur la seule présence de `wf.reprises`.
   * Sans ce garde, le bandeau annonçait un rebouclage que la détection
   * elle-même écartait : deux logiques sur le même fait, dans la même
   * fonction, en désaccord. Une réapparition après le seul agent
   * principal reste un fait qu'on signale — sobrement — pas une alerte :
   * la taire serait un récit muet sur ce qu'il sait.
   * ⚠️ feature-010 §A2 : ce garde portait sur le DÉCLENCHEMENT du bandeau, pas sur
   * son CONTENU — `reprises.map(...)` recopiait `wf.reprises` en entier,
   * y compris des agents que `indicesRepris` n'a marqué nulle part (un
   * troisième agent reparu seulement après l'agent principal, pendant
   * qu'un AUTRE agent portait, lui, un vrai rebouclage ailleurs dans la
   * même chaîne). Le bandeau ne doit NOMMER que les agents dont au moins
   * un maillon est réellement `.repris` ; les autres basculent dans la
   * mention neutre — les deux pouvant coexister sur le même workflow. */
  const agentsAncres = new Set();
  segments.forEach((segment, index) => {
    if (reprisesChaine.has(index)) agentsAncres.add(segment.agent);
  });
  const reprises = Object.keys(wf.reprises || {});
  const reprisesAncrees = reprises.filter((a) => agentsAncres.has(a));
  const reprisesNonAncrees = reprises.filter((a) => !agentsAncres.has(a));
  if (reprisesAncrees.length) {
    const bandeau = el("div", "wf-notes reboucle");
    bandeau.appendChild(el("span", "",
      "↻ reboucle — reprises : "
      + reprisesAncrees.map((a) => a + " ×" + wf.reprises[a]).join(", ")));
    enveloppe.appendChild(bandeau);
  }
  if (reprisesNonAncrees.length) {
    const note = el("div", "wf-notes attendu");
    note.appendChild(el("span", "",
      "ℹ agent(s) repassé(s), sans rebouclage détecté : "
      + reprisesNonAncrees.map((a) => a + " ×" + wf.reprises[a]).join(", ")));
    note.title =
      "Ces agents réapparaissent dans la chaîne, mais toujours "
      + "immédiatement après l'agent principal — jamais après un AUTRE "
      + "sous-agent. Ce n'est pas un rebouclage : c'est un enchaînement "
      + "normal.";
    enveloppe.appendChild(note);
  }

  /* Les incertitudes sont AFFICHÉES, pas masquées : un récit muet sur ce
   * qu'il ignore se lit comme un récit complet. */
  /* `imbrication_suspectee` (bug-013/feature-010, §9) : la mesure sur cycle
   * réel a montré 9 workflows sur 12 le levant, TOUJOURS pour la même
   * cause — l'orchestrator cesse son activité avant que le hook n'écrive
   * sa fin, avec plusieurs secondes de retard. Aucun agent ne peut en
   * invoquer un autre : ce n'est PAS une anomalie du récit, c'est un
   * artefact connu de latence d'écriture. Rendu neutre (`.attendu`, comme
   * les fins de tour du runtime ci-dessous), jamais en alerte — et le
   * champ backend n'est PAS renommé, seuls le rendu et le libellé le
   * sont. */
  if (wf.imbrication_suspectee) {
    const note = el("div", "wf-notes attendu");
    const texte = el("span", "",
      "ℹ ordre approximatif — fin de sous-agent journalisée en retard : "
      + "l'ordre affiché peut ne pas refléter l'enchaînement réel");
    texte.title =
      "Le hook qui journalise la fin d'un sous-agent peut écrire plusieurs "
      + "secondes après que l'agent a réellement cessé toute activité — un "
      + "agent suivant peut démarrer avant que cette fermeture ne soit "
      + "inscrite au journal.\n\n"
      + "Ce n'est pas un agent qui en invoque un autre : le runtime ne "
      + "permet pas ce chaînage. Ce drapeau signale un retard d'écriture "
      + "du hook, pas une anomalie du récit.";
    note.appendChild(texte);
    enveloppe.appendChild(note);
  }
  if (wf.fermetures_orphelines) {
    const note = el("div", "wf-notes attendu");
    const texte = el("span", "",
      "ℹ " + wf.fermetures_orphelines + " fin(s) de tour du runtime — "
      + "ce ne sont pas des sous-agents");
    texte.title =
      "Claude Code émet un événement « fin de sous-agent » à chaque fois que "
      + "l'agent principal termine un tour de conversation, avec un identifiant "
      + "neuf et un nom vide.\n\n"
      + "Ces événements ne correspondent à aucun sous-agent réel : ils n'ont pas "
      + "de début associé, et rien ne leur est attribué.\n\n"
      + "Ils sont comptés ici plutôt qu'ignorés en silence — un événement "
      + "inexpliqué qu'on tait devient un écart invisible entre le journal et "
      + "le récit qu'on en tire.";
    note.appendChild(texte);
    enveloppe.appendChild(note);
  }
  /* Un bornage sur `marqueur-agent` est une CONVENTION posée par la
   * configuration, pas un fait relevé par le système. ⚠️ Ce commentaire
   * opposait auparavant le bornage à `imbrication_suspectee`, « qui EST une
   * anomalie du récit » — c'est FAUX, et le commentaire de ce champ, 35
   * lignes plus haut, dit désormais l'inverse mesure à l'appui. Deux
   * commentaires contradictoires sur le même champ valent moins qu'aucun :
   * le lecteur croit celui qu'il rencontre en premier.
   * Même registre visuel que les fermetures orphelines : un fait qu'on
   * signale, pas une alerte. Absent sur un backend en retard : `wf.bornage`
   * n'existe alors simplement pas. */
  if (wf.bornage === "marqueur-agent" && wf.borne_par) {
    const note = el("div", "wf-notes attendu");
    note.appendChild(el("span", "",
      "ℹ frontières posées sur l'invocation de " + wf.borne_par + " ; un "
      + "cycle mené sans cet agent est rattaché au segment précédent"));
    enveloppe.appendChild(note);
  }
  return enveloppe;
}

/* ------------------------------------------------------ graphe d'agents --
 * feature-021, cycle 2, lot 4 (F8/F9/F14/F15/F16), ADR-0031/ADR-0032.
 * RÉÉCRITURE COMPLÈTE : l'ancien diagramme SVG (feature-017/020, cercles à
 * graduations data-dépendantes, identité colorée par agent) est retiré avec
 * le jeu de jetons transitoire qui le peignait. Le disque Material 3 du
 * prototype est reproduit à l'identique — classes ET noms de `@keyframes`
 * COPIÉS AU BIT PRÈS (F2, clé de jointure = le nom littéral). `disposer()`
 * (`diagramme.js`) reste l'UNIQUE autorité de géométrie (`ADR-0031 §4`) :
 * ce bloc ne calcule AUCUNE position, il TRADUIT son contrat en éléments
 * HTML/SVG. Utilisé pour DEUX surfaces : le graphe principal (`#cycle-
 * canvas`, `rendreGrapheCyclePrincipal`) et le détail de chaque cycle de
 * l'accordéon (`construireDiagramme`, appelé par `construireDetailCycle`).
 */
const NS_SVG = "http://www.w3.org/2000/svg";

function svgEl(tag, classe) {
  const noeud = document.createElementNS(NS_SVG, tag);
  if (classe) noeud.setAttribute("class", classe);
  return noeud;
}

function svgAttrs(noeud, attrs) {
  Object.keys(attrs).forEach((cle) => noeud.setAttribute(cle, attrs[cle]));
  return noeud;
}

/* Propriété personnalisée CSS (`--x`, `--y`, `--i`) : `style.setProperty`
 * est la voie standard (seule fiable pour un nom qui commence par `--`),
 * mais certains harnais de test (`test_app_bug012.js`, `test_app_
 * accordeon.js`) posent un `style` en simple objet nu, sans CSSOM — repli
 * sur une affectation directe plutôt que de faire échouer tout le rendu sur
 * un `TypeError` dans un bac à sable qui ne vérifie de toute façon aucune
 * position peinte. */
function definirVariable(noeud, nom, valeur) {
  if (noeud.style && typeof noeud.style.setProperty === "function") {
    noeud.style.setProperty(nom, valeur);
  } else if (noeud.style) {
    noeud.style[nom] = valeur;
  }
}

/* 12 graduations FIXES, purement décoratives (`ADR-0031 §2`) — AUCUNE
 * géométrie data-dépendante (voir `diagramme.js`, en-tête du contrat) :
 * posées ici en boucle constante, exactement comme le prototype lui-même
 * (`for (let index = 0; index < 12; index += 1) tick.style.setProperty
 * ('--i', index)`). */
const NB_GRADUATIONS = 12;
function construireGraduations() {
  const conteneur = el("span", "tool-ticks");
  conteneur.setAttribute("aria-hidden", "true");
  for (let i = 0; i < NB_GRADUATIONS; i++) {
    const tick = el("i");
    definirVariable(tick, "--i", i);
    conteneur.appendChild(tick);
  }
  return conteneur;
}

function libelleEtatDisque(etat) {
  if (etat === "active") return "actif";
  if (etat === "done") return "terminé";
  return "non lancé";
}

/* F11 (feature-021, cycle 2, lot 5) — la bottom sheet DIT ce que le chiffre
 * compte : `#selected-task` porte une PHRASE, jamais un chiffre nu sans
 * légende (§16 PIEGES). Un échec ne se lit jamais par-dessus « sans
 * clôture » (même règle que le disque lui-même, `diagramme.js`). */
function tacheDisque(agentGeo) {
  if (agentGeo.principal) return "agent principal — orchestre le cycle";
  if (agentGeo.sansCloture) return "sans clôture — aucune fin observée pour ce passage";
  if (agentGeo.echec) return "en échec — au moins un appel d'outil a échoué";
  return agentGeo.etat === "active" ? "en cours" : "terminé";
}

/* Sélection LOCALE, aucun appel réseau : toute la donnée affichée est déjà
 * dans `agentGeo`, le même objet que `disposer()` a produit pour PEINDRE le
 * disque cliqué — la bottom sheet ne recalcule rien, elle relit. Chaque
 * `.metric` du gabarit (index.html) porte déjà le libellé qui dit ce que le
 * chiffre compte (« Graduations · outils », « Points · fichiers »…) ; ce
 * qu'on pose ici est la VALEUR, jamais un chiffre sans le libellé qui
 * l'accompagne dans le DOM. */
function selectionnerPassage(agentGeo, sigle) {
  $("selected-code").textContent = sigle;
  $("selected-title").textContent = agentGeo.agent;
  $("selected-task").textContent = tacheDisque(agentGeo);
  $("selected-state").textContent = libelleEtatDisque(agentGeo.etat)
    + (agentGeo.echec ? " · échec" : "") + (agentGeo.sansCloture ? " · sans clôture" : "");
  $("selected-tools").textContent =
    agentGeo.outils + " appel" + (agentGeo.outils > 1 ? "s" : "") + " d'outil enregistré" + (agentGeo.outils > 1 ? "s" : "");
  $("selected-files").textContent = agentGeo.fichiersTotal
    ? agentGeo.fichiersAllumes + " sur 3 pastille(s) allumée(s) · " + agentGeo.fichiersTotal +
      " fichier" + (agentGeo.fichiersTotal > 1 ? "s" : "") + " touché" + (agentGeo.fichiersTotal > 1 ? "s" : "") + " au total"
    : "aucun fichier touché";
  $("selected-duration").textContent = agentGeo.duree.texte;
  const annonce = $("a11y-announcement");
  if (annonce) annonce.textContent = "Détail affiché : " + agentGeo.agent + ", " + tacheDisque(agentGeo);
}

/* Traduit UN agent (`disposer().agents[i]`) en la structure DOM exacte du
 * prototype (`.agent-wrap > .agent-node > … `, `.agent-name`, `.agent-
 * duration` en frères directs — les sélecteurs `.state-active + .agent-name`
 * et `.state-active ~ .agent-duration` du prototype en dépendent, F2). Les
 * quatre représentations F16 (échec, sans clôture, agent principal) sont
 * des AJOUTS de classe, jamais une variante des 3 états `state-*` — la
 * grammaire du prototype n'a QUE ces 3 états (ADR-0031 §3). */
function construireDisqueAgent(agentGeo, sigles) {
  const wrap = el("div", "agent-wrap");
  definirVariable(wrap, "--x", agentGeo.cx + "px");
  definirVariable(wrap, "--y", agentGeo.cy + "px");

  const classes = ["agent-node", "state-" + agentGeo.etat];
  if (agentGeo.echec) classes.push("has-echec");
  if (agentGeo.sansCloture) classes.push("state-sans-cloture");
  if (agentGeo.principal) classes.push("role-principal");
  const noeud = el("button", classes.join(" "));
  noeud.type = "button";
  const sigle = (sigles && sigles.get(agentGeo.agent)) || "??";
  noeud.setAttribute("aria-label", agentGeo.agent + ", " + libelleEtatDisque(agentGeo.etat)
    + (agentGeo.echec ? ", en échec" : "")
    + (agentGeo.sansCloture ? ", sans clôture" : "")
    + (agentGeo.principal ? ", agent principal" : ""));
  /* F11 : cliquer le disque remplit la bottom sheet — voir
   * `selectionnerPassage`, qui ne relit que `agentGeo`, déjà calculé. */
  noeud.addEventListener("click", () => selectionnerPassage(agentGeo, sigle));

  if (agentGeo.principal) {
    const anneauRole = el("span", "role-ring");
    anneauRole.setAttribute("aria-hidden", "true");
    noeud.appendChild(anneauRole);
  }
  const orbite = el("span", "work-orbit");
  orbite.setAttribute("aria-hidden", "true");
  noeud.appendChild(orbite);
  const point = el("span", "work-dot");
  point.setAttribute("aria-hidden", "true");
  noeud.appendChild(point);
  noeud.appendChild(construireGraduations());

  const face = el("span", "agent-face");
  face.appendChild(el("span", "agent-code", sigle));
  /* F15 : le centre du disque ne porte AUCUN chiffre à ce cycle (0 token
   * sur 14 372 événements mesurés — le lire suppose les transcripts de
   * sous-agent, hors GATE de ce cycle, `feature-023`). `.agent-data` ne
   * contient QUE les pastilles de fichiers, une donnée réellement mesurée
   * (PIEGES §16) — la branche « chiffre au centre » n'est PAS écrite : le
   * nœud n'existe pas (pas de `.token-value` posé), donc `F4b` peut
   * assertionner son ABSENCE sans qu'aucune lecture ne confonde « pas de
   * donnée » et « zéro » (règle 1, notes d'implémentation cycle 2 §5).
   * Le disque reste DÉGRADABLE et JAMAIS à trous : `place-content:center`
   * (`.agent-face`) recentre le seul sigle qui reste, aucun espace n'est
   * réservé pour un chiffre absent. */
  const donnees = el("span", "agent-data");
  const points = el("span", "file-dots");
  for (let i = 0; i < 3; i++) {
    points.appendChild(el("i", i < agentGeo.fichiersAllumes ? "on" : ""));
  }
  donnees.appendChild(points);
  face.appendChild(donnees);
  noeud.appendChild(face);

  /* F16 : drapeau glyphé, jamais la seule couleur (`--state-color` déjà
   * recolorée par `.has-echec`/`.state-sans-cloture` ci-dessus porte la
   * PREMIÈRE dimension, le glyphe du drapeau porte la SECONDE). */
  if (agentGeo.echec || agentGeo.sansCloture) {
    const drapeau = el("span", "agent-flag " + (agentGeo.echec ? "agent-flag--echec" : "agent-flag--sans-cloture"));
    drapeau.setAttribute("aria-hidden", "true");
    noeud.appendChild(drapeau);
  }

  wrap.appendChild(noeud);

  /* Ordre du DOM = celui du prototype : `.agent-name` frère DIRECT de
   * `.agent-node` (sélecteur `+`), `.agent-duration` ensuite (sélecteur
   * `~`, général) — ne pas intervertir. */
  const nom = el("span", "agent-name");
  nom.appendChild(el("strong", "", agentGeo.agent));
  wrap.appendChild(nom);
  wrap.appendChild(el("span", "agent-duration", agentGeo.duree.texte));

  return wrap;
}

function classeConnecteur(etat) {
  if (etat === "flowing") return "is-flowing";
  if (etat === "complete") return "is-complete";
  if (etat === "reprise") return "is-reprise";
  return "";
}

/* Traduit le contrat COMPLET de `disposer()` (positions, connecteurs) en
 * DOM — AUCUN calcul de position ici (`ADR-0031 §4`) : `geo.agents[].cx/cy`
 * et `geo.connecteurs[].d` sont utilisés TELS QUELS. Le conteneur porte une
 * taille EXPLICITE en pixels (`geo.largeur`×`geo.hauteur`) : contrairement
 * au prototype (démo fixe à 388px), la largeur réelle dépend du nombre de
 * créneaux — `.graphe-scroll` défile horizontalement plutôt que de tasser
 * les disques (écart assumé, voir app.css). */
function construireGrapheAgents(geo, sigles) {
  const scroll = el("div", "graphe-scroll");
  scroll.setAttribute("tabindex", "0");
  scroll.setAttribute("role", "group");
  scroll.setAttribute("aria-label", "Graphe d'agents — " + geo.agents.length + " agent(s)");
  scroll.addEventListener("keydown", (evenement) => {
    const PAS = 80;
    if (evenement.key === "ArrowRight") { scroll.scrollLeft += PAS; evenement.preventDefault(); }
    else if (evenement.key === "ArrowLeft") { scroll.scrollLeft -= PAS; evenement.preventDefault(); }
    else if (evenement.key === "Home") { scroll.scrollLeft = 0; evenement.preventDefault(); }
    else if (evenement.key === "End") { scroll.scrollLeft = scroll.scrollWidth; evenement.preventDefault(); }
  });

  const plan = el("div");
  plan.style.position = "relative";
  plan.style.width = geo.largeur + "px";
  plan.style.height = geo.hauteur + "px";

  const svg = svgEl("svg", "connector-layer");
  svg.setAttribute("aria-hidden", "true");
  svgAttrs(svg, { viewBox: "0 0 " + geo.largeur + " " + geo.hauteur });
  svg.style.width = geo.largeur + "px";
  svg.style.height = geo.hauteur + "px";
  geo.connecteurs.forEach((c) => {
    const chemin = svgEl("path", classeConnecteur(c.etat));
    svgAttrs(chemin, { d: c.d });
    svg.appendChild(chemin);
  });
  plan.appendChild(svg);

  geo.agents.forEach((a) => plan.appendChild(construireDisqueAgent(a, sigles)));
  scroll.appendChild(plan);
  return scroll;
}

/* Point d'entrée pour l'accordéon « Cycles » (`construireDetailCycle`, plus
 * bas) : `wf.segments` (agent principal compris) si disponible, repli sur
 * `wf.passages` sur un backend plus ancien. Un cycle sans aucun segment
 * retombe sur `null` : l'appelant garde alors le seul état vide déjà
 * affiché par la table des passages. */
function construireDiagramme(wf, sigles) {
  const segments = wf.segments || wf.passages || [];
  if (!segments.length) return null;
  /* Garde (bug-020, conservée) : `diagramme.js` est chargé en `<script>`
   * séparé (index.html, AVANT ce fichier) — s'il est absent (404, cache,
   * oubli de relancer le serveur après un fichier neuf, PIEGES §8),
   * `disposer` n'existe pas. Se rabattre sur l'absence de diagramme, comme
   * un cycle sans segment, plutôt que de laisser l'exception remonter
   * jusqu'au `catch` global de `rafraichir()` (qui l'afficherait à tort
   * comme « serveur injoignable »). */
  if (typeof disposer !== "function") return null;
  const geo = disposer(segments);
  const enveloppe = document.createDocumentFragment();
  enveloppe.appendChild(el("p", "note", "l'écart horizontal sert la lisibilité, il ne mesure pas le temps"));
  enveloppe.appendChild(construireGrapheAgents(geo, sigles));
  return enveloppe;
}

/* ------------------------------------------------ graphe principal (F8/F9)
 * `#cycle-canvas` (zone de travail, mono-écran) : reconstruit à CHAQUE
 * rafraîchissement — pas de diff incrémental, `disposer()` est un module pur
 * bon marché à rappeler et le nombre de passages par cycle reste modeste. */
function choisirCycleAffiche(etat) {
  const workflows = (etat.workflows || []).slice().reverse();   // le plus récent en tête
  if (!workflows.length) return null;
  return workflows.find((wf) => etatCycle(wf) === "en_cours") || workflows[0];
}

function formatEcoule(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return String(mm).padStart(2, "0") + ":" + String(ss).padStart(2, "0");
}

function rendreGrapheCyclePrincipal(etat) {
  const zone = $("cycle-canvas");
  vider(zone);

  /* Indicateur « vivant » (§16 des notes cycle 1, PIEGES §17) : branché sur
   * `etat.agents[].actif_sur` (`instantane()`, backend/server.py), JAMAIS
   * sur une absence de `SessionEnd` — ~85 % des cycles la portent, sans que
   * cela signale une activité réelle. */
  const nbActifs = (etat.agents || []).filter((a) => a.actif_sur).length;
  /* `classList.className = ` plutôt que `.classList.toggle(...)` : le bac à
   * sable de `test_app_bug012.js` n'implémente que `add`/`contains`
   * (FakeNode), pas `toggle` — cette forme reste correcte dans un vrai
   * navigateur ET dans ce bac à sable. */
  $("status-dot").className = "status-dot" + (nbActifs > 0 ? " actif" : "");
  $("summary-active").textContent = nbActifs + " agent" + (nbActifs > 1 ? "s" : "") + " actif" + (nbActifs > 1 ? "s" : "");

  const repoTexte = $("repo-strip-texte");
  const repoOk = $("repo-strip-ok");
  if (etat.git && etat.git.depot) {
    const touches = (etat.git.touches || []).length;
    repoTexte.textContent = (etat.git.branche || "?") + " · " + touches + " fichier(s) modifié(s)";
    repoOk.hidden = false;
  } else {
    repoTexte.textContent = "pas un dépôt git";
    repoOk.hidden = true;
  }

  const wf = choisirCycleAffiche(etat);
  if (!wf) {
    $("cycle-status").textContent = "Aucun cycle sélectionné";
    $("summary-step").textContent = "—";
    $("summary-time").textContent = "00:00";
    $("motion-note").textContent = "aucun passage à afficher pour l'instant — invoquez un agent depuis la section Développer";
    $("cycle-indice").textContent = "—";
    /* #cycle-title (F0, prototype l.687) : JAMAIS une chaîne vide — c'est la
     * cible `aria-labelledby` de `.cycle-surface`. Aucun cycle observé :
     * libellé factuel dédié, distinct de « Cycle #N » (lot 7). */
    $("cycle-title").textContent = "Aucun cycle observé";
    return;
  }
  /* ADR-0023 : « Cycle #N » (indice_cycle, additif) est légitime — le TITRE
   * de spec ne l'est pas EN GÉNÉRAL (corrélation cycle→spec après coup, 2 cas
   * sur 14 seulement). Le lot 10 ouvre une troisième branche, mais PAS par
   * corrélation : `etat.lancement_spec_id` (server.py, GATE P1 S1.7) est le
   * `spec_id` que LE SERVEUR a lui-même mémorisé sur le `Lancement` au
   * moment où CE lancement a été demandé via `/api/spec/lancer` — un fait
   * causal, jamais une reconstitution après coup. Il ne vaut d'ailleurs
   * QUE tant que ce lancement `toujours_en_cours()` (server.py) ; il
   * redevient `null` dès la fin du cycle, et `#cycle-title` retombe alors
   * sur « Cycle #N », jamais sur un titre périmé. */
  const libelleIndice = typeof wf.indice_cycle === "number"
    ? "Cycle #" + wf.indice_cycle : null;
  $("cycle-indice").textContent = libelleIndice || "—";
  let titreSpecConnu = null;
  if (etat.lancement_spec_id) {
    const specCorrespondante = (etat.specs || []).find((s) => s.id === etat.lancement_spec_id);
    if (specCorrespondante) {
      titreSpecConnu = specCorrespondante.titre && specCorrespondante.titre !== specCorrespondante.id
        ? specCorrespondante.id + " · " + specCorrespondante.titre
        : specCorrespondante.id;
    }
  }
  $("cycle-title").textContent = titreSpecConnu || libelleIndice || "Cycle en cours";

  const segments = wf.segments || wf.passages || [];
  const sigles = siglesAgents(Array.from(collecterRoles([wf])));
  const cle = etatCycle(wf);
  const info = descripteurEtat(cle);
  $("cycle-status").textContent = info.libelle.charAt(0).toUpperCase() + info.libelle.slice(1);
  const dernier = segments.length ? segments[segments.length - 1] : null;
  $("summary-step").textContent = dernier ? dernier.agent : "—";
  const finIso = cle === "en_cours" ? new Date().toISOString() : wf.fin_observee;
  const ecouleMs = dureeIso(wf.debut, finIso);
  $("summary-time").textContent = ecouleMs !== null ? formatEcoule(ecouleMs) : "00:00";
  $("motion-note").textContent = cle === "en_cours"
    ? "un agent est actif : son disque grandit et révèle ses données"
    : "cycle " + info.libelle;

  if (!segments.length || typeof disposer !== "function") return;
  const geo = disposer(segments);
  zone.appendChild(construireGrapheAgents(geo, sigles));
}


function construireDetailCycle(wf, sigles) {
  const detail = document.createDocumentFragment();
  detail.appendChild(construireProprietes(wf));
  const diagramme = construireDiagramme(wf, sigles);
  if (diagramme) detail.appendChild(diagramme);
  detail.appendChild(construireTablePassages(wf, sigles));
  detail.appendChild(construireChaineEtNotes(wf));
  return detail;
}

/* Rôles apparaissant dans les cycles AFFICHÉS (passages + agents ouvrants
 * cités en désignation) : `siglesAgents` calcule tous les sigles d'un coup,
 * dans l'ordre alphabétique, pour rester indépendant de l'ordre d'arrivée. */
/* Défaut G (feature-020) : la collecte doit parcourir `wf.segments` — qui
 * inclut le segment de l'agent principal (`AGENT_PRINCIPAL_SENTINELLE`,
 * `backend/events.py`) — et pas seulement `wf.passages`/`wf.borne_par`, sinon
 * `sigleAgent("(agent principal)")` calculerait « (A », un sigle faux. Le
 * repli sur `wf.passages` reste nécessaire pour un backend plus ancien qui
 * n'écrit pas encore `segments`. */
function collecterRoles(workflows) {
  const roles = new Set();
  workflows.forEach((wf) => {
    const segments = wf.segments || wf.passages || [];
    segments.forEach((s) => roles.add(s.agent));
    if (wf.borne_par) roles.add(wf.borne_par);
  });
  return roles;
}

/* Liste des cycles en accordéon (feature-016, docs/DESIGN-SYSTEM.md §6). */
function rendreCycles(etat) {
  const zone = $("workflows");
  vider(zone);
  const workflows = (etat.workflows || []).slice().reverse();   // le plus récent en tête

  if (!workflows.length) {
    /* Cas limite : état vide explicite, qui dit quoi faire — pas une liste
     * muette. */
    zone.appendChild(el("li", "vide",
      "aucun cycle observé pour l'instant — invoquez un agent depuis la "
      + "section Développer (bloc Pilotage) pour en amorcer un"));
    cycleOuvert = null;
    $("legende-cycles").textContent = "";
    $("pied-cycles").textContent = "";
    return;
  }

  /* Dépliement exclusif (item C) : le dernier cycle est ouvert par défaut ;
   * un choix déjà fait survit tant que le cycle choisi reste présent dans la
   * liste affichée. */
  const idsPresents = new Set(workflows.map((wf) => wf.workflow_id));
  if (cycleOuvert === null || !idsPresents.has(cycleOuvert)) {
    cycleOuvert = workflows[0].workflow_id;
  }

  const sigles = siglesAgents(Array.from(collecterRoles(workflows)));

  workflows.forEach((wf) => {
    const li = el("li", "cycle");
    const ouvert = wf.workflow_id === cycleOuvert;
    const { h3, idDetail } = construireEnteteCycle(wf, sigles, ouvert);
    li.appendChild(h3);
    const detail = el("div", "cycle-detail");
    detail.id = idDetail;
    detail.setAttribute("role", "region");
    detail.setAttribute("aria-labelledby", idCycleDom(wf.workflow_id) + "-bouton");
    detail.hidden = !ouvert;
    /* Le contenu est construit que le cycle soit ouvert ou non (item M/C :
     * jamais retiré du DOM) — coûte une reconstruction de plus au clic, en
     * échange d'un état de dépliement qui ne perd jamais rien au clavier. */
    detail.appendChild(construireDetailCycle(wf, sigles));
    li.appendChild(detail);
    zone.appendChild(li);
  });

  /* Légende fixe au-dessus de la liste (item, comportement attendu) : les
   * DEUX bornages — combien sont affichés sur le total, et ce qu'est un
   * cycle. `etat.cycles_total` est additif (feature-016, item K) : absent
   * sur un backend plus ancien, on retombe sur le seul compte affiché. */
  const total = typeof etat.cycles_total === "number" ? etat.cycles_total : workflows.length;
  $("legende-cycles").textContent =
    workflows.length + (total > workflows.length ? " sur " + total : "")
    + " cycle" + (total > 1 ? "s" : "") + " affiché" + (total > 1 ? "s" : "") + " — "
    + "un cycle commence à l'invocation d'un agent ouvrant configuré ; sans "
    + "agent ouvrant, une session reste un seul cycle, dit « session entière ».";

  /* Pied de liste (item K) : `evenements_hors_session` était calculé puis
   * jeté — des événements écrits avant qu'une session ne soit connue, jamais
   * absorbés dans un cycle fabriqué pour l'occasion. */
  const horsSession = typeof etat.evenements_hors_session === "number"
    ? etat.evenements_hors_session : 0;
  $("pied-cycles").textContent = horsSession
    ? horsSession + " événement(s) sans session associée — ne forment aucun cycle"
    : "";
}

/* -------------------------------------------------------------- fichiers -- */
function rendreFichiers(etat) {
  const zone = $("fichiers");
  vider(zone);
  if (!etat.git.depot) {
    zone.appendChild(el("div", "vide", "pas un dépôt git"));
    return;
  }
  if (!etat.git.touches.length) {
    zone.appendChild(el("div", "vide", "arbre de travail propre"));
  }
  etat.git.touches.forEach((entree) => {
    const ligne = el("button", "fichier");
    ligne.type = "button";
    ligne.appendChild(el("span", "fcode", entree.libelle));
    ligne.appendChild(el("span", "fchemin",
      entree.ancien ? entree.ancien + " → " + entree.chemin : entree.chemin));
    ligne.addEventListener("click", () => ouvrirDiff(entree.chemin));
    zone.appendChild(ligne);
  });

  (etat.git.commits || []).slice(0, 4).forEach((commit) => {
    const ligne = el("div", "fichier");
    ligne.appendChild(el("span", "fcode", commit.hash));
    // `.fsujet`, pas `.fchemin` (feature-019) : `commit.sujet` est une phrase
    // écrite par un humain, jamais un chemin — la chasse fixe de `.fchemin`
    // n'a rien à y faire.
    ligne.appendChild(el("span", "fsujet", commit.sujet));
    zone.appendChild(ligne);
  });
}

/* -------------------------------------------------------------- timeline -- */
function rendreTimeline(etat) {
  const liste = $("timeline");
  vider(liste);
  const evenements = etat.evenements.slice().reverse();
  if (!evenements.length) {
    liste.appendChild(el("li", "vide",
      "journal vide — aucun événement observé pour l'instant ; il se "
      + "remplit dès qu'un agent est invoqué"));
    return;
  }
  evenements.forEach((e) => {
    let classe = "";
    let quoi = e.hook_event_name || "?";
    if (e.hook_event_name === "SubagentStart") { classe = "agent"; quoi = "▶ " + (e.agent_type || "?"); }
    else if (e.hook_event_name === "SubagentStop") { classe = "agent"; quoi = "■ fin de sous-agent"; }
    else if (e.failed) { classe = "echec"; quoi = "✕ " + (e.tool || "outil") + " en échec"; }
    else if (e.command_head) { quoi = "$ " + e.command_head; }
    else if (e.file) { quoi = (e.tool || "fichier") + " " + e.file; }
    const ligne = el("li", classe);
    ligne.appendChild(el("span", "heure", heure(e.ts)));
    ligne.appendChild(el("span", "quoi", quoi));
    liste.appendChild(ligne);
  });
}

/* ---------------------------------------------------------------- tiroir -- */
function ouvrirTiroir(titre, contenu) {
  /* feature-025 : le tiroir sert aussi de surface d'édition (B2) — l'ouvrir
   * en mode LECTURE (diff, ou détail de secours) doit toujours quitter le
   * mode édition, jamais laisser un formulaire orphelin affiché derrière un
   * nouveau contenu. */
  if (typeof fermerEditionTiroir === "function") fermerEditionTiroir();
  $("tiroir-titre").textContent = titre;
  $("tiroir-contenu").textContent = contenu;
  $("tiroir").hidden = false;
  $("tiroir-fermer").focus();
}

function fermerTiroir() {
  $("tiroir").hidden = true;
  if (typeof fermerEditionTiroir === "function") fermerEditionTiroir();
}

async function ouvrirDiff(chemin) {
  ouvrirTiroir(chemin, "chargement…");
  try {
    const reponse = await fetch("/api/diff?chemin=" + encodeURIComponent(chemin),
      { headers: enTeteAuthPilotage() });
    if (reponse.status === 401) {
      sur401Lecture();
      return ouvrirTiroir(chemin, "Authentification requise — reconnectez-vous.");
    }
    const donnees = await reponse.json();
    if (donnees.erreur) return ouvrirTiroir(chemin, "Erreur : " + donnees.erreur);
    const avis = donnees.tronque
      ? "⚠ DIFF TRONQUÉ — la suite n'est pas affichée\n" + "".padEnd(60, "─") + "\n\n"
      : "";
    ouvrirTiroir(chemin, avis + (donnees.diff || "(aucune différence)"));
  } catch (erreur) {
    ouvrirTiroir(chemin, "Erreur réseau : " + erreur.message);
  }
}

/* ---------------------------------------------------- backlog : actions -- *
 * feature-025 (cycle 2, lots 9-10) : menu ⋮, dialogue de détail M3, lancer /
 * modifier / supprimer une spec DÉSIGNÉE. Markup et classes REPRIS du
 * prototype (`index.html`, voir son commentaire au-dessus de `#context-
 * menu`) — ce bloc les branche à `GET /api/spec` et aux trois routes du
 * lot 9 (`gestion_spec.py`).
 *
 * ⚠️ Contrainte du bac à sable : plusieurs harnais `test_app_*.js` chargent
 * ce fichier ENTIER dans un `document` minimal qui ne connaît pas tous ces
 * `id` et n'implémente ni `showModal`/`close`, ni `querySelector`, ni
 * `getBoundingClientRect`, ni `.dataset`. En conséquence :
 *   - AUCUN `document.querySelector*` — les collections nécessaires sont
 *     tenues à la main, comme le reste du fichier ;
 *   - tout `$("id")` susceptible d'être absent d'un harnais plus ancien est
 *     GARDÉ (`if (élément) { … }`) avant tout appel de méthode : un accès
 *     direct ferait tomber TOUS les harnais qui chargent `app.js`, pas
 *     seulement ce fichier ;
 *   - `showModal()`/`close()`/`getBoundingClientRect()` sont appelés
 *     seulement si la méthode existe (`typeof … === "function"`), avec un
 *     repli sur `.hidden` — le même degré de tolérance qu'un `<dialog>`
 *     natif offre au navigateur réel et qu'un `FakeNode` générique n'offre
 *     pas ;
 *   - `data-*` est posé par `setAttribute`/lu par `getAttribute`, jamais
 *     `.dataset` (absent du bac à sable).
 */

// -- éligibilité, dérivée de la MÊME position que le serveur
// (`gestion_spec.role_colonne`) : jamais un nom de colonne codé en dur
// (ADR-0003). `null` si la colonne n'est pas (ou plus) déclarée. --------
function roleColonneClient(etat, classeColonne) {
  const classes = ((etat && etat.colonnes) || []).map((c) => c.classe);
  const index = classes.indexOf(classeColonne);
  if (index === -1) return null;
  if (index === 0) return "premiere";
  if (index === classes.length - 1) return "derniere";
  return "intermediaire";
}

function ouvrirDialogue(dialogue) {
  if (!dialogue) return;
  if (typeof dialogue.showModal === "function") dialogue.showModal();
  else dialogue.hidden = false;
}

function fermerDialogue(dialogue) {
  if (!dialogue) return;
  if (typeof dialogue.close === "function") dialogue.close();
  else dialogue.hidden = true;
}

// -- menu contextuel (⋮) ----------------------------------------------------
let menuTargetSpec = null;
let menuBoutonActif = null;

function elementsMenuVisibles() {
  const menu = $("context-menu");
  if (!menu) return [];
  return ["menu-launch-cycle", "view-details", "edit-item", "delete-item"]
    .map((id) => $(id))
    .filter((n) => n && !n.hidden);
}

function fermerMenuContextuel(rendreFocus) {
  const menu = $("context-menu");
  if (!menu || menu.hidden) return;
  menu.hidden = true;
  if (menuBoutonActif) {
    menuBoutonActif.setAttribute("aria-expanded", "false");
    if (rendreFocus && typeof menuBoutonActif.focus === "function") menuBoutonActif.focus();
  }
  menuBoutonActif = null;
}

function ouvrirMenuContextuel(bouton, specId) {
  const menu = $("context-menu");
  if (!menu) return;
  const dejaOuvertPourCetteCarte = menuBoutonActif === bouton && !menu.hidden;
  fermerMenuContextuel(false);
  if (dejaOuvertPourCetteCarte) return;

  menuBoutonActif = bouton;
  menuTargetSpec = specId;

  const launchable = bouton.getAttribute("data-launchable") === "true";
  const editable = bouton.getAttribute("data-editable") === "true";
  const supprimable = bouton.getAttribute("data-supprimable") === "true";
  const lancer = $("menu-launch-cycle");
  const separateur = $("launch-divider");
  if (lancer) lancer.hidden = !launchable;
  if (separateur) separateur.hidden = !launchable;
  const modifier = $("edit-item");
  if (modifier) modifier.hidden = !editable;
  const supprimer = $("delete-item");
  if (supprimer) supprimer.hidden = !supprimable;

  menu.hidden = false;
  if (typeof bouton.getBoundingClientRect === "function") {
    const rect = bouton.getBoundingClientRect();
    const largeurVue = (typeof window !== "undefined" && window.innerWidth) || 1024;
    const hauteurVue = (typeof window !== "undefined" && window.innerHeight) || 768;
    menu.style.left = Math.min(largeurVue - 202, Math.max(8, rect.right - 190)) + "px";
    menu.style.top = Math.min(hauteurVue - (launchable ? 226 : 174), rect.bottom + 4) + "px";
  }
  bouton.setAttribute("aria-expanded", "true");
  const items = elementsMenuVisibles();
  const premier = items[0];
  if (premier && typeof premier.focus === "function") premier.focus();
}

(function cablerMenuContextuelUneFois() {
  const menu = $("context-menu");
  if (!menu) return;
  menu.addEventListener("keydown", (evenement) => {
    const items = elementsMenuVisibles();
    if (!items.length) return;
    const indexActuel = items.indexOf(document.activeElement);
    if (evenement.key === "Escape") {
      evenement.preventDefault();
      fermerMenuContextuel(true);
    } else if (evenement.key === "ArrowDown" || evenement.key === "ArrowUp") {
      evenement.preventDefault();
      const direction = evenement.key === "ArrowDown" ? 1 : -1;
      const suivant = items[(indexActuel + direction + items.length) % items.length];
      if (suivant && typeof suivant.focus === "function") suivant.focus();
    } else if (evenement.key === "Home") {
      evenement.preventDefault();
      if (typeof items[0].focus === "function") items[0].focus();
    } else if (evenement.key === "End") {
      evenement.preventDefault();
      const dernier = items[items.length - 1];
      if (typeof dernier.focus === "function") dernier.focus();
    }
  });
  if (typeof document.addEventListener === "function") {
    document.addEventListener("click", (evenement) => {
      if (menu.hidden) return;
      if (typeof menu.contains === "function" && menu.contains(evenement.target)) return;
      if (evenement.target && typeof evenement.target.getAttribute === "function" &&
          evenement.target.getAttribute("data-menu-for")) return; // le clic qui OUVRE ne doit pas la refermer aussitôt
      fermerMenuContextuel(false);
    });
  }
})();

// -- dialogue de détail (feature-dialog) -------------------------------------
// Extraction BORNÉE d'une section markdown (« ## Titre » jusqu'au prochain
// « ## » ou fin de texte) : le contenu affiché reste ce que la spec PORTE
// réellement, jamais une invention — dégradable (section absente → « — »),
// jamais à trous (PIEGES §16, F15 du même cycle).
function extraireSectionMarkdown(contenu, titre) {
  if (!contenu) return null;
  const motif = new RegExp("^##\\s+" + titre.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*$", "m");
  const m = motif.exec(contenu);
  if (!m) return null;
  const debut = m.index + m[0].length;
  const suite = contenu.indexOf("\n## ", debut);
  const morceau = (suite === -1 ? contenu.slice(debut) : contenu.slice(debut, suite)).trim();
  return morceau || null;
}

function extraireListeMarkdown(section) {
  if (!section) return [];
  return section.split("\n")
    .map((l) => l.replace(/^\s*[-*]\s*\[[ xX]\]\s*/, "").replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);
}

async function ouvrirDetailFeature(specId) {
  const dialogue = $("feature-dialog");
  if (!dialogue) return;
  try {
    const reponse = await fetch("/api/spec?id=" + encodeURIComponent(specId), { headers: enTeteAuthPilotage() });
    if (reponse.status === 401) { sur401Lecture(); return; }
    const donnees = await reponse.json();
    if (donnees.erreur) {
      if ($("feature-description")) $("feature-description").textContent = "Erreur : " + donnees.erreur;
      return;
    }
    const genre = (donnees.type || "").toLowerCase();
    if ($("feature-kind")) $("feature-kind").textContent = genre.indexOf("bug") === 0 ? "Bug" : "Feature";
    if ($("feature-title")) $("feature-title").textContent = donnees.titre && donnees.titre !== donnees.id
      ? donnees.id + " · " + donnees.titre : donnees.id;
    const statut = $("feature-status");
    if (statut) {
      const estTodo = donnees.statut_classe === "todo" || (!donnees.statut_texte && !donnees.divergence);
      statut.className = "feature-chip" + (estTodo ? " todo" : "");
      statut.textContent = donnees.statut_texte || donnees.statut_classe || "—";
    }
    const priorite = $("feature-priority");
    if (priorite) {
      const p = nettoyerPriorite(donnees.priorite);
      const estHaute = !!p && (p.toLowerCase().indexOf("haute") === 0 || p.toLowerCase().indexOf("critique") === 0);
      priorite.className = "feature-chip" + (estHaute ? " high" : "");
      priorite.textContent = p || "—";
    }
    // L'agent responsable N'EST PAS exposé par `specs.py` (B4, lot 9 :
    // « aucune grandeur de progression exposée », et l'agent responsable
    // n'a pas été défini/mesuré non plus) — DÉGRADABLE, jamais inventé.
    if ($("feature-agent")) $("feature-agent").textContent = "Agent · non déterminé par le dépôt";
    if ($("feature-description")) {
      $("feature-description").textContent = extraireSectionMarkdown(donnees.contenu, "Description")
        || "(aucune section « Description » dans cette spec)";
    }
    const criteres = $("feature-criteria");
    if (criteres) {
      vider(criteres);
      const liste = extraireListeMarkdown(extraireSectionMarkdown(donnees.contenu, "Critères d.acceptation"));
      if (!liste.length) criteres.appendChild(el("li", "vide", "aucun critère listé"));
      else liste.forEach((item) => criteres.appendChild(el("li", "", item)));
    }
    if ($("feature-dependency")) {
      $("feature-dependency").textContent = extraireSectionMarkdown(donnees.contenu, "Contexte") || "—";
    }
    if ($("feature-updated")) $("feature-updated").textContent = donnees.maj || "—";

    const boutonModifier = $("feature-edit");
    if (boutonModifier) boutonModifier.onclick = () => { fermerDialogue(dialogue); ouvrirEditionSpec(specId); };
    ouvrirDialogue(dialogue);
  } catch (erreur) {
    if ($("feature-description")) $("feature-description").textContent = "Erreur réseau : " + erreur.message;
  }
}

// -- modification (B2) : réutilise le tiroir existant en mode édition -------
let editionCourante = null; // { specId, empreinte }

function fermerEditionTiroir() {
  const form = $("tiroir-edition");
  if (form) form.hidden = true;
  const contenu = $("tiroir-contenu");
  if (contenu) contenu.hidden = false;
  editionCourante = null;
}

async function ouvrirEditionSpec(specId) {
  ouvrirTiroir(specId, "chargement…");
  try {
    const reponse = await fetch("/api/spec?id=" + encodeURIComponent(specId), { headers: enTeteAuthPilotage() });
    if (reponse.status === 401) { sur401Lecture(); return ouvrirTiroir(specId, "Authentification requise — reconnectez-vous."); }
    const donnees = await reponse.json();
    if (donnees.erreur) return ouvrirTiroir(specId, "Erreur : " + donnees.erreur);
    if (!donnees.empreinte) return ouvrirTiroir(specId, "Cette spec ne porte pas d'empreinte — modification impossible.");
    editionCourante = { specId, empreinte: donnees.empreinte };
    const contenu = $("tiroir-contenu");
    if (contenu) contenu.hidden = true;
    const texte = $("tiroir-edition-texte");
    if (texte) texte.value = donnees.contenu || "";
    const erreur = $("tiroir-edition-erreur");
    if (erreur) { erreur.hidden = true; erreur.textContent = ""; }
    const form = $("tiroir-edition");
    if (form) { form.hidden = false; }
    if (texte && typeof texte.focus === "function") texte.focus();
  } catch (erreur) {
    ouvrirTiroir(specId, "Erreur réseau : " + erreur.message);
  }
}

async function surSoumissionEditionSpec(evenement) {
  if (evenement && typeof evenement.preventDefault === "function") evenement.preventDefault();
  if (!editionCourante) return;
  const texte = $("tiroir-edition-texte");
  const erreur = $("tiroir-edition-erreur");
  const bouton = $("tiroir-edition-enregistrer");
  if (bouton) bouton.disabled = true;
  try {
    const reponse = await fetch("/api/spec/modifier", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, enTeteAuthPilotage()),
      body: JSON.stringify({
        spec_id: editionCourante.specId,
        empreinte: editionCourante.empreinte,
        contenu: texte ? texte.value : "",
      }),
    });
    const donnees = await reponse.json().catch(() => ({}));
    if (reponse.status === 200) {
      editionCourante = { specId: editionCourante.specId, empreinte: donnees.empreinte };
      fermerEditionTiroir();
      fermerTiroir();
      rafraichir();
      return;
    }
    if (reponse.status === 401) { sur401Lecture(); return; }
    // 409 (empreinte périmée OU lancement en cours) : le dire, JAMAIS
    // réessayer en silence (consigne du brief — « ne réessaie pas »).
    if (erreur) {
      erreur.hidden = false;
      erreur.textContent = reponse.status === 409
        ? "Un éditeur externe (ou un lancement en cours) a modifié cette spec entre-temps — rechargez-la avant de réessayer."
        : (donnees.erreur || ("Erreur du serveur (" + reponse.status + ").`"));
    }
  } catch (e) {
    if (erreur) { erreur.hidden = false; erreur.textContent = "Erreur réseau : " + e.message; }
  } finally {
    if (bouton) bouton.disabled = false;
  }
}

// -- suppression (B3) : confirmation par le nom, VÉRIFIÉE CÔTÉ SERVEUR ------
let suppressionCourante = null; // { specId }

function fermerDialogueSuppression() {
  fermerDialogue($("delete-dialog"));
  suppressionCourante = null;
}

function ouvrirDialogueSuppression(specId) {
  const dialogue = $("delete-dialog");
  if (!dialogue) return;
  suppressionCourante = { specId };
  if ($("delete-copy")) {
    $("delete-copy").textContent = "Cette action supprimera définitivement " + specId + " du backlog. "
      + "Cette suppression n'est possible que si " + specId + " est déjà suivi par git et sans modification locale — "
      + "sinon le serveur la refuse et le dit (« commit ou stash d'abord »).";
  }
  if ($("delete-confirm-label")) $("delete-confirm-label").textContent = "Tapez « " + specId + " » pour confirmer";
  if ($("delete-confirm-aide")) $("delete-confirm-aide").textContent = "La suppression est REFUSÉE tant que le texte ne correspond pas exactement.";
  const champ = $("delete-confirm-input");
  if (champ) champ.value = "";
  const bouton = $("delete-confirm-bouton");
  if (bouton) bouton.disabled = true;
  const erreur = $("delete-erreur");
  if (erreur) { erreur.hidden = true; erreur.textContent = ""; }
  ouvrirDialogue(dialogue);
  if (champ && typeof champ.focus === "function") champ.focus();
}

function surSaisieConfirmationSuppression() {
  if (!suppressionCourante) return;
  const champ = $("delete-confirm-input");
  const bouton = $("delete-confirm-bouton");
  if (!champ || !bouton) return;
  // Confort client SEULEMENT (règle du projet : jamais à la place du
  // serveur) — `gestion_spec.supprimer()` revalide l'égalité stricte
  // avant tout effet, GATE P1 S2.8. Désactiver ce bouton ne protège rien
  // en soi ; c'est `POST /api/spec/supprimer` qui protège.
  bouton.disabled = champ.value !== suppressionCourante.specId;
}

async function surClicConfirmerSuppression() {
  if (!suppressionCourante) return;
  const specId = suppressionCourante.specId;
  const champ = $("delete-confirm-input");
  const erreur = $("delete-erreur");
  const bouton = $("delete-confirm-bouton");
  if (bouton) bouton.disabled = true;
  try {
    const reponse = await fetch("/api/spec/supprimer", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, enTeteAuthPilotage()),
      body: JSON.stringify({ spec_id: specId, confirmation_nom: champ ? champ.value : "" }),
    });
    const donnees = await reponse.json().catch(() => ({}));
    if (reponse.status === 200) {
      fermerDialogueSuppression();
      if ($("a11y-announcement")) $("a11y-announcement").textContent = specId + " supprimée du backlog.";
      rafraichir();
      return;
    }
    if (reponse.status === 401) { sur401Lecture(); return; }
    if (erreur) {
      erreur.hidden = false;
      erreur.textContent = donnees.erreur || ("Erreur du serveur (" + reponse.status + ").");
    }
  } catch (e) {
    if (erreur) { erreur.hidden = false; erreur.textContent = "Erreur réseau : " + e.message; }
  } finally {
    surSaisieConfirmationSuppression();
  }
}

// -- lancement pour une spec désignée (B1) -----------------------------------
async function surClicLancerCyclePourSpec(specId) {
  if (!pilotage.cleChoisie) {
    if ($("a11y-announcement")) {
      $("a11y-announcement").textContent = "Choisissez d'abord une commande dans Pilotage avant de lancer un cycle pour " + specId + ".";
    }
    return;
  }
  try {
    const reponse = await fetch("/api/spec/lancer", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, enTeteAuthPilotage()),
      body: JSON.stringify({ cle: pilotage.cleChoisie, spec_id: specId }),
    });
    if (reponse.status === 202) {
      stockerJetonPilotage(jetonPilotageStocke());
      pilotage.lancement = {
        cle: pilotage.cleChoisie, etat: "en_cours", curseur: 0, tronque: false,
        derniereActivite: Date.now() / 1000, debutClient: Date.now(),
        texteSortie: "", syntheticMessage: null,
      };
      pilotage.phase = "lancement";
      if (typeof rendrePilotage === "function") rendrePilotage();
      demarrerSondagePilotage();
      if ($("a11y-announcement")) $("a11y-announcement").textContent = "Cycle lancé pour " + specId + ".";
      rafraichir();
      return;
    }
    const donnees = await reponse.json().catch(() => ({}));
    if (reponse.status === 401) { sur401Lecture(); return; }
    if ($("a11y-announcement")) {
      $("a11y-announcement").textContent = "Lancement refusé pour " + specId + " : " + (donnees.erreur || reponse.status);
    }
  } catch (e) {
    if ($("a11y-announcement")) $("a11y-announcement").textContent = "Erreur réseau au lancement de " + specId + " : " + e.message;
  }
}

// -- câblage des éléments STATIQUES du menu/dialogues (une fois) ------------
(function cablerActionsBacklogUneFois() {
  const fermer1 = $("close-feature");
  if (fermer1) fermer1.addEventListener("click", () => fermerDialogue($("feature-dialog")));
  const fermer2 = $("feature-done");
  if (fermer2) fermer2.addEventListener("click", () => fermerDialogue($("feature-dialog")));

  const menuLancer = $("menu-launch-cycle");
  if (menuLancer) menuLancer.addEventListener("click", () => {
    const cible = menuTargetSpec;
    fermerMenuContextuel(false);
    if (cible) surClicLancerCyclePourSpec(cible);
  });
  const menuDetails = $("view-details");
  if (menuDetails) menuDetails.addEventListener("click", () => {
    const cible = menuTargetSpec;
    fermerMenuContextuel(false);
    if (cible) ouvrirDetailFeature(cible);
  });
  const menuModifier = $("edit-item");
  if (menuModifier) menuModifier.addEventListener("click", () => {
    const cible = menuTargetSpec;
    fermerMenuContextuel(false);
    if (cible) ouvrirEditionSpec(cible);
  });
  const menuSupprimer = $("delete-item");
  if (menuSupprimer) menuSupprimer.addEventListener("click", () => {
    const cible = menuTargetSpec;
    fermerMenuContextuel(false);
    if (cible) ouvrirDialogueSuppression(cible);
  });

  const annulerSuppression = $("cancel-delete");
  if (annulerSuppression) annulerSuppression.addEventListener("click", fermerDialogueSuppression);
  const champConfirmation = $("delete-confirm-input");
  if (champConfirmation) champConfirmation.addEventListener("input", surSaisieConfirmationSuppression);
  const boutonSupprimer = $("delete-confirm-bouton");
  if (boutonSupprimer) boutonSupprimer.addEventListener("click", surClicConfirmerSuppression);

  const formeEdition = $("tiroir-edition");
  if (formeEdition) formeEdition.addEventListener("submit", surSoumissionEditionSpec);
  const annulerEdition = $("tiroir-edition-annuler");
  if (annulerEdition) annulerEdition.addEventListener("click", () => { fermerEditionTiroir(); fermerTiroir(); });

  // `#open-add-item`/`#add-item-dialog` : structure présente (F0), soumission
  // INERTE et le dit — voir le commentaire d'`index.html` sur `#open-add-item`.
  const ouvrirAjout = $("open-add-item");
  if (ouvrirAjout) ouvrirAjout.addEventListener("click", () => {
    const forme = $("add-item-form");
    if (forme && typeof forme.reset === "function") forme.reset();
    ouvrirDialogue($("add-item-dialog"));
    const champ = $("item-description");
    if (champ && typeof champ.focus === "function") champ.focus();
  });
  const fermerAjout = $("close-add-item");
  if (fermerAjout) fermerAjout.addEventListener("click", () => fermerDialogue($("add-item-dialog")));
  const annulerAjout = $("cancel-add-item");
  if (annulerAjout) annulerAjout.addEventListener("click", () => fermerDialogue($("add-item-dialog")));
  const formeAjout = $("add-item-form");
  if (formeAjout) formeAjout.addEventListener("submit", (evenement) => {
    if (evenement && typeof evenement.preventDefault === "function") evenement.preventDefault();
    if ($("add-item-intro")) {
      $("add-item-intro").textContent = "Cette action n'est pas encore reliée à l'écriture — "
        + "la rédaction automatique de la spec est hors périmètre de ce lot (feature-024).";
    }
  });
})();

/* --------------------------------------------------------------- pilotage -- */
/* Lancer un workflow déclaré, suivre sa sortie en direct, l'interrompre.
 *
 * Invariant central : `ecriture_active` (et `ecriture_raison`) est LU depuis
 * `/api/etat`, jamais redéduit ici d'une autre donnée (longueur de
 * `commandes_declarees`, constante, etc.) — c'est le même champ que celui qui
 * alimente les lignes « Budget max » / « Écrivains » du bloc Système
 * (rendreSysteme, ci-dessus).
 *
 * Le jeton ne va JAMAIS en query string (il finirait dans des journaux
 * d'accès) : toujours dans l'en-tête `Authorization: Bearer …`. Il n'est posé
 * dans `sessionStorage` qu'au moment du premier clic sur « Confirmer le
 * lancement » — jamais avant, aucun prompt au chargement de page.
 */
const CLE_JETON_PILOTAGE = "pilotage_jeton";

let pilotage = {
  phase: "chargement",     // chargement | inactif | pret | confirmation | occupe | lancement
  raison: null,
  commandes: [],
  budgetMaxUsd: null,
  ecrivains: null,
  cleChoisie: null,
  confirmation: null,      // { cle, plafond, ecrivains, besoinJeton, erreur, enCours }
  occupe: null,            // { texte }
  lancement: null,         // { cle, etat, curseur, tronque, derniereActivite, debutClient, texteSortie, syntheticMessage }
};

let minuteurSondagePilotage = null;

function jetonPilotageStocke() { return sessionStorage.getItem(CLE_JETON_PILOTAGE) || ""; }
function stockerJetonPilotage(valeur) { sessionStorage.setItem(CLE_JETON_PILOTAGE, valeur); }
function oublierJetonPilotage() { sessionStorage.removeItem(CLE_JETON_PILOTAGE); }
function enTeteAuthPilotage(jeton) {
  const t = jeton !== undefined ? jeton : jetonPilotageStocke();
  return t ? { "Authorization": "Bearer " + t } : {};
}

/* -- porte : authentification distante (bug-012, ADR-0020) --------------
 *
 * `modeAuth` est établi UNE SEULE FOIS, empiriquement, par la réponse du
 * PREMIER `GET /api/etat` — jamais par une déduction côté client sur
 * l'adresse ou le nom d'hôte (le serveur seul sait si la requête est
 * locale). Tant qu'aucun `200` n'est revenu, aucune fonction `rendre*` ne
 * doit être appelée : afficher un bloc vide ("aucune spec", "aucun agent")
 * avant d'avoir regardé serait une AFFIRMATION FAUSSE, pas un état de
 * chargement — la pire forme de dette selon le README du module.
 *
 * `modeAuth` répond à UNE SEULE question : « suis-je autorisé ? ». Il ne
 * dit RIEN sur la capacité du flux temps réel à s'authentifier : un jeton
 * en mémoire (`sessionStorage`, reposé après un rechargement) peut rendre
 * `/api/etat` `200` — donc `modeAuth = "libre"` au sens où AUCUNE porte ne
 * s'ouvre — sur un déploiement qui EXIGE un jeton pour CE demandeur.
 * `EventSource` ne peut porter aucun en-tête : il échouerait quand même.
 * C'est `etat.jeton_requis`, lu dans le CORPS de la réponse (pas le code
 * HTTP), qui tranche entre `EventSource` et le sondage périodique — voir
 * `verifierEtatAuth` (bug-012, correctif « rechargement »). */
let modeAuth = "inconnu";     // inconnu | libre | requis
let minuteurActualisationPeriodique = null;

function masquerBandeauHote() { $("bandeau-hote").hidden = true; }

function afficherBandeauHote(motif) {
  /* 421 (hôte non reconnu) ou panne réseau : un jeton ne répare ni l'un ni
   * l'autre, donc PAS la modale — un bandeau distinct avec reprise. */
  const bandeau = $("bandeau-hote");
  $("bandeau-hote-texte").textContent = motif === "hote"
    ? "Hôte non reconnu par le serveur — l'adresse utilisée pour joindre ce "
      + "tableau de bord n'est pas déclarée côté serveur. Un jeton ne répare pas cela."
    : "Serveur injoignable.";
  bandeau.hidden = false;
}

function texteHorodatageAffiche() {
  if (dernierEtat && dernierEtat.horodatage) return heure(dernierEtat.horodatage);
  return heure(new Date().toISOString());
}

/* bug-017 (absorbée dans ce cycle au titre d'ADR-0017, feature-021 cycle 2,
 * lot 3 — voir ADR-0038) : la porte doit rendre le RESTE DU DOCUMENT
 * INERTE, pas seulement reprendre un focus qui s'en échappe. La rétention
 * de focus ci-dessous (`keydown` sur Tab) reste en place, EN COMPLÉMENT —
 * elle ne suffisait pas seule, mesuré par l'auditeur le 2026-09-15 (jusqu'à
 * 6 contrôles atteignables hors modale, dont le bouton de lancement).
 *
 * `#porte-jeton` reste ENFANT DIRECT DE <body> (index.html, condition déjà
 * établie par feature-019, préservée ici) : ses FRÈRES — tout ce qui vit au
 * même niveau qu'elle — reçoivent `inert` à l'ouverture, le perdent à la
 * fermeture. `inert` retire un sous-arbre ENTIER de l'arbre d'accessibilité
 * ET de l'ordre de tabulation — ce qu'aucune des alternatives de PIEGES §15
 * (`opacity`, hors-écran, hauteur nulle, détourage) ne fait pour un
 * sous-arbre. Le comptage des contrôles atteignables hors modale (0 exigé)
 * est le critère de F4b, lot 5 — ce correctif est structurel : il pose le
 * mécanisme que F4b viendra mesurer.
 *
 * Focus au retour : mémorisé à l'ouverture, restauré à la fermeture — « un
 * endroit NOMMÉ, pas au hasard » (critère du bug). Repli sur `#main-content`
 * (skip-link, tabindex="-1") si rien n'était mémorisé ou si l'élément a
 * disparu du DOM entre-temps (ex. rafraîchissement complet d'une liste) —
 * jamais `document.body`, qui ne nomme rien. */
let dernierFocusAvantPorte = null;

function freresDeLaPorte() {
  const porte = $("porte-jeton");
  const parent = porte && porte.parentNode;
  if (!parent || !parent.children) return [];
  return Array.prototype.filter.call(parent.children, (noeud) => noeud !== porte);
}

function fixerInerteAutourDeLaPorte(inerte) {
  freresDeLaPorte().forEach((frere) => {
    if (inerte) frere.setAttribute("inert", "");
    else frere.removeAttribute("inert");
  });
}

function ouvrirPorte(motif) {
  const porte = $("porte-jeton");
  const titre = $("porte-titre");
  const corps = $("porte-corps");
  const bouton = $("porte-bouton");
  const erreur = $("porte-erreur");
  const champ = $("porte-champ");

  erreur.hidden = true;
  erreur.textContent = "";
  champ.value = "";
  champ.disabled = false;
  bouton.disabled = false;

  if (motif === "jeton-refuse") {
    titre.textContent = "Reconnexion nécessaire";
    corps.textContent = "Jeton refusé — les données à l'écran datent de "
      + texteHorodatageAffiche() + ". Ressaisissez le jeton pour reprendre.";
    bouton.textContent = "Reconnecter";
  } else {
    titre.textContent = "Authentification requise";
    corps.textContent = "Ce serveur est consulté depuis un autre poste : la "
      + "lecture comme le pilotage exigent le jeton déclaré côté serveur "
      + "([serveur].fichier_jeton).";
    bouton.textContent = "Ouvrir le tableau de bord";
  }

  dernierFocusAvantPorte = (document.activeElement && document.activeElement !== document.body)
    ? document.activeElement : null;
  /* ⚠️ Mesuré en écrivant F4b (feature-021, cycle 2, lot 5), Chromium
   * 152.0.7977.75 : poser `inert` sur un ANCÊTRE d'un élément DÉJÀ actif ne
   * lui retire PAS le focus — il reste `document.activeElement`, et reste
   * même re-focalisable par un appel `.focus()` explicite ultérieur, bien
   * qu'il soit désormais dans un sous-arbre inerte. Sans ce `blur()`
   * explicite, un utilisateur qui a le focus dans la page au moment où la
   * porte se rouvre (401 tardif via `sur401Lecture`, pas seulement au tout
   * premier chargement où rien n'est encore focalisé) garderait un contrôle
   * RÉELLEMENT atteignable sous la modale — exactement le défaut que
   * bug-017 corrige. */
  if (dernierFocusAvantPorte && typeof dernierFocusAvantPorte.blur === "function") {
    dernierFocusAvantPorte.blur();
  }
  fixerInerteAutourDeLaPorte(true);
  porte.hidden = false;
  requestAnimationFrame(() => { champ.focus(); });
}

function fermerPorte() {
  $("porte-jeton").hidden = true;
  fixerInerteAutourDeLaPorte(false);
  const cible = dernierFocusAvantPorte;
  dernierFocusAvantPorte = null;
  if (cible && typeof cible.focus === "function") {
    cible.focus();
  } else {
    const repli = $("main-content");
    if (repli && repli.focus) repli.focus();
  }
}

/* Point d'entrée UNIQUE pour toute lecture qui essuie un 401 après le
 * premier chargement : arrête les minuteurs actifs, oublie le jeton
 * invalide, rouvre la porte — SANS toucher au DOM déjà rendu (les données à
 * l'écran restent affichées, seulement plus rafraîchies, derrière la
 * modale). */
function sur401Lecture() {
  arreterSondagePilotage();
  arreterActualisationPeriodique();
  oublierJetonPilotage();
  ouvrirPorte("jeton-refuse");
}

function demarrerActualisationPeriodique() {
  /* Repli du temps réel : `etat.jeton_requis` interdit `EventSource` (aucun
   * en-tête possible), donc sondage périodique — mode ATTENDU, pas une
   * panne (voir `.jauge.sondage`, ni `ok` ni `ko`). Décidé par le CORPS de
   * la réponse, jamais par `modeAuth` seul — voir `verifierEtatAuth`. */
  if (minuteurActualisationPeriodique) return;
  const jauge = $("jauge-flux");
  jauge.textContent = "actualisation périodique (10 s)";
  jauge.className = "jauge sondage";
  jauge.title = "connexion en direct impossible depuis ce poste — le flux "
    + "ne peut pas transmettre le jeton";
  minuteurActualisationPeriodique = setInterval(rafraichir, 10000);
}

function arreterActualisationPeriodique() {
  if (minuteurActualisationPeriodique) {
    clearInterval(minuteurActualisationPeriodique);
    minuteurActualisationPeriodique = null;
  }
}

async function gererSoumissionPorte() {
  const champ = $("porte-champ");
  const bouton = $("porte-bouton");
  const erreur = $("porte-erreur");
  const jeton = champ.value;
  if (!jeton) {
    erreur.textContent = "Jeton requis.";
    erreur.hidden = false;
    champ.focus();
    return;
  }
  bouton.disabled = true;
  champ.disabled = true;
  erreur.hidden = true;
  try {
    const reponse = await fetch("/api/etat", { headers: enTeteAuthPilotage(jeton) });
    if (reponse.status === 200) {
      stockerJetonPilotage(jeton);
      fermerPorte();
      rafraichir();
      demarrerActualisationPeriodique();
      /* Un lancement figé pendant la coupure reprend depuis le curseur EN
       * MÉMOIRE — jamais `depuis=0`, `pilotage.lancement` n'a pas été
       * touché par `sur401Lecture`. */
      if (pilotage.lancement && pilotage.lancement.etat === "en_cours") {
        demarrerSondagePilotage();
      }
      return;
    }
    if (reponse.status === 401) {
      erreur.textContent = "Jeton refusé.";
      erreur.hidden = false;
      champ.focus();
      return;
    }
    erreur.textContent = "Erreur du serveur (" + reponse.status + ").";
    erreur.hidden = false;
  } catch (erreurReseau) {
    erreur.textContent = "Erreur réseau : " + erreurReseau.message;
    erreur.hidden = false;
  } finally {
    bouton.disabled = false;
    champ.disabled = false;
  }
}

/* Contention de focus SIMPLE (pas un piège complet) : les deux seuls
 * contrôles de la modale se rebouclent l'un sur l'autre. Échap ne ferme
 * rien — aucun gestionnaire ne le fait, volontairement. */
$("porte-jeton").addEventListener("keydown", (evenement) => {
  if (evenement.key !== "Tab") return;
  const champ = $("porte-champ");
  const bouton = $("porte-bouton");
  const actif = document.activeElement;
  if (evenement.shiftKey) {
    if (actif === champ) { evenement.preventDefault(); bouton.focus(); }
  } else {
    if (actif === bouton) { evenement.preventDefault(); champ.focus(); }
  }
});
$("porte-bouton").addEventListener("click", gererSoumissionPorte);
$("porte-champ").addEventListener("keydown", (evenement) => {
  if (evenement.key === "Enter") { evenement.preventDefault(); gererSoumissionPorte(); }
});
$("bandeau-hote-bouton").addEventListener("click", () => {
  masquerBandeauHote();
  verifierEtatAuth();
});

/* Établit `modeAuth` empiriquement, une seule fois, au démarrage. Rien
 * d'autre ne doit décider ce mode ailleurs dans ce module.
 *
 * `modeAuth === "libre"` dit seulement que CETTE requête est passée — pas
 * que le flux temps réel peut s'authentifier (bug-012). Un jeton en
 * mémoire (rechargement de page) fait passer `/api/etat` en `200` sur un
 * déploiement qui exige pourtant un jeton pour ce demandeur ;
 * `EventSource` ne pose aucun en-tête et échouerait silencieusement,
 * laissant l'interface sans aucun rafraîchissement. Seul `etat.jeton_requis`,
 * lu dans le corps de LA MÊME réponse, tranche entre `EventSource` et le
 * sondage périodique. */
async function verifierEtatAuth() {
  masquerBandeauHote();
  try {
    const reponse = await fetch("/api/etat", { headers: enTeteAuthPilotage() });
    if (reponse.status === 200) {
      modeAuth = "libre";
      const etat = await reponse.json();
      rafraichir();
      if (etat.jeton_requis) {
        demarrerActualisationPeriodique();
      } else {
        brancherFlux();
      }
      return;
    }
    if (reponse.status === 401) {
      modeAuth = "requis";
      ouvrirPorte(jetonPilotageStocke() ? "jeton-refuse" : "premier-acces");
      return;
    }
    if (reponse.status === 421) {
      afficherBandeauHote("hote");
      return;
    }
    afficherBandeauHote("reseau");
  } catch (erreurReseau) {
    afficherBandeauHote("reseau");
  }
}

function dureeLisiblePilotage(ms) {
  if (ms === null || ms === undefined || ms < 0 || Number.isNaN(ms)) return null;
  if (ms < 1000) return Math.round(ms) + " ms";
  if (ms < 60000) return Math.round(ms / 1000) + " s";
  const minutes = Math.floor(ms / 60000);
  return minutes + " min " + Math.round((ms % 60000) / 1000) + " s";
}

function arreterSondagePilotage() {
  if (minuteurSondagePilotage) { clearInterval(minuteurSondagePilotage); minuteurSondagePilotage = null; }
}

/* -- badge d'en-tête, 3 états — piloté par le MÊME champ que le bloc Système -- */
function rendreBadgePilotage(etat) {
  const badge = $("jauge-pilotage");
  if (!etat || !etat.ecriture_active) {
    badge.textContent = "lecture seule";
    badge.className = "jauge lecture-seule";
    badge.title = (etat && etat.ecriture_raison) || "écriture non activée";
    return;
  }
  if (pilotage.lancement && pilotage.lancement.etat === "en_cours") {
    badge.textContent = "● lancement en cours";
    badge.className = "jauge pilotage-en-cours";
    badge.title = "un lancement est en cours, suivi depuis cet onglet";
  } else {
    badge.textContent = "pilotage actif";
    badge.className = "jauge pilotage-actif";
    badge.title = "l'écriture est active sur ce serveur";
  }
}

/* -- construction du DOM, entièrement redessiné à chaque changement de phase -- */
function rendreSelecteurPilotage() {
  const conteneur = el("div", "pilotage-select");
  const label = el("label", "", "Commande à lancer");
  label.htmlFor = "commande-lancer";
  const select = document.createElement("select");
  select.id = "commande-lancer";
  pilotage.commandes.forEach((cle) => {
    const option = el("option", "", cle);
    option.value = cle;
    if (cle === pilotage.cleChoisie) option.selected = true;
    select.appendChild(option);
  });
  select.addEventListener("change", () => { pilotage.cleChoisie = select.value; });
  conteneur.appendChild(label);
  conteneur.appendChild(select);
  return conteneur;
}

function rendreNotePlafondPilotage(budget, ecrivains) {
  return el("p", "note",
    "Plafond appliqué : " + (budget ?? "—") + " $ · Écrivains : " + (ecrivains ?? "—"));
}

function rendreConfirmationPilotage() {
  const conf = pilotage.confirmation;
  const enveloppe = document.createDocumentFragment();
  enveloppe.appendChild(el("p", "note", "Commande sélectionnée : " + conf.cle));

  const conteneur = el("div", "pilotage-confirmation");
  const titre = el("p", "");
  titre.appendChild(document.createTextNode("Lancer "));
  titre.appendChild(el("strong", "", conf.cle));
  titre.appendChild(document.createTextNode(" ?"));
  conteneur.appendChild(titre);
  conteneur.appendChild(el("p", "note",
    "Plafond réellement appliqué : " + conf.plafond + " $ (relu à l'instant du serveur) · "
    + "Écrivains : " + conf.ecrivains));

  let champJeton = null;
  if (conf.besoinJeton) {
    const bloc = el("div", "pilotage-jeton");
    const label = el("label", "", "Jeton de pilotage");
    label.htmlFor = "confirmation-jeton";
    champJeton = document.createElement("input");
    champJeton.type = "password";
    champJeton.id = "confirmation-jeton";
    champJeton.autocomplete = "off";
    champJeton.setAttribute("aria-describedby", "jeton-aide");
    champJeton.disabled = conf.enCours;
    const aide = el("p", "note",
      "Jeton partagé du serveur — jamais mémorisé au-delà de cet onglet.");
    aide.id = "jeton-aide";
    bloc.appendChild(label);
    bloc.appendChild(champJeton);
    bloc.appendChild(aide);
    conteneur.appendChild(bloc);
  }

  if (conf.erreur) {
    const erreur = el("p", "note", conf.erreur);
    erreur.setAttribute("role", "alert");
    conteneur.appendChild(erreur);
  }

  const boutons = el("div", "pilotage-boutons");
  const annuler = el("button", "pilotage-secondaire", "Annuler");
  annuler.type = "button";
  annuler.disabled = conf.enCours;
  annuler.addEventListener("click", surClicAnnulerConfirmationPilotage);
  const confirmer = el("button", "action-ecriture", "Confirmer le lancement");
  confirmer.type = "button";
  confirmer.id = "bouton-confirmer";
  confirmer.disabled = conf.enCours;
  confirmer.addEventListener("click", surClicConfirmerPilotage);
  boutons.appendChild(annuler);
  boutons.appendChild(confirmer);
  conteneur.appendChild(boutons);
  enveloppe.appendChild(conteneur);

  /* Le sous-panneau REMPLACE le bouton in situ : le focus s'y pose, sur le
   * premier contrôle utile (le champ jeton s'il est demandé, sinon
   * directement la confirmation). */
  requestAnimationFrame(() => { (champJeton || confirmer).focus(); });

  return enveloppe;
}

function rendreOccupePilotage() {
  const conteneur = el("div", "pilotage-occupe");
  const texte = el("p", "note avert", pilotage.occupe.texte);
  texte.setAttribute("role", "status");
  texte.setAttribute("aria-live", "polite");
  conteneur.appendChild(texte);
  /* Modèle de permission binaire assumé (voir spec) : tout porteur du jeton
   * peut interrompre, quel que soit celui qui a lancé. */
  const bouton = el("button", "action-ecriture", "Interrompre");
  bouton.type = "button";
  bouton.addEventListener("click", surClicInterromprePilotage);
  conteneur.appendChild(bouton);
  return conteneur;
}

function construireLigneEtatPilotage(l) {
  const ligne = el("p", "pilotage-ligne");
  ligne.id = "pilotage-ligne-etat";
  ligne.setAttribute("role", "status");
  ligne.setAttribute("aria-live", "polite");

  if (l.etat === "en_cours") {
    const inactiviteMs = Date.now() - l.derniereActivite * 1000;
    const bloque = inactiviteMs > 30000;
    ligne.classList.add(bloque ? "bloque" : "en-cours");
    const ecoule = dureeLisiblePilotage(inactiviteMs) || "0 s";
    ligne.textContent = bloque
      ? "● en cours — bloqué depuis " + ecoule
      : "● en cours · dernière sortie il y a " + ecoule;
  } else if (l.etat === "termine") {
    ligne.classList.add("termine");
    const dureeTxt = l.debutClient ? dureeLisiblePilotage(Date.now() - l.debutClient) : null;
    ligne.textContent = "✓ terminé" + (dureeTxt ? " · durée " + dureeTxt : "");
  } else if (l.etat === "echec") {
    ligne.classList.add("echec");
    const dureeTxt = l.debutClient ? dureeLisiblePilotage(Date.now() - l.debutClient) : null;
    ligne.textContent = "✕ échoué"
      + (l.syntheticMessage ? " · " + l.syntheticMessage : "")
      + (dureeTxt ? " · durée " + dureeTxt : "");
  } else if (l.etat === "interrompu") {
    ligne.classList.add("interrompu");
    ligne.textContent = "■ interrompu par l'utilisateur";
  } else {
    ligne.textContent = String(l.etat || "");
  }
  return ligne;
}

function rendreLancementPilotage() {
  const l = pilotage.lancement;
  const conteneur = el("div", "pilotage-lancement");
  conteneur.appendChild(construireLigneEtatPilotage(l));

  if (l.tronque) {
    conteneur.appendChild(el("div", "pilotage-tronque",
      "⚠ SORTIE TRONQUÉE — le début n'est pas affiché"));
  }

  const pre = document.createElement("pre");
  pre.id = "sortie-lancement";
  pre.textContent = l.texteSortie || "";
  conteneur.appendChild(pre);

  const boutons = el("div", "pilotage-boutons");
  if (l.etat === "en_cours") {
    const interrompre = el("button", "pilotage-secondaire", "Interrompre");
    interrompre.type = "button";
    interrompre.addEventListener("click", surClicInterromprePilotage);
    boutons.appendChild(interrompre);
  } else {
    const nouveau = el("button", "action-ecriture", "Nouveau lancement");
    nouveau.type = "button";
    nouveau.addEventListener("click", surClicNouveauLancementPilotage);
    boutons.appendChild(nouveau);
  }
  conteneur.appendChild(boutons);

  requestAnimationFrame(() => { pre.scrollTop = pre.scrollHeight; });
  return conteneur;
}

function rendrePilotage() {
  const corps = $("pilotage-corps");
  vider(corps);

  if (pilotage.phase === "chargement") {
    corps.appendChild(el("p", "vide", "chargement…"));
  } else if (pilotage.phase === "inactif") {
    const note = el("p", "note avert");
    note.appendChild(document.createTextNode("Écriture non activée : "));
    note.appendChild(el("strong", "", pilotage.raison || "raison inconnue"));
    corps.appendChild(note);
  } else if (pilotage.phase === "pret") {
    if (!pilotage.commandes.length) {
      corps.appendChild(el("p", "vide",
        "aucune commande déclarée — ajoutez-en une sous [commandes] dans la "
        + "configuration pour activer le pilotage"));
      return;
    }
    corps.appendChild(rendreSelecteurPilotage());
    corps.appendChild(rendreNotePlafondPilotage(pilotage.budgetMaxUsd, pilotage.ecrivains));
    const bouton = el("button", "action-ecriture", "Lancer…");
    bouton.type = "button";
    bouton.id = "bouton-lancer";
    bouton.addEventListener("click", surClicLancerPilotage);
    corps.appendChild(bouton);
  } else if (pilotage.phase === "confirmation") {
    corps.appendChild(rendreConfirmationPilotage());
  } else if (pilotage.phase === "occupe") {
    corps.appendChild(rendreOccupePilotage());
  } else if (pilotage.phase === "lancement") {
    corps.appendChild(rendreLancementPilotage());
  }
}

/* -- actions ------------------------------------------------------------- */
async function surClicLancerPilotage() {
  const bouton = $("bouton-lancer");
  if (bouton) bouton.disabled = true;
  try {
    /* Plafond relu ICI, frais — jamais une valeur mise en cache par un sondage
     * antérieur (SSE ou autre). */
    const reponse = await fetch("/api/etat", { headers: enTeteAuthPilotage() });
    if (reponse.status === 401) {
      if (bouton) bouton.disabled = false;
      return sur401Lecture();
    }
    const etat = await reponse.json();
    dernierEtat = etat;
    if (!etat.ecriture_active) {
      pilotage.phase = "inactif";
      pilotage.raison = etat.ecriture_raison;
      rendrePilotage();
      rendreBadgePilotage(etat);
      return;
    }
    pilotage.commandes = etat.commandes_declarees || [];
    pilotage.budgetMaxUsd = etat.garde_fous.budget_max_usd;
    pilotage.ecrivains = etat.garde_fous.ecrivains_simultanes;
    pilotage.confirmation = {
      cle: pilotage.cleChoisie,
      plafond: pilotage.budgetMaxUsd,
      ecrivains: pilotage.ecrivains,
      besoinJeton: modeAuth === "requis" && !jetonPilotageStocke(),
      erreur: null,
      enCours: false,
    };
    pilotage.phase = "confirmation";
    rendrePilotage();
  } catch (erreur) {
    if (bouton) bouton.disabled = false;
  }
}

function surClicAnnulerConfirmationPilotage() {
  pilotage.confirmation = null;
  pilotage.phase = "pret";
  rendrePilotage();
  const bouton = $("bouton-lancer");
  if (bouton) bouton.focus();
}

async function surClicConfirmerPilotage() {
  const conf = pilotage.confirmation;
  if (!conf || conf.enCours) return;
  let jeton = jetonPilotageStocke();
  if (!jeton) {
    const champ = $("confirmation-jeton");
    jeton = champ ? champ.value : "";
  }
  if (!jeton) {
    conf.erreur = "Jeton requis.";
    rendrePilotage();
    return;
  }

  conf.enCours = true;
  conf.erreur = null;
  rendrePilotage();

  try {
    const reponse = await fetch("/api/lancer", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, enTeteAuthPilotage(jeton)),
      body: JSON.stringify({ cle: conf.cle }),
    });

    if (reponse.status === 202) {
      stockerJetonPilotage(jeton);
      pilotage.lancement = {
        cle: conf.cle, etat: "en_cours", curseur: 0, tronque: false,
        derniereActivite: Date.now() / 1000, debutClient: Date.now(),
        texteSortie: "", syntheticMessage: null,
      };
      pilotage.confirmation = null;
      pilotage.phase = "lancement";
      rendrePilotage();
      rendreBadgePilotage(dernierEtat);
      demarrerSondagePilotage();
      return;
    }

    const donnees = await reponse.json().catch(() => ({}));

    if (reponse.status === 401) {
      oublierJetonPilotage();
      conf.enCours = false;
      conf.besoinJeton = true;
      conf.erreur = "Jeton refusé.";
      rendrePilotage();
      return;
    }
    if (reponse.status === 403) {
      pilotage.confirmation = null;
      pilotage.phase = "inactif";
      rendrePilotage();
      const r = await fetch("/api/etat", { headers: enTeteAuthPilotage() });
      const etat = await r.json();
      dernierEtat = etat;
      pilotage.raison = etat.ecriture_raison;
      rendrePilotage();
      rendreBadgePilotage(etat);
      return;
    }
    if (reponse.status === 409) {
      stockerJetonPilotage(jeton);
      pilotage.occupe = { texte: donnees.erreur || "un écrivain occupe déjà la place" };
      pilotage.confirmation = null;
      pilotage.phase = "occupe";
      rendrePilotage();
      return;
    }
    if (reponse.status === 503) {
      /* Aucun processus n'a été créé : le bouton ne repasse JAMAIS en
       * « en cours » dans ce cas. */
      stockerJetonPilotage(jeton);
      pilotage.lancement = {
        cle: conf.cle, etat: "echec", curseur: 0, tronque: false,
        derniereActivite: Date.now() / 1000, debutClient: null,
        texteSortie: "", syntheticMessage: donnees.erreur || "plafond de dépense non transmissible",
      };
      pilotage.confirmation = null;
      pilotage.phase = "lancement";
      rendrePilotage();
      return;
    }
    if (reponse.status === 404) {
      conf.enCours = false;
      conf.erreur = "Clé de commande inconnue — la liste a peut-être changé.";
      rendrePilotage();
      return;
    }
    conf.enCours = false;
    conf.erreur = "Erreur du serveur (" + reponse.status + ").";
    rendrePilotage();
  } catch (erreur) {
    conf.enCours = false;
    conf.erreur = "Erreur réseau : " + erreur.message;
    rendrePilotage();
  }
}

async function surClicInterromprePilotage() {
  try {
    /* Corps VIDE mais explicite : sans lui, certains clients HTTP n'émettent
     * aucun `Content-Length`, que `do_POST` exige avant toute autre garde
     * (411 sinon) — vérifié par exécution sur ce module (`curl -X POST` sans
     * `--data` échoue en 411, `--data ''` réussit). */
    const reponse = await fetch("/api/interrompre", {
      method: "POST",
      headers: enTeteAuthPilotage(),
      body: "",
    });
    if (reponse.status === 202) {
      if (pilotage.phase === "occupe") {
        /* On ne connaît ni la clé exacte ni un curseur pertinent pour ce
         * lancement qu'on n'a pas soi-même démarré : on repart de 0, comme au
         * chargement de page — c'est ce qui rend la reconnexion possible sans
         * état persistant côté client. */
        pilotage.lancement = {
          cle: null, etat: "en_cours", curseur: 0, tronque: false,
          derniereActivite: Date.now() / 1000, debutClient: null,
          texteSortie: "", syntheticMessage: null,
        };
        pilotage.occupe = null;
        pilotage.phase = "lancement";
        rendrePilotage();
        rendreBadgePilotage(dernierEtat);
        demarrerSondagePilotage();
      }
      return;
    }
    if (reponse.status === 401) {
      oublierJetonPilotage();
      return;
    }
    if (reponse.status === 403) {
      pilotage.phase = "inactif";
      rendrePilotage();
      const r = await fetch("/api/etat", { headers: enTeteAuthPilotage() });
      const etat = await r.json();
      dernierEtat = etat;
      pilotage.raison = etat.ecriture_raison;
      rendrePilotage();
      rendreBadgePilotage(etat);
      return;
    }
    if (reponse.status === 404 && pilotage.phase === "occupe") {
      pilotage.occupe = null;
      pilotage.phase = "pret";
      rendrePilotage();
    }
  } catch (erreur) {
    /* Réessayable : le bouton reste affiché, rien n'est changé côté état. */
  }
}

function surClicNouveauLancementPilotage() {
  arreterSondagePilotage();
  pilotage.lancement = null;
  pilotage.phase = "pret";
  rendrePilotage();
  const bouton = $("bouton-lancer");
  if (bouton) bouton.focus();
}

/* -- sondage de la sortie, ~1 s, PENDANT un lancement seulement -- */
function demarrerSondagePilotage() {
  arreterSondagePilotage();
  sonderLancementPilotage();
  minuteurSondagePilotage = setInterval(sonderLancementPilotage, 1000);
}

async function sonderLancementPilotage() {
  if (!pilotage.lancement) return arreterSondagePilotage();
  try {
    const reponse = await fetch("/api/lancement?depuis=" + pilotage.lancement.curseur,
      { headers: enTeteAuthPilotage() });
    if (reponse.status === 200) {
      const donnees = await reponse.json();
      if (donnees.lignes) pilotage.lancement.texteSortie += donnees.lignes;
      pilotage.lancement.curseur = donnees.curseur;
      /* Sticky : une fois annoncée, la troncature ne redevient jamais fausse —
       * c'est le DÉBUT qui a été perdu, pas la fin. */
      pilotage.lancement.tronque = pilotage.lancement.tronque || !!donnees.tronque;
      /* « Bloqué » vient de `derniere_activite` renvoyé par le SERVEUR, jamais
       * de l'absence de nouvelles lignes côté client : un sondage qui échoue
       * une fois ne doit pas se lire comme un blocage de la commande. */
      pilotage.lancement.derniereActivite = donnees.derniere_activite;
      pilotage.lancement.etat = donnees.etat;
      if (donnees.etat !== "en_cours") arreterSondagePilotage();
      rendrePilotage();
      rendreBadgePilotage(dernierEtat);
    } else if (reponse.status === 401) {
      sur401Lecture();
    } else if (reponse.status === 403) {
      arreterSondagePilotage();
      pilotage.phase = "inactif";
      const r = await fetch("/api/etat", { headers: enTeteAuthPilotage() });
      const etat = await r.json();
      dernierEtat = etat;
      pilotage.raison = etat.ecriture_raison;
      rendrePilotage();
      rendreBadgePilotage(etat);
    } else if (reponse.status === 404) {
      arreterSondagePilotage();
    }
    /* Autre code, ou exception réseau ci-dessous : on retente au prochain
     * battement, silencieusement — c'est le principe explicite du sondage. */
  } catch (erreur) {
    /* idem */
  }
}

/* -- initialisation / réaction à /api/etat ------------------------------- */
async function initialiserPilotage(etat) {
  pilotage.phase = "pret";
  if (pilotage.commandes.length && !pilotage.cleChoisie) pilotage.cleChoisie = pilotage.commandes[0];
  const jeton = jetonPilotageStocke();
  if (jeton) {
    /* Reconnexion : on redemande depuis `curseur=0` pour recharger le tampon
     * avant de reprendre l'incrémental — pas d'état persistant côté client. */
    try {
      const reponse = await fetch("/api/lancement?depuis=0", { headers: enTeteAuthPilotage(jeton) });
      if (reponse.status === 200) {
        const donnees = await reponse.json();
        pilotage.lancement = {
          cle: pilotage.cleChoisie, etat: donnees.etat, curseur: donnees.curseur,
          tronque: !!donnees.tronque, derniereActivite: donnees.derniere_activite,
          debutClient: null, texteSortie: donnees.lignes || "", syntheticMessage: null,
        };
        pilotage.phase = "lancement";
        if (donnees.etat === "en_cours") demarrerSondagePilotage();
      } else if (reponse.status === 401) {
        oublierJetonPilotage();
      } else if (reponse.status === 403) {
        pilotage.phase = "inactif";
      }
      /* 404 « aucun lancement » : rien à faire, la phase reste « pret ». */
    } catch (erreur) {
      /* Reconnexion ratée : on retombe simplement sur l'état « pret ». */
    }
  }
  rendrePilotage();
  rendreBadgePilotage(dernierEtat);
}

function actualiserPilotage(etat) {
  pilotage.budgetMaxUsd = etat.garde_fous.budget_max_usd;
  pilotage.ecrivains = etat.garde_fous.ecrivains_simultanes;
  pilotage.commandes = etat.commandes_declarees || [];
  pilotage.raison = etat.ecriture_raison;

  if (!etat.ecriture_active) {
    /* Un lancement réellement en cours survit côté serveur : l'interface
     * cesse seulement de prétendre pouvoir le piloter depuis cet onglet. */
    arreterSondagePilotage();
    pilotage.phase = "inactif";
    rendrePilotage();
    rendreBadgePilotage(etat);
    return;
  }

  if (pilotage.phase === "chargement") {
    initialiserPilotage(etat);
    return;
  }

  /* Les autres phases ne se réinitialisent jamais depuis `/api/etat` : ce
   * champ ne porte que `ecriture_active` / `ecriture_raison` et les
   * garde-fous affichés — jamais l'état d'un lancement, qui vient
   * exclusivement de `/api/lancement`. */
  if (pilotage.phase === "pret" && !pilotage.cleChoisie && pilotage.commandes.length) {
    pilotage.cleChoisie = pilotage.commandes[0];
  }
  rendrePilotage();
  rendreBadgePilotage(etat);
}

/* --------------------------------------------------------------- redaction -
 * feature-008 : décrire un besoin en texte libre, obtenir un brouillon de
 * spec conforme au template DU PROJET, le relire, l'éditer, puis l'écrire
 * explicitement dans `specs/features/todo/`.
 *
 * AUCUN appel de modèle : le texte saisi ne quitte JAMAIS ce poste — les
 * substitutions sont déterministes, côté serveur (architect, feature-008).
 *
 * Machine à états calquée sur `pilotage` ci-dessus :
 *   saisie -> brouillon -> confirmation-ecriture -> ecrit
 * plus une erreur qui NE QUITTE JAMAIS la phase où elle survient — jamais de
 * reset du texte du besoin, du brouillon ou du contenu édité.
 *
 * Design arrêté (ux-ui-designer, feature-008) : panneau en FLUX normal dans
 * `.demande`, aucune surface `role="dialog"`/`.porte` pour ce flux tant que
 * bug-017 (la porte d'authentification ne rend pas le reste du document
 * inerte au clavier) n'est pas corrigé — rebâtir une modale ici exposerait
 * le même défaut sur une action plus grave (écriture de fichier sur disque).
 *
 * `ecriture_active` / `ecriture_raison` sont lus depuis le MÊME `dernierEtat`
 * que le bloc Pilotage (aucun nouvel appel réseau) : le bouton « Écrire… »
 * n'est qu'une commodité d'affichage, jamais une garde — le backend revalide
 * tout (401/422/409/503/500 gérés explicitement plus bas).
 */
let redaction = {
  phase: "saisie",          // saisie | brouillon | confirmation-ecriture | ecrit
  enCoursBrouillon: false,
  enCoursEcriture: false,
  erreurBrouillon: null,    // affichée près du bouton Générer/Régénérer
  erreurEcriture: null,     // affichée près du bouton Confirmer l'écriture
  /* { genre, titre, texte, minimal, slug, nomFichierPrevu, substitutions } —
   * l'EXACTE requête qui a produit ce brouillon. `genre`/`titre` sont
   * renvoyés à `/api/spec/ecrire` (jamais une relecture tardive de
   * `#titre-besoin`, qui a pu changer depuis sans régénération) ; `texte`/
   * `minimal` ne servent qu'à `/api/spec/brouillon` (pas repris à
   * l'écriture, qui envoie `contenu` à la place — voir `surClicConfirmerEcriture`). */
  brouillon: null,
  contenu: "",              // texte du <textarea class="brouillon"> — ÉCRIT VERBATIM sur disque
  compteRemplir: 0,
  derogationIgnoree: false, // dérogation cochée mais template complet imposé
  ecrit: null,              // { chemin, numero }
};

let minuteurCompteRemplir = null;

/* Seul le COMPTE est affiché (aria-live) — jamais une coloration de
 * sous-chaîne dans un `<textarea>` (impossible sans en changer la nature,
 * ux-ui-designer). Recalculé côté client uniquement, jamais renvoyé par le
 * serveur : c'est une aide à la relecture, pas une validation. */
function compterRemplir(texte) {
  const trouves = String(texte || "").match(/\[remplir\]/g);
  return trouves ? trouves.length : 0;
}

/* La réponse de `POST /api/spec/brouillon` (`{genre, slug, nom_fichier_prevu,
 * contenu, substitutions}`) ne porte AUCUN champ qui distingue le gabarit
 * complet du gabarit minimal — `genre` n'est qu'un écho de `type`, jamais un
 * signal d'escalade (le choix fail-closed entre gabarit complet/minimal,
 * `choisir_richesse`, est invisible ailleurs que dans le contenu lui-même).
 * C'est donc le CONTENU renvoyé par LE BROUILLON qu'il faut lire pour
 * détecter une escalade : `## Symptôme observé` n'existe que dans
 * `specs/modele.md` (gabarit minimal), jamais dans `_template.md` (gabarit
 * complet). Sert UNIQUEMENT à afficher la note « Dérogation ignorée » à la
 * génération du brouillon — sans effet sur `/api/spec/ecrire`, qui écrit
 * désormais le Markdown relu VERBATIM (voir `surClicConfirmerEcriture`). */
function contenuEstGabaritMinimal(contenu) {
  return String(contenu || "").indexOf("## Symptôme observé") !== -1;
}

function texteCompteRemplir(n) {
  return n + (n === 1 ? " bloc [remplir] restant" : " blocs [remplir] restants");
}

function actualiserCompteurPrompt() {
  const champ = $("spec-prompt");
  const compteur = $("compteur-prompt");
  if (!champ || !compteur) return;
  const n = champ.value.length;
  compteur.textContent = n + (n === 1 ? " caractère" : " caractères");
}

function afficherErreurGenerationStatique(message) {
  const p = $("erreur-generer-brouillon");
  if (!p) return;
  p.textContent = message;
  p.hidden = false;
}

function masquerErreurGenerationStatique() {
  const p = $("erreur-generer-brouillon");
  if (!p) return;
  p.hidden = true;
  p.textContent = "";
}

function messageErreurGenerique(statut) {
  return "Erreur du serveur (" + statut + ").";
}

function rendreBrouillonRedaction() {
  const conteneur = document.createDocumentFragment();
  const b = redaction.brouillon;

  const titre = el("h3", "", "Brouillon — " + b.nomFichierPrevu);
  titre.tabIndex = -1;
  conteneur.appendChild(titre);

  const subs = b.substitutions || [];
  conteneur.appendChild(el("p", "note",
    subs.length ? "Substitutions automatiques : " + subs.join(", ")
      : "Aucune substitution automatique — tout reste à relire."));

  if (redaction.derogationIgnoree) {
    conteneur.appendChild(el("p", "note avert",
      "Dérogation ignorée : le texte mentionne un sujet sensible — "
      + "template complet appliqué."));
  }

  const compteurRemplir = el("span", "compteur", texteCompteRemplir(redaction.compteRemplir));
  compteurRemplir.setAttribute("aria-live", "polite");
  conteneur.appendChild(compteurRemplir);

  const textarea = document.createElement("textarea");
  textarea.id = "brouillon-contenu";
  textarea.className = "brouillon";
  textarea.rows = 20;
  textarea.value = redaction.contenu;
  textarea.setAttribute("aria-label",
    "Contenu du brouillon, modifiable avant écriture — c'est EXACTEMENT ce "
    + "texte qui sera écrit sur disque, les blocs [remplir] restent visibles "
    + "tels quels");
  /* Recalcul débounced (~300 ms) : jamais recompté côté serveur, et la
   * garde-fou anti-perte de focus du module (aucun `vider`/redessin complet
   * pendant la frappe) — seuls le compteur et l'état sont mis à jour. */
  textarea.addEventListener("input", () => {
    clearTimeout(minuteurCompteRemplir);
    minuteurCompteRemplir = setTimeout(() => {
      redaction.contenu = textarea.value;
      redaction.compteRemplir = compterRemplir(textarea.value);
      compteurRemplir.textContent = texteCompteRemplir(redaction.compteRemplir);
    }, 300);
  });
  conteneur.appendChild(textarea);

  const boutons = el("div", "pilotage-boutons");
  const regenerer = el("button", "pilotage-secondaire", "Régénérer");
  regenerer.type = "button";
  regenerer.disabled = redaction.enCoursBrouillon;
  regenerer.addEventListener("click", surClicGenererBrouillon);
  boutons.appendChild(regenerer);

  const ecritureActive = Boolean(dernierEtat && dernierEtat.ecriture_active);
  const ecrire = el("button", "action-ecriture", "Écrire dans todo/…");
  ecrire.type = "button";
  ecrire.id = "bouton-ecrire-spec";
  /* Commodité d'affichage seulement : le backend revalide `ecriture_active`
   * indépendamment, à l'écriture réelle. */
  ecrire.disabled = !ecritureActive || redaction.enCoursEcriture;
  ecrire.addEventListener("click", surClicDemanderEcriture);
  boutons.appendChild(ecrire);

  if (redaction.erreurBrouillon) {
    const erreur = el("p", "note erreur", redaction.erreurBrouillon);
    erreur.setAttribute("role", "alert");
    conteneur.appendChild(erreur);
  }

  conteneur.appendChild(boutons);

  if (!ecritureActive) {
    const note = el("p", "note avert");
    note.appendChild(document.createTextNode("Écriture non activée : "));
    note.appendChild(el("strong", "", (dernierEtat && dernierEtat.ecriture_raison) || "raison inconnue"));
    conteneur.appendChild(note);
  }

  requestAnimationFrame(() => { titre.focus(); });
  return conteneur;
}

function rendreConfirmationEcritureRedaction() {
  const conteneur = document.createDocumentFragment();
  const titre = el("h3", "", "Confirmer l'écriture");
  titre.tabIndex = -1;
  conteneur.appendChild(titre);

  const question = el("p", "");
  question.appendChild(document.createTextNode("Écrire "));
  question.appendChild(el("code", "", redaction.brouillon.nomFichierPrevu));
  question.appendChild(document.createTextNode(" dans specs/features/todo/ ?"));
  conteneur.appendChild(question);

  conteneur.appendChild(el("p", "note",
    "Fichier créé sur disque, non commité. Irréversible côté outil."));

  if (redaction.erreurEcriture) {
    const erreur = el("p", "note erreur", redaction.erreurEcriture);
    erreur.setAttribute("role", "alert");
    conteneur.appendChild(erreur);
  }

  const boutons = el("div", "pilotage-boutons");
  const annuler = el("button", "pilotage-secondaire", "Annuler");
  annuler.type = "button";
  annuler.disabled = redaction.enCoursEcriture;
  annuler.addEventListener("click", surClicAnnulerEcriture);
  const confirmer = el("button", "action-ecriture", "Confirmer l'écriture");
  confirmer.type = "button";
  confirmer.disabled = redaction.enCoursEcriture;
  confirmer.addEventListener("click", surClicConfirmerEcriture);
  boutons.appendChild(annuler);
  boutons.appendChild(confirmer);
  conteneur.appendChild(boutons);

  requestAnimationFrame(() => { titre.focus(); });
  return conteneur;
}

function rendreEcritRedaction() {
  const conteneur = document.createDocumentFragment();
  const titre = el("h3", "", "Spec écrite");
  titre.tabIndex = -1;
  conteneur.appendChild(titre);

  const p = el("p", "");
  p.appendChild(document.createTextNode("Fichier créé : "));
  p.appendChild(el("code", "", redaction.ecrit.chemin));
  conteneur.appendChild(p);

  conteneur.appendChild(el("p", "note",
    "Numéro attribué : " + redaction.ecrit.numero + ". Non committé — la "
    + "promotion vers doing/ reste la main de spec-reader."));

  const nouveau = el("button", "pilotage-secondaire", "Nouveau brouillon");
  nouveau.type = "button";
  nouveau.addEventListener("click", surClicNouveauBrouillon);
  conteneur.appendChild(nouveau);

  requestAnimationFrame(() => { titre.focus(); });
  return conteneur;
}

function rendreRedaction() {
  clearTimeout(minuteurCompteRemplir);
  const corps = $("redaction-corps");
  if (!corps) return;
  vider(corps);
  if (redaction.phase === "brouillon") {
    corps.appendChild(rendreBrouillonRedaction());
  } else if (redaction.phase === "confirmation-ecriture") {
    corps.appendChild(rendreConfirmationEcritureRedaction());
  } else if (redaction.phase === "ecrit") {
    corps.appendChild(rendreEcritRedaction());
  }
  /* phase === "saisie" : rien à afficher, le formulaire suffit. */
}

/* -- actions ------------------------------------------------------------- */

/* Sert à la fois « Générer le brouillon » (phase saisie) et « Régénérer »
 * (phase brouillon) : les deux relisent les MÊMES champs (`#titre-besoin`,
 * `#spec-prompt`, `#derogation-minimale`) — Régénérer n'agit jamais sur le texte
 * édité du brouillon, seulement sur le besoin d'origine (voir message du
 * 409). La case « bug simple / refactor ponctuel » pilote À LA FOIS le
 * PRÉFIXE de fichier demandé (`type` : "bug" plutôt que "feature") et
 * la RICHESSE de template demandée (`minimal`) — le serveur peut honorer
 * l'un sans l'autre (fail-closed sur la richesse seulement, voir
 * `contenuEstGabaritMinimal`), jamais l'inverse : le frontend ne décide
 * rien, il relit ce que le contenu renvoyé révèle. */
async function surClicGenererBrouillon() {
  const champTitre = $("titre-besoin");
  const champPrompt = $("spec-prompt");
  const champDerogation = $("derogation-minimale");
  if (!champTitre || !champPrompt || !champDerogation) return;
  const titre = champTitre.value;
  const texte = champPrompt.value;
  const derogationDemandee = champDerogation.checked;
  const type = derogationDemandee ? "bug" : "feature";
  const enRegeneration = redaction.phase === "brouillon";

  redaction.enCoursBrouillon = true;
  redaction.erreurBrouillon = null;
  masquerErreurGenerationStatique();
  const boutonInitial = $("bouton-generer-brouillon");
  if (boutonInitial) boutonInitial.disabled = true;
  if (enRegeneration) rendreRedaction();

  try {
    const reponse = await fetch("/api/spec/brouillon", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, enTeteAuthPilotage()),
      body: JSON.stringify({ type: type, titre: titre, texte: texte, minimal: derogationDemandee }),
    });

    if (reponse.status === 401) {
      /* Reboucle (revue) : la porte peut s'ouvrir à tout moment — jamais au
       * prix du Markdown relu. Le drapeau retombe et le panneau se redessine
       * AVANT `sur401Lecture()`, pour que « Régénérer »/« Écrire… » soient
       * de nouveau cliquables dès la reconnexion, sans rechargement qui
       * détruirait `redaction.contenu`. */
      redaction.enCoursBrouillon = false;
      if (enRegeneration) rendreRedaction();
      sur401Lecture();
      return;
    }

    const donnees = await reponse.json().catch(() => ({}));

    if (reponse.status === 200) {
      redaction.brouillon = {
        genre: donnees.genre,
        titre: titre,
        texte: texte,
        minimal: derogationDemandee,
        slug: donnees.slug,
        nomFichierPrevu: donnees.nom_fichier_prevu,
        substitutions: donnees.substitutions || [],
      };
      redaction.contenu = donnees.contenu || "";
      redaction.compteRemplir = compterRemplir(redaction.contenu);
      /* Escalade rendue visible, jamais silencieuse : une dérogation demandée
       * mais non honorée par le serveur (mot-clé sensible détecté côté
       * serveur, fail-closed) se voit — `genre` n'est qu'un écho de `type`,
       * la seule preuve fiable est dans le CONTENU renvoyé. */
      redaction.derogationIgnoree = derogationDemandee && !contenuEstGabaritMinimal(redaction.contenu);
      redaction.enCoursBrouillon = false;
      redaction.phase = "brouillon";
      rendreRedaction();
      return;
    }

    redaction.enCoursBrouillon = false;
    let message;
    if (reponse.status === 422) {
      message = donnees.erreur
        || "Titre ou texte vide ou invalide après normalisation : reformulez.";
    } else if (reponse.status === 500) {
      message = "Erreur serveur : le template ou le répertoire cible est introuvable.";
    } else {
      message = messageErreurGenerique(reponse.status);
    }
    redaction.erreurBrouillon = message;
    if (enRegeneration) rendreRedaction();
    else afficherErreurGenerationStatique(message);
  } catch (erreur) {
    redaction.enCoursBrouillon = false;
    redaction.erreurBrouillon = "Erreur réseau : " + erreur.message;
    if (enRegeneration) rendreRedaction();
    else afficherErreurGenerationStatique(redaction.erreurBrouillon);
  } finally {
    if (boutonInitial) boutonInitial.disabled = false;
  }
}

/* Aucun appel réseau ici : `ecriture_active` est déjà connu par le MÊME
 * `dernierEtat` que le bloc Pilotage (voir en-tête de section). Le bouton
 * est déjà désactivé si l'écriture n'est pas active — cette vérification est
 * une commodité, pas une garde, le clic ne peut de toute façon pas survenir
 * sur un bouton `disabled`. */
function surClicDemanderEcriture() {
  if (!dernierEtat || !dernierEtat.ecriture_active) {
    /* Rare : l'état a changé depuis le dernier rendu du panneau (le bouton
     * était encore affiché actif). On redessine pour que le bouton et la
     * note « Écriture non activée » reflètent l'état réel — sans nouvel
     * appel réseau, toujours le même `dernierEtat`. */
    rendreRedaction();
    return;
  }
  /* Flush du débounce : le panneau de confirmation ne porte plus de
   * <textarea> (rendreConfirmationEcritureRedaction), donc plus aucune
   * frappe ne pourra mettre à jour `redaction.contenu` une fois qu'on aura
   * quitté cette phase. `/api/spec/ecrire` écrit désormais CE texte
   * verbatim (voir `surClicConfirmerEcriture`) : une frappe survenue dans
   * les 300 ms précédant le clic ne doit jamais se perdre. */
  const champBrouillon = $("brouillon-contenu");
  if (champBrouillon) {
    clearTimeout(minuteurCompteRemplir);
    redaction.contenu = champBrouillon.value;
    redaction.compteRemplir = compterRemplir(champBrouillon.value);
  }
  redaction.erreurEcriture = null;
  redaction.phase = "confirmation-ecriture";
  rendreRedaction();
}

function surClicAnnulerEcriture() {
  redaction.erreurEcriture = null;
  redaction.phase = "brouillon";
  rendreRedaction();
  const bouton = $("bouton-ecrire-spec");
  if (bouton) bouton.focus();
}

async function surClicConfirmerEcriture() {
  if (redaction.enCoursEcriture) return;
  redaction.enCoursEcriture = true;
  redaction.erreurEcriture = null;
  rendreRedaction();

  try {
    /* `contenu` est le Markdown EXACTEMENT tel qu'affiché et édité dans le
     * <textarea> (flush du débounce fait par `surClicDemanderEcriture` avant
     * d'entrer dans cette phase) — c'est ce que l'humain a relu, écrit
     * VERBATIM par le serveur. `type`/`titre` restent des champs dédiés :
     * le slug, donc le chemin, en est re-dérivé et re-validé côté serveur,
     * jamais lu dans `contenu` (GATE P1 condition 1 — porte sur le CHEMIN,
     * jamais sur le contenu). `texte`/`minimal` ne sont plus envoyés sur
     * cette route (ils ne servent qu'à `/api/spec/brouillon`). */
    const reponse = await fetch("/api/spec/ecrire", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, enTeteAuthPilotage()),
      body: JSON.stringify({
        type: redaction.brouillon.genre,
        titre: redaction.brouillon.titre,
        contenu: redaction.contenu,
      }),
    });

    if (reponse.status === 401) {
      /* Même correctif que `surClicGenererBrouillon` : le drapeau retombe et
       * le panneau de confirmation se redessine (Annuler/Confirmer de
       * nouveau actifs) AVANT d'ouvrir la porte — le Markdown relu
       * (`redaction.contenu`) n'est jamais perdu, aucun rechargement requis. */
      redaction.enCoursEcriture = false;
      rendreRedaction();
      sur401Lecture();
      return;
    }

    const donnees = await reponse.json().catch(() => ({}));

    if (reponse.status === 201) {
      redaction.ecrit = { chemin: donnees.chemin, numero: donnees.numero };
      redaction.enCoursEcriture = false;
      redaction.phase = "ecrit";
      rendreRedaction();
      return;
    }

    redaction.enCoursEcriture = false;
    if (reponse.status === 409) {
      redaction.erreurEcriture = "Un fichier nommé " + redaction.brouillon.nomFichierPrevu
        + " existe déjà. Modifiez le texte du besoin, puis Régénérer.";
    } else if (reponse.status === 422) {
      redaction.erreurEcriture = donnees.erreur
        || "Contenu manquant, vide ou trop long, ou nom de fichier invalide "
          + "après normalisation.";
    } else if (reponse.status === 503) {
      redaction.erreurEcriture = "Verrou de numérotation momentanément indisponible. Réessayez.";
    } else if (reponse.status === 500) {
      redaction.erreurEcriture = "Erreur serveur : le template ou le répertoire cible est introuvable.";
    } else {
      redaction.erreurEcriture = messageErreurGenerique(reponse.status);
    }
    rendreRedaction();
  } catch (erreur) {
    redaction.enCoursEcriture = false;
    redaction.erreurEcriture = "Erreur réseau : " + erreur.message;
    rendreRedaction();
  }
}

function surClicNouveauBrouillon() {
  redaction = {
    phase: "saisie", enCoursBrouillon: false, enCoursEcriture: false,
    erreurBrouillon: null, erreurEcriture: null, brouillon: null,
    contenu: "", compteRemplir: 0, derogationIgnoree: false, ecrit: null,
  };
  masquerErreurGenerationStatique();
  const champTitre = $("titre-besoin");
  const champPrompt = $("spec-prompt");
  const champDerogation = $("derogation-minimale");
  if (champTitre) champTitre.value = "";
  if (champPrompt) champPrompt.value = "";
  if (champDerogation) champDerogation.checked = false;
  actualiserCompteurPrompt();
  rendreRedaction();
  if (champTitre) champTitre.focus();
}

/* ------------------------------------------------------------ conversation --
 * feature-022 (absorbée, lot 11) : panneau de conversation permanent avec
 * l'agent principal. `GET /api/conversation` ne porte QUE les messages
 * UTILISATEUR persistés (S3.4/D2, server.py `_conversation_lire`) — la
 * réponse de l'agent vit dans le tampon circulaire de `/api/lancement`,
 * jamais recopiée ici. Ce panneau n'affiche donc AUCUNE bulle « Claude »
 * fabriquée : `#claude-status` reflète un fait réel (« disponible » = un
 * lancement accepte le canal, backend `lancement_conversation()`), jamais un
 * texte inventé (PIEGES §16).
 *
 * Trois états de lecture (chargement/erreur/vide), comme partout ailleurs
 * dans ce module :
 *  - chargement : avant la première réponse de `GET /api/conversation` ;
 *  - erreur : le serveur ne répond pas — le fil déjà affiché N'EST PAS
 *    effacé (« il ne fige pas un fil périmé » ≠ « il l'efface »), un bandeau
 *    dit l'incertitude ;
 *  - vide : réponse 200, aucun message — état vide explicite, jamais un
 *    panneau blanc.
 *
 * Le rafraîchissement suit le MÊME rythme que le reste du tableau de bord
 * (signal SSE `/api/flux`, ou le sondage 10 s de repli) — aucun minuteur
 * séparé, pour ne pas surcharger l'API (skill frontend-developer).
 */
let conversation = {
  phase: "chargement",   // chargement | disponible | indisponible | erreur
  messages: [],
  tronque: false,
  erreurLecture: null,
  envoiEnCours: false,
};

function heureDepuisMs(ts) {
  if (typeof ts !== "number" || !isFinite(ts)) return "";
  try {
    return new Date(ts).toISOString().slice(11, 19);
  } catch (erreur) {
    return "";
  }
}

/* Construit UN message. `auteur` distingue seulement le glyphe de l'avatar
 * (texte, jamais une image ni une classe neuve) — `message`/`message-avatar`/
 * `bubble` restent les SEULES classes adoptées pour ce rôle (F0) : pas de
 * variante « utilisateur » inventée hors du prototype. */
function rendreMessageConversation(auteur, glyphe, texteMessage, ts) {
  const article = el("article", "message");
  article.appendChild(el("span", "message-avatar", glyphe)).setAttribute("aria-hidden", "true");
  const bulle = el("div", "bubble");
  const heureTexte = heureDepuisMs(ts);
  if (heureTexte) bulle.appendChild(el("time", "", heureTexte));
  bulle.appendChild(document.createTextNode(texteMessage));
  article.appendChild(bulle);
  return article;
}

function texteActiviteClaude(etat) {
  if (!etat || !Array.isArray(etat.agents)) return null;
  const actifs = etat.agents.filter((a) => a.actif_sur);
  if (!actifs.length) return null;
  if (actifs.length === 1) return actifs[0].nom + " est actif.";
  return actifs.map((a) => a.nom).join(", ") + " sont actifs.";
}

/* Bulle « statut réel de Claude » (jamais un message fabriqué) : porte
 * `#claude-live-message` (id adopté, F0) autour du texte DÉRIVÉ de
 * `etat.agents[].actif_sur` — jamais inventé. Reconstruite à chaque rendu,
 * comme le reste de `#conversation` (PIEGES §38 : un id créé dynamiquement
 * n'existe qu'après ce rendu). */
function rendreMessageActiviteClaude(texteActivite) {
  const article = el("article", "message");
  article.appendChild(el("span", "message-avatar", "✺")).setAttribute("aria-hidden", "true");
  const bulle = el("div", "bubble");
  const portee = el("span", "", texteActivite);
  portee.id = "claude-live-message";
  bulle.appendChild(portee);
  article.appendChild(bulle);
  return article;
}

function rendreConversation() {
  const conteneur = $("conversation");
  if (!conteneur) return;
  vider(conteneur);

  if (conversation.phase === "chargement") {
    conteneur.appendChild(el("p", "vide", "chargement…"));
    appliquerEtatComposer();
    return;
  }

  if (conversation.erreurLecture) {
    const p = el("p", "note erreur",
      "Serveur injoignable — dernier fil connu affiché, peut-être périmé (" +
      conversation.erreurLecture + ").");
    p.setAttribute("role", "alert");
    conteneur.appendChild(p);
  }

  /* Statut réel de l'agent (jamais un message fabriqué) — seulement quand
   * le canal est disponible ET qu'une activité réelle existe. */
  const activite = conversation.phase === "disponible" ? texteActiviteClaude(dernierEtat) : null;
  if (activite) conteneur.appendChild(rendreMessageActiviteClaude(activite));

  if (conversation.phase === "indisponible" && !conversation.messages.length) {
    conteneur.appendChild(el("p", "vide", "Aucun agent en cours n'accepte de message."));
  } else if (!activite && !conversation.messages.length) {
    conteneur.appendChild(el("p", "vide", "Aucun message pour l'instant."));
  }

  if (conversation.tronque) {
    conteneur.appendChild(el("p", "note",
      "Fil tronqué : les messages les plus anciens ne sont plus disponibles."));
  }

  conversation.messages.forEach((msg) => {
    conteneur.appendChild(rendreMessageConversation(
      "utilisateur", "→", String((msg && msg.texte) || ""), msg && msg.ts));
  });

  // Question bloquante épinglée (F2) : AUCUNE source de données ce cycle —
  // reste `hidden`, jamais un texte fabriqué (voir le commentaire HTML sur
  // `#claude-question`, PIEGES §16).

  appliquerEtatComposer();
}

async function actualiserConversation() {
  try {
    const reponse = await fetch("/api/conversation", { headers: enTeteAuthPilotage() });
    if (reponse.status === 200) {
      const donnees = await reponse.json();
      conversation.phase = "disponible";
      conversation.messages = Array.isArray(donnees.messages) ? donnees.messages : [];
      conversation.tronque = !!donnees.tronque;
      conversation.erreurLecture = null;
    } else if (reponse.status === 404) {
      conversation.phase = "indisponible";
      conversation.messages = [];
      conversation.tronque = false;
      conversation.erreurLecture = null;
    } else if (reponse.status === 401) {
      sur401Lecture();
      return;
    } else {
      conversation.erreurLecture = "réponse inattendue (" + reponse.status + ")";
    }
  } catch (erreur) {
    conversation.erreurLecture = "hors ligne";
  }
  rendreConversation();
}

function afficherErreurConversation(message) {
  const p = $("conversation-erreur");
  if (!p) return;
  p.textContent = message;
  p.hidden = false;
}
function masquerErreurConversation() {
  const p = $("conversation-erreur");
  if (!p) return;
  p.hidden = true;
  p.textContent = "";
}

/* Inerte visiblement (jamais absent, §skill frontend-developer) tant que
 * l'écriture n'est pas active, qu'aucun agent n'accepte de message, ou
 * qu'un envoi est en cours — la RAISON est répétée en texte (`#composer-etat`,
 * lu par un lecteur d'écran) ET dans le `placeholder`/`title`, jamais la
 * couleur seule. Le backend REVALIDE tout : ceci est un confort, pas une
 * garde (skill frontend-developer, « le frontend n'est jamais une barrière
 * de sécurité »). */
function appliquerEtatComposer() {
  const champ = $("prompt");
  const bouton = $("envoyer-conversation");
  const note = $("composer-etat");
  if (!champ || !bouton) return;

  const ecritureActive = Boolean(dernierEtat && dernierEtat.ecriture_active);
  let raison = null;
  if (conversation.phase === "chargement") {
    raison = "chargement de la conversation…";
  } else if (!ecritureActive) {
    raison = "écriture non activée" +
      ((dernierEtat && dernierEtat.ecriture_raison) ? " : " + dernierEtat.ecriture_raison : "");
  } else if (conversation.phase === "indisponible") {
    raison = "aucun agent en cours n'accepte de message";
  } else if (conversation.envoiEnCours) {
    raison = "envoi en cours…";
  }

  const inerte = raison !== null;
  champ.disabled = inerte;
  bouton.disabled = inerte;
  champ.placeholder = inerte
    ? raison.charAt(0).toUpperCase() + raison.slice(1)
    : "Répondre à Claude…";
  champ.title = inerte ? raison : "";
  if (note) note.textContent = inerte ? raison.charAt(0).toUpperCase() + raison.slice(1) : "";

  const statut = $("claude-status");
  if (statut) {
    vider(statut);
    statut.appendChild(el("span", "", "●")).setAttribute("aria-hidden", "true");
    statut.appendChild(document.createTextNode(
      " " + (conversation.phase === "disponible" ? "En ligne"
        : conversation.phase === "indisponible" ? "Hors ligne"
        : conversation.phase === "erreur" ? "Injoignable" : "…")));
  }
}

async function surSoumissionConversation(evenement) {
  evenement.preventDefault();
  const champ = $("prompt");
  if (!champ || champ.disabled) return;
  const texte = champ.value;
  if (!texte.trim() || conversation.envoiEnCours) return;

  masquerErreurConversation();
  conversation.envoiEnCours = true;
  appliquerEtatComposer();

  try {
    const reponse = await fetch("/api/conversation", {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json" }, enTeteAuthPilotage()),
      body: JSON.stringify({ texte }),
    });
    if (reponse.status === 202) {
      champ.value = "";
      conversation.envoiEnCours = false;
      await actualiserConversation();
      return;
    }
    if (reponse.status === 401) {
      conversation.envoiEnCours = false;
      sur401Lecture();
      return;
    }
    const donnees = await reponse.json().catch(() => ({}));
    /* 503 « canal occupé » (S3.9/S3.10) : normal et attendu tant que l'agent
     * n'a pas lu le message précédent — on le DIT à l'écran, on ne réessaie
     * JAMAIS en silence (feature-022, cas limites). Le texte reste dans le
     * champ : rien n'est perdu, l'utilisateur choisit de réessayer. */
    if (reponse.status === 503) {
      afficherErreurConversation("Canal occupé — " +
        (donnees.erreur || "l'agent n'a pas encore lu le message précédent") +
        ". Le message n'a pas été envoyé, réessayez.");
    } else if (reponse.status === 404) {
      conversation.phase = "indisponible";
      afficherErreurConversation(donnees.erreur || "aucun agent en cours n'accepte de message");
      rendreConversation();
    } else {
      afficherErreurConversation(donnees.erreur || ("réponse inattendue (" + reponse.status + ")"));
    }
  } catch (erreur) {
    afficherErreurConversation("Serveur injoignable — le message n'a pas été envoyé.");
  } finally {
    conversation.envoiEnCours = false;
    appliquerEtatComposer();
  }
}

/* ------------------------------------------------------------------ flux -- */
let enCours = false;

async function rafraichir() {
  if (enCours) return;
  enCours = true;
  try {
    const reponse = await fetch("/api/etat", { headers: enTeteAuthPilotage() });
    if (reponse.status === 401) {
      /* Le jeton, valide au démarrage, ne l'est plus : les blocs déjà
       * rendus restent affichés tels quels (voir `sur401Lecture`), seule la
       * jauge de flux redevient neutre puisqu'aucune donnée fraîche
       * n'arrive plus tant que la porte est ouverte. */
      sur401Lecture();
      return;
    }
    if (!reponse.ok) throw new Error("HTTP " + reponse.status);
    const etat = await reponse.json();
    $("projet").textContent = etat.projet || "";
    rendreIdentite(etat);
    $("horodatage").textContent = heure(etat.horodatage) + " UTC";
    const jaugeGit = $("jauge-git");
    jaugeGit.textContent = etat.git.depot ? "git " + (etat.git.branche || "?") : "git absent";
    jaugeGit.className = "jauge " + (etat.git.depot ? "ok" : "ko");
    dernierEtat = etat;
    rendreAgents(etat.agents);
    rendreSysteme(etat);
    rendreGrapheCyclePrincipal(etat);
    rendreKanban(etat);
    rendreCycles(etat);
    rendreFichiers(etat);
    rendreTimeline(etat);
    actualiserPilotage(etat);
    /* `ecriture_active` vient de rafraîchir : réapplique l'état du composer
     * immédiatement (raison à jour), sans attendre `actualiserConversation`
     * ci-dessous — même cadence que le reste du tableau de bord (signal SSE
     * ou sondage 10 s), AUCUN minuteur séparé (pas de polling agressif). */
    appliquerEtatComposer();
    actualiserConversation();
  } catch (erreur) {
    const jauge = $("jauge-flux");
    jauge.textContent = "serveur injoignable";
    jauge.className = "jauge ko";
  } finally {
    enCours = false;
  }
}

function brancherFlux() {
  const jauge = $("jauge-flux");
  const source = new EventSource("/api/flux");
  source.onopen = () => { jauge.textContent = "flux connecté"; jauge.className = "jauge ok"; };
  source.addEventListener("maj", rafraichir);
  source.onerror = () => {
    jauge.textContent = "flux rompu — reconnexion";
    jauge.className = "jauge ko";
    /* EventSource se reconnecte tout seul : on ne double pas sa logique. */
  };
}

/* ==================================================== structure mono-écran
 * feature-021, cycle 2, lot 3 (F7) : la colonne de navigation à onglets
 * (feature-019, §5/§6, ADR-0024 §1 amendé par ADR-0029) est RETIRÉE — 0
 * `role="tab"`, plus de section masquée, tout le contenu est empilé et
 * lisible sans navigation. `SECTIONS`/`CLE_SECTION`/`sectionActuelle`/
 * `memoriserSection`/`appliquerSection` et les gestionnaires clavier
 * (roving tabindex ArrowLeft/Right/Home/End) sont SUPPRIMÉS avec elle —
 * `index.html` ne porte plus aucun `#section-*`/`#onglet-*`/
 * `#titre-section-*` à piloter (retirer ce code, pas seulement le laisser
 * no-op sur des ids absents, évite qu'une suite continue d'exercer une
 * fonctionnalité qu'aucune page réelle ne peut plus atteindre — un vert à
 * tort, PIEGES §21/§33). `theme.js` continue de poser `data-section` sur
 * `<html>` (fichier hors périmètre de ce lot) : cet attribut n'a plus AUCUN
 * lecteur ici, volontairement.
 * ========================================================================= */

/* Filtrer ne redemande RIEN au serveur : on redessine l'état déjà chargé. Une
 * requête par frappe ferait tourner `git status` et relire 167 fichiers à chaque
 * lettre. */
function refiltrer() { if (dernierEtat) rendreKanban(dernierEtat); }
$("filtre").addEventListener("input", refiltrer);
$("filtre-divergences").addEventListener("change", refiltrer);

/* feature-008 : compteur de caractères, purement local (aucune requête). */
$("spec-prompt").addEventListener("input", actualiserCompteurPrompt);
$("bouton-generer-brouillon").addEventListener("click", surClicGenererBrouillon);

/* feature-022 (lot 11) : composeur de conversation — `#composer`/`#prompt`
 * reprennent les noms du PROTOTYPE (clé de jointure des gardes de fidélité),
 * `#spec-prompt` ci-dessus a cédé le sien. Inerte par défaut dans le HTML
 * (`disabled`) tant que `rendreConversation`/`appliquerEtatComposer` n'a pas
 * tourné au moins une fois — jamais un bouton actif avant la première
 * réponse connue. */
$("composer").addEventListener("submit", surSoumissionConversation);
rendreConversation();

document.addEventListener("keydown", (evenement) => {
  if (evenement.key === "Escape") fermerTiroir();
});
$("tiroir-fermer").addEventListener("click", fermerTiroir);

/* F11 : replier/déplier la bottom sheet — un état PUREMENT visuel (le
 * détail reste dans le DOM, `aria-expanded` porte l'état pour qui n'y voit
 * rien, le glyphe n'est jamais la seule information — §8). */
$("sheet-toggle").addEventListener("click", () => {
  const repliee = $("sheet-metrics").hidden = !$("sheet-metrics").hidden;
  $("sheet-toggle").setAttribute("aria-expanded", repliee ? "false" : "true");
  $("sheet-toggle").setAttribute("aria-label", repliee ? "Déplier le détail" : "Replier le détail");
});

/* Le premier `GET /api/etat` décide seul du mode d'authentification — voir
 * `verifierEtatAuth`. Tant qu'il n'a pas répondu `200`, aucun bloc n'est
 * rendu : ni `rafraichir()` ni `brancherFlux()` ne sont appelés ici. */
verifierEtatAuth();
