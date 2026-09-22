/** Scoped evidence-badge text (docs/10 §2.1) — says what was checked, how and when. Never "Verified". */

function monthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export function universityEmailLabel(
  universityName: string,
  verifiedAt: Date,
  isAlumni: boolean,
): string {
  const suffix = isAlumni ? "alumni email confirmed" : "university email confirmed";
  return `Education: ${universityName} — ${suffix} (${monthYear(verifiedAt)})`;
}

export function workEmailLabel(companyName: string, verifiedAt: Date): string {
  return `Work: ${companyName} — work email confirmed (${monthYear(verifiedAt)})`;
}
