/**
 * GET /api/household/members (contrat `listMembers`). Ordre du contrat : session
 * (401), foyer (403). Prenoms et roles seulement (US-10.2).
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listMembers as contract } from "@/lib/contracts";
import { errorResponse, unauthenticated } from "@/lib/errors";
import { listMembers } from "@/lib/members";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) return errorResponse(unauthenticated());

  const result = await listMembers(user.id);
  if (!result.ok) return errorResponse(result.error);
  const body = contract.output.parse({ members: result.value });
  return NextResponse.json(body, { status: contract.successStatus, headers: { "Cache-Control": "no-store" } });
}
