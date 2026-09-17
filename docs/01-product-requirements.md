# 01 — Product Requirements

Status: Draft v0.1 · 2026-09-17

## 1. Problem statement

Students preparing for a career step or a move abroad rely on fragmented, unverifiable sources: Reddit threads, WhatsApp groups, paid "consultants" with conflicts of interest, and cold LinkedIn messages. Existing paid mentorship platforms are often priced for Western professionals, or are creator storefronts with weak discovery and weak trust signals. Free platforms are volunteer-driven and hard to get time on.

**We win if** a student can find a credible person who has *recently done the exact thing* they're attempting, book them at an affordable price (or join a group or free event), and trust that the money, the time and the advice are handled fairly.

## 2. Goals & non-goals

**Goals (MVP)**
- G1: Students can discover, evaluate and book a relevant mentor in under 5 minutes.
- G2: Every session is either delivered, refunded or resolved by a documented rule.
- G3: Mentors see transparent credentials; students see transparent prices (no drip pricing).
- G4: Free layer (events and guides) exists from day one to seed demand and SEO.
- G5: Operate at ₹0 during development and sandbox beta without architectural dead-ends.

**Non-goals (MVP)**
- Native video conferencing, real-time chat, mobile apps.
- AI-generated advice.
- Acting as an admissions agent or immigration adviser. We do not earn university commissions, because that creates a conflict of interest with students.
- Live money until the legal, KYC and paid-infrastructure prerequisites are met.

## 3. Personas

| Persona | Context | Goals | Frustrations | Design implications |
|---------|---------|-------|--------------|---------------------|
| **Priya**, final-year CSE, Pune | Placements in 4 months; ₹500–1,500 per session budget | Mock interviews, resume review | Expensive mentors, unclear quality | Price filters, group sessions, reviews tied to real sessions |
| **Arjun**, MS aspirant (Germany) | Applying to TUM/RWTH; APS, blocked account, housing | Talk to someone *at* TUM; realistic cost of living | Agents upselling, outdated blog posts | University pages, "last verified" dates, scoped university badges |
| **Kavya**, parent-funded applicant, 19 | Target: UK undergrad | Understand university life | Parents want safety and legitimacy | 18+ in MVP; future guardian-consent flow; clear refund policy |
| **Rahul**, SDE-2, Bengaluru (mentor) | 6–8 free hours/week | Side income, reputation | Calendar clashes, no-shows, payment delays | Buffers, min notice, max/day, student no-show compensation, predictable payouts |
| **Dr. Meera**, ML researcher (mentor) | Busy; high rate | Serious mentees | Low-effort requests | Intake questions on booking, higher price tiers, group research clinics |
| **Lena**, Master's student in Berlin on a student residence permit (mentor) | Wants to help juniors | Community, maybe income | Doesn't know visa implications | Work-eligibility attestation; volunteer mode; clear guidance |
| **Sana**, moderator | Handles reports | Fair decisions quickly | Missing context, no audit trail | Case view with full timeline, evidence, policy suggestions, templates |
| **Vikram**, finance/ops admin | Reconciles money | No unexplained money | Webhook gaps, manual refunds | Ledger, reconciliation report, stuck-state dashboard |

## 4. User journeys

### J1 — Student books a 1:1 session (MVP)
1. Lands on a SEO page (e.g. `/study-abroad/germany/munich`) or the home page.
2. Browses mentors, filters by university, price, language and availability.
3. Opens a profile: headline, scoped badges, reliability ("98% sessions held"), reviews and prices per duration, with all prices shown in full.
4. Picks a duration and a slot shown in **their** time zone, with the mentor's zone as secondary.
5. Answers optional intake questions (goal, context, links).
6. Sees a price breakdown with the total, including any fees. Accepts the cancellation policy summary (versioned).
7. Slot is **held for 10 minutes** and checkout opens.
8. Payment is verified server-side; booking is confirmed; email with an `.ics` invite is sent.
9. Reminders at T-24h and T-1h. The join link is revealed in the dashboard from T-15min.
10. Joins via `/sessions/:id/join`, which logs an attendance signal.
11. After the session, both parties confirm attendance; the student leaves a review within 14 days.

### J2 — Mentor onboarding (MVP)
Sign up → confirm email → mentor application (headline, expertise, education/work, languages, sample topics) → **work-eligibility attestation** (country of residence, residence status) → credential verification (university email / work email / document review) → admin review → approved → payout onboarding (PA KYC; paid sessions disabled until complete) → configure services, prices and availability → profile goes live.

### J3 — Group session (MVP)
Mentor creates a group session (topic, time, max/min seats, seat price, deadlines) → published → students book seats (hold → pay) → at the min-participants deadline: confirmed **or** auto-cancelled with full refunds → reminders → session → reviews.

### J4 — Free event (MVP)
Host (admin or approved mentor) creates an event → students register (no payment) or join the waitlist → waitlist auto-promotes on cancellation → reminders → attend → recording link posted → follow-up CTA to the host's services.

