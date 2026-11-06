/**
 * Article de la liste du foyer, schema `lc` (ERD §3.5). RLS, privileges, trigger
 * de compteur et `lc.add_item` : migration ecrite a la main 0007.
 */
import { sql } from "drizzle-orm";
import { boolean, check, index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { appUser } from "./auth";
import { household } from "./household";
import { lc } from "./schemas";

export const item = lc.table(
  "item",
  {
    id: uuid("id").primaryKey().default(sql`lc.uuidv7()`),
    householdId: uuid("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    /** NULL autorise : quantite absente (US-07.3), seule representation de l'absence. */
    quantity: text("quantity"),
    purchased: boolean("purchased").notNull().default(false),
    authorUserId: uuid("author_user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "restrict" }),
    /** Copie du prenom a l'ajout (ADR-0005, partie 3) : survit au depart de l'auteur. */
    authorName: text("author_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("item_household_order_idx").on(t.householdId, t.createdAt, t.id),
    check("item_name_check", sql`char_length(${t.name}) BETWEEN 1 AND 100 AND ${t.name} !~ '^[[:space:]]|[[:space:]]$'`),
    check(
      "item_quantity_check",
      sql`${t.quantity} IS NULL OR (char_length(${t.quantity}) BETWEEN 1 AND 30 AND ${t.quantity} !~ '^[[:space:]]|[[:space:]]$')`,
    ),
    check(
      "item_author_name_check",
      sql`char_length(${t.authorName}) BETWEEN 1 AND 30 AND ${t.authorName} !~ '^[[:space:]]|[[:space:]]$'`,
    ),
  ],
);
