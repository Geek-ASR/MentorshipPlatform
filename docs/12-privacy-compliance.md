# 12 — Privacy, Legal & Compliance

Status: Draft v0.1 · 2026-09-17

> ⚖️ **This document is engineering research, not legal advice.** It identifies obligations that *appear* relevant so they can be designed for early and reviewed by qualified professionals: an Indian technology/privacy lawyer, a payments lawyer, a chartered accountant, and immigration counsel for the destination countries. Statute references are starting points for that review, not conclusions.

## 1. Jurisdictional scope

| Jurisdiction | Why it may apply | Initial posture |
|-------------|------------------|-----------------|
| **India** | Operator, most users, payments | Primary compliance target |
| **EU/EEA** (e.g. Germany, Netherlands, Ireland, France, Sweden, Finland) | Mentors and students residing there; services offered to them (GDPR Art. 3(2)) | Design to GDPR standards; counsel on Art. 27 representative |
| **UK** | Mentors/students in the UK (UK GDPR); immigration-advice regulation | Same as EU + immigration-advice restrictions |
| **US, Canada, Australia** | Mentors residing there; visa work rules; immigration-advice regulation | Eligibility attestation; content restrictions |

## 2. Data inventory (MVP)

| Data | Subjects | Purpose | Basis (DPDP / GDPR) | Retention | Shared with |
|------|---------|---------|--------------------|-----------|-------------|
| Name, email, password hash, time zone, locale, country | All | Account, service delivery | Consent + contract / Art. 6(1)(b) | Account life + 30 days (then pseudonymised) | Email provider (transactional) |
| Birth year + 18+ attestation | All | Age policy | Legal obligation/consent / Art. 6(1)(c)/(f) | Account life | — |
| Profile (education, work, bio, languages, links, photo) | Mentors (public), students (visibility-controlled) | Marketplace discovery | Consent + contract | Account life | Public (mentor opt-in fields) |
| Verification evidence (documents, institutional email) | Mentors | Credential confirmation | Consent + legitimate use (fraud prevention) / Art. 6(1)(b)/(f) | **30 days after decision** (files); decision metadata account life + 3 years | Staff only |
| Work-eligibility attestation | Mentors | Legal compliance of paid services | Legal obligation / Art. 6(1)(c)/(f) | Account life + 3 years | — |
| Payout identity & bank (PA-held) | Mentors | Payouts, tax | Contract, legal obligation | **Held by PA**; we store ids/masks/status for statutory period ⚖️ | Razorpay |
| Bookings, intake answers | Students, mentors | Service delivery | Contract | Bookings: statutory (≈ 8 years, tied to financial records ⚖️); intake answers: 12 months after session | Counterparty |
| Payments, refunds, invoices | Students, mentors | Payments, accounting, tax | Contract + legal obligation | ≈ 8 years ⚖️ | Razorpay, tax authorities |
| Messages | Participants | Communication, safety | Contract + legitimate use (safety) | 12 months after conversation close (longer if under case/legal hold) | Counterparty; staff on report/dispute |
| Reports, cases, enforcement | Involved users | Safety, legal compliance | Legitimate use / Art. 6(1)(f), 6(1)(c) | 3 years after closure (bans: while active + 3 years) | Law enforcement on lawful request |
| Reviews | Students (authors), mentors | Marketplace trust | Consent + legitimate interest | Until removed / author erasure (pseudonymised) | Public |
| Security logs (IP prefix, UA hash, auth events) | All | Security, legal (CERT-In) | Legal obligation | **≥ 180 days in India** (CERT-In) and ≥ 1 year where DPDP Rules require ⚖️ | — |
| Analytics events (pseudonymous) | Visitors, users | Product improvement | Consent/legitimate interest ⚖️ | 13 months | — |
| Support/grievance tickets | All | Grievance redressal | Legal obligation | 3 years | — |

Principles: **collect the minimum**. No Aadhaar, passport or government ID images. No phone numbers in MVP. No precise location. No sensitive categories (health, religion, etc.) solicited. Intake questions warn users not to share sensitive personal data.

## 3. India — Digital Personal Data Protection Act 2023 & DPDP Rules 2025 ⚖️

**Status:** DPDP Rules notified **14 November 2025** with phased commencement: some provisions immediately (Board-related), consent-manager provisions after 12 months (Nov 2026), and substantive Data Fiduciary obligations after 18 months (**~13–14 May 2027**). We design for full compliance now, because retrofitting consent and rights flows is expensive.

