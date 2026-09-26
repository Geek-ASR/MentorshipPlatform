import type { Metadata } from "next";
import { CheckCircle2, ShieldAlert, UserX } from "lucide-react";
import { getDb } from "@/server/platform/db/client";
import { loadSafety } from "@/server/views/safety";
import { requireViewer } from "@/server/views/viewer";
import { Avatar } from "@/ui/avatar";
import { formatDate, formatLongDate } from "@/ui/format";
import {
  ACTION_LABELS,
  APPEAL_STATUS_LABELS,
  CAPABILITY_LABELS,
  reasonExplanation,
} from "@/ui/trust-labels";
import { SettingsSection } from "../section";
import { AppealButton, UnblockButton } from "./safety-controls";

export const metadata: Metadata = { title: "Safety settings" };

export default async function SafetySettingsPage() {
  const { user } = await requireViewer("/dashboard/settings/safety");
  const now = new Date();
  const view = await loadSafety(await getDb(), user.id, now);
  const tz = user.timezone;

  return (
    <div className="space-y-10">
      <SettingsSection
        id="standing"
        title="Account standing"
        description="Any decision our team has made about your account, why, and how to appeal it."
      >
        {view.restrictions.length === 0 && view.notices.length === 0 ? (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
            <div>
              <p className="font-medium text-ink">Your account is in good standing</p>
              <p className="mt-1 text-sm text-ink-muted">
                There are no notices or limits on your account.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {view.restrictions.length > 0 ? (
              <div className="rounded-[var(--radius-control)] border border-warning/35 bg-warning/8 p-4">
                <p className="flex items-center gap-2 font-medium text-ink">
                  <ShieldAlert className="size-4 text-warning" aria-hidden="true" /> Paused on your
                  account right now
                </p>
                <ul className="mt-2 space-y-1 text-sm text-ink/90">
                  {view.restrictions.map((r) => (
                    <li key={r.capability}>
                      {CAPABILITY_LABELS[r.capability] ?? r.capability}
                      <span className="text-ink-muted">
                        {r.until
                          ? ` — until ${formatDate(r.until, tz, now)}`
                          : " — until our team lifts it"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <ul className="divide-y divide-line">
              {view.notices.map((notice) => {
                const label = ACTION_LABELS[notice.action] ?? {
                  title: "Account notice",
                  effect: "",
                };
                return (
                  <li key={notice.id} className="py-5 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-semibold text-ink">{label.title}</p>
                      <p className="text-xs text-ink-muted">
                        {formatLongDate(notice.createdAt, tz)}
                      </p>
                    </div>
                    <p className="mt-1 text-sm text-ink/90">
                      <span className="font-medium">Reason:</span>{" "}
                      {reasonExplanation(notice.reasonCode)}
                    </p>
                    {label.effect ? (
                      <p className="mt-1 text-sm text-ink-muted">{label.effect}</p>
                    ) : null}
                    {notice.restrictions.length > 0 ? (
                      <p className="mt-1 text-sm text-ink-muted">
                        Affects:{" "}
                        {notice.restrictions.map((c) => CAPABILITY_LABELS[c] ?? c).join(", ")}
                      </p>
                    ) : null}
                    {notice.action !== "warn" && notice.action !== "reinstate" ? (
                      <p className="mt-1 text-sm text-ink-muted">
                        {notice.endsAt
                          ? `Lasts until ${formatLongDate(notice.endsAt, tz)}.`
                          : notice.action === "ban"
                            ? "Permanent."
                            : "Until our team lifts it."}
                      </p>
                    ) : null}
                    <div className="mt-3">
                      {notice.appeal ? (
                        <p className="text-sm font-medium text-ink">
                          {APPEAL_STATUS_LABELS[notice.appeal.status] ?? "Appeal received"}
                          <span className="font-normal text-ink-muted">
                            {" "}
                            · sent {formatLongDate(notice.appeal.createdAt, tz)}
                          </span>
                        </p>
                      ) : notice.appealableUntil ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <AppealButton actionId={notice.id} title={label.title} />
                          <span className="text-xs text-ink-muted">
                            You can appeal until {formatLongDate(notice.appealableUntil, tz)}.
                          </span>
                        </div>
                      ) : notice.action !== "reinstate" ? (
                        <p className="text-xs text-ink-muted">
                          The 30-day appeal window has closed.
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </SettingsSection>

      <SettingsSection
        id="blocked"
        title="Blocked people"
        description="People you've blocked can't book you, and you can't book them. They aren't told."
      >
        {view.blocked.length === 0 ? (
          <div className="flex items-start gap-3">
            <UserX className="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden="true" />
            <p className="text-sm text-ink-muted">
              You haven&apos;t blocked anyone. You can block someone from their profile or a
              booking, using the ⋯ menu.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {view.blocked.map((person) => (
              <li key={person.userId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <Avatar name={person.name} seed={person.userId} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{person.name}</p>
                  <p className="text-xs text-ink-muted">
                    Blocked {formatLongDate(person.blockedAt, tz)}
                  </p>
                </div>
                <UnblockButton userId={person.userId} name={person.name} />
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>
    </div>
  );
}
