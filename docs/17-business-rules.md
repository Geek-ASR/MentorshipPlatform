# 17 — Business Rules

Status: Draft v0.1 · 2026-09-17

All rules live in the backend **domain layer** (`src/server/modules/*/domain`) as pure functions, parameterised by **versioned settings** (`platform_settings`) and snapshotted onto records where later changes must not apply retroactively. The frontend only *displays* rule outcomes computed by the server.

Defaults below are **proposals** to validate in beta. Every value is configurable by admins (audited, with reason).

## 1. Rule engine conventions

- Setting key format: `<module>.<rule>` (e.g. `booking.hold_ttl_min`).
- Each setting has: type, default, allowed range, `effective_from`, version, `changed_by`, `reason`.
- **Snapshot policy:** booking-time snapshots include `cancellation.*`, `refund.*`, `commission` result, `booking.buffer_after_min`, `attendance.*` windows and `review.window_days`.
- Country-specific overrides: `<key>@<ISO2>` (e.g. `age_policy.min_age@DE`), resolved most-specific first.
- Rule evaluation returns `{ decision, reasons[] }`, where reasons are machine codes + human messages shown to users and staff (explainability).

## 2. Accounts & eligibility

| Key | Default | Range | Rule |
|-----|---------|-------|------|
| `age_policy.min_age` | 18 | 13–21 | Sign-up blocked below; country overrides allowed |
| `auth.password_min_length` | 12 | 8–64 | |
| `auth.recent_auth_window_min` | 10 | 5–30 | Step-up window |
| `account.deletion_grace_days` | 14 | 7–30 | |
| `booking.requires_verified_email` | true | — | |

## 3. Mentor supply

| Key | Default | Rule |
|-----|---------|------|
| `mentor.listing_requires_level` | `L2` + relevant credential | Listing and filterable affiliations require credentials |
| `mentor.paid_requires` | payout account `active` + eligibility `paid_allowed` + L3 | Otherwise volunteer mode |
| `mentor_eligibility.country_rules` | `{ "*": {"student_visa": "volunteer", "not_authorised": "volunteer", "citizen_or_pr": "paid", "work_authorised": "paid"} }` | Per-country overrides as counsel confirms |
| `mentor.eligibility_reattest_days` | 365 | |
| `verification.university_email_expiry_days` | 365 (current), 730 (alumni domain) | Or expected graduation date if sooner |
| `verification.work_email_expiry_days` | 365 | |
| `verification.document_retention_days` | 30 | After decision |
| `verification.needs_info_timeout_days` | 14 | Then auto-withdraw |
| `mentor.price_min_minor@INR` / `price_max_minor@INR` | 10000 (₹100) / 5000000 (₹50,000) | Per 60 min equivalent; outliers need review |
| `mentor.new_mentor_hold_sessions` | 5 | First N paid sessions use the longer transfer hold |

## 4. Scheduling & booking

| Key | Default | Range | Rule |
|-----|---------|-------|------|
| `booking.hold_ttl_min` | 10 | 5–30 | Payment window |
| `booking.late_payment_grace_min` | 60 | 0–1440 | Late captures within grace may re-acquire; after, always refund |
| `scheduling.slot_step_min` | 30 | 15/30/60 | Mentor-configurable |
| `scheduling.buffer_after_min` | 15 | 0–60 | Mentor-configurable, snapshotted |
| `scheduling.min_notice_min` | 720 | 60–10080 | Mentor-configurable |
| `scheduling.max_advance_days` | 60 | 7–90 | Mentor-configurable |
| `scheduling.max_sessions_per_day` | 4 | 1–12 | Mentor-configurable, per mentor-local date |
| `service.allowed_durations_min` | [30, 45, 60] | 15–180 | Custom durations behind flag `service.custom_durations` |
| `booking.max_active_holds_per_student` | 3 | 1–10 | |
| `booking.max_expired_holds_per_day` | 5 | — | Exceed → `hold_abuse` trust event + 24 h restriction |
| `booking.max_upcoming_free_1on1_per_student` | 2 | — | |
| `booking.self_booking_allowed` | false | — | Invariant (not configurable in production) |
| `reschedule.student_self_service_min_hours` | 24 | — | Beyond → mentor consent |
| `reschedule.max_self_service_per_booking` | 1 | — | |
| `reschedule.consent_timeout_hours` | 12 | — | Or until original start |
| `join.window_before_min` / `join.window_after_start_min` | 15 / session end | — | |

