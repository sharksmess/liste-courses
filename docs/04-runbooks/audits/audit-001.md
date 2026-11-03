# Audit de securite — tranche 001

## 2026-10-30 — premier passage de security-auditor (diff 97fcbd4..b29cb6a)

## Audit de sécurité, tranche 001 (comptes et création du foyer)

**Verdict : un constat MAJEUR, donc FAIL.** Le limiteur de débit des connexions se contourne par l'en-tête `X-Forwarded-For`. L'isolation entre foyers, les fonctions à privilèges, les rôles et la validation sont corrects.

Périmètre : `git diff 97fcbd4..HEAD` sur la branche `slice/001-comptes-foyer`. Lecture seule, `pnpm test` non lancé. Pour l'audit des dépendances, je reprends le résultat que tu m'as transmis (`pnpm audit --prod` : aucune vulnérabilité connue).

---

### MAJEUR-1. Le limiteur de connexions se contourne par `X-Forwarded-For` (exigence US-02.3)
- **Emplacement :**
  - `apps/web/src/lib/auth.ts:97-100` : la configuration ne contient ni `advanced.ipAddress.ipAddressHeaders` ni `advanced.ipAddress.trustedProxies`.
  - Comportement de better-auth 1.7.14 : `node_modules/.pnpm/better-auth@1.7.14_*/node_modules/@better-auth/core/dist/utils/ip.mjs` (fonctions `getIP` et `getIPFromHeader`), et `better-auth/dist/api/rate-limiter/index.mjs:237-248`.
- **Mécanique, vérifiée dans le code installé.** Sans proxy de confiance déclaré, better-auth prend comme adresse du client la valeur de `X-Forwarded-For` si elle est unique et a la forme d'une adresse IP. Le client choisit librement cette valeur. Si l'en-tête est absent ou contient plusieurs valeurs :
  - avec `NODE_ENV=production`, toutes les requêtes tombent dans un compteur unique partagé par tout le monde (`no-trusted-ip|<chemin>`) ;
  - en développement ou en test, toutes les requêtes comptent comme venant de 127.0.0.1.
- **Scénario 1, attaque de mots de passe sans limite.**
  1. L'application tourne avec `next start` et est joignable sur le réseau.
  2. L'attaquant connaît l'adresse e-mail d'un enfant du foyer.
  3. Il envoie `POST /api/auth/sign-in/email` en boucle, avec à chaque requête un `X-Forwarded-For: 198.51.100.<n>` différent.
  4. Chaque requête tombe dans un nouveau compteur, donc la règle « 3 essais par 10 s » ne s'applique jamais.
  5. Les mots de passe peuvent n'avoir que 8 caractères : US-02.3 (« la tentative est refusée même avec le bon mot de passe ») n'est pas tenue.
- **Scénario 2, blocage de toutes les connexions.**
  1. Même déploiement. Les clients légitimes n'envoient pas d'en-tête, ou un proxy ajoute une deuxième valeur.
  2. Toutes leurs requêtes partagent le compteur unique.
  3. Un seul script qui envoie 3 connexions toutes les 10 s suffit à faire refuser (429) les connexions de tous les utilisateurs.
- **Pourquoi aucun test ne le voit.** Le test pur de l'AC4 (`tests/auth/rate-limit.test.ts`) vérifie seulement `enabled` et `customRules`, pas d'où vient l'adresse IP. Les tests HTTP tournent avec le limiteur coupé.
- **Remédiation (direction seulement) :**
  - Fixer explicitement dans la configuration comment l'adresse IP est déterminée, et le noter dans une décision du registre et dans l'ADR-0003 :
    - soit `trustedProxies` correspondant au proxy réel de la topologie retenue ;
    - soit, si le serveur est exposé sans proxy, une source que le client ne peut pas forger.
  - Une adresse impossible à résoudre ne doit pas tomber dans un compteur global.
  - Ajouter un test qui prouve qu'un `X-Forwarded-For` forgé ne crée pas un nouveau compteur.
  - Si l'humain considère que l'absence de mise en ligne (D-011) rend ce point sans objet, c'est une décision humaine à inscrire au registre avec ce scénario. Ce n'est pas à l'auditeur de la prendre.

### MINEUR-1. `/verify-password` reste actif et n'a que la limite générale
- **Emplacement :** `apps/web/src/lib/auth.ts:37-53`. `DISABLED_PATHS` ne contient pas `/verify-password`, qui n'est couvert par aucune règle spéciale du limiteur (`rate-limiter/index.mjs:305-318`).
- **Scénario :**
  1. Quelqu'un récupère un cookie de session (poste partagé de la famille, par exemple).
  2. Il appelle `/api/auth/verify-password` en boucle avec des mots de passe candidats.
  3. Seule la limite générale s'applique (100 requêtes par 10 s par défaut), et en plus contournable comme dans MAJEUR-1.
  4. Il retrouve le mot de passe en clair, alors que la session ne le révélait pas. Gain limité au-delà de la session elle-même, mais réel si le mot de passe est réutilisé ailleurs.
