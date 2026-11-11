# 06 — Tranche 004 : membres, consulter, retirer, quitter

- **Dates** : 2026-11-06 au 2026-11-11 (interruption du 6 au 11 novembre, poste ou session en pause)
- **Objectif** : derniere tranche du MVP. Voir les membres, retirer un membre, quitter le foyer, avec une coupure d'acces a la requete suivante et une responsable qui ne part jamais ; prouver de bout en bout que le prenom d'un auteur survit a son depart (US-06.2).

## Ce qui a ete fait
- Ouverture sans validation humaine du contrat (D-052) ; validation par l'humain des decisions de 003 (D-065) ; le choix « annuler ou garder l'article ajoute pendant un retrait » est rattache a Q-8, deja tranche (D-066) (`dbd7ec1`).
- Tests avant le code par `test-writer` (`f6aa255` a `b8eac91`). Une retouche d'un test existant, dediee : `NO_HOUSEHOLD` recharge desormais la page (`7a56b04`).
- Implementation par `slice-implementer` : migration `0008_member_functions.sql` (`4a2ade7`), service et `addItem` (`50ce0c8`), routes (`b47fda7`), ecran (`1a31c0f`). Un arret sur deux tests qui relisaient depuis la session coupee, corriges par `test-writer` (`5809183`).
- Relecteurs : `AUDIT: PASS` sans constat, `CONTRACTS: PASS`, mais `REVIEW: FAIL` au premier passage, sur deux manques de preuve. La branche `addItem` « article enregistre puis illisible », tenue pour inatteignable, l'etait par un retrait non commite ; et l'assertion du prenom sur la page etait toujours vraie.
- Correctifs : preuves par `test-writer` (`597922c`, `5fa6b11`, `b568046`, `e5aa0a1`), commentaires, ERD et journal par `slice-implementer` (`5faa20b`, `5684a21`). Aucun defaut de comportement revele. La suite passe a 480 tests.
- Second passage de `code-reviewer` : voir `review-004.md`.

## Decisions
- D-065 : validation de D-060 a D-064 (humain).
- D-066 : article ajoute pendant un retrait conserve, `addItem` rend `NO_HOUSEHOLD` (orchestrateur, application de Q-8).
- D-067 : fenetre 404 au lieu de 403 pour une requete en vol, acceptee (orchestrateur, a valider).
- D-068 : « Retirer » et « Quitter le foyer » sans confirmation, `canRemove`, `INSUFFICIENT_ROLE` sans message dedie (agent, a valider, a reexaminer a la visite guidee).
- D-069 : constats de preuve de review-004 traites dans la tranche (orchestrateur, a valider).

Le detail est dans `docs/DECISIONS.md`.

## Preuves
Fiche `docs/04-runbooks/evidence/004.md`, qui liste aussi ce qu'elle ne prouve pas. Rapports `docs/04-runbooks/audits/audit-004.md`, `contracts-004.md`, `review-004.md`.

## Incidents
Arrets sans rapport des quatre sous-agents (« no progress for 600s »), dont deux simultanes ; un passage de tests de 367,90 s ou un test existant a expire, le processus semblant fige environ 245 s ; deux commits de couche et un commit de test qui ne compilaient pas seuls ; une interruption de cinq jours en cours de tranche (`FRICTION.md`).

## Etat a la fin
Les quatre tranches du MVP sont livrees ; 004 attend sa fusion. La visite guidee unique des ecrans de 002 a 004 (D-053) peut avoir lieu sur `main` apres cette fusion.

## Etape suivante
L'humain valide D-067 a D-069, fusionne, puis fait la visite guidee (fiches `evidence/002.md` a `004.md`).
