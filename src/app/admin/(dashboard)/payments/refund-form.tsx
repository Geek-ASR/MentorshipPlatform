"use client";

import { useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { adminFetch, isReauthRequired } from "@/ui/admin-fetch";
import { Button } from "@/ui/button";
import { Input } from "@/ui/input";

export function RefundForm({
  paymentId,
  maxRefundMinor,
  currency,
}: {
  paymentId: string;
  maxRefundMinor: number;
  currency: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [refundMinor, setRefundMinor] = useState(String(maxRefundMinor));
  const [reasonCode, setReasonCode] = useState("goodwill");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (maxRefundMinor <= 0) return null;

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        Refund
      </Button>
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await adminFetch(`/api/v1/admin/payments/${paymentId}/refund`, {
        body: { refundMinor: Number(refundMinor), reasonCode },
      });
      router.refresh();
      setOpen(false);
    } catch (err) {
      if (isReauthRequired(err)) {
        router.push(`/admin/login?returnTo=${encodeURIComponent(pathname)}`);
        return;
      }
      setError(err instanceof Error ? err.message : "Refund failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <Input
          type="number"
          min={1}
          max={maxRefundMinor}
          value={refundMinor}
          onChange={(e) => setRefundMinor(e.target.value)}
          className="h-8 w-24 text-xs"
        />
        <span className="text-xs text-ink-muted">{currency} minor</span>
      </div>
      <Input
        value={reasonCode}
        onChange={(e) => setReasonCode(e.target.value)}
        placeholder="Reason code"
        className="h-8 text-xs"
      />
      <div className="flex gap-1">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "…" : "Confirm"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </form>
  );
}
