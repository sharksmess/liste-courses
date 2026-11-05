# Audit de securite — tranche 002 (rejoindre un foyer et gerer le code)

Branche `slice/002-rejoindre-foyer`, diff `git diff 4c1b0bb...HEAD`. Relecture statique, sans execution de la suite ni du serveur.

## Synthese
- CRITIQUE : 0
- MAJEUR : 0
- MINEUR : 1

Aucune fuite entre foyers, aucun defaut d'autorisation et aucun contournement du code d'invitation n'a ete trouve. Le seul constat est un defaut de robustesse, deja present dans `POST /api/household`.

## Constats

### MINEUR-1 — Corps de requete non borne sur `POST /api/household/join`
- **Gravite** : MINEUR (dette). L'application n'est pas en ligne (D-011).
- **Emplacement** : `apps/web/src/app/api/household/join/route.ts:17`. Meme schema dans `apps/web/src/app/api/household/route.ts:17`, hors de ce diff. `InviteCodeInput` (`docs/02-architecture/api-contracts/household.ts:73`) n'a pas de longueur maximale avant sa transformation.
- **Cause** : `request.json()` lit tout le corps en memoire. Le module `app-route` de Next 16.4.3 ne contient aucune limite de taille, et le depot n'a ni `middleware` ni `proxy`.
- **Scenario d'exploitation** :
  1. L'attaquant cree un compte gratuit, sans verification d'adresse.
  2. Il envoie plusieurs `POST /api/household/join` simultanes avec un `code` de plusieurs centaines de Mo.
  3. Chaque corps est charge en memoire avant la validation, ce qui peut provoquer une saturation memoire et rendre le service indisponible pour tous les foyers.
  - Le scenario n'a pas ete execute. L'absence de limite est etablie par lecture.
  - La session est verifiee avant la lecture du corps : l'attaque exige un compte.
  - Aucune donnee ne fuit.
- **Remediation** : borner la taille du corps avant la lecture, de preference pour toutes les routes JSON, ou au proxy de confiance prevu avant toute mise en ligne (ADR-0003, amendement). Un changement du contrat `InviteCodeInput` releve de l'humain.
- Ce constat ne concerne pas le limiteur de debit, ecarte par ADR-0004.

## Points examines sans constat

**Isolation entre foyers (`0005_join_invite_code.sql`)**
- La seule lecture transverse est `join_household`, lignes 44 a 46. `app.invite_code_lookup` est pose puis remis a vide avant toute conclusion.
- `invite_code_definer_lookup` ne vise que `lc_definer`, et `lc_app` n'a aucun droit sur `lc.invite_code`.
- Un `app.invite_code_lookup` pose par l'appelant n'elargit rien :
  - `join_household` l'ecrase ;
  - `get_invite_code` et `regenerate_invite_code` filtrent sur `household_id = v_hh`, derive de `app.user_id`, et aucune de ces deux fonctions ne lit ce reglage.
- `app.household_id` est ecrase avant tout usage, puis remis a vide. Il prend ensuite une valeur de confiance : la ligne de code ou l'appartenance de l'appelant.
- Comme `set_config(..., true)` survit a la sortie de fonction, la remise a vide explicite est bien necessaire. Elle est presente sur chaque chemin de sortie normal. Les chemins d'erreur annulent la transaction.

**Verrou `FOR SHARE`**
- La ligne 56 relit avec `household_id = v_hh AND code = p_code`. L'`UPDATE` de `code` entre en conflit avec le verrou partage.
- Apres le `COMMIT` d'une regeneration, la ligne relue ne correspond plus, d'ou `LC003`.
- L'acces passe par la politique de contexte, et `UPDATE (code, issued_at)` fournit le privilege requis.
- Aucun ordre de verrouillage ne produit d'interblocage avec `regenerate_invite_code` ni avec le trigger de compteur.
- `tests/invite-code/concurrency.test.ts` couvre ce cas sur deux connexions `lc_app`.

**Liste SECURITY DEFINER (`rules/drizzle-postgres.md`, ERD §4.1)**
- Les trois fonctions respectent :
  - le `search_path` fixe, `pg_temp` en dernier ;
  - le proprietaire `lc_definer` ;
  - `LC001` si `app.user_id` est absent ;
  - `REVOKE ALL ... FROM PUBLIC` puis `GRANT` a `lc_app` seul.
