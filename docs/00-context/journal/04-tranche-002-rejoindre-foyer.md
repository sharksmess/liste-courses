# 04 — Tranche 002 : rejoindre un foyer et gerer le code

- **Dates** : 2026-11-05
- **Objectif** : permettre a un compte sans foyer de rejoindre celui de sa famille avec un code, et a la responsable de voir et regenerer ce code. Premiere tranche du premier passage autonome du projet.

## Ce qui a ete fait
- Ouverture sans validation humaine du contrat (D-052) : contrat, perimetre, journal (`7f20333`).
- Tests avant le code par `test-writer` (`4482ab7`, `579c848`, `2699610`). Le seul test de 001 retouche exigeait un bloc « rejoindre » desactive ; le besoin a change, et la retouche a son commit dedie.
- Implementation par `slice-implementer`, une couche par commit : migration `0005_join_invite_code.sql` (`fcd81ca`), service (`b9e57f4`), API (`33ad8ac`), ecrans (`847aa2b`).
- Trois relecteurs : `AUDIT: PASS`, `CONTRACTS: PASS`, `REVIEW: PASS` sans BLOQUANT, mais avec huit A CORRIGER sur la force des preuves.
- Ces points ont ete traites dans la tranche plutot que renvoyes au backlog (D-057) : concurrence observee et non seulement lancee, boucle de regeneration executee, assertions d'isolation qui peuvent echouer (`d1cd609` a `e5ea7bf`, `76d4e6f`, `4174ea3`). La suite passe de 213 a 227 tests, sans reveler de defaut d'implementation.
- Second passage de `code-reviewer` : `REVIEW: PASS`, trois A CORRIGER traites (borne haute des essais et filtre de `get_invite_code` dans `d619b7e`, ligne parasite de `FRICTION.md`). La suite atteint 228 tests.

## Decisions
- D-052 : passage autonome de 002 a 004 (humain).
- D-053 : ecrans prouves sur la page rendue, visite guidee unique apres 004 (humain).
- D-054 : `app.invite_code_lookup` remis a vide et tirage egal compte parmi les 5 essais, ecarts ERD §9 (agent, valide par l'humain, D-058).
- D-055 : pas de demande de confirmation sur la regeneration (agent, valide par l'humain, D-058, a reexaminer a la visite guidee apres 004).
- D-056 : un 422 sur « rejoindre » affiche le message de code invalide (agent, valide par l'humain, D-058).
- D-057 : A CORRIGER traites dans la tranche ; cablage client renvoye a la visite (agent, valide par l'humain, D-058).
- D-058 : validation de D-054 a D-057 (humain).
- D-059 : la preuve automatique d'un refus porte sur l'API et la page rendue, l'affichage navigateur sur la visite guidee (humain).

Le detail est dans `docs/DECISIONS.md`.

## Preuves
Fiche `docs/04-runbooks/evidence/002.md`, qui liste aussi ce qu'elle ne prouve pas. Rapports `docs/04-runbooks/audits/audit-002.md`, `contracts-002.md`, `review-002.md`.

## Incidents
Une friction : D-053 demandait une preuve des refus sur la page rendue, impossible sans robot pour un refus affiche par un composant client ; close par D-059 (`FRICTION.md`). Un echec intermittent du pre-push apres la cloture, non reproduit en dix passages, cause non etablie (`FRICTION.md`).

## Etat a la fin
Tranche 002 livree en PR, en attente de la CI et de la fusion humaine. Le foyer peut compter plusieurs membres, ce dont 003 et 004 ont besoin.

## Etape suivante
L'humain fusionne, puis relance `/run-queue` pour la tranche 003.
