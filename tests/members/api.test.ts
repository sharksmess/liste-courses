/**
 * AC1 a AC4 (tranche 004) : lister, retirer, quitter, refus et ordre de
 * verification, par l'API reelle. Lectures de verification par l'administration,
 * toujours filtrees par les identifiants crees par le test.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccount } from "../helpers/auth";
import { adminPool, closePools, resetDatabase } from "../helpers/db";
import { getMeAs, membershipsOfUser, postHousehold } from "../helpers/household";
import { describeResult, expectAppError, expectStatus } from "../helpers/http";
import { displayed, fillHome, home, joinedMember, memberCountOf, postJoin } from "../helpers/invite";
import { addItemInOwnTx, deleteItemAs, getItems, itemCountOf, itemRowById, itemRowsOf, patchItem, postItem, expectItem, expectList } from "../helpers/items";
import {
  deleteMemberAs,
  expectMembers,
  getMembers,
  membershipIdOf,
  membershipRowsOf,
  postLeave,
  unknownMemberId,
} from "../helpers/members";

beforeAll(resetDatabase);
afterAll(closePools);

describe("AC1 : voir les membres", () => {
  it("AC1 : un membre et la responsable recoivent la meme liste (memberId, name, role), responsable en owner, ordre d'entree", async () => {
    const h = await home("L1");
    const first = await joinedMember(h, "Premiere");
    const second = await joinedMember(h, "Seconde");
    const rows = await membershipRowsOf(h.householdId);
    expect(rows).toHaveLength(3);

    const asOwner = expectMembers(await getMembers(h.account.cookie), "GET members, responsable");
    const asMember = expectMembers(await getMembers(first.cookie), "GET members, membre");
    expect(asMember).toEqual(asOwner);
    expect(asOwner.map((m) => m.memberId)).toEqual(rows.map((r) => r.id));
    expect(asOwner.map((m) => m.role)).toEqual(["owner", "member", "member"]);
    expect(asOwner.map((m) => m.name)).toEqual([h.account.name, "Premiere", "Seconde"]);
    expect(asOwner[1]?.memberId).toBe(await membershipIdOf(first.userId));
    expect(asOwner[2]?.memberId).toBe(await membershipIdOf(second.userId));
  });

  it("AC1 : l'ordre est joined_at puis id, meme quand l'insertion physique le contredit (joined_at explicite, egalite departagee par id)", async () => {
    // Lignes amorcees par l'administration, dont l'ordre d'insertion est l'inverse de l'ordre attendu.
    // Ce que le test prouve : un tri sur l'ordre physique, ou sans departage de l'egalite, echoue.
    // Ce qu'il ne prouve pas : le departage par id contre un plan qui trierait deja par (joined_at, id).
    const h = await home("L4");
    const base = (await membershipRowsOf(h.householdId))[0];
    if (!base) throw new Error("[tests] la responsable n'a pas d'appartenance");
    const [smallId = "", largeId = ""] = [crypto.randomUUID(), crypto.randomUUID()].sort();
    const plan = [
      { label: "Tardif", id: crypto.randomUUID(), hours: 3 },
      { label: "EgalGrand", id: largeId, hours: 2 },
      { label: "EgalPetit", id: smallId, hours: 2 },
      { label: "Precoce", id: crypto.randomUUID(), hours: 1 },
    ];
    for (const p of plan) {
      const account = await createAccount({ name: p.label });
      await adminPool().query(
        "INSERT INTO lc.membership (id, household_id, user_id, role, display_name, joined_at) VALUES ($1, $2, $3, 'member', $4, $5::timestamptz + make_interval(hours => $6::int))",
        [p.id, h.householdId, account.userId, p.label, base.joined_at, p.hours],
      );
    }
    const listed = expectMembers(await getMembers(h.account.cookie), "GET members");
    expect(listed.map((m) => m.name)).toEqual([h.account.name, "Precoce", "EgalPetit", "EgalGrand", "Tardif"]);
  });

  it("AC1 : aucune adresse e-mail ni identifiant de compte dans la reponse", async () => {
    const h = await home("L2");
    const m = await joinedMember(h, "Discret");
    const r = await getMembers(h.account.cookie);
    expectMembers(r, "GET members");
    for (const secret of [h.account.email, m.email, h.account.userId, m.userId, "@example.test"]) {
      expect(r.text, describeResult("fuite", r)).not.toContain(secret);
    }
  });

  it("AC1 : la reponse porte Cache-Control: no-store", async () => {
    const h = await home("L3");
    const r = await getMembers(h.account.cookie);
    expectStatus(r, 200, "GET members");
    expect(r.headers.get("cache-control")).toContain("no-store");
  });
});

describe("AC2 : retirer un membre", () => {
  it("AC2 : la responsable recoit 200 { removed: true } ; l'appartenance disparait et member_count baisse de 1", async () => {
    const h = await home("R1");
    const m = await joinedMember(h, "Partante");
    await joinedMember(h, "Restante");
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 3, rows: 3 });
    const id = await membershipIdOf(m.userId);

    const r = await deleteMemberAs(id, h.account.cookie);
    expectStatus(r, 200, "DELETE membre");
    expect(r.body).toEqual({ removed: true });
    expect(await membershipsOfUser(m.userId)).toEqual([]);
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 2, rows: 2 });
  });

  it("AC2 : coupure immediate : la session encore ouverte du membre retire recoit 403 NO_HOUSEHOLD sur toutes les routes du foyer", async () => {
    const h = await home("R2");
    const m = await joinedMember(h, "Coupee");
    const item = expectItem(await postItem({ name: "AvantRetrait" }, h.account.cookie), 201, "article du responsable");
    expectStatus(await getItems(m.cookie), 200, "controle positif : le membre lit avant le retrait");
    expectStatus(await deleteMemberAs(await membershipIdOf(m.userId), h.account.cookie), 200, "retrait");

    expectAppError(await getItems(m.cookie), 403, "NO_HOUSEHOLD", "GET items");
    expectAppError(await postItem({ name: "Apres" }, m.cookie), 403, "NO_HOUSEHOLD", "POST items");
    expect((await itemRowsOf(h.householdId)).map((r) => r.name), "le POST refuse n'ecrit rien").toEqual(["AvantRetrait"]);
    expectAppError(await patchItem(item.id, { purchased: true }, m.cookie), 403, "NO_HOUSEHOLD", "PATCH items");
    expectAppError(await deleteItemAs(item.id, m.cookie), 403, "NO_HOUSEHOLD", "DELETE items");
    expectAppError(await getMembers(m.cookie), 403, "NO_HOUSEHOLD", "GET members");
    expectAppError(await postLeave(m.cookie), 403, "NO_HOUSEHOLD", "POST leave");
    const me = await getMeAs(m.cookie);
    expectStatus(me, 200, "GET /api/me");
    expect((me.body as { household: unknown }).household, describeResult("me", me)).toBeNull();
    expect((await itemRowById(item.id))?.purchased, "aucune ecriture ne passe").toBe(false);
  });

  it("AC2 : les articles de la personne retiree restent, avec son prenom, cochables et supprimables par les autres ; item_count inchange", async () => {
    const h = await home("R3");
    const m = await joinedMember(h, "Gourmande");
    const a = expectItem(await postItem({ name: "DeLaPartie1" }, m.cookie), 201, "article 1");
    const b = expectItem(await postItem({ name: "DeLaPartie2" }, m.cookie), 201, "article 2");
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 2, rows: 2 });

    expectStatus(await deleteMemberAs(await membershipIdOf(m.userId), h.account.cookie), 200, "retrait");

    expect(await itemCountOf(h.householdId)).toEqual({ counter: 2, rows: 2 });
    const list = expectList(await getItems(h.account.cookie), "GET items apres retrait");
    expect(list.map((i) => [i.id, i.addedBy.name])).toEqual([
      [a.id, "Gourmande"],
      [b.id, "Gourmande"],
    ]);
    expect(expectItem(await patchItem(a.id, { purchased: true }, h.account.cookie), 200, "coche").purchased).toBe(true);
    expectStatus(await deleteItemAs(b.id, h.account.cookie), 200, "suppression");
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 1, rows: 1 });
  });
});

describe("AC3 : quitter le foyer", () => {
  it("AC3 : un membre recoit 200 { left: true } ; l'appartenance disparait, member_count baisse de 1, sa session est coupee", async () => {
    const h = await home("Q1");
    const m = await joinedMember(h, "Sortante");
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 2, rows: 2 });

    const r = await postLeave(m.cookie);
    expectStatus(r, 200, "POST leave");
    expect(r.body).toEqual({ left: true });
    expect(await membershipsOfUser(m.userId)).toEqual([]);
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 1, rows: 1 });
    expectAppError(await getItems(m.cookie), 403, "NO_HOUSEHOLD", "GET items apres depart");
    expectAppError(await getMembers(m.cookie), 403, "NO_HOUSEHOLD", "GET members apres depart");
  });

  it("AC3 : ses articles restent avec son prenom ; item_count inchange", async () => {
    const h = await home("Q2");
    const m = await joinedMember(h, "Voyageuse");
    const item = expectItem(await postItem({ name: "Souvenir" }, m.cookie), 201, "article");
    expectStatus(await postLeave(m.cookie), 200, "depart");
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 1, rows: 1 });
    const list = expectList(await getItems(h.account.cookie), "GET items");
    expect(list.map((i) => [i.id, i.addedBy.name])).toEqual([[item.id, "Voyageuse"]]);
  });

  it("AC3 : un rejeu donne 403 NO_HOUSEHOLD, sans autre effet", async () => {
    const h = await home("Q3");
    const m = await joinedMember(h, "Rejeu");
    await joinedMember(h, "Autre");
    expectStatus(await postLeave(m.cookie), 200, "depart");
    expectAppError(await postLeave(m.cookie), 403, "NO_HOUSEHOLD", "rejeu");
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 2, rows: 2 });
  });
});

describe("AC4 : refus et ordre de verification", () => {
  it("AC4 : sans session, les trois routes donnent 401 UNAUTHENTICATED, y compris avec un memberId mal forme", async () => {
    expectAppError(await getMembers(undefined), 401, "UNAUTHENTICATED", "GET");
    expectAppError(await deleteMemberAs(unknownMemberId(), undefined), 401, "UNAUTHENTICATED", "DELETE");
    expectAppError(await deleteMemberAs("pas-un-uuid", undefined), 401, "UNAUTHENTICATED", "DELETE mal forme");
    expectAppError(await postLeave(undefined), 401, "UNAUTHENTICATED", "POST leave");
  });

  it("AC4 : un compte sans foyer recoit 403 NO_HOUSEHOLD sur les trois routes, y compris avec un memberId mal forme", async () => {
    const lonely = await createAccount({ name: "Seul" });
    expectAppError(await getMembers(lonely.cookie), 403, "NO_HOUSEHOLD", "GET");
    expectAppError(await deleteMemberAs(unknownMemberId(), lonely.cookie), 403, "NO_HOUSEHOLD", "DELETE");
    expectAppError(await deleteMemberAs("pas-un-uuid", lonely.cookie), 403, "NO_HOUSEHOLD", "DELETE mal forme");
    expectAppError(await postLeave(lonely.cookie), 403, "NO_HOUSEHOLD", "POST leave");
  });

  it("AC4 : un membre qui tente de retirer quelqu'un, la responsable comprise, recoit 403 INSUFFICIENT_ROLE, et la cible reste", async () => {
    const h = await home("V1");
    const m = await joinedMember(h, "Simple");
    const other = await joinedMember(h, "Autre");
    const ownerId = await membershipIdOf(h.account.userId);
    const otherId = await membershipIdOf(other.userId);
    expectAppError(await deleteMemberAs(ownerId, m.cookie), 403, "INSUFFICIENT_ROLE", "cible : la responsable");
    expectAppError(await deleteMemberAs(otherId, m.cookie), 403, "INSUFFICIENT_ROLE", "cible : un membre");
    expectAppError(await deleteMemberAs("pas-un-uuid", m.cookie), 403, "INSUFFICIENT_ROLE", "cible mal formee");
    expectAppError(await deleteMemberAs(unknownMemberId(), m.cookie), 403, "INSUFFICIENT_ROLE", "cible inexistante");
    expectAppError(await deleteMemberAs(await membershipIdOf(m.userId), m.cookie), 403, "INSUFFICIENT_ROLE", "sa propre ligne");
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 3, rows: 3 });
    expect(await membershipsOfUser(other.userId)).toHaveLength(1);
    expect(await membershipsOfUser(h.account.userId)).toHaveLength(1);
  });

  it("AC4 : la responsable qui vise sa propre ligne recoit 409 OWNER_CANNOT_BE_REMOVED, et reste", async () => {
    const h = await home("V2");
    expectAppError(await deleteMemberAs(await membershipIdOf(h.account.userId), h.account.cookie), 409, "OWNER_CANNOT_BE_REMOVED", "auto-retrait");
    expect(await membershipsOfUser(h.account.userId)).toHaveLength(1);
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 1, rows: 1 });
  });

  it("AC4 : la responsable qui tente de quitter recoit 409 OWNER_CANNOT_LEAVE, et reste", async () => {
    const h = await home("V3");
    expectAppError(await postLeave(h.account.cookie), 409, "OWNER_CANNOT_LEAVE", "depart de la responsable");
    expect(await membershipsOfUser(h.account.userId)).toHaveLength(1);
    expectStatus(await getItems(h.account.cookie), 200, "la responsable garde son acces");
  });

  it("AC4 : memberId mal forme, inexistant ou deja retire donne 404 MEMBER_NOT_FOUND, et un rejeu de retrait aussi", async () => {
    const h = await home("V4");
    const m = await joinedMember(h, "Une fois");
    const id = await membershipIdOf(m.userId);
    expectAppError(await deleteMemberAs("pas-un-uuid", h.account.cookie), 404, "MEMBER_NOT_FOUND", "mal forme");
    expectAppError(await deleteMemberAs(unknownMemberId(), h.account.cookie), 404, "MEMBER_NOT_FOUND", "inexistant");
    expectStatus(await deleteMemberAs(id, h.account.cookie), 200, "premier retrait");
    expectAppError(await deleteMemberAs(id, h.account.cookie), 404, "MEMBER_NOT_FOUND", "rejeu");
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 1, rows: 1 });
  });

  it("AC4 : apres une serie de refus (membre, auto-retrait, cible mal formee, inexistante, depart de la responsable), la liste et les compteurs sont inchanges", async () => {
    const h = await home("V5");
    const m = await joinedMember(h, "Simple");
    await joinedMember(h, "Autre");
    const ownerId = await membershipIdOf(h.account.userId);
    const before = expectMembers(await getMembers(h.account.cookie), "avant");
    expect(before).toHaveLength(3);
    expectAppError(await deleteMemberAs(before[2]?.memberId ?? "", m.cookie), 403, "INSUFFICIENT_ROLE", "membre");
    expectAppError(await deleteMemberAs(ownerId, h.account.cookie), 409, "OWNER_CANNOT_BE_REMOVED", "auto-retrait");
    expectAppError(await deleteMemberAs("pas-un-uuid", h.account.cookie), 404, "MEMBER_NOT_FOUND", "mal forme");
    expectAppError(await deleteMemberAs(unknownMemberId(), h.account.cookie), 404, "MEMBER_NOT_FOUND", "inexistant");
    expectAppError(await postLeave(h.account.cookie), 409, "OWNER_CANNOT_LEAVE", "depart de la responsable");
    expect(expectMembers(await getMembers(h.account.cookie), "apres")).toEqual(before);
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 3, rows: 3 });
  });
});

describe("AC6 : retour apres un depart (API)", () => {
  it("AC6 : une personne retiree peut creer un foyer", async () => {
    const h = await home("B1");
    const m = await joinedMember(h, "Rebond");
    expectStatus(await deleteMemberAs(await membershipIdOf(m.userId), h.account.cookie), 200, "retrait");
    expectStatus(await postHousehold(`Nouveau foyer ${m.userId}`.slice(0, 40), m.cookie), 201, "creation apres retrait");
    expect(await membershipsOfUser(m.userId)).toHaveLength(1);
  });

  it("AC6 : une personne retiree ou partie rejoint un autre foyer, ou le meme avec le code en vigueur, et retrouve la liste", async () => {
    const h = await home("B2");
    const other = await home("B3");
    expectItem(await postItem({ name: "ListeDeB2" }, h.account.cookie), 201, "article de B2");
    expectItem(await postItem({ name: "ListeDeB3" }, other.account.cookie), 201, "article de B3");
    const removed = await joinedMember(h, "Retiree");
    const left = await joinedMember(h, "Partie");
    expectStatus(await deleteMemberAs(await membershipIdOf(removed.userId), h.account.cookie), 200, "retrait");
    expectStatus(await postLeave(left.cookie), 200, "depart");

    expectStatus(await postJoin(displayed(other.code), removed.cookie), 200, "retiree rejoint un autre foyer");
    expect(expectList(await getItems(removed.cookie), "liste de l'autre foyer").map((i) => i.name)).toEqual(["ListeDeB3"]);
    expectStatus(await postJoin(displayed(h.code), left.cookie), 200, "partie revient dans le meme foyer");
    expect(expectList(await getItems(left.cookie), "liste du meme foyer").map((i) => i.name)).toEqual(["ListeDeB2"]);
  });

  it("AC6 : croisement inverse : la personne partie rejoint un autre foyer, la retiree revient dans le meme avec le code en vigueur, et chacune retrouve la liste", async () => {
    const h = await home("B6");
    const other = await home("B7");
    expectItem(await postItem({ name: "ListeDeB6" }, h.account.cookie), 201, "article de B6");
    expectItem(await postItem({ name: "ListeDeB7" }, other.account.cookie), 201, "article de B7");
    const removed = await joinedMember(h, "Retiree");
    const left = await joinedMember(h, "Partie");
    expectStatus(await deleteMemberAs(await membershipIdOf(removed.userId), h.account.cookie), 200, "retrait");
    expectStatus(await postLeave(left.cookie), 200, "depart");

    expectStatus(await postJoin(displayed(other.code), left.cookie), 200, "la partie rejoint un autre foyer");
    expect(expectList(await getItems(left.cookie), "liste de l'autre foyer").map((i) => i.name)).toEqual(["ListeDeB7"]);
    expectStatus(await postJoin(displayed(h.code), removed.cookie), 200, "la retiree revient dans le meme foyer");
    expect(expectList(await getItems(removed.cookie), "liste du meme foyer").map((i) => i.name)).toEqual(["ListeDeB6"]);
  });

  it("AC6 : US-06.2 : les articles d'une personne retiree et d'une personne partie sont rendus avec son prenom pour les restants", async () => {
    const h = await home("B4");
    const removed = await joinedMember(h, "Retiree");
    const left = await joinedMember(h, "Partie");
    const stay = await joinedMember(h, "Reste");
    const i1 = await addItemInOwnTx(removed.userId, "ParRetiree");
    const i2 = await addItemInOwnTx(left.userId, "ParPartie");
    expectStatus(await deleteMemberAs(await membershipIdOf(removed.userId), h.account.cookie), 200, "retrait");
    expectStatus(await postLeave(left.cookie), 200, "depart");
    for (const cookie of [h.account.cookie, stay.cookie]) {
      const list = expectList(await getItems(cookie), "GET items");
      expect(list.map((i) => [i.id, i.addedBy.name])).toEqual([
        [i1, "Retiree"],
        [i2, "Partie"],
      ]);
    }
  });

  it("AC6 : un foyer de 10 membres accepte un nouveau membre apres un depart", async () => {
    const h = await home("B5");
    const members = await fillHome(h, 10);
    const newcomer = await createAccount({ name: "Onzieme" });
    expectAppError(await postJoin(displayed(h.code), newcomer.cookie), 409, "HOUSEHOLD_FULL", "foyer plein");
    expectStatus(await postLeave((members[0] ?? h.account).cookie), 200, "depart");
    expectStatus(await postJoin(displayed(h.code), newcomer.cookie), 200, "adhesion apres depart");
    expect(await memberCountOf(h.householdId)).toEqual({ counter: 10, rows: 10 });
  });
});
