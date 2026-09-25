# Accepted Risk Register

Status: Phase 14 review · 2026-09-26 · **Founder sign-off: not yet obtained** — docs/19's Phase 14 exit criterion requires this register be "signed off by the founder," which is a real human action this document cannot perform on its own. Every entry below is engineering's assessment; the founder should read and explicitly accept (or reject and demand a fix for) each one before this phase is considered fully closed, the same honest posture Phase 13 took toward its own unmeetable-by-one-session exit criterion.

Severity follows a plain scale: **Critical** (exploitable now, causes major harm — money/data loss at scale), **High** (exploitable now, meaningful harm), **Medium** (real weakness, limited/conditional exploitability or requires another gap to combine with), **Low** (defense-in-depth or operational gap, not independently exploitable), **Informational** (a documented trade-off, not a weakness).

**Zero Critical or High severity items are on this register.** That is this review's headline finding (docs/security/asvs-l2-checklist.md), not something asserted without the walkthrough behind it.

---

## R1 — No CAPTCHA/anti-automation challenge anywhere

- **Severity:** Medium
- **ASVS:** 2.4.1, 6.1.1, 6.3.1
- **What:** docs/11 §9.6 and docs/13 §2 both describe Turnstile as part of the design ("Turnstile on sign-up, sign-in after failures, password reset, event registration and reports"). It was never built in any phase. Rate limits (real, tested, per-route) are the only anti-automation control that actually exists.
- **Why accepted for now:** Turnstile needs a Cloudflare account (docs/19's own founder-action-items table lists it under "Before Phase 15"), so it was never in scope to build before that account exists. Rate limits alone meaningfully raise the cost of credential-stuffing/scraping even without a challenge.
- **Recommendation:** Build Turnstile integration once the account exists (Phase 15), gated behind a feature flag so it can ship disabled and be turned on after verifying the integration works.
- **Owner / next review:** Phase 15.

## R2 — MFA is staff-only; regular students/mentors have no MFA option

- **Severity:** Low
- **ASVS:** 6.3.3
- **What:** TOTP enrollment exists only for staff roles. A compromised student/mentor password has no second factor to fall back on.
- **Why accepted:** A deliberate MVP scope choice, not an oversight — the highest-value target (staff, who can refund money and change commission rules) is the one that's protected. Extending MFA to all users is real UI/UX work (enrollment flow, recovery flow) disproportionate to the risk at current scale.
- **Recommendation:** Revisit once the platform has real transaction volume — optional MFA for mentors handling payouts is the natural next increment, not "MFA for everyone" on day one.
- **Owner / next review:** Post-beta, revenue-driven.

## R3 — No MFA-recovery flow for staff who lose their TOTP device

- **Severity:** Low
- **ASVS:** 6.4.4
- **What:** A staff member who loses their authenticator app currently needs direct database intervention to regain access — no self-service or admin-assisted recovery flow exists.
- **Why accepted:** With a single founder/admin today, this has never been operationally tested and the blast radius of getting locked out is "inconvenient," not "the business stops." It becomes a real problem the moment there's a second admin who isn't also a database administrator.
- **Recommendation:** Build before recruiting the second staff member (docs/19's own founder-action-item: "Before Phase 11: choose second admin/moderator" already implies this need existed; the recovery flow itself was never built alongside it).
- **Owner / next review:** Before onboarding staff #2.

## R4 — TOTP codes are 6 digits (~19.93 bits), fractionally under ASVS's 20-bit floor

- **Severity:** Informational
- **ASVS:** 6.5.4
- **What:** `docs/07`'s own stated rationale ("widest authenticator-app compatibility") is why 6 digits was chosen — this is RFC 6238's standard, and every mainstream authenticator app hard-codes it.
- **Why accepted:** Not a real weakness in practice: codes are single-use (replay-blocked), 30-second-lived, and the verification endpoint is rate-limited. Increasing to 7-8 digits would break compatibility with every authenticator app in exchange for a fractional, already-mitigated entropy gain.
- **Recommendation:** None — this is an accepted, permanent, industry-wide trade-off, not a tracked-for-later item.
- **Owner / next review:** N/A — closed.

## R5 — CSP allows `script-src 'unsafe-inline'`; no nonce/hash-based policy

- **Severity:** Medium
- **ASVS:** 3.4.3
- **What:** `next.config.ts`'s CSP is otherwise strong (`object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`, no wildcard origins) but `'unsafe-inline'` on `script-src` removes CSP's ability to block inline-script-based XSS specifically. A stale code comment (fixed this review) previously claimed a nonce layer existed via a `proxy.ts` file that was never built.
- **Why accepted for now:** There is no known live XSS sink in the app today (V1 chapter: output encoding is consistently handled by React; no raw HTML rendering of untrusted content exists anywhere). This is a defense-in-depth gap, not an active hole — but it means *if* an XSS bug is ever introduced elsewhere, CSP won't be the backstop it's designed to be.
- **Recommendation:** Build a per-request nonce middleware layer (the originally-planned `proxy.ts` approach) that threads a nonce into every inline script Next emits, and tighten `script-src` to `'self' 'nonce-{value}' 'strict-dynamic'`. Real engineering work (~1 day), not a config tweak — scope it as its own small task rather than bundling it into an unrelated phase.
- **Owner / next review:** Before Phase 15 beta, or immediately if any XSS-adjacent finding ever surfaces (ZAP, pentest, bug report) that would make this the actual last line of defense.

## R6 — No key rotation / `kid`-versioning for `MFA_ENCRYPTION_KEY`

- **Severity:** Low (today) → Medium (once real TOTP secrets exist in production)
- **ASVS:** 11.1.1
- **What:** docs/11 §9.4/9.5 describe "rotation... supporting two active keys (kid)" as an existing capability. It was never implemented — confirmed by grep (`kid` appears nowhere in `src/server`). A single fixed key, with no rotation path, currently protects TOTP secrets at rest.
- **Why accepted for now:** No real TOTP secrets have ever been encrypted with this key (no live staff beyond testing) — there is nothing to migrate and no urgency yet. The key-derivation function itself was upgraded this review (HKDF, see the checklist §0) as the cheap, safe-to-do-now half of this fix.
- **Recommendation:** Before real staff TOTP enrollment happens at scale, add a `kid` prefix to `EncryptedSecret` and a small in-memory key registry (`Map<kid, key>`) so a rotation is a config change + a background re-encryption job, not a breaking migration.
- **Owner / next review:** Before Phase 15 (real staff onboarding).

## R7 — No user-facing "view/terminate my active sessions" page

- **Severity:** Low
- **ASVS:** 7.5.2 (the one literal **Not Met** item in the checklist)
- **What:** Users cannot see or selectively revoke their own active sessions. Sessions are short-lived (7-day idle / 30-day absolute for regular users, 1h/12h for staff) and credential changes already revoke sessions automatically, which meaningfully narrows the practical impact — but the ASVS requirement is genuinely unmet, not just narrower than ideal.
- **Why accepted for now:** Never built in any phase; no user-facing account-settings dashboard exists at all yet for regular users (the same underlying gap Phase 13's retrospective flagged: no student/mentor dashboard UI exists).
- **Recommendation:** Build alongside whatever phase finally adds a student/mentor account-settings area — not worth a one-off page in isolation.
- **Owner / next review:** Whenever the student/mentor dashboard UI gap (Phase 13's central finding) gets addressed.

## R8 — No dedicated security-event log stream for authz denials and rate-limit hits

- **Severity:** Medium
- **ASVS:** 16.3.2, 16.3.3
- **What:** `authorize()` denials and rate-limit rejections produce a normal typed error response (visible as a 401/403/404/429 in general request logs) but not a purpose-built, separately-queryable security-event log entry. docs/11 §10's own alerting design ("spike detection — possible BOLA probing") assumes such a stream exists; today it doesn't.
- **Why accepted for now:** With no log-aggregation/alerting system wired up at all yet (R9 below), a dedicated event stream would have nowhere useful to go — this is naturally sequenced after, not instead of, real log shipping.
- **Recommendation:** Add a small `logger.warn({event: "security.authz_denied", ...})` (and equivalent for rate-limit/CSRF rejections) at the points `authorize()` and `consumeRateLimit` already throw, once there's a log destination that can alert on it.
- **Owner / next review:** Alongside R9, Phase 15.

## R9 — No log shipping / aggregation destination (Sentry or equivalent)

- **Severity:** Low
- **ASVS:** 16.2.3, 16.4.2, 16.4.3
- **What:** Logs currently go to stdout only. There's no external, tamper-resistant destination logs are shipped to.
- **Why accepted:** Explicitly Phase 15 scope (docs/19's founder-action-items table: "Before Phase 15: ...Sentry account"). Nothing to build without the account existing first.
- **Recommendation:** Wire up Sentry (or equivalent) as part of Phase 15's deploy-sandbox-beta work, then revisit R8 immediately after.
- **Owner / next review:** Phase 15.

## R10 — Database connection TLS not asserted in application code

- **Severity:** Low (today, local-only) → Medium (once a real staging/production DB exists)
- **ASVS:** 12.3.3, 12.3.4
- **What:** `src/server/platform/db/client.ts` passes no explicit `ssl` option to the Postgres driver — connection encryption depends entirely on `DATABASE_URL`'s own `sslmode` parameter and the driver's default, not on anything the app itself enforces or verifies.
- **Why accepted for now:** No real staging/production database exists yet; local same-machine Postgres makes this moot today.
- **Recommendation:** When Phase 15 provisions a real (Supabase) database, explicitly verify `sslmode=require` (or stronger) in the connection string, and consider adding a startup-time assertion that refuses to boot in a non-local `APP_ENV` without TLS configured, so this can never silently regress.
- **Owner / next review:** Phase 15, at DB provisioning time.

## R11 — No SBOM generation; no formally tracked dependency-remediation SLA

- **Severity:** Low
- **ASVS:** 15.1.1, 15.1.2
- **What:** Dependabot + `npm audit --audit-level=high` + OSV-Scanner (Phase 13) give real, running vulnerability detection, but there's no CycloneDX SBOM artifact and no enforced "critical fixed within 24h" policy beyond prose in docs/11.
- **Why accepted:** docs/11 §7 (A03) already explicitly named SBOM generation as "Beta" scope, a decision made before this review, not something this review is newly deferring.
- **Recommendation:** Add `cyclonedx-npm` (or equivalent) as a CI artifact once Beta planning starts; formalize the SLA as an actual tracked process (e.g., a label + a due-date bot on Dependabot PRs) at the same time.
- **Owner / next review:** Phase 15/Beta planning.

## R12 — esbuild `<=0.24.2` dev-server CORS issue (transitive, via drizzle-kit)

- **Severity:** Informational (dev-only, not reachable in any real usage of this app)
- **Where:** Already fully documented in `osv-scanner.toml` and cross-referenced in `docs/21-architecture-decision-records.md`. Listed here only so the register is a complete single source of truth for every accepted finding, not because it's new.
- **Owner / next review:** Revisit if `drizzle-kit` ever ships a 1.0 stable release with a clean dependency tree.

## R13 — ZAP baseline scan doesn't fail the build yet (`fail_action: false`)

- **Severity:** N/A (a process posture, not a vulnerability)
- **Where:** Already fully documented in `docs/21-architecture-decision-records.md` ADR-048. Cross-referenced here for completeness. This Phase 14 review is the trigger ADR-048 named for tightening this — **action item:** once the first few weeks of weekly ZAP scan results have been triaged into a `.zap/rules.tsv` allowlist, flip `fail_action: true` in `.github/workflows/weekly.yml`.
- **Owner / next review:** After ~4 weeks of weekly ZAP data exists (mid-to-late October 2026).

## R14 — `Cross-Origin-Embedder-Policy` and `Cross-Origin-Resource-Policy` headers not set

- **Severity:** Low
- **What:** This review triggered the weekly ZAP scan manually (rather than waiting for Sunday) to get real findings for this register — see `docs/security/asvs-l2-checklist.md` §0 for the one real bug it found and the one alert it raised that turned out to be a false positive. ZAP also flagged `Cross-Origin-Opener-Policy Header Missing or Invalid`, `Cross-Origin-Embedder-Policy Header Missing or Invalid`, and `Cross-Origin-Resource-Policy Header Missing or Invalid`. Verified directly: COOP **is** set (`same-origin-allow-popups`, confirmed via `curl -D-`) — ZAP's rule wants the strictest `same-origin` value and flags anything else as "invalid," which doesn't account for `next.config.ts`'s documented, deliberate reason for the looser value (Razorpay/Google OAuth popup windows need it). Not a real gap. COEP and CORP genuinely aren't set.
- **Why accepted for now:** COEP specifically requires care — setting `require-corp` could break the Google OAuth popup flow (a cross-origin embed) without also configuring `credentialless` or verifying Google's own response headers cooperate, and this review had no way to test that against a real OAuth flow (no live Google credentials in this environment). Adding it without testing risks silently breaking login, which is a worse outcome than leaving it unset a little longer. CORP is lower-risk to add (protects this app's own resources from cross-origin loading) but wasn't rushed in alongside an untested COEP change in the same pass.
- **Recommendation:** Add `Cross-Origin-Resource-Policy: same-origin` on its own first (lower risk, testable via the existing E2E suite). Add `Cross-Origin-Embedder-Policy` only after testing it against a real Google OAuth sign-in flow (staging, Phase 15) — or scope it to `credentialless` from the start to sidestep the popup-breaking risk entirely.
- **Owner / next review:** Before Phase 15 beta, alongside real OAuth flow testing.

---

## Sign-off

| Role | Name | Decision | Date |
|---|---|---|---|
| Founder | Aditya Rekhe | ☐ Pending | — |

This table is intentionally left unfilled by engineering. Per docs/19 Phase 14's exit criteria, this register is not considered "signed off" until the founder reviews it and marks a decision here (or the equivalent is recorded wherever the founder prefers to track it).
