/**
 * AC4 — Limiteur (US-02.3, ADR-0003), test PUR de la fonction de configuration.
 *
 * CONTRAT POUR L'IMPLEMENTEUR (module importe par ce test) :
 *   chemin    : apps/web/src/lib/auth-rate-limit.ts
 *   export    : function buildRateLimitOptions(
 *                 env: Readonly<Record<string, string | undefined>>
 *               ): {
 *                 enabled: boolean;
 *                 customRules: Record<string, { window: number; max: number }>;
 *               }
 *   lit       : env.AUTH_RATE_LIMIT ("on" par defaut | "off") et env.APP_ENV
 *               ("production" par defaut | "development" | "test").
 *   regles    : actif par defaut ; la regle d'inscription "/sign-up/*" est
 *               ecrite chez nous : { window: 10, max: 3 } (patron ADR-0010 de
 *               Signet) ; "off" n'est accepte qu'avec APP_ENV=test ; toute
 *               autre combinaison avec "off", et toute valeur invalide (y
 *               compris vide), LEVE (le serveur refuse de demarrer).
 *   Aucune lecture de process.env dans la fonction : tout passe par `env`.
 */
import { describe, expect, it } from "vitest";
import { buildRateLimitOptions } from "../../apps/web/src/lib/auth-rate-limit";

describe("AC4 : limiteur de connexions (US-02.3)", () => {
  it("AC4 : par defaut (aucune variable), le limiteur est actif avec la regle d'inscription ecrite chez nous", () => {
    const options = buildRateLimitOptions({});
    expect(options.enabled).toBe(true);
    expect(options.customRules["/sign-up/*"]).toEqual({ window: 10, max: 3 });
  });

  it("AC4 : AUTH_RATE_LIMIT=on explicite en production reste actif", () => {
    const options = buildRateLimitOptions({ AUTH_RATE_LIMIT: "on", APP_ENV: "production" });
    expect(options.enabled).toBe(true);
    expect(options.customRules["/sign-up/*"]).toEqual({ window: 10, max: 3 });
  });

  it("AC4 : off avec APP_ENV=test desactive le limiteur", () => {
    expect(buildRateLimitOptions({ AUTH_RATE_LIMIT: "off", APP_ENV: "test" }).enabled).toBe(false);
  });

  it("AC4 : off avec APP_ENV=production leve au demarrage", () => {
    expect(() => buildRateLimitOptions({ AUTH_RATE_LIMIT: "off", APP_ENV: "production" })).toThrow(/AUTH_RATE_LIMIT/);
  });

  it("AC4 : off avec APP_ENV=development leve au demarrage", () => {
    expect(() => buildRateLimitOptions({ AUTH_RATE_LIMIT: "off", APP_ENV: "development" })).toThrow(/AUTH_RATE_LIMIT/);
  });

  it("AC4 : off sans APP_ENV (production par defaut) leve au demarrage", () => {
    expect(() => buildRateLimitOptions({ AUTH_RATE_LIMIT: "off" })).toThrow(/AUTH_RATE_LIMIT/);
  });

  it.each([
    ["AUTH_RATE_LIMIT inconnue", { AUTH_RATE_LIMIT: "false", APP_ENV: "test" }],
    ["AUTH_RATE_LIMIT vide", { AUTH_RATE_LIMIT: "", APP_ENV: "test" }],
    ["AUTH_RATE_LIMIT en majuscules", { AUTH_RATE_LIMIT: "OFF", APP_ENV: "test" }],
    ["APP_ENV inconnu avec off", { AUTH_RATE_LIMIT: "off", APP_ENV: "staging" }],
    ["APP_ENV inconnu avec on", { AUTH_RATE_LIMIT: "on", APP_ENV: "staging" }],
    ["APP_ENV vide", { AUTH_RATE_LIMIT: "off", APP_ENV: "" }],
  ])("AC4 : valeur invalide (%s) leve au demarrage, le limiteur ne s'ouvre jamais", (_label, env) => {
    expect(() => buildRateLimitOptions(env)).toThrow(/AUTH_RATE_LIMIT|APP_ENV/);
  });
});
