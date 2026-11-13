/**
 * Couche de service « membres » (US-10, US-12, US-13), commune aux Route Handlers
 * et a la page du foyer (ADR-0006). `userId` vient toujours de la session, jamais
 * de la requete (ADR-0002). `lc_app` n'a aucun droit d'ecriture sur
 * `lc.membership` : le retrait et le depart passent par les fonctions SECURITY
 * DEFINER, qui portent l'ordre de verification et verifient le role.
 */
import { sqlState, withUser } from "./db";
import {
  fail,
  insufficientRole,
  memberNotFound,
  noHousehold,
  ok,
  ownerCannotBeRemoved,
  ownerCannotLeave,
  type ApiError,
  type Result,
} from "./errors";
import { findHousehold, toRole, type HouseholdRole } from "./household";

/** Membre tel que l'expose le contrat : ni compte, ni adresse, ni foyer. */
export interface Member {
  memberId: string;
  name: string;
  role: HouseholdRole;
}

interface MemberRow {
  id: string;
  display_name: string;
  role: string;
}

/**
 * Membres du foyer de session, dans l'ordre d'entree. Une seule instruction, donc
 * sans fenetre entre le foyer et la lecture : un foyer compte toujours sa
 * responsable, et zero ligne veut dire que le compte n'a pas de foyer. Aucune
 * colonne de compte n'est lue.
 */
export async function listMembers(userId: string): Promise<Result<Member[]>> {
  const rows = await withUser(userId, async (client) => {
    const result = await client.query<MemberRow>(
      `SELECT id, display_name, role
         FROM lc.membership
        WHERE household_id = lc.current_household_id()
        ORDER BY joined_at, id`,
    );
    return result.rows;
  });
  if (rows.length === 0) return fail(noHousehold());
  return ok(rows.map((row) => ({ memberId: row.id, name: row.display_name, role: toRole(row.role) })));
}

/**
 * Retire un membre du foyer de session (`lc.remove_member`). `memberId` est deja
 * un UUID ; la fonction porte tout l'ordre : `LC009`, `LC005`, `LC007`, `LC006`.
 * Toute autre erreur est un defaut du serveur.
 */
export async function removeMember(userId: string, memberId: string): Promise<Result<{ removed: true }>> {
  try {
    await withUser(userId, (client) => client.query("SELECT lc.remove_member($1)", [memberId]));
    return ok({ removed: true });
  } catch (error) {
    switch (sqlState(error)) {
      case "LC009":
        return fail(noHousehold());
      case "LC005":
        return fail(insufficientRole());
      case "LC007":
        return fail(ownerCannotBeRemoved());
      case "LC006":
        return fail(memberNotFound());
      default:
        throw error;
    }
  }
}

/**
 * Refus d'un `:memberId` qui n'est pas un UUID : il ne peut pas atteindre la
 * fonction de base, et suit pourtant le meme ordre (foyer, role, puis 404).
 */
export async function malformedMemberError(userId: string): Promise<ApiError> {
  const household = await findHousehold(userId);
  if (!household) return noHousehold();
  return household.role === "owner" ? memberNotFound() : insufficientRole();
}

/**
 * Depart du foyer de session (`lc.leave_household`). `LC009`, y compris un retrait
 * concurrent, et `LC007` deviennent des erreurs typees ; toute autre erreur est un
 * defaut du serveur.
 */
export async function leaveHousehold(userId: string): Promise<Result<{ left: true }>> {
  try {
    await withUser(userId, (client) => client.query("SELECT lc.leave_household()"));
    return ok({ left: true });
  } catch (error) {
    switch (sqlState(error)) {
      case "LC009":
        return fail(noHousehold());
      case "LC007":
        return fail(ownerCannotLeave());
      default:
        throw error;
    }
  }
}
