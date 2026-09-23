# 21 — Architecture Decision Records

Status: Draft v0.1 · 2026-09-17 · Format: Problem → Options → Trade-offs → Decision → Reason → Revisit when.

New ADRs are appended; superseded ADRs are marked, not deleted.

---

### ADR-001 — Modular monolith on Next.js (App Router) with TypeScript
- **Problem:** One small team, ₹0 budget, SEO-critical public pages, complex transactional domain.
- **Options:** (a) Next.js monolith; (b) SPA + separate API service; (c) microservices; (d) React Router v7 framework.
- **Trade-offs:** (a) single deploy, SSR, one language; framework churn and CVE exposure. (b) poor SEO, two deploys. (c) operational overload. (d) portable and simpler, smaller SEO ecosystem.
- **Decision:** (a), with a framework-independent domain layer and enforced module boundaries.
- **Reason:** fastest path to SEO + full-stack with an extraction path preserved.
- **Revisit when:** multiple teams need independent deploys, or framework constraints block runtime needs.

### ADR-002 — PostgreSQL as the single system of record; Drizzle ORM; no browser-side DB access
- **Problem:** Double-booking prevention, money integrity, relational taxonomy, search.
- **Options:** Postgres; Firestore; SQLite/D1; MongoDB.
- **Trade-offs:** Postgres offers exclusion constraints, transactions, FTS and check constraints. NoSQL options push invariants into application code.
- **Decision:** Postgres; Drizzle for typed queries + reviewed SQL migrations; all access server-side.
- **Reason:** Invariants enforced in the database; portable across vendors.
- **Revisit when:** never for the core; add specialised stores (search, cache, warehouse) alongside.

### ADR-003 — Supabase Free as MVP Postgres host (used as plain Postgres + S3 storage)
- **Problem:** ₹0 managed Postgres with storage and scheduling.
- **Options:** Supabase Free; Neon Free; self-host; Firebase.
- **Trade-offs:** Supabase gives always-on compute while active, bundled storage and `pg_cron`/`pg_net`, but pauses after 7 idle days and has no backups. Neon gives a 6 h restore window and branching, but compute-hour limits conflict with minute-level job ticks and it has no storage.
- **Decision:** Supabase Free (region Mumbai) with the Data API disabled, `app` schema, no Supabase Auth; nightly encrypted offsite dumps. Neon is the documented alternative.
- **Reason:** Fewest vendors for MVP; exit cost ≈ 1–2 days.
- **Revisit when:** live money (→ paid plan with PITR) or if pausing/limits hurt the beta.

### ADR-004 — Better Auth for authentication (database sessions)
- **Problem:** Secure auth with instant revocation for bans, no per-user cost, data ownership.
- **Options:** Better Auth; Supabase Auth; Auth.js; Clerk; Firebase Auth.
- **Trade-offs:** Better Auth: we own more security surface, library risk. Supabase Auth: JWT revocation lag, vendor schema. Auth.js: maintenance mode (Sep 2025). Clerk: vendor lock-in, cost at scale.
- **Decision:** Better Auth with DB sessions, Argon2id, TOTP, strict config, pinned versions.
- **Reason:** Revocation semantics match T&S needs; zero marginal cost; portable.
- **Revisit when:** enterprise SSO needs exceed plugin capabilities, or a serious unpatched vulnerability appears.

### ADR-005 — Payment provider abstraction with Razorpay Route as primary; FakeGateway for dev/tests
- **Problem:** Marketplace split payments in India under RBI PA rules; ₹0 development; testable failure modes.
- **Options:** Razorpay Route; Cashfree Easy Split; Stripe Connect; collect-then-payout from own account.
- **Trade-offs:** Stripe India is invite-only and doesn't support the needed marketplace flows for Indian platforms. Collect-then-payout risks unauthorised payment aggregation. Razorpay/Cashfree both provide split settlement; Razorpay documents transfer holds and reversals publicly.
- **Decision:** `PaymentGateway` port; Razorpay adapter (test mode) + FakeGateway; Cashfree as fallback adapter.
- **Reason:** Compliant funds flow, hold-until-delivered payouts, free test mode.
- **Revisit when:** international users/mentors (→ additional provider/entity), or Route terms/pricing change.

