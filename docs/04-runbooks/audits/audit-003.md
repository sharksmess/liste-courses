# Audit de securite — tranche 003 (la liste de courses)

Branche `slice/003-liste-courses`, diff `git diff main...HEAD`. Le 2026-11-06.

Relecture statique du code, des migrations et des tests. Je n'ai lance ni la suite, ni le serveur, ni la base : aucun scenario d'attaque n'a ete rejoue contre l'application. Le comportement a l'execution repose sur les journaux transmis, lus en entier : `.logs/003-impl-1.log` (26 fichiers, 375 tests verts) et `.logs/003-impl-check.log` (typecheck et lint propres).

Deux verifications ont ete executees : `pnpm audit --prod --audit-level=high`, et une sonde de `zod` 4.6.7 sans acces a la base.

## Synthese
- CRITIQUE : 0
- MAJEUR : 0
- MINEUR : 1

Aucune fuite entre foyers, aucun defaut d'autorisation, aucun contournement de la borne de 200 et aucune injection n'ont ete trouves. Le seul constat est un defaut de robustesse deja connu, que cette tranche etend a deux nouvelles routes.

## Constats

### MINEUR-1 — Corps de requete non borne sur `POST /api/household/items` et `PATCH /api/household/items/:itemId`
- **Gravite** : MINEUR (dette). L'application n'est pas en ligne (D-011). Suite de audit-002 MINEUR-1, laissee au backlog par le contrat de tranche (« NE touche PAS ») avec l'obligation de la traiter avant toute mise en ligne.
- **Emplacement** : `apps/web/src/lib/request.ts:7` (`request.json()`), appele depuis `apps/web/src/app/api/household/items/route.ts:33` et `apps/web/src/app/api/household/items/[itemId]/route.ts:40`.
- **Cause** : le corps est charge entierement en memoire avant la validation. Le depot n'a ni `middleware` ni `proxy`, et audit-002 a etabli que Next 16.4.3 n'impose pas de limite aux Route Handlers. Cette tranche ajoute un cas : sur `PATCH`, avec un `:itemId` au format UUID, le corps est lu avant toute verification du foyer, car `readItemId` ne consulte le foyer que pour un identifiant mal forme. Un compte sans foyer suffit donc.
- **Scenario d'exploitation** (non execute, etabli par lecture) :
  1. L'attaquant cree un compte gratuit, sans verification d'adresse, et n'a besoin d'aucun foyer.
  2. Il envoie en parallele des `PATCH /api/household/items/<un UUID quelconque>` avec des corps de plusieurs centaines de Mo.
  3. Chaque corps est charge en memoire avant la reponse, ce qui peut saturer la memoire du processus et rendre le service indisponible pour tous les foyers.
  - La session est verifiee avant la lecture : l'attaque exige un compte.
  - Aucune donnee ne fuit, et aucune transaction n'est ouverte pendant la lecture du corps.
- **Remediation** : borner la taille du corps avant la lecture, de preference a un seul endroit pour toutes les routes JSON, ou au proxy de confiance prevu avant la mise en ligne. Le statut a renvoyer est absent des contrats et releve donc d'une decision.

## Points examines sans constat

**Isolation entre foyers (`0007_item_rls_functions.sql`, `apps/web/src/lib/items.ts`)**
- `lc.item` a sa RLS activee et forcee (lignes 8-9), appartient a `lc_owner`, et `PUBLIC` est revoque.
- Privileges conformes a la matrice de l'ERD §1 :
  - `lc_app` : `SELECT`, `DELETE`, `UPDATE (purchased)` ;
  - `lc_definer` : `SELECT`, `INSERT` ;
  - `lc_better_auth` : aucun.
- Les cinq politiques correspondent a l'ERD §3.5.
- Chaque requete de `lib/items.ts` filtre sur `household_id = lc.current_household_id()`, en plus de la RLS. Elles sont toutes parametrees.
- Le filtre sur le foyer vaut aussi pour la relecture de `addItem`. `ITEM_COLUMNS` n'expose ni `household_id` ni `author_user_id`.
- `findItem`, utilise par `PATCH` quand le corps est invalide, applique le meme filtre : un article d'un autre foyer donne 404, jamais 422.

