# Backlog des tranches — Liste de courses familiale

Les tranches sont ordonnees d'abord par dependance technique, puis par risque decroissant a profondeur egale.

Chaque tranche couvre une capacite utilisateur complete du PRD : base, API (contrats `docs/02-architecture/api-contracts/`) et ecrans.

**L'isolation entre foyers n'est pas une tranche a part.** C'est le critere AC5, obligatoire dans chaque tranche qui touche une donnee du foyer. Il se teste avec **deux foyers reels** (`rules/nextjs.md`), par l'API et directement en base sous le role applicatif.

Les identifiants ne sont jamais renumerotes : une tranche inseree prend le prochain numero libre, et l'ordre d'execution est ecrit ci-dessous.

| # | Tranche | User stories | Depend de | Pourquoi cet ordre |
|---|---|---|---|---|
| 001 | Comptes et creation du foyer | US-01, US-02, US-03, US-04 | aucune | **Fondation et risque le plus eleve** : toute autre tranche suppose un utilisateur authentifie et un foyer. Elle pose seule tout le socle risque : roles Postgres, fonction de contexte et RLS (ADR-0002, ADR-0005), better-auth et son limiteur (ADR-0003), premiere fonction `SECURITY DEFINER`, versions des dependances. Si l'un de ces choix est faux, il faut le savoir avant de le recopier. Elle demarre aussi l'application (premier `package.json`) et debloque le premier push de `main` (D-007). |
| 002 | Rejoindre un foyer et gerer le code | US-05, US-11 | 001 | **Risque le plus eleve apres 001** : la seule lecture transverse aux foyers (recherche du code, `SECURITY DEFINER`), la borne de 10 membres sous concurrence, la regeneration qui invalide l'ancien code, et la regle « rien n'est revele d'un foyer » (ADR-0004). Elle produit aussi les foyers a plusieurs membres dont 003 et 004 ont besoin pour tester reellement « n'importe quel membre » et l'auteur d'un article. |
| 003 | La liste de courses | US-06, US-07, US-08, US-09 | 001, 002 | C'est le coeur du produit. Le risque est modere : CRUD sur une table, mais la borne de 200 articles doit tenir sous concurrence (ERD). Elle depend de 002 pour prouver qu'un membre agit sur l'article d'un autre (US-08.3, US-09.1). |
| 004 | Membres : consulter, retirer, quitter | US-10, US-12, US-13 | 002, 003 | Elle depend de membres reels (002) et d'articles (003) pour prouver que le prenom de l'auteur survit a son depart (US-06.2, US-12.2, US-13.2). Elle contient l'invariant « la responsable ne part jamais » (D-010) et la coupure d'acces a la requete suivante (ADR-0002). Son risque est le plus bas, car elle reprend le patron d'isolation eprouve par 001 a 003. |

## Ordre d'execution
001 -> 002 -> 003 -> 004

Quatre tranches. C'est le bas de la fourchette de 4 a 6 tranches d'un MVP courant, coherent avec un perimetre voulu minimal (D-008).

Regroupements :
- US-01 a US-04 partagent le compte et la creation du foyer. US-04 (page « sans foyer ») n'a de sens qu'avec US-03.
- US-05 et US-11 partagent le code d'invitation.
- US-06 a US-09 partagent la table des articles.
- US-10, US-12 et US-13 partagent l'appartenance.

## Livraison (D-007)
- Le cadrage (PRD, architecture, gates) est sur `docs/cadrage`.
- La tranche 001 est creee depuis `docs/cadrage` : `slice/001-comptes-foyer`.
- Une fois 001 close, avec check et tests verts :
  1. l'humain pousse `main` depuis `slice/001` ;
  2. l'humain pose la protection (`github-setup.ps1 -ProtectOnly`) ;
  3. `ship-slice.sh` ouvre la premiere PR, qui porte le cadrage et la tranche 001.

