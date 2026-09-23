# Bug — Un lien de documentation cassé disparaît du compte au lieu de faire échouer le contrôle

- **Type** : bug (format minimal `specs/modele.md`)
- **Version cible** : [à fixer par l'agent qui reprend cette spec]
- **Statut** : todo
- **Créée** : 2026-09-21 (trouvé en exécutant, pendant l'étape 9 du lot 4 de `feature-021`)
- **Domaine** : outillage d'hygiène (`tools/check_doc_links.sh`), lancé **en local ET en CI**
- **Spec liée** : aucune — défaut propre à l'outil, sans rapport avec `feature-021`

## Agents requis

- [x] architect — le correctif implique de choisir ce qui fait foi (voir « Question ouverte »)
- [x] backend-developer
- [x] test-engineer
- [x] code-reviewer
- [ ] doc-writer — seulement si le contrat de l'outil change visiblement
- [ ] security-reviewer — sans objet : ni auth, ni données, ni permissions

## Symptôme observé

`./tools/check_doc_links.sh` valide les liens **qu'il sait reconnaître**. Un lien dont
la syntaxe Markdown est cassée — le cas réel : une URL coupée par un retour à la ligne
entre `(` et `)` — **cesse d'être un lien à ses yeux**. Il ne le signale pas : il ne le
compte plus, et rend un ✅.

Mesuré le 2026-09-21 sur le dépôt réel, en coupant volontairement un lien de
`docs/DESIGN-SYSTEM.md` :

| État | Sortie |
|---|---|
| Sain | `✅ 191 lien(s) relatif(s), toutes les cibles existent.` |
| **Un lien coupé en deux lignes** | `✅ 190 lien(s) relatif(s), toutes les cibles existent.` |
| Restauré | `✅ 191 lien(s) relatif(s), toutes les cibles existent.` |

Le contrôle **passe**, en CI comme en local, et la seule trace est un compte qui baisse
de 1 — que personne ne surveille, puisque aucun attendu n'est déclaré.

## Comment il a été trouvé

Pas par relecture. Un sous-agent réécrivant `docs/DESIGN-SYSTEM.md` a cassé un lien
`[ADR-0031](…)` en le coupant sur deux lignes, puis a remarqué que le compte était
**passé de 192 à 190 alors qu'il venait d'ajouter des liens**. C'est la **direction** du
chiffre qui l'a alerté, pas l'outil. L'agent principal a ensuite reproduit le défaut
délibérément, sur un autre lien, pour vérifier qu'il n'était pas propre à ce cas.

## Cause racine

L'outil part des liens **détectés** et vérifie que chaque cible existe. La propriété
qu'il établit est donc « tout lien reconnu résout » — jamais « tout lien voulu est
reconnu ». Un lien mal formé sort de l'ensemble vérifié au lieu d'y échouer : il
s'évanouit du périmètre au lieu de le violer.

C'est le même patron que trois défauts trouvés pendant `feature-021` (`PIEGES §30`) : une
garde établit une propriété sur ce qu'elle sait voir, et ce qui disparaît lui est
invisible. Voir aussi `PIEGES §21` — une grandeur dérivée sans attendu déclaré ne protège
de rien.

## Question ouverte pour l'architecte

Deux familles de correctif, qui n'ont pas la même portée :

1. **Détecter la syntaxe cassée** — repérer un `](` sans `)` fermante sur la même ligne,
   un `[` non apparié, une parenthèse déséquilibrée. Cible le cas mesuré, mais reste une
   énumération de formes défaillantes : la prochaine forme non prévue passera encore.
2. **Déclarer un attendu de compte**, à la manière du registre `ATTENDU_ROUGE` de
   `feature-021` : le nombre de liens est une grandeur dérivée, donc elle se **surveille**.
   Toute baisse non déclarée échoue. Plus général, mais demande de tenir l'attendu à jour.

⚠️ Une solution qui **énumère les syntaxes fautives** reproduirait exactement le défaut
qu'elle corrige. Le cycle `bug-022` a déjà appris cette leçon sur ce dépôt : la garde n'a
tenu qu'une fois qu'elle a cessé d'énumérer des syntaxes pour **exécuter** et observer.

## Critères d'acceptation

- [ ] Un lien Markdown cassé **fait échouer** `check_doc_links.sh`, avec le fichier et la
      ligne nommés
- [ ] Le cas exact mesuré ci-dessus (URL coupée entre `(` et `)`) est couvert par un test
- [ ] **Au moins deux autres formes de cassure** sont couvertes, choisies pour ne PAS être
      celle du correctif — sinon la garde ne vaut que pour l'exemple qui l'a motivée
- [ ] **Validation par mutation** : casser un lien dans un fichier de `docs/` fait échouer
      le contrôle ; la suite doit être vue **rouge** avant d'être verte
- [ ] Aucun faux positif sur les 191 liens actuels du dépôt

## Hors périmètre

Les liens **absolus** (`http://`, `https://`) : l'outil ne les vérifie pas aujourd'hui, et
c'est un choix distinct — aucune vérification réseau en CI. Ne pas l'élargir ici.
