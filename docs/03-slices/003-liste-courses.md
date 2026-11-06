# 003 — La liste de courses

## Capacite
En tant que membre d'un foyer, quel que soit mon role, je peux voir la liste de mon foyer, y ajouter un article, cocher ou decocher n'importe quel article et en supprimer n'importe lequel, afin que la famille partage une seule liste de courses.

User stories : US-06, US-07, US-08, US-09 (PRD). Backlog : troisieme tranche, coeur du produit. Passage autonome (D-052) ; contrat sans validation humaine prealable, ecrans prouves sans visite guidee par tranche (D-053, D-059).

## Perimetre
### Touche
**Base** (une migration generee par `pnpm db:generate` pour la table, une migration `--custom` ecrite a la main selon l'ERD §1, §3.5, §4.8, §4.9)
- `lc.item`, ses contraintes et l'index `item_household_order_idx` (ERD §3.5), declares dans le schema Drizzle.
- Proprietaire, RLS forcee, privileges de la matrice de l'ERD §1, cinq politiques (ERD §3.5).
- `lc.add_item(text, text)` (ERD §4.8) et le trigger `lc.item_count_trg()` (ERD §4.9).

**Application** (`apps/web`)
- Couche de service `lib/items.ts` : lister, ajouter, cocher et decocher, supprimer, avec erreurs typees `ITEM_NOT_FOUND` et `ITEM_LIMIT_REACHED`, traduction de `LC008` et `LC009`.
- Route Handlers `GET` et `POST /api/household/items`, `PATCH` et `DELETE /api/household/items/:itemId`.
- Factorisation de `readJson` et de l'extraction des champs en echec dans `lib/`, reprise par `api/household/route.ts` et `api/household/join/route.ts` sans changement de comportement (backlog, review-002 suggestion 9 : a faire avant que 003 et 004 multiplient la copie).

**Ecrans** (sobres, sans bibliotheque de style)
- Page du foyer : la liste rendue par le serveur, avec le nom, la quantite si elle existe, l'etat et l'auteur de chaque article ; un formulaire d'ajout ; une case a cocher et un bouton « Supprimer » par article.

**Tests** : suite de la tranche.

**Documentation** : ERD §9 (migrations ajoutees), registre, journal, frictions, entree 05 du journal de projet.

### NE touche PAS
- **Membres** : consulter, retirer, quitter (US-10, US-12, US-13) : tranche 004. La survie du prenom de l'auteur apres un depart (US-06.2) est **preparee** ici par la copie `author_name`, sans cle vers `membership`, et **prouvee de bout en bout en 004**, qui seule cree des departs.
- **Modification d'un article, tri, categories, recherche, plusieurs listes, historique, temps reel** : hors PRD. Les changements des autres membres apparaissent au rechargement (US-06.5).
- **Contrats d'API** : `items.ts` est implemente tel quel, sans modification.
- **Roles, RLS et tables** de 001 et 002 : aucune migration deja appliquee n'est modifiee. `household.item_count` et ses deux `CHECK` existent depuis 001.
- **Borne de taille du corps de requete** : reste au backlog (audit-002 MINEUR-1), avant toute mise en ligne. Elle exigerait un statut absent des contrats.
- **`23514` sur une colonne de texte, et caractere NUL dans une chaine** : restent des 500, conformement a l'ERD pour le premier (`Codes d'erreur`) ; suite de review-001 au backlog.
- **Autres suites de 001 et 002** (`10` en dur, renforts AC8, limiteur) : restent au backlog. Seule la factorisation ci-dessus est reprise.
- **Aucune dependance nouvelle.** Pas de robot de navigateur (D-027).

## Dependances
- Tranches devant etre closes avant celle-ci : 001 (PR #2 fusionnee), 002 (PR #5 fusionnee, commit 6d144d4).

## Contrat de donnees
| Table | Colonnes ajoutees / modifiees | Contraintes et index |
|---|---|---|
| `lc.item` (nouvelle) | `id`, `household_id`, `name`, `quantity`, `purchased`, `author_user_id`, `author_name`, `created_at` (ERD §3.5) | `item_name_check`, `item_quantity_check`, `item_author_name_check`, cles `RESTRICT` vers `household` et `app_user`, `item_household_order_idx (household_id, created_at, id)`. Aucun index unique (US-07.4). |
| `lc.household` | aucune | `item_count` et `household_item_limit` (≤ 200), existants, portent la borne. Le trigger de cette tranche les met en service. |

| Fonction | Specification | Erreurs |
|---|---|---|
| `lc.add_item(p_name text, p_quantity text) RETURNS uuid` | ERD §4.8, regles communes §4.1 | `LC001`, `LC009`, `LC008`, `23514` releve tel quel pour une colonne de texte |
| `lc.item_count_trg()` (`AFTER INSERT OR DELETE ON lc.item FOR EACH ROW`) | ERD §4.9 | `P0001` si `ROW_COUNT <> 1`, `23514` sur la borne, traduit par `add_item` |

Privileges : `lc_app` a `SELECT`, `UPDATE (purchased)`, `DELETE` sur `lc.item`, et `lc_definer` `SELECT`, `INSERT` (ERD §1). Politiques : `item_member_select`, `item_member_update`, `item_member_delete`, `item_definer_select`, `item_definer_insert` (ERD §3.5).

## Contrat d'API
| Route | Methode | Entree | Sorties | Role minimal | Idempotent sur |
|---|---|---|---|---|---|
| `/api/household/items` | GET | — | `200 { items: Item[] }` ; 401 `UNAUTHENTICATED` ; 403 `NO_HOUSEHOLD` | member | lecture |
| `/api/household/items` | POST | `name`, `quantity?` | `201 Item` ; 401 ; 403 `NO_HOUSEHOLD` ; 422 `VALIDATION_FAILED` ; 409 `ITEM_LIMIT_REACHED` | member | non : doublons autorises (US-07.4) |
| `/api/household/items/:itemId` | PATCH | `purchased` | `200 Item` ; 401 ; 403 `NO_HOUSEHOLD` ; 404 `ITEM_NOT_FOUND` ; 422 `VALIDATION_FAILED` | member | oui, sur (itemId, purchased) |
| `/api/household/items/:itemId` | DELETE | — | `200 { deleted: true }` ; 401 ; 403 `NO_HOUSEHOLD` ; 404 `ITEM_NOT_FOUND` | member | etat final : un rejeu donne 404 |

La source de verite est `docs/02-architecture/api-contracts/items.ts`. Ordre de verification : celui de la liste `errors` de chaque contrat (ADR-0003). Un `:itemId` qui n'est pas un UUID donne `404`, comme une ressource absente (ADR-0006). `Item` n'expose ni `household_id` ni `author_user_id`.

## Criteres d'acceptation
<!-- Format lu par scripts/close-slice.sh : « - [ ] AC1 — titre », coche « - [x] » une fois prouve. -->
- [ ] AC1 — **Voir la liste** (US-06.1, US-06.3, US-06.4, US-06.5)
  - Un foyer sans article donne `200 { items: [] }`.
  - Chaque article porte exactement `id`, `name`, `quantity` (`null` si absente), `purchased`, `addedBy.name`, `createdAt`, et rien d'autre.
  - La responsable et un membre du meme foyer voient la meme liste.
  - Les articles sortent dans l'ordre d'ajout (`created_at` puis `id` croissants), meme apres que le premier a ete coche.
  - La reponse porte `Cache-Control: no-store`, et un changement d'un autre membre apparait a la lecture suivante.
- [ ] AC2 — **Ajouter un article** (US-07.1, US-07.3, US-07.4)
  - `POST` donne `201` et l'article : non coche, `addedBy.name` = prenom de l'appelant, `quantity` `null` si absente.
  - Les espaces de bord sont retires du nom et de la quantite ; c'est la valeur retiree qui est enregistree.
  - Une quantite absente, `null`, vide ou faite d'espaces est enregistree `NULL`.
  - Bornes atteintes acceptees : nom de 100 et quantite de 30 points de code, emoji compris (Q-2).
  - Deux articles du meme nom coexistent.
  - En base : `author_user_id` = appelant, `author_name` = `display_name` de son appartenance, `item_count` augmente de 1, et egale le nombre de lignes.
  - Un corps qui ajoute `purchased: true`, un auteur ou un foyer n'a aucun effet : ces valeurs viennent de la session.
- [ ] AC3 — **Ajout refuse par la validation** (US-07.2, US-07.3)
  - `name` absent, vide, fait d'espaces, de plus de 100 points de code, ou qui n'est pas une chaine donne `422 VALIDATION_FAILED` avec `fields` contenant `name`.
  - `quantity` de plus de 30 points de code apres retrait des espaces, ou qui n'est pas une chaine, donne `422` avec `fields` contenant `quantity`.
  - Un corps absent ou qui n'est pas du JSON donne `422`.
  - La reponse ne contient jamais la valeur recue, aucune ligne n'est creee et `item_count` ne change pas.
- [ ] AC4 — **Permissions et ordre de verification** (US-04.2, ADR-0003)
  - Sans session, les quatre routes donnent `401 UNAUTHENTICATED`, meme avec un corps invalide ou un `:itemId` mal forme.
  - Un compte sans foyer recoit `403 NO_HOUSEHOLD` sur les quatre routes, meme avec un corps invalide ou un `:itemId` mal forme.
  - `POST` : `422` avant `409` : un corps invalide sur une liste pleine donne `422`.
  - `PATCH` : `404` avant `422` : `purchased` invalide sur un article absent donne `404`.
- [ ] AC5 — **Isolation tenant (entre foyers, le foyer etant le tenant, ADR-0002)**, avec deux foyers reels A et B, chacun avec sa responsable et un article :
  - Par l'API, A ne voit aucun article de B, ni dans `GET`, ni sur sa page.
  - `PATCH` et `DELETE` de A sur un article de B donnent `404 ITEM_NOT_FOUND`, avec exactement le meme statut et le meme corps qu'un identifiant inexistant ou mal forme. L'article de B reste intact et `item_count` de B ne change pas.
  - Directement en base sous `lc_app`, avec `app.user_id` de A : `SELECT` ne rend aucune ligne de B ; `UPDATE` et `DELETE` visant B touchent zero ligne, y compris avec un `app.household_id` force sur B, qui est ignore.
  - `add_item` sous `app.user_id` de A, avec un `app.household_id` force sur B, cree l'article dans A, avec A pour auteur.
  - `item_count` de A et de B restent chacun egaux au nombre de leurs lignes.
- [ ] AC6 — **Cocher et decocher** (US-08.1, US-08.2, US-08.3)
  - `PATCH { purchased: true }` donne `200` et l'article coche ; `{ purchased: false }` le decoche. La base suit.
  - Un membre coche et decoche l'article de la responsable, et inversement.
  - Rejouer la meme valeur donne `200` et le meme etat final.
  - `purchased` absent ou non booleen donne `422` avec `fields` contenant `purchased`, et l'etat ne change pas.
  - Un `itemId` place dans le corps est ignore : seul le parametre de route compte.
  - Seul `purchased` change : `name`, `quantity`, l'auteur et `created_at` restent identiques, et `item_count` ne bouge pas.
- [ ] AC7 — **Supprimer** (US-09.1, US-09.3)
  - `DELETE` donne `200 { deleted: true }` et l'article disparait de `GET` et de la base.
  - Un membre supprime l'article de la responsable, et inversement.
  - Un rejeu donne `404 ITEM_NOT_FOUND` sans autre effet.
  - `item_count` diminue de 1, et egale le nombre de lignes.
- [ ] AC8 — **Borne de 200 et concurrence** (US-07.5, US-09.3, ERD §5). Requetes simultanees reelles sur la vraie base, jamais de mock.
  - Un foyer de 200 articles, coches compris, refuse le suivant : `409 ITEM_LIMIT_REACHED`, et le nombre reste 200.
  - **Deux ajouts paralleles a 199 articles** : exactement un `201` et un `409 ITEM_LIMIT_REACHED`, `item_count` = 200, egal au nombre de lignes.
  - Apres une suppression a 200, l'ajout suivant reussit.
  - Une suppression et un ajout paralleles a 200 articles : aucun 500 ni interblocage, la suppression reussit, le nombre final est 199 ou 200 selon l'ordre, et `item_count` egale le nombre de lignes.
  - Deux suppressions paralleles du meme article : un `200` et un `404`, et le compteur ne baisse qu'une fois.
  - La borne vaut par foyer : un foyer plein ne bloque pas un autre foyer.
- [ ] AC9 — **Ecran de la liste** (US-06, US-07.5, US-08, US-09), prouve sur la page rendue par le serveur de test (D-053, D-059)
  - Foyer sans article : `<ul data-testid="item-list">` sans `<li`, et la mention « La liste est vide. ».
  - Foyer avec articles : un `<li data-testid="item-row">` par article, dans l'ordre d'ajout, qui porte `data-purchased="true"` ou `"false"` et montre le nom, la quantite si elle existe et le prenom de l'auteur ; la mention « La liste est vide. » n'y figure plus.
  - Chaque ligne a une case a cocher, cochee si l'article est achete, et un bouton « Supprimer ».
  - `/household` montre un formulaire `data-testid="add-item-form"` avec un champ `name` obligatoire et un champ `quantity` facultatif, pour la responsable comme pour un membre.
  - Apres `POST`, `PATCH` ou `DELETE` par l'API, la page rendue reflete le nouvel etat.
  - Un nom contenant du HTML est affiche comme du texte : aucune balise n'est injectee.
  - La page d'un foyer ne contient aucun article d'un autre foyer.
  - Les messages de `ITEM_LIMIT_REACHED` et `ITEM_NOT_FOUND` existent et different du message generique ; le premier dit explicitement que la liste est pleine.
- [ ] AC10 — **Garanties de la base** (ADR-0005, ERD §1, §4.1, §4.9, §7, `rules/drizzle-postgres.md`)
  - Le test de catalogue de l'usine est vert. `add_item` et `item_count_trg` sont `SECURITY DEFINER`, appartiennent a `lc_definer`, ont leur `search_path` fixe ; `PUBLIC` et `lc_better_auth` ne peuvent pas les executer ; `lc_app` peut executer `add_item`, pas `item_count_trg`.
  - `lc.item` appartient a `lc_owner`, sa RLS est activee et forcee : sous `lc_owner`, zero ligne.
  - `lc_app` n'a pas `INSERT` sur `lc.item`, ni `UPDATE` sur une autre colonne que `purchased`, ni aucun droit d'ecriture sur `lc.household`.
  - `add_item` : sans `app.user_id`, `LC001` ; sans foyer, `LC009` ; a 200 articles, `LC008`. Une valeur de texte interdite par `item_name_check` ou `item_quantity_check` releve `23514`, et non `LC008`.
  - Apres `add_item`, `app.household_id` est vide. Apres une suppression par `lc_app`, le trigger a restaure sa valeur precedente.
  - Aucun message d'erreur de ces fonctions ne contient un nom ou un identifiant de foyer.
  - L'index `item_household_order_idx` existe sur `(household_id, created_at, id)`, et aucun index unique ne porte sur `name`.

## Anti-regression
- La suite de l'usine (`tests/_factory/db-catalog.test.ts`) et les tests de 001 et 002 restent verts, sans modification. `POST /api/household` et `POST /api/household/join` gardent exactement leur comportement apres la factorisation.
- `pnpm run check`, `pnpm test`, `bash scripts/ci-build.sh` et `pnpm audit --prod --audit-level=high` sont propres en local.

## Notes d'implementation
- **Migrations** : `pnpm db:generate` pour `lc.item` (a partir du schema Drizzle), puis `pnpm --filter @lc/db exec drizzle-kit generate --custom --name=<nom>` pour le reste. Jamais de modification de `0000` a `0005`. Modeles : `0004_household.sql` (RLS, privileges, trigger `membership_count`) et `0005_join_invite_code.sql` (fonctions).
- **`add_item`** suit l'ERD §4.1 point 8 : l'`INSERT` est enveloppe dans un bloc `EXCEPTION` qui traduit `household_item_limit` en `LC008` et releve toute autre contrainte telle quelle.
- **Sortie de `POST`** : `add_item` rend l'identifiant. Le service relit l'article dans la meme transaction, sous `lc_app`, filtre sur `id` et `household_id = lc.current_household_id()`.
- **Isolation explicite** : toute requete de `lib/items.ts` filtre sur `household_id = lc.current_household_id()`, en plus de la RLS (CLAUDE.md, ADR-0002). `userId` vient de la session.
- **Foyer et action dans la meme transaction** : `PATCH` et `DELETE` lisent `lc.current_household_id()` dans le meme `withUser` que l'ecriture. `NULL` donne `NO_HOUSEHOLD`, zero ligne touchee donne `ITEM_NOT_FOUND`. Un compte sans foyer des le debut de la transaction n'obtient donc pas 404. En `READ COMMITTED`, chaque instruction relit l'appartenance : apres la coupure de 004, aucune ecriture ne passe ; un retrait survenu entre les deux instructions donne 404 au lieu de 403, sans rien reveler (suite au backlog).
- **`PATCH`, ordre** : session, foyer, format de `:itemId` (404), puis corps. Si le corps est invalide, le service verifie l'existence de l'article dans le foyer : absent 404, present 422. `itemId` vient du seul parametre de route, jamais du corps.
- **`POST`, ordre** : session, foyer, validation, ajout. `LC009` reste traduit en `NO_HOUSEHOLD` pour une perte de foyer entre les deux.
- **`createdAt`** : `timestamptz` rendu en ISO 8601 par `Date.prototype.toISOString`. `withUser` tient une seule transaction : deux `add_item` d'une meme transaction ont le meme `created_at` et l'ordre entre eux tient alors a `id`, qui n'est pas monotone a l'interieur d'une milliseconde. Un test d'ordre n'utilise donc que des ajouts dans des transactions distinctes.
- **Client** : `ui/requests.ts` gagne un appel generique par methode, dont `postJson` reste un cas particulier. Mutation, puis `router.refresh()`. Sur `ITEM_NOT_FOUND` (article supprime par un autre membre), le message s'affiche et la page est rechargee.
- **Message de liste pleine** : sans le nombre 200, pour ne pas recreer le couplage signale par review-002 (suggestion 12).
- **Serie de 199 ou 200 articles dans les tests** : amorcee par `add_item` sous `lc_app`, pas par 200 appels HTTP. Le compteur est tenu par le trigger, jamais pose a la main. Les requetes paralleles, elles, passent par l'API reelle.
- Les longueurs se comptent en points de code. Les tests partagent une base reelle : `fileParallelism: false`.
