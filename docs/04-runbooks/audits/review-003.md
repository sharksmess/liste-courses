# Relecture code — tranche 003 (la liste de courses)

Branche `slice/003-liste-courses`, diff `git diff main...HEAD`, relu jusqu'a `0aa876f` (21 commits). Relecture statique du depot : je n'ai lance ni `pnpm test` ni le serveur. Seule execution : un script Node de quelques lignes sur la `zod` du depot (voir « Points demandes »). Les mutations evoquees ci-dessous sont raisonnees, pas executees. Resultats de suite transmis par l'orchestrateur et confirmes sur les journaux : 26 fichiers, 375 tests, 108,55 s (`.logs/003-impl-1.log`), `check` propre (`.logs/003-impl-check.log`). Mes affirmations sur l'executeur de Postgres viennent de ma connaissance de `ExecUpdate`, et concordent avec la mesure du journal ; je ne les ai pas rejouees.

## Synthese
Aucun constat BLOQUANT. Le code est conforme au contrat, a l'ERD §3.5, §4.1, §4.8, §4.9 et a `items.ts`. Chaque AC a au moins un test qui echouerait sur son defaut principal.

L'AC8 reste prouve apres 29302b2. En revanche, la phrase de l'ERD §5 corrigee en meme temps, « sous la borne, l'ajout attend le verrou du foyer tenu par la suppression », n'est plus observee par aucun test.

Les autres reserves sont : une puce d'AC1 sans preuve (departage par `id`), le cablage client sans preuve, un `throw` place apres le `COMMIT` qui deviendra atteignable en 004, et trois oublis de documentation.

## BLOQUANT
Aucun.

## A CORRIGER

### 1. ERD §5 : l'attente d'un ajout sur une suppression n'est plus observee, et le journal s'appuie sur un test qui ne la couvre pas
- **Emplacement** : `docs/02-architecture/ERD.md:647-648` ; `tests/items/limit-concurrency.test.ts:164` (test remplace), `:91`, `:106` ; `docs/03-slices/003-progress.md:24`.
- **Constat** :
  - Avant 29302b2, seul ce test observait une suppression qui bloque un ajout. Il attendait ce blocage a 200 articles, ce qui etait faux.
  - La correction a deplace la garantie « sous la borne » dans l'ERD, sans test equivalent a 199. `waitUntilBlockedOnLock` n'a plus qu'un appel dans la suite des articles (`:146`), pour ajout contre ajout.
  - Le journal justifie l'attente par « le test voisin, a 199, est vert ». Ce voisin (S1) oppose deux ajouts et aucune suppression.
  - Les scenarios `:91` (suppression et ajout) et `:106` (deux suppressions) partent d'un `Promise.all` sans preuve de chevauchement, c'est-a-dire le defaut releve par review-002, point 1. Une execution sequentielle donne le meme resultat attendu.
