/**
 * AC1 (tranche 003) : voir la liste (US-06.1, US-06.3, US-06.4, US-06.5).
 * Foyers crees par l'API reelle ; articles ajoutes par l'API (transactions
 * distinctes, donc ordre d'ajout fiable).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools, resetDatabase } from "../helpers/db";
import { describeResult, expectStatus } from "../helpers/http";
import { home, joinedMember } from "../helpers/invite";
import { deleteItemAs, expectItem, expectList, getItems, patchItem, postItem } from "../helpers/items";

beforeAll(resetDatabase);
afterAll(closePools);

describe("AC1 : voir la liste", () => {
  it("AC1 : un foyer sans article donne 200 { items: [] }", async () => {
    const h = await home("L1");
    const r = await getItems(h.account.cookie);
    expectStatus(r, 200, "GET items d'un foyer vide");
    expect(r.body, describeResult("GET items d'un foyer vide", r)).toEqual({ items: [] });
  });

  it("AC1 : chaque article porte exactement id, name, quantity (null si absente), purchased, addedBy.name, createdAt", async () => {
    const h = await home("L2");
    expectItem(await postItem({ name: "Lait", quantity: "2 L" }, h.account.cookie), 201, "ajout avec quantite");
    expectItem(await postItem({ name: "Pain" }, h.account.cookie), 201, "ajout sans quantite");

    const r = await getItems(h.account.cookie);
    const items = expectList(r, "GET items");
    expect(items).toHaveLength(2);
    const [milk, bread] = items;
    expect(milk).toMatchObject({ name: "Lait", quantity: "2 L", purchased: false, addedBy: { name: h.account.name } });
    expect(bread).toMatchObject({ name: "Pain", quantity: null, purchased: false, addedBy: { name: h.account.name } });
    const rawItems = (r.body as { items: Record<string, unknown>[] }).items;
    for (const raw of rawItems) {
      expect(Object.keys(raw).sort(), describeResult("cles d'un article de la liste", r)).toEqual([
        "addedBy",
        "createdAt",
        "id",
        "name",
        "purchased",
        "quantity",
      ]);
      expect(Object.keys(raw.addedBy as object)).toEqual(["name"]);
    }
    expect(r.text, "ni household_id ni author_user_id ne sont exposes").not.toMatch(/household_?id|author_?user_?id|householdId|authorUserId/i);
    expect(r.text).not.toContain(h.householdId);
    expect(r.text).not.toContain(h.account.userId);
    expect(Number.isNaN(Date.parse(milk?.createdAt ?? ""))).toBe(false);
  });

  it("AC1 : la responsable et un membre du meme foyer voient exactement la meme liste", async () => {
    const h = await home("L3");
    const member = await joinedMember(h, "Voisin");
    expectItem(await postItem({ name: "Oeufs", quantity: "12" }, h.account.cookie), 201, "ajout responsable");
    expectItem(await postItem({ name: "Beurre" }, member.cookie), 201, "ajout membre");

    const fromOwner = expectList(await getItems(h.account.cookie), "GET responsable");
    const fromMember = expectList(await getItems(member.cookie), "GET membre");
    expect(fromMember).toEqual(fromOwner);
    expect(fromOwner.map((i) => i.name)).toEqual(["Oeufs", "Beurre"]);
    expect(fromOwner.map((i) => i.addedBy.name)).toEqual([h.account.name, "Voisin"]);
  });

  it("AC1 : les articles sortent dans l'ordre d'ajout, meme apres que le premier a ete coche", async () => {
    const h = await home("L4");
    const names = ["Premier", "Deuxieme", "Troisieme", "Quatrieme"];
    const ids: string[] = [];
    for (const name of names) ids.push(expectItem(await postItem({ name }, h.account.cookie), 201, `ajout ${name}`).id);

    expect(expectList(await getItems(h.account.cookie), "GET avant").map((i) => i.name)).toEqual(names);
    expectItem(await patchItem(ids[0] ?? "", { purchased: true }, h.account.cookie), 200, "cocher le premier");
    const after = expectList(await getItems(h.account.cookie), "GET apres");
    expect(after.map((i) => i.name)).toEqual(names);
    expect(after[0]?.purchased).toBe(true);
    const created = after.map((i) => Date.parse(i.createdAt));
    expect([...created].sort((a, b) => a - b)).toEqual(created);
  });

  it("AC1 : la reponse porte Cache-Control: no-store", async () => {
    const h = await home("L5");
    const r = await getItems(h.account.cookie);
    expectStatus(r, 200, "GET items");
    expect(r.headers.get("cache-control") ?? "", describeResult("en-tete Cache-Control", r)).toContain("no-store");
  });

  it("AC1 : un changement d'un autre membre apparait a la lecture suivante (ajout, coche, suppression)", async () => {
    const h = await home("L6");
    const member = await joinedMember(h, "Autre");
    expect(expectList(await getItems(h.account.cookie), "lecture 0")).toEqual([]);

    const added = expectItem(await postItem({ name: "Farine" }, member.cookie), 201, "ajout par le membre");
    const first = expectList(await getItems(h.account.cookie), "lecture 1");
    expect(first.map((i) => i.id)).toEqual([added.id]);
    expect(first[0]?.purchased).toBe(false);

    expectItem(await patchItem(added.id, { purchased: true }, member.cookie), 200, "coche par le membre");
    expect(expectList(await getItems(h.account.cookie), "lecture 2")[0]?.purchased).toBe(true);

    expectStatus(await deleteItemAs(added.id, member.cookie), 200, "suppression par le membre");
    expect(expectList(await getItems(h.account.cookie), "lecture 3")).toEqual([]);
  });
});
