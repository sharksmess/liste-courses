/**
 * Configuration better-auth (ADR-0003, ERD §3.1).
 *
 * - E-mail et mot de passe seulement, bornes 8 et 128 ecrites ici. Aucune
 *   verification d'adresse, aucune fonction d'envoi de courrier : les routes de
 *   reinitialisation et de verification sont en plus desactivees (404).
 * - Tables dans le schema `lc_auth` (schema Drizzle `@lc/db/schema`, noms
 *   qualifies) ; table utilisateur `app_user`.
 * - Identifiants : `generateId: "uuid"` avec l'adaptateur Drizzle pg, better-auth
 *   n'envoie pas d'id et la base le genere (`DEFAULT lc.uuidv7()`).
 * - Connexion `lc_better_auth` dediee (`AUTH_DATABASE_URL`).
 * - Prenom : schema du contrat `signUp` (trim, 1 a 30 points de code) applique
 *   par un hook avant la creation ; c'est la valeur trimee qui est enregistree.
 * - Prenom non modifiable (D-009) : `/update-user` est desactive.
 * - Limiteur : `buildRateLimitOptions` (actif sauf APP_ENV=test et off).
 * - Controle d'origine : celui de better-auth, laisse actif (origine de
 *   BETTER_AUTH_URL seule admise).
 *
 * Instance creee au premier appel : `next build` charge les modules sans
 * environnement d'execution.
 */
import { account, appUser, session, verification } from "@lc/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzle } from "drizzle-orm/node-postgres";
import { buildRateLimitOptions } from "./auth-rate-limit";
import { signUp } from "./contracts";
import { getAuthPool } from "./db";
import { getServerEnv } from "./env";

/**
 * Routes de better-auth que l'application n'expose pas (PRD : ni modification
 * de profil, d'adresse ou de mot de passe, ni recuperation, ni verification,
 * ni suppression de compte, ni fournisseur externe).
 */
const DISABLED_PATHS = [
  "/update-user",
  "/change-email",
  "/change-password",
  "/delete-user",
  "/delete-user/callback",
  "/request-password-reset",
  "/reset-password",
  "/send-verification-email",
  "/verify-email",
  "/sign-in/social",
  "/link-social",
  "/unlink-account",
  "/get-access-token",
  "/refresh-token",
  "/update-session",
];

const signUpName = signUp.input.shape.name;

/**
 * Hook avant la route d'inscription : le prenom passe par le schema du contrat
 * (trim, 1 a 30 points de code). Refus : 422 VALIDATION_FAILED, aucune ligne
 * creee. Accepte : la valeur trimee remplace celle du corps.
 */
function normalizeSignUpName(path: string, body: unknown): { context: { body: Record<string, unknown> } } | undefined {
  if (path !== "/sign-up/email") return undefined;
  const fields: Record<string, unknown> = typeof body === "object" && body !== null ? { ...body } : {};
  const parsed = signUpName.safeParse(fields.name);
  if (!parsed.success) {
    throw new APIError("UNPROCESSABLE_ENTITY", {
      code: "VALIDATION_FAILED",
      message: "Le prenom doit faire de 1 a 30 caracteres, espaces de bord retires.",
    });
  }
  return { context: { body: { ...fields, name: parsed.data } } };
}

function createAuth() {
  const env = getServerEnv();
  const db = drizzle(getAuthPool(), { schema: { app_user: appUser, session, account, verification } });
  return betterAuth({
    appName: "Liste de courses",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { app_user: appUser, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      requireEmailVerification: false,
      autoSignIn: true,
    },
    user: {
      modelName: "app_user",
    },
    disabledPaths: DISABLED_PATHS,
    rateLimit: { ...buildRateLimitOptions(process.env), storage: "memory" },
    advanced: {
      database: { generateId: "uuid" },
    },
    hooks: {
      before: createAuthMiddleware((ctx) => Promise.resolve().then(() => normalizeSignUpName(ctx.path, ctx.body))),
    },
  });
}

type Auth = ReturnType<typeof createAuth>;

let instance: Auth | null = null;

export function getAuth(): Auth {
  instance ??= createAuth();
  return instance;
}

export interface SessionUser {
  id: string;
  name: string;
}

/** Utilisateur de la session de la requete, ou null (absente, expiree, fermee). */
export async function getSessionUser(headers: Headers): Promise<SessionUser | null> {
  const result = await getAuth().api.getSession({ headers });
  if (!result) return null;
  return { id: result.user.id, name: result.user.name };
}
