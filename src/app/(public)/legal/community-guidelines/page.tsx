import type { Metadata } from "next";
import Link from "next/link";
import { brand } from "@/config/brand";
import { LegalDocument } from "@/ui/legal-shell";

export const metadata: Metadata = {
  title: "Community Guidelines",
  description: `Expected conduct on ${brand.name}, how to report a problem, and how enforcement works.`,
  alternates: { canonical: "/legal/community-guidelines" },
};

export default function CommunityGuidelinesPage() {
  return (
    <LegalDocument title="Community Guidelines" lastUpdated="25 September 2026">
      <p>
        These guidelines describe how we expect students and mentors to treat each other, and what
        happens when that trust is broken.
      </p>

      <h2>1. What we expect</h2>
      <ul>
        <li>Be honest about who you are, your credentials and your experience.</li>
        <li>
          Show up for what you book, or cancel with enough notice for the other person to adjust.
        </li>
        <li>
          Keep booking and payment on the platform — it&apos;s what keeps both sides protected.
        </li>
        <li>
          If a topic touches admissions, visas, law, finance or medicine, share it as personal
          experience, and point to official sources rather than presenting it as official advice.
        </li>
        <li>Treat every other user with basic respect, regardless of disagreement.</li>
      </ul>

      <h2>2. Not allowed</h2>
      <ul>
        <li>Harassment, hate speech, threats or discriminatory treatment.</li>
        <li>Circumventing the platform to pay or be paid outside a booked session.</li>
        <li>Sharing another user&apos;s private information without consent.</li>
        <li>Misrepresenting credentials, affiliations, or eligibility to work.</li>
        <li>Sexually explicit content or solicitation.</li>
        <li>Spam, scams, or content unrelated to mentorship.</li>
        <li>
          Presenting personal experience as official university, immigration, legal, financial or
          medical advice.
        </li>
      </ul>

      <h2>3. Reporting a problem</h2>
      <p>
        Use the &ldquo;Report&rdquo; action on a profile, message, session or review. Tell us what
        happened; a staff reviewer looks at every report. We&apos;ll let you know once it&apos;s
        been reviewed.
      </p>

      <h2>4. How enforcement works</h2>
      <p>
        Depending on severity and history, an outcome can range from a warning, a time-boxed
        restriction on a specific capability (for example, messaging or listing visibility), a
        suspension, to a ban for the most serious or repeated violations. We tell you what happened,
        why, how long it lasts, and how to appeal.
      </p>

      <h2>5. Appeals</h2>
      <p>
        If you believe an enforcement action was a mistake, you can appeal it from your account. A
        different staff reviewer looks at appeals where practical.
      </p>

      <h2>6. Reviews</h2>
      <p>
        Reviews may only be left after a completed session. We don&apos;t remove a review for being
        negative — only for violating these guidelines (for example, harassment or off-topic
        content).
      </p>

      <h2>Related</h2>
      <p>
        See also our{" "}
        <Link href="/legal/terms" className="text-primary hover:underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/legal/grievance" className="text-primary hover:underline">
          Grievance Redressal Policy
        </Link>
        .
      </p>
    </LegalDocument>
  );
}
