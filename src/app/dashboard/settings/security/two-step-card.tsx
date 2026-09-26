"use client";

import { Check, Copy, ShieldCheck, ShieldOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Alert } from "@/ui/alert";
import { api, ApiError, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { Field, Input } from "@/ui/input";
import { isReauthCancelled, useReauth } from "@/ui/reauth";
import { useToast } from "@/ui/toast";

type Stage =
  | { kind: "idle" }
  | { kind: "setup"; secret: string; otpauthUri: string }
  | { kind: "codes"; codes: string[] };

function groupSecret(secret: string): string {
  return secret.replace(/(.{4})/g, "$1 ").trim();
}

/**
 * Authenticator-app 2-step verification (docs/07 §4). Setup shows the key for manual entry plus an
 * `otpauth://` link that opens the authenticator app directly on a phone; a QR code is a planned
 * follow-up (it needs an encoder we don't ship yet).
 */
export function TwoStepCard({
  email,
  enabled: initiallyEnabled,
}: {
  email: string;
  enabled: boolean;
}) {
  const toast = useToast();
  const { withReauth, reauthDialog } = useReauth(email);
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [copied, setCopied] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const result = await withReauth(() =>
        api<{ otpauthUri: string }>("/api/v1/auth/mfa/enroll/start", { method: "POST" }),
      );
      const secret = new URL(result.otpauthUri).searchParams.get("secret") ?? "";
      setStage({ kind: "setup", secret, otpauthUri: result.otpauthUri });
    } catch (err) {
      if (!isReauthCancelled(err))
        toast({ title: "Couldn't start setup", description: errorMessage(err), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    const clean = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(clean)) {
      setCodeError("Enter the 6-digit code from your app.");
      return;
    }
    setCodeError(undefined);
    setBusy(true);
    try {
      const result = await withReauth(() =>
        api<{ backupCodes: string[] }>("/api/v1/auth/mfa/enroll/confirm", {
          method: "POST",
          body: { code: clean },
        }),
      );
      setEnabled(true);
      setCode("");
      setStage({ kind: "codes", codes: result.backupCodes });
    } catch (err) {
      if (isReauthCancelled(err)) return;
      if (err instanceof ApiError && err.status < 500)
        setCodeError("That code didn't match. Try the newest one.");
      else toast({ title: "Couldn't turn it on", description: errorMessage(err), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    try {
      await withReauth(() => api("/api/v1/auth/mfa/disable", { method: "POST" }));
      setEnabled(false);
      setConfirmOff(false);
      toast({ title: "2-step verification is off" });
    } catch (err) {
      if (!isReauthCancelled(err))
        toast({ title: "Couldn't turn it off", description: errorMessage(err), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-full ${enabled ? "bg-success/10 text-success" : "bg-ink/5 text-ink-muted"}`}
          >
            {enabled ? (
              <ShieldCheck className="size-5" aria-hidden="true" />
            ) : (
              <ShieldOff className="size-5" aria-hidden="true" />
            )}
          </span>
          <div>
            <p className="font-medium text-ink">{enabled ? "On — authenticator app" : "Off"}</p>
            <p className="mt-0.5 text-sm text-ink-muted">
              {enabled
                ? "You'll enter a code from your app when you sign in."
                : "Add a code from an authenticator app to every sign-in."}
            </p>
          </div>
        </div>
        {stage.kind === "idle" ? (
          enabled ? (
            <Button variant="secondary" onClick={() => setConfirmOff(true)}>
              Turn off
            </Button>
          ) : (
            <Button onClick={start} loading={busy}>
              Turn on
            </Button>
          )
        ) : null}
      </div>

      {stage.kind === "setup" ? (
        <div className="mt-6 space-y-5 border-t border-line pt-6">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-ink">
            <li>
              Open an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).
            </li>
            <li>
              Add an account using this setup key, or{" "}
              <a href={stage.otpauthUri} className="font-medium text-primary hover:underline">
                open it in your authenticator app
              </a>{" "}
              on this phone.
            </li>
            <li>Enter the 6-digit code the app shows.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-control)] border border-dashed border-line bg-canvas px-4 py-3">
            <code className="tabular flex-1 font-mono text-base tracking-wider text-ink select-all">
              {groupSecret(stage.secret)}
            </code>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                await navigator.clipboard.writeText(stage.secret).catch(() => undefined);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
              {copied ? "Copied" : "Copy key"}
            </Button>
          </div>
          <form onSubmit={confirm} noValidate className="flex flex-wrap items-end gap-3">
            <Field
              label="Code from the app"
              htmlFor="setup-code"
              error={codeError}
              className="w-48"
            >
              <Input
                id="setup-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="tabular tracking-[0.25em]"
              />
            </Field>
            <Button type="submit" loading={busy}>
              Verify and turn on
            </Button>
            <Button variant="ghost" onClick={() => setStage({ kind: "idle" })} disabled={busy}>
              Cancel
            </Button>
          </form>
        </div>
      ) : null}

      {stage.kind === "codes" ? (
        <div className="mt-6 border-t border-line pt-6">
          <Alert tone="success" title="2-step verification is on">
            Save these recovery codes somewhere safe. Each works once if you lose your phone — this
            is the only time we&apos;ll show them.
          </Alert>
          <ul className="tabular mt-4 grid grid-cols-2 gap-2 font-mono text-sm sm:grid-cols-3">
            {stage.codes.map((c) => (
              <li
                key={c}
                className="rounded-[var(--radius-control)] border border-line bg-canvas px-3 py-2 text-center"
              >
                {c}
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                navigator.clipboard.writeText(stage.codes.join("\n")).catch(() => undefined)
              }
            >
              <Copy aria-hidden="true" /> Copy codes
            </Button>
            <Button onClick={() => setStage({ kind: "idle" })}>I&apos;ve saved them</Button>
          </div>
        </div>
      ) : null}

      <Dialog
        open={confirmOff}
        onClose={() => setConfirmOff(false)}
        dismissible={!busy}
        size="sm"
        title="Turn off 2-step verification?"
        description="Signing in will only need your password. You can turn it back on any time."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOff(false)} disabled={busy}>
              Keep it on
            </Button>
            <Button variant="destructive" onClick={turnOff} loading={busy}>
              Turn off
            </Button>
          </>
        }
      />
      {reauthDialog}
    </div>
  );
}
