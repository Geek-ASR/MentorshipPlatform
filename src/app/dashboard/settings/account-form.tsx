"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { Field, Input, Select } from "@/ui/input";
import { useToast } from "@/ui/toast";
import { currentZoneName, listTimeZones } from "@/ui/time-zones";
import { useBrowserTimeZone, useHydrated } from "@/ui/use-hydrated";

/** Browsers may report a legacy alias ("Asia/Calcutta") for a saved canonical zone ("Asia/Kolkata"). */
function sameZone(a: string, b: string): boolean {
  const canonical = (zone: string) => {
    try {
      return new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone;
    } catch {
      return zone;
    }
  };
  return a === b || canonical(a) === canonical(b);
}

function zoneOffsetLabel(zone: string): string {
  try {
    const part = new Intl.DateTimeFormat("en-GB", { timeZone: zone, timeZoneName: "shortOffset" })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName")?.value;
    return part ? `${zone.replaceAll("_", " ")} (${part.replace("GMT", "UTC")})` : zone;
  } catch {
    return zone;
  }
}

export function AccountForm({ displayName, timezone }: { displayName: string; timezone: string }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState(displayName);
  const [zone, setZone] = useState(timezone);
  const [errors, setErrors] = useState<{ displayName?: string; timezone?: string }>({});
  const [saving, setSaving] = useState(false);
  // The zone list and offsets depend on the runtime's ICU data, which can differ between the
  // server and the browser — render just the saved zone until hydrated, then the full list, so
  // hydration always matches.
  const hydrated = useHydrated();
  const zones = useMemo(() => (hydrated ? listTimeZones(timezone) : null), [hydrated, timezone]);
  const browserZone = useBrowserTimeZone("");
  const deviceZone = hydrated && browserZone ? currentZoneName(browserZone) : null;
  const dirty = name.trim() !== displayName || zone !== timezone;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setErrors({ displayName: "Enter your name." });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api("/api/v1/me/account", {
        method: "PATCH",
        body: { displayName: name.trim(), timezone: zone },
      });
      toast({ title: "Profile saved" });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.errors.length > 0) setErrors(err.fieldErrors());
      else
        toast({
          title: "Couldn't save your changes",
          description: errorMessage(err),
          tone: "error",
        });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <Field
        label="Name"
        htmlFor="displayName"
        error={errors.displayName}
        hint="Shown to mentors you book and on reviews you write."
      >
        <Input
          id="displayName"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
        />
      </Field>
      <Field
        label="Time zone"
        htmlFor="timezone"
        error={errors.timezone}
        hint={
          deviceZone && !sameZone(deviceZone, zone) ? (
            <>
              This device is set to {deviceZone.replaceAll("_", " ")}.{" "}
              <button
                type="button"
                onClick={() => setZone(deviceZone)}
                className="font-medium text-primary hover:underline"
              >
                Use it
              </button>
            </>
          ) : (
            "Every session time is shown in this zone."
          )
        }
      >
        <Select id="timezone" value={zone} onChange={(e) => setZone(e.target.value)}>
          {(zones ?? [zone]).map((z) => (
            <option key={z} value={z}>
              {zones ? zoneOffsetLabel(z) : z.replaceAll("_", " ")}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex justify-end">
        <Button type="submit" loading={saving} disabled={!dirty}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
