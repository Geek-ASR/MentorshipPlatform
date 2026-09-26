/**
 * Plain-language wording for trust & safety codes (docs/10 §1 "transparent to the affected user:
 * a reason code, a plain-language explanation, the duration, and how to appeal"). Client code can't
 * import the trust module, so the codes are mirrored here; an unknown code falls back to a generic
 * line rather than showing a raw identifier.
 */

export const REPORT_REASONS: { value: string; label: string }[] = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "hate", label: "Hateful or discriminatory content" },
  { value: "sexual_content", label: "Sexual or inappropriate content" },
  { value: "minor_safety", label: "Concern about a minor's safety" },
  { value: "scam_fraud", label: "Scam or fraud" },
  { value: "off_platform_payment", label: "Asked to pay outside Aheadly" },
  { value: "impersonation", label: "Pretending to be someone else" },
  { value: "fake_credentials", label: "False education or work claims" },
  { value: "spam", label: "Spam or advertising" },
  { value: "misinformation_harmful", label: "Harmful misinformation" },
  { value: "intellectual_property", label: "Copied or stolen content" },
  { value: "privacy_violation", label: "Sharing private information" },
  { value: "other", label: "Something else" },
];

const REASON_EXPLANATIONS: Record<string, string> = {
  harassment: "Behaviour towards another member that our team found to be harassment.",
  hate: "Content or conduct that attacks people for who they are.",
  sexual_content: "Sexual or otherwise inappropriate content.",
  minor_safety: "Conduct that put a young person's safety at risk.",
  scam_fraud: "Activity our team found to be misleading or fraudulent.",
  off_platform_payment: "Asking for or taking payment outside Aheadly.",
  impersonation: "Presenting yourself as someone you're not.",
  fake_credentials: "Education or work claims that couldn't be supported.",
  spam: "Promotional or repetitive content.",
  misinformation_harmful: "Sharing misleading information that could cause harm.",
  intellectual_property: "Using someone else's work without permission.",
  privacy_violation: "Sharing someone's private information.",
  student_no_show: "Missing booked sessions without cancelling.",
  mentor_no_show: "Missing sessions you were hosting.",
  late_cancellation: "Cancelling sessions at short notice repeatedly.",
};

export function reasonExplanation(code: string): string {
  return (
    REASON_EXPLANATIONS[code] ??
    REPORT_REASONS.find((r) => r.value === code)?.label ??
    "A breach of our community guidelines."
  );
}

export const ACTION_LABELS: Record<string, { title: string; effect: string }> = {
  warn: { title: "Warning", effect: "A formal notice. Nothing about your account changes." },
  restrict: {
    title: "Some features limited",
    effect: "Specific things you can do on Aheadly are paused for a while.",
  },
  remove_content: {
    title: "Content removed",
    effect: "Something you posted was taken down.",
  },
  hide_profile: {
    title: "Profile hidden",
    effect: "Your mentor profile isn't shown in search while this is in place.",
  },
  suspend: {
    title: "Account suspended",
    effect: "You can't use Aheadly for a while.",
  },
  ban: { title: "Account closed", effect: "Your account has been closed permanently." },
  reinstate: {
    title: "Restrictions lifted",
    effect: "Earlier limits on your account were removed.",
  },
};

export const CAPABILITY_LABELS: Record<string, string> = {
  "booking.create": "Booking sessions",
  "booking.accept": "Accepting new bookings",
  "message.send": "Sending messages",
  "review.create": "Writing reviews",
  "event.host": "Hosting events",
  "listing.visible": "Appearing in mentor search",
  "payout.release": "Receiving payouts",
  "report.create": "Sending reports",
};

export const APPEAL_STATUS_LABELS: Record<string, string> = {
  open: "Appeal under review",
  upheld: "Appeal reviewed: decision kept",
  modified: "Appeal reviewed: decision reduced",
  overturned: "Appeal reviewed: decision reversed",
};

export const DISPUTE_STATUS_LABELS: Record<string, { title: string; body: string }> = {
  open: {
    title: "Dispute opened",
    body: "Our team has the details. Any payout for this session is on hold until it's settled.",
  },
  awaiting_evidence: {
    title: "Waiting for both sides",
    body: "Tell us what happened in your own words. Both of you are asked for the same, and only our team sees what each side sends.",
  },
  under_review: {
    title: "Under review",
    body: "Our team is looking at what both of you sent, and the join and check-in times we recorded.",
  },
  resolved: { title: "Decided", body: "Our team has made a decision." },
  appealed: { title: "Decision appealed", body: "A different team member is reviewing it." },
  closed: { title: "Closed", body: "This dispute is settled." },
};
