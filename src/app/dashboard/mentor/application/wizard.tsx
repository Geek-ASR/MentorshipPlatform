"use client";

import { Briefcase, Check, GraduationCap, Link2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/ui/alert";
import { api, ApiError, errorMessage } from "@/ui/api";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Checkbox, Field, Input, Select, Textarea } from "@/ui/input";
import { useToast } from "@/ui/toast";

type Option = { id: string; name: string };
type Affiliation = {
  id: string;
  kind: "education" | "work";
  title: string;
  organizationName: string | null;
  isCurrent: boolean;
};
type LanguageChoice = { termId: string; proficiency: "native" | "fluent" | "conversational" };

export type WizardInitial = {
  status: string;
  payoutMode: string;
  headline: string;
  bio: string;
  affiliations: Affiliation[];
  expertiseIds: string[];
  languages: LanguageChoice[];
  eligibility: { countryIso2: string; residencyStatus: string } | null;
  links: { id: string; kind: string; url: string }[];
  missing: string[];
};

type Options = {
  universities: Option[];
  companies: Option[];
  categories: (Option & { parentId: string | null })[];
  languages: Option[];
  countries: { iso2: string; name: string }[];
};

const STEPS = [
  { id: "about", title: "About you", sections: ["headline", "bio"] },
  { id: "background", title: "Education & work", sections: ["affiliations"] },
  { id: "topics", title: "Topics & languages", sections: ["expertise", "languages"] },
  { id: "eligibility", title: "Eligibility", sections: ["eligibility"] },
  { id: "links", title: "Links", sections: [] },
  { id: "review", title: "Review & submit", sections: [] },
] as const;

const RESIDENCY = [
  {
    value: "citizen_or_pr",
    label: "Citizen or permanent resident",
    hint: "of the country you live in",
  },
  {
    value: "work_authorised",
    label: "On a work visa or permit",
    hint: "that allows freelance or side work",
  },
  { value: "student_visa", label: "On a student visa", hint: "many don't allow paid side work" },
  { value: "not_authorised", label: "Not allowed to work", hint: "for any reason" },
  { value: "other", label: "Something else", hint: "we'll treat it cautiously" },
];

function StepFooter({
  onBack,
  saving,
  submitLabel = "Save and continue",
  disabled,
}: {
  onBack?: () => void;
  saving: boolean;
  submitLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
      {onBack ? (
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      ) : (
        <span />
      )}
      <Button type="submit" loading={saving} disabled={disabled}>
        {submitLabel}
      </Button>
    </div>
  );
}

