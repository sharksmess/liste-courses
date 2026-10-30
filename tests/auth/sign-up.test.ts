/**
 * AC1 (inscription nominale) et AC2 (inscription refusee) — US-01.
 * Statuts et codes : contrat `signUp` (docs/02-architecture/api-contracts/auth.ts).
 *
 * Verification de configuration de AC1 (« aucun e-mail n'est envoye ») : lecture
 * du fichier `apps/web/src/lib/auth.ts` (configuration better-auth, chemin
 * suppose, voir le rapport) et sondage HTTP des routes d'e-mail, qui ne doivent
 * ni etre configurees ni etre exposees.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signUp as signUpContract } from "../../docs/02-architecture/api-contracts/auth";
import { ROOT } from "../_factory/env";
import { DEFAULT_PASSWORD, getJson, postJson, rawSignUp, uniqueEmail } from "../helpers/auth";
import { closePools, resetDatabase } from "../helpers/db";
import { getMeAs, usersByEmail } from "../helpers/household";
import { cookieHeaderFrom, describeResult, expectAuthError, expectStatus, hasSessionCookie } from "../helpers/http";

beforeAll(resetDatabase);
afterAll(closePools);

const EMOJI_30 = "😀".repeat(15) + "a".repeat(15); // 30 points de code, 45 unites UTF-16
const EMOJI_31 = EMOJI_30 + "b";

describe("AC1 : inscription nominale (US-01.1, .4, .7, .8)", () => {
  it("AC1 : adresse valide, mot de passe de 8 caracteres, prenom '  Marie  ' -> compte cree, session ouverte, prenom 'Marie'", async () => {
    const email = uniqueEmail("ac1-8");
    const r = await rawSignUp({ email, password: "a".repeat(8), name: "  Marie  " });
    expectStatus(r, 200, "inscription nominale");
    const parsed = signUpContract.output.safeParse(r.body);
    expect(parsed.success, describeResult("sortie non conforme au contrat signUp", r)).toBe(true);
    expect(parsed.success ? parsed.data.user.name : undefined).toBe("Marie");
    expect(parsed.success ? parsed.data.user.email : undefined).toBe(email);
    expect(hasSessionCookie(r.setCookies), describeResult("cookie de session attendu", r)).toBe(true);
    const rows = await usersByEmail(email);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Marie");
  });

  it("AC1 : mot de passe de 128 caracteres accepte", async () => {
    const email = uniqueEmail("ac1-128");
    const r = await rawSignUp({ email, password: "b".repeat(128), name: "Marie" });
    expectStatus(r, 200, "inscription avec mot de passe de 128 caracteres");
    expect(await usersByEmail(email)).toHaveLength(1);
  });

  it("AC1 : juste apres l'inscription, GET /api/me rend le prenom et household: null", async () => {
    const email = uniqueEmail("ac1-me");
    const r = await rawSignUp({ email, password: DEFAULT_PASSWORD, name: "  Marie  " });
    expectStatus(r, 200, "inscription");
    const me = await getMeAs(cookieHeaderFrom(r.setCookies));
    expectStatus(me, 200, "GET /api/me apres inscription");
    expect(me.body).toEqual({ user: { name: "Marie" }, household: null });
  });

  it("AC1 : l'adresse est stockee en minuscules (Q-3)", async () => {
    const base = uniqueEmail("ac1-case");
    const mixed = base.replace("ac1-case", "AC1-Case");
    const r = await rawSignUp({ email: mixed, password: DEFAULT_PASSWORD, name: "Marie" });
    expectStatus(r, 200, "inscription avec adresse en casse mixte");
    const rows = await usersByEmail(base);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe(base);
  });

  it("AC1 : aucun e-mail n'est envoye, aucune fonction d'envoi n'est configuree (configuration)", () => {
    const file = path.join(ROOT, "apps/web/src/lib/auth.ts");
    expect(existsSync(file), `configuration better-auth attendue dans ${file}`).toBe(true);
    const source = readFileSync(file, "utf8");
    expect(source).not.toMatch(/sendResetPassword|sendVerificationEmail|sendVerificationOTP|sendOnSignUp|sendOnSignIn|nodemailer|resend/i);
    expect(source).toMatch(/minPasswordLength\s*:\s*8\b/);
    expect(source).toMatch(/maxPasswordLength\s*:\s*128\b/);
  });

  it.each(["/api/auth/send-verification-email", "/api/auth/request-password-reset", "/api/auth/forget-password"])(
    "AC1 : la route d'e-mail %s n'est ni configuree ni exposee",
    async (route) => {
      const r = await postJson(route, { email: uniqueEmail("ac1-mail"), redirectTo: "/" });
      expect(r.status, describeResult(route, r)).toBeGreaterThanOrEqual(400);
      expect(r.status, describeResult(route, r)).toBeLessThan(500);
    },
  );
});

describe("AC2 : inscription refusee, aucune ligne creee (US-01.2, .3, .5, .6)", () => {
  it("AC2 : mot de passe de 7 caracteres -> 400 PASSWORD_TOO_SHORT", async () => {
    const email = uniqueEmail("ac2-p7");
    const r = await rawSignUp({ email, password: "a".repeat(7), name: "Marie" });
    expectAuthError(r, 400, "PASSWORD_TOO_SHORT", "mot de passe de 7 caracteres");
    expect(hasSessionCookie(r.setCookies)).toBe(false);
    expect(await usersByEmail(email)).toHaveLength(0);
  });

  it("AC2 : mot de passe de 129 caracteres -> 400 PASSWORD_TOO_LONG", async () => {
    const email = uniqueEmail("ac2-p129");
    const r = await rawSignUp({ email, password: "a".repeat(129), name: "Marie" });
    expectAuthError(r, 400, "PASSWORD_TOO_LONG", "mot de passe de 129 caracteres");
    expect(await usersByEmail(email)).toHaveLength(0);
  });

  it.each([
    ["vide", ""],
    ["fait d'espaces", "     "],
    ["de 31 points de code", EMOJI_31],
  ])("AC2 : prenom %s -> 422 VALIDATION_FAILED", async (label, name) => {
    const email = uniqueEmail("ac2-name");
    const r = await rawSignUp({ email, password: DEFAULT_PASSWORD, name });
    expectAuthError(r, 422, "VALIDATION_FAILED", `prenom ${label}`);
    expect(hasSessionCookie(r.setCookies)).toBe(false);
    expect(await usersByEmail(email)).toHaveLength(0);
  });

  it("AC2 : prenom de 30 points de code dont des emoji -> accepte et enregistre tel quel (Q-2)", async () => {
    const email = uniqueEmail("ac2-name30");
    const r = await rawSignUp({ email, password: DEFAULT_PASSWORD, name: EMOJI_30 });
    expectStatus(r, 200, "prenom de 30 points de code avec emoji");
    const rows = await usersByEmail(email);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe(EMOJI_30);
  });

  it.each(["pas-une-adresse", "sans-arobase.example.test", "a@", "@example.test"])(
    "AC2 : adresse mal formee '%s' -> 400 VALIDATION_ERROR",
    async (email) => {
      const r = await rawSignUp({ email, password: DEFAULT_PASSWORD, name: "Marie" });
      expectAuthError(r, 400, "VALIDATION_ERROR", `adresse '${email}'`);
      expect(await usersByEmail(email)).toHaveLength(0);
    },
  );

  it("AC2 : adresse deja utilisee -> 422 USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL, un seul compte", async () => {
    const email = uniqueEmail("ac2-dup");
    expectStatus(await rawSignUp({ email, password: DEFAULT_PASSWORD, name: "Premiere" }), 200, "premiere inscription");
    const second = await rawSignUp({ email, password: DEFAULT_PASSWORD, name: "Seconde" });
    expectAuthError(second, 422, "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", "rejeu de l'inscription");
    expect(hasSessionCookie(second.setCookies)).toBe(false);
    const rows = await usersByEmail(email);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Premiere");
  });

  it("AC2 : adresse deja utilisee avec une autre casse -> 422 USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL, un seul compte (Q-3)", async () => {
    const email = uniqueEmail("ac2-dupcase");
    expectStatus(await rawSignUp({ email, password: DEFAULT_PASSWORD, name: "Premiere" }), 200, "premiere inscription");
    const second = await rawSignUp({ email: email.toUpperCase(), password: DEFAULT_PASSWORD, name: "Seconde" });
    expectAuthError(second, 422, "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", "inscription avec la meme adresse en majuscules");
    expect(await usersByEmail(email)).toHaveLength(1);
  });

  it("AC2 : un refus ne laisse aucune session exploitable (cookie de refus inoperant sur /api/me)", async () => {
    const email = uniqueEmail("ac2-nosession");
    const r = await rawSignUp({ email, password: "a".repeat(7), name: "Marie" });
    expectAuthError(r, 400, "PASSWORD_TOO_SHORT", "refus");
    const me = await getJson("/api/me", cookieHeaderFrom(r.setCookies) || undefined);
    expectStatus(me, 401, "GET /api/me apres un refus");
  });
});
