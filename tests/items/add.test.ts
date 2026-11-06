/**
 * AC2 (ajouter) et AC3 (ajout refuse par la validation), tranche 003.
 * Les longueurs se comptent en points de code (Q-2) : les bornes sont aussi
 * eprouvees avec des emoji (2 unites UTF-16 chacun).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePools, resetDatabase } from "../helpers/db";
import { membershipsOfUser } from "../helpers/household";
import { describeResult, expectAppError } from "../helpers/http";
import { home, type Home } from "../helpers/invite";
import { expectItem, expectList, getItems, itemCountOf, itemRowById, itemRowsOf, postItem, postItemRaw } from "../helpers/items";

let H: Home;
let OTHER: Home;

beforeAll(async () => {
  await resetDatabase();
  H = await home("AD");
  OTHER = await home("AO");
});
afterAll(closePools);

describe("AC2 : ajouter un article", () => {
  it("AC2 : POST donne 201 et l'article : non coche, addedBy.name = prenom de l'appelant, quantity null si absente", async () => {
    const r = await postItem({ name: "Lait" }, H.account.cookie);
    const item = expectItem(r, 201, "POST sans quantite");
    expect(item).toMatchObject({ name: "Lait", quantity: null, purchased: false, addedBy: { name: H.account.name } });
    const withQty = expectItem(await postItem({ name: "Pates", quantity: "500 g" }, H.account.cookie), 201, "POST avec quantite");
    expect(withQty).toMatchObject({ name: "Pates", quantity: "500 g", purchased: false });
    expect(expectList(await getItems(H.account.cookie), "GET").map((i) => i.id)).toEqual(expect.arrayContaining([item.id, withQty.id]));
  });

  it("AC2 : les espaces de bord sont retires du nom et de la quantite, et la valeur retiree est enregistree", async () => {
    const item = expectItem(await postItem({ name: "  Cafe moulu \t", quantity: "  2 paquets  " }, H.account.cookie), 201, "POST avec espaces");
    expect(item.name).toBe("Cafe moulu");
    expect(item.quantity).toBe("2 paquets");
    const row = await itemRowById(item.id);
    expect(row?.name).toBe("Cafe moulu");
    expect(row?.quantity).toBe("2 paquets");
  });

  it.each([
    ["absente", undefined],
    ["null", null],
    ["vide", ""],
    ["faite d'espaces", "   \t "],
  ])("AC2 : une quantite %s est enregistree NULL", async (_label, quantity) => {
    const payload = quantity === undefined ? { name: "Sel" } : { name: "Sel", quantity };
    const item = expectItem(await postItem(payload, H.account.cookie), 201, `POST quantite ${_label}`);
    expect(item.quantity).toBeNull();
    expect((await itemRowById(item.id))?.quantity).toBeNull();
  });

  it("AC2 : bornes atteintes acceptees : nom de 100 et quantite de 30 points de code, emoji compris", async () => {
    const plainName = "n".repeat(100);
    const plainQty = "q".repeat(30);
    const a = expectItem(await postItem({ name: plainName, quantity: plainQty }, H.account.cookie), 201, "bornes ASCII");
    expect([...a.name]).toHaveLength(100);
    expect([...(a.quantity ?? "")]).toHaveLength(30);

    const emojiName = "😀".repeat(100);
    const emojiQty = "🍎".repeat(30);
    const b = expectItem(await postItem({ name: emojiName, quantity: emojiQty }, H.account.cookie), 201, "bornes emoji");
    expect(b.name).toBe(emojiName);
    expect(b.quantity).toBe(emojiQty);
    const row = await itemRowById(b.id);
    expect(row?.name).toBe(emojiName);
    expect(row?.quantity).toBe(emojiQty);
  });

  it("AC2 : une quantite de 30 points de code entouree d'espaces est acceptee (la borne porte sur la valeur retiree)", async () => {
    const item = expectItem(await postItem({ name: "Borne", quantity: `  ${"q".repeat(30)}  ` }, H.account.cookie), 201, "quantite 30 + espaces");
    expect(item.quantity).toBe("q".repeat(30));
  });

  it("AC2 : deux articles du meme nom coexistent, avec des identifiants distincts", async () => {
    const a = expectItem(await postItem({ name: "Doublon" }, H.account.cookie), 201, "premier");
    const b = expectItem(await postItem({ name: "Doublon" }, H.account.cookie), 201, "second");
    expect(a.id).not.toBe(b.id);
    const sameName = expectList(await getItems(H.account.cookie), "GET").filter((i) => i.name === "Doublon");
    expect(sameName.map((i) => i.id)).toEqual([a.id, b.id]);
  });

  it("AC2 : en base, author_user_id = appelant, author_name = display_name de son appartenance, item_count +1 et egal aux lignes", async () => {
    const h = await home("AB");
    const before = await itemCountOf(h.householdId);
    expect(before).toEqual({ counter: 0, rows: 0 });
    const item = expectItem(await postItem({ name: "Verifie", quantity: "3" }, h.account.cookie), 201, "POST");
    const row = await itemRowById(item.id);
    const membership = (await membershipsOfUser(h.account.userId))[0];
    expect(row).toMatchObject({ household_id: h.householdId, author_user_id: h.account.userId, author_name: membership?.display_name, purchased: false });
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 1, rows: 1 });
    expectItem(await postItem({ name: "Verifie 2" }, h.account.cookie), 201, "POST 2");
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 2, rows: 2 });
  });

  it("AC2 : un corps qui ajoute purchased: true, un auteur ou un foyer n'a aucun effet : tout vient de la session", async () => {
    const h = await home("AE");
    const r = await postItem(
      {
        name: "Intrus",
        purchased: true,
        author_user_id: OTHER.account.userId,
        authorUserId: OTHER.account.userId,
        author_name: "Pirate",
        addedBy: { name: "Pirate" },
        household_id: OTHER.householdId,
        householdId: OTHER.householdId,
        id: "00000000-0000-4000-8000-000000000000",
        createdAt: "2001-01-01T00:00:00.000Z",
      },
      h.account.cookie,
    );
    const item = expectItem(r, 201, "POST avec champs en trop");
    expect(item.purchased).toBe(false);
    expect(item.addedBy.name).toBe(h.account.name);
    expect(item.id).not.toBe("00000000-0000-4000-8000-000000000000");
    expect(item.createdAt.startsWith("2001")).toBe(false);
    const row = await itemRowById(item.id);
    expect(row).toMatchObject({ household_id: h.householdId, author_user_id: h.account.userId, purchased: false });
    expect(row?.author_name).not.toBe("Pirate");
    expect((await itemRowsOf(OTHER.householdId)).some((i) => i.id === item.id)).toBe(false);
  });
});

/** Valeur qui ne doit jamais etre renvoyee par une reponse 422. */
const SENTINEL = "VALEUR-RECUE-INVENTEE";

