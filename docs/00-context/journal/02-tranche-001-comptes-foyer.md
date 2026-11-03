# 02 — Cadrage et tranche 001 : comptes et creation du foyer

- **Dates** : 2026-10-30 au 2026-11-03
- **Objectif** : cadrer le produit (PRD, architecture), puis livrer la premiere tranche verticale : comptes, connexion et creation du foyer, avec tout le socle risque (roles Postgres, RLS, better-auth et son limiteur).

## Ce qui a ete fait
- **Premier commit et premier push** : commit initial sur `chore/initialisation`, puis sequence de livraison arretee pour le premier push (D-006, D-007).
- **PRD** : ecrit apres cinq questions a l'humain, puis approuve (D-008 a D-014).
- **Architecture**, approuvee (D-015 a D-025) :
  - isolation `shared-schema-rls`, le foyer etant derive de la session (ADR-0002) ;
  - ADR 0003 a 0006 ;
  - ERD de `db-architect` ;
  - contrats Zod ;
  - backlog en quatre tranches.
- **Tranche 001** sur `slice/001-comptes-foyer` :
  - ouverture : contrat, perimetre et modele `.env.test.example` (D-026 a D-029) ;
  - tests ecrits par `test-writer` avant le code (`d833e02`) ;
  - implementation couche par couche par `slice-implementer` : echafaudage, migrations, better-auth, API, ecrans, CI (D-030 a D-035, D-044) ;
  - trois relecteurs. Le premier passage de l'audit echoue sur un MAJEUR (limiteur contournable par `X-Forwarded-For`), corrige puis valide par un second passage (D-036 a D-043, D-045) ;
  - visite guidee d'AC8 par l'humain (D-046).

## Decisions
- D-015 : `shared-schema-rls`, foyer jamais en parametre de requete (architect, accepte au gate).
- D-026, D-032, D-037 : TypeScript 6.0.3 et ESLint 9.39.5 apres essai de `latest` (humain).
- D-027 : pas de Playwright en 001 (humain).
- D-030 : codes reels de better-auth 1.7.14 reportes dans le contrat (implementeur).
- D-036 : test AC5 modifie par l'implementeur, garde apres verification de `code-reviewer` (humain).
- D-038 : override esbuild pour GHSA-67mh-4wv8-2f99 (humain).
- D-040, D-043 : limiteur sans confiance dans les en-tetes d'adresse ; compteur partage par chemin accepte tant qu'il n'y a pas de mise en ligne (humain).
- D-046 : visite guidee d'AC8 conforme (humain).

Le detail est dans `docs/DECISIONS.md` (D-006 a D-046).

## Preuves
- Fiche de preuves : `docs/04-runbooks/evidence/001.md`, produite par `scripts/close-slice.sh`. La visite guidee y figure sous « Complements ».
- Rapports des relecteurs, tels quels, dans `docs/04-runbooks/audits/` :
  - `audit-001.md` (deux passages, `AUDIT: PASS`) ;
  - `contracts-001.md` (`CONTRACTS: PASS`) ;
  - `review-001.md` (`REVIEW: PASS`).
- Derniere suite rapportee par l'implementeur : 11 fichiers et 115 tests verts. `pnpm run check`, `scripts/ci-build.sh`, l'audit des dependances et `pnpm peers check` sont propres.

## Incidents
Detail dans `docs/04-runbooks/FRICTION.md`.
- Hooks trop larges : ils bloquent la lecture des modeles `.example`, le commit d'un fichier `.gates/*.approved`, et les commandes qui ne font que mentionner `.env`.
- gitleaks refuse les valeurs factices d'URL et de secret.
- La CI et le pre-push exigent une application avant qu'elle puisse exister.
- Interruption de l'implementeur sur la limite d'usage, sans commit.
- Test modifie par l'implementeur au lieu de s'arreter.
- Un relecteur a lu un `*.local.ps1`.
- Le dossier `audits/` et ADR-0003 etaient hors perimetre.

## Etat a la fin
- Tranche 001 close localement par `close-slice.sh`. La branche n'est pas encore poussee.
- `main` est vide sur GitHub : l'humain doit la pousser depuis `slice/001` et poser la protection (D-007).

## Etape suivante
1. L'humain pousse `main` et pose la protection (`github-setup.ps1 -ProtectOnly`).
2. `bash scripts/ship-slice.sh` ouvre la premiere PR, qui porte le cadrage et la tranche 001.
3. Fusion par l'humain sur preuves, puis tranche 002 (rejoindre un foyer et gerer le code).
