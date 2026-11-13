/**
 * AC9 (tranche 004) : garanties de la base pour lc.remove_member et
 * lc.leave_household (ADR-0005, ERD §1, §3.3, §4.1, §4.6, §4.7, §7). Les appels
 * passent par `asApp` (role `lc_app`, transaction annulee). Le catalogue est lu
 * par l'administration. Foyers crees par l'API reelle.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Account } from "../helpers/auth";
import { createAccount } from "../helpers/auth";
import { adminPool, asApp, closePools, pgCode, resetDatabase } from "../helpers/db";
import { membershipsOfUser } from "../helpers/household";
import { home, joinedMember, memberCountOf, openAppTx, type Home } from "../helpers/invite";
import { membershipIdOf } from "../helpers/members";

let H: Home;
let M1: Account;
let M2: Account;
let OTHER: Home;
let OTHER_MEMBER: Account;
let idOwner: string;
let idM1: string;
let idM2: string;
let idOtherMember: string;

beforeAll(async () => {
  await resetDatabase();
  H = await home("MF");
  M1 = await joinedMember(H, "MembreUn");
  M2 = await joinedMember(H, "MembreDeux");
  OTHER = await home("MG");
  OTHER_MEMBER = await joinedMember(OTHER, "AutreFoyer");
  idOwner = await membershipIdOf(H.account.userId);
  idM1 = await membershipIdOf(M1.userId);
  idM2 = await membershipIdOf(M2.userId);
  idOtherMember = await membershipIdOf(OTHER_MEMBER.userId);
});
afterAll(closePools);

interface Failure {
  code: string | undefined;
  message: string;
}

async function failure(c: pg.PoolClient, sql: string, params: unknown[] = []): Promise<Failure> {
  await c.query("SAVEPOINT f");
  try {
    await c.query(sql, params);
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT f");
    return { code: pgCode(e), message: e instanceof Error ? e.message : String(e) };
  }
  await c.query("RELEASE SAVEPOINT f");
  throw new Error(`[tests] l'instruction devait lever : ${sql}`);
}

async function contextHousehold(c: pg.PoolClient): Promise<string | null> {
  const r = await c.query<{ h: string | null }>("SELECT nullif(current_setting('app.household_id', true), '') AS h");
  return r.rows[0]?.h ?? null;
}

async function rowsOf(c: pg.PoolClient, householdId: string): Promise<{ n: number; counter: number }> {
  const r = await c.query<{ n: string; counter: number }>(
    "SELECT (SELECT count(*) FROM lc.membership WHERE household_id = $1) AS n, (SELECT member_count FROM lc.household WHERE id = $1) AS counter",
    [householdId],
  );
  return { n: Number(r.rows[0]?.n), counter: r.rows[0]?.counter ?? -1 };
}

const SENTINEL = "00000000-0000-4000-8000-00000000dead";
const FUNCTIONS = ["lc.remove_member(uuid)", "lc.leave_household()"];

describe("AC9 : catalogue des fonctions", () => {
  it.each(FUNCTIONS)("AC9 : %s est SECURITY DEFINER, a lc_definer, avec un search_path fixe", async (signature) => {
    const r = await adminPool().query<{ prosecdef: boolean; owner: string; proconfig: string[] | null }>(
      "SELECT prosecdef, pg_get_userbyid(proowner) AS owner, proconfig FROM pg_proc WHERE oid = to_regprocedure($1)",
      [signature],
    );
    expect(r.rowCount, `${signature} doit exister`).toBe(1);
    expect(r.rows[0]?.prosecdef).toBe(true);
    expect(r.rows[0]?.owner).toBe("lc_definer");
    const path = r.rows[0]?.proconfig?.find((s) => s.startsWith("search_path="));
    expect(path, `proconfig de ${signature} : ${JSON.stringify(r.rows[0]?.proconfig)}`).toBeDefined();
    expect(path?.endsWith("pg_temp"), `pg_temp doit etre en dernier : ${path}`).toBe(true);
  });

  it.each(FUNCTIONS)("AC9 : %s n'est executable ni par PUBLIC ni par lc_better_auth, mais l'est par lc_app", async (signature) => {
    const r = await adminPool().query<{ pub: boolean; app: boolean; auth: boolean }>(
      `SELECT has_function_privilege('public', to_regprocedure($1), 'EXECUTE') AS pub,
              has_function_privilege('lc_app', to_regprocedure($1), 'EXECUTE') AS app,
              has_function_privilege('lc_better_auth', to_regprocedure($1), 'EXECUTE') AS auth`,
      [signature],
    );
    expect(r.rows[0]).toEqual({ pub: false, app: true, auth: false });
  });
});

describe("AC9 : sans identite", () => {
  it("AC9 : sans app.user_id (absent ou vide), chaque fonction leve LC001", async () => {
    for (const userId of [undefined, ""]) {
      await asApp(userId, async (c) => {
        expect((await failure(c, "SELECT lc.remove_member($1)", [idM1])).code).toBe("LC001");
        expect((await failure(c, "SELECT lc.leave_household()")).code).toBe("LC001");
      });
    }
  });
});

describe("AC9 : lc.remove_member", () => {
  it("AC9 : un compte sans foyer leve LC009", async () => {
    const lonely = await createAccount({ name: "Seul" });
    await asApp(lonely.userId, async (c) => {
      expect((await failure(c, "SELECT lc.remove_member($1)", [idM1])).code).toBe("LC009");
    });
  });

  it("AC9 : un appelant membre leve LC005, sans ecriture", async () => {
    await asApp(M1.userId, async (c) => {
      const before = await rowsOf(c, H.householdId);
      expect((await failure(c, "SELECT lc.remove_member($1)", [idM2])).code).toBe("LC005");
      expect((await failure(c, "SELECT lc.remove_member($1)", [idOwner])).code).toBe("LC005");
      expect((await failure(c, "SELECT lc.remove_member($1)", [crypto.randomUUID()])).code).toBe("LC005");
      expect(await rowsOf(c, H.householdId)).toEqual(before);
    });
  });

  it("AC9 : la responsable qui vise sa propre ligne leve LC007, sans ecriture", async () => {
    await asApp(H.account.userId, async (c) => {
      const before = await rowsOf(c, H.householdId);
      expect((await failure(c, "SELECT lc.remove_member($1)", [idOwner])).code).toBe("LC007");
      expect(await rowsOf(c, H.householdId)).toEqual(before);
    });
  });

  it("AC9 : une cible inexistante, deja partie ou d'un autre foyer leve LC006", async () => {
    const gone = await joinedMember(H, "DejaParti");
    const goneId = await membershipIdOf(gone.userId);
    await adminPool().query("DELETE FROM lc.membership WHERE id = $1", [goneId]);
    await asApp(H.account.userId, async (c) => {
      expect((await failure(c, "SELECT lc.remove_member($1)", [crypto.randomUUID()])).code, "inexistante").toBe("LC006");
      expect((await failure(c, "SELECT lc.remove_member($1)", [goneId])).code, "deja partie").toBe("LC006");
      expect((await failure(c, "SELECT lc.remove_member($1)", [idOtherMember])).code, "autre foyer").toBe("LC006");
    });
    expect(await memberCountOf(OTHER.householdId)).toEqual({ counter: 2, rows: 2 });
  });

  it("AC9 : le retrait reussit pour la responsable, decremente member_count, et app.household_id est vide apres (meme force)", async () => {
    await asApp(H.account.userId, async (c) => {
      await c.query("SELECT set_config('app.household_id', $1, true)", [SENTINEL]);
      const before = await rowsOf(c, H.householdId);
      await c.query("SELECT lc.remove_member($1)", [idM2]);
      expect(await rowsOf(c, H.householdId)).toEqual({ n: before.n - 1, counter: before.counter - 1 });
      expect(await contextHousehold(c)).toBeNull();
    });
  });

  it("AC9 : apres une erreur rattrapee (LC005, LC006, LC007), app.household_id est vide", async () => {
    await asApp(M1.userId, async (c) => {
      await failure(c, "SELECT lc.remove_member($1)", [idM2]);
      expect(await contextHousehold(c)).toBeNull();
    });
    await asApp(H.account.userId, async (c) => {
      await failure(c, "SELECT lc.remove_member($1)", [crypto.randomUUID()]);
      expect(await contextHousehold(c)).toBeNull();
      await failure(c, "SELECT lc.remove_member($1)", [idOwner]);
      expect(await contextHousehold(c)).toBeNull();
    });
  });
});

describe("AC9 : lc.leave_household", () => {
  it("AC9 : un compte sans foyer leve LC009", async () => {
    const lonely = await createAccount({ name: "Seul" });
    await asApp(lonely.userId, async (c) => {
      expect((await failure(c, "SELECT lc.leave_household()")).code).toBe("LC009");
    });
  });

  it("AC9 : la responsable leve LC007, sans ecriture", async () => {
    await asApp(H.account.userId, async (c) => {
      const before = await rowsOf(c, H.householdId);
      expect((await failure(c, "SELECT lc.leave_household()")).code).toBe("LC007");
      expect(await rowsOf(c, H.householdId)).toEqual(before);
      expect(await contextHousehold(c)).toBeNull();
    });
    expect(await membershipsOfUser(H.account.userId)).toHaveLength(1);
  });

  it("AC9 : un membre part, member_count baisse de 1 (constate par l'administration apres COMMIT), et app.household_id est vide apres (meme force)", async () => {
    const leaver = await joinedMember(H, "PartiDedie");
    const before = await memberCountOf(H.householdId);
    expect(before.counter).toBe(before.rows);
    const tx = await openAppTx(leaver.userId);
    try {
      await tx.client.query("SELECT set_config('app.household_id', $1, true)", [SENTINEL]);
      await tx.client.query("SELECT lc.leave_household()");
      expect(await contextHousehold(tx.client)).toBeNull();
      await tx.commit();
    } finally {
      await tx.rollback();
      tx.release();
    }
    expect(await membershipsOfUser(leaver.userId)).toEqual([]);
    expect(await memberCountOf(H.householdId)).toEqual({ counter: before.counter - 1, rows: before.rows - 1 });
  });
});

describe("AC9 : la responsable ne part jamais", () => {
  it("AC9 : un DELETE direct de la ligne owner sous un role qui passe outre la RLS leve LC007", async () => {
    const client = await adminPool().connect();
    try {
      await client.query("BEGIN");
      const who = await client.query<{ s: string }>("SELECT current_setting('is_superuser') AS s");
      expect(who.rows[0]?.s, "controle : le role de ce test passe outre la RLS").toBe("on");
      await expect(client.query("DELETE FROM lc.membership WHERE id = $1", [idOwner])).rejects.toMatchObject({ code: "LC007" });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
    expect(await membershipsOfUser(H.account.userId)).toHaveLength(1);
  });
});

describe("AC9 : droits et messages", () => {
  it("AC9 : lc_app n'a aucun droit d'ecriture sur lc.membership (table et colonnes), ni en pratique", async () => {
    const r = await adminPool().query<{ k: string; v: boolean }>(
      `SELECT 'table ' || p AS k, has_table_privilege('lc_app', 'lc.membership', p) AS v FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) AS p
       UNION ALL
       SELECT 'colonne ' || c, has_column_privilege('lc_app', 'lc.membership', c, 'UPDATE') FROM unnest(ARRAY['id','household_id','user_id','role','display_name','joined_at']) AS c`,
    );
    expect(r.rowCount).toBe(10);
    expect(r.rows.filter((x) => x.v).map((x) => x.k)).toEqual([]);
    await asApp(H.account.userId, async (c) => {
      expect((await failure(c, "DELETE FROM lc.membership WHERE id = $1", [idM1])).code).toBe("42501");
      expect((await failure(c, "UPDATE lc.membership SET role = 'owner' WHERE id = $1", [idM1])).code).toBe("42501");
    });
  });

  it("AC9 : aucun message d'erreur des fonctions ne contient un nom ou un identifiant de foyer", async () => {
    const secrets = [H.householdId, H.householdName, OTHER.householdId, OTHER.householdName];
    const failures: Failure[] = [];
    const lonely = await createAccount({ name: "Seul" });
    await asApp(undefined, async (c) => {
      failures.push(await failure(c, "SELECT lc.remove_member($1)", [idOtherMember]));
      failures.push(await failure(c, "SELECT lc.leave_household()"));
    });
    await asApp(lonely.userId, async (c) => {
      failures.push(await failure(c, "SELECT lc.remove_member($1)", [idOtherMember]));
      failures.push(await failure(c, "SELECT lc.leave_household()"));
    });
    await asApp(M2.userId, async (c) => {
      failures.push(await failure(c, "SELECT lc.remove_member($1)", [idOtherMember]));
    });
    await asApp(H.account.userId, async (c) => {
      failures.push(await failure(c, "SELECT lc.remove_member($1)", [idOtherMember]));
      failures.push(await failure(c, "SELECT lc.remove_member($1)", [idOwner]));
      failures.push(await failure(c, "SELECT lc.leave_household()"));
    });
    expect(failures.map((f) => f.code)).toEqual(["LC001", "LC001", "LC009", "LC009", "LC005", "LC006", "LC007", "LC007"]);
    for (const f of failures) for (const s of secrets) expect(f.message).not.toContain(s);
  });
});
