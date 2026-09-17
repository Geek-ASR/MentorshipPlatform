import { describe, expect, it } from "vitest";
import { auditIpPrefix, getClientIp, rateLimitKeyForIp } from "@/server/platform/http/client-ip";
import {
  assertSameOrigin,
  readBodyText,
  readJsonBody,
} from "@/server/platform/http/request-guards";
import { resolveRequestId } from "@/server/platform/request-context";

const base = "https://app.example.com";

describe("same-origin (CSRF) guard", () => {
  const headers = (entries: Record<string, string>) => new Headers(entries);

  it("accepts same-origin requests", () => {
    expect(() =>
      assertSameOrigin(headers({ origin: base, "sec-fetch-site": "same-origin" }), base),
    ).not.toThrow();
    expect(() => assertSameOrigin(headers({ origin: base }), base)).not.toThrow();
    expect(() =>
      assertSameOrigin(headers({ "sec-fetch-site": "same-origin" }), base),
    ).not.toThrow();
  });

  it.each([
    [{ origin: "https://evil.example" }],
    [{ origin: "https://app.example.com.evil.example" }],
    [{ origin: "http://app.example.com" }],
    [{ origin: "null" }],
    [{ "sec-fetch-site": "cross-site", origin: base }],
    [{ "sec-fetch-site": "same-site" }],
    [{ "sec-fetch-site": "none" }],
    [{}],
  ])("rejects %j", (entries) => {
    expect(() => assertSameOrigin(headers(entries), base)).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
  });
});

describe("body reading", () => {
  const post = (body: string, contentType = "application/json") =>
    new Request("https://app.example.com/x", {
      method: "POST",
      headers: { "content-type": contentType },
      body,
    });

  it("parses JSON with charset parameters", async () => {
    await expect(
      readJsonBody(post('{"a":1}', "application/json; charset=utf-8"), 100),
    ).resolves.toEqual({ a: 1 });
  });

  it("rejects non-JSON media types, empty and malformed bodies", async () => {
    await expect(readJsonBody(post('{"a":1}', "text/plain"), 100)).rejects.toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
    await expect(readJsonBody(post(""), 100)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(readJsonBody(post("{nope"), 100)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("enforces the byte limit while streaming, even without content-length", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 10; i++) controller.enqueue(new TextEncoder().encode("x".repeat(50)));
        controller.close();
      },
    });
    const request = new Request("https://app.example.com/x", {
      method: "POST",
      body: stream,
      headers: { "content-type": "application/json" },
      // @ts-expect-error Node requires duplex for streaming request bodies
      duplex: "half",
    });
    await expect(readBodyText(request, 200)).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
  });
});

describe("client IP handling", () => {
  it("only trusts the configured platform header", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "203.0.113.7" });
    expect(getClientIp(headers, undefined)).toBeNull();
    expect(getClientIp(headers, "x-real-ip")).toBe("203.0.113.7");
    expect(getClientIp(new Headers({ "x-real-ip": "not-an-ip" }), "x-real-ip")).toBeNull();
  });

  it("builds rate-limit keys and audit prefixes", () => {
    expect(rateLimitKeyForIp("203.0.113.7")).toBe("ip:203.0.113.7");
    expect(rateLimitKeyForIp("2001:db8:abcd:12::1")).toBe("ip6:2001:0db8:abcd:0012::/64");
    expect(rateLimitKeyForIp(null)).toBe("ip:unknown");
    expect(auditIpPrefix("203.0.113.7")).toBe("203.0.113.0/24");
    expect(auditIpPrefix("2001:db8:abcd:12::1")).toBe("2001:0db8:abcd::/48");
  });
});

describe("request ids", () => {
  it("accepts safe incoming ids and replaces others", () => {
    expect(resolveRequestId("abc-123_XYZ.9")).toBe("abc-123_XYZ.9");
    expect(resolveRequestId("bad id")).not.toBe("bad id");
    expect(resolveRequestId("x".repeat(65))).toHaveLength(36);
    expect(resolveRequestId(null)).toHaveLength(36);
  });
});
