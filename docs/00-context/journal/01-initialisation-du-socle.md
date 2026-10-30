# 01 — Initialisation du socle technique

- **Dates** : 2026-10-30
- **Objectif** : fixer le socle dans `stack.json` pour que les briques de l'usine 1.6.5 sachent dans quel monde technique elles travaillent.

## Ce qui a ete fait
- `stack.json` ecrit : profil `nextjs-drizzle-postgres`, `billing` et `queue` a `"none"`, `tenancy` a `undecided`, `frozenAt` a `null`.
- ADR-0001 (socle) redige.
- Arborescence creee localement : `docs/01-product`, `docs/02-architecture/{ADR,api-contracts}`, `docs/03-slices`, `.gates`, `apps`, `packages`, `tests`, `infra`.
- Gabarits deja poses par `install-project.ps1` verifies, non recopies.
- Aucun commit : le depot n'a pas encore de premier commit.

## Decisions
- D-001 : socle nextjs-drizzle-postgres sans facturation, file ni e-mail (humain).
- D-002 a D-005 : valeurs `"none"`, auth provisoire, tenancy differee, Makefile remplace par `gates.ps1` (init-stack). Le detail est dans `docs/DECISIONS.md`.

## Preuves
`stack.json`, `docs/02-architecture/ADR/0001-socle-nextjs-drizzle-postgres.md`.

## Incidents
Cinq frictions notees dans `docs/04-runbooks/FRICTION.md` le 2026-10-30, dont une bloquante pour la suite : l'installeur doit etre relance maintenant que `stack.json` existe.

## Etat a la fin
Socle choisi, non gele. Regles Next.js/Drizzle et infrastructure de test pas encore installees.

## Etape suivante
L'humain relance `install-project.ps1` depuis la racine du projet, puis `/spec`.
