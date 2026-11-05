# Passage autonome du 2026-11-05 — tranches 002 a 004

Tenu au fil de l'eau par l'orchestrateur (`/run-queue`). Consigne : `docs/04-runbooks/consigne-run-queue-002-004.md`.

## Prerequis
- `.gates/02-architecture.approved` present.
- Arbre propre, a un fichier pres : la consigne elle-meme, non suivie au lancement, versionnee dans le commit d'ouverture de 002.
- Budget : trois tranches au plus (002, 003, 004), avec arret apres chaque `ship-slice.sh` pour fusion humaine.
- PR ouverte au lancement : #1 (Dependabot, sans rapport avec les tranches, D-051).

## Tranche 002 — Rejoindre un foyer et gerer le code
- Etat : ouverte sur `slice/002-rejoindre-foyer` depuis `main` (4c1b0bb).
- Prochaine etape : `test-writer`.
- `test-writer` : termine sans reprise. Commits 4482ab7 (retouche dediee du test de 001), 579c848, 2699610. 69 tests en echec pour la bonne raison (routes absentes, fonctions absentes `42883`, marqueurs absents), trois gardes-fous passent deja.
- `slice-implementer` : termine sans reprise. Commits fcd81ca (migration 0005), b9e57f4 (service), 33ad8ac (API), 847aa2b (UI), 5711425 (journal). 213 tests verts, `pnpm run check` propre, aucun test modifie.
- Prochaine etape : les trois relecteurs, en parallele.
- Relecteurs, premier passage : `AUDIT: PASS` (1 MINEUR), `CONTRACTS: PASS`, `REVIEW: PASS` (0 BLOQUANT, 8 A CORRIGER, 7 SUGGESTION). Aucune condition d'arret. Rapports enregistres tels quels.
- Choix de l'orchestrateur : les A CORRIGER de force de preuve sont traites dans la tranche et non renvoyes au backlog, car la fusion se decide sur preuves. Renvoi a `test-writer`, puis `slice-implementer` pour le choix du message de refus, puis second passage de `code-reviewer`.
- Correctifs de relecture : `test-writer` d1cd609 a e5ea7bf et 4174ea3, `slice-implementer` 76d4e6f. 227 tests verts sur 76d4e6f, aucun defaut d'implementation revele. Decisions D-054 a D-057 au registre, marquees a valider.
- Prochaine etape : second passage de `code-reviewer`, puis `close-slice.sh`.
