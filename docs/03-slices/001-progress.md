# 001 — journal d'avancement

Tenu par l'implementeur apres **chaque commit**. C'est ce fichier, pas la conversation, qui permet de reprendre apres une interruption.

## Etat
- Statut : implementation terminee, AC1 a AC11 verts ; en attente des trois relecteurs puis de `close-slice.sh`
- Branche : slice/001-comptes-foyer
- Dernier commit : e9785a9 docs(slice-001): add TS7/ESLint10 backlog line, fix ADR-0005 var name (dernier commit de dependances : 48bf72d)
- Prochaine etape : relecteurs (`security-auditor`, `contract-guardian`, `code-reviewer`), visite guidee AC8 consignee dans la fiche de preuves, entree de journal de projet, `close-slice.sh` — par l'orchestrateur

## Contrat des tests pour l'implementeur (rapport de test-writer)
- Limiteur : `apps/web/src/lib/auth-rate-limit.ts`, `buildRateLimitOptions(env)` -> `{ enabled, customRules }`, regle `/sign-up/*` = `{ window: 10, max: 3 }`, ne lit pas `process.env`.
- `apps/web/src/lib/auth.ts` lu comme texte par AC1 : `minPasswordLength: 8`, `maxPasswordLength: 128`, aucune fonction d'envoi d'e-mail.
- `zod`, `pg` et `@types/pg` en devDependencies de la racine (contrats importes depuis `docs/`).
- Pages : `/`, `/sign-up`, `/sign-in`, `/no-household`, `/household` (redirections decrites en tete de `tests/household/screens.test.ts`) ; `data-testid="item-list"`.
- Paris a verifier sur better-auth 1.7.14 : codes `INVALID_ORIGIN` et `MISSING_OR_NULL_ORIGIN` (confirmes), reponse a un prenom invalide (422 `VALIDATION_FAILED`, confirme via le hook). Paris faux : `INVALID_EMAIL` et `USER_ALREADY_EXISTS` (D-030).
- Tests hors AC ajoutes : connexion avec l'adresse en majuscules (Q-3), CHECK `household_member_limit`, immuabilite de `membership`, CHECK de minuscules sur l'e-mail.

## Couches
- [x] Echafaudage — 8d6b818 build(slice-001): scaffold pnpm workspace, TypeScript, ESLint, Vitest
- [x] Migration — 05bd275 feat(db): add lc and lc_auth schemas, roles, RLS and create_household
- [x] Acces donnees + authentification — efde3ee feat(auth): configure better-auth in lc_auth with validated env
- [x] Logique metier + API — 4c1e882 feat(household): add GET /api/me and POST /api/household
- [x] UI — 16d44d2 feat(ui): add sign-up, sign-in, no-household and household pages
- [x] CI et modele de build — d011e6c ci(slice-001): set test variables and build environment
- [x] Suite complete verte + `pnpm run check` + `bash scripts/ci-build.sh` + `pnpm audit --prod --audit-level=high`

Resultats (2026-10-30, poste Windows) : `pnpm test` 10 fichiers, 111 tests verts ; `pnpm run check` vert ; `bash scripts/ci-build.sh` construit ; `pnpm audit --prod --audit-level=high` code 0 (un avis modere esbuild, ADR-0007).

Correctifs humains (D-038, D-039) :
- [x] 48bf72d build(deps): override esbuild for GHSA-67mh-4wv8-2f99 — `esbuild: ">=0.25.0"` (resolu en 0.25.12 et 0.28.2) ; `pnpm audit --prod` : « No known vulnerabilities found », code 0 ; `pnpm peers check` : aucun probleme, code 0 ; `pnpm run check` code 0 ; `pnpm test` 10 fichiers, 111 tests verts, code 0 ; `bash scripts/ci-build.sh` code 0.
- [x] e9785a9 docs(slice-001): add TS7/ESLint10 backlog line, fix ADR-0005 var name — ligne de reevaluation dans `000-backlog.md`, ADR-0005 amende (`AUTH_DATABASE_URL`), renvoi de l'ERD §1 mis a jour. Aucun test modifie.

## Blocages
Aucun. Risque D-029 leve tot (sign-up reel contre la base de test, juste apres les migrations `lc_auth`).

## Decisions
- Decisions humaines d'ouverture : D-026 (TypeScript et ESLint), D-027 (pas de Playwright), D-028 (modeles d'environnement au perimetre), D-029 (arret au moindre refus de better-auth ; ports 3200 et 3210).
- Registre : D-030 (codes better-auth reels), D-031 (test AC5 de privileges corrige, a valider), D-032 (versions, ADR-0007), D-033 (lint, ADR-0008), D-034 (mots de passe des roles en CI), D-035 (configuration better-auth).
- **Migrateur** : migrateur de drizzle-orm (journal Drizzle, schema `drizzle`), et non un runner maison comme Signet : l'ERD prescrit `drizzle-kit generate --custom` dans le meme journal ; aucune table d'historique dans un schema applicatif. Ordre : schemas generes d'abord (0000), puis roles (0001) avant les tables (0002), car les `DEFAULT lc.uuidv7()` exigent la fonction.
- **Pas de `dotenv`** : `pnpm db:migrate` lit `DATABASE_URL_MIGRATE` dans l'environnement du processus (pose par le globalSetup ; en developpement, dans le terminal de l'humain). Ecarte : ajouter `dotenv` (dependance hors contrat) ou `--env-file` (fichier de plus a documenter).
- **Validation de l'environnement au demarrage dans `next.config.ts`** (`parseServerEnv`, noms de variables seulement) : `instrumentation.ts` est hors du perimetre `.gates/scope-001.txt`. Effet : `next dev`, `next build` et `next start` refusent un environnement invalide, limiteur compris. Instances better-auth et pools crees au premier usage.
- **Noms de variables du serveur** : `DATABASE_URL` (lc_app), `AUTH_DATABASE_URL` (lc_better_auth), ceux du contrat de tranche ; l'ERD et ADR-0005 disaient `DATABASE_URL_AUTH` (ERD corrige, ADR-0005 hors perimetre).
- **Hook du prenom** : `hooks.before` sur `/sign-up/email`, schema `signUp.input.shape.name` du contrat ; il s'execute apres la validation de corps de better-auth (une adresse mal formee donne donc 400 avant le prenom).
- **Routes better-auth desactivees** (`disabledPaths`, 404) : update-user (AC10), change-email, change-password, delete-user(/callback), request-password-reset, reset-password, send-verification-email, verify-email, sign-in/social, link-social, unlink-account, get-access-token, refresh-token, update-session. Ecarte : hook qui refuse seulement `name` (laisserait `image` modifiable, hors PRD).
- **POST /api/household, ordre ADR-0003** : sur corps invalide, le foyer est relu d'abord ; un compte qui a deja un foyer recoit 409 avant 422.
- **Corps d'erreur** : `{ error: { code, fields? } }`, `fields` = chemins Zod, jamais les valeurs ; `Cache-Control: no-store` sur les reponses de l'API.
- **Requetes de lc_app** : SQL parametre via `pg`, filtre explicite `lc.current_household_id()` en plus de la RLS ; Drizzle n'est utilise que par l'adaptateur better-auth.
- **UI** : textes sans accents (convention du depot), navigation par `useRouter` apres les mutations, aucun style.
- **Test AC5 modifie** (D-031) et **tests sign-up modifies** (D-030) : seuls changements de tests ; aucune assertion affaiblie.
- **`esbuild` (avis modere GHSA-67mh-4wv8-2f99)** laisse sans `overrides` : sous le seuil `high`, a trancher par l'humain.
