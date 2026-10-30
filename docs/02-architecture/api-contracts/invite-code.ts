import { z } from "zod";
import { ApiContract, E } from "./_contract";

/**
 * US-11 — Code d'invitation du foyer de session, visible et regenerable par la
 * responsable seule (D-013, D-014). Format et stockage : ADR-0004.
 */

/** Forme affichee : XXXXX-XXXXX, alphabet de Crockford sans I, L, O, U. */
const inviteCodeOutput = z.object({
  code: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/),
});

const ownerOnly = { ...E.insufficientRole, trigger: E.insufficientRole.trigger + " (US-11.2, US-11.4)" };

/** US-11.1 — Lecture du code en vigueur. */
const getInviteCodeInput = z.object({});

export const getInviteCode: ApiContract<typeof getInviteCodeInput, typeof inviteCodeOutput> = {
  route: "/api/household/invite-code",
  method: "GET",
  minRole: "owner",
  successStatus: 200,
  input: getInviteCodeInput,
  output: inviteCodeOutput,
  errors: [E.unauthenticated, E.noHousehold, ownerOnly],
  idempotency: "idempotente par nature : lecture seule.",
};

/**
 * US-11.3 — Regeneration : un nouveau code est en vigueur, l'ancien est refuse
 * des maintenant (POST /api/household/join -> 404 INVITE_CODE_INVALID).
 */
const regenerateInviteCodeInput = z.object({});

export const regenerateInviteCode: ApiContract<typeof regenerateInviteCodeInput, typeof inviteCodeOutput> = {
  route: "/api/household/invite-code",
  method: "POST",
  minRole: "owner",
  successStatus: 200,
  input: regenerateInviteCodeInput,
  output: inviteCodeOutput,
  errors: [E.unauthenticated, E.noHousehold, ownerOnly],
  idempotency:
    "non-idempotente par nature : chaque appel invalide le code precedent et en emet un nouveau. Un rejeu n'a pas d'autre effet que cette nouvelle regeneration.",
};
