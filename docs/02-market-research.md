# 02 — Market Research

Status: Draft v0.1 · 2026-09-17

> Market-size figures are deliberately omitted where they could not be verified from primary sources during this phase. Before investor or public use, pull current numbers from MEA (Indian students abroad), AISHE (Indian higher education) and destination-country statistics (DAAD/Destatis, IIE Open Doors, UK HESA).

## 1. Market structure

Mentorship-for-students is a **two-sided services marketplace** with these properties:

| Property | Implication |
|----------|-------------|
| Services are time-bound, perishable and scheduled | Booking integrity and calendar tooling matter more than catalog breadth |
| Quality is hard to judge before purchase | Trust signals (verification, reviews, reliability) drive conversion |
| High repeat potential with the same mentor | High disintermediation risk after first contact |
| Supply is part-time and price-setting | Mentor tools (availability, payouts, low admin) drive supply retention |
| Demand is price-sensitive, especially in India | Group sessions and free events are necessary, not optional |
| Much demand starts on Google, YouTube, Reddit and Instagram | SEO and content are primary acquisition, not paid ads |

## 2. Demand segments

1. **Career (India-first)**: placement season prep, off-campus job hunts, interview prep (DSA, system design), resume and LinkedIn review, domain switching (e.g. into ML, security, product).
2. **Study abroad (India → destination)**: university selection, application strategy, country-specific process (Germany: APS certificate, uni-assist/VPD, blocked account, health insurance, residence registration; US: F-1, SEVIS, I-20; UK: CAS, BRP/eVisa; Canada: SDS/GIC, provincial attestation letters), housing, first-month setup.
3. **Research**: finding advisors, writing first papers, choosing PhD programs.

Characteristic pains observed in public communities (Reddit r/Indians_StudyAbroad, r/germany, r/cscareerquestions; YouTube comment sections; Telegram/WhatsApp groups):
- Outdated or contradictory information (rules change per intake).
- Agents and consultants with commission conflicts.
- Hard to reach real students at a *specific* university.
- Scams around housing deposits and "guaranteed" admissions or visas.

These pains map directly to product features: last-verified content, university-scoped verification, and anti-scam policy.

## 3. Supply segments & motivations

