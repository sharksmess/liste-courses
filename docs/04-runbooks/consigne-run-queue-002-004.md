# Consigne — passage autonome des tranches 002 a 004

Redigee par l'orchestrateur (cowork) le 2026-11-05. A lire au lancement de `/run-queue`, **en plus** de la skill, qui reste la reference : ses conditions d'arret s'appliquent **sans exception**. Premier passage autonome de ce projet, sous l'usine 1.6.6. Le poste doit rester eveille.

## Budget et deroulement
**Trois tranches au plus : 002, puis 003, puis 004**, dans cet ordre (`000-backlog.md`). Chaque tranche depend de la precedente : apres `ship-slice.sh` d'une tranche, **tu t'arretes** et tu attends que l'humain fusionne sa PR (regle de la skill : pas de tranche dont une dependance a une PR ouverte). L'humain relancera `/run-queue` avec cette meme consigne ; tu reprends alors a la tranche suivante, en verifiant d'abord que `main` contient la fusion (`git log --oneline -3`) et que l'arbre est propre. Jamais de fusion, jamais de push vers `main`.

## Ce que l'humain a deja decide (a inscrire au registre a l'ouverture de 002, prochain numero libre)
- **Passage autonome (humain, 2026-11-05)** : les tranches 002 a 004 sont implementees en mode autonome sous l'usine 1.6.6 (PR #3), une PR chacune, fusion humaine entre deux tranches. C'est la suite prevue : finir le second projet de l'objectif A avec l'usine corrigee, et tester le mode autonome sur un projet neuf. Les contrats de tranche n'attendent pas de validation humaine : tes decisions hors contrat vont au registre marquees « a valider par l'humain ».
- **Ecrans sans visite guidee par tranche (humain, 2026-11-05)** : en mode autonome, personne ne peut faire de visite pendant la tranche. Chaque critere d'ecran est prouve par un test sur la page rendue par le serveur de test (contenu, liens, formulaires, refus). **Une visite guidee unique** des ecrans de 002 a 004 sera faite par l'humain apres la fusion de 004, sur `main` ; un ecart y deviendra une tranche de correction. Ecarte : une visite avant chaque fusion (elle exigerait de rouvrir chaque fiche de preuves apres sa cloture).

## Sources a lire avant chaque contrat
PRD (US-05, US-11 pour 002 ; US-06 a US-09 pour 003 ; US-10, US-12, US-13 pour 004), `000-backlog.md` (notes par tranche, exigences de concurrence), ERD, ADR-0002 (isolation), ADR-0004 (code d'invitation), ADR-0005 (roles et fonctions `SECURITY DEFINER`), ADR-0006 (forme des contrats), les contrats `docs/02-architecture/api-contracts/` (`invite-code.ts`, `household.ts`, `items.ts`, `members.ts`), la tranche 001 et sa fiche de preuves comme modele.

## Regles propres a ces tranches
- **Isolation tenant** : critere AC5 nomme ainsi dans chaque tranche (« Isolation tenant (entre foyers) »), avec deux foyers reels, par l'API et en base sous le role applicatif (`000-backlog.md`).
- **Concurrence** : 002, le 10e et le 11e membre rejoignent en parallele, un seul reussit ; 003, deux ajouts paralleles a 199 articles, un seul reussit. Teste-le pour de vrai (requetes simultanees sur la vraie base), jamais par un mock.
- **002, code d'invitation** : tout suit ADR-0004 (alphabet, normalisation D-025, `422`, recherche par la seule fonction `SECURITY DEFINER`, aucun limiteur dedie). Un refus ne revele **rien** d'un foyer (US-05.2) : meme reponse pour un code inconnu et un code remplace. Si un point n'y est pas tranche, c'est une decision manquante : **arrete-toi**.
- **004, coupure immediate** : apres un retrait, la session encore ouverte du membre retire recoit `403 NO_HOUSEHOLD` sur la liste ; la responsable ne part jamais (D-010).
- **Perimetre** : `apps/`, `packages/`, `tests/` seulement ; `docs/` n'y figure pas (usine 1.6.6). Un fichier de code hors perimetre : **arrete-toi** (demande de `scope-add` a l'humain, avec la raison).
- **Aucune dependance nouvelle** (condition d'arret). Une migration met a jour l'ERD dans la meme tranche.
- **Tests** : ecrits par `test-writer` seul ; `slice-implementer` n'en modifie aucun (usine 1.6.6) ; aucune comparaison permanente a `main` ; valeurs de test inventees visiblement fausses.
- Scripts et tests **au premier plan** ; si la plateforme en bascule un en arriere-plan, attends sa notification sans le relancer. Relecteurs en parallele, sans `pnpm test` de leur cote.
- **Secrets** : tu n'ouvres, ne cherches ni ne cites jamais `.env*.local` ni `*.local.ps1`. Si un hook bloque a tort une commande legitime, ne la reformule pas pour passer : note-le dans FRICTION et fais autrement (outil Read, `git grep`).

## Journal
`docs/04-runbooks/autonomous-run-2026-11-05.md`, tenu au fil de l'eau (une section par tranche, reprise possible apres coupure). Journal de projet : une entree par tranche close (04 pour 002, 05 pour 003, 06 pour 004), avec sa ligne d'index. Rapport final a chaque arret : **en tete, ce qui exige une decision humaine**, puis le lien de la PR.
