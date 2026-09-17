# 18 — Edge Case Inventory

Status: Draft v0.1 · 2026-09-17 · Living document: every bug found in beta that isn't covered here gets added, with a test.

Legend: **Phase** where handling ships (M = MVP, B = Beta, F = Future). **Test**: U unit, I integration, E E2E, P process/runbook.

## 1. Accounts & identity

| # | Scenario | Expected behaviour | Phase | Test |
|---|----------|-------------------|-------|------|
| A1 | Sign-up with an email that already exists | Same "check your inbox" response; existing owner gets "attempted sign-up" email | M | I |
| A2 | Unverified local account + later Google sign-in with the same email | Google (verified) takes ownership; unverified password credential removed; notification | M | I |
| A3 | User changes email to one already in use | Generic response; no disclosure; the new-address link never arrives for the taken address | M | I |
| A4 | User loses MFA device and backup codes | Support recovery with a 72 h delay, notifications, payouts frozen | M | P |
| A5 | User enters a birth year making them under 18 | Blocked with explanation; no account row created; only an aggregate counter increments | M | U/I |
| A6 | User turns 18 later (was blocked) | Can sign up again normally | M | — |
| A7 | Student deletes account with upcoming bookings | Deletion impact shown; upcoming bookings cancelled under standard student policy; refunds still processed after deletion | M | I |
| A8 | Mentor deletes account with future bookings | Sessions within 14 days must be honoured or cancelled (mentor cancellation); later ones auto-cancelled with full refunds; held transfers released per normal rules; payouts owed still paid | M | I |
| A9 | Account deletion requested while a dispute or moderation case is open | Deletion waits for case closure (legal-hold) or pseudonymises while retaining case records | M | I |
| A10 | Review author deletes account | Review shown as "Former student" unless PII/removal requested | M | I |
| A11 | Suspended user tries to log in | Limited access: restriction notice, appeal, export; everything else 403 | M | I |
| A12 | Staff member is also a mentor | Staff roles require a separate account; grant blocked if the account has mentor role | M | I |
| A13 | Sessions active on 3 devices when password is reset | All sessions revoked | M | I |
| A14 | Same person creates multiple accounts to evade a ban | Signals (payment instrument hash, device cookie, email patterns) → case; enforcement only after human review | B | P |

## 2. Mentor profile & verification

| # | Scenario | Expected behaviour | Phase | Test |
|---|----------|-------------------|-------|------|
| V1 | University email domain not in our mapping | Request routed to admin to verify the domain belongs to the university (official website evidence); badge only after mapping approved | M | I |
| V2 | Same institutional email used to verify two accounts | Second attempt rejected (fingerprint uniqueness) with a generic message; flagged | M | I |
| V3 | Mentor edits a verified affiliation (e.g. changes university) | Credential revoked; badge removed; re-verification required | M | I |
| V4 | Current-student credential expires mid-booking-cycle | Badge disappears; affiliation no longer filterable; existing bookings unaffected; listing requirement re-evaluated (may unlist) | M | I |
| V5 | University changes name | Admin adds an alias with validity dates; old name searchable; slug redirects (301) | M | I |
| V6 | Two universities merge | `merged_into_id`; affiliations display "X (now part of Y)"; slugs redirect | M | I |
| V7 | Program discontinued | `status=discontinued`; historical affiliations keep it; not selectable for new ones | M | U |
| V8 | Mentor's company acquired/renamed | Company alias; credentials remain valid until expiry | M | — |
| V9 | Forged document detected after approval | Credential revoked; T&S case; `verification_fraud` event; students with future bookings notified (neutral) and offered refunds | M | P/I |
| V10 | KYC name at payment partner doesn't match profile name | Paid mode blocked pending review (legal name changes, transliteration handled by reviewer) | M | P |
| V11 | Mentor changes country of residence | Re-attestation required; paid mode suspended until done; existing bookings continue | M | I |
| V12 | Mentor on student visa marks themselves as work-authorised without evidence | Stays volunteer until evidence reviewed | M | I |
| V13 | Verification reviewer is connected to the mentor | Conflict-of-interest guard prevents assignment | M | I |

## 3. Availability, time & scheduling

