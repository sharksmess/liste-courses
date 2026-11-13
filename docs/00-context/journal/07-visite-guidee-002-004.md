# 07 — Visite guidee des ecrans des tranches 002 a 004

- **Dates** : 2026-11-13
- **Objectif** : faire la visite guidee unique des ecrans de 002 a 004, prevue par D-053 et D-059 apres la fusion de 004, et reexaminer les actions sans confirmation (D-055, D-064, D-068).

## Ce qui a ete fait
- **Cadre** : visite faite par l'humain le 2026-11-13 sur `main` (commit f49ed99, PR #11), `pnpm dev`, port 3200, base de developpement migree juste avant (« migrations appliquees »). Deux fenetres Edge : la responsable (fenetre normale) et un membre (fenetre InPrivate, compte cree pendant la visite).
- **Verdict de l'humain** : « tout est bon ». Aucun ecart signale, aucune faute de texte signalee.

La preuve a trois niveaux, distingues ci-dessous.

### 1. Trace au journal du serveur
Extrait fourni par l'humain a l'orchestrateur, dans cet ordre :
1. `POST /api/household/join` → 422 (code refuse), puis → 200 (le membre rejoint le foyer) ;
2. `POST /api/household/items` → 201, deux fois ; `PATCH /api/household/items/<id>` → 200, quatre fois (deux articles coches puis decoches) ; `DELETE /api/household/items/<id>` → 200, deux fois ;
3. `DELETE /api/household/members/<id>` → 200 (la responsable retire le membre) ;
4. `POST /api/household/items` → 403 (le membre retire, session encore ouverte), suivi de `GET /no-household` → 200 ;
5. `POST /api/household/join` → 200 (il rejoint de nouveau le foyer) ;
6. `POST /api/household/leave` → 200, suivi de `GET /no-household` → 200 (il quitte le foyer) ;
7. `POST /api/household/invite-code` → 200 (la responsable regenere le code) ;
8. `POST /api/household/join` → 404 (ancien code refuse).

### 2. Sur attestation de l'humain seulement
Contenu des ecrans, que le journal du serveur ne montre pas : affichage du code chez la responsable, absence du code et du bouton chez le membre, messages de refus, prenoms sur les articles, formulaire vide apres un ajout, liste des membres, passage a la page « sans foyer ». L'humain a declare l'ensemble conforme sans detailler point par point.

### 3. Non fait a la visite
Absent du journal du serveur et non atteste :
1. supprimer un article deja supprime depuis l'autre fenetre : l'affichage du message de `ITEM_NOT_FOUND` n'a pas ete vu (aucun `DELETE` → 404 au journal) ;
2. l'article d'un membre parti, encore affiche avec son prenom : aucun article n'existait au moment du retrait (prouve par les tests, US-06.2, mais pas vu a l'ecran) ;
3. rejoindre avec le nouveau code apres la regeneration : le journal s'arrete au refus de l'ancien (prouve par les tests d'API) ;
4. clics rapides sur plusieurs lignes (review-003, suggestion 9) : non atteste ;
5. bornes (10 membres, 200 articles, longueur des noms) : ecartees de la visite par l'orchestrateur, couvertes par les tests.

Ces cinq points vont au backlog (« Suites de la visite guidee de 002 a 004 »). Les listes de points a verifier des fiches `docs/04-runbooks/evidence/002.md`, `003.md` et `004.md` (sections « Points a verifier a la visite guidee ») ne sont pas modifiees : cette entree en est le compte rendu.

## Decisions
- D-075 : visite guidee faite, verdict conforme, aucune tranche de correction ; les cinq points non faits vont au backlog (humain).
- D-076 : D-055, D-064 et D-068 reexaminees, aucune confirmation ajoutee ; signal de reexamen : un clic par erreur signale a l'usage, ou l'ouverture a d'autres familles (humain).

Le detail est dans `docs/DECISIONS.md`.

## Preuves
Extrait du journal du serveur ci-dessus, transmis par l'humain (non versionne) ; attestation de l'humain. Fiches de preuves des tranches : `docs/04-runbooks/evidence/002.md`, `003.md`, `004.md`.

## Incidents
Aucun pendant la visite. A la livraison de ce compte rendu, le push a ete refuse deux fois (`FRICTION.md`, 2026-11-13 et 2026-11-19) : une suite de tests de 6 h, PC en veille, puis `next build` 16.4.3 arrete par un avis de securite. Corrige hors tranche par `next` 16.4.5 (D-073, D-074, PR #15) avant la relance de cette branche.

## Etat a la fin
Les quatre tranches du MVP (001 a 004) sont livrees et fusionnees ; la suite compte 480 tests. Le produit n'est pas mis en ligne : R1 (effacement RGPD, mineurs) reste bloquant pour toute mise en ligne (PRD).

## Etape suivante
Ce qui reste est au backlog (`docs/03-slices/000-backlog.md`) : les cinq points non faits de la visite, a voir a la prochaine visite ou avant toute mise en ligne, et les suites des relectures et audits (corps de requete non borne, proxy du limiteur, `23514`, `10` en dur, etc.). La suite du projet est a decider par l'humain.
