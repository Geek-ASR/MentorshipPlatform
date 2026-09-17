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

  test("skip link moves keyboard focus to main content", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard navigation is a desktop concern");
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to content" });
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main$/);
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

  test("has no horizontal overflow on small screens", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
