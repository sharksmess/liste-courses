# Relecture code — tranche 002 (rejoindre un foyer, gerer le code)

Branche `slice/002-rejoindre-foyer`, diff `git diff 4c1b0bb...HEAD`, 10 commits. Relecture statique du depot : je n'ai lance ni `pnpm test` ni le serveur. Les resultats de suite (17 fichiers, 213 tests, `check` propre) sont ceux transmis par l'orchestrateur, je ne les ai pas reproduits. Mes affirmations sur le comportement de Postgres et sur la vacuite des tests viennent de la lecture du code, pas de mutations executees.

## Synthese
Aucun constat BLOQUANT. Le code est conforme a l'ERD §4.4 et §4.5 et aux contrats. Chaque AC a au moins un test qui echouerait sur le defaut principal.
Les reserves portent sur la force de plusieurs preuves : des assertions qui ne peuvent pas echouer, deux branches SQL non exercees de facon deterministe, et aucune preuve du cablage client.

## BLOQUANT
Aucun.

## A CORRIGER

### 1. AC3 : la concurrence par `Promise.all` n'est pas observee, et la branche `unique_violation` -> `LC002` n'est pas prouvee de facon deterministe
- **Emplacement** : `tests/invite-code/concurrency.test.ts:52-72` et `:74-83` ; branches `packages/db/migrations/0005_join_invite_code.sql:73` et `:79`.
- **Constat** : seul le scenario regeneration/adhesion (`concurrency.test.ts:87-127`) constate l'attente, par `pg_stat_activity` via `waitUntilBlockedOnLock`. Les deux autres partent d'un `Promise.all` sans aucune preuve de chevauchement.
- **Consequence** :
  - Double adhesion : si les transactions ne se chevauchent pas, la deuxieme passe par l'etape 2 (`LC002` lu) et jamais par le bloc `EXCEPTION`. Retirer `WHEN unique_violation` donnerait un 500 seulement quand le chevauchement a lieu. C'est le seul test de cette branche : sa detection depend de l'ordonnancement.
  - 10e/11e membre : le resultat attendu est identique en execution sequentielle. Le test ne distingue donc pas la serialisation decrite en ERD §5 d'un simple passage l'un apres l'autre.
- **Pourquoi pas BLOQUANT** : le code est juste sous tous les entrelacements (lecture), et la borne est tenue par un `CHECK` exerce a chaque execution.
- **Direction** : ajouter deux scenarios deterministes avec `openAppTx` et `waitUntilBlockedOnLock`, a cout faible car les helpers existent. Premier cas : A rejoint sans commiter, B attend le verrou de `household`, COMMIT, B recoit `LC004`. Deuxieme cas : meme compte sur deux transactions, la seconde attend l'index unique puis recoit `LC002`. Garder les tests HTTP.

### 2. `regenerate_invite_code` : reprise sur collision, borne de 5 essais et `P0001` jamais executes
- **Emplacement** : `packages/db/migrations/0005_join_invite_code.sql:191-212`. `git grep` ne trouve aucune reference a `new_invite_code` dans `tests/`.
- **Constat** : aucun test ne couvre le tirage egal au code en vigueur, la collision sur `invite_code_code_key`, ni le `P0001` apres 5 essais. Ces chemins sont pourtant au contrat de donnees de la tranche (« 5 essais au plus »), et l'un d'eux est un ecart ERD §9 decide dans cette tranche.
- **Consequence** : la decision « un tirage egal compte parmi les 5 essais » n'est prouvee par rien. Une inversion de condition dans la boucle (retry ou sortie) ne casserait aucun test. Ma lecture de la boucle ne releve pas de defaut, mais c'est la seule verification.
- **Direction** : remplacer `lc.new_invite_code` par une fonction deterministe dans une transaction d'administration annulee, ou un moyen equivalent, puis prouver trois cas : reprise apres collision, reprise apres tirage egal, `P0001` au 5e echec.

