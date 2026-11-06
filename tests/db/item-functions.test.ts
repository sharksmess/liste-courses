/**
 * AC10 (tranche 003) : garanties de la base pour lc.item, lc.add_item et
 * lc.item_count_trg (ADR-0005, ERD §1, §4.1, §4.9, §7). Les appels passent par
 * `asApp` (role `lc_app`, transaction annulee). Le catalogue est lu par
 * l'administration. Foyers crees par l'API reelle.
 */
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAccount } from "../helpers/auth";
import { adminPool, asApp, closePools, pgCode, resetDatabase } from "../helpers/db";
import { home, type Home } from "../helpers/invite";
import { addItemInOwnTx, itemCountOf, seedItems } from "../helpers/items";

let A: Home;
let FULL: Home;

beforeAll(async () => {
  await resetDatabase();
  A = await home("DA");
  FULL = await home("DF");
  await addItemInOwnTx(A.account.userId, "Presente");
  await seedItems(FULL.account.userId, 200);
});
afterAll(closePools);

interface Failure {
  code: string | undefined;
  message: string;
}

async function failure(c: pg.PoolClient, sql: string, params: unknown[] = []): Promise<Failure> {
  await c.query("SAVEPOINT f");
  try {
    await c.query(sql, params);
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT f");
    return { code: pgCode(e), message: e instanceof Error ? e.message : String(e) };
  }
  await c.query("RELEASE SAVEPOINT f");
  throw new Error(`[tests] l'instruction devait lever : ${sql}`);
}

async function contextHousehold(c: pg.PoolClient): Promise<string | null> {
  const r = await c.query<{ h: string | null }>("SELECT nullif(current_setting('app.household_id', true), '') AS h");
  return r.rows[0]?.h ?? null;
}

const FUNCTIONS = ["lc.add_item(text, text)", "lc.item_count_trg()"];

describe("AC10 : catalogue des fonctions", () => {
  it.each(FUNCTIONS)("AC10 : %s est SECURITY DEFINER, a lc_definer, avec un search_path fixe", async (signature) => {
    const r = await adminPool().query<{ prosecdef: boolean; owner: string; proconfig: string[] | null }>(
      "SELECT prosecdef, pg_get_userbyid(proowner) AS owner, proconfig FROM pg_proc WHERE oid = to_regprocedure($1)",
      [signature],
    );
    expect(r.rowCount, `${signature} doit exister`).toBe(1);
    expect(r.rows[0]?.prosecdef).toBe(true);
    expect(r.rows[0]?.owner).toBe("lc_definer");
    const path = r.rows[0]?.proconfig?.find((s) => s.startsWith("search_path="));
    expect(path, `proconfig de ${signature} : ${JSON.stringify(r.rows[0]?.proconfig)}`).toBeDefined();
    expect(path?.endsWith("pg_temp"), `pg_temp doit etre en dernier : ${path}`).toBe(true);
  });

  it("AC10 : add_item n'est executable ni par PUBLIC ni par lc_better_auth, mais l'est par lc_app", async () => {
    const r = await adminPool().query<{ pub: boolean; app: boolean; auth: boolean }>(
      `SELECT has_function_privilege('public', to_regprocedure('lc.add_item(text, text)'), 'EXECUTE') AS pub,
              has_function_privilege('lc_app', to_regprocedure('lc.add_item(text, text)'), 'EXECUTE') AS app,
              has_function_privilege('lc_better_auth', to_regprocedure('lc.add_item(text, text)'), 'EXECUTE') AS auth`,
    );
    expect(r.rows[0]).toEqual({ pub: false, app: true, auth: false });
  });

  it("AC10 : item_count_trg n'est executable ni par PUBLIC, ni par lc_better_auth, ni par lc_app", async () => {
    const r = await adminPool().query<{ pub: boolean; app: boolean; auth: boolean }>(
      `SELECT has_function_privilege('public', to_regprocedure('lc.item_count_trg()'), 'EXECUTE') AS pub,
              has_function_privilege('lc_app', to_regprocedure('lc.item_count_trg()'), 'EXECUTE') AS app,
              has_function_privilege('lc_better_auth', to_regprocedure('lc.item_count_trg()'), 'EXECUTE') AS auth`,
    );
    expect(r.rows[0]).toEqual({ pub: false, app: false, auth: false });
  });

  it("AC10 : le trigger de compteur est AFTER INSERT OR DELETE FOR EACH ROW sur lc.item et appelle item_count_trg", async () => {
    const r = await adminPool().query<{ tgtype: number }>(
      "SELECT tgtype::int AS tgtype FROM pg_trigger WHERE tgrelid = 'lc.item'::regclass AND tgfoid = to_regprocedure('lc.item_count_trg()') AND NOT tgisinternal",
    );
    // ROW (1) + INSERT (4) + DELETE (8) ; ni BEFORE (2), ni UPDATE (16), ni TRUNCATE (32), ni INSTEAD (64).
    expect(r.rows.map((x) => x.tgtype)).toEqual([13]);
  });
});

