/**
 * AC10 — Prenom non modifiable (ADR-0003, D-009) : la route de mise a jour de
 * profil de better-auth ne peut pas changer `name` (refus ou route absente).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccount, postJson } from "../helpers/auth";
import { closePools, resetDatabase } from "../helpers/db";
import { getMeAs, usersByEmail } from "../helpers/household";
import { describeResult, expectStatus } from "../helpers/http";

beforeAll(resetDatabase);
afterAll(closePools);

describe("AC10 : prenom non modifiable", () => {
  it("AC10 : POST /api/auth/update-user avec un autre name est refuse ou absent, et le prenom reste inchange", async () => {
    const account = await createAccount({ name: "Marie" });
    const r = await postJson("/api/auth/update-user", { name: "Autre" }, { cookie: account.cookie });
    expect(r.status, describeResult("update-user", r)).toBeGreaterThanOrEqual(400);
    expect(r.status, describeResult("update-user", r)).toBeLessThan(500);

    const rows = await usersByEmail(account.email);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Marie");
    const me = await getMeAs(account.cookie);
    expectStatus(me, 200, "GET /api/me apres la tentative");
    expect(me.body).toEqual({ user: { name: "Marie" }, household: null });
  });

  it("AC10 : la tentative de modifier le prenom avec d'autres champs de profil echoue aussi", async () => {
    const account = await createAccount({ name: "Marie" });
    const r = await postJson("/api/auth/update-user", { name: "Autre", image: "https://example.test/a.png" }, { cookie: account.cookie });
    expect(r.status, describeResult("update-user avec image", r)).toBeGreaterThanOrEqual(400);
    const rows = await usersByEmail(account.email);
    expect(rows[0]?.name).toBe("Marie");
  });
});