- **Remédiation :** l'application n'a aucun usage de cette route. L'ajouter aux routes désactivées, ou à défaut lui appliquer une règle aussi stricte que celle de la connexion.

---

### Points vérifiés sans constat
- **Isolation entre foyers :**
  - RLS activée et forcée sur les 7 tables (`0003_auth_rls.sql`, `0004_household.sql`). Aucune politique ni aucun droit pour `lc_app` sur `lc_auth` ni sur `lc.invite_code`.
  - `lc_app` n'a que SELECT sur `household` et `membership`.
  - `app.user_id` est posé en première instruction de la transaction, uniquement depuis la session better-auth (`lib/db.ts:41`, `lib/household.ts`, `lib/viewer.ts`).
  - Le foyer n'est jamais un paramètre de requête.
  - Les deux requêtes applicatives filtrent explicitement sur `lc.current_household_id()` et `lc.current_user_id()`, en plus de la RLS.
- **Fonctions SECURITY DEFINER** (`create_household`, `current_household_id`, `membership_count_trg`) :
  - `search_path` figé, propriétaire `lc_definer` (sans connexion, sans BYPASSRLS), `REVOKE` pour PUBLIC et `GRANT` au seul rôle appelant.
  - `ALTER DEFAULT PRIVILEGES` est posé sans `FOR ROLE` ni `IN SCHEMA`.
  - `create_household` lève LC001 sans contexte et écrase un `app.household_id` posé par l'appelant.
  - Le trigger de comptage vérifie `ROW_COUNT`.
  - `current_household_id` ne lève pas sans contexte, ce qui est l'exception documentée (ERD §4.2) : elle rend NULL, donc aucune ligne. Ce n'est pas un échec silencieux d'une écriture.
  - Tests présents : `tests/db/guarantees.test.ts:74-120` et `tests/_factory/db-catalog.test.ts`.
- **Rôles lc_\* :** sans SUPERUSER ni BYPASSRLS, attributs réimposés après création, contrôle qu'aucun rôle n'est membre d'un autre ni n'a de réglage propre.
- **better-auth :**
  - Le limiteur est verrouillé par `APP_ENV` : `off` n'est accepté qu'avec `APP_ENV=test`.
  - Le contrôle d'origine reste actif.
  - Les routes de profil, de réinitialisation, de vérification et des fournisseurs externes sont désactivées.
  - Le prénom est validé par le contrat et trimé avant la création. Aucune fonction d'envoi d'e-mail n'est configurée.
- **Validation :** environnement validé par Zod (`lib/env.ts`, `migrate.ts`) avec des noms de variables seulement dans les messages ; corps de `POST /api/household` validé par le contrat ; aucun objet de requête passé tel quel à la base.
- **Injection :** toutes les requêtes SQL sont paramétrées.
- **Fuites :**
  - Les corps d'erreur ne contiennent que `{error:{code,fields?}}` avec `no-store`.
  - Pas de stack trace renvoyée.
  - Les messages d'erreur du limiteur ne citent que `AUTH_RATE_LIMIT` et `APP_ENV`.
  - `ci/build.env` et `ci.yml` ne contiennent que des valeurs factices et aucune URL avec identifiants. `.env.test.example` est bloqué par le hook de l'usine, donc non relu.
  - Aucune donnée sensible passée d'un Server Component à un Client Component : seuls le prénom, le nom du foyer et le rôle de l'utilisateur lui-même sont rendus.

AUDIT: FAIL

## 2026-10-30 — second passage de security-auditor (diff 70919b4..61b46d0)

## Audit de sécurité de la tranche 001, second passage

**Verdict : PASS.** Le MAJEUR-1 du premier passage est corrigé : un `X-Forwarded-For` forgé n'ouvre plus de nouveau compteur. Le MINEUR-1 est fermé (`/verify-password` désactivé). Il reste un seul constat, MINEUR, de documentation.

Périmètre : `git diff 70919b4..HEAD`, plus le diff depuis le premier passage (`b29cb6a..HEAD`). Lecture seule, `pnpm test` non lancé. Je reprends tes résultats : 115 tests verts, `pnpm audit --prod --audit-level=high` sans vulnérabilité.

### Statut des constats du premier passage

