/**
 * POST /api/household/join (contrat `joinHousehold`). Ordre du contrat : session
 * (401), deja dans un foyer (409), validation du code (422), code refuse (404),
 * foyer complet (409). Le foyer rejoint est celui du code ; aucun identifiant
 * n'entre ni ne sort, et un refus ne revele rien d'un foyer (US-05.2).
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { joinHousehold as contract } from "@/lib/contracts";
import { alreadyInHousehold, errorResponse, unauthenticated, validationFailed } from "@/lib/errors";
import { findHousehold, joinHousehold } from "@/lib/household";

export const dynamic = "force-dynamic";

async function readJson(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return undefined;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) return errorResponse(unauthenticated());

  const parsed = contract.input.safeParse(await readJson(request));
  if (!parsed.success) {
    // Un compte qui a deja un foyer recoit 409 avant toute validation (ADR-0003).
    if (await findHousehold(user.id)) return errorResponse(alreadyInHousehold());
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path.join(".") || "(corps)"))];
    return errorResponse(validationFailed(fields));
  }

  const result = await joinHousehold(user.id, parsed.data.code);
  if (!result.ok) return errorResponse(result.error);
  const body = contract.output.parse(result.value);
  return NextResponse.json(body, { status: contract.successStatus, headers: { "Cache-Control": "no-store" } });
}
