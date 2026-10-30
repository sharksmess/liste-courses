/**
 * AC3 — Connexion et deconnexion (US-02.1, .2, .4, .5).
 * Contrats : `signIn`, `signOut` (auth.ts), `getMe`, `createHousehold` (household.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signIn as signInContract, signOut as signOutContract } from "../../docs/02-architecture/api-contracts/auth";
import { createAccount, rawSignIn, rawSignOut, uniqueEmail } from "../helpers/auth";
import { closePools, resetDatabase } from "../helpers/db";
import { getMeAs, getPage, describePage, postHousehold } from "../helpers/household";
import { cookieHeaderFrom, describeResult, expectAppError, expectAuthError, expectStatus, hasSessionCookie } from "../helpers/http";

beforeAll(resetDatabase);
afterAll(closePools);

describe("AC3 : connexion et deconnexion (US-02)", () => {
  it("AC3 : les bons identifiants ouvrent une session utilisable (US-02.1)", async () => {
    const account = await createAccount({ name: "Camille" });
    const r = await rawSignIn(account.email, account.password);
    expectStatus(r, 200, "connexion");
    const parsed = signInContract.output.safeParse(r.body);
    expect(parsed.success, describeResult("sortie non conforme au contrat signIn", r)).toBe(true);
    expect(parsed.success ? parsed.data.user.id : undefined).toBe(account.userId);
    const cookie = cookieHeaderFrom(r.setCookies);
    expect(hasSessionCookie(r.setCookies), describeResult("cookie de session attendu", r)).toBe(true);
    const me = await getMeAs(cookie);
    expectStatus(me, 200, "GET /api/me avec la session de connexion");
    expect(me.body).toEqual({ user: { name: "Camille" }, household: null });
  });

  it("AC3 : mauvais mot de passe et adresse inconnue donnent le meme statut, le meme code et le meme message (US-02.2)", async () => {
    const account = await createAccount();
    const wrongPassword = await rawSignIn(account.email, "Mauvais-mot-de-passe-9");
    const unknownEmail = await rawSignIn(uniqueEmail("inconnue"), "Mauvais-mot-de-passe-9");
    expectAuthError(wrongPassword, 401, "INVALID_EMAIL_OR_PASSWORD", "mauvais mot de passe");
    expectAuthError(unknownEmail, 401, "INVALID_EMAIL_OR_PASSWORD", "adresse inconnue");
    expect(unknownEmail.status).toBe(wrongPassword.status);
    expect(unknownEmail.body, describeResult("corps de l'adresse inconnue", unknownEmail)).toEqual(wrongPassword.body);
    expect(hasSessionCookie(wrongPassword.setCookies)).toBe(false);
    expect(hasSessionCookie(unknownEmail.setCookies)).toBe(false);
  });

  it("AC3 : la connexion avec l'adresse en autre casse reussit (Q-3)", async () => {
    const account = await createAccount();
    const r = await rawSignIn(account.email.toUpperCase(), account.password);
    expectStatus(r, 200, "connexion avec l'adresse en majuscules");
  });

  it("AC3 : apres sign-out, l'ancien cookie donne 401 UNAUTHENTICATED sur GET /api/me (US-02.4)", async () => {
    const account = await createAccount();
    expectStatus(await getMeAs(account.cookie), 200, "GET /api/me avant la deconnexion");
    const out = await rawSignOut(account.cookie);
    expectStatus(out, 200, "sign-out");
    expect(signOutContract.output.safeParse(out.body).success, describeResult("sortie signOut", out)).toBe(true);
    expectAppError(await getMeAs(account.cookie), 401, "UNAUTHENTICATED", "GET /api/me avec l'ancien cookie");
  });

  it("AC3 : sign-out est idempotent, un second appel avec le cookie ferme donne encore 200 { success: true }", async () => {
    const account = await createAccount();
    expectStatus(await rawSignOut(account.cookie), 200, "premier sign-out");
    const again = await rawSignOut(account.cookie);
    expectStatus(again, 200, "second sign-out");
    expect(again.body).toEqual({ success: true });
  });

  it("AC3 : sans session, GET /api/me donne 401 UNAUTHENTICATED (US-02.5)", async () => {
    expectAppError(await getMeAs(undefined), 401, "UNAUTHENTICATED", "GET /api/me sans cookie");
  });

  it("AC3 : avec un cookie de session invalide, GET /api/me donne 401 UNAUTHENTICATED", async () => {
    expectAppError(await getMeAs("better-auth.session_token=invalide.invalide"), 401, "UNAUTHENTICATED", "GET /api/me, cookie invalide");
  });

  it("AC3 : sans session, POST /api/household donne 401 UNAUTHENTICATED", async () => {
    expectAppError(await postHousehold("Famille Sans Session", undefined), 401, "UNAUTHENTICATED", "POST /api/household sans cookie");
  });

  it.each(["/household", "/no-household", "/"])("AC3 : sans session, la page %s redirige vers la connexion", async (route) => {
    const page = await getPage(route);
    expect(page.finalPath, describePage(`GET ${route} sans session`, page)).toBe("/sign-in");
    expect(page.status, describePage(`GET ${route} sans session`, page)).toBe(200);
  });

  it("AC3 : apres sign-out, la page du foyer redirige vers la connexion", async () => {
    const account = await createAccount();
    expectStatus(await rawSignOut(account.cookie), 200, "sign-out");
    const page = await getPage("/household", account.cookie);
    expect(page.finalPath, describePage("GET /household avec le cookie ferme", page)).toBe("/sign-in");
  });
});
