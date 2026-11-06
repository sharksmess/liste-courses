/**
 * Helpers de la tranche 002 : adhesion par code, lecture et regeneration du
 * code, arrangements par l'API reelle, et deux connexions `lc_app` qui
 * COMMITENT reellement (pour la concurrence deterministe de l'AC3).
 *
 * Marqueurs d'ecran imposes a l'implementeur (HTML rendu, D-053) :
 *   data-testid="invite-code"             element portant le code affiche (XXXXX-XXXXX), /household de la responsable seule
 *   data-testid="regenerate-invite-code"  bouton de regeneration, /household de la responsable seule
 *   name="code"                           champ de saisie du formulaire « rejoindre », /no-household
 *   data-testid="join-household-form"     formulaire « rejoindre » (et lui seul : le formulaire « creer » n'a pas ce marqueur)
 *
 * Routes lues depuis les contrats (docs/02-architecture/api-contracts/), jamais recopiees.
 * Variables lues (via tests/helpers/db.ts) : TEST_DATABASE_ADMIN_URL, TEST_DATABASE_NAME, TEST_DATABASE_URL_APP.
 */
import type pg from "pg";
import { getInviteCode, regenerateInviteCode } from "../../docs/02-architecture/api-contracts/invite-code";
import { joinHousehold } from "../../docs/02-architecture/api-contracts/household";
import { createAccount, getJson, postJson, type Account } from "./auth";
import { adminPool, appPool } from "./db";
import { accountWithHousehold, householdById, membershipsOfUser, inviteCodeOf, type Fixture } from "./household";
import { expectStatus, type HttpResult } from "./http";

export function postJoin(code: unknown, cookie?: string): Promise<HttpResult> {
  return postJson(joinHousehold.route, { code }, { cookie });
}

/** POST /api/household/join avec un corps brut (corps absent, non JSON, etc.). */
export function postJoinRaw(rawBody: string, cookie?: string): Promise<HttpResult> {
  return postJson(joinHousehold.route, rawBody, { cookie });
}

export function getCode(cookie?: string): Promise<HttpResult> {
  return getJson(getInviteCode.route, cookie);
}

export function postRegenerate(cookie?: string): Promise<HttpResult> {
  return postJson(regenerateInviteCode.route, {}, { cookie });
}

/** Forme affichee d'un code stocke (10 caracteres) : XXXXX-XXXXX. */
export function displayed(stored: string): string {
  return `${stored.slice(0, 5)}-${stored.slice(5)}`;
}

/** Codes bien formes (alphabet de Crockford) que nul foyer de test ne porte, a collision negligeable pres. */
export const UNKNOWN_CODE = "ZZZZZ-ZZZZZ";

export async function householdIdOf(userId: string): Promise<string> {
  const id = (await membershipsOfUser(userId))[0]?.household_id;
  if (!id) throw new Error(`[tests] le compte ${userId} n'a aucune appartenance`);
  return id;
}

export interface Home extends Fixture {
  householdId: string;
  /** Code stocke (10 caracteres), lu par l'administration. */
  code: string;
}

/** Foyer reel (API) avec sa responsable, son identifiant et son code stocke. */
export async function home(tag: string): Promise<Home> {
  const f = await accountWithHousehold(tag);
  const householdId = await householdIdOf(f.account.userId);
  const code = await inviteCodeOf(householdId);
  if (!code) throw new Error(`[tests] le foyer ${tag} n'a pas de code`);
  return { ...f, householdId, code };
}

/** Compte neuf qui rejoint le foyer par l'API reelle (echoue avec le vrai statut et le corps brut). */
export async function joinedMember(h: Home, name = "Membre"): Promise<Account> {
  const account = await createAccount({ name });
  expectStatus(await postJoin(displayed(h.code), account.cookie), 200, `adhesion de ${name}`);
  return account;
}

/** Amene le foyer a `target` membres par l'API reelle (adhesions sequentielles). */
export async function fillHome(h: Home, target: number): Promise<Account[]> {
  const members: Account[] = [];
  const current = (await householdById(h.householdId))?.member_count ?? 0;
  for (let i = current; i < target; i += 1) members.push(await joinedMember(h, `Membre${i}`));
  return members;
}

