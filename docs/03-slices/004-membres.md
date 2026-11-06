# 004 — Membres : consulter, retirer, quitter

## Capacite
En tant que membre d'un foyer, je peux voir qui en fait partie et le quitter. En tant que responsable, je peux en retirer un membre, afin de maitriser qui accede a la liste. Les articles d'une personne partie restent, avec son prenom, et la responsable ne part jamais.

User stories : US-10, US-12, US-13 (PRD), et la preuve de bout en bout de US-06.2. Backlog : quatrieme et derniere tranche du MVP. Passage autonome (D-052) ; contrat sans validation humaine prealable, ecrans prouves sans visite guidee par tranche (D-053, D-059).

## Perimetre
### Touche
**Base** (une migration `--custom`, ecrite a la main selon l'ERD §4.6 et §4.7)
- `lc.remove_member(uuid)` et `lc.leave_household()` : fonctions `SECURITY DEFINER` de la liste fermee d'ADR-0005, proprietaire `lc_definer`, `EXECUTE` a `lc_app` seul.
- Aucune table, colonne, politique ni role nouveau : `lc.membership`, ses politiques, ses triggers `membership_count`, `membership_protect_owner` et `membership_immutable` existent depuis 001.

**Application** (`apps/web`)
- Couche de service `lib/members.ts` : lister, retirer, quitter, traduction de `LC005`, `LC006`, `LC007`, `LC009` en erreurs typees `INSUFFICIENT_ROLE`, `MEMBER_NOT_FOUND`, `OWNER_CANNOT_BE_REMOVED`, `OWNER_CANNOT_LEAVE`, `NO_HOUSEHOLD`.
- Route Handlers `GET /api/household/members`, `DELETE /api/household/members/:memberId`, `POST /api/household/leave`.
- `lib/items.ts` : perte du foyer pendant `addItem`, resultat type (suite de 003, voir Notes).

**Ecrans** (sobres, sans bibliotheque de style)
- Page du foyer : la liste des membres, avec le prenom et qui est la responsable ; « Retirer » pour la responsable, sur chaque membre sauf elle-meme ; « Quitter le foyer » pour un membre.
- Cote client : `NO_HOUSEHOLD` sur une action de la liste a son message et recharge la page, qui mene a « sans foyer » (suite de 003).

**Tests** : suite de la tranche.

**Documentation** : ERD §5 et §9, registre, journal, frictions, entree 06 du journal de projet.

### NE touche PAS
- **Transfert du role de responsable, suppression du foyer ou d'un compte, modification du prenom** : hors PRD (D-010, R1).
- **Contrats d'API** : `members.ts` est implemente tel quel, sans modification.
- **Code d'invitation** : un retrait ne le regenere pas. Une personne retiree peut revenir avec le code en vigueur (US-12.6). La responsable regenere le code si elle le veut (US-11).
- **Tables, roles, RLS et migrations** `0000` a `0007` : aucune n'est modifiee.
- **Fenetre 404 au lieu de 403** sur `PATCH` et `DELETE` d'un article, pour une requete en vol pendant un retrait : acceptee, voir Notes. Le critere porte sur la requete suivante (ADR-0002).
- **Details du client de 003** (`pendingId`, persistance de l'erreur) : visite guidee apres cette tranche.
- **Suites de tests de 003 (review-003 R2, R4), borne du corps de requete, `23514`, `10` en dur** : restent au backlog.
- **Aucune dependance nouvelle.** Pas de robot de navigateur (D-027).

## Dependances
- Tranches devant etre closes avant celle-ci : 002 (PR #5 fusionnee), 003 (PR #6 fusionnee, commit 418b95c).

## Contrat de donnees
| Table | Colonnes ajoutees / modifiees | Contraintes et index |
|---|---|---|
| aucune | aucune | Fonctions seules. `membership_household_idx`, `member_count` et son trigger, `membership_protect_owner` existent depuis 001 et portent les invariants de cette tranche. |

| Fonction | Specification | Erreurs |
|---|---|---|
| `lc.remove_member(p_membership_id uuid) RETURNS void` | ERD §4.6, prefixe de §4.5 | `LC001`, `LC009`, `LC005`, `LC007`, `LC006` |
| `lc.leave_household() RETURNS void` | ERD §4.7 | `LC001`, `LC009`, `LC007` |

## Contrat d'API
| Route | Methode | Entree | Sorties | Role minimal | Idempotent sur |
|---|---|---|---|---|---|
| `/api/household/members` | GET | — | `200 { members: [{ memberId, name, role }] }` ; 401 `UNAUTHENTICATED` ; 403 `NO_HOUSEHOLD` | member | lecture |
| `/api/household/members/:memberId` | DELETE | — | `200 { removed: true }` ; 401 ; 403 `NO_HOUSEHOLD` ; 403 `INSUFFICIENT_ROLE` ; 404 `MEMBER_NOT_FOUND` ; 409 `OWNER_CANNOT_BE_REMOVED` | owner | etat final : un rejeu donne 404 |
| `/api/household/leave` | POST | — | `200 { left: true }` ; 401 ; 403 `NO_HOUSEHOLD` ; 409 `OWNER_CANNOT_LEAVE` | member | etat final : un rejeu donne 403 |

La source de verite est `docs/02-architecture/api-contracts/members.ts`. Ordre de verification : celui de la liste `errors` de chaque contrat (ADR-0003). Un `:memberId` qui n'est pas un UUID donne `404`, comme une ressource absente (ADR-0006), mais apres les controles de foyer et de role. `memberId` est `lc.membership.id` : aucun identifiant de compte ne sort.

## Criteres d'acceptation
<!-- Format lu par scripts/close-slice.sh : « - [ ] AC1 — titre », coche « - [x] » une fois prouve. -->
- [ ] AC1 — **Voir les membres** (US-10.1, US-10.2)
  - Un membre et la responsable recoivent la meme liste : `memberId`, `name`, `role`, et rien d'autre.
  - La responsable y figure avec le role `owner`, chaque autre personne avec `member`.
  - L'ordre est celui de l'entree dans le foyer (`joined_at` puis `id`).
  - Aucune adresse e-mail ni identifiant de compte dans la reponse.
  - La reponse porte `Cache-Control: no-store`.
- [ ] AC2 — **Retirer un membre** (US-12.1, US-12.2, ADR-0002)
  - La responsable recoit `200 { removed: true }`. En base, l'appartenance a disparu, `member_count` baisse de 1 et egale le nombre de lignes.
  - **Coupure immediate** : la session encore ouverte du membre retire, avec le meme cookie, recoit a sa requete suivante `403 NO_HOUSEHOLD` sur `GET`, `POST`, `PATCH` et `DELETE` des articles, sur `GET` des membres et sur `POST leave`. `GET /api/me` rend `household: null`, et `/household` mene a `/no-household`.
  - Les articles de la personne retiree restent, cochables et supprimables par les autres, avec son prenom.
  - `item_count` ne change pas.
- [ ] AC3 — **Quitter le foyer** (US-13.1, US-13.2)
  - Un membre recoit `200 { left: true }`. En base, l'appartenance a disparu, `member_count` baisse de 1 et egale le nombre de lignes.
  - Sa session ouverte recoit `403 NO_HOUSEHOLD` sur la liste, et `/household` mene a `/no-household`.
  - Ses articles restent, avec son prenom. `item_count` ne change pas.
  - Un rejeu donne `403 NO_HOUSEHOLD`, sans autre effet.
- [ ] AC4 — **Refus et ordre de verification** (US-12.3, US-12.4, US-13.3, D-010, ADR-0003)
  - Sans session, les trois routes donnent `401 UNAUTHENTICATED`, y compris avec un `:memberId` mal forme.
  - Un compte sans foyer recoit `403 NO_HOUSEHOLD` sur les trois routes, y compris avec un `:memberId` mal forme.
  - Un membre qui tente de retirer quelqu'un, la responsable comprise, recoit `403 INSUFFICIENT_ROLE`, y compris avec un `:memberId` mal forme ou inexistant, et la cible reste dans le foyer.
  - La responsable qui vise sa propre ligne recoit `409 OWNER_CANNOT_BE_REMOVED`, et reste.
  - La responsable qui tente de quitter recoit `409 OWNER_CANNOT_LEAVE`, et reste.
  - `:memberId` mal forme, inexistant ou deja retire donne `404 MEMBER_NOT_FOUND`, et un rejeu de retrait aussi.
- [ ] AC5 — **Isolation tenant (entre foyers, le foyer etant le tenant, ADR-0002)**, avec deux foyers reels A et B, chacun avec sa responsable et un membre :
  - Par l'API, `GET members` de A ne montre aucun membre de B, ni sa page.
  - La responsable de A qui vise un membre de B, ou la responsable de B, recoit `404 MEMBER_NOT_FOUND`, avec exactement le meme statut et le meme corps qu'un identifiant inexistant ou mal forme. La cible reste dans B, et `member_count` de B ne change pas.
  - Directement en base sous `lc_app`, avec `app.user_id` de A : `SELECT` sur `lc.membership` ne rend aucune ligne de B, y compris avec un `app.household_id` force sur B, qui est ignore.
  - `remove_member` sous `app.user_id` de A, avec un `app.household_id` force sur B et l'identifiant d'un membre de B, leve `LC006` et ne touche rien.
  - `leave_household` d'un membre de A, avec un `app.household_id` force sur B, ne quitte que A.
  - `member_count` de A et de B restent chacun egaux au nombre de leurs lignes.
- [ ] AC6 — **Retour apres un depart et prenom conserve** (US-12.6, US-06.2, D-009)
  - Une personne retiree peut creer un foyer.
  - Une personne retiree ou partie peut rejoindre un autre foyer, ou le meme avec le code en vigueur, et retrouve la liste de ce foyer.
  - **US-06.2 de bout en bout** : un article ajoute par une personne retiree, et un autre par une personne partie, sont rendus par `GET items` et sur la page avec son prenom, pour les membres restants, apres son depart.
  - Le foyer quitte laisse une place : un foyer de 10 membres en accepte un nouveau apres un depart.
- [ ] AC7 — **Concurrence** (ERD §5). Requetes simultanees reelles sur la vraie base, jamais de mock.
  - Deux retraits paralleles du meme membre : un `200`, un `404`, et le compteur ne baisse qu'une fois.
  - Deux departs paralleles du meme membre : un `200`, un `403 NO_HOUSEHOLD`.
  - Un retrait et un depart paralleles du meme membre : un seul reussit, l'autre recoit son refus typee, et le compteur ne baisse qu'une fois. Aucun 500.
  - Scenario deterministe : un `DELETE` non commite tient la ligne, un retrait concurrent attend, puis recoit `LC006` apres le `COMMIT`.
  - **Borne des membres** : a 10 membres, avec un depart non commite, `join_household` recoit `LC004` tout de suite, puis une adhesion apres le `COMMIT` reussit (meme mecanisme que D-060).
  - Sous la borne, une adhesion attend le depart non commite, puis reussit.
- [ ] AC8 — **Ecran des membres** (US-10, US-12, US-13), prouve sur la page rendue par le serveur de test (D-053, D-059)
  - `/household` montre `<ul data-testid="member-list">` avec un `<li data-testid="member-row">` par membre, qui porte `data-role="owner"` ou `"member"` et montre le prenom ; la responsable est designee en toutes lettres.
  - La page de la responsable montre un bouton « Retirer » sur chaque ligne de membre et aucun sur la sienne, ni « Quitter le foyer ».
  - La page d'un membre montre « Quitter le foyer » et aucun bouton « Retirer ».
  - Aucune adresse e-mail dans le HTML, charge utile serialisee comprise. Un prenom contenant du HTML est rendu comme du texte.
  - Apres un retrait ou un depart par l'API, la page de la responsable ne montre plus la personne, et ses articles restent affiches avec son prenom.
  - La page d'un foyer ne contient aucun membre d'un autre foyer.
  - Les messages de `OWNER_CANNOT_BE_REMOVED`, `OWNER_CANNOT_LEAVE`, `MEMBER_NOT_FOUND` et `NO_HOUSEHOLD` existent et different du message generique. La decision apres une action sur les membres et apres une action sur la liste est une fonction pure testee.
- [ ] AC9 — **Garanties de la base** (ADR-0005, ERD §1, §3.3, §4.1, §7, `rules/drizzle-postgres.md`)
  - Le test de catalogue de l'usine est vert. Les deux fonctions sont `SECURITY DEFINER`, appartiennent a `lc_definer`, ont leur `search_path` fixe ; `PUBLIC` et `lc_better_auth` ne peuvent pas les executer, `lc_app` le peut.
  - Sans `app.user_id`, chacune leve `LC001`.
  - `remove_member` : sans foyer `LC009` ; appelant membre `LC005`, sans ecriture ; sa propre ligne `LC007` ; cible inexistante, deja partie ou d'un autre foyer `LC006`.
  - `leave_household` : sans foyer `LC009` ; responsable `LC007`, sans ecriture.
  - **La responsable ne part jamais** : un `DELETE` direct de la ligne `owner` sous un role qui passe outre la RLS leve `LC007`.
  - Apres chaque fonction, `app.household_id` est vide.
  - `lc_app` n'a toujours aucun droit d'ecriture sur `lc.membership`.
  - Aucun message d'erreur de ces fonctions ne contient un nom ou un identifiant de foyer.
- [ ] AC10 — **Perte du foyer pendant une action sur la liste** (suites de 003, D-025 Q-8, D-061)
  - Une adhesion ulterieure laisse `lc.item` intact : un article ajoute avant ou pendant un retrait reste (Q-8, ERD §5).
  - `addItem`, appele au niveau du service pour un compte sans foyer, rend `NO_HOUSEHOLD` et aucune exception (branche `LC009`).
  - La branche ou l'article est enregistre puis illisible rend `NO_HOUSEHOLD` et non une exception. Si aucun test deterministe ne peut l'atteindre, la fiche de preuves le declare.
  - `itemMutationEffect` : `NO_HOUSEHOLD` recharge la page et rend son message, et le formulaire d'ajout suit la meme decision.

## Anti-regression
- La suite de l'usine (`tests/_factory/db-catalog.test.ts`) et les tests de 001 a 003 restent verts. Seul change le test de `itemMutationEffect` qui exigerait « pas de rechargement » pour `NO_HOUSEHOLD`, s'il existe : le besoin a change, et la retouche part dans un commit `test(...)` dedie.
- `pnpm run check`, `pnpm test`, `bash scripts/ci-build.sh` et `pnpm audit --prod --audit-level=high` sont propres en local.

## Notes d'implementation
- **Migration** : `pnpm --filter @lc/db exec drizzle-kit generate --custom --name=<nom>`, puis remplir le fichier. Modele : `0005_join_invite_code.sql`. Terminer par `ALTER FUNCTION ... OWNER TO lc_definer`, `REVOKE ALL ... FROM PUBLIC`, `GRANT EXECUTE ... TO lc_app`.
- **`DELETE`, ordre** : session, puis si `:memberId` n'est pas un UUID, `findHousehold` : aucun foyer 403, role `member` 403, sinon 404. Avec un UUID, `remove_member` porte tout l'ordre (`LC009`, `LC005`, `LC007`, `LC006`). L'appelant ne fournit jamais de role ni de foyer.
- **`POST leave`** ne lit pas le corps : l'entree est vide, aucune entree externe n'est consommee.
- **`LC007` sur `remove_member`** ne peut viser que l'appelant : c'est la seule responsable du foyer, et la cible d'un autre foyer donne `LC006`. Une responsable d'un autre foyer visee donne donc `404`, et jamais `409`.
- **`listMembers`** lit `lc.membership` sous `lc_app`, filtre sur `household_id = lc.current_household_id()`, trie sur `joined_at, id`, et ne selectionne ni `user_id` ni rien de `lc_auth`. Le foyer et la lecture sont dans le meme `withUser`, comme `listItems`.
- **`addItem`, foyer perdu entre `add_item` et la relecture** : Q-8, confirmee par l'humain (D-025), a deja tranche : l'article reste. La fonction rend alors `NO_HOUSEHOLD` au lieu de lever, et la transaction valide. Sous RLS, le compte ne peut plus relire l'article, et c'est bien la reponse attendue d'un compte retire. Ecarte : annuler l'article, contraire a Q-8.
- **Fenetre 404 au lieu de 403** : `inHousehold` lit le foyer puis agit. Un retrait valide entre ces deux instructions donne `ITEM_NOT_FOUND` a la requete en vol. Aucune ecriture ne passe, rien n'est revele, et la requete suivante recoit 403. Acceptee sans code supplementaire (D-061).
- **Ecran** : composant client pour « Retirer » et « Quitter le foyer » : mutation, puis `router.refresh()` ; apres un depart reussi, `router.push("/no-household")`, comme le formulaire « rejoindre ». Decision apres mutation en fonction pure dans `ui/messages.ts`. Pas de demande de confirmation : le PRD n'en prevoit pas (meme lecture que D-055 et D-064, a juger a la visite guidee).
- **Props du client** : `memberId`, `name`, `role`, seulement. Pas de `user_id`, pas d'adresse (`rules/nextjs.md`). Pour savoir quelle ligne est celle de la responsable, `role` suffit : elle est seule a voir « Retirer », et sa ligne a le role `owner`.
- Les tests partagent une base reelle : `fileParallelism: false`. Les 10 membres sont crees par l'API reelle ou les helpers de 002.
