/**
 * Client HTTP d'authentification pour les tests de la tranche 001.
 *
 * Hypotheses (contrat de tranche, ADR-0003) : better-auth est monte sous
 * `/api/auth` ; routes `sign-up/email`, `sign-in/email`, `sign-out`.
 *
 * Origine : le serveur de test n'a ni `TEST` ni `VITEST` (usine 1.6.5), donc le
 * controle d'origine de better-auth est ACTIF. Chaque POST porte
 * `Origin: <origine de TEST_APP_BASE_URL>`, comme un navigateur sur le site.
 *
 * Variable lue : TEST_APP_BASE_URL.
 */
import { loadTestEnv, requireEnv } from "../_factory/env";
import { cookieHeaderFrom, readResponse, describeResult, type HttpResult } from "./http";

loadTestEnv();

export function baseUrl(): string {
  return requireEnv(["TEST_APP_BASE_URL"]).TEST_APP_BASE_URL;
}

export function appOrigin(): string {
  return new URL(baseUrl()).origin;
}

export const DEFAULT_PASSWORD = "Correct-Horse-Battery-1";

let counter = 0;
const runTag = Date.now().toString(36);

/** Adresse unique par appel (minuscules : l'adresse est stockee en minuscules). */
export function uniqueEmail(prefix = "user"): string {
  counter += 1;
  return `${prefix}-${runTag}-${counter}@example.test`;
}

/** Marqueur unique, pour nommer des foyers ou des prenoms retrouvables sans compter une table entiere. */
export function uniqueTag(prefix: string): string {
  counter += 1;
  return `${prefix}${runTag}x${counter}`;
}

export interface PostOptions {
  cookie?: string;
  /** Defaut : l'origine de l'application. `null` : aucun en-tete Origin. */
  origin?: string | null;
}

export async function postJson(path: string, payload: unknown, options: PostOptions = {}): Promise<HttpResult> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const origin = options.origin === undefined ? appOrigin() : options.origin;
  if (origin !== null) headers.Origin = origin;
  if (options.cookie) headers.Cookie = options.cookie;
  const response = await fetch(`${baseUrl()}${path}`, {
    method: "POST",
    headers,
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
  return readResponse(response);
}

export async function getJson(path: string, cookie?: string): Promise<HttpResult> {
  const response = await fetch(`${baseUrl()}${path}`, { method: "GET", headers: cookie ? { Cookie: cookie } : {} });
  return readResponse(response);
}

export interface SignUpPayload {
  email: string;
  password: string;
  name: string;
}

/** Inscription brute : rend le resultat tel quel, sans rien supposer du succes. */
export function rawSignUp(payload: SignUpPayload, options: PostOptions = {}): Promise<HttpResult> {
  return postJson("/api/auth/sign-up/email", payload, options);
}

export function rawSignIn(email: string, password: string, options: PostOptions = {}): Promise<HttpResult> {
  return postJson("/api/auth/sign-in/email", { email, password }, options);
}

export function rawSignOut(cookie: string): Promise<HttpResult> {
  return postJson("/api/auth/sign-out", {}, { cookie });
}

export interface Account {
  cookie: string;
  userId: string;
  email: string;
  password: string;
  name: string;
}

function userIdOf(r: HttpResult): string | undefined {
  const b = r.body;
  if (typeof b === "object" && b !== null && "user" in b) {
    const { user } = b;
    if (typeof user === "object" && user !== null && "id" in user && typeof user.id === "string") return user.id;
  }
  return undefined;
}

/** Inscrit un compte neuf et rend sa session. Echoue avec le vrai statut et le corps brut. */
export async function createAccount(options: { email?: string; password?: string; name?: string } = {}): Promise<Account> {
  const email = options.email ?? uniqueEmail();
  const password = options.password ?? DEFAULT_PASSWORD;
  const name = options.name ?? "Test";
  const r = await rawSignUp({ email, password, name });
  const cookie = cookieHeaderFrom(r.setCookies);
  const userId = userIdOf(r);
  if (r.status !== 200 || !cookie || !userId) {
    throw new Error(`Echec de l'inscription de test. ${describeResult("sign-up", r)}`);
  }
  return { cookie, userId, email, password, name: name.trim() };
}

/** Ouvre une nouvelle session pour un compte existant. */
export async function signInAs(account: Pick<Account, "email" | "password">): Promise<string> {
  const r = await rawSignIn(account.email, account.password);
  const cookie = cookieHeaderFrom(r.setCookies);
  if (r.status !== 200 || !cookie) throw new Error(`Echec de la connexion de test. ${describeResult("sign-in", r)}`);
  return cookie;
}
