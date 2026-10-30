/**
 * AC6 (creation du foyer) et AC7 (creation refusee, cas limites, concurrence) — US-03.
 * Contrats : `createHousehold`, `getMe` (household.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHousehold, getMe } from "../../docs/02-architecture/api-contracts/household";
import { createAccount, uniqueTag } from "../helpers/auth";
import { closePools, resetDatabase } from "../helpers/db";
import {
  describePage,
  getMeAs,
  getPage,
  householdById,
  householdsByName,
  inviteCodeOf,
  membershipsOfUser,
  postHousehold,
} from "../helpers/household";
import { describeResult, expectAppError, expectStatus } from "../helpers/http";

beforeAll(resetDatabase);
afterAll(closePools);

const CROCKFORD = /^[0-9A-HJKMNP-TV-Z]{10}$/;

describe("AC6 : creation du foyer (US-03.1, .3)", () => {
  it("AC6 : un compte sans foyer cree « Famille Martin » et recoit 201 { name, role: 'owner' }", async () => {
    const account = await createAccount({ name: "Camille" });
    const name = `Famille Martin ${uniqueTag("m")}`;
    const r = await postHousehold(name, account.cookie);
    expectStatus(r, createHousehold.successStatus, "creation du foyer");
    expect(createHousehold.output.safeParse(r.body).success, describeResult("sortie non conforme a createHousehold", r)).toBe(true);
    expect(r.body).toEqual({ name, role: "owner" });
  });

  it("AC6 : GET /api/me rend ensuite ce foyer avec le role owner", async () => {
    const account = await createAccount({ name: "Camille" });
    const name = `Famille Martin ${uniqueTag("m")}`;
    expectStatus(await postHousehold(name, account.cookie), 201, "creation du foyer");
    const me = await getMeAs(account.cookie);
    expectStatus(me, 200, "GET /api/me");
    expect(getMe.output.safeParse(me.body).success, describeResult("sortie non conforme a getMe", me)).toBe(true);
    expect(me.body).toEqual({ user: { name: "Camille" }, household: { name, role: "owner" } });
  });

  it("AC6 : en base, une seule appartenance owner (display_name = prenom), member_count 1, item_count 0, code Crockford de 10 caracteres", async () => {
    const account = await createAccount({ name: "Camille" });
    const name = `Famille Martin ${uniqueTag("m")}`;
    expectStatus(await postHousehold(name, account.cookie), 201, "creation du foyer");

    const memberships = await membershipsOfUser(account.userId);
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("owner");
    expect(memberships[0]?.display_name).toBe("Camille");

    const households = await householdsByName(name);
    expect(households).toHaveLength(1);
    expect(households[0]?.id).toBe(memberships[0]?.household_id);
    expect(households[0]?.member_count).toBe(1);
    expect(households[0]?.item_count).toBe(0);

    const code = await inviteCodeOf(households[0]?.id ?? "");
    expect(code, "code d'invitation du foyer").toMatch(CROCKFORD);
  });

  it("AC6 : le nom est enregistre sans espaces de bord", async () => {
    const account = await createAccount();
    const core = `Famille ${uniqueTag("t")}`;
    const r = await postHousehold(`  ${core}  `, account.cookie);
    expectStatus(r, 201, "creation avec espaces de bord");
    expect(r.body).toEqual({ name: core, role: "owner" });
    expect(await householdsByName(core)).toHaveLength(1);
  });

  it("AC6 : la page du foyer affiche son nom et une liste vide", async () => {
    const account = await createAccount();
    const name = `Famille Martin ${uniqueTag("m")}`;
    expectStatus(await postHousehold(name, account.cookie), 201, "creation du foyer");
    const page = await getPage("/household", account.cookie);
    const label = "GET /household apres creation";
    expect(page.status, describePage(label, page)).toBe(200);
    expect(page.finalPath, describePage(label, page)).toBe("/household");
    expect(page.html, describePage(label, page)).toContain(name);
    const list = /data-testid="item-list"[^>]*>([\s\S]*?)<\/(?:ul|ol|div|section)>/.exec(page.html);
    expect(list, describePage(`${label} : element data-testid="item-list" attendu`, page)).not.toBeNull();
    expect(list?.[1] ?? "", describePage(`${label} : la liste doit etre vide`, page)).not.toContain("<li");
  });

  it("AC6 : un nom de 50 points de code dont des emoji est accepte (Q-2)", async () => {
    const account = await createAccount();
    const name = "😀".repeat(25) + "a".repeat(25);
    const r = await postHousehold(name, account.cookie);
    expectStatus(r, 201, "foyer de 50 points de code");
    expect(await householdsByName(name)).toHaveLength(1);
  });
});

describe("AC7 : creation refusee et cas limites (US-03.2, .4)", () => {
  it.each([
    ["vide", ""],
    ["fait d'espaces", "     "],
    ["de 51 points de code", "😀".repeat(51)],
  ])("AC7 : nom %s -> 422 VALIDATION_FAILED, aucun foyer cree", async (label, name) => {
    const account = await createAccount();
    const r = await postHousehold(name, account.cookie);
    expectAppError(r, 422, "VALIDATION_FAILED", `nom ${label}`);
    expect(await membershipsOfUser(account.userId)).toHaveLength(0);
    const me = await getMeAs(account.cookie);
    expect((me.body as { household: unknown }).household, describeResult("GET /api/me", me)).toBeNull();
  });

  it("AC7 : un nom absent ou non textuel -> 422 VALIDATION_FAILED", async () => {
    const account = await createAccount();
    expectAppError(await postHousehold(undefined, account.cookie), 422, "VALIDATION_FAILED", "nom absent");
    expectAppError(await postHousehold(42, account.cookie), 422, "VALIDATION_FAILED", "nom numerique");
    expect(await membershipsOfUser(account.userId)).toHaveLength(0);
  });

  it("AC7 : un compte qui a deja un foyer recoit 409 ALREADY_IN_HOUSEHOLD, sans second foyer", async () => {
    const account = await createAccount();
    const first = `Premier ${uniqueTag("f")}`;
    const second = `Second ${uniqueTag("f")}`;
    expectStatus(await postHousehold(first, account.cookie), 201, "premiere creation");
    expectAppError(await postHousehold(second, account.cookie), 409, "ALREADY_IN_HOUSEHOLD", "seconde creation");
    expect(await householdsByName(second)).toHaveLength(0);
    const memberships = await membershipsOfUser(account.userId);
    expect(memberships).toHaveLength(1);
    expect((await householdById(memberships[0]?.household_id ?? ""))?.name).toBe(first);
  });

  it("AC7 : le rejeu exact de la creation donne 409 ALREADY_IN_HOUSEHOLD, sans doublon", async () => {
    const account = await createAccount();
    const name = `Rejeu ${uniqueTag("r")}`;
    expectStatus(await postHousehold(name, account.cookie), 201, "creation");
    expectAppError(await postHousehold(name, account.cookie), 409, "ALREADY_IN_HOUSEHOLD", "rejeu");
    expect(await householdsByName(name)).toHaveLength(1);
  });

  it("AC7 : concurrence, deux POST /api/household simultanes du meme compte donnent un seul 201 et un seul 409, et un seul foyer existe", async () => {
    const account = await createAccount();
    const name = `Concurrent ${uniqueTag("c")}`;
    const [a, b] = await Promise.all([postHousehold(name, account.cookie), postHousehold(name, account.cookie)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses, `${describeResult("requete A", a)} ; ${describeResult("requete B", b)}`).toEqual([201, 409]);
    const loser = a.status === 409 ? a : b;
    expectAppError(loser, 409, "ALREADY_IN_HOUSEHOLD", "requete perdante");
    expect(await householdsByName(name)).toHaveLength(1);
    const memberships = await membershipsOfUser(account.userId);
    expect(memberships).toHaveLength(1);
    expect((await householdById(memberships[0]?.household_id ?? ""))?.member_count).toBe(1);
  });
});