| Obligation (as understood) | Design response | Phase |
|---------------------------|-----------------|-------|
| **Notice** in clear, plain language, itemising data and purposes, how to withdraw consent, exercise rights and complain to the Board; available in English or Eighth-Schedule languages on request | Layered privacy notice at sign-up with itemised purposes; versioned; notice link on every data-collecting form | MVP |
| **Consent**: free, specific, informed, unconditional, unambiguous, affirmative; withdrawal as easy as giving | Separate toggles for optional purposes (marketing emails, analytics beyond essential); `user_consents` with version + timestamp; one-click withdrawal in settings | MVP |
| **Legitimate uses** without consent (limited) | Documented per processing activity (e.g. legal obligations, fraud prevention); record in processing register | MVP (doc) |
| **Reasonable security safeguards** (encryption/obfuscation, access control, logging and monitoring, backups, continuity; contracts with processors) | [11](11-security-threat-model.md), [15](15-observability.md); processor DPAs (Supabase, host, Resend, Sentry, Razorpay) | MVP / Beta |
| **Breach intimation** to affected Data Principals and the Data Protection Board without delay, with a detailed report to the Board within **72 hours** (per Rules; verify) | Incident runbook with notification templates and decision tree | MVP (runbook) |
| **Erasure** when purpose served / consent withdrawn, subject to legal retention | Retention jobs; erasure workflow with legal-hold exceptions | MVP |
| **Rights**: access/information, correction, completion, update, erasure, grievance redressal, **nomination** | Settings: data export (JSON/ZIP), profile edit, deletion request, grievance form, nominee field (Beta) | MVP (nominee: Beta) |
| **Grievance redressal** within prescribed period (Rules specify a maximum; verify) | `data_requests` + grievance tickets with SLA timers | MVP |
| **Children (< 18)**: verifiable parental consent; no tracking, behavioural monitoring or targeted advertising directed at children | **MVP excludes under-18 users** (age gate). Future guardian flow with DigiLocker/token-based verifiable consent | MVP gate / Future |
| Contact details of a person who can answer privacy questions (DPO only for Significant Data Fiduciaries) | Published privacy contact + grievance officer | MVP |
| Cross-border transfer permitted except to countries the government restricts | Track processor locations; region choice (DB in **Mumbai `ap-south-1`**) | MVP |
| Penalties up to ₹250 crore per breach type | Risk register R13 | — |

## 4. EU/UK GDPR ⚖️

| Topic | Design response |
|-------|-----------------|
| Applicability | Likely for EU/UK-resident users (offering services) |
| Lawful bases | Contract (bookings, payments), legal obligation (tax, safety records), legitimate interests (fraud prevention, T&S, security logs; balancing tests documented), consent (marketing, optional analytics) |
| Art. 27 representative | Counsel to assess (processing may not be "occasional") |
| Records of processing (Art. 30) | Processing register maintained from §2 |
| DPIA | For verification documents, automated moderation/detectors, policy engine |
| Automated decisions (Art. 22) | No solely automated decisions with legal or similarly significant effects: suspensions/bans are human-decided; low-severity automatic restrictions are time-boxed and appealable, with explanation |
| Data subject rights | Export, erasure, rectification, restriction, objection within 1 month; same tooling as DPDP |
| International transfers | India has no EU adequacy decision → SCCs with processors; transfer impact assessment ⚖️ |
| Breach notification | Supervisory authority within 72 h where required |
| Cookies/ePrivacy | See §11 |

## 5. Consumer protection (India) ⚖️

