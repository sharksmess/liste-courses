# 003 — journal d'avancement

Tenu par l'implementeur apres **chaque commit**. C'est ce fichier, pas la conversation, qui permet de reprendre apres une interruption.

## Etat
- Statut : ouverte
- Branche : slice/003-liste-courses
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
- **Factorisation de `readJson` reprise dans 003**, alors que le backlog la laissait ouverte : review-002 (suggestion 9) demandait de la faire avant que 003 et 004 multiplient la copie. Perimetre elargi aux deux seuls `route.ts` concernes. Ecartee : recopier une troisieme et une quatrieme fois.
- **US-06.2 preparee ici et prouvee en 004** : aucun depart n'existe avant 004 (backlog).
