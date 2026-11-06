/**
 * GET et POST /api/household/invite-code (contrats `getInviteCode`,
 * `regenerateInviteCode`). Ordre du contrat : session (401), foyer (403
 * NO_HOUSEHOLD), role (403 INSUFFICIENT_ROLE), portes par les fonctions de base.
 * Le foyer est toujours celui de l'utilisateur de session (ADR-0002) ; aucune
 * entree n'est lue de la requete : le corps de POST est ignore.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getInviteCode as getContract, regenerateInviteCode as regenerateContract } from "@/lib/contracts";
import { errorResponse, unauthenticated, type Result } from "@/lib/errors";
import { getInviteCode, regenerateInviteCode } from "@/lib/invite-code";

export const dynamic = "force-dynamic";

function respond(result: Result<{ code: string }>, contract: typeof getContract | typeof regenerateContract): NextResponse {
  if (!result.ok) return errorResponse(result.error);
  const body = contract.output.parse(result.value);
  return NextResponse.json(body, { status: contract.successStatus, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) return errorResponse(unauthenticated());
  return respond(await getInviteCode(user.id), getContract);
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) return errorResponse(unauthenticated());
  return respond(await regenerateInviteCode(user.id), regenerateContract);
}
