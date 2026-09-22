# Architecture Diagrams

GitHub renders these Mermaid diagrams natively. Explanations: [04 — System Architecture](../04-system-architecture.md).

## 1. MVP system architecture (₹0 tier)

```mermaid
flowchart TB
  subgraph Users["Users"]
    ST[Student browser]
    MT[Mentor browser]
    AD[Staff browser: MFA required]
  end

  subgraph Host["App host: portable Next.js build"]
    direction TB
    subgraph Web["Presentation adapters"]
      PUB["Public SSR/ISR pages<br/>home, hubs, mentors, universities, events, guides"]
      DASH["Dashboards<br/>student, mentor"]
      ADM["Admin console"]
      REST["REST /api/v1<br/>zod, authz, idempotency, rate limits"]
      AUTHR["/api/v1/auth/*<br/>auth module (ADR-023)"]
      WHK["/api/webhooks/razorpay<br/>raw-body HMAC, dedupe"]
      TICK["/api/internal/jobs/tick<br/>secret-auth"]
    end
    subgraph Modules["Domain modules: pure rules + application services"]
      M1[identity & profiles]
      M2[taxonomy & universities]
      M3[verification]
      M4[scheduling & booking]
      M5[payments & ledger]
      M6[events & groups]
      M7[reviews]
      M8[trust & safety]
      M9[messaging & notifications]
      M10[content & SEO]
      M11[admin & analytics]
    end
    subgraph Platform["Platform primitives"]
      P1[authorize]
      P2[audit log writer]
      P3[outbox]
      P4[idempotency]
      P5[settings & flags]
      P6[clock, logger, errors]
    end
    Web --> Modules
    Modules --> Platform
  end

  subgraph Data["Supabase Free, ap-south-1 Mumbai"]
    PG[("PostgreSQL: app schema<br/>EXCLUDE constraints, ledger, audit chain, outbox")]
    S3PUB[("Storage: public-media")]
    S3PRIV[("Storage: private-docs<br/>signed URLs, 30-day retention")]
    CRON["pg_cron + pg_net<br/>every minute"]
  end

  subgraph External["Third parties behind ports"]
    RZP["Razorpay test mode<br/>Orders, Checkout, Route, Refunds"]
    MAIL["Email: console → Resend"]
    TURN["Cloudflare Turnstile"]
    SENTRY["Sentry"]
    MEET["Meeting links<br/>Meet, Zoom, Teams"]
    GOOG["Google OAuth"]
  end

  subgraph Ops["Operations"]
    GHA["GitHub Actions<br/>CI, migrations, nightly backup, restore drill"]
    OFF[("Offsite encrypted backups")]
    UP["Uptime monitor"]
  end

  ST --> PUB & DASH & REST
  MT --> DASH & REST
  AD --> ADM & REST
  ST & MT --> AUTHR
  Modules --> PG
  Modules --> S3PUB & S3PRIV
  Modules --> RZP & MAIL & TURN & SENTRY & GOOG
  RZP -. webhooks .-> WHK
  CRON --> TICK
  ST & MT -. join via /sessions/:id/join redirect .-> MEET
  GHA --> PG
  GHA --> OFF
  UP --> Host
```

## 2. Money flow (Razorpay Route)

```mermaid
flowchart LR
  S[Student] -->|"pays total"| PA[("Payment aggregator escrow")]
  PA -->|"mentor share: transfer ON HOLD until session end + dispute window"| LA["Mentor linked account<br/>PA KYC"]
  LA -->|"PA settlement"| MB[Mentor bank]
  PA -->|"commission minus fees"| PB[Platform bank]
  PA -.->|"refund to source<br/>+ transfer reversal"| S
```

## 3. Booking + payment consistency (summary)

```mermaid
flowchart LR
  A["POST /bookings"] --> B{"TX: expire stale holds,<br/>insert calendar block"}
  B -->|"23P01 overlap"| X["409 SLOT_UNAVAILABLE"]
  B -->|"ok"| C["booking HELD + order + intent<br/>(outbox rows)"]
  C --> D["Provider order"]
  D --> E["Checkout"]
  E --> F{"Capture verified<br/>client confirm, webhook, or sweeper"}
  F -->|"hold valid"| G["CONFIRMED<br/>ledger + emails + ICS + reminders"]
  F -->|"hold expired, slot free"| G
  F -->|"hold expired, slot taken"| H["PAYMENT_ORPHANED<br/>auto full refund"]
```
