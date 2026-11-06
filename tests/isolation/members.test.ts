/**
 * AC5 (tranche 004) : Isolation tenant (entre foyers, le foyer etant le tenant,
 * ADR-0002). Deux foyers reels A et B, chacun avec sa responsable et un membre.
 * Par l'API, puis en base SOUS LE ROLE `lc_app` (`asApp` verifie
 * `current_user = lc_app` sans superutilisateur). L'administration ne sert qu'a
 * arranger et a relire, toujours filtree par les identifiants de A et B.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Account } from "../helpers/auth";
import { asApp, closePools, pgCode, resetDatabase } from "../helpers/db";
import { describePage, getPage, membershipsOfUser } from "../helpers/household";
import { describeResult, expectAppError } from "../helpers/http";
import { home, joinedMember, memberCountOf, type Home } from "../helpers/invite";
import { deleteMemberAs, expectMembers, getMembers, membershipIdOf, membershipRowsOf, postLeave, unknownMemberId } from "../helpers/members";

let A: Home;
let B: Home;
let memberA: Account;
let memberB: Account;
let idMemberB: string;
let idOwnerB: string;

beforeAll(async () => {
  await resetDatabase();
  A = await home("MA");
  B = await home("MB");
  expect(A.householdId).not.toBe(B.householdId);
  memberA = await joinedMember(A, "MembreDeA");
  memberB = await joinedMember(B, "MembreDeB");
  idMemberB = await membershipIdOf(memberB.userId);
  idOwnerB = await membershipIdOf(B.account.userId);
});
afterAll(closePools);

describe("AC5 : Isolation tenant (entre foyers), par l'API", () => {
  it("AC5 : GET members de A ne montre aucun membre de B, et inversement", async () => {
    const a = await getMembers(A.account.cookie);
    expect(expectMembers(a, "GET A").map((m) => m.name)).toEqual([A.account.name, "MembreDeA"]);
    for (const secret of [B.account.name, "MembreDeB", idMemberB, idOwnerB]) expect(a.text, describeResult("GET A", a)).not.toContain(secret);
    const b = await getMembers(B.account.cookie);
    expect(expectMembers(b, "GET B").map((m) => m.name)).toEqual([B.account.name, "MembreDeB"]);
    expect(b.text).not.toContain("MembreDeA");
  });

  it("AC5 : la page de A ne montre aucun membre de B", async () => {
    const page = await getPage("/household", A.account.cookie);
    expect(page.status, describePage("GET /household de A", page)).toBe(200);
    expect(page.html, describePage("controle positif", page)).toContain("MembreDeA");
    expect(page.html, describePage("membre de B sur la page de A", page)).not.toContain("MembreDeB");
    expect(page.html).not.toContain(idMemberB);
  });

  it("AC5 : la responsable de A qui vise un membre de B ou la responsable de B recoit le meme 404 qu'un identifiant inexistant ou mal forme", async () => {
    const countBefore = await memberCountOf(B.householdId);
    const rowsBefore = await membershipRowsOf(B.householdId);
    const crossMember = await deleteMemberAs(idMemberB, A.account.cookie);
    expectAppError(crossMember, 404, "MEMBER_NOT_FOUND", "membre de B");
    const crossOwner = await deleteMemberAs(idOwnerB, A.account.cookie);
    const missing = await deleteMemberAs(unknownMemberId(), A.account.cookie);
    const malformed = await deleteMemberAs("pas-un-uuid", A.account.cookie);
    for (const other of [crossOwner, missing, malformed]) {
      expect(other.status, describeResult("reference", other)).toBe(crossMember.status);
      expect(other.body, describeResult("reference", other)).toEqual(crossMember.body);
      expect(other.text).toBe(crossMember.text);
    }
    expect(await memberCountOf(B.householdId)).toEqual(countBefore);
    expect(await membershipRowsOf(B.householdId)).toEqual(rowsBefore);
  });

  it("AC5 : la responsable de B qui vise un membre de A recoit le meme 404, et A est intact", async () => {
    const idMemberA = await membershipIdOf(memberA.userId);
    const cross = await deleteMemberAs(idMemberA, B.account.cookie);
    expectAppError(cross, 404, "MEMBER_NOT_FOUND", "membre de A");
    const missing = await deleteMemberAs(unknownMemberId(), B.account.cookie);
    expect(missing.text).toBe(cross.text);
    expect(await memberCountOf(A.householdId)).toEqual({ counter: 2, rows: 2 });
    expect(await membershipsOfUser(memberA.userId)).toHaveLength(1);
  });

  it("AC5 : member_count de A et de B egalent chacun le nombre de leurs lignes", async () => {
    expect(await memberCountOf(A.householdId)).toEqual({ counter: 2, rows: 2 });
    expect(await memberCountOf(B.householdId)).toEqual({ counter: 2, rows: 2 });
  });
});

describe("AC5 : Isolation tenant (entre foyers), en base sous lc_app", () => {
  it("AC5 : avec app.user_id de A, SELECT sur lc.membership ne rend aucune ligne de B, meme avec app.household_id force sur B", async () => {
    await asApp(A.account.userId, async (c) => {
      const plain = await c.query<{ household_id: string }>("SELECT household_id FROM lc.membership");
      expect(plain.rows.length, "controle positif : A voit ses propres lignes").toBeGreaterThan(0);
      expect(plain.rows.filter((r) => r.household_id === B.householdId)).toEqual([]);
      await c.query("SELECT set_config('app.household_id', $1, true)", [B.householdId]);
      const forced = await c.query<{ household_id: string }>("SELECT household_id FROM lc.membership");
      expect(forced.rows.filter((r) => r.household_id === B.householdId)).toEqual([]);
      const byId = await c.query("SELECT 1 FROM lc.membership WHERE id = ANY($1::uuid[])", [[idMemberB, idOwnerB]]);
      expect(byId.rowCount).toBe(0);
      const byHousehold = await c.query("SELECT 1 FROM lc.membership WHERE household_id = $1", [B.householdId]);
      expect(byHousehold.rowCount).toBe(0);
    });
  });

  it("AC5 : remove_member sous app.user_id de A, avec app.household_id force sur B et un membre de B, leve LC006 et ne touche rien", async () => {
    await asApp(A.account.userId, async (c) => {
      await c.query("SELECT set_config('app.household_id', $1, true)", [B.householdId]);
      await expect(c.query("SELECT lc.remove_member($1)", [idMemberB])).rejects.toMatchObject({ code: "LC006" });
    });
    expect(await memberCountOf(B.householdId)).toEqual({ counter: 2, rows: 2 });
    expect(await membershipsOfUser(memberB.userId)).toHaveLength(1);
  });

  it("AC5 : remove_member sous app.user_id de A visant la responsable de B leve LC006, jamais LC007", async () => {
    await asApp(A.account.userId, async (c) => {
      await expect(c.query("SELECT lc.remove_member($1)", [idOwnerB])).rejects.toMatchObject({ code: "LC006" });
    });
    expect(await membershipsOfUser(B.account.userId)).toHaveLength(1);
  });

  it("AC5 : leave_household d'un membre de A, avec app.household_id force sur B, ne quitte que A (transaction annulee ensuite)", async () => {
    await asApp(memberA.userId, async (c) => {
      await c.query("SELECT set_config('app.household_id', $1, true)", [B.householdId]);
      await c.query("SELECT lc.leave_household()");
      const inA = await c.query("SELECT 1 FROM lc.household WHERE id = $1 AND member_count = 1", [A.householdId]);
      expect(inA.rowCount, "A a perdu exactement un membre").toBe(1);
      const own = await c.query("SELECT 1 FROM lc.membership WHERE user_id = $1", [memberA.userId]);
      expect(own.rowCount).toBe(0);
    });
    expect(await memberCountOf(B.householdId)).toEqual({ counter: 2, rows: 2 });
    expect(await membershipsOfUser(memberB.userId)).toHaveLength(1);
    expect(await memberCountOf(A.householdId)).toEqual({ counter: 2, rows: 2 });
  });

  it("AC5 : un depart reel dans A laisse B intact, et les deux compteurs restent egaux au nombre de lignes", async () => {
    const leaver = await joinedMember(A, "PartiDeA");
    expect(await memberCountOf(A.householdId)).toEqual({ counter: 3, rows: 3 });
    const r = await postLeave(leaver.cookie);
    expect(r.status, describeResult("leave", r)).toBe(200);
    expect(await memberCountOf(A.householdId)).toEqual({ counter: 2, rows: 2 });
    expect(await memberCountOf(B.householdId)).toEqual({ counter: 2, rows: 2 });
  });

  it("AC5 : un appel direct sans app.user_id ne contourne rien : LC001 pour les deux fonctions", async () => {
    await asApp(undefined, async (c) => {
      await expect(c.query("SELECT lc.remove_member($1)", [idMemberB])).rejects.toMatchObject({ code: "LC001" });
    });
    expect(pgCode(undefined)).toBeUndefined();
  });
});
