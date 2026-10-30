# 001 — Comptes et creation du foyer

## Capacite
En tant que personne du foyer, je peux creer un compte, me connecter et me deconnecter. Sans foyer, je peux creer le mien et en devenir la responsable, afin de disposer d'une liste partagee pour ma famille.

User stories : US-01, US-02, US-03, US-04 (PRD). Backlog : premiere tranche, fondation et risque le plus eleve (D-019).

## Perimetre
### Touche
**Base**
- Schemas `lc` et `lc_auth` (ERD).
- Roles `lc_owner`, `lc_app`, `lc_better_auth`, `lc_definer` (ADR-0005). Ces noms sont distincts des roles `signet_*` qui vivent sur le meme serveur Postgres local.
- Fonctions de contexte `lc.current_user_id()` et `lc.current_household_id()`, puis `lc.uuidv7()` et `lc.new_invite_code()`.
- Tables `lc_auth.app_user`, `session`, `account`, `verification`, et `lc.household`, `lc.membership`, `lc.invite_code`.
- Triggers de compteur et d'immuabilite de `membership`, et trigger qui protege la responsable (`LC007`).
- Fonction `SECURITY DEFINER` `lc.create_household(text)`.
- `ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`.
- Politiques RLS de toutes ces tables. Migrations generees par Drizzle, plus des migrations SQL ecrites a la main.

**Application** (`apps/web`)
- Configuration better-auth (ADR-0003) : e-mail et mot de passe, bornes 8 et 128, prenom valide et trime, limiteur verrouille par `APP_ENV`, controle d'origine actif.
- Acces base sous `lc_app` avec `SET LOCAL app.user_id` en debut de transaction (ADR-0002).
- Couche de service et erreurs typees.
- Route Handlers `GET /api/me` et `POST /api/household` (contrats `household.ts`), et montage de better-auth sous `/api/auth` (contrat `auth.ts`).

**Ecrans** (sobres, sans bibliotheque de style)
- Inscription.
- Connexion.
- Page « sans foyer » : formulaire « creer un foyer ». Le bloc « rejoindre avec un code » est visible mais desactive, avec la mention qu'il arrive bientot.
- Page du foyer : nom du foyer et liste vide.
- Bouton de deconnexion.

**Echafaudage** : espace pnpm (`apps/web`, `packages/db`), configurations TypeScript, Vitest, ESLint et Drizzle, scripts `check`, `typecheck`, `lint`, `test`, `db:generate` et `db:migrate`.

**CI et modeles d'environnement** (D-028) : variables `TEST_*` du job `ci` (`.github/workflows/ci.yml`), l'etape de preparation des roles si necessaire (`ci:db-setup`), `ci/build.env` et `.env.test.example`. Ce sont des modeles sans secret, ecrits entierement avec des valeurs visiblement factices.

**Documentation**
- ADR des versions et des dependances.
- ADR du lint si ESLint est retenu.
- ADR du limiteur s'il s'ecarte d'ADR-0003.
- Mise a jour de l'ERD si l'implementation l'ecarte de sa specification.
- Precision des codes better-auth dans `api-contracts/auth.ts`.
- Registre, journal de la tranche, frictions, entree de journal de projet.

### NE touche PAS
- **Rejoindre un foyer par code**, et lire ou regenerer le code (US-05, US-11) : tranche 002. Le code est **cree** par `create_household`, mais aucune route ne le lit. Aucune fonction `join_household`, `get_invite_code` ni `regenerate_invite_code`.
- **Articles et liste** (US-06 a US-09) : tranche 003. La page du foyer affiche une liste vide statique. Pas de table `lc.item`, pas de fonction `add_item`, pas de compteur d'articles rempli.
- **Membres** : consulter, retirer, quitter (US-10, US-12, US-13) : tranche 004. Pas de fonction `remove_member` ni `leave_household`.
- **Modification du prenom, de l'adresse ou du mot de passe**, recuperation de mot de passe, verification d'adresse, tout envoi d'e-mail (PRD, hors perimetre). Les routes better-auth correspondantes ne sont ni configurees ni exposees par l'interface.
- **Suppression de compte**, RGPD, mineurs (risque R1).
- Robot de navigateur : Playwright n'est pas installe (D-027).
- Aucune dependance hors de la liste « Versions » ci-dessous sans ADR.

## Dependances
- Tranches devant etre closes avant celle-ci : aucune.
- Gates : PRD (`.gates/01-prd.approved`) et architecture (`.gates/02-architecture.approved`) approuves.
- Branche creee depuis `docs/cadrage` (D-007) : la premiere PR portera le cadrage et cette tranche.

