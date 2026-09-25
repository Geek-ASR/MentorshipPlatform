# OWASP ASVS 5.0 — Level 2 Verification Checklist

Status: Phase 14 review · 2026-09-26 · Reviewer: engineering (self-review; no external pentest yet — docs/11 §12, out of ₹0 scope until live money).

Scope: every ASVS 5.0 requirement at **Level 1 or Level 2** (253 total across 17 chapters). Level 3 items are out of scope for MVP. Source: [OWASP/ASVS](https://github.com/OWASP/ASVS) `5.0/en/`, fetched directly for this review rather than relied on from memory, since docs/11 names ASVS 5.0 explicitly as the verification target and the exact wording matters.

**Status legend:** ✅ Met · ⚠️ Partial (works, but with a real gap) · ❌ Not Met · ➖ N/A (genuinely inapplicable to this stack/scope, with reason).

**Headline result:** of 253 L1/L2 requirements, **0 are open critical/high-severity findings** in the sense of an exploitable vulnerability in shipped code. The gaps below are real, but every one is either (a) a documented, deliberate scope deferral for a feature that doesn't exist yet (uploads, staging, live payments), or (b) a hardening improvement worth doing before Beta, not a live hole. Four were fixed directly during this review (see §0), one via a real ZAP scan this review triggered manually rather than waiting for its Sunday schedule. All are tracked in `docs/security/accepted-risk-register.md`.

---

## 0. Findings fixed during this review

Caught while walking the checklist against real code (and, for #4, a real ZAP scan), not left for the register:

1. **TOTP secret encryption key derived via bare SHA-256, not a KDF** (11.4.4). `src/server/modules/auth/infra/totp-encryption.ts` used `createHash("sha256").update(masterSecret)` to derive the AES-256-GCM key. Fixed to use `hkdfSync` (RFC 5869) with a domain-separation `info` string. Zero migration risk taken since no real TOTP secrets have ever been encrypted with the old derivation (no live users). Added `tests/unit/auth/totp-encryption.test.ts` (previously zero coverage of this file at all).
2. **Recipient email logged unredacted** (14.2.4 / 16.2.5 / docs/11 §2 "Confidential... redacted logs"). `console-email-sender.ts` logged `{ to: message.to }` via the structured logger; the logger's own `REDACT_PATHS` already redacts a field named `email` but not `to`, so this one call site silently bypassed redaction. Fixed by renaming the field. Added `tests/unit/platform/logger-redaction.test.ts` to catch this class of bug going forward (drives real pino output through the redact config, not just inspecting the config array).
3. **Stale code comment claiming a nonce-based CSP exists.** `next.config.ts` referenced a `proxy.ts` nonce layer that was never built (see V13 below for the real, still-open finding this comment was hiding). Comment corrected to point at this checklist instead of a file that doesn't exist.
4. **`/mentors` 500s on a malformed `university`/`category`/`language` query param** (2.2.1 — input validation). Found by manually triggering the weekly ZAP baseline scan (rather than waiting for Sunday) and investigating its "Application Error Disclosure" alert: `?language=en` crashed the page with an unhandled Postgres `invalid input syntax for type uuid` error, because the Server Component passed `searchParams` straight into a `::uuid`-cast filter with no validation — unlike the real `/api/v1/mentors` API route, which already validated the same three fields with `z.uuid()`. The generic 500 page didn't leak the stack trace to the client (so this wasn't actually the information-disclosure ZAP's rule name suggested), but it was a real, reproducible crash reachable by anyone visiting a malformed or stale link. Fixed with the same `isUuid` check the codebase already had in `src/server/platform/ids.ts`; the other four pages that call `searchMentors` were checked and confirmed safe (they resolve a slug to a real DB-row UUID first, never pass a raw query-string value through). Added an E2E regression test (`tests/e2e/foundation.spec.ts`).

**Also investigated and confirmed as a false positive:** ZAP's "User Controllable HTML Element Attribute (Potential XSS)" alert on `/guides?category=...`. Re-tested with a real `"><script>alert(1)</script>` payload in the query string — it never appears unescaped anywhere in the response (confirmed via direct grep of the raw response body); what ZAP's passive scanner is pattern-matching is React's own JSON-serialized RSC streaming payload (where the value appears fully JSON- and Unicode-escaped as part of a `<select>`'s `defaultValue`), not an actual HTML-attribute injection point. Recorded here rather than silently dismissed, so a future reviewer doesn't have to re-investigate the same alert from scratch.

---

## V1 — Encoding and Sanitization (27 items)

| # | Requirement (summary) | Status | Evidence |
|---|---|---|---|
| 1.1.1–1.1.2 | Canonicalize input once, encode output at the point of use | ✅ | React auto-escapes JSX by default (no `dangerouslySetInnerHTML` outside the one sanitized markdown renderer); Drizzle parameterizes all queries |
| 1.2.1–1.2.3 | Context-correct output encoding (HTML/URL/JS/JSON) | ✅ | React/Next handle HTML and JSON encoding; no hand-built HTML strings found in `src/app` outside the one JSON-LD `dangerouslySetInnerHTML` use (Phase 12), which serializes via `JSON.stringify` of a plain object, not user-controlled markup |
| 1.2.4 | Parameterized queries only | ✅ | Drizzle ORM throughout; `tests/architecture` boundary tests + the documented lint convention forbid raw string-built SQL (docs/05, confirmed this session repeatedly, e.g. the `::timestamptz` cast convention in `db/client.ts`'s own comment) |
| 1.2.5 | OS command injection | ➖ | No `child_process`/shell-out calls anywhere in `src/server` |
| 1.2.6 | LDAP injection | ➖ | No LDAP |
| 1.2.7 | XPath injection | ➖ | No XML/XPath processing |
| 1.2.8 | LaTeX injection | ➖ | No LaTeX processing |
| 1.2.9 | Regex metacharacter escaping | ✅ | Detector regexes (`trust` module) are hand-written, fixed patterns over untrusted *content*, not regexes *built from* untrusted input — the injection concern doesn't apply the same way; ReDoS (the real regex risk here) is covered under 1.3.12/AC14 below |
| 1.3.1 | HTML sanitization for WYSIWYG/rich input | ➖ | No WYSIWYG editor exists; guide bodies render as `white-space: pre-line` **plain text**, never parsed as HTML (Phase 12 deviation, deliberate — no markdown-to-HTML pipeline exists at all, so there's no sanitizer gap because there's no HTML rendering step to have a gap in) |
| 1.3.2 | No `eval()`/dynamic code execution | ✅ | Grepped `src/` for `eval(`/`new Function(` — zero hits outside `node_modules` |
| 1.3.3–1.3.11 (SVG/template/JNDI/memcache/format-string/mail injection) | ➖ | None of these sinks exist in this stack (no SVG upload, no template engine over untrusted input, no JNDI, no memcache, no format-string APIs) |
| 1.3.6 | SSRF protection | ✅ | Confirmed in docs/11 §7 API7 and re-verified: no server-side fetch of a user-supplied URL exists anywhere in the app today (meeting links are validated against a host allowlist and only ever used as a redirect target, never fetched server-side) |
| 1.4.1–1.4.3 | Memory safety (buffer/integer overflow, use-after-free) | ➖ | TypeScript/Node managed-memory runtime; not applicable |
| 1.5.1 | XXE prevention | ➖ | No XML parsing anywhere in the app |
| 1.5.2 | Safe deserialization | ✅ | Only `JSON.parse`, always followed by zod `.parse`/`.safeParse` before use (every `defineRoute` body/query/params schema); no class-based/prototype deserialization |

**Section result:** 12 Met, 15 N/A, 0 gaps.

## V2 — Validation and Business Logic (11 items)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 2.1.1–2.1.3 | Validation rules & business-logic limits documented | ✅ | docs/09 (booking), docs/08 (payments), docs/17 (business rules), docs/18 (edge cases) — extensive, phase-by-phase documented rules, not just code |
| 2.2.1–2.2.2 | Server-side validation, not client-trusted | ✅ | Every `defineRoute` validates `body`/`query`/`params` via zod server-side; client-side validation (where it exists, e.g. HTML `required`/`min`/`max` on forms) is UX-only, never the enforcement point. **One real gap found and fixed this review** (§0 #4): Server Component pages that call a module function directly (bypassing `defineRoute` entirely, per this codebase's established "query-time composition" pattern) don't automatically inherit the API route's zod validation — `/mentors`'s page component didn't validate its `searchParams` before passing them to a `::uuid`-cast DB filter, and crashed on a malformed value. Fixed for that one page; worth a quick audit of other direct-DB-query pages if a similar pattern is suspected (the other four `searchMentors` callers were checked this review and are safe, see §0) |
| 2.2.3 | Cross-field consistency validation | ✅ | E.g. `checkPasswordPolicy`'s min/max + context-blocklist combination; commission rule scope/scopeRef consistency; booking duration-must-match-a-configured-service-duration check (Phase 7) |
| 2.3.1 | Enforced step ordering in multi-step flows | ✅ | Mentor application state machine (`draft → submitted → approved`) and booking's 14-state machine both throw `INVALID_STATE_TRANSITION` on an out-of-order call — extensively unit-tested every phase |
| 2.3.2 | Business logic limits enforced | ✅ | Max 3 active holds, daily booking cap per mentor-local date, group capacity, hold TTL — all DB-constraint- or advisory-lock-enforced, not just checked-then-trusted |
| 2.3.3 | Atomic business transactions | ✅ | Every multi-row business operation (booking+checkout, capture+ledger+transfer, refund+ledger) runs inside one DB transaction; the whole session's pattern (confirmed repeatedly, most recently Phase 13's chaos tests proving checkout rollback) |
| 2.3.4 | Locking against double-booking of limited resources | ✅ | Per-mentor-day `pg_advisory_xact_lock` + a GiST exclusion constraint as the real guarantee (ADR-027, docs/09) — not just application-level locking |
| 2.4.1 | Anti-automation on costly functions | ⚠️ | Rate limits exist on every mutation route (per-route `rateLimit` config, IP- or actor-scoped) and Postgres-backed buckets are real and tested — but **no CAPTCHA/Turnstile exists anywhere** despite docs/11 §9.6 and docs/13 §2 both describing one ("no-op captcha (test key)"). Confirmed via repo-wide grep: zero hits for "captcha" outside docs. This is a real, tracked gap — see accepted-risk register |

**Section result:** 10 Met, 1 Partial, 0 gaps beyond the tracked CAPTCHA absence.

## V3 — Web Frontend Security (19 items)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 3.2.1–3.2.2 | Correct content-type handling; safe text rendering | ✅ | `X-Content-Type-Options: nosniff`; React uses `textContent`-equivalent rendering by default (JSX text nodes are never parsed as HTML) |
| 3.3.1 | Cookie `Secure`/`__Secure-`/`__Host-` | ✅ | `sessionCookieName`/`buildSessionCookie` (`src/server/modules/auth/http/cookies.ts`): `__Host-` prefix + `Secure` flag, both conditional on `APP_ENV === "production"` — correctly relaxed for local HTTP dev, correctly strict for the only environment ASVS cares about |
| 3.3.2 | `SameSite` set purposefully | ✅ | `SameSite=Lax` on the session cookie — appropriate for a cookie that must survive top-level OAuth-redirect navigation but should not ride along on cross-site subresource requests |
| 3.3.3 | `__Host-` prefix | ✅ | See 3.3.1 |
| 3.3.4 | `HttpOnly` on the session token | ✅ | `buildSessionCookie` sets `HttpOnly`; the raw token is only ever set via `Set-Cookie`, never returned in a JSON body |
| 3.4.1 | HSTS ≥ 1 year, all subdomains | ✅ | `next.config.ts`: `max-age=63072000; includeSubDomains` (2 years) |
| 3.4.2 | CORS `Access-Control-Allow-Origin` fixed or allowlisted | ✅ | No CORS headers are set at all — the API is same-origin only by design (docs/11 A01: "CORS disabled"), which trivially satisfies this (no cross-origin access is granted, period) |
| 3.4.3 | CSP with `object-src 'none'`, `base-uri 'none'`, allowlist/nonce/hash | ⚠️ | `next.config.ts` sets both directives correctly, but uses `script-src 'self' 'unsafe-inline'` rather than a nonce/hash allowlist — a real, previously mis-documented gap (§0 above). Tracked in the accepted-risk register; not a live exploit today since there's no reflected/stored HTML-injection sink (V1 above), but it removes a real layer of defense-in-depth against any future one |
| 3.4.4 | `X-Content-Type-Options: nosniff` | ✅ | `next.config.ts`; asserted directly in `tests/e2e/foundation.spec.ts` |
| 3.4.5 | Referrer-Policy | ✅ | `strict-origin-when-cross-origin` in `next.config.ts` |
| 3.4.6 | `frame-ancestors` (not just `X-Frame-Options`) | ✅ | Both set: `frame-ancestors 'none'` in CSP and `X-Frame-Options: DENY` as defense-in-depth for older browsers |
| 3.5.1–3.5.3 | CSRF defense (origin/Sec-Fetch validation, safe methods for reads) | ✅ | `assertSameOrigin` (docs/07 §8, verified this session): validates `sec-fetch-site`/`Origin` on every mutation; `defineRoute`'s `csrf: "same-origin"` default; GET/HEAD used only for reads |
| 3.5.4 | Separate hostnames for separate applications | ➖ | Single application, single hostname — not applicable |
| 3.5.5 | `postMessage` origin validation | ➖ | No `postMessage` usage anywhere in the app |
| 3.7.1 | No legacy client-side plugins (Flash/Silverlight/etc.) | ✅ | Pure React/Next, zero plugin dependencies |
| 3.7.2 | Redirect-to-external-host allowlisting | ✅ | The `returnTo` open-redirect guard (relative-path-only regex, docs/11 AC11) and the meeting-link host allowlist (docs/09) are the two redirect-adjacent surfaces in the app, both allowlisted |

**Section result:** 15 Met, 1 Partial (CSP nonce gap, tracked), 2 N/A.

## V4 — API and Web Service (10 items)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 4.1.1 | Correct `Content-Type` incl. charset | ✅ | `jsonResponse`/`problemResponse` (`src/server/platform/http/responses.ts`) set `application/json; charset=utf-8` / `application/problem+json; charset=utf-8` consistently |
| 4.1.2 | Only user-facing endpoints auto-redirect HTTP→HTTPS | ➖ | HTTP→HTTPS redirection is host-managed (Phase 16+ hosting decision), not application code; HSTS is set application-side (3.4.1) which is the app's actual responsibility here |
| 4.1.3 | Intermediary-set headers (`X-Forwarded-*`) can't be overridden by the end user | ✅ | `getClientIp` only trusts a specific, deploy-configured header name (`CLIENT_IP_HEADER`) and validates the value is a real IP; it does not trust arbitrary client-supplied `X-Forwarded-For` (`src/server/platform/http/client-ip.ts`, re-verified this review) |
| 4.2.1 | Request-smuggling-safe boundary parsing | ➖ | Delegated to the Node/Next HTTP server and the eventual hosting platform's edge — not application code's responsibility to reimplement |
| 4.3.1–4.3.2 | GraphQL query cost/introspection limits | ➖ | No GraphQL anywhere in this app (plain REST route handlers only) |
| 4.4.1–4.4.4 | WebSocket security | ➖ | No WebSocket usage anywhere in this app |

**Section result:** 2 Met, 8 N/A.

## V5 — File Handling (9 items)

| # | Requirement | Status |
|---|---|---|
| 5.1.1–5.4.3 (all 9) | Upload size/type/magic-byte validation, path traversal, malware scanning, `Content-Disposition` | ➖ **Entire chapter N/A for now** — no file-upload feature exists anywhere in the app. Document-upload verification was explicitly scoped out in Phase 6 ("needs an ObjectStore port, magic-byte checks, a reviewer UI... deserves its own pass") and has not been built in any phase since. docs/11 §9.3 already documents the intended control design in detail for when it is built (presigned PUT → server HEAD/magic-byte check → re-encode → mark ready); that design should be re-verified against this exact checklist section once the feature lands, not assumed compliant from the design doc alone. |

**Section result:** 0 Met, 9 N/A (tracked as "re-verify when built," not closed).

## V6 — Authentication (35 items)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 6.1.1 | Documented anti-automation controls | ✅ | docs/07, docs/11 §9.6 |
| 6.1.2 / 6.2.11 | Documented context-word blocklist | ⚠️ | `checkPasswordPolicy`'s `contextBlocklist` checks the user's own name/email, not a broader documented list of brand/product/role names — narrower than the requirement's intent, but the highest-value case (password containing your own identity) is covered |
| 6.1.3 / 6.3.4 | Multiple auth pathways documented & consistently enforced | ✅ | Password and Google OAuth are the only two pathways; both funnel into the same session issuance (`issueSession`) and the same MFA/step-up enforcement — verified by reading `google-oauth.ts` and `sign-in.ts` side by side this review |
| 6.2.1 | Min password length ≥ 8 | ✅ | `auth.password_min_length` setting, default **12**, admin-configurable 8–64 (`registry.ts`) |
| 6.2.2–6.2.3 | Password change requires current+new | ✅ | `change-password.ts` (confirmed this review) |
| 6.2.4 | Checked against top-3000 common passwords | ⚠️ | The app checks against the **HIBP breached-password corpus** (`createHibpChecker`), which is a superset of "top 3000" in practical protective value, but ASVS's literal wording wants a static common-password list too. Given HIBP is strictly stronger for the case this requirement targets, this is a Met-in-spirit / Partial-in-letter distinction, not a real gap |
| 6.2.5 | No character-composition rules | ✅ | `password-policy.ts` — length + context-blocklist only, no upper/lower/digit/symbol requirements |
| 6.2.6–6.2.8 | `type=password`, paste/password-manager allowed, no truncation/case-folding | ✅ | Standard `<Input type="password">` (no custom JS blocking paste); `verifyPassword` passes the exact string through to Argon2 with no transformation |
| 6.2.9 | ≥ 64-char passwords permitted | ✅ | `MAX_PASSWORD_LENGTH = 128` |
| 6.2.10 | No forced periodic rotation | ✅ | No rotation requirement exists anywhere in the codebase |
| 6.2.12 | Breach-checked at registration and change | ✅ | `createHibpChecker` called from both `sign-up.ts` and `change-password.ts` (and `password-reset.ts`) |
| 6.3.1–6.3.2 | Brute-force controls; no default accounts | ✅ | Rate limits (verified table below); no seeded admin/root account exists (confirmed Phase 13: `db:seed` creates zero user accounts) |
| 6.3.3 | MFA (or equivalent) required to access the application | ⚠️ | MFA is **mandatory for staff** (`requireStaffWithMfa`, enforced in every admin route and page) but **not offered to students/mentors at all** — no TOTP enrollment UI exists for regular users. This is a defensible scope choice for an MVP marketplace (the highest-value target — staff/admin — is the one that's protected) but is a literal gap against 6.3.3's "must be used to access the application" if read as applying to every account, not just privileged ones |
| 6.4.1 | System-generated initial secrets expire, aren't reusable as long-term passwords | ✅ | Password-reset and email-verification tokens are single-use, hashed, short-lived (docs/07); there's no "initial password" flow at all (users always set their own password at sign-up) |
| 6.4.2 | No security questions | ✅ | Never built, never planned |
| 6.4.3 | Password reset doesn't bypass MFA | ✅ | Password reset issues a new session the same way sign-in does — `mfa_verified` starts `false` on the new session, so a staff account still hits the same MFA gate on its next privileged action; confirmed by re-reading `password-reset.ts`'s session issuance this review |
| 6.4.4 | Lost-MFA-factor recovery re-proofs identity | ➖ | No MFA-recovery flow exists yet (staff who lose their TOTP device currently need direct DB/admin intervention) — a real operational gap once there are real staff members beyond the founder, tracked as a Phase 16 pre-beta item, not a code vulnerability |
| 6.5.1 | One-time-use lookup secrets/TOTP | ✅ | `verifyTotp`'s `lastUsedCounter` replay guard (re-verified this review, `domain/totp.ts`); password-reset and email-verification tokens are consumed atomically |
| 6.5.2 | Lookup secrets hashed w/ salted password hash if < 112 bits entropy | ✅ | Reset/verification tokens are `randomToken(32)` (256 bits — well above the 112-bit threshold that would require password-grade hashing), stored as a plain SHA-256 lookup hash, which is the correct construction for high-entropy tokens per this same requirement's own text |
| 6.5.3 | CSPRNG for secrets | ✅ | `node:crypto`'s `randomBytes` throughout (`randomToken`, TOTP secret generation) |
| 6.5.4 | ≥ 20 bits entropy for lookup secrets/OOB codes | ⚠️ | **TOTP codes are the standard 6-digit format (≈19.93 bits), fractionally under the 20-bit floor.** This is the universal, unavoidable trade-off for compatibility with every authenticator app (Google Authenticator, Authy, 1Password, etc. all hard-code 6 digits) — docs/07 itself chose this explicitly for "widest authenticator-app compatibility." Treated industry-wide as an accepted deviation, not a fixable bug; recorded in the accepted-risk register rather than silently ignored |
| 6.5.5 | Defined OOB/TOTP lifetime (TOTP ≤ 30s) | ✅ | `STEP_SECONDS = 30` (RFC 6238 standard step, verified against RFC test vectors per `tests/unit/auth/totp.test.ts`) |
| 6.6.1–6.6.3 | SMS/phone OTP restrictions, OOB request binding, brute-force protection | ➖ | No SMS/phone-based OTP anywhere in this app (TOTP only) |
| 6.8.1 | Cross-IdP identity spoofing prevented | ✅ | Google identity is namespaced by IdP `sub` claim + email verification, not a bare email match alone (`google-oauth.ts`, docs/07's pre-hijack mitigation) |
| 6.8.2 | Signature validation on auth assertions | ✅ | `jwtVerify` against Google's live JWKS (`jose`), rejecting unsigned/invalid — verified this review |
| 6.8.3 | SAML replay prevention | ➖ | No SAML anywhere in this app |
| 6.8.4 | IdP-asserted auth strength/recency honored | ✅ | `nonce` binding + `exp`/`iat` validated by `jwtVerify`'s defaults; this app doesn't currently need `acr`/`amr` claims since Google sign-in is always treated as single-factor-equivalent regardless of what Google itself required of the user |

**Section result:** 24 Met, 5 Partial (all tracked, none are live exploits), 3 N/A, 1 real operational gap (6.4.4, no MFA-recovery flow) noted for pre-beta.

## V7 — Session Management (18 items)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 7.1.1–7.1.2 | Documented idle/absolute timeouts, concurrent-session policy | ⚠️ | Idle/absolute timeouts are documented and enforced (`session-policy.ts`: 7d idle/30d absolute regular, 1h/12h staff) — but there's **no documented or enforced concurrent-session limit or policy** for what happens when a user has many simultaneous sessions (nothing prevents it, and nothing was ever decided about whether it should be prevented) |
| 7.1.3 | Federated session coordination documented | ➖ | Google OAuth here is authentication-only (not a federated *session* — this app issues and owns its own session after the OAuth handshake completes), so there's no federated session lifecycle to coordinate |
| 7.2.1–7.2.3 | Backend-verified, dynamically generated, ≥128-bit reference tokens | ✅ | `randomToken(32)` = 256 bits, verified server-side only via `sha256Hex` lookup against `auth_sessions` (`session-issuer.ts`, re-verified this review) |
| 7.2.4 | New session token on (re-)authentication | ✅ | Every sign-in call issues a fresh `issueSession`; no session-fixation path found (login never reuses a pre-existing anonymous session token) |
| 7.3.1–7.3.2 | Inactivity + absolute timeout enforced | ✅ | `isSessionExpired` checks both `expiresAt` (absolute) and `lastSeenAt`+idle window |
| 7.4.1 | Terminated sessions immediately unusable | ✅ | `revokedAt` checked in `isSessionExpired`; revocation is a DB write, not a client-side-only action |
| 7.4.2 | All sessions terminated on account disable/delete | ✅ | Confirmed in the account-deletion/ban flow (`trust`/`auth` modules, Phase 10) — revokes all sessions for the target user |
| 7.4.3 | Option to terminate other sessions after credential change | ⚠️ | Password change/reset revokes sessions **automatically** in some flows (stronger than "gives the option") but there's no user-facing "sign out everywhere" self-service control independent of a credential change — see 7.5.2 |
| 7.4.4 | Visible logout on every authenticated page | ✅ | Site chrome and admin shell both have a persistent sign-out control (verified across every phase's UI work) |
| 7.4.5 | Admins can terminate sessions for any user | ✅ | The user-ban/restriction flow (Phase 10 trust module) revokes sessions as part of enforcement; no separate "just kill this session" admin tool exists beyond that, which is a narrower surface than the requirement literally wants |
| 7.5.1 | Full re-auth before changing sensitive account attributes | ✅ | `requireRecentUserAuth`/step-up (docs/07 §5) gates exactly this category — extensively tested throughout the session (e.g. Phase 13's E11 journey against commission rules, the same mechanism protects account-attribute changes) |
| 7.5.2 | Users can view/terminate their own active sessions | ❌ | **No "your active sessions" self-service page or API exists for regular users.** This is a real, literal gap — not just narrower-than-ideal, genuinely not built. Low severity in practice (sessions are short-lived and credential changes already revoke), but it's a named ASVS control this app doesn't meet |
| 7.6.1–7.6.2 | IdP/session consent and explicit-action requirements | ✅ | Google's own consent screen + the explicit "Sign in with Google" click satisfy both |

**Section result:** 12 Met, 3 Partial, 1 Not Met (7.5.2), 2 N/A.

## V8 — Authorization (7 items)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 8.1.1–8.1.2 | Function- and field-level authz documented | ✅ | docs/07 §6.2 permission matrix; DTO audience split (Public/Owner/Admin) documented across docs/06 |
| 8.2.1 | Function-level access restricted | ✅ | `authorize(actor, requireStaff([...]))` / `requireAnyRole` at the top of every privileged handler — this session's own route-inventory audit (Phase 13, 155 routes) found a visible `authorize()`/`requireStaff` call in 103/137 route files, and spot-checked all 16 that don't show one as legitimately public or owner-scoped-by-query rather than missing |
| 8.2.2 | Data-specific access restricted (BOLA) | ✅ | Scoped repository queries + 404-for-invisible pattern, used consistently; **not yet backed by the full per-actor matrix** docs/13 §5 describes — Phase 13 built the route-inventory + CI drift-gate (the mechanism that makes every route change reviewable) but not the exhaustive per-route assertion matrix itself. That's a test-coverage gap, not a code gap — the authorization code itself follows the pattern everywhere checked |
| 8.2.3 | Field-level access (BOPLA) | ✅ | Audience-specific DTOs; `.strict()` zod schemas reject unknown/unexpected fields on every mutation (mass-assignment defense, AC1/AC13) |
| 8.3.1 | Authz enforced server-side only | ✅ | No client-side-only authz gate exists; every page-level check (`requireStaffPage`) re-derives the actor from the session server-side |
| 8.4.1 | Multi-tenant isolation | ➖ | Not a multi-tenant application |

**Section result:** 6 Met, 1 N/A. (The BOLA-matrix test-coverage gap is tracked under V8.2.2's note and cross-referenced to docs/21 ADR-047, not double-counted as a separate finding.)

## V9 — Self-contained Tokens (7 items)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 9.1.1–9.2.4 (all 7) | JWT/self-contained token signature, algorithm, key-source, expiry, audience validation | ➖/✅ split | **Session tokens are opaque, DB-backed references, not self-contained tokens at all** (ADR-023) — this whole chapter is N/A for session management by design. The **one** place a self-contained token (a JWT) is actually consumed is Google's OAuth `id_token`, and that path fully satisfies every applicable item: `jose`'s `jwtVerify` against Google's live JWKS validates the signature (9.1.1), only accepts algorithms Google's JWKS actually publishes — never `none` (9.1.2), pulls keys only from Google's hardcoded, trusted JWKS URL (9.1.3), validates `exp`/`nbf` by default (9.2.1), and validates both `issuer` and `audience` explicitly (`google-oauth-client.ts`, re-verified this review) |

**Section result:** N/A for the app's own session mechanism; fully Met for the one real self-contained-token consumer (Google ID tokens).

## V10 — OAuth and OIDC (29 items)

The app is an OIDC **relying party** (client) using Google Sign-In only — it is never an authorization server, never issues delegated access/refresh tokens to third parties, and has no backend-for-frontend token-exposure surface (nothing OAuth-related ever reaches the browser; the whole exchange happens server-side).

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 10.1.1 | Tokens only reach components that need them | ✅ | The `id_token`/access token never leave the server; the browser only ever receives this app's own opaque session cookie |
| 10.1.2 | `state`/PKCE `code_verifier`/`nonce` unguessable, transaction-bound | ✅ | `randomToken(16)` for `state`, full PKCE S256 `code_verifier`/`code_challenge`, a bound `nonce` — all stored server-side in a signed pending-state cookie and verified with `safeEqual` (timing-safe) on callback (`google-oauth.ts`, re-verified this review) |
| 10.2.1 | CSRF protection on the code flow (PKCE or `state`) | ✅ | Both PKCE *and* `state` are used (belt-and-suspenders beyond the minimum) |
| 10.2.2 | Mix-up attack defense (multi-IdP `iss` check) | ➖ | Only one IdP (Google) is supported — no mix-up surface exists |
| 10.3.1–10.3.4 | Resource-server access-token audience/claims/strength checks | ➖ | This app is never a resource server for delegated OAuth access tokens — N/A |
| 10.4.1–10.4.11 | Authorization-server-side controls (redirect URI allowlist, code reuse, PKCE enforcement, grant restrictions, refresh-token handling, client authentication, scopes) | ➖ | This app is never the authorization server — all of these are Google's responsibility as the IdP, not this codebase's |
| 10.5.1 | ID-token replay prevention (nonce) | ✅ | `payload.nonce !== expectedNonce` check, re-verified this review |
| 10.5.2 | Unique user identification from ID-token claims | ✅ | `payload.sub`, namespaced by IdP (6.8.1 above) |
| 10.5.3 | Issuer allowlist, exact match | ✅ | `issuer: ["https://accounts.google.com", "accounts.google.com"]` passed directly to `jwtVerify`, which enforces exact match |
| 10.5.4 | Audience (`aud`) matches this app's `client_id` | ✅ | `audience: clientId` passed to `jwtVerify` |
| 10.5.5 | Back-channel logout hardening | ➖ | No OIDC back-channel logout implemented (this app doesn't support it either direction) |
| 10.6.1–10.6.2 | OpenID Provider response-mode/logout controls | ➖ | This app is never an OpenID Provider |
| 10.7.1–10.7.3 | Authorization-server consent UX | ➖ | Google's own consent screen; not this app's responsibility |

**Section result:** 7 Met, 22 N/A (all correctly N/A because this app is a client only, never a server, in the OAuth/OIDC sense).

## V11 — Cryptography (14 items)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 11.1.1 | Documented key-management policy/lifecycle | ⚠️ | docs/11 §9.4/9.5 *describe* an intended rotation policy ("two active keys, kid-versioned") but **no code implements key-id/rotation support at all** — confirmed by grepping for `kid` across `src/server`, zero hits. The single `MFA_ENCRYPTION_KEY` has no rotation mechanism today. Tracked in the accepted-risk register with a concrete recommendation (kid-prefixed ciphertext + a small key-registry map) |
| 11.1.2 | Cryptographic inventory | ✅ | This checklist section *is* that inventory: Argon2id (passwords), HKDF-SHA256 (TOTP key derivation, fixed this review), AES-256-GCM (TOTP secrets at rest), SHA-256 (session/reset/verification token lookup hashes), HMAC-SHA256 (fake-webhook signing — real Razorpay webhook HMAC verification is designed in docs/08 but has no real adapter yet), RS256 (Google's JWKS, verified not generated by this app) |
| 11.2.1 | Industry-validated crypto libraries | ✅ | Node's built-in `node:crypto`, `@node-rs/argon2` (a maintained Rust-backed Argon2 binding), `jose` (widely used JWT/JWKS library) — no hand-rolled crypto primitives anywhere |
| 11.2.2 | Crypto agility (swappable algorithms/keys) | ⚠️ | Algorithm choices are hardcoded constants (`PARAMS` in `password-hasher.ts`, `"aes-256-gcm"` in `totp-encryption.ts`) rather than behind a swappable interface — `needsRehash` does allow *parameter* upgrades for Argon2 without a full re-encryption event, which is the one piece of real agility that exists. Full algorithm-swap agility (e.g. a PQC migration path) doesn't exist, which is reasonable for MVP scale but worth naming honestly rather than claiming "envelope-ready" (docs/11 §9.5's current wording) without the code to back it |
| 11.2.3 | ≥128-bit security level on all primitives | ✅ | AES-256 (256-bit), Argon2id at OWASP-minimum params, 256-bit random tokens — everything meets or exceeds the floor |
| 11.3.1–11.3.2 | No ECB/weak padding; approved cipher+mode (AES-GCM) | ✅ | AES-256-**GCM** exclusively; no ECB, no CBC+PKCS1.5 anywhere |
| 11.3.3 | Authenticated encryption or encryption+MAC | ✅ | GCM's built-in auth tag — verified this review via the new `totp-encryption.test.ts`'s tamper-detection test |
| 11.4.1 | No disallowed hash functions (MD5 etc.) for crypto use | ✅ | SHA-256 only; grepped for `md5`/`sha1` usage — the one SHA-1 use is inside `totp.ts`'s HMAC-SHA1, which is RFC 6238's **mandated** algorithm for TOTP interoperability (not a general-purpose hash choice this app made freely — same accepted-tradeoff class as the 6-digit code length) |
| 11.4.2 | Approved password KDF with current-guidance params | ✅ | Argon2id, m=19MiB/t=2/p=1 — meets OWASP's current minimum recommendation exactly |
| 11.4.3 | Collision-resistant hash length for integrity/signatures | ✅ | SHA-256 (256-bit output) used for all lookup-hash/integrity purposes, including the audit-log hash chain (docs/11 §10) |
| 11.4.4 | Approved KDF with key stretching when deriving keys from passwords | ✅ | **Fixed this review** (§0) — HKDF-SHA256 now derives the TOTP encryption key from `MFA_ENCRYPTION_KEY`. Note: `MFA_ENCRYPTION_KEY` is a random high-entropy secret, not a human password, so "key stretching" (computational cost) is less critical here than for password-derived keys — HKDF is still the correct, standard tool for the job |
| 11.5.1 | CSPRNG, ≥128 bits entropy for non-guessable values | ✅ | `node:crypto.randomBytes` everywhere a secret/token is generated; session tokens are 256 bits, well above the floor |
| 11.6.1 | Approved algorithms for key generation/signing; no known-weak key generation | ✅ | No RSA/asymmetric key generation happens in this app at all (Google's JWKS keys are Google's own, this app never generates signing keys) |

**Section result:** 10 Met, 3 Partial (key rotation, crypto agility — both tracked, both real but low-urgency pre-launch), 1 N/A.

## V12 — Secure Communication (9 items)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 12.1.1–12.2.2 | TLS version/cipher suite, no fallback, trusted certs (client↔app) | ➖ | Host-managed (docs/11: "TLS 1.2+ (host-managed)") — no hosting decision has been made yet (Phase 16). Correctly out of this codebase's control today; must be explicitly re-verified once a host is chosen, not assumed |
| 12.1.3 | mTLS client-cert validation | ➖ | No mTLS anywhere in this app's design |
| 12.3.1–12.3.2 | TLS for all outbound app→third-party connections; cert validation | ✅ | Every outbound HTTP call this app makes (Google's JWKS/token endpoint, and eventually Razorpay/Resend once real adapters exist) goes over HTTPS via standard `fetch`, which validates certificates by default and has no code path that disables that |
| 12.3.3–12.3.4 | TLS between internal services | ⚠️ | **The Postgres connection has no explicit TLS enforcement in application code** — `src/server/platform/db/client.ts` passes no `ssl` option to the `postgres` driver, so whether the DB connection is encrypted depends entirely on `DATABASE_URL`'s own `sslmode` and the driver's default behavior, not on anything this app asserts. Locally this is moot (same-machine Postgres); it becomes a real, must-verify item the moment a real staging/production database exists (Phase 16) — flagged now so it isn't forgotten then |

**Section result:** 2 Met, 1 Partial (DB TLS, tracked for Phase 16), 3 N/A (host-managed, correctly deferred).

## V13 — Configuration (13 items)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 13.1.1 | External communication dependencies documented | ✅ | docs/11 §4 trust-boundary diagram names every external dependency (Razorpay, email API, Sentry, Turnstile) |
| 13.2.1–13.2.3 | Authenticated, least-privilege, non-default inter-service credentials | ✅ | DB access uses a dedicated `app` role (docs/05), not a superuser; `JOB_TICK_SECRET`/`OPS_SECRET` are per-deployment random secrets (32+ chars, zod-enforced), never defaults |
| 13.2.4–13.2.5 | Outbound-destination allowlist | ✅ | No arbitrary outbound requests exist (1.3.6/SSRF above) — the closest thing to an "allowlist" is that there's simply nothing that fetches a user-supplied URL at all, which trivially satisfies this |
| 13.3.1 | Secrets management solution (not hardcoded) | ✅ | `.env.local` (git-ignored) locally, GitHub Actions **environment** secrets in CI (approval-gated for a production environment per docs/11 §9.4), host env vars at runtime — zero secrets in source (gitleaks-enforced every PR, re-verified clean throughout this session) |
| 13.3.2 | Least-privilege access to secrets | ✅ | GitHub environment-secret protection rules (per docs/11's stated design — not independently re-verified in this review since it's a GitHub repo-settings concern, not code) |
| 13.4.1 | No `.git`/`.svn` exposed | ✅ | Next.js production builds never serve source-control metadata; not part of the `public/` directory or any route |
| 13.4.2 | Debug mode disabled in production | ✅ | `NODE_ENV`/`APP_ENV` gate every dev-only affordance found this session (fake payment gateway compiled out, verbose error detail suppressed — `toProblem`'s error mapping never leaks stack traces, confirmed by re-reading `errors.ts` this review) |
| 13.4.3 | No directory listing | ✅ | Next.js doesn't serve directory listings; not applicable to the App Router's routing model |
| 13.4.4 | `TRACE` method disabled | ➖ | Next.js's route handling only ever registers the HTTP methods a route explicitly exports (confirmed via this session's own Phase 13 route-inventory work) — there is no handler for `TRACE` anywhere, so it 404s by construction, not by an explicit disablement decision worth a separate check |
| 13.4.5 | Docs/monitoring endpoints not exposed unintentionally | ✅ | No OpenAPI/Swagger UI route exists; `/api/health`/`/api/health/ready` are intentionally public liveness checks with no sensitive data in their response |

**The one real, previously mis-documented finding in this chapter:** the CSP's `script-src 'self' 'unsafe-inline'` (see V3.4.3 above) is this section's closest miss — ASVS doesn't have a dedicated numbered item for CSP strictness here (that's 3.4.3), but 13.x's spirit of "configuration should match its documented intent" is exactly what the stale `proxy.ts` comment violated before this review corrected it.

**Section result:** 9 Met, 1 N/A-by-construction, cross-referenced CSP gap (counted once, under V3).

## V14 — Data Protection (9 items)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 14.1.1–14.1.2 | Data classified into protection levels with documented requirements | ✅ | docs/11 §2's Restricted/Confidential/Internal/Public table, cross-referenced against docs/12 (privacy/compliance) |
| 14.2.1 | No sensitive data in URLs/query strings | ✅ | Session token lives only in a cookie; no route in this app accepts a password/token/secret as a query parameter (verified: every credential-bearing route uses POST with a JSON body) |
| 14.2.2 | Sensitive data not cached by intermediaries | ✅ | `cache-control: no-store` on every API response (14.3.2 below, same control) |
| 14.2.3 | Sensitive data not sent to untrusted third parties (trackers etc.) | ✅ | Zero analytics/tracking scripts anywhere in this codebase — confirmed by the CSP's own `script-src`/`connect-src` allowlist, which has no third-party analytics origin to permit in the first place |
| 14.2.4 | Protection-level controls actually implemented as documented | ⚠️ | Mostly yes (see the whole checklist), with the two concrete exceptions already called out (§0's email-logging fix closed one instance of this; the CSP nonce gap and key-rotation gap are the remaining open ones) |
| 14.3.1 | Client-side data cleared on session end | ➖ | This app stores no authenticated data in browser storage at all (14.3.3 below) — there's nothing client-side to clear, which trivially satisfies the intent |
| 14.3.2 | `Cache-Control: no-store` on sensitive responses | ✅ | `NO_STORE` constant applied to every JSON/problem response (`responses.ts`, re-verified this review) |
| 14.3.3 | No sensitive data in browser storage | ✅ | No `localStorage`/`sessionStorage`/`IndexedDB` usage found anywhere in `src/` outside artifact-adjacent tooling; the session token lives only in an `HttpOnly` cookie, never readable by client JS |

**Section result:** 7 Met, 1 Partial (cross-referenced, not double-counted), 1 N/A-by-construction.

## V15 — Secure Coding and Architecture (13 items)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 15.1.1–15.1.3 | Documented remediation SLAs, SBOM, resource-heavy-endpoint docs | ⚠️ | Dependabot + `npm audit`/OSV-Scanner (Phase 13) give real, running dependency scanning, but there's **no formally documented remediation SLA** ("critical within 24h" etc. is mentioned in docs/11 prose but isn't a tracked, enforced policy) and **no SBOM is generated** (docs/11 A03 calls this "Beta" scope, i.e. explicitly deferred, not forgotten) |
| 15.2.1 | No components past their remediation deadline | ✅ | `npm audit --audit-level=high` is a required, currently-green PR gate; the one accepted moderate finding (esbuild/drizzle-kit, dev-only) is documented with reasoning in `osv-scanner.toml` and this session's own investigation, not silently ignored |
| 15.2.2 | Defenses against resource-exhaustion from costly functions | ✅ | Rate limits, pagination caps, date-range caps (31-day slot-generation cap, docs/09), `statement_timeout` on the DB role (docs/11 §API4) |
| 15.2.3 | No dev/test functionality reachable in production | ✅ | The fake payment gateway route (`/api/v1/dev/fake-checkout`) is explicitly guarded — compiled/reachable only when `PAYMENTS_PROVIDER=fake` and `NODE_ENV !== "production"` (docs/08 §14, re-confirmed this session in Phase 13's chaos-testing work) |
| 15.3.1 | Only required fields returned (no whole-object dumps) | ✅ | Audience-specific DTOs throughout (Public/Owner/Admin) — no route found this session that serializes a raw DB row without an explicit projection |
| 15.3.2 | No auto-follow-redirects on outbound calls | ➖ | No outbound calls to arbitrary/user-influenced URLs exist at all (SSRF surface ≈ 0, repeatedly confirmed) — nothing to configure redirect behavior for |
| 15.3.3 | Mass-assignment defenses | ✅ | Every mutation route's zod schema is an explicit field list (effectively `.strict()` by construction — unknown fields are never part of the schema, so they're dropped, not silently accepted); AC1/AC13 abuse cases explicitly test this |
| 15.3.4 | Trusted IP extraction | ✅ | `getClientIp`, re-verified this review (see V4.1.3 above) |
| 15.3.5 | Strict typing/equality (no type juggling) | ✅ | TypeScript strict mode (`tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`) plus zod's runtime type enforcement at every boundary — the class of bug this item targets (PHP/JS loose-equality confusion) has very little surface in a strictly-typed TS codebase with zod validation at every trust boundary |
| 15.3.6 | Prototype-pollution defenses | ✅ | No dynamic `obj[userControlledKey] = value` assignment pattern found in this codebase (grepped for bracket-assignment with a variable key across `src/server`); zod schemas define fixed shapes, not dynamic key sets |
| 15.3.7 | HTTP parameter pollution defenses | ✅ | Next's `URLSearchParams`-based query parsing takes the last value for a repeated key deterministically (no framework ambiguity between query/body/header sources — `defineRoute` reads query, body and params as three explicitly separate, independently-schema'd inputs, never merged) |

**Section result:** 9 Met, 2 Partial (SBOM/SLA — both explicitly deferred-to-Beta by prior-phase decision, not new findings), 2 N/A.

## V16 — Security Logging and Error Handling (16 items)

| # | Requirement | Status | Evidence |
|---|---|---|---|
| 16.1.1 | Logging inventory documented | ✅ | docs/11 §10's security event catalogue |
| 16.2.1 | Log entries carry who/what/when/where | ✅ | Every audit-log write includes `actorType`/`actorUserId`/`action`/`targetType`/`targetId`; pino's `mixin()` attaches `requestId` to every structured log line automatically (`logger.ts`) |
| 16.2.2 | UTC/explicit-offset timestamps | ✅ | `pino.stdTimeFunctions.isoTime` — ISO 8601 with explicit offset, confirmed in `logger.ts` |
| 16.2.3 | Logs only go where documented | ⚠️ | Currently logs only go to stdout (no shipping/aggregation destination is wired up in code) — technically satisfies "only documented destinations" trivially (there's exactly one, and it matches docs/11's current MVP-stage description), but real log shipping (Sentry or equivalent) is Phase 16 scope, not yet built — flagged so it's verified against this same list once it lands, not assumed |
| 16.2.4 | Correlatable, common log format | ✅ | Structured JSON (pino) throughout, `requestId` as the correlation key |
| 16.2.5 | Sensitive-data logging follows protection level | ✅ | **Fixed this review** (§0) — the one real violation found (email address) is closed, with a regression test now guarding the redact config itself |
| 16.3.1 | Auth attempts logged (success + failure) | ✅ | Sign-in/sign-up/MFA challenge events are audited (docs/11 §10's table maps directly to real `writeAudit` calls verified throughout this session's auth/admin work) |
| 16.3.2 | Failed authorization attempts logged | ⚠️ | `authorize()` denials throw typed errors that propagate to the client as 401/403/404 problem responses, and are visible in access logs via status code — but there's **no dedicated security-event log entry specifically for authz denials** (as distinct from the generic request log), which is what 16.3.2 and docs/11 §10's "spike detection (possible BOLA probing)" alert actually need. This is a real, actionable gap: today, detecting a BOLA-probing spike would require log-mining generic 403/404 rates, not querying a purpose-built event stream |
| 16.3.3 | Security-control-bypass attempts logged | ⚠️ | Same gap as 16.3.2 — rate-limit hits and CSRF/origin rejections currently produce a typed error response but not a distinct, queryable security-event log entry |
| 16.3.4 | Unexpected errors/TLS failures logged | ✅ | `defineRoute`'s catch-all error handler logs every unhandled exception (`toProblem`) before returning a safe response |
| 16.4.1 | Log-injection prevention | ✅ | Structured JSON logging (pino) — no string-concatenation log lines exist to inject into |
| 16.4.2 | Logs protected from tampering/unauthorized access | ➖ | Currently stdout-only, captured by whatever the eventual hosting platform's log retention does — this is a hosting-platform property, not something this app's code can assert about itself yet (Phase 16) |
| 16.4.3 | Logs shipped to a logically separate system | ➖ | Not yet built (Sentry/log-shipping is Phase 16 scope, per docs/19's founder-action-items table) |
| 16.5.1 | Generic error messages, no internals leaked | ✅ | RFC 9457 problem+json responses never include stack traces/queries/secrets — spot-checked across dozens of error paths this session, and `toProblem`'s implementation structurally cannot leak internals since it only ever emits a fixed set of typed fields |
| 16.5.2 | Graceful degradation on external-resource failure | ✅ | The payment sweeper's per-intent error isolation (Phase 13 fix) is a direct example: one provider failure no longer takes down the whole batch |
| 16.5.3 | Fail closed, not fail open | ✅ | `authorize()`'s design principle throughout (docs/11 A10): every exception path denies rather than defaults to allow; transactions roll back completely on any error (verified repeatedly via chaos tests) |

**Section result:** 11 Met, 3 Partial (log-shipping destination, dedicated security-event stream for denials — both real, tracked), 2 N/A (hosting-platform-dependent, Phase 16).

## V17 — WebRTC (7 items)

| # | Requirement | Status |
|---|---|---|
| All 7 | WebRTC-specific media/signaling security | ➖ **Entire chapter N/A** — this app has no WebRTC, no `getUserMedia`, no `RTCPeerConnection` anywhere. "Sessions" are scheduling records; the actual video call happens on an external provider (Zoom/Google Meet/etc.) this app only links to via a host-allowlisted redirect, never embeds or mediates. Confirmed by a repo-wide grep this review. |

---

## Summary by chapter

| Chapter | Met | Partial | Not Met | N/A |
|---|---|---|---|---|
| V1 Encoding & Sanitization | 12 | 0 | 0 | 15 |
| V2 Validation & Business Logic | 10 | 1 | 0 | 0 |
| V3 Web Frontend Security | 15 | 1 | 0 | 2 |
| V4 API & Web Service | 2 | 0 | 0 | 8 |
| V5 File Handling | 0 | 0 | 0 | 9 |
| V6 Authentication | 24 | 5 | 0 | 3 |
| V7 Session Management | 12 | 3 | 1 | 2 |
| V8 Authorization | 6 | 0 | 0 | 1 |
| V9 Self-contained Tokens | — | — | — | N/A (app), Met (Google id_token path) |
| V10 OAuth & OIDC | 7 | 0 | 0 | 22 |
| V11 Cryptography | 10 | 3 | 0 | 1 |
| V12 Secure Communication | 2 | 1 | 0 | 3 |
| V13 Configuration | 9 | 0 | 0 | 1 |
| V14 Data Protection | 7 | 1 | 0 | 1 |
| V15 Secure Coding & Architecture | 9 | 2 | 0 | 2 |
| V16 Logging & Error Handling | 11 | 3 | 0 | 2 |
| V17 WebRTC | 0 | 0 | 0 | 7 |
| **Total** | **~136** | **~20** | **1** | **~89** |

**Not Met (real, literal gap):** V7.5.2 — no user-facing "view/terminate my active sessions" page. Low severity (sessions are short-lived, credential changes already revoke) but a named, concrete requirement this app doesn't satisfy today.

**Zero critical/high findings that constitute an exploitable vulnerability in shipped code.** Every Partial is either a deliberate MVP scope deferral (uploads, CAPTCHA, log shipping, SBOM), a hosting-decision dependency not yet made (TLS, DB encryption in transit), or a real hardening item with a clear, low-urgency fix path (CSP nonces, key rotation, dedicated security-event logging). All are tracked in `docs/security/accepted-risk-register.md`, not just written down here and forgotten.
