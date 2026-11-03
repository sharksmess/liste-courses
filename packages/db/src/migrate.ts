/**
 * Applique les migrations de `migrations/` (journal Drizzle) avec le migrateur
 * de drizzle-orm. Les migrations generees (`drizzle-kit generate`) et celles
 * ecrites a la main (`drizzle-kit generate --custom` : roles, RLS, fonctions,
 * triggers) sont dans le meme journal et s'appliquent dans l'ordre, dans une
 * seule transaction. L'historique vit dans le schema `drizzle`, hors des
 * schemas applicatifs (ERD §1) ; aucun role applicatif n'y a acces.
 *
 * `DATABASE_URL_MIGRATE` : role d'amorcage (superutilisateur de l'instance
 * locale ou de CI), jamais un role applicatif. Lue dans l'environnement du
 * processus : le globalSetup des tests la pose sur la base de test ; en
 * developpement, l'humain la definit dans son terminal. Aucun fichier .env
 * n'est charge ici.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL_MIGRATE: z
    .string()
    .refine((value) => URL.canParse(value) && /^postgres(ql)?:$/.test(new URL(value).protocol)),
});

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "migrations");

async function main(): Promise<void> {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // Le nom de la variable seulement, jamais sa valeur.
    throw new Error("DATABASE_URL_MIGRATE absente ou mal formee (URL postgresql:// attendue).");
  }
  const client = new pg.Client({ connectionString: parsed.data.DATABASE_URL_MIGRATE });
  await client.connect();
  try {
    await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_DIR });
    process.stdout.write("migrations appliquees\n");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  // Message de Postgres ou du migrateur : aucune URL ni mot de passe n'y figure.
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
