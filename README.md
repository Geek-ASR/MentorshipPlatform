# Aheadly (working name)

A low-cost student mentorship marketplace and community: paid 1-on-1 sessions, affordable group sessions, free webinars and workshops, and sourced guides for **career & academic** and **study-abroad** guidance.

> **Status: Phase 0–3 complete (discovery, research, architecture, UX) — documentation only. No application code yet.**
> Nothing in this repository is production-ready. Payments are designed for sandbox/test mode only.

## Documentation

Start with **[docs/00-blueprint.md](docs/00-blueprint.md)**, then the [documentation index](docs/README.md).

Key documents:
- [System architecture](docs/04-system-architecture.md) · [diagrams](docs/diagrams/architecture.md)
- [Database design](docs/05-database-design.md) · [API design](docs/06-api-design.md)
- [Payments](docs/08-payment-architecture.md) · [Booking](docs/09-booking-system.md)
- [Trust & safety](docs/10-trust-and-safety.md) · [Threat model](docs/11-security-threat-model.md)
- [Privacy & compliance](docs/12-privacy-compliance.md) (⚖️ requires professional review)
- [MVP roadmap](docs/19-mvp-roadmap.md) · [Decision records](docs/21-architecture-decision-records.md)

## Planned stack (MVP)

Next.js (App Router, TypeScript) modular monolith · PostgreSQL (Supabase Free, Mumbai) with Drizzle ORM · Better Auth · Razorpay (test mode) behind a payment-provider port · Tailwind CSS + Radix primitives · Vitest + Playwright · GitHub Actions.

Setup, environment variables, testing and deployment instructions will be added in Phase 4 (Foundation).

## Security

Please do not open public issues for security problems. A `SECURITY.md` with a private reporting channel will be added in Phase 4.