| Instrument | Relevant obligations (as understood) | Design response |
|-----------|-------------------------------------|-----------------|
| Consumer Protection Act 2019 | Unfair trade practices, misleading advertisements, product liability concepts | Scoped verification badges; accurate claims; no fake scarcity |
| **Consumer Protection (E-Commerce) Rules 2020**: marketplace e-commerce entity | Display legal name, address, customer-care and **grievance officer** details; acknowledge complaints within **48 h** and redress within **1 month**; show seller (mentor) details needed for informed decisions; clear return/refund/cancellation information; no price manipulation; appoint a resident-in-India nodal officer where applicable | Footer + `/legal/grievance` page; mentor profile shows details relevant to service; refund policy linked at checkout; grievance ticketing with SLA |
| **Guidelines for Prevention and Regulation of Dark Patterns 2023** (13 patterns incl. false urgency, basket sneaking, confirm shaming, forced action, subscription trap, interface interference, bait & switch, **drip pricing**, disguised ads, nagging, trick wording, SaaS billing, rogue malware); CCPA 2025 advisory to self-audit | **Full price shown before slot selection**; no pre-ticked add-ons; seat counts only when real; no confirm-shaming copy; easy cancellation; "Sponsored" labels if ever used; design review checklist per UI PR |
| CCPA Guidelines on Misleading Advertisements (2022) | Claims must be substantiated; endorsements disclosed | Marketing copy review; mentor claim-phrase detection |
| Online reviews: BIS standard IS 19000:2022 (voluntary) | Review integrity practices | [10 §10](10-trust-and-safety.md#10-reviews--ratings-integrity) aligns (verified purchase, no suppression of negative reviews) |

Other markets if serving consumers there: EU Omnibus Directive (review verification disclosure, price transparency), US FTC Rule on consumer reviews and testimonials (2024).

## 6. Intermediary & IT law (India) ⚖️

| Instrument | Obligations (as understood) | Design response |
|-----------|----------------------------|-----------------|
| IT Act 2000 s.79 & **IT (Intermediary Guidelines) Rules 2021**, amended **2026** (in force 20 Feb 2026) | Publish rules, privacy policy and user agreement; inform users of rules; **Grievance Officer** acknowledges within **24 h** and resolves within the amended period (reported as **7 days**); shortened takedown timelines for certain unlawful content (reported **36 h**, and **2 h** for specified content such as non-consensual intimate imagery); assist lawful government requests within prescribed time | Community Guidelines + Terms; grievance officer page; report reasons mapped to legal categories; P0 queue for time-critical content with takedown tooling; law-enforcement request procedure |
| **CERT-In Directions (April 2022)** | Report specified cyber incidents within **6 h**; keep ICT logs for **180 days within India**; synchronise clocks to NTP (NIC/NPL or traceable) | Incident runbook; log retention in India (host/DB region `ap-south-1` + log export) ⚖️ confirm how free-tier logging meets this; NTP via host |

## 7. Mentor work eligibility (visa conditions) ⚖️

**Risk R1:** paying current international students for mentoring may breach their immigration conditions, even when the payer is abroad.

| Country | Researched indication (verify with immigration counsel) | Confidence |
|---------|---------------------------------------------------------|------------|
| Germany | Students may work limited employment; **self-employment/freelancing generally requires approval** from the Ausländerbehörde (and possibly the Federal Employment Agency) | Medium (multiple sources) |
| USA (F-1) | Freelancing or paid contract work **while physically in the US is generally unauthorized employment**, even for foreign clients; limited exceptions (CPT/OPT with conditions) | Medium–High |
| UK (Student visa) | **Self-employment is prohibited**; freelance/consulting is treated as self-employment | High (UKCISA, universities) |
| Canada, Australia, Netherlands, Ireland, France, Sweden, Finland | Not yet researched; rules differ on self-employment and hour caps | Unknown → treat as restricted until verified |

**Product controls (MVP):**
1. Mentors attest country of residence, status category and authorisation for paid independent services.
2. `student_visa` / unverified-country / not-authorised → **volunteer mode** (free sessions, free events, community). Paid mode requires staff-reviewed evidence of authorisation.
3. Country guidance pages with official sources; the attestation screen explains why.
4. Mentor Agreement: mentor warrants lawful eligibility and is responsible for their own tax and immigration compliance.
5. Annual re-attestation; country change triggers re-attestation.
6. Admin setting `mentor_eligibility.country_rules` (per country + status → allowed modes), editable as counsel confirms each country.

Also flag: Indian mentors employed full-time may have **employer moonlighting or conflict-of-interest policies** (their responsibility; the attestation includes an acknowledgement). Mentors who are NRIs for FEMA purposes receiving INR into Indian accounts raise **FEMA/tax questions** ⚖️.

## 8. Immigration advice regulation ⚖️

Several destination countries restrict who may give **immigration advice or assistance**, sometimes regardless of where the adviser is located or whether it is for profit. Starting points for counsel:

| Country | Regime (to verify) |
|---------|-------------------|
| UK | Immigration and Asylum Act 1999 (s.84) — advice regulated by the Immigration Advice Authority (formerly OISC) |
| Canada | Immigration and Refugee Protection Act s.91 — only authorised representatives (e.g. licensed consultants via CICC, lawyers) may advise for consideration |
| Australia | Migration Act 1958 (Part 3) — immigration assistance by registered migration agents |
| New Zealand | Immigration Advisers Licensing Act 2007 — licensing, including offshore advisers |
| USA | Practice of immigration law limited to attorneys and accredited representatives; state "notario" laws |
| India | Regulation of overseas education/immigration consultants in some states (e.g. Punjab's travel professionals legislation) — relevance to a peer-mentoring marketplace to be assessed |

**Product controls (MVP):**
- There is **no "immigration advice" service category**. The study-abroad taxonomy uses "Visa process — personal experience", "Documents I prepared (experience)", "Life after arrival".
- Mentors may share personal experience and point to official sources. They may not assess eligibility for a fee, fill in or submit forms, represent students to authorities, or promise outcomes (Mentor Agreement + Community Guidelines + claim detection).
- Persistent disclaimer on visa-related services, events and content ([§14](#14-study-abroad-disclaimer-system)).
- Counsel to review whether *paid* experience-sharing sessions on visa topics need further restriction per country (e.g. visa topics limited to free events for UK/CA/AU/NZ). Implemented as a per-country taxonomy flag `paid_allowed`.

## 9. Payments regulation ⚖️

| Topic | Design response |
|-------|-----------------|
| RBI Payment Aggregator Directions (15 Sep 2025): funds in PA escrow, merchant/marketplace KYC, sellers must be onboarded to the marketplace | Split settlement through a licensed PA; mentors onboarded as linked accounts with PA KYC; platform never pools mentor funds ([08 §3](08-payment-architecture.md#3-regulatory-funds-flow-principle-)) |
| Refunds to source instrument; refund timelines | Refunds only via provider to original method; status tracking and notifications |
| PCI DSS | No card data touches our servers (hosted Checkout); SAQ-A-level posture to confirm with PA |
| Chargebacks | Evidence retention (attendance signals, messages) for the dispute window |
| Live payments go-live | Gate checklist [08 §13](08-payment-architecture.md#13-production-critical-gate-for-live-payments) |

## 10. Tax & invoicing ⚖️

Summary in [08 §12](08-payment-architecture.md#12-taxes-receipts-invoices-): GST registration as an e-commerce operator, GST on commission, possible TCS (s.52 CGST) depending on mentor registration, TDS at 0.1% on payouts (Income-tax Act 2025 s.393(1), formerly s.194-O; threshold rules), invoice series per FY, credit notes on refunds, mentor PAN via PA KYC, FY gross tracking per mentor. Payouts to non-residents and cross-border mentors are out of scope for MVP.

## 11. Cookies & tracking

| Cookie/storage | Purpose | Category | Consent |
|---------------|---------|----------|---------|
| `__Host-…_session` | Authentication | Strictly necessary | Not required (disclosed) |
| Turnstile | Bot protection | Strictly necessary/security | Disclosed ⚖️ (EU nuance) |
| Razorpay Checkout | Payment processing (checkout step only) | Necessary for requested service | Disclosed |
| UI preferences (theme, dismissed banners) | Functionality | localStorage, not identifying | Disclosed |
| Analytics | Product metrics | **Cookieless**, server-side events, daily-rotating salted hash, no cross-site tracking | Disclosed; EU visitors: counsel to confirm consent is not required, else gate behind consent |
| Marketing pixels | — | **Not used in MVP** | — |

No consent banner needed if the above holds (to confirm with counsel for EU visitors). A consent framework is added if marketing pixels are ever introduced.

## 12. Accessibility law

Target **WCAG 2.2 AA** ([22 §8](22-ux-seo-design-system.md#8-accessibility-wcag-22-aa)). Relevant regimes: India's Rights of Persons with Disabilities Act 2016 and rules; EU European Accessibility Act (applies from 28 June 2025 to certain consumer e-commerce services; microenterprise exemptions may apply ⚖️).

## 13. Retention schedule (summary)

| Record | Retention | Mechanism |
|--------|----------|-----------|
| Verification documents | 30 days after decision | Daily purge job; object deletion verified |
| Messages | 12 months after conversation close | Purge job (skips legal hold/open cases) |
| Intake answers | 12 months after session | Purge job |
| Analytics events | 13 months | Partition drop |
| Security logs | ≥ 180 days (India) / ≥ 1 year if required by DPDP Rules ⚖️ | Log export to durable storage |
| Webhook payloads (redacted) | 180 days | Purge job |
| Financial records | ≈ 8 years ⚖️ | Never auto-deleted; pseudonymised links |
| Moderation cases/actions | 3 years after closure (bans: active + 3 years) | Purge/pseudonymise job |
| Deleted accounts | PII scrubbed after a 14-day grace | Deletion workflow |
| Backups | Rolling 30 days (containing deleted data until rotation; disclosed in the privacy policy) | Backup rotation |

## 14. Study-abroad disclaimer system

Content and mentor guidance on admissions, visas, housing and local life becomes outdated and must not look like official policy.

**Content metadata** (`articles`, `event_details`, services in study-abroad categories):
`source_type` (`official` | `mentor_experience` | `community` | `editorial`), `sources[]` (URL, publisher, `is_official`, accessed date), `last_verified_at`, `verified_by`, `next_review_due_at`, `applies_to_intake` (e.g. "Winter 2026/27"), `country`, `university`, `disclaimer_kind`.

**UI rules:**
- Every study-abroad page shows a **freshness line**: "Last verified 12 Aug 2026 · Applies to Winter 2026/27 intake · Sources: DAAD, uni-assist (official)".
- Pages past `next_review_due_at` show an "*This information may be outdated*" banner and are excluded from "featured"; editors get a review queue.
- Mentor services/events on visa, immigration, finance or legal topics show: **"Mentor experience, not official university, immigration, legal or financial advice. Always confirm with official sources."** plus links to official sources for that country.
- Community answers (Beta) are labelled "Community answer" and never styled like official guidance.
- Checkout for visa-topic services includes a one-time acknowledgement checkbox (versioned consent record).

## 15. Legal documents (to draft, then counsel review)

| Document | Must cover (non-exhaustive) | Needed by |
|----------|----------------------------|-----------|
| Terms of Service | Marketplace role (platform vs mentor as service provider), eligibility (18+), accounts, fees, cancellations, disputes, prohibited conduct, IP, liability limits, governing law, grievance | Sandbox beta |
| Privacy Policy | DPDP/GDPR notices, data inventory, purposes, rights, retention, processors, transfers, children, contacts | Sandbox beta |
| Refund & Cancellation Policy | Windows and percentages from [17](17-business-rules.md), mentor cancellations, no-shows, technical failures, group minimums, refund timelines | Sandbox beta |
| Mentor Agreement | Independent-provider status, eligibility warranties (visa/employer), prohibited services, reliability policy, payouts/holds/clawbacks, taxes, KYC, content licence, confidentiality | Before mentor onboarding |
| Community Guidelines | Conduct, off-platform payments, reviews, reporting, enforcement ladder, appeals | Sandbox beta |
| Grievance Redressal Policy | Grievance officer, timelines (E-Commerce Rules, IT Rules), escalation | Sandbox beta |
| Cookie notice | §11 table | Sandbox beta |
| Content & disclaimer policy | §14 | Sandbox beta |
| Law-enforcement request procedure (internal) | Verification of requests, minimum disclosure, logging | Before public launch |

## 16. Compliance checklist

Status legend: ☐ not started · ◐ designed (this doc set) · ● implemented · ✔ counsel-reviewed

| # | Item | Status | Gate |
|---|------|--------|------|
| 1 | Age gate 18+ with configurable policy | ◐ | Sandbox beta |
| 2 | Layered privacy notice + versioned consents | ◐ | Sandbox beta |
| 3 | Data export & deletion workflows with SLAs | ◐ | Sandbox beta |
| 4 | Retention jobs per schedule | ◐ | Sandbox beta |
| 5 | Grievance officer + page + ticketing SLAs (E-Com Rules 48 h/1 month; IT Rules 24 h/amended period) | ◐ | Public beta |
| 6 | Terms, Privacy, Refund, Community Guidelines published | ☐ | Sandbox beta (draft) / live (✔) |
| 7 | Mentor Agreement incl. eligibility warranties | ☐ | Mentor onboarding |
| 8 | Work-eligibility attestation + volunteer mode | ◐ | Mentor onboarding |
| 9 | Immigration-advice restrictions (taxonomy flags, claim detection, disclaimers) | ◐ | Public beta |
| 10 | Dark-pattern design review checklist | ◐ | Every UI PR |
| 11 | Scoped verification badges (no generic "Verified") | ◐ | Sandbox beta |
| 12 | Processor DPAs/terms reviewed (Supabase, host, Resend, Sentry, Razorpay, Cloudflare) | ☐ | Public beta |
| 13 | Data residency: DB region Mumbai; log retention in India | ◐ | Public beta |
| 14 | Incident & breach runbook (CERT-In 6 h, DPDP Board, GDPR 72 h) | ◐ | Public beta |
| 15 | RBI PA-compliant funds flow confirmed with PA/counsel | ☐ | **Live money** |
| 16 | GST registration; TCS/TDS/invoicing reviewed by CA | ☐ | **Live money** |
| 17 | Legal entity formed; PA KYC complete | ☐ | **Live money** |
| 18 | DPIA for verification + automated moderation | ☐ | Public beta |
| 19 | GDPR Art. 27 representative assessment | ☐ | Before EU marketing |
| 20 | Accessibility audit (WCAG 2.2 AA) | ☐ | Public beta |
| 21 | Trademark search for brand name | ☐ | Before public launch |
| 22 | Recording consent for events | ◐ | Events launch |
| 23 | Law-enforcement request procedure | ☐ | Public launch |
| 24 | Security review + external pen test | ☐ | **Live money** |

## 17. Areas explicitly requiring professional review

1. Whether the platform is a "marketplace e-commerce entity" and an "intermediary", and the resulting liability for mentor advice.
2. RBI PA compliance of the Route-based funds flow; holds/reversals; refund timelines.
3. GST (ECO registration, TCS applicability, place of supply, invoicing on behalf of mentors), TDS under s.393, record retention periods.
4. DPDP applicability timelines, notice language, legitimate-use reliance, children's data, breach timelines, nominee rights.
5. GDPR/UK GDPR applicability, Art. 27, SCCs, cookies for EU visitors.
6. Visa work eligibility per destination country; paid vs volunteer mentoring; wording of attestations.
7. Immigration-advice regulation for visa-topic sessions per country.
8. Liability disclaimers and their enforceability under Indian consumer law.
9. Mentor classification (independent contractor), mentor agreement terms, clawbacks.
10. Content licensing for university data (ROR CC0, GeoNames CC BY, domain list MIT) and use of university names/logos (no logos without permission).
11. Law-enforcement cooperation and data disclosure procedures.
12. Brand trademark clearance.

## Sources (accessed 2026-09-17)

- DPDP Rules 2025 notification (PIB): https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014 ; EY guide: https://www.ey.com/en_in/insights/cybersecurity/transforming-data-privacy-digital-personal-data-protection-rules-2025 ; phased timeline: https://www.consently.in/blog/dpdp-rules-2025-implementation-timeline-india
- Consumer Protection (E-Commerce) Rules 2020 overview: https://www.khaitanco.com/thought-leaderships/Stricter-Regulations-on-E-Commerce-The-Consumer-Protection-E-Commerce-Rules-2020
- Dark patterns: https://www.pib.gov.in/PressReleasePage.aspx?PRID=2134765 ; https://www.azbpartners.com/bank/regulatory-crackdown-on-dark-patterns-ccpas-enforcement-actions-and-emerging-compliance-landscape-in-indian-e-commerce/
- IT Amendment Rules 2026: https://www.khaitanco.com/thought-leadership/MeitY-notifies-the-IT-Amendment-Rules-2026
- CERT-In Directions: https://www.internetsociety.org/resources/doc/2022/internet-impact-brief-india-cert-in-cybersecurity-directions-2022/
- RBI PA Directions 2025: https://www.medianama.com/2025/09/223-explained-rbi-master-direction-payment-aggregators/
- GST/TCS: https://gstcouncil.gov.in/sites/default/files/2024-02/faq-e-commerc.pdf ; TDS: https://www.terra-insight.com/insights/section-194o-tds-0-1-percent-current-rate-history-india/
- Visa work rules: https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Arbeit/SelbstaendigeTaetigkeit/selbstaendigetaetigkeit-node.html ; https://www.interstride.com/blog/can-i-freelance-as-an-international-student/ ; https://www.ukcisa.org.uk/news/navigating-work-and-study-with-a-student-visa/
