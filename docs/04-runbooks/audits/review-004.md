# Relecture code — tranche 004 (membres)

Branche `slice/004-membres`, diff `git diff main...HEAD`, relu jusqu'a `bae7039` (21 commits). Relecture statique du depot : je n'ai lance ni `pnpm test`, ni le serveur, ni aucune requete sur une base. Les mutations et les entrelacements evoques ci-dessous sont raisonnes, pas executes. Resultats de suite transmis par l'orchestrateur, non rejoues : 32 fichiers, 476 tests, 97,96 s (`.logs/004-impl-5.log`), `pnpm run check` propre (`.logs/004-impl-check.log`). Ce passage a ete relance une fois apres un arret de plateforme, sans repartir de zero. `audit-004.md` et `contracts-004.md` sont PASS ; je ne refais pas leur travail.

## Synthese
**Deux constats BLOQUANT, tous deux de force de preuve. Aucun defaut de comportement observe.** Le SQL, les routes, le service et le cablage client sont justes a la lecture, et conformes a l'ERD §4.1, §4.6, §4.7 et au contrat.

1. L'AC10 autorise a ne pas tester la branche « article enregistre puis illisible » seulement si aucun test deterministe ne peut l'atteindre. Le test affirme qu'elle n'est pas atteignable. Par mon raisonnement, elle l'est, par le verrou du foyer que tient un retrait non commite.
2. La preuve « sur la page, avec son prenom, apres le depart » (AC6, AC8) est vide : le prenom cherche est contenu dans le nom de l'article.

Les deux correctifs sont des tests, a faible cout. Les reserves restantes sont : l'ordre d'AC1 sans test discriminant, le typecheck rouge non consigne, l'ERD §9, une decision citee a D-061 qui ne la contient pas, et le backlog.

## BLOQUANT

### 1. AC10 : la branche « enregistre puis illisible » est atteignable de facon deterministe, et elle n'est pas testee
- **Emplacement** : `tests/members/service.test.ts:12-15` (affirmation), `apps/web/src/lib/items.ts:115` (branche), `packages/db/migrations/0007_item_rls_functions.sql:69`, `:81`, `:121` ; contrat `docs/03-slices/004-membres.md:123` ; `docs/03-slices/000-backlog.md:85` (« un resultat type, avec un test »).
- **Constat** : l'en-tete justifie l'absence de test ainsi : « la lecture suit l'ecriture dans la meme transaction, sans point d'interposition ». Ce point existe :
  - Un `remove_member` non commite tient la ligne `household`, verrouillee par l'`UPDATE` du trigger `membership_count`.
  - `addItem` du membre vise lit encore son appartenance (`DELETE` non commite), insere l'article, puis le trigger `item_count` attend ce verrou sur `UPDATE lc.household`.
  - Le test `AC7 sous la borne` (`concurrency.test.ts`) et S3 de 003 observent exactement cette attente sur ce verrou.
  - Apres le `COMMIT` du retrait, `add_item` se termine. La relecture, instruction suivante, a un nouvel instantane : `lc.current_household_id()` rend `NULL`, zero ligne, donc la branche.
  - C'est l'ordre inverse de Y4 (`service.test.ts:81`), qui prouve seulement « ajout non commite, retrait attend ». L'attente se constate en cherchant le `pid` dans `pg_stat_activity` par le texte de la requete, ou en rejouant les deux instructions sur `openAppTx`.
- **Consequence** :
  - Le mutant qui restaure `throw new Error("article ajoute mais illisible")` laisse les 476 tests verts. C'est precisement le 500 sur article enregistre que review-003 (point 3) a fait renvoyer a cette tranche.
  - La sortie prevue par l'AC10, « la fiche de preuves le declare », n'est pas ouverte : la fiche affirmerait une impossibilite fausse a un humain qui fusionne sur preuves.
  - La condition « l'article reste » (D-066) dans cet ordre n'est observee nulle part.
