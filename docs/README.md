# Documentation Index

Status: **Draft v0.1 — Discovery, Research & Architecture phase (2026-09-17)**. No product code exists yet.

Start with [00-blueprint.md](00-blueprint.md). It summarises everything and links to the detailed documents.

| # | Document | Purpose |
|---|----------|---------|
| 00 | [Product & Engineering Blueprint](00-blueprint.md) | Executive summary, catastrophic-risk register, open decisions |
| 01 | [Product Requirements](01-product-requirements.md) | Vision, personas, journeys, feature matrix (MVP/Beta/Future) |
| 02 | [Market Research](02-market-research.md) | Market dynamics, unit economics, cold-start strategy |
| 03 | [Competitor Analysis](03-competitor-analysis.md) | Competitors, weaknesses, differentiation |
| 04 | [System Architecture](04-system-architecture.md) | Stack selection, containers, modules, key flows, diagram |
| 05 | [Database Design](05-database-design.md) | ERDs, constraints, indexes, deletion & audit strategy |
| 06 | [API Design](06-api-design.md) | REST conventions, errors, idempotency, endpoint catalog |
| 07 | [Authentication & Authorization](07-authentication-authorization.md) | Auth flows, sessions, MFA, RBAC + ownership policies |
| 08 | [Payment Architecture](08-payment-architecture.md) | Provider choice, funds flow, state machines, ledger, reconciliation |
| 09 | [Booking System](09-booking-system.md) | Availability, time zones/DST, concurrency, session state machine |
| 10 | [Trust & Safety](10-trust-and-safety.md) | Verification, policy engine, enforcement, disputes, reviews, fraud |
| 11 | [Security Threat Model](11-security-threat-model.md) | STRIDE, OWASP Top 10:2025 / API Top 10 mapping, controls |
| 12 | [Privacy & Compliance](12-privacy-compliance.md) | DPDP, GDPR, consumer protection, payments, tax, visa-work law, checklist |
| 13 | [Testing Strategy](13-testing-strategy.md) | Test layers, critical cases, concurrency, security testing, CI gates |
| 14 | [Deployment](14-deployment.md) | Environments, CI/CD, secrets, ₹0 cost sheet, free-tier limits |
| 15 | [Observability & Recovery](15-observability.md) | Logging, metrics, alerts, backups, disaster recovery |
| 16 | [Migration & Scaling](16-migration-and-scaling.md) | 1k → 10k → 100k → large-scale path, vendor exit plans |
| 17 | [Business Rules](17-business-rules.md) | Every configurable rule with default values |
| 18 | [Edge Cases](18-edge-cases.md) | Edge-case inventory with expected behaviour |
| 19 | [MVP Roadmap](19-mvp-roadmap.md) | Phases 4–16, deliverables, exit criteria |
| 20 | [Future Roadmap](20-future-roadmap.md) | Beta/Future features, AI with safety design |
| 21 | [Architecture Decision Records](21-architecture-decision-records.md) | Every major decision: problem, options, trade-offs, choice |
| 22 | [UX, SEO & Design System](22-ux-seo-design-system.md) | Information architecture, journeys, SEO URLs, brand, components |

## Maturity labels used throughout

| Label | Meaning |
|-------|---------|
| **MVP** | Built in the first release; runs on free tiers; sandbox payments only |
| **Beta** | Next increment after MVP validation; may need small paid services |
| **Future** | Designed-for but not built; architecture must not block it |
| **Production-ready** | Safe for real users and real money, with the documented paid infrastructure in place |
| **Production-critical** | Must exist before accepting any real money or real user data at scale |

## Legal disclaimer

These documents record engineering research and product reasoning. **They are not legal, tax, immigration or financial advice.** Sections marked ⚖️ need review by a qualified professional before launch.
