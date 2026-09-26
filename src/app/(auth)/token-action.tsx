"use client";

import { CheckCircle2, Link2Off, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { api, ApiError, errorMessage } from "@/ui/api";
import { Alert } from "@/ui/alert";
import { Button } from "@/ui/button";
import { AuthHeader } from "./auth-ui";

type Outcome = { title: string; description: ReactNode; href: string; label: string };

/**
 * Landing page for a one-time emailed link (docs/07 §3): the token is read from the URL and posted
 * to its API. `confirm` shows an explicit button first — used for account-changing links, so an
 * email scanner that renders the page can never trigger the change by itself.
 */
export function TokenAction({
  endpoint,
  intro,
  confirm,
  success,
  failure,
}: {
  endpoint: string;
  intro: { title: string; description: ReactNode; icon: ReactNode };
  confirm?: { label: string; tone?: "primary" | "destructive" };
  success: Outcome;
  failure: Outcome;
}) {
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"idle" | "working" | "done" | "failed" | "error">(
    token ? (confirm ? "idle" : "working") : "failed",
  );
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  // Every state change here happens after the request settles, never synchronously in an effect.
  async function post(value: string) {
    try {
      await api(endpoint, { method: "POST", body: { token: value } });
      setState("done");
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429) {
        setState("failed");
      } else {
        started.current = false;
        setError(errorMessage(err));
        setState("error");
      }
    }
  }

  /** Button path: the confirm step, or a retry after a network/server error. */
  function run() {
    if (!token || started.current) return;
    started.current = true;
    setState("working");
    void post(token);
  }

  useEffect(() => {
    // Auto-submit links start in "working"; the ref keeps React's development double-invoke from
    // spending a one-time token twice.
    if (confirm || !token || started.current) return;
    started.current = true;
    void post(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount, by design.
  }, []);

  if (state === "done" || state === "failed") {
    const outcome = state === "done" ? success : failure;
    return (
      <div>
        <AuthHeader
          icon={
            state === "done" ? <CheckCircle2 aria-hidden="true" /> : <Link2Off aria-hidden="true" />
          }
          title={outcome.title}
          description={outcome.description}
        />
        <Button asChild size="lg" className="w-full">
          <Link href={outcome.href}>{outcome.label}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div>
      <AuthHeader
        icon={
          state === "working" ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : (
            intro.icon
          )
        }
        title={intro.title}
        description={intro.description}
      />
      {state === "error" && error ? (
        <Alert tone="danger" live className="mb-5">
          {error}
        </Alert>
      ) : null}
      {confirm || state === "error" ? (
        <Button
          size="lg"
          variant={confirm?.tone === "destructive" ? "destructive" : "primary"}
          className="w-full"
          loading={state === "working"}
          onClick={run}
        >
          {state === "error" ? "Try again" : confirm!.label}
        </Button>
      ) : (
        <p role="status" className="text-sm text-ink-muted">
          This only takes a moment…
        </p>
      )}
    </div>
  );
}
