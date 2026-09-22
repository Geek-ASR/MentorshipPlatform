import type { MentorApplicationStatus } from "./types";

/**
 * Listing requirement (docs/10 §2.1): approved (the "L2 profile reviewed" step), not paused, and at
 * least one active credential (reaching "L3"). Affiliations without their own credential still show
 * in the bio but stay unbadged and unfilterable — that's decided per-affiliation, not here.
 */
export function isListable(
  applicationStatus: MentorApplicationStatus,
  activeCredentialCount: number,
): boolean {
  return applicationStatus === "approved" && activeCredentialCount >= 1;
}