describe("AC10 : table lc.item", () => {
  it("AC10 : lc.item appartient a lc_owner, sa RLS est activee et forcee", async () => {
    const r = await adminPool().query<{ owner: string; rls: boolean; forced: boolean }>(
      "SELECT pg_get_userbyid(relowner) AS owner, relrowsecurity AS rls, relforcerowsecurity AS forced FROM pg_class WHERE oid = 'lc.item'::regclass",
    );
    expect(r.rows[0]).toEqual({ owner: "lc_owner", rls: true, forced: true });
  });

  it("AC10 : sous lc_owner, lc.item rend zero ligne (FORCE), alors que la table n'est pas vide", async () => {
    const present = await adminPool().query("SELECT 1 FROM lc.item WHERE household_id = $1", [A.householdId]);
    expect(present.rowCount, "controle positif : l'administration voit l'article de A").toBeGreaterThan(0);
    const client = await adminPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE lc_owner");
      const r = await client.query("SELECT 1 FROM lc.item");
      expect(r.rowCount).toBe(0);
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release();
    }
  });

  it("AC10 : les cinq politiques existent avec les bonnes commandes et les bons roles", async () => {
    const r = await adminPool().query<{ policyname: string; cmd: string; roles: string[] }>(
      "SELECT policyname, cmd, roles::text[] AS roles FROM pg_policies WHERE schemaname = 'lc' AND tablename = 'item' ORDER BY policyname",
    );
    expect(r.rows).toEqual([
      { policyname: "item_definer_insert", cmd: "INSERT", roles: ["lc_definer"] },
      { policyname: "item_definer_select", cmd: "SELECT", roles: ["lc_definer"] },
      { policyname: "item_member_delete", cmd: "DELETE", roles: ["lc_app"] },
      { policyname: "item_member_select", cmd: "SELECT", roles: ["lc_app"] },
      { policyname: "item_member_update", cmd: "UPDATE", roles: ["lc_app"] },
    ]);
  });

  it("AC10 : lc_app a SELECT et DELETE, n'a pas INSERT, TRUNCATE, REFERENCES ni TRIGGER sur lc.item", async () => {
    const r = await adminPool().query<{ p: string; v: boolean }>(
      "SELECT p, has_table_privilege('lc_app', 'lc.item', p) AS v FROM unnest(ARRAY['SELECT','INSERT','DELETE','TRUNCATE','REFERENCES','TRIGGER']) AS p",
    );
    const got = Object.fromEntries(r.rows.map((x) => [x.p, x.v]));
    expect(got).toEqual({ SELECT: true, INSERT: false, DELETE: true, TRUNCATE: false, REFERENCES: false, TRIGGER: false });
  });

  it("AC10 : lc_app n'a UPDATE que sur la colonne purchased (ni au niveau de la table, ni sur une autre colonne)", async () => {
    const r = await adminPool().query<{ column_name: string; v: boolean }>(
      `SELECT a.attname AS column_name, has_column_privilege('lc_app', 'lc.item', a.attname, 'UPDATE') AS v
         FROM pg_attribute a WHERE a.attrelid = 'lc.item'::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attname`,
    );
    const allowed = r.rows.filter((x) => x.v).map((x) => x.column_name);
    expect(allowed).toEqual(["purchased"]);
    expect(r.rows.map((x) => x.column_name)).toEqual(
      expect.arrayContaining(["id", "household_id", "name", "quantity", "purchased", "author_user_id", "author_name", "created_at"]),
    );
    const table = await adminPool().query<{ v: boolean }>("SELECT has_table_privilege('lc_app', 'lc.item', 'UPDATE') AS v");
    // has_table_privilege rend true des qu'il existe un droit de colonne ? Non : seulement pour un droit de table.
    expect(table.rows[0]?.v).toBe(false);
  });

  it("AC10 : lc_definer a SELECT et INSERT sur lc.item, mais ni UPDATE ni DELETE", async () => {
    const r = await adminPool().query<{ p: string; v: boolean }>(
      "SELECT p, has_table_privilege('lc_definer', 'lc.item', p) AS v FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE']) AS p",
    );
    expect(Object.fromEntries(r.rows.map((x) => [x.p, x.v]))).toEqual({ SELECT: true, INSERT: true, UPDATE: false, DELETE: false, TRUNCATE: false });
  });

  it("AC10 : lc_app n'a aucun droit d'ecriture sur lc.household, ni sur ses compteurs", async () => {
    const r = await adminPool().query<{ k: string; v: boolean }>(
      `SELECT 'table ' || p AS k, has_table_privilege('lc_app', 'lc.household', p) AS v FROM unnest(ARRAY['INSERT','UPDATE','DELETE','TRUNCATE']) AS p
       UNION ALL
       SELECT 'colonne ' || c, has_column_privilege('lc_app', 'lc.household', c, 'UPDATE') FROM unnest(ARRAY['id','name','member_count','item_count']) AS c`,
    );
    expect(r.rowCount).toBe(8);
    expect(r.rows.filter((x) => x.v).map((x) => x.k)).toEqual([]);
  });

  it("AC10 : lc_app ne peut ni inserer directement dans lc.item (42501) ni modifier une autre colonne que purchased (42501)", async () => {
    await asApp(A.account.userId, async (c) => {
      const ins = await failure(
        c,
        "INSERT INTO lc.item (household_id, name, author_user_id, author_name) VALUES ($1, 'Direct', $2, 'X')",
        [A.householdId, A.account.userId],
      );
      expect(ins.code, ins.message).toBe("42501");
      for (const column of ["name", "quantity", "author_name", "created_at"]) {
        const sql = column === "created_at" ? "UPDATE lc.item SET created_at = now()" : `UPDATE lc.item SET ${column} = 'x'`;
        const upd = await failure(c, sql);
        expect(upd.code, `${column} : ${upd.message}`).toBe("42501");
      }
      const counter = await failure(c, "UPDATE lc.household SET item_count = 0");
      expect(counter.code, counter.message).toBe("42501");
    });
  });

  it("AC10 : les contraintes nommees de l'ERD existent, avec cles RESTRICT vers household et app_user", async () => {
    const r = await adminPool().query<{ conname: string; contype: string; confdeltype: string; target: string | null }>(
      `SELECT conname, contype::text AS contype, confdeltype::text AS confdeltype, confrelid::regclass::text AS target
         FROM pg_constraint WHERE conrelid = 'lc.item'::regclass ORDER BY conname`,
    );
    const byName = new Map(r.rows.map((x) => [x.conname, x]));
    for (const name of ["item_name_check", "item_quantity_check", "item_author_name_check"]) {
      expect(byName.get(name)?.contype, `contrainte ${name}`).toBe("c");
    }
    const fks = r.rows.filter((x) => x.contype === "f");
    expect(fks.map((x) => x.target).sort()).toEqual(["lc.household", "lc_auth.app_user"]);
    expect(fks.map((x) => x.confdeltype)).toEqual(["r", "r"]);
  });

  it("AC10 : l'index item_household_order_idx existe sur (household_id, created_at, id), et aucun index unique ne porte sur name", async () => {
    const idx = await adminPool().query<{ cols: string[] }>(
      `SELECT array_agg(a.attname ORDER BY k.ord) AS cols
         FROM pg_index i
         JOIN pg_class c ON c.oid = i.indexrelid
         CROSS JOIN LATERAL unnest(i.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
        WHERE c.relname = 'item_household_order_idx' AND i.indrelid = 'lc.item'::regclass
        GROUP BY i.indexrelid`,
    );
    expect(idx.rows.map((x) => x.cols)).toEqual([["household_id", "created_at", "id"]]);

    const unique = await adminPool().query<{ relname: string }>(
      `SELECT c.relname FROM pg_index i
         JOIN pg_class c ON c.oid = i.indexrelid
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey::int2[])
        WHERE i.indrelid = 'lc.item'::regclass AND i.indisunique AND a.attname = 'name'`,
    );
    expect(unique.rows).toEqual([]);
  });
});