**Origine du contexte tenant (grille 8)**
- Les politiques de `lc_app` s'appuient sur `lc.current_household_id()`, derive en base de `app.user_id`. Celui-ci est pose par `withUser` depuis la session, en premiere instruction de la transaction.
- Aucun identifiant de foyer ne vient de la requete. Un `app.household_id` force par l'appelant est ignore par `lc_app` et ecrase par `add_item`.
- Le corps n'apporte que `name` et `quantity`, ou `purchased`. Zod retire le reste, y compris un `itemId` place dans le corps : pas de mass assignment.

**Reponses 404 indistinguables**
- Un `:itemId` mal forme, inexistant ou d'un autre foyer passe par le meme `errorResponse(itemNotFound())`, donc meme statut et meme corps (`[itemId]/route.ts`, `lib/errors.ts`).
- Un `:itemId` mal forme verifie d'abord le foyer : un compte sans foyer recoit 403, jamais 404.
- Le comportement est couvert par `tests/isolation/items.test.ts`, avec deux foyers reels.

**Ordre session puis foyer**
- Les quatre routes appellent `getSessionUser` avant tout. Pas de cache de session (`cookieCache` non active dans `lib/auth.ts`).
- `inHousehold` lit le foyer et agit dans la meme transaction `withUser`.
- En `READ COMMITTED`, chaque instruction relit l'appartenance, et l'ecriture elle-meme filtre sur le foyer courant. Un membre retire entre les deux instructions touche zero ligne : aucune ecriture ne passe. Il recevrait 404 au lieu de 403 dans cette fenetre etroite, ce qui ne revele rien. A rejouer en 004, seule tranche qui cree des departs.
- `add_item` relit l'appartenance dans sa propre transaction. La course avec un retrait est acceptee par l'ERD §5 (Q-8).

**`add_item` et `item_count_trg` (liste SECURITY DEFINER, ERD §4.1, §4.8, §4.9)**
- Les deux fonctions ont un `search_path` fixe (`pg_catalog, lc, pg_temp`), le proprietaire `lc_definer` et `REVOKE ALL ... FROM PUBLIC`. Seule `add_item` recoit `EXECUTE`, accorde au seul `lc_app`.
- `add_item` lit `lc.current_user_id()` en premier, leve `LC001` si le contexte est absent, puis ecrase `app.household_id`. L'absence de foyer leve `LC009` : pas de conclusion silencieuse.
- Le trigger verifie `ROW_COUNT` et leve `P0001`. Il pose une valeur de confiance, puis restaure la precedente.
- Le bloc `EXCEPTION` ne traduit que `household_item_limit` et releve tout le reste.
- Sur une erreur, le `set_config` local est annule avec la transaction ou le point de sauvegarde : `app.household_id` ne subsiste pas.
- Aucun `MESSAGE` ne contient de nom ni d'identifiant de foyer.
- Les tests sans contexte et d'isolation croisee exiges par la regle sont presents (`tests/db/item-functions.test.ts`, `tests/isolation/items.test.ts`).

**Borne de 200**
- `item_count` n'est modifiable que par `lc_definer`, et dans cette tranche par le seul trigger. `lc_app` n'a aucun droit d'ecriture sur `lc.household`, pas d'`INSERT` sur `lc.item` et pas de `TRUNCATE`.
- `household_item_limit` et `household_item_count_nonneg` existent en base (`0002_tables.sql:39-40`).
- Le trigger `AFTER INSERT OR DELETE FOR EACH ROW` compte aussi un `DELETE` direct de `lc_app`.
- En concurrence, le verrou de la ligne du foyer serialise les ajouts, et `household_item_limit` tient en `READ COMMITTED` sur la valeur relue.
- Le refus immediat de `LC008` a la borne pendant une suppression non commitee est pessimiste : il ne cree aucun depassement (journal de tranche, ERD §5, AC8).
- Les cles `FOR KEY SHARE` prises par les FK sont compatibles avec le verrou du compteur : pas d'interblocage entre ajouts.

