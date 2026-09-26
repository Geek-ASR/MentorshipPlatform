import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { LEGAL_VERSIONS, legalVersionLabel } from "@/config/legal";
import { LegalDocument } from "@/ui/legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: `How ${brand.name} collects, uses and protects your data.`,
  alternates: { canonical: "/legal/privacy" },
};

export default function PrivacyPage() {
  return (
    <LegalDocument title="Privacy Policy" lastUpdated={legalVersionLabel(LEGAL_VERSIONS.privacy)}>
      <p>
        This policy explains what personal data {brand.name} collects, why, and the rights you have
        over it, in line with India&apos;s Digital Personal Data Protection Act 2023 and, for
        visitors in the EU/UK, the GDPR (docs/12).
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li>Account data: name, email, password hash, time zone, locale, country.</li>
        <li>Age confirmation (18+), stored as a yes/no attestation, not a birth date.</li>
        <li>
          Profile data mentors and students choose to add: education, work history, bio, languages,
          links, photo.
        </li>
        <li>
          Verification evidence (institutional email or uploaded documents) — kept only 30 days
          after a decision; the decision itself is kept longer for audit purposes.
        </li>
        <li>Booking, payment, refund and invoice records, kept for the period tax law requires.</li>
        <li>Messages between users, kept 12 months after a conversation closes.</li>
        <li>Reports, moderation cases and enforcement actions, for platform safety.</li>
        <li>Security logs (IP prefix, device signal, sign-in events).</li>
        <li>Cookieless, pseudonymous analytics events.</li>
      </ul>
      <p>
        We do not collect government ID images, phone numbers or precise location in the current
        version of the platform, and we ask users not to share sensitive personal data (health,
        religion, and similar) in intake forms or messages.
      </p>

      <h2>2. Why we collect it</h2>
      <p>
        To create your account and deliver the service you request, to process payments, to keep the
        platform safe (fraud prevention, trust &amp; safety enforcement), and to meet legal
        obligations (tax records, security-incident logging). Optional purposes — such as marketing
        email or analytics beyond what the service itself needs — are only used with your separate,
        specific consent, which you can withdraw at any time in Settings.
      </p>

      <h2>3. Who we share it with</h2>
      <p>
        Your counterparty in a booking sees what a session naturally requires. Staff see reported or
        disputed content when reviewing a case. Processors that help us run the service — payments
        (Razorpay), transactional email, hosting/database, error monitoring — see only what their
        function needs. We do not sell personal data or use marketing pixels.
      </p>

      <h2>4. Where your data is stored</h2>
      <p>
        Our primary database runs in the Mumbai (ap-south-1) region. Where a processor is outside
        India, we rely on their standard contractual safeguards.
      </p>

      <h2>5. Your rights</h2>
      <p>You can, from Settings or by writing to us:</p>
      <ul>
        <li>See and export the personal data we hold about you.</li>
        <li>Correct or update inaccurate data.</li>
        <li>Withdraw a consent you previously gave.</li>
        <li>
          Request deletion of your account, subject to a short grace period and any legal retention
          we must honour (e.g. financial records).
        </li>
        <li>
          Raise a grievance — see our{" "}
          <Link href="/legal/grievance" className="text-primary hover:underline">
            Grievance Redressal Policy
          </Link>
          .
        </li>
      </ul>

      <h2>6. Retention</h2>
      <p>
        We keep data only as long as its purpose requires: verification documents 30 days after a
        decision, messages 12 months after a conversation closes, financial records for the
        statutory period, and security logs at least 180 days. A deleted account&apos;s personal
        data is scrubbed after a 14-day grace period, except where we must keep pseudonymised
        records for legal or financial reasons.
      </p>

      <h2>7. Cookies</h2>
      <p>
        We use a strictly-necessary session cookie, a bot-protection check at sign-up, the payment
        provider&apos;s checkout script during payment only, and cookieless analytics. We do not run
        marketing/advertising trackers.
      </p>

      <h2>8. Children</h2>
      <p>The platform is not available to anyone under 18.</p>

      <h2>9. Changes</h2>
      <p>We will post material changes here and notify signed-in users in-app.</p>

      <h2>Contact</h2>
      <p>
        Privacy questions or requests:{" "}
        <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
      </p>
    </LegalDocument>
  );
}
