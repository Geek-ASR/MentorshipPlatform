"use client";

import { CreditCard, FlaskConical, Hourglass } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert } from "@/ui/alert";
import { api, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";

type SyncResult = { id: string; status: string };

function remaining(
  until: number,
  now: number,
): { minutes: number; seconds: number; done: boolean } {
  const ms = Math.max(0, until - now);
  return {
    minutes: Math.floor(ms / 60_000),
    seconds: Math.floor((ms % 60_000) / 1000),
    done: ms === 0,
  };
}

/** A real countdown for a real hold (docs/22 §9: urgency must be literally true). Screen readers
 * hear it once a minute, not every second (docs/22 §8). */
export function HoldCountdown({
  holdExpiresAt,
  onExpire,
}: {
  holdExpiresAt: string;
  onExpire: () => void;
}) {
  const until = new Date(holdExpiresAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= until) {
        window.clearInterval(timer);
        onExpire();
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [until, onExpire]);
  const left = remaining(until, now);
  return (
    <div className="flex items-center gap-3 rounded-[var(--radius-control)] border border-warning/35 bg-warning/8 px-4 py-3">
      <Hourglass className="size-5 shrink-0 text-warning" aria-hidden="true" />
      <p className="text-sm text-ink">
        We&apos;re holding this time for you for{" "}
        <span aria-hidden="true" className="tabular font-semibold">
          {left.minutes}:{String(left.seconds).padStart(2, "0")}
        </span>
        <span className="sr-only" aria-live="polite">
          {left.done ? "The hold has ended." : `about ${left.minutes + 1} minutes`}
        </span>
      </p>
    </div>
  );
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Test-mode checkout against the fake payment provider (docs/08 §14). "Pay" drives the provider's
 * own signed webhook exactly like a real payment, then asks the server to re-check the provider's
 * record and confirm (docs/08 §6 rule 5) — the browser never tells the server it paid.
 */
export function CheckoutPanel({
  bookingId,
  providerOrderId,
  amountLabel,
  holdExpiresAt,
  mentorSlug,
  provider,
}: {
  bookingId: string;
  providerOrderId: string;
  amountLabel: string;
  holdExpiresAt: string | null;
  mentorSlug: string | null;
  provider: "fake" | "razorpay";
}) {
  const router = useRouter();
  const [stage, setStage] = useState<
    "ready" | "paying" | "confirming" | "failed" | "slow" | "expired"
  >(() => (holdExpiresAt && new Date(holdExpiresAt).getTime() <= Date.now() ? "expired" : "ready"));
  const [error, setError] = useState<string | null>(null);

  async function confirm(): Promise<void> {
    setStage("confirming");
    for (let attempt = 0; attempt < 8; attempt++) {
      const result = await api<SyncResult>(`/api/v1/bookings/${bookingId}/payment-sync`, {
        method: "POST",
      }).catch(() => null);
      if (result?.status === "confirmed") {
        router.replace(`/dashboard/bookings/${bookingId}?booked=1`);
        return;
      }
      await sleep(1500);
    }
    setStage("slow");
  }

  async function simulate(outcome: "succeed" | "fail") {
    setError(null);
    setStage("paying");
    try {
      await api("/api/v1/dev/fake-checkout", {
        method: "POST",
        body: { providerOrderId, outcome },
      });
      if (outcome === "fail") {
        setStage("failed");
        return;
      }
      await confirm();
    } catch (err) {
      setError(errorMessage(err));
      setStage("ready");
    }
  }

  if (provider !== "fake") {
    return (
      <Alert tone="warning" title="Payments aren't switched on here yet">
        This environment isn&apos;t connected to a payment provider. Your time is held until the
        hold ends; nothing has been charged.
      </Alert>
    );
  }

  if (stage === "expired") {
    return (
      <div className="space-y-4">
        <Alert tone="warning" title="Your hold has ended">
          Nothing was charged. The time may still be free — pick it again to start a new hold.
        </Alert>
        {mentorSlug ? (
          <Button asChild size="lg" className="w-full">
            <Link href={`/mentors/${mentorSlug}`}>Choose a time again</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {holdExpiresAt ? (
        <HoldCountdown
          holdExpiresAt={holdExpiresAt}
          onExpire={() => setStage((s) => (s === "ready" || s === "failed" ? "expired" : s))}
        />
      ) : null}

      <div className="flex items-start gap-3 rounded-[var(--radius-control)] border border-primary/25 bg-primary-soft/60 px-4 py-3 text-sm text-ink">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <p>
          <strong>Test mode.</strong> No real money moves. Choose what the payment provider should
          do — the rest of the flow (signed webhook, ledger, confirmation) is the real one.
        </p>
      </div>

      {stage === "failed" ? (
        <Alert tone="danger" title="That payment didn't go through" live>
          No money was taken. You can try again while your time is held.
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="danger" live>
          {error}
        </Alert>
      ) : null}
      {stage === "slow" ? (
        <Alert tone="info" title="Still confirming your payment" live>
          This can take a minute. We&apos;ll email you as soon as it&apos;s confirmed — you can also
          check{" "}
          <Link
            href={`/dashboard/bookings/${bookingId}`}
            className="font-medium text-primary underline"
          >
            the booking page
          </Link>
          .
        </Alert>
      ) : null}

      {stage === "confirming" ? (
        <div
          role="status"
          className="flex items-center gap-3 rounded-[var(--radius-control)] border border-line bg-canvas px-4 py-4 text-sm text-ink"
        >
          <span
            className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent"
            aria-hidden="true"
          />
          Confirming your payment…
        </div>
      ) : (
        <div className="space-y-3">
          <Button
            size="lg"
            className="w-full"
            loading={stage === "paying"}
            disabled={stage === "slow"}
            onClick={() => void simulate("succeed")}
          >
            <CreditCard aria-hidden="true" /> Pay {amountLabel}
          </Button>
          <Button
            size="lg"
            variant="secondary"
            className="w-full"
            disabled={stage === "paying" || stage === "slow"}
            onClick={() => void simulate("fail")}
          >
            Simulate a failed payment
          </Button>
        </div>
      )}
    </div>
  );
}
