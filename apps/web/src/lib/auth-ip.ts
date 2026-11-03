/**
 * Source de l'adresse IP du limiteur better-auth (audit-001 MAJEUR-1, D-040).
 *
 * Sous `next start` sans proxy, Next ne pose `X-Forwarded-For` (adresse du
 * socket) que si le client ne l'a pas deja envoye (`??=` dans base-server) : un
 * route handler ne peut pas distinguer l'adresse reelle d'une valeur forgee, et
 * Next n'expose pas le socket. Aucun en-tete n'est donc cru tant qu'aucun proxy
 * de confiance n'est declare : un `X-Forwarded-For` forge n'ouvre jamais de
 * nouveau compteur. Contrepartie acceptee (option a de D-040, decidee d'avance
 * par l'humain, pas de mise en ligne D-011) : toutes les requetes partagent le
 * compteur de chaque chemin (`no-trusted-ip|<chemin>` en production). Avant
 * toute mise en ligne, declarer le proxy reel (`trustedProxies`, backlog).
 */
import { getIP } from "better-auth/api";

/** `advanced.ipAddress` de better-auth : aucun en-tete d'adresse n'est cru. */
export const IP_ADDRESS_OPTIONS: { ipAddressHeaders: string[] } = { ipAddressHeaders: [] };

/** Cle de client utilisee par better-auth pour le limiteur ; `null` = configuration par defaut de better-auth. */
export function rateLimitClientKey(
  headers: Headers,
  ipAddress: { ipAddressHeaders?: string[]; trustedProxies?: string[] } | null = IP_ADDRESS_OPTIONS,
): string {
  return getIP(headers, ipAddress ? { advanced: { ipAddress } } : {}) ?? "no-trusted-ip";
}
