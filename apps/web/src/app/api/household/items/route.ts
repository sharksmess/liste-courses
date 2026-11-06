/**
 * GET et POST /api/household/items (contrats `listItems`, `addItem`). Ordre des
 * contrats : session (401), foyer (403), puis pour POST validation (422) et borne
 * (409), portee par la base. Le foyer et l'auteur viennent de la session
 * (ADR-0002) : le corps n'apporte que `name` et `quantity`.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { addItem as addContract, listItems as listContract } from "@/lib/contracts";
import { errorResponse, unauthenticated, validationFailed } from "@/lib/errors";
import { addItem, listItems, requireHousehold } from "@/lib/items";
import { failedFields, readJson } from "@/lib/request";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) return errorResponse(unauthenticated());

  const result = await listItems(user.id);
  if (!result.ok) return errorResponse(result.error);
  const body = listContract.output.parse({ items: result.value });
  return NextResponse.json(body, { status: listContract.successStatus, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) return errorResponse(unauthenticated());

  const member = await requireHousehold(user.id);
  if (!member.ok) return errorResponse(member.error);

  const parsed = addContract.input.safeParse(await readJson(request));
  if (!parsed.success) return errorResponse(validationFailed(failedFields(parsed.error)));

  const result = await addItem(user.id, parsed.data);
  if (!result.ok) return errorResponse(result.error);
  const body = addContract.output.parse(result.value);
  return NextResponse.json(body, { status: addContract.successStatus, headers: { "Cache-Control": "no-store" } });
}