| # | Scenario | Expected behaviour | Phase | Test |
|---|----------|-------------------|-------|------|
| T1 | Mentor availability falls inside a DST gap | Nonexistent slots not offered | M | U |
| T2 | DST fall-back repeated hour | Both occurrences offered as distinct instants, labelled with offsets | M | U |
| T3 | Student changes time zone setting | Display changes; stored instants unchanged | M | E |
| T4 | Mentor changes time zone | Rules reinterpreted at the same wall-clock times; confirmation dialog shows the effect; bookings unchanged | M | I |
| T5 | Browser time zone differs from saved zone (travel) | Banner offers to update; times labelled with the saved zone meanwhile | M | E |
| T6 | Government changes a tz rule after booking (tzdata update) | Booking instant preserved; displayed local times recomputed; if the mentor-local wall time changed, both parties are notified | F | P |
| T7 | Mentor sets max sessions/day; bookings span a local midnight | Counted by the start time's mentor-local date | M | U |
| T8 | Mentor adds a vacation over existing confirmed bookings | Exception saved; conflicting bookings listed; not auto-cancelled; mentor must decide | M | I |
| T9 | Mentor deletes a weekly rule with bookings in it | Bookings unaffected | M | I |
| T10 | Slot list stale in the UI (booked by someone else) | Booking fails with `SLOT_UNAVAILABLE` + fresh suggestions | M | E |
| T11 | Student and mentor both in zones with 30/45-min offsets | Correct conversions | M | U |
| T12 | Session crossing the date line (displayed on different calendar dates) | Each party sees their own date | M | U |
| T13 | Server clock skew | Hosts use NTP; all time comparisons use DB `now()` inside transactions for holds | M | P |

## 4. Booking & concurrency

| # | Scenario | Expected behaviour | Phase | Test |
|---|----------|-------------------|-------|------|
| B1 | Two students book the same slot simultaneously | Exactly one hold; other gets `SLOT_UNAVAILABLE` | M | I (concurrency) |
| B2 | Same student double-clicks "Book" | Idempotency key → same booking | M | I |
| B3 | Student opens two tabs and books two different slots with the same mentor | Allowed if within hold limits and no overlap | M | I |
| B4 | Student tries to book overlapping sessions with two mentors | `STUDENT_OVERLAP` for paid bookings | M | U |
| B5 | Mentor books their own service (self-booking) | Rejected | M | U |
| B6 | Student blocked by the mentor tries to book | `NOT_AVAILABLE` without revealing the block | M | I |
| B7 | Mentor changes price after booking | Booking keeps the snapshot price | M | I |
| B8 | Mentor removes a duration option after booking | Booking unaffected | M | I |
| B9 | Mentor becomes unavailable (illness) before a session | Mentor cancels (full refund); may submit an emergency excuse | M | E |
| B10 | Mentor becomes unreachable (e.g. dies/leaves platform) | Admin "mentor unavailable" action: future bookings cancelled with full refunds; non-punitive; owed payouts held pending legal process ⚖️ | M | P |
| B11 | Mentor gets banned with future sessions | Bookings `cancelled_by_admin`, 100% refunds, neutral notices | M | I |
| B12 | Student gets banned with future sessions | Cancelled under standard student policy at ban time (fraud cases: finance review) | M | I |
| B13 | Mentor pauses listing with pending holds | Holds can still complete payment; no new holds | M | I |
| B14 | Hold squatting (many holds, no payment) | Hold limits + trust events + temporary restriction | M | I |
| B15 | Reschedule to a slot that becomes taken mid-request | Whole reschedule TX rolls back; original booking intact | M | I |
| B16 | Reschedule request expires | Original booking stands; both notified | M | I |
| B17 | Booking made < min notice via manipulated client | Server eligibility check rejects | M | I |
| B18 | Booking beyond horizon via API | Rejected | M | U |
| B19 | Group session: a participant cancels after the min-participants check passed | Seat freed; waitlist offer; session continues even if below minimum | M | I |
| B20 | Group session: time changed by mentor after seats sold | Reschedule flow; all participants may cancel with full refund | M | I |
| B21 | Event reaches capacity | Waitlist; auto-promotion on cancellations until T−2 h | M | E |
| B22 | Student cancels event registration | Seat freed, waitlist promoted | M | I |
| B23 | Mentor/host cancels an event | All registrants notified; paid events (future) refunded | M | I |
| B24 | Waitlist offer expires while the student is paying | Payment success after offer expiry → late payment path (re-acquire or refund) | M | I |
| B25 | Capacity reduced below confirmed seats | Rejected | M | U |

