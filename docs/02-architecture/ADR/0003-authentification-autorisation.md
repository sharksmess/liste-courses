# ADR-0003 — Authentification better-auth par e-mail et mot de passe, autorisation par foyer et role

- **Statut** : propose (accepte a l'approbation du gate architecture)
- **Date** : 2026-10-30
- **Phase** : 2 — architecture
- **Confirme** : D-003 (better-auth, provisoire depuis l'ADR-0001)

## Contexte
Le PRD fixe les points suivants :
- Comptes par adresse e-mail et mot de passe de 8 a 128 caracteres, avec un prenom d'affichage de 1 a 30 caracteres apres trim (D-009, D-012).
- Aucune verification d'adresse, aucun envoi d'e-mail, aucune recuperation de mot de passe (D-008, ADR-0001).
- Une connexion limitee par le limiteur integre de better-auth, actif hors tests, comme l'ADR-0010 de Signet (D-012).
- Deux roles, responsable et membre, plus le cas du compte sans foyer (D-008, D-013).

L'ADR-0001 avait laisse `auth` provisoire en attendant cet ADR.

**Ce qui serait faux de faire simplement :**
- Garder le defaut de better-auth pour le limiteur. Il depend de `NODE_ENV`, et Signet a constate qu'il etait coupe sans decision en `next dev` (ADR-0010 de Signet).
- Croire que better-auth valide le prenom. Il accepte un `name` quelconque, donc il faut une validation a nous.
- Lire le role en session une fois pour toutes. Il change quand la responsable retire un membre, et le retrait doit couper l'acces a la requete suivante (US-12.1).

## Options envisagees
### Authentification
#### Option A1 — better-auth, plugin e-mail et mot de passe, auto-heberge
C'est le defaut du profil, et il est deja eprouve par l'usine (Signet). Il fournit les sessions par cookie, le hachage du mot de passe et le limiteur integre. Il n'exige aucun envoi d'e-mail si la verification et la reinitialisation ne sont pas configurees.

#### Option A2 — Clerk
C'est un prestataire tiers. Il ajoute un service externe et des donnees personnelles hors de la base, pour un produit sans mise en ligne. Deja ecarte par D-003.

#### Option A3 — Authentification ecrite a la main
C'est plus de code de securite a ecrire et a auditer, sans benefice.

### Autorisation
#### Option B1 — Foyer et role mis en cache dans la session
C'est rapide. Mais un membre retire garderait son acces jusqu'a l'expiration de sa session, ce qui contredit US-12.1.

#### Option B2 — Foyer et role relus en base a chaque requete, depuis l'utilisateur de session
Cela coute une lecture d'appartenance par requete, deja payee par la fonction de contexte RLS (ADR-0002). Le retrait prend effet immediatement.

## Decision
**A1 et B2.**

### Authentification (better-auth)
- Plugin e-mail et mot de passe.
  - `minPasswordLength` = 8 et `maxPasswordLength` = 128, ecrits explicitement dans la configuration plutot que laisses au defaut.
  - Verification d'adresse desactivee. Aucune fonction d'envoi d'e-mail n'est configuree, ni pour la verification, ni pour la reinitialisation : les routes correspondantes ne peuvent rien envoyer.
- Le prenom est le champ `name` de l'utilisateur better-auth.
  - Avant toute creation, un schema Zod le valide (trim, puis 1 a 30 caracteres), et c'est la valeur trimee qui est enregistree.
  - Le point d'accroche exact (hook de route ou hook de base) est fixe par la tranche 001, sur la version installee.
  - La modification du prenom est hors perimetre. Aucune route de mise a jour du profil n'est exposee par l'application, et la tranche 001 verifie que celle de better-auth ne peut pas le changer.
- Une adresse = un compte (D-013). better-auth refuse une seconde inscription sur la meme adresse.
- Le limiteur de debit suit l'ADR-0010 de Signet, transpose tel quel :
  - Une fonction pure valide `AUTH_RATE_LIMIT` (`on` par defaut) et `APP_ENV` (`production` par defaut). `off` n'est accepte qu'avec `APP_ENV=test`, sinon le serveur refuse de demarrer.
  - La regle d'inscription est ecrite dans notre configuration, pas laissee au defaut.
  - La tranche 001 la prouve par un test pur.
- Le controle d'origine de better-auth reste actif. Le serveur de test de l'usine 1.6.5 le rend actif ; la lecon vient de la tranche 014 de Signet.
- Connexion refusee avec un message identique pour une adresse inconnue et un mauvais mot de passe (US-02.2). C'est le comportement de better-auth, verifie par un test.

### Autorisation
Ordre de verification impose a toute route applicative :
1. **Session.** Sans session valide : `401 UNAUTHENTICATED`.
2. **Foyer de l'utilisateur de session**, relu en base.
   - Pour une route qui suppose un foyer, s'il n'y en a pas : `403 NO_HOUSEHOLD`.
   - Pour creer ou rejoindre un foyer, s'il y en a deja un : `409 ALREADY_IN_HOUSEHOLD`.
3. **Role** dans ce foyer. Insuffisant : `403 INSUFFICIENT_ROLE`.
4. **Ressource ciblee** (article, membre), cherchee dans le foyer de l'appelant. Absente : `404`.
   - Une ressource d'un autre foyer et une ressource inexistante donnent la meme reponse (regle `nextjs.md`).
   - Le foyer n'etant jamais un parametre (ADR-0002), aucune reponse ne peut reveler l'existence d'un autre foyer.

Les Server Actions, si une tranche en introduit, suivent exactement le meme ordre (ADR-0006).

## Consequences acceptees
- **Un mot de passe oublie fait perdre le compte** (risque R2 du PRD). Ajouter la recuperation demandera un ADR d'envoi d'e-mail et une nouvelle dependance.
- **Aucune adresse n'est verifiee.** N'importe qui peut creer un compte avec l'adresse d'un autre. Ce compte n'entre dans un foyer qu'avec son code (risque R3).
- Le prenom n'etant pas modifiable, il n'existe aucune route de profil. Rendre la modification possible obligera a choisir ce que deviennent les prenoms deja affiches sur les articles (voir ERD).
- Les tests HTTP tournent avec le limiteur coupe (`APP_ENV=test`). Son reglage n'est prouve que par le test pur, comme dans Signet.
- Le stockage du limiteur est la memoire du processus. C'est suffisant pour une instance unique ; plusieurs instances demanderaient un stockage partage.
- Une lecture d'appartenance par requete, deja comptee dans l'ADR-0002.

## Signal de reexamen
- Le PRD ajoute la recuperation de mot de passe, la verification d'adresse ou la modification du prenom.
- Une montee de better-auth change `rateLimit`, `customRules`, les bornes de mot de passe ou le controle d'origine.
- Une mise en ligne reelle est envisagee (risque R1 : suppression de compte et mineurs).

## Amendement du 2026-10-30 — source de l'adresse IP du limiteur (D-040, D-043)
Origine : audit-001, constat MAJEUR-1 (second passage : MINEUR-2). Sans reglage, better-auth 1.7.14 prend comme adresse du client la valeur unique de `X-Forwarded-For`, que le client choisit : un en-tete different a chaque requete ouvre un compteur neuf, et le limiteur de connexion ne s'applique plus.

Sous `next start` sans proxy, aucune source sure n'existe : Next ne pose `X-Forwarded-For` depuis l'adresse du socket que si le client ne l'a pas deja envoye (`??=` dans `next/dist/server/base-server.js`), et il n'expose pas le socket aux route handlers.

Decision (option a de D-040, decidee d'avance par l'humain ; D-043) : **aucun en-tete d'adresse n'est cru** tant qu'aucun proxy de confiance n'est declare. Configuration `advanced.ipAddress: { ipAddressHeaders: [] }`, sans `trustedProxies` (`apps/web/src/lib/auth-ip.ts`, branche dans `apps/web/src/lib/auth.ts`). Un `X-Forwarded-For` forge n'ouvre plus de compteur. Preuve : `tests/auth/rate-limit-ip.test.ts`, qui applique cette configuration a la fonction `getIP` de better-auth, avec un controle sur la configuration par defaut.

Risque residuel accepte tant qu'il n'y a pas de mise en ligne (D-011) : toutes les requetes partagent le compteur de chaque chemin (`no-trusted-ip|<chemin>`). Un tiers qui envoie 3 connexions par 10 s fait refuser (429) celles de toute la famille.

Signal de reexamen : avant toute mise en ligne, declarer le proxy reel (`ipAddressHeaders` + `trustedProxies`) et n'exposer le serveur que derriere lui (backlog, « Reevaluations techniques »), puis mettre a jour le test et cet amendement.
