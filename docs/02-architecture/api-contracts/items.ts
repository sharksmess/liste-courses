import { z } from "zod";
import { ApiContract, codePointLength, E, trimmedText, Uuid } from "./_contract";

/**
 * US-06 a US-09 — La liste unique du foyer de session. Tout membre, quel que
 * soit son role, agit sur n'importe quel article de son foyer. Un article d'un
 * autre foyer et un article inexistant donnent la meme reponse (ADR-0003).
 */

const item = z.object({
  id: Uuid,
  name: z.string().min(1).max(100),
  /** null = pas de quantite (US-07.3). */
  quantity: z.string().min(1).max(30).nullable(),
  purchased: z.boolean(),
  /** Prenom de l'auteur, conserve apres son depart ou son retrait (US-06.2, D-009). */
  addedBy: z.object({ name: z.string().min(1).max(30) }),
  createdAt: z.string().datetime({ offset: true }),
});

const itemNotFound = {
  status: 404 as const,
  code: "ITEM_NOT_FOUND",
  trigger:
    "itemId absent du foyer de session : inexistant, d'un autre foyer, deja supprime, ou pas un UUID (ADR-0006)",
};

/** US-06 — Liste complete, dans l'ordre d'ajout (D-013) : created_at puis id croissants. */
const listItemsInput = z.object({});
const listItemsOutput = z.object({ items: z.array(item).max(200) });

export const listItems: ApiContract<typeof listItemsInput, typeof listItemsOutput> = {
  route: "/api/household/items",
  method: "GET",
  minRole: "member",
  successStatus: 200,
  input: listItemsInput,
  output: listItemsOutput,
  errors: [E.unauthenticated, E.noHousehold],
  idempotency: "idempotente par nature : lecture seule.",
};

/**
 * US-07 — Ajout. L'article nait non coche, l'appelant en est l'auteur.
 * Quantite vide ou faite d'espaces = absente (D-013). Doublons de nom autorises.
 */
const addItemInput = z.object({
  name: trimmedText(1, 100),
  quantity: z
    .string()
    .trim()
    .refine((q) => codePointLength(q) <= 30)
    .nullish()
    .transform((q) => (q ? q : null)),
});

export const addItem: ApiContract<typeof addItemInput, typeof item> = {
  route: "/api/household/items",
  method: "POST",
  minRole: "member",
  successStatus: 201,
  input: addItemInput,
  output: item,
  errors: [
    E.unauthenticated,
    E.noHousehold,
    E.validation("name vide ou fait d'espaces, ou > 100 caracteres apres trim ; quantity > 30 caracteres apres trim"),
    {
      status: 409,
      code: "ITEM_LIMIT_REACHED",
      trigger: "le foyer compte deja 200 articles, coches compris (US-07.5), borne verifiee en base",
    },
  ],
  idempotency:
    "non-idempotente : chaque appel reussi cree un article (doublons autorises par le PRD, US-07.4). Aucune cle de deduplication.",
};

/** US-08 — Cocher (purchased = true) ou decocher (false). */
const setPurchasedInput = z.object({
  itemId: Uuid,
  purchased: z.boolean(),
});

export const setItemPurchased: ApiContract<typeof setPurchasedInput, typeof item> = {
  route: "/api/household/items/:itemId",
  method: "PATCH",
  minRole: "member",
  successStatus: 200,
  input: setPurchasedInput,
  output: item,
  errors: [E.unauthenticated, E.noHousehold, itemNotFound, E.validation("purchased absent ou non booleen")],
  idempotency: "idempotente sur (itemId, purchased) : rejouer donne le meme etat final.",
};

/** US-09 — Suppression definitive (pas d'historique, PRD). Libere une place sous 200. */
const deleteItemInput = z.object({ itemId: Uuid });
const deleteItemOutput = z.object({ deleted: z.literal(true) });

export const deleteItem: ApiContract<typeof deleteItemInput, typeof deleteItemOutput> = {
  route: "/api/household/items/:itemId",
  method: "DELETE",
  minRole: "member",
  successStatus: 200,
  input: deleteItemInput,
  output: deleteItemOutput,
  errors: [E.unauthenticated, E.noHousehold, itemNotFound],
  idempotency:
    "etat final idempotent : un rejeu donne 404 ITEM_NOT_FOUND, sans autre effet.",
};
