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

function duree(ms) {
  if (ms === null || ms === undefined) return null;   /* pas mesurable ≠ zéro */
  if (ms < 1000) return ms + " ms";
  if (ms < 60000) return (ms / 1000).toFixed(1) + " s";
  const minutes = Math.floor(ms / 60000);
  return minutes + " min " + Math.round((ms % 60000) / 1000) + " s";
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
 * docs/DESIGN-SYSTEM.md §8). Livré ici pour feature-016 : AUCUN appelant ne
 * l'utilise encore dans ce cycle — les jetons de couleur (`--a-<rôle>`,
 * `--f-<rôle>`, app.css) ne sont pas non plus appliqués aux maillons ici.
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

function sigleAgent(nomRole, siglesDejaPris) {
  const pris = siglesDejaPris || new Set();
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

function rendreWorkflows(etat) {
  const zone = $("workflows");
  vider(zone);
  const workflows = etat.workflows.slice().reverse();
  if (!workflows.length) {
    zone.appendChild(el("div", "vide", "aucun événement encore observé"));
    $("compteur-workflows").textContent = "";
    return;
  }
  workflows.forEach((wf) => {
    const bloc = el("div", "workflow");
    const entete = el("div", "wf-entete");
    const actif = wf.fin_observee_absente;
    entete.appendChild(el("span", "marqueur " + (actif ? "actif" : "clos"),
      actif ? "● sans fin observée" : "✓ close"));
    entete.appendChild(el("span", "session", "session " + String(wf.session_id).slice(0, 8)));
    /* Deux segments d'une même session partagent le même `session_id` :
     * sans l'indice de cycle et l'agent ouvrant, ils seraient indiscernables
     * à l'écran. `cycles_dans_la_session` et `indice_cycle` sont tolérés
     * absents (backend en retard) : le span n'apparaît alors simplement pas. */
    if (wf.cycles_dans_la_session > 1) {
      /* Un segment ANTÉRIEUR au premier repère n'est pas un cycle : le backend
       * refuse explicitement de l'affirmer (`bornage = avant-premier-marqueur`).
       * Le libellé visible doit refuser la même chose — sans quoi l'écran en dit
       * plus que ce que le module sait, ce que ce cycle entier cherche à éviter. */
      let texteCycle;
      if (wf.bornage === "avant-premier-marqueur") {
        texteCycle = "avant le premier repère";
      } else {
        texteCycle = "cycle " + (wf.indice_cycle + 1) + "/" + wf.cycles_dans_la_session;
        if (wf.borne_par) texteCycle += " — ouvert par " + wf.borne_par;
      }
      const cycle = el("span", "session", texteCycle);
      cycle.title = wf.bornage === "marqueur-agent"
        ? "Segment ouvert par l'agent repère " + wf.borne_par
        : wf.bornage === "avant-premier-marqueur"
          ? "Antérieur au premier agent repère rencontré dans la session — "
            + "n'affirme rien sur son contenu"
          : "Bornage non établi pour cette session";
      entete.appendChild(cycle);
    }
    entete.appendChild(el("span", "session", heure(wf.debut) + " → " + heure(wf.fin_observee)));
    entete.appendChild(el("span", "session", wf.fichiers.length + " fichier(s)"));
    bloc.appendChild(entete);

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
        maillon.appendChild(el("span", "mnom", segment.agent));
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
      bloc.appendChild(chaine);
    }

    const notes = [];
    if (wf.commandes && Object.keys(wf.commandes).length) {
      notes.push("commandes : " + Object.keys(wf.commandes)
        .map((c) => c + " ×" + wf.commandes[c]).join(", "));
    }
    if (notes.length) bloc.appendChild(el("div", "wf-notes", notes.join(" · ")));

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
      bloc.appendChild(bandeau);
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
      bloc.appendChild(note);
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
      bloc.appendChild(note);
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
      bloc.appendChild(note);
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
      bloc.appendChild(note);
    }
    zone.appendChild(bloc);
  });
  $("compteur-workflows").textContent = etat.evenements.length + " derniers événements";
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
    ligne.appendChild(el("span", "fchemin", commit.sujet));
    zone.appendChild(ligne);
  });
}

