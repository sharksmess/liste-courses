/**
 * POST /api/household (contrat `createHousehold`). Ordre ADR-0003 : session
 * (401), foyer deja present (409), puis validation du nom (422). Le foyer cree
 * est toujours celui de l'utilisateur de session ; aucun identifiant n'entre ni
 * ne sort (ADR-0002).
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createHousehold as contract } from "@/lib/contracts";
import { alreadyInHousehold, errorResponse, unauthenticated, validationFailed } from "@/lib/errors";
import { createHousehold, findHousehold } from "@/lib/household";

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

  const result = await createHousehold(user.id, parsed.data.name);
  if (!result.ok) return errorResponse(result.error);
  const body = contract.output.parse(result.value);
  return NextResponse.json(body, { status: contract.successStatus, headers: { "Cache-Control": "no-store" } });
}
