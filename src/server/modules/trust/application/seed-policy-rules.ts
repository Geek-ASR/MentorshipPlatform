import type { Executor } from "@/server/platform/db/client";
import type { PolicyRuleBody } from "../domain/policy-evaluator";
import { upsertPolicyRule } from "../infra/policy-rules-repo";

/**
 * Seeds the docs/10 §5 mentor reliability ladder and §6 student conduct policy as `policy_rules`
 * rows (docs/10 §4.3's format) — admin-editable afterwards; this only establishes the defaults.
 * `upsertPolicyRule` is keyed on `ruleKey`, so re-running this is idempotent and safe on redeploy.
 *
 * Two deliberate simplifications from the doc tables, both because the pure evaluator (built earlier
 * this phase) only supports `sum_points_gte` / `count_type_gte` / `rate_gte` conditions over a single
 * rolling time window, not a "last N sessions" count-window or a "did rule X fire before" lookup:
 *
 * - §5 Level 3's "no-show rate > 10% over the last 20 sessions (min 10 sessions)" is approximated as
 *   the rule's own 90-day time window with a `minSessions: 10` floor, rather than a literal
 *   last-20-sessions count window — a separate windowing mechanism for just this one condition
 *   wasn't worth the added complexity.
 * - §5 Level 4 ("Level-3 trigger again within 12 months of reinstatement") is approximated as the
 *   same trigger conditions as Level 3 but over a 365-day window with `ban` instead of `suspend` —
 *   not literally gated on having been reinstated first. In practice a mentor only reaches these
 *   point totals after already going through suspension, so this is a reasonable stand-in without
 *   building a dedicated "did rule X fire before" condition kind.
 *
 * Restrictions also only use the `Capability` enum `authorize()` already checks (docs/10 §7.3's
 * list) — §6's "max 1 upcoming booking" / "48 h notice required" / "max 2 upcoming free
 * registrations" text rules have no matching capability this phase, so they're approximated as a
 * blanket `booking.create` restriction (documented deviation, docs/19 Phase 10 retrospective).
 */
