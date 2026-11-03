/**
 * Erreurs metier typees (CLAUDE.md : valeurs de retour, `throw` reserve aux
 * invariants). Chaque code correspond a une entree `errors` d'un contrat de
 * `docs/02-architecture/api-contracts/` ; le corps HTTP est celui de l'ADR-0006,
 * `{ error: { code, fields? } }`, sans message technique ni valeur recue.
 */
import { NextResponse } from "next/server";

export type ApiError =
  | { status: 401; code: "UNAUTHENTICATED" }
  | { status: 409; code: "ALREADY_IN_HOUSEHOLD" }
  | { status: 422; code: "VALIDATION_FAILED"; fields: string[] };

export type Result<T> = { ok: true; value: T } | { ok: false; error: ApiError };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T>(error: ApiError): Result<T> => ({ ok: false, error });

export const unauthenticated = (): ApiError => ({ status: 401, code: "UNAUTHENTICATED" });
export const alreadyInHousehold = (): ApiError => ({ status: 409, code: "ALREADY_IN_HOUSEHOLD" });
/** Noms des champs en cause, jamais leur valeur (ADR-0006). */
export const validationFailed = (fields: string[]): ApiError => ({ status: 422, code: "VALIDATION_FAILED", fields });

export function errorResponse(error: ApiError): NextResponse {
  const body = error.code === "VALIDATION_FAILED" ? { code: error.code, fields: error.fields } : { code: error.code };
  return NextResponse.json({ error: body }, { status: error.status, headers: { "Cache-Control": "no-store" } });
}
