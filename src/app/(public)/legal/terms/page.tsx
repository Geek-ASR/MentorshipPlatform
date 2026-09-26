import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { LEGAL_VERSIONS, legalVersionLabel } from "@/config/legal";
import { LegalDocument } from "@/ui/legal-shell";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: `The terms for using ${brand.name}.`,
  alternates: { canonical: "/legal/terms" },
};

export default function TermsPage() {
  return (
    <LegalDocument title="Terms of Service" lastUpdated={legalVersionLabel(LEGAL_VERSIONS.terms)}>
      <p>
        These Terms govern use of {brand.name} (operated by {brand.legalEntityName},
        &ldquo;we&rdquo;, &ldquo;us&rdquo;), a marketplace connecting students with independent
        mentors for paid and free sessions, group sessions and events.
      </p>

      <h2>1. Our role</h2>
      <p>
        {brand.name} is a marketplace. Mentors are independent providers, not our employees or
        agents. We facilitate discovery, scheduling and payment, and set baseline policies (docs/17)
        for cancellations, no-shows and disputes, but a mentor is responsible for the content and
        conduct of their own sessions.
      </p>

      <h2>2. Eligibility</h2>
      <p>
        You must be 18 or older to create an account. Mentors additionally attest to their residency
        status and work-eligibility before offering paid sessions; where that attestation cannot
        confirm authorisation to work, mentoring is offered in volunteer (free) mode only.
      </p>

      <h2>3. Accounts</h2>
      <p>
        You are responsible for your account credentials and for keeping your profile information
        accurate. We may suspend or restrict an account for a violation of these Terms or our{" "}
        <Link href="/legal/community-guidelines" className="text-primary hover:underline">
          Community Guidelines
        </Link>
        , following the enforcement process described there.
      </p>

      <h2>4. Fees and cancellations</h2>
      <p>
        The full price of a session, including any platform fee, is shown before you confirm a
        booking. Cancellation windows, refund percentages and no-show handling are set out in our{" "}
        <Link href="/legal/refund-cancellation" className="text-primary hover:underline">
          Refund &amp; Cancellation Policy
        </Link>
        .
      </p>

      <h2>5. Prohibited conduct</h2>
      <ul>
        <li>Circumventing the platform to pay or be paid off-platform for a booked session.</li>
        <li>Harassment, discrimination or abusive conduct toward another user.</li>
        <li>Misrepresenting your identity, credentials, affiliations or eligibility.</li>
        <li>
          Presenting a mentor&apos;s personal experience as official university, immigration, legal,
          financial or medical advice.
        </li>
        <li>Uploading unlawful, infringing or harmful content.</li>
      </ul>

      <h2>6. Content and intellectual property</h2>
      <p>
        You retain ownership of content you post (profile content, messages, guide contributions).
        You grant us a licence to host and display it as needed to operate the service. We own the{" "}
        {brand.name} name, mark and platform software.
      </p>

      <h2>7. Disclaimers and liability</h2>
      <p>
        Mentors share personal experience, not professional advice. We do not guarantee outcomes
        (admission decisions, job offers, visa approvals). To the extent permitted by law, our
        liability is limited to the amount you paid for the session giving rise to a claim in the
        preceding 12 months.
      </p>

      <h2>8. Disputes and grievances</h2>
      <p>
        A booking dispute is handled through our in-platform dispute process (docs/10). A general
        grievance about the platform follows our{" "}
        <Link href="/legal/grievance" className="text-primary hover:underline">
          Grievance Redressal Policy
        </Link>
        .
      </p>

      <h2>9. Governing law</h2>
      <p>
        These Terms are governed by the laws of India, without regard to conflict-of-laws rules.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update these Terms as the platform develops. Material changes will be notified in-app
        before they take effect.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms:{" "}
        <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>.
      </p>
    </LegalDocument>
  );
}
