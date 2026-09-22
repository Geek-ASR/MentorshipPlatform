# 19 — MVP Roadmap

Status: Draft v0.1 · 2026-09-17 · Phases 0–3 (Discovery, Research, Architecture, UX) are **complete as documents** in this `docs/` folder.

Principles: build incrementally; keep the app runnable after each phase; tests with every phase; security review continuously; no phase is "done" without meeting its exit criteria. Relative size: S (days), M (1–2 weeks), L (2–4 weeks) for a single developer with AI assistance. These are rough and will be re-estimated after Phase 4.

## Phase overview

```mermaid
flowchart LR
  P4[4 Foundation · M] --> P5[5 Auth · M]
  P5 --> P6[6 Core marketplace · L]
  P6 --> P7[7 Booking + messaging · L]
  P7 --> P8[8 Payments · L]
  P8 --> P9[9 Groups & events · M]
  P7 --> P10[10 Trust & safety + reviews · L]
  P8 --> P10
  P10 --> P11[11 Admin · M]
  P6 --> P12[12 Content & SEO · M]
  P11 --> P13[13 Testing hardening · M]
  P12 --> P13
  P13 --> P14[14 Security review · M]
  P14 --> P15[15 Deploy sandbox beta · S]
  P15 --> P16[16 Production hardening plan · S]
```

## Phase 4 — Foundation (M) ✅ complete (2026-09-17)

**Delivered**
- Next.js 16 (App Router, Turbopack) + TypeScript strict (`noUncheckedIndexedAccess`); ESLint (Next core-web-vitals + TypeScript + `sql.raw` interpolation ban), Prettier; `@/` and `@tests/` aliases; Node 24 LTS pinned.
- Platform primitives in `src/server/platform`: zod env validation (fail-fast via `instrumentation.ts`), pino logger with redaction, request context, typed errors → RFC 9457 problem+json, Drizzle/postgres.js client, `Clock`, authz (`Actor`, capability restrictions, composable guards, `authorize`), hash-chained append-only audit log, transactional outbox (claim with `SKIP LOCKED`, backoff, stale-lock reclaim, recurring jobs), idempotency keys (replay / mismatch / in-progress / stale takeover), Postgres fixed-window rate limiter, versioned settings + feature flags (audited), `defineRoute` HTTP pipeline (request id, same-origin CSRF check, JSON-only bodies with streaming size limit, validation, rate limit, idempotency, safe errors).
- Migrations: extensions, `app` schema, platform + reference tables with CHECK constraints, triggers (`updated_at`, append-only guard, audit hash chain + `app.verify_audit_chain()`).
- Idempotent reference seed: 250 countries (10 study-abroad destinations enabled), 12 currencies, 70-term two-section category tree (visa topics flagged as personal-experience).
- API: `/api/health`, secret-protected `/api/health/ready`, `/api/internal/jobs/tick`, problem+json 404 for unknown API paths.
- UI foundation: light/dark tokens, Instrument Sans + Source Serif 4 via `next/font`, Button, Badge, Card, Container, Skeleton, EmptyState, ErrorState, Logo, site header/footer, skip link; honest foundation home page; 404, error and global-error boundaries; non-production `robots.txt` disallow.
- Security headers + enforced baseline CSP (ADR-021); `X-Robots-Tag: noindex` outside production.
- Tests: Vitest unit + architecture tests (42), integration tests on throwaway databases cloned from a migrated template (43), Playwright E2E with axe (11 passing + 1 skipped for mobile keyboard).
- CI (GitHub Actions, actions pinned to SHAs): format, lint, typecheck, unit, integration (Postgres service), build + E2E, gitleaks, `npm audit`. Dependabot for npm and actions.
- Repo files: `CONTRIBUTING.md` (setup and engineering rules), `SECURITY.md`, `LICENSE` (proprietary, all rights reserved), `.env.example`, `.nvmrc`, `AGENTS.md`/`CLAUDE.md`. `README.md` is written by the maintainer.

**Deviations from plan:** module boundaries are enforced by architecture tests instead of `eslint-plugin-boundaries` (ADR-022); the CSP is an enforced baseline rather than report-only, with a strict nonce policy for authenticated areas moved to Phase 5 (ADR-021); form components (Input, Select, Dialog, Toast) move to Phase 5, where the first forms are built.

