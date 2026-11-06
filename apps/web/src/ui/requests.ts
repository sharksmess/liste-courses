/**
 * Appels des formulaires vers les Route Handlers (ADR-0006 : mutations par
 * `fetch` depuis des composants client). Lit le code d'erreur sans jamais
 * afficher de detail technique.
 */
export interface PostOutcome {
  ok: boolean;
  status: number;
  code: string | null;
}

function codeOf(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  if ("code" in body && typeof body.code === "string") return body.code;
  if ("error" in body && typeof body.error === "object" && body.error !== null && "code" in body.error) {
    const { code } = body.error;
    return typeof code === "string" ? code : null;
  }
  return null;
}

/** Valeur texte d'un champ de formulaire ; un fichier ou une absence donne "". */
export function formText(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

export function postJson(path: string, payload: unknown): Promise<PostOutcome> {
  return sendJson("POST", path, payload);
}

/** Appel generique : sans `payload`, aucun corps n'est envoye (DELETE). */
export async function sendJson(method: "POST" | "PATCH" | "DELETE", path: string, payload?: unknown): Promise<PostOutcome> {
  try {
    const response = await fetch(path, {
      method,
      ...(payload === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
      credentials: "same-origin",
    });
    const text = await response.text();
    let body: unknown = null;
    if (text.length > 0) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = null;
      }
    }
    return { ok: response.ok, status: response.status, code: codeOf(body) };
  } catch {
    return { ok: false, status: 0, code: "NETWORK" };
  }
}
