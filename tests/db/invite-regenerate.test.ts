/**
 * AC9 (tranche 002) : boucle de tirage de lc.regenerate_invite_code (ERD §4.5,
 * 5 essais au plus, un tirage egal au code en vigueur compte comme un essai),
 * et remise a vide de app.invite_code_lookup par get_invite_code et
 * regenerate_invite_code.
 *
 * Boucle : dans une transaction d'ADMINISTRATION toujours ANNULEE,
 * `lc.new_invite_code()` est remplacee par une fonction qui rend des tirages
 * imposes (reglage local `test.draws`), puis `SET LOCAL ROLE lc_app` et l'appel
 * de la fonction sous le role applicatif. Rien ne persiste : un test verifie
 * apres coup que la fonction d'origine est intacte et que les codes n'ont pas bouge.
 */
import { randomBytes } from "node:crypto";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminPool, closePools, pgCode, resetDatabase } from "../helpers/db";
import { inviteCodeOf } from "../helpers/household";
import { home, openAppTx, type AppTx, type Home } from "../helpers/invite";

let A: Home;
let B: Home;

beforeAll(async () => {
  await resetDatabase();
  A = await home("RA");
  B = await home("RB");
});
afterAll(closePools);

const freshCode = () => `0${randomBytes(4).toString("hex").toUpperCase()}0`;

interface Outcome {
  code: string | undefined;
  returned: string | undefined;
  stored: string | undefined;
  storedB: string | undefined;
}

