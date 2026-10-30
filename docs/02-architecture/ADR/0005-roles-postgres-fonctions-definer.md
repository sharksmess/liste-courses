# ADR-0005 — Roles Postgres, fonctions SECURITY DEFINER, prenom copie et compteurs de bornes

- **Statut** : propose (accepte a l'approbation du gate architecture)
- **Date** : 2026-10-30
- **Phase** : 2 — architecture
- **Auteur** : `db-architect`
- **Specification detaillee** : [ERD](../ERD.md) §1 (roles, privileges), §2 (contexte), §4 (fonctions), §5 (bornes)
- **Amendement du 2026-10-30 (D-039)** : la variable de connexion de better-auth s'appelle `AUTH_DATABASE_URL` (nom fixe par le contrat de la tranche 001 et utilise par l'application), et non `DATABASE_URL_AUTH` comme ecrit initialement. Aucun autre changement.

## Contexte
L'ADR-0002 retient `shared-schema-rls` et derive le foyer de l'utilisateur de session. Elle renvoie
ici trois questions qu'elle ne tranche pas :
1. Quels roles Postgres, avec quels attributs, et qui possede quoi.
2. Comment les operations qui precedent l'appartenance (creer un foyer, rejoindre par code), ou qui
   exigent un controle que la RLS exprime mal (role de responsable, bornes atomiques), s'executent
   sans contourner la RLS.
3. Ou vivent les tables de better-auth, et comment l'application affiche le prenom des auteurs sans
   lire les comptes des autres.

Le PRD ajoute deux bornes (10 membres, 200 articles) qui doivent tenir sous requetes concurrentes.

**Ce qui serait faux de faire simplement :**
- Executer l'application, ou les migrations, avec le proprietaire des tables : un superutilisateur
  contourne la RLS, meme `FORCE` (lecon Signet, ADR-0007).
- Donner `BYPASSRLS` au proprietaire des fonctions `SECURITY DEFINER` : une fonction future sans
  predicat de foyer lirait tout, en silence.
- Joindre `app_user` pour afficher le prenom : le role applicatif devrait lire la table des comptes,
  adresses e-mail comprises, et voir des comptes qui ne sont plus dans le foyer.
- Verifier une borne par `SELECT count(*)` puis `INSERT` sans verrou : deux requetes simultanees
  passent toutes les deux.

## Options envisagees

### Partie 1 — Roles

#### Option A — Un role unique (application = proprietaire)
Le plus simple. Ecartee : le proprietaire contourne la RLS sans `FORCE`, et le role des migrations
est en pratique superutilisateur, qui la contourne toujours.

#### Option B — Patron Signet : proprietaire, application, authentification, definer
Quatre roles sans `BYPASSRLS`, le proprietaire des fonctions `NOLOGIN`. Signet donnait `LOGIN` a son
proprietaire de tables pour un test `FORCE` par connexion dediee.

#### Option C — Option B avec un proprietaire `NOLOGIN`
Identique, mais personne ne peut se connecter en proprietaire. Le test `FORCE` passe par `SET ROLE
lc_owner` depuis la connexion d'administration des tests : la RLS s'evalue sur le role courant, le
test reste reel. Une connexion de moins a configurer, une surface de moins.

### Partie 2 — Ecriture des donnees qui portent l'autorisation et les bornes

#### Option A — Tout en requetes directes de `lc_app` sous RLS
Politiques par role (responsable seule pour le code et le retrait) et par axe utilisateur (depart).
Les politiques sur `membership` qui verifient le role de l'appelant relisent `membership` : recursion
a contourner. Un refus donne zero ligne, sans cause distinguable. La borne reste a garantir ailleurs.

#### Option B — Liste fermee de fonctions `SECURITY DEFINER`, proprietaire `lc_definer` `NOLOGIN NOBYPASSRLS`
Chaque fonction pose son contexte de foyer depuis une valeur de confiance et reste soumise a des
politiques `TO lc_definer` bornees a ce contexte. Erreurs typees (SQLSTATE `LC001` a `LC009`).
`lc_app` n'ecrit directement que ce que la RLS suffit a borner : cocher, decocher, supprimer un
article.

#### Option C — Option B avec `BYPASSRLS` sur `lc_definer`
Plus simple a ecrire. Ecartee pour la raison deja documentee par Signet (ADR-0007, partie 2) : un
contournement total et permanent, au niveau du role.

### Partie 3 — Prenom de l'auteur et des membres

#### Option A — Jointure sur `lc_auth.app_user`
Exige `USAGE` sur `lc_auth` pour `lc_app`, des privileges par colonne (sans `email`), et une politique
« comptes membres de mon foyer **ou** auteurs d'un article de mon foyer » : deux sous-requetes, et
des comptes partis restent lisibles. Un `SELECT *` echoue, un oubli de colonne expose les adresses.

#### Option B — Copie du prenom a l'entree dans le foyer et a l'ajout
`membership.display_name` (copie a l'adhesion) et `item.author_name` (copie a l'ajout, depuis
`display_name`). `lc_app` n'a aucun acces a `lc_auth`. Denormalisation sans risque de divergence
tant que le prenom est immuable (PRD : changement de prenom hors perimetre).

### Partie 4 — Bornes concurrentes