## Notes par tranche
### 001 — Comptes et creation du foyer
- **Ecrans** : inscription, connexion, page « sans foyer » (creer un foyer ; le champ « rejoindre avec un code » peut etre present mais desactive jusqu'a 002), et une page de liste vide qui montre le nom du foyer.
- **Routes** : better-auth (`auth.ts`), `GET /api/me`, `POST /api/household`.
- **Tests exiges en plus des AC** :
  - test pur du limiteur (ADR-0003) ;
  - test de catalogue de l'usine vert ;
  - test d'une fonction `SECURITY DEFINER` appelee sans contexte, qui doit echouer ;
  - test « `FORCE ROW LEVEL SECURITY` s'applique au proprietaire » (ADR-0005).
- **ADR des versions** : toutes les dependances directes, `zod` compris, choisies au registre (`rules/dependencies.md`).
- **AC5** : deux comptes dans deux foyers ; sous le role applicatif, avec `app.user_id` de A, aucune ligne du foyer B n'est visible.

### 002 — Rejoindre un foyer et gerer le code
- **Routes** : `POST /api/household/join`, `GET` et `POST /api/household/invite-code`.
- **Ecrans** : champ « rejoindre » de la page « sans foyer » ; affichage et regeneration du code pour la responsable seule.
- **Concurrence** : le 10e et le 11e membre rejoignent en parallele, et un seul des deux reussit.

### 003 — La liste de courses
- **Routes** : `items.ts` (lister, ajouter, cocher et decocher, supprimer).
- **Ecran** : la liste, avec l'auteur de chaque article.
- **Concurrence** : deux ajouts paralleles a 199 articles ; un seul reussit.

### 004 — Membres
- **Routes** : `members.ts` (lister, retirer, quitter).
- **Ecran** : la liste des membres ; « retirer » pour la responsable, « quitter » pour un membre.
- **Coupure immediate** : apres le retrait, la session encore ouverte du membre retire recoit `403 NO_HOUSEHOLD` sur la liste.

## Reevaluations techniques (hors tranches)
- **TypeScript 7 et ESLint 10** : reevaluer quand `typescript-eslint` accepte TypeScript >= 7 en pair, et que `eslint-plugin-react`, `eslint-plugin-import` et `eslint-plugin-jsx-a11y` (charges par `eslint-config-next`) acceptent ESLint 10 en pair. Socle actuel : TypeScript 6.0.3, ESLint 9.39.5 (D-026, D-032, D-037, ADR-0007, ADR-0008).
- **Adresse IP du limiteur avant toute mise en ligne** : declarer le proxy reel dans better-auth (`advanced.ipAddress.ipAddressHeaders` + `trustedProxies`, `apps/web/src/lib/auth-ip.ts`) et n'exposer le serveur que derriere lui ; sans cela, toutes les requetes partagent un compteur par chemin et un tiers peut bloquer les connexions de la famille (audit-001 MAJEUR-1, scenario 2 ; D-040, D-043). Mettre a jour le test `tests/auth/rate-limit-ip.test.ts` et ADR-0003.
- **`minimatch` (alerte Dependabot n° 2, GHSA-g3hv-75wg-m249, ecartee, D-051)** : reexaminer si `typescript-eslint` passe a `minimatch` >= 11.0.1 (ce sera alors une mise a jour normale), si un motif de glob vient de l'exterieur, ou si `optimizationLevel >= 2` est active.

## Suites de la relecture de la tranche 001 (review-001, D-041)
- **Contrainte de base franchie en 500** : traduire `23514` (CHECK de nom ou de prenom) en `422 VALIDATION_FAILED`, ou documenter l'invariant ; le `trim` de JS et `[[:space:]]` de Postgres ne comptent pas les memes espaces (review-001, suggestion 5).
- **Branchement du limiteur au demarrage** : test pur de `parseServerEnv` avec `AUTH_RATE_LIMIT=off` et `APP_ENV=production`, qui doit lever (review-001, suggestion 6).
- **Titre de test trop large** (`tests/isolation/households.test.ts`, « aucun droit d'ecriture direct ») : sondes `has_table_privilege` exactes sur `household` et `membership` (SELECT seul attendu), ou titre corrige (review-001, suggestion 7).
- **Retouches de tests dans des commits dedies** : toute modification d'un test existant part dans un commit `test(...)` separe, pour qu'un auditeur l'isole (review-001, suggestion 8).
- **Commentaire manquant** sur `Promise.resolve().then(...)` dans `apps/web/src/lib/auth.ts` (review-001, suggestion 9).

## Suites de la tranche 002 (audit-002, review-002)
- **Corps de requete non borne** : `request.json()` lit tout le corps avant la validation, sur `POST /api/household/join` et `POST /api/household`, sans limite de taille cote Next. Un compte gratuit peut saturer la memoire avec un `code` de plusieurs centaines de Mo. Borner la taille pour toutes les routes JSON, ou au proxy, avant toute mise en ligne (audit-002, MINEUR-1 ; D-011). Un changement de `InviteCodeInput` releve de l'humain.
- **`readJson` et squelette de `POST` recopies** dans `api/household/join/route.ts` : factoriser dans `lib/`, ce qui touche `api/household/route.ts`, avant que 003 et 004 multiplient la copie (review-002, suggestion 9).
- **`10` en dur dans le message `HOUSEHOLD_FULL`** (`ui/messages.ts`) : retirer le nombre ou noter le couplage avec `household_member_limit` (review-002, suggestion 12).
- **Renforts AC8** : verifier que le code de la responsable figure dans une balise `<script>` de sa propre page, et faire une requete `RSC: 1` cote membre (review-002, suggestion 13).
- **Cablage client des ecrans** : chemin, cle `code`, affichage de l'erreur et `router.refresh()` n'ont aucune preuve automatique sans robot de navigateur (D-027). A verifier a la visite guidee apres 004 (D-053, D-057).

## Hors backlog (hors perimetre du PRD)
Recuperation de mot de passe, suppression de compte et RGPD (R1), notifications, temps reel, plusieurs listes, historique, transfert du role de responsable, modification d'un article ou du prenom. Tout ajout passe par une mise a jour du PRD et une decision humaine.
