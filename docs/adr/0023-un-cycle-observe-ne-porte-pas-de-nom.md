# ADR-0023 — Un cycle observé ne porte pas de nom, et le centre de contrôle renonce à lui en donner un

## Statut

Accepté (amendé par [ADR-0039](0039-la-fidelite-a-la-maquette-prime-sur-les-restrictions-anterieures.md) §3 —
un cycle lancé depuis le cockpit via `POST /api/spec/lancer` connaît sa spec
avec certitude, ce n'est plus une corrélation *a posteriori* ; le constat
mesuré sur 14 cycles *observés* reste inchangé pour ce cas-là)

## Date

2026-09-15

## Contexte

`feature-016` livre la liste des cycles en accordéon. La spec d'origine
promettait, sur chaque ligne, « le nom de la spec » associée au cycle.
Aucune donnée du système ne porte cette information.

**La donnée n'existe pas.** Un workflow rendu par `reconstruire()`
(`control-center/backend/events.py`) porte vingt clés : `bornage`,
`borne_par`, `commandes`, `cwd`, `cycles_dans_la_session`, `debut`,
`echecs`, `fermetures_orphelines`, `fichiers`, `fin`, `fin_observee`,
`fin_observee_absente`, `imbrication_suspectee`, `indice_cycle`, `passages`,
`reprises`, `runtime`, `segments`, `session_id`, `workflow_id`. Aucune ne
porte de nom, de titre ou de libellé. Les dix-sept clés du journal
d'événements brut (`hook_event_name`, `ts`, `session_id`, `agent_type`,
`agent_id`, `tool`, `file`, `cwd`, `runtime`, …) n'en portent pas davantage.
Rien, dans la chaîne qui va de l'écriture d'un événement à l'affichage d'une
ligne de la liste, ne mentionne jamais une spec.

**La corrélation a été mesurée, pas supposée.** Sur 14 cycles réels
(instantané figé du journal, bornage `agents_ouvrants` réel) :

| Fichiers de spec touchés par le cycle | Nombre de cycles |
|---|---|
| 0 | 4 |
| 1 | 2 |
| 2 ou plus | 8 |

Un cycle de 41 passages ne touche aucune spec. Un autre en touche six. Une
même spec (`feature-010`, absorption de `bug-013`, voir ADR-0017) apparaît
dans trois cycles distincts. **La corrélation par fichiers de spec modifiés
ne désigne un candidat unique que dans 2 cas sur 14** — dans les douze
autres, elle est soit muette, soit ambiguë.

**L'argument décisif n'est pas le taux d'échec de l'heuristique, c'est son
invalidabilité.** Le journal d'événements ne contient **aucune vérité
terrain** — aucun événement ne dit « ce cycle appartient à cette spec ».
Une heuristique de corrélation ne pourrait donc jamais être évaluée contre
un référent : on ne saurait jamais si les 2 cas « uniques » sur 14 sont
justes par construction ou par coïncidence. Une heuristique qu'on ne peut
pas évaluer n'est pas un compromis acceptable à afficher comme un fait :
c'est exactement ce que le §9 du design system interdit déjà pour les
chiffres (« aucun chiffre affiché qui n'est pas dans le journal »), étendu
ici aux libellés.

## Décision

**Un cycle est désigné par ce que le journal contient réellement** : son
heure de départ (`debut`) et son agent ouvrant (`borne_par`, ou la mention
du bornage quand il vaut `None` — `session entière` ou `avant le premier
repère`). Aucun nom de spec, aucune corrélation heuristique, aucun tri par
supposition d'intention.

Deux formes possibles, selon `bornage` :

- un cycle ouvert par un marqueur déclaré : heure de départ + nom de l'agent
  ouvrant (`borne_par`) ;
- un cycle sans marqueur (`bornage = session-entiere` ou
  `avant-premier-marqueur`) : heure de départ + la mention du bornage
  lui-même, qui dit pourquoi aucun agent ouvrant ne s'affiche.

**Coût de l'erreur : nul.** Ces deux données sont dans le journal, à la
source, sans transformation ni supposition. On n'affirme jamais rien de
faux, contrairement à une corrélation heuristique qui afficherait un nom de
spec dans 100 % des cas tout en n'étant fondée que dans 2 cas sur 14.

## Alternatives considérées

- **Corrélation heuristique par fichiers de spec modifiés pendant le
  cycle** (rapprocher les fichiers touchés — connus par
  `control-center/backend/vcs.py` — du chemin d'une spec dans
  `specs/features/`). Écartée : mesurée sur 14 cycles réels, elle ne
  désigne un candidat unique que dans 2 cas — muette sur 4, ambiguë sur 8 —
  et surtout **non invalidable** : le journal ne contient aucune vérité
  terrain pour la juger. Une heuristique qu'on ne peut jamais confronter à
  un référent n'est pas un compromis, c'est une affirmation non vérifiable
  maquillée en fait.
- **Lecture des transcriptions de session** pour en extraire une mention de
  spec. Écartée : le §5 du design system tranche déjà cette question pour
  les jetons, dans les mêmes termes — c'est **une décision à part entière,
  non prise**. Elle ouvrirait une dépendance à un contenu hors du journal
  d'événements, contre le principe qui tient tout l'affichage borné à ce
  que le journal contient.

## Conséquences

### Positives

- Aucune information affichée qui ne soit vérifiable dans le journal —
  cohérent avec le §9 du design system.
- Le coût d'une identification fausse est nul : on ne désigne jamais un
  cycle par une spec à laquelle il n'appartient pas.
- La désignation (heure + agent ouvrant) reste disponible même pour les
  quatre cycles qui ne touchent aucun fichier de spec — un nom de spec
  aurait été absent sur presque un tiers des cycles mesurés.

### Négatives

- Un utilisateur qui cherche « le cycle de `feature-010` » doit le
  retrouver par l'heure ou l'agent ouvrant, pas par un nom qu'il reconnaît
  d'un coup d'œil — un coût réel de lisibilité, accepté contre le risque
  d'afficher un lien faux.
- Si un geste de bornage explicite portant un identifiant de spec est un
  jour introduit (piste de repli déjà ouverte par
  [ADR-0014](0014-bornage-des-cycles-par-marqueur-declare.md)), cette
  décision serait à reprendre — pas à contourner en silence par une
  heuristique côté affichage.

### Ce que ça verrouille

- **`feature-017`** (diagramme de déroulé dans le détail d'un cycle) et
  tout écran futur du centre de contrôle héritent de l'interdit : aucun nom
  de spec affiché à côté d'un cycle sans un fait du journal qui le justifie.
- Toute future tentative de corrélation cycle ↔ spec repasse par un ADR, pas
  par un ajustement local de `app.js` ou `events.py`.

## Références

- Code : `control-center/backend/events.py` (fonction `reconstruire`, les
  vingt clés d'un workflow) ; `control-center/web/app.js` (rendu de la
  ligne de liste, désignation par heure + `borne_par`).
- Design system : `docs/DESIGN-SYSTEM.md` §5 (jetons non mesurés, même
  refus pour la même raison) et §9 (« aucun chiffre affiché qui n'est pas
  dans le journal »).
- ADR : [ADR-0014](0014-bornage-des-cycles-par-marqueur-declare.md)
  (bornage des cycles, `borne_par`, piste de repli d'un marqueur explicite).
- Spec : `specs/features/doing/feature-016-liste-des-cycles-en-accordeon.md`
  (amendée à la suite de cet ADR).
