/**
 * Couche de service « foyer » (US-03, US-04), commune aux Route Handlers et aux
 * pages (ADR-0006). Les arguments sont deja valides par le schema du contrat ;
 * `userId` vient toujours de la session, jamais de la requete (ADR-0002).
 * Toute requete passe par `withUser` (role lc_app, app.user_id pose) et filtre
 * explicitement sur le foyer de l'utilisateur, en plus de la RLS.
 */
import { sqlState, withUser } from "./db";
import { alreadyInHousehold, fail, ok, type Result } from "./errors";

export type HouseholdRole = "owner" | "member";

export interface HouseholdSummary {
  name: string;
  role: HouseholdRole;
}

interface SummaryRow {
  name: string;
  role: string;
}

function toRole(role: string): HouseholdRole {
  if (role === "owner" || role === "member") return role;
  // membership_role_check l'interdit en base : invariant rompu.
  throw new Error("role d'appartenance inattendu");
}

/** Foyer de l'utilisateur de session et son role, ou null (aucun foyer). */
export async function findHousehold(userId: string): Promise<HouseholdSummary | null> {
  const row = await withUser(userId, async (client) => {
    const result = await client.query<SummaryRow>(
      `SELECT h.name, m.role
         FROM lc.household h
         JOIN lc.membership m ON m.household_id = h.id
        WHERE h.id = lc.current_household_id()
          AND m.household_id = lc.current_household_id()
          AND m.user_id = lc.current_user_id()`,
    );
    return result.rows[0];
  });
  return row ? { name: row.name, role: toRole(row.role) } : null;
}

/**
 * Cree le foyer et en fait la responsable (`lc.create_household`, SECURITY
 * DEFINER) : foyer, appartenance owner et code dans la meme transaction.
 * `LC002` (deja membre, y compris une creation concurrente du meme compte)
 * devient ALREADY_IN_HOUSEHOLD ; toute autre erreur est un defaut du serveur.
 */
export async function createHousehold(userId: string, name: string): Promise<Result<{ name: string; role: "owner" }>> {
  try {
    const created = await withUser(userId, async (client) => {
      await client.query("SELECT lc.create_household($1)", [name]);
      const result = await client.query<{ name: string }>(
        "SELECT h.name FROM lc.household h WHERE h.id = lc.current_household_id()",
      );
      return result.rows[0];
    });
    if (!created) throw new Error("foyer cree mais illisible");
    return ok({ name: created.name, role: "owner" });
  } catch (error) {
    if (sqlState(error) === "LC002") return fail(alreadyInHousehold());
    throw error;
  }
}
