import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { jsonRequest, routeContext, useDatabaseForRoutes } from "@tests/helpers/http";
import { POST as signUp } from "@/app/api/v1/auth/sign-up/route";
import { POST as signIn } from "@/app/api/v1/auth/sign-in/route";
import { POST as completeMfaSignIn } from "@/app/api/v1/auth/sign-in/mfa/route";
import { GET as me } from "@/app/api/v1/auth/me/route";
import { POST as enrollStart } from "@/app/api/v1/auth/mfa/enroll/start/route";
import { POST as enrollConfirm } from "@/app/api/v1/auth/mfa/enroll/confirm/route";
import { POST as disableMfa } from "@/app/api/v1/auth/mfa/disable/route";
import { generateTotp } from "@/server/modules/auth/domain/totp";

vi.mock("@/server/modules/auth/infra/hibp-checker", () => ({
  createHibpChecker: () => async () => false,
}));

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  useDatabaseForRoutes(t.db);
});
afterAll(async () => t?.dispose());
beforeEach(async () => {
  await t.db.execute(
    sql`truncate table app.users, app.outbox_jobs, app.rate_limit_buckets cascade`,
  );
});

const email = "mfa-flow@example.com";
const password = "correct battery staple phrase two";

function sessionCookie(response: Response): string {
  const raw = response.headers.get("set-cookie");
  if (!raw) throw new Error("expected a set-cookie header");
  return raw.split(";")[0]!;
}

async function createSignedInUser(): Promise<string> {
  await signUp(
    jsonRequest("/api/v1/auth/sign-up", {
      body: {
        email,
        password,
        displayName: "MFA Flow",
        birthYear: new Date().getFullYear() - 20,
        termsVersion: "v1",
        privacyVersion: "v1",
      },
    }),
    routeContext(),
  );
  await t.db.execute(sql`update app.users set email_verified = true where email = ${email}`);
  return sessionCookie(
    await signIn(
      jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
      routeContext(),
    ),
  );
}

function extractOtpauthSecret(uri: string): Uint8Array {
  const secret = new URL(uri).searchParams.get("secret");
  if (!secret) throw new Error("otpauth URI missing secret");
  const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of secret) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(bytes);
}