## 5. Payments & money

| # | Scenario | Expected behaviour | Phase | Test |
|---|----------|-------------------|-------|------|
| P1 | Payment succeeds but booking creation failed | Impossible by design (booking hold precedes payment); a captured payment without a booking is detected and refunded | M | I |
| P2 | Booking created but payment failed | Hold expires; slot released; student can retry within TTL | M | E |
| P3 | Duplicate webhook | Deduped | M | I |
| P4 | Webhooks out of order | Monotonic transitions; provider re-fetch | M | I |
| P5 | Webhook never arrives | Client confirm and/or sweeper resolves | M | I |
| P6 | User closes browser after paying | Sweeper/webhook confirms; email sent | M | E |
| P7 | Payment captured after hold expired, slot free | Late confirm | M | I |
| P8 | Payment captured after hold expired, slot taken | Orphaned → full refund ≤ 15 min | M | I |
| P9 | Two payments captured on the same order (double pay via retry) | Second payment refunded automatically; alert | M | I |
| P10 | Amount on provider differs from intent | Treated as verification failure; refund + alert | M | I |
| P11 | Refund fails (closed UPI/bank account) | Finance queue; contact student; alternative route per PA process ⚖️ | M | P |
| P12 | Refund after mentor payout released | Transfer reversal; if insufficient → mentor receivable netted from future transfers | M | I |
| P13 | Chargeback after payout | Evidence collection; freeze future transfers up to the amount; outcome → ledger + trust events | M | I/P |
| P14 | Chargeback on a session the mentor delivered (friendly fraud) | Submit attendance evidence; if lost, platform absorbs or recovers per Mentor Agreement; student trust event | M | P |
| P15 | Admin changes commission while bookings are in flight | Existing quotes use snapshots; new quotes use the new rule | M | I |
| P16 | Mentor's payout account KYC rejected after bookings exist | Transfers held; mentor notified; paid bookings disabled; existing sessions continue | M | I |
| P17 | Mentor changes payout account (possible ATO) | Step-up + MFA; 72 h cooling-off; notifications; review above threshold | M | E |
| P18 | Partial refund on a group seat | Recompute split for that seat only | M | U |
| P19 | Rounding on odd amounts (₹999 × 10%) | Commission floored; mentor gets the extra paisa; sums exact | M | U |
| P20 | Provider outage during checkout | Hold released; retry-safe | M | I |
| P21 | Live keys configured in staging | Boot guard refuses to start | M | U |
| P22 | Currency not supported by provider | Service creation rejects that currency | M | U |
| P23 | TDS threshold crossed mid-FY | TDS applied from the crossing transfer per CA-approved method ⚖️ | B | U |
| P24 | Invoice number sequence under concurrency | Row-locked sequence per series/FY; no gaps from rolled-back TXs (allocated at commit via sequence table lock) | M | I |

## 6. Sessions & attendance

| # | Scenario | Expected behaviour | Phase | Test |
|---|----------|-------------------|-------|------|
| S1 | Mentor doesn't show; student reports | Provisional mentor no-show → 48 h contest → refund + trust event | M | E |
| S2 | Student doesn't show; mentor reports after grace | Provisional student no-show → contest window → mentor paid | M | I |
| S3 | Both claim the other didn't show | Dispute; evidence comparison; default full refund if neither has signals | M | I |
| S4 | Internet failure on one side mid-session | `technical_issue` claim → free reschedule or policy refund; no strike unless pattern | M | I |
| S5 | Meeting provider outage (Meet/Zoom down) | Technical path; no strikes | M | P |
| S6 | Platform outage during join window | Incident flag → all affected sessions get free reschedule or full refund; no strikes | M | P |
| S7 | Meeting link invalid/expired | Participant reports; mentor can update the link until session end; if unresolved → mentor-fault technical issue (review) | M | I |
| S8 | Student joins late | Session still ends at the scheduled end; no refund | M | — |
| S9 | Mentor runs over time | No extra charge; next booking buffer protects the calendar | M | — |
| S10 | Session happened but both stay silent | Auto-complete at end + 72 h; payout released after hold | M | I |
| S11 | Student disputes a completed session after payout released | Allowed within 72 h window only (hold covers it); beyond → support ticket, goodwill only | M | I |
| S12 | Group session: mentor no-show | Any participant's claim + no mentor signals → provisional no-show for all seats | M | I |

