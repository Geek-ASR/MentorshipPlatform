# 13 — Testing Strategy

Status: Draft v0.1 · 2026-09-17

> "It compiles" is not done. A feature is done when its domain rules, authorization, failure paths and critical journey are tested and CI is green.

## 1. Test layers & tools

| Layer | Scope | Tooling | Runs |
|-------|-------|---------|------|
| **Unit (domain)** | Pure functions: pricing, commission, refund math, state machines, eligibility, slot generation, policy evaluator, detectors, validators | Vitest, fast-check (property-based) | Every commit (< 30 s) |
| **Integration (DB)** | Application services + real Postgres + fake adapters: transactions, constraints, idempotency, outbox, ledger | Vitest + local/CI Postgres 16 | Every PR |
| **API** | Route handlers end-to-end in-process (Request → Response) with real DB, auth cookies, schemas | Vitest + OpenAPI response validation | Every PR |
| **Contract** | PaymentGateway adapters against recorded provider fixtures; OpenAPI diff | Vitest, schema diff | Every PR |
| **E2E** | Critical user journeys in a real browser against a production build | Playwright (Chromium in CI; WebKit/Firefox nightly) | PR (smoke) + nightly (full) |
| **Accessibility** | Automated rules + keyboard flows on key pages | @axe-core/playwright | PR (smoke pages) |
| **Performance** | Web vitals budgets on public pages; API latency under load | Lighthouse CI; k6 (staging, manual/weekly) | PR (Lighthouse on preview), weekly |
| **Security** | Authz matrix, webhook forgery, injection corpus, headers, dependency and secret scans, DAST | Vitest, gitleaks, npm audit/OSV, OWASP ZAP baseline | PR + weekly |

## 2. Test environment

- **Database:** a template database with migrations + reference seed applied once per run. Each test worker gets its own `CREATE DATABASE … TEMPLATE` clone (fast, isolated, parallel-safe). Locally uses the installed Homebrew Postgres 16; CI uses a `postgres:16` service container with `btree_gist`, `pg_trgm` and `citext`.
- **Clock:** a `Clock` port with a controllable test clock. No `Date.now()` in domain or application code (lint rule).
- **Adapters:** FakeGateway (signed webhooks), in-memory EmailSender (captures messages), in-memory ObjectStore, no-op captcha (test key), fake MeetingProvider.
- **Data:** factories (`makeMentor`, `makeBooking`, …) and deterministic seeds. **Never** production data.
- **Isolation for concurrency tests:** real connections (not a single transaction wrapper), with separate DB per test file.

## 3. Unit test inventory (domain)

