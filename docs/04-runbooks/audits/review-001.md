# Relecture de code — tranche 001

## 2026-10-30 — rapport de code-reviewer (diff 97fcbd4..b29cb6a)

# Relecture de code, tranche 001 (comptes et creation du foyer)

**Périmètre relu :** `git diff 97fcbd4..HEAD` (18 commits, 79 fichiers), le contrat 001, le journal 001-progress, DECISIONS (D-026 à D-039), l'ERD (§1, §4.3, §9), les ADR 0003, 0005, 0007 et 0008, les contrats `auth.ts` et `household.ts`, FRICTION, CLAUDE.md et `.claude/rules`. Je n'ai lancé aucun test : je m'appuie sur les résultats que tu m'as transmis (111 tests verts, `check`, `ci-build`, `audit` et `peers` propres). Je n'ai écrit aucun fichier.

---

## Vérification D-036 : le test AC5 « privilèges du catalogue »

**Fichier :** `tests/isolation/households.test.ts:158-178`. Version d'origine : `d833e02`. Version modifiée : `4c1e882`.

**Version d'origine.** Pour chaque table t parmi `app_user`, `session`, `account`, `verification` et chaque privilège p parmi SELECT, INSERT, UPDATE, DELETE, TRUNCATE, elle appelle `has_table_privilege('lc_app', 'lc_auth.' || t, p)`. Cela fait 20 sondes, et l'attendu est qu'aucune ne vaille true (`granted` égal à `[]`).

**Version actuelle.** Elle appelle `has_table_privilege('lc_app', c.oid, p)`, avec `c` tiré de `pg_class` joint à `pg_namespace`, filtré sur `nspname = 'lc_auth'` et `relname = ANY(les 4 mêmes noms)`, croisé avec les 5 mêmes privilèges. Elle ajoute une assertion : `authProbes` (lignes au format `table (app_user|session|account|verification) …`) doit compter exactement 20 lignes.

**Comparaison point par point :**
- **Tables.** Ce sont les 4 mêmes noms, dans le même schéma. Un nom est unique par namespace dans `pg_class`, donc 20 lignes exigent que les 4 relations existent, chacune sondée avec ses 5 privilèges. L'expression régulière ne peut pas capter les lignes `table invite_code …`.
- **Privilèges.** Ce sont les 5 mêmes (SELECT, INSERT, UPDATE, DELETE, TRUNCATE). Ni REFERENCES ni TRIGGER, déjà absents de la version d'origine pour `lc_auth`.
- **Sémantique.** `has_table_privilege(role, oid, priv)` évalue les mêmes ACL que la forme par nom, PUBLIC et appartenances comprises. La seule différence est la résolution du nom, qui dans la version d'origine exigeait USAGE sur `lc_auth` et levait 42501. La version d'origine ne pouvait donc pas passer sous `lc_app` dans l'état voulu par l'ERD.
- **Attendu.** Il reste `granted` égal à `[]`, donc false pour les 20 sondes. Les sondes sur le schéma (USAGE, CREATE) et sur `invite_code` (7 privilèges) sont inchangées.
- **Risque de sonde vide.**
  - Si `pg_class` devenait illisible, la requête lèverait une erreur et le test échouerait.
  - Si une table était renommée ou absente, on aurait moins de 20 lignes et le test échouerait.
  - Un oid issu de `pg_class` existe toujours, donc aucun `NULL` ne peut se faire passer pour « non accordé ».
  - Le cas vide, que la version d'origine aurait laissé passer en silence si la requête avait pu s'exécuter, est désormais fermé par le compte exact.
- **Inchangés autour.** Le contrôle `asApp` (`current_user = lc_app`, ni superutilisateur ni BYPASSRLS) est inchangé. Les tests `SELECT … → 42501` sur les 4 tables `lc_auth` et sur `invite_code` (lignes 180-188) le sont aussi.

**Conclusion.** C'est le même ensemble de 20 privilèges, avec le même attendu false. L'assertion est même renforcée par le compte exact.

**D-036 : non affaibli.**

L'écart de discipline (le test a été modifié au lieu de s'arrêter) est déjà consigné dans FRICTION.md.

---

## Constats

### BLOQUANT
Aucun.

### A CORRIGER

