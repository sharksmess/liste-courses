import { z } from "zod";
import { trimmedText, Uuid } from "./_contract";

/**
 * US-01, US-02 — Routes de better-auth (ADR-0003), montees sous /api/auth.
 *
 * Ce ne sont pas des Route Handlers a nous : ces contrats decrivent ce que nos
 * tests EXIGENT de la configuration better-auth. Deux differences avec les
 * contrats applicatifs (ApiContract) :
 *  - le corps d'erreur est celui de better-auth, `{ code, message }`, et non
 *    `{ error: { code } }` (ADR-0006) ;
 *  - les codes d'erreur sont ceux de better-auth. La tranche 001 les verifie sur
 *    la version installee ; un ecart se corrige ici, avec une ligne au registre.
 * La regle de validation du prenom (`name`) est a nous : hook de la tranche 001.
 */
export interface AuthRouteContract<Input extends z.ZodTypeAny, Output extends z.ZodTypeAny> {
  route: string;
  method: "GET" | "POST";
  input: Input;
  output: Output;
  errors: Array<{ status: 400 | 401 | 422 | 429; code: string; trigger: string }>;
  idempotency: string;
}

export const BetterAuthErrorBody = z.object({ code: z.string(), message: z.string() });

const rateLimited = {
  status: 429 as const,
  code: "RATE_LIMITED",
  trigger:
    "limiteur better-auth depasse (actif sauf APP_ENV=test, ADR-0003) ; le corps exact de better-auth est fixe par la tranche 001",
};

const sessionUser = z.object({
  id: Uuid,
  email: z.string().email(),
  /** Prenom d'affichage (D-009), enregistre trime. */
  name: z.string().min(1).max(30),
});

const sessionOutput = z.object({ user: sessionUser });

/** US-01 — Inscription. Ouvre une session (cookie) ; aucun e-mail envoye (US-01.7). */
const signUpInput = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: trimmedText(1, 30),
});

export const signUp: AuthRouteContract<typeof signUpInput, typeof sessionOutput> = {
  route: "/api/auth/sign-up/email",
  method: "POST",
  input: signUpInput,
  output: sessionOutput,
  errors: [
    {
      status: 400,
      code: "VALIDATION_ERROR",
      trigger:
        "adresse mal formee (US-01.6) : refusee par le schema de corps de better-auth 1.7.14 avant sa propre verification (code constate en tranche 001, D-030 ; INVALID_EMAIL n'est pas atteint)",
    },
    { status: 400, code: "PASSWORD_TOO_SHORT", trigger: "mot de passe < 8 caracteres (US-01.2)" },
    { status: 400, code: "PASSWORD_TOO_LONG", trigger: "mot de passe > 128 caracteres (US-01.2)" },
    {
      status: 422,
      code: "VALIDATION_FAILED",
      trigger: "prenom vide ou fait d'espaces, ou > 30 caracteres apres trim (US-01.3) — hook applicatif",
    },
    {
      status: 422,
      code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
      trigger:
        "adresse deja utilisee par un compte, quelle que soit la casse (US-01.5, D-013, Q-3) ; aucun second compte cree (code de better-auth 1.7.14 constate en tranche 001, D-030)",
    },
    rateLimited,
  ],
  idempotency:
    "non-idempotente : le premier appel cree le compte, un rejeu identique est refuse (USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL) sans effet de bord.",
};

/** US-02.1 — Connexion. */
const signInInput = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const signIn: AuthRouteContract<typeof signInInput, typeof sessionOutput> = {
  route: "/api/auth/sign-in/email",
  method: "POST",
  input: signInInput,
  output: sessionOutput,
  errors: [
    {
      status: 401,
      code: "INVALID_EMAIL_OR_PASSWORD",
      trigger: "adresse inconnue OU mot de passe faux : meme code et meme message (US-02.2)",
    },
    rateLimited,
  ],
  idempotency: "rejouable : chaque appel reussi ouvre une nouvelle session, sans autre effet.",
};

/** US-02.4 — Deconnexion : la session est fermee, toute requete suivante avec elle donne 401. */
const signOutInput = z.object({});
const signOutOutput = z.object({ success: z.literal(true) });

export const signOut: AuthRouteContract<typeof signOutInput, typeof signOutOutput> = {
  route: "/api/auth/sign-out",
  method: "POST",
  input: signOutInput,
  output: signOutOutput,
  errors: [rateLimited],
  idempotency: "idempotente : fermer une session deja fermee ne change rien.",
};
