import { describe, expect, it } from "vitest";
import { InvalidEnvironmentError, parseEnv } from "@/config/env";
import {
  activeRestriction,
  anonymousActor,
  isStaff,
  type UserActor,
} from "@/server/platform/authz/actor";
import {
  all,
  authorize,
  requireCapability,
  requireRecentAuth,
  requireStaffWithMfa,
  requireUser,
  requireVerifiedEmail,
  type Policy,
} from "@/server/platform/authz/authorize";
import { featureFlagRegistry, settingsRegistry } from "@/server/platform/settings/registry";
import { CATEGORY_TREE, type TaxonomySeedNode } from "@/server/platform/db/seed/taxonomy-data";
import { slugify } from "@/server/platform/db/seed/seed";

const validEnv = {
  APP_BASE_URL: "http://localhost:3000",
  DATABASE_URL: "postgres://localhost/db",
  JOB_TICK_SECRET: "a".repeat(40),
  OPS_SECRET: "b".repeat(40),
  MFA_ENCRYPTION_KEY: "c".repeat(40),
};

describe("environment configuration", () => {
  it("parses valid config with defaults", () => {
    const env = parseEnv(validEnv);
    expect(env).toMatchObject({
      APP_ENV: "local",
      DATABASE_PREPARED_STATEMENTS: true,
      DATABASE_POOL_MAX: 5,
    });
    expect(env.CLIENT_IP_HEADER).toBeUndefined();
    expect(
      parseEnv({ ...validEnv, DATABASE_PREPARED_STATEMENTS: "false" }).DATABASE_PREPARED_STATEMENTS,
    ).toBe(false);
  });

  it("names invalid variables without echoing secret values", () => {
    const leakedValue = "short-secret-value";
    try {
      parseEnv({ ...validEnv, JOB_TICK_SECRET: leakedValue, APP_BASE_URL: "not a url" });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidEnvironmentError);
      const message = (error as Error).message;
      expect(message).toContain("JOB_TICK_SECRET");
      expect(message).toContain("APP_BASE_URL");
      expect(message).not.toContain(leakedValue);
    }
  });

  it("requires https in production and distinct secrets", () => {
    expect(() => parseEnv({ ...validEnv, APP_ENV: "production" })).toThrow(/https/);
    expect(() => parseEnv({ ...validEnv, OPS_SECRET: validEnv.JOB_TICK_SECRET })).toThrow(
      /OPS_SECRET/,
    );
  });
});

const now = new Date("2026-09-17T10:00:00Z");
const makeUser = (overrides: Partial<UserActor> = {}): UserActor => ({
  kind: "user",
  userId: "u1",
  sessionId: "s1",
  roles: new Set(["student"]),
  status: "active",
  restrictions: [],
  emailVerified: true,
  mfaVerified: false,
  authenticatedAt: new Date(now.getTime() - 60_000),
  ...overrides,
});

describe("authorization guards", () => {
  it("denies anonymous and blocked accounts", () => {
    expect(requireUser(anonymousActor)).toMatchObject({ allow: false, code: "UNAUTHENTICATED" });
    expect(requireUser(makeUser({ status: "suspended" }))).toMatchObject({
      allow: false,
      code: "ACCOUNT_RESTRICTED",
    });
    expect(requireUser(makeUser({ status: "restricted" }))).toEqual({ allow: true });
  });

  it("applies time-boxed capability restrictions", () => {
    const actor = makeUser({
      restrictions: [
        { capability: "message.send", until: new Date(now.getTime() + 3600_000) },
        { capability: "booking.create", until: new Date(now.getTime() - 1) },
      ],
    });
    expect(requireCapability(actor, "message.send", now)).toMatchObject({
      allow: false,
      code: "ACCOUNT_RESTRICTED",
    });
    expect(requireCapability(actor, "booking.create", now)).toEqual({ allow: true });
    expect(
      activeRestriction(
        makeUser({ restrictions: [{ capability: "review.create", until: null }] }),
        "review.create",
        now,
      ),
    ).toBeDefined();
  });

  it("requires MFA for staff and hides staff routes from non-staff", () => {
    expect(requireStaffWithMfa(makeUser(), ["admin"])).toMatchObject({ code: "NOT_FOUND" });
    expect(
      requireStaffWithMfa(makeUser({ roles: new Set(["moderator"]) }), ["admin"]),
    ).toMatchObject({ code: "FORBIDDEN" });
    expect(requireStaffWithMfa(makeUser({ roles: new Set(["admin"]) }), ["admin"])).toMatchObject({
      code: "MFA_REQUIRED",
    });
    expect(
      requireStaffWithMfa(makeUser({ roles: new Set(["admin"]), mfaVerified: true }), ["admin"]),
    ).toEqual({ allow: true });
    expect(isStaff(makeUser({ roles: new Set(["mentor"]) }))).toBe(false);
  });

  it("requires recent authentication for step-up actions", () => {
    expect(requireRecentAuth(makeUser(), { now })).toEqual({ allow: true });
    expect(
      requireRecentAuth(makeUser({ authenticatedAt: new Date(now.getTime() - 11 * 60_000) }), {
        now,
      }),
    ).toMatchObject({
      code: "REAUTH_REQUIRED",
    });
  });

  it("composes guards and throws AppError on denial without exposing the reason", () => {
    const policy: Policy<{ ownerId: string }> = (actor, resource, context) =>
      actor.kind !== "user"
        ? requireUser(actor)
        : all(
            () => requireVerifiedEmail(actor),
            () => requireCapability(actor, "booking.create", context.now),
            () =>
              actor.userId === resource.ownerId
                ? { allow: true }
                : { allow: false, code: "NOT_FOUND", reason: "not owner" },
          );
    expect(() => authorize(makeUser(), policy, { ownerId: "u1" }, { now })).not.toThrow();
    expect(() => authorize(makeUser(), policy, { ownerId: "u2" }, { now })).toThrow(
      expect.objectContaining({ code: "NOT_FOUND" }),
    );
    expect(() =>
      authorize(makeUser({ emailVerified: false }), policy, { ownerId: "u1" }, { now }),
    ).toThrow(expect.objectContaining({ code: "EMAIL_NOT_VERIFIED" }));
  });
});

describe("settings and flags registries", () => {
  it("has valid defaults and keeps live payments off by default", () => {
    for (const definition of Object.values(settingsRegistry)) {
      expect(definition.schema.safeParse(definition.defaultValue).success).toBe(true);
    }
    expect(featureFlagRegistry["payments.live"].defaultValue).toBe(false);
  });
});

describe("taxonomy seed data", () => {
  const flatten = (nodes: TaxonomySeedNode[]): TaxonomySeedNode[] =>
    nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);

  it("uses unique, URL-safe slugs", () => {
    const slugs = flatten(CATEGORY_TREE).map((node) => node.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("frames visa topics as personal experience and flags them", () => {
    const visa = flatten(CATEGORY_TREE).filter((node) => node.slug.startsWith("visa-"));
    expect(visa.length).toBeGreaterThan(0);
    for (const node of visa) expect(node.flags?.sensitiveTopic).toBe("immigration");
    expect(flatten(CATEGORY_TREE).some((node) => /immigration advice/i.test(node.name))).toBe(
      false,
    );
  });

  it("slugifies names with diacritics and punctuation", () => {
    expect(slugify("Côte d’Ivoire")).toBe("cote-divoire");
    expect(slugify("  São Tomé & Príncipe ")).toBe("sao-tome-principe");
  });
});
