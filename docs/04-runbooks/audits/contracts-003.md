# Controle des contrats, tranche 003 (branche `slice/003-liste-courses`)

Perimetre : `git diff main...HEAD`. Je n'ai pas lance `pnpm test`. Je me suis appuye sur le resultat transmis : 375 tests verts. Je n'ai lu aucun fichier `.env*.local` ni `*.local.ps1`.

## 1. Contrats declares
- `git diff main...HEAD -- docs/02-architecture/api-contracts` est vide. `items.ts` et `_contract.ts` sont donc inchanges.
- `apps/web/src/lib/contracts.ts` ne fait que re-exporter `addItem`, `deleteItem`, `listItems` et `setItemPurchased`. C'est un ajout.
- Les handlers importent ces contrats et valident entrees et sorties avec eux : `contract.input.safeParse` et `contract.output.parse`.

## 2. Routes `api/household/items/**` face a `items.ts`

| Route | Statuts de succes | Cache-Control | Ordre de verification | Verdict |
|---|---|---|---|---|
| `GET /api/household/items` | 200 | `no-store` | 401, puis 403 (`NO_HOUSEHOLD`, controle dans la meme transaction que la lecture) | conforme |
| `POST /api/household/items` | 201 | `no-store` | 401, 403, 422, 409 | conforme |
| `PATCH /api/household/items/:itemId` | 200 | `no-store` | 401, 403, 404, 422 | conforme |
| `DELETE /api/household/items/:itemId` | 200, corps `{deleted:true}` | `no-store` | 401, 403, 404 | conforme |

- **GET** : le tri est `created_at, id`. La reponse est `{items}` et le contrat la limite a 200 articles.
- **POST** :
  - Le foyer et l'auteur viennent de la session, via `lc.add_item`. Le corps n'apporte que `name` et `quantity`.
  - La borne de 200 est portee par la base : `LC008` est traduit en 409 `ITEM_LIMIT_REACHED`.
  - `LC009` (foyer perdu) devient 403 `NO_HOUSEHOLD`.
- **PATCH et DELETE** :
  - Un `itemId` qui n'est pas un UUID, un article absent, un article d'un autre foyer et un article deja supprime donnent tous 404 `ITEM_NOT_FOUND`.
  - Un `itemId` invalide sans foyer donne 403 avant 404.
  - Pour PATCH, le 404 est evalue avant le 422.
  - Un rejeu de DELETE donne 404, comme le prevoit le contrat.
- **Corps d'erreur** : tous passent par `errorResponse`. `ITEM_NOT_FOUND` et `ITEM_LIMIT_REACHED` ont ete ajoutes a l'union `ApiError` avec les statuts du contrat (404 et 409). Le 422 porte `fields` (noms de champs, jamais les valeurs).
- **Corps exposes** : l'article expose `id`, `name`, `quantity` (nullable), `purchased`, `addedBy.name` et `createdAt` (ISO). Ni le foyer ni `author_user_id` ne sortent.

## 3. `POST /api/household` et `POST /api/household/join`
- **Factorisation** : le diff est une extraction pure. `readJson` (corps identique, `undefined` si illisible) et `failedFields` (meme expression : chemins dedoublonnes, `(corps)` pour le corps entier) vont dans `lib/request.ts`.
- **Comportement conserve** : l'ordre est inchange (401, puis 409 `ALREADY_IN_HOUSEHOLD` avant validation, puis 422). Les statuts, codes, corps et en-tetes sont les memes.
- **Contrat** : aucun changement de contrat. Il n'y a pas de rupture.

## 4. Migrations
- **Anciennes migrations** : `git diff --name-only` ne signale aucun fichier `0000` a `0005`. Seuls `meta/_journal.json` (deux entrees ajoutees, idx 6 et 7) et les snapshots `0006` et `0007` (nouveaux) sont touches.
- **0006** : elle ne fait que `CREATE TABLE lc.item`, ses clefs etrangeres (`RESTRICT`) et un index. Aucune table existante n'est modifiee.
- **0007** :
  - Elle active la RLS sur `lc.item` et pose les GRANT, les politiques, le trigger `item_count` et la fonction `add_item`.
  - Les colonnes `household.item_count` et ses deux CHECK existent depuis `0002` et sont seulement utilises. Le defaut est 0.
  - Aucune colonne ni enumeration n'est supprimee ou renommee, et aucun NOT NULL n'est ajoute a une table existante.
  - `lc_app` ne recoit que `SELECT, DELETE` et `UPDATE(purchased)`.
- **Schema Drizzle** : `schema/household.ts` ne change que dans un commentaire. `schema/index.ts` ajoute l'export `item`.
- **Flux existants** : aucun flux existant ne supprime d'utilisateur ni de foyer, donc les clefs `RESTRICT` ne creent pas de regression (`git grep` sans resultat dans `apps` et `packages`).
- **ERD** : la section 9 est mise a jour avec 0006 et 0007 dans la meme PR, et l'ecart sur la suppression concurrente a la borne est documente.

## 5. Types et interfaces partages
- `ApiError` : ajout de deux membres d'union. Aucun existant n'est retire ni modifie.
- `ui/requests.ts` : `postJson` garde sa signature et son comportement (`POST`, en-tete JSON et corps `JSON.stringify`). Il delegue a `sendJson`, nouvel export. L'ajout de PATCH et DELETE ne modifie pas les appelants existants.
- `ui/messages.ts` : deux messages ajoutes, aucun modifie.
- `app/household/page.tsx` : la page affiche maintenant la liste et le formulaire. Elle redirige vers `/no-household` si le foyer est perdu entre deux lectures. Les anciens `data-testid="item-list"` et le texte « La liste est vide. » ne sont plus ecrits directement dans la page. L'ecran n'est pas un contrat d'API, et les tests d'ecran de la tranche couvrent le nouveau rendu.

## 6. Ruptures
Aucune rupture : pas de champ supprime ou renomme, pas de statut change, pas de colonne ni de valeur d'enumeration supprimee, pas de NOT NULL ajoute.

Observation, hors rupture : les ajouts (routes, table, fonction, codes d'erreur) sont tous additifs. Aucun ADR de migration n'est requis.

Fichiers cles :
- `C:\dev\liste-courses\docs\02-architecture\api-contracts\items.ts`
- `C:\dev\liste-courses\apps\web\src\app\api\household\items\route.ts`
- `C:\dev\liste-courses\apps\web\src\app\api\household\items\[itemId]\route.ts`
- `C:\dev\liste-courses\apps\web\src\lib\request.ts`
- `C:\dev\liste-courses\apps\web\src\lib\items.ts`
- `C:\dev\liste-courses\packages\db\migrations\0006_item.sql`
- `C:\dev\liste-courses\packages\db\migrations\0007_item_rls_functions.sql`

CONTRACTS: PASS
