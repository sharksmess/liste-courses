Controle de la tranche 004 (`git diff main...HEAD`, 33 fichiers). Je n'ai lance aucun test et m'appuie sur le resultat transmis (476 verts, `.logs/004-impl-5.log`).

## Contrats declares
- `docs/02-architecture/api-contracts/members.ts` est inchange (absent du diff). Le dossier `api-contracts/` n'a aucune modification.
- `apps/web/src/lib/contracts.ts` ne fait que reexporter `listMembers`, `removeMember` et `leaveHousehold`. Les routes valident l'entree et la sortie avec les schemas du contrat (`contract.output.parse`, `contract.input.shape.memberId`).

## Routes
| Route | Statut de succes et en-tete | Ordre de verification | Conforme |
|---|---|---|---|
| `GET /api/household/members` | 200, `Cache-Control: no-store` | session (401), foyer (403 `NO_HOUSEHOLD`) | oui |
| `DELETE /api/household/members/:memberId` | 200 `{removed:true}`, `no-store` | session (401), foyer (403), role (403 `INSUFFICIENT_ROLE`), responsable visee (409 `OWNER_CANNOT_BE_REMOVED`), membre absent (404 `MEMBER_NOT_FOUND`) | oui |
| `POST /api/household/leave` | 200 `{left:true}`, `no-store` | session (401), foyer (403), responsable (409 `OWNER_CANNOT_LEAVE`) | oui |

- **Corps d'erreur.** `errorResponse` renvoie `{error:{code}}` avec `no-store`, comme les tranches precedentes.
- **Liste des membres.** `listMembers` ne renvoie que `memberId` (l'identifiant de la ligne d'appartenance), le prenom et le role. Aucun identifiant ni e-mail de compte n'est expose.
- **`:memberId` qui n'est pas un UUID.** Le contrat le range sous 404. `malformedMemberError` applique d'abord le foyer, puis le role, puis le 404. Un compte sans foyer recoit 403 `NO_HOUSEHOLD`, un membre simple 403 `INSUFFICIENT_ROLE`, la responsable 404. C'est coherent avec l'ordre du contrat.
- **Codes SQL.** Les fonctions de la migration 0008 renvoient `LC009`, `LC005`, `LC007`, `LC006`. Ils sont traduits en erreurs typees, et toute autre erreur reste une exception.
- **Responsable ciblee par un retrait.** Une responsable qui vise son propre identifiant recoit `LC007`, donc 409, avant le test d'existence. Une autre responsable n'existe pas dans le foyer, donc 404. Les deux cas sont compatibles avec les declencheurs du contrat.
- **Rejeu apres depart.** Il donne 403 `NO_HOUSEHOLD`, comme le contrat.

## `POST /api/household/items` (`addItem`)
- Le contrat est inchange : memes champs, statut 201 et liste d'erreurs identiques.
- Apres une relecture vide, `addItem` renvoie maintenant `fail(noHousehold())` a la place d'un `throw`. La transaction est validee et l'article reste (Q-8, D-066). Le code `NO_HOUSEHOLD` figure deja parmi les erreurs de `addItem` (`E.noHousehold`). Ce cas, auparavant un 500, entre donc dans le contrat et ne le casse pas.

## Migration 0008
- Elle cree deux fonctions, `lc.remove_member(uuid)` et `lc.leave_household()`. Il n'y a ni table, ni colonne, ni politique, ni role, ni enum.
- Les droits sont verrouilles : proprietaire `lc_definer`, `REVOKE` pour `PUBLIC`, `EXECUTE` pour `lc_app` seulement.
- Dans le diff, seul `_journal.json` est modifie (une entree ajoutee a la fin). `0008_member_functions.sql` et `0008_snapshot.json` sont des ajouts. Aucune migration `0000` a `0007` n'est touchee : `git diff --stat` ne liste que de nouveaux fichiers et le journal.
- L'ERD est mis a jour dans la meme PR (§9 et la section sur la concurrence), ce qui satisfait la regle de documentation.

## Types partages et `ui/messages.ts`
- **`errors.ts`.** Trois membres s'ajoutent a l'union `ApiError`, c'est additif. La fonction `toRole` devient exportee.
- **`messages.ts`.** Des cles sont ajoutees, aucune retiree. `itemMutationEffect` garde sa signature. Seul `NO_HOUSEHOLD` ajoute un rechargement de page, ce qui est un comportement d'interface, pas un contrat d'API. `tests/items/screens.test.ts` perd la ligne `[403, "NO_HOUSEHOLD"]` des cas sans rechargement, ce qui est coherent avec ce changement.
- **`add-item-form.tsx`.** Il utilise `itemMutationEffect` au lieu d'un `messageFor` direct. Aucun contrat n'est touche.
- **Format (non bloquant).** Dans `errors.ts`, `alreadyInHousehold =()` a perdu une espace. C'est un defaut de formatage sans effet sur les contrats.

## Ruptures
Aucune : pas de champ ou de colonne retire ou renomme, pas de statut modifie, pas de route deplacee, pas de valeur d'enumeration supprimee. Tout ce qui s'ajoute est additif : trois routes, trois codes d'erreur, deux fonctions SQL. Aucun ADR de migration n'est necessaire.

CONTRACTS: PASS
