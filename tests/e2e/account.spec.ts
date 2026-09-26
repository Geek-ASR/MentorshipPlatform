import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { capturedEmailLink, createStudent, resetAuthRateLimits } from "./helpers/student-auth";

/** docs/19 Phase 15a: the signed-in account journeys a student needs before booking. */

async function expectNoSeriousA11yViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(
    serious,
    JSON.stringify(
      serious.map((v) => ({ id: v.id, nodes: v.nodes.length })),
      null,
      2,
    ),
  ).toEqual([]);
}

test.describe("account", () => {
  test("E1: sign up → verify email (captured) → set time zone → browse mentors", async ({
    page,
  }) => {
    await resetAuthRateLimits();
    const email = `e2e.journey.${Date.now()}@example.com`;
    const password = "copper kite windows drift";
    await page.goto("/sign-up");
    await page.getByLabel("Full name").fill("Meher Anand");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByLabel("Year of birth").fill("2003");
    await page.getByLabel(/I agree to the/).check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();

    await page.goto(await capturedEmailLink(email, "/verify-email"));
    await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
    await page.getByRole("link", { name: "Continue" }).click();

    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.waitForURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Meher");
    await expect(page.getByText("Verify your email to book sessions")).toHaveCount(0);

    await page.goto("/dashboard/settings");
    await page.getByLabel("Time zone").selectOption("Asia/Kolkata");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Profile saved")).toBeVisible();

    await page.goto("/mentors");
    await expect(page.getByRole("heading", { name: "Explore mentors" })).toBeVisible();
  });

  test("signing in through the form lands on the dashboard", async ({ page, context, baseURL }) => {
    const student = await createStudent(context, baseURL!, "signin");
    await page.goto("/sign-in?returnTo=%2Fdashboard");
    await page.getByLabel("Email").fill(student.email);
    await page.getByLabel("Password", { exact: true }).fill(student.password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await page.waitForURL(/\/dashboard$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Riya");
    await expect(page.getByText("No sessions booked yet")).toBeVisible();
    await expectNoSeriousA11yViolations(page);
  });

  test("a wrong password explains itself without saying which part was wrong", async ({
    page,
    context,
    baseURL,
  }) => {
    const student = await createStudent(context, baseURL!, "wrongpw");
    await page.goto("/sign-in");
    await page.getByLabel("Email").fill(student.email);
    await page.getByLabel("Password", { exact: true }).fill("not the right password at all");
    await page.getByRole("button", { name: "Sign in" }).click();
    // Filtered: Next.js keeps its own (empty) route-announcer alert region on every page.
    await expect(
      page.getByRole("alert").filter({ hasText: "don't match an account" }),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("signed-out visitors to a dashboard page are sent to sign in and back", async ({ page }) => {
    await page.goto("/dashboard/settings");
    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fdashboard%2Fsettings$/);
  });

  test("sign-up validates inline, then confirms by email", async ({ page }) => {
    await resetAuthRateLimits();
    await page.goto("/sign-up");
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter your name.")).toBeVisible();
    await expect(page.getByText("Please agree to the Terms")).toBeVisible();
    await expect(page.getByLabel("Full name")).toBeFocused();

    await page.getByLabel("Full name").fill("Arnav Joshi");
    await page.getByLabel("Email").fill(`e2e.signup.${Date.now()}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill("amber harbour quietly sings");
    await page.getByLabel("Year of birth").fill("2002");
    await page.getByLabel(/I agree to the/).check();
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  });

  test("settings: a new name and time zone are saved", async ({ page, context, baseURL }) => {
    await createStudent(context, baseURL!, "settings", { signIn: true });
    await page.goto("/dashboard/settings");
    await expectNoSeriousA11yViolations(page);

    await page.getByLabel("Name").fill("Riya K.");
    await page.getByLabel("Time zone").selectOption("Europe/Berlin");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Profile saved")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Name")).toHaveValue("Riya K.");
    await expect(page.getByLabel("Time zone")).toHaveValue("Europe/Berlin");
  });

  test("security: the devices list shows this session and can sign out everywhere", async ({
    page,
    context,
    baseURL,
  }) => {
    await createStudent(context, baseURL!, "devices", { signIn: true });
    await page.goto("/dashboard/settings/security");
    await expect(page.getByText("This device")).toBeVisible();
    await expectNoSeriousA11yViolations(page);

    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    const dialog = page.getByRole("dialog", { name: "Sign out on every device?" });
    await dialog.getByRole("button", { name: "Sign out everywhere" }).click();
    await page.waitForURL(/\/sign-in\?reason=signed_out/);
    await expect(page.getByText("You've been signed out on every device.")).toBeVisible();

    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fdashboard/);
  });

  test("signed-in pages don't scroll sideways on small phones", async ({
    page,
    context,
    baseURL,
  }) => {
    // Regression guard: a grid's implicit column once grew to fit truncated text and pushed the
    // dashboard 200px past the viewport on phones.
    await createStudent(context, baseURL!, "overflow", { signIn: true });
    await page.setViewportSize({ width: 320, height: 800 });
    for (const path of ["/dashboard", "/dashboard/settings", "/dashboard/settings/security"]) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test("the public header knows who is signed in", async ({ page, context, baseURL, isMobile }) => {
    test.skip(isMobile, "the account menu lives behind the mobile menu on phones");
    await createStudent(context, baseURL!, "header", { signIn: true });
    await page.goto("/mentors");
    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Account menu" })).toBeFocused();
  });
});