describe("AC10 : lc.add_item", () => {
  it("AC10 : sans app.user_id (absent ou vide), add_item leve LC001", async () => {
    await asApp(undefined, async (c) => {
      expect((await failure(c, "SELECT lc.add_item('X', NULL)")).code).toBe("LC001");
    });
    await asApp("", async (c) => {
      expect((await failure(c, "SELECT lc.add_item('X', NULL)")).code).toBe("LC001");
    });
  });

  it("AC10 : un compte sans foyer leve LC009", async () => {
    const lonely = await createAccount({ name: "Seul" });
    await asApp(lonely.userId, async (c) => {
      expect((await failure(c, "SELECT lc.add_item('X', NULL)")).code).toBe("LC009");
    });
  });

  it("AC10 : a 200 articles, add_item leve LC008 et le message ne cite ni nom ni identifiant de foyer", async () => {
    expect(await itemCountOf(FULL.householdId)).toEqual({ counter: 200, rows: 200 });
    await asApp(FULL.account.userId, async (c) => {
      const f = await failure(c, "SELECT lc.add_item('Trop', NULL)");
      expect(f.code, f.message).toBe("LC008");
      expect(f.message).not.toContain(FULL.householdId);
      expect(f.message).not.toContain(FULL.householdName);
      expect(f.message).not.toContain("household_item_limit");
    });
    expect(await itemCountOf(FULL.householdId)).toEqual({ counter: 200, rows: 200 });
  });

  it("AC10 : les messages de LC001 et LC009 ne contiennent aucun nom ni identifiant de foyer", async () => {
    const lonely = await createAccount({ name: "Seul" });
    await asApp(lonely.userId, async (c) => {
      const f = await failure(c, "SELECT lc.add_item('X', NULL)");
      for (const secret of [A.householdId, A.householdName, FULL.householdId, FULL.householdName]) expect(f.message).not.toContain(secret);
    });
    await asApp(undefined, async (c) => {
      const f = await failure(c, "SELECT lc.add_item('X', NULL)");
      for (const secret of [A.householdId, A.householdName]) expect(f.message).not.toContain(secret);
    });
  });

  const forbidden: [string, string, string | null][] = [
    ["nom avec espace de tete", " Lait", null],
    ["nom avec espace de queue", "Lait ", null],
    ["nom vide", "", null],
    ["nom de 101 points de code", "n".repeat(101), null],
    ["quantite vide", "Lait", ""],
    ["quantite avec espace de bord", "Lait", " 2"],
    ["quantite de 31 points de code", "Lait", "q".repeat(31)],
  ];

  it.each(forbidden)("AC10 : %s releve 23514 tel quel, et non LC008", async (_label, name, quantity) => {
    await asApp(A.account.userId, async (c) => {
      const f = await failure(c, "SELECT lc.add_item($1, $2)", [name, quantity]);
      expect(f.code, f.message).toBe("23514");
    });
  });

  it("AC10 : 23514 sur une colonne de texte releve tel quel meme sur un foyer plein (jamais traduit en LC008)", async () => {
    await asApp(FULL.account.userId, async (c) => {
      const f = await failure(c, "SELECT lc.add_item(' mauvais', NULL)");
      expect(f.code, f.message).toBe("23514");
    });
  });

  it("AC10 : les bornes exactes (100 et 30 points de code, emoji compris) sont acceptees", async () => {
    await asApp(A.account.userId, async (c) => {
      const r = await c.query<{ id: string }>("SELECT lc.add_item($1, $2) AS id", ["😀".repeat(100), "🍎".repeat(30)]);
      expect(r.rows[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    });
  });

  it("AC10 : add_item copie le display_name de l'appartenance dans author_name et rend l'identifiant", async () => {
    await asApp(A.account.userId, async (c) => {
      const r = await c.query<{ id: string }>("SELECT lc.add_item('Copie', '1') AS id");
      const row = await c.query<{ author_name: string; author_user_id: string; purchased: boolean; quantity: string }>(
        "SELECT author_name, author_user_id, purchased, quantity FROM lc.item WHERE id = $1",
        [r.rows[0]?.id],
      );
      expect(row.rows).toEqual([{ author_name: A.account.name, author_user_id: A.account.userId, purchased: false, quantity: "1" }]);
    });
  });

  it("AC10 : apres add_item, app.household_id est vide (meme si l'appelant l'avait pose)", async () => {
    await asApp(A.account.userId, async (c) => {
      await c.query("SELECT set_config('app.household_id', $1, true)", [FULL.householdId]);
      await c.query("SELECT lc.add_item('Contexte', NULL)");
      expect(await contextHousehold(c)).toBeNull();
    });
  });

  it("AC10 : apres une erreur LC008 rattrapee, le compteur et le contexte restent sains", async () => {
    await asApp(FULL.account.userId, async (c) => {
      await failure(c, "SELECT lc.add_item('Trop', NULL)");
      expect(await contextHousehold(c)).toBeNull();
      const n = await c.query<{ item_count: number }>("SELECT item_count FROM lc.household WHERE id = $1", [FULL.householdId]);
      expect(n.rows[0]?.item_count).toBe(200);
    });
  });
});

describe("AC10 : lc.item_count_trg", () => {
  it("AC10 : apres une suppression par lc_app, le trigger a restaure la valeur precedente de app.household_id (valeur posee)", async () => {
    const h = await home("DT");
    const id = await addItemInOwnTx(h.account.userId, "A retirer");
    await addItemInOwnTx(h.account.userId, "Reste");
    await asApp(h.account.userId, async (c) => {
      const sentinel = "valeur-precedente-inventee";
      await c.query("SELECT set_config('app.household_id', $1, true)", [sentinel]);
      const del = await c.query("DELETE FROM lc.item WHERE id = $1", [id]);
      expect(del.rowCount).toBe(1);
      const r = await c.query<{ h: string }>("SELECT current_setting('app.household_id', true) AS h");
      expect(r.rows[0]?.h).toBe(sentinel);
      const n = await c.query<{ item_count: number }>("SELECT item_count FROM lc.household WHERE id = $1", [h.householdId]);
      expect(n.rows[0]?.item_count).toBe(1);
    });
  });

  it("AC10 : apres une suppression par lc_app sans valeur precedente, app.household_id est vide", async () => {
    const h = await home("DU");
    const id = await addItemInOwnTx(h.account.userId, "A retirer");
    await asApp(h.account.userId, async (c) => {
      await c.query("DELETE FROM lc.item WHERE id = $1", [id]);
      expect(await contextHousehold(c)).toBeNull();
    });
  });

  it("AC10 : le compteur suit chaque insertion et chaque suppression, et lc_app ne peut pas le contourner", async () => {
    const h = await home("DV");
    const ids: string[] = [];
    for (const n of ["a", "b", "c"]) ids.push(await addItemInOwnTx(h.account.userId, n));
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 3, rows: 3 });
    await asApp(h.account.userId, async (c) => {
      await c.query("DELETE FROM lc.item WHERE id = $1", [ids[0]]);
      const n = await c.query<{ item_count: number }>("SELECT item_count FROM lc.household WHERE id = $1", [h.householdId]);
      expect(n.rows[0]?.item_count).toBe(2);
    });
    expect(await itemCountOf(h.householdId)).toEqual({ counter: 3, rows: 3 });
  });
});
