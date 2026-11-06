/**
 * AC10 (tranche 004) : perte du foyer pendant une action sur la liste (suites de
 * 003, D-025 Q-8, D-061).
 *
 * - Q-8 : un article ajoute avant ou pendant un retrait reste (ERD §5). La forme
 *   « pendant » est deterministe : une transaction `lc_app` tient son `add_item`
 *   non commite, le retrait attend, puis aboutit apres le COMMIT.
 * - `addItem` est appele au niveau du service (`apps/web/src/lib/items.ts`), sur
 *   la vraie base : le module lit son environnement par `getServerEnv`, que ce
 *   fichier renseigne depuis les variables de test AVANT l'import. Le secret
 *   d'authentification n'est pas utilise par ce chemin : valeur visiblement fausse.
 * - La branche « article enregistre puis illisible » n'est pas atteignable de
 *   facon deterministe depuis un test (la lecture suit l'ecriture dans la meme
 *   transaction, sans point d'interposition) : elle est declaree dans la fiche
 *   de preuves, pas contournee.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadTestEnv, requireEnv } from "../_factory/env";
import { closePools, pgCode, resetDatabase } from "../helpers/db";
import { membershipsOfUser } from "../helpers/household";
import { createAccount } from "../helpers/auth";
import { displayed, home, joinedMember, openAppTx, postJoin, settle, waitUntilBlockedOnLock, type AppTx } from "../helpers/invite";
import { addItemInOwnTx, itemCountOf, itemRowById, itemRowsOf } from "../helpers/items";
import { membershipIdOf, deleteMemberAs } from "../helpers/members";
import { expectStatus } from "../helpers/http";

loadTestEnv();

type ItemsModule = typeof import("../../apps/web/src/lib/items");
let items: ItemsModule;

beforeAll(async () => {
  await resetDatabase();
  const env = requireEnv(["TEST_DATABASE_URL_APP", "TEST_APP_BASE_URL"]);
  process.env.APP_ENV = "test";
  process.env.DATABASE_URL = env.TEST_DATABASE_URL_APP;
  process.env.AUTH_DATABASE_URL = env.TEST_DATABASE_URL_APP;
  process.env.BETTER_AUTH_SECRET = "faux-".repeat(8);
  process.env.BETTER_AUTH_URL = env.TEST_APP_BASE_URL;
  items = await import("../../apps/web/src/lib/items");
});
afterAll(closePools);

describe("AC10 : service addItem", () => {
  it("AC10 : controle positif : addItem d'un membre rend l'article, avec son prenom", async () => {
    const h = await home("Y1");
    const r = await items.addItem(h.account.userId, { name: "Service", quantity: null });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    if (r.ok) expect(r.value.addedBy.name).toBe(h.account.name);
  });

  it("AC10 : addItem pour un compte sans foyer rend NO_HOUSEHOLD (403), sans exception (branche LC009)", async () => {
    const lonely = await createAccount({ name: "Seul" });
    const r = await items.addItem(lonely.userId, { name: "Orphelin", quantity: null });
    expect(r).toEqual({ ok: false, error: { status: 403, code: "NO_HOUSEHOLD" } });
  });

  it("AC10 : addItem pour un compte retire du foyer rend NO_HOUSEHOLD, sans exception, et n'ajoute rien", async () => {
    const h = await home("Y2");
    const m = await joinedMember(h, "Retiree");
    expectStatus(await deleteMemberAs(await membershipIdOf(m.userId), h.account.cookie), 200, "retrait");
    const r = await items.addItem(m.userId, { name: "Apres", quantity: null });
    expect(r).toEqual({ ok: false, error: { status: 403, code: "NO_HOUSEHOLD" } });
    expect(await itemRowsOf(h.householdId)).toEqual([]);
  });
});

describe("AC10 : Q-8, un article ajoute avant ou pendant un retrait reste", () => {
  it("AC10 : un article ajoute avant le retrait reste ; item_count inchange ; une adhesion ulterieure laisse lc.item intact", async () => {
    const h = await home("Y3");
    const m = await joinedMember(h, "Avant");
    const id = await addItemInOwnTx(m.userId, "AjouteAvant");
    expectStatus(await deleteMemberAs(await membershipIdOf(m.userId), h.account.cookie), 200, "retrait");
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 1, rows: 1 });
    const before = await itemRowById(id);
    expectStatus(await postJoin(displayed(h.code), m.cookie), 200, "retour dans le foyer");
    expect(await itemRowById(id)).toEqual(before);
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 1, rows: 1 });
  });

  it("AC10 : un article ajoute (non commite) pendant un retrait reste : le retrait attend, puis aboutit apres le COMMIT", async () => {
    const h = await home("Y4");
    const m = await joinedMember(h, "Pendant");
    const memberId = await membershipIdOf(m.userId);
    let txM: AppTx | undefined;
    let txO: AppTx | undefined;
    try {
      txM = await openAppTx(m.userId);
      txO = await openAppTx(h.account.userId);
      const added = await txM.client.query<{ id: string }>("SELECT lc.add_item('AjouteePendant', NULL) AS id");
      const itemId = added.rows[0]?.id ?? "";

      const pending = settle(txO.client.query("SELECT lc.remove_member($1)", [memberId]));
      await waitUntilBlockedOnLock(txO.pid);
      const raced = await Promise.race([pending, new Promise<"toujours en attente">((r) => setTimeout(() => r("toujours en attente"), 150))]);
      expect(raced, "le retrait attend la transaction de l'ajout").toBe("toujours en attente");

      await txM.commit();
      const outcome = await pending;
      expect(outcome.status, outcome.status === "rejected" ? String(pgCode(outcome.reason)) : "").toBe("fulfilled");
      await txO.commit();

      expect(await membershipsOfUser(m.userId)).toEqual([]);
      expect((await itemRowById(itemId))?.author_name).toBe("Pendant");
      expect(await itemCountOf(h.householdId)).toEqual({ counter: 1, rows: 1 });
    } finally {
      await txM?.rollback();
      await txO?.rollback();
      txM?.release();
      txO?.release();
    }
  });
});
