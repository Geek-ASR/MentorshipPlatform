"use client";

import { useState, type FormEvent } from "react";
import { api, ApiError, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { Field, Input, Textarea } from "@/ui/input";
import { useToast } from "@/ui/toast";

const VISIBILITY = [
  {
    value: "logged_in",
    label: "Signed-in members",
    description: "Anyone with an account, including mentors you haven't booked yet.",
  },
  {
    value: "booked_mentors_only",
    label: "Only mentors I book",
    description: "Mentors see it once you have a session with them.",
  },
  { value: "public", label: "Everyone", description: "Visible to anyone, even signed out." },
] as const;

type Visibility = (typeof VISIBILITY)[number]["value"];

export function StudentProfileForm({
  initial,
}: {
  initial: { headline: string; bioMd: string; visibility: Visibility };
}) {
  const toast = useToast();
  const [headline, setHeadline] = useState(initial.headline);
  const [bio, setBio] = useState(initial.bioMd);
  const [visibility, setVisibility] = useState<Visibility>(initial.visibility);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setErrors({});
    setSaving(true);
    try {
      await api("/api/v1/me/student-profile", {
        method: "POST",
        body: { headline: headline.trim(), bioMd: bio.trim(), visibility },
      });
      toast({ title: "About you saved" });
    } catch (err) {
      if (err instanceof ApiError && err.errors.length > 0) setErrors(err.fieldErrors());
      else toast({ title: "Couldn't save", description: errorMessage(err), tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <Field
        label="Headline"
        htmlFor="headline"
        optional
        error={errors.headline}
        hint="e.g. “Final-year CSE student, aiming for an MSc in Germany in 2027”"
      >
        <Input
          id="headline"
          value={headline}
          maxLength={120}
          onChange={(e) => setHeadline(e.target.value)}
        />
      </Field>
      <Field
        label="What you're working towards"
        htmlFor="bio"
        optional
        error={errors.bioMd}
        hint="A few lines help mentors prepare. Don't include phone numbers or other contact details."
      >
        <Textarea
          id="bio"
          rows={4}
          value={bio}
          maxLength={4000}
          onChange={(e) => setBio(e.target.value)}
        />
      </Field>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-ink">Who can see this</legend>
        <div className="space-y-2">
          {VISIBILITY.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border border-line p-3 has-checked:border-primary has-checked:bg-primary-soft/50"
            >
              <input
                type="radio"
                name="visibility"
                value={option.value}
                checked={visibility === option.value}
                onChange={() => setVisibility(option.value)}
                className="mt-1 accent-primary"
              />
              <span>
                <span className="block text-sm font-medium text-ink">{option.label}</span>
                <span className="block text-sm text-ink-muted">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end">
        <Button type="submit" loading={saving}>
          Save
        </Button>
      </div>
    </form>
  );
}
