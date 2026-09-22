import type { PayoutMode, ResidencyStatus } from "./types";

export type CountryRules = Record<string, Partial<Record<ResidencyStatus, PayoutMode>>>;

/**
 * Maps a mentor's declared residency status to volunteer/paid mode (docs/10 §3.1, docs/17 §3). Any
 * status this ruleset doesn't explicitly map resolves to `volunteer` — protect first, never guess paid.
 */
export function resolvePayoutMode(
  countryIso2: string,
  residencyStatus: ResidencyStatus,
  rules: CountryRules,
): PayoutMode {
  const countryRule = rules[countryIso2] ?? rules["*"];
  return countryRule?.[residencyStatus] ?? "volunteer";
}

export function attestationExpiresAt(attestedAt: Date, reattestDays: number): Date {
  return new Date(attestedAt.getTime() + reattestDays * 86_400_000);
}
