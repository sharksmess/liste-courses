/**
 * Limiteur de debit de better-auth (ADR-0003, patron de l'ADR-0010 de Signet).
 *
 * better-auth ne l'active par defaut qu'en `NODE_ENV=production`. Ici il est
 * toujours actif, sauf une seule combinaison : AUTH_RATE_LIMIT=off ET
 * APP_ENV=test, posee par le serveur de test de l'usine et la CI. Toute autre
 * combinaison avec off, et toute valeur invalide, leve : le serveur refuse de
 * demarrer plutot que d'ouvrir le limiteur. APP_ENV absent vaut production.
 *
 * Fonction pure, sans lecture implicite de process.env (tests/auth/rate-limit.test.ts).
 */
import { z } from "zod";

const rateLimitEnvSchema = z.object({
  AUTH_RATE_LIMIT: z.enum(["on", "off"]).default("on"),
  APP_ENV: z.enum(["test", "development", "production"]).default("production"),
});

/**
 * Inscription : 3 requetes par 10 s et par adresse IP. C'est aussi la regle
 * integree de better-auth, reprise ici pour ne pas dependre d'un defaut de la
 * bibliotheque.
 */
export const SIGN_UP_RATE_LIMIT = { window: 10, max: 3 } as const;

export interface RateLimitOptions {
  enabled: boolean;
  customRules: Record<string, { window: number; max: number }>;
}

export function buildRateLimitOptions(env: Readonly<Record<string, string | undefined>>): RateLimitOptions {
  const parsed = rateLimitEnvSchema.safeParse({ AUTH_RATE_LIMIT: env.AUTH_RATE_LIMIT, APP_ENV: env.APP_ENV });
  if (!parsed.success) {
    // Seules ces deux variables, jamais d'autre entree de l'environnement :
    // aucun secret ne peut fuiter par ce message.
    throw new Error(
      `Configuration du limiteur invalide (AUTH_RATE_LIMIT="${env.AUTH_RATE_LIMIT ?? ""}", ` +
        `APP_ENV="${env.APP_ENV ?? ""}") : AUTH_RATE_LIMIT vaut on|off, APP_ENV vaut test|development|production.`,
    );
  }
  const { AUTH_RATE_LIMIT, APP_ENV } = parsed.data;
  if (AUTH_RATE_LIMIT === "off" && APP_ENV !== "test") {
    throw new Error(
      `AUTH_RATE_LIMIT=off n'est accepte qu'avec APP_ENV=test (APP_ENV=${APP_ENV}). ` +
        `Demarrage refuse plutot que d'ouvrir le limiteur de debit.`,
    );
  }
  return {
    enabled: AUTH_RATE_LIMIT === "on",
    customRules: { "/sign-up/*": { ...SIGN_UP_RATE_LIMIT } },
  };
}
