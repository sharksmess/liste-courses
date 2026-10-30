/**
 * Foyer, appartenance et code d'invitation, schema `lc` (ERD §3.2 a §3.4).
 * RLS, triggers, fonctions et privileges : migration ecrite a la main 0004.
 */
import { sql } from "drizzle-orm";
import { check, index, integer, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appUser } from "./auth";
import { lc } from "./schemas";

const uuidv7 = sql`lc.uuidv7()`;

export const household = lc.table(
  "household",
  {
    id: uuid("id").primaryKey().default(uuidv7),
    name: text("name").notNull(),
    /** Tenu par trigger (ERD §4.9) ; seule borne de 10 membres en base. */
    memberCount: integer("member_count").notNull().default(0),
    /** Tenu par trigger (tranche 003) ; seule borne de 200 articles en base. */
    itemCount: integer("item_count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("household_name_check", sql`char_length(${t.name}) BETWEEN 1 AND 50 AND ${t.name} !~ '^[[:space:]]|[[:space:]]$'`),
    check("household_member_count_nonneg", sql`${t.memberCount} >= 0`),
    check("household_member_limit", sql`${t.memberCount} <= 10`),
    check("household_item_count_nonneg", sql`${t.itemCount} >= 0`),
    check("household_item_limit", sql`${t.itemCount} <= 200`),
  ],
);

export const membership = lc.table(
  "membership",
  {
    id: uuid("id").primaryKey().default(uuidv7),
    householdId: uuid("household_id")
      .notNull()
      .references(() => household.id, { onDelete: "restrict" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    /** Copie du prenom a l'entree dans le foyer (ADR-0005, partie 3). */
    displayName: text("display_name").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("membership_user_key").on(t.userId),
    uniqueIndex("membership_one_owner_idx").on(t.householdId).where(sql`role = 'owner'`),
    index("membership_household_idx").on(t.householdId, t.joinedAt),
    check("membership_role_check", sql`${t.role} IN ('owner', 'member')`),
    check(
      "membership_display_name_check",
      sql`char_length(${t.displayName}) BETWEEN 1 AND 30 AND ${t.displayName} !~ '^[[:space:]]|[[:space:]]$'`,
    ),
  ],
);

export const inviteCode = lc.table(
  "invite_code",
  {
    householdId: uuid("household_id")
      .primaryKey()
      .references(() => household.id, { onDelete: "restrict" }),
    /** Forme normalisee : 10 caracteres de l'alphabet de Crockford (ADR-0004). */
    code: text("code").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invite_code_code_key").on(t.code),
    check("invite_code_format", sql`${t.code} ~ '^[0-9A-HJKMNP-TV-Z]{10}$'`),
  ],
);
