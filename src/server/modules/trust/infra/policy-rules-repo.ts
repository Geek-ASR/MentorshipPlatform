import { and, eq } from "drizzle-orm";
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
