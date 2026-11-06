/**
 * Helpers de la tranche 003 : client des quatre routes de la liste, lectures de
 * verification en base (administration, TOUJOURS filtrees par des identifiants
 * crees par le test) et amorcage de series d'articles par `lc.add_item` sous
 * `lc_app` (le compteur est tenu par le trigger, jamais pose a la main).
 *
 * Routes lues depuis les contrats (docs/02-architecture/api-contracts/items.ts).
 * Les helpers qui touchent `lc.item`
 * ou `lc.add_item` lisent la vraie base ; l'import du module est sans effet.
 *
 * Marqueurs d'ecran imposes a l'implementeur (HTML rendu, AC9) :
 *   <ul data-testid="item-list">          liste (sans `<li` quand elle est vide)
 *   <li data-testid="item-row" data-purchased="true|false">   un par article
 *   <form data-testid="add-item-form">    champs name (required) et quantity
 *   mention « La liste est vide. »        foyer sans article
 */
import { expect } from "vitest";
import { z } from "zod";
import { addItem, deleteItem as deleteItemContract, listItems, setItemPurchased } from "../../docs/02-architecture/api-contracts/items";
import { appOrigin, baseUrl } from "./auth";
import { adminPool } from "./db";
import { describeResult, expectStatus, readResponse, type HttpResult } from "./http";
import { openAppTx } from "./invite";

export interface ItemResult extends HttpResult {
  headers: Headers;
}

interface SendOptions {
  cookie?: string;
  /** Corps JSON serialise par le helper. */
  json?: unknown;
  /** Corps brut envoye tel quel (corps vide, non JSON...). Prioritaire sur `json`. */
  raw?: string;
}

export async function send(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, options: SendOptions = {}): Promise<ItemResult> {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.Cookie = options.cookie;
  let body: string | undefined;
  if (options.raw !== undefined) body = options.raw;
  else if (options.json !== undefined) body = JSON.stringify(options.json);
  if (method !== "GET") {
    headers.Origin = appOrigin();
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`${baseUrl()}${path}`, { method, headers, body });
  const result = await readResponse(response);
  return { ...result, headers: response.headers };
}

export function itemPath(id: string): string {
  return setItemPurchased.route.replace(":itemId", encodeURIComponent(id));
}

export function getItems(cookie?: string): Promise<ItemResult> {
  return send("GET", listItems.route, { cookie });
}

export function postItem(payload: unknown, cookie?: string): Promise<ItemResult> {
  return send("POST", addItem.route, { cookie, json: payload });
}

export function postItemRaw(raw: string, cookie?: string): Promise<ItemResult> {
  return send("POST", addItem.route, { cookie, raw });
}

export function patchItem(id: string, payload: unknown, cookie?: string): Promise<ItemResult> {
  return send("PATCH", itemPath(id), { cookie, json: payload });
}

export function patchItemRaw(id: string, raw: string, cookie?: string): Promise<ItemResult> {
  return send("PATCH", itemPath(id), { cookie, raw });
}

export function deleteItemAs(id: string, cookie?: string): Promise<ItemResult> {
  return send("DELETE", deleteItemContract.route.replace(":itemId", encodeURIComponent(id)), { cookie });
}

export interface ApiItem {
  id: string;
  name: string;
  quantity: string | null;
  purchased: boolean;
  addedBy: { name: string };
  createdAt: string;
}

const ITEM_KEYS = ["addedBy", "createdAt", "id", "name", "purchased", "quantity"];

/** Verifie statut, conformite au contrat ET absence de toute cle en trop ; rend l'article. */
export function expectItem(r: HttpResult, status: number, label: string): ApiItem {
  expectStatus(r, status, label);
  const parsed = addItem.output.safeParse(r.body);
  if (!parsed.success) throw new Error(`${describeResult(`${label} : corps non conforme au contrat Item`, r)} ; ${parsed.error.message}`);
  const raw = r.body;
  if (typeof raw !== "object" || raw === null) throw new Error(describeResult(`${label} : corps non objet`, r));
  expect(Object.keys(raw).sort(), describeResult(`${label} : cles de l'article`, r)).toEqual(ITEM_KEYS);
  expect(Object.keys(parsed.data.addedBy), describeResult(`${label} : cles de addedBy`, r)).toEqual(["name"]);
  return parsed.data;
}