**MAJEUR-1 (limiteur contournable par `X-Forwarded-For`) : corrigé pour le scénario 1, scénario 2 accepté par l'humain.**
- **Réglage branché :** `apps/web/src/lib/auth.ts:101-104` passe `advanced.ipAddress: IP_ADDRESS_OPTIONS`, soit `{ ipAddressHeaders: [] }` (`apps/web/src/lib/auth-ip.ts:17`).
- **Vérifié dans le code installé de better-auth 1.7.14.** Une seule résolution est présente dans `node_modules` (better-auth@1.7.14_drizzle-_898bd9…, plus @better-auth+core@1.7.14).
  - Dans `@better-auth/core/dist/utils/ip.mjs`, la fonction `getIP` prend `ipAddressHeaders || DEFAULT_IP_HEADERS`.
  - En JavaScript, `[]` compte comme vrai : la valeur par défaut `["x-forwarded-for"]` n'est donc pas utilisée.
  - La boucle sur les en-têtes ne lit rien. Aucun en-tête n'est lu, que ce soit `x-forwarded-for`, `x-real-ip`, `cf-connecting-ip` ou un autre.
  - Résultat : la fonction rend `127.0.0.1` en développement et en test, `null` en production.
- **Le limiteur appelle bien cette fonction.** Dans `better-auth/dist/api/rate-limiter/index.mjs:242-248`, il appelle `getIP(req, ctx.options)` avec les options de `betterAuth()`. Il retombe sur `no-trusted-ip|<chemin>` quand l'adresse vaut `null`, puisque `disableIpTracking` n'est pas posé.
- **Côté Next.** Next pose `X-Forwarded-For` lui-même, mais cela n'a plus d'effet : aucun en-tête n'est lu. Il n'existe pas d'autre source d'adresse côté better-auth.
- **Le test `tests/auth/rate-limit-ip.test.ts` n'est pas tautologique.**
  - `getIP` est la même fonction que celle du limiteur : `better-auth/api` la ré-exporte depuis `@better-auth/core/utils/ip`.
  - Le cas témoin (configuration par défaut, `null`) montre deux clés distinctes pour deux en-têtes forgés.
  - Avec notre configuration, six variantes donnent une clé unique, qui ne vient pas d'une adresse forgée : adresses IPv4 et IPv6, valeur multiple, `x-real-ip` et `cf-connecting-ip`, absence d'en-tête.
  - Limite : le branchement dans `auth.ts` n'est vérifié que par une expression régulière sur le source, pas par la configuration réellement chargée. Combiné avec la lecture du limiteur ci-dessus, c'est suffisant ; ce n'est pas un constat.
- **Risque résiduel accepté (scénario 2, D-043, humain).** En production, toutes les requêtes partagent le compteur de chaque chemin. Un script qui envoie 3 connexions toutes les 10 s fait refuser (429) les connexions de toute la famille. Ce risque est accepté tant qu'il n'y a pas de mise en ligne (D-011). Il est inscrit au backlog (`docs/03-slices/000-backlog.md`, « Adresse IP du limiteur avant toute mise en ligne »). Non bloquant.

**MINEUR-1 (`/verify-password` actif) : corrigé.**
- La route est dans `DISABLED_PATHS` (`apps/web/src/lib/auth.ts:55`).
- Dans `better-auth/dist/api/index.mjs:167-169`, `onRequest` renvoie 404 avant le limiteur et avant la route. La comparaison se fait sur le chemin normalisé, et la route est bien déclarée `"/verify-password"` (`routes/password.mjs:167`).

### Gestionnaire d'erreur des pools pg
`apps/web/src/lib/db.ts:20-33` n'écrit dans le journal que le libellé du pool (`app` ou `auth`) et `sqlState(error)`. `sqlState` ne lit que la propriété `code` quand c'est une chaîne (`db.ts:72-78`). Le journal ne contient ni l'URL, ni le message, ni un secret. Aucun constat.

### Régressions
Depuis le premier passage, seuls trois fichiers de code ont changé : `auth.ts`, `auth-ip.ts` et `db.ts`. Le reste n'est que de la documentation et le périmètre de la tranche. Aucune régression : l'isolation entre foyers, `withUser` et les fonctions à privilèges sont inchangés.

### Nouveau constat

**MINEUR-2. L'ADR-0003 ne dit pas encore d'où vient l'adresse IP du limiteur.**
- **Emplacement :** `docs/02-architecture/ADR/0003-*` (non modifié).
- **Scénario :**
  1. Lors d'une future mise en ligne, quelqu'un lit l'ADR d'authentification pour préparer le déploiement.
  2. Il n'y voit pas que le limiteur ne croit aucun en-tête.
  3. Il ajoute un proxy, ou réactive `ipAddressHeaders` sans `trustedProxies`, et le scénario 1 revient.
- **Ce qui atténue :**
  - D-043 est complet : le pourquoi, les options écartées et le risque restant y sont.
  - La ligne de backlog demande déjà de mettre l'ADR-0003 à jour.
  - Le test casse si `auth.ts` mentionne `trustedProxies` ou `ipAddressHeaders`.
- **Mon jugement :** le registre et le backlog suffisent à fermer le MAJEUR. L'ADR reste une dette de documentation à rattraper quand l'extension de périmètre sera accordée.
- **Remédiation :** amender l'ADR-0003 en renvoyant à D-040 et D-043 dès que l'humain étend le périmètre.

AUDIT: PASS
