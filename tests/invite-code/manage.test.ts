/**
 * AC4 (permissions de GET et POST invite-code) et AC6 (voir et regenerer le
 * code). Contrats : `getInviteCode`, `regenerateInviteCode` (invite-code.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getInviteCode, regenerateInviteCode } from "../../docs/02-architecture/api-contracts/invite-code";
import { baseUrl, createAccount } from "../helpers/auth";
import { closePools, resetDatabase } from "../helpers/db";
import { inviteCodeOf, membershipsOfUser } from "../helpers/household";
import { describeResult, expectAppError, expectStatus, type HttpResult } from "../helpers/http";
import { displayed, getCode, home, issuedAtOf, joinedMember, postJoin, postRegenerate } from "../helpers/invite";

beforeAll(resetDatabase);
afterAll(closePools);

function codeOf(r: HttpResult, label: string): string {
  expectStatus(r, 200, label);
  const parsed = getInviteCode.output.safeParse(r.body);
  expect(parsed.success, describeResult(`${label} : sortie non conforme au contrat`, r)).toBe(true);
  return parsed.success ? parsed.data.code : "";
}

describe("AC4 : permissions de GET et POST invite-code", () => {
  it("AC4 : sans session, GET et POST invite-code donnent 401 UNAUTHENTICATED", async () => {
    expectAppError(await getCode(), 401, "UNAUTHENTICATED", "GET sans session");
    expectAppError(await postRegenerate(), 401, "UNAUTHENTICATED", "POST sans session");
  });

  it("AC4 : un compte sans foyer recoit 403 NO_HOUSEHOLD sur GET et sur POST", async () => {
    const lonely = await createAccount();
    expectAppError(await getCode(lonely.cookie), 403, "NO_HOUSEHOLD", "GET sans foyer");
    expectAppError(await postRegenerate(lonely.cookie), 403, "NO_HOUSEHOLD", "POST sans foyer");
    expect(await membershipsOfUser(lonely.userId)).toEqual([]);
  });

  it("AC4 : un membre qui n'est pas la responsable recoit 403 INSUFFICIENT_ROLE sur GET et sur POST, et le code reste inchange", async () => {
    const h = await home("M1");
    const member = await joinedMember(h);
    const before = await inviteCodeOf(h.householdId);
    const issued = await issuedAtOf(h.householdId);

    const g = await getCode(member.cookie);
    expectAppError(g, 403, "INSUFFICIENT_ROLE", "GET par un membre");
    for (const secret of [h.code, displayed(h.code)]) {
      expect(g.text, describeResult("le refus revele le code", g)).not.toContain(secret);
    }
    expectAppError(await postRegenerate(member.cookie), 403, "INSUFFICIENT_ROLE", "POST par un membre");

    expect(await inviteCodeOf(h.householdId)).toBe(before);
    expect((await issuedAtOf(h.householdId)).getTime()).toBe(issued.getTime());
  });
});

describe("AC6 : voir et regenerer le code", () => {
  it("AC6 : GET rend le code au format XXXXX-XXXXX, identique a la valeur stockee sans le tiret", async () => {
    const h = await home("V1");
    const r = await getCode(h.account.cookie);
    const code = codeOf(r, "GET invite-code");
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(code.replace("-", "")).toBe(await inviteCodeOf(h.householdId));
    expect(code).toBe(displayed(h.code));
  });

  it("AC6 : GET est stable d'une lecture a l'autre", async () => {
    const h = await home("V2");
    const first = codeOf(await getCode(h.account.cookie), "GET 1");
    const second = codeOf(await getCode(h.account.cookie), "GET 2");
    expect(second).toBe(first);
  });

  it("AC6 : POST rend un code different, qui devient celui de GET et celui de la base ; issued_at avance", async () => {
    const h = await home("V3");
    const issuedBefore = await issuedAtOf(h.householdId);
    const before = codeOf(await getCode(h.account.cookie), "GET avant");
    const fresh = codeOf(await postRegenerate(h.account.cookie), "POST regeneration");
    expect(regenerateInviteCode.output.safeParse({ code: fresh }).success).toBe(true);
    expect(fresh).not.toBe(before);
    expect(codeOf(await getCode(h.account.cookie), "GET apres")).toBe(fresh);
    expect(fresh.replace("-", "")).toBe(await inviteCodeOf(h.householdId));
    expect((await issuedAtOf(h.householdId)).getTime()).toBeGreaterThan(issuedBefore.getTime());
  });

  it("AC6 : chaque POST emet un nouveau code", async () => {
    const h = await home("V4");
    const a = codeOf(await postRegenerate(h.account.cookie), "POST 1");
    const b = codeOf(await postRegenerate(h.account.cookie), "POST 2");
    expect(b).not.toBe(a);
    expect(b.replace("-", "")).toBe(await inviteCodeOf(h.householdId));
  });

  it("AC6 : apres regeneration, l'ancien code est refuse (404 INVITE_CODE_INVALID) et le nouveau fait rejoindre le foyer", async () => {
    const h = await home("V5");
    const fresh = codeOf(await postRegenerate(h.account.cookie), "POST regeneration");

    const refused = await createAccount();
    expectAppError(await postJoin(displayed(h.code), refused.cookie), 404, "INVITE_CODE_INVALID", "ancien code");
    expect(await membershipsOfUser(refused.userId)).toEqual([]);

    const r = await postJoin(fresh, refused.cookie);
    expectStatus(r, 200, "nouveau code");
    expect(r.body).toEqual({ name: h.householdName, role: "member" });
    expect((await membershipsOfUser(refused.userId))[0]?.household_id).toBe(h.householdId);
  });

  it("AC6 : un membre deja entre reste membre apres la regeneration", async () => {
    const h = await home("V6");
    const member = await joinedMember(h);
    expectStatus(await postRegenerate(h.account.cookie), 200, "regeneration");
    expect((await membershipsOfUser(member.userId))[0]?.household_id).toBe(h.householdId);
  });

  it("AC6 : les reponses de GET et POST portent Cache-Control: no-store", async () => {
    const h = await home("V7");
    const base = baseUrl();
    const origin = new URL(base).origin;
    const get = await fetch(`${base}${getInviteCode.route}`, { method: "GET", headers: { Cookie: h.account.cookie } });
    const getBody = await get.text();
    expect(get.status, `GET invite-code : HTTP ${get.status}, corps brut ${JSON.stringify(getBody)}`).toBe(200);
    expect(get.headers.get("cache-control") ?? "").toContain("no-store");

    const post = await fetch(`${base}${regenerateInviteCode.route}`, {
      method: "POST",
      headers: { Cookie: h.account.cookie, Origin: origin, "Content-Type": "application/json" },
      body: "{}",
    });
    const postBody = await post.text();
    expect(post.status, `POST invite-code : HTTP ${post.status}, corps brut ${JSON.stringify(postBody)}`).toBe(200);
    expect(post.headers.get("cache-control") ?? "").toContain("no-store");
  });
});
