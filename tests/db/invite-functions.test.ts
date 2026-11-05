/**
 * AC9 (tranche 002) : garanties de la base pour lc.join_household,
 * lc.get_invite_code et lc.regenerate_invite_code (ADR-0005, ERD §4.4, §4.5, §7).
 * Les appels passent par `asApp` (role `lc_app`, transaction annulee). Le
 * catalogue est lu par l'administration (pg_proc, has_*_privilege). Foyers
 * crees par l'API reelle ; le compteur est reconcilie avec les lignes.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccount } from "../helpers/auth";
import { adminPool, asApp, closePools, pgCode, resetDatabase } from "../helpers/db";
import { inviteCodeOf, membershipsOfUser } from "../helpers/household";
import { fillHome, home, issuedAtOf, joinedMember, memberCountOf, type Home } from "../helpers/invite";

let A: Home;
let B: Home;
let FULL: Home;

beforeAll(async () => {
  await resetDatabase();
  A = await home("FA");
  B = await home("FB");
  FULL = await home("FF");
  await fillHome(FULL, 10);
});
afterAll(closePools);

const FUNCTIONS = ["lc.join_household(text)", "lc.get_invite_code()", "lc.regenerate_invite_code()"];

interface Failure {
  code: string | undefined;
  message: string;
}

/** Appelle une instruction qui doit lever, sans casser la transaction (SAVEPOINT) ; rend code et message. */
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

async function contextIsEmpty(c: pg.PoolClient): Promise<{ h: string | null; l: string | null }> {
  const r = await c.query<{ h: string | null; l: string | null }>(
    "SELECT nullif(current_setting('app.household_id', true), '') AS h, nullif(current_setting('app.invite_code_lookup', true), '') AS l",
  );
  return r.rows[0] ?? { h: "absent", l: "absent" };
}

describe("AC9 : catalogue des trois fonctions", () => {
  it.each(FUNCTIONS)("AC9 : %s est SECURITY DEFINER, a lc_definer, avec un search_path fixe", async (signature) => {
    const r = await adminPool().query<{ prosecdef: boolean; owner: string; proconfig: string[] | null }>(
      "SELECT prosecdef, pg_get_userbyid(proowner) AS owner, proconfig FROM pg_proc WHERE oid = to_regprocedure($1)",
      [signature],
    );
    expect(r.rowCount, `${signature} doit exister`).toBe(1);
    expect(r.rows[0]?.prosecdef).toBe(true);
    expect(r.rows[0]?.owner).toBe("lc_definer");
    expect(r.rows[0]?.proconfig?.some((s) => s.startsWith("search_path=")), `proconfig de ${signature} : ${JSON.stringify(r.rows[0]?.proconfig)}`).toBe(true);
  });

  it.each(FUNCTIONS)("AC9 : %s n'est pas executable par PUBLIC ni lc_better_auth, mais l'est par lc_app", async (signature) => {
    const r = await adminPool().query<{ pub: boolean; app: boolean; auth: boolean }>(
      `SELECT has_function_privilege('public', to_regprocedure($1), 'EXECUTE') AS pub,
              has_function_privilege('lc_app', to_regprocedure($1), 'EXECUTE') AS app,
              has_function_privilege('lc_better_auth', to_regprocedure($1), 'EXECUTE') AS auth`,
      [signature],
    );
    expect(r.rows[0]).toEqual({ pub: false, app: true, auth: false });
  });

  it("AC9 : lc_app n'a toujours aucun droit sur lc.invite_code ni d'ecriture sur lc.membership", async () => {
    const r = await adminPool().query<{ k: string; v: boolean }>(
      `SELECT 'invite_code ' || p AS k, has_table_privilege('lc_app', 'lc.invite_code', p) AS v
         FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p
       UNION ALL
       SELECT 'membership ' || p, has_table_privilege('lc_app', 'lc.membership', p)
         FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) AS p`,
    );
    expect(r.rowCount).toBe(11);
    expect(r.rows.filter((x) => x.v).map((x) => x.k)).toEqual([]);
  });
});

describe("AC9 : sans identite, chaque fonction leve LC001", () => {
  const calls: [string, string, unknown[]][] = [
    ["join_household", "SELECT lc.join_household($1)", ["ZZZZZZZZZZ"]],
    ["get_invite_code", "SELECT lc.get_invite_code()", []],
    ["regenerate_invite_code", "SELECT lc.regenerate_invite_code()", []],
  ];

  it.each(calls)("AC9 : %s sans app.user_id leve LC001", async (_name, sql, params) => {
    await asApp(undefined, async (c) => {
      await expect(c.query(sql, params)).rejects.toMatchObject({ code: "LC001" });
    });
  });

  it.each(calls)("AC9 : %s avec app.user_id vide leve LC001", async (_name, sql, params) => {
    await asApp("", async (c) => {
      await expect(c.query(sql, params)).rejects.toMatchObject({ code: "LC001" });
    });
  });
});