## Contrat de donnees
| Table | Colonnes ajoutees / modifiees | Contraintes et index |
|---|---|---|
| `lc_auth.app_user` | creee selon l'ERD : `id`, `email`, `name` (prenom), champs exiges par better-auth | `email` unique, en minuscules ; `name` de 1 a 30 points de code, sans espace de bord ; RLS forcee ; acces `lc_better_auth` seul |
| `lc_auth.session`, `account`, `verification` | creees selon l'ERD | RLS forcee ; acces `lc_better_auth` seul |
| `lc.household` | `id` (UUIDv7), `name`, `member_count`, `item_count`, `created_at` | `name` de 1 a 50 sans espace de bord ; CHECK `household_member_limit` (≤ 10) et `household_item_limit` (≤ 200) ; RLS |
| `lc.membership` | `id`, `household_id`, `user_id`, `role`, `display_name`, `created_at` | `user_id` unique ; au plus une `owner` par foyer (index unique partiel) ; ligne immuable ; RLS |
| `lc.invite_code` | `household_id` (cle), `code` | format Crockford 10 caracteres ; unique global ; aucun droit pour `lc_app` ; RLS |

Le detail exact (types, politiques, ordre des instructions de `create_household`) est celui de l'ERD, sections 2 a 4.

## Contrat d'API
| Route | Methode | Entree | Sorties | Role minimal | Idempotent sur |
|---|---|---|---|---|---|
| `/api/auth/sign-up/email` | POST | `email`, `password` (8 a 128), `name` (1 a 30 trime) | `200 { user }` + cookie ; 400 `VALIDATION_ERROR` (adresse), `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG` ; 422 `VALIDATION_FAILED`, `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` (codes constates, D-030) ; 429 | public | non : un rejeu donne `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` |
| `/api/auth/sign-in/email` | POST | `email`, `password` | `200 { user }` + cookie ; 401 `INVALID_EMAIL_OR_PASSWORD` ; 429 | public | rejouable |
| `/api/auth/sign-out` | POST | — | `200 { success: true }` | public | oui |
| `/api/me` | GET | — | `200 { user: { name }, household: null \| { name, role } }` ; 401 | authenticated | lecture |
| `/api/household` | POST | `name` (1 a 50 trime) | `201 { name, role: "owner" }` ; 401 ; 409 `ALREADY_IN_HOUSEHOLD` ; 422 `VALIDATION_FAILED` | no-household | non, sans doublon : un rejeu donne 409 |

La source de verite est `docs/02-architecture/api-contracts/auth.ts` et `household.ts` (`getMe`, `createHousehold`). Les codes better-auth y sont verifies sur la version installee ; un ecart corrige le contrat, avec une ligne au registre.

## Criteres d'acceptation
<!-- Format lu par scripts/close-slice.sh : « - [ ] AC1 — titre », coche « - [x] » une fois prouve. -->
- [ ] AC1 — **Inscription nominale** (US-01.1, .4, .7, .8)
  - Une inscription avec une adresse valide, un mot de passe de 8 caracteres puis de 128, et un prenom `"  Marie  "` cree le compte, ouvre une session et enregistre le prenom `"Marie"`.
  - Juste apres, `GET /api/me` rend `household: null`.
  - Aucun e-mail n'est envoye : aucune fonction d'envoi n'est configuree, ce que verifie un test de la configuration.
- [ ] AC2 — **Inscription refusee** (US-01.2, .3, .5, .6), sans aucune ligne creee dans `app_user` :
  - mot de passe de 7 caracteres, puis de 129 ;
  - prenom vide, fait d'espaces, ou de 31 points de code. A l'inverse, 30 points de code dont des emoji sont acceptes (Q-2) ;
  - adresse mal formee ;
  - adresse deja utilisee, y compris avec une autre casse (Q-3).
  - Les statuts et codes sont ceux du contrat `signUp`.
- [ ] AC3 — **Connexion et deconnexion** (US-02.1, .2, .4, .5)
  - Les bons identifiants ouvrent une session.
  - Un mauvais mot de passe et une adresse inconnue donnent le meme statut, le meme code et le meme message.
  - Apres `sign-out`, l'ancien cookie donne `401 UNAUTHENTICATED` sur `GET /api/me`.
  - Sans session, `GET /api/me` et `POST /api/household` donnent `401`, et les pages du foyer redirigent vers la connexion.
