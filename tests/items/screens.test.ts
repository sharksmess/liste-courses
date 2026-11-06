/**
 * AC9 (tranche 003) : ecran de la liste, prouve sur le HTML rendu par le
 * serveur de test (D-053, D-059 : pas de robot de navigateur). Les messages
 * sont verifies en test pur sur `messageFor`.
 *
 * Marqueurs imposes : voir l'en-tete de tests/helpers/items.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { messageFor } from "../../apps/web/src/ui/messages";
import { closePools, resetDatabase } from "../helpers/db";
import { describePage, getPage, type Page } from "../helpers/household";
import { expectStatus } from "../helpers/http";
import { home, joinedMember } from "../helpers/invite";
import { deleteItemAs, expectItem, patchItem, postItem } from "../helpers/items";

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

function listBlock(html: string): string | undefined {
  return /<ul\b[^>]*data-testid="item-list"[^>]*>([\s\S]*?)<\/ul>/i.exec(html)?.[1];
}

interface Row {
  tag: string;
  html: string;
  text: string;
  purchased: string | undefined;
}

function rows(html: string): Row[] {
  const out: Row[] = [];
  const re = /<li\b([^>]*data-testid="item-row"[^>]*)>([\s\S]*?)<\/li>/gi;
  for (let m = re.exec(html); m !== null; m = re.exec(html)) {
    const tag = m[1] ?? "";
    out.push({ tag, html: m[2] ?? "", text: stripTags(m[2] ?? ""), purchased: /data-purchased="(true|false)"/.exec(tag)?.[1] });
  }
  return out;
}

async function household(cookie: string, label: string): Promise<Page> {
  const page = await getPage("/household", cookie);
  expect(page.status, describePage(label, page)).toBe(200);
  expect(page.finalPath, describePage(label, page)).toBe("/household");
  return page;
}

describe("AC9 : liste vide", () => {
  it("AC9 : un foyer sans article montre <ul data-testid=\"item-list\"> sans <li, et la mention « La liste est vide. »", async () => {
    const h = await home("E1");
    const page = await household(h.account.cookie, "GET /household vide");
    const block = listBlock(page.html);
    expect(block, describePage("ul data-testid=item-list absent", page)).toBeDefined();
    expect(block ?? "", describePage("la liste vide ne doit contenir aucun <li", page)).not.toMatch(/<li\b/i);
    expect(page.text, describePage("mention de liste vide", page)).toContain("la liste est vide.");
  });
});

describe("AC9 : liste avec articles", () => {
  it("AC9 : un <li data-testid=\"item-row\"> par article, dans l'ordre d'ajout, avec data-purchased, nom, quantite et prenom de l'auteur", async () => {
    const h = await home("E2");
    const member = await joinedMember(h, "Voisine");
    const first = expectItem(await postItem({ name: "Pommes", quantity: "6" }, h.account.cookie), 201, "ajout 1");
    expectItem(await postItem({ name: "Pain" }, member.cookie), 201, "ajout 2");
    expectItem(await postItem({ name: "Thon", quantity: "3 boites" }, h.account.cookie), 201, "ajout 3");
    expectItem(await patchItem(first.id, { purchased: true }, member.cookie), 200, "coche du premier");

    const page = await household(h.account.cookie, "GET /household");
    const r = rows(page.html);
    expect(r, describePage("trois lignes attendues", page)).toHaveLength(3);
    expect(r.map((x) => x.purchased)).toEqual(["true", "false", "false"]);
    expect(r[0]?.text).toContain("Pommes");
    expect(r[0]?.text).toContain("6");
    expect(r[0]?.text).toContain(h.account.name);
    expect(r[1]?.text).toContain("Pain");
    expect(r[1]?.text).toContain("Voisine");
    expect(r[2]?.text).toContain("Thon");
    expect(r[2]?.text).toContain("3 boites");
    expect(r[2]?.text).toContain(h.account.name);
    expect(page.html.indexOf("Pommes")).toBeLessThan(page.html.indexOf("Pain"));
    expect(page.html.indexOf("Pain")).toBeLessThan(page.html.indexOf("Thon"));
    expect(page.text, describePage("la mention de liste vide ne doit plus figurer", page)).not.toContain("la liste est vide");
  });

  it("AC9 : chaque ligne a une case a cocher, cochee si l'article est achete, et un bouton « Supprimer »", async () => {
    const h = await home("E3");
    const a = expectItem(await postItem({ name: "Achete" }, h.account.cookie), 201, "ajout a");
    expectItem(await postItem({ name: "Attendu" }, h.account.cookie), 201, "ajout b");
    expectItem(await patchItem(a.id, { purchased: true }, h.account.cookie), 200, "coche");

    const page = await household(h.account.cookie, "GET /household");
    const r = rows(page.html);
    expect(r).toHaveLength(2);
    for (const row of r) {
      expect(row.html, describePage("case a cocher", page)).toMatch(/<input\b[^>]*type="checkbox"/i);
      expect(row.html, describePage("bouton Supprimer", page)).toMatch(/<button\b[\s\S]*?<\/button>/i);
      const buttons = [...row.html.matchAll(/<button\b[\s\S]*?<\/button>/gi)].map((m) => plain(stripTags(m[0])));
      expect(buttons, describePage("bouton nomme Supprimer", page)).toContain("supprimer");
    }
    const checkbox = (row: Row): string => /<input\b[^>]*type="checkbox"[^>]*>/i.exec(row.html)?.[0] ?? "";
    expect(checkbox(r[0] as Row), describePage("case de l'article achete", page)).toMatch(/\bchecked\b/i);
    expect(checkbox(r[1] as Row), describePage("case de l'article non achete", page)).not.toMatch(/\bchecked\b/i);
  });
});

describe("AC9 : formulaire d'ajout", () => {
  it("AC9 : /household montre le formulaire add-item-form avec un champ name obligatoire et un champ quantity facultatif, pour la responsable", async () => {
    const h = await home("F1");
    const page = await household(h.account.cookie, "GET /household de la responsable");
    expectForm(page);
  });

  it("AC9 : le meme formulaire est present pour un membre", async () => {
    const h = await home("F2");
    const member = await joinedMember(h, "Simple");
    expectForm(await household(member.cookie, "GET /household du membre"));
  });

  function expectForm(page: Page): void {
    const form = /<form\b[^>]*data-testid="add-item-form"[^>]*>([\s\S]*?)<\/form>/i.exec(page.html)?.[1];
    expect(form, describePage("formulaire data-testid=add-item-form absent", page)).toBeDefined();
    const inputs = [...(form ?? "").matchAll(/<(?:input|textarea)\b[^>]*>/gi)].map((m) => m[0]);
    const named = (n: string): string | undefined => inputs.find((i) => new RegExp(`\\bname="${n}"`, "i").test(i));
    const name = named("name");
    const quantity = named("quantity");
    expect(name, describePage("champ name absent", page)).toBeDefined();
    expect(quantity, describePage("champ quantity absent", page)).toBeDefined();
    expect(name ?? "", describePage("name doit etre required", page)).toMatch(/\brequired\b/i);
    expect(quantity ?? "", describePage("quantity ne doit pas etre required", page)).not.toMatch(/\brequired\b/i);
    expect(form ?? "", describePage("bouton d'envoi absent", page)).toMatch(/<button\b/i);
  }
});

describe("AC9 : la page reflete l'API", () => {
  it("AC9 : apres POST, PATCH puis DELETE par l'API, la page rendue reflete le nouvel etat", async () => {
    const h = await home("R1");
    const added = expectItem(await postItem({ name: "Reflet", quantity: "2" }, h.account.cookie), 201, "POST");

    let page = await household(h.account.cookie, "apres POST");
    expect(rows(page.html).map((x) => x.purchased)).toEqual(["false"]);
    expect(rows(page.html)[0]?.text).toContain("Reflet");

    expectItem(await patchItem(added.id, { purchased: true }, h.account.cookie), 200, "PATCH");
    page = await household(h.account.cookie, "apres PATCH");
    expect(rows(page.html).map((x) => x.purchased)).toEqual(["true"]);

    expectItem(await patchItem(added.id, { purchased: false }, h.account.cookie), 200, "PATCH retour");
    page = await household(h.account.cookie, "apres PATCH retour");
    expect(rows(page.html).map((x) => x.purchased)).toEqual(["false"]);

    expectStatus(await deleteItemAs(added.id, h.account.cookie), 200, "DELETE");
    page = await household(h.account.cookie, "apres DELETE");
    expect(rows(page.html)).toEqual([]);
    expect(page.text).toContain("la liste est vide.");
  });

  it("AC9 : un changement d'un autre membre apparait au rechargement de la page", async () => {
    const h = await home("R2");
    const member = await joinedMember(h, "Autre");
    expect(rows((await household(h.account.cookie, "avant")).html)).toHaveLength(0);
    expectItem(await postItem({ name: "Du membre" }, member.cookie), 201, "POST membre");
    const page = await household(h.account.cookie, "apres");
    expect(rows(page.html)).toHaveLength(1);
    expect(rows(page.html)[0]?.text).toContain("Autre");
  });
});

describe("AC9 : echappement et isolation", () => {
  it("AC9 : un nom contenant du HTML est affiche comme du texte : aucune balise n'est injectee", async () => {
    const h = await home("X1");
    const nasty = "<b>gras</b><img src=x onerror=alert(1)><script>window.pwned=1</script>";
    expectItem(await postItem({ name: nasty.slice(0, 100), quantity: "<i>q</i>" }, h.account.cookie), 201, "POST");
    const page = await household(h.account.cookie, "GET /household");
    expect(page.html, describePage("balise <b> injectee", page)).not.toContain("<b>gras</b>");
    expect(page.html, describePage("balise <img> injectee", page)).not.toMatch(/<img\b[^>]*onerror/i);
    expect(page.html, describePage("balise <script> injectee", page)).not.toContain("<script>window.pwned=1</script>");
    expect(page.html, describePage("quantite injectee", page)).not.toContain("<i>q</i>");
    const r = rows(page.html);
    expect(r).toHaveLength(1);
    expect(r[0]?.text, describePage("le texte doit rester visible", page)).toContain("<b>gras</b>");
    expect(r[0]?.text).toContain("<i>q</i>");
  });

  it("AC9 : la page d'un foyer ne contient aucun article d'un autre foyer", async () => {
    const a = await home("X2");
    const b = await home("X3");
    expectItem(await postItem({ name: "SeulementChezA", quantity: "QteA" }, a.account.cookie), 201, "POST A");
    expectItem(await postItem({ name: "SeulementChezB", quantity: "QteB" }, b.account.cookie), 201, "POST B");
    const pageA = await household(a.account.cookie, "page de A");
    const pageB = await household(b.account.cookie, "page de B");
    expect(pageA.html).toContain("SeulementChezA");
    expect(pageA.html, describePage("article de B sur la page de A", pageA)).not.toMatch(/SeulementChezB|QteB/);
    expect(pageB.html).toContain("SeulementChezB");
    expect(pageB.html, describePage("article de A sur la page de B", pageB)).not.toMatch(/SeulementChezA|QteA/);
    expect(rows(pageA.html)).toHaveLength(1);
    expect(rows(pageB.html)).toHaveLength(1);
  });
});

describe("AC9 : messages", () => {
  it("AC9 : le message de ITEM_LIMIT_REACHED existe, differe du message generique et dit explicitement que la liste est pleine, sans le nombre 200", () => {
    const generic = messageFor(409, null);
    const full = messageFor(409, "ITEM_LIMIT_REACHED");
    expect(full).not.toBe(generic);
    expect(plain(full)).toContain("pleine");
    expect(full).not.toContain("200");
    expect(full).not.toBe(messageFor(409, "HOUSEHOLD_FULL"));
  });

  it("AC9 : le message de ITEM_NOT_FOUND existe et differe du message generique", () => {
    const generic = messageFor(404, null);
    const missing = messageFor(404, "ITEM_NOT_FOUND");
    expect(missing).not.toBe(generic);
    expect(missing.trim().length).toBeGreaterThan(0);
    expect(missing).not.toBe(messageFor(404, "INVITE_CODE_INVALID"));
  });
});
