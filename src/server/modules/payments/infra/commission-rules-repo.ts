import { and, desc, eq } from "drizzle-orm";
import type { Executor } from "@/server/platform/db/client";
import { newId } from "@/server/platform/ids";
import type { CommissionRule } from "../domain/commission";
import { commissionRules } from "./tables";
import type { CommissionScopeType, FeeBearer } from "../domain/types";

export type CommissionRuleRow = typeof commissionRules.$inferSelect;

function toDomain(row: CommissionRuleRow): CommissionRule {
  return {
    id: row.id,
    scopeType: row.scopeType,
    scopeRef: row.scopeRef,
    percentBps: row.percentBps,
    fixedMinor: row.fixedMinor,
    currency: row.currency,
    minFeeMinor: row.minFeeMinor,
    maxFeeMinor: row.maxFeeMinor,
    feeBearer: row.feeBearer,
    studentFeeBps: row.studentFeeBps,
    priority: row.priority,
    validFrom: row.validFrom,
    validTo: row.validTo,
  };
}

/** Active rules for a currency — the caller (domain `quoteOrderItem`) narrows by validity window. */
export async function listActiveRules(
  executor: Executor,
  currency: string,
): Promise<CommissionRule[]> {
  const rows = await executor
    .select()
    .from(commissionRules)
    .where(and(eq(commissionRules.currency, currency), eq(commissionRules.isActive, true)));
  return rows.map(toDomain);
}

export async function insertCommissionRule(
  executor: Executor,
  input: {
    scopeType: CommissionScopeType;
    scopeRef: string | null;
    percentBps: number;
    fixedMinor: number;
    currency: string;
    minFeeMinor: number | null;
    maxFeeMinor: number | null;
    feeBearer: FeeBearer;
    studentFeeBps: number | null;
    priority: number;
    validFrom: Date;
    validTo: Date | null;
    createdBy: string;
    reason: string;
  },
): Promise<CommissionRuleRow> {
  const [row] = await executor
    .insert(commissionRules)
    .values({ id: newId(), isActive: true, ...input })
    .returning();
  return row!;
}

export async function deactivateCommissionRule(executor: Executor, id: string): Promise<void> {
  await executor.update(commissionRules).set({ isActive: false }).where(eq(commissionRules.id, id));
}

export async function listCommissionRules(executor: Executor): Promise<CommissionRuleRow[]> {
  return executor.select().from(commissionRules).orderBy(desc(commissionRules.createdAt));
}
