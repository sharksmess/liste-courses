/**
 * PATCH et DELETE /api/household/items/:itemId (contrats `setItemPurchased`,
 * `deleteItem`). Ordre des contrats : session (401), foyer (403), article (404),
 * puis pour PATCH corps (422). Un `:itemId` qui n'est pas un UUID, un article
 * inexistant et un article d'un autre foyer donnent la meme reponse (ADR-0003,
 * ADR-0006). `itemId` vient du seul parametre de route, jamais du corps.
 */
import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { deleteItem as deleteContract, setItemPurchased as setPurchasedContract } from "@/lib/contracts";
import { errorResponse, fail, itemNotFound, ok, unauthenticated, validationFailed, type Result } from "@/lib/errors";
import { deleteItem, findItem, requireHousehold, setItemPurchased } from "@/lib/items";
import { failedFields, readJson } from "@/lib/request";

export const dynamic = "force-dynamic";

interface ItemRouteContext {
  params: Promise<{ itemId: string }>;
}

const ItemIdParam = setPurchasedContract.input.shape.itemId;
const PurchasedBody = setPurchasedContract.input.pick({ purchased: true });

/** Identifiant de route valide ; sinon NO_HOUSEHOLD avant ITEM_NOT_FOUND, comme un article absent. */
async function readItemId(userId: string, context: ItemRouteContext): Promise<Result<string>> {
  const { itemId } = await context.params;
  const parsed = ItemIdParam.safeParse(itemId);
  if (parsed.success) return ok(parsed.data);
  const member = await requireHousehold(userId);
  return fail(member.ok ? itemNotFound() : member.error);
}

export async function PATCH(request: Request, context: ItemRouteContext): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) return errorResponse(unauthenticated());

  const itemId = await readItemId(user.id, context);
  if (!itemId.ok) return errorResponse(itemId.error);

  const parsed = PurchasedBody.safeParse(await readJson(request));
  if (!parsed.success) {
    // 404 avant 422 : le corps n'est reproche qu'a propos d'un article du foyer.
    const present = await findItem(user.id, itemId.value);
    return errorResponse(present.ok ? validationFailed(failedFields(parsed.error)) : present.error);
  }

  const result = await setItemPurchased(user.id, itemId.value, parsed.data.purchased);
  if (!result.ok) return errorResponse(result.error);
  const body = setPurchasedContract.output.parse(result.value);
  return NextResponse.json(body, { status: setPurchasedContract.successStatus, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request, context: ItemRouteContext): Promise<NextResponse> {
  const user = await getSessionUser(request.headers);
  if (!user) return errorResponse(unauthenticated());

  const itemId = await readItemId(user.id, context);
  if (!itemId.ok) return errorResponse(itemId.error);

  const result = await deleteItem(user.id, itemId.value);
  if (!result.ok) return errorResponse(result.error);
  const body = deleteContract.output.parse(result.value);
  return NextResponse.json(body, { status: deleteContract.successStatus, headers: { "Cache-Control": "no-store" } });
}
