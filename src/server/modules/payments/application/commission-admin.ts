import type { Executor } from "@/server/platform/db/client";
import { writeAudit } from "@/server/platform/audit";
import {
  deactivateCommissionRule as deactivateCommissionRuleRow,
  insertCommissionRule,
  listCommissionRules as listCommissionRuleRows,
  type CommissionRuleRow,
} from "../infra/commission-rules-repo";
import type { CommissionScopeType, FeeBearer } from "../domain/types";

export type CreateCommissionRuleInput = {
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
  reason: string;
};

/** Admin rule changes are audited and require a reason (docs/08 §7.1, docs/17 §1). Precedence and
 * "exactly one active global rule per currency" are enforced by `quoteOrderItem`'s resolution and
 * admin-workflow convention respectively — not a DB constraint, since a rule can be scheduled ahead
 * (`validFrom` in the future) without yet being the active one. */
export async function createCommissionRule(
  executor: Executor,
  actorUserId: string,
  input: CreateCommissionRuleInput,
): Promise<CommissionRuleRow> {
  const row = await insertCommissionRule(executor, { ...input, createdBy: actorUserId });
  await writeAudit(executor, {
    actorType: "staff",
    actorUserId,
    action: "commission_rule.created",
    targetType: "commission_rule",
    targetId: row.id,
    metadata: {
      scopeType: input.scopeType,
      scopeRef: input.scopeRef,
      percentBps: input.percentBps,
      reason: input.reason,
    },
  });
  return row;
}

export async function deactivateCommissionRule(
  executor: Executor,
  actorUserId: string,
  ruleId: string,
  reason: string,
): Promise<void> {
  await deactivateCommissionRuleRow(executor, ruleId);
  await writeAudit(executor, {
    actorType: "staff",
    actorUserId,
    action: "commission_rule.deactivated",
    targetType: "commission_rule",
    targetId: ruleId,
    metadata: { reason },
  });
}

export async function listCommissionRulesForAdmin(
  executor: Executor,
): Promise<CommissionRuleRow[]> {
  return listCommissionRuleRows(executor);
}
