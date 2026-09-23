"use strict";
/* feature-021, cycle 2, lot 0 — bibliothèque commune aux SIX gardes de
 * conformité (F0, F1, F2, F3a, F4a, F5a). N'est PAS elle-même une suite :
 * aucun `.py` ne la découvre (PIEGES.md §6, la CI cherche `test_*.py`), elle
 * est `require()`-ée par chacune des six.
 *
 * ⚠️ Toute garde qui l'utilise lit le prototype depuis
 * `control-center/maquettes/`, JAMAIS depuis `docs/` — ce dossier n'est pas
 * copié par le clone jetable (PIEGES.md §32, défaut déjà mesuré à 199 cas
 * contre 200). `cheminPrototype()` pointe explicitement là.
 *
 * Zéro dépendance installée (ADR-0006) : uniquement `fs`/`path` de la
 * bibliothèque standard Node.
 *
 * Toute extraction ci-dessous lit une STRUCTURE (bloc CSS par profondeur
 * d'accolades, attribut HTML nommé), jamais le texte entier par sous-chaîne
 * (PIEGES.md §26 : `grep -c` compte les commentaires ; §27 : une assertion
 * par sous-chaîne dans une section passe à tort si une prose voisine cite le
 * même mot).
 */

const fs = require("fs");
const path = require("path");

const RACINE_WEB = __dirname;
const RACINE_MAQUETTES = path.join(__dirname, "..", "maquettes");

function cheminPrototype() {
  return path.join(RACINE_MAQUETTES, "2026-09-20-maquette-materiel-3.html");
}

function cheminWeb(nom) {
  return path.join(RACINE_WEB, nom);
}

// -- Assertion d'atteignabilité bruyante (PIEGES §21 : un fichier absent est
// un ÉCHEC, jamais un saut silencieux). Retourne le texte, non vide.
function lireNonVide(chemin, label) {
  if (!fs.existsSync(chemin)) {
    throw new Error(
      "ATTEIGNABILITE : " + label + " introuvable à " + chemin +
      " — la garde ÉCHOUE, elle ne se saute pas."
    );
  }
  const texte = fs.readFileSync(chemin, "utf8");
  if (texte.trim().length === 0) {
    throw new Error("ATTEIGNABILITE : " + label + " est VIDE à " + chemin);
  }
  return texte;
}

function lirePrototype() {
  return lireNonVide(cheminPrototype(), "le prototype normatif control-center/maquettes/2026-09-20-maquette-materiel-3.html");
}

// ===================================================================== //
// CSS — parseur par profondeur d'accolades (pas de regex sur tout le fichier)
// ===================================================================== //

function extraireBlocStyle(html) {
  const debut = html.indexOf("<style>");
  const fin = html.indexOf("</style>");
  if (debut === -1 || fin === -1 || fin <= debut) {
    throw new Error("ATTEIGNABILITE : aucun bloc <style>...</style> trouvé");
  }
  return html.slice(debut + "<style>".length, fin);
}

