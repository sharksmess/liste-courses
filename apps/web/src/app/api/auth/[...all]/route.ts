/**
 * Montage de better-auth sous /api/auth (contrat `auth.ts`). Instance creee au
 * premier appel (`getAuth`), jamais au chargement du module.
 */
import { getAuth } from "@/lib/auth";

export function GET(request: Request): Promise<Response> {
  return getAuth().handler(request);
}

export function POST(request: Request): Promise<Response> {
  return getAuth().handler(request);
}
