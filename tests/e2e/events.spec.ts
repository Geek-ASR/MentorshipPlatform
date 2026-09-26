import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { clearLeftoverE2eEvents } from "./helpers/sessions";
import { createStudent, signInDemoAccount } from "./helpers/student-auth";

async function expectNoSeriousA11y(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious.map((v) => v.id)).toEqual([]);
}

/**
 * Each browser project hosts with a different demo mentor (all hold `event_host`), and on its own
 * day, so parallel runs never ask for overlapping time on one calendar; events a failed earlier run
 * left behind are cancelled first.
 */
const HOST: Record<string, { key: string; dayOffset: number; tag: string }> = {
  "desktop-chromium": { key: "meera", dayOffset: 21, tag: "dc" },
  "mobile-chromium": { key: "rohan", dayOffset: 22, tag: "mc" },
  "desktop-webkit": { key: "ananya", dayOffset: 23, tag: "dw" },
  "mobile-safari": { key: "sneha", dayOffset: 24, tag: "ms" },
  "desktop-firefox": { key: "meera", dayOffset: 25, tag: "df" },
};

function eventTime(dayOffset: number, retry: number) {
  const date = new Date(Date.now() + dayOffset * 86_400_000).toISOString().slice(0, 10);
  const slot = (Math.floor(Date.now() / 60_000) + retry * 7) % 32; // 30-minute steps, 04:00–20:00
  const minutes = 4 * 60 + slot * 30;
  const time = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { date, time };
}

test.describe("free events", () => {
  test("E8: host a free event → register → full → waitlist → automatic promotion", async ({
    page,
    context,
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const info = test.info();
    const host = HOST[info.project.name] ?? HOST["desktop-chromium"]!;
    const { date, time } = eventTime(host.dayOffset, info.retry);
    // The project tag keeps one project's cleanup away from another's event on a shared host.
    const title = `Office hours ${host.tag} ${Date.now().toString(36)}`;

    // A demo mentor with event hosting creates a one-spot event from the dashboard.
    await clearLeftoverE2eEvents(host.key, `Office hours ${host.tag} `);
    const hostContext = await browser.newContext();
    await signInDemoAccount(hostContext, baseURL!, host.key);
    const hostPage = await hostContext.newPage();
    await hostPage.goto("/dashboard/mentor/events");
    await hostPage.getByRole("button", { name: "Host a free event" }).click();
    const form = hostPage.getByRole("dialog", { name: "Host a free event" });
    await form.getByLabel("Title").fill(title);
    await form.getByLabel("Date").fill(date);
    await form.getByLabel(/^Starts/).fill(time);
    await form.getByLabel("Length").selectOption("30");
    await form.getByLabel("Spots").fill("1");
    await form.getByLabel("Meeting link").fill("https://meet.jit.si/aheadly-e2e-office-hours");
    await form.getByRole("button", { name: "Create event" }).click();
    const card = hostPage.getByRole("listitem").filter({ hasText: title });
    await expect(card).toBeVisible();
    const eventPath = await card.getByRole("link", { name: /View page/ }).getAttribute("href");
    expect(eventPath).toMatch(/^\/events\//);

    // The first student takes the only spot.
    await createStudent(context, baseURL!, "e8a", { signIn: true });
    await page.goto(eventPath!);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
    const panel = page.getByRole("complementary", { name: "Registration" });
    await panel.getByRole("button", { name: /Register — it's free/ }).click();
    await expect(panel.getByText("You're registered")).toBeVisible();

    // The second finds it full and joins the waitlist.
    const secondContext = await browser.newContext();
    await createStudent(secondContext, baseURL!, "e8b", { signIn: true });
    const second = await secondContext.newPage();
    await second.goto(eventPath!);
    const secondPanel = second.getByRole("complementary", { name: "Registration" });
    await expect(secondPanel.getByText("Full", { exact: true })).toBeVisible();
    await secondPanel.getByRole("button", { name: "Join the waitlist" }).click();
    await expect(secondPanel.getByText("You're on the waitlist")).toBeVisible();

    // The first cancels; the spot passes to the waitlist without anyone claiming it.
    await panel.getByRole("button", { name: /Cancel registration/ }).click();
    await page
      .getByRole("dialog", { name: "Cancel your registration?" })
      .getByRole("button", { name: "Cancel registration" })
      .click();
    await expect(page.getByRole("status").getByText("Registration cancelled")).toBeVisible();
    await second.reload();
    await expect(secondPanel.getByText("You're registered")).toBeVisible();
    await expectNoSeriousA11y(second);
    await secondContext.close();

    // The host cancels the event, which also frees the time on their calendar.
    await hostPage.reload();
    await hostPage
      .getByRole("listitem")
      .filter({ hasText: title })
      .getByRole("button", { name: "Cancel" })
      .click();
    await hostPage
      .getByRole("dialog", { name: new RegExp(`Cancel “${title}”`) })
      .getByRole("button", { name: "Cancel event" })
      .click();
    await expect(hostPage.getByRole("status").getByText("Event cancelled")).toBeVisible();
    await hostContext.close();
  });
});
