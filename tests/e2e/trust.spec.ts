import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createStaleAdminSession } from "./helpers/admin-auth";
import { bookFreeDemoSession, markCompleted, moveSessionIntoPast } from "./helpers/sessions";
import { createStudent, userIdForEmail } from "./helpers/student-auth";

async function expectNoSeriousA11y(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious.map((v) => v.id)).toEqual([]);
}

const LANE: Record<string, number> = {
  "desktop-chromium": 0,
  "mobile-chromium": 1,
  "desktop-webkit": 2,
  "mobile-safari": 3,
  "desktop-firefox": 4,
};

test.describe("after a session", () => {
  test("E9 (member side): tell us how it went, then review the completed session", async ({
    page,
    context,
    baseURL,
  }) => {
    await createStudent(context, baseURL!, "e9", { signIn: true });
    const lane = LANE[test.info().project.name] ?? 0;
    const { bookingId, mentorName } = await bookFreeDemoSession(
      context,
      baseURL!,
      lane % 2 === 0 ? "meera" : "ananya",
      lane * 3 + test.info().retry,
    );
    const firstName = mentorName.split(" ")[0]!;
    await moveSessionIntoPast(bookingId, 45, 30);

    await page.goto(`/dashboard/bookings/${bookingId}`);
    // Once a session has started it can no longer be cancelled or moved.
    await expect(page.getByRole("button", { name: /Cancel booking/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Reschedule/ })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "How did it go?" })).toBeVisible();
    await expect(page.getByLabel(`${firstName} didn't show up`)).toBeEnabled();
    await page.getByLabel("The session went ahead").check();
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("You told us:")).toBeVisible();
    await expect(page.getByText("The session went ahead")).toBeVisible();
    await expectNoSeriousA11y(page);

    // The attendance job settles it (clock-driven, covered by integration tests); then a review.
    await markCompleted(bookingId);
    await page.reload();
    await page.locator("label", { has: page.getByRole("radio", { name: /^5 stars/ }) }).click();
    await expect(page.getByRole("radio", { name: /^5 stars/ })).toBeChecked();
    await page
      .getByLabel("What was it like?")
      .fill("Clear, practical advice on my shortlist and a realistic timeline.");
    await page.getByRole("button", { name: "Post review" }).click();
    await expect(page.getByRole("heading", { name: "Your review" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open a dispute" })).toBeVisible();
  });
});

test.describe("reports and notices", () => {
  test("E10: report → moderator warning → the member sees the notice → appeal", async ({
    page,
    context,
    browser,
    baseURL,
    isMobile,
  }) => {
    test.skip(isMobile, "the staff console half of this journey is desktop-only (docs/22 §7)");
    test.setTimeout(90_000);

    // A student reports a mentor profile from its ⋯ menu — always acknowledged the same way.
    const reporterContext = await browser.newContext();
    await createStudent(reporterContext, baseURL!, "e10r", { signIn: true });
    const reporter = await reporterContext.newPage();
    await reporter.goto("/mentors/kabir-singh");
    await reporter.getByRole("button", { name: "More options" }).click();
    await reporter.getByRole("menuitem", { name: /Report Kabir's profile/ }).click();
    const reportDialog = reporter.getByRole("dialog", { name: /Report Kabir's profile/ });
    await reportDialog.getByLabel("What's wrong?").selectOption("spam");
    await reportDialog.getByRole("button", { name: "Send report" }).click();
    await expect(reporter.getByRole("dialog", { name: "Thanks for telling us" })).toBeVisible();

    // A report about another member (here through the same API the menu uses, since nothing in
    // the product shows one student to another) opens a case for the moderators.
    const member = await createStudent(context, baseURL!, "e10m", { signIn: true });
    const memberId = await userIdForEmail(member.email);
    const filed = await reporterContext.request.post(`${baseURL}/api/v1/reports`, {
      data: { targetType: "user", targetId: memberId, reasonCode: "harassment" },
      headers: {
        origin: baseURL!,
        "sec-fetch-site": "same-origin",
        "idempotency-key": crypto.randomUUID(),
      },
    });
    expect(filed.status()).toBe(202);
    await reporterContext.close();

    // A moderator warns them from the staff console.
    const adminContext = await browser.newContext();
    await createStaleAdminSession(adminContext, baseURL!, "e10");
    const admin = await adminContext.newPage();
    await admin.goto("/admin/cases");
    await admin
      .getByRole("row")
      .filter({ hasText: memberId.slice(-8) })
      .getByRole("link")
      .click();
    await admin.getByLabel("Reason code").fill("harassment");
    await admin.getByLabel("Rationale").fill("Confirmed from the reported messages; first time.");
    await admin.getByRole("button", { name: "Apply" }).click();
    await expect(admin.getByText(/Prior actions against this subject \(1\)/)).toBeVisible({
      timeout: 15_000,
    });

    // The member sees the notice, what it means, and appeals it.
    const statement = `A misunderstanding that I apologised for the same day (ref ${Date.now().toString(36)}).`;
    await page.goto("/dashboard");
    await expect(page.getByText("There's a notice on your account")).toBeVisible();
    await page.getByRole("link", { name: "See details" }).click();
    await page.waitForURL(/\/dashboard\/settings\/safety$/);
    await expect(page.getByText("Warning", { exact: true })).toBeVisible();
    await expect(page.getByText(/found to be harassment/)).toBeVisible();
    await expectNoSeriousA11y(page);
    await page.getByRole("button", { name: "Appeal this decision" }).click();
    const appeal = page.getByRole("dialog", { name: /Appeal: Warning/ });
    await appeal.getByLabel("Why should we look again?").fill(statement);
    await appeal.getByRole("button", { name: "Send appeal" }).click();
    await expect(page.getByText("Appeal under review")).toBeVisible();

    // It reaches the appeals queue.
    await admin.goto("/admin/appeals");
    await expect(admin.getByText(statement)).toBeVisible();
    await adminContext.close();
  });
});
