# 004 — journal d'avancement

Tenu par l'implementeur apres **chaque commit**. C'est ce fichier, pas la conversation, qui permet de reprendre apres une interruption.

## Etat
- Statut : ouverte
- Branche : slice/004-membres
- Dernier commit : ouverture de la tranche
- Prochaine etape : `test-writer`

## Couches
- [ ] Migration
- [ ] Acces donnees
- [ ] Logique metier
- [ ] API
- [ ] UI
- [ ] Suite complete verte + `pnpm run check`

## Blocages
<!-- cause, essais, options. Vide = aucun. -->

## Decisions
<!-- Toute decision prise sans l'humain, avec sa raison. Reprise dans la PR. -->
- Passage autonome (D-052) ; ecrans prouves sans visite guidee par tranche (D-053, D-059). Consigne : `docs/04-runbooks/consigne-run-queue-002-004.md`.
- **Article enregistre pendant un retrait : conserve** (D-066) : Q-8, confirmee par l'humain (D-025), a tranche ; `addItem` rend `NO_HOUSEHOLD` sans lever.
- **Fenetre 404 au lieu de 403 acceptee** pour une requete en vol pendant un retrait (D-061) : aucune ecriture ne passe, et la requete suivante recoit 403.
- **Pas de demande de confirmation sur « Retirer » et « Quitter le foyer »** : le PRD n'en prevoit pas, meme lecture que D-055 et D-064, a juger a la visite guidee.
- **Ordre de la liste des membres : `joined_at` puis `id`** : ni le contrat ni le PRD ne le fixent ; c'est l'index `membership_household_idx`, et la responsable sort en tete.
