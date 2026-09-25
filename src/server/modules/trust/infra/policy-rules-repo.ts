import { and, asc, eq, sql } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import { policyRules } from "./tables";
import type { PolicyRuleBody } from "../domain/policy-evaluator";

export type PolicyRuleRow = typeof policyRules.$inferSelect;

export async function upsertPolicyRule(
  executor: Executor,
  input: { ruleKey: string; subjectRole: "mentor" | "student" | "any"; ruleBody: PolicyRuleBody },
): Promise<PolicyRuleRow> {
  const [row] = await executor
    .insert(policyRules)
    .values({
      id: newId(),
      ...input,
      ruleBody: input.ruleBody as unknown as Record<string, unknown>,
    })
    .onConflictDoUpdate({
      target: policyRules.ruleKey,
      set: {
        ruleBody: input.ruleBody as unknown as Record<string, unknown>,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row!;
}

export async function listEnabledRulesForSubject(
  executor: Executor,
  subjectRole: "mentor" | "student",
): Promise<PolicyRuleRow[]> {
  return executor
    .select()
    .from(policyRules)
    .where(and(eq(policyRules.enabled, true)))
    .then((rows) => rows.filter((r) => r.subjectRole === subjectRole || r.subjectRole === "any"));
}

/** docs/06 §7.9 `GET/PUT /admin/policy-rules/{id}` — the piece Phase 10 deferred to Phase 11. */
export async function listAllPolicyRules(executor: Executor): Promise<PolicyRuleRow[]> {
  return executor.select().from(policyRules).orderBy(asc(policyRules.ruleKey));
}

/** Bumps `version` on every body edit — the closest equivalent to settings' append-only versioning
 * this table supports without a schema change; the audit log (written by the caller) carries the
 * "reason" half of "versioned, reasons". */
export async function updateRuleBody(
  executor: Executor,
  id: string,
  ruleBody: PolicyRuleBody,
): Promise<PolicyRuleRow | undefined> {
  const [row] = await executor
    .update(policyRules)
    .set({
      ruleBody: ruleBody as unknown as Record<string, unknown>,
      version: sql`${policyRules.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(policyRules.id, id))
    .returning();
  return row;
}

export async function findPolicyRule(
  executor: Executor,
  id: string,
): Promise<PolicyRuleRow | undefined> {
  const [row] = await executor.select().from(policyRules).where(eq(policyRules.id, id)).limit(1);
  return row;
}

export async function setRuleEnabled(
  executor: Executor,
  id: string,
  enabled: boolean,
): Promise<void> {
  await executor
    .update(policyRules)
    .set({ enabled, updatedAt: new Date() })
    .where(eq(policyRules.id, id));
}
