"use client";

import { useState } from "react";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Skeleton } from "@/ui/skeleton";
import { useMediaQuery } from "@/ui/use-media-query";
import { BookingPanel, type BookableService } from "./booking-panel";

type Props = {
  mentor: { userId: string; slug: string; firstName: string; timezone: string };
  services: BookableService[];
  maxAdvanceDays: number;
  policy: { fullRefundHours: number; partialRefundHours: number; partialRefundPct: number };
  priceLabel: string;
};

/**
 * Where the booking panel lives (docs/22 §7): a sticky card beside the profile on large screens;
 * on phones, a sticky bottom bar with the price that opens the panel as a bottom sheet. The panel
 * mounts once — never twice, hidden — so it only fetches openings where it's actually shown.
 */
export function BookingArea(props: Props) {
  const desktop = useMediaQuery("(min-width: 1024px)");
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <div className="hidden rounded-[var(--radius-sheet)] border border-line bg-surface p-6 shadow-[var(--shadow-lift)] lg:block">
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Book a session</h2>
          <p className="tabular text-sm font-medium text-ink">{props.priceLabel}</p>
        </div>
        {desktop ? (
          <BookingPanel {...props} />
        ) : (
          <div aria-hidden="true" className="space-y-3">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-[4.25rem] w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        )}
      </div>

      {!desktop ? (
        <>
          <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur-md lg:hidden">
            <div className="mx-auto flex max-w-xl items-center justify-between gap-4">
              <div>
                <p className="text-xs text-ink-muted">Book {props.mentor.firstName}</p>
                <p className="tabular font-semibold text-ink">{props.priceLabel}</p>
              </div>
              <Button
                size="lg"
                onClick={() => setSheetOpen(true)}
                disabled={props.services.length === 0}
              >
                {props.services.length === 0 ? "Not taking bookings" : "See times"}
              </Button>
            </div>
          </div>
          <Dialog
            open={sheetOpen}
            onClose={() => setSheetOpen(false)}
            title={`Book ${props.mentor.firstName}`}
            size="lg"
          >
            {sheetOpen ? <BookingPanel {...props} /> : null}
          </Dialog>
        </>
      ) : null}
    </>
  );
}
