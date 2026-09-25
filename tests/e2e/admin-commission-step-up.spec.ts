import { expect, test } from "@playwright/test";
import { createStaleAdminSession, refreshMfaForCurrentSession } from "./helpers/admin-auth";

/**
 * E11 (docs/13 §7): an admin whose session predates the step-up window gets rejected, redirected to
 * re-authenticate, and can then complete the same sensitive action — commission rules being the one
 * step-up-gated action with a full, real admin UI already built (docs/19 Phase 13 planning note: the
 * other E2E journeys need student/mentor-facing UI that doesn't exist yet).
 */
test.describe("E11: admin commission rule change requires step-up", () => {
  test.skip(
    ({ isMobile }) => isMobile,
    "admin dashboard is a desktop staff surface, not part of the mobile-viewport journeys",
  );

  test("a stale admin session is bounced to re-authenticate, then the rule is created", async ({
    page,
    context,
    baseURL,
  }) => {
    const base = baseURL!;
    const admin = await createStaleAdminSession(context, base, "commission");

    await page.goto("/admin/commission-rules");
    await expect(page.getByRole("heading", { name: "New rule" })).toBeVisible();

    await page.getByLabel("Reason").fill("step-up check, attempt 1 (expected to be rejected)");
    await page.getByRole("button", { name: "Create rule" }).click();

    // The stale session's write is rejected server-side (REAUTH_REQUIRED) and the client redirects
    // to re-authenticate rather than showing a generic error.
    await page.waitForURL(/\/admin\/login\?returnTo=/);

    await page.getByLabel("Email").fill(admin.email);
    await page.getByLabel("Password").fill(admin.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    // The client redirects to `returnTo` on sign-in success, but a brand-new session hasn't verified
    // MFA yet, so the server bounces it again to `/admin/mfa` before the page renders — the same
    // direct-SQL shortcut used everywhere else in this repo's tests stands in for the TOTP UI itself
    // (a separate concern from this journey).
    await page.waitForURL(/\/admin\/mfa\?returnTo=/);
    await refreshMfaForCurrentSession(context, base, admin.email, admin.password);

    await page.goto("/admin/commission-rules");
    await expect(page.getByRole("heading", { name: "New rule" })).toBeVisible();

    const rowsBefore = await page.locator("table tbody tr").count();
    // The form's own `<input type="number" min={0} max={100}>` caps the usable range, so this can't
    // be made collision-proof against a leftover row from an earlier run on a persistent (non-CI-
    // fresh) dev database — the row-count assertion below is what actually proves creation; `.first()`
    // here only proves *a* matching row is visible, which holds even if it isn't the only one.
    const priority = String(10 + (Date.now() % 90));
    await page.getByLabel("Priority").fill(priority);
    await page.getByLabel("Reason").fill("step-up check, attempt 2 (should succeed)");
    await page.getByRole("button", { name: "Create rule" }).click();

    // `router.refresh()` re-renders the server-fetched table with the new row once the second,
    // now-freshly-authenticated attempt actually succeeds.
    await expect(page.locator("table tbody tr")).toHaveCount(rowsBefore + 1);
    await expect(page.locator("table tbody tr", { hasText: priority }).first()).toBeVisible();
  });
});
