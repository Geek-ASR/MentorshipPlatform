import type { Metadata } from "next";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Circle,
  ExternalLink,
  HandCoins,
  HeartHandshake,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { getDb } from "@/server/platform/db/client";
import { loadMentorWorkspace } from "@/server/views/mentor-workspace";
import { loadHostedSessions } from "@/server/views/sessions";
import { requireViewer } from "@/server/views/viewer";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { PageHeader, SectionHeader } from "@/ui/page-header";
import { SessionList } from "../_components/session-cards";
import { VerifyEmailBanner } from "../_components/verify-email-banner";
import { StartApplicationButton } from "./start-application";

export const metadata: Metadata = { title: "Mentoring" };

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  draft: { label: "Application in progress", className: "bg-accent-soft text-ink" },
  submitted: { label: "Under review", className: "bg-primary-soft text-primary" },
  approved: { label: "Approved", className: "bg-success/10 text-success" },
  rejected: { label: "Not approved", className: "bg-danger/10 text-danger" },
  paused: { label: "Paused", className: "bg-ink/5 text-ink-muted" },
};

const BENEFITS = [
  {
    icon: HandCoins,
    title: "Your price, your hours",
    text: "Offer the sessions you want, at lengths and prices you choose, only in the hours you open.",
  },
  {
    icon: BadgeCheck,
    title: "Credibility that's specific",
    text: "Confirm your university or work email and your profile shows exactly what was checked, and when.",
  },
  {
    icon: HeartHandshake,
    title: "Paid or volunteer",
    text: "Where your visa doesn't allow paid work, you can still mentor for free or host free events.",
  },
];