describe("AC9 : lc.join_household", () => {
  it("AC9 : un compte deja membre leve LC002, avec un code valide d'un autre foyer comme avec un code mal forme ou NULL", async () => {
    await asApp(A.account.userId, async (c) => {
      for (const code of [B.code, "pas un code", null, "ZZZZZZZZZZ"]) {
        const f = await failure(c, "SELECT lc.join_household($1)", [code]);
        expect(f.code, `code ${JSON.stringify(code)} -> ${f.message}`).toBe("LC002");
      }
    });
  });

  it("AC9 : un code inconnu leve LC003", async () => {
    const lonely = await createAccount();
    await asApp(lonely.userId, async (c) => {
      expect((await failure(c, "SELECT lc.join_household($1)", ["ZZZZZZZZZZ"])).code).toBe("LC003");
    });
  });

  it("AC9 : un code NULL, vide ou non normalise leve LC003", async () => {
    const lonely = await createAccount();
    await asApp(lonely.userId, async (c) => {
      const inputs: [string, string | null][] = [
        ["NULL", null],
        ["vide", ""],
        ["minuscules", A.code.toLowerCase()],
        ["avec tiret", `${A.code.slice(0, 5)}-${A.code.slice(5)}`],
        ["9 caracteres", A.code.slice(0, 9)],
        ["11 caracteres", `${A.code}2`],
        ["avec U", "ABCDEFGHUJ"],
        ["avec espaces", ` ${A.code} `],
      ];
      for (const [label, value] of inputs) {
        const f = await failure(c, "SELECT lc.join_household($1)", [value]);
        expect(f.code, `code ${label} : ${JSON.stringify(value)} -> ${f.message}`).toBe("LC003");
      }
    });
    expect(await membershipsOfUser(lonely.userId)).toEqual([]);
  });

  it("AC9 : un foyer complet leve LC004, sans ligne ajoutee et compteur inchange", async () => {
    const lonely = await createAccount();
    await asApp(lonely.userId, async (c) => {
      expect((await failure(c, "SELECT lc.join_household($1)", [FULL.code])).code).toBe("LC004");
      const mine = await c.query("SELECT 1 FROM lc.membership WHERE user_id = $1", [lonely.userId]);
      expect(mine.rowCount).toBe(0);
    });
    expect(await memberCountOf(FULL.householdId)).toEqual({ counter: 10, rows: 10 });
  });

  it("AC9 : LC002 et LC003 precedent LC004 : un membre ou un code faux n'apprend pas qu'un foyer est complet", async () => {
    // Deja membre (de A) devant le code d'un foyer complet : LC002.
    await asApp(A.account.userId, async (c) => {
      expect((await failure(c, "SELECT lc.join_household($1)", [FULL.code])).code).toBe("LC002");
    });
    // Code remplace ou inconnu : LC003, jamais LC004.
    const lonely = await createAccount();
    await asApp(lonely.userId, async (c) => {
      expect((await failure(c, "SELECT lc.join_household($1)", ["ZZZZZZZZZZ"])).code).toBe("LC003");
      expect((await failure(c, "SELECT lc.join_household($1)", ["ZZZZZZZZZU"])).code).toBe("LC003");
    });
  });

  it("AC9 : une adhesion reussie cree une appartenance member (display_name = prenom) et incremente le compteur", async () => {
    const joiner = await createAccount({ name: "Dana" });
    await asApp(joiner.userId, async (c) => {
      await c.query("SELECT lc.join_household($1)", [B.code]);
      const mine = await c.query<{ household_id: string; role: string; display_name: string }>(
        "SELECT household_id, role, display_name FROM lc.membership WHERE user_id = $1",
        [joiner.userId],
      );
      expect(mine.rows).toEqual([{ household_id: B.householdId, role: "member", display_name: "Dana" }]);
      const count = await c.query<{ n: number; rows: string }>(
        "SELECT member_count AS n, (SELECT count(*) FROM lc.membership WHERE household_id = $1) AS rows FROM lc.household WHERE id = $1",
        [B.householdId],
      );
      expect(Number(count.rows[0]?.rows)).toBe(count.rows[0]?.n);
    });
    // Annulee : rien ne persiste, le compteur de B n'a pas bouge.
    expect(await membershipsOfUser(joiner.userId)).toEqual([]);
    expect(await memberCountOf(B.householdId)).toEqual({ counter: 1, rows: 1 });
  });
});

