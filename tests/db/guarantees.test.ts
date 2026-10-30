/**
 * AC9 — Garanties de la base (ADR-0005, rules/drizzle-postgres.md).
 *
 * « Le test de catalogue de l'usine est vert » : c'est le fichier
 * tests/_factory/db-catalog.test.ts, execute dans la meme suite ; il n'est pas
 * reproduit ici.
 *
 * Connexion d'administration : arrangement, lecture de verification, et le seul
 * `SET ROLE lc_owner` / role BYPASSRLS temporaire que ces garanties exigent.
 * Les appels de fonction sous le role applicatif passent par `asApp`.
 */
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccount, uniqueTag } from "../helpers/auth";
import { adminPool, asApp, closePools, resetDatabase } from "../helpers/db";
import { accountWithHousehold, membershipsOfUser, type Fixture } from "../helpers/household";

let A: Fixture;
let idA: string;
let membershipA: string;
let verificationMarker: string;

beforeAll(async () => {
  await resetDatabase();
  A = await accountWithHousehold("G");
  const m = (await membershipsOfUser(A.account.userId))[0];
  idA = m?.household_id ?? "";
  membershipA = m?.id ?? "";
  if (!idA || !membershipA) throw new Error("[tests] arrangement du foyer incomplet");
  verificationMarker = uniqueTag("verif");
  await adminPool().query(
    "INSERT INTO lc_auth.verification (identifier, value, expires_at) VALUES ($1, 'v', now() + interval '1 hour')",
    [verificationMarker],
  );
});
afterAll(closePools);

describe("AC9 : FORCE ROW LEVEL SECURITY s'applique au proprietaire", () => {
  const probes: { table: string; where: string; param: () => unknown }[] = [
    { table: "lc.household", where: "id = $1", param: () => idA },
    { table: "lc.membership", where: "household_id = $1", param: () => idA },
    { table: "lc.invite_code", where: "household_id = $1", param: () => idA },
    { table: "lc_auth.app_user", where: "id = $1", param: () => A.account.userId },
    { table: "lc_auth.session", where: "user_id = $1", param: () => A.account.userId },
    { table: "lc_auth.account", where: "user_id = $1", param: () => A.account.userId },
    { table: "lc_auth.verification", where: "identifier = $1", param: () => verificationMarker },
  ];

  it.each(probes.map((p) => p.table))("AC9 : sous SET ROLE lc_owner, %s ne rend aucune ligne sans contexte", async (table) => {
    const probe = probes.find((p) => p.table === table);
    if (!probe) throw new Error(`sonde inconnue ${table}`);
    const sql = `SELECT 1 FROM ${probe.table} WHERE ${probe.where}`;

    // Controle positif : la ligne existe bel et bien (sinon le zero ne prouverait rien).
    const seen = await adminPool().query(sql, [probe.param()]);
    expect(seen.rowCount, `la ligne de test de ${table} doit exister pour l'administration`).toBeGreaterThan(0);

    const client = await adminPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE lc_owner");
      const who = await client.query<{ u: string }>("SELECT current_user AS u");
      expect(who.rows[0]?.u).toBe("lc_owner");
      const asOwner = await client.query(sql, [probe.param()]);
      expect(asOwner.rowCount, `lc_owner voit des lignes de ${table} sans contexte : FORCE ROW LEVEL SECURITY absent`).toBe(0);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });
});

describe("AC9 : lc.create_household", () => {
  it("AC9 : appelee sans app.user_id, elle leve LC001", async () => {
    await asApp(undefined, async (c) => {
      await expect(c.query("SELECT lc.create_household('Sans contexte')")).rejects.toMatchObject({ code: "LC001" });
    });
  });

  it("AC9 : appelee avec app.user_id vide, elle leve LC001", async () => {
    await asApp("", async (c) => {
      await expect(c.query("SELECT lc.create_household('Contexte vide')")).rejects.toMatchObject({ code: "LC001" });
    });
  });

  it("AC9 : appelee par un compte qui a deja un foyer, elle leve LC002", async () => {
    await asApp(A.account.userId, async (c) => {
      await expect(c.query("SELECT lc.create_household('Second foyer')")).rejects.toMatchObject({ code: "LC002" });
    });
  });

  it("AC9 : un app.household_id etranger pose par l'appelant est ignore (le foyer cree est celui de l'appelant)", async () => {
    const lonely = await createAccount({ name: "Seule" });
    const name = `Contexte etranger ${uniqueTag("z")}`;
    await asApp(lonely.userId, async (c) => {
      await c.query("SELECT set_config('app.household_id', $1, true)", [idA]);
      await c.query("SELECT lc.create_household($1)", [name]);
      const mine = await c.query<{ household_id: string; role: string; display_name: string }>(
        "SELECT household_id, role, display_name FROM lc.membership WHERE user_id = $1",
        [lonely.userId],
      );
      expect(mine.rowCount).toBe(1);
      expect(mine.rows[0]?.household_id).not.toBe(idA);
      expect(mine.rows[0]?.role).toBe("owner");
      expect(mine.rows[0]?.display_name).toBe("Seule");
    });
    // La transaction de asApp est annulee : rien ne persiste.
    expect((await adminPool().query("SELECT 1 FROM lc.household WHERE name = $1", [name])).rowCount).toBe(0);
  });
});

