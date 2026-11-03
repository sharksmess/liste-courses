/**
 * AC5 — Isolation entre foyers, avec deux foyers reels A et B, chacun avec sa
 * responsable. Par l'API, puis directement en base SOUS LE ROLE APPLICATIF
 * `lc_app` (`asApp` verifie `current_user = lc_app`, sans superutilisateur ni
 * BYPASSRLS : un test d'isolation sous un role qui contourne la RLS passerait
 * toujours). Toutes les lectures sont filtrees par les identifiants de A et B.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccount } from "../helpers/auth";
import { asApp, attempt, closePools, describeAttempt, isBlocked, resetDatabase } from "../helpers/db";
import { accountWithHousehold, getMeAs, householdById, membershipsOfUser, inviteCodeOf, type Fixture } from "../helpers/household";
import { describeResult, expectStatus } from "../helpers/http";

let A: Fixture;
let B: Fixture;
let idA: string;
let idB: string;
let codeB: string;

beforeAll(async () => {
  await resetDatabase();
  A = await accountWithHousehold("A");
  B = await accountWithHousehold("B");
  idA = (await membershipsOfUser(A.account.userId))[0]?.household_id ?? "";
  idB = (await membershipsOfUser(B.account.userId))[0]?.household_id ?? "";
  codeB = (await inviteCodeOf(idB)) ?? "";
  if (!idA || !idB || idA === idB || !codeB) throw new Error("[tests] arrangement des foyers A et B incomplet");
});
afterAll(closePools);

describe("AC5 : isolation par l'API", () => {
  it("AC5 : GET /api/me de A ne contient rien de B (foyer, prenom, adresse, code)", async () => {
    const me = await getMeAs(A.account.cookie);
    expectStatus(me, 200, "GET /api/me de A");
    expect(me.body).toEqual({ user: { name: A.account.name }, household: { name: A.householdName, role: "owner" } });
    for (const secret of [B.householdName, B.account.name, B.account.email, B.account.userId, idB, codeB]) {
      expect(me.text, describeResult("GET /api/me de A mentionne une donnee de B", me)).not.toContain(secret);
    }
  });

  it("AC5 : GET /api/me de B ne contient rien de A", async () => {
    const me = await getMeAs(B.account.cookie);
    expectStatus(me, 200, "GET /api/me de B");
    expect(me.body).toEqual({ user: { name: B.account.name }, household: { name: B.householdName, role: "owner" } });
    for (const secret of [A.householdName, A.account.name, A.account.email, A.account.userId, idA]) {
      expect(me.text).not.toContain(secret);
    }
  });
});

describe("AC5 : isolation en base sous lc_app", () => {
  it("AC5 : avec app.user_id = responsable de A, household, membership et invite_code ne rendent aucune ligne de B", async () => {
    await asApp(A.account.userId, async (c) => {
      const hh = await c.query<{ id: string }>("SELECT id FROM lc.household WHERE id = ANY($1)", [[idA, idB]]);
      expect(hh.rows.map((r) => r.id)).toEqual([idA]);

      const ms = await c.query<{ household_id: string; user_id: string }>(
        "SELECT household_id, user_id FROM lc.membership WHERE household_id = ANY($1) OR user_id = ANY($2)",
        [[idA, idB], [A.account.userId, B.account.userId]],
      );
      expect(ms.rows).toHaveLength(1);
      expect(ms.rows[0]).toEqual({ household_id: idA, user_id: A.account.userId });

      const byId = await c.query("SELECT 1 FROM lc.household WHERE id = $1", [idB]);
      expect(byId.rowCount).toBe(0);
    });
  });

  it("AC5 : symetriquement, avec app.user_id = responsable de B, rien de A n'est visible", async () => {
    await asApp(B.account.userId, async (c) => {
      const hh = await c.query<{ id: string }>("SELECT id FROM lc.household WHERE id = ANY($1)", [[idA, idB]]);
      expect(hh.rows.map((r) => r.id)).toEqual([idB]);
      const ms = await c.query("SELECT 1 FROM lc.membership WHERE household_id = $1", [idA]);
      expect(ms.rowCount).toBe(0);
    });
  });

  it("AC5 : lc_app ne lit pas lc.invite_code (aucun droit), pas meme celui de son propre foyer", async () => {
    await asApp(A.account.userId, async (c) => {
      const own = await attempt(c, "SELECT code FROM lc.invite_code WHERE household_id = $1", [idA]);
      expect(own, describeAttempt("lecture du code de A", own)).toEqual({ ok: false, code: "42501" });
      const other = await attempt(c, "SELECT code FROM lc.invite_code WHERE household_id = $1", [idB]);
      expect(other, describeAttempt("lecture du code de B", other)).toEqual({ ok: false, code: "42501" });
    });
  });

  it("AC5 : toute ecriture de A visant B est refusee ou touche 0 ligne, et B est inchange", async () => {
    const before = await householdById(idB);
    const beforeMembers = await membershipsOfUser(B.account.userId);
    await asApp(A.account.userId, async (c) => {
      const writes: [string, string, unknown[]][] = [
        ["UPDATE household.name de B", "UPDATE lc.household SET name = 'pirate' WHERE id = $1", [idB]],
        ["UPDATE household.member_count de B", "UPDATE lc.household SET member_count = 0 WHERE id = $1", [idB]],
        ["DELETE household de B", "DELETE FROM lc.household WHERE id = $1", [idB]],
        ["UPDATE membership de B", "UPDATE lc.membership SET role = 'member' WHERE household_id = $1", [idB]],
        ["DELETE membership de B", "DELETE FROM lc.membership WHERE household_id = $1", [idB]],
        [
          "INSERT membership dans B",
          "INSERT INTO lc.membership (household_id, user_id, role, display_name) VALUES ($1, $2, 'member', 'intrus')",
          [idB, A.account.userId],
        ],
        ["INSERT household", "INSERT INTO lc.household (name) VALUES ('pirate')", []],
        ["UPDATE invite_code de B", "UPDATE lc.invite_code SET code = '0000000000' WHERE household_id = $1", [idB]],
        ["DELETE invite_code de B", "DELETE FROM lc.invite_code WHERE household_id = $1", [idB]],
      ];
      for (const [label, sql, params] of writes) {
        const outcome = await attempt(c, sql, params);
        expect(isBlocked(outcome), describeAttempt(label, outcome)).toBe(true);
      }
    });
    expect(await householdById(idB)).toEqual(before);
    expect(await membershipsOfUser(B.account.userId)).toEqual(beforeMembers);
    expect(await inviteCodeOf(idB)).toBe(codeB);
  });

  it("AC5 : sans app.user_id, aucune ligne n'est visible", async () => {
    await asApp(undefined, async (c) => {
      expect((await c.query("SELECT 1 FROM lc.household WHERE id = ANY($1)", [[idA, idB]])).rowCount).toBe(0);
      expect((await c.query("SELECT 1 FROM lc.membership WHERE household_id = ANY($1)", [[idA, idB]])).rowCount).toBe(0);
      const ctx = await c.query<{ h: string | null; u: string | null }>("SELECT lc.current_household_id() AS h, lc.current_user_id() AS u");
      expect(ctx.rows[0]).toEqual({ h: null, u: null });
    });
  });

  it("AC5 : avec app.user_id vide, aucune ligne n'est visible", async () => {
    await asApp("", async (c) => {
      expect((await c.query("SELECT 1 FROM lc.household WHERE id = ANY($1)", [[idA, idB]])).rowCount).toBe(0);
      expect((await c.query("SELECT 1 FROM lc.membership WHERE household_id = ANY($1)", [[idA, idB]])).rowCount).toBe(0);
    });
  });

  it("AC5 : avec un utilisateur sans foyer, aucune ligne n'est visible", async () => {
    const lonely = await createAccount();
    await asApp(lonely.userId, async (c) => {
      expect((await c.query("SELECT 1 FROM lc.household WHERE id = ANY($1)", [[idA, idB]])).rowCount).toBe(0);
      expect((await c.query("SELECT 1 FROM lc.membership WHERE household_id = ANY($1)", [[idA, idB]])).rowCount).toBe(0);
      const ctx = await c.query<{ h: string | null }>("SELECT lc.current_household_id() AS h");
      expect(ctx.rows[0]?.h).toBeNull();
    });
  });

  it("AC5 : un app.household_id etranger pose par l'appelant n'ouvre aucune ligne", async () => {
    await asApp(A.account.userId, async (c) => {
      await c.query("SELECT set_config('app.household_id', $1, true)", [idB]);
      expect((await c.query("SELECT 1 FROM lc.household WHERE id = $1", [idB])).rowCount).toBe(0);
      expect((await c.query("SELECT 1 FROM lc.membership WHERE household_id = $1", [idB])).rowCount).toBe(0);
    });
  });

  it("AC5 : une valeur d'app.user_id qui n'est pas un UUID fait lever (22P02), jamais une ligne", async () => {
    await asApp("pas-un-uuid", async (c) => {
      await expect(c.query("SELECT 1 FROM lc.household WHERE id = ANY($1)", [[idA, idB]])).rejects.toMatchObject({ code: "22P02" });
    });
  });
});

describe("AC5 : lc_app n'a aucun droit sur lc_auth ni sur lc.invite_code", () => {
  it("AC5 : privileges du catalogue", async () => {
    await asApp(A.account.userId, async (c) => {
      const r = await c.query<{ k: string; v: boolean }>(
        `SELECT 'schema lc_auth USAGE' AS k, has_schema_privilege('lc_app', 'lc_auth', 'USAGE') AS v
         UNION ALL SELECT 'schema lc_auth CREATE', has_schema_privilege('lc_app', 'lc_auth', 'CREATE')
         UNION ALL SELECT 'table invite_code ' || p, has_table_privilege('lc_app', 'lc.invite_code', p)
           FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p
         UNION ALL SELECT 'table ' || c.relname || ' ' || p, has_table_privilege('lc_app', c.oid, p)
           FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace,
                unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) AS p
          WHERE n.nspname = 'lc_auth' AND c.relname = ANY(ARRAY['app_user','session','account','verification'])`,
      );
      // Tables de lc_auth designees par leur oid (pg_class est lisible sans USAGE) :
      // un nom qualifie 'lc_auth.x' ne se resout pas sous lc_app, faute d'USAGE sur
      // le schema (D-031). Les quatre tables doivent etre toutes sondees.
      const authProbes = r.rows.filter((x) => /^table (app_user|session|account|verification) /.test(x.k));
      expect(authProbes, "les quatre tables de lc_auth x cinq privileges").toHaveLength(20);
      const granted = r.rows.filter((x) => x.v).map((x) => x.k);
      expect(granted, "droits accordes a lc_app qui ne devraient pas l'etre").toEqual([]);
    });
  });

  it.each(["lc_auth.app_user", "lc_auth.session", "lc_auth.account", "lc_auth.verification", "lc.invite_code"])(
    "AC5 : SELECT sur %s sous lc_app est refuse (42501)",
    async (table) => {
      await asApp(A.account.userId, async (c) => {
        const outcome = await attempt(c, `SELECT 1 FROM ${table} LIMIT 1`);
        expect(outcome, describeAttempt(`SELECT sur ${table}`, outcome)).toEqual({ ok: false, code: "42501" });
      });
    },
  );

  it("AC5 : lc_app n'a aucun droit d'ecriture direct sur household et membership (toute creation passe par une fonction)", async () => {
    await asApp(A.account.userId, async (c) => {
      await expect(c.query("INSERT INTO lc.household (name) VALUES ('direct')")).rejects.toMatchObject({ code: "42501" });
    });
  });
});
