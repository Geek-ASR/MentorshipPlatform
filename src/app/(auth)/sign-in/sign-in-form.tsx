"use client";

import { ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { brand } from "@/config/brand";
import { Alert } from "@/ui/alert";
import { api, ApiError, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/input";
import { normalizeMfaCode } from "@/ui/mfa-code";
import { safeReturnTo } from "@/ui/navigation";
import { PasswordInput } from "@/ui/password-input";
import { invalidateViewer } from "@/ui/viewer";
import { AuthHeader, AuthSwitch } from "../auth-ui";

type SignInResponse = { outcome: "signed_in" } | { outcome: "mfa_required"; pendingToken: string };

const REASONS: Record<string, string> = {
  reauth: "For your security, please sign in again to continue.",
  expired: "Your session ended. Sign in again to pick up where you left off.",
  signed_out: "You've been signed out on every device.",
};

export function SignInForm({ googleEnabled }: { googleEnabled: boolean }) {
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));
  const notice = REASONS[params.get("reason") ?? ""];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function finish() {
    invalidateViewer();
    router.replace(returnTo);
    router.refresh();
  }

  async function onPasswordSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const result = await api<SignInResponse>("/api/v1/auth/sign-in", {
        method: "POST",
        body: { email: email.trim(), password },
      });
      if (result.outcome === "mfa_required") {
        setPendingToken(result.pendingToken);
        setSubmitting(false);
        return;
      }
      finish();
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === "INVALID_CREDENTIALS"
          ? "That email and password don't match an account. Check both and try again."
          : errorMessage(err),
      );
      setSubmitting(false);
    }
  }

  async function onCodeSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || !pendingToken) return;
    setError(null);
    setSubmitting(true);
    try {
      await api("/api/v1/auth/sign-in/mfa", {
        method: "POST",
        body: { pendingToken, code: normalizeMfaCode(code) },
      });
      finish();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status < 500
          ? "That code didn't work. Codes change every 30 seconds — try the newest one."
          : errorMessage(err),
      );
      setSubmitting(false);
    }
  }

  if (pendingToken) {
    return (
      <>
        <AuthHeader
          icon={<ShieldCheck aria-hidden="true" />}
          title="Two-step verification"
          description={
            useRecoveryCode
              ? "Enter one of the recovery codes you saved when you turned on 2-step verification. Each works once."
              : "Enter the 6-digit code from your authenticator app."
          }
        />
        <form onSubmit={onCodeSubmit} noValidate className="space-y-5">
          {error ? (
            <Alert tone="danger" live>
              {error}
            </Alert>
          ) : null}
          <Field label={useRecoveryCode ? "Recovery code" : "Verification code"} htmlFor="code">
            <Input
              key={useRecoveryCode ? "recovery" : "totp"}
              id="code"
              name="code"
              inputMode={useRecoveryCode ? "text" : "numeric"}
              autoCapitalize={useRecoveryCode ? "characters" : "off"}
              autoComplete="one-time-code"
              autoFocus
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="tabular text-lg tracking-[0.3em] uppercase"
            />
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={submitting}>
            Verify and sign in
          </Button>
          <button
            type="button"
            onClick={() => {
              setUseRecoveryCode((v) => !v);
              setCode("");
              setError(null);
            }}
            className="w-full text-center text-sm font-medium text-primary hover:underline"
          >
            {useRecoveryCode
              ? "Use my authenticator app instead"
              : "Lost your phone? Use a recovery code"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingToken(null);
              setCode("");
              setError(null);
            }}
            className="w-full text-center text-sm text-ink-muted hover:text-ink"
          >
            Use a different account
          </button>
        </form>
      </>
    );
  }

  return (
    <>
      <AuthHeader
        title="Welcome back"
        description={`Sign in to book sessions and manage your ${brand.name} account.`}
      />
      <form onSubmit={onPasswordSubmit} className="space-y-5">
        {notice && !error ? <Alert tone="info">{notice}</Alert> : null}
        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : null}
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          labelAction={
            <Link
              href="/forgot-password"
              className="text-sm font-medium text-primary hover:underline"
            >
              Forgot password?
            </Link>
          }
        >
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          Sign in
        </Button>
      </form>

      {googleEnabled ? (
        <div className="mt-6">
          <div className="flex items-center gap-3 text-xs text-ink-muted">
            <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
          </div>
          <Button asChild variant="secondary" size="lg" className="mt-6 w-full">
            <Link href="/sign-up?method=google">Continue with Google</Link>
          </Button>
        </div>
      ) : null}

      <AuthSwitch prompt={`New to ${brand.name}?`} href="/sign-up" label="Create an account" />
    </>
  );
}