### ADR-006 — Double-booking prevention via exclusion constraint + transactional holds with TTL
- **Problem:** Concurrent bookings of the same slot; payment latency.
- **Options:** (a) app-level check-then-insert; (b) `SERIALIZABLE` transactions; (c) advisory locks only; (d) GiST exclusion constraint on active calendar blocks + hold state; (e) Redis locks.
- **Trade-offs:** (a) racy. (b) retries and complexity. (c) correct but easy to misuse. (e) extra infra with expiry pitfalls. (d) enforced by the DB regardless of code paths.
- **Decision:** (d), plus an advisory lock per mentor-local day for the max-per-day rule, lazy hold expiry inside the booking TX, and a late-payment re-acquire-or-refund path.
- **Reason:** Strongest guarantee with the least infrastructure.
- **Revisit when:** sharding the booking store (unlikely before very large scale).

### ADR-007 — Transactional outbox + tick endpoint for background work
- **Problem:** Emails, reminders, sweepers and webhooks processing without paid queues.
- **Options:** Host cron only; external queue (QStash/Inngest); outbox table + scheduler ping; in-process timers.
- **Trade-offs:** Outbox gives atomicity with state changes, but latency depends on tick frequency. External queues add a vendor. Timers are unreliable on serverless.
- **Decision:** Outbox table with `SKIP LOCKED` workers triggered by `pg_cron`+`pg_net` (and a GitHub Actions backup trigger). Correctness never depends on tick timing.
- **Reason:** Zero extra vendors; exactly-once-effect semantics with idempotent handlers.
- **Revisit when:** oldest-due job age > 5 min at peak (→ queue + worker).

### ADR-008 — Asynchronous booking-scoped messaging (no real-time chat in MVP)
- **Problem:** Communication needs vs complexity and moderation burden.
- **Options:** Real-time chat (WebSockets/Realtime service); async threads with email notifications; no messaging.
- **Trade-offs:** Real-time adds infra, presence, moderation at speed. No messaging hurts intake and logistics.
- **Decision:** Async threads tied to bookings + limited pre-booking inquiries; in-app notifications + email.
- **Reason:** Covers intake/logistics; simpler moderation; supports circumvention controls.
- **Revisit when:** measured demand (support tickets, NPS verbatims) for real-time.

### ADR-009 — Mentor-provided meeting links via a MeetingProvider port
- **Problem:** Video sessions without building video infrastructure.
- **Options:** Build WebRTC; embed Jitsi public (5-min embed limit, auth requirement); third-party SDK (paid per MAU); mentor-provided links; Google Meet API.
- **Trade-offs:** Links are simple but weak attendance evidence and a phishing risk. Meet API needs sensitive-scope verification.
- **Decision:** Manual links with strict host allowlist + platform join redirect (attendance signal); Google Meet/Zoom adapters in Beta.
- **Reason:** ₹0, no infrastructure, extensible.
- **Revisit when:** dispute rates show attendance evidence is insufficient.

