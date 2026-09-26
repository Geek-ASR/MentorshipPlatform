"use client";

import { Hourglass, Ticket } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { formatDate, formatMoney, formatTime, zoneLabel } from "@/ui/format";
import { useToast } from "@/ui/toast";

export type WaitlistItemView = {
  entryId: string;
  sessionId: string;
  status: "waiting" | "offered";
  offerExpiresAt: string | null;
  kind: "group" | "event";
  title: string;
  eventSlug: string | null;
  start: string;
  hostName: string;
  seatPriceMinor: number;
  currency: string;
};

function WaitlistRow({ item, timeZone }: { item: WaitlistItemView; timeZone: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"claim" | "leave" | null>(null);
  const start = new Date(item.start);
  const expires = item.offerExpiresAt ? new Date(item.offerExpiresAt) : null;

  async function claim() {
    setBusy("claim");
    try {
      const result = await api<{ booking: { id: string }; isFree: boolean }>(
        `/api/v1/waitlist-offers/${item.entryId}/claim`,
        { method: "POST", body: { intakeAnswers: [] } },
      );
      if (!result.isFree) {
        router.push(`/checkout/${result.booking.id}`);
        return;
      }
      toast({ title: "Seat claimed" });
      router.refresh();
    } catch (err) {
      toast({ title: "Couldn't claim the seat", description: errorMessage(err), tone: "error" });
      setBusy(null);
    }
  }

  async function leave() {
    setBusy("leave");
    try {
      await api(`/api/v1/sessions/${item.sessionId}/waitlist`, { method: "DELETE" });
      toast({ title: "You've left the waitlist" });
      router.refresh();
    } catch (err) {
      toast({
        title: "Couldn't leave the waitlist",
        description: errorMessage(err),
        tone: "error",
      });
      setBusy(null);
    }
  }

  return (
    <li className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-sm font-medium text-ink">
          {item.status === "offered" ? (
            <Ticket className="size-4 text-success" aria-hidden="true" />
          ) : (
            <Hourglass className="size-4 text-primary" aria-hidden="true" />
          )}
          {item.eventSlug ? (
            <Link href={`/events/${item.eventSlug}`} className="truncate hover:text-primary">
              {item.title}
            </Link>
          ) : (
            <span className="truncate">{item.title}</span>
          )}
        </p>
        <p className="tabular mt-0.5 text-sm text-ink-muted">
          {formatDate(start, timeZone)} · {formatTime(start, timeZone)} {zoneLabel(start, timeZone)}{" "}
          · with {item.hostName}
        </p>
        <p className="mt-1 text-sm">
          {item.status === "offered" && expires ? (
            <span className="font-medium text-success">
              A seat is yours if you claim it by {formatDate(expires, timeZone)},{" "}
              {formatTime(expires, timeZone)}
            </span>
          ) : (
            <span className="text-ink-muted">
              {item.kind === "event"
                ? "You'll get a spot automatically if one opens."
                : "We'll email you if a seat opens."}
            </span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {item.status === "offered" ? (
          <Button
            size="sm"
            loading={busy === "claim"}
            disabled={busy !== null}
            onClick={() => void claim()}
          >
            Claim · {formatMoney(item.seatPriceMinor, item.currency)}
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="secondary"
          loading={busy === "leave"}
          disabled={busy !== null}
          onClick={() => void leave()}
        >
          Leave
        </Button>
      </div>
    </li>
  );
}

export function WaitlistList({ items, timeZone }: { items: WaitlistItemView[]; timeZone: string }) {
  return (
    <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-surface px-5">
      {items.map((item) => (
        <WaitlistRow key={item.entryId} item={item} timeZone={timeZone} />
      ))}
    </ul>
  );
}