- **Reserve** : l'atteignabilite est raisonnee sur le SQL et sur les attentes deja observees par la suite, pas executee.
- **Direction** : ajouter le scenario deterministe au niveau du service : retrait tenu, `addItem` bloque, COMMIT, resultat exact `{ ok: false, error: { status: 403, code: "NO_HOUSEHOLD" } }`, article present avec son prenom, `item_count` reconcilie. Corriger l'en-tete du test. Ajouter cet ordre a l'ERD §5, dont la nouvelle puce ne couvre que l'autre. Si le test revele que c'est impossible, le dire avec le comportement observe.

### 2. AC6 et AC8 : le prenom sur la page apres un depart n'est pas prouve, l'assertion est toujours vraie
- **Emplacement** : `tests/members/screens.test.ts:150-151`, `:164-165` ; `tests/helpers/household.ts:113-127` ; contrat `004-membres.md:94`, `:108` ; rendu `apps/web/src/ui/item-list.tsx:51`.
- **Constat** :
  - `page.text` est passe en minuscules (`visibleText`). Les articles s'appellent `ArticleRetiree` et `ArticlePartie`, et les prenoms cherches sont `retiree` et `partie`.
  - `articleretiree` contient `retiree` : les lignes 164-165 passent meme si aucun prenom n'est affiche. Les lignes 162-163 ne prouvent que le nom de l'article.
  - Le test d'AC6 `tests/members/api.test.ts` (« US-06.2 ») ne regarde que `GET items`. Aucun autre test ne regarde la page apres un depart.
  - Seule la page de la responsable est couverte, alors que l'AC6 dit « pour les membres restants ».
- **Consequence** : la puce US-06.2 « et sur la page », celle que le contrat met en gras, n'a pas de preuve, pas plus que « ses articles restent affiches avec son prenom » de l'AC8. Le risque reel est limite : `tests/items/screens.test.ts:75` prouve le prenom pour un auteur present, et la page et l'API partagent `listItems`. Un rendu qui masquerait l'auteur parti resterait pourtant vert, et l'AC serait cochee sans preuve.
- **Direction** : donner aux articles des noms sans rapport avec les prenoms, et exiger dans la ligne de l'article (`item-row`), sur le HTML, le prenom exact de son auteur. Faire la meme verification sur la page d'un membre restant.

## A CORRIGER

### 3. AC1 : l'ordre d'entree n'a aucun test discriminant
- **Emplacement** : `apps/web/src/lib/members.ts:47` ; `tests/members/api.test.ts:27`, `:37`.
- **Constat** : le test compare a l'ordre `joined_at, id` de membres crees l'un apres l'autre, ce qui est aussi l'ordre physique : `lc.membership` est immuable et rien n'y deplace une ligne. Retirer tout l'`ORDER BY` reste tres probablement vert, et le departage par `id` n'est pas prouve non plus. Review-003 avait releve le meme defaut (point 2).
- **Consequence** : une puce d'AC tient au plan d'execution. L'ordre pourrait changer d'un rechargement a l'autre sans alerte.
- **Direction** : amorcer par l'administration des lignes dont le `joined_at` explicite contredit l'ordre d'insertion, et deux lignes a `joined_at` egal pour le departage.

### 4. Typecheck rouge : le journal ne le dit pas, et il touche deux commits de couche
- **Emplacement** : `docs/03-slices/004-progress.md:13-14`, `:18-20` ; `docs/04-runbooks/autonomous-run-2026-11-05.md:60` ; commits `50ce0c8`, `b47fda7` ; `.logs/004-impl-typecheck-1.log:2` ; `.claude/rules/git.md`.
- **Constat** :
  - Aucun des deux journaux ni `FRICTION.md` n'en parle. Le message de `50ce0c8` non plus.
  - La cause tracee : `tests/members/screens.test.ts:9` importe `memberMutationEffect`, ajoute a `ui/messages.ts` seulement par `1a31c0f`. **`b47fda7` est donc rouge lui aussi**, par le meme motif, ce que votre consigne ne citait pas.
  - La regle dit « chaque commit compile et passe les tests de sa couche ». Le rouge vient des tests ecrits avant (attendu en TDD) et non du code de `50ce0c8`, mais c'est une exception qu'il faut ecrire.
  - Dans le meme esprit, le renvoi de deux tests a `test-writer` (5809183) n'est pas dans `FRICTION.md`, alors que le cas equivalent de 003 y figure.
