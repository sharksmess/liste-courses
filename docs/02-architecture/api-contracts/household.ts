import { z } from "zod";
import { ApiContract, E, HouseholdRole, trimmedText } from "./_contract";

/**
 * Foyer de l'utilisateur de session : etat courant, creation, adhesion par code.
 * Aucun identifiant de foyer n'entre ni ne sort (ADR-0002) : le foyer est
 * toujours celui de la session.
 */

const householdSummary = z.object({
  name: z.string().min(1).max(50),
  role: HouseholdRole,
});

/**
 * US-04 — Etat de l'utilisateur de session : sert a choisir entre la liste et
 * la page « sans foyer ». household = null si aucun foyer (US-01.8, US-12.1, US-13.1).
 */
const getMeInput = z.object({});

const getMeOutput = z.object({
  user: z.object({ name: z.string().min(1).max(30) }),
  household: householdSummary.nullable(),
});

export const getMe: ApiContract<typeof getMeInput, typeof getMeOutput> = {
  route: "/api/me",
  method: "GET",
  minRole: "authenticated",
  successStatus: 200,
  input: getMeInput,
  output: getMeOutput,
  errors: [E.unauthenticated],
  idempotency: "idempotente par nature : lecture seule.",
};

/**
 * US-03 — Creation d'un foyer. L'appelant en devient la responsable et le seul
 * membre ; le foyer nait avec un code d'invitation et une liste vide (US-03.3).
 * Fonction SECURITY DEFINER (ERD) : aucun contexte de foyer n'existe encore.
 */
const createHouseholdInput = z.object({
  name: trimmedText(1, 50),
});

const createHouseholdOutput = householdSummary.extend({ role: z.literal("owner") });

export const createHousehold: ApiContract<typeof createHouseholdInput, typeof createHouseholdOutput> = {
  route: "/api/household",
  method: "POST",
  minRole: "no-household",
  successStatus: 201,
  input: createHouseholdInput,
  output: createHouseholdOutput,
  errors: [
    E.unauthenticated,
    { ...E.alreadyInHousehold, trigger: E.alreadyInHousehold.trigger + " — US-03.4" },
    E.validation("name vide ou fait d'espaces, ou > 50 caracteres apres trim (US-03.2)"),
  ],
  idempotency:
    "non-idempotente au sens strict, sans doublon possible : le premier appel cree le foyer, un rejeu donne 409 ALREADY_IN_HOUSEHOLD (un seul foyer par utilisateur, garanti en base).",
};

/**
 * US-05 — Rejoindre un foyer avec son code (ADR-0004). Fonction SECURITY
 * DEFINER : seule lecture transverse aux foyers. Rien n'est revele d'un foyer
 * avant l'adhesion (US-05.2).
 *
 * Normalisation avant validation (ADR-0004, D-025) : retrait des espaces et des
 * tirets, majuscules, puis substitutions de Crockford O -> 0, I et L -> 1.
 * Seul un caractere hors alphabet apres normalisation est refuse (ex. U).
 */
export const InviteCodeInput = z
  .string()
  .transform((s) =>
    s
      .replace(/[\s-]/g, "")
      .toUpperCase()
      .replace(/O/g, "0")
      .replace(/[IL]/g, "1"),
  )
  .pipe(z.string().regex(/^[0-9A-HJKMNP-TV-Z]{10}$/));

const joinHouseholdInput = z.object({
  code: InviteCodeInput,
});

const joinHouseholdOutput = householdSummary.extend({ role: z.literal("member") });

export const joinHousehold: ApiContract<typeof joinHouseholdInput, typeof joinHouseholdOutput> = {
  route: "/api/household/join",
  method: "POST",
  minRole: "no-household",
  successStatus: 200,
  input: joinHouseholdInput,
  output: joinHouseholdOutput,
  errors: [
    { ...E.unauthenticated, trigger: E.unauthenticated.trigger + " — US-05.5" },
    { ...E.alreadyInHousehold, trigger: E.alreadyInHousehold.trigger + " — US-05.4" },
    E.validation(
      "code qui, apres normalisation (espaces et tirets retires, majuscules, O->0, I/L->1), ne fait pas 10 caracteres de l'alphabet de Crockford",
    ),
    {
      status: 404,
      code: "INVITE_CODE_INVALID",
      trigger:
        "code bien forme mais inconnu, ou remplace par une regeneration (US-05.2) ; meme reponse dans les deux cas",
    },
    {
      status: 409,
      code: "HOUSEHOLD_FULL",
      trigger: "code en vigueur d'un foyer qui compte deja 10 membres (US-05.3), borne verifiee en base",
    },
  ],
  idempotency:
    "non-idempotente au sens strict, sans doublon possible : apres un succes, un rejeu donne 409 ALREADY_IN_HOUSEHOLD.",
};