describe("AC9 : lc.get_invite_code et lc.regenerate_invite_code", () => {
  it.each(["SELECT lc.get_invite_code()", "SELECT lc.regenerate_invite_code()"])("AC9 : %s sans foyer leve LC009", async (sql) => {
    const lonely = await createAccount();
    await asApp(lonely.userId, async (c) => {
      expect((await failure(c, sql)).code).toBe("LC009");
    });
  });

  it.each(["SELECT lc.get_invite_code()", "SELECT lc.regenerate_invite_code()"])("AC9 : %s par un membre leve LC005, sans ecriture", async (sql) => {
    const h = await home("FM");
    const m = await joinedMember(h, "Simple");
    const issued = await issuedAtOf(h.householdId);
    await asApp(m.userId, async (c) => {
      expect((await failure(c, sql)).code).toBe("LC005");
    });
    expect(await inviteCodeOf(h.householdId)).toBe(h.code);
    expect((await issuedAtOf(h.householdId)).getTime()).toBe(issued.getTime());
  });

  it("AC9 : la responsable lit son code (get_invite_code) et le regenere (regenerate_invite_code), sans que les deux coincident", async () => {
    await asApp(A.account.userId, async (c) => {
      const got = await c.query<{ c: string }>("SELECT lc.get_invite_code() AS c");
      expect(got.rows[0]?.c).toBe(A.code);
      const fresh = await c.query<{ c: string }>("SELECT lc.regenerate_invite_code() AS c");
      expect(fresh.rows[0]?.c).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
      expect(fresh.rows[0]?.c).not.toBe(A.code);
      const again = await c.query<{ c: string }>("SELECT lc.get_invite_code() AS c");
      expect(again.rows[0]?.c).toBe(fresh.rows[0]?.c);
    });
    expect(await inviteCodeOf(A.householdId)).toBe(A.code);
  });
});

describe("AC9 : aucun message d'erreur ne revele de donnee de foyer", () => {
  it("AC9 : messages de LC002, LC003, LC004, LC005 et LC009 sans nom, identifiant ni code de foyer", async () => {
    const h = await home("FN");
    const member = await joinedMember(h, "Simple");
    const lonely = await createAccount();
    const failures: Failure[] = [];

    await asApp(h.account.userId, async (c) => {
      failures.push(await failure(c, "SELECT lc.join_household($1)", [B.code]));
    });
    await asApp(lonely.userId, async (c) => {
      failures.push(await failure(c, "SELECT lc.join_household($1)", ["ZZZZZZZZZZ"]));
      failures.push(await failure(c, "SELECT lc.join_household($1)", [FULL.code]));
      failures.push(await failure(c, "SELECT lc.get_invite_code()"));
      failures.push(await failure(c, "SELECT lc.regenerate_invite_code()"));
    });
    await asApp(member.userId, async (c) => {
      failures.push(await failure(c, "SELECT lc.get_invite_code()"));
      failures.push(await failure(c, "SELECT lc.regenerate_invite_code()"));
    });

    expect(failures.map((f) => f.code)).toEqual(["LC002", "LC003", "LC004", "LC009", "LC009", "LC005", "LC005"]);
    const secrets = [h, B, FULL, A].flatMap((x) => [x.householdName, x.householdId, x.code, x.account.userId]);
    for (const f of failures) {
      for (const s of secrets) expect(f.message, `message de ${f.code}`).not.toContain(s);
    }
  });
});

describe("AC9 : contexte vide apres chaque fonction", () => {
  it("AC9 : app.household_id et app.invite_code_lookup sont vides apres get_invite_code et regenerate_invite_code", async () => {
    await asApp(A.account.userId, async (c) => {
      await c.query("SELECT lc.get_invite_code()");
      expect(await contextIsEmpty(c)).toEqual({ h: null, l: null });
      await c.query("SELECT lc.regenerate_invite_code()");
      expect(await contextIsEmpty(c)).toEqual({ h: null, l: null });
    });
  });

  it("AC9 : app.household_id et app.invite_code_lookup sont vides apres join_household", async () => {
    const joiner = await createAccount();
    await asApp(joiner.userId, async (c) => {
      await c.query("SELECT lc.join_household($1)", [B.code]);
      expect(await contextIsEmpty(c)).toEqual({ h: null, l: null });
    });
  });

  it("AC9 : un app.household_id et un app.invite_code_lookup poses par l'appelant sont remis a vide par la fonction", async () => {
    const joiner = await createAccount();
    await asApp(joiner.userId, async (c) => {
      await c.query("SELECT set_config('app.household_id', $1, true), set_config('app.invite_code_lookup', $2, true)", [A.householdId, A.code]);
      await c.query("SELECT lc.join_household($1)", [B.code]);
      expect(await contextIsEmpty(c)).toEqual({ h: null, l: null });
    });
  });
});
