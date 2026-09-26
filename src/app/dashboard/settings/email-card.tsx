"use client";

import { BadgeCheck, CircleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Alert } from "@/ui/alert";
import { api, ApiError, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Field, Input } from "@/ui/input";
import { isReauthCancelled, useReauth } from "@/ui/reauth";
import { useToast } from "@/ui/toast";

/** Email change is a two-sided confirmation (docs/07 §3.4): a link to the new address, and an undo
 * link to the old one — nothing changes until the new address is confirmed. */
export function EmailCard({ email, verified }: { email: string; verified: boolean }) {
  const toast = useToast();
  const { withReauth, reauthDialog } = useReauth(email);
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingTo, setPendingTo] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setNewEmail("");
    setFieldError(undefined);
    setError(null);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const value = newEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setFieldError("Enter a valid email address.");
      return;
    }
    if (value.toLowerCase() === email.toLowerCase()) {
      setFieldError("That's already your email address.");
      return;
    }
    setFieldError(undefined);
    setError(null);
    setSubmitting(true);
    try {
      await withReauth(() =>
        api("/api/v1/auth/email/change/request", { method: "POST", body: { newEmail: value } }),
      );
      setPendingTo(value);
      close();
      toast({
        title: "Check your new inbox",
        description: `We sent a confirmation link to ${value}.`,
      });
    } catch (err) {
      if (isReauthCancelled(err)) return;
      if (err instanceof ApiError && err.fieldErrors().newEmail)
        setFieldError(err.fieldErrors().newEmail);
      else setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{email}</p>
          <p
            className={`mt-1 inline-flex items-center gap-1 text-sm ${verified ? "text-success" : "text-warning"}`}
          >
            {verified ? (
              <BadgeCheck className="size-4" aria-hidden="true" />
            ) : (
              <CircleAlert className="size-4" aria-hidden="true" />
            )}
            {verified ? "Verified" : "Not verified yet"}
          </p>
        </div>
        <Button variant="secondary" onClick={() => setOpen(true)}>
          Change email
        </Button>
      </div>
      {pendingTo ? (
        <Alert tone="info" className="mt-5">
          Waiting for you to confirm <strong>{pendingTo}</strong>. Your sign-in email stays the same
          until you open the link we sent there.
        </Alert>
      ) : null}

      <Dialog
        open={open}
        onClose={close}
        dismissible={!submitting}
        title="Change your email"
        description="We'll send a confirmation link to the new address. Your current address gets a note with a way to undo the change."
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" form="email-change-form" loading={submitting}>
              Send confirmation link
            </Button>
          </>
        }
      >
        <form id="email-change-form" onSubmit={onSubmit} noValidate className="space-y-4">
          {error ? (
            <Alert tone="danger" live>
              {error}
            </Alert>
          ) : null}
          <Field label="New email address" htmlFor="new-email" error={fieldError}>
            <Input
              id="new-email"
              type="email"
              autoComplete="email"
              autoFocus
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </Field>
        </form>
      </Dialog>
      {reauthDialog}
    </div>
  );
}
