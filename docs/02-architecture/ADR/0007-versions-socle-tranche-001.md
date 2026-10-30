# ADR-0007 — Versions du socle et dependances directes (tranche 001)

- **Statut** : propose par l'implementeur de la tranche 001 ; applique D-026 (humain). Accepte a la fusion de la PR de la tranche.
- **Date** : 2026-10-30
- **Phase** : 3 — tranche 001

## Contexte
La tranche 001 cree l'application. `rules/dependencies.md` impose : version `latest` interrogee au registre, epinglage exact, quarantaine pnpm (aucune version de moins d'un jour), ADR pour toute dependance directe (besoin, alternatives, licence, date de publication), et pour toute retrogradation l'erreur exacte constatee.

D-026 (humain) : essayer `typescript@7.0.2` et `eslint@10.13.0` (`latest`), reproduire l'echec annonce par les pairs declares, puis retrograder en `typescript@6.0.3` et `eslint@9.39.5`.

## Essai de `latest` et erreurs constatees (2026-10-30, pnpm 12.3.4, Node 24.19.0)

### TypeScript 7.0.2
`pnpm add -w -E -D typescript@7.0.2 eslint@10.13.0 typescript-eslint@8.72.1 eslint-config-next@16.4.3 ...` puis :

1. `pnpm peers check` (code de sortie 1) :
   ```
   ✕ unmet peer typescript
     Installed: 7.0.2
     Wanted:
       ">=4.8.4 <6.1.0":
         typescript-eslint@8.72.1
         @typescript-eslint/eslint-plugin@8.72.1
         @typescript-eslint/parser@8.72.1
         ...
   ```
2. `pnpm exec eslint docs/02-architecture/api-contracts/_contract.ts` : arret immediat du lint.
   ```
   typescript-eslint does not support TS 7.0.
   Please see https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0 to run typescript-eslint using the TS 6 API.
   See also https://github.com/typescript-eslint/typescript-eslint/issues/10940 for tracking typescript-eslint's support for TS >=7.1

   Oops! Something went wrong! :(
   ESLint: 10.13.0
   Error: typescript-eslint does not support TS 7.0.
       at Object.<anonymous> (...\typescript-eslint@8.72.1_eslint@10.13.0_typescript@7.0.2\node_modules\typescript-eslint\dist\index.js:52:11)
   ```
   (`tsc` 7.0.2 lui-meme compile le depot.) Incompatibilite bloquante : `pnpm run check` ne peut pas passer. Retrograde en **6.0.3**, derniere version de la ligne 6.0, compatible avec `typescript-eslint` (`<6.1.0`).

### ESLint 10.13.0 (avec TypeScript 6.0.3)
`pnpm peers check` (code de sortie 1) :
```
✕ unmet peer eslint
  Installed: 10.13.0
  Wanted:
    "^2 || ^3 || ^4 || ^5 || ^6 || ^7.2.0 || ^8 || ^9":
      eslint-plugin-import@2.32.0
    "^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9":
      eslint-plugin-jsx-a11y@6.10.2
    "^3 || ^4 || ^5 || ^6 || ^7 || ^8 || ^9.7":
      eslint-plugin-react@7.37.5
```
Ces trois greffons sont charges par `eslint-config-next@16.4.3`. **Constat honnete** : le lint lui-meme a tourne sous ESLint 10.13.0 sur les fichiers essayes (`react/jsx-key`, `react-hooks/static-components`, `jsx-a11y/alt-text`, `@next/next/no-img-element` se declenchent normalement) ; l'incompatibilite constatee est celle des pairs declares, pas un plantage. La retrogradation en **9.39.5** (derniere de la ligne 9) suit D-026 : faire tourner trois greffons hors de la plage qu'ils declarent expose a des regles silencieusement fausses, et `pnpm peers check` reste vert. Apres retrogradation : `No peer dependency issues found` (code 0).

