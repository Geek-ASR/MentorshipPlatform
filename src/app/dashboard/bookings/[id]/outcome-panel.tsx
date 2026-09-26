"use client";

import { CircleHelp, MessageSquareQuote, Scale, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/ui/alert";
import { api, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Dialog } from "@/ui/dialog";
import { formatDate, formatTime, zoneLabel } from "@/ui/format";
import { Field, Textarea } from "@/ui/input";
import { useToast } from "@/ui/toast";
import { DISPUTE_STATUS_LABELS } from "@/ui/trust-labels";

type ClaimOutcome = "held" | "mentor_absent" | "student_absent" | "technical_issue";

export type OutcomePanelProps = {
  bookingId: string;
  role: "student" | "mentor";
  status: string;
  otherFirstName: string;
  timeZone: string;
  claim: { opensAt: string; absenceOpensAt: string } | null;
  myClaim: { outcome: ClaimOutcome; note: string | null } | null;
  review: { rating: number; body: string; status: string } | null;
  reviewClosesAt: string | null;
  dispute: {
    id: string;
    status: string;
    openedByMe: boolean;
    evidenceDeadlineAt: string | null;
    resolution: string | null;
    refundPct: number | null;
    myEvidence: { content: string | null; createdAt: string }[];
  } | null;
  disputeClosesAt: string | null;
};

function when(iso: string, timeZone: string): string {
  const date = new Date(iso);
  return `${formatDate(date, timeZone)}, ${formatTime(date, timeZone)} ${zoneLabel(date, timeZone)}`;
}

function Section({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface p-6">
      <h2 className="flex items-center gap-2 font-semibold text-ink">
        {icon}
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** "How did it go?" (docs/09 §11): either side's account of the session. */
function ClaimSection(
  props: OutcomePanelProps & { claim: NonNullable<OutcomePanelProps["claim"]> },
) {
  const router = useRouter();
  const toast = useToast();
  const noteId = useId();
  const [now] = useState(() => Date.now());
  const [editing, setEditing] = useState(props.myClaim === null);
  const [choice, setChoice] = useState<ClaimOutcome | "">(props.myClaim?.outcome ?? "");
  const [note, setNote] = useState(props.myClaim?.note ?? "");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const absenceOpen = now >= new Date(props.claim.absenceOpensAt).getTime();
  const absent: ClaimOutcome = props.role === "student" ? "mentor_absent" : "student_absent";

  const options: { value: ClaimOutcome; label: string; hint?: string; disabled?: boolean }[] = [
    { value: "held", label: "The session went ahead" },
    {
      value: absent,
      label: `${props.otherFirstName} didn't show up`,
      hint: absenceOpen
        ? props.role === "student"
          ? "If your mentor missed it, you get a full refund automatically."
          : undefined
        : `You can choose this from ${formatTime(new Date(props.claim.absenceOpensAt), props.timeZone)}, after a short grace period.`,
      disabled: !absenceOpen,
    },
    {
      value: "technical_issue",
      label: "We couldn't connect because of a technical problem",
      hint: "Our team looks at these individually — nobody is marked as absent.",
    },
  ];
  const labelFor = (value: ClaimOutcome) =>
    options.find((o) => o.value === value)?.label ?? "Something else";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!choice) {
      setError("Choose what happened.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api(`/api/v1/bookings/${props.bookingId}/attendance-claims`, {
        method: "POST",
        body: { outcome: choice, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      toast({ title: "Thanks — we've noted it" });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Section
      icon={<CircleHelp className="size-4 text-ink-muted" aria-hidden="true" />}
      title="How did it go?"
    >
      {!editing && props.myClaim ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="text-sm">
            <p className="text-ink">
              You told us: <span className="font-medium">{labelFor(props.myClaim.outcome)}</span>
            </p>
            {props.myClaim.note ? (
              <p className="mt-1 whitespace-pre-line text-ink-muted">{props.myClaim.note}</p>
            ) : null}
          </div>
          <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
            Change answer
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <p className="text-sm text-ink-muted">
            Your answer, with the join and check-in times we record, settles the session. If you and{" "}
            {props.otherFirstName} disagree, our team takes a look.
          </p>
          {error ? (
            <Alert tone="danger" live>
              {error}
            </Alert>
          ) : null}
          <fieldset className="space-y-2">
            <legend className="sr-only">What happened?</legend>
            {options.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-[var(--radius-control)] border border-line p-3 text-sm has-checked:border-primary has-checked:bg-primary-soft/50",
                  option.disabled && "cursor-not-allowed opacity-60",
                )}
              >
                <input
                  type="radio"
                  name="claim-outcome"
                  value={option.value}
                  checked={choice === option.value}
                  disabled={option.disabled}
                  onChange={() => setChoice(option.value)}
                  className="mt-0.5 size-4 accent-[var(--color-primary)]"
                />
                <span>
                  <span className="font-medium text-ink">{option.label}</span>
                  {option.hint ? (
                    <span className="mt-0.5 block text-ink-muted">{option.hint}</span>
                  ) : null}
                </span>
              </label>
            ))}
          </fieldset>
          <Field label="Anything to add?" htmlFor={noteId} optional>
            <Textarea
              id={noteId}
              rows={2}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" loading={sending}>
              Send
            </Button>
            {props.myClaim ? (
              <Button variant="ghost" onClick={() => setEditing(false)} disabled={sending}>
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      )}
    </Section>
  );
}

const RATING_WORDS = ["", "Poor", "Below expectations", "Good", "Very good", "Excellent"];

/** A verified review (docs/10 §10): only after a completed session, within 14 days. */
function ReviewSection(props: OutcomePanelProps) {
  const router = useRouter();
  const toast = useToast();
  const bodyId = useId();
  const [rating, setRating] = useState(0);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (props.review) {
    const statusLine =
      props.review.status === "published"
        ? "Published on your mentor's profile."
        : props.review.status === "removed"
          ? "Removed for breaking our review guidelines."
          : "Our team is checking it before it's published.";
    return (
      <Section
        icon={<MessageSquareQuote className="size-4 text-ink-muted" aria-hidden="true" />}
        title="Your review"
      >
        <p className="flex items-center gap-0.5" aria-label={`${props.review.rating} out of 5`}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={cn(
                "size-4",
                n <= props.review!.rating ? "fill-accent text-accent" : "text-line",
              )}
              aria-hidden="true"
            />
          ))}
        </p>
        <p className="mt-2 text-sm whitespace-pre-line text-ink/90">{props.review.body}</p>
        <p className="mt-3 text-xs text-ink-muted">{statusLine}</p>
      </Section>
    );
  }
  if (!props.reviewClosesAt) return null;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (rating === 0 || !body.trim()) {
      setError("Choose a rating and write a few words about the session.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const result = await api<{ status: string }>(`/api/v1/bookings/${props.bookingId}/review`, {
        method: "POST",
        body: { rating, body: body.trim() },
      });
      toast(
        result.status === "published"
          ? { title: "Review published", description: "Thank you — it helps other students." }
          : {
              title: "Review received",
              description: "Our team checks it before it appears on the profile.",
            },
      );
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setSending(false);
    }
  }

  return (
    <Section
      icon={<MessageSquareQuote className="size-4 text-ink-muted" aria-hidden="true" />}
      title={`Review your session with ${props.otherFirstName}`}
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <p className="text-sm text-ink-muted">
          Reviews are only from students who had a session, and show your first name. You can write
          one until {formatDate(new Date(props.reviewClosesAt), props.timeZone)}.
        </p>
        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : null}
        <fieldset>
          <legend className="text-sm font-medium text-ink">Rating</legend>
          <div className="mt-2 flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <label
                key={n}
                className="cursor-pointer rounded-md p-1 has-focus-visible:ring-2 has-focus-visible:ring-primary"
              >
                <input
                  type="radio"
                  name="rating"
                  value={n}
                  checked={rating === n}
                  onChange={() => setRating(n)}
                  className="sr-only"
                />
                <Star
                  className={cn(
                    "size-7 transition-colors",
                    n <= rating ? "fill-accent text-accent" : "text-ink/25 hover:text-accent/60",
                  )}
                  aria-hidden="true"
                />
                <span className="sr-only">
                  {n} {n === 1 ? "star" : "stars"} — {RATING_WORDS[n]}
                </span>
              </label>
            ))}
            <span className="ml-2 text-sm text-ink-muted" aria-hidden="true">
              {RATING_WORDS[rating]}
            </span>
          </div>
        </fieldset>
        <Field
          label="What was it like?"
          htmlFor={bodyId}
          hint="What you worked on and what helped. Please don't include contact details."
        >
          <Textarea
            id={bodyId}
            rows={4}
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <Button type="submit" loading={sending}>
          Post review
        </Button>
      </form>
    </Section>
  );
}

