# ADR-0008 — Lint : ESLint, typescript-eslint en mode type-aware, regles Next

- **Statut** : propose par l'implementeur de la tranche 001 ; accepte a la fusion de la PR de la tranche.
- **Date** : 2026-10-30
- **Phase** : 3 — tranche 001

## Contexte
`pnpm run check` (CI, pre-push, `close-slice.sh`) enchaine `typecheck` et `lint`. CLAUDE.md interdit `any` et toute suppression de verification de type ; il faut un outil qui le verifie mecaniquement. Le contrat de tranche prevoit un ADR « si ESLint est retenu ».

## Options envisagees
- **A — ESLint + typescript-eslint (type-aware) + eslint-config-next** : patron de Signet (ADR-0009, ADR-0013), connu de l'usine ; seules regles officielles de Next (React, hooks, a11y, Next).
- **B — Biome** : plus rapide, une seule dependance ; pas de regles Next ni d'analyse typee (`no-floating-promises`, `no-unsafe-*`). Dependance nouvelle pour l'usine.
- **C — Pas de lint, `tsc --strict` seul** : ne detecte ni `any` explicite, ni promesse oubliee, ni regle React.

## Decision
**Option A**, configuration `eslint.config.mjs` reprise de Signet sans ses regles propres (facturation) :
- `tseslint.configs.recommendedTypeChecked` sur tout le TypeScript, `projectService` avec les fichiers de configuration en projet par defaut ;
- `no-explicit-any` et `ban-ts-comment` (ts-ignore, ts-expect-error, ts-nocheck) en erreur ;
- `eslint-config-next` (core-web-vitals + typescript) limite a `apps/web`, sans ses `ignores` globaux ;
- ignores : `node_modules`, `.next`, `next-env.d.ts`, `dist`, `packages/db/migrations`, `.claude`, `docs/templates`.

Versions : ADR-0007 (ESLint 9.39.5, D-026).

## Consequences acceptees
- Le lint type-aware est lent (quelques secondes) ; acceptable a cette taille.
- `eslint-config-next` tire trois greffons qui fixent la ligne ESLint utilisable.

## Signal de reexamen
Next publie une configuration Biome officielle, ou le lint depasse la minute.
