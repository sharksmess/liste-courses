# Relecture des contrats, tranche 002 (`slice/002-rejoindre-foyer`, `git diff 4c1b0bb...HEAD`)

Lecture seule. Je n'ai lancé aucun test.

## 1. Contrats d'API (`docs/02-architecture/api-contracts/`)
`git diff --stat 4c1b0bb...HEAD -- docs/02-architecture/api-contracts` est vide. Les fichiers `household.ts`, `invite-code.ts` et `_contract.ts` ne changent pas, comme la tranche l'annonce.

`apps/web/src/lib/contracts.ts` réexporte `joinHousehold`, `getInviteCode` et `regenerateInviteCode` depuis les fichiers de contrat. Les schémas d'entrée et de sortie sont donc importés, pas recopiés. Les deux routes appliquent `contract.input` et `contract.output` du contrat, et `contract.successStatus` pour le statut de succès.

## 2. Routes

| Route | Méthode | Statut de succès | Entrée | Sortie |
|---|---|---|---|---|
| `/api/household/join` | POST | 200 (`successStatus`) | `contract.input.safeParse` (`InviteCodeInput`, normalisation et regex uniquement dans le contrat) | `{ name, role: "member" }`, validé par `contract.output.parse` |
| `/api/household/invite-code` | GET | 200 | aucune | `{ code: "XXXXX-XXXXX" }`, validé par `contract.output.parse` |
| `/api/household/invite-code` | POST | 200 | aucune, le corps est ignoré | `{ code: "XXXXX-XXXXX" }`, validé par `contract.output.parse` |

Ces trois lignes sont conformes au tableau « Contrat d'API » de la tranche et aux contrats. `Cache-Control: no-store` est posé sur les succès et sur les erreurs.

### Ordre et liste des erreurs

**`join`**, ordre du contrat : 401, 409 `ALREADY_IN_HOUSEHOLD`, 422, 404 `INVITE_CODE_INVALID`, 409 `HOUSEHOLD_FULL`.
- Le 401 vient de `getSessionUser`.
- Si la validation échoue, la route vérifie d'abord `findHousehold`. Un compte déjà membre reçoit donc 409 avant 422, même avec un code mal formé (ADR-0003). Sinon elle répond 422 avec les noms de champs seulement.
- Si le code est bien formé, `lc.join_household` fait lui-même passer le contrôle « déjà membre » (`LC002`) avant le code invalide (`LC003`), puis le foyer complet (`LC004`).
- Une adhésion concurrente du même compte tombe sur `membership_user_key`, ce qui donne `LC002` puis 409.
- Les cinq erreurs du contrat sont toutes couvertes, sans erreur en trop.

**`invite-code`** (GET et POST), contrat : 401, 403 `NO_HOUSEHOLD`, 403 `INSUFFICIENT_ROLE`.
- `LC009` donne `NO_HOUSEHOLD` et `LC005` donne `INSUFFICIENT_ROLE`.
- La fonction SQL vérifie d'abord l'appartenance, puis le rôle, avant toute écriture.
- Tout autre SQLSTATE est relancé (défaut serveur). C'est conforme à la règle « `throw` pour les invariants ».

### Corps d'erreur ADR-0006
`errorResponse` produit `{ error: { code } }`, ou `{ error: { code, fields } }` pour `VALIDATION_FAILED` seulement. C'est la forme de `ErrorBody`.
- Il n'y a pas de message technique.
- `fields` contient les chemins des champs, jamais les valeurs.
- Le 404 est identique pour un code inconnu et un code remplacé, car les deux passent par `LC003`.
- Aucun nom ni identifiant de foyer n'est renvoyé avant l'adhésion.

Les types partagés `ApiError` et `Result` ont reçu des variantes ajoutées (`NO_HOUSEHOLD`, `INSUFFICIENT_ROLE`, `INVITE_CODE_INVALID`, `HOUSEHOLD_FULL`). Aucune variante existante n'est retirée ni modifiée.

## 3. Contrats existants : `getMe`, `createHousehold`
Ils sont inchangés. Leurs routes ne figurent pas dans le diff.
- `apps/web/src/lib/household.ts` n'ajoute que `joinHousehold`. Le diff ne touche pas `findHousehold` ni `createHousehold`.
- Le diff de `contracts.ts` ne fait qu'ajouter des exports.
- `tests/household/screens.test.ts` perd 8 lignes : c'est la retouche annoncée du test qui exigeait le bloc « rejoindre » désactivé. Ce test ne porte pas sur un contrat d'API.

## 4. Base de données et migrations
Le diff sous `packages/db/migrations` contient seulement trois fichiers, tous en ajout (941 insertions, 0 suppression) :
- `0005_join_invite_code.sql` ;
- `meta/0005_snapshot.json` ;
- `meta/_journal.json`, où une entrée `idx 5` est ajoutée en fin de liste.

Les migrations `0000` à `0004` sont donc intactes.

`0005` ne contient que trois `CREATE FUNCTION` : `lc.join_household(text)`, `lc.get_invite_code()` et `lc.regenerate_invite_code()`.
- Il n'y a ni `CREATE/ALTER/DROP TABLE`, ni colonne, ni politique, ni rôle.
- Il n'y a ni `CREATE OR REPLACE` ni `DROP` : aucune fonction existante n'est redéfinie.
- Les droits ajoutés ne portent que sur les nouvelles fonctions : `OWNER TO lc_definer`, `REVOKE ALL FROM PUBLIC`, `GRANT EXECUTE TO lc_app`. Aucun droit existant n'est modifié.
- Le tableau des migrations de `ERD.md` §9 reçoit une ligne en plus, plus une note des écarts (remise à vide de `app.invite_code_lookup`, tirage égal à l'ancien code compté dans les 5 essais). Ces ajouts ne retirent rien au schéma décrit.

Au passage : `join_household` rend `void` et lève `LC001` à `LC004`. Les SQLSTATE `LC00x` sont nouveaux, aucun consommateur existant ne les attend. L'ordre des erreurs correspond à ERD §4.4.

## 5. Événements, webhooks, énumérations
Aucun événement, webhook ni file de messages n'est touché. Aucune valeur d'énumération n'est retirée.

## 6. Constat
- Je ne constate aucune rupture : ni champ, ni statut, ni route, ni colonne, ni droit, ni valeur d'énumération, ni migration appliquée modifiée.
- Aucun ADR de migration n'est requis.
- Observation sans gravité : le test et la route s'appuient sur l'ordre « 409 avant 422 » par une double vérification, `findHousehold` côté route puis `LC002` côté base. Les deux sont cohérentes avec le contrat.

Fichiers examinés :
- `C:\dev\liste-courses\apps\web\src\app\api\household\join\route.ts`
- `C:\dev\liste-courses\apps\web\src\app\api\household\invite-code\route.ts`
- `C:\dev\liste-courses\apps\web\src\lib\household.ts`
- `C:\dev\liste-courses\apps\web\src\lib\invite-code.ts`
- `C:\dev\liste-courses\apps\web\src\lib\errors.ts`
- `C:\dev\liste-courses\apps\web\src\lib\contracts.ts`
- `C:\dev\liste-courses\packages\db\migrations\0005_join_invite_code.sql`
- `C:\dev\liste-courses\docs\02-architecture\api-contracts\household.ts`
- `C:\dev\liste-courses\docs\02-architecture\api-contracts\invite-code.ts`
- `C:\dev\liste-courses\docs\02-architecture\api-contracts\_contract.ts`

CONTRACTS: PASS
