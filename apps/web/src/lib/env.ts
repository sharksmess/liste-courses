/**
 * Environnement du serveur, valide par un schema Zod (CLAUDE.md : toute entree
 * externe). Fonction pure `parseServerEnv` ; `getServerEnv` la memorise pour le
 * processus. Appelee aussi par `next.config.ts` : une variable absente ou mal
 * formee refuse le demarrage (`next dev`, `next build`, `next start`).
 *
 * Les messages ne citent que des NOMS de variables, jamais une valeur.
 * Imports relatifs seulement : le module est charge hors de Next (config).
 */
import { z } from "zod";
import { buildRateLimitOptions } from "./auth-rate-limit";

const postgresUrl = z
  .string()
  .refine((value) => URL.canParse(value) && /^postgres(ql)?:$/.test(new URL(value).protocol));

const httpUrl = z.string().refine((value) => URL.canParse(value) && /^https?:$/.test(new URL(value).protocol));

const serverEnvSchema = z.object({
  APP_ENV: z.enum(["test", "development", "production"]).default("production"),
  /** Role `lc_app` (ADR-0005) : toutes les requetes applicatives. */
  DATABASE_URL: postgresUrl,
  /** Role `lc_better_auth` : better-auth seul, quatre tables de `lc_auth`. */
  AUTH_DATABASE_URL: postgresUrl,
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: httpUrl,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function parseServerEnv(raw: Readonly<Record<string, string | undefined>>): ServerEnv {
  const parsed = serverEnvSchema.safeParse({
    APP_ENV: raw.APP_ENV,
    DATABASE_URL: raw.DATABASE_URL,
    AUTH_DATABASE_URL: raw.AUTH_DATABASE_URL,
    BETTER_AUTH_SECRET: raw.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: raw.BETTER_AUTH_URL,
  });
  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "(environnement)"))];
    throw new Error(`Environnement du serveur invalide, demarrage refuse : ${names.join(", ")} absente(s) ou mal formee(s).`);
  }
  // Le limiteur est valide en meme temps : une combinaison interdite refuse le demarrage.
  buildRateLimitOptions(raw);
  return parsed.data;
}

let cached: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
