# 004 — journal d'avancement

Tenu par l'implementeur apres **chaque commit**. C'est ce fichier, pas la conversation, qui permet de reprendre apres une interruption.

## Etat
- Statut : ouverte
- Branche : slice/004-membres
- Dernier commit : UI (voir Couches), ERD §5 et journal dans le commit docs suivant
- Prochaine etape : suite complete et `pnpm run check`

## Couches
- [x] Migration : 4a2ade7
- [x] Acces donnees et logique metier : 50ce0c8
- [x] API : b47fda7
- [x] UI : 1a31c0f
- [ ] Suite complete verte + `pnpm run check`

## Blocages
<!-- cause, essais, options. Vide = aucun. -->
Aucun en cours. Les deux tests qui lisaient sous `lc_app` apres le depart, dans la transaction du depart, ont ete corriges par `test-writer` (5809183).

## Decisions
<!-- Toute decision prise sans l'humain, avec sa raison. Reprise dans la PR. -->
- Passage autonome (D-052) ; ecrans prouves sans visite guidee par tranche (D-053, D-059). Consigne : `docs/04-runbooks/consigne-run-queue-002-004.md`.
- **Article enregistre pendant un retrait : conserve** (D-066) : Q-8, confirmee par l'humain (D-025), a tranche ; `addItem` rend `NO_HOUSEHOLD` sans lever.
- **Fenetre 404 au lieu de 403 acceptee** pour une requete en vol pendant un retrait (D-061) : aucune ecriture ne passe, et la requete suivante recoit 403.
- **Pas de demande de confirmation sur « Retirer » et « Quitter le foyer »** : le PRD n'en prevoit pas, meme lecture que D-055 et D-064, a juger a la visite guidee.
- **Ordre de la liste des membres : `joined_at` puis `id`** : ni le contrat ni le PRD ne le fixent ; c'est l'index `membership_household_idx`, et la responsable sort en tete.
- **Attentes de verrou confirmees par les tests, reportees a l'ERD §5** : depart non commite et retrait attendent la ligne `membership` (LC006, LC009 apres le COMMIT) ; a 10 membres, LC004 immediat ; sous la borne, l'adhesion attend le verrou du foyer et reussit. Verts dans `.logs/004-impl-3.log`.
- **Sortie en erreur des deux fonctions** : pas de remise a vide de `app.household_id` avant `RAISE`, comme `add_item` (ERD §9) : l'exception annule la transaction ou revient au point de sauvegarde.
- **`listMembers` en une seule instruction** : zero ligne vaut NO_HOUSEHOLD, un foyer comptant toujours sa responsable. Ecarte : lire le foyer puis les membres, comme `inHousehold` : un retrait entre les deux donnerait une liste vide et un 500 sur le `.min(1)` du contrat.
- **`:memberId` mal forme** : `malformedMemberError` dans `lib/members.ts` (foyer, role, puis 404) plutot que dans la route : le role se decide dans le service, comme les notes du contrat le demandent.
- **Prop `canRemove` de `MemberList`** : un booleen, en plus de `memberId`, `name`, `role`. Ecarte : passer le role de la personne connectee, plus large que le besoin, ou un composant serveur par ligne, ou le message d'erreur disparaitrait avec la ligne au rechargement.
- **Message d'erreur au niveau de la liste**, comme `item-list.tsx`, pour la meme raison.
- **`INSUFFICIENT_ROLE` sans message dedie** : les tests exigent `messageFor`, qui rend le message generique, et la consigne cite quatre codes. L'ecran ne peut l'atteindre que perime, et le rechargement le corrige.
- **`mutationEffect` interne a `ui/messages.ts`** : les deux decisions ne different que par leurs codes. Ecarte : deux copies.
- **`toRole` exporte de `lib/household.ts`** plutot que recopie.
