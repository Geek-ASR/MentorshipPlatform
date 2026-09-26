import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * docs/13 §8: axe-core on every key public page, zero serious/critical violations. Home is already
 * covered by foundation.spec.ts; this file covers the rest of the pages that render without needing
 * a specific seeded record (mentor/guide detail pages need real data — tracked as a Phase 13 carry
 * alongside the other UI-dependent E2E journeys, docs/19).
 */
const PAGES = [
  { path: "/mentors", label: "mentor search" },
  { path: "/guides", label: "guides hub" },
  { path: "/career", label: "career hub" },
  { path: "/study-abroad", label: "study-abroad hub" },
  { path: "/events", label: "events list" },
  { path: "/admin/login", label: "admin login" },
  { path: "/sign-in", label: "sign in" },
  { path: "/sign-up", label: "sign up" },
  { path: "/forgot-password", label: "forgot password" },
];

test.describe("accessibility: key public pages", () => {
  for (const { path, label } of PAGES) {
    test(`${label} (${path}) has no serious or critical violations`, async ({ page }) => {
      await page.goto(path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      const serious = results.violations.filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      );
      expect(
        serious,
        JSON.stringify(
          serious.map((v) => ({ id: v.id, nodes: v.nodes.length })),
          null,
          2,
        ),
      ).toEqual([]);
    });
  }
});
