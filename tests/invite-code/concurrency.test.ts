/**
 * AC3 : foyer plein et concurrence REELLE (vraie base, vrai serveur, aucun mock).
 *
 * - Les 9 membres du foyer sont crees par l'API reelle (adhesions sequentielles).
 * - Les requetes « simultanees » partent d'un `Promise.all`.
 * - Adhesion pendant une regeneration : deterministe, sur deux connexions
 *   `lc_app` distinctes en transactions COMMITEES (voir openAppTx). L'attente de
 *   l'adhesion est constatee dans pg_stat_activity depuis l'administration.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccount } from "../helpers/auth";
import { closePools, pgCode, resetDatabase } from "../helpers/db";
import { inviteCodeOf, membershipsOfUser } from "../helpers/household";
import { describeResult, expectAppError, expectStatus } from "../helpers/http";
import {
  displayed,
  fillHome,
  home,
  memberCountOf,
  openAppTx,
  postJoin,
  settle,
  waitUntilBlockedOnLock,
  type AppTx,
} from "../helpers/invite";

beforeAll(resetDatabase);
afterAll(closePools);

describe("AC3 : foyer plein", () => {
  it("AC3 : un foyer de 10 membres refuse le 11e avec 409 HOUSEHOLD_FULL, et le compte reste a 10", async () => {
    const h = await home("F1");
    await fillHome(h, 10);
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 10, rows: 10 });

    const eleventh = await createAccount({ name: "Onzieme" });
    expectAppError(await postJoin(displayed(h.code), eleventh.cookie), 409, "HOUSEHOLD_FULL", "11e membre");
    expect(await membershipsOfUser(eleventh.userId)).toEqual([]);
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 10, rows: 10 });
  });

  it("AC3 : un foyer plein refuse un code mal forme ou inconnu comme d'habitude (422, 404), sans reveler qu'il est plein", async () => {
    const h = await home("F2");
    await fillHome(h, 10);
    const stranger = await createAccount();
    expectAppError(await postJoin("ZZZZZ-ZZZZZ", stranger.cookie), 404, "INVITE_CODE_INVALID", "code inconnu");
    expectAppError(await postJoin("ABCDE-FGHUJ", stranger.cookie), 422, "VALIDATION_FAILED", "code mal forme");
  });
});

describe("AC3 : adhesions simultanees", () => {
  it("AC3 : le 10e et le 11e membre rejoignent en parallele : exactement un 200 et un 409 HOUSEHOLD_FULL, member_count = 10", async () => {
    const h = await home("C1");
    await fillHome(h, 9);
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 9, rows: 9 });

    const a = await createAccount({ name: "Dixieme" });
    const b = await createAccount({ name: "Onzieme" });
    const [ra, rb] = await Promise.all([postJoin(displayed(h.code), a.cookie), postJoin(displayed(h.code), b.cookie)]);

    const statuses = [ra.status, rb.status].sort();
    expect(statuses, `${describeResult("A", ra)} ; ${describeResult("B", rb)}`).toEqual([200, 409]);
    const loser = ra.status === 409 ? ra : rb;
    const winner = ra.status === 200 ? ra : rb;
    expectAppError(loser, 409, "HOUSEHOLD_FULL", "perdant de la course");
    expectStatus(winner, 200, "gagnant de la course");

    expect(await memberCountOf(h.householdId)).toEqual({ counter: 10, rows: 10 });
    const rowsA = await membershipsOfUser(a.userId);
    const rowsB = await membershipsOfUser(b.userId);
    expect(rowsA.length + rowsB.length).toBe(1);
  });

  it("AC3 : le meme compte envoie deux adhesions simultanees : un 200, un 409 ALREADY_IN_HOUSEHOLD, une seule appartenance", async () => {
    const h = await home("C2");
    const joiner = await createAccount({ name: "Double" });
    const [r1, r2] = await Promise.all([postJoin(displayed(h.code), joiner.cookie), postJoin(displayed(h.code), joiner.cookie)]);

    expect([r1.status, r2.status].sort(), `${describeResult("1", r1)} ; ${describeResult("2", r2)}`).toEqual([200, 409]);
    expectAppError(r1.status === 409 ? r1 : r2, 409, "ALREADY_IN_HOUSEHOLD", "doublon");
    expect(await membershipsOfUser(joiner.userId)).toHaveLength(1);
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 2, rows: 2 });
  });
});

describe("AC3 : adhesion pendant une regeneration (deterministe, deux connexions lc_app)", () => {
  it("AC3 : l'adhesion avec l'ancien code attend la regeneration non commitee, puis echoue avec LC003 apres le COMMIT", async () => {
    const h = await home("C3");
    const joiner = await createAccount({ name: "Retardataire" });
    const oldCode = h.code;
    const membersBefore = await memberCountOf(h.householdId);

    let txA: AppTx | undefined;
    let txB: AppTx | undefined;
    try {
      txA = await openAppTx(h.account.userId);
      txB = await openAppTx(joiner.userId);

      // A regenere sans commiter : elle tient le verrou de la ligne du code.
      const regenerated = await txA.client.query<{ c: string }>("SELECT lc.regenerate_invite_code() AS c");
      const newCode = regenerated.rows[0]?.c;
      expect(newCode, "regenerate_invite_code doit rendre le nouveau code").toMatch(/^[0-9A-HJKMNP-TV-Z]{10}$/);
      expect(newCode).not.toBe(oldCode);

      // B rejoint avec l'ancien code : doit attendre le verrou de A.
      const pending = settle(txB.client.query("SELECT lc.join_household($1)", [oldCode]));
      await waitUntilBlockedOnLock(txB.pid);
      const raced = await Promise.race([pending, new Promise<"toujours en attente">((r) => setTimeout(() => r("toujours en attente"), 150))]);
      expect(raced, "l'adhesion ne doit pas aboutir avant le COMMIT de la regeneration").toBe("toujours en attente");

      await txA.commit();
      const outcome = await pending;
      expect(outcome.status, "l'adhesion avec l'ancien code doit echouer apres le COMMIT").toBe("rejected");
      expect(outcome.status === "rejected" ? pgCode(outcome.reason) : undefined).toBe("LC003");
      await txB.rollback();

      // Le compte de B n'a aucune appartenance ; le compteur est inchange ; le nouveau code est celui stocke.
      expect(await membershipsOfUser(joiner.userId)).toEqual([]);
      expect(await memberCountOf(h.householdId)).toEqual(membersBefore);
      expect(await inviteCodeOf(h.householdId)).toBe(newCode);
    } finally {
      await txA?.rollback();
      await txB?.rollback();
      txA?.release();
      txB?.release();
    }
  });

  it("AC3 : l'ancien code ne rouvre jamais le foyer, et le nouveau code, lui, le rejoint", async () => {
    const h = await home("C4");
    const joiner = await createAccount({ name: "Tardif" });
    let txA: AppTx | undefined;
    try {
      txA = await openAppTx(h.account.userId);
      const regenerated = await txA.client.query<{ c: string }>("SELECT lc.regenerate_invite_code() AS c");
      const newCode = regenerated.rows[0]?.c ?? "";
      await txA.commit();

      expectAppError(await postJoin(displayed(h.code), joiner.cookie), 404, "INVITE_CODE_INVALID", "ancien code apres COMMIT");
      expectStatus(await postJoin(newCode, joiner.cookie), 200, "nouveau code");
      expect(await memberCountOf(h.householdId)).toEqual({ counter: 2, rows: 2 });
    } finally {
      await txA?.rollback();
      txA?.release();
    }
  });
});
