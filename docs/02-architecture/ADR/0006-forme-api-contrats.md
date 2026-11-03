# ADR-0006 — Forme de l'API : Route Handlers JSON sous `/api/household`, contrats Zod, erreurs typees

- **Statut** : propose (accepte a l'approbation du gate architecture)
- **Date** : 2026-10-30
- **Phase** : 2 — architecture

## Contexte
Le profil impose des contrats ecrits comme des schemas Zod dans `docs/02-architecture/api-contracts/*.ts`, importes par l'implementation et par les tests. Ce sont eux que `contract-guardian` compare a chaque tranche.

Il reste trois choses a fixer :
- comment l'interface appelle le serveur ;
- la forme des erreurs ;
- ce qu'un contrat contient.

**Ce qui serait faux de faire simplement :** doubler chaque operation par une Server Action et un Route Handler. On aurait deux points d'entree publics a authentifier, valider et tester pour une meme operation (`nextjs.md` : une Server Action est un endpoint public).

## Options envisagees
### Option A — Route Handlers seuls
Les ecrans sont des Server Components qui lisent par la couche de service cote serveur. Les mutations partent du navigateur vers les Route Handlers. Il y a un seul point d'entree par operation, et c'est lui que testent les tests HTTP de l'usine.

### Option B — Server Actions seules
Moins de code de transport. En revanche, les tests HTTP doivent viser des identifiants d'action generes par Next, et le contrat n'a plus de route stable que `contract-guardian` pourrait comparer.

### Option C — Les deux
Elle double la surface d'attaque et les tests. Ecartee.

## Decision
**Option A.**

- **Points d'entree** : chaque operation du PRD est un Route Handler JSON.
  - Les routes du foyer vivent sous `/api/household/...`, sans identifiant de foyer (ADR-0002).
  - Les routes de better-auth vivent sous `/api/auth/...`. Leur contrat (`auth.ts`) decrit ce que nos tests exigent d'elles.
- **Lectures des ecrans** : les Server Components appellent la meme couche de service que les Route Handlers, avec le meme ordre d'autorisation (ADR-0003). Aucune lecture ne contourne la couche de service ni la RLS.
- **Mutations depuis l'interface** : composants client qui appellent les Route Handlers par `fetch`.
  - Si une tranche veut une Server Action, elle reutilise le contrat et l'ordre d'autorisation, et le justifie dans son journal de decisions.
- **Contrat** : forme commune `ApiContract` (`_contract.ts`). Elle contient :
  - la route, la methode ;
  - le role minimal (`public`, `authenticated`, `no-household`, `member`, `owner`) ;
  - les schemas d'entree et de sortie ;
  - la liste complete des erreurs (statut, code, declencheur exact) ;
  - l'idempotence.
- **Erreurs** : corps `{ "error": { "code": "<CODE>" } }`, sans message technique ni secret.
  - Une validation echouee donne `422 VALIDATION_FAILED`, avec la liste des champs en cause mais jamais leur valeur.
  - Cote serveur, les erreurs metier attendues sont des valeurs de retour typees (CLAUDE.md). Le Route Handler les traduit en statut.
- **Entrees** : corps, parametres de route et requete passent tous par le schema du contrat avant usage. Les parametres de route `:itemId` et `:memberId` sont valides comme UUID : un format invalide donne `404`, comme une ressource absente, pour ne pas distinguer les deux.
- **Dependance** : `zod` est une dependance directe introduite par ces contrats, prevue par le profil. Sa version est choisie au registre et consignee dans l'ADR des versions de la tranche 001 (`rules/dependencies.md`).

## Consequences acceptees
- Les ecrans font des appels `fetch` cote client pour chaque mutation, puis rechargent la donnee. C'est coherent avec l'absence de temps reel (PRD).
- Les Server Components et les Route Handlers partagent une couche de service. Sans discipline de dossier, la logique pourrait glisser dans les composants (limite connue du profil). Le relecteur le verifie.
- Un format invalide de `:itemId` donne `404` et non `422` : c'est moins precis pour un client honnete, mais indistinguable pour un attaquant.

## Signal de reexamen
- Une tranche a besoin de formulaires sans JavaScript, ou d'une amelioration progressive.
- Un client autre que l'interface web (application mobile) apparait au PRD.