/** Appelle regenerate_invite_code sous lc_app avec des tirages imposes ; tout est annule. */
async function regenerateWithDraws(owner: Home, draws: string[]): Promise<Outcome> {
  const client: pg.PoolClient = await adminPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE OR REPLACE FUNCTION lc.new_invite_code() RETURNS text LANGUAGE plpgsql AS $f$
      DECLARE d text[];
      BEGIN
        d := string_to_array(current_setting('test.draws'), ',');
        PERFORM set_config('test.draws', array_to_string(d[2:array_length(d, 1)], ','), true);
        RETURN d[1];
      END
      $f$`);
    await client.query("SELECT set_config('test.draws', $1, true)", [draws.join(",")]);
    await client.query("SET LOCAL ROLE lc_app");
    const who = await client.query<{ u: string }>("SELECT current_user AS u");
    expect(who.rows[0]?.u).toBe("lc_app");
    await client.query("SELECT set_config('app.user_id', $1, true)", [owner.account.userId]);

    let returned: string | undefined;
    let code: string | undefined;
    await client.query("SAVEPOINT r");
    try {
      const r = await client.query<{ c: string }>("SELECT lc.regenerate_invite_code() AS c");
      returned = r.rows[0]?.c;
    } catch (e) {
      code = pgCode(e);
      await client.query("ROLLBACK TO SAVEPOINT r");
    }
    await client.query("RESET ROLE");
    const stored = await client.query<{ household_id: string; code: string }>(
      "SELECT household_id, code FROM lc.invite_code WHERE household_id = ANY($1)",
      [[owner.householdId, B.householdId]],
    );
    return {
      code,
      returned,
      stored: stored.rows.find((x) => x.household_id === owner.householdId)?.code,
      storedB: stored.rows.find((x) => x.household_id === B.householdId)?.code,
    };
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
  }
}

describe("AC9 : boucle de tirage de regenerate_invite_code", () => {
  it("AC9 : reprise apres collision avec le code d'un autre foyer", async () => {
    const fresh = freshCode();
    const o = await regenerateWithDraws(A, [B.code, fresh]);
    expect(o).toEqual({ code: undefined, returned: fresh, stored: fresh, storedB: B.code });
  });

  it("AC9 : reprise apres un tirage egal au code en vigueur", async () => {
    const fresh = freshCode();
    const o = await regenerateWithDraws(A, [A.code, fresh]);
    expect(o).toEqual({ code: undefined, returned: fresh, stored: fresh, storedB: B.code });
  });

  it("AC9 : le 5e essai est encore permis : quatre refus (egal ou collision) puis un code libre aboutit", async () => {
    const fresh = freshCode();
    const o = await regenerateWithDraws(A, [A.code, B.code, A.code, B.code, fresh]);
    expect(o).toEqual({ code: undefined, returned: fresh, stored: fresh, storedB: B.code });
  });

  it("AC9 : cinq collisions levent P0001 (le 6e tirage libre n'est jamais consomme), et le code en vigueur est inchange", async () => {
    const o = await regenerateWithDraws(A, [B.code, B.code, B.code, B.code, B.code, freshCode()]);
    expect(o).toEqual({ code: "P0001", returned: undefined, stored: A.code, storedB: B.code });
  });

  it("AC9 : cinq tirages egaux au code en vigueur levent P0001 (l'egalite compte parmi les 5 essais ; le 6e tirage libre n'est jamais consomme)", async () => {
    const o = await regenerateWithDraws(A, [A.code, A.code, A.code, A.code, A.code, freshCode()]);
    expect(o).toEqual({ code: "P0001", returned: undefined, stored: A.code, storedB: B.code });
  });

  it("AC9 : rien n'a persiste : fonction d'origine intacte, codes inchanges", async () => {
    const def = await adminPool().query<{ src: string }>("SELECT prosrc AS src FROM pg_proc WHERE oid = to_regprocedure('lc.new_invite_code()')");
    expect(def.rows[0]?.src).not.toContain("test.draws");
    expect(await inviteCodeOf(A.householdId)).toBe(A.code);
    expect(await inviteCodeOf(B.householdId)).toBe(B.code);
  });
});

describe("AC9 : app.invite_code_lookup pose sur le code de B", () => {
  async function withLookup(owner: Home, sql: string, lookup: string): Promise<{ returned: string; ctx: { h: string | null; l: string | null } }> {
    let tx: AppTx | undefined;
    try {
      tx = await openAppTx(owner.account.userId);
      await tx.client.query("SELECT set_config('app.invite_code_lookup', $1, true)", [lookup]);
      const r = await tx.client.query<{ c: string }>(sql);
      const ctx = await tx.client.query<{ h: string | null; l: string | null }>(
        "SELECT nullif(current_setting('app.household_id', true), '') AS h, nullif(current_setting('app.invite_code_lookup', true), '') AS l",
      );
      await tx.commit();
      return { returned: r.rows[0]?.c ?? "", ctx: ctx.rows[0] ?? { h: "absent", l: "absent" } };
    } finally {
      await tx?.rollback();
      tx?.release();
    }
  }

  it("AC9 : get_invite_code rend le code de A, jamais celui de B, et laisse le contexte vide", async () => {
    const o = await withLookup(A, "SELECT lc.get_invite_code() AS c", B.code);
    expect(o.returned).toBe(A.code);
    expect(o.ctx).toEqual({ h: null, l: null });
    expect(await inviteCodeOf(B.householdId)).toBe(B.code);
  });

  it("AC9 : regenerate_invite_code ne change que A, laisse B inchange apres commit et le contexte vide", async () => {
    const o = await withLookup(A, "SELECT lc.regenerate_invite_code() AS c", B.code);
    expect(o.returned).toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(o.returned).not.toBe(B.code);
    expect(o.ctx).toEqual({ h: null, l: null });
    expect(await inviteCodeOf(A.householdId)).toBe(o.returned);
    expect(await inviteCodeOf(B.householdId)).toBe(B.code);
  });

  it("AC9 : sens inverse : B appelle get_invite_code avec le lookup pose sur le code de A (cree en premier) et recoit le code de B", async () => {
    const codeA = await inviteCodeOf(A.householdId);
    expect(codeA, "le foyer A doit avoir un code").toBeDefined();
    expect(codeA).not.toBe(B.code);
    const o = await withLookup(B, "SELECT lc.get_invite_code() AS c", codeA ?? "");
    expect(o.returned).toBe(B.code);
    expect(o.ctx).toEqual({ h: null, l: null });
    expect(await inviteCodeOf(A.householdId)).toBe(codeA);
  });
});
