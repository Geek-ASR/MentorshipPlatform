"use client";

import { KeyRound, MailCheck } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert } from "@/ui/alert";
import { api, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/input";
import { AuthHeader, AuthSwitch } from "../auth-ui";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setFieldError("Enter the email address you signed up with.");
      return;
    }
    setFieldError(undefined);
    setError(null);
    setSubmitting(true);
    try {
      await api("/api/v1/auth/password/reset/request", { method: "POST", body: { email: value } });
      setSentTo(value);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (sentTo) {
    return (
      <div>
        <AuthHeader
          icon={<MailCheck aria-hidden="true" />}
          title="Check your inbox"
          description={
            <>
              If an account exists for <strong className="text-ink">{sentTo}</strong>, we&apos;ve
              sent a link to choose a new password. It works once, for 30 minutes.
            </>
          }
        />
        <Button asChild size="lg" variant="secondary" className="w-full">
          <Link href="/sign-in">Back to sign in</Link>
        </Button>
        <p className="mt-6 text-center text-sm text-ink-muted">
          No email after a few minutes?{" "}
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="font-semibold text-primary hover:underline"
          >
            Try again
          </button>
        </p>
      </div>
    );
  }

  return (
    <>
      <AuthHeader
        icon={<KeyRound aria-hidden="true" />}
        title="Forgot your password?"
        description="Enter your account email and we'll send you a link to choose a new one."
      />
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : null}
        <Field label="Email" htmlFor="email" error={fieldError}>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            autoFocus
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Send reset link
        </Button>
      </form>
      <AuthSwitch prompt="Remembered it?" href="/sign-in" label="Back to sign in" />
    </>
  );
}
