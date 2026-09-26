/**
 * Versions of the documents a person agrees to at sign-up (docs/12 §3 consent records). The version
 * string is stored with each consent, so bump it — and the page's "last updated" line, which reads
 * from here — whenever the Terms or Privacy Policy text changes materially.
 */
export const LEGAL_VERSIONS = {
  terms: "2026-09-25",
  privacy: "2026-09-25",
} as const;

/** "25 September 2026" for the documents' "last updated" line. */
export function legalVersionLabel(version: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${version}T00:00:00Z`));
}