### 3. Ecart ERD §9 sur `app.invite_code_lookup` : le test ne prouve pas la remise a vide
- **Emplacement** : `tests/db/invite-functions.test.ts:265-272` ; `0005_join_invite_code.sql:137` et `:216`.
- **Constat** : le test verifie `l: null` apres `get_invite_code` et `regenerate_invite_code`, mais rien n'a pose ce reglage avant l'appel. Le pre-positionnement (`:282-289`) n'existe que pour `join_household`.
- **Consequence** :
  - Retirer les lignes 137 et 216 laisse le test vert, donc l'ecart documente au §9 et le morceau d'AC9 correspondant ne sont pas prouves.
  - Le journal ecarte la remise a vide en tete de fonction parce que ces fonctions filtrent sur `household_id`. Ce filtre n'est pas prouve non plus : sans `app.invite_code_lookup` pose, supprimer `WHERE c.household_id = v_hh` dans `get_invite_code` (`SELECT ... INTO`) reste vert, car la RLS de contexte suffit a masquer les autres foyers.
- **Direction** : avant chaque appel, poser `app.invite_code_lookup` sur le code de B. Exiger le code de A en retour, B inchange apres commit, et un contexte vide.

### 4. AC5 : assertions lues apres annulation, qui ne peuvent pas echouer
- **Emplacement** : `tests/isolation/invite-code.test.ts:163-171` (toute la valeur du test) et `:100`.
- **Constat** : `asApp` annule toujours sa transaction (`tests/helpers/db.ts:87-90`). Relire `inviteCodeOf(...)` ensuite rend forcement la valeur d'origine, meme si la regeneration avait touche l'autre foyer. Dans le test « la responsable de B... », il ne reste que `not.toBe(a.code)`, vrai pour n'importe quel code neuf.
- **Consequence** : le titre annonce une preuve d'isolation que le test ne donne pas. L'AC5 reste prouve par le test commite `:103-118`, a condition que personne ne le prenne pour redondant.
- **Direction** : faire le test `:163` sur `openAppTx` avec commit, ou lire la table dans la transaction. Retirer `:100` ou le deplacer.

### 5. Assertions negatives dans le mauvais format
- **Emplacement** : `tests/invite-code/manage.test.ts:44` ; `tests/isolation/invite-code.test.ts:43`, `:69-70` (ainsi que `:32` et `:36`, redondantes avec `toEqual`).
- **Constat** : l'API ecrit le code au format `XXXXX-XXXXX`, or ces lignes cherchent la forme stockee sans tiret (`h.code`, `B.code`). Une fuite par le chemin normal ne contiendrait jamais cette chaine. `ErrorBody` n'est pas strict (`_contract.ts:42`) et n'exclut donc pas une cle ajoutee.
- **Consequence** : la verification « le refus revele le code » est vacante sur la forme reellement emise.
- **Direction** : tester les deux formes comme `screens.test.ts:120-122`, ou comparer le corps exact. En `:43`, comparer aussi au nouveau code de A.

### 6. « `LC003` precede `LC004` » n'est exerce qu'avec des codes etrangers au foyer plein
- **Emplacement** : `tests/db/invite-functions.test.ts:172-177` (le commentaire dit « Code remplace ou inconnu ») ; `tests/invite-code/concurrency.test.ts:42-48`.
- **Constat** : seuls `ZZZZZZZZZZ` et `ZZZZZZZZZU` sont essayes, sans lien avec `FULL`. Aucun ne peut atteindre `LC004`, donc l'assertion ne depend pas d'un ordre. Le cas remplace annonce par le commentaire n'est pas teste.
- **Consequence** : la partie `LC002` est bien prouvee, la partie `LC003` non. Le titre de F2, « sans reveler qu'il est plein », est dans le meme cas.
- **Direction** : regenerer le code d'un foyer plein, puis exiger `LC003` et 404 avec l'ancien code.

### 7. AC7 : interpretation du `test-writer` acceptable, mais le titre promet plus que l'assertion
- **Emplacement** : `tests/invite-code/screens.test.ts:72-79`.
- **Constat** : le titre dit « ne cite aucun foyer », et rien ne le verifie. « Ce foyer n'existe pas » passerait. Le message implemente est correct (`ui/messages.ts:10`, sans le mot « foyer ») et statique, donc il ne peut citer aucun foyer particulier.
- **Direction** : ajouter `expect(plain(invalid)).not.toContain("foyer")`, une ligne.