### J5 — Cancellation & refund (MVP)
Student cancels → policy engine computes refund from the booking's **policy snapshot** → refund initiated through the provider → ledger updated → notifications. Mentor cancels → always a full refund, a reliability event, and rebooking help for the student.

### J6 — No-show & dispute (MVP)
Session window closes → attendance prompts → claims compared → provisional outcome → 48–72 h contest window → dispute case if contested → moderator decision → refund/payout adjustments → trust events → appeal path.

### J7 — Report & enforcement (MVP)
User reports a profile, message or review → triage queue → moderator reviews evidence → action (none / warn / remove content / restrict / suspend / ban) with reason code → notification with appeal link → appeal reviewed by a different moderator when staffing allows.

### J8 — Admin configures the platform (MVP)
Adds a country, city, university or program (or imports from dataset) → edits categories → adjusts commission rules and business-rule settings (versioned, audited) → reviews verification queue.

## 5. Feature matrix

Legend: **M** = MVP · **B** = Beta · **F** = Future

### 5.1 Accounts & identity
| Feature | Phase |
|---------|-------|
| Email/password signup with email verification | M |
| Google OAuth | M |
| Password reset, change email (re-verify), sign-out-everywhere | M |
| TOTP MFA (optional users, mandatory staff) + backup codes | M |
| Passkeys | B |
| Age gate (18+ default, configurable) | M |
| Profile visibility controls (public / logged-in only / mentors I've booked) | M |
| Account deletion & data export (async) | M |
| Guardian-linked accounts for minors | F |

### 5.2 Mentor supply
| Feature | Phase |
|---------|-------|
| Mentor application & approval workflow | M |
| Rich profile (education, experience, expertise, languages, links, publications) | M |
| Scoped verification badges with expiry | M |
| Work-eligibility attestation & volunteer mode | M |
| Services: 1:1 durations with per-duration prices | M |
| Group session creation | M |
| Event hosting (approved mentors) | M |
| Payout onboarding via PA (test mode) | M |
| Earnings & payout history | M |
| Mentor analytics (views, conversion, ratings) | B |
| Packages / monthly mentorship | F |

### 5.3 Discovery
| Feature | Phase |
|---------|-------|
| Section hubs (Career / Study Abroad) | M |
| Filters: category, expertise, country, university, city, company, price, language, session type, rating, verification type, availability window | M |
| Keyword search (Postgres FTS + trigram) | M |
| Explainable default ranking | M |
| "Help me choose" questionnaire → filtered, explained results | M |
| Saved mentors | M |
| Saved searches & alerts | B |
| AI recommendations with explanations | F |

### 5.4 Booking & sessions
| Feature | Phase |
|---------|-------|
| Weekly availability, exceptions, buffers, min notice, max per day, max advance window | M |
| DST-safe slot generation in viewer time zone | M |
| Slot hold with TTL + double-booking prevention | M |
| Intake questions | M |
| Reschedule (policy-bound) | M |
| Cancellation with policy snapshot | M |
| ICS invites & updates, add-to-Google link | M |
| Reminders (email + in-app) | M |
| Attendance check-in & post-session confirmation | M |
| Meeting links (mentor-provided, domain allowlist) | M |
| Google Calendar busy-time sync | B |
| Auto-generated Meet/Zoom links | B |

### 5.5 Money
| Feature | Phase |
|---------|-------|
| Price breakdown before payment | M |
| Fake gateway (dev/test) & Razorpay test mode | M |
| Webhooks with verification and dedupe | M |
| Full/partial refunds | M |
| Mentor share transfers with hold/release | M |
| Double-entry ledger | M |
| Commission rules engine | M |
| Receipts (student) and commission invoices (mentor) — templates, ⚖️ tax-reviewed | M (sandbox) |
| Reconciliation report | M |
| Coupons/promotions | B |
| Live payments | B (gated) |
| Multi-currency charging, Stripe | F |

### 5.6 Trust & safety
| Feature | Phase |
|---------|-------|
| Report anything (profile, message, review, event, session) | M |
| Moderation queue & case management | M |
| Policy engine (rules as data), trust events, strikes with decay | M |
| Enforcement: warn, restrict capability, suspend, ban, reinstate | M |
| Appeals | M |
| Disputes with evidence | M |
| Contact-info / payment-solicitation detection with nudges | M |
| Block user | M |
| Risk scoring (signals → review) | B |
| ML-assisted moderation | F |

### 5.7 Communication
| Feature | Phase |
|---------|-------|
| Booking-scoped async threads | M |
| Pre-booking inquiry (rate-limited, contact-info filtered) | M |
| In-app notifications center | M |
| Email notifications with preferences | M |
| Attachments in messages | B |
| Web push | B |
| Real-time chat, WhatsApp/SMS | F |

### 5.8 Content & community
| Feature | Phase |
|---------|-------|
| Guides/articles with sources, last-verified date, intake year, disclaimers | M |
| Country, city & university landing pages | M |
| Event recordings page | M |
| Community Q&A (per country/university/career) | B |
| Discussions, groups | F |

### 5.9 Admin
| Feature | Phase |
|---------|-------|
| Dashboard with key metrics | M |
| Users/mentors management | M |
| Verification queue | M |
| Bookings, payments, refunds, transfers views | M |
| Disputes, reports, appeals | M |
| Taxonomy/countries/cities/universities/programs CRUD + import | M |
| Events management | M |
| Platform settings & commission rules (versioned) | M |
| Audit log viewer | M |
| Analytics (funnels, retention, cancellation/no-show rates) | M (basic) / B (full) |
| Finance exports (GST/TDS reports) | B |

## 6. Non-functional requirements

| Category | Requirement |
|----------|-------------|
| Performance | Public pages LCP < 2.5 s at p75 on mid-range mobile over 4G; INP < 200 ms; CLS < 0.1. API p95 < 400 ms (excluding provider calls). |
| Availability | MVP: best effort on free tiers (no SLA). Production target: 99.5% monthly for booking/payment paths. |
| Consistency | No double booking, and no captured payment without either a confirmed booking or an automatic refund within 15 minutes of detection. |
| Security | OWASP ASVS 5.0 L2; MFA for staff; secrets never in client bundles or git. |
| Privacy | Data minimisation; DPDP/GDPR rights (export, erase) within statutory timelines. |
| Accessibility | WCAG 2.2 AA. |
| SEO | SSR for public pages, structured data, sitemaps, canonical URLs. |
| i18n | English UI first; all strings externalised; money and time formatted by locale; IANA time zones. |
| Maintainability | Domain layer free of framework imports; business rules configurable; ≥ 80% line coverage on domain modules. |
| Auditability | All admin, security and money actions in an append-only audit log. |
| Portability | No hosting-vendor-specific runtime APIs in domain code. |

## 7. Success metrics (MVP / Beta)

| Metric | Definition | Initial target (beta) |
|--------|-----------|----------------------|
| Activation (student) | Signup → first booking or event registration within 14 days | 25% |
| Search → profile view | Sessions with search that view ≥ 1 profile | 60% |
| Profile → booking | Profile views that lead to a booking | 3–5% |
| Session completion | Confirmed bookings completed without dispute | ≥ 92% |
| Mentor no-show rate | Confirmed mentor no-shows / confirmed sessions | < 2% |
| Repeat booking | Students with ≥ 2 paid bookings within 60 days | 20% |
| Mentor activation | Approved mentors with ≥ 1 completed session within 30 days | 40% |
| Event → paid conversion | Event attendees booking a paid session within 30 days | 5% |
| Dispute rate | Disputes / completed sessions | < 3% |
| NPS-lite | Post-session "would recommend" | ≥ 60% promoters |

## 8. Assumptions (to validate)

| # | Assumption | Validation |
|---|-----------|-----------|
| A1 | Students will pay ₹300–800 for group seats and ₹800–2,500 for 1:1 | Beta price tests, event survey |
| A2 | Enough mentors legally able to be paid exist (working professionals, alumni, PR/citizens abroad) | Supply interviews, attestation data |
| A3 | Free events convert to paid sessions | Event → booking funnel |
| A4 | A 10% take rate is acceptable to mentors | Mentor interviews, churn |
| A5 | Mentor-provided meeting links are sufficient for MVP | Link failure and dispute rates |
| A6 | Async messaging is sufficient pre-/post-session | Support tickets, NPS verbatims |
| A7 | 18+ only doesn't block the core market | Signup age-gate drop-off data (counts only, no DOB stored for rejected users) |

## 9. Ambiguities in the brief, and resolutions

| Brief item | Ambiguity | Resolution (documented) |
|-----------|-----------|--------------------------|
| "3 consecutive no-shows → 1 month ban" | Consecutive is gameable; unclear who confirms a no-show | Windowed points system with human-confirmed suspension ([10 §5](10-trust-and-safety.md#5-mentor-reliability-policy-no-shows-and-cancellations)) |
| Verification level names ("Professional Verified") | Implies endorsement; misleading-ad risk | Scoped evidence badges ([10 §2](10-trust-and-safety.md#2-verification-system)) |
| Group pricing: "mentor charges ₹2,400 total" | What if only 3 of 4 join? | Seat-based pricing; a "target total" helper derives seat price; minimum participants protect the mentor ([09 §8](09-booking-system.md#8-group-sessions)) |
| Session states list mixes session, payment and refund states | Conflating them creates invalid combinations | Separate state machines for booking, session, payment, refund and transfer ([08](08-payment-architecture.md), [09](09-booking-system.md)) |
| Study-abroad "Immigration" topic | Paid immigration advice is regulated in several countries | Framed as "visa process — personal experience"; no advice-for-fee in regulated jurisdictions ([12 §8](12-privacy-compliance.md#8-immigration-advice-regulation-)) |
| "Current university students" as paid mentors | Visa work restrictions | Volunteer mode by default ([12 §7](12-privacy-compliance.md#7-mentor-work-eligibility-visa-conditions-)) |
| "Chat" | Real-time vs async | Async booking-scoped threads in MVP ([21 ADR-008](21-architecture-decision-records.md)) |
| "GitHub Pages" | Static only; the app needs a server | Not used for the app; possible for a docs site later |