/** Reconciliation : member_count = nombre de lignes membership de CE foyer. */
export async function memberCountOf(householdId: string): Promise<{ counter: number; rows: number }> {
  const r = await adminPool().query<{ counter: number; rows: string }>(
    "SELECT h.member_count AS counter, (SELECT count(*) FROM lc.membership m WHERE m.household_id = h.id) AS rows " +
      "FROM lc.household h WHERE h.id = $1",
    [householdId],
  );
  const row = r.rows[0];
  if (!row) throw new Error(`[tests] foyer ${householdId} introuvable`);
  return { counter: row.counter, rows: Number(row.rows) };
}

export async function issuedAtOf(householdId: string): Promise<Date> {
  const r = await adminPool().query<{ issued_at: Date }>("SELECT issued_at FROM lc.invite_code WHERE household_id = $1", [householdId]);
  const d = r.rows[0]?.issued_at;
  if (!d) throw new Error(`[tests] pas de code pour le foyer ${householdId}`);
  return d;
}

// ---------------------------------------------------------------------------
// Transactions lc_app qui commitent (asApp annule toujours)
// ---------------------------------------------------------------------------

export interface AppTx {
  client: pg.PoolClient;
  pid: number;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
}

/**
 * Ouvre une transaction sous `lc_app` (verifie : ni superutilisateur ni
 * BYPASSRLS), pose `app.user_id` (`userId`) et rend les commandes de fin.
 * L'appelant DOIT appeler `release()` dans un `finally`.
 */
export async function openAppTx(userId: string): Promise<AppTx> {
  const client = await appPool().connect();
  try {
    await client.query("BEGIN");
    const who = await client.query<{ u: string; super: string; bypass: boolean; pid: number }>(
      "SELECT current_user AS u, current_setting('is_superuser') AS super, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass, pg_backend_pid() AS pid",
    );
    const row = who.rows[0];
    if (row?.u !== "lc_app" || row.super !== "off" || row.bypass !== false) {
      throw new Error(`[tests] la connexion applicative n'est pas lc_app sans privilege : ${JSON.stringify(row)}`);
    }
    await client.query("SELECT set_config('app.user_id', $1, true)", [userId]);
    let done = false;
    return {
      client,
      pid: row.pid,
      async commit() {
        if (done) return;
        done = true;
        await client.query("COMMIT");
      },
      async rollback() {
        if (done) return;
        done = true;
        await client.query("ROLLBACK").catch(() => undefined);
      },
      release() {
        client.release();
      },
    };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    throw e;
  }
}

/**
 * Attend (sondage court, borne) que la session `pid` soit bloquee sur un verrou,
 * vu de l'administration. Rend l'etat observe ; echoue avec cet etat au delai.
 */
export async function waitUntilBlockedOnLock(pid: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = "aucune ligne dans pg_stat_activity";
  while (Date.now() < deadline) {
    const r = await adminPool().query<{ wait_event_type: string | null; wait_event: string | null; state: string; query: string }>(
      "SELECT wait_event_type, wait_event, state, left(query, 120) AS query FROM pg_stat_activity WHERE pid = $1",
      [pid],
    );
    const row = r.rows[0];
    if (row) {
      last = JSON.stringify(row);
      if (row.wait_event_type === "Lock") return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`[tests] la session ${pid} n'est pas bloquee sur un verrou apres ${timeoutMs} ms ; dernier etat : ${last}`);
}

/** Observe la promesse sans la laisser en rejet non gere ; rend son issue. */
export type Settled<T> = { status: "fulfilled"; value: T } | { status: "rejected"; reason: unknown };
export function settle<T>(p: Promise<T>): Promise<Settled<T>> {
  return p.then(
    (value): Settled<T> => ({ status: "fulfilled", value }),
    (reason: unknown): Settled<T> => ({ status: "rejected", reason }),
  );
}