function resolutionSentence(resolution: string, refundPct: number | null, role: string): string {
  if (resolution === "full_refund")
    return role === "student" ? "You get a full refund." : "The student was refunded in full.";
  if (resolution === "partial_refund")
    return role === "student"
      ? `You get ${refundPct ?? 0}% back.`
      : `The student was refunded ${refundPct ?? 0}%; the rest is paid to you.`;
  return role === "student" ? "No refund — the session stands." : "You're paid for the session.";
}

/** Disputes (docs/10 §8): opened within 72 hours of the end; each side adds its account. */
function DisputeSection(props: OutcomePanelProps) {
  const router = useRouter();
  const toast = useToast();
  const evidenceId = useId();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openDispute() {
    setOpening(true);
    try {
      await api(`/api/v1/bookings/${props.bookingId}/disputes`, { method: "POST" });
      setConfirmOpen(false);
      toast({ title: "Dispute opened", description: "Now tell us what happened." });
      router.refresh();
    } catch (err) {
      toast({ title: "Couldn't open a dispute", description: errorMessage(err), tone: "error" });
    } finally {
      setOpening(false);
    }
  }

  async function sendEvidence(event: FormEvent) {
    event.preventDefault();
    if (!props.dispute || !evidence.trim()) return;
    setSending(true);
    setError(null);
    try {
      await api(`/api/v1/disputes/${props.dispute.id}/evidence`, {
        method: "POST",
        body: { kind: "note", content: evidence.trim() },
      });
      setEvidence("");
      toast({ title: "Added to the dispute" });
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  const provisional =
    (props.status === "no_show_mentor" && props.role === "mentor") ||
    (props.status === "no_show_student" && props.role === "student");

  if (props.dispute) {
    const label = DISPUTE_STATUS_LABELS[props.dispute.status] ?? DISPUTE_STATUS_LABELS.open!;
    return (
      <Section
        icon={<Scale className="size-4 text-ink-muted" aria-hidden="true" />}
        title="Dispute"
      >
        <div className="space-y-4 text-sm">
          <div>
            <p className="font-medium text-ink">{label.title}</p>
            <p className="mt-1 text-ink-muted">{label.body}</p>
            {props.dispute.resolution ? (
              <p className="mt-2 font-medium text-ink">
                {resolutionSentence(props.dispute.resolution, props.dispute.refundPct, props.role)}
              </p>
            ) : null}
          </div>
          {props.dispute.myEvidence.length > 0 ? (
            <div>
              <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                What you sent
              </p>
              <ul className="mt-2 space-y-2">
                {props.dispute.myEvidence.map((item) => (
                  <li
                    key={item.createdAt}
                    className="rounded-[var(--radius-control)] bg-canvas px-3 py-2 whitespace-pre-line text-ink/90"
                  >
                    {item.content}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {props.dispute.status === "awaiting_evidence" ? (
            <form onSubmit={sendEvidence} className="space-y-3">
              {error ? (
                <Alert tone="danger" live>
                  {error}
                </Alert>
              ) : null}
              <Field
                label="Your account of what happened"
                htmlFor={evidenceId}
                hint={
                  props.dispute.evidenceDeadlineAt
                    ? `Send it by ${when(props.dispute.evidenceDeadlineAt, props.timeZone)}. Only our team sees it.`
                    : "Only our team sees it."
                }
              >
                <Textarea
                  id={evidenceId}
                  rows={4}
                  maxLength={4000}
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                />
              </Field>
              <Button type="submit" size="sm" loading={sending} disabled={!evidence.trim()}>
                Send to our team
              </Button>
            </form>
          ) : null}
        </div>
      </Section>
    );
  }

  if (!props.disputeClosesAt) return null;
  return (
    <section className="rounded-[var(--radius-card)] border border-dashed border-line p-5 text-sm">
      <p className="font-medium text-ink">
        {provisional
          ? props.role === "mentor"
            ? "We recorded that you didn't join this session"
            : "We recorded that you missed this session"
          : "Something not right?"}
      </p>
      <p className="mt-1 text-ink-muted">
        {provisional
          ? "If that's wrong — you were there, or there was a technical problem — open a dispute and our team will look at what happened."
          : "If the session didn't happen the way it should have, our team can look into it."}{" "}
        You can do this until {when(props.disputeClosesAt, props.timeZone)}.
      </p>
      <Button size="sm" variant="secondary" className="mt-3" onClick={() => setConfirmOpen(true)}>
        Open a dispute
      </Button>
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        dismissible={!opening}
        size="sm"
        title="Open a dispute?"
        description={`Our team will ask you and ${props.otherFirstName} for your accounts, then decide — including any refund. Any payout for this session is held until then.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={opening}>
              Not now
            </Button>
            <Button loading={opening} onClick={() => void openDispute()}>
              Open dispute
            </Button>
          </>
        }
      />
    </section>
  );
}

/** Everything that happens after a session starts: attendance, the review, and disputes. */
export function OutcomePanel(props: OutcomePanelProps) {
  return (
    <div className="space-y-6">
      {props.claim ? <ClaimSection {...props} claim={props.claim} /> : null}
      <ReviewSection {...props} />
      <DisputeSection {...props} />
    </div>
  );
}
