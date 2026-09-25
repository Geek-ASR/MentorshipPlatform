import type { Database } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { writeAudit } from "@/server/platform/audit";
import type { PolicyRuleBody } from "../domain/policy-evaluator";
import {
  findPolicyRule,
  listAllPolicyRules,
  setRuleEnabled,
  updateRuleBody,
  type PolicyRuleRow,
} from "../infra/policy-rules-repo";

export async function listPolicyRulesForAdmin(db: Database): Promise<PolicyRuleRow[]> {
  return listAllPolicyRules(db);
}

export type UpdatePolicyRuleInput = {
  ruleId: string;
  enabled?: boolean;
  ruleBody?: PolicyRuleBody;
  reason: string;
  decidedBy: string;
};

/** docs/06 §7.9 `PUT /admin/policy-rules/{id}` — enable/disable and/or replace the rule body. */
export async function updatePolicyRuleForAdmin(
  db: Database,
  input: UpdatePolicyRuleInput,
): Promise<PolicyRuleRow> {
  return db.transaction(async (tx) => {
    const existing = await findPolicyRule(tx, input.ruleId);
    if (!existing) throw new AppError("NOT_FOUND");

    if (input.enabled !== undefined) {
      await setRuleEnabled(tx, input.ruleId, input.enabled);
    }
    if (input.ruleBody) {
      await updateRuleBody(tx, input.ruleId, input.ruleBody);
    }

    await writeAudit(tx, {
      actorType: "staff",
      actorUserId: input.decidedBy,
      action: "policy_rule.updated",
      targetType: "policy_rule",
      targetId: input.ruleId,
      metadata: {
        ruleKey: existing.ruleKey,
        enabled: input.enabled,
        ruleBodyChanged: Boolean(input.ruleBody),
        reason: input.reason,
      },
    });

    const updated = await findPolicyRule(tx, input.ruleId);
    return updated!;
  });
}
