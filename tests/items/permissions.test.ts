/**
 * AC4 (tranche 003) : permissions et ordre de verification (ADR-0003).
 * Session, puis foyer, puis (PATCH) forme de l'identifiant et existence, puis corps.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccount } from "../helpers/auth";
import { closePools, resetDatabase } from "../helpers/db";
import { expectAppError } from "../helpers/http";
import { home, joinedMember, type Home } from "../helpers/invite";
import {
  addItemInOwnTx,
  deleteItemAs,
  expectItem,
  getItems,
  itemCountOf,
  itemRowById,
  patchItem,
  patchItemRaw,
  postItem,
  postItemRaw,
  seedItems,
  unknownItemId,
  type ItemResult,
} from "../helpers/items";

let H: Home;
beforeAll(async () => {
  await resetDatabase();
  H = await home("PM");
});
afterAll(closePools);

type Call = (cookie: string | undefined) => Promise<ItemResult>;

/** Les quatre routes, avec un corps invalide ou un identifiant mal forme. */
const MALFORMED: [string, Call][] = [
  ["GET", (c) => getItems(c)],
  ["POST avec un corps invalide", (c) => postItemRaw("{pas du json", c)],
  ["POST avec name vide", (c) => postItem({ name: "" }, c)],
  ["PATCH avec un identifiant mal forme et un corps invalide", (c) => patchItemRaw("pas-un-uuid", "{pas du json", c)],
  ["PATCH avec un identifiant bien forme et un corps invalide", (c) => patchItem(unknownItemId(), { purchased: "oui" }, c)],
  ["DELETE avec un identifiant mal forme", (c) => deleteItemAs("pas-un-uuid", c)],
  ["DELETE avec un identifiant bien forme", (c) => deleteItemAs(unknownItemId(), c)],
];

describe("AC4 : sans session", () => {
  it.each(MALFORMED)("AC4 : %s sans session donne 401 UNAUTHENTICATED", async (label, call) => {
    expectAppError(await call(undefined), 401, "UNAUTHENTICATED", `${label}, sans session`);
  });

  it("AC4 : un cookie de session invalide donne aussi 401 UNAUTHENTICATED sur les quatre routes", async () => {
    const cookie = "better-auth.session_token=jeton-invente-faux";
    for (const [label, call] of MALFORMED) expectAppError(await call(cookie), 401, "UNAUTHENTICATED", `${label}, jeton invente`);
  });
});

describe("AC4 : compte sans foyer", () => {
  it.each(MALFORMED)("AC4 : %s pour un compte sans foyer donne 403 NO_HOUSEHOLD", async (label, call) => {
    const lonely = await createAccount({ name: "SansFoyer" });
    expectAppError(await call(lonely.cookie), 403, "NO_HOUSEHOLD", `${label}, sans foyer`);
  });

  it("AC4 : un compte sans foyer n'obtient jamais 404 sur l'article d'un foyer existant", async () => {
    const lonely = await createAccount({ name: "SansFoyer" });
    const existing = await addItemInOwnTx(H.account.userId, "Existant");
    expectAppError(await patchItem(existing, { purchased: true }, lonely.cookie), 403, "NO_HOUSEHOLD", "PATCH existant");
    expectAppError(await deleteItemAs(existing, lonely.cookie), 403, "NO_HOUSEHOLD", "DELETE existant");
    expect((await itemRowById(existing))?.purchased).toBe(false);
  });
});

describe("AC4 : ordre de verification", () => {
  it("AC4 : POST, 422 avant 409 : un corps invalide sur une liste pleine donne 422", async () => {
    const h = await home("PF");
    await seedItems(h.account.userId, 200);
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 200, rows: 200 });
    expectAppError(await postItem({ name: "" }, h.account.cookie), 422, "VALIDATION_FAILED", "corps invalide, liste pleine");
    expectAppError(await postItemRaw("{pas du json", h.account.cookie), 422, "VALIDATION_FAILED", "corps non JSON, liste pleine");
    expectAppError(await postItem({ name: "Valide" }, h.account.cookie), 409, "ITEM_LIMIT_REACHED", "corps valide, liste pleine");
  });

  it("AC4 : PATCH, 404 avant 422 : purchased invalide sur un article absent donne 404", async () => {
    expectAppError(await patchItem(unknownItemId(), { purchased: "oui" }, H.account.cookie), 404, "ITEM_NOT_FOUND", "absent + corps invalide");
    expectAppError(await patchItem(unknownItemId(), {}, H.account.cookie), 404, "ITEM_NOT_FOUND", "absent + corps vide");
    expectAppError(await patchItemRaw(unknownItemId(), "{pas du json", H.account.cookie), 404, "ITEM_NOT_FOUND", "absent + non JSON");
    expectAppError(await patchItem("pas-un-uuid", { purchased: "oui" }, H.account.cookie), 404, "ITEM_NOT_FOUND", "mal forme + corps invalide");
  });

  it("AC4 : PATCH sur un article present avec purchased invalide donne 422, et un corps valide sur un article absent donne 404", async () => {
    const id = await addItemInOwnTx(H.account.userId, "Present");
    expectAppError(await patchItem(id, { purchased: "oui" }, H.account.cookie), 422, "VALIDATION_FAILED", "present + corps invalide");
    expectAppError(await patchItem(unknownItemId(), { purchased: true }, H.account.cookie), 404, "ITEM_NOT_FOUND", "absent + corps valide");
  });

  it("AC4 : un membre de role simple utilise les quatre routes (aucun role n'est exige)", async () => {
    const h = await home("PR");
    const member = await joinedMember(h, "Simple");
    const added = expectItem(await postItem({ name: "Par membre" }, member.cookie), 201, "POST membre");
    expect((await getItems(member.cookie)).status).toBe(200);
    expectItem(await patchItem(added.id, { purchased: true }, member.cookie), 200, "PATCH membre");
    expect((await deleteItemAs(added.id, member.cookie)).status).toBe(200);
  });
});