/* -------------------------------------------------------------- timeline -- */
function rendreTimeline(etat) {
  const liste = $("timeline");
  vider(liste);
  const evenements = etat.evenements.slice().reverse();
  if (!evenements.length) {
    liste.appendChild(el("li", "vide", "journal vide"));
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
      corps.appendChild(el("p", "vide", "aucune commande déclarée dans [commandes]"));
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
    rendreWorkflows(etat);
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

/* --------------------------------------------------------------- thème ---
 * Bascule à trois positions — clair, système, sombre (feature-015,
 * docs/DESIGN-SYSTEM.md §7). `theme.js`, chargé SYNCHRONE dans <head>, a
 * déjà posé — ou pas — `data-theme` sur `<html>` avant que ce fichier ne
 * s'exécute. Ce module commande les trois boutons, écrit le choix, et suit
 * `matchMedia` seulement en position « système ».
 *
 * `document.documentElement` est ABSENT du bac à sable Node de
 * `test_app_bug012.js` (le faux `document` n'y modélise pas l'élément
 * racine) : chaque accès est donc gardé par un test de vérité, jamais
 * déréférencé directement — c'est ce qui permet à ce module de charger sans
 * exception dans ce harnais comme dans un navigateur réel. Même prudence
 * pour `matchMedia`, absent du bac à sable : vérifié par `typeof` avant tout
 * appel, jamais réclamé nu. */
const CLE_THEME = "theme";

function attributeThemeActuel() {
  const racine = document.documentElement;
  return racine ? racine.getAttribute("data-theme") : null;
}

function memoriserTheme(choix) {
  try {
    if (choix === "systeme") localStorage.removeItem(CLE_THEME);
    else localStorage.setItem(CLE_THEME, choix);
  } catch (erreur) {
    // `localStorage` indisponible (fenêtre privée, données bloquées, quota) :
    // le choix ne survit pas au rechargement, la page reste correcte quand
    // même — aucune exception ne doit remonter à l'appelant (C2/C3).
  }
}

const mqSombre = (typeof matchMedia === "function")
  ? matchMedia("(prefers-color-scheme: dark)")
  : null;

/* L'OS sans préférence exprimée vaut clair (D2) : `mqSombre` absent ou
 * `matches` faux mènent tous deux à "clair". */
function themeResolu() {
  const choix = attributeThemeActuel();
  if (choix === "clair" || choix === "sombre") return choix;
  return (mqSombre && mqSombre.matches) ? "sombre" : "clair";
}

function positionActiveTheme() {
  const choix = attributeThemeActuel();
  if (choix === "clair") return "theme-clair";
  if (choix === "sombre") return "theme-sombre";
  return "theme-systeme";
}

function appliquerTheme(choix) {
  const racine = document.documentElement;
  if (racine) {
    if (choix === "clair" || choix === "sombre") racine.setAttribute("data-theme", choix);
    else racine.removeAttribute("data-theme");
  }
  memoriserTheme(choix);
  rafraichirCommandeTheme();
}

const BOUTONS_THEME = ["theme-clair", "theme-systeme", "theme-sombre"];
function idVersChoix(id) {
  return id === "theme-clair" ? "clair" : id === "theme-sombre" ? "sombre" : "systeme";
}

/* La position « système » annonce sa résolution (B2) : son icône ET son
 * libellé accessible suivent le thème auquel elle aboutit À CET INSTANT. Les
 * deux autres positions gardent un libellé fixe (posé une fois dans le
 * HTML). Aucun `innerHTML` : uniquement `setAttribute`/`hidden`/`title`. */
function rafraichirCommandeTheme() {
  const active = positionActiveTheme();
  BOUTONS_THEME.forEach((id) => {
    const bouton = $(id);
    if (!bouton) return;
    const coche = id === active;
    bouton.setAttribute("aria-checked", coche ? "true" : "false");
    bouton.tabIndex = coche ? 0 : -1;
  });
  const resolu = themeResolu();
  const iconeClair = $("icone-systeme-clair");
  const iconeSombre = $("icone-systeme-sombre");
  if (iconeClair) iconeClair.hidden = resolu !== "clair";
  if (iconeSombre) iconeSombre.hidden = resolu !== "sombre";
  const boutonSysteme = $("theme-systeme");
  if (boutonSysteme) {
    const libelle = "Suivre le système (actuellement " + resolu + ")";
    boutonSysteme.setAttribute("aria-label", libelle);
    boutonSysteme.title = libelle;
  }
}

BOUTONS_THEME.forEach((id, index) => {
  const bouton = $(id);
  if (!bouton) return;
  bouton.addEventListener("click", () => appliquerTheme(idVersChoix(id)));
  /* Roving tabindex : le motif WAI-ARIA `radiogroup` complet — flèches
   * gauche/droite ET haut/bas (un groupe peut se présenter en ligne comme en
   * colonne selon la mise en page), plus Origine/Fin pour atteindre le
   * premier et le dernier bouton d'un coup. Le focus suit la sélection dans
   * tous les cas (B3 — clavier seul, focus visible via
   * `.theme-bouton:focus-visible` dans app.css). */
  bouton.addEventListener("keydown", (evenement) => {
    const touche = evenement.key;
    let indexSuivant;
    if (touche === "ArrowRight" || touche === "ArrowDown") {
      indexSuivant = (index + 1) % BOUTONS_THEME.length;
    } else if (touche === "ArrowLeft" || touche === "ArrowUp") {
      indexSuivant = (index - 1 + BOUTONS_THEME.length) % BOUTONS_THEME.length;
    } else if (touche === "Home") {
      indexSuivant = 0;
    } else if (touche === "End") {
      indexSuivant = BOUTONS_THEME.length - 1;
    } else {
      return;
    }
    evenement.preventDefault();
    const suivant = BOUTONS_THEME[indexSuivant];
    appliquerTheme(idVersChoix(suivant));
    const boutonSuivant = $(suivant);
    if (boutonSuivant && boutonSuivant.focus) boutonSuivant.focus();
  });
});

if (mqSombre) {
  /* Actif SEULEMENT en position « système » (D1) : un choix explicite ne
   * doit pas se remettre à suivre l'OS parce que l'OS a changé d'avis. */
  mqSombre.addEventListener("change", () => {
    if (positionActiveTheme() === "theme-systeme") rafraichirCommandeTheme();
  });
}

rafraichirCommandeTheme();

/* Filtrer ne redemande RIEN au serveur : on redessine l'état déjà chargé. Une
 * requête par frappe ferait tourner `git status` et relire 167 fichiers à chaque
 * lettre. */
function refiltrer() { if (dernierEtat) rendreKanban(dernierEtat); }
$("filtre").addEventListener("input", refiltrer);
$("filtre-divergences").addEventListener("change", refiltrer);

document.addEventListener("keydown", (evenement) => {
  if (evenement.key === "Escape") fermerTiroir();
});
$("tiroir-fermer").addEventListener("click", fermerTiroir);

/* Le premier `GET /api/etat` décide seul du mode d'authentification — voir
 * `verifierEtatAuth`. Tant qu'il n'a pas répondu `200`, aucun bloc n'est
 * rendu : ni `rafraichir()` ni `brancherFlux()` ne sont appelés ici. */
verifierEtatAuth();