**A reevaluer** (ligne de backlog demandee par `rules/dependencies.md`, a ajouter par l'orchestrateur, `000-backlog.md` etant hors du perimetre de 001) : TypeScript 7 quand `typescript-eslint` le supporte ; ESLint 10 quand `eslint-config-next` livre des greffons qui le declarent.

## Dependances directes retenues
Toutes interrogees au registre le 2026-10-30 (`pnpm view <paquet> dist-tags`, `pnpm view <paquet>@<v> time`), toutes publiees depuis plus d'un jour, toutes `latest` sauf mention.

| Paquet | Version | Publiee le | Licence | Ou | Besoin | Alternative ecartee |
|---|---|---|---|---|---|---|
| next | 16.4.3 | 2026-10-23 | MIT | web | cadre (ADR-0001) | — (socle gele) |
| react, react-dom | 19.3.1 | 2026-10-14 | MIT | web | rendu (pair de next) | — |
| better-auth | 1.7.14 | 2026-10-26 | MIT | web | authentification (ADR-0003) | auth maison, Clerk (ADR-0003) |
| drizzle-orm | 0.45.4 | 2026-10-08 | Apache-2.0 | web, db | schema, migrateur, adaptateur better-auth (pair `^0.45.2`) | SQL brut seul : pas d'adaptateur better-auth qui qualifie le schema `lc_auth` |
| pg | 8.23.1 | 2026-09-30 | MIT | web, db, racine (tests) | pilote Postgres | postgres.js : aucun gain, et `pg` est deja celui des tests de l'usine (`tests/_factory`) |
| zod | 4.6.7 | 2026-10-12 | MIT | web, db, racine (contrats importes par les tests) | validation des entrees et de l'environnement (D-018) | — (impose par ADR-0006) |
| @lc/db | workspace | — | — | web | schema Drizzle partage avec better-auth | dupliquer le schema dans `apps/web` |
| drizzle-kit | 0.31.11 | 2026-09-21 | MIT | db (dev) | generation des migrations | SQL ecrit a la main pour tout : contraire a l'ERD |
| tsx | 4.23.15 | 2026-09-20 | MIT | db (dev) | execute `src/migrate.ts` | compiler avant d'executer : etape de plus |
| typescript | **6.0.3** (`latest` 7.0.2) | 2026-04-16 | Apache-2.0 | racine, web, db (dev) | typage | voir ci-dessus |
| eslint | **9.39.5** (`latest` 10.13.0) | 2026-07-10 | MIT | racine (dev) | lint (ADR-0008) | voir ci-dessus |
| typescript-eslint | 8.72.1 | 2026-10-26 | MIT | racine (dev) | lint type-aware | — |
| eslint-config-next | 16.4.3 | 2026-10-23 | MIT | racine (dev) | regles Next/React | — |
| vitest | 5.0.5 | 2026-10-15 | MIT | racine (dev) | tests (`stack.json`) | — |
| @types/node | **24.19.2** (`latest` 26.6.6) | 2026-10-09 | MIT | racine, web, db (dev) | types Node | ligne 26 : le runtime est Node 24 (`.nvmrc`), les types doivent decrire la ligne executee |
| @types/pg | 8.23.1 | 2026-08-17 | MIT | racine, web, db (dev) | types de `pg` | — |
| @types/react, @types/react-dom | 19.3.0 | 2026-09-09 | MIT | web (dev) | types React | — |

Non installe : `@playwright/test` (D-027). Aucun `dotenv` : le migrateur lit `DATABASE_URL_MIGRATE` dans l'environnement du processus.

## Scripts d'installation (`allowBuilds`, `pnpm-workspace.yaml`)
- `esbuild: true` — binaire natif d'esbuild, utilise par `tsx` et `drizzle-kit` (outillage de developpement).
- `unrs-resolver: false` — postinstall de repli qui telecharge un binaire si la dependance optionnelle de plateforme manque ; elle est installee (meme choix que Signet, ADR-0009).

## Audit
`pnpm audit --prod --audit-level=high` : code 0. Un avis **modere** subsiste : GHSA-67mh-4wv8-2f99 (`esbuild <= 0.24.2`, serveur de developpement d'esbuild), chemin `apps__web>better-auth>drizzle-kit>@esbuild-kit/esm-loader>@esbuild-kit/core-utils>esbuild` (pair optionnel de better-auth). Sous le seuil ; aucun `overrides` ajoute dans cette tranche (Signet l'a corrige par `esbuild: ">=0.25.0"`) : a trancher par l'humain.

## Consequences acceptees
- Deux outils restent une ligne majeure derriere `latest` jusqu'a la reevaluation.
- Les versions sont epinglees exactement et le lockfile est committe ; Dependabot proposera les montees.

## Signal de reexamen
`typescript-eslint` declare TypeScript 7 ; `eslint-config-next` livre des greffons qui declarent ESLint 10 ; un avis de securite touche une de ces dependances.
