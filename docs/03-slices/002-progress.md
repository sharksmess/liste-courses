# 002 — journal d'avancement

Tenu par l'implementeur apres **chaque commit**. C'est ce fichier, pas la conversation, qui permet de reprendre apres une interruption.

## Etat
- Statut : implementee, deux passages de relecture faits, correctifs appliques (points 1 a 8, 10, 11, 14, puis S1 a S6) (`docs/04-runbooks/audits/review-002.md`)
- Branche : slice/002-rejoindre-foyer
- Dernier commit de code : 76d4e6f ; dernier commit de test : d619b7e
- Prochaine etape : `close-slice.sh`, puis `ship-slice.sh`, puis arret pour fusion humaine

## Couches
- [x] Migration : fcd81ca (`0005_join_invite_code.sql`, ERD §9)
- [x] Acces donnees et logique metier : b9e57f4 (`lib/household.ts`, `lib/invite-code.ts`, `errors.ts`, `contracts.ts`)
- [x] API : 33ad8ac (`api/household/join`, `api/household/invite-code`)
- [x] UI : 847aa2b (`/no-household`, `/household`, `ui/join-household-form.tsx`, `ui/regenerate-invite-code-button.tsx`, `ui/messages.ts`)
- [x] Suite complete verte : 18 fichiers, 228 tests passes (sur d619b7e) ; `pnpm run check` rejoue par la cloture

## Blocages
<!-- cause, essais, options. Vide = aucun. -->

## Decisions
<!-- Toute decision prise sans l'humain, avec sa raison. Reprise dans la PR. -->
- Passage autonome (D-052) ; ecrans prouves sans visite guidee par tranche (D-053). Decisions humaines recues par la consigne `docs/04-runbooks/consigne-run-queue-002-004.md`.
- **`app.invite_code_lookup` remis a vide aussi par `get_invite_code` et `regenerate_invite_code`** : l'ERD §4.5 ne cite que `app.household_id`, AC9 exige les deux. Ecrit en ERD §9. Non retenu : remise a vide en tete de fonction, sans effet utile puisque ces fonctions filtrent sur `household_id` et que `lc_app` n'a aucun droit sur la table.
- **Un tirage egal au code en vigueur compte parmi les 5 essais de `regenerate_invite_code`** : l'ERD §4.5 dit « jusqu'a obtenir une valeur differente » sans borne propre ; une boucle unique reste bornee et ne peut pas tourner sans fin. Ecrit en ERD §9. Non retenu : deux boucles imbriquees, sans gain a 2^-50 de probabilite.
- **Service du code dans un nouveau `lib/invite-code.ts`**, `joinHousehold` restant dans `lib/household.ts` a cote de `createHousehold` : `formatInviteCode` n'est pas exportee, la mise en forme existe donc en un seul endroit.
- **`readJson` recopie dans `api/household/join/route.ts`** : le factoriser toucherait `api/household/route.ts`, hors perimetre gele. La dette couvre aussi le squelette de POST (backlog).
- **`POST invite-code` ne lit pas le corps** : le contrat n'a pas d'erreur 422 et l'entree est vide ; aucune entree externe n'est donc consommee.
- **Page `/household` : `throw` si `getInviteCode` refuse la responsable** : role lu `owner` et appartenance immuable, le cas est un invariant rompu, pas une erreur metier.
- **Formulaire « rejoindre » : un 422 `VALIDATION_FAILED` affiche le message de `INVITE_CODE_INVALID`** : le message generique parle de longueur de champ, trompeur pour un caractere hors alphabet. Le statut API reste 422. Choix extrait dans la fonction pure `joinErrorMessage` de `ui/messages.ts` (relecture 002, point 8) et teste ; tout autre cas suit `messageFor`. Ecartee : la logique locale au composant, sans preuve possible sans robot (D-027).
- **Libelles** : INVITE_CODE_INVALID « Ce code n'est pas valide. Verifiez-le et reessayez. » (aucune mention de foyer) ; HOUSEHOLD_FULL « Ce foyer est complet : il compte deja 10 membres. » ; bouton « Regenerer le code », sans demande de confirmation (non specifiee).
- **Details de maintenance (relecture 002, point 14)** : parametre `read` renomme `run` dans `lib/invite-code.ts`, la regeneration ecrivant aussi ; en-tete de `lib/household.ts` (US-05) et titre de l'ERD §9 mis a jour. Aucun changement de comportement.
