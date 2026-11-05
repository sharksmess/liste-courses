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
