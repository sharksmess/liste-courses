# Journal du projet

Historique du projet, **une entree par etape franchie** (tranche livree, adoption d'usine, point d'arret), redigee a la fin de l'etape et versionnee ici. Regle : `.claude/rules/documentation.md`. Complements : `docs/DECISIONS.md` (decisions), `docs/04-runbooks/FRICTION.md` (incidents), `docs/04-runbooks/evidence/` (preuves des tranches).

| # | Dates | Etape | Resultat | Preuves |
|---|---|---|---|---|
| 01 | 2026-10-30 | Initialisation du socle | `stack.json` ecrit, socle non gele | [01](journal/01-initialisation-du-socle.md), ADR-0001 |
| 02 | 2026-10-30 au 2026-11-03 | Cadrage et tranche 001 (comptes et creation du foyer) | PRD et architecture approuves ; tranche 001 close, relecteurs PASS ; PR #2 fusionnee (commit 2ed4e2f) | [02](journal/02-tranche-001-comptes-foyer.md), `docs/04-runbooks/evidence/001.md` |
| 03 | 2026-11-05 | Adoption de l'usine 1.6.6 | Usine installee, `next-env.d.ts` non versionne, suite verte (115 tests) ; PR ouverte, fusion a la main de l'humain | [03](journal/03-usine-1.6.6.md), D-047 a D-050 |
| 04 | 2026-11-05 au 2026-11-06 | Tranche 002 (rejoindre un foyer et gerer le code), premier passage autonome | Tranche close, relecteurs PASS ; PR #5 fusionnee (commit 6d144d4) | [04](journal/04-tranche-002-rejoindre-foyer.md), `docs/04-runbooks/evidence/002.md` |
| 05 | 2026-11-06 | Tranche 003 (la liste de courses), passage autonome | Tranche close, relecteurs PASS ; PR #6 fusionnee (commit 418b95c) | [05](journal/05-tranche-003-liste-courses.md), `docs/04-runbooks/evidence/003.md` |
| 06 | 2026-11-06 au 2026-11-11 | Tranche 004 (membres : consulter, retirer, quitter), passage autonome, derniere tranche du MVP | Tranche close, relecteurs PASS au second passage ; PR #10 fusionnee (commit 7d945f1) | [06](journal/06-tranche-004-membres.md), `docs/04-runbooks/evidence/004.md` |
