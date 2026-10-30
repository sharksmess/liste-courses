# Journal des frictions

Une ligne **des que quelque chose grince**, pas en fin de projet. Une friction
notee trois jours plus tard a perdu son contexte et la solution qu'on avait en
tete sur le moment. C'est la matiere premiere de `/retro`.

Ce qui merite une entree : un hook qui bloque a tort, une skill dont les
instructions sont ambigues, une etape qu'il a fallu faire a la main, un agent
qui a derive, un gabarit incomplet, une decision qu'on a du reprendre.

| Date | Ou | Ce qui s'est passe | Contournement | Se reproduira ? |
|---|---|---|---|---|
| 2026-10-30 | /init-stack, etape 1 | La skill renvoie a `references/stacks/` « du plugin », mais la copie projet (`.claude/skills/init-stack`) n'embarque pas `references/` ; les profils ont ete lus dans la source de l'usine `C:\dev\saas-factory\references\stacks` (identiques au cache plugin 1.0.0) | Aucun : lecture dans la source de l'usine, rien de modifie | oui, a chaque projet installe par `install-project.ps1` |
| 2026-10-30 | /init-stack, etape 3 | La skill demande de copier les gabarits, `CLAUDE.md`, le Makefile et `settings.json`, alors que `install-project.ps1` l'a deja fait (sauf le Makefile, remplace par `gates.ps1` sous Windows). Instructions redondantes avec l'installeur et non adaptees a Windows | Aucun : gabarits verifies identiques (`CLAUDE.md`, `gates.ps1` ; `settings.json` aux chemins de hooks pres), Makefile non copie (D-005) | oui |
| 2026-10-30 | install-project.ps1 / ordre des etapes | L'installeur choisit les regles (`drizzle-postgres.md`, `nextjs.md`) et l'infrastructure de test (`tests/_factory`, `.env.test.example`) d'apres `stack.json` ; lance avant `/init-stack`, il n'a copie ni les unes ni l'autre. Il faut le relancer apres `/init-stack`, ce que ni l'installeur ni la skill ne disent | Aucun : relance laissee a l'humain (elle touche `core.hooksPath` et `settings.json`, interdits a l'agent) | oui, a chaque nouveau projet |
| 2026-10-30 | /init-stack, `stack.json` | Le gabarit ne prevoit pas de valeur pour une brique absente (`billing`, `queue`) | `"none"` choisi et consigne (D-002) | peut-etre |
| 2026-10-30 | /init-stack, etape 3 | L'arborescence demandee (`apps/`, `packages/`, `infra/`, `tests/`, `.gates/`, sous-dossiers de `docs/`) est vide : git ne versionne pas les dossiers vides, et un `.gitkeep` dans `apps/` serait refuse par `gate-check.sh` avant le gate 02. Les dossiers n'existent donc que localement | Aucun | oui |
| 2026-10-30 | premier commit / `.githooks/pre-commit` | Aucun chemin de l'usine ne permet le premier commit d'un projet neuf : le pre-commit refuse tout commit sur `main`, et le rituel PR suppose un depot distant qui n'existe pas encore (`github-setup.ps1` vient apres) | Premier commit sur `chore/initialisation`, hooks actifs ; l'humain renomme la branche en `main` puis lance `github-setup.ps1` (D-006). `--no-verify` ecarte | oui, a chaque nouveau projet : l'installeur ou `/init-stack` devrait prevoir cette etape |
| 2026-10-30 | `.githooks/pre-push` / push initial | Le pre-push lance `pnpm run check`, qui echoue sans `package.json` : le push initial de `main` apres `github-setup.ps1` est refuse alors que l'application ne peut pas encore exister (elle nait en tranche 001, apres le cadrage) | Aucun contournement : `main` sera poussee depuis `slice/001` une fois la tranche close (D-007). `--no-verify` ecarte | oui, a chaque nouveau projet : le pre-push devrait reconnaitre un depot sans application, ou l'usine prevoir le premier push |
| 2026-10-30 | `.github/workflows/ci.yml` / PR de cadrage | La CI exige elle aussi une application (`package.json`) : une PR de cadrage seule (PRD, architecture, gates) serait rouge et non fusionnable une fois `main` protegee. Le cadrage ne peut donc pas etre livre seul | Cadrage porte par la premiere PR avec la tranche 001 (D-007) | oui, a chaque nouveau projet : la CI devrait admettre une PR documentaire sans application |
| 2026-10-30 | `block-dangerous.sh` / commit du gate PRD | L'humain a demande a l'agent de committer `.gates/01-prd.approved` (apres son `approve-prd`), mais le hook refuse toute commande qui le nomme, y compris un simple `git add` : il ne distingue pas versionner une approbation existante et la creer | Aucun contournement : le registre est committe seul, le fichier de gate est committe par l'humain | oui, a chaque gate : le hook devrait autoriser `git add` d'un fichier `.gates/*.approved` deja present, ou l'usine dire qui le versionne |
| 2026-10-30 | `block-dangerous.sh` / phase 2 | Lecture de `.env.test.example` (gabarit sans valeur, versionne) refusee comme une lecture de `.env` ; le message renvoie a `.env.example`, absent du projet. L'agent ne peut pas connaitre les noms de variables de test attendus | Noms deduits de `tests/_factory/env.ts` et `db-catalog.test.ts` | oui : le hook devrait autoriser `*.example` |

<!-- Exemple :
| 2026-09-18 | /slice 012 | Le perimetre ne couvrait pas apps/web/lib/auth.ts, l'implementeur s'est bloque | Elargi le scope a la main | oui, /slice doit inclure les fichiers partages touches par une route |
-->
