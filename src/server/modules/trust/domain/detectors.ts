/**
 * Deterministic contact-info/payment/claim-phrase detectors (docs/10 §9, §3.2; docs/13 §3; docs/11
 * AC14). Every pattern here is a bounded, linear-time regex — no nested quantifiers, no ambiguous
 * overlapping alternation — and every entry point should be called only after the platform's own
 * `maxBodyBytes`/length caps already ran (docs/17 `messaging.max_length=4000`), which is what makes
 * the "≤4,000 chars < 5ms" ReDoS guard (docs/13 §3) meaningful rather than a false sense of safety.
 */

const NUMBER_WORDS: Record<string, string> = {
  zero: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
};

/** Turns word-obfuscated digits ("nine eight seven…") into literal digits before pattern matching —
 * docs/13 §3 names this exact obfuscation style in its test-corpus requirement. */
function despellDigits(text: string): string {
  return text.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/gi, (match) => {
    return NUMBER_WORDS[match.toLowerCase()] ?? match;
  });
}

// A plain, unbroken run of 10-15 digits — no inner optional groups, so there's exactly one way to
// match any given input (no backtracking ambiguity at all, unlike a pattern that also allows an
// optional separator between every digit, which `security/detect-unsafe-regex` correctly rejects).
const PLAIN_PHONE_PATTERN = /\d{10,15}/g;
const EMAIL_PATTERN =
  /\b[a-zA-Z0-9][a-zA-Z0-9._%+-]{0,63}@[a-zA-Z0-9][a-zA-Z0-9.-]{0,253}\.[a-zA-Z]{2,24}\b/g;
const UPI_VPA_PATTERN =
  /\b[a-zA-Z0-9.\-_]{2,64}@(okaxis|okhdfcbank|oksbi|okicici|okbizaxis|ybl|paytm|apl|axl|ibl|jio|upi)\b/gi;
const URL_SHORTENER_PATTERN =
  /https?:\/\/(www\.)?(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly)\/\S*/gi;

const PAYMENT_KEYWORDS = [
  "gpay",
  "g-pay",
  "google pay",
  "paytm",
  "phonepe",
  "phone pe",
  "paypal",
  "venmo",
  "cashapp",
  "cash app",
  "zelle",
  "bank transfer",
  "pay directly",
  "pay me directly",
  "whatsapp me",
  "whatsapp number",
  "telegram",
  "outside the platform",
  "off platform",
  "off-platform",
];

export type ContactInfoHit = {
  kind: "phone" | "email" | "upi_vpa" | "url_shortener" | "payment_keyword";
  match: string;
};

/**
 * Space/hyphen/dot-separated digit-group obfuscation — both "98765 43210" (two 5-digit groups) and
 * "9-8-7-6-5-4-3-2-1-0" (ten single digits) — done as a plain linear scan over digit chunks, not a
 * regex allowing an *optional* separator between digits, which is exactly the shape
 * `security/detect-unsafe-regex` (docs/11 AC14) correctly flags as ambiguous/backtracking-prone.
 * Finding every digit chunk with `\d+` (unambiguous) and then walking them in plain JS is O(n) with
 * no ambiguity at all. Only multi-chunk runs are reported here — a single unbroken chunk is already
 * covered by `PLAIN_PHONE_PATTERN` and would otherwise double-count.
 */
function findObfuscatedPhoneRuns(text: string): string[] {
  const chunks = [...text.matchAll(/\d+/g)].map((m) => ({
    text: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }));
  const hits: string[] = [];
  let i = 0;
  while (i < chunks.length) {
    let totalDigits = chunks[i]!.text.length;
    let j = i;
    while (j + 1 < chunks.length) {
      const between = text.slice(chunks[j]!.end, chunks[j + 1]!.start);
      if (!/^[\s.-]{1,3}$/.test(between)) break; // a short separator only, not other words.
      totalDigits += chunks[j + 1]!.text.length;
      j++;
    }
    if (j > i && totalDigits >= 10 && totalDigits <= 15) {
      hits.push(text.slice(chunks[i]!.start, chunks[j]!.end));
    }
    i = j + 1;
  }
  return hits;
}

export function detectContactInfo(rawText: string): ContactInfoHit[] {
  const text = despellDigits(rawText);
  const hits: ContactInfoHit[] = [];

  for (const match of text.matchAll(PLAIN_PHONE_PATTERN)) {
    hits.push({ kind: "phone", match: match[0] });
  }
  for (const run of findObfuscatedPhoneRuns(text)) {
    hits.push({ kind: "phone", match: run });
  }
  for (const match of text.matchAll(EMAIL_PATTERN)) {
    hits.push({ kind: "email", match: match[0] });
  }
  for (const match of text.matchAll(UPI_VPA_PATTERN)) {
    hits.push({ kind: "upi_vpa", match: match[0] });
  }
  for (const match of text.matchAll(URL_SHORTENER_PATTERN)) {
    hits.push({ kind: "url_shortener", match: match[0] });
  }
  const lower = text.toLowerCase();
  for (const keyword of PAYMENT_KEYWORDS) {
    if (lower.includes(keyword)) hits.push({ kind: "payment_keyword", match: keyword });
  }
  return hits;
}

export function hasPaymentSolicitation(hits: readonly ContactInfoHit[]): boolean {
  return hits.some((h) => h.kind === "payment_keyword" || h.kind === "upi_vpa");
}

/** docs/10 §3.2: prohibited marketing/guarantee claims in profile & service text, and (docs/10 §10)
 * the same check reused for review-body publication checks. Only 3 example phrases are given in the
 * docs; the rest of this list is this phase's own build-out from §3.2's prohibited-services
 * enumeration (documented as such — not a verbatim doc quote beyond the three named phrases). */
const CLAIM_PHRASES = [
  "100% visa guarantee",
  "guaranteed visa",
  "guaranteed admit",
  "guaranteed admission",
  "100% admission",
  "we write your sop",
  "we'll write your sop",
  "we write your lor",
  "sop writing service",
  "guaranteed scholarship",
  "guaranteed job",
  "guaranteed placement",
  "guaranteed interview",
  "fake transcript",
  "fake documents",
  "forged document",
  "falsify your",
];

export type ClaimPhraseHit = { phrase: string };

export function detectClaimPhrases(rawText: string): ClaimPhraseHit[] {
  const lower = rawText.toLowerCase();
  return CLAIM_PHRASES.filter((phrase) => lower.includes(phrase)).map((phrase) => ({ phrase }));
}

const PROFANITY_WORDS = ["fuck", "shit", "bitch", "asshole", "bastard", "cunt"];

export function containsProfanity(rawText: string): boolean {
  const lower = rawText.toLowerCase();
  return PROFANITY_WORDS.some((word) => lower.includes(word));
}

export type ReviewPublicationCheck = {
  profanity: boolean;
  contactInfo: boolean;
  claimPhrases: boolean;
  /** Simple duplicate-text heuristic — exact-match against another recent review body from the same
   * author is the only "duplicate text across accounts" signal this phase builds (docs/10 §10); real
   * near-duplicate detection across *different* accounts is a fuller text-similarity system this
   * phase doesn't attempt (documented deviation). */
  duplicateText: boolean;
};

/** docs/10 §10 publication gate: auto-publish unless flagged. Any true field here means "hold for
 * moderation," never a silent auto-reject — the mentor/reviewer always sees an inline explanation. */
export function shouldHoldForModeration(check: ReviewPublicationCheck): boolean {
  return check.profanity || check.contactInfo || check.claimPhrases || check.duplicateText;
}