- [ ] AC4 — **Limiteur** (US-02.3, ADR-0003)
  - Test pur de la fonction de configuration : actif par defaut, avec la regle d'inscription ecrite chez nous.
  - `off` est accepte seulement avec `APP_ENV=test`.
  - `off` avec `production`, avec `development` ou sans `APP_ENV`, et toute valeur invalide, levent au demarrage.
- [ ] AC5 — **Isolation entre foyers**, avec deux foyers reels A et B, chacun avec sa responsable :
  - Par l'API, `GET /api/me` de A ne contient rien de B.
  - Directement en base sous `lc_app`, avec `app.user_id` = responsable de A : `household`, `membership` et `invite_code` ne rendent aucune ligne de B, et toute ecriture visant B est refusee ou touche 0 ligne.
  - Sans `app.user_id`, ou avec un utilisateur sans foyer, aucune ligne n'est visible.
  - `lc_app` n'a aucun droit sur `lc_auth` ni sur `lc.invite_code`.
- [ ] AC6 — **Creation du foyer** (US-03.1, .3)
  - Un compte sans foyer cree « Famille Martin » et recoit `201 { name, role: "owner" }`.
  - `GET /api/me` rend alors ce foyer avec le role `owner`.
  - En base : une seule appartenance (`owner`, `display_name` = prenom), `member_count` = 1, `item_count` = 0, et un code de 10 caracteres de l'alphabet de Crockford.
  - La page du foyer affiche son nom et une liste vide.
- [ ] AC7 — **Creation refusee et cas limites** (US-03.2, .4)
  - Nom vide, fait d'espaces, ou de 51 points de code : `422`, et aucun foyer n'est cree.
  - Un compte qui a deja un foyer : `409 ALREADY_IN_HOUSEHOLD`, sans second foyer.
  - **Concurrence** : deux `POST /api/household` simultanes du meme compte donnent un seul `201` et un seul `409`, et un seul foyer existe.
- [ ] AC8 — **Page « sans foyer »** (US-04)
  - Un compte connecte sans foyer voit la page qui propose « creer un foyer » et « rejoindre avec un code ».
  - Une fois qu'il a un foyer, il voit la page du foyer et non plus celle-ci.
  - Les pages sont prouvees par lecture du HTML rendu par le serveur, et par une visite guidee consignee dans la fiche de preuves.
- [ ] AC9 — **Garanties de la base** (ADR-0005, `rules/drizzle-postgres.md`)
  - Le test de catalogue de l'usine est vert.
  - `FORCE ROW LEVEL SECURITY` s'applique au proprietaire : sous `SET ROLE lc_owner`, aucune ligne n'est visible sans contexte.
  - `lc.create_household` appelee sans `app.user_id` leve `LC001`.
  - Une fonction creee apres coup sous le role de migration n'est pas executable par PUBLIC.
  - Le trigger refuse la suppression de la ligne `owner` (`LC007`), meme sous un role qui contourne la RLS.
  - Les quatre roles n'ont ni SUPERUSER ni BYPASSRLS.
- [ ] AC10 — **Prenom non modifiable** (ADR-0003, D-009) : la route de mise a jour de profil de better-auth ne peut pas changer `name` (refus ou route absente), ce que verifie un test.
- [ ] AC11 — **Controle d'origine** (ADR-0003) : une inscription avec un en-tete `Origin` etranger est refusee, et aucun compte n'est cree.

## Anti-regression
- La suite de l'usine (`tests/_factory/db-catalog.test.ts`) reste verte.
- `pnpm run check`, `pnpm test`, `bash scripts/ci-build.sh` et `pnpm audit --prod --audit-level=high` sont propres en local. La CI reprend les memes commandes.

## Echafaudage prevu (commandes shell, hors controle du hook de perimetre)
A verifier apres coup par `git status --short` : rien ne doit apparaitre hors du perimetre `.gates/scope-001.txt`.

1. Fichiers de manifeste ecrits avec l'outil Write : `package.json`, `pnpm-workspace.yaml`, `apps/web/package.json`, `packages/db/package.json`. Pas de `create-next-app`, qui genere des fichiers hors perimetre et des dependances non choisies.
2. `pnpm add -w -E -D <outillage>`, `pnpm --filter @lc/web add -E <dependances>`, `pnpm --filter @lc/db add -E <dependances>`. Versions exactes, prises dans la liste ci-dessous, avec la quarantaine pnpm respectee.
3. `pnpm install`, puis `pnpm peers check`.
4. `pnpm db:generate` (migrations Drizzle). Les migrations SQL ecrites a la main le sont avec l'outil Write.
5. `pnpm db:migrate` (base de developpement), `pnpm test`, `pnpm run check`, `bash scripts/ci-build.sh`.

