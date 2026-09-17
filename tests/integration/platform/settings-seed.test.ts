import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { auditLogs, platformSettings } from "@/server/platform/db/tables/platform";
import { countries, taxonomyTerms } from "@/server/platform/db/tables/reference";
import { seedReferenceData } from "@/server/platform/db/seed/seed";
import {
  clearSettingsCache,
  getSetting,
  isFeatureEnabled,
  setFeatureFlag,
  updateSetting,
} from "@/server/platform/settings/settings";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
});
afterAll(async () => t?.dispose());
beforeEach(() => clearSettingsCache());

const staff = { userId: "0192f0c1-3b5a-7c1d-9e2f-0123456789ab", actorType: "staff" as const };

describe("settings", () => {
  it("returns the code default when nothing is stored", async () => {
    expect(await getSetting(t.db, "booking.hold_ttl_min", new Date())).toBe(10);
  });

  it("versions updates, audits them and invalidates the cache", async () => {
    const now = new Date();
    expect(await getSetting(t.db, "booking.hold_ttl_min", now)).toBe(10);
    const first = await updateSetting(t.db, "booking.hold_ttl_min", 15, {
      ...staff,
      reason: "beta tuning",
    });
    const second = await updateSetting(t.db, "booking.hold_ttl_min", 12, {
      ...staff,
      reason: "adjust again",
    });
    expect([first.version, second.version]).toEqual([1, 2]);
    expect(await getSetting(t.db, "booking.hold_ttl_min", new Date())).toBe(12);

    const audits = await t.db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, "settings.updated"),
          eq(auditLogs.targetId, "booking.hold_ttl_min"),
        ),
      );
    expect(audits).toHaveLength(2);
    expect(audits[1]!.metadata).toMatchObject({ before: 15, after: 12, version: 2 });
  });

  it("rejects out-of-range values and missing reasons", async () => {
    await expect(
      updateSetting(t.db, "booking.hold_ttl_min", 0, { ...staff, reason: "bad" }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(
      updateSetting(t.db, "booking.hold_ttl_min", 20, { ...staff, reason: " " }),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });

  it("ignores versions that are not yet effective and invalid stored values", async () => {
    await updateSetting(t.db, "account.deletion_grace_days", 20, {
      ...staff,
      reason: "scheduled change",
      effectiveFrom: new Date(Date.now() + 86_400_000),
    });
    expect(
      await getSetting(t.db, "account.deletion_grace_days", new Date(), { bypassCache: true }),
    ).toBe(14);

    await t.db
      .insert(platformSettings)
      .values({ key: "auth.recent_auth_window_min", version: 1, value: "oops", reason: "corrupt" });
    expect(
      await getSetting(t.db, "auth.recent_auth_window_min", new Date(), { bypassCache: true }),
    ).toBe(10);
  });

  it("uses feature flag defaults and audits changes", async () => {
    expect(await isFeatureEnabled(t.db, "payments.live", new Date())).toBe(false);
    await setFeatureFlag(t.db, "booking.enabled", false, {
      ...staff,
      reason: "incident kill switch",
    });
    expect(await isFeatureEnabled(t.db, "booking.enabled", new Date())).toBe(false);
    const [audit] = await t.db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, "feature_flag.updated"));
    expect(audit?.metadata).toMatchObject({ before: true, after: false });
  });
});

describe("reference data seed", () => {
  it("is idempotent and does not overwrite admin changes", async () => {
    await t.db
      .update(countries)
      .set({ studyAbroadEnabled: false, name: "Deutschland (edited)" })
      .where(eq(countries.iso2, "DE"));
    const summary = await t.db.transaction((tx) => seedReferenceData(tx));
    expect(summary).toEqual({ currencies: 0, countries: 0, taxonomyTerms: 0 });
    const [germany] = await t.db.select().from(countries).where(eq(countries.iso2, "DE"));
    expect(germany).toMatchObject({ studyAbroadEnabled: false, name: "Deutschland (edited)" });
  });

  it("seeds study-abroad destinations, currencies and a two-section category tree", async () => {
    const enabled = await t.db
      .select({ iso2: countries.iso2 })
      .from(countries)
      .where(eq(countries.studyAbroadEnabled, true));
    expect(enabled.map((row) => row.iso2).sort()).toEqual([
      "AU",
      "CA",
      "FI",
      "FR",
      "GB",
      "IE",
      "NL",
      "SE",
      "US",
    ]);
    const roots = await t.db.execute<{ slug: string }>(
      sql`select slug from app.taxonomy_terms where parent_id is null order by sort_order`,
    );
    expect(roots.map((row) => row.slug)).toEqual(["career-academic", "study-abroad"]);
    const [visa] = await t.db
      .select()
      .from(taxonomyTerms)
      .where(eq(taxonomyTerms.slug, "visa-interview-experience"));
    expect(visa?.flags).toEqual({ sensitiveTopic: "immigration" });
  });
});
