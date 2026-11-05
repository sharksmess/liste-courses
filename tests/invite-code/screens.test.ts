/**
 * AC7 (ecran « rejoindre ») et AC8 (ecran du code), prouves sur le HTML rendu
 * par le serveur de test (D-053 : pas de robot de navigateur). Les messages
 * d'erreur sont verifies en test pur sur `messageFor`.
 *
 * Marqueurs imposes a l'implementeur : voir l'en-tete de tests/helpers/invite.ts
 *   data-testid="join-household-form", name="code",
 *   data-testid="invite-code", data-testid="regenerate-invite-code".
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { messageFor } from "../../apps/web/src/ui/messages";
import { createAccount } from "../helpers/auth";
import { closePools, resetDatabase } from "../helpers/db";
import { describePage, getPage } from "../helpers/household";
import { expectStatus } from "../helpers/http";
import { displayed, home, joinedMember, postJoin, postRegenerate } from "../helpers/invite";

beforeAll(resetDatabase);
afterAll(closePools);

function joinForm(html: string): string | undefined {
  const m = /<form\b[^>]*data-testid="join-household-form"[^>]*>[\s\S]*?<\/form>/i.exec(html);
  return m?.[0];
}

function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

describe("AC7 : ecran « rejoindre » (page rendue)", () => {
  it("AC7 : /no-household montre un formulaire actif avec un champ nomme code, sans element disabled", async () => {
    const account = await createAccount();
    const page = await getPage("/no-household", account.cookie);
    const label = "GET /no-household";
    expect(page.status, describePage(label, page)).toBe(200);
    const form = joinForm(page.html);
    expect(form, describePage(`${label} : formulaire data-testid="join-household-form" absent`, page)).toBeDefined();
    expect(form, describePage(`${label} : champ name="code" absent du formulaire`, page)).toMatch(/<input\b[^>]*\bname="code"/i);
    expect(form ?? "", describePage(`${label} : element disabled dans le bloc rejoindre`, page)).not.toMatch(/\bdisabled\b/i);
  });

  it("AC7 : la mention « bientot » a disparu de /no-household", async () => {
    const account = await createAccount();
    const page = await getPage("/no-household", account.cookie);
    expect(page.text, describePage("GET /no-household", page)).not.toContain("bientot");
    expect(page.text, describePage("GET /no-household", page)).toContain("rejoindre avec un code");
  });

  it("AC7 : le formulaire « creer un foyer » reste present, distinct du formulaire « rejoindre »", async () => {
    const account = await createAccount();
    const page = await getPage("/no-household", account.cookie);
    const label = "GET /no-household";
    expect(page.text, describePage(label, page)).toContain("creer un foyer");
    expect(page.html.match(/<form[\s>]/gi)?.length ?? 0, describePage(`${label} : deux formulaires attendus`, page)).toBeGreaterThanOrEqual(2);
    const withoutJoin = page.html.replace(joinForm(page.html) ?? "", "");
    expect(withoutJoin, describePage(`${label} : formulaire de creation`, page)).toMatch(/<form[\s>]/i);
  });

  it("AC7 : une fois le foyer rejoint, /no-household et / amenent sur /household", async () => {
    const h = await home("S1");
    const joiner = await createAccount();
    expectStatus(await postJoin(displayed(h.code), joiner.cookie), 200, "adhesion");
    for (const route of ["/no-household", "/", "/household"]) {
      const page = await getPage(route, joiner.cookie);
      const label = `GET ${route}, apres adhesion`;
      expect(page.status, describePage(label, page)).toBe(200);
      expect(page.finalPath, describePage(label, page)).toBe("/household");
      expect(page.html, describePage(label, page)).toContain(h.householdName);
    }
  });

  it("AC7 : le message de INVITE_CODE_INVALID existe, differe du message generique et ne cite aucun foyer ni ne parle de foyer complet", () => {
    const generic = messageFor(404, null);
    const invalid = messageFor(404, "INVITE_CODE_INVALID");
    expect(invalid).not.toBe(generic);
    expect(invalid.trim().length).toBeGreaterThan(0);
    expect(plain(invalid)).not.toContain("complet");
    expect(invalid).not.toBe(messageFor(409, "HOUSEHOLD_FULL"));
  });

  it("AC7 : le message de HOUSEHOLD_FULL existe, differe du message generique et dit explicitement que le foyer est complet", () => {
    const generic = messageFor(409, null);
    const full = messageFor(409, "HOUSEHOLD_FULL");
    expect(full).not.toBe(generic);
    expect(plain(full)).toContain("complet");
  });

  it("AC7 : les messages de validation et de refus d'adhesion deja connus restent distincts du generique", () => {
    expect(messageFor(409, "ALREADY_IN_HOUSEHOLD")).not.toBe(messageFor(409, null));
    expect(messageFor(422, "VALIDATION_FAILED")).not.toBe(messageFor(422, null));
  });
});

describe("AC8 : ecran du code (page rendue)", () => {
  it("AC8 : /household de la responsable affiche le code au format XXXXX-XXXXX et un bouton de regeneration", async () => {
    const h = await home("K1");
    const page = await getPage("/household", h.account.cookie);
    const label = "GET /household de la responsable";
    expect(page.status, describePage(label, page)).toBe(200);
    expect(page.finalPath, describePage(label, page)).toBe("/household");
    const m = /data-testid="invite-code"[^>]*>\s*([^<\s]+)\s*</i.exec(page.html);
    expect(m, describePage(`${label} : element data-testid="invite-code" absent`, page)).not.toBeNull();
    expect(m?.[1]).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
    expect(m?.[1]).toBe(displayed(h.code));
    expect(page.html, describePage(`${label} : bouton de regeneration absent`, page)).toMatch(
      /<button\b[^>]*data-testid="regenerate-invite-code"|data-testid="regenerate-invite-code"[^>]*>/i,
    );
  });

  it("AC8 : /household d'un membre ne contient le code nulle part dans son HTML, charge utile serialisee comprise, ni le bouton", async () => {
    const h = await home("K2");
    const member = await joinedMember(h, "Simple");
    const page = await getPage("/household", member.cookie);
    const label = "GET /household du membre";
    expect(page.status, describePage(label, page)).toBe(200);
    expect(page.finalPath, describePage(label, page)).toBe("/household");
    // Controle positif : on lit bien la page du foyer.
    expect(page.html, describePage(label, page)).toContain(h.householdName);
    const lower = page.html.toLowerCase();
    expect(page.html, `${label} : code stocke present dans le HTML brut`).not.toContain(h.code);
    expect(page.html, `${label} : code affiche present dans le HTML brut`).not.toContain(displayed(h.code));
    expect(lower, `${label} : code stocke (minuscules) present dans le HTML brut`).not.toContain(h.code.toLowerCase());
    expect(page.html, describePage(label, page)).not.toContain('data-testid="invite-code"');
    expect(page.html, describePage(label, page)).not.toContain('data-testid="regenerate-invite-code"');
  });

  it("AC8 : le HTML d'un membre ne contient pas non plus le nouveau code apres une regeneration", async () => {
    const h = await home("K3");
    const member = await joinedMember(h, "Simple");
    const r = await postRegenerate(h.account.cookie);
    expectStatus(r, 200, "regeneration");
    const fresh = (r.body as { code: string }).code;
    const page = await getPage("/household", member.cookie);
    expect(page.html, `GET /household du membre : nouveau code present`).not.toContain(fresh);
    expect(page.html, `GET /household du membre : nouveau code present`).not.toContain(fresh.replace("-", ""));
  });

  it("AC8 : apres POST invite-code, la page de la responsable affiche le nouveau code et plus l'ancien", async () => {
    const h = await home("K4");
    const before = await getPage("/household", h.account.cookie);
    expect(before.html, describePage("GET /household avant", before)).toContain(displayed(h.code));

    const r = await postRegenerate(h.account.cookie);
    expectStatus(r, 200, "regeneration");
    const fresh = (r.body as { code: string }).code;
    expect(fresh).not.toBe(displayed(h.code));

    const after = await getPage("/household", h.account.cookie);
    expect(after.html, describePage("GET /household apres", after)).toContain(fresh);
    expect(after.html, describePage("GET /household apres", after)).not.toContain(displayed(h.code));
    expect(after.html, describePage("GET /household apres", after)).not.toContain(h.code);
  });
});
