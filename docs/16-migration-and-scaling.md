# 16 — Migration & Scaling

Status: Draft v0.1 · 2026-09-17

> **Measure first.** Every stage below has *triggers* (observed metrics) that justify moving on. Don't build the next stage in advance. Keep the modular boundaries that make it cheap.

## 1. What makes scaling cheap later (built in from day one)

| Design choice | Pays off when |
|--------------|---------------|
| Plain Postgres via standard driver; no BaaS client SDK in the browser | Moving DB vendors or adding replicas |
| Ports & adapters (payments, email, storage, search, rate limiter, jobs) | Swapping free tools for paid/scalable ones |
| Modular monolith with enforced boundaries; modules own their tables | Extracting a service (e.g. notifications, search indexer) |
| Outbox table with idempotent handlers | Moving to a real queue without changing producers |
| Denormalised `mentor_search_documents` built by jobs | Moving search to Meilisearch/OpenSearch (same document shape) |
| UUIDv7 ids, no sequences exposed | Sharding/merging data, multi-region |
| Snapshotted prices/policies | Changing business rules without migrations of history |
| Money in minor units + currency | Multi-currency expansion |
| Stateless app servers; sessions in DB | Horizontal scaling |

## 2. Stages

### Stage 0 — MVP / sandbox beta (≤ 500 users, ₹0)
- Single Next.js deployment, Supabase Free (Mumbai), Postgres-backed rate limits and outbox, Postgres FTS, Fake/Razorpay test payments.
- **Not for real money** (no backups/PITR, pausing, non-commercial previews).

### Stage 1 — Live launch (≈ 1,000 registered users, ~50–200 bookings/month)
**Triggers:** live payments enabled; public launch.
| Change | Why |
|--------|-----|
| Supabase Pro (or Neon paid) with daily backups + **PITR** | Real money needs RPO in minutes |
| Commercial hosting plan (Cloudflare Workers Paid / Vercel Pro / Netlify Pro) | Terms + reliability |
| Custom domain, Resend paid tier if > 100 emails/day | Deliverability, quota |
| Durable log drain with ≥ 180-day retention in India ⚖️ | CERT-In |
| Uptime monitoring with SMS/push alert to on-call | Response time |
| Upload malware scanning (e.g. ClamAV worker on a small container) | Documents at volume |
**Estimated cost:** ≈ US$50–100/month.

### Stage 2 — Growth (≈ 10,000 users, ~2,000 bookings/month, ~500 mentors)
**Triggers (any):** DB CPU > 60% sustained; p95 API > 500 ms; search p95 > 300 ms; rate-limit writes > 10% of DB write load; outbox oldest-due > 5 min at peaks; > 3,000 emails/day.
| Change | Why |
|--------|-----|
| **Redis** (Upstash/managed) behind `RateLimiter` + cache port (taxonomy, mentor cards, slot pre-computation) | Offload hot small writes/reads from Postgres |
| **Queue service** (e.g. SQS, Cloud Tasks, QStash) fed by an outbox relay; dedicated worker runtime | Predictable job latency; long-running jobs (PDFs, exports) |
| Read replica for analytics/admin reporting | Isolate heavy reads |
| `pg_stat_statements`-driven index tuning; partition `analytics_events`, `audit_logs`, `messages` by month | Table growth |
| CDN caching of anonymous explore queries (short TTL) | Traffic spikes from SEO |
| Image CDN with resizing (host or Cloudflare Images) | Bandwidth |
| Customer support tooling (shared inbox, macros) | Ops scale |
| Community Q&A enabled with ML-assisted spam filtering | Content volume |
**Estimated cost:** ≈ US$300–800/month.

### Stage 3 — Scale (≈ 100,000 users, ~20,000 bookings/month, ~5,000 mentors)
**Triggers:** search needs typo tolerance/facets at scale; DB > 100 GB or write contention; multiple team squads touching the monolith.
| Change | Why |
|--------|-----|
| **Dedicated search engine** (Meilisearch/Typesense or OpenSearch) fed by the existing search documents via outbox events | Relevance, facets, typo tolerance |
| Extract **notifications** and **search indexing** as separate services consuming events | Independent deploys and scaling |
| Warehouse (BigQuery/ClickHouse) via CDC for analytics | Keep OLTP lean |
| Multi-AZ HA Postgres, connection pooling tier (PgBouncer), statement-level timeouts per workload | Availability |
| Fraud/risk scoring service with feature store | Fraud patterns at scale |
| On-call rotation, SLOs, incident tooling, status page | Reliability culture |
| Formal compliance programme (SOC 2 / ISO 27001 readiness if B2B partnerships need it) | University/company partnerships |
**Estimated cost:** ≈ US$3k–10k/month.

### Stage 4 — Large marketplace / multi-region
**Triggers:** significant non-India demand (EU/US) with latency or data-residency requirements; international payments.
| Change | Why |
|--------|-----|
| Regional deployments (India, EU) with **data residency** per user region | GDPR, latency |
| International payment entity + provider (e.g. Stripe for non-India) behind `PaymentGateway` | Cross-border payouts |
| Global ID strategy already UUIDv7; per-region primary DBs, global directory service for mentor discovery | Multi-region writes |
| Event backbone (Kafka/PubSub) | Many consumers |
| Native video integration or partnerships at scale | Attendance evidence, UX |

## 3. Bottleneck analysis (expected order of pain)

1. **Email quotas** (free 100/day) → first to break in beta (reminders × bookings). Mitigation: digesting, preferences, paid tier at launch.
2. **Serverless DB connections** → use the transaction pooler from day one; keep transactions short; no long transactions during provider calls.
3. **Search/filter queries** → GIN indexes + denormalised documents; then external engine.
4. **Availability computation** for popular mentors → cache per mentor/day with invalidation on block changes.
5. **Rate-limit table churn** → Redis.
6. **Outbox tick latency** (cron granularity) → queue + worker.
7. **Admin analytics queries** → replica/warehouse.

## 4. Vendor exit plans

| Vendor | Lock-in level | Exit plan | Effort |
|--------|--------------|-----------|--------|
| Supabase | Low (plain Postgres + S3 API) | `pg_dump` → any Postgres; rclone buckets → S3/R2; switch env vars; re-create `pg_cron` schedule elsewhere (or queue) | 1–2 days |
| Hosting (Vercel/Netlify/Cloudflare) | Low–Medium (build adapters) | Standard Next.js build; OpenNext adapters or container; avoid vendor KV/cron APIs | 1–3 days |
| Better Auth | Low (tables in our DB) | Data stays; replacing the library means porting flows (sessions/hash formats documented) | 1–2 weeks |
| Razorpay | Medium (linked accounts, KYC with provider) | Cashfree Easy Split adapter; re-onboard mentors' payout accounts (KYC repeated); historical records remain | 3–6 weeks + mentor re-KYC |
| Resend | Low | SMTP/API adapter swap; DNS records update | < 1 day |
| Sentry | Low | `ErrorReporter` adapter swap | < 1 day |
| Cloudflare Turnstile | Low | `Captcha` port (hCaptcha) | < 1 day |

## 5. Data migration practices

- Expand → migrate (backfill in batches with progress tracking, idempotent) → contract.
- Online index builds (`CONCURRENTLY`), `NOT VALID` constraints then `VALIDATE`.
- Large backfills run as outbox jobs with checkpoints, not in migrations.
- Dual-write periods for moving data between stores (e.g. search), with a verification job comparing counts/checksums before cut-over.
- Every migration PR states: lock impact, rollback strategy, backfill plan and expected duration on production-size data.
