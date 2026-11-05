/**
 * AC5 (tranche 002) : isolation entre foyers pour le code d'invitation et
 * l'adhesion, avec deux foyers reels A et B, chacun avec sa responsable.
 * Par l'API, puis en base SOUS LE ROLE `lc_app` (`asApp` / `openAppTx`
 * verifient `current_user = lc_app` sans superutilisateur). L'administration
 * ne sert qu'a arranger et a relire, toujours filtree par les identifiants de A et B.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccount } from "../helpers/auth";
import { asApp, attempt, closePools, describeAttempt, resetDatabase } from "../helpers/db";
import { inviteCodeOf, membershipsOfUser } from "../helpers/household";
import { describeResult, expectAppError, expectStatus } from "../helpers/http";
import { displayed, getCode, home, memberCountOf, openAppTx, postJoin, postRegenerate, type AppTx, type Home } from "../helpers/invite";

beforeAll(resetDatabase);
afterAll(closePools);

async function twoHomes(tag: string): Promise<{ A: Home; B: Home }> {
  const A = await home(`${tag}A`);
  const B = await home(`${tag}B`);
  expect(A.householdId).not.toBe(B.householdId);
  expect(A.code).not.toBe(B.code);
  return { A, B };
}

describe("AC5 : isolation du code par l'API", () => {
  it("AC5 : la responsable de A lit le code de A, jamais celui de B", async () => {
    const { A, B } = await twoHomes("I1");
    const ra = await getCode(A.account.cookie);
    expectStatus(ra, 200, "GET invite-code de A");
    expect(ra.body).toEqual({ code: displayed(A.code) });

    const rb = await getCode(B.account.cookie);
    expect(rb.body).toEqual({ code: displayed(B.code) });
  });

  it("AC5 : regenerer le code de A laisse celui de B inchange", async () => {
    const { A, B } = await twoHomes("I2");
    const r = await postRegenerate(A.account.cookie);
    expectStatus(r, 200, "regeneration de A");
    const fresh = (r.body as { code: string }).code;
    for (const secret of [B.code, displayed(B.code), A.code, displayed(A.code)]) {
      expect(r.text, describeResult("la regeneration de A revele un code etranger ou ancien", r)).not.toContain(secret);
    }
    expect(fresh).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(await inviteCodeOf(B.householdId)).toBe(B.code);
    expect(await inviteCodeOf(A.householdId)).not.toBe(A.code);
    expect(await getCode(B.account.cookie)).toMatchObject({ body: { code: displayed(B.code) } });
  });

  it("AC5 : le code de A ne fait rejoindre que A, et celui de B que B", async () => {
    const { A, B } = await twoHomes("I3");
    const toA = await createAccount({ name: "VersA" });
    const toB = await createAccount({ name: "VersB" });
    const ra = await postJoin(displayed(A.code), toA.cookie);
    const rb = await postJoin(displayed(B.code), toB.cookie);
    expect(ra.body).toEqual({ name: A.householdName, role: "member" });
    expect(rb.body).toEqual({ name: B.householdName, role: "member" });
    expect((await membershipsOfUser(toA.userId)).map((m) => m.household_id)).toEqual([A.householdId]);
    expect((await membershipsOfUser(toB.userId)).map((m) => m.household_id)).toEqual([B.householdId]);
    expect(await memberCountOf(A.householdId)).toEqual({ counter: 2, rows: 2 });
    expect(await memberCountOf(B.householdId)).toEqual({ counter: 2, rows: 2 });
  });

  it("AC5 : un membre de A n'obtient pas le code de B ni celui de A", async () => {
    const { A, B } = await twoHomes("I4");
    const member = await createAccount({ name: "MembreA" });
    expectStatus(await postJoin(displayed(A.code), member.cookie), 200, "adhesion a A");
    for (const r of [await getCode(member.cookie), await postRegenerate(member.cookie)]) {
      expectAppError(r, 403, "INSUFFICIENT_ROLE", "membre de A");
      for (const secret of [A.code, displayed(A.code), B.code, displayed(B.code)]) {
        expect(r.text, describeResult("le refus revele un code", r)).not.toContain(secret);
      }
    }
    expect(await inviteCodeOf(A.householdId)).toBe(A.code);
  });
});

describe("AC5 : isolation du code en base sous lc_app", () => {
  let A: Home;
  let B: Home;
  beforeAll(async () => {
    ({ A, B } = await twoHomes("D"));
  });

  it("AC5 : avec app.user_id = responsable de A, get_invite_code rend le code de A", async () => {
    await asApp(A.account.userId, async (c) => {
      const r = await c.query<{ c: string }>("SELECT lc.get_invite_code() AS c");
      expect(r.rows[0]?.c).toBe(A.code);
    });
  });

  it("AC5 : un app.household_id force sur B est ignore par get_invite_code et par regenerate_invite_code", async () => {
    await asApp(A.account.userId, async (c) => {
      await c.query("SELECT set_config('app.household_id', $1, true)", [B.householdId]);
      const got = await c.query<{ c: string }>("SELECT lc.get_invite_code() AS c");
      expect(got.rows[0]?.c).toBe(A.code);
      await c.query("SELECT set_config('app.household_id', $1, true)", [B.householdId]);
      const regenerated = await c.query<{ c: string }>("SELECT lc.regenerate_invite_code() AS c");
      expect(regenerated.rows[0]?.c).not.toBe(B.code);
      expect(regenerated.rows[0]?.c).not.toBe(A.code);
    });
  });

  it("AC5 : une regeneration COMMITEE sous lc_app avec app.household_id force sur B ne change que le code de A", async () => {
    const { A: a, B: b } = await twoHomes("DC");
    let tx: AppTx | undefined;
    try {
      tx = await openAppTx(a.account.userId);
      await tx.client.query("SELECT set_config('app.household_id', $1, true)", [b.householdId]);
      const r = await tx.client.query<{ c: string }>("SELECT lc.regenerate_invite_code() AS c");
      await tx.commit();
      expect(await inviteCodeOf(a.householdId)).toBe(r.rows[0]?.c);
      expect(await inviteCodeOf(a.householdId)).not.toBe(a.code);
      expect(await inviteCodeOf(b.householdId)).toBe(b.code);
    } finally {
      await tx?.rollback();
      tx?.release();
    }
  });

  it("AC5 : lc.invite_code reste illisible et non modifiable sous lc_app, meme avec app.invite_code_lookup pose sur le code de B", async () => {
    await asApp(A.account.userId, async (c) => {
      await c.query("SELECT set_config('app.invite_code_lookup', $1, true)", [B.code]);
      const statements: [string, string, unknown[]][] = [
        ["SELECT du code de B", "SELECT household_id FROM lc.invite_code WHERE code = $1", [B.code]],
        ["SELECT de tout le code", "SELECT code FROM lc.invite_code WHERE household_id = ANY($1)", [[A.householdId, B.householdId]]],
        ["UPDATE du code de B", "UPDATE lc.invite_code SET code = '0000000000' WHERE household_id = $1", [B.householdId]],
        ["UPDATE du code de A", "UPDATE lc.invite_code SET code = '0000000000' WHERE household_id = $1", [A.householdId]],
        ["DELETE", "DELETE FROM lc.invite_code WHERE household_id = $1", [B.householdId]],
        ["INSERT", "INSERT INTO lc.invite_code (household_id, code) VALUES ($1, '0000000000')", [B.householdId]],
      ];
      for (const [label, sql, params] of statements) {
        const outcome = await attempt(c, sql, params);
        expect(outcome, describeAttempt(label, outcome)).toEqual({ ok: false, code: "42501" });
      }
    });
    expect(await inviteCodeOf(B.householdId)).toBe(B.code);
  });

  it("AC5 : un app.household_id force sur B avant join_household n'influence pas le foyer rejoint", async () => {
    const lonely = await createAccount({ name: "Seule" });
    await asApp(lonely.userId, async (c) => {
      await c.query("SELECT set_config('app.household_id', $1, true)", [B.householdId]);
      await c.query("SELECT lc.join_household($1)", [A.code]);
      const mine = await c.query<{ household_id: string; role: string }>(
        "SELECT household_id, role FROM lc.membership WHERE user_id = $1",
        [lonely.userId],
      );
      expect(mine.rows).toEqual([{ household_id: A.householdId, role: "member" }]);
    });
    expect(await membershipsOfUser(lonely.userId)).toEqual([]);
  });

  it("AC5 : un app.household_id force sur A n'ouvre pas non plus un code de B a join_household", async () => {
    const lonely = await createAccount({ name: "Seule" });
    await asApp(lonely.userId, async (c) => {
      await c.query("SELECT set_config('app.household_id', $1, true)", [A.householdId]);
      await c.query("SELECT lc.join_household($1)", [B.code]);
      const mine = await c.query<{ household_id: string }>("SELECT household_id FROM lc.membership WHERE user_id = $1", [lonely.userId]);
      expect(mine.rows).toEqual([{ household_id: B.householdId }]);
    });
  });

  it("AC5 : la responsable de B regenere COMMITE avec app.household_id force sur A : seul le code de B change, celui de A reste", async () => {
    const { A: a, B: b } = await twoHomes("DD");
    let tx: AppTx | undefined;
    try {
      tx = await openAppTx(b.account.userId);
      await tx.client.query("SELECT set_config('app.household_id', $1, true)", [a.householdId]);
      const r = await tx.client.query<{ c: string }>("SELECT lc.regenerate_invite_code() AS c");
      await tx.commit();
      expect(await inviteCodeOf(b.householdId)).toBe(r.rows[0]?.c);
      expect(await inviteCodeOf(b.householdId)).not.toBe(b.code);
      expect(await inviteCodeOf(a.householdId)).toBe(a.code);
    } finally {
      await tx?.rollback();
      tx?.release();
    }
  });
});