| Segment | Motivation | Constraints |
|---------|-----------|-------------|
| Working professionals in India | Income, reputation, giving back | Time; employer moonlighting policies (mentor's responsibility; we add an attestation) |
| Alumni abroad (working, PR/citizens) | Income, giving back | Tax residency, cross-border payouts (India PA payouts need an Indian bank account) |
| **Current international students** | Giving back, community, income | **Visa work restrictions** (see [12 §7](12-privacy-compliance.md#7-mentor-work-eligibility-visa-conditions-)) |
| Researchers | Reputation, research community | Very limited time → group clinics fit |

**Critical finding:** the most authentic study-abroad supply (current students at a given university) is often **legally restricted from paid self-employment**:
- **Germany**: freelancing/self-employment on a student permit generally needs approval from the Ausländerbehörde.
- **US F-1**: freelancing, even for foreign clients while physically in the US, is generally unauthorized employment.
- **UK Student visa**: self-employment is prohibited.

**Strategy consequence**: study-abroad supply at launch is a mix of (a) **volunteer current students** hosting free events, community answers and free intro calls, and (b) **paid alumni and working professionals** who have authorization. Free events therefore sit at the core of the business model, not the side.

## 4. Unit economics

Assumptions (verify at contract time): Razorpay standard fee 2% on domestic payments; Route "0.1% + platform fees" per transaction; 18% GST on provider fees; platform commission 10%, GST-inclusive (commission ÷ 1.18 is revenue); platform absorbs payment fees. Input tax credit (ITC) availability ⚖️ depends on GST registration.

### 4.1 Single 1:1 session, ₹2,000

| Line | Amount (₹) |
|------|-----------|
| Student pays | 2,000.00 |
| Mentor share (90%) | 1,800.00 |
| Commission (10%, incl. GST) | 200.00 |
| GST on commission (18/118) | −30.51 |
| Gateway fee 2% | −40.00 |
| Route fee 0.1% | −2.00 |
| GST on provider fees (18%) | −7.56 (recoverable as ITC if registered) |
| **Platform net** | **≈119.93 (no ITC) to 127.49 (with ITC)** → **6.0–6.4%** |

Also: TDS at 0.1% on the mentor's gross, withheld and deposited (mentor's tax credit, not a platform cost) ⚖️.

### 4.2 Group seat, ₹600

| Line | Amount (₹) |
|------|-----------|
| Commission 10% (incl. GST) | 60.00 |
| GST on commission | −9.15 |
| Gateway + Route fees | −12.60 |
| GST on provider fees | −2.27 (ITC-recoverable) |
| **Platform net per seat** | **≈35.98–38.25** |

### 4.3 Sensitivities

- **Refunds**: providers typically do **not** return the original gateway fee on refunds, so each fully refunded ₹2,000 booking costs the platform ≈₹42–49.56. Generous refund policies need to stay affordable. Track "refund cost" as a KPI.
- **Minimum viable seat price**: below ≈₹150 the fixed costs (support, fees) dominate. Default config `group.min_seat_price_minor = 15000` (₹150).
- **Commission alternatives to evaluate in beta**: (a) 10% mentor-borne (current); (b) 5% mentor + 5% student service fee shown upfront; (c) tiered by mentor volume. The engine supports all three ([08 §7](08-payment-architecture.md#7-commission-engine)).
- **Break-even illustration**: at ~US$60/month (≈₹5,000) of paid infrastructure, the platform needs ≈40 ₹2,000 sessions per month to cover infrastructure alone, before any people costs.

## 5. Cold-start strategy

Principles: no fake supply, no spam, no buying reviews, comply with community rules (many subreddits ban self-promotion), with founder-led and value-first outreach.

### 5.1 Sequencing

1. **Pick the wedge** (weeks 0–4): "Indian students → Germany STEM Master's" + "SWE interview prep". Both have dense, reachable communities and clear, searchable pains.
2. **Supply first, curated** (weeks 0–6): hand-recruit 15–30 mentors (friends-of-network, LinkedIn, alumni groups, Indian student associations at German universities) with a founding mentor programme: reduced commission (e.g. 0–5% for 6 months, via mentor-specific commission rule), a "Founding mentor" profile tag, and priority placement for high reliability. Paid mentors must meet the eligibility rules. Current students on restricted visas join as volunteer event hosts.
3. **Free events as demand engine** (weeks 4+): 2–3 free webinars per week ("APS process walk-through, from people who did it in 2026", "Blocked account & first 30 days in Munich", "System design mock with Q&A"). Events are indexable pages, registration builds the email list, and recordings become content.
4. **Content & SEO** (continuous): country/city/university guides written *with* mentors (attributed, sources linked, last-verified dates). Target long-tail queries. Never programmatically generate thin pages.
5. **University ambassadors** (month 2+): volunteer student ambassadors per university run free Q&A events and get a profile badge, event-hosting perks and referral credit (non-cash in MVP to avoid employment-law complications).
6. **Referral programme** (Beta): double-sided credits for completed paid sessions only (prevents fake-account farming); limits per account; fraud checks.
7. **Community presence** (continuous): answer questions genuinely on Reddit/Quora/LinkedIn following each community's self-promotion rules; link to free guides, not sales pages.
8. **YouTube/LinkedIn** (month 2+): short clips from event recordings (with speaker consent), founder posts about lessons learned.

### 5.2 Liquidity metrics to watch
- Search-to-fill: % of searches in the wedge returning ≥ 3 mentors with availability in the next 7 days (target ≥ 80%).
- Mentor utilisation: booked hours / offered hours (healthy 15–40% early; <5% means supply churn risk).
- Time-to-first-booking for new mentors (target < 14 days).

### 5.3 Growth tactics we will **not** use
- Scraping LinkedIn or mass cold DMs (ToS violations, spam).
- Fake mentor profiles or seeded fake reviews (illegal under consumer protection; destroys trust).
- False urgency ("only 1 slot left!" unless literally true), which is a banned dark pattern in India.
- Paying for reviews or incentivising only positive reviews.
- Commission deals with universities or agents that bias recommendations without disclosure.

## 6. Pricing research inputs (for beta tests)

| Reference | Observation |
|-----------|-------------|
| Topmate | Creator storefront; ~10% commission on own-link sales, ~20% on marketplace-driven sales (third-party reported) |
| MentorCruise | Monthly subscriptions; ~16–20% effective fee; USD pricing |
| Preplaced | Long-term 1:1 from ~₹2,500/month (mentor-set) |
| ADPList | Free volunteer mentorship at global scale (40k+ mentors) — sets a "free" anchor for 1:1 intro calls |

Implication: a 10% take rate is competitive; the unit-economics weakness is payment fees at low ticket sizes, not the commission rate.

## Sources (accessed 2026-09-17)

- Razorpay pricing: https://razorpay.com/pricing/
- Topmate fee analysis (third-party): https://eximpe.com/blog/payments/topmate-io-the-complete-guide-to-getting-started-earning-money-avoiding-pitfalls
- MentorCruise fees: https://help.mentorcruise.com/article/61-what-fees-does-mentorcruise-take
- ADPList free model: https://adplist.org/guides/best-mentorship-platforms
- Preplaced pricing: https://www.preplaced.in/blog/preplaced-mentorship-fees
- Germany student self-employment: https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Arbeit/SelbstaendigeTaetigkeit/selbstaendigetaetigkeit-node.html ; https://www.fintiba.com/germany/working/freelancing
- F-1 freelancing: https://www.interstride.com/blog/can-i-freelance-as-an-international-student/
- UK Student visa work: https://www.ukcisa.org.uk/news/navigating-work-and-study-with-a-student-visa/ ; https://registryservices.ed.ac.uk/immigration/working-in-the-uk/working-on-a-student-visa
- CCPA dark patterns: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2134765
- Marketplace leakage: https://www.sharetribe.com/academy/how-to-discourage-people-from-going-around-your-payment-system/
