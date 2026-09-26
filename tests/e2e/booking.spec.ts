import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { createStudent, providerOrderIdForBooking } from "./helpers/student-auth";

/**
 * docs/13 §7 E2–E5 and E12, against the demo mentors (`npm run db:seed:demo`, run by CI before
 * the suite). Desktop and mobile book different mentors so parallel projects never race for the
 * same slot; each run takes whatever the picker offers, so repeated runs don't collide either.
 */

const MENTORS = {
  e2: { desktop: "ananya-iyer", mobile: "pooja-srinivasan" },
  e3: { desktop: "kabir-singh", mobile: "vikram-joshi" },
  e4: { desktop: "rohan-mehta", mobile: "sneha-kulkarni" },
  e5: { desktop: "divya-reddy", mobile: "nikhil-bansal" },
} as const;

async function openBooking(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "See times" }).click();
  const serviceChoice = page.getByRole("group", { name: "Session type" });
  if (await serviceChoice.isVisible().catch(() => false)) {
    // Prefer a paid session type: the free intro call has its own journey.
    const paid = serviceChoice.locator("label").filter({ hasNotText: "Free" }).first();
    await paid.click();
  }
}

/**
 * Browsers running in parallel (three desktop engines nightly) each book a different day, so no
 * two projects ever race for the same slot of the same mentor.
 */
const LANE: Record<string, number> = {
  "desktop-chromium": 0,
  "mobile-chromium": 0,
  "desktop-webkit": 1,
  "mobile-safari": 1,
  "desktop-firefox": 2,
};

/** Picks an open time `openDayIndex` open days out (so ≥ 2 means comfortably more than 24 h). */
async function pickSlot(page: Page, openDayIndex = 0) {
  openDayIndex += LANE[test.info().project.name] ?? 0;
  const days = page.getByRole("group", { name: "Dates" }).locator("button:not([disabled])");
  await days.first().waitFor();
  const count = await days.count();
  await days.nth(Math.min(openDayIndex, count - 1)).click();
  const time = page
    .getByRole("group", { name: "Start times" })
    .locator("button:not([disabled])")
    .last();
  await time.click();
  await expect(time).toHaveAttribute("aria-pressed", "true");
}

