/**
 * POST /api/household/leave (contrat `leaveHousehold`). Ordre du contrat : session
 * (401), foyer (403), responsable (409). Le corps n'est pas lu : l'entree est
 * vide, et le compte qui part vient de la session (ADR-0002).
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { leaveHousehold as contract } from "@/lib/contracts";
import { errorResponse, unauthenticated } from "@/lib/errors";
import { leaveHousehold } from "@/lib/members";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) return errorResponse(unauthenticated());

  const result = await leaveHousehold(user.id);
  if (!result.ok) return errorResponse(result.error);
  const body = contract.output.parse(result.value);
  return NextResponse.json(body, { status: contract.successStatus, headers: { "Cache-Control": "no-store" } });
}
