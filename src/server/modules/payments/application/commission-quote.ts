import type { Executor } from "@/server/platform/db/client";
import { AppError } from "@/server/platform/errors";
import { getSetting } from "@/server/platform/settings/settings";
import { quoteOrderItem, type Quote } from "../domain/commission";
import { listActiveRules } from "../infra/commission-rules-repo";

export type QuoteBookingInput = {
  baseMinor: number;
  currency: string;
  serviceKind: string;
  categoryId: string | null;
  mentorUserId: string;
  promoCode: string | null;
  now: Date;
};

/**
 * Quotes a booking's commission, falling back to the platform's global default (docs/17 §8
 * `commission.global_bps`/`commission.fee_bearer`) when no admin-authored `commission_rules` row
 * exists yet — so the very first booking on a fresh install is quotable without a manual seed step.
 */
export async function quoteBooking(executor: Executor, input: QuoteBookingInput): Promise<Quote> {
  const rules = await listActiveRules(executor, input.currency);
  let quote = quoteOrderItem(input, rules);
  if (!quote) {
    const [globalBps, feeBearer] = await Promise.all([
      getSetting(executor, "commission.global_bps", input.now),
      getSetting(executor, "commission.fee_bearer", input.now),
    ]);
    const fallback = quoteOrderItem(input, [
      {
        id: "default-global",
        scopeType: "global",
        scopeRef: null,
        percentBps: globalBps,
        fixedMinor: 0,
        currency: input.currency,
        minFeeMinor: null,
        maxFeeMinor: null,
        feeBearer,
        studentFeeBps: null,
        priority: 0,
        validFrom: new Date(0),
        validTo: null,
      },
    ]);
    // Not a real `commission_rules` row — never persist its synthetic id (it isn't a UUID and
    // doesn't exist in the table `order_items.commission_rule_id` would otherwise point at).
    quote = fallback ? { ...fallback, commissionRuleId: null } : null;
  }
  if (!quote) throw new AppError("BAD_REQUEST", { detail: "This price couldn't be quoted." });
  return quote;
}