describe("MFA enrolment", () => {
  it("enrols, confirms with a live TOTP code, and issues 10 backup codes", async () => {
    const cookie = await createSignedInUser();
    const start = await enrollStart(
      jsonRequest("/api/v1/auth/mfa/enroll/start", { headers: { cookie } }),
      routeContext(),
    );
    expect(start.status).toBe(200);
    const { otpauthUri } = (await start.json()) as { otpauthUri: string };
    const secret = extractOtpauthSecret(otpauthUri);

    const badCode = await enrollConfirm(
      jsonRequest("/api/v1/auth/mfa/enroll/confirm", {
        body: { code: "000000" },
        headers: { cookie },
      }),
      routeContext(),
    );
    expect(badCode.status).toBe(422);

    const code = generateTotp(secret, new Date());
    const confirm = await enrollConfirm(
      jsonRequest("/api/v1/auth/mfa/enroll/confirm", { body: { code }, headers: { cookie } }),
      routeContext(),
    );
    expect(confirm.status).toBe(200);
    const { backupCodes } = (await confirm.json()) as { backupCodes: string[] };
    expect(backupCodes).toHaveLength(10);
    expect(new Set(backupCodes).size).toBe(10);
  });

  it("requires a TOTP or backup code at sign-in once enrolled, and rejects a reused code", async () => {
    const cookie = await createSignedInUser();
    const start = await enrollStart(
      jsonRequest("/api/v1/auth/mfa/enroll/start", { headers: { cookie } }),
      routeContext(),
    );
    const secret = extractOtpauthSecret(
      ((await start.json()) as { otpauthUri: string }).otpauthUri,
    );
    await enrollConfirm(
      jsonRequest("/api/v1/auth/mfa/enroll/confirm", {
        body: { code: generateTotp(secret, new Date()) },
        headers: { cookie },
      }),
      routeContext(),
    );

    const signInAttempt = await signIn(
      jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
      routeContext(),
    );
    expect(signInAttempt.status).toBe(200);
    const { outcome, pendingToken } = (await signInAttempt.json()) as {
      outcome: string;
      pendingToken?: string;
    };
    expect(outcome).toBe("mfa_required");
    expect(pendingToken).toBeTruthy();

    // A fresh 30s step so this code differs from the one just used to confirm enrolment
    // (replay protection would otherwise reject a code from the same step).
    const code = generateTotp(secret, new Date(Date.now() + 30_000));
    const completed = await completeMfaSignIn(
      jsonRequest("/api/v1/auth/sign-in/mfa", { body: { pendingToken, code } }),
      routeContext(),
    );
    expect(completed.status).toBe(200);
    const newCookie = sessionCookie(completed);
    const meResponse = await me(
      new Request("http://localhost:3000/api/v1/auth/me", { headers: { cookie: newCookie } }),
      routeContext(),
    );
    expect(meResponse.status).toBe(200);

    // The pending token was single-use.
    const replay = await completeMfaSignIn(
      jsonRequest("/api/v1/auth/sign-in/mfa", { body: { pendingToken, code } }),
      routeContext(),
    );
    expect(replay.status).toBe(400);
  });

  it("accepts a backup code once, then rejects it on a second use", async () => {
    const cookie = await createSignedInUser();
    const start = await enrollStart(
      jsonRequest("/api/v1/auth/mfa/enroll/start", { headers: { cookie } }),
      routeContext(),
    );
    const secret = extractOtpauthSecret(
      ((await start.json()) as { otpauthUri: string }).otpauthUri,
    );
    const confirm = await enrollConfirm(
      jsonRequest("/api/v1/auth/mfa/enroll/confirm", {
        body: { code: generateTotp(secret, new Date()) },
        headers: { cookie },
      }),
      routeContext(),
    );
    const { backupCodes } = (await confirm.json()) as { backupCodes: string[] };
    const backupCode = backupCodes[0]!;

    const signInAttempt = await signIn(
      jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
      routeContext(),
    );
    const { pendingToken } = (await signInAttempt.json()) as { pendingToken: string };

    const first = await completeMfaSignIn(
      jsonRequest("/api/v1/auth/sign-in/mfa", { body: { pendingToken, code: backupCode } }),
      routeContext(),
    );
    expect(first.status).toBe(200);

    const secondAttempt = await signIn(
      jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
      routeContext(),
    );
    const { pendingToken: pendingToken2 } = (await secondAttempt.json()) as {
      pendingToken: string;
    };
    const reuse = await completeMfaSignIn(
      jsonRequest("/api/v1/auth/sign-in/mfa", {
        body: { pendingToken: pendingToken2, code: backupCode },
      }),
      routeContext(),
    );
    expect(reuse.status).toBe(401);
  });

  it("disabling MFA removes the second factor requirement at sign-in", async () => {
    const cookie = await createSignedInUser();
    const start = await enrollStart(
      jsonRequest("/api/v1/auth/mfa/enroll/start", { headers: { cookie } }),
      routeContext(),
    );
    const secret = extractOtpauthSecret(
      ((await start.json()) as { otpauthUri: string }).otpauthUri,
    );
    await enrollConfirm(
      jsonRequest("/api/v1/auth/mfa/enroll/confirm", {
        body: { code: generateTotp(secret, new Date()) },
        headers: { cookie },
      }),
      routeContext(),
    );

    const disable = await disableMfa(
      jsonRequest("/api/v1/auth/mfa/disable", { headers: { cookie } }),
      routeContext(),
    );
    expect(disable.status).toBe(204);

    const signInAttempt = await signIn(
      jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
      routeContext(),
    );
    expect(signInAttempt.status).toBe(200);
    expect((await signInAttempt.json()) as { outcome: string }).toEqual({ outcome: "signed_in" });
  });
});
