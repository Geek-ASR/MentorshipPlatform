"use client";

import { useState, type FormEvent } from "react";
import { useRouter, usePathname } from "next/navigation";
import { adminFetch, isReauthRequired } from "@/ui/admin-fetch";
import { Button } from "@/ui/button";
import { Field, Input, Select, Textarea } from "@/ui/input";

// Client components never import `@/server/*` (architecture boundary) — these mirror
// `server/modules/content/domain/types.ts`'s enums rather than importing them.
type ArticleSourceType = "official" | "mentor_experience" | "community" | "editorial";
type ArticleDisclaimerKind = "immigration" | "legal" | "financial" | "medical";
type ArticleSource = { url: string; publisher: string; isOfficial: boolean; accessedAt: string };

const SOURCE_TYPES: ArticleSourceType[] = ["official", "mentor_experience", "community", "editorial"];
const DISCLAIMER_KINDS: (ArticleDisclaimerKind | "")[] = ["", "immigration", "legal", "financial", "medical"];

type Option = { id?: string; iso2?: string; name: string };

export type ArticleFormValues = {
  title: string;
  dek: string;
  bodyMd: string;
  categoryTermId: string;
  countryIso2: string;
  universityId: string;
  sourceType: ArticleSourceType;
  sources: ArticleSource[];
  disclaimerKind: ArticleDisclaimerKind | "";
  appliesToIntake: string;
};

const emptySource = (): ArticleSource => ({
  url: "",
  publisher: "",
  isOfficial: false,
  accessedAt: new Date().toISOString().slice(0, 10),
});

/** Shared create/edit form (docs/22 §4 UI states) — `articleId` present means "edit an existing
 * draft/published guide via PUT", absent means "create via POST". A rename toggle is offered only
 * in edit mode, since a new guide has no old slug to redirect from. */
