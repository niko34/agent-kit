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

Le clone doit contenir **`control-center/` ET `.claude/agents/`**. La racine des
données dérive de l'emplacement de `server.py` : **un clone partiel écrit dans le
vrai journal.**

> Coûté une fois : un test a échoué pour une mauvaise raison, et le diagnostic a
> porté sur le mauvais défaut.

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

## Voir aussi

- `docs/DESIGN-SYSTEM.md` — règles de couleur, de surface et de typographie
- `docs/adr/` — les décisions et ce qu'elles ferment
- `control-center/README.md` — configuration et déploiement
