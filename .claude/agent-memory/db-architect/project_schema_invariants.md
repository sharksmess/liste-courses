---
name: project-schema-invariants
description: Invariants du schema liste-courses (lc, lc_auth, roles lc_*, definer, compteurs) poses dans ERD/ADR-0005 le 2026-10-30
metadata:
  type: project
---

Schema propose 2026-10-30 (ERD.md + ADR-0005, statut propose jusqu'au gate architecture).

- Schemas : `lc` (foyer), `lc_auth` (better-auth, `user` renomme `app_user`). Rien dans `public`.
- Roles : `lc_owner` NOLOGIN (proprietaire inerte, test FORCE par SET ROLE), `lc_app`, `lc_better_auth`, `lc_definer` NOLOGIN. Aucun BYPASSRLS.
- Contexte : seul `app.user_id` est pose par le serveur ; `lc.current_household_id()` (DEFINER) derive le foyer ; `app.household_id` reserve aux fonctions definer (`context_household_id()`).
- Anti-recursion : aucune politique TO lc_definer n'appelle current_household_id().
- lc_app n'ecrit que item (UPDATE purchased, DELETE). Tout le reste via 8 fonctions definer + 2 triggers compteurs.
- Bornes 10/200 : CHECK sur household.member_count/item_count, compteurs tenus par triggers DEFINER.
- Prenom copie dans membership.display_name et item.author_name (immuable dans le MVP).
- SQLSTATE LC001..LC009 (table dans ERD §0).

**Why:** ADR-0002 (foyer jamais en parametre) + lecons Signet (superuser contourne RLS, definer sans contexte conclut a tort).
**How to apply:** toute nouvelle table/fonction doit respecter ces invariants ; une 11e fonction definer = amendement ADR-0005. Voir [[rejected-decisions]].
