# Controle des contrats — tranche 001

## 2026-10-30 — rapport de contract-guardian (diff 97fcbd4..b29cb6a)

Aucune rupture de contrat sur la tranche 001. Je n'ai pas pu relire `ci/build.env` ni `.env.test.example` (hook) ni lancer les tests. Deux écarts mineurs sont consignés plus bas.

**Routes applicatives**
- **`GET /api/me`** (`apps/web/src/app/api/me/route.ts`) : route, méthode, rôle `authenticated`, statut 200 et sortie `{user:{name}, household|null}` sont conformes. L'unique erreur 401 `UNAUTHENTICATED` est bien celle du contrat. Le handler importe `getMe` via `apps/web/src/lib/contracts.ts` et valide la sortie avec `getMe.output.parse`.
- **`POST /api/household`** (`apps/web/src/app/api/household/route.ts`) : route, méthode, rôle `no-household`, statut 201 (`contract.successStatus`) et sortie `{name, role:"owner"}` sont conformes.
- **Ordre ADR-0003 pour `POST /api/household`** : session (401), puis foyer déjà présent (409), puis validation (422). Le 409 est testé avant le 422 quand le corps est invalide, et `LC002` couvre la création concurrente. Le 422 renvoie `fields` sans les valeurs. Le corps d'erreur est `{error:{code,fields?}}`, conforme à l'ADR-0006.
- **Contrats importés** : `apps/web/src/lib/contracts.ts:5-6` réexporte `signUp`, `createHousehold` et `getMe` depuis `docs/02-architecture/api-contracts/`. Les handlers et `auth.ts` utilisent ces schémas, pas des copies.

**better-auth sous `/api/auth`**
- Le handler monté dans `apps/web/src/app/api/auth/[...all]/route.ts` correspond à `signUp`, `signIn` et `signOut`.
- Le hook du prénom (`apps/web/src/lib/auth.ts:55-66`) applique `signUp.input.shape.name` et renvoie 422 `VALIDATION_FAILED`, conforme au contrat.
- Bornes mot de passe 8 et 128 : `auth.ts:96-97`.
- Limiteur (`apps/web/src/lib/auth-rate-limit.ts`) : actif sauf `off` avec `APP_ENV=test`, comme l'ADR-0003.

**Modification d'un contrat approuvé**
- Un seul fichier de contrat a changé depuis 97fcbd4 : `docs/02-architecture/api-contracts/auth.ts`. Les autres contrats (`household.ts`, `items.ts`, `members.ts`, `invite-code.ts`, `_contract.ts`) sont inchangés. Aucun type partagé ni contrat de tranche future (items, members, invite-code, join) n'est cassé.
- `auth.ts:56-61` : 400 `INVALID_EMAIL` devient 400 `VALIDATION_ERROR`. Le statut est inchangé.
- `auth.ts:70-74` : 422 `USER_ALREADY_EXISTS` devient 422 `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`. Le statut est inchangé.
- Ces deux changements de code sont justifiés par D-030 au registre. L'en-tête du contrat prévoyait explicitement cette correction.
- Aucun client web, mobile ou tiers ne consomme ces codes avant cette tranche, la première. Il n'y a pas de version antérieure implémentée, donc pas de rupture effective.

**Schéma de base et ERD**
- Les migrations `0000` à `0004` (par exemple `packages/db/migrations/0002_tables.sql`) concordent avec l'ERD pour les sept tables : colonnes, CHECK, index uniques et partiels, valeurs par défaut `lc.uuidv7()`.
- La table `item` est bien exclue (tranche 003).
- Les écarts sont consignés dans `docs/02-architecture/ERD.md` §9 (lignes ~782-810). Ce sont des écarts mineurs : noms des clés étrangères, `search_path` sur deux fonctions, nom des triggers, variable de connexion.

**Variables d'environnement**
- `AUTH_DATABASE_URL` est cohérente entre `apps/web/src/lib/env.ts:24`, `db.ts`, `.github/workflows/ci.yml:48` (`TEST_SERVER_ENV_AUTH_DATABASE_URL`), `scripts/preparer-tests.local.ps1`, l'ERD, l'ADR-0005 et D-039.
- Plus aucune occurrence de `DATABASE_URL_AUTH` hors les mentions explicites d'amendement. Le contrat de tranche (`docs/03-slices/001-comptes-foyer.md`) l'utilise aussi.
- `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `APP_ENV` et `AUTH_RATE_LIMIT` sont alignés entre le code et `ci.yml`.

**Écarts mineurs, non bloquants**
1. Je n'ai pas pu relire `ci/build.env` ni `.env.test.example` : le hook l'interdit, conformément à la consigne. Le build à zéro rapporté par l'implémenteur passe par `scripts/ci-build.sh`, qui n'injecte que `ci/build.env`, et `next.config.ts` valide l'environnement au build. Le build vert est donc indirectement cohérent avec `env.ts`.
2. Le contrat `rateLimited` (`auth.ts`) dit encore que le corps exact du 429 « est fixé par la tranche 001 ». Je n'ai pas vérifié qu'il y est consigné ; l'écart est documentaire seulement.

CONTRACTS: PASS
