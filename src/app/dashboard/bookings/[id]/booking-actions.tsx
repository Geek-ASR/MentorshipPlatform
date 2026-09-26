"use client";

import { CalendarClock, CalendarPlus, CircleSlash, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/ui/alert";
import { api, ApiError, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { formatDate, formatMoney, formatTime, zoneLabel } from "@/ui/format";
import { Label, Select, Textarea } from "@/ui/input";
import { Skeleton } from "@/ui/skeleton";
import { SlotPicker } from "@/ui/slot-picker";
import { useToast } from "@/ui/toast";

type Quote = {
  refundPct: number;
  refundMinor: number;
  usedCourtesy: boolean;
  window: "full" | "partial" | "late" | "not_applicable";
};

const STUDENT_REASONS = [
  { value: "schedule_conflict", label: "Something came up at that time" },
  { value: "found_other_help", label: "I found the help I needed elsewhere" },
  { value: "booked_by_mistake", label: "I booked by mistake" },
  { value: "other", label: "Another reason" },
];
const MENTOR_REASONS = [
  { value: "mentor_unavailable", label: "I'm no longer available at that time" },
  { value: "emergency", label: "Personal emergency" },
  { value: "other", label: "Another reason" },
];

export type BookingActionsProps = {
  bookingId: string;
  sessionId: string;
  role: "student" | "mentor";
  status: string;
  start: string;
  end: string;
  priceMinor: number;
  currency: string;
  timeZone: string;
  joinWindowMin: number;
  otherFirstName: string;
  reschedule: {
    mentorSlug: string | null;
    serviceId: string | null;
    durationMin: number;
    mentorTimeZone: string;
    maxAdvanceDays: number;
  } | null;
  pendingRequest: { id: string; requestedBy: "student" | "mentor"; start: string } | null;
};

function refundSentence(
  quote: Quote,
  priceMinor: number,
  currency: string,
  role: "student" | "mentor",
): string {
  if (priceMinor === 0) return "This is a free session, so there's nothing to refund.";
  if (role === "mentor") {
    return `Your student gets ${formatMoney(quote.refundMinor, currency)} back (${quote.refundPct}%) — cancelling as the mentor always refunds them in full.`;
  }
  const amount = formatMoney(quote.refundMinor, currency, { zeroAsFree: false });
  if (quote.window === "full")
    return `You'll get ${amount} back — the full price, since it's more than a day away.`;
  if (quote.window === "partial")
    return `You'll get ${amount} back (${quote.refundPct}%) under the cancellation policy.`;
  if (quote.usedCourtesy)
    return `It's close to the start, but you get ${amount} back (${quote.refundPct}%) as your once-every-90-days courtesy.`;
  return `It's too close to the start for a refund — you'll get ${amount} back.`;
}

/**
 * What a participant can do with a booking (docs/22 §3 J1 step 5): join inside the window, add it
 * to a calendar, reschedule, or cancel — always with the refund shown before confirming
 * (docs/22 §9 "cancellation is as easy as booking, with an upfront refund preview").
 */
export function BookingActions(props: BookingActionsProps) {
  const router = useRouter();
  const toast = useToast();
  const [now] = useState(() => Date.now());
  const start = new Date(props.start);
  const end = new Date(props.end);
  // Confirmed stays the status until the attendance job settles the session, so time decides too.
  const started = now >= start.getTime();
  const live = props.status === "confirmed" && now <= end.getTime();
  const changeable = live && !started;
  const joinOpen = live && now >= start.getTime() - props.joinWindowMin * 60_000;

  // Cancel
  const [cancelOpen, setCancelOpen] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [cancelling, setCancelling] = useState(false);

  async function openCancel() {
    setCancelOpen(true);
    setQuote(null);
    setQuoteError(null);
    try {
      setQuote(await api<Quote>(`/api/v1/bookings/${props.bookingId}/cancellation-quote`));
    } catch (err) {
      setQuoteError(errorMessage(err));
    }
  }

  async function confirmCancel() {
    setCancelling(true);
    try {
      await api(`/api/v1/bookings/${props.bookingId}/cancel`, {
        method: "POST",
        body: { reasonCode: reason || "other", ...(note.trim() ? { note: note.trim() } : {}) },
      });
      setCancelOpen(false);
      toast({
        title: "Booking cancelled",
        description:
          quote && quote.refundMinor > 0
            ? `${formatMoney(quote.refundMinor, props.currency)} is on its way back to you.`
            : `We've let ${props.otherFirstName} know.`,
      });
      router.refresh();
    } catch (err) {
      setQuoteError(errorMessage(err));
    } finally {
      setCancelling(false);
    }
  }

  // Reschedule
  const [moveOpen, setMoveOpen] = useState(false);
  const [newStart, setNewStart] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  async function confirmMove() {
    if (!newStart) return;
    setMoving(true);
    setMoveError(null);
    try {
      const result = await api<{ applied: boolean }>(
        `/api/v1/bookings/${props.bookingId}/reschedule`,
        {
          method: "POST",
          body: { startsAt: newStart },
        },
      );
      setMoveOpen(false);
      setNewStart(null);
      toast(
        result.applied
          ? { title: "Session moved", description: "Your calendar invite has been updated." }
          : {
              title: "Request sent",
              description: `${props.otherFirstName} needs to accept the new time. Until then, the original time stands.`,
            },
      );
      router.refresh();
    } catch (err) {
      setMoveError(
        err instanceof ApiError && err.code === "SLOT_UNAVAILABLE"
          ? "That time was just taken. Please pick another."
          : errorMessage(err),
      );
    } finally {
      setMoving(false);
    }
  }

  // Reschedule decision (the other side's request)
  const [deciding, setDeciding] = useState<"accept" | "decline" | null>(null);
  async function decide(decision: "accept" | "decline") {
    if (!props.pendingRequest) return;
    setDeciding(decision);
    try {
      await api(`/api/v1/bookings/${props.bookingId}/reschedule/decision`, {
        method: "POST",
        body: { requestId: props.pendingRequest.id, decision },
      });
      toast({ title: decision === "accept" ? "New time accepted" : "Kept the original time" });
      router.refresh();
    } catch (err) {
      toast({
        title: "Couldn't record your answer",
        description: errorMessage(err),
        tone: "error",
      });
    } finally {
      setDeciding(null);
    }
  }

  const theirRequest =
    props.pendingRequest && props.pendingRequest.requestedBy !== props.role
      ? props.pendingRequest
      : null;
  const myRequest =
    props.pendingRequest && props.pendingRequest.requestedBy === props.role
      ? props.pendingRequest
      : null;
  const reasons = props.role === "student" ? STUDENT_REASONS : MENTOR_REASONS;

  return (
    <div className="space-y-4">
      {theirRequest ? (
        <Alert
          tone="info"
          title={`${props.otherFirstName} asked to move this session`}
          action={
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                loading={deciding === "accept"}
                disabled={deciding !== null}
                onClick={() => void decide("accept")}
              >
                Accept new time
              </Button>
              <Button
                size="sm"
                variant="secondary"
                loading={deciding === "decline"}
                disabled={deciding !== null}
                onClick={() => void decide("decline")}
              >
                Keep original time
              </Button>
            </div>
          }
        >
          Proposed: {formatDate(new Date(theirRequest.start), props.timeZone)} at{" "}
          {formatTime(new Date(theirRequest.start), props.timeZone)}{" "}
          {zoneLabel(new Date(theirRequest.start), props.timeZone)}.
        </Alert>
      ) : null}
      {myRequest ? (
        <Alert tone="info" title="Waiting for an answer">
          You asked to move this session to {formatDate(new Date(myRequest.start), props.timeZone)}{" "}
          at {formatTime(new Date(myRequest.start), props.timeZone)}. Until {props.otherFirstName}{" "}
          accepts, the original time stands.
        </Alert>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {live ? (
          joinOpen ? (
            <Button asChild>
              <a href={`/api/v1/sessions/${props.sessionId}/join`} target="_blank" rel="noreferrer">
                <Video aria-hidden="true" /> Join now
              </a>
            </Button>
          ) : (
            <Button disabled variant="secondary">
              <Video aria-hidden="true" /> Join opens {props.joinWindowMin} min before
            </Button>
          )
        ) : null}
        {live ? (
          <Button asChild variant="secondary">
            <a href={`/api/v1/bookings/${props.bookingId}/calendar.ics`} download>
              <CalendarPlus aria-hidden="true" /> Add to calendar
            </a>
          </Button>
        ) : null}
        {changeable &&
        props.reschedule?.mentorSlug &&
        props.reschedule.serviceId &&
        !props.pendingRequest ? (
          <Button variant="secondary" onClick={() => setMoveOpen(true)}>
            <CalendarClock aria-hidden="true" /> Reschedule
          </Button>
        ) : null}
        {changeable || props.status === "held" ? (
          <Button
            variant="ghost"
            className="text-danger hover:bg-danger/8"
            onClick={() => void openCancel()}
          >
            <CircleSlash aria-hidden="true" /> Cancel booking
          </Button>
        ) : null}
      </div>

      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        dismissible={!cancelling}
        title="Cancel this booking?"
        description={`${formatDate(start, props.timeZone)}, ${formatTime(start, props.timeZone)} ${zoneLabel(start, props.timeZone)}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)} disabled={cancelling}>
              Keep booking
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmCancel()}
              loading={cancelling}
              disabled={!quote}
            >
              Cancel booking
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {quoteError ? (
            <Alert tone="danger" live>
              {quoteError}
            </Alert>
          ) : quote ? (
            <Alert
              tone={quote.refundMinor > 0 || props.priceMinor === 0 ? "info" : "warning"}
              title="What happens to your money"
            >
              {refundSentence(quote, props.priceMinor, props.currency, props.role)}
            </Alert>
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
          <div>
            <Label htmlFor="cancel-reason">Reason</Label>
            <Select id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason (optional)</option>
              {reasons.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="cancel-note">
              Note to {props.otherFirstName}{" "}
              <span className="font-normal text-ink-muted">(optional)</span>
            </Label>
            <Textarea
              id="cancel-note"
              rows={3}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
      </Dialog>

      {props.reschedule?.mentorSlug && props.reschedule.serviceId ? (
        <Dialog
          open={moveOpen}
          onClose={() => setMoveOpen(false)}
          dismissible={!moving}
          size="lg"
          title="Pick a new time"
          description={
            props.role === "student"
              ? "Moving more than a day ahead happens straight away; closer to the start, your mentor confirms first."
              : "Your student will be asked to accept the new time."
          }
          footer={
            <>
              <Button variant="secondary" onClick={() => setMoveOpen(false)} disabled={moving}>
                Keep current time
              </Button>
              <Button onClick={() => void confirmMove()} loading={moving} disabled={!newStart}>
                Move session
              </Button>
            </>
          }
        >
          {moveOpen ? (
            <div className="space-y-4">
              {moveError ? (
                <Alert tone="danger" live>
                  {moveError}
                </Alert>
              ) : null}
              <SlotPicker
                slug={props.reschedule.mentorSlug}
                serviceId={props.reschedule.serviceId}
                durationMin={props.reschedule.durationMin}
                timeZone={props.timeZone}
                mentorTimeZone={props.reschedule.mentorTimeZone}
                mentorFirstName={props.role === "student" ? props.otherFirstName : "you"}
                maxAdvanceDays={props.reschedule.maxAdvanceDays}
                value={newStart}
                onChange={setNewStart}
                label="Available times"
              />
            </div>
          ) : null}
        </Dialog>
      ) : null}
    </div>
  );
}
