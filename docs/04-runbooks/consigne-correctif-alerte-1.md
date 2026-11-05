# Consigne — correctif de securite hors tranche (alerte Dependabot n° 1)

Redigee par l'orchestrateur (cowork) le 2026-11-05. `main` est a `ed68460` (PR #3, usine 1.6.6). GitHub signale une vulnerabilite **moderee** (alerte Dependabot n° 1) ; une PR Dependabot (#1) est ouverte. Chemin : **correctif de securite hors tranche** de `.claude/rules/dependencies.md` (usine 1.6.4). Lis cette regle, `.claude/rules/git.md` et `.claude/rules/documentation.md`. Un commit par etape, Conventional Commits de 72 caracteres au plus, `git --no-pager`. **Tout au premier plan.** Tu ne touches ni au code d'`apps/` ni a `packages/` (hors manifestes `package.json`), ni a `tests/`.

## Ce que l'humain a deja decide (a inscrire au registre)
- **D-051 (humain, 2026-11-05)** : l'alerte Dependabot n° 1 est corrigee avant les tranches 002 a 004, par le chemin hors tranche (branche `fix/`), et non en fusionnant la PR Dependabot #1. Raison : la regle du projet exige une version choisie au registre, la quarantaine, une decision et une ligne d'ADR ; une PR Dependabot ne fait rien de cela. La PR #1 sera fermee par l'humain si le correctif la rend inutile.

## Etape 1 — Comprendre l'alerte (lecture seule)
- `gh api repos/sharksmess/liste-courses/dependabot/alerts/1` (lecture) et `gh pr view 1` : paquet, versions vulnerables, version corrigee, identifiant de l'avis (GHSA), dependance directe ou transitive, production ou developpement.
- `pnpm audit --audit-level=moderate` puis `pnpm why <paquet>` : chemin exact dans l'arbre.
- **Arrete-toi** (rapport, rien de modifie) si : la correction exige une version **majeure** d'une dependance directe ; elle touche du code ou des tests ; aucune version corrigee n'existe ; ou l'avis ne s'applique pas a notre usage (dis pourquoi, avec la source, et laisse l'humain decider).

## Etape 2 — Correctif
- `git switch -c fix/<paquet>-<version>` depuis `main` a jour.
- Version choisie au registre (`pnpm view <paquet> versions`, dates de publication) : la plus petite version corrigee **hors quarantaine** de la regle. Transitif : `overrides` dans `pnpm-workspace.yaml`, avec l'avis cite en commentaire (comme D-038). Direct : le manifeste concerne.
- `pnpm install`, puis `pnpm audit --audit-level=moderate` : l'avis ne doit plus apparaitre. `pnpm audit --prod --audit-level=high` reste propre.
- `pnpm test` puis `pnpm run check`, au premier plan : tout vert (115 tests, comme apres PR #3).
Commit : `fix(deps): <paquet> <version> (<GHSA>)`.

## Etape 3 — Documentation
- Registre : D-051 (ci-dessus) et ta decision technique (prochain numero libre : avis, chemin, version retenue, options ecartees, dont la PR Dependabot).
- ADR des versions (ADR-0007) : une ligne pour la version forcee.
- Journal de projet : pas d'entree a part ; l'entree de la prochaine etape le citera. Index inchange.
Commit : `docs: correctif <paquet> (D-051)`, avec cette consigne.

## Etape 4 — Livraison
`bash scripts/ship-branch.sh "fix(deps): <paquet> <version>"` au premier plan, et arrete-toi avec le lien de la PR. Rapport court et en clair : l'avis, ce qui a change, les tests, et si la PR Dependabot #1 devient inutile.