## 7. Communication & notifications

| # | Scenario | Expected behaviour | Phase | Test |
|---|----------|-------------------|-------|------|
| N1 | Email delivery failure (bounce/quota) | In-app notification remains; retry with backoff; hard bounce marks email unverified-for-sending and prompts the user in-app | M | I |
| N2 | Email quota exhausted (free tier) | Prioritise transactional (verification, confirmations) over reminders/digests; alert at 80% | M | I |
| N3 | Reminder queued, then booking rescheduled | Worker re-validates → stale reminder skipped | M | I |
| N4 | User disables email notifications | Security and transactional emails (booking confirmations, refunds, security) still sent | M | U |
| N5 | Message contains a phone number pre-booking | Blocked with explanation | M | U |
| N6 | Message contains a UPI ID post-booking | Warning to sender; tip to recipient; flag for review | M | U |
| N7 | User blocks another user with a future booking | Messaging stops; booking remains (can cancel under policy; blocking after harassment report → moderator may cancel without penalty) | M | I |
| N8 | Conversation participant is banned | Thread locked; other party notified neutrally | M | I |

## 8. Reviews & content

| # | Scenario | Expected behaviour | Phase | Test |
|---|----------|-------------------|-------|------|
| R1 | Review is reported | Stays visible unless it violates policy; moderator decision | M | I |
| R2 | Review posted then dispute opened | Review hidden until resolution | M | I |
| R3 | Mentor pressures student to change review | Reportable violation; trust event | M | P |
| R4 | Review contains contact info or PII | Held for moderation | M | U |
| R5 | Guide passes its review-due date | Outdated banner; editor queue | M | I |
| R6 | Official process changes (e.g. APS rules) | Editors update content, bump `last_verified_at`, notify subscribers (Beta) | M/B | P |
| R7 | Event recording contains a participant who didn't consent | Takedown on request; re-upload edited version | M | P |

## 9. Trust & safety

| # | Scenario | Expected behaviour | Phase | Test |
|---|----------|-------------------|-------|------|
| X1 | Mentor claims emergency for a no-show | Excuse flow; accepted → points zero; excuse cap per 180 days | M | I |
| X2 | Student falsely reports mentor no-show repeatedly | Disputes resolved against student → trust events; pattern → case | M | I |
| X3 | Coordinated fake reports against a mentor | Report clustering by account age/network; single case; no automatic sanction from report count alone | M | P |
| X4 | Moderator makes a wrong ban | Appeal to a different reviewer; overturn excuses related events; audit | M | E |
| X5 | Minor-safety report | P0 queue; auto-restrict messaging 72 h pending review | M | I |
| X6 | Law-enforcement data request | Procedure: verify, minimum disclosure, log ⚖️ | M | P |
| X7 | Mentor soliciting off-platform payment in a public event chat (future feature) | Same detectors apply | F | U |

## 10. Platform & operations

| # | Scenario | Expected behaviour | Phase | Test |
|---|----------|-------------------|-------|------|
| O1 | Supabase free project paused | Uptime alert; resume; restore if needed | M | P |
| O2 | Job tick stops (pg_cron failure) | Lazy correctness keeps bookings safe; alert after 10 min; GitHub Actions cron as backup trigger | M | I/P |
| O3 | Deployment with a failed migration | Migration TX rolls back; deploy blocked; previous app version remains | M | P |
| O4 | Secrets leaked in a log/commit | Rotate; invalidate sessions if `AUTH_SECRET`; incident process | M | P |
| O5 | Framework critical CVE announced | Patch within 24 h; WAF rule if available; verify | M | P |
| O6 | DB approaching size quota | Alert at 70%; purge jobs; upgrade plan | M | P |
| O7 | Provider changes webhook payload format | Schema validation fails → events `failed` → alert; sweeper/reconciliation keeps money consistent meanwhile | M | I |
| O8 | Admin misconfigures a setting (e.g. 0-minute hold) | Range validation rejects; audit; revert by version | M | U |
