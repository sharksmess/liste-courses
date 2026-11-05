# Consigne — adopter l'usine 1.6.6 (branche `chore/usine-1.6.6`)

Redigee par l'orchestrateur (cowork) le 2026-11-05. L'humain a publie l'usine 1.6.6 (tests de l'usine : 187/187 sur le poste), cree la branche depuis `main` a jour (`2ed4e2f`, PR #2) et relance `install-project.ps1`. Lis `.claude/rules/git.md` et `.claude/rules/documentation.md`. Un commit par etape, Conventional Commits de 72 caracteres au plus, `git --no-pager`. Aucune tranche n'est active. **Tout script au premier plan.** Tu n'ouvres, ne cherches ni ne cites jamais `.env*.local` ni `*.local.ps1`.

## Ce que l'humain a deja decide (a inscrire au registre)
- **D-047 (humain, 2026-11-05)** : l'usine 1.6.6 est publiee et adoptee avant les tranches 002 a 004, qui passeront en mode autonome. Elle repond aux frictions de ce projet (`FRICTION.md`, 30/10 au 03/11), cote usine D-037 a D-044 : premier commit d'un depot neuf admis sur `main` ; depot de cadrage reconnu par le pre-push et la CI (`scripts/app-present.sh`) ; `block-dangerous` qui distingue une mention de `.env` d'une lecture (here-documents, `process.env`, `git show`) ; recherches recursives jugees sur les fichiers de secrets presents, `*.local.ps1` protege comme `.env` ; `git add` d'une approbation deja posee par l'humain admis ; message « isolation tenant » explicite ; perimetre limite a `apps/`, `packages/`, `tests/` (les rapports d'`audits/` ne demandent plus de `scope-add`) ; `/init-stack` aligne sur l'installeur ; `slice-implementer` ne modifie aucun test et committe l'echafaudage aussitot ; `next-env.d.ts` ignore par git ; `allowBuilds` documente. Reporte (usine D-036) : l'outil de preparation du poste.
- **D-048 (humain, 2026-11-05)** : `apps/web/next-env.d.ts` n'est plus versionne (FRICTION 03/11, usine D-042 ; la documentation de Next demande de l'ignorer) ; le `typecheck` de l'application le regenere par `next typegen`.
- **D-049 (humain, 2026-11-05)** : dans `.env.test.example`, `TEST_SERVER_ENV_BETTER_AUTH_SECRET` porte une etiquette au lieu d'etre vide : vide, `env-check.ps1` le croyait facultatif (usine D-029). Etiquette verifiee sans alerte par gitleaks 8.28.
- **Index du journal** : la ligne 02 indique « PR #2 fusionnee (commit 2ed4e2f) ».

## Etape 1 — Installation
`.claude/FACTORY_VERSION` doit contenir `1.6.6` ; sinon arrete-toi. Verifie qu'un garde-fou mord : une tentative d'ecrire dans `.gates/` avec l'outil Write doit etre refusee (constate seulement le refus). Committe les fichiers de l'usine que montre `git status --short` (attendus : `.claude/`, `.githooks/`, `.gitignore`, `scripts/` dont le nouveau `scripts/app-present.sh`), sans cette consigne : `chore: installer l'usine 1.6.6`. Signale tout fichier inattendu.

## Etape 2 — `next-env.d.ts` (D-048)
1. `git rm --cached apps/web/next-env.d.ts` (la ligne `next-env.d.ts` est deja dans `.gitignore`, ajoutee par l'installeur ; sinon arrete-toi).
2. Dans `apps/web/package.json`, `typecheck` devient `next typegen && tsc -p tsconfig.json --noEmit` (seul changement ; un manifeste d'application s'ecrit sur une branche `chore/`, usine 1.6.4).
3. Preuve sur un poste « neuf » : supprime le fichier local `apps/web/next-env.d.ts`, puis `pnpm run check` au premier plan. Attendu : vert, le fichier regenere, et `git status --short` ne le montre pas. Si le `typecheck` de la **racine** echoue faute du fichier (il passe avant celui de l'application), place le `typecheck` de l'application en tete du script racine et dis-le dans le rapport.
Commit : `chore(web): ne plus versionner next-env.d.ts (D-048)`.

## Etape 3 — Modele de test (D-049)
Dans `.env.test.example` (modele sans valeur, tu peux le lire et l'ecrire avec Write/Edit), remplace `TEST_SERVER_ENV_BETTER_AUTH_SECRET=` par `TEST_SERVER_ENV_BETTER_AUTH_SECRET=A_REMPLIR_secret_aleatoire` et ajuste le commentaire au-dessus : « Etiquette a remplacer par 32 caracteres aleatoires au moins ; jamais vide, sinon env-check le croit facultatif (D-049). » Commit : `chore: etiquette du secret de test dans le modele (D-049)`. Si le pre-commit refuse (gitleaks), arrete-toi et rapporte le message, sans contourner.

## Etape 4 — Preuve : la suite complete
`pnpm test` puis `pnpm run check`, au premier plan. Attendu : tout vert, comme a la cloture de 001 (donne les nombres). Si le `globalSetup` echoue sur un prerequis, arrete-toi et rapporte la phrase exacte (geste humain). Ne modifie aucun test.

## Etape 5 — Documentation
- Registre : D-047, D-048, D-049 (ci-dessus).
- Journal de projet : entree 03 `docs/00-context/journal/03-usine-1.6.6.md` (gabarit `docs/templates/JOURNAL-ENTREE.md`) et sa ligne d'index, plus la ligne 02 mise a jour. Contenu : ce qui a ete corrige (liste de D-047), preuves (usine 187/187 ; suite de l'etape 4), ce qui reste (tranches 002 a 004).
- FRICTION : ajoute en fin de chaque ligne traitee par 1.6.6, dans la colonne « Se reproduira ? », « non : usine 1.6.6 » ; laisse les autres telles quelles (pnpm 12 et ESLint 10 : documentes, pas supprimes). Ajoute une ligne seulement si un incident survient pendant cette adoption.
Commit : `docs: adoption de l'usine 1.6.6 (D-047 a D-049, journal 03)`, avec cette consigne.

## Etape 6 — Livraison
`bash scripts/ship-branch.sh "chore: adopter l'usine 1.6.6"` au premier plan, et arrete-toi avec le lien de la PR. Rapport court et en clair : resultat de la suite, fichiers installes, tout ecart.