- **Consequence** : la phrase de l'ERD et « pas d'interblocage » tiennent a la lecture (je ne vois pas de cycle : l'ajout ne verrouille aucune ligne `item` existante, le `FOR KEY SHARE` de la cle etrangere est compatible avec le `FOR NO KEY UPDATE` du compteur). Aucune execution du depot ne les etablit. Pour `:106`, une implementation « lire, puis supprimer sans verifier `rowCount` » ne serait detectee que si les transactions se chevauchent.
- **Pourquoi pas BLOQUANT** : ces garanties ne sont pas des puces d'AC, et le code est juste sous tous les entrelacements que j'ai deroules.
- **Direction** : ajouter a `limit-concurrency.test.ts` deux scenarios deterministes sur `openAppTx` : a 199 articles, suppression non commitee, ajout bloque (`waitUntilBlockedOnLock`), COMMIT, ajout reussi, 199 ; meme article, seconde suppression bloquee, COMMIT, `rowCount` 0, compteur decremente une fois. Corriger la citation du journal.

### 2. AC1 : le departage par `id` n'est pas prouve
- **Emplacement** : `apps/web/src/lib/items.ts:67` ; `tests/items/list.test.ts:65`.
- **Constat** : l'AC1 exige « `created_at` puis `id` croissants ». Tous les tests d'ordre utilisent des transactions distinctes, donc des `created_at` differents.
- **Consequence** : le mutant `ORDER BY created_at` reste vert. Sur des horodatages egaux, l'ordre deviendrait celui du plan, instable d'un rechargement a l'autre. La note du contrat interdit de prouver l'*ordre d'ajout* dans une meme transaction, pas de prouver le tri par `id`.
- **Direction** : amorcer quelques articles par `seedItems` (meme `created_at`), puis exiger que `GET` les rende par `id` croissant, sans rien affirmer sur l'ordre d'ajout. Une assertion, cout faible.

### 3. `addItem` : le `throw` est apres le `COMMIT`, et l'invariant cesse d'en etre un en 004
- **Emplacement** : `apps/web/src/lib/items.ts:97-108`, `:7-8` ; note du contrat `docs/03-slices/003-liste-courses.md:141` ; ERD §5 (« Ajout d'un article concurrent au retrait de son auteur »).
- **Constat** :
  - `add_item` et la relecture sont deux instructions en `READ COMMITTED`, chacune avec son instantane. Si le retrait du membre commite entre les deux, `lc.current_household_id()` rend `NULL`, la relecture rend zero ligne, `withUser` commite, puis le `throw` de la ligne 108 part hors de la transaction.
  - Meme fenetre, sans dommage, dans `inHousehold` : un retrait entre le `SELECT` et l'`UPDATE` donne `ITEM_NOT_FOUND`. L'en-tete (« un compte sans foyer n'obtient jamais 404 ») et la note du contrat (« sans fenetre ») sont donc trop forts. La coupure, elle, tient : la RLS s'applique a l'ecriture.
  - La branche `case "LC009"` (`:114`) n'est atteignable que dans cette meme fenetre, et aucun test ne l'exerce.
- **Consequence** : aujourd'hui inatteignable, aucun depart n'existant avant 004. En 004 : un 500 pour un article bel et bien enregistre, sur un cas que l'ERD accepte, et un `throw` hors des invariants prevus par CLAUDE.md.
- **Direction** : traiter l'absence de ligne dans la transaction, comme erreur typee `NO_HOUSEHOLD`, en choisissant explicitement entre annuler et garder l'article (l'ERD §5 l'accepte). A defaut, l'inscrire au backlog de 004. Ramener l'en-tete a ce qui est vrai : une reponse 404 dans cette fenetre est possible, l'ecriture jamais.

### 4. Cablage client : aucune preuve, alors qu'une partie est extractible a faible cout
- **Emplacement** : `apps/web/src/ui/item-list.tsx:20-27`, `apps/web/src/ui/add-item-form.tsx:20-23`, `apps/web/src/ui/requests.ts:33-39`.
- **Constat** :
  - Par lecture, tout est juste : chemins et methodes, cle `purchased`, DELETE sans corps, `form` capture avant l'`await`, message conserve au rechargement car l'etat vit dans `ItemList`, `import type` sans fuite de `pg` vers le client.
  - Aucun test n'importe `ui/requests` ni n'exerce `mutate`. Tous les tests passent par l'API directe, et `send` envoie toujours `Content-Type`, ce que ne fait pas le DELETE du client.
  - La regle de la note du contrat (`outcome.ok || code === "ITEM_NOT_FOUND"` declenche le rechargement) n'a pas de preuve. Le `payload: unknown` de `postJson` laisse passer une faute de cle dans `name` ou `quantity`.
- **Consequence** : D-059 admet ce residuel jusqu'a la visite guidee, ce n'est donc pas un ecart. Mais une faute y garderait la suite verte jusqu'apres 004. Review-002 (point 8) avait obtenu `joinErrorMessage` pour le meme motif.
- **Direction** : extraire la decision apres mutation dans une fonction pure testee, comme en 002. Typer les corps envoyes sur l'entree des contrats (`z.input`), pour une preuve a la compilation. Declarer le reste dans la fiche, voir « A traiter a la cloture ».

### 5. Decision « `(corps)` sur PATCH » non epinglee, et lecture de l'AC6 a trancher
- **Emplacement** : `tests/items/toggle-delete.test.ts:82-87` ; `apps/web/src/app/api/household/items/[itemId]/route.ts:22` ; `docs/03-slices/003-progress.md:43`.
- **Constat** : le journal decide `fields: ["(corps)"]` pour un corps illisible ou non objet. Le test ne verifie que le statut 422 et le code ; aucun cas `null`, `[]` ou chaine n'existe sur PATCH, contrairement a POST (`add.test.ts`). Or l'AC6 dit « `purchased` absent [...] donne `422` avec `fields` contenant `purchased` », et un corps absent peut se lire ainsi. Le contrat ne le precise que pour `POST`.
- **Consequence** : la decision peut s'inverser sans qu'un test le signale, et l'ecart de lecture avec l'AC6 n'est visible que dans le journal.
- **Direction** : exiger `["(corps)"]` et ajouter `null` et `[]`. Reprendre la lecture au registre.

### 6. `FRICTION.md` ne contient pas les incidents de la tranche
- **Emplacement** : `docs/04-runbooks/FRICTION.md` (une seule ligne ajoutee) ; `docs/04-runbooks/autonomous-run-2026-11-05.md:34`, `:37`, `:39`, `:40`.
- **Constat** : `rules/documentation.md` place tout incident ou friction dans `FRICTION.md`, « au moment ou il survient ». Sont restes au seul journal de passage : l'arret du `test-writer` (« no progress for 600s »), le `typecheck` de plus de 180 s bascule en arriere-plan, trois tests impossibles a satisfaire, renvoyes deux fois de l'implementeur au `test-writer`.
- **Consequence** : l'usine perd ses retours. Le dernier cas est le plus instructif : un test deduit d'une phrase fausse de l'ERD a arrete un passage autonome.
- **Direction** : ajouter ces lignes.

### 7. Backlog non mis a jour apres la factorisation
- **Emplacement** : `docs/03-slices/000-backlog.md:78`, absent du diff.
- **Constat** : l'entree « `readJson` et squelette de `POST` recopies » reste ouverte. La tranche a extrait `readJson` et `failedFields`, pas le squelette, qui se recopie maintenant dans deux routes de plus.
- **Consequence** : le backlog dit que tout reste a faire, ce qui est faux, et ne dit pas ce qui reste vraiment.
- **Direction** : reduire l'entree au squelette, ou la clore avec une decision.

## SUGGESTION

### 8. Test S2 : echec peu lisible et portee plus forte que le contrat
- **Emplacement** : `tests/items/limit-concurrency.test.ts:176-182`.
- Si l'ajout venait a bloquer, `await settle(...)` attendrait jusqu'au `testTimeout` (20 s) avec `txA` ouverte, donc verrou tenu pendant la fin du fichier, et sans message utile. Une garde `Promise.race` avec un delai court donnerait un echec net, comme en S1 (`:147`).
- Le test fige un detail de l'executeur (« mesure sur Postgres 16 »). La CI est bien sur `postgres:16`, mais une montee de version ou l'option 2 ecartee le ferait echouer sans violer l'AC8. Le preciser en commentaire suffit.

### 9. Client, details pour la visite ou le backlog de 004
- **`NO_HOUSEHOLD`** (`ui/messages.ts`, `ui/item-list.tsx:26`, `ui/add-item-form.tsx:30`) : absent des messages et sans rechargement. En 004, une personne retiree verra « Une erreur est survenue. Reessayez. » sans etre redirigee, alors que `router.refresh()` la menerait a `/no-household`.
- **`pendingId` unique** (`item-list.tsx:18`) : deux lignes en vol, et la premiere reponse reactive la seconde.
- **Fenetre entre `setPendingId(null)` et la fin du `refresh`** : les boutons sont actifs sur une liste perimee. Un second clic sur « Supprimer » y afficherait « Cet article n'existe plus ». `useTransition` couvrirait le rechargement.
- **Case controlee** : elle revient a l'etat precedent jusqu'au rechargement. Sans danger, a regarder a la visite.
- **Erreur de liste** : elle reste affichee apres un ajout reussi par `AddItemForm`.

### 10. Meme mecanisme sur `member_count` pour 004
- **Emplacement** : ERD §5, « Liberation ».
- Un `join_household` a 10 membres, pendant un depart non commite, recevra `LC004` immediatement, pour la raison corrigee ici. Le contrat de 004 devrait l'ecrire d'emblee, pour ne pas refaire ce detour.

### 11. Assertions sans portee et bruit de test
- `tests/db/item-functions.test.ts:358` : lecture apres annulation, toujours vraie. Le titre « lc_app ne peut pas le contourner » est prouve ailleurs (`:180`), pas ici.
- `tests/isolation/items.test.ts:145-146` : meme cas. La preuve reelle est `rowCount: 0`, et les lignes suivantes ne doivent pas etre prises pour elle.
- `tests/items/toggle-delete.test.ts:73` : `patchItem` de preparation sans verification de statut.
- `tests/items/add.test.ts:131` : `Math.abs(label.length)` n'a pas d'effet.
- `tests/db/item-functions.test.ts:146` : commentaire en forme de question.
- `tests/helpers/items.ts:8-9` : en-tete perime, la migration existe.

### 12. Documentation de detail
- `docs/03-slices/003-progress.md:8` : « Dernier commit » s'arrete a `f65862a`, deux commits de journal plus loin.
- `003-progress.md:47` : le contexte non remis a vide sur `LC008` est une nuance de l'ERD §4.1, point 3, ecrite au journal, pas au §9 qui recense les ecarts. Une ligne au §9 suffirait. Le test `item-functions.test.ts:312` ne pose aucune valeur avant l'appel : il montre l'absence de fuite, pas une restauration.
- Le journal cite des fichiers `.logs/` non versionnes (mesure de 20 ms comprise). Un auditeur ne les aura pas ; la preuve durable est le test S2.

## Points demandes, juges

### Force de preuve, AC par AC

| AC | Jugement | Reserve |
|---|---|---|
| AC1 | Prouve. Cles exactes, responsable et membre, ordre apres coche (le mutant sans `ORDER BY` echoue, la ligne mise a jour changeant de place), `no-store`, lecture suivante. | Point 2 |
| AC2 | Prouve. Espaces, quatre formes d'absence, bornes emoji relues en base, doublons, auteur, compteur, champs parasites. | — |
| AC3 | Prouve. 10 noms, 7 quantites, 5 corps ; valeur sentinelle, aucune ligne, compteur inchange. | — |
| AC4 | Prouve. 401 et 403 sur les quatre routes avec corps ou identifiant invalide, jamais 404 sans foyer, 422 avant 409, 404 avant 422. | Point 3 pour `LC009` |
| AC5 | Prouve. Deux foyers reels, corps et texte identiques au 404 (`:72`, `:95`), controle positif de page, `app.household_id` force sous `lc_app`, `add_item` commite. Le HTML brut couvre la charge RSC. | Point 11 |
| AC6 | Prouve. Deux sens et deux roles, rejeu, six formes invalides, leurre `itemId`, `toEqual` sur la ligne entiere. | Point 5 |
| AC7 | Prouve. Rejeu sans effet, compteur reconcilie. | — |
| AC8 | Prouve, voir ci-dessous. | Points 1 et 8 |
| AC9 | Prouve sur le HTML rendu, dans la limite de D-059 : ordre, `checked` dans les deux sens, formulaire pour les deux roles, HTML echappe charge RSC comprise, messages. | Point 4 |
| AC10 | Prouve. Catalogue, privileges ligne a ligne, `tgtype = 13`, `LC001`, `LC009`, `LC008`, `23514` meme sur foyer plein, contexte, restauration par le trigger. | — |

### 29302b2 : l'AC8 reste-t-il prouve ?
Oui, pour le texte de l'AC8.
- **La correction n'affaiblit pas le critere.** L'ancien test exigeait une attente que l'AC8 ne demande pas et que Postgres ne produit pas a 200 articles. L'AC8 demande : pas de 500, pas d'interblocage, suppression reussie, 199 ou 200 « selon l'ordre », compteur exact.
- **Puce « suppression et ajout paralleles ».** Elle est couverte par `:91` par l'API, et par S2, qui fixe l'un des deux ordres de facon deterministe : pendant la suppression non commitee `LC008`, apres le COMMIT 199 reconcilie, puis l'ajout reussit et 200. S2 peut echouer : sans refus immediat, il expire ; sans le `household_item_limit`, l'ajout passe ; si la place etait liberee avant le COMMIT, ou l'ajout insere, les compteurs seraient faux.
- **Ce qui est perdu** n'est pas un critere mais la seule observation d'un ajout bloque par une suppression : point 1.
- **Exactitude de la cause.** `ExecUpdate` evalue les contraintes avant `table_tuple_update`, et ne recommence qu'apres `EvalPlanQual`. Le comportement decrit est donc le bon, et la borne ne peut pas etre franchie. Le refus est pessimiste de quelques millisecondes, jamais faux.

### 6d536cb
Justifie, sans affaiblissement. Le cast `::text` ne change pas ce qui est compare. La sentinelle UUID garde sa valeur de preuve : retirer `0007:74`, qui restaure le reglage, fait lire le foyer et non la sentinelle. Commit dedie, pourquoi ecrit.

### ERD §5 et §9
- **§5** : exact, avec un mot sur « a la borne », qui designe la valeur visible du compteur dans l'instantane. « Sous la borne » est juste par lecture, non observe (point 1). Plus aucune occurrence de l'ancienne phrase dans `docs/02-architecture`.
- **§9** : exact. Titre, 0006 et 0007, nom du trigger `item_count` ; la ligne retiree ne valait que jusqu'a 003. Reserve mineure : point 12.
- **Conformite SQL** : etapes de §4.8 dans l'ordre, regles de §4.1, §4.9, cinq politiques et matrice de §1 identiques, contraintes de §3.5 identiques. Commentaires de 0007 justes.

### Decisions du journal
Toutes defendables, et les options ecartees sont ecrites. `Liste entiere en composant client` : le raisonnement sur la survie du message est juste, et les props ne contiennent que ce qui est deja affiche. `Pas de maxLength` : juste. Reserves : point 5 pour `(corps)`, point 3 pour « sans fenetre ».

### `lib/request.ts`
Extraction pure : `readJson` identique, `failedFields` reprend la meme expression. Les deux routes gardent l'ordre 401, 409, 422. Les tests de 001 et 002 passent sans modification. Rien a redire, hors point 7.

### Verifications qui n'ont rien donne
- **`.max(100)` du contrat de sortie et 100 emoji** : je soupconnais un 500 sur `output.parse`, zod comptant habituellement des unites UTF-16. Faux pour la version du depot : zod 4.6.7 mesure en points de code (`v4/core/checks.js:272-273`), verifie par execution, et le test `add.test.ts` est reel. Le commentaire de `_contract.ts:55` n'en reste pas moins exact pour `s.length`.
- **`23514` et `DETAIL`** : Postgres omet la ligne en echec pour un role soumis a la RLS (a ma connaissance, non execute) ; rien a signaler sur l'identifiant de foyer. L'ecart entre le `trim` de JS et `[[:space:]]` (500 possible) est deja hors perimetre du contrat, et au backlog.
- **Interdits** : ni `any`, ni `TODO`, ni suppression de verification dans le diff ; aucune dependance ; `api-contracts/` et les migrations 0000 a 0005 inchanges ; aucun `.env` touche.
- **Historique** : tests avant implementation, un commit par couche, Conventional Commits de 66 caracteres au plus, trailer `Slice: 003`, pourquoi ecrit sur les deux corrections de test.

## A traiter a la cloture (hors constats, etapes non encore faites)
- **Registre** : `docs/DECISIONS.md` s'arrete a D-059. A inscrire, marquees « a valider par l'humain » : l'arbitrage `LC008` immediat et son option ecartee, plus les decisions du journal qui depassent le contrat.
- **Fiche `evidence/003.md`** : declarer le residuel client et une liste de visite concrete. A couvrir au minimum : cocher, decocher, supprimer, ajouter, message de liste pleine, disparition d'un article supprime par un autre membre avec son message, formulaire vide apres ajout.
- **Backlog** : y porter ce qui ne sera pas traite dans la tranche (point 3 en priorite, points 9 et 10).
- **Entree 05 du journal de projet** et cases des AC.

## Bilan
Solide : SQL conforme a l'ERD, isolation, borne et ordre de verification prouves sur la vraie base, AC8 tenu apres 29302b2, factorisation sans effet de bord.
Fragile : ERD §5 « sous la borne » et double suppression sans observation deterministe, `throw` apres `COMMIT` qui deviendra atteignable en 004.
Manquant : preuve du departage par `id`, preuve du cablage client extractible, epinglage de `(corps)`, lignes de `FRICTION.md`, mise a jour du backlog.

REVIEW: PASS