## 5. Cancellation & refunds (1:1 and group seats)

| Key | Default | Rule |
|-----|---------|------|
| `cancellation.student.full_refund_hours` | 24 | Cancel ≥ 24 h before start → 100% refund |
| `cancellation.student.partial_refund_hours` | 6 | 6–24 h → partial refund |
| `cancellation.student.partial_refund_pct` | 50 | |
| `cancellation.student.late_refund_pct` | 0 | < 6 h |
| `cancellation.student.courtesy_late_cancels_per_90d` | 1 | One late cancellation per 90 days refunded at the partial rate even if < 6 h (goodwill; mentor still gets the partial share) |
| `cancellation.mentor.refund_pct` | 100 | Always |
| `cancellation.mentor.points` | ≥ 72 h: 0 · 24–72 h: 1 · < 24 h: 2 · < 2 h: 3 | Trust events |
| `refund.technical_platform_failure_pct` | 100 (or free reschedule, student's choice) | No strikes |
| `refund.technical_third_party_pct` | Free reschedule by mutual agreement within 7 days, else 100% | No strikes |
| `refund.mentor_no_show_pct` | 100 | + trust event |
| `refund.student_no_show_pct` | 0 | Mentor paid; student may dispute within window |
| `refund.orphaned_payment_pct` | 100 | Initiated ≤ 15 min |
| `group.min_participants_unmet_refund_pct` | 100 | |
| `refund.goodwill_max_minor@INR` (staff without second approval) | 1000000 (₹10,000) | Above → second approver |

**Cut-off at the start (ADR-055):** a confirmed booking can't be cancelled or rescheduled once the session has started, by either side. From then on the outcome is settled by attendance claims, check-ins and, if needed, a dispute — a mentor who doesn't show is refunded to the student in full through that path (`refund.mentor_no_show_pct`), not as a cancellation.

Refund split recomputation: see [08 §8](08-payment-architecture.md#8-refunds-cancellation-fees-adjustments).

## 6. Group sessions & events

| Key | Default | Rule |
|-----|---------|------|
| `group.capacity_max` | 50 | |
| `group.min_participants_default` | 2 | |
| `group.min_seat_price_minor@INR` | 15000 (₹150) | |
| `group.registration_close_before_min` | 120 | |
| `group.min_check_before_hours` | 24 | Unmet → cancel + refunds |
| `group.full_refund_before_hours` | 24 | |
| `waitlist.claim_window_min` (paid) | 120 | Never beyond registration close |
| `events.waitlist_auto_promote_until_min` | 120 before start | Free events only |
| `events.no_show_limit_90d` | 3 | Then `events.max_upcoming_registrations_restricted` = 2 for 30 days |
| `events.max_upcoming_registrations` | 10 | Anti-hoarding baseline |
| `events.host_roles` | `admin`, `event_host` | |

## 7. Attendance & disputes

| Key | Default | Rule |
|-----|---------|------|
| `attendance.checkin_window` | T−10 min … T+20 min | |
| `attendance.no_show_grace_min` | 10 (30-min sessions) / 15 (others) | Earliest time a party may claim "other absent" |
| `attendance.finalize_after_end_hours` | 2 | Provisional outcomes computed |
| `attendance.contest_window_hours` | 48 | |
| `attendance.silent_complete_after_end_hours` | 72 | |
| `attendance.prompt_after_end_hours` | [1, 24] | |
| `dispute.open_window_hours` | 72 | After session end |
| `dispute.evidence_window_hours` | 48 | |
| `dispute.appeal_window_days` | 7 | |
| `dispute.balanced_evidence_split_pct` | 50 | |

## 8. Payouts & commission

| Key | Default | Rule |
|-----|---------|------|
| `commission.global_bps@INR` | 1000 (10%) | Exactly one active global rule per currency |
| `commission.fee_bearer` | `mentor` | `student` / `split` supported |
| `commission.founding_mentor_bps` | 0–500 via mentor-scoped rules, time-boxed ≤ 6 months | Launch incentive |
| `payout.hold_after_end_hours` | 72 | Release when no open dispute |
| `payout.new_mentor_hold_after_end_hours` | 168 | First `mentor.new_mentor_hold_sessions` paid sessions |
| `payout.account_change_cooling_off_hours` | 72 | Transfers stay held; notifications |
| `payout.account_change_review_threshold_minor@INR` | 2000000 (₹20,000) pending | Manual review above |
| `payout.eligibility` | Session `completed` (or dispute resolved for mentor) ∧ no open dispute ∧ payout account active ∧ mentor not under fraud hold ∧ hold elapsed | |
| `tax.tds_rate_bps` | 10 (0.1%) ⚖️ | Applied when FY gross exceeds threshold / per CA guidance |
| `tax.tds_threshold_minor@INR` | 50000000 (₹5,00,000) ⚖️ | |

## 9. Reviews

| Key | Default | Rule |
|-----|---------|------|
| `review.window_days` | 14 | After completion |
| `review.edit_window_hours` | 48 | |
| `review.min_count_for_average_display` | 3 | Below: "New mentor" |
| `review.bayes_prior_weight` | 5 | Ranking only |
| `review.hold_during_dispute` | true | |
| `review.mentor_response_max` | 1 | |

## 10. Trust & safety

Trust event points, decay and policy rules: [10 §4–6](10-trust-and-safety.md#4-policy-engine-rules-as-data). Additional keys:

| Key | Default |
|-----|---------|
| `tns.excuses_max_per_180d` | 2 |
| `tns.auto_restriction_max_days` | 30 |
| `tns.probation_days` | 90 (thresholds halved) |
| `tns.appeal_window_days` | 30 |
| `tns.permanent_ban_requires_second_reviewer` | true |
| `tns.minor_safety_auto_restrict_hours` | 72 |
| `messaging.prebooking_inquiries_per_day` | 5 |
| `messaging.max_length` | 4000 |
| `messaging.contact_info_prebooking` | `block` (`warn` / `allow`) |
| `messaging.payment_solicitation_postbooking` | `warn_and_flag` |

## 11. Discovery ranking (explainable)

Default sort `relevance` = weighted sum of normalised components, with weights in settings (`discovery.weights`):

| Component | Weight | Notes |
|-----------|--------|-------|
| Text/filter relevance (FTS rank, exact university/category match) | 0.40 | |
| Bayesian rating | 0.15 | |
| Reliability (1 − no-show/late-cancel rate, 90 d) | 0.15 | |
| Availability soon (has slot within 7 days) | 0.10 | |
| Credential strength (relevant credential present) | 0.10 | |
| Responsiveness (median inquiry response time) | 0.05 | |
| New-mentor boost (first 30 days, decays) | 0.05 | Cold-start fairness |

No paid placement in MVP. If sponsored placement ever exists, it must be labelled "Sponsored" (dark-pattern rules). The "Why this mentor?" tooltip lists the top contributing factors.

## 12. "Help me choose" questionnaire (rules-based)

Questions → filters: goal (career / study abroad / research) → category; target country/university → affiliation filters; budget → price range and session type (suggest group/free events for low budgets); language; urgency → availability window. Results display **explicit reasons** ("Studied at TU Munich · Speaks Hindi · Available this week · Within your budget"). No opaque scoring.
