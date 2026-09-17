import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => t?.dispose());

describe("database schema", () => {
  it("keeps application tables out of the public schema", async () => {
    const rows = await t.db.execute<{ table_schema: string; count: number }>(sql`
      select table_schema, count(*)::int as count from information_schema.tables
      where table_schema in ('public', 'app') and table_type = 'BASE TABLE'
      group by table_schema order by table_schema`);
    expect(rows.find((row) => row.table_schema === "public")).toBeUndefined();
    expect(rows.find((row) => row.table_schema === "app")?.count).toBeGreaterThanOrEqual(10);
  });

  it("installs required extensions", async () => {
    const rows = await t.db.execute<{ extname: string }>(
      sql`select extname from pg_extension order by extname`,
    );
    const names = rows.map((row) => row.extname);
    expect(names).toEqual(expect.arrayContaining(["btree_gist", "citext", "pg_trgm", "pgcrypto"]));
  });

  it("enforces status and format check constraints", async () => {
    await expect(
      t.db.execute(
        sql`insert into app.outbox_jobs (id, type, payload, status) values (gen_random_uuid(), 'a.b', '{}', 'bogus')`,
      ),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(
      t.db.execute(sql`insert into app.currencies (code, name, minor_unit) values ('inr', 'x', 2)`),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
    await expect(
      t.db.execute(
        sql`insert into app.platform_settings (key, version, value, reason) values ('k', 0, '1', 'why')`,
      ),
    ).rejects.toMatchObject({ cause: { code: "23514" } });
  });

  it("maintains updated_at on update", async () => {
    await t.db.execute(
      sql`insert into app.feature_flags (key, enabled, reason) values ('x.flag', true, 'test')`,
    );
    const [before] = await t.db.execute<{ updated_at: Date }>(
      sql`select updated_at from app.feature_flags where key = 'x.flag'`,
    );
    await new Promise((resolve) => setTimeout(resolve, 15));
    await t.db.execute(sql`update app.feature_flags set enabled = false where key = 'x.flag'`);
    const [after] = await t.db.execute<{ updated_at: Date }>(
      sql`select updated_at from app.feature_flags where key = 'x.flag'`,
    );
    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
      new Date(before!.updated_at).getTime(),
    );
  });
});