async function bookToCheckout(page: Page, slug: string, isMobile: boolean, openDayIndex = 0) {
  await page.goto(`/mentors/${slug}`);
  await openBooking(page, isMobile);
  await pickSlot(page, openDayIndex);
  await page.getByRole("button", { name: /Continue to payment/ }).click();
  await page.waitForURL(/\/checkout\//);
  await expect(page.getByRole("heading", { name: "Confirm and pay" })).toBeVisible();
  return page.url().split("/checkout/")[1]!;
}

test.describe("booking", () => {
  test("E2: search → profile → pick a slot across time zones → pay → confirmation + calendar file", async ({
    page,
    context,
    baseURL,
    isMobile,
  }) => {
    await createStudent(context, baseURL!, "e2", { signIn: true });
    const slug = isMobile ? MENTORS.e2.mobile : MENTORS.e2.desktop;

    const name = slug.split("-")[0]!;
    await page.goto("/mentors");
    await page.getByRole("searchbox", { name: "Search mentors" }).fill(name);
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.waitForURL(new RegExp(`[?&]q=${name}`));
    await page.locator(`a[href="/mentors/${slug}"]`).first().click();
    await page.waitForURL(new RegExp(`/mentors/${slug}$`));
    await expectNoSeriousA11y(page);
    await openBooking(page, isMobile);
    await pickSlot(page);
    // Student in Asia/Kolkata, mentor in Europe/Berlin: both zones are spelled out.
    await expect(page.getByText(/That's .* CES?T for /)).toBeVisible();
    await expect(page.getByText(/IST$/).first()).toBeVisible();
    await page.getByRole("button", { name: /Continue to payment/ }).click();

    await page.waitForURL(/\/checkout\//);
    await expect(page.getByText(/We're holding this time for you/)).toBeVisible();
    await expectNoSeriousA11y(page);
    await page.getByRole("button", { name: /^Pay / }).click();

    await page.waitForURL(/\/dashboard\/bookings\/.+\?booked=1/);
    await expect(page.getByText("You're booked!")).toBeVisible();
    await expect(page.getByText("Confirmed").first()).toBeVisible();
    await expectNoSeriousA11y(page);
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: "Add to calendar" }).click();
    expect((await download).suggestedFilename()).toMatch(/\.ics$/);
  });

  test("E3: a failed payment keeps the hold, and paying again confirms", async ({
    page,
    context,
    baseURL,
    isMobile,
  }) => {
    await createStudent(context, baseURL!, "e3", { signIn: true });
    await bookToCheckout(page, isMobile ? MENTORS.e3.mobile : MENTORS.e3.desktop, isMobile);
    await page.getByRole("button", { name: "Simulate a failed payment" }).click();
    await expect(page.getByText("That payment didn't go through")).toBeVisible();
    await expect(page.getByText(/We're holding this time for you/)).toBeVisible();
    await page.getByRole("button", { name: /^Pay / }).click();
    await page.waitForURL(/\/dashboard\/bookings\/.+\?booked=1/);
    await expect(page.getByText("You're booked!")).toBeVisible();
  });

  test("E4: closing the tab mid-payment still ends up confirmed", async ({
    page,
    context,
    baseURL,
    isMobile,
  }) => {
    await createStudent(context, baseURL!, "e4", { signIn: true });
    const bookingId = await bookToCheckout(
      page,
      isMobile ? MENTORS.e4.mobile : MENTORS.e4.desktop,
      isMobile,
    );
    // The provider captures the payment (its signed webhook fires) while the student's tab is gone.
    const providerOrderId = await providerOrderIdForBooking(bookingId);
    await page.close();
    const capture = await context.request.post(`${baseURL}/api/v1/dev/fake-checkout`, {
      data: { providerOrderId, outcome: "succeed" },
      headers: {
        origin: baseURL!,
        "sec-fetch-site": "same-origin",
        "idempotency-key": crypto.randomUUID(),
      },
    });
    expect(capture.ok()).toBe(true);

    const later = await context.newPage();
    await later.goto(`/dashboard/bookings/${bookingId}`);
    await expect(later.getByText("Confirmed").first()).toBeVisible();
    await expect(later.getByText("Waiting for payment")).toHaveCount(0);
  });

  test("E5: cancelling more than 24 hours ahead shows, and gives, a full refund", async ({
    page,
    context,
    baseURL,
    isMobile,
  }) => {
    await createStudent(context, baseURL!, "e5", { signIn: true });
    await bookToCheckout(page, isMobile ? MENTORS.e5.mobile : MENTORS.e5.desktop, isMobile, 2);
    await page.getByRole("button", { name: /^Pay / }).click();
    await page.waitForURL(/\/dashboard\/bookings\/.+\?booked=1/);

    await page.getByRole("button", { name: "Cancel booking" }).click();
    const dialog = page.getByRole("dialog", { name: "Cancel this booking?" });
    await expect(dialog.getByText(/the full price/)).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel booking" }).click();
    await expect(page.getByText("Booking cancelled")).toBeVisible();
    await expect(page.getByText("Cancelled by you")).toBeVisible();
    await expect(page.getByText("Refunded")).toBeVisible();
  });

  test("a signed-out visitor is asked to sign in before booking, and lands back on the profile", async ({
    page,
    isMobile,
  }) => {
    await page.goto(`/mentors/${MENTORS.e2.desktop}`);
    await openBooking(page, isMobile);
    await pickSlot(page);
    await page.getByRole("link", { name: "Sign in to book" }).click();
    await expect(page).toHaveURL(/\/sign-in\?returnTo=%2Fmentors%2Fananya-iyer/);
  });
});

async function expectNoSeriousA11y(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious.map((v) => v.id)).toEqual([]);
}
