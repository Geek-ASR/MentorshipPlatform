"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import { Field, Input, Select, Textarea } from "@/ui/input";

const ACTIONS = [
  "warn",
  "restrict",
  "hide_profile",
  "suspend",
  "ban",
  "reinstate",
  "remove_content",
] as const;
const CAPABILITIES = [
  "booking.create",
  "booking.accept",
  "message.send",
  "review.create",
  "event.host",
  "listing.visible",
  "payout.release",
  "report.create",
] as const;

async function postJson(path: string, body: unknown) {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      title?: string;
      detail?: string;
    } | null;
    throw new Error(data?.detail ?? data?.title ?? `Request failed (${response.status}).`);
  }
}

export function DecideCaseForm({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [action, setAction] = useState<(typeof ACTIONS)[number]>("warn");
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [durationDays, setDurationDays] = useState("");
  const [reasonCode, setReasonCode] = useState("");
  const [rationale, setRationale] = useState("");
  const [upheldSeverity, setUpheldSeverity] = useState<"" | "minor" | "major">("");
  const [secondReviewerId, setSecondReviewerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function decide(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await postJson(`/api/v1/admin/cases/${caseId}/actions`, {
        decision: "act",
        action,
        restrictions,
        durationDays: durationDays ? Number(durationDays) : null,
        reasonCode,
        rationale: rationale || undefined,
        upheldSeverity: upheldSeverity || undefined,
        secondReviewerId: secondReviewerId || undefined,
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't apply the decision.");
    } finally {
      setPending(false);
    }
  }

  async function dismiss() {
    if (!rationale) {
      setError("Add a rationale before dismissing.");
      return;
    }
    setError(null);
    setPending(true);
    try {
      await postJson(`/api/v1/admin/cases/${caseId}/actions`, { decision: "dismiss", rationale });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't dismiss the case.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <h2 className="mb-3 font-semibold text-ink">Decide</h2>
      <form onSubmit={decide} className="space-y-3">
        <Field label="Action" htmlFor="action">
          <Select
            id="action"
            value={action}
            onChange={(e) => setAction(e.target.value as typeof action)}
          >
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
        </Field>

        {action === "restrict" ? (
          <fieldset>
            <legend className="mb-1.5 text-sm font-medium text-ink">Restrictions</legend>
            <div className="grid grid-cols-2 gap-1 text-sm text-ink-muted">
              {CAPABILITIES.map((capability) => (
                <label key={capability} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={restrictions.includes(capability)}
                    onChange={(e) =>
                      setRestrictions((prev) =>
                        e.target.checked
                          ? [...prev, capability]
                          : prev.filter((c) => c !== capability),
                      )
                    }
                  />
                  {capability}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        {action === "restrict" || action === "suspend" || action === "hide_profile" ? (
          <Field label="Duration (days, blank = indefinite)" htmlFor="duration">
            <Input
              id="duration"
              type="number"
              min={1}
              value={durationDays}
              onChange={(e) => setDurationDays(e.target.value)}
            />
          </Field>
        ) : null}

        <Field
          label="Reason code"
          htmlFor="reasonCode"
          hint="Short machine-readable code, e.g. harassment"
        >
          <Input
            id="reasonCode"
            required
            value={reasonCode}
            onChange={(e) => setReasonCode(e.target.value)}
          />
        </Field>

        <Field label="Rationale" htmlFor="rationale">
          <Textarea
            id="rationale"
            rows={3}
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
          />
        </Field>

        <Field
          label="Confirms a report (optional)"
          htmlFor="upheldSeverity"
          hint="Records report_upheld_minor/major for this subject."
        >
          <Select
            id="upheldSeverity"
            value={upheldSeverity}
            onChange={(e) => setUpheldSeverity(e.target.value as typeof upheldSeverity)}
          >
            <option value="">No</option>
            <option value="minor">Minor violation</option>
            <option value="major">Major violation</option>
          </Select>
        </Field>

        {action === "ban" ? (
          <Field
            label="Second reviewer id"
            htmlFor="secondReviewerId"
            hint="Required for a ban (docs/10 §7.3)."
          >
            <Input
              id="secondReviewerId"
              required
              value={secondReviewerId}
              onChange={(e) => setSecondReviewerId(e.target.value)}
            />
          </Field>
        ) : null}

        {error ? <p className="text-sm text-danger">{error}</p> : null}

        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={pending} className="flex-1">
            {pending ? "Applying…" : "Apply"}
          </Button>
          <Button type="button" variant="secondary" disabled={pending} onClick={dismiss}>
            Dismiss
          </Button>
        </div>
      </form>
    </Card>
  );
}
