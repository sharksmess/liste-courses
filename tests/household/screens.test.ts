/**
 * AC8 — Page « sans foyer » (US-04), et pages d'inscription / connexion / foyer,
 * prouvees par lecture du HTML rendu par le serveur (D-027 : pas de robot de
 * navigateur). Chemins supposes : voir tests/helpers/household.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccount, uniqueTag } from "../helpers/auth";
import { closePools, resetDatabase } from "../helpers/db";
import { describePage, getPage, postHousehold } from "../helpers/household";
import { expectStatus } from "../helpers/http";

beforeAll(resetDatabase);
afterAll(closePools);

describe("AC8 : pages d'authentification", () => {
  it.each(["/sign-up", "/sign-in"])("AC8 : la page %s se rend avec un formulaire adresse et mot de passe", async (route) => {
    const page = await getPage(route);
    expect(page.status, describePage(`GET ${route}`, page)).toBe(200);
    expect(page.finalPath, describePage(`GET ${route}`, page)).toBe(route);
    expect(page.html, describePage(`GET ${route}`, page)).toMatch(/<form[\s>]/i);
    expect(page.html, describePage(`GET ${route}`, page)).toMatch(/type="email"/i);
    expect(page.html, describePage(`GET ${route}`, page)).toMatch(/type="password"/i);
  });
});

describe("AC8 : page « sans foyer » (US-04)", () => {
  it("AC8 : un compte connecte sans foyer voit « creer un foyer » et « rejoindre avec un code »", async () => {
    const account = await createAccount();
    const page = await getPage("/no-household", account.cookie);
    const label = "GET /no-household, compte sans foyer";
    expect(page.status, describePage(label, page)).toBe(200);
    expect(page.finalPath, describePage(label, page)).toBe("/no-household");
    expect(page.text, describePage(label, page)).toContain("creer un foyer");
    expect(page.text, describePage(label, page)).toContain("rejoindre avec un code");
    expect(page.html, describePage(`${label} : formulaire de creation`, page)).toMatch(/<form[\s>]/i);
  });

  it("AC8 : le bloc « rejoindre avec un code » est desactive et annonce qu'il arrive bientot", async () => {
    const account = await createAccount();
    const page = await getPage("/no-household", account.cookie);
    const label = "GET /no-household, bloc rejoindre";
    expect(page.html, describePage(label, page)).toMatch(/<(?:button|input|fieldset)\b[^>]*\sdisabled/i);
    expect(page.text, describePage(label, page)).toContain("bientot");
  });

  it("AC8 : un compte sans foyer qui visite /household ou / est amene sur la page « sans foyer »", async () => {
    const account = await createAccount();
    for (const route of ["/household", "/"]) {
      const page = await getPage(route, account.cookie);
      const label = `GET ${route}, compte sans foyer`;
      expect(page.finalPath, describePage(label, page)).toBe("/no-household");
      expect(page.text, describePage(label, page)).toContain("rejoindre avec un code");
    }
  });

  it("AC8 : une fois le foyer cree, le compte voit la page du foyer et non plus la page « sans foyer »", async () => {
    const account = await createAccount();
    const name = `Famille Ecran ${uniqueTag("e")}`;
    expect((await getPage("/no-household", account.cookie)).finalPath).toBe("/no-household");
    expectStatus(await postHousehold(name, account.cookie), 201, "creation du foyer");

    for (const route of ["/", "/household", "/no-household"]) {
      const page = await getPage(route, account.cookie);
      const label = `GET ${route}, compte avec foyer`;
      expect(page.status, describePage(label, page)).toBe(200);
      expect(page.finalPath, describePage(label, page)).toBe("/household");
      expect(page.html, describePage(label, page)).toContain(name);
      expect(page.text, describePage(label, page)).not.toContain("rejoindre avec un code");
    }
  });

  it("AC8 : la page du foyer propose la deconnexion", async () => {
    const account = await createAccount();
    expectStatus(await postHousehold(`Famille Sortie ${uniqueTag("s")}`, account.cookie), 201, "creation du foyer");
    const page = await getPage("/household", account.cookie);
    expect(page.text, describePage("GET /household, deconnexion", page)).toMatch(/deconnect/);
  });
});
