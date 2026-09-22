# Pièges du centre de contrôle

Ce fichier existe pour une raison mesurable : les mêmes 400 mots de contraintes
étaient recopiés dans **chaque** brief d'agent — huit briefs par cycle, plus de
dix mille mots répétés en trois cycles, pour dire des choses qui ne changent
jamais.

**Un brief cite ce fichier, il ne le recopie pas.** Formule attendue :

> Contraintes opérationnelles et pièges du module : lis
> `control-center/PIEGES.md` **avant de commencer**. Les points qui te concernent
> particulièrement ici sont les §N et §M.

Chaque entrée est **établie par exécution**, avec la date et ce que le défaut a
coûté. Aucune n'est une précaution théorique.

---

## 1. Toute expérience se fait sur un clone jetable

`cp -a`, **jamais `git clone`** : du travail non commité est presque toujours
présent, et `git clone` ne le copie pas — on mesure alors un état qui n'existe
nulle part.

Le clone doit contenir **`control-center/` ET `.claude/agents/` ET
`specs/features/_template.md` ET `specs/modele.md`** — ces deux derniers sont
hors de `control-center/`, mais `redaction_spec.py` (`preparer_brouillon`) les
lit directement depuis le projet (`feature-008`). Un clone qui n'en copie que
`control-center/` rend `500 template introuvable` sur ce module : un symptôme
qui ressemble à un défaut du code, alors que c'est le clone qui est incomplet.

La racine des données dérive de l'emplacement de `server.py` : **un clone
partiel écrit dans le vrai journal.**

> Coûté une fois : un test a échoué pour une mauvaise raison, et le diagnostic a
> porté sur le mauvais défaut.

⚠️ **Le script `tools/lancer_suite_control_center_non_root.sh` (§43) est un
clone partiel assumé, pas une exception à cette règle** : il ne copie que
`control-center/` et trois chemins déclarés, **jamais `.gitlab/` ni
`.github/`**. Tout test qui lit les fichiers de CI des deux forges
(`test_ci_decouverte.py`, `bug-018`/`bug-019`) s'y **saute donc toujours** —
proprement, 0 cas, pas un échec, mais un angle mort à connaître avant de
comparer un compte de cas obtenu en non-root à un compte obtenu en root.

## 2. Le port 8788 appartient à l'utilisateur

Son serveur y tourne. **Ne pas le prendre, ne pas le tuer.** Prendre un port
libre au-dessus de 8800.

⚠️ Ce serveur peut tourner avec un **code plus ancien que l'arbre de travail** —
les fichiers statiques sont relus à chaque requête, le code Python non. **Ne
jamais rien conclure d'un essai fait contre lui.**

## 3. Tout arrêt de processus vise un PID capturé

Jamais un motif.

> Coûté une fois : un `pkill -f` dont le motif figurait dans sa propre ligne de
> commande a tué le processus appelant.

## 4. Le journal réel est en lecture seule, et il grandit

Il grossit pendant qu'on le mesure. **Travailler sur un instantané figé**, sinon
deux comptages successifs se contredisent sans raison.

## 5. Rien n'est commité ni poussé sans feu vert explicite

Et **le push exige un feu vert distinct de celui du commit**.

---

## 6. Les suites de ce module ne sont pas des `unittest`

Ce sont des **scripts autonomes** : `python3 <fichier>`, sortie
« N cas, M echec(s) », code 1 si échec.

La doctrine `harnais_kit` / matrice diagonale du kit **ne s'y applique pas**.

Pour le JavaScript, suivre le pont existant — `test_app_X.js` + `test_app_X.py`,
le `.py` ne portant aucune assertion et se **sautant proprement** (code 0) si
`node` est absent. La CI découvre par `find control-center -name 'test_*.py'` :
un fichier non ramassé est un test qui n'existe pas.

## 7. La liste `IDS` du harnais web est tenue à la main

Dans `test_app_bug012.js`. Elle n'est **pas** lue depuis le HTML.

Un identifiant neuf oublié fait que la suite mesure autre chose **en silence** —
et la fonction qui la lit avale son exception. C'est un **vert à tort**, pas un
échec.

## 8. La liste des fichiers servables est calculée au démarrage

Un fichier neuf sous `control-center/web/` rend **404** tant que le serveur n'est
pas relancé. Le diagnostic naturel — « mon code ne se charge pas » — part dans la
mauvaise direction.

Tout nom commençant par `test_` est exclu par construction.

## 9. La politique de sécurité interdit le script inline, pas le style inline

`default-src 'self'` ; `style-src` porte `'unsafe-inline'`, **`script-src` non**,
il hérite de `default-src`.

Conséquences : aucun `<script>` inline, jamais. Un comportement par défaut sans
JavaScript s'obtient **en CSS pur**.

⚠️ **Demander l'assouplissement de cette politique arrête le cycle et remonte à
l'humain.** Ce n'est pas une décision d'agent.

---

## 10. Un harnais en `file://` ne prouve rien sur la politique de sécurité

`test_app_theme_navigateur.py` charge la page en `file://`, **où la politique ne
s'applique pas** — il y exécute d'ailleurs un script inline et passe au vert.

Toute vérification portant sur la politique, ou sur ce que le serveur sert,
**doit passer par HTTP**.

## 11. Ce navigateur ne résout pas les couleurs du nouvel espace

`getComputedStyle` rend la chaîne `oklch()` **non résolue**. Pour lire une
couleur réellement peinte : canevas 2D, `fillStyle` puis `getImageData`.

## 12. L'émulation de préférence de thème a des valeurs inversées

`--blink-settings=preferredColorScheme=` vaut **0 pour sombre** et **1 pour
clair**.

> Coûté une fois : un agent en a conclu que l'émulation ne fonctionnait pas.

