/**
 * AC7 (tranche 004) : concurrence REELLE (vraie base, vrai serveur, aucun mock).
 *
 * - Les formes `Promise.all` n'attestent pas le chevauchement : elles verifient
 *   l'issue attendue quel que soit l'entrelacement.
 * - Les formes deterministes utilisent deux connexions `lc_app` en transactions
 *   COMMITEES (openAppTx) et constatent l'attente dans pg_stat_activity
 *   (waitUntilBlockedOnLock). D-060 : a la borne, le CHECK est evalue sur
 *   l'instantane avant l'attente du verrou, donc `join_household` a 10 membres
 *   avec un depart non commite recoit LC004 tout de suite ; sous la borne, il
 *   attend le verrou du foyer.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccount } from "../helpers/auth";
import { closePools, pgCode, resetDatabase } from "../helpers/db";
import { membershipsOfUser } from "../helpers/household";
import { describeResult, expectAppError, expectStatus } from "../helpers/http";
import {
  displayed,
  fillHome,
  home,
  joinedMember,
  memberCountOf,
  openAppTx,
  postJoin,
  settle,
  waitUntilBlockedOnLock,
  type AppTx,
} from "../helpers/invite";
import { deleteMemberAs, membershipIdOf, postLeave } from "../helpers/members";

beforeAll(resetDatabase);
afterAll(closePools);

const STILL_WAITING = "toujours en attente" as const;
const wait = (ms: number): Promise<typeof STILL_WAITING> => new Promise((r) => setTimeout(() => r(STILL_WAITING), ms));

describe("AC7 : requetes paralleles (Promise.all)", () => {
  it("AC7 : deux retraits paralleles du meme membre : un 200, un 404, et le compteur ne baisse qu'une fois", async () => {
    const h = await home("P1");
    const m = await joinedMember(h, "Double");
    await joinedMember(h, "Temoin");
    const id = await membershipIdOf(m.userId);
    const [r1, r2] = await Promise.all([deleteMemberAs(id, h.account.cookie), deleteMemberAs(id, h.account.cookie)]);
    expect([r1.status, r2.status].sort(), `${describeResult("1", r1)} ; ${describeResult("2", r2)}`).toEqual([200, 404]);
    expectAppError(r1.status === 404 ? r1 : r2, 404, "MEMBER_NOT_FOUND", "perdant");
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 2, rows: 2 });
  });

  it("AC7 : deux departs paralleles du meme membre : un 200, un 403 NO_HOUSEHOLD", async () => {
    const h = await home("P2");
    const m = await joinedMember(h, "Double");
    const [r1, r2] = await Promise.all([postLeave(m.cookie), postLeave(m.cookie)]);
    expect([r1.status, r2.status].sort(), `${describeResult("1", r1)} ; ${describeResult("2", r2)}`).toEqual([200, 403]);
    expectAppError(r1.status === 403 ? r1 : r2, 403, "NO_HOUSEHOLD", "perdant");
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 1, rows: 1 });
  });

  it("AC7 : un retrait et un depart paralleles du meme membre : un seul reussit, l'autre recoit son refus type, jamais de 500", async () => {
    for (let round = 0; round < 3; round += 1) {
      const h = await home(`P3x${round}`);
      const m = await joinedMember(h, "Course");
      const id = await membershipIdOf(m.userId);
      const [removal, leave] = await Promise.all([deleteMemberAs(id, h.account.cookie), postLeave(m.cookie)]);
      const label = `${describeResult("retrait", removal)} ; ${describeResult("depart", leave)}`;
      const removalWon = removal.status === 200;
      const leaveWon = leave.status === 200;
      expect(Number(removalWon) + Number(leaveWon), label).toBe(1);
      if (removalWon) expectAppError(leave, 403, "NO_HOUSEHOLD", "depart perdant");
      else expectAppError(removal, 404, "MEMBER_NOT_FOUND", "retrait perdant");
      expect(await membershipsOfUser(m.userId)).toEqual([]);
      expect(await memberCountOf(h.householdId)).toEqual({ counter: 1, rows: 1 });
    }
  });
});

describe("AC7 : serialisation observee (deterministe, deux connexions lc_app)", () => {
  it("AC7 : un retrait non commite tient la ligne ; un retrait concurrent attend, puis recoit LC006 apres le COMMIT", async () => {
    const h = await home("D1");
    const m = await joinedMember(h, "Tenue");
    const id = await membershipIdOf(m.userId);
    let txA: AppTx | undefined;
    let txB: AppTx | undefined;
    try {
      txA = await openAppTx(h.account.userId);
      txB = await openAppTx(h.account.userId);
      await txA.client.query("SELECT lc.remove_member($1)", [id]);

      const pending = settle(txB.client.query("SELECT lc.remove_member($1)", [id]));
      await waitUntilBlockedOnLock(txB.pid);
      expect(await Promise.race([pending, wait(150)]), "le second retrait ne doit pas aboutir avant le COMMIT").toBe(STILL_WAITING);

      await txA.commit();
      const outcome = await pending;
      expect(outcome.status).toBe("rejected");
      expect(outcome.status === "rejected" ? pgCode(outcome.reason) : undefined).toBe("LC006");
      await txB.rollback();
      expect(await memberCountOf(h.householdId)).toEqual({ counter: 1, rows: 1 });
    } finally {
      await txA?.rollback();
      await txB?.rollback();
      txA?.release();
      txB?.release();
    }
  });

  it("AC7 : un retrait non commite ; le depart du meme membre attend, puis recoit LC009 apres le COMMIT", async () => {
    const h = await home("D2");
    const m = await joinedMember(h, "Tenue");
    const id = await membershipIdOf(m.userId);
    let txA: AppTx | undefined;
    let txB: AppTx | undefined;
    try {
      txA = await openAppTx(h.account.userId);
      txB = await openAppTx(m.userId);
      await txA.client.query("SELECT lc.remove_member($1)", [id]);

      const pending = settle(txB.client.query("SELECT lc.leave_household()"));
      await waitUntilBlockedOnLock(txB.pid);
      expect(await Promise.race([pending, wait(150)]), "le depart ne doit pas aboutir avant le COMMIT").toBe(STILL_WAITING);

      await txA.commit();
      const outcome = await pending;
      expect(outcome.status).toBe("rejected");
      expect(outcome.status === "rejected" ? pgCode(outcome.reason) : undefined).toBe("LC009");
      await txB.rollback();
      expect(await memberCountOf(h.householdId)).toEqual({ counter: 1, rows: 1 });
    } finally {
      await txA?.rollback();
      await txB?.rollback();
      txA?.release();
      txB?.release();
    }
  });

  it("AC7 : un depart non commite ; le retrait du meme membre attend, puis recoit LC006 apres le COMMIT", async () => {
    const h = await home("D3");
    const m = await joinedMember(h, "Tenue");
    const id = await membershipIdOf(m.userId);
    let txA: AppTx | undefined;
    let txB: AppTx | undefined;
    try {
      txA = await openAppTx(m.userId);
      txB = await openAppTx(h.account.userId);
      await txA.client.query("SELECT lc.leave_household()");

      const pending = settle(txB.client.query("SELECT lc.remove_member($1)", [id]));
      await waitUntilBlockedOnLock(txB.pid);
      expect(await Promise.race([pending, wait(150)]), "le retrait ne doit pas aboutir avant le COMMIT").toBe(STILL_WAITING);

      await txA.commit();
      const outcome = await pending;
      expect(outcome.status).toBe("rejected");
      expect(outcome.status === "rejected" ? pgCode(outcome.reason) : undefined).toBe("LC006");
      await txB.rollback();
      expect(await memberCountOf(h.householdId)).toEqual({ counter: 1, rows: 1 });
    } finally {
      await txA?.rollback();
      await txB?.rollback();
      txA?.release();
      txB?.release();
    }
  });
});

describe("AC7 : borne des membres (meme mecanisme que D-060)", () => {
  it("AC7 : a 10 membres, avec un depart non commite, join_household recoit LC004 tout de suite ; l'adhesion apres le COMMIT reussit", async () => {
    const h = await home("K1");
    const members = await fillHome(h, 10);
    const leaver = members[0];
    if (!leaver) throw new Error("[tests] aucun membre a faire partir");
    const newcomer = await createAccount({ name: "Arrivante" });
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 10, rows: 10 });

    let txA: AppTx | undefined;
    let txB: AppTx | undefined;
    try {
      txA = await openAppTx(leaver.userId);
      txB = await openAppTx(newcomer.userId);
      await txA.client.query("SELECT lc.leave_household()");

      const pending = settle(txB.client.query("SELECT lc.join_household($1)", [h.code]));
      const raced = await Promise.race([pending, wait(5000)]);
      expect(raced, "a la borne, LC004 doit venir tout de suite, sans attendre le COMMIT du depart").not.toBe(STILL_WAITING);
      const outcome = await pending;
      expect(outcome.status).toBe("rejected");
      expect(outcome.status === "rejected" ? pgCode(outcome.reason) : undefined).toBe("LC004");
      await txB.rollback();

      await txA.commit();
      expectStatus(await postJoin(displayed(h.code), newcomer.cookie), 200, "adhesion apres le COMMIT du depart");
      expect(await memberCountOf(h.householdId)).toEqual({ counter: 10, rows: 10 });
      expect(await membershipsOfUser(leaver.userId)).toEqual([]);
    } finally {
      await txA?.rollback();
      await txB?.rollback();
      txA?.release();
      txB?.release();
    }
  });

  it("AC7 : sous la borne, une adhesion attend le depart non commite, puis reussit", async () => {
    const h = await home("K2");
    const members = await fillHome(h, 9);
    const leaver = members[0];
    if (!leaver) throw new Error("[tests] aucun membre a faire partir");
    const newcomer = await createAccount({ name: "Arrivante" });

    let txA: AppTx | undefined;
    let txB: AppTx | undefined;
    try {
      txA = await openAppTx(leaver.userId);
      txB = await openAppTx(newcomer.userId);
      await txA.client.query("SELECT lc.leave_household()");

      const pending = settle(txB.client.query("SELECT lc.join_household($1)", [h.code]));
      await waitUntilBlockedOnLock(txB.pid);
      expect(await Promise.race([pending, wait(150)]), "sous la borne, l'adhesion attend le verrou du foyer").toBe(STILL_WAITING);

      await txA.commit();
      const outcome = await pending;
      expect(outcome.status, "l'adhesion doit reussir apres le COMMIT du depart").toBe("fulfilled");
      await txB.commit();
      expect(await membershipsOfUser(newcomer.userId)).toHaveLength(1);
      expect(await memberCountOf(h.householdId)).toEqual({ counter: 9, rows: 9 });
    } finally {
      await txA?.rollback();
      await txB?.rollback();
      txA?.release();
      txB?.release();
    }
  });
});
