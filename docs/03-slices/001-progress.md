# 001 — journal d'avancement

Tenu par l'implementeur apres **chaque commit**. C'est ce fichier, pas la conversation, qui permet de reprendre apres une interruption.

## Etat
- Statut : tests ecrits
- Branche : slice/001-comptes-foyer
- Dernier commit : d833e02 test(slice-001): write acceptance tests for AC1-AC11
- Prochaine etape : l'humain remplit `.env.test.local` d'apres `.env.test.example` ; puis `/implement` (echafaudage, migrations)

## Contrat des tests pour l'implementeur (rapport de test-writer)
- Limiteur : `apps/web/src/lib/auth-rate-limit.ts`, `buildRateLimitOptions(env)` -> `{ enabled, customRules }`, regle `/sign-up/*` = `{ window: 10, max: 3 }`, ne lit pas `process.env`.
- `apps/web/src/lib/auth.ts` lu comme texte par AC1 : `minPasswordLength: 8`, `maxPasswordLength: 128`, aucune fonction d'envoi d'e-mail.
- `zod`, `pg` et `@types/pg` en devDependencies de la racine (contrats importes depuis `docs/`).
- Pages : `/`, `/sign-up`, `/sign-in`, `/no-household`, `/household` (redirections decrites en tete de `tests/household/screens.test.ts`) ; `data-testid="item-list"`.
- Paris a verifier sur better-auth 1.7.14 : codes `INVALID_ORIGIN` et `MISSING_OR_NULL_ORIGIN`, reponse a un prenom invalide (contrat : 422 `VALIDATION_FAILED`).
- Tests hors AC ajoutes : connexion avec l'adresse en majuscules (Q-3), CHECK `household_member_limit`, immuabilite de `membership`, CHECK de minuscules sur l'e-mail.

## Couches
- [ ] Migration
- [ ] Acces donnees
- [ ] Logique metier
- [ ] API
- [ ] UI
- [ ] Suite complete verte + `pnpm run check`

## Blocages
<!-- cause, essais, options. Vide = aucun. -->

## Decisions
<!-- Toute decision prise sans l'humain, avec sa raison. Reprise dans la PR. -->
- Decisions humaines d'ouverture : D-026 (TypeScript et ESLint), D-027 (pas de Playwright), D-028 (modeles d'environnement au perimetre), D-029 (arret au moindre refus de better-auth ; ports 3200 et 3210).