## Versions (registre interroge le 2026-10-30, toutes publiees depuis plus d'un jour)
| Paquet | Version | Publiee le | Note |
|---|---|---|---|
| next, eslint-config-next | 16.4.3 | 2026-10-23 | ligne active |
| react, react-dom | 19.3.1 | 2026-10-14 | |
| @types/react, @types/react-dom | 19.3.0 | 2026-09-09 | |
| better-auth | 1.7.14 | 2026-10-26 | pairs : `pg` ^8, `drizzle-orm` ^0.45.2, `vitest` ≤ 5 |
| drizzle-orm | 0.45.4 | 2026-10-08 | |
| drizzle-kit | 0.31.11 | 2026-09-21 | |
| pg, @types/pg | 8.23.1 | 2026-09-30 et 2026-08-17 | |
| zod | 4.6.7 | 2026-10-12 | D-018 |
| vitest | 5.0.5 | 2026-10-15 | |
| tsx | 4.23.15 | 2026-09-20 | lance `migrate.ts` |
| @types/node | 24.19.2 | 2026-10-28 | ligne 24 = Node de `.nvmrc`, pas `latest` (26.x) |
| typescript | **7.0.2 (`latest`) a essayer** ; repli 6.0.3 | 2026-07-08 | `typescript-eslint` 8.72.1 declare `typescript <6.1.0` (D-026) |
| eslint | **10.13.0 (`latest`) a essayer** ; repli 9.39.5 | 2026-10-16 | `eslint-plugin-react` 7.37.5, charge par `eslint-config-next`, declare `eslint ^9.7` au plus (D-026) |
| typescript-eslint | 8.72.1 | 2026-10-26 | |
| @playwright/test | 1.64.1 | 2026-10-14 | **non installe** (D-027) |

## Variables d'environnement exigees par les tests (noms seulement)
A poser par l'humain dans `.env.test.local`, et en CI dans `ci.yml`.
- **Base** : `TEST_DATABASE_ADMIN_URL`, `TEST_DATABASE_NAME` (doit finir par `_test`, propose `liste_courses_test`), `TEST_ROLE_PASSWORDS` (format `lc_app:...,lc_better_auth:...`).
- **Catalogue** : `TEST_APP_SCHEMAS` (= `lc,lc_auth`), `TEST_APP_ROLES` (= `lc_owner,lc_app,lc_better_auth,lc_definer`), `TEST_RLS_EXEMPT_TABLES` (vide, ou la seule table d'historique des migrations si elle est hors des schemas).
- **Acces direct des tests sous le role applicatif (AC5)** : `TEST_DATABASE_URL_APP` (connexion `lc_app` a la base de test).
- **Serveur de test** : `TEST_APP_BASE_URL` (propose `http://localhost:3210`).
- **Variables du serveur**, transmises par le prefixe `TEST_SERVER_ENV_` :
  - `TEST_SERVER_ENV_DATABASE_URL` (role `lc_app`) ;
  - `TEST_SERVER_ENV_AUTH_DATABASE_URL` (role `lc_better_auth`) ;
  - `TEST_SERVER_ENV_BETTER_AUTH_SECRET` ;
  - `TEST_SERVER_ENV_BETTER_AUTH_URL` (= `TEST_APP_BASE_URL`) ;
  - `TEST_SERVER_ENV_APP_ENV` (= `test`) ;
  - `TEST_SERVER_ENV_AUTH_RATE_LIMIT` (= `off`).
- **Migrations** : `DATABASE_URL_MIGRATE`, pose par le `globalSetup` sur la base de test, sans action humaine.

Ports : developpement 3200, test 3210. Signet utilise 3100.

## Notes d'implementation
- **Risque a lever en premier** : better-auth doit accepter de placer ses tables dans `lc_auth` (nom `app_user`) et des identifiants uuid generes par la base. Sinon, arreter et proposer un ADR (ERD, note de fin).
- Le role proprietaire `lc_owner` est NOLOGIN : le test de FORCE passe par `SET ROLE` depuis la connexion d'administration.
- Les tests partagent une base reelle : `fileParallelism: false`, comme Signet.
- La normalisation de l'e-mail en minuscules est faite avant better-auth, ou verifiee chez lui (Q-3). Le CHECK de la base est la barriere.
- Les longueurs se comptent en points de code (`codePointLength`, `_contract.ts`).
