"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/ui/api";

/**
 * A booking still "waiting for payment" asks the server once to re-check the provider (docs/08 §6
 * rule 5) — so a student who closed the tab mid-payment sees it confirmed as soon as they come
 * back, instead of waiting for the next scheduler tick (docs/13 §7 E4).
 */
export function PaymentRefresher({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  useEffect(() => {
    let cancelled = false;
    api<{ status: string }>(`/api/v1/bookings/${bookingId}/payment-sync`, { method: "POST" })
      .then((result) => {
        if (!cancelled && result.status !== "held") router.refresh();
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bookingId, router]);
  return null;
}
