# ADR-0002 — Isolation multi-tenant : schema partage et RLS, foyer derive de la session

- **Statut** : propose (accepte a l'approbation du gate architecture)
- **Date** : 2026-10-30
- **Phase** : 2 — architecture

## Contexte
Le PRD (D-008) fait du **foyer** l'unite de compte. Les articles, les membres et le code d'invitation appartiennent tous a un foyer. Un foyer ne voit jamais la liste ni les membres d'un autre (PRD, « Isolation »).

Trois particularites du PRD pesent sur le choix :
- Un utilisateur appartient a **au plus un** foyer. Il peut aussi n'en avoir aucun, et changer de foyer apres un depart ou un retrait.
- Il y a une seule operation transverse aux foyers : rejoindre un foyer par son code. L'appelant n'en est pas encore membre.
- La charge est negligeable : quelques foyers de 10 personnes et 200 articles au plus.

**Ce qui serait faux de faire simplement :**
- Filtrer par foyer uniquement dans le code. CLAUDE.md impose un filtre explicite, mais un oubli ouvre alors tout.
- Recopier tel quel le patron de Signet, qui pose le contexte depuis un identifiant d'organisation venu de l'URL. Signet a du le durcir apres coup : audit-001 MINEUR-1, puis son ADR-0011.

## Options envisagees
### Option A — `single-user`
Pas d'organisation, des donnees par utilisateur. Inapplicable : la liste est partagee par plusieurs comptes.

### Option B — `shared-schema-rls`
Une base et une colonne `household_id` sur chaque table de donnees du foyer. Des politiques RLS Postgres s'appliquent sous un role applicatif non privilegie.

C'est le defaut du profil (`references/stacks/nextjs-drizzle-postgres.md`). La regle `.claude/rules/drizzle-postgres.md` encadre deja son usage.

Cout : les politiques sont ecrites a la main dans des migrations SQL. Les fonctions `SECURITY DEFINER` doivent suivre la liste obligatoire de la regle.

### Option C — `schema-per-tenant`
Un schema Postgres par foyer. Les migrations sont multipliees par le nombre de foyers, et creer un foyer devient une operation DDL au moment de l'inscription. Le cout est disproportionne pour 200 articles, et rien dans le PRD ne demande une isolation physique.

### Option D — `db-per-tenant`
Une base par foyer : cout operationnel maximal. Aucun grand compte, aucune exigence de residence des donnees.

## Decision
**Option B, `shared-schema-rls`**, avec une adaptation permise par le PRD : **le foyer n'est jamais un parametre de la requete**.

1. Chaque table de donnees du foyer (membres, articles, code d'invitation) porte `household_id` directement, sans jointure transitive.
2. L'application ne recoit jamais un identifiant de foyer du client. Les routes sont de la forme `/api/household/...`, sans `:householdId`.
   - Le serveur pose seulement `app.user_id`, par `SET LOCAL` en debut de transaction, a partir de la session authentifiee.
   - Le foyer de cet utilisateur est lu en base, par sa ligne d'appartenance.
3. Les politiques RLS comparent `household_id` au foyer de l'utilisateur de session, renvoye par une fonction de contexte.
   - Il n'existe pas de contexte « foyer » que l'appelant pourrait choisir. Le defaut corrige par l'ADR-0011 de Signet n'a donc pas d'equivalent ici.
   - Sans `app.user_id`, ou sans appartenance, la fonction renvoie NULL et aucune ligne n'est visible : l'isolation echoue fermee.
4. Les operations qui precedent l'appartenance passent par des fonctions `SECURITY DEFINER` qui suivent la liste obligatoire de la regle : creer un foyer, et rejoindre par code (recherche du code parmi tous les foyers).
5. Les requetes applicatives filtrent aussi explicitement sur le foyer (regle de CLAUDE.md). La RLS est la seconde barriere, pas la seule.
6. L'application n'interroge jamais la base avec le role proprietaire des tables. Les roles Postgres sont fixes par l'ADR-0005 (`db-architect`).

Critere qui a tranche : l'option B est la seule qui isole des donnees partagees par plusieurs comptes a un cout proportionne. L'adaptation 2 supprime la surface d'attaque principale du patron classique, au prix d'une contrainte qui n'en est pas une ici (un seul foyer par utilisateur, D-008).

`stack.json` : `tenancy` = `shared-schema-rls`.

## Consequences acceptees
- **Plusieurs foyers par utilisateur deviendraient une refonte**, pas une evolution. Il faudrait un identifiant de foyer dans les routes, un contexte verifie par appartenance (patron de l'ADR-0011 de Signet), et une reecriture des politiques et des contrats. C'est explicitement hors perimetre (PRD).
- Chaque requete paie une recherche d'appartenance par la fonction de contexte. L'unicite de `user_id` dans la table d'appartenance fournit l'index. Le cout est negligeable a cette charge.
- Retirer ou faire partir un membre coupe son acces des sa requete suivante, sans invalider sa session : son foyer n'est plus lu nulle part. C'est le comportement attendu par US-12.1 et US-13.1.
- Toute nouvelle table de donnees du foyer exige sa politique dans une migration SQL ecrite a la main (Drizzle ne les genere pas). Une table sans politique est ouverte : le relecteur et le test de catalogue doivent le voir.
- Comme dans Signet, la barriere protege d'un oubli du code applicatif. Elle ne protege pas d'une execution de SQL arbitraire sous le role applicatif, qui pourrait poser `app.user_id` a sa guise. Limite assumee du mecanisme `SET LOCAL`.
- Les tables de better-auth (utilisateurs, sessions, comptes) ne sont pas des donnees du foyer. Leur acces est borne par role (ADR-0005), pas par RLS de foyer.

## Signal de reexamen
- Le PRD autorise un utilisateur dans plusieurs foyers, ou un commutateur de foyer.
- Une operation doit lire plusieurs foyers dans une meme requete.
- Une exigence d'isolation physique ou de residence des donnees apparait.
