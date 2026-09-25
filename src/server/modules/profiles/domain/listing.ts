import type { MentorApplicationStatus } from "./types";

/**
 * Listing requirement (docs/10 §2.1): approved (the "L2 profile reviewed" step), not paused, and at
 * least one active credential (reaching "L3"). Affiliations without their own credential still show
 * in the bio but stay unbadged and unfilterable — that's decided per-affiliation, not here.
 *
 * `listingRestricted` folds in an active `listing.visible` moderation restriction (docs/10 §7.3
 * `hide_profile`/reliability-ladder suspensions, Phase 10) directly into the same computation,
 * rather than a separate override flag on the stored row — a routine profile edit's recompute
 * naturally keeps respecting the restriction without needing to know moderation exists, and the
 * listing comes back on its own the moment the restriction lifts, with no reinstate-side special
 * case needed here.
 */
export function isListable(
  applicationStatus: MentorApplicationStatus,
  activeCredentialCount: number,
  listingRestricted: boolean,
): boolean {
  return applicationStatus === "approved" && activeCredentialCount >= 1 && !listingRestricted;
}
