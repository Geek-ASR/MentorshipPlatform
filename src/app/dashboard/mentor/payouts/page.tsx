import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Banknote, CheckCircle2, FlaskConical, HeartHandshake } from "lucide-react";
import { getDb } from "@/server/platform/db/client";
import { findMentorProfile } from "@/server/modules/profiles";
import { findPayoutAccount, listTransfersForMentor } from "@/server/modules/payments";
import { requireViewer } from "@/server/views/viewer";
import { Alert } from "@/ui/alert";
import { cn } from "@/ui/cn";
import { formatLongDate, formatMoney } from "@/ui/format";
import { PageHeader } from "@/ui/page-header";
import { EmptyState } from "@/ui/states";
import { SetUpPayoutsButton } from "./setup-payouts";

export const metadata: Metadata = { title: "Payouts" };

const TRANSFER_STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "Waiting for the session", className: "bg-warning/10 text-warning" },
  on_hold: { label: "On hold", className: "bg-warning/10 text-warning" },
  released: { label: "Released", className: "bg-success/10 text-success" },
  settled: { label: "Paid out", className: "bg-success/10 text-success" },
  cancelled: { label: "Cancelled", className: "bg-ink/5 text-ink-muted" },
  reversed: { label: "Reversed", className: "bg-danger/10 text-danger" },
  partially_reversed: { label: "Partly reversed", className: "bg-danger/10 text-danger" },
  failed: { label: "Failed", className: "bg-danger/10 text-danger" },
};

/** docs/08 §3: earnings reach mentors as transfers to their own linked account at the payment
 * partner, released after the session — this page shows that trail, not a platform balance. */
export default async function PayoutsPage() {
  const { user } = await requireViewer("/dashboard/mentor/payouts");
  const db = await getDb();
  const profile = await findMentorProfile(db, user.id);
  if (!profile) redirect("/dashboard/mentor");
  const [account, transfers] = await Promise.all([
    findPayoutAccount(db, user.id),
    listTransfersForMentor(db, user.id),
  ]);
  const released = transfers
    .filter((t) => t.status === "released" || t.status === "settled")
    .reduce((sum, t) => sum + t.amountMinor, 0);
  const upcoming = transfers
    .filter((t) => t.status === "pending" || t.status === "on_hold")
    .reduce((sum, t) => sum + t.amountMinor, 0);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Mentoring"
        title="Payouts"
        description="Your share of each paid session goes to your own account at our payment partner, after the session."
      />

      {profile.payoutMode !== "paid" ? (
        <Alert tone="info" title="You're a volunteer mentor">
          <span className="inline-flex items-start gap-2">
            <HeartHandshake className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Your sessions are free for students, so there&apos;s nothing to pay out. If your
            situation changes, update the eligibility step of your application.
          </span>
        </Alert>
      ) : (
        <>
          <section className="rounded-[var(--radius-sheet)] border border-line bg-surface p-6">
            {account?.status === "active" ? (
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-ink">Payouts are set up</p>
                  <p className="text-sm text-ink-muted">
                    {account.providerAccountId
                      ? `Linked account ending ${account.providerAccountId.slice(-6)} · `
                      : ""}
                    set up {formatLongDate(account.createdAt, user.timezone)}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Banknote className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <p className="font-semibold text-ink">Set up payouts to take paid bookings</p>
                    <p className="text-sm text-ink-muted">
                      Until then, students can&apos;t book your paid session types.
                    </p>
                  </div>
                </div>
                <SetUpPayoutsButton />
              </div>
            )}
            <p className="mt-4 flex items-start gap-2 border-t border-line pt-4 text-xs text-ink-muted">
              <FlaskConical className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Test mode: this creates a simulated account. With live payments, setup includes the
              payment partner&apos;s identity and bank checks (KYC).
            </p>
          </section>

          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
              <dt className="text-sm text-ink-muted">Released to you</dt>
              <dd className="tabular mt-1 text-2xl font-semibold text-ink">
                {formatMoney(released, "INR", { zeroAsFree: false })}
              </dd>
            </div>
            <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
              <dt className="text-sm text-ink-muted">Coming after upcoming sessions</dt>
              <dd className="tabular mt-1 text-2xl font-semibold text-ink">
                {formatMoney(upcoming, "INR", { zeroAsFree: false })}
              </dd>
            </div>
          </dl>

          {transfers.length === 0 ? (
            <EmptyState
              icon={<Banknote className="size-8" aria-hidden="true" />}
              title="No earnings yet"
              description="Each paid session shows up here, with when its payout is released."
            />
          ) : (
            <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              <table className="w-full text-sm">
                <caption className="sr-only">Payouts</caption>
                <thead className="border-b border-line bg-canvas text-left text-xs font-medium tracking-wide text-ink-muted uppercase">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      Created
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Release
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Amount
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {transfers.map((transfer) => {
                    const status = TRANSFER_STATUS[transfer.status] ?? {
                      label: transfer.status,
                      className: "bg-ink/5 text-ink-muted",
                    };
                    return (
                      <tr key={transfer.id}>
                        <td className="px-4 py-3 text-ink">
                          {formatLongDate(transfer.createdAt, user.timezone)}
                        </td>
                        <td className="px-4 py-3 text-ink-muted">
                          {transfer.holdUntil
                            ? formatLongDate(transfer.holdUntil, user.timezone)
                            : "—"}
                        </td>
                        <td className="tabular px-4 py-3 text-right font-medium text-ink">
                          {formatMoney(transfer.amountMinor, transfer.currency)}
                        </td>
                        <td className="px-4 py-3">
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
          )}
        </>
      )}
    </div>
  );
}
