# 15 — Observability, Backups & Recovery

Status: Draft v0.1 · 2026-09-17

## 1. Goals

Know **within minutes** when booking, payment, email or security paths break; be able to answer "what happened to this booking/payment?" from logs and the audit trail; recover data with a known RPO/RTO. Use free tools behind abstractions so paid tools can replace them later.

## 2. Logging

- **pino** JSON logs to stdout (host collects). Fields: `ts`, `level`, `msg`, `requestId`, `route`, `actorId` (uuid only), `module`, `event`, `durationMs`, `status`, `errorCode`, `provider`, `jobId`.
- `requestId` generated at the edge of each request (or accepted if well-formed), propagated to outbox jobs (`causationId`) and provider calls (idempotency keys/notes where allowed).
- **Redaction** via pino `redact` paths plus a denylist serializer: `password`, `token`, `authorization`, `cookie`, `secret`, `signature`, `email` (hash only), `vpa`, `card`, `bank`, `body` (for messages).
- Log levels: `info` for state transitions and external calls (summaries), `warn` for recoverable anomalies (retries, late webhooks), `error` for failures requiring attention, `debug` locally only.
- **Domain events log**: each state transition logs `event=booking.transition from=held to=confirmed bookingId=…`, so any booking's history can be reconstructed from logs + DB history.
- Retention: host free-tier retention is short (often hours to days), so **security-relevant events are also persisted** in `audit_logs` (DB) to meet retention needs. Production: log drain to durable storage in India ⚖️ ([12 §6](12-privacy-compliance.md#6-intermediary--it-law-india-)).

## 3. Error tracking

- `ErrorReporter` port → Sentry adapter (free developer tier) for server and client; source maps uploaded in CI (not publicly served).
- PII scrubbing: `sendDefaultPii: false`, `beforeSend` strips request bodies, cookies and query strings except allowlisted keys.
- Session replay **disabled** (privacy). Performance tracing sampled at 5% (Beta).
- Error budgets: new error types → alert; > 1% of requests erroring over 5 min → alert.

## 4. Metrics

MVP avoids a metrics vendor. Metrics come from **SQL over operational tables** (business) and **host analytics** (technical):

| Metric | Source | Surface |
|--------|--------|---------|
| Request rate, error rate, latency p50/p95 by route | Host analytics / log queries | Host dashboard |
| Bookings created/confirmed/expired/orphaned per hour | SQL | Admin ops dashboard |
| Payment success rate; median time from hold → confirmed | SQL | Admin ops dashboard |
| Webhooks received/processed/failed; processing lag | `webhook_events` | Admin ops dashboard |
| Outbox backlog (pending due jobs), oldest due job age, failed jobs | `outbox_jobs` | Admin ops dashboard + alert |
| Email sends/failures by template | `email_deliveries` | Admin ops dashboard |
| Refund pending age; transfers on hold past due | SQL | Finance dashboard |
| Reconciliation items open | SQL | Finance dashboard |
| DB size, connections, slow queries | Supabase dashboard, `pg_stat_statements` | Weekly review |
| Moderation queue sizes & SLA breaches | SQL | T&S dashboard |

Beta: expose `/api/internal/metrics` (secret-protected, Prometheus format) for Grafana Cloud free tier or similar, behind the same abstraction.

## 5. Health checks

| Endpoint | Checks | Consumer |
|----------|--------|----------|
| `GET /api/health` | Process up (no dependencies) | Uptime monitor (public) |
| `GET /api/health/ready` (secret) | DB `SELECT 1` < 500 ms, migration version matches build, outbox oldest-due < 10 min, last successful tick < 5 min | Uptime monitor with header; deploy verification |

## 6. Monitors & alerts (MVP)

Alert channel: email to the founder/admin group via the platform's own email adapter **and** a secondary channel that doesn't depend on our email provider (e.g. Discord/Slack webhook, free), so an email-provider outage doesn't hide alerts.

Monitors run inside the job tick (`ops.monitor` job every 5 min) and write `ops_alerts` rows with dedupe (one open alert per condition).

| Monitor | Condition | Severity |
|---------|-----------|----------|
| Site down | Uptime check fails 2× | P1 |
| Tick stalled | No successful tick in 10 min | P1 |
| **Captured payment without confirmed booking or refund** | Any older than 15 min | **P0** |
| Payment intents pending past hold + 30 min | Count > 0 | P2 |
| Webhook failures | > 3 failed in 1 h, or any signature failures spike (> 5 in 10 min) | P1 |
| Refunds pending | Older than 48 h | P2 |
| Transfers on hold past `hold_until` + 2 h | Count > 0 | P2 |
| Reconciliation items | Open > 24 h | P2 |
| Outbox failures | Any job `failed` (dead-letter) | P2 |
| Email send failures | > 5% of sends in 1 h | P2 |
| Ledger invariant violation | Any | **P0** |
| Audit hash chain mismatch | Any | **P0** |
| Auth anomalies | Failed logins > 50/min; > 10 accounts per IP in 10 min | P2 |
| Staff anomalies | Document views > 30/day by one staff; refunds > threshold | P2 |
| DB size | > 70% of plan quota | P2 |
| Email quota | > 80% of daily quota | P2 |
| Moderation SLA | P0 report unacknowledged > 4 h (staffed hours) | P1 |
| Backup job | Failed or not run in 26 h | P1 |

## 7. Backups & recovery

### 7.1 Why this matters on free tiers
Supabase Free provides **no automated backups** and can **pause** idle projects. Treat the DB as unprotected unless we back it up ourselves.

### 7.2 Backup design (MVP)

| Item | Method | Frequency | Retention | Storage |
|------|--------|-----------|-----------|---------|
| Postgres (full logical) | GitHub Actions: `pg_dump --format=custom --no-owner` via the direct connection → `age` encryption with a public key (private key offline with the founder + sealed second copy) → upload | Nightly 03:00 IST | 30 daily + 12 monthly | Offsite free storage (e.g. Backblaze B2 free tier or Google Drive via rclone); **not** the same vendor as the DB |
| Schema + migrations | Git | Every commit | Forever | GitHub |
| Public media (avatars, event covers) | rclone sync to offsite | Weekly | Latest + 4 weekly versions | Offsite |
| Private verification documents | **Not backed up** by design (short retention, minimisation). Loss means users re-upload | — | — | — |
| Configuration (settings, flags, commission rules) | Included in the DB dump; also exported as JSON on each change (audit) | On change | Forever (audit) | DB + dump |

Backups contain personal data, so they follow the same retention rules (rotation removes erased data within 30 days; disclosed in the Privacy Policy).

### 7.3 Targets

| Stage | RPO (max data loss) | RTO (time to restore) |
|-------|---------------------|-----------------------|
| MVP / sandbox beta (free tier) | 24 h | 4 h |
| Production (paid DB with PITR) | ≤ 5 min | ≤ 1 h |

Before live payments, RPO must shrink to minutes, because a 24 h loss could erase evidence of real payments. The provider remains the source of truth for payments, and reconciliation can rebuild payment rows, but bookings would be lost. That's why paid PITR is a live-money gate.

### 7.4 Restore procedure (runbook)

1. Declare incident; enable maintenance flag (`booking.enabled=false`, `payments.enabled=false`).
2. Provision the target DB (same provider new project, or Neon/local in a provider-loss scenario).
3. Download the latest dump; decrypt with the offline key; `pg_restore --no-owner --role=app_migrator`.
4. Run migrations to the current version (if the dump predates the latest release).
5. Integrity checks: ledger journals balance; audit hash chain verifies; row counts vs last-known metrics; constraint validation.
6. **Payment catch-up:** run reconciliation for the window since backup time. Provider data re-creates missing payment/refund records; affected bookings flagged for manual review, and students contacted.
7. Rotate DB credentials; update env; redeploy; smoke test; disable maintenance flags.
8. Post-incident review.

### 7.5 Restore drills
Monthly automated drill (CI) restores the latest backup into a throwaway Postgres and runs the integrity checks. A failure is a P1 alert. A manual end-to-end drill (including app pointing at restored DB) runs quarterly.

### 7.6 Disaster scenarios

| Scenario | Response |
|----------|----------|
| Free project paused | Resume in dashboard; if resume fails → restore procedure |
| Provider account suspended / vendor loss | Restore to alternative Postgres (Neon/local) from offsite dump; storage from offsite media sync |
| Bad migration corrupts data | Stop writes; restore to new DB; replay reconciliation; compare and merge manually for the gap |
| Region outage | Wait (MVP); production: documented cross-region restore from backups |
| Ransomware/credential compromise | Revoke keys; restore from **encrypted offsite** copy (not writable by app credentials) |
| Accidental admin action (mass cancel) | Audit log identifies scope; compensating actions; restore only if unrecoverable |

## 8. Product analytics (privacy-respecting)

- First-party `analytics_events` table: `event_name`, `occurred_at`, `anon_id` (daily-rotating salted hash of a first-party random id, no cross-site), `user_id` (only for logged-in product events), `props` (allowlisted, no PII), `path`, `referrer_domain`, `utm_*`.
- Event taxonomy (MVP): `page_viewed`, `signup_started`, `signup_completed`, `email_verified`, `search_performed` (filters used, result count, no free-text stored beyond 100 chars), `mentor_profile_viewed`, `slot_selected`, `booking_hold_created`, `checkout_opened`, `payment_succeeded`, `booking_confirmed`, `session_completed`, `review_submitted`, `event_registered`, `event_attended`, `mentor_application_submitted`, `mentor_approved`, `mentor_first_session_completed`.
- Funnels (admin): visitor → signup → search → profile → booking → payment → completed; event attendee → paid booking within 30 days; mentor activation and retention; repeat booking rate; cancellation and no-show rates.
- Respect Do Not Track / Global Privacy Control signals by disabling non-essential analytics for that visitor.
- 13-month retention; aggregated tables kept.
