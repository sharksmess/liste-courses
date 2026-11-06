# 003 — journal d'avancement

Tenu par l'implementeur apres **chaque commit**. C'est ce fichier, pas la conversation, qui permet de reprendre apres une interruption.

## Etat
- Statut : ouverte, arretee sur un test AC8 a arbitrer (voir Blocages)
- Branche : slice/003-liste-courses
- Dernier commit : 8d33086 feat(items): routes de la liste et lecture commune du corps
- Prochaine etape : arbitrage du test AC8 « un ajout attend une suppression non commitee », puis UI (`ui/requests.ts`, messages, formulaire, liste, page)

## Couches
- [x] Migration (0b24a59 : 0006, 0007, ERD §9 ; 92 tests sur 94 verts dans tests/db et tests/_factory, les 2 rouges sont les defauts de tests ci-dessous)
- [x] Acces donnees (ae39972, `lib/items.ts`, typecheck vert ; prouve par les tests d'API)
- [x] Logique metier (ae39972)
- [x] API (8d33086 ; 132 tests sur 133 sur add, list, permissions, toggle-delete, limit-concurrency, household/create, invite-code/join ; `tests/isolation/items.test.ts` attend la page)
- [ ] UI
- [ ] Suite complete verte + `pnpm run check`

## Blocages
<!-- cause, essais, options. Vide = aucun. -->
- **`tests/items/limit-concurrency.test.ts:179`, AC8 « un ajout attend une suppression non commitee de la meme ligne de compteur, puis reussit apres son COMMIT »** : en echec, a trancher avant la suite (`.logs/003-impl-api-1.log`). Test non modifie.
  - Constat : a 200 articles commites, avec un `DELETE` non commite dans A, `add_item` dans B ne bloque pas : il rend `LC008` en 20 ms (`.logs/003-impl-diagnostic-2-resultat.log`, test jetable supprime). `waitUntilBlockedOnLock` expire donc.
  - Cause : en `READ COMMITTED`, Postgres evalue le `CHECK` sur la nouvelle version calculee depuis la ligne de son instantane, **avant** de tenter `heap_update` et d'attendre le verrou. 200 + 1 viole `household_item_limit` tout de suite. L'attente n'existe que si le pre-controle passe, comme a 199 (le test voisin, a 199, est vert).
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
- **Contexte non remis a vide avant `LC008`** : `add_item` releve l'erreur sans reset, parce qu'une exception annule de toute facon le `set_config` local fait dans le bloc ; le retour au point de sauvegarde ou le ROLLBACK restaure le reglage (teste en AC10).