**Exit criteria (met):** `npm run dev`/`build`/`start` work against local Postgres; unit, integration and E2E suites green; outbox exactly-once, idempotency replay and audit-chain verification covered by integration tests; cross-module imports blocked by architecture tests.

## Phase 5 — Authentication (M)

**Status:** ✅ complete (2026-09-22). `src/server/modules/auth` — email/password sign-up with 18+ attestation and versioned Terms/Privacy consent; single-use hashed email-verification, password-reset, email-change and email-change-revert tokens; Argon2id (`@node-rs/argon2`, m=19 MiB t=2 p=1) with automatic rehash-on-login and a timing-equalised dummy hash for unknown accounts; DB-backed sessions (`__Host-` cookie prefix in production, sliding idle + absolute lifetimes, a much shorter lifetime for staff roles); account- and IP-scoped sign-in throttling; TOTP MFA (RFC 6238, verified against the published test vectors) with 10 hashed single-use backup codes and replay protection; Google OAuth (Authorization Code + PKCE + nonce, via `jose` against Google's live JWKS) with the pre-hijack defence from docs/07 §3.3 (a verified Google identity takes over an unverified local credential account rather than creating a duplicate); HIBP k-anonymity breach checking (fails open); step-up (`requireRecentUserAuth`) guarding password/email change, MFA enrolment/disable and "sign out everywhere"; sessions list + revoke-all; roles table with `student` auto-granted at sign-up; auth audit events on every sensitive action; a console email adapter delivered through the Phase 4 transactional outbox.

**Deviations from the original plan, decided and recorded as ADRs:** the auth core is hand-written directly on the platform's request pipeline instead of the Better Auth library (**ADR-023**), so every auth route gets the same CSRF/audit/error handling as the rest of the app instead of a second, library-owned request path. Turnstile is deferred — no domain exists yet to register a site key against — with the account/IP rate limits standing in until then (**ADR-024**). Passkeys stay Beta-deferred as originally planned. The nonce-based strict CSP that ADR-021 pencilled in for Phase 5 is also deferred: there is still no dashboard or admin UI for it to apply to (this phase shipped API routes only, no pages), so it moves to whichever phase first renders an authenticated page.

**Tested:** 23 new unit tests (RFC 6238 TOTP vectors, RFC 4648 base32 vectors, password policy, session lifetime rules) and 31 new integration tests against a real Postgres — sign-up enumeration safety, token single-use and expiry, sign-in throttling and generic-error timing safety, session lifecycle (list/current-flag/revoke-all), password reset revoking every session, authenticated password change keeping the acting session while revoking the rest, step-up rejection on a stale session, email change requiring confirmation before it applies and the old address's undo link, full MFA enrol → sign-in-with-code → replay-rejected cycle, backup-code single-use, and all three Google OAuth account-resolution paths (new account, automatic linking, pre-hijack takeover) plus state-mismatch CSRF rejection and unverified-Google-email rejection — all with the network calls (HIBP, Google) mocked so CI never depends on a live third party. 139 tests total pass (unit + integration + architecture); `npm run build` produces all 20 routes; a manual smoke test against the production build (`next start`) confirmed cookie flags, the outbox actually delivering a real console-adapter email, and `/me` round-tripping a live session.

**Known gaps, honestly stated:** "MFA required for staff" has no staff-only route to integration-test yet (no staff accounts or admin routes exist until Phase 11) — the underlying policy (`requireStaffWithMfa`) is unit-tested from Phase 4. Google-linked accounts don't get a TOTP step even if the same person is later granted a staff role, since Google's flow doesn't collect a second factor; this is a known limitation until staff onboarding (Phase 11) defines how staff accounts are created. "New device sign-in" email was explicitly marked Beta/risk-based in docs/07 and was not built. Rate limiting is Postgres fixed-window (already documented in Phase 4 as swappable for Redis at scale), applied per account and per IP as an approximation of the "progressive delay" docs/07 describes, not true exponential backoff per attempt.

**Exit criteria met:** auth test suite ([13 §4](13-testing-strategy.md#4-integration--api-test-inventory)) green including enumeration and pre-hijacking tests. The BOLA matrix framework itself is still Phase 6+ work (there is no `/me/*` resource-scoped route yet — `/me` returns only the caller's own data with no path parameter to enumerate), so that half of the original exit criterion is carried forward rather than met early.

## Phase 6 — Core marketplace (L)

**Scope:** student profile with visibility; mentor application → approval (minimal admin screen); mentor profile (affiliations, expertise, languages, links); eligibility attestation + volunteer/paid mode; universities/cities import scripts (ROR + GeoNames + domains) for the launch countries (India, Germany first); verification (university/work email challenge; document upload via `ObjectStore` with a local filesystem adapter in dev); credentials + badges; `mentor_search_documents` builder; explore page with filters and explainable ranking; mentor profile page (SSR, metadata, structured data); saved mentors; "help me choose" questionnaire.

**Exit criteria:** a seeded mentor can be approved, verified and found by university/category/price/language filters; profile pages pass Lighthouse budgets; search queries use indexes (EXPLAIN tests).

## Phase 7 — Booking & messaging (L)

**Scope:** scheduling settings, availability rules/exceptions UI (mentor-local); slot generation API (DST fixtures); booking transaction with holds + exclusion constraint + lazy expiry; booking state machine; free 1:1 booking end-to-end; cancellation quotes and cancellations (money effects stubbed until Phase 8); reschedule flows; meeting link validation + join redirect; ICS generation; reminders via outbox; attendance check-in, claims, finaliser; booking-scoped messaging (async threads) + in-app notifications center; student and mentor booking dashboards.

**Exit criteria:** concurrency test suite ([13 §6](13-testing-strategy.md#6-concurrency-tests)) green; E2E E1/E2 (with free booking) green; DST unit fixtures green.

## Phase 8 — Payments (L)

**Scope:** orders, order items, payment intents/payments state machines; commission engine; FakeGateway + dev checkout page + signed webhooks; webhook receiver (verify → inbox → outbox processing); client confirm path; payment sweeper; orphan handling + auto-refund; refunds; payout accounts (fake onboarding) and transfers with holds/release/reversal; double-entry ledger + invariants; reconciliation job (fake provider); Razorpay adapter (test mode: orders, checkout, webhooks, refunds, Route transfers where test mode supports it); receipts (HTML/PDF) with invoice sequences (sandbox); money views for students and mentors (payments, refunds, earnings).

**Exit criteria:** failure matrix ([08 §11](08-payment-architecture.md#11-failure-scenario-matrix-payment-concurrency-brief-38)) covered by integration tests; ledger invariants hold after randomised scenario tests (property-based sequences of pay/cancel/refund/dispute); E2E E2–E5 with fake payments green; Razorpay test-mode happy path verified manually on staging.

## Phase 9 — Group sessions & free events (M)

**Scope:** group session creation (seat pricing helper, min/max, deadlines), seat booking TX, min-participants check job with refunds, waitlist offers/claims, free events (registration, capacity, auto-promotion, visibility, invites), recordings, event pages (SEO + `Event` structured data), event no-show tracking.

**Exit criteria:** E2E E7/E8 green; capacity concurrency test green.

## Phase 10 — Trust & safety + reviews (L)

**Scope:** reports; moderation cases + timeline; trust events + policy rules (seeded defaults); policy evaluator; restrictions enforced via `authorize()`; enforcement actions + notifications; appeals; disputes + evidence + resolution with money effects; contact-info/payment detectors in messaging and profiles; claim-phrase detection; block user; reviews (eligibility, publication checks, holds, mentor responses, reporting, Bayesian ranking input); reliability metrics on profiles.

**Exit criteria:** E2E E9/E10 green; policy engine unit suite green; auto actions limited to low severity (test asserts suspensions/bans are never auto-applied).

## Phase 11 — Admin dashboard (M)

**Scope:** staff shell with MFA/step-up; overview metrics; users & mentors management; verification queue with audited document viewing; bookings/payments/refunds/transfers/reconciliation views and actions (4-eyes thresholds); webhook & outbox inspectors with retry; disputes, reports, cases, appeals queues; taxonomy/countries/cities/universities (merge)/programs CRUD; events management; settings & commission rules & policy rules editors (versioned, reasons); feature flags; audit log viewer; ops monitors page; basic analytics funnels.

**Exit criteria:** every admin action audited (integration test sweeps the admin route inventory); BOLA/BFLA matrix covers staff roles; E2E E11 green.

## Phase 12 — Content & SEO (M)

**Scope:** articles/guides with source metadata, last-verified dates, intake, disclaimers, review-due queue; country, city and university landing pages (quality thresholds for indexing); section hubs; sitemaps (index + per type), robots.txt, canonical rules, Open Graph images, structured data (`Organization`, `WebSite`, `BreadcrumbList`, `CollegeOrUniversity`, `Event`, `Article`); legal pages (draft Terms, Privacy, Refund, Community Guidelines, Grievance). **Community Q&A is deferred to Beta** (moderation load + UGC legal exposure; not needed for liquidity at launch).

**Exit criteria:** Lighthouse SEO ≥ 95 on sample pages; structured data validates; no thin pages indexed (test on seed data).

## Phase 13 — Testing hardening (M)

**Scope:** fill gaps in the test inventory; full E2E suite across browsers; mobile viewport runs; accessibility audit fixes (keyboard, screen reader spot checks with VoiceOver/NVDA); performance budgets; load test on staging (k6); chaos-style tests (provider timeouts, webhook delays).

**Exit criteria:** all [13](13-testing-strategy.md) gates green for 7 consecutive nightly runs.

## Phase 14 — Security review (M)

**Scope:** ASVS 5.0 L2 checklist walk-through with evidence; threat model refresh; ZAP baseline + manual testing of authz, payments, uploads, CSRF, headers; dependency review; secrets review; logging review (no PII leaks); fix all critical/high findings; document accepted risks.

**Exit criteria:** zero open critical/high findings; accepted-risk register signed off by the founder.

## Phase 15 — Deploy sandbox beta (S)

**Scope:** host decision per [14 §3](14-deployment.md#3-hosting-decision-procedure-phase-15); Supabase staging (Mumbai) setup checklist; Razorpay test-mode webhooks; `pg_cron` tick; backups + restore drill; uptime + alerts; Sentry; invite-only beta (feature flag); beta feedback loop.

**Exit criteria:** staging runs 14 days with no P0/P1 alerts unresolved; restore drill passed; reconciliation shows zero unexplained items.

## Phase 16 — Production hardening plan (S)

**Scope:** consolidated gap list from [08 §13](08-payment-architecture.md#13-production-critical-gate-for-live-payments), [12 §16](12-privacy-compliance.md#16-compliance-checklist) and [14 §8](14-deployment.md#8-production-critical-launch-checklist-infrastructure); cost plan; legal/CA engagement checklist; go/no-go criteria for live payments.

**Exit criteria:** written go/no-go document; **live payments remain disabled** until all Production-critical items are complete.

## Founder action items (outside code)

| When | Action |
|------|--------|
| Before Phase 5 | Decide repo visibility + license; confirm brand working name |
| Phase 5 (optional) | Create Google OAuth client (basic scopes need no verification) |
| Before Phase 8 | Create a Razorpay account and generate **test** API keys (no KYC needed for test mode) |
| Before Phase 11 | Choose second admin/moderator (for 4-eyes); otherwise document single-staff mode |
| Before Phase 15 | Supabase account (staging project, Mumbai); Cloudflare account (Turnstile); Sentry account; offsite backup storage account; host account |
| Before public beta | Domain purchase (~₹1,000/yr); Resend domain verification; grievance officer designation; recruit 15–30 founding mentors |
| Before live money | Legal entity; Razorpay KYC + Route activation; lawyer + CA review; paid infrastructure |

## Readiness classification at end of Phase 15

| Capability | Classification |
|-----------|---------------|
| Auth, profiles, discovery, availability, booking, holds, double-booking prevention | **Beta** (functionally complete; free-tier infra) |
| Payments (fake + Razorpay test) | **MVP / sandbox**, *architecturally correct*, **not production-ready** until the live gate |
| Refund/payout/ledger/reconciliation | **MVP / sandbox**, needs provider live verification |
| Trust & safety tooling | **Beta** (needs staffing + counsel-reviewed policies) |
| Admin dashboard | **Beta** |
| Infrastructure (free tiers) | **MVP only, NOT for real money** |
| Legal documents | **Draft**, needs counsel |
| Backups | **MVP** (24 h RPO), **not production-ready** |

## Progress report template (end of each phase)

```
## Phase N report — <name> — <date>
Completed:
Tested: (suites, counts, notable cases)
Remaining:
Known issues:
Architectural decisions (links to ADRs added/changed):
Security concerns:
Next milestone:
```
