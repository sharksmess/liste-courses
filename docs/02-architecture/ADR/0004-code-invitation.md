# ADR-0004 — Code d'invitation : 10 caracteres Crockford, stocke en clair, unique, sans limiteur dedie

- **Statut** : propose (accepte a l'approbation du gate architecture)
- **Date** : 2026-10-30
- **Phase** : 2 — architecture

## Contexte
Le PRD (D-008, D-013, D-014) definit le code d'invitation ainsi :
- Un code par foyer, sans expiration, **donne de vive voix**.
- **Visible par la responsable seule**, regenerable par elle. L'ancien code est alors refuse immediatement.
- Rejoindre exige un compte connecte. Un code inconnu ou remplace est refuse sans rien reveler d'un foyer (US-05.2).

C'est le seul secret qui ouvre l'acces a un foyer, puisque les adresses ne sont pas verifiees. Le risque R3 du PRD porte sur sa fuite.

**Ce qui serait faux de faire simplement :**
- **Ne stocker qu'un hache**, comme un jeton d'invitation envoye par e-mail (ADR-0003 de Signet). La responsable doit pouvoir relire le code en vigueur (US-11.1), et un hache ne se relit pas.
- **Un code court ou numerique** (6 chiffres). Il est facile a dicter, mais un compte connecte qui essaie des codes finit par tomber sur un foyer.
- **Un code avec des caracteres ambigus** (`O`/`0`, `I`/`1`/`L`). Il est dicte a voix haute.

## Options envisagees
### Option A — 6 chiffres
Tres facile a dicter. Avec 10^6 combinaisons, un attaquant trouve vite un foyer actif : il faudrait un limiteur dedie et un verrouillage.

### Option B — Phrase de mots (« pomme-velo-lune »)
Facile a dicter. Elle exige un dictionnaire, donc une dependance ou une liste a maintenir, et son entropie par caractere est plus faible.

### Option C — 10 caracteres de l'alphabet de Crockford (base32 sans `I`, `L`, `O`, `U`), affiches `XXXXX-XXXXX`
L'entropie est d'environ 50 bits, et l'alphabet est fait pour etre lu et dicte. Le code est genere en base, sans dependance ni extension (ERD, `lc.new_invite_code()`).

### Stockage
- **S1 — En clair, colonne unique** : relisible par la responsable, recherche directe.
- **S2 — Hache, plus une copie chiffree** : protege une fuite de la base, mais exige une cle a gerer pour un secret qui ne protege qu'une liste de courses.
- **S3 — Hache seul** : incompatible avec US-11.1.

## Decision
**Option C, stockage S1, sans limiteur dedie a la route « rejoindre ».**

- **Generation** : 10 caracteres tires uniformement dans l'alphabet de Crockford a 32 symboles (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`), **en base** par `lc.new_invite_code()`. La source est `gen_random_uuid()`, donc `pg_strong_random` (ERD).
  - Le code ne transite jamais en parametre d'une fonction d'ecriture.
  - La reprise sur collision vit a cote de l'index unique, dans `create_household` et `regenerate_invite_code`.
  - Retenu sur proposition de `db-architect` (ERD Q-5, D-020), plutot que le generateur de Node envisage d'abord.
- **Affichage** : `XXXXX-XXXXX`.
- **Saisie normalisee avant validation** : retrait des espaces et des tirets, puis mise en majuscules. La valeur normalisee doit faire 10 caracteres de l'alphabet, sinon `422`.
  - Les substitutions de Crockford (`O`→`0`, `I`/`L`→`1`) ne sont **pas** appliquees : un caractere hors alphabet est refuse. Ce choix reste simple et peut etre rouvert.
- **Stockage** : la valeur normalisee, en clair, avec une contrainte d'unicite globale (ERD).
  - Une collision a la generation (probabilite negligeable) est retentee par la fonction de creation ou de regeneration.
  - Regenerer remplace la valeur dans la meme transaction : l'ancienne n'existe plus nulle part.
- **Recherche** : par une fonction `SECURITY DEFINER` (ERD). C'est la seule lecture transverse aux foyers. Elle renvoie seulement le resultat de l'operation (rejoint, code invalide, foyer plein, deja dans un foyer), jamais un identifiant ni un nom de foyer avant l'adhesion.
- **Limiteur** : pas de limiteur dedie. Avec 32^10 ≈ 1,1 × 10^15 codes et quelques foyers, un attaquant a 1 000 essais par seconde mettrait en moyenne des dizaines de milliers d'annees a toucher un foyer. Le limiteur de better-auth ne couvre que ses propres routes.

## Consequences acceptees
- **Une fuite de la base expose tous les codes en clair.** Elle exposerait de toute facon les listes elles-memes. La parade est la regeneration (US-11.3). La base n'est pas mise en ligne (D-011).
- Le code reste valide indefiniment tant que la responsable ne le regenere pas (decision produit D-008). Le risque R3 est accepte.
- L'absence de limiteur sur « rejoindre » repose sur l'entropie. Raccourcir le code impose d'ajouter un limiteur, donc de rouvrir cet ADR.
- Une saisie avec `O` au lieu de `0` est refusee au lieu d'etre corrigee. Si ce rejet gene a l'usage, ajouter les substitutions de Crockford est un changement local, sans migration.

## Signal de reexamen
- Le nombre de foyers depasse le millier, ou on observe des essais en serie sur la route « rejoindre ».
- Le PRD ajoute l'expiration du code, l'invitation par lien ou par e-mail.
- Une plainte d'usage sur la dictee du code.
