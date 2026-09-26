"use client";

import {
  AlertTriangle,
  CalendarHeart,
  ExternalLink,
  PlayCircle,
  Plus,
  UsersRound,
  Video,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/ui/alert";
import { api, ApiError, errorMessage } from "@/ui/api";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Dialog } from "@/ui/dialog";
import { formatDate, formatDuration, formatMoney, formatTimeRange, zoneLabel } from "@/ui/format";
import { Field, Input, Select, Textarea } from "@/ui/input";
import { EmptyState } from "@/ui/states";
import { useToast } from "@/ui/toast";
import { todayIn, zonedInstant } from "@/ui/zoned-time";

export type HostedItemView = {
  sessionId: string;
  kind: "group" | "event";
  title: string;
  start: string;
  end: string;
  status: string;
  capacity: number;
  liveSeats: number;
  minParticipants: number;
  seatPriceMinor: number;
  currency: string;
  eventSlug: string | null;
  visibility: string | null;
  recordingUrl: string | null;
  hasMeetingLink: boolean;
};

type Limits = {
  capacityMax: number;
  minSeatPriceMinor: number;
  minParticipantsDefault: number;
  registrationCloseBeforeMin: number;
};

const LENGTHS = [30, 45, 60, 90, 120];
const VISIBILITY: Record<string, { label: string; hint: string }> = {
  public: { label: "Public", hint: "Listed on the events page and your profile." },
  unlisted: { label: "Unlisted", hint: "Anyone with the link can register; not listed anywhere." },
  private: { label: "Private", hint: "Only people you send an invite link to can register." },
};

function useFieldErrors() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  function fromError(err: unknown) {
    if (err instanceof ApiError && err.errors.length > 0) {
      const byField = err.fieldErrors();
      setErrors(byField);
      setFormError(byField.start ?? byField.end ?? null);
    } else {
      setErrors({});
      setFormError(errorMessage(err));
    }
  }
  function clear() {
    setErrors({});
    setFormError(null);
  }
  return { errors, formError, fromError, clear };
}