- **Consequence** : un auditeur qui rejoue l'historique croise un commit rouge sans explication.
- **Direction** : une ligne au journal de tranche et au journal de passage (commits, cause, commit qui retablit), une ligne dans `FRICTION.md` pour les deux points.

### 5. ERD §9 : l'ecart « sortie en erreur » ne cite que `add_item`
- **Emplacement** : `docs/02-architecture/ERD.md`, §9, puce « §4.1 point 3, sortie en erreur » ; `packages/db/migrations/0008_member_functions.sql:47-60` (`LC007`, `LC006`, avec le contexte pose) et `:105-109` (`LC009`) ; `004-progress.md:30`.
- **Constat** : le journal renvoie au §9 pour justifier que `remove_member` et `leave_household` levent sans remettre le contexte a vide, mais le §9 ne les nomme pas. Le comportement est sain et prouve (`tests/db/member-functions.test.ts`, « apres une erreur rattrapee »).
- **Consequence** : le §9 est le recensement des ecarts, et il est incomplet sur l'ecart que le contrat demandait de mettre a jour.
- **Direction** : etendre la puce aux deux fonctions et a leurs codes.

### 6. « Fenetre 404 acceptee (D-061) » : D-061 ne l'accepte pas, et « aucune ecriture ne passe » est trop fort
- **Emplacement** : `docs/DECISIONS.md` D-061 ; `docs/03-slices/004-membres.md:32`, `:137` ; `004-progress.md:26` ; `apps/web/src/lib/items.ts:10-12` et `:145-155` ; `000-backlog.md:86`.
- **Constat** :
  - D-061, validee par D-065, **renvoie** la fenetre au backlog de 004 ; elle ne l'accepte pas. L'acceptation est une decision neuve de cette tranche, sans ligne au registre. Le backlog disait « a rejouer en 004 », et rien ne la rejoue.
  - « Aucune ecriture ne passe » est faux pour `deleteItem` : avec un retrait non commite, la suppression d'un membre vise voit encore le foyer, supprime, attend le verrou du foyer dans le trigger, puis commite apres le retrait. Ce n'est pas un defaut : la requete etait en vol, ADR-0002 porte sur la requete suivante, et l'AC2 tient.
- **Consequence** : un auditeur remonte a une decision qui ne dit pas ce qu'on lui fait dire. Et la phrase repetee dans le contrat et l'en-tete promet plus que le code.
- **Direction** : une ligne de registre pour l'acceptation, a valider par l'humain, qui ecrit ce qui est vrai : une requete en vol peut aboutir, ou recevoir 404 ; la requete suivante recoit toujours 403.

### 7. Backlog : les suites de 003 traitees restent ouvertes
- **Emplacement** : `docs/03-slices/000-backlog.md:63`, `:85-88`, absent du diff.
- **Constat** : les quatre entrees sont decrites comme a faire, dont « Choix a trancher dans le contrat de 004 », tranche par D-066, et « `NO_HOUSEHOLD` cote client », fait. Meme defaut que review-003, point 7.
- **Etat des suites** : `addItem` repris (reserve : constat 1) ; `LC004` immediat repris et prouve (K1) ; `NO_HOUSEHOLD` cote client repris ; fenetre 404 acceptee sans preuve (constat 6) ; review-003 R2 et R4, borne du corps, `23514`, `10` en dur : renvoyes par le contrat ; details du client : visite guidee.
- **Consequence** : le backlog ne dit plus l'etat reel du projet a la fin du MVP.
- **Direction** : clore ou reduire chaque entree, avec son numero de decision.

## SUGGESTION

### 8. AC6 : deux croisements manquent
- **Emplacement** : `tests/members/api.test.ts`, « une personne retiree ou partie rejoint un autre foyer » ; `tests/members/service.test.ts` (Y3).
- La retiree va vers un autre foyer et la partie revient, mais jamais l'inverse. Y3 fait revenir une retiree sans verifier qu'elle retrouve la liste. Tout passe par le meme `join_household`, d'ou le niveau de ce constat.