### 8. Le cablage client n'a aucune preuve avant la visite post-004, et cette limite n'est pas ecrite
- **Emplacement** : `apps/web/src/ui/join-household-form.tsx:19-27`, `apps/web/src/ui/regenerate-invite-code-button.tsx:21-24`, `tests/invite-code/screens.test.ts:4`.
- **Constat** : les tests prouvent le HTML initial et la table `messageFor`. Rien n'exerce le chemin `/api/household/join`, la cle `code`, le choix du message pour un 422 (decision locale du journal), l'affichage de l'erreur, ni `router.refresh()`. AC8 passe par un POST direct de l'API. D-053 prevoit une preuve de chaque critere d'ecran, « refus » compris, sur la page rendue ; c'est impossible sans robot (D-027).
- **Consequence** : une faute dans le chemin ou la cle garderait la suite verte. Elle apparaitrait seulement apres la fusion de 004. L'humain decide sur preuves et doit savoir ce que la fiche ne couvre pas.
- **Direction** : extraire le choix du message dans une fonction pure testee. Declarer explicitement ce residuel dans la fiche de preuves, comme a verifier a la visite.

## SUGGESTION

### 9. `readJson` recopie
- **Emplacement** : `apps/web/src/app/api/household/join/route.ts:15-21`, `:23-33`.
- La justification est exacte : `app/api/household/route.ts` est hors de `.gates/scope-002.txt`. La dette reelle depasse toutefois les « 7 lignes » du journal, car le squelette de `POST` (lignes 23 a 33) est aussi quasi identique. Aucune entree de `000-backlog.md` ne la porte. Decision acceptable ; ajouter une ligne de backlog avant que 003 et 004 multiplient la copie.

### 10. Commentaire faux dans `openAppTx`
- **Emplacement** : `tests/helpers/invite.ts:117-131`.
- Le commentaire annonce « ni superutilisateur ni BYPASSRLS », mais le code ne teste que `current_user` et `is_superuser`, alors que `asApp` teste aussi `rolbypassrls` (`tests/helpers/db.ts:77-83`). Le test AC5 commite et l'AC3 s'appuient dessus. Reprendre la meme garde.

### 11. Code mort de test
- **Emplacement** : `tests/helpers/invite.ts:47`.
- `UNKNOWN_CODE_STORED` n'est utilise nulle part, le litteral est repete dans `tests/db/invite-functions.test.ts`.

### 12. `10` en dur dans `HOUSEHOLD_FULL`
- **Emplacement** : `apps/web/src/ui/messages.ts:11`.
- Acceptable : US-05.3 demande un message explicite, la borne est une regle du PRD, et elle ne s'expose qu'a qui detient un code valide. Si la borne change, le message sera faux sans qu'aucun test ne le signale, l'assertion portant sur « complet » seul. Retirer le nombre, ou noter le couplage.

### 13. AC8 : charge RSC
- **Emplacement** : `tests/invite-code/screens.test.ts:110-125`.
- Le test est solide. `getPage` garde le HTML brut (`tests/helpers/household.ts`, `html` non filtre), scripts de charge inline compris, et le controle positif confirme qu'on lit la bonne page. Je n'ai pas constate sur une reponse reelle que la charge inline est presente ; c'est le comportement attendu du rendu complet.
- Deux renforts bon marche : verifier que le code de la responsable apparait bien dans une balise `<script>` de sa propre page (preuve que le filet voit la charge), et faire une requete `RSC: 1` cote membre. Aucun defaut attendu, car `page.tsx:36` ne rend pas la section pour un membre.

### 14. Details de maintenance
- `apps/web/src/lib/invite-code.ts:24` : le parametre `read` couvre aussi la regeneration, qui ecrit. `run` serait plus juste.
- `apps/web/src/lib/household.ts:2` : l'en-tete cite encore US-03 et US-04 seuls.
- ERD §9 : le titre dit toujours « (tranche 001) ».

