/**
 * AC8 (tranche 004) : ecran des membres, prouve sur le HTML rendu par le
 * serveur de test (D-053, D-059 : pas de robot de navigateur). Les messages et
 * la decision apres une action sont verifies en tests purs.
 *
 * Marqueurs imposes : voir l'en-tete de tests/helpers/members.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { itemMutationEffect, memberMutationEffect, messageFor } from "../../apps/web/src/ui/messages";
import { closePools, resetDatabase } from "../helpers/db";
import { describePage, getPage, type Page } from "../helpers/household";
import { expectStatus } from "../helpers/http";
import { home, joinedMember } from "../helpers/invite";
import { expectItem, postItem } from "../helpers/items";
import { deleteMemberAs, membershipIdOf, postLeave } from "../helpers/members";

beforeAll(resetDatabase);
afterAll(closePools);

function plain(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

interface Row {
  tag: string;
  html: string;
  text: string;
  role: string | undefined;
  buttons: string[];
}

function listBlock(html: string): string | undefined {
  return /<ul\b[^>]*data-testid="member-list"[^>]*>([\s\S]*?)<\/ul>/i.exec(html)?.[1];
}

function rows(html: string): Row[] {
  const out: Row[] = [];
  const re = /<li\b([^>]*data-testid="member-row"[^>]*)>([\s\S]*?)<\/li>/gi;
  for (let m = re.exec(html); m !== null; m = re.exec(html)) {
    const tag = m[1] ?? "";
    const inner = m[2] ?? "";
    out.push({
      tag,
      html: inner,
      text: stripTags(inner),
      role: /data-role="(owner|member)"/.exec(tag)?.[1],
      buttons: [...inner.matchAll(/<button\b[\s\S]*?<\/button>/gi)].map((b) => plain(stripTags(b[0]))),
    });
  }
  return out;
}

function itemRows(html: string): { text: string }[] {
  const out: { text: string }[] = [];
  const re = /<li\b[^>]*data-testid="item-row"[^>]*>([\s\S]*?)<\/li>/gi;
  for (let m = re.exec(html); m !== null; m = re.exec(html)) out.push({ text: stripTags(m[1] ?? "") });
  return out;
}

function pageButtons(html: string): string[] {
  return [...html.matchAll(/<button\b[\s\S]*?<\/button>/gi)].map((b) => plain(stripTags(b[0])));
}

async function household(cookie: string, label: string): Promise<Page> {
  const page = await getPage("/household", cookie);
  expect(page.status, describePage(label, page)).toBe(200);
  expect(page.finalPath, describePage(label, page)).toBe("/household");
  return page;
}

describe("AC8 : la liste des membres", () => {
  it("AC8 : <ul data-testid=\"member-list\"> avec un <li data-testid=\"member-row\"> par membre, data-role, prenom, responsable designee en toutes lettres", async () => {
    const h = await home("S1");
    await joinedMember(h, "Voisine");
    await joinedMember(h, "Cousin");
    const page = await household(h.account.cookie, "GET /household");
    expect(listBlock(page.html), describePage("ul data-testid=member-list absent", page)).toBeDefined();
    const r = rows(page.html);
    expect(r, describePage("trois lignes attendues", page)).toHaveLength(3);
    expect(r.map((x) => x.role)).toEqual(["owner", "member", "member"]);
    expect(r[0]?.text).toContain(h.account.name);
    expect(plain(r[0]?.text ?? ""), "la responsable est designee en toutes lettres").toContain("responsable");
    expect(r[1]?.text).toContain("Voisine");
    expect(r[2]?.text).toContain("Cousin");
    for (const row of r.slice(1)) expect(plain(row.text), "un membre n'est pas designe responsable").not.toContain("responsable");
  });

  it("AC8 : la page de la responsable montre « Retirer » sur chaque ligne de membre, aucun sur la sienne, ni « Quitter le foyer »", async () => {
    const h = await home("S2");
    await joinedMember(h, "Un");
    await joinedMember(h, "Deux");
    const page = await household(h.account.cookie, "GET /household de la responsable");
    const r = rows(page.html);
    expect(r).toHaveLength(3);
    expect(r[0]?.role).toBe("owner");
    expect(r[0]?.buttons, describePage("la responsable n'a pas de bouton sur sa ligne", page)).not.toContain("retirer");
    expect(r[1]?.buttons, describePage("bouton Retirer du membre 1", page)).toContain("retirer");
    expect(r[2]?.buttons, describePage("bouton Retirer du membre 2", page)).toContain("retirer");
    expect(pageButtons(page.html).filter((b) => b === "retirer")).toHaveLength(2);
    expect(page.text, describePage("la responsable ne quitte pas", page)).not.toContain("quitter le foyer");
  });

  it("AC8 : la page d'un membre montre « Quitter le foyer » et aucun bouton « Retirer »", async () => {
    const h = await home("S3");
    const m = await joinedMember(h, "Simple");
    const page = await household(m.cookie, "GET /household du membre");
    expect(pageButtons(page.html), describePage("bouton Quitter le foyer", page)).toContain("quitter le foyer");
    expect(pageButtons(page.html), describePage("aucun Retirer", page)).not.toContain("retirer");
    expect(rows(page.html)).toHaveLength(2);
  });

  it("AC8 : aucune adresse e-mail dans le HTML, charge utile serialisee comprise ; un prenom contenant du HTML est rendu comme du texte", async () => {
    const h = await home("S4");
    const nasty = "<i>Gras</i>&\"x";
    const m = await joinedMember(h, nasty);
    for (const cookie of [h.account.cookie, m.cookie]) {
      const page = await household(cookie, "GET /household");
      for (const secret of [h.account.email, m.email, "@example.test", h.account.userId, m.userId]) {
        expect(page.html, describePage(`fuite de ${secret.slice(0, 3)}...`, page)).not.toContain(secret);
      }
      expect(page.html, describePage("balise injectee", page)).not.toContain("<i>Gras</i>");
      expect(rows(page.html).map((x) => x.text).join(" | "), describePage("le prenom doit rester visible comme texte", page)).toContain(nasty);
    }
  });

  it("AC8 : la page d'un foyer ne contient aucun membre d'un autre foyer", async () => {
    const a = await home("S5");
    const b = await home("S6");
    await joinedMember(a, "SeulementChezA");
    await joinedMember(b, "SeulementChezB");
    const pageA = await household(a.account.cookie, "page de A");
    const pageB = await household(b.account.cookie, "page de B");
    expect(pageA.html).toContain("SeulementChezA");
    expect(pageA.html, describePage("membre de B sur la page de A", pageA)).not.toContain("SeulementChezB");
    expect(pageB.html).toContain("SeulementChezB");
    expect(pageB.html, describePage("membre de A sur la page de B", pageB)).not.toContain("SeulementChezA");
    expect(rows(pageA.html)).toHaveLength(2);
    expect(rows(pageB.html)).toHaveLength(2);
  });

  it("AC8 : apres un retrait ou un depart par l'API, la page ne montre plus la personne, et chaque article reste dans sa ligne avec le prenom exact de son auteur (responsable et membre restant)", async () => {
    // Prenoms et noms d'articles sans aucune sous-chaine commune : un prenom absent ne peut pas etre masque par le nom de l'article.
    const h = await home("S7");
    const removed = await joinedMember(h, "Zelda");
    const left = await joinedMember(h, "Ursule");
    const stay = await joinedMember(h, "Baptiste");
    expectItem(await postItem({ name: "Pommes" }, removed.cookie), 201, "article de la retiree");
    expectItem(await postItem({ name: "Farine" }, left.cookie), 201, "article de la partie");
    expect(rows((await household(h.account.cookie, "avant")).html)).toHaveLength(4);

    expectStatus(await deleteMemberAs(await membershipIdOf(removed.userId), h.account.cookie), 200, "retrait");
    const afterRemoval = await household(h.account.cookie, "apres retrait");
    expect(rows(afterRemoval.html).map((x) => x.text).join(" | "), describePage("la retiree ne figure plus dans les membres", afterRemoval)).not.toContain("Zelda");
    expect(rows(afterRemoval.html)).toHaveLength(3);

    expectStatus(await postLeave(left.cookie), 200, "depart");
    for (const [label, cookie] of [
      ["responsable", h.account.cookie],
      ["membre restant", stay.cookie],
    ] as const) {
      const page = await household(cookie, `apres depart, page de la ${label}`);
      const members = rows(page.html).map((x) => x.text).join(" | ");
      expect(members, describePage("les personnes parties ne figurent plus dans les membres", page)).not.toMatch(/Zelda|Ursule/);
      expect(rows(page.html), describePage("membres restants", page)).toHaveLength(2);
      const items = itemRows(page.html);
      expect(items.map((x) => x.text.includes("Pommes") ? "Pommes" : x.text.includes("Farine") ? "Farine" : "?").sort(), describePage("articles conserves", page)).toEqual(["Farine", "Pommes"]);
      const apples = items.find((x) => x.text.includes("Pommes"));
      const flour = items.find((x) => x.text.includes("Farine"));
      expect(apples?.text, describePage(`prenom de la retiree dans la ligne de son article (${label})`, page)).toContain("Zelda");
      expect(apples?.text).not.toContain("Ursule");
      expect(flour?.text, describePage(`prenom de la partie dans la ligne de son article (${label})`, page)).toContain("Ursule");
      expect(flour?.text).not.toContain("Zelda");
    }
  });

  it("AC8 : la session d'un membre retire est menee de /household a /no-household", async () => {
    const h = await home("S8");
    const m = await joinedMember(h, "Expulsee");
    expectStatus(await deleteMemberAs(await membershipIdOf(m.userId), h.account.cookie), 200, "retrait");
    const page = await getPage("/household", m.cookie);
    expect(page.finalPath, describePage("redirection apres retrait", page)).toBe("/no-household");
  });

  it("AC8 : la session d'un membre parti est menee de /household a /no-household", async () => {
    const h = await home("S9");
    const m = await joinedMember(h, "Partante");
    expectStatus(await postLeave(m.cookie), 200, "depart");
    const page = await getPage("/household", m.cookie);
    expect(page.finalPath, describePage("redirection apres depart", page)).toBe("/no-household");
  });
});

describe("AC8 : messages", () => {
  const generic = messageFor(0, null);

  it.each([
    [409, "OWNER_CANNOT_BE_REMOVED"],
    [409, "OWNER_CANNOT_LEAVE"],
    [404, "MEMBER_NOT_FOUND"],
    [403, "NO_HOUSEHOLD"],
  ] as [number, string][])("AC8 : le message de %s %s existe et differe du message generique", (status, code) => {
    const message = messageFor(status, code);
    expect(message).not.toBe(generic);
    expect(message.trim().length).toBeGreaterThan(0);
  });

  it("AC8 : les quatre messages different entre eux", () => {
    const all = [
      messageFor(409, "OWNER_CANNOT_BE_REMOVED"),
      messageFor(409, "OWNER_CANNOT_LEAVE"),
      messageFor(404, "MEMBER_NOT_FOUND"),
      messageFor(403, "NO_HOUSEHOLD"),
    ];
    expect(new Set(all).size).toBe(4);
  });
});

describe("AC8 : decision apres une action sur les membres (fonction pure memberMutationEffect)", () => {
  it("AC8 : un succes recharge la page, sans message", () => {
    expect(memberMutationEffect({ ok: true, status: 200, code: null })).toEqual({ refresh: true, message: null });
  });

  it.each([
    [404, "MEMBER_NOT_FOUND"],
    [403, "NO_HOUSEHOLD"],
    [403, "INSUFFICIENT_ROLE"],
  ] as [number, string][])("AC8 : %s %s recharge la page et affiche son message", (status, code) => {
    expect(memberMutationEffect({ ok: false, status, code })).toEqual({ refresh: true, message: messageFor(status, code) });
  });

  it.each([
    [409, "OWNER_CANNOT_BE_REMOVED"],
    [409, "OWNER_CANNOT_LEAVE"],
    [401, "UNAUTHENTICATED"],
    [429, null],
    [500, null],
    [0, "NETWORK"],
  ] as [number, string | null][])("AC8 : l'erreur %s %s ne recharge pas et affiche le message de messageFor", (status, code) => {
    expect(memberMutationEffect({ ok: false, status, code })).toEqual({ refresh: false, message: messageFor(status, code) });
  });
});

describe("AC10 : decision apres une action sur la liste (fonction pure itemMutationEffect)", () => {
  it("AC10 : NO_HOUSEHOLD recharge la page et rend son message", () => {
    expect(itemMutationEffect({ ok: false, status: 403, code: "NO_HOUSEHOLD" })).toEqual({
      refresh: true,
      message: messageFor(403, "NO_HOUSEHOLD"),
    });
  });
});