### 9. Cablage client : tout est juste a la lecture, deux branches echappent a la fonction pure
- **Emplacement** : `apps/web/src/ui/leave-household-button.tsx:28-31` ; `apps/web/src/ui/add-item-form.tsx:28-31`.
- Le succes du depart contourne `memberMutationEffect` : `router.push` est decide hors de la fonction pure, alors que l'AC8 demande une decision pure. Rien n'y est faux, et le contrat prescrit ce `push`. L'appel de `itemMutationEffect` par le formulaire (derniere puce d'AC10) n'a pas de preuve automatique : residuel de D-059, a declarer.
- Le message de `NO_HOUSEHOLD` disparait au rechargement, puisque la page change. Un seul `pendingId` dans `member-list.tsx:20` : meme detail qu'en 003, a voir a la visite.

### 10. Details de test
- `tests/members/api.test.ts`, « AC4 : la liste de la responsable ne change pas apres des refus » : foyer d'une personne, un seul refus mal forme, le test n'apporte rien aux autres.
- `tests/members/api.test.ts`, AC2 coupure : apres le `POST` refuse, rien ne verifie l'absence d'ecriture, contrairement a `PATCH` et `DELETE`. Le service le prouve en Y2, a un autre niveau.

### 11. Details de documentation et de forme
- `apps/web/src/lib/errors.ts:34` : `alreadyInHousehold =():`, une espace perdue sur une ligne sans rapport (deja signale par `contracts-004.md`).
- `docs/03-slices/004-progress.md:28` : « c'est l'index `membership_household_idx` », or cet index porte `(household_id, joined_at)`, sans `id`.
- `004-progress.md:8` : « Dernier commit » s'arrete a `8a34614`, alors que `HEAD` est `bae7039`.

## Points demandes, juges

### Force de preuve, AC par AC

| AC | Jugement | Reserve |
|---|---|---|
| AC1 | Prouve : cles exactes, `toEqual` entre roles, identifiants relus en base, fuite cherchee sur le texte brut, `no-store`. | Ordre : constat 3 |
| AC2 | Prouve, coupure comprise, voir ci-dessous. | Constat 10 |
| AC3 | Prouve : effet, compteur, coupure, rejeu, article avec prenom, redirection (S9). | — |
| AC4 | Prouve : chaque refus avec code exact, mal forme compris, cible relue. | — |
| AC5 | Prouve : deux foyers reels, `text` identique au 404, `app.household_id` force sous `lc_app`, depart commite. | — |
| AC6 | **Prouve par l'API, pas sur la page.** | Constats 2, 8 |
| AC7 | Prouve et observe, voir ci-dessous. | — |
| AC8 | Prouve sauf le prenom apres depart. HTML brut, charge serialisee, echappement et decision pure sont reels. | Constats 2, 9 |
| AC9 | Prouve : catalogue, privileges, tous les codes, contexte, `DELETE` superutilisateur (`LC007`), messages. | — |
| AC10 | **Prouve sauf la branche enregistre puis illisible.** Q-8 dans les deux sens de l'adhesion, `LC009` au service, `itemMutationEffect`. | Constats 1, 9 |

### AC2, coupure immediate
Preuve solide. Meme cookie, controle positif avant le retrait, code exact sur les six routes, `GET /api/me` a `household: null`, redirection par S8, article intact apres `PATCH` et `DELETE` refuses. Le mutant qui garderait le foyer en memoire ou en cache echouerait.

### AC6, US-06.2 de bout en bout
Moitie API prouvee : deux auteurs, deux lecteurs, `[id, prenom]` exacts. Moitie page non prouvee : constat 2.

### AC7, concurrence observee
Oui, observee. Les trois `Promise.all` ne prouvent pas le chevauchement, et leur en-tete le dit. La preuve vient de D1, D2 et D3 : `waitUntilBlockedOnLock`, non-aboutissement sur 150 ms, COMMIT, code exact, compteur. D2 tue le mutant « `leave_household` sans verifier `ROW_COUNT` », que rien d'autre ne verrait. K1 et K2 prouvent la borne dans les deux sens ; K1 peut echouer (garde de 5 s). Limite assumee : ces scenarios sont en SQL, pas par HTTP. Le service n'ayant aucune logique entre la fonction et la traduction, rien ne s'y cache, et `LC006` et `LC009` sont traduits par les chemins deja testes.

