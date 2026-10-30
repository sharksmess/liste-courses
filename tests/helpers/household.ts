/**
 * Helpers « foyer » : client de POST /api/household et GET /api/me, lectures de
 * verification en base (connexion d'administration, TOUJOURS filtrees par des
 * identifiants ou des marqueurs crees par le test, jamais par une table
 * entiere), et lecture du HTML rendu des pages.
 *
 * Chemins de pages supposes (a respecter par l'implementeur) :
 *   /sign-up        inscription
 *   /sign-in        connexion
 *   /no-household   page « sans foyer »
 *   /household      page du foyer (liste vide en tranche 001)
 *   /               aiguille selon l'etat : /sign-in sans session, /no-household
 *                   sans foyer, /household avec foyer
 * Les redirections sont suivies par `fetch` ; on lit le chemin FINAL.
 * Marqueur impose a la liste vide de /household : un element portant
 * `data-testid="item-list"` et ne contenant aucun `<li`.
 */
import { adminPool } from "./db";
import { getJson, postJson, baseUrl, createAccount, uniqueTag, type Account } from "./auth";
import { describeResult, expectStatus, type HttpResult } from "./http";
import { createHousehold, getMe } from "../../docs/02-architecture/api-contracts/household";

export function postHousehold(name: unknown, cookie?: string): Promise<HttpResult> {
  return postJson(createHousehold.route, { name }, { cookie });
}

export function getMeAs(cookie?: string): Promise<HttpResult> {
  return getJson(getMe.route, cookie);
}

export interface Fixture {
  account: Account;
  householdName: string;
}

/** Compte neuf + foyer cree par l'API reelle. `tag` rend le prenom, l'adresse et le foyer retrouvables. */
export async function accountWithHousehold(tag: string): Promise<Fixture> {
  const account = await createAccount({ name: `Prenom${tag}`, email: `${tag.toLowerCase()}-${uniqueTag("a")}@example.test` });
  const householdName = `Foyer ${tag} ${uniqueTag("h")}`;
  const r = await postHousehold(householdName, account.cookie);
  expectStatus(r, 201, `creation du foyer ${tag}`);
  return { account, householdName };
}

// ---------------------------------------------------------------------------
// Lectures de verification (administration)
// ---------------------------------------------------------------------------

export interface MembershipRow {
  id: string;
  household_id: string;
  user_id: string;
  role: string;
  display_name: string;
}

export async function membershipsOfUser(userId: string): Promise<MembershipRow[]> {
  const r = await adminPool().query<MembershipRow>(
    "SELECT id, household_id, user_id, role, display_name FROM lc.membership WHERE user_id = $1",
    [userId],
  );
  return r.rows;
}

export interface HouseholdRow {
  id: string;
  name: string;
  member_count: number;
  item_count: number;
}

export async function householdsByName(name: string): Promise<HouseholdRow[]> {
  const r = await adminPool().query<HouseholdRow>(
    "SELECT id, name, member_count, item_count FROM lc.household WHERE name = $1",
    [name],
  );
  return r.rows;
}

export async function householdById(id: string): Promise<HouseholdRow | undefined> {
  const r = await adminPool().query<HouseholdRow>(
    "SELECT id, name, member_count, item_count FROM lc.household WHERE id = $1",
    [id],
  );
  return r.rows[0];
}

export async function inviteCodeOf(householdId: string): Promise<string | undefined> {
  const r = await adminPool().query<{ code: string }>("SELECT code FROM lc.invite_code WHERE household_id = $1", [householdId]);
  return r.rows[0]?.code;
}

export async function usersByEmail(email: string): Promise<{ id: string; name: string; email: string }[]> {
  const r = await adminPool().query<{ id: string; name: string; email: string }>(
    "SELECT id, name, email FROM lc_auth.app_user WHERE lower(email) = lower($1)",
    [email],
  );
  return r.rows;
}

// ---------------------------------------------------------------------------
// Pages rendues
// ---------------------------------------------------------------------------

export interface Page {
  status: number;
  finalPath: string;
  html: string;
  /** Texte visible : sans balises, scripts, styles, commentaires ni accents, en minuscules. */
  text: string;
}

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** GET d'une page en suivant les redirections ; rend le statut final, le chemin final et le HTML. */
export async function getPage(path: string, cookie?: string): Promise<Page> {
  const response = await fetch(`${baseUrl()}${path}`, {
    method: "GET",
    redirect: "follow",
    headers: cookie ? { Cookie: cookie } : {},
  });
  const html = await response.text();
  return { status: response.status, finalPath: new URL(response.url).pathname, html, text: visibleText(html) };
}

export function describePage(label: string, p: Page): string {
  return `${label} : HTTP ${p.status}, chemin final ${p.finalPath}, HTML brut ${JSON.stringify(p.html.slice(0, 4000))}`;
}

export { describeResult };
