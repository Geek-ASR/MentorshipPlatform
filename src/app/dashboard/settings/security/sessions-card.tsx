"use client";

import { Laptop, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { Dialog } from "@/ui/dialog";
import { formatFromNow, formatLongDate } from "@/ui/format";
import { isReauthCancelled, useReauth } from "@/ui/reauth";
import { Skeleton } from "@/ui/skeleton";
import { ErrorState } from "@/ui/states";
import { useToast } from "@/ui/toast";
import { invalidateViewer } from "@/ui/viewer";

type SessionSummary = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  ipPrefix: string | null;
  isCurrent: boolean;
};

/**
 * Signed-in devices (ASVS 5.0 V7.5.2): every active session with when it started and was last
 * used, and a one-step "sign out everywhere". Sessions carry no device names — only a hashed
 * user agent and a network prefix are stored (docs/07 §6.2), so the list says exactly that.
 */
export function SessionsCard({ email }: { email: string }) {
  const router = useRouter();
  const toast = useToast();
  const { withReauth, reauthDialog } = useReauth(email);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [now] = useState(() => new Date());
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<SessionSummary[]>("/api/v1/auth/sessions")
      .then((rows) => {
        if (cancelled) return;
        setSessions(
          [...rows].sort(
            (a, b) =>
              Number(b.isCurrent) - Number(a.isCurrent) ||
              new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime(),
          ),
        );
      })
      .catch((err) => {
        if (!cancelled) setLoadError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  function retry() {
    setLoadError(null);
    setSessions(null);
    setAttempt((n) => n + 1);
  }

  async function signOutOne(sessionId: string) {
    setRevoking(sessionId);
    try {
      await withReauth(() => api(`/api/v1/auth/sessions/${sessionId}/revoke`, { method: "POST" }));
      setSessions((current) => current?.filter((s) => s.id !== sessionId) ?? null);
      toast({ title: "Device signed out", description: "That session can no longer be used." });
    } catch (err) {
      if (!isReauthCancelled(err))
        toast({
          title: "Couldn't sign that device out",
          description: errorMessage(err),
          tone: "error",
        });
    } finally {
      setRevoking(null);
    }
  }

  async function signOutEverywhere() {
    setBusy(true);
    try {
      await withReauth(() => api("/api/v1/auth/sessions/revoke-all", { method: "POST" }));
      invalidateViewer();
      router.replace("/sign-in?reason=signed_out");
      router.refresh();
    } catch (err) {
      setBusy(false);
      if (!isReauthCancelled(err))
        toast({
          title: "Couldn't sign out other devices",
          description: errorMessage(err),
          tone: "error",
        });
    }
  }

  if (loadError) {
    return (
      <ErrorState
        title="We couldn't load your devices"
        description={loadError}
        action={
          <Button variant="secondary" onClick={retry}>
            Try again
          </Button>
        }
        className="border-0 py-6"
      />
    );
  }

  return (
    <div>
      {sessions === null ? (
        <div aria-hidden="true" className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-64" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-line">
          {sessions.map((session) => (
            <li key={session.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink/5 text-ink-muted">
                <Laptop className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink">
                  Signed in {formatLongDate(new Date(session.createdAt))}
                  {session.isCurrent ? (
                    <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                      This device
                    </span>
                  ) : null}
                </p>
                <p className="text-sm text-ink-muted">
                  Last active {formatFromNow(new Date(session.lastSeenAt), now)}
                  {session.ipPrefix ? ` · network ${session.ipPrefix}` : ""}
                </p>
              </div>
              {session.isCurrent ? null : (
                <Button
                  size="sm"
                  variant="ghost"
                  loading={revoking === session.id}
                  disabled={revoking !== null && revoking !== session.id}
                  onClick={() => void signOutOne(session.id)}
                  aria-label={`Sign out the device signed in ${formatLongDate(new Date(session.createdAt))}`}
                >
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        <p className="text-sm text-ink-muted">
          Lost a device, or see something you don&apos;t recognise?
        </p>
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          <LogOut aria-hidden="true" /> Sign out everywhere
        </Button>
      </div>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        dismissible={!busy}
        size="sm"
        title="Sign out on every device?"
        description="Including this one. You'll need your password to sign back in."
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={signOutEverywhere} loading={busy}>
              Sign out everywhere
            </Button>
          </>
        }
      />
      {reauthDialog}
    </div>
  );
}
