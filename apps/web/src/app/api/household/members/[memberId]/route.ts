/**
 * DELETE /api/household/members/:memberId (contrat `removeMember`). Ordre du
 * contrat : session (401), foyer (403), role (403), membre (404), responsable
 * (409). Un `:memberId` qui n'est pas un UUID, un membre inexistant et un membre
 * d'un autre foyer donnent la meme reponse, apres les controles de foyer et de
 * role (ADR-0003, ADR-0006). L'appelant ne fournit ni role ni foyer.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { removeMember as contract } from "@/lib/contracts";
import { errorResponse, unauthenticated } from "@/lib/errors";
import { malformedMemberError, removeMember } from "@/lib/members";

export const dynamic = "force-dynamic";

interface MemberRouteContext {
  params: Promise<{ memberId: string }>;
}

const MemberIdParam = contract.input.shape.memberId;

export async function DELETE(request: Request, context: MemberRouteContext): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) return errorResponse(unauthenticated());

  const { memberId } = await context.params;
  const parsed = MemberIdParam.safeParse(memberId);
  if (!parsed.success) return errorResponse(await malformedMemberError(user.id));

  const result = await removeMember(user.id, parsed.data);
  if (!result.ok) return errorResponse(result.error);
  const body = contract.output.parse(result.value);
  return NextResponse.json(body, { status: contract.successStatus, headers: { "Cache-Control": "no-store" } });
}
