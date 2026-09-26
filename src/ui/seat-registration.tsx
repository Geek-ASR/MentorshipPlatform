"use client";

import { CalendarPlus, CheckCircle2, Hourglass, Ticket, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Alert } from "./alert";
import { api, ApiError, errorMessage } from "./api";
import { Button } from "./button";
import { cn } from "./cn";
import { Dialog } from "./dialog";
import { formatMoney, formatTime, formatDate, zoneLabel } from "./format";
import { signInHref } from "./navigation";
import { Skeleton } from "./skeleton";
import { useToast } from "./toast";
import { useBrowserTimeZone } from "./use-hydrated";
import { useViewer } from "./viewer";

export type SeatSession = {
  sessionId: string;
  kind: "event" | "group";
  hostUserId: string;
  hostFirstName: string;
  seatPriceMinor: number;
  currency: string;
  capacity: number;
  liveSeats: number;
  start: string;
  registrationClosesAt: string | null;
  status: string;
};

type MyBooking = { id: string; sessionId: string; status: string };
type MyWaitlistEntry = {
  id: string;
  sessionId: string;
  status: "waiting" | "offered" | "claimed" | "expired" | "left";
  offerExpiresAt: string | null;
};
type SeatResult = { booking: { id: string; status: string }; isFree: boolean };

const LIVE_BOOKING = new Set(["held", "confirmed"]);

const NOT_ELIGIBLE: Record<string, string> = {
  EMAIL_NOT_VERIFIED: "Verify your email address first — we sent you a link when you signed up.",
  AGE_POLICY: "Aheadly sessions are for adults (18+).",
  ACCOUNT_RESTRICTED:
    "Registering is paused on your account right now. See Account standing for details.",
  NOT_AVAILABLE: "You can't register for this session.",
  OUTSIDE_AVAILABILITY: "Registration for this session has closed.",
  MENTOR_UNAVAILABLE: "This session isn't taking registrations.",
  MENTOR_NOT_PAYABLE: "Seats for this session can't be paid for right now.",
  SELF_BOOKING: "You're hosting this session.",
};

function friendlyError(err: unknown): string {
  if (err instanceof ApiError && err.code === "BOOKING_NOT_ELIGIBLE") {
    const reason = typeof err.extensions.reason === "string" ? err.extensions.reason : "";
    return NOT_ELIGIBLE[reason] ?? errorMessage(err);
  }
  return errorMessage(err);
}

