/**
 * AC11 — Controle d'origine (ADR-0003), patron de la tranche 014 de Signet.
 * Le serveur de test est lance sans `TEST` ni `VITEST` (usine 1.6.5) : le
 * controle d'origine de better-auth est donc actif. Une inscription avec un
 * en-tete Origin etranger est refusee et aucun compte n'est cree.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appOrigin, DEFAULT_PASSWORD, rawSignUp, uniqueEmail } from "../helpers/auth";
import { adminPool, closePools, resetDatabase } from "../helpers/db";
import { usersByEmail } from "../helpers/household";
import { expectAuthError, expectStatus, hasSessionCookie } from "../helpers/http";

beforeAll(resetDatabase);
afterAll(closePools);

const FOREIGN_ORIGIN = "https://piege.invalid";

async function accountRows(email: string): Promise<number> {
  const r = await adminPool().query<{ n: string }>(
    "SELECT count(*) AS n FROM lc_auth.account a JOIN lc_auth.app_user u ON u.id = a.user_id WHERE u.email = $1",
    [email],
  );
  return Number(r.rows[0]?.n ?? "0");
}

describe("AC11 : controle d'origine", () => {
  it("AC11 : inscription avec un Origin etranger -> 403 INVALID_ORIGIN, aucun cookie, aucun compte", async () => {
    const email = uniqueEmail("ac11-foreign");
    const r = await rawSignUp({ email, password: DEFAULT_PASSWORD, name: "Marie" }, { origin: FOREIGN_ORIGIN });
    expectAuthError(r, 403, "INVALID_ORIGIN", "inscription, origine etrangere");
    expect(hasSessionCookie(r.setCookies)).toBe(false);
    expect(await usersByEmail(email)).toHaveLength(0);
    expect(await accountRows(email)).toBe(0);
  });

  it("AC11 : inscription avec Origin: null -> 403 MISSING_OR_NULL_ORIGIN, aucun compte", async () => {
    const email = uniqueEmail("ac11-null");
    const r = await rawSignUp({ email, password: DEFAULT_PASSWORD, name: "Marie" }, { origin: "null" });
    expectAuthError(r, 403, "MISSING_OR_NULL_ORIGIN", "inscription, Origin null");
    expect(await usersByEmail(email)).toHaveLength(0);
  });

  it("AC11 : controle positif, inscription avec l'origine de l'application -> 200 et compte cree", async () => {
    const email = uniqueEmail("ac11-ok");
    const r = await rawSignUp({ email, password: DEFAULT_PASSWORD, name: "Marie" }, { origin: appOrigin() });
    expectStatus(r, 200, "inscription, bonne origine");
    expect(await usersByEmail(email)).toHaveLength(1);
  });
});