### 15. Rituel du journal
- **Emplacement** : `docs/03-slices/002-progress.md`.
- `.claude/rules/git.md` demande une mise a jour apres chaque commit. L'historique montre seulement l'ouverture (7f20333) et un rattrapage groupe (5711425) pour les quatre couches. Le resultat final est complet ; l'ecart ne vaut que pour une reprise apres interruption.

## Points demandes, juges sans constat
- **AC3 regeneration** : concurrence reelle sur deux connexions `lc_app` commitees, attente observee, refus `LC003` code exact. Sans le `FOR SHARE`, `waitUntilBlockedOnLock` expire. Sans `AND code = p_code`, l'adhesion reussit et le test echoue. Solide. Seul renfort possible : verifier `pg_blocking_pids`.
- **AC5 sous `lc_app`** : `asApp` et `openAppTx` verifient le role. Les refus exigent exactement `42501` ligne a ligne, `app.invite_code_lookup` pose sur le code de B. Le test commite `:103-118` est la vraie preuve de « ne touche que A ». Reserves : points 4 et 5.
- **Retouche de 001 (4482ab7)** : justifiee, non affaiblissante. Commit dedie, 8 lignes retirees seulement, un seul test de 001 touche, exigence contraire a AC7 et remplacee par trois tests plus forts dans `tests/invite-code/screens.test.ts:31-57`. Le contrat l'avait annoncee.
- **Administration remplacant le code d'un foyer de test** (`tests/invite-code/join.test.ts:59-65`) : legitime. Un code tire au hasard peut ne contenir ni 0 ni 1, et le prefixe `0101` garantit que les substitutions sont exercees. Seul l'arrangement est force ; le chemin teste reste l'API reelle.
- **422 affiche avec le message de `INVITE_CODE_INVALID`** : bon choix, le message generique parlerait de longueur. Le statut API reste 422 (AC2). Absence de preuve : point 8.
- **`throw` dans `/household`** : verifie comme invariant. Le role vient d'etre lu `owner` et `membership_immutable` et `membership_protect_owner` figent la ligne. Les routes gardent leurs valeurs typees.
- **Pas de confirmation sur la regeneration** : techniquement sans danger, car l'ancien code est remplace et le nouveau s'affiche aussitot. C'est un choix produit, voir la cloture ci-dessous.
- **Ecarts ERD §9** : les deux sont ecrits et raisonnables, la boucle reste bornee. Force de preuve : points 2 et 3.
- **Conformite SQL** : etapes 1 a 9 de §4.4 et prefixe de §4.5 dans l'ordre, `search_path`, proprietaire, `REVOKE`/`GRANT`, `ROW_COUNT`, traduction des contraintes par `GET STACKED DIAGNOSTICS`, `RAISE` sur le reste.
- **Interdits** : `git grep` ne trouve ni `any`, ni `TODO`, ni suppression de verification dans les fichiers de la tranche. Erreurs metier en `Result`, aucune dependance ajoutee, contrats `api-contracts/` inchanges, mise en forme du code en un seul endroit, 0005 ajoutee sans toucher 0000 a 0004, ERD dans le commit de la migration.
- **Historique** : tests avant implementation, un commit par couche, Conventional Commits, trailer `Slice: 002`, pourquoi explique sur 4482ab7 et 2699610.

## A traiter a la cloture (hors constats, registre non encore ecrit)
D-052 impose que les decisions hors contrat aillent au registre marquees « a valider par l'humain ». Sont concernees au minimum :
- l'absence de confirmation sur la regeneration ;
- le message affiche pour un 422 ;
- le tirage egal compte parmi les 5 essais.

## Bilan
Solide : fonctions SQL conformes a l'ERD, scenario regeneration/adhesion deterministe, AC1, AC2, AC4, AC6 et AC8 bien prouves, documentation dans la PR.
Fragile : plusieurs assertions ne peuvent pas echouer (lecture apres annulation, mauvais format, code sans lien avec le foyer plein), et la concurrence 10e/11e et double adhesion n'est pas observee.
Manquant : tests de la boucle de regeneration et de la remise a vide de `app.invite_code_lookup`, preuve du cablage client, mention de ce residuel dans la fiche de preuves.

REVIEW: PASS
