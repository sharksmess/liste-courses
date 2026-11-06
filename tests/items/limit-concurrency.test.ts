/**
 * AC8 (tranche 003) : borne de 200 articles et concurrence REELLE (vraie base,
 * vrai serveur, aucun mock). Les series sont amorcees par `lc.add_item` sous
 * `lc_app` (le trigger tient le compteur) ; les requetes paralleles passent par
 * l'API reelle (`Promise.all`). Une serialisation observee, deterministe,
 * utilise deux connexions `lc_app` dont la premiere tient sa transaction ouverte.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgCode, resetDatabase, closePools } from "../helpers/db";
import { describeResult, expectAppError, expectStatus } from "../helpers/http";
import { home, joinedMember, openAppTx, settle, waitUntilBlockedOnLock, type AppTx } from "../helpers/invite";
import {
  addItemInOwnTx,
  deleteItemAs,
  expectItem,
  getItems,
  itemCountOf,
  itemRowById,
  patchItem,
  postItem,
  seedItems,
} from "../helpers/items";

beforeAll(resetDatabase);
afterAll(closePools);

describe("AC8 : foyer plein", () => {
  it("AC8 : un foyer de 200 articles, coches compris, refuse le suivant avec 409 ITEM_LIMIT_REACHED, et le nombre reste 200", async () => {
    const h = await home("B1");
    await seedItems(h.account.userId, 199);
    const last = await addItemInOwnTx(h.account.userId, "Dernier");
    // Coche (via l'API) : les articles coches comptent dans la borne.
    expectItem(await patchItem(last, { purchased: true }, h.account.cookie), 200, "cocher le dernier");
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 200, rows: 200 });

    const r = await postItem({ name: "Le 201e" }, h.account.cookie);
    expectAppError(r, 409, "ITEM_LIMIT_REACHED", "201e article");
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 200, rows: 200 });
    const list = await getItems(h.account.cookie);
    expect((list.body as { items: unknown[] }).items, describeResult("GET", list)).toHaveLength(200);
  });

  it("AC8 : apres une suppression a 200, l'ajout suivant reussit", async () => {
    const h = await home("B2");
    await seedItems(h.account.userId, 199);
    const id = await addItemInOwnTx(h.account.userId, "A retirer");
    expectAppError(await postItem({ name: "Refuse" }, h.account.cookie), 409, "ITEM_LIMIT_REACHED", "a 200");
    expectStatus(await deleteItemAs(id, h.account.cookie), 200, "suppression");
    expectItem(await postItem({ name: "Accepte" }, h.account.cookie), 201, "ajout apres suppression");
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 200, rows: 200 });
    expectAppError(await postItem({ name: "Refuse encore" }, h.account.cookie), 409, "ITEM_LIMIT_REACHED", "a nouveau 200");
  });

  it("AC8 : la borne vaut par foyer : un foyer plein ne bloque pas un autre foyer", async () => {
    const full = await home("B3");
    const other = await home("B4");
    await seedItems(full.account.userId, 200);
    expectAppError(await postItem({ name: "Refuse" }, full.account.cookie), 409, "ITEM_LIMIT_REACHED", "foyer plein");
    expectItem(await postItem({ name: "Accepte" }, other.account.cookie), 201, "autre foyer");
    expect(await itemCountOf(other.householdId)).toEqual({ counter: 1, rows: 1 });
    expect(await itemCountOf(full.householdId)).toEqual({ counter: 200, rows: 200 });
  });
});

describe("AC8 : requetes simultanees", () => {
  it("AC8 : deux ajouts paralleles a 199 articles : exactement un 201 et un 409 ITEM_LIMIT_REACHED, item_count = 200 = lignes", async () => {
    const h = await home("C1");
    const member = await joinedMember(h, "Rival");
    await seedItems(h.account.userId, 199);
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 199, rows: 199 });

    const [ra, rb] = await Promise.all([postItem({ name: "Course A" }, h.account.cookie), postItem({ name: "Course B" }, member.cookie)]);
    expect([ra.status, rb.status].sort(), `${describeResult("A", ra)} ; ${describeResult("B", rb)}`).toEqual([201, 409]);
    expectAppError(ra.status === 409 ? ra : rb, 409, "ITEM_LIMIT_REACHED", "perdant");
    expectItem(ra.status === 201 ? ra : rb, 201, "gagnant");
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 200, rows: 200 });
  });

  it("AC8 : plusieurs ajouts paralleles a 197 articles : exactement trois 201, le reste 409, jamais de 500", async () => {
    const h = await home("C2");
    const member = await joinedMember(h, "Rival");
    await seedItems(h.account.userId, 197);
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => postItem({ name: `Rafale ${i}` }, i % 2 === 0 ? h.account.cookie : member.cookie)),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses, results.map((r) => describeResult("r", r)).join(" ; ")).toEqual([201, 201, 201, 409, 409, 409]);
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 200, rows: 200 });
  });

  it("AC8 : une suppression et un ajout paralleles a 200 articles : pas de 500 ni d'interblocage, la suppression reussit, 199 ou 200 selon l'ordre", async () => {
    const h = await home("C3");
    const member = await joinedMember(h, "Rival");
    await seedItems(h.account.userId, 199);
    const target = await addItemInOwnTx(h.account.userId, "A supprimer");

    const [del, add] = await Promise.all([deleteItemAs(target, h.account.cookie), postItem({ name: "Pendant" }, member.cookie)]);
    expectStatus(del, 200, "suppression parallele");
    expect([201, 409], describeResult("ajout parallele", add)).toContain(add.status);
    if (add.status === 409) expectAppError(add, 409, "ITEM_LIMIT_REACHED", "ajout refuse");
    const expected = add.status === 201 ? 200 : 199;
    expect(await itemCountOf(h.householdId)).toEqual({ counter: expected, rows: expected });
    expect(await itemRowById(target)).toBeUndefined();
  });

  it("AC8 : deux suppressions paralleles du meme article : un 200 et un 404, le compteur ne baisse qu'une fois", async () => {
    const h = await home("C4");
    const member = await joinedMember(h, "Rival");
    await seedItems(h.account.userId, 5);
    const target = await addItemInOwnTx(h.account.userId, "Cible");
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 6, rows: 6 });

    const [r1, r2] = await Promise.all([deleteItemAs(target, h.account.cookie), deleteItemAs(target, member.cookie)]);
    expect([r1.status, r2.status].sort(), `${describeResult("1", r1)} ; ${describeResult("2", r2)}`).toEqual([200, 404]);
    expectAppError(r1.status === 404 ? r1 : r2, 404, "ITEM_NOT_FOUND", "perdant");
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 5, rows: 5 });
  });

  it("AC8 : un ajout et un PATCH paralleles sur des articles differents ne se genent pas (pas de 500)", async () => {
    const h = await home("C5");
    const target = await addItemInOwnTx(h.account.userId, "Coche pendant");
    const [add, patch] = await Promise.all([
      postItem({ name: "Ajout pendant" }, h.account.cookie),
      patchItem(target, { purchased: true }, h.account.cookie),
    ]);
    expectStatus(add, 201, "ajout");
    expectStatus(patch, 200, "coche");
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 2, rows: 2 });
  });
});

describe("AC8 : serialisation observee (deterministe, deux connexions lc_app)", () => {
  it("AC8 : un 200e article non commite : le suivant attend le verrou du foyer, puis recoit LC008 apres le COMMIT", async () => {
    const h = await home("S1");
    const member = await joinedMember(h, "Second");
    await seedItems(h.account.userId, 199);

    let txA: AppTx | undefined;
    let txB: AppTx | undefined;
    try {
      txA = await openAppTx(h.account.userId);
      txB = await openAppTx(member.userId);
      await txA.client.query("SELECT lc.add_item('Le 200e', NULL)");

      const pending = settle(txB.client.query("SELECT lc.add_item('Le 201e', NULL)"));
      await waitUntilBlockedOnLock(txB.pid);
      const raced = await Promise.race([pending, new Promise<"toujours en attente">((r) => setTimeout(() => r("toujours en attente"), 150))]);
      expect(raced, "le second ajout ne doit pas aboutir avant le COMMIT du premier").toBe("toujours en attente");

      await txA.commit();
      const outcome = await pending;
      expect(outcome.status).toBe("rejected");
      expect(outcome.status === "rejected" ? pgCode(outcome.reason) : undefined).toBe("LC008");
      await txB.rollback();
      expect(await itemCountOf(h.householdId)).toEqual({ counter: 200, rows: 200 });
    } finally {
      await txA?.rollback();
      await txB?.rollback();
      txA?.release();
      txB?.release();
    }
  });

  it("AC8 : une suppression non commitee a 200 ne libere rien : l'ajout concurrent recoit LC008 tout de suite, puis reussit apres le COMMIT", async () => {
    const h = await home("S2");
    const member = await joinedMember(h, "Second");
    await seedItems(h.account.userId, 199);
    const target = await addItemInOwnTx(h.account.userId, "A retirer");

    let txA: AppTx | undefined;
    let txB: AppTx | undefined;
    try {
      txA = await openAppTx(h.account.userId);
      txB = await openAppTx(member.userId);
      const deleted = await txA.client.query("DELETE FROM lc.item WHERE id = $1", [target]);
      expect(deleted.rowCount).toBe(1);

      // Refus immediat, sans attente (mesure sur Postgres 16) : le CHECK est evalue sur la version de
      // l'instantane (200 + 1) avant l'attente du verrou de ligne. Refus pessimiste, la borne tient.
      const outcome = await settle(txB.client.query("SELECT lc.add_item('Pendant la suppression', NULL)"));
      expect(outcome.status).toBe("rejected");
      expect(outcome.status === "rejected" ? pgCode(outcome.reason) : undefined).toBe("LC008");
      await txB.rollback();

      await txA.commit();
      expect(await itemCountOf(h.householdId)).toEqual({ counter: 199, rows: 199 });
      await addItemInOwnTx(member.userId, "Apres la suppression");
      expect(await itemCountOf(h.householdId)).toEqual({ counter: 200, rows: 200 });
    } finally {
      await txA?.rollback();
      await txB?.rollback();
      txA?.release();
      txB?.release();
    }
  });

  it("AC8 : sous la borne (199), une suppression non commitee bloque l'ajout concurrent, qui reussit apres le COMMIT : 199, compteur exact", async () => {
    const h = await home("S3");
    const member = await joinedMember(h, "Second");
    await seedItems(h.account.userId, 198);
    const target = await addItemInOwnTx(h.account.userId, "A retirer");
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 199, rows: 199 });

    let txA: AppTx | undefined;
    let txB: AppTx | undefined;
    try {
      txA = await openAppTx(h.account.userId);
      txB = await openAppTx(member.userId);
      const deleted = await txA.client.query("DELETE FROM lc.item WHERE id = $1", [target]);
      expect(deleted.rowCount).toBe(1);

      const pending = settle(txB.client.query("SELECT lc.add_item('Pendant la suppression', NULL)"));
      await waitUntilBlockedOnLock(txB.pid);
      const raced = await Promise.race([pending, new Promise<"toujours en attente">((r) => setTimeout(() => r("toujours en attente"), 150))]);
      expect(raced, "l'ajout ne doit pas aboutir avant le COMMIT de la suppression").toBe("toujours en attente");

      await txA.commit();
      const outcome = await pending;
      expect(outcome.status, outcome.status === "rejected" ? String(pgCode(outcome.reason)) : "").toBe("fulfilled");
      await txB.commit();
      expect(await itemCountOf(h.householdId)).toEqual({ counter: 199, rows: 199 });
      expect(await itemRowById(target)).toBeUndefined();
    } finally {
      await txA?.rollback();
      await txB?.rollback();
      txA?.release();
      txB?.release();
    }
  });

  it("AC8 : deux suppressions du meme article : la seconde attend la premiere, puis ne touche aucune ligne ; le compteur ne baisse qu'une fois", async () => {
    const h = await home("S4");
    const member = await joinedMember(h, "Second");
    await seedItems(h.account.userId, 5);
    const target = await addItemInOwnTx(h.account.userId, "Cible");
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 6, rows: 6 });

    let txA: AppTx | undefined;
    let txB: AppTx | undefined;
    try {
      txA = await openAppTx(h.account.userId);
      txB = await openAppTx(member.userId);
      expect((await txA.client.query("DELETE FROM lc.item WHERE id = $1", [target])).rowCount).toBe(1);

      const pending = settle(txB.client.query("DELETE FROM lc.item WHERE id = $1", [target]));
      await waitUntilBlockedOnLock(txB.pid);
      const raced = await Promise.race([pending, new Promise<"toujours en attente">((r) => setTimeout(() => r("toujours en attente"), 150))]);
      expect(raced, "la seconde suppression ne doit pas aboutir avant le COMMIT de la premiere").toBe("toujours en attente");

      await txA.commit();
      const outcome = await pending;
      expect(outcome.status, outcome.status === "rejected" ? String(pgCode(outcome.reason)) : "").toBe("fulfilled");
      expect(outcome.status === "fulfilled" ? outcome.value.rowCount : undefined).toBe(0);
      await txB.commit();
      expect(await itemCountOf(h.householdId)).toEqual({ counter: 5, rows: 5 });
    } finally {
      await txA?.rollback();
      await txB?.rollback();
      txA?.release();
      txB?.release();
    }
  });
});
