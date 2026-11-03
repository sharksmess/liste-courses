---
name: rejected-decisions
description: Options de modelisation ecartees pour liste-courses et leur raison (ne pas les reproposer sans fait nouveau)
metadata:
  type: project
---

- Jointure sur app_user pour le prenom : ecartee, lc_app devrait lire lc_auth (e-mails) et voir les comptes partis. Copie retenue.
- Code d'invitation en colonne de household : ecarte, lisible par tous les membres (code reserve a la responsable, D-014).
- Borne par verrou + count(*) : ecartee, fausse en REPEATABLE READ et dependante du chemin. Compteur + CHECK retenu.
- BYPASSRLS sur lc_definer : ecarte (Signet ADR-0007).
- lc_owner LOGIN (comme Signet) : ecarte, SET ROLE suffit au test FORCE.
- Retrait/depart par DELETE direct sous RLS : ecarte, recursion sur membership et refus sans cause typee.
- Soft delete : ecarte, PRD exige suppression definitive.

**Why:** chaque raison est detaillee dans ADR-0005 (docs/02-architecture/ADR/).
**How to apply:** si une de ces options revient, citer la raison et exiger un fait nouveau. Lie a [[project-schema-invariants]].
