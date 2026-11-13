# Consigne — enregistrer la visite guidee des tranches 002 a 004 (branche `docs/visite-guidee-002-004`)

Redigee par l'orchestrateur (cowork) le 2026-11-13. `main` contient les PR #10 (tranche 004) et #11 (D-070). L'humain a fait aujourd'hui la visite guidee unique prevue par D-053 et D-059. Documentation seule : tu ne touches ni a `apps/`, ni a `packages/`, ni a `tests/`, ni aux fiches de preuves des tranches closes. Lis `.claude/rules/git.md` et `.claude/rules/documentation.md`. Conventional Commits de 72 caracteres au plus, `git --no-pager`, tout au premier plan, aucune sortie coupee (sortie complete dans `.logs/`). Tu n'ouvres, ne cherches ni ne cites jamais `.env*.local` ni `*.local.ps1`.

## Les faits (a reporter tels quels, sans les embellir)
- **Cadre** : visite faite par l'humain le 2026-11-13 sur `main` (releve le commit par `git log --oneline -1` avant de creer la branche), `pnpm dev`, port 3200, base de developpement migree juste avant (« migrations appliquees »). Deux fenetres Edge : la responsable (fenetre normale) et un membre (fenetre InPrivate, compte cree pendant la visite).
- **Verdict de l'humain** : « tout est bon ». Aucun ecart signale, aucune faute de texte signalee.
- **Trace au journal du serveur** (extrait fourni par l'humain a l'orchestrateur, dans cet ordre) :
  1. `POST /api/household/join` → 422 (code refuse), puis → 200 (le membre rejoint le foyer) ;
  2. `POST /api/household/items` → 201, deux fois ; `PATCH /api/household/items/<id>` → 200, quatre fois (deux articles coches puis decoches) ; `DELETE /api/household/items/<id>` → 200, deux fois ;
  3. `DELETE /api/household/members/<id>` → 200 (la responsable retire le membre) ;
  4. `POST /api/household/items` → 403 (le membre retire, session encore ouverte), suivi de `GET /no-household` → 200 ;
  5. `POST /api/household/join` → 200 (il rejoint de nouveau le foyer) ;
  6. `POST /api/household/leave` → 200, suivi de `GET /no-household` → 200 (il quitte le foyer) ;
  7. `POST /api/household/invite-code` → 200 (la responsable regenere le code) ;
  8. `POST /api/household/join` → 404 (ancien code refuse).
- **Sur attestation de l'humain seulement** (contenu des ecrans, que le journal du serveur ne montre pas) : affichage du code chez la responsable, absence du code et du bouton chez le membre, messages de refus, prenoms sur les articles, formulaire vide apres un ajout, liste des membres, passage a la page « sans foyer ». L'humain a declare l'ensemble conforme sans detailler point par point.
- **Non fait a la visite** (absent du journal du serveur et non atteste) :
  1. supprimer un article deja supprime depuis l'autre fenetre : l'affichage du message de `ITEM_NOT_FOUND` n'a pas ete vu (aucun `DELETE` → 404 au journal) ;
  2. l'article d'un membre parti, encore affiche avec son prenom : aucun article n'existait au moment du retrait (prouve par les tests, US-06.2, mais pas vu a l'ecran) ;
  3. rejoindre avec le nouveau code apres la regeneration : le journal s'arrete au refus de l'ancien (prouve par les tests d'API) ;
  4. clics rapides sur plusieurs lignes (review-003, suggestion 9) : non atteste ;
  5. bornes (10 membres, 200 articles, longueur des noms) : ecartees de la visite par l'orchestrateur, couvertes par les tests.

## Decisions de l'humain (a inscrire au registre, prochains numeros libres apres D-070)
- **Visite guidee (humain, 2026-11-13)** : la visite guidee unique des tranches 002 a 004 est faite, verdict conforme, aucun ecart, donc aucune tranche de correction. La preuve distingue ce qui est trace au journal du serveur, ce qui repose sur l'attestation de l'humain, et ce qui n'a pas ete fait (liste ci-dessus). Les cinq points non faits ne bloquent rien : ils vont au backlog, « a voir a la prochaine visite ou avant toute mise en ligne ».
- **Confirmations (humain, 2026-11-13)** : D-055 (regenerer le code), D-064 (supprimer un article) et D-068 (retirer un membre, quitter le foyer) ont ete reexaminees a la visite. L'humain n'a signale aucun manque et n'a demande aucune confirmation : le comportement actuel est maintenu. Signal de reexamen : un clic par erreur signale a l'usage, ou l'ouverture du produit a d'autres familles. Ecarte pour l'instant : ajouter des confirmations (non demandees par le PRD, ni par l'humain apres essai).

## A ecrire
1. **Registre** : les deux decisions ci-dessus ; D-055, D-064 et D-068 portent la mention « reexaminee a la visite guidee du 2026-11-13 » avec le numero de la decision.
2. **Journal de projet** : entree 07 `docs/00-context/journal/07-visite-guidee-002-004.md` (gabarit `docs/templates/JOURNAL-ENTREE.md`) et sa ligne d'index. Contenu : les faits ci-dessus avec leurs trois niveaux de preuve ; l'etat du projet (les quatre tranches du MVP sont livrees et fusionnees, 480 tests ; le produit n'est pas mis en ligne, R1 reste bloquant) ; ce qui reste (backlog).
3. **Backlog** : une section « Suites de la visite guidee de 002 a 004 » avec les cinq points non faits ; les lignes existantes « a verifier a la visite guidee » (suites de 002 et de 003, et celles de 004 s'il y en a) sont mises a jour : fait, ou renvoi a cette section.
4. **Journal du passage autonome** : une ligne finale, la visite est faite.
Ne modifie pas `docs/04-runbooks/evidence/00N.md` : l'entree 07 fait le lien avec elles.

Commit : `docs: visite guidee des tranches 002 a 004`, avec cette consigne. Puis `bash scripts/ship-branch.sh "docs: visite guidee des tranches 002 a 004"` au premier plan, et arrete-toi avec le lien de la PR dans ton rapport.
