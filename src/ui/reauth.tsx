"use client";

import { useCallback, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "./alert";
import { api, ApiError, errorMessage, isApiError } from "./api";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { Field, Input } from "./input";
import { normalizeMfaCode } from "./mfa-code";
import { PasswordInput } from "./password-input";

type SignInResponse = { outcome: "signed_in" } | { outcome: "mfa_required"; pendingToken: string };

/**
 * Step-up for sensitive changes (docs/07 §5): when an API answers `REAUTH_REQUIRED`, ask for the
 * password (and a 2-step code when enabled) in place, then retry the original action — instead of
 * bouncing the person out to the sign-in page and losing what they typed.
 */
export function useReauth(email: string): {
  withReauth: <T>(action: () => Promise<T>) => Promise<T>;
  reauthDialog: ReactNode;
} {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef<{ resolve: () => void; reject: (error: unknown) => void } | null>(null);

  const reset = () => {
    setPassword("");
    setCode("");
    setPendingToken(null);
    setError(null);
    setSubmitting(false);
  };

  const withReauth = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action();
    } catch (err) {
      if (!isApiError(err, "REAUTH_REQUIRED")) throw err;
      await new Promise<void>((resolve, reject) => {
        pending.current = { resolve, reject };
        setOpen(true);
      });
      return action();
    }
  }, []);

  function close() {
    setOpen(false);
    reset();
    pending.current?.reject(new ApiError(401, { code: "REAUTH_CANCELLED", detail: "Cancelled." }));
    pending.current = null;
  }

  function succeed() {
    setOpen(false);
    reset();
    pending.current?.resolve();
    pending.current = null;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (pendingToken) {
        await api("/api/v1/auth/sign-in/mfa", {
          method: "POST",
          body: { pendingToken, code: normalizeMfaCode(code) },
        });
        succeed();
        return;
      }
      const result = await api<SignInResponse>("/api/v1/auth/sign-in", {
        method: "POST",
        body: { email, password },
      });
      if (result.outcome === "mfa_required") {
        setPendingToken(result.pendingToken);
        setSubmitting(false);
        return;
      }
      succeed();
    } catch (err) {
      setError(
        isApiError(err, "INVALID_CREDENTIALS")
          ? "That password isn't right."
          : pendingToken && err instanceof ApiError && err.status < 500
            ? "That code didn't work. Try the newest one."
            : errorMessage(err),
      );
      setSubmitting(false);
    }
  }

  const reauthDialog = (
    <Dialog
      open={open}
      onClose={close}
      size="sm"
      dismissible={!submitting}
      title="Confirm it's you"
      description={
        pendingToken
          ? "Enter the code from your authenticator app, or one of your recovery codes."
          : "For your security, enter your password to make this change."
      }
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="reauth-form" loading={submitting}>
            Confirm
          </Button>
        </>
      }
    >
      <form id="reauth-form" onSubmit={onSubmit} noValidate className="space-y-4">
        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : null}
        {pendingToken ? (
          <Field label="Verification code" htmlFor="reauth-code">
            <Input
              id="reauth-code"
              autoComplete="one-time-code"
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="tabular tracking-[0.3em]"
            />
          </Field>
        ) : (
          <Field label="Password" htmlFor="reauth-password">
            <PasswordInput
              id="reauth-password"
              autoComplete="current-password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        )}
      </form>
    </Dialog>
  );

  return { withReauth, reauthDialog };
}

export function isReauthCancelled(error: unknown): boolean {
  return isApiError(error, "REAUTH_CANCELLED");
}