function SeatMeter({ capacity, taken }: { capacity: number; taken: number }) {
  const left = Math.max(0, capacity - taken);
  const pct = Math.min(100, Math.round((taken / Math.max(1, capacity)) * 100));
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 text-ink-muted">
          <Users className="size-4" aria-hidden="true" />
          {left === 0 ? "Full" : `${left} of ${capacity} spots left`}
        </span>
        <span className="tabular text-xs text-ink-muted">{taken} going</span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/8"
        role="presentation"
        aria-hidden="true"
      >
        <div
          className={cn("h-full rounded-full", left === 0 ? "bg-warning" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Registration for a free event or a paid group seat (docs/09 §6.2, §8, §9), on statically rendered
 * pages: who is signed in and whether they already hold a seat or a waitlist place is read in the
 * browser. A full session offers the waitlist; a free event promotes the next person automatically,
 * a paid seat is offered with a time limit to claim.
 */
export function SeatRegistration({
  session,
  returnPath,
  className,
}: {
  session: SeatSession;
  returnPath: string;
  className?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const viewerState = useViewer();
  const viewer = viewerState.status === "ready" ? viewerState.viewer : null;
  const timeZone = useBrowserTimeZone("Asia/Kolkata");
  const [mine, setMine] = useState<{
    booking: MyBooking | null;
    entry: MyWaitlistEntry | null;
  } | null>(null);
  const [taken, setTaken] = useState(session.liveSeats);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [now] = useState(() => Date.now());

  const isFree = session.seatPriceMinor === 0;
  const full = taken >= session.capacity;
  const closed =
    session.status !== "scheduled" ||
    now >= new Date(session.start).getTime() ||
    (session.registrationClosesAt !== null &&
      now >= new Date(session.registrationClosesAt).getTime());

  // The page around this panel is cached for a minute; the current count decides the button.
  useEffect(() => {
    let cancelled = false;
    api<{ liveSeats: number }>(`/api/v1/sessions/${session.sessionId}/seats`)
      .then((seats) => {
        if (!cancelled) setTaken(seats.liveSeats);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [session.sessionId]);

  useEffect(() => {
    if (!viewer || viewer.id === session.hostUserId) return;
    let cancelled = false;
    Promise.all([
      api<{ bookings: MyBooking[] }>("/api/v1/me/bookings"),
      api<{ entries: MyWaitlistEntry[] }>("/api/v1/me/waitlist"),
    ])
      .then(([bookings, waitlist]) => {
        if (cancelled) return;
        setMine({
          booking:
            bookings.bookings.find(
              (b) => b.sessionId === session.sessionId && LIVE_BOOKING.has(b.status),
            ) ?? null,
          entry:
            waitlist.entries.find(
              (e) =>
                e.sessionId === session.sessionId &&
                (e.status === "waiting" || e.status === "offered"),
            ) ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setMine({ booking: null, entry: null });
      });
    return () => {
      cancelled = true;
    };
  }, [viewer, session.sessionId, session.hostUserId]);

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (err) {
      if (err instanceof ApiError && err.code === "SLOT_UNAVAILABLE") {
        setTaken(session.capacity);
        setError("The last spot was just taken — you can join the waitlist instead.");
      } else {
        setError(friendlyError(err));
      }
    } finally {
      setBusy(null);
    }
  }

  function afterSeat(result: SeatResult) {
    if (!result.isFree) {
      router.push(`/checkout/${result.booking.id}`);
      return;
    }
    setMine({ booking: { ...result.booking, sessionId: session.sessionId }, entry: null });
    setTaken((n) => n + 1);
    toast({ title: "You're registered", description: "We've emailed you the details." });
    router.refresh();
  }

  const register = () =>
    run("register", async () => {
      afterSeat(
        await api<SeatResult>(`/api/v1/sessions/${session.sessionId}/bookings`, {
          method: "POST",
          body: { intakeAnswers: [] },
        }),
      );
    });

  const joinWaitlist = () =>
    run("waitlist", async () => {
      const entry = await api<MyWaitlistEntry>(`/api/v1/sessions/${session.sessionId}/waitlist`, {
        method: "POST",
      });
      setMine({ booking: null, entry });
      toast({ title: "You're on the waitlist" });
    });

  const leaveWaitlist = () =>
    run("leave", async () => {
      await api(`/api/v1/sessions/${session.sessionId}/waitlist`, { method: "DELETE" });
      setMine({ booking: null, entry: null });
      toast({ title: "You've left the waitlist" });
    });

  const claimOffer = (entryId: string) =>
    run("claim", async () => {
      afterSeat(
        await api<SeatResult>(`/api/v1/waitlist-offers/${entryId}/claim`, {
          method: "POST",
          body: { intakeAnswers: [] },
        }),
      );
    });

  const cancelRegistration = (bookingId: string) =>
    run("cancel", async () => {
      await api(`/api/v1/bookings/${bookingId}/cancel`, {
        method: "POST",
        body: { reasonCode: "schedule_conflict" },
      });
      setCancelOpen(false);
      setMine({ booking: null, entry: null });
      setTaken((n) => Math.max(0, n - 1));
      toast({ title: "Registration cancelled", description: "Your spot goes to the next person." });
      router.refresh();
    });

  const price = isFree ? "Free" : formatMoney(session.seatPriceMinor, session.currency);
  const noun = session.kind === "event" ? "event" : "session";
  const start = new Date(session.start);

  let body: ReactNode;
  if (viewerState.status === "loading" || (viewer && viewer.id !== session.hostUserId && !mine)) {
    body = <Skeleton className="h-11 w-full" />;
  } else if (session.status === "cancelled") {
    body = (
      <Alert tone="warning" title={`This ${noun} was cancelled`}>
        {isFree ? "Everyone registered has been told." : "Everyone who paid has been refunded."}
      </Alert>
    );
  } else if (viewer && viewer.id === session.hostUserId) {
    body = (
      <div className="space-y-3">
        <p className="text-sm text-ink">You&apos;re hosting this {noun}.</p>
        <Button asChild variant="secondary" className="w-full">
          <Link href="/dashboard/mentor/events">Manage your events</Link>
        </Button>
      </div>
    );
  } else if (mine?.booking) {
    const booking = mine.booking;
    body =
      booking.status === "held" ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <Hourglass className="size-4 text-warning" aria-hidden="true" /> Your seat is held
          </p>
          <Button asChild className="w-full">
            <Link href={`/checkout/${booking.id}`}>Finish paying</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="flex items-center gap-2 font-medium text-success">
            <CheckCircle2 className="size-5" aria-hidden="true" /> You&apos;re registered
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <Button asChild variant="secondary">
              <a href={`/api/v1/bookings/${booking.id}/calendar.ics`} download>
                <CalendarPlus aria-hidden="true" /> Add to calendar
              </a>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/dashboard/bookings/${booking.id}`}>View booking</Link>
            </Button>
          </div>
          {isFree && !closed ? (
            <Button
              variant="link"
              className="text-sm text-ink-muted"
              onClick={() => setCancelOpen(true)}
            >
              Can&apos;t make it? Cancel registration
            </Button>
          ) : null}
        </div>
      );
  } else if (mine?.entry?.status === "offered") {
    const entry = mine.entry;
    const expires = entry.offerExpiresAt ? new Date(entry.offerExpiresAt) : null;
    body = (
      <div className="space-y-3">
        <Alert tone="success" title="A seat opened up for you">
          {expires
            ? `Claim it by ${formatDate(expires, timeZone)}, ${formatTime(expires, timeZone)} ${zoneLabel(expires, timeZone)} — after that it goes to the next person.`
            : "Claim it before it goes to the next person."}
        </Alert>
        <Button
          className="w-full"
          loading={busy === "claim"}
          onClick={() => void claimOffer(entry.id)}
        >
          <Ticket aria-hidden="true" /> Claim seat · {price}
        </Button>
        <Button
          variant="link"
          className="text-sm text-ink-muted"
          onClick={() => void leaveWaitlist()}
        >
          No thanks, leave the waitlist
        </Button>
      </div>
    );
  } else if (mine?.entry) {
    body = (
      <div className="space-y-3">
        <p className="flex items-center gap-2 font-medium text-ink">
          <Hourglass className="size-5 text-primary" aria-hidden="true" /> You&apos;re on the
          waitlist
        </p>
        <p className="text-sm text-ink-muted">
          {isFree
            ? "If a spot opens, it's yours automatically and we'll email you."
            : "If a seat opens, we'll email you and hold it for you for a limited time."}
        </p>
        <Button
          variant="secondary"
          className="w-full"
          loading={busy === "leave"}
          onClick={() => void leaveWaitlist()}
        >
          Leave the waitlist
        </Button>
      </div>
    );
  } else if (closed) {
    body = <p className="text-sm text-ink-muted">Registration has closed.</p>;
  } else if (!viewer) {
    body = (
      <div className="space-y-2">
        <Button asChild className="w-full">
          <Link href={signInHref(returnPath)}>
            {full
              ? "Sign in to join the waitlist"
              : `Sign in to ${isFree ? "register" : "book a seat"}`}
          </Link>
        </Button>
        <p className="text-center text-xs text-ink-muted">
          New here?{" "}
          <Link href="/sign-up" className="text-primary underline">
            Create a free account
          </Link>
        </p>
      </div>
    );
  } else if (full) {
    body = (
      <div className="space-y-3">
        <Button
          variant="secondary"
          className="w-full"
          loading={busy === "waitlist"}
          onClick={() => void joinWaitlist()}
        >
          Join the waitlist
        </Button>
        <p className="text-xs text-ink-muted">
          {isFree
            ? "Spots open up when people cancel — the waitlist moves automatically."
            : "If a seat opens, you'll get time to claim it before it goes to the next person."}
        </p>
      </div>
    );
  } else {
    body = (
      <Button
        className="w-full"
        size="lg"
        loading={busy === "register"}
        onClick={() => void register()}
      >
        <Ticket aria-hidden="true" />
        {isFree ? "Register — it's free" : `Book a seat · ${price}`}
      </Button>
    );
  }

  return (
    <div
      className={cn(
        "rounded-[var(--radius-sheet)] border border-line bg-surface p-6 shadow-[var(--shadow-lift)]",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-serif text-2xl font-semibold text-ink">{price}</p>
        {!isFree ? <p className="text-sm text-ink-muted">per seat</p> : null}
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        {formatDate(start, timeZone)} · {formatTime(start, timeZone)} {zoneLabel(start, timeZone)}
      </p>
      <div className="mt-5">
        <SeatMeter capacity={session.capacity} taken={taken} />
      </div>
      <div className="mt-5 space-y-3">
        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : null}
        {body}
      </div>
      {mine?.booking && isFree ? (
        <Dialog
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          dismissible={busy !== "cancel"}
          size="sm"
          title="Cancel your registration?"
          description="Your spot goes to the next person on the waitlist, if there is one."
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setCancelOpen(false)}
                disabled={busy === "cancel"}
              >
                Keep my spot
              </Button>
              <Button
                variant="destructive"
                loading={busy === "cancel"}
                onClick={() => void cancelRegistration(mine.booking!.id)}
              >
                Cancel registration
              </Button>
            </>
          }
        />
      ) : null}
    </div>
  );
}