**1. Les pools `pg` n'ont pas de gestionnaire d'erreur.**
- **Emplacement :** `apps/web/src/lib/db.ts:20-28`.
- **Constat :** `appPoolOf()` et `getAuthPool()` créent des `pg.Pool` sans `pool.on("error", …)`. Une recherche dans `apps` et `packages` ne trouve aucun gestionnaire de ce type.
- **Conséquence :** `pg` émet un événement `error` sur le pool quand une connexion au repos est coupée (redémarrage de Postgres, coupure réseau, `pg_terminate_backend`). Sans gestionnaire, cela devient une exception non rattrapée et le processus Next s'arrête.
- **Direction :** attacher un gestionnaire qui journalise le SQLSTATE seul, sans URL ni message pouvant porter un identifiant, sur les deux pools. Le coût est faible.

**2. Des documents contredisent l'état final de la tranche.**
- **Emplacements :**
  - `docs/03-slices/001-progress.md:235` dit que l'avis esbuild est « laissé sans overrides, à trancher par l'humain ». C'est contredit par D-038 et le commit 48bf72d.
  - `001-progress.md:227` dit « ADR-0005 hors périmètre ». C'est contredit par D-039, qui l'a amendé.
  - `001-progress.md:192` indique e9785a9 comme dernier commit, alors que b29cb6a le suit.
  - Dans `docs/02-architecture/ADR/0007-versions-socle-tranche-001.md`, le paragraphe « À réévaluer … 000-backlog.md étant hors du périmètre » est contredit par D-039 : la ligne existe.
  - Dans le même ADR, la section « Audit », premier paragraphe, dit « aucun overrides … à trancher ». Le paragraphe suivant le corrige sans marquer le premier comme dépassé.