### ERD §5 et §9
- **§5** : les trois puces sont exactes et chacune a son test (D1 a D3 ; K1, K2 ; Y4). Il manque l'ordre inverse de la derniere (constat 1).
- **§9** : la ligne `0008` et le titre sont justes. Reserve : constat 5.
- **Conformite SQL** : etapes de §4.6 et §4.7 dans l'ordre, regles de §4.1 respectees (points 1 a 5, 7), code d'erreur et `ROW_COUNT` identiques. Aucun cycle de verrous trouve : `add_item` ne verrouille pas `membership`, et la cle etrangere vers `household` est compatible avec le verrou du compteur.

### Registre
- **D-065** : conforme a la forme de D-058, et les cinq lignes D-060 a D-064 ne changent que par leur statut. Elle ne cite ni options ni raison ; pour une simple validation, D-058 faisait de meme.
- **D-066** : exacte. Q-8 et D-025 disent bien que l'article est conserve, et le raisonnement tient.

### Cablage client et `canRemove`
- **Cablage** : relu, juste. Chemins et methodes conformes au contrat, `DELETE` sans corps, depart avec `{}` type sur le contrat, identifiant encode, imports `type` seuls.
- **`canRemove`** : un booleen dans la charge RSC, `true` ou `false`. Il revele uniquement le role de la personne connectee, deja affiche par la page, et n'autorise rien : `LC005` decide en base. L'ecart avec la note du contrat (« `memberId`, `name`, `role`, seulement ») est au journal, option ecartee comprise. Aucune donnee de compte ne part vers le client, et S4 le verifie charge comprise.

### `7a56b04`
Justifiee, dediee, pourquoi ecrit, autorisee par l'anti-regression du contrat. Une ligne retiree, et la regle inverse est exigee dans `tests/members/screens.test.ts`, en comparant l'objet entier.

### `5809183`
Sans affaiblissement, et plutot un gain. L'ancienne version exigeait une lecture impossible : la coupure masque le foyer dans la transaction meme. Les deux tests constatent maintenant la baisse par l'administration, apres un vrai `COMMIT`, avec membre dedie. La preuve « ne quitte que A » devient plus forte que la lecture dans une transaction annulee. Bonus : la coupure est verifiee dans la transaction.

### Verifications qui n'ont rien donne
- **`listMembers` vide** : un foyer compte toujours sa responsable. Le choix d'une seule instruction evite le 500 sur `.min(1)`.
- **Ordre 401, 403, 403, 404, 409** : tenu, mal forme compris, sans lecture de cible avant le role.
- **Interdits** : ni `any`, ni `TODO`, ni suppression de verification ; aucune dependance ; migrations `0000` a `0007` et `api-contracts/` inchanges.
- **Historique** : tests avant implementation, un commit par couche, sujets de 71 caracteres au plus. Reserve : constat 4.