export default async function MentorHomePage() {
  const { user } = await requireViewer("/dashboard/mentor");
  const db = await getDb();
  const workspace = await loadMentorWorkspace(db, user.id);

  if (!workspace) {
    return (
      <div className="space-y-10">
        <PageHeader
          eyebrow="Mentoring"
          title="Help the students one step behind you"
          description="Share what you learned getting into your university, your job, or your new city. We review every mentor before they're listed."
        />
        {!user.emailVerified ? <VerifyEmailBanner email={user.email} /> : null}
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {BENEFITS.map((benefit) => (
            <li
              key={benefit.title}
              className="rounded-[var(--radius-card)] border border-line bg-surface p-5"
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                <benefit.icon className="size-5" aria-hidden="true" />
              </span>
              <p className="mt-4 font-semibold text-ink">{benefit.title}</p>
              <p className="mt-1 text-sm text-ink-muted">{benefit.text}</p>
            </li>
          ))}
        </ul>
        <section className="rounded-[var(--radius-sheet)] border border-line bg-surface p-6 sm:p-8">
          <h2 className="text-lg font-semibold text-ink">How it works</h2>
          <ol className="mt-5 grid grid-cols-1 gap-6 sm:grid-cols-4">
            {[
              [
                "Apply",
                "Tell us about your studies, work and what you can help with. It saves as you go.",
              ],
              ["Verify", "Confirm a university or work email — a one-click link."],
              ["Set up", "Add your sessions, prices, meeting link and weekly hours."],
              ["Get listed", "Once approved and verified, students can find and book you."],
            ].map(([title, text], index) => (
              <li key={title}>
                <span className="tabular flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-on-primary">
                  {index + 1}
                </span>
                <p className="mt-3 font-medium text-ink">{title}</p>
                <p className="mt-1 text-sm text-ink-muted">{text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <StartApplicationButton disabled={!user.emailVerified} />
            <Link
              href="/legal/community-guidelines"
              className="text-sm font-medium text-primary hover:underline"
            >
              Read the mentor guidelines
            </Link>
          </div>
        </section>
      </div>
    );
  }

  const { profile, steps } = workspace;
  const applicable = steps.filter((s) => s.applicable);
  const doneCount = applicable.filter((s) => s.done).length;
  const status = STATUS_LABEL[profile.applicationStatus] ?? STATUS_LABEL.draft!;
  const next = applicable.find((s) => !s.done);
  const hosted =
    profile.applicationStatus === "approved"
      ? await loadHostedSessions(db, user.id, new Date())
      : null;

  return (
    <div className="space-y-10">
      <PageHeader
        eyebrow="Mentoring"
        title={profile.isListed ? "You're listed" : "Get ready to mentor"}
        description={
          profile.isListed
            ? "Students can find and book you. Keep your hours and sessions up to date."
            : `${doneCount} of ${applicable.length} steps done. ${next ? `Next: ${next.title.toLowerCase()}.` : ""}`
        }
        actions={
          profile.isListed ? (
            <Button asChild variant="secondary">
              <Link href={`/mentors/${profile.slug}`}>
                View public profile <ExternalLink aria-hidden="true" />
              </Link>
            </Button>
          ) : next ? (
            <Button asChild>
              <Link href={next.href}>
                {next.title} <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <span className={cn("rounded-full px-3 py-1 text-sm font-medium", status.className)}>
          {status.label}
        </span>
        <span className="text-sm text-ink-muted">
          {profile.payoutMode === "paid"
            ? "Paid mentor — students pay what you set."
            : "Volunteer mentor — your sessions are free for students."}
        </span>
      </div>

      {profile.applicationStatus === "rejected" ? (
        <Alert tone="warning" title="Your application wasn't approved">
          Thanks for applying. You can update your profile and contact support if you&apos;d like us
          to take another look.
        </Alert>
      ) : null}

      <section aria-labelledby="checklist-heading">
        <SectionHeader id="checklist-heading" title="Setup checklist" />
        <ol className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface">
          {applicable.map((step) => (
            <li key={step.id}>
              <Link
                href={step.href}
                className="group flex items-center gap-4 px-5 py-4 hover:bg-canvas"
              >
                {step.done ? (
                  <CheckCircle2 className="size-6 shrink-0 text-success" aria-label="Done" />
                ) : (
                  <Circle className="size-6 shrink-0 text-line" aria-label="To do" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn("font-medium", step.done ? "text-ink-muted" : "text-ink")}>
                    {step.title}
                  </p>
                  <p className="text-sm text-ink-muted">{step.description}</p>
                </div>
                <ArrowRight
                  className="size-4 shrink-0 text-ink-muted group-hover:text-primary"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ol>
      </section>

      {hosted ? (
        <section aria-labelledby="hosting-heading">
          <SectionHeader
            id="hosting-heading"
            title="Your upcoming sessions"
            action={
              <Link
                href="/dashboard/bookings"
                className="text-sm font-medium text-primary hover:underline"
              >
                All bookings
              </Link>
            }
          />
          {hosted.upcoming.length > 0 ? (
            <div className="rounded-[var(--radius-card)] border border-line bg-surface px-5">
              <SessionList
                sessions={hosted.upcoming.slice(0, 5)}
                timeZone={user.timezone}
                now={new Date()}
                role="mentor"
              />
            </div>
          ) : (
            <p className="rounded-[var(--radius-card)] border border-dashed border-line p-5 text-sm text-ink-muted">
              No sessions booked yet. Students book inside the weekly hours you open.
            </p>
          )}
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {[
          {
            href: "/dashboard/mentor/services",
            icon: HandCoins,
            title: "Sessions & prices",
            text: "What you offer and your meeting link.",
          },
          {
            href: "/dashboard/mentor/availability",
            icon: CalendarClock,
            title: "Availability",
            text: "Weekly hours, notice and time off.",
          },
          {
            href: "/dashboard/mentor/verification",
            icon: ShieldCheck,
            title: "Verification",
            text: "Your confirmed affiliations.",
          },
        ].map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-[var(--radius-card)] border border-line bg-surface p-5 transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-[var(--shadow-lift)]"
          >
            <card.icon className="size-5 text-primary" aria-hidden="true" />
            <p className="mt-3 font-semibold text-ink group-hover:text-primary">{card.title}</p>
            <p className="mt-1 text-sm text-ink-muted">{card.text}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
