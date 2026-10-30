/**
 * Acces base des tests de la tranche 001 : vraie base Postgres, jamais de mock.
 *
 * - Connexion d'administration (`testDbUrl()`, superutilisateur) : UNIQUEMENT
 *   pour la remise a zero, l'arrangement et la lecture de verification apres
 *   une action HTTP. Jamais pour prouver un comportement d'isolation (elle
 *   contourne la RLS).
 * - Connexion `TEST_DATABASE_URL_APP` (role `lc_app`) : le role sous lequel
 *   l'application tourne ; toute assertion d'isolation passe par `asApp`.
 *
 * Variables lues : TEST_DATABASE_ADMIN_URL, TEST_DATABASE_NAME,
 * TEST_DATABASE_URL_APP (via tests/_factory/env.ts).
 */
import pg from "pg";
import { loadTestEnv, requireEnv, testDbUrl } from "../_factory/env";

loadTestEnv();

let admin: pg.Pool | null = null;
let app: pg.Pool | null = null;

export function adminPool(): pg.Pool {
  admin ??= new pg.Pool({ connectionString: testDbUrl(), max: 4 });
  return admin;
}

/** URL `lc_app` verifiee : elle doit designer la base de test, pas une autre. */
function appUrl(): string {
  const { TEST_DATABASE_URL_APP, TEST_DATABASE_NAME } = requireEnv(["TEST_DATABASE_URL_APP", "TEST_DATABASE_NAME"]);
  const database = new URL(TEST_DATABASE_URL_APP).pathname.replace(/^\//, "");
  if (database !== TEST_DATABASE_NAME) {
    throw new Error(`[tests] TEST_DATABASE_URL_APP designe la base "${database}", pas la base de test "${TEST_DATABASE_NAME}".`);
  }
  return TEST_DATABASE_URL_APP;
}

export function appPool(): pg.Pool {
  app ??= new pg.Pool({ connectionString: appUrl(), max: 4 });
  return app;
}

export async function closePools(): Promise<void> {
  await Promise.all([admin?.end(), app?.end()]);
  admin = null;
  app = null;
}

/** Remise a zero entre fichiers de test (TRUNCATE ne declenche pas les triggers de ligne). */
export async function resetDatabase(): Promise<void> {
  await adminPool().query(
    "TRUNCATE TABLE lc.invite_code, lc.membership, lc.household, " +
      "lc_auth.session, lc_auth.account, lc_auth.verification, lc_auth.app_user CASCADE",
  );
}

export function pgCode(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "code" in e) {
    const { code } = e;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

/**
 * Transaction sous `lc_app` avec `app.user_id` pose comme le fait la couche
 * applicative (`set_config(..., true)` = SET LOCAL). `userId` :
 *  - une chaine : posee telle quelle (y compris la chaine vide) ;
 *  - `undefined` : le reglage n'est jamais pose (scenario « SET LOCAL oublie »).
 * La transaction est toujours annulee : aucun effet ne persiste.
 * Verifie d'abord que la session est bien `lc_app` : un test d'isolation
 * execute sous un autre role passerait toujours.
 */
export async function asApp<T>(userId: string | undefined, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await appPool().connect();
  try {
    await client.query("BEGIN");
    const who = await client.query<{ u: string; super: string; bypass: boolean }>(
      "SELECT current_user AS u, current_setting('is_superuser') AS super, " +
        "(SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass",
    );
    const row = who.rows[0];
    if (row?.u !== "lc_app" || row.super !== "off" || row.bypass !== false) {
      throw new Error(`[tests] la connexion applicative n'est pas lc_app sans privilege : ${JSON.stringify(row)}`);
    }
    if (userId !== undefined) await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    return await fn(client);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

export type Attempt = { ok: true; rowCount: number } | { ok: false; code: string | undefined };

/** Execute une instruction qui peut etre refusee, sans casser la transaction (SAVEPOINT). */
export async function attempt(client: pg.PoolClient, sql: string, params: unknown[] = []): Promise<Attempt> {
  await client.query("SAVEPOINT attempt");
  try {
    const r = await client.query(sql, params);
    await client.query("RELEASE SAVEPOINT attempt");
    return { ok: true, rowCount: r.rowCount ?? 0 };
  } catch (e) {
    await client.query("ROLLBACK TO SAVEPOINT attempt");
    return { ok: false, code: pgCode(e) };
  }
}

/** Une ecriture est « bloquee » si elle est refusee (42501) ou ne touche aucune ligne. */
export function isBlocked(a: Attempt): boolean {
  return a.ok ? a.rowCount === 0 : a.code === "42501";
}

export function describeAttempt(label: string, a: Attempt): string {
  return a.ok ? `${label} : acceptee, ${a.rowCount} ligne(s) touchee(s)` : `${label} : refusee, SQLSTATE ${a.code ?? "inconnu"}`;
}