| Module | Cases (non-exhaustive) |
|--------|------------------------|
| Money | Minor-unit arithmetic; currency exponent 0/2/3; formatting per locale; no floats (property: `split(a) sums to a`) |
| Commission | Rule precedence (mentor > promotion > category > kind > global); validity windows; fixed + percent + caps; rounding goes to mentor; student-fee mode shown upfront; property: `commission + share == base`, `0 ≤ commission ≤ base` |
| Refund policy | Every window boundary (exactly 24 h, 23:59:59, 6 h); mentor cancel always 100%; technical failure; group minimum unmet; recompute split on partial refund; policy snapshot used, not current settings |
| Booking state machine | Every allowed transition; every disallowed transition throws `INVALID_STATE_TRANSITION`; late payment paths; idempotent re-application |
| Payment/refund/transfer state machines | Monotonic ranks; out-of-order events ignored; late success |
| Eligibility | Each check in [09 §5](09-booking-system.md#eligibility-checks-pure-domain-function-evaluatebookingeligibility) positive and negative |
| Slot generation | DST fixtures ([09 §3.3](09-booking-system.md#33-dst-edge-fixtures-unit-tests)); buffers; min notice; horizon; max per day by mentor-local date; exceptions; 30/45-min offset zones; property: no returned slot overlaps an active block |
| Policy engine | Windowed sums, counts, rate thresholds (min sessions), excused events, decay, idempotent proposals, probation halving |
| Attendance outcomes | Full matrix from [09 §11](09-booking-system.md#11-attendance--no-show-determination) |
| Detectors | Phone/email/UPI/URL/payment-keyword corpus incl. obfuscations ("nine eight…", "at okaxis"); false-positive corpus (times, prices, years); ReDoS timing guard (input 4,000 chars < 5 ms) |
| Validation | Meeting-link allowlist incl. `https://meet.google.com@evil.com`, punycode, IP literal, ports; `returnTo` open-redirect cases; slug rules |
| Markdown sanitisation | XSS payload corpus (OWASP XSS filter evasion cheat sheet samples) renders inert |
| ICS | RFC 5545 line folding, escaping, UID stability, SEQUENCE increments, UTC times |
| Verification | Domain matching (exact/subdomain, lookalikes, free-mail blocklist), expiry computation |

Coverage target: **≥ 90% lines/branches for `domain/` of money, booking, payments, trust-safety**; ≥ 80% overall domain; coverage is informative, not a substitute for the case lists above.

## 4. Integration & API test inventory

- **Auth:** sign-up generic response for existing email; verification token single-use/expiry; login throttling; session rotation; revocation on password reset; step-up enforcement; MFA required for staff; OAuth linking rules (pre-hijack scenario).
- **Idempotency:** same key + same body returns the stored response; same key + different body → 422; concurrent same key → one 201 + one 409/stored.
- **Booking TX:** stale hold lazily expired and slot re-bookable; max-per-day under concurrency (advisory lock); group capacity; unique active seat.
- **Payments:** confirm with a valid signature; mismatched order/amount rejected; duplicate webhook no-op; out-of-order webhooks; late capture → confirm or orphan refund; refund pending → processed; transfer release timing; reversal failure → receivable; ledger journals balance (DB trigger raises on imbalance); daily reconciliation detects injected mismatches.
- **Outbox:** job created only on commit (rolled-back TX leaves no job); retries with backoff; `SKIP LOCKED` prevents double processing with two workers; dedupe keys.
- **T&S:** trust events → proposals; auto restriction blocks capability via `authorize()`; appeal flow; conflict-of-interest guard.
- **Data rights:** export contains all user data classes and no one else's; deletion scrubs PII and preserves financial records.
- **Retention jobs:** documents deleted after 30 days; messages purged; legal hold respected.
- **Audit:** every admin/security/money action writes an audit row; the hash chain verifies; UPDATE/DELETE on audit/ledger denied for the runtime role.

## 5. Authorization (BOLA) matrix

A generated test suite enumerates **every route with a path parameter or resource body reference** (from the route inventory) and runs it as each actor:

| Actor | Expected |
|-------|----------|
| Anonymous | 401 (or 404 for public-invisible) |
| Owner / participant | 2xx |
| Other student | 404 |
| Other mentor | 404 |
| Mentor of the booking (for student-only actions) | 403 |
| Restricted owner (capability revoked) | 403 `ACCOUNT_RESTRICTED` |
| Moderator / verification_reviewer / finance / admin | Per [07 §6.2](07-authentication-authorization.md#62-permission-matrix-abridged) |
| Staff without MFA | 403 `MFA_REQUIRED` |
| Staff with a stale session for step-up routes | 401 `REAUTH_REQUIRED` |

The matrix is a **CI gate**: a new route without matrix entries fails the build (route inventory vs matrix config diff).

Property-level checks (API3): snapshot tests that public DTOs never include restricted fields (`email`, `birthYear`, `payout*`, `internalNotes`, `version`).

## 6. Concurrency tests

| Test | Method | Assertion |
|------|--------|-----------|
| Double booking (brief §37) | 20 parallel connections each run the booking TX for the same mentor and overlapping ranges (identical, partial overlap, buffer overlap) | Exactly 1 success; 19 `SLOT_UNAVAILABLE`; exactly 1 active block |
| Adjacent slots with buffer | Parallel bookings at 10:00–11:00 and 11:15–12:15 with 15 min buffer | Both succeed |
| Group capacity | 50 parallel seat requests for capacity 10 | Exactly 10 live seats |
| Max sessions per day | 10 parallel bookings on one mentor-local date with limit 4 | ≤ 4 succeed |
| Confirm vs cancel race | Parallel payment-success transition and student cancel | Final state consistent with one ordering; ledger balanced; no lost refund |
| Duplicate webhook storm | Same event delivered 10× concurrently | One transition, one journal |
| Refund double-submit | Two admins refund the same payment concurrently | Total refunded ≤ captured; second gets a conflict |
| Waitlist claim race | Two users claim one freed seat | One succeeds |
| Outbox multi-worker | 3 workers tick concurrently over 100 jobs | Each job processed exactly once |

Each concurrency test repeats 25× in CI nightly to catch flakiness.

## 7. E2E journeys (Playwright)

| # | Journey | Smoke (PR) | Nightly |
|---|---------|:---------:|:-------:|
| E1 | Sign up → verify email (captured) → set time zone → browse mentors | ✓ | ✓ |
| E2 | Search with filters → mentor profile → pick slot (student in `Asia/Kolkata`, mentor in `Europe/Berlin`) → fake checkout success → confirmation + ICS download | ✓ | ✓ |
| E3 | Payment fails then retries successfully within hold | | ✓ |
| E4 | Close browser mid-payment → webhook confirms → dashboard shows confirmed | | ✓ |
| E5 | Student cancels ≥ 24 h → full refund shown | ✓ | ✓ |
| E6 | Mentor onboarding: application → work-email verification → admin approval → availability → listed | | ✓ |
| E7 | Group session: 2 seats booked, minimum 3 → auto-cancel + refunds at check time (clock advanced) | | ✓ |
| E8 | Free event register → capacity full → waitlist → auto-promotion | | ✓ |
| E9 | Attendance: mentor no-show claim → provisional → uncontested → refund + trust event | | ✓ |
| E10 | Report message → moderator case → warning → user sees notice → appeal | | ✓ |
| E11 | Admin: change commission rule with step-up → new quote reflects it; old booking unchanged | | ✓ |
| E12 | Mobile viewport (Pixel 7, iPhone 14) booking flow | ✓ | ✓ |
| E13 | Keyboard-only booking flow | | ✓ |

## 8. Accessibility & UX quality tests

- axe-core on: home, explore, mentor profile, slot picker, checkout summary, dashboard, admin case view. **Zero serious/critical violations** gate.
- Keyboard traversal and focus-visible assertions for dialogs, menus, date/slot pickers.
- `prefers-reduced-motion` snapshot (no animations).
- Visual regression (Beta) for design-system components.

## 9. Performance tests

- **Lighthouse CI budgets** (mobile, throttled) on home, explore, mentor profile, university page: Performance ≥ 90, Accessibility ≥ 95, SEO ≥ 95, Best Practices ≥ 95; JS per route ≤ 170 KB gzip for public pages.
- **API latency** (k6 on staging, weekly): search p95 < 300 ms, availability p95 < 250 ms, booking create p95 < 400 ms at 20 RPS. Beyond MVP scale this is informative only, not a gate.
- `EXPLAIN (ANALYZE)` assertions in integration tests for search and availability queries on a seeded dataset (10k mentors, 200k bookings): no sequential scans on hot tables.

## 10. Security tests

| Test | Gate |
|------|------|
| BOLA/BFLA matrix | PR |
| Mass assignment: unknown fields rejected on all mutation routes | PR |
| Webhook: bad signature, modified body, replay, wrong environment secret | PR |
| Payment manipulation: amount/currency/order mismatch, signature from another order | PR |
| CSRF: missing/foreign `Origin`, `text/plain` and form content types rejected | PR |
| Open redirect corpus | PR |
| XSS corpus through bio, reviews, messages, event descriptions | PR |
| Upload: MIME spoofing (PHP/HTML renamed .png), SVG, oversized, polyglot JPEG/HTML | PR |
| Rate limits: sign-in, reset, booking, messages | PR |
| Enumeration: sign-up/reset/login responses identical for existing vs non-existing emails (body + status; timing within tolerance) | PR |
| Security headers & CSP present on sample routes | PR + deploy |
| Secrets: gitleaks | PR |
| Dependencies: `npm audit --audit-level=high`, OSV-Scanner | PR + daily |
| DAST: ZAP baseline on staging | Weekly |
| ASVS L2 manual checklist | Phase 14, pre-live |

## 11. CI pipeline gates

```
lint (eslint incl. boundaries, security, no-restricted-imports) ─┐
typecheck (tsc --noEmit strict) ─────────────────────────────────┤
unit (vitest domain) ────────────────────────────────────────────┤
integration + api + BOLA matrix (postgres service) ──────────────┼─► build (next build) ─► e2e smoke (playwright vs next start, fake gateway) ─► lighthouse (public pages)
security (gitleaks, npm audit, osv) ─────────────────────────────┤
openapi diff (breaking change check) ────────────────────────────┘
```

All jobs are required for merge to `main`. Nightly: full E2E (3 browsers), concurrency repeats, ZAP (weekly), backup restore drill (monthly job).

## 12. Definition of Done (per feature)

- [ ] Domain rules unit-tested, including boundaries and invalid transitions
- [ ] Integration tests for transactions/constraints touched
- [ ] Authorization matrix entries added for new routes
- [ ] Error cases return documented problem codes
- [ ] Audit events emitted for sensitive actions
- [ ] Loading, empty, error and success UI states implemented
- [ ] Accessible (keyboard, labels, contrast) and responsive
- [ ] Docs updated (API catalog, business rules, edge cases)
- [ ] No new dependency without justification; no secrets; CI green
- [ ] Self-review against the security checklist completed