const ItemList = z.object({ items: z.array(addItem.output) });

/** Verifie un 200 conforme et rend les articles dans l'ordre recu. */
export function expectList(r: HttpResult, label: string): ApiItem[] {
  expectStatus(r, 200, label);
  const parsed = ItemList.safeParse(r.body);
  if (!parsed.success) throw new Error(`${describeResult(`${label} : corps non conforme a { items: Item[] }`, r)} ; ${parsed.error.message}`);
  return parsed.data.items;
}

// ---------------------------------------------------------------------------
// Lectures de verification (administration)
// ---------------------------------------------------------------------------

export interface ItemRow {
  id: string;
  household_id: string;
  name: string;
  quantity: string | null;
  purchased: boolean;
  author_user_id: string;
  author_name: string;
  created_at: Date;
}

const ITEM_COLUMNS = "id, household_id, name, quantity, purchased, author_user_id, author_name, created_at";

export async function itemRowsOf(householdId: string): Promise<ItemRow[]> {
  const r = await adminPool().query<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM lc.item WHERE household_id = $1 ORDER BY created_at, id`, [householdId]);
  return r.rows;
}

export async function itemRowById(id: string): Promise<ItemRow | undefined> {
  const r = await adminPool().query<ItemRow>(`SELECT ${ITEM_COLUMNS} FROM lc.item WHERE id = $1`, [id]);
  return r.rows[0];
}

/** Reconciliation : item_count = nombre de lignes item de CE foyer. */
export async function itemCountOf(householdId: string): Promise<{ counter: number; rows: number }> {
  const r = await adminPool().query<{ counter: number; rows: string }>(
    "SELECT h.item_count AS counter, (SELECT count(*) FROM lc.item i WHERE i.household_id = h.id) AS rows FROM lc.household h WHERE h.id = $1",
    [householdId],
  );
  const row = r.rows[0];
  if (!row) throw new Error(`[tests] foyer ${householdId} introuvable`);
  return { counter: row.counter, rows: Number(row.rows) };
}

// ---------------------------------------------------------------------------
// Amorcage
// ---------------------------------------------------------------------------

/**
 * Ajoute `count` articles au foyer de `userId` par `lc.add_item` sous `lc_app`,
 * dans UNE transaction commitee (le trigger tient le compteur). Tous ont le
 * meme created_at : n'utiliser que pour les tests de borne, jamais d'ordre.
 */
export async function seedItems(userId: string, count: number, prefix = "Seed"): Promise<void> {
  const tx = await openAppTx(userId);
  try {
    await tx.client.query("SELECT lc.add_item($1::text || ' ' || g::text, NULL) FROM generate_series(1, $2::int) AS g", [prefix, count]);
    await tx.commit();
  } finally {
    await tx.rollback();
    tx.release();
  }
}

/** Un `add_item` dans sa propre transaction commitee ; rend l'identifiant. */
export async function addItemInOwnTx(userId: string, name: string, quantity: string | null = null): Promise<string> {
  const tx = await openAppTx(userId);
  try {
    const r = await tx.client.query<{ id: string }>("SELECT lc.add_item($1, $2) AS id", [name, quantity]);
    await tx.commit();
    const id = r.rows[0]?.id;
    if (!id) throw new Error("[tests] add_item n'a rendu aucun identifiant");
    return id;
  } finally {
    await tx.rollback();
    tx.release();
  }
}

/** Identifiant bien forme qu'aucun article ne porte (UUID v4 aleatoire). */
export function unknownItemId(): string {
  return crypto.randomUUID();
}