function retirerCommentairesCss(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

// Liste plate de règles { selecteur, corps, profondeur, estAtRegle,
// estKeyframes, estAutreAtRegle }. Les règles d'un `@media`/`@supports` sont
// à la fois représentées comme bloc conteneur ET récursivement aplaties (leur
// `selecteur` n'est alors pas préfixé par le média).
//
// ⚠️ `profondeur` (0 = premier niveau de la feuille) existe parce que
// l'aplatissement rend un `:root` écrit SOUS un `@media` indiscernable d'un
// `:root` de premier niveau. Les deux n'ont pas la même portée : le second
// s'applique toujours, le premier seulement sous condition. Toute fonction
// qui replie `:root` filtre donc sur `profondeur === 0`.
function reglesCss(cssBrut, profondeur) {
  if (profondeur === undefined) profondeur = 0;
  const css = retirerCommentairesCss(cssBrut);
  const regles = [];
  const n = css.length;
  let i = 0;

  function finDeBloc(debutAccolade) {
    let profondeur = 0;
    for (let j = debutAccolade; j < n; j++) {
      if (css[j] === "{") profondeur++;
      else if (css[j] === "}") {
        profondeur--;
        if (profondeur === 0) return j;
      }
    }
    throw new Error("PARSE CSS : accolade jamais refermée à partir de l'offset " + debutAccolade);
  }

  while (i < n) {
    const accolade = css.indexOf("{", i);
    if (accolade === -1) break;
    const selecteur = css.slice(i, accolade).trim();
    const fin = finDeBloc(accolade);
    const corps = css.slice(accolade + 1, fin);
    if (selecteur.startsWith("@media") || selecteur.startsWith("@supports")) {
      regles.push({ selecteur, corps, profondeur, estAtRegle: true });
      for (const r of reglesCss(corps, profondeur + 1)) regles.push(r);
    } else if (selecteur.startsWith("@keyframes")) {
      regles.push({ selecteur, corps, profondeur, estKeyframes: true });
    } else if (selecteur.startsWith("@")) {
      regles.push({ selecteur, corps, profondeur, estAutreAtRegle: true });
    } else if (selecteur.length > 0) {
      regles.push({ selecteur, corps, profondeur, estAtRegle: false });
    }
    i = fin + 1;
  }
  return regles;
}

// Scinde le corps d'UNE règle simple en déclarations {prop, val}, en coupant
// sur `;` à la profondeur PARENTHÈSE 0 (jamais dans un cubic-bezier/rgba/calc).
function declarationsDeCorps(corps) {
  const morceaux = [];
  let profondeurParen = 0;
  let courant = "";
  for (let k = 0; k < corps.length; k++) {
    const c = corps[k];
    if (c === "(") profondeurParen++;
    else if (c === ")") profondeurParen--;
    if (c === ";" && profondeurParen === 0) {
      if (courant.trim()) morceaux.push(courant.trim());
      courant = "";
    } else {
      courant += c;
    }
  }
  if (courant.trim()) morceaux.push(courant.trim());
  const out = [];
  for (const d of morceaux) {
    const idx = d.indexOf(":");
    if (idx === -1) continue;
    out.push({ prop: d.slice(0, idx).trim(), val: d.slice(idx + 1).trim() });
  }
  return out;
}

// Toutes les règles au sélecteur EXACTEMENT `:root`, au PREMIER NIVEAU de la
// feuille, dans l'ordre du document.
//
// ⚠️ Périmètre déclaré, pas oubli. Sont volontairement HORS repli :
//   - `:root[data-theme="…"]`, `:root:not(…)` — sélecteurs distincts, de
//     spécificité supérieure : ils ne « complètent » pas `:root`, ils le
//     battent sous condition. Les replier ferait dire à la garde une valeur
//     que le navigateur ne peint que dans un thème donné.
//   - tout `:root` écrit sous `@media`/`@supports` (profondeur > 0) — il ne
//     s'applique que si la requête est satisfaite ; le replier
//     inconditionnellement affirmerait une valeur fausse hors condition.
// Ce qui est replié, ce sont les `:root` nus, tous inconditionnels, dont le
// navigateur résout la valeur par la cascade : à spécificité égale, la
// DERNIÈRE déclaration gagne.
function reglesRootTopNiveau(cssBrut) {
  return reglesCss(cssBrut).filter(
    (r) => !r.estAtRegle && !r.estKeyframes && !r.estAutreAtRegle &&
      r.selecteur === ":root" && r.profondeur === 0
  );
}

// Replie les `:root` de premier niveau. Retourne :
//   effectives  : Map prop -> valeur que le NAVIGATEUR résout (dernière)
//   occurrences : Map prop -> [toutes les valeurs déclarées, dans l'ordre]
//   nbBlocs     : nombre de blocs repliés
//
// La distinction porte la garde : comparer `effectives` dit ce qui est peint ;
// lire `occurrences` dit si la valeur a été posée puis écrasée — un jeton
// déclaré deux fois avec deux valeurs est une bombe à retardement même quand
// la valeur effective est la bonne, parce qu'une réorganisation de la feuille
// suffit à inverser le gagnant sans rien changer d'autre.
function declarationsRootRepliees(cssBrut) {
  const blocs = reglesRootTopNiveau(cssBrut);
  if (blocs.length === 0) {
    throw new Error("ATTEIGNABILITE : aucune règle `:root` de premier niveau trouvée dans la feuille");
  }
  const effectives = new Map();
  const occurrences = new Map();
  for (const bloc of blocs) {
    for (const d of declarationsDeCorps(bloc.corps)) {
      effectives.set(d.prop, d.val);
      if (!occurrences.has(d.prop)) occurrences.set(d.prop, []);
      occurrences.get(d.prop).push(d.val);
    }
  }
  return { effectives, occurrences, nbBlocs: blocs.length };
}

// Déclarations EFFECTIVES de `:root` — celles que le navigateur résout une
// fois la cascade appliquée sur tous les blocs de premier niveau.
function declarationsRoot(cssBrut) {
  const { effectives } = declarationsRootRepliees(cssBrut);
  return [...effectives.entries()].map(([prop, val]) => ({ prop, val }));
}

// Propriétés déclarées plus d'une fois dans les `:root` repliés avec des
// valeurs DIVERGENTES (une redéclaration à l'identique est redondante, pas
// dangereuse). Retourne [{ prop, valeurs }].
function jetonsRedeclaresDivergents(cssBrut) {
  const { occurrences } = declarationsRootRepliees(cssBrut);
  const out = [];
  for (const [prop, valeurs] of occurrences) {
    if (valeurs.length > 1 && new Set(valeurs).size > 1) out.push({ prop, valeurs });
  }
  return out;
}

// Le texte CSS privé de TOUS les blocs `:root` de premier niveau.
//
// L'ancienne version bornait la recherche « après la fin du premier bloc
// `:root` ». Deux défauts : elle laissait échapper un second `:root` (dont le
// contenu était alors compté comme « hors root »), et elle ignorait le texte
// situé AVANT le premier bloc. On retire les blocs, on ne coupe plus au
// premier.
function cssSansRootTopNiveau(cssBrut) {
  const css = retirerCommentairesCss(cssBrut);
  const n = css.length;
  let out = "";
  let i = 0;
  let vuAuMoinsUnRoot = false;
  while (i < n) {
    const accolade = css.indexOf("{", i);
    if (accolade === -1) { out += css.slice(i); break; }
    const selecteur = css.slice(i, accolade).trim();
    let profondeur = 0, fin = -1;
    for (let j = accolade; j < n; j++) {
      if (css[j] === "{") profondeur++;
      else if (css[j] === "}") { profondeur--; if (profondeur === 0) { fin = j; break; } }
    }
    if (fin === -1) throw new Error("PARSE CSS : accolade jamais refermée à partir de l'offset " + accolade);
    if (selecteur === ":root") vuAuMoinsUnRoot = true;
    else out += css.slice(i, fin + 1);
    i = fin + 1;
  }
  if (!vuAuMoinsUnRoot) {
    throw new Error("ATTEIGNABILITE : aucun `:root` de premier niveau pour borner la recherche hors-root");
  }
  return out;
}

// Toutes les valeurs hexadécimales du CSS situé HORS des blocs `:root` de
// premier niveau (pour détecter les littéraux qui y échappent — PIEGES §21 :
// ne jamais recopier un compte, le dériver).
function hexHorsRoot(cssBrut) {
  const apres = cssSansRootTopNiveau(cssBrut);
  return apres.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
}

// Comme `hexHorsRoot`, mais avec le CONTEXTE de chaque occurrence (règle et
// propriété qui la porte) — nécessaire pour distinguer un littéral qui PEINT
// (`color`, `background`, `border-color`, `stroke`, `fill`) d'un littéral qui
// sert d'arrêt d'un `mask`/`filter` (alpha, pas une couleur de rendu).
function hexHorsRootAvecContexte(cssBrut) {
  const apres = cssSansRootTopNiveau(cssBrut);
  const regles = reglesCss(apres);
  const out = [];
  for (const r of regles) {
    if (r.estKeyframes) continue;
    for (const d of declarationsDeCorps(r.corps)) {
      let m;
      const re2 = /#[0-9a-fA-F]{3,8}\b/g;
      while ((m = re2.exec(d.val))) {
        out.push({ hex: m[0], prop: d.prop.toLowerCase(), selecteur: r.selecteur });
      }
    }
  }
  return out;
}

// Ids portés par plus d'un élément. Un id dupliqué est du HTML invalide, et
// il rend `baliseParId` trompeuse : elle inspecte la PREMIÈRE occurrence, donc
// un second élément non conforme passe inaperçu derrière un premier conforme.
// La garde le refuse au lieu de choisir silencieusement.
function idsDupliquesDeHtml(html) {
  const corps = extraireCorpsAvantScript(html);
  const vus = new Map();
  const re = /\sid="([^"]+)"/g;
  let m;
  while ((m = re.exec(corps))) vus.set(m[1], (vus.get(m[1]) || 0) + 1);
  return [...vus.entries()].filter(([, n]) => n > 1).map(([id, n]) => ({ id, occurrences: n }));
}