describe("AC3 : ajout refuse par la validation", () => {
  async function expectRejected(payload: unknown, field: "name" | "quantity", label: string): Promise<void> {
    const h = await home(`AV${Math.abs(label.length)}`);
    const before = await itemCountOf(h.householdId);
    const r = await postItem(payload, h.account.cookie);
    expectAppError(r, 422, "VALIDATION_FAILED", label);
    const fields = (r.body as { error: { fields?: string[] } }).error.fields ?? [];
    expect(fields, describeResult(`${label} : fields`, r)).toContain(field);
    expect(r.text, describeResult(`${label} : la valeur recue ne doit pas etre renvoyee`, r)).not.toContain(SENTINEL);
    expect(await itemRowsOf(h.householdId), `${label} : aucune ligne creee`).toEqual([]);
    expect(await itemCountOf(h.householdId)).toEqual(before);
  }

  const badNames: [string, unknown][] = [
    ["name absent", {}],
    ["name vide", { name: "" }],
    ["name fait d'espaces", { name: "  \t  " }],
    ["name de 101 caracteres", { name: `${SENTINEL}${"x".repeat(101)}` }],
    ["name de 101 emoji", { name: "😀".repeat(101) }],
    ["name null", { name: null }],
    ["name nombre", { name: 123 }],
    ["name booleen", { name: true }],
    ["name tableau", { name: [SENTINEL] }],
    ["name objet", { name: { v: SENTINEL } }],
  ];

  it.each(badNames)("AC3 : %s donne 422 VALIDATION_FAILED avec fields contenant name", async (label, payload) => {
    await expectRejected(payload, "name", label);
  });

  const badQuantities: [string, unknown][] = [
    ["quantity de 31 caracteres", { name: "Ok", quantity: `${SENTINEL}${"q".repeat(31)}` }],
    ["quantity de 31 caracteres apres retrait des espaces", { name: "Ok", quantity: `  ${"q".repeat(31)}  ` }],
    ["quantity de 31 emoji", { name: "Ok", quantity: "🍎".repeat(31) }],
    ["quantity nombre", { name: "Ok", quantity: 5 }],
    ["quantity booleenne", { name: "Ok", quantity: false }],
    ["quantity tableau", { name: "Ok", quantity: [SENTINEL] }],
    ["quantity objet", { name: "Ok", quantity: { v: SENTINEL } }],
  ];

  it.each(badQuantities)("AC3 : %s donne 422 VALIDATION_FAILED avec fields contenant quantity", async (label, payload) => {
    await expectRejected(payload, "quantity", label);
  });

  it("AC3 : un nom et une quantite tous deux invalides citent les deux champs", async () => {
    const h = await home("AX");
    const r = await postItem({ name: "", quantity: "q".repeat(31) }, h.account.cookie);
    expectAppError(r, 422, "VALIDATION_FAILED", "deux champs");
    const fields = (r.body as { error: { fields?: string[] } }).error.fields ?? [];
    expect(fields).toEqual(expect.arrayContaining(["name", "quantity"]));
  });

  const badBodies: [string, string][] = [
    ["corps absent", ""],
    ["corps non JSON", `{${SENTINEL}`],
    ["corps JSON null", "null"],
    ["corps JSON tableau", "[]"],
    ["corps JSON chaine", `"${SENTINEL}"`],
  ];

  it.each(badBodies)("AC3 : %s donne 422 VALIDATION_FAILED, sans ligne creee ni valeur renvoyee", async (label, raw) => {
    const h = await home("AY");
    const r = await postItemRaw(raw, h.account.cookie);
    expectAppError(r, 422, "VALIDATION_FAILED", label);
    expect(r.text, describeResult(`${label} : valeur recue renvoyee`, r)).not.toContain(SENTINEL);
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 0, rows: 0 });
  });
});
