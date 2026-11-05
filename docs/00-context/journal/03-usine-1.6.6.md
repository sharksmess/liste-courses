# 03 — Adoption de l'usine 1.6.6

- **Dates** : 2026-11-05
- **Objectif** : corriger les frictions relevees pendant le cadrage et la tranche 001 avant les tranches 002 a 004, qui passeront en mode autonome.

## Ce qui a ete fait
- Usine 1.6.6 installee (`c5886b0`) : `.claude/`, `.githooks/`, `.gitignore`, `scripts/`, dont le nouveau `scripts/app-present.sh` et `references/stacks/` de `/init-stack`. Garde-fou verifie : une ecriture dans `.gates/` avec l'outil Write est refusee.
- `next-env.d.ts` n'est plus versionne (`0e8894e`) ; le `typecheck` de `apps/web` le regenere par `scripts/app-typegen.sh`.
- Etiquette du secret de test dans `.env.test.example` (`c6f7d40`) ; le pre-commit (gitleaks) l'a acceptee.
- Corrige par 1.6.6 :
  - premier commit d'un depot neuf admis sur `main` ;
  - depot de cadrage reconnu par le pre-push et la CI (`scripts/app-present.sh`) ;
  - `block-dangerous` distingue une mention de `.env` d'une lecture (here-documents, `process.env`, `git show`) ;
  - recherches recursives jugees sur les fichiers de secrets presents, `*.local.ps1` protege comme `.env` ;
  - `git add` d'une approbation deja posee par l'humain admis ;
  - message « isolation tenant » explicite ;
  - perimetre limite a `apps/`, `packages/`, `tests/` (les rapports d'`audits/` ne demandent plus de `scope-add`) ;
  - `/init-stack` aligne sur l'installeur ;
  - `slice-implementer` ne modifie aucun test et committe l'echafaudage aussitot ;
  - `next-env.d.ts` ignore par git ;
  - `allowBuilds` documente.

## Decisions
- D-047 : adoption de l'usine 1.6.6 avant les tranches 002 a 004 (humain).
- D-048 : `next-env.d.ts` n'est plus versionne (humain).
- D-049 : etiquette au lieu d'une valeur vide pour le secret de test (humain).
- D-050 : `next typegen` tourne dans l'environnement de `ci/build.env` (humain, arbitrage pendant l'adoption).

Le detail est dans `docs/DECISIONS.md`.

## Preuves
- Usine : 187/187 tests sur le poste (humain).
- Poste « neuf » : `apps/web/next-env.d.ts` supprime, `pnpm run check` vert, fichier regenere, absent de `git status --short`.
- `pnpm test` : 11 fichiers, 115 tests, tous verts, comme a la cloture de 001. `pnpm run check` vert.
- CI : sur la PR de cette etape.

## Incidents
Trois lignes ajoutees a `docs/04-runbooks/FRICTION.md` :
- la recette `next typegen && tsc` de l'usine echoue quand `next.config` valide l'environnement (arret, arbitrage D-050) ;
- `block-dangerous` refuse encore une commande qui cite `build.env` comme simple motif de recherche ;
- l'installeur n'a pas modifie le `ci.yml` de ce depot : `app-present.sh` n'y est pas appele, sans effet ici car l'application existe.

## Etat a la fin
Usine 1.6.6 en place, aucune tranche active, PR de l'etape en attente de la decision de fusion de l'humain.

## Etape suivante
Tranches 002 a 004. Cote usine : corriger la recette de `rules/nextjs.md`, ecarter les motifs de recherche dans `block-dangerous`, dire si le `ci.yml` se met a jour sur un projet existant.
