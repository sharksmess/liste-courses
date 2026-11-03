/**
 * audit-001 MAJEUR-1 (D-040) — adresse du client pour le limiteur better-auth.
 *
 * Le limiteur est coupe dans le serveur de test (APP_ENV=test, AUTH_RATE_LIMIT=off) :
 * la preuve passe par la fonction de resolution de better-auth elle-meme
 * (`getIP` de `better-auth/api`, celle qu'appelle son limiteur), appliquee a la
 * configuration `advanced.ipAddress` que `lib/auth.ts` lui transmet.
 *
 * Ce que le test prouve : avec notre configuration, deux `X-Forwarded-For`
 * forges differents, et une requete sans en-tete, donnent la MEME cle de
 * client, donc le meme compteur. Controle : avec la configuration par defaut de
 * better-auth, les deux en-tetes forges donnent deux cles differentes (le test
 * distingue bien les deux comportements).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { IP_ADDRESS_OPTIONS, rateLimitClientKey } from "../../apps/web/src/lib/auth-ip";
import { ROOT } from "../_factory/env";

const forged = (value: string) => new Headers({ "x-forwarded-for": value });

describe("D-040 : un X-Forwarded-For forge n'ouvre pas de nouveau compteur", () => {
  it("controle : avec la configuration par defaut de better-auth, chaque X-Forwarded-For forge est un compteur distinct", () => {
    const a = rateLimitClientKey(forged("198.51.100.1"), null);
    const b = rateLimitClientKey(forged("198.51.100.2"), null);
    expect(a).toBe("198.51.100.1");
    expect(b).toBe("198.51.100.2");
  });

  it("avec notre configuration, deux X-Forwarded-For forges et l'absence d'en-tete donnent la meme cle", () => {
    const keys = new Set([
      rateLimitClientKey(forged("198.51.100.1")),
      rateLimitClientKey(forged("198.51.100.2")),
      rateLimitClientKey(forged("2001:db8::1")),
      rateLimitClientKey(forged("198.51.100.3, 203.0.113.9")),
      rateLimitClientKey(new Headers({ "x-real-ip": "198.51.100.4", "cf-connecting-ip": "198.51.100.5" })),
      rateLimitClientKey(new Headers()),
    ]);
    expect([...keys]).toHaveLength(1);
    expect([...keys][0]).not.toMatch(/^198\.51\.100\.|^2001:db8/);
  });

  it("aucun en-tete d'adresse n'est cru et aucun proxy n'est declare", () => {
    expect(IP_ADDRESS_OPTIONS).toEqual({ ipAddressHeaders: [] });
  });

  it("lib/auth.ts transmet bien cette configuration a better-auth", () => {
    const source = readFileSync(path.join(ROOT, "apps/web/src/lib/auth.ts"), "utf8");
    expect(source).toMatch(/ipAddress\s*:\s*IP_ADDRESS_OPTIONS\b/);
    expect(source).not.toMatch(/trustedProxies|ipAddressHeaders/);
  });
});