## 13. Le script d'amorçage écrase un thème posé à la main

Un test qui veut éprouver la **règle CSS seule** doit le neutraliser — sinon il
mesure autre chose et passe pour vert.

## 14. Le démarrage de la page fait deux appels d'état

Avant tout rafraîchissement explicite. Un test qui clique trop tôt agit sur un
rendu intermédiaire, sans qu'aucune assertion ne s'en aperçoive.

## 15. Masquer visuellement ne neutralise pas

`opacity: 0`, le hors-écran, une hauteur nulle à débordement caché et le
détourage laissent un contrôle **focalisable au clavier**. Seuls `hidden`,
`display: none`, `visibility: hidden` et `inert` le neutralisent.

Et `[hidden] { display: none }` doit venir **après** toute règle `display`
d'auteur sur le même élément — sinon la section réapparaît.

---

## 16. Ce que le journal ne contient pas

Vérifié sur plusieurs milliers d'événements :

- **aucun compte de jetons** — les dix-sept clés d'événement n'en portent pas ;
- **aucun nom de spec** — ni dans les vingt clés d'un cycle reconstruit, ni dans
  le journal. La corrélation avec les specs du dépôt ne désigne un candidat
  unique que dans **2 cas sur 14**, et son taux d'erreur **n'est pas mesurable**
  faute de vérité terrain (ADR-0023).

**Tout chiffre ou libellé affiché doit venir des données.** Une maquette montre
ce qu'on veut voir, pas ce qu'on peut mesurer — deux specs ont promis des données
inexistantes pour cette raison.

## 17. `SessionEnd` ne se déclenche jamais sur une session longue

Il part sur les sessions courtes proprement closes, **jamais** sur une session
longue reprise. Conséquence : le champ « fin non observée » vaut vrai pour
**~85 %** des cycles, y compris ceux clos depuis des jours.

