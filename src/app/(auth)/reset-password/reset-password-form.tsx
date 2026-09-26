"use client";

import { CheckCircle2, KeyRound, Link2Off } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/ui/alert";
import { api, ApiError, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { Field } from "@/ui/input";
import { PasswordInput } from "@/ui/password-input";
import { AuthHeader } from "../auth-ui";

export function ResetPasswordForm({ minPasswordLength }: { minPasswordLength: number }) {
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [linkInvalid, setLinkInvalid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  if (!token || linkInvalid) {
    return (
      <div>
        <AuthHeader
          icon={<Link2Off aria-hidden="true" />}
          title="This link has expired"
          description="Reset links work once, for 30 minutes. Request a new one and use the newest email."
        />
        <Button asChild size="lg" className="w-full">
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div>
        <AuthHeader
          icon={<CheckCircle2 aria-hidden="true" />}
          title="Password updated"
          description="For your security we signed you out on every device. Sign in with your new password."
        />
        <Button asChild size="lg" className="w-full">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    );
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const found: typeof errors = {};
    if (password.length < minPasswordLength)
      found.password = `Use at least ${minPasswordLength} characters.`;
    if (confirm !== password) found.confirm = "The two passwords don't match.";
    setErrors(found);
    setError(null);
    if (Object.keys(found).length > 0) return;
    setSubmitting(true);
    try {
      await api("/api/v1/auth/password/reset/confirm", {
        method: "POST",
        body: { token, newPassword: password },
      });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors().newPassword) {
        setErrors({ password: err.fieldErrors().newPassword });
      } else if (err instanceof ApiError && err.status === 400) {
        setLinkInvalid(true);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <AuthHeader
        icon={<KeyRound aria-hidden="true" />}
        title="Choose a new password"
        description="You'll be signed out everywhere else once it's saved."
      />
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : null}
        <Field
          label="New password"
          htmlFor="password"
          error={errors.password}
          hint={`At least ${minPasswordLength} characters.`}
        >
          <PasswordInput
            id="password"
            autoComplete="new-password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm" error={errors.confirm}>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Save new password
        </Button>
      </form>
    </>
  );
}
