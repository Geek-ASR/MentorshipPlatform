"use client";

import { CalendarOff, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { Alert } from "@/ui/alert";
import { api, ApiError, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { formatLongDate } from "@/ui/format";
import { Field, Input, Label, Select } from "@/ui/input";
import { listTimeZones } from "@/ui/time-zones";
import { useToast } from "@/ui/toast";
import { useHydrated } from "@/ui/use-hydrated";

export type Settings = {
  timezone: string;
  slotStepMin: number;
  bufferAfterMin: number;
  minNoticeMin: number;
  maxAdvanceDays: number;
  maxSessionsPerDay: number;
};
export type Rule = { id: string; weekday: number; startLocal: string; endLocal: string };
export type TimeOff = { id: string; start: string; end: string };

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** UTC instant of local midnight on `date` (YYYY-MM-DD) in `timeZone` — Intl only, no library. */
function zonedMidnight(date: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d);
  const offset = (instant: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).formatToParts(new Date(instant));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return (
      Date.UTC(
        get("year"),
        get("month") - 1,
        get("day"),
        get("hour"),
        get("minute"),
        get("second"),
      ) - instant
    );
  };
  const first = guess - offset(guess);
  return new Date(guess - offset(first));
}

function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function AvailabilityEditor({
  settings,
  rules,
  timeOff,
}: {
  settings: Settings;
  rules: Rule[];
  timeOff: TimeOff[];
}) {
  const router = useRouter();
  const toast = useToast();
  const hydrated = useHydrated();
  const zones = useMemo(
    () => (hydrated ? listTimeZones(settings.timezone) : [settings.timezone]),
    [hydrated, settings.timezone],
  );

  // --- Preferences ---
  const [prefs, setPrefs] = useState(settings);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const dirty = JSON.stringify(prefs) !== JSON.stringify(settings);

  async function savePrefs(event: FormEvent) {
    event.preventDefault();
    setSavingPrefs(true);
    try {
      await api("/api/v1/me/mentor/scheduling", { method: "PATCH", body: prefs });
      toast({ title: "Booking rules saved" });
      router.refresh();
    } catch (err) {
      toast({ title: "Couldn't save", description: errorMessage(err), tone: "error" });
    } finally {
      setSavingPrefs(false);
    }
  }

  // --- Weekly hours ---
  const [adding, setAdding] = useState<number | null>(null);
  const [from, setFrom] = useState("18:00");
  const [to, setTo] = useState("21:00");
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [busyRule, setBusyRule] = useState(false);

  async function addRule(weekday: number) {
    if (from >= to) {
      setRuleError("The end has to be after the start.");
      return;
    }
    setBusyRule(true);
    setRuleError(null);
    try {
      await api("/api/v1/me/mentor/availability-rules", {
        method: "POST",
        body: {
          weekday,
          startLocal: from,
          endLocal: to,
          effectiveFrom: todayIn(settings.timezone),
        },
      });
      setAdding(null);
      router.refresh();
    } catch (err) {
      setRuleError(
        err instanceof ApiError && err.errors[0] ? err.errors[0].message : errorMessage(err),
      );
    } finally {
      setBusyRule(false);
    }
  }

  async function removeRule(rule: Rule) {
    try {
      await api(`/api/v1/me/mentor/availability-rules/${rule.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      toast({
        title: "Couldn't remove those hours",
        description: errorMessage(err),
        tone: "error",
      });
    }
  }

  // --- Time off ---
  const [offFrom, setOffFrom] = useState("");
  const [offTo, setOffTo] = useState("");
  const [offError, setOffError] = useState<string | null>(null);
  const [busyOff, setBusyOff] = useState(false);

  async function addTimeOff(event: FormEvent) {
    event.preventDefault();
    if (!offFrom || !offTo || offTo < offFrom) {
      setOffError("Choose a start date and an end date on or after it.");
      return;
    }
    setBusyOff(true);
    setOffError(null);
    try {
      const start = zonedMidnight(offFrom, settings.timezone);
      const endDay = new Date(`${offTo}T00:00:00Z`);
      endDay.setUTCDate(endDay.getUTCDate() + 1);
      const end = zonedMidnight(endDay.toISOString().slice(0, 10), settings.timezone);
      await api("/api/v1/me/mentor/availability-exceptions", {
        method: "POST",
        body: {
          kind: "unavailable",
          start: start.toISOString(),
          end: end.toISOString(),
          localSpec: { fromDate: offFrom, toDate: offTo },
        },
      });
      setOffFrom("");
      setOffTo("");
      toast({ title: "Time off added", description: "Nobody can book you on those days." });
      router.refresh();
    } catch (err) {
      setOffError(errorMessage(err));
    } finally {
      setBusyOff(false);
    }
  }

  async function removeTimeOff(item: TimeOff) {
    try {
      await api(`/api/v1/me/mentor/availability-exceptions/${item.id}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      toast({ title: "Couldn't remove", description: errorMessage(err), tone: "error" });
    }
  }

  return (
    <div className="space-y-10">
      <section
        aria-labelledby="weekly-heading"
        className="rounded-[var(--radius-sheet)] border border-line bg-surface p-6"
      >
        <h2 id="weekly-heading" className="text-lg font-semibold text-ink">
          Weekly hours
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          In your time zone ({settings.timezone.replaceAll("_", " ")}). Students see these converted
          to theirs.
        </p>
        <ul className="mt-5 divide-y divide-line">
          {WEEKDAYS.map((name, index) => {
            const weekday = index + 1;
            const dayRules = rules
              .filter((r) => r.weekday === weekday)
              .sort((a, b) => a.startLocal.localeCompare(b.startLocal));
            return (
              <li key={name} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                <p className="w-28 shrink-0 text-sm font-medium text-ink">{name}</p>
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  {dayRules.length === 0 && adding !== weekday ? (
                    <span className="text-sm text-ink-muted">Unavailable</span>
                  ) : null}
                  {dayRules.map((rule) => (
                    <span
                      key={rule.id}
                      className="tabular inline-flex items-center gap-1 rounded-full bg-primary-soft py-1 pr-1 pl-3 text-sm text-primary"
                    >
                      {rule.startLocal}–{rule.endLocal}
                      <button
                        type="button"
                        onClick={() => void removeRule(rule)}
                        aria-label={`Remove ${name} ${rule.startLocal} to ${rule.endLocal}`}
                        className="flex size-6 items-center justify-center rounded-full hover:bg-primary/15"
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    </span>
                  ))}
                  {adding === weekday ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="time"
                        aria-label={`${name} from`}
                        value={from}
                        step={900}
                        onChange={(e) => setFrom(e.target.value)}
                        className="h-9 w-32"
                      />
                      <span className="text-ink-muted">to</span>
                      <Input
                        type="time"
                        aria-label={`${name} to`}
                        value={to}
                        step={900}
                        onChange={(e) => setTo(e.target.value)}
                        className="h-9 w-32"
                      />
                      <Button size="sm" onClick={() => void addRule(weekday)} loading={busyRule}>
                        Add
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setAdding(null)}>
                        Cancel
                      </Button>
                      {ruleError ? <p className="w-full text-sm text-danger">{ruleError}</p> : null}
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAdding(weekday);
                        setRuleError(null);
                      }}
                      aria-label={`Add hours on ${name}`}
                    >
                      <Plus aria-hidden="true" /> Add hours
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        aria-labelledby="rules-heading"
        className="rounded-[var(--radius-sheet)] border border-line bg-surface p-6"
      >
        <h2 id="rules-heading" className="text-lg font-semibold text-ink">
          Booking rules
        </h2>
        <form
          onSubmit={savePrefs}
          className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Field label="Your time zone" htmlFor="tz" className="sm:col-span-2 lg:col-span-3">
            <Select
              id="tz"
              value={prefs.timezone}
              onChange={(e) => setPrefs({ ...prefs, timezone: e.target.value })}
            >
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Minimum notice"
            htmlFor="notice"
            hint="How soon before a session students can still book it."
          >
            <Select
              id="notice"
              value={prefs.minNoticeMin}
              onChange={(e) => setPrefs({ ...prefs, minNoticeMin: Number(e.target.value) })}
            >
              {[60, 120, 240, 480, 720, 1440, 2880].map((m) => (
                <option key={m} value={m}>
                  {m < 1440 ? `${m / 60} hours` : `${m / 1440} ${m === 1440 ? "day" : "days"}`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Book up to" htmlFor="advance" hint="How far ahead your calendar opens.">
            <Select
              id="advance"
              value={prefs.maxAdvanceDays}
              onChange={(e) => setPrefs({ ...prefs, maxAdvanceDays: Number(e.target.value) })}
            >
              {[7, 14, 30, 60, 90].map((d) => (
                <option key={d} value={d}>
                  {d} days ahead
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Break after each session" htmlFor="buffer">
            <Select
              id="buffer"
              value={prefs.bufferAfterMin}
              onChange={(e) => setPrefs({ ...prefs, bufferAfterMin: Number(e.target.value) })}
            >
              {[0, 10, 15, 30, 45, 60].map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "No break" : `${m} minutes`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Sessions per day, at most" htmlFor="per-day">
            <Select
              id="per-day"
              value={prefs.maxSessionsPerDay}
              onChange={(e) => setPrefs({ ...prefs, maxSessionsPerDay: Number(e.target.value) })}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Start times every"
            htmlFor="step"
            hint="Spacing of the times students can pick."
          >
            <Select
              id="step"
              value={prefs.slotStepMin}
              onChange={(e) => setPrefs({ ...prefs, slotStepMin: Number(e.target.value) })}
            >
              {[15, 30, 60].map((m) => (
                <option key={m} value={m}>
                  {m} minutes
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex items-end justify-end sm:col-span-2 lg:col-span-3">
            <Button type="submit" loading={savingPrefs} disabled={!dirty}>
              Save booking rules
            </Button>
          </div>
        </form>
      </section>

      <section
        aria-labelledby="off-heading"
        className="rounded-[var(--radius-sheet)] border border-line bg-surface p-6"
      >
        <h2 id="off-heading" className="text-lg font-semibold text-ink">
          Time off
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Days you can&apos;t take bookings, whatever your weekly hours say.
        </p>
        {timeOff.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {timeOff.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line px-4 py-2 text-sm"
              >
                <span className="flex items-center gap-2 text-ink">
                  <CalendarOff className="size-4 text-ink-muted" aria-hidden="true" />
                  {formatLongDate(new Date(item.start), settings.timezone)} –{" "}
                  {formatLongDate(new Date(new Date(item.end).getTime() - 1), settings.timezone)}
                </span>
                <Button size="sm" variant="ghost" onClick={() => void removeTimeOff(item)}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <form onSubmit={addTimeOff} noValidate className="mt-5 flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="off-from">From</Label>
            <Input
              id="off-from"
              type="date"
              value={offFrom}
              onChange={(e) => setOffFrom(e.target.value)}
              className="w-44"
            />
          </div>
          <div>
            <Label htmlFor="off-to">To</Label>
            <Input
              id="off-to"
              type="date"
              value={offTo}
              onChange={(e) => setOffTo(e.target.value)}
              className="w-44"
            />
          </div>
          <Button type="submit" variant="secondary" loading={busyOff}>
            Add time off
          </Button>
        </form>
        {offError ? (
          <Alert tone="danger" className="mt-3" live>
            {offError}
          </Alert>
        ) : null}
      </section>
    </div>
  );
}
