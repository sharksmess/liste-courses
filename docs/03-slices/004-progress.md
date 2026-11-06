# 004 — journal d'avancement

Tenu par l'implementeur apres **chaque commit**. C'est ce fichier, pas la conversation, qui permet de reprendre apres une interruption.

## Etat
- Statut : bloquee, deux tests a arbitrer
- Branche : slice/004-membres
- Dernier commit : migration 0008 (4a2ade7)
- Prochaine etape : arbitrage de `test-writer` sur les deux tests de « Blocages », puis lib/members.ts, addItem, routes, ecran, memberMutationEffect, ERD §5

## Couches
- [ ] Migration : 4a2ade7, verte sauf les deux tests de « Blocages »
- [ ] Acces donnees
- [ ] Logique metier
- [ ] API
- [ ] UI
- [ ] Suite complete verte + `pnpm run check`

## Blocages
<!-- cause, essais, options. Vide = aucun. -->
**Deux tests impossibles a satisfaire, implementation arretee apres la migration.**

- `tests/db/member-functions.test.ts`, « un membre part, member_count baisse de 1 » : ligne 194 (`rowsOf` apres `leave_household`), recu `{ n: 0, counter: -1 }`, attendu `{ n: 2, counter: 2 }`. `.logs/004-impl-2.log`.
- `tests/isolation/members.test.ts`, « leave_household d'un membre de A » : ligne 122-123, `SELECT` sur `lc.household` apres le depart, recu 0 ligne, attendu 1. `.logs/004-impl-3.log`.
- Cause : les deux lisent sous `lc_app`, avec l'identite de la personne qui vient de partir, dans la meme transaction. Sa ligne etant supprimee, `lc.current_household_id()` rend `NULL` a l'instruction suivante, et `household_member_select` et `membership_member_select` masquent tout le foyer. C'est la coupure voulue (ADR-0002, ERD §3.3 : un compte sans foyer ne voit aucune ligne).
- Passer exigerait de garder une lecture du foyer apres le depart, donc de modifier une politique ou `current_household_id()` : interdit par le contrat, et contraire a la coupure.
- Options : relire apres un COMMIT reel (`openAppTx`, avec un membre dedie), puis par l'administration ; ou retirer ces lectures, les assertions apres `asApp` couvrant deja B et l'annulation.
- Aucun test modifie, aucun essai de contournement.

## Decisions
<!-- Toute decision prise sans l'humain, avec sa raison. Reprise dans la PR. -->
- Passage autonome (D-052) ; ecrans prouves sans visite guidee par tranche (D-053, D-059). Consigne : `docs/04-runbooks/consigne-run-queue-002-004.md`.
- **Article enregistre pendant un retrait : conserve** (D-066) : Q-8, confirmee par l'humain (D-025), a tranche ; `addItem` rend `NO_HOUSEHOLD` sans lever.
- **Fenetre 404 au lieu de 403 acceptee** pour une requete en vol pendant un retrait (D-061) : aucune ecriture ne passe, et la requete suivante recoit 403.
- **Pas de demande de confirmation sur « Retirer » et « Quitter le foyer »** : le PRD n'en prevoit pas, meme lecture que D-055 et D-064, a juger a la visite guidee.
- **Ordre de la liste des membres : `joined_at` puis `id`** : ni le contrat ni le PRD ne le fixent ; c'est l'index `membership_household_idx`, et la responsable sort en tete.
- **Attentes de verrou confirmees par les tests, a reporter a l'ERD §5** : depart non commite et retrait attendent la ligne `membership` (LC006, LC009 apres le COMMIT) ; a 10 membres, LC004 immediat ; sous la borne, l'adhesion attend le verrou du foyer et reussit. Verts dans `.logs/004-impl-3.log`.
- **Sortie en erreur des deux fonctions** : pas de remise a vide de `app.household_id` avant `RAISE`, comme `add_item` (ERD §9) : l'exception annule la transaction ou revient au point de sauvegarde.