describe("AC9 : fonctions creees apres coup", () => {
  it("AC9 : une fonction creee sous le role de migration n'est pas executable par PUBLIC", async () => {
    const fn = `zz_probe_${randomBytes(6).toString("hex")}`;
    const pool = adminPool();
    await pool.query(`CREATE FUNCTION public.${fn}() RETURNS integer LANGUAGE sql AS 'SELECT 1'`);
    try {
      const r = await pool.query<{ pub: boolean; app: boolean }>(
        `SELECT has_function_privilege('public', to_regprocedure($1), 'EXECUTE') AS pub,
                has_function_privilege('lc_app', to_regprocedure($1), 'EXECUTE') AS app`,
        [`public.${fn}()`],
      );
      expect(r.rows[0]).toEqual({ pub: false, app: false });
    } finally {
      await pool.query(`DROP FUNCTION IF EXISTS public.${fn}()`);
    }
  });
});

describe("AC9 : triggers de membership", () => {
  it("AC9 : le trigger refuse la suppression de la ligne owner (LC007) meme sous un role qui contourne la RLS", async () => {
    const role = `lc_test_bypass_${randomBytes(4).toString("hex")}`;
    const pool = adminPool();
    await pool.query(`CREATE ROLE ${role} NOLOGIN BYPASSRLS`);
    try {
      await pool.query(`GRANT USAGE ON SCHEMA lc TO ${role}`);
      await pool.query(`GRANT SELECT, DELETE ON lc.membership TO ${role}`);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`SET LOCAL ROLE ${role}`);
        const visible = await client.query("SELECT 1 FROM lc.membership WHERE id = $1", [membershipA]);
        expect(visible.rowCount, "le role BYPASSRLS doit voir la ligne, sinon le test ne prouve rien").toBe(1);
        await expect(client.query("DELETE FROM lc.membership WHERE id = $1", [membershipA])).rejects.toMatchObject({ code: "LC007" });
      } finally {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
      }
    } finally {
      await pool.query(`DROP OWNED BY ${role}`);
      await pool.query(`DROP ROLE ${role}`);
    }
    expect((await membershipsOfUser(A.account.userId)).map((m) => m.id)).toEqual([membershipA]);
  });

  it("AC9 : le superutilisateur non plus ne supprime pas la ligne owner (LC007)", async () => {
    const client = await adminPool().connect();
    try {
      await client.query("BEGIN");
      await expect(client.query("DELETE FROM lc.membership WHERE id = $1", [membershipA])).rejects.toMatchObject({ code: "LC007" });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("AC9 : une appartenance est immuable, toute mise a jour leve P0001", async () => {
    const client = await adminPool().connect();
    try {
      await client.query("BEGIN");
      await expect(client.query("UPDATE lc.membership SET display_name = 'Autre' WHERE id = $1", [membershipA])).rejects.toMatchObject({
        code: "P0001",
      });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });
});

describe("AC9 : bornes et contraintes", () => {
  it("AC9 : member_count > 10 viole household_member_limit (23514)", async () => {
    const client = await adminPool().connect();
    try {
      await client.query("BEGIN");
      await expect(client.query("UPDATE lc.household SET member_count = 11 WHERE id = $1", [idA])).rejects.toMatchObject({
        code: "23514",
        constraint: "household_member_limit",
      });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("AC9 : une adresse en majuscules est refusee par la base (CHECK de minuscules)", async () => {
    const client = await adminPool().connect();
    try {
      await client.query("BEGIN");
      await expect(
        client.query("INSERT INTO lc_auth.app_user (name, email) VALUES ('Marie', $1)", [`MAJ-${uniqueTag("u")}@example.test`.toUpperCase()]),
      ).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });
});

describe("AC9 : roles", () => {
  it("AC9 : les quatre roles n'ont ni SUPERUSER ni BYPASSRLS", async () => {
    const roles = ["lc_owner", "lc_app", "lc_better_auth", "lc_definer"];
    const r = await adminPool().query<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean }>(
      "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = ANY($1) ORDER BY rolname",
      [roles],
    );
    expect(r.rows.map((x) => x.rolname)).toEqual([...roles].sort());
    expect(r.rows.filter((x) => x.rolsuper || x.rolbypassrls)).toEqual([]);
  });

  it("AC9 : lc_owner et lc_definer sont NOLOGIN, lc_app et lc_better_auth peuvent se connecter", async () => {
    const r = await adminPool().query<{ rolname: string; rolcanlogin: boolean }>(
      "SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname = ANY($1)",
      [["lc_owner", "lc_app", "lc_better_auth", "lc_definer"]],
    );
    const login = Object.fromEntries(r.rows.map((x) => [x.rolname, x.rolcanlogin]));
    expect(login).toEqual({ lc_owner: false, lc_app: true, lc_better_auth: true, lc_definer: false });
  });
});
