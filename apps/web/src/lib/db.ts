/**
 * Connexions Postgres (ADR-0002, ADR-0005).
 *
 * - `DATABASE_URL` : role `lc_app`, sans privilege, sans BYPASSRLS. Seule
 *   connexion des requetes applicatives, toujours par `withUser`.
 * - `AUTH_DATABASE_URL` : role `lc_better_auth`, reserve a better-auth
 *   (`lib/auth.ts`), borne aux quatre tables de `lc_auth`.
 *
 * Pools crees au premier usage : `next build` charge les modules sans base.
 */
import pg from "pg";
import type { Pool, PoolClient } from "pg";
import { getServerEnv } from "./env";

const { Pool: PgPool } = pg;

let appPool: Pool | null = null;
let authPool: Pool | null = null;

/**
 * Une connexion inactive qui tombe (redemarrage de Postgres, coupure reseau)
 * emet `error` sur le pool ; sans ecouteur, Node arrete le processus. On
 * journalise le seul SQLSTATE : jamais l'URL, le message (qui peut citer un
 * role ou un hote) ni un secret.
 */
function createPool(connectionString: string, label: "app" | "auth"): Pool {
  const pool = new PgPool({ connectionString });
  pool.on("error", (error: unknown) => {
    console.error(`[db] pool ${label} : connexion inactive perdue (SQLSTATE ${sqlState(error) ?? "absent"})`);
  });
  return pool;
}

function appPoolOf(): Pool {
  appPool ??= createPool(getServerEnv().DATABASE_URL, "app");
  return appPool;
}

export function getAuthPool(): Pool {
  authPool ??= createPool(getServerEnv().AUTH_DATABASE_URL, "auth");
  return authPool;
}

/**
 * Transaction sous `lc_app`, avec `app.user_id` pose en PREMIERE instruction
 * (`set_config(..., true)` = SET LOCAL) depuis l'utilisateur de session, jamais
 * depuis la requete. Il n'existe aucun reglage « foyer » pose par l'application :
 * le foyer est derive de l'utilisateur en base (ADR-0002). COMMIT si `fn`
 * reussit, ROLLBACK sinon.
 */
export async function withUser<T>(userId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await appPoolOf().connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** SQLSTATE d'une erreur `pg`, sans rien lire d'autre de l'erreur. */
export function sqlState(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const { code } = error;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}