## A traiter a la cloture (hors constats, etapes non encore faites)
- **Registre** : les decisions du journal qui depassent le contrat, marquees « a valider » : pas de confirmation sur « Retirer » et « Quitter » (a reexaminer avec D-055 et D-064, l'action etant ici plus lourde), prop `canRemove`, `INSUFFICIENT_ROLE` sans message dedie.
- **Fiche `evidence/004.md`** : residuel client (constat 9), liste de visite des deux boutons, retrait de la promesse « non atteignable » (constat 1).
- **Entree 06 du journal de projet, cases des AC, statut du journal.**

## Bilan
Solide : SQL conforme a l'ERD, coupure immediate, isolation, refus et concurrence observes sur la vraie base, `5809183` et `7a56b04` justifies, cablage juste a la lecture.
Fragile : l'ordre d'AC1 tient au plan, une acceptation citee a une decision qui ne la contient pas, et un journal muet sur deux commits rouges.
Manquant : le test de la branche enregistre puis illisible, le prenom sur la page apres un depart, l'ERD §9 pour les deux fonctions, la mise a jour du backlog.

REVIEW: FAIL

## Second passage, 2026-11-11

Diff `git diff bae7039...HEAD`, relu jusqu'a `ce22019`, soit 9 commits : 4 de `test-writer`, 2 de `slice-implementer`, le reste de l'orchestrateur. Relecture statique : je n'ai lance ni tests, ni serveur, ni requete sur une base. Les mutations ci-dessous sont raisonnees, pas executees. Resultats transmis par l'orchestrateur, non rejoues : 480 tests verts, 174,25 s (`.logs/004-impl-6.log`), `check` propre (`.logs/004-impl-check-2.log`). Ce passage a eu lieu apres la pause de cinq jours, sans la chevaucher (`autonomous-run-2026-11-05.md`). Le decompte tient : 476 + 2 (constat 1) + 1 (ordre d'AC1) + 1 (croisement d'AC6) = 480. Le test d'AC4 a ete remplace, pas ajoute.

### Synthese
Aucun constat BLOQUANT. Les deux BLOQUANT et les cinq A CORRIGER du premier passage sont traites. Les nouveaux tests peuvent echouer sur le defaut qu'ils visent. Cote code, seuls des commentaires et une espace changent : aucun comportement ne change. Il reste deux details de forme, en suggestion.

### Verification des constats du premier passage

| Constat | Etat | Jugement |
|---|---|---|
| 1 Branche enregistre puis illisible | Traite | Voir ci-dessous. |
| 2 Prenom sur la page | Traite | Voir ci-dessous. |
| 3 Ordre d'AC1 | Traite, limite ecrite | `tests/members/api.test.ts:44`. Quatre lignes inserees par l'administration, dans l'ordre inverse de leur `joined_at`, dont deux a `joined_at` egal, la plus grande inseree d'abord. Sans `ORDER BY`, l'ordre physique fait echouer le test. Sur `joined_at` seul, l'egalite sort dans l'ordre physique par parcours sequentiel comme par l'index (a `joined_at` egal, l'index range les entrees par adresse physique), donc dans le mauvais ordre : echec. Le test dit ce qu'il ne prouve pas, et c'est exact. |
| 4 Typecheck rouge | Traite | `004-progress.md` (section Blocages) nomme `50ce0c8` et `b47fda7`, la cause, le commit qui retablit le vert, et la faute d'enchainement par `;`. Il nomme aussi `597922c`, qui ne compilait pas seul, corrige par `b568046`. `FRICTION.md` : trois lignes, dont la question ouverte pour `rules/git.md` (tests d'abord, couche qui compile). Historique non reecrit, ce qui est juste. |
| 5 ERD §9 | Traite | La puce cite les deux fonctions et leurs codes : `LC007` et `LC006` pour `remove_member`, `LC009` sur zero ligne pour `leave_household`. C'est exact au regard de `0008`. `LC009` et `LC005` de `remove_member` sont levees avant que le contexte soit pose, d'ou leur absence, qui est juste. |
| 6 Fenetre 404 | Traite | D-067, « a valider », decrit ce qui est vrai : 404 possible, `DELETE` en vol qui peut commiter, requete suivante en 403. L'option ecartee est ecrite. Contrat, journal et en-tete de `lib/items.ts` sont alignes. |
| 7 Backlog | Traite | Suites de 003 closes avec leurs decisions (D-066, D-067). Restent les vrais restes : details du client, R2, R4. |
| 8 Croisements d'AC6 | Traite | `api.test.ts:277` : la partie part vers un autre foyer, la retiree revient dans le meme, chacune avec sa liste exacte. |
| 9 Residuel client | Declare | `evidence/004.md`, « Ce que cette fiche ne prouve pas » : les quatre points, sans detour, avec une liste de visite concrete. |
| 10 Details de test | Traite | `POST` refuse sans ecriture (`api.test.ts:111`). Le test d'AC4 enchaine cinq refus de nature differente sur un foyer de trois. |
| 11 Forme | Traite | `errors.ts:34`, index au journal, dernier commit. |

### Constat 1 : le scenario peut-il echouer ?
Oui, sur chaque defaut vise. Deux tests, `tests/members/service.test.ts:124` (API) et `:153` (service) :
- **Attente observee** : `waitUntilQueryBlocked` (`tests/helpers/members.ts:85`) attend un `wait_event_type = 'Lock'` sur une session dont la requete contient `lc.add_item`. Il exclut la transaction du retrait et la session de sondage, dont le texte ne contient pas le motif, passe en parametre. La requete ne doit pas aboutir avant le COMMIT (garde de 150 ms). Si l'ajout n'attendait pas, le delai de 10 s fait echouer le test, avec un message net.
- **Mutants** :
  - Rendre le `throw` : le service rejette, l'API rend 500, les deux tests echouent.
  - Annuler l'article : la relecture `itemRowsOf` echoue.
  - Mauvais code : comparaison de l'objet entier, ou `expectAppError` sur 403 `NO_HOUSEHOLD`.
  - Compteur faux : `itemCountOf`.
- **Chemin HTTP** : la verification prealable de la route ne prend aucun verrou et passe, puisque le retrait n'est pas commite. C'est bien `add_item` qui attend. Le scenario prouve donc la reponse reelle d'un client, pas seulement le service.
- **Nettoyage** : si l'attente n'est pas constatee, le `finally` annule le retrait, ce qui debloque l'ajout. Aucun verrou ne survit au test.
- **Documents** : AC10 du contrat, ERD §5 (ordre inverse ajoute), en-tete de `lib/items.ts` et fiche disent la meme chose.

La reformulation de la puce d'AC10 par l'orchestrateur rend le critere plus strict : elle retire l'echappatoire « la fiche le declare », que le test rend sans objet. Ce n'est pas un affaiblissement.

### Constat 2 : le prenom sur la page peut-il echouer ?
Oui. `tests/members/screens.test.ts:153` :
- Prenoms (`Zelda`, `Ursule`) et articles (`Pommes`, `Farine`) n'ont aucune sous-chaine commune, et la comparaison respecte la casse.
- Le prenom est cherche dans la ligne `item-row` de son article, pas dans la page.
- Il est verifie pour la responsable et pour un membre restant.
- L'autre prenom est exclu de chaque ligne : une inversion des auteurs echouerait aussi.
- `itemRows` (`:65`) est sain : `item-list.tsx:40` n'imbrique aucun `<li>` dans une ligne. La version de `597922c`, aux antislashs perdus, ne compilait pas : elle ne pouvait donc pas passer en silence, et `b568046` la corrige, commit dedie.
- Les membres partis sont exclus de `member-row` sur les deux pages.

### Documentation
- **Registre** : D-067, D-068, D-069 au bon format, marquees « a valider », options ecartees ecrites. D-068 reprend les trois decisions d'ecran que je renvoyais a la cloture.
- **Journal 06** : indexe, lisible, incidents complets, decisions numerotees. « Relecteurs PASS au second passage » et « tranche close » anticipent ce passage et la cloture, comme pour 002 et 003 ; la formule devient vraie avec ce verdict.
- **`evidence/004.md`** : `security-auditor` et `contract-guardian` n'ont pas repasse. Le diff de `apps/` le justifie : deux commentaires dans `lib/items.ts` et une espace dans `errors.ts`.

### Constats restants

#### SUGGESTION

##### S1. Note du contrat contredite par D-068
- **Emplacement** : `docs/03-slices/004-membres.md:139` (« Props du client : `memberId`, `name`, `role`, seulement »).
- La note est restee telle quelle, alors que `MemberList` recoit aussi `canRemove`, decide par D-068. Un auditeur qui lit le contrat seul voit un ecart sans renvoi. Une mention « voir D-068 » suffit.

##### S2. Coquilles dans le journal de passage
- **Emplacement** : `docs/04-runbooks/autonomous-run-2026-11-05.md`, lignes ajoutees pour le premier `REVIEW: FAIL` et pour `test-writer` (« d arret », « l API »).
- Apostrophes perdues, sans effet sur le sens.

### Bilan
Solide : le scenario du constat 1 observe l'attente et tue le `throw` par l'API et par le service ; le prenom est prouve ligne par ligne pour deux lecteurs ; l'ordre d'AC1 est discriminant ; la documentation est complete et honnete sur ses limites.
Fragile : le cablage client reste non prouve jusqu'a la visite guidee, comme le declare la fiche (D-059).
Manquant : rien qui engage la fusion ; deux retouches de forme.

REVIEW: PASS
