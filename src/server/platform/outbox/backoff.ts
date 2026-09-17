/** Retry delays after attempt N (1-based): 1m, 5m, 30m, 2h, 12h, then 24h. */
const BACKOFF_SECONDS = [60, 300, 1800, 7200, 43200];
const MAX_BACKOFF_SECONDS = 86400;

/**
 * @param attempt the attempt number that just failed (1 = first attempt)
 * @param random injectable source in [0, 1) for jitter (±10%)
 */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = BACKOFF_SECONDS[Math.max(0, attempt - 1)] ?? MAX_BACKOFF_SECONDS;
  const jitter = 1 + (random() * 0.2 - 0.1);
  return Math.round(base * 1000 * jitter);
}

/** Truncates error messages stored on jobs so stack traces or large payloads never bloat rows. */
export function summarizeJobError(error: unknown): string {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  return message.length > 500 ? `${message.slice(0, 500)}…` : message;
}
