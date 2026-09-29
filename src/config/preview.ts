/**
 * The GitHub Pages preview (docs/19 Phase 15e): a static export of the whole UI on fictional demo
 * data, built by `scripts/preview/build.mjs`. Off in every real build — these are build-time
 * constants, so the preview-only branches are dead code everywhere else.
 */
export const PREVIEW = process.env.NEXT_PUBLIC_PREVIEW === "1";

/** Whose account the signed-in pages show: the demo student or the demo mentor. */
export const PREVIEW_PERSONA: "student" | "mentor" =
  process.env.NEXT_PUBLIC_PREVIEW_PERSONA === "mentor" ? "mentor" : "student";

/** Demo accounts behind each persona (`scripts/db/demo/data.ts`). */
export const PREVIEW_ACCOUNTS = {
  student: { key: "ishaan", name: "Ishaan Verma" },
  mentor: { key: "ananya", name: "Ananya Iyer" },
} as const;

/** Where the preview is served, e.g. "/MentorshipPlatform" or "/MentorshipPlatform/as-mentor". */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** The site root shared by both personas, for switching between them. */
export const PREVIEW_ROOT = process.env.NEXT_PUBLIC_PREVIEW_ROOT ?? "";
