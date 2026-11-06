# 003 — journal d'avancement

Tenu par l'implementeur apres **chaque commit**. C'est ce fichier, pas la conversation, qui permet de reprendre apres une interruption.

## Etat
- Statut : ouverte
- Branche : slice/003-liste-courses
- Dernier commit de code : 0bc8bb6 refactor(items): decision apres mutation et corps types sur le contrat (suivi du commit de journal `docs(slice-003)`, voir `git log`)
- Prochaine etape : orchestrateur : registre, cloture (`close-slice.sh`)

## Couches
- [x] Migration (0b24a59 : 0006, 0007, ERD §9 ; 92 tests sur 94 verts dans tests/db et tests/_factory, les 2 rouges sont les defauts de tests ci-dessous)
- [x] Acces donnees (ae39972, `lib/items.ts`, typecheck vert ; prouve par les tests d'API)
- [x] Logique metier (ae39972)
- [x] API (8d33086 ; 132 tests sur 133 sur add, list, permissions, toggle-delete, limit-concurrency, household/create, invite-code/join ; `tests/isolation/items.test.ts` attend la page)
- [x] UI (f65862a, suites de relecture 0bc8bb6)
- [x] Suite complete verte + `pnpm run check` (apres 0bc8bb6 : 391 tests sur 391, 77,01 s, check propre)

## Blocages
<!-- cause, essais, options. Vide = aucun. -->
- Resolu : option 1 retenue par l'orchestrateur, test aligne par `test-writer` (29302b2), ERD §5 corrige. Voir Decisions.
- **`tests/items/limit-concurrency.test.ts:179`, AC8 « un ajout attend une suppression non commitee de la meme ligne de compteur, puis reussit apres son COMMIT »** : en echec, a trancher avant la suite (`.logs/003-impl-api-1.log`). Test non modifie.
  - Constat : a 200 articles commites, avec un `DELETE` non commite dans A, `add_item` dans B ne bloque pas : il rend `LC008` en 20 ms (mesure d'un test jetable, supprime). `waitUntilBlockedOnLock` expire donc. La preuve durable est le scenario deterministe de `limit-concurrency.test.ts`, « une suppression non commitee a 200 ne libere rien » ; les fichiers `.logs/` cites dans cette section ne sont pas versionnes.
  - Cause : en `READ COMMITTED`, Postgres evalue le `CHECK` sur la nouvelle version calculee depuis la ligne de son instantane, **avant** de tenter `heap_update` et d'attendre le verrou. 200 + 1 viole `household_item_limit` tout de suite. L'attente n'existe que si le pre-controle passe, comme a 199 : le scenario deterministe de `limit-concurrency.test.ts`, « sous la borne (199), une suppression non commitee bloque l'ajout concurrent », l'observe.
  - Consequence : la phrase de l'ERD §5 « les deux passent par le verrou du foyer » est fausse a la borne. Aucun depassement : la borne tient, le refus est seulement pessimiste (409 alors qu'une suppression est en cours). AC8 l'admet : « 199 ou 200 selon l'ordre ».
  - Option 1, corriger le test : admettre le refus immediat, ou le remplacer par ce qui est garanti. Aucun changement de code ; corriger la phrase de l'ERD §5.
  - Option 2, changer la base : verrou explicite du foyer dans `add_item` avant l'insertion (`FOR NO KEY UPDATE`), par une nouvelle migration `CREATE OR REPLACE`. L'ajout attendrait et reussirait. Ecart a l'ERD §4.8, a decider ; non essaye.
- Resolu : les deux tests ci-dessous ont ete corriges par `test-writer` (6d536cb).
- **Deux tests de `tests/db/item-functions.test.ts` ne peuvent pas passer, quelle que soit l'implementation** (fichier de sortie `.logs/003-impl-db-1.log`, diagnostic `.logs/003-impl-diagnostic.log`, avec un test jetable, supprime, jamais committe). Aucun test modifie.
  - Ligne 209 (index `item_household_order_idx`) : la requete rend `array_agg(a.attname)`, de type `name[]`, que le pilote `pg` ne decode pas : il rend la chaine `{household_id,created_at,id}`, comparee a un tableau. L'index est correct : le meme agregat en `::text[]` rend `["household_id","created_at","id"]`. Correction proposee : `array_agg(a.attname::text ORDER BY k.ord)`.
  - Ligne 328 (restauration de `app.household_id`) : le sentinelle `valeur-precedente-inventee` n'est pas un UUID. `lc.current_household_id()`, appelee par `item_member_delete`, lit `lc.membership` sous `lc_definer`, dont la politique `membership_definer_context` (0004) evalue `lc.context_household_id()`, qui caste le reglage en `uuid` : `22P02` avant que le trigger ne s'execute. Prouve sans `lc.item` : `SELECT lc.current_household_id()` seul leve `22P02` avec cette valeur. Avec un sentinelle UUID (`crypto.randomUUID()`), le trigger restaure bien la valeur et le test passe. Correction proposee : sentinelle UUID.
  - Option ecartee : rendre `lc.context_household_id()` tolerante par une nouvelle migration. Elle changerait une primitive de securite de 001, hors contrat, pour satisfaire un test.

## Decisions
<!-- Toute decision prise sans l'humain, avec sa raison. Reprise dans la PR. -->
- Passage autonome (D-052) ; ecrans prouves sans visite guidee par tranche (D-053, D-059). Consigne : `docs/04-runbooks/consigne-run-queue-002-004.md`.
- **Factorisation de `readJson` reprise dans 003**, alors que le backlog la laissait ouverte : review-002 (suggestion 9) demandait de la faire avant que 003 et 004 multiplient la copie. Perimetre elargi aux deux seuls `route.ts` concernes. Ecartee : recopier une troisieme et une quatrieme fois.
- **US-06.2 preparee ici et prouvee en 004** : aucun depart n'existe avant 004 (backlog).
- **Migration en deux fichiers** : `0006_item.sql` generee, `0007_item_rls_functions.sql` `--custom`, comme demande par la tranche. Le trigger se nomme `item_count`, sur le modele de `membership_count` (l'ERD ne le nommait pas) ; ecart note a l'ERD §9.
- **Schema dans un fichier `schema/item.ts`** plutot que dans `household.ts` : la table a sa propre section d'ERD. Ecarte : allonger `household.ts`.
- **`requireHousehold` dans `lib/items.ts`**, plutot que `findHousehold`, pour la verification preliminaire de `POST` et d'un `:itemId` mal forme : elle lit la seule primitive, sans jointure ni role. Ecarte : `findHousehold`, qui lit nom et role inutilement.
- **Ajout a la borne pendant une suppression non commitee : `LC008` immediat, ERD §5 corrige** (arbitrage de l'orchestrateur, option 1). Postgres evalue le `CHECK` sur la version de son instantane avant d'attendre le verrou ; la borne tient, la place n'est liberee qu'au `COMMIT` (US-09.3), et AC8 admet « 199 ou 200 selon l'ordre ». Sous la borne, l'attente sur le verrou du foyer reste vraie. Ecarte : un verrou explicite du foyer dans `add_item` (`FOR NO KEY UPDATE`) par une nouvelle migration, ecart a l'ERD §4.8 pour un cas que le contrat accepte.
- **Corps non objet sur `PATCH` : `fields: ["(corps)"]`**, comme sur `POST`, si l'article existe dans le foyer. Le corps est lu par `input.pick({ purchased: true })`, si bien que `itemId` ne peut pas venir du corps. Ecarte : fusionner le corps et le parametre de route avant validation, qui aurait cite `purchased` pour un corps illisible et melange les deux sources.
- **Liste entiere en composant client `ui/item-list.tsx`**, nourri par la page : le message de `ITEM_NOT_FOUND` doit survivre au rechargement qui retire la ligne. `Item` n'expose ni foyer ni identifiant d'auteur, et ces donnees sont deja affichees a ce meme membre : rien de sensible dans les props (`rules/nextjs.md`). Ecarte : des boutons client par ligne, dont le message disparaitrait avec la ligne.
- **Pas de `maxLength` sur les champs d'article** : le navigateur compte des unites UTF-16, et refuserait 100 emoji que le contrat accepte. La borne reste au serveur, en points de code.
- **Foyer perdu entre `currentViewer` et `listItems` sur la page** : redirection vers `/no-household`, comme sans foyer, pour la coupure de 004. Ecarte : une erreur de page, ce cas etant attendu.
- **Contexte non remis a vide avant `LC008`** : `add_item` releve l'erreur sans reset, parce qu'une exception annule de toute facon le `set_config` pose juste avant le bloc : le retour au point de sauvegarde ou le ROLLBACK retablit le reglage. Nuance de l'ERD §4.1 point 3, ecrite a l'ERD §9. Le test AC10 `item-functions.test.ts:312` ne pose aucune valeur avant l'appel : il montre l'absence de fuite, pas une restauration.
- **`itemMutationEffect` dans `ui/messages.ts`** (review-003, point 4) : la decision apres mutation devient une fonction pure testee, comme `joinErrorMessage` en 002. Les corps envoyes sont types sur `z.input` des contrats, en imports de types seuls : une faute de cle sur `quantity` ou `purchased` a bien echoue a `tsc`, essai fait puis annule. Ecarte : garder `payload: unknown`, qui laissait passer la faute jusqu'a la visite.
- **`throw` apres le `COMMIT` de `addItem` laisse en l'etat** (review-003, point 3) : inatteignable tant qu'aucun depart n'existe ; suite au backlog de 004, sur consigne de l'orchestrateur.
