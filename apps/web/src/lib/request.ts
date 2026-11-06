/** Lecture commune des requetes des Route Handlers (ADR-0006). */
import type { ZodError } from "zod";

/** Corps JSON de la requete ; absent ou illisible donne `undefined`, refuse par le schema. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return (await request.json()) as unknown;
  } catch {
    return undefined;
  }
}

/** Noms des champs en echec, sans doublon ; `(corps)` pour le corps entier. Jamais leur valeur. */
export function failedFields(error: ZodError): string[] {
  return [...new Set(error.issues.map((issue) => issue.path.join(".") || "(corps)"))];
}