function StepCard({
  title,
  description,
  children,
}: {
  title: string;
  description: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[var(--radius-sheet)] border border-line bg-surface p-6 sm:p-8">
      <h2 className="font-serif text-2xl font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-1.5 text-ink-muted">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

/**
 * The mentor application (docs/22 §3 J2): every step saves to the server as you go, so it resumes
 * wherever it was left — on another device too. Submitting is the only irreversible step.
 */
export function ApplicationWizard({
  initial,
  options,
}: {
  initial: WizardInitial;
  options: Options;
}) {
  const router = useRouter();
  const toast = useToast();
  const draft = initial.status === "draft";
  const [missing, setMissing] = useState(initial.missing);
  const firstIncomplete = STEPS.findIndex((s) => s.sections.some((sec) => missing.includes(sec)));
  const [step, setStep] = useState(
    draft ? (firstIncomplete === -1 ? STEPS.length - 1 : firstIncomplete) : 0,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = (sections: readonly string[]) =>
    sections.length > 0 && sections.every((s) => !missing.includes(s));
  const markDone = (...sections: string[]) =>
    setMissing((m) => m.filter((x) => !sections.includes(x)));

  async function save(action: () => Promise<unknown>, sections: string[], advance = true) {
    setSaving(true);
    setError(null);
    try {
      await action();
      markDone(...sections);
      if (advance) setStep((s) => Math.min(STEPS.length - 1, s + 1));
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  // --- About ---
  const [headline, setHeadline] = useState(initial.headline);
  const [bio, setBio] = useState(initial.bio);

  // --- Background ---
  const [affiliations, setAffiliations] = useState(initial.affiliations);
  const [aff, setAff] = useState({
    kind: "education" as "education" | "work",
    orgId: "",
    title: "",
    isCurrent: false,
  });
  const [affError, setAffError] = useState<string | null>(null);

  async function addAffiliation() {
    if (!aff.title.trim()) {
      setAffError(aff.kind === "education" ? "Enter your degree and subject." : "Enter your role.");
      return;
    }
    setAffError(null);
    setSaving(true);
    try {
      const row = await api<{
        id: string;
        kind: "education" | "work";
        title: string;
        isCurrent: boolean;
      }>("/api/v1/me/mentor-application/affiliations", {
        method: "POST",
        body: {
          kind: aff.kind,
          title: aff.title.trim(),
          isCurrent: aff.isCurrent,
          ...(aff.orgId
            ? aff.kind === "education"
              ? { universityId: aff.orgId }
              : { companyId: aff.orgId }
            : {}),
        },
      });
      const orgs = aff.kind === "education" ? options.universities : options.companies;
      setAffiliations((list) => [
        ...list,
        { ...row, organizationName: orgs.find((o) => o.id === aff.orgId)?.name ?? null },
      ]);
      setAff({ kind: aff.kind, orgId: "", title: "", isCurrent: false });
      markDone("affiliations");
      router.refresh();
    } catch (err) {
      setAffError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeAffiliation(id: string) {
    try {
      await api(`/api/v1/me/mentor-application/affiliations/${id}`, { method: "DELETE" });
      setAffiliations((list) => {
        const next = list.filter((a) => a.id !== id);
        if (next.length === 0) setMissing((m) => [...new Set([...m, "affiliations"])]);
        return next;
      });
      router.refresh();
    } catch (err) {
      toast({ title: "Couldn't remove it", description: errorMessage(err), tone: "error" });
    }
  }

  // --- Topics & languages ---
  const [expertise, setExpertise] = useState<string[]>(initial.expertiseIds);
  const [languages, setLanguages] = useState<LanguageChoice[]>(initial.languages);
  const categoryTree = useMemo(() => {
    const roots = options.categories.filter((c) => !c.parentId);
    return roots.map((root) => {
      const children = options.categories.filter((c) => c.parentId === root.id);
      const groups = children
        .map((child) => ({
          group: child,
          leaves: options.categories.filter((c) => c.parentId === child.id),
        }))
        .filter((g) => g.leaves.length > 0);
      const loose = children.filter(
        (child) => !options.categories.some((c) => c.parentId === child.id),
      );
      return { root, loose, groups };
    });
  }, [options.categories]);

  // --- Eligibility ---
  const [country, setCountry] = useState(initial.eligibility?.countryIso2 ?? "");
  const [residency, setResidency] = useState(initial.eligibility?.residencyStatus ?? "");
  const [payoutMode, setPayoutMode] = useState(initial.payoutMode);

  // --- Links ---
  const [links, setLinks] = useState(initial.links);
  const [link, setLink] = useState({ kind: "linkedin", url: "" });
  const [linkError, setLinkError] = useState<string | undefined>();

  async function addLink() {
    setLinkError(undefined);
    setSaving(true);
    try {
      const row = await api<{ id: string; kind: string; url: string }>(
        "/api/v1/me/mentor-application/links",
        {
          method: "POST",
          body: { kind: link.kind, url: link.url.trim() },
        },
      );
      setLinks((l) => [...l, row]);
      setLink({ kind: link.kind, url: "" });
    } catch (err) {
      setLinkError(
        err instanceof ApiError ? (err.fieldErrors().url ?? err.message) : errorMessage(err),
      );
    } finally {
      setSaving(false);
    }
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      await api("/api/v1/me/mentor-application/submit", { method: "POST" });
      toast({
        title: "Application submitted",
        description: "We'll email you once it's been reviewed.",
      });
      router.push("/dashboard/mentor");
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  const current = STEPS[step]!;
  const back = step > 0 ? () => setStep(step - 1) : undefined;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav aria-label="Application steps" className="lg:sticky lg:top-24 lg:h-fit">
        <p className="mb-3 text-sm font-medium text-ink-muted">Mentor application</p>
        <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1">
          {STEPS.map((s, index) => {
            const complete =
              s.id === "links" ? links.length > 0 : s.id === "review" ? !draft : done(s.sections);
            return (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setStep(index)}
                  aria-current={index === step ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-left text-sm transition-colors",
                    index === step
                      ? "bg-primary-soft font-medium text-primary"
                      : "text-ink-muted hover:bg-canvas hover:text-ink",
                  )}
                >
                  <span
                    className={cn(
                      "tabular flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      complete
                        ? "bg-success text-white"
                        : index === step
                          ? "bg-primary text-on-primary"
                          : "bg-ink/10 text-ink-muted",
                    )}
                  >
                    {complete ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
                  </span>
                  <span className="whitespace-nowrap">{s.title}</span>
                  {complete ? <span className="sr-only">(done)</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="min-w-0 space-y-4">
        {!draft ? (
          <Alert
            tone="info"
            title={
              initial.status === "approved"
                ? "Your application was approved"
                : "Your application has been submitted"
            }
          >
            {initial.status === "approved"
              ? "Changes you save here update your public profile straight away."
              : "You can still update your profile below — changes appear on your public profile once you're listed."}
          </Alert>
        ) : null}
        {error ? (
          <Alert tone="danger" live>
            {error}
          </Alert>
        ) : null}

        {current.id === "about" ? (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void save(
                () =>
                  api("/api/v1/me/mentor-application/profile", {
                    method: "PATCH",
                    body: { headline: headline.trim(), bioMd: bio.trim() },
                  }),
                ["headline", "bio"],
              );
            }}
          >
            <StepCard
              title="About you"
              description="This is the top of your public profile. Be specific — it's what students scan first."
            >
              <div className="space-y-5">
                <Field
                  label="Headline"
                  htmlFor="headline"
                  hint={`e.g. “MSc Informatics, TU Munich · Software engineer in Munich” — ${120 - headline.length} characters left`}
                >
                  <Input
                    id="headline"
                    required
                    maxLength={120}
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                  />
                </Field>
                <Field
                  label="About"
                  htmlFor="bio"
                  hint="What you did, where you are now, and what you can help with. No phone numbers or other contact details."
                >
                  <Textarea
                    id="bio"
                    required
                    rows={8}
                    maxLength={8000}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                  />
                </Field>
              </div>
              <StepFooter saving={saving} disabled={!headline.trim() || !bio.trim()} />
            </StepCard>
          </form>
        ) : null}

        {current.id === "background" ? (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (affiliations.length > 0) setStep(step + 1);
              else setAffError("Add at least one university or workplace.");
            }}
          >
            <StepCard
              title="Education & work"
              description="Add where you studied and worked. You'll confirm at least one with your university or work email next."
            >
              {affiliations.length > 0 ? (
                <ul className="mb-6 divide-y divide-line rounded-[var(--radius-card)] border border-line">
                  {affiliations.map((a) => {
                    const Icon = a.kind === "work" ? Briefcase : GraduationCap;
                    return (
                      <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                        <Icon className="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-ink">{a.title}</p>
                          <p className="truncate text-sm text-ink-muted">
                            {a.organizationName ?? "Organisation not listed"}
                            {a.isCurrent ? " · Current" : ""}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remove ${a.title}`}
                          onClick={() => void removeAffiliation(a.id)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              <fieldset className="rounded-[var(--radius-card)] border border-dashed border-line p-4 sm:p-5">
                <legend className="px-1 text-sm font-medium text-ink">Add one</legend>
                <div className="flex gap-2" role="radiogroup" aria-label="Kind">
                  {(["education", "work"] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      role="radio"
                      aria-checked={aff.kind === kind}
                      onClick={() => setAff({ ...aff, kind, orgId: "" })}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-[var(--radius-control)] border px-3 py-2 text-sm",
                        aff.kind === kind
                          ? "border-primary bg-primary-soft text-primary"
                          : "border-line text-ink hover:border-primary/40",
                      )}
                    >
                      {kind === "education" ? (
                        <GraduationCap className="size-4" aria-hidden="true" />
                      ) : (
                        <Briefcase className="size-4" aria-hidden="true" />
                      )}
                      {kind === "education" ? "Education" : "Work"}
                    </button>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    label={aff.kind === "education" ? "University" : "Company"}
                    htmlFor="aff-org"
                  >
                    <Select
                      id="aff-org"
                      value={aff.orgId}
                      onChange={(e) => setAff({ ...aff, orgId: e.target.value })}
                    >
                      <option value="">Not in the list</option>
                      {(aff.kind === "education" ? options.universities : options.companies).map(
                        (o) => (
                          <option key={o.id} value={o.id}>
                            {o.name}
                          </option>
                        ),
                      )}
                    </Select>
                  </Field>
                  <Field
                    label={aff.kind === "education" ? "Degree and subject" : "Role"}
                    htmlFor="aff-title"
                    error={affError ?? undefined}
                  >
                    <Input
                      id="aff-title"
                      placeholder={
                        aff.kind === "education" ? "MSc Informatics" : "Software Engineer"
                      }
                      value={aff.title}
                      maxLength={160}
                      onChange={(e) => setAff({ ...aff, title: e.target.value })}
                    />
                  </Field>
                </div>
                <label className="mt-4 flex items-center gap-2 text-sm text-ink">
                  <Checkbox
                    checked={aff.isCurrent}
                    onChange={(e) => setAff({ ...aff, isCurrent: e.target.checked })}
                  />
                  {aff.kind === "education" ? "I'm studying here now" : "I work here now"}
                </label>
                <p className="mt-3 text-xs text-ink-muted">
                  Only listed organisations can be verified by email. If yours is missing, add it
                  anyway and tell support.
                </p>
                <Button
                  variant="secondary"
                  className="mt-4"
                  onClick={() => void addAffiliation()}
                  loading={saving}
                >
                  <Plus aria-hidden="true" /> Add
                </Button>
              </fieldset>
              <StepFooter onBack={back} saving={false} submitLabel="Continue" />
            </StepCard>
          </form>
        ) : null}

        {current.id === "topics" ? (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (expertise.length === 0 || languages.length === 0) {
                setError("Choose at least one topic and one language.");
                return;
              }
              void save(async () => {
                await api("/api/v1/me/mentor-application/expertise", {
                  method: "PUT",
                  body: { termIds: expertise },
                });
                await api("/api/v1/me/mentor-application/languages", {
                  method: "PUT",
                  body: { languages },
                });
              }, ["expertise", "languages"]);
            }}
          >
            <StepCard
              title="Topics & languages"
              description="Students filter by these. Pick what you can genuinely help with — up to 20 topics."
            >
              <div className="space-y-6">
                {categoryTree.map(({ root, loose, groups }) => (
                  <fieldset key={root.id}>
                    <legend className="text-sm font-semibold text-ink">{root.name}</legend>
                    {loose.length > 0 ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {loose.map((term) => (
                          <TopicChip
                            key={term.id}
                            term={term}
                            selected={expertise}
                            onChange={setExpertise}
                          />
                        ))}
                      </div>
                    ) : null}
                    {groups.map(({ group, leaves }) => (
                      <div key={group.id} className="mt-4">
                        <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">
                          {group.name}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {leaves.map((term) => (
                            <TopicChip
                              key={term.id}
                              term={term}
                              selected={expertise}
                              onChange={setExpertise}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </fieldset>
                ))}
                <p className="tabular text-sm text-ink-muted">{expertise.length} of 20 chosen</p>

                <fieldset className="border-t border-line pt-6">
                  <legend className="text-sm font-semibold text-ink">
                    Languages you can mentor in
                  </legend>
                  <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {options.languages.map((language) => {
                      const chosen = languages.find((l) => l.termId === language.id);
                      return (
                        <li
                          key={language.id}
                          className="flex items-center gap-3 rounded-[var(--radius-control)] border border-line px-3 py-2"
                        >
                          <label className="flex flex-1 items-center gap-2 text-sm text-ink">
                            <Checkbox
                              checked={Boolean(chosen)}
                              onChange={(e) =>
                                setLanguages((list) =>
                                  e.target.checked
                                    ? [...list, { termId: language.id, proficiency: "fluent" }]
                                    : list.filter((l) => l.termId !== language.id),
                                )
                              }
                            />
                            {language.name}
                          </label>
                          {chosen ? (
                            <select
                              aria-label={`${language.name} level`}
                              value={chosen.proficiency}
                              onChange={(e) =>
                                setLanguages((list) =>
                                  list.map((l) =>
                                    l.termId === language.id
                                      ? {
                                          ...l,
                                          proficiency: e.target
                                            .value as LanguageChoice["proficiency"],
                                        }
                                      : l,
                                  ),
                                )
                              }
                              className="rounded-[6px] border border-line bg-surface px-2 py-1 text-xs text-ink"
                            >
                              <option value="native">Native</option>
                              <option value="fluent">Fluent</option>
                              <option value="conversational">Conversational</option>
                            </select>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              </div>
              <StepFooter onBack={back} saving={saving} />
            </StepCard>
          </form>
        ) : null}

        {current.id === "eligibility" ? (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              if (!country || !residency) {
                setError("Choose your country and your status there.");
                return;
              }
              void save(async () => {
                const result = await api<{ payoutMode: string }>(
                  "/api/v1/me/mentor-application/eligibility",
                  {
                    method: "POST",
                    body: { countryIso2: country, residencyStatus: residency },
                  },
                );
                setPayoutMode(result.payoutMode);
              }, ["eligibility"]);
            }}
          >
            <StepCard
              title="Where you live and can work"
              description="This decides whether you mentor as a paid or a volunteer mentor. We ask so nobody breaks their visa conditions."
            >
              <div className="space-y-5">
                <Field label="Country you live in" htmlFor="country">
                  <Select id="country" value={country} onChange={(e) => setCountry(e.target.value)}>
                    <option value="">Choose a country</option>
                    {options.countries.map((c) => (
                      <option key={c.iso2} value={c.iso2}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-ink">Your status there</legend>
                  <div className="space-y-2">
                    {RESIDENCY.map((option) => (
                      <label
                        key={option.value}
                        className="flex cursor-pointer items-start gap-3 rounded-[var(--radius-control)] border border-line p-3 has-checked:border-primary has-checked:bg-primary-soft/50"
                      >
                        <input
                          type="radio"
                          name="residency"
                          value={option.value}
                          checked={residency === option.value}
                          onChange={() => setResidency(option.value)}
                          className="mt-1 accent-primary"
                        />
                        <span>
                          <span className="block text-sm font-medium text-ink">{option.label}</span>
                          <span className="block text-sm text-ink-muted">{option.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                {initial.eligibility || !missing.includes("eligibility") ? (
                  <Alert
                    tone="info"
                    title={
                      payoutMode === "paid"
                        ? "You'll mentor as a paid mentor"
                        : "You'll mentor as a volunteer"
                    }
                  >
                    {payoutMode === "paid"
                      ? "You set your own prices; payouts go to your bank through our payment partner."
                      : "Your 1:1 sessions are free for students, and you can host free events. This keeps you within typical student-visa rules — it's not legal advice."}
                  </Alert>
                ) : null}
              </div>
              <StepFooter onBack={back} saving={saving} />
            </StepCard>
          </form>
        ) : null}

        {current.id === "links" ? (
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              setStep(step + 1);
            }}
          >
            <StepCard
              title="Links"
              description="Optional. Professional profiles only — LinkedIn, GitHub, a personal site or portfolio."
            >
              {links.length > 0 ? (
                <ul className="mb-5 space-y-2">
                  {links.map((l) => (
                    <li key={l.id} className="flex items-center gap-2 text-sm">
                      <Link2 className="size-4 text-ink-muted" aria-hidden="true" />
                      <span className="capitalize text-ink-muted">{l.kind}</span>
                      <span className="truncate text-ink">{l.url}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[160px_minmax(0,1fr)_auto] sm:items-end">
                <Field label="Type" htmlFor="link-kind">
                  <Select
                    id="link-kind"
                    value={link.kind}
                    onChange={(e) => setLink({ ...link, kind: e.target.value })}
                  >
                    <option value="linkedin">LinkedIn</option>
                    <option value="github">GitHub</option>
                    <option value="website">Website</option>
                    <option value="portfolio">Portfolio</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="Link" htmlFor="link-url" error={linkError}>
                  <Input
                    id="link-url"
                    type="url"
                    placeholder="https://"
                    value={link.url}
                    onChange={(e) => setLink({ ...link, url: e.target.value })}
                  />
                </Field>
                <Button
                  variant="secondary"
                  onClick={() => void addLink()}
                  disabled={!link.url.trim()}
                  loading={saving}
                >
                  Add
                </Button>
              </div>
              <StepFooter onBack={back} saving={false} submitLabel="Continue" />
            </StepCard>
          </form>
        ) : null}

        {current.id === "review" ? (
          <StepCard
            title={draft ? "Review and submit" : "Submitted"}
            description={
              draft
                ? "Our team reviews every application. You can keep setting up your sessions and hours while you wait."
                : "Nothing else to do here — keep your profile up to date from the other steps."
            }
          >
            <ul className="space-y-2">
              {STEPS.filter((s) => s.sections.length > 0).map((s) => (
                <li key={s.id} className="flex items-center gap-3 text-sm">
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full",
                      done(s.sections) ? "bg-success text-white" : "bg-ink/10 text-ink-muted",
                    )}
                  >
                    {done(s.sections) ? <Check className="size-3" aria-hidden="true" /> : null}
                  </span>
                  <span className={done(s.sections) ? "text-ink" : "text-ink-muted"}>
                    {s.title}
                    {done(s.sections) ? "" : " — still to do"}
                  </span>
                </li>
              ))}
            </ul>
            {draft ? (
              <div className="mt-8 flex items-center justify-between gap-3 border-t border-line pt-5">
                <Button variant="ghost" onClick={() => setStep(step - 1)}>
                  Back
                </Button>
                <Button
                  onClick={() => void submit()}
                  loading={saving}
                  disabled={missing.length > 0}
                >
                  Submit application
                </Button>
              </div>
            ) : (
              <Button asChild variant="secondary" className="mt-6">
                <Link href="/dashboard/mentor">Back to mentoring</Link>
              </Button>
            )}
          </StepCard>
        ) : null}
      </div>
    </div>
  );
}

function TopicChip({
  term,
  selected,
  onChange,
}: {
  term: Option;
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const on = selected.includes(term.id);
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={!on && selected.length >= 20}
      onClick={() =>
        onChange(on ? selected.filter((id) => id !== term.id) : [...selected, term.id])
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-40",
        on
          ? "border-primary bg-primary text-on-primary"
          : "border-line bg-surface text-ink hover:border-primary/50",
      )}
    >
      {on ? <Check className="size-3.5" aria-hidden="true" /> : null}
      {term.name}
    </button>
  );
}
