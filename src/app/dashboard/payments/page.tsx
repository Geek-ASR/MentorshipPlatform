import type { Metadata } from "next";
import { Receipt } from "lucide-react";
import Link from "next/link";
import { getDb } from "@/server/platform/db/client";
import { findSessionTitles, listBookingsForStudent } from "@/server/modules/booking";
import { findUsersByIds } from "@/server/modules/auth";
import { listPaymentHistoryForStudent } from "@/server/modules/payments";
import { requireViewer } from "@/server/views/viewer";
import { formatLongDate, formatMoney } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";
import { cn } from "@/ui/cn";

export const metadata: Metadata = { title: "Payments" };

const PAYMENT_STATUS: Record<string, { label: string; className: string }> = {
  captured: { label: "Paid", className: "bg-success/10 text-success" },
  partially_refunded: { label: "Partly refunded", className: "bg-primary-soft text-primary" },
  refunded: { label: "Refunded", className: "bg-ink/5 text-ink-muted" },
  disputed: { label: "Under review", className: "bg-warning/10 text-warning" },
  authorized: { label: "Processing", className: "bg-warning/10 text-warning" },
  created: { label: "Processing", className: "bg-warning/10 text-warning" },
  failed: { label: "Failed", className: "bg-danger/10 text-danger" },
};

/** docs/22 §2 "Payments & receipts": every payment with what it was for and what came back. */
export default async function PaymentsPage() {
  const { user } = await requireViewer("/dashboard/payments");
  const db = await getDb();
  const [history, bookings] = await Promise.all([
    listPaymentHistoryForStudent(db, user.id),
    listBookingsForStudent(db, user.id, {
      statuses: [
        "held",
        "confirmed",
        "expired",
        "cancelled_by_student",
        "cancelled_by_mentor",
        "cancelled_by_admin",
        "cancelled_system",
        "awaiting_outcome",
        "completed",
        "no_show_mentor",
        "no_show_student",
        "disputed",
        "resolved_refunded",
        "payment_orphaned",
      ],
    }),
  ]);
  const bookingById = new Map(bookings.map((b) => [b.id, b]));
  const [titles, mentors] = await Promise.all([
    findSessionTitles(db, [...new Set(bookings.map((b) => b.sessionId))]),
    findUsersByIds(db, [...new Set(bookings.map((b) => b.session.hostUserId))]),
  ]);
  const mentorName = new Map(mentors.map((m) => [m.id, m.displayName]));
  const totalPaid = history.reduce((sum, p) => sum + p.amountMinor, 0);
  const totalRefunded = history.reduce((sum, p) => sum + p.refundedMinor, 0);
  const currency = history[0]?.currency ?? "INR";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Payments"
        description="Every payment you've made, and every refund, in one place. Payments currently run in test mode."
      />
      {history.length === 0 ? (
        <EmptyState
          icon={<Receipt className="size-8" aria-hidden="true" />}
          title="No payments yet"
          description="Free sessions and events never appear here. Paid bookings do, with any refunds."
        />
      ) : (
        <>
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
              <dt className="text-sm text-ink-muted">Paid</dt>
              <dd className="tabular mt-1 text-2xl font-semibold text-ink">
                {formatMoney(totalPaid, currency)}
              </dd>
            </div>
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
              <dt className="text-sm text-ink-muted">Refunded</dt>
              <dd className="tabular mt-1 text-2xl font-semibold text-ink">
                {formatMoney(totalRefunded, currency, { zeroAsFree: false })}
              </dd>
            </div>
          </dl>
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            <table className="w-full text-sm">
              <caption className="sr-only">Payment history</caption>
              <thead className="border-b border-line bg-canvas text-left text-xs font-medium tracking-wide text-ink-muted uppercase">
                <tr>
                  <th scope="col" className="px-4 py-3">
                    For
                  </th>
                  <th scope="col" className="hidden px-4 py-3 sm:table-cell">
                    Date
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    Amount
                  </th>
                  <th scope="col" className="hidden px-4 py-3 md:table-cell">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {history.map((payment) => {
                  const booking = bookingById.get(payment.bookingId);
                  const status = PAYMENT_STATUS[payment.status] ?? {
                    label: payment.status,
                    className: "bg-ink/5 text-ink-muted",
                  };
                  return (
                    <tr key={payment.paymentId}>
                      <td className="px-4 py-3">
                        <Link
                          href={`/dashboard/bookings/${payment.bookingId}`}
                          className="font-medium text-ink hover:text-primary"
                        >
                          {booking
                            ? (titles.get(booking.sessionId)?.title ?? "Session")
                            : "Session"}
                        </Link>
                        {booking ? (
                          <p className="text-xs text-ink-muted">
                            with {mentorName.get(booking.session.hostUserId) ?? "a mentor"}
                          </p>
                        ) : null}
                      </td>
                      <td className="hidden px-4 py-3 text-ink-muted sm:table-cell">
                        {formatLongDate(payment.paidAt, user.timezone)}
                      </td>
                      <td className="tabular px-4 py-3 text-right">
                        <span className="font-medium text-ink">
                          {formatMoney(payment.amountMinor, payment.currency)}
                        </span>
                        {payment.refundedMinor > 0 ? (
                          <p className="text-xs text-success">
                            −{formatMoney(payment.refundedMinor, payment.currency)} refunded
                          </p>
                        ) : null}
                      </td>
                      <td className="hidden px-4 py-3 md:table-cell">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            status.className,
                          )}
                        >
                          {status.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
