# 05 — Tranche 003 : la liste de courses

- **Dates** : 2026-11-06
- **Objectif** : livrer le coeur du produit, une liste unique par foyer ou tout membre voit, ajoute, coche et supprime n'importe quel article, avec la borne de 200 tenue sous concurrence.

## Ce qui a ete fait
- Ouverture sans validation humaine du contrat (D-052) : contrat, perimetre, journal (`abb194d`).
- Tests avant le code par `test-writer` (`0766a03` a `cc772aa`). Il s'est arrete une fois sans rapport, et une relance a suffi.
- Implementation par `slice-implementer` : migrations `0006_item.sql` et `0007_item_rls_functions.sql` (`0b24a59`), service (`ae39972`), API et lecture commune du corps (`8d33086`), ecrans (`f65862a`).
- Deux arrets de l'implementeur sur des tests qu'aucune implementation ne pouvait satisfaire. Il n'a touche a aucun test : `test-writer` les a corriges (`6d536cb`, `29302b2`). Le second a revele un comportement reel de Postgres a la borne, note a l'ERD §5 (D-060).
- Trois relecteurs : `AUDIT: PASS`, `CONTRACTS: PASS`, `REVIEW: PASS` sans BLOQUANT, avec sept A CORRIGER et cinq suggestions.
- Les points de force de preuve ont ete traites dans la tranche (D-061) : concurrence observee sous la borne, departage par `id`, decision apres mutation extraite dans `itemMutationEffect`, corps types sur les contrats (`0bc8bb6`). La suite passe de 375 a 391 tests, sans reveler de defaut d'implementation.
- Second passage de `code-reviewer` : voir `review-003.md`.

## Decisions
- D-060 : `LC008` immediat a la borne pendant une suppression non commitee (orchestrateur, a valider).
- D-061 : suites de review-003 dans la tranche ou au backlog de 004 (orchestrateur, a valider).
- D-062 : factorisation de `readJson` reprise dans 003 (orchestrateur, a valider).
- D-063 : `(corps)` sur `PATCH`, lecture de l'AC6 (agent, a valider).
- D-064 : choix d'ecran, dont « Supprimer » sans confirmation (agent, a valider, a reexaminer a la visite guidee apres 004).

Le detail est dans `docs/DECISIONS.md`.

## Preuves
Fiche `docs/04-runbooks/evidence/003.md`, qui liste aussi ce qu'elle ne prouve pas. Rapports `docs/04-runbooks/audits/audit-003.md`, `contracts-003.md`, `review-003.md`.

## Incidents
Arret sans rapport de `test-writer`, `typecheck` de plus de 180 s, tests impossibles a satisfaire, `block-dangerous.sh` declenche par un motif de recherche, et `close-slice.sh` qui coupe la sortie des tests en cas d'echec, contre la regle de l'humain (`FRICTION.md`).

## Etat a la fin
Tranche 003 livree en PR, en attente de la CI et de la fusion humaine. La survie du prenom de l'auteur apres un depart (US-06.2) est preparee et sera prouvee en 004.

## Etape suivante
L'humain valide D-060 a D-064, fusionne, puis relance `/run-queue` pour la tranche 004.
