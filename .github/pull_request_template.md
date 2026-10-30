## Objet

<!-- Tranche NNN (docs/03-slices/NNN-*.md) ou objet de la branche fix/ chore/ docs/. -->

## Preuves (decision de fusion)

<!-- Tranche : reprise automatique de docs/04-runbooks/evidence/NNN.md par ship-slice.sh.
     L'humain decide sur ces preuves et sur la CI, sans relire le code. -->

- [ ] `scripts/close-slice.sh` vert (tranche) ou hook pre-push vert (hors tranche)
- [ ] Securite : `AUDIT: PASS` — Contrats : `CONTRACTS: PASS` — Relecture : `REVIEW: PASS`
- [ ] Chaque decision a sa ligne dans `docs/DECISIONS.md` ; chaque dependance ajoutee a son ADR

## Decisions prises

<!-- Reprise du journal. Vide = « Aucune decision hors contrat ». -->
