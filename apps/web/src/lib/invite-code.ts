/**
 * Couche de service « code d'invitation » (US-11, ADR-0004), commune aux Route
 * Handlers et a la page du foyer (ADR-0006). `userId` vient toujours de la
 * session ; le foyer est celui de l'utilisateur, derive en base (ADR-0002).
 * `lc_app` n'a aucun droit sur `lc.invite_code` : tout passe par les fonctions
 * SECURITY DEFINER, qui verifient le role.
 */
import type { PoolClient } from "pg";
import { sqlState, withUser } from "./db";
import { fail, insufficientRole, noHousehold, ok, type Result } from "./errors";

/** Seule mise en forme du code stocke (10 caracteres) : XXXXX-XXXXX (ADR-0004). */
function formatInviteCode(stored: string): string {
  return `${stored.slice(0, 5)}-${stored.slice(5)}`;
}

/**
 * Execute une fonction de code qui rend le code stocke. `LC009` et `LC005`
 * deviennent des erreurs typees, dans l'ordre de la fonction : sans foyer, puis
 * role ; toute autre erreur est un defaut du serveur.
 */
async function callInviteFunction(
  userId: string,
  run: (client: PoolClient) => Promise<string | undefined>,
): Promise<Result<{ code: string }>> {
  try {
    const stored = await withUser(userId, run);
    if (!stored) throw new Error("fonction de code sans resultat");
    return ok({ code: formatInviteCode(stored) });
  } catch (error) {
    switch (sqlState(error)) {
      case "LC009":
        return fail(noHousehold());
      case "LC005":
        return fail(insufficientRole());
      default:
        throw error;
    }
  }
}

/** Code en vigueur du foyer de session, pour sa responsable seule. */
export function getInviteCode(userId: string): Promise<Result<{ code: string }>> {
  return callInviteFunction(userId, async (client) => {
    const result = await client.query<{ code: string }>("SELECT lc.get_invite_code() AS code");
    return result.rows[0]?.code;
  });
}

/** Remplace le code du foyer de session ; l'ancien cesse d'exister au COMMIT. */
export function regenerateInviteCode(userId: string): Promise<Result<{ code: string }>> {
  return callInviteFunction(userId, async (client) => {
    const result = await client.query<{ code: string }>("SELECT lc.regenerate_invite_code() AS code");
    return result.rows[0]?.code;
  });
}
