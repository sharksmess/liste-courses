/**
 * Tables de better-auth, schema `lc_auth` (ERD §3.1). Les noms de proprietes
 * TypeScript sont ceux des champs better-auth (`emailVerified`, `userId`...) :
 * l'adaptateur Drizzle de better-auth les retrouve sans table de correspondance.
 * Les colonnes SQL restent en snake_case.
 *
 * Identifiants : `DEFAULT lc.uuidv7()`, generes par la base ; better-auth est
 * configure pour ne pas les generer (apps/web/src/lib/auth.ts).
 * RLS, privileges et proprietaire : migration ecrite a la main 0003.
 */
import { sql } from "drizzle-orm";
import { boolean, check, index, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { lcAuth } from "./schemas";

const uuidv7 = sql`lc.uuidv7()`;
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const appUser = lcAuth.table(
  "app_user",
  {
    id: uuid("id").primaryKey().default(uuidv7),
    /** Prenom d'affichage (D-009), trime, 1 a 30 points de code. */
    name: text("name").notNull(),
    /** Stockee en minuscules (Q-3) : l'unicite simple est insensible a la casse. */
    email: text("email").notNull(),
    /** Exige par better-auth ; toujours false (aucune verification, PRD). */
    emailVerified: boolean("email_verified").notNull().default(false),
    /** NULL autorise : champ du modele better-auth, jamais renseigne (aucun avatar). */
    image: text("image"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("app_user_email_key").on(t.email),
    check("app_user_name_check", sql`char_length(${t.name}) BETWEEN 1 AND 30 AND ${t.name} !~ '^[[:space:]]|[[:space:]]$'`),
    check("app_user_email_length_check", sql`char_length(${t.email}) <= 254`),
    check("app_user_email_lower_check", sql`${t.email} = lower(${t.email})`),
  ],
);

export const session = lcAuth.table(
  "session",
  {
    id: uuid("id").primaryKey().default(uuidv7),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    /** NULL autorise : better-auth ne le renseigne pas selon le transport. */
    ipAddress: text("ip_address"),
    /** NULL autorise : idem. */
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("session_token_key").on(t.token), index("session_user_idx").on(t.userId)],
);

export const account = lcAuth.table(
  "account",
  {
    id: uuid("id").primaryKey().default(uuidv7),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    /** NULL autorise : empreinte du fournisseur `credential`, NULL pour un fournisseur externe (aucun dans le MVP). */
    password: text("password"),
    /** NULL autorise : champs OAuth du modele better-auth, jamais renseignes (pas de SSO). */
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    scope: text("scope"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("account_provider_key").on(t.providerId, t.accountId), index("account_user_idx").on(t.userId)],
);

export const verification = lcAuth.table(
  "verification",
  {
    id: uuid("id").primaryKey().default(uuidv7),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);
