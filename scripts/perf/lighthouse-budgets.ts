import { chromium } from "@playwright/test";
import lighthouse from "lighthouse";

/**
 * docs/13 §9 performance budgets, run against a real `next build`/`next start` production server
 * (no staging/preview deployment exists yet — docs/19 Phase 16 — so this is the closest honest
 * substitute: the same build artifact E2E already tests against, in the same CI job).
 *
 * Runs Lighthouse against Playwright's own Chromium over the CDP port it exposes, rather than
 * pulling in `@lhci/cli` (which pins an old `lighthouse`/`puppeteer-core` chain with real high-
 * severity `extract-zip`/`tmp` CVEs — confirmed via `npm audit`, docs/21 ADR). The plain `lighthouse`
 * package's current release has a clean dependency tree.
 */

const PORT = Number(process.env.E2E_PORT ?? 3200);
const BASE_URL = `http://localhost:${PORT}`;

type Budget = { accessibility: number; bestPractices: number };

// Accessibility and Best Practices are markup/config-driven, not timing- or environment-dependent,
// so they're reliable CI gates from day one. Performance and SEO are measured and reported every
// run but not gated yet, each for its own concrete, verified reason (not just caution):
//  - Performance: shared CI runners throttle unpredictably under Lighthouse's simulated-mobile
//    CPU/network conditions, and this is the first time this budget has ever been measured here —
//    zero historical baseline to set a threshold against.
//  - SEO: every non-production environment correctly sends `X-Robots-Tag: noindex` and a blanket
//    `robots.txt Disallow: /` (docs/22 §10.4, a deliberate safety net so test/CI builds never get
//    indexed) — confirmed locally this alone drags Lighthouse's SEO category from what would be a
//    high-90s score down to the mid-60s, via its heavily-weighted "is-crawlable" audit. That's the
//    safety net working correctly, not a real defect, so gating on it here would just be gating on
//    noise. A meaningful SEO budget needs either a staging environment (docs/19 Phase 16) or a
//    CI-only header override to simulate production — both follow-ups, not done here.
const PAGES: Record<string, Budget> = {
  "/": { accessibility: 95, bestPractices: 95 },
  "/mentors": { accessibility: 95, bestPractices: 95 },
  "/guides": { accessibility: 95, bestPractices: 95 },
  "/career": { accessibility: 95, bestPractices: 95 },
};

async function main(): Promise<void> {
  const browser = await chromium.launch({ args: ["--remote-debugging-port=9222"] });
  let failed = false;
  try {
    for (const [path, budget] of Object.entries(PAGES)) {
      const url = `${BASE_URL}${path}`;
      const result = await lighthouse(url, {
        port: 9222,
        output: "json",
        onlyCategories: ["performance", "accessibility", "seo", "best-practices"],
        formFactor: "mobile",
        screenEmulation: {
          mobile: true,
          width: 375,
          height: 667,
          deviceScaleFactor: 2,
          disabled: false,
        },
        logLevel: "error",
      });
      const categories = result?.lhr.categories;
      if (!categories) throw new Error(`lighthouse produced no report for ${url}`);

      const scores = {
        performance: Math.round((categories.performance?.score ?? 0) * 100),
        accessibility: Math.round((categories.accessibility?.score ?? 0) * 100),
        seo: Math.round((categories.seo?.score ?? 0) * 100),
        bestPractices: Math.round((categories["best-practices"]?.score ?? 0) * 100),
      };

      const checks: [keyof Budget, number, number][] = [
        ["accessibility", scores.accessibility, budget.accessibility],
        ["bestPractices", scores.bestPractices, budget.bestPractices],
      ];
      const failing = checks.filter(([, actual, min]) => actual < min);
      const status = failing.length > 0 ? "FAIL" : "ok";
      console.log(
        `[${status}] ${path} — performance=${scores.performance} (informational) ` +
          `accessibility=${scores.accessibility}/${budget.accessibility} ` +
          `seo=${scores.seo} (informational, see comment above) ` +
          `best-practices=${scores.bestPractices}/${budget.bestPractices}`,
      );
      if (failing.length > 0) failed = true;
    }
  } finally {
    await browser.close();
  }
  if (failed) {
    console.error("\nOne or more pages fell below their Lighthouse budget.");
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