export function ArticleForm({
  articleId,
  initial,
  categoryRows,
  countryRows,
  universityRows,
}: {
  articleId?: string;
  initial?: Partial<ArticleFormValues>;
  categoryRows: Option[];
  countryRows: Option[];
  universityRows: Option[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [values, setValues] = useState<ArticleFormValues>({
    title: initial?.title ?? "",
    dek: initial?.dek ?? "",
    bodyMd: initial?.bodyMd ?? "",
    categoryTermId: initial?.categoryTermId ?? "",
    countryIso2: initial?.countryIso2 ?? "",
    universityId: initial?.universityId ?? "",
    sourceType: initial?.sourceType ?? "editorial",
    sources: initial?.sources && initial.sources.length > 0 ? initial.sources : [],
    disclaimerKind: initial?.disclaimerKind ?? "",
    appliesToIntake: initial?.appliesToIntake ?? "",
  });
  const [renameSlug, setRenameSlug] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function set<K extends keyof ArticleFormValues>(key: K, value: ArticleFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  function setSource(index: number, patch: Partial<ArticleSource>) {
    setValues((v) => ({
      ...v,
      sources: v.sources.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const payload = {
        title: values.title,
        dek: values.dek || (articleId ? null : undefined),
        bodyMd: values.bodyMd,
        categoryTermId: values.categoryTermId || (articleId ? null : undefined),
        countryIso2: values.countryIso2 || (articleId ? null : undefined),
        universityId: values.universityId || (articleId ? null : undefined),
        sourceType: values.sourceType,
        sources: values.sources,
        disclaimerKind: values.disclaimerKind || (articleId ? null : undefined),
        appliesToIntake: values.appliesToIntake || (articleId ? null : undefined),
        ...(articleId ? { renameSlug } : {}),
      };
      if (articleId) {
        await adminFetch(`/api/v1/admin/articles/${articleId}`, { method: "PUT", body: payload });
      } else {
        const res = await adminFetch("/api/v1/admin/articles", { body: payload });
        const created = (await res.json()) as { id: string };
        router.push(`/admin/articles/${created.id}`);
        return;
      }
      router.refresh();
    } catch (err) {
      if (isReauthRequired(err)) {
        router.push(`/admin/login?returnTo=${encodeURIComponent(pathname)}`);
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't save the guide.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Title" htmlFor="title">
        <Input
          id="title"
          required
          value={values.title}
          onChange={(e) => set("title", e.target.value)}
        />
      </Field>
      {articleId ? (
        <label className="flex items-center gap-2 text-xs text-ink-muted">
          <input
            type="checkbox"
            checked={renameSlug}
            onChange={(e) => setRenameSlug(e.target.checked)}
          />
          Regenerate the URL slug from the new title (leaves a redirect from the old one)
        </label>
      ) : null}
      <Field label="Standfirst" htmlFor="dek" hint="Shown on cards and as the meta description fallback">
        <Input id="dek" value={values.dek} onChange={(e) => set("dek", e.target.value)} />
      </Field>
      <Field label="Body (Markdown)" htmlFor="bodyMd">
        <Textarea
          id="bodyMd"
          required
          rows={12}
          value={values.bodyMd}
          onChange={(e) => set("bodyMd", e.target.value)}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="categoryTermId">
          <Select
            id="categoryTermId"
            value={values.categoryTermId}
            onChange={(e) => set("categoryTermId", e.target.value)}
          >
            <option value="">None</option>
            {categoryRows.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Country" htmlFor="countryIso2">
          <Select
            id="countryIso2"
            value={values.countryIso2}
            onChange={(e) => set("countryIso2", e.target.value)}
          >
            <option value="">None</option>
            {countryRows.map((c) => (
              <option key={c.iso2} value={c.iso2}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="University" htmlFor="universityId">
          <Select
            id="universityId"
            value={values.universityId}
            onChange={(e) => set("universityId", e.target.value)}
          >
            <option value="">None</option>
            {universityRows.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Source type" htmlFor="sourceType">
          <Select
            id="sourceType"
            value={values.sourceType}
            onChange={(e) => set("sourceType", e.target.value as ArticleSourceType)}
          >
            {SOURCE_TYPES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Disclaimer"
          htmlFor="disclaimerKind"
          hint="Shows the 'mentor experience, not official advice' banner"
        >
          <Select
            id="disclaimerKind"
            value={values.disclaimerKind}
            onChange={(e) => set("disclaimerKind", e.target.value as ArticleDisclaimerKind | "")}
          >
            {DISCLAIMER_KINDS.map((k) => (
              <option key={k || "none"} value={k}>
                {k || "None"}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Applies to intake" htmlFor="appliesToIntake" hint='e.g. "Winter 2026/27"'>
          <Input
            id="appliesToIntake"
            value={values.appliesToIntake}
            onChange={(e) => set("appliesToIntake", e.target.value)}
          />
        </Field>
      </div>

      <fieldset className="rounded-[var(--radius-card)] border border-line p-4">
        <legend className="px-1 text-sm font-medium text-ink">Sources</legend>
        <div className="space-y-3">
          {values.sources.map((source, index) => (
            <div key={index} className="grid gap-2 rounded-[var(--radius-control)] border border-line p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <Input
                aria-label="Source URL"
                placeholder="https://…"
                value={source.url}
                onChange={(e) => setSource(index, { url: e.target.value })}
              />
              <Input
                aria-label="Publisher"
                placeholder="Publisher"
                value={source.publisher}
                onChange={(e) => setSource(index, { publisher: e.target.value })}
              />
              <Input
                aria-label="Accessed date"
                type="date"
                value={source.accessedAt}
                onChange={(e) => setSource(index, { accessedAt: e.target.value })}
              />
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs text-ink-muted">
                  <input
                    type="checkbox"
                    checked={source.isOfficial}
                    onChange={(e) => setSource(index, { isOfficial: e.target.checked })}
                  />
                  Official
                </label>
                <button
                  type="button"
                  className="text-xs text-danger hover:underline"
                  onClick={() =>
                    setValues((v) => ({ ...v, sources: v.sources.filter((_, i) => i !== index) }))
                  }
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => setValues((v) => ({ ...v, sources: [...v.sources, emptySource()] }))}
        >
          Add source
        </Button>
      </fieldset>

      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : articleId ? "Save changes" : "Create draft"}
      </Button>
    </form>
  );
}
