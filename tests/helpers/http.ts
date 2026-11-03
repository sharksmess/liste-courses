/**
 * Helpers HTTP communs aux tests de la tranche 001.
 *
 * Messages d'echec : tout helper qui attend un statut affiche le VRAI code HTTP
 * et le corps BRUT complet. Le corps est lu en texte, puis on tente le JSON ;
 * un corps non JSON reste du texte (jamais `.json().catch(() => undefined)`).
 *
 * Les contrats sont importes depuis docs/02-architecture/api-contracts/ (ils
 * importent `zod` : la resolution depuis `docs/` exige que `zod` soit
 * installe a la racine de l'espace de travail, voir le rapport de la tranche).
 */
import { expect } from "vitest";
import { BetterAuthErrorBody } from "../../docs/02-architecture/api-contracts/auth";
import { ErrorBody } from "../../docs/02-architecture/api-contracts/_contract";

export interface HttpResult {
  status: number;
  /** Corps brut complet. */
  text: string;
  /** JSON analyse, ou le texte brut si le corps n'est pas du JSON, ou undefined si le corps est vide. */
  body: unknown;
  /** En-tetes Set-Cookie bruts. */
  setCookies: string[];
}

export async function readResponse(response: Response): Promise<HttpResult> {
  const text = await response.text();
  const setCookies = response.headers.getSetCookie();
  if (text.length === 0) return { status: response.status, text, body: undefined, setCookies };
  try {
    return { status: response.status, text, body: JSON.parse(text), setCookies };
  } catch {
    return { status: response.status, text, body: text, setCookies };
  }
}

/** Texte d'echec : vrai statut, corps brut complet, noms (jamais valeurs) des cookies poses. */
export function describeResult(label: string, r: HttpResult): string {
  const names = r.setCookies.map((c) => c.split("=")[0] ?? "");
  return `${label} : HTTP ${r.status}, corps brut ${JSON.stringify(r.text)}, cookies poses ${JSON.stringify(names)}`;
}

export function expectStatus(r: HttpResult, expected: number, label: string): void {
  expect(r.status, describeResult(label, r)).toBe(expected);
}

/** Erreur applicative (ADR-0006) : `{ error: { code } }`. */
export function expectAppError(r: HttpResult, status: number, code: string, label: string): void {
  expectStatus(r, status, label);
  const parsed = ErrorBody.safeParse(r.body);
  expect(parsed.success, describeResult(`${label} (corps non conforme a ErrorBody)`, r)).toBe(true);
  expect(parsed.success ? parsed.data.error.code : undefined, describeResult(label, r)).toBe(code);
}

/** Erreur better-auth : `{ code, message }`. */
export function expectAuthError(r: HttpResult, status: number, code: string, label: string): void {
  expectStatus(r, status, label);
  const parsed = BetterAuthErrorBody.safeParse(r.body);
  expect(parsed.success, describeResult(`${label} (corps non conforme a BetterAuthErrorBody)`, r)).toBe(true);
  expect(parsed.success ? parsed.data.code : undefined, describeResult(label, r)).toBe(code);
}

/**
 * Cookie de requete construit depuis des Set-Cookie : toutes les paires
 * nom=valeur non vides (un cookie efface par la deconnexion a une valeur vide
 * ou un Max-Age=0 et est ecarte).
 */
export function cookieHeaderFrom(setCookies: string[]): string {
  const pairs: string[] = [];
  for (const raw of setCookies) {
    const [pair = "", ...attrs] = raw.split(";").map((p) => p.trim());
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    const value = pair.slice(eq + 1);
    const expired = attrs.some((a) => /^max-age=0$/i.test(a));
    if (value.length === 0 || expired) continue;
    pairs.push(pair);
  }
  return pairs.join("; ");
}

export function hasSessionCookie(setCookies: string[]): boolean {
  return cookieHeaderFrom(setCookies).includes("session_token");
}