Un état de cycle lu sur ce champ serait **livré mort** (note datée d'ADR-0014).

## 18. `segments[]` ne contient pas des cycles

Ce sont des **passages d'agent**. Le nom trompe qui ne lit pas les clés.

## 19. Le nombre de cycles est un réglage, pas une donnée

Il dépend du bornage déclaré : **3** cycles sans bornage, **13 à 14** avec la
configuration courante, **27** avec deux agents ouvrants. La liste servie est en
outre **bornée à l'affichage**. L'écran doit le dire (ADR-0014).

---

## 20. Une borne posée au ras de sa valeur est décidée par l'arrondi

Un seuil conçu à exactement 0,10 est ressorti à **0,0995** après quantification
sur 8 bits. Sur la plage des gris, **un bit vaut 0,0585 de ratio de contraste**.

**Toute borne numérique se pose avec une marge chiffrée et justifiée.**

## 21. Une énumération écrite à la main est une mesure périmée d'avance

Constaté à trois étages le même jour : le design system déclarait trois surfaces
quand le code en servait une quatrième ; deux specs énuméraient trois surfaces en
omettant celle qui portait le pire défaut ; deux agents ont annoncé 4 et 6 usages
de ce même jeton, quand le compte réel était 5.

**Toute liste — jetons, surfaces, sélecteurs — se lit depuis l'artefact.**

## 22. Une correction s'arrête au premier endroit signalé

Pas au dernier où la règle s'applique. Constaté **trois fois** le même jour :
jetons corrigés dans un thème et pas l'autre ; règle appliquée aux éléments neufs
et pas à l'existant ; motif de trait libéré d'un côté, conservé de l'autre.

**Avant de rendre, chercher tous les autres points d'application, et le prouver
par une commande.**

## 23. Les deux méthodes de mappage de gamut ne tombent pas au même endroit

L'**écrêtage canal par canal** déplace la clarté ; la **réduction d'intensité à
clarté et teinte conservées** la préserve. Une palette catégorielle ne tient que
par la seconde.

Comparer une table calculée à une feuille livrée sans savoir laquelle a été
appliquée produit un désaccord chiffré incompréhensible — c'est arrivé.

---

## 24. Un test de cascade CSS qui compare des positions de texte ne prouve rien

Un test peut « couvrir » une règle de précédence (quel sélecteur l'emporte) en
comparant l'**ordre des règles dans la feuille source** — sans jamais pouvoir
constater l'**effet réellement peint**. Une telle assertion reste verte même
si la cascade produit le mauvais résultat, parce qu'elle ne mesure pas ce
qu'elle prétend garder.

**Une garde de cascade se prouve sur le style calculé ou peint, jamais sur la
position du texte dans le fichier source.**

## 25. Une mutation neutralisée par la spécificité CSS est un faux positif de revue

Muter une règle CSS (inverser une valeur, retirer une déclaration) pour
vérifier qu'un test la détecte ne prouve rien si une **règle plus spécifique**
l'emporte déjà dans la cascade : le mutant ne se propage jamais jusqu'au rendu,
le test reste vert, et la revue conclut à tort que la garde tient.

**Avant de muter une règle CSS, vérifier sa spécificité contre les autres
règles du même sélecteur** — sinon la mutation ne teste que l'auteur du test,
pas le code.

## 26. `grep -c` compte les commentaires, pas seulement les usages

Compter les occurrences d'un jeton avec `grep -c` sur une feuille de style
inclut les **commentaires qui le citent** — par exemple une migration qui
laisse `/* var(--surface), pas var(--surface-2) */` en trace. Mesuré : la
commande rendait **6** usages là où il n'en restait que **3** réels, chaque
migration ayant laissé un commentaire citant le jeton qu'elle venait de
retirer.

**Un compte d'usages se fait sur les déclarations, jamais sur une recherche
de texte brute qui traverse les commentaires.**

## 27. Une assertion par sous-chaîne dans une section passe à tort si une prose voisine contient le libellé

Chercher un libellé comme sous-chaîne dans le texte d'une section entière —
plutôt que dans l'élément précis censé le porter — peut réussir pour la
mauvaise raison : une prose voisine qui mentionne le même mot suffit à faire
passer l'assertion, sans que l'élément visé le porte réellement.

**Une assertion textuelle cible l'élément, jamais un bloc de texte qui
l'englobe.**

## 28. Le mode sans fenêtre est instable d'une version à l'autre, et le serveur ne journalise que les échecs

Trois défauts distincts, mesurés sur ce paquet :

- le mode sans fenêtre **récent** (`--headless=new`) ne charge **jamais**
  l'URL demandée ;
- l'**ancien** mode sans fenêtre vide le document au chargement ;
- le **budget de temps virtuel** ne rend jamais la main tant que le flux
  d'événements (`EventSource`) reste ouvert — parade : neutraliser la source
  d'événements avant de mesurer.

À cela s'ajoute un défaut côté serveur : il ne journalise que les réponses
**non conformes**. Une page servie correctement est donc **invisible** dans
les journaux — l'absence de ligne ne prouve rien, ni dans un sens ni dans
l'autre.

## 29. Un clone pris pendant les mutations d'un autre agent copie le mutant

`cp -a` capture l'état du disque à l'instant T. Si un autre agent mute le
code en place au même moment (validation par mutation), le clone peut
capturer un fichier **muté**, pas la base saine — et rien dans le contenu ne
le signale, à l'exception d'un éventuel marqueur laissé en commentaire par la
mutation elle-même.

**Comparer le clone à l'arbre de travail juste avant de mesurer**, pas
seulement au moment de la copie.

## 30. Un test qui délègue à la fonction sous test pour reconstruire l'attendu peut rester aveugle à sa propre divergence

Une garde de non-chevauchement (`test_app_diagramme.js`) reconstruit le texte
peint par `app.js` pour vérifier qu'aucune boîte de libellé ne recouvre sa
voisine. Une première version appelait `disposer.texteDuree()` — la même
fonction que celle utilisée pour dimensionner l'espace réservé — pour obtenir
ce texte. Or `app.js` peint la durée avec **sa propre** formule
(`duree()`, indépendante), pas avec `disposer.texteDuree()`. Tant que le
test délègue à la fonction sous test, les deux s'accordent forcément entre
elles, même si le texte réellement peint diverge de celui que le test croit
vérifier — la garde reste verte quelle que soit la branche qui casse
réellement à l'écran.

Trouvé en revue (code-reviewer), pas par mutation : la mutation de
`texteDuree()` seule ne pouvait pas révéler le problème, puisque le test et
le code sous test auraient muté ensemble.

**Une garde de non-régression qui vérifie l'accord entre deux productions
indépendantes (ici : espace réservé vs texte peint) doit recopier la
formule de référence à la main, jamais déléguer à la fonction qu'elle est
censée mettre en défaut.**

---

## 31. Un attribut de présentation SVG perd contre n'importe quelle règle CSS de classe

`font-size="11"` posé sur un élément depuis le contrat de géométrie
(`disposer()`) est **neutralisé** par une règle de classe qui pose
`font-size` — `.dg-socle-nom { font-size: 10.5px }` gagne toujours contre
l'attribut, quelle que soit la valeur de l'attribut, parce qu'une règle CSS
de classe l'emporte sur un attribut de présentation dans la cascade.

Aucune sonde du bac à sable `vm` (qui relit l'**attribut** posé par le code,
pas le style **calculé**) ne voit cette divergence. Trouvé seulement en
mesurant `getComputedStyle` dans un vrai moteur de rendu (Chromium).

C'est une variante de §25 (mutation neutralisée par la spécificité CSS), mais
côté **attribut contre règle** plutôt que **règle contre règle** : un attribut
de présentation n'a aucune spécificité face à un sélecteur de classe.

**Conséquence directe** : le texte que le contrat réserve comme espace
(taille utilisée pour calculer la largeur à ne pas dépasser) et le texte
réellement peint (taille imposée par la feuille de style) peuvent diverger
sans qu'aucun test basé sur l'attribut ne s'en aperçoive.

**Toute garde sur une taille de texte réellement peinte doit lire le style
calculé (`getComputedStyle`), jamais l'attribut posé par le code.**

## 32. Un compte de cas mesuré dans le clone jetable n'est comparable au dépôt qu'à `docs/` près

Le même fichier de test, octet pour octet identique, comptait **199** cas
dans un clone jetable (§1) et **200** dans le dépôt d'origine. Cause : une
assertion du fichier lit `docs/DESIGN-SYSTEM.md` — que le clone ne copie
jamais, puisque §1 ne clone que `control-center/` et `.claude/agents/`. Le
test qui la porte se **saute en silence** (fichier absent → cas non compté)
au lieu d'échouer bruyamment.

**Une baisse du compte de cas mesurée dans un clone peut n'être que
l'absence d'un fichier hors périmètre du clone, pas une régression.** Avant
de conclure à une régression sur un compte de cas, vérifier si un test du
lot dépend d'un chemin hors de ce que §1 clone.

## 33. Une règle CSS vide ne protège rien, même déclarée « pour la parité »

Supprimer `.dg-graduation{}`, `.dg-liseret{}` ou `.dg-cercle{}` (des règles
sans déclaration, posées pour que la classe existe dans la feuille) ne
faisait échouer **aucun** des 504 cas de test concernés — mesuré par
mutation. Un invariant « toute classe posée par `app.js` est déclarée dans
`app.css`, et réciproquement » affiché en commentaire au-dessus du bloc n'est
**pas** une garde : rien ne l'évalue, il documente une intention.

Ce module porte désormais une garde exécutable pour cet invariant
(`sondePariteClassesDgPoseesEtDeclarees`, `test_app_diagramme.js`) : elle lit
les classes réellement posées par le SVG produit et les classes réellement
déclarées dans la feuille de style, et échoue sur tout écart dans un sens ou
dans l'autre.

**Un invariant énoncé en commentaire n'est une garde que si un test l'évalue
— sinon c'est de la documentation qui peut mentir sans qu'aucune suite ne le
remarque.**

## 34. `_ROUTES_ECRITURE` est la table de routage de `do_POST`, pas une liste sémantique

Un chemin absent de `_ROUTES_ECRITURE` reçoit `404` **avant toute autre
garde** (`server.py`, `do_POST`). Dans ce module, « route d'écriture » ne
veut donc pas dire « route qui écrit sur disque » mais « chemin que
`do_POST` accepte de router ». `POST /api/spec/brouillon` (`feature-008`)
n'écrit rien et figure pourtant dans cette liste : l'en retirer l'aurait
rendu **inatteignable**, pas seulement moins gardé.

Coûté une fois : un rapport d'agent, en appliquant la lecture sémantique, a
conclu à 3 routes d'écriture au lieu de 4 — sans correction, une route
entière aurait été livrée mais jamais atteignable.

## 35. Une campagne de mutation enchaînée en boucle shell rend des verdicts faux

Poser plusieurs mutants à la suite dans une même boucle shell (muter,
mesurer, passer au suivant) fait attribuer l'échec d'un mutant au suivant
si la restauration du précédent n'est pas prise en compte avant la mesure
suivante. Observé **deux fois, par deux agents différents** pendant
`feature-008`.

**Règle** : un mutant se pose, se vérifie par `grep` du marqueur introduit,
se mesure, se retire — **une invocation par mutant**, jamais une boucle qui
enchaîne sans vérification intermédiaire.

## 36. `__pycache__` non invalidé fait servir un `.pyc` muté après restauration du source

Une mutation posée puis retirée rapidement (`cp`/édition/restauration) sur
un même fichier peut laisser Python servir le `.pyc` compilé pendant la
fenêtre mutée, y compris après que le fichier source a été restauré sain —
le verdict de la mesure suivante porte alors sur du code qui n'existe plus
sur disque.

**Parade** : `PYTHONDONTWRITEBYTECODE=1` et purge de `__pycache__` avant
toute mesure qui suit une mutation.

## 37. Muter une garde n'est pas muter ce qu'elle appelle

Deux façons de casser une garde donnent des verdicts de mutation
incomparables :

- **inverser une condition qu'elle appelle** (ex. `chemin_sur()`) casse
  aussi bien le cas hostile que le cas nominal, et meurt souvent pour une
  **mauvaise raison** — le test nominal échoue, pas le test de sécurité ;
- **neutraliser la garde elle-même** (`if False:` sur la fonction qui
  l'applique) n'ouvre **que** le cas hostile, sans toucher au nominal — c'est
  la mutation qui prouve réellement que la garde est tenue.

Sur `feature-008`, trois gardes avaient été déclarées « tuées » par la
première méthode alors qu'aucun test ne les tenait réellement par la
seconde — dont le **confinement** (`vcs.chemin_sur()` sur le chemin final
d'écriture), la garde centrale du module contre une écriture hors de
`todo/`.

## 38. Le bac à sable JS ne connaît que les ids du HTML statique

Une sonde qui cherche un élément par `getElementById` dans le harnais `vm`
(`test_app_*.js`) ne voit que ce qui existe dans le HTML **statique** chargé
au départ. Un élément créé **dynamiquement** par `app.js` (ex.
`#brouillon-contenu` inséré après un changement d'état) rend `null` à
`getElementById`, et une sonde qui ne vérifie pas ce `null` **passe en
silence** au lieu d'échouer — elle ne teste alors rien.

A fait conclure une fois à tort qu'un correctif (flush du débounce avant un
clic) ne fonctionnait pas, alors que le défaut réel était l'absence de
l'élément dans le bac à sable, pas dans le correctif. Distinct de §7 (liste
`IDS` tenue à la main) : ici l'id existe bel et bien dans le code, mais
l'élément qui le porte n'existe pas encore au moment où le bac à sable est
construit.

## 39. Deux limites du bac à sable `vm`/`FakeNode`, mesurées sur `feature-008`

- `appendChild(fragment)` du `FakeNode` de test **ne vide pas** le
  `DocumentFragment` dans le parent, contrairement au DOM réel (où ajouter
  un fragment déplace ses enfants et le laisse vide) : une assertion qui
  compte les enfants du parent après un tel appel compte à tort le
  fragment lui-même comme un seul nœud.
- Un `let`/`const` déclaré au **niveau supérieur** d'un script exécuté par
  `vm.Script.runInContext()` ne devient **jamais** une propriété du contexte
  sandbox — seuls `var` et `function` le deviennent. Un test qui s'attend à
  lire une constante du module sous test comme propriété du sandbox ne la
  trouve pas, silencieusement.

## 40. Un mutant à la syntaxe cassée, derrière un import enveloppé, se lit comme un mutant massivement efficace

Accoler un marqueur de mutation à la **fin** d'une ligne `if …:` casse la
syntaxe du module. Si ce module est importé sous enveloppe
(`try/except BaseException`, `bug-014`), l'appelant bascule silencieusement
sur son repli (`lambda _c: None`) — et **36 tests échouent sur 57**, tous
« attendu X, obtenu None », y compris des tests sans aucun rapport avec la
ligne mutée. Un mutant **correct** posé sur la ligne précédente n'en tue que
**5**, les bons. Écart faux verdict / vrai verdict : 36 contre 5.

**Après toute mutation d'un module importé sous enveloppe, valider la
syntaxe (`ast.parse` ou équivalent) avant de mesurer** — et se méfier d'un
mutant qui tue plus large que sa portée déclarée : c'est le signe qu'il n'a
pas atteint la ligne visée, mais fait tomber le repli d'erreur.

## 41. Dans un clone `cp -a`, un échec de `backend/test_server.py` peut être indépendant du diff

Deux cas de `test_server.py` échouent dans un clone jetable **quel que soit
le diff appliqué** — identiques sur la base HEAD reconstruite dans la même
disposition. Variante de §32 (compte de cas altéré par ce que le clone ne
copie pas), mais ici ce sont des **échecs**, pas un écart de compte.

**Un échec de `test_server.py` observé dans un clone se compare d'abord à
la même base rejouée dans le même clone, avant d'être imputé au diff.**

## 42. Un faux secret « sûr » (court, sous le plafond) peut être écarté par la mauvaise garde

Un test de non-régression utilisait `Pw4x` comme faux secret pour cinq
formes du symptôme de `bug-014`. `Pw4x` est court, donc sous le plafond de
longueur — mais sa majuscule et son chiffre le font écarter par une garde
**en amont** de celle que le test prétend éprouver. Conséquence : **quatre
tests sur cinq n'exerçaient jamais la classe nommée dans le titre du bug**
(« entièrement en minuscules ») — ils passaient au vert pour une raison
étrangère à ce qu'ils affirmaient couvrir. Révélé par mutation (un mutant
qui n'aurait dû tuer aucun test neuf ne tuait effectivement rien), pas par
relecture.

**Un faux secret de test doit être positivement DANS la classe visée par le
titre du bug, pas seulement sous les bornes numériques de la garde — vérifié
en le faisant échouer sur le code d'avant, forme par forme, jamais en bloc.**

## 43. L'épreuve « fichier illisible » (`chmod 000`) est un faux positif quand elle tourne en root

`root` lit un fichier `chmod 000` : une épreuve qui pose ce mode pour
vérifier qu'un import échoue proprement rend un verdict vert **y compris
quand le code ne gère rien**, si l'agent qui mesure tourne en root.

**Exécuter cette épreuve via `runuser -u nobody`, et poser `o+x` sur toute
la chaîne des répertoires parents** (scratchpad compris) — sans quoi
`nobody` ne peut pas non plus traverser jusqu'au fichier, pour une raison
différente mais tout aussi fausse.

## 44. Un `<canvas>` ne garde qu'un seul type de contexte

Sonder plusieurs `getContext()` sur le **même** `<canvas>` (par exemple
`getContext("2d")` puis `getContext("webgl")`, ou l'inverse, pour tester la
disponibilité de plusieurs rendus) rend `null` au second appel — pas parce
que le second type de contexte est indisponible, mais parce que le premier
appel a déjà **figé** le type de ce canevas. Un tel enchaînement conclut à
tort qu'une capacité est absente.

**Une sonde de disponibilité de contexte se fait sur un `<canvas>` neuf par
type sondé, jamais en réutilisant le même élément.**

## 45. Après `nohup … &`, `$!` désigne le shell enveloppant, pas le processus qui écoute

`nohup python3 serveur.py &` (ou toute forme équivalente passant par un
sous-shell) fait que `$!` capture le PID du **shell** lancé par `nohup`, pas
celui de l'interpréteur Python qui tient effectivement le port. `kill $!`
tue alors ce shell — le processus qui écoute reste vivant, le port reste
pris, et un fichier neuf déposé ensuite semble **ne jamais devenir
servable**, alors que le vrai serveur tourne encore sur l'ancien code.
Variante de §3 (« tout arrêt de processus vise un PID capturé, jamais un
motif ») : §3 dit de ne pas viser un motif, mais ne dit pas que `$!`
peut lui-même désigner le **mauvais** processus dans ce cas précis.

**Parade** : vérifier ce qui tient réellement le port avant de conclure —
`ss -ltnp | grep ':<port>'` — plutôt que de faire confiance à `$!` après un
`nohup … &`.

## 46. Le serveur relit `web/` à chaque requête mais fige ses routes au démarrage

Distinct de §8 (qui ne parle que d'un **fichier neuf** sous `web/`, 404
jusqu'à relance) : ici, une route **existante** du backend (`do_GET`/`do_POST`)
peut rendre 404 alors que le fichier qu'elle est censée servir existe bel et
bien. Cause : les fichiers statiques sont relus sur disque à chaque requête,
mais la table de routage elle-même est calculée une fois, au démarrage
(`server.py`, `demarrer()`). Un commit qui ajoute une route dans `server.py`
laisse donc le frontend en avance sur le backend tant que le serveur n'a pas
été relancé — le symptôme (404 sur une route qu'on vient d'écrire) ressemble
à une faute côté frontend, alors que c'est le serveur en mémoire qui est
périmé.

**Après tout commit touchant `server.py`, relancer le serveur avant de
mesurer quoi que ce soit contre lui** — la même discipline que §8, mais pour
les routes, pas seulement pour les fichiers statiques.

## 47. Mesurer en root ne mesure pas la CI

Root lit un fichier dont le mode interdit la lecture à son propriétaire :
`open()` franchit les permissions de fichier pour lui, pas pour un compte
normal ni pour la CI. Une suite lancée en root peut donc rendre un verdict
**vert** sur un comportement que tout autre exécutant verrait **rouge**, sans
qu'aucun message ne le signale — ni l'un ni l'autre des deux verdicts n'est
faux en soi, ils mesurent simplement des choses différentes.

**Coûté sept runs de CI d'affilée** (`bug-018`) : la suite était verte en
local à chaque cycle, rouge en intégration continue depuis le commit qui a
introduit `jeton.py`, et trois lots ont été livrés dans cet intervalle sans
que personne ne le voie.

**Tout compte de cas produit pour ce module doit dire sous quelle identité il
a été obtenu.** « 1887 cas, 0 échec » ne veut rien dire seul ; « 1887 cas,
0 échec, en root » et « 1883 cas, 0 échec, sous `nobody` » sont deux mesures
distinctes, et c'est l'écart entre les deux (ou son absence) qui est
l'information. Lancer sous les deux identités : voir §43 et
`tools/lancer_suite_control_center_non_root.sh`.

## 48. `while … done < fichier` partage son `stdin` avec ce qu'il lance

Une boucle shell qui lit la liste des fichiers à traiter depuis son entrée
standard (`while read f; do … done < liste.txt`) partage cette même entrée
standard avec **tout ce qu'elle lance à l'intérieur**. Si un test invoqué
dans la boucle lit `stdin` — même sans en avoir l'air, même sans y toucher
explicitement — il avale le reste de la liste, et les fichiers suivants ne
sont **jamais exécutés**. Rien ne le signale : la boucle se termine
normalement, le job annonce le nombre de fichiers **découverts**, pas le
nombre réellement **exécuté**, et sort en code 0.

**Coûté une fois** (correctif de `bug-019`, dans le correctif lui-même) :
4 fichiers découverts, 2 seulement exécutés, sortie « ✅ 4 fichier(s) …
tous verts », code 0 — un faux vert produit par le code écrit pour corriger
un faux vert.

**Parade double** : rediriger l'entrée standard de chaque invocation vers
`/dev/null` (`python3 "$fichier" < /dev/null`), **et** comparer le nombre de
fichiers réellement exécutés au nombre découvert — faire échouer le job s'ils
diffèrent. Annoncer un compte qu'on n'a pas réellement lancé est exactement
le défaut qu'une découverte automatique est censée fermer ; la boucle qui la
met en œuvre peut le reproduire sous une forme différente si son `stdin`
n'est pas isolé.

## 49. Le README de l'image runner GitHub porte deux listes Python distinctes

`ubuntu-latest` (image `ubuntu-24.04` au moment de `bug-018`) documente à la
fois le **logiciel système** (la version de `python3` réellement invoquée
sans configuration explicite) et un **cache d'outils** pré-téléchargé mais
**inactif tant qu'aucun `actions/setup-python` ne l'active**. Les deux listes
citent des versions différentes, et confondre l'une avec l'autre donne la
mauvaise version de Python — donc un diagnostic inversé sur tout défaut dont
la cause dépend de la version exécutée.

**Coûté une fois** (`bug-018`, défaut B) : sans le job de matrice qui active
`setup-python`, la CI exécute le Python **système**, pas la dernière entrée
du cache d'outils. Établir la version réellement en jeu exige de lire la
bonne liste, jamais l'autre par défaut.

## 50. Une garde de CI qui lit un fichier YAML se contourne par un élément de plus

Chercher un texte dans le YAML d'un workflow (`re.search`, `grep`) prouve
qu'un texte y est présent ou absent — jamais ce que le job **fait**
réellement une fois lancé. Sur `bug-022`, une garde de partitionnement
(« le job système exécute tout, le job matrice filtre les harnais
navigateur ») a survécu à **quatre versions successives**, chacune tuée par
un mutant mesuré : un motif de ligne (`re.search("grep -qx …") is None`,
tué par une découverte réécrite en `xargs grep -Lx` — les trois harnais
tombaient à **zéro exécution**, garde verte) ; puis deux checks de
« propriété » qui n'étaient qu'une énumération de syntaxes d'exclusion
supplémentaires (`if`/`else` sans `continue`, second `mapfile`) — même
conséquence, même garde verte.

**Coûté quatre reboucles** avant que la méthode change : la garde
**exécute** désormais le bloc `run:` réel du job (`bash -c`, `cwd` sur une
arborescence factice de témoins) et compare ce qui a **effectivement**
tourné, plutôt que de lire une syntaxe particulière d'exclusion. Toute garde
de CI qui vérifie « ce script exclut-il X » doit comparer un résultat
d'exécution, jamais une forme de texte — une énumération de motifs se
contourne toujours par un motif de plus qu'elle ne connaît pas encore.

## 51. Un oracle comportemental ne vaut que le jeu de témoins qui le traverse

Remplacer une garde par motif par une garde qui **exécute** ne suffit pas :
l'oracle neuf de `bug-022` (§50) comparait ce qui tourne réellement, mais
avec 4 témoins il restait aveugle à une exclusion par **nom de fichier**
(le seul témoin marqué s'appelait `test_marque.py` — aucun témoin ne
croisait la dimension « nom ») : deux harnais sur trois tombaient à zéro
exécution, garde verte 46/46. Un 5ᵉ témoin a ensuite fermé une exclusion
par **contenu** (`grep -q chromium`), également invisible aux 4 premiers.

**Coûté deux mutants qui ont survécu chacun à une version antérieure de
l'oracle avant d'être trouvés.** Les témoins d'un oracle comportemental
doivent croiser **toutes les dimensions que le critère retenu distingue de
ses alternatives explicitement écartées** — ici le critère est le marqueur,
les alternatives écartées en conception étaient le nom de fichier et le
contenu, et ce sont exactement les deux dimensions par lesquelles l'oracle
a été contourné avant correction.

## 52. PIEGES §48 (partage de `stdin`) ne concerne que `while read … done < fichier`

§48 documente qu'une boucle shell lisant sa liste de fichiers depuis
`stdin` (`while read f; do … done < liste.txt`) partage cette entrée avec
tout ce qu'elle lance, et peut donc sauter des fichiers en silence. **Cette
forme précise est seule concernée.** Un `for … in "${tableau[@]}"` itérant
sur un tableau rempli par `mapfile` (`mapfile -t fichiers < <(find …)`,
`for f in "${fichiers[@]}"`) est immunisé **par construction** — mesuré
3/3 : rien dans cette boucle ne lit `stdin`, donc rien ne peut le partager.

**Coûté une transposition de parade sans vérifier que le défaut existe dans
la forme cible** (`bug-022`, étape 8) : la parade `< /dev/null` et la
comparaison exécutés/découverts de §48 ont été ajoutées au job GitHub « là
où elles manquaient », sur la conviction que toute boucle de découverte de
tests méritait la même parade. Le `< /dev/null` reste une défense en
profondeur utile, mais dans cette forme la comparaison exécutés/découverts
qui l'accompagnait était **tautologique** — rien ne pouvait la faire
échouer. **Avant de transposer une parade d'un piège à un autre endroit,
vérifier que la forme syntaxique qui cause le défaut original est bien
celle du code cible**, pas seulement que le symptôme final (« des fichiers
non exécutés en silence ») semble analogue.

## 53. Un bloc `run:` de workflow GitHub s'exécute tel quel, hors CI

Un job GitHub Actions n'a pas besoin de tourner en CI pour être observé :
son bloc `run:` est un script shell ordinaire, lançable avec
`subprocess.run(["bash", "-c", bloc], cwd=<arborescence factice>)`. C'est ce
qui a permis, sur `bug-022`, de remplacer une garde par motif de texte (§50)
par une garde comportementale d'une vingtaine de lignes, déterministe, sans
réseau et sans dépendance CI — en déposant quelques fichiers témoins sous un
répertoire temporaire imitant `control-center/web/` et en lisant ce que le
job a réellement imprimé.

**Su plus tôt, cette possibilité aurait évité les deux reboucles qui ont
précédé le changement de méthode** (§50) : le bloc `run:` n'a pas besoin
d'être *lu* pour être vérifié, il peut être *lancé*. Vérifier un job GitHub
par exécution locale de son `run:`, avant de se rabattre sur une lecture de
motif, dès qu'un désaccord entre « ce que le YAML dit » et « ce que le job
fait » est envisageable.

## 54. Un oracle AST qui cherche un littéral peut se détecter lui-même

`test_ci_partition_navigateur.py` détecte un harnais navigateur par AST en
cherchant, entre autres, la constante de chaîne `"--headless"` — et ce
fichier de garde doit lui-même contenir ce littéral pour l'implémenter.
Appliqué à lui-même sans précaution, l'oracle se classerait comme un
lanceur de navigateur, alors qu'il n'en lance aucun : un faux positif de sa
propre lecture de son propre source, pas un fait sur ce que la CI exécute.

**Tout module de garde qui recherche par AST ou par motif un littéral
associé au défaut qu'il surveille doit explicitement s'exclure de sa propre
analyse**, plutôt que de compter sur le hasard de son organisation interne
(ordre des définitions, nom de variable) pour ne pas se détecter lui-même.

## 55. Le sélecteur universel `*` ne couvre pas les pseudo-éléments

`* { animation: none !important }` **n'arrête pas** une animation posée sur
`::before` ou `::after`. Mesuré au navigateur (Chromium,
`--force-prefers-reduced-motion`, lot 8 de `feature-021`) : un `animation`
sur `.agent-node::before` **survit intégralement** au bloc universel, alors
que le même test sur un élément réel confirme que `*` l'arrête bien.

C'est la règle CSS, pas un bogue : un pseudo-élément n'est pas un élément, et
`*` ne sélectionne que des éléments. Il faut écrire `*, *::before, *::after`.

**Pourquoi ça compte ici.** Le bloc `@media (prefers-reduced-motion: reduce)`
est un engagement d'accessibilité. Écrit avec `*` seul, il en donne
l'apparence et laisse tourner tout ce qui est peint sur un pseudo-élément —
et l'anneau d'activité du diagramme l'est, précisément pour ne pas faire
tourner le sigle avec le disque.

**Et aucune garde statique ne peut le voir** : une garde qui vérifie la
*présence* du bloc, ou qui lit le *texte* de la règle, le trouve conforme.
Seul un harnais qui **mesure l'`animation-name` calculé** sous
`--force-prefers-reduced-motion` l'établit. C'est le même patron que §30 —
une garde qui vérifie le mécanisme et non le résultat.

## 56. Un drapeau de durcissement du binaire peut retirer la source des identifiants

`claude --restricted` et `--bare` répondent **« Not logged in · Please run
/login » avec `rc=0` et un JSON parfaitement formé**. `--restricted` ignore
les fichiers de réglages, `--bare` saute les lectures de trousseau — or c'est
là que vivent les identifiants. Le durcissement **supprime l'authentification**.

Ce n'est pas un bogue du binaire : un drapeau qui retire les *settings*
retire l'auth qui y vit.

**Conséquence de test, et c'est elle qui coûte** : un harnais qui vérifie
« le processus a répondu », ou « le code de retour est 0 », ou « la sortie est
du JSON valide », est **vert à tort** — il mesure un agent qui n'a rien fait.
Exiger un message `assistant` **à contenu non vide** et **l'absence du motif
de connexion** dans le résultat.

Vaut pour toute commande lancée par le centre de contrôle : un lancement qui
« réussit » sans agent connecté consomme le verrou d'écrivain et journalise
une fin propre pour un cycle qui n'a rien produit.

## 57. `git rm` supprime en CASCADE tout répertoire parent devenu vide

Retirer le dernier fichier d'un répertoire ne supprime pas seulement ce
répertoire : git remonte et efface **tout parent qui devient vide à son tour**.

Mesuré dans un dépôt jetable — une seule spec, une seule commande :

```
avant   specs/  specs/features/  specs/features/todo/
git rm specs/features/todo/feature-900-seule.md
après   (plus rien)
```

`specs/` **entier** a disparu, pas seulement `todo/`.

**Pourquoi ça compte ici.** Le cockpit sait supprimer une spec. Supprimer la
dernière d'une colonne fait perdre la colonne au kanban ; supprimer la dernière
du dépôt fait perdre **l'arbre que `check_specs.sh`, `lister_specs` et le kanban
tiennent pour acquis**. Le retour arrière (`git checkout <sha> -- <chemin>`)
recrée le chemin, donc l'état est récupérable — mais entre les deux, des
composants lisent un dépôt dont le socle n'existe plus.

**Et aucun test ne le voit par construction** : chaque groupe de test garde
d'autres specs dans `todo/`, donc le répertoire ne devient jamais vide. Il faut
un cas qui supprime **la dernière**, sinon le comportement reste invisible.

## 58. Mesurer un arbre pendant qu'un autre agent y écrit produit un faux « flaky »

Deux agents lancés en parallèle sur le **même arbre de travail** produisent des
signaux qui ressemblent à de l'instabilité et n'en sont pas. Constaté deux fois
dans le même cycle, avec deux symptômes différents :

- un clone `cp -a` pris à 19:51:13 **a manqué deux fichiers** créés à 19:51 et
  19:52 par un pair — le compte annoncé était un minorant, découvert seulement
  en comparant la liste du clone à celle du dépôt ;
- une suite lancée pendant qu'un pair réécrivait `web/` a rendu **2 échecs**
  qualifiés de « flaky d'un run à l'autre ». Rejoués une fois le pair terminé :
  **8 exécutions, 8 vertes**. Il n'y avait aucune instabilité — l'arbre bougeait
  sous la mesure.

**La parade n'est pas de relancer jusqu'à obtenir du vert**, c'est de savoir qui
écrit. Avant de conclure à une régression ou à une instabilité, établir qu'aucun
pair ne travaille dans le même arbre. Et **séquencer** les lots qui touchent les
mêmes fichiers plutôt que de les paralléliser : `backend/` et `web/` sont
disjoints, deux lots qui réécrivent tous deux `app.css` ne le sont pas.

⚠️ Corollaire : un total de suite mesuré pendant un travail concurrent **n'est
pas reproductible**, et toute comparaison ultérieure à ce chiffre conclura à
tort. Un écart inexpliqué se vérifie d'abord contre *qui écrivait*, avant d'être
imputé au code.

## 59. Un préfixe devant l'identifiant annule le témoin de traversée classique

Quand un chemin se compose `<racine>/<prefixe><identifiant><suffixe>`, le
témoin habituel `../../etc/passwd` **ne s'échappe pas** — parce que
`prefixe..` n'est pas littéralement `..`, et que `realpath` ne le traite donc
pas comme un composant de remontée.

Mesuré, avec le motif `agent-%s.jsonl` :

```
agent_id = "../../etc/passwd"          →  <racine>/subagents/etc/passwd.jsonl   CONFINÉ
agent_id = "x/../../../../etc/passwd"  →  /etc/passwd.jsonl                     S'ÉCHAPPE
agent_id = ".."                        →  <racine>/subagents/agent-...jsonl     CONFINÉ
```

Seul un `/` **intercalé** réintroduit un `..` **pur** comme composant séparé,
et c'est celui-là qui sort.

**Conséquence de test, et c'est elle qui coûte** : un test de confinement bâti
sur le témoin classique reste **vert même quand on retire entièrement la
garde**. Il ne prouve rien, et il inspire confiance. Le cas a été trouvé en
retirant vraiment la garde et en observant que le test ne bronchait pas —
jamais en le relisant.

**Règle** : un témoin de traversée se **vérifie**, il ne se suppose pas.
Construire le chemin final avec le témoin, appeler `realpath`, et **constater
qu'il sort de la racine** — avant de s'en servir comme preuve. Un témoin qui
ne s'échappe pas ne teste que lui-même.

## 60. Un ratio de cases cochées n'est pas une mesure d'avancement

Une spec Markdown porte des cases `- [ ]`/`- [x]` à plusieurs endroits qui ne
sont **pas** des livrables : les blocs « Domaines touchés », « Agents
requis », les cases de gabarit non retirées. Compter « cases cochées / cases
totales » dans le fichier entier, dans l'idée d'en tirer un pourcentage
d'avancement honnête (par opposition à un chiffre inventé), mesure en
réalité **la forme du document**, pas le travail fait.

Mesuré (lot 9 de `feature-021`, cycle 2) : une spec **jamais commencée**
rend **36 %** par ce calcul — les cases des blocs de méta-données, cochées
dès la rédaction de la spec, gonflent le numérateur sans qu'aucun livrable
n'existe encore.

**Conséquence** : ce ratio est aussi trompeur qu'un pourcentage inventé de
toutes pièces — il a seulement l'apparence d'une donnée réelle, ce qui le
rend plus dangereux à afficher, pas moins. `control-center/web/app.js`
(`.progress-track`) l'a écarté au profit d'une grandeur discrète et déjà
fiable : l'état de colonne de la spec (première / intermédiaire /
dernière), à largeur fixe, décorative.

**Règle** : si une grandeur mesurée dans un document texte doit alimenter un
indicateur, vérifier qu'elle isole les cases qui sont **réellement** des
livrables (une section dédiée, un marqueur distinct) — jamais compter sur
la structure entière d'un gabarit partagé par toutes les specs.

## Voir aussi

- `docs/DESIGN-SYSTEM.md` — règles de couleur, de surface et de typographie
- `docs/adr/` — les décisions et ce qu'elles ferment
- `control-center/README.md` — configuration et déploiement
