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
 * en est le premier — table des passages, désignation d'un cycle, et jetons
 * de couleur (`--a-<rôle>`/`--f-<rôle>`, app.css) appliqués au texte des
 * maillons (voir `construireIdentiteAgent`, `couleurIdentite` plus bas).
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

function rendreKanban(etat) {
  const kanban = $("kanban");
  vider(kanban);
  const terme = ($("filtre").value || "").trim().toLowerCase();
  const divergencesSeules = $("filtre-divergences").checked;
  let affichees = 0;

  etat.colonnes.forEach((colonne) => {
    const toutes = etat.specs.filter((s) => s.colonne === colonne.classe);
    const specs = toutes.filter((s) => specCorrespond(s, terme, divergencesSeules));
    affichees += specs.length;

    const bloc = el("div", "colonne");
    const entete = el("div", "colonne-entete");
    entete.appendChild(el("span", "", colonne.libelle));
    /* Quand un filtre est actif, on montre les DEUX nombres : cacher le total
     * ferait croire que la colonne a rétréci. */
    entete.appendChild(el("span", "",
      specs.length === toutes.length ? String(toutes.length)
                                     : specs.length + " / " + toutes.length));
    bloc.appendChild(entete);

    const liste = el("div", "colonne-liste");
    specs.forEach((spec) => {
      const carte = el("button", "carte" + (spec.divergence ? " divergente" : ""));
      carte.type = "button";
      carte.appendChild(el("div", "cid", spec.id));
      if (spec.titre && spec.titre !== spec.id) {
        carte.appendChild(el("div", "ctitre", spec.titre));
      }
      const bas = el("div", "cbas");
      if (spec.divergence) {
        const badge = el("span", "etiquette divergence", "≠ " + colonne.libelle);
        /* Le statut brut est affiché TEL QUEL en infobulle, jamais réécrit :
         * c'est une phrase écrite par un humain, pas un jeton. */
        badge.title = "Le fichier annonce : " + (spec.statut_texte || "");
        bas.appendChild(badge);
      }
      const priorite = nettoyerPriorite(spec.priorite);
      if (priorite) {
        const p = priorite.toLowerCase();
        const classe = p.indexOf("critique") === 0 ? "priorite-critique"
          : p.indexOf("haute") === 0 ? "priorite-haute" : "";
        const etiquette = el("span", "etiquette " + classe, priorite);
        etiquette.title = "Priorité, telle qu'écrite : " + spec.priorite;
        bas.appendChild(etiquette);
      }
      if (bas.childNodes.length) carte.appendChild(bas);
      carte.addEventListener("click", () => ouvrirSpec(spec.id));
      liste.appendChild(carte);
    });
    if (!specs.length) {
      liste.appendChild(el("div", "vide", toutes.length ? "aucune ne correspond" : "aucune"));
    }
    bloc.appendChild(liste);
    kanban.appendChild(bloc);
  });

  const filtre_actif = terme || divergencesSeules;
  $("compteur-specs").textContent =
    (filtre_actif ? affichees + " sur " + etat.specs.length + " specs"
                  : etat.specs.length + " specs") +
    " · " + etat.divergences + " divergence" + (etat.divergences > 1 ? "s" : "") +
    " répertoire / champ Statut";
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
 * feature-016 : PREMIER appelant de `sigleAgent`/`siglesAgents` (ci-dessus) et
 * des jetons `--a-<rôle>`/`--f-<rôle>` (app.css, §2 du design system). Repli
 * achromatique (`neutre`) pour tout rôle sans teinte assignée — jamais une
 * teinte d'agent recyclée (ADR-0022). Précédence identité/état (§8) : cette
 * couleur ne va JAMAIS sur un contour ou une forme porteurs d'état, toujours
 * sur du texte ou un sigle qui porte une identité. */
const ROLES_TEINTES = new Set([
  "backend-developer", "security-reviewer", "test-engineer", "spec-reader",
  "code-reviewer", "debugger", "doc-writer", "frontend-developer",
]);
function jetonIdentite(nomRole) { return ROLES_TEINTES.has(nomRole) ? nomRole : "neutre"; }
function couleurIdentite(nomRole) { return "var(--a-" + jetonIdentite(nomRole) + ")"; }
function remplissageIdentite(nomRole) { return "var(--f-" + jetonIdentite(nomRole) + ")"; }

function construireIdentiteAgent(nom, sigles) {
  const enveloppe = document.createDocumentFragment();
  const sigle = el("span", "agent-sigle", (sigles && sigles.get(nom)) || "??");
  sigle.style.color = couleurIdentite(nom);
  sigle.style.background = remplissageIdentite(nom);
  sigle.setAttribute("aria-hidden", "true");
  const nomSpan = el("span", "agent-nom", nom);
  nomSpan.style.color = couleurIdentite(nom);
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
      /* Identité (item H, §8) : jamais sur le segment principal, qui garde
       * son propre registre visuel (`.principal .mnom`, fond creusé + italique). */
      if (segment.type !== "principal") mnom.style.color = couleurIdentite(segment.agent);
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

/* ------------------------------------------------------------- diagramme --
 * feature-017, docs/DESIGN-SYSTEM.md §5. La GÉOMÉTRIE (positions, rayons,
 * graduations, créneaux, liens, arcs) est calculée par le module PUR
 * `diagramme.js` (`disposer()`, chargé en `<script>` avant celui-ci — voir
 * index.html ; AUCUN import, AUCUNE dépendance : CSP `default-src 'self'`,
 * ADR-0006). Ce bloc ne fait que TRADUIRE cette géométrie en SVG et y poser
 * les jetons de couleur — il n'invente aucun nombre, aucune position.
 *
 * Vocabulaire du cercle, RENDU RÉEL (feature-020 D1/D4 — ce commentaire a
 * déjà égaré une revue une fois en affirmant l'inverse, ne pas y revenir) :
 * le contour est PLEIN, sauf l'état « sans clôture » qui prend le seul
 * motif restant, le pointillé. L'échec ajoute une croix et un contour
 * `--alerte`, en plus du reste. L'IDENTITÉ (couleur d'agent) va sur le
 * remplissage du disque et sur le sigle, TOUJOURS — y compris pour l'agent
 * `principal`, qui n'a pas de teinte de remplissage (fond `--creux`) mais
 * garde un sigle « AP » en couleur d'identité et un contour plein, sans
 * tirets (il n'est plus une exception visuelle, trop fréquent pour l'être).
 * SEULE exception au principe « l'identité ne va jamais sur le contour »
 * (§8) : l'état « en cours », dont le contour prend la couleur d'identité —
 * ce n'est pas un signal ajouté par ce cycle mais un comportement de la
 * maquette de référence elle-même (défaut K, arbitrage D4), nommé ici pour
 * qu'une future revue ne le prenne pas pour une régression.
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

/* Contour : rôle CALCULÉ PAR `disposer()` (contourRole/contourLargeur,
 * priorité échec > sans clôture > en cours > nominal, feature-020 D1/D4).
 * Seule la COULEUR reste décidée ici (ce module ignore tout jeton de
 * couleur) — l'identité ne va JAMAIS sur le contour, SAUF l'état « en
 * cours » : la maquette elle-même colore le contour de l'agent actif avec
 * sa couleur d'identité (défaut K, arbitrage D4 : la maquette prime, ce
 * n'est pas un signal ajouté par ce cycle mais un comportement du modèle de
 * référence, hors du périmètre de D1 qui ne porte que sur l'agent terminé
 * sans échec). */
const COULEUR_CONTOUR_ROLE = {
  echec: "var(--alerte)",
  sansCloture: "var(--contour-etat)",
  nominal: "var(--trait)",
};
function couleurContourRole(agentGeo) {
  if (agentGeo.contourRole === "enCours") return couleurIdentite(agentGeo.agent);
  return COULEUR_CONTOUR_ROLE[agentGeo.contourRole] || "var(--trait)";
}

/* Ordre de peinture (feature-020, défaut H) : guide → graduations → barres
 * du zéro → DISQUE → LISERÉ → anneau en cours → croix → sigle. Le liseré
 * DOIT venir après le disque opaque, sinon il est invisible dessous — c'est
 * le défaut mesuré (l'ancien code le peignait avant). Toute la GÉOMÉTRIE
 * (positions, rayons, angles, points de graduation) vient de `agentGeo` —
 * cette fonction ne fait plus aucun `Math.*`. */
function construireCercleAgent(agentGeo, sigles) {
  const g = svgEl("g", "dg-agent");
  const c = couleurIdentite(agentGeo.agent);

  // Anneau guide (§E, correction de l'inversion : le plus clair)
  const guide = svgEl("circle", "dg-guide");
  svgAttrs(guide, { cx: agentGeo.cx, cy: agentGeo.cy, r: agentGeo.rayonGuide, fill: "none" });
  guide.style.stroke = "var(--trait-fin)";
  g.appendChild(guide);

  // Graduations — coordonnées ENTIÈREMENT calculées par disposer()
  agentGeo.graduations.forEach((grad) => {
    const trait = svgEl("line", "dg-graduation");
    svgAttrs(trait, { x1: grad.x1, y1: grad.y1, x2: grad.x2, y2: grad.y2 });
    // §E : les graduations ÉTEINTES prennent --trait (le plus sombre),
    // corrigeant l'inversion avec l'anneau guide ci-dessus.
    trait.style.stroke = grad.allumee ? c : "var(--trait)";
    trait.style.strokeWidth = grad.epaisseur;
    g.appendChild(trait);
  });

  // Barres du zéro (marqueur de départ des graduations) — épaisseur posée
  // en CSS (feature-020 C2 : ne sert qu'au trait, ne réserve rien), d'où les
  // deux classes distinctes (aucune épaisseur commune à factoriser).
  const bzb = agentGeo.barreZeroBlanche;
  const barreBlanche = svgEl("line", "dg-barre-zero-blanche");
  svgAttrs(barreBlanche, { x1: bzb.x1, y1: bzb.y1, x2: bzb.x2, y2: bzb.y2 });
  barreBlanche.style.stroke = "var(--creux)";
  g.appendChild(barreBlanche);

  const bzg = agentGeo.barreZeroGrise;
  const barreGrise = svgEl("line", "dg-barre-zero-grise");
  svgAttrs(barreGrise, { x1: bzg.x1, y1: bzg.y1, x2: bzg.x2, y2: bzg.y2 });
  // §E : la barre grise porte --texte-faible (t3), pas --texte-doux.
  barreGrise.style.stroke = "var(--texte-faible)";
  g.appendChild(barreGrise);

  // Disque — contour plein sauf « sans clôture » (pointillé, seul motif
  // restant : l'agent principal a quitté les tirets, D1).
  const classeContour = agentGeo.contourRole === "sansCloture" ? "dg-contour-pointille" : "dg-contour-plein";
  const cercle = svgEl("circle", "dg-cercle " + classeContour);
  svgAttrs(cercle, { cx: agentGeo.cx, cy: agentGeo.cy, r: agentGeo.rayon });
  cercle.style.fill = agentGeo.principal ? "var(--creux)" : remplissageIdentite(agentGeo.agent);
  cercle.style.stroke = couleurContourRole(agentGeo);
  cercle.style.strokeWidth = agentGeo.contourLargeur;
  g.appendChild(cercle);

  // Liseré des fichiers — APRÈS le disque (défaut H), encodé par OPACITÉ
  // seule (D2), épaisseur constante posée en CSS (feature-020 C2 : ne sert
  // qu'au trait, ne réserve rien — voir `.dg-liseret`).
  if (agentGeo.fichiers > 0) {
    const liseret = svgEl("circle", "dg-liseret");
    svgAttrs(liseret, { cx: agentGeo.cx, cy: agentGeo.cy, r: agentGeo.liseretRayon, fill: "none" });
    liseret.style.stroke = c;
    liseret.style.opacity = agentGeo.liseretOpacite;
    g.appendChild(liseret);
  }

  if (agentGeo.enCours) {
    const anneau = svgEl("circle", "dg-anneau-en-cours");
    svgAttrs(anneau, { cx: agentGeo.cx, cy: agentGeo.cy, r: agentGeo.anneauEnCoursRayon, fill: "none" });
    anneau.style.stroke = c;
    anneau.style.opacity = agentGeo.anneauEnCoursOpacite;
    g.appendChild(anneau);
  }

  if (agentGeo.echec) {
    const bras = agentGeo.croixBras;
    const croix = svgEl("g", "dg-croix-echec");
    [[-1, -1, 1, 1], [-1, 1, 1, -1]].forEach(([dx1, dy1, dx2, dy2]) => {
      const trait = svgEl("line");
      svgAttrs(trait, {
        x1: agentGeo.cx + dx1 * bras, y1: agentGeo.cy + dy1 * bras,
        x2: agentGeo.cx + dx2 * bras, y2: agentGeo.cy + dy2 * bras,
      });
      croix.appendChild(trait);
    });
    g.appendChild(croix);
  }

  // Sigle — couleur d'identité TOUJOURS (D1/B2), y compris l'agent principal.
  const sigle = svgEl("text", "dg-sigle");
  svgAttrs(sigle, { x: agentGeo.cx, y: agentGeo.sigleBaselineY, "text-anchor": "middle" });
  sigle.style.fill = c;
  // L'unité est explicite : `font-size: 11` sans unité est invalide en CSS.
  // Chromium le coerce en `11px` (mesuré), un autre moteur a le droit de
  // l'ignorer — et le texte retomberait alors sur la taille héritée.
  sigle.style.fontSize = agentGeo.sigleTaillePx + "px";
  sigle.textContent = (sigles && sigles.get(agentGeo.agent)) || "??";
  g.appendChild(sigle);

  const titre = svgEl("title");
  titre.textContent = agentGeo.agent
    + " — " + agentGeo.outils + " appel(s) d'outil, " + agentGeo.fichiers + " fichier(s) écrit(s)"
    // `plafondAtteint` (§L1) : n'a plus de rendu visuel propre depuis le
    // retrait du cran de plafond (défaut J) — exposé ici pour ne pas rester
    // un champ mort.
    + (agentGeo.plafondAtteint ? ", plafond d'appels d'outils atteint" : "")
    + (agentGeo.echec ? ", en échec" : "")
    + (agentGeo.sansCloture ? ", sans clôture" : "")
    + (agentGeo.enCours ? ", en cours" : "");
  g.appendChild(titre);

  return g;
}

/* Classe posée par RÔLE (jamais par position, feature-020 §L) — trois rôles
 * pour un créneau simple (heure/durée/nom), deux pour un créneau empilé
 * (heureDuree/nom). C'est `.dg-socle-duree`/`.dg-socle-heure-duree` qui
 * portent la vedette (§8 : la DURÉE, pas le nom). */
function classeSocleRole(role) {
  if (role === "heure") return "dg-socle-heure";
  if (role === "duree") return "dg-socle-duree";
  if (role === "heureDuree") return "dg-socle-heure-duree";
  return "dg-socle-nom";
}

/* Socle : cadre + libellé de groupe + lignes de texte — TOUTE la géométrie
 * (position du cadre, boîte du libellé, x/baselineY de chaque ligne) vient
 * de `disposer()` (feature-020 A5/A7) ; cette fonction ne calcule plus rien,
 * elle peint ce qu'on lui donne. */
function construireSoclesCreneau(creneauGeo) {
  const g = svgEl("g", "dg-socle");

  // Le cadre est ajouté EN PREMIER (donc peint SOUS le reste). Rect PLEINE
  // LARGEUR de créneau, `fill:none` (défaut O) — un filet suffit, ADR
  // §9 : pas d'aplat là où un filet suffit.
  if (creneauGeo.cadre) {
    const cadre = svgEl("rect", "dg-cadre-simultane");
    svgAttrs(cadre, {
      x: creneauGeo.cadre.x, y: creneauGeo.cadre.y,
      width: creneauGeo.cadre.largeur, height: creneauGeo.cadre.hauteur,
      rx: creneauGeo.cadre.rx, fill: "none",
    });
    g.appendChild(cadre);
  }
  if (creneauGeo.libelleCadre) {
    const lc = creneauGeo.libelleCadre;
    const masque = svgEl("rect", "dg-libelle-cadre-masque");
    svgAttrs(masque, { x: lc.masque.x, y: lc.masque.y, width: lc.masque.largeur, height: lc.masque.hauteur });
    masque.style.fill = "var(--creux)";
    g.appendChild(masque);
    const libelle = svgEl("text", "dg-libelle-cadre");
    svgAttrs(libelle, { x: lc.texteX, y: lc.baselineY });
    // `taillePx` participe à la réservation (`largeurTexte()`) : posé en
    // `style`, jamais en attribut de présentation qu'une classe CSS pourrait
    // écraser (feature-020, revue point 1).
    libelle.style.fontSize = lc.taillePx + "px";
    libelle.textContent = lc.texte;
    g.appendChild(libelle);
  }

  creneauGeo.agents.forEach((agentGeo) => {
    agentGeo.socle.lignes.forEach((ligne) => {
      // Vedette (§8, item L) : la ligne DURÉE (simple) ou HEURE·DURÉE
      // (empilé) grossit et se colore quand l'agent est en cours — jamais
      // le nom.
      const vedetteActive = agentGeo.enCours && (ligne.role === "duree" || ligne.role === "heureDuree");
      const texte = svgEl("text", classeSocleRole(ligne.role) + (vedetteActive ? " actif" : ""));
      svgAttrs(texte, { x: ligne.x, y: ligne.baselineY, "text-anchor": ligne.ancrage });
      // `taillePx` participe à la réservation (`largeurTexte()`) et diffère
      // selon créneau simple/empilé pour un MÊME rôle (le nom : 10,5 vs 11) :
      // posé en `style`, jamais en attribut, jamais redéclaré en CSS
      // (feature-020, revue point 1 — PIEGES §25).
      texte.style.fontSize = ligne.taillePx + "px";
      if (vedetteActive) texte.style.fill = couleurIdentite(agentGeo.agent);
      texte.textContent = ligne.texte;
      g.appendChild(texte);
    });
  });

  if (creneauGeo.repliLibelle) {
    const rl = creneauGeo.repliLibelle;
    const plus = svgEl("text", "dg-repli");
    svgAttrs(plus, { x: rl.x, y: rl.baselineY, "text-anchor": rl.ancrage });
    // Même règle : `taillePx` participe à la réservation, posé en `style`.
    plus.style.fontSize = rl.taillePx + "px";
    plus.textContent = rl.texte;
    const titre = svgEl("title");
    titre.textContent = creneauGeo.repli.masques + " agent(s) supplémentaire(s), repliés";
    plus.appendChild(titre);
    g.appendChild(plus);
  }
  return g;
}

/* Liens entre créneaux : extrémités RÉELLES (bords de créneau, défaut P) et
 * gabarit de pastille FIXE (correction de mesure, jamais mesuré au rendu) —
 * tout vient de `lien` (feature-020 A4/A8), aucune moyenne ni aucun rayon
 * recalculé ici. */
function construireLiensDiagramme(geo) {
  const g = svgEl("g", "dg-liens");
  geo.liens.forEach((lien) => {
    const trait = svgEl("line", "dg-lien");
    svgAttrs(trait, { x1: lien.x1, y1: lien.y1, x2: lien.x2, y2: lien.y2 });
    g.appendChild(trait);

    const pts = lien.pointe.points;
    const pointe = svgEl("path", "dg-lien-pointe");
    svgAttrs(pointe, {
      d: "M " + pts[0][0] + " " + pts[0][1]
        + " L " + pts[1][0] + " " + pts[1][1]
        + " L " + pts[2][0] + " " + pts[2][1],
      fill: "none",
    });
    g.appendChild(pointe);

    if (lien.pastille) {
      const p = lien.pastille;
      const pastille = svgEl("g", "dg-pastille-attente");
      const fond = svgEl("rect");
      svgAttrs(fond, {
        x: p.x - p.largeur / 2, y: p.y - p.hauteur / 2,
        width: p.largeur, height: p.hauteur, rx: p.rx,
      });
      pastille.appendChild(fond);
      const texte = svgEl("text");
      svgAttrs(texte, { x: p.texteX, y: p.baselineY, "text-anchor": "middle" });
      texte.textContent = p.texte;
      pastille.appendChild(texte);
      g.appendChild(pastille);
    }
  });
  return g;
}

/* Rebouclage : arc reliant une reprise à l'OCCURRENCE PRÉCÉDENTE du MÊME
 * agent (§5). Sommet ABSOLU (`arc.sommetY`, défaut R/bug-020) — plus de
 * recalcul de hauteur ici ; couleur FIXE (jeton `--rebouclage`, décision R —
 * plus de couleur d'identité) ; AUCUNE pointe (décision R). */
function construireArcsDiagramme(geo) {
  const g = svgEl("g", "dg-arcs");
  geo.arcs.forEach((arc) => {
    const chemin = svgEl("path", "dg-arc-rebouclage");
    svgAttrs(chemin, {
      d: "M " + arc.depart.x + " " + arc.depart.y
        + " C " + arc.controle1.x + " " + arc.controle1.y
        + ", " + arc.controle2.x + " " + arc.controle2.y
        + ", " + arc.arrivee.x + " " + arc.arrivee.y,
      fill: "none",
    });
    const titre = svgEl("title");
    titre.textContent = "Rebouclage — reprise de " + arc.agent;
    chemin.appendChild(titre);
    g.appendChild(chemin);

    const texte = svgEl("text", "dg-arc-libelle");
    svgAttrs(texte, { x: arc.libelle.x, y: arc.libelle.baselineY, "text-anchor": "middle" });
    // Même règle que le socle : `taillePx` vient du contrat et participe à la
    // réservation, donc en `style` avec unité — la dernière taille encore
    // posée en attribut, relevée en revue (feature-020).
    texte.style.fontSize = arc.libelle.taillePx + "px";
    texte.textContent = arc.libelle.texte;
    g.appendChild(texte);
  });
  return g;
}

/* Légende (§8, item T) : DIX entrées, rien de plus, rien de moins que ce que
 * le code peut réellement produire — alignée sur `pose()`/`graphe()` et sur
 * les décisions D1/D2/D4/R de feature-020. */
function construireLegendeDiagramme() {
  const dl = el("dl", "diagramme-legende");
  const ajouter = (forme, sens) => { dl.appendChild(el("dt", "", forme)); dl.appendChild(el("dd", "", sens)); };
  ajouter("Diamètre du cercle", "durée de l'agent");
  ajouter("Graduations", "appels d'outils (échelle de 70)");
  ajouter("Liseré intérieur", "fichiers écrits");
  ajouter("Pastille", "attente entre deux agents");
  ajouter("Cadre", "agents simultanés");
  ajouter("Contour pointillé", "sans clôture");
  ajouter("Croix + contour d'alerte", "échec");
  ajouter("Identité sur le contour et l'anneau", "en cours");
  ajouter("Fond neutre + sigle dédié", "agent principal");
  ajouter("Arc pointillé", "rebouclage vers l'occurrence précédente du même agent");
  return dl;
}

/* Défilement au clavier (§6, §8) : `tabindex="0"` sur le conteneur, les
 * flèches gauche/droite (et Origine/Fin) le parcourent — la molette SEULE
 * fait défiler la PAGE (comportement natif, rien à faire ici) ; `Maj` +
 * molette ou le glissement font défiler la ZONE (comportement natif d'un
 * conteneur `overflow-x: auto`, également rien à coder). */
function brancherDefilementClavier(conteneur) {
  conteneur.setAttribute("tabindex", "0");
  conteneur.setAttribute("role", "group");
  conteneur.setAttribute("aria-label", "Diagramme du déroulé — parcourir avec les flèches");
  conteneur.addEventListener("keydown", (evenement) => {
    const PAS = 80;
    if (evenement.key === "ArrowRight") { conteneur.scrollLeft += PAS; evenement.preventDefault(); }
    else if (evenement.key === "ArrowLeft") { conteneur.scrollLeft -= PAS; evenement.preventDefault(); }
    else if (evenement.key === "Home") { conteneur.scrollLeft = 0; evenement.preventDefault(); }
    else if (evenement.key === "End") { conteneur.scrollLeft = conteneur.scrollWidth; evenement.preventDefault(); }
  });
}

/* Point d'entrée (branché dans `construireDetailCycle`, AVANT la table des
 * passages). `wf.segments` (agent principal compris) si disponible, repli
 * sur `wf.passages` sur un backend plus ancien — même convention que
 * `construireChaineEtNotes`. Un cycle sans aucun segment retombe sur `null`
 * : l'appelant garde alors le seul état vide déjà affiché par la table. */
function construireDiagramme(wf, sigles) {
  const segments = wf.segments || wf.passages || [];
  if (!segments.length) return null;
  // Garde (bug-020) : `diagramme.js` est chargé en `<script>` séparé
  // (index.html, AVANT ce fichier) — s'il est absent (404, cache, oubli de
  // relancer le serveur après un fichier neuf — PIEGES.md §8), `disposer`
  // n'existe pas et l'exception remonterait jusqu'au `catch` global de
  // `rafraichir()`, qui l'afficherait à tort comme « serveur injoignable ».
  // Se rabattre ici sur l'absence de diagramme, comme un cycle sans segment.
  if (typeof disposer !== "function") return null;

  const geo = disposer(segments);
  const enveloppe = document.createDocumentFragment();

  // Titre de zone + phrase d'avertissement (item S/B15) : construits ici,
  // PAS dans index.html — le bandeau vit dans le détail de cycle dynamique,
  // pas dans un gabarit statique.
  const entete = el("div", "dg-entete");
  entete.appendChild(el("span", "dg-entete-titre", "Déroulé"));
  entete.appendChild(el("span", "dg-entete-phrase",
    "l'écart horizontal sert la lisibilité, il ne mesure pas le temps"));
  enveloppe.appendChild(entete);

  const conteneur = el("div", "diagramme-scroll");
  brancherDefilementClavier(conteneur);

  const svg = svgEl("svg", "dg-svg");
  svgAttrs(svg, {
    // `segments.length` est déjà garanti ≥ 1 ci-dessus : `disposer()` ne
    // renvoie `largeur`/`hauteur` à 0 que pour une liste VIDE, jamais
    // atteinte ici — pas de clamp défensif qui dupliquerait sa décision.
    viewBox: "0 0 " + geo.largeur + " " + geo.hauteur,
    width: geo.largeur, height: geo.hauteur, role: "img",
    "aria-label": "Diagramme du déroulé — " + segments.length + " agent(s)",
  });

  // Ordre de dessin (peinture SVG = ordre d'apparition) : liens et arcs
  // D'ABORD (toujours sous les cercles) ; puis le cadre des créneaux
  // empilés AVEC leurs socles (le cadre, lui, doit rester SOUS les cercles
  // qu'il entoure) ; les cercles en dernier — jamais masqués par un cadre
  // ou un lien. Le socle et les cercles n'occupent de toute façon jamais le
  // même point (texte à côté ou en dessous, jamais superposé au disque).
  svg.appendChild(construireLiensDiagramme(geo));
  svg.appendChild(construireArcsDiagramme(geo));
  geo.creneaux.forEach((creneau) => {
    svg.appendChild(construireSoclesCreneau(creneau));
  });
  geo.creneaux.forEach((creneau) => {
    creneau.agents.forEach((agentGeo) => {
      svg.appendChild(construireCercleAgent(agentGeo, sigles));
    });
  });

  conteneur.appendChild(svg);
  const piste = el("div", "dg-piste");
  piste.appendChild(conteneur);
  piste.appendChild(el("div", "dg-voile g"));
  piste.appendChild(el("div", "dg-voile d"));
  enveloppe.appendChild(piste);
  enveloppe.appendChild(construireLegendeDiagramme());
  return enveloppe;
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
  $("tiroir-titre").textContent = titre;
  $("tiroir-contenu").textContent = contenu;
  $("tiroir").hidden = false;
  $("tiroir-fermer").focus();
}

function fermerTiroir() { $("tiroir").hidden = true; }

async function ouvrirSpec(identifiant) {
  ouvrirTiroir(identifiant, "chargement…");
  try {
    const reponse = await fetch("/api/spec?id=" + encodeURIComponent(identifiant),
      { headers: enTeteAuthPilotage() });
    if (reponse.status === 401) {
      sur401Lecture();
      return ouvrirTiroir(identifiant, "Authentification requise — reconnectez-vous.");
    }
    const donnees = await reponse.json();
    if (donnees.erreur) return ouvrirTiroir(identifiant, "Erreur : " + donnees.erreur);
    const entete = [
      "colonne   : " + donnees.colonne,
      "statut    : " + (donnees.statut_texte || "(absent)"),
      "classé    : " + donnees.statut_classe +
        (donnees.divergence ? "   ⚠ DIVERGENCE avec le répertoire" : ""),
      "priorité  : " + (donnees.priorite || "—"),
      "".padEnd(60, "─"),
      "",
    ].join("\n");
    ouvrirTiroir(identifiant, entete + donnees.contenu);
  } catch (erreur) {
    ouvrirTiroir(identifiant, "Erreur réseau : " + erreur.message);
  }
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

  porte.hidden = false;
  requestAnimationFrame(() => { champ.focus(); });
}

function fermerPorte() { $("porte-jeton").hidden = true; }

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
  const champ = $("prompt");
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
 * `#prompt`, `#derogation-minimale`) — Régénérer n'agit jamais sur le texte
 * édité du brouillon, seulement sur le besoin d'origine (voir message du
 * 409). La case « bug simple / refactor ponctuel » pilote À LA FOIS le
 * PRÉFIXE de fichier demandé (`type` : "bug" plutôt que "feature") et
 * la RICHESSE de template demandée (`minimal`) — le serveur peut honorer
 * l'un sans l'autre (fail-closed sur la richesse seulement, voir
 * `contenuEstGabaritMinimal`), jamais l'inverse : le frontend ne décide
 * rien, il relit ce que le contenu renvoyé révèle. */