function classesDansSelecteur(sel) {
  const out = new Set();
  const re = /\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g;
  let m;
  while ((m = re.exec(sel))) out.add(m[1]);
  return out;
}

function corpsSignificatif(corps) {
  return corps.replace(/\s+/g, "").length > 0;
}

// Classes posées comme sélecteur d'une règle qui porte AU MOINS une
// déclaration (PIEGES §33 : une règle vide ne protège rien).
function classesDeclareesAvecCorps(cssBrut) {
  const regles = reglesCss(cssBrut);
  const out = new Set();
  for (const r of regles) {
    if (r.estAtRegle || r.estKeyframes || r.estAutreAtRegle) continue;
    if (!corpsSignificatif(r.corps)) continue;
    for (const c of classesDansSelecteur(r.selecteur)) out.add(c);
  }
  return out;
}

function nomsKeyframes(cssBrut) {
  const regles = reglesCss(cssBrut);
  const out = new Set();
  for (const r of regles) {
    if (!r.estKeyframes) continue;
    const m = r.selecteur.match(/^@keyframes\s+([A-Za-z0-9_-]+)/);
    if (m) out.add(m[1]);
  }
  return out;
}

// Liste des déclarations `animation`, `transition`, `animation-delay`,
// portées par une règle réelle (jamais un `@keyframes`), avec leur sélecteur.
function declarationsAnimationEtTransition(cssBrut) {
  const regles = reglesCss(cssBrut);
  const out = [];
  for (const r of regles) {
    if (r.estAtRegle || r.estKeyframes || r.estAutreAtRegle) continue;
    for (const d of declarationsDeCorps(r.corps)) {
      const p = d.prop.toLowerCase();
      if (p === "animation" || p === "transition" || p === "animation-delay") {
        out.push({ selecteur: r.selecteur, prop: p, val: d.val });
      }
    }
  }
  return out;
}

