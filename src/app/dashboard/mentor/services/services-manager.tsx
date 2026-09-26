"use client";

import { AlertTriangle, Link2, MessageSquareText, Pencil, Plus, Trash2, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/ui/alert";
import { api, ApiError, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Dialog } from "@/ui/dialog";
import { formatDuration, formatMoney } from "@/ui/format";
import { Checkbox, Field, Input, Textarea } from "@/ui/input";
import { EmptyState } from "@/ui/states";
import { useToast } from "@/ui/toast";

export type ManagedService = {
  id: string;
  title: string;
  description: string | null;
  isActive: boolean;
  meetingUrl: string | null;
  intakeQuestions: { id: string; label: string }[];
  prices: { durationMin: number; priceMinor: number; currency: string }[];
};

function QuestionsEditor({
  questions,
  onChange,
}: {
  questions: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium text-ink">
        Questions for students{" "}
        <span className="font-normal text-ink-muted">(optional, up to 5)</span>
      </legend>
      <p className="mb-3 text-sm text-ink-muted">
        Students can answer these when they book, so you can prepare.
      </p>
      <div className="space-y-2">
        {questions.map((question, index) => (
          <div key={index} className="flex gap-2">
            <Input
              aria-label={`Question ${index + 1}`}
              value={question}
              maxLength={200}
              placeholder="e.g. Which programmes are you considering?"
              onChange={(e) =>
                onChange(questions.map((q, i) => (i === index ? e.target.value : q)))
              }
            />
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove question ${index + 1}`}
              onClick={() => onChange(questions.filter((_, i) => i !== index))}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        ))}
      </div>
      {questions.length < 5 ? (
        <Button
          variant="link"
          size="sm"
          className="mt-2"
          onClick={() => onChange([...questions, ""])}
        >
          <Plus aria-hidden="true" /> Add a question
        </Button>
      ) : null}
    </fieldset>
  );
}

function MeetingLinkField({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <Field
      label="Meeting link"
      htmlFor="meeting-url"
      error={error}
      hint="Google Meet, Zoom, Teams, Whereby or Jitsi. Students only see it through the Join button, inside the join window — never in emails."
    >
      <Input
        id="meeting-url"
        type="url"
        placeholder="https://meet.google.com/…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

/**
 * Session types a mentor offers (docs/22 §3 J2 "Services & prices"). Price and length changes
 * would change what students already see and booked, so this pass creates and hides types; the
 * meeting link, questions and visibility can change any time.
 */
export function ServicesManager({
  services,
  allowedDurations,
  volunteer,
}: {
  services: ManagedService[];
  allowedDurations: number[];
  volunteer: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  // Create
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [prices, setPrices] = useState<Record<number, string>>({});
  const [meetingUrl, setMeetingUrl] = useState("");
  const [questions, setQuestions] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function resetCreate() {
    setTitle("");
    setDescription("");
    setPrices({});
    setMeetingUrl("");
    setQuestions([]);
    setErrors({});
    setFormError(null);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const chosen = Object.entries(prices).filter(([, v]) => v !== "");
    const found: Record<string, string> = {};
    if (!title.trim()) found.title = "Give this session type a name.";
    if (chosen.length === 0) found.prices = "Choose at least one length.";
    if (!volunteer && chosen.some(([, v]) => !/^\d{1,6}$/.test(v.trim())))
      found.prices = "Enter prices in whole rupees.";
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setBusy(true);
    setFormError(null);
    try {
      await api("/api/v1/me/mentor/services", {
        method: "POST",
        body: {
          title: title.trim(),
          ...(description.trim() ? { descriptionMd: description.trim() } : {}),
          prices: chosen.map(([duration, rupees]) => ({
            durationMin: Number(duration),
            priceMinor: volunteer ? 0 : Number(rupees) * 100,
            currency: "INR",
          })),
          ...(meetingUrl.trim() ? { meetingUrl: meetingUrl.trim() } : {}),
          intakeQuestions: questions.filter((q) => q.trim()).map((label) => ({ label })),
        },
      });
      setCreateOpen(false);
      resetCreate();
      toast({
        title: "Session type added",
        description: "Students can book it inside your weekly hours.",
      });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.errors.length > 0) setErrors(err.fieldErrors());
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Edit
  const [editing, setEditing] = useState<ManagedService | null>(null);
  const [editLink, setEditLink] = useState("");
  const [editQuestions, setEditQuestions] = useState<string[]>([]);
  const [editError, setEditError] = useState<string | undefined>();

  function openEdit(service: ManagedService) {
    setEditing(service);
    setEditLink(service.meetingUrl ?? "");
    setEditQuestions(service.intakeQuestions.map((q) => q.label));
    setEditError(undefined);
  }

  async function saveEdit(event: FormEvent) {
    event.preventDefault();
    if (!editing) return;
    setBusy(true);
    setEditError(undefined);
    try {
      await api(`/api/v1/me/mentor/services/${editing.id}`, {
        method: "PATCH",
        body: {
          meetingUrl: editLink.trim() ? editLink.trim() : null,
          intakeQuestions: editQuestions.filter((q) => q.trim()).map((label) => ({ label })),
        },
      });
      setEditing(null);
      toast({ title: "Saved" });
      router.refresh();
    } catch (err) {
      setEditError(
        err instanceof ApiError ? (err.fieldErrors().meetingUrl ?? err.message) : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }

  async function setActive(service: ManagedService, isActive: boolean) {
    try {
      await api(`/api/v1/me/mentor/services/${service.id}`, {
        method: "PATCH",
        body: { isActive },
      });
      toast({ title: isActive ? `${service.title} is bookable` : `${service.title} is hidden` });
      router.refresh();
    } catch (err) {
      toast({ title: "Couldn't update", description: errorMessage(err), tone: "error" });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)}>
          <Plus aria-hidden="true" /> New session type
        </Button>
      </div>

      {services.length === 0 ? (
        <EmptyState
          icon={<Video className="size-8" aria-hidden="true" />}
          title="No session types yet"
          description="Add what you offer — for example a 30-minute intro call and a 60-minute application review."
          action={<Button onClick={() => setCreateOpen(true)}>Add your first</Button>}
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {services.map((service) => (
            <li
              key={service.id}
              className={cn(
                "flex flex-col rounded-[var(--radius-card)] border bg-surface p-5",
                service.isActive ? "border-line" : "border-dashed border-line opacity-80",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold text-ink">{service.title}</p>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                    service.isActive ? "bg-success/10 text-success" : "bg-ink/5 text-ink-muted",
                  )}
                >
                  {service.isActive ? "Bookable" : "Hidden"}
                </span>
              </div>
              {service.description ? (
                <p className="mt-1 line-clamp-2 text-sm text-ink-muted">{service.description}</p>
              ) : null}
              <ul className="mt-3 flex flex-wrap gap-2 text-sm">
                {service.prices.map((price) => (
                  <li
                    key={price.durationMin}
                    className="tabular rounded-full bg-canvas px-2.5 py-0.5 ring-1 ring-line"
                  >
                    {formatDuration(price.durationMin)} ·{" "}
                    <span className="font-semibold">
                      {formatMoney(price.priceMinor, price.currency)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-4 space-y-1.5 text-sm">
                {service.meetingUrl ? (
                  <p className="flex items-center gap-2 text-ink-muted">
                    <Link2 className="size-4 text-success" aria-hidden="true" />
                    <span className="truncate">{new URL(service.meetingUrl).host}</span>
                  </p>
                ) : (
                  <p className="flex items-center gap-2 text-warning">
                    <AlertTriangle className="size-4" aria-hidden="true" /> No meeting link —
                    students can&apos;t join
                  </p>
                )}
                <p className="flex items-center gap-2 text-ink-muted">
                  <MessageSquareText className="size-4" aria-hidden="true" />
                  {service.intakeQuestions.length === 0
                    ? "No questions for students"
                    : `${service.intakeQuestions.length} ${service.intakeQuestions.length === 1 ? "question" : "questions"} for students`}
                </p>
              </div>
              <div className="mt-auto flex flex-wrap gap-2 pt-5">
                <Button size="sm" variant="secondary" onClick={() => openEdit(service)}>
                  <Pencil aria-hidden="true" /> Link & questions
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void setActive(service, !service.isActive)}
                >
                  {service.isActive ? "Hide" : "Make bookable"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        dismissible={!busy}
        size="lg"
        title="New session type"
        description={
          volunteer
            ? "As a volunteer mentor, your sessions are free for students."
            : "Prices are what students pay — no fees are added on top."
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="create-service" loading={busy}>
              Add session type
            </Button>
          </>
        }
      >
        <form id="create-service" onSubmit={create} noValidate className="space-y-5">
          {formError ? (
            <Alert tone="danger" live>
              {formError}
            </Alert>
          ) : null}
          <Field label="Name" htmlFor="service-title" error={errors.title}>
            <Input
              id="service-title"
              placeholder="e.g. Germany MSc application review"
              value={title}
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label="What happens in the session" htmlFor="service-description" optional>
            <Textarea
              id="service-description"
              rows={3}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
          <fieldset>
            <legend className="mb-2 text-sm font-medium text-ink">
              Lengths{volunteer ? "" : " and prices"}
            </legend>
            <div className="space-y-2">
              {allowedDurations.map((duration) => {
                const on = prices[duration] !== undefined;
                return (
                  <div key={duration} className="flex flex-wrap items-center gap-3">
                    <label className="flex w-28 items-center gap-2 text-sm text-ink">
                      <Checkbox
                        checked={on}
                        onChange={(e) =>
                          setPrices((p) => {
                            const next = { ...p };
                            if (e.target.checked) next[duration] = volunteer ? "0" : "";
                            else delete next[duration];
                            return next;
                          })
                        }
                      />
                      {formatDuration(duration)}
                    </label>
                    {on && !volunteer ? (
                      <div className="relative w-40">
                        <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-ink-muted">
                          ₹
                        </span>
                        <Input
                          aria-label={`Price for ${formatDuration(duration)} in rupees`}
                          inputMode="numeric"
                          className="tabular pl-7"
                          placeholder="0"
                          value={prices[duration]}
                          onChange={(e) =>
                            setPrices((p) => ({
                              ...p,
                              [duration]: e.target.value.replace(/[^\d]/g, ""),
                            }))
                          }
                        />
                      </div>
                    ) : on ? (
                      <span className="text-sm text-success">Free</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {errors.prices ? <p className="mt-2 text-sm text-danger">{errors.prices}</p> : null}
          </fieldset>
          <MeetingLinkField value={meetingUrl} onChange={setMeetingUrl} error={errors.meetingUrl} />
          <QuestionsEditor questions={questions} onChange={setQuestions} />
        </form>
      </Dialog>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        dismissible={!busy}
        size="lg"
        title={editing ? editing.title : ""}
        description="The meeting link applies to every booking of this type, including ones already made."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" form="edit-service" loading={busy}>
              Save
            </Button>
          </>
        }
      >
        <form id="edit-service" onSubmit={saveEdit} noValidate className="space-y-5">
          <MeetingLinkField value={editLink} onChange={setEditLink} error={editError} />
          <QuestionsEditor questions={editQuestions} onChange={setEditQuestions} />
        </form>
      </Dialog>
    </div>
  );
}
