"use client";

import { MailCheck } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Alert } from "@/ui/alert";
import { api, ApiError, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Field, Input } from "@/ui/input";

/** Starts the email challenge for one affiliation (docs/10 §2.2): a link to an address on the
 * organisation's own domain proves the mentor has, or had, an account there. */
export function VerifyAffiliationButton({
  affiliationId,
  organizationName,
  kind,
}: {
  affiliationId: string;
  organizationName: string;
  kind: "education" | "work";
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setFieldError(undefined);
    setError(null);
    setBusy(true);
    try {
      await api("/api/v1/me/verification/email-challenge", {
        method: "POST",
        body: { affiliationId, email: email.trim() },
      });
      setSentTo(email.trim());
      setOpen(false);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors().email)
        setFieldError(err.fieldErrors().email);
      else setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button size="sm" variant={sentTo ? "secondary" : "primary"} onClick={() => setOpen(true)}>
        {sentTo ? "Send again" : "Verify"}
      </Button>
      {sentTo ? (
        <p className="flex items-center gap-1.5 text-xs text-ink-muted" role="status">
          <MailCheck className="size-3.5 text-primary" aria-hidden="true" /> Link sent to {sentTo}
        </p>
      ) : null}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!busy}
        title={`Verify ${organizationName}`}
        description={`We'll email a one-time link to your ${kind === "work" ? "work" : "university"} address. Clicking it confirms the affiliation — your profile shows the kind of email and the month, never the address itself.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form={`verify-${affiliationId}`} loading={busy}>
              Send link
            </Button>
          </>
        }
      >
        <form id={`verify-${affiliationId}`} onSubmit={onSubmit} noValidate className="space-y-4">
          {error ? (
            <Alert tone="danger" live>
              {error}
            </Alert>
          ) : null}
          <Field
            label={`Your ${organizationName} email`}
            htmlFor={`verify-email-${affiliationId}`}
            error={fieldError}
            hint="Alumni addresses work too, where the university offers them."
          >
            <Input
              id={`verify-email-${affiliationId}`}
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
        </form>
      </Dialog>
    </div>
  );
}