// ===================================================================== //
// HTML — extraction structurée (attribut nommé, pas grep de tout le texte)
// ===================================================================== //

// Le corps AVANT tout <script> : les scripts contiennent des gabarits
// (`${id}`) qui ne sont pas des attributs HTML et fausseraient une regex
// naïve sur le fichier entier.
function extraireCorpsAvantScript(html) {
  const debutBody = html.indexOf("<body>");
  if (debutBody === -1) throw new Error("ATTEIGNABILITE : aucune balise <body>");
  const debutScript = html.indexOf("<script>", debutBody);
  const fin = debutScript === -1 ? html.length : debutScript;
  return html.slice(debutBody, fin);
}

function idsDeHtml(html) {
  const corps = extraireCorpsAvantScript(html);
  const out = new Set();
  const re = /\sid="([^"]+)"/g;
  let m;
  while ((m = re.exec(corps))) out.add(m[1]);
  return out;
}

function classesDeHtml(html) {
  const corps = extraireCorpsAvantScript(html);
  const out = new Set();
  const re = /\sclass="([^"]*)"/g;
  let m;
  while ((m = re.exec(corps))) {
    for (const c of m[1].split(/\s+/)) if (c) out.add(c);
  }
  return out;
}

// Renvoie le texte de la balise ouvrante qui porte `id="valeur"` — recherche
// bornée à CETTE balise (jusqu'au `>` non échappé suivant), jamais au
// paragraphe qui l'entoure (évite le défaut PIEGES §27).
function baliseParId(html, idValeur) {
  const corps = extraireCorpsAvantScript(html);
  const aiguille = 'id="' + idValeur + '"';
  const pos = corps.indexOf(aiguille);
  if (pos === -1) return null;
  const debutBalise = corps.lastIndexOf("<", pos);
  const finBalise = corps.indexOf(">", pos);
  if (debutBalise === -1 || finBalise === -1) return null;
  return corps.slice(debutBalise, finBalise + 1);
}

function attributsDeBalise(baliseTexte) {
  const out = { role: null, aria: new Set() };
  if (!baliseTexte) return out;
  const roleM = baliseTexte.match(/\srole="([^"]+)"/);
  if (roleM) out.role = roleM[1];
  const re = /\s(aria-[a-z]+)="[^"]*"/g;
  let m;
  while ((m = re.exec(baliseTexte))) out.aria.add(m[1]);
  return out;
}

function compterAttribut(html, motif) {
  const corps = extraireCorpsAvantScript(html);
  const m = corps.match(motif);
  return m ? m.length : 0;
}

module.exports = {
  cheminPrototype, cheminWeb, lireNonVide, lirePrototype,
  extraireBlocStyle, retirerCommentairesCss, reglesCss, declarationsDeCorps,
  declarationsRoot, declarationsRootRepliees, reglesRootTopNiveau,
  jetonsRedeclaresDivergents, cssSansRootTopNiveau,
  hexHorsRoot, hexHorsRootAvecContexte, classesDansSelecteur, corpsSignificatif,
  classesDeclareesAvecCorps, nomsKeyframes, declarationsAnimationEtTransition,
  extraireCorpsAvantScript, idsDeHtml, classesDeHtml, baliseParId,
  attributsDeBalise, compterAttribut, idsDupliquesDeHtml,
};
