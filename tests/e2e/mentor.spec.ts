import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createStaleAdminSession } from "./helpers/admin-auth";
import { capturedEmailLink, createStudent } from "./helpers/student-auth";

async function expectNoSeriousA11y(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious.map((v) => v.id)).toEqual([]);
}

test.describe("mentor onboarding", () => {
  test("E6: application → university-email verification → admin approval → availability → listed", async ({
    page,
    context,
    browser,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "the staff console half of this journey is desktop-only (docs/22 §7)");
    test.setTimeout(90_000);
    // A name unique to this run: the staff queue lists applicants by name.
    const suffix = Date.now()
      .toString(36)
      .replace(/\d/g, (d) => "abcdefghij"[Number(d)]!);
    const mentor = await createStudent(context, baseURL!, "e6", {
      signIn: true,
      displayName: `Kiran Rao ${suffix}`,
    });

    // Apply.
    await page.goto("/dashboard/mentor");
    await expectNoSeriousA11y(page);
    await page.getByRole("button", { name: "Start my application" }).click();
    await page.waitForURL(/\/dashboard\/mentor\/application$/);

    await page.getByLabel("Headline").fill("MTech Computer Science, IIT Kanpur · Backend engineer");
    await page
      .getByLabel("About")
      .fill(
        "I help final-year students plan backend engineering careers and prepare for interviews.",
      );
    await page.getByRole("button", { name: "Save and continue" }).click();

    await expect(page.getByRole("heading", { name: "Education & work" })).toBeVisible();
    await page
      .getByLabel("University")
      .selectOption({ label: "Indian Institute of Technology Kanpur" });
    await page.getByLabel("Degree and subject").fill("MTech, Computer Science");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("MTech, Computer Science")).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Topics & languages" })).toBeVisible();
    await page.getByRole("button", { name: "System design", exact: true }).click();
    await page.getByLabel("English", { exact: true }).check();
    await page.getByRole("button", { name: "Save and continue" }).click();

    await expect(page.getByRole("heading", { name: "Where you live and can work" })).toBeVisible();
    await page.getByLabel("Country you live in", { exact: true }).selectOption("IN");
    await page.getByLabel(/Citizen or permanent resident/).check();
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.getByRole("heading", { name: "Links" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();

    await expectNoSeriousA11y(page);
    await page.getByRole("button", { name: "Submit application" }).click();
    await page.waitForURL(/\/dashboard\/mentor$/);
    await expect(page.getByText("Under review")).toBeVisible();

    // Verify the affiliation through the emailed link.
    const universityEmail = `e2e.mentor.${Date.now()}@iitk.ac.in`;
    await page.goto("/dashboard/mentor/verification");
    await page.getByRole("button", { name: "Verify" }).click();
    await page.getByLabel(/Indian Institute of Technology Kanpur email/).fill(universityEmail);
    await page.getByRole("button", { name: "Send link" }).click();
    await expect(page.getByText(`Link sent to ${universityEmail}`)).toBeVisible();
    await page.goto(await capturedEmailLink(universityEmail, "/verify-affiliation"));
    await page.getByRole("button", { name: "Confirm affiliation" }).click();
    await expect(page.getByRole("heading", { name: "Affiliation confirmed" })).toBeVisible();

    // A staff member approves it in the console.
    const adminContext = await browser.newContext();
    await createStaleAdminSession(adminContext, baseURL!, "e6");
    const admin = await adminContext.newPage();
    await admin.goto("/admin/mentor-applications");
    const row = admin.getByRole("row").filter({ hasText: mentor.displayName });
    await row.getByRole("button", { name: "Approve" }).click();
    // Approved applications leave the "submitted" queue.
    await expect(row).toHaveCount(0, { timeout: 15_000 });
    await adminContext.close();

    // Set up sessions, hours and payouts, then check the listing.
    await page.goto("/dashboard/mentor/services");
    await page.getByRole("button", { name: "New session type" }).click();
    const dialog = page.getByRole("dialog", { name: "New session type" });
    await dialog.getByLabel("Name").fill("Backend interview practice");
    await dialog.getByLabel("1 hr").check();
    await dialog.getByLabel("Price for 1 hr in rupees").fill("800");
    await dialog.getByLabel("Meeting link").fill("https://meet.jit.si/aheadly-e2e-practice");
    await dialog.getByRole("button", { name: "Add session type" }).click();
    await expect(page.getByText("Backend interview practice")).toBeVisible();

    await page.goto("/dashboard/mentor/availability");
    await page.getByRole("button", { name: "Add hours on Monday" }).click();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("18:00–21:00")).toBeVisible();

    await page.goto("/dashboard/mentor/payouts");
    await page.getByRole("button", { name: "Set up payouts" }).click();
    await expect(page.getByText("Payouts are set up")).toBeVisible();

    await page.goto("/dashboard/mentor");
    await expect(page.getByRole("heading", { name: "You're listed" })).toBeVisible();
    await page.getByRole("link", { name: /View public profile/ }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(mentor.displayName);
    await expect(page.getByText("Backend interview practice").first()).toBeVisible();
  });
});
