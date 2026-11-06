/**
 * AC1 (rejoindre avec le code en vigueur), AC2 (code refuse sans rien reveler)
 * et la partie « rejoindre » de AC4 (permissions). Contrat : `joinHousehold`
 * (household.ts). Le foyer reel est cree par l'API ; l'administration ne sert
 * qu'a arranger un code de forme connue et a relire la base.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { joinHousehold } from "../../docs/02-architecture/api-contracts/household";
import { ErrorBody } from "../../docs/02-architecture/api-contracts/_contract";
import { createAccount } from "../helpers/auth";
import { adminPool, closePools, resetDatabase } from "../helpers/db";
import { getMeAs, getPage, describePage, householdById, membershipsOfUser, inviteCodeOf } from "../helpers/household";
import { describeResult, expectAppError, expectStatus } from "../helpers/http";
import { displayed, home, memberCountOf, postJoin, postJoinRaw, postRegenerate, UNKNOWN_CODE, type Home } from "../helpers/invite";

beforeAll(resetDatabase);
afterAll(closePools);

describe("AC1 : rejoindre avec le code en vigueur", () => {
  it("AC1 : un compte sans foyer qui envoie le code en vigueur recoit 200 { name, role: 'member' }", async () => {
    const h = await home("J1");
    const joiner = await createAccount({ name: "Camille" });
    const r = await postJoin(displayed(h.code), joiner.cookie);
    expectStatus(r, joinHousehold.successStatus, "adhesion avec le code en vigueur");
    expect(joinHousehold.output.safeParse(r.body).success, describeResult("sortie non conforme a joinHousehold", r)).toBe(true);
    expect(r.body).toEqual({ name: h.householdName, role: "member" });
  });

  it("AC1 : GET /api/me rend ensuite ce foyer avec le role member, et /household affiche son nom", async () => {
    const h = await home("J2");
    const joiner = await createAccount({ name: "Camille" });
    expectStatus(await postJoin(displayed(h.code), joiner.cookie), 200, "adhesion");
    const me = await getMeAs(joiner.cookie);
    expectStatus(me, 200, "GET /api/me");
    expect(me.body).toEqual({ user: { name: "Camille" }, household: { name: h.householdName, role: "member" } });
    const page = await getPage("/household", joiner.cookie);
    expect(page.finalPath, describePage("GET /household du membre", page)).toBe("/household");
    expect(page.html, describePage("GET /household du membre", page)).toContain(h.householdName);
  });

  it("AC1 : en base, une appartenance member (display_name = prenom), member_count = 2 = nombre de lignes", async () => {
    const h = await home("J3");
    const joiner = await createAccount({ name: "Camille" });
    expectStatus(await postJoin(displayed(h.code), joiner.cookie), 200, "adhesion");
    const ms = await membershipsOfUser(joiner.userId);
    expect(ms).toHaveLength(1);
    expect(ms[0]?.household_id).toBe(h.householdId);
    expect(ms[0]?.role).toBe("member");
    expect(ms[0]?.display_name).toBe("Camille");
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 2, rows: 2 });
    expect((await householdById(h.householdId))?.member_count).toBe(2);
  });

  describe("normalisation de la saisie (D-025)", () => {
    // Arrangement : un code de forme connue, riche en 0 et en 1, pour que les
    // substitutions O/I/L soient reellement exercees (un code tire au hasard
    // peut n'en contenir aucun). Hexadecimal majuscule : toujours dans l'alphabet.
    async function homeWithKnownCode(tag: string): Promise<{ h: Home; stored: string }> {
      const h = await home(tag);
      const stored = `0101${randomBytes(3).toString("hex").toUpperCase()}`;
      await adminPool().query("UPDATE lc.invite_code SET code = $1 WHERE household_id = $2", [stored, h.householdId]);
      expect(await inviteCodeOf(h.householdId)).toBe(stored);
      return { h, stored };
    }

    const variants: [string, (s: string) => string][] = [
      ["minuscules", (s) => s.toLowerCase()],
      ["forme affichee avec tiret", (s) => displayed(s)],
      ["espaces et tiret", (s) => ` ${s.slice(0, 3)} ${s.slice(3, 5)} - ${s.slice(5)} `],
      ["tirets partout", (s) => s.split("").join("-")],
      ["O pour 0 et I pour 1", (s) => s.replace(/0/g, "O").replace(/1/g, "I")],
      ["o minuscule pour 0 et l minuscule pour 1", (s) => s.replace(/0/g, "o").replace(/1/g, "l")],
      ["L majuscule pour 1", (s) => s.replace(/1/g, "L")],
    ];

    it.each(variants)("AC1 : saisie « %s » aboutit au meme foyer", async (_label, transform) => {
      const { h, stored } = await homeWithKnownCode("JN");
      const joiner = await createAccount();
      const typed = transform(stored);
      const r = await postJoin(typed, joiner.cookie);
      expectStatus(r, 200, `adhesion avec la saisie ${JSON.stringify(typed)}`);
      expect(r.body).toEqual({ name: h.householdName, role: "member" });
      expect((await membershipsOfUser(joiner.userId))[0]?.household_id).toBe(h.householdId);
    });
  });
});

describe("AC2 : code refuse sans rien reveler", () => {
  it("AC2 : un code bien forme mais inconnu donne 404 INVITE_CODE_INVALID, sans appartenance ni changement de compteur", async () => {
    const h = await home("R1");
    const joiner = await createAccount();
    const r = await postJoin(UNKNOWN_CODE, joiner.cookie);
    expectAppError(r, 404, "INVITE_CODE_INVALID", "code inconnu");
    expect(await membershipsOfUser(joiner.userId)).toEqual([]);
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 1, rows: 1 });
  });

  it("AC2 : un code remplace par une regeneration donne exactement le meme statut et le meme corps qu'un code inconnu", async () => {
    const h = await home("R2");
    const oldCode = h.code;
    expectStatus(await postRegenerate(h.account.cookie), 200, "regeneration");
    expect(await inviteCodeOf(h.householdId)).not.toBe(oldCode);

    const joiner = await createAccount();
    const replaced = await postJoin(displayed(oldCode), joiner.cookie);
    const unknown = await postJoin(UNKNOWN_CODE, joiner.cookie);
    expectAppError(replaced, 404, "INVITE_CODE_INVALID", "code remplace");
    expectAppError(unknown, 404, "INVITE_CODE_INVALID", "code inconnu");
    expect(replaced.text, describeResult("corps du code remplace", replaced)).toBe(unknown.text);
    expect(await membershipsOfUser(joiner.userId)).toEqual([]);
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 1, rows: 1 });
  });

  it("AC2 : le corps du refus ne contient ni nom ni identifiant de foyer, ni le code envoye", async () => {
    const h = await home("R3");
    expectStatus(await postRegenerate(h.account.cookie), 200, "regeneration");
    const joiner = await createAccount();
    const r = await postJoin(displayed(h.code), joiner.cookie);
    expectAppError(r, 404, "INVITE_CODE_INVALID", "code remplace");
    for (const secret of [h.householdName, h.householdId, h.account.userId, h.code, displayed(h.code)]) {
      expect(r.text, describeResult("le refus revele une donnee du foyer", r)).not.toContain(secret);
    }
    expect(ErrorBody.safeParse(r.body).success).toBe(true);
  });

  const malformed: [string, string][] = [
    ["avec un U", "ABCDE-FGHUJ"],
    ["avec une ponctuation", "ABCDE.FGH1J"],
    ["avec un caractere accentue", "ABCDEFGHÉ1"],
    ["de 9 caracteres", "ABCDE-FGH1"],
    ["de 11 caracteres", "ABCDE-FGH1JK"],
    ["vide", ""],
    ["fait d'espaces et de tirets", " - - "],
  ];

  it.each(malformed)("AC2 : un code %s donne 422 VALIDATION_FAILED, champ code, sans la valeur", async (label, value) => {
    const joiner = await createAccount();
    const r = await postJoin(value, joiner.cookie);
    expectAppError(r, 422, "VALIDATION_FAILED", `code mal forme (${label}) ${JSON.stringify(value)}`);
    const parsed = ErrorBody.safeParse(r.body);
    expect(parsed.success ? parsed.data.error.fields : undefined, describeResult("champ en cause", r)).toEqual(["code"]);
    if (value.trim().length > 0) {
      expect(r.text, describeResult("le corps cite la valeur envoyee", r)).not.toContain(value);
    }
    expect(await membershipsOfUser(joiner.userId)).toEqual([]);
  });

  const notStrings: [string, unknown][] = [
    ["absent", undefined],
    ["null", null],
    ["numerique", 1234567890],
    ["booleen", true],
    ["un tableau", ["ABCDE-FGH1J"]],
    ["un objet", { code: "ABCDE-FGH1J" }],
  ];

  it.each(notStrings)("AC2 : un code %s donne 422 VALIDATION_FAILED, champ code", async (label, value) => {
    const joiner = await createAccount();
    const r = await postJoin(value, joiner.cookie);
    expectAppError(r, 422, "VALIDATION_FAILED", `code ${label}`);
    const parsed = ErrorBody.safeParse(r.body);
    expect(parsed.success ? parsed.data.error.fields : undefined, describeResult("champ en cause", r)).toEqual(["code"]);
    expect(await membershipsOfUser(joiner.userId)).toEqual([]);
  });

  it("AC2 : un corps vide ou non JSON donne 422 VALIDATION_FAILED", async () => {
    const joiner = await createAccount();
    expectAppError(await postJoinRaw("", joiner.cookie), 422, "VALIDATION_FAILED", "corps vide");
    expectAppError(await postJoinRaw("{pas du json", joiner.cookie), 422, "VALIDATION_FAILED", "corps non JSON");
    expect(await membershipsOfUser(joiner.userId)).toEqual([]);
  });
});

describe("AC4 : permissions de « rejoindre »", () => {
  it("AC4 : sans session, POST join donne 401 UNAUTHENTICATED", async () => {
    const h = await home("P1");
    expectAppError(await postJoin(displayed(h.code)), 401, "UNAUTHENTICATED", "sans session");
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 1, rows: 1 });
  });

  it("AC4 : un cookie de session invalide donne 401 UNAUTHENTICATED", async () => {
    const h = await home("P2");
    expectAppError(await postJoin(displayed(h.code), "better-auth.session_token=invalide"), 401, "UNAUTHENTICATED", "session invalide");
  });

  it("AC4 : un membre qui rejoint un autre foyer recoit 409 ALREADY_IN_HOUSEHOLD et reste dans son foyer", async () => {
    const mine = await home("P3");
    const other = await home("P4");
    const member = await createAccount({ name: "Membre" });
    expectStatus(await postJoin(displayed(mine.code), member.cookie), 200, "adhesion initiale");
    expectAppError(await postJoin(displayed(other.code), member.cookie), 409, "ALREADY_IN_HOUSEHOLD", "membre vers un autre foyer");
    expect((await membershipsOfUser(member.userId)).map((m) => m.household_id)).toEqual([mine.householdId]);
    expect(await memberCountOf(mine.householdId)).toEqual({ counter: 2, rows: 2 });
    expect(await memberCountOf(other.householdId)).toEqual({ counter: 1, rows: 1 });
  });

  it("AC4 : une responsable qui rejoint un autre foyer recoit 409 ALREADY_IN_HOUSEHOLD et reste responsable", async () => {
    const mine = await home("P5");
    const other = await home("P6");
    expectAppError(await postJoin(displayed(other.code), mine.account.cookie), 409, "ALREADY_IN_HOUSEHOLD", "responsable vers un autre foyer");
    const ms = await membershipsOfUser(mine.account.userId);
    expect(ms.map((m) => [m.household_id, m.role])).toEqual([[mine.householdId, "owner"]]);
    expect(await memberCountOf(other.householdId)).toEqual({ counter: 1, rows: 1 });
  });

  it("AC4 : un compte deja membre recoit 409 ALREADY_IN_HOUSEHOLD meme avec un code mal forme ou absent (avant toute validation)", async () => {
    const mine = await home("P7");
    for (const value of ["pas un code", "ABCDE-FGHUJ", "", undefined, 42, null]) {
      expectAppError(await postJoin(value, mine.account.cookie), 409, "ALREADY_IN_HOUSEHOLD", `valeur ${JSON.stringify(value)}`);
    }
    expect((await membershipsOfUser(mine.account.userId))[0]?.household_id).toBe(mine.householdId);
  });

  it("AC4 : rejouer l'adhesion reussie donne 409 ALREADY_IN_HOUSEHOLD, sans doublon", async () => {
    const h = await home("P8");
    const joiner = await createAccount();
    expectStatus(await postJoin(displayed(h.code), joiner.cookie), 200, "premiere adhesion");
    expectAppError(await postJoin(displayed(h.code), joiner.cookie), 409, "ALREADY_IN_HOUSEHOLD", "rejeu");
    expect(await membershipsOfUser(joiner.userId)).toHaveLength(1);
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 2, rows: 2 });
  });
});
