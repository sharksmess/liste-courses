import { pgSchema } from "drizzle-orm/pg-core";

/** Donnees du foyer (ERD §0). */
export const lc = pgSchema("lc");

/** Tables de better-auth ; aucun acces pour `lc_app` (ADR-0005). */
export const lcAuth = pgSchema("lc_auth");
