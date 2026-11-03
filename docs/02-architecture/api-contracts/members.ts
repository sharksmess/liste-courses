import { z } from "zod";
import { ApiContract, E, HouseholdRole, Uuid } from "./_contract";

/**
 * US-10, US-12, US-13 — Membres du foyer de session : consultation, retrait par
 * la responsable, depart volontaire. La responsable ne part jamais et n'est
 * jamais retiree (D-010) : invariant garanti en base (ERD).
 */

/**
 * US-10 — Prenoms et roles, jamais les adresses e-mail (US-10.2, D-013).
 * `memberId` est l'identifiant de la ligne d'appartenance (ERD `lc.membership.id`),
 * pas celui du compte : aucun identifiant de compte ne sort du foyer.
 */
const listMembersInput = z.object({});
const listMembersOutput = z.object({
  members: z
    .array(
      z.object({
        memberId: Uuid,
        name: z.string().min(1).max(30),
        role: HouseholdRole,
      }),
    )
    .min(1)
    .max(10),
});

export const listMembers: ApiContract<typeof listMembersInput, typeof listMembersOutput> = {
  route: "/api/household/members",
  method: "GET",
  minRole: "member",
  successStatus: 200,
  input: listMembersInput,
  output: listMembersOutput,
  errors: [E.unauthenticated, E.noHousehold],
  idempotency: "idempotente par nature : lecture seule.",
};

/**
 * US-12 — Retrait d'un membre par la responsable. Le compte retire n'a plus de
 * foyer des sa requete suivante (ADR-0002) ; ses articles restent, avec son prenom.
 */
const removeMemberInput = z.object({ memberId: Uuid });
const removeMemberOutput = z.object({ removed: z.literal(true) });

export const removeMember: ApiContract<typeof removeMemberInput, typeof removeMemberOutput> = {
  route: "/api/household/members/:memberId",
  method: "DELETE",
  minRole: "owner",
  successStatus: 200,
  input: removeMemberInput,
  output: removeMemberOutput,
  errors: [
    E.unauthenticated,
    E.noHousehold,
    { ...E.insufficientRole, trigger: E.insufficientRole.trigger + " (US-12.4)" },
    {
      status: 404,
      code: "MEMBER_NOT_FOUND",
      trigger:
        "memberId absent du foyer de session : inexistant, d'un autre foyer (US-12.5), deja retire ou parti, ou pas un UUID",
    },
    {
      status: 409,
      code: "OWNER_CANNOT_BE_REMOVED",
      trigger: "memberId designe la responsable, c'est-a-dire l'appelant lui-meme (US-12.3)",
    },
  ],
  idempotency: "etat final idempotent : un rejeu donne 404 MEMBER_NOT_FOUND, sans autre effet.",
};

/** US-13 — Depart volontaire d'un membre. Ses articles restent, avec son prenom. */
const leaveHouseholdInput = z.object({});
const leaveHouseholdOutput = z.object({ left: z.literal(true) });

export const leaveHousehold: ApiContract<typeof leaveHouseholdInput, typeof leaveHouseholdOutput> = {
  route: "/api/household/leave",
  method: "POST",
  minRole: "member",
  successStatus: 200,
  input: leaveHouseholdInput,
  output: leaveHouseholdOutput,
  errors: [
    E.unauthenticated,
    { ...E.noHousehold, trigger: E.noHousehold.trigger + " ; c'est aussi la reponse a un rejeu apres un depart" },
    {
      status: 409,
      code: "OWNER_CANNOT_LEAVE",
      trigger: "l'appelant est la responsable du foyer (US-13.3, D-010)",
    },
  ],
  idempotency: "etat final idempotent : un rejeu donne 403 NO_HOUSEHOLD, sans autre effet.",
};
