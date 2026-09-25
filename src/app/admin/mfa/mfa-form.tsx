"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/ui/button";
import { Field, Input } from "@/ui/input";

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    ...init,
  });
  const data = (await response.json().catch(() => null)) as
    (T & { title?: string; detail?: string; code?: string }) | null;
  if (!response.ok) {
    const error = new Error(data?.detail ?? data?.title ?? "Something went wrong.");
    (error as Error & { code?: string }).code = data?.code;
    throw error;
  }
  return data as T;
}

type Stage =
  | { kind: "loading" }
  | { kind: "not_enrolled" }
  | { kind: "enrolling"; otpauthUri: string; secret: string }
  | { kind: "backup_codes"; codes: string[] }
  | { kind: "verify" }
  | { kind: "reauth"; email: string; resume: "start" | "confirm"; pendingCode?: string };

export function MfaStepUpForm() {
  const router = useRouter();
  const returnTo = useSearchParams().get("returnTo") ?? "/admin";
  const [stage, setStage] = useState<Stage>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api<{ enabled: boolean }>("/api/v1/auth/mfa/status")
      .then((status) => setStage(status.enabled ? { kind: "verify" } : { kind: "not_enrolled" }))
      .catch(() => setStage({ kind: "not_enrolled" }));
  }, []);

  async function withReauthFallback(action: () => Promise<void>, resume: "start" | "confirm") {
    try {
      await action();
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      if (code === "REAUTH_REQUIRED") {
        const me = await api<{ email: string }>("/api/v1/auth/me").catch(() => ({ email: "" }));
        setStage({ kind: "reauth", email: me.email, resume });
        return;
      }
      throw err;
    }
  }

  async function startEnrollment() {
    setError(null);
    setSubmitting(true);
    try {
      await withReauthFallback(async () => {
        const result = await api<{ otpauthUri: string }>("/api/v1/auth/mfa/enroll/start", {
          method: "POST",
        });
        const secret = new URL(result.otpauthUri).searchParams.get("secret") ?? "";
        setStage({ kind: "enrolling", otpauthUri: result.otpauthUri, secret });
      }, "start");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start MFA setup.");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmEnrollment(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await withReauthFallback(async () => {
        const result = await api<{ backupCodes: string[] }>("/api/v1/auth/mfa/enroll/confirm", {
          method: "POST",
          body: JSON.stringify({ code }),
        });
        setStage({ kind: "backup_codes", codes: result.backupCodes });
      }, "confirm");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect code.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitStepUp(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api("/api/v1/auth/mfa/step-up", { method: "POST", body: JSON.stringify({ code }) });
      router.push(returnTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect code.");
    } finally {
      setSubmitting(false);
    }
  }

  async function reauthenticate(event: FormEvent) {
    if (stage.kind !== "reauth") return;
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api("/api/v1/auth/sign-in", {
        method: "POST",
        body: JSON.stringify({ email: stage.email, password }),
      });
      setStage({ kind: "not_enrolled" });
      if (stage.resume === "start") await startEnrollment();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect password.");
    } finally {
      setSubmitting(false);
    }
  }

  if (stage.kind === "loading") return <p className="text-sm text-ink-muted">Loading…</p>;

  if (stage.kind === "reauth") {
    return (
      <form onSubmit={reauthenticate} className="space-y-4">
        <p className="text-sm text-ink-muted">Confirm your password to continue.</p>
        <Field label="Password" htmlFor="reauth-password" error={error ?? undefined}>
          <Input
            id="reauth-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Confirming…" : "Confirm"}
        </Button>
      </form>
    );
  }

  if (stage.kind === "not_enrolled") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Your account doesn&apos;t have multi-factor authentication set up yet. Staff access
          requires it.
        </p>
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        <Button onClick={startEnrollment} disabled={submitting} className="w-full">
          {submitting ? "Starting…" : "Set up authenticator app"}
        </Button>
      </div>
    );
  }

  if (stage.kind === "enrolling") {
    return (
      <form onSubmit={confirmEnrollment} className="space-y-4">
        <p className="text-sm text-ink-muted">
          Add this account to your authenticator app (Google Authenticator, 1Password, Authy…),
          entering the key manually if it can&apos;t scan a QR code.
        </p>
        <div className="rounded-[var(--radius-control)] border border-line bg-primary-soft/40 p-3">
          <p className="text-xs text-ink-muted">Setup key</p>
          <p className="tabular font-mono text-sm break-all text-ink">{stage.secret}</p>
        </div>
        <Field label="Enter the 6-digit code" htmlFor="confirm-code" error={error ?? undefined}>
          <Input
            id="confirm-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Confirming…" : "Confirm"}
        </Button>
      </form>
    );
  }

  if (stage.kind === "backup_codes") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          Save these backup codes somewhere safe. Each can be used once if you lose access to your
          authenticator app. They won&apos;t be shown again.
        </p>
        <ul className="tabular grid grid-cols-2 gap-2 rounded-[var(--radius-control)] border border-line bg-primary-soft/40 p-4 font-mono text-sm">
          {stage.codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
        <Button
          className="w-full"
          onClick={() => {
            router.push(returnTo);
            router.refresh();
          }}
        >
          Continue to admin
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submitStepUp} className="space-y-4">
      <Field label="Authentication code" htmlFor="step-up-code" error={error ?? undefined}>
        <Input
          id="step-up-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </Field>
      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "Verifying…" : "Verify"}
      </Button>
    </form>
  );
}