- **Conséquence :** un auditeur qui lit le dépôt sans aide trouve deux affirmations contraires sur la même question (avis de sécurité, amendement d'ADR).
- **Direction :** marquer ces passages comme remplacés, avec renvoi à D-038 et D-039, ou les réécrire au présent.

**3. Le choix du migrateur n'a pas de ligne dans le registre.**
- **Emplacements :** `packages/db/src/migrate.ts` et `001-progress.md:224`.
- **Constat :** le choix du migrateur drizzle-orm, avec l'historique dans un schéma `drizzle` hors des schémas applicatifs, au lieu du runner maison de Signet, est consigné dans le journal et dans l'ERD §9. Il n'a pas de ligne dans `docs/DECISIONS.md`.
- **Conséquence :** `rules/documentation.md` range l'outillage et les données parmi les choix structurants, avec une ligne au registre. Ce choix engage toutes les migrations suivantes et le paramètre `TEST_RLS_EXEMPT_TABLES`.
- **Direction :** ajouter une ligne au registre, avec les options écartées (runner maison, `dotenv`, `--env-file`), qui renvoie au journal et à l'ERD §9.

**4. Des preuves de clôture manquent encore.**
- **Constat :** le périmètre prévoit `docs/00-context/journal/02-*` et `docs/04-runbooks/evidence/001.md`, qui n'existent pas encore. Or AC8 exige une « visite guidée consignée dans la fiche de preuves ».
- **Conséquence :** AC8 n'est que partiellement prouvé tant que la fiche n'est pas écrite, et la règle impose l'entrée de journal dans la PR.
- **Direction :** à faire par l'orchestrateur avant `close-slice.sh`. Je ne le bloque pas ici, puisque c'est prévu au journal.

### SUGGESTION

**5. Une contrainte de base franchie donne 500 au lieu de 422.**
- **Emplacements :** `apps/web/src/lib/household.ts:62-65`, et le hook du prénom dans `apps/web/src/lib/auth.ts:62-73`.
- **Constat :**
  - Côté foyer, seul `LC002` est traduit. Un `23514` (`household_name_check`, `[[:space:]]` dépendant de la locale de Postgres) qui passerait le `trim` de JS remonterait en 500.
  - Côté inscription, si la base refuse un prénom que le `trim` de JS a accepté, la réponse de better-auth n'est ni prévue ni testée.
- **Conséquence :** c'est improbable, car le `trim` de JS est plus large que `[[:space:]]`. Mais c'est un écart possible entre deux barrières qui ne comptent pas les espaces de la même façon.
- **Direction :** traduire `23514` en `VALIDATION_FAILED`, ou documenter que c'est un invariant.

**6. Le branchement du limiteur au démarrage n'est pas prouvé.**
- **Emplacements :** `tests/auth/rate-limit.test.ts` et `apps/web/src/lib/env.ts:44`.
- **Constat :** AC4 n'est prouvé que sur `buildRateLimitOptions`. Si l'appel dans `parseServerEnv` ou `rateLimit: {...}` dans `auth.ts` était retiré, aucun test ne le verrait.
- **Conséquence :** cela reste conforme à ADR-0003, qui dit « prouvé par le test pur ». Mais le « lève au démarrage » d'AC4 repose sur un branchement non testé.
- **Direction :** un test pur de `parseServerEnv` avec `off` et `production`.

**7. Le titre d'un test promet plus que ce qu'il vérifie.**
- **Emplacement :** `tests/isolation/households.test.ts:190`.
- **Constat :** le titre annonce « aucun droit d'écriture direct sur household et membership », mais le test ne vérifie qu'un INSERT dans `household`. Dans le bloc des écritures, `isBlocked` accepte aussi « 0 ligne ». Un futur `GRANT UPDATE … TO lc_app` serait donc masqué par la RLS sans faire échouer de test.
- **Direction :** sondes `has_table_privilege` exactes sur `household` et `membership`, avec SELECT comme seul privilège attendu, ou bien renommer le test.

**8. Les modifications de tests sont noyées dans des commits `feat`.**
- **Emplacements :** 4c1e882 (AC5, D-031) et efde3ee (codes de sign-up, D-030).
- **Conséquence :** un auditeur ne peut pas isoler les changements de tests, alors que D-036 en dépendait précisément. Les messages de commit les mentionnent, ce qui atténue le problème.
- **Direction :** pour les tranches suivantes, un commit `test(...)` séparé pour toute retouche de test.

**9. Une construction obscure n'est pas expliquée.**
- **Emplacement :** `apps/web/src/lib/auth.ts:102`.
- **Constat :** `Promise.resolve().then(() => normalizeSignUpName(...))` sert à satisfaire le type asynchrone du middleware, ou à transformer le `throw` en promesse rejetée. Aucun commentaire ne le dit.
- **Direction :** un commentaire d'une ligne sur le pourquoi.

### Ce que j'ai vérifié et trouvé conforme
- **`create_household` (0004).** Il suit l'ERD §4.3 étape par étape. La concurrence (`unique_violation` sur `membership_user_key` vers `LC002`) est traitée, et la réponse 201/409 est testée sans base mockée.
- **Code d'invitation.** `new_invite_code` est sans biais (`& 31` sur un octet).
- **Ordre 401/409/422.** `POST /api/household` suit ADR-0003.
- **Filtre de foyer.** Il est explicite (`lc.current_household_id()`) en plus de la RLS. `app.user_id` vient uniquement de la session, posé par `set_config(..., true)`.
- **Valeurs par défaut.** Elles ferment : `APP_ENV` vaut production par défaut, `off` hors test lève une erreur, un environnement invalide refuse le démarrage, et les messages ne citent que des noms de variables.
- **Code interdit.** Pas de `any`, pas de `TODO`, pas de `ts-ignore` ; ESLint les interdit.
- **Dépendances.** Toutes figurent dans ADR-0007 (licence, date, alternative), ADR-0008 couvre le lint, et l'override esbuild est documenté.
- **ERD.** §9 est à jour avec les 5 migrations et leurs écarts.
- **Commits.** Ils respectent Conventional Commits, avec des sujets de 72 caractères au plus et un commit par couche. Les tests ont été commités avant l'implémentation.
- **Traçabilité AC vers tests.** AC1 à AC11 ont chacun au moins un test qui échouerait sur une implémentation vide. Les assertions sont précises : code exact, lignes filtrées sur les données créées par le test, `asApp` qui vérifie le rôle.

---

## Bilan
- **Solide :** base (RLS forcée, rôles, fonctions DEFINER conformes à l'ERD), isolation prouvée sous `lc_app` réel, tests précis et non mockés, D-036 non affaibli.
- **Fragile :** pools `pg` sans gestionnaire d'erreur (arrêt du processus sur coupure), passages de documentation devenus contradictoires après D-038 et D-039.
- **Manquant :** ligne de registre pour le choix du migrateur, fiche de preuves avec la visite guidée AC8, entrée de journal de projet.

REVIEW: PASS
