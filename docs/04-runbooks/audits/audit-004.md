# Audit de securite, tranche 004 (membres)

Perimetre : `git diff main...HEAD` sur `slice/004-membres` (HEAD bae7039). Audit statique du code, de la migration, des tests et des politiques 0004 a 0008 ; aucun test relance. Resultats relus dans les journaux : 476 tests verts (`.logs/004-impl-5.log`), `pnpm run check` propre (`.logs/004-impl-check.log`). `pnpm audit --prod --audit-level=high` : aucune vulnerabilite connue.

## Constats

**CRITIQUE** : aucun.

**MAJEUR** : aucun.

**MINEUR** : aucun.

## Point a reporter a la cloture (pas une faille)

La branche `addItem` « article enregistre puis illisible » (`apps/web/src/lib/items.ts:115`, D-066) n'a pas de test deterministe. `tests/members/service.test.ts:12-15` le renvoie a la fiche de preuves, et l'AC10 exige que celle-ci le declare. La fiche n'existe pas encore : a verifier a la cloture. Mon constat de lecture sur le comportement est au dernier point de la section suivante.

## Points examines sans constat

- **Coupure immediate.**
  - Le foyer et le role sont relus en base a chaque requete par `current_household_id()` (ADR-0003, B2).
  - Aucun `cookieCache` ni `secondaryStorage` dans `apps/web/src` : `getSession` lit la base.
  - Une requete commencee apres le retrait recoit `LC009` ou `NO_HOUSEHOLD`.
  - La seule ecriture possible est celle d'une requete deja en vol, entre le `SELECT` et l'`INSERT` de `add_item` : admise par Q-8 et D-066. Une requete en vol sur `PATCH` ou `DELETE` recoit 404, sans ecriture (D-061).
  - Les routes et les reponses d'erreur portent `Cache-Control: no-store`, et `/household` est rendue dynamiquement.
- **Un membre ne retire personne.** `lc_app` n'a aucune ecriture sur `lc.membership`, et `remove_member` leve `LC005` avant toute lecture de la cible (`0008_member_functions.sql:38`). Le `:memberId` mal forme suit le meme ordre (`members.ts:84-88`).
- **La responsable ne part jamais.** Trois barrieres : `LC007` dans les deux fonctions, le filtre `role = 'member'` sur les `DELETE`, et le trigger `membership_protect_owner`.
- **Isolation entre foyers.**
  - Le foyer vient de l'appelant, jamais de la requete ; un `app.household_id` force est ecrase.
  - Le `DELETE` filtre sur `household_id = v_hh`.
  - Inexistant, deja retire, autre foyer, responsable de B ou mal forme donnent le meme statut et le meme corps ; `tests/isolation/members.test.ts:53-68` compare le texte exact, avec deux foyers reels.
  - `listMembers` filtre explicitement, en plus de la RLS.
- **`remove_member`, `leave_household`.**
  - Conformes a l'ERD §4.1, §4.6 et §4.7 : `search_path` fixe avec `pg_temp` en dernier, proprietaire `lc_definer`, `LC001` en premiere instruction, contexte ecrase puis remis a vide.
  - `ROW_COUNT` verifie, `REVOKE` de PUBLIC, `EXECUTE` a `lc_app` seul.
  - Mode d'echec « aucune ligne vue » couvert : les lectures passent par `membership_definer_self_read`, le `DELETE` par le contexte pose juste avant.
- **Origine du contexte.** `app.user_id` vient de la session seule (`withUser`), et les routes ne recoivent aucun foyer ni role.
- **Fuites.**
  - `listMembers` lit `id`, `display_name`, `role` ; `lc_app` n'a pas acces a `lc_auth`.
  - Les props clientes sont `memberId`, `name`, `role`, `canRemove`, avec `import type` seul depuis le service.
  - `tests/members/screens.test.ts:123` cherche adresses et identifiants de compte dans le HTML.
  - Corps d'erreur sans message technique ; prenoms echappes par React.
- **Retour apres un retrait.** Une nouvelle ligne `membership` est creee avec un nouvel identifiant ; un ancien `memberId` donne 404. Le retour avec le code en vigueur est voulu (US-12.6) ; seule la responsable voit ce code.
- **Validation.** `:memberId` passe par `Uuid` ; `POST leave` ne lit pas le corps ; requetes parametrees. Sorties passees au schema du contrat.
- **Hypothese de 500 par prenom en emoji sur `output.parse` : ecartee.** Sonde refaite : avec le zod du depot, 30 emoji (60 unites UTF-16) passent `max(30)`.
- **CSRF.** Cookie better-auth `SameSite=Lax`, non modifie (constat d'audit-002 et d'audit-003, non reverifie ici dans la bibliotheque) ; `DELETE` et `POST` intersites n'emportent pas le cookie.
- **Webhooks, rate limiting, secrets.** Aucun webhook. Les nouvelles routes ne sont ni couteuses ni d'authentification. Aucun secret dans le diff.
- **`addItem` apres relecture vide (D-066).** `NO_HOUSEHOLD` ne revele rien, l'article reste conforme a Q-8, et `add_item` rend toujours un identifiant ou leve. La fenetre n'existe que si le retrait commite avant l'`INSERT`, car ensuite il attend le verrou du foyer. Une nouvelle requete ne peut pas y entrer.

AUDIT: PASS
