# 20 — Future Roadmap

Status: Draft v0.1 · 2026-09-17

Items are grouped by **Beta** (after MVP validation with real beta users) and **Future**. Each must earn its place with evidence from metrics or user research. None should bloat the MVP.

## 1. Beta candidates

| Feature | Why | Dependencies / notes |
|---------|-----|---------------------|
| **Live payments** | Revenue | Production-critical gate ([08 §13](08-payment-architecture.md#13-production-critical-gate-for-live-payments)) |
| Community Q&A (country, university, career spaces) | SEO long-tail, supply engagement (volunteer student mentors), demand capture | Moderation capacity, UGC policies, spam defences, "Community answer" labelling |
| Passkeys | Phishing-resistant auth | Better Auth plugin |
| Google Calendar busy-time sync | Fewer conflicts for mentors | OAuth sensitive scopes; verification lead time |
| Auto-generated Meet/Zoom links + attendance reports | Better UX and stronger no-show evidence | Provider API approvals |
| Message attachments | Resume reviews | Upload pipeline + malware scanning |
| Web push notifications | Reminder reliability beyond email quotas | Service worker, consent |
| Saved searches & alerts | Retention | Outbox + email quotas |
| Coupons & referral credits | Growth | Credit ledger accounts, abuse controls |
| Mentor analytics | Supply retention | Analytics events |
| Finance exports (GST/TDS reports) | Compliance ops | CA-defined formats |
| Risk scoring (weighted signals) | Fraud scale | Signal collection from MVP |
| Private mentor feedback to students | Learning outcomes | Visibility rules |
| Student guardian-consent flow (minors) | Access for under-18 applicants | DPDP verifiable consent; product restrictions; counsel |
| Hindi UI (then other Indian languages) | Reach | Externalised strings already |
| PWA installability | Mobile engagement without app stores | Service worker |

## 2. Future product lines (business-model extensibility)

The data model already supports these through `mentor_services.kind`, `orders`/`order_items` and the ledger.

| Product | Model | Key design notes |
|---------|-------|------------------|
| **Packages** (e.g. 4 sessions) | `order_item.kind = package` → credits ledger per student–mentor | Expiry rules; partial refund of unused credits; consumer-law review |
| **Monthly mentorship / subscriptions** | Recurring payments (provider subscriptions/mandates) | UPI AutoPay mandate rules; clear cancellation (dark-pattern "subscription trap" rules) |
| **Async reviews** (resume, SOP feedback, GitHub review) | Fixed-price deliverable with SLA | Deliverable upload, acceptance window, disputes on quality; **feedback only, no ghostwriting** |
| **Cohorts / bootcamps** | Group programme with multiple sessions | Programme entity; attendance across sessions; refund schedules |
| **Paid events / workshops** | Seat-priced events | Same as group sessions at larger capacity |
| **Premium community** | Subscription gating spaces | Value must not paywall safety information |
| **University partnerships** | Universities sponsor free events or ambassador programmes | **Neutrality rules**: sponsored content labelled; no ranking influence; no data sale |
| **Company partnerships** | Sponsored career workshops, hiring events | Same neutrality/disclosure rules |
| **Scholarship/fee assistance fund** | Sponsors fund seats for low-income students | Eligibility verification without over-collection |

## 3. AI features: design & safety first

AI is **not** an MVP requirement. When introduced, every AI feature follows these principles:

1. **Assistive, not authoritative.** AI helps users find people and organise information; humans (mentors, official sources) provide advice.
2. **Never AI advice on visa/immigration, legal, financial, tax or medical matters.** Queries in these domains get official-source links + "talk to a mentor about their experience" + disclaimers.
3. **Explainability.** Recommendations show reasons derived from structured data ("Studied at TU Munich · available this week"), not opaque scores.
4. **Privacy.** No message or document content is sent to an AI provider without explicit, feature-specific opt-in. Data minimisation and redaction before calls. Provider terms must exclude training on our data. DPDP/GDPR notices updated. A DPIA before launch.
5. **Human in the loop for enforcement.** AI moderation only prioritises and suggests; it never suspends or bans.
6. **Labelled output.** AI-generated text is labelled as such and is editable by the user.
7. **Evaluated.** Offline evaluation sets per feature (quality, bias across genders/regions/languages, harmful-advice refusal); monitoring of complaint rates.
8. **Secure.** Prompt-injection defences (user content treated as data; no tool access with side effects driven by user text; output validation), rate limits, cost caps.
9. **Swappable.** An `AiProvider` port; no provider-specific logic in domain code.

| Feature | Stage | Design | Guardrails |
|---------|-------|--------|-----------|
| Mentor recommendations ("find the right mentor") | Future (the rules-based version is MVP) | Hybrid: structured filters + embeddings over public profile text for semantic match; re-ranked by explainable factors | Reasons shown; no protected-attribute features; exposure fairness for new mentors; opt-out |
| Profile writing assistant (mentors) | Beta/Future | Suggests clearer headline/bio from the mentor's own inputs | Cannot invent credentials; claim-phrase detector runs on output |
| Resume feedback (pre-session prep) | Future | Student uploads a resume → structured feedback checklist | Opt-in; file deleted after processing; labelled AI; encourages mentor review |
| Career roadmap drafts | Future | Generates a learning/milestone plan from goals, links to relevant free content and mentors | Labelled, editable; no salary or job guarantees |
| University comparison assistant | Future | Summarises **our sourced, dated content** (retrieval-grounded) with citations | Only answers from sources with last-verified dates; refuses admissions predictions and visa questions |
| FAQ assistant | Future | Retrieval over help-centre and policy docs | Cites policy; hands off to human support for disputes/refunds |
| Session summaries | Future | With **both** participants' consent, summarises notes the participants write (no recording in MVP) | Explicit consent per session; private to participants; deletion controls |
| Moderation assist | Beta | Classifies reports and messages for priority; suggests policy + templates | Moderator decides; precision audits; appeal path |
| Spam detection | Beta | Classifier on messages/Q&A posts combined with rules | Holds content for review; no auto-bans |
| Fraud detection | Future | Model over risk signals ([10 §11](10-trust-and-safety.md#11-anti-fraud-risk-system)) | Output = risk score → friction/review; never sole basis for enforcement; bias review |

## 4. Platform & infrastructure futures

- Mobile apps (after PWA proves demand), sharing the REST API.
- Multi-currency charging & international payouts (entity + provider).
- Regional data residency (EU).
- Public API for university/partner integrations (token auth, scopes, rate limits).
- Search engine migration, warehouse, event backbone ([16](16-migration-and-scaling.md)).
- Accessibility certification / VPAT for institutional partners.
- SOC 2 / ISO 27001 readiness if B2B partnerships require it.

## 5. Growth features (ethical)

- Mentor-hosted free events as a supply marketing tool (MVP), with host analytics (Beta).
- Double-sided referrals rewarded only after a *completed paid session*, with caps.
- University ambassador programme with non-cash perks first.
- Content partnerships with student associations (attributed, sourced).
- Email newsletters strictly opt-in, with easy unsubscribe.
- No purchased lists, no scraping, no fake scarcity, no fake reviews.