**Injection et rendu**
- SQL entierement parametre. `ITEM_COLUMNS`, seul fragment interpole, est une constante. Pas de SQL dynamique dans les migrations du diff.
- Aucun `dangerouslySetInnerHTML` ni `sql.raw`. `ui/item-list.tsx` rend le nom, la quantite et le prenom comme du texte JSX, donc echappes.
- L'injection HTML est couverte sur la page rendue par `tests/items/screens.test.ts` (AC9).
- `itemId` est encode dans l'URL cote client.
- `Item` importe dans le composant client n'est qu'un type : aucun module serveur n'entre dans le bundle.

**Fuites**
- `errorResponse` n'expose que `code`, et `fields` pour la validation : jamais la valeur recue.
- Les messages du client sont des chaines fixes.
- Les props passees a `ItemList` portent les seuls champs du contrat, deja affiches a ce membre.
- Reponses de l'API en `Cache-Control: no-store`, erreurs comprises.
- Aucun `console.*` ni valeur en dur de type secret dans le code du diff.
- `.logs` n'est pas suivi par git.

**CSRF**
- Les routes de mutation n'ont pas de controle d'origine propre, et `readJson` ne verifie pas le `Content-Type`.
- better-auth 1.7.14 pose ses cookies en `sameSite: "lax"` (`dist/cookies/index.mjs:35`) : une requete `POST` intersite ne les emporte pas et recoit 401.
- `PATCH` et `DELETE` exigent en plus un preflight, que l'application n'autorise pas.
- Pas de scenario exploitable sur le deploiement mono-domaine prevu.

**Longueurs en emoji**
- Le schema de sortie `z.string().max(100)` pouvait, s'il comptait des unites UTF-16, faire echouer `GET` pour tout un foyer apres l'ajout d'un seul article a 100 emoji.
- Hypothese ecartee : zod 4.6.7 compte en points de code (`v4/core/checks.js:271-274`). Sonde executee : 100 emoji acceptes, 101 refuses ; 30 acceptes, 31 refuses avec `max(30)`.

**Grille sans objet ou sans changement**
- Webhooks : aucun dans cette tranche.
- Rate limiting : routes authentifiees, peu couteuses, volume stocke borne a 200 articles par foyer. Pas de route d'authentification ni de reinitialisation dans ce diff.
- Validations restant en 500 (caractere NUL, `23514` sur une colonne de texte) : ecartees par le contrat. Un 500 ne renvoie aucun detail au client.
- `pnpm audit --prod --audit-level=high` : aucune vulnerabilite connue.
- Aucune dependance ajoutee.

## Fichiers examines
- `C:\dev\liste-courses\packages\db\migrations\0006_item.sql`
- `C:\dev\liste-courses\packages\db\migrations\0007_item_rls_functions.sql`
- `C:\dev\liste-courses\packages\db\migrations\0004_household.sql` (primitives et politiques reutilisees)
- `C:\dev\liste-courses\apps\web\src\lib\items.ts`
- `C:\dev\liste-courses\apps\web\src\lib\request.ts`
- `C:\dev\liste-courses\apps\web\src\lib\db.ts`
- `C:\dev\liste-courses\apps\web\src\lib\errors.ts`
- `C:\dev\liste-courses\apps\web\src\lib\auth.ts`
- `C:\dev\liste-courses\apps\web\src\app\api\household\items\route.ts`
- `C:\dev\liste-courses\apps\web\src\app\api\household\items\[itemId]\route.ts`
- `C:\dev\liste-courses\apps\web\src\app\household\page.tsx`
- `C:\dev\liste-courses\apps\web\src\ui\item-list.tsx`
- `C:\dev\liste-courses\apps\web\src\ui\add-item-form.tsx`
- `C:\dev\liste-courses\apps\web\src\ui\requests.ts`
- `C:\dev\liste-courses\docs\02-architecture\api-contracts\items.ts`
- `C:\dev\liste-courses\docs\02-architecture\ERD.md`
- `C:\dev\liste-courses\tests\isolation\items.test.ts`
- `C:\dev\liste-courses\tests\db\item-functions.test.ts`

AUDIT: PASS