- Le `ROW_COUNT` de l'`UPDATE` est verifie (lignes 197 a 200). Les lectures attendues levent une erreur si elles ne trouvent rien : aucune conclusion silencieuse.
- Les exceptions sont limitees a `household_member_limit`, `membership_user_key` et `invite_code_code_key`. Toute autre contrainte est relevee telle quelle.

**Fuite par message d'erreur et oracle**
- Aucun `MESSAGE` de la migration ne contient de nom, d'identifiant ou de code.
- `errorResponse` n'expose que `code`, et `fields` pour la validation : jamais la valeur recue.
- Un code inconnu et un code remplace passent tous deux par `LC003`, puis par le meme `404 INVITE_CODE_INVALID`.
- La distinction entre 404 et `409 HOUSEHOLD_FULL` est conforme au contrat. Elle exige un code en vigueur et ne revele ni nom ni identifiant.
- `LC002` et `LC003` precedent `LC004` (ERD §4.4) : un compte deja membre ou un code faux n'apprend pas qu'un foyer est plein.

**Autorisation, ordre ADR-0003**
- `join` : 401, puis 409 avant validation, y compris avec un code mal forme, puis 422, puis 404 ou 409 `HOUSEHOLD_FULL`.
- `invite-code` : 401, puis `NO_HOUSEHOLD`, puis `INSUFFICIENT_ROLE`. Ces controles sont portes par les fonctions de base, derives de la session, et precedent toute ecriture.
- `userId` vient toujours de la session. Aucun identifiant de foyer n'entre.

**Validation et injection**
- Le corps de `join` passe par le schema du contrat, et `join_household` revalide la forme.
- Le corps de `POST invite-code` n'est pas lu.
- Toutes les requetes sont parametrees. Aucun rendu HTML brut n'a ete ajoute, et `console.*` n'apparait pas dans le diff.

**Cache**
- `no-store` est present sur tous les succes et erreurs des routes `join` et `invite-code`, avec `force-dynamic`.
- `/household` lit la session a chaque requete, ce qui la rend dynamique.

**Code dans le HTML ou la charge RSC d'un membre**
- `InviteCodeSection` est un Server Component rendu seulement si `role === "owner"`.
- `RegenerateInviteCodeButton` ne recoit aucune prop et ne lit pas la reponse.
- Le code n'est donc pas serialise pour un membre.
- `tests/invite-code/screens.test.ts` le verifie sur le HTML rendu, charge inline comprise.

**CSRF**
- Les mutations reposent sur le cookie de session better-auth, `SameSite=Lax` par defaut (1.7.14, `cookies/index.mjs:35`), et `auth.ts` ne le modifie pas.
- Un `POST` depuis un site tiers n'envoie donc pas la session.

**Dependances**
- `pnpm audit --prod --audit-level=high` : aucune vulnerabilite connue.

## Limites de cet audit
- La suite n'a pas ete relancee. Les 213 tests verts sont le resultat declare par l'implementeur.
- `tests/db/invite-functions.test.ts`, `tests/invite-code/join.test.ts` et `tests/invite-code/manage.test.ts` n'ont pas ete lus en entier. Mes conclusions reposent sur la lecture du code, pas sur ces fichiers.
- L'en-tete de cache reel de `/household` n'a pas ete observe, faute de serveur lance. Aucun test ne le verifie. La conclusion est deduite du caractere dynamique de la page.
- Une recherche recursive dans `node_modules` a ete bloquee par le hook `block-dangerous`. Elle a ete relancee avec un filtre par type de fichier ; aucun fichier de secrets n'a ete lu.

Fichiers principaux :
- `C:\dev\liste-courses\packages\db\migrations\0005_join_invite_code.sql`
- `C:\dev\liste-courses\apps\web\src\app\api\household\join\route.ts`
- `C:\dev\liste-courses\apps\web\src\app\api\household\invite-code\route.ts`
- `C:\dev\liste-courses\apps\web\src\lib\household.ts`
- `C:\dev\liste-courses\apps\web\src\lib\invite-code.ts`
- `C:\dev\liste-courses\apps\web\src\app\household\page.tsx`

AUDIT: PASS
