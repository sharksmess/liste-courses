/**
 * GET /api/me (contrat `getMe`) : prenom de l'utilisateur de session et son
 * foyer, ou household: null. Ordre ADR-0003 : session, puis lecture.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getMe } from "@/lib/contracts";
import { errorResponse, unauthenticated } from "@/lib/errors";
import { findHousehold } from "@/lib/household";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) return errorResponse(unauthenticated());

  const household = await findHousehold(user.id);
  const body = getMe.output.parse({ user: { name: user.name }, household });
  return NextResponse.json(body, { status: getMe.successStatus, headers: { "Cache-Control": "no-store" } });
}
