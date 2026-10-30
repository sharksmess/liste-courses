# ADR-0001 — Socle Next.js + Drizzle + Postgres, sans facturation ni file d'evenements

- **Statut** : accepte (decision humaine, D-001)
- **Date** : 2026-10-30
- **Phase** : 0 — initialisation (`/init-stack`)

## Contexte
Application de liste de courses partagee pour un foyer : une famille de 4 personnes et quelques foyers d'essai. Charge tres faible, aucune contrainte reglementaire, aucun paiement, aucune tache de fond, aucun envoi d'e-mail. Le projet est le second projet de l'objectif A de saas-factory : il doit demarrer avec l'usine 1.6.5 telle quelle, et seul le profil `nextjs-drizzle-postgres` dispose d'une infrastructure de test dans l'usine (`templates/testing/nextjs`).

## Options envisagees
### Option A — `nextjs-drizzle-postgres`
Un seul deploiement, un seul langage, un seul jeu de types de la base a l'interface. Infrastructure de test fournie par l'usine. Coute : la frontiere metier / rendu ne tient que par discipline de dossier.
### Option B — `nestjs-prisma-postgres`
Frontieres de modules explicites, utile quand la logique metier est la difficulte principale. Coute : frontend a deployer a part, plus de code d'infrastructure, pas de gabarit de test dans l'usine. Ecarte : le besoin est un fullstack unifie et la logique metier est simple.
### Option C — `fastapi-sqlalchemy-postgres`
Pertinent pour une composante donnees ou ML, equipe Python. Ecarte : langage impose TypeScript, aucune composante donnees, pas de gabarit de test.

## Decision
Option A, sans les briques `billing` (Stripe) ni `queue` (Inngest) du profil, renseignees `"none"` dans `stack.json`. Critere : fullstack unifie en TypeScript demande par l'humain, et seul profil que l'usine sait tester.

`auth` reprend la valeur par defaut du profil (`better-auth`, auto-heberge, pas de prestataire tiers) ; elle est provisoire et sera confirmee par l'ADR d'authentification de la phase 2. `tenancy` reste `undecided` tant que le PRD n'existe pas (regle de `/init-stack`) ; la phase 2 la tranche.

## Consequences acceptees
- Sans file d'evenements, tout traitement est synchrone dans la requete. Un besoin futur de rappel, de notification ou de traitement differe exige un nouvel ADR et l'ajout d'une dependance.
- Sans envoi d'e-mail, l'authentification ne peut s'appuyer ni sur un lien magique, ni sur une reinitialisation de mot de passe par e-mail, ni sur une invitation par e-mail. Le mode d'acces et d'invitation au foyer est une question produit pour `/spec`.
- Sans facturation, aucun evenement facture : la section revenu du PRD sera vide par construction.

## Signal de reexamen
Un besoin de paiement, de traitement differe ou d'envoi d'e-mail apparait dans le PRD ou le backlog ; ou la charge depasse quelques dizaines de foyers.
