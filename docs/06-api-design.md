# 06 — API Design

Status: Draft v0.1 · 2026-09-17

## 1. Style decision: REST (not GraphQL)

| Criterion | REST | GraphQL |
|-----------|------|---------|
| Webhooks, file uploads, redirects (join links), ICS downloads | Natural | Awkward / out-of-band anyway |
| HTTP caching of public data (taxonomy, events) | Native | Needs persisted queries |
| Authorization surface | Per-endpoint, easy to test as a BOLA matrix | Per-field resolvers; easier to leak via nested queries |
| Rate limiting & cost control | Per route | Needs query-cost analysis |
| Consumers | One web app now; possibly mobile later | Shines with many heterogeneous clients |
| Team size/complexity | Low | Higher |

**Decision:** versioned REST + JSON, documented with OpenAPI 3.1 generated from zod schemas. Server components call application services directly (not over HTTP); the REST API is the contract for client components, future mobile apps and integrations. (ADR-015)

## 2. Conventions

| Topic | Rule |
|-------|------|
| Base path | `/api/v1` (webhooks: `/api/webhooks/{provider}`; internal: `/api/internal/*`) |
| Format | `application/json; charset=utf-8`. Mutations **require** `Content-Type: application/json` (CSRF defence, see [07](07-authentication-authorization.md#8-csrf)) |
| Naming | Plural nouns, kebab-case paths, camelCase JSON fields |
| IDs | Opaque strings (UUIDv7) or slugs for public resources |
| Time | ISO 8601 UTC instants (`2026-10-01T08:30:00Z`); time zones as IANA names; durations in minutes (`durationMin`) |
| Money | `{ "amountMinor": "200000", "currency": "INR" }`, with the amount as a **string** (bigint-safe) |
| Actions | State transitions as sub-resources: `POST /bookings/{id}/cancel`, not `PATCH status` |
| DTOs | Explicit response schemas; **never** serialise DB rows; no internal fields (`version` exposed only as `ETag`) |
| Input | zod `.strict()` schemas, so unknown fields are rejected (mass-assignment defence) |
| Optimistic concurrency | `ETag` on mutable resources; `If-Match` required on profile/settings updates → `412 PRECONDITION_FAILED` |
| Idempotency | `Idempotency-Key` header **required** on: create booking, seat booking, payment confirm/retry, cancel, reschedule, refunds, dispute creation, admin money actions. Keys are 16–128 chars, scoped per actor + route, retained 24 h. Same key + different body → `422 IDEMPOTENCY_KEY_REUSED`; same key while in progress → `409 REQUEST_IN_PROGRESS` |
| Request ID | Every response has `X-Request-Id`; clients may send one (validated format) |
| Caching | Default `Cache-Control: no-store`; public reference data `public, s-maxage=300, stale-while-revalidate=600` |

## 3. Pagination, filtering, sorting

- **Cursor pagination** everywhere lists can grow: `?limit=20&cursor=<opaque>`. `limit` defaults to 20, max 100.
- Response envelope:
  ```json
  { "data": [ ... ], "page": { "nextCursor": "eyJrIjoiMjAyNi0xMC0wMVQw…", "hasMore": true } }
  ```
- Cursor = base64url(JSON of the sort key tuple + id), HMAC-signed to prevent tampering and injection through cursors.
- Filters are **allowlisted** named params (no generic `where`). Multi-value params are repeated or comma-separated: `?university=tu-munich,rwth-aachen`.
- Sorting via enumerated `sort` values (`relevance`, `price_asc`, `price_desc`, `rating`, `soonest_available`, `newest`).
- Admin exports use async jobs, not unbounded pages.

## 4. Errors (RFC 9457 Problem Details)

```json
{
  "type": "https://docs.aheadly.example/problems/slot-unavailable",
  "title": "This time slot is no longer available",
  "status": 409,
  "code": "SLOT_UNAVAILABLE",
  "detail": "Someone else just booked this time. Please pick another slot.",
  "instance": "/api/v1/bookings",
  "requestId": "01J8Z6J3N7M4…",
  "errors": [ { "path": "startsAt", "code": "slot_taken", "message": "Slot taken" } ]
}
```

Content type `application/problem+json`. **No stack traces, SQL or provider error bodies are ever returned.** Internal details go to logs with the same `requestId`.

| HTTP | `code` | When |
|------|--------|------|
| 400 | `BAD_REQUEST` | Malformed JSON, bad cursor |
| 401 | `UNAUTHENTICATED` | No/expired session |
| 401 | `REAUTH_REQUIRED` | Step-up needed (recent-auth window elapsed) |
| 403 | `MFA_REQUIRED` | Staff or sensitive action without MFA |
| 403 | `FORBIDDEN` | Actor can see the resource but may not perform the action |
| 403 | `ACCOUNT_RESTRICTED` | Active restriction blocks the capability (includes `restriction` and `appealUrl`) |
| 403 | `EMAIL_NOT_VERIFIED` | Action requires verified email |
| 404 | `NOT_FOUND` | Missing **or not visible to the actor** (anti-enumeration) |
| 409 | `CONFLICT` | Version conflict, duplicate |
| 409 | `SLOT_UNAVAILABLE` | Exclusion constraint / capacity reached |
| 409 | `HOLD_EXPIRED` | Payment attempted after the hold lapsed and the slot is gone |
| 409 | `INVALID_STATE_TRANSITION` | E.g. cancel a completed booking |
| 409 | `REQUEST_IN_PROGRESS` | Same idempotency key in flight |
| 412 | `PRECONDITION_FAILED` | `If-Match` mismatch |
| 413 | `PAYLOAD_TOO_LARGE` | Body/upload limits |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Wrong content type |
| 422 | `VALIDATION_FAILED` | Schema/business validation (with `errors[]`) |
| 422 | `BOOKING_NOT_ELIGIBLE` | Min notice, max per day, self-booking, mentor not payable, age… (`reason` field) |
| 422 | `IDEMPOTENCY_KEY_REUSED` | Same key, different payload |
| 402 | `PAYMENT_FAILED` | Provider reported failure |
| 400 | `PAYMENT_VERIFICATION_FAILED` | Bad signature / mismatched order |
| 429 | `RATE_LIMITED` | With `Retry-After` |
| 502/503 | `PROVIDER_UNAVAILABLE` | Payment/email provider outage (safe to retry with same idempotency key) |
| 500 | `INTERNAL` | Unexpected (generic message) |
| 503 | `MAINTENANCE` | Feature flag kill-switch active |

## 5. Rate limits (initial, configurable)

Keyed by actor id when authenticated, else by IP (IPv6 /64). Responses include `RateLimit-*` headers (IETF draft) and `Retry-After`.

| Route group | Limit |
|------------|-------|
| Sign-in | 5 / 15 min per account + 20 / 15 min per IP; Turnstile after 3 failures |
| Sign-up, password reset, verification email resend | 3 / hour per email + 10 / hour per IP; Turnstile |
| Public search/listing | 60 / min per IP |
| Availability lookups | 30 / min per actor/IP |
| Create booking / seat | 10 / hour per actor |
| Messages | 30 / hour per actor; pre-booking inquiries 5 / day |
| Reports | 20 / day per actor |
| Uploads presign | 20 / hour per actor |
| Admin APIs | 300 / min per staff actor |
| Webhooks | No app-level limit (signature-gated); body size ≤ 256 KB |

## 6. Versioning & deprecation

- Breaking changes go into `/api/v2`. Additive changes (new optional fields, new endpoints) stay in v1.
- Deprecated endpoints send `Deprecation` and `Sunset` headers for ≥ 90 days (external consumers only; our web app deploys atomically).

## 7. Endpoint catalog (v1)

`A` = anonymous allowed · `U` = authenticated user · `M` = approved mentor · `S` = staff (role noted) · 🔑 = Idempotency-Key required · ⏱ = step-up (recent auth)

### 7.1 Identity & account
| Method & path | Auth | Notes |
|---------------|------|-------|
| `/api/auth/*` | A/U | Better Auth: email sign-up/in, verify email, reset password, Google OAuth, TOTP, sessions |
| `GET /me` | U | Account summary, roles, restrictions, verification state |
| `PATCH /me` | U | displayName, timezone, locale, country |
| `POST /me/age-attestation` | U | birth year + 18+ attestation |
| `GET /me/sessions` · `DELETE /me/sessions/{id}` · `POST /me/sessions/revoke-all` ⏱ | U | Device/session management |
| `GET/PUT /me/notification-preferences` | U | |
| `POST /me/data-exports` · `GET /me/data-exports/{id}` | U | Async export |
| `POST /me/deletion-request` ⏱ · `DELETE /me/deletion-request` | U | 14-day grace; returns impact summary (future bookings) |

### 7.2 Profiles
| Method & path | Auth | Notes |
|---------------|------|-------|
| `GET/PUT /me/student-profile` | U | Visibility per field |
| `GET /students/{id}` | M | Only if relationship exists (booking) and fields visible |
| `GET /me/saved-mentors` · `PUT/DELETE /me/saved-mentors/{mentorId}` | U | |
| `POST /me/mentor-application` · `PATCH /me/mentor-application` · `POST /me/mentor-application/submit` | U | Draft → submitted |
| `GET/PATCH /me/mentor-profile` | M | `If-Match` |
| `POST/PATCH/DELETE /me/mentor-profile/affiliations[/{id}]` | U/M | Editing a verified affiliation revokes its credential (re-verify) |
| `PUT /me/mentor-profile/expertise` · `/languages` · `/links` | U/M | Replace-set semantics |
| `POST /me/mentor-profile/eligibility-attestations` | U/M | Country of residence, status, paid-work authorization declaration |
| `GET/POST /me/services` · `PATCH/DELETE /me/services/{id}` | M | Price changes affect future bookings only |
| `GET/PUT /me/scheduling-settings` | M | Timezone, buffer, min notice, max/day, horizon |
| `GET/PUT /me/availability-rules` | M | Replace weekly rule set atomically |
| `GET/POST /me/availability-exceptions` · `DELETE /me/availability-exceptions/{id}` | M | Blocking an exception with existing bookings returns the conflicts |
| `POST /me/payout-account` ⏱ · `GET /me/payout-account` | M | Returns provider-hosted onboarding link; change triggers cooling-off |
| `GET /me/earnings` · `GET /me/transfers` | M | |

### 7.3 Verification & uploads
| Method & path | Auth | Notes |
|---------------|------|-------|
| `POST /verification-requests` | U | `{kind, affiliationId}` |
| `POST /verification-requests/{id}/email-challenge` | U | Sends a link to the institutional address; domain must match university/company domains |
| `POST /verification-requests/{id}/email-challenge/confirm` | U | Token confirm |
| `POST /verification-requests/{id}/submit` · `GET /me/verification-requests` | U | |
| `POST /uploads/presign` | U | `{purpose, contentType, sizeBytes}` → presigned PUT (server-chosen key, exact size/type) |
| `POST /uploads/{id}/complete` | U | Server-side HEAD + magic-byte sniff + (images) re-encode |

### 7.4 Discovery (public)
| Method & path | Auth | Notes |
|---------------|------|-------|
| `GET /mentors` | A | `q, section, category, skill, country, university, city, company, language, priceMin, priceMax, currency, sessionType, minRating, verification, availableWithinDays, sort, cursor` |
| `GET /mentors/{slug}` | A | Public profile DTO (respects visibility) |
| `GET /mentors/{slug}/reviews` | A | Cursor |
| `GET /mentors/{slug}/availability` | A | `serviceId, durationMin, from, to, tz` → slots `{startsAt, endsAt}` (UTC); max window 31 days |
| `POST /match` | A | Questionnaire answers → ranked mentors + human-readable reasons |
| `GET /taxonomy/{vocabulary}` · `GET /countries` · `GET /countries/{slug}` · `GET /countries/{slug}/cities` | A | Cacheable |
| `GET /universities` · `GET /universities/{country}/{slug}` · `GET /universities/{id}/programs` | A | Typeahead via `q` (trigram, aliases) |
| `GET /events` · `GET /events/{slug}` | A | Public/unlisted by link |
| `GET /articles` · `GET /articles/{slug}` | A | |

### 7.5 Booking & sessions
| Method & path | Auth | Notes |
|---------------|------|-------|
| `POST /bookings` 🔑 | U | 1:1: `{serviceId, durationMin, startsAt, intakeAnswers}` → `201 {booking, paymentIntent, checkout}` or free confirmation |
| `POST /sessions/{id}/bookings` 🔑 | U | Group seat / event registration |
| `GET /me/bookings` | U | `role=student|mentor, status, from, to, cursor` |
| `GET /bookings/{id}` | U | Participants and host only |
| `GET /bookings/{id}/cancellation-quote` | U | Refund preview from the policy snapshot |
| `POST /bookings/{id}/cancel` 🔑 | U | `{reasonCode, note}`; student or mentor semantics differ |
| `POST /bookings/{id}/reschedule` 🔑 | U | `{startsAt}` within policy; mentor-consent flow if late |
| `POST /bookings/{id}/check-in` | U | Within the join window |
| `GET /sessions/{id}/join` | U | 302 → meeting URL (window + participant check; logs attendance signal) |
| `POST /bookings/{id}/attendance-claims` | U | `{outcome: held|mentor_absent|student_absent|technical_issue, note}` |
| `GET /bookings/{id}/calendar.ics` | U | RFC 5545 |
| `POST/DELETE /sessions/{id}/waitlist` · `POST /waitlist-offers/{id}/claim` 🔑 | U | |
| `POST /me/sessions` · `PATCH /me/sessions/{id}` · `POST /me/sessions/{id}/cancel` 🔑 · `GET /me/sessions/{id}/participants` | M | Group sessions |
| `POST /me/events` · `PATCH /me/events/{id}` · `POST /me/events/{id}/publish` · `POST /me/events/{id}/cancel` 🔑 · `PUT /me/events/{id}/recording` | M (host permission) | |

### 7.6 Payments
| Method & path | Auth | Notes |
|---------------|------|-------|
| `GET /payment-intents/{id}` | U (owner) | Status polling after checkout |
| `POST /payment-intents/{id}/confirm` 🔑 | U (owner) | `{providerPaymentId, providerSignature}`, verified server-side + provider fetch |
| `POST /payment-intents/{id}/retry` 🔑 | U (owner) | New provider order if the hold is valid |
| `GET /me/payments` · `GET /me/refunds` | U | |
| `POST /api/webhooks/razorpay` | Provider | Raw body HMAC; see [08 §6](08-payment-architecture.md#6-webhook-processing) |
| `POST /api/webhooks/fake` | Provider (dev/test only) | Disabled unless `PAYMENTS_PROVIDER=fake` and not production |

### 7.7 Reviews, messaging, notifications
| Method & path | Auth | Notes |
|---------------|------|-------|
| `POST /bookings/{id}/review` | U | Eligibility: completed, participant, within window |
| `PATCH /reviews/{id}` | U (author) | Within edit window |
| `POST /reviews/{id}/response` | M (reviewed mentor) | One response |
| `GET /me/conversations` · `GET /conversations/{id}/messages` · `POST /conversations/{id}/messages` · `POST /conversations/{id}/read` | U (participant) | Send returns `warnings[]` (e.g. contact info detected) |
| `POST /mentors/{slug}/inquiries` | U | Pre-booking inquiry (limited) |
| `POST /users/{id}/block` · `DELETE /users/{id}/block` | U | |
| `GET /me/notifications` · `POST /me/notifications/read` | U | |

### 7.8 Trust & safety (user-facing)
| Method & path | Auth | Notes |
|---------------|------|-------|
| `POST /reports` | U | `{targetType, targetId, reasonCode, details}` (no existence oracle: always 202) |
| `POST /bookings/{id}/disputes` 🔑 · `GET /disputes/{id}` · `POST /disputes/{id}/evidence` | U (participant) | Window-limited |
| `GET /me/enforcement` | U | Active restrictions, actions, appeal eligibility |
| `POST /moderation-actions/{id}/appeals` | U (subject) | One appeal per action |

### 7.9 Admin (`/api/v1/admin/*`; staff + MFA; audited)
| Area | Endpoints | Roles |
|------|-----------|-------|
| Users | `GET /admin/users`, `GET /admin/users/{id}`, `POST /admin/users/{id}/roles` ⏱ | admin; roles: super_admin |
| Mentor applications | `GET /admin/mentor-applications`, `POST /admin/mentor-applications/{id}/decision` | admin, verification_reviewer |
| Verification | `GET /admin/verification-requests`, `GET …/{id}`, `POST …/{id}/evidence/{eid}/view-url` ⏱ (60 s signed URL, audited), `POST …/{id}/decision` | verification_reviewer |
| Moderation | `GET /admin/reports`, `GET /admin/cases`, `POST /admin/cases/{id}/assign`, `POST /admin/cases/{id}/actions` ⏱, `POST /admin/moderation-actions/{id}/revoke` ⏱, `GET /admin/appeals`, `POST /admin/appeals/{id}/decision`, `POST /admin/trust-events/{id}/excuse` | moderator (ban/suspend: admin or moderator + second reviewer) |
| Disputes | `GET /admin/disputes`, `POST /admin/disputes/{id}/resolution` 🔑 ⏱ | moderator + finance for money |
| Money | `GET /admin/payments`, `POST /admin/payments/{id}/refunds` 🔑 ⏱, `GET /admin/transfers`, `POST /admin/transfers/{id}/hold`, `POST /admin/transfers/{id}/release` 🔑 ⏱, `GET /admin/reconciliation-reports`, `GET /admin/webhook-events`, `POST /admin/webhook-events/{id}/replay` | finance (refunds above threshold need second approver) |
| Jobs | `GET /admin/outbox`, `POST /admin/outbox/{id}/retry` | admin |
| Content | CRUD `/admin/taxonomy-terms`, `/admin/countries`, `/admin/cities`, `/admin/universities` (+ `/merge`), `/admin/programs`, `/admin/articles` (+ `/publish`), `/admin/events` | admin, content_editor |
| Config | `GET /admin/settings`, `PUT /admin/settings/{key}` ⏱ (If-Match + reason), `GET/POST/PATCH /admin/commission-rules` ⏱, `GET/PUT /admin/feature-flags/{key}` ⏱, `GET/PUT /admin/policy-rules/{id}` ⏱ | super_admin / admin |
| Audit | `GET /admin/audit-logs` | admin, super_admin |
| Analytics | `GET /admin/metrics/overview`, `GET /admin/metrics/funnels/{name}` | admin, finance |

### 7.10 Internal & health
| Method & path | Auth | Notes |
|---------------|------|-------|
| `POST /api/internal/jobs/tick` | Bearer secret (≥ 256-bit random, constant-time compare) | Idempotent; processes due outbox jobs |
| `GET /api/health` | A | Liveness (`200 ok`), no details |
| `GET /api/health/ready` | Bearer secret | DB connectivity, migration version, outbox lag |

## 8. Example: create 1:1 booking

```http
POST /api/v1/bookings
Content-Type: application/json
Idempotency-Key: <client-generated-uuid>
Origin: https://app.aheadly.example

{ "serviceId": "0192…", "durationMin": 60, "startsAt": "2026-10-03T08:30:00Z",
  "intakeAnswers": [{ "questionId": "goal", "value": "Mock system design interview" }] }
```

```http
HTTP/1.1 201 Created
Location: /api/v1/bookings/0192…

{ "booking": { "id": "0192…", "status": "held", "holdExpiresAt": "2026-09-17T10:40:00Z",
    "startsAt": "2026-10-03T08:30:00Z", "endsAt": "2026-10-03T09:30:00Z",
    "price": { "amountMinor": "200000", "currency": "INR" },
    "priceBreakdown": [{ "label": "Session (60 min)", "amountMinor": "200000" }],
    "cancellationPolicy": { "version": "2026-09-01", "summary": "Full refund until 24 h before…" } },
  "paymentIntent": { "id": "0192…", "status": "pending" },
  "checkout": { "provider": "razorpay", "orderId": "order_…", "keyId": "rzp_test_…", "amountMinor": "200000", "currency": "INR" } }
```

## 9. OpenAPI & contract testing

- `src/server/modules/*/http/schemas.ts` defines zod schemas, from which `docs/api/openapi.json` is generated in CI and diffed on PRs (breaking-change check).
- API integration tests validate responses against the generated schema.
