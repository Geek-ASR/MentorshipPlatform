import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe("public foundation", () => {
  test("home page renders the brand promise and both paths", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Guidance from people who've been there.",
    );
    await expect(page.getByRole("heading", { name: "Career & academic" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Study abroad" })).toBeVisible();
    await expect(page).toHaveTitle(/Aheadly/);
  });

  test("has no serious or critical accessibility violations", async ({ page }) => {
    await page.goto("/");
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

  test("skip link moves keyboard focus to main content", async ({ page, isMobile }, testInfo) => {
    test.skip(isMobile, "keyboard navigation is a desktop concern");
    // Real desktop Safari, by default, only Tabs through text fields and lists — not links or
    // buttons — until the user turns on "Full Keyboard Access" system-wide; Playwright's WebKit
    // faithfully reproduces that default. Verified locally (both this test and the E13 test below
    // fail identically on `desktop-webkit` even though the skip link and the search button are
    // correctly focusable via `.focus()`), so this isn't an app defect — it's the same limitation
    // most production sites share on Safari, and not something a page can opt out of.
    test.skip(testInfo.project.name === "desktop-webkit", "WebKit doesn't Tab to links by default");
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
  });

  test("E13: keyboard-only mentor search — filter, submit and read results with no mouse", async ({
    page,
    isMobile,
  }, testInfo) => {
    test.skip(isMobile, "keyboard-only traversal is a desktop concern (docs/13 §7 E13)");
    // See the skip-link test above: WebKit doesn't Tab to the submit button by default either.
    test.skip(
      testInfo.project.name === "desktop-webkit",
      "WebKit doesn't Tab to buttons by default",
    );
    await page.goto("/mentors");

    const keyword = page.getByLabel("Keyword");
    await keyword.focus();
    await expect(keyword).toBeFocused();
    await page.keyboard.type("system design");

    // Tab past the three filter <select>s to the submit button without ever touching the mouse.
    for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Search" })).toBeFocused();
    await page.keyboard.press("Enter");

    await page.waitForURL(/[?&]q=system\+design/);
    await expect(page.getByLabel("Keyword")).toHaveValue("system design");
    // No serious/critical accessibility regression on the results state either (empty or populated).
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    const serious = results.violations.filter((v) =>
      ["serious", "critical"].includes(v.impact ?? ""),
    );
    expect(serious).toEqual([]);
  });

  test("sends security headers and never indexes non-production environments", async ({
    request,
  }) => {
    const response = await request.get("/");
    const headers = response.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-robots-tag"]).toContain("noindex");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("unknown pages show a helpful 404 and unknown APIs return problem+json", async ({
    page,
    request,
  }) => {
    const pageResponse = await page.goto("/definitely-not-a-page");
    expect(pageResponse?.status()).toBe(404);
    await expect(page.getByText("We couldn't find that page")).toBeVisible();

    const api = await request.get("/api/v1/unknown");
    expect(api.status()).toBe(404);
    expect(api.headers()["content-type"]).toContain("application/problem+json");
  });

  test("mentor search tolerates malformed filter values instead of crashing (docs/19 Phase 14)", async ({
    request,
  }) => {
    // Found by a real ZAP scan during the Phase 14 security review: `university`/`category`/
    // `language` are cast to `::uuid` in the search query, and the page passed them through
    // unvalidated — any non-UUID value 500'd the whole page instead of just ignoring that filter.
    const response = await request.get(
      "/mentors?category=not-a-uuid&language=en&university=also-not-a-uuid",
    );
    expect(response.status()).toBe(200);
  });

  test("has no horizontal overflow on small screens", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
