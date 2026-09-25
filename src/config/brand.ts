/**
 * The single source of brand identity (ADR-020). Renaming the product should only require editing
 * this file and swapping visual assets. Do not hard-code the product name anywhere else.
 */
export const brand = {
  name: "Aheadly",
  tagline: "Guidance from people who've been there.",
  description:
    "Affordable mentorship for students: 1-on-1 sessions, group sessions, free events and sourced guides for careers and studying abroad.",
  /** Prefix for cookie names; cookies use the __Host- prefix in production. */
  cookiePrefix: "aheadly",
  /** Placeholder contacts until a domain exists. */
  supportEmail: "support@aheadly.invalid",
  securityEmail: "security@aheadly.invalid",
  legalEntityName: "Aheadly (entity to be registered)",
  /** docs/12 §6, §15: a named grievance officer is a founder action item due before public beta
   * (docs/19 §"Founder action items"); support handles the role until then. */
  grievanceOfficerName: "To be designated before public beta",
  grievanceContactEmail: "support@aheadly.invalid",
} as const;

export type Brand = typeof brand;
