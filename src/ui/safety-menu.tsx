"use client";

import { Ban, EllipsisVertical, Flag } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { Alert } from "./alert";
import { api, errorMessage } from "./api";
import { Button } from "./button";
import { Dialog } from "./dialog";
import { Field, Select, Textarea } from "./input";
import { Menu, MenuItem } from "./menu";
import { useToast } from "./toast";
import { signInHref } from "./navigation";
import { REPORT_REASONS } from "./trust-labels";
import { useViewer } from "./viewer";

export type ReportTarget = {
  type: "user" | "mentor_profile" | "event" | "review" | "session";
  id: string;
  /** What is being reported, for the dialog title: "Ananya's profile", "this event". */
  label: string;
};

/**
 * Report form (docs/10 §7.1). The server always acknowledges, whether or not the target exists,
 * so the confirmation never reveals anything; the reporter hears the outcome later without
 * details of any action taken against someone else.
 */
export function ReportDialog({
  open,
  onClose,
  target,
}: {
  open: boolean;
  onClose: () => void;
  target: ReportTarget;
}) {
  const reasonId = useId();
  const detailsId = useId();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    onClose();
    if (sent) {
      setSent(false);
      setReason("");
      setDetails("");
    }
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!reason) {
      setError("Choose what's wrong so we can send it to the right people.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api("/api/v1/reports", {
        method: "POST",
        body: {
          targetType: target.type,
          targetId: target.id,
          reasonCode: reason,
          ...(details.trim() ? { details: details.trim() } : {}),
        },
      });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      dismissible={!sending}
      title={sent ? "Thanks for telling us" : `Report ${target.label}`}
      description={
        sent
          ? undefined
          : "Reports are private — the person won't know who sent it. Our team reviews every one."
      }
      footer={
        sent ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="ghost" onClick={close} disabled={sending}>
              Cancel
            </Button>
            <Button type="submit" form={`${reasonId}-form`} loading={sending}>
              Send report
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <div className="space-y-3 text-sm text-ink/90">
          <p>
            Our team will review it — urgent safety reports first. We&apos;ll let you know when
            it&apos;s been looked at, though we don&apos;t share what action was taken against
            someone else.
          </p>
          <p className="text-ink-muted">
            If you or someone else is in immediate danger, contact local emergency services.
          </p>
        </div>
      ) : (
        <form id={`${reasonId}-form`} onSubmit={onSubmit} className="space-y-4" noValidate>
          {error ? (
            <Alert tone="danger" live>
              {error}
            </Alert>
          ) : null}
          <Field label="What's wrong?" htmlFor={reasonId}>
            <Select id={reasonId} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose a reason</option>
              {REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Anything else we should know?"
            htmlFor={detailsId}
            optional
            hint="What happened and when. Don't include passwords or payment details."
          >
            <Textarea
              id={detailsId}
              rows={4}
              maxLength={2000}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
            />
          </Field>
        </form>
      )}
    </Dialog>
  );
}

/**
 * The "⋯" menu on a profile or booking: report, and block or unblock the person (docs/10 §7.1,
 * docs/07 blocking). Blocking stops new bookings in both directions; existing ones are unaffected.
 */
export function SafetyMenu({
  report,
  block,
}: {
  report: ReportTarget;
  block?: { userId: string; name: string; blocked: boolean };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const viewerState = useViewer();
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const firstName = block?.name.split(" ")[0] ?? "";
  const viewer = viewerState.status === "ready" ? viewerState.viewer : undefined;
  // Statically rendered pages show the menu to everyone; signed-out visitors sign in first.
  const signedOut = viewerState.status === "ready" && viewer === null;
  const requireSignIn = (open: () => void) => () =>
    signedOut ? router.push(signInHref(pathname)) : open();
  if (viewer && block && viewer.id === block.userId) return null;

  async function toggleBlock() {
    if (!block) return;
    setBusy(true);
    try {
      await api(`/api/v1/users/${block.userId}/block`, {
        method: block.blocked ? "DELETE" : "POST",
        body: block.blocked ? undefined : {},
      });
      setBlockOpen(false);
      toast({ title: block.blocked ? `${firstName} unblocked` : `${firstName} blocked` });
      router.refresh();
    } catch (err) {
      toast({ title: "That didn't work", description: errorMessage(err), tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Menu
        label="More options"
        trigger={<EllipsisVertical className="size-4" aria-hidden="true" />}
        triggerClassName="inline-flex size-9 items-center justify-center rounded-full text-ink-muted hover:bg-canvas hover:text-ink"
      >
        <MenuItem onSelect={requireSignIn(() => setReportOpen(true))}>
          <Flag className="size-4" aria-hidden="true" /> Report {report.label}
        </MenuItem>
        {block ? (
          <MenuItem
            tone={block.blocked ? undefined : "danger"}
            onSelect={requireSignIn(() =>
              block.blocked ? void toggleBlock() : setBlockOpen(true),
            )}
          >
            <Ban className="size-4" aria-hidden="true" />{" "}
            {block.blocked ? `Unblock ${firstName}` : `Block ${firstName}`}
          </MenuItem>
        ) : null}
      </Menu>
      <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} target={report} />
      {block ? (
        <Dialog
          open={blockOpen}
          onClose={() => setBlockOpen(false)}
          dismissible={!busy}
          size="sm"
          title={`Block ${firstName}?`}
          description={`Neither of you will be able to book the other. Sessions already booked aren't cancelled — cancel them from the booking if you need to. ${firstName} isn't told.`}
          footer={
            <>
              <Button variant="ghost" onClick={() => setBlockOpen(false)} disabled={busy}>
                Cancel
              </Button>
              <Button variant="destructive" loading={busy} onClick={() => void toggleBlock()}>
                Block
              </Button>
            </>
          }
        />
      ) : null}
    </>
  );
}
