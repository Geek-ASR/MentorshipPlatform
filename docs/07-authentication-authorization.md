# 07 — Authentication & Authorization

Status: ✅ Implemented (2026-09-22, Phase 5) for everything in this document except Turnstile and passkeys — see the implementation note below. Target: OWASP ASVS 5.0 Level 2 (V6 Authentication, V7 Session Management, V8 Authorization)

**Implementation note (Phase 5):** the flows, session rules, password policy, MFA design and authorization model below were built as specified, in `src/server/modules/auth`. Two deviations from the original draft, both deliberately decided and recorded as ADRs: the auth core is hand-written directly on the platform's request pipeline rather than the Better Auth library (**ADR-023**, supersedes ADR-004), and Turnstile is deferred until a real domain exists to register it against, with rate limits standing in for now (**ADR-024**). Passkeys remain Beta-deferred, as originally planned. Google OAuth, HIBP breach checking, pre-hijack account takeover and every session/step-up rule in this document are implemented and integration-tested, not just planned.

## 1. Provider decision (superseded — see implementation note above)

**Better Auth** (open-source TypeScript library) stores users, accounts, sessions, verification tokens and 2FA secrets **in our Postgres**. Rationale and comparison: [04 §4.4](04-system-architecture.md#44-authentication), ADR-004. **Phase 5 built the auth core directly on the platform's own primitives instead — see ADR-023.**

Key reasons: DB-backed sessions revoke instantly on ban or password change; no per-MAU cost; no vendor-held identity; plugins for TOTP 2FA and passkeys; built-in origin checks and rate limiting.

Risks & mitigations:
- The library can have vulnerabilities. Pin versions, subscribe to its GitHub security advisories, run Dependabot, and enable only needed plugins (no API-key plugin, no anonymous plugin in MVP).
- We own more of the security surface than with a hosted IdP, so the auth flows get dedicated test suites ([13](13-testing-strategy.md)).

## 2. Identity model

- **One account per person.** Roles are capabilities on that account: every user can act as a student; approved mentors additionally have `mentor`; staff have staff roles.
- Login methods (`auth_accounts`): `credential` (email + password) and `google`. Multiple methods can link to one user.
- `users.email` is `citext` and unique. Emails are normalised with lowercase and trim. Plus-addressing is **not** stripped (it can be legitimate), but the risk engine flags many accounts that share a base address (Beta).

## 3. Flows

### 3.1 Sign-up (email + password)
1. Turnstile token + email + password + display name + **18+ attestation with birth year** + consent to Terms/Privacy (versioned, stored in `user_consents`).
2. Response is **always** "Check your inbox" (no enumeration). If the email already exists, the existing owner gets an "attempted sign-up" email instead.
3. Email verification link: random 32-byte token, **stored hashed**, single use, 24 h expiry.
4. Unverified users can browse and save mentors, but **cannot** book, pay, message, review, apply as mentor or report-spam-flood (limited reports).

### 3.2 Sign-in
- Generic error on failure ("Email or password is incorrect"), with equalised timing (verify against a dummy hash when the user doesn't exist).
- Throttling: per-account progressive delay after 5 failures (up to 15 min), per-IP limits, Turnstile after 3 failures. **No hard lockout** (prevents lockout-DoS).
- On success: new session id (prevents fixation), `auth_time` recorded, "new device sign-in" email if the device/IP prefix is new (Beta: risk-based).
- If MFA is enrolled: password step → TOTP/backup code step (the pending state lasts only 5 minutes).

### 3.3 Google OAuth
- Authorization Code + PKCE + `state` + `nonce`. Accept only `email_verified=true` Google identities.
- **Account pre-hijacking defence:** if a local credential account exists for the email but is **unverified**, Google sign-in (verified) takes ownership, and the unverified password credential is deleted and the user notified. If the local account **is verified**, automatic linking happens only when the Google email matches exactly; otherwise the user must sign in with the password first and link from settings.

### 3.4 Password reset
- Request → generic response → emailed link (32-byte token, hashed, single use, **30 min** expiry).
- On reset: all sessions revoked, all outstanding reset tokens invalidated, notification email sent.

### 3.5 Email change (step-up required)
- Verification link to the **new** address; the change applies only after confirmation.
- The **old** address gets a "Wasn't you?" link valid 7 days that reverts the change and revokes sessions.

### 3.6 MFA
- TOTP (RFC 6238, SHA-1/30 s/6 digits for authenticator compatibility), secret encrypted at rest; 10 single-use backup codes, hashed.
- **Mandatory** for all staff roles (enforced at role grant and every staff request).
- **Strongly prompted** for mentors, and required before adding or changing a payout account (Beta: mandatory for all mentors with earnings).
- Passkeys (WebAuthn) in Beta.
- Lost MFA: backup code → otherwise support-assisted recovery. This needs proof of email control plus a **72 h delay** with notifications to all known contact points, and all sessions and payout changes stay frozen during the delay.

### 3.7 Sign-out & session management
- Sign-out deletes the server session. "Sign out of all devices" is available. The session list shows device, approximate location (country from IP, not stored long-term) and last active time.

## 4. Password policy

Aligned with ASVS 5.0 / NIST SP 800-63B guidance:

| Rule | Value |
|------|-------|
| Minimum length | **12** characters (configurable; ASVS requires ≥ 8 and strongly recommends ≥ 15) |
| Maximum length | ≥ 64 (we allow 128) |
| Composition rules | None (no forced symbols or digits) |
| Breached password check | Have I Been Pwned k-anonymity range API on sign-up, reset and change (fail-open with logging if the API is unavailable) |
| Context blocklist | Brand name, email local part, display name |
| Strength meter | zxcvbn-ts (advisory) |
| Rotation | No periodic rotation; force reset only on evidence of compromise |
| Paste / password managers | Allowed |
| Hashing | **Argon2id** (m = 19 MiB, t = 2, p = 1; OWASP minimum) via a native binding; parameters stored with the hash for future upgrades; rehash on login when parameters change |

## 5. Sessions

| Property | Value |
|----------|-------|
| Storage | `auth_sessions` table (id = 256-bit random; only a **hash** of the token is stored) |
| Cookie | `__Host-aheadly_session` (brand-configurable name), `HttpOnly; Secure; SameSite=Lax; Path=/`, no `Domain` |
| Idle timeout | 7 days sliding (refresh at most once per 24 h) |
| Absolute lifetime | 30 days, then re-authentication |
| Staff sessions | Idle 1 h, absolute 12 h |
| Cookie cache | **Disabled** (or ≤ 60 s) so bans and revocations apply immediately |
| Recent-auth window (step-up) | 10 minutes since last password/MFA/passkey verification |
| Revocation triggers | Password change/reset, MFA reset, email change revert, suspension or ban, staff role change, user "sign out everywhere" |
| Binding | Not hard-bound to IP (mobile networks). IP prefix and UA hash stored for anomaly display and risk signals |

**Step-up required for:** change email or password, enable/disable MFA, add/change payout account, delete account, view verification documents (staff), bans and suspensions, refunds, commission/settings changes, role grants, revealing a student's contact data (never in MVP).

## 6. Authorization model

### 6.1 Roles

| Role | Granted by | Purpose |
|------|-----------|---------|
| `student` | Default | Book, review, message, report |
| `mentor` | Admin approval of application | Offer services, host sessions, receive payouts |
| `event_host` | Admin (approved mentors or partners) | Create public free events |
| `content_editor` | Admin | Guides, taxonomy, universities |
| `verification_reviewer` | Admin | Review credentials |
| `moderator` | Admin | Reports, cases, enforcement (non-permanent) |
| `finance` | Super admin | Refunds, transfers, reconciliation |
| `admin` | Super admin | Everything operational except role grants of `admin`/`super_admin` |
| `super_admin` | Bootstrap only (CLI) | Role management, critical settings |

Separation of duties:
- Staff **cannot act on cases involving themselves** or users with whom they have bookings or conversations (conflict check).
- **Permanent bans** and **refunds above a threshold** (default ₹10,000) require a second staff approver.
- Staff accounts are separate from personal mentor/student accounts (policy + check on role grant).

### 6.2 Permission matrix (abridged)

| Action | Student | Mentor | Moderator | Verif. reviewer | Finance | Admin |
|--------|:------:|:------:|:---------:|:---------------:|:-------:|:-----:|
| View public mentor profile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Book a session (not with self) | ✓ | ✓ | — | — | — | — |
| View booking | own | own/hosted | case-linked | — | ✓ (money view) | ✓ |
| Cancel booking | own (policy) | hosted (policy) | — | — | — | ✓ (admin cancel) |
| View student profile | self | booked students, visible fields | case-linked | — | — | ✓ |
| Edit mentor services/availability | — | own | — | — | — | ✓ (support, audited) |
| Leave review | completed own booking | completed own booking (private feedback) | — | — | — | — |
| Remove review | — | — | ✓ | — | — | ✓ |
| Review verification | — | — | — | ✓ | — | ✓ |
| View verification document | own uploads | own uploads | — | ✓ (step-up, audited) | — | ✓ (step-up, audited) |
| Warn / restrict / temp-suspend | — | — | ✓ | — | — | ✓ |
| Permanent ban | — | — | propose | — | — | ✓ + second approver |
| Refund (≤ threshold) | — | — | — | — | ✓ | ✓ |
| Refund (> threshold) | — | — | — | — | ✓ + approver | ✓ + approver |
| Release/hold transfer | — | — | — | — | ✓ | ✓ |
| Change commission/settings | — | — | — | — | — | ✓ (super_admin for critical keys) |
| Grant roles | — | — | — | — | — | super_admin |
| Read audit log | — | — | own actions | own actions | money scope | ✓ |

### 6.3 Enforcement design

```ts
// src/server/platform/authz
type Actor = {
  userId: string; roles: ReadonlySet<Role>; status: UserStatus;
  restrictions: ReadonlyArray<Restriction>;   // e.g. { capability: 'booking.create', until }
  authTime: Instant; mfaVerified: boolean; emailVerified: boolean;
};
type Decision = { allow: true } | { allow: false; code: 'FORBIDDEN'|'NOT_FOUND'|'ACCOUNT_RESTRICTED'|'REAUTH_REQUIRED'|'MFA_REQUIRED'|'EMAIL_NOT_VERIFIED'; reason: string };

// each module exports pure policies
export const bookingPolicies = {
  'booking:view':   (a: Actor, b: BookingAuthzView) => isParticipant(a, b) || isHost(a, b) || hasRole(a,'admin') ? allow() : notFound(),
  'booking:cancel': (a: Actor, b: BookingAuthzView) => ...,
};
```

Rules:
1. **Every application service method takes `actor` as its first argument and calls `authorize()` before side effects.** A lint rule and code review checklist enforce this. There is no "internal" bypass except for system jobs, which use an explicit `SystemActor`.
2. **Queries are scoped as well** (defense in depth): repositories expose `findForParticipant(userId, bookingId)` rather than only `findById`.
3. **404 for invisible, 403 for visible-but-forbidden.**
4. **Restrictions are checked centrally** in `authorize()` via capability names, so trust & safety can restrict `message.send` without touching the messaging code.
5. Admin pages check the role in the server layout **and** every admin API handler checks again. Next.js middleware is never the only check (CVE-2025-29927).
6. Object-level tests: for every endpoint with a path id, CI runs a **BOLA matrix** (owner, other user, other mentor, anonymous, each staff role) asserting status codes ([13 §5](13-testing-strategy.md#5-authorization-bola-matrix)).
7. Field-level: response DTOs are built per audience (`PublicMentorDTO`, `OwnerMentorDTO`, `AdminMentorDTO`). Sensitive fields never reach public DTOs.

## 7. Account states

| Status | Login | Allowed |
|--------|-------|---------|
| `active` | ✓ | Per roles/restrictions |
| `restricted` | ✓ | Everything except restricted capabilities |
| `suspended` | ✓ (limited) | View restriction notice, appeal, data export, contact support, see existing bookings (cancelled/refunded per policy) |
| `banned` | ✓ (limited) | Same as suspended; no new appeal after a final decision |
| `deletion_requested` | ✓ | Cancel deletion, export data |
| `deleted` | ✗ | — |

## 8. CSRF

- Session cookie `SameSite=Lax` blocks cross-site POSTs carrying cookies in modern browsers.
- **Origin verification** on every non-GET request: `Origin` (or `Sec-Fetch-Site: same-origin`) must match the allowlisted app origin, else `403`.
- **JSON-only mutations**: requests without `Content-Type: application/json` are rejected (cross-site HTML forms can't send it without a CORS preflight, which we don't allow).
- No CORS for `/api/v1` (same-origin app). If a public API is opened later, it uses token auth, not cookies.
- GET handlers never mutate state (join-link GET only logs an attendance signal, which is harmless and idempotent).

## 9. Machine authentication

| Caller | Mechanism |
|--------|-----------|
| Payment webhooks | Provider HMAC signature over the raw body; secret per environment |
| Job tick | `Authorization: Bearer <256-bit secret>`, constant-time comparison, rotated quarterly |
| CI → migrations | Separate DB role credentials in GitHub Actions encrypted secrets (environment-protected) |

## 10. Staff access hardening

- MFA mandatory; staff sessions have short lifetimes; step-up for destructive actions.
- **No impersonation in MVP.** Beta: read-only "view as user" with a visible banner, a mandatory reason, an audit entry and user-visible access history.
- Admin UI served under the same origin but with a stricter CSP and `noindex`.
- Break-glass `super_admin` bootstrap only via a CLI script with DB migrator credentials; audited.
- Quarterly access review of staff roles (documented procedure).

## Sources

- OWASP ASVS 5.0: https://github.com/OWASP/ASVS
- OWASP Authentication, Session Management, Password Storage, CSRF cheat sheets: https://cheatsheetseries.owasp.org/
- Better Auth: https://better-auth.com/
- Next.js middleware bypass CVE-2025-29927 (reason for "no middleware-only authz"): https://github.com/vercel/next.js/security/advisories
