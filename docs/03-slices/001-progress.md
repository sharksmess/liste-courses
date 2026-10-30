# 001 — journal d'avancement

Tenu par l'implementeur apres **chaque commit**. C'est ce fichier, pas la conversation, qui permet de reprendre apres une interruption.

## Etat
- Statut : ouverte
- Branche : slice/001-comptes-foyer
- Dernier commit : ouverture de la tranche
- Prochaine etape : tests ecrits par `test-writer` ; l'humain remplit `.env.test.local` d'apres `.env.test.example`

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
- Decisions humaines d'ouverture : D-026 (TypeScript et ESLint), D-027 (pas de Playwright), D-028 (modeles d'environnement au perimetre), D-029 (arret au moindre refus de better-auth ; ports 3200 et 3210).