export async function seedPolicyRules(executor: Executor): Promise<void> {
  const rules: {
    ruleKey: string;
    subjectRole: "mentor" | "student" | "any";
    ruleBody: PolicyRuleBody;
  }[] = [
    {
      ruleKey: "mentor_reliability_warning_v1",
      subjectRole: "mentor",
      ruleBody: {
        windowDays: 90,
        anyOf: [{ kind: "sum_points_gte", value: 3 }],
        action: "warn",
        durationDays: null,
        restrictions: [],
        autoApply: true,
        requiresSecondReviewer: false,
        notifyTemplate: "enforcement.warning.reliability",
      },
    },
    {
      ruleKey: "mentor_reliability_restriction_v1",
      subjectRole: "mentor",
      ruleBody: {
        windowDays: 90,
        anyOf: [
          { kind: "sum_points_gte", value: 6 },
          { kind: "count_type_gte", eventType: "mentor_no_show", value: 2 },
        ],
        action: "restrict",
        durationDays: 14,
        restrictions: ["booking.accept"],
        autoApply: true,
        requiresSecondReviewer: false,
        notifyTemplate: "enforcement.restriction.reliability",
      },
    },
    {
      // docs/10 §4.3's own worked JSON example, extended with the rate condition §5's table adds.
      ruleKey: "mentor_reliability_suspension_v1",
      subjectRole: "mentor",
      ruleBody: {
        windowDays: 90,
        anyOf: [
          { kind: "sum_points_gte", value: 9 },
          { kind: "count_type_gte", eventType: "mentor_no_show", value: 3 },
          { kind: "rate_gte", ratePct: 10, minSessions: 10 },
        ],
        action: "suspend",
        durationDays: 30,
        restrictions: ["booking.accept", "listing.visible"],
        autoApply: false,
        requiresSecondReviewer: false,
        notifyTemplate: "enforcement.suspension.reliability",
      },
    },
    {
      ruleKey: "mentor_reliability_ban_v1",
      subjectRole: "mentor",
      ruleBody: {
        windowDays: 365,
        anyOf: [
          { kind: "sum_points_gte", value: 9 },
          { kind: "count_type_gte", eventType: "mentor_no_show", value: 3 },
          { kind: "rate_gte", ratePct: 10, minSessions: 10 },
        ],
        action: "ban",
        durationDays: null,
        restrictions: ["booking.accept", "booking.create", "listing.visible"],
        autoApply: false,
        requiresSecondReviewer: true,
        notifyTemplate: "enforcement.ban.reliability",
      },
    },
    {
      ruleKey: "student_no_show_restriction_v1",
      subjectRole: "student",
      ruleBody: {
        windowDays: 90,
        anyOf: [
          { kind: "sum_points_gte", value: 6 },
          { kind: "count_type_gte", eventType: "free_event_no_show", value: 3 },
        ],
        action: "restrict",
        durationDays: 30,
        restrictions: ["booking.create"],
        autoApply: true,
        requiresSecondReviewer: false,
        notifyTemplate: "enforcement.restriction.student_no_show",
      },
    },
    {
      ruleKey: "student_hold_abuse_restriction_v1",
      subjectRole: "student",
      ruleBody: {
        windowDays: 30,
        anyOf: [{ kind: "count_type_gte", eventType: "hold_abuse", value: 1 }],
        action: "restrict",
        durationDays: 1,
        restrictions: ["booking.create"],
        autoApply: true,
        requiresSecondReviewer: false,
        notifyTemplate: "enforcement.restriction.hold_abuse",
      },
    },
    {
      ruleKey: "student_chargeback_case_v1",
      subjectRole: "student",
      ruleBody: {
        windowDays: 365,
        anyOf: [{ kind: "count_type_gte", eventType: "chargeback_lost_friendly_fraud", value: 1 }],
        action: "suspend",
        durationDays: 30,
        restrictions: ["booking.create"],
        autoApply: false,
        requiresSecondReviewer: false,
        notifyTemplate: "enforcement.suspension.chargeback",
      },
    },
    {
      ruleKey: "any_report_upheld_minor_warning_v1",
      subjectRole: "any",
      ruleBody: {
        windowDays: 180,
        anyOf: [{ kind: "count_type_gte", eventType: "report_upheld_minor", value: 1 }],
        action: "warn",
        durationDays: null,
        restrictions: [],
        autoApply: true,
        requiresSecondReviewer: false,
        notifyTemplate: "enforcement.warning.report_upheld",
      },
    },
    {
      ruleKey: "any_report_upheld_major_case_v1",
      subjectRole: "any",
      ruleBody: {
        windowDays: 365,
        anyOf: [{ kind: "count_type_gte", eventType: "report_upheld_major", value: 1 }],
        action: "suspend",
        durationDays: 30,
        restrictions: [],
        autoApply: false,
        requiresSecondReviewer: false,
        notifyTemplate: "enforcement.suspension.report_upheld",
      },
    },
    {
      ruleKey: "any_review_manipulation_case_v1",
      subjectRole: "any",
      ruleBody: {
        windowDays: 365,
        anyOf: [{ kind: "count_type_gte", eventType: "review_manipulation", value: 1 }],
        action: "restrict",
        durationDays: 30,
        restrictions: ["review.create"],
        autoApply: false,
        requiresSecondReviewer: false,
        notifyTemplate: "enforcement.restriction.review_manipulation",
      },
    },
    {
      ruleKey: "mentor_verification_fraud_ban_v1",
      subjectRole: "mentor",
      ruleBody: {
        windowDays: 36_500, // verification_fraud never decays (docs/10 §4.2) — an effectively unbounded window.
        anyOf: [{ kind: "count_type_gte", eventType: "verification_fraud", value: 1 }],
        action: "ban",
        durationDays: null,
        restrictions: [],
        autoApply: false,
        requiresSecondReviewer: true,
        notifyTemplate: "enforcement.ban.verification_fraud",
      },
    },
  ];

  for (const rule of rules) {
    await upsertPolicyRule(executor, rule);
  }
}
