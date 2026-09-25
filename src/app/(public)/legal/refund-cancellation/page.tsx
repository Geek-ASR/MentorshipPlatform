import type { Metadata } from "next";
import { brand } from "@/config/brand";
import { LegalDocument } from "@/ui/legal-shell";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy",
  description: `When you get a refund on ${brand.name} — cancellations, no-shows and technical failures.`,
  alternates: { canonical: "/legal/refund-cancellation" },
};

export default function RefundCancellationPage() {
  return (
    <LegalDocument title="Refund & Cancellation Policy" lastUpdated="25 September 2026">
      <p>
        The full price of a session, including any platform fee, is always shown before you
        confirm a booking. These are the default windows and percentages (docs/17); an admin may
        publish a different rule for a specific service or promotion, always disclosed at booking.
      </p>

      <h2>1. Student cancels a 1:1 or group session</h2>
      <ul>
        <li>24 hours or more before start: full refund.</li>
        <li>Between 6 and 24 hours before start: 50% refund.</li>
        <li>Less than 6 hours before start: no refund, except one courtesy late cancellation per rolling 90 days, refunded at the 50% rate.</li>
      </ul>

      <h2>2. Mentor cancels a confirmed session</h2>
      <p>Full refund, regardless of timing.</p>

      <h2>3. No-shows</h2>
      <ul>
        <li>
          Mentor confirmed absent: student gets a full refund, and the absence is recorded against
          the mentor&apos;s reliability.
        </li>
        <li>
          Student confirmed absent: the mentor is still paid; the student may dispute the outcome
          within the contest window.
        </li>
      </ul>

      <h2>4. Group sessions that don&apos;t reach the minimum</h2>
      <p>
        If a group session auto-cancels because it didn&apos;t reach its minimum-participants
        threshold, every registered seat is refunded in full.
      </p>

      <h2>5. Technical or platform failures</h2>
      <p>
        If a session doesn&apos;t happen because of a platform-caused technical failure (for
        example, a payment captured after the slot was already lost to someone else), the payment
        is refunded in full.
      </p>

      <h2>6. How refunds are paid</h2>
      <p>
        Refunds are issued to the original payment method through our payment provider. Processing
        time depends on your bank or card network after the provider releases the refund.
      </p>

      <h2>7. Disputing an outcome</h2>
      <p>
        If you believe an attendance or refund outcome is wrong, you can raise it from your booking
        within the contest window shown there. A staff reviewer decides disputed cases.
      </p>
    </LegalDocument>
  );
}
