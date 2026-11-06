/**
 * AC5 (tranche 003) : Isolation tenant (entre foyers, le foyer etant le tenant,
 * ADR-0002). Deux foyers reels A et B, chacun avec sa responsable et un article.
 * Par l'API, puis en base SOUS LE ROLE `lc_app` (`asApp` / `openAppTx` verifient
 * `current_user = lc_app` sans superutilisateur). L'administration ne sert qu'a
 * arranger et a relire, toujours filtree par les identifiants de A et B.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccount } from "../helpers/auth";
import { asApp, attempt, closePools, describeAttempt, resetDatabase } from "../helpers/db";
import { describePage, getPage } from "../helpers/household";
import { describeResult, expectAppError } from "../helpers/http";
import { home, openAppTx, type AppTx, type Home } from "../helpers/invite";
import {
  addItemInOwnTx,
  deleteItemAs,
  expectItem,
  expectList,
  getItems,
  itemCountOf,
  itemRowById,
  itemRowsOf,
  patchItem,
  postItem,
  unknownItemId,
} from "../helpers/items";

let A: Home;
let B: Home;
let itemA: string;
let itemB: string;

beforeAll(async () => {
  await resetDatabase();
  A = await home("IA");
  B = await home("IB");
  expect(A.householdId).not.toBe(B.householdId);
  itemA = expectItem(await postItem({ name: "ArticleDeA" }, A.account.cookie), 201, "article de A").id;
  itemB = expectItem(await postItem({ name: "ArticleDeB", quantity: "9" }, B.account.cookie), 201, "article de B").id;
});
afterAll(closePools);

describe("AC5 : Isolation tenant (entre foyers), par l'API", () => {
  it("AC5 : A ne voit aucun article de B dans GET, et B aucun de A", async () => {
    const a = await getItems(A.account.cookie);
    expect(expectList(a, "GET A").map((i) => i.id)).toEqual([itemA]);
    expect(a.text, describeResult("GET A", a)).not.toContain("ArticleDeB");
    expect(a.text).not.toContain(itemB);
    const b = await getItems(B.account.cookie);
    expect(expectList(b, "GET B").map((i) => i.id)).toEqual([itemB]);
    expect(b.text).not.toContain("ArticleDeA");
  });

  it("AC5 : la page de A ne montre aucun article de B", async () => {
    const page = await getPage("/household", A.account.cookie);
    expect(page.status, describePage("GET /household de A", page)).toBe(200);
    expect(page.html, describePage("controle positif : article de A", page)).toContain("ArticleDeA");
    expect(page.html, describePage("GET /household de A", page)).not.toContain("ArticleDeB");
    expect(page.html).not.toContain(itemB);
  });

  it("AC5 : PATCH de A sur un article de B donne 404 ITEM_NOT_FOUND, identique a un identifiant inexistant ou mal forme, et B est intact", async () => {
    const before = await itemRowById(itemB);
    const countBefore = await itemCountOf(B.householdId);
    const cross = await patchItem(itemB, { purchased: true }, A.account.cookie);
    expectAppError(cross, 404, "ITEM_NOT_FOUND", "PATCH croise");
    const missing = await patchItem(unknownItemId(), { purchased: true }, A.account.cookie);
    const malformed = await patchItem("pas-un-uuid", { purchased: true }, A.account.cookie);
    for (const other of [missing, malformed]) {
      expect(other.status, describeResult("reference", other)).toBe(cross.status);
      expect(other.body, describeResult("reference", other)).toEqual(cross.body);
      expect(other.text).toBe(cross.text);
    }
    expect(await itemRowById(itemB)).toEqual(before);
    expect(await itemCountOf(B.householdId)).toEqual(countBefore);
  });

  it("AC5 : PATCH de A sur un article de B avec un corps invalide donne le meme 404 (jamais 422)", async () => {
    const cross = await patchItem(itemB, { purchased: "oui" }, A.account.cookie);
    const missing = await patchItem(unknownItemId(), { purchased: "oui" }, A.account.cookie);
    expectAppError(cross, 404, "ITEM_NOT_FOUND", "PATCH croise, corps invalide");
    expect(missing.text).toBe(cross.text);
  });

  it("AC5 : DELETE de A sur un article de B donne 404 ITEM_NOT_FOUND, identique a un identifiant inexistant ou mal forme, et B est intact", async () => {
    const before = await itemRowById(itemB);
    const countBefore = await itemCountOf(B.householdId);
    const cross = await deleteItemAs(itemB, A.account.cookie);
    expectAppError(cross, 404, "ITEM_NOT_FOUND", "DELETE croise");
    const missing = await deleteItemAs(unknownItemId(), A.account.cookie);
    const malformed = await deleteItemAs("pas-un-uuid", A.account.cookie);
    for (const other of [missing, malformed]) {
      expect(other.status, describeResult("reference", other)).toBe(cross.status);
      expect(other.body, describeResult("reference", other)).toEqual(cross.body);
      expect(other.text).toBe(cross.text);
    }
    expect(await itemRowById(itemB)).toEqual(before);
    expect(await itemCountOf(B.householdId)).toEqual(countBefore);
    expect(expectList(await getItems(B.account.cookie), "GET B").map((i) => i.id)).toEqual([itemB]);
  });

  it("AC5 : un POST de A avec un household_id de B dans le corps cree l'article dans A", async () => {
    const r = await postItem({ name: "VersB", household_id: B.householdId, householdId: B.householdId }, A.account.cookie);
    const item = expectItem(r, 201, "POST avec foyer force");
    expect((await itemRowById(item.id))?.household_id).toBe(A.householdId);
    expect((await itemRowsOf(B.householdId)).map((i) => i.id)).toEqual([itemB]);
  });

  it("AC5 : item_count de A et de B egalent chacun le nombre de leurs lignes", async () => {
    const a = await itemCountOf(A.householdId);
    const b = await itemCountOf(B.householdId);
    expect(a.counter).toBe(a.rows);
    expect(b).toEqual({ counter: 1, rows: 1 });
  });
});

describe("AC5 : Isolation tenant (entre foyers), en base sous lc_app", () => {
  it("AC5 : avec app.user_id de A, SELECT ne rend aucune ligne de B (par id, par foyer, par nom)", async () => {
    await asApp(A.account.userId, async (c) => {
      const byId = await c.query("SELECT id FROM lc.item WHERE id = $1", [itemB]);
      expect(byId.rowCount).toBe(0);
      const byHousehold = await c.query("SELECT id FROM lc.item WHERE household_id = $1", [B.householdId]);
      expect(byHousehold.rowCount).toBe(0);
      const mine = await c.query<{ household_id: string }>("SELECT household_id FROM lc.item WHERE id = ANY($1)", [[itemA, itemB]]);
      expect(mine.rows).toEqual([{ household_id: A.householdId }]);
      const all = await c.query<{ household_id: string }>("SELECT DISTINCT household_id FROM lc.item");
      expect(all.rows).toEqual([{ household_id: A.householdId }]);
    });
  });

  it("AC5 : UPDATE et DELETE visant B touchent zero ligne, y compris avec un app.household_id force sur B (ignore)", async () => {
    await asApp(A.account.userId, async (c) => {
      for (const forced of [false, true]) {
        if (forced) await c.query("SELECT set_config('app.household_id', $1, true)", [B.householdId]);
        const upd = await attempt(c, "UPDATE lc.item SET purchased = true WHERE id = $1", [itemB]);
        expect(upd, describeAttempt(`UPDATE sur B (force=${forced})`, upd)).toEqual({ ok: true, rowCount: 0 });
        const updByHousehold = await attempt(c, "UPDATE lc.item SET purchased = true WHERE household_id = $1", [B.householdId]);
        expect(updByHousehold, describeAttempt(`UPDATE par foyer B (force=${forced})`, updByHousehold)).toEqual({ ok: true, rowCount: 0 });
        const del = await attempt(c, "DELETE FROM lc.item WHERE id = $1", [itemB]);
        expect(del, describeAttempt(`DELETE sur B (force=${forced})`, del)).toEqual({ ok: true, rowCount: 0 });
        const delByHousehold = await attempt(c, "DELETE FROM lc.item WHERE household_id = $1", [B.householdId]);
        expect(delByHousehold, describeAttempt(`DELETE par foyer B (force=${forced})`, delByHousehold)).toEqual({ ok: true, rowCount: 0 });
      }
    });
    // La preuve est rowCount: 0 ci-dessus ; les deux lignes suivantes ne constatent que l'absence d'effet.
    expect((await itemRowById(itemB))?.purchased).toBe(false);
    expect(await itemCountOf(B.householdId)).toEqual({ counter: 1, rows: 1 });
  });

  it("AC5 : UPDATE d'un article de A ne peut pas le deplacer vers B (household_id n'est pas modifiable par lc_app)", async () => {
    await asApp(A.account.userId, async (c) => {
      const moved = await attempt(c, "UPDATE lc.item SET household_id = $1 WHERE id = $2", [B.householdId, itemA]);
      expect(moved, describeAttempt("deplacement vers B", moved)).toEqual({ ok: false, code: "42501" });
    });
    expect((await itemRowById(itemA))?.household_id).toBe(A.householdId);
  });

  it("AC5 : add_item sous app.user_id de A, avec un app.household_id force sur B, cree l'article dans A avec A pour auteur", async () => {
    await asApp(A.account.userId, async (c) => {
      await c.query("SELECT set_config('app.household_id', $1, true)", [B.householdId]);
      const r = await c.query<{ id: string }>("SELECT lc.add_item('Force sur B', NULL) AS id");
      const id = r.rows[0]?.id ?? "";
      const row = await c.query<{ household_id: string; author_user_id: string }>(
        "SELECT household_id, author_user_id FROM lc.item WHERE id = $1",
        [id],
      );
      expect(row.rows).toEqual([{ household_id: A.householdId, author_user_id: A.account.userId }]);
    });
  });

  it("AC5 : add_item COMMITE avec app.household_id force sur B : A gagne une ligne, B aucune, compteurs exacts", async () => {
    const a = await home("IC");
    const b = await home("ID");
    await addItemInOwnTx(b.account.userId, "Deja la");
    let tx: AppTx | undefined;
    try {
      tx = await openAppTx(a.account.userId);
      await tx.client.query("SELECT set_config('app.household_id', $1, true)", [b.householdId]);
      const r = await tx.client.query<{ id: string }>("SELECT lc.add_item('Commite', NULL) AS id");
      await tx.commit();
      const row = await itemRowById(r.rows[0]?.id ?? "");
      expect(row).toMatchObject({ household_id: a.householdId, author_user_id: a.account.userId });
      expect(await itemCountOf(a.householdId)).toEqual({ counter: 1, rows: 1 });
      expect(await itemCountOf(b.householdId)).toEqual({ counter: 1, rows: 1 });
    } finally {
      await tx?.rollback();
      tx?.release();
    }
  });

  it("AC5 : un compte sans foyer ne voit aucun article et ne peut en modifier aucun sous lc_app", async () => {
    const lonely = await createAccount({ name: "Seul" });
    await asApp(lonely.userId, async (c) => {
      await c.query("SELECT set_config('app.household_id', $1, true)", [B.householdId]);
      expect((await c.query("SELECT id FROM lc.item WHERE id = ANY($1)", [[itemA, itemB]])).rowCount).toBe(0);
      expect(await attempt(c, "UPDATE lc.item SET purchased = true WHERE id = $1", [itemB])).toEqual({ ok: true, rowCount: 0 });
      expect(await attempt(c, "DELETE FROM lc.item WHERE id = $1", [itemB])).toEqual({ ok: true, rowCount: 0 });
    });
  });

  it("AC5 : sans app.user_id, lc_app ne voit aucun article", async () => {
    await asApp(undefined, async (c) => {
      expect((await c.query("SELECT id FROM lc.item WHERE id = ANY($1)", [[itemA, itemB]])).rowCount).toBe(0);
    });
  });

  it("AC5 : item_count de A et de B restent chacun egaux au nombre de leurs lignes", async () => {
    const a = await itemCountOf(A.householdId);
    const b = await itemCountOf(B.householdId);
    expect(a.counter).toBe(a.rows);
    expect(b.counter).toBe(b.rows);
    expect((await itemRowsOf(B.householdId)).map((i) => i.id)).toEqual([itemB]);
  });
});
