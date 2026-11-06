/**
 * Couche de service « liste de courses » (US-06 a US-09), commune aux Route
 * Handlers et a la page du foyer (ADR-0006). Les arguments sont deja valides par
 * les schemas du contrat ; `userId` vient toujours de la session, jamais de la
 * requete (ADR-0002). Toute requete passe par `withUser` (role lc_app,
 * app.user_id pose) et filtre sur `lc.current_household_id()`, en plus de la RLS.
 * Le foyer et l'action sont lus dans la meme transaction : `NULL` donne
 * NO_HOUSEHOLD, zero ligne touchee donne ITEM_NOT_FOUND. Un compte sans foyer des
 * le debut de la transaction n'obtient donc pas 404. En READ COMMITTED, chaque
 * instruction relit l'appartenance : apres la coupure de 004, aucune ecriture ne
 * passe ; un retrait survenu entre les deux instructions donne 404 au lieu de
 * 403, sans rien reveler.
 */
import type { PoolClient } from "pg";
import { sqlState, withUser } from "./db";
import { fail, itemLimitReached, itemNotFound, noHousehold, ok, type Result } from "./errors";

/** Article tel que l'expose le contrat : ni foyer, ni identifiant d'auteur. */
export interface Item {
  id: string;
  name: string;
  quantity: string | null;
  purchased: boolean;
  addedBy: { name: string };
  createdAt: string;
}

interface ItemRow {
  id: string;
  name: string;
  quantity: string | null;
  purchased: boolean;
  author_name: string;
  created_at: Date;
}

const ITEM_COLUMNS = "id, name, quantity, purchased, author_name, created_at";

function toItem(row: ItemRow): Item {
  return {
    id: row.id,
    name: row.name,
    quantity: row.quantity,
    purchased: row.purchased,
    addedBy: { name: row.author_name },
    createdAt: row.created_at.toISOString(),
  };
}

/** Execute `run` si l'utilisateur a un foyer, dans la meme transaction ; sinon NO_HOUSEHOLD. */
function inHousehold<T>(userId: string, run: (client: PoolClient) => Promise<Result<T>>): Promise<Result<T>> {
  return withUser(userId, async (client) => {
    const result = await client.query<{ id: string | null }>("SELECT lc.current_household_id() AS id");
    if (!result.rows[0]?.id) return fail(noHousehold());
    return run(client);
  });
}

/** NO_HOUSEHOLD si l'utilisateur n'a pas de foyer : verification preliminaire des routes. */
export function requireHousehold(userId: string): Promise<Result<null>> {
  return inHousehold(userId, () => Promise.resolve(ok(null)));
}

/** Liste du foyer de session, dans l'ordre d'ajout (D-013). */
export function listItems(userId: string): Promise<Result<Item[]>> {
  return inHousehold(userId, async (client) => {
    const result = await client.query<ItemRow>(
      `SELECT ${ITEM_COLUMNS}
         FROM lc.item
        WHERE household_id = lc.current_household_id()
        ORDER BY created_at, id`,
    );
    return ok(result.rows.map(toItem));
  });
}

/** Article du foyer de session, ou ITEM_NOT_FOUND : un article d'un autre foyer n'existe pas. */
export function findItem(userId: string, itemId: string): Promise<Result<Item>> {
  return inHousehold(userId, async (client) => {
    const result = await client.query<ItemRow>(
      `SELECT ${ITEM_COLUMNS}
         FROM lc.item
        WHERE id = $1
          AND household_id = lc.current_household_id()`,
      [itemId],
    );
    const row = result.rows[0];
    return row ? ok(toItem(row)) : fail(itemNotFound());
  });
}

/**
 * Ajoute un article (`lc.add_item`, SECURITY DEFINER) : le foyer, l'auteur et son
 * prenom viennent de la session, en base. L'article est relu dans la meme
 * transaction. `LC008` et `LC009` (foyer perdu depuis la verification de la
 * route) deviennent des erreurs typees ; toute autre erreur est un defaut du
 * serveur, y compris `23514` sur une colonne de texte (ERD, Codes d'erreur).
 * Une relecture vide veut dire que le compte a ete retire apres `add_item` :
 * l'article reste (Q-8, D-066), la transaction valide, et le compte, qui ne peut
 * plus le relire sous RLS, recoit NO_HOUSEHOLD.
 */
export async function addItem(userId: string, input: { name: string; quantity: string | null }): Promise<Result<Item>> {
  try {
    const row = await withUser(userId, async (client) => {
      const added = await client.query<{ id: string }>("SELECT lc.add_item($1, $2) AS id", [input.name, input.quantity]);
      const result = await client.query<ItemRow>(
        `SELECT ${ITEM_COLUMNS}
           FROM lc.item
          WHERE id = $1
            AND household_id = lc.current_household_id()`,
        [added.rows[0]?.id],
      );
      return result.rows[0];
    });
    return row ? ok(toItem(row)) : fail(noHousehold());
  } catch (error) {
    switch (sqlState(error)) {
      case "LC008":
        return fail(itemLimitReached());
      case "LC009":
        return fail(noHousehold());
      default:
        throw error;
    }
  }
}

/** Coche ou decoche : seul `purchased` change. Zero ligne touchee donne ITEM_NOT_FOUND. */
export function setItemPurchased(userId: string, itemId: string, purchased: boolean): Promise<Result<Item>> {
  return inHousehold(userId, async (client) => {
    const result = await client.query<ItemRow>(
      `UPDATE lc.item
          SET purchased = $2
        WHERE id = $1
          AND household_id = lc.current_household_id()
        RETURNING ${ITEM_COLUMNS}`,
      [itemId, purchased],
    );
    const row = result.rows[0];
    return row ? ok(toItem(row)) : fail(itemNotFound());
  });
}

/** Suppression definitive ; le trigger decremente `item_count`. Zero ligne touchee donne ITEM_NOT_FOUND. */
export function deleteItem(userId: string, itemId: string): Promise<Result<{ deleted: true }>> {
  return inHousehold(userId, async (client) => {
    const result = await client.query(
      `DELETE FROM lc.item
        WHERE id = $1
          AND household_id = lc.current_household_id()`,
      [itemId],
    );
    return result.rowCount === 1 ? ok({ deleted: true }) : fail(itemNotFound());
  });
}
