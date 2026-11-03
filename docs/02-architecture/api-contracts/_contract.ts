import { z } from "zod";

/**
 * Forme commune a tout contrat de route (ADR-0006). Un contrat est importe tel
 * quel par le Route Handler qui l'implemente ET par les tests d'acceptation de
 * la tranche : une seule source de verite pour « a quoi ressemble cette route ».
 *
 * `errors` liste tous les statuts non-2xx avec leur declencheur EXACT, dans
 * l'ordre de verification de l'ADR-0003 (session, foyer, role, ressource,
 * validation metier). contract-guardian compare cette liste a chaque tranche.
 */
export interface ApiContract<Input extends z.ZodTypeAny, Output extends z.ZodTypeAny> {
  route: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /**
   * Condition minimale d'acces, verifiee dans l'ordre de l'ADR-0003 :
   * - "public" : aucune session ;
   * - "authenticated" : session exigee, foyer indifferent ;
   * - "no-household" : session exigee ET aucun foyer (creer, rejoindre) ;
   * - "member" : session et appartenance a un foyer, quel que soit le role ;
   * - "owner" : responsable du foyer de session.
   * Le foyer n'est jamais un parametre de la requete (ADR-0002).
   */
  minRole: "public" | "authenticated" | "no-household" | "member" | "owner";
  /** Statut de succes : 200 par defaut, 201 pour une creation. */
  successStatus: 200 | 201;
  input: Input;
  output: Output;
  errors: Array<{
    status: 401 | 403 | 404 | 409 | 422 | 429;
    code: string;
    trigger: string;
  }>;
  /**
   * Rejouabilite sans effet de bord supplementaire, et cle le cas echeant.
   * « non-idempotente » doit etre justifie.
   */
  idempotency: string;
}

/** Corps de toute reponse d'erreur applicative (ADR-0006). Jamais de message technique. */
export const ErrorBody = z.object({
  error: z.object({
    code: z.string(),
    /** Champs en cause, uniquement pour VALIDATION_FAILED ; jamais leur valeur. */
    fields: z.array(z.string()).optional(),
  }),
});

export const HouseholdRole = z.enum(["owner", "member"]);

/** Identifiants : UUIDv7 (rules/drizzle-postgres.md). */
export const Uuid = z.string().uuid();

/** Longueur en points de code, comme `char_length` en base (ERD Q-2) ; `s.length` compterait des unites UTF-16. */
export const codePointLength = (s: string) => [...s].length;

/**
 * Texte borne apres retrait des espaces de bord (convention du PRD, US-01 a
 * US-07). La borne porte sur la valeur trimee, et c'est elle qui est enregistree.
 */
export const trimmedText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .refine((s) => codePointLength(s) >= min && codePointLength(s) <= max);

/** Erreurs communes, reprises par les contrats pour que leur declencheur reste identique partout. */
export const E = {
  unauthenticated: {
    status: 401,
    code: "UNAUTHENTICATED",
    trigger: "aucune session better-auth valide (absente, expiree ou fermee par la deconnexion)",
  },
  noHousehold: {
    status: 403,
    code: "NO_HOUSEHOLD",
    trigger: "utilisateur de session sans foyer (jamais rejoint, parti, ou retire) — US-04.2",
  },
  insufficientRole: {
    status: 403,
    code: "INSUFFICIENT_ROLE",
    trigger: "utilisateur de session membre du foyer mais pas responsable",
  },
  alreadyInHousehold: {
    status: 409,
    code: "ALREADY_IN_HOUSEHOLD",
    trigger: "utilisateur de session deja membre d'un foyer (un seul foyer par utilisateur, D-008)",
  },
  validation: (detail: string) => ({
    status: 422 as const,
    code: "VALIDATION_FAILED",
    trigger: detail,
  }),
} as const;