/** Title, description, date, start time and length — shared by both create forms. */
function WhenFields({
  timeZone,
  value,
  onChange,
  errors,
}: {
  timeZone: string;
  value: { title: string; description: string; date: string; time: string; length: number };
  onChange: (patch: Partial<typeof value>) => void;
  errors: Record<string, string>;
}) {
  const id = useId();
  return (
    <>
      <Field label="Title" htmlFor={`${id}-title`} error={errors.title}>
        <Input
          id={`${id}-title`}
          maxLength={160}
          value={value.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </Field>
      <Field
        label="What it covers"
        htmlFor={`${id}-description`}
        optional
        hint="Who it's for, what you'll go through, and what to bring."
      >
        <Textarea
          id={`${id}-description`}
          rows={4}
          maxLength={5000}
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Date" htmlFor={`${id}-date`}>
          <Input
            id={`${id}-date`}
            type="date"
            min={todayIn(timeZone)}
            value={value.date}
            onChange={(e) => onChange({ date: e.target.value })}
          />
        </Field>
        <Field label={`Starts (${zoneLabel(new Date(), timeZone)})`} htmlFor={`${id}-time`}>
          <Input
            id={`${id}-time`}
            type="time"
            step={300}
            value={value.time}
            onChange={(e) => onChange({ time: e.target.value })}
          />
        </Field>
        <Field label="Length" htmlFor={`${id}-length`}>
          <Select
            id={`${id}-length`}
            value={value.length}
            onChange={(e) => onChange({ length: Number(e.target.value) })}
          >
            {LENGTHS.map((m) => (
              <option key={m} value={m}>
                {formatDuration(m)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </>
  );
}

function MeetingField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  const id = useId();
  return (
    <Field
      label="Meeting link"
      htmlFor={id}
      error={error}
      hint="Google Meet, Zoom, Teams, Whereby or Jitsi. People who registered see it only through the Join button, shortly before the start."
    >
      <Input
        id={id}
        type="url"
        placeholder="https://meet.google.com/…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

function blankWhen(timeZone: string) {
  return { title: "", description: "", date: todayIn(timeZone, 7), time: "18:00", length: 60 };
}

function toRange(when: { date: string; time: string; length: number }, timeZone: string) {
  const start = zonedInstant(when.date, when.time, timeZone);
  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + when.length * 60_000).toISOString(),
  };
}

function CreateEventDialog({
  open,
  onClose,
  timeZone,
}: {
  open: boolean;
  onClose: () => void;
  timeZone: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const formId = useId();
  const [when, setWhen] = useState(() => blankWhen(timeZone));
  const [capacity, setCapacity] = useState("50");
  const [visibility, setVisibility] = useState("public");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const { errors, formError, fromError, clear } = useFieldErrors();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    clear();
    if (!meetingUrl.trim()) {
      fromError(
        new ApiError(422, {
          errors: [{ path: "meetingUrl", message: "Add the link people will join with." }],
        }),
      );
      return;
    }
    setSaving(true);
    try {
      await api("/api/v1/me/events", {
        method: "POST",
        body: {
          title: when.title.trim(),
          ...(when.description.trim() ? { descriptionMd: when.description.trim() } : {}),
          ...toRange(when, timeZone),
          capacity: Number(capacity),
          visibility,
          meetingUrl: meetingUrl.trim(),
        },
      });
      toast({ title: "Event created", description: "It's live and taking registrations." });
      setWhen(blankWhen(timeZone));
      setMeetingUrl("");
      onClose();
      router.refresh();
    } catch (err) {
      fromError(err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!saving}
      size="lg"
      title="Host a free event"
      description="Free for everyone who registers. It goes live as soon as you create it."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            Create event
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError ? (
          <Alert tone="danger" live>
            {formError}
          </Alert>
        ) : null}
        <WhenFields
          timeZone={timeZone}
          value={when}
          onChange={(patch) => setWhen((w) => ({ ...w, ...patch }))}
          errors={errors}
        />
        <Field label="Spots" htmlFor={`${formId}-capacity`} error={errors.capacity}>
          <Input
            id={`${formId}-capacity`}
            type="number"
            min={1}
            max={1000}
            inputMode="numeric"
            className="max-w-32"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-ink">Who can find it</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {Object.entries(VISIBILITY).map(([value, option]) => (
              <label
                key={value}
                className="flex cursor-pointer gap-2.5 rounded-[var(--radius-control)] border border-line p-3 text-sm has-checked:border-primary has-checked:bg-primary-soft/50"
              >
                <input
                  type="radio"
                  name={`${formId}-visibility`}
                  value={value}
                  checked={visibility === value}
                  onChange={() => setVisibility(value)}
                  className="mt-0.5 size-4 accent-[var(--color-primary)]"
                />
                <span>
                  <span className="font-medium text-ink">{option.label}</span>
                  <span className="mt-0.5 block text-xs text-ink-muted">{option.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <MeetingField value={meetingUrl} onChange={setMeetingUrl} error={errors.meetingUrl} />
      </form>
    </Dialog>
  );
}

type Preview = {
  seatPriceMinor: number;
  earningsAtMinParticipantsMinor: number;
  earningsAtCapacityMinor: number;
};

function CreateGroupDialog({
  open,
  onClose,
  timeZone,
  limits,
}: {
  open: boolean;
  onClose: () => void;
  timeZone: string;
  limits: Limits;
}) {
  const router = useRouter();
  const toast = useToast();
  const formId = useId();
  const [when, setWhen] = useState(() => blankWhen(timeZone));
  const [capacity, setCapacity] = useState("6");
  const [minParticipants, setMinParticipants] = useState(String(limits.minParticipantsDefault));
  const [total, setTotal] = useState("3000");
  const [meetingUrl, setMeetingUrl] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [saving, setSaving] = useState(false);
  const { errors, formError, fromError, clear } = useFieldErrors();

  const targetTotalMinor = Math.round(Number(total) * 100);
  const cap = Number(capacity);
  const min = Number(minParticipants);
  const previewable =
    open &&
    Number.isFinite(targetTotalMinor) &&
    targetTotalMinor > 0 &&
    Number.isInteger(cap) &&
    cap >= 2 &&
    cap <= limits.capacityMax &&
    Number.isInteger(min) &&
    min >= 1 &&
    min <= cap;

  useEffect(() => {
    if (!previewable) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api<Preview>("/api/v1/me/mentor/group-sessions/preview-pricing", {
        method: "POST",
        body: { targetTotalMinor, capacity: cap, minParticipants: min, currency: "INR" },
      })
        .then((result) => {
          if (!cancelled) setPreview(result);
        })
        .catch(() => {
          if (!cancelled) setPreview(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [previewable, targetTotalMinor, cap, min]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    clear();
    if (!meetingUrl.trim()) {
      fromError(
        new ApiError(422, {
          errors: [{ path: "meetingUrl", message: "Add the link people will join with." }],
        }),
      );
      return;
    }
    setSaving(true);
    try {
      await api("/api/v1/me/mentor/group-sessions", {
        method: "POST",
        body: {
          title: when.title.trim(),
          ...(when.description.trim() ? { descriptionMd: when.description.trim() } : {}),
          ...toRange(when, timeZone),
          capacity: cap,
          minParticipants: min,
          targetTotalMinor,
          currency: "INR",
          meetingUrl: meetingUrl.trim(),
        },
      });
      toast({
        title: "Group session created",
        description: "It's on your profile and taking bookings.",
      });
      setWhen(blankWhen(timeZone));
      setMeetingUrl("");
      onClose();
      router.refresh();
    } catch (err) {
      fromError(err);
    } finally {
      setSaving(false);
    }
  }

  const tooCheap = preview !== null && preview.seatPriceMinor < limits.minSeatPriceMinor;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!saving}
      size="lg"
      title="New group session"
      description="A paid session for a small group. It's listed on your profile until booking closes."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={saving} disabled={tooCheap}>
            Create group session
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError ? (
          <Alert tone="danger" live>
            {formError}
          </Alert>
        ) : null}
        <WhenFields
          timeZone={timeZone}
          value={when}
          onChange={(patch) => setWhen((w) => ({ ...w, ...patch }))}
          errors={errors}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Seats" htmlFor={`${formId}-capacity`} error={errors.capacity}>
            <Input
              id={`${formId}-capacity`}
              type="number"
              min={2}
              max={limits.capacityMax}
              inputMode="numeric"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </Field>
          <Field
            label="Goes ahead with at least"
            htmlFor={`${formId}-min`}
            error={errors.minParticipants}
          >
            <Input
              id={`${formId}-min`}
              type="number"
              min={1}
              max={cap || undefined}
              inputMode="numeric"
              value={minParticipants}
              onChange={(e) => setMinParticipants(e.target.value)}
            />
          </Field>
          <Field
            label="Full-group price (₹)"
            htmlFor={`${formId}-total`}
            error={errors.targetTotalMinor}
          >
            <Input
              id={`${formId}-total`}
              type="number"
              min={0}
              step={50}
              inputMode="numeric"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
            />
          </Field>
        </div>
        <div
          className={cn(
            "rounded-[var(--radius-control)] border p-4 text-sm",
            tooCheap ? "border-warning/40 bg-warning/8" : "border-line bg-canvas",
          )}
          aria-live="polite"
        >
          {preview ? (
            <>
              <p className="text-ink">
                Each student pays{" "}
                <span className="font-semibold">
                  {formatMoney(preview.seatPriceMinor, "INR", { zeroAsFree: false })}
                </span>
                .
              </p>
              <p className="mt-1 text-ink-muted">
                You receive{" "}
                {formatMoney(preview.earningsAtMinParticipantsMinor, "INR", { zeroAsFree: false })}{" "}
                with {min} {min === 1 ? "person" : "people"}, up to{" "}
                {formatMoney(preview.earningsAtCapacityMinor, "INR", { zeroAsFree: false })} when
                all {cap} seats are taken — after the platform fee.
              </p>
              {tooCheap ? (
                <p className="mt-2 font-medium text-warning">
                  Seats must cost at least{" "}
                  {formatMoney(limits.minSeatPriceMinor, "INR", { zeroAsFree: false })} — raise the
                  price or use fewer seats.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-ink-muted">Enter seats and a price to see what each student pays.</p>
          )}
          <p className="mt-2 text-xs text-ink-muted">
            Booking closes {formatDuration(limits.registrationCloseBeforeMin)} before the start. If
            fewer than {min || "the minimum"} people have booked by then, it&apos;s cancelled and
            everyone is refunded in full.
          </p>
        </div>
        <MeetingField value={meetingUrl} onChange={setMeetingUrl} error={errors.meetingUrl} />
      </form>
    </Dialog>
  );
}

function RecordingForm({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const toast = useToast();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [visibility, setVisibility] = useState("attendees");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <PlayCircle aria-hidden="true" /> Add recording
      </Button>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api(`/api/v1/me/events/${sessionId}/recording`, {
        method: "PUT",
        body: { recordingUrl: url.trim(), recordingVisibility: visibility },
      });
      toast({ title: "Recording added" });
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? (err.fieldErrors().recordingUrl ?? err.message)
          : errorMessage(err),
      );
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full space-y-3">
      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_180px]">
        <Field label="Recording link" htmlFor={`${id}-url`}>
          <Input
            id={`${id}-url`}
            type="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </Field>
        <Field label="Who can watch" htmlFor={`${id}-vis`}>
          <Select
            id={`${id}-vis`}
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
          >
            <option value="attendees">People who registered</option>
            <option value="public">Anyone</option>
          </Select>
        </Field>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={saving} disabled={!url.trim()}>
          Save recording
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function DateBlock({ iso, timeZone }: { iso: string; timeZone: string }) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", { timeZone, day: "numeric" }).format(date);
  const month = new Intl.DateTimeFormat("en-GB", { timeZone, month: "short" }).format(date);
  return (
    <div className="flex size-14 shrink-0 flex-col items-center justify-center rounded-[var(--radius-control)] bg-primary-soft text-primary">
      <span className="text-[11px] font-semibold tracking-wide uppercase">{month}</span>
      <span className="tabular text-xl leading-none font-semibold">{day}</span>
    </div>
  );
}

function HostedCard({
  item,
  timeZone,
  past,
}: {
  item: HostedItemView;
  timeZone: string;
  past: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const start = new Date(item.start);
  const end = new Date(item.end);
  const cancelled = item.status === "cancelled";
  const pct = Math.min(100, Math.round((item.liveSeats / Math.max(1, item.capacity)) * 100));
  const belowMin = item.kind === "group" && item.liveSeats < item.minParticipants;

  async function cancel() {
    setCancelling(true);
    try {
      await api(
        item.kind === "event"
          ? `/api/v1/me/events/${item.sessionId}/cancel`
          : `/api/v1/me/mentor/group-sessions/${item.sessionId}/cancel`,
        { method: "POST" },
      );
      setCancelOpen(false);
      toast({
        title: item.kind === "event" ? "Event cancelled" : "Group session cancelled",
        description:
          item.kind === "event"
            ? "Everyone registered has been told."
            : "Everyone who booked is refunded in full.",
      });
      router.refresh();
    } catch (err) {
      toast({ title: "Couldn't cancel", description: errorMessage(err), tone: "error" });
    } finally {
      setCancelling(false);
    }
  }

  return (
    <li className="rounded-[var(--radius-card)] border border-line bg-surface p-5">
      <div className="flex gap-4">
        <DateBlock iso={item.start} timeZone={timeZone} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={item.kind === "event" ? "accent" : "primary"}>
              {item.kind === "event"
                ? "Free event"
                : `Group · ${formatMoney(item.seatPriceMinor, item.currency)} a seat`}
            </Badge>
            {item.kind === "event" && item.visibility && item.visibility !== "public" ? (
              <Badge>{VISIBILITY[item.visibility]?.label ?? item.visibility}</Badge>
            ) : null}
            {cancelled ? <Badge>Cancelled</Badge> : null}
          </div>
          <p className="mt-2 font-semibold text-ink">{item.title}</p>
          <p className="tabular mt-0.5 text-sm text-ink-muted">
            {formatDate(start, timeZone)} · {formatTimeRange(start, end, timeZone)}
          </p>
          {!cancelled ? (
            <div className="mt-3 max-w-sm">
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span className="flex items-center gap-1">
                  <UsersRound className="size-3.5" aria-hidden="true" />
                  {past
                    ? `${item.liveSeats} attended or registered`
                    : `${item.liveSeats} of ${item.capacity} booked`}
                </span>
                {item.kind === "group" && !past ? (
                  <span className={cn(belowMin && "text-warning")}>
                    needs {item.minParticipants} to go ahead
                  </span>
                ) : null}
              </div>
              {!past ? (
                <div
                  className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/8"
                  aria-hidden="true"
                >
                  <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                </div>
              ) : null}
            </div>
          ) : null}
          {!past && !cancelled && !item.hasMeetingLink ? (
            <p className="mt-3 flex items-center gap-1.5 text-sm text-warning">
              <AlertTriangle className="size-4" aria-hidden="true" /> No meeting link — attendees
              won&apos;t be able to join.
            </p>
          ) : null}
          {past && item.kind === "event" && !cancelled ? (
            <div className="mt-4">
              {item.recordingUrl ? (
                <a
                  href={item.recordingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  <Video className="size-4" aria-hidden="true" /> Recording
                </a>
              ) : (
                <RecordingForm sessionId={item.sessionId} />
              )}
            </div>
          ) : null}
        </div>
        {!past && !cancelled ? (
          <div className="hidden shrink-0 flex-col items-end gap-2 sm:flex">
            {item.eventSlug && item.visibility === "public" ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={`/events/${item.eventSlug}`}>
                  View page <ExternalLink aria-hidden="true" />
                </Link>
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:bg-danger/8"
              onClick={() => setCancelOpen(true)}
            >
              Cancel
            </Button>
          </div>
        ) : null}
      </div>
      {!past && !cancelled ? (
        <div className="mt-4 flex gap-2 border-t border-line pt-4 sm:hidden">
          {item.eventSlug && item.visibility === "public" ? (
            <Button asChild size="sm" variant="secondary">
              <Link href={`/events/${item.eventSlug}`}>View page</Link>
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="text-danger hover:bg-danger/8"
            onClick={() => setCancelOpen(true)}
          >
            Cancel
          </Button>
        </div>
      ) : null}
      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        dismissible={!cancelling}
        size="sm"
        title={`Cancel “${item.title}”?`}
        description={
          item.kind === "event"
            ? `The ${item.liveSeats} ${item.liveSeats === 1 ? "person" : "people"} registered will be told by email. This can't be undone.`
            : `Everyone who booked (${item.liveSeats}) is refunded in full and told by email. Cancelling counts towards your reliability. This can't be undone.`
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              Keep it
            </Button>
            <Button variant="destructive" loading={cancelling} onClick={() => void cancel()}>
              Cancel {item.kind === "event" ? "event" : "session"}
            </Button>
          </>
        }
      />
    </li>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-medium tracking-wide text-ink-muted uppercase">{title}</h2>
      <ul className="mt-3 space-y-3">{children}</ul>
    </section>
  );
}

/**
 * The mentor's free events and paid group sessions (docs/09 §8, §9): create either with its
 * meeting link, follow live seat counts, cancel, and post an event recording afterwards.
 */
export function HostingManager({
  timeZone,
  canHostEvents,
  groupBlocker,
  limits,
  upcoming,
  past,
}: {
  timeZone: string;
  canHostEvents: boolean;
  groupBlocker: string | null;
  limits: Limits;
  upcoming: HostedItemView[];
  past: HostedItemView[];
}) {
  const [eventOpen, setEventOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <CalendarHeart className="size-5 text-accent" aria-hidden="true" />
          <p className="mt-3 font-semibold text-ink">Free events</p>
          <p className="mt-1 flex-1 text-sm text-ink-muted">
            Q&amp;As, workshops and walkthroughs for many students at once. A good way to be found.
          </p>
          {canHostEvents ? (
            <Button className="mt-4 self-start" onClick={() => setEventOpen(true)}>
              <Plus aria-hidden="true" /> Host a free event
            </Button>
          ) : (
            <p className="mt-4 rounded-[var(--radius-control)] bg-canvas px-3 py-2 text-sm text-ink-muted">
              Hosting is by invitation during early access — our team invites mentors after their
              first sessions.
            </p>
          )}
        </div>
        <div className="flex flex-col rounded-[var(--radius-card)] border border-line bg-surface p-5">
          <UsersRound className="size-5 text-primary" aria-hidden="true" />
          <p className="mt-3 font-semibold text-ink">Group sessions</p>
          <p className="mt-1 flex-1 text-sm text-ink-muted">
            A paid session for a few students who share the cost. It only goes ahead if enough
            people book.
          </p>
          {groupBlocker ? (
            <p className="mt-4 rounded-[var(--radius-control)] bg-canvas px-3 py-2 text-sm text-ink-muted">
              {groupBlocker}
            </p>
          ) : (
            <Button
              variant="secondary"
              className="mt-4 self-start"
              onClick={() => setGroupOpen(true)}
            >
              <Plus aria-hidden="true" /> New group session
            </Button>
          )}
        </div>
      </div>

      {upcoming.length === 0 && past.length === 0 ? (
        <EmptyState
          icon={<CalendarHeart className="size-8" aria-hidden="true" />}
          title="Nothing scheduled yet"
          description="Events and group sessions you create appear here with live seat counts."
        />
      ) : null}
      {upcoming.length > 0 ? (
        <Group title="Coming up">
          {upcoming.map((item) => (
            <HostedCard key={item.sessionId} item={item} timeZone={timeZone} past={false} />
          ))}
        </Group>
      ) : null}
      {past.length > 0 ? (
        <Group title="Past">
          {past.map((item) => (
            <HostedCard key={item.sessionId} item={item} timeZone={timeZone} past />
          ))}
        </Group>
      ) : null}

      {canHostEvents ? (
        <CreateEventDialog
          open={eventOpen}
          onClose={() => setEventOpen(false)}
          timeZone={timeZone}
        />
      ) : null}
      {groupBlocker === null ? (
        <CreateGroupDialog
          open={groupOpen}
          onClose={() => setGroupOpen(false)}
          timeZone={timeZone}
          limits={limits}
        />
      ) : null}
    </div>
  );
}
