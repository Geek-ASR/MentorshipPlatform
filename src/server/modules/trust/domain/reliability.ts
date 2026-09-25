/**
 * Two distinct "reliability" concepts docs/10/docs/17 never fully reconcile into one number (this
 * phase's own research made the distinction explicit — see docs/19 Phase 10 retrospective): the
 * profile-display percentage below (docs/17 §11: "1 − no-show/late-cancel rate, 90d") is a plain
 * rolling rate; the enforcement ladder (docs/10 §5) works directly off trust-event point totals via
 * the policy evaluator instead. Conflating them would be a real bug — keep them separate call sites.
 */
export function computeReliabilityPct(
  mentorNoShowAndLateCancelCount: number,
  totalSessionsEnded: number,
): number {
  if (totalSessionsEnded <= 0) return 100;
  const pct = 100 * (1 - mentorNoShowAndLateCancelCount / totalSessionsEnded);
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/**
 * Bayesian average (docs/10 §10, docs/17 §9: prior = platform mean, weight 5) — the "ranking input"
 * Phase 10's scope names; wiring it into the actual weighted discovery-ranking formula (docs/17 §11)
 * is a separate, larger thing this phase doesn't claim (docs/19 Phase 10 retrospective deviation).
 */
export function bayesianAverage(
  sumOfRatings: number,
  ratingCount: number,
  platformMeanRating: number,
  priorWeight: number,
): number {
  return (priorWeight * platformMeanRating + sumOfRatings) / (priorWeight + ratingCount);
}
