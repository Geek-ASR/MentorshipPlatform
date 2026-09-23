import type { CommissionScopeType, FeeBearer } from "./types";

/**
 * The commission engine (docs/08 §7). Pure — the caller loads active rules and snapshots the
 * result onto `order_items` at quote time, so a later rule change never alters an existing booking.
 */
export type CommissionRule = {
  id: string;
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
};

export type QuoteContext = {
  baseMinor: number;
  currency: string;
  serviceKind: string;
  categoryId: string | null;
  mentorUserId: string;
  promoCode: string | null;
  now: Date;
};

export type Quote = {
  /** Null when no real `commission_rules` row matched and the platform default was used instead. */
  commissionRuleId: string | null;
  percentBps: number;
  commissionMinor: number;
  mentorShareMinor: number;
  feeBearer: FeeBearer;
  studentFeeMinor: number;
  totalStudentPaysMinor: number;
};

const SCOPE_PRECEDENCE: Record<CommissionScopeType, number> = {
  mentor: 4,
  promotion: 3,
  category: 2,
  service_kind: 1,
  global: 0,
};

function ruleMatches(rule: CommissionRule, ctx: QuoteContext): boolean {
  if (rule.currency !== ctx.currency) return false;
  if (rule.validFrom > ctx.now) return false;
  if (rule.validTo && rule.validTo < ctx.now) return false;
  switch (rule.scopeType) {
    case "global":
      return true;
    case "service_kind":
      return rule.scopeRef === ctx.serviceKind;
    case "category":
      return rule.scopeRef !== null && rule.scopeRef === ctx.categoryId;
    case "mentor":
      return rule.scopeRef === ctx.mentorUserId;
    case "promotion":
      return rule.scopeRef !== null && rule.scopeRef === ctx.promoCode;
  }
}

/** Highest scope precedence wins; ties broken by priority, then the newest `validFrom`. */
function selectRule(rules: readonly CommissionRule[], ctx: QuoteContext): CommissionRule | null {
  const candidates = rules.filter((r) => ruleMatches(r, ctx));
  if (candidates.length === 0) return null;
  return candidates.reduce((best, r) => {
    const scopeDiff = SCOPE_PRECEDENCE[r.scopeType] - SCOPE_PRECEDENCE[best.scopeType];
    if (scopeDiff !== 0) return scopeDiff > 0 ? r : best;
    if (r.priority !== best.priority) return r.priority > best.priority ? r : best;
    return r.validFrom > best.validFrom ? r : best;
  });
}

function clamp(value: number, min: number | null, max: number | null): number {
  let result = value;
  if (min !== null) result = Math.max(result, min);
  if (max !== null) result = Math.min(result, max);
  return result;
}

/**
 * Quotes commission for one order item. Returns `null` if no rule matches — the caller must treat
 * this as "not bookable" rather than silently defaulting a fee, since an unpriced booking would
 * either shortchange the platform or the mentor with no audit trail explaining why.
 */
export function quoteOrderItem(ctx: QuoteContext, rules: readonly CommissionRule[]): Quote | null {
  const rule = selectRule(rules, ctx);
  if (!rule) return null;

  const raw = Math.floor((ctx.baseMinor * rule.percentBps) / 10_000) + rule.fixedMinor;
  const commissionMinor = Math.min(clamp(raw, rule.minFeeMinor, rule.maxFeeMinor), ctx.baseMinor);
  const mentorShareMinor = ctx.baseMinor - commissionMinor;

  const studentFeeMinor =
    (rule.feeBearer === "student" || rule.feeBearer === "split") && rule.studentFeeBps
      ? Math.floor((ctx.baseMinor * rule.studentFeeBps) / 10_000)
      : 0;

  return {
    commissionRuleId: rule.id,
    percentBps: rule.percentBps,
    commissionMinor,
    mentorShareMinor,
    feeBearer: rule.feeBearer,
    studentFeeMinor,
    totalStudentPaysMinor: ctx.baseMinor + studentFeeMinor,
  };
}
