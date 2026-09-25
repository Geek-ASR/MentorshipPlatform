import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { desc, sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "@tests/helpers/database";
import { jsonRequest, routeContext, useDatabaseForRoutes } from "@tests/helpers/http";
import { auditLogs } from "@/server/platform/db/tables/platform";
import { resolvePublicArticleSlug } from "@/server/modules/content";

import { POST as signUp } from "@/app/api/v1/auth/sign-up/route";
import { POST as signIn } from "@/app/api/v1/auth/sign-in/route";
import { GET as me } from "@/app/api/v1/auth/me/route";
import { GET as listArticles, POST as createArticleRoute } from "@/app/api/v1/admin/articles/route";
import { PUT as putArticle } from "@/app/api/v1/admin/articles/[id]/route";
import { POST as publishArticleRoute } from "@/app/api/v1/admin/articles/[id]/publish/route";

vi.mock("@/server/modules/auth/infra/hibp-checker", () => ({
  createHibpChecker: () => async () => false,
}));

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDatabase();
  useDatabaseForRoutes(t.db);
});
afterAll(async () => t?.dispose());

function sessionCookie(response: Response): string {
  const raw = response.headers.get("set-cookie");
  if (!raw) throw new Error(`expected a set-cookie header (status ${response.status})`);
  return raw.split(";")[0]!;
}

function idemHeaders(cookie: string) {
  return { cookie, "idempotency-key": randomUUID() };
}

async function signUpAndVerify(
  email: string,
  displayName: string,
): Promise<{ cookie: string; userId: string }> {
  const password = "correct battery staple content tests";
  const signUpRes = await signUp(
    jsonRequest("/api/v1/auth/sign-up", {
      body: {
        email,
        password,
        displayName,
        birthYear: 2000,
        termsVersion: "v1",
        privacyVersion: "v1",
      },
    }),
    routeContext(),
  );
  if (signUpRes.status !== 200) throw new Error(`sign-up failed: ${signUpRes.status}`);
  await t.db.execute(sql`update app.users set email_verified = true where email = ${email}`);
  const response = await signIn(
    jsonRequest("/api/v1/auth/sign-in", { body: { email, password } }),
    routeContext(),
  );
  const cookie = sessionCookie(response);
  const meResponse = await me(
    new Request("http://localhost:3000/api/v1/auth/me", { headers: { cookie } }),
    routeContext(),
  );
  const userId = ((await meResponse.json()) as { id: string }).id;
  return { cookie, userId };
}

async function grantRoleDirectly(cookie: string, role: string): Promise<void> {
  const token = cookie.split("=")[1]!.split(";")[0]!;
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await t.db.execute(
    sql`update app.auth_sessions set mfa_verified = true where token_hash = ${tokenHash}`,
  );
  const [session] = await t.db.execute<{ user_id: string }>(
    sql`select user_id from app.auth_sessions where token_hash = ${tokenHash}`,
  );
  await t.db.execute(
    sql`insert into app.user_roles (user_id, role) values (${session!.user_id}, ${role}) on conflict do nothing`,
  );
}

async function latestAuditAction() {
  const [row] = await t.db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(1);
  return row;
}

describe("Phase 12: articles/guides — draft/publish gate, authz, public visibility", () => {
  let editor: { cookie: string; userId: string };
  let plainUser: { cookie: string; userId: string };

  beforeAll(async () => {
    editor = await signUpAndVerify("editor.content@example.com", "Content Editor");
    await grantRoleDirectly(editor.cookie, "content_editor");
    plainUser = await signUpAndVerify("plain.content@example.com", "Plain User");
  });

  it("rejects a non-staff caller and an anonymous caller from creating a guide", async () => {
    const asPlainUser = await createArticleRoute(
      jsonRequest("/api/v1/admin/articles", {
        body: { title: "Should not be created", bodyMd: "Body." },
        headers: idemHeaders(plainUser.cookie),
      }),
      routeContext(),
    );
    expect([401, 403, 404]).toContain(asPlainUser.status);

    const anon = await listArticles(
      new Request("http://localhost:3000/api/v1/admin/articles"),
      routeContext(),
    );
    expect([401, 403, 404]).toContain(anon.status);
  });

  it("creates a draft, refuses to publish without a source, then publishes once one is added", async () => {
    const created = await createArticleRoute(
      jsonRequest("/api/v1/admin/articles", {
        body: {
          title: "Studying in Munich: what nobody tells you",
          bodyMd: "The full guide body.",
          sourceType: "mentor_experience",
        },
        headers: idemHeaders(editor.cookie),
      }),
      routeContext(),
    );
    expect(created.status).toBe(201);
    const article = (await created.json()) as { id: string; slug: string; status: string };
    expect(article.status).toBe("draft");
    expect(article.slug).toBe("studying-in-munich-what-nobody-tells-you");

    // A guide with no source can't publish honestly (docs/12 §14 freshness/source line).
    const rejectedPublish = await publishArticleRoute(
      jsonRequest(`/api/v1/admin/articles/${article.id}/publish`, {
        body: {},
        headers: idemHeaders(editor.cookie),
      }),
      routeContext({ id: article.id }),
    );
    expect(rejectedPublish.status).toBe(422);

    // A draft is never visible on the public site.
    const beforePublish = await resolvePublicArticleSlug(t.db, article.slug);
    expect(beforePublish).toBeNull();

    await putArticle(
      jsonRequest(`/api/v1/admin/articles/${article.id}`, {
        method: "PUT",
        body: {
          sources: [
            {
              url: "https://www.daad.de/en",
              publisher: "DAAD",
              isOfficial: true,
              accessedAt: "2026-09-01",
            },
          ],
        },
        headers: idemHeaders(editor.cookie),
      }),
      routeContext({ id: article.id }),
    );

    const published = await publishArticleRoute(
      jsonRequest(`/api/v1/admin/articles/${article.id}/publish`, {
        body: {},
        headers: idemHeaders(editor.cookie),
      }),
      routeContext({ id: article.id }),
    );
    expect(published.status).toBe(200);
    const publishedBody = (await published.json()) as { status: string; lastVerifiedAt: string };
    expect(publishedBody.status).toBe("published");
    expect(publishedBody.lastVerifiedAt).toBeTruthy();

    const entry = await latestAuditAction();
    expect(entry?.action).toBe("article.published");
    expect(entry?.actorUserId).toBe(editor.userId);

    const resolved = await resolvePublicArticleSlug(t.db, article.slug);
    expect(resolved && "article" in resolved ? resolved.article.status : null).toBe("published");
  });

  it("renaming a slug leaves a redirect from the old one to the new one", async () => {
    const created = await createArticleRoute(
      jsonRequest("/api/v1/admin/articles", {
        body: { title: "Original title for redirect test", bodyMd: "Body." },
        headers: idemHeaders(editor.cookie),
      }),
      routeContext(),
    );
    const article = (await created.json()) as { id: string; slug: string };
    const oldSlug = article.slug;

    await putArticle(
      jsonRequest(`/api/v1/admin/articles/${article.id}`, {
        method: "PUT",
        body: { title: "Renamed title for redirect test", renameSlug: true },
        headers: idemHeaders(editor.cookie),
      }),
      routeContext({ id: article.id }),
    );

    const resolved = await resolvePublicArticleSlug(t.db, oldSlug);
    expect(resolved && "redirectTo" in resolved ? resolved.redirectTo : null).toBe(
      "renamed-title-for-redirect-test",
    );
  });
});
