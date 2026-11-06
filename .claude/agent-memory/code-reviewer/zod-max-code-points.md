---
name: zod-max-code-points
description: zod 4.6.7 du depot compte .max() en points de code, pas en unites UTF-16 ; faux positif a ne pas re-signaler
metadata:
  type: project
---

Dans ce depot (zod 4.6.7), `z.string().max(n)` mesure en points de code : `.max(100)` accepte 100 emoji.

**Why:** soupcon de 500 sur `output.parse` en relecture de 003, ecarte par execution et par `v4/core/checks.js:272-273`.

**How to apply:** ne pas signaler un ecart emoji sur les contrats de sortie ; reverifier si la version de zod change.
