/**
 * AC6 (cocher et decocher) et AC7 (supprimer), tranche 003.
 * Foyers et membres crees par l'API reelle ; la base est relue par l'administration.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools, resetDatabase } from "../helpers/db";
import { describeResult, expectAppError, expectStatus } from "../helpers/http";
import { home, joinedMember, type Home } from "../helpers/invite";
import { deleteItemAs, expectItem, expectList, getItems, itemCountOf, itemRowById, patchItem, patchItemRaw, postItem } from "../helpers/items";
import type { Account } from "../helpers/auth";

let H: Home;
let MEMBER: Account;

beforeAll(async () => {
  await resetDatabase();
  H = await home("TD");
  MEMBER = await joinedMember(H, "Coequipier");
});
afterAll(closePools);

async function newItem(cookie: string, name: string, quantity?: string): Promise<string> {
  const payload = quantity === undefined ? { name } : { name, quantity };
  return expectItem(await postItem(payload, cookie), 201, `ajout ${name}`).id;
}

describe("AC6 : cocher et decocher", () => {
  it("AC6 : PATCH { purchased: true } donne 200 et l'article coche, { purchased: false } le decoche, la base suit", async () => {
    const id = await newItem(H.account.cookie, "Yaourts", "4");
    const on = expectItem(await patchItem(id, { purchased: true }, H.account.cookie), 200, "cocher");
    expect(on).toMatchObject({ id, name: "Yaourts", quantity: "4", purchased: true });
    expect((await itemRowById(id))?.purchased).toBe(true);
    expect(expectList(await getItems(H.account.cookie), "GET").find((i) => i.id === id)?.purchased).toBe(true);

    const off = expectItem(await patchItem(id, { purchased: false }, H.account.cookie), 200, "decocher");
    expect(off.purchased).toBe(false);
    expect((await itemRowById(id))?.purchased).toBe(false);
  });

  it("AC6 : un membre coche et decoche l'article de la responsable, et inversement", async () => {
    const byOwner = await newItem(H.account.cookie, "De la responsable");
    const byMember = await newItem(MEMBER.cookie, "Du membre");

    expect(expectItem(await patchItem(byOwner, { purchased: true }, MEMBER.cookie), 200, "membre coche").purchased).toBe(true);
    expect(expectItem(await patchItem(byOwner, { purchased: false }, MEMBER.cookie), 200, "membre decoche").purchased).toBe(false);
    expect(expectItem(await patchItem(byMember, { purchased: true }, H.account.cookie), 200, "responsable coche").purchased).toBe(true);
    expect(expectItem(await patchItem(byMember, { purchased: false }, H.account.cookie), 200, "responsable decoche").purchased).toBe(false);
  });

  it("AC6 : rejouer la meme valeur donne 200 et le meme etat final", async () => {
    const id = await newItem(H.account.cookie, "Rejeu");
    for (const attempt of [1, 2, 3]) {
      expect(expectItem(await patchItem(id, { purchased: true }, H.account.cookie), 200, `coche ${attempt}`).purchased).toBe(true);
    }
    expect((await itemRowById(id))?.purchased).toBe(true);
    for (const attempt of [1, 2]) {
      expect(expectItem(await patchItem(id, { purchased: false }, H.account.cookie), 200, `decoche ${attempt}`).purchased).toBe(false);
    }
    expect((await itemRowById(id))?.purchased).toBe(false);
  });

  const invalid: [string, unknown][] = [
    ["purchased absent", {}],
    ["purchased null", { purchased: null }],
    ["purchased chaine", { purchased: "true" }],
    ["purchased nombre", { purchased: 1 }],
    ["purchased tableau", { purchased: [true] }],
    ["purchased objet", { purchased: { v: true } }],
  ];

  it.each(invalid)("AC6 : %s donne 422 avec fields contenant purchased, et l'etat ne change pas", async (label, payload) => {
    const id = await newItem(H.account.cookie, "Intact");
    await patchItem(id, { purchased: true }, H.account.cookie);
    const before = await itemRowById(id);
    const r = await patchItem(id, payload, H.account.cookie);
    expectAppError(r, 422, "VALIDATION_FAILED", label);
    const fields = (r.body as { error: { fields?: string[] } }).error.fields ?? [];
    expect(fields, describeResult(`${label} : fields`, r)).toContain("purchased");
    expect(await itemRowById(id)).toEqual(before);
  });

  it("AC6 : un corps non JSON ou absent donne 422 sur un article present, sans changer l'etat", async () => {
    const id = await newItem(H.account.cookie, "Corps casse");
    expectAppError(await patchItemRaw(id, "{pas du json", H.account.cookie), 422, "VALIDATION_FAILED", "non JSON");
    expectAppError(await patchItemRaw(id, "", H.account.cookie), 422, "VALIDATION_FAILED", "corps absent");
    expect((await itemRowById(id))?.purchased).toBe(false);
  });

  it("AC6 : un itemId place dans le corps est ignore : seul le parametre de route compte", async () => {
    const target = await newItem(H.account.cookie, "Cible");
    const decoy = await newItem(H.account.cookie, "Leurre");
    const r = await patchItem(target, { purchased: true, itemId: decoy, id: decoy }, H.account.cookie);
    expect(expectItem(r, 200, "PATCH avec itemId dans le corps").id).toBe(target);
    expect((await itemRowById(target))?.purchased).toBe(true);
    expect((await itemRowById(decoy))?.purchased).toBe(false);
  });

  it("AC6 : seul purchased change : name, quantity, auteur et created_at restent identiques, item_count ne bouge pas", async () => {
    const id = await newItem(MEMBER.cookie, "Immuable", "7 unites");
    const before = await itemRowById(id);
    const countBefore = await itemCountOf(H.householdId);

    const r = await patchItem(id, { purchased: true, name: "Pirate", quantity: "0", author_name: "Pirate" }, H.account.cookie);
    const item = expectItem(r, 200, "PATCH avec champs en trop");
    expect(item).toMatchObject({ name: "Immuable", quantity: "7 unites", addedBy: { name: MEMBER.name } });

    const after = await itemRowById(id);
    expect(after).toEqual({ ...before, purchased: true });
    expect(after?.created_at.getTime()).toBe(before?.created_at.getTime());
    expect(await itemCountOf(H.householdId)).toEqual(countBefore);
  });
});

describe("AC7 : supprimer", () => {
  it("AC7 : DELETE donne 200 { deleted: true } et l'article disparait de GET et de la base", async () => {
    const id = await newItem(H.account.cookie, "A supprimer");
    const r = await deleteItemAs(id, H.account.cookie);
    expectStatus(r, 200, "DELETE");
    expect(r.body, describeResult("corps du DELETE", r)).toEqual({ deleted: true });
    expect(expectList(await getItems(H.account.cookie), "GET").some((i) => i.id === id)).toBe(false);
    expect(await itemRowById(id)).toBeUndefined();
  });

  it("AC7 : un membre supprime l'article de la responsable, et inversement", async () => {
    const byOwner = await newItem(H.account.cookie, "Responsable");
    const byMember = await newItem(MEMBER.cookie, "Membre");
    expect((await deleteItemAs(byOwner, MEMBER.cookie)).body).toEqual({ deleted: true });
    expect((await deleteItemAs(byMember, H.account.cookie)).body).toEqual({ deleted: true });
    expect(await itemRowById(byOwner)).toBeUndefined();
    expect(await itemRowById(byMember)).toBeUndefined();
  });

  it("AC7 : un rejeu donne 404 ITEM_NOT_FOUND sans autre effet", async () => {
    const h = await home("TR");
    const id = await newItem(h.account.cookie, "Une fois");
    await newItem(h.account.cookie, "Reste");
    expectStatus(await deleteItemAs(id, h.account.cookie), 200, "premier DELETE");
    const countAfterFirst = await itemCountOf(h.householdId);
    expect(countAfterFirst).toEqual({ counter: 1, rows: 1 });
    expectAppError(await deleteItemAs(id, h.account.cookie), 404, "ITEM_NOT_FOUND", "rejeu");
    expect(await itemCountOf(h.householdId)).toEqual(countAfterFirst);
    expect(expectList(await getItems(h.account.cookie), "GET").map((i) => i.name)).toEqual(["Reste"]);
  });

  it("AC7 : un article supprime ne peut plus etre coche (404)", async () => {
    const id = await newItem(H.account.cookie, "Fantome");
    await deleteItemAs(id, H.account.cookie);
    expectAppError(await patchItem(id, { purchased: true }, H.account.cookie), 404, "ITEM_NOT_FOUND", "PATCH apres DELETE");
  });

  it("AC7 : item_count diminue de 1 par suppression et egale le nombre de lignes", async () => {
    const h = await home("TC");
    const ids: string[] = [];
    for (const n of ["a", "b", "c"]) ids.push(await newItem(h.account.cookie, n));
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 3, rows: 3 });
    await deleteItemAs(ids[0] ?? "", h.account.cookie);
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 2, rows: 2 });
    await patchItem(ids[1] ?? "", { purchased: true }, h.account.cookie);
    await deleteItemAs(ids[1] ?? "", h.account.cookie);
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 1, rows: 1 });
  });
});
