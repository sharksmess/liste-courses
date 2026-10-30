import { defineConfig } from "drizzle-kit";

/**
 * `drizzle-kit generate` n'ouvre aucune connexion : il compare le schema
 * TypeScript a l'historique local (`migrations/meta`). Les migrations sont
 * appliquees par `src/migrate.ts` (migrateur de drizzle-orm), jamais par
 * `drizzle-kit migrate` ni `push`.
 *
 * Les roles, politiques RLS, fonctions et triggers sont ecrits a la main dans
 * des migrations `drizzle-kit generate --custom`, numerotees dans le meme
 * journal (ERD, en-tete).
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  schemaFilter: ["lc", "lc_auth"],
});