async function surClicGenererBrouillon() {
  const champTitre = $("titre-besoin");
  const champPrompt = $("prompt");
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
  const champPrompt = $("prompt");
  const champDerogation = $("derogation-minimale");
  if (champTitre) champTitre.value = "";
  if (champPrompt) champPrompt.value = "";
  if (champDerogation) champDerogation.checked = false;
  actualiserCompteurPrompt();
  rendreRedaction();
  if (champTitre) champTitre.focus();
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
    $("horodatage").textContent = heure(etat.horodatage) + " UTC";
    const jaugeGit = $("jauge-git");
    jaugeGit.textContent = etat.git.depot ? "git " + (etat.git.branche || "?") : "git absent";
    jaugeGit.className = "jauge " + (etat.git.depot ? "ok" : "ko");
    dernierEtat = etat;
    rendreAgents(etat.agents);
    rendreSysteme(etat);
    rendreKanban(etat);
    rendreCycles(etat);
    rendreFichiers(etat);
    rendreTimeline(etat);
    actualiserPilotage(etat);
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

/* ============================================================ navigation ==
 * Colonne de navigation à onglets (feature-019, §5/§6) : une section visible
 * à la fois, `hidden` réel comme SEUL mécanisme de masquage. Motif WAI-ARIA
 * `tablist` complet — roving tabindex, les flèches déplacent le focus ET la
 * sélection.
 * ========================================================================= */

const SECTIONS = ["agents", "systeme", "developper", "cycles", "fichiers", "evenements"];
const CLE_SECTION = "section";

/* RELAIS D'AMORÇAGE, pas un état vivant (revue) : `theme.js` écrit
 * `data-section` sur `<html>` UNE SEULE FOIS, avant que ce fichier ne
 * s'exécute, en relisant `localStorage` sous son propre `try/catch` — c'est
 * ce relais qui évite à `app.js` de relire `localStorage` une seconde fois
 * juste pour cette valeur. Lu ICI, une seule fois, à l'appel initial
 * (voir plus bas `appliquerSection(sectionActuelle(), false)`).
 * `appliquerSection` ne réécrit PLUS cet attribut à chaque navigation
 * (retiré en revue : app.css n'a aucune règle qui en dépend depuis que la
 * garde `.section[hidden]` a cessé d'être concurrencée — la réécriture ne
 * pilotait plus rien, seulement `hidden` et `localStorage` comptent après
 * le chargement). Ne pas le reprendre pour « tenir l'attribut à jour » :
 * ce serait remettre en circulation un état qui n'a plus de lecteur. */
function sectionActuelle() {
  const racine = document.documentElement;
  const valeur = racine && racine.getAttribute("data-section");
  return SECTIONS.indexOf(valeur) !== -1 ? valeur : SECTIONS[0];
}

/* Lecture ET écriture protégées (feature-019) : `localStorage` peut échouer
 * (fenêtre privée, données bloquées, quota) — jamais d'exception remontée à
 * l'appelant. */
function memoriserSection(slug) {
  try {
    localStorage.setItem(CLE_SECTION, slug);
  } catch (erreur) {
    // localStorage indisponible : la préférence ne survit pas au
    // rechargement, la page reste par ailleurs pleinement fonctionnelle.
  }
}

/* `deplacerFocus` : false lors de la synchronisation initiale (la page vient
 * de se charger, rien à annoncer — voler le focus au chargement serait une
 * régression d'accessibilité) ; true sur toute activation ultérieure
 * (clic ou clavier), où la spec exige le focus programmatique sur le titre
 * de la section nouvellement visible. */
function appliquerSection(slug, deplacerFocus) {
  if (SECTIONS.indexOf(slug) === -1) slug = SECTIONS[0];
  // Pas de `racine.setAttribute("data-section", slug)` ici : `data-section`
  // n'est plus qu'un relais d'amorçage lu une fois par `sectionActuelle()`
  // (voir son commentaire) — le réécrire à chaque navigation n'a plus aucun
  // lecteur depuis que la garde `.section[hidden]` a cessé d'être
  // concurrencée en CSS. `hidden`, ci-dessous, est désormais la SEULE
  // source de vérité de l'affichage ; `memoriserSection`, plus bas, celle
  // de la persistance.

  SECTIONS.forEach((s) => {
    const section = $("section-" + s);
    const onglet = $("onglet-" + s);
    if (section) section.hidden = s !== slug;   // condition de sécurité 1 : `hidden`, rien d'autre
    if (onglet) {
      const actif = s === slug;
      onglet.setAttribute("aria-selected", actif ? "true" : "false");
      onglet.tabIndex = actif ? 0 : -1;
    }
  });

  memoriserSection(slug);

  if (deplacerFocus) {
    const titre = $("titre-section-" + slug);
    if (titre && titre.focus) titre.focus();
  }
}

/* Le focus suit la SECTION, pas l'onglet (§6 : « focus programmatique sur le
 * titre de la section nouvellement visible », à chaque changement — clic
 * COMME clavier) : le motif accessible établi pour un changement de route
 * est de poser le focus sur le titre de la page arrivée. */
SECTIONS.forEach((slug, index) => {
  const onglet = $("onglet-" + slug);
  if (!onglet) return;
  onglet.addEventListener("click", () => appliquerSection(slug, true));
  onglet.addEventListener("keydown", (evenement) => {
    const touche = evenement.key;
    let indexSuivant;
    if (touche === "ArrowRight" || touche === "ArrowDown") {
      indexSuivant = (index + 1) % SECTIONS.length;
    } else if (touche === "ArrowLeft" || touche === "ArrowUp") {
      indexSuivant = (index - 1 + SECTIONS.length) % SECTIONS.length;
    } else if (touche === "Home") {
      indexSuivant = 0;
    } else if (touche === "End") {
      indexSuivant = SECTIONS.length - 1;
    } else {
      return;
    }
    evenement.preventDefault();
    appliquerSection(SECTIONS[indexSuivant], true);
  });
});

/* Synchronisation initiale, SANS déplacer le focus (§6) : `theme.js` a pu
 * poser `data-section` avant le premier rendu (préférence retrouvée dans
 * `localStorage`) — mais `app.css` n'a AUCUNE règle qui affiche une section
 * d'après cet attribut (retiré en revue : il entrait en concurrence de
 * spécificité avec `.section[hidden]{display:none}`, la garde de sécurité,
 * et pouvait la faire perdre — voir app.css). `hidden` est donc encore à
 * son état statique du HTML servi à cet instant (seule « agents » visible) ;
 * cet appel pose le VRAI `hidden` sur chaque section dès que le DOM existe,
 * sans attendre d'autre événement. Si aucune préférence n'était posée,
 * `sectionActuelle()` retombe sur « agents » : no-op. */
appliquerSection(sectionActuelle(), false);

/* ------------------------------------------------ hauteur réelle de .barre
 * `--hauteur-barre` (app.css) fixe le repli de `.nav-sections` (`position:
 * sticky; top`) à 62px, la hauteur de `.barre` sur UNE ligne. `.barre` porte
 * `flex-wrap: wrap` : à une largeur intermédiaire, elle peut passer sur
 * deux lignes et dépasser 62px — la nav collante se retrouverait alors
 * SOUS la barre repliée (revue). `ResizeObserver` mesure la hauteur
 * RÉELLEMENT rendue et corrige la variable en conséquence, dans les deux
 * sens (une barre qui repasse sur une ligne doit aussi redescendre). Repli
 * silencieux si l'API est absente (navigateur ancien, ou bac à sable de
 * test) : la valeur par défaut d'app.css reste en vigueur. */
(function observerHauteurBarre() {
  if (typeof ResizeObserver !== "function") return;
  const barre = $("barre");   // pas de querySelector (convention du module)
  const racine = document.documentElement;
  if (!barre || !racine || !racine.style) return;
  const observateur = new ResizeObserver((entrees) => {
    const entree = entrees[entrees.length - 1];
    const hauteur = entree && entree.borderBoxSize && entree.borderBoxSize[0]
      ? entree.borderBoxSize[0].blockSize
      : barre.offsetHeight;
    if (hauteur) racine.style.setProperty("--hauteur-barre", hauteur + "px");
  });
  observateur.observe(barre);
})();

/* Filtrer ne redemande RIEN au serveur : on redessine l'état déjà chargé. Une
 * requête par frappe ferait tourner `git status` et relire 167 fichiers à chaque
 * lettre. */
function refiltrer() { if (dernierEtat) rendreKanban(dernierEtat); }
$("filtre").addEventListener("input", refiltrer);
$("filtre-divergences").addEventListener("change", refiltrer);

/* feature-008 : compteur de caractères, purement local (aucune requête). */
$("prompt").addEventListener("input", actualiserCompteurPrompt);
$("bouton-generer-brouillon").addEventListener("click", surClicGenererBrouillon);

document.addEventListener("keydown", (evenement) => {
  if (evenement.key === "Escape") fermerTiroir();
});
$("tiroir-fermer").addEventListener("click", fermerTiroir);

/* Le premier `GET /api/etat` décide seul du mode d'authentification — voir
 * `verifierEtatAuth`. Tant qu'il n'a pas répondu `200`, aucun bloc n'est
 * rendu : ni `rafraichir()` ni `brancherFlux()` ne sont appelés ici. */
verifierEtatAuth();