### ADR-010 — Portable hosting; Vercel Hobby only for dev previews; public host chosen at Phase 15
- **Problem:** No ₹0 host is both commercial-use-compliant and ideal for full Next.js SSR.
- **Options:** Vercel Hobby (non-commercial); Netlify Free (commercial OK, hard cap); Cloudflare Workers Free (3 MiB limit); Render Free (sleeps); paid hosts.
- **Trade-offs:** See [04 §4.2](04-system-architecture.md#42-hosting-app-runtime).
- **Decision:** Keep the build vendor-neutral; defer the public host decision to measured bundle/traffic data; real money requires a paid commercial plan.
- **Reason:** Avoid premature lock-in and terms violations.
- **Revisit when:** Phase 15.

### ADR-011 — 18+ only in MVP; configurable age policy
- **Problem:** Minors in 1:1 mentoring raise DPDP verifiable parental consent obligations and child-safety risks.
- **Options:** Allow all ages; allow 16+; 18+ with future guardian flow.
- **Trade-offs:** Excluding minors reduces the market (some undergrad applicants), but avoids unmanaged legal/safety risk.
- **Decision:** 18+ gate; `age_policy.min_age` per country; guardian-consent design in Future.
- **Reason:** Safety and compliance first.
- **Revisit when:** guardian flow designed + counsel sign-off.

### ADR-012 — Scoped evidence badges instead of generic "Verified" levels
- **Problem:** Verification labels that users over-trust, with misrepresentation risk.
- **Options:** Tiered "Verified" labels; scoped badges; no badges.
- **Decision:** Scoped, dated, method-specific badges; internal levels only for rules/filters.
- **Reason:** Accuracy, user understanding, legal risk reduction.
- **Revisit when:** third-party verification partners provide stronger identity/credential proofs.

### ADR-013 — Money as integer minor units + currency; double-entry ledger; snapshots
- **Problem:** Correct commission, refunds, reversals, taxes, multi-currency readiness.
- **Options:** Floats/decimals on booking rows; `numeric` columns; integer minor units + ledger.
- **Decision:** `bigint` minor units + ISO 4217; append-only double-entry ledger with DB-enforced balance; commission/policy snapshots per order item.
- **Reason:** Exactness, auditability, reconciliation.
- **Revisit when:** never for the core; the ledger may move to a dedicated service at scale.

### ADR-014 — Postgres full-text + trigram search with denormalised documents
- **Problem:** Multi-filter mentor discovery at ₹0.
- **Options:** Postgres FTS; Meilisearch/Typesense (hosting cost); Algolia (free tier limits, vendor).
- **Decision:** Postgres FTS + `pg_trgm` + GIN array filters on `mentor_search_documents`.
- **Reason:** No extra infra; document shape is reusable by an engine later.
- **Revisit when:** search p95 > 300 ms, or relevance needs (typo tolerance/facets) exceed Postgres.

### ADR-015 — REST (not GraphQL) with OpenAPI generated from zod
- **Problem:** API style for web now and mobile/partners later.
- **Decision:** Versioned REST; problem+json errors; cursor pagination; idempotency keys.
- **Reason:** Simpler authorization testing, caching, webhooks; see [06 §1](06-api-design.md#1-style-decision-rest-not-graphql).
- **Revisit when:** many heterogeneous clients need flexible aggregation.

### ADR-016 — Trust & safety policy engine as data, human-in-the-loop for severe actions
- **Problem:** Fair, adjustable enforcement (no-shows, misconduct) without hard-coded punishments.
- **Options:** Hard-coded thresholds; fully automated scoring; rules-as-data with human review.
- **Decision:** Trust events with points/decay/excuses; versioned rules proposing actions; auto-apply only low-severity, time-boxed restrictions; suspensions/bans need moderators (+ second reviewer for permanent bans); appeals.
- **Reason:** Fairness, configurability, alignment with GDPR Art. 22 principles and IT Rules grievance obligations.
- **Revisit when:** volume requires ML triage (assistive only).

### ADR-017 — Work-eligibility-aware mentor modes (volunteer vs paid)
- **Problem:** Current international students may be legally barred from paid self-employment.
- **Options:** Ignore (user responsibility only); ban current students; attestation + volunteer mode + evidence for paid.
- **Decision:** Attestation per country/status; volunteer default for restricted statuses; per-country rules configurable as counsel confirms.
- **Reason:** Protects mentors and the platform while keeping authentic supply.
- **Revisit when:** counsel confirms country-specific rules.

### ADR-018 — Data residency: primary DB and logs in India (Mumbai region)
- **Problem:** Latency for Indian users; CERT-In log requirements; DPDP posture.
- **Decision:** Supabase `ap-south-1`; host functions region closest to Mumbai where configurable; processors outside India documented.
- **Reason:** Performance + compliance posture.
- **Revisit when:** EU expansion (regional residency).

### ADR-019 — Mutations through REST route handlers; no Server Actions by default
- **Problem:** Next.js Server Actions are public endpoints that are easy to leave unauthorised, and they duplicate the API surface.
- **Decision:** All mutations go through `/api/v1` handlers with shared authz/idempotency/rate limits; Server Actions disallowed by lint unless allowlisted with a review.
- **Reason:** One hardened mutation path; consistent tests (BOLA matrix).
- **Revisit when:** framework conventions offer equivalent centralised guards.

### ADR-020 — Brand name isolated in configuration
- **Problem:** Temporary brand ("Aheadly") likely to change.
- **Decision:** Brand name, domain, colours, emails and legal entity name live in `src/config/brand.ts` and settings; no brand strings in schema, routes, cookie names (prefix from config) or code identifiers.
- **Reason:** Rename = config change + asset swap.
- **Revisit when:** final brand chosen.

### ADR-021 — Two-tier Content Security Policy (Phase 4)
- **Problem:** Nonce-based strict CSP requires dynamic rendering of every page, which defeats static/ISR SEO pages (docs/22 §10); a permissive CSP weakens XSS defence on authenticated pages.
- **Options:** (a) nonces everywhere (all pages dynamic); (b) experimental SRI hash-based CSP; (c) baseline CSP for all routes + strict nonce CSP only for authenticated dynamic areas.
- **Decision:** (c). All routes get a baseline policy from `next.config.ts` (`object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, `form-action 'self'`, self-only sources; scripts still allow `'unsafe-inline'`). Phase 5 adds a nonce-based policy via `proxy.ts` for `/dashboard` and `/admin`. SRI is re-evaluated once it is stable.
- **Reason:** Keeps SEO pages static while protecting the pages that handle personal data and money; public pages render no user-generated HTML in MVP.
- **Revisit when:** SRI leaves experimental status, or public pages start rendering user-generated content.

### ADR-022 — Toolchain baseline: Node 24 LTS, npm install-script denial, architecture tests over lint plugins (Phase 4)
- **Problem:** The machine had Node 23 (end-of-life, unsupported by Vitest 5); npm packages can run arbitrary install scripts; boundary rules need enforcement.
- **Decision:** Pin Node 24 LTS (`.nvmrc`, `engines`); keep npm 11's `allowScripts` denials for `esbuild` and `unrs-resolver` (both work without postinstall); enforce module boundaries, no Server Actions, public-env allowlist, raw-SQL timestamp handling and `sql.raw` confinement with fast Vitest architecture tests (`tests/architecture`) instead of adding `eslint-plugin-boundaries`/dependency-cruiser.
- **Reason:** Supported runtime, smaller supply-chain surface, fewer dependencies, rules that are easy to read and extend.
- **Revisit when:** The boundary rules become complex enough that a dedicated tool is clearer.

### ADR-023 — Auth core built directly on the platform pipeline instead of the Better Auth library (Phase 5, supersedes ADR-004)
- **Problem:** ADR-004 chose Better Auth for DB-backed sessions, Argon2id and TOTP. By Phase 5, the platform layer already had its own hashed-token sessions primitive (`crypto.ts`), audit log, rate limiter, idempotency layer and a single request pipeline (`defineRoute`) that gives every route CSRF checks, structured errors and audit hooks for free. Better Auth is designed to own its own route handler, cookie lifecycle and generated schema, which would mean either running two parallel request pipelines with different error/audit/CSRF behaviour, or fighting the library's assumptions to bolt it onto ours.
- **Options:** (a) mount Better Auth's catch-all handler alongside `defineRoute`; (b) call Better Auth's programmatic `auth.api.*` methods from inside our own routes; (c) implement the docs/07 spec directly against the platform's existing primitives.
- **Trade-offs:** (a) two error formats, two CSRF stories, two audit paths. (b) still adopts Better Auth's table shapes and session/cookie assumptions for no real savings, since every primitive it would provide (Argon2id, hashed sessions, TOTP, rate limiting) already existed in the platform layer from Phase 4. (c) more code written by us, and we own patching it if a flaw is found — the risk ADR-004 originally weighed against Better Auth, now taken on directly instead of inherited from a dependency.
- **Decision:** (c). `src/server/modules/auth` implements sign-up/verify/sign-in/MFA/password-reset/email-change/Google OAuth directly, using `@node-rs/argon2` for hashing and `jose` for Google's JWKS/id_token verification as the only new dependencies. Every behaviour in docs/07 (session lifetimes, step-up window, no-enumeration responses, pre-hijack defence, backup codes) is implemented and integration-tested as written; none of it changed to fit a library.
- **Reason:** One request pipeline, one error format, one audit trail, no second table-ownership model to reconcile with the `app` schema's UUIDv7/audit/settings conventions.
- **Revisit when:** the auth surface grows enough (passkeys, SSO, more OAuth providers) that hand-writing each flow costs more than adapting a library would.

### ADR-024 — HIBP breach checking and Turnstile CAPTCHA both fail open or are deferred, not blocking (Phase 5)
- **Problem:** docs/07 §4 asks for a Have I Been Pwned breach check and Turnstile-gated sign-in throttling. Both are third-party dependencies the app doesn't control.
- **Decision:** HIBP's k-anonymity range API needs no account or key, so it is implemented now (`infra/hibp-checker.ts`) and explicitly **fails open** (treats the password as clean) on any network error, per docs/07. Turnstile needs a registered site key tied to a real domain, which doesn't exist yet at $0 budget — it is deferred; the account- and IP-scoped rate limits already on `sign-up`/`sign-in`/`password-reset` stand in for it until a domain exists.
- **Reason:** Ship the check that's free and available now; don't block on infrastructure that can't exist yet, and don't let an optional check ever turn into an outage.
- **Revisit when:** a real domain exists to register Turnstile against.

### ADR-025 — Cross-module listing state: verification pushes a count, profiles owns the recompute (Phase 6)
- **Problem:** Whether a mentor is publicly listed depends on facts two different modules own: `profiles` owns the application status, `verification` owns credentials. `profiles` cannot import `verification` (verification already depends on profiles for affiliations — the reverse import would be circular), so `profiles` cannot count credentials itself when its own edits (bio, expertise, affiliations) need to recompute listing state.
- **Options:** (a) let `verification` import `profiles` in both directions (circular); (b) merge the two modules; (c) denormalise the credential count onto `mentor_profiles`, owned by `profiles`, updated only by `verification` calling an exported `profiles` function; (d) recompute listing from a live cross-module query at read time, outside either module (e.g. in route handlers).
- **Trade-offs:** (a) breaks the module-boundary architecture test and creates a real circular dependency, not just a lint violation. (b) throws away the credential/affiliation domain separation docs/05 and docs/10 both model as distinct. (d) works for a single profile page but doesn't help `profiles`' own mutations (editing a bio) know whether to keep a mentor listed, so an edit could silently un-list a verified mentor.
- **Decision:** (c). `mentor_profiles.active_credential_count` is written only through `profiles`' own `recomputeListingEligibility`, which the `verification` module calls (through `profiles`' public index) with a freshly counted value whenever a credential is issued or revoked. When `profiles` itself calls the same function after an unrelated edit, it omits the count and the last persisted value is reused — an edit can never accidentally guess wrong and un-list someone.
- **Reason:** Keeps the dependency graph a DAG (`verification → profiles`, never the reverse), keeps each module the sole writer of its own tables, and makes a real bug class (routine edits resetting verification state) structurally impossible rather than something a test has to catch.
- **Revisit when:** a third module needs to influence listing (e.g. trust & safety restrictions in Phase 10) — likely the same push-a-fact-in pattern, not a new exception.

### ADR-026 — University/company reference data is hand-curated, not a live ROR/GeoNames importer (Phase 6)
- **Problem:** docs/19's original Phase 6 scope called for "universities/cities import scripts (ROR + GeoNames + domains)". Building a real importer means alias reconciliation, dedup against admin edits (the seed is designed to never overwrite them, per docs/05 §8), and handling ROR's and GeoNames' data quirks — a distinct piece of engineering from the marketplace features this phase is about.
- **Decision:** Seed a hand-curated, factually-checked set (29 real universities and 9 real companies for India and Germany, with real institutional email domains, following the exact `slugify`/idempotent-insert pattern Phase 4 already established for countries and the category taxonomy) instead. Admins can extend it the same way Phase 4's taxonomy is extended — the schema (`ror_id`, `merged_into_id`, alias table) is already shaped for a future importer to fill in.
- **Reason:** Ships real, correct, verification-usable data now (the email-challenge flow needs accurate domains to mean anything) without deferring the entire phase behind an importer that's genuinely separate work.
- **Revisit when:** launch countries expand beyond India/Germany, or the curated list's maintenance burden exceeds writing the importer.

### ADR-027 — No-double-booking guarantee lives in a hand-written GiST exclusion constraint, not application code (Phase 7)
- **Problem:** docs/05 §4.1 specifies `calendar_blocks` must guarantee no two active blocks for the same mentor ever overlap, independent of isolation level or application bugs. Drizzle ORM (0.45) has no first-class `EXCLUDE USING gist` builder, so `drizzle-kit generate` cannot express this constraint from the table definition alone.
- **Options:** (a) enforce uniqueness only in application code (check-then-insert inside the booking transaction); (b) hand-write the whole `calendar_blocks` table as a custom migration, bypassing `drizzle-kit generate` for it entirely; (c) let `drizzle-kit generate` create the table and columns normally (including a `tstzrangeColumn` custom type for `during`), then add the `EXCLUDE` constraint and its supporting range-validity `CHECK` via one hand-written follow-up migration (`drizzle-kit generate --custom`), matching the precedent already set for triggers/functions in `0002_platform_triggers.sql`.
- **Trade-offs:** (a) is exactly the race docs/09 §6.1's worked example (two students booking the same slot simultaneously) is designed to defeat — a check-then-insert has a race window no amount of application care closes without the database's own conflict detection. (b) works but loses `drizzle-kit`'s drift detection for every other column on the table for no reason, since only the exclusion constraint itself is inexpressible.
- **Decision:** (c). `src/server/modules/booking/infra/tables.ts` defines `calendar_blocks` normally (columns, indexes, the `source_type` check); `drizzle/0007_booking_calendar_exclusion.sql` is hand-written and adds `calendar_blocks_no_overlap EXCLUDE USING gist (mentor_id WITH =, during WITH &&) WHERE (active)` plus the range-sanity checks from docs/05 §4.1. Verified directly against Postgres (not just unit-tested): a manual overlapping insert during development failed with SQLSTATE `23P01` exactly as documented, and four dedicated concurrency integration tests (docs/13 §6) exercise the real constraint under 10–20 parallel transactions.
- **Reason:** The guarantee has to be real at the database layer — that's the entire point of docs/09 §6's design — and hand-writing only the one inexpressible piece keeps everything else on the generated-migration path with drift detection intact.
- **Revisit when:** a future Drizzle ORM version adds native range/exclusion-constraint support, at which point `0007` could be folded back into a regenerated definition (no behaviour change, just less hand-written SQL to maintain).

### ADR-028 — A `raw` escape hatch on the route pipeline for redirects and non-JSON bodies (Phase 7)
- **Problem:** `defineRoute` (docs/04, ADR-019) always encoded a handler's return value as JSON. Two real Phase 7 routes can't use that: `GET /sessions/:id/join` must return a `302` redirect to the mentor's meeting URL (never exposed to the client as JSON, per docs/09 §12), and `GET /bookings/:id/calendar.ics` must return `text/calendar`, not `application/json`.
- **Options:** (a) write these two routes as plain Next.js route handlers outside `defineRoute`, re-implementing actor resolution, CSRF and logging by hand; (b) add an optional `raw?: Response` field to `RouteResult` that, when set, bypasses `jsonResponse()` entirely and is returned as-is (still going through the same actor/CSRF/idempotency/logging pipeline first).
- **Trade-offs:** (a) duplicates security-relevant pipeline logic in exactly the two places where getting it wrong matters most (a join redirect is an authorization-gated action; forgetting the actor check would leak meeting links). (b) is a small, generic addition every future non-JSON route benefits from, not a one-off hack for these two routes.
- **Decision:** (b). `RouteResult.raw` short-circuits just before JSON encoding in `route.ts`; everything before that point (params/body validation, actor resolution, CSRF, rate limiting, idempotency) runs exactly as for any other route, and the request is still logged.
- **Reason:** Keeps "every API route goes through one pipeline" true without forcing every response onto one wire format, and the two routes that need it are both auth-gated (join) or owner-gated (ICS), so they need the full pipeline more than most.
- **Revisit when:** a third distinct non-JSON case appears (e.g. streaming) — confirms this is a pattern worth a cleaner named helper rather than a single generic escape hatch.
