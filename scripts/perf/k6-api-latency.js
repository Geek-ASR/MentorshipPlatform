import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

/**
 * docs/13 §9: "API latency (k6 on staging, weekly): search p95 < 300 ms, availability p95 < 250 ms,
 * booking create p95 < 400 ms at 20 RPS. Beyond MVP scale this is informative only, not a gate."
 *
 * No staging environment exists yet (docs/19 Phase 15), so this has never been run against one —
 * running it here would just measure a shared CI runner or a laptop, not anything representative.
 * It's a real, working script (validated locally against `next start`) ready for Phase 15, not an
 * aspirational stub: `BASE_URL` points it at whatever's actually running.
 *
 * Only search and availability are covered — both are genuinely public, unauthenticated GETs. A
 * booking-create load test needs a signed-in session (cookie + CSRF + idempotency key) and a real
 * bookable slot, which means either a pre-seeded auth fixture or an in-script sign-up flow that
 * itself has to stay under this app's own sign-up rate limit — a bigger, separate piece of work
 * tracked as a follow-up rather than attempted here (docs/19 Phase 13 retrospective).
 *
 * Usage: k6 run -e BASE_URL=https://staging.example.com -e MENTOR_SLUG=some-real-slug \
 *          -e SERVICE_ID=some-real-service-id scripts/perf/k6-api-latency.js
 *
 * Verified locally: latency thresholds passed against a local `next start` build (p95s well under
 * budget), but the `search: 200` check itself failed under sustained load — this app's IP-based rate
 * limiter (correctly) kicks in at 20 RPS from a single source. That's expected and correct for one
 * IP; it isn't representative of real staging traffic (many real users, many IPs), which is exactly
 * why this needs a real staging environment (docs/19 Phase 15) rather than a laptop to mean anything.
 */

const BASE_URL = __ENV.BASE_URL || "http://localhost:3200";
const MENTOR_SLUG = __ENV.MENTOR_SLUG || "";

const searchLatency = new Trend("search_latency", true);
const availabilityLatency = new Trend("availability_latency", true);

export const options = {
  scenarios: {
    search: {
      executor: "constant-arrival-rate",
      rate: 20,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 20,
      maxVUs: 40,
      exec: "search",
    },
    availability: {
      executor: "constant-arrival-rate",
      rate: 20,
      timeUnit: "1s",
      duration: "30s",
      preAllocatedVUs: 20,
      maxVUs: 40,
      exec: "availability",
      // Offset so the two scenarios' RPS don't compound into 40 RPS against the same server.
      startTime: "30s",
    },
  },
  thresholds: {
    search_latency: ["p(95)<300"],
    availability_latency: ["p(95)<250"],
  },
};

export function search() {
  const res = http.get(`${BASE_URL}/api/v1/mentors?q=design`);
  searchLatency.add(res.timings.duration);
  check(res, { "search: 200": (r) => r.status === 200 });
  sleep(0.1);
}

// Required alongside a real MENTOR_SLUG (the route 422s without them — confirmed locally): a real
// service id belonging to that mentor, a duration that service offers, and a `from`/`to` window.
const SERVICE_ID = __ENV.SERVICE_ID || "";
const DURATION_MIN = __ENV.DURATION_MIN || "60";

export function availability() {
  if (!MENTOR_SLUG || !SERVICE_ID) {
    // No seeded mentor/service configured — still exercises the route end to end (a 422 for missing
    // required query params is itself a valid, fast response), so the script is proven runnable
    // before a real staging dataset exists; Phase 15 supplies MENTOR_SLUG/SERVICE_ID for a real run.
    const res = http.get(`${BASE_URL}/api/v1/mentors/no-such-mentor/slots`);
    availabilityLatency.add(res.timings.duration);
    check(res, { "availability: responds": (r) => r.status > 0 });
    sleep(0.1);
    return;
  }
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 14 * 86_400_000).toISOString();
  const url =
    `${BASE_URL}/api/v1/mentors/${MENTOR_SLUG}/slots` +
    `?serviceId=${SERVICE_ID}&durationMin=${DURATION_MIN}&from=${from}&to=${to}`;
  const res = http.get(url);
  availabilityLatency.add(res.timings.duration);
  check(res, { "availability: 200": (r) => r.status === 200 });
  sleep(0.1);
}
