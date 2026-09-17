import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { verifyAuditChain, writeAudit } from "@/server/platform/audit";
import { auditLogs } from "@/server/platform/db/tables/platform";
import { runWithRequestContext } from "@/server/platform/request-context";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => t?.dispose());

describe("audit log", () => {
  it("chains rows, redacts sensitive metadata and picks up the request id", async () => {
    await runWithRequestContext({ requestId: "req-audit-123" }, () =>
      writeAudit(t.db, {
        actorType: "staff",
        actorUserId: "0192f0c1-3b5a-7c1d-9e2f-0123456789ab",
        action: "settings.updated",
        targetType: "setting",
        targetId: "booking.hold_ttl_min",
        metadata: { before: 10, after: 15, nested: { password: "hunter2", apiToken: "abc" } },
      }),
    );
    await writeAudit(t.db, { actorType: "system", action: "platform.test_event" });

    const rows = await t.db.select().from(auditLogs).orderBy(auditLogs.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.prevHash).toBeNull();
    expect(rows[1]!.prevHash).toBe(rows[0]!.rowHash);
    expect(rows[0]!.requestId).toBe("req-audit-123");
    expect(rows[0]!.metadata).toEqual({
      before: 10,
      after: 15,
      nested: { password: "[REDACTED]", apiToken: "[REDACTED]" },
    });
    expect(await verifyAuditChain(t.db)).toBeNull();
  });

  it("rejects updates, deletes and truncation", async () => {
    await expect(t.db.execute(sql`update app.audit_logs set action = 'x.y'`)).rejects.toMatchObject(
      { cause: { code: "42501" } },
    );
    await expect(t.db.execute(sql`delete from app.audit_logs`)).rejects.toMatchObject({
      cause: { code: "42501" },
    });
    await expect(t.db.execute(sql`truncate app.audit_logs`)).rejects.toMatchObject({
      cause: { code: "42501" },
    });
  });

  it("keeps the chain intact under concurrent writers and rollbacks", async () => {
    const writers = Array.from({ length: 20 }, (_, index) =>
      t.db
        .transaction(async (tx) => {
          await writeAudit(tx, {
            actorType: "system",
            action: "platform.concurrent_write",
            metadata: { index },
          });
          if (index % 5 === 0) tx.rollback();
        })
        .catch(() => undefined),
    );
    await Promise.all(writers);
    const [{ count } = { count: 0 }] = await t.db.execute<{ count: number }>(
      sql`select count(*)::int as count from app.audit_logs where action = 'platform.concurrent_write'`,
    );
    expect(count).toBe(16);
    expect(await verifyAuditChain(t.db)).toBeNull();
  });

  it("detects tampering", async () => {
    const [target] = await t.db
      .select({ id: auditLogs.id })
      .from(auditLogs)
      .orderBy(auditLogs.id)
      .limit(1);
    await t.db.transaction(async (tx) => {
      await tx.execute(sql`alter table app.audit_logs disable trigger audit_logs_no_update_delete`);
      await tx.execute(
        sql`update app.audit_logs set metadata = '{"tampered": true}' where id = ${target!.id}`,
      );
      await tx.execute(sql`alter table app.audit_logs enable trigger audit_logs_no_update_delete`);
    });
    expect(await verifyAuditChain(t.db)).toBe(target!.id);
  });
});
