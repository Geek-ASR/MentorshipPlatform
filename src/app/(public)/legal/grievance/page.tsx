import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { LegalDocument } from "@/ui/legal-shell";

export const metadata: Metadata = {
  title: "Grievance Redressal Policy",
  description: `How to raise a grievance about ${brand.name} and how it's handled.`,
  alternates: { canonical: "/legal/grievance" },
};

export default function GrievancePage() {
  return (
    <LegalDocument title="Grievance Redressal Policy" lastUpdated="25 September 2026">
      <p>
        This policy explains how to raise a complaint about the platform itself — separate from
        reporting another user (see our{" "}
        <a href="/legal/community-guidelines" className="text-primary hover:underline">
          Community Guidelines
        </a>
        ) or disputing a specific booking outcome (available from the booking itself).
      </p>

      <h2>1. Grievance officer</h2>
      <p>
        {brand.grievanceOfficerName}. Until a named officer is designated, grievances are handled by
        our support team at the contact below.
      </p>

      <h2>2. How to raise a grievance</h2>
      <p>
        Email <a href={`mailto:${brand.grievanceContactEmail}`}>{brand.grievanceContactEmail}</a>{" "}
        with a description of the issue, your account email, and any relevant booking or case
        reference.
      </p>

      <h2>3. Timelines we aim for</h2>
      <ul>
        <li>Acknowledgement within 48 hours of receipt.</li>
        <li>Resolution, or a clear next-step update, within 1 month.</li>
      </ul>
      <p>
        These targets follow the Consumer Protection (E-Commerce) Rules 2020 and the IT Intermediary
        Guidelines&apos; grievance-redressal timelines, pending final confirmation with counsel on
        the exact figures that apply to us.
      </p>

      <h2>4. Escalation</h2>
      <p>
        If you&apos;re not satisfied with how a grievance was handled, say so in your reply and ask
        for it to be escalated — it will be reviewed by someone who wasn&apos;t involved in the
        original response, where our current team size allows.
      </p>

      <h2>5. Law-enforcement and regulatory requests</h2>
      <p>
        We respond to lawful requests from authorities following our internal verification and
        minimum-disclosure procedure, and keep a record of requests received and our response.
      </p>
    </LegalDocument>
  );
}
