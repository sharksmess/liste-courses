# 002 — Rejoindre un foyer et gerer le code

## Capacite
En tant que compte sans foyer, je peux rejoindre le foyer de ma famille avec le code qu'on m'a donne de vive voix. En tant que responsable, je peux voir ce code et le regenerer, afin de maitriser qui entre dans le foyer.

User stories : US-05, US-11 (PRD). Backlog : deuxieme tranche, risque le plus eleve apres 001. Passage autonome (D-052) ; contrat sans validation humaine prealable, ecrans prouves sans visite guidee par tranche (D-053).

## Perimetre
### Touche
**Base** (une migration `--custom`, ecrite a la main selon l'ERD §4.4 et §4.5)
- `lc.join_household(text)`, `lc.get_invite_code()`, `lc.regenerate_invite_code()` : fonctions `SECURITY DEFINER` de la liste fermee d'ADR-0005, proprietaire `lc_definer`, `EXECUTE` a `lc_app` seul.
- Aucune table, colonne, politique ni role nouveau : `lc.invite_code` et ses politiques (dont `invite_code_definer_lookup`) existent depuis 001.

**Application** (`apps/web`)
- Couche de service : rejoindre, lire le code, regenerer le code, traduction de `LC002`, `LC003`, `LC004`, `LC005`, `LC009` en erreurs typees.
- Mise en forme `XXXXX-XXXXX` du code stocke (ADR-0004), en un seul endroit.
- Route Handlers `POST /api/household/join`, `GET` et `POST /api/household/invite-code`.

**Ecrans** (sobres, sans bibliotheque de style)
- Page « sans foyer » : le bloc « rejoindre avec un code » devient actif. La mention « bientot » disparait.
- Page du foyer : pour la responsable seule, le code en vigueur et un bouton de regeneration.

**Tests** : suite de la tranche, et retouche du test de 001 qui exigeait un bloc desactive, dans un commit `test(...)` dedie.

**Documentation** : ERD §9 (migration ajoutee), registre, journal, frictions, entree 04 du journal de projet.

### NE touche PAS
- **Articles et liste** (US-06 a US-09) : tranche 003. Pas de `lc.item`, pas de `add_item`, pas de compteur d'articles rempli. La page du foyer garde sa liste vide statique.
- **Membres** : consulter, retirer, quitter (US-10, US-12, US-13) : tranche 004. Pas de `remove_member`, pas de `leave_household`, pas de liste de membres a l'ecran.
- **Limiteur sur « rejoindre »** : aucun, par decision (ADR-0004). Les suites de la relecture 001 (`000-backlog.md`) restent au backlog.
- **Expiration du code, invitation par lien ou par e-mail** : hors PRD (ADR-0004).
- **Contrats d'API** : `household.ts` et `invite-code.ts` sont implementes tels quels, sans modification.
- **Roles, RLS, schemas et tables** de 001 : aucune migration deja appliquee n'est modifiee.
- **Aucune dependance nouvelle.** Pas de robot de navigateur (D-027).

## Dependances
- Tranches devant etre closes avant celle-ci : 001 (close, PR #2 fusionnee).
- Usine 1.6.6 adoptee (PR #3, D-047).

## Contrat de donnees
| Table | Colonnes ajoutees / modifiees | Contraintes et index |
|---|---|---|
| aucune | aucune | Fonctions seules. `invite_code_code_key` (unicite globale), `household_member_limit` (≤ 10) et `membership_user_key` (un foyer par compte) existent depuis 001 et portent les invariants de cette tranche. |

| Fonction | Specification | Erreurs |
|---|---|---|
| `lc.join_household(p_code text) RETURNS void` | ERD §4.4, etapes 1 a 9, verrou `FOR SHARE` compris | `LC001`, `LC002`, `LC003`, `LC004` |
| `lc.get_invite_code() RETURNS text` | ERD §4.5 | `LC001`, `LC009`, `LC005`, `P0001` |
| `lc.regenerate_invite_code() RETURNS text` | ERD §4.5, 5 essais au plus sur `invite_code_code_key` | `LC001`, `LC009`, `LC005`, `P0001` |

## Contrat d'API
| Route | Methode | Entree | Sorties | Role minimal | Idempotent sur |
|---|---|---|---|---|---|
| `/api/household/join` | POST | `code`, normalise par `InviteCodeInput` (D-025) | `200 { name, role: "member" }` ; 401 `UNAUTHENTICATED` ; 409 `ALREADY_IN_HOUSEHOLD` ; 422 `VALIDATION_FAILED` ; 404 `INVITE_CODE_INVALID` ; 409 `HOUSEHOLD_FULL` | no-household | non, sans doublon : un rejeu donne 409 |
| `/api/household/invite-code` | GET | — | `200 { code: "XXXXX-XXXXX" }` ; 401 ; 403 `NO_HOUSEHOLD` ; 403 `INSUFFICIENT_ROLE` | owner | lecture |
| `/api/household/invite-code` | POST | — | `200 { code: "XXXXX-XXXXX" }` ; 401 ; 403 `NO_HOUSEHOLD` ; 403 `INSUFFICIENT_ROLE` | owner | non : chaque appel emet un nouveau code |

La source de verite est `docs/02-architecture/api-contracts/household.ts` (`joinHousehold`, `InviteCodeInput`) et `invite-code.ts`. Ordre de verification : celui de la liste `errors` de chaque contrat (ADR-0003) ; pour `join`, un compte deja membre recoit donc `409` avant toute validation, comme `POST /api/household`.

## Criteres d'acceptation
<!-- Format lu par scripts/close-slice.sh : « - [ ] AC1 — titre », coche « - [x] » une fois prouve. -->
- [x] AC1 — **Rejoindre avec le code en vigueur** (US-05.1, ADR-0004, D-025)
  - Un compte sans foyer qui envoie le code en vigueur recoit `200 { name, role: "member" }`.
  - `GET /api/me` rend alors ce foyer avec le role `member`, et `/household` affiche son nom.
  - En base : une appartenance `member`, `display_name` = prenom du compte, `member_count` = 2, egal au nombre de lignes.
  - La saisie est normalisee : minuscules, espaces, tirets, et `O`, `I`, `L` mis pour `0`, `1`, `1` aboutissent au meme foyer.
- [x] AC2 — **Code refuse sans rien reveler** (US-05.2, ADR-0004)
  - Un code bien forme mais inconnu donne `404 INVITE_CODE_INVALID`.
  - Un code remplace par une regeneration donne exactement le meme statut et le meme corps.
  - Le corps ne contient ni nom ni identifiant de foyer. Aucune appartenance n'est creee, et `member_count` ne change pas.
  - Un code mal forme apres normalisation (caractere `U`, ponctuation, 9 ou 11 caracteres), ou absent, ou qui n'est pas une chaine, donne `422 VALIDATION_FAILED`, avec le champ en cause et jamais sa valeur.
- [x] AC3 — **Foyer plein et concurrence** (US-05.3, ERD §5). Requetes simultanees reelles sur la vraie base, jamais de mock.
  - Un foyer de 10 membres refuse le 11e : `409 HOUSEHOLD_FULL`, et le compte reste a 10.
  - **Le 10e et le 11e membre rejoignent en parallele** : exactement un `200` et un `409 HOUSEHOLD_FULL`, `member_count` = 10, egal au nombre de lignes.
  - Le meme compte envoie deux adhesions simultanees : un `200`, un `409 ALREADY_IN_HOUSEHOLD`, une seule appartenance.
  - **Adhesion pendant une regeneration** : une regeneration tient son verrou sans avoir commite, l'adhesion avec l'ancien code attend ; apres le `COMMIT`, elle est refusee par `LC003`. Le code remplace n'ouvre jamais le foyer (ERD §4.4, etape 6).
- [x] AC4 — **Permissions** (US-05.4, US-05.5, US-11.2, US-11.4)
  - Sans session : `POST join`, `GET` et `POST invite-code` donnent `401 UNAUTHENTICATED`.
  - Un compte deja membre, ou responsable d'un foyer, qui tente de rejoindre un autre foyer recoit `409 ALREADY_IN_HOUSEHOLD`, y compris avec un code mal forme, et reste dans son foyer.
  - Un compte sans foyer sur `GET` ou `POST invite-code` recoit `403 NO_HOUSEHOLD`.
  - Un membre qui n'est pas la responsable recoit `403 INSUFFICIENT_ROLE` sur `GET` et sur `POST invite-code`, et le code reste inchange en base.
- [x] AC5 — **Isolation tenant (entre foyers, le foyer etant le tenant, ADR-0002)**, avec deux foyers reels A et B, chacun avec sa responsable :
  - Par l'API, la responsable de A lit le code de A, jamais celui de B. Regenerer le code de A laisse celui de B inchange.
  - Le code de A ne fait rejoindre que A, et celui de B que B (US-11.5).
  - Directement en base sous `lc_app`, avec `app.user_id` = responsable de A : `get_invite_code` rend le code de A, et `regenerate_invite_code` ne touche que A, y compris avec un `app.household_id` force sur B, qui est ignore.
  - Sous `lc_app`, `lc.invite_code` reste illisible et non modifiable, meme avec `app.invite_code_lookup` pose sur le code de B.
  - Un `app.household_id` force sur B avant `join_household` n'influence pas le foyer rejoint.
- [x] AC6 — **Voir et regenerer le code** (US-11.1, US-11.3)
  - `GET` rend le code au format `XXXXX-XXXXX`, identique a la valeur stockee une fois le tiret retire, et stable d'une lecture a l'autre.
  - `POST` rend un code different, qui devient celui de `GET` et celui de la base ; `issued_at` avance.
  - Apres regeneration, l'ancien code est refuse (`404 INVITE_CODE_INVALID`) et le nouveau fait rejoindre le foyer.
  - Ces deux reponses portent `Cache-Control: no-store`.
- [x] AC7 — **Ecran « rejoindre »** (US-04.1, US-05.3), prouve sur la page rendue par le serveur de test (D-053)
  - `/no-household` montre un formulaire actif avec un champ nomme `code` : plus aucun element `disabled` dans ce bloc, plus la mention « bientot ».
  - Le formulaire « creer un foyer » reste present.
  - Une fois le foyer rejoint, `/no-household` et `/` amenent sur `/household`.
  - Les messages affiches pour `INVITE_CODE_INVALID` et `HOUSEHOLD_FULL` existent, different du message generique, et le premier ne cite aucun foyer ; le second dit explicitement que le foyer est complet.
- [x] AC8 — **Ecran du code** (US-11.1, US-11.2, US-11.3), prouve sur la page rendue par le serveur de test (D-053)
  - `/household` de la responsable affiche le code au format `XXXXX-XXXXX` et un bouton de regeneration.
  - `/household` d'un membre du meme foyer ne contient le code nulle part dans son HTML, charge utile serialisee comprise, ni le bouton.
  - Apres `POST invite-code`, la page de la responsable affiche le nouveau code et plus l'ancien.
- [x] AC9 — **Garanties de la base** (ADR-0005, ERD §4.1, §4.11, §7, `rules/drizzle-postgres.md`)
  - Le test de catalogue de l'usine est vert. Les trois fonctions sont `SECURITY DEFINER`, appartiennent a `lc_definer`, ont leur `search_path` fixe ; `PUBLIC` ne peut pas les executer, `lc_app` le peut, et `lc_better_auth` non.
  - Sans `app.user_id`, chacune leve `LC001`.
  - `join_household` : deja membre `LC002` ; code inconnu, `NULL` ou non normalise `LC003` ; foyer complet `LC004`. `LC002` et `LC003` precedent `LC004`.
  - `get_invite_code` et `regenerate_invite_code` : sans foyer `LC009`, membre `LC005`, sans ecriture.
  - Aucun message d'erreur de ces fonctions ne contient un nom ou un identifiant de foyer.
  - Apres chaque fonction, `app.household_id` et `app.invite_code_lookup` sont vides.
  - `lc_app` n'a toujours aucun droit sur `lc.invite_code` ni d'ecriture sur `lc.membership`.

## Anti-regression
- La suite de l'usine (`tests/_factory/db-catalog.test.ts`) et les tests de 001 restent verts. Seul change le test qui exigeait un bloc « rejoindre » desactive : le besoin a change, et la retouche part dans un commit `test(...)` dedie.
- `pnpm run check`, `pnpm test`, `bash scripts/ci-build.sh` et `pnpm audit --prod --audit-level=high` sont propres en local.

## Notes d'implementation
- **Migration** : `pnpm --filter @lc/db exec drizzle-kit generate --custom --name=<nom>`, puis remplir le fichier. Jamais de modification de `0000` a `0004`. Terminer par `ALTER FUNCTION ... OWNER TO lc_definer`, `REVOKE ALL ... FROM PUBLIC`, `GRANT EXECUTE ... TO lc_app`.
- **`join_household`** suit l'ERD §4.1 point 8 : l'`INSERT` est enveloppe dans un bloc `EXCEPTION` qui traduit `household_member_limit` en `LC004` et `membership_user_key` en `LC002`, et releve toute autre contrainte telle quelle.
- **Sortie de `join`** : `join_household` rend `void`. Le service relit le nom par `lc.current_household_id()` dans la meme transaction, comme `createHousehold`.
- **Le code a l'ecran** : `/household` le rend dans le Server Component, seulement si le role est `owner`, sans le passer en prop a un composant client (`rules/nextjs.md`). Le bouton de regeneration appelle le Route Handler puis `router.refresh()`.
- Les longueurs se comptent en points de code. La normalisation vit dans le seul `InviteCodeInput`.
- Les tests partagent une base reelle : `fileParallelism: false`. Les 9 membres de la concurrence sont crees par l'API reelle, et chaque test reste independant.