#### Option A — Verrou sur la ligne du foyer puis `count(*)`
Juste en `READ COMMITTED`, faux en `REPEATABLE READ` (le comptage lit l'instantane du debut de
transaction, et un `SELECT ... FOR UPDATE` sur une ligne non modifiee n'echoue pas). Ne couvre que
les chemins qui pensent a verrouiller.

#### Option B — Compteurs sur `household`, tenus par trigger, bornes par `CHECK`
`member_count <= 10` et `item_count <= 200` sont des contraintes. L'`UPDATE` du compteur verrouille
le foyer ; en isolation superieure, le conflit donne `40001`, jamais un depassement. Le trigger suit
tout `INSERT` et tout `DELETE`, quel qu'en soit le chemin. Cout : deux fonctions de trigger
`SECURITY DEFINER` (sinon `lc_app` devrait pouvoir ecrire les compteurs).

## Decision

**Partie 1 : option C.** Quatre roles, aucun `SUPERUSER`, `BYPASSRLS`, `CREATEDB`, `CREATEROLE`,
`REPLICATION` :

| Role | `LOGIN` | Proprietaire de | Usage |
|---|---|---|---|
| `lc_owner` | non | schemas `lc`, `lc_auth`, tables, fonctions `SECURITY INVOKER` | aucun ; inerte sous `FORCE` |
| `lc_app` | oui | rien | application ; aucun acces a `lc_auth` |
| `lc_better_auth` | oui | rien | better-auth, borne aux quatre tables de `lc_auth` |
| `lc_definer` | non | fonctions `SECURITY DEFINER`, `lc.context_household_id()` | atteint seulement par execution d'une fonction qu'il possede |

Le role de migration (superutilisateur d'amorcage) cree tout puis cede la propriete. Creation
idempotente, `ALTER ROLE` inconditionnel qui reimpose les attributs, assertion qui leve sur toute
appartenance de role dans un sens ou dans l'autre et sur tout reglage par role. Aucun mot de passe en
migration. `ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` sans `FOR ROLE` ni
`IN SCHEMA`.

Tables de better-auth dans un **schema dedie `lc_auth`**, avec RLS forcee et une politique
`USING (true)` pour `lc_better_auth` seul. Critere : `lc_app` n'a meme pas `USAGE` sur ce schema ;
aucune requete applicative, meme fautive, ne peut lire une adresse e-mail ou une session.

**Partie 2 : option B.** Liste fermee : `current_household_id` (primitive de politique),
`create_household`, `join_household`, `get_invite_code`, `regenerate_invite_code`, `remove_member`,
`leave_household`, `add_item`, et les deux fonctions de trigger des compteurs. Signatures, contexte,
invariants et erreurs : ERD §4. La recursion de politique sur `membership` est evitee comme dans
Signet : la politique de `lc_app` appelle `current_household_id()`, qui s'execute sous `lc_definer`,
dont aucune politique n'appelle `current_household_id()` (ERD §2, invariant R1).

**Partie 3 : option B**, copie du prenom. Critere : l'isolation des comptes par absence totale
d'acces vaut mieux qu'une isolation par politique a deux sous-requetes et privileges par colonne.

**Partie 4 : option B**, compteurs par trigger et `CHECK`. Critere : la borne est une contrainte de
la base, independante du chemin d'ecriture et du niveau d'isolation.

## Consequences acceptees
- **Changer de prenom deviendrait une migration de donnees.** Le jour ou le PRD l'autorise, il faut
  decider si les articles deja ajoutes gardent l'ancien prenom (historique) ou le nouveau (mise a
  jour de `membership.display_name` et `item.author_name`), puis lever l'immuabilite de
  `membership`. La copie est un choix fait **parce que** le prenom est immuable.
- **Une fonction `SECURITY DEFINER` de plus est une revue d'architecture.** Toute nouvelle operation
  qui cree une appartenance, touche au code d'invitation ou insere un article passe par un amendement
  de cette ADR et de l'ERD §4.
- `lc_app` ne peut ni inserer un article ni ecrire une appartenance directement. Une tranche qui
  voudrait le faire « plus simplement » doit rouvrir cette ADR, pas ajouter un `GRANT`.
- Les compteurs `member_count` et `item_count` sont une denormalisation : ils doivent egaler le nombre
  de lignes. Seuls les triggers les ecrivent ; les tests verifient l'egalite apres chaque scenario.
  Un `TRUNCATE`, ou un `UPDATE` de `household_id` sur `item` ou `membership`, les ferait deriver :
  aucun role ne les a.
- Changer une borne (10, 200) est une migration qui modifie un `CHECK` : c'est voulu, la borne n'a
  qu'un emplacement.
- Une connexion de plus (`AUTH_DATABASE_URL`) pour better-auth, avec son mot de passe a poser par
  l'humain et la CI.
- Les fonctions `SECURITY DEFINER` et leurs politiques s'ecrivent a la main dans des migrations
  `drizzle-kit generate --custom`. Drizzle ne les voit pas : le test de catalogue et la revue sont
  les seules barrieres contre une omission.
- Comme dans Signet, la barriere ne protege pas d'une execution de SQL arbitraire sous `lc_app`, qui
  pourrait poser `app.user_id` a sa guise (limite de `SET LOCAL`, deja acceptee par l'ADR-0002).

## Signal de reexamen
- Le PRD autorise le changement de prenom, la suppression de compte (R1) ou plusieurs foyers par
  utilisateur.
- Une operation doit lire ou ecrire plusieurs foyers sans axe utilisateur qui la borne : ne pas
  reintroduire `BYPASSRLS`, rouvrir cette ADR.
- La version de better-auth ne permet pas de placer ses tables dans `lc_auth` ou de laisser la base
  generer ses identifiants.
- Le limiteur de connexions passe en stockage base (ERD Q-4).
